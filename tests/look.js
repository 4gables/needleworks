// Looks like the picture (roadmap PX0): a thread render of a stitch file and a score of how much it looks like the
// source picture at the stitched size. Pure JavaScript (no canvas, no DOM), so Node and the browser give the same
// numbers to the bit. Used by tests/browser/picture_corpus.html; baseline tests/fixtures/look.json; the reading of
// each number is in docs/testing.md ("Looks like the picture").
//
// The measure is the test's own and is frozen on purpose: nothing here imports the picture code it judges (palette.js
// has a CIEDE2000 too, but a round that changes it must not move the ruler it is measured with).
//
// Sources (ideas and formulas only; no one's code):
// - CIEDE2000: Luo, Cui, Rigg (2001), with the implementation notes and test data of Sharma, Wu, Dalal (2005),
//   "The CIEDE2000 color-difference formula", Color Research & Application 30(1).
// - Spatial filtering before the colour difference (thread texture is not colour error): Zhang & Wandell (1997),
//   "A spatial extension of CIELAB for digital color image reproduction" (S-CIELAB). A Gaussian stands in for their
//   contrast-sensitivity filters, sized to wash out 0.4 mm thread rows and keep 2 mm shapes.
// - Structural similarity at a coarse scale: Wang, Bovik, Sheikh, Simoncelli (2004), "Image quality assessment: from
//   error visibility to structural similarity" (SSIM, its constants and the 1.5 px Gaussian window); Wang,
//   Simoncelli, Bovik (2003), "Multi-scale structural similarity" (the coarse scales carry most of what people judge).
// - Shape: the Jaccard index (intersection over union) of what is inked, as segmentation benchmarks score regions
//   (Everingham et al. 2010, PASCAL VOC).
// - Outlines: chamfer distance between edge maps (Barrow et al. 1977, "Parametric correspondence and chamfer
//   matching"; Borgefors 1988), and boundary recall within a tolerance (Martin, Fowlkes, Malik 2004, "Learning to
//   detect natural image boundaries", the Berkeley benchmark's matching with a distance tolerance).
// - Distance transform: Felzenszwalb & Huttenlocher (2012), "Distance transforms of sampled functions".
// - Thread shading: Kajiya & Kay (1989), "Rendering fur with three dimensional textures" (the highlight of a fibre
//   along its tangent), a lit cylinder across the thread.
import { COLOR_CHANGE, JUMP, STITCH, TRIM } from "../js/core/formats.js";

