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
  // (2.0 from S2, 2.5 before: the usual practice is a centre run under narrow columns and an edge run or zigzag from
  // about 2 mm, so the column's edges are held as well as its middle; a digitizer testing v27 asked for one under
  // Allura's 2.2 mm columns. A big script's column, which follows the ink's thick and thin, has it too now, as wide
  // as the column is there less 0.8: `stitchLetters`.)
  cotton: { zigzagFrom: 2.0, pull: 0, gap: 0.38, small: 0.34, open: 0 },
  towel: { zigzagFrom: 2.5, pull: 0, gap: 0.38, small: 0.34, open: 0 },   // (as it was: the lattice is its underlay)
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
// Clean shapes (core/regions.js `cleanShapes`), before a picture's stitches are planned (numbers: docs/pictures.md).
// `band` mm: a blend band's pixels within this of two sewn colours go to the one covering more of each (pieces up to
// twice it wide); `between`: a colour is a blend of two when its Lab distances to them add to under this times theirs;
// `side`: the second colour has this share of the band's edge at least. `fleck` mm²: pieces under it, `enclosed` of
// their edge on sewn colours, join the colour with body they touch most, unless of `dot` mm² or more and `contrast`
// ΔE00 to it. `smooth` mm: the edge blur's width (0.8 cost the held-out pictures 12 wasted moves); `thin` mm: narrower
// keeps its edges. `layer` mm: a hole or bay in a colour that only later colours fill, narrower than this, is sewn
// under them (digitize.js build).
export const SHAPES = { band: 0.5, between: 1.25, side: 0.2, fleck: 3, enclosed: 0.8, contrast: 25, dot: 0.3, smooth: 0.5, thin: 1, layer: 3 };
// Satin columns in a Filled picture (PX2, digitize.js; numbers: docs/pictures.md "Stitch types"). A shape whose usual
// width (twice the 90th percentile of the distance to its edge) is under `min` mm is a line (a triple run); from there
// up to `wide` mm across, and `small` mm² or more, it is a satin column along its centre line when it is a stroke (its
// area over its width squared at least `long`, and `plain`: under `short` of its centre lines' length in strokes
// shorter than `stub` widths, and its width away from the ends within `even` times from narrow to wide), or a dot (a
// compact shape whose area is `solid` of its convex hull or more). Any other shape is a fill, and a stroke growing
// out of a wider one (a stem from a leaf) is cut off it where a disc `wide` across no longer fits, sewn as a column
// reaching `into` mm into the fill. Each side is measured across the shape, at most `cap` times the distance to the
// edge at the centre line (a junction's other strokes), less half of `thread` (the satin's thread lies past its
// holes); a loose end stops where the column is under `tip` across. The columns must cover `cover` of the piece
// (a short arm thinning prunes as a spur would be left bare), else it is a fill. `pull`: the satin's own extra width (plus the
// fabric's, LETTERS).
export const COLUMNS = { min: 1.0, wide: 4, long: 2, into: 0.6, cap: 1.4, tip: 0.5, solid: 0.85, stub: 3, short: 0.2, even: 2.2, pull: 0.1, thread: 0.2, small: 3, cover: 0.9 };
export const PICTURES = { fleck: 3, enclosed: 0.8, eyes: 6, start: 4, edge: 0.75,
  details: { all: { start: 0, share: 0, lone: 0 }, most: { start: 7, share: 0.1, lone: 8 } } };

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

// --- S1: pieces sewn in one go ---
// Two pieces of script lettering are stitched across, not trimmed apart, when their columns are at most `gap` mm
// apart (each is its width and `pull` mm wide), the centre lines at most `most` mm apart, or the next starts under
// the last one's column (`under` past its half width). A link that short reads as the pen not lifting; a trim there
// is two locks and two thread ends on a hairline. A fine line: `line` (1.5 until S1, reckoned before an arch
// opened the gap: a Cookie "Sunday" 1.51 mm from its S once arched began 21 mm away).
// `far`, `open`: where the columns' own widths at the two points are known (`order` col), the centre lines may be half
// of each and `pull` and `open` apart, up to `far`: a wide script's hairlines keep `most`, its thick strokes don't.
// `open` is more than `gap` since a column's end is sewn out to the ink, past its centre line's (an Allura T at
// 20 mm: stem end to bar 3.08 mm by the centre lines, 0.63 mm between the stitches, and trimmed apart until S2).
export const LINK = { gap: 0.5, pull: 0.3, most: 2.2, under: 0.3, line: 1.8, far: 3.6, open: 0.9 };

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
// A drawn shape's fill rows (core/fill.js `fillPolygon`): needle points `stitch` mm apart along a row; a stitch over
// `loose` mm (a row's short remainder merged into its last stitch) is halved, since one that long lies loose on top.
export const TATAMI = { stitch: 3.5, loose: 4 };

