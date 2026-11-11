# Open tab (`formats.js`, `doctor.js`, `quality.js`)

Reference for this part of Needleworks: the rules, the reason for each (it stops someone undoing it) and the number that proved it. Hard rules are in `CLAUDE.md`. Add a lesson where its topic is, never as a round log.

- Open logic is `doctor.js` `openedFile` (shared by app.js and the fuzz): designs start with a jump to their 1st
  stitch, lose jumps to nowhere (each became a stitch where it ended) and thread changes before the 1st stitch
  (`firstMove`), and move onto the centre when over 200 mm out (`centred`).
- `readEmbroidery`: PES, PEC, DST (three jumps = trim). Cut-short (`endsEarly`) and `misplaced` files are saved
  rewritten. `designBlockAgrees` flags a v6 design block that isn't its PEC block. `HARD` failures (thread count,
  palette 62-64 unless named appliqué/placement/tack-down, disagreeing block, over 99 blocks) are never saved as they
  came: rewritten, or shown but not saved. Passing untouched files download as their own bytes.
- `damaged` = design block disagrees AND the machine block is broken (misplaced box, wrong thread count/appliqué
  codes): said instead of "two designs". A DST with real records after its end code is `short`. A failed Open keeps
  the open design.
- `notEmbroidery` (doctor.js) reads the first bytes: pictures (offered to Picture to stitches), PDF, ZIP, HEIC/SVG and
  empty files are said for what they are. Open saved says which hoop it switched to and offers the one picked.
- Open: sizes offered as fitting are made with `fitFix` (re-stitched copies come out up to 0.5 mm bigger:
  flower_ludd 176.1 in 176); `largest()` keeps the smaller per hoop. A failing file opens with its fixes ticked (Save
  fixed copy), `_fixed` at any size; the done dialog says to sew the `_fixed` one when both were saved. A PES cut before
  its stitches says "cut short"; junk .dst refused (`notDST`).
- `checkup(readEmbroidery(bytes))` reads the file as it will be saved, counts from quality.js: `peak` at every
  offset, tiny past max(50, 1 %), satin gap measured along the edge, across the stitch (60 % short stitches on curves
  aren't gaps; same in pe900_check) (under 0.25: "Even out"), stitches over 10 mm (note) and 12.1 mm ("Split
  long stitches"), jumps shrinking brought under 5 mm, a stabilizer hint.
- `fix(pattern, { scale, tiny, thin, sort, join, satin })` in `doctor-worker.js`. Shrinking ticks Remove tiny and Thin.
  - `landJumps` (also on open): a jump lands on its first stitch (the writer puts the needle down where a jump ends:
    short-stopping jumps became loose threads); a first stitch followed by one over 12.1 mm becomes a jump.
  - 80-120 %: scaled, rounded to 0.1 mm, zero-length dropped; `respace` brings satins into 0.3-0.5, open ones toward
    `FULL` 0.4 (0.4 from 0.7 up: a DST at 0.85 came out 0.50); re-stitching keeps the nearest sane gap (cover check).
  - Past that, `restitch` (50-250 %): zigzag columns rebuilt at the source density within `SATIN` 0.3-0.5, satin up to
    `WIDE` 30 mm (filling wide columns criss-crossed); zigzags over `OPEN` 1 mm stay lines (underlay); ends reach `EXT`
    0.5 mm only where the source sews (`COV`, `BOX`); fills refilled at `ROWS` 0.35-0.5 per block and direction,
    minus earlier directions; the rest are runs. Over `MAXS` 6.8 mm is `split` into `PIECE` 5.5 mm with staggered
    cuts (the writer halves over 7 mm out of `relieve`'s sight); crowded edges get short stitches (`SHORT`). Worse:
    split satin 7-14 mm (39-49 hits/mm²), fixed-place cuts, filling columns over 25 mm.
  - Fills are refilled at the source's thread per mm² (all its stitches, less 0.4 for our underlay), `ROWS` 0.15-0.5;
    a fill in several parts is also tried the other way, fewer parts kept (the 0.35 floor halved gnome's cover).
  - `relieve` if thin; `slide()` always; `dropTiny` when tiny and after any re-stitch.
  - `sortColors`: a block joins the last earlier one of its thread if nothing sewn between touches it; off for machine
    stops, DST and same-thread pauses (`pauses`: fabric steps). `fewerBlocks` for over 99 blocks; `blockThreads`.
- `_fixed` (`<name>[_Npct]_fixed.pes`) only when it passes; `fixedCopy` retries up to 3 times.
