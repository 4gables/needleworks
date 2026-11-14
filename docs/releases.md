# Releases

Every release on `main`, newest first: one merge commit, tagged `vN` (the cache number in `sw.js`). Each release adds
its row here. To undo one: `git revert -m 1 <merge>`, then bump `CACHE` in `sw.js` and run
`node tests/sw.test.mjs --write` as the last change (a release with stale hashes never installs).

| Version | Date | What changed | Merge commit | Revert |
|---|---|---|---|---|
| v33 | 2026-11-13 | Pictures: thin strokes (1-4 mm) sewn as satin columns, small blobs as satin dots, stems cut off the fills they grow from | (merge SHA filled at release) | `git revert -m 1 <sha>`, then bump CACHE + `sw.test.mjs --write` |
| v32 | 2026-11-13 | Pictures that look like the picture (look score), cleaned shapes and merged near-colours, rows that follow the shape, machine-aware picture files, a guide to art that stitches well | c6e2434 | `git revert -m 1 c6e2434`, then bump CACHE + `sw.test.mjs --write` |
| v31 | 2026-11-13 | One thread colour means one thread (a picture's closed-in white left as fabric, Sew it to add it) | 3cb396c | `git revert -m 1 3cb396c`, then bump CACHE + `sw.test.mjs --write` |
| v30 | 2026-11-13 | Per-piece fill settings, files for other machines (DST, EXP, VP3) | 8d92534 | `git revert -m 1 8d92534`, then bump CACHE + `sw.test.mjs --write` |
