/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The server on this computer, for building and testing the paid build: node server/dev.mjs [port=8787]
// Codes: TEST (never runs out) and ONCE (one download). Any page may call it.
import http from "node:http";
import { handle } from "./handler.mjs";
import { memoryStore } from "./store-memory.mjs";

const port = +process.argv[2] || 8787, store = memoryStore({ TEST: Infinity, ONCE: 1 });
http.createServer(async (req, res) => {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-expose-headers": "x-uses-left", "access-control-allow-methods": "POST, GET, OPTIONS" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
  const parts = []; for await (const c of req) parts.push(c);
  const t = Date.now(), r = await handle({ method: req.method, path: new URL(req.url, "http://x").pathname, body: Buffer.concat(parts), who: req.socket.remoteAddress }, store);
  console.log(req.method, req.url, r.status, `${Date.now() - t} ms`, `${r.body.length} bytes`);
  res.writeHead(r.status, { "content-type": r.type, ...cors, ...(r.headers || {}) }); res.end(r.body);
}).listen(port, () => console.log(`server on http://127.0.0.1:${port}`));
