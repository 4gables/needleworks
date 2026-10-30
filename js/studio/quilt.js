// Quilting inside a frame, around everything else on it: stipple (a meander that never crosses itself) or echo
// (rings round the pieces that turn into the frame's shape). mm, y down; built on a 4 px/mm mask of the free space.
import { followRun, resample, smooth } from "../core/geom.js";
import { distanceTransform } from "../core/raster.js";

const RES = 4, STRAIGHT = 0.15, SEED = 1.2;

// free space: inside `edge` (closed polygon) by `inset` mm, at least `clear` mm from every point of `obstacles`.
// Also returns each pixel's distance (px) from the frame's edge (`dtA`) and from the nearest obstacle (`dtB`).
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
  const dtA = distanceTransform(m), ob = { w, h, data: new Uint8Array(w * h).fill(1) };
  const stamp = (x, y) => {
    const X = Math.round((x - x0) * RES - 0.5), Y = Math.round((y - y0) * RES - 0.5);
    if (X >= 0 && Y >= 0 && X < w && Y < h) ob.data[Y * w + X] = 0;
  };
  for (const p of obstacles) for (let i = 0; i < p.length; i++) {
    if (!i) { stamp(...p[0]); continue; }
    const [ax, ay] = p[i - 1], [bx, by] = p[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * RES));
    for (let k = 1; k <= n; k++) stamp(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
  }
  const dtB = distanceTransform(ob);
  for (let i = 0; i < w * h; i++) if (dtA[i] <= inset * RES || dtB[i] <= clear * RES) m.data[i] = 0;
  return { m, dtA, dtB, x0, y0, toMm: ([x, y]) => [x0 + (x + 0.5) / RES, y0 + (y + 0.5) / RES] };
}

// bilinear sample of a per-pixel field at a point in mm
function sampler(F, field) {
  const { m: { w, h }, x0, y0 } = F;
  return (x, y) => {
    const u = Math.min(w - 1.001, Math.max(0, (x - x0) * RES - 0.5)), v = Math.min(h - 1.001, Math.max(0, (y - y0) * RES - 0.5));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * w + i;
    return (field[k] * (1 - fu) + field[k + 1] * fu) * (1 - fv) + (field[k + w] * (1 - fu) + field[k + w + 1] * fu) * fv;
  };
}

// a fixed seed, so the meander doesn't change while the design is being edited
function rng(seed = 7) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Stipple: lines about `space` mm apart. Seeded by free SEED x `space` mm squares, a random spanning tree over them and
// the closed path that walks round the tree through the 2 x 2 sub-cells (every sub-cell once, never crossing), then
// relaxed into a smooth meander (`relax`). (Averaging the grid walk's points left a maze of sharp V points where its
// dead ends turned, and the cells near the lettering and the frame's curves stayed empty.)
export function stipple(edge, obstacles, { space = 5, inset = 4, clear = 2.5 } = {}) {
  const F = freeMask(edge, obstacles, inset, clear), { m, toMm } = F, c = SEED * space * RES, seeds = [];
  const gw = Math.floor(m.w / c), gh = Math.floor(m.h / c), ok = new Uint8Array(gw * gh), ox = (m.w - gw * c) / 2, oy = (m.h - gh * c) / 2;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    let all = true;
    for (const fy of [0.25, 0.75]) for (const fx of [0.25, 0.75]) if (!m.data[Math.floor(oy + (j + fy) * c) * m.w + Math.floor(ox + (i + fx) * c)]) all = false;
    ok[j * gw + i] = all ? 1 : 0;
  }
  const rand = rng(), seen = new Uint8Array(gw * gh), tree = new Set();
  const nb = (k) => { const i = k % gw, j = (k - i) / gw; return [i > 0 ? k - 1 : -1, i < gw - 1 ? k + 1 : -1, j > 0 ? k - gw : -1, j < gh - 1 ? k + gw : -1].filter((q) => q >= 0 && ok[q]); };
  for (let s = 0; s < gw * gh; s++) {
    if (!ok[s] || seen[s]) continue;
    // random depth-first tree over this patch of free cells that would rather turn than go straight on (STRAIGHT is
    // the odds against carrying on): long straight corridors sewed as a maze, not a meander
    const stack = [s], cells = [s], from = new Map(); seen[s] = 1;
    while (stack.length) {
      const k = stack[stack.length - 1], next = nb(k).filter((q) => !seen[q]);
      if (!next.length) { stack.pop(); continue; }
      const back = from.get(k), wt = next.map((q) => (back != null && q - k === k - back ? STRAIGHT : 1));
      let r = rand() * wt.reduce((a, b) => a + b, 0), qi = 0;
      while (qi < next.length - 1 && (r -= wt[qi]) > 0) qi++;
      const q = next[qi]; from.set(q, k);
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
    const j = c / 2 * 0.2;
    seeds.push(loop.map((q) => toMm([ox + ((q % (2 * gw)) + 0.5) * (c / 2) - 0.5 + (rand() - 0.5) * j, oy + (Math.floor(q / (2 * gw)) + 0.5) * (c / 2) - 0.5 + (rand() - 0.5) * j])));
  }
  // (a loop under 8 spaces long is a lone blob in a corner: not worth a trim)
  return relax(seeds, F, space).filter((p) => p.length * STEP >= 8 * space).map((p) => followRun([...p, p[0]], 2.5, 0.15, 1.2));
}

