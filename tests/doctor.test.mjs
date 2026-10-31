// The design doctor's fixes (resize 50-250 %, re-stitched past 80-120 %; tiny stitches; thinning; colour sort) must
// always give a file that validates.
import { readFileSync, readdirSync, existsSync } from "fs";
import { readEmbroidery, validatePES, writePES } from "../js/core/formats.js";
import { checkup, fix, landJumps, sortColors } from "../js/doctor.js";
import { moves, verdictOf } from "../js/quality.js";

const dirs = ["tests/fixtures/golden", "tests/external/pes"].filter(existsSync);
let n = 0, bad = 0, sorted = 0;
const bounds = (p) => { const s = p.stitches.filter((q) => q[2] === 0 || q[2] === 1), xs = s.map((q) => q[0]), ys = s.map((q) => q[1]); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; };
for (const dir of dirs) for (const f of readdirSync(dir).filter((x) => /\.(pes|dst)$/i.test(x))) {
  const d = readEmbroidery(new Uint8Array(readFileSync(`${dir}/${f}`)), f);
  checkup(d);
  for (const scale of [0.8, 0.9, 1, 1.1, 1.2]) for (const tiny of [false, true]) for (const thin of [false, true]) {
    n++;
    const p = fix(d, { scale, tiny, thin }), v = validatePES(writePES(p), p);
    if (!v.ok) { bad++; console.error(`FAIL ${f} scale ${scale} tiny ${tiny} thin ${thin}: ${v.error}`); }
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
      // colour sort never adds a thread change
      // (a DST lists fewer threads than it has blocks: count the blocks)
      const blocks = d.stitches.filter((q) => q[2] === 5).length + 1, out = p.stitches.filter((q) => q[2] === 5).length + 1;
      if (sort && out > blocks) { bad++; console.error(`FAIL ${f} sort added thread changes (${blocks} -> ${out})`); }
    } catch (err) { bad++; console.error(`FAIL ${f} restitch ${scale} sort ${sort}: ${err.message}`); }
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
console.log(`doctor: ${n} fixes, ${bad} bad (colour sort helped ${sorted} files)`);
if (bad || !n) process.exit(1);
