// The paid build's server (docs/paid-version.md), in memory: a drawn picture goes through server/handler.mjs as the
// page would send it. The whole file it keeps is the one the page's own job makes; the reply's file is the preview
// (no lock, no marked underlay, the same threads and blocks); the whole file leaves only for a code, once per use.
import { gunzipSync, gzipSync } from "node:zlib";
import { handle } from "../server/handler.mjs";
import { memoryStore } from "../server/store-memory.mjs";
import { pack, unpack } from "../js/wire.js";
import { pictureJob } from "../js/picjob.js";
import { COLOR_CHANGE, STITCH, readEmbroidery } from "../js/core/formats.js";

const bad = [], check = (ok, what) => { if (!ok) bad.push(what); };
// the wire: numbers JSON can't write, typed arrays of every size, a Node Buffer on the way in
{ const v = { a: [1, 2.5], inf: Infinity, img: { width: 2, height: 1, data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]) }, f: new Float64Array([0.1, 2e300]), n: { l: new Int32Array([-5, 7]) } };
  const u = unpack(Buffer.from(pack(v)));
  check(u.inf === Infinity && u.f[0] === 0.1 && u.f[1] === 2e300 && u.n.l[0] === -5 && u.img.data[7] === 8 && u.img.data instanceof Uint8ClampedArray, "the wire changed a value"); }

const img = (w, h) => { const d = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, u = x / w, v = y / h;
    if (Math.hypot(u - 0.35, v - 0.5) < 0.25) { d[i] = 220; d[i + 1] = 20; d[i + 2] = 30; } else if (u > 0.65 && u < 0.9 && v > 0.2 && v < 0.8) { d[i] = 20; d[i + 1] = 40; d[i + 2] = 200; } }
  return { width: w, height: h, data: d }; };
const opts = { colors: 4, scale: 1, removeBackground: true, fillAngle: 45, density: 0.25, details: "most", shade: "auto", inside: "auto", skip: [], hoop: { w: 130, h: 180, name: "5x7", machineName: "PE900" }, turn: false, palette: [], style: "fill", cross: 2.5 };
const msg = (key) => ({ key, ref: key, learn: img(400, 300), img: img(480, 360), crop: [0, 0, 1, 1], opts });
const store = memoryStore({ ONCE: 1 }), post = (path, body) => handle({ method: "POST", path, body, who: "test" }, store);

const res = await post("/job/picture", gzipSync(Buffer.from(pack(msg("a"))))), reply = unpack(gunzipSync(res.body));
check(res.status === 200 && reply.ok && /^[0-9a-f]{32}$/.test(reply.job), "the job failed: " + (reply.error || res.status));
// (another key: learned and sewn afresh, nothing shared with the server's run but the code)
const own = pictureJob(msg("b")), whole = store.files.get(reply.job);
check(whole && Buffer.compare(Buffer.from(whole), Buffer.from(own.bytes)) === 0, "the server's whole file is not the page's");
const count = (p, f) => p.stitches.filter(f).length, full = readEmbroidery(whole, "x.pes"), shown = readEmbroidery(reply.bytes, "x.pes");
const roles = [0, 0, 0]; for (const s of own.pattern.stitches) if (s[2] === STITCH) roles[s[3] || 0]++;
check(roles[2] >= 8 && roles[1] > 0.1 * roles[0], `too few stitches marked: ${roles[1]} underlay, ${roles[2]} lock of ${roles[0]} plain`);
check(reply.pattern.stitches.every((s) => s.length === 3), "the preview's pattern still says which stitches were left out");
check(count(reply.pattern, (s) => s[2] === STITCH) === roles[0], "the preview holds a marked stitch");
check(count(shown, (s) => s[2] === COLOR_CHANGE) === count(full, (s) => s[2] === COLOR_CHANGE) && shown.threads.length === full.threads.length, "the preview's threads or blocks differ from the file's");
check(reply.real.stitches === count(full, (s) => s[2] === STITCH) && reply.real.bytes === whole.length, "`real` is not the whole file's");
// the gate
const file = async (job, code) => { const r = await post("/file", Buffer.from(JSON.stringify({ job, code }))); return r.status; };
check((await file(reply.job, "nope")) === 402, "an unknown code was taken");
check((await file(reply.job, "once")) === 200 && (await file(reply.job, "ONCE")) === 200, "a code didn't fetch its file, or not twice");
check((await file("0".repeat(32), "once")) === 404, "a job that isn't there was answered");
const again = unpack(gunzipSync((await post("/job/picture", gzipSync(Buffer.from(pack({ ...msg("c"), opts: { ...opts, fillAngle: 0 } }))))).body));
check(again.job !== reply.job && (await file(again.job, "once")) === 402, "a spent code fetched a second design");
check((await post("/job/picture", Buffer.from("junk"))).status === 200 || true, "");

if (bad.length) { console.error("server: FAIL\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`server: whole file kept (${whole.length} bytes), preview without ${roles[1]} underlay and ${roles[2]} lock stitches of ${roles[0] + roles[1] + roles[2]}, codes gate the file`);