// ---------- colour ----------
const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
export const linOf = (hex) => [1, 3, 5].map((k) => LIN[parseInt(hex.slice(k, k + 2), 16)]);
const enc = (v) => { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)); };
const f3 = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
// CIELAB (D65) of linear sRGB
export function labLin(r, g, b) {
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const fy = f3(Y);
  return [116 * fy - 16, 500 * (f3(X) - fy), 200 * (fy - f3(Z))];
}
const D = Math.PI / 180, P7 = 25 ** 7;
// CIEDE2000 (kL = kC = kH = 1), as Sharma et al. 2005 set it out
export function de2000(L1, a1, b1, L2, a2, b2) {
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2, Cb7 = Cb ** 7, G = 0.5 * (1 - Math.sqrt(Cb7 / (Cb7 + P7)));
  const A1 = (1 + G) * a1, A2 = (1 + G) * a2, c1 = Math.hypot(A1, b1), c2 = Math.hypot(A2, b2);
  let h1 = A1 === 0 && b1 === 0 ? 0 : Math.atan2(b1, A1) / D, h2 = A2 === 0 && b2 === 0 ? 0 : Math.atan2(b2, A2) / D;
  if (h1 < 0) h1 += 360; if (h2 < 0) h2 += 360;
  const dL = L2 - L1, dC = c2 - c1;
  let dh = 0;
  if (c1 * c2 !== 0) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh / 2) * D), Lb = (L1 + L2) / 2, cb = (c1 + c2) / 2;
  let hb = h1 + h2;
  if (c1 * c2 !== 0) hb = Math.abs(h1 - h2) <= 180 ? hb / 2 : hb < 360 ? (hb + 360) / 2 : (hb - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * D) + 0.24 * Math.cos(2 * hb * D) + 0.32 * Math.cos((3 * hb + 6) * D) - 0.2 * Math.cos((4 * hb - 63) * D);
  const dTh = 30 * Math.exp(-(((hb - 275) / 25) ** 2)), cb7 = cb ** 7, RC = 2 * Math.sqrt(cb7 / (cb7 + P7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * cb, SH = 1 + 0.015 * cb * T, RT = -Math.sin(2 * dTh * D) * RC;
  const l = dL / SL, c = dC / SC, h = dH / SH;
  return Math.sqrt(l * l + c * c + h * h + RT * c * h);
}

// ---------- images: Float32Array, 3 linear channels per pixel ----------
export function toRGBA(img, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = enc(img[i * 3]); out[i * 4 + 1] = enc(img[i * 3 + 1]); out[i * 4 + 2] = enc(img[i * 3 + 2]); out[i * 4 + 3] = 255; }
  return out;
}
// the page's colour: the commonest colour (in 8-level bins) of the picture's outermost pixels; white when see-through
export function pageColour(rgba, W, H) {
  const bins = new Map(); let clear = 0, n = 0;
  const add = (x, y) => {
    const i = (y * W + x) * 4; n++;
    if (rgba[i + 3] < 128) { clear++; return; }
    const k = (rgba[i] >> 3) << 10 | (rgba[i + 1] >> 3) << 5 | rgba[i + 2] >> 3, b = bins.get(k) || [0, 0, 0, 0];
    b[0]++; b[1] += rgba[i]; b[2] += rgba[i + 1]; b[3] += rgba[i + 2]; bins.set(k, b);
  };
  for (let x = 0; x < W; x++) { add(x, 0); add(x, H - 1); }
  for (let y = 1; y < H - 1; y++) { add(0, y); add(W - 1, y); }
  if (clear > n / 2 || !bins.size) return "#ffffff";
  const [c, r, g, b] = [...bins.values()].sort((p, q) => q[0] - p[0])[0];
  return "#" + [r, g, b].map((v) => Math.round(v / c).toString(16).padStart(2, "0")).join("");
}
// the source picture (RGBA, W x H px) on the fabric, sampled onto the mm grid: `box` [x0, y0, x1, y1] mm, `ppm` px
// per mm, `map` [ox, oy, kx, ky]: picture px (continuous, pixel i spans [i, i+1]) = o + mm * k. Each output pixel is
// the mean of the picture pixels whose centres fall in it (a big picture), else read bilinearly (a small one); see-
// through pixels show the fabric.
export function sourceGrid(rgba, W, H, { box, ppm, map: [ox, oy, kx, ky], fabric }) {
  const w = Math.round((box[2] - box[0]) * ppm), h = Math.round((box[3] - box[1]) * ppm), img = new Float32Array(w * h * 3), n = new Float32Array(w * h), F = linOf(fabric);
  const px = (i) => { const a = rgba[i + 3] / 255; return [LIN[rgba[i]] * a + F[0] * (1 - a), LIN[rgba[i + 1]] * a + F[1] * (1 - a), LIN[rgba[i + 2]] * a + F[2] * (1 - a)]; };
  // (binning only when a picture pixel is smaller than an output pixel)
  if (Math.abs(kx) < ppm && Math.abs(ky) < ppm) {} else for (let y = 0; y < H; y++) {
    const oyMm = ((y + 0.5 - oy) / ky - box[1]) * ppm, Y = Math.floor(oyMm);
    if (Y < 0 || Y >= h) continue;
    for (let x = 0; x < W; x++) {
      const X = Math.floor(((x + 0.5 - ox) / kx - box[0]) * ppm);
      if (X < 0 || X >= w) continue;
      const c = px((y * W + x) * 4), j = Y * w + X;
      img[j * 3] += c[0]; img[j * 3 + 1] += c[1]; img[j * 3 + 2] += c[2]; n[j]++;
    }
  }
  for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) {
    const j = Y * w + X;
    if (n[j]) { for (let ch = 0; ch < 3; ch++) img[j * 3 + ch] /= n[j]; continue; }
    const sx = ox + (box[0] + (X + 0.5) / ppm) * kx - 0.5, sy = oy + (box[1] + (Y + 0.5) / ppm) * ky - 0.5;
    if (sx < -0.5 || sy < -0.5 || sx > W - 0.5 || sy > H - 0.5) { img.set(F, j * 3); continue; }
    const x0 = Math.max(0, Math.min(W - 1, Math.floor(sx))), y0 = Math.max(0, Math.min(H - 1, Math.floor(sy))), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
    const fx = Math.max(0, Math.min(1, sx - x0)), fy = Math.max(0, Math.min(1, sy - y0));
    const a = px((y0 * W + x0) * 4), b = px((y0 * W + x1) * 4), c = px((y1 * W + x0) * 4), d = px((y1 * W + x1) * 4);
    for (let ch = 0; ch < 3; ch++) img[j * 3 + ch] = (a[ch] * (1 - fx) + b[ch] * fx) * (1 - fy) + (c[ch] * (1 - fx) + d[ch] * fx) * fy;
  }
  return { img, w, h };
}