// The tree walk relaxed into a meander: points STEP mm apart along each loop are pushed apart from any other part of
// the line closer than `space` mm and kept `space`/2 from the edge of the free space; a bending term rounds every
// turn, and where a point has room (nothing within `space`) the line grows outward, so it buckles into lobes that
// fill what the tree's grid left empty. No point moves more than 0.25 mm a round, so lines can't pass through each other.
const STEP = 1.2, BEND = 0.6, GROW = 0.3, WIDE = 3, PUSH = 0.15, CALM = 15;
function relax(loops, F, space, rounds = 600) {
  const dist = sampler(F, distanceTransform(F.m).map((d) => d / RES)), free = sampler(F, F.m.data);
  const R = space, M = space / 2, skip = Math.ceil((1.7 * R) / STEP);
  const gw = Math.ceil(F.m.w / RES / R) + 2, gh = Math.ceil(F.m.h / RES / R) + 2, head = new Int32Array(gw * gh);
  let last = 0, calm = -1;
  for (let it = 0; it < rounds; it++) {
    if (calm < 0 && it >= rounds - CALM) calm = it;
    if (calm >= 0 && it >= calm + CALM) break;
    loops = loops.map((p) => resample(p, STEP, true));
    const N = loops.reduce((a, p) => a + p.length, 0), X = new Float64Array(N), Y = new Float64Array(N), L = new Int32Array(N), I = new Int32Array(N), nxt = new Int32Array(N);
    head.fill(-1);
    let k = 0;
    loops.forEach((p, li) => p.forEach(([x, y], i) => {
      X[k] = x; Y[k] = y; L[k] = li; I[k] = i;
      const c = (Math.floor((y - F.y0) / R) + 1) * gw + Math.floor((x - F.x0) / R) + 1;
      nxt[k] = head[c]; head[c] = k++;
    }));
    loops = loops.map((p, li) => {
      const n = p.length;
      return p.map((q, i) => {
        const a = p[(i - 1 + n) % n], b = p[(i + 1) % n], a2 = p[(i - 2 + n) % n], b2 = p[(i + 2) % n], aw = p[(i - WIDE + n) % n], bw = p[(i + WIDE) % n];
        let fx = 0, fy = 0, room = R;
        const gx = Math.floor((q[0] - F.x0) / R) + 1, gy = Math.floor((q[1] - F.y0) / R) + 1;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (let t = head[(gy + dy) * gw + gx + dx]; t >= 0; t = nxt[t]) {
          if (L[t] === li) { const d = Math.abs(i - I[t]); if (Math.min(d, n - d) < skip) continue; }
          const ex = q[0] - X[t], ey = q[1] - Y[t], d = Math.hypot(ex, ey);
          if (d >= R) continue;
          if (d < room) room = d;
          const f = (PUSH * (1 - d / R)) / d; fx += ex * f; fy += ey * f;
        }
        const e = dist(q[0], q[1]);
        if (e < M) {
          room = Math.min(room, 2 * e);
          const gxs = dist(q[0] + 0.25, q[1]) - dist(q[0] - 0.25, q[1]), gys = dist(q[0], q[1] + 0.25) - dist(q[0], q[1] - 0.25), g = Math.hypot(gxs, gys) || 1;
          fx += (0.4 * (M - e) * gxs) / g; fy += (0.4 * (M - e) * gys) / g;
        }
        // bending (the -1 4 -6 4 -1 stencil) and, with room, growth (away from the neighbours' midpoint)
        const pull = calm < 0 && room >= R * 0.98 ? -GROW : 0, ux = q[0] - (aw[0] + bw[0]) / 2, uy = q[1] - (aw[1] + bw[1]) / 2;
        fx += (BEND * (-a2[0] + 4 * a[0] - 6 * q[0] + 4 * b[0] - b2[0])) / 6 - pull * ux;
        fy += (BEND * (-a2[1] + 4 * a[1] - 6 * q[1] + 4 * b[1] - b2[1])) / 6 - pull * uy;
        const f = Math.hypot(fx, fy), s = f > 0.25 ? 0.25 / f : 1, nx = q[0] + fx * s, ny = q[1] + fy * s;
        return free(nx, ny) > 0.5 || free(nx, ny) >= free(q[0], q[1]) ? [nx, ny] : q;
      });
    });
    // grown: the line got under 0.2% longer in the last 25 rounds
    if (calm < 0 && it % 25 === 0) {
      const len = loops.reduce((a, p) => a + p.reduce((a, q, i) => a + Math.hypot(q[0] - p[(i + 1) % p.length][0], q[1] - p[(i + 1) % p.length][1]), 0), 0);
      if (Math.abs(len - last) < len * 0.002) calm = it;
      last = len;
    }
  }
  return loops.map((p) => smooth(resample(p, STEP, true), 3, true));
}

