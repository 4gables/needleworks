// Quilting inside a frame, around everything else on it: stipple (a meander that never crosses itself) or echo
// (lines following the free space's edges, like ripples). mm, y down; built on a 4 px/mm mask of the free space.
import { resample, run, smooth } from "../core/geom.js";
import { distanceTransform } from "../core/raster.js";

const RES = 4;

// free space: inside `edge` (closed polygon) by `inset` mm, at least `clear` mm from every point of `obstacles`
function freeMask(edge, obstacles, inset, clear) {
  const xs = edge.map((p) => p[0]), ys = edge.map((p) => p[1]);
  const x0 = Math.min(...xs) - 1, y0 = Math.min(...ys) - 1;
  const w = Math.ceil((Math.max(...xs) - x0 + 1) * RES), h = Math.ceil((Math.max(...ys) - y0 + 1) * RES);
  const m = { w, h, data: new Uint8Array(w * h) };
  for (let y = 0; y < h; y++) {
    const Y = y0 + (y + 0.5) / RES, cut = [];
    for (let i = 0; i < edge.length; i++) {
      const [ax, ay] = edge[i], [bx, by] = edge[(i + 1) % edge.length];
      if ((ay <= Y) !== (by <= Y)) cut.push(ax + ((Y - ay) * (bx - ax)) / (by - ay));
    }
    cut.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cut.length; k += 2)
      for (let x = Math.max(0, Math.ceil((cut[k] - x0) * RES - 0.5)); x < Math.min(w, Math.floor((cut[k + 1] - x0) * RES - 0.5) + 1); x++) m.data[y * w + x] = 1;
  }
  const dt = distanceTransform(m);
  for (let i = 0; i < w * h; i++) if (dt[i] <= inset * RES) m.data[i] = 0;
  const r = Math.round(clear * RES), disc = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) disc.push([dx, dy]);
  const stamp = (x, y) => {
    const X = Math.round((x - x0) * RES), Y = Math.round((y - y0) * RES);
    for (const [dx, dy] of disc) { const u = X + dx, v = Y + dy; if (u >= 0 && v >= 0 && u < w && v < h) m.data[v * w + u] = 0; }
  };
  for (const p of obstacles) for (let i = 0; i < p.length; i++) {
    if (!i) { stamp(...p[0]); continue; }
    const [ax, ay] = p[i - 1], [bx, by] = p[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (clear / 2)));
    for (let k = 1; k <= n; k++) stamp(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
  }
  return { m, x0, y0, toMm: ([x, y]) => [x0 + x / RES, y0 + y / RES] };
}

// a fixed seed, so the meander doesn't change while the design is being edited
function rng(seed = 7) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Stipple: free `cell` mm squares, a random spanning tree over them, and the closed path that walks round the tree
// through the 2 x 2 sub-cells (every sub-cell once, never crossing), rounded off into a meander.
export function stipple(edge, obstacles, { cell = 7, inset = 4, clear = 2.5 } = {}) {
  const { m, toMm } = freeMask(edge, obstacles, inset, clear), c = cell * RES;
  const gw = Math.floor(m.w / c), gh = Math.floor(m.h / c), ok = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    let all = true;
    for (const fy of [0.1, 0.5, 0.9]) for (const fx of [0.1, 0.5, 0.9]) if (!m.data[Math.floor((j + fy) * c) * m.w + Math.floor((i + fx) * c)]) all = false;
    ok[j * gw + i] = all ? 1 : 0;
  }
  const rand = rng(), seen = new Uint8Array(gw * gh), tree = new Set(), out = [];
  const nb = (k) => { const i = k % gw, j = (k - i) / gw; return [i > 0 ? k - 1 : -1, i < gw - 1 ? k + 1 : -1, j > 0 ? k - gw : -1, j < gh - 1 ? k + gw : -1].filter((q) => q >= 0 && ok[q]); };
  for (let s = 0; s < gw * gh; s++) {
    if (!ok[s] || seen[s]) continue;
    // random depth-first tree over this patch of free cells
    const stack = [s], cells = [s]; seen[s] = 1;
    while (stack.length) {
      const k = stack[stack.length - 1], next = nb(k).filter((q) => !seen[q]);
      if (!next.length) { stack.pop(); continue; }
      const q = next[Math.floor(rand() * next.length)];
      seen[q] = 1; tree.add(Math.min(k, q) + "," + Math.max(k, q)); stack.push(q); cells.push(q);
    }
    if (cells.length < 2) continue;
    // sub-cell links: round each cell's ring except where the tree leaves it, and across every tree edge
    const link = new Map(), add = (a, b) => { (link.get(a) || link.set(a, []).get(a)).push(b); (link.get(b) || link.set(b, []).get(b)).push(a); };
    const id = (x, y) => y * (2 * gw) + x, has = (a, b) => tree.has(Math.min(a, b) + "," + Math.max(a, b));
    for (const k of cells) {
      const i = k % gw, j = (k - i) / gw, X = 2 * i, Y = 2 * j;
      if (!(j > 0 && has(k, k - gw))) add(id(X, Y), id(X + 1, Y)); else add(id(X, Y), id(X, Y - 1)), add(id(X + 1, Y), id(X + 1, Y - 1));
      if (!(j < gh - 1 && has(k, k + gw))) add(id(X, Y + 1), id(X + 1, Y + 1));
      if (!(i > 0 && has(k, k - 1))) add(id(X, Y), id(X, Y + 1)); else add(id(X, Y), id(X - 1, Y)), add(id(X, Y + 1), id(X - 1, Y + 1));
      if (!(i < gw - 1 && has(k, k + 1))) add(id(X + 1, Y), id(X + 1, Y + 1));
    }
    const start = id(2 * (s % gw), 2 * Math.floor(s / gw)), loop = [start];
    let prev = -1, cur = start;
    for (;;) { const nx = link.get(cur).find((q) => q !== prev); if (nx === start || nx == null) break; loop.push(nx); prev = cur; cur = nx; }
    // sub-cell centres nudged a little at random, then 1 mm points averaged over ~7 mm: the grid's straight runs and
    // square turns become a meander (lines stay half a cell apart, so it still never crosses itself)
    const j = c / 2 * 0.22, pts = loop.map((q) => toMm([((q % (2 * gw)) + 0.5) * (c / 2) + (rand() - 0.5) * j, (Math.floor(q / (2 * gw)) + 0.5) * (c / 2) + (rand() - 0.5) * j]));
    out.push(run(smooth(resample(pts, 1, true), 7, true), 2.5, true));
  }
  return out.map((p) => [...p, p[0]]);
}

