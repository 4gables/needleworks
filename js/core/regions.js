/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Clean shapes: a picture's labelled pixels made into fewer, smoother regions before any stitch is planned.
// What every digitizing guide does first (Wilcom/Hatch/BERNINA "Prepare Bitmap", mySewnet Despeckle, Stitch Era's
// traced shapes cut by a third): the blend bands between two colours go to the colours either side, flecks of
// colour go into the colour round them, and the edges are smoothed so the fill rows end on a curve, not on pixel
// stairs. Small details that matter are kept on purpose: a dot of strong contrast inside another colour (an eye, a
// highlight) and a thin line of its own colour (an outline, a stem, a letter's stroke).
//
// The shared form (`regions`): a partition of the working copy into regions, each one colour, with its area, width,
// box, and role ("fill", "line", "detail"). A picture reaches it from its labels (`cleanShapes`); an imported drawing
// (round Z2) reaches it by painting its filled outlines in sewing order with the later ones' overlaps removed
// (`docs/zigzag-spec.md` 2.6) into the same labels, and both are stitched from there.
import { deltaE2000, srgbToLab } from "./palette.js";
import { distanceTransform } from "./raster.js";
import { hexToRgb } from "./threads.js";
import { SHAPES } from "./recipes.js";

// 4-connected regions of equal label. Returns { id: Int32Array (region per px), count, lab: label per region }.
export function regionsOf(labels, w, h) {
  const n = w * h, id = new Int32Array(n).fill(-1), of = [], st = [];
  let count = 0;
  for (let s = 0; s < n; s++) {
    if (id[s] >= 0) continue;
    const L = labels[s];
    id[s] = count; st.push(s);
    while (st.length) {
      const i = st.pop(), x = i % w;
      if (x > 0 && id[i - 1] < 0 && labels[i - 1] === L) { id[i - 1] = count; st.push(i - 1); }
      if (x < w - 1 && id[i + 1] < 0 && labels[i + 1] === L) { id[i + 1] = count; st.push(i + 1); }
      if (i >= w && id[i - w] < 0 && labels[i - w] === L) { id[i - w] = count; st.push(i - w); }
      if (i + w < n && id[i + w] < 0 && labels[i + w] === L) { id[i + w] = count; st.push(i + w); }
    }
    of.push(L); count++;
  }
  return { id, count, lab: of };
}

// Each region's measures: area (px), half-width (px: the deepest pixel's distance to another region), box, and the
// length of its edge against each neighbouring region (`nb`: Map neighbour -> px edges).
function measure(R, w, h) {
  const { id, count } = R, n = w * h;
  const edge = { w, h, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) {
    const x = i % w, r = id[i];
    edge.data[i] = (x > 0 && id[i - 1] !== r) || (x < w - 1 && id[i + 1] !== r) || (i >= w && id[i - w] !== r) || (i + w < n && id[i + w] !== r) ? 0 : 1;
  }
  const dt = distanceTransform(edge);
  const area = new Int32Array(count), half = new Float32Array(count), x0 = new Int32Array(count).fill(w), x1 = new Int32Array(count).fill(-1), y0 = new Int32Array(count).fill(h), y1 = new Int32Array(count).fill(-1);
  const nb = Array.from({ length: count }, () => new Map());
  for (let i = 0; i < n; i++) {
    const r = id[i], x = i % w, y = (i - x) / w;
    area[r]++; if (dt[i] + 1 > half[r]) half[r] = dt[i] + 1;
    if (x < x0[r]) x0[r] = x; if (x > x1[r]) x1[r] = x; if (y < y0[r]) y0[r] = y; if (y > y1[r]) y1[r] = y;
    if (x < w - 1 && id[i + 1] !== r) { const q = id[i + 1]; nb[r].set(q, (nb[r].get(q) || 0) + 1); nb[q].set(r, (nb[q].get(r) || 0) + 1); }
    if (i + w < n && id[i + w] !== r) { const q = id[i + w]; nb[r].set(q, (nb[r].get(q) || 0) + 1); nb[q].set(r, (nb[q].get(r) || 0) + 1); }
  }
  return { area, half, x0, x1, y0, y1, nb, dt };
}

