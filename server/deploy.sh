#!/bin/bash
# Puts the server on AWS, or updates it (docs/paid-version.md). Run from the repo's root where the AWS CLI is signed
# in (AWS CloudShell): bash server/deploy.sh [region]
# Everything is named needleworks*, apart from the account's other things, and sized to stay inside the free
# allowance: one Lambda (3 at once at most), one S3 bucket (files deleted after 30 days), one on-demand table.
# (x86 with 3 GB: a 180 mm picture took 24 s on arm64 with 1.8 GB and 18 s so; this Mac takes 6. 2026-11-19)
set -euo pipefail
REGION=${1:-us-west-2}; NAME=needleworks; export AWS_DEFAULT_REGION=$REGION AWS_PAGER=""
ACCT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=$NAME-files-$ACCT-$REGION; TABLE=$NAME; ROLE=$NAME-lambda
# the pages allowed to call it: the live site, and the public build served on this computer for testing
ORIGINS='"https://4gables.com","http://127.0.0.1:8831"'

echo "== bucket $BUCKET"
aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null || aws s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration '{"Rules":[{"ID":"thirty-days","Status":"Enabled","Filter":{"Prefix":"files/"},"Expiration":{"Days":30}}]}'

echo "== table $TABLE"
if ! aws dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
  aws dynamodb create-table --table-name "$TABLE" --attribute-definitions AttributeName=k,AttributeType=S --key-schema AttributeName=k,KeyType=HASH --billing-mode PAY_PER_REQUEST >/dev/null
  aws dynamodb wait table-exists --table-name "$TABLE"
  aws dynamodb update-time-to-live --table-name "$TABLE" --time-to-live-specification Enabled=true,AttributeName=ttl >/dev/null
fi

echo "== role $ROLE"
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  sleep 12   # (a new role takes a moment to be usable)
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name "$NAME" --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[
  {\"Effect\":\"Allow\",\"Action\":[\"logs:CreateLogGroup\",\"logs:CreateLogStream\",\"logs:PutLogEvents\"],\"Resource\":\"arn:aws:logs:$REGION:$ACCT:*\"},
  {\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:PutObject\"],\"Resource\":\"arn:aws:s3:::$BUCKET/files/*\"},
  {\"Effect\":\"Allow\",\"Action\":[\"s3:ListBucket\"],\"Resource\":\"arn:aws:s3:::$BUCKET\"},
  {\"Effect\":\"Allow\",\"Action\":[\"dynamodb:GetItem\",\"dynamodb:UpdateItem\"],\"Resource\":\"arn:aws:dynamodb:$REGION:$ACCT:table/$TABLE\"}]}"

echo "== code"
rm -rf /tmp/nw /tmp/nw.zip; mkdir -p /tmp/nw; cp -r js server /tmp/nw/; echo '{"type":"module"}' > /tmp/nw/package.json
(cd /tmp/nw && zip -qr /tmp/nw.zip .)

echo "== function $NAME"
if aws lambda get-function --function-name "$NAME" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$NAME" --architectures x86_64 --zip-file fileb:///tmp/nw.zip >/dev/null
  aws lambda wait function-updated --function-name "$NAME"
  aws lambda update-function-configuration --function-name "$NAME" --environment "Variables={BUCKET=$BUCKET,TABLE=$TABLE,PER_MINUTE=300,PER_DAY=2000}" >/dev/null
  aws lambda wait function-updated --function-name "$NAME"
else
  aws lambda create-function --function-name "$NAME" --runtime nodejs22.x --architectures x86_64 --handler server/aws.handler --memory-size 3008 --timeout 60 \
    --role "arn:aws:iam::$ACCT:role/$ROLE" --environment "Variables={BUCKET=$BUCKET,TABLE=$TABLE,PER_MINUTE=300,PER_DAY=2000}" --zip-file fileb:///tmp/nw.zip >/dev/null
  aws lambda wait function-active --function-name "$NAME"
  aws lambda put-function-concurrency --function-name "$NAME" --reserved-concurrent-executions 3 >/dev/null
  aws logs create-log-group --log-group-name "/aws/lambda/$NAME" 2>/dev/null || true
  aws logs put-retention-policy --log-group-name "/aws/lambda/$NAME" --retention-in-days 14
fi

echo "== address"
CORS="{\"AllowOrigins\":[$ORIGINS],\"AllowMethods\":[\"POST\",\"GET\"],\"AllowHeaders\":[\"content-type\",\"x-code\"],\"ExposeHeaders\":[\"x-uses-left\"],\"MaxAge\":86400}"
if aws lambda get-function-url-config --function-name "$NAME" >/dev/null 2>&1; then
  aws lambda update-function-url-config --function-name "$NAME" --auth-type NONE --cors "$CORS" >/dev/null
else
  aws lambda create-function-url-config --function-name "$NAME" --auth-type NONE --cors "$CORS" >/dev/null
  aws lambda add-permission --function-name "$NAME" --statement-id url --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE >/dev/null
  aws lambda add-permission --function-name "$NAME" --statement-id url-invoke --action lambda:InvokeFunction --principal "*" --invoked-via-function-url >/dev/null 2>&1 || true
fi
URL=$(aws lambda get-function-url-config --function-name "$NAME" --query FunctionUrl --output text)
echo "server: ${URL%/}"
echo "health: $(curl -s "${URL}health")"
