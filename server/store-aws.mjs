/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The stores on AWS (docs/paid-version.md): whole files in S3 (the bucket deletes them after 30 days), codes and
// per-address counts in one DynamoDB table (key `k`): "code#CODE" { left, jobs }, "hit#ADDRESS#MINUTE" { n, ttl }.
// The SDK is the Lambda runtime's own: nothing is installed or bundled.
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

export function awsStore({ bucket, table, perMinute = 60 }) {
  const s3 = new S3Client({}), db = new DynamoDBClient({});
  return {
    async putFile(id, bytes) { await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `files/${id}.pes`, Body: bytes, ContentType: "application/octet-stream" })); },
    async getFile(id) {
      try { const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `files/${id}.pes` })); return new Uint8Array(await r.Body.transformToByteArray()); }
      catch (err) { if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) return null; throw err; }
    },
    // one use of a code for a job; a job already fetched with it costs nothing. Counted in one conditional write, so
    // two downloads at once can't both take the last use.
    async spend(code, job) {
      const Key = { k: { S: `code#${code}` } }, got = await db.send(new GetItemCommand({ TableName: table, Key, ConsistentRead: true }));
      if (!got.Item) return { ok: false, error: "That code isn't one of ours. Check it and try again." };
      const left = +got.Item.left.N, mine = got.Item.jobs?.SS || [];
      if (mine.includes(job)) return { ok: true, left };
      if (left < 1) return { ok: false, error: "That code has no downloads left." };
      try {
        await db.send(new UpdateItemCommand({ TableName: table, Key, UpdateExpression: "SET #l = #l - :one ADD jobs :job", ConditionExpression: "#l >= :one",
          ExpressionAttributeNames: { "#l": "left" }, ExpressionAttributeValues: { ":one": { N: "1" }, ":job": { SS: [job] } } }));
      } catch (err) { if (err.name === "ConditionalCheckFailedException") return { ok: false, error: "That code has no downloads left." }; throw err; }
      return { ok: true, left: left - 1 };
    },
    async hit(who) {
      const minute = Math.floor(Date.now() / 60000);
      const r = await db.send(new UpdateItemCommand({ TableName: table, Key: { k: { S: `hit#${who}#${minute}` } }, UpdateExpression: "ADD n :one SET #t = :ttl",
        ExpressionAttributeNames: { "#t": "ttl" }, ExpressionAttributeValues: { ":one": { N: "1" }, ":ttl": { N: String(minute * 60 + 600) } }, ReturnValues: "UPDATED_NEW" }));
      return +r.Attributes.n.N <= perMinute;
    },
  };
}
