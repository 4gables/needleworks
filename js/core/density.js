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

// Which thread block each stitch is in, for the counts made while stitches can still be moved (`relieve`, the doctor's
// `slide`, `Hits` in a `Design`): only a colour change starts a new one. A pause (STOP) between two parts of one
// thread doesn't: the same thread goes into the same holes either side of it. So these never allow more than the
// checker's count above, which starts a block at a pause too (as pyembroidery and pe900_check read the file).
export function threadBlocks(stitches) {
  const blk = new Int32Array(stitches.length);
  for (let i = 0, b = 0; i < stitches.length; i++) { if (stitches[i][2] === COLOR_CHANGE) b++; blk[i] = b; }
  return blk;
}

// The same count kept while a design is built (`Design`, where a piece's stitches give way before they pile up:
// recipes.js `EASE`). add(X, Y): a hit, in 0.1 mm as the file rounds it. top(X, Y): the most hits any 1 mm window
// holding that point would have with one more hit there (an upper bound while that is clearly few: the hits of the
// cells round it; counted window by window only where it is close).
// (`fine`: the hits in each half mm square of the hoop and 30 mm round it, a plain count to rule most points out
// with: the 25 squares that reach every window holding the point. Along a satin's edge they hold 8-12 hits, and
// that is all the reckoning nearly every point of a design needs: looking through the 1 mm cells' own hits for
// each one made a busy design a fifth slower to build. Outside it, a point is reckoned the long way.)
export class Hits {
  constructor(hoop = null) {
    this.cells = new Map(); this.grid = new Uint16Array(20 * 20);
    this.half = hoop ? Math.ceil((Math.max(hoop.w, hoop.h) / 2 + 30) * 2) : 0;   // (half mm squares either way from the middle)
    this.side = 2 * this.half; this.fine = this.half ? new Uint8Array(this.side * this.side) : null;
  }
  clear() { this.cells = new Map(); if (this.fine) this.fine.fill(0); }
  key(cx, cy) { return (cx + 4096) * 8192 + cy + 4096; }
  add(X, Y) {
    const k = this.key(Math.floor(X / 10), Math.floor(Y / 10));
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = []));
    c.push(X, Y);
    if (this.fine) {
      const fx = Math.floor(X / 5) + this.half, fy = Math.floor(Y / 5) + this.half;
      if (fx >= 0 && fy >= 0 && fx < this.side && fy < this.side) { const j = fy * this.side + fx; if (this.fine[j] < 255) this.fine[j]++; }
    }
  }
  top(X, Y, under = Infinity) {
    if (this.fine && under > 0 && under < 200) {
      // (the half mm squares from 0.9 mm before the point to 0.9 mm after)
      const ax = Math.floor((X - 9) / 5) + this.half, bx = Math.floor((X + 9) / 5) + this.half, ay = Math.floor((Y - 9) / 5) + this.half, by = Math.floor((Y + 9) / 5) + this.half;
      if (ax >= 0 && ay >= 0 && bx < this.side && by < this.side) {
        let n = 1;
        for (let y = ay; y <= by; y++) { const row = y * this.side; for (let x = ax; x <= bx; x++) n += this.fine[row + x]; }
        if (n <= under) return n;
      }
    }
    const x0 = Math.floor((X - 9) / 10), x1 = Math.floor((X + 9) / 10), y0 = Math.floor((Y - 9) / 10), y1 = Math.floor((Y + 9) / 10);
    const near = [];
    let n = 1;
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const c = this.cells.get(this.key(cx, cy)); if (c) { near.push(c); n += c.length / 2; } }
    if (n <= under) return n;
    // every window holding (X, Y): its corner 0-9 back from the point each way; the hits within 9 of it, summed
    // from the top left, then four reads a window
    // (first the hits within 0.9 mm either way, all a window holding the point can reach: few enough, and that is
    // the answer too; only then window by window. Along a satin's edge the cells round a point hold 30-50 hits and
    // the windows 6-10, and counting every window for every point made a busy design a half slower to build.)
    let m = 1;
    for (const c of near) for (let i = 0; i < c.length; i += 2) { const dx = c[i] - X, dy = c[i + 1] - Y; if (dx >= -9 && dx <= 9 && dy >= -9 && dy <= 9) m++; }
    if (m <= under) return m;
    const g = this.grid; g.fill(0);
    for (const c of near) for (let i = 0; i < c.length; i += 2) { const dx = c[i] - X, dy = c[i + 1] - Y; if (dx >= -9 && dx <= 9 && dy >= -9 && dy <= 9) g[(dy + 10) * 20 + dx + 10]++; }
    for (let y = 1; y < 20; y++) for (let x = 1; x < 20; x++) g[y * 20 + x] += g[y * 20 + x - 1] + g[(y - 1) * 20 + x] - g[(y - 1) * 20 + x - 1];
    let top = 0;
    for (let oy = 0; oy < 10; oy++) for (let ox = 0; ox < 10; ox++) {
      const m = g[(oy + 10) * 20 + ox + 10] - g[oy * 20 + ox + 10] - g[(oy + 10) * 20 + ox] + g[oy * 20 + ox];
      if (m > top) top = m;
    }
    return top + 1;
  }
}
