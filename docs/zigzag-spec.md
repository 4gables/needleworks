# ZigZag: a functional specification (clean room, step 1)

Written 2026-11-13 by an agent that read ZigZag's source (Rust, Apache-2.0, release 0.1.2, commit `7fdb49f`), for
an agent that will never see it. It describes behaviour, numbers and formulas only, in this document's own words
and structure: no code of theirs, no wording of theirs. The implementer works from this file and from our own code
and docs, in our own structure, and proves the result with the test cases given here (`AGENTS.md`, "Clean room").

- Every idea is credited where it is described: "(ZigZag's …)", or "(Ink/Stitch's …)" where ZigZag itself credits
  Ink/Stitch.
- All lengths are in mm (ZigZag works in 0.1 mm units inside; every number here is already converted). The y axis
  points down, as in SVG and in our stitches. Angles are in degrees.
- "Ours wins" marks a place where their behaviour breaks a hard rule of `AGENTS.md`. Those rules are not up for
  change by this spec.

## 0. Scope

| Round | Feature | In this file |
|---|---|---|
| Z1 | Per-object stitch settings, start and end points, trim and stop, connect gaps, fabric presets | section 1 |
| Z2 | SVG import, remove overlaps, sewing order, colour grouping | section 2 |
| Z3 | Stitch types we lack or half have | section 3 |
| Z4 | Test swatches | section 4 |
| A1 | The agent surface (interface only) | section 5 |

Out of scope, one line each:
- Their file writers (PES, PEC, DST, EXP, JEF, VP3): we have our own PES writer, locked.
- Skitch Bluetooth and the PEN stream: a machine we don't serve.
- The AI agent panel inside their editor: not planned here (`docs/roadmap.md`, "Not planned").
- Illustrator-style pen, anchor, brush, pathfinder, round-corner and simplify tools: a drawing program, not ours.
- Also not specified: image tracing (we have pictures), their lettering engine (we have ours), blanket stitch and
  appliqué (we have both), the worksheet (we have the sew sheet), the density map (ours is `density.js`).

### Their model in five lines
- A design is a list of **objects** in sewing order. Each object is either a **filled shape** (closed rings with a
  fill rule) or a **stroke** (open or closed lines with a width), has one thread colour and one set of settings.
- Each object is turned into **pieces** (polylines of needle points) in **groups**. Groups keep their order
  (underlay before top); inside a group the planner may reorder pieces and sew a piece from either end.
- The planner chains pieces into **runs**. Between two runs of one colour the thread is cut; inside a run it isn't.
- Runs of one thread, one after another, are a **colour block**. A stop also starts a new block in the same thread.
- A setting an object doesn't have falls back to the document's **fabric preset**, then to a fixed default.

### Where ours wins over the whole of their planner
| Their behaviour | Our rule | Consequence for an implementer |
|---|---|---|
| The planner adds no locks. Their file stage adds, at each run start, before each cut, colour change and the end, four hits 0.4 mm out and back twice along the stitch direction | Every cut is locked by `Design.tieOff()` and tie-ins (0.7 mm, one hit 0.35 mm aside, never three hits in a hole) | Take nothing of their locks. Every run this spec produces goes through `Design.path`/`tieOff` |
| A gap up to 1.0 mm is always stitched across; anything longer is cut or routed | `MOVES`: up to 2 mm is stitched, 2-5 mm is a loose thread (counted, cost 1.5), over 5 mm the machine trims | Keep `MOVES` and `moveCost`. Their 1.0 mm figure is not adopted |
| "Connect" stitches across open cloth up to N mm (default 0, up to 50) | Short jumps are not sewn as connectors; loose threads are counted | See 1.6: the hidden-travel part is welcome, the open-cloth part is opt-in at most and never a default |
| Shortest stitch kept: 0.1 mm. Default fill rows 0.25 mm apart, joined end to end | Tiny stitches (0.3 mm or less) over 2 % fail the checker | Row links stay as `fill.js` makes them; a user-set spacing under about 0.32 mm needs the link handled, not a 0.25 mm stitch |
| No density limit while building. Their density view counts hits in 1 mm cells averaged over the 3 x 3 neighbours and tints from 2.5 (yellow) to 4 (red) per mm² | 24 hits per 1 mm square per colour block at every 0.1 mm offset, kept at the source (`EASE`) | Every new stitch type is built with easing on and checked by `quality.js`; tartan and multicolour satin (section 3) are the ones at risk |
| Satin width may be set to 15 mm with auto-split off | Longest stitch 12.1 mm; writer splits over 7 mm | A satin setting never produces a stitch over 7 mm without a split point |
| Thread colour is the SVG's RGB as is; nearest chart thread (CIEDE2000) is only a label | Threads come from `machineThreads()` (PEC palette less 62-64, red-mean distance, two colours never one thread) | Import maps colours our way (2.5) |
| A design is warned about when its box is over the hoop's field (no margin) | Field less 2 mm, refused by `validatePES` | Ours |

---

## 1. Z1: per-object stitch settings

### 1.0 What we have today
- No per-object stitch settings. A piece has a kind and a few look choices (`pieces.js` piece shapes: text `style`,
  frame `border`/`fill`/`quilt`, motif `style`/`pattern`). Density, pull, underlay and stitch length come from
  `recipes.js` (`FILLS`, `LETTERS`, `BORDERS`, `ROWS`, `WEIGHTS`) by the design's fabric and thread weight through
  the sew context (`sewAs`). Fills are always at 45° (`fill.js` `FILL.angle`; pictures alternate).
- Entry and exit are chosen by each builder and the S1 work (`docs/roadmap.md` S1; `geom.js` `enter`, `rings`,
  `moveCost`; `fill.js` `routeFill`). The user can't set either. No per-piece trim or pause; pauses come from
  stages (appliqué, in-the-hoop).
- Asked for by the expert tester of v27 (`docs/roadmap.md` U1): "per-piece density, underlay and pull; entry and
  exit points; trim-or-connect for small text". The cycle-2 review: "every fill is at 45°", "36 % of wide print
  columns have no underlay", "the inside of satin curves crowds".
- Gap: a settings record per piece with fabric fallbacks, the builders reading it, the editor showing it, the saved
  design carrying it, and a start/end point per piece honoured by the sequencer.

### 1.1 The settings record and its fallbacks (ZigZag's params)
Every field is optional. Unset means "use the fabric preset, else the fixed default". "Reset to defaults" clears
every field but the stitch type. Copy/paste of settings carries the type and all fields except the thread and the
start/end points.

| Field | Applies to | Unset means | Panel range (step) | Hard clamp when set by tool or file |
|---|---|---|---|---|
| Stitch type | all | fill for a filled shape; satin or run for a stroke (2.3) | buttons | see the allowed list below |
| Fill angle | fill, tartan | 0° | -90 to 90 (1°) | normalised into (-90, 90] |
| Spacing | fill, satin, contour, ripple, meander, blanket, tartan, appliqué cover | per type, below | per type, below | 0.1 to 2.0; never under 0.05 inside a builder |
| Stitch length | fill, run, contour, ripple, meander, tartan | fabric | per type, below | 0.5 to 10; never under 0.3 inside a builder |
| Pull compensation (per side) | fill, satin | fabric | 0 to 0.6 (0.05) | 0 to 1.0 |
| Underlay on/off | fill, satin, appliqué cover | on | checkbox | |
| Satin underlay kinds | satin | automatic by width (1.3) | Automatic + three checkboxes | any subset of centre, contour, zigzag |
| Width | satin on a stroke or border, blanket prong, appliqué cover | stroke width; 2.0 for a border; 2.5 blanket; 3.0 appliqué | satin 0.6 to 10 (0.1) | 0.3 to 15 |
| Border | satin on a filled shape | off (column across the shape) | Column / Border | |
| Short stitches | satin | on | checkbox | |
| Auto-split length | satin | 7.0 | checkbox + 3 to 12 (0.1) | 0 = off; any other value under 3 is raised to 3 |
| Top-stitch style | satin | plain | Satin / S-stitch / Zig-zag | |
| Threads across | satin | one | up to 4 swatches | 2 or more colours make it multicolour |
| Passes | run | 1 | Single / Triple | 1 to 9 |
| Spiral | contour, ripple | off (rings) | Rings / Spiral | |
| Cell | cross-stitch | 2.5 | 1 to 8 (0.1) | at least 1.0 |
| Sett | tartan | two stripes (3.7) | up to 8 stripes, 0.5 to 30 each | widths over 0 |
| Thread colour | all | the artwork's paint | swatch | |
| Start, End | all but skip | planner chooses | click on the outline | 0 to 1 along the outline, wraps |
| Trim after, Stop after | all but skip | off | checkboxes | |

Stitch types allowed: a filled shape may be fill, satin, run, contour, blanket, appliqué, meander, ripple,
cross-stitch, tartan, manual or skip; a stroke may be satin, run, blanket, manual or skip. Asking for another is
refused with the list.

Spacing, length and their panel ranges by type:

| Type | Spacing default | Spacing range (step) | Length default | Length range (step) |
|---|---|---|---|---|
| Fill | fabric fill spacing | 0.15 to 0.8 (0.01) | fabric fill length | 1.5 to 7.0 (0.1) |
| Satin ("Density") | fabric satin spacing x auto factor | 0.2 to 1.0 (0.01) | | |
| Run | | | fabric run length | 1.0 to 5.0 (0.1) |
| Contour | 0.45 | 0.25 to 1.5 (0.05); builder floor 0.2 | fabric run length | 1.0 to 5.0 (0.1) |
| Ripple | 2.5 | 0.5 to 6.0 (0.1); builder floor 0.5 | fabric run length | 1.0 to 5.0 |
| Meander | 3.0 | 1.0 to 8.0 (0.1); builder floor 1.0 | fabric run length | 1.0 to 5.0 |
| Blanket | 2.5 (prong spacing) | 1.0 to 6.0 (0.1) | | |
| Tartan | fabric fill spacing | 0.2 to 0.8 (0.01) | fabric fill length | |
| Appliqué cover | fabric satin spacing x auto factor | 0.2 to 1.0 | | |