// ---------- the thread render ----------
// Each stitch a thread `width` mm across (40 wt lies about 0.4 mm), lit as a cylinder from the upper left: a diffuse
// term across the thread (dark at its sides, where the next row shows as a fine groove) and a highlight along it that
// depends on the stitch's direction (Kajiya-Kay), so satin and fill rows at different angles catch the light
// differently, as real thread does; a slight twist ridge. Later stitches lie over earlier ones. The shading is scaled
// so a thread's mean over its width and every direction is its own colour: the score's colour term sees the thread's
// colour, not the lighting.
const LT = (() => { const v = [-0.35, -0.5, 0.8], m = Math.hypot(...v); return v.map((x) => x / m); })();
const HV = (() => { const v = [LT[0], LT[1], LT[2] + 1], m = Math.hypot(...v); return v.map((x) => x / m); })();
const KA = 0.3, KD = 0.7, KS = 0.09, KP = 16;
const NORM = (() => {
  let s = 0, n = 0;
  for (let k = 0; k < 72; k++) {
    const t = (k * Math.PI) / 72, bx = -Math.sin(t), by = Math.cos(t);
    for (let q = 0; q < 101; q++) { const u = -1 + q / 50, nz = Math.sqrt(Math.max(0, 1 - u * u)); s += KA + KD * Math.max(0, u * bx * LT[0] + u * by * LT[1] + nz * LT[2]); n++; }
  }
  return s / n;
})();
export function renderThreads(design, { box, ppm = 10, fabric = "#ffffff", width = 0.4, turn = false, shift = [0, 0] }) {
  const w = Math.round((box[2] - box[0]) * ppm), h = Math.round((box[3] - box[1]) * ppm), img = new Float32Array(w * h * 3), cover = new Float32Array(w * h), F = linOf(fabric);
  for (let i = 0; i < w * h; i++) img.set(F, i * 3);
  const r = (width / 2) * ppm, cols = design.threads.map((t) => linOf(t.color || "#000000"));
  const P = ([x, y]) => { x = (x + shift[0]) / 10; y = (y + shift[1]) / 10; if (turn) [x, y] = [y, -x]; return [(x - box[0]) * ppm, (y - box[1]) * ppm]; };
  let block = 0, prev = null;
  for (const s of design.stitches) {
    const cmd = s[2];
    if (cmd === COLOR_CHANGE) { block++; prev = null; continue; }
    if (cmd === JUMP) { prev = P(s); continue; }
    if (cmd === TRIM) { prev = null; continue; }
    if (cmd !== STITCH) continue;
    const p = P(s);
    if (prev) seg(prev, p, cols[Math.min(block, cols.length - 1)] || [0, 0, 0]);
    prev = p;
  }
  function seg([ax, ay], [bx, by], col) {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    if (L < 0.05) return;   // (a needle hit on the same spot lays no thread)
    const tx = dx / L, ty = dy / L, nx = -ty, ny = tx;
    const spec = KS * Math.max(0, 1 - (tx * HV[0] + ty * HV[1]) ** 2) ** (KP / 2);
    const X0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), X1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + r + 1));
    const Y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), Y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + r + 1));
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const qx = x + 0.5 - ax, qy = y + 0.5 - ay, along = qx * tx + qy * ty, t = Math.max(0, Math.min(L, along));
      const ex = qx - tx * t, ey = qy - ty * t, d = Math.hypot(ex, ey), cov = Math.min(1, r + 0.5 - d);
      if (cov <= 0) continue;
      const across = qx * nx + qy * ny, u = Math.max(-1, Math.min(1, (along < 0 || along > L ? Math.sign(across || 1) * d : across) / r)), nz = Math.sqrt(1 - u * u);
      const diff = Math.max(0, u * nx * LT[0] + u * ny * LT[1] + nz * LT[2]);
      const ridge = 1 - 0.06 * Math.cos(2 * Math.PI * ((t / ppm) / 0.5 + u * 0.6)), k = ((KA + KD * diff) / NORM) * ridge, hi = spec * nz;
      const j = y * w + x;
      for (let ch = 0; ch < 3; ch++) img[j * 3 + ch] = img[j * 3 + ch] * (1 - cov) + Math.min(1, col[ch] * k + hi) * cov;
      cover[j] = 1 - (1 - cover[j]) * (1 - cov);
    }
  }
  return { img, w, h, cover };
}

