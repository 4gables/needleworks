// Design tab: pieces (lettering, monogram, frame, appliqué letters, motif, opened file) -> stitches, laid out around
// the hoop centre (mm, y down).
// Uses the shared lettering and stitch engines and returns a Design; the PES file is written by the locked
// writer in js/core/formats.js, which nothing here touches.
import { Design } from "../core/design.js";
import { DENSITY, fillPolygon } from "../core/digitize.js";
import { fontOf } from "../core/fonts.js";
import { MARGIN } from "../core/machines.js";
import { bounds, edgeWalk, filletPolygon, followRun, normals, run, satin, zigzag } from "../core/geom.js";
import { distanceTransform, label as labelMask, order } from "../core/raster.js";
import { strokes } from "../core/text.js";
import { MOTIFS } from "./motifs.js";
import { letterOutlines, motifOutlines } from "./outline.js";
import { contours, echo, stipple } from "./quilt.js";

// ---------- lettering ----------
const lettering = new Map();   // font + text -> centre-line strokes (rendering is the slow part)
// Nothing drawn before its font has loaded is cached: it was drawn in the browser's fallback font, and caching it
// kept that lettering after the font arrived.
const fontReady = (family) => !family || typeof document === "undefined" || document.fonts.check(`40px "${family}"`);
function letterStrokes(text, family, spacing = 0) {
  const key = family + "\n" + text + "\n" + spacing;
  if (lettering.has(key)) return lettering.get(key);
  const print = !!fontOf(family).print;
  const { edges, info } = strokes(text, family, { ...(print ? { deco: "dash", join: false } : {}), ...(spacing ? { spacing } : {}) }), out = { comps: order(edges), info };
  if (fontReady(family)) {
    lettering.set(key, out);
    if (lettering.size > 60) lettering.delete(lettering.keys().next().value);
  }
  return out;
}

// Letters as [pts, "run"|"satin"] in mm: `size` is the height of the lettering, baseline at y = 0, centred across.
function letters(text, family, size, style = "auto", spacing = 0) {
  text = (text || "").replace(/\s*\n\s*/g, " ").trim();
  if (!text) return { parts: [], satinW: 0 };
  const { comps, info } = letterStrokes(text, family, spacing);
  const all = comps.flatMap((c) => c.flatMap(([p]) => p));
  if (!all.length) return { parts: [], satinW: 0 };
  const [x0, y0, x1, y1] = bounds(all), s = size / Math.max(y1 - y0, 1e-9), cx = (x0 + x1) / 2;
  const parts = comps.flatMap((c) => c.map(([p, mode]) => [p.map(([x, y]) => [(x - cx) * s, (y - info.baseline) * s]), mode]));
  // A satin column no wider than the font's own stroke, and never more than a fifth of the x-height (a sixth for
  // thin monoline fonts, which get a satin sized to the letters like the bookmark). Under 1 mm a satin can't be sewn
  // cleanly and fills small loops, so those letters get a fine line instead.
  const stroke = info.stroke * s, xh = info.mid * s;
  const w = stroke >= 0.95 ? Math.min(3.2, stroke, xh * 0.2) : Math.min(2.0, xh * 0.17);
  const satinW = style === "line" ? 0 : style === "satin" ? Math.max(1.0, w) : w >= 1.0 ? Math.max(1.2, w) : 0;
  return { parts, satinW, xh, top: (y0 - info.baseline) * s, bottom: (y1 - info.baseline) * s };
}

// Bend straight lettering onto an ellipse (half-width a, half-height b; a circle when a = b) around (0, 0): "up"
// reads over the top, letters pointing out; "down" reads along the bottom, letters pointing in. Both keep the
// baseline on the curve, and letters are spaced by arc length so they keep their width on an oval.
function bend(parts, shape, a, b = a) {
  const n = 720, pts = [], len = [0];
  for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI * 2; pts.push([a * Math.sin(t), -b * Math.cos(t), t]); }
  for (let i = 1; i <= n; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = len[n], half = len[n / 2];
  // point and outward normal at arc length s from the top
  const at = (s) => {
    s = ((s % L) + L) % L;
    let lo = 0, hi = n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (len[m] <= s) lo = m; else hi = m; }
    const f = (s - len[lo]) / (len[hi] - len[lo] || 1), t = pts[lo][2] + (pts[hi][2] - pts[lo][2]) * f;
    const nx = b * Math.sin(t), ny = -a * Math.cos(t), k = Math.hypot(nx, ny);
    return [a * Math.sin(t), -b * Math.cos(t), nx / k, ny / k];
  };
  const f = shape === "up"
    ? ([x, y]) => { const [px, py, nx, ny] = at(x); return [px - y * nx, py - y * ny]; }
    : ([x, y]) => { const [px, py, nx, ny] = at(half - x); return [px + y * nx, py + y * ny]; };
  return parts.map(([p, mode]) => [densify(p, 1).map(f), mode]);
}
// Arched lettering whose letters reach further inside the curve than ~0.8 x its radius of curvature (somewhere
// under the word) crowd into a knot there: "down" letters point inward, "up" ones only dip in with descenders.
export function archTight(p) {
  if (p.kind !== "text" || (p.shape !== "up" && p.shape !== "down")) return false;
  const l = letters(p.text, p.font, p.size, p.style);
  if (!l.parts.length) return false;
  const a = Math.max(p.radius, 8), b = Math.max(p.ry ?? p.radius, 8), xs = l.parts.flatMap(([q]) => q.map((v) => v[0]));
  const depth = p.shape === "up" ? l.bottom : -l.top, span = Math.max(...xs.map(Math.abs));
  // radius of curvature at t (0 = top) is (a^2 cos^2 t + b^2 sin^2 t)^1.5 / ab; walk the word's half span from the middle
  let s = 0, t = p.shape === "up" ? 0 : Math.PI, rho = Infinity;
  while (s <= span && Math.abs(t) < Math.PI * 2) {
    const v = Math.hypot(a * Math.cos(t), b * Math.sin(t));
    rho = Math.min(rho, v ** 3 / (a * b)); s += v * 0.01; t += 0.01;
  }
  return depth > 0.8 * rho;
}
// Arched lettering that wraps more than ~55% of the way round its curve (a long name on the bib's small arch) reads
// as a ring and runs into what's under it: the curve size that brings it to 45%, or null when it's fine.
export function archRoom(p) {
  if (p.kind !== "text" || (p.shape !== "up" && p.shape !== "down")) return null;
  const l = letters(p.text, p.font, p.size, p.style);
  if (!l.parts.length) return null;
  const xs = l.parts.flatMap(([q]) => q.map((v) => v[0])), span = Math.max(...xs) - Math.min(...xs);
  const a = Math.max(p.radius, 8), b = Math.max(p.ry ?? p.radius, 8), per = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  if (span <= per * 0.55) return null;
  const k = span / (per * 0.45);
  return { radius: Math.round(a * k), ry: Math.round(b * k) };
}
// The first other piece whose stitches come within 1 mm of p's (lettering run into a heart, say), or null. Patches
// are left out: lettering on a filled patch is meant to sit on it.
export function touching(p, pieces) {
  if (p.kind === "frame") return null;
  const mine = new Set();
  for (const q of pieceStitches(p)) for (const [x, y] of q) mine.add(Math.round(x) + "," + Math.round(y));
  for (const o of pieces) {
    if (o === p || o.id === p.id || (o.kind === "frame" && o.border === "patch")) continue;
    for (const q of pieceStitches(o)) for (const [x, y] of q) {
      const X = Math.round(x), Y = Math.round(y);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (mine.has(X + dx + "," + (Y + dy))) return o;
    }
  }
  return null;
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

// fabric (`FABRICS`): knit gets a zigzag underlay under thinner columns too (the fabric moves under a centre run),
// 0.3 mm more pull comp a side and a slightly open satin (0.42: piqué and jersey pull in and pucker under a dense
// one); towel lettering has its knockdown underneath instead (a zigzag on top of it took the towel name to 24
// hits/mm²); cotton, felt and denim sew as they always have. `small` lettering (under a 6 mm x-height, where the steps
// suggest 60 wt thread) gets a 0.34 mm satin: the thinner thread needs it closer to cover.
function stitchLetters(parts, satinW, fab = "cotton", small = false) {
  const zz = fab === "knit" ? 1.5 : 2.5, pull = fab === "knit" ? 0.3 : 0, density = fab === "knit" ? 0.42 : small ? 0.34 : 0.38;
  return parts.map(([p, mode]) => {
    // thin lettering: a stroke under ~0.6 mm is a speck of the skeleton; skip it (the next stroke picks up there)
    if (!satinW && length(p) < 0.6) return [];
    // the way out under a satin: a centre run, or a zigzag under wide columns (Ink/Stitch fonts' usual underlay), 0.4 mm
    // inside each edge so it never shows past the satin (it ends back on the centre line: ending on an edge left the
    // satin's start 2.4 mm away, a jump and trim)
    if (mode === "run") return satinW >= zz ? [p[0], ...zigzag(p, Math.max(satinW - 0.8, satinW * 0.5), 2.5), p[p.length - 1]] : satinW ? run(p, 1.2) : spaced(followRun(p, 1.6, 0.1, 0.8));
    // pull comp 0.15 mm a side; 0.05 on thin columns (more widens them enough to close small counters). It starts
    // from the centre: two satins back to back at a junction ended and began on opposite edges, a column's width
    // apart (2.4 mm on a 24 mm name), which was a jump and a trim: 11 needless trims on "Ashley" in Yellowtail.
    if (satinW) return [p[0], ...satin(p, satinW, density, (satinW >= 1.5 ? 0.3 : 0.1) + pull)];
    const r = spaced(followRun(p, 1.6, 0.1, 0.8)), back = r.slice().reverse();   // the walk's way back: back, forth and back again
    return r.length > 1 ? [...r, ...back.slice(1), ...r.slice(1)] : r;
  });
}
const length = (p) => p.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);
// no stitch shorter than 0.4 mm (tiny letters have tiny strokes; short stitches pile thread and break it)
function spaced(p, min = 0.4) {
  const out = [p[0]], end = p[p.length - 1];
  for (const q of p.slice(1)) if (Math.hypot(q[0] - out[out.length - 1][0], q[1] - out[out.length - 1][1]) >= min) out.push(q);
  // keep the stroke's real end (the next stroke starts there), dropping a kept point that sits too close to it
  if (out[out.length - 1] !== end) { if (out.length > 1 && Math.hypot(end[0] - out[out.length - 1][0], end[1] - out[out.length - 1][1]) < min) out.pop(); out.push(end); }
  return out;
}

