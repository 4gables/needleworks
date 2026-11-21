/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// A flat picture traced to smooth outlines before any stitch is planned (docs/zigzag-trace-spec.md, clean room; the
// methods are the papers', written here from them):
// - every pixel read as a blend of the picture's colours, white and see-through (spec 3.4);
// - each colour's share upsampled by cubic B-spline interpolation (Unser, Aldroubi and Eden 1993, "B-spline signal
//   processing"; the recursive prefilter of Thevenaz, Blu and Unser 2000, "Interpolation revisited");
// - a colour's edge where it is exactly as present as its strongest rival (spec 3.8), found by marching squares
//   (Lorensen and Cline 1987), so two neighbouring colours share one edge and it sits between pixels;
// - specks and small holes dropped by area, never by width (spec 3.9): a thin stroke or a small letter stays;
// - white never a colour: it is fabric, and a colour keeps its holes (spec 3.10); see-through areas the design closes
//   round are white too (spec 3.7);
// - each outline smoothed between its corners, the corners kept (spec 3.12's intent; Gaussian smoothing along the
//   loop and the Ramer-Douglas-Peucker simplification, 1972-73).
// Lengths: source pixels (px), working pixels (wpx: the picture averaged down to at most 1024 a side), mm at the end.

export const TRACE = {
  side: 1024,        // wpx: the working copy's longest side (spec 3.1)
  white: 245,        // a colour with every channel at least this is white, never a thread (spec 3.2)
  solid: 20,         // a pixel votes for the palette when its 3 x 3 neighbourhood varies less than this (spec 3.2)
  merge: 20,         // palette colours closer than this (RGB) are one (spec 3.2)
  noise: 0.001,      // a palette colour with fewer of the votes than this is noise (spec 3.2)
  k: 8,              // the most colours looked for (spec 3.2)
  same: 4 / 255,     // a pixel this near a class is that class (spec 3.4)
  pair: 0.0004,      // the price of explaining a pixel as two classes, not one (spec 3.4)
  fine: 6e6,         // fine samples aimed at when upsampling; the factor is held to 2..8 (spec 3.8)
  pad: 3,            // wpx of see-through round the picture so every outline closes (spec 3.8)
  speck: 1,          // mm: an area under speck² mm² is dropped, a hole under it filled (spec 3.9)
  sigma: 0.5,        // wpx: smoothing along an outline between corners (spec 3.12)
  corner: 62.5,      // degrees: a turn this sharp over about 0.7 wpx is a corner, kept (spec 3.12)
  tol: 0.06,         // wpx: what simplifying may move a point
};

const lin = (v) => v / 255;
// k-means++ seeding (Arthur and Vassilvitskii 2007) from a fixed seed, then Lloyd's iterations
function kmeans(pts, k, iters = 30, seed = 7) {
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const C = [pts[Math.floor(rnd() * pts.length)].slice()];
  while (C.length < k) {
    const D = pts.map((p) => Math.min(...C.map((c) => d2(p, c)))), tot = D.reduce((a, b) => a + b, 0);
    if (!tot) break;
    let r = rnd() * tot, i = 0;
    while ((r -= D[i]) > 0 && i < D.length - 1) i++;
    C.push(pts[i].slice());
  }
  let n = [];
  for (let it = 0; it < iters; it++) {
    const sum = C.map(() => [0, 0, 0]); n = C.map(() => 0);
    for (const p of pts) {
      let b = 0, bd = Infinity;
      for (let j = 0; j < C.length; j++) { const d = d2(p, C[j]); if (d < bd) { bd = d; b = j; } }
      sum[b][0] += p[0]; sum[b][1] += p[1]; sum[b][2] += p[2]; n[b]++;
    }
    for (let j = 0; j < C.length; j++) if (n[j]) C[j] = sum[j].map((v) => v / n[j]);
  }
  return C.map((c, j) => ({ c, n: n[j] }));
}

