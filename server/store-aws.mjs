/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The stores on AWS (docs/paid-version.md): whole files in S3 (the bucket deletes them after 30 days), codes and
// per-address counts in one DynamoDB table (key `k`): "code#CODE" { left, jobs }, "hit#ADDRESS#MINUTE" and "day#ADDRESS#DAY" { n, ttl }.
// The SDK is the Lambda runtime's own: nothing is installed or bundled.
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

export function awsStore({ bucket, table, perMinute = 300, perDay = 2000 }) {
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
    // (two counts per address: this minute's requests, and today's jobs unless a code of ours came with them)
    async hit(who, code = "", counted = false) {
      const minute = Math.floor(Date.now() / 60000);
      const count = async (key, ttl) => +(await db.send(new UpdateItemCommand({ TableName: table, Key: { k: { S: key } }, UpdateExpression: "ADD n :one SET #t = :ttl",
        ExpressionAttributeNames: { "#t": "ttl" }, ExpressionAttributeValues: { ":one": { N: "1" }, ":ttl": { N: String(ttl) } }, ReturnValues: "UPDATED_NEW" }))).Attributes.n.N;
      if ((await count(`hit#${who}#${minute}`, minute * 60 + 600)) > perMinute) return "often";
      if (!counted) return "";
      if (code && (await db.send(new GetItemCommand({ TableName: table, Key: { k: { S: `code#${code}` } }, ProjectionExpression: "k" }))).Item) return "";
      const day = Math.floor(minute / 1440);
      return (await count(`day#${who}#${day}`, (day + 2) * 86400)) > perDay ? "daily" : "";
    },
  };
}
