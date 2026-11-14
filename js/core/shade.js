/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Shading (roadmap PX4): a picture's soft gradients sewn as blends of the threads already chosen, where flat colour
// would cut them into bands (the posterised look every auto-digitizer is faulted for; docs/research/picture-sota.md
// I7). The step between flat colour and photo stitch.
//
// 1. Where: two colours' regions, both SHADE.wide mm across somewhere, that meet along a soft border (the picture,
//    blurred SHADE.blur mm, takes SHADE.soft mm or more to change from one to the other; a drawn edge, anti-aliased or
//    not, takes about one) are one shaded group. A flat picture has no such border, so nothing changes for it.
// 2. Threads: a chain of up to SHADE.stops of the group's own colours (the Thread colours count is every thread sewn),
//    in their order along the group's main colour axis, every chain scored whole: the mean ΔE00 from the group's
//    colours to their mix on it, plus half Liu et al. 2023's end loss (ΔE00 at both ends of the gradient and the
//    contrast it loses: palette.js `blendLoss`), less 1 a thread past two (nearer threads side by side show less
//    texture). Blended only where that beats sewing flat and the chain's ends are SHADE.span apart.
// 3. Mix: each pixel's place along the chain, from the picture blurred SHADE.field mm, in linear light (threads side by
//    side mix as light does, and as the look score's blur does): between threads a and b, a share f of b.
// 4. Stitches: ordinary tatami rows on one grid at one angle across the group, running along the gradient (its
//    direction from one plane fitted to the place on the chain over the whole group: no per-pixel direction). Each row
//    is cut into stretches, each in one thread: b where f is over the row's threshold, from an ordered sequence of
//    SHADE.levels thresholds (bit-reversed: Bayer's ordered dither in one dimension, as line-screen halftoning does).
//    Two levels: a, a and b on alternate rows, b. A line screen, not a layer: every row is one thread, the cloth is
//    covered once, and each thread's stretches are a fill of its own (24 hits per mm² per colour block holds as for any
//    fill). Each row changes thread where f crosses its threshold, and the step to the next row of the same thread lies
//    on that thread's own rows.
// Liu et al. lay one thread solid and the second on top with varying spacing; here the two share one grid, so a blend
// sews no more thread than a flat fill. Patents (docs/pictures.md): no per-pixel angle or segment (Brother US
// 7,693,598, 7,946,235, 8,200,357, 8,271,123, 8,335,584), the chain is chosen whole (not grown a mix colour at a time:
// US 11,851,793), and the stretches are ordered as rows, by row order and distance (US 8,065,030, 8,903,536).
import { labLinear, toLinear } from "./colour.js";
import { sewRows, tatami } from "./fill.js";
import { blendLoss, deltaE2000 } from "./palette.js";
import { distanceTransform } from "./raster.js";
import { regionsOf } from "./regions.js";
import { SHADE } from "./recipes.js";
import { hexToRgb } from "./threads.js";

// the row thresholds: (i + 0.5) / L in bit-reversed order of i (L = 8: 0 4 2 6 1 5 3 7)
const ORDER = (() => {
  const L = SHADE.levels, bits = Math.round(Math.log2(L)), out = [];
  for (let i = 0; i < L; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); out.push((r + 0.5) / L); }
  return out;
})();
const threshold = (k) => ORDER[((k % ORDER.length) + ORDER.length) % ORDER.length];

