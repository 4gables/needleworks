/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Design tab: pieces (lettering, monogram, frame, appliqué letters, motif, opened file) -> stitches, laid out around
// the hoop centre (mm, y down).
// Uses the shared lettering and stitch engines and returns a Design; the PES file is written by the locked
// writer in js/core/formats.js, which nothing here touches.
import { Design } from "../core/design.js";
import { DENSITY, FILL_PATTERNS, fillPolygon } from "../core/digitize.js";
import { APPLIQUE_FONTS, FONTS, fontOf } from "../core/fonts.js";
import { MARGIN } from "../core/machines.js";
import { bounds, edgeWalk, filletPolygon, followRun, normals, run, satin, zigzag } from "../core/geom.js";
import { counterPockets, distanceTransform, order } from "../core/raster.js";
import { strokes } from "../core/text.js";
import { MOTIFS } from "./motifs.js";
import { letterOutlines, motifOutlines } from "./outline.js";
import { QUILTS, contours, echo, stipple } from "./quilt.js";

// ---------- lettering ----------
const lettering = new Map();   // font + text -> centre-line strokes (rendering is the slow part)
// Nothing drawn before its font has loaded is cached: it was drawn in the browser's fallback font, and caching it
// kept that lettering after the font arrived.
const fontReady = (family) => !family || typeof document === "undefined" || document.fonts.check(`40px "${family}"`);
function letterStrokes(text, family, spacing = 0, kern = null) {
  const key = family + "\n" + text + "\n" + spacing + (kern ? "\n" + kern.join() : "");
  if (lettering.has(key)) return lettering.get(key);
  const print = !!fontOf(family).print;
  // (knots: junctions joined by a stroke shorter than 0.75 of its width become one; `skeletonEdges`)
  const { edges, info } = strokes(text, family, { knots: 0.75, ...(print ? { deco: "dash", join: false } : { tongues: true }), ...(spacing ? { spacing } : {}), ...(kern ? { kern } : {}) });
  // (each counter with the strokes round its widest spot: the ones within a pixel and a half of that circle)
  const lines = edges.map((e) => e[2]), near = (p, [x, y]) => Math.min(...p.map((q) => Math.hypot(q[0] - x, q[1] - y)));
  const counters = counterPockets(info.mask, lines, info.stroke).map((c) => ({ ...c, edges: lines.flatMap((p, i) => (near(p, c.at) <= c.peak + 1.5 ? [i] : [])) }));
  // (a corner's ink width across it, px, from the junction out: `taper`)
  const tapers = edges.map((e) => (e[3] ? { start: e[2][0], w: e[3], atEnd: e[3][0] >= e[3][e[3].length - 1], cos: e[4] } : null));
  // (how the ink ends round a loose end, px: `endShape` in raster.js)
  const ends = edges.map((e) => (e[5] ? { start: e[2][0], ...e[5] } : null));
  const sides = edges.map((e) => (e[6] ? { start: e[2][0], w: e[6], path: e[2] } : null));
  const out = { comps: order(edges), info, counters, notches: notches(edges, info.stroke), tapers, ends, sides };
  if (fontReady(family)) {
    lettering.set(key, out);
    if (lettering.size > 60) lettering.delete(lettering.keys().next().value);
  }
  return out;
}

