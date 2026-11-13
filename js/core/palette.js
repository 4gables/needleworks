/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// A picture's colours: learned once per picture (clusters of flat pixels, background and frame set aside, merged
// to the count asked, each matched to a Brother thread), labelled onto any working image, and what of the picture
// is ink. Size and Turn never change the threads. The stitches are digitize.js. (Part of digitize.js until 2026-11.)
import { labOf } from "./colour.js";
import { FILL } from "./fill.js";
import { distanceTransform, label } from "./raster.js";
import { PEC_MATCH, hexToRgb, nearestBrotherThread, pecThread, rgbToHex } from "./threads.js";

export const DEFAULTS = {
  colors: 6,          // thread colours (not counting background)
  sizeMm: 100,        // longest side of the finished design
  removeBackground: true,
  fillAngle: FILL.angle,   // degrees
  density: 0.35,      // mm between fill rows (DENSITY.solid)
  res: FILL.res,      // working pixels per mm (5 lost the narrow notches of small lettering, e.g. an M)
};
// ---------- colour ----------
export const srgbToLab = labOf;   // (core/colour.js)
// CIEDE2000 colour difference of two Lab colours (Sharma, Wu & Dalal 2005). Plain Lab distance overweights chroma:
// it sent an olive green to Russet Brown and a teal to Pewter.
export function deltaE2000([L1, a1, b1], [L2, a2, b2], kL = 1, kH = 1) {
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
  if (!any) return null;
  // A frame runs round the picture: along at least half of two sides that meet at a corner (a photo cropped off-centre
  // keeps two). One side alone is part of the drawing: a child's ground line across the bottom, 8 px of green, was
  // left out as a frame in every style, with and without white at its ends. Opposite sides alone (sky above, grass
  // below) are the drawing too. Each frame pixel counts for the side it's nearest.
  const along = [new Uint8Array(w), new Uint8Array(w), new Uint8Array(h), new Uint8Array(h)];   // top, bottom, left, right
  for (let i = 0; i < w * h; i++) if (frame[i]) {
    const x = i % w, y = (i - x) / w, d = [y, h - 1 - y, x, w - 1 - x], s = d.indexOf(Math.min(...d));
    along[s][s < 2 ? x : y] = 1;
  }
  const side = along.map((a) => a.reduce((t, v) => t + v, 0) >= 0.5 * a.length);
  return (side[0] || side[1]) && (side[2] || side[3]) ? { frame, inset: k * 0.005 } : null;
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
export const across = (p, q) => {
  const h = hueAt(p), f = familyOf(h);
  if (f === familyOf(hueAt(q))) return 0;
  const d = (e) => { const t = Math.abs(h - e) % 360; return t > 180 ? 360 - t : t; };
  return Math.min(1, Math.min(d(FAMILY[(f + 5) % 6]), d(FAMILY[f])) / 4);
};
// Lab of every opaque pixel (-1: see-through)
export function pixels(img) {
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
// A textured picture: inside its shapes, away from their edges, the colour is not flat. Of the ink pixels more than
// 3 `s` px inside the ink (the ink: opaque and not the page's colour, the mean colour along the picture's border),
// under TEXTURED are flat (ΔE under 6 to the four pixels `s` away). `s` is two of the picture's own pixels on the
// copy the colours are learned from (`scale`: copy px per picture px). Clip art and logos are flat inside whatever
// their edges do (0.63-1 on the corpus; a crayon drawing's flecked strokes 0.49); a picture of thin lines has no
// inside to judge and is left alone (1). A picture drawn to look stitched is not flat anywhere (the tester's sheet
// 0.25 and its three parts 0.11-0.22; the corpus's stitched sheets 0.03-0.27). Photos of real embroidery read 0.31
// and are not smoothed unasked: smoothed, a sheet of roses lost its reds and pinks to one mauve (shaded tones become
// solid colours of their own and the merges average toward them). Between TEXTURED and 0.55 the page suggests it.
// Ashley's julep cup (2026-11): each area was a salt-and-pepper mix of light and dark pixels, the cup's grey and a
// jersey's white were learned as one colour at any count, and the cup sewed as a flat white shape.
// Tried and dropped: every opaque pixel 1 px apart (the answer changed with the scale, 0.23 for a sheet of three
// motifs and 0.31-0.56 for each cut out on its own, and with the page: the same sheet on white 0.59); and smoothing
// only where the picture is rough (small lettering and thin rules are rough too: a logo's 2 px rule was lost, and
// with "no calm square nearby" added a stitched cup was no longer found).
const TEXTURED = 0.28, INSIDE = 0.15;
export function flatShare(P, s = 1) {
  const { w, h, n, lab, opaque, hasAlpha } = P;
  if (!opaque.length) return 1;
  const d2 = (i, j) => (lab[i * 3] - lab[j * 3]) ** 2 + (lab[i * 3 + 1] - lab[j * 3 + 1]) ** 2 + (lab[i * 3 + 2] - lab[j * 3 + 2]) ** 2;
  const ink = { w, h, data: new Uint8Array(n) };
  let page = null;
  if (!hasAlpha) {
    const sum = [0, 0, 0]; let k = 0;
    const add = (i) => { sum[0] += lab[i * 3]; sum[1] += lab[i * 3 + 1]; sum[2] += lab[i * 3 + 2]; k++; };
    for (let x = 0; x < w; x++) { add(x); add((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { add(y * w); add(y * w + w - 1); }
    page = sum.map((v) => v / k);
  }
  for (const i of opaque) ink.data[i] = !page || (lab[i * 3] - page[0]) ** 2 + (lab[i * 3 + 1] - page[1]) ** 2 + (lab[i * 3 + 2] - page[2]) ** 2 > 100 ? 1 : 0;
  const deep = distanceTransform(ink);
  let all = 0, k = 0;
  for (const i of opaque) {
    if (deep[i] <= 3 * s) continue;
    const x = i % w; if (x < s || x >= w - s || i < s * w || i >= n - s * w) continue;
    all++; if (Math.max(d2(i, i - s), d2(i, i + s), d2(i, i - s * w), d2(i, i + s * w)) < 36) k++;
  }
  // (too little inside to judge: under INSIDE of the ink. A sheet of small flowers on thin stems had 1 % of its
  // pixels that deep, their petals' shading, and read 0.01)
  let inked = 0; for (const i of opaque) inked += ink.data[i];
  return all < INSIDE * inked ? 1 : k / all;
}
// Such a picture is smoothed before its colours are learned and before it is labelled: each pixel takes the mean of
// the calmest of the four squares that meet at it (Kuwahara's filter, 1976: texture flattens, edges stay where they
// are, where a blur would smear them into blend colours). The squares are `r` + 1 px across; `passes` times over.
// Only opaque pixels count, and see-through ones stay as they are. Returns a new image.
export function smoothed(img, r = 2, passes = 2) {
  const { width: w, height: h } = img, W = w + 1;
  let data = img.data;
  for (let pass = 0; pass < passes; pass++) {
    // summed-area tables of r, g, b, luminance, its square, and the count of opaque pixels
    const S = Array.from({ length: 6 }, () => new Float64Array(W * (h + 1)));
    for (let y = 0; y < h; y++) {
      const row = [0, 0, 0, 0, 0, 0];
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i + 3] >= 128) { const R = data[i], G = data[i + 1], B = data[i + 2], L = 0.2126 * R + 0.7152 * G + 0.0722 * B; row[0] += R; row[1] += G; row[2] += B; row[3] += L; row[4] += L * L; row[5]++; }
        const j = (y + 1) * W + x + 1;
        for (let q = 0; q < 6; q++) S[q][j] = S[q][j - W] + row[q];
      }
    }
    const box = (q, x0, y0, x1, y1) => S[q][(y1 + 1) * W + x1 + 1] - S[q][y0 * W + x1 + 1] - S[q][(y1 + 1) * W + x0] + S[q][y0 * W + x0];
    const out = new Uint8ClampedArray(data);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;
      let best = null, bv = Infinity;
      for (const [dx, dy] of [[-r, -r], [0, -r], [-r, 0], [0, 0]]) {
        const x0 = Math.max(0, x + dx), y0 = Math.max(0, y + dy), x1 = Math.min(w - 1, x + dx + r), y1 = Math.min(h - 1, y + dy + r), k = box(5, x0, y0, x1, y1);
        if (!k) continue;
        const m = box(3, x0, y0, x1, y1) / k, v = box(4, x0, y0, x1, y1) / k - m * m;
        if (v < bv) { bv = v; best = [x0, y0, x1, y1, k]; }
      }
      if (!best) continue;
      const [x0, y0, x1, y1, k] = best;
      out[i] = box(0, x0, y0, x1, y1) / k; out[i + 1] = box(1, x0, y0, x1, y1) / k; out[i + 2] = box(2, x0, y0, x1, y1) / k;
    }
    data = out;
  }
  return { width: w, height: h, data };
}
// (the clusters from `first` on are those learned from thin lines: a pixel further than ΔE 12 from one, and a blend of
// its nearest other cluster and another, takes that nearest. The anti-aliased edge of green lettering, nearer a teal
// rule's colour than to the green or the white, sewed teal slivers)
const nearestOf = (lab, i, C, first = C.length) => {
  let best = 0, bd = Infinity, base = 0, bb = Infinity;
  for (let j = 0; j < C.length; j++) {
    const a = lab[i * 3] - C[j][0], b = lab[i * 3 + 1] - C[j][1], e = lab[i * 3 + 2] - C[j][2], v = a * a + b * b + e * e;
    if (v < bd) { bd = v; best = j; }
    if (j < first && v < bb) { bb = v; base = j; }
  }
  if (best < first || bd < 144) return best;
  const A = C[base], p = [lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]];
  for (let j = 0; j < first; j++) {
    if (j === base) continue;
    const B = C[j], ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    if (L2 < 36) continue;
    const t = ((p[0] - A[0]) * ab[0] + (p[1] - A[1]) * ab[1] + (p[2] - A[2]) * ab[2]) / L2;
    if (t > 0 && t < 1 && (p[0] - A[0] - t * ab[0]) ** 2 + (p[1] - A[1] - t * ab[1]) ** 2 + (p[2] - A[2] - t * ab[2]) ** 2 < Math.max(36, 0.0225 * L2)) return base;
  }
  return best;
};
// k-means clusters of the pixels not in `skip`, learned from flat pixels only (anti-aliased edges blend two colours
// and would steal a thread), and each pixel's cluster. `lines`: then the colours of lines a pixel or two wide, which
// have no flat pixel (a logo's teal rule, a red rule, a green stem: each sewn in the colour beside it). `real` marks
// their pixels.
function cluster(P, k, skip, lines = false) {
  const { w, n, lab } = P, opaque = skip ? P.opaque.filter((i) => !skip[i]) : P.opaque;
  const d2 = (i, j) => (lab[i * 3] - lab[j * 3]) ** 2 + (lab[i * 3 + 1] - lab[j * 3 + 1]) ** 2 + (lab[i * 3 + 2] - lab[j * 3 + 2]) ** 2;
  const inner = (i) => { const x = i % w; return x > 0 && x < w - 1 && i >= w && i < n - w; };
  const flat = opaque.filter((i) => !inner(i) || Math.max(d2(i, i - 1), d2(i, i + 1), d2(i, i - w), d2(i, i + w)) < 36);   // ΔE < 6 to every neighbour
  const train = flat.length > opaque.length * 0.2 ? flat : opaque, C = [];
  if (train.length) for (const c of kmeans(lab, train, Math.min(k, train.length)))
    if (!C.some((d) => (c[0] - d[0]) ** 2 + (c[1] - d[1]) ** 2 + (c[2] - d[2]) ** 2 < 4)) C.push(c);
  const real = new Uint8Array(n);
  if (lines && C.length) {
    // A line's pixel is flat along it (ΔE < 6 to both neighbours one way) and no blend of what lies either side of it
    // (an anti-aliased edge is flat along the edge too), nor of the side most unlike it and a colour found already (a
    // dark 1 px rule drawn grey), nor near one (ΔE 10)
    const at = (i) => [lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]], e2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
    const mid = (p, A, B, hi) => {
      const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      if (L2 < 36) return false;
      const t = ((p[0] - A[0]) * ab[0] + (p[1] - A[1]) * ab[1] + (p[2] - A[2]) * ab[2]) / L2;
      // (within 6, or 0.15 of the way: blending in sRGB bows away from the straight line in Lab)
      return t >= 0.1 && t <= hi && e2(p, [A[0] + t * ab[0], A[1] + t * ab[1], A[2] + t * ab[2]]) < Math.max(36, 0.0225 * L2);
    };
    const far = [], sides = new Map();
    for (const i of opaque) {
      if (!inner(i)) continue;
      const lr = Math.max(d2(i, i - 1), d2(i, i + 1)), ud = Math.max(d2(i, i - w), d2(i, i + w));
      if ((lr < 36) === (ud < 36)) continue;   // (flat both ways is flat; neither, no line)
      const [a, b] = lr < 36 ? [i - w, i + w] : [i - 1, i + 1], p = at(i), A = at(a), B = at(b);
      if (mid(p, A, B, 0.9) || C.some((c) => e2(p, c) < 100)) continue;
      const side = d2(i, a) >= d2(i, b) ? A : B;
      if (C.some((c) => mid(p, side, c, 1.05))) continue;
      far.push(i);
      const sc = nearestOf(lab, d2(i, a) >= d2(i, b) ? a : b, C); sides.set(sc, (sides.get(sc) || 0) + 1);
    }
    if (far.length >= 12) {
      C.first = C.length;
      // (the line's own colour, not the blends of it with what's beside it where a slanted line covers a pixel only
      // in part: a 2 px red rule came out Red, Carmine and Salmon Pink. Strongest first, none a blend of the side's
      // colour and one taken)
      const S = C[[...sides.entries()].sort((p, q) => q[1] - p[1])[0][0]], got = [];
      for (const c of kmeans(lab, far, Math.min(4, far.length)).sort((p, q) => e2(q, S) - e2(p, S)))
        if (C.length < 31 && !C.some((d) => e2(c, d) < 100) && !got.some((g) => mid(c, S, g, 1.05))) { C.push(c); got.push(c); }
      for (const i of far) real[i] = 1;
    }
  }
  const labels = new Int16Array(n).fill(-1);
  for (const i of opaque) labels[i] = nearestOf(lab, i, C, C.first);
  return { C, labels, real };
}
// The picture's threads, learned from `img` (any size: the Picture tab sends the same copy whatever the Size).
// Returns { C: fine clusters (Lab), map: fine cluster -> colour id, colors, bg (the background's id, or -1), frame
// (a mask over img, or null), boxes: each colour's extent as fractions of img [x0, y0, x1, y1], merged, empty }.
// The Thread colours count is every thread sewn, the background's colour closed in by the design (`inside`) included
// (owner, 2026-11-13: a BYU logo at one colour came out Ultramarine and White, at two Prussian Blue, Cornflower Blue
// and White). When the design's own colours fill the count and some of it is closed in (0.2 % of the learned copy),
// it gives up a slot only where that costs the look little: the design learned one colour fewer (merged pairwise as
// always, cheapest first) merges only two near-duplicate shades (`NEAR` ΔE00 apart) or a blend, all edge, of two
// colours it keeps (BYU at six learns Black and Dark Gray from the soft edges). Else the closed-in colour stays fabric (`spare`), sewn only when the
// person asks ("Sew it": labelWith's inside "all"). One colour is always so. Worse: one colour fewer whenever white is
// closed in, whatever was lost (red text sewn purple at 3 colours, a purple stroke green at 4: six corpus cases).
const NEAR = 15;
export function learnColours(img, opts = {}) {
  const n = opts.colors ?? DEFAULTS.colors, m = learnOnce(img, opts);
  if (m.empty || m.inside < 0 || !m.colors[m.inside]?.inside || opts.style === "line") return m;
  const own = (q) => q.colors.filter((c) => !c.background && !c.inside);
  if (own(m).length + 1 <= n) return m;
  const L = n > 1 ? labelWith(img, m, undefined, { inside: "all" }) : null;
  if (L && L.closed > 0.002) {
    const f = learnOnce(img, { ...opts, colors: n - 1 }), lab = (c) => srgbToLab(...hexToRgb(c.picture || c.hex));
    const keep = [...own(f), ...f.colors.filter((c) => c.background)].map(lab);
    // (what the count one fewer merged: the colours of the n that share their nearest of the n - 1, and how far apart
    // they are. Measured from the merged colour instead, sky and teal mountains each lay under 15 from the blue
    // between them, and a landscape lost its mountains: look 80 -> 74)
    const near = new Map();
    for (const c of own(m)) {
      let best = null, bd = Infinity;
      for (const k of own(f)) { const d = deltaE2000(lab(c), lab(k)); if (d < bd) { bd = d; best = k.id; } }
      near.set(best, [...(near.get(best) || []), c]);
    }
    let far = 0, pair = [];
    for (const g of near.values()) for (const a of g) for (const b of g) { const d = deltaE2000(lab(a), lab(b)); if (d > far) { far = d; pair = [a, b]; } }
    // (a blend: one of the two between two colours kept, and all edge, no pixel of it 2 px from another colour. A
    // lavender title is between purple and white too, but an ink: merged, "Easter Bouquets" sewed purple, look 86 -> 77)
    const e = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const edgy = (c) => {
      const M = lab(c);
      if (!keep.some((A, i) => keep.some((B, j) => j > i && e(A, M) + e(M, B) <= 1.25 * e(A, B)))) return false;
      const mk = { w: L.w, h: L.h, data: new Uint8Array(L.w * L.h) };
      let all = 0, deep = 0;
      for (let i = 0; i < mk.data.length; i++) if (L.labels[i] === c.id) { mk.data[i] = 1; all++; }
      const dt = distanceTransform(mk);
      for (let i = 0; i < mk.data.length; i++) if (mk.data[i] && dt[i] > 2) deep++;
      return all > 0 && deep < 0.1 * all;
    };
    const blend = pair.length === 2 && pair.some(edgy);
    if (f.inside >= 0 && f.colors[f.inside]?.inside && (far < NEAR || (blend && far < 2 * NEAR))) return { ...f, gave: true };
  }
  return { ...m, spare: true };
}
function learnOnce(img, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  // (a textured picture is learned from its smoothed copy, and labelled from one. `smooth`: true or false as the
  // person chose, else by the picture. `scale`: the copy's px per picture px. Tried: the colours learned from the
  // picture as it is and only its areas from the smoothed copy; the stitched cup was flat white again.)
  let P = pixels(img);
  const step = Math.max(1, Math.min(6, Math.round(2 * (o.scale || 0.5)))), share = flatShare(P, step), smooth = o.smooth ?? (!!o.scale && share < TEXTURED);   // (judged only when the scale is known: the page always says it)
  if (smooth) { img = smoothed(img, Math.max(2, step)); P = pixels(img); }
  const { w, h, n, opaque, hasAlpha } = P, { data } = img;
  const cut = o.removeBackground && !hasAlpha;
  let { C, labels, real } = cluster(P, FINE, null, true), frame = null;
  // a frame (a band at the picture's edge) isn't part of the design, and isn't the background: learn again without it
  // (found on a coarse clustering: fine clusters chain a backdrop's shades into the frame's colour family)
  // (`edge`: the person said the band is part of the drawing, "Sew the edge band too": it's sewn, and the fabric is
  // still what's inside it, not the band: the white inside a sewn frame was filled)
  let inset = null;
  if (cut && C.length) {
    const q = cluster(P, 5, null);
    frame = findFrame(q.labels, w, h, q.C); inset = frame?.inset ?? null;
    if (frame && o.edge) frame = null;
    if (frame) ({ C, labels, real } = cluster(P, FINE, frame.frame, true));
  }
  const K = C.length, area = new Array(K).fill(0), rgb = C.map(() => [0, 0, 0]);
  for (let i = 0; i < n; i++) {
    const l = labels[i]; if (l < 0) continue;
    area[l]++; rgb[l][0] += data[i * 4]; rgb[l][1] += data[i * 4 + 1]; rgb[l][2] += data[i * 4 + 2];
  }
  // background = the most common colour along the border, or just inside a frame (the five clean rings: the first
  // can run along the frame's blended inner edge); only when the picture has no transparency
  let bg = -1, ring = () => 0;
  // (a band sewn on purpose that runs to the picture's edge: the fabric is the first colour inside it, the first ring
  // in from the edge where another colour has 60%)
  if (cut && K && o.edge && inset === null) {
    const dom = (f) => {
      const x0 = Math.round(f * w), y0 = Math.round(f * h), x1 = w - 1 - x0, y1 = h - 1 - y0, c = new Map();
      if (x1 <= x0 || y1 <= y0) return [-1, 0];
      const add = (i) => { if (labels[i] >= 0) c.set(labels[i], (c.get(labels[i]) || 0) + 1); };
      for (let x = x0; x <= x1; x++) { add(y0 * w + x); add(y1 * w + x); }
      for (let y = y0 + 1; y < y1; y++) { add(y * w + x0); add(y * w + x1); }
      const all = [...c.values()].reduce((a, b) => a + b, 0), [l, k] = [...c.entries()].sort((a, b) => b[1] - a[1])[0] || [-1, 0];
      return [l, k / Math.max(1, all)];
    };
    const [E] = dom(0);
    for (let k = 1; k <= 50 && E >= 0; k++) {
      const [l, sh] = dom(k * 0.005);
      if (l >= 0 && sh >= 0.6 && Math.hypot(C[l][0] - C[E][0], C[l][1] - C[E][1], C[l][2] - C[E][2]) >= 10) { inset = k * 0.005; break; }
    }
  }
  if (cut && K) {
    const cnt = new Map(), add = (i) => { if (labels[i] >= 0) cnt.set(labels[i], (cnt.get(labels[i]) || 0) + 1); };
    for (let r = 0; r < (inset !== null ? 5 : 1); r++) {
      const f = inset !== null ? inset + r * 0.005 : 0;
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
  // A pale colour (ΔE00 under 15 from the fabric) all but a fifth of which lies within 3 px of a stronger colour it
  // isn't a shade of (over 1.5 x SAME from each) is that colour's fringe, fabric too: a JPEG's halo round blue
  // lettering took two threads, Beige and Cream Brown.
  const fringe = new Uint8Array(K);
  if (bg >= 0) {
    const pale = (j) => !isBg(j) && deltaE2000(C[j], C[bg]) < 15, strong = C.map((_, j) => area[j] > 0 && !isBg(j) && !pale(j));
    const m = { w, h, data: new Uint8Array(n) };
    for (let i = 0; i < n; i++) m.data[i] = labels[i] >= 0 && strong[labels[i]] ? 0 : 1;
    const dist = distanceTransform(m), hug = new Int32Array(K);
    for (let i = 0; i < n; i++) if (labels[i] >= 0 && dist[i] <= 3) hug[labels[i]]++;
    for (let j = 0; j < K; j++) if (area[j] && pale(j) && hug[j] >= 0.8 * area[j] && C.every((c, q) => !strong[q] || deltaE2000(C[j], c) > 1.5 * SAME)) fringe[j] = 1;
  }
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
  // A colour that fades into the fabric with no edge (a soft drop shadow, a glow) is a shade of the fabric: where it
  // meets the fabric, the pixels two steps either side differ by under 0.6 of its own difference from the fabric (and
  // ΔE 20) along 70% of its edge with the fabric: a drawn edge, anti-aliased or not, is a step. (Sending colours soft
  // along a third of their edge to the fabric too, when threads ran short, erased etsy_1's pale flowers.) Found from the fabric inwards, a shade at a time, so a shadow's darker core goes with its fading rim. A
  // shadow had been sewn as an orange halo round navy lettering, or as three greys.
  if (bg >= 0) {
    const { lab } = P, d2 = (i, j) => (lab[i * 3] - lab[j * 3]) ** 2 + (lab[i * 3 + 1] - lab[j * 3 + 1]) ** 2 + (lab[i * 3 + 2] - lab[j * 3 + 2]) ** 2;
    const out = (l) => l < 0 || isBg(l) || fringe[l], lim = C.map((c) => Math.min(20, 0.6 * e76(c, C[bg])) ** 2);
    for (let round = 0; round < 12; round++) {
      const soft = new Int32Array(K), all = new Int32Array(K);
      for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
        const i = y * w + x;
        for (const s of [1, w]) {
          const j = i + s, a = labels[i], b = labels[j];
          if (a < 0 || b < 0 || out(a) === out(b)) continue;
          const [k, inner, outer] = out(a) ? [b, j + 2 * s, i - 2 * s] : [a, i - 2 * s, j + 2 * s];
          all[k]++; if (d2(inner, outer) < lim[k]) soft[k]++;
        }
      }
      // (unless the picture is soft all over, its biggest colours too: a 50 px drawing blown up)
      if (!round) {
        const big = C.map((_, j) => j).filter((j) => !out(j) && area[j]).sort((a, b) => area[b] - area[a]), tot = big.reduce((t, j) => t + area[j], 0);
        let S = 0, T = 0, got = 0;
        for (const j of big) { if (got >= 0.5 * tot) break; got += area[j]; S += soft[j]; T += all[j]; }
        if (S >= 0.35 * T) break;
      }
      let more = false;
        for (let j = 0; j < K; j++) if (!out(j) && area[j] && all[j] >= 20 && soft[j] >= 0.7 * all[j]) { fringe[j] = 1; more = true; }
      if (!more) break;
    }
  }
  for (let j = 0; j < K; j++) if (area[j] && !isBg(j) && !fringe[j]) ink.push(j);
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
  // (and a thin line's pixels, which have no solid pixel: a teal rule merged into the green lettering as an edge)
  const lineIn = new Int32Array(K);
  for (let i = 0; i < n; i++) if (real[i] && labels[i] >= 0) lineIn[labels[i]]++;
  const effOf = (g) => {
    const gm = g.members.reduce((s, v) => (s | (1 << v)) >>> 0, 0);
    let k = 0; for (const [m, c] of sets) if (!(Math.floor(m / 32) & ~gm)) k += c;
    for (const j of g.members) k += lineIn[j];
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
    // (and two colours under SAME apart are one whatever their size: a big colour's weight kept two shades of one blue
    // lettering apart, Ultramarine and Prussian Blue)
    let best = null, same = null;
    for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        const v = apart(groups[a].lab, groups[b].lab), c = v * Math.min(weight(groups[a]), weight(groups[b]));
        if (!best || c < best.c) best = { c, a, b };
        if (v < SAME && (!same || c < same.c)) same = { c, a, b };
      }
      // (into the background only when it's that close: a white dog on a pale blue backdrop stays)
      if (bgLab) { const c = apart(groups[a].lab, bgLab) * weight(groups[a]); if (c < SAME && (!best || c < best.c)) best = { c, a, b: -1 }; }
    }
    if (best && groups.length <= o.colors && best.c >= SAME) best = same;
    if (!best) break;
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
  // The background's colour inside the design (white lettering on a badge, a jersey's white diamonds, an eye's white) is
  // part of the design, sewn in the background's thread: `inside`, a colour of its own after the background (labelWith
  // finds its pixels: those the picture's edge doesn't reach), or the design colour that has that thread already.
  let bgId = -1, inside = -1;
  if (bg >= 0) {
    const id = (bgId = colors.length), thread = nearestBrotherThread(bgHex);
    for (let j = 0; j < K; j++) if (map[j] < 0) map[j] = id;
    colors.push({ id, hex: bgHex, picture: bgHex, thread, lightness: C[bg][0], background: true });
    const same = colors.find((c) => !c.background && c.thread.hex === thread.hex);
    inside = same ? same.id : id + 1;
    if (!same) colors.push({ id: id + 1, hex: thread.hex, picture: bgHex, thread, lightness: C[bg][0], background: false, inside: true });
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
  // (a shade or fringe left out on purpose is no lost line)
  const lost = groups.length ? lostLines(P, labels.map((l) => (l < 0 ? -1 : fringe[l] ? -2 : map[l])), colors) / Math.max(w, h) : 0;
  return { w, h, C, first: C.first ?? C.length, map, colors, bg: bgId, inside, frame, boxes, hasAlpha, smooth, flat: share, scale: o.scale || 0,
    merged: Math.max(0, o.colors - groups.length), empty, lost };
}
// Label a picture's pixels with the colours learned from it (possibly from a copy at another size). `crop`
// [x0, y0, x1, y1] is the part of the learned copy img shows (fractions; default the whole).
// The background's colour that the picture's edge doesn't reach is closed in by the design, and sewn (`inside` "all",
// the default) as part of it: white lettering on a badge, a jersey's diamonds, the white of an eye. No rule tells
// those from page seen through the design (the hole of a big O, the inside of an outline): a rule on how thick the ink
// round a piece is left a white star in a red ring out and still sewed the gaps in a bouquet. So it's all sewn, said
// on the page, with one tap to leave it out ("none"; a line drawing too).
// `res` (working px per mm, when img is the working copy): a piece that is a dot (under 1.5 mm², or under 4 mm² and
// 2.5 mm across: the hole in a small e) or nowhere 0.6 mm across (the blend between a fill and its outline, read as
// the background's colour) stays fabric. Returns `closed` too: the share of the picture that is closed in.
// `inside`: "auto" sews the closed-in colour unless the model has no thread to spare for it (`spare`), "all" sews it
// always (the person asked), "none" leaves it as fabric.
export function labelWith(img, model, crop = [0, 0, 1, 1], { inside = "auto", res = 0 } = {}) {
  // (labelled from a gentler smoothing than the colours were learned from, squares 2 px across: at 3 px a script
  // title's 0.8 mm strokes wore away)
  // (labelled from a gentler smoothing than the colours were learned from: squares one picture pixel across on the
  // working copy and 2 px at least, three times. At 3 px a script title's 0.8 mm strokes wore away)
  const kw = model.scale ? (model.scale * img.width) / Math.max(1, (crop[2] - crop[0]) * model.w) : 0.5;
  const P = pixels(model.smooth ? smoothed(img, Math.max(1, Math.min(4, Math.round(kw))), 3) : img), { w, h, n, lab, opaque } = P;
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
  for (const i of opaque) if (!(frame && frame[i])) labels[i] = model.map[nearestOf(lab, i, model.C, model.first)];
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
  let closed = 0;
  if (model.inside >= 0) {
    // the fabric: the background's colour that the picture's edge (or a frame, or see-through) reaches
    const open = new Uint8Array(n), st = [], B = model.bg;
    const reach = (i) => { if (!open[i] && (labels[i] === B || labels[i] < 0)) { open[i] = 1; st.push(i); } };
    for (let x = 0; x < w; x++) { reach(x); reach((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { reach(y * w); reach(y * w + w - 1); }
    for (let i = 0; i < n; i++) if (labels[i] < 0) reach(i);
    while (st.length) {
      const i = st.pop(), x = i % w;
      if (x > 0) reach(i - 1); if (x < w - 1) reach(i + 1); if (i >= w) reach(i - w); if (i + w < n) reach(i + w);
    }
    const m = { w, h, data: new Uint8Array(n) };
    let any = false;
    for (let i = 0; i < n; i++) if (labels[i] === B && !open[i]) { m.data[i] = 1; any = true; }
    if (any) {
      const { labels: cl, count } = label(m), dt = distanceTransform(m), keep = new Uint8Array(count + 1).fill(1);
      const size = new Int32Array(count + 1), wide = new Float64Array(count + 1), x0 = new Int32Array(count + 1).fill(w), x1 = new Int32Array(count + 1).fill(-1), y0 = new Int32Array(count + 1).fill(h), y1 = new Int32Array(count + 1).fill(-1);
      for (let i = 0; i < n; i++) {
        const c = cl[i]; if (!c) continue;
        const x = i % w, y = (i - x) / w; size[c]++; if (dt[i] > wide[c]) wide[c] = dt[i];
        if (x < x0[c]) x0[c] = x; if (x > x1[c]) x1[c] = x; if (y < y0[c]) y0[c] = y; if (y > y1[c]) y1[c] = y;
      }
      if (res) for (let c = 1; c <= count; c++)
        if (size[c] < 1.5 * res * res || (size[c] < 4 * res * res && x1[c] - x0[c] < 2.5 * res && y1[c] - y0[c] < 2.5 * res) || 2 * wide[c] < 0.6 * res) keep[c] = 0;
      for (let c = 1; c <= count; c++) if (keep[c]) closed += size[c];
      if (inside === "all" || (inside === "auto" && !model.spare)) for (let i = 0; i < n; i++) if (cl[i] && keep[cl[i]]) labels[i] = model.inside;
    }
  }
  const area = new Array(G).fill(0);
  for (let i = 0; i < n; i++) if (labels[i] >= 0) area[labels[i]]++;
  const colors = model.colors.map((c) => ({ ...c, area: area[c.id] }));
  return { w, h, labels, colors, merged: model.merged, frame: !!model.frame, empty: model.empty, lost: model.lost || 0, closed: closed / n };
}
// The lines in the picture too thin to keep: a pixel or two wide, unlike the fabric (ΔE over 20) yet read as fabric, 2 px
// clear of anything sewn (not the blend round a shape's edge). A logo's 1 px grey rule vanished without a word.
// (`labels`: colour ids.) Returns their pixels' components (`cl`, 0 = none), each one's length (px; 0 when it isn't
// thin by its box: a straight line) and its half-width (px: a curved line is thin too).
function faintLines(P, labels, colors, across = false) {
  const { w, h, n, lab } = P, bg = colors.find((c) => c.background);
  if (!bg) return { cl: new Int32Array(n), len: [] };
  const B = srgbToLab(...hexToRgb(bg.picture || bg.hex)), m = { w, h, data: new Uint8Array(n) }, ink = { w, h, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) ink.data[i] = labels[i] >= 0 && labels[i] !== bg.id ? 0 : 1;
  const away = distanceTransform(ink);
  // (`across`: only where the fabric lies on both sides, 3 px away: a line drawn on it, not the blend along the edge of a
  // frame or a panel the design sits on)
  const fab = (x, y) => x >= 0 && y >= 0 && x < w && y < h && Math.hypot(lab[(y * w + x) * 3] - B[0], lab[(y * w + x) * 3 + 1] - B[1], lab[(y * w + x) * 3 + 2] - B[2]) <= 12;
  const line = (i) => { const x = i % w, y = (i - x) / w; return [[3, 0], [0, 3], [2, 2], [2, -2]].some(([dx, dy]) => fab(x + dx, y + dy) && fab(x - dx, y - dy)); };
  for (let i = 0; i < n; i++)
    if (labels[i] === bg.id && away[i] > 2 && Math.hypot(lab[i * 3] - B[0], lab[i * 3 + 1] - B[1], lab[i * 3 + 2] - B[2]) > 20 && (!across || line(i))) m.data[i] = 1;
  const { labels: cl, count } = label(m), len = new Array(count + 1).fill(0), half = new Float64Array(count + 1);
  if (!count) return { cl, len, half };
  const inside = distanceTransform(m);
  const x0 = new Int32Array(count + 1).fill(w), x1 = new Int32Array(count + 1), y0 = new Int32Array(count + 1).fill(h), y1 = new Int32Array(count + 1), size = new Int32Array(count + 1);
  for (let i = 0; i < n; i++) {
    const c = cl[i]; if (!c) continue;
    const x = i % w, y = (i - x) / w;
    size[c]++; if (x < x0[c]) x0[c] = x; if (x > x1[c]) x1[c] = x; if (y < y0[c]) y0[c] = y; if (y > y1[c]) y1[c] = y;
    if (inside[i] > half[c]) half[c] = inside[i];
  }
  for (let c = 1; c <= count; c++) { const L = Math.hypot(x1[c] - x0[c] + 1, y1[c] - y0[c] + 1); if (size[c] <= 2.5 * L) len[c] = L; }
  return { cl, len, half };
}
// the longest of them (px along it)
const lostLines = (P, labels, colors) => faintLines(P, labels, colors).len.reduce((a, b) => Math.max(a, b), 0);
// The picture's ink on its learned copy, for keptParts: what its colours learned at the most threads label as ink, and
// the lines too fine to label (faintLines: etsy_7's pale pink doodles read as fabric, and the lost measure couldn't see
// them). ref: labelWith(img, those colours). Returns { w, h, data (1 = ink) }.
export function pictureInk(img, ref) {
  const P = pixels(img), { w, h, n } = P, data = new Uint8Array(n);
  const fabric = new Set(ref.colors.filter((c) => c.background).map((c) => c.id));
  for (let i = 0; i < n; i++) if (ref.labels[i] >= 0 && !fabric.has(ref.labels[i])) data[i] = 1;
  // (curled doodles too: under 3 px wide)
  const { cl, len, half } = faintLines(P, ref.labels, ref.colors, true);
  for (let i = 0; i < n; i++) if (cl[i] && (len[cl[i]] || half[cl[i]] <= 1.5)) data[i] = 1;
  return { w, h, data };
}
// (as the worker does it: a line drawing leaves the fabric's colour inside the design as fabric)
export function analyze(img, opts = {}) {
  return labelWith(img, learnColours(img, opts), undefined, { inside: insideOf(opts), res: opts.res || DEFAULTS.res });
}
// the page's choice for the closed-in colour, as labelWith takes it (a line drawing leaves it as fabric)
export function insideOf(opts) {
  return opts.style === "line" || opts.inside === "none" ? "none" : opts.inside === "all" ? "all" : "auto";
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
