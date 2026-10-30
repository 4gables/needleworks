// The design doctor's fixes (resize 80-120 %, tiny stitches, thinning) must always give a file that validates.
import { readFileSync, readdirSync, existsSync } from "fs";
import { readEmbroidery, validatePES, writePES } from "../js/core/formats.js";
import { checkup, fix } from "../js/doctor.js";

const dirs = ["tests/fixtures/golden", "tests/external/pes"].filter(existsSync);
let n = 0, bad = 0;
for (const dir of dirs) for (const f of readdirSync(dir).filter((x) => /\.(pes|dst)$/i.test(x))) {
  const d = readEmbroidery(new Uint8Array(readFileSync(`${dir}/${f}`)), f);
  checkup(d);
  for (const scale of [0.8, 0.9, 1, 1.1, 1.2]) for (const tiny of [false, true]) for (const thin of [false, true]) {
    n++;
    const p = fix(d, { scale, tiny, thin }), v = validatePES(writePES(p), p);
    if (!v.ok) { bad++; console.error(`FAIL ${f} scale ${scale} tiny ${tiny} thin ${thin}: ${v.error}`); }
  }
}
console.log(`doctor: ${n} fixes, ${bad} bad`);
if (bad || !n) process.exit(1);
