# Needleworks roadmap

Written 2026-11-10 from an audit of release v12 (f79107c): the code, the last release's 556-file batch, the
competitors' public documentation, and fourteen rounds of tester reports. Goal: the best home-embroidery software
there is, judged by what comes off a real machine and by what a newcomer can do without help.

## Progress
Tick a step in the same commit that finishes it. A round in progress lives on its own branch on origin
(`git branch -r`); a finished round is a merge commit on `main` with a tag `vN` (N = the cache number), so a round
is undone with `git revert -m 1 <merge>` and a cache bump.

Phase 1, the base (no visible change, byte-identical batches):
- [x] **F0 Ground**
  - [x] local folder fast-forwarded, `v12` tagged
  - [x] this roadmap
  - [x] scoreboard in `tests/check.sh` (`flow_lint.mjs --score`), baseline committed (`tests/fixtures/quality.json`)
  - [x] AGENTS.md cut to rules and a map (828 -> 130 lines); topic references in `docs/` (nothing dropped)
  - [x] stale test page and fixtures out. Each overlapping test is folded in by the round that works in its
    area, where it can be proven against the check it joins (perf into monkey and matrix into files_flow: F2;
    picture_history into picture_corpus: S4; starters into studio_batch: U1); dead code in shipped files goes
    with F1, which edits those files anyway (so F0 ships no code and needs no cache bump)
- [x] **F1 Recipes and context** ( batches byte-identical to v12 after each step, 439 of 439)
  - [x] `js/core/recipes.js`: limits, move costs, thread-weight factors; design, geom, quality, doctor, render,
    pieces read them
  - [x] sew context: `sewAs(fabric, thread)` set by the editor and by `compose`; fits and collisions outside a
    build are measured on the stitches sewn
  - [x] a failed check is not a pass (`verdictOf`); a dead doctor worker frees its piece; unused helpers out
  - [x] `js/core/density.js`: one every-offset count for the checker's `peak` (same answers on 450 files, 4.5x
    faster) and the Thickness view (was offset 0 only)
  - [x] lettering satins by fabric, satin border recipes and fill rows in `recipes.js` (439 of 439 identical).
    Still inline, to move as S1-S3 rework their builders: satin width rule, towel lattice, underlay shapes
  - [x] `js/core/colour.js` (one CIELAB, one luminance: same numbers) and `geom.js` `within()` for the three
    point-in-polygon copies
  - [x] second part released as v14 (439 batch files and 117 picture-corpus files identical to v12; monkey 960
    steps 0 problems; ui_sweep's Picture state was "never ready" twice in the full run and passed alone twice:
    watch it)
  - Moved on, with the reason: `relieve` and the doctor's `slide`/`crowd` onto `density.js` goes with S2 (their
    block rule differs from the checker's, so aligning it changes bytes); the marching-squares and scanline-fill
    copies go with S3 (it rewrites fills; merging them now risks vertex order); bounding-box copies with F2
