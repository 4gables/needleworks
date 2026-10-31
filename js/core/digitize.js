/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Picture -> embroidery. Reduce to a few thread colours, then stitch each shape by its width:
// hairlines get a double running stitch along their centre; every shape with width gets a solid tatami fill.
// Other styles: line drawing (`lineArt`) and cross-stitch (`crossStitch`).
import { Design } from "./design.js";
import { arclen, followRun } from "./geom.js";
import { MARGIN } from "./machines.js";
import { distanceTransform, label, order, skeletonEdges } from "./raster.js";
import { PEC_MATCH, hexToRgb, nearestBrotherThread, pecThread, rgbToHex } from "./threads.js";

export const DEFAULTS = {
  colors: 6,          // thread colours (not counting background)
  sizeMm: 100,        // longest side of the finished design
  removeBackground: true,
  fillAngle: 45,      // degrees
  density: 0.35,      // mm between fill rows (DENSITY.solid)
  res: 8,             // working pixels per mm (5 lost the narrow notches of small lettering, e.g. an M)
};

// fill row spacing in mm. Solid covers the fabric; standard is lighter and faster. 0.3 fails the PE900 check:
// the links between rows become stitches under 0.3 mm, which nest.
export const DENSITY = { solid: 0.35, standard: 0.4 };
// A colour's fill reaches this far (mm) under the colours sewn after it, so thread pull can't open a gap of fabric
// where two colours meet (digitizing guides: 0.2-0.4 mm).
const OVERLAP = 0.35;
// Moves between parts of one colour up to this far (mm) travel under stitches still to come rather than jump
const TRAVEL = 10;
// Travel may lie on this colour's finished stitches for this far (mm) in all: a few stitches of the same thread on its
// own fill against a trim, two locks and often a loose thread to snip (2 mm until 2026-10-30: 3 mm took 5-15% of the
// trims and a third of the loose threads off the batch pictures)
const SEWN = 3;
// Parts of a shape narrower than twice this (mm) get no fill rows and are sewn along their centre instead
const THIN_PART = 0.35;

// Gaps narrower than 0.5 mm between parts of one colour (between small letters, inside an M's notch) close up once
// sewn. Returns their area in mm²: a morphological closing of the colour, minus the colour, counted only where the
// fabric would show (not where another stitched colour fills the gap), ignoring corner tips.
const MIN_GAP = 0.5;
function narrowGaps(mask, res, open) {
  const { w, h, data } = mask, r = (MIN_GAP / 2) * res, n = w * h;
  const out = distanceTransform({ w, h, data: data.map((v) => 1 - v) });
  const dil = { w, h, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) dil.data[i] = data[i] || out[i] <= r ? 1 : 0;
  const inn = distanceTransform(dil), gap = { w, h, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) gap.data[i] = !data[i] && open(i) && inn[i] > r ? 1 : 0;
  // every sharp inside corner (an N's, a V's) narrows to a point: only a gap that stays narrow over a length counts
  const { labels, count } = label(gap), size = new Array(count + 1).fill(0);
  for (let i = 0; i < n; i++) size[labels[i]]++;
  let mm2 = 0;
  for (let c = 1; c <= count; c++) if (size[c] / (res * res) >= 0.3) mm2 += size[c] / (res * res);
  return mm2;
}

// ---------- colour ----------
function srgbToLab(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = f(r), G = f(g), B = f(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B,
    Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))];
}

// CIEDE2000 colour difference of two Lab colours (Sharma, Wu & Dalal 2005). Plain Lab distance overweights chroma:
// it sent an olive green to Russet Brown and a teal to Pewter.
function deltaE2000([L1, a1, b1], [L2, a2, b2], kL = 1, kH = 1) {
  const rad = Math.PI / 180, C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const p1 = (1 + G) * a1, p2 = (1 + G) * a2, c1 = Math.hypot(p1, b1), c2 = Math.hypot(p2, b2);
  const h = (b, a) => { if (!a && !b) return 0; const t = Math.atan2(b, a) / rad; return t < 0 ? t + 360 : t; };
  const h1 = h(b1, p1), h2 = h(b2, p2), dL = L2 - L1, dC = c2 - c1;
  let dh = 0;
  if (c1 * c2) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh / 2) * rad), Lm = (L1 + L2) / 2, cm = (c1 + c2) / 2;
  let hm = h1 + h2;
  if (c1 * c2) { if (Math.abs(h1 - h2) > 180) hm += hm < 360 ? 360 : -360; hm /= 2; }
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  let SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * cm, SH = 1 + 0.015 * cm * T;
  const RT = -2 * Math.sqrt(cm ** 7 / (cm ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  SL *= kL; SH *= kH;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

// k-means (k-means++ seeding) on Lab colours of opaque pixels
function kmeans(lab, idxs, k, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const sample = idxs.length > 30000 ? Array.from({ length: 30000 }, () => idxs[Math.floor(rnd() * idxs.length)]) : idxs;
  const C = [lab.slice(sample[0] * 3, sample[0] * 3 + 3)];
  const d2 = (i, c) => { const a = lab[i * 3] - c[0], b = lab[i * 3 + 1] - c[1], e = lab[i * 3 + 2] - c[2]; return a * a + b * b + e * e; };
  while (C.length < k) {
    const ds = sample.map((i) => Math.min(...C.map((c) => d2(i, c))));
    const tot = ds.reduce((a, b) => a + b, 0);
    if (tot === 0) break;
    let r = rnd() * tot, j = 0;
    while (r > ds[j] && j < ds.length - 1) r -= ds[j++];
    C.push(lab.slice(sample[j] * 3, sample[j] * 3 + 3));
  }
  for (let it = 0; it < 15; it++) {
    const sum = C.map(() => [0, 0, 0, 0]);
    for (const i of sample) {
      let best = 0, bd = Infinity;
      C.forEach((c, j) => { const v = d2(i, c); if (v < bd) { bd = v; best = j; } });
      const t = sum[best]; t[0] += lab[i * 3]; t[1] += lab[i * 3 + 1]; t[2] += lab[i * 3 + 2]; t[3]++;
    }
    sum.forEach((t, j) => { if (t[3]) C[j] = [t[0] / t[3], t[1] / t[3], t[2] / t[3]]; });
  }
  return C;
}

// ---------- quantise the picture into colour regions ----------
// A picture framed by a band at its edge (a photo of a framed piece, a product card with a coloured border): the
// border colour isn't the background, and the frame isn't part of the design. Returns the frame's pixels, or null.
// The inset ring is clean where one colour has 85% of it for 2% of the picture's size inwards; when the edge ring isn't
// clean but one within 8% is, every piece of another colour that stays within that band (to the end of the clean rings) is
// the frame. (A flower that runs off the edge reaches further in, so it stays.)
function findFrame(labels, w, h, C) {
  // colours within ΔE 10 count as one (a lit backdrop's weave splits into two shades)
  const fam = C.map((_, j) => j);
  for (let a = 0; a < C.length; a++) for (let b = 0; b < a; b++)
    if (Math.hypot(C[a][0] - C[b][0], C[a][1] - C[b][1], C[a][2] - C[b][2]) < 10) { const f = fam[a]; for (let j = 0; j < C.length; j++) if (fam[j] === f) fam[j] = fam[b]; }
  const F = (l) => (l < 0 ? -1 : fam[l]);
  const ring = (f) => {
    const x0 = Math.round(f * w), y0 = Math.round(f * h), x1 = w - 1 - x0, y1 = h - 1 - y0, cnt = new Map();
    if (x1 <= x0 || y1 <= y0) return [-1, 0];
    const add = (i) => cnt.set(F(labels[i]), (cnt.get(F(labels[i])) || 0) + 1);
    for (let x = x0; x <= x1; x++) { add(y0 * w + x); add(y1 * w + x); }
    for (let y = y0 + 1; y < y1; y++) { add(y * w + x0); add(y * w + x1); }
    let best = -1, bn = 0, all = 0;
    for (const [l, k] of cnt) { all += k; if (k > bn) { bn = k; best = l; } }
    return [best, bn / all];
  };
  const rings = [];
  for (let k = 0; k <= 20; k++) rings.push(ring(k * 0.005));
  const clean = (k) => rings[k][0] >= 0 && rings.slice(k, k + 5).every(([l, s]) => l === rings[k][0] && s >= 0.85);
  if (clean(0)) return null;
  let k = 1; while (k <= 16 && !clean(k)) k++;
  if (k > 16) return null;
  const bx = Math.round((k + 4) * 0.005 * w) + 1, by = Math.round((k + 4) * 0.005 * h) + 1, inside = rings[k][0];   // (to the end of the clean rings)
  const band = (x, y) => x < bx || y < by || x >= w - bx || y >= h - by;
  const seen = new Uint8Array(w * h), frame = new Uint8Array(w * h);
  let any = false;
  for (let s = 0; s < w * h; s++) {
    const sx = s % w, sy = (s - sx) / w;
    if (seen[s] || labels[s] < 0 || F(labels[s]) === inside || !band(sx, sy)) continue;
    const l = labels[s], st = [s], comp = [];
    let within = true;
    seen[s] = 1;
    while (st.length) {
      const i = st.pop(), x = i % w, y = (i - x) / w;
      comp.push(i);
      if (!band(x, y)) within = false;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && !seen[j] && labels[j] === l) { seen[j] = 1; st.push(j); }
    }
    if (within) { for (const i of comp) frame[i] = 1; any = true; }
  }
  return any ? { frame, inset: k * 0.005 } : null;
}

// The picture's colours are learned once per picture (`learnColours`) from a copy at a fixed size, so the threads
// don't change with Size or Turn hoop (a turned etsy_1 swapped its olive greens for Warm Gray and Lavender: k-means
// had seen different pixels). FINE clusters are learned, the background's shades set aside, and the rest merged two
// at a time, cheapest first, down to the threads asked for. Each count's threads are the next count's with one split
// in two, so asking for more colours never loses one that fewer had.
const FINE = 24;
// colours closer than this (CIEDE2000) are one thread whatever was asked for
const SAME = 7;
// a colour (and a thread) with more chroma than this has a hue; threads within HUE degrees of it keep that hue
const HUED = 4, HUE = 35;
// degrees between two Lab colours' hues
const hueOff = (p, q) => { const d = (Math.abs(Math.atan2(p[2], p[1]) - Math.atan2(q[2], q[1])) * 180) / Math.PI; return d > 180 ? 360 - d : d; };
// Hue families (Lab hue angles where Brother's own thread names change): red/pink, orange/brown, yellow (to Lemon
// Yellow at 108), green (from Fresh Green at 110), blue, purple. Colour science puts a pale sage (hue 115) as near
// Cream Brown (107) or Beige (96) as Mint Green (131), but it reads green and they read yellow and tan.
const FAMILY = [40, 85, 109, 170, 290, 345];
const hueAt = (p) => ((Math.atan2(p[2], p[1]) * 180) / Math.PI + 360) % 360;
const familyOf = (h) => { const i = FAMILY.findIndex((e) => h < e); return i < 0 ? 0 : i; };
// 0 when q is in p's family, else how far p's hue is inside its own family (in full 4 degrees from the edge)
const across = (p, q) => {
  const h = hueAt(p), f = familyOf(h);
  if (f === familyOf(hueAt(q))) return 0;
  const d = (e) => { const t = Math.abs(h - e) % 360; return t > 180 ? 360 - t : t; };
  return Math.min(1, Math.min(d(FAMILY[(f + 5) % 6]), d(FAMILY[f])) / 4);
};

// Lab of every opaque pixel (-1: see-through)
function pixels(img) {
  const { width: w, height: h, data } = img, n = w * h, lab = new Float32Array(n * 3), opaque = [];
  let clear = 0;
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] < 128) { clear++; continue; }
    const L = srgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    lab[i * 3] = L[0]; lab[i * 3 + 1] = L[1]; lab[i * 3 + 2] = L[2];
    opaque.push(i);
  }
  return { w, h, n, lab, opaque, hasAlpha: clear > n * 0.02 };
}
const nearestOf = (lab, i, C) => {
  let best = 0, bd = Infinity;
  for (let j = 0; j < C.length; j++) {
    const a = lab[i * 3] - C[j][0], b = lab[i * 3 + 1] - C[j][1], e = lab[i * 3 + 2] - C[j][2], v = a * a + b * b + e * e;
    if (v < bd) { bd = v; best = j; }
  }
  return best;
};

// k-means clusters of the pixels not in `skip`, learned from flat pixels only (anti-aliased edges blend two colours
// and would steal a thread), and each pixel's cluster
function cluster(P, k, skip) {
  const { w, n, lab } = P, opaque = skip ? P.opaque.filter((i) => !skip[i]) : P.opaque;
  const flat = opaque.filter((i) => {
    const x = i % w;
    if (x === 0 || x === w - 1 || i < w || i >= n - w) return true;
    let m = 0;
    for (const j of [i - 1, i + 1, i - w, i + w]) {
      const a = lab[i * 3] - lab[j * 3], b = lab[i * 3 + 1] - lab[j * 3 + 1], e = lab[i * 3 + 2] - lab[j * 3 + 2];
      m = Math.max(m, a * a + b * b + e * e);
    }
    return m < 36;   // ΔE < 6 to every neighbour
  });
  const train = flat.length > opaque.length * 0.2 ? flat : opaque, C = [];
  if (train.length) for (const c of kmeans(lab, train, Math.min(k, train.length)))
    if (!C.some((d) => (c[0] - d[0]) ** 2 + (c[1] - d[1]) ** 2 + (c[2] - d[2]) ** 2 < 4)) C.push(c);
  const labels = new Int16Array(n).fill(-1);
  for (const i of opaque) labels[i] = nearestOf(lab, i, C);
  return { C, labels };
}