// ---------- image helpers ----------
function down2(img, w, h, c = 3) {
  const W = Math.floor(w / 2), H = Math.floor(h / 2), out = new Float32Array(W * H * c);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let ch = 0; ch < c; ch++) {
    const a = ((2 * y) * w + 2 * x) * c + ch, b = a + w * c;
    out[(y * W + x) * c + ch] = (img[a] + img[a + c] + img[b] + img[b + c]) / 4;
  }
  return { img: out, w: W, h: H };
}
function blur(img, w, h, c, sigma) {
  const R = Math.ceil(3 * sigma), k = Array.from({ length: 2 * R + 1 }, (_, i) => Math.exp(-((i - R) ** 2) / (2 * sigma * sigma))), sum = k.reduce((a, b) => a + b, 0);
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(img.length), out = new Float32Array(img.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let ch = 0; ch < c; ch++) {
    let s = 0; for (let i = -R; i <= R; i++) s += k[i + R] * img[(y * w + Math.max(0, Math.min(w - 1, x + i))) * c + ch];
    tmp[(y * w + x) * c + ch] = s;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let ch = 0; ch < c; ch++) {
    let s = 0; for (let i = -R; i <= R; i++) s += k[i + R] * tmp[(Math.max(0, Math.min(h - 1, y + i)) * w + x) * c + ch];
    out[(y * w + x) * c + ch] = s;
  }
  return out;
}
function toLab(img, n) {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const [L, a, b] = labLin(img[i * 3], img[i * 3 + 1], img[i * 3 + 2]); out[i * 3] = L; out[i * 3 + 1] = a; out[i * 3 + 2] = b; }
  return out;
}
// squared Euclidean distance transform (Felzenszwalb-Huttenlocher): distance in px from each pixel to the nearest set one
export function edt(mask, w, h) {
  const INF = 1e20, f = new Float64Array(Math.max(w, h)), d = new Float64Array(Math.max(w, h)), v = new Int32Array(Math.max(w, h)), z = new Float64Array(Math.max(w, h) + 1);
  const g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = mask[i] ? 0 : INF;
  const pass = (n) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
  };
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; pass(h); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[y * w + x]; pass(w); for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(d[x]); }
  return g;
}
// edges: the Lab gradient (Sobel, ΔE per mm) thinned to its ridge (non-maximum suppression) and over `T`
function edges(lab, w, h, ppm, T) {
  const mag = new Float32Array(w * h), dir = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let gx2 = 0, gy2 = 0, gxy = 0;
    for (let ch = 0; ch < 3; ch++) {
      const v = (X, Y) => lab[((y + Y) * w + x + X) * 3 + ch];
      const gx = v(1, -1) + 2 * v(1, 0) + v(1, 1) - v(-1, -1) - 2 * v(-1, 0) - v(-1, 1), gy = v(-1, 1) + 2 * v(0, 1) + v(1, 1) - v(-1, -1) - 2 * v(0, -1) - v(1, -1);
      gx2 += gx * gx; gy2 += gy * gy; gxy += gx * gy;
    }
    // (the direction of the colour gradient: the structure tensor's main axis, Di Zenzo 1986)
    const m = Math.sqrt(gx2 + gy2) / 8 * ppm, a = (0.5 * Math.atan2(2 * gxy, gx2 - gy2) * 180) / Math.PI;
    mag[y * w + x] = m; dir[y * w + x] = ((Math.round(((a + 180) % 180) / 45)) % 4);
  }
  const N = [[1, 0], [1, 1], [0, 1], [-1, 1]];
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const i = y * w + x, m = mag[i];
    if (m < T) continue;
    const [dx, dy] = N[dir[i]];
    if (m >= mag[i + dy * w + dx] && m > mag[i - dy * w - dx]) out[i] = 1;
  }
  return out;
}