// the lettering whose size matters: the words, or a monogram's middle letter (its sides are 0.68 of a 3-letter one,
// so with 3 letters that smaller size is what blurs first); null for other pieces
function bulk(p) {
  if (p.kind !== "text" && p.kind !== "monogram") return null;
  const chars = [...(p.letters || "")];
  return p.kind === "text" ? letters(p.text, p.font, p.size, p.style) : letters(chars[1] || p.letters, p.font, chars.length === 3 ? p.size * 0.68 : p.size, p.style);
}

// Lettering smaller than this blurs: the bulk of the letters (x-height, or caps) under ~4 mm.
export function minSize(p) {
  const l = bulk(p);
  if (!l || !l.parts.length || l.xh >= 4) return 0;
  return Math.ceil((p.size * 4) / l.xh);
}

// Lettering under ~6 mm (x-height, or caps) stitches cleanest with thinner thread and needle (Ink/Stitch's small
// fonts: "thin thread (60) and thin needle (60) is mandatory").
export function smallText(p) {
  const l = bulk(p);
  return !!l && l.parts.length > 0 && l.xh < 6;
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
  // the dip at the top is a sharp inside corner: a satin border can't turn it (the underlay poked out 1.75 mm and both
  // sides piled up), so it's filled in with a 3 mm round, the circle that just fits the notch
  const pts = fitBox(raw, w, h), r = Math.min(3, w * 0.06), near = pts.filter(([x, y]) => y < 0 && Math.abs(x) < r);
  if (!near.length) return pts;
  const yc = Math.min(...near.map(([x, y]) => y - Math.sqrt(r * r - x * x)));
  return pts.map(([x, y]) => (y < 0 && Math.abs(x) < r ? [x, Math.min(y, yc + Math.sqrt(r * r - x * x))] : [x, y]));
}
// soft waves, not cusps: a satin border can't turn a sharp inside corner cleanly
function scallop(rx, ry, n = 360) {
  const bumps = Math.max(8, Math.round((Math.PI * (rx + ry)) / 15));
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2, k = 0.94 + 0.06 * Math.cos(bumps * t);
    return [rx * k * Math.sin(t), -ry * k * Math.cos(t)];
  });
}
function fitBox(pts, w, h) {
  const [x0, y0, x1, y1] = bounds(pts), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return pts.map(([x, y]) => [((x - cx) / (x1 - x0)) * w, ((y - cy) / (y1 - y0)) * h]);
}
const shapeOf = (p) => SHAPES[p.shape] || SHAPES.circle;
// a circle frame is w across both ways
const frameH = (f) => (f.shape === "circle" ? f.w : f.h);
export const BORDERS = { line: "Thin line", bold: "Bold line", satin: "Satin border", patch: "Filled patch", applique: "Appliqué", ith: "In the hoop (two-sided)", zip: "Zipper pouch (in the hoop)" };
// fabric to cut for a w x h mm in-the-hoop piece, with 2.5 cm (1 in) spare all round to trim off
const cut = (w, h, extra = 25) => `${Math.ceil((w + extra) / 10)} × ${Math.ceil((h + extra) / 10)} cm (${((w + extra) / 25.4).toFixed(1)} × ${((h + extra) / 25.4).toFixed(1)} in)`;

