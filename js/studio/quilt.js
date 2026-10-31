/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Quilting inside a frame, around everything else on it: stipple (a meander that never crosses itself) or echo
// (rings round the pieces that turn into the frame's shape). mm, y down; built on a 4 px/mm mask of the free space.
import { followRun, resample, smooth } from "../core/geom.js";
import { distanceTransform } from "../core/raster.js";

const RES = 4;

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

// Stipple: a meander about `space` mm apart that never crosses itself. Its seed is the outline of a tree: knots
// scattered at random about NODE x `space` apart (no grid, so no direction is favoured), joined by a random spanning
// tree, each knot a round lobe (the tree's leaves a bigger one) and each branch a narrower neck, outlined as one
// closed line; then `relax` evens it out without making it uniform. (Until 2026-10-30 the seed was a spanning tree
// over a grid of squares: its corridors all ran along two directions, and relaxing them to an even spacing everywhere
// sewed as a maze of parallel corridors; before that its points were only averaged, which left sharp V points.)
const NODE = 1.5, NECK = 0.32, LOBE = [0.4, 0.8], BULB = 1.4, REACH = 1.7, KNOT = 0.2, PASS = 0.13;
export function stipple(edge, obstacles, { space = 5, inset = 4, clear = 2.5 } = {}) {
  const F = freeMask(edge, obstacles, inset, clear), { m, toMm } = F, rand = rng();
  const room = sampler(F, distanceTransform(m).map((d) => d / RES)), M = space / 2, D = NODE * space;
  // knots: random darts, each kept if it's D from every knot so far and has room for a lobe
  const W = m.w / RES, H = m.h / RES, cell = D / Math.SQRT2, gw = Math.ceil(W / cell) + 1, gh = Math.ceil(H / cell) + 1;
  const grid = new Int32Array(gw * gh).fill(-1), knots = [];
  for (let t = 0, n = Math.ceil(((W * H) / (D * D)) * 60); t < n; t++) {
    const x = F.x0 + rand() * W, y = F.y0 + rand() * H, e = room(x, y) - M;
    if (e < KNOT * space) continue;
    const gx = Math.floor((x - F.x0) / cell), gy = Math.floor((y - F.y0) / cell);
    let near = false;
    for (let j = Math.max(0, gy - 2); j <= Math.min(gh - 1, gy + 2) && !near; j++) for (let i = Math.max(0, gx - 2); i <= Math.min(gw - 1, gx + 2); i++) {
      const k = grid[j * gw + i];
      if (k >= 0 && Math.hypot(knots[k].x - x, knots[k].y - y) < D) { near = true; break; }
    }
    if (near) continue;
    grid[gy * gw + gx] = knots.length;
    knots.push({ x, y, e, r: Math.min(e, space * (LOBE[0] + (LOBE[1] - LOBE[0]) * rand())), deg: 0 });
  }
  // branches: knots up to REACH x D apart with room for a neck all the way, joined at random (Kruskal on shuffled
  // lengths): a random tree has many short side branches, the lobes of a stipple
  const cand = [];
  for (let a = 0; a < knots.length; a++) for (let b = a + 1; b < knots.length; b++) {
    const A = knots[a], B = knots[b], L = Math.hypot(A.x - B.x, A.y - B.y);
    if (L > REACH * D) continue;
    let ok = true;
    for (let s = 0.5; s < L && ok; s += 0.5) if (room(A.x + ((B.x - A.x) * s) / L, A.y + ((B.y - A.y) * s) / L) - M < PASS * space) ok = false;
    if (ok) cand.push([L * (0.4 + rand()), a, b]);
  }
  cand.sort((u, v) => u[0] - v[0]);
  const up = knots.map((_, i) => i), find = (i) => (up[i] === i ? i : (up[i] = find(up[i]))), tree = [];
  for (const [, a, b] of cand) {
    const ra = find(a), rb = find(b);
    if (ra === rb) continue;
    up[ra] = rb; tree.push([a, b]); knots[a].deg++; knots[b].deg++;
  }
  for (const k of knots) if (k.deg <= 1) k.r = Math.min(k.e, k.r * BULB);
  // the tree drawn on the mask (lobes and necks), holes filled, and outlined
  const t = { w: m.w, h: m.h, data: new Uint8Array(m.w * m.h) };
  const stamp = (ax, ay, bx, by, r) => {
    const X0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - F.x0) * RES)), X1 = Math.min(m.w - 1, Math.ceil((Math.max(ax, bx) + r - F.x0) * RES));
    const Y0 = Math.max(0, Math.floor((Math.min(ay, by) - r - F.y0) * RES)), Y1 = Math.min(m.h - 1, Math.ceil((Math.max(ay, by) + r - F.y0) * RES));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    for (let py = Y0; py <= Y1; py++) for (let px = X0; px <= X1; px++) {
      const [x, y] = toMm([px, py]), u = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
      if (Math.hypot(x - ax - dx * u, y - ay - dy * u) <= r) t.data[py * m.w + px] = 1;
    }
  };
  for (const k of knots) if (k.deg) stamp(k.x, k.y, k.x, k.y, k.r);
  for (const [a, b] of tree) {
    const A = knots[a], B = knots[b];
    stamp(A.x, A.y, B.x, B.y, Math.min(A.r, B.r, space * NECK * (0.85 + 0.3 * rand())));
  }
  fillHoles(t);
  const seeds = contours(t).map((l) => resample(l.map(toMm), STEP, true)).filter((l) => Math.abs(area(l)) > 2 * space * space);
  // (a loop under 8 spaces long is a lone blob in a corner: not worth a trim)
  return relax(seeds, F, space).filter((p) => p.length * STEP >= 8 * space).map((p) => followRun([...p, p[0]], 2.5, 0.15, 1.2));
}

// background a flood from the border can't reach becomes foreground
function fillHoles(t) {
  const { w, h, data } = t, seen = new Uint8Array(w * h), stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    if (seen[i] || data[i]) continue;
    seen[i] = 1;
    const x = i % w;
    if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1); if (i >= w) stack.push(i - w); if (i < w * (h - 1)) stack.push(i + w);
  }
  for (let i = 0; i < w * h; i++) if (!data[i] && !seen[i]) data[i] = 1;
}

// The tree's outline relaxed into a meander: points STEP mm apart along each loop are pushed apart from any other part
// of the line closer than `space` mm and kept `space`/2 from the edge of the free space; a bending term rounds every
// turn, and where a point has room (nothing within `space`) the line grows outward, so it buckles into lobes that
// fill what the knots left empty. It stops growing within EDGE x `space` of the free space's edge: lobes pressed
// against the frame flattened into one line running along it. No point moves more than 0.25 mm a round, so lines
// can't pass through each other.
const STEP = 1.2, BEND = 0.6, GROW = 0.3, WIDE = 3, PUSH = 0.15, CALM = 15, EDGE = 0.9;
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
        if (e < EDGE * R) room = Math.min(room, e);
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