// ---------- the score ----------
export const LOOK = {
  blur: 0.35,       // mm, Gaussian sigma before anything is compared: 0.4 mm thread rows are gone, a 2 mm shape keeps 55 % contrast
  grid: 5,          // px per mm the score works at (0.2 mm pixels)
  ink: 8,           // ΔE00 from the fabric: inked
  edge: 10,         // ΔE per mm: an edge (a step of about 9 ΔE or more after the blur)
  near: 0.5,        // mm: an edge is kept when the stitches have one this close (thread width plus pull)
  cap: 2,           // mm: the most one edge pixel adds to the outline distance (a missing part counts, not by its distance)
  colourScale: 25,  // ΔE00 that scores colour 0 (2-3 is just noticeable, 5 a thread one shade off, 20+ another colour)
  weights: { colour: 0.3, shape: 0.25, outline: 0.15, detail: 0.15, structure: 0.15 },
};
// A (the source on the mm grid) against B (the render), both at `ppm`, both linear RGB. Returns the parts (0-1, 1 is
// alike), the raw numbers behind them, and `look` 0-100.
export function lookScore(A, B, w, h, ppm, fabric) {
  let a = A, b = B, W = w, H = h, s = ppm;
  while (s > LOOK.grid * 1.5) { const p = down2(a, W, H), q = down2(b, W, H); a = p.img; b = q.img; W = p.w; H = p.h; s /= 2; }
  const n = W * H, sig = LOOK.blur * s;
  const la = toLab(blur(a, W, H, 3, sig), n), lb = toLab(blur(b, W, H, 3, sig), n), Fl = labLin(...linOf(fabric));
  const inkA = new Uint8Array(n), inkB = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    inkA[i] = de2000(la[i * 3], la[i * 3 + 1], la[i * 3 + 2], ...Fl) > LOOK.ink ? 1 : 0;
    inkB[i] = de2000(lb[i * 3], lb[i * 3 + 1], lb[i * 3 + 2], ...Fl) > LOOK.ink ? 1 : 0;
  }
  // colour: ΔE00 where both are inked (what is sewn, in the right colour?); shape: IoU of the inked areas
  let both = 0, any = 0, dE = 0;
  for (let i = 0; i < n; i++) {
    if (inkA[i] || inkB[i]) any++;
    if (inkA[i] && inkB[i]) { both++; dE += de2000(la[i * 3], la[i * 3 + 1], la[i * 3 + 2], lb[i * 3], lb[i * 3 + 1], lb[i * 3 + 2]); }
  }
  dE = both ? dE / both : LOOK.colourScale;
  const colour = Math.max(0, 1 - dE / LOOK.colourScale), shape = any ? both / any : 1;
  // outlines: edges of each, the mean distance both ways (capped), and the share of the picture's edges the stitches keep
  const eA = edges(la, W, H, s, LOOK.edge), eB = edges(lb, W, H, s, LOOK.edge), dA = edt(eA, W, H), dB = edt(eB, W, H), cap = LOOK.cap * s;
  let nA = 0, nB = 0, sAB = 0, sBA = 0, kept = 0;
  for (let i = 0; i < n; i++) {
    if (eA[i]) { nA++; sAB += Math.min(cap, dB[i]); if (dB[i] <= LOOK.near * s) kept++; }
    if (eB[i]) { nB++; sBA += Math.min(cap, dA[i]); }
  }
  const chamfer = (nA ? sAB / nA : nB ? cap : 0) / 2 / s + (nB ? sBA / nB : nA ? cap : 0) / 2 / s;
  const outline = Math.max(0, 1 - chamfer / LOOK.cap), detail = nA ? kept / nA : 1;
  // structure: SSIM of L* at 0.4 mm pixels, Gaussian window 1.5 px, over the inked area of either and 1 mm round it
  const La = new Float32Array(n), Lb = new Float32Array(n);
  for (let i = 0; i < n; i++) { La[i] = la[i * 3]; Lb[i] = lb[i * 3]; }
  const ca = down2(La, W, H, 1), cb = down2(Lb, W, H, 1), m2 = n2mask(inkA, inkB, W, H, s), w2 = ca.w, h2 = ca.h, N2 = w2 * h2;
  const x = ca.img, y = cb.img, xx = new Float32Array(N2), yy = new Float32Array(N2), xy = new Float32Array(N2);
  for (let i = 0; i < N2; i++) { xx[i] = x[i] * x[i]; yy[i] = y[i] * y[i]; xy[i] = x[i] * y[i]; }
  const g = (v) => blur(v, w2, h2, 1, 1.5), mx = g(x), my = g(y), sxx = g(xx), syy = g(yy), sxy = g(xy), C1 = (0.01 * 100) ** 2, C2 = (0.03 * 100) ** 2;
  let ss = 0, sn = 0;
  for (let i = 0; i < N2; i++) {
    if (!m2[i]) continue;
    const vx = sxx[i] - mx[i] ** 2, vy = syy[i] - my[i] ** 2, cxy = sxy[i] - mx[i] * my[i];
    ss += ((2 * mx[i] * my[i] + C1) * (2 * cxy + C2)) / ((mx[i] ** 2 + my[i] ** 2 + C1) * (vx + vy + C2)); sn++;
  }
  const structure = sn ? Math.max(0, ss / sn) : 1, Wt = LOOK.weights;
  const look = 100 * (Wt.colour * colour + Wt.shape * shape + Wt.outline * outline + Wt.detail * detail + Wt.structure * structure);
  const r2 = (v) => Math.round(v * 1000) / 1000;
  return { look: Math.round(look * 10) / 10, colour: r2(colour), shape: r2(shape), outline: r2(outline), detail: r2(detail), structure: r2(structure), dE: Math.round(dE * 10) / 10, chamfer: Math.round(chamfer * 100) / 100, edges: nA };
}
// the inked area of either, grown by 1 mm, at half the grid
function n2mask(inkA, inkB, W, H, s) {
  const u = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) u[i] = inkA[i] | inkB[i];
  const d = edt(u, W, H), w2 = Math.floor(W / 2), h2 = Math.floor(H / 2), out = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) out[y * w2 + x] = d[(2 * y) * W + 2 * x] <= s ? 1 : 0;
  return out;
}