// --- PX3: fill direction that follows the form (core/fill.js `formAngle`; docs/stitch-model.md) ---
//   least, picture: a part under this many mm² keeps the caller's angle; a picture's part under `picture`: on the
//           picture corpus, letters and doodles at 60 mm turned to their own angles gained trims and loose threads
//           (13 cases: from 4 mm² +10 trims and +6 loose, from 30 the same, from 100 +2 and -2)
//   ragged: rows meet an edge at a grazing angle between lo and hi degrees (from none at 0 and to none at hi + fade,
//           evenly): each row end steps spacing / sin(angle) along the edge, 1 to 5 mm at 0.35 mm rows, a saw-tooth one
//           sees; at 0 a row lies along the edge
//   even:   the traced outline is evened over this many mm before it is measured (the drawing's steps)
//   blur, step: the edge histogram's smoothing either side, and the sweep's step (degrees)
//   rag, sec: the weight of a fully ragged outline and of each section more than the fewest, against row ends (1 =
//           as many again as the fewest any angle gives)
//   keep:   the caller's angle stays unless another scores this much better (a near tie isn't worth losing the
//           neighbouring colours' alternation)
//   cell, blurMax, iters: curved rows' grid (mm), the most cells the direction is smoothed over, and the solver's
//           most steps
//   turns:  share of neighbouring cells whose directions can't be given one sign before the field is a singularity
//   stretch: curved rows may lie up to this many times their spacing apart where the field spreads (never closer)
//   hug, hugW: within hug mm of the edge the field's fit counts up to hugW times (the rows lie along the edge)
//   curvedLeast, curve: curved rows are tried on parts of this many mm² or more, and sewn where they score this much
//           better than the best straight angle
//   gap:    a curved row that leaves the part for up to this many mm (along an edge it grazes) is sewn as one
export const FORM = { least: 4, picture: 100, ragged: [4, 25, 20], blur: 4, step: 5, rag: 1, sec: 1.5, keep: 0.1, cell: 0.5, blurMax: 24, blurK: 1.0, iters: 600, turns: 0.002, stretch: 1.3, gap: 1, hug: 1, hugW: 4, curvedLeast: 30, curve: 0.15, even: 1.6 };

// --- Z1a: a piece's own fill settings (studio/settings.js; docs/design-tab.md "Stitch settings") ---
// What a person (or a saved file, or an agent) may set, clamped so no setting can break a rule of AGENTS.md. Each is
// [least, most, the editor's step].
//   angle:   the rows' direction, degrees, 0 across and 90 up and down; 30 and 210 are one fill, so it is kept in
//            (-90, 90]. Any angle sews: the travel router and the scrap rule work at every angle.
//   spacing: rows apart (mm). Never closer than ROWS.solid: at 0.3 the step from one row to the next is the checker's
//            tiny stitch (and 24 hits per mm² comes nearer at every row end along an edge). 0.8, twice the
//            standard rows, still reads as a light fill; further the fabric shows between rows.
//   length:  stitch length along a row (mm). From 1.5 (shorter crowds the row ends, where every row puts two hits)
//            to TATAMI.loose: longer is halved anyway (a loose stitch lying on top).
//   pull:    how far each row runs past its outline at both ends (mm; FILLS' pull). 0.6 is towel's 0.4 and a half
//            again, still well under the satin every drawn fill's row ends lie under (a motif's reaches 1.3 mm past
//            its rows' ends, a patch's 2.8).
// underlay: "both" (the edge run and the rows across, as unset), "rows", "edge", "none".
export const FILL_SET = { angle: [-90, 90, 1], spacing: [ROWS.solid, 0.8, 0.05], length: [1.5, TATAMI.loose, 0.1], pull: [0, 0.6, 0.05] };
export const UNDERLAYS = ["both", "rows", "edge", "none"];

// --- S1b: locks ---
// A tie-in's length (mm), first that keeps clear of the run's own next points: 0.7 is the middle of what sold
// designs use (0.5-0.8; shorter can pull out before the bobbin thread catches), 0.5 and 0.8 its ends.
export const TIE_INS = [0.7, 0.5, 0.8];