// The picture's threads, learned from `img` (any size: the Picture tab sends the same copy whatever the Size).
// Returns { C: fine clusters (Lab), map: fine cluster -> colour id, colors, bg (the background's id, or -1), frame
// (a mask over img, or null), boxes: each colour's extent as fractions of img [x0, y0, x1, y1], merged, empty }.
export function learnColours(img, opts = {}) {
  const o = { ...DEFAULTS, ...opts }, P = pixels(img), { w, h, n, opaque, hasAlpha } = P, { data } = img;
  const cut = o.removeBackground && !hasAlpha;
  let { C, labels } = cluster(P, FINE, null), frame = null;
  // a frame (a band at the picture's edge) isn't part of the design, and isn't the background: learn again without it
  // (found on a coarse clustering: fine clusters chain a backdrop's shades into the frame's colour family)
  if (cut && C.length) {
    const q = cluster(P, 5, null);
    frame = findFrame(q.labels, w, h, q.C);
    if (frame) ({ C, labels } = cluster(P, FINE, frame.frame));
  }
  const K = C.length, area = new Array(K).fill(0), rgb = C.map(() => [0, 0, 0]);
  for (let i = 0; i < n; i++) {
    const l = labels[i]; if (l < 0) continue;
    area[l]++; rgb[l][0] += data[i * 4]; rgb[l][1] += data[i * 4 + 1]; rgb[l][2] += data[i * 4 + 2];
  }
  // background = the most common colour along the border, or just inside a frame (the five clean rings: the first
  // can run along the frame's blended inner edge); only when the picture has no transparency
  let bg = -1, ring = () => 0;
  if (cut && K) {
    const cnt = new Map(), add = (i) => { if (labels[i] >= 0) cnt.set(labels[i], (cnt.get(labels[i]) || 0) + 1); };
    for (let r = 0; r < (frame ? 5 : 1); r++) {
      const f = frame ? frame.inset + r * 0.005 : 0;
      const x0 = Math.round(f * w), y0 = Math.round(f * h), x1 = w - 1 - x0, y1 = h - 1 - y0;
      for (let x = x0; x <= x1; x++) { add(y0 * w + x); add(y1 * w + x); }
      for (let y = y0; y <= y1; y++) { add(y * w + x0); add(y * w + x1); }
    }
    const all = [...cnt.values()].reduce((a, b) => a + b, 0);
    bg = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
    ring = (j) => (cnt.get(j) || 0) / Math.max(1, all);
  }
  // shades of the background (a white box on an off-white page, paper texture, a lit backdrop's weave) are background
  // too: within ΔE 8 (a pale design colour is further off), within 15 and a tenth of the border, or within 20 and 3%
  // of it (a shadow across the backdrop)
  const e76 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const isBg = (j) => bg >= 0 && (j === bg || e76(C[j], C[bg]) < 8 || (e76(C[j], C[bg]) < 15 && ring(j) >= 0.1) || (e76(C[j], C[bg]) < 20 && ring(j) >= 0.03));
  // Merge the design's clusters, cheapest first: the colour difference, made cheaper for a cluster that is small or
  // mostly edge (anti-aliasing, JPEG noise) so it joins its nearest colour first. A small colour of its own (a pink
  // flower, a yellow bird) outlasts the shades of one dark outline. The difference weighs hue more (kH 0.6), so
  // distinct hues beat light and dark shades of one, and dark colours' hue fades out below L 30 (thread that dark
  // reads as black: etsy_5's outline took Dark Gray, Dark Brown, Black and Dark Olive).
  // Two colours of different hues (over 45 degrees apart, both with a hue) cost up to 30% more to merge: at 5
  // colours etsy_1's pale pink flowers joined the lilac ones (one grey-mauve thread) rather than two blues or two greens.
  // Two of different hue families cost 70% more (ΔE weighs a vivid yellow against a pale sage as little as a pink
  // against a red: etsy_2's daffodils and tansy were sage green to 6 colours), and a colour with a hue against a
  // grey, white or black one 50% more (it would lose the hue: etsy_5's lawn joined the black outline, not Woodstock).
  // A big colour (a tenth of the design) costs up to 50% more to merge than a small one: etsy_8's red and pink roses
  // were one Amber Red at 6 colours while its teal and blue flowers had a thread each.
  const dim = ([L, a, b]) => { const f = Math.min(1, L / 30); return [L, a * f, b * f]; };
  const apart = (p, q) => {
    const P = dim(p), Q = dim(q), v = deltaE2000(P, Q, 1, 0.6), cp = Math.hypot(P[1], P[2]), cq = Math.hypot(Q[1], Q[2]);
    const lo = Math.min(cp, cq), hi = Math.max(cp, cq);
    if (hi <= HUED) return v;
    const grey = Math.min(1, Math.max(0, (10 - lo) / 6)), hue = lo <= HUED ? 0 : Math.min(1, lo / 8) *
      Math.max(0.3 * Math.min(1, Math.max(0, hueOff(P, Q) - 45) / 45), 0.7 * Math.max(across(P, Q), across(Q, P)));
    return v * (1 + grey * 0.5 * Math.min(1, (hi - HUED) / 8) + (1 - grey) * hue);
  };
  const ink = [];
  for (let j = 0; j < K; j++) if (area[j] && !isBg(j)) ink.push(j);
  const A = ink.reduce((s, j) => s + area[j], 0) || 1;
  // A group's solid pixels are those whose 4 neighbours are in it too (a textured white splits into shades none of
  // which is solid on its own): pixels counted by the set of clusters round them, as bit masks
  // (and their colour, summed per set: a group's colour is its solid pixels' mean)
  const sets = new Map(), tone = new Map();
  for (let i = w; i < n - w; i++) {
    const x = i % w; if (x === 0 || x === w - 1) continue;
    const q = [labels[i], labels[i - 1], labels[i + 1], labels[i - w], labels[i + w]];
    if (q.some((v) => v < 0)) continue;
    const m = q.reduce((s, v) => (s | (1 << v)) >>> 0, 0) * 32 + labels[i];
    sets.set(m, (sets.get(m) || 0) + 1);
    const t = tone.get(m) || tone.set(m, [0, 0, 0]).get(m);
    t[0] += data[i * 4]; t[1] += data[i * 4 + 1]; t[2] += data[i * 4 + 2];
  }
  const effOf = (g) => {
    const gm = g.members.reduce((s, v) => (s | (1 << v)) >>> 0, 0);
    let k = 0; for (const [m, c] of sets) if (!(Math.floor(m / 32) & ~gm)) k += c;
    return g.area * Math.min(1, Math.max(0.05, k / g.area / 0.5));
  };
  let groups = ink.map((j) => ({ lab: C[j].slice(), area: area[j], members: [j] }));
  for (const g of groups) g.eff = effOf(g);
  const weight = (g) => Math.min(1, Math.sqrt(g.eff / (0.005 * A))) * (1 + 0.5 * Math.min(1, g.eff / (0.1 * A))), bgLab = bg >= 0 ? C[bg] : null;
  const join = (a, b) => {   // b into a
    const t = a.area + b.area;
    a.lab = a.lab.map((v, q) => (v * a.area + b.lab[q] * b.area) / t);
    a.area = t; a.members.push(...b.members); a.eff = effOf(a);
  };
  const toBg = [];
  for (;;) {
    let best = null;
    for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        const c = apart(groups[a].lab, groups[b].lab) * Math.min(weight(groups[a]), weight(groups[b]));
        if (!best || c < best.c) best = { c, a, b };
      }
      // (into the background only when it's that close: a white dog on a pale blue backdrop stays)
      if (bgLab) { const c = apart(groups[a].lab, bgLab) * weight(groups[a]); if (c < SAME && (!best || c < best.c)) best = { c, a, b: -1 }; }
    }
    if (!best || (groups.length <= o.colors && best.c >= SAME)) break;
    if (best.b < 0) { toBg.push(...groups[best.a].members); groups.splice(best.a, 1); continue; }
    const [a, b] = groups[best.a].area >= groups[best.b].area ? [best.a, best.b] : [best.b, best.a];
    join(groups[a], groups[b]); groups.splice(b, 1);
  }
  // Threads: each colour the nearest Brother thread no bigger colour took. A colour whose own thread was taken and whose
  // next is far off (a pale green given "Russet Brown") joins the colour that took it: one thread fewer, but none wrong.
  const pec = PEC_MATCH.map((t) => (t ? srgbToLab(t[1], t[2], t[3]) : null));
  // (the colour of its solid parts: edge pixels blend into their neighbours, and turned a yellow "Light Brown"; the
  // solid pixels' own colours, not their clusters' means: those take in every blended pixel nearest them, and greyed
  // etsy_1's pinks from C 7 to 3)
  const pictureOf = (g) => {
    const s = [0, 0, 0]; let k = 0;
    const gm = g.members.reduce((t, v) => (t | (1 << v)) >>> 0, 0);
    for (const [m, c] of sets) if (!(Math.floor(m / 32) & ~gm)) { const t = tone.get(m); s[0] += t[0]; s[1] += t[1]; s[2] += t[2]; k += c; }
    if (!k) for (const j of g.members) { s[0] += rgb[j][0]; s[1] += rgb[j][1]; s[2] += rgb[j][2]; k += area[j]; }
    return s.map((v) => Math.round(v / Math.max(1, k)));
  };
  // A colour with a hue keeps it: a grey thread counts as further away the more colourful the colour is (x1.9 at
  // chroma 15; threads under chroma 10 count as grey in part: Warm Gray is 5), and so, gradually, does a thread of
  // another hue (over HUE degrees off, in full from 90), and half that for one of another hue family. Brother's
  // threads have no sage or dusty blue: nearest by difference alone, etsy_1's sage leaves were "Gray" and its blue
  // flowers "Silver", so the picture sewed as grey silhouettes; etsy_2's sage stems were Beige.
  const cost = (lab, q) => {
    const v = deltaE2000(lab, q), c = Math.hypot(lab[1], lab[2]) * Math.min(1, lab[0] / 30);
    if (c <= HUED) return v;
    const k = 0.08 * (c - HUED), grey = Math.min(1, Math.max(0, (10 - Math.hypot(q[1], q[2])) / 6));
    const off = Math.max(Math.min(1, Math.max(0, hueOff(lab, q) - HUE) / 55), 0.5 * across(lab, q));
    return v * (1 + k * (grey + (1 - grey) * off));
  };
  // A colour made of several (merged at a low count) takes the thread that suits most of its solid parts best, each
  // part's difference capped at FAR: the thread nearest their mean suited none of them (etsy_5's grass and Woodstock
  // were Russet Brown, etsy_3's yellow and tan flowers Khaki, etsy_8's red roses and black outline Dark Fuchsia).
  const FAR = 20;
  const partsOf = (g) => {
    const gm = g.members.reduce((t, v) => (t | (1 << v)) >>> 0, 0), sum = new Map();
    for (const [m, c] of sets) if (!(Math.floor(m / 32) & ~gm)) {
      const j = m % 32, t = tone.get(m), u = sum.get(j) || sum.set(j, [0, 0, 0, 0]).get(j);
      u[0] += t[0]; u[1] += t[1]; u[2] += t[2]; u[3] += c;
    }
    const parts = [...sum.values()].map((u) => ({ lab: srgbToLab(u[0] / u[3], u[1] / u[3], u[2] / u[3]), w: u[3] }));
    return parts.length ? parts : g.members.map((j) => ({ lab: C[j], w: area[j] }));
  };
  const fit = (parts, q) => { let s = 0, t = 0; for (const p of parts) { s += p.w * Math.min(FAR, cost(p.lab, q)); t += p.w; } return s / t; };
  // (nor the background's thread, unless it's that colour: etsy_7's pale grey lines on white were "White")
  const bgHex = bg >= 0 ? rgbToHex(rgb[bg].map((v) => Math.round(v / Math.max(1, area[bg])))) : null;
  const bgThread = bgHex ? nearestBrotherThread(bgHex).index : -1;
  for (;;) {
    groups.sort((a, b) => b.area - a.area);
    const taken = new Map();
    let worse = null;
    for (const g of groups) {
      g.picture = rgbToHex(pictureOf(g)); g.parts = partsOf(g);
      let best = -1, bd = Infinity, own = -1, od = Infinity;
      pec.forEach((q, i) => {
        if (!q) return;
        const v = fit(g.parts, q);
        if (i === bgThread && v > SAME) return;
        if (v < od) { od = v; own = i; }
        if (!taken.has(i) && i !== g.ban && v < bd) { bd = v; best = i; }
      });
      g.own = od; g.got = bd;
      if (best < 0) continue;
      if (best !== own && bd > Math.max(15, od + 10) && !worse) worse = [g, taken.get(own), own];
      taken.set(best, g); g.thread = pecThread(best);
    }
    if (!worse) break;
    // (unless the colour that took it has another thread that is near enough: then it moves over, once. etsy_1's
    // lilac took Lavender and its blue flowers, closer to Lavender, had none left at 6 colours)
    const [g, by, own] = worse;
    if (by.ban === undefined && by.got <= Math.max(15, by.own + 10) && g.ban === undefined) {
      const alt = Math.min(...pec.map((q, i) => (q && i !== own && !taken.has(i) && (i !== bgThread || fit(by.parts, q) <= SAME) ? fit(by.parts, q) : Infinity)));
      if (alt <= Math.max(15, by.own + 10)) { by.ban = own; continue; }
    }
    join(by, g); groups.splice(groups.indexOf(g), 1);
  }
  groups.sort((a, b) => b.area - a.area);
  const map = new Int16Array(K).fill(-1), colors = groups.map((g, id) => {
    for (const j of g.members) map[j] = id;
    return { id, hex: g.thread.hex, picture: g.picture, thread: g.thread, lightness: g.lab[0], background: false };
  });
  if (bg >= 0) {
    const id = colors.length;
    for (let j = 0; j < K; j++) if (map[j] < 0) map[j] = id;
    colors.push({ id, hex: bgHex, picture: bgHex, thread: nearestBrotherThread(bgHex), lightness: C[bg][0], background: true });
  }
  // each colour's extent (pieces over 0.02% of the picture: a stray speck doesn't make the design bigger)
  const boxes = colors.map(() => [1, 1, 0, 0]);
  {
    const seen = new Uint8Array(n), min = n * 0.0002;
    for (let s = 0; s < n; s++) {
      if (seen[s] || labels[s] < 0) continue;
      const id = map[labels[s]], st = [s];
      let k = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      seen[s] = 1;
      while (st.length) {
        const i = st.pop(), x = i % w, y = (i - x) / w;
        k++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
          if (j >= 0 && !seen[j] && labels[j] >= 0 && map[labels[j]] === id) { seen[j] = 1; st.push(j); }
      }
      if (k < min) continue;
      const b = boxes[id];
      b[0] = Math.min(b[0], x0 / w); b[1] = Math.min(b[1], y0 / h); b[2] = Math.max(b[2], (x1 + 1) / w); b[3] = Math.max(b[3], (y1 + 1) / h);
    }
  }
  // nothing to sew: say why, in words that point at something the user can still do
  let empty = "";
  if (!groups.length) {
    if (!opaque.length) empty = "This picture is empty (it's all see-through), so there's nothing in it to stitch.";
    else if (C.every((c) => e76(c, C[bg >= 0 ? bg : 0]) < 15)) empty = "This picture is all one colour, so there's nothing in it to stitch.";
    else empty = "Everything in this picture is close to its background colour. Untick “Leave the background unstitched” to stitch it all.";
  }
  const lost = groups.length ? lostLines(P, labels.map((l) => (l >= 0 ? map[l] : -1)), colors) / Math.max(w, h) : 0;
  return { w, h, C, map, colors, bg: bg >= 0 ? colors.length - 1 : -1, frame, boxes, hasAlpha,
    merged: Math.max(0, o.colors - groups.length), empty, lost };
}

