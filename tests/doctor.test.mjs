// The design doctor's fixes (resize 50-250 %, re-stitched past 80-120 %; tiny stitches; thinning; colour sort) must
// always give a file that validates.
import { readFileSync, readdirSync, existsSync } from "fs";
import { readEmbroidery, validatePES, writePES } from "../js/core/formats.js";
import { checkup, fix, landJumps, sortColors } from "../js/doctor.js";
import { moves, verdictOf } from "../js/quality.js";
import { distanceTransform } from "../js/core/raster.js";

// Thread laid per mm² in each colour block (stitch length over the area its stitches cover, closed over 1.2 mm on a
// 4 px/mm grid). A resized copy covers as its source did: re-stitched gnome at 50 and 250 % had half its fills'
// thread (rows kept at 0.35 mm where the file had 0.15). Only solid blocks (3 mm/mm² or more in the source: fills and
// satins: most of the shape 0.4 mm or more from its edge, before and after) are compared; a block of lines covers a
// different share of its closed area at each size (ufront's bean-stitch outlines read 166 % at 250 %).
function coverage(p) {
  const blocks = [[]];
  let last = null;
  for (const s of p.stitches) {
    if (s[2] === 5) { blocks.push([]); last = null; continue; }
    if (s[2] === 0 && last) blocks[blocks.length - 1].push([last[0] / 10, last[1] / 10, s[0] / 10, s[1] / 10]);
    last = s[2] === 0 || s[2] === 1 ? s : null;
  }
  return blocks.map((segs) => {
    if (!segs.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0;
    for (const [a, b, c, d] of segs) { x0 = Math.min(x0, a, c); y0 = Math.min(y0, b, d); x1 = Math.max(x1, a, c); y1 = Math.max(y1, b, d); len += Math.hypot(c - a, d - b); }
    const R = 4; x0 -= 3; y0 -= 3;
    const w = Math.ceil((x1 - x0 + 3) * R), h = Math.ceil((y1 - y0 + 3) * R), data = new Uint8Array(w * h);
    for (const [ax, ay, bx, by] of segs) {
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) * R * 2) || 1;
      for (let k = 0; k <= n; k++) data[Math.round((ay + ((by - ay) * k) / n - y0) * R) * w + Math.round((ax + ((bx - ax) * k) / n - x0) * R)] = 1;
    }
    const near = distanceTransform({ w, h, data: data.map((v) => 1 - v) }), deep = distanceTransform({ w, h, data: near.map((v) => (v <= 1.2 * R ? 1 : 0)) });
    let area = 0, inner = 0;
    for (const v of deep) { if (v > 1.2 * R) area++; if (v > 1.6 * R) inner++; }
    return { per: len / (area / R / R), area: area / R / R, solid: inner > 0.4 * area };
  });
}
// within 80-120 % the stitches are only scaled (1/scale as dense, satins evened out); re-stitched, the source's
// own spacing within the doctor's limits (satins 0.3-0.5 mm, fill rows 0.15-0.5): a solid block keeps 70-160 %
const COVER = [0.7, 1.6];
let covered = 0;
function sameCover(f, src, p, scale) {
  const out = coverage(readEmbroidery(writePES(p), "x.pes"));
  src.forEach((s, i) => {
    const o = out[i];
    if (!s || !o || s.per < 3 || !s.solid || !o.solid || o.area < 10) return;
    covered++;
    const r = o.per / s.per;
    if (r < COVER[0] || r > COVER[1]) { bad++; console.error(`FAIL ${f} ${scale * 100} %: block ${i + 1} has ${Math.round(r * 100)} % of the source's thread per mm² (${s.per.toFixed(2)} -> ${o.per.toFixed(2)})`); }
  });
}

