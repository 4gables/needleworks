// Design tab: pieces (text, monogram, frame) -> stitches, laid out around the hoop centre (mm, y down).
// Uses the shared lettering and stitch engines and returns a Design; the PES file is written by the locked
// writer in js/core/formats.js, which nothing here touches.
import { Design } from "../core/design.js";
import { fontOf } from "../core/fonts.js";
import { filletPolygon, run, satin, zigzag } from "../core/geom.js";
import { order } from "../core/raster.js";
import { strokes } from "../core/text.js";

// ---------- lettering ----------
const lettering = new Map();   // font + text -> centre-line strokes (rendering is the slow part)
function letterStrokes(text, family) {
  const key = family + "\n" + text;
  if (!lettering.has(key)) {
    const print = !!fontOf(family).print;
    const { edges, info } = strokes(text, family, print ? { deco: "dash", join: false } : {});
    lettering.set(key, { comps: order(edges), info });
    if (lettering.size > 60) lettering.delete(lettering.keys().next().value);
  }
  return lettering.get(key);
}

// Letters as [pts, "run"|"satin"] in mm: `size` is the height of the lettering, baseline at y = 0, centred across.
function letters(text, family, size) {
  text = (text || "").trim();
  if (!text) return { parts: [], satinW: 0 };
  const { comps, info } = letterStrokes(text, family);
  const all = comps.flatMap((c) => c.flatMap(([p]) => p));
  if (!all.length) return { parts: [], satinW: 0 };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of all) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const s = size / Math.max(y1 - y0, 1e-9), cx = (x0 + x1) / 2;
  const parts = comps.flatMap((c) => c.map(([p, mode]) => [p.map(([x, y]) => [(x - cx) * s, (y - info.baseline) * s]), mode]));
  // satin as wide as the font's own stroke, within what sews well
  const satinW = Math.min(3.2, Math.max(1.2, info.stroke * s));
  return { parts, satinW, top: (y0 - info.baseline) * s, bottom: (y1 - info.baseline) * s };
}

// Bend straight lettering onto a circle of radius R around (0, 0): "up" reads over the top, letters pointing out;
// "down" reads along the bottom, letters pointing in. Both keep the baseline on the circle.
function bend(parts, shape, R) {
  const f = shape === "up"
    ? ([x, y]) => { const a = x / R, r = R - y; return [r * Math.sin(a), -r * Math.cos(a)]; }
    : ([x, y]) => { const a = -x / R, r = R + y; return [-r * Math.sin(a), r * Math.cos(a)]; };
  return parts.map(([p, mode]) => [densify(p, 1).map(f), mode]);
}
// extra points so long straight runs follow the curve
function densify(p, step) {
  const out = [p[0]];
  for (let i = 1; i < p.length; i++) {
    const [ax, ay] = p[i - 1], [bx, by] = p[i], n = Math.ceil(Math.hypot(bx - ax, by - ay) / step);
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

function stitchLetters(parts, satinW) {
  return parts.map(([p, mode]) => (mode === "run" ? run(p, 1.2) : satin(p, satinW, 0.38, 0.2)));
}

// ---------- frames ----------
export const SHAPES = {
  circle: { name: "Circle", path: (w, h) => ellipse(w / 2, w / 2) },
  oval: { name: "Oval", path: (w, h) => ellipse(w / 2, h / 2) },
  square: { name: "Rounded square", path: (w, h) => filletPolygon([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], Math.min(w, h) * 0.12, 10) },
  diamond: { name: "Diamond", path: (w, h) => filletPolygon([[0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0]], Math.min(w, h) * 0.05, 8) },
  heart: { name: "Heart", path: heart },
  scallop: { name: "Scallop", path: (w, h) => scallop(w / 2, h / 2) },
};
function ellipse(rx, ry, n = 160) {
  return Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return [rx * Math.sin(t), -ry * Math.cos(t)]; });
}
function heart(w, h, n = 180) {
  const raw = Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
  });
  return fitBox(raw, w, h);
}
function scallop(rx, ry, n = 240) {
  const bumps = Math.max(8, Math.round((Math.PI * (rx + ry)) / 9));
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2, k = 0.92 + 0.08 * Math.abs(Math.sin((bumps * t) / 2));
    return [rx * k * Math.sin(t), -ry * k * Math.cos(t)];
  });
}
function fitBox(pts, w, h) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return pts.map(([x, y]) => [((x - cx) / (x1 - x0)) * w, ((y - cy) / (y1 - y0)) * h]);
}
export const BORDERS = { line: "Thin line", bold: "Bold line", satin: "Satin border" };

