/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Letter outlines for appliqué: render the word, trace every edge (outsides and the holes in A, B, O...) with
// marching squares, then round the corners (1.6 mm) so a satin can turn them cleanly. mm, y down.
import { filletPolygon, resample, smooth } from "../core/geom.js";
import { distanceTransform, label } from "../core/raster.js";

const PX = 300;
const traced = new Map();

function canvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}

// closed loops of the ink's edge, in pixels, the letters drawn `size` mm tall. Gaps inside a letter narrower than
// 2 x CLOSE mm (the slivers where an M's diagonal meets its stem, the bottom of its V) are filled first: the satins
// either side cover them anyway, and a satin round a notch that sharp fanned out in spikes past its edge.
const CLOSE = 1.4;
function trace(text, family, size) {
  const probe = canvas(10, 10).getContext("2d");
  probe.font = `${PX}px "${family}"`;
  const m = probe.measureText(text), inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const r = (CLOSE * inkH) / size, pad = 4 + Math.ceil(r);
  const w = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + 2 * pad, h = Math.ceil(inkH) + 2 * pad;
  return { loops: traceDrawn(w, h, (ctx) => { ctx.font = probe.font; ctx.fillText(text, pad + m.actualBoundingBoxLeft, pad + m.actualBoundingBoxAscent); }, r),
    inkH, w, h };
}
// morphological closing (grown by r px, then shrunk by r px), each piece of ink on its own: closing them together
// joined letters that nearly touch and an i to its dot ("Mia" in Alfa Slab came out as one blob)
function closeMask(d, w, h, r) {
  const { labels, count } = label({ w, h, data: d }), out = d.slice(), R = Math.ceil(r) + 2;
  const box = Array.from({ length: count + 1 }, () => [w, h, -1, -1]);
  for (let i = 0; i < w * h; i++) if (labels[i]) {
    const b = box[labels[i]], x = i % w, y = (i - x) / w;
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
  }
  for (let c = 1; c <= count; c++) {
    const x0 = Math.max(0, box[c][0] - R), y0 = Math.max(0, box[c][1] - R), x1 = Math.min(w - 1, box[c][2] + R), y1 = Math.min(h - 1, box[c][3] + R);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1, bg = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) bg[y * cw + x] = labels[(y + y0) * w + x + x0] === c ? 0 : 1;
    const toInk = distanceTransform({ w: cw, h: ch, data: bg }), grown = new Uint8Array(cw * ch);
    for (let i = 0; i < cw * ch; i++) grown[i] = toInk[i] <= r ? 1 : 0;
    const toBg = distanceTransform({ w: cw, h: ch, data: grown });
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (toBg[y * cw + x] > r) out[(y + y0) * w + x + x0] = 1;
  }
  return out;
}
function traceDrawn(w, h, draw, close = 0) {
  const c = canvas(w, h), ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#000"; draw(ctx);
  const a = ctx.getImageData(0, 0, w, h).data;
  let m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = a[i * 4 + 3] > 127 ? 1 : 0;
  if (close) m = closeMask(m, w, h, close);
  const ink = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x];
  // marching squares on pixel corners: each cell edge crossing is a point; link segments into loops
  const next = new Map();
  const key = (x, y) => x * 2 + "," + y * 2;   // half-pixel points as integers
  const add = (p, q) => next.set(key(...p), [q, key(...q)]);
  for (let y = -1; y < h; y++) for (let x = -1; x < w; x++) {
    const tl = ink(x, y), tr = ink(x + 1, y), br = ink(x + 1, y + 1), bl = ink(x, y + 1);
    const T = [x + 1, y + 0.5], R = [x + 1.5, y + 1], B = [x + 1, y + 1.5], L = [x + 0.5, y + 1];
    // walk with the ink on the right; saddles split so outlines never cross
    switch ((tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0)) {
      case 1: add(B, L); break; case 2: add(R, B); break; case 3: add(R, L); break; case 4: add(T, R); break;
      case 5: add(T, L); add(B, R); break; case 6: add(T, B); break; case 7: add(T, L); break; case 8: add(L, T); break;
      case 9: add(B, T); break; case 10: add(L, B); add(R, T); break; case 11: add(R, T); break; case 12: add(L, R); break;
      case 13: add(B, R); break; case 14: add(L, B); break;
    }
  }
  const loops = [], seen = new Set();
  for (const [k0, [q0]] of next) {
    if (seen.has(k0)) continue;
    const loop = [];
    let k = k0, [q, kq] = next.get(k0);
    while (!seen.has(k)) { seen.add(k); loop.push(q); k = kq; const n = next.get(k); if (!n) break; [q, kq] = n; }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

// Corners rounded to `r` mm: the traced outline simplified to its straight runs and corners (Douglas-Peucker, 0.1 mm),
// each corner filleted (a short run between two corners takes what it can), then resampled. A satin's inside edge
// fanned out at sharp corners (an M's notches, a V's point): 1.5 mm past the edge with only ~1 mm smoothing.
function rounded(l, r) {
  const v = simplify(l, 0.1);
  return v.length < 4 ? l : resample(filletPolygon(v, r, 6), 0.3, true);
}
// closed loop: split at the point farthest from the first, then Douglas-Peucker each half
function simplify(loop, tol) {
  const l = [...loop, loop[0]], keep = new Uint8Array(l.length);
  let far = 1, fd = -1;
  for (let i = 1; i < loop.length; i++) { const d = Math.hypot(l[i][0] - l[0][0], l[i][1] - l[0][1]); if (d > fd) { fd = d; far = i; } }
  keep[0] = keep[far] = keep[l.length - 1] = 1;
  const st = [[0, far], [far, l.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let bi = -1, bd = tol;
    const [ax, ay] = l[a], [bx, by] = l[b], L = Math.hypot(bx - ax, by - ay) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - l[i][1]) - (ax - l[i][0]) * (by - ay)) / L; if (d > bd) { bd = d; bi = i; } }
    if (bi >= 0) { keep[bi] = 1; st.push([a, bi], [bi, b]); }
  }
  return l.filter((_, i) => keep[i]).slice(0, -1);   // (closed: the last point is the first again)
}