// labels: Int16Array of colour ids (-1 see-through), colors: the analysis's colours (background flagged), res: px/mm.
// opts.img: the working copy the labels are of (a blend pixel goes to the colour it is nearer). opts.keep: "all" keeps every fleck (the Details choice "Keep all"); the blend bands and the smoothing still apply.
// Returns { labels (a new array), regions (see `shapeTable`), merged: regions folded, slivers: blend px moved, smoothed: px
// changed by the smoothing }.
export function cleanShapes(labels0, w, h, colors, res, opts = {}) {
  // (the fabric: see-through or the background's colour the picture's edge reaches. `inside`: the background's colour
  // closed in by the design, sewn, but a piece of it is never folded away: it is a letter's counter or an eye's white)
  const n = w * h, bg = colors.find((c) => c.background), fabric = (l) => l < 0 || (!!bg && l === bg.id), inside = (l) => l >= 0 && !!colors[l]?.inside;
  const labs = new Map(colors.map((c) => [c.id, srgbToLab(...hexToRgb(c.picture || c.hex))]));
  const lab = (l) => (l < 0 ? (bg ? labs.get(bg.id) : null) : labs.get(l));
  const dE = (a, b) => (a && b ? deltaE2000(a, b) : Infinity);
  // (a colour between two others: its distance to each, together, under BETWEEN times theirs. The rule build() used for
  // a thin piece between the fabric and a colour, now for any two)
  const between = (m, a, b) => { const A = lab(a), B = lab(b), M = lab(m); if (!A || !B || !M) return false; const e = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); return e(A, M) + e(M, B) <= SHAPES.between * e(A, B); };
  let labels = labels0.slice();
  const img = opts.img && opts.img.width === w && opts.img.height === h ? opts.img : null;
  const out = { merged: 0, slivers: 0, smoothed: 0 };

  // 1. Blend bands. Where two colours meet, a picture's soft edge is a band of in-between pixels that the palette read
  // as a third colour (a dark outline's grey ring on a yellow bird; a rose's mid-red rim between red and pink). Each such
  // pixel, within `band` mm of both colours, goes to the nearer. Only there: a grey stem that runs past a black leaf
  // keeps the rest of its length (as build()'s rule did for the fabric's side alone).
  const X = globalThis.PX1 || "bfsL";
  if (X.includes("b")) {
    const R = regionsOf(labels, w, h), M = measure(R, w, h), band = SHAPES.band * res;
    const to = new Map();   // region -> [colour a, colour b]
    for (let r = 0; r < R.count; r++) {
      const L = R.lab[r];
      if (fabric(L) || inside(L) || M.half[r] > band) continue;
      // its two colours with the most edge (by colour: one colour's two pieces count together)
      const by = new Map();
      for (const [q, k] of M.nb[r]) { const c = R.lab[q] < 0 && bg ? bg.id : R.lab[q]; if (c !== L) by.set(c, (by.get(c) || 0) + k); }
      const top = [...by.entries()].sort((p, q) => q[1] - p[1]);
      if (top.length < 2) continue;
      const [[a, ka], [b, kb]] = top;
      if (kb < SHAPES.side * (ka + kb)) continue;
      // (between two sewn colours only. A band between the fabric and a colour is the edge of a thin thing as often as
      // a blend: a stem's pale rim given to the fabric and the stem left 1-2 px wide and broken, its branches dropped
      // as specks and 38 more bare locks on etsy_1. build() judges those, beside the colour only)
      if (!fabric(a) && !fabric(b) && between(L, a, b)) to.set(r, [a, b]);
    }
    if (to.size) {
      // distance (px, 4-steps) from each pixel of a band to each of its two colours, by a breadth-first search into it
      const near = (c) => {
        const d = new Float32Array(n).fill(Infinity);
        let front = [];
        for (let i = 0; i < n; i++) {
          if (!to.has(R.id[i])) continue;
          const [a, b] = to.get(R.id[i]);
          if (a !== c && b !== c) continue;
          const x = i % w;
          for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < n && (labels[j] === c || (c === bg?.id && labels[j] < 0))) { d[i] = 1; front.push(i); break; }
        }
        for (let s = 2; front.length && s <= band + 1; s++) {
          const next = [];
          for (const i of front) {
            const x = i % w;
            for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < n && d[j] === Infinity && R.id[j] === R.id[i]) { d[j] = s; next.push(j); }
          }
          front = next;
        }
        return d;
      };
      const cols = new Set([...to.values()].flat()), dist = new Map([...cols].map((c) => [c, near(c)]));
      const pick = (i, t, da, db) => {
        // (to the colour the pixel itself is nearer, as the picture has it, when it is known: a pixel more than half
        // covered by a thin dark stroke is the stroke's. By distance, the tan blend that was most of a script F's
        // hairlines went to the panel round it and "Flowers" lost its F)
        if (img && img.data[i * 4 + 3] >= 128) {
          const P = srgbToLab(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]), A = lab(t[0]), B = lab(t[1]);
          const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], q = (P[0] - A[0]) * ab[0] + (P[1] - A[1]) * ab[1] + (P[2] - A[2]) * ab[2];
          return q <= 0.5 * (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2) ? t[0] : t[1];
        }
        return da <= db ? t[0] : t[1];
      };
      // (onto the fabric's side: the fabric as the picture has it there)
      const set = (i, c) => { labels[i] = c === bg?.id ? (labels0[i] < 0 ? -1 : bg.id) : c; out.slivers++; };
      const moved = new Int32Array(R.count);
      // (outward from the two colours a step at a time, each pixel to one beside it: picked by colour alone, a band's
      // pixels went to whichever side they matched, apart from it, and etsy_1 gained 8 magenta dots)
      const ring = [];
      for (let i = 0; i < n; i++) {
        const t = to.get(R.id[i]); if (!t) continue;
        const da = dist.get(t[0])[i], db = dist.get(t[1])[i];
        if (da <= band && db <= band) (ring[Math.min(da, db)] ||= []).push(i);
      }
      const side = (i, t) => { const x = i % w, got = new Set(); for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < n) { const l = labels[j] < 0 && bg ? bg.id : labels[j]; if (l === t[0] || l === t[1]) got.add(l); } return got; };
      for (const list of ring) for (const i of list || []) {
        const t = to.get(R.id[i]), got = side(i, t);
        if (!got.size) continue;
        set(i, got.size === 2 ? pick(i, t, dist.get(t[0])[i], dist.get(t[1])[i]) : [...got][0]); moved[R.id[i]]++;
      }
      // What is left of a band in pieces under `fleck` mm² goes the same way: left, its bits were dots on the
      // fabric, kept as an i's dot is and sewn each as a start of its own (etsy_1's stems: 21 more bare locks)
      const left = { w, h, data: new Uint8Array(n) };
      for (let i = 0; i < n; i++) left.data[i] = to.has(R.id[i]) && labels[i] === R.lab[R.id[i]] ? 1 : 0;
      const L2 = regionsOf(left.data, w, h), size = new Int32Array(L2.count);
      for (let i = 0; i < n; i++) size[L2.id[i]]++;
      let rest = [];
      for (let i = 0; i < n; i++) if (left.data[i] && size[L2.id[i]] < SHAPES.fleck * res * res && moved[R.id[i]]) rest.push(i);
      for (let more = true; more && rest.length;) {
        more = false;
        const still = [];
        for (const i of rest) {
          const t = to.get(R.id[i]), got = side(i, t);
          if (!got.size) { still.push(i); continue; }
          set(i, got.size === 2 ? pick(i, t, 0, 0) : [...got][0]); more = true;
        }
        rest = still;
      }
    }
  }

  // 2. Flecks. A piece of a sewn colour under `fleck` mm², most of its edge (`enclosed`) against sewn colours, joins the
  // one it shares most edge with. Kept on purpose: a piece of `dot` mm² or more of strong contrast to that colour
  // (`contrast`, ΔE00): an eye, a highlight, a letter's stroke. What goes is a shade of its neighbour or a speck.
  // Smallest first, each into a neighbour as it is after the merges before it. The fabric is never merged away (the
  // hole in a small e is a letter's counter) and never takes a fleck here: a dot on the fabric is build()'s to judge
  // (an i's dot, a full stop).
  const regionsNow = () => { const R = regionsOf(labels, w, h); return { R, M: measure(R, w, h) }; };
  if (opts.keep !== "all" && X.includes("f")) {
    const { R, M } = regionsNow(), fleck = SHAPES.fleck * res * res, root = R.lab.map((_, i) => i), col = R.lab.slice();
    const find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
    const order = [];
    for (let r = 0; r < R.count; r++) if (!fabric(R.lab[r]) && !inside(R.lab[r]) && M.area[r] < fleck) order.push(r);
    order.sort((a, b) => M.area[a] - M.area[b]);
    // (a piece of strong contrast to the colour it would join is drawn on purpose, whatever its shape: the letters of
    // "Embroidered Flowers" on a panel ringed with a tan blend went into the tan as flecks)
    const detail = (r, into) => M.area[r] >= SHAPES.dot * res * res && dE(lab(R.lab[r]), lab(into)) >= SHAPES.contrast;
    // (only into a region with body, 4 mm² and 1.5 mm wide somewhere, as foldFlecks: into a speck of another colour
    // the two came to over the 1.5 mm² a speck is, and were sewn: etsy_1 gained 18 trims)
    const body = (q) => M.area[q] >= 4 * res * res && 2 * M.half[q] >= 1.5 * res;
    for (const r of order) {
      // its neighbours now (merged regions answer for their pieces)
      const by = new Map();
      let all = 0, sewn = 0;
      for (const [q, k] of M.nb[r]) {
        const Q = find(q); if (Q === r) continue;
        all += k;
        if (fabric(col[Q])) continue;
        sewn += k; if (body(Q)) by.set(Q, (by.get(Q) || 0) + k);
      }
      if (!all || sewn < SHAPES.enclosed * all || !by.size) continue;
      const [[into]] = [...by.entries()].sort((p, q) => q[1] - p[1] || M.area[q[0]] - M.area[p[0]]);
      if (col[into] === R.lab[r] || detail(r, col[into])) continue;
      root[r] = into; out.merged++;
    }
    if (out.merged) for (let i = 0; i < n; i++) { const r = R.id[i], q = find(r); if (q !== r) labels[i] = col[q]; }
  }

  // 3. Smooth edges (Merriman, Bence & Osher's threshold dynamics, 1992: each colour's area blurred, each pixel to the
  // colour strongest there; one step moves every edge toward a smooth curve by its curvature, so pixel stairs and
  // a JPEG's ragged edges go and the colours still meet with no gap or overlap). The blur is three box passes,
  // `smooth` mm across in all (σ about a third of it). Never changed: the lines (under `thin` mm wide), the kept dots and
  // the fabric's pieces closed in by the design (a letter's counter), which a blur that wide would close up.
  if (SHAPES.smooth > 0 && X.includes("s")) {
    const R = regionsOf(labels, w, h), M = measure(R, w, h);
    const fixed = new Uint8Array(n), thin = SHAPES.thin * res;
    const touchesEdge = new Uint8Array(R.count);
    for (let x = 0; x < w; x++) { touchesEdge[R.id[x]] = 1; touchesEdge[R.id[(h - 1) * w + x]] = 1; }
    for (let y = 0; y < h; y++) { touchesEdge[R.id[y * w]] = 1; touchesEdge[R.id[y * w + w - 1]] = 1; }
    for (let i = 0; i < n; i++) {
      const r = R.id[i], L = R.lab[r];
      if (2 * M.half[r] < thin || ((fabric(L) || inside(L)) && !touchesEdge[r] && M.area[r] < 4 * res * res)) fixed[i] = 1;
    }
    // and a wide region's thin parts: no disc `thin` mm across inside the region reaches them (a stem out of its leaf, a
    // letter's hairline: the blur took the thin strokes off "Embroidered Flowers" and left the thick ones)
    {
      const r = thin / 2, core = { w, h, data: new Uint8Array(n) };
      for (let i = 0; i < n; i++) core.data[i] = M.dt[i] + 1 > r ? 0 : 1;
      const to = distanceTransform(core);
      for (let i = 0; i < n; i++) if (to[i] > r + 0.5) fixed[i] = 1;
    }
    const rad = Math.max(1, Math.round(((SHAPES.smooth / 2) * res) / Math.sqrt(3)));
    const present = [...new Set(R.lab)], key = (l) => (fabric(l) ? -2 : l);
    const groups = [...new Set(present.map(key))];
    const best = new Float32Array(n).fill(-1), arg = new Int16Array(n).fill(-3), f = new Float32Array(n), t = new Float32Array(n);
    const blur = (a, b) => {   // one box pass along x then y, a -> a (b scratch)
      for (let y = 0; y < h; y++) {
        let s = 0; const o = y * w;
        for (let x = -rad; x <= rad; x++) s += a[o + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) { b[o + x] = s / (2 * rad + 1); s += a[o + Math.min(w - 1, x + rad + 1)] - a[o + Math.max(0, x - rad)]; }
      }
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let y = -rad; y <= rad; y++) s += b[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) { a[y * w + x] = s / (2 * rad + 1); s += b[Math.min(h - 1, y + rad + 1) * w + x] - b[Math.max(0, y - rad) * w + x]; }
      }
    };
    for (const g of groups) {
      for (let i = 0; i < n; i++) f[i] = key(labels[i]) === g ? 1 : 0;
      for (let p = 0; p < 3; p++) blur(f, t);
      // (a pixel keeps its colour on a tie)
      for (let i = 0; i < n; i++) { const v = f[i] + (key(labels[i]) === g ? 1e-4 : 0); if (v > best[i]) { best[i] = v; arg[i] = g; } }
    }
    const next = labels.slice();
    for (let i = 0; i < n; i++) {
      if (fixed[i] || arg[i] === key(labels[i])) continue;
      // (nor onto a fixed pixel's place, and never a colour that isn't beside it: the blur reaches past a thin line)
      let to = -3;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < n && key(labels[j]) === arg[i]) { to = labels[j]; break; }
      if (to === -3) continue;
      next[i] = to; out.smoothed++;
    }
    labels = next;
  }
  return { labels, ...out };
}