// Label a picture's pixels with the colours learned from it (possibly from a copy at another size). `crop`
// [x0, y0, x1, y1] is the part of the learned copy img shows (fractions; default the whole).
export function labelWith(img, model, crop = [0, 0, 1, 1]) {
  const P = pixels(img), { w, h, n, lab, opaque } = P;
  let labels = new Int16Array(n).fill(-1);
  // the frame's pixels, found in the learned copy
  let frame = null;
  if (model.frame) {
    const F = model.frame.frame, fw = model.w, fh = model.h;
    frame = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const fy = Math.min(fh - 1, Math.floor((crop[1] + ((y + 0.5) / h) * (crop[3] - crop[1])) * fh));
      for (let x = 0; x < w; x++) {
        const fx = Math.min(fw - 1, Math.floor((crop[0] + ((x + 0.5) / w) * (crop[2] - crop[0])) * fw));
        if (F[fy * fw + fx]) frame[y * w + x] = 1;
      }
    }
  }
  // (no folding of colours that are mostly edge into their neighbours, as raw k-means clusters needed: the colours
  // here are merged already, and folding sent etsy_7's thin pastel doodles into the background)
  const G = model.colors.length;
  for (const i of opaque) if (!(frame && frame[i])) labels[i] = model.map[nearestOf(lab, i, model.C)];
  // majority filter cleans anti-aliased fringes and speckle
  for (let pass = 0; pass < 2; pass++) {
    const out = labels.slice(), cnt = new Int16Array(G + 1);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      cnt.fill(0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cnt[labels[(y + dy) * w + x + dx] + 1]++;
      let best = 0; for (let j = 1; j < cnt.length; j++) if (cnt[j] > cnt[best]) best = j;
      if (cnt[best] >= 5) out[y * w + x] = best - 1;
    }
    labels = out;
  }
  if (frame) {
    // (the frame's blended inner edge, read as a colour of its own once the frame is gone, is the frame too)
    for (let i = 0; i < n; i++) if (frame[i]) labels[i] = -1;
    const L = labels.slice();
    for (let i = 0; i < n; i++) {
      if (L[i] < 0 || L[i] === model.bg) continue;
      const x = i % w, y = (i - x) / w;
      search: for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h && frame[Y * w + X]) { labels[i] = -1; break search; }
      }
    }
  }
  const area = new Array(G).fill(0);
  for (let i = 0; i < n; i++) if (labels[i] >= 0) area[labels[i]]++;
  const colors = model.colors.map((c) => ({ ...c, area: area[c.id] }));
  return { w, h, labels, colors, merged: model.merged, frame: !!model.frame, empty: model.empty, lost: model.lost || 0 };
}

// The longest line in the picture too thin to keep (px along it): a pixel or two wide, unlike the fabric (ΔE over 20)
// yet read as fabric, 2 px clear of anything sewn (not the blend round a shape's edge). A logo's 1 px grey rule
// vanished without a word. (`labels`: colour ids)
function lostLines(P, labels, colors) {
  const { w, h, n, lab } = P, bg = colors.find((c) => c.background);
  if (!bg) return 0;
  const B = srgbToLab(...hexToRgb(bg.picture || bg.hex)), m = { w, h, data: new Uint8Array(n) }, ink = { w, h, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) ink.data[i] = labels[i] >= 0 && labels[i] !== bg.id ? 0 : 1;
  const away = distanceTransform(ink);
  for (let i = 0; i < n; i++)
    if (labels[i] === bg.id && away[i] > 2 && Math.hypot(lab[i * 3] - B[0], lab[i * 3 + 1] - B[1], lab[i * 3 + 2] - B[2]) > 20) m.data[i] = 1;
  const { labels: cl, count } = label(m);
  if (!count) return 0;
  const x0 = new Int32Array(count + 1).fill(w), x1 = new Int32Array(count + 1), y0 = new Int32Array(count + 1).fill(h), y1 = new Int32Array(count + 1), size = new Int32Array(count + 1);
  for (let i = 0; i < n; i++) {
    const c = cl[i]; if (!c) continue;
    const x = i % w, y = (i - x) / w;
    size[c]++; if (x < x0[c]) x0[c] = x; if (x > x1[c]) x1[c] = x; if (y < y0[c]) y0[c] = y; if (y > y1[c]) y1[c] = y;
  }
  let best = 0;
  for (let c = 1; c <= count; c++) {
    const L = Math.hypot(x1[c] - x0[c] + 1, y1[c] - y0[c] + 1);
    if (size[c] <= 2.5 * L && L > best) best = L;
  }
  return best;
}

export function analyze(img, opts = {}) {
  return labelWith(img, learnColours(img, opts));
}

// ---------- fills ----------
// Fill patterns: where each row's needle points fall, as a fraction of the stitch length by row number. Tatami's
// quarter steps hide the points; the others line them up into a texture you can see (programmable fills).
export const FILL_PATTERNS = {
  tatami: { name: "Plain", off: (r) => (r % 4) / 4 },
  brick: { name: "Brick", off: (r) => (r % 2) / 2 },
  chevron: { name: "Chevron", off: (r) => Math.abs((r % 12) - 6) / 12 },
  wave: { name: "Wave", off: (r) => 0.5 + 0.25 * Math.sin((r * Math.PI) / 8) },
};
// share(f): this layer's part of the full density at f, how far across the shape (0-1) the row lies: rows are
// spaced spacing / share, none where the share is under 0.15 (a colour blend: two layers whose spacings change
// gradually, so neither skips rows and leaves long links)
function tatami(mask, comp, res, { angle, spacing, stitch, inset = 0, pull = 0.15, pattern = "tatami", share = null }) {
  const { w, h } = mask, th = (angle * Math.PI) / 180;
  const U = [Math.cos(th), Math.sin(th)], V = [-Math.sin(th), Math.cos(th)];
  const inside = (x, y) => {
    const X = Math.round(x), Y = Math.round(y);
    return X >= 0 && Y >= 0 && X < w && Y < h && comp.labels[Y * w + X] === comp.id && (!inset || comp.dt[Y * w + X] > inset * res);
  };
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const i of comp.pixels) {
    const x = i % w, y = (i - x) / w, u = x * U[0] + y * U[1], v = x * V[0] + y * V[1];
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
  }
  const sp = spacing * res, step = 0.5, L = stitch * res, rows = [];
  for (let v = v0 + sp / 2, r = 0; v <= v1; r++) {
    const k = share ? share((v - v0) / Math.max(v1 - v0, 1e-9)) : 1;
    if (k < 0.15) { v += sp; continue; }
    const ivs = [];
    let start = null;
    for (let u = u0 - 1; u <= u1 + 1; u += step) {
      const x = u * U[0] + v * V[0], y = u * U[1] + v * V[1], ins = inside(x, y);
      if (ins && start === null) start = u;
      if (!ins && start !== null) { ivs.push([start - pull * res, u - step + pull * res]); start = null; }
    }
    if (start !== null) ivs.push([start, u1]);
    rows.push({ v, r, ivs: ivs.filter(([a, b]) => b - a >= 0.6 * res) });
    v += sp / k;
  }
  // group intervals into regions that can be sewn back-and-forth without leaving the shape
  const regions = [];
  let prev = [];
  for (const row of rows) {
    const cur = row.ivs.map((iv) => ({ iv, region: null }));
    for (const c of cur) {
      const over = prev.filter((p) => p.iv[0] < c.iv[1] && c.iv[0] < p.iv[1]);
      if (over.length === 1) {
        const p = over[0], back = cur.filter((q) => q.iv[0] < p.iv[1] && p.iv[0] < q.iv[1]);
        if (back.length === 1 && p.region.open) { c.region = p.region; }
      }
      if (!c.region) { c.region = { rows: [], open: true }; regions.push(c.region); }
      c.region.rows.push({ v: row.v, r: row.r, iv: c.iv });
    }
    for (const p of prev) if (!cur.some((c) => c.region === p.region)) p.region.open = false;
    prev = cur;
  }
  const toXY = (u, v) => [u * U[0] + v * V[0], u * U[1] + v * V[1]];
  // the step from one row's end to the next row's start runs along the edge; where the edge curves in (the S's
  // counter) that step would cross open fabric, so the path is split there and the needle jumps instead
  const leaves = (p, q) => {
    const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / (0.2 * res));
    for (let i = 1; i < n; i++) {
      const x = p[0] + ((q[0] - p[0]) * i) / n, y = p[1] + ((q[1] - p[1]) * i) / n;
      if (!inside(x, y) && !inside(x + 1, y) && !inside(x - 1, y) && !inside(x, y + 1) && !inside(x, y - 1)) return true;
    }
    return false;
  };
  return regions.flatMap((reg) => {
    const paths = [[]];
    reg.rows.forEach((row, k) => {
      let [a, b] = row.iv;
      const fwd = k % 2 === 0, off = (FILL_PATTERNS[pattern] || FILL_PATTERNS.tatami).off(row.r) * L, line = [a];
      for (let u = Math.ceil((a - off) / L) * L + off; u < b; u += L) if (u - a > L * 0.3 && b - u > L * 0.3) line.push(u);
      line.push(b);
      // a short remainder at a row's end is merged into the last stitch (up to 1.3 x L, more with pull): halve
      // the ones over 4 mm, which lay loose on top of the fill
      for (let i = line.length - 1; i > 0; i--) if (line[i] - line[i - 1] > 4 * res) line.splice(i, 0, (line[i] + line[i - 1]) / 2);
      const pts = (fwd ? line : line.reverse()).map((u) => toXY(u, row.v)), cur = paths[paths.length - 1];
      if (cur.length && leaves(cur[cur.length - 1], pts[0])) { paths.push(pts); return; }
      // where the edge runs nearly along the rows, the step to the next row is long (up to 7.6 mm): a loose stitch
      // lying on top. Split into steps of 3 mm at most along it.
      const q = cur[cur.length - 1], n = q ? Math.ceil(Math.hypot(pts[0][0] - q[0], pts[0][1] - q[1]) / (3 * res)) : 1;
      for (let i = 1; i < n; i++) cur.push([q[0] + ((pts[0][0] - q[0]) * i) / n, q[1] + ((pts[0][1] - q[1]) * i) / n]);
      cur.push(...pts);
    });
    return paths;
  });
}

