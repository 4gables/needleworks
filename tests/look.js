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
// colour, not the lighting. The highlight is the thread's own colour brightened, not white added: added white (0.06
// of full light on average) lifted every dark thread, Black drew as grey (sRGB 66), Prussian Blue as lavender and
// Dark Brown as a warm grey, and a picture's black palm tree "sewed" lavender in the look PNGs (2026-11, PX7).
const LT = (() => { const v = [-0.35, -0.5, 0.8], m = Math.hypot(...v); return v.map((x) => x / m); })();
const HV = (() => { const v = [LT[0], LT[1], LT[2] + 1], m = Math.hypot(...v); return v.map((x) => x / m); })();
const KA = 0.3, KD = 0.7, KS = 0.09, KP = 16;
const NORM = (() => {
  let s = 0, n = 0;
  for (let k = 0; k < 72; k++) {
    const t = (k * Math.PI) / 72, tx = Math.cos(t), ty = Math.sin(t), bx = -ty, by = tx, spec = KS * Math.max(0, 1 - (tx * HV[0] + ty * HV[1]) ** 2) ** (KP / 2);
    for (let q = 0; q < 101; q++) { const u = -1 + q / 50, nz = Math.sqrt(Math.max(0, 1 - u * u)); s += KA + KD * Math.max(0, u * bx * LT[0] + u * by * LT[1] + nz * LT[2]) + spec * nz; n++; }
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
      const ridge = 1 - 0.06 * Math.cos(2 * Math.PI * ((t / ppm) / 0.5 + u * 0.6)), k = ((KA + KD * diff + spec * nz) / NORM) * ridge;
      const j = y * w + x;
      for (let ch = 0; ch < 3; ch++) img[j * 3 + ch] = img[j * 3 + ch] * (1 - cov) + Math.min(1, col[ch] * k) * cov;
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
  out.mag = mag;   // (the gradient, for weighting each edge by its contrast)
  return out;
}
// the largest value within `r` px (a square window), for each pixel
function maxFilter(v, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0; for (let X = Math.max(0, x - r); X <= Math.min(w - 1, x + r); X++) m = Math.max(m, v[y * w + X]);
    tmp[y * w + x] = m;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0; for (let Y = Math.max(0, y - r); Y <= Math.min(h - 1, y + r); Y++) m = Math.max(m, tmp[Y * w + x]);
    out[y * w + x] = m;
  }
  return out;
}
// The render as a person sees it from a step back (the thread, not the gaps between its rows): the thread's own
// colour where the stitches cover the cloth at least `ref`, else the thread mixed with the fabric by how much they
// cover. `b` is composited over the fabric, so the thread's own premultiplied colour is b - F (1 - cover); blurred
// with the coverage (normalised convolution, Knutsson & Westin 1993) it is the thread's colour without the fabric.
// Filled: ref 0.9, so the anti-aliased gaps between 0.4 mm rows (a quarter of a pixel row's fabric showing through
// a black fill drew it L* 13 and scored a perfect Black colour 0.39) are not counted as fabric. Cross-stitch: ref
// is the cover of a cell with its cross (two 0.4 mm diagonals cover ~43 % of a 2.5 mm cell), so a field of crosses
// reads as its thread, as it does to a person, and not as thread 40 % + fabric 60 %.
function perceived(b, cov, w, h, F, sig, ref) {
  const n = w * h, P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) P[i * 3 + ch] = b[i * 3 + ch] - F[ch] * (1 - cov[i]);
  const Pc = blur(P, w, h, 3, sig), dens = blur(cov, w, h, 1, sig), out = new Float32Array(n * 3);
  if (ref === "measure") {   // (the cover of a field of the design's own crosses: the 75th centile where it sews)
    const v = [...dens].filter((d) => d > 0.05).sort((p, q) => p - q);
    ref = Math.max(0.25, Math.min(0.95, v.length ? v[Math.floor(v.length * 0.75)] : 0.5));
  }
  for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) {
    const d = dens[i], v = d >= ref ? Pc[i * 3 + ch] / d : F[ch] + (Pc[i * 3 + ch] - F[ch] * d) / ref;
    out[i * 3 + ch] = Math.max(0, Math.min(1, v));
  }
  return { img: out, dens, ref, Pc };
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
  fillCover: 0.9,   // cover that reads as solid thread (Filled): see `perceived`
  flat: 4,          // L*² variance under which the picture is flat in an SSIM window: only its lightness is compared there
  crossBlur: 0.5,   // cells: Cross-stitch is judged blurred by this share of a cell (the lattice keeps 0.7 % of its contrast; at 0.4 its 4 %, over the cover normalising, still drew edges inside every field of crosses: outline 0.31 on a right chart)
  weights: { colour: 0.3, shape: 0.25, outline: 0.15, detail: 0.15, structure: 0.15 },
};
// A line drawing is judged against the picture's own lines (its edges, and the centre lines of its ink bands), not
// against the filled picture: colour and shape of the area (55 % of the filled score) only measured the style, so a
// near-perfect trace of a crayon drawing scored 28 and a landscape missing its ridge 36 (cycle 5 audit).
export const LINE = {
  band: 4,          // mm: an ink band up to this wide is one line (traced along its centre); wider, its edges are lines
  reach: 2.4,       // mm: how far from an edge its band's centre is looked for
  tol: 0.75,        // mm: a stitch line this close to a picture line traces it (thread width, pull, a hand's wobble)
  slack: 0.4,       // mm: past a band's width: its edges are traced by a line anywhere across it (where across is the weight's say)
  speck: 1,         // mm (mm² for a hole in the ink): texture, not a line
  gap: [0.5, 2],    // mm: a second line this far from a stitch line, across one band of the picture, doubles it
  weights: { recall: 0.4, precision: 0.25, doubling: 0.15, colour: 0.1, weight: 0.1 },
};
// A (the source on the mm grid) against B (the render), both at `ppm`, both linear RGB. o: { style: "fill" | "line" |
// "cross", cover: the render's thread cover (from renderThreads; without it B is taken as it is), cell: the cross
// grid's cell, mm }. Returns the parts (0-1, 1 is alike), the raw numbers behind them, and `look` 0-100.
export function lookScore(A, B, w, h, ppm, fabric, o = {}) {
  const style = o.style || "fill";
  let a = A, b = B, cv = o.cover, W = w, H = h, s = ppm;
  while (s > LOOK.grid * 1.5) { const p = down2(a, W, H), q = down2(b, W, H); a = p.img; b = q.img; if (cv) cv = down2(cv, W, H, 1).img; W = p.w; H = p.h; s /= 2; }
  if (style === "line") return lineScore(a, b, cv, W, H, s, fabric, o.maps);
  // Cross-stitch at the cell's scale: blurred by 0.4 of a cell (the crosses' lattice is gone, a shape of a few cells
  // stays), edges taken at the same contrast for the wider blur, kept within half a cell
  const cross = style === "cross", cell = o.cell || 2.5, n = W * H, F = linOf(fabric), Fl = labLin(...F);
  const sig = (cross ? LOOK.crossBlur * cell : LOOK.blur) * s, near = cross ? cell / 2 : LOOK.near, edgeT = (LOOK.edge * LOOK.blur * s) / sig;
  const pb = cv && perceived(b, cv, W, H, F, sig, cross ? "measure" : LOOK.fillCover);
  const la = toLab(blur(a, W, H, 3, sig), n), lb = toLab(pb ? pb.img : blur(b, W, H, 3, sig), n);
  // (Cross-stitch colour: the picture's ink and the thread, each without the fabric round it: at a cell's blur every
  // pixel of a 2-cell stroke mixes in fabric, by different amounts in picture and crosses)
  let colA = la, colB = lb;
  if (cross && pb) {
    const l0 = toLab(a, n), m = new Float32Array(n), am = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) if (de2000(l0[i * 3], l0[i * 3 + 1], l0[i * 3 + 2], ...Fl) > LOOK.ink) { m[i] = 1; for (let ch = 0; ch < 3; ch++) am[i * 3 + ch] = a[i * 3 + ch]; }
    const bm = blur(m, W, H, 1, sig), ba = blur(am, W, H, 3, sig), na = new Float32Array(n * 3), nb = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) {
      na[i * 3 + ch] = bm[i] > 1e-3 ? ba[i * 3 + ch] / bm[i] : F[ch];
      nb[i * 3 + ch] = pb.dens[i] > 1e-3 ? Math.min(1, pb.Pc[i * 3 + ch] / pb.dens[i]) : F[ch];
    }
    colA = toLab(na, n); colB = toLab(nb, n);
  }
  const inkA = new Uint8Array(n), inkB = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    inkA[i] = de2000(la[i * 3], la[i * 3 + 1], la[i * 3 + 2], ...Fl) > LOOK.ink ? 1 : 0;
    inkB[i] = de2000(lb[i * 3], lb[i * 3 + 1], lb[i * 3 + 2], ...Fl) > LOOK.ink ? 1 : 0;
  }
  // colour: ΔE00 where both are inked (what is sewn, in the right colour?); shape: IoU of the inked areas
  let both = 0, any = 0, dE = 0;
  for (let i = 0; i < n; i++) {
    if (inkA[i] || inkB[i]) any++;
    if (inkA[i] && inkB[i]) { both++; dE += de2000(colA[i * 3], colA[i * 3 + 1], colA[i * 3 + 2], colB[i * 3], colB[i * 3 + 1], colB[i * 3 + 2]); }
  }
  dE = both ? dE / both : LOOK.colourScale;
  const colour = Math.max(0, 1 - dE / LOOK.colourScale), shape = any ? both / any : 1;
  // outlines: edges of each, the mean distance both ways (capped), and the share of the picture's edges the stitches keep
  const eA = edges(la, W, H, s, edgeT), eB = edges(lb, W, H, s, edgeT), dA = edt(eA, W, H), dB = edt(eB, W, H), cap = LOOK.cap * s;
  let nA = 0, nB = 0, sAB = 0, sBA = 0, kept = 0;
  for (let i = 0; i < n; i++) {
    if (eA[i]) { nA++; sAB += Math.min(cap, dB[i]); if (dB[i] <= near * s) kept++; }
    if (eB[i]) { nB++; sBA += Math.min(cap, dA[i]); }
  }
  const chamfer = (nA ? sAB / nA : nB ? cap : 0) / 2 / s + (nB ? sBA / nB : nA ? cap : 0) / 2 / s;
  const outline = Math.max(0, 1 - chamfer / LOOK.cap), detail = nA ? kept / nA : 1;
  // structure: SSIM of L* at 0.4 mm pixels, Gaussian window 1.5 px, over the inked area of either and 1 mm round it.
  // Where the picture is flat (variance under LOOK.flat) only the lightness term counts: SSIM's structure term there
  // measured the thread's own sheen against nothing (a flat black cat scored 0.12).
  const La = new Float32Array(n), Lb = new Float32Array(n);
  for (let i = 0; i < n; i++) { La[i] = la[i * 3]; Lb[i] = lb[i * 3]; }
  const ca = down2(La, W, H, 1), cb = down2(Lb, W, H, 1), m2 = n2mask(inkA, inkB, W, H, s), w2 = ca.w, h2 = ca.h, N2 = w2 * h2;
  const x = ca.img, y = cb.img, xx = new Float32Array(N2), yy = new Float32Array(N2), xy = new Float32Array(N2);
  for (let i = 0; i < N2; i++) { xx[i] = x[i] * x[i]; yy[i] = y[i] * y[i]; xy[i] = x[i] * y[i]; }
  const g = (v) => blur(v, w2, h2, 1, 1.5), mx = g(x), my = g(y), sxx = g(xx), syy = g(yy), sxy = g(xy), C1 = (0.01 * 100) ** 2, C2 = (0.03 * 100) ** 2;
  let ss = 0, sn = 0;
  for (let i = 0; i < N2; i++) {
    if (!m2[i]) continue;
    const vx = sxx[i] - mx[i] ** 2, vy = syy[i] - my[i] ** 2, cxy = sxy[i] - mx[i] * my[i], lum = (2 * mx[i] * my[i] + C1) / (mx[i] ** 2 + my[i] ** 2 + C1);
    ss += vx < LOOK.flat ? lum : (lum * (2 * cxy + C2)) / (vx + vy + C2); sn++;
  }
  const structure = sn ? Math.max(0, ss / sn) : 1, Wt = LOOK.weights;
  const look = 100 * (Wt.colour * colour + Wt.shape * shape + Wt.outline * outline + Wt.detail * detail + Wt.structure * structure);
  return { look: Math.round(look * 10) / 10, colour: r3(colour), shape: r3(shape), outline: r3(outline), detail: r3(detail), structure: r3(structure), dE: Math.round(dE * 10) / 10, chamfer: Math.round(chamfer * 100) / 100, edges: nA };
}
const r3 = (v) => Math.round(v * 1000) / 1000;
// the inked area of either, grown by 1 mm, at half the grid
function n2mask(inkA, inkB, W, H, s) {
  const u = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) u[i] = inkA[i] | inkB[i];
  const d = edt(u, W, H), w2 = Math.floor(W / 2), h2 = Math.floor(H / 2), out = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) out[y * w2 + x] = d[(2 * y) * W + 2 * x] <= s ? 1 : 0;
  return out;
}

