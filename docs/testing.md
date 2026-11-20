# Testing and verification

Reference for this part of Needleworks: the rules, the reason for each (it stops someone undoing it) and the number that proved it. Hard rules are in `AGENTS.md`. Add a lesson where its topic is, never as a round log.

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
- Persona harness (a base prompt with the site address, the tools and the report format; one prompt per persona): one headless Chrome per tester via `node
  tests/cdp.mjs PORT CMD` (commands in its header). `start` disables timer throttling (a 300 ms debounce took 57 s)
  and keeps temp files beside the profile (TMPDIR, MAC_CHROMIUM_TMPDIR). With `nocache` app.js may not start: check
  `document.body.dataset.mode`, navigate again. Subagents hand reports back.
- Small lettering in pictures, by eye: `tests/browser/text_probe.html` (words drawn at 6 to 2.5 mm in three faces and
  white on a colour, sewn as the Picture tab sews them and drawn large; `?only=`, `?bg=clear|white`, `?zoom=`,
  `?coarse` without the finer copy). It saves each file to the batch server for `pe900_check.py`.
- VM check (before shipping stitch changes): UTM "PESCHECK" with the PE-DESIGN 11 trial over VNC
  (`/Volumes/4TB_SSD/vm-pescheck/tools/vnc.py`); files in on an ISO (`hdiutil makehybrid -iso -joliet`, `cat` it over
  `vm-pescheck/files.iso`); `vm-pescheck/tools/boxcheck2.ps1` (box == stitch minimum: "FITS n/n"), then open them
  in PE-DESIGN.
- Quit UTM after a VM check (`osascript -e 'quit app "UTM"'`; `utmctl stop` leaves the app open). With it open,
  files_flow hung at 0 % CPU on "a starter picked while the design is the picture" (the page never answered again;
  v36 and v37 hung the same way, 2026-11-17) and passed the moment it was quit.
- `pe900_check.py` judges a file named `*6x10*` on the 160 x 260 mm field, and every version 6 file's header page
  (100 x 100, or 160 x 260 for a design no 130 x 180 field holds).
- Brother diff (`tests/brother_diff_core.js`): Brother-made PES files are re-written with `writePES` and the PEC
  blocks compared field by field, then by the machine's holes, jumps, trims and colour changes. The 379 PE-DESIGN
  samples stay in the VM (`C:\bro`): `sh tests/vm/run.sh` (builds `tests/vm/make.mjs`'s page; verdict
  `out/vm/result.png`); Node: `node tests/brother_diff.mjs tests/external/pes`. Run after any `formats.js` change and
  before files go to a machine. Baseline: none sew differently; bytes differ only where Brother keeps stitches to
  15.7 mm (we split over 7), we trim every jump, our palette choice, Brother's page-size field on lace samples.
- `tests/external/` (gitignored): third-party samples and pictures, pyembroidery oracles (`oracle/`), files once
  emailed to a tester (`emailed/`).
### What to run (owner, 2026-11-10: "quantity isn't a substitute for quality")
- `zsh tests/check.sh [ref] [baseline_dir]`: CI tests, files_flow, ui_sweep --quick, monkey (3 seeds x 4 starts); the
  batches + pe900_check + byte compare when stitch code changed (then the VM); steps_lint / entry_state / said_flow /
  picture_corpus / lettering_look only when their area changed. ~25 min; every check has a time limit (no `timeout` on
  macOS: perl alarm; a hung surfaces run sat at 0 % CPU).
- On demand only: surfaces (21 min, overlaps sweep + monkey), files_flow --matrix, starters, picture_history, text_fuzz,
  engine_fuzz, flow_lint on batches. A new guard replaces or extends one of the routine checks; add a new script only
  for a class nothing routine can reach, and retire one it overlaps.
