// Cycle 7 T1 (docs/roadmap.md): one picture traced to smooth outlines (js/core/trace.js) and sewn by our fill, to put
// beside the reference before anything wider is built. Not a check.
// usage: node tests/trace_one.mjs RAW.rgba W H LONGEST_MM OUT.pes   (RAW: 8-bit RGBA rows, no header)
import fs from "node:fs";
import { Design } from "../js/core/design.js";
import { readEmbroidery, validatePES, writePES } from "../js/core/formats.js";
import { hoop } from "../js/core/machines.js";
import { sewShape } from "../js/core/tracesew.js";
import { tracePicture, TRACE } from "../js/core/trace.js";

const [raw, Ws, Hs, mmS, out] = process.argv.slice(2);
const W = +Ws, H = +Hs, rgba = new Uint8Array(fs.readFileSync(raw));
// the inked box: pixels that are neither white nor see-through
let x0 = W, y0 = H, x1 = -1, y1 = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4;
  if (rgba[i + 3] < 128 || (rgba[i] >= TRACE.white && rgba[i + 1] >= TRACE.white && rgba[i + 2] >= TRACE.white)) continue;
  x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
}
const mmPerPx = +mmS / Math.max(x1 - x0 + 1, y1 - y0 + 1), t0 = Date.now();
const tr = tracePicture(rgba, W, H, mmPerPx);
const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
if (!tr.shapes.length) { console.log(`not flat art (flat ${tr.flat?.toFixed(3)}, unexplained ink ${tr.unexplained?.toFixed(3)}): left to the picture path`); process.exit(3); }
console.log(`flat ${tr.flat.toFixed(3)}, traced in ${Date.now() - t0} ms: ${tr.colors.length} colours ${tr.colors.map(hex).join(" ")}, ${tr.shapes.length} shapes, upsampled x${tr.fine}, working /${tr.f}`);
// centre the design on the hoop
const all = tr.shapes.flatMap((s) => s.rings[0]), cx = (Math.min(...all.map((p) => p[0])) + Math.max(...all.map((p) => p[0]))) / 2, cy = (Math.min(...all.map((p) => p[1])) + Math.max(...all.map((p) => p[1]))) / 2;
const d = new Design(hoop(undefined, "5x7"));
// one block per colour, the colour with the most area first; each colour's shapes largest first
const kinds = { satin: 0, fill: 0 }, order = [...new Set(tr.shapes.map((s) => s.color))];
for (const c of order) {
  d.color(hex(tr.colors[c]));
  for (const s of tr.shapes.filter((q) => q.color === c)) {
    const rings = s.rings.map((l) => l.map(([x, y]) => [x - cx, y - cy]));
    const s2 = sewShape(rings); kinds[s2.kind]++;
    for (const p of s2.paths) d.path(p);
  }
}
d.finish();
const bytes = writePES(d.pattern()), v = validatePES(bytes, d.pattern(), hoop(undefined, "5x7"));
if (!v.ok) { console.error("not written:", v.error); process.exit(1); }
fs.writeFileSync(out, bytes);
console.log(`sewn: ${kinds.satin} satin, ${kinds.fill} fill`);
console.log(`${out}: ${readEmbroidery(bytes, out).stitches.filter((s) => s[2] === 0).length} stitches`);