// --- S2: density at the source ---
// A piece's stitches give way where the thread already sewn in this colour is thick, as they are built (`Design`),
// so the limit is kept by where the needle goes and not by taking stitches out afterwards (`relieve`, now the guard).
//   cap:    the most hits a 1 mm window may hold once a stitch that can give way is added. Under LIMITS.hits by a
//           lock's four, which are added after and never moved.
//   back:   a satin's end stops this far (mm) short of its edge, first that fits, and never more than `deep` of
//           the way across (a digitizer's short stitches on the inside of a turn and where columns meet: the outer
//           edge keeps every stitch). From 0.8: nearer, the hit is still in the windows that were full. Taken in
//           turn through a fan (`fan`): with two lengths a 4 mm border's corner filled both and the rest of the
//           fan was left out, a slit beside the pivot.
//   show:   the widest gap (mm) a short stitch may leave between its neighbours: under a thread's width (0.4)
//   slack:  in a fan a stitch goes whole, or short, up to this many over `cap` before one is left out: 23, one
//           under the limit (a lock on that spot is then thinned by `relieve`)
//   merge:  two stitches of a run or an underlay become one up to this long (mm), where the point between them lies
//           within `stray` mm of the straight line (a curve keeps its points)
//   least:  no stitch made shorter than this (mm)
//   most:   nor longer (mm) by leaving points out of a satin
//   fan:    from this many of a run's own turns within a 1 mm window, which of them come short is spread evenly
//   hair:   a point nearer than this (mm) to the last one kept is left out (the checker's tiny stitch is 0.3)
//   cut:    a corner, or one of two points a hair apart, is left out where the stitch past it runs within this (mm)
//           of where it was
// 19: a tie-off's four hits after it still leave the window under the limit (20 left 92 files at 24 exactly).
export const EASE = { cap: 19, back: [0.8, 1.5, 2.2, 3], deep: 0.65, show: 0.3, slack: 4, merge: 3, stray: 0.15, least: 0.5, most: 4, cut: 0.6, hair: 0.35, fan: 6 };

// A lock's one hit aside (0.35 mm, toward the stitches it locks) needs stitches to lie under: where the points it
// would lie beside are all within `line` mm of one line, a single thread, it goes on that line instead, `past` mm
// beyond the lock's own far hit (0.45: no stitch of the lock is then under 0.4 mm; halfway between its two hits made
// two of 0.35, which the file rounds to the checker's tiny 0.3).
export const LOCKS = { line: 0.25, past: 0.45 };

// --- N2: fills, borders and quilting ---
// A patch's satin edge (BORDERS.edge: 4 mm wide, its middle 0.2 mm inside the outline) reaches 2.2 mm in; the fill
// stops 1 mm in, so the fill's outer 1.2 mm lies under the satin. Travel within `cover` of the fill's edge is hidden.
export const PATCH = { cover: 1.0 };
// Straight-line quilting (studio/quilt.js `lines`): lines `stripes` mm apart, or two sets `cross` mm apart at right
// angles, at `angle` degrees so no line runs along the weave. A hand quilter's crosshatch is 1/2 to 1 in apart on a
// bed quilt; in a 4 to 5 in block 8 to 10 mm still reads as a pattern and holds thin batting everywhere (the stipple
// here is 5 mm apart, the echo 4). Stitches up to `stitch` mm, as the other quilting; no stretch under `min` mm,
// and none that stays within `sliver` mm of the frame line all its way (it read as a second, crooked border).
export const QUILT_LINES = { stripes: 8, cross: 10, angle: 45, stitch: 2.5, min: 4, sliver: 3 };
// A fill in rings (core/fill.js `ringFill`): the first ring `first` mm inside the outline (half a thread: the
// stitches lie along the edge, so nothing pulls short and there is no pull to add), the rest a row's spacing apart;
// stitches up to `stitch` mm, shorter wherever a stitch would leave the ring's line by `off` mm (a third of a
// thread: corners and small rings keep their shape); each ring sewn `lap` mm past its
// start; no ring under `least` mm round (the middle: a ring that small is three hits in one spot).
export const CONTOUR = { first: 0.2, stitch: 3, lap: 1.5, least: 4, off: 0.12 };
// Borders with a shape to them (studio/borders.js). blanket: a home machine's blanket stitch for appliqué is 2.5 to
// 3.5 mm long and wide (Brother's and Bernina's appliqué guides): 3 and 3. scallop: 7 mm each, 2.2 high, six stitches
// to a scallop (1.4 to 1.6 mm: round, none short). diamond: 5 mm each, 1.6 either side of the line (stitches 3 mm).
export const BORDER_RUNS = { blanket: { step: 3, bite: 3 }, scallop: { unit: 7, rise: 2.2, per: 6 }, diamond: { unit: 5, half: 1.6 } };
