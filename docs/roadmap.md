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
  - [x] CLAUDE.md cut to rules and a map (828 -> 130 lines); topic references in `docs/` (nothing dropped)
  - [x] stale test page and fixtures out. Each overlapping test is folded in by the round that works in its
    area, where it can be proven against the check it joins (perf into monkey and matrix into files_flow: F2;
    picture_history into picture_corpus: S4; starters into studio_batch: U1); dead code in shipped files goes
    with F1, which edits those files anyway (so F0 ships no code and needs no cache bump)
- [ ] **F1 Recipes and context** (branch `f1-recipes`; batches byte-identical to v12 after each step, 439 of 439)
  - [x] `js/core/recipes.js`: limits, move costs, thread-weight factors; design, geom, quality, doctor, render,
    pieces read them
  - [x] sew context: `sewAs(fabric, thread)` set by the editor and by `compose`; fits and collisions outside a
    build are measured on the stitches sewn
  - [x] a failed check is not a pass (`verdictOf`); a dead doctor worker frees its piece; unused helpers out
  - [x] `js/core/density.js`: one every-offset count for the checker's `peak` (same answers on 450 files, 4.5x
    faster) and the Thickness view (was offset 0 only)
  - [ ] fabric and lettering numbers into `recipes.js` (satin widths, pull, underlay thresholds, lattice, border
    and fill recipes), still byte-identical
  - [ ] `relieve` and the doctor's `slide`/`crowd` onto `density.js` (their block rule differs from the checker's:
    a pause isn't a block edge for them, so they thin more than the checker asks; changing that changes bytes, so
    it goes with S2)
  - [ ] shared geometry and colour helpers (point-in-polygon, marching squares, scanline fill, boxes, CIELAB,
    luminance)
  - [ ] release: cache bump, tag
- [ ] **F2 Structure**: pieces.js, digitize.js, ui.js, app.js split; one worker job queue; one memo per `make()`
- [ ] **F3 Atomic releases**: one release's files per load, never a mix

Phase 2, stitch quality (measured against the scoreboard, VM-checked):
- [ ] **S1 One sequencer** (entry, exit, hidden travel, trim or loose, locks in cover: shared by every builder)
- [ ] **S2 Density at the source** (crossings, towel lattice)
- [ ] **S3 Vector fills** (exact edges, edge-run underlay, pull and density by fabric, contour fill)
- [ ] **S4 Pictures** (shapes made sewable first; no tiny stitches, zero ties or exposed locks)

Phase 3, friction and features:
- [ ] **U1** open tester findings, then a fresh three-tester round on the live site
- [ ] **N1** layout tools (mirror, circle repeat, wreath, corner set, monogram layouts)
- [ ] **N2** borders and quilting (blanket stitch, triple and motif runs, crosshatch, stripe, shaded fill)
- [ ] **N3** use your own font file
- [ ] **N4** more Brother machines and hoops

Ask the owner first: other formats out (DST, JEF, EXP, VP3), photo stitch, free-standing lace, 3D puff.
Not planned: wireless send, FCM cut files, BX fonts, an AI helper.

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
| B8 | CLAUDE.md is 830 lines, loaded into every session, round logs creeping back | "Round 12/13/14" blocks | rules get buried |
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
| 11 | Other formats out (DST, JEF, EXP, VP3) | Embrilliance, Hatch | Medium (sharing) | M | ask first; new writer files, `formats.js` untouched |
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
- A worktree of `origin/main` under `.claude/worktrees/`; baseline batches built before any change.
- `zsh tests/check.sh origin/main BASE`: CI tests, both batches, `pe900_check`, byte compare, the scoreboard for
  baseline and new, files_flow, ui_sweep quick, monkey; area checks by what changed. Every job time-limited.
- Phase 1 rounds are byte-identical (exceptions listed one by one). Phase 2 rounds: the target group better, no
  group worse, every changed group explained and looked at on before/after contact sheets.
- VM: box check on the changed files, two opened in PE-DESIGN.
- Each stitch round ends with a small test pack of the changed designs and a list of what is unproven on a
  machine.