// Echo: lines `gap` mm apart following the free space's edges (round the lettering and inside the frame), each a
// closed loop; marching squares on the distance field
export function echo(edge, obstacles, { gap = 4, inset = 4, clear = 2.5 } = {}) {
  const { m, toMm } = freeMask(edge, obstacles, inset, clear), dt = distanceTransform(m), out = [];
  for (let d = gap / 2; ; d += gap) {
    const t = { w: m.w, h: m.h, data: new Uint8Array(m.w * m.h) };
    let any = false;
    for (let i = 0; i < t.data.length; i++) if (dt[i] > d * RES) { t.data[i] = 1; any = true; }
    if (!any) break;
    for (const loop of contours(t)) if (loop.length > 12) out.push(run(smooth(loop.map(toMm), 2, true), 2.5, true));
  }
  return out.map((p) => [...p, p[0]]);
}

// outlines of a 0/1 mask (pixel corners), linked into closed loops
function contours(mask) {
  const { w, h, data } = mask, at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x];
  // (numeric keys: a Map keeps insertion order either way, and strings were a quarter of the time)
  const next = new Map(), H = 2 * h + 8, key = (x, y) => (x * 2 + 4) * H + y * 2 + 4, add = (p, q) => next.set(key(...p), [q, key(...q)]);
  for (let y = -1; y < h; y++) for (let x = -1; x < w; x++) {
    const T = [x + 1, y + 0.5], R = [x + 1.5, y + 1], B = [x + 1, y + 1.5], L = [x + 0.5, y + 1];
    switch ((at(x, y) ? 8 : 0) | (at(x + 1, y) ? 4 : 0) | (at(x + 1, y + 1) ? 2 : 0) | (at(x, y + 1) ? 1 : 0)) {
      case 1: add(B, L); break; case 2: add(R, B); break; case 3: add(R, L); break; case 4: add(T, R); break;
      case 5: add(T, L); add(B, R); break; case 6: add(T, B); break; case 7: add(T, L); break; case 8: add(L, T); break;
      case 9: add(B, T); break; case 10: add(L, B); add(R, T); break; case 11: add(R, T); break; case 12: add(L, R); break;
      case 13: add(B, R); break; case 14: add(L, B); break;
    }
  }
  const loops = [], seen = new Set();
  for (const [k0] of next) {
    if (seen.has(k0)) continue;
    const loop = [];
    let k = k0, [q, kq] = next.get(k0);
    while (!seen.has(k)) { seen.add(k); loop.push(q); k = kq; const n = next.get(k); if (!n) break; [q, kq] = n; }
    loops.push(loop);
  }
  return loops;
}

export const QUILTS = { none: "None", stipple: "Stipple", echo: "Echo" };
