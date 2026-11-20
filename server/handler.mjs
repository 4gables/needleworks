/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The paid build's engine, behind three requests (docs/paid-version.md). It runs the page's own job functions
// (js/picjob.js, js/docjob.js), keeps each whole file under its job id and answers with the preview: the file
// without its locks and underlay. The whole file leaves only through `file`, for one use of a code.
//   POST /job/picture, /job/doctor   body: a gzipped wire block (js/wire.js) of the worker's message
//                                    reply: a gzipped wire block of the worker's reply, the file in it the preview
//   POST /file                       body: JSON { job, code }; reply: the whole PES file, or JSON { ok: false, error }
// `store` (server/store-*.mjs): putFile(id, bytes), getFile(id), spend(code, job) -> { ok, left } | { ok: false, error },
// hit(who) -> false when that address has asked too often.
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { pictureJob } from "../js/picjob.js";
import { doctorJob } from "../js/docjob.js";
import { previewOf } from "../js/core/design.js";
import { readEmbroidery, validatePES, writePES } from "../js/core/formats.js";
import { blockLoads, shortJumps } from "../js/checkup.js";
import { verdictOf } from "../js/quality.js";
import { pack, unpack } from "../js/wire.js";

const JOBS = { picture: pictureJob, doctor: doctorJob };
export const MAX_BODY = 5.5 * 1024 * 1024;   // (a Lambda request holds 6 MB)

const json = (status, o) => ({ status, type: "application/json", body: Buffer.from(JSON.stringify(o)) });
const block = (o) => ({ status: 200, type: "application/octet-stream", body: gzipSync(Buffer.from(pack(o)), { level: 6 }) });

// A job's reply as the page gets it: the whole file kept, the preview in its place, and what is true of the whole
// file (`real`: the page shows these, not the preview's own counts).
async function kept(reply, store) {
  if (!reply.bytes) return reply;
  const whole = reply.bytes, full = readEmbroidery(whole, "x.pes"), id = createHash("sha256").update(whole).digest("hex").slice(0, 32);
  await store.putFile(id, whole);
  const shown = previewOf(reply.pattern), loads = blockLoads(full);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, c] of reply.pattern.stitches) if (c === 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  // (the separate pieces the thread is cut between, as the Picture tab counts them)
  let cuts = 0, was = 0;
  for (const [, , c] of reply.pattern.stitches) { if ((c === 1 || c === 2) && was === 0) cuts++; was = c === 1 || c === 2 ? 1 : 0; }
  return { ...reply, pattern: shown, bytes: writePES(shown), job: id,
    real: { stitches: loads.reduce((a, b) => a + b.stitches, 0), loads, snips: shortJumps(full), verdict: verdictOf(whole), extent: [x0, y0, x1, y1], cuts, bytes: whole.length } };
}

export async function handle({ method, path, body, who }, store) {
  try {
    if (method === "GET" && path === "/health") return json(200, { ok: true });
    if (method !== "POST") return json(405, { ok: false, error: "Not that way." });
    if (!body || body.length > MAX_BODY) return json(413, { ok: false, code: "big", error: "This is too big to send. Try a smaller picture or Size." });
    if (!(await store.hit(who))) return json(429, { ok: false, code: "often", error: "Too many changes at once. Wait a moment and try again." });
    const job = /^\/job\/(picture|doctor)$/.exec(path);
    if (job) {
      let reply;
      try { reply = { ok: true, ...(await kept(JOBS[job[1]](unpack(gunzipSync(body))), store)) }; }
      // (what the engine says of a picture it can't sew is the page's to show, with its code)
      catch (err) { reply = { ok: false, error: err.message || String(err), code: err.code }; }
      return block(reply);
    }
    if (path === "/file") {
      const { job: id, code } = JSON.parse(body.toString("utf8"));
      if (!/^[0-9a-f]{32}$/.test(id || "") || typeof code !== "string" || !code.trim() || code.length > 64) return json(400, { ok: false, error: "That code doesn't look right." });
      const bytes = await store.getFile(id);
      if (!bytes) return json(404, { ok: false, code: "gone", error: "This design has been put away. Change a setting to make it again, then download." });
      // (never a file the machine can't take: judged as the full app judges at its gate)
      const p = readEmbroidery(bytes, "x.pes");
      if (!validatePES(bytes, p, { w: 1e4, h: 1e4, name: "" }).ok) return json(500, { ok: false, error: "This file didn't pass its check. Change a setting and try again." });
      const spent = await store.spend(code.trim().toUpperCase(), id);
      if (!spent.ok) return json(402, { ok: false, code: "code", error: spent.error });
      return { status: 200, type: "application/octet-stream", body: Buffer.from(bytes), headers: { "x-uses-left": String(spent.left) } };
    }
    return json(404, { ok: false, error: "Nothing here." });
  } catch (err) {
    console.error(err);
    return json(500, { ok: false, error: "Something went wrong on our side. Try again." });
  }
}
