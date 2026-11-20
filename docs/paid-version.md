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

## Where it runs (2026-11-19)
- AWS account of the owner (it also holds his older sites and Lambdas in us-east-1: left alone), region **us-west-2**,
  everything named `needleworks*`: Lambda `needleworks` (x86, 3 GB, 60 s, 3 at once at most), its function URL
  `https://maawcz4aku4p7pnq3msmuwh7se0wtuzy.lambda-url.us-west-2.on.aws` (answers only pages on 4gables.com and
  the public build served at 127.0.0.1:8831), bucket `needleworks-files-<account>-us-west-2` (files/ deleted after
  30 days), table `needleworks` (on demand), role `needleworks-lambda`, logs kept 14 days.
- Put there, and updated, by `bash server/deploy.sh` in AWS CloudShell (no keys on any computer). While the repo is
  public CloudShell clones it; once it is private, upload a zip of `js/` and `server/` with CloudShell's Upload file.
- Codes: `bash server/admin.sh mint USES NOTE | show CODE | list` in CloudShell.
- Try the public build here: `node server/build-public.mjs OUT ADDRESS`, serve OUT on 127.0.0.1:8831. With
  `node server/dev.mjs` as ADDRESS (http://127.0.0.1:8787) the codes are TEST and ONCE.
- Speed: the server is 3-4 times slower than a recent Mac. A drawn 180 x 135 mm picture: 6 s here, 18 s there (24 s on
  arm64 with 1.8 GB); 60 mm: 1 s here, under 5 s there with a cold start. The time is spread over the picture's
  analysis (no one hot spot): making the engine faster is a round of its own.
- Proof so far: the batches (2,324 files) and the picture corpus are byte-identical to v40 on the full app; the
  server's whole file equals the page's for the same job; a file downloaded from the live server with a code passes
  `pe900_check.py`.

## Known and accepted
- The Design tab is not in the public build until round C5; the tab says so.
- In the public build a failing opened file gets no one-tap fixed copy at Download (the Checkup's fixes still run).
- The Thickness view in the public build is the preview's (a little under the whole file's).