// The working copy (spec 3.1): premultiplied RGBA 0..1, averaged down by a whole factor f
function working(rgba, W, H) {
  const f = Math.max(1, Math.ceil(Math.max(W, H) / TRACE.side)), w = Math.ceil(W / f), h = Math.ceil(H / f);
  const P = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = y * f; yy < Math.min(H, y * f + f); yy++) for (let xx = x * f; xx < Math.min(W, x * f + f); xx++) {
      const i = (yy * W + xx) * 4, al = rgba[i + 3] / 255;
      r += lin(rgba[i]) * al; g += lin(rgba[i + 1]) * al; b += lin(rgba[i + 2]) * al; a += al; n++;
    }
    const o = (y * w + x) * 4; P[o] = r / n; P[o + 1] = g / n; P[o + 2] = b / n; P[o + 3] = a / n;
  }
  return { P, w, h, f };
}

// The palette (spec 3.2): solid pixels vote, k-means, noise and white dropped, near colours merged
export function palette({ P, w, h }, k = TRACE.k) {
  const votes = [];
  const at = (x, y) => (y * w + x) * 4;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let ok = true, s = [0, 0, 0], q = 0;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = at(x + dx, y + dy);
      if (P[i + 3] < 0.98) { ok = false; break; }
      for (let c = 0; c < 3; c++) { const v = (P[i + c] / P[i + 3]) * 255; s[c] += v; q += v * v; }
    }
    if (!ok) continue;
    const varc = q / 9 - (s[0] ** 2 + s[1] ** 2 + s[2] ** 2) / 81;
    if (varc < TRACE.solid) { const i = at(x, y); votes.push([0, 1, 2].map((c) => (P[i + c] / P[i + 3]) * 255)); }
  }
  if (votes.length < 2 * 20) for (let i = 0; i < w * h; i++) if (P[i * 4 + 3] > 0.9) votes.push([0, 1, 2].map((c) => (P[i * 4 + c] / P[i * 4 + 3]) * 255));
  const step = Math.max(1, Math.floor(votes.length / 20000)), pts = votes.filter((_, i) => i % step === 0);
  if (!pts.length) return [];
  let C = kmeans(pts, Math.min(k, pts.length)).filter((c) => c.n >= TRACE.noise * pts.length && !c.c.every((v) => v >= TRACE.white));
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < C.length && !merged; i++) for (let j = i + 1; j < C.length && !merged; j++) {
      if (Math.hypot(...C[i].c.map((v, t) => v - C[j].c[t])) < TRACE.merge) {
        const n = C[i].n + C[j].n; C[i] = { c: C[i].c.map((v, t) => (v * C[i].n + C[j].c[t] * C[j].n) / n), n }; C.splice(j, 1); merged = true;
      }
    }
  }
  return C.sort((a, b) => b.n - a.n).map((c) => c.c.map((v) => Math.round(v)));
}

// Unmixing (spec 3.4): each pixel as one class or the best blend of two, the classes' shares summing to 1. Classes:
// the palette's colours, then white, then see-through.
function unmix({ P, w, h }, pal) {
  const cls = [...pal.map((c) => [lin(c[0]), lin(c[1]), lin(c[2]), 1]), [1, 1, 1, 1], [0, 0, 0, 0]], K = cls.length;
  const cov = cls.map(() => new Float32Array(w * h)), memo = new Map();
  const err = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2 + (p[3] - q[3]) ** 2;
  for (let i = 0; i < w * h; i++) {
    const p = [P[i * 4], P[i * 4 + 1], P[i * 4 + 2], P[i * 4 + 3]], key = p.map((v) => Math.round(v * 255)).join();
    let best = memo.get(key);
    if (!best) {
      best = { e: Infinity, a: 0, b: 0, t: 1 };
      for (let a = 0; a < K; a++) { const e = err(p, cls[a]); if (e < best.e) best = { e, a, b: a, t: 1 }; }
      if (best.e > TRACE.same ** 2) for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) {
        const A = cls[a], B = cls[b], d = A.map((v, c) => v - B[c]), dd = d.reduce((s, v) => s + v * v, 0);
        if (!dd) continue;
        const t = Math.max(0, Math.min(1, d.reduce((s, v, c) => s + v * (p[c] - B[c]), 0) / dd));
        const e = err(p, A.map((v, c) => t * v + (1 - t) * B[c])) + TRACE.pair;
        if (e < best.e) best = { e, a, b, t };
      }
      memo.set(key, best);
    }
    cov[best.a][i] += best.t; if (best.b !== best.a) cov[best.b][i] += 1 - best.t;
  }
  return { cov, white: K - 2, clear: K - 1 };
}

