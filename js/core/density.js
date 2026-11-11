/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Needle hits per square millimetre, counted one way for the checker's verdict (quality.js `peak`) and the Thickness
// view (doctor.js `heat`). The machine's grid can sit at any 0.1 mm offset from ours, so every 1 mm window is counted,
// not only the cells of our own grid (offset 0 alone said 17 for peace.pes where pe900_check finds 25; the Thickness
// view counted that way until 2026-11 and showed no red on a file the checker failed).
// Stitch units 0.1 mm. A colour change starts a new block, and so does a pause (STOP) between two blocks of one
// thread, as pyembroidery reads it.
import { COLOR_CHANGE, STITCH, STOP } from "./formats.js";

// density(stitches, skip) -> { max, cells }
//   cells: one entry per occupied 1 mm cell of a block, { b, cx, cy, n (hits in the cell), top (the most hits in any
//          window counted over the 2 x 2 group of cells it belongs to) }
//   max:   the most hits in any 1 mm window (or cell)
// A window lies in a 2 x 2 group of cells; its corner cell may be empty, so groups start at every occupied cell's
// left/upper neighbours too. skip(hits in the group, max so far) leaves a group uncounted (it can't matter).
export function density(stitches, skip = () => false) {
  const cells = new Map(), K = (b, cx, cy) => (b * 8192 + cx + 4096) * 8192 + cy + 4096;
  let b = 0;
  for (const [x, y, c] of stitches) {
    if (c === COLOR_CHANGE || c === STOP) { b++; continue; }
    if (c !== STITCH) continue;
    const X = Math.round(x), Y = Math.round(y), cx = Math.floor(X / 10), cy = Math.floor(Y / 10), k = K(b, cx, cy);
    let cell = cells.get(k);
    if (!cell) cells.set(k, (cell = { b, cx, cy, n: 0, top: 0, pts: [] }));
    cell.n++; cell.pts.push(X - cx * 10, Y - cy * 10);
  }
  let max = 0;
  const corners = new Map();
  for (const c of cells.values()) {
    if (c.n > max) max = c.n;
    if (c.n > c.top) c.top = c.n;
    for (const i of [0, 1]) for (const j of [0, 1]) corners.set(K(c.b, c.cx - i, c.cy - j), [c.b, c.cx - i, c.cy - j]);
  }
  const grid = new Uint16Array(21 * 21);   // hits at each 0.1 mm point of the group, then summed from the top left
  for (const [gb, gx, gy] of corners.values()) {
    const group = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => cells.get(K(gb, gx + i, gy + j))).filter(Boolean);
    let hits = 0; for (const c of group) hits += c.n;
    if (skip(hits, max)) continue;
    grid.fill(0);
    for (const c of group) for (let i = 0; i < c.pts.length; i += 2) grid[(c.pts[i + 1] + (c.cy - gy) * 10 + 1) * 21 + c.pts[i] + (c.cx - gx) * 10 + 1]++;
    for (let y = 1; y < 21; y++) for (let x = 1; x < 21; x++) grid[y * 21 + x] += grid[y * 21 + x - 1] + grid[(y - 1) * 21 + x] - grid[(y - 1) * 21 + x - 1];
    let top = 0;
    for (let oy = 0; oy < 10; oy++) for (let ox = 0; ox < 10; ox++) {
      const n = grid[(oy + 10) * 21 + ox + 10] - grid[oy * 21 + ox + 10] - grid[(oy + 10) * 21 + ox] + grid[oy * 21 + ox];
      if (n > top) top = n;
    }
    if (top > max) max = top;
    for (const c of group) if (top > c.top) c.top = top;
  }
  return { max, cells: [...cells.values()] };
}
