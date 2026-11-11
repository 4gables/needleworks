/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Every number a stitch is made or judged by, in one place, each with its reason. Builders and checks read these;
// none re-types one. (Until 2026-11 the same limit was typed into six files: the 24 in design.js, quality.js,
// render.js and doctor.js, the 0.3 mm in seven places.) tests/pe900_check.py keeps its own copies on purpose: it is
// the outside check and shares nothing with the app.

// What the machine and the checker allow.
export const LIMITS = {
  hits: 24,       // needle hits in any 1 mm square of one colour block, at any 0.1 mm grid offset: the densest spot in sold designs
  tiny: 3,        // 0.1 mm: a stitch this short or shorter piles thread (Ink/Stitch's minimum stitch length)
  longest: 121,   // 0.1 mm: 12.1 mm, the longest needle move the machine makes in one stitch
  blocks: 99,     // colour blocks the PE900 steps through in one design
  recentre: 200,  // mm from the centre: past it a design is moved onto the centre (a PES box holds 204.8 mm)
};

// Moves between parts (mm). The PE900 never trims a jump at or under its "jump stitch not to trim" setting, 5 mm at
// the lowest (manual p.38): a 2-5 mm move is a loose thread to snip by hand, which is worse than a trim.
export const MOVES = {
  sewn: 2,        // up to this a move is simply stitched (Design.path)
  trimmed: 5,     // over this the machine cuts the thread itself
  looseFrom: 1,   // a jump from this to `trimmed` is counted as a loose thread (shortJumps, pe900_check)
  costLoose: 1.5, // against 1 for a trim and 0 for a sewn move (geom.js moveCost)
};

// Thread weight: Automatic is 40 wt with lettering under a 6 mm x-height sewn for 60 wt. 30 wt is about 1.3x as thick
// as 40 (satins 15 % more open, fills 0.05 mm); 60 wt about 0.75x (satins 12 % closer; fills stay, 0.3 mm rows fail
// the tiny-stitch check).
export const WEIGHTS = {
  auto: { letterSatin: null, satin: 1, fill: 0 },
  30: { letterSatin: 0.45, satin: 1.15, fill: 0.05 },
  40: { letterSatin: 0.38, satin: 1, fill: 0 },
  60: { letterSatin: 0.34, satin: 0.88, fill: 0 },
};
// a satin's same-edge gap and a fill's row spacing for a thread weight (to 0.001 mm, as the files were always made)
export const satinFor = (wt, gap) => { const k = (WEIGHTS[wt] || WEIGHTS.auto).satin; return k === 1 ? gap : +(gap * k).toFixed(3); };
export const fillFor = (wt, rows) => rows + (WEIGHTS[wt] || WEIGHTS.auto).fill;

// Lettering satins by fabric. Knit: a zigzag underlay under thinner columns too (the fabric moves under a centre
// run), 0.15 mm more pull a side and a slightly open satin (piqué and jersey pull in and pucker under a dense one).
// Towel lettering has its knockdown lattice underneath instead (a zigzag on top of it took the name to 24 hits per
// mm²). Cotton, felt, denim and canvas sew alike.
//   zigzagFrom: column width (mm) from which the way out under a column is a zigzag, not a centre run
//   pull:       extra total width (mm) on top of the column's own pull
//   gap:        same-edge satin gap on Automatic; `small` (x-height under 6 mm, sewn for 60 wt) closer to cover
//   open:       added to a chosen thread weight's gap
export const LETTERS = {
  cotton: { zigzagFrom: 2.5, pull: 0, gap: 0.38, small: 0.34, open: 0 },
  knit: { zigzagFrom: 1.5, pull: 0.3, gap: 0.42, small: 0.42, open: 0.04 },
};
export function letterRecipe(fabric, wt, small) {
  const f = LETTERS[fabric] || LETTERS.cotton, w = (WEIGHTS[wt] || WEIGHTS.auto).letterSatin;
  return { zigzagFrom: f.zigzagFrom, pull: f.pull, gap: w === null ? (small ? f.small : f.gap) : w + f.open };
}

