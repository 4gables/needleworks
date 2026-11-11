# Design tab (`js/studio/`)

Reference for this part of Needleworks: the rules, the reason for each (it stops someone undoing it) and the number that proved it. Hard rules are in `AGENTS.md`. Add a lesson where its topic is, never as a round log.

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
- Starters open with nothing above a tip on 5x7 and 4x4 (`tests/starters.mjs`): "Ashley" in Great Vibes fills its
  loops 16-22 mm, so names are 24 mm or Yellowtail (`BOLD`); an optional `small` layout for hoops under 150 mm (the
  studio batch builds it on the 4x4); name starters that lie long open turned (pet, stocking, decorated, tote, towel).
  A fresh profile opens on "framed". Starter tips carry no supply sizes: Have ready is the only place for them.
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
- Heart: top dip filled with a 3 mm round, bottom cusp an arc of a 2.2 mm circle, the border's inside half (a satin
  can't turn a sharp inside corner: underlay poked out; 1.8 folded once the border was 4 mm). The arc's angles stay in
  -90°..270° (atan2's wrap drew it over the top: a notch at a 100 x 84 heart's point).
- Satin border (`satinBorder`: appliqué, patch, in-the-hoop): 4 mm at 0.34, centred 0.2 mm inside the line, so it
  reaches 1.8 mm out as the old 3.6 mm at 0.4 did (sizes and fits unchanged; wider both ways, two key fobs no longer
  fitted 4x4) and 2.2 mm in. Ashley 2026-11-05: fabric showed through and frayed past 3.6 mm at 0.4.