// Travel routing on a grid of 0.5 mm cells over the picture (Ink/Stitch's tatami travel, heatstitch's travel grid):
// A* over 8-neighbour cells that may be crossed (`inside`), where cells already sewn cost 6x and every earlier travel
// through a cell costs more, so ways hide under stitches still to come and don't funnel through one spot.
// cell(x, y): 1 where a cell (sampled at its centre pixel) may be crossed, 2 where it may and stitches sewn over it
// later hide whatever is sewn now (it's never counted as finished). hop(a, b): whether the straight step from a point
// to the cell it starts from (or ends on) is covered.
// Hard limits on the search, so no picture spends more than a few seconds routing (a framed photo's textured backdrop
// made one fill of 1782 sections, each tried from each: minutes, and the page never finished): one route gives up
// after ROUTE_CELLS cells, a router after ROUTER_CELLS and a whole picture after PICTURE_CELLS (`budget`, shared), and
// the needle jumps instead. Counted in cells, not time, so the browser and Node sew the same file.
// In a picture's fill, a cell travelled through this often takes no more travel: a narrow neck that was a big fill's
// only way between its parts was crossed 70 times (72 hits/mm² on etsy_8 at 4 colours, turned; trims 509 -> 384)
const WORN = 20;
const ROUTE_CELLS = 50000, ROUTER_CELLS = 6e6, PICTURE_CELLS = 12e6;
export const routeBudget = () => ({ cells: PICTURE_CELLS });
function makeRouter(mask, res, cell, hop = null, budget = routeBudget(), worn = Infinity) {
  let mine = ROUTER_CELLS;
  const C = Math.max(1, Math.round(res * 0.5));   // 0.5 mm cells
  const gw = Math.ceil(mask.w / C), gh = Math.ceil(mask.h / C), n = gw * gh, inside = new Uint8Array(n);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++)
    inside[gy * gw + gx] = cell(Math.min(mask.w - 1, gx * C + (C >> 1)), Math.min(mask.h - 1, gy * C + (C >> 1)));
  const sewn = new Uint8Array(n), trod = new Uint8Array(n);
  const cellOf = ([x, y]) => Math.min(gh - 1, Math.max(0, Math.floor(y / C))) * gw + Math.min(gw - 1, Math.max(0, Math.floor(x / C)));
  const centre = (c) => [(c % gw) * C + C / 2, Math.floor(c / gw) * C + C / 2];
  // f returning false stops the walk (and along returns false)
  const along = (a, b, f) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (C / 2)));
    for (let k = 0; k <= steps; k++) if (f(cellOf([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps])) === false) return false;
    return true;
  };
  // row ends sit on (or a pull-compensation past) the edge: start from the nearest cell inside
  const snap = (p) => {
    const c = cellOf(p);
    if (inside[c] && (!hop || hop(p, centre(c)))) return c;
    const cx = c % gw, cy = (c - cx) / gw;
    let best = -1, bd = Infinity;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx, y = cy + dy, m = y * gw + x;
      if (x >= 0 && y >= 0 && x < gw && y < gh && inside[m] && dx * dx + dy * dy < bd && (!hop || hop(p, centre(m)))) { bd = dx * dx + dy * dy; best = m; }
    }
    return best;
  };
  // 8-connected regions of inside cells: no way between two of them, so route() says so without flooding one
  // (half of all calls on a busy picture, and most of the time)
  const region = new Int32Array(n);
  for (let c0 = 0, r = 0; c0 < n; c0++) {
    if (!inside[c0] || region[c0]) continue;
    const st = [c0]; region[c0] = ++r;
    while (st.length) {
      const c = st.pop(), cx = c % gw, cy = (c - cx) / gw;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy, m = y * gw + x;
        if (x >= 0 && y >= 0 && x < gw && y < gh && inside[m] && !region[m]) { region[m] = r; st.push(m); }
      }
    }
  }
  // A* state reused between calls (a cell's g/from count only if stamped this call); the open list is a binary heap
  // in typed arrays (a linear scan was most of a busy picture's time)
  const G = new Float64Array(n), FROM = new Int32Array(n), SW = new Float32Array(n), LN = new Float32Array(n), STAMP = new Uint32Array(n), DONE = new Uint32Array(n), HK = new Float64Array(20010), HC = new Int32Array(20010);
  let hn = 0;
  const push = (k, c) => {
    let i = hn++;
    while (i) { const up = (i - 1) >> 1; if (HK[up] <= k) break; HK[i] = HK[up]; HC[i] = HC[up]; i = up; }
    HK[i] = k; HC[i] = c;
  };
  const pop = () => {
    const top = HC[0], k = HK[--hn], c = HC[hn];
    let i = 0;
    for (;;) {
      let m = 2 * i + 1; if (m >= hn) break;
      if (m + 1 < hn && HK[m + 1] < HK[m]) m++;
      if (HK[m] >= k) break;
      HK[i] = HK[m]; HC[i] = HC[m]; i = m;
    }
    HK[i] = k; HC[i] = c;
    return top;
  };
  let gen = 0;
  // Search from cell s: A* toward cell t, or (t < 0) a flood that stops once a cell in `stop` is reached. Ways with
  // more than maxSewn mm on finished stitches or longer than maxMm aren't followed (a search that can't succeed stops
  // early instead of flooding the whole shape). Leaves g/from stamped with `gen` for pathTo.
  const mmPer = C / res;
  function search(s, t, maxSewn, maxMm, stop = null) {
    let popped = 0;
    gen++;
    const g = (c) => (STAMP[c] === gen ? G[c] : Infinity);
    const hx = t < 0 ? () => 0 : (c) => Math.hypot((c % gw) - (t % gw), Math.floor(c / gw) - Math.floor(t / gw));
    STAMP[s] = gen; G[s] = 0; FROM[s] = -1; SW[s] = 0; LN[s] = 0; hn = 0; push(0, s);
    while (hn) {
      const c = pop();
      if (c === t || (stop && stop.has(c))) break;
      if (DONE[c] === gen) continue;   // (a stale entry: the cell was expanded at its best already)
      DONE[c] = gen;
      if (++popped > ROUTE_CELLS || hn > 20000) break;
      const cx = c % gw, cy = (c - cx) / gw;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
        const m = y * gw + x; if (!inside[m] || trod[m] >= worn) continue;
        const step = Math.hypot(dx, dy), v = g(c) + step * ((sewn[m] ? 6 : 1) + 2 * trod[m]);
        if (v >= g(m)) continue;
        const sw = SW[c] + (sewn[m] ? step * mmPer : 0), ln = LN[c] + step * mmPer;
        if (sw > maxSewn || ln + hx(m) * mmPer > maxMm) continue;
        STAMP[m] = gen; G[m] = v; FROM[m] = c; SW[m] = sw; LN[m] = ln; push(v + hx(m), m);
      }
    }
    mine -= popped; budget.cells -= popped;
  }
  // the way the last search found from a (cell s) to b (cell t) as { pts, sewnMm (how much of it lies on finished
  // stitches), mm (its length) }, or null
  function pathTo(s, t, a, b) {
    const from = (c) => (STAMP[c] === gen ? FROM[c] : -1);
    if (from(t) < 0 && s !== t) return null;
    const cells = [t]; while (cells[cells.length - 1] !== s) cells.push(from(cells[cells.length - 1]));
    cells.reverse();
    let sewnMm = 0;
    for (let i = 1; i < cells.length; i++) if (sewn[cells[i]]) sewnMm += Math.hypot((cells[i] % gw) - (cells[i - 1] % gw), Math.floor(cells[i] / gw) - Math.floor(cells[i - 1] / gw)) * C / res;
    // pull the staircase straight where a straight line stays inside (and off finished rows if the route was)
    const ok = (p, q) => along(p, q, (c) => !!inside[c] && !(sewn[c] && !sewnMm));
    const pts = [a], cs = cells.map(centre); let i = 0;
    while (i < cs.length - 1) { let j = cs.length - 1; while (j > i + 1 && !ok(pts[pts.length - 1], cs[j])) j--; pts.push(cs[j]); i = j; }
    pts.push(b);
    let mm = 0;
    for (let k = 1; k < pts.length; k++) mm += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]) / res;
    return { pts, sewnMm, mm };
  }
  const spent = () => mine <= 0 || budget.cells <= 0;
  // the way from a to b (px), or null
  function route(a, b, maxSewn = Infinity, maxMm = Infinity) {
    const s = snap(a), t = snap(b);
    if (s < 0 || t < 0 || region[s] !== region[t] || spent()) return null;
    search(s, t, maxSewn, maxMm);
    return pathTo(s, t, a, b);
  }
  // One search from a toward many places: way(b) is the way to b, or null. It stops early once it reaches one of
  // `first` (the places preferred most). One flood per move instead of one search per place tried: a fill of many
  // sections tried each in turn, and each search that failed flooded the shape.
  function reach(a, maxSewn, first = []) {
    const s = snap(a);
    if (s < 0 || spent()) return () => null;
    search(s, -1, maxSewn, Infinity, new Set(first.map(snap).filter((c) => c >= 0)));
    const at = gen;
    return (b) => {
      const t = snap(b);
      return at !== gen || t < 0 || region[s] !== region[t] ? null : pathTo(s, t, a, b);
    };
  }
  // the route as travel stitches up to 2.5 mm, none under 0.6 mm (ending exactly on b, which isn't included)
  function stitches(r) {
    const travel = [];
    let at = r.pts[0];
    for (let k = 1; k < r.pts.length; k++) {
      const [ax, ay] = r.pts[k - 1], [bx, by] = r.pts[k], m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (2.5 * res)));
      for (let q = 1; q <= m; q++) {
        const t = [ax + ((bx - ax) * q) / m, ay + ((by - ay) * q) / m];
        if (Math.hypot(t[0] - at[0], t[1] - at[1]) >= 0.6 * res) { travel.push(t); at = t; }
      }
    }
    const b = r.pts[r.pts.length - 1];
    while (travel.length && Math.hypot(travel[travel.length - 1][0] - b[0], travel[travel.length - 1][1] - b[1]) < 0.6 * res) travel.pop();
    for (let k = 1; k < r.pts.length; k++) along(r.pts[k - 1], r.pts[k], (c) => (trod[c] = Math.min(255, trod[c] + 1)));
    return travel;
  }
  const markSewn = (p) => { for (let i = 1; i < p.length; i++) along(p[i - 1], p[i], (c) => { if (inside[c] !== 2) sewn[c] = 1; }); };
  // which connected stretch of crossable cells a point starts in (0: none), so a route between two can't exist
  const regionOf = (p) => { const c = snap(p); return c < 0 ? 0 : region[c]; };
  return { route, reach, stitches, markSewn, regionOf };
}

// Sew a fill's sections in one go: between sections the needle travels inside the shape, through rows not sewn
// yet, so the fill covers the travel. It only jumps (and trims) when every way would lie on top of finished rows for
// more than SEWN mm. groups: [underlay paths, fill paths] in px; the underlay is covered by the fill, so travel over it is
// hidden too.
function routeFill(groups, comp, mask, res, budget = routeBudget(), worn = Infinity) {
  const { w } = mask, R = makeRouter(mask, res, (x, y) => (comp.labels[y * w + x] === comp.id ? 1 : 0), null, budget, worn);
  const out = [];
  let cur = null;
  groups.forEach((paths, gi) => {
    // sections in the fill's own row order (top to bottom of the sweep): each next one begins beside rows still to
    // sew, so the way there stays hidden. Picking the nearest instead strands earlier sections behind finished rows.
    // If the next one can only be reached over finished rows, take the first later one with a hidden way there.
    const left = paths.filter((p) => p.length);
    while (left.length) {
      // (a section can also be sewn from its last row back, entering from its far side)
      let k = 0, r = null, rev = false;
      if (cur) {
        const way = R.reach(cur, SEWN, [left[0][0], left[0][left[0].length - 1]]);
        search: for (let i = 0; i < left.length; i++) for (const back of [false, true]) {
          const q = back ? left[i][left[i].length - 1] : left[i][0];
          if (Math.hypot(q[0] - cur[0], q[1] - cur[1]) <= res) { k = i; r = null; rev = back; break search; }
          const ri = way(q);
          if (ri && ri.sewnMm <= SEWN) { k = i; r = ri; rev = back; break search; }
        }
      }
      let p = left.splice(k, 1)[0]; if (rev) p = p.slice().reverse();
      const d = cur ? Math.hypot(p[0][0] - cur[0], p[0][1] - cur[1]) : Infinity;
      // within 1 mm: sew straight on (skipping a first point that would make a stitch under 0.4 mm)
      if (cur && d <= res) out[out.length - 1].push(...(d < 0.4 * res ? p.slice(1) : p));
      else if (r && r.sewnMm <= SEWN) out[out.length - 1].push(...R.stitches(r), ...p);
      else out.push(p.slice());
      if (gi === groups.length - 1) R.markSewn(p);
      cur = p[p.length - 1];
    }
  });
  return out;
}

// ---------- build ----------
// "Use only my threads": every colour becomes the nearest of `palette` (hex, by Lab), and colours that land on the
// same thread merge into one (fewer thread changes). The background stays as it is.
export function toPalette(analysis, palette) {
  const labs = palette.map((h) => srgbToLab(...hexToRgb(h)));
  const pick = (hex) => { const [L, A, B] = srgbToLab(...hexToRgb(hex)); let bj = 0, bd = Infinity;
    labs.forEach((q, j) => { const d = (q[0] - L) ** 2 + (q[1] - A) ** 2 + (q[2] - B) ** 2; if (d < bd) { bd = d; bj = j; } }); return bj; };
  const groups = new Map();
  for (const c of analysis.colors) if (!c.background && c.area > 0) { const j = pick(c.picture || c.hex); groups.set(j, [...(groups.get(j) || []), c]); }
  const to = new Map(), colors = analysis.colors.map((c) => ({ ...c })), owned = [];
  for (const [j, cs] of groups) {
    const rep = cs.reduce((a, b) => (b.area > a.area ? b : a)), hex = palette[j];
    for (const c of cs) { to.set(c.id, rep.id); if (c !== rep) colors[c.id].area = 0; }
    Object.assign(colors[rep.id], { hex, thread: nearestBrotherThread(hex), lightness: labs[j][0], area: cs.reduce((a, c) => a + c.area, 0) });
    // (said on the page: yellow and pink both sewn in one owned spool went unmentioned)
    owned.push({ hex, from: cs.map((c) => c.picture || c.hex) });
  }
  const labels = analysis.labels.map((l) => (to.has(l) ? to.get(l) : l));
  return { ...analysis, labels, colors, owned };
}