// Echo: rings round what's on the frame that turn gradually into the frame's own shape. Each free pixel gets
// f = a / (a + b), a its distance (mm) out from the clearance round the pieces and b in from the frame's inset edge, so f
// runs from 0 at the pieces to 1 at the frame; the rings are its levels, as many as fit about `gap` mm apart across the
// typical width. (Rings at fixed distances from the nearest edge met in a crease where the frame's square rings
// turned into the lettering's round ones, and left little islands in the corners.) Where the space is too narrow for
// every ring (lettering near the frame) the rings would bunch up, so they stop short of it: there they're arcs.
// With nothing on the frame the rings follow the frame inward, `gap` mm apart. Sewn as spirals (`chain`).
export function echo(edge, obstacles, { gap = 4, inset = 4, clear = 2.5 } = {}) {
  const F = freeMask(edge, obstacles, inset, clear), { m, dtA, dtB, toMm, x0, y0 } = F, N = m.w * m.h;
  const A = new Float32Array(N), B = new Float32Array(N), widths = [];
  let deep = 0;
  for (let i = 0; i < N; i++) {
    A[i] = dtB[i] / RES - clear; B[i] = dtA[i] / RES - inset;
    if (m.data[i]) { widths.push(A[i] + B[i]); deep = Math.max(deep, B[i]); }
  }
  if (!widths.length) return [];
  widths.sort((x, y) => x - y);
  const W = widths[Math.floor(widths.length * PCT)], around = widths[widths.length >> 1] < 1e6, rings = [];
  // (with nothing on the frame A is huge everywhere, and the levels are distances in from the frame)
  const n = around ? Math.max(1, Math.round(W / gap)) : Math.floor(deep / gap + 0.5);
  const narrow = ([x, y]) => {
    if (!around) return false;
    const i = Math.min(m.h - 1, Math.max(0, Math.round((y - y0) * RES - 0.5))) * m.w + Math.min(m.w - 1, Math.max(0, Math.round((x - x0) * RES - 0.5)));
    return (A[i] + B[i]) / n < NARROW * gap;
  };
  for (let k = 0; k < n; k++) {
    const L = around ? (k + 0.5) / n : (k + 0.5) * gap, t = { w: m.w, h: m.h, data: new Uint8Array(N) };
    for (let i = 0; i < N; i++) {
      if (B[i] <= 0) continue;
      t.data[i] = around ? (A[i] <= 0 || A[i] / (A[i] + B[i]) < L ? 1 : 0) : (B[i] > L ? 1 : 0);
    }
    const level = around ? k : n - 1 - k;
    for (const loop of contours(t)) {
      let p = smooth(smooth(resample(loop.map(toMm), 0.5, true), 7, true), 7, true);
      if (Math.abs(area(p)) < 3 * gap * gap) continue;
      if (area(p) < 0) p = p.reverse();
      const cut = p.findIndex(narrow);
      if (cut < 0) { rings.push({ p, level, closed: true }); continue; }
      // cut where it's narrow: the rest are arcs
      p = [...p.slice(cut), ...p.slice(0, cut)];
      let arc = [];
      for (const q of [...p, p[0]]) {
        if (!narrow(q)) { arc.push(q); continue; }
        if (arc.length * 0.5 >= 2 * gap) rings.push({ p: arc, level, closed: false });
        arc = [];
      }
    }
  }
  return chain(rings, gap).map((p) => followRun(p, 2.5, 0.15, 1.2));
}
const NARROW = 0.5, PCT = 0.3;

