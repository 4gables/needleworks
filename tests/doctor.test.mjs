// The design doctor's fixes (resize 50-250 %, re-stitched past 80-120 %; tiny stitches; thinning; colour sort) must
// always give a file that validates.
import { readFileSync, readdirSync, existsSync } from "fs";
import { readEmbroidery, validatePES, writePES } from "../js/core/formats.js";
import { checkup, fix, sortColors } from "../js/doctor.js";

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
}
console.log(`doctor: ${n} fixes, ${bad} bad (colour sort helped ${sorted} files)`);
if (bad || !n) process.exit(1);