### Category checks
Automated checks that each guard a bug class (add a line with every new guard):
- Other formats (DST, EXP, VP3; `docs/formats-out-spec.md` 9): golden files and Appendix B's SHA-256 in
  `formats.test.mjs`, compared there with pyembroidery's reading of them (`tests/make_fixture.py oracle
  tests/fixtures/golden/*.{dst,exp,vp3}` by hand after a golden file changes; the JSON is committed); every
  re-encoded sample and fuzz design read back by `validateOut`; a centred design against pyembroidery's own writers
  (`make_fixture.py pywriter`: EXP and DST identical, VP3 but its stitch count). `pe900_check.py` reads a DST/EXP/VP3 beside a PES
  with pyembroidery and wants the PES's needle points as the machine reads the PEC (anchor stitches after jumps
  aside) and as many changes; the batch pages save all three beside each PES (504 of 504 at W5).
- Writer drift: golden bytes (`formats.test.mjs`). Machine-readable PEC: `pe900_check.py`, `validatePES` on every
  download, the Brother diff after writer changes.
- App verdict = checker: `quality.js` agrees with `pe900_check.py` on every batch and sample file.
- Doctor fixes give valid, passing files at every size (`doctor.test.mjs`).
- Offline completeness: every module, font, icon in `FILES` (`sw.test.mjs`). It also checks every import resolves to a file of the app that exports the
  name (a mistyped path stops the page loading; nothing else in Node sees it) and that sw.js's hashes and set
  fingerprint are current. And the first load: index.html's `modulepreload` list is exactly app.js's imports
  (`--write` writes it, before the hashes), the Picture and Open tabs' code isn't among them, and the font the
  page asks for early is the first starter's.
- One release at a time, never a mix: `zsh tests/upgrade.sh` (~1.5 min; three copies of the site served one after
  another: stays whole on the running release, offers the new one, refuses a half-published one). `check.sh` runs it
  when sw.js or app.js's registration changes.
- What the page says against the file (v27 testers): said_flow checks the stroke label against the thin-line file,
  Fit to hoop and the machine choice said, notes clear of Download, a turned batch, a zoomed drag, an opened copy's
  thread and stop names (needs `tests/external/pes`), the Small details note, and Arrange. A branch's CI reports a
  stale preload list as it does stale hashes (`sw.test --wip`).
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
    Every part draws from one seeded sample, so adding, removing or `--only`-ing a part changes the strings later
    parts get: compare failures with the same `--only` set. Open: a corpus name with a line-separator character
    (\u2028/\v) is two names in the names batch (the app's `tidy` splits it) but one in the test's `refused` check.
  - Pictures unlike the samples: `tests/picture_corpus.sh CDP HP OUT [query]` (~1.5 min; 26 seeded drawings x styles x
    sizes; open cases in its `KNOWN` list with a reason; `?ext=etsy_N` renders the external samples; `art` logs what
    the check of the picture says under each case, and each drawing's `check: { say, never }` is checked always (`check`, not `art`: `spec.art` marks PX0's AI-style pictures)).
  - Pictures that don't look like the picture: `picture_corpus.sh` scores every case (below, "Looks like the
    picture") and fails when a kind's mean look falls 2 points under `tests/fixtures/look.json`.
  - Starters open warning-free and fit (typing "Maximilian" too): `node tests/starters.mjs CDP http://127.0.0.1:HP` (~3 min). Its first check
    (every starter opens on the 5x7 with no problem above a tip and Download on) also runs in steps_lint's starter
    loop; the 4x4, long-name and turned cut-file passes are starters.mjs's alone. Not folded into studio_batch: the
    batch page builds with `compose` and has no editor, so it can't see the page's problems list.
  - Picture output is a pure function of its settings; the lost note and its fixes: `node tests/picture_history.mjs CDP HP`.
    picture_corpus measures left-out pieces itself and must agree with the note.
  - Sizes agree everywhere: `tests/sizes_lint.mjs` (used by steps_lint and surfaces).
  - Files and names flows (Rename on every exit, Picture -> Design, swaps, non-embroidery files, Madeira):
    `node tests/files_flow.mjs CDP http://127.0.0.1:HP` (~2 min).
  - Speed: `node tests/monkey.mjs CDP HP --start fifteen-letters,fifteen --budget 1000`; ganged frames:
    `--start gang-<starter>` (checks `selbox`, `exit`).
  - Asked vs sewn, entry points, speed: `node tests/sewn_lint.mjs` (CI), `tests/said_flow.mjs` (~20 s), `tests/entry_state.mjs` (~5 min,
    9 entry points x dirty state), `tests/files_flow.mjs --matrix` (~11 min, kinds x modifiers x exits; nine of the 63, each modifier once and each kind at least once, on every files_flow run), `tests/perf.mjs` (500 ms
    budget), surfaces per-fact equality, monkey toast checks, flow_lint.test degenerate frames.
  - Fix landing, dialogs, toasts: ui_sweep fix-landing, dialog-scrolled, picked-hidden, cut-short, toasts stay; surfaces <bdi>, said-twice,
    owned-spool rules, Open fixed/as-it-came; monkey asked, arch, Fit-never-shrinks, patch edge, Make another never
    silent; doctor.test offered sizes fit as re-stitched; picture_corpus ground_line, framed; text.test Words box.
  - Lettering look and words: `tests/browser/lettering_look.html` (every font: monogram side initials 0.68 of the middle within 11 %,
    lone dots round at 60 mm, big script thick/thin at least 1.4x; title `DONE checks problems`); steps_lint sentence
    and plural rules; files_flow every exit says its file, names dialog notes, file counts; monkey slider value/label,
    fit-note promises, one-thread offers, preview scale while typing; ui_sweep `popup-tap-through`, `design-recent`;
    entry_state Recent designs byte-identical after reload, picture kept, storage refused; doctor.test Even out
    toward 0.4; said_flow names loose threads. `cdp.mjs slow on` = a slow phone (400 ms, 50 KB/s, CPU 4x).
  - Doctor keeps cover: doctor.test.mjs checks each solid block's thread per mm² within 70-160 % at 50/80/120/250 %.
  - steps_lint also: step order (Press Start last), same-thread leads, inch/cm pairs, glossary once, Sew along zoom.
    ui_sweep: view-menu ticks, toasts time out, `cut-row`. Monkey: no empty <details>, size = "Shrunk to", note size =
    chip, Fit fills 90 %, `caps`.
  - Guidance words agree (no repeated sentences, hooping note vs step 1, cut file mentioned, time formula, dialog):
    `node tests/steps_lint.mjs CDP http://127.0.0.1:HP` (~1.5 min).
  - One thread label per colour on every surface: surfaces.mjs "threads:" cases; damaged/short Open and empty lettering
    cases too. Monkey flags a fix that changes the pieces but not the stitches (`--start <starter id>`); ui_sweep
    `focus-back`, `menu-left-open`.
### Looks like the picture (`tests/look.js`, roadmap PX0; per style since C5-LK)
The scoreboard and `pe900_check` say how a file sews; this says how much the sewn result looks like the picture it
came from, judged as a person judges its style. Every picture_corpus case that makes a file is scored; the run ends
with a table per kind and style.
- **Render.** The file's own bytes (`readEmbroidery`, as the preview), each stitch a 0.4 mm thread lit as a cylinder
  from the upper left with a highlight along its direction (Kajiya-Kay; the thread's own colour brightened, the mean
  kept: added white drew Black as grey and Prussian Blue as lavender, PX7), later stitches over earlier ones, on the
  fabric, 10 px per mm, with its thread cover per pixel. Pure JS: Node and the browser give the same numbers. `render`
  in the query writes `NAME_look.png` (the picture at the stitched size beside the render) and, for a line drawing,
  `NAME_lines.png` (the picture's lines green where traced, red where not, band centres grey, stitches blue). Not
  `js/render.js` (canvas and DOM, screen-sized, not reproducible to the bit).
- **Fabric.** The picture's page colour (the commonest colour of its outermost pixels; white when see-through), except
  in a frame (`frameOf`: a band of one colour all round the edge that turns to another colour within 3 px): the colour
  inside the band, and a band the file doesn't sew (cover under half) is fabric in the picture too. The outermost
  pixels made a framed card's fabric its green frame: a cream panel left bare scored as a 90 x 65 mm hole (52).
- **Picture.** The sized crop (`plan.crop`) mapped onto the same mm box (the design plus 2 mm), area-averaged, with
  mm 0,0 where the stitches put it: the picture's centre, a cross-stitch's grid centre (`crossStitch` centres the
  cells that fit, so the picture's centre put every cross up to half a cell off; `r.origin` when the worker sends it).
- **The render as seen** (`perceived`): the thread's own colour (normalised by its cover, so the fabric between rows
  isn't mixed in) where the cover reaches `ref`, else mixed with the fabric by the cover. Filled: ref 0.9 (the render's
  anti-aliased gaps between 0.4 mm rows put a quarter row of fabric in every 0.4 mm: a black fill read L* 13, colour
  0.39 and structure 0.12 on a Black thread). Cross-stitch: ref = the design's own cross cover (the 75th centile;
  two 0.4 mm diagonals cover ~43 % of a 2.5 mm cell), so crosses read as their thread, not 40 % thread + 60 % fabric.
- **Filled and Cross-stitch score** (0.2 mm pixels; Filled blurred 0.35 mm first, so the 0.4 mm rows and grooves of
  thread are not error and a 2 mm shape still is; S-CIELAB's idea). Parts, each 0-1:
  - colour: mean CIEDE2000 where both are inked (ΔE00 over 8 from the fabric); 0 at ΔE 25. Wrong threads.
    Cross-stitch: the picture's ink colour and the thread's colour, each normalised without the fabric round it.
  - shape: intersection over union of the inked areas. Parts left out, bloat, a shadow sewn.
  - outline: chamfer distance between the two edge maps (Lab gradient over 10 ΔE per mm, thinned), each edge pixel
    capped at 2 mm, both ways; 0 at 2 mm. Edges in the wrong place, jagged or extra.
  - detail: the share of the picture's edges with a stitched edge within 0.5 mm. Small things kept.
  - structure: SSIM of L* at 0.4 mm pixels over the inked area and 1 mm round it (coarse scale only); where the
    picture is flat (L* variance under 4) only SSIM's lightness term: its structure term there measured the thread's
    sheen against nothing.
  - look = 100 x (0.30 colour + 0.25 shape + 0.15 outline + 0.15 detail + 0.15 structure).
  - Cross-stitch at the cell's scale: both blurred by half a cell (the lattice keeps 0.7 % of its contrast), the edge
    threshold scaled to that blur, detail within half a cell.
- **Line drawing score**: against the picture's own lines (`lineRef`, from the picture's pixels, not its learned
  colours), not against the filled picture, where colour and shape (55 %) only measured the style: a near-perfect
  crayon trace scored 28 and a landscape missing its ridge 36. The lines are the edges (as above; edge pieces under
  1 mm and holes in the ink under 1 mm² are texture, not lines: a crayon's paper speckle) and, for each band up to
  4 mm wide (between two edges, or an edge and the fabric: a stroke, or a dark outline across a coloured shape), its
  centre. Parts:
  - recall: the share of the edges (weighted by contrast up to twice the threshold) with a stitch within 0.75 mm,
    or for a band's edges anywhere across the band. Lines left out (the landscape's ridge).
  - precision: the share of the stitch length within 0.75 mm of a line or on a band. False lines (die-cut borders,
    spurs, a gradient's band line).
  - doubling: 1 - the share of stitch length with a parallel line 0.5-2 mm across picture ink with no edge between
    (one band traced as its two outlines).
  - colour: ΔE00 of each line's thread against the picture's line beside it; 0 at 25.
  - weight: across each band 1.5 mm or wider, the width sewn over the band's width (a 3 mm crayon line as one run: 0.13).
  - look = 100 x (0.4 recall + 0.25 precision + 0.15 doubling + 0.1 colour + 0.1 weight) (the cycle 5 reviewer's
    weights). Stitch length counts each thread pixel as 1 / the thread's width there, so a satin column is one line.
- **The per-style score (C5-LK) against v34's**, same files: Filled 80.4 -> 81.8 (127 cases), line 42.2 -> 81.6 (57),
  cross 41.5 -> 70.5 (55). Filled kinds move -4.4 to +6.0: shapes +6.0 (the black cat 60 -> 95: Black colour 0.39 ->
  0.96 and structure 0.12 -> 0.94; the framed card 52 -> 84 and 65 -> 90, fabric from inside the frame), flat
  pictures +1 to +3 (structure on flat areas is their lightness), line art -4.4 and the s60 lettering 6-8 down
  (logo_regular 84 -> 75): the render's gaps between rows had mixed ~5 % fabric into every thread and flattered
  saturated or dark threads picked for muted ink (navy sewn ultramarine, a dusty red sewn bright: C5-CO's subject);
  the crayon fills 5 down the same way (the crayon's paper speckle lightens the picture, the thread doesn't). Line
  drawing: the crayon trace 28 -> 80 now outranks the landscape missing its ridge 36 -> 73 (recall 0.82, the ridge
  red in `_lines.png`). Cross-stitch: right threads score colour 0.72 (near_identical 0 -> 0.72, 36 -> 80).
- **Trusted because** made-up copies rank as a person ranks them on every run (`lookSelfTest`, failing the run if
  not). Filled (`variants`, four pictures): a copy given thread rows and grooves scores 99+, and blurred (1.2 mm),
  shifted 1 mm, recoloured, thinned (parts under 1.6 mm gone) and two-tone copies all score lower, each with its own
  part lowest (recoloured: colour; blurred: detail; shifted: outline; thinned: shape). Line drawing (`lineVariants`,
  crayon, a cartoon, a logo, a landscape): a tracing of the picture's own lines scores 85+ (99+ today), and copies with
  a third of the lines dropped (recall), false lines across the fabric (precision), bands sewn as two outlines
  (doubling), the trace 1 mm off (precision), its threads recoloured (colour) and bands sewn as hairlines (weight) all
  score lower; the hairline copy (the crayon) above the dropped one (the landscape). Cross-stitch (`crossVariants`, 2.5
  mm cells charted from the picture): the chart in the picture's colours scores colour 0.7+ (0 on right threads before),
  and copies shifted half a cell (outline), recoloured (colour) and with a third of the columns dropped (shape) lower.
- **Reading it.** Compare a row with itself over time, not rows with each other: the styles are scored by different
  parts (Filled and Cross-stitch against the picture, a line drawing against its lines). A change of 1 point in a
  row's mean is real (the score is deterministic); 2 points down fails the run;
  cases 3+ points down or up are listed as `worse:`/`better:`. The stitch columns beside it (stitches, trims, loose)
  are the price: a better look bought with twice the trims is a choice, not a win.
- A sewing test for the owner's own fabric (not a check): `node tests/ladder.mjs OUT.pes`, squares of fill at four
  row spacings.
- **Re-save** after a round that is meant to move it: `LOOK_SAVE=1 zsh tests/picture_corpus.sh CDP HP OUT` copies
  the run's `look.json` to `tests/fixtures/look.json`.
- **Weak spots**: the page colour stands in for the fabric (a photo's backdrop that is not one colour, or a pale
  panel left bare like the `panel` picture's, counts as ink left out); no pull, push or puckering; the colour part only
  looks where both have ink, so a part left out costs shape and detail, not colour; a sticker's die-cut border is an
  edge of the picture, so tracing it is not counted false; the cross-stitch cell is `r.cell` or 2.5 mm, and the grid
  origin crossStitch's own rule until the worker sends `origin`; the weights are chosen, not fitted to people's
  ratings (no rating data yet).