// Letters as [pts, "run"|"satin"] in mm: `size` is the height of the lettering, baseline at y = 0, centred across.
// `kern`: room after each letter (fractions of the size), for the text as given (one line, already trimmed)
function letters(text, family, size, style = "auto", spacing = 0, kern = null) {
  text = (text || "").replace(/\s*\n\s*/g, " ").trim();
  if (!text) return { parts: [], satinW: 0 };
  const { comps, info, counters, notches, tapers, ends, sides } = letterStrokes(text, family, spacing, kern && kern.some((v) => v) ? kern : null);
  const all = comps.flatMap((c) => c.flatMap(([p]) => p));
  if (!all.length) return { parts: [], satinW: 0 };
  // (sized by the strokes before their loose ends reached out to the ink's edge, so a word keeps its size)
  const [x0, y0, x1, y1] = bounds(info.sized), s = size / Math.max(y1 - y0, 1e-9), cx = (x0 + x1) / 2;
  // (print letters: the third entry marks the first stroke of each separate piece after the first, so the needle jumps
  // to it and never stitches across, however close: an i's stem reaching up to its dot was sewn to it)
  const print = !!fontOf(family).print;
  // A satin column as wide as the font's own stroke but at least 15% of the x-height up to 1.2 mm, and 12% beyond
  // (thin scripts and monoline fonts get a satin sized to the letters; 15% on big letters doubled thin scripts like
  // Alex Brush and filled their e's), never more than a fifth of it or 3.5 mm. From 0.8 mm it's satin (narrow
  // columns get a centre-run underlay), as sold lettering is down to a 5 mm x-height; under that a fine line, which
  // keeps small loops open. (Until 2026-10-30: at least 12% and satin only from 1 mm, so script names 20 mm tall in
  // Sacramento or Great Vibes sewed as a thin line.)
  const stroke = info.stroke * s, xh = info.mid * s;
  const w = Math.min(3.5, xh * 0.2, Math.max(stroke, xh * 0.12, Math.min(xh * 0.15, 1.2)));
  const satinW = style === "line" ? 0 : style === "satin" ? Math.max(1.0, w) : w >= 0.8 ? w : 0;
  // Strokes round a counter are narrowed so it stays open (`counterCaps`; not when satin is asked for: "Make it bold"
  // says small loops may fill). The fourth entry is that stroke's column, or 0 for the word's.
  const caps = style === "satin" || !satinW ? new Map() : notchCaps(notches, s, satinW, counterCaps(counters, s, satinW));
  // (the fifth entry: a corner's taper, { atEnd: the point is at the end of this stroke, prof: [mm from the point,
  // the ink's width across there in mm], nearest the point first, k })
  const taperOf = (p, e) => {
    const t = tapers[e];
    if (!t) return null;
    const same = p[0][0] === t.start[0] && p[0][1] === t.start[1], q = same ? p : p.slice().reverse(), w = t.w;
    // (q and w now run the edge's own way; its point is at the end when t.atEnd)
    const idx = t.atEnd ? q.map((_, i) => q.length - 1 - i) : q.map((_, i) => i), prof = [];
    let d = 0;
    idx.forEach((i, m) => { if (m) d += Math.hypot(q[i][0] - q[idx[m - 1]][0], q[i][1] - q[idx[m - 1]][1]) * s; prof.push([d, w[i] * s]); });
    // (cut: how much narrower the point is across where the strokes into it are sewn narrower than the font's: each
    // stroke's edge comes in by half the difference, which across the point is that over the cosine of its angle)
    return { atEnd: same ? t.atEnd : !t.atEnd, prof, cut: satinW ? Math.max(0, stroke - satinW) / Math.max(0.5, t.cos || 1) : 0 };
  };
  // (the sixth entry: the stroke's ends, { first, last }: [[mm from the end, slant, side, other side], ...] with the
  // sides as the stroke's own path runs (its normal's side first), or null)
  const endsOf = (p, e) => {
    const t = ends[e];
    if (!t) return null;
    const same = p[0][0] === t.start[0] && p[0][1] === t.start[1];
    const mm = (rows, flip) => rows && rows.map(([d, k, a, b]) => [d * s, k, (flip ? b : a) * s, (flip ? a : b) * s]);
    // (at the path's last point it runs out toward the end, as raster measured it; at its first point it runs in, so
    // the normal is the other side)
    return same ? { first: mm(t.a, true), last: mm(t.b, false) } : { first: mm(t.b, true), last: mm(t.a, false) };
  };
  // (the seventh: the ink either side of the stroke's line, [[fraction along, side, other side] (mm), ...] as its
  // path runs, nulls where the line is off the ink)
  const sidesOf = (p, e) => {
    const t = sides[e];
    if (!t) return null;
    const same = p[0][0] === t.start[0] && p[0][1] === t.start[1], q = t.path, at = [0];
    for (let i = 1; i < q.length; i++) at.push(at[i - 1] + Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]));
    const L = at[at.length - 1] || 1;
    const rows = t.w.map((v, i) => [same ? at[i] / L : 1 - at[i] / L, v && (same ? v[0] : v[1]) * s, v && (same ? v[1] : v[0]) * s]);
    return same ? rows : rows.reverse();
  };
  const parts = comps.flatMap((c, k) => c.map(([p, mode, e], j) => [p.map(([x, y]) => [(x - cx) * s, (y - info.baseline) * s]), mode, print && k > 0 && j === 0, caps.get(e) || 0, taperOf(p, e), endsOf(p, e), sidesOf(p, e)]));
  const open = Math.min(satinW || Infinity, ...caps.values());
  const pockets = counters.map((c) => ({ peak: c.peak * s, saddle: c.saddle * s }));
  return { parts, satinW, xh, stroke, open, pockets, top: (y0 - info.baseline) * s, bottom: (y1 - info.baseline) * s };
}
// Columns (mm, by stroke) narrower than the word's `w` where a counter would otherwise close: every counter
// (`counterPockets`, px, scaled by s) stays at least 0.8 mm open between the needle points once pull comp is added
// (0.3 mm from a 1.5 mm column, else 0.1), or keeps its way out 0.4 mm open. Only the strokes round it narrow, so
// the rest of the word keeps its weight. Yellowtail's l loop sewed as a slit at 20 mm (a 1.85 mm column round a loop
// 2.8 mm across). Loops that even a 0.8 mm column would close (Great Vibes' s, 0.55 mm at 25 mm) are left to fill,
// as they do in sold lettering at that size.
const OPEN = 0.8;
function counterCaps(counters, s, w) {
  const caps = new Map();
  for (const c of counters) {
    const peak = c.peak * s, saddle = c.saddle * s;
    if (peak < 0.6) continue;   // (a 0.8 mm column leaves it under 0.3 mm)
    const r = Math.max(saddle - 0.2, peak - OPEN / 2);   // the column's half-width it allows, pull included
    const cap = Math.max(0.8, 2 * r - 0.3 >= 1.5 ? 2 * r - 0.3 : Math.min(1.49, 2 * r - 0.1));   // (never under satin's 0.8: as open as it can be)
    if (cap < w) for (const e of c.edges) caps.set(e, Math.min(caps.get(e) ?? w, cap));
  }
  return caps;
}
// Short loose strokes (under 3 stroke widths: an e's tongue, a flick) and how close their centre line comes to any
// other stroke (px) away from the junction they leave: the notch between them (Yellowtail's e is a c with a tongue
// curled in under its top; sewn full width, the eye between them was a 0.3-0.5 mm sliver and the e read as c)
function notches(edges, stroke) {
  const deg = new Map();
  for (const [a, b] of edges) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
  const out = [];
  edges.forEach(([a, b, p], i) => {
    if (a === b || p.length < 2) return;
    const free = deg.get(a) === 1 ? a : deg.get(b) === 1 ? b : null, len = p.reduce((t, q, k) => (k ? t + Math.hypot(q[0] - p[k - 1][0], q[1] - p[k - 1][1]) : 0), 0);
    if (free === null || deg.get(free === a ? b : a) < 3 || len > 3 * stroke) return;
    const j = free === a ? p[p.length - 1] : p[0], away = (q) => Math.hypot(q[0] - j[0], q[1] - j[1]) > stroke;
    let d = Infinity;
    for (const q of p) if (away(q)) for (const [, , r] of edges) if (r !== p) for (const t of r) if (away(t)) d = Math.min(d, Math.hypot(q[0] - t[0], q[1] - t[1]));
    if (d < Infinity) out.push({ edge: i, d });
  });
  return out;
}
// A loose stroke that would close its notch (under 0.8 mm between the needle points, pull included) sews narrower,
// down to 0.8 mm: the rest of the letter keeps its weight
function notchCaps(notches, s, w, caps) {
  for (const { edge, d } of notches) {
    const cap = Math.max(0.8, 2 * (d * s - w / 2 - 0.3 - OPEN));
    if (cap < w) caps.set(edge, Math.min(caps.get(edge) ?? w, cap));
  }
  return caps;
}
// (tests and the editor: the column a piece's lettering sews with, and why)
export const letterMetrics = (text, family, size, style) => { const { parts, ...m } = letters(text, family, size, style); return m; };

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
  return parts.map(([p, ...r]) => [densify(p, 1).map(f), ...r]);
}
// The tightest radius of curvature (mm) under an arched word: (a^2 cos^2 t + b^2 sin^2 t)^1.5 / ab, walking the word's
// half span from the middle of the arch.
function archRho(p, l) {
  const a = Math.max(p.radius, 8), b = Math.max(p.ry ?? p.radius, 8), xs = l.parts.flatMap(([q]) => q.map((v) => v[0]));
  const span = Math.max(...xs.map(Math.abs));
  let s = 0, t = p.shape === "up" ? 0 : Math.PI, rho = Infinity;
  while (s <= span && Math.abs(t) < Math.PI * 2) {
    const v = Math.hypot(a * Math.cos(t), b * Math.sin(t));
    rho = Math.min(rho, v ** 3 / (a * b)); s += v * 0.01; t += 0.01;
  }
  return rho;
}
// Arched lettering whose letters reach further inside the curve than ~0.8 x its radius of curvature (somewhere
// under the word) crowd into a knot there: "down" letters point inward, "up" ones only dip in with descenders. Letters
// over the top taller than 0.6 x the radius fan out so far that their feet crowd together: Great Vibes "Oliver" 28 mm
// on the bib's 32 mm arch bunched "iver" with no warning.
export function archTight(p) {
  if (p.kind !== "text" || (p.shape !== "up" && p.shape !== "down")) return false;
  const l = letters(p.text, p.font, p.size, p.style);
  if (!l.parts.length) return false;
  const rho = archRho(p, l);
  return p.shape === "up" ? l.bottom > 0.8 * rho || -l.top > 0.6 * rho : -l.top > 0.8 * rho;
}
// The curve (radius, ry) an arched word needs to be neither tight nor wrapped too far round: the arch grown in 5% steps
// (up to 4x), or null when it's fine as it is.
export function archFit(p) {
  if (p.kind !== "text" || (p.shape !== "up" && p.shape !== "down") || (!archTight(p) && !archRoom(p))) return null;
  for (let k = 1.05; k < 4; k *= 1.05) {
    const q = { ...p, radius: Math.round(p.radius * k), ...(p.ry != null ? { ry: Math.round(p.ry * k) } : {}) };
    if (!archTight(q) && !archRoom(q)) return { radius: q.radius, ...(p.ry != null ? { ry: q.ry } : {}) };
  }
  return null;
}
// The other way round: the letter size (whole mm, down to the smallest that stitches cleanly) that fits the curve as
// it is, or 0. (Widening the curve can make the design bigger than the hoop: a 4-word arch at radius 80, 198 mm.)
export function archShrink(p) {
  if (p.kind !== "text" || (p.shape !== "up" && p.shape !== "down") || (!archTight(p) && !archRoom(p))) return 0;
  for (let s = Math.ceil(p.size) - 1; s >= 5; s--) {
    const q = { ...p, size: s };
    if (minSize(q)) return 0;
    if (!archTight(q) && !archRoom(q)) return s;
  }
  return 0;
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
  // (`full`: more than the whole way round, so the ends overlap; not a curve setting)
  return Object.defineProperty({ radius: Math.round(a * k), ry: Math.round(b * k) }, "full", { value: span > per * 0.95 });
}
// The first other piece whose stitches come within CLEAR of p's (lettering run into a heart, say), or null. Patches
// are left out: lettering on a filled patch is meant to sit on it.
// Measured between the needle points, every 0.5 mm along the stitch lines, at the size each piece is sewn (lettering
// fitted into a frame at its fitted size). 1.5 mm between needle points leaves ~1 mm of fabric between the threads:
// a bib name 1.0 mm from the heart's satin looked sewn into it, 2 mm reads clear. (Until 2026-10-30 points were
// rounded to whole mm and the cells either side checked: anything up to ~2.8 mm away "ran into" it, a key fob R the
// app had just fitted, 2 mm clear of the satin.)
const CLEAR = 1.5;
export function touching(p, pieces) {
  if (p.kind === "frame") return null;
  const fit = fittedSizes(pieces), sewn = (o) => (fit.has(o.id) ? { ...o, size: fit.get(o.id) } : o);
  const mine = cloud(pieceStitches(p));
  for (const o of pieces) {
    if (o === p || o.id === p.id || (o.kind === "frame" && o.border === "patch")) continue;
    if (near(mine, pieceStitches(sewn(o)), CLEAR)) return o;
  }
  return null;
}
// the first piece that runs into another, and what it runs into ([p, q]), or null
export function collision(pieces) {
  const fit = fittedSizes(pieces);
  for (const p of pieces) { const q = touching(fit.has(p.id) ? { ...p, size: fit.get(p.id) } : p, pieces); if (q) return [p, q]; }
  return null;
}
// the biggest size (0.5 mm steps, down to 60 %, never too small to stitch) at which p clears `other`, or 0
export function clearSize(p, pieces, other) {
  const from = fittedSizes(pieces).get(p.id) ?? p.size;
  for (let s = Math.ceil(from * 2) / 2 - 0.5; s >= Math.max(5, from * 0.6); s -= 0.5) {
    const q = { ...p, size: s };
    if (minSize(q)) return 0;
    if (!near(cloud(pieceStitches(q)), pieceStitches(other), CLEAR)) return s;
  }
  return 0;
}
// points every 0.5 mm along stitch paths, in 1 mm cells
function cloud(paths) {
  const m = new Map();
  for (const q of paths) for (let i = 0; i < q.length; i++) {
    const [ax, ay] = q[i], [bx, by] = q[i + 1] || q[i], n = i + 1 < q.length ? Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5)) : 1;
    for (let k = 0; k < n; k++) {
      const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n, key = Math.floor(x) * 8192 + Math.floor(y);
      let c = m.get(key); if (!c) m.set(key, (c = [])); c.push(x, y);
    }
  }
  return m;
}
// do any of `paths` come within d mm of the points in cloud `c`?
function near(c, paths, d) {
  const r = Math.ceil(d);
  for (const pts of cloud(paths).values()) for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i], y = pts[i + 1], X = Math.floor(x), Y = Math.floor(y);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const o = c.get((X + dx) * 8192 + Y + dy); if (!o) continue;
      for (let j = 0; j < o.length; j += 2) if ((o[j] - x) ** 2 + (o[j + 1] - y) ** 2 < d * d) return true;
    }
  }
  return false;
}
// width and height (mm) of everything sewn, at the sizes it's sewn
export function layoutSize(pieces) {
  const fit = fittedSizes(pieces), bs = pieces.map((p) => pieceBounds(fit.has(p.id) ? { ...p, size: fit.get(p.id) } : p)).filter(Boolean);
  if (!bs.length) return [0, 0];
  return [Math.max(...bs.map((b) => b[2])) - Math.min(...bs.map((b) => b[0])), Math.max(...bs.map((b) => b[3])) - Math.min(...bs.map((b) => b[1]))];
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
  const zz = fab === "knit" ? 1.5 : 2.5, pull = fab === "knit" ? 0.3 : 0;
  const density = wt === "auto" ? (fab === "knit" ? 0.42 : small ? 0.34 : 0.38) : THREADS[wt].satin + (fab === "knit" ? 0.04 : 0);
  let gap = false;   // (a skipped stroke hands its jump on to the next one sewn)
  return parts.map(([p0, mode, g, cap, taper, ends, sides]) => {
    // (a corner is narrowed to the ink, and stops where that's under the narrowest column: not on a towel, which
    // keeps its wide columns, nor in a fine line; its centre run goes on to where the point is)
    const w = cap && fab !== "towel" ? Math.min(cap, satinW) : satinW;   // (a towel keeps its wide column)
    const tp = taper && satinW && fab !== "towel" ? tapered(p0, taper) : null, p = tp ? (mode === "run" ? tp.run : tp.p) : p0;
    const shaped = satinW && fab !== "towel" && !tp, clip = shaped && sides ? sideClip(p, sides, w) : null;
    const en = shaped && ends ? endCut(p, ends, w, clip) : clip ? { p, shape: clip, first: 0, last: 0 } : null;
    const q = en && mode !== "run" ? en.p : p;
    const r = q.length < 2 ? [] : sewPart(q, mode, w, tp ? tp.wAt || CENTRE : null, p0, en);
    gap ||= !!g;
    if (gap && r.length) { r.gap = true; gap = false; }
    // (a run satined back over: a lock at its start goes 1 mm in along the stroke, under that satin; never past halfway)
    if (mode === "run" && satinW && r.length > 2) r.lockAt = along(p, Math.min(1, length(p) / 2));
    return r;
  });
  function sewPart(p, mode, satinW, wAt = null, self = p, en = null) {
    // thin lettering: a stroke under ~0.6 mm is a speck of the skeleton; skip it (the next stroke picks up there),
    // unless it stands alone: that's a dot (a full stop, an i's dot) and sews as a 0.7 mm stroke out and back
    // (small print lettering lost its full stops: "Sam R." sewed as "Sam R")
    // (up to 0.9 mm: a stroke that short sews as one point in a fine line, so a full stop of 0.6-0.9 mm vanished too)
    if (!satinW && length(p) < 0.9) {
      const c = p[p.length >> 1];
      // (a lone stroke comes twice, out and back: the other short copy isn't a neighbour, and the dot sews once)
      if (parts.some(([q]) => q !== self && length(q) >= 0.9 && q.some(([x, y]) => Math.hypot(x - c[0], y - c[1]) < 0.5))) { if (length(p) < 0.6) return []; }
      else if (mode === "run") return [];
      else {
      const a = p[0], b = p[p.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, u = L > 0.01 ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : [1, 0];
      const e1 = [c[0] - u[0] * 0.35, c[1] - u[1] * 0.35], e2 = [c[0] + u[0] * 0.35, c[1] + u[1] * 0.35];
      return [e1, e2, e1, e2];
      }
    }
    // a satin dot (an i's, a full stop: a lone stroke shorter than the column) is one short satin, 1 mm long at least
    // and with no run under it: its lock in, run, satin and lock off all fell in one square mm, the densest spot in
    // the file (Sacramento's i at 14 mm: 24 hits/mm², at the limit)
    if (satinW && length(p) < satinW) {
      const c = p[p.length >> 1];
      if (!parts.some(([q]) => q !== self && length(q) >= satinW && q.some(([x, y]) => Math.hypot(x - c[0], y - c[1]) < satinW))) {
        if (mode === "run") return [];
        const a = p[0], b = p[p.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = L > 0.01 ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : [1, 0];
        const h = Math.max(L, 1) / 2, e1 = [c[0] - u[0] * h, c[1] - u[1] * h], e2 = [c[0] + u[0] * h, c[1] + u[1] * h];
        return [e1, ...satin([e1, c, e2], satinW, density, 0.1 + pull)];
      }
    }
    // the way out under a satin: a centre run, or a zigzag under wide columns (Ink/Stitch fonts' usual underlay), 0.4 mm
    // inside each edge so it never shows past the satin (it ends back on the centre line: ending on an edge left the
    // satin's start 2.4 mm away, a jump and trim)
    // (a tapered corner: a centre run, as the zigzag would stick out of the point)
    // (a shaped end: the zigzag stops where the end's shaping starts, and a centre run goes on from there)
    if (mode === "run" && satinW >= zz && !wAt && en && (en.first || en.last)) {
      const L = length(p), [d0, d1] = [en.first, L - en.last], mid = d1 - d0 > 1 ? slice(p, d0, d1) : null;
      if (!mid) return run(p, 1.2);
      const zz2 = zigzag(mid, Math.max(satinW - 0.8, satinW * 0.5), 2.5);
      return [...(d0 > 0 ? run(slice(p, 0, d0), 1.2) : [p[0]]), ...zz2, ...(d1 < L ? run(slice(p, d1, L), 1.2) : [p[p.length - 1]])];
    }
    if (mode === "run") return satinW >= zz && !wAt ? [p[0], ...zigzag(p, Math.max(satinW - 0.8, satinW * 0.5), 2.5), p[p.length - 1]] : satinW ? run(p, 1.2) : spaced(followRun(p, 1.6, 0.1, 0.8));
    // pull comp 0.15 mm a side; 0.05 on thin columns (more widens them enough to close small counters). It starts
    // from the centre: two satins back to back at a junction ended and began on opposite edges, a column's width
    // apart (2.4 mm on a 24 mm name), which was a jump and a trim: 11 needless trims on "Ashley" in Yellowtail.
    if (satinW) return [p[0], ...satin(p, satinW, density, (satinW >= 1.5 ? 0.3 : 0.1) + pull, false, false, wAt, en?.shape)];
    const r = spaced(followRun(p, 1.6, 0.1, 0.8)), back = r.slice().reverse();   // the walk's way back: back, forth and back again
    return r.length > 1 ? [...r, ...back.slice(1), ...r.slice(1)] : r;
  }
}
// A corner (`taper` from letters): the font's point, sewn as a column as wide as the point is across less `cut` (the
// strokes into it are sewn narrower than the font's, so their edges meet that much nearer the junction), trimmed where
// that's under TIP mm; the centre run under it goes on to where the narrower point would be. A full-width column ran
// to the font's own tip and its square end stuck out (Quicksand "WILD" at 43.5 mm: 4-5 mm stubs at the W's points).
// (Until round 6 the point was shrunk about the junction by satin / stroke and stopped at 0.8 mm across: at 10 mm
// Josefin's V and W points stopped 1-1.5 mm short of the ink's.)
const CENTRE = () => Infinity;   // (a corner's run with no column left over it: still only a centre run)
const TIP = 0.4;   // (the narrowest column's stitches, pull comp added: 0.5 mm, clear of the 0.3 mm tiny stitch)
function tapered(p, { atEnd, prof, cut: red }) {
  const wd = (d) => { let i = 1; while (i < prof.length - 1 && prof[i][0] < d) i++; const [d0, w0] = prof[i - 1], [d1, w1] = prof[i] || prof[i - 1]; return d1 > d0 ? w0 + ((w1 - w0) * Math.min(1, Math.max(0, (d - d0) / (d1 - d0)))) : w1; };
  const q = atEnd ? p.slice().reverse() : p.slice();   // (from the point in)
  const L = length(q);
  // (mm in from the font's point: where the narrower point is, and where it's TIP across)
  let tip = 0, cut = 0;
  for (const [d, w] of prof) { if (w - red > 0) break; tip = d; }
  for (const [d, w] of prof) { if (w - red >= TIP) break; cut = d; }
  const from = (d) => { let walked = 0; return [along(q, d), ...q.filter((v, i) => (walked += i ? Math.hypot(v[0] - q[i - 1][0], v[1] - q[i - 1][1]) : 0) > d)]; };
  const own = (r) => (atEnd ? r.reverse() : r);
  const runP = L - tip < 0.3 ? [] : own(from(tip));
  if (L - cut < 0.3) return { p: [], run: runP, wAt: null };
  const M = L - cut;
  // t runs along the column (the stroke's own direction): from the point when it starts there
  return { p: own(from(cut)), run: runP, wAt: (t) => wd(cut + (atEnd ? 1 - t : t) * M) - red };
}
// A loose end's shape (`ends` from letters) for a column of width w: each stitch reaches only as far as the ink does
// either side, plus what the column has over the ink there anyway (it may be wider than the font), and slants onto a
// cut the font made on a slant; the column stops where its stitches would be under TIP. Returns the column's path,
// the shape for `satin` and how far in from each end the shaping goes (the zigzag underlay stops there).
function endCut(p, { first, last }, w, inner = null) {
  const L = length(p), h = w / 2;
  const side = (rows) => {
    if (!rows) return null;
    const ref = rows[rows.length - 1], xa = Math.max(0, h - ref[2]), xb = Math.max(0, h - ref[3]);
    const at = (d) => { let i = 0; while (i < rows.length - 1 && rows[i + 1][0] <= d) i++; const r = rows[i], n = rows[i + 1] || r, f = n[0] > r[0] ? Math.min(1, Math.max(0, (d - r[0]) / (n[0] - r[0]))) : 0; return [r[2] + (n[2] - r[2]) * f + xa, r[3] + (n[3] - r[3]) * f + xb, r[1] + (n[1] - r[1]) * f]; };
    let stop = 0;   // (mm in from the end where the stitches are TIP long)
    for (const [d] of rows) { const [a, b] = at(d); if (Math.min(h, a) + Math.min(h, b) >= TIP) break; stop = d; }
    return { at, stop, span: ref[0] };
  };
  const F = side(first), E = side(last);
  if (!F && !E) return inner ? { p, shape: inner, first: 0, last: 0 } : null;
  const d0 = F ? F.stop : 0, d1 = L - (E ? E.stop : 0);
  if (d1 - d0 < 0.3) return { p: [], shape: null, first: F ? F.span : 0, last: E ? E.span : 0 };
  const q = d0 > 0 || d1 < L ? slice(p, d0, d1) : p;
  // (the shape, along the trimmed column)
  const shape = (s) => {
    const a = d0 + s;
    if (F && a <= F.span) return F.at(a);
    if (E && L - a <= E.span) return E.at(L - a);
    return inner ? inner(a) : null;
  };
  return { p: q, shape, first: F ? F.span : 0, last: E ? E.span : 0 };
}
// A stroke's column kept to the ink either side (`sides` from letters): each side reaches at most CLEAR_INK past the
// ink, plus what the column has over the stroke's usual width anyway; never under 0.4 of the column. (mm along p) ->
// [side, other side, 0], or null where it's the column's own width.
const CLEAR_INK = 0.15;
function sideClip(p, rows, w) {
  const h = w / 2, L = length(p) || 1, ok = rows.filter((r) => r[1] !== null);
  if (ok.length < 3) return null;
  const med = (k) => { const v = ok.map((r) => r[k]).sort((x, y) => x - y); return v[v.length >> 1]; };
  const xa = Math.max(0, h - med(1)) + CLEAR_INK, xb = Math.max(0, h - med(2)) + CLEAR_INK;
  if (!ok.some((r) => r[1] + xa < h || r[2] + xb < h)) return null;
  return (s) => {
    const t = s / L;
    let lo = 0, hi = rows.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rows[m][0] <= t) lo = m; else hi = m; }
    const r = Math.abs(rows[lo][0] - t) <= Math.abs(rows[hi][0] - t) ? rows[lo] : rows[hi];
    if (r[1] === null) return null;
    const a = Math.min(h, r[1] + xa), b = Math.min(h, r[2] + xb);
    return a >= h && b >= h ? null : [Math.max(a, 0.4 * h), Math.max(b, 0.4 * h), 0];
  };
}
// the part of p from d0 to d1 mm along it
function slice(p, d0, d1) {
  const out = [along(p, d0)];
  let walked = 0;
  for (let i = 1; i < p.length; i++) { walked += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); if (walked > d0 && walked < d1) out.push(p[i]); }
  out.push(along(p, d1));
  return out;
}
// the point d mm along p
function along(p, d) {
  for (let i = 1; i < p.length; i++) {
    const L = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (L >= d) { const t = d / (L || 1); return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]; }
    d -= L;
  }
  return p[p.length - 1];
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