// ---------- pieces ----------
// every piece: x, y (mm from the hoop centre), rot (degrees), flip (mirrored), color, id
// text:     { kind: "text", text (up to 3 lines), font, size, style: "auto"|"satin"|"line", shape: TEXT_SHAPES key,
//             radius, ry (arches), amp, waves (wave), bulge (bridge), align, leading, spacing, deco (a MOTIFS key) }
// monogram: { kind: "monogram", letters, font, size, style }  (3 letters: small, BIG, small)
// frame:    { kind: "frame", shape: SHAPES key, w, h, border: BORDERS key, fill (patch thread), quilt: "stipple"|"echo" }
// letters:  { kind: "letters", text, font (APPLIQUE_FONTS), size }  (appliqué letters)
// motif:    { kind: "motif", motif: MOTIFS key, size, style: "fill"|"outline"|"applique" }
// file:     { kind: "file", name, blocks: [{ color, name, paths }] }  (an opened PES/DST, stitches as is)
//
// A piece sews in stages; each stage is one colour block. `pause` forces a machine stop even in the same thread,
// with `you` telling the person what to do at it.
// Stitches don't change when a piece only moves or turns, so they're built once per shape and placed after.
const built = new Map();
export function pieceStages(p, fab = "cotton") {
  const { x, y, rot, id, flip, ...shape } = p, key = JSON.stringify(shape) + fab;
  if (!built.has(key)) {
    const st = localStages(p, fab);
    if (!fontReady(p.font)) return st.map((s) => ({ ...s, paths: s.paths.map((q) => q.map(placer(p))) }));
    built.set(key, st);
    if (built.size > 80) built.delete(built.keys().next().value);
  }
  const place = placer(p);
  return built.get(key).map((st) => ({ ...st, paths: st.paths.map((q) => q.map(place)) }));
}
// mirrored (left to right) before it's turned
function placer({ x, y, rot, flip }) {
  const a = ((rot || 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), f = flip ? -1 : 1;
  return ([u, v]) => [f * u * c - v * sn + x, f * u * sn + v * c + y];
}

// Lettering laid out in mm, centred on (0, 0): straight (up to 3 lines, aligned, every line at the first line's x-height),
// arched on a circle or oval, along a wave, or as a bridge (taller in the middle, baseline straight).
export const TEXT_SHAPES = { straight: "Straight", up: "Arch up", down: "Arch down", wave: "Wave", bridge: "Bridge" };
function textRows(p, fab = "cotton") {
  // spacing and leading are percentages of the size; spacing only for print fonts (script letters pulled apart came
  // out unjoined, which reads as broken handwriting)
  const style = styleOn(p, fab), sp = fontOf(p.font).print ? (p.spacing || 0) / 100 : 0;
  const lines = (p.text || "").split("\n").map((t) => t.trim()).filter(Boolean).slice(0, 3);
  if (!lines.length) return [];
  if (p.shape === "up" || p.shape === "down") {
    const l = letters(lines.join(" "), p.font, p.size, style, sp);
    return l.parts.length ? [{ parts: bend(l.parts, p.shape, Math.max(p.radius, 8), Math.max(p.ry ?? p.radius, 8)), satinW: l.satinW, xh: l.xh }] : [];
  }
  if (p.shape === "wave" || p.shape === "bridge") {
    const l = letters(lines.join(" "), p.font, p.size, style, sp);
    if (!l.parts.length) return [];
    const mid = (l.top + l.bottom) / 2;   // (letters come with the baseline at y = 0)
    return [{ parts: p.shape === "wave" ? wave(l.parts.map(([q, m]) => [q.map(([x, y]) => [x, y - mid]), m]), p) : bridge(l.parts, p), satinW: l.satinW, xh: l.xh }];
  }
  // straight: one size for every line (scaled to the first line's x-height), baselines `leading` x size apart
  let ls = lines.map((t) => letters(t, p.font, p.size, style, sp));
  if (ls.length > 1) ls = ls.map((l, i) => (i && l.xh ? letters(lines[i], p.font, (p.size * ls[0].xh) / l.xh, style, sp) : l));
  ls = ls.filter((l) => l.parts.length);
  if (!ls.length) return [];
  const pitch = (p.size * (p.leading ?? 130)) / 100, span = (l) => { const xs = l.parts.flatMap(([q]) => q.map((v) => v[0])); return [Math.min(...xs), Math.max(...xs)]; };
  const spans = ls.map(span), W = Math.max(...spans.map(([a, b]) => b - a));
  const top = Math.min(...ls.map((l, i) => l.top + i * pitch)), bottom = Math.max(...ls.map((l, i) => l.bottom + i * pitch));
  return ls.map((l, i) => {
    const [a, b] = spans[i], dx = p.align === "left" ? -W / 2 - a : p.align === "right" ? W / 2 - b : -(a + b) / 2, dy = i * pitch - (top + bottom) / 2;
    return { parts: l.parts.map(([q, m]) => [q.map(([x, y]) => [x + dx, y + dy]), m]), satinW: l.satinW, xh: l.xh };
  });
}
// along y = amp·sin(waves·2πx/W), letters spaced by arc length and turned with the curve
function wave(parts, p) {
  const xs = parts.flatMap(([q]) => q.map((v) => v[0])), x0 = Math.min(...xs), x1 = Math.max(...xs), W = Math.max(x1 - x0, 1);
  const amp = p.amp ?? p.size * 0.35, k = ((p.waves ?? 1) * 2 * Math.PI) / W, n = 600, pts = [], len = [0];
  for (let i = 0; i <= n; i++) { const x = x0 - W * 0.6 + (W * 2.2 * i) / n; pts.push([x, amp * Math.sin(k * (x - x0))]); }
  for (let i = 1; i <= n; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  // arc length at x0 (where the word starts), then the point and normal at arc length s past it
  const s0 = len[Math.round(((W * 0.6) / (W * 2.2)) * n)];
  const at = (s) => {
    let i = Math.min(n - 1, Math.max(0, len.findIndex((l) => l >= s) - 1));
    const t = (s - len[i]) / Math.max(len[i + 1] - len[i], 1e-9), [ax, ay] = pts[i], [bx, by] = pts[i + 1], L = Math.hypot(bx - ax, by - ay);
    return [ax + (bx - ax) * t, ay + (by - ay) * t, -(by - ay) / L, (bx - ax) / L];
  };
  const out = parts.map(([q, m]) => [densify(q, 1).map(([x, y]) => { const [px, py, nx, ny] = at(s0 + x - x0); return [px + y * nx, py + y * ny]; }), m]);
  const cx = (Math.min(...out.flatMap(([q]) => q.map((v) => v[0]))) + Math.max(...out.flatMap(([q]) => q.map((v) => v[0])))) / 2;
  const ys = out.flatMap(([q]) => q.map((v) => v[1])), cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return out.map(([q, m]) => [q.map(([x, y]) => [x - cx, y - cy]), m]);
}
// letters stretched upward toward the middle: the tops make an arch, the baseline stays put
function bridge(parts, p) {
  const xs = parts.flatMap(([q]) => q.map((v) => v[0])), x0 = Math.min(...xs), x1 = Math.max(...xs), W = Math.max(x1 - x0, 1);
  const k = (p.bulge ?? 30) / 100;
  const out = parts.map(([q, m]) => [densify(q, 1).map(([x, y]) => { const u = (2 * (x - (x0 + x1) / 2)) / W; return [x, y < 0 ? y * (1 + k * (1 - u * u)) : y]; }), m]);
  const ys2 = out.flatMap(([q]) => q.map((v) => v[1])), cy = (Math.min(...ys2) + Math.max(...ys2)) / 2;
  return out.map(([q, m]) => [q.map(([x, y]) => [x, y - cy]), m]);
}

// a towel's loops swallow a fine line, so lettering there is always satin
const styleOn = (p, fab) => (fab === "towel" && (p.style || "auto") === "auto" ? "satin" : p.style);
// Towel lettering is at least 2.5 mm wide (terry swallows a narrower column; less on small letters, up to 0.3 of the
// x-height) and sits on a knockdown in its own thread: a lattice 0.3 mm wider than the satin each side (a zigzag
// out along each stroke and one back, 2 mm apart: at 3 mm it was too open to hold the loops down), walked like the letters. Each connected word sews its lattice and
// then its letters; the walk ends where it began, so it adds no jumps. (A tatami fill of the grown word, Ink/Stitch's
// knockdown, broke into sections on thin script: +17 trims on a name; one dense zigzag read as a sparse satin;
// 1 mm wider stuck out of the satin like a fringe.)
function lettersOn(laid, satinW, fab, xh = Infinity) {
  if (fab === "towel" && satinW) satinW = Math.max(satinW, Math.min(2.5, xh * 0.3));
  const sewn = stitchLetters(laid, satinW, fab, xh < 6);
  if (fab !== "towel") return sewn;
  const w = satinW + 0.6, out = [];
  let from = 0;
  for (let i = 1; i <= laid.length; i++) {
    const a = laid[i - 1][0], b = laid[i]?.[0];
    if (b && Math.hypot(b[0][0] - a[a.length - 1][0], b[0][1] - a[a.length - 1][1]) < 0.5) continue;
    for (const [p] of laid.slice(from, i)) out.push(spaced([p[0], ...zigzag(p, w, 2), p[p.length - 1]]));
    out.push(...sewn.slice(from, i)); from = i;
  }
  return out;
}

const loop = (q) => [...q, q[0]];
// a tack-down: round the outline and back again
const tack = (e) => [loop(run(e, 2.0, true)), loop(run(e.slice().reverse(), 2.0, true))];
// the 3.6 mm satin border of appliqué, patch and in-the-hoop edges: edge walk, zigzag, satin
const satinBorder = (e) => [edgeWalk(e, 3.6, true), loop(zigzag(e, 2.6, 2.0, true)), loop(satin(e, 3.6, 0.4, 0.3, true))];

function localStages(p, fab = "cotton") {
  let stages = [];
  if (p.kind === "text") {
    const rows = textRows(p, fab);
    let paths = rows.flatMap(({ parts, satinW, xh }) => lettersOn(parts, satinW, fab, xh));
    // a small filled motif either side (`deco`), sized to the letters and centred on them
    if (paths.length && MOTIFS[p.deco]) {
      const [x0, y0, x1, y1] = bounds(paths.flat()), s = Math.max(6, Math.min(p.size * 0.75, 30)), gap = s * 0.35;
      const side = (dx) => motifStitches(motifOutlines(MOTIFS[p.deco].d, s), "fill").map((q) => q.map(([x, y]) => [x + dx, y + (y0 + y1) / 2]));
      paths = [...side(x0 - gap - s / 2), ...paths, ...side(x1 + gap + s / 2)];
    }
    const words = (p.text || "").replace(/\s*\n\s*/g, " / ").trim();
    if (paths.length) stages = [{ color: p.color, paths, sews: fab === "towel" ? `Sews a light base to flatten the towel loops, then “${words}” on it.` : `Sews “${words}”.` }];
  } else if (p.kind === "monogram") {
    const paths = monogram(p, fab);
    if (paths.length) stages = [{ color: p.color, paths, sews: fab === "towel" ? `Sews a light base to flatten the towel loops, then the monogram ${p.letters}.` : `Sews the monogram ${p.letters}.` }];
  } else if (p.kind === "frame") {
    const edge = shapeOf(p).path(p.w, p.h), name = shapeOf(p).name.toLowerCase();
    if (p.border === "applique") {
      stages = [
        { color: p.color, paths: [loop(run(edge, 2.5, true))], sews: `Sews the ${name} outline on the base fabric.`, fabric: true },
        { color: p.color, pause: true, paths: tack(edge),
          you: `Lay the appliqué fabric over the ${name} outline, right side up, covering it by ½ in. Press Start. Then take the hoop off (leave everything hooped), trim the appliqué fabric close to the stitching, and put the hoop back.`,
          sews: "Tacks the appliqué fabric down.", under: true },
        { color: p.color, pause: true, paths: satinBorder(edge), you: "Press Start.", sews: "Covers the raw edge with a satin border." },
      ];
    } else if (p.border === "zip") {
      // in-the-hoop zipper pouch: zipper across the top, the front in two folded pieces either side of it, whatever
      // goes on the front (the pieces after it), then the back face down and one seam through everything; turned
      // right side out through the zipper
      const [, top, , bot] = bounds(edge), x = p.w / 2 + 5;
      const yz = top + Math.max(14, p.h * 0.2), line = (y) => run([[-x, y], [x, y]], 2.5), a = yz - top, b = bot - yz;
      stages = [
        { color: p.color, paths: [line(yz)], sews: "Sews the zipper line on the stabilizer.", under: true,
          // (folded in half, each front piece has to reach from the zipper past the outline: twice that, plus spare)
          before: `Fabric: two front pieces, ${cut(p.w, 2 * (a + 15), 25)} for the top and ${cut(p.w, 2 * (b + 15), 25)} for the bottom (each folded in half along its length, wrong sides together), and the back, ${cut(p.w, p.h)}. Tear-away stabilizer, a #3 nylon coil zipper (it can be sewn and cut through) at least ${Math.ceil((p.w + 50) / 10)} cm (${((p.w + 50) / 25.4).toFixed(0)} in) long, and tape.` },
        { color: p.color, pause: true, paths: [line(yz - 5), line(yz + 5).reverse()], under: true,   // (±3.5 left 0.5 mm beside a coil's teeth)
          you: "Lay the zipper face up with its teeth on the line and the ends past both sides (pull the zipper tab past the side too). Tape the ends down. Press Start.",
          sews: "Tacks the zipper down along both sides of the teeth." },
        { color: p.color, pause: true, fabric: true, nocut: true, paths: [loop(run(edge, 2.5, true))],
          you: "Lay the top front piece above the zipper, folded edge along the teeth, and the bottom piece below it the same way, both right side up and past the outline. Tape them. Press Start.",
          sews: `Tacks the front pieces down round the ${name}.` },
        { color: p.color, paths: [line(yz - 7), line(yz + 7).reverse()], sews: "Topstitches beside the zipper." },
        { color: p.color, pause: true, last: true, paths: [...tack(edge), loop(run(edge, 2.0, true))],
          you: `Open the zipper halfway (you'll turn the pouch through it). Lay the back piece right side down over everything, covering the outline by ½ in, and tape it. Press Start.`,
          sews: `Sews round the ${name} through every layer, three times.`,
          after: "Take it out of the hoop and tear the stabilizer away. Trim ¼ in outside the seam (pinking shears stop fraying), trim the zipper ends, clip the corners, then turn it right side out through the zipper and press." },
      ];
    } else if (p.border === "ith") {
      // in-the-hoop ornament or keychain: an appliqué front, then whatever goes on it (the pieces after it in the list),
      // then backing fabric taped under the hoop and one satin edge through every layer; cut out when it's done
      stages = [
        { color: p.color, paths: [loop(run(edge, 2.5, true))], sews: `Sews the ${name} outline on the stabilizer.`, fabric: true,
          before: `Fabric: front and back pieces, each ${cut(p.w, p.h)}${p.quilt ? `, thin batting the same size` : ""}, tear-away stabilizer and tape.` },
        { color: p.color, pause: true, paths: tack(edge),
          you: `Lay ${p.quilt ? "the batting, then " : ""}the front fabric over the ${name} outline, right side up, covering it by ½ in. Press Start. Then take the hoop off (leave everything hooped), trim the fabric${p.quilt ? " and batting" : ""} close to the stitching, and put the hoop back.`,
          sews: "Tacks the front fabric down.", under: true },
        { color: p.color, pause: true, last: true,
          paths: [loop(run(edge, 2.0, true)), ...satinBorder(edge)],
          you: `Take the hoop off and turn it over. Tape the backing fabric to the back, right side facing you (away from the stabilizer), covering the ${name} by ½ in. For a hanging loop, tape a folded ribbon at the top on the front, loop pointing in, ends ½ in past the outline. Put the hoop back and press Start.`,
          sews: "Tacks the backing on and covers the edge with satin through every layer.",
          after: `Take it out of the hoop, tear the stabilizer away and cut round the ${name} as close to the satin as you can without nicking it (keep the ribbon loop clear of the scissors). Flip the ribbon loop up.` },
      ];
    } else if (p.border === "patch") {
      // solid tatami fill (inset so the satin edge covers its ragged ends), then the satin edge over it; `compose`
      // cuts the fill away under what's sewn on it (`carve`)
      stages = [...patchFill(p, [inset(edge, 1.0)], fab), { color: p.color, paths: satinBorder(edge), sews: `Sews the patch's satin edge.` }];
    } else {
      const paths = p.border === "satin" ? [edgeWalk(edge, 3.0, true), zigzag(edge, 2.1, 2.0, true), satin(edge, 3.0, 0.4, 0.3, true)]
        : p.border === "bold" ? [run(edge, 2.0, true), run(edge.slice().reverse(), 2.0, true), run(edge, 2.0, true)]
        : [run(edge, 2.2, true)];
      stages = [{ color: p.color, paths: paths.map(loop), sews: `Sews the ${name} frame.` }];
    }
  } else if (p.kind === "letters") {
    // appliqué letters: one piece of fabric for the whole word, outlined letter by letter (holes too)
    stages = appliqued(letterOutlines(p.text, p.font, p.size), p.color, p.text.trim(), "the letters", "around each letter (and inside the holes)", "them");
  } else if (p.kind === "motif") {
    const m = MOTIFS[p.motif] || MOTIFS.heart, loops = motifOutlines(m.d, p.size), name = m.name.toLowerCase();
    if (p.style === "applique") stages = appliqued(loops, p.color, `the ${name}`, `the ${name}`, "around it (and inside any holes)");
    else if (loops.length) stages = [{ color: p.color, paths: motifStitches(loops, p.style), sews: `Sews the ${name}${p.style === "outline" ? " outline" : ""}.` }];
  } else if (p.kind === "file") {
    stages = p.blocks.map((b) => ({ color: b.color, paths: b.paths, sews: `Sews ${p.name}${p.blocks.length > 1 ? ` (${b.name || "colour " + (p.blocks.indexOf(b) + 1)})` : ""}.` }));
  }
  return stages.map((st) => ({ ...st, paths: st.paths.filter((q) => q.length) }));
}

// A patch's fill in its thread, in a FILL_PATTERNS `pattern`; with `blend`, two layers across the patch, the first
// thinning out as the second fills in (row spacing changes gradually in each), the second with no underlay of its
// own (Hatch's colour blend, on one needle)
function patchFill(p, loops, fab, name = shapeOf(p).name.toLowerCase()) {
  const base = { ...(fab === "knit" ? { density: DENSITY.standard } : {}), pattern: p.pattern || "tatami" }, color = p.fill || p.color;
  if (!p.blend || p.blend === color) return [{ color, paths: fillPolygon(loops, base), sews: `Fills the ${name} patch.`, patchFill: true }];
  return [{ color, paths: fillPolygon(loops, { ...base, share: (f) => 1 - f }), sews: `Fills the ${name} patch, fading out.`, patchFill: true },
    { color: p.blend, paths: fillPolygon(loops, { ...base, underlay: false, share: (f) => f }), sews: `Blends the second colour in across the patch.`, patchFill: true }];
}

// a motif filled (tatami inside, then a narrow satin edge over the row ends) or as a satin outline
function motifStitches(loops, style) {
  if (style === "outline") return loops.flatMap((l) => edgeSatin(l, 2.2));
  return [...fillPolygon(loops, { inset: 0.6 }), ...loops.flatMap((l) => [loop(run(l, 2.0, true)), loop(satin(l, 1.4, 0.4, 0.2, true))])];
}

// a satin edge round a closed outline: as wide as `max`, narrower round a small hole (a 2.8 mm satin in the top of an
// A overlaps itself), over an edge walk and a zigzag
function edgeSatin(l, max, min = 1.2) {
  const [x0, y0, x1, y1] = bounds(l), w = Math.max(min, Math.min(max, Math.min(x1 - x0, y1 - y0) / 3.5));
  return [edgeWalk(l, w, true, Math.min(0.4, w / 4), true), loop(zigzag(l, w * 0.7, 2.0, true, true)), loop(satin(l, w, 0.4, w > 2 ? 0.3 : 0.2, true, true))];
}

// every loop moved d mm away from the inside of the shape (even-odd over all the loops, so holes move into the hole)
function outward(loops, d) {
  const inside = ([x, y]) => {
    let k = false;
    for (const l of loops) for (let i = 0, j = l.length - 1; i < l.length; j = i++)
      if ((l[i][1] > y) !== (l[j][1] > y) && x < ((l[j][0] - l[i][0]) * (y - l[i][1])) / (l[j][1] - l[i][1]) + l[i][0]) k = !k;
    return k;
  };
  return loops.map((l) => {
    const n = normals(l, true), probe = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => Math.floor((l.length * k) / 8));
    const s = probe.filter((i) => inside([l[i][0] + n[i][0] * 0.5, l[i][1] + n[i][1] * 0.5])).length > 4 ? -d : d;
    return l.map((q, i) => [q[0] + n[i][0] * s, q[1] + n[i][1] * s]);
  });
}

// appliqué from outlines (letters, a motif): one piece of fabric for all of it; placement, tack-down, satin, each stage
// starting a third further round so the three seams (and their locks) don't stack in one spot
function appliqued(loops, color, what, cover, trim, them = "it") {
  if (!loops.length) return [];
  const turn = (l, f) => { const k = Math.floor(l.length * f); return [...l.slice(k), ...l.slice(0, k)]; };
  return [
    { color, paths: loops.map((l) => loop(run(l, 2.5, true))), sews: `Sews the outline of ${what} on the base fabric.`, fabric: true },
    { color, pause: true, paths: loops.map((l) => turn(l, 1 / 3)).flatMap(tack),
      you: `Lay the appliqué fabric over ${cover}, right side up, covering ${them} by ½ in. Press Start. Then take the hoop off (leave everything hooped), trim the fabric close to the stitching ${trim}, and put the hoop back.`,
      sews: "Tacks the appliqué fabric down.", under: true },
    // the satin sits 0.4 mm out from the placement line, so it reaches 1.8 mm past it and covers a trim of about 1 mm
    // (centred, it reached 1.4 and holes' narrow satins 0.7); 2 mm at least in a hole, or the cut edge shows
    { color, pause: true, paths: outward(loops, 0.4).map((l) => turn(l, 2 / 3)).flatMap((l) => edgeSatin(l, 2.8, 2.0)), you: "Press Start.", sews: "Covers the raw edges with satin." },
  ];
}

// shrink a closed outline toward its centre by d mm (fine for the convex-ish frame shapes)
function inset(pts, d) {
  const n = pts.length, out = [];
  let area = 0;
  for (let i = 0; i < n; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n]; area += ax * by - bx * ay; }
  const sgn = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty) || 1;
    out.push([pts[i][0] - (sgn * ty * d) / L, pts[i][1] + (sgn * tx * d) / L]);
  }
  return out;
}