// Fill edges and satin outlines reach a little past the picture, so a picture sized to the hoop's edge can land
// just over it; shrink to fit (more pixels per mm) rather than refuse.
export function digitize(img, analysis, opts = {}) {
  if (analysis.empty) throw Object.assign(new Error(analysis.empty), { code: "empty" });
  let res = opts.res || DEFAULTS.res;
  const make = opts.style === "line" ? lineArt : opts.style === "cross" ? crossStitch : build;
  for (let tries = 0; ; tries++) {
    try {
      const r = make(img, analysis, { ...opts, res });
      // (the longest line too thin to keep, as a share of the picture's longer side: the page says so)
      r.fine.lost = analysis.lost || 0;
      return r;
    }
    catch (e) { if (!e.overBy || tries === 3) throw e; res *= e.overBy * 1.01; }
  }
}

function build(img, analysis, opts) {
  const o = { ...DEFAULTS, ...opts };
  const { w, h, labels, colors } = analysis;
  const res = o.res;
  const hoop = o.hoop;
  const cx = w / 2, cy = h / 2, toMm = (p) => p.map(([x, y]) => [(x - cx) / res, (y - cy) / res]);
  const d = new Design(hoop);
  const used = colors.filter((c) => !c.background && c.area > 0 && !(o.skip || []).includes(c.id))
    .sort((a, b) => b.lightness - a.lightness);   // light first, dark details on top
  const summary = [], stitched = new Set(used.map((c) => c.id));
  const fine = { narrowMm2: 0, hairlines: 0, inkMm2: 0 };   // details too small to stitch cleanly (shown as a hint)
  for (let i = 0; i < w * h; i++) if (stitched.has(labels[i])) fine.inkMm2++;
  fine.inkMm2 /= res * res;
  // ignore specks: under 1.5 mm², or under 4 mm² and under 2.5 mm across (a dot, not a stem: each speck left was a
  // trim, two locks and often a loose thread; 4 mm² for all erased the thin stems of a line-art bouquet)
  const minPx = 1.5 * res * res, dotPx = 4 * res * res, dotW = 2.5 * res;
  // where each colour's fill will surely lie: over 0.6 mm inside a shape that isn't a speck. A travel run sewn there
  // by an earlier colour is covered.
  const solid = new Uint8Array(w * h), budget = routeBudget();
  for (const col of used) {
    const m = { w, h, data: new Uint8Array(w * h) };
    for (let i = 0; i < w * h; i++) m.data[i] = labels[i] === col.id ? 1 : 0;
    const dt = distanceTransform(m), { labels: cl, count } = label(m), big = new Uint8Array(count + 1);
    const size = new Int32Array(count + 1), x0 = new Int32Array(count + 1).fill(w), x1 = new Int32Array(count + 1).fill(-1), y0 = new Int32Array(count + 1).fill(h), y1 = new Int32Array(count + 1).fill(-1);
    for (let i = 0; i < w * h; i++) {
      const c = cl[i]; if (!c) continue;
      const x = i % w, y = (i - x) / w; size[c]++;
      if (x < x0[c]) x0[c] = x; if (x > x1[c]) x1[c] = x; if (y < y0[c]) y0[c] = y; if (y > y1[c]) y1[c] = y;
    }
    for (let c = 1; c <= count; c++) big[c] = size[c] >= dotPx || (size[c] >= minPx && (x1[c] - x0[c] >= dotW || y1[c] - y0[c] >= dotW)) ? 1 : 0;
    for (let i = 0; i < w * h; i++) if (cl[i] && big[cl[i]] && dt[i] > 0.6 * res) solid[i] = 1;
  }
  for (const [k, col] of used.entries()) {
    const mask = { w, h, data: new Uint8Array(w * h) };
    for (let i = 0; i < w * h; i++) mask.data[i] = labels[i] === col.id ? 1 : 0;
    fine.narrowMm2 += narrowGaps(mask, res, (i) => !stitched.has(labels[i]));
    const own = distanceTransform(mask);   // the colour's own shapes, for their widths
    // (specks: see minPx above)
    // Each shape grows under the colours sewn later (they cover the join), never into the background or an
    // earlier colour. Specks go first, and shapes grow apart: merged, scattered specks would fill the colour above
    // them, and a bridge between two shapes funnels every fill travel through it.
    const later = new Set(used.slice(k + 1).map((c) => c.id));
    const { labels: cl, count } = label(mask);
    // Lines under 1 mm wide (stems, small lettering, outlines) are sewn along their centre, however small each piece
    // is: a thin line breaks into short pieces in a picture, and dropping those as specks erased whole titles and
    // most of the stems. Wider specks (dots) go: each was a trim, two locks and often a loose thread.
    const size = new Int32Array(count + 1), wide = new Float64Array(count + 1), bx0 = new Int32Array(count + 1).fill(w), bx1 = new Int32Array(count + 1).fill(-1), by0 = new Int32Array(count + 1).fill(h), by1 = new Int32Array(count + 1).fill(-1);
    for (let i = 0; i < w * h; i++) {
      const c = cl[i]; if (!c) continue;
      const x = i % w, y = (i - x) / w; size[c]++;
      if (own[i] > wide[c]) wide[c] = own[i];
      if (x < bx0[c]) bx0[c] = x; if (x > bx1[c]) bx1[c] = x; if (y < by0[c]) by0[c] = y; if (y > by1[c]) by1[c] = y;
    }
    const thinC = (c) => (2 * wide[c]) / res < 1.0;
    const dot = (c) => size[c] < minPx || (size[c] < dotPx && bx1[c] - bx0[c] < dotW && by1[c] - by0[c] < dotW);
    // (a mark at least 2 mm long and half as long again as it's wide, within 2 mm of a bigger piece of its colour, is
    // no dot: KENJI'S apostrophe at 60 mm went. Marks out on their own still go: each is a trim and two locks)
    const away = { w, h, data: new Uint8Array(w * h) };
    for (let i = 0; i < w * h; i++) away.data[i] = cl[i] && !dot(cl[i]) ? 0 : 1;
    const toBig = distanceTransform(away), near = new Uint8Array(count + 1);
    for (let i = 0; i < w * h; i++) if (cl[i] && toBig[i] <= 2 * res) near[cl[i]] = 1;
    const mark = (c) => { const a = bx1[c] - bx0[c] + 1, b = by1[c] - by0[c] + 1; return near[c] && Math.max(a, b) >= 2 * res && Math.max(a, b) >= 1.5 * Math.min(a, b); };
    const speck = (c) => dot(c) && !mark(c);
    // A thin piece lying between the fabric and another colour, in a colour between theirs, is the blend along that
    // colour's edge (a dark letter's anti-aliasing read as green), not a line of its own.
    const touch = new Map();
    for (let i = 0; i < w * h; i++) {
      const c = cl[i]; if (!c || !thinC(c)) continue;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || cl[j] === c) continue;
        const l = labels[j];
        if (l === col.id) continue;
        const key = c * 4096 + (stitched.has(l) ? 2048 : 0) + (l + 1);
        touch.set(key, (touch.get(key) || 0) + 1);
      }
    }
    const most = new Map();   // per piece: [open colour, count], [other stitched colour, count]
    for (const [key, k] of touch) {
      const c = Math.floor(key / 4096), sew = key & 2048 ? 1 : 0, l = (key & 2047) - 1, m = most.get(c) || [[-1, 0], [-1, 0]];
      if (k > m[sew][1]) m[sew] = [l, k];
      most.set(c, m);
    }
    const labOf = (id) => srgbToLab(...hexToRgb(colors[id].picture || colors[id].hex)), mine = labOf(col.id), dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    // (only its pixels beside that colour go: a stem that runs past a leaf keeps the rest of its length)
    const between = new Map();
    for (const [c, m] of most) {
      if (m[0][0] < 0 || m[1][0] < 0) continue;
      const A = labOf(m[0][0]), B = labOf(m[1][0]);
      if (dE(A, mine) + dE(mine, B) <= 1.25 * dE(A, B)) between.set(c, m[1][0]);
    }
    const edgeOf = (i, l) => {
      const x = i % w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, j = i + dy * w + dx;
        if (X >= 0 && X < w && j >= 0 && j < w * h && labels[j] === l) return true;
      }
      return false;
    };
    const thin = { w, h, data: new Uint8Array(w * h) };
    let anyThin = false;
    for (let i = 0; i < w * h; i++) {
      if (!cl[i]) continue;
      if (thinC(cl[i]) && between.has(cl[i]) && edgeOf(i, between.get(cl[i]))) { cl[i] = 0; mask.data[i] = 0; }
      else if (thinC(cl[i])) { thin.data[i] = 1; anyThin = true; cl[i] = 0; mask.data[i] = 0; }
      else if (speck(cl[i])) { cl[i] = 0; mask.data[i] = 0; }
    }
    // The thin parts of a filled shape (a stem growing out of its leaves) are too narrow for fill rows (rows under
    // 0.6 mm are dropped): they're sewn as lines too. Thin = not reached by a 0.7 mm disc that fits inside the shape.
    {
      const r = THIN_PART * res, core = { w, h, data: new Uint8Array(w * h) };
      for (let i = 0; i < w * h; i++) core.data[i] = cl[i] && own[i] > r ? 0 : 1;
      const toCore = distanceTransform(core);
      for (let i = 0; i < w * h; i++) if (cl[i] && toCore[i] > r + 0.5) { thin.data[i] = 1; anyThin = true; }
    }
    if (later.size) {
      const src = new Int32Array(w * h).fill(-1), R = OVERLAP * res;
      let front = [];
      for (let i = 0; i < w * h; i++) if (cl[i]) { src[i] = i; front.push(i); }
      const near = (j) => { const x = j % w; return [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w].filter((q) => q >= 0 && q < w * h); };
      while (front.length) {
        const next = [];
        for (const i of front) for (const j of near(i)) {
          if (cl[j] || !later.has(labels[j])) continue;
          const s0 = src[i], dx = (j % w) - (s0 % w), dy = Math.floor(j / w) - Math.floor(s0 / w);
          if (dx * dx + dy * dy > R * R || near(j).some((q) => cl[q] && cl[q] !== cl[i])) continue;
          cl[j] = cl[i]; src[j] = s0; mask.data[j] = 1; next.push(j);
        }
        front = next;
      }
    }
    // neighbouring colours alternate the row direction so their joins don't open into one seam
    const angle = o.fillAngle + (k % 2) * 90;
    const dt = distanceTransform(mask);
    const comps = [];
    for (let id = 1; id <= count; id++) comps.push({ id, pixels: [], labels: cl, dt });
    for (let i = 0; i < w * h; i++) if (cl[i]) comps[cl[i] - 1].pixels.push(i);
    let blocks = [];
    const filled = new Uint8Array(count + 1);   // shapes sewn as fills
    for (const comp of comps) {
      const mine = comp.pixels.filter((i) => labels[i] === col.id);
      if (!mine.length) continue;
      let maxDt = 0, sx = 0, sy = 0;
      for (const i of mine) { maxDt = Math.max(maxDt, own[i]); sx += i % w; sy += Math.floor(i / w); }
      const widthMm = (2 * maxDt) / res, centre = [sx / mine.length, sy / mine.length];
      // anything with width is a solid fill that matches its outline exactly
      const under = tatami(mask, comp, res, { angle: angle + 90, spacing: 2.5, stitch: 3, inset: 0.4, pull: 0 });
      // pull compensation widens a fill past its edge; on thin letters that closes the gaps between them
      const fill = tatami(mask, comp, res, { angle, spacing: o.density, stitch: 3.5, pull: widthMm < 2 ? 0.05 : 0.15 });
      blocks.push({ centre, paths: routeFill([under, fill], comp, mask, res, budget, WORN).map(toMm), kind: "fill" });
      filled[comp.id] = 1;
    }
    if (anyThin) {
      // thickened a pixel (like a line drawing) so a line broken by a pixel joins up, then walked like lettering:
      // each line out as a triple run (it shows like a thin outline) and back, so a connected line has no jumps.
      // A line out and back is four passes: it shows about as well as a thin outline drawn in the picture.
      const thick = { w, h, data: thin.data.slice() };
      for (let i = 0; i < w * h; i++) if (thin.data[i]) { const x = i % w; if (x < w - 1) thick.data[i + 1] = 1; if (i + w < w * h) thick.data[i + w] = 1; }
      const walks = order(skeletonEdges(thick, 2, { spur: 1 })).map((seq) => {
        const mm = seq.map(([p, kind]) => [toMm(p), kind]);
        return { mm, len: mm.reduce((a, [p, kind]) => a + (kind === "run" ? arclen(p).at(-1) : 0), 0) };
      // (a piece under 1.5 mm of line is a dot: sewn four times over with two locks and a trim, beside a bigger piece
      // too; 17-43 per picture were kept for being within LINK of one)
      }).filter((t) => t.len >= 1.5);
      // A piece counts with the pieces of this line colour within LINK of it (the letters of a word, the dashes of a
      // broken stem): a group under GROUP mm of line in all is a speck (each one a trim and two locks), dropped.
      const LINK = 2, GROUP = 6;
      const key = (x, y) => `${Math.floor(x / LINK)},${Math.floor(y / LINK)}`, cells = new Map();
      const root = walks.map((_, i) => i), find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
      walks.forEach((t, i) => { for (const [p] of t.mm) for (const [x, y] of p) { const c = key(x, y); if (!cells.has(c)) cells.set(c, new Set()); cells.get(c).add(i); } });
      walks.forEach((t, i) => {
        for (const [p] of t.mm) for (const [x, y] of p) {
          const gx = Math.floor(x / LINK), gy = Math.floor(y / LINK);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const j of cells.get(`${gx + dx},${gy + dy}`) || []) {
            if (find(j) === find(i)) continue;
            if (walks[j].mm.some(([q]) => q.some(([u, v]) => Math.hypot(u - x, v - y) <= LINK))) root[find(j)] = find(i);
          }
        }
      });
      const total = new Map();
      walks.forEach((t, i) => total.set(find(i), (total.get(find(i)) || 0) + t.len));
      walks.forEach((t, i) => {
        if (total.get(find(i)) < GROUP) return;
        fine.hairlines++;
        const paths = t.mm.map(([p, kind]) => {
          const q = followRun(p, 1.5, 0.1, 0.6);
          return kind === "run" && q.length > 1 ? [...q, ...q.slice(0, -1).reverse(), ...q.slice(1)] : q;
        });
        blocks.push({ centre: paths[0][0], paths, kind: "run" });
      });
    }
    if (!blocks.length) continue;
    // Moves between sections and shapes travel where stitches still to come will cover the run: this colour's fills
    // not sewn yet (kept 0.25 mm off their edges) or a later colour's solid fill. Each jump was a trim, two locks and,
    // up to 5 mm (the PE900 never trims those), a loose thread: etsy_8 had 293 trims and 101 loose threads.
    const toPx = ([x, y]) => [x * res + cx, y * res + cy], ink = (i) => mask.data[i] || thin.data[i] || later.has(labels[i]);
    const hop = (a, b) => {   // the step between a point and its first cell: on this colour or one still to come
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (0.2 * res));
      for (let i = 1; i <= n; i++) if (!ink(Math.round(a[1] + ((b[1] - a[1]) * i) / n) * w + Math.round(a[0] + ((b[0] - a[0]) * i) / n))) return false;
      return true;
    };
    // ... or along this colour's own thin lines (within 2 px), which are sewn in this thread anyway
    const near2 = new Uint8Array(w * h);
    if (anyThin) for (let i = 0; i < w * h; i++) if (thin.data[i]) { const x = i % w, y = (i - x) / w; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) near2[Y * w + X] = 1; } }
    const R = makeRouter(mask, res, (x, y) => {
      const i = y * w + x;
      return solid[i] && later.has(labels[i]) ? 2 : filled[cl[i]] && dt[i] > 0.25 * res ? 1 : near2[i] ? 1 : 0;
    }, hop, budget);
    // Shapes in nearest-first order, preferring the nearest one a hidden way reaches (keeps travel and trims down),
    // then one far enough for the machine to trim the jump
    const ordered = [];
    blocks = blocks.map((b) => ({ ...b, paths: b.paths.filter((p) => p.length) })).filter((b) => b.paths.length);
    let at = d.cur ? toPx(d.cur) : [0, 0];
    // A line's walk ends where it began, so it can start anywhere along it: it's entered at its point nearest the
    // needle (a step of 2 mm or less is sewn, not jumped)
    // (steps under 0.4 mm, where the walk turns back on a short stroke, are merged: rounded to the file's 0.1 mm a 0.3 mm
    // step can come out under 0.3, and tiny stitches nest and break thread)
    for (const b of blocks) if (b.kind === "run") {
      const t = [];
      for (const q of b.paths.flat()) if (!t.length || Math.hypot(q[0] - t.at(-1)[0], q[1] - t.at(-1)[1]) >= 0.4) t.push(q);
      if (Math.hypot(t[0][0] - t.at(-1)[0], t[0][1] - t.at(-1)[1]) < 0.4) t[t.length - 1] = t[0]; else t.push(t[0]);
      b.tour = t;
    }
    while (blocks.length) {
      const from = R.regionOf(at);
      let bi = 0, bk = 0, bd = Infinity;
      blocks.forEach((b, i) => {
        (b.tour || [b.paths[0][0]]).forEach((qm, k) => {
          const q = toPx(qm), v = Math.hypot(q[0] - at[0], q[1] - at[1]) / res;
          // (a jump of 2-5 mm is left as a loose thread by the machine: one over 5 mm, trimmed, is better)
          const score = v <= 2 || (v <= TRAVEL && from && R.regionOf(q) === from) ? v : v > 5 ? v + 1000 : v + 2000;
          if (score < bd) { bd = score; bi = i; bk = k; }
        });
      });
      const b = blocks.splice(bi, 1)[0];
      if (b.tour) { const t = b.tour; b.paths = [bk ? [...t.slice(bk), ...t.slice(1, bk + 1)] : t]; }
      const last = b.paths[b.paths.length - 1];
      ordered.push(b); at = toPx(last[last.length - 1]);
    }
    // a short move to the next piece is sewn straight unless it would cross fabric this colour doesn't cover
    const covered = ([x, y]) => mask.data[Math.round(y * res + cy) * w + Math.round(x * res + cx)] === 1;
    // (fill rows end a little past the shape's edge, so the last 0.3 mm at each end isn't checked)
    const crosses = (a, b) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 0.2);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        if (t * L < 0.3 || (1 - t) * L < 0.3) continue;
        if (!covered([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return true;
      }
      return false;
    };
    d.color(col.hex, col.thread.name);
    // Within 2 mm a move is sewn straight when it doesn't cross open fabric, and otherwise too if there's no hidden
    // way: a jump that short is never trimmed by the machine (a loose thread plus two locks).
    for (const b of ordered) for (const p of b.paths) {
      if (!d.cur) { d.path(p); continue; }
      const gap = Math.hypot(p[0][0] - d.cur[0], p[0][1] - d.cur[1]);
      if (gap <= 2 && !crosses(d.cur, p[0])) d.path(p);
      else {
        const r = gap <= TRAVEL ? R.route(toPx(d.cur), toPx(p[0]), SEWN, 1.5 * gap + 3) : null;
        if (r && r.sewnMm <= SEWN && r.mm <= 1.5 * gap + 3) d.path([d.cur, ...toMm(R.stitches(r)), ...p]);
        else d.path(p, true, gap > 2);
      }
      if (b.kind === "fill") R.markSewn(p.map(toPx));
    }
    summary.push({ ...col, shapes: ordered.length, kinds: [...new Set(ordered.map((b) => b.kind))] });
  }
  if (!d.stitches.length) throw nothing(used, o);
  d.finish();
  return { design: d, summary, fine };
}