// Three box passes along x then y (about a Gaussian of σ² = r(r + 1)), in place; t: scratch of the same size
function blur3(a, t, w, h, r) {
  for (let p = 0; p < 3; p++) {
    for (let y = 0; y < h; y++) {
      const o = y * w; let s = 0;
      for (let x = -r; x <= r; x++) s += a[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) { t[o + x] = s / (2 * r + 1); s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = s / (2 * r + 1); s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; }
    }
  }
}
const radius = (mm, res) => Math.max(1, Math.round(Math.sqrt((mm * res) ** 2 + 0.25) - 0.5));
// The picture's colour in linear light, blurred `mm` over the pixels `on` marks only (normalized: what lies outside
// doesn't bleed in), in the box [x0, x1) x [y0, y1). Returns { R, G, B, bw } (box-sized), or null.
function softened(lin, on, w, x0, x1, y0, y1, mm, res) {
  const bw = x1 - x0, bh = y1 - y0, m = bw * bh, R = new Float32Array(m), G = new Float32Array(m), B = new Float32Array(m), W = new Float32Array(m), t = new Float32Array(m);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * w + x, j = (y - y0) * bw + x - x0;
    if (!on[i]) continue;
    R[j] = lin[3 * i]; G[j] = lin[3 * i + 1]; B[j] = lin[3 * i + 2]; W[j] = 1;
  }
  const r = radius(mm, res);
  for (const a of [R, G, B, W]) blur3(a, t, bw, bh, r);
  for (let j = 0; j < m; j++) if (W[j] > 1e-6) { R[j] /= W[j]; G[j] /= W[j]; B[j] /= W[j]; }
  return { R, G, B, bw };
}
const linOf = (hex) => hexToRgb(hex).map(toLinear);

