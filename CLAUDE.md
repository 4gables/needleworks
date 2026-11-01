# needleworks

Embroidery files for Brother home machines (PE900 first). Static site, no build step, GitHub Pages from the repo
root (https://4gables.com/needleworks/). JavaScript is the only engine; Python is test tooling only
(`tests/pe900_check.py`, `tests/batch_server.py`, venv `.venv` from `requirements.txt`). Serving a non-technical
user through Claude Code: `.claude/skills/embroidery/SKILL.md`.

Rules, the reason for each (it stops someone undoing it), gotchas, how to test. History is in `git log`; the
measurements behind each number are in the code's comments.

## Repo map
- `index.html`, `css/app.css`, `sw.js`, `manifest.webmanifest`; `js/app.js` (tabs, state, `setView`, downloads).
- `js/core/`: `formats.js` (PES writer, readers, `validatePES`), `threads.js` (PEC palette), `design.js` (`Design`,
  locks, `finish`), `geom.js`, `raster.js` (skeleton, stroke graph), `text.js` (`renderWord`), `fonts.js`, `glyphs.js`,
  `digitize.js` (pictures, `fillPolygon`, `contentBox`/`pictureImage`/`LEARN`), `brands.js`/`brandcharts.js`,
  `machines.js`, `typed.js` (all typed text: `tidy`, `lacks`, `safeName`, `uniqueName`, `initials`).
- `js/studio/`: `pieces.js` (pieces, `compose`, fitting, `FABRICS`), `ui.js` (editor, starters, warnings, one-tap
  fixes), `outline.js`, `quilt.js`, `motifs.js`. `js/doctor.js` + `doctor-worker.js` (Open tab fixes), `quality.js`
  (the checker's rules), `words.js` (problems list per view, stop/thread vocabulary), `gate.js` (the only exit for
  files: `handOut`), `sheet.js` (step text, sew sheet, cut file), `render.js` (`draw`), `worker.js`, `quilt-worker.js`,
  `zip.js`.

## Hard rules
- **Proprietary.** `LICENSE`: all rights reserved to 4Gables (a trade name; no personal name anywhere on the site or
  in the code). Every shipped file (js, css, sw.js) starts with `/*! Needleworks (c) 2026 4Gables ... */`, new ones
  too; the page has a comment, `meta copyright`, `rel=license`, a footer line. Only the fonts are third-party
  (`THIRD_PARTY_NOTICES.md`). The repo stays public (GitHub Free can't serve Pages from a private repo).
- **Clean room: no one else's code or data is committed**, whatever its licence (code, ports, icon/SVG paths, data
  tables, images). Learn from other projects only this way:
  1. One agent reads the source and writes a spec in `docs/` (behaviour, byte layouts, formulas, facts; prose and
     tables, no code, no line-by-line paraphrase).
  2. A separate agent that has never seen the source implements from the spec alone, in its own structure.
  3. Tests prove it against the spec or an outside oracle (pyembroidery from pip in `tests/`, never vendored).
  - Ideas, algorithms and numbers from papers, manuals, docs and issues may be used, credited in a comment
    ("Ink/Stitch's contour underlay"); their code or wording may not. Thread colours etc. come from the maker's own
    published source, cited in the file header. Drawings are drawn here, without looking at icon sets.
  - Someone else's asset needs a reason (clearly better for customers, or the industry standard) and must be a
    permissive free asset (OFL, MIT, Apache), committed as is with its licence and a line in
    `THIRD_PARTY_NOTICES.md` saying why. Today: the fonts. Code and data tables never qualify.
  - Replaced this way: `formats.js`/`threads.js` (a pyembroidery port; spec `docs/formats-spec.md`), `motifs.js`
    (Phosphor), `brandcharts.js` (Embroidermodder).
- **The PES writer is locked.** `writePES` output is frozen byte for byte by `tests/fixtures/golden/*.pes` (CI);
  browser and Node write identical bytes. Features hand stitch patterns to `writePES` and never touch
  `js/core/formats.js`. Change it only to fix a proven machine problem, then redo the Brother checks before
  regenerating the golden files.
- **PEC design box.** Brother machines read the two 16-bit fields after `0x1E0, 0x1B0` in the PEC stitch block as
  the design box's top-left (big-endian `0x9000 | -minX`, `0x9000 | -minY`) and decode stitches after them.
  pyembroidery writes its opening jump there: a real PE900 showed the design shifted and clipped to half. We write
  the box, then the opening jump (all 380 PES files in PE-DESIGN 11 have the box at the stitch minimum). The reader
  decodes the machine's way; stitches outside the box = `misplaced` (read as meant: two long-form values are an
  opening jump, else the first stitches of a file starting at the origin), refused by `validatePES`, rewritten when
  opened. PE-DESIGN reads only the PES design block (`CEmbOne`/`CSewSeg`), so "PE-DESIGN opens it" never tests the PEC
  bytes the machine sews. Same bug: kircherlabs/embroidery-studio#4, nkymut/p5.embroider#42.
- **PES layout:** full v6 (header, thread chart, `CEmbOne`/`CSewSeg`, PEC, colour addendum) as pyembroidery
  `write_pes(..., {"version": 6})` plus the box; coordinates half-to-even (`pyRound`); stitches over 7 mm and jumps
  over 121 mm split; every jump written as a trim (no uncut-jump flag 0x10).
- **Every download goes through `validatePES()`**: the source's needle movements (PEC's zero-length anchors after
  jumps ignored), an END, enough threads, toggle bytes 2,1,2… (as Brother writes), fit in the field less 2 mm.