// why a picture with colours to sew came out empty (code: what the page can offer to change)
function nothing(used, o) {
  return !used.length && (o.skip || []).length ? Object.assign(new Error("Every thread is left out, so there's nothing to stitch."), { code: "skipped" })
    : Object.assign(new Error("Nothing in this picture is big enough to stitch at this size."), { code: "small" });
}

// Fabric-coloured specks and slivers inside a drawing (the blend between a white fill and its black outline, read as
// background; a textured fill's lighter flecks) would each be outlined: they take the colour round them. Fabric that
// reaches the picture's edge, or is 0.5 mm² and over 0.6 mm across somewhere (a letter's counter), stays.
function closeSlivers(labels, w, h, mine, res) {
  const n = w * h, m = { w, h, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) m.data[i] = mine.has(labels[i]) ? 0 : 1;
  const dt = distanceTransform(m), { labels: cl, count } = label(m);
  const edge = new Uint8Array(count + 1), area = new Int32Array(count + 1), wide = new Float32Array(count + 1);
  for (let i = 0; i < n; i++) {
    const c = cl[i]; if (!c) continue;
    const x = i % w, y = (i - x) / w;
    area[c]++; if (dt[i] > wide[c]) wide[c] = dt[i];
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge[c] = 1;
  }
  const out = labels.slice(), open = new Uint8Array(n);
  let front = [];
  const near = (i) => { const x = i % w; return [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i + w < n ? i + w : -1]; };
  // Slivers: fabric under 0.6 mm across, as a closing finds it (a sliver can run on to open fabric), lying between two
  // different colours. Between parts of one colour (the gaps between letters) it stays.
  const r = 0.3 * res, dil = { w, h, data: new Uint8Array(n) }, thin = { w, h, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) dil.data[i] = !m.data[i] || dt[i] <= r ? 1 : 0;
  const shut = distanceTransform(dil);
  for (let i = 0; i < n; i++) thin.data[i] = cl[i] && (shut[i] > r || (!edge[cl[i]] && wide[cl[i]] <= r)) ? 1 : 0;
  const { labels: sl, count: sc } = label(thin), sides = Array.from({ length: sc + 1 }, () => new Set());
  for (let i = 0; i < n; i++) if (sl[i]) for (const j of near(i)) if (j >= 0 && !m.data[j]) sides[sl[i]].add(labels[j]);
  for (let i = 0; i < n; i++) if (cl[i] && ((!edge[cl[i]] && area[cl[i]] < 0.5 * res * res) || (sl[i] && sides[sl[i]].size >= 2))) open[i] = 1;
  for (let i = 0; i < n; i++) if (open[i] && near(i).some((j) => j >= 0 && !open[j] && mine.has(out[j]))) front.push(i);
  while (front.length) {
    const next = [];
    for (const i of front) {
      if (!open[i]) continue;
      const j = near(i).find((q) => q >= 0 && !open[q] && mine.has(out[q]));
      if (j === undefined) continue;
      out[i] = out[j]; open[i] = 0;
      for (const q of near(i)) if (q >= 0 && open[q]) next.push(q);
    }
    front = next;
  }
  return out;
}

// Thinning stops a line's loose end about half its width short of the ink's end: each loose end of the skeleton edges
// `es` (px) goes on straight while there's ink in `mask`, up to `far` px (a crayon sun's rays came out a third short, a
// 2.3 mm apostrophe as a 0.9 mm speck, dropped)
function lineEnds(es, mask, far) {
  const { w, h } = mask, deg = new Map(), ink = (x, y) => { const X = Math.round(x), Y = Math.round(y); return X >= 0 && Y >= 0 && X < w && Y < h && mask.data[Y * w + X]; };
  for (const [a, b] of es) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
  const on = (p) => {   // p runs toward the loose end
    const e = p[p.length - 1], q = p[Math.max(0, p.length - 1 - Math.max(3, Math.round(far / 2)))], L = Math.hypot(e[0] - q[0], e[1] - q[1]);
    if (L < 1) return p;
    const u = [(e[0] - q[0]) / L, (e[1] - q[1]) / L];
    let t = 0;
    while (t < far && ink(e[0] + u[0] * (t + 0.5), e[1] + u[1] * (t + 0.5))) t += 0.5;
    t -= 0.5;
    return t >= 1 ? [...p, [e[0] + u[0] * t, e[1] + u[1] * t]] : p;
  };
  for (const ed of es) {
    if (ed[0] === ed[1]) continue;
    if (deg.get(ed[1]) === 1) ed[2] = on(ed[2]);
    if (deg.get(ed[0]) === 1) ed[2] = on(ed[2].slice().reverse()).reverse();
  }
  return es;
}

