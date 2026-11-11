# needleworks

Embroidery files for Brother home machines (PE900 first). Static site, no build step, GitHub Pages from the repo
root (https://4gables.com/needleworks/). JavaScript is the only engine; Python is test tooling only
(`tests/pe900_check.py`, `tests/batch_server.py`, venv `.venv` from `requirements.txt`). Serving a non-technical
user through Claude Code: `.claude/skills/embroidery/SKILL.md`.

Rules, the reason for each (it stops someone undoing it), gotchas, how to test. History is in `git log`; the
measurements behind each number are in the code's comments.

## Repo map
- `index.html`, `css/app.css`, `sw.js`, `manifest.webmanifest`; `js/app.js` (preview, `setView`, toasts, downloads,
  tabs, start-up) and its sections: `state.js` (shared state, `store`, hoop helpers), `picture.js` (Picture tab),
  `opened.js` (Open tab), `along.js` (Sew along, names dialog), `threadui.js` (thread labels, brands, Threads I
  own), `focus.js`, `onitem.js`. A section never uses app.js while it loads, only when something happens.
- `js/core/`: `formats.js` (PES writer, readers, `validatePES`), `threads.js` (PEC palette), `recipes.js` (every
  stitch number and limit, with its reason: read here, never re-typed), `design.js` (`Design`, locks, `finish`,
  `relieve`), `density.js` (hits per mm² at every offset), `geom.js`, `colour.js`, `raster.js` (skeleton, stroke
  graph), `text.js` (`renderWord`), `fonts.js`, `glyphs.js`, `fill.js` (tatami, travel router, `fillPolygon`),
  `palette.js` (a picture's colours and threads), `digitize.js` (pictures: the three styles, sizing, `contentBox`/`pictureImage`/`LEARN`), `brands.js`/`brandcharts.js`,
  `machines.js`, `typed.js` (all typed text: `tidy`, `lacks`, `safeName`, `uniqueName`, `initials`).
- `js/studio/`: `pieces.js` (each piece's stitches, fitting, the sew context `sewAs`), `lettering.js` (a word drawn to strokes, counters,
  arches, `stitchLetters`), `compose.js` (`compose`,
  quilting and carving stages, `gang`, two hoopings), `shapes.js` (frame shapes), `fabrics.js` (`FABRICS`,
  `THREADS` words), `files.js` (opened files as pieces), `ui.js` (editor, warnings, one-tap fixes; hands its state to its
  parts as `S`), `starters.js`, `names.js` (One for each name), `recent.js` (Recent designs),
  `placing.js` (where a piece goes), `threadsaid.js` (thread names in the editor), `toobig.js` (too big for the
  hoop and the ways out), `problems.js` (the problems list), `editor.js` (the piece editor panel), `fixes.js` (one-tap fixes), `stepsui.js` (steps panel), `offpage.js` (worker jobs),
  `outline.js`, `quilt.js`, `motifs.js`. pieces.js still re-exports what moved out of it.
- `js/doctor.js` + `doctor-worker.js` (Open tab fixes), `quality.js` (the checker's rules), `words.js` (problems
  list per view, stop/thread vocabulary), `gate.js` (the only exit for files: `handOut`), `sheet.js` (step text, sew
  sheet, cut file), `render.js` (`draw`), `worker.js`, `quilt-worker.js`, `zip.js`.

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

## Where the rest is
Read the topic's file before changing its code; each holds the rules, their reasons and the numbers behind them.

| Topic | File |
|---|---|
| The plan, the measured state of every stitch type, progress | `docs/roadmap.md` |
| Stitches, locks, `finish`, satin, continuity helpers | `docs/stitch-model.md` |
| Lettering: skeleton, swashes, print fonts, satin width, arches, monograms, fonts | `docs/lettering.md` |
| Design tab: compose, fabrics, frames, appliqué, patches, in-the-hoop, quilting, motifs, placement and fixes, two hoopings, names, the bookmark | `docs/design-tab.md` |
| Pictures: colours, threads, Filled, travel, Line drawing, Cross-stitch | `docs/pictures.md` |
| Open tab: reading, checkup, fixes, re-stitching | `docs/open-tab.md` |
| Threads and brands | `docs/threads.md` |
| App and UI: layout tiers, focus, exit gate, steps and words, sew sheet, offline | `docs/app-ui.md` |
| Tests, batches, the VM, the Brother diff, what each check guards | `docs/testing.md` |
| Tried and rejected; known and not done | `docs/decisions.md` |
| PES/PEC/DST byte layouts (the clean-room spec) | `docs/formats-spec.md` |

## How to work
- Rounds follow `docs/roadmap.md`: one theme each, in a worktree under `.claude/worktrees/` on a branch from
  `origin/main`; never in the main checkout, never `git stash` (shared by every worktree).
- A fresh worktree needs `tests/external` linked from the main checkout (`ln -s`; it is gitignored), or 22
  batch files are missing.
- Rounds may run in parallel, each in its own worktree and branch with its own ports and a list of the files it
  owns; they push only their branch. One release branch merges them (`--no-ff` each), then gets the full check,
  the VM check and the speed check alone on a quiet machine: two slowdowns (2026-11-11) showed only there.
- Save as you go: push the round's branch to origin after each finished step and tick the roadmap's Progress list
  in the same commit. A release is one merge commit pushed `<branch>:main`, tagged `vN` (the cache number), so a
  round is undone with `git revert -m 1`.
- Fix causes in the shared code path, never one instance; prove a stitch change on every design the path reaches.
- A lesson goes in its topic file with its reason and number; superseded text is removed. No round logs. This
  file stays short: only rules that hold everywhere.

## What to run
- `zsh tests/check.sh [ref] [baseline_dir]`: CI tests, files_flow, ui_sweep --quick, monkey (3 seeds x 4 starts); the
  batches + pe900_check + byte compare when stitch code changed (then the VM); steps_lint / entry_state / said_flow /
  picture_corpus / lettering_look only when their area changed. ~25 min; every check has a time limit (no `timeout` on
  macOS: perl alarm; a hung surfaces run sat at 0 % CPU).
- On demand only: surfaces (21 min, overlaps sweep + monkey), matrix, starters, picture_history, text_fuzz,
  engine_fuzz, flow_lint on batches. A new guard replaces or extends one of the routine checks; add a new script only
  for a class nothing routine can reach, and retire one it overlaps.
- The batch run ends with the scoreboard (`flow_lint.mjs --score`): each kind of design's trims, loose threads,
  wasted moves, exposed locks, tiny stitches and files at the density limit, with the change from
  `tests/fixtures/quality.json`. A stitch change is better when its row improves and no other gets worse.
- Details, the VM check and what each check guards: `docs/testing.md`.

## Hosting
- One release at a time (`sw.js`): every file is listed with its SHA-256, a release installs only when every file
  fetched is its own copy, the page's files come from that one set (never the network), and a new release waits
  for the page's "Reload" or for every tab to close. Reason: GitHub Pages serves files with `max-age=600`, and for
  up to 10 minutes after a push a browser ran new and old modules together (2026-10-31: a new ui.js with the last
  pieces.js drew the bookmark squashed). Guard: `zsh tests/upgrade.sh`.
- To release: bump the number in `CACHE` (`needleworks-vN-${SET}`), then `node tests/sw.test.mjs --write` as the
  last change (it writes the hashes and `SET`; CI fails on a stale one, since that release would never install),
  merge as one commit, tag `vN`. After pushing, wait until the live sw.js shows vN. A visitor already on the site
  gets the release at their next visit or by the Reload note; a first visit or Cmd+Shift+R gets it at once.
- 4gables.com is the `4gables/website` repo's custom domain (a project site). Other repos appear under
  4gables.com/<repo>/ only if the org site repo is `4gables.github.io` with the custom domain.
