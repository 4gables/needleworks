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