// Line drawing (redwork): every shape's outline and every line's or even stroke's centre, in the picture's darkest
// colour. The lines are walked like lettering (each one out and back), so a connected drawing sews without a trim.
function lineArt(img, analysis, opts) {
  const o = { ...DEFAULTS, ...opts }, { w, h, colors } = analysis, res = o.res;
  const used = colors.filter((c) => !c.background && c.area > 0 && !(o.skip || []).includes(c.id));
  if (!used.length) throw nothing(used, o);
  const ink = used.reduce((a, c) => (c.lightness < a.lightness ? c : a)), mine = new Set(used.map((c) => c.id));
  const labels = closeSlivers(analysis.labels, w, h, mine, res);
  const cx = w / 2, cy = h / 2, toMm = (p) => p.map(([x, y]) => [(x - cx) / res, (y - cy) / res]);
  // Only a change of colour draws a line: two shades of one (a textured lawn in two greens) don't, and a thin piece that
  // is a shade of the colour round it, or the blend between two colours (a yellow bird's edge against its black
  // outline), takes the neighbouring colour instead of being drawn as a line beside the outline.
  const fabric = colors.find((c) => c.background), labOf = new Map(colors.map((c) => [c.id, srgbToLab(...hexToRgb(c.picture || c.hex))]));
  const colOf = (l) => (mine.has(l) ? labOf.get(l) : fabric ? labOf.get(fabric.id) : null);
  const alike = (a, b) => !!a && !!b && deltaE2000(a, b) < 15;
  const toFabric = fabric ? fabric.id : -1, before = labels.slice(), moves = [];
  for (const col of used) {
    const mask = { w, h, data: new Uint8Array(w * h) };
    for (let i = 0; i < w * h; i++) mask.data[i] = before[i] === col.id ? 1 : 0;
    const dt = distanceTransform(mask), { labels: cl, count } = label(mask), wide = new Uint8Array(count + 1), size = new Int32Array(count + 1);
    for (let i = 0; i < w * h; i++) if (cl[i]) { size[cl[i]]++; if (dt[i] > 0.75 * res) wide[cl[i]] = 1; }
    const nb = new Map();
    for (let i = 0; i < w * h; i++) {
      const c = cl[i]; if (!c || wide[c]) continue;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || cl[j] === c) continue;
        const l = mine.has(before[j]) ? before[j] : toFabric, m = nb.get(c) || new Map();
        m.set(l, (m.get(l) || 0) + 1); nb.set(c, m);
      }
    }
    const me = labOf.get(col.id), to = new Map();
    for (const [c, m] of nb) {
      const [[A] = [], [B] = []] = [...m.entries()].sort((p, q) => q[1] - p[1]), a = colOf(A), b = colOf(B);
      // (into the fabric only a speck: a pale line on white is still a line)
      if (alike(me, a) && (A !== toFabric || size[c] < 0.5 * res * res)) to.set(c, A);
      // (a blend with the fabric is the edge of the colour it blends into: thin dark lettering anti-aliased to grey
      // stays lettering)
      else if (a && b && deltaE2000(a, me) + deltaE2000(me, b) <= 1.25 * deltaE2000(a, b)) to.set(c, A === toFabric ? B : B === toFabric ? A : deltaE2000(a, me) <= deltaE2000(me, b) ? A : B);
    }
    if (to.size) moves.push([cl, to]);
  }
  // (all at once, from the colours as they were: one piece's move can't pass another on to the fabric)
  for (const [cl, to] of moves) for (let i = 0; i < w * h; i++) if (to.has(cl[i])) labels[i] = to.get(cl[i]);
  // Outlines drawn in the picture (a dark band under BAND mm wide) are lines already: sewn once along their centre.
  // Tracing both their edges drew two parallel lines round Snoopy. Parts of a dark colour's shapes no disc BAND/2 mm
  // across reaches into are such bands (a filled ear stays a shape, the outline running from it a line); a small dark
  // shape on its own (an eye, a nose) is outlined.
  const BAND = 3, dark = (c) => c.lightness <= Math.max(35, ink.lightness + 15);
  // A whole piece that is one stroke of an even width (a crayon or marker line, a logo's letters) is sewn once along
  // its centre whatever its colour, up to STROKE of the drawing's longer side (3-6 mm). Deciding by parts drew the
  // corners of a 3 mm crayon line, where a BAND disc just fits, as little outlines and cut the line there (a house's
  // lumps and broken door), and 4 mm letters as half outlines, half centre lines (KENJI'S at 120 mm).
  const STROKE = 0.04, wMax = Math.min(6, Math.max(BAND, (STROKE * Math.max(w, h)) / res)) * res;
  const lines = { w, h, data: new Uint8Array(w * h) }, bands = { w, h, data: new Uint8Array(w * h) }, wideAt = new Uint8Array(w * h);
  const strokes = { w, h, data: new Uint8Array(w * h) }, widths = [], sw = [];
  for (const col of used) {
    const mask = { w, h, data: new Uint8Array(w * h) };
    for (let i = 0; i < w * h; i++) mask.data[i] = labels[i] === col.id ? 1 : 0;
    const dt = distanceTransform(mask), { labels: cl, count } = label(mask), wide = new Uint8Array(count + 1);
    for (let i = 0; i < w * h; i++) if (cl[i] && dt[i] > 0.75 * res) wide[cl[i]] = 1;   // over 1.5 mm across somewhere
    // each wide piece's depths along its middle (the ridge of its distance to the edge), deepest point, area and what
    // its edge touches (fabric, or another colour of the drawing)
    const ridge = Array.from({ length: count + 1 }, () => []), top = new Float32Array(count + 1), area = new Int32Array(count + 1);
    const open = new Int32Array(count + 1), shut = new Int32Array(count + 1);
    for (let i = 0; i < w * h; i++) {
      const c = cl[i]; if (!c || !wide[c]) continue;
      area[c]++; if (dt[i] > top[c]) top[c] = dt[i];
      const x = i % w;
      let peak = dt[i] >= 1.5;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || !mine.has(labels[j])) open[c]++;
        else if (labels[j] !== col.id) shut[c]++;
        if (j >= 0 && j < w * h && dt[j] > dt[i]) peak = false;
      }
      if (peak) ridge[c].push(dt[i]);
    }
    const stroke = new Uint8Array(count + 1), across = new Float32Array(count + 1);
    for (let c = 1; c <= count; c++) {
      const d = ridge[c].sort((a, b) => a - b);
      if (!wide[c] || d.length < 3) continue;
      const W = 2 * d[d.length >> 1];
      // (even: along most of its middle (a fifth to four fifths) within 0.6 of itself, a leaf tapers; its deepest
      // point, at a corner or a join, under twice its half-width, a filled ear on an outline isn't; long: three widths
      // at least, a dot or a square is under 2; on the fabric: a coloured shape inside a drawing's outlines stays one)
      across[c] = W;
      if (W <= wMax && d[Math.floor(d.length * 0.2)] >= 0.6 * d[Math.floor(d.length * 0.8)] && top[c] <= W && open[c] >= 4 * shut[c])
        stroke[c] = area[c] >= 3 * W * W ? 1 : 2;
    }
    // (a short piece as wide as this colour's strokes, an apostrophe among the letters, is one too; on its own, an
    // outline)
    const ws = [];
    for (let c = 1; c <= count; c++) if (stroke[c] === 1) ws.push(across[c]);
    ws.sort((a, b) => a - b);
    for (let c = 1; c <= count; c++) if (stroke[c] === 2) stroke[c] = ws.length && across[c] <= 1.3 * ws[ws.length >> 1] && area[c] >= 1.6 * across[c] ** 2 ? 1 : 0;
    let band = null;
    if (dark(col)) {
      const r = (BAND / 2) * res, core = { w, h, data: new Uint8Array(w * h) }, small = 2 * BAND * res;
      const x0 = new Int32Array(count + 1).fill(w), x1 = new Int32Array(count + 1), y0 = new Int32Array(count + 1).fill(h), y1 = new Int32Array(count + 1);
      for (let i = 0; i < w * h; i++) {
        const c = cl[i]; if (!c) continue;
        const x = i % w, y = (i - x) / w;
        if (x < x0[c]) x0[c] = x; if (x > x1[c]) x1[c] = x; if (y < y0[c]) y0[c] = y; if (y > y1[c]) y1[c] = y;
      }
      for (let i = 0; i < w * h; i++) core.data[i] = cl[i] && dt[i] > r ? 0 : 1;
      const toCore = distanceTransform(core);
      band = (i) => toCore[i] > r + 0.5 && (x1[cl[i]] - x0[cl[i]] > small || y1[cl[i]] - y0[cl[i]] > small);
    }
    for (let i = 0; i < w * h; i++) {
      if (!cl[i]) continue;
      if (!wide[cl[i]]) lines.data[i] = 1;   // a thin line: its centre comes from the skeleton
      else if (stroke[cl[i]]) { strokes.data[i] = 1; bands.data[i] = 1; sw.push(across[cl[i]]); }
      else if (band && band(i)) { bands.data[i] = 1; widths.push(dt[i]); }
      else wideAt[i] = 1;
    }
  }
  // an outline, drawn on one side only where two colours meet (the lower id), so it isn't doubled, and not along a
  // band (its centre line is the line)
  for (let i = 0; i < w * h; i++) {
    if (!wideAt[i]) continue;
    const x = i % w, l = labels[i];
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= w * h || !mine.has(labels[j])) { lines.data[i] = 1; break; }
      if (labels[j] !== l && labels[j] > l && !bands.data[j] && !lines.data[j] && !alike(labOf.get(l), labOf.get(labels[j]))) { lines.data[i] = 1; break; }
    }
  }
  // thicken the 1 px outlines so the skeleton follows them smoothly
  const thick = { w, h, data: lines.data.slice() };
  for (let i = 0; i < w * h; i++) if (lines.data[i]) { const x = i % w; if (x < w - 1) thick.data[i + 1] = 1; if (i + w < w * h) thick.data[i + w] = 1; }
  // (pruning dead ends under 2 mm too took the strokes off small lettering)
  const edges = lineEnds(skeletonEdges(thick, 3, { spur: 1 }), thick, res);
  if (widths.length) {
    // (the bands' own skeleton, pruned at their width: corners of a wide stroke grow short spurs)
    widths.sort((a, b) => a - b);
    const stroke = Math.max(3, Math.min(BAND * res, 2 * widths[Math.floor(widths.length * 0.9)]));
    const part = { w, h, data: bands.data.map((v, i) => v && !strokes.data[i]) };
    for (const [a, b, p] of skeletonEdges(part, stroke, { spur: 1 })) edges.push([`b${a}`, `b${b}`, p]);
  }
  if (sw.length) {
    sw.sort((a, b) => a - b);
    const W = Math.max(3, sw[Math.floor(sw.length * 0.9)]);
    for (const [a, b, p] of lineEnds(skeletonEdges(strokes, W, { spur: 1 }), strokes, W)) edges.push([`s${a}`, `s${b}`, p]);
  }
  // each connected drawing walked out and back: a closed tour (mm) that ends where it starts; pieces under 2 mm long
  // in all, and not joined to another drawing, are specks (each one a trim, two locks and often a loose thread)
  // (stitches that keep to the curve, not 2 mm chords across a small flower's petals; points under 0.4 mm apart, where
  // short skeleton edges meet, are merged: tiny stitches nest and break thread)
  const tours = order(edges).map((comp) => {
    const t = [];
    for (const q of comp.flatMap(([p], k) => followRun(toMm(p), 2.0, 0.1).slice(k ? 1 : 0)))
      if (!t.length || Math.hypot(q[0] - t.at(-1)[0], q[1] - t.at(-1)[1]) >= 0.4) t.push(q);
    const s = comp[0][0][0], e = comp.at(-1)[0].at(-1);
    if (Math.hypot(s[0] - e[0], s[1] - e[1]) < 0.01 && t.length > 1) t[t.length - 1] = t[0];   // (still ends where it began)
    return t;
  }).filter((t) => t.length > 1);
  // A line end within 2 mm of another drawing is joined to it: the needle steps across, sews that drawing and steps
  // back over the same stitch, instead of jumping (a gap that short is a loose thread the machine never trims; 3 mm
  // drew visible bars between small letters)
  const key = ([x, y]) => `${Math.floor(x / 3)},${Math.floor(y / 3)}`, cells = new Map();
  tours.forEach((t, i) => t.forEach((q, k) => { const c = key(q); if (!cells.has(c)) cells.set(c, []); cells.get(c).push([i, k]); }));
  const deg = new Map();
  for (const [a, b] of edges) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
  const ends = edges.flatMap(([a, b, p]) => [...(deg.get(a) === 1 ? [p[0]] : []), ...(deg.get(b) === 1 ? [p[p.length - 1]] : [])]).map((q) => toMm([q])[0]);
  const near = (q, skip, r) => {   // the nearest tour point within r of q, not in tour `skip`
    const [gx, gy] = key(q).split(",").map(Number);
    let best = null, bd = r;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const [i, k] of cells.get(`${gx + dx},${gy + dy}`) || []) {
      const v = Math.hypot(tours[i][k][0] - q[0], tours[i][k][1] - q[1]);
      if (i !== skip && v <= bd) { bd = v; best = [i, k, v]; }
    }
    return best;
  };
  const joins = [];
  for (const e of ends) {
    const at = near(e, -1, 0.05);
    if (!at) continue;
    const to = near(e, at[0], 2);
    if (to) joins.push({ a: at[0], ka: at[1], b: to[0], kb: to[1], v: to[2] });
  }
  joins.sort((p, q) => p.v - q.v);
  const root = tours.map((_, i) => i), find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
  const links = tours.map(() => []);
  for (const j of joins) if (find(j.a) !== find(j.b)) { root[find(j.a)] = find(j.b); links[j.a].push([j.ka, j.b, j.kb]); links[j.b].push([j.kb, j.a, j.ka]); }
  // a tour from its point k, with every joined drawing sewn where it's joined (and the step back)
  const rotate = (t, k) => [...t.slice(k), ...t.slice(1, k + 1)];
  const nest = (i, k, from) => {
    const t = tours[i], n = t.length - 1, at = new Map();
    for (const [ka, j, kb] of links[i]) if (j !== from) { const r = (ka - k + n) % n; if (!at.has(r)) at.set(r, []); at.get(r).push([j, kb]); }
    const out = [];
    rotate(t, k).forEach((q, r) => { out.push(q); for (const [j, kb] of at.get(r) || []) out.push(...nest(j, kb, i), q); });
    return out;
  };
  // (a short one joined to a drawing costs no trim: KENJI'S apostrophe at 60 mm, 1.6 mm long, was left out)
  const total = new Map();
  tours.forEach((t, i) => total.set(find(i), (total.get(find(i)) || 0) + arclen(t).at(-1)));
  // (the step onto a joined drawing can be a tenth of a mm: points under 0.4 mm after the last are dropped again)
  const spaced = (t) => {
    const o = [t[0]];
    for (let k = 1; k < t.length; k++) if (k === t.length - 1 || Math.hypot(t[k][0] - o.at(-1)[0], t[k][1] - o.at(-1)[1]) >= 0.4) o.push(t[k]);
    return o;
  };
  let left = tours.map((_, i) => i).filter((i) => find(i) === i && total.get(i) >= 4).map((i) => spaced(nest(i, 0, -1)));
  const d = new Design(o.hoop);
  // (sewn in the darkest colour, or the thread picked for the lines)
  const line = o.line ? { hex: o.line, thread: nearestBrotherThread(o.line) } : ink;
  d.color(line.hex, line.thread.name);
  const shapes = left.length;
  // nearest drawing next, entered at its nearest point; rather one over 5 mm away (the machine trims the jump) than
  // a loose 2-5 mm thread
  while (left.length) {
    let bi = 0, bk = 0, bd = Infinity;
    left.forEach((t, i) => t.forEach((q, k) => {
      const v = d.cur ? Math.hypot(q[0] - d.cur[0], q[1] - d.cur[1]) : q[0], s = !d.cur || v <= 2 || v > 5 ? v : v + 1e3;
      if (s < bd) { bd = s; bi = i; bk = k; }
    }));
    d.path(rotate(left[bi], bk));
    left.splice(bi, 1);
  }
  if (!d.stitches.length) throw Object.assign(new Error("No lines in this picture are big enough to stitch."), { code: "small" });
  d.finish();
  return { design: d, summary: [{ ...ink, hex: line.hex, thread: line.thread, shapes, kinds: ["run"] }], fine: { narrowMm2: 0, hairlines: 0 } };
}