// See-through areas the design closes round are white (spec 3.7): not touching the border, grown by one pixel
function knockouts(U, w, h) {
  const T = U.cov[U.clear], W = U.cov[U.white], seen = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || T[s] <= 0.2) continue;
    const q = [s], part = []; seen[s] = 1; let edge = false;
    while (q.length) {
      const i = q.pop(), x = i % w, y = (i - x) / w; part.push(i);
      if (!x || !y || x === w - 1 || y === h - 1) edge = true;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !seen[j] && T[j] > 0.2) { seen[j] = 1; q.push(j); }
    }
    if (edge) continue;
    const grown = new Set();
    for (const i of part) { const x = i % w, y = (i - x) / w; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) grown.add(Y * w + X); } }
    for (const i of grown) if (T[i] > 0.02) { W[i] += T[i]; T[i] = 0; }
  }
}

// Cubic B-spline interpolation (Unser et al.; Thevenaz et al.): the recursive prefilter with the pole sqrt(3) - 2 and
// mirror boundaries, then the cubic B-spline sampled at (i + 0.5) / u - 0.5 input samples
const Z = Math.sqrt(3) - 2;
function prefilter(s) {
  const n = s.length, c = new Float64Array(n);
  if (n === 1) { c[0] = s[0]; return c; }
  let z = 1, sum = 0;
  for (let k = 0; k < Math.min(n, 30); k++) { sum += z * s[k]; z *= Z; }
  c[0] = sum;
  for (let k = 1; k < n; k++) c[k] = s[k] + Z * c[k - 1];
  c[n - 1] = (Z / (Z * Z - 1)) * (c[n - 1] + Z * c[n - 2]);
  for (let k = n - 2; k >= 0; k--) c[k] = Z * (c[k + 1] - c[k]);
  for (let k = 0; k < n; k++) c[k] *= 6;
  return c;
}
const beta = (t) => { t = Math.abs(t); return t < 1 ? 2 / 3 - t * t + (t * t * t) / 2 : t < 2 ? (2 - t) ** 3 / 6 : 0; };
function upsample1(c, u) {
  const n = c.length, m = n * u, out = new Float64Array(m), mir = (j) => (j < 0 ? -j : j >= n ? 2 * n - 2 - j : j);
  for (let i = 0; i < m; i++) {
    const x = (i + 0.5) / u - 0.5, j0 = Math.floor(x);
    let v = 0;
    for (let j = j0 - 1; j <= j0 + 2; j++) v += c[Math.max(0, Math.min(n - 1, mir(j)))] * beta(x - j);
    out[i] = v;
  }
  return out;
}
function upsample(plane, w, h, u) {
  const W = w * u, H = h * u, rows = new Float64Array(W * h), out = new Float32Array(W * H);
  for (let y = 0; y < h; y++) rows.set(upsample1(prefilter(plane.subarray(y * w, y * w + w)), u), y * W);
  const col = new Float64Array(h);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < h; y++) col[y] = rows[y * W + x];
    const o = upsample1(prefilter(col), u);
    for (let y = 0; y < H; y++) out[y * W + x] = Math.max(0, Math.min(1, o[y]));
  }
  return out;
}