- [x] **F2 Structure** (released v15-v24; batches byte-identical to v12 throughout)
  - [x] `js/core/fill.js`: the fill engine out of digitize.js (439 of 439 identical)
  - [x] pieces.js, first seams: `shapes.js`, `fabrics.js`, `files.js` (439 of 439 identical). Lettering, stages,
    fit and compose share the sew context and five caches: lift those into one module first, then split
  - [x] `compose.js`: the top layer (compose, quilting and carving stages, gang, two hoopings, step tidying) out
    of pieces.js (now 1,899 lines); the sew context has `sewing()`/`sewWith()` instead of other code setting it
  - [x] `lettering.js`: drawing a word to strokes, counters, arches, column shapes and `stitchLetters` out of
    pieces.js (now 1,313 lines, from 2,553); the thread weight is passed to `stitchLetters`, the drawing state is
    read and set through `drawings()`/`inkOnly()`
  - Tooling lesson: moving code between modules is checked by an undefined-name pass (TypeScript's checker over a
    copy, kept in the session scratchpad). It ran vacuously through v15-v18 (one line of typed.js it can't parse made
    it skip the pass without saying so); the batches and browser checks carried those releases, and the repaired
    pass confirms them clean. It caught nothing on the first palette.js attempt, which `check.sh` did catch
    (pictures changed). Decide in F3 whether it joins `check.sh` (it needs TypeScript fetched: a dev-only tool)
  - [x] speed on a busy design (`tests/perf.mjs`, 15 pieces + appliqué letters: 6-9 of 23 actions over 500 ms,
    worst 745-830 ms, run to run). Measured, not guessed:
    - a per-piece memo for collision measuring changed nothing (clouds and `near` are ~57 ms of a towel change):
      reverted. The audit's O(n²) reading was right about the shape of the code, wrong about the cost
    - `relieve` was ~560 ms of a towel change's work; it now sums each window's hits instead of picking its
      points out and keys its cells by number (the same points dropped as v14's on 879 runs at limits 24, 16 and
      10; 4.6x faster). Towel change 745 -> 509 ms
    - what is left of a thread or fabric change's freeze (~550 ms) is fills made on the page: `fillPolygon`,
      `distanceTransform` and `tatami` are ~500 ms of a thread change on this design (motif and appliqué fills
      re-made because the weight is in their cache key, though 60 wt doesn't change a fill). Next: fills through
      the worker as carved patches already go (`fillLater`), and the weight out of a fill's key where it changes
      nothing
    - plain fills kept by shape and settings (`filled`): 60 wt change 554 -> 278 ms, worst freeze 687 -> 562,
      5 of 23 over 500 ms. Left: 30 wt and knit (fills that really differ: through the worker), towel and typing
      on the 17-piece design (lettering re-stitched: ~520-550 ms)
    - a shape drawn and measured for filling is kept (`shaped` in fill.js: the mask, its parts, the distance
      transform don't depend on row spacing): 107 fills identical to v23's; 30 wt 541 -> 440 ms, knit 531 -> 441.
      `tests/perf.mjs`: 0 of 23 over 500 ms, worst 455 ms (the margin is thin: runs vary by ~10 %)
  - [x] the speed guard is routine: `check.sh` runs `tests/perf.mjs` (budget 600 ms) whenever core or studio code
    changes. Kept as its own script rather than folded into monkey: it times named everyday actions by the longest
    freeze, which monkey's random steps and 1000 ms budget don't
  - [x] released so far as v15 (439 batch and 117 corpus files identical to v12; monkey 960 steps 0 problems;
    ui_sweep's one failure is the Picture-tab intermittent, which v12 has too: `docs/decisions.md`)
  - [x] that intermittent found and fixed: a picture with nothing to stitch was kept and reopened at the next
    visit with its error (`docs/pictures.md`); ui_sweep `picture-after-blank` fails without the fix
  - [x] released as v16 with the fill cache (check.sh passed: 439 files unchanged, ui_sweep 340/0, monkey 960
    steps 0 problems)
  - [x] `core/palette.js`: colour learning, labelling and ink out of digitize.js (now 1,105 lines, from 2,081:
    the three picture styles and sizing)
  - [x] ui.js, first parts out: `starters.js` (the Start from designs, one id counter) and `names.js` (One for
    each name), the latter through `S`, the editor's state-and-helpers object (getters over the closure's state):
    the way every further part of ui.js moves out, one at a time, each proven by the name check + monkey + sweep
  - [x] ui.js: `recent.js` (Recent designs) and `placing.js` (where a piece goes) out through `S`, cut by a tool
    that reads the name check's report (state and helpers become `S.x`, read when used: a helper defined further
    down the editor isn't there yet at start-up)
  - [x] ui.js: `threadsaid.js` (how the editor names threads) and `toobig.js` (too big for the hoop and the ways
    out) through `S`; ui.js is 2,135 lines, from 2,911
  - Lessons from these cuts, now guarded: `sw.test` (CI) checks every import resolves to a file of the app that
    exports the name (a mangled path stopped the page loading and nothing in Node saw it); the name check must
    list TypeScript's separate codes for shorthand properties, missing modules and `$`; a part's rewrite touches
    code only (never comments, strings or property names); after every cut the app is started in a clean browser
    before the long checks
  - [x] ui.js: `fixes.js` (one-tap fixes), `stepsui.js` (the steps panel), `offpage.js` (quilting, fills and file
    re-stitching in workers); the parts are all made in one place under `S`; ui.js is 1,747 lines
  - [x] ui.js: `problems.js` (the problems list) and `editor.js` (the piece editor panel); ui.js is 1,430 lines,
    half what it was: what's left is the editor's state, the piece list, `make()`, new designs and the event handlers
  - [x] app.js by its sections: `state.js` (shared state, storage, hoop helpers), `focus.js`, `onitem.js`,
    `along.js` (Sew along, the names dialog), `threadui.js`, `picture.js` (the Picture tab), `opened.js` (the Open
    tab); app.js is 814 lines, from 2,276 (preview, toasts, download, tabs, start-up). A section may call into
    app.js when things happen but never while it loads (app.js loads after its sections)
  - Left for a housekeeping pass (no user-visible gain, so behind F3 and the stitch rounds): one worker job queue
    (four hand-written ones today, one with a time limit); matrix into files_flow; bounding-box copies
- [x] **F3 Atomic releases** (v25): sw.js lists every file with its SHA-256 and installs a release only when every
  file fetched is its copy; the page's files come from that one set; a new release waits for the page's Reload or for
  every tab to close; the cache's name carries a fingerprint of the set. `tests/upgrade.sh` proves it in a browser
  (whole on A; B waits and is offered; Reload gives all B; a half-published C is refused); `sw.test` (CI) keeps the
  hashes current. The name check stays a scratchpad tool (it needs TypeScript fetched): `sw.test`'s import check is
  the in-repo guard for moved code

Phase 2, stitch quality (measured against the scoreboard, VM-checked):
- [ ] **S1 One sequencer** (entry, exit, hidden travel, trim or loose, locks in cover: shared by every builder)
  - [x] v26: script pieces chained by the moves as sewn (after the arch, wave or bridge bend) and sewn in one go
    where their columns touch (`recipes.js` `LINK`). Arcs and ovals: wasted moves 52 -> 13, trims 513 -> 444;
    bookmark names 4 -> 1. The 13 left are 1.5-2.3 mm gaps between columns: a stitch there would show.
  - [x] v27: print letters start partway along a plain stroke and, where reading order leaves loose threads,
    every second or third letter is sewn first (small print loose 27 -> 0, wasted 33 -> 5; caption starters
    12 -> 2 and 13 -> 3; travel about doubles); tie-ins 0.7 mm, or 0.5 where the next point is 0.7 on (zero ties
    73 -> 0 in every group); appliqués in one thread sewn stage by stage together (two take 3 stops, not 6)
  - [x] v28: the planner for frames, appliqué and quilting was measured and not built (9 avoidable moves in 167
    files, 6 of them lettering on frames); Zoë's dots, the T of "Tabitha" sewn through
  - [ ] left: `st_lines_JosefinSans` (wasted 1 -> 2 in v27, not traced); Zoë's ë dots (a 2.7 mm loose
    thread). flow_lint's "loop" on print letters sewn as read is the cost of the no-connector rule
- [x] **S2 Density at the source** (v28): runs give way as they are built (`recipes.js` `EASE`), fans settled
  before sewing. Files at the 24 limit: frames and fills 61 -> 0, arcs and ovals 23 -> 0, bookmarks 19 -> 4,
  towel 16 -> 6, starters 9 -> 0; `relieve` removed about 1,640 points on v27, now 9 outside pictures.
  - [ ] towel names still reach 24 in 6 files; pictures are built without easing (8 of 28 at 24); the doctor's
    `crowd` counter not on `density.js`; a line of digits only is sized a third smaller ("2026")
- [ ] **S3 Vector fills** (exact edges, edge-run underlay, pull and density by fabric, contour fill)
  - [x] v26: rows worked out from the outline (row-end error 0.06 mean / 0.19 worst -> 0), edge-run underlay,
    pull by fabric (`recipes.js` `FILLS`), sections sewn in row order. 41 files: trims 182 -> 140, loose 22 -> 13,
    wasted 36 -> 17; 12 test fills 420 -> 237 ms
  - [x] v28: fill in rings (patch pattern "Rings", Rows/Rings on filled motifs); patch fills travel under the
    satin edge (heart patch 2 trims -> 1, scallop 4 -> 1)
  - [ ] ring fill is slow (190-280 ms for a 100 mm patch) and takes 5 trims carved round a monogram; batch files
    for motifs on knit and towel and for 30/60 wt fills
- [ ] **S4 Pictures** (shapes made sewable first; no tiny stitches, zero ties or exposed locks)
  - [x] v26, Filled: flecks take the colour round them, travel along the shape's own edge, no tiny row links,
    locks under their own rows. 12 samples: trims 1464 -> 1162, loose 153 -> 67, tiny 336 -> 0, zero ties
    164 -> 5, exposed locks 173 -> 90; corpus trims 791 -> 538, loose 73 -> 9. Digitizing about 25 % slower
  - [x] v27: Small details, "Leave out specks" (default) or "Keep all" (v26's bytes); digitizing back to v25's
    time. 12 samples: trims 1162 -> 1119, loose 67 -> 51, wasted 39 -> 31. A third, bolder level was built
    four ways and dropped (`docs/pictures.md`): what is left of a picture's trims is whole sprigs, stems and
    letters
  - [ ] exposed locks (90: mostly dots that are their own lock; flow_lint should not count a lock-only run);
    thread matching (9 of 113 hued colours on a grey thread: measured, left); Line drawing's ring moves;
    picture_history folded into picture_corpus

Phase 3, friction and features:
- [ ] **U1** open tester findings, then a fresh three-tester round on the live site
  - [x] v26: the findings that are UI only (see `docs/app-ui.md`)
  - [x] v27: Picture and Open code loads after the first design is up; the page's own fonts after the first
    preview, over stand-in faces of the same width (slow phone: first paint 4.0 -> 1.8 s, first preview
    17.7 -> 14.1 s; desktop first visit 0.8 -> 0.45 s). The rest is bytes: scripts 376 KB, Great Vibes 158 KB
  - [ ] tester round on live v27 (2026-11-11, cut short: newcomer 7, hobbyist 7 on 4 of 8 tasks, expert 6 on
    2.5 of 8). No P0 or P1. Open, by the path each belongs to:
    - stitches: the ë of "Zoë" in Great Vibes at 19 mm has its dots joined by a sewn line (reads "Zoē": the
      v26 join rule reaches a letter's dots); "Tabitha" in Allura 20 mm on an arc has 4 trims in one word (T bar
      to stem 0.63 mm apart, each part ending back at its own start); a 27 mm trim inside one connected patch
      fill; satin border fanning onto one pivot at a heart's tip and cleft (23-24 hits); a lock's sideways hit
      showing beside a one-thread stroke; wide script columns (2.2 mm) with a centre run only
    - truth of what is said: at 6 mm print the Stroke button reads "Automatic: thin line" while the file is
      satin; "Keep all" still says flecks are sewn in the colour round them; a caution shown with a green tick;
      a thread label changing on resize of an opened file (Lavender -> Light Lilac); an opened design's appliqué
      stop names lost once words are added
    - names batch: files ignore the turned hoop (single download turned, batch not, nothing said)
    - editor: dragging while zoomed moves a piece instead of panning; the size slider 4 px wide beside a long
      label on an opened design; toasts covering Download for 15 s; starters keeping the sample's file name; the
      download name flipping between pieces; stats chips cut off on a phone; Fit to hoop enlarging without
      asking; choosing the machine enables Undo and says nothing
    - pictures: Small details shows no before/after and its note sits far below; a busy picture (17,000
      stitches, 180 trims) gets no warning; "Leave out specks" gave more loose threads than "Keep all" on one
    - asked for by the expert: lettering on a circle by radius; per-piece density, underlay and pull; entry and
      exit points; trim-or-connect for small text
    Reports and screenshots: the session scratchpad's `ut27/` (not kept in the repo)
  - [ ] first load further only with the owner's say (scripts shipped without comments needs
    a release step; a lighter first starter font changes the starters)
- [x] **N1** layout tools (v28, Arrange box: repeat in a circle, one in each corner, flip, monogram orders).
  The ring and corners use the hoop's centre, not a frame's
- [x] **N2** borders and quilting (v28: Decorative line with scallops, diamonds and blanket stitch; blanket-stitch
  appliqué edge on frames; crosshatch and stripes). Not built: shaded fill; blanket edge on appliqué letters and motifs
- [x] **N3** use your own font file (v28: .ttf and .otf, kept in the browser; a saved design opened elsewhere
  falls back to the default font)
- [ ] **N4** more Brother machines and hoops
  - [x] v27: "My machine" choice; Brother SE2000 (5x7, 4x4) added
  - [x] v28: writer change W1 (160 x 260 page for designs no 5x7 holds) and the Brother NQ1700E (6x10); unproven
    on a 6x10 machine
  - [ ] 6x10 machines wait for writer change W1 (`docs/writer-changes.md`; started on branch `w1-page`: no page
    bytes established yet, the trial PE-DESIGN cannot save, so Brother's 379 samples are the only source: run
    that branch's `tests/vm/measure.ps1`); 4x4-only models (SE700, PE545)
    wait for a published fact: whether they cut jump stitches

## Cycle 2: as good as the best commercial PES (owner, 2026-11-11)
The work runs as a loop: fresh review, plan, improve, release. The bar: every file matches or beats the best
professionally digitized PES measure by measure, and stays compatible with the machine chosen. The fresh review
of v28 (agents that had not seen the work) found:
- The "Brother-made" reference files on this machine are not Brother's: three commercial designs from other
  software, three hobby-tool files, three poor auto-digitized ones, one conversion. Earlier "better than Brother's
  samples" lines were measured on those. Brother's 379 real samples are inside the PE-DESIGN VM only.
- Against the three commercial designs: our fills lay 2.8 mm of thread per mm² where they lay 6.0 (rows 0.35 mm
  apart against 0.18-0.20, lattice 2.5 mm against 1.1-1.3); pictures and fine lines have 47 % of stitches under
  0.8 mm against 5-7 %; pictures trim 12-28 times per 1,000 stitches against 0.4-1.8 and pile colour on colour
  (to 32 hits/mm²); the inside of satin curves crowds (same-side gap p5 0.21 against 0.28); every fill is at 45°;
  36 % of wide print columns have no underlay. At or better than them: trims on lettering, borders, patches and
  quilting; loose threads; tied ends; colour order; satin borders.
- Code: a second open tab is not reloaded at a release (mixed files); a failed fill job can leave Download
  waiting; ring fills 3-5 times slower than rows and unguarded; check.sh skipped batches for borders.js/ownfont.js;
  the scoreboard never fails; 8 own fonts with no way to remove one.
- An agent can make a file only by reaching into internals: no entry that returns bytes, verdict, steps and
  warnings as data; lettering needs a browser; the verdict is prose; a design as data is undocumented and bad
  input is silently changed; the skill is stale.

- [ ] **P0 References and the parity scoreboard**: Brother's samples measured (out of the VM, untracked),
  more commercial designs gathered (untracked), eight numbers per kind beside the professional range, printed by
  check.sh and failing when a row gets worse; batch pruned (504 files: only cases that guard a distinct path)
- [x] **Tester feedback, pictures (v29)**: the white inside a design sewn and said; textured pictures smoothed;
  a verdict under the picture; any thread for a colour; Paste a picture; a hole measure in the picture corpus
- [ ] **P1 Fills and pictures**: bare patches inside fills (the corpus's new `holes`: 20 on the corpus, 48 on
  etsy_3; dropped pieces to the neighbouring colour, thin bands absorbed, overlap both ways), a fill's rows chosen
  off its edges' direction (a 3 mm diamond's edge 15° off the rows sews ragged); fill cover, lattice and angle; ring fill off the page's blocking path; even run
  lengths; an all-colour density limit; cross-stitch in rows; picture trims
- [ ] **P2 Satin and lettering**: short stitches inside curves, underlay under print columns, towel counters,
  the digits-only size bug, crosshatch travel, locks on opened files
- [x] **W5 Other formats out** (owner approved 2026-11-13): DST, EXP, VP3 from the clean-room spec, through
  the gate, a "File for" choice by Download; JEF waits for Janome's measured thread order
- [ ] **A1 Agent-drivable**: one job format with validation, `make(job)` returning bytes, verdict, steps and
  problems as data (the UI calls it too), page API and link form, a command-line tool (macOS), docs and the skill;
  with it the two-tab reload, the stuck fill job, removing an own font
Unproven until sewn, in the order to sew: fill cover, small print order, script joins, ring fills, the 6x10 page.

Ask the owner first: photo stitch, free-standing lace, 3D puff. (Other formats out: W5, JEF still to measure.)
Not planned: wireless send, FCM cut files, BX fonts, an AI helper.

## Cycle 3: ZigZag parity
What ZigZag (an open-source embroidery editor) lets a maker set, made here from its clean-room spec
(`docs/zigzag-spec.md`), wherever it doesn't break a rule of `AGENTS.md` (where it does, ours wins). Each round
leaves a design with no setting byte-identical.
- [x] **Z1a Per-piece settings record and fill settings** (spec 1.1, 1.2): `stitches` on a piece, saved and copied
  with it, clamped (`recipes.js` `FILL_SET`); a fill's angle on a shared row grid, rows apart, stitch length, reach
  past the edge, what goes underneath; the editor's Stitches section
  - [x] record, fills and the editor (`settings.js`); batches byte-identical with no setting; `st_fillset_*` cases
  - [x] proven: check.sh (534 of 534 files pass the checker; sw.test stale hashes only, written at the release),
    the editor at desktop and phone width
  - [x] merged and released (v30)
  - left: a filled motif's edge run never sews (laid 0.4 mm inside, rows inset 0.6: every point dropped;
    `docs/decisions.md`); with "Edge only" underneath, the travel to the first row shows between open rows