- Stage seams: an outline sewn in stages (in-the-hoop, appliqué frame, pouch's last stage) starts each a third
  further round (`seamAt`, `seamed`: compose doesn't `enter` them where the needle is). All three at one corner put 16
  hits in one hole and 15 beside it on bare tear-away: Ashley's first bookmark tore there. `seamStage` keeps them
  rebuildable: `build()` moves a start after a pause on (5 % steps) until it's 5.5 mm from where the needle stopped
  (`reseam`; gang moves the first frame's). An appliqué frame's border after quilting keeps its own start (started
  where the quilting stopped, 1.4 mm across the pause: a loose thread).
- Several appliqués in one thread sew stage by stage together (`gangAppliques` in compose.js): all the outlines,
  one stop to lay the fabric, all the tack-downs, one stop to trim, all the satins: 3 stops for two hearts (or a
  heart and appliqué letters) where sewn one after the other took 6. Only pieces that are placement, tack-down and
  satin and nothing else (a quilted appliqué frame is left alone), whose stitches don't overlap (boxes + 1 mm), with
  nothing sewn between them in the list that the later one would lie on. Each outline keeps its own seams. The
  stops that remain are the ones the maker needs: lay the fabric (after the outlines), trim it (after the
  tack-downs); a different thread for the satin or a name is its own stop as before. Batch: `st_appl_two_hearts`,
  `st_appl_heart_letters`.
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
- `ith` (Ornament, Key fob): the outline on bare stabilizer (with the ribbon hole's circle when `eyelet`, started half
  way round from its satin ring's start; Ashley asked to see where the hole goes), appliqué front, the pieces, then a
  `last` stage tacking taped-on backing and satining through every layer. `hang` adds the ribbon. Its cut file is the
  outline alone (`cut: [edge]`).
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
- `landing()`: a size the frame shrinks back (over 0.25 mm) is `capped`, never offered ("make it 17 mm" did nothing);
  instead a bigger frame (`grown`/`roomIn`; `frameFor` keeps growing past a touch) or the motifs left out (`data-no-deco`).
- `followFrame` on a scallop uses its valleys (`SCALLOP_IN` 0.88). Arching multi-line text arches the first line; the
  rest becomes a straight piece (toast, one undo).
- Typed text limits `MAX_WORDS` 60 / `MAX_INITIALS` 12 (typed.js) in the editor (`data-max`, said when cut; never
  `maxlength`, which cut a paste silently), `cleanPiece` and the names batch (refused, "too long"). Past ~150 letters
  `renderWord`'s canvas draws nothing: lettering with no stitches is the BLOCK `undrawn`; empty lettering is `empty`.
- `label(p)` shortens over 30 letters to 24 + "…" (`brief`) for messages; `label(p, true)` is the thread name written
  in the PES (golden bytes): never write the short one into a file.
- Measure a layout by `sewnBoxes`/`layoutBox`/`layoutSize` (fitted sizes), never `pieces.map(pieceBounds)`: Fit to hoop
  shrank a quilt label on a bigger hoop. `place()` decides "already too big" with compose (`fitsNow`). `bulk()` size and
  loop checks skip the sewing order. Too big: `fitWays` offers Fit to hoop, "Fit and turn the hoop" (10 %+ bigger) and
  "Make the frame fit the hoop" (frames only, `carried` moves what's in them), each only where it lands. Frame `most`
  (mm) caps fixes and Fit (birth announcement 140: a 6 in display hoop). The size control says "N mm sewn" when a frame
  shrinks lettering; `api.setView` returns the chip's size, which the too-big note uses.
- `keepWord`: changing an arch's curve keeps the word where it shows (unless it follows a round frame). Script
  lettering mostly in capitals is the `caps` problem (fix: Quicksand): every script's capitals read badly. `archTight`:
  script descenders over an up arch past 0.15 x the radius. Lines keep min(½ x-height, ¼ size) of ink gap. Monograms
  in every font are spaced by sewn stitches; `monoSize` gives an initial set its frame's width (down to 70 %).
- Where a piece shows (selection box, picking, what's on a frame, room in a frame, Make another) is measured at its
  sewn size: `sewnAt`/`onFrame` (a frame-shrunk monogram, asked 25 sewn 9, wasn't "on" its key fob). `spotIn`: the
  selected frame, an empty Make-another twin, then the biggest; a copy lands on an empty twin in the same place; a
  piece placed in a frame moves after it in the list. Make another offers "Make them N mm and add another"
  (`smallerTwins`); "Put the same on the other one" (`sameOn`). `noRoom` offers turn, a file at 90-50 %, then Add
  anyway; adding to a too-big design says so. `Design.finish` records `shifted`; the too-big preview draws stitches
  back where the pieces are (`look.shift` -> `unwrap`).
- Speed: a too-big compose carries its design (`err.composed`) so `split()` doesn't rebuild; `compose(..., { measure:
  true })` skips carving for fit-only checks (tests/browser/measure.html); too-big fixes are worked out a tick after the
  preview, never while dragging, cached per design + hoop (`advice`). `unfold` searches only 16-segment runs whose
  boxes meet past the first 24 steps; appliqué exits try `edgeTop` first.
- File names: `title` (Rename) for every Design exit via `firstWords()`, else the lettering, else starter + motifs
  (Coaster_Heart.pes); a starter, Add words or a picture clears it. Picture -> "Use it in Design your own" (`usePicture`).
- Asked vs sewn: measure a piece with `sewn(p, pieces)`/`sewnBox`/`sewnBoxes`/`layoutSize`, never `p.size` or
  `pieceBounds(p)`; `tests/sewn_lint.mjs` (CI) fails on a raw read outside its allow-list. A change that ends a frame's
  fit (arch, wave, turn off square) keeps the sewn size; the names batch starts from the sewn size.
- Nothing changed silently: `cleanPieces` (Open saved, paste, + Design file) says unreadable pieces, unknown fonts,
  cut words and clamped settings; empty lettering is kept (`empty`); quilting with no room is `quilt:<id>`; shrunk
  copies, renamed batch files and a picture's frame band (`framed`) are said (`tests/said_flow.mjs`).
- One reset: every entry point that replaces the design goes through `newDesign(ps, o)` (fabric, basting, thread,
  turn, fitted, two, starter, title, tip, zoom, step view). The undo snapshot holds those and the hoop (a hoop change
  is an undo step); `restore()` hides action toasts. The starter tip is design state. `savedDesign(bytes)` sends a
  .needleworks.json from drop, share, Open tab or + Design file to `studio.openSaved`. `landing()` refuses a fix that
  brings a new problem (`newProblem`), and so does "Move it to the free space". Frame outlines are at least 0.5 mm
  (`shapeOf`); "Make the frames fit" stops at 20 mm (`FRAME_MIN`).
- Speed: stage cache keyed by `sewnWith` (fabric only for lettering and knit patch fill; thread weight fully for
  lettering, else only 30/60); caches evict least recently used (`recent`); a patch's carved fill comes from
  quilt-worker.js (`fillLater`, Download "Filling…"); `make()` yields between drawing (`drawAhead`), fit, problems,
  stitches and preview; `warn()` is paced (`pacer`/`PACED`: never save a result from a catch that swallows PACED).
- `change()` keeps a frame-shrunk size only when the change takes lettering out of `fitFrame` (arch, turn off square):
  "Ashley Ashley Ashley" back to "Ashley" stayed 9 mm (the saved size was wrong too). Pacing: `pacer` is on only while
  `warnNow`'s own code runs (`go()` after each await, off in `finally`): left on, Make another did nothing and "paced"
  was thrown uncaught.
- Too big: the preview, editor and Download note offer the same fixes (`tooBig(msg, ...fixes)`, `showError(msg,
  fixes)`): Fit to hoop (never shrinking a design that fits), Fit and turn, "Make the frame fit the hoop" (`framesFit`,
  the over side first), a sliver over "Make X N mm" (`snug`, up to 10 %). A hand Turn with room offers growing.
- Arches: `archWrap`/`ARCH` 1/3; `archRoom` warns past 0.4; a followed frame shrinks letters to 80 % to stay within it;
  lines split off an arch go under its lowest stitch (`lineRest`/`placeRest`), typed lines too when the box is left.
- `readable` includes `MOTIF_MIN`; `patchEdge`: nothing placed or fixed onto a patch's satin edge. A file piece made
  bigger is re-stitched (`fix(..., { grow })`). Giving one ganged frame its own thread says so ("Use this thread on all").
- Keyboard one-tap fixes focus the control they changed (`CHANGED`), else the problems left, never the Turn slider.
  Toasts with an action stay until used or dismissed (×, Escape, next design change, tab change); others time out
  (paused while hovered/focused). Dialogs open with `modal()` (a tall one at its top). The same problem for several
  pieces is said once "(N pieces)" (`folded`); quoted names are in <bdi> (`isolate`). The Words box hides the swash
  marks (`swashless`/`reswashed`). A starter over a picture offers "Add <file> to it". The design's fonts load first
  (`facesOn` once they're in, `fontsIn` for anything else drawing lettering: Recent thumbnails; a design with no
  lettering waits 1.5 s, so a passing empty state doesn't ask for every font).
- Wording, sliders and small rules:
  - Steps: `tidySteps` joins neighbouring "Sews <thing>." sentences; a stage may carry `many(n, all)` words for n in the
    hoop (`gang` uses them: "both bookmark outlines", "each ribbon"); motifs are "the <name> motif"; two hoopings count
    the files handed out. Every exit says what it saved (Save design, SVG, DXF with its mm size, Download after "Don't
    show this again").
  - Sliders: `range()` picks a step that holds the value; code sets them only with `setRange` (18.5 read 19).
  - Beside Download "The fix is with the piece's settings: show it" (`fixHint {piece, many}`, `studio.showFix`).
  - `monogramHelp()` (typed.js) is the only monogram help, in the user's letters. `tidy` keeps ZWJ/ZWNJ/tags only
    inside emoji and flags; empty pieces are "<Kind> (empty)".
  - Words a frame shrank under 80 % get "Put it on two (three) lines" at the biggest asked size up to the one asked
    that lands (`frameLines`; at the asked size a quilt label's line ran into the name below, so nothing was offered).
  - "Use <thread> for everything: N fewer thread changes" (`allThread`, counted by composing with one thread).
  - A press outside an open popup (View menu, chip tip) only closes it (one capture rule in app.js).
  - While a text box in the editor has focus the preview keeps its scale (`draw` `fit`): each letter changed the note,
    threads row and Download name under it, so its height jumped.
  - render.js: a thread that blends into the ground (luminance under 1.6:1 or ΔE under 20, against each ground colour,
    gingham's three) gets an opposite-tone edge (90 %, at least 2.2 px); on gingham every thread a base-colour halo; the
    step view's faint stitches too.
  - Recent designs (`keep`/`recentUI`/`openDesign`): `newDesign()` keeps the design it replaces as Save design's JSON
    in `nw:studio.recent` (8, ~1.5 MB, oldest dropped on quota), not when unchanged from a starter or first visit and
    not downloaded (`edited`/`sent`; `studio.downloaded()`); opening one is an Undo step. Whole designs, not undo
    history. The Picture tab keeps its own picture in IndexedDB (`needleworks`/`kept`, 15 MB) and settings in
    `nw:pic.last` (`lastPicture()`); tests expecting the sample delete that database The connection closes on `versionchange`
    (it never did: another tab's delete waited for good and every open behind it, the Picture tab never ready) and reads
    give up after 2 s.
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
- The file's own block names travel with it: a copy written by the Open tab names threads as the machine does, and
  the doctor's `fix` hands back threads without names, so `open-words` puts the opened file's names back block for
  block and a re-stitch keeps `orig`'s (gnome.pes fixed, words added, fitted: 18 steps of "Sews gnome (colour 1)" and
  no word on the appliqué fabric).
### One for each name
- `main()` (biggest text or monogram, letters before a date) names the file and is swapped. Names drawn at the
  design's letter scale (`inkHeight`), keep bold, shrink to fit (90 %… 55 %) or are captioned; a missing glyph refuses
  a name; past 40 are left out; with the hoop turned, a name that sews the same upright (size, nothing run into, as bold, one
  line) is made upright, only names needing the room turned (unless the hoop was turned on purpose: the design's own
  name sews upright too, a towel starter hooped sideways; then every file stays turned, `onPurpose`: the single
  download was turned and the batch upright, nothing said, v27 tester), each captioned "hoop turned" and named in the hooping note
  (Bo and Grace were turned with Benjamin). Each file's caption says its loose threads (`shortJumps`). The dialog says
  problems as names are typed (`namesTyped`/`namesSaid`, `forNames().refused` shared with Make). Each file validated and judged;
  `<starter or file>_<N>_names|monograms.zip`, names deduplicated ignoring case (emma/Emma collide on macOS, FAT).
- Names batch: names that would shrink or not fit but fit full size turned get "Turn the hoop and make them" first
  (`build(name, shrink, hp)`, `canTurn`); no file leaves without its name. File names: a line break is a word gap
  (`latin`); spaces-only words fall back to the starter's name; same-size copies of the main lettering join
  (`Lily_Noah.pes`).
- A batch name under the font's least x-height is refused (names with spaces tried on two lines first); captions say
  "smaller, N %"; exact duplicates are said. "One for each name" follows Download's block rule.

### Arrange (`layout.js`)
- Layout tools make ordinary pieces: a piece's place is x, y, `rot` and `flip` (flipped left to right, then turned:
  `placer`), so a copy is the piece with those changed and nothing new is stitched. The copies take the piece's place
  in the list, in its thread: a wreath of 8 has no thread change.
- Mirrors as rot and flip: left to right = flip, rot -> -rot; top to bottom = flip, rot -> 180 - rot; both = rot + 180.
  Lettering (text, monogram, appliqué letters) is never mirrored: its copies are plain copies, and Flip top to bottom
  is off for it.
- Repeat in a circle: n copies round the hoop's centre, each turned to face out. A piece standing 5 mm or more off
  centre sets the radius and the start; one in the middle gets `ringRadius`: 2 mm clear of its neighbours, three
  quarters of the way out to the field's edge when there is room (at the edge a wreath leaves no middle for words).
  Too many for the hoop is the design's usual "too big", with its usual ways out.
- One in each corner: where the piece stands is one corner (the field's corner, 3 mm in, from the middle), the other
  three its mirrors across the centre lines. Mirrored top to bottom a figure stands on its head (right for a
  flourish, wrong for a bunny): the note offers "Stand the bottom two upright" (left-to-right mirrors only).
- A frame isn't arranged (it holds other pieces; copies would each claim them).
- Monogram orders (`MONOGRAMS`, `monogramOf`): from first, middle (or a partner's first) and last name: surname big in
  the middle (first LAST middle), a couple (first LAST partner), in order all one size (plain lettering: a monogram
  piece always sews the middle of three bigger), two initials. Each choice shows the letters as they will sew.
- Guards: said_flow (8 in a circle are 8 pieces in one thread, said with Undo; corners mirrored and inside the hoop;
  no top-to-bottom flip for lettering), ui_sweep `design-arrange`, batch files `st_lay_*`.

## Bookmark (a starter since 2026-10-31)
- Was its own panel and engine (`bookmark.js`, `#panel-bookmark`, `bookmarks_N.zip`); now the first "Start from" card,
  pieces like every other starter: `SHAPES.bookmark` (the narrow end's corners cut 0.18 of the width, filleted 3 mm:
  the top end when tall, the left end when it lies across) 165 x 50 with `border: "ith"`, `hang: false`,
  `eyelet: true`, and `text "~Ashley~"` Sacramento 26 mm, straight, `x: 8`, all one thread. The starter has
  `turn: true` (`pickStarter` turns the hoop; a square hoop ignores it): it lies across so the name reads straight
  (it stood on end at rot 90 at first, hard to read, and Turn hoop didn't turn the words). Font, colour, moving,
  fabric, names batch, Sew along etc. are the Design tab's.
- `eyelet` (ITH frames only, `hasEye`): a 4.2 mm ring of 2.2 mm satin (run, zigzag, satin) 13 mm in from the narrow
  end (`eyeAt`: the left end of a frame wider than tall, else the top), sewn in the `last` stage before the border;
  quilting keeps clear of it. `frontPanel`/`frontAcross` start past it, and the Have ready / after texts add the
  ring's Fray Check and the ribbon. Every ITH project's after text Fray Checks the cut edge (Ashley's bookmarks,
  2026-11-05: fabric whiskers stuck out past the satin all round). The Luggage tag starter uses it too (tall, hole at the top).
- `fittedSizes`: lettering in a frame lying across with a ribbon hole fits right of the hole less 4 mm and the border
  side less 7.8 mm (the old box), and lettering turned a quarter fits a tall frame's front lengthwise the same way;
  long names shrink.
- Batches build the bookmark in the turned field, then `turnForMachine` (studio_batch `opts.turn`, pe900 `bm_*`,
  engine fuzz `turned: true`).
- Background (View > Background, `state.bg`, saved as `bg`, default White, `CLOTHS` in render.js): `draw(..., { field })`
  fills the whole view, round the hoop too, on every tab; every fabric piece (appliqué, in-the-hoop fronts, the pouch)
  is drawn in it with no shadow (`previewLook` gives no fabric), so the satin edge shows the shape. Card thumbnails
  have no background (the card is it). Until 2026-10-31 each view picked its own (linen stage, pink gingham patches),
  which read as backgrounds.
- Several of one in-the-hoop project (`gang` in pieces.js; "Make another in the hoop" on an ITH or zip frame,
  `twoUp` in ui.js): frames alike (border, shape, thread, eyelet, quilt) that don't overlap sew each stage together, so
  two bookmarks are still 3 steps / 2 pauses (sewn one after the other: 6). The copy goes beside the first across its
  short side; the hoop is turned if that's what fits, else it's undone and said. studio_batch: two_bookmarks_5x7,
  two_tags_5x7, two_keyfobs_4x4.
- Old `#bookmark` links (README, the skill, bookmarks people saved) open the starter with the old panel's saved
  `nw:bm.*` name/font/colour/swashes (`oldBookmark` in app.js), then those keys are dropped.
- Changed from the old engine: the name joins the tack-down block (3 blocks / 2 pauses, was 5 / 4), the satin width
  is the lettering rule's (was a fixed 1.8 mm), the backing is the ITH's (taped under, trimmed after), print letters
  use the Design tab's skeleton work. pe900 batch keeps the `bm_*` file names.
