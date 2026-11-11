/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// What a design is sewn on and with: each fabric's supplies, hooping, tip and finish (so Have ready, step 1 and
// When it's done agree), and the thread weights' names and tips. The stitch numbers for each are in core/recipes.js.
// (Part of pieces.js until 2026-11.)
import { back } from "../core/geom.js";

// (`ready` is what "Have ready" lists and `tip` what "Sewing on" says: one place per fabric, so they agree)
// (`hoop` starts step 1, `after` is "When it's done": knit said "tear or cut away" though cut-away must be trimmed)
// (`item`: what to do when it's sewn on something already made, a pillowcase or a tote: said only when the design
// doesn't say what it's sewn on, as a starter's own tip does: the quilt label's sew sheet said "On a pillowcase or bag…")
export const FABRICS = {
  cotton: { name: "Cotton", ready: "Tear-away stabilizer.", tip: "On woven cotton, hoop it with tear-away stabilizer underneath.", item: "On a pillowcase or bag, hoop only the front layer (turn it inside out) so it isn't sewn shut.",
    hoop: "Hoop the fabric with tear-away stabilizer under it", after: "Take the hoop off, snip any loose threads and tear the stabilizer away gently, holding the stitches down with your thumb." },
  knit: { name: "Knit / T-shirt", ready: "Cut-away stabilizer (fusible no-show mesh is easiest) and a 75/11 ballpoint needle; on piqué or other textured knits, a water-soluble topper too.", tip: "Knits stretch: hoop them with cut-away stabilizer (fusible no-show mesh is easiest) and use a 75/11 ballpoint needle. Don't stretch the fabric while hooping.",
    hoop: "Hoop the knit with the cut-away stabilizer under it, without stretching it", after: "Take the hoop off and snip any loose threads. Trim the cut-away stabilizer on the back about ¼ in from the stitching, rounding the corners. Don't tear it: it stops the design stretching out of shape in the wash." },
  towel: { name: "Towel / fleece", tip: "Hoop the towel or fleece with tear-away stabilizer under it (cut-away on fleece) and lay a water-soluble topper on top. The light base sewn under the letters flattens the loops; tear the topper off afterwards.",
    ready: "A water-soluble topper (like Solvy) and tear-away stabilizer (cut-away on fleece, which stretches).", hoop: "Hoop the towel or fleece with the stabilizer under it. Lay the water-soluble topper on top",
    after: "Take the hoop off and snip any loose threads. Tear the topper away (a damp cloth melts the bits left in the letters), then tear the stabilizer off the back (cut-away: trim it ¼ in from the stitching)." },
  felt: { name: "Felt", ready: "Tear-away stabilizer and a sharp 75/11 needle.", tip: "Felt is firm: tear-away stabilizer is enough. Use a sharp 75/11 needle.",
    hoop: "Hoop the felt with tear-away stabilizer under it", after: "Take the hoop off, snip any loose threads and tear the stabilizer away gently." },
  denim: { name: "Denim", ready: "Cut-away stabilizer (heavy tear-away will do on denim that's rarely washed) and a 75/11 sharp or 80/12 needle (90/14 for heavy denim).", tip: "On denim use a 75/11 sharp or 80/12 needle (90/14 only for heavy denim) and cut-away stabilizer (heavy tear-away will do on denim that's rarely washed).",
    hoop: "Hoop the denim with the stabilizer under it", after: "Take the hoop off and snip any loose threads. Cut-away stabilizer: trim it ¼ in from the stitching (don't tear it). Heavy tear-away: tear it off gently." },
  canvas: { name: "Canvas / tote", ready: "Medium tear-away stabilizer (cut-away if it'll be washed a lot) and a 90/14 sharp needle.", tip: "Canvas is firm: medium tear-away stabilizer underneath (cut-away if it'll be washed a lot) and a 90/14 sharp needle.", item: "On a tote, hoop only the front layer (turn it inside out).",
    hoop: "Hoop the canvas (on a tote, only the front layer) with the stabilizer under it", after: "Take the hoop off, snip any loose threads and tear the stabilizer away gently (cut-away: trim it ¼ in from the stitching)." },
};
// thread weight (compose opts `thread`): satin and fill spacing follow the thread's thickness. Automatic is what the
// site always did: 40 wt, with lettering under a 6 mm x-height sewn for the 60 wt the steps suggest. 30 wt is ~1.3x
// as thick as 40 (satins 15% more open, fills 0.05 mm); 60 wt ~0.75x (satins 12% closer; fills stay at 0.35 mm,
// closer rows make the row links shorter than the PE900 check's 0.3 mm).
export const THREADS = {
  auto: { name: "Automatic", tip: "Standard 40 wt thread (the weight is printed on the spool: a bigger number is a finer thread); small letters are sewn for 60 wt (the steps say when)." },
  30: { name: "30 wt", tip: "30 wt is heavier and bolder: use a 90/14 topstitch needle and slow the machine down." },
  40: { name: "40 wt", tip: "40 wt is the standard machine embroidery thread: a 75/11 embroidery needle." },
  60: { name: "60 wt", tip: "60 wt is fine, for small letters and fine detail: a 65/9 or 70/10 needle and 60 wt bobbin thread." },
};
