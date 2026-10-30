# needleworks

Embroidery-file tools for home machines. Two implementations of the same engine:

- **Website (primary)**: static, no build step, served by GitHub Pages from the repo root
  (https://4gables.com/needleworks/). ES modules in `js/`. Heavy picture digitizing runs in `js/worker.js`.
- JavaScript is the only engine (the Python tools were removed). Python remains only for test tooling:
  `tests/pe900_check.py` (pyembroidery oracle) and `tests/batch_server.py`, venv in `.venv` from `requirements.txt`.
  For serving a non-technical user via Claude Code, see `.claude/skills/embroidery/SKILL.md` (it points at the site).

## Engine notes (both implementations)
- Units: mm while designing; stitch data is pyembroidery's 0.1 mm, y down. Commands: STITCH 0, JUMP 1, TRIM 2, END 4, COLOR_CHANGE 5.
- Lettering: render the word, add swashes tangent to the first letter's entry / last letter's exit stroke, bridge letters
  the font leaves unjoined (e.g. Sacramento A→s), skeletonize, build a stroke graph, prune spurs, then walk it so each
  stroke is a centre-run out and a satin back (no jumps within a connected word).
- Swashes (lead-in and tail, each with its own on/off checkbox): one calligraphic stroke leaving the
  letter's own stroke end along its tangent, dipping into a shallow cup under the baseline and flicking up at the far
  end. Letters with no low entry end (E, O) are joined tangentially at their lowest left point. Never let it run flat
  along the baseline; that reads as a ruled line.
- `satin()`: stations spaced by the outer edge so curves don't gap; short stitches on a crowded inner edge.
- `Design.finish()` runs `relieve()`: no 1 mm square (at any 0.1 mm grid offset, since the checker's grid is the
  file's) gets more than 24 needle hits per colour block; interior points at satin junctions are dropped, tie-ins kept.
  Added when a turned 172 mm picture hit 26.
- Bookmark (the first "Start from" card in Design your own, or `#bookmark`; its own panel and engine, mode
  `bookmark` with the Design tab highlighted and a back link): 5 colour blocks of one thread = 4 machine pauses for the in-the-hoop fabric steps (blank = no name block,
  4 blocks / 3 pauses). Name is centred across on the middle of the x-height (cap height for all-caps), so the bulk of the letters is
  centred and loops may reach further one way; lengthwise it's centred with equal room below
  the eyelet and above the border. Letters are sized so their band fills `LETTERS` (72%) of the inner width, the same with
  or without decorations; only a word too long for the bookmark shrinks. Needs the 5x7 hoop.
  Its swatches are exact Brother PEC colours like the Design tab's (until 2026-10-29 crimson read "Dark Fuchsia", navy
  "Peacock Blue", black "Olive Green" on the machine); a colour saved from the old swatches maps to the new one.
- Print fonts (`print: true` in `js/core/fonts.js`): letters aren't bridged (each is its own piece, the machine trims
  between them), decorations are straight dashes on the middle of the x-height (cap height for all-caps), and spur
  pruning is gentler (0.45 vs 1.3 stroke widths) so t crossbars and a's stems survive. Dots (i, j) that thin to a lone
  point get a short stroke (`skeletonEdges(..., { dots: true })`).
