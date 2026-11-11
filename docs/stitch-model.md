# Stitch model (`design.js`, `geom.js`)

Reference for this part of Needleworks: the rules, the reason for each (it stops someone undoing it) and the number that proved it. Hard rules are in `AGENTS.md`. Add a lesson where its topic is, never as a round log.

- mm while designing; stitches `[x, y, cmd]` in 0.1 mm, y down. STITCH 0, JUMP 1, TRIM 2, STOP 3, END 4,
  COLOR_CHANGE 5.
- `Design.path(pts, lock, jump, lockAt)`: jumps (trim + locks) over 2 mm or when told the way would show; no stitch
  when within 0.3 mm of the needle. `lockAt`: lettering locks 1 mm in, under satin to come (a lock on the stroke end
  put two hits on the letter's edge).
- `Design.finish({ untiny })`: `dedupe` (a stitch into the hole the needle is in), `untiny` (Design tab: drop the
  point ending a stitch of 0.3 mm or less, never a lock's; Ink/Stitch's minimum), then `relieve()` to 24: drops
  interior points, keeps 5 points round every command, never makes a stitch of 0.3 mm or less (drops B and C together
  instead) or an A,B,A' same-hole, merged stitches under 4 mm then a second pass to 7 mm, checks windows whose corner
  cell is empty. Rounding half-to-even like the writer.
- `finish` also moves a design over 200 mm from the centre onto it (a PES box holds 204.8 mm).
- A tie-in is 0.7 mm toward the run's first point over 0.3 mm on, or 0.5 (then 0.8) where one of the run's next
  four points lies within 0.12 mm of the 0.7 one (`recipes.js` `TIE_INS`): a run whose second point is 0.7 mm on
  put three hits in that hole (71 starts over the batch: script columns begun at a junction, picture runs). All
  three lengths are within what sold designs use (0.5-0.8).
- `turnPattern` (clockwise: sideways design into the machine's hoop); `turnForMachine` thins again after the turn.
- `satin(p, width, density = 0.4, pullComp, closed, fold, wAt, shape)`: `density` = gap between hits on the SAME
  edge (Ink/Stitch default; Brother files 0.30-0.42). Stations `density`/2 apart by whichever of outer edge, inner
  edge or centre moves most (curves don't gap), sampled every 0.02 mm. Where the inner edge is hit at under half the
  outer's rate, every other pair is cut to 60 %. `pullComp` = total extra width; `wAt` tapers; `shape` gives per-side
  widths and a slant (ends cut on the font's angle). Measure satin by the same-edge statistic, not by eye.
- `zigzag(p, w, spacing)` = satin with same-edge gap `spacing`, no pull. `followRun(p, length, tol, min)`: stitches up
  to `length` within `tol` of the line, a hole at every turn over 30°.
- Continuity helpers (geom.js): closed outlines are always `loop`ed (`run`/
  `zigzag`/`satin` with `closed` stop one step short); a second pass round the same outline goes `back(e)` from the
  same start; `enter(q, at)` starts a closed path at its point nearest the needle; `rings(loops, make, from)` sews
  outlines cheapest-move first; `moveCost(d)`: up to 2 mm free, 2-5 mm 1.5 (a loose thread is worse than a trim), over
  5 mm 1.
- `fold`/`unfold`: an edge offset round an inside corner tighter than the half-width folds over (a star); cut where it
  crosses itself. Appliqué/outline edges (`edgeSatin`) use it.
- Satin borders 2.5-4 mm (frames, patch/appliqué and in-the-hoop edges): `edgeWalk` (run 0.4 mm inside each edge,
  open, ending where the zigzag starts), zigzag, satin: Ink/Stitch contour underlay, a firm edge on felt.

## Fills of drawn shapes (`fill.js` `fillPolygon`)
- Patches, filled motifs and the motif either side of lettering. Pictures fill through `tatami` on their own
  drawing (`docs/pictures.md`); the Open tab's re-stitching asks for `raster: true` (its outlines are traced from a
  drawing of the file's stitches, stair-stepped already).
- **Rows come from the outline, not a drawing of it.** Each row is the row's line cut by the outline's edges
  (even-odd, holes too), less every stretch within `inset` of an edge (the line through each edge's capsule).
  Read off the 8 px/mm drawing, a row end sat a mean 0.06 mm and up to 0.19 mm off the edge (p95 0.13; a pixel plus
  the half-pixel sampling step), against the 0.25 mm by which a motif's 1.4 mm satin edge covers its fill; now 0.000.
  The drawing is still made (`shaped`, kept by the outlines): it says which part of the shape a row lies in, and the
  travel router works on its cells.
- **Pull and rows by fabric** (`recipes.js` `FILLS`): each row runs past the outline by 0.20 mm (cotton, felt, denim,
  canvas), 0.35 (knit) or 0.40 (towel, fleece) at both ends, Wilcom's published values; 0.15 everywhere before. Knit
  takes 0.4 mm rows, the rest 0.35. Every fill's row ends lie under a satin, so the pull decides how far under: never
  past its outer edge (a motif's is 0.7 mm out, towel rows end 0.2 mm inside the outline).
- **A patch's pull is its own fabric's** (felt or twill: 0.20), whatever the design is sewn on; only its rows follow
  the design's fabric (lighter on knit, as before). Given the towel's pull, a change to Towel filled every patch
  again at every size the too-big fixes try: +100 ms on the busy design (476 -> 570 ms, over the budget).
- **Underlay:** an edge run 0.4 mm inside the (inset) outline in 2.5 mm stitches, one line round every outline and
  hole, then rows across the fill's every 2.5 mm, also 0.4 mm inside. The edge run holds the fabric where the rows
  pull hardest. Its points are the outline's moved along their normals; one that lands under 0.28 mm from the edge
  (a sharp corner, a narrow neck) is left out and the run broken there.
- **Sections in row order, each entered at its first row** (`routeFill(…, inOrder)`). Going to whichever end of the
  first section was nearer sewed it backwards and stranded the rest behind finished rows. Where parts remain, the
  sweep from the far side is tried too and the fewer kept. Each part is a trim.
- **Travel may use the inset band** (`cell` 2: the satin the inset is there for covers it). Inset by 0.6 mm, a 20 mm
  motif's arms are 1 mm wide, too thin for the router's 0.5 mm cells to join up, and every arm was a part.
- **A scrap** (a fill section under 3 mm of thread: a row or two in a corner, which rows read off a drawing never
  saw) is sewn only where the needle already is; going to one stranded the next real section.
- Parts, old rows -> these rules: 164 test shapes 220 -> 141; the 30 motifs at 20 mm 61 -> 34 (every motif one part
  but the paw, five separate pads). In-order alone: 184; nearer-end with exact rows: 275; small sections first: 273.
  Pictures keep the nearer-end rule until measured on them.
- A step between rows may leave the shape by the pull and 0.15 mm, no more; further and the path is split there, as
  before. A bit of edge run that only a jump would reach is left out (`spare`): it isn't worth a trim.
- Speed: no distance transform for a shape without an inset (the edge-run and row-step tests look at eight places
  round a point instead), and one search straight to the next section before any flood: 12 test fills in 199 ms
  against 351 ms for the old rows on the same machine.
- A piece's stitch cache is kept by what its fill reads of the fabric (`sewnWith`): a patch's rows, a motif's pull and
  rows.

## Density at the source (S2: in progress, not released)
- **Measured on v27** (points `relieve` took out of the file as made, 439 files): towel 790 in 15 of 19 files
  (GreatVibes 165, MeowScript 109, MsMadi 92, Allura 85), arcs and ovals 323 in 14 of 59 (Allura and Yellowtail
  ovals 22-67), caption starters 256 in 9 of 12 (kitchen 111 each), frames/fills/in-the-hoop 206 in 60 of 136 (51 of
  those files lose exactly 3: the starter name's own h junction), pictures 38, other lettering 25, small print 0,
  bookmark names 0 in the last pass (2-56 in the pass before the quarter turn). About 1,640 in all.
- **Where:** nearly all at a script's junctions, where several strokes' columns end on one node (each stroke's run
  out, satin back, the next stroke's start), and on the inside of tight turns of wide columns (a towel's 2.5 mm).
  Not at fills under borders, not in the borders themselves, not in the lattice alone.
- **Built so far** (`Design` with `{ ease: true }`, set by `compose`; `density.js` `Hits`; `recipes.js` `EASE`): each
  path gives way as it is handed to `Design.path`, against the hits already sewn in the colour block: a satin end
  that doesn't fit comes part of the way back across its column (short stitches), else it and its neighbour on
  the same edge are left out; a point on a straight run is merged away. A path's first and last point always stay.
- **On eight sample files** (drops by `relieve`, v27 -> cap 20 -> cap 17): towel GreatVibes 165 -> 15 -> 12, towel
  Allura 85 -> 0 -> 0, kitchen 111 -> 2 -> 0, oval Allura 67 -> 9 -> 6, arc GreatVibes 23 -> 1 -> 1, tag 3 -> 0,
  heart patch 4 -> 2 -> 0. Peaks at cap 17: tag 21, appliqué 20, heart patch 23; the script files still reach 24.
- **Left over:** what still goes over is path end points on a shared node (47 on the towel name), paths of four
  points or fewer (dots, lock steps: 10) and corners (14). The next step is at the node itself: strokes that meet
  should not each put their first and last hit on it (start a column one station in; let a run end short of a
  node another stroke already covers).
- **Not yet done:** no full batch has been run with easing on; no contact sheet or zoom looked at; timings not
  taken; `relieve` and the doctor's counters not moved onto `density.js`; the rule for a block differs still
  (`relieve`: colour change; `density`: colour change or stop).
