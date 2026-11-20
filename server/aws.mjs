/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The server as an AWS Lambda behind a function URL (docs/paid-version.md). The URL's own settings answer the
// browser's cross-site questions (CORS); a body of bytes comes and goes as base64.
import { handle } from "./handler.mjs";
import { awsStore } from "./store-aws.mjs";

const store = awsStore({ bucket: process.env.BUCKET, table: process.env.TABLE, perMinute: +process.env.PER_MINUTE || 60 });

export async function handler(event) {
  const http = event.requestContext?.http || {};
  const r = await handle({ method: http.method, path: event.rawPath || "/", who: http.sourceIp || "?",
    body: event.body ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8") : Buffer.alloc(0) }, store);
  return { statusCode: r.status, headers: { "content-type": r.type, "cache-control": "no-store", ...(r.headers || {}) }, body: r.body.toString("base64"), isBase64Encoded: true };
}
