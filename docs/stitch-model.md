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
- **Underlay:** an edge run 0.4 mm inside the (inset) outline in 2.5 mm stitches, one line round every outline and
  hole, then rows across the fill's every 2.5 mm, also 0.4 mm inside. The edge run holds the fabric where the rows
  pull hardest. Its points are the outline's moved along their normals; one that lands under 0.28 mm from the edge
  (a sharp corner, a narrow neck) is left out and the run broken there.
- **Sections in row order, each entered at its first row** (`routeFill(…, inOrder)`). Going to whichever end of the
  first section was nearer sewed it backwards and stranded the rest behind finished rows: 275 parts against 184 over
  164 test shapes (the old drawing-based rows: 220). Each part is a trim. Sewing small sections first was no better
  (273). Pictures keep the nearer-end rule until measured on them.
- A step between rows may leave the shape by the pull and 0.15 mm, no more; further and the path is split there, as
  before. A bit of edge run that only a jump would reach is left out (`spare`): it isn't worth a trim.
- Speed: no distance transform for a shape without an inset (the edge-run and row-step tests look at eight places
  round a point instead), and one search straight to the next section before any flood: 12 test fills in 237 ms
  against 420 ms for the old rows on the same machine.
- A piece's stitch cache and a carved patch's fill are kept by the fabric's fill recipe (`sewnWith`, `carve`'s key):
  kept by "knit or not", a towel design showed cotton's fill.