- [ ] **Z1b Satin settings per piece** (spec 1.3)
- [ ] **Z1c Start and end points, trim or pause after a piece** (spec 1.5, 1.6); with it, the underlay's travel
  to the first row ending where it hides
- [ ] **Z2 SVG import** (spec 2)
- [ ] **Z3 Stitch types we lack or half have** (spec 3)
- [ ] **Z4 Test swatches** (spec 4)
- [x] **W5 Other formats out**: DST, EXP, VP3 released (v30), see Cycle 2's line
  - [ ] JEF: Janome's thread order measured on Janome's own software (`docs/formats-out-spec.md` §7)
  - [ ] Open tab: a DST with two colour changes in a row (an empty block) fails the doctor's fixes ("fewer thread
    colours than colour changes"); site files never have one, outside files may

## Cycle 4: picture to stitches, the best there is (owner, 2026-11-13)
Owner: makers will bring their own art, often made with AI, so turning a picture into stitches is the product:
"world class at turning picture to stitches, work with all machines, push the state of the art following all
guidelines and perhaps even come up with novel ways". Cycle 3's remaining rounds wait behind this one (Z2 SVG import
joins PX1's shape path). Every round keeps the hard rules of `AGENTS.md`; nothing is proven until sewn, so each
stitch round ends with a small sew-out pack.
- [x] **PX-R State of the art**: papers, commercial auto-digitizers' published behaviour, where they fail;
  `docs/research/picture-sota.md` (ideas and numbers only, credited; no one's code)
- [x] **PX0 Looks like the picture**: a realistic thread render of a file and a score against the source picture,
  beside the stitch scoreboard in the picture corpus; a corpus of AI-style art (flat illustration, logo, cartoon,
  mascot, photo) drawn or made here. Done: `tests/look.js` (render + score), 26 pictures in
  `tests/browser/art.js`, the "looks like the picture" table in `picture_corpus.sh`, baseline
  `tests/fixtures/look.json` (the numbers PX1-PX4 must beat; reading them: `docs/testing.md`)
- [x] **PX1 Picture to clean shapes**: fewer, smoother regions; slivers merged; curves fitted; small details kept
  on purpose (`regions.js`: blend bands, flecks, smoothed edges; layers under later colours; the Thread colours count
  holds with the closed-in white; numbers in `docs/pictures.md`)
  - left: art_line_mandala's look -5; a closed-in panel inside a sewn frame left as fabric at a full count; the
    dog's shading rim, brown ears sewn near-black and soft drop shadow are thread matching and soft-shade rules
    (palette), not shapes
- [ ] **PX2 Stitch types like a human digitizer** (after PX1): thin strokes as satin columns, outlines as run or
  satin, areas as fill, dots as satin; back to front, hidden fill removed, pull by fabric
- [x] **PX3 Fill direction that follows the form**: each region's rows at its own angle, or curving with it
  (`docs/stitch-model.md` "Direction that follows the form")
  - [x] each part's angle scored over a sweep, the principal axis and the edges' direction (fewer row ends, no
    ragged edge, never more sections than today's angle); Follow the shape for patches and filled motifs; pictures
    with `direction: "auto"` (a one-line hook in digitize.js; the Picture panel doesn't offer it yet)
  - [x] curved rows: level lines of a fitted stripe field, never closer than the spacing, where they beat straight
  - left: the Picture panel's choice (picture.js), and whether pictures default to it; curved rows with
    singularities (a disc's, a star's middle) and rows that end inside a narrowing band; sewn proof
- [x] **PX4 Shading** (after PX1): two-colour blends by density, colour mixing for photos and gradients. Done:
  `core/shade.js` (soft borders gated to real shading, the two threads that meet, a line screen on one grid and
  angle), the Soft shading choice; patents and numbers in `docs/pictures.md`
  - left: the gain is small (gradient +0.5, pet photo +0.2, watercolour -0.2): the palette cuts a gradient into a
    few threads and only their borders blend; a gradient into the fabric (soft shadows) is not blended; no sew-out
- [x] **PX5 Every machine**: machines and hoops of Janome, Bernina, Husqvarna/Pfaff, Tajima-format machines from
  the makers' published specs (machines.js, cited); the machine sets the file, the checks use its field and limits.
  Left: JEF once Janome's thread order is measured (a Janome trial in the VM), Singer and the no-jump-trim machines
  (a loose-thread count for machines that cut nothing between parts), fields past 409.6 mm (writer-changes W1c)
- [x] **PX6 Art that stitches well**: an "ask your AI for…" guide and a check of the uploaded picture saying what
  will and won't sew well, and why (`artcheck.js`, `artwords.js`, `recipes.js` `ART`; docs/pictures.md)

## Verdict
Strong, and kept: the machine layer (locked writer, PEC box, palette, locks, the 5 mm loose-thread rule, 24 hits
per mm² at every offset), the 4 mm satin border and staggered seams (both from real sew-outs), the exit gate, the
plain-words guidance, and stitch flow on frames, patches, in-the-hoop projects and script names (near zero wasted
moves; better than the Brother-made samples measured the same way).

Weak at the base:

| # | Problem | Evidence | Consequence |
|---|---|---|---|
| B1 | Stitch numbers are constants scattered through six files; fabric and thread weight reach the builders through module state (`wt`) that only `compose` sets | pieces.js `wt`, `sewnWith`; 0.3 / 24 / 5 mm / 1.5 re-typed in design, doctor, digitize, pieces, render | fit and collision checks outside `compose` measure 40 wt cotton stitches that are never sewn; a fabric can't change fills or pictures |
| B2 | Every builder plans its own start, end, travel, underlay and locks | lettering `order`, frames `enter`/`rings`, `applRoutes`, `routeFill`, quilting `chain`, doctor `restitch` | each flow fix is made five times; the open classes (rings on arcs, small print, picture moves) are all "the builder didn't know where the needle goes next" |
| B3 | Density is built over the limit and thinned afterwards; five copies of the hit counter disagree on what a block is | 161 of 439 files peak exactly at 24; quality `peak`, design `relieve`, doctor `slide`/`heat`/`crowd` | "spread, not piled" is met by deleting stitches; thick script crossings on the machine |
| B4 | Fills are raster: polygons drawn at 8 px/mm, rows sampled from the mask, one angle, one underlay | digitize.js `fillPolygon`/`tatami` | 0.125 mm edge steps on motifs and patches, slow carving, no contour or curved fill |
| B5 | Four modules of 2,000-2,900 lines; ui.js is one 2,700-line closure; geometry and colour maths copied 3-20 times | code audit below | risky edits; measuring is O(n²) per keystroke (1-2 s on 15+ pieces) |
| B6 | Errors swallowed | `verdictOf` returns "no problems" when the checker throws; a crashed doctor worker leaves Download waiting for ever | a hole in the one place that says "Checked" |
| B7 | Releases aren't atomic: network-first files behind a 10-minute Pages cache | 2026-10-31: new ui.js with old pieces.js | a release can look broken for 10 minutes |
| B8 | AGENTS.md is 830 lines, loaded into every session, round logs creeping back | "Round 12/13/14" blocks | rules get buried |
| B9 | "Better" is argued by hand each round | numbers rebuilt ad hoc | no standing scoreboard; overlapping test scripts |
| B10 | No sew-out since 2026-11-06; PE-DESIGN reads only the block the machine doesn't sew | tester history | every stitch change since is unproven on a machine |

## (a) Stitch quality, measured on release v12

`tests/flow_lint.mjs` and `tests/pe900_check.py` over the release's batch. "Wasted" = flow_lint's `avoid` (a move
that could have been a stitch, a hidden run, a better ring entry or a run started at its near end).

| Group | Files | Trims/file | Loose/file | Wasted | Other |
|---|---|---|---|---|---|
| Pictures, Filled (samples) | 12 | 122 | 12.8 | 48 | 336 tiny stitches, 173 lock hits outside cover, 164 zero ties; etsy_8: 374-466 trims, 50 loose |
| Pictures, Filled (corpus) | 54 | 14.5 | 1.4 | 22 | 12 hidden-travel misses, 31 zero ties |
| Pictures, Line | 44 | 9-12 | 0.1 | 39 | every one a ring left far from the next part |
| Pictures, Cross-stitch | 35 | 5-40 | 0 | 0 | |
| Small print 5-8 mm (`st_small*`) | 4 | 19-34 | 5.5-8 | 33 | 107 loose per 10k stitches: worst per stitch |
| Lettering on arcs and ovals | 49 | 8-9 | 0.1 | 49 | every one a ring |
| Caption starters (birth, bookplate, pet) | 5 | 19-25 | 3-4 | 24 | |
| Towel lettering | 19 | 1.5 | 0 | 0 | 17 of 19 at the 24 cap, about 40 windows at 22+ each |
| Frames, patches, motifs, in-the-hoop | 121 | 1.3-3.5 | 0 | 10 | clean; their density peaks belong to the lettering inside |
| Bookmark names | 97 | 6.6 | 0.1 | 4 | 19 at the cap (script crossings) |
| Brother-made reference | 11 | 19.5 | 5.1 | 1-3 typical | |

Also: satin gaps 0.31-0.42 mm (0.49 at 30 wt, by design), longest stitch 5.8 mm, no same-hole stitches, tiny
stitches only in Filled pictures.

Reading:
1. Filled pictures are the weakest output. Only 48 of about 1,460 trims are wasted moves: the trims are separate
   small shapes, so the lever is fewer and better shapes ("make it stitchable"), then locks in cover, no zero ties
   and no tiny stitches. More routing was tried before and is not the answer.
2. Files at the cap are script crossings and the towel lattice, not borders or fills. A lower cap was tried
   (18: 15 of 3,300 stitches dropped) and changed nothing, so the columns must be built not to pile.
3. Small print leaves the most loose thread per stitch; rings on arcs and in line drawings are entered at the
   wrong point.
4. Fills use one recipe: straight tatami at one angle, one crossing underlay at 2.5 mm with no edge run, pull
   0.15 mm a side on every fabric but knit. Published practice (Wilcom's help): pull 0.20 mm on cotton, 0.35 on
   T-shirt knit, 0.40 on fleece; tatami 0.38 mm rows, 4 mm stitches, quarter offsets; edge run plus a crossing
   layer under large shapes; centre run under 2-3 mm columns, zigzag under wide ones; satin split from 7 mm.

## (b) Missing features, value to a home user against effort

| # | Feature | Who has it | Value | Effort | Note |
|---|---|---|---|---|---|
| 1 | Mirror, repeat round a circle, wreath, corner set | Embrilliance, PE-DESIGN, Bernina | High | S-M | layout only; the pieces exist |
| 2 | Use your own font file | Hatch, PE-DESIGN, Embird | High | M | the lettering engine sews any loaded font; needs a glyph map and a "sews badly" check |
| 3 | Contour (spiral) fill, edge-run underlay | Ink/Stitch, StitchArtist, PE-DESIGN | High (look) | M | round S3 |
| 4 | "Make it stitchable" for pictures | nobody does it well | High | M | round S4; the top complaint about every auto-digitizer |
| 5 | Blanket-stitch appliqué edge; triple-run and motif-run borders | Ink/Stitch, StitchArtist | Medium | S | new border kinds |
| 6 | Crosshatch and stripe quilting | PE-DESIGN | Medium | S | reuses `freeMask` |
| 7 | Shaded (gradient) fill | Hatch, StitchArtist, Ink/Stitch | Medium | S-M | `blend` is half of it |
| 8 | Monogram layouts that show which initial goes where | Embrilliance, Artspira | Medium | M | asked three times by testers |
| 9 | More Brother machines and hoops | all | Medium | S | data in `machines.js` |
| 10 | Stitch-level editing in Open | Hatch, Embrilliance | Low-medium | M-L | experts only |
| 11 | Other formats out (DST, JEF, EXP, VP3) | Embrilliance, Hatch | Medium (sharing) | M | DST, EXP, VP3 done (W5); JEF waits for the measured Janome order |
| 12 | Photo stitch | Hatch, PE-DESIGN, mySewnet | Medium | L | ask first; a look shown before any engine |
| 13 | Free-standing lace, 3D puff | StitchArtist | Low-medium | L | later; unprovable without sew-outs |

Where we already lead: free, no account, any device, offline; instant name batches; plain-words steps and Sew
along; in-the-hoop projects made to size; cut files; "threads I own". The paid packages' users complain of price
tiers, Windows-only installs, subscriptions, and auto-digitizing that needs clean-up.

## (c) UX friction still open
From the round 13 reruns (scores 8/8/7, 8/8/7, 8/8/8); round 14's fixes have not been seen by a tester.

Classes that keep scores at 7-8: a one-tap fix that doesn't land; asked size against sewn size; one fact worded
differently on two surfaces; toast timing; discoverability; picture fidelity; expert stitch nits.

| Area | Open item |
|---|---|
| First run | "Make another in the hoop" hard to find on a phone; turned-hoop note long for plain fabric |
| Lettering | words fitted to the hoop (no frame) shrink with no two-lines offer; arch split lines 13 vs 17 mm; Alex Brush b, Quicksand V/M, Josefin N/M |
| Placement | "+ Motif" on a full coaster says no room; patch starter + Lettering lands below the initials |
| Preview | ornament ribbon loop not drawn; step view shows no front fabric at step 2 |
| Pictures | pastels and pinks matched to greys; cross-stitch can't hit the asked size; "make it stitchable" |
| Guidance | appliqué has 6 pauses where 3 would do; Sew along has no how-to-hoop or needle tip |
| To the machine | nothing says the SVG/DXF cut file is not for the machine |
| Keyboard | 48-67 Tabs from the Words box to Download |
| Speed | empty preview for about 30 s on a slow first load; thread or fabric change on 15+ pieces 1-2 s |
| Trust | the random test twice saw Open saved switch the hoop (5x7 to 4x4), never reproduced |
| Asked for | bone motif (2), hoop and needle tips in Sew along (2), clearer monogram order (3) |

Unproven on a machine: everything since fa15b06 (4 mm border, staggered seams) and every stitch change of rounds
12-14; whether the PE900 cuts trims of 5 mm or less; Brother's own script fonts at crossings.

## (d) Code quality

| # | Problem | Where | Fix | Size | Stitch risk |
|---|---|---|---|---|---|
| 1 | Measuring is O(n²) per `make()`: `touchingAll` re-fits and re-clouds every pair; `fittedSizes` called about 40 times | pieces.js `touchingAll`, `near`, `cloud`; ui.js `pieceProblems` | one memo per make | M | none |
| 2 | `wt` is module state; `pacer`, `drawn`, `inking`, doctor's `G`/`COV`/`BOX` likewise | pieces.js, doctor.js | explicit context | M | byte compare; fits on 30/60 wt and towel may rightly change |
| 3 | Five hit counters with string keys; STOP is a block edge in one, not in four; `relieve` re-types 24 | quality.js, design.js, doctor.js | one module | M | byte compare |
| 4 | Swallowed errors | quality.js `verdictOf`; pieces.js `drawAhead`; ui.js `allThread`, `forNames`, `restitchFiles`; app.js fixed copy | surface them | S | none |
| 5 | Copies: point-in-polygon x3, marching squares x2, scanline fill x3, polyline-to-mask x4, bounding box about 20, signed area x4, CIELAB x3, luminance x4 (different thresholds), tiny-stitch removal x3 (rules differ), recentre over 200 mm x2, 12 hand-written caches | pieces, quilt, outline, digitize, doctor, render, sheet, gate | geom/raster/colour helpers, one `lru(n)` | S-M | byte compare |
| 6 | Module size | ui.js 2,901; pieces.js 2,553; app.js 2,271; digitize.js 2,081 | split: pieces into lettering, shapes, stages, fit, compose, clean; digitize into colour, fill, styles, plan; ui and app over one shared state | L | byte compare |
| 7 | Main-thread work: a second full compose for "one thread for everything"; the checker's full scan; carve's distance transforms; blend fills twice | ui.js `allThread`; app.js `setView`; pieces.js `carve`, `patchFill` | worker or memo | M | byte compare |
| 8 | Four worker queues, one with a time limit; quilt-worker imports all of pieces.js | app.js, ui.js | one job queue | S-M | none |
| 9 | Dead code: unreachable bookmark-engine branches in raster.js; `makeMask`, `problemsText`; about 20 needless exports; parameters never passed; `tests/browser/phone.html`, two unused fixtures | listed | delete | S | none |
| 10 | Tests that overlap | perf vs monkey budget; starters vs studio_batch; picture_history vs picture_corpus; matrix vs files_flow; surfaces vs sweep + monkey + steps_lint | fold in, retire | S | none |

Limits typed in more than one place, to come from `recipes.js`: 24 hits (quality, design, render, doctor); tiny
0.3 mm (quality, design x3, doctor x2, pieces); the 5 mm trim setting (geom, doctor, digitize, pieces); the
200 mm recentre (design, doctor); hoop slack `2 * MARGIN + 2` (digitize, pieces).

## (e) Left alone, and why
- `js/core/formats.js`, the golden files, the PEC box, palette 62-64, a trim on every jump: proven on Brother
  files and a real PE900.
- Lock shape, the 5 mm loose-thread rule, `moveCost`, 24 per mm² at every offset, the 2 mm margin.
- The 4 mm / 0.34 border with edge walk and zigzag, and staggered seams: from real sew-outs.
- Everything recorded as "Worse:" or decided against, unless a round brings new numbers.
- Thread naming (swatch, the machine's name, "≈ Brand number"); clean room; no build step.
- No art engine before a look is approved; no new test scripts.

## How every round is proven
- A worktree of `origin/main` under `.worktrees/`; baseline batches built before any change.
- `zsh tests/check.sh origin/main BASE`: CI tests, both batches, `pe900_check`, byte compare, the scoreboard for
  baseline and new, files_flow, ui_sweep quick, monkey; area checks by what changed. Every job time-limited.
- Phase 1 rounds are byte-identical (exceptions listed one by one). Phase 2 rounds: the target group better, no
  group worse, every changed group explained and looked at on before/after contact sheets.
- VM: box check on the changed files, two opened in PE-DESIGN.
- Each stitch round ends with a small test pack of the changed designs and a list of what is unproven on a
  machine.