// preview options for composed steps: appliqué fabric under its satin, placement and tack-down lines hidden beneath it
export function previewLook(steps) {
  const fab = steps.findIndex((st) => st.fabric);
  return { fabricShapeBlock: fab >= 0 ? fab : undefined, fabric: "pink", hide: new Set(steps.flatMap((st, i) => (st.under ? [i] : []))) };
}

export const pieceStitches = (p) => pieceStages(p).flatMap((st) => st.paths);

function monogram(p, fab = "cotton") {
  const chars = [...(p.letters || "").replace(/\s+/g, "")].slice(0, 3);
  if (!chars.length) return [];
  // three letters sit close (the big middle one carries the shape); one or two need air between them
  const big = p.size, small = p.size * 0.68, gap = p.size * (chars.length === 3 ? 0.04 : 0.14);
  const sizes = chars.length === 3 ? [small, big, small] : chars.map(() => big);
  const ls = chars.map((c, i) => letters(c, p.font, sizes[i], styleOn(p, fab)));
  const widths = ls.map((l) => { const xs = l.parts.flatMap(([q]) => q.map((v) => v[0])); return xs.length ? Math.max(...xs) - Math.min(...xs) : 0; });
  let x = -(widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1)) / 2;
  const out = [];
  ls.forEach((l, i) => {
    const mid = (l.top + l.bottom) / 2, cx = x + widths[i] / 2;
    out.push(...lettersOn(l.parts.map(([q, m]) => [q.map(([a, b]) => [a + cx, b - mid]), m]), l.satinW, fab, l.xh));
    x += widths[i] + gap;
  });
  return out;
}

