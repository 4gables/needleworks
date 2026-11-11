/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Work done off the page: quilting and carved patch fills in a worker (the last result stands in meanwhile), and
// opened design files re-stitched at a new size by the doctor's worker. The editor hands in its state and helpers
// as S. (Part of ui.js until 2026-11.)
import { mmText } from "../words.js";
import { quiltOf } from "./quilt.js";
import { carveDone, patchFillOf, quiltDone, FILE_SCALE, scaleBlocks, fileBlocks, blocksPattern } from "./pieces.js";

export function offPage(S) {
  const { api } = S;
  // ---------- quilting and patch fills, worked out off the page ----------
  // A stippled or echoed frame's quilting is worked out again whenever anything on it moves or changes (seconds on a
  // busy design): the preview shows the last quilting meanwhile and Download waits. One job at a time, the newest
  // waiting one next; the design is made again when it's done.
  let quiltWorker = null, quiltBusy = null, quiltNext = null;
  function quiltSoon(job) {
    if (quiltBusy) { if (quiltBusy.key !== job.key) quiltNext = job; return; }
    const finish = (paths) => {
      const done = quiltBusy; quiltBusy = null;
      // (no worker, or it failed: worked out here)
      if (done.kind === "patch") carveDone(done.key, paths ?? patchFillOf(done)); else quiltDone(done.key, paths ?? quiltOf(done));
      const n = quiltNext; quiltNext = null;
      if (n && n.key !== done.key) quiltSoon(n);
      S.make();
    };
    quiltBusy = job;
    try {
      if (!quiltWorker) {
        quiltWorker = new Worker(new URL("../quilt-worker.js", import.meta.url), { type: "module" });
        quiltWorker.onmessage = (e) => finish(e.data.paths);
        quiltWorker.onerror = () => { quiltWorker = null; finish(null); };
      }
      quiltWorker.postMessage({ key: job.key, job });
    } catch { quiltWorker = null; setTimeout(() => finish(null)); }
  }
  // ---------- design files resized ----------
  // A file piece keeps the stitches it was opened with (`orig`) and its size against them (`scale`); `blocks` are what
  // it sews. A new size is the stitches scaled as a stand-in (`pending`, Download waits) while the doctor's `fix`
  // re-stitches it in a worker, one at a time; results are kept for undo and redo.
  const restitched = new Map();
  const fileKey = (p, f) => `${p.name}|${p.orig.length}|${p.orig[0].paths.length}|${p.orig[0].paths[0][0]}|${f}`;
  function resizeFile(p, f) {
    f = Math.min(FILE_SCALE[1], Math.max(FILE_SCALE[0], Math.round(f * 100) / 100));
    const orig = p.orig || p.blocks;
    if (f === 1) { p.blocks = orig; delete p.orig; delete p.scale; delete p.pending; return; }
    if (f === p.scale) return;
    p.orig = orig; p.scale = f;
    const hit = restitched.get(fileKey(p, f));
    if (hit) { p.blocks = hit; delete p.pending; } else { p.blocks = scaleBlocks(orig, f); p.pending = true; }
  }
  // its size in words, at scale f: "62 % · 55 × 48 mm"
  function fileSize(p, f) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of p.orig || p.blocks) for (const q of b.paths) for (const [x, y] of q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return `${Math.round(f * 100)} % · ${mmText([Math.round((x1 - x0) * f), Math.round((y1 - y0) * f)])}`;
  }
  let fileWorker = null, fileJob = null;
  function restitchFiles() {
    if (fileJob) return;
    const p = S.pieces.find((q) => q.kind === "file" && q.pending);
    if (!p) return;
    const hit = restitched.get(fileKey(p, p.scale));
    if (hit) { p.blocks = hit; delete p.pending; S.save(); S.make(); return; }
    if (!fileWorker) {
      fileWorker = new Worker(new URL("../doctor-worker.js", import.meta.url), { type: "module" });
      fileWorker.onmessage = (e) => {
        const job = fileJob; fileJob = null;
        const q = S.pieces.find((o) => o.id === job.id && o.kind === "file" && o.pending && o.scale === job.scale);
        let blocks = null;
        if (e.data.ok) try { blocks = fileBlocks(e.data.pattern); restitched.set(job.key, blocks); } catch (err) { e.data.error = err.message; }
        if (q && blocks) { q.blocks = blocks; delete q.pending; }
        // (it couldn't be re-stitched at that size: back to the size it came in, and said)
        else if (q) { resizeFile(q, 1); api.showError(`${q.name} couldn't be resized: ${e.data.error}`); }
        S.save(); if (q && S.current()?.id === q.id) S.editor(); S.make();
      };
    }
    // (a worker that dies never answers: the piece stayed pending and Download waited for good)
    fileWorker.onerror = (err) => {
      const job = fileJob; fileJob = null; fileWorker.terminate(); fileWorker = null;
      const q = job && S.pieces.find((o) => o.id === job.id && o.kind === "file" && o.pending);
      if (q) { resizeFile(q, 1); api.showError(`${q.name} couldn't be resized: ${err.message || "something went wrong"}`); }
      S.save(); S.make();
    };
    fileJob = { id: p.id, scale: p.scale, key: fileKey(p, p.scale) };
    fileWorker.postMessage({ id: 0, d: blocksPattern(p.orig), opts: { scale: p.scale, tiny: p.scale < 1, thin: true, grow: true } });
  }
  return { resizeFile, fileSize, restitchFiles, quiltSoon };
}