// Marching squares at level 0 on a field (Lorensen and Cline 1987): closed loops, each turned so the positive side
// is on its left (y down); a saddle is decided by the mean of its four corners
function contours(F, W, H) {
  const link = new Map(), pt = new Map();
  const key = (x, y, hz) => (hz ? 2 : 1) * 1e9 + y * W + x;
  const cross = (x, y, hz) => {
    const k = key(x, y, hz);
    if (!pt.has(k)) {
      const a = F[y * W + x], b = hz ? F[y * W + x + 1] : F[(y + 1) * W + x], t = a / (a - b);
      pt.set(k, hz ? [x + t, y] : [x, y + t]);
    }
    return k;
  };
  const add = (p, q) => { (link.get(p) || link.set(p, []).get(p)).push(q); (link.get(q) || link.set(q, []).get(q)).push(p); };
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const a = F[y * W + x] > 0, b = F[y * W + x + 1] > 0, c = F[(y + 1) * W + x + 1] > 0, d = F[(y + 1) * W + x] > 0;
    const n = a + b + c + d;
    if (n === 0 || n === 4) continue;
    const top = a !== b ? cross(x, y, true) : null, right = b !== c ? cross(x + 1, y, false) : null;
    const bottom = d !== c ? cross(x, y + 1, true) : null, left = a !== d ? cross(x, y, false) : null;
    const es = [top, right, bottom, left].filter((e) => e !== null);
    if (es.length === 2) add(es[0], es[1]);
    else {
      const mid = (F[y * W + x] + F[y * W + x + 1] + F[(y + 1) * W + x + 1] + F[(y + 1) * W + x]) / 4 > 0;
      // a saddle: the middle joins the two corners that share its side; the other two are each cut off
      // (corner b sits between the top and right edges, d between the bottom and left, a top-left, c right-bottom)
      if (a === mid) { add(top, right); add(bottom, left); } else { add(top, left); add(right, bottom); }
    }
  }
  const loops = [], done = new Set();
  for (const s of link.keys()) {
    if (done.has(s)) continue;
    const loop = [s]; done.add(s); let prev = s, cur = link.get(s)[0];
    while (cur !== undefined && cur !== s) {
      loop.push(cur); done.add(cur);
      const nb = link.get(cur), next = nb[0] === prev ? nb[1] : nb[0];
      prev = cur; cur = next;
    }
    if (loop.length < 3) continue;
    let l = loop.map((k) => pt.get(k));
    // turn it so the field is positive on the left: probe beside the first edge's middle
    const [p, q] = [l[0], l[1]], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1;
    // (y down: the left of a step (dx, dy) is (dy, -dx))
    const lx = Math.round(mx + (0.35 * dy) / L), ly = Math.round(my - (0.35 * dx) / L);
    const f = lx >= 0 && ly >= 0 && lx < W && ly < H ? F[ly * W + lx] : -1;
    if (f <= 0) l = l.reverse();
    loops.push(l);
  }
  return loops;
}

const area = (l) => { let s = 0; for (let i = 0; i < l.length; i++) { const [ax, ay] = l[i], [bx, by] = l[(i + 1) % l.length]; s += ax * by - bx * ay; } return s / 2; };
function inside([x, y], l) {
  let c = false;
  for (let i = 0, j = l.length - 1; i < l.length; j = i++) if ((l[i][1] > y) !== (l[j][1] > y) && x < ((l[j][0] - l[i][0]) * (y - l[i][1])) / (l[j][1] - l[i][1]) + l[i][0]) c = !c;
  return c;
}