// a motif (an SVG path in a 256 box, js/studio/motifs.js) as outlines, `size` mm across its longer side, centred
const motifs = new Map();
export function motifOutlines(d, size) {
  if (!motifs.has(d)) {
    motifs.set(d, traceDrawn(PX + 8, PX + 8, (ctx) => { ctx.translate(4, 4); ctx.scale(PX / 256, PX / 256); ctx.fill(new Path2D(d)); }));
    if (motifs.size > 40) motifs.delete(motifs.keys().next().value);
  }
  const loops = motifs.get(d), all = loops.flat();
  const x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0])), y0 = Math.min(...all.map((p) => p[1])), y1 = Math.max(...all.map((p) => p[1]));
  const s = size / Math.max(x1 - x0, y1 - y0, 1), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return loops.map((l) => rounded(smooth(resample(l.map(([x, y]) => [(x - cx) * s, (y - cy) * s]), 0.3, true), 5, true), 1.6)).filter((l) => l.length > 6);
}

// outlines of `text` at `size` mm tall (the ink), centred on (0, 0)
export function letterOutlines(text, family, size) {
  text = (text || "").trim();
  if (!text) return [];
  const k = family + "\n" + text + "\n" + size;
  // not cached until the font has loaded (before that it's the browser's fallback font)
  const t = traced.get(k) || trace(text, family, size);
  if (!traced.has(k) && document.fonts.check(`40px "${family}"`)) { traced.set(k, t); if (traced.size > 30) traced.delete(traced.keys().next().value); }
  const { loops, inkH, w, h } = t, s = size / Math.max(inkH, 1);
  return loops
    // corners rounded 1.6 mm (half the 2.8 mm satin and a little): tighter, a satin round an inside corner folds on
    // itself and piles up needle hits
    .map((l) => rounded(smooth(resample(l.map(([x, y]) => [(x - w / 2) * s, (y - h / 2) * s]), 0.3, true), 7, true), 1.6))
    .filter((l) => l.length > 6);
}
