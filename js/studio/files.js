/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Opened embroidery files as Design-tab pieces: a pattern's colour blocks as paths (each starting at its first
// stitch, keeping the file's exact thread), scaled, and back to a pattern for re-stitching. (Part of pieces.js until
// 2026-11.)
import { machineThreads } from "../core/formats.js";
import { bounds, run } from "../core/geom.js";
import { PEC_MATCH, pecThread } from "../core/threads.js";

// How far a design file can be resized inside a design: the doctor's re-stitch range (Open a design's Size)
export const FILE_SCALE = [0.5, 2.5];
// a file piece's blocks scaled about their centre as they are (the stand-in while the re-stitch runs, and its size)
export const scaleBlocks = (blocks, f) => blocks.map((b) => ({ ...b, paths: b.paths.map((q) => q.map(([x, y]) => [Math.round(x * f * 10) / 10, Math.round(y * f * 10) / 10])) }));
// a file piece's blocks as a pattern again (0.1 mm units, a jump to each run), for the doctor's `fix`
export function blocksPattern(blocks) {
  const stitches = [];
  blocks.forEach((b, k) => {
    if (k) stitches.push([...stitches[stitches.length - 1].slice(0, 2), 5]);
    for (const q of b.paths) {
      stitches.push([Math.round(q[0][0] * 10), Math.round(q[0][1] * 10), 1]);
      for (const [x, y] of q) stitches.push([Math.round(x * 10), Math.round(y * 10), 0]);
    }
  });
  stitches.push([...stitches[stitches.length - 1].slice(0, 2), 4]);
  return { stitches, threads: blocks.map((b) => ({ color: b.color, name: b.name })) };
}
// An opened design as a piece: its stitches split into runs at jumps/trims, per colour block, centred.
export function fileBlocks(design) {
  const blocks = [];
  let cur = null, run = [];
  const flush = () => { if (run.length > 1 && cur) cur.paths.push(run); run = []; };
  // Each block keeps the machine thread the file's own PEC palette gives it: where the colour as written would be sewn
  // as another thread, it takes that thread's colour (ufront.pes's #cc99ff is Lavender in its palette, but written from
  // the hex it became Light Lilac: the Open tab and the Design tab named different threads)
  const pec = design.pec, mine = pec ? machineThreads(design.threads) : [];
  const color = (k, t) => (PEC_MATCH[pec?.[k]] && mine[k]?.index !== pec[k] ? pecThread(pec[k]).hex : t.color || "#000000");
  design.stitches.forEach(([x, y, c], i) => {
    if (!cur) { cur = { color: color(0, design.threads[0] || {}), name: design.threads[0]?.name || "", paths: [] }; blocks.push(cur); }
    if (c === 0) run.push([x / 10, y / 10]);
    // (a run starts at its first stitch, not where the jump to it stopped: files' jumps often stop a few mm short, and
    // starting there sewed each one as a 2-5 mm stitch or loose thread: peace.pes had 31 to snip here, 3 opened alone)
    else if (c === 1 || c === 2) flush();
    else if (c === 5) {
      flush();
      const k = design.threads[blocks.length] ? blocks.length : design.threads.length - 1, t = design.threads[k] || {};
      cur = { color: color(k, t), name: t.name || "", paths: [] }; blocks.push(cur);
    }
  });
  flush();
  const kept = blocks.filter((b) => b.paths.length), pts = kept.flatMap((b) => b.paths.flat());
  if (!pts.length) throw new Error("That file has no stitches.");
  const [x0, y0, x1, y1] = bounds(pts), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (const b of kept) b.paths = b.paths.map((q) => q.map(([x, y]) => [Math.round((x - cx) * 10) / 10, Math.round((y - cy) * 10) / 10]));
  return kept;
}