### 1.2 Fill (ZigZag's tatami, after Ink/Stitch's scanline fill)

**Behaviour.** Straight rows at the object's angle. 0° is horizontal rows, 90° vertical; a positive angle turns the
rows clockwise on screen (the row direction is (cos a, sin a) with y down). 30° and 210° are the same fill, so an
angle is stored in (-90, 90]. Moving, scaling and rotating an object turns its angle with it.

**The angle tool (ZigZag's Fill Angle tool).** With a fill selected (or, with none selected, the fill under the
pointer when the drag starts), drag anywhere on the canvas: once the drag is over 8 screen pixels long, the angle
is the direction of the drag (from press to pointer, screen coordinates, y down), normalised as above and rounded
to a whole degree; with Shift held it is rounded to the nearest 15°. The canvas shows the drag as an arrow with the
angle beside it, and the stitches re-plan live. One drag is one undo step. While the tool is on, a selected fill
shows a double-headed line through the centre of its bounding box along its row direction, its half-length 30 % of
the box's diagonal (kept between 24 and 160 screen pixels). Escape leaves the tool. The panel has the same value as
a slider plus a number field and a "Draw" button that switches to the tool.

**Algorithm.**
1. *Row lines on one grid for the whole design.* With u = x cos a + y sin a (along the rows) and
   v = -x sin a + y cos a (across them), row k lies at v = (k + 0.5) x spacing, for every integer k whose line
   crosses the shape. The grid is anchored at the design's origin, not at the shape, so two shapes with the same
   angle and spacing have rows that line up.
2. *Row intervals.* Each row line is cut by the shape's edges under its fill rule (non-zero or even-odd), giving
   inside intervals [ua, ub]. Each end is then moved by `pull - inset`: outward by the pull compensation for a top
   layer, inward by the inset for an underlay. An interval left shorter than max(spacing / 2, 0.3) is dropped.
3. *Sections.* Going row by row (top to bottom in v; bottom to top when cap order is on, 2.7), an interval joins an
   open section when (a) it overlaps the last interval of exactly one open section, (b) no other interval of this
   row overlaps that same section, and (c) the straight link from the section's current end to the new row's
   matching end stays inside the shape. The link is tested at its quarter, half and three-quarter points, the two
   ends first nudged inward along their rows by the smallest of 0.1, a quarter of the last row's length and a
   quarter of the new row's. Otherwise the interval opens a new section. A row with no interval closes every open
   section. (Result: a shape split by a hole gives four sections: above, left, right, below.)
4. *Needle points in a section.* Rows alternate direction; the first runs from ua to ub. Along a row the points sit
   on a lattice shared by the whole design: u = offset + m x length, where offset = (k mod stagger) x length /
   stagger and k is the row's grid number. The top layer uses stagger 4 (quarter steps, the classic tatami);
   underlay uses stagger 1. Lattice points nearer than min(length / 4, 0.5) to either row end are left out. Each
   row is its start, the lattice points, its end.