// Satin borders: an edge walk 0.4 mm inside each edge, a zigzag, then the satin (Ink/Stitch's contour underlay; a
// firm edge on felt). `edge` is the appliqué, patch and in-the-hoop border: 4 mm at 0.34, centred 0.2 mm inside the
// line (fabric showed through and frayed past 3.6 mm at 0.4 on a real bookmark). `frame` is the plain Satin border.
//   width, gap (same edge), pull (total), inset (of the centre line), zigzag [width, spacing]
export const BORDERS = {
  edge: { width: 4.0, gap: 0.34, pull: 0.3, inset: 0.2, zigzag: [3.0, 2.0] },
  frame: { width: 3.0, gap: 0.4, pull: 0.3, inset: 0, zigzag: [2.1, 2.0] },
};

// Fill rows (mm apart). 0.3 fails the tiny-stitch check (row links under 0.3 mm).
export const ROWS = { solid: 0.35, standard: 0.4 };

// Pictures (Filled): what is made sewable before any stitch is planned (docs/pictures.md).
//   fleck:    a piece of one colour this small (mm²), or a dot (see digitize.js), lying inside other sewn colours ...
//   enclosed: ... along this share of its edge, takes the colour round it. Left out it was a hole in that colour's fill
//             (the rows split round it: more sections, travel and trims); sewn it was a trim, two locks and no shape.
//   eyes:     up to this many such pieces in one colour are meant (an eye, a nostril) and stay; more are a texture.
//   start:    a separate start (trim, tie-in, tie-off: 2.8 mm of thread in locks) must sew at least this much (mm).
//   edge:     travel inside a fill may run this far (mm) inside the shape's own edge over finished rows (fill.js).
//   details:  the Picture panel's Small details choice (digitize.js): "most" unless the person keeps them all. A
//             piece of a colour that needs a start of its own is left out when it would sew under `start` mm of
//             thread and under `share` of its colour's biggest piece; so is one that only a jump reaches and that
//             sews under `lone` mm. "all" leaves nothing out (v26).
export const PICTURES = { fleck: 3, enclosed: 0.8, eyes: 6, start: 4, edge: 0.75,
  details: { all: { start: 0, share: 0, lone: 0 }, most: { start: 7, share: 0.1, lone: 8 } } };

// --- S1: pieces sewn in one go ---
// Two pieces of script lettering are stitched across, not trimmed apart, when their columns are at most `gap` mm
// apart (each is its width and `pull` mm wide), the centre lines at most `most` mm apart, or the next starts under
// the last one's column (`under` past its half width). A link that short reads as the pen not lifting; a trim there
// is two locks and two thread ends on a hairline. A fine line: `line` (1.5 until S1, reckoned before an arch
// opened the gap: a Cookie "Sunday" 1.51 mm from its S once arched began 21 mm away).
export const LINK = { gap: 0.5, pull: 0.3, most: 2.2, under: 0.3, line: 1.8 };

// Fills by fabric. `pull`: how far each row runs past the outline at both ends, since the stitches draw the fabric in
// along their length and the row ends up short (Wilcom's published pull compensation: 0.20 mm on cotton and drill,
// 0.35 on T-shirt knit, 0.40 on fleece; 0.15 everywhere until 2026-11). `rows`: knit takes the standard spacing (a
// dense fill puckers jersey and piqué). Every fill's row ends lie under a satin (a patch's or motif's edge, the
// lettering sewn on it), so the pull decides how far under. A patch takes felt's pull whatever the design is sewn on
// (it is sewn on its own fabric); only its rows follow the design's fabric.
export const FILLS = {
  cotton: { pull: 0.2, rows: ROWS.solid },
  felt: { pull: 0.2, rows: ROWS.solid },
  denim: { pull: 0.2, rows: ROWS.solid },
  canvas: { pull: 0.2, rows: ROWS.solid },
  knit: { pull: 0.35, rows: ROWS.standard },
  towel: { pull: 0.4, rows: ROWS.solid },
};
export const fillRecipe = (fabric) => FILLS[fabric] || FILLS.cotton;

// --- S1b: locks ---
// A tie-in's length (mm), first that keeps clear of the run's own next points: 0.7 is the middle of what sold
// designs use (0.5-0.8; shorter can pull out before the bobbin thread catches), 0.5 and 0.8 its ends.
export const TIE_INS = [0.7, 0.5, 0.8];
