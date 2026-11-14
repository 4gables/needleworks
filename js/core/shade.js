/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Shading (roadmap PX4): where a picture's colours meet in a real soft gradient, the border between their flat bands
// is sewn as a blend of the two threads that meet there, rather than a hard step (the posterised look every
// auto-digitizer is faulted for; docs/research/picture-sota.md I7). The step between flat colour and photo stitch.
// A published, general technique: the "gradient" or "blend" fill of commercial digitizing (two fills interleaved row
// by row across a transition, as Ink/Stitch's gradient blocks and every digitizing course teach), on one row grid at
// one angle.
//
// 1. Where: two sewn colours' regions meet along a soft border (the picture, blurred SHADE.blur mm, takes SHADE.soft
//    mm or more to change from one to the other; a drawn edge takes about 1). Blended only when the border is real
//    shading over a meaningful area: both regions SHADE.wide mm across (a tabby's stripes, a drawn line, stay drawn),
//    the border SHADE.border mm long, the two threads SHADE.near to SHADE.far ΔE00 apart (nearer adds nothing; further,
//    rows of the two side by side read as stripes, not a mix), and the picture across the band agrees with a ramp
//    from one to the other (correlation SHADE.agree). A flat picture has no such border, so nothing changes for it.
// 2. Threads: only the two that meet at that border, each pixel its own colour's thread or the one across the border
//    (never a third: a thread chain fitted over a whole group put a stray orange on a dog's forehead).
// 3. Mix: in a band either side of the border, half the measured transition wide (SHADE.band mm at most), the share of
//    the other thread is where the picture (blurred SHADE.field mm) lies between the two threads in linear light,
//    eased into 0 or 1 at the band's edge.
// 4. Stitches: every region a blend touches is sewn on one row grid at one angle, the rows running across the borders
//    (their mean normal), so the two threads never cross each other (two angles in one blend read as cross-hatching).
//    Each row is cut into stretches, each in one thread, by an ordered threshold of SHADE.levels (rows alternate the
//    point where they change thread: a comb, not a line). A line screen, not a layer: every row is one thread, the cloth
//    is covered once, and each thread's stretches are a fill of its own (24 hits per mm² per colour block holds as for
//    any fill). Patents (docs/pictures.md): no per-pixel angle or segment, no thread added by its mix colour, stretches
//    sewn in row order.
import { labLinear, toLinear } from "./colour.js";
import { sewRows, tatami } from "./fill.js";
import { deltaE2000 } from "./palette.js";
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
      let p = pairs.get(key); if (!p) pairs.set(key, (p = { ra, rb, a: Rg.lab[ra], b: Rg.lab[rb], g: [], px: [] }));
      p.g.push((grad(i) + grad(j)) / 2); p.px.push(i, j);
    }
  }
  const labOfHex = (hex) => labLinear(...linOf(hex));
  const picLab = new Map(colors.map((c) => [c.id, labOfHex(c.picture || c.hex)])), thrLab = new Map(colors.map((c) => [c.id, labOfHex(c.hex)]));
  const soft = mode === "blend" ? SHADE.blend : SHADE.soft, debug = [];
  // (each region's half-width: a region under SHADE.wide mm across is a drawn mark, not shading, however soft its edge:
  // a tabby's stripes blended into the fur round them came out as scribbles)
  const edge = { w, h, data: new Uint8Array(n) }, half = new Float32Array(Rg.count);
  for (let i = 0; i < n; i++) { const x = i % w, r = Rg.id[i]; edge.data[i] = (x > 0 && Rg.id[i - 1] !== r) || (x < w - 1 && Rg.id[i + 1] !== r) || (i >= w && Rg.id[i - w] !== r) || (i + w < n && Rg.id[i + w] !== r) ? 0 : 1; }
  const deep = distanceTransform(edge);
  for (let i = 0; i < n; i++) if (deep[i] + 1 > half[Rg.id[i]]) half[Rg.id[i]] = deep[i] + 1;
  // 2. each blended border's band: every pixel of its two regions within W of the border. A pixel two bands reach takes
  // the nearer border's.
  const A = new Int16Array(n).fill(-1), B = new Int16Array(n).fill(-1), F = new Float32Array(n), dist = new Float32Array(n).fill(Infinity);
  const root = Array.from({ length: Rg.count }, (_, i) => i), find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
  const normals = new Map();   // group root -> [Σ cos 2θ, Σ sin 2θ] of the borders' normals (axial mean)
  let offer = 0, accepted = [];
  for (const p of pairs.values()) {
    const len = p.g.length / res;
    if (len < SHADE.border || 2 * Math.min(half[p.ra], half[p.rb]) < SHADE.wide * res) continue;
    const thr = deltaE2000(thrLab.get(p.a), thrLab.get(p.b));
    if (thr < SHADE.near || thr > SHADE.far) continue;
    const g = p.g.slice().sort((u, v) => u - v)[p.g.length >> 1], PA = picLab.get(p.a), PB = picLab.get(p.b);
    const mm = Math.hypot(PA[0] - PB[0], PA[1] - PB[1], PA[2] - PB[2]) / Math.max(g, 1e-6) / res;
    if (o.shadeDebug) debug.push({ a: p.a, b: p.b, len: +len.toFixed(1), mm: +mm.toFixed(2), dE: +thr.toFixed(1) });
    if (mm < soft) { if (mm >= SHADE.blend) offer++; continue; }
    accepted.push({ ...p, mm });
  }
  if (mode === "flat") return { ...none, offer: offer + accepted.length, found: 0, debug };
  const Sf = softened(lin, ink, w, 0, w, 0, h, SHADE.field, res);
  const picLin = new Map(colors.map((c) => [c.id, linOf(c.picture || c.hex)]));
  for (const p of accepted) {
    // the band: half the transition, at most SHADE.band mm (capped by the regions' half-width, a sky's blend stayed a
    // 3 mm fringe)
    const W = Math.max(1, Math.min(SHADE.band * res, (p.mm * res) / 2));
    const m = { w, h, data: new Uint8Array(n).fill(1) };
    for (const i of p.px) m.data[i] = 0;
    const d = distanceTransform(m), band = [];
    for (let i = 0; i < n; i++) { const r = Rg.id[i]; if ((r === p.ra || r === p.rb) && d[i] <= W) band.push(i); }
    if (band.length < SHADE.area * res * res) continue;
    // the picture across the band agrees with the ramp: its place between the two colours rises with it
    const P0 = picLin.get(p.a), P1 = picLin.get(p.b), dv = [P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]], L2 = dv[0] ** 2 + dv[1] ** 2 + dv[2] ** 2 || 1e-9;
    let sf = 0, st = 0, sff = 0, stt = 0, sft = 0;
    for (const i of band) {
      const f = Rg.lab[Rg.id[i]] === p.b ? 0.5 + d[i] / (2 * W) : 0.5 - d[i] / (2 * W);
      const t = ((S.R[i] - P0[0]) * dv[0] + (S.G[i] - P0[1]) * dv[1] + (S.B[i] - P0[2]) * dv[2]) / L2;
      sf += f; st += t; sff += f * f; stt += t * t; sft += f * t;
    }
    const N = band.length, cov = sft - (sf * st) / N, r = cov / Math.sqrt(Math.max(1e-12, (sff - (sf * sf) / N) * (stt - (st * st) / N)));
    if (o.shadeDebug) debug.push({ band: [p.a, p.b], mm2: +(N / res / res).toFixed(0), W: +(W / res).toFixed(1), agree: +r.toFixed(2) });
    if (mode !== "blend" && !(r >= SHADE.agree)) continue;
    // each pixel's share of b: where the picture (blurred SHADE.field mm) lies between the two threads in linear light
    // (threads side by side mix as light does), eased into the ramp's 0 or 1 at the band's edge so it meets flat
    const T0 = linOf(colors[p.a].hex), T1 = linOf(colors[p.b].hex), tv = [T1[0] - T0[0], T1[1] - T0[1], T1[2] - T0[2]], T2 = tv[0] ** 2 + tv[1] ** 2 + tv[2] ** 2 || 1e-9;
    for (const i of band) {
      if (d[i] >= dist[i]) continue;
      const onB = Rg.lab[Rg.id[i]] === p.b, e = (d[i] / W) ** 2;
      const pic = Math.min(1, Math.max(0, ((Sf.R[i] - T0[0]) * tv[0] + (Sf.G[i] - T0[1]) * tv[1] + (Sf.B[i] - T0[2]) * tv[2]) / T2));
      dist[i] = d[i]; A[i] = p.a; B[i] = p.b; F[i] = (1 - e) * pic + e * (onB ? 1 : 0);
    }
    root[find(p.ra)] = find(p.rb);
    // the border's direction (principal axis of its pixels), and the rows' across it
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (const i of p.px) { const x = i % w, y = (i - x) / w; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; }
    const K = p.px.length, cxx = sxx - (sx * sx) / K, cyy = syy - (sy * sy) / K, cxy = sxy - (sx * sy) / K;
    const along = 0.5 * Math.atan2(2 * cxy, cxx - cyy), across = along + Math.PI / 2;
    p.normal = [K * Math.cos(2 * across), K * Math.sin(2 * across)];
    p.done = true;
  }
  // 3. the groups: regions joined by blended borders, each sewn at one angle
  const gid = new Int16Array(n), groups = [], ofRegion = new Int32Array(Rg.count).fill(-1), gOf = new Map();
  for (const p of accepted) if (p.done) {
    const q = find(p.ra);
    let G = gOf.get(q); if (!G) gOf.set(q, (G = { id: groups.length + 1, nx: 0, ny: 0, regions: new Set(), ids: new Set(), px: [] })), groups.push(G);
    G.nx += p.normal[0]; G.ny += p.normal[1]; G.regions.add(p.ra); G.regions.add(p.rb);
  }
  if (!groups.length) return { ...none, offer, found: 0, debug };
  for (const G of groups) for (const r of G.regions) ofRegion[r] = G.id;
  for (let i = 0; i < n; i++) {
    const g = ofRegion[Rg.id[i]]; if (g < 0 || !ink[i]) continue;
    gid[i] = g; const G = groups[g - 1]; G.px.push(i); G.ids.add(labels[i]);
    if (A[i] < 0) { A[i] = B[i] = labels[i]; F[i] = 0; }
  }
  const has = new Map();
  for (const G of groups) {
    G.ids = [...G.ids];
    G.angle = ((((Math.atan2(G.ny, G.nx) / 2) * 180) / Math.PI) + 360) % 180;
    const th = (G.angle * Math.PI) / 180, U = [Math.cos(th), Math.sin(th)], V = [-Math.sin(th), Math.cos(th)], spc = o.density * res, px = G.px, id = G.id;
    // which thread sews where: a thread may sew at a pixel when its share there takes a row (over 1 / 2L), and round
    // that by SHADE.reach mm (a stretch joined to its neighbour runs past it)
    const L2 = 0.5 / SHADE.levels;
    for (const c of G.ids) {
      const m = { w, h, data: new Uint8Array(n).fill(1) };
      for (const i of px) if ((A[i] === c && F[i] < 1 - L2) || (B[i] === c && F[i] > L2)) m.data[i] = 0;
      const d = distanceTransform(m);
      let a = has.get(c); if (!a) has.set(c, (a = new Uint8Array(n)));
      for (const i of px) if (d[i] <= SHADE.reach * res) a[i] = 1;
    }
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
        const c = F[i] > t ? B[i] : A[i], last = runs[runs.length - 1];
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
    let blended = 0;
    for (const i of px) if (F[i] > 0 && F[i] < 1 && A[i] !== B[i]) blended++;
    Object.assign(G, { U, V, plan, area: blended / (res * res) });
    delete G.px; delete G.regions;
  }
  const rank = new Map(used.slice().sort((a, b) => b.lightness - a.lightness).map((c, k) => [c.id, k]));

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
