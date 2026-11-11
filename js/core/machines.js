/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Embroidery machines and hoops. Add a machine here and the whole site picks it up.
// Sizes are the sewable field in mm (w = left-right, h = front-back).
//
// A machine is listed only when Brother's own pages give what the files and the steps rely on:
//   - its frames' fields;
//   - that it trims jump stitches itself (`autoTrim`: "Jump Stitch Trim", on from the factory, with a "length of
//     jump stitch not to trim" from 5 mm). The counts of threads to snip, the trims and the locks are all made for
//     that; on a machine that leaves every jump for the scissors they would be wrong.
// Sources (Brother, read 2026-11):
//   PE900:  operation manual 888-K80/L80/L82 (frames 18 x 13, 18 x 10, 10 x 10 cm; pattern up to 180 x 130 mm and
//           200,000 stitches; Jump Stitch Trim p.38); brother-usa.com/p/sewing-embroidery/PE900.
//   SE2000: brother-usa.com/p/sewing-embroidery-combo/SE2000 (5" x 7" field, "Jump Stitch Trimming function"), its
//           operation manual 888-K10/L11/L12 (Jump Stitch Trim) and Brother's options list (frame set SA443, 10 x
//           10 cm).
//   NQ1700E: operation manual 888-G60/G70/G72 (download.brother.com/welcome/doch102340/888g60_g70_g72_om01en.pdf:
//           "embroidery patterns up to a maximum of 26 cm x 16 cm", p.48; "Using the Thread Trimming Function (Jump
//           Stitch Trim)" and "Selecting the Length of Jump Stitch Not to Trim", pp.39-41; .pes files from a USB
//           stick); brother-usa.com/products/nq1700e ('6" x 10" Maximum embroidery area').
// Colour blocks in one design (recipes.js LIMITS.blocks, 99) are in no Brother manual: the PE900's, kept for all.
// A design bigger than 130 x 180 mm is written with the 160 x 260 mm page in its PES header (formats.js `pesPage`,
// docs/writer-changes.md W1). Checked in PE-DESIGN 11; not yet sewn on a 6" x 10" machine by anyone here.
// Not listed, and why (docs/app-ui.md):
//   - 4" x 4" machines (SE700, PE545, SE600, PE535...): Brother's pages name an automatic thread cutter but no
//     jump-stitch trimming, so every jump would be a thread to snip by hand, which nothing here counts yet.
//   - other 6" x 10" models (NS1750D's page gives 4" x 4"; NQ3550W and the like): not read yet. A model goes in
//     when its own manual gives the field and Jump Stitch Trim.
export const MACHINES = {
  "brother-pe900": {
    name: "Brother PE900",
    format: "pes",
    autoTrim: true,
    hoops: {
      "5x7": { name: '5" × 7" hoop', w: 130, h: 180 },
      "4x4": { name: '4" × 4" hoop', w: 100, h: 100 },
    },
    defaultHoop: "5x7",
  },
  "brother-se2000": {
    name: "Brother SE2000",
    format: "pes",
    autoTrim: true,
    hoops: {
      "5x7": { name: '5" × 7" hoop', w: 130, h: 180 },
      "4x4": { name: '4" × 4" hoop', w: 100, h: 100 },
    },
    defaultHoop: "5x7",
  },
  "brother-nq1700e": {
    name: "Brother NQ1700E",
    format: "pes",
    autoTrim: true,
    hoops: {
      "6x10": { name: '6" × 10" hoop', w: 160, h: 260 },
      "5x7": { name: '5" × 7" hoop', w: 130, h: 180 },
      "4x4": { name: '4" × 4" hoop', w: 100, h: 100 },
    },
    defaultHoop: "6x10",
  },
};
export const DEFAULT_MACHINE = "brother-pe900";
export const MARGIN = 2;

export function hoop(machine = DEFAULT_MACHINE, hoopId) {
  const m = MACHINES[machine], id = hoopId || m.defaultHoop;
  return { ...m.hoops[id], id, machine, machineName: m.name, format: m.format };
}
