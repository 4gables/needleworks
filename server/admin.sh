#!/bin/bash
# Download codes (docs/paid-version.md), where the AWS CLI is signed in (AWS CloudShell):
#   bash server/admin.sh mint USES [NOTE]   a new code good for USES designs; prints it
#   bash server/admin.sh show CODE          what is left on a code
#   bash server/admin.sh list               every code, what is left, its note
set -euo pipefail
export AWS_DEFAULT_REGION=${AWS_REGION_NW:-us-west-2} AWS_PAGER=""; TABLE=needleworks
case "${1:-}" in
  mint)
    USES=${2:?how many designs}; NOTE=${3:-}
    # (letters and digits that can't be misread: no 0 O 1 I L)
    CODE=$(LC_ALL=C tr -dc 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' </dev/urandom | head -c 8); CODE="${CODE:0:4}-${CODE:4:4}"
    aws dynamodb put-item --table-name $TABLE --condition-expression "attribute_not_exists(k)" \
      --item "{\"k\":{\"S\":\"code#$CODE\"},\"left\":{\"N\":\"$USES\"},\"issued\":{\"N\":\"$USES\"},\"note\":{\"S\":\"$NOTE\"},\"at\":{\"S\":\"$(date -u +%F)\"}}"
    echo "$CODE  ($USES designs${NOTE:+, $NOTE})" ;;
  show) aws dynamodb get-item --table-name $TABLE --key "{\"k\":{\"S\":\"code#${2:?code}\"}}" --query 'Item.{left:left.N,issued:issued.N,note:note.S,fetched:jobs.SS}' ;;
  list) aws dynamodb scan --table-name $TABLE --filter-expression "begins_with(k, :c)" --expression-attribute-values '{":c":{"S":"code#"}}' --query 'Items[].[k.S,left.N,issued.N,note.S,at.S]' --output text ;;
  *) echo "usage: bash server/admin.sh mint USES [NOTE] | show CODE | list"; exit 1 ;;
esac