// An outline smoothed between its corners (spec 3.12's intent): corners where the loop turns TRACE.corner degrees
// or more over about 0.7 wpx stay put; between them, a Gaussian along the loop; then Ramer-Douglas-Peucker
function smoothLoop(l, step) {
  const n = l.length, w = Math.max(2, Math.round(0.7 / step)), turn = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = l[(i - w + n) % n], b = l[i], c = l[(i + w) % n];
    const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
    turn[i] = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) * (180 / Math.PI);
  }
  const corner = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (turn[i] >= TRACE.corner) {
    let max = true;
    for (let j = 1; j <= w && max; j++) if (turn[(i + j) % n] > turn[i] || turn[(i - j + n) % n] > turn[i]) max = false;
    if (max) corner[i] = 1;
  }
  const s = TRACE.sigma / step, R = Math.ceil(3 * s), g = [];
  for (let k = -R; k <= R; k++) g.push(Math.exp(-(k * k) / (2 * s * s)));
  const out = l.map((p, i) => {
    if (corner[i]) return p;
    let sx = 0, sy = 0, sw = 0;
    for (let k = -R; k <= R; k++) {
      // (not across a corner: the run stops at one)
      let blocked = false;
      for (let j = 1; j <= Math.abs(k); j++) if (corner[(i + Math.sign(k) * j + n) % n]) { blocked = true; break; }
      if (blocked) continue;
      const q = l[(i + k + n) % n], wt = g[k + R]; sx += q[0] * wt; sy += q[1] * wt; sw += wt;
    }
    return [sx / sw, sy / sw];
  });
  return { pts: out, corner };
}
function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(), [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1;
    let m = -1, md = 0;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > md) { md = d; m = i; } }
    if (md > tol && m > 0) { keep[m] = 1; st.push([a, m], [m, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// a closed loop simplified as two halves, cut at the point farthest from its first
function rdpLoop(l, tol) {
  let far = 0, fd = -1;
  for (let i = 1; i < l.length; i++) { const d = Math.hypot(l[i][0] - l[0][0], l[i][1] - l[0][1]); if (d > fd) { fd = d; far = i; } }
  const a = rdp(l.slice(0, far + 1), tol), b = rdp([...l.slice(far), l[0]], tol);
  return [...a, ...b.slice(1, -1)];
}

// The picture traced: { colors: [[r,g,b]...], shapes: [{ color, area (mm²), rings: [outer, ...holes] in mm }] },
// largest first. `mmPerPx`: the size it is sewn at.
export function tracePicture(rgba, W, H, mmPerPx, { k = TRACE.k, speck = TRACE.speck } = {}) {
  const wk = working(rgba, W, H), { w, h, f } = wk, pal = palette(wk, k);
  if (!pal.length) return { colors: [], shapes: [] };
  const U = unmix(wk, pal);
  knockouts(U, w, h);
  const p = TRACE.pad, pw = w + 2 * p, ph = h + 2 * p;
  const u = Math.max(2, Math.min(8, Math.floor(Math.sqrt(TRACE.fine / (pw * ph)))));
  const fine = U.cov.map((c, j) => {
    const pad = new Float32Array(pw * ph);
    if (j === U.clear) pad.fill(1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pad[(y + p) * pw + x + p] = c[y * w + x];
    return upsample(pad, pw, ph, u);
  });
  const FW = pw * u, FH = ph * u, mm = mmPerPx * f, minArea = (speck * speck) / (mm * mm), shapes = [];
  // fine sample g -> working pixel (g + 0.5) / u - pad -> source px x f -> mm
  const toMm = ([x, y]) => [(((x + 0.5) / u - p) * f) * mmPerPx, (((y + 0.5) / u - p) * f) * mmPerPx];
  for (let c = 0; c < pal.length; c++) {
    const F = new Float32Array(FW * FH);
    for (let i = 0; i < FW * FH; i++) { let r = 0; for (let j = 0; j < fine.length; j++) if (j !== c && fine[j][i] > r) r = fine[j][i]; F[i] = fine[c][i] - r; }
    const loops = contours(F, FW, FH).map((l) => l.map(([x, y]) => [(x + 0.5) / u - p, (y + 0.5) / u - p]))
      .filter((l) => Math.abs(area(l)) >= minArea)
      .map((l) => { const s = smoothLoop(l, 1 / u); return rdpLoop(s.pts, TRACE.tol); })
      .filter((l) => l.length >= 3 && Math.abs(area(l)) >= minArea);
    // positive on the left and y down: an outer outline runs one way round, a hole the other
    const outers = loops.filter((l) => area(l) < 0), holes = loops.filter((l) => area(l) > 0);
    const owned = outers.map((o) => ({ o, holes: [], a: Math.abs(area(o)) }));
    for (const hl of holes) {
      const by = owned.filter((s) => inside(hl[0], s.o)).sort((x, y) => x.a - y.a)[0];
      if (by) by.holes.push(hl);
    }
    for (const s of owned) {
      const rings = [s.o, ...s.holes].map((l) => l.map(([x, y]) => [x * f * mmPerPx, y * f * mmPerPx]));
      shapes.push({ color: c, area: (s.a - s.holes.reduce((t, hl) => t + Math.abs(area(hl)), 0)) * mm * mm, rings });
    }
  }
  return { colors: pal, shapes: shapes.sort((a, b) => b.area - a.area), fine: u, f, toMm };
}
