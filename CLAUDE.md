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
- `satin()`: stations spaced by the outer edge so curves don't gap; short stitches (every other one at 60%) where the
  inner edge is hit at under half the outer's rate (until 2026-10-29 only under 0.09 mm, which rarely triggered).
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
  `APPLIQUE_FONTS`), every edge traced with marching squares (holes too), corners filleted 1.6 mm (Douglas-Peucker 0.1 mm, then
  `filletPolygon`; ~1 mm smoothing left satin fans 1.5 mm past an M's notches); round inside corners tighter than the satin's half-width the edge offset folds back on itself (a star), so appliqué/outline edges (`edgeSatin`) cut each fold where the edge crosses itself (`fold` in `satin`/`zigzag`/`edgeWalk`, `unfold` in geom.js) and the stitches meet there; only those files change, density same or lower, corner stitches up to 4.6 mm;
  placement, tack-down, satin per outline, each stage starting a third further round so seams don't stack; the satin
  sits 0.4 mm outside the placement line (`outward`, holes included) so it covers a ~1 mm trim; a hole too small for a
  2.8 mm satin gets a narrower one (min dimension / 3.5, at least 2 mm). The preview fills every placement outline with fabric (even-odd). Patches: `fillPolygon()` (digitize.js)
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
    change and the end (one hit of each lock 0.35 mm to the side, so no hole takes three hits) (a trimmed thread can work loose otherwise: PEmbroider#105). `relieve()` keeps 5 points
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
  zigzag underlay (width - 0.8, i.e. 0.4 mm inside each edge, 2.5 mm) as the walk's way out instead of the centre run (every forward run in `order()`
  is satined back exactly once, so it's always covered). Fine-line lettering uses `followRun` (geom.js): stitches up to
  1.6 mm but within 0.1 mm of the line and a hole on every turn over 30° (uniform 1.6 mm cut a 1 mm loop by 0.3 mm).
  Lettering under a 6 mm x-height adds a "Small letters" tip (60 wt thread, 65/9-70/10 needle) to the steps and sews
  its satins at 0.34 mm (60 wt is ~70% of 40 wt's width). Measure with the same-edge statistic, not by eye on a PNG. Satin borders 2.5-4 mm (frames, patch and
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
  cotton/felt/denim sew as before (tips only); knit gets the zigzag underlay from 1.5 mm satins, +0.15 mm pull comp a
  side, a 0.42 mm satin and the Lighter fill on patches; towel makes lettering satin (a fine line sinks), at least
  2.5 mm wide (up to 0.3 of the x-height), on a knockdown: a lattice 0.3 mm wider than the satin (zigzag out and back
  along each stroke, 2 mm apart since 2026-10-29: 3 mm was too open to hold the loops; `spaced`), sewn per connected word
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
- Thread brands (`js/core/brands.js`, data `brandcharts.js`: Isacord, Sulky Rayon, Robison-Anton Rayon, Hemingworth,
  collected 2026-10-30 from each maker's own published colours, sources in the file's header (Amann's digital card
  has numbers only, so Isacord spools have no names, and it draws whites bluish: pure white is nearest 0003; Robison-
  Anton is its 2005 web chart with A&E's 2023 Top 100 colours over it). Sigma and Madeira aren't there.) The top-bar select labels threads "≈ Isacord 1306", or the nearest spool listed in "Threads I own" ("your
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
- Quilting (`js/studio/quilt.js`, frame `quilt`: stipple | echo): (stipple and echo rewritten 2026-10-30: see "Before round 4"; the
  description that follows is the first version) the free space is the frame inset 3-4.5 mm minus a
  2.5 mm disc round every other piece's stitches, on a 4 px/mm mask. Stipple: 7 mm cells wholly free, a random (fixed
  seed) spanning tree, the closed walk round it through the 2 x 2 sub-cells (each once, never crossing), points nudged
  (0.35 of a sub-cell) and averaged over ~9 mm. The tree is depth-first but turns rather than goes straight on (odds
  0.15 against): a plain depth-first tree made long corridors that sewed as a maze; a Prim's tree made sharp teeth.
  Echo: marching-squares contours of the free space's distance field every 4 mm, chained into one line (each ring from
  its point nearest the last one's end, joined by a stitched step; a ring over 6.4 mm away starts a new line): 4 mm
  apart, every ring was a jump under the machine's 5 mm trim setting plus two locks. `compose` adds the quilt stage right after the frame (before an in-the-hoop frame's
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
  then a `last` stage: open the zipper halfway, back face down, three times round. The tack lines run 5 mm either side of
  the teeth (3.5 left 0.5 mm beside a coil) and Have ready asks for a #3 nylon coil zipper. The zipper line overhangs 5 mm a
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
- On my item (button by Turn hoop, `#item` dialog): a photo of the real item; two dots dragged onto something measured
  plus its length set `state.backdrop = { bmp, unit (0.1 mm per photo px), center }`; `draw` puts it under everything at
  true size (the hoop is hidden), and a drag that isn't on a piece slides the photo. Nothing leaves the device and
  nothing is saved. (Found doing this: since round 2 a trailing comment in app.js's state had swallowed `showHoop`, so
  the Hoop box showed unticked while the hoop was drawn and the saved choice was ignored.)
- Bigger than the hoop (`splitPieces` in pieces.js): when `compose` throws `overBy`, the Design tab shares whole pieces
  (never a cut stitch) between two hoopings along the long side, at the most even cut where both fit (field - 2 mm).
  Two basting crosses on the cut line, placed as near the middle of the gap as both hoopings allow, are sewn at the end
  of the first and first in the second (`compose` opts `marks`), with plain-words lining-up steps; the download is a
  ZIP of both files, each through `validatePES`. The preview shows the whole design (composed in a 2 m pretend hoop);
  step view, sew sheet, sew along, share and one-per-name are off for a split design. Embrilliance patents its
  seam-hiding auto-split; this is the manual method (whole pieces + alignment marks). One piece bigger than the hoop
  by itself can't be split: the error says to use Fit to hoop.
- Sew sheet + cut file (`js/sheet.js`, links under Download): "Print a sew sheet" fills a hidden `#sheet` and calls
  `window.print()` (print CSS hides the app). Page 1 is the hoop field at 1:1 (SVG sized in mm) with the design centred
  as the machine centres it, a crosshair and a 5 cm check bar; page 2 the steps with the machine's thread names
  (`machineThreadList`, step i = colour block i); page 3 the appliqué shapes. A view carries `sheet: { steps, after,
  notes, cut }`; `cut` is the placement outlines in mm (`compose` puts them on fabric steps; the bookmark's is its outline
  grown 3 mm, the ⅛ in it's trimmed to), never stitches (tie-ins would show as spikes in a cutter). "Cut file" downloads
  them as one SVG at actual size, one group per fabric. Verified with headless Chrome `Page.printToPDF`: field 130 x 180
  mm, bar 50 mm. Never test with the real print dialog through the Chrome extension (it blocks the page).
- Heart frames: the dip at the top is filled with a 3 mm round (the circle that just fits the notch): a satin border
  couldn't turn the sharp inside corner (underlay poked out 1.75 mm, both sides piled up).
- Zero-based review fixes (2026-10-29, no stitch changed: both batches byte-identical to the commit before):
  a design that won't build or is too big to split clears the old preview and Download (it handed out the previous
  file); too big is drawn whole in a pretend 2 m hoop with Download reading "Too big for this hoop". A hoop change
  drops the other tabs' designs so they rebuild when shown (a stale 5x7 split on 4x4), and no longer stitches the
  picture from another tab. Arrow keys on the tab bar no longer nudge the selected piece; a click without a drag adds
  no undo step. The quilting cache is keyed on a hash of every obstacle point (moving a middle piece reused quilting
  sewn through it). Min/max over every stitch uses loops (`Math.min(...pts)` overflows the stack past ~110k).
  `routeFill`'s A* gives up at once between 8-connected regions it can't cross and reuses typed arrays (etsy_3 6.2 s
  -> 2.7 s, byte-identical); then a binary-heap open list (ties break differently: 12 of 377 batch files changed,
  stitches +0.09%, trims 2149 -> 2152, peak density unchanged). The
  picture worker runs one job at a time and keeps only the newest waiting.
- Speed (2026-10-29, byte-identical): `renderWord` thins the word once (stroke width, stroke ends and, when no join or
  swash was drawn, the final skeleton) and finds stroke ends/letter pieces only when joins or swashes need them;
  `strokeWidth` runs the distance transform on the ink's box plus a 1 px ring (same distances). The bookmark caches its
  lettering. Pan, pinch and wheel paint at most once a frame; starter thumbnails compose one per idle moment.
  `index.html` modulepreloads the module graph.
- Usability round (2026-10-29): the site opens on Design your own (`#design`); the default name is Emma (no more
  "like the photo"). After a download a dialog says what was checked (machine, hoop, size, pauses) and the three USB
  steps, plus "open the .zip first" for ZIPs, until "Don't show this again" (`doneSeen`). Editor warnings with a fix:
  arched words wrapping over 55% of their curve get "Widen the curve" (`archRoom`, to 45%), and any piece whose stitches
  come within 1 mm of another's says so (`touching`; patches excepted). Plain words: Bold / Thin line (satin / fine
  line), "N loose threads to snip after", the PES version only as a tooltip. Opened files: "Save a copy" / "Save fixed
  copy" / "Save as PES" instead of "Download x.pes"; tiny stitches flagged only past max(50, 1% of stitches). One for
  each name: long names shrink to fit (90%… 55%), a thumbnail per name, Done. Decluttered: Hoop/Thickness/On my item in
  a View menu, Sewing on folded to one line, Fill direction and Fill under More settings, no hex codes under threads,
  the appliqué guide only for real appliqué (not the pouch) and not on top of the 3-step guide. Phones: Download is a
  fixed bar at the bottom; the arrow-key hint hides on touch screens.
- UI engineering (2026-10-29): file inputs are `.sr-file` (visually hidden but focusable; `hidden` ones couldn't be
  reached by keyboard), their labels show the focus ring via `:has()`. Redraws of the studio editor/list and the
  bookmark panel go through `keepFocus` (app.js: the focused control is found again by its data- attributes and
  `[data-seg]` group, caret kept), so Enter on a swatch no longer drops focus to the page. Arrow keys nudge a piece
  only from the page or the focused preview (`#view` has tabindex). Dragging composes once a frame (`compose`
  `dragging`: quilting reused from the last layout until the drop). Colours come from `--danger/--warn/--good` tokens
  with dark variants; dark mode fills the hoop field light (`fieldColor`; navy vanished on the dark stage);
  `forced-colors` keeps thread colours and outlines what's selected; coarse pointers get 44 px targets. Cmd+P fills
  the sew sheet on `beforeprint` (it printed a blank page). `sw.js` (cache v2) serves the cached copy when the network
  takes over 3 s and refreshes in the background. A studio save too big for localStorage says so once.
- Expert features (2026-10-29):
  - Patches: `pattern` (FILL_PATTERNS in digitize.js: Plain tatami, Brick, Chevron, Wave; the row stagger lines the
    needle points into a visible texture) and `blend` (a second colour: two layers whose row spacing changes
    gradually, `share` in `tatami`, each colour's spacing density/share, none under 0.15; the second has no underlay).
    Random row-by-row assignment was tried first: long links and jumps everywhere. Editor: patch > More.
  - Carving (`carve` in pieces.js): a patch's fill is cut away under what's sewn on it, only where that's wide
    (somewhere 4 mm across) and 20 mm² or more; thin satin lettering keeps the fill as its base (carving round every
    stroke took trims 3 -> 9). Holes stay 1.5 mm inside the patch outline (even-odd would add fill outside it).
  - Colour sort (`sortColors` in doctor.js, Open tab checkup): a block joins the last earlier block of the same
    thread if it touches nothing sewn in between (1 mm cells grown by one); files with machine stops or without
    thread colours (DST) are left alone.
  - Resize 50-250 %: within 80-120 % stitches are scaled as before; past that `restitch` rebuilds each block: zigzag
    runs keep their edges with a station every 0.2 mm (satins over 8 mm wide become fills), fill runs (over 3 mm
    both ways, 70% of length one way, or 45% plus 80% with the 90° underlay) are traced and refilled at 0.4 mm,
    together per block and direction and minus what an earlier direction already filled (the peace sign piled 37
    hits/mm² otherwise), the rest are running lines (0.5-3.5 mm). gnome/ufront/peace at 0.6x and 1.6x: satin gap
    0.40-0.41, peak density <= 24. `tests/doctor.test.mjs` covers 0.5-2.5x with and without sort (slow: ~3 min).
  - Realistic thread (View menu): the twist drawn across each stitch when zoomed in (`real` in `draw`).
  - Letter pairs (print fonts, text > More): `kern` = { index of the pair's first letter in the words: % of the
    height }, added to the font's own kerning (`renderWord` `kern`: letters drawn one by one where the whole word
    puts them, plus the shifts; dash decorations measured from the drawn ink). Lines and arches map the indices
    through the trimmed lines; editing the words keeps pairs in the unchanged start and end (`rekern` in ui.js).
  - Thread weight (Sewing on, `THREADS`, compose opts `thread`, saved with the design): Automatic is byte-identical to
    before (40 wt, small lettering sewn for 60). 30 wt: lettering satin 0.45, other satins x1.15, fills +0.05 mm;
    60 wt: lettering 0.34, other satins x0.88, fills unchanged (0.3 mm rows fail the PE900 check), no small-letters
    tip. Knit adds 0.04 to the lettering satin. `wt` is a module variable set for the length of `compose`; stitch
    caches key on it.
  - Not done from the gap review: photo stitch, free-standing lace, 3D puff.
- Persona user tests (2026-10-30, plan in ~/.claude/plans/needleworks-user-testing.md): newcomer (phone), hobbyist
  (laptop), expert (desktop, keyboard, bad files) as parallel agents, each on its own headless Chrome driven by
  `tests/cdp.mjs` (`start DIR`, `viewport W H [mobile]`, `goto`, `shot`, `els`, `click`/`tap`, `type`, `key`, `upload`,
  `eval`, `console`, `nocache`). Subagents can't write report files: they hand the report back. Round 1 fixes: Turn hoop
  in the Design tab lays pieces out in the turned field (long side across) and turns the file clockwise into machine
  orientation (`designHoop`/`toMachine` in app.js, names ZIP and cut outlines too); it used to turn the preview only, so a
  long word could never use the 7 in side. Redo (⇧⌘Z / Ctrl+Y, was a second undo), undo skips snapshots equal to now,
  Delete removes the selected piece, the preview picks the smallest piece under the pointer (letters inside a frame).
  Warnings list every problem: characters the font lacks (`missing` in ui.js: past Latin Extended by code point, Latin
  by width; width alone misses CJK because the fallback chain changes), towel lettering under an 8 mm x-height
  (`towelMin`, with a one-tap size), arcs past the whole way round. Words are capped at 3 lines as typed. Open tab: a
  file with no stitches says so and clears the old one (it showed -Infinity mm, "Fits"). Have ready (fabric `ready`,
  bookmark `READY`) on the steps, sew sheet and first Sew along screen. Too big: one size everywhere, with a Turn the
  hoop / Fit to hoop button. Byte compares need a fresh no-cache baseline (`out/base` had gone stale by 3 commits).
  Round 2 (stitches changed, all 396 batch files still pass): `Design.finish` drops a stitch onto the hole the needle
  is already in (`dedupe`; line drawings had ~25% doubled, lettering 12-47 per file: batch stitches -0.8%, same-hole
  11,378 -> 107, no file gained a stitch; the bookmark lost its doubles too) and `pe900_check.py` fails files over 1%
  (`same_hole`). `relieve()` takes a second pass allowing merges up to 7 mm where 4 mm can't get a cell to 24 (a
  picture's travel funnel sewed 25). Starters set the fabric (cotton unless they say: towel stuck to every later
  starter, +40-75% stitches). Fit to hoop composes and shrinks again until what's sewn fits (outlines leave out satin
  and swashes: 142 mm in a 126 mm field). Thread descriptions in the file are ASCII (“Noah” read back as â€œNoahâ€).
  A step whose thread differs from the last says "Change to the next thread." before its fabric instructions. Turned
  Design-tab files carry a hooping note (steps, done dialog, sew sheet). Lettering that sews as a fine line says so
  with a "Make it bold" link; names in a batch say "(smaller, thin line)". Header wraps the tabs to a second row at
  861-1240 px (the machine select covered "Open a design" at 1024). `tests/cdp.mjs start` disables background timer
  throttling (headless pages are "hidden": a 300 ms debounce took 57 s). Then: a patch's satin edge (`edge` stage)
  sews after everything on the patch (covers the lettering's pull at the border; batch: only patch/carve/blend files
  changed); monograms inside a frame shrink to fit it both ways (`fittedSizes`, 0.92 of the frame less half the gap,
  so the starters' monograms are unchanged; a script R on the key fob overran it); "+ Design file" goes above the
  pieces (below if only that fits), sews first after frames, and the layout is recentred. Not done: picture specks/trims.
  Round 3 (stitches changed; VM: FITS 17/17, PE-DESIGN opened bookmark, towel, turned picture, monogram):
  `relieve()` also tries windows whose corner cell is empty (towel names reached 27 hits/mm² at some offsets) and never
  merges A,B,A' into a same-hole stitch; `dedupe`/`relieve` round half-to-even like the writer; `pe900_check.py`
  checks density at every 0.1 mm offset (its own scan had the same empty-corner gap). Turned designs (pictures and
  the Design tab) are thinned after the turn (`turnForMachine`). Lettering satin width is continuous:
  min(3.5, 0.2 xh, max(stroke, 0.12 xh)) (two rules met at a 0.95 mm stroke: Allura 2.0 mm at 24 mm, 1.2 at 28;
  script monograms that fell back to a fine line are satin now). Lock side hits go toward the stitches they lock
  (`inward`; they poked 0.5 mm out of script strokes). Fine-line dots (full stops, i dots) are kept: a lone stroke
  under 0.9 mm sews as 0.7 mm out and back (it comes twice from the walk: sewn once). Pictures drop compact specks
  (under 4 mm² and 2.5 mm across; 4 mm² for everything erased a bouquet's stems) and sew moves inside a fill up to
  2 mm straight (trims -5%, loose threads -12% on the batch). Quilt label starter uses Quicksand 9 mm (Josefin's
  single-storey a merges its stem into the bowl and reads as o; still true for Josefin and small Quicksand: open).
  Tried and reverted: split satin 7-14 mm in the doctor's re-stitch (tapered ends piled 39-49 hits/mm²).
  Before round 4 (2026-10-30; four parallel worktree agents, merged, then UI: Picture tab "How to stitch it", a
  "runs into" warning beside Download, new pieces placed beside the others (`freeSpot`/`recentre`), roving tabindex on
  the starter row, piece buttons named with their piece, field edges at 3:1 (`--field-line`), oversized designs
  fitted whole (`v.whole`); the checkup's thickness at every grid offset (`peak` in doctor.js)):
  Batch after merging: 396/396 ok, 153 files changed, stitches -1.5%, same-hole 0, script bookmarks byte-identical.
  VM: FITS 18/18; PE-DESIGN opened peace at 150 %, appliqué AB, mug rug, cross-stitch.
  Round 4 fixes (2026-10-30; testers 6/5/6 found a picture that never finished, a cut file with slits into every
  appliqué letter, thread names that didn't match swatches; four worktree agents again, then UI: a 60 s picture
  watchdog that restarts the worker, a supply list on every design, Turn hoop reset per starter, off-centre layouts
  say the machine centres them, "Knit / T-shirt" and "Towel / fleece", motifs beside the words, one-tap 5x7 for the
  bookmark, `bookmarks_N.zip`, section headings, the "colours too alike" note). `tests/cdp.mjs` puts Chrome's temp
  files beside its profile (TMPDIR, MAC_CHROMIUM_TMPDIR): a full system disk stopped headless Chrome starting.
  Batch after merging: 400/400 ok (4 new BABY cases), 249 changed, script bookmarks byte-identical. VM: FITS 16/16;
  PE-DESIGN opened BABY appliqué, etsy_8 (title sewn), gnome at 160 %, the patch (fill, JD, edge last).
  - Picture travel searches stop past `SEWN` (3 mm) on finished stitches or past their length limit; a fill's sections
    are chosen with one search from the needle per move (`reach`), not one per section. Limits: 50k cells per search,
    6M per router, 12M per picture (`routeBudget`, counted in cells so browser and Node match); past them it jumps.
    etsy_5 (a framed photo's textured backdrop, 1782 sections) took over 280 s, now 0.55 s; the app also stops a job
    after 60 s and restarts the worker.
  - Frames (`findFrame`): edge ring mixed but a ring within 8% inwards 85% one colour family (ΔE < 10) for 2% -> the
    band's pieces are the frame; colours learned again without it, its blended inner edge cut, background read from
    5 clean rings. Shades within ΔE 8 of the background, or ΔE 15 and over a quarter of the border, are background.
  - Near-identical k-means clusters (ΔE < 6) are learned again with more clusters (twice at most); `analyze` returns
    `merged` (asked-for colours that came out the same; the Picture tab says so) and `frame`.
  - Thin lines (< 1 mm) are never dropped as specks: walked, sewn out as a triple run and back. Groups (pieces within
    2 mm) under 6 mm of line are specks; parts of filled shapes narrower than 0.7 mm (`THIN_PART`) are lines too;
    anti-aliased blend pixels between the fabric and another colour are left out. (etsy_8's title and etsy_1's stems
    had vanished from Filled.) Filled pictures +25% stitches from this (triple run kept on purpose).
  - Picture colours are snapped to Brother threads by CIEDE2000 (`snapToThreads`, unique, never 62-64; plain Lab sent
    olive to Russet Brown): `hex` is the thread colour, `picture` the picture's own; the writer's red-mean match then
    picks the same thread, so swatch, name and machine agree (a green was "Pewter").
  - Open: etsy_7 thin doodles near-white at 4 colours; etsy_6 green panel (63% of the picture) still sewn; app.js's
    content crop sizes a framed picture by the whole frame.
  - Lettering satin (round 4 fixes): min(3.5, 0.2 xh, max(stroke, 0.12 xh, min(0.15 xh, 1.2))); auto satin from 0.8 mm,
    under that a fine line (it was 1.0, bumped to 1.2: 20 mm script names sewed as a thin line). Counters:
    `counterPockets` (raster.js) measures each gap between the centre lines; `counterCaps` narrows only the strokes
    round one that would close (0.8 mm between needle points after pull; gaps under 0.6 mm left to fill; explicit Satin
    and towel ignore it). Script skeletons keep short ends reaching 1.5 strokes and 0.2 xh out (`tongues`; pieces.js
    only, the bookmark unchanged): Yellowtail's e tongue and y tail came back, so Yellowtail words are a little
    smaller at the same size. `towelMin` checks counters under the towel column (down arches squeeze by the bend:
    Great Vibes "Oliver" 17 -> 38 mm); `archTight` also flags an up arch whose letters are taller than 0.6 x its curve
    radius; `archFit` grows the arch (both size buttons use it). Print monograms spaced by their stitches in 0.5 mm
    bands (gap + 0.4 mm). `Design.path(..., lockAt)`: lettering runs lock 1 mm in under their satin. Satin dots are one
    satin at least 1 mm long with no run under it. Design-tab stitches +7.6%; files at 24 hits/mm² 99 -> 160 (more
    small script is satin now; all <= 24). Dropped: satin cut short at junctions (gaps in Josefin's A and h).
  - Appliqué routing (`applRoutes`, replaced `chained()`, after a tester's cut file had slits into every letter): each
    stage moves between outlines only where it ends up hidden. Placement: inside the letter or under a satin still to
    come (a hole with no exit goes back across to its outline and along it). Tack-down: along its own line, then across
    gaps the satin covers. Satin: each starts where it leaves (reached along its own centre line), moving from its outer
    edge into the next satin. Covered = 0.15 mm short of the satin's reach (1.8 mm out, 1.0 in). New runs start at
    least 5.5 mm from the last stop, across pauses too. Holes still trim in tack-down and satin. BABY (Lilita 34 mm)
    21 -> 18 trims; appliqué-letter batch 228 -> 176. Cut files are the outlines (`cut` on the stage), never the
    placement run; the preview's fabric splits a placement run into its rings (`rings` in render.js). Open: only the
    first fabric block gets a fabric shape in the preview.
  - Stipple seed: the outline of a random Kruskal tree over knots 1.5 x space apart (lobes 0.4-0.8 x space, leaves
    x1.4, necks 0.32), holes filled, then `relax` with no growth within 0.9 x space of the free edge (a tester still
    saw a maze). Longest straight run 22-30 -> 12-22 mm. Dropped: knots 2 x space apart (sparse coral), full growth at
    the edge (lines along the frame).
  - `hang` on in-the-hoop frames (ornament and key fob starters; unquilted ITH frames by default) adds the ribbon text.
  - Re-stitch (round 4 fixes): keeps the source's density, satin same-edge gap clamped to `SATIN` 0.3-0.5 and fill rows
    (area / row length) to `ROWS` 0.35-0.5; zigzags over `OPEN` 1 mm (underlay) stay lines (rebuilt as satin, peace's
    took +81 % thread). A column's half-stitch at either end is sewn but isn't an edge point (it pulled edges in at
    joins: ursula 250 % 21 bare spots -> 6); edges are interpolated by their own point counts. Column ends reach `EXT`
    0.5 mm on only where the source sews within 0.3 mm past (`COV`) and never outside the source's scaled box (`BOX`).
    Square-wave satins count as zigzags (star_badge 250 %: 100 bare spots -> 0). Refills start from the end nearer the
    needle and `travel` reaches them through cells inside the fill or sewn by this colour or a later one.
  - `respace` (resizes within 80-120 %, or `fix({ satin: true })`): satins outside 0.3-0.5 are re-spaced in place, first
    and last hole kept. Checkup flags satins tighter than 0.25 and offers "Even out the satin stitches".
  - `fix` runs in `js/doctor-worker.js` (newest job only, spinner after 150 ms); the slider rebuilds on `change`; a
    "Longer side" box sets the size in mm; Tiny/Thin ticked by shrinking are unticked back at >= 100 %.
  - File pieces label each stage with the block's own thread name (all were "gnome").
  - Picture travel (2026-10-30): `makeRouter` (digitize.js) is the shared 0.5 mm-cell A* (`routeFill` refactored onto
    it, byte-identical). In `build`, a move between a colour's sections or shapes (up to 10 mm, `TRAVEL`) travels, with
    stitches up to 2.5 mm, through cells this colour's unsewn fills (0.25 mm inside) or a later colour's solid fill
    (over 0.6 mm inside a non-speck shape) will cover; at most 2 mm on finished own-colour stitches, route at most 1.5 x
    the gap + 3 mm. Moves under 2 mm are always sewn (a jump that short is never trimmed: a loose thread plus two locks).
    Shapes go nearest-first, preferring a hidden route, then a jump over 5 mm (trimmed) over a 2-5 mm one (loose).
    Batch pictures: trims -9%, loose threads -59%, stitches +0.4%. Remaining jumps cross background or earlier colours.
  - Tatami (pictures and patches): the step to the next row is split into pieces <= 3 mm (it reached 7.6 mm along
    shallow edges) and a row-end stitch over 4 mm is halved: stitches over 4 mm 1492 -> 60, +1.4% stitches.
  - Cross-stitch: runs chained by Dijkstra over cell corners (edge step costs 1 beside this colour, 2 beside another,
    4 over open fabric, back over a sewn diagonal 1; limit 6), else a jump preferring over 5 mm. A cell with no
    same-colour cell within 2 and no other colour touching it is dropped (dropping every lone cell erased sprigs).
    Trims -78%, no loose threads, stitches -41% (locks).
  - Line drawing: whole pieces under 2 mm dropped (pruning 2 mm dead ends cut small lettering apart; `spur: 1` kept);
    a line end within 2 mm of another drawing is joined (out-and-back tour, back over the same stitch; 3 mm drew bars
    between letters); each drawing entered nearest the needle, preferring over 5 mm to 2-5 mm. Trims -78%, no loose.
  - Doctor re-stitch (`restitch`, 2026-10-30): wide satin columns stay satin (filled only past 30 mm median width);
    stitches over 6.8 mm are split (`split`: pieces <= 5.5 mm, cuts staggered by a quarter piece in golden-ratio steps)
    because the writer halves anything over 7 mm out of sight of `relieve`; crowded edge hits become short stitches
    (`room`, 16 per 1 mm window on a 0.5 mm grid); cuts slide along their own stitch out of crowded spots (`spread`,
    then `slide`). Filling each wide column on its own (everything over 8 mm until then) criss-crossed peace's ring:
    trims 49 -> 103 at 150 %, now 48. A rebuilt column ends on the edge its run ended on (ursula 150 %: trims 24 -> 3,
    loose 20 -> 1). Dropped: fixed-place split cuts (33-40 hits/mm²), filling columns over 25 mm (peace 250 % trims 54->82).
  - `slide()` (end of every `fix`): where a 1 mm window at any 0.1 mm offset has over 24 hits in one block, a point in
    the middle of a straight line (>= 5 stitches from any command) slides along it, both stitches kept 1-6.8 mm.
  - `landJumps` (on open and in every `fix`): a jump lands on its first stitch. The writer puts the needle down where a
    jump ends; all 49 of peace.pes's jumps stop 0.5-12 mm short, so re-saving gave 31 loose threads instead of 3.
    `fileBlocks` starts runs at the first stitch for the same reason (a Design-tab file piece: 31 -> 3). `fix` keeps the
    stitch a jump lands on and splits stitches over 6.8 mm itself.
  - Shrinking turns on Remove tiny stitches and Thin; the checkup says how many jumps shrinking brought under 5 mm, flags
    stitches over 12.1 mm with a "Split long stitches" fix, and shows the 10 mm note only when none are over 12.
    Open: the checkup's "Thickness" still counts at grid offset 0 only (peace 17 vs 25 at another offset).
  - Print-font stroke ends reach the ink's edge (`reachEnds` in raster.js, `skeletonEdges(..., { reach: true })`, print
    only): thinning stops ~half a stroke short, so a single-storey a (Josefin, small Quicksand) lost its stem's ends
    inside the bowl's satin and sewed as o. Lettering is sized from the strokes before that (`info.sized`, also the
    bookmark's band), so sizes are unchanged. Loops count twice for the loose-end test; dots aren't extended.
  - Print letters always jump between separate pieces (`gap` on the first stroke of each piece after the first, through
    `letters` -> shapes -> `stitchLetters` -> placement -> `d.path(q, true, q.gap)`; towel moves it to the lattice;
    bookmark: `print && k > 0 && j === 0`): the reached i stem came within 2 mm of its dot and Design.path sewed it as a
    stitch. Script unchanged.
  - Appliqué letters: each ink piece is closed (grow then shrink 1.4 mm, `closeMask` in outline.js) before tracing, so
    slivers inside a letter (M's notches) go and the satin no longer spikes; closing the whole word merged near letters
    and i dots. `chained()` (pieces.js) sews the placement line letter by letter, left to right, reaching each hole by a
    straight run across the letter (under the fabric): AB 14 -> 12 trims. Tack-down and satin still trim between loops.
  - Heart frames: the bottom cusp is an arc of the 1.8 mm circle that fits it, then refitted to h (placement/tack
    showed ~1 mm past the flat-ended satin, the edge walk 2 mm).
  - Print trims (S10): every walk ends where it began, so each move between letters is a trim or a visible connector
    whatever the order; left as is.
  - Quilting (rewritten 2026-10-30 after a quilter called stipple a maze with V points and echo's steps/corner
    triangles ugly): `freeMask` also returns distance to the frame (`dtA`) and to the pieces (`dtB`). Stipple: the
    spanning-tree walk (cells 1.2 x `space`, 5 mm) is only a seed; `relax` (up to 600 rounds on 1.2 mm points):
    repulsion from other parts of the line closer than `space` (arc neighbours within 1.7 x space skipped), a push
    `space`/2 off the free space's edge, bending (-1 4 -6 4 -1, 0.6) and growth where there's room (0.3), max 0.25 mm a
    round; stops when under 0.2% longer per 25 rounds, then 15 rounds to round off kinks. Loops under 40 mm dropped.
    Sewn with `followRun(2.5, 0.15)`. Dropped: Laplacian pull (halved the line), growth at the curve's scale (wiggles),
    long-range repulsion (6.7 mm spacing), smaller seed cells (a maze).
    Echo: rings are levels of f = a/(a+b) (a = mm out from the pieces' clearance, b = mm in from the frame), n = round(
    30th-percentile width / gap), so they turn gradually from the lettering's shape into the frame's; where width/n <
    0.5 gap rings are cut into arcs. Empty frame: rings every `gap` in from it. `chain` sews innermost first as a
    spiral (each ring glides over its last 3 gaps onto the next; a ring reached by glide stops halfway round);
    straight steps only under 2.5 gaps crossing nothing. Batch quilting: trims 105 -> 84, stitches -0.3%, density
    unchanged. Open: narrow heart/diamond tips stay empty; quilt label with stipple sews as 3 lines.
- The preview is the file: `setView` decodes `v.bytes` with `readEmbroidery` and draws/counts/fit-checks that, and
  thread labels come from the file's own PEC palette.

## Gotchas
- **Proprietary, not open source** (2026-10-30): `LICENSE` is all rights reserved to 4Gables (a trade name: no
  personal name anywhere on the site or in the code). Every shipped file (js, css, sw.js) starts with a `/*! Needleworks (c)
  2026 4Gables ... */` line (third-party ports name their licence there too); new files get it as well. The page has a
  comment, `meta copyright`, `rel=license` and one footer line. Third-party parts stay under their own licences in
  `THIRD_PARTY_NOTICES.md`. The repo stays public (GitHub Free can't serve Pages from a private repo, and the served JS
  is readable anyway).
- **No one else's code or data gets committed: clean room only** (project rule, 2026-10-30). Nothing written by
  someone else (code, ported code, icon/SVG paths, data tables, images) is committed, whatever its licence. Learning
  from other projects is encouraged, but only by the clean-room method:
  1. One agent reads the outside source and writes a spec in `docs/` with behaviour, byte layouts, formulas and facts
     in prose and tables. No code, no line-by-line paraphrase.
  2. A separate agent that has never seen the source (not in its context, not opened, not from memory) implements
     from the spec alone, in its own structure.
  3. Tests prove the result against the spec or an outside oracle. Running an outside tool as a test oracle
     (pyembroidery in `tests/`, installed from pip, never vendored) is fine.
  - Ideas, algorithms and numbers from papers, manuals, docs and issue threads may be used directly (credit them in a
    comment, e.g. "Ink/Stitch's contour underlay"). Copying their code or wording may not.
  - Facts such as thread colours come from the maker's own published source, cited in the file's header, never from
    another project's table.
  - Drawings are drawn here, without looking at other icon sets.
  - The spirit: if we can build it ourselves, we build it ourselves. Using someone else's code or asset needs a good
    reason:
    - it's clearly better for our customers (a hand-designed typeface beats one we'd draw), or
    - it's the industry standard (people expect that exact thing, and our own version would be a worse copy).
  - Exception, only with such a reason: free assets under a permissive licence (OFL, MIT, Apache). They may be
    committed as is, each with its licence text beside it and a line in `THIRD_PARTY_NOTICES.md` saying why we didn't
    make our own. Today that's the bundled fonts. Code, ported code and data tables never fall under this exception.
  - The 2026-10-30 clean-room round replaced `formats.js`/`threads.js` (was a pyembroidery port, spec in
    `docs/formats-spec.md`), `motifs.js` (was Phosphor) and `brandcharts.js` (was Embroidermodder).
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
- Fill density (`DENSITY` in digitize.js): Standard 0.4 mm rows (the 40 wt norm; the default since 2026-10-29) or
  Dense 0.35 (felt, patches, dark fabric; Design-tab patches always use it). 0.3 fails the PE900 check
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
- Script fonts render via CSS `@font-face` families named `NW <Font>` (local WOFF2 in `fonts/` (converted from the OFL TTFs with fontTools; stitches byte-identical), OFL); the
  lettering engine needs `document.fonts.load()` before drawing.
- `tests/external/` (gitignored) holds third-party PES/DST samples and Etsy images used for manual testing, with
  pyembroidery read oracles in `tests/external/oracle/`.
- Every download goes through `validatePES()` (js/core/formats.js): re-reads the bytes and requires the same needle
  movements as the source design (PEC's zero-length anchor stitches after jumps are ignored), an END marker, enough
  threads, colour-change toggle bytes alternating 2,1,2… (what Brother writes; real files follow it), and fit in the hoop field (less the 2 mm margin,
  like every other check; it used the whole hoop until 2026-10-29). Validation only: the written bytes are unchanged.
  Opened PES files are offered as their original bytes after the same structural checks. Tests: re-encode of all
  samples, 300 fuzz designs, and 50 byte-flip corruptions must all behave.
- Hosting: 4gables.com is the `4gables/website` repo's custom domain (a *project* site). Other repos only appear under
  4gables.com/<repo>/ if the org site repo is named `4gables.github.io` and carries the custom domain.