export function pieceBounds(p) {
  const pts = pieceStitches(p).flat();
  return pts.length ? bounds(pts) : null;
}

export const label = (p) => p.kind === "motif" ? `${(MOTIFS[p.motif] || MOTIFS.heart).name}` : p.kind === "text" ? `“${p.text.replace(/\s*\n\s*/g, " / ")}”` : p.kind === "letters" ? `Appliqué ${p.text}` : p.kind === "monogram" ? `Monogram ${p.letters}`
  : p.kind === "file" ? p.name : `${shapeOf(p).name}${p.border === "applique" ? " appliqué" : ""}`;

// An opened design as a piece: its stitches split into runs at jumps/trims, per colour block, centred.
export function fileBlocks(design) {
  const blocks = [];
  let cur = null, run = [];
  const flush = () => { if (run.length > 1 && cur) cur.paths.push(run); run = []; };
  design.stitches.forEach(([x, y, c], i) => {
    if (!cur) { cur = { color: design.threads[0]?.color || "#000000", name: design.threads[0]?.name || "", paths: [] }; blocks.push(cur); }
    if (c === 0) run.push([x / 10, y / 10]);
    else if (c === 1 || c === 2) { flush(); if (c === 1) run = [[x / 10, y / 10]]; }
    else if (c === 5) {
      flush();
      const t = design.threads[blocks.length] || design.threads[design.threads.length - 1] || {};
      cur = { color: t.color || "#000000", name: t.name || "", paths: [] }; blocks.push(cur);
    }
  });
  flush();
  const kept = blocks.filter((b) => b.paths.length), pts = kept.flatMap((b) => b.paths.flat());
  if (!pts.length) throw new Error("That file has no stitches.");
  const [x0, y0, x1, y1] = bounds(pts), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (const b of kept) b.paths = b.paths.map((q) => q.map(([x, y]) => [Math.round((x - cx) * 10) / 10, Math.round((y - cy) * 10) / 10]));
  return kept;
}