const dirs = ["tests/fixtures/golden", "tests/external/pes"].filter(existsSync);
let n = 0, bad = 0, sorted = 0;
const bounds = (p) => { const s = p.stitches.filter((q) => q[2] === 0 || q[2] === 1), xs = s.map((q) => q[0]), ys = s.map((q) => q[1]); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; };
for (const dir of dirs) for (const f of readdirSync(dir).filter((x) => /\.(pes|dst)$/i.test(x))) {
  const d = readEmbroidery(new Uint8Array(readFileSync(`${dir}/${f}`)), f);
  checkup(d);
  const src = coverage(d);
  for (const scale of [0.8, 0.9, 1, 1.1, 1.2]) for (const tiny of [false, true]) for (const thin of [false, true]) {
    n++;
    const p = fix(d, { scale, tiny, thin }), v = validatePES(writePES(p), p);
    if (!v.ok) { bad++; console.error(`FAIL ${f} scale ${scale} tiny ${tiny} thin ${thin}: ${v.error}`); }
    if ((scale === 0.8 || scale === 1.2) && !tiny && !thin) sameCover(f, src, p, scale);
  }
  {
    // satins evened out at full size (within 80-120 % every resize does it)
    n++;
    const p = fix(d, { satin: true }), v = validatePES(writePES(p), p);
    if (!v.ok) { bad++; console.error(`FAIL ${f} satin: ${v.error}`); }
  }
  for (const scale of [0.5, 0.7, 1, 1.5, 2.5]) for (const sort of [false, true]) {
    n++;
    try {
      // (only what fits a 5x7 field: bigger is refused by the hoop check before anything else)
      const p = fix(d, { scale, sort }), b = bounds(p), v = validatePES(writePES(p), p);
      if (!v.ok && b[0] <= 1260 && b[1] <= 1760) { bad++; console.error(`FAIL ${f} restitch ${scale} sort ${sort}: ${v.error}`); }
      if (!sort && (scale === 0.5 || scale === 2.5)) sameCover(f, src, p, scale);
      // colour sort never adds a thread change
      // (a DST lists fewer threads than it has blocks: count the blocks)
      const blocks = d.stitches.filter((q) => q[2] === 5).length + 1, out = p.stitches.filter((q) => q[2] === 5).length + 1;
      if (sort && out > blocks) { bad++; console.error(`FAIL ${f} sort added thread changes (${blocks} -> ${out})`); }
    } catch (err) { bad++; console.error(`FAIL ${f} restitch ${scale} sort ${sort}: ${err.message}`); }
  }
  // the Design tab's file pieces grown a little (`grow`: re-stitched, not scaled open): valid and as covered
  {
    n++;
    try {
      const p = fix(d, { scale: 1.1, thin: true, grow: true }), b = bounds(p), v = validatePES(writePES(p), p);
      if (!v.ok && b[0] <= 1260 && b[1] <= 1760) { bad++; console.error(`FAIL ${f} grow 1.1: ${v.error}`); }
      sameCover(f, src, p, 1.1);
    } catch (err) { bad++; console.error(`FAIL ${f} grow 1.1: ${err.message}`); }
  }
  const s = sortColors(d); if (s) sorted++;
  // the download dialog's fixed copy (app.js fixedCopy) passes the app's own verdict, which is pe900_check's
  const bytes = writePES(d), v = verdictOf(bytes);
  if (v.length) {
    n++;
    const k = new Set(v.map((q) => q.key)), p = fix(readEmbroidery(bytes, "x.pes"), { thin: k.has("dense"), tiny: k.has("tiny") || k.has("same"), satin: k.has("sparse") });
    const after = verdictOf(writePES(p));
    if (after.length) { bad++; console.error(`FAIL ${f} fixed copy still: ${after.map((q) => q.key)}`); }
  }
  // Remove tiny stitches leaves next to none the checker counts, shrunk or re-stitched (a run ending in two short
  // stitches can keep one: needleworks_rl at 90 %)
  for (const scale of [0.7, 0.9]) {
    n++;
    const m = moves(readEmbroidery(writePES(fix(d, { scale, tiny: true })), "x.pes").stitches);
    if (m.tiny > 2) { bad++; console.error(`FAIL ${f} ${scale} with tiny removed: ${m.tiny} tiny`); }
  }
}
// two blocks in a row in one thread are a pause (an in-the-hoop fabric step): colour sort leaves the file alone
{
  n++;
  const sq = (x0) => [[x0, 0, 0], [x0 + 20, 0, 0], [x0 + 20, 20, 0], [x0, 20, 0]];
  const red = { color: "#ed171f", name: "Red" }, p = { stitches: [...sq(0), [0, 20, 5], ...sq(100), [100, 20, 5], ...sq(200), [200, 20, 4]], threads: [red, red, red] };
  if (sortColors(p)) { bad++; console.error("FAIL colour sort merged a same-thread pause"); }
}
// a file starting with a stitch at the origin and going on 54 mm: that move is a jump, never sewn (origin_start.pes);
// and a pattern listing more threads than it has blocks is saved with one per block (disagree.pes's "2 colours")
{
  n++;
  const arc = Array.from({ length: 30 }, (_, k) => [500 + Math.round(30 * Math.sin(k / 5)), 200 + k * 10, 0]);
  const p = landJumps({ stitches: [[0, 0, 0], ...arc, [arc[29][0], arc[29][1], 4]], threads: [{ color: "#ed171f", name: "Red" }] });
  if (p.stitches[0][2] !== 1 || p.stitches[0][0] !== 500) { bad++; console.error("FAIL origin start not a jump: " + JSON.stringify(p.stitches.slice(0, 2))); }
  n++;
  const two = fix({ ...p, threads: [{ color: "#ed171f", name: "Red" }, { color: "#0e1f7c", name: "Navy" }] }), v = verdictOf(writePES(two));
  if (two.threads.length !== 1 || v.length) { bad++; console.error(`FAIL threads per block: ${two.threads.length}, ${v.map((q) => q.key)}`); }
  n++;
  if (!verdictOf(writePES({ ...p, threads: [{ color: "#ed171f" }, { color: "#0e1f7c" }] })).some((q) => q.key === "colours")) { bad++; console.error("FAIL verdict misses a PEC thread count that isn't the block count"); }
}
console.log(`doctor: ${n} fixes, ${bad} bad (colour sort helped ${sorted} files; ${covered} solid blocks' cover compared)`);
if (bad || !n) process.exit(1);