// ---------- line drawings ----------
// What a line drawing should trace, from the picture alone (the picture's own pixels, not its learned colours):
// its edges (the Lab gradient, as for the outline part) and, for each band up to LINE.band wide (an ink stroke on the
// fabric, or a dark outline across a coloured shape: whatever lies between two edges or an edge and the fabric), the
// band's centre line in place of its two edges. Shared by the score and its self-check.
// - dIn: px from each ink pixel to the nearest edge or fabric (a band's centre holds its half width);
// - ridge: a band's centre: as far from its sides as both neighbours across some direction, at most LINE.band / 2, and the widest point
//   within twice that (the spurs of a wide shape's medial axis, near its corners, widen inward and are not bands);
// - toRidge, ridgeW: px to the nearest ridge, and the widest ridge within LINE.reach: a pixel with a ridge no farther
//   than that ridge's half width (+1) lies on a band.
export function lineRef(a, W, H, s, fabric) {
  const n = W * H, Fl = labLin(...linOf(fabric)), ab = blur(a, W, H, 3, LOOK.blur * s), la = toLab(ab, n);
  const dF = new Float32Array(n), ink = new Uint8Array(n), stop = new Uint8Array(n);
  // (ink from the picture before the blur: the blur's halo past an edge is not a band of its own)
  const l0 = toLab(a, n);
  for (let i = 0; i < n; i++) { dF[i] = de2000(la[i * 3], la[i * 3 + 1], la[i * 3 + 2], ...Fl); ink[i] = de2000(l0[i * 3], l0[i * 3 + 1], l0[i * 3 + 2], ...Fl) > LOOK.ink ? 1 : 0; }
  // (texture is not a line: a crayon's paper speckle made rings of edge inside every stroke and broke its band in
  // pieces; holes in the ink under LINE.speck mm² are ink, edge pieces shorter than LINE.speck mm are dropped)
  const sp = LINE.speck * s;
  dropSmall(ink, W, H, 0, sp * sp, true);
  const E = edges(la, W, H, s, LOOK.edge), mag = E.mag;
  dropSmall(E, W, H, 1, sp, false); E.mag = mag;
  for (let i = 0; i < n; i++) stop[i] = E[i] || !ink[i] ? 1 : 0;
  const dIn = edt(stop, W, H), thin = (LINE.band / 2) * s, ridge = new Uint8Array(n), rv = new Float32Array(n);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, v = dIn[i];
    if (!ink[i] || v > thin || v < 1.5) continue;   // (a 1 px sliver between an edge and the ink's last pixel is no band)
    // (a peak across some direction: a slanted band's centre falls between pixels, and an 8-neighbour peak left it in dashes)
    let top = false;
    for (const d of [1, W, W + 1, W - 1]) { const p = dIn[i - d], q = dIn[i + d]; if (v >= p && v >= q && (v > p || v > q)) { top = true; break; } }
    const r = Math.ceil(2 * v);
    for (let Y = Math.max(0, y - r); Y <= Math.min(H - 1, y + r) && top; Y++) for (let X = Math.max(0, x - r); X <= Math.min(W - 1, x + r); X++) {
      if ((X - x) ** 2 + (Y - y) ** 2 <= r * r && dIn[Y * W + X] > v + 1) { top = false; break; }
    }
    if (top) { ridge[i] = 1; rv[i] = v; }
  }
  const toRidge = edt(ridge, W, H), ridgeW = maxFilter(rv, W, H, Math.round(LINE.reach * s)), band = new Uint8Array(n);
  for (let i = 0; i < n; i++) band[i] = ink[i] && ridgeW[i] > 0 && toRidge[i] <= ridgeW[i] + 1 ? 1 : 0;
  return { ab, la, dF, ink, E, dIn, thin, ridge, toRidge, ridgeW, band };
}
// the 8-connected pieces of `v` (pixels equal to `val`) with fewer than `min` pixels, flipped (holes only: pieces
// not touching the border)
function dropSmall(v, W, H, val, min, holes) {
  const seen = new Uint8Array(W * H), stack = [];
  for (let i0 = 0; i0 < W * H; i0++) {
    if (seen[i0] || v[i0] !== val) continue;
    const piece = [i0]; seen[i0] = 1; stack.push(i0); let edge = false;
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, j = Y * W + X;
        if (X < 0 || Y < 0 || X >= W || Y >= H || seen[j] || v[j] !== val) continue;
        seen[j] = 1; stack.push(j); piece.push(j);
      }
    }
    if (piece.length < min && !(holes && edge)) for (const i of piece) v[i] = 1 - val;
  }
}
// the picture's pixel farthest from the fabric within `r` px of (x, y) (the line's own colour beside an edge); -1 if
// none is inked
function inkNear(R, W, H, x, y, r) {
  let best = -1, bv = LOOK.ink;
  for (let Y = Math.max(0, y - r); Y <= Math.min(H - 1, y + r); Y++) for (let X = Math.max(0, x - r); X <= Math.min(W - 1, x + r); X++) {
    const j = Y * W + X; if (R.dF[j] > bv) { bv = R.dF[j]; best = j; }
  }
  return best;
}
// Parts (each 0-1):
// - recall: the share of the picture's lines (edges, weighted by contrast up to twice the edge threshold: a faint
//   shadow counts less, any clear step in full, so a sky against a teal ridge, ΔE ~17, counts as much as black on white:
//   at 4x the landscape missing its ridge kept recall 0.88) with a stitch line within LINE.tol; an edge of a band up to
//   LINE.band wide counts as traced by a line anywhere across the band (its width + LINE.slack): a crayon heart
//   traced along its outer edge is the heart; how much of the band is sewn is the weight's part.
// - precision: the share of the stitch lines within LINE.tol of a picture line, or lying on a band (a satin column
//   that covers its band is the band). False lines: die-cut borders, spurs, a gradient's band line.
// - doubling: 1 - the share of the stitch lines with a parallel one LINE.gap away across ink with no picture edge
//   between (one band of the picture traced twice, as its two outlines).
// - colour: ΔE00 of each stitch line's thread against the picture's line beside it (the inked pixel farthest from
//   the fabric within LINE.tol); 0 at ΔE 25.
// - weight: on the centre of each band 1.5 mm or wider, the width sewn across it over the band's width (a 3 mm
//   crayon line sewn as one 0.4 mm run: 0.13).
// Weights from the cycle 5 reviewer's proposal: 0.4 recall, 0.25 precision, 0.15 doubling, 0.1 colour, 0.1 weight.
function lineScore(a, b, cv, W, H, s, fabric, maps = false) {
  const n = W * H, F = linOf(fabric), R = lineRef(a, W, H, s, fabric), sig = LOOK.blur * s;
  if (!cv) { cv = new Float32Array(n); const Fl = labLin(...F), lb = toLab(b, n); for (let i = 0; i < n; i++) cv[i] = de2000(lb[i * 3], lb[i * 3 + 1], lb[i * 3 + 2], ...Fl) > LOOK.ink ? 1 : 0; }
  const S = new Uint8Array(n), notS = new Uint8Array(n);
  for (let i = 0; i < n; i++) { S[i] = cv[i] > 0.4 ? 1 : 0; notS[i] = 1 - S[i]; }
  const dS = edt(S, W, H), tol = LINE.tol * s;
  // each stitch pixel counts as 1 / the width of the thread mask there, so the stitch lines count by length: a satin
  // column 3 mm wide is not 7 hairlines
  const inS = edt(notS, W, H), wS = maxFilter(inS, W, H, Math.round(LINE.reach * s)), len = new Float32Array(n);
  for (let i = 0; i < n; i++) if (S[i]) len[i] = 1 / Math.max(1, 2 * wS[i] - 1);
  // recall: an edge of a band is traced from the band's centre
  let rw = 0, rk = 0, nE = 0;
  const hit = maps ? new Uint8Array(n) : null;
  for (let i = 0; i < n; i++) {
    if (!R.E[i]) continue;
    nE++;
    const wt = Math.min(2, R.E.mag[i] / LOOK.edge), ofBand = R.ridgeW[i] > 0 && R.toRidge[i] <= R.ridgeW[i] + 1.5;
    rw += wt; if (dS[i] <= (ofBand ? Math.max(tol, 2 * R.toRidge[i] + LINE.slack * s) : tol)) { rk += wt; if (hit) hit[i] = 1; }
  }
  const recall = rw ? rk / rw : 1;
  // precision
  const ref = new Uint8Array(n);
  for (let i = 0; i < n; i++) ref[i] = R.E[i] | R.ridge[i];
  const dR = edt(ref, W, H);
  let ns = 0, np = 0;
  for (let i = 0; i < n; i++) if (S[i]) { ns += len[i]; if (dR[i] <= tol || R.band[i]) np += len[i]; }
  const precision = ns ? np / ns : 0;
  // doubling: across each stitch pixel (the normal from the structure tensor of the thread cover), out of its own line
  // within 0.6 mm, a gap of picture ink with no edge in its middle, then another line LINE.gap from the first, parallel
  const ang = orient(S, W, H), [g0, g1] = LINE.gap.map((v) => v * s), out0 = 0.6 * s, edgeFree = 0.3 * s;
  let dbl = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!S[i]) continue;
    const nx = Math.cos(ang[i]), ny = Math.sin(ang[i]);
    let found = false;
    for (const sg of [1, -1]) {
      let t = 0.5, left = -1, ok = true;
      for (; t <= g1 + 0.6 * s; t += 0.5) {
        const X = Math.round(x + sg * nx * t), Y = Math.round(y + sg * ny * t);
        if (X < 0 || Y < 0 || X >= W || Y >= H) { ok = false; break; }
        const j = Y * W + X;
        if (left < 0) { if (!S[j]) left = t; else if (t > out0) { ok = false; break; } continue; }
        if (S[j]) {   // the other line
          if (t < g0 || t - left < 1 || Math.abs(Math.cos(ang[j] - ang[i])) < 0.87) ok = false;
          break;
        }
        if (!R.ink[j] || (R.E[j] && t - left > edgeFree && dS[j] > edgeFree)) { ok = false; break; }
      }
      if (ok && left >= 0 && t <= g1 + 0.6 * s) { found = true; break; }
    }
    if (found) dbl += len[i];
  }
  const doubling = ns ? 1 - dbl / ns : 1;
  // colour: the thread's own colour (normalised by its cover, as `perceived`) against the picture's line beside it
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) P[i * 3 + ch] = b[i * 3 + ch] - F[ch] * (1 - cv[i]);
  const Pc = blur(P, W, H, 3, sig), dens = blur(cv, W, H, 1, sig), r = Math.round(tol);
  let dE = 0, nc = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!S[i] || dens[i] < 0.05) continue;
    const j = inkNear(R, W, H, x, y, r); if (j < 0) continue;
    const t = labLin(Pc[i * 3] / dens[i], Pc[i * 3 + 1] / dens[i], Pc[i * 3 + 2] / dens[i]);
    dE += len[i] * de2000(...t, R.la[j * 3], R.la[j * 3 + 1], R.la[j * 3 + 2]); nc += len[i];
  }
  dE = nc ? dE / nc : LOOK.colourScale;
  const colour = Math.max(0, 1 - dE / LOOK.colourScale);
  // weight: across each band 1.5 mm wide or more, at its centre, along the narrowest of 8 directions (the band's
  // normal within 11°), the stitched pixels within its half width against its width
  const D8 = Array.from({ length: 8 }, (_, k) => [Math.cos((k * Math.PI) / 8), Math.sin((k * Math.PI) / 8)]);
  let wsum = 0, wn = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, h = R.dIn[i];
    if (!R.ridge[i] || 2 * h < 1.5 * s) continue;
    let best = null, bl = Infinity;
    for (const [dx, dy] of D8) {
      let l = 0;
      for (const sg of [1, -1]) for (let t = 1; t <= 3 * h; t++) { const X = Math.round(x + sg * dx * t), Y = Math.round(y + sg * dy * t); if (X < 0 || Y < 0 || X >= W || Y >= H || R.dIn[Y * W + X] <= 1) break; l++; }
      if (l < bl) { bl = l; best = [dx, dy]; }
    }
    let sewn = 0;
    for (let t = -Math.round(h); t <= Math.round(h); t++) { const X = Math.round(x + best[0] * t), Y = Math.round(y + best[1] * t); if (X >= 0 && Y >= 0 && X < W && Y < H && S[Y * W + X]) sewn++; }
    wsum += Math.min(1, sewn / Math.max(1, 2 * h - 1)); wn++;
  }
  const weight = wn ? wsum / wn : 1, Wt = LINE.weights;
  const look = 100 * (Wt.recall * recall + Wt.precision * precision + Wt.doubling * doubling + Wt.colour * colour + Wt.weight * weight);
  return { look: Math.round(look * 10) / 10, recall: r3(recall), precision: r3(precision), doubling: r3(doubling), colour: r3(colour), weight: r3(weight), dE: Math.round(dE * 10) / 10, edges: nE, bands: Math.round(wn / s), ...(maps ? { maps: { w: W, h: H, E: R.E, hit, ridge: R.ridge, S } } : {}) };
}
// each pixel's normal to the thread through it (radians): the main axis of the structure tensor of the blurred cover
function orient(S, W, H) {
  const f = blur(Float32Array.from(S), W, H, 1, 1), n = W * H, jxx = new Float32Array(n), jyy = new Float32Array(n), jxy = new Float32Array(n);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, gx = (f[i + 1] - f[i - 1]) / 2, gy = (f[i + W] - f[i - W]) / 2;
    jxx[i] = gx * gx; jyy[i] = gy * gy; jxy[i] = gx * gy;
  }
  const bx = blur(jxx, W, H, 1, 1.5), by = blur(jyy, W, H, 1, 1.5), bxy = blur(jxy, W, H, 1, 1.5), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.5 * Math.atan2(2 * bxy[i], bx[i] - by[i]);
  return out;
}

