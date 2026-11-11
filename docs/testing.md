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
    sizes; open cases in its `KNOWN` list with a reason; `?ext=etsy_N` renders the external samples).
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