// the nearest frame before p in the list whose box holds p's centre, among `shapes` (any shape when omitted)
function frameAround(p, pieces, shapes) {
  const i = pieces.indexOf(p);
  return (i < 0 ? pieces : pieces.slice(0, i)).slice().reverse().find((f) => f.kind === "frame" && (!shapes || shapes.includes(f.shape))
    && Math.abs(p.x - f.x) < f.w / 2 && Math.abs(p.y - f.y) < frameH(f) / 2);
}

// Straight lettering whose centre sits inside an earlier frame shrinks to fit across it (a long name typed into
// "Name in a frame" would otherwise run over the border). Returns id -> the size it's stitched at.
export function fittedSizes(pieces) {
  const out = new Map();
  pieces.forEach((p) => {
    if (p.kind !== "text" || (p.shape && p.shape !== "straight") || (p.rot || 0) % 180) return;
    const frame = frameAround(p, pieces.filter((f) => f === p || !(f.rot || 0)));
    if (!frame) return;
    const b = pieceBounds({ ...p, x: 0, y: 0 }); if (!b) return;
    const dy = (p.y - frame.y) / (frameH(frame) / 2);
    // room across the frame at the lettering's height (narrower toward the top and bottom of round shapes)
    const round = ["circle", "oval", "scallop", "heart"].includes(frame.shape) ? Math.sqrt(Math.max(0.2, 1 - dy * dy)) : 1;
    const room = frame.w * round * (frame.shape === "diamond" ? 0.55 : 0.82) - (frame.border === "line" ? 4 : 8);
    const w = b[2] - b[0];
    if (w > room && room > 5) out.set(p.id, Math.max(5, Math.floor(p.size * (room / w) * 2) / 2));
  });
  return out;
}

// The earlier round frame arched lettering sits in, and the curve that runs it just inside that frame's border
// ("up" letters stand inside the edge, "down" letters hang from it). Null when there's no such frame.
export function followFrame(p, pieces) {
  if (p.kind !== "text" || (p.shape !== "up" && p.shape !== "down")) return null;
  const f = frameAround(p, pieces, ["circle", "oval", "scallop"]);
  if (!f) return null;
  const gap = f.border === "line" ? 4 : 6, rx = f.w / 2, ry = frameH(f) / 2;
  const l = letters(p.text, p.font, p.size, p.style), up = p.shape === "up";
  const d = up ? gap - (l.parts.length ? l.top : -p.size) : gap + (l.parts.length ? Math.max(0, l.bottom) : 0);
  return { x: f.x, y: f.y, radius: Math.round(Math.max(8, rx - d) * 2) / 2, ry: Math.round(Math.max(8, ry - d) * 2) / 2 };
}

// what the design is sewn on: changes the stitches (knit, towel) and the stabilizer advice
export const FABRICS = {
  cotton: { name: "Cotton", tip: "On woven cotton, hoop it with tear-away stabilizer underneath." },
  knit: { name: "Knit", tip: "Knits stretch: hoop them with cut-away stabilizer (fusible no-show mesh is easiest) and use a 75/11 ballpoint needle. Don't stretch the fabric while hooping." },
  towel: { name: "Towel", tip: "Lay a water-soluble topper on the towel and hoop tear-away (or cut-away) stabilizer under it. The light base sewn under the letters flattens the loops; tear the topper off afterwards." },
  felt: { name: "Felt", tip: "Felt is firm: tear-away stabilizer is enough. Use a sharp 75/11 needle." },
  denim: { name: "Denim", tip: "On denim use a 75/11 sharp or 80/12 needle (90/14 only for heavy denim and canvas) and cut-away or heavy tear-away stabilizer." },
};

