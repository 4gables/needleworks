// Letter outlines for appliqué: render the word, trace every edge (outsides and the holes in A, B, O...) with
// marching squares, then round the corners (~1 mm) so a satin can turn them cleanly. mm, y down.
import { resample, smooth } from "../core/geom.js";

const PX = 300;
const traced = new Map();

function canvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}

// closed loops of the ink's edge, in pixels
function trace(text, family) {
  const probe = canvas(10, 10).getContext("2d");
  probe.font = `${PX}px "${family}"`;
  const m = probe.measureText(text);
  const w = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + 8;
  const h = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + 8;
  const c = canvas(w, h), ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.font = probe.font; ctx.fillStyle = "#000";
  ctx.fillText(text, 4 + m.actualBoundingBoxLeft, 4 + m.actualBoundingBoxAscent);
  const a = ctx.getImageData(0, 0, w, h).data, ink = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 127;
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
  return { loops, inkH: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, w, h };
}

// outlines of `text` at `size` mm tall (the ink), centred on (0, 0)
export function letterOutlines(text, family, size) {
  text = (text || "").trim();
  if (!text) return [];
  const k = family + "\n" + text;
  // not cached until the font has loaded (before that it's the browser's fallback font)
  const t = traced.get(k) || trace(text, family);
  if (!traced.has(k) && document.fonts.check(`40px "${family}"`)) { traced.set(k, t); if (traced.size > 30) traced.delete(traced.keys().next().value); }
  const { loops, inkH, w, h } = t, s = size / Math.max(inkH, 1);
  return loops
    // corners rounded ~1 mm: a 2.8 mm satin around a square inside corner folds on itself and piles up needle hits
    .map((l) => smooth(resample(l.map(([x, y]) => [(x - w / 2) * s, (y - h / 2) * s]), 0.3, true), 7, true))
    .filter((l) => l.length > 6);
}
