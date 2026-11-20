# The paid version

The plan and its rounds are in `docs/roadmap.md` ("The paid version"). This file holds how it is built and why, so a
round can be picked up cold.

## What is protected, and what is not
- **Protected: what makes stitches.** `js/core/` digitize, palette, artcheck, regions, shade, fill, geom, raster,
  design, recipes, text; all of `js/studio/`; `js/doctor.js`; the three workers. None of it is in the public build.
- **Not protected: what reads a file.** The reader and writer of the file formats, the counts, the checker's rules,
  the drawing, the checkup of an opened file, a picture's canvas work and sizing. Both builds ship it: the formats
  are public knowledge, and the page draws, counts and gates with it exactly as before.
- **The file itself.** The server keeps the whole file and answers a job with a *preview*: the same file without the
  stitches `Design` marked as locks and underlay. A file rebuilt from the preview has no locked thread ends, so it
  works loose on the machine. The whole file is handed over by `POST /file` for one use of a code.

## One codebase, two builds, no build step
- The page imports everything that makes stitches from `js/engine.js` and nothing else from the engine
  (`tests/door.test.mjs`). The full app's `engine.js` runs the engine in the page and its workers.
- The public build is a copy of the listed files with `js/engine-remote.js` in place of `js/engine.js`
  (`server/build-public.mjs`). Its jobs go to the server in `js/remote-worker.js`, a worker that speaks the same
  messages as `worker.js` and `doctor-worker.js`, so `jobs.js` and the page's job code are the same in both builds.
- Split for this (round C1a, no behaviour change): `core/limits.js` (out of recipes.js), `core/turn.js` (design.js),
  `core/grid.js` (raster.js), `core/picprep.js` (digitize.js, artcheck.js), `core/areas.js` (palette.js),
  `checkup.js` (doctor.js), `common.js` (studio/ui.js). Each old file hands its moved names on.

## The server
- `js/picjob.js` and `js/docjob.js` are the workers' job functions, called by the workers and by
  `server/handler.mjs` alike: one code path, so the server's whole file is the page's, byte for byte.
- A picture's pixels are sent raw (RGBA) and gzipped, never as PNG: a canvas round trip changes see-through pixels,
  and the server then needs no canvas for pictures. The Design tab's lettering does need one (round C5).
- A job's reply carries the preview (`bytes`, `pattern`), a `job` id and `real`: the whole file's stitch count,
  loads, loose threads and verdict, which the page shows in place of the preview's own.
- Stores: the whole file by job id (S3, 30 days), codes and per-address limits (DynamoDB). Locally both are in
  memory (`node server/dev.mjs`).

## Known and accepted
- The Design tab is not in the public build until round C5; the tab says so.
- In the public build a failing opened file gets no one-tap fixed copy at Download (the Checkup's fixes still run).
- The Thickness view in the public build is the preview's (a little under the whole file's).