const area = (p) => p.reduce((s, [x, y], i) => { const [u, v] = p[(i + 1) % p.length]; return s + x * v - u * y; }, 0) / 2;

// Rings (innermost first) sewn as spirals: the last stretch of each ring glides over to the next ring out, arriving
// beside where this ring started, so there's no step across the rings. Arcs are sewn end to end with a short step
// between them; a ring or arc that can only be reached across another one starts a new line.
function chain(rings, gap) {
  const segs = [];
  rings.forEach((r, ri) => r.p.forEach((q, i) => { if (r.closed || i + 1 < r.p.length) segs.push([ri, q, r.p[(i + 1) % r.p.length]]); }));
  const crosses = (P, Q, skip) => segs.some(([ri, a, b]) => !skip.includes(ri) && meet(P, Q, a, b));
  const left = rings.map((r, i) => i).sort((x, y) => rings[x].level - rings[y].level), out = [];
  let line = null, cur = -1, s = 0, short = 0;
  const near = (ri, at) => {   // nearest point of a ring (any point) or an arc (its ends)
    const p = rings[ri].p, ks = rings[ri].closed ? p.keys() : [0, p.length - 1];
    let bk = 0, bd = Infinity;
    for (const k of ks) { const d = Math.hypot(p[k][0] - at[0], p[k][1] - at[1]); if (d < bd) { bd = d; bk = k; } }
    return [bk, bd];
  };
  while (left.length || cur >= 0) {
    if (cur < 0) {
      cur = left.shift(); const p = rings[cur].p;
      s = rings[cur].closed ? p.reduce((best, q, i) => (q[1] > p[best][1] ? i : best), 0) : 0;   // start at the bottom
      out.push((line = [])); short = 0;
    }
    const r = rings[cur], p = r.p, n = p.length;
    // where this one ends: a ring back where it started, an arc at its far end
    const at = r.closed ? p[s] : p[s ? 0 : n - 1];
    let next = -1, nk = 0, nd = Infinity, gl = 0;
    for (const want of [r.level + 1, null]) {
      for (const ri of left) {
        if (want != null && rings[ri].level !== want) continue;
        const [k, d] = near(ri, at);
        if (d < nd) { next = ri; nk = k; nd = d; }
      }
      if (nd <= 2.5 * gap) break;
    }
    if (next >= 0 && (nd > 2.5 * gap || crosses(at, rings[next].p[nk], [cur, next]))) next = -1;
    if (r.closed && next >= 0 && rings[next].closed && rings[next].level === r.level + 1) {
      // all but the last stretch, then glide out to the next ring, landing on its point nk
      const o = rings[next].p, on = o.length, g = (gl = Math.round(Math.min(3 * gap, n * 0.5 * 0.3) / 0.5));
      for (let i = 0; i < n - g; i++) line.push(p[(s + i) % n]);
      for (let i = 0; i < g; i++) {
        const u = (i + 1) / g, w = u * u * (3 - 2 * u), q = p[(s + n - g + i + 1) % n], t = o[(nk - Math.round(((g - i - 1) * on) / n) + on * 4) % on];
        line.push([q[0] + (t[0] - q[0]) * w, q[1] + (t[1] - q[1]) * w]);
      }
    } else {
      // (a ring the last one glided onto stops halfway along that glide, or the two lines meet)
      if (r.closed) for (let i = 0; i <= n - short; i++) line.push(p[(s + i) % n]);
      else line.push(...(s ? [...p].reverse() : p));
      if (next < 0) { cur = -1; continue; }
    }
    short = r.closed && rings[next].closed && rings[next].level === r.level + 1 ? Math.round((gl * rings[next].p.length) / n / 2) : 0;
    left.splice(left.indexOf(next), 1);
    cur = next; s = nk;
  }
  return out.filter((l) => l.length > 1);
}

function meet(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

// outlines of a 0/1 mask (pixel corners), linked into closed loops
export function contours(mask) {
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