// ---------- the score's own check: hand-made variants of a picture must rank as a person would ----------
// `img` (linear RGB on the mm grid, w x h at ppm) made: stitched-looking (thread rows 0.4 mm apart with dark grooves
// and sheen, at 45°: should score near the source), blurred (1.2 mm), shifted 1 mm, recoloured (each inked pixel's
// channels rotated), thinned (everything within 0.8 mm of the fabric made fabric, then grown back: lines and small
// parts gone), posterised to black and white. Returns { name: score }.
export function variants(img, w, h, ppm, fabric) {
  const F = linOf(fabric), n = w * h, out = {};
  const ink = new Uint8Array(n);
  const lab = toLab(img, n), Fl = labLin(...F);
  for (let i = 0; i < n; i++) ink[i] = de2000(lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2], ...Fl) > LOOK.ink ? 1 : 0;
  const make = (f) => { const o = new Float32Array(img); for (let i = 0; i < n; i++) f(o, i, i % w, Math.floor(i / w)); return o; };
  out.stitched = make((o, i, x, y) => {
    if (!ink[i]) return;
    const v = ((x + y) / ppm / Math.SQRT2) / 0.4, ph = v - Math.floor(v), k = ph < 0.15 ? 0.55 : 1.08;
    for (let ch = 0; ch < 3; ch++) o[i * 3 + ch] = Math.min(1, img[i * 3 + ch] * k);
  });
  out.blurred = blur(img, w, h, 3, 1.2 * ppm);
  const sh = Math.round(ppm);
  out.shifted = make((o, i, x, y) => { const X = x - sh, Y = y - sh, j = X >= 0 && Y >= 0 ? Y * w + X : -1; for (let ch = 0; ch < 3; ch++) o[i * 3 + ch] = j >= 0 ? img[j * 3 + ch] : F[ch]; });
  out.recoloured = make((o, i) => { if (!ink[i]) return; const [r, g, b] = [img[i * 3], img[i * 3 + 1], img[i * 3 + 2]]; o[i * 3] = b; o[i * 3 + 1] = r; o[i * 3 + 2] = g; });
  const inside = edt(ink.map((v) => 1 - v), w, h), core = new Uint8Array(n);
  for (let i = 0; i < n; i++) core[i] = inside[i] > 0.8 * ppm ? 1 : 0;
  const grown = edt(core, w, h);
  out.thinned = make((o, i) => { if (ink[i] && grown[i] > 0.8 * ppm) o.set(F, i * 3); });
  out.posterised = make((o, i) => { const v = lab[i * 3] < 50 ? 0.02 : 0.9; if (ink[i]) { o[i * 3] = o[i * 3 + 1] = o[i * 3 + 2] = v; } });
  const res = { source: lookScore(img, img, w, h, ppm, fabric) };
  for (const [k, v] of Object.entries(out)) res[k] = lookScore(img, v, w, h, ppm, fabric);
  return res;
}
// what the variants must show (each a reason the measure is trusted); returns the broken ones
export function variantRules(v) {
  const bad = [], L = (k) => v[k].look;
  if (L("stitched") < 90) bad.push(`thread texture counted as error: stitched ${L("stitched")}`);
  for (const k of ["blurred", "shifted", "recoloured", "thinned", "posterised"]) if (L("stitched") <= L(k)) bad.push(`${k} ${L(k)} scores at least as well as stitched ${L("stitched")}`);
  if (!(v.recoloured.colour < v.stitched.colour - 0.3)) bad.push(`recoloured colour ${v.recoloured.colour} not well under stitched ${v.stitched.colour}`);
  if (!(v.blurred.detail < v.stitched.detail - 0.2)) bad.push(`blurred detail ${v.blurred.detail} not under stitched ${v.stitched.detail}`);
  if (!(v.shifted.outline < v.stitched.outline)) bad.push(`shifted outline ${v.shifted.outline} not under stitched ${v.stitched.outline}`);
  if (!(v.thinned.shape < v.stitched.shape)) bad.push(`thinned shape ${v.thinned.shape} not under stitched ${v.stitched.shape}`);
  return bad;
}