// Back to front (research I3; how a person digitizes: the shape behind sewn first and whole, what lies on it after).
// Colour b is in front of colour a when most of b's edge (`front` of it) lies on a, and its share is twice a's share
// on b: a rose's dark shading lies on its pink; the pink isn't on the shading. Otherwise light before dark, as before
// (dark details sewn last show on top). ids: the colours to sew, light first. Returns them in sewing order.
export function layerOrder(labels, w, h, cols) {
  const K = cols.length, at = new Map(cols.map((c, k) => [c.id, k])), E = new Float64Array(K * K), tot = new Float64Array(K), n = w * h;
  const edge = (a, b) => {
    const ka = at.get(a), kb = at.get(b);
    if (ka !== undefined) tot[ka]++;
    if (kb !== undefined) tot[kb]++;
    if (ka !== undefined && kb !== undefined) { E[ka * K + kb]++; E[kb * K + ka]++; }
  };
  for (let i = 0; i < n; i++) {
    const x = i % w;
    if (x < w - 1 && labels[i + 1] !== labels[i]) edge(labels[i], labels[i + 1]);
    if (i + w < n && labels[i + w] !== labels[i]) edge(labels[i], labels[i + w]);
  }
  // before[b]: the colours b lies on
  const before = Array.from({ length: K }, () => new Set());
  for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) {
    if (a === b || !tot[a] || !tot[b]) continue;
    const onA = E[a * K + b] / tot[b], onB = E[a * K + b] / tot[a];
    if (onA >= SHAPES.front && onA >= 2 * onB) before[b].add(a);
  }
  const out = [], done = new Uint8Array(K);
  while (out.length < K) {
    // (the first colour, light first, whose colours behind are all sewn; none when they ring each other: light first)
    let k = cols.findIndex((_, q) => !done[q] && [...before[q]].every((a) => done[a]));
    if (k < 0) k = cols.findIndex((_, q) => !done[q]);
    done[k] = 1; out.push(cols[k]);
  }
  return out;
}
