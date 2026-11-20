/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The numbers the page itself reads: what the machine and the checker allow, and what a picture is asked and told.
// Both builds ship this file (docs/roadmap.md "The paid version"); every other stitch number is in recipes.js, which
// hands these on, so a builder still reads them there.

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

// Working pixels per mm: a picture is drawn this fine before it is traced (5 lost the narrow notches of small
// lettering, such as an M).
export const RES = 8;

// Fill rows (mm apart, one pass of thread each). Sold designs lie 0.18-0.20 mm apart (docs/roadmap.md): the
// published "0.38-0.40 mm" tatami spacing is from one forward row to the next forward row, two passes of thread, and
// was read here as one until 2026-11 (0.35 and 0.4: half the thread, and the fabric showed through every fill sewn
// on a dark sweatshirt). Rows this close turn as a zigzag (`TATAMI.turn`), so no row link is a tiny stitch.
export const ROWS = { solid: 0.2, standard: 0.25 };

// Art that stitches well (PX6: the Picture tab's guide for making a picture, and its check of a picture; core/artcheck.js,
// docs/pictures.md). What a picture needs, measured at the size it is sewn, from the digitizer's own rules:
//   line:    mm. A line or part narrower than this gets no fill: it is sewn as one running line along its centre,
//            thinner than drawn (digitize.js: "lines under 1 mm sew a triple run"; Ink/Stitch's satin columns from 1 mm).
//   detail, dot: a separate piece under `dot` mm² and under `detail` mm across is a speck: left out, or sewn in the
//            colour round it (digitize.js's specks and flecks: 4 mm² and 2.5 mm).
//   gap:     mm. Gaps between parts of one colour narrower than this close up once sewn (digitize.js `MIN_GAP`).
//   text:    mm tall. Lettering in a picture is sewn as filled shapes; a bold letter's strokes are about a sixth of its
//            height, so under 6 mm they fall under `line` and its holes under `gap`. (Typed lettering in Design your
//            own is sewn as lettering, from 4 mm: docs/lettering.md.)
//   fewest:  thread colours a picture is asked for in the guide: 4 to digitize.js `MOST` (the Thread colours slider's
//            top). Fewer than 4 flattens most illustrations; each one more is a thread change.
//   blend:   share of a picture's ink in smooth colour ramps (gradients) over which they are said: they sew as bands.
//   page:    share of the picture's edge one colour must hold for the background to be plain (found and left
//            unsewn); under it the background is busy and sewn as part of the design.
//   ask:     the guide's prompt asks for lines and details this many times the least, as shares of the picture: it
//            is worked out for the hoop filled, and art is often sewn at half that; an AI tool's "thick" also varies.
export const ART = { line: 1, detail: 2.5, dot: 4, gap: 0.5, text: 6, fewest: 4, blend: 0.12, page: 0.8, ask: 2 };

// The style a fresh picture starts in (artcheck.js `chooseStyle`, docs/pictures.md "Style chosen per picture"):
//   line: share of the ink in thin strokes for a line drawing. Line art 0.92-1, etsy_7's doodle sheet 0.60; filled
//         pictures 0.44 at most (etsy_3's flower sheet), logos and lettering under 0.4.
//   wide: a thin stroke's width, as a share of the picture's longer side (1.6 %: 13 px of 800). A regular-weight
//         wordmark's strokes are 2-2.5 %, line art's 1-1.5 %.
//   inks: colours (artPicture's) a line drawing is drawn in, at most. Photos of embroidered wildflower sheets are as
//         thin (0.58-0.73) in 8-13 colours, and a person sews them Filled.
export const STYLE = { line: 0.55, wide: 0.016, inks: 4 };