// ---------- the fabric of a framed picture ----------
// A band of one colour all round the picture's edge, ending sharply in another colour (a framed card, a product photo
// in a coloured border): the frame is either left out (`findFrame`) or sewn (Sew the edge band too), so the fabric is
// never the frame's colour, as the page colour (the outermost pixels) would say: the stand-in is the colour inside the
// band. Returns { k: the band's width in px, inner: hex } or null. A plain page round a picture fades into its content
// ring by ring, never in 3 px to one colour holding the ring, so it is not taken for a frame.
export function frameOf(rgba, W, H) {
  const ring = (k) => {
    const px = [];
    for (let x = k; x < W - k; x++) { px.push((k * W + x) * 4); px.push(((H - 1 - k) * W + x) * 4); }
    for (let y = k + 1; y < H - 1 - k; y++) { px.push((y * W + k) * 4); px.push((y * W + W - 1 - k) * 4); }
    return px;
  };
  const like = (i, c) => rgba[i + 3] >= 128 && Math.max(Math.abs(rgba[i] - c[0]), Math.abs(rgba[i + 1] - c[1]), Math.abs(rgba[i + 2] - c[2])) <= 24;
  const share = (px, c) => px.filter((i) => like(i, c)).length / Math.max(1, px.length);
  const common = (px) => {
    const bins = new Map();
    for (const i of px) { if (rgba[i + 3] < 128) continue; const k = (rgba[i] >> 3) << 10 | (rgba[i + 1] >> 3) << 5 | rgba[i + 2] >> 3, b = bins.get(k) || [0, 0, 0, 0]; b[0]++; b[1] += rgba[i]; b[2] += rgba[i + 1]; b[3] += rgba[i + 2]; bins.set(k, b); }
    if (!bins.size) return null;
    const [c, r, g, b] = [...bins.values()].sort((p, q) => q[0] - p[0])[0];
    return [r / c, g / c, b / c];
  };
  const outer = common(ring(0)), maxK = Math.floor(Math.min(W, H) / 6);
  if (!outer || share(ring(0), outer) < 0.9) return null;
  let k = 1;
  while (k <= maxK && share(ring(k), outer) >= 0.9) k++;
  if (k < 2 || k > maxK) return null;
  const inside = ring(k + 3), inner = common(inside);
  if (!inner || share(inside, outer) > 0.1 || share(inside, inner) < 0.7) return null;
  return { k, inner: "#" + inner.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("") };
}
// the mm grid's pixels (sourceGrid's box, ppm and map) that show the band within `k` px of the picture's edge
export function bandGrid({ box, ppm, map: [ox, oy, kx, ky] }, W, H, k) {
  const w = Math.round((box[2] - box[0]) * ppm), h = Math.round((box[3] - box[1]) * ppm), out = new Uint8Array(w * h);
  for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) {
    const sx = ox + (box[0] + (X + 0.5) / ppm) * kx, sy = oy + (box[1] + (Y + 0.5) / ppm) * ky;
    if (sx >= 0 && sy >= 0 && sx < W && sy < H && (sx < k || sy < k || sx >= W - k || sy >= H - k)) out[Y * w + X] = 1;
  }
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