- Design tab (`js/studio/`): pieces (lettering straight or arched on a circle, 1/3-letter monogram, frames) are built
  from the shared lettering/satin engines in mm around the hoop centre, composed in list order (neighbours in one
  thread share a block), then handed to `writePES`. The preview keeps the hoop centre fixed (`draw(..., { center })`)
  so dragged pieces stay put; the machine centres the whole design anyway. Swatches are exact Brother PEC colours
  so on-screen names match the machine (a near-black hex showed as "Olive Green").
  Pieces sew in stages (`pieceStages`): an appliqué frame is placement line, pause (lay fabric, trim), tack-down,
  pause, satin; `compose` returns the steps shown under "How to stitch it". Each step is a button: the preview then shows the design
  as it is after that colour block (`state.step` in app.js: `upto` = the block's last stitch, later stitches faint via
  `draw(..., { ghost })`, placement lines shown until the fabric step covers them); steps a stage joined early say so. In-the-hoop frames (`border: "ith"`, the Ornament starter) are an appliqué front, the pieces after them, then
  a `last` stage (`compose` moves it after everything) that tacks taped-on backing and satins through every layer; a stage's
  `after` text becomes "When it's done". A stage never joins an earlier block that's `under` (it would be hidden in the
  preview). Designs with a fabric step show a plain-words appliqué guide (`#st-appl`) until "Got it"
  (`studio.applSeen`), then an "Appliqué tips" link in the steps. Starters may carry a `tip` (stabilizer/topper advice) shown under the cards. Opened PES/DST files become pieces
  (stitches as is: move/turn, no resize). Lettering satin width = the font's stroke, capped at 1/5 of the x-height
  (1/6 for thin monoline fonts, which get a satin sized to the letters); under 1 mm it's a fine line instead
  (bean stitch: three runs, strokes under 0.6 mm skipped, points 0.4 mm apart), because satin on small script fills
  the loops. Each text/monogram has Stitch: automatic / Satin / Fine line; the editor warns under a 4 mm x-height.
  Starter cards draw their own stitched thumbnails (`draw(..., { pad })`). Appliqué letters (`kind: "letters"`,
  `js/studio/outline.js`): the word is rendered in a bold OFL display font (Graduate, Lilita One, Alfa Slab One in
  `APPLIQUE_FONTS`), every edge traced with marching squares (holes too), corners rounded ~1 mm; placement, tack-down,
  satin per outline, each stage starting a third further round so seams don't stack; a hole too small for a 2.8 mm
  satin gets a narrower one (min dimension / 3.5). The preview fills every placement outline with fabric (even-odd). Patches: `fillPolygon()` (digitize.js)
  rasterises a frame (inset 1 mm) and returns the picture tool's underlay + tatami, then a satin edge covers the
  row ends. `compose` moves a stage up to join an earlier block in the same thread (one pause fewer) only if it
  overlaps nothing it would jump ahead of (bbox + 1 mm) and isn't an appliqué stage. Save design / Open saved write
  and read `{ needleworks: 1, pieces }` JSON (editable pieces, not stitches). Straight lettering centred inside an
  earlier frame shrinks to fit across it (`fittedSizes`), and the editor says so. Arched lettering bends onto an ellipse (`radius` = half-width,
  optional `ry` = half-height, missing = circle), letters spaced by arc length; "Follow the frame" (`followFrame`) puts
  the curve just inside an earlier circle/oval/scallop frame, and the editor warns when letters reach further inside the
  curve than 0.8 x its tightest radius of curvature under the word (`archTight`). Lettering drawn before its font has
  loaded is never cached (it's the fallback font; `warn()` measuring other pieces early had cached it). Starter cards are one scrolling
  row so the pieces and editor stay in view at desktop height (checked at 1413 x 717 and 390 x 844). `tests/browser/studio_batch.html` builds ~70 Design-tab files
  (starters x hoops, shapes x borders, every font as monogram and arcs, turns, a file combo) for `pe900_check.py`;
  look at a rendered contact sheet too, the checker can't see mush. Running the browser batches: Chrome caches the
  ES modules, so load with a fresh `?v=N` and hard-reload (Cmd+Shift+R) after code changes; if a batch page stops
  writing files (it happened once), navigate to it again. Its title reads `DONE <files> <problems>`. Without the
  Chrome extension: headless Chrome with `--remote-debugging-port`, then over CDP import the page's module script as a
  blob with absolute URLs (the inline module doesn't start on its own in headless).
- Second study (2026-10-29, Ink/Stitch + its 142 fonts, PEmbroider, libembroidery, Wilcom docs) found most numbers
  already match (stagger, max stitch, row spacing, underlay angle, satin density, contour inset). Not done, and why:
  Ink/Stitch-style short stitches and 3-hole locks (would change the bookmark for a small gain), contour underlay
  under picture fills (more stitches; the overlap fixed the gaps), a fabric preset (later), split satin (nothing over
  3.6 mm yet; split at 7 mm if added).
- Lessons from other open-source projects (researched 2026-10-29), now handled:
  - PEC palette 62-64 are applique codes on Brother machines ("Applique Material/Position"), not Orange/Cream Yellow
    as pyembroidery named them: `PEC_MATCH` excludes them (inkstitch/pyembroidery#140, SE700-verified).
  - Every cut is locked: `Design.tieOff()` sews 0.7 mm back-and-forth along the last line before each trim, colour
    change and the end (a trimmed thread can work loose otherwise: PEmbroider#105). `relieve()` keeps 5 points
    around commands so locks survive thinning.
  - The PE900 never trims a jump at or under its "jump stitch not to trim" setting (5 mm lowest, manual p.38), so
    1-5 mm jumps stay as loose thread. Stitching them as connectors would draw lines between print letters, so
    instead the preview counts them ("N short jumps to snip"); both ends are locked so snipping is safe.
- Satin density (`geom.satin`): `density` is the gap between needle hits on the SAME edge (0.4 mm, as Ink/Stitch and
  Brother-made files: ursula 0.36, gnome 0.30, ufront 0.42). Until 2026-10-29 stations were `density` apart, so each
  edge was hit every 0.8 mm: half the coverage, fabric showing through (found by the cross-library study; the
  bookmark Ashley was sent has it). Satin samples the line every 0.02 mm (0.05 rounded every setting up to 0.4).
  `zigzag(p, w, spacing)` is unchanged (same-edge gap = spacing). Lettering pull comp 0.15 mm a side on satins
  >= 1.5 mm, 0.05 below (Ink/Stitch small fonts: 0.02-0.05; more closes counters). Lettering satins >= 2.5 mm get a
  zigzag underlay (width - 0.4, 2.5 mm) as the walk's way out instead of the centre run (every forward run in `order()`
  is satined back exactly once, so it's always covered). Fine-line lettering uses `followRun` (geom.js): stitches up to
  1.6 mm but within 0.1 mm of the line and a hole on every turn over 30° (uniform 1.6 mm cut a 1 mm loop by 0.3 mm).
  Lettering under a 6 mm x-height adds a "Small letters" tip (60 wt thread, 65/9-70/10 needle) to the steps. Measure with the same-edge statistic, not by eye on a PNG. Satin borders 2.5-4 mm (frames, patch and
  appliqué edges, the bookmark border) sew `edgeWalk` first: a run 0.4 mm inside each edge, then the zigzag, then
  the satin (Ink/Stitch contour underlay), for a firm edge on felt.
- `edgeWalk` ends on the side where zigzag/satin start (ending on the other side left a 2 mm gap: a jump, trim and
  two locks on the seam), and `Design.path` adds no stitch when a run starts within 0.3 mm of the needle.
- The checker counts a STOP as a new block: pyembroidery reads a pause between two blocks of the same thread (the
  bookmark's and appliqué's fabric steps) as a STOP, which had lumped separate fabric steps into one density count.
- Tie-ins point at the first point more than 0.3 mm from the start: strokes often begin with repeated points, which
  made 143 zero-length tie-ins (5 hits in one hole) across the 109-file batch before 2026-10-29.
- Machines/hoops: `js/core/machines.js`. Designs are checked to fit
  the hoop field minus a 2 mm margin. Brother PE900 5x7 = 130 x 180 mm and 4x4 = 100 x 100 mm, auto-trims jumps.
- "Turn hoop" (per tab, bookmark defaults on) only turns the preview; the PES is always written in machine orientation
  (the hoop clips on one way). A turned picture is digitized in the sideways field and `turnPattern()`ed clockwise
  before `writePES`; the preview turns the file back.
- "Sewing on" (`FABRICS` in pieces.js, Design tab; `compose(pieces, hoop, { fabric, baste })`, saved in the JSON):
  cotton/felt/denim sew as before (tips only); knit gets the zigzag underlay from 1.5 mm satins, +0.05 mm pull comp a
  side and the Lighter fill on patches; towel makes lettering satin (a fine line sinks) on a knockdown: a lattice 0.3
  mm wider than the satin (zigzag out and back along each stroke, ≥ 3 mm apart, `spaced`), sewn per connected word
  just before its letters, so it adds no jumps (the walk ends where it began). Tried and dropped: a tatami fill of the
  grown word (+17 trims on a name), one 1.5 mm zigzag (the checker's median read it as a sparse satin), 1 mm wider
  (a fringe), zigzag underlay as well (24 hits/mm²). "Baste first": a 4 mm run box 9 mm round everything (clamped to
  the hoop, centred on the design) at the start of the first block, unpicked at the end. The towel starter sets both.
- Lettering satins start from the stroke's centre point and the zigzag underlay ends on it: back-to-back satins at a
  junction began on the opposite edge, a column apart (2.4 mm > the 2 mm jump rule), so each was a jump + trim (11
  on "Ashley" in Yellowtail). Across the studio batch trims -14%, none worse; the bookmark has its own engine and
  is unchanged.
- Lettering layout (`textRows` in pieces.js): straight text takes up to 3 lines (Enter in Words), every line at the
  first line's x-height, `align` left/centre/right, `leading` % of size; `spacing` % of size via canvas
  `letterSpacing`, print fonts only (script letters pulled apart came out unjoined); shapes `wave` (sine by arc
  length, `amp` mm, `waves`) and `bridge` (above-baseline points stretched toward the middle, `bulge` %). The rarer
  ones sit in the editor's "More". `flip` mirrors a piece at placement (not part of the stitch cache key).
- One for each name (link under Download, Design tab and bookmark): the biggest lettering (the name, nearly always;
  starters select their last piece, which was "2026") or the bookmark name is swapped for each line, every file goes
  through `validatePES`, and they download as one stored ZIP (`js/zip.js`). Names that don't fit are listed.
- Thread brands (`js/core/brands.js`, data `brandcharts.js`: Isacord, Sulky Rayon, Robison-Anton Rayon, Hemingworth
  from Embroidermodder's old `thread-color.c`, zlib licence; current libembroidery only has TODO stubs; Sigma's names
  were misaligned (a red called "Silver") and Isafil is rare, so both were left out; no Madeira chart under a usable
  licence). The top-bar select labels threads "≈ Isacord 1306", or the nearest spool listed in "Threads I own" ("your
  …"). Matching is CIELAB: the red-mean distance called black "Ivy" in Robison-Anton's approximate darks. Labels
  only: files always carry Brother PEC colours. Picture tab "Use only threads I own" sends `palette` to the worker;
  `toPalette()` maps each colour cluster to the nearest owned spool and merges clusters that land on the same one
  (the sample flower: 3 thread changes -> 2).
- Design doctor (`js/doctor.js`, Open tab "Checkup"): needle hits per mm² per block (> 24 flagged), stitches under
  0.3 mm, satin same-edge gap (median, as pe900_check.py; > 0.6 flagged), stitches over 10 mm, a stabilizer hint from
  stitches per square inch. Fixes: Size 80-120 % about the centre (coordinates rounded to whole 0.1 mm and zero-length
  stitches dropped first, or the writer's rounding broke `validatePES`), remove tiny stitches (on by itself when
  shrinking: 80 % made 55 on a file with none), thin to 24 with `relieve()`, split stitches over 12 mm. A file that
  starts with a stitch at the origin (gnome.pes) gets a jump to its first point when it changes, or the scaled file
  sewed a stitch out from the origin. Untouched files still download as their own bytes. `tests/doctor.test.mjs`
  (CI) validates every fix on the fixtures (and tests/external when present). "Thickness" under the preview overlays
  the hits per mm² (12+ yellow, 18+ orange, 24+ red) on every tab, over the stitches faded so it shows on black.
- Picture styles (`opts.style`, Picture tab "Style"): Filled (`build`), Line drawing (`lineArt`: outlines of shapes
  over 1.5 mm across, drawn on one side only where two colours meet, plus thin shapes' centre lines, thickened to 2 px,
  skeletonized and walked like lettering so each line is sewn out and back; one thread, the darkest colour) and
  Cross-stitch (`crossStitch`: `cross` mm cells, majority colour or empty when mostly background; a row run is two
  diagonal zigzags, out and back, with one straight stitch up its last edge; climbing every cell edge drew bowties).
  The batch adds 4 line/cross cases per picture. Not done: "make it stitchable" (thicken/drop too-fine detail).
- Quilting (`js/studio/quilt.js`, frame `quilt`: stipple | echo): the free space is the frame inset 3-4.5 mm minus a
  2.5 mm disc round every other piece's stitches, on a 4 px/mm mask. Stipple: 7 mm cells wholly free, a random (fixed
  seed) spanning tree, the closed walk round it through the 2 x 2 sub-cells (each once, never crossing), points nudged
  and averaged over ~7 mm (the plain walk looked like a maze). Echo: marching-squares contours of the free space's
  distance field every 4 mm. `compose` adds the quilt stage right after the frame (before an in-the-hoop frame's
  `last` stage) in the frame's thread. A visible stage that joins a tack-down block un-hides that block in the
  preview (the quilting, or same-thread lettering on an ITH frame, was hidden with the tack line). Starters: Mug rug,
  Coaster, Quilt block.
- Motifs (`js/studio/motifs.js`: 29 filled icons from Phosphor Icons, MIT; `kind: "motif"`, `motif`, `size` mm across
  the longer side, `style` fill | outline | applique): the SVG path is filled on a canvas and traced like appliqué
  letters (`motifOutlines` in outline.js, holes included). Fill = `fillPolygon(loops, { inset: 0.6 })` (it now takes
  several loops, even-odd) plus a 1.4 mm satin edge; outline = `edgeSatin` (narrower round small holes); appliqué =
  `appliqued()`, shared with appliqué letters. Filled under 25 mm the detail closes up (the editor says so). Lettering
  `deco` puts a small filled motif either side (More > Motif either side; the "Name with motifs" starter).
- In-the-hoop projects: frame `border: "zip"` (Zipper pouch, square/oval/circle only in the editor): zipper line
  (under), pause: tape the zipper, tack both sides of the teeth (under), pause: two folded front pieces, tack round the
  outline (`fabric`, `nocut`: the cut file would be the wrong shape), topstitch beside the zipper, the pieces after it,
  then a `last` stage: open the zipper halfway, back face down, three times round. The zipper line overhangs 5 mm a
  side (6 took the 120 mm starter past 126 mm). Stages may carry `before` ("Have ready": fabric sizes from the frame's
  size, +2.5 cm; folded front pieces twice what they cover); `compose` returns it, the steps list it first and the sew
  sheet prints it. ITH frames list their front/back pieces too. Starters: Zipper pouch, Key fob. The preview's fabric
  shape uses only the block's closed outlines (the pouch's topstitch lines share it), and a visible stage joining any
  hidden block (fabric too) shows it.
- Phones (<= 600 px): the sewing controls and the links under Download wrap (Thickness made the row overflow to 481 px).
- Sew along (link under Download, `#along` dialog): one step per screen, the preview after the step (`draw` with
  `upto`/`ghost`), thread + spool, what to do, minutes (block stitches / 550), Back/Next, "Finished" with the `after`
  text; Screen Wake Lock while open (taken again on visibilitychange). Steps come from `v.sheet.steps` or the colour
  blocks. The preview's fabric shape keeps segments whose ends are within 5 mm: R15's 1.5 mm dropped the bookmark's
  fabric (its outline stops one 2.5 mm stitch short) and only a screenshot of the bookmark caught it.
- Installable/offline: `manifest.webmanifest` (icons in assets/, share target) and `sw.js` (precaches `FILES`, then
  network first with the cache as fallback; the Google UI fonts are cached too). `tests/sw.test.mjs` (CI) fails when a
  module, font or icon is missing from `FILES`: add new files there. Registered only over https (not the local test
  server). A share POSTs to `./?share`; the worker stores the file in the `needleworks-shared` cache and redirects to
  `./?shared`, and app.js opens it with `route()`.
- Sew sheet + cut file (`js/sheet.js`, links under Download): "Print a sew sheet" fills a hidden `#sheet` and calls
  `window.print()` (print CSS hides the app). Page 1 is the hoop field at 1:1 (SVG sized in mm) with the design centred
  as the machine centres it, a crosshair and a 5 cm check bar; page 2 the steps with the machine's thread names
  (`machineThreadList`, step i = colour block i); page 3 the appliqué shapes. A view carries `sheet: { steps, after,
  notes, cut }`; `cut` is the placement outlines in mm (`compose` puts them on fabric steps; the bookmark's is its outline
  grown 3 mm, the ⅛ in it's trimmed to), never stitches (tie-ins would show as spikes in a cutter). "Cut file" downloads
  them as one SVG at actual size, one group per fabric. Verified with headless Chrome `Page.printToPDF`: field 130 x 180
  mm, bar 50 mm. Never test with the real print dialog through the Chrome extension (it blocks the page).
- The preview is the file: `setView` decodes `v.bytes` with `readEmbroidery` and draws/counts/fit-checks that, and
  thread labels come from the file's own PEC palette.

## Gotchas
- **PES writer is locked** (2026-10-29, after Ashley's PE900 failure). `writePES`/`writePEC`/`pecEncode` output is
  frozen by `tests/fixtures/golden/*.pes` (byte-for-byte, checked in CI along with `pe900_check.py`). Browser and
  Node produce identical bytes (verified in Chrome). New features (design tools, UI) build stitch patterns and hand
  them to `writePES`; they never touch `js/core/formats.js`. Only change the writer to fix a proven machine problem,
  then redo the Brother checks below before regenerating the golden files.
- PEC design box (the cause of Ashley's clipped files, 2026-10-27): Brother machines read the two 16-bit fields after
  `0x1E0, 0x1B0` in the PEC stitch block as the design box's top-left relative to the origin, big-endian
  `0x9000 | -minX`, `0x9000 | -minY`, and start decoding stitches after them. pyembroidery writes its opening jump
  there instead, so machines drop that jump and show the design shifted, clipped to about half (her PE900 showed the
  94.9 x 36 mm School of Medicine file as 1.84" x 0.69"). We write the box, then the opening jump. `readPEC` decodes
  the machine's way; files whose stitches leave the box get `misplaced` (decoded as meant), `validatePES` refuses
  them, and opened ones are rewritten fixed. Every Brother-made sample fits its box; flower_ludd, star_badge, wreath
  and pyembroidery's own output don't. Checked 2026-10-29 in a Windows VM: all 380 PES files that ship with Brother's
  PE-DESIGN 11 trial have the box exactly at the stitch minimum, as ours now do; only our 3 old files failed.
  PE-DESIGN itself reads only the PES design block (PEC-only files open as an empty page, and an old file with a
  good design block but a bad box opens fine), so it can check the CEmbOne/CSewSeg block but not the PEC bytes the
  machine sews. Same bug, verified on hardware: kircherlabs/embroidery-studio#4,
  nkymut/p5.embroider#42.
- PES is written as full v6 (header + thread chart + `CEmbOne`/`CSewSeg` design block + PEC + colour addendum) like
  pyembroidery `write_pes(..., {"version": 6})` plus the box above. The design block is what PE-Design opens; the
  machine sews the PEC block, and PEC-only (truncated) files are fine on it if the box is right. Coordinates are
  rounded half-to-even like Python's `round()`; `tests/formats.test.mjs` asserts output byte-identical to
  `tests/fixtures/ashley_v3.pes` and `multi.pes` once the 4 box bytes are stripped (fixtures written by
  `tests/make_fixture.py` from the `*_commands.json`, full float precision). We split jumps over 121 mm
  (pyembroidery allows 204), so fixtures keep jumps shorter.
- PE900 proof: `tests/pe900_check.py` re-reads PES files with pyembroidery plus its own PEC byte walk (no shared code
  with formats.js) and checks every stitch sits inside the PEC design box (decoded the machine's way), satin coverage (same-edge gap of long zigzag runs <= 0.6 mm; `--writer-only` skips it for the frozen golden files), trims and short jumps (reported), the PES design block matches the PEC stitches, hoop fit, PEC size field, toggle bytes, longest stitch, tiny stitches and needle hits per
  mm² per colour block (limit 24 = densest spot in sold designs; script loops crossing on a tight curve reach 23).
  `tests/browser/pe900_batch.html` served by `tests/batch_server.py OUT` builds a ~110-file sample (every font × 3 names × decorations
  on/off, blank, 4 pictures × 3 settings incl. turned) with the site's own code and saves the PES files for the checker. Run both after any engine
  change. The three files emailed to Ashley are in `tests/external/emailed/`.
- PEC palette: two colours never share a Brother thread (pyembroidery's rule), so a colour can get its second-closest
  thread. Always label threads with `machineThreads()` (or an opened PES's own `pec` bytes), never plain
  `nearestBrotherThread()`, or the site and the machine's screen name different threads. Our order is block order;
  pyembroidery's is Python set order, so files with competing colours differ from pyembroidery only in those bytes.
- Digitize shrinks a picture that lands over the hoop field (fill/satin edges overshoot the image) instead of erroring.
- Pictures: every shape 1 mm wide or more is a solid tatami fill that follows its outline (skeleton satin broke letter
  corners into ragged columns); only hairlines under 1 mm get a centre-line run. k-means clusters within ΔE 6 are
  merged, and any colour within ΔE 8 of the border colour is background (a white logo box on an off-white page was
  stitched as "Brother White"). Moves between pieces jump instead of sewing across open fabric. Within one fill,
  `routeFill` connects the sections with travel run inside the shape through rows not sewn yet (A* on 0.5 mm
  cells, finished rows cost 6x, at most 2 mm on top of finished rows; sections in row order with a lookahead that
  may reverse one), so the fill covers it (Ink/Stitch's tatami travel): trims -75% and short jumps -82% across the
  batch pictures, thread coverage unchanged. Travel stitches 0.6-2.5 mm; `relieve()` may merge stitches up to 4 mm. Pictures are
  sampled at 8 px/mm (5 lost the notches of small lettering); thin shapes (< 2 mm) get 0.05 mm pull, not 0.15, so the
  gaps between small letters stay open. Notches under ~0.5 mm can't be kept by any thread: open them in the artwork.
- Picture colours overlap (second study, 2026-10-29): each shape's fill grows `OVERLAP` 0.35 mm under the colours
  sewn after it (never into background or earlier colours), so thread pull can't open fabric at a join. Specks under
  1.5 mm² are dropped first and each shape grows on its own (BFS, never touching another shape): growing the raw mask
  merged scattered specks into big shapes filled under the next colour (stitches x2, trims x4). Neighbouring colours
  alternate fill angle (base, base + 90°). `routeFill` charges +2 per earlier travel through a cell, or travel funnels
  through one spot (50 hits/mm²). Net on the batch pictures: trims down, stitches +1-18%, max density unchanged.
  Ashley's School of Medicine file has no touching colours, so it gains nothing; it wasn't resent.
- Fill density (`DENSITY` in digitize.js): Solid 0.35 mm rows (default) or Lighter 0.4. 0.3 fails the PE900 check
  (row links become < 0.3 mm stitches). `digitize()` also returns `fine`: area of gaps < 0.5 mm that stay narrow over a
  length (clusters >= 0.3 mm²; corner tips don't count) and the count of hairline (< 1 mm) shapes. The site warns at
  >= 0.8 mm² or >= 5 hairlines.
- Download names are ASCII only (`safeName`): the machine's USB reader may not show accented names.
- Desktop layout fits the window (min-width 861px): body is 100dvh with no page scroll; only `.controls` may scroll
  on short screens, and a max-height 900px tier hides ledes/captions. Phones scroll normally.
- Thread names come from the 64-colour Brother PEC palette with pyembroidery's red-mean distance; that's what
  the machine itself maps to, so a dusty pink can legitimately show as "Gray".
- The fonts after Meow Script are free (OFL/Apache) lookalikes of popular embroiderydesigns.com samples; the
  sample is named in the font's `note`. The store's own PES letters aren't used (paid, 1–2 letters per sample).
  To try more, add an `@font-face` and look at `tests/browser/fonts.html?name=<word>` (every font, stitched);
  reject fonts whose stitched letters come out unjoined or with spurs (Petit Formal, Comforter, Damion did).
- Script fonts render via CSS `@font-face` families named `NW <Font>` (local TTFs in `fonts/`, OFL); the
  lettering engine needs `document.fonts.load()` before drawing.
- `tests/external/` (gitignored) holds third-party PES/DST samples and Etsy images used for manual testing, with
  pyembroidery read oracles in `tests/external/oracle/`.
- Every download goes through `validatePES()` (js/core/formats.js): re-reads the bytes and requires the same needle
  movements as the source design (PEC's zero-length anchor stitches after jumps are ignored), an END marker, enough
  threads, colour-change toggle bytes alternating 2,1,2… (what Brother writes; real files follow it), and hoop fit.
  Opened PES files are offered as their original bytes after the same structural checks. Tests: re-encode of all
  samples, 300 fuzz designs, and 50 byte-flip corruptions must all behave.
- Hosting: 4gables.com is the `4gables/website` repo's custom domain (a *project* site). Other repos only appear under
  4gables.com/<repo>/ if the org site repo is named `4gables.github.io` and carries the custom domain.