// img: the working copy, labels: the colour ids build() sews (after the clean shapes), colors: the analysis's,
// used: the sewn colours, res px/mm, o: build's options (`shade`: "auto" | "blend" | "flat"; `density`).
// Returns { mode, groups, area (mm² blended), offer (borders the "blend" choice would add), of(i, id): whether colour
// id sews at pixel i, rows(id, comp, mask, opts): a fill's underlay and rows for a colour's shape that lies in a
// shaded group (null for one that doesn't) }.
export function shading(img, labels, colors, used, res, o = {}) {
  const mode = o.shade === "blend" || o.shade === "flat" ? o.shade : "auto";
  const { width: w, height: h } = img, n = w * h;
  const flatOf = (i, id) => labels[i] === id;
  const none = { mode, groups: [], area: 0, offer: 0, of: flatOf, rows: () => null };
  if (!used.length || labels.length !== n) return none;
  const sewn = new Set(used.map((c) => c.id)), data = img.data;
  const lin = new Float32Array(3 * n), ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (data[4 * i + 3] < 128 || labels[i] < 0) continue;
    ink[i] = 1; lin[3 * i] = toLinear(data[4 * i]); lin[3 * i + 1] = toLinear(data[4 * i + 1]); lin[3 * i + 2] = toLinear(data[4 * i + 2]);
  }
  // 1. how soft each border between two sewn colours' regions is: the colours' difference over the picture's rate of
  // change there (ΔE per px, on a copy blurred SHADE.blur mm), the median along the border: the mm it takes to go
  // from one colour to the other. A drawn edge blurred so takes about 2.5 σ (1 mm); a gradient, its whole band.
  const S = softened(lin, ink, w, 0, w, 0, h, SHADE.blur, res), Lab = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) if (ink[i]) { const q = labLinear(S.R[i], S.G[i], S.B[i]); Lab[3 * i] = q[0]; Lab[3 * i + 1] = q[1]; Lab[3 * i + 2] = q[2]; }
  const grad = (i) => {
    const x = i % w, y = (i - x) / w, a = x > 0 && ink[i - 1] ? i - 1 : i, b = x < w - 1 && ink[i + 1] ? i + 1 : i, c = y > 0 && ink[i - w] ? i - w : i, d = y < h - 1 && ink[i + w] ? i + w : i;
    let s = 0;
    for (let q = 0; q < 3; q++) { const gx = (Lab[3 * b + q] - Lab[3 * a + q]) / Math.max(1, b - a), gy = (Lab[3 * d + q] - Lab[3 * c + q]) / Math.max(1, (d - c) / w); s += gx * gx + gy * gy; }
    return Math.sqrt(s);
  };
  const Rg = regionsOf(labels, w, h), pairs = new Map();
  for (let i = 0; i < n; i++) {
    const x = i % w;
    for (const j of [x < w - 1 ? i + 1 : -1, i + w < n ? i + w : -1]) {
      if (j < 0 || Rg.id[i] === Rg.id[j]) continue;
      const a = labels[i], b = labels[j];
      if (a === b || !sewn.has(a) || !sewn.has(b) || !ink[i] || !ink[j]) continue;
      const ra = Math.min(Rg.id[i], Rg.id[j]), rb = Math.max(Rg.id[i], Rg.id[j]), key = ra * Rg.count + rb;
      let p = pairs.get(key); if (!p) pairs.set(key, (p = { ra, rb, a: Rg.lab[ra], b: Rg.lab[rb], g: [] }));
      p.g.push((grad(i) + grad(j)) / 2);
    }
  }
  const picLab = new Map(colors.map((c) => [c.id, (() => { const l = linOf(c.picture || c.hex); return labLinear(...l); })()]));
  const soft = mode === "blend" ? SHADE.blend : SHADE.soft, debug = [];
  const root = Array.from({ length: Rg.count }, (_, i) => i), find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
  // (each region's half-width: a line, under SHADE.wide mm across, is drawn, not shading, however soft its edge: a
  // lemon's pale segment lines went into the blend round them, detail 0.66 -> 0.28)
  const edge = { w, h, data: new Uint8Array(n) }, half = new Float32Array(Rg.count);
  for (let i = 0; i < n; i++) { const x = i % w, r = Rg.id[i]; edge.data[i] = (x > 0 && Rg.id[i - 1] !== r) || (x < w - 1 && Rg.id[i + 1] !== r) || (i >= w && Rg.id[i - w] !== r) || (i + w < n && Rg.id[i + w] !== r) ? 0 : 1; }
  const deep = distanceTransform(edge);
  for (let i = 0; i < n; i++) if (deep[i] + 1 > half[Rg.id[i]]) half[Rg.id[i]] = deep[i] + 1;
  let offer = 0;
  for (const p of pairs.values()) {
    if (p.g.length < SHADE.border * res || 2 * Math.min(half[p.ra], half[p.rb]) < SHADE.wide * res) continue;
    const g = p.g.sort((u, v) => u - v)[p.g.length >> 1], A = picLab.get(p.a), B = picLab.get(p.b);
    const mm = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) / Math.max(g, 1e-6) / res;
    if (o.shadeDebug) debug.push({ a: p.a, b: p.b, len: +(p.g.length / res).toFixed(1), mm: +mm.toFixed(2) });
    if (mm >= soft) root[find(p.ra)] = find(p.rb);
    else if (mm >= SHADE.blend) offer++;
  }
  // 2. the groups: regions joined by soft borders, SHADE.area mm² or more in all
  const members = new Map();
  for (let r = 0; r < Rg.count; r++) { const q = find(r); let a = members.get(q); if (!a) members.set(q, (a = [])); a.push(r); }
  const rank = new Map(used.slice().sort((a, b) => b.lightness - a.lightness).map((c, k) => [c.id, k]));
  const gid = new Int16Array(n), segJ = new Uint8Array(n), segF = new Float32Array(n), groups = [], has = new Map();
  const ofRegion = new Int32Array(Rg.count).fill(-1);
  for (const [q, rs] of members) if (rs.length > 1) for (const r of rs) ofRegion[r] = q;
  const pixOf = new Map();
  for (let i = 0; i < n; i++) { const q = ofRegion[Rg.id[i]]; if (q >= 0 && ink[i]) { let a = pixOf.get(q); if (!a) pixOf.set(q, (a = [])); a.push(i); } }
  for (const px of pixOf.values()) {
    if (px.length < SHADE.area * res * res) continue;
    const g = makeGroup(px, groups.length + 1);
    if (g) groups.push(g);
  }
  if (mode === "flat" || !groups.length) return { ...none, groups: mode === "flat" ? [] : groups, offer: mode === "flat" ? groups.length + offer : offer, found: 0, debug };

  function makeGroup(px, id) {
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    const on = new Uint8Array(n);
    for (const i of px) { on[i] = 1; const x = i % w, y = (i - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    x1++; y1++;
    const F = softened(lin, on, w, x0, x1, y0, y1, SHADE.field, res), at = (i) => { const x = i % w, y = (i - x) / w, j = (y - y0) * F.bw + x - x0; return [F.R[j], F.G[j], F.B[j]]; };
    // the candidates: the colours of the group's own regions (each 1 % of it or more), as their threads
    const count = new Map();
    for (const i of px) count.set(labels[i], (count.get(labels[i]) || 0) + 1);
    const cand = [...count].filter(([, k]) => k >= 0.01 * px.length).map(([cid]) => { const l = linOf(colors[cid].hex); return { id: cid, lin: l, lab: labLinear(...l) }; });
    if (cand.length < 2) return null;
    // a sample of the group's pixels (every pixel up to 3,000)
    const step = Math.max(1, Math.floor(px.length / 3000)), sample = [];
    for (let k = 0; k < px.length; k += step) { const i = px[k], l = at(i); sample.push({ i, lin: l, lab: labLinear(...l) }); }
    // the gradient's direction in colour: the sample's principal axis in linear light (power iteration)
    const mean = [0, 0, 0];
    for (const s of sample) for (let q = 0; q < 3; q++) mean[q] += s.lin[q] / sample.length;
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const s of sample) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += (s.lin[a] - mean[a]) * (s.lin[b] - mean[b]);
    let ax = [1, 1, 1];
    for (let it = 0; it < 30; it++) { const v = [0, 1, 2].map((a) => C[a][0] * ax[0] + C[a][1] * ax[1] + C[a][2] * ax[2]), L = Math.hypot(...v) || 1; ax = v.map((t) => t / L); }
    const proj = (l) => (l[0] - mean[0]) * ax[0] + (l[1] - mean[1]) * ax[1] + (l[2] - mean[2]) * ax[2];
    // the gradient's two ends: the mean of the 3 % of the sample furthest each way along it
    const sorted = sample.slice().sort((p, q) => proj(p.lin) - proj(q.lin)), e = Math.max(1, Math.round(0.03 * sorted.length));
    const end = (list) => { const l = [0, 0, 0]; for (const s of list) for (let q = 0; q < 3; q++) l[q] += s.lin[q] / list.length; return { lin: l, lab: labLinear(...l) }; };
    const lo = end(sorted.slice(0, e)), hi = end(sorted.slice(-e));
    // every chain of 2 to SHADE.stops candidates in their order along the axis, scored whole: the sample's mean
    // ΔE00 to its mix on the chain, half the end loss, and SHADE.gain for each thread past two
    cand.sort((p, q) => proj(p.lin) - proj(q.lin));
    const place = (l, chain) => {
      let best = null;
      for (let j = 0; j + 1 < chain.length; j++) {
        const A = chain[j].lin, B = chain[j + 1].lin, d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 || 1e-9;
        const f = Math.min(1, Math.max(0, ((l[0] - A[0]) * d[0] + (l[1] - A[1]) * d[1] + (l[2] - A[2]) * d[2]) / L2));
        const m = [A[0] + f * d[0], A[1] + f * d[1], A[2] + f * d[2]], e2 = (l[0] - m[0]) ** 2 + (l[1] - m[1]) ** 2 + (l[2] - m[2]) ** 2;
        if (!best || e2 < best.e2) best = { j, f, m, e2 };
      }
      return best;
    };
    const errOf = (chain) => { let s = 0; for (const p of sample) s += deltaE2000(p.lab, labLinear(...place(p.lin, chain).m)); return s / sample.length; };
    let best = null;
    const K = cand.length;
    for (let mask = 0; mask < 1 << K; mask++) {
      const chain = cand.filter((_, k) => mask & (1 << k));
      if (chain.length < 2 || chain.length > SHADE.stops) continue;
      const err = errOf(chain), v = err + 0.5 * blendLoss(lo, hi, chain[0], chain[chain.length - 1]) + SHADE.stop * (chain.length - 2);
      if (!best || v < best.v) best = { chain, err, v };
    }
    // ... against sewing it flat: each pixel its own colour's thread
    let flat = 0;
    const thr = new Map(cand.map((c) => [c.id, c.lab]));
    for (const p of sample) { const t = thr.get(labels[p.i]) || labLinear(...linOf(colors[labels[p.i]].hex)); flat += deltaE2000(p.lab, t); }
    flat /= sample.length;
    if (o.shadeDebug) debug.push({ group: id, px: px.length, chain: best.chain.map((c) => c.id), span: +deltaE2000(best.chain[0].lab, best.chain.at(-1).lab).toFixed(1), err: +best.err.toFixed(2), flat: +flat.toFixed(2) });
    // (two ends under SHADE.span ΔE00 apart make little a flat fill doesn't, and the blend took the detail drawn between
    // them: a lemon's pale segment lines, look 75.5 -> 71.7)
    if (best.err > flat - (mode === "blend" ? 0 : SHADE.gain) || (mode !== "blend" && deltaE2000(best.chain[0].lab, best.chain[best.chain.length - 1].lab) < SHADE.span)) return null;
    const chain = best.chain, ids = chain.map((c) => c.id);
    // each pixel's place on the chain; the rows run along the gradient, its direction from one plane fitted to that
    // place over the whole group (rows along the level lines sewed a share of 1/8 as whole rows of the second thread:
    // thin lines right across the blend, look 79 -> 76). Across them, each row changes thread once, at its own level, and
    // the step to the next row of the same thread lies on that thread's own rows
    let sx = 0, sy = 0, sp = 0, sxx = 0, sxy = 0, syy = 0, sxp = 0, syp = 0;
    for (const i of px) {
      const pl = place(at(i), chain);
      const x = i % w, y = (i - x) / w, p = pl.j + pl.f;
      gid[i] = id; segJ[i] = pl.j; segF[i] = pl.f;
      sx += x; sy += y; sp += p; sxx += x * x; sxy += x * y; syy += y * y; sxp += x * p; syp += y * p;
    }
    const N = px.length, cxx = sxx - (sx * sx) / N, cxy = sxy - (sx * sy) / N, cyy = syy - (sy * sy) / N, cxp = sxp - (sx * sp) / N, cyp = syp - (sy * sp) / N;
    const det = cxx * cyy - cxy * cxy, gx = det ? (cyy * cxp - cxy * cyp) / det : 0, gy = det ? (cxx * cyp - cxy * cxp) / det : 0;
    const angle = Math.hypot(gx, gy) > 1e-9 ? ((Math.atan2(gy, gx) * 180) / Math.PI + 360) % 180 : 45;
    // which thread sews where: a thread may sew at a pixel when its share there takes a row (over 1 / 2L), and round
    // that by SHADE.reach mm (a stretch joined to its neighbour runs past it)
    for (const c of ids) {
      const m = { w, h, data: new Uint8Array(n).fill(1) }, L2 = 0.5 / SHADE.levels;
      for (const i of px) { const j = segJ[i], f = segF[i]; if ((ids[j] === c && f < 1 - L2) || (ids[j + 1] === c && f > L2)) m.data[i] = 0; }
      const d = distanceTransform(m);
      let a = has.get(c); if (!a) has.set(c, (a = new Uint8Array(n)));
      for (const i of px) if (d[i] <= SHADE.reach * res) a[i] = 1;
    }
    const th = (angle * Math.PI) / 180, U = [Math.cos(th), Math.sin(th)], V = [-Math.sin(th), Math.cos(th)], spc = o.density * res;
    // the plan: each row's stretches over the group, in one thread each (stretches under SHADE.run mm join the longer
    // neighbour, shortest first, so a thread never stops and starts for a few stitches)
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const i of px) { const x = i % w, y = (i - x) / w, u = x * U[0] + y * U[1], v = x * V[0] + y * V[1]; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
    const plan = new Map(), run = SHADE.run * res;
    for (let k = Math.floor(v0 / spc); k * spc <= v1; k++) {
      const v = (k + 0.5) * spc, t = threshold(k), runs = [];
      for (let u = u0 - 1; u <= u1 + 1; u += 0.5) {
        const X = Math.round(u * U[0] + v * V[0]), Y = Math.round(u * U[1] + v * V[1]);
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const i = Y * w + X;
        if (gid[i] !== id) continue;
        const c = segF[i] > t ? ids[segJ[i] + 1] : ids[segJ[i]], last = runs[runs.length - 1];
        if (last && last[2] === c && u - last[1] <= 1) last[1] = u; else runs.push([u, u, c]);
      }
      for (;;) {
        let s = -1;
        for (let q = 0; q < runs.length; q++) if (runs.length > 1 && !runs[q].keep && runs[q][1] - runs[q][0] < run && (s < 0 || runs[q][1] - runs[q][0] < runs[s][1] - runs[s][0])) s = q;
        if (s < 0) break;
        // (into the longer neighbour that touches it; one with a gap of the picture between stays as it is)
        const L = runs[s - 1] && runs[s][0] - runs[s - 1][1] <= 1 ? runs[s - 1] : null, Rr = runs[s + 1] && runs[s + 1][0] - runs[s][1] <= 1 ? runs[s + 1] : null;
        const into = L && (!Rr || L[1] - L[0] >= Rr[1] - Rr[0]) ? L : Rr;
        if (!into) { runs[s].keep = true; continue; }
        if (into === L) L[1] = runs[s][1]; else Rr[0] = runs[s][0];
        runs.splice(s, 1);
        // (the same thread either side now: one stretch)
        for (let q = runs.length - 1; q > 0; q--) if (runs[q][2] === runs[q - 1][2] && runs[q][0] - runs[q - 1][1] <= 1) { runs[q - 1][1] = runs[q][1]; runs.splice(q, 1); }
      }
      if (runs.length) plan.set(k, runs);
    }
    return { id, ids, angle, U, V, plan, area: px.length / (res * res), err: best.err, flat };
  }

  const of = (i, id) => (gid[i] ? !!has.get(id)?.[i] : labels[i] === id);
  // A colour's shape that lies (in part) in a shaded group: its rows on the group's grid, each kept where the plan
  // gives it this thread (and where the shape lies outside the group, whole), and an underlay under the part where
  // it is the main thread. opts: { spacing, stitch, pull } as build()'s tatami.
  const byRank = (G) => (G.byRank ||= G.ids.slice().sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0)));
  function rows(cid, comp, mask, { spacing, stitch, pull }) {
    const cnt = new Map();
    for (const i of comp.pixels) if (gid[i]) cnt.set(gid[i], (cnt.get(gid[i]) || 0) + 1);
    if (!cnt.size) return null;
    // (each group the shape reaches on its own grid; the shape's flat part with the group it lies most in. One grid
    // for all, another group's pixels took the nearest decision of this one's: spikes of a ball's rim over its backdrop)
    const gs = [...cnt].sort((a, b) => b[1] - a[1]).map(([g]) => groups[g - 1]), G = gs[0], sp = spacing * res, fill = [];
    for (const g of gs) fill.push(...groupRows(g, g === G));
    function groupRows(G, main) {
    const { U, V, plan } = G;
    const inside = (x, y) => { const X = Math.round(x), Y = Math.round(y); if (X < 0 || Y < 0 || X >= w || Y >= h) return false; const i = Y * w + X; return comp.labels[i] === comp.id && (gid[i] === G.id || (main && !gid[i])); };
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const i of comp.pixels) { if (!(gid[i] === G.id || (main && !gid[i]))) continue; const x = i % w, y = (i - x) / w, u = x * U[0] + y * U[1], v = x * V[0] + y * V[1]; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
    const out = [], P = pull * res, ext = (other) => ((rank.get(cid) ?? 0) <= (rank.get(other) ?? 0) ? SHADE.over : SHADE.under) * res;
    for (let k = Math.floor(v0 / sp); k * sp <= v1; k++) {
      const v = (k + 0.5) * sp, runs = plan.get(k) || [];
      // samples along the row inside the shape: 1 this thread, 0 another (which), -1 not decided here
      const spans = [];
      let cur = null, q = 0;
      for (let u = u0 - 1; u <= u1 + 1; u += 0.5) {
        const x = u * U[0] + v * V[0], y = u * U[1] + v * V[1];
        if (!inside(x, y)) { cur = null; continue; }
        const i = Math.round(y) * w + Math.round(x);
        let s = -1, other = -1;
        if (gid[i] === G.id) {
          while (q < runs.length - 1 && runs[q][1] < u) q++;
          const r = runs[q] && Math.abs(u - Math.min(Math.max(u, runs[q][0]), runs[q][1])) <= 1.5 ? runs[q] : null;
          if (r) { s = r[2] === cid ? 1 : 0; other = r[2]; }
        } else if (!gid[i] && labels[i] === cid) s = 1;
        if (!cur) spans.push((cur = []));
        cur.push([u, s, other]);
      }
      const ivs = [];
      for (const sm of spans) {
        // (undecided samples take the nearest decided one's; a span with none is this thread's: its own flat part
        // or the overlap it grew under a later colour)
        let last = null;
        const fwd = sm.map((p) => (p[1] >= 0 ? (last = p) : last));
        last = null;
        for (let m = sm.length - 1; m >= 0; m--) {
          if (sm[m][1] >= 0) { last = sm[m]; continue; }
          const a = fwd[m], b = last, pick = a && b ? (sm[m][0] - a[0] <= b[0] - sm[m][0] ? a : b) : a || b;
          if (pick) { sm[m][1] = pick[1]; sm[m][2] = pick[2]; } else sm[m][1] = 1;
        }
        for (let m = 0; m < sm.length;) {
          if (sm[m][1] !== 1) { m++; continue; }
          let e2 = m; while (e2 + 1 < sm.length && sm[e2 + 1][1] === 1) e2++;
          const a = sm[m][0] - (m === 0 ? P : ext(sm[m - 1][2])), b = sm[e2][0] + (e2 === sm.length - 1 ? P : ext(sm[e2 + 1][2]));
          if (b - a >= 0.6 * res) ivs.push([a, b]);
          m = e2 + 1;
        }
      }
      if (ivs.length) out.push({ v, r: ((k % 48) + 48) % 48, ivs });
    }
    const leaves = (p, r) => {
      const m = Math.ceil(Math.hypot(r[0] - p[0], r[1] - p[1]) / (0.2 * res));
      for (let i = 1; i < m; i++) {
        const x = p[0] + ((r[0] - p[0]) * i) / m, y = p[1] + ((r[1] - p[1]) * i) / m;
        if (!inside(x, y) && !inside(x + 1, y) && !inside(x - 1, y) && !inside(x, y + 1) && !inside(x, y - 1)) return true;
      }
      return false;
    };
    return sewRows(out, U, V, res, stitch * res, "tatami", leaves);
    }
    // the underlay: once under every pixel, by the first thread sewn there (a later thread's underlay lay on top of
    // the rows sewn before it: lines across the blend)
    const sub = new Uint8Array(n), subPx = [];
    for (const i of comp.pixels) {
      const main = gid[i] ? byRank(groups[gid[i] - 1]).find((c) => has.get(c)[i]) === cid : true;
      if (main) { sub[i] = 1; subPx.push(i); }
    }
    const under = subPx.length ? tatami(mask, { id: 1, labels: sub, dt: distanceTransform({ w, h, data: sub }), pixels: subPx }, res, { angle: G.angle + 90, spacing: 2.5, stitch: 3, inset: 0.4, pull: 0 }) : [];
    return { under, fill };
  }
  const area = groups.reduce((t, g) => t + g.area, 0);
  return { mode, groups, area, offer, found: groups.length, of, rows, debug };
}