// Automatic lettering this small sews as a fine line (its satin would be under 1 mm): said, since a name shrunk by
// Fit to hoop or a long name in a batch turned thin without a word.
export function fineLine(p) {
  if ((p.style || "auto") !== "auto") return false;
  const l = bulk(p);
  return !!l && l.parts.length > 0 && l.satinW === 0;
}

// Lettering smaller than this blurs: the bulk of the letters (x-height, or caps) under ~4 mm.
export function minSize(p) {
  const l = bulk(p);
  if (!l || !l.parts.length || l.xh >= 4) return 0;
  return Math.ceil((p.size * 4) / l.xh);
}

// On a towel the satin is at least 2.5 mm wide (a fine line sinks into the loops), so a small x-height fills its loops
// and counters in ("Harper" at 17.5 mm in Great Vibes sewed as "Harpa"): the height at which the x-height is 8 mm or
// more and every letter-sized counter (over a tenth of the x-height across: a script s's curl may fill) stays 0.8 mm
// open under that column, or 0 when it already does. Arched down, the counters close up by the bend at mid x-height.
// (Until 2026-10-30 only the 8 mm x-height: "Oliver" in Great Vibes at the suggested 17 mm was unreadable.)
export function towelMin(p) {
  const l = bulk(p);
  if (!l || !l.parts.length) return 0;
  const ok = (size) => {
    const q = { ...p, size }, m = bulk(q);
    if (m.xh < 8) return false;
    const w = Math.max(m.satinW, Math.min(2.5, m.xh * 0.3)), r = (w + 0.3) / 2;
    const k = p.kind === "text" && p.shape === "down" ? Math.max(0, 1 - m.xh / 2 / archRho(q, m)) : 1;
    return m.pockets.every((c) => c.peak < Math.max(0.6, 0.1 * m.xh) || Math.max(c.saddle * k - 0.2, c.peak * k - OPEN / 2) >= r);
  };
  if (ok(p.size)) return 0;
  for (let size = Math.ceil(p.size) + 1; size <= 150; size++) if (ok(size)) return size;
  return 151;
}

// Automatic satin lettering whose own loops (a tenth of the x-height or more to their middle: a b's bowl, an e's eye)
// close even round the narrowest column (0.8 mm, `counterCaps`): the height at which they stay open, or 0 when they
// do. Said with "Thin line" as the other fix (Alex Brush "Abbie" at 12 mm sewed as "Avvie", with no word).
export function loopsFill(p) {
  if ((p.style || "auto") !== "auto") return 0;
  const l = bulk(p);
  if (!l || !l.parts.length || !l.satinW) return 0;
  const shut = l.pockets.filter((c) => c.peak >= Math.max(0.45, 0.1 * l.xh) && Math.max(c.saddle - 0.2, c.peak - OPEN / 2) < 0.45);
  return shut.length ? Math.ceil((p.size * 0.86) / Math.min(...shut.map((c) => c.peak))) : 0;
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
  let pts = fitBox(raw, w, h);
  const r = Math.min(3, w * 0.06), near = pts.filter(([x, y]) => y < 0 && Math.abs(x) < r);
  if (near.length) {
    const yc = Math.min(...near.map(([x, y]) => y - Math.sqrt(r * r - x * x)));
    pts = pts.map(([x, y]) => (y < 0 && Math.abs(x) < r ? [x, Math.min(y, yc + Math.sqrt(r * r - x * x))] : [x, y]));
  }
  // the point at the bottom is a cusp (both sides meet upright): a satin can't turn it, so its edge stopped flat at the
  // tip and the placement and tack lines showed past it (and the edge walk poked out 2 mm). It's rounded to the 1.8 mm
  // circle that fits the point (half the 3.6 mm border, so the inside edge doesn't fold), then stretched back to h.
  const R = 1.8, low = pts.filter(([, y]) => y > 0);
  const gap = (yc) => Math.min(...low.map(([x, y]) => Math.hypot(x, y - yc)));
  let lo = 0, hi = h / 2;   // lowest centre whose circle fits: as the centre rises, the nearest point gets further
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (gap(m) < R) hi = m; else lo = m; }
  const yc = lo, touch = low.reduce((a, q) => (Math.hypot(q[0], q[1] - yc) < Math.hypot(a[0], a[1] - yc) ? q : a));
  const xt = Math.min(R, Math.abs(touch[0]));   // (between the two points where the circle touches the sides)
  const cut = (q) => q[1] > yc && Math.abs(q[0]) <= xt, i0 = pts.findIndex(cut), i1 = pts.length - 1 - [...pts].reverse().findIndex(cut);
  if (i0 >= 0) {   // (the curve runs down the right side to the point, then up the left)
    const a0 = Math.atan2(pts[i0 - 1][1] - yc, pts[i0 - 1][0]), a1 = Math.atan2(pts[i1 + 1][1] - yc, pts[i1 + 1][0]);
    const arc = Array.from({ length: 11 }, (_, k) => { const a = a0 + ((a1 - a0) * (k + 1)) / 12; return [R * Math.cos(a), yc + R * Math.sin(a)]; });
    pts = [...pts.slice(0, i0), ...arc, ...pts.slice(i1 + 1)];
  }
  return fitBox(pts, w, h);
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
  const { x, y, rot, id, flip, ...shape } = p, key = JSON.stringify(shape) + fab + wt;
  if (!built.has(key)) {
    const st = localStages(p, fab);
    if (!fontReady(p.font)) return st.map((s) => placed(s, placer(p)));
    built.set(key, st);
    if (built.size > 80) built.delete(built.keys().next().value);
  }
  const place = placer(p);
  return built.get(key).map((st) => placed(st, place));
}
// a stage moved into place: its stitches, its cut outlines and the filled area it covers (`solid`: closed loops,
// even-odd, that quilting keeps clear of). (Until 2026-10-30 `cut` stayed where the piece was built, at the centre
// unturned and unmirrored, so two appliqué pieces' shapes sat on top of each other in the cut file.)
function placed(st, place) {
  const s = { ...st, paths: st.paths.map((q) => moved(q, place)) };
  if (st.cut) s.cut = st.cut.map((l) => l.map(place));
  if (st.solid) s.solid = st.solid.map((l) => l.map(place));
  return s;
}
// a path's points moved, keeping its `gap` (sewn after a jump: the first stroke of a separate letter)
const moved = (q, f) => { const r = q.map(f); if (q.gap) r.gap = true; if (q.lockAt) r.lockAt = f(q.lockAt); return r; };
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
  const style = styleOn(p, fab), print = fontOf(p.font).print, sp = print ? (p.spacing || 0) / 100 : 0;
  // each line with where it starts in the words (pair adjustments are keyed by that)
  const raw = (p.text || "").split("\n"), at = raw.map((_, i) => raw.slice(0, i).reduce((a, l) => a + l.length + 1, 0));
  const kept = raw.map((l, i) => [l.trim(), at[i] + l.length - l.trimStart().length]).filter(([l]) => l).slice(0, 3);
  const lines = kept.map(([l]) => l);
  if (!lines.length) return [];
  const kerns = kept.map(([l, s]) => Array.from({ length: l.length }, (_, i) => (print && p.kern?.[s + i]) || 0).map((v) => v / 100));
  const joined = kerns.flatMap((k, i) => (i ? [0, ...k] : k));   // (lines joined by a space: none after it)
  if (p.shape === "up" || p.shape === "down") {
    const l = letters(lines.join(" "), p.font, p.size, style, sp, joined);
    return l.parts.length ? [{ parts: bend(l.parts, p.shape, Math.max(p.radius, 8), Math.max(p.ry ?? p.radius, 8)), satinW: l.satinW, xh: l.xh }] : [];
  }
  if (p.shape === "wave" || p.shape === "bridge") {
    const l = letters(lines.join(" "), p.font, p.size, style, sp, joined);
    if (!l.parts.length) return [];
    const mid = (l.top + l.bottom) / 2;   // (letters come with the baseline at y = 0)
    return [{ parts: p.shape === "wave" ? wave(l.parts.map(([q, ...r]) => [q.map(([x, y]) => [x, y - mid]), ...r]), p) : bridge(l.parts, p), satinW: l.satinW, xh: l.xh }];
  }
  // straight: one size for every line (scaled to the first line's x-height), baselines `leading` x size apart
  let ls = lines.map((t, i) => letters(t, p.font, p.size, style, sp, kerns[i]));
  if (ls.length > 1) ls = ls.map((l, i) => (i && l.xh ? letters(lines[i], p.font, (p.size * ls[0].xh) / l.xh, style, sp, kerns[i]) : l));
  ls = ls.filter((l) => l.parts.length);
  if (!ls.length) return [];
  const pitch = (p.size * (p.leading ?? 130)) / 100, span = (l) => { const xs = l.parts.flatMap(([q]) => q.map((v) => v[0])); return [Math.min(...xs), Math.max(...xs)]; };
  const spans = ls.map(span), W = Math.max(...spans.map(([a, b]) => b - a));
  const top = Math.min(...ls.map((l, i) => l.top + i * pitch)), bottom = Math.max(...ls.map((l, i) => l.bottom + i * pitch));
  return ls.map((l, i) => {
    const [a, b] = spans[i], dx = p.align === "left" ? -W / 2 - a : p.align === "right" ? W / 2 - b : -(a + b) / 2, dy = i * pitch - (top + bottom) / 2;
    return { parts: l.parts.map(([q, ...r]) => [q.map(([x, y]) => [x + dx, y + dy]), ...r]), satinW: l.satinW, xh: l.xh };
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
  const out = parts.map(([q, ...r]) => [densify(q, 1).map(([x, y]) => { const [px, py, nx, ny] = at(s0 + x - x0); return [px + y * nx, py + y * ny]; }), ...r]);
  const cx = (Math.min(...out.flatMap(([q]) => q.map((v) => v[0]))) + Math.max(...out.flatMap(([q]) => q.map((v) => v[0])))) / 2;
  const ys = out.flatMap(([q]) => q.map((v) => v[1])), cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return out.map(([q, ...r]) => [q.map(([x, y]) => [x - cx, y - cy]), ...r]);
}
// letters stretched upward toward the middle: the tops make an arch, the baseline stays put
function bridge(parts, p) {
  const xs = parts.flatMap(([q]) => q.map((v) => v[0])), x0 = Math.min(...xs), x1 = Math.max(...xs), W = Math.max(x1 - x0, 1);
  const k = (p.bulge ?? 30) / 100;
  const out = parts.map(([q, ...r]) => [densify(q, 1).map(([x, y]) => { const u = (2 * (x - (x0 + x1) / 2)) / W; return [x, y < 0 ? y * (1 + k * (1 - u * u)) : y]; }), ...r]);
  const ys2 = out.flatMap(([q]) => q.map((v) => v[1])), cy = (Math.min(...ys2) + Math.max(...ys2)) / 2;
  return out.map(([q, ...r]) => [q.map(([x, y]) => [x, y - cy]), ...r]);
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
    const at = out.length;
    for (const [p] of laid.slice(from, i)) out.push(spaced([p[0], ...zigzag(p, w, 2), p[p.length - 1]]));
    // (a separate letter's jump goes before its lattice, which ends where its letters start)
    if (sewn.slice(from, i).some((q) => q.gap)) { out[at].gap = true; for (const q of sewn.slice(from, i)) delete q.gap; }
    out.push(...sewn.slice(from, i)); from = i;
  }
  return out;
}