// ---------- pieces ----------
// text:     { kind: "text", text, font, size, shape: "straight"|"up"|"down", radius, x, y, color }
// monogram: { kind: "monogram", letters, font, size, x, y, color }  (3 letters: small, BIG, small)
// frame:    { kind: "frame", shape, w, h, border, x, y, color }
export function pieceStitches(p) {
  let paths = [];
  if (p.kind === "text") {
    const { parts, satinW, top, bottom } = letters(p.text, p.font, p.size);
    if (!parts.length) return [];
    if (p.shape === "up" || p.shape === "down") paths = stitchLetters(bend(parts, p.shape, Math.max(p.radius, 8)), satinW);
    else { const mid = (top + bottom) / 2; paths = stitchLetters(parts.map(([q, m]) => [q.map(([x, y]) => [x, y - mid]), m]), satinW); }
  } else if (p.kind === "monogram") {
    paths = monogram(p);
  } else if (p.kind === "frame") {
    const edge = (SHAPES[p.shape] || SHAPES.circle).path(p.w, p.h);
    if (p.border === "satin") paths = [zigzag(edge, 2.1, 2.0, true), satin(edge, 3.0, 0.4, 0.3, true)];
    else if (p.border === "bold") paths = [run(edge, 2.0, true), run(edge.slice().reverse(), 2.0, true), run(edge, 2.0, true)];
    else paths = [run(edge, 2.2, true)];
    paths = paths.map((q) => [...q, q[0]]);   // close the loop
  }
  return paths.map((q) => q.map(([x, y]) => [x + p.x, y + p.y]));
}

function monogram(p) {
  const chars = [...(p.letters || "").replace(/\s+/g, "")].slice(0, 3);
  if (!chars.length) return [];
  const big = p.size, small = p.size * 0.68, gap = p.size * 0.04;
  const sizes = chars.length === 3 ? [small, big, small] : chars.map(() => big);
  const ls = chars.map((c, i) => letters(c, p.font, sizes[i]));
  const widths = ls.map((l) => { const xs = l.parts.flatMap(([q]) => q.map((v) => v[0])); return xs.length ? Math.max(...xs) - Math.min(...xs) : 0; });
  let x = -(widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1)) / 2;
  const out = [];
  ls.forEach((l, i) => {
    const mid = (l.top + l.bottom) / 2, cx = x + widths[i] / 2;
    out.push(...stitchLetters(l.parts.map(([q, m]) => [q.map(([a, b]) => [a + cx, b - mid]), m]), l.satinW));
    x += widths[i] + gap;
  });
  return out;
}

export function pieceBounds(p) {
  const pts = pieceStitches(p).flat();
  if (!pts.length) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

export const label = (p) => p.kind === "text" ? `“${p.text}”` : p.kind === "monogram" ? `Monogram ${p.letters}` : (SHAPES[p.shape] || SHAPES.circle).name;

// Sew the pieces in list order; neighbours in the same thread share one colour block (no pause).
export function compose(pieces, hoop) {
  const d = new Design(hoop);
  let last = null, any = false;
  for (const p of pieces) {
    const paths = pieceStitches(p).filter((q) => q.length);
    if (!paths.length) continue;
    if (p.color !== last) { d.color(p.color, label(p)); last = p.color; }
    for (const q of paths) d.path(q);
    any = true;
  }
  if (!any) throw new Error("Add some lettering or a frame to start.");
  return d.finish();
}