// Line drawings: tracings of the picture made by hand from its own lines (lineRef), at the score's grid:
// - traced: each band up to LINE.band sewn as the band (a satin column its width) in its own colour, every other edge
//   as a 0.6 mm line in the colour beside it: what a digitizer would sew;
// - hairline: the same with each band sewn as a 0.6 mm line along its centre (the crayon drawing sewn as runs);
// - dropped: the traced copy with its middle third left out (lines missing: the landscape's ridge);
// - false: the traced copy plus a line every 6 mm across the fabric and the inside of wide shapes, 1.5 mm or more
//   from any line of the picture (a die-cut border, spurs, a gradient's band line);
// - doubled: each band 1.2 mm or wider sewn as its two outlines, 0.4 mm each, instead of its centre;
// - shifted: the traced copy 1 mm right and 1 mm down;
// - recoloured: the traced copy with each thread's channels rotated.
// Returns { name: score } (lookScore with style "line" and each copy's own cover).
export function lineVariants(img, w, h, ppm, fabric) {
  let a = img, W = w, H = h, s = ppm;
  while (s > LOOK.grid * 1.5) { const p = down2(a, W, H); a = p.img; W = p.w; H = p.h; s /= 2; }
  const n = W * H, F = linOf(fabric), R = lineRef(a, W, H, s, fabric), r = Math.round(LINE.tol * s);
  const colAt = new Int32Array(n).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) colAt[y * W + x] = inkNear(R, W, H, x, y, r);
  // (a line with no picture colour beside it, the false ones on open fabric: the darkest line colour)
  let dark = -1; for (let i = 0; i < n; i++) if (colAt[i] >= 0 && (dark < 0 || R.la[colAt[i] * 3] < R.la[dark * 3])) dark = colAt[i];
  const wideE = new Uint8Array(n);
  for (let i = 0; i < n; i++) wideE[i] = R.E[i] && !(R.ridgeW[i] > 0 && R.toRidge[i] <= R.ridgeW[i] + 1.5) ? 1 : 0;
  // (a line under 0.6 mm has no centre pixel to call a band: its ink is sewn as it is, not as its two edges)
  const dW = edt(wideE, W, H), band = new Uint8Array(R.band), m2 = maxFilter(R.dIn, W, H, 2);
  for (let i = 0; i < n; i++) if (R.ink[i] && m2[i] < 1.5) band[i] = 1;
  const make = (on, shift = 0, recolour = false) => {
    const img2 = new Float32Array(n * 3), cov = new Float32Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, X = x - shift, Y = y - shift, j = X >= 0 && Y >= 0 ? Y * W + X : -1;
      const c = j >= 0 && on(j, X) ? (colAt[j] >= 0 ? colAt[j] : dark) : -1;
      if (c < 0) { img2.set(F, i * 3); continue; }
      const q = [R.ab[c * 3], R.ab[c * 3 + 1], R.ab[c * 3 + 2]];
      img2.set(recolour ? [q[2], q[0], q[1]] : q, i * 3); cov[i] = 1;
    }
    return { img: img2, cover: cov };
  };
  const traced = (j) => band[j] || dW[j] <= 1, out = {};
  out.traced = make(traced);
  out.hairline = make((j) => (R.band[j] ? R.toRidge[j] <= 1 : traced(j)));
  out.dropped = make((j, x) => traced(j) && (x < W / 3 || x >= (2 * W) / 3));
  const pic = new Uint8Array(n); for (let i = 0; i < n; i++) pic[i] = R.E[i] | R.ink[i];
  const dP = edt(pic, W, H), dE = edt(R.E, W, H), step = Math.round(6 * s);
  out.false = make((j) => traced(j) || (Math.floor(j / W) % step < 2 && dE[j] > 1.5 * s && (dP[j] > 1.5 * s || R.dIn[j] > R.thin)));
  out.doubled = make((j) => (band[j] ? (R.ridgeW[j] >= 0.6 * s ? R.dIn[j] <= 2 : 1) : dW[j] <= 1));
  out.shifted = make(traced, Math.round(s));
  out.recoloured = make(traced, 0, true);
  const res = {};
  for (const [k, v] of Object.entries(out)) res[k] = lookScore(a, v.img, W, H, s, fabric, { style: "line", cover: v.cover });
  return res;
}
export function lineRules(v) {
  const bad = [], t = v.traced, L = (k) => v[k].look, under = (k, part, by) => { if (!(v[k][part] < t[part] - by)) bad.push(`${k} ${part} ${v[k][part]} not under traced ${t[part]} by ${by}`); };
  if (L("traced") < 85) bad.push(`a tracing of the picture's own lines scores ${L("traced")}`);
  for (const k of Object.keys(v)) if (k !== "traced" && (t.bands >= 20 || !["hairline", "doubled"].includes(k)) && L(k) >= L("traced")) bad.push(`${k} ${L(k)} scores at least as well as traced ${L("traced")}`);
  under("dropped", "recall", 0.1); under("false", "precision", 0.1);
  under("shifted", "precision", 0.1); under("recoloured", "colour", 0.3);
  if (v.shifted.recall > t.recall) bad.push(`shifted recall ${v.shifted.recall} over traced ${t.recall}`);
  // (with bands 1.5 mm or wider, over 20 mm of them: the weight and doubling copies differ from the traced one)
  if (t.bands >= 20) {
    under("hairline", "weight", 0.3); under("doubled", "doubling", 0.05);
    // (a near-perfect trace at the wrong weight, the crayon, outranks one missing its lines, the landscape's ridge)
    if (!(L("hairline") > L("dropped"))) bad.push(`hairline ${L("hairline")} not above dropped ${L("dropped")}`);
  }
  return bad;
}