const loop = (q) => [...q, q[0]];
// a tack-down: round the outline and back again
const tack = (e) => [loop(run(e, 2.0, true)), loop(run(e.slice().reverse(), 2.0, true))];
// the 3.6 mm satin border of appliqué, patch and in-the-hoop edges: edge walk, zigzag, satin
const satinBorder = (e) => [edgeWalk(e, 3.6, true), loop(zigzag(e, 2.6, 2.0, true)), loop(satin(e, 3.6, sd(0.4), 0.3, true))];

// motifs that face one way (1: to the right, -1: to the left), for lettering's motif either side
const FACING = { bird: 1, dog: 1, bunny: 1, cat: 1, leaf: 1, moon: 1, fish: -1, horse: -1 };
function localStages(p, fab = "cotton") {
  let stages = [];
  if (p.kind === "text") {
    const rows = textRows(p, fab);
    let paths = rows.flatMap(({ parts, satinW, xh }) => lettersOn(parts, satinW, fab, xh));
    // a small filled motif either side (`deco`), sized to the letters and centred on them
    if (paths.length && MOTIFS[p.deco]) {
      const [x0, y0, x1, y1] = bounds(paths.flat()), s = Math.max(6, Math.min(p.size * 0.75, 30)), gap = s * 0.35;
      // (a motif that faces one way is mirrored on one side, so both face the words: two bunnies looked the same way)
      const face = FACING[p.deco] || 0;
      const side = (dx, f) => motifStitches(motifOutlines(MOTIFS[p.deco].d, s), "fill").map((q) => q.map(([x, y]) => [f * x + dx, y + (y0 + y1) / 2]));
      paths = [...side(x0 - gap - s / 2, face < 0 ? -1 : 1), ...paths, ...side(x1 + gap + s / 2, face > 0 ? -1 : 1)];
    }
    const words = (p.text || "").replace(/\s*\n\s*/g, " / ").trim();
    // (a motif either side is said: "Sews “Leo”." sewed two bunnies as well)
    const both = paths.length && MOTIFS[p.deco] ? ` with ${/^[aeiou]/i.test(MOTIFS[p.deco].name) ? "an" : "a"} ${MOTIFS[p.deco].name.toLowerCase()} either side` : "";
    if (paths.length) stages = [{ color: p.color, paths, sews: fab === "towel" ? `Sews a light base to flatten the pile, then “${words}”${both} on it.` : `Sews “${words}”${both}.` }];
  } else if (p.kind === "monogram") {
    const paths = monogram(p, fab);
    if (paths.length) stages = [{ color: p.color, paths, sews: fab === "towel" ? `Sews a light base to flatten the pile, then the monogram ${p.letters}.` : `Sews the monogram ${p.letters}.` }];
  } else if (p.kind === "frame") {
    const edge = shapeOf(p).path(p.w, p.h), name = shapeOf(p).name.toLowerCase();
    if (p.border === "applique") {
      stages = [
        { color: p.color, paths: [loop(run(edge, 2.5, true))], sews: `Sews the ${name} outline on the base fabric.`, fabric: true, solid: [edge] },
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
        { color: p.color, paths: [line(yz)], sews: "Sews the zipper line on the stabilizer.", under: true, bare: true,
          // (folded in half, each front piece has to reach from the zipper past the outline: twice that, plus spare)
          before: `Fabric: two front pieces, ${cut(p.w, 2 * (a + 15), 25)} for the top and ${cut(p.w, 2 * (b + 15), 25)} for the bottom (each folded in half along its length, wrong sides together), and the back, ${cut(p.w, p.h)}. Tear-away stabilizer, a #3 nylon coil zipper (it can be sewn and cut through) at least ${Math.ceil((p.w + 50) / 10)} cm (${((p.w + 50) / 25.4).toFixed(0)} in) long, and tape.` },
        { color: p.color, pause: true, paths: [line(yz - 5), line(yz + 5).reverse()], under: true,   // (±3.5 left 0.5 mm beside a coil's teeth)
          you: "Lay the zipper face up with its teeth on the line and the ends past both sides (pull the zipper tab past the side too). Tape the ends down. Press Start.",
          sews: "Tacks the zipper down along both sides of the teeth." },
        { color: p.color, pause: true, fabric: true, nocut: true, solid: [edge], paths: [loop(run(edge, 2.5, true))],
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
      // then backing fabric taped under the hoop and one satin edge through every layer; cut out when it's done.
      // Only something that hangs (`hang`: the ornament and key fob starters; a quilted frame is a coaster or mug rug)
      // gets the ribbon loop
      const hang = p.hang ?? !QUILTED(p);
      stages = [
        { color: p.color, paths: [loop(run(edge, 2.5, true))], sews: `Sews the ${name} outline on the stabilizer.`, fabric: true, bare: true, solid: [edge],
          before: `Fabric: front and back pieces, each ${cut(p.w, p.h)}${p.quilt ? `, thin batting the same size` : ""}, tear-away stabilizer and tape.` },
        { color: p.color, pause: true, paths: tack(edge),
          you: `Lay ${p.quilt ? "the batting, then " : ""}the front fabric over the ${name} outline, right side up, covering it by ½ in. Press Start. Then take the hoop off (leave everything hooped), trim the fabric${p.quilt ? " and batting" : ""} close to the stitching, and put the hoop back.`,
          sews: "Tacks the front fabric down.", under: true },
        { color: p.color, pause: true, last: true,
          paths: [loop(run(edge, 2.0, true)), ...satinBorder(edge)],
          you: `Take the hoop off and turn it over. Tape the backing fabric to the back, right side facing you (away from the stabilizer), covering the ${name} by ½ in.${hang ? " For a hanging loop, tape a folded ribbon at the top on the front, loop pointing in, ends ½ in past the outline." : ""} Put the hoop back and press Start.`,
          sews: "Tacks the backing on and covers the edge with satin through every layer.",
          after: `Take it out of the hoop, tear the stabilizer away and cut round the ${name} as close to the satin as you can without nicking it${hang ? " (keep the ribbon loop clear of the scissors). Flip the ribbon loop up." : "."}` },
      ];
    } else if (p.border === "patch") {
      // solid tatami fill (inset so the satin edge covers its ragged ends), then the satin edge over it; `compose`
      // cuts the fill away under what's sewn on it (`carve`)
      // (the edge sews after what goes on the patch, `edge` in compose: it covers the pull of the lettering at the
      // border and the fill's row ends, as a digitizer would order it)
      // (a patch is a separate piece: its fabric, a stabilizer firm enough for thousands of fill stitches, and how to
      // cut it out and put it on; it listed only "Tear-away stabilizer")
      const fill = patchFill(p, [inset(edge, 1.0)], fab);
      stages = [...fill, { color: p.color, edge: true, solid: [edge], paths: satinBorder(edge), sews: `Sews the patch's satin edge.`,
        after: `Take it out of the hoop, trim or tear the stabilizer away and cut the patch out close to the satin edge without nicking it. To put it on, iron patch adhesive (or fusible web) on the back and press it on, or sew it on by hand or machine just inside the edge.` }];
    } else {
      const paths = p.border === "satin" ? [edgeWalk(edge, 3.0, true), zigzag(edge, 2.1, 2.0, true), satin(edge, 3.0, sd(0.4), 0.3, true)]
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
    else if (loops.length) stages = [{ color: p.color, paths: motifStitches(loops, p.style), sews: `Sews the ${name}${p.style === "outline" ? " outline" : ""}.`, ...(p.style === "outline" ? {} : { solid: loops }) }];
  } else if (p.kind === "file") {
    // (each block keeps the thread name the file gives it: all named after the piece, a combined gnome.pes listed
    // "gnome" for every thread)
    stages = p.blocks.map((b) => ({ color: b.color, paths: b.paths, label: b.name || p.name, sews: `Sews ${p.name}${p.blocks.length > 1 ? ` (${b.name || "colour " + (p.blocks.indexOf(b) + 1)})` : ""}.` }));
    // (appliqué files name their blocks Placement Line / Tackdown / Cutting Line: the fabric steps said nothing at
    // those pauses. A block in the same thread as the one before is the file's own pause and stays one.)
    const kind = (b) => /placement|position/i.test(b.name) ? "place" : /tack/i.test(b.name) ? "tack" : /cut/i.test(b.name) ? "cut" : "";
    stages.forEach((s, k) => {
      const b = p.blocks[k], prev = p.blocks[k - 1], was = prev && kind(prev);
      if (prev && prev.color === b.color) s.pause = true;
      if (kind(b) === "place") Object.assign(s, { fabric: true, nocut: true, sews: `Sews the placement line (${b.name}): where the appliqué fabric goes.`,
        solid: b.paths.filter((q) => q.length > 3 && Math.hypot(q[0][0] - q[q.length - 1][0], q[0][1] - q[q.length - 1][1]) < 1) });
      if (kind(b) === "cut") s.sews = `Sews the cutting line (${b.name}).`;
      if (kind(b) === "tack") s.sews = `Tacks the appliqué fabric down (${b.name}).`;
      if (was === "place") s.you = "Lay the appliqué fabric over the placement line, right side up, covering it by ½ in. Press Start.";
      else if (was === "tack") s.you = "Take the hoop off (leave everything hooped), trim the appliqué fabric close to the tack-down stitching, put the hoop back and press Start.";
      else if (was === "cut") s.you = "If the design's own instructions say to cut here, cut along that line (leave everything hooped). Then press Start.";
      if (s.you) s.pause = true;
    });
  }
  return stages.map((st) => ({ ...st, paths: st.paths.filter((q) => q.length) }));
}

// A patch's fill in its thread, in a FILL_PATTERNS `pattern`; with `blend`, two layers across the patch, the first
// thinning out as the second fills in (row spacing changes gradually in each), the second with no underlay of its
// own (Hatch's colour blend, on one needle)
function patchFill(p, loops, fab, name = shapeOf(p).name.toLowerCase()) {
  const base = { density: fd(fab === "knit" ? DENSITY.standard : DENSITY.solid), pattern: p.pattern || "tatami" }, color = p.fill || p.color;
  const st = !p.blend || p.blend === color ? [{ color, paths: fillPolygon(loops, base), sews: `Fills the ${name} patch.`, patchFill: true }]
    : [{ color, paths: fillPolygon(loops, { ...base, share: (f) => 1 - f }), sews: `Fills the ${name} patch, fading out.`, patchFill: true },
      { color: p.blend, paths: fillPolygon(loops, { ...base, underlay: false, share: (f) => f }), sews: `Blends the second colour in across the patch.`, patchFill: true }];
  // what to hoop (`patch`: step 1 says so) and a stabilizer firm enough for a dense fill (thousands of stitches)
  return st.map((f, i) => (i ? f : { ...f, patch: true,
    before: "Patch fabric: felt or twill, big enough to hoop, and cut-away stabilizer (or two layers of heavy tear-away): a patch is thousands of stitches." }));
}

// a motif filled (tatami inside, then a narrow satin edge over the row ends) or as a satin outline
function motifStitches(loops, style) {
  if (style === "outline") return loops.flatMap((l) => edgeSatin(l, 2.2));
  return [...fillPolygon(loops, { inset: 0.6, density: fd(DENSITY.solid) }), ...loops.flatMap((l) => [loop(run(l, 2.0, true)), loop(satin(l, 1.4, sd(0.4), 0.2, true))])];
}

// a satin edge round a closed outline: as wide as `max`, narrower round a small hole (a 2.8 mm satin in the top of an
// A overlaps itself), over an edge walk and a zigzag
function edgeSatin(l, max, min = 1.2) {
  const [x0, y0, x1, y1] = bounds(l), w = Math.max(min, Math.min(max, Math.min(x1 - x0, y1 - y0) / 3.5));
  return [edgeWalk(l, w, true, Math.min(0.4, w / 4), true), loop(zigzag(l, w * 0.7, 2.0, true, true)), loop(satin(l, w, sd(0.4), w > 2 ? 0.3 : 0.2, true, true))];
}

// a point inside closed loops (even-odd)
function insideLoops(loops, [x, y]) {
  let k = false;
  for (const l of loops) for (let i = 0, j = l.length - 1; i < l.length; j = i++)
    if ((l[i][1] > y) !== (l[j][1] > y) && x < ((l[j][0] - l[i][0]) * (y - l[i][1])) / (l[j][1] - l[i][1]) + l[i][0]) k = !k;
  return k;
}

// every loop moved d mm away from the inside of the shape (even-odd over all the loops, so holes move into the hole)
function outward(loops, d) {
  const inside = (q) => insideLoops(loops, q);
  return loops.map((l) => {
    const n = normals(l, true), probe = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => Math.floor((l.length * k) / 8));
    const s = probe.filter((i) => inside([l[i][0] + n[i][0] * 0.5, l[i][1] + n[i][1] * 0.5])).length > 4 ? -d : d;
    return l.map((q, i) => [q[0] + n[i][0] * s, q[1] + n[i][1] * s]);
  });
}

// appliqué from outlines (letters, a motif): one piece of fabric for all of it; placement, tack-down, satin. The cut
// file is the outlines themselves (`cut`), each its own closed shape: the placement run goes from one outline to the
// next where that's hidden, and those moves must never reach a cutter.
function appliqued(loops, color, what, cover, trim, them = "it") {
  if (!loops.length) return [];
  const R = applRoutes(loops);
  return [
    { color, paths: R.placement, cut: loops, solid: loops, sews: `Sews the outline of ${what} on the base fabric.`, fabric: true },
    { color, pause: true, paths: R.tack,
      you: `Lay the appliqué fabric over ${cover}, right side up, covering ${them} by ½ in. Press Start. Then take the hoop off (leave everything hooped), trim the fabric close to the stitching ${trim}, and put the hoop back.`,
      sews: "Tacks the appliqué fabric down.", under: true },
    { color, pause: true, paths: R.satin, you: "Press Start.", sews: "Covers the raw edges with satin." },
  ];
}

// The three appliqué stages, each sewn in as few runs (trims) as hides its moves. A stage goes from one outline to
// the next only along a line that ends up out of sight:
//  - placement: under the appliqué fabric (inside a letter) or under a satin still to come (between close letters);
//  - tack-down: under a satin still to come (it sits on the appliqué fabric, so never across a letter); it first
//    runs back along its own tack line, which the satin covers too, to the spot nearest the next outline;
//  - satin: under the satin of an outline not sewn yet. Each satin starts where it will leave for the next outline,
//    reached by a run along its own centre line (under it), and the move starts on its outer edge.
// Otherwise it trims. Satin covers 1.0 mm inside the placement line and 1.8 outside (it sits 0.4 mm out, 2.8 wide);
// a move counts as hidden 0.3 mm short of that. Outlines go nearest first, a piece's holes before the next piece.
// Until 2026-10-30 only the placement line linked a letter's holes (straight across it), so "BABY" took 19 trims.
// A small hole (inscribed radius under 3 mm: an A's counter) gets a satin that leaves 1.6 mm of it open, down to 1.6 mm
// wide, 0.2 mm out from its placement line: Lilita One's A at 34 mm (a 4 x 5.6 mm triangle, 2 mm to its middle) closed
// to a 1 mm slot under a 2 mm satin 0.4 mm out.
function applRoutes(loops) {
  const n = loops.length, big = Math.sign(area(loops.reduce((a, l) => (Math.abs(area(l)) > Math.abs(area(a)) ? l : a)))), r = loops.map((l) => (Math.sign(area(l)) !== big ? holeRadius(l) : Infinity));
  const sh = r.map((v) => (v < 3 ? 0.2 : 0.4)), o4 = outward(loops, 0.4), o2 = r.some((v) => v < 3) ? outward(loops, 0.2) : o4;
  const out = loops.map((_, i) => (sh[i] === 0.4 ? o4[i] : o2[i]));
  const width = out.map((l, i) => { const [x0, y0, x1, y1] = bounds(l); const w = Math.max(2.0, Math.min(2.8, Math.min(x1 - x0, y1 - y0) / 3.5)); return r[i] < 3 ? Math.max(1.6, Math.min(w, 2 * (r[i] - 0.8 - sh[i]) - 0.2)) : w; });
  const ink = ([x, y]) => {
    let k = false;
    for (const l of loops) for (let i = 0, j = l.length - 1; i < l.length; j = i++)
      if ((l[i][1] > y) !== (l[j][1] > y) && x < ((l[j][0] - l[i][0]) * (y - l[i][1])) / (l[j][1] - l[i][1]) + l[i][0]) k = !k;
    return k;
  };
  const segDist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
  };
  const box = loops.map((l) => bounds(l));
  const dist = (j, p) => {
    const [x0, y0, x1, y1] = box[j];
    if (p[0] < x0 - 3 || p[0] > x1 + 3 || p[1] < y0 - 3 || p[1] > y1 + 3) return Infinity;
    const l = loops[j]; let d = Infinity;
    for (let i = 0; i < l.length; i++) d = Math.min(d, segDist(p, l[i], l[(i + 1) % l.length]));
    return d;
  };
  // under outline j's satin
  const covers = (j, p) => dist(j, p) <= (width[j] + (width[j] > 2 ? 0.3 : 0.2)) / 2 + (ink(p) ? -sh[j] : sh[j]) - 0.15;
  const hidden = (a, b, ok, skip = 0) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let s = skip; s <= L; s += 0.25) { const t = L ? s / L : 0; if (!ok([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false; }
    return ok(b);
  };

  // positions on an outline by arc length (out[i] is point for point with loops[i], so one position serves both)
  const cum = loops.map((l) => { const c = [0]; for (let i = 0; i < l.length; i++) c.push(c[i] + Math.hypot(l[(i + 1) % l.length][0] - l[i][0], l[(i + 1) % l.length][1] - l[i][1])); return c; });
  const at = (L, i, s) => {
    const c = cum[i], T = c[c.length - 1]; s = ((s % T) + T) % T;
    let k = 0; while (k < L.length - 1 && c[k + 1] < s) k++;
    const t = c[k + 1] > c[k] ? (s - c[k]) / (c[k + 1] - c[k]) : 0, a = L[k], b = L[(k + 1) % L.length];
    return { k, p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
  };
  const from = (L, i, s, rev = false) => {   // the outline as a loop starting at s (no repeated end)
    const { k, p } = at(L, i, s), o = [p, ...L.slice(k + 1), ...L.slice(0, k + 1)];
    return rev ? [o[0], ...o.slice(1).reverse()] : o;
  };
  const along = (L, i, s0, s1) => {   // the shorter way round from s0 to s1
    const T = cum[i][cum[i].length - 1], fw = (((s1 - s0) % T) + T) % T;
    const pts = [at(L, i, s0).p];
    if (fw <= T / 2) { for (const v of cum[i].slice(1, -1).map((c, k) => [c, k + 1])) { const d = (((v[0] - s0) % T) + T) % T; if (d > 0 && d < fw) pts.push([d, L[v[1]]]); } }
    else { for (const v of cum[i].slice(1, -1).map((c, k) => [c, k + 1])) { const d = (((s0 - v[0]) % T) + T) % T; if (d > 0 && d < T - fw) pts.push([d, L[v[1]]]); } }
    const mid = pts.slice(1).sort((a, b) => a[0] - b[0]).map((q) => q[1]);
    return [pts[0], ...mid, at(L, i, s1).p];
  };
  // nearby spots on two outlines, closest first (candidate places to move between them)
  const near = (i, j, max) => {
    const c = [], T = cum[i][cum[i].length - 1];
    for (let s = 0; s < T; s += 0.5) {
      const p = at(loops[i], i, s).p; let bd = Infinity, bs = 0;
      const l = loops[j];
      for (let k = 0; k < l.length; k++) {
        const a = l[k], b = l[(k + 1) % l.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
        const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0, d = Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
        if (d < bd) { bd = d; bs = cum[j][k] + t * (cum[j][k + 1] - cum[j][k]); }
      }
      if (bd <= max) c.push({ si: s, sj: bs, d: bd });
    }
    c.sort((a, b) => a.d - b.d);
    const picked = [];   // spread out: one try per 1.5 mm of outline
    for (const q of c) if (!picked.some((r) => Math.abs(r.si - q.si) < 1.5)) { picked.push(q); if (picked.length >= 8) break; }
    return picked;
  };
  // the holes of the piece an outline belongs to come first (the placement line links them across the letter)
  const contains = (l, [x, y]) => {
    let k = false;
    for (let i = 0, j = l.length - 1; i < l.length; j = i++)
      if ((l[i][1] > y) !== (l[j][1] > y) && x < ((l[j][0] - l[i][0]) * (y - l[i][1])) / (l[j][1] - l[i][1]) + l[i][0]) k = !k;
    return k;
  };
  const host = loops.map((l, i) => {
    const around = loops.map((m, j) => j).filter((j) => j !== i && contains(loops[j], l[0]));
    if (around.length % 2 === 0) return i;
    return around.sort((a, b) => Math.abs(area(loops[a])) - Math.abs(area(loops[b])))[0];
  });
  const gap = loops.map((_, i) => loops.map((_, j) => {
    if (i === j) return Infinity;
    const a = box[i], b = box[j], dx = Math.max(0, a[0] - b[2], b[0] - a[2]), dy = Math.max(0, a[1] - b[3], b[1] - a[3]);
    return Math.hypot(dx, dy);
  }));

  function stage(kind, before = null) {   // (before: where the stage before it stopped)
    const left = new Set(loops.map((_, i) => i)), paths = [], max = kind === "placement" ? 40 : 4;
    // (placement and tack-down: every satin is still to come; satin: the outlines not sewn yet)
    const any = (p) => loops.some((_, j) => covers(j, p)), ok = kind === "placement" ? (p) => ink(p) || any(p)
      : kind === "tack" ? any : (p) => [...left].some((j) => covers(j, p));
    // where to leave outline i for one of `to`, hidden: the piece's holes first, then the nearest
    const leave = (i, to) => {
      for (const j of to.filter((j) => gap[i][j] <= max).sort((a, b) => (host[a] === host[i] ? 0 : 1) - (host[b] === host[i] ? 0 : 1) || gap[i][a] - gap[i][b])) {
        for (const c of near(i, j, max)) {
          if (kind !== "satin") {
            const a = at(loops[i], i, c.si).p, b = at(loops[j], j, c.sj).p;
            if (hidden(a, b, ok)) return { j, s: c.si, sj: c.sj, bridge: [a, b] };
            continue;
          }
          // satin: sewn from this spot round (either way), it ends on one edge; the move goes from there
          for (const rev of [false, true]) {
            const sat = edgeSatin(from(out[i], i, c.si, rev), width[i], Math.min(2.0, width[i])), e = sat[sat.length - 1][sat[sat.length - 1].length - 1], b = nearestOn(out[j], e);
            if (hidden(e, b, ok, 0.3)) return { j, s: c.si, sat, bridge: [e, b], sj: arcOf(out[j], j, b) };
          }
        }
      }
      return null;
    };
    const bridge = (path, [a, b]) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); path.push(...(L <= 4 ? [b] : run([a, b], 2.5).slice(1))); };
    let cur = -1, arrive = null, path = null;
    while (left.size || cur >= 0) {
      if (cur < 0) {   // a new run: the leftmost outline left (a piece's outline before its holes)
        cur = [...left].sort((a, b) => (host[a] === a ? 0 : 1) - (host[b] === b ? 0 : 1) || box[a][0] - box[b][0])[0];
        arrive = null; path = [];
      }
      left.delete(cur);
      let exit = leave(cur, [...left]), back = null;
      // placement, from a hole with nowhere to go: back across the letter to its outline (under the fabric) and along
      // that (already sewn) to the spot nearest the next letter
      if (!exit && kind === "placement" && host[cur] !== cur) {
        const h = host[cur], on = leave(h, [...left]);
        if (on) for (const c of near(cur, h, max)) {
          const a = at(loops[cur], cur, c.si).p, b = at(loops[h], h, c.sj).p;
          if (hidden(a, b, ok)) { back = { s: c.si, sj: c.sj, bridge: [a, b], on }; break; }
        }
      }
      const T = cum[cur][cum[cur].length - 1];
      // a new run starts at least 5.5 mm from where the last one stopped: the machine doesn't trim a shorter jump
      // (it's left as a loose thread), and under 2 mm it's sewn straight across. From there it runs round to its exit.
      if (arrive == null) {
        const L = kind === "satin" ? out[cur] : loops[cur], end = paths.length ? paths[paths.length - 1].at(-1) : before;
        const far = (s) => !end || Math.hypot(at(L, cur, s).p[0] - end[0], at(L, cur, s).p[1] - end[1]) > 5.5;
        const want = [(exit || back)?.s, kind === "satin" ? T * (2 / 3) : kind === "tack" ? T / 3 : 0].filter((s) => s != null);
        let s = want.find(far);
        for (let k = 1; s == null && k < 40; k++) for (const w of [want[0] + (k * T) / 80, want[0] - (k * T) / 80]) if (s == null && far(w)) s = ((w % T) + T) % T;
        arrive = s ?? want[0];
      }
      if (kind === "satin") {
        const s = exit ? exit.s : arrive ?? T * (2 / 3);   // (a lone outline starts two thirds round: the stages' seams apart)
        if (arrive != null && Math.abs(arrive - s) > 0.05) path.push(...run(along(out[cur], cur, arrive, s), 2.5).slice(path.length ? 1 : 0));
        const sat = exit ? exit.sat : edgeSatin(from(out[cur], cur, s), width[cur], Math.min(2.0, width[cur]));
        if (path.length) paths.push(path);
        paths.push(...sat.slice(0, -1)); path = sat[sat.length - 1].slice();
      } else {
        const go = exit || back, s0 = arrive ?? (go ? go.s : kind === "tack" ? T / 3 : 0), l = from(loops[cur], cur, s0);
        // (tack-down: round and back the other way, ending where it began)
        const ring = kind === "tack" ? [...loop(run(l, 2.0, true)), ...loop(run([l[0], ...l.slice(1).reverse()], 2.0, true)).slice(1)] : loop(run(l, 2.5, true));
        path.push(...(path.length ? ring.slice(1) : ring));
        if (go && Math.abs(go.s - s0) > 0.05) path.push(...run(along(loops[cur], cur, s0, go.s), 2.5).slice(1));
        if (back) {
          const h = host[cur];
          bridge(path, back.bridge);
          if (Math.abs(back.on.s - back.sj) > 0.05) path.push(...run(along(loops[h], h, back.sj, back.on.s), 2.5).slice(1));
          exit = back.on;
        }
      }
      if (exit) { bridge(path, exit.bridge); arrive = exit.sj; cur = exit.j; }
      else { paths.push(path); cur = -1; path = null; }
    }
    return paths.filter((q) => q.length);
  }
  const nearestOn = (l, p) => {
    let bd = Infinity, bq = l[0];
    for (let k = 0; k < l.length; k++) {
      const a = l[k], b = l[(k + 1) % l.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0, q = [a[0] + dx * t, a[1] + dy * t], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < bd) { bd = d; bq = q; }
    }
    return bq;
  };
  const arcOf = (l, j, p) => {
    let bd = Infinity, bs = 0;
    for (let k = 0; k < l.length; k++) {
      const a = l[k], b = l[(k + 1) % l.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0, d = Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
      if (d < bd) { bd = d; bs = cum[j][k] + t * (cum[j][k + 1] - cum[j][k]); }
    }
    return bs;
  };
  const placement = stage("placement"), tack = stage("tack", placement.at(-1).at(-1));
  return { placement, tack, satin: stage("satin", tack.at(-1).at(-1)) };
}
const area = (l) => l.reduce((a, p, i) => { const q = l[(i + 1) % l.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
// the radius of the biggest circle inside a closed outline (mm, on a 0.1 mm grid), or Infinity when it's over 10 mm across
function holeRadius(l) {
  const [x0, y0, x1, y1] = bounds(l);
  if (Math.min(x1 - x0, y1 - y0) > 10) return Infinity;
  let best = 0;
  for (let x = x0; x <= x1; x += 0.1) for (let y = y0; y <= y1; y += 0.1) {
    let k = false, d = Infinity;
    for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
      const a = l[j], b = l[i];
      if ((b[1] > y) !== (a[1] > y) && x < ((a[0] - b[0]) * (y - b[1])) / (a[1] - b[1]) + b[0]) k = !k;
      const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)) : 0;
      d = Math.min(d, Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t));
    }
    if (k && d > best) best = d;
  }
  return best;
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
  // Print letters are spaced by what's sewn: their satins reach half a column past the centre lines the widths are
  // measured on, so TKM in Josefin ran the T's bar into the K and the K's leg into the M. Each letter moves right until
  // its stitches, band by band (0.5 mm tall, each checked against its neighbours too), clear the last one's by the gap
  // plus a thread's width. Script monograms keep their interlocking look.
  if (fontOf(p.font).print) {
    const sewn = ls.map((l) => lettersOn(l.parts.map(([q, ...r]) => [q.map(([a, b]) => [a, b - (l.top + l.bottom) / 2]), ...r]), l.satinW, fab, l.xh));
    const prof = sewn.map((paths) => { const m = new Map(); for (const [a, b] of paths.flat()) { const k = Math.floor(b / 0.5), v = m.get(k); m.set(k, v ? [Math.min(v[0], a), Math.max(v[1], a)] : [a, a]); } return m; });
    const at = [0];
    for (let i = 1; i < sewn.length; i++) {
      let need = -Infinity;
      for (const [k, [, right]] of prof[i - 1]) for (let d = -1; d <= 1; d++) { const v = prof[i].get(k + d); if (v) need = Math.max(need, right - v[0]); }
      at.push(at[i - 1] + (need === -Infinity ? widths[i - 1] : need) + gap + 0.4);
    }
    const xs = sewn.flatMap((paths, i) => paths.flat().map(([a]) => a + at[i])), c = (Math.min(...xs) + Math.max(...xs)) / 2;
    return sewn.flatMap((paths, i) => paths.map((q) => moved(q, ([a, b]) => [a + at[i] - c, b])));
  }
  let x = -(widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1)) / 2;
  const out = [];
  ls.forEach((l, i) => {
    const mid = (l.top + l.bottom) / 2, cx = x + widths[i] / 2;
    out.push(...lettersOn(l.parts.map(([q, ...r]) => [q.map(([a, b]) => [a + cx, b - mid]), ...r]), l.satinW, fab, l.xh));
    x += widths[i] + gap;
  });
  return out;
}

export function pieceBounds(p) {
  const pts = pieceStitches(p).flat();
  return pts.length ? bounds(pts) : null;
}

// Is every stitch of p at least `margin` mm inside frame f's outline? (where a new piece can go on a frame)
export function inFrame(p, f, margin = 3) {
  const edge = shapeOf(f).path(f.w, f.h).map(placer(f)), pts = pieceStitches(p).flat();
  if (!pts.length) return false;
  for (let i = 0; i < pts.length; i += 3) if (!inside(pts[i], edge) || edgeGap(pts[i], edge) < margin) return false;
  return true;
}
// the first filled patch after p in the list that would cover some of p's stitches (sewn first, it's hidden), or null;
// `before`: the last patch before p that p is sewn on
export function underPatch(p, pieces, before = false) {
  const i = pieces.findIndex((o) => o.id === p.id);
  if (i < 0 || p.kind === "frame") return null;
  const list = before ? pieces.slice(0, i).reverse() : pieces.slice(i + 1);
  if (!list.some((f) => f.kind === "frame" && f.border === "patch")) return null;
  const pts = pieceStitches(p).flat();
  for (const f of list) {
    if (f.kind !== "frame" || f.border !== "patch") continue;
    const edge = shapeOf(f).path(f.w, f.h).map(placer(f));
    if (pts.some((q, k) => k % 3 === 0 && inside(q, edge))) return f;
  }
  return null;
}
// point in polygon (even-odd), and the distance to its nearest edge
function inside([x, y], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function edgeGap([x, y], poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0;
    d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return d;
}

export const label = (p) => p.kind === "motif" ? `${(MOTIFS[p.motif] || MOTIFS.heart).name}` : p.kind === "text" ? `“${p.text.replace(/\s*\n\s*/g, " / ")}”` : p.kind === "letters" ? `Appliqué ${p.text}` : p.kind === "monogram" ? `Monogram ${p.letters}`
  : p.kind === "file" ? p.name : `${shapeOf(p).name}${p.border === "applique" ? " appliqué" : ""}`;

// A piece read from a saved design, the clipboard or the page's own storage, made safe to build: every field checked
// and clamped (an unknown font -> the default, a size of -5 or 1000 -> the nearest that can be sewn, with room for
// what Fit to hoop sets; a motif or shape that doesn't exist -> the first one). Returns null for one that can't be
// read at all (no words, an unknown kind). A crafted file showed "Cannot read properties of undefined" and a piece
// named "undefined", and stayed through a reload.
const own = (o, k) => typeof k === "string" && Object.hasOwn(o, k);
const num = (v, lo, hi, d) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const hex = (v, d) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const pick = (v, ok, d) => (ok.includes(v) ? v : d);
export function cleanPiece(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  // (a place far past any hoop is taken as the middle, not the hoop's edge: x 1e9 made a 1072 mm design)
  const at = (v) => (typeof v === "number" && Math.abs(v) <= 300 ? v : 0);
  const q = { ...p, x: at(p.x), y: at(p.y), color: hex(p.color, "#0e1f7c") };
  if (q.rot != null) q.rot = num(q.rot, -180, 180, 0);
  if (q.flip != null) q.flip = q.flip === true;
  const font = (list, d) => (list.some((f) => f.family === q.font) ? q.font : d);
  const style = () => { if (q.style != null) q.style = pick(q.style, ["auto", "satin", "line"], "auto"); };
  if (p.kind === "text") {
    if (typeof q.text !== "string" || !q.text.trim()) return null;
    q.text = q.text.slice(0, 60).split("\n").slice(0, 3).join("\n");
    q.font = font(FONTS, "NW Great Vibes"); q.size = num(q.size, 5, 300, 18); style();
    q.shape = pick(q.shape, Object.keys(TEXT_SHAPES), "straight"); q.radius = num(q.radius, 8, 400, 30);
    for (const [k, lo, hi] of [["ry", 8, 400], ["amp", 0, 100], ["waves", 0.5, 6], ["bulge", 0, 100], ["spacing", -10, 40], ["leading", 80, 200]])
      if (q[k] != null) { q[k] = num(q[k], lo, hi, undefined); if (q[k] === undefined) delete q[k]; }
    if (q.align != null) q.align = pick(q.align, ["left", "center", "right"], "center");
    if (q.deco != null && !own(MOTIFS, q.deco)) delete q.deco;
    if (q.kern != null) {
      const k = q.kern && typeof q.kern === "object" ? Object.entries(q.kern).filter(([i, v]) => /^\d+$/.test(i) && +i < q.text.length && Number.isFinite(v)) : [];
      if (k.length) q.kern = Object.fromEntries(k.map(([i, v]) => [i, Math.min(50, Math.max(-30, Math.round(v)))])); else delete q.kern;
    }
  } else if (p.kind === "monogram") {
    if (typeof q.letters !== "string" || !q.letters.trim()) return null;
    q.letters = q.letters.slice(0, 12); q.font = font(FONTS, "NW Great Vibes"); q.size = num(q.size, 10, 300, 30); style();
  } else if (p.kind === "letters") {
    if (typeof q.text !== "string" || !q.text.trim()) return null;
    q.text = q.text.slice(0, 12); q.font = font(APPLIQUE_FONTS, APPLIQUE_FONTS[0].family); q.size = num(q.size, 10, 300, 60);
  } else if (p.kind === "motif") {
    q.motif = own(MOTIFS, q.motif) ? q.motif : "heart"; q.size = num(q.size, 5, 300, 40);
    q.style = pick(q.style, ["fill", "outline", "applique"], "fill");
  } else if (p.kind === "frame") {
    q.shape = own(SHAPES, q.shape) ? q.shape : "circle"; q.border = own(BORDERS, q.border) ? q.border : "satin";
    q.w = num(q.w, 10, 400, 80); q.h = num(q.h, 10, 400, q.w);
    if (q.fill != null) q.fill = hex(q.fill, "#0e1f7c");
    if (q.blend != null) { q.blend = hex(q.blend, undefined); if (!q.blend) delete q.blend; }
    if (q.pattern != null && !own(FILL_PATTERNS, q.pattern)) delete q.pattern;
    if (q.quilt != null && !own(QUILTS, q.quilt)) delete q.quilt;
    if (q.hang != null) q.hang = q.hang === true;
  } else if (p.kind === "file") {
    const pt = (v) => Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Math.abs(v[0]) < 1000 && Math.abs(v[1]) < 1000;
    const blocks = Array.isArray(q.blocks) ? q.blocks.filter((b) => b && Array.isArray(b.paths)).map((b) => ({
      color: hex(b.color, "#000000"), name: typeof b.name === "string" ? b.name.slice(0, 40) : "",
      paths: b.paths.filter((r) => Array.isArray(r) && r.length > 1 && r.every(pt)).map((r) => r.map(([x, y]) => [x, y])) })).filter((b) => b.paths.length) : [];
    if (!blocks.length) return null;
    q.blocks = blocks; q.name = typeof q.name === "string" && q.name.trim() ? q.name.slice(0, 60) : "Design file";
  } else return null;
  return q;
}

// An opened design as a piece: its stitches split into runs at jumps/trims, per colour block, centred.
export function fileBlocks(design) {
  const blocks = [];
  let cur = null, run = [];
  const flush = () => { if (run.length > 1 && cur) cur.paths.push(run); run = []; };
  design.stitches.forEach(([x, y, c], i) => {
    if (!cur) { cur = { color: design.threads[0]?.color || "#000000", name: design.threads[0]?.name || "", paths: [] }; blocks.push(cur); }
    if (c === 0) run.push([x / 10, y / 10]);
    // (a run starts at its first stitch, not where the jump to it stopped: files' jumps often stop a few mm short, and
    // starting there sewed each one as a 2-5 mm stitch or loose thread: peace.pes had 31 to snip here, 3 opened alone)
    else if (c === 1 || c === 2) flush();
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

// Straight lettering (and monograms) whose centre sits inside an earlier frame shrinks to fit across it (a long name
// typed into "Name in a frame" would otherwise run over the border); monograms fit up and down as well. Returns id -> the size it's stitched at.
export function fittedSizes(pieces) {
  const out = new Map();
  pieces.forEach((p) => {
    const mono = p.kind === "monogram";
    if ((p.kind !== "text" && !mono) || (p.shape && p.shape !== "straight") || (p.rot || 0) % 180) return;
    const frame = frameAround(p, pieces.filter((f) => f === p || !(f.rot || 0)));
    if (!frame) return;
    const b = pieceBounds({ ...p, x: 0, y: 0 }); if (!b) return;
    const dy = (p.y - frame.y) / (frameH(frame) / 2), gap = frame.border === "line" ? 4 : 8;
    // room across the frame at the lettering's height (narrower toward the top and bottom of round shapes)
    const round = ["circle", "oval", "scallop", "heart"].includes(frame.shape) ? Math.sqrt(Math.max(0.2, 1 - dy * dy)) : 1;
    // (a monogram only shrinks when it would reach the border: the starters' monograms fill their frames on purpose)
    const fill = frame.shape === "diamond" ? 0.55 : mono ? 0.92 : 0.82, room = frame.w * round * fill - (mono ? gap / 2 : gap);
    const w = b[2] - b[0];
    let k = w > room && room > 5 ? room / w : 1;
    // a monogram is tall: it must fit up and down too (a script R overran a key fob's border)
    if (mono) {
      const roomH = frameH(frame) * fill - gap / 2 - 2 * Math.abs(p.y - frame.y), h = b[3] - b[1];
      if (h > roomH && roomH > 5) k = Math.min(k, roomH / h);
    }
    if (k < 1) out.set(p.id, clearOf(p, frame, Math.max(5, Math.floor(p.size * k * 2) / 2)));
  });
  return out;
}
// The fitted size, made smaller (0.5 mm steps, down to 60 %) until the stitches clear the frame's (CLEAR): the room
// above is the frame's outline, so a scallop's valleys or a satin border's inner edge could still meet the letters
// (a Great Vibes JMK in a scallop, after Circle -> Scallop). Left as it was when no smaller size clears.
const cleared = new Map();
function clearOf(p, frame, size) {
  const { x, y, id, ...shape } = p, key = JSON.stringify([shape, x - frame.x, y - frame.y, { ...frame, x: 0, y: 0, id: 0 }, size, wt]);
  if (!cleared.has(key)) {
    const edge = pieceStitches(frame);
    let s = size;
    for (let t = size; t >= Math.max(5, size * 0.6); t -= 0.5) if (!near(cloud(pieceStitches({ ...p, size: t })), edge, CLEAR)) { s = t; break; }
    cleared.set(key, s);
    if (cleared.size > 200) cleared.delete(cleared.keys().next().value);
  }
  return cleared.get(key);
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
const ascii = (s) => (s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[‘’]/g, "'").replace(/[“”]/g, "\"").replace(/[^\x20-\x7e]/g, "");

// (`ready` is what "Have ready" lists and `tip` what "Sewing on" says: one place per fabric, so they agree)
// (`hoop` starts step 1, `after` is "When it's done": knit said "tear or cut away" though cut-away must be trimmed)
export const FABRICS = {
  cotton: { name: "Cotton", ready: "Tear-away stabilizer.", tip: "On woven cotton, hoop it with tear-away stabilizer underneath. On a pillowcase or bag, hoop only the front layer (turn it inside out) so it isn't sewn shut.",
    hoop: "Hoop the fabric with tear-away stabilizer under it", after: "Take the hoop off, snip any loose threads and tear the stabilizer away gently, holding the stitches down with your thumb." },
  knit: { name: "Knit / T-shirt", ready: "Cut-away stabilizer (fusible no-show mesh is easiest) and a 75/11 ballpoint needle.", tip: "Knits stretch: hoop them with cut-away stabilizer (fusible no-show mesh is easiest) and use a 75/11 ballpoint needle. Don't stretch the fabric while hooping.",
    hoop: "Hoop the knit with the cut-away stabilizer under it, without stretching it", after: "Take the hoop off and snip any loose threads. Trim the cut-away stabilizer on the back about ¼ in from the stitching, rounding the corners. Don't tear it: it stops the design stretching out of shape in the wash." },
  towel: { name: "Towel / fleece", tip: "Lay a water-soluble topper on the towel or fleece and hoop tear-away (or cut-away) stabilizer under it. The light base sewn under the letters flattens the pile; tear the topper off afterwards.",
    ready: "A water-soluble topper (like Solvy) and tear-away or cut-away stabilizer.", hoop: "Hoop the towel with the stabilizer under it and lay the water-soluble topper on top",
    after: "Take the hoop off and snip any loose threads. Tear the topper away (a damp cloth melts the bits left in the letters), then tear the stabilizer off the back (cut-away: trim it ¼ in from the stitching)." },
  felt: { name: "Felt", ready: "Tear-away stabilizer and a sharp 75/11 needle.", tip: "Felt is firm: tear-away stabilizer is enough. Use a sharp 75/11 needle.",
    hoop: "Hoop the felt with tear-away stabilizer under it", after: "Take the hoop off, snip any loose threads and tear the stabilizer away gently." },
  denim: { name: "Denim", ready: "Cut-away or heavy tear-away stabilizer and a 75/11 sharp or 80/12 needle (90/14 for heavy denim).", tip: "On denim use a 75/11 sharp or 80/12 needle (90/14 only for heavy denim) and cut-away or heavy tear-away stabilizer.",
    hoop: "Hoop the denim with the stabilizer under it", after: "Take the hoop off and snip any loose threads. Cut-away stabilizer: trim it ¼ in from the stitching (don't tear it). Heavy tear-away: tear it off gently." },
  canvas: { name: "Canvas / tote", ready: "Medium tear-away stabilizer (cut-away if it'll be washed a lot) and a 90/14 sharp needle.", tip: "Canvas is firm: medium tear-away stabilizer underneath (cut-away if it'll be washed a lot) and a 90/14 sharp needle. On a tote, hoop only the front layer (turn it inside out).",
    hoop: "Hoop the canvas (on a tote, only the front layer) with the stabilizer under it", after: "Take the hoop off, snip any loose threads and tear the stabilizer away gently (cut-away: trim it ¼ in from the stitching)." },
};

// thread weight (compose opts `thread`): satin and fill spacing follow the thread's thickness. Automatic is what the
// site always did: 40 wt, with lettering under a 6 mm x-height sewn for the 60 wt the steps suggest. 30 wt is ~1.3x
// as thick as 40 (satins 15% more open, fills 0.05 mm); 60 wt ~0.75x (satins 12% closer; fills stay at 0.35 mm,
// closer rows make the row links shorter than the PE900 check's 0.3 mm).
export const THREADS = {
  auto: { name: "Automatic", tip: "Standard 40 wt thread; small letters are sewn for 60 wt (the steps say when)." },
  30: { name: "30 wt", satin: 0.45, tip: "30 wt is heavier and bolder: use a 90/14 topstitch needle and slow the machine down." },
  40: { name: "40 wt", satin: 0.38, tip: "40 wt is the standard machine embroidery thread: a 75/11 embroidery needle." },
  60: { name: "60 wt", satin: 0.34, tip: "60 wt is fine, for small letters and fine detail: a 65/9 or 70/10 needle and 60 wt bobbin thread." },
};
let wt = "auto";   // set by compose for the length of a build
const sd = (x) => (wt === "30" ? +(x * 1.15).toFixed(3) : wt === "60" ? +(x * 0.88).toFixed(3) : x);
const fd = (x) => (wt === "30" ? x + 0.05 : x);

// Quilting in a frame (`quilt`: stipple or echo) fills it around everything else on it, sewn right after the frame
// (after the front fabric on an in-the-hoop frame, before what goes on it). Kept for the last few layouts: it's the
// slowest thing in compose.
const QUILTED = (p) => p.kind === "frame" && (p.quilt === "stipple" || p.quilt === "echo") && p.border !== "patch";
const quilted = new Map(), lastQuilt = new Map();   // (lastQuilt: per frame, reused while a piece is being dragged)
function withQuilt(p, stages, others, dragging = false) {
  // around every other piece's stitches, and inside none of their filled shapes (an appliqué's fabric)
  // (not a shape the frame itself sits on, a patch or appliqué under the whole frame: that would leave no room)
  const edge = shapeOf(p).path(p.w, p.h).map(placer(p)), key0 = JSON.stringify(p), frame = key0;
  const under = (loops) => edge.filter((q) => insideLoops(loops, q)).length > edge.length / 2;
  const obstacles = others.flatMap((s) => s.paths), solids = others.filter((s) => s.solid?.length && !under(s.solid)).map((s) => s.solid);
  // keyed on every obstacle point: moving a middle piece reused the old quilting, sewn through it
  let h = obstacles.length;
  for (const o of [...obstacles, ...solids.flat()]) for (const [x, y] of o) h = (Math.imul(h ^ Math.round(x * 10), 16777619) ^ Math.round(y * 10)) | 0;
  const key = JSON.stringify([p, h]);
  if (!quilted.has(key) && !(dragging && lastQuilt.has(frame))) {
    quilted.set(key, (p.quilt === "echo" ? echo : stipple)(edge, obstacles, { inset: p.border === "line" || p.border === "bold" ? 3 : 4.5, solids }));
    if (quilted.size > 12) quilted.delete(quilted.keys().next().value);
  }
  const paths = quilted.get(key) || lastQuilt.get(frame);
  lastQuilt.set(frame, paths); if (lastQuilt.size > 12) lastQuilt.delete(lastQuilt.keys().next().value);
  if (!paths.length) return stages;
  const q = { color: p.color, paths, sews: `Quilts the ${shapeOf(p).name.toLowerCase()} (${p.quilt}).`, label: label(p) };
  // (an in-the-hoop frame lists its batting already; a quilt block's Have ready had none)
  if (p.border !== "ith") Object.assign(q, { sandwich: true,
    before: "A quilt sandwich big enough to hoop: top fabric, thin batting and backing (too thick to hoop: float it on hooped tear-away stabilizer with basting spray).",
    after: "Take it out of the hoop, snip any loose threads and tear away the stabilizer if you floated it on some." });
  const at = stages.findIndex((s) => s.last);
  return at < 0 ? [...stages, q] : [...stages.slice(0, at), q, ...stages.slice(at)];
}

// A patch's fill cut away under what's sewn on top of it (lettering, a motif, a file): a name in satin on a full
// tatami stacked two layers of thread (stiff, and over 24 hits/mm²). The hole is what the later stitches cover,
// closed over 0.4 mm and then 0.8 mm smaller, so the fill still runs 0.4 mm under their edges. Decided per piece,
// all of it or none: only a piece that's wide all over (its columns, measured along their middles, typically
// CARVE_W mm or wider: a filled motif, or lettering at the widest satin, 3.5 mm, which measures 3.7; a 2.4 mm satin
// measures 3.0) and only holes of 20 mm² or more.
// Thin satin lettering on a fill is normal (the fill is its base), and cutting round every stroke broke the fill into
// sections (trims 3 -> 9 on a name); fine lines are never carved. (Until 2026-10-30 each part was decided on its own,
// cut where it was somewhere 4 mm across: the junctions of a thin "m" qualified, so in "Sam" only the m was carved
// and sat flatter than S and a.) `above` is one list of stages per piece. Worked in the patch's own (unturned) frame.
const carved = new Map(), CARVE_W = 3.4;
function carve(p, stages, above, fab) {
  const a = ((p.rot || 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), f = p.flip ? -1 : 1;
  const local = above.map((sts) => sts.flatMap((s) => s.paths).map((q) => q.map(([x, y]) => [((x - p.x) * c + (y - p.y) * sn) * f, -(x - p.x) * sn + (y - p.y) * c])))
    .filter((g) => g.length);
  if (!local.length) return stages;
  let h = local.length;
  for (const g of local) { h = Math.imul(h ^ g.length, 16777619) | 0; for (const q of g) for (const [x, y] of q) h = (Math.imul(h ^ Math.round(x * 10), 16777619) ^ Math.round(y * 10)) | 0; }
  const key = JSON.stringify([{ ...p, x: 0, y: 0, rot: 0 }, h, fab, wt]);
  if (!carved.has(key)) {
    const R = 4, edge = inset(shapeOf(p).path(p.w, p.h), 1.0), [x0, y0, x1, y1] = bounds(edge);
    const w = Math.ceil((x1 - x0) * R) + 2, hh = Math.ceil((y1 - y0) * R) + 2, n = w * hh;
    // only well inside the patch's outline (a hole crossing it would add fill outside it, even-odd)
    const inside = { w, h: hh, data: new Uint8Array(n) };
    for (let y = 0; y < hh; y++) {
      const Y = y0 + y / R, cut = [];
      for (let i = 0; i < edge.length; i++) { const [ax, ay] = edge[i], [bx, by] = edge[(i + 1) % edge.length]; if ((ay <= Y) !== (by <= Y)) cut.push(ax + ((Y - ay) * (bx - ax)) / (by - ay)); }
      cut.sort((u, v) => u - v);
      for (let k = 0; k + 1 < cut.length; k += 2) for (let x = Math.max(0, Math.ceil((cut[k] - x0) * R)); x <= Math.min(w - 1, Math.floor((cut[k + 1] - x0) * R)); x++) inside.data[y * w + x] = 1;
    }
    const room = distanceTransform(inside), hole = { w, h: hh, data: new Uint8Array(n) };
    for (const g of local) {
      const m = { w, h: hh, data: new Uint8Array(n) };
      const dot = (x, y) => { const X = Math.round((x - x0) * R), Y = Math.round((y - y0) * R); if (X >= 0 && Y >= 0 && X < w && Y < hh) m.data[Y * w + X] = 1; };
      for (const q of g) for (let i = 1; i < q.length; i++) {
        const [ax, ay] = q[i - 1], [bx, by] = q[i], k1 = Math.ceil(Math.hypot(bx - ax, by - ay) * R * 2);
        for (let k = 0; k <= k1; k++) dot(ax + ((bx - ax) * k) / k1, ay + ((by - ay) * k) / k1);
      }
      // close over 0.4 mm (satin's needle points are 0.4 apart), then keep only what's 0.8 mm inside that
      const near = distanceTransform({ w, h: hh, data: m.data.map((v) => 1 - v) });
      const deep = distanceTransform({ w, h: hh, data: near.map((d) => (d <= 0.4 * R ? 1 : 0)) });
      // how wide the piece is: the median distance to its edge along the middles of its columns (pixels no
      // neighbour is deeper than), times two, less the 0.4 mm grown each side
      const mid = [];
      for (let y = 1; y < hh - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x, d = deep[i];
        if (d > 0 && d >= deep[i - 1] && d >= deep[i + 1] && d >= deep[i - w] && d >= deep[i + w]) mid.push(d);
      }
      mid.sort((u, v) => u - v);
      if (!mid.length || (2 * mid[mid.length >> 1]) / R - 0.8 < CARVE_W) continue;
      for (let i = 0; i < n; i++) if (deep[i] > 0.8 * R && room[i] > 1.5 * R) hole.data[i] = 1;
    }
    const holes = contours(hole).map((l) => l.map(([x, y]) => [x0 + x / R, y0 + y / R]))
      .filter((l) => l.length > 8 && Math.abs(l.reduce((s, q, i) => s + q[0] * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * q[1], 0)) / 2 >= 20);
    carved.set(key, holes.length ? patchFill(p, [edge, ...holes], fab) : null);
    if (carved.size > 12) carved.delete(carved.keys().next().value);
  }
  const fill = carved.get(key); if (!fill) return stages;
  const place = placer(p), placed = fill.map((st) => ({ ...st, label: label(p), paths: st.paths.map((q) => moved(q, place)) }));
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
    const at = (u, v) => (ax ? [v, u] : [u, v]);
    const marks = crossSpots(items, best, at, { lo, hi, L, C, c0, c1 }) || [at(best.m, c0 + (c1 - c0) * 0.25), at(best.m, c0 + (c1 - c0) * 0.75)];
    return [{ pieces: best.A.map((i) => i.p), marks, end: true }, { pieces: best.B.map((i) => i.p), marks, end: false }];
  }
  return null;
}
// Where the two crosses go: on a line between the halves (u, as near the middle of the gap as both hoopings allow),
// each 1.5 mm clear of every stitch (a cross sewn on the "e" of one half, or under the next half's satin, can't be
// pulled out), near a quarter and three quarters of the way across, at least 20 mm apart when the hooping allows
// (the further apart, the truer the second hooping lines up). null when no line has two clear spots.
function crossSpots(items, best, at, { lo, hi, L, C, c0, c1 }) {
  const ink = cloud(items.flatMap((i) => pieceStitches(i.p)));
  const ext = (g) => [Math.min(...g.map((i) => i.b[lo])), Math.max(...g.map((i) => i.b[hi]))];
  const [aLo, aHi] = ext(best.A), [bLo, bHi] = ext(best.B);
  const vLo = c1 - C + 5, vHi = c0 + C - 5, mid = (c0 + c1) / 2, half = Math.max((c1 - c0) / 4, Math.min(20, (vHi - vLo) / 2));
  const t1 = Math.max(vLo, mid - half), t2 = Math.min(vHi, mid + half), apart = Math.min(20, t2 - t1);
  let pick = null;
  for (let du = 0; du <= L && !(pick && 2 * du > pick.cost); du++) {
    for (const u of du ? [best.m + du, best.m - du] : [best.m]) {
      if (Math.max(aHi, u + 5) - Math.min(aLo, u - 5) > L || Math.max(bHi, u + 5) - Math.min(bLo, u - 5) > L) continue;
      const clear = [];
      for (let v = Math.ceil(vLo); v <= vHi; v++) if (!near(ink, crosses([at(u, v)]), 1.5)) clear.push(v);
      let v1 = null, v2 = null;
      for (const v of clear) if (v1 == null || Math.abs(v - t1) < Math.abs(v1 - t1)) v1 = v;
      for (const v of clear) if (v1 != null && Math.abs(v - v1) >= Math.max(12, apart) && (v2 == null || Math.abs(v - t2) < Math.abs(v2 - t2))) v2 = v;
      if (v2 == null) continue;
      const cost = Math.abs(v1 - t1) + Math.abs(v2 - t2) + 2 * du;
      if (!pick || cost < pick.cost) pick = { cost, marks: [at(u, v1), at(u, v2)] };
    }
  }
  return pick?.marks || null;
}
// The cross the second hooping lines up on (the first mark), named as the machine shows it: "top", "bottom", "left" or
// "right" ("the left cross" was said even when the crosses sat one above the other). With the hoop turned the machine
// shows the layout a quarter turn clockwise: the preview's top is the machine's right.
export function crossName(marks, turned = false) {
  const [a, b] = turned ? marks.map(([x, y]) => [-y, x]) : marks;
  return Math.abs(a[1] - b[1]) >= Math.abs(a[0] - b[0]) ? (a[1] < b[1] ? "top" : "bottom") : a[0] < b[0] ? "left" : "right";
}
// basting crosses (long stitches, easy to pull out), each starting and ending at its centre
const crosses = (marks) => marks.map(([x, y]) => [[x, y], [x + 5, y], [x - 5, y], [x, y], [x, y + 5], [x, y - 5], [x, y]]);

// Sew the pieces in list order. Neighbouring stages in the same thread share one colour block unless a stage
// needs a pause. A stage in a thread used earlier moves up to join it (one pause fewer) when it overlaps nothing
// it would jump ahead of, so what lies on top of what never changes; appliqué stages never move.
// Returns the design and the steps to show (what the machine sews, what the person does at pauses).
// opts: { fabric: key of FABRICS, thread: key of THREADS, baste: a basting box round everything first (floating, towels), dragging (a piece
//         is mid-drag: quilting stays as it was, for speed; the drop composes it properly),
//         marks: { pts, end } alignment crosses for a split design (end: after everything, else first) }
export function compose(pieces, hoop, opts = {}) {
  const was = wt;
  wt = THREADS[opts.thread] ? String(opts.thread) : "auto";
  try { return build(pieces, hoop, opts); } finally { wt = was; }
}
function build(pieces, hoop, opts) {
  const fab = FABRICS[opts.fabric] ? opts.fabric : "cotton";
  const fit = fittedSizes(pieces);
  pieces = pieces.map((p) => (fit.has(p.id) ? { ...p, size: fit.get(p.id) } : p));
  const box = (paths) => { const [x0, y0, x1, y1] = bounds(paths.flat()); return [x0 - 1, y0 - 1, x1 + 1, y1 + 1]; };
  const hits = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const order = [], last = [], edges = [], staged = pieces.map((p) => pieceStages(p, fab).map((st) => ({ label: label(p), ...st })));
  pieces.forEach((p, i) => { if (QUILTED(p)) staged[i] = withQuilt(p, staged[i], staged.filter((_, j) => j !== i).flat(), opts.dragging); });
  // patches: no fill under what's sewn on them (fine-line lettering excepted)
  pieces.forEach((p, i) => {
    if (p.kind !== "frame" || p.border !== "patch" || opts.dragging) return;
    const above = pieces.slice(i + 1).map((q, k) => (q.kind === "frame" || q.style === "line" ? [] : staged[i + 1 + k].filter((s) => !s.under && !s.fabric)));
    staged[i] = carve(p, staged[i], above, fab);
  });
  for (const st of staged.flat()) {
    if (!st.paths.length) continue;
    const s = { ...st, box: box(st.paths) };
    if (s.last) { last.push(s); continue; }   // two-sided in-the-hoop edge: after everything that goes on the front
    if (s.edge) { edges.push(s); continue; }   // a patch's satin edge: after what's sewn on the patch
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
  order.push(...edges, ...last);
  if (opts.marks && order.length) {
    const color = opts.marks.end ? order[order.length - 1].color : order[0].color, paths = crosses(opts.marks.pts);
    if (opts.marks.end) order.push({ color, paths, label: "Alignment crosses", sews: "Sews two alignment crosses where the next hooping lines up." });
    else order.unshift({ color, paths, label: "Alignment crosses", pause: true,
      // (`which`: the cross named as the machine shows it, said by the caller when the hoop is turned)
      you: `Hoop the fabric again, as straight as you can, with both crosses from the first hooping inside the hoop. Before you press Start, use the machine's layout arrows to move the design until the needle comes down on the centre of the ${opts.marks.which || crossName(opts.marks.pts) + " cross"} (turn the handwheel to check). Press Start: the crosses should sew right on top of the old ones. If they don't, stop, move the design and try again.`,
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
      // a fabric step in a new thread says so first: "Take the hoop off…" after blue, in red, got sewn in blue
      const change = steps.length && st.color !== thread;
      // (the thread's description in the file in plain ASCII: “Noah” in UTF-8 came back as â€œNoahâ€ in readers)
      d.color(st.color, ascii(st.label)); thread = st.color;
      steps.push({ color: st.color, sews: [], you: st.you ? (change ? `Change to the next thread. ${st.you}` : st.you) : steps.length ? "Change to the next thread and press Start." : null,
        fabric: !!st.fabric, under: !!st.under || !!st.fabric, early: false, cut: st.fabric && !st.nocut ? st.cut || st.paths : null });
    }
    steps[steps.length - 1].sews.push(st.sews);
    if (st.early) steps[steps.length - 1].early = true;
    // something you'd see joining a tack-down (quilting, lettering in the same thread) shows the block in the preview;
    // the tack line sits at the edge, under the satin that comes later
    const cur = steps[steps.length - 1];
    if (cur.under && !st.under && !st.fabric) cur.under = false;
    for (const q of st.paths) d.path(q, true, !!q.gap, q.lockAt);
  }
  if (!steps.length) throw Object.assign(new Error("Nothing to stitch yet: type some words, or pick a starting idea."), { empty: true });
  if (opts.baste) after.push("Unpick the basting box (snip every few stitches on the back, then pull it out from the front).");
  d.finish({ untiny: true });
  // step 1 starts with hooping: the bare stabilizer for in-the-hoop projects, the patch fabric for a patch
  const first = order[0], hoopIt = first?.bare ? "Hoop tear-away stabilizer on its own (no fabric yet)" : first?.patch ? "Hoop the felt or twill with the stabilizer under it"
    : order.some((s) => s.sandwich) ? "Hoop the quilt sandwich (or float it on hooped tear-away stabilizer)" : FABRICS[fab].hoop;
  return { design: d, steps, after, before, hoop: hoopIt, tip: FABRICS[fab].tip };
}