// Cross-stitch: the picture on a grid of `cross` mm cells, each the colour most of its pixels have (or left empty when
// most are background). A run of cells in a row is two zigzags of diagonals (bottom-top-bottom… out, top-bottom-top…
// back), so the only straight stitch is one up the run's last edge; climbing every cell edge made lone cells bowties.
function crossStitch(img, analysis, opts) {
  const o = { ...DEFAULTS, ...opts }, { w, h, labels, colors } = analysis, res = o.res;
  const c = (o.cross || 2.5) * res, gw = Math.floor(w / c), gh = Math.floor(h / c), grid = new Int32Array(gw * gh).fill(-1);
  const bg = new Set(colors.filter((k) => k.background || (o.skip || []).includes(k.id)).map((k) => k.id));
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const n = new Map();
    for (let y = Math.floor(gy * c); y < Math.floor((gy + 1) * c); y++) for (let x = Math.floor(gx * c); x < Math.floor((gx + 1) * c); x++) {
      const l = labels[y * w + x]; n.set(l, (n.get(l) || 0) + 1);
    }
    let best = -1, bn = 0, fg = 0, all = 0;
    for (const [l, k] of n) { all += k; if (bg.has(l)) continue; fg += k; if (k > bn) { bn = k; best = l; } }
    if (fg * 2 > all) grid[gy * gw + gx] = best;
  }
  // a speck on open fabric (no cell of its colour within two, no other colour beside it) cost a trim and two locks:
  // dropped. (Every cell with no neighbour of its colour went too, but a small sprigged picture lost half its flowers.)
  const at = (gx, gy) => (gx >= 0 && gy >= 0 && gx < gw && gy < gh ? grid[gy * gw + gx] : -1), lone = [];
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const k = at(gx, gy);
    let near = 0;
    if (k >= 0) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const q = (dx || dy) ? at(gx + dx, gy + dy) : -1;
      if (q === k || (q >= 0 && Math.abs(dx) < 2 && Math.abs(dy) < 2)) near++;
    }
    if (k >= 0 && !near) lone.push(gy * gw + gx);
  }
  for (const i of lone) grid[i] = -1;
  const used = colors.filter((k) => grid.includes(k.id)).sort((a, b) => b.lightness - a.lightness);
  if (!used.length) throw Object.assign(new Error("No square of the grid is mostly picture, so there's nothing to cross-stitch."), { code: "cross" });
  const ox = (gw * c) / 2, oy = (gh * c) / 2, mm = ([gx, gy]) => [(gx * c - ox) / res, (gy * c - oy) / res];
  // cell corners are the vertices, v = gy * W + gx
  const W = gw + 1, V = W * (gh + 1), X = (v) => v % W, Y = (v) => Math.floor(v / W);
  const d = new Design(o.hoop), summary = [];
  for (const col of used) {
    d.color(col.hex, col.thread.name);
    const done = new Uint8Array(gw * gh);   // cells whose cross is sewn
    // Runs are chained by travel instead of a jump (etsy_8 at 2 mm had 722 trims, most runs under 20 stitches plus
    // two locks): a step along a cell edge costs 1 beside a cell of this colour, 2 beside another colour's, 3 across
    // open fabric, and back over a sewn diagonal 1; at most 6 (so open fabric two cells across at most)
    const edge = (c1, c2) => { const a = at(...c1), b = at(...c2); return a === col.id || b === col.id ? 1 : a >= 0 || b >= 0 ? 2 : 4; };
    const moves = (v) => {
      const x = X(v), y = Y(v), out = [];
      if (x < gw) out.push([v + 1, edge([x, y - 1], [x, y])]);
      if (x > 0) out.push([v - 1, edge([x - 1, y - 1], [x - 1, y])]);
      if (y < gh) out.push([v + W, edge([x - 1, y], [x, y])]);
      if (y > 0) out.push([v - W, edge([x - 1, y - 1], [x, y - 1])]);
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const cx = dx > 0 ? x : x - 1, cy = dy > 0 ? y : y - 1;
        if (cx >= 0 && cy >= 0 && cx < gw && cy < gh && done[cy * gw + cx]) out.push([v + dy * W + dx, 1]);
      }
      return out;
    };
    // runs of cells in a row; each can be sewn from any of its four corners (it ends on the other corner that side)
    const runs = [];
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) if (grid[gy * gw + gx] === col.id) {
      const r = runs[runs.length - 1];
      if (r && r.y === gy && r.b === gx - 1) r.b = gx; else runs.push({ y: gy, a: gx, b: gx });
    }
    const corners = (r) => [r.y * W + r.a, (r.y + 1) * W + r.a, r.y * W + r.b + 1, (r.y + 1) * W + r.b + 1];
    const starts = new Map();
    for (const r of runs) for (const s of corners(r)) { if (!starts.has(s)) starts.set(s, []); starts.get(s).push(r); }
    // the run's corners from corner s: zigzag out along one side's diagonals, up (or down) the far edge, zigzag back
    const sew = (r, s) => {
      const n = r.b - r.a + 1, fromLeft = X(s) === r.a, s0 = Y(s) - r.y, pts = [];
      const p = (k, off) => [fromLeft ? r.a + k : r.b + 1 - k, r.y + off];
      for (let k = 0; k <= n; k++) pts.push(p(k, k % 2 ? 1 - s0 : s0));
      for (let k = n; k >= 0; k--) pts.push(p(k, k % 2 ? s0 : 1 - s0));
      for (let x = r.a; x <= r.b; x++) done[r.y * gw + x] = 1;
      r.done = true;
      return pts;
    };
    const dist = new Float64Array(V).fill(Infinity), from = new Int32Array(V).fill(-1);
    let path = null, cur = -1, left = runs.length, crosses = 0;
    const flush = () => { if (path) d.path(path.map(mm)); path = null; };
    while (left--) {
      let pick = null;
      if (cur >= 0) {   // the nearest run start within reach (Dijkstra)
        const seen = [cur], open = [[0, cur]];
        dist[cur] = 0;
        while (open.length) {
          open.sort((a, b) => b[0] - a[0]);
          const [g, v] = open.pop();
          if (g > dist[v]) continue;
          const r = (starts.get(v) || []).find((q) => !q.done);
          if (r) { pick = [r, v]; break; }
          for (const [m, k] of moves(v)) if (g + k <= 6 && g + k < dist[m]) { if (dist[m] === Infinity) seen.push(m); dist[m] = g + k; from[m] = v; open.push([g + k, m]); }
        }
        if (pick) {
          const way = [];
          for (let v = pick[1]; v !== cur; v = from[v]) way.push([X(v), Y(v)]);
          path.push(...way.reverse());
        }
        for (const v of seen) { dist[v] = Infinity; from[v] = -1; }
      }
      if (!pick) {
        // jump to the nearest run, but rather one over 5 mm away (the machine trims it) than a loose 2-5 mm thread
        flush();
        let bd = Infinity;
        for (const r of runs) if (!r.done) for (const s of corners(r)) {
          const v = cur < 0 ? Y(s) * W + X(s) : (Math.hypot(X(s) - X(cur), Y(s) - Y(cur)) * c) / res;
          const score = cur < 0 || v > 5 ? v : v + 1e6;
          if (score < bd) { bd = score; pick = [r, s]; }
        }
        path = [[X(pick[1]), Y(pick[1])]];
      }
      const pts = sew(...pick), [ex, ey] = pts[pts.length - 1];
      path.push(...pts.slice(1));
      cur = ey * W + ex; crosses += pick[0].b - pick[0].a + 1;
    }
    flush();
    summary.push({ ...col, shapes: crosses, kinds: ["cross"] });
  }
  d.finish();
  return { design: d, summary, fine: { narrowMm2: 0, hairlines: 0 } };
}

// Size is the sewn design's longer side, not the picture's: a framed photo at "174 mm" sewed 84 x 58 mm, and a
// picture could never fill the hoop. box: the part of the picture whose colours were learned ({ sx, sy, sw, sh },
// picture px); boxes: the extent of each colour to be sewn, fractions of box ([x0, y0, x1, y1], from learnColours).
// Returns where to cut the picture (`crop`, picture px, and `frac`, fractions of box), the working size in px to draw
// it at, and `max`: the largest longer side (mm) that fits the hoop field. `fit`: how much bigger to draw it than its
// colours' extent says, learned from the last time it was sewn (the edges' blend pixels and specks aren't sewn: 100 mm
// came out 99 x 88).
export function picturePlan(box, boxes, sizeMm, hoop, res = DEFAULTS.res, fit = 1) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const b of boxes) if (b[2] > b[0] && b[3] > b[1]) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  if (x1 <= x0 || y1 <= y0) { x0 = y0 = 0; x1 = y1 = 1; }
  const cw = (x1 - x0) * box.sw, ch = (y1 - y0) * box.sh, L = Math.max(cw, ch);
  const maxW = hoop.w - 2 * MARGIN - 2, maxH = hoop.h - 2 * MARGIN - 2, max = L * Math.min(maxW / cw, maxH / ch);
  const s = (Math.min(sizeMm, max) * fit) / L;   // mm per picture px
  // (a little room round it: 2% and 3 working px)
  const m = 0.02 * L + 3 / (s * res);
  const sx = Math.max(box.sx, box.sx + x0 * box.sw - m), sy = Math.max(box.sy, box.sy + y0 * box.sh - m);
  const ex = Math.min(box.sx + box.sw, box.sx + x1 * box.sw + m), ey = Math.min(box.sy + box.sh, box.sy + y1 * box.sh + m);
  const crop = { sx, sy, sw: ex - sx, sh: ey - sy };
  return { crop, frac: [(sx - box.sx) / box.sw, (sy - box.sy) / box.sh, (ex - box.sx) / box.sw, (ey - box.sy) / box.sh],
    w: Math.max(8, Math.round(crop.sw * s * res)), h: Math.max(8, Math.round(crop.sh * s * res)), max: Math.floor(max), sizeMm: Math.min(sizeMm, max) };
}

// fit the picture's longest side to sizeMm, capped by the hoop
export function workingSize(imgW, imgH, sizeMm, hoop, res = DEFAULTS.res) {
  const maxW = hoop.w - 2 * MARGIN - 2, maxH = hoop.h - 2 * MARGIN - 2;
  let s = sizeMm / Math.max(imgW, imgH);
  s = Math.min(s, maxW / imgW, maxH / imgH);
  return { wMm: imgW * s, hMm: imgH * s, w: Math.max(8, Math.round(imgW * s * res)), h: Math.max(8, Math.round(imgH * s * res)) };
}

// A filled shape (mm polygon, y down) as tatami stitches: underlay across, then the fill, like a picture's colour.
// Used by the Design tab's patches.
// poly: one closed outline, or several (holes too, even-odd); `inset` mm keeps the rows off the edge (a satin covers it)
// opts.pattern: a FILL_PATTERNS key; opts.share: this layer's part of the density across the shape (see tatami);
// opts.underlay: false for a second layer
export function fillPolygon(poly, { angle = DEFAULTS.fillAngle, density = DENSITY.solid, res = DEFAULTS.res, inset = 0, pattern = "tatami", share = null, underlay = true } = {}) {
  const loops = Array.isArray(poly[0][0]) ? poly : [poly], pts = loops.flat();
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs) - 1, y0 = Math.min(...ys) - 1;
  const w = Math.ceil((Math.max(...xs) - x0 + 1) * res), h = Math.ceil((Math.max(...ys) - y0 + 1) * res);
  const mask = { w, h, data: new Uint8Array(w * h) };
  // even-odd scanline fill at pixel centres
  for (let y = 0; y < h; y++) {
    const Y = y0 + (y + 0.5) / res, cut = [];
    for (const l of loops) for (let i = 0; i < l.length; i++) {
      const [ax, ay] = l[i], [bx, by] = l[(i + 1) % l.length];
      if ((ay <= Y) !== (by <= Y)) cut.push(ax + ((Y - ay) * (bx - ax)) / (by - ay));
    }
    cut.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cut.length; k += 2)
      for (let x = Math.max(0, Math.ceil((cut[k] - x0) * res - 0.5)); x < Math.min(w, Math.floor((cut[k + 1] - x0) * res - 0.5) + 1); x++) mask.data[y * w + x] = 1;
  }
  if (inset) { const e = distanceTransform(mask); for (let i = 0; i < w * h; i++) if (e[i] <= inset * res) mask.data[i] = 0; }
  const { labels, count } = label(mask), dt = distanceTransform(mask), paths = [];
  const toMm = (p) => p.map(([x, y]) => [x0 + (x + 0.5) / res, y0 + (y + 0.5) / res]);
  for (let id = 1; id <= count; id++) {
    const comp = { id, labels, dt, pixels: [] };
    for (let i = 0; i < w * h; i++) if (labels[i] === id) comp.pixels.push(i);
    if (comp.pixels.length < 1.5 * res * res) continue;
    const under = underlay ? tatami(mask, comp, res, { angle: angle + 90, spacing: 2.5, stitch: 3, inset: 0.4, pull: 0 }) : [];
    const fill = tatami(mask, comp, res, { angle, spacing: density, stitch: 3.5, pull: 0.15, pattern, share });
    paths.push(...routeFill([under, fill], comp, mask, res).map(toMm));
  }
  return paths;
}