5. *Between rows of a section*: a straight stitch from one row's end to the next row's start, cut evenly if longer
   than the stitch length. Any other stitch that comes out longer than the stitch length (a row's first or last)
   is cut evenly too.
6. Each section is one piece that may be sewn from either end (the reverse is last row first, every row reversed).

**Underlay** (one on/off; what it contains depends on the fabric, 1.8). In this order, each a group of its own:
1. *Edge walk*, only on fabrics that have it: the outline moved 0.5 inside (mitred corners), each resulting ring
   with more than 1 mm² of area sewn once as a run of 2.0 mm stitches. A piece that may start at either end.
2. *Crossing rows*: the same row algorithm at angle + 90°, spacing = the fabric's underlay spacing, stitch length
   3.0, inset 0.4 from the outline, no pull, stagger 1.
3. Then the top layer: the object's angle, spacing, length and pull, inset 0.

**A fill in separate parts (ZigZag 0.1.2).** When the outline (after overlap removal, 2.6) falls into two or more
unconnected parts, each part's edge walk, crossing rows and top are sewn together before the next part, and the
next part is the one a piece of whose first group starts (from either end) nearest the needle. This applies only
when the object has no start or end point; with one, the groups are sewn whole, one after another.

**Ours wins / notes.**
- Our fills already do exact rows off the outline, an edge-run underlay, pull by fabric and sections in row order
  (`docs/stitch-model.md`). What is new here: the angle per object, the design-wide grid (rows of neighbours line
  up), spacing/length/pull per object, the part-by-part order, and the angle tool.
- Their default cotton pull is 0 and their default rows 0.25 mm; ours are 0.20 and 0.35 with reasons recorded.
  Keep ours as the "unset" values; adopt only the ability to set them.
- Their scraps rule is cruder (rows under max(spacing/2, 0.3) dropped); keep ours.

**Test cases** (underlay off unless said; "standard" fabric numbers of 1.8 used only where stated).
| # | Input | Expect |
|---|---|---|
| F1 | Square 0..10 x 0..10, angle 0, spacing 0.25, length 3, pull 0 | 40 rows at y = 0.125, 0.375 … 9.875; one section; 80 points on x = 0 or x = 10; interior points per row by k mod 4: {3, 6, 9}, {0.75, 3.75, 6.75}, {1.5, 4.5, 7.5}, {2.25, 5.25, 8.25}; 200 points in all; no stitch over 3 |
| F2 | F1 with angle 90 | Rows are vertical lines x = 0.125 …; more than half of all stitches have equal x at both ends |
| F3 | F1 with angle 45 | Every row stitch runs along (1, 1)/√2 (down to the right); neighbouring rows 0.25 apart measured across |
| F4 | F1 with pull 0.3 | Row ends at x = -0.3 and x = 10.3; still 40 rows |
| F5 | Square 0..10 with a square hole 3..7, even-odd, F1 settings | Four sections; no point strictly inside the hole |
| F6 | Circle radius 5.64, angle -30, F1 settings | One section; every point within 5.65 of the centre |
| F7 | Two squares 0..10 and 12..22 in x (same y), same settings | Rows of both at the same y values (shared grid) |
| F8 | F1 with underlay on, fabric with edge walk and underlay spacing 2.0 | Order: a 9 x 9 ring at 0.5 inside (20 stitches of 1.8, closed), then 5 vertical rows at x = 1, 3, 5, 7, 9 running y = 0.4 to 9.6 with points at y = 3, 6, 9, then the 40 top rows |
| F9 | F8 on a fabric without edge walk, underlay spacing 1.5 | No ring; 7 vertical rows at x = 0.75, 2.25 … 9.75; then the top |
| F10 | One object made of two squares 5 apart, underlay on, no start/end | Every stitch of one square comes before any stitch of the other |
| F11 | Angle tool: drag from (100, 100) to (160, 160) px | Angle 45; with Shift a drag to (160, 120) gives 15 (18.4 rounded to the 15° step); one undo step |

### 1.3 Satin (ZigZag's satin column; rails, underlay and short stitches after Ink/Stitch)

**What we have.** `Design.satin(p, width, density, pullComp, closed, fold, wAt, shape)` along a centre line, with
stations by the fastest-moving edge, 60 % short stitches where the inner edge crowds, tapers and slants; `zigzag`;
`edgeWalk`; lettering recipes by fabric (`LETTERS`: zigzag underlay from 2.0 mm, centre run under); border recipes
(`BORDERS`); S2 easing and fans. Gap: none of it is settable per object; no auto spacing by width; no auto-split
with staggered split points (the writer splits over 7 mm, in line); no two-rail input; no S-stitch, zigzag top or
multicolour (section 3).

**Behaviour.** A satin is always two **rails** and stitches between them. The user sets width (strokes and
borders), density (spacing), pull compensation per side, underlay (Automatic, or any of Centre, Contour, Zigzag),
short stitches on curves, and auto-split with its length. A filled shape set to satin is a *column across the
shape* by default, or a *border along its outline* (2.0 wide unless set). Rails are drawn on the canvas for a
selected satin.

**Where the rails come from.**
| Source | Rails |
|---|---|
| A stroke with one line (or several unrelated lines: each its own column) | The centre line, resampled so no step is over 0.5 (every original vertex kept), offset by half the width to each side. At a vertex the offset direction is the normal of the averaged tangent and its length is half-width x m, m = 1 / max(abs(cos of the half-turn), 0.5), never over 2 (a mitre, capped). Every sample is a sync point: the two offsets of one centre point always belong to one stitch |
| A stroke with two or more sub-paths (Ink/Stitch's rails and rungs) | The two longest sub-paths are the rails if the shorter is at least 40 % of the longer and their mid-points are within 15 mm of each other; else each sub-path is a centre line as above. Open rails: the second is reversed if that brings the two rails' ends closer in total. Closed rails (both closed): the second is turned to run the same way round and to start at its vertex nearest the first rail's start. Every other sub-path is a rung: where it first crosses each rail gives a sync pair; rungs are sorted along the first rail and one that doesn't advance along both rails is ignored |
| A filled shape, border on | Each ring as a closed centre line of the set width |
| A filled shape, border off (ZigZag's auto-satin) | The shape is split into parts (an outer ring with the rings directly inside it). A part with exactly one hole: outer ring and hole are the rails (a ring, an O). A part with no hole: the ring is cut at its two tips into two rails (a bar, a crescent, a letter stroke). A part with two or more holes can't be a column |

*Finding the two tips.* Resample the ring at max(perimeter / 240, 0.2). For pairs of samples (about 120 candidates
each way) score = straight distance between them x balance, where balance = shorter arc between them / longer
arc. Among the pairs scoring at least 85 % of the best, take the pair whose two rails have the smallest mean
distance across (measured at 24 places): a bar splits at its short ends, not at its corners.

*When auto-satin gives up.* Measured every 1 mm along the column: if the widest stitch is over 8 mm, or over 8 %
of the stitches (wider than 0.1) have their mid-point outside the shape, that part is sewn as a fill instead (with
the object's fill settings) and a note says why ("more than one hole", "branches or bends too much", "N mm wide in
places"). Their message speaks of "about 10 mm"; the limit applied is 8.

**Stations along the column (the pairing rule).** Between consecutive sync points the column's length is the mean
of the two rails' lengths there. The total is divided into n = ceil(total / step) equal steps; at each step both
rails are read at the same fraction of the way between the surrounding sync points. So stitches stay square to the
column round a bend, where the inner rail is shorter. The last station is both rails' ends.

**Top stitches.** Step = the spacing. At each station the needle goes to rail A then to rail B: one stitch straight
across, then a slanted one back to rail A at the next station (an N pattern). The gap between hits on the same edge
is therefore the spacing, and the thread crosses the column twice per spacing: the same cover as our `satin` at
`density` = spacing, whose crossings are both slanted.

- *Auto spacing (ZigZag's)*: when the object has no spacing of its own, spacing = fabric satin spacing x factor by
  the column's mean width: under 1.5 mm x 1.25; 1.5 to under 2.5 x 1.10; 2.5 to 5.0 x 1.00; over 5.0 x 0.92.
- *Pull compensation*: each end of every top stitch is moved outward along the stitch by the per-side amount.
  Underlay is not widened.
- *Short stitches (Ink/Stitch's rule, 0.25 mm)*: at every second station, for each rail separately: if this
  station's point on that rail is nearer than 0.25 to the previous station's point on the same rail, that end of
  the stitch is pulled in toward the other rail by 15 % of the stitch's length (pull included).
- *Auto-split (ZigZag's)*: plain style only. A top stitch longer than the split length L (default 7.0) is cut into
  n = ceil(length / L) equal parts. The cut points are then shifted along the stitch by 0, +0.33/n or -0.33/n of
  its length, taking those three in turn stitch by stitch (straight and slanted stitches both count), so cuts in
  neighbouring stitches never line up into a groove.
- A check tells the user: widest stitch over the split length (a note that it is split); split off and widest over
  7 (warning); mean width under 1.0 ("too narrow, use Run").

**Underlay.** Automatic by the column's mean width: under 1.5 none; 1.5 to 4.0 a centre run; over 4.0 contour plus
zigzag. Underlay off means none. A manual choice is any subset. Sewn in this order, all before the top, as one
continuous path:
| Pass | Shape | Ends |
|---|---|---|
| Centre | The mid-points of stations 2.5 apart | at the column's other end |
| Contour | Stations 2.5 apart; out along one side and back along the other, each side inset from its rail by min(0.4, a quarter of the width there) | where it began |
| Zigzag | Stations 3.0 apart, alternately the inset point on side A and on side B | at the column's other end |
The top is then sewn from whichever end the needle is at. So with centre only, or contour + zigzag, the top ends
where the column began; with none, or all three, it ends at the far end. An open column can be sewn from either
end (the planner picks, 1.5); a closed one (a ring) can't be turned.

**Ours wins / notes.** Our stations-by-fastest-edge rule, 60 % short stitches, fans and easing stay: they are
measured (`docs/stitch-model.md`). Adopt: auto spacing by width as the unset value, auto-split with staggered cuts
(must not disturb the writer's own 7 mm split: a builder-made split means the writer finds nothing to split),
underlay kinds as a per-object choice, two-rail input. A width over 12.1 with split off is not allowed out.

**Test cases** (fabric satin spacing 0.40, satin pull 0.15 unless said; a straight 20 mm stroke along x).
| # | Input | Expect |
|---|---|---|
| S1 | Width 3.0, automatic | Factor 1.00, spacing 0.40; centre run first: 9 points on the centre line 2.5 apart; then 51 stations, 102 top points at y = ±1.65, alternating sides; the top runs from the far end back to the start; 111 points |
| S2 | Width 1.0, automatic | No underlay; spacing 0.50; 41 stations, 82 points at y = ±0.65; ends at the far end |
| S3 | Width 2.0 | Spacing 0.44 |
| S4 | Width 6.0, automatic | Spacing 0.368; contour: 9 points along y = +2.6 then 9 back along y = -2.6; zigzag: 8 points alternating y = ±2.6, about 2.86 apart in x; top: 56 stations, stitches 6.3 long, none split |
| S5 | Width 8.0, automatic | Top stitches 8.3 long, each cut once; cut at 50 %, 66.5 % and 33.5 % of the stitch in turn; no stitch over 7.0 |
| S6 | S5 with split set to 0 | Stitches 8.3 long, uncut; the "over 7 mm" warning |
| S7 | Width 3.0 round a quarter circle of centre radius 2.0 | Inner-rail hits about 0.10 apart: every second stitch's inner end is drawn in about 0.495 (15 % of 3.3) from where the others land; outer ends untouched; with short stitches off, none are |
| S8 | A 20 x 3 filled bar, satin, border off | Rails are the two long sides; stitches about 3.3 long across the bar |
| S9 | A filled ring, outer radius 10, inner 7 | One closed column 3 wide all the way round |
| S10 | A filled 20 x 20 square, satin, border off | Sewn as a fill, with a note (over 8 mm wide) |
| S11 | S10 with border on | A closed 2.0-wide column centred on the outline |
| S12 | Two 20 mm lines 4 apart in one stroke, plus three short cross lines | One column 4 wide with stitches across it, not five separate columns; with the cross lines slanted, the stitches between them lean the same way |

### 1.4 Run and triple run (ZigZag's running stitch)
**What we have.** `followRun` (stitches up to a length within a tolerance, a hole at every turn over 30°), fine-line
lettering as bean stitch, "a bold line is already a triple run (three laps through the same holes)"
(`docs/design-tab.md`), triple run for thin picture parts. Gap: stitch length and passes aren't settable per piece.

**Behaviour.** Length (fabric run length unset) and Passes: Single or Triple (any count 1 to 9 from a file).

**Algorithm.** Every vertex of the line is a needle point. Each segment between two vertices is cut into
ceil(segment / length) equal stitches. A closed line returns to its first point. Passes: the whole line forward,
then the whole line backward through the same holes, then forward again, and so on. An odd count ends at the far
end, an even count where it began. This is the "three laps" kind of triple run, not a stitch-by-stitch bean (two
steps forward, one back): each hole is hit once per pass. A single-pass closed line may be started at any vertex;
anything else may be sewn from either end.

**Test cases.** A 10 mm straight line, length 2.5: 5 points. Triple: 13 points, ending at the far end, three hits
in each inner hole (ours: check against `LIMITS.hits`; three laps of a 2.5 mm stitch are far under 24). Two
passes: 9 points, ending at the start. An L of 10 + 4 mm, length 3: the corner is a needle point; stitches of 2.5
and 2.0.

### 1.5 Start and end points; how the next entry is chosen (ZigZag's sewing row; Ink/Stitch's start/end commands)

**Behaviour.** Per object, optional. "Start": click the object's outline; a green marker appears there and can be
dragged. "End": the same, red. "Clear" removes both (right-click a button clears one). Each is stored as a fraction
0 to 1 of the way along the object's **reference outline**: for a filled shape its largest ring (by area), from
that ring's first point, closed; for a stroke its first sub-path that has length, from its start. A click is
snapped to the nearest point of that outline (stored value never 1.0; values wrap). The thread leaves an object at
its end point "so the next object is close".

**Algorithm: with neither set (the default).** The planner keeps the needle's position (the last point sewn).
Within one group of an object it repeatedly takes the piece whose nearest entry is closest to the needle:
| Piece | Entries considered |
|---|---|
| May be sewn from either end (fill sections, runs, open columns, spirals) | first point, or last point (sewn reversed) |
| Closed single-pass ring (contour rings, ripple rings, closed runs) | any vertex; the ring is turned to start and end there |
| Fixed (closed satin, blanket, appliqué steps, manual) | first point only |
Groups are taken in order. Objects are taken in sewing order; nothing looks ahead to the next object.

**With a start point.** For the object's first piece of its first group, the start point stands in for the
needle when choosing the piece and its entry. If the object has an area (fill, contour, satin on a filled shape,
decorative fills) and the straight line from the start point to that entry stays inside the shape and is longer
than 0.1, stitches of at most 3.0 are added from the start point to the entry, so the first needle point is the
start point. Otherwise the object just begins at the entry nearest the start point (a satin or run starts at its
nearest end; a ring at its nearest vertex). For a spiral contour the start point is the spiral's centre (3.3).

**With an end point.** In the object's last non-empty group, the piece that can finish nearest the end point (by
either of its ends; a ring by its nearest vertex) is held back and sewn last, in the direction that finishes
nearest. If its last point is further than 0.1 from the end point, stitches of at most 3.0 are added straight on to
it (not tested for staying inside). When that last group has a single piece and the object also has a start point,
the start point decides the direction and the end point only adds the closing stitches.

**Ours wins / notes.** The lead-in and lead-out stitches must lie under cover or be the object's own outline; ours
adds: both go through `Design.path` (locks, easing), and a lead-out across open cloth longer than `MOVES.sewn` is
refused (the end point then just picks the last piece and direction). Part-by-part fill order (1.2) is switched off
by either point in theirs; ours may keep it and honour the points on the first and last part.

**Test cases.**
| # | Input | Expect |
|---|---|---|
| P1 | Fill square 0..10 drawn from (0,0) clockwise; start 0, end 0.5 | First needle point (0,0); last (10,10) |
| P2 | Open run from (0,0) to (20,0); needle before it at (25,0) | Sewn from (20,0) to (0,0) |
| P3 | P2 with start 0 | Sewn from (0,0) |
| P4 | Three separate lines in one run object, end point on the middle line's right end | The middle line is sewn last, left to right |
| P5 | Contour rings | Each ring begins and ends at its vertex nearest to where the ring before it ended |
| P6 | Value 1.25 given | Stored as 0.25 |

### 1.6 Trim after, stop after, and "connect gaps up to N mm" (ZigZag's sewing controls and Connect bar)

**What we have.** `Design.path` decides stitch / loose / trim by distance (`MOVES`); hidden travel inside fills
(`makeRouter`, `routeFill`), under a patch's satin edge (`PATCH.cover`), along frame lines; `LINK` joins script
pieces. No user control over any of it; no travel under an object sewn later on top.

**Behaviour.**
- *Trim after* (per object): the thread is cut after this object whatever comes next and however near.
- *Stop after* (per object): the machine pauses after this object; the next object starts a new colour block even
  in the same thread. The thread list shows "stop" where one thread comes twice running.
- *Connect* (per document): a slider 0 to 20 mm in 0.1 steps with a number field that goes to 50; default 0. Under
  it one line: "N cuts down to M" when it is saving cuts, "N cuts: none this short" when set but saving nothing,
  "N cuts: drag to sew across the short ones" when 0, "No cuts" when there are none. While the control is hovered,
  dragged or focused, and for 6 s after, the gaps it sews across are lit up on the canvas.

**Algorithm: what happens between one run's end and the next piece's entry, inside one colour block.** In this
order; the first that applies is used. "Stitched" always means stitches of at most 3.0 along the way.
| # | Condition | Result |
|---|---|---|
| 1 | The previous object had Trim after (first piece of the next object only) | Cut |
| 2 | The gap is 1.0 or less | Stitched straight |
| 3 | The piece belongs to an object with an area, the gap is 6.0 or less and the straight line stays inside that area (sampled every 0.2) | Stitched straight |
| 4 | Both ends are in the same object with an area: follow the outline moved 0.5 inside, the shorter way round, provided both ends are nearest the same inset ring and hop-on + way round + hop-off is 50 or less (Ink/Stitch's underpath) | Stitched round the inside of the edge |
| 5 | A hidden way of 50 or less exists (below) | Stitched along it |
| 6 | The gap is no longer than the document's Connect value | Stitched straight across open cloth, and recorded as a "bridge" (start, end) for the count and the highlight |
| 7 | Otherwise | Cut |
There is never a join across a colour change or a stop. Rules 2 and 3 also apply between two objects (rule 3 with
the area of the object being entered).

*The hidden way (ZigZag's travel zone, 0.1.2).* The ground where a stitch won't be seen is the union of: the
object's own outline, but only if it is a plain fill whose rows are 1.0 apart or closer; and what every object
sewn later will cover (fills, contour fills and appliqués by their outline; satins by the area between their
rails; runs and the open decorative fills cover nothing), taken from later objects whose boxes come within 7 mm.
The search area is the object's box, widened to include the needle's position when that is within 50 mm, plus 2 mm
all round.
- The ground is drawn on a grid of 0.25 mm cells (coarser when the area would need more than 400,000 cells), a cell
  belonging when its centre is inside.
- A point enters the grid at its own cell, or the nearest cell of the ground within three cells (a row end lies on
  the edge or just past it). No such cell: no route. Two ends in unconnected patches of ground: no route.
- Steps go to the eight neighbours; a diagonal step is allowed only when both cells beside it are ground. A step
  costs its length, x 4 onto a cell that is within two cells of the ground's edge, so the route keeps 0.5 inside
  where there is room. The search is a best-first search toward the far end that weighs the remaining straight
  distance double (it takes a good route, not always the best) and gives up beyond a cost of 4 x 50 mm.
- The cell path is straightened: each leg is stretched as far as a straight line that stays on the ground and
  costs no more than the cells it replaces. Corners nearer than two cells to either end are dropped. A route over
  50 mm long is refused.

**Ours wins.**
- Rule 2's 1.0 mm is replaced by `MOVES.sewn` (2 mm) and the loose-thread accounting; rule 7's "cut" is our trim
  with both ends locked.
- Rule 6 sews visible lines across open cloth. Our rule: short jumps are "not sewn as connectors (lines between
  print letters)". If a Connect control is built it defaults to 0, is the user's explicit choice, says in plain
  words that the stitches show, lights them up, and each bridge still passes easing and the checker. With Connect
  at 0, 2-5 mm gaps remain loose threads and are counted ("N loose threads to snip").
- Rules 4 and 5 are the valuable part: rule 5's "under what is sewn later" is the travel we lack. Any such travel
  must end under cover with its locks under cover too (S1's "locks in cover").
- Stop after maps to our STOP command; "a pause between two blocks of one thread starts a new block" already holds
  for the 24-hit rule and the checker. Appliqué's own stops are unchanged.

**Test cases.**
| # | Input | Expect (theirs; ours in brackets where it differs) |
|---|---|---|
| C1 | Two same-thread squares 0.5 apart | One run, no cut, one block |
| C2 | C1 with Trim after on the first | One cut between them |
| C3 | C1 with Stop after on the first | Two blocks in the same thread; (ours: a STOP between them) |
| C4 | Two same-thread squares 3 apart, Connect 0 | One cut; (ours: a 3 mm loose thread, counted, both ends locked) |
| C5 | C4 with Connect 5 | No cut; one bridge from the first square's last point to the second's entry; the note reads "1 cut down to 0" |
| C6 | A U-shaped fill whose two arms are 8 apart across the opening | Travel from one arm to the other follows the inside of the U, 0.5 from the edge; no stitch crosses the opening |
| C7 | One object of two 10 mm squares 4 apart; a fill in another thread, sewn later, lying across the gap and over part of both squares | No cut between the squares and no bridge: the stitches that cross the gap all lie inside the later fill, clear of its edges. Without the later fill: one cut. With that fill sewn first instead: a cut |
| C8 | C7 with the later object a run, not a fill | A cut (a run hides nothing) |
| C9 | Two 10 mm blocks joined by a neck 0.6 wide and 2 long, one outline, rows 0.25 apart | No cut: the inside-of-the-edge way (rule 4) can't pass a neck under 1.0 wide, the hidden way (rule 5) goes through it. With rows 2.0 apart the fill hides nothing: a cut |
| C10 | Different threads 0.5 apart | Never joined |

### 1.7 Cap order (also used by Z2)
Per document, off by default (ZigZag's cap order; the trade's centre-out, bottom-up rule for caps).
- Constraint: an object is never sewn before any object that comes earlier in the document and whose bounding box
  overlaps its own (layering is kept).
- Among the objects whose predecessors are all sewn: first those in the thread just used; among those the one with
  the smallest abs(cx) + 0.5 x (bottom - cy), where (cx, cy) is its box's centre measured from the hoop's centre
  and bottom is the lowest edge of the whole design. So: stay on the thread, work out from the centre line, and
  work up from the bottom.
- With cap order on, every fill's rows (underlay and top) are also sewn from the bottom row up.

Test: three separate objects, threads A at x = 30, B at x = 0, A at x = -10 (same height): sewn B, A(-10), A(30).
Two same-thread objects on the centre line at y = -10 and y = +10: the lower (y = +10) first. An object drawn on
top of another is never sewn before it, whatever the threads.

### 1.8 Fabric presets (ZigZag's four; the idea "the fabric sets every default" is also ours)

**What we have.** `fabrics.js` `FABRICS`: cotton, knit, towel/fleece, felt, denim, canvas (words, stabiliser,
needle) and `recipes.js` by fabric: `FILLS` (pull 0.20 / knit 0.35 / towel 0.40; rows 0.35 / knit 0.40), `LETTERS`
(satin gap 0.38, small 0.34, knit 0.42; zigzag underlay from 2.0 / towel 2.5 / knit 1.5; knit +0.3 total pull),
`BORDERS`, thread weights (`WEIGHTS`). Ours covers more fabrics and thread weight; theirs covers caps.

**Theirs.** One preset per document, default "standard". It changes only the unset values of these eight things:

| Preset | For | Fill spacing | Fill stitch | Fill pull / side | Edge walk under fills | Fill underlay rows | Satin spacing | Satin pull / side | Run stitch |
|---|---|---|---|---|---|---|---|---|---|
| standard | twill, denim, patches | 0.25 | 3.0 | 0 | no | 1.5 | 0.40 | 0.15 | 2.5 |
| thin-cap | unstructured cotton cap | 0.35 | 3.0 | 0.20 | yes | 2.0 | 0.42 | 0.20 | 2.2 |
| structured-cap | buckram-front cap | 0.30 | 3.5 | 0.15 | yes | 1.8 | 0.40 | 0.20 | 2.5 |
| knit | beanie, jersey | 0.30 | 2.8 | 0.30 | yes | 1.2 | 0.38 | 0.30 | 2.0 |

Not by fabric in theirs: fill angle (0), satin underlay thresholds (1.5 / 4.0), satin split (7.0), short stitches
(on), contour 0.45, ripple 2.5, meander 3.0, cross cell 2.5, blanket 2.5 / 2.5, appliqué cover 3.0, border 2.0.

**Gap and advice.** Nothing to take as numbers for the fabrics we have (ours are measured and published-practice
based). What to take: the *shape* of the rule (a preset is exactly a table of unset values; an object's own
setting always wins; "reset" returns to the table), and, if caps are wanted, two cap rows built from this table
and proven on our scoreboard before they ship. A cap also wants cap order (1.7).

---

## 2. Z2: SVG import

### 2.0 What we have today
- No vector import. Artwork enters as a raster picture (`digitize.js`: colours learned, Filled / Line drawing /
  Cross-stitch) or as a machine file (Open tab). SVG is written only, for cutting machines (`sheet.js` `cutSVG`).
  Motifs are our own drawings (`motifs.js`).
- Gap: everything below. The reward is exact edges (the picture path traces pixels), the artist's own layering and
  colours, and satin/run from strokes.

### 2.1 What is read (ZigZag's importer; it leans on an SVG-normalising library, which we must not vendor)
The importer sees a tree already reduced to groups, paths and text. The reduction it relies on, which an
implementer must provide by their own means (the browser's SVG DOM can do most of it):

| Aspect | Rule |
|---|---|
| Shapes | `path`, `rect` (with corner radii), `circle`, `ellipse`, `line`, `polyline`, `polygon` all become paths. `use` is expanded. Nested `svg` and `g` are groups |
| Styles | Presentation attributes, `style` attributes and style sheets are resolved to a fill paint, a fill rule, a stroke paint and a stroke width per path, with inheritance |
| Visibility | An element that is not visible (`display: none`, `visibility: hidden`) is skipped. A fill or stroke with opacity 0 is treated as absent. Other opacities are ignored (the paint is used at full strength) |
| Paint | A plain colour is used as is. A gradient becomes its first stop's colour. A pattern becomes black |
| Ignored | Raster `image` elements. Stroke caps, joins, dashes and markers (a dashed stroke is sewn solid; satin ends are square). Clip paths and masks do not cut anything (not confirmed beyond reading: see "Not determined") |
| Ids | Each element's `id` and those of its enclosing groups are kept: they carry names and settings (2.4) |

### 2.2 Units and geometry
- One CSS pixel is 25.4 / 96 = 0.26458 mm. A document's `width`/`height` with physical units and its `viewBox`
  set the scale the usual SVG way; with no size given, one user unit is one pixel.
- Every element's full transform (its own and all its ancestors', and the viewBox mapping) is applied to its
  points.
- Curves are flattened to polylines within 0.03 mm of the true curve (quadratic, cubic; arcs first become cubics).
- Sub-paths: one ending in a close command is closed (a repeated first point at its end is dropped). The others
  are open.
- Placing: new artwork keeps its own size and is centred on the hoop centre, or on a given point; given a width, a
  height or both it is scaled uniformly to that width, that height, or to fit inside both. Artwork larger than the
  hoop is scaled down to fit when opened or placed, and says so (undo restores the size).

### 2.3 From paint to objects and stitch types (ZigZag's mapping)
| The element has | Objects made | Stitch type when none is named |
|---|---|---|
| A fill | One filled-shape object: every sub-path with 3 or more points is a ring (open ones are closed), under the element's fill rule | Fill |
| A stroke | One stroke object: all sub-paths as lines, each open or closed. Width = stroke width x the transform's scale (square root of the absolute determinant) in mm | **Satin when the width is 1.0 mm or more, Run when under** |
| Both | Two objects, the fill first and the stroke after it (the stroke sews on top) | as above, each |
| Text | 2.5 | Fill |

- A stroke never becomes a triple run by itself: triple is only the Passes setting (1.4) or a token (2.4).
- On a stroke, a named type of fill, contour or appliqué can't apply: fill falls back to the width rule above,
  contour and appliqué become run.
- A stroke object with several sub-paths set to satin is tested for rails and rungs first (1.3).
- A width set on the object (1.1) replaces the stroke width, including for the 1.0 mm decision at import.

### 2.4 Settings carried in names (ZigZag's id tokens)
Optional for us (it matters only if designs are to round-trip through a drawing program), but it is how their
files carry Z1's settings, so the grammar is recorded.
- An element's or group's `id` is split at spaces, underscores, commas and semicolons. Illustrator's escapes
  (underscore, `x`, two hex digits, underscore) are decoded first. Words that are not tokens are the object's name.
- A token on a group applies to everything inside; a token on a child overrides it. A token prefixed `stroke.`
  applies only to the stroke of an element that has both a fill and a stroke; on such an element an unprefixed
  stitch type belongs to the fill only.
- `skip` on a group leaves the whole group out (unless the group also names a stroke type).

| Token | Meaning | Token | Meaning |
|---|---|---|---|
| `fill` `satin` `run` `contour` `blanket` `applique` `meander` `ripple` `cross` `tartan` `manual` `skip` | stitch type | `ul=center+contour+zigzag` / `ul=none` | satin underlay kinds |
| `a=` | fill angle, degrees | `ss=0/1` | short stitches |
| `s=` | spacing, mm (over 0.05) | `split=` | auto-split length; 0 off |
| `l=` | stitch length, mm (over 0.3) | `style=satin/s/zigzag` | satin top style |
| `pc=` | pull per side, mm | `colors=RRGGBB+RRGGBB` | multicolour satin |
| `w=` | width, mm | `sett=RRGGBB:mm+…` | tartan stripes |
| `r=` | run passes 1-9 | `cell=` | cross-stitch cell, mm (1 or more) |
| `u=0/1` | underlay | `st=` `en=` | start, end (0-1) |
| `border` | satin along the outline | `trim` `stop` | after this object |
| `spiral` | contour/ripple as a spiral | `t=RRGGBB` | thread colour |
| | | `o=N` | sewing order |

A bad value is ignored (the setting stays unset). The document's own settings (fabric, overlaps, cap order, hoop,
connect) are kept the same way on the root.

### 2.5 Text and colour
- **Text** (ZigZag's): a `text` element becomes one filled-shape object holding every glyph's outline, non-zero
  fill rule, in the colour of its first glyph, sewn as Fill unless named otherwise. It needs the font installed;
  otherwise a fallback face is used, so their advice is to convert text to outlines before export. Their checks
  then warn when it looks like small lettering: three or more separate parts, most of them under 4 mm tall
  ("use Satin, keep letters 5 mm or taller").
- Ours: glyph outlines as fills is our weakest way to sew letters. On import, offer to re-set recognised text in
  our lettering engine (same words, nearest of our fonts, same height) and otherwise import the outlines as a fill
  with the small-lettering warning.
- **Colour to thread** (theirs): the object's thread colour is the paint's RGB, unchanged; `t=` overrides. The
  nearest thread of a chart (Brother or Janome, by CIEDE2000) is shown as a name only, and a "match all" command
  snaps every colour to a chosen palette on request.
- **Ours wins**: each distinct paint goes through `machineThreads()` (PEC palette without 62-64, red-mean, two
  colours never one thread, order = block order), exactly as a picture's colours do; near-identical paints (the
  picture path's `SAME` measure) may be offered as one thread.

### 2.6 Remove overlaps (ZigZag's rule)
Per document, **on** by default. For each object that is a filled shape sewn as Fill or Contour, in sewing order:
1. Take every object sewn *later* whose bounding box overlaps this one's.
2. Of those, the ones that cover cloth: Fill, Contour and Appliqué objects by their outline; Satin objects by the
   area between their rails (a closed column by its two rail rings, even-odd; an open one by rail A followed by
   rail B backwards; a part that fell back to fill by its outline). Runs, blanket, manual and the open decorative
   fills (meander, ripple, cross-stitch, tartan) cover nothing.
3. Union those areas (only the parts within 0.7 mm of this object's box matter), then **shrink the union by 0.5 mm**.
4. Subtract the shrunk area from this object's outline. Leftover rings of 1.5 mm² or less are dropped.
5. The object is sewn with what is left: so it still runs 0.5 mm under the edge of whatever covers it. If nothing
   is left, the object is not sewn at all and the checks say "completely covered" (information, not a warning).
Only the stitched geometry changes: the object as drawn, its outline for start/end points and its box for ordering
stay as they were. Objects of other types underneath (satin, run …) are never cut.

Notes for us: this needs polygon union, difference and inward offset on real outlines; we have none (our carving
is raster, `pieces.js` `carve`, `freeMask`). They must be written here, from textbook algorithms, not ported.
0.5 mm agrees with our `PATCH.cover`-style thinking but is not measured on our machine: prove on the scoreboard
(`holes` in the picture corpus is the right measure) before fixing it in `recipes.js`.

Test cases.
| # | Input | Expect |
|---|---|---|
| O1 | Fill square 0..20 under a fill square 5..15 sewn later | The lower fill has a 9 x 9 hole (5.5..14.5): no lower stitch inside it; lower rows reach 0.5 under the upper square's edge. Covered area sewn once except that 0.5 band |
| O2 | O1 with the upper object a run | Lower fill whole |
| O3 | A fill 5..15 under a fill 0..20 | The lower is not sewn; one "completely covered" note |
| O4 | O1 with remove overlaps off | Lower fill whole (two layers) |
| O5 | Lower fill under a 3 mm wide satin stroke crossing it | A 2 mm wide slot under the satin's centre line |
| O6 | A 2 x 1 fill (x 0..2), under a later fill that covers it from x = 0.5 on | What is left is x 0..1, 1 mm²: dropped (1.5 mm² or less), so the object is not sewn and is reported as covered |

### 2.7 Sewing order and colour grouping (ZigZag's)
- **Default order** is document order: first drawn is sewn first, last drawn lies on top. `o=N` values, when any
  object has one, sort the objects by N (those without go last, in document order). The user can move an object
  earlier or later.
- **Cap order** (a standing document option): section 1.7.
- **Group colours** (a one-off command that reorders the document): with the same constraint as cap order (an
  object never moves before an earlier object whose box overlaps its own), repeatedly take the first object in
  document order that is ready and in the thread just used; if there is none, the first ready object. Reports
  "colour changes: N to M", or that the layering allows no fewer.
- Colour blocks follow from the order: consecutive objects in one thread share a block.

Test cases. Order red A, blue B, red C, none overlapping: grouped to A, C, B (2 changes to 1). Same with C's box
overlapping B's: unchanged. Order red A, blue B, green C, blue D, red E, no overlaps: A, E, B, D, C.

Ours: `machineThreads` order = block order must be recomputed after any regrouping. Bounding-box overlap is a
coarse test (an L-shaped object "overlaps" what sits in its notch); it is safe (never breaks layering) but leaves
changes unmerged. A real area test is allowed as long as it is at least as strict about true overlaps.

---

## 3. Z3: stitch types

### 3.0 What we have, in one table
| Their type | Ours today | Verdict |
|---|---|---|
| Contour fill, rings | `fill.js` `ringFill` ("Rings", `CONTOUR`) | Ours is ahead (3.2); take nothing but the per-object spacing |
| Contour fill, spiral | none | New, small (3.3) |
| Ripple, rings and spiral | Quilting "Echo" (`quilt.js` `echo`, rings chained as a spiral) | Half have: echo is only a frame's quilting; as a fill of any shape it is new (3.4) |
| Meander | Quilting "Stipple" (`quilt.js` `stipple`) | Ours is the better line (3.5); new only as a fill of any shape |
| Triple / bean run | Bold line, fine-line bean, thin picture parts | Have (1.4) |
| Satin S-stitch, zig-zag | `zigzag()` exists as underlay; no S-stitch | New, small (3.6) |
| Multicolour satin | none | New (3.6) |
| Tartan | none (`FILL_PATTERNS`: plain, brick, chevron, wave; blends) | New (3.7) |
| Cross-stitch | Pictures' Cross-stitch | Have; theirs noted in 3.8 |

All the "open" types below (spiral, ripple, meander, cross-stitch) are lines of running stitch clipped to the
shape: they hide nothing (2.6, 1.6) and take no pull compensation or underlay.

### 3.1 Clipping a line to a shape (used by 3.3 and 3.5)
A polyline is kept stitch by stitch: a segment stays when both its ends are inside the shape and so is every
sample along it at 0.2 mm steps. Runs of kept segments are the pieces; a single point is no piece. The planner
then joins the pieces (1.6).

### 3.2 Contour fill, rings: theirs against our Rings
| | Theirs (ZigZag's contour fill) | Ours (`ringFill`) |
|---|---|---|
| Levels | The outline moved inward by spacing / 2, then by a further spacing each time (true polygon offsets, mitred), until nothing is left | Levels of the distance from the edge read off the 8 px/mm drawing by marching squares, first 0.2 in, then a row apart, evened over 0.6 |
| Smallest ring | Area must exceed spacing² | Under 4 mm round is left out |
| Stitches | Fabric run length, every offset vertex a needle point | Up to 3 mm, shorter wherever the stitch would leave the line by 0.12 |
| Order | Strictly outside in, level by level; within a level nearest first; each ring entered at the vertex nearest the needle and closed exactly | Outside in; nearest point; each ring 1.5 past its start (no seam); a pinched shape's smaller middles centre-out; a hole's rings from the outline's side |
| Where rings from two sides meet | Nothing: up to one spacing of bare cloth along the shape's spine | The half-way stretches are sewn as open lines |
| Between rings | Gap = spacing, so it is stitched straight (under their 1 mm rule) or routed | Chained by the sequencer |
| Pull | none | none |
| Default spacing | 0.45 | the fabric's rows |

Verdict: nothing in their ring algorithm improves ours. Two things to take: spacing as a per-object setting
(0.25 to 1.5), and, when Z2's polygon offset exists, the option of exact offsets instead of the drawing (it would
also address "ring fill is slow", `docs/roadmap.md` S3) with our lap, seam, crest and middle rules kept on top.

Test (theirs, for reference): a 10 mm square, spacing 0.45: 11 square rings with sides 9.55, 8.65 … 0.55; a 12th
would have no area.

### 3.3 Contour fill, spiral (ZigZag's; they credit Ink/Stitch's circular fill)
**Behaviour.** "Rings / Spiral" on a contour fill. One thread path winding out from a centre, turns one spacing
apart, cut off at the shape's edge. It suits round shapes; on anything else the arcs outside the shape are simply
missing and the planner joins what is left.

**Algorithm.**
- Centre: the object's start point if it has one (1.5), else the mean of the vertices of its largest ring.
- An Archimedean spiral: radius = turns x spacing, starting at 0. Points are laid by advancing the angle by
  min(len / max(radius, len), 60°) each time, len = max(fabric run length, 0.5): about one stitch length apart
  once past the first turn.
- It runs until the radius passes the distance from the centre to the farthest corner of the shape's box, plus one
  spacing.
- Clipped to the shape by 3.1. All pieces form one group; each may be sewn from either end.
- Spacing floor 0.2.

**Edge cases.** In a circle centred on its centroid it is a single piece from the centre to the rim (the last turn
is cut where it first leaves). In a square the corners are filled by separate arcs, each a piece, joined by routed
travel or cuts: in ours those joins should run along the outline (the edge run), never across open rows.

**Test cases.** Circle radius 10, spacing 0.5, run length 2.5: one piece; about 20 turns; neighbouring turns 0.5
apart radially; thread length about π x 10² / 0.5 ≈ 630 mm, so about 250 stitches (230 to 280); first point at the
centre, last within 0.5 of the rim. With a start point on the rim: the centre is that rim point and several arcs
result. Ours: the first turns pile hits at the centre: built with easing, the centre must stay under 24.

### 3.4 Ripple (ZigZag's, after Ink/Stitch's ripple stitch)
**Behaviour.** An open, decorative fill: running-stitch rows that follow the outline inward, far enough apart to
see cloth between them (default 2.5 mm). "Rings" or "Spiral".

**Algorithm, rings.** Levels exactly as contour rings (first at spacing / 2 inside, then every spacing; a ring must
enclose more than spacing²), each ring cut into stitches of the fabric run length keeping its corners. All rings
of all levels are one group: the planner takes the nearest next, entering each at its nearest vertex (so not
necessarily outside in). Gaps between rings are a spacing wide, more than a stitch-across gap: each ring is joined
to the next by routed travel (none is hidden: an open fill hides nothing), by Connect, or cut.

**Algorithm, spiral.** Only when every level is a single ring; otherwise it silently falls back to rings. For each
level and the next one in: every point of the outer ring, at fraction t of the way round (by point index), is
moved toward the next ring's point at the same fraction by that same t. One turn therefore slides smoothly from one
ring onto the next; the innermost ring is then sewn whole. The result is one open line, outside in, sewable from
either end.

**Ours.** In ours a ripple in rings would leave a 2.5 mm jump between rings: a loose thread each (the 5 mm rule),
which is why our echo quilting already chains its rings into a spiral. So: build the spiral form as the default,
and for shapes whose levels split, chain each family of rings as its own spiral.

**Test cases.** A 21 mm square, spacing 2.0, rings: 5 rings with sides 19, 15, 11, 7, 3. Spiral: one open line;
its first turn starts on the 19 ring and ends on the 15 ring; its last turn is the whole 3 ring; consecutive turns
2.0 apart at the sides; no jump anywhere. A dumbbell shape, spiral asked: rings result (levels split in two).

### 3.5 Meander (ZigZag's; Ink/Stitch's meander fill is the idea)
**Behaviour.** One wandering line through the shape, "quilting style". Spacing (how close the line comes to
itself, default 3.0) and stitch length. The same object always gives the same line.

**Algorithm.**
- Lay a square lattice of nodes, one spacing apart, from the top-left corner of the shape's box. A node counts if
  it is inside the shape. Two neighbouring nodes (up, down, left, right) are linked if the straight line between
  them stays inside (sampled every 0.2). More than 400,000 lattice positions: no stitches.
- Walk it depth-first from the first unvisited node: at each node try the four neighbours in a random order (a
  small seeded generator; the seed is the object's stable number, so the result repeats) and step to the first
  unvisited linked one. With none, step back along the walk to the previous node; the steps back are part of the
  line. The walk ends when it has backed all the way to its start. Any inside node not reached starts another walk
  (another piece).
- Round the corners: every lattice step is replaced by two points at 30 % and 70 % of it (first and last node
  kept). Cut into stitches of max(length, 0.5), clip by 3.1.

**Consequence worth knowing.** The line is the walk round a random tree: every branch that dead-ends is sewn out
and back over itself, so much of the line is double. Our stipple traces the *outline* of a random spanning tree
and relaxes it, so nothing is sewn twice and nothing is on a visible grid. Our own list of things tried and
dropped includes "a grid spanning tree (a maze of corridors)" (`docs/design-tab.md`, Quilting). **Do not adopt
their meander line.** The gap for us is only: stipple as a fill of any piece's shape (a motif, a patch), with
spacing 1 to 8 as a setting.

**Test cases (for a stipple-as-fill).** A 20 mm square, spacing 3: one piece; every point inside; the line never
crosses itself; no point of the square further than about 1.5 x spacing from the line; same input, same bytes.

### 3.6 Satin top-stitch styles and multicolour satin (ZigZag's; S-stitch, zigzag and multicolour satin are Ink/Stitch's names)

**S-stitch.** After the plain top stitches are laid (pull and short stitches applied, no auto-split), every stitch
longer than 0.6 becomes three: two extra needle points at 30 % and 70 % of its length, the first pushed sideways
(square to the stitch) by d and the second by d the other way, d = min(18 % of the stitch's length, 0.8). The side
of the first push alternates from stitch to stitch (slanted stitches count too). The column reads as shallow S
curves, less shiny, and no stitch is as long as the column is wide.

**Zig-zag.** The plain top with its spacing multiplied by 3 and no auto-split: an open zigzag you can see through.
Underlay follows the usual width rule, and shows through; ours should default the underlay to none or centre for
this style.

**Multicolour satin.** Two or more threads (the panel allows up to four) across one column.
- The column is cut lengthwise into as many strips of equal share of the width as there are threads, the first
  thread's strip against rail A. A strip's rails are the points at its two fractions of the way across, taken at
  stations 0.5 apart along the whole column (so strips follow the column's rungs and bends).
- Each strip is then a complete satin of its own: its own mean width decides its auto spacing (narrow strips sew
  more openly: 1.25 x under 1.5 mm) and its automatic underlay (none under 1.5 mm), with the object's pull, short
  stitches, split and style. Pull widens every strip on both sides, so neighbouring strips overlap by twice the
  pull.
- Each strip is its own colour block, in order from rail A to rail B. A part of the shape that can't be a column
  (1.3) is filled once per thread, one on top of the other (theirs; ours should fill it once, in the first thread).
- The panel adds a thread with "+" (the first press makes two: the object's thread and its inverse colour) and
  removes with "-"; under two it is a plain satin again.

**Ours wins / risks.** Strips under about 1.2 mm are below our satin's sound width (our lettering switches to a
line there): refuse more threads than width / 1.2. Strip edges meet at the same holes along the column: easing per
colour block passes, but an all-colour pile-up is exactly the cycle-2 finding "pile colour on colour": measure the
seam. S-stitch triples the hits per crossing: with spacing 0.4 a 3 mm column has about 15 hits per mm of length
over 3 mm of width, fine; under 1.5 mm wide it is not, so S-stitch is offered from 2 mm.

**Test cases** (straight 20 mm column, spacing 0.40, pull 0.15).
| # | Input | Expect |
|---|---|---|
| T1 | Width 3, S-stitch | Each crossing (3.3 long) is three stitches; the two inner points are about 0.59 off the straight line, on opposite sides; side order flips each stitch; point count = 3 x plain - 2 |
| T2 | Width 12, S-stitch | Inner points 0.8 off (the cap) |
| T3 | Width 3, zig-zag | 0.4 x 3 = 1.2 between stations: ceil(20 / 1.2) + 1 = 18 stations, 36 points |
| T4 | Width 6, two threads | Two blocks; block 1 is the half on rail A's side, from 0.15 outside that edge to 0.15 past the centre line, block 2 the other half likewise (they overlap by 0.3); each strip 3 wide: centre underlay each, spacing 0.40 |
| T5 | Width 4, four threads | Refused or reduced in ours (strips of 1.0); theirs sews four 1.0 strips at spacing 0.50 with no underlay |

### 3.7 Tartan (ZigZag's; Ink/Stitch's tartan fill is the idea)
**Behaviour.** A filled shape sewn as crossing stripes in several threads. The panel lists the stripes (a colour
and a width each, up to 8, width 0.5 to 30 mm), an angle, and the row spacing inside a stripe. Unset, the sett is
two stripes: the object's thread 4 mm wide and a lighter tint of it (each channel halved, plus 128) 2 mm wide.

**Algorithm.**
- The sett is read out and then back: stripes a, b, c give the repeating band order a, b, c, c, b, a. One repeat is
  twice the sum of the widths. (The two a's of neighbouring repeats touch, as do the two c's: the end stripes show
  double width. The panel's hint describes a b c b a; what is sewn is as stated here.)
- Work in a frame turned by the tartan's angle. Bands are laid across the shape twice: once as horizontal bands
  stacked down the shape, once as vertical bands across it. The band grid is anchored at the origin of that frame
  (multiples of the repeat), not at the shape, so neighbouring tartans line up.
- Each band is the band's rectangle intersected with the shape, filled by the row algorithm of 1.2 with rows
  running **along** the band, the tartan's spacing and the fabric's fill stitch length, quarter stagger, no
  underlay, no pull compensation.
- Sections are gathered by colour: all of the first colour's horizontal bands, then its vertical bands, then the
  next colour's, in the order colours first appear in the sett. Each colour is one colour block.

**What that means.** Every spot is covered by two full layers of rows at right angles (one horizontal band, one
vertical band). The "weave" is only which colour happens to be sewn later; there is no over-and-under. At the
default 0.25 mm spacing that is twice a fill's thread on the cloth.

**Ours wins / risks.** Per colour block the 24-hit rule sees only one layer where colours differ, but where a
band crosses a band of its own colour both layers are in one block: with 0.35 rows and 3 mm stitches each layer is
about 1 hit per mm², so the count is safe, yet the cloth carries a double fill. For ours: each layer at twice the
fabric's row spacing (so the two layers together make one fill's cover), underlay once under the whole shape in
the first colour, pull compensation on the band ends that lie on the shape's outline, and the result proven on the
scoreboard and by eye before release. Colour blocks: one per colour (not per band), within `LIMITS.blocks`.

**Test cases.** A 12 mm square, angle 0, default sett (4 + 2, repeat 12), anchored so the square is one repeat:
horizontal bands y 0-4 base, 4-8 light, 8-12 base; vertical the same in x; two colour blocks, base first; in the
base block, rows in the y 0-4 band run along x and rows in the x 0-4 band run along y; the centre 4 x 4 is sewn
only in the light thread (both layers). Angle 45: bands run along the diagonals. A sett of one stripe: a plain
two-layer crosshatch in one thread.

### 3.8 Cross-stitch (ZigZag's), for comparison only
Cells of the set size on a design-wide grid; a cell is sewn when its centre is inside the shape. Each unbroken run
of cells in a grid row is one piece: out along the run sewing one diagonal of each cell (bottom-left to top-right),
then back sewing the other (bottom-right to top-left). Rows top to bottom. No doubling of stitches, no travel plan
between runs. Ours (`digitize.js` `crossStitch`) already sews pictures this way with travel; the only gap is
cross-stitch as a fill of a drawn shape, and `docs/roadmap.md` P1 already lists "cross-stitch in rows".

---

## 4. Z4: test swatches (ZigZag's; they credit Ink/Stitch's "Generate Test Swatches")

**What we have.** Nothing a user can sew to compare settings. Our own comparisons are batches and contact sheets
(`tests/`), not for users. With Z1's settings a user has no way to learn which value suits their cloth: this is
that way.

**Behaviour.** With one or more objects selected, a dialog asks:
| Field | Choices | Default |
|---|---|---|
| Setting | Those that apply to the selection's first object's stitch type (table below) | the first that applies |
| From, To | a length (0 to 400) or an angle (-90 to 90) | by setting (below) |
| Swatches | 2 to 24 | 5 |
| Columns | 1 to 12 | 5 |
| Labels | "stitch the value under each" | on |

| Setting | Applies to | Default From - To | Value clamp when applied |
|---|---|---|---|
| Spacing | fill, satin, contour | 0.7 x to 1.3 x the object's spacing (the fabric's fill spacing when it has none), each rounded to 0.01 | 0.1 to 2.0 |
| Stitch length | fill, run, contour | 2.0 to 4.0 | 0.5 to 10 |
| Pull compensation | fill, satin | 0 to 0.4 | 0 to 1.0 |
| Satin width | satin | 0.7 x to 1.3 x the column's mean width, rounded to 0.01 | 0.3 to 15 |
| Fill angle | fill | 0 to 90 | none |

Changing the setting resets From and To to that setting's defaults. "Make" builds the grid as one undo step, selects
everything it made, and says "Made N swatches, <setting> from A to B".

**Algorithm.**
- *Values*: N values evenly from From to To inclusive (value k = From + (To - From) x k / (N - 1)), each rounded
  to 0.001. From may be larger than To.
- *Cell size*: width = max(selection's box width, label width) + 3 mm; height = selection's box height + 3 mm, plus
  3.5 mm more when labels are on. Label width = the longest label's character count x 1.8 mm.
- *Positions*: swatch k (from 0) is a copy of the whole selection moved right by (column + 1) x cell width and
  down by row x cell height, column = k mod Columns, row = k div Columns. The original stays where it is, to the
  left of the first row. Copies keep every setting and sew after everything else, in value order.
- *The stepped value* is set on each copied object whose stitch type the setting applies to; other copied objects
  are left alone (a multi-object selection steps together).
- *Labels*: the value as a short number in the current display unit without the unit ("0.35"), or whole degrees
  with the sign ("45°"). Lettering 2.5 mm tall, not bold, sewn as a run, in the first selected object's thread,
  centred under its swatch with its centre 2.7 mm below the swatch's lower edge.
- Their quirk: for a satin the default spacing range is built from the *fill* spacing when the object has none;
  ours should use the value actually in force (the auto-spaced satin spacing).

**Ours.** Labels go through our lettering (a fine-line face at the smallest size we sew well, which is larger
than 2.5 mm: let the label band grow to fit). The grid must fit the hoop: reduce the columns or refuse with the
count that fits. Offer it for the fabric-level values too (pull and rows for this towel), since that is the
question our users actually have. Each swatch is checked like any design (`validatePES`, checker).

**Test cases.**
| # | Input | Expect |
|---|---|---|
| W1 | From 0.2, To 0.4, 5 swatches | 0.2, 0.25, 0.3, 0.35, 0.4 |
| W2 | A 10 x 10 fill, W1, 5 columns, labels on | Cells 13 wide (label "0.25" is 4 x 1.8 = 7.2 < 10), 16.5 high; copies at x offsets 13, 26, 39, 52, 65, all in one row; each copy's spacing is its value; label centres 2.7 below each copy |
| W3 | W2 with 3 columns | Fourth and fifth copies at (13, 16.5) and (26, 16.5) |
| W4 | Fill angle 0 to 90, 4 swatches | 0°, 30°, 60°, 90°; labels "0°" "30°" "60°" "90°" |
| W5 | A fill and a run selected, Spacing | Both copied five times; only the fills' spacing changes |
| W6 | A run selected | Only Stitch length is offered |
| W7 | Undo once after Make | Everything made is gone |

---

## 5. The agent surface (for round A1): interface only

**What we have.** `docs/roadmap.md` A1 (not started): "one job format with validation, `make(job)` returning
bytes, verdict, steps and problems as data, page API and link form, a command-line tool". Today an agent reaches
into internals (`.agents/skills/embroidery/SKILL.md`). Theirs is a live, stateful editor protocol; ours is planned
as one declarative job. What is worth taking is listed at the end.

### 5.1 Transport and conventions (ZigZag's MCP server)
- A Model Context Protocol server inside the running editor: JSON-RPC over HTTP on the local machine only
  (default port 7878, path `/mcp`, the request's Origin checked). A small separate program bridges standard
  input/output to it for clients that start a command, and can instead run the same tools headless on a document
  nobody is watching, kept only if the agent saves or exports.
- Tools act on the document in the front tab. Every call is one undo step. The person watching sees each change
  (objects being worked on are outlined and labelled).
- Coordinates are mm from the hoop centre, x right, y down.
- An **object reference** is its index in sewing order (from 0) or its name: an exact name (case ignored), else an
  exact id, else a name containing the text if only one does. No match and several matches are errors that list
  the names.
- Each tool is marked read-only or not, and the destructive ones are marked (delete, open, save, export).
- Results are JSON unless noted. An **object description** is: index, name, kind, allowed kinds, lettering details
  if it is text, source ("filled shape" or "stroke"), colour, centre and size in mm, stitch count, its *effective*
  settings for its kind (fabric defaults filled in), start/end/trim/stop when set, and its problems.
- Server instructions sent at connection give the typical flow (describe, add, place, set types, preview, check,
  save or export) and sizing advice for caps.

### 5.2 Tools
| Tool | Arguments | Result |
|---|---|---|
| `get_design` (read) | none | Coordinates note; document (name, file, unsaved, fabric id and name, hoop id and size, remove overlaps, cap order, preview colour); stats (width, height, stitches, colours, trims, minutes); every object's description; whole-design problems |
| `add_svg` | `svg` (required, a whole document); `x_mm`, `y_mm` (centre, default 0, 0); `width_mm`, `height_mm` (scale to, or fit inside both); `replace` (start a new document) | `added` (descriptions of the new objects, in order), `total_objects`, design problems |
| `set_object` | `object` (required); `kind`; `angle`; `spacing_mm`; `length_mm`; `pull_mm`; `width_mm`; `split_mm`; `border`; `spiral`; `underlay`; `satin_underlay` (a list of centre/contour/zigzag, or "auto"); `short_stitches`; `repeats`; `color`; `start`; `end`; `trim`; `stop`. An omitted field is unchanged; `null` resets it to the default. Values are clamped as in 1.1; a kind the object can't take is refused with those it can | The object's description |
| `delete_object` (destructive) | `object` | Text |
| `move_object` | `object`, `to` (new position in sewing order) | Text: the new order of names |
| `transform_objects` | `objects` (one or a list); `width_mm`, `height_mm`, `scale`; `mirror` (horizontal/vertical); `rotate_deg` (clockwise); `move_to_mm` [x, y]; `move_by_mm` [dx, dy]. Applied in that order: size, mirror, rotate, move, about the objects' joint centre; fill angles turn with them | `objects` (descriptions), design problems |
| `duplicate_objects` | `objects`; `offset_mm` [dx, dy] (default 3, 3) | `added` (descriptions); copies sew last |
| `add_text` | `text` (required); `font`, `size_mm` (capital height, default 8, 2-80), `spacing_mm`, `arc_mm` (0 straight, positive over, negative under), `bold`, `italic`, `color`, `kind` (satin default, fill, run), `leading`, `align`, `h_scale`, `v_scale`, `case`, `on_path` (an object used as the baseline, then not sewn), `path_offset`, `path_flip`, `kern` (list of index + mm), `x_mm`, `y_mm` | The new object's description |
| `edit_text` | `object` plus any of the above but position | The object's description |
| `list_fonts` (read) | `search` | Default font and matching families |
| `set_document` | `fabric` (preset id), `hoop` (id), `remove_overlaps`, `hat_order`, `connect_mm` (0-50), `preview_color` | The document part of `get_design` |
| `group_colors` | none | Text: colour changes before and after, the new order |
| `render_preview` (read) | `width_px` (200-2000, default 900), `show_jumps` (default true), `fit` ("design" or "hoop") | A PNG image of the stitches on the preview colour, plus one line: size, stitches, colours, sewing order with kinds and colours |
| `check_design` (read) | none | "No problems found", or a list of level (error/warning/note), object name and index, message |
| `get_svg` (read) | none | The document as SVG text with settings in ids |
| `select` | `object` or null | Text; highlights it for the person |
| `undo` | none | Text |
| `save` (destructive) | `path` (absolute, `.svg`; optional once saved) | Text, or an error if it could not save |
| `export` (destructive) | `format` (pes, dst, exp, jef, vp3, pec, pen, html), `path` (absolute) | Text: path and stitch count |
| `open_file` (destructive) | `path` (absolute; SVG, machine file or image) | As `get_design`, for the opened document |
| `list_documents` (read), `switch_document` (`index` or `name`), `new_document` | | The open tabs: index, name, file, unsaved, which is in front |
| `trace_image` | `path`; `colors` (2-10), `width_mm`, `x_mm`, `y_mm`, `remove_background`, `threads` (none/brother/janome), `lines`, `line_width_mm`, `detail` (0-100), `speckle_mm`, `replace` | Added objects |
| `round_corners` | `objects`, `radius_mm` (default 1.5), `kind` (round/inverted/chamfer) | Changed objects |
| `simplify` | `objects`, `level` (0-100, or automatic) | Changed objects |
| `clean_up` | `stray_points`, `tiny_objects`, `tiny_mm` (default 1), `extra_points`, `dry_run` | What it removed, or would |
| `send_to_skitch`, `machine_status` | | Out of scope |
| `batch` | 5.3 | 5.3 |

### 5.3 Batch semantics (ZigZag's)
- Arguments: `steps`, a list of at most 64, each a `tool` name and its `arguments`; `atomic` (default true);
  `label` (shown to the person as what the batch did).
- Steps run in order. A string argument beginning with `$` and a step number, then dot-separated keys, is replaced
  before the step runs by that part of that earlier step's JSON result: `$0.added.0.name` is the name of the first
  object added by step 0 (a number as a key indexes a list). The reference may be anywhere inside the arguments,
  including inside lists and nested objects. `$$` at the start of a string is a literal `$`. A reference to a step
  that hasn't run, or to a key that isn't there, fails the step with a message naming what is missing.
- **Atomic** (the default): if any step fails, the document, its undo and redo history, the selection and the
  unsaved flag are put back exactly as before the batch, and the result is an error holding the failing step's
  number, tool and message ("nothing was changed") plus the results of the steps before it. If all succeed, the
  whole batch is one undo step.
- Not atomic: steps before a failure are kept, and the error says so.
- Not allowed inside any batch: `batch`. Not allowed inside an atomic batch: `undo`, `open_file`,
  `switch_document`, `new_document` (they can't be rolled back).
- Stitches are planned once, at the end, and before any step that reads them (`get_design`, `render_preview`,
  `check_design`, `export`). Stitch counts inside other steps' results are therefore from before the batch.
  Objects' names are refreshed after every step, so a later step can name what an earlier step made or renamed.
- Result: `results`, a list of step number, tool and result per step; any images follow.

### 5.4 Refusal of unknown arguments (ZigZag's)
Before a tool runs, its arguments are checked against the names it declares. Any other name refuses the whole call,
changes nothing, and answers with the tool's name, the names it does not take, and the sorted list of the names it
does take (or "no arguments"). So a misspelt `widht_mm` is an error, never silently ignored. Arguments that are
not an object are refused likewise. Wrong value types are refused field by field with a message naming the field
("`to` must be a non-negative integer", "color must look like #rrggbb"); out-of-range numbers are clamped, not
refused.

### 5.5 What to take for A1
- Refuse what you don't understand, and say what you do take: the direct answer to our audit's "bad input is
  silently changed". Our job validator should do this at every level of a job, not only at the top.
- Effective settings in the description (defaults filled in) alongside which were set: an agent then never needs
  the recipes.
- Read-only marking; problems returned with every change, as data (level, object, message), not prose.
- A preview image and the problem list from the same call that made the change.
- All-or-nothing: our `make(job)` is atomic by nature (a job either validates and builds, or returns problems);
  the `$N.path` reference device is only needed if we ever add step-wise tools. Not needed for one declarative job.
- Clamping out-of-range numbers silently is the one thing *not* to copy: it is the silent change our audit
  complains of. Refuse, or return the value used with a note.

Test cases (interface).
| # | Call | Expect |
|---|---|---|
| A1 | `set_object` with `widht_mm` | Error naming `widht_mm` and listing the accepted names; object unchanged |
| A2 | Batch: add artwork, then `set_object` on `$0.added.0.name` | Second step acts on the object just added; one undo undoes both |
| A3 | Batch of three, the third naming a missing object, atomic | Error with step 2's message and steps 0-1's results; document, history and selection as before |
| A4 | A3 with `atomic` false | Steps 0 and 1 kept |
| A5 | Atomic batch containing `undo` | That step fails: "can't run inside an atomic batch"; nothing changed |
| A6 | `set_object` `angle: null` | Angle back to the default; other fields untouched |
| A7 | Object named "sun" and "sunrise" both exist; reference "sun" | The exact match wins; reference "su" is refused as ambiguous, listing both |

---

## 6. Not determined
- The exact corner rule of their polygon offsets (edge walk, contour levels, travel ring, overlap shrink): the
  joins are mitred with a limit whose meaning could not be read off (a library setting). An implementer should use
  a mitre capped at about twice the offset and prove it with tests F8 and the contour test.
- Whether clip paths, masks and dashed strokes change geometry in their importer: by reading, the importer walks
  groups and paths only and applies none of them; not run, so not confirmed.
- What their importer does with text when the named font is missing (a fallback face is used; which one is the
  library's choice).
- How a transform changes the stored fill angle under a non-uniform scale or a mirror (the tool's description says
  angles "turn with the objects"; the formula was not read).
- Which of their output formats switch the file-stage locks on. Irrelevant to us (ours wins), so not pursued.
- Their image trace, simplify, round-corner and clean-up internals: out of scope; only their tool arguments are
  listed.
- Nothing here was run. Every number is from reading; the test cases in this file were worked out by hand from the
  rules above and must be treated as the spec's own claims, to be re-derived by the implementer's tests.
