// A sewing test, not a check: four 22 mm squares of plain fill at four row spacings, to settle on the owner's own
// fabric and thread which spacing sews solid (docs/roadmap.md S6-A4; docs/stitch-model.md "Cover").
// usage: node tests/ladder.mjs OUT.pes
// Sewn in this order, one thread, fits the 4x4 hoop:
//   top left (a short line above it)  rows 0.40 mm apart: the spacing before v39
//   top right                         rows 0.30 mm
//   bottom left                       rows 0.25 mm: "Solid", every fill since v39
//   bottom right                      rows 0.20 mm: "Extra solid"
import fs from "node:fs";
import { Design } from "../js/core/design.js";
import { fillPolygon } from "../js/core/fill.js";
import { run } from "../js/core/geom.js";
import { readEmbroidery, validatePES, writePES } from "../js/core/formats.js";
import { hoop } from "../js/core/machines.js";

const out = process.argv[2];
if (!out) { console.error("usage: node tests/ladder.mjs OUT.pes"); process.exit(2); }
const H = hoop(undefined, "4x4"), S = 22, G = 6, d = new Design(H);
const square = (cx, cy) => [[cx - S / 2, cy - S / 2], [cx + S / 2, cy - S / 2], [cx + S / 2, cy + S / 2], [cx - S / 2, cy + S / 2]];
const at = (S + G) / 2, rungs = [[-at, -at, 0.4], [at, -at, 0.3], [-at, at, 0.25], [at, at, 0.2]];
d.color("#1c3f95", "Blue");
// (the mark: which way up the ladder is, once it is out of the hoop)
const mark = run([[-at - 6, -at - S / 2 - 3], [-at + 6, -at - S / 2 - 3]], 2);
d.path([...mark, ...mark.slice(0, -1).reverse(), ...mark.slice(1)]);
for (const [cx, cy, density] of rungs) for (const p of fillPolygon(square(cx, cy), { density, angle: 45 })) d.path(p);
d.finish();
const bytes = writePES(d.pattern()), v = validatePES(bytes, d.pattern(), H);
if (!v.ok) { console.error("not written:", v.error); process.exit(1); }
fs.writeFileSync(out, bytes);
const p = readEmbroidery(bytes, out);
console.log(`${out}: ${p.stitches.filter((s) => s[2] === 0).length} stitches, squares of ${S} mm at rows ${rungs.map((r) => r[2]).join(", ")} mm`);