// Quilting in a frame (`quilt`: stipple or echo) fills it around everything else on it, sewn right after the frame
// (after the front fabric on an in-the-hoop frame, before what goes on it). Kept for the last few layouts: it's the
// slowest thing in compose.
const QUILTED = (p) => p.kind === "frame" && (p.quilt === "stipple" || p.quilt === "echo") && p.border !== "patch";
const quilted = new Map(), lastQuilt = new Map();   // (lastQuilt: per frame, reused while a piece is being dragged)
function withQuilt(p, stages, obstacles, dragging = false) {
  // keyed on every obstacle point: moving a middle piece reused the old quilting, sewn through it
  let h = obstacles.length;
  for (const o of obstacles) for (const [x, y] of o) h = (Math.imul(h ^ Math.round(x * 10), 16777619) ^ Math.round(y * 10)) | 0;
  const edge = shapeOf(p).path(p.w, p.h).map(placer(p)), key = JSON.stringify([p, h]), frame = JSON.stringify(p);
  if (!quilted.has(key) && !(dragging && lastQuilt.has(frame))) {
    quilted.set(key, (p.quilt === "echo" ? echo : stipple)(edge, obstacles, { inset: p.border === "line" || p.border === "bold" ? 3 : 4.5 }));
    if (quilted.size > 12) quilted.delete(quilted.keys().next().value);
  }
  const paths = quilted.get(key) || lastQuilt.get(frame);
  lastQuilt.set(frame, paths); if (lastQuilt.size > 12) lastQuilt.delete(lastQuilt.keys().next().value);
  if (!paths.length) return stages;
  const q = { color: p.color, paths, sews: `Quilts the ${shapeOf(p).name.toLowerCase()} (${p.quilt}).`, label: label(p) };
  const at = stages.findIndex((s) => s.last);
  return at < 0 ? [...stages, q] : [...stages.slice(0, at), q, ...stages.slice(at)];
}