- **PEC palette:** 62-64 are appliqué codes on Brother machines, not pyembroidery's Orange/Cream Yellow:
  `PEC_MATCH` excludes them (inkstitch/pyembroidery#140). Two colours never share a thread, so label threads with
  `machineThreads()` (or an opened file's palette), never plain `nearestBrotherThread()`, or site and machine disagree.
  Red-mean matching (`colorDistance`) is what the machine shows (a dusty pink can read "Gray"). Order = block order.
  Thread descriptions in the file are ASCII.
- **Every cut is locked** (a trimmed thread works loose: PEmbroider#105). `Design.tieOff()`: 0.7 mm back and forth
  along the last line before each trim, colour change and the end. Tie-ins: 0.7 mm toward the first point over 0.3 mm
  away (repeated points made zero-length tie-ins). One hit of each lock goes 0.35 mm aside toward the stitches it
  locks (`inward`): no hole takes three hits, and it hides.
- **Short jumps:** the PE900 never trims a jump at or under its "jump stitch not to trim" setting (5 mm lowest,
  manual p.38), so 1-5 mm jumps stay as loose thread. Not sewn as connectors (lines between print letters): counted
  ("N loose threads to snip", `shortJumps`), both ends locked. `Design.path` jumps from over 2 mm.
- **24 needle hits per 1 mm square per colour block**, at any 0.1 mm grid offset (the machine's grid isn't ours):
  the densest spot in sold designs. A pause between two blocks of one thread (STOP) starts a new block.
- **Checker rules** (`quality.js` = `pe900_check.py`): longest over 12.1 mm; tiny (0.3 mm or less in whole 0.1 mm:
  float 0.3 reads 0.29999) over 2 % bar the first 6 after a jump/trim/colour change; same hole over 1 %; density over
  24; satin same-edge gap over 0.6 mm; over 99 colour blocks (the PE900's limit); PEC thread count not one per block;
  design block disagreeing with PEC.
- **Hoops** (`machines.js`): fit the field minus `MARGIN` 2 mm. PE900 5x7 = 130 x 180 mm, 4x4 = 100 x 100 mm.
- **Download names are ASCII** (`safeName`: transliterates Ł ø ß æ œ đ þ, Greek, Cyrillic, Hebrew; `CON_.pes` for
  Windows device names): the machine's USB reader may not show others.
- **The preview is the file:** `setView` decodes `v.bytes` with `readEmbroidery` and draws, counts and fit-checks
  that; thread labels come from the file's own palette.
- **Stitch changes ship only after** both browser batches pass `pe900_check.py`, the VM check passes and no rule
  above is broken. UI-only changes don't need the VM.

## Stitch model (`design.js`, `geom.js`)
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

## Lettering (`text.js`, `raster.js`, `pieces.js`)
- `renderWord` draws on a canvas (`fontKerning = "normal"`), adds swashes, bridges letters the font leaves unjoined
  (Sacramento A→s), skeletonizes; `skeletonEdges` builds the stroke graph and prunes spurs; `order()` walks it: each
  stroke a centre run out and a satin back, every forward run satined exactly once, no jumps inside a connected word.
  Each walk ends where it began, so moves between print letters are trims whatever the order. Script pieces are
  chained by `order(edges, near, loose)`: a walk may start at any node or mid-stroke, a DP picks the starts with the
  fewest costed moves; print letters and pictures keep the leftmost start; bent text keeps the chaining
  only if it costs no more once bent (`unbent`). Satin columns carry `reach` (half width + 0.1 mm) so `Design.path`
  stitches to a start under the column instead of jumping (knit's 2.05 mm half-width: 8 trims round one junction).
  Strokes count as at least half the x-height when sizing (a whole x-height for marks alone: "." was sized
  5.9e12 mm). Punctuation drawn into a letter is moved clear (`apart` in text.js: up/sideways above the letters,
  sideways among them, else shaved if most survives); swashes never leave from a mark. Lettering drawn before
  its font loaded is never cached (it's the fallback font).
- Swashes (lead-in, tail): one calligraphic stroke from the letter's stroke end along its tangent, a shallow cup
  under the baseline, a flick up. E, O (no low entry) join at their lowest left point. Never flat along the baseline
  (reads as a ruled line).
- Swashes are typed: `~` at the start/end of the words (`swashes`/`unswashed`/`withSwash` in typed.js; spaces beside
  it ignored; one in the middle is the font's tilde). `letters()` strips them per call, so each straight line has its
  own and arches/waves/bridges take the first line's start and the last line's end; script lead 1.8 / tail 2.6
  x-heights, print dashes 2.2 (`SWASH`, the old bookmark's). Sized by the letters alone (`info.firstX..lastX`), so a
  name keeps its size with or without them; kern entries for the `~`s are dropped. Labels, step text, file names and
  names batches read `unswashed`; each batch name inherits the design's ends. Editor: "Swash/Dash before/after"
  toggles (`data-swash`) that add or remove the `~`.
- Print fonts (`print: true`): no bridges (the machine trims between pieces); decorations are dashes on the middle of
  the x-height (cap height for all-caps); spur pruning 0.45 strokes (script 1.3) so t bars and a stems survive; dots
  get a short stroke (`dots`); stroke ends reach the ink's edge (`reachEnds`; thinning stops half a stroke short and a
  single-storey a sewed as o), sized from the strokes before that (`info.sized`). Separate pieces always jump (`gap`;
  an i stem came within 2 mm of its dot and was stitched to it.
- Skeleton work: `tongues` keeps short script ends (an e's tongue, a y
  tail); `knots` contracts edges under 0.75 stroke between junctions (each was a star of satin); `untangle` caps
  merges at 2.4 knot lengths. Print corners: self-loops under one stroke dropped; a corner stroke is sewn as wide as
  the ink less (stroke - satin) / cos(angle), stopping at 0.4 mm (`wAt`); in Thin line strokes run on to where centre
  lines meet (`pointed`: an A read as Y). Ends are `decurl`ed and cut on the font's end line (`endShape`/`endCut`);
  sides stay within 0.15 mm of the ink (`sideClip`). Measure on the engine's mask with locks, not an image overlay.
- Satin width: `min(3.5, 0.2 xh, max(stroke, 0.12 xh, min(0.15 xh, 1.2)))`. Automatic: satin from 0.8 mm, fine line
  below (loops stay open); explicit Satin at least 1.0. (15 % of big x-heights filled thin scripts' e's; satin only
  from 1 mm sewed 20 mm script names as a thin line.)
- Counters: `counterPockets` measures gaps between centre lines; `counterCaps` narrows the strokes round one that
  would close (0.8 mm between needle points after pull; gaps under 0.6 mm left), `notchCaps` loose short strokes down
  to 0.8 mm. Explicit Satin and towel ignore both. `loopsFill` warns when auto satin still closes a loop (switching
  those to a fine line left names thin at 28 mm).
- Satin spacing 0.38 (40 wt), 0.34 under a 6 mm x-height (sewn for 60 wt; "Small letters" tip: 60 wt, 65/9-70/10
  needle), 0.42 knit, else `THREADS[wt].satin` (+0.04 knit). Pull 0.15 mm a side from 1.5 mm satins, 0.05 below (more
  closes counters); knit +0.15. Underlay: from 2.5 mm (knit 1.5) a zigzag (width - 0.8, 2.5 mm) as the walk's way
  out, else a centre run. Satins start from the stroke's centre point and the underlay ends there (starting on the far
  edge put back-to-back satins 2.4 mm apart: a jump each).
- Fine line: bean stitch with `followRun(p, 1.6, 0.1, 0.8)`, points at least 0.4 mm apart (`spaced`). A lone stroke
  under 0.9 mm (full stop) sews 0.7 mm out and back once. Satin dots: one satin at least 1 mm long, no run under it.
- Layout (`textRows`): up to 3 lines at the first line's x-height; `align`, `leading`, `spacing` (print only:
  pulled-apart script came out unjoined), `wave`, `bridge`, `flip` (not in the cache key). Letter pairs `kern` (print
  only) add to the font's kerning; `rekern` keeps them across edits; `overlapping` warns.
- Arches: an ellipse (`radius`, optional `ry`), letters spaced by arc length; `followFrame` sits inside an earlier
  circle/oval/scallop. `archTight`: letters reach inside over 0.8 x the tightest radius of curvature, or an up arch's
  letters exceed 0.6 x its radius; script arched up keeps x-height at most 0.24 x radius. `archFit` grows the arch,
  `archRoom` flags over 55 % of the curve (widen to 45 %), `archShrink`, `archStart` (~30 % round). Words wrapped into
  themselves block Download.
- Monograms: print ones spaced by their stitches in 0.5 mm bands (gap + 0.4); in a frame they fit both ways
  (`fittedSizes`, 0.92 of the frame less half the gap); `monoSize` grows only while clear of the frame; checks run per
  initial (`eachInitial`). Initials take 12 characters; a name there gets "Sew it as lettering" (`asText`).
- Fonts: `@font-face` families `NW <Font>` (WOFF2 in `fonts/`), `document.fonts.load()` before drawing; a failed
  font stays failed until reload, so `loadFont` adds a second FontFace (Try again). `glyphs.js` = each font's
  characters (regenerate with `tests/make_glyphs.py`); `typed.js` `lacks` is the only glyph check, by grapheme, NFC
  and NFD alike, used by the editor, Download note and names batches. Per-font `min` x-height feeds `minSize` (default
  4 mm). Fonts after Meow Script are free lookalikes of embroiderydesigns.com samples (`note`). Try a font in
  `tests/browser/fonts.html?name=<word>`; reject unjoined or spurred ones (Petit Formal, Comforter, Damion).

## Design tab (`js/studio/`)
### Compose and stages
- Pieces (lettering, monogram, frame, motif, appliqué letters, file) are built in mm round the hoop centre, composed
  in list order, handed to `writePES`. The preview keeps the hoop centre fixed (`draw(..., { center })`); the machine
  centres the design anyway (off-centre layouts say so; one dragged past the field recentres, `settle`).
- `pieceStages` -> stages; `compose(pieces, hoop, opts)` -> design, steps, `before` (Have ready), `after`, `hoop`
  (step 1), `cut`, `solid`. Neighbours in one thread share a block. A stage joins an earlier same-thread block (one
  pause fewer) only if it overlaps nothing it would jump ahead of (bbox + 1 mm), isn't appliqué, and the block isn't
  `under` (hidden in the preview). `last` stages go after everything; a patch's `edge` after everything on it (covers
  the lettering's pull). A visible stage joining a hidden block un-hides it.
- `build()` enters every closed ring where the needle is (`enter`), or where the next part leaves when `moveCost`
  says so (never at the start of an appliqué's own stages: seam placement unchanged).
- Opts `fabric`, `thread`, `baste`, `marks`, `dragging` (quilting and carving reused until the drop), `later` (quilting
  jobs for `quilt-worker.js`; `quiltDone` fills the cache, Download reads "Quilting…" meanwhile; byte-identical). `wt` is set for
  the length of `compose`; stitch caches key on it.
- Save / Open saved / copy-paste: `{ needleworks: 1, pieces }` JSON plus `hoop`, `turned`, fabric, thread, `two`.
  `cleanPiece` checks and clamps every field (sizes 0.5-180, so fitted designs reopen as saved), tidies text
  (`tidy`) and drops `font` on non-lettering, on open, paste and the saved state (crafted files threw).
- Starters (`ui.js`) reset fabric (cotton unless they say), thread weight and Turn hoop, are fitted to the hoop
  (`fitHoop(false)`), may carry a `tip`, draw stitched thumbnails (`draw(..., { pad })`) in one scrolling row.
  Tall ones (over 1.6 x as tall as wide: the bookmark) lie down in their card. 2026-10-31 added Bookmark, Luggage tag,
  Pocket monogram, Tote bag, Stocking cuff, Birth announcement, Wedding keepsake, Book plate, Pet bandana, Kitchen
  sign (existing pieces only). `studio.starter(id, tweak)` picks one from code (old #bookmark links).
### Fabric (`FABRICS`) and thread weight (`THREADS`)
- Each fabric holds `ready`, `hoop`, `tip`, `after` so supplies, step 1 and finish agree. Cotton, felt, denim, canvas
  sew alike. Knit: zigzag underlay from 1.5 mm, +0.15 mm pull a side, 0.42 satin, Lighter patch fill.
- Towel / fleece: lettering always satin (a fine line sinks), at least `min(2.5, 0.3 xh)`, on a knockdown lattice 0.3
  mm wider each side (zigzag out and back along each stroke, 2 mm apart: 3 was too open), sewn per connected word
  just before its letters (no jumps). Worse: a tatami of the grown word (+17 trims), one 1.5 mm zigzag (read as sparse
  satin), 1 mm wider (fringe), adding zigzag underlay (24 hits/mm²). `towelMin` checks counters under the column;
  within 4 % isn't warned. `fabricTip()` says when fabric changes nothing (`ownBase()`: patch, ITH, quilted).
- Baste first: 4 mm run box 9 mm round everything (clamped to the hoop), unpicked at the end. The towel starter sets it.
- Automatic = 40 wt, small lettering for 60. 30 wt: lettering 0.45, other satins x1.15, fills +0.05. 60 wt: 0.34,
  x0.88, fills unchanged (0.3 mm rows fail the check).
### Frames, appliqué, patches
- Borders: line, bold, satin, patch, appliqué, `ith`, `zip`; `quilt` stipple | echo. Bold laps and tack-downs go back
  from the same start (`back(e)`; a reverse cost trims and long jumps).
- Heart: top dip filled with a 3 mm round, bottom cusp an arc of a 1.8 mm circle (a satin can't turn a sharp inside
  corner: underlay poked out).
- Appliqué: placement, pause (lay fabric, trim), tack-down, pause, satin. Real appliqué (`appliqued()`, not an ITH
  front or the pouch) shows the guide (`#st-appl`) until "Got it" (`studio.applSeen`).
- Appliqué letters (`APPLIQUE_FONTS` Graduate, Lilita One, Alfa Slab One): each ink piece closed (`closeMask`,
  `CLOSE` 1.4 mm; closing the word merged letters), traced by marching squares (holes too), Douglas-Peucker 0.1 mm,
  filleted 1.6 mm (`filletPolygon`); letters spread to `GAP` 4.9 mm (1 mm of fabric between satins). Satin 0.4 mm
  outside the placement line (`outward`) covers a ~1 mm trim; width 2.0-2.8 (min dimension / 3.5); holes under 3 mm
  inscribed radius (`holeRadius`) get a satin 0.2 mm out, at least 1.6 wide, 1.6 mm left open.
- `applRoutes`: moves between outlines only where hidden. Placement: inside the letter or under satin to come.
  Tack-down: along its line, then across gaps the satin covers. Satin: from its outer edge into the next. Covered =
  0.15 mm short of the satin's reach (1.8 out, 1.0 in). New runs start 5.5 mm or more from the last stop, across
  pauses. Each stage starts a third further round (seams don't stack).
- Cut files are the outlines (`cut`, placed with the piece), never the placement run (tie-ins cut slits). The preview
  fills placement outlines with fabric (even-odd; `rings`; segment ends within 5 mm join: the bookmark's outline stops
  a stitch short), from closed outlines only.
- Patches: `fillPolygon(loops, opts)` (inset 1 mm, even-odd) = underlay + tatami at Dense, then the satin edge covers
  the row ends. `pattern` (`FILL_PATTERNS`: tatami, Brick, Chevron, Wave) and `blend` (two layers, spacing varying
  gradually, `share` in `tatami`; random row assignment made jumps everywhere).
- `carve`: a patch's fill is cut away under pieces whose median column is at least `CARVE_W` 3.4 mm, holes 20 mm² or
  more, 1.5 mm inside the outline; thin lettering keeps the fill as its base (carving every stroke tripled trims).
  Cached per patch shape, piece stitch hash and hole mask (it was the slow part).
- On a patch a piece gets a thread that shows (`against`); `underPatch` flags a later patch covering it.
### In-the-hoop
- `ith` (Ornament, Key fob): appliqué front, the pieces, then a `last` stage tacking taped-on backing and satining
  through every layer. `hang` adds the ribbon.
- `zip` (Zipper pouch): zipper line, pause, tack 5 mm either side of the teeth (#3 nylon coil), pause (two folded
  fronts), tack the outline (`fabric`, `nocut`), topstitch, the pieces, `last`: zipper half open, back face down,
  three times round. Zipper line overhangs 5 mm a side. New pieces go below the topstitch (`frontPanel`). `before`
  sizes fabric from the frame + 2.5 cm.
### Quilting (`quilt.js`)
- Free space (`freeMask`, 4 px/mm): frame inset 3 mm (line/bold) or 4.5, `clear` 2.5 mm from other pieces' stitches
  and `solid` areas (it ran under an appliqué heart). Cache keyed on a hash of every obstacle point.
- Stipple (`space` 5): seed = outline of a random spanning tree over knots `NODE` 1.5 x space apart, then `relax`
  (repulsion under `space`, push off the edge, bending, growth where there's room but not at the edge) and
  `followRun(2.5, 0.15)`; fixed seed. Worse, don't retry: a grid spanning tree (a maze of corridors), averaging only
  (V points), Laplacian pull, long-range repulsion, knots 2 x apart (sparse), full growth at the edge.
- Echo (`gap` 4): rings are levels of a/(a+b) (out from the pieces, in from the frame), so they morph from the
  lettering's shape to the frame's; `chain` sews them innermost first as a spiral (jumps between rings were loose
  threads under the 5 mm trim setting).
- The quilt stage goes in the frame's thread right after the frame, before a `border: true` stage, led onto the frame
  by `toFrame`, the border starting there (`startAt`). Starters: Mug rug, Coaster, Quilt block.
### Motifs (`motifs.js`)
- Our own drawings: 256-unit paths from circles, ellipses, rounded polygons, brush strokes, nonzero, parts at least 26
  units (`tests/browser/motifs.html?sheet=shapes|stitch`). `FACING` ones mirror for deco.
- `style`: fill (`fillPolygon(loops, { inset: 0.6 })` + 1.4 mm satin edge), outline (`edgeSatin`), applique. Traced
  like letters (`motifOutlines`). Warn under 25 mm filled, 30 mm otherwise. Lettering `deco` puts one either side.
### Placement, fitting, warnings
- One placement path, `place()`, for add, duplicate, single paste and file add: frame first, where it is if clear,
  `freeRoom`, else a toast; multi-paste uses `spotFor` or "Paste anyway". A piece shrunk to fit must stay `readable`.
- `spotIn`: the biggest unturned frame's front, middle first, then round what's in it, shrinking to `least(p)`; never
  outside an ITH frame. No room: `freeRoom` (nearest free spot, still one hooping, re-checked after rounding), else a
  toast; "Add it anyway" / "Paste anyway" are the only ways past the hoop.
- Two hoopings only when chosen: the `two` flag ("Sew it in two hoopings"; saved, in snapshots, cleared once it fits).
  Otherwise too big is a note offering two hoopings / Fit / Turn (a pasted copy or a smaller hoop used to split
  silently).
- `touching`/`touchingAll`/`collisions`: needle points every 0.5 mm along stitch lines (`cloud`/`near`) at fitted
  sizes, under `CLEAR` 1.5 mm (~1 mm of fabric); patches excepted.
- `fittedSizes`: lettering centred in an earlier frame fits across it, then shrinks 0.5 mm at a time (to 60 %) to
  clear it by CLEAR (`clearOf`). Fit to hoop shrinks until what's sewn fits (outlines omit satin and swashes) and stays
  fitted (`fitted`); too-big sizes never round down to look as if they fit, and shrinking rounds down. Fit to hoop is
  offered only when `scaledFit` (current stitches scaled, no re-stitch) leaves nothing newly too small or touching.
- Every one-tap fix is checked before it's offered (`landing`: fits, or fits turned -> "... and turn the hoop", else
  the text says what would go wrong; nor if it hits anything new (`touchingAll`) or leaves its frame); a fix that
  turns the hoop is one undo step: one size for too small/towel (`minSize`, `towelMin`), `lineChoice`,
  `clearSize`, `moveAway`, `frameFor`, `archShrink`, run up a tall frame (rot -90), "Sew it as Cotton",
  `twoHoopings` (turn, or split lettering at a middle word gap). Never a size the frame fit would shrink back.
- Problems: one list per view (`words.js`): `problems: [{ id, level, text, piece? }]`, levels `block` (no file), `look`
  (said everywhere), `tip` (with the steps); `problemsOf(v)` adds the file verdict as `file:<key>` (beside Download,
  the dialog, the checkup only); `SHOWS` maps levels to surfaces. Producers: `pieceProblems` (Design; the editor
  renders the same list with its fixes via `said`, `data-problem`), `fineUI`/`ownedNote` (Picture), `showOpened` +
  `checkupWarns` (Open). Renderers `problemsInline`/`problemsItems`/`problemsHtml`. A new warning must go through the
  list (editor, Download note, dialog, steps, sew sheet, share text, Sew along all show it; R8 fleece "closes up" was
  in the editor only while the dialog said Checked).
- `clearSize` is a binary search (4.7 s -> 0.29 s on a 113 mm heart).
### Two hoopings (`splitPieces`)
- On `overBy`, whole pieces (never a cut stitch) split along the long side at the most even cut where both fit.
  Basting crosses (`crossSpots`: 1.5 mm clear, near 1/4 and 3/4, 20 mm apart if possible) end the first file and
  start the second (`marks`), named as the machine shows them (`crossName`); `{ rehoop: true }` step (`crossStep`).
  ZIP of both, each validated; step view, sew sheet, Sew along, share and names batch off. Manual method (Embrilliance
  patents seam-hiding). One piece over the hoop can't split.
- Not splittable: drawn in a pretend 2 m hoop, "Too big for this hoop", old file cleared. Past 204.8 mm from its
  centre the PEC box's 12 bits overflow and it reads back shifted: `unwrap()` (preview only).
### Turn hoop
- Per tab, off by default; off on a square hoop (`square()`). The Design tab lays out in the turned field
  (`designHoop`) and turns the file clockwise (`toMachine`, names ZIP and cut file too): the PES is always as the hoop
  clips on. Turned files (pictures too, `turnedFile`) get a hooping note (`TURN_PIC`). An undo step; saved.
### File pieces
- Opened PES/DST become pieces: blocks start at their first stitch (`fileBlocks`), keep the file's exact Brother
  colour; blocks named Placement/Tackdown/Cutting get appliqué words; same-thread blocks keep their pause. Resize via
  `orig` + `scale` 0.5-2.5, re-stitched by `fix` in a worker (`resizeFile`/`restitchFiles`; `pending` holds Download).
  Open tab "Add words to this design" (`studio.addWords`).
### One for each name
- `main()` (biggest text or monogram, letters before a date) names the file and is swapped. Names drawn at the
  design's letter scale (`inkHeight`), keep bold, shrink to fit (90 %… 55 %) or are captioned; a missing glyph refuses
  a name; past 40 are left out; turned batches turn every file. Each file validated and judged;
  `<starter or file>_<N>_names|monograms.zip`, names deduplicated ignoring case (emma/Emma collide on macOS, FAT).

## Bookmark (a starter since 2026-10-31)
- Was its own panel and engine (`bookmark.js`, `#panel-bookmark`, `bookmarks_N.zip`); now the first "Start from" card,
  pieces like every other starter: `SHAPES.bookmark` (tall, top corners cut 0.18 w, filleted 3 mm) with
  `border: "ith"`, `hang: false`, `eyelet: true`, and `text "~Emma~"` Sacramento 26 mm at `rot: 90` (reads top to
  bottom), all one thread. Font, colour, moving, fabric, names batch, Sew along etc. are the Design tab's.
- `eyelet` (ITH frames only, `hasEye`): a 4.2 mm ring of 2.2 mm satin (run, zigzag, satin) 13 mm below the top, sewn
  in the `last` stage before the border; `frontPanel` starts below it, and the Have ready / after texts add Fray Check
  and the ribbon. The Luggage tag starter uses it too.
- `fittedSizes` handles lettering turned a quarter: its length fits the frame's front lengthwise less 4 mm at the top
  and 7.8 mm at the bottom (the old box), its height the frame's width; long names shrink.
- Old `#bookmark` links (README, the skill, bookmarks people saved) open the starter with the old panel's saved
  `nw:bm.*` name/font/colour/swashes (`oldBookmark` in app.js), then those keys are dropped.
- Changed from the old engine: the name joins the tack-down block (3 blocks / 2 pauses, was 5 / 4), the satin width
  is the lettering rule's (was a fixed 1.8 mm), the backing is the ITH's (taped under, trimmed after), print letters
  use the Design tab's skeleton work. pe900 batch keeps the `bm_*` file names.

## Pictures (`digitize.js` in `worker.js`)
- One job at a time, newest kept; restarted after 60 s. Styles: Filled (`build`), Line drawing (`lineArt`),
  Cross-stitch (`crossStitch`). No fabric selector: density is the only fabric knob.
- Colours are learned once per picture (`learnColours`, `LEARN` 800 px copy of the content box) and labelled onto any
  working image (`labelWith`): Size and Turn never change threads (`analyze` = both, for the batch).
- Palette: `FINE` 24 k-means clusters on flat pixels, background shades set aside, merged pairwise, cheapest first, to
  the count asked and on while under `SAME` 7 (CIEDE2000, hue weighted, darks below L 30 read black, non-solid groups
  cheap, cross-family dear). Each count = the next with one split (more colours never lose one). Default 6
  (`DEFAULTS`). Worse: kL 2 (stems into leaves), 16 clusters, folding slivers into neighbours. `findFrame`: an edge band
  of one colour family is a frame; learned again without it.
- Threads: each group the nearest unique Brother thread no bigger group took (CIEDE2000, never 62-64; plain Lab sent
  olive to Russet Brown); greys and other hue families (`FAMILY`, where Brother's names change) cost more for hued
  colours; the background's thread is skipped unless within SAME. Swatch = solid pixels' mean. The writer's red-mean
  then picks the same thread. Owned threads only: `toPalette()` merges colours landing on one spool.
- Colours from thin lines: `cluster(..., lines)` also learns from pixels flat along a line and not a blend (a 1-2 px
  line is never flat every way); those clusters take only pixels within ΔE 12 or not a blend of two others. Pale
  fringes (JPEG halos: 80 % within 3 px of a stronger colour over 1.5 SAME away) and soft shades (drop shadows: 70 % of
  the edge with the fabric soft over 5 px) are fabric unless the whole picture is soft. Colours under SAME apart
  merge whatever their size. Worse: half-soft colours to fabric when threads run short, scattered pale specks as
  fabric (both erased etsy_1's pale flowers).
- Size = the sewn design's longer side (`picturePlan`, capped to the field), rebuilt when over 0.4 mm off; over the
  field it shrinks, not errors. 8 px/mm (5 lost notches).
- Filled: shapes 1 mm or wider get tatami following the outline (skeleton satin broke corners); parts under 2 x
  `THIN_PART` and lines under 1 mm sew a triple run, never dropped. Specks: under 4 mm² and 2.5 mm across, groups
  under 6 mm of line, walks under 1.5 mm (`lostLines` reports dropped fine lines). Kept: text dots on the fabric (>= 0.8 mm across, 0.6
  mm², within 5 mm of their colour or another such dot) and marks >= 2 mm long, 1.5x longer than wide, within 2 mm of a
  bigger piece of their colour (apostrophes). Thin shapes (< 2 mm) 0.05 mm
  pull, else 0.15. `OVERLAP` 0.35 mm under later colours, shape by shape (growing the raw mask merged specks);
  neighbours alternate angle (+90°). `DENSITY` Standard 0.4 (the app's default; `DEFAULTS.density` is Dense) / Dense
  0.35; 0.3 fails the check (row links under 0.3 mm). Row steps split to 3 mm, row-end stitches over 4 mm halved.
- Travel (`makeRouter`, A* on 0.5 mm cells; Ink/Stitch's tatami travel): `routeFill` takes sections in row order
  through rows not sewn yet (`reach`), at most `SEWN` 3 mm on finished rows, repeated travel costs more, `WORN` 20
  crossings closes a cell. Between shapes (up to `TRAVEL` 10 mm) travel hides under fill still to come; moves under
  2 mm are sewn; else a jump over 5 mm (trimmed) beats 2-5 mm (loose). Budgets in cells (`routeBudget`), not time, so
  browser and Node match.
- Line drawing (`opts.line`, Auto = darkest): outlines once where colours meet, none between colours within ΔE00 15;
  dark bands (`BAND`) and whole even strokes sewn once along their centre (both edges drew double lines), decided once
  per colour (centre lines if 80 % of its long pieces are strokes; fat letters outlined; marker lines up to 6 mm;
  spurs pruned at 0.6 width; narrow elongated parts of any colour centre-lined); text dots a short out-and-back line;
  `closeSlivers`; `lineEnds` reach the ink's edge; pieces under 2 mm dropped (`spur: 1`: pruning cut letters apart);
  ends within 2 mm of another drawing joined (3 mm drew bars).
- Cross-stitch (`cross` mm cells): a row is two diagonal zigzags out and back plus one straight stitch (climbing every
  edge drew bowties); runs chained by Dijkstra over cell corners, else a jump over 5 mm; a lone cell dropped only if
  nothing touches it.
- `fine` (`narrowGaps`: gaps under 0.5 mm, at least 2 mm² and 1.5 % of the area) warns; notches under ~0.5 mm can't
  be kept by thread. Errors carry `code` (small, cross, skipped, empty); only followable advice is offered.

## Open tab (`formats.js`, `doctor.js`, `quality.js`)
- Open logic is `doctor.js` `openedFile` (shared by app.js and the fuzz): designs start with a jump to their 1st
  stitch, lose jumps to nowhere (each became a stitch where it ended) and thread changes before the 1st stitch
  (`firstMove`), and move onto the centre when over 200 mm out (`centred`).
- `readEmbroidery`: PES, PEC, DST (three jumps = trim). Cut-short (`endsEarly`) and `misplaced` files are saved
  rewritten. `designBlockAgrees` flags a v6 design block that isn't its PEC block. `HARD` failures (thread count,
  palette 62-64 unless named appliqué/placement/tack-down, disagreeing block, over 99 blocks) are never saved as they
  came: rewritten, or shown but not saved. Passing untouched files download as their own bytes.
- `checkup(readEmbroidery(bytes))` reads the file as it will be saved, counts from quality.js: `peak` at every
  offset, tiny past max(50, 1 %), satin gap measured along the edge, across the stitch (60 % short stitches on curves
  aren't gaps; same in pe900_check) (under 0.25: "Even out"), stitches over 10 mm (note) and 12.1 mm ("Split
  long stitches"), jumps shrinking brought under 5 mm, a stabilizer hint.
- `fix(pattern, { scale, tiny, thin, sort, join, satin })` in `doctor-worker.js`. Shrinking ticks Remove tiny and Thin.
  - `landJumps` (also on open): a jump lands on its first stitch (the writer puts the needle down where a jump ends:
    short-stopping jumps became loose threads); a first stitch followed by one over 12.1 mm becomes a jump.
  - 80-120 %: scaled, rounded to 0.1 mm, zero-length dropped; `respace` brings satins into 0.3-0.5.
  - Past that, `restitch` (50-250 %): zigzag columns rebuilt at the source density within `SATIN` 0.3-0.5, satin up to
    `WIDE` 30 mm (filling wide columns criss-crossed); zigzags over `OPEN` 1 mm stay lines (underlay); ends reach `EXT`
    0.5 mm only where the source sews (`COV`, `BOX`); fills refilled at `ROWS` 0.35-0.5 per block and direction,
    minus earlier directions; the rest are runs. Over `MAXS` 6.8 mm is `split` into `PIECE` 5.5 mm with staggered
    cuts (the writer halves over 7 mm out of `relieve`'s sight); crowded edges get short stitches (`SHORT`). Worse:
    split satin 7-14 mm (39-49 hits/mm²), fixed-place cuts, filling columns over 25 mm.
  - `relieve` if thin; `slide()` always; `dropTiny` when tiny and after any re-stitch.
  - `sortColors`: a block joins the last earlier one of its thread if nothing sewn between touches it; off for machine
    stops, DST and same-thread pauses (`pauses`: fabric steps). `fewerBlocks` for over 99 blocks; `blockThreads`.
- `_fixed` (`<name>[_Npct]_fixed.pes`) only when it passes; `fixedCopy` retries up to 3 times.

## Threads and brands (`brands.js`, `brandcharts.js`)
- Brother (Artspira numbers), Isacord (numbers only), Sulky Rayon, Robison-Anton Rayon, Hemingworth, each from the
  maker's own source (file header). No Sigma or Madeira.
- Naming decision: spools are bought and stored by brand + number, and names vary even between resellers. So a thread
  shows swatch, the machine's name (its screen at the colour change) and "≈ Brand number"; a maker's name only where
  published; no translation or toggle. Labels only: files carry PEC colours.
- Spool matching is CIELAB (red-mean called black "Ivy"). Threads I own: searchable swatches (`chartSpools`); the
  Design tab's "Yours:" row (`api.ownedSpools`) gives a piece the spool's colour, the file the nearest PEC; `far` flags
  a poor match; Have ready splits "Your threads" / "To buy" (`ownSpool`).

## App and UI
- Opens on `#design`; default name Emma.
- Side by side needs 700 px wide AND 560 tall (200 % zoom on 1080p is 960x540); then 100dvh, only `.controls`
  scrolls (`position: relative`). Tiers: max-height 900 hides ledes (not `.sewn-on` tips); 700-1365 x 560-760 slimmer;
  header tabs wrap to 1259 px, no MACHINE label to 1365, no tagline to 1480. Stacked layouts scroll, preview first in
  the HTML (Tab order). Every stacked layout (`(max-width:699px),(max-height:559px)`) has the fixed Download bar (in
  Picture/Open it holds the chooser too) and `scroll-padding-bottom` so focus stops above it; the Download warning
  sits under the preview; phones: preview `calc(100svh - 370px)`, too-big message under the hoop and in the piece
  controls (`#st-big`). Body `overflow-wrap: break-word`, settings grids `minmax(0,1fr)` (long words never widen the
  page). Chrome doesn't scroll a sideways chip row to a Tab-focused chip: app.js does. Check 1413x717, 1024x600, 960x540, 820x1180, 800x600, 390x844.
- `draw` opts: `center`, `upto`/`ghost` (step view), `pad`, `padBottom`, `corner`, `boxes`, `real`, `base` (a drag
  holds the fit via `state.hold`, or the piece outran the pointer). Dark mode fills the field light (`fieldColor`).
  Thickness overlay (`heat`): 12+ yellow, 18+ orange, 24+ red.
- Focus: file inputs `.sr-file` (hidden but focusable). One MutationObserver in app.js (`refocus`, `held`): a redraw
  that removes the focused control focuses the same control in the new markup (id/data- attributes, caret kept), else
  a keyboard user's focus goes to the nearest live control; keyboard-or-not comes from the last real keydown/
  pointerdown (`keyboard`/`keyAt`), never a click's `detail`; for 2 s after a key the focused control is kept in view.
  `keepFocus` = render + `refocus`. No per-feature focus fixes. Arrow nudges only from the page or `#view`; the piece list is one Tab stop
  (`rove`). Undo skips equal snapshots; Redo ⇧⌘Z / Ctrl+Y. 44 px coarse targets; `forced-colors` keeps thread
  colours; `--danger/--warn/--good/--ink` tokens (red only for warnings).
- Exit gate: every file leaves through `gate.js` `handOut(files, { hoop, zip, share })` (`judge`: PES = `validatePES`
  against its design + no `HARD` rule, the rest of the verdict said in words; cut SVG = mm size, closed shapes; saved
  JSON parses with a piece). Nothing is handed over when one file is refused; a HARD fail says "Not saved" and offers a
  fixed copy; a names ZIP lists refused names under "Couldn't make". `setView` runs quality.js 250 ms after a view
  settles; the done dialog says "Checked" only when it passes, even after "Don't show this again" (`doneSeen`).
- Steps (sheet.js): step 1 = how to hoop, which thread, Start; steps name the thread (`threadNames`/`nextThread`); a
  same-thread pause says "Keep the same thread on"; one sentence per action, three or more numbered (`youHtml`).
  Words (`words.js`): "pause"/"thread change" (`stopWords`/`stopsAt` only), never "stop"; "satin stitch(es)"/
  "satin-stitched"/"Satin border", never bare "satin"; "move between parts"/"loose thread", never "jump" (except
  the machine's "jump stitch not to trim").
- Sew sheet (`sewSheet`: `#sheet` + `window.print()`, also on `beforeprint`): field at 1:1 in mm, centred as the
  machine centres, 5 cm bar; steps with machine names (`machineThreadList`); appliqué shapes. `cutSVG`: one SVG at
  actual size. Verify with headless `Page.printToPDF`, never the real print dialog via the Chrome extension (it blocks).
- Sew along (`#along`): a step per screen, minutes = stitches / 550, own Have ready, Screen Wake Lock (retaken on
  visibilitychange). Share text carries the steps (`shareText`). On my item (`#item`): a measured photo under the
  design at true size (`state.backdrop`), never uploaded or saved.
- Offline (`sw.js`, `needleworks-v2`): precaches `FILES`, network first, cache after 3 s; add every new file to
  `FILES`. https only. Share target: POST `./?share` -> `needleworks-shared` cache -> `./?shared` -> `route()`.
- A hoop change drops other tabs' designs. Min/max over stitches uses loops (`Math.min(...pts)` overflows past ~110k).

## Testing and verification
- CI: `node tests/formats.test.mjs` (golden bytes; identical to `tests/fixtures/ashley_v3.pes`/`multi.pes` less the 4
  box bytes, fixtures by `tests/make_fixture.py` from `*_commands.json`; re-encoded samples, 300 fuzz designs, 50 byte
  flips), `tests/doctor.test.mjs` (every fix, 0.5-2.5x, ~3 min), `tests/sw.test.mjs`, `pe900_check.py --writer-only`.
- `.venv/bin/python -I tests/pe900_check.py [--writer-only] files...` (exit 1 on failure): pyembroidery plus its own
  PEC byte walk (no code shared with formats.js): box, satin gap, trims and short jumps (reported), design block vs
  PEC, fit, size field, toggles, longest, tiny, same hole, density at every offset. `identical_to_pyembroidery` reads
  "except pauses" for same-thread pauses.
- Browser batches: `.venv/bin/python tests/batch_server.py OUT [port]` (8765), then `tests/browser/pe900_batch.html`
  (fonts x names x decorations, pictures x styles) and `tests/browser/studio_batch.html` (starters x hoops, shapes x
  borders, fonts, arcs, files). Title `DONE <files> <problems>`. After any engine change run both plus the checker and
  look at a contact sheet (the checker can't see mush). Byte compares need a fresh no-cache baseline. Load with a
  fresh `?v=N` and hard-reload. `batch_server.py` (backlog 256; accepts .pes/.json/.png posts) used to drop module
  requests under load (status 0): if a page still doesn't start, navigate again. The batch sizes
  pictures by `workingSize`, not `picturePlan`.
- Headless without the extension: Chrome with `--remote-debugging-port`; import the module script over CDP as a blob
  with absolute URLs (the inline module doesn't start).
- Persona harness (`~/.claude/plans/needleworks-user-testing.md`): one headless Chrome per tester via `node
  tests/cdp.mjs PORT CMD` (commands in its header). `start` disables timer throttling (a 300 ms debounce took 57 s)
  and keeps temp files beside the profile (TMPDIR, MAC_CHROMIUM_TMPDIR). With `nocache` app.js may not start: check
  `document.body.dataset.mode`, navigate again. Subagents hand reports back.
- VM check (before shipping stitch changes): UTM "PESCHECK" with the PE-DESIGN 11 trial over VNC
  (`/Volumes/4TB_SSD/vm-pescheck/tools/vnc.py`); files in on an ISO (`hdiutil makehybrid -iso -joliet`, `cat` it over
  `vm-pescheck/files.iso`); `vm-pescheck/tools/boxcheck2.ps1` (box == stitch minimum: "FITS n/n"), then open them
  in PE-DESIGN.
- Brother diff (`tests/brother_diff_core.js`): Brother-made PES files are re-written with `writePES` and the PEC
  blocks compared field by field, then by the machine's holes, jumps, trims and colour changes. The 379 PE-DESIGN
  samples stay in the VM (`C:\bro`): `sh tests/vm/run.sh` (builds `tests/vm/make.mjs`'s page; verdict
  `out/vm/result.png`); Node: `node tests/brother_diff.mjs tests/external/pes`. Run after any `formats.js` change and
  before files go to a machine. Baseline: none sew differently; bytes differ only where Brother keeps stitches to
  15.7 mm (we split over 7), we trim every jump, our palette choice, Brother's page-size field on lace samples.
- `tests/external/` (gitignored): third-party samples and pictures, pyembroidery oracles (`oracle/`), files once
  emailed to a tester (`emailed/`).
### Category checks
Automated checks that each guard a bug class (add a line with every new guard):
- Writer drift: golden bytes (`formats.test.mjs`). Machine-readable PEC: `pe900_check.py`, `validatePES` on every
  download, the Brother diff after writer changes.
- App verdict = checker: `quality.js` agrees with `pe900_check.py` on every batch and sample file.
- Doctor fixes give valid, passing files at every size (`doctor.test.mjs`).
- Offline completeness: every module, font, icon in `FILES` (`sw.test.mjs`).
- Each check below would have caught the past bugs of its class; run the browser ones after touching their area.
  Browser checks need `batch_server.py` and `node tests/cdp.mjs PORT start DIR`.
  - Known problems shown on every surface, one vocabulary, jargon lint: `node tests/surfaces.mjs CDP http://127.0.0.1:HP
    [filter]` (browser, ~21 min, 76 cases; hook `globalThis.nwTest`).
  - Design-tab invariants (fits as sewn, no unasked split, placed inside, collisions warned, every offered fix lands,
    nothing stale, undo round trips, time budget): `node tests/monkey.mjs CDP HP --seeds 1-5 --steps 120 --start
    default,fifteen,random [--budget 1000] [--shrink]` (~1-2.5 s a step; replay `monkey.html?seed=N&steps=K` or
    `&replay=`; fixture `tests/fixtures/fifteen.needleworks.json`). `cdp.mjs profile JS` prints CPU per function.
  - Layout and keyboard at 13 window sizes x 25 states, light/dark/forced: `node tests/ui_sweep.mjs [--url --port --out
    --quick --vp --only --no-keys --keys-only]` (~8 min, quick ~2; report.json + contact sheet; a new state is one
    `STATES` entry; it uses a browser context per tab to keep localStorage apart).
  - Every exit through the gate: `node tests/gate.test.mjs` (CI) fails on download/share/object-URL/zip code outside
    gate.js and on an exit missing from its list.
  - Damaged files through Open: `node tests/open_fuzz.test.mjs [n] [seed]` (CI, ~15 s; `DUMP=dir`).
  - Every engine over its parameter space: `tests/browser/engine_fuzz.html?seed=S&n=N[&engine=E][&only=K]`, then
    `pe900_check.py OUT/fz_*.pes` (`fz_S_log.json` holds the specs; `window.fuzzAt` set once running).
  - Wasted motion inside an object: `node tests/flow_lint.mjs [--blocks] [--json] DIR|FILES` (report: trims, loose,
    near/hidden/loop/reverse = `avoid`, uncovered ends, lockOut, zeroTie; ~20 s a batch; Brother files score 1-3 avoid)
    and `tests/flow_lint.test.mjs` (CI: past instances stay caught). Compare `avoid` with the baseline after any stage
    builder change.
  - Typed text: `node tests/text.test.mjs` (CI, 617 strings x 19 fonts) and `node tests/text_fuzz.mjs CDP HP [--quick]
    [--only ...]` (browser, ~20 min, quick ~5; corpus `tests/text_corpus.mjs`).
  - Pictures unlike the samples: `tests/picture_corpus.sh CDP HP OUT [query]` (~1.5 min; 26 seeded drawings x styles x
    sizes; open cases in its `KNOWN` list with a reason; `?ext=etsy_N` renders the external samples).

## Hosting
- 4gables.com is the `4gables/website` repo's custom domain (a project site). Other repos appear under
  4gables.com/<repo>/ only if the org site repo is `4gables.github.io` with the custom domain.

## Decided against
- Ink/Stitch short stitches and 3-hole locks (would change the bookmark for little), contour underlay under picture
  fills (overlap fixed the gaps), split satin (nothing over 3.6 mm in lettering; split at 7 mm if added), a 1.5 mm
  minimum satin, sewing all moves of 3 mm or less (lines between print letters), satin cut short at junctions (gaps
  in A and h), re-aiming print apex stubs.
- 1 px source lines in Filled pictures, keeping the On my item photo across starters, undo across reloads.
- Busy pictures' trims are their separate shapes: no safe win.

## Open
- Machine: does the PE900 also cut 0x20 trims of 5 mm or less (the loose-thread count assumes not)? Sew along's
  "Sewed with the wrong thread?" wording is unchecked on a PE900.
- Threads: pure white as Isacord 0015 rather than 0003 (Amann's card draws whites bluish)? Dusty pinks (chroma ~6)
  still Warm Gray.
- Lettering: Alex Brush's b loop is lost ("Abbie" reads "Avvie"); Quicksand's rounded V/M bottoms stop short; dense columns where 3 strokes meet the
  towel lattice (within 24); dots by READ's stars (the satin round the stars' points).
- Appliqué: combine same-thread stages (6 pauses could be 3); tack-down ends 1.4 mm from the edge walk's start (2
  short jumps across a pause); only the first fabric block gets a fabric shape in the preview.
- Quilting: narrow heart/diamond tips stay empty; quilt label with stipple sews as 3 lines.
- Pictures: "make it stitchable" (thicken/drop too-fine detail); 1-2 mm outlines as satin (needs variable-width satin
  through junctions); etsy_6's green panel still sewn; etsy_7's pastel lines; etsy_4's greyish-lavender title;
  etsy_5 at 4 colours merges grass and yellow; slab-serif centre lines lose serifs; a soft shadow's core joins its
  colour at 2 threads; 0.6 mm strokes in a compressed JPEG partly sewn.
- Open tab: Thickness overlay counts at grid offset 0 only (`heat`); trims rise after re-stitching at 70 %.
- `pe900_check.py`'s max density reads lower than a full offset scan below the limit (pass/fail unaffected).
- Design tab: Patch starter + Lettering lands below JD. Speed: a big carved patch refills on every change
  (1.5-4.7 s; wants a carve worker like quilting); thread/fabric change on 15-26 pieces 1.1-2 s.
- Flow: fill-internal hidden moves in `fillPolygon`, repeated tie-in holes in `Design.path`, ~47 script moves on arcs.
- Text: CJK/Arabic names save as design.pes (the fonts lack them anyway).
- Not built: photo stitch, free-standing lace, 3D puff.
