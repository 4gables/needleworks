/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The "Start from" designs: each a list of pieces (lettering, monograms, frames, motifs, appliqué letters) with
// its fabric, hoop turn and tip. Made of the same pieces the editor adds. (Part of ui.js until 2026-11.)
import { APPLIQUE_FONTS } from "../core/fonts.js";
import { initials, swashes } from "../core/typed.js";
import { sewn, label } from "./pieces.js";

export const SCRIPT = "NW Great Vibes", PRINT = "NW Josefin Sans", ROUND = "NW Quicksand", BOLD = "NW Yellowtail";
// exact Brother PEC thread colours, so the name on screen is the one the machine shows
export const RED = "#ed171f", NAVY = "#0e1f7c", BLACK = "#000000";
export const PINK = "#f993bc", WHITE = "#f0f0f0";
// the next piece id (one counter for starters and the editor)
export const ids = { next: 1 };
export const piece = (o) => ({ id: ids.next++, x: 0, y: 0, color: NAVY, ...o });
export const text = (o) => piece({ kind: "text", text: "Ashley", font: SCRIPT, size: 18, shape: "straight", radius: 30, ...o });
export const mono = (o) => piece({ kind: "monogram", letters: "aMs", font: SCRIPT, size: 30, ...o });
export const appl = (o) => piece({ kind: "letters", text: "AB", font: APPLIQUE_FONTS[0].family, size: 60, color: NAVY, ...o });
export const motif = (o) => piece({ kind: "motif", motif: "heart", size: 40, style: "fill", color: RED, ...o });
export const frame = (o) => piece({ kind: "frame", shape: "circle", w: 80, h: 80, border: "satin", color: RED, ...o });
// (the bookmark had its own panel and engine until 2026-10-31; it's pieces like every other starter now, and its
// swash checkboxes became "~" typed at either end of the words)
const SACRAMENTO = "NW Sacramento";
// Every starter opens with nothing to warn about on either hoop (tests/starters.mjs): "Ashley" in Great Vibes has
// small loops that fill in from 16 to 22 mm, so script names are 24 mm where there's room and Yellowtail where there
// isn't (the bib, ornament, luggage tag, towel). Starters made for one name lying across (the pet bandana, the
// stocking cuff, name with motifs, tote bag, towel) open with the hoop turned like the bookmark, so a 10-letter name
// typed over it still fits the 5x7 ("Biscuit" on the bandana was 149 mm, too big upright).
export const STARTERS = [
  // A name along an in-the-hoop bookmark: cotton front, felt back, one thread, a ribbon hole. It lies across with the
  // hoop turned (`turn`), so the name reads straight and still uses the 7 in side (it stood on end until 2026-10-31,
  // hard to read). The letters' height is about 72 % of the inside height, as the old bookmark sized them; a long name
  // shrinks to fit its length.
  { id: "bookmark", name: "Bookmark", note: "in the hoop, with a ribbon hole", turn: true, make: () => [
    frame({ shape: "bookmark", w: 165, h: 50, border: "ith", hang: false, eyelet: true, color: RED }),
    text({ text: "~Ashley~", font: SACRAMENTO, size: 26, x: 8, color: RED })],
    // (a short one on the 4x4: everything scaled down left the name 15 mm, too small to stitch cleanly)
    small: () => [frame({ shape: "bookmark", w: 95, h: 40, border: "ith", hang: false, eyelet: true, color: RED }),
      text({ text: "~Ashley~", font: SACRAMENTO, size: 22, x: 7, color: RED })],
    tip: "Made in the hoop on tear-away stabilizer, cotton on the front and felt on the back. Full size needs the 5\" × 7\" hoop. Type ~ at either end of a name for a swash." },
  { id: "monogram", name: "Monogram", note: "3 initials in a frame", make: () => [frame({ shape: "circle", w: 90, h: 90, border: "satin" }), mono({ size: 23 })] },
  { id: "ring", name: "Name in a circle", note: "lettering around a ring", make: () => [
    frame({ shape: "circle", w: 92, h: 92, border: "bold" }),
    text({ text: "HANDMADE", font: PRINT, size: 9, shape: "up", radius: 33, color: RED }),
    text({ text: "WITH LOVE", font: PRINT, size: 7, shape: "down", radius: 36, color: RED }),
    mono({ letters: "A", size: 30, y: 2 })] },
  { id: "oval", name: "Oval badge", note: "words arched round an oval", make: () => [
    frame({ shape: "oval", w: 120, h: 84, border: "satin" }),
    // curves just inside the border (what "Follow the frame" gives with the fonts loaded)
    text({ text: "HANDMADE", font: PRINT, size: 9, shape: "up", radius: 45, ry: 27, color: RED }),
    text({ text: "WITH LOVE", font: PRINT, size: 7, shape: "down", radius: 54, ry: 36, color: RED }),
    text({ size: 24 })] },
  { id: "framed", name: "Name in a frame", note: "a name inside a border", make: () => [frame({ shape: "oval", w: 110, h: 64, border: "satin" }), text({ size: 24 })] },
  { id: "quilt", name: "Quilt label", note: "who it's for, who made it", make: () => [
    frame({ shape: "square", w: 110, h: 70, border: "line", color: BLACK }),
    // (Quicksand at 9 mm: Josefin's single-storey a sewed as an o at label sizes, its stem merged with the bowl, and
    // 8 mm warned "too small" out of the box)
    text({ text: "Made for", font: ROUND, size: 9, y: -23, color: BLACK }),
    text({ text: "Ashley", size: 24, y: -3, color: RED }),
    text({ text: "by Ashley in 2026", font: ROUND, size: 9, y: 19, color: BLACK })],
    tip: "Stitch it on cotton backed with tear-away stabilizer, then turn the edges under and hand-sew it to the back of the quilt." },
  { id: "bib", name: "Baby bib", note: "a name over a little heart", make: () => [
    frame({ shape: "heart", w: 46, h: 42, border: "applique", y: 14, color: PINK }),
    text({ text: "Ashley", font: BOLD, size: 15, shape: "up", radius: 32, y: 14, color: NAVY })],   // (30 ran into the heart's dip)
    // (a made bib can't be hooped: `float` is how step 1, Have ready and When it's done say it's done, whatever the
    // fabric; the tip said "press the bib onto sticky stabilizer" while step 1 said "Hoop the towel or fleece")
    float: { hoop: "Hoop sticky (self-adhesive) tear-away stabilizer on its own, paper side up. Score the paper inside the hoop, peel it off and press the bib onto the sticky side, smooth, where the design goes",
      ready: "Sticky (self-adhesive) tear-away stabilizer: a bib can't be hooped, so it's stuck on top of the hooped stabilizer.",
      after: "Take the hoop off, peel the bib off the stabilizer and snip any loose threads. Tear the stabilizer left on the back away gently.",
      fabric: "The bib is stuck onto sticky stabilizer, not hooped (see step 1)." },
    tip: "A bib is already made, so it isn't hooped: step 1 floats it on sticky stabilizer. On a terry bib, pick Towel / fleece under Sewing on." },
  { id: "towel", name: "Towel name", note: "a big name that stands up to terry", make: () => [text({ text: "Ashley", font: BOLD, size: 32, style: "satin" })], fabric: "towel", baste: true, turn: true },
  { id: "ornament", name: "Ornament", note: "two-sided, sewn in the hoop", make: () => [
    frame({ shape: "circle", w: 80, h: 80, border: "ith", hang: true, color: RED }),
    text({ text: "Ashley", font: BOLD, size: 20, y: -4 }),
    text({ text: "2026", font: PRINT, size: 8, y: 14 })],
    tip: "Made in the hoop, front and back, with a ribbon loop for hanging. Smaller (Fit to hoop or the size slider) makes a keychain." },
  { id: "mugrug", name: "Mug rug", note: "quilted, sewn in the hoop", make: () => [
    frame({ shape: "square", w: 120, h: 90, border: "ith", quilt: "stipple", hang: false, color: NAVY }),
    text({ text: "Tea time", size: 18, color: RED })],
    tip: "Made in the hoop: front fabric with thin batting under it, then backing." },
  { id: "coaster", name: "Coaster", note: "echo-quilted round a letter", make: () => [
    frame({ shape: "circle", w: 96, h: 96, border: "ith", quilt: "echo", hang: false, color: RED }),
    mono({ letters: "A", size: 34, color: NAVY })],
    tip: "Made in the hoop, front and back. Thin batting under the front fabric makes the echo lines puff up." },
  { id: "quiltblock", name: "Quilt block", note: "a stippled square with a heart", make: () => [
    frame({ shape: "square", w: 112, h: 112, border: "bold", quilt: "stipple", color: BLACK }),
    frame({ shape: "heart", w: 52, h: 48, border: "satin", color: RED })],
    tip: "Hoop the quilt sandwich (top, batting, backing) or float it on tear-away stabilizer. Stitch the blocks, then sew them together." },
  { id: "pouch", name: "Zipper pouch", note: "sewn in the hoop, turned through the zipper", make: () => [
    frame({ shape: "square", w: 110, h: 90, border: "zip", color: NAVY }),
    text({ text: "Makeup", size: 20, y: 14, color: RED })],   // (at 16 its a and e loops filled in)
    tip: "Medium-weight cotton or canvas works best. Use a nylon coil zipper (the needle can't hit metal teeth, so keep the zipper tab past the side while it sews)." },
  { id: "keyfob", name: "Key fob", note: "two-sided, with a ribbon loop", make: () => [
    frame({ shape: "square", w: 44, h: 80, border: "ith", hang: true, color: RED }),
    mono({ letters: "J", size: 30, y: 6, color: NAVY })],
    tip: "Like the ornament, with a loop of ribbon or webbing taped on before the back goes on. Felt or vinyl doesn't fray, so it can be cut right up to the satin stitches." },
  { id: "applique", name: "Appliqué", note: "a fabric shape with a name", make: () => [
    frame({ shape: "heart", w: 84, h: 76, border: "applique", y: -4 }), text({ size: 24, y: -4, color: NAVY })] },   // (18 at -6 ran into the lobes)
  { id: "initials", name: "Appliqué letters", note: "fabric letters with satin-stitched edges", make: () => [appl({ text: "AB", size: 60 })] },
  { id: "patch", name: "Patch", note: "a filled badge with an edge", make: () => [
    frame({ shape: "circle", w: 76, h: 76, border: "patch", fill: NAVY, color: RED }),
    mono({ letters: "JD", size: 26, font: PRINT, color: "#f0f0f0" })] },
  { id: "decorated", name: "Name with motifs", note: "a little heart either side", make: () => [text({ text: "Ashley", size: 24, deco: "heart", color: RED })], turn: true },
  { id: "words", name: "Just lettering", note: "a word or name on its own", make: () => [text({ size: 24 })] },
  // more of what people sew most (2026-10-31), then a few of our own
  { id: "tag", name: "Luggage tag", note: "two-sided, with a hole for the strap", make: () => [
    frame({ shape: "square", w: 60, h: 100, border: "ith", hang: false, eyelet: true, color: NAVY }),
    text({ text: "Ashley", font: BOLD, size: 16, y: 4, color: RED }),
    text({ text: "555-0123", font: ROUND, size: 8, y: 26, color: NAVY })],
    // (a little shorter on the 4x4, so it isn't shrunk: at 95 % its name's loops filled in)
    small: () => [frame({ shape: "square", w: 60, h: 92, border: "ith", hang: false, eyelet: true, color: NAVY }),
      text({ text: "Ashley", font: BOLD, size: 16, y: 4, color: RED }),
      text({ text: "555-0123", font: ROUND, size: 8, y: 26, color: NAVY })],
    tip: "Made in the hoop like the bookmark. Felt or vinyl on the back doesn't fray; a strip of clear vinyl over the front makes it wipe clean." },
  { id: "pocket", name: "Pocket monogram", note: "small initials for a shirt or polo", make: () => [mono({ letters: "jKm", font: PRINT, size: 20, color: NAVY })],
    fabric: "knit", tip: "Sew it on the left chest, about 7-9 in down from the shoulder seam. Hoop cut-away stabilizer with the shirt, and a water-soluble topper on piqué." },
  { id: "tote", name: "Tote bag", note: "two lines of words for a canvas bag", make: () => [text({ text: "Ashley's\nbooks", font: ROUND, size: 18, color: NAVY })], turn: true,
    fabric: "canvas", tip: "Turn the bag inside out to hoop the front panel only, with tear-away stabilizer behind it." },
  { id: "stocking", name: "Stocking cuff", note: "a name with swashes for the cuff", make: () => [text({ text: "~Ashley~", size: 28, color: WHITE })], turn: true,
    fabric: "felt", tip: "Sew the cuff before the stocking is put together, so it can be hooped flat. White on red felt reads from across the room." },
  { id: "birth", name: "Birth announcement", note: "name, date and weight for a keepsake", make: () => [
    // (`most`: the longest the frame gets from a one-tap fix or Fit to hoop, for the 6 in display hoop of the tip:
    // "Make the frame 106 mm" made it 149 mm tall)
    frame({ shape: "oval", w: 100, h: 140, border: "line", color: NAVY, most: 140 }),
    motif({ motif: "baby", size: 25, y: -40, color: PINK }),
    text({ text: "Ashley", size: 24, y: -6, color: NAVY }),
    text({ text: "June 1, 2026\n7 lb 2 oz · 20 in", font: ROUND, size: 7, y: 22, color: NAVY })],
    // (scaled to the 4x4 the baby was too small to fill and the date too small to stitch)
    small: () => [frame({ shape: "oval", w: 94, h: 94, border: "line", color: NAVY, most: 140 }),
      motif({ motif: "baby", size: 25, y: -26, color: PINK }),
      text({ text: "Ashley", size: 24, y: 0, color: NAVY }),
      text({ text: "June 1, 2026\n7 lb 2 oz · 20 in", font: ROUND, size: 7, y: 25, color: NAVY })],
    tip: "Pretty framed in a 6 in embroidery hoop on the wall. Cotton or linen with medium tear-away stabilizer." },
  { id: "wedding", name: "Wedding keepsake", note: "two names and the date in a scallop", make: () => [
    frame({ shape: "scallop", w: 120, h: 120, border: "satin", color: "#e8a900" }),
    text({ text: "Sam\n& Alex", size: 20, y: -12, leading: 115, color: NAVY }),
    text({ text: "06.20.2026", font: ROUND, size: 8, y: 30, color: NAVY })] },
  { id: "bookplate", name: "Book plate", note: "“from the library of”, for a book cover", make: () => [
    frame({ shape: "square", w: 96, h: 120, border: "line", color: BLACK }),
    text({ text: "from the library of", font: ROUND, size: 8, y: -36, color: BLACK }),
    text({ text: "Ashley", size: 24, y: -10, color: RED }),
    motif({ motif: "book", size: 25, y: 26, color: NAVY })],
    small: () => [frame({ shape: "square", w: 90, h: 94, border: "line", color: BLACK }),
      text({ text: "from the library of", font: ROUND, size: 8, y: -33, color: BLACK }),
      text({ text: "Ashley", size: 24, y: -10, color: RED }),
      motif({ motif: "book", size: 25, y: 22, color: NAVY })],
    tip: "Sew it on linen or cotton, then glue or stitch it inside a fabric book cover. Goes with the Bookmark." },
  { id: "pet", name: "Pet bandana", note: "a pet's name between two paws", make: () => [text({ text: "~Buddy~", size: 20, deco: "paw", color: NAVY })], turn: true,
    tip: "Sew it on one corner of a cotton square before it's folded into a bandana, with tear-away stabilizer." },
  { id: "kitchen", name: "Kitchen sign", note: "family name and a year", make: () => [
    frame({ shape: "oval", w: 120, h: 80, border: "bold", color: RED }),
    text({ text: "Grandma's\nKitchen", size: 16, y: -4, color: NAVY }),
    text({ text: "EST. 1968", font: ROUND, size: 6, y: 25, color: RED })],
    small: () => [frame({ shape: "oval", w: 94, h: 72, border: "bold", color: RED }),
      text({ text: "Grandma's\nKitchen", size: 16, y: -3, color: NAVY }),
      text({ text: "EST. 1968", font: ROUND, size: 6, y: 23, color: RED })],
    tip: "Good on a flour-sack tea towel (pick Cotton) or an apron." },
];