// A patch's fill cut away under what's sewn on top of it (lettering, a motif, a file): a name in satin on a full
// tatami stacked two layers of thread (stiff, and over 24 hits/mm²). The hole is what the later stitches cover,
// closed over 0.4 mm and then 0.8 mm smaller, so the fill still runs 0.4 mm under their edges. Only under something
// wide (somewhere 4 mm across) and 20 mm² or more: thin satin lettering on a fill is normal (the fill is its base),
// and cutting round every stroke broke the fill into sections (trims 3 -> 9 on a name); fine lines are never carved. Worked in the patch's own (unturned) frame.
const carved = new Map();
function carve(p, stages, above, fab) {
  const ink = above.flatMap((s) => s.paths);
  if (!ink.length) return stages;
  const a = ((p.rot || 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), f = p.flip ? -1 : 1;
  const local = ink.map((q) => q.map(([x, y]) => [((x - p.x) * c + (y - p.y) * sn) * f, -(x - p.x) * sn + (y - p.y) * c]));
  let h = local.length;
  for (const q of local) for (const [x, y] of q) h = (Math.imul(h ^ Math.round(x * 10), 16777619) ^ Math.round(y * 10)) | 0;
  const key = JSON.stringify([{ ...p, x: 0, y: 0, rot: 0 }, h, fab]);
  if (!carved.has(key)) {
    const R = 4, edge = inset(shapeOf(p).path(p.w, p.h), 1.0), [x0, y0, x1, y1] = bounds(edge);
    const w = Math.ceil((x1 - x0) * R) + 2, hh = Math.ceil((y1 - y0) * R) + 2, m = { w, h: hh, data: new Uint8Array(w * hh) };
    const dot = (x, y) => { const X = Math.round((x - x0) * R), Y = Math.round((y - y0) * R); if (X >= 0 && Y >= 0 && X < w && Y < hh) m.data[Y * w + X] = 1; };
    for (const q of local) for (let i = 1; i < q.length; i++) {
      const [ax, ay] = q[i - 1], [bx, by] = q[i], n = Math.ceil(Math.hypot(bx - ax, by - ay) * R * 2);
      for (let k = 0; k <= n; k++) dot(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
    }
    // close over 0.4 mm (satin's needle points are 0.4 apart), then keep only what's 0.8 mm inside that
    const out = { w, h: hh, data: m.data.map((v) => 1 - v) }, near = distanceTransform(out);
    const grown = { w, h: hh, data: near.map((d) => (d <= 0.4 * R ? 1 : 0)) }, deep = distanceTransform(grown);
    // only well inside the patch's outline (a hole crossing it would add fill outside it, even-odd)
    const inside = { w, h: hh, data: new Uint8Array(w * hh) };
    for (let y = 0; y < hh; y++) {
      const Y = y0 + y / R, cut = [];
      for (let i = 0; i < edge.length; i++) { const [ax, ay] = edge[i], [bx, by] = edge[(i + 1) % edge.length]; if ((ay <= Y) !== (by <= Y)) cut.push(ax + ((Y - ay) * (bx - ax)) / (by - ay)); }
      cut.sort((u, v) => u - v);
      for (let k = 0; k + 1 < cut.length; k += 2) for (let x = Math.max(0, Math.ceil((cut[k] - x0) * R)); x <= Math.min(w - 1, Math.floor((cut[k + 1] - x0) * R)); x++) inside.data[y * w + x] = 1;
    }
    const room = distanceTransform(inside);
    const hole = { w, h: hh, data: deep.map((d, i) => (d > 0.8 * R && room[i] > 1.5 * R ? 1 : 0)) };
    // only under something wide: a piece of hole that's somewhere 4 mm across (a filled motif, a bold monogram)
    const { labels, count } = labelMask(hole), wide = new Uint8Array(count + 1);
    for (let i = 0; i < labels.length; i++) if (labels[i] && deep[i] > 2.4 * R) wide[labels[i]] = 1;   // (4 mm, grown 0.4 a side: 2.4 from the middle to the edge)
    for (let i = 0; i < labels.length; i++) if (labels[i] && !wide[labels[i]]) hole.data[i] = 0;
    const holes = contours(hole).map((l) => l.map(([x, y]) => [x0 + x / R, y0 + y / R]))
      .filter((l) => l.length > 8 && Math.abs(l.reduce((s, q, i) => s + q[0] * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * q[1], 0)) / 2 >= 20);
    carved.set(key, holes.length ? patchFill(p, [edge, ...holes], fab) : null);
    if (carved.size > 12) carved.delete(carved.keys().next().value);
  }
  const fill = carved.get(key); if (!fill) return stages;
  const place = placer(p), placed = fill.map((st) => ({ ...st, label: label(p), paths: st.paths.map((q) => q.map(place)) }));
  return [...placed, ...stages.filter((s) => !s.patchFill)];
}

// Bigger than the hoop: split into two hoopings by whole pieces (never through a stitch), along the design's long
// side, at the most even cut where both halves fit. Two basting crosses on the cut line line the second hooping up
// with the first: sewn at the end of the first and again at the start of the second. null when it can't be done
// (one piece is bigger than the hoop by itself, or no cut leaves both halves small enough).
export function splitPieces(pieces, hoop) {
  const lw = hoop.w - 2 * MARGIN - 2, lh = hoop.h - 2 * MARGIN - 2;
  const items = pieces.map((p) => ({ p, b: pieceBounds(p) })).filter((it) => it.b);
  if (items.length < 2) return null;
  const all = [Math.min(...items.map((i) => i.b[0])), Math.min(...items.map((i) => i.b[1])), Math.max(...items.map((i) => i.b[2])), Math.max(...items.map((i) => i.b[3]))];
  for (const ax of all[2] - all[0] - lw > all[3] - all[1] - lh ? [0, 1] : [1, 0]) {
    const L = ax ? lh : lw, C = ax ? lw : lh, lo = ax ? 1 : 0, hi = ax ? 3 : 2, c0 = all[ax ? 0 : 1], c1 = all[ax ? 2 : 3];
    if (c1 - c0 > C) continue;
    const sorted = items.slice().sort((a, b) => a.b[lo] + a.b[hi] - b.b[lo] - b.b[hi]);
    let best = null;
    for (let k = 1; k < sorted.length; k++) {
      const A = sorted.slice(0, k), B = sorted.slice(k);
      const aLo = Math.min(...A.map((i) => i.b[lo])), aHi = Math.max(...A.map((i) => i.b[hi])), bLo = Math.min(...B.map((i) => i.b[lo])), bHi = Math.max(...B.map((i) => i.b[hi]));
      // the crosses sit between the halves, as near the middle of the gap as both hoopings allow (each must hold them)
      const uLo = bHi - L + 5, uHi = aLo + L - 5;
      if (uLo > uHi || aHi - aLo > L || bHi - bLo > L) continue;
      const m = Math.min(uHi, Math.max(uLo, (aHi + bLo) / 2));
      const spanA = Math.max(aHi, m + 5) - Math.min(aLo, m - 5), spanB = Math.max(bHi, m + 5) - Math.min(bLo, m - 5);
      if (spanA > L || spanB > L) continue;
      if (!best || Math.max(spanA, spanB) < best.worst) best = { worst: Math.max(spanA, spanB), A, B, m };
    }
    if (!best) continue;
    const at = (u, v) => (ax ? [v, u] : [u, v]), marks = [at(best.m, c0 + (c1 - c0) * 0.25), at(best.m, c0 + (c1 - c0) * 0.75)];
    return [{ pieces: best.A.map((i) => i.p), marks, end: true }, { pieces: best.B.map((i) => i.p), marks, end: false }];
  }
  return null;
}
// basting crosses (long stitches, easy to pull out), each starting and ending at its centre
const crosses = (marks) => marks.map(([x, y]) => [[x, y], [x + 5, y], [x - 5, y], [x, y], [x, y + 5], [x, y - 5], [x, y]]);

// Sew the pieces in list order. Neighbouring stages in the same thread share one colour block unless a stage
// needs a pause. A stage in a thread used earlier moves up to join it (one pause fewer) when it overlaps nothing
// it would jump ahead of, so what lies on top of what never changes; appliqué stages never move.
// Returns the design and the steps to show (what the machine sews, what the person does at pauses).
// opts: { fabric: key of FABRICS, baste: a basting box round everything first (floating, towels), dragging (a piece
//         is mid-drag: quilting stays as it was, for speed; the drop composes it properly),
//         marks: { pts, end } alignment crosses for a split design (end: after everything, else first) }
export function compose(pieces, hoop, opts = {}) {
  const fab = FABRICS[opts.fabric] ? opts.fabric : "cotton";
  const fit = fittedSizes(pieces);
  pieces = pieces.map((p) => (fit.has(p.id) ? { ...p, size: fit.get(p.id) } : p));
  const box = (paths) => { const [x0, y0, x1, y1] = bounds(paths.flat()); return [x0 - 1, y0 - 1, x1 + 1, y1 + 1]; };
  const hits = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const order = [], last = [], staged = pieces.map((p) => pieceStages(p, fab).map((st) => ({ ...st, label: label(p) })));
  pieces.forEach((p, i) => { if (QUILTED(p)) staged[i] = withQuilt(p, staged[i], staged.filter((_, j) => j !== i).flat().flatMap((s) => s.paths), opts.dragging); });
  // patches: no fill under what's sewn on them (fine-line lettering excepted)
  pieces.forEach((p, i) => {
    if (p.kind !== "frame" || p.border !== "patch" || opts.dragging) return;
    const above = pieces.slice(i + 1).flatMap((q, k) => (q.kind === "frame" || q.style === "line" ? [] : staged[i + 1 + k].filter((s) => !s.under && !s.fabric)));
    staged[i] = carve(p, staged[i], above, fab);
  });
  for (const st of staged.flat()) {
    if (!st.paths.length) continue;
    const s = { ...st, box: box(st.paths) };
    if (s.last) { last.push(s); continue; }   // two-sided in-the-hoop edge: after everything that goes on the front
    let at = order.length;
    if (!s.pause && !s.fabric) {
      for (let j = order.length - 1; j >= 0; j--) {
        if (order[j].color === s.color && !order[j].fabric && !order[j].under) { at = j + 1; break; }
        if (hits(order[j].box, s.box) || order[j].pause) break;
      }
    }
    if (at < order.length) s.early = true;
    order.splice(at, 0, s);
  }
  order.push(...last);
  if (opts.marks && order.length) {
    const color = opts.marks.end ? order[order.length - 1].color : order[0].color, paths = crosses(opts.marks.pts);
    if (opts.marks.end) order.push({ color, paths, label: "Alignment crosses", sews: "Sews two alignment crosses where the next hooping lines up." });
    else order.unshift({ color, paths, label: "Alignment crosses", pause: true,
      you: "Hoop the fabric again, as straight as you can, with both crosses from the first hooping inside the hoop. Before you press Start, use the machine's layout arrows to move the design until the needle comes down on the centre of the left cross (turn the handwheel to check). Press Start: the crosses should sew right on top of the old ones. If they don't, stop, move the design and try again.",
      sews: "Sews the alignment crosses again, on top of the first ones.", after: "Pull out the alignment crosses (they're long stitches; snip and pull)." });
  }
  if (opts.baste && order.length) {
    // long stitches 9 mm round everything (as far as the hoop allows), centred on the design so it stays centred;
    // part of the first block, so it needs no stop of its own
    const b = box(order.flatMap((s) => s.paths)), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const hw = Math.min((b[2] - b[0]) / 2 + 9, hoop.w / 2 - MARGIN - 1), hh = Math.min((b[3] - b[1]) / 2 + 9, hoop.h / 2 - MARGIN - 1);
    const rect = [[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh], [cx - hw, cy - hh]];
    // side by side, so the corners stay square
    const sides = rect.slice(1).flatMap((q, i) => run([rect[i], q], 4).slice(i ? 1 : 0));
    order[0] = { ...order[0], paths: [sides, ...order[0].paths], sews: "Sews a basting box to hold everything flat. " + order[0].sews };
  }
  const d = new Design(hoop), steps = [], after = [], before = [];
  let thread = null;
  for (const st of order) {
    if (st.after && !after.includes(st.after)) after.push(st.after);
    if (st.before && !before.includes(st.before)) before.push(st.before);
    if (st.color !== thread || st.pause || st.fabric) {
      d.color(st.color, st.label); thread = st.color;
      steps.push({ color: st.color, sews: [], you: st.you || (steps.length ? "Change to the next thread and press Start." : null),
        fabric: !!st.fabric, under: !!st.under || !!st.fabric, early: false, cut: st.fabric && !st.nocut ? st.paths : null });
    }
    steps[steps.length - 1].sews.push(st.sews);
    if (st.early) steps[steps.length - 1].early = true;
    // something you'd see joining a tack-down (quilting, lettering in the same thread) shows the block in the preview;
    // the tack line sits at the edge, under the satin that comes later
    const cur = steps[steps.length - 1];
    if (cur.under && !st.under && !st.fabric) cur.under = false;
    for (const q of st.paths) d.path(q);
  }
  if (!steps.length) throw new Error("Add some lettering or a frame to start.");
  if (opts.baste) after.push("Unpick the basting box (snip every few stitches on the back, then pull it out from the front).");
  d.finish();
  return { design: d, steps, after, before, tip: FABRICS[fab].tip };
}