// Cross-stitch: the picture charted by hand on a grid from the picture's top left (each cell mostly ink gets a cross
// in its ink's mean colour), rendered as thread: as charted, shifted half a cell (the registration the score once
// had: crop centre against grid centre), with its threads' channels rotated, and with its middle third of columns
// left out. Returns { name: score }.
export function crossVariants(img, w, h, ppm, fabric, cell = 2.5) {
  const F = linOf(fabric), Fl = labLin(...F), n = w * h, lab = toLab(img, n), c = cell * ppm, gw = Math.floor(w / c), gh = Math.floor(h / c);
  const groups = new Map();
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let k = 0, t = 0; const m = [0, 0, 0];
    for (let y = Math.floor(gy * c); y < Math.floor((gy + 1) * c); y++) for (let x = Math.floor(gx * c); x < Math.floor((gx + 1) * c); x++) {
      const i = y * w + x; t++;
      if (de2000(lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2], ...Fl) > LOOK.ink) { k++; for (let ch = 0; ch < 3; ch++) m[ch] += img[i * 3 + ch]; }
    }
    if (k * 2 <= t) continue;
    const hex = "#" + m.map((v) => Math.min(255, Math.round(enc(v / k) / 17) * 17).toString(16).padStart(2, "0")).join("");
    if (!groups.has(hex)) groups.set(hex, []);
    groups.get(hex).push([gx, gy]);
  }
  const chart = (rot, keep) => {
    const threads = [], stitches = [];
    for (const [hex, cells] of groups) {
      if (threads.length) stitches.push([0, 0, COLOR_CHANGE]);
      threads.push({ color: rot ? "#" + hex.slice(5, 7) + hex.slice(1, 5) : hex });
      for (const [gx, gy] of cells) {
        if (!keep(gx)) continue;
        const [x0, y0, x1, y1] = [gx, gy, gx + 1, gy + 1].map((v) => (v * cell * 10));
        stitches.push([x0, y0, JUMP], [x1, y1, STITCH], [x1, y0, JUMP], [x0, y1, STITCH]);
      }
    }
    return { threads, stitches };
  };
  const box = [0, 0, w / ppm, h / ppm], all = () => true, res = {};
  const run = (k, d, shift = [0, 0]) => { const B = renderThreads(d, { box, ppm, fabric, shift }); res[k] = lookScore(img, B.img, w, h, ppm, fabric, { style: "cross", cover: B.cover, cell }); };
  run("charted", chart(false, all));
  run("shifted", chart(false, all), [cell * 5, cell * 5]);
  run("recoloured", chart(true, all));
  run("dropped", chart(false, (gx) => gx < gw / 3 || gx >= (2 * gw) / 3));
  return res;
}
export function crossRules(v) {
  const bad = [], t = v.charted, L = (k) => v[k].look;
  if (t.colour < 0.7) bad.push(`charted crosses in the picture's own colours score colour ${t.colour}`);
  for (const k of Object.keys(v)) if (k !== "charted" && L(k) >= L("charted")) bad.push(`${k} ${L(k)} scores at least as well as charted ${L("charted")}`);
  if (!(v.shifted.outline < t.outline)) bad.push(`shifted half a cell: outline ${v.shifted.outline} not under charted ${t.outline}`);
  if (!(v.recoloured.colour < t.colour - 0.3)) bad.push(`recoloured colour ${v.recoloured.colour} not well under charted ${t.colour}`);
  if (!(v.dropped.shape < t.shape)) bad.push(`dropped shape ${v.dropped.shape} not under charted ${t.shape}`);
  return bad;
}
