/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Lettering: a word drawn and thinned to its strokes (kept per word and font), counters and notches kept open,
// arches, a column's shape along its stroke (ends, sides, taper, a big script's thick and thin), and the strokes
// sewn as centre runs and satin columns (stitchLetters). Laying lettering out and placing it is pieces.js.
// (Part of pieces.js until 2026-11.)
import { fontOf } from "../core/fonts.js";
import { LINK, letterRecipe } from "../core/recipes.js";
import { back, bounds, followRun, run, satin, zigzag } from "../core/geom.js";
import { counterPockets, distanceTransform, order } from "../core/raster.js";
import { strokes } from "../core/text.js";
import { initials, swashes } from "../core/typed.js";

// ---------- lettering ----------
export const lettering = new Map();   // font + text -> centre-line strokes (rendering is the slow part)
// A cache hit moved to the end, so the oldest dropped is the least recently used: dropped in the order made, a design's
// own pieces fell out under the sizes a fit or a fix tries (16 sizes of one name), and every change rebuilt them.
export function recent(map, key) { const v = map.get(key); map.delete(key); map.set(key, v); return v; }
// Nothing drawn before its font has loaded is cached: it was drawn in the browser's fallback font, and caching it
// kept that lettering after the font arrived.
// (a family name the CSS parser can't read, from a crafted saved design, is a font that isn't ready, not a DOMException)
export const fontReady = (family) => { try { return !family || typeof document === "undefined" || document.fonts.check(`40px "${family}"`); } catch { return false; } };
// A script's thick and thin: the ink's width across each stroke at every point of its line, px (2 x the distance to the
// paper, less the pixel), as { start, w } (null off the ink), smoothed to the 35th percentile of the next stroke's
// width either way so a junction's blob or a crossing doesn't widen the column there.
function inkWidths(edges, info) {
  const { w: W, h: H } = info.mask, dt = distanceTransform(info.mask), r = Math.max(2, Math.round(info.stroke * 1.2));
  return edges.map((e) => {
    const p = e[2];
    if (!Array.isArray(p) || p.length < 2) return null;
    const raw = p.map(([x, y]) => { const X = Math.round(x), Y = Math.round(y); return X >= 0 && Y >= 0 && X < W && Y < H && dt[Y * W + X] > 0 ? 2 * dt[Y * W + X] - 1 : null; });
    const w = raw.map((v, i) => {
      if (v === null) return null;
      const win = raw.slice(Math.max(0, i - r), i + r + 1).filter((u) => u !== null).sort((a, b) => a - b);
      return win[Math.floor(win.length * 0.35)];
    });
    return { start: p[0], w };
  });
}
// Swashes: lengths in x-heights, as the bookmark had them (a script tail longer than its lead-in; print fonts get
// straight dashes either side instead)
const SWASH = { lead: 1.8, tail: 2.6, dash: 2.2 };
export function letterStrokes(text, family, spacing = 0, kern = null, lead = false, tail = false) {
  const key = family + "\n" + text + "\n" + spacing + (kern ? "\n" + kern.join() : "") + (lead || tail ? `\n~${+lead}${+tail}` : "");
  if (lettering.has(key)) return recent(lettering, key);
  const print = !!fontOf(family).print;
  const curls = lead || tail ? { leadIn: lead ? (print ? SWASH.dash : SWASH.lead) : 0, tail: tail ? (print ? SWASH.dash : SWASH.tail) : 0 } : {};
  // (knots: junctions joined by a stroke shorter than 0.75 of its width become one; `skeletonEdges`)
  const { edges, info } = inks.get(key) || strokes(text, family, { knots: 0.75, ...(print ? { deco: "dash", join: false } : { tongues: true }), ...(spacing ? { spacing } : {}), ...(kern ? { kern } : {}), ...curls });
  // (`drawAhead`'s first step: the drawing only, the rest a task later)
  if (inking) { if (!inks.has(key) && fontReady(family)) { inks.set(key, { edges, info }); drawn++; if (inks.size > 8) inks.delete(inks.keys().next().value); } throw INKED; }
  inks.delete(key);
  // (each counter with the strokes round its widest spot: the ones within a pixel and a half of that circle)
  const lines = edges.map((e) => e[2]), near = (p, [x, y]) => Math.min(...p.map((q) => Math.hypot(q[0] - x, q[1] - y)));
  const counters = counterPockets(info.mask, lines, info.stroke).map((c) => ({ ...c, edges: lines.flatMap((p, i) => (near(p, c.at) <= c.peak + 1.5 ? [i] : [])) }));
  // (a corner's ink width across it, px, from the junction out: `taper`)
  const tapers = edges.map((e) => (e[3] ? { start: e[2][0], w: e[3], atEnd: e[3][0] >= e[3][e[3].length - 1], cos: e[4] } : null));
  // (how the ink ends round a loose end, px: `endShape` in raster.js)
  const ends = edges.map((e) => (e[5] ? { start: e[2][0], ...e[5] } : null));
  const sides = edges.map((e) => (e[6] ? { start: e[2][0], w: e[6], path: e[2] } : null));
  const out = { edges, comps: order(edges), info, counters, notches: notches(edges, info.stroke), tapers, ends, sides, thick: print ? null : inkWidths(edges, info) };
  drawn++;
  if (fontReady(family)) {
    lettering.set(key, out);
    if (lettering.size > 60) lettering.delete(lettering.keys().next().value);
    paced();
  }
  return out;
}
// How far apart (mm, centre line to centre line) two pieces of script may be and still be sewn in one go, the needle
// stitching from the end of one to the start of the next (core/recipes.js LINK)
export const linkReach = (satinW) => (satinW ? Math.max(Math.min(satinW + LINK.pull + LINK.gap, LINK.most), satinW / 2 + LINK.under) : LINK.line);
// the widest lettering satin, mm: wider stitches lie loose and snag, and the writer cuts any over 7 mm in two
const WIDE = 5;
// Letters as [pts, "run"|"satin"] in mm: `size` is the height of the lettering, baseline at y = 0, centred across.
// `kern`: room after each letter (fractions of the size), for the text as given (one line, already trimmed)
// `~` at the start or end of the words is a swash there (`swashes` in typed.js; kern entries for the `~`s are dropped
// with them)
// `warp`: where a point of these letters (mm) goes when they are bent (an arch, a wave, a bridge): the pieces are
// chained by the moves as they will be sewn (`order` at)
export function letters(text, family, size, style = "auto", spacing = 0, kern = null, chain = true, warp = null) {
  text = (text || "").replace(/\s*\n\s*/g, " ").trim();
  const sw = swashes(text);
  if (kern && (sw.cut[0] || sw.cut[1])) kern = kern.slice(sw.cut[0], kern.length - sw.cut[1]);
  text = sw.text;
  if (!text) return { parts: [], satinW: 0 };
  const { edges, info, counters, notches, tapers, ends, sides, thick, ...ls } = letterStrokes(text, family, spacing, kern && kern.some((v) => v) ? kern : null, sw.lead, sw.tail);
  let comps = ls.comps;
  const all = comps.flatMap((c) => c.flatMap(([p]) => p));
  if (!all.length) return { parts: [], satinW: 0 };
  // (sized by the letters alone: a swash dips under the baseline and a tail curls up, and the name keeps its size
  // with or without them)
  let sized = info.sized;
  if (sw.lead || sw.tail) { const body = sized.filter((q) => q[0] >= info.firstX && q[0] <= info.lastX); if (body.length) sized = body; }
  // (sized by the strokes before their loose ends reached out to the ink's edge, so a word keeps its size)
  // (strokes never count as less than half the x-height tall, a whole one for marks alone: a "." 20 mm tall was
  // 5880000000000 mm wide, and a stand-in keycap emoji thinned to a point in Meow Script; any word's strokes are taller)
  const [x0, y0, x1, y1] = bounds(sized), s = size / Math.max(y1 - y0, (/[\p{L}\p{N}]/u.test(text) ? 0.5 : 1) * info.mid), cx = sized === info.sized ? (x0 + x1) / 2 : (() => { const b = bounds(info.sized); return (b[0] + b[2]) / 2; })();
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
  // A font whose own stroke is wider than that (bold or big lettering: Quicksand at 60 mm has a 7.5 mm stroke) is sewn
  // up to WIDE, its stroke's width where it can: capped at 3.5 it sewed as a skinny line down the middle of each
  // letter. (Never wider than the stroke there: thin scripts keep their 12 % floor and 3.5 mm cap.)
  const w = Math.min(xh * 0.2, Math.max(Math.min(3.5, Math.max(stroke, xh * 0.12, Math.min(xh * 0.15, 1.2))), Math.min(stroke, WIDE)));
  const satinW = style === "line" ? 0 : style === "satin" ? Math.max(1.0, w) : w >= 0.8 ? w : 0;
  // script pieces (a capital the font leaves apart, separate words) start where the last one began, when that's close
  // enough to stitch across rather than trim: each walk ends where it began, its last satin up to half a column (and
  // pull) off its centre line, and Design.path stitches moves up to 2 mm (`order` near; print letters always jump),
  // with half a mm to spare (a quarter left two 2.0-2.2 mm loose threads in 167 files). (Arches and waves stretch the
  // gaps: `laid` is where each point is sewn.)
  // (Until S1 the column's half width was taken off that: only pieces whose centre lines came within 0.2-0.8 mm were
  // chained, and none from a 2.4 mm column up, so pieces whose columns touch or overlap were trimmed apart: 45 of them
  // over the arched batch files. Now `linkReach`, and the stitch across is allowed for by `stitchLetters`.)
  const reach = linkReach(satinW);
  const laid = warp && ((q) => { const m = warp([(q[0] - cx) * s, (q[1] - info.baseline) * s]); return [m[0] / s, m[1] / s]; });
  // (a move is loose thread up to 5 mm from the column's edge the needle leaves, half a column and pull off the
  // centre lines the starts are measured between: as print below. Two dots 4.2 mm apart were reckoned a trim.)
  if (chain && !print && reach > 0.2) comps = order(edges, reach / s, (5.5 + (satinW ? satinW / 2 + 0.3 : 0)) / s, false, laid, Math.min(reach / 2, 0.35) / s, (satinW || 0.9) / s);
  // Print letters each start where the move from the last one is either over 5 mm (trimmed; the move runs from the end
  // of one column to the start of the next, half a column and pull off the centre lines, so 0.5 mm to spare) or, where
  // no start makes it that long, the leftmost (Quicksand "Abbie dog" at 5 mm: 5 loose threads in 28 mm)
  else if (chain && print) comps = order(edges, 0, (5.5 + (satinW ? satinW / 2 + 0.3 : 0)) / s, true, laid, 0, (satinW || 0.9) / s);
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
    // (a fine line has no column: cut by the whole stroke, its run stops where the strokes' centre lines meet)
    return { atEnd: same ? t.atEnd : !t.atEnd, prof, cut: Math.max(0, stroke - satinW) / Math.max(0.5, t.cos || 1) };
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
  // (the eighth: a script's thick and thin, [[fraction along, column width mm], ...] as its path runs, once its column
  // is 2 mm or more (big lettering): the ink's width, from `THIN` mm (hairlines) to the column's cap. A 60 mm Great
  // Vibes name sewed as an even 2.6 mm line, a marker pen's, and its j's dot a tick. Smaller, the ink's hairlines are
  // narrower than a column can be sewn and its thick strokes hardly wider than the column.)
  const calli = thick && satinW >= 2 && style !== "line", lo = Math.max(THIN, satinW * 0.45);
  const thickOf = (p, e) => {
    const t = calli && thick[e];
    if (!t) return null;
    // (by point: a walk may start part way along a stroke, so p can be some of it, either way round)
    const at = t.map || (t.map = new Map(edges[e][2].map(([x, y], i) => [x + "," + y, t.w[i]]))), d = [0];
    for (let i = 1; i < p.length; i++) d.push(d[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    const hi = Math.min(WIDE, xh * 0.2, caps.get(e) || Infinity);
    const L = d[d.length - 1] || 1, rows = p.map(([x, y], i) => { const v = at.get(x + "," + y); return [d[i] / L, v == null ? null : Math.min(hi, Math.max(lo, v * s))]; });
    return rows.some((r) => r[1] !== null) ? rows : null;
  };
  const parts = comps.flatMap((c, k) => c.map(([p, mode, e], j) => [p.map(([x, y]) => [(x - cx) * s, (y - info.baseline) * s]), mode, print && k > 0 && j === 0, caps.get(e) || 0, taperOf(p, e), endsOf(p, e), sidesOf(p, e), thickOf(p, e)]));
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
export const OPEN = 0.8;
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
export function bend(parts, shape, a, b = a) {
  const f = bender(shape, a, b);
  return parts.map(([p, ...r]) => [densify(p, 1).map(f), ...r]);
}
// (where one point goes)
export function bender(shape, a, b = a) {
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
  return shape === "up"
    ? ([x, y]) => { const [px, py, nx, ny] = at(x); return [px - y * nx, py - y * ny]; }
    : ([x, y]) => { const [px, py, nx, ny] = at(half - x); return [px + y * nx, py + y * ny]; };
}
// extra points so long straight runs follow the curve
export function densify(p, step) {
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
// a big script's column width along it (`thickOf`'s rows, [fraction, mm]): { at(t), max }. Gaps (off the ink) take
// the width either side.
const THIN = 1.2;
function inkAt(rows, w, least = 0) {
  const ok = rows.filter((r) => r[1] !== null);
  // (sewn as it was where that's the ink's width anyway)
  if (!ok.some((r) => Math.abs(Math.max(least, r[1]) - w) > 0.05 * w)) return null;
  const f = ok.map((r) => r[0]), v = ok.map((r) => Math.max(least, r[1]));
  const at = (t) => {
    let lo = 0, hi = f.length - 1;
    if (t <= f[0]) return v[0];
    if (t >= f[hi]) return v[hi];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (f[m] <= t) lo = m; else hi = m; }
    return f[hi] > f[lo] ? v[lo] + ((v[hi] - v[lo]) * (t - f[lo])) / (f[hi] - f[lo]) : v[lo];
  };
  return { at, max: Math.max(...v) };
}
export function stitchLetters(parts, satinW, fab = "cotton", small = false, weight = "auto") {
  const { zigzagFrom: zz, pull, gap: density } = letterRecipe(fab, weight, small);   // (core/recipes.js LETTERS)
  let gap = false, last = null, lastW = satinW;   // (a skipped stroke hands its jump on to the next one sewn)
  let linked = null;   // (where the last piece ended, while the next waits for its first stitches: `linkReach`)
  if (!satinW) parts = pointed(parts);
  return parts.map(([p0, mode, g, cap, taper, ends, sides, thick]) => {
    // (a corner is narrowed to the ink, and stops where that's under the narrowest column: not on a towel, which
    // keeps its wide columns, nor in a fine line (`pointed`); its centre run goes on to where the point is)
    const w = cap && fab !== "towel" ? Math.min(cap, satinW) : satinW;   // (a towel keeps its wide column)
    const tp = taper && satinW && fab !== "towel" ? tapered(p0, taper) : null, p = tp ? (mode === "run" ? tp.run : tp.p) : p0;
    const shaped = satinW && fab !== "towel" && !tp, clip = shaped && sides ? sideClip(p, sides, w) : null;
    const en = shaped && ends ? endCut(p, ends, w, clip) : clip ? { p, shape: clip, first: 0, last: 0 } : null;
    const q = en && mode !== "run" ? en.p : p;
    // (a big script's column follows the ink's thick and thin, from THIN to WIDE, a fifth of the x-height or a
    // counter's cap: `thickOf`)
    // (its way out under it is a centre run: the zigzag, as wide as the usual column less 0.8, stuck out of hairlines)
    // (a short stroke, a dot's or a hook's, is never narrower than the usual column: thinning leaves a little ring in a
    // round dot, and its ink measured from there to the dot's edge sewed it as a ring)
    const big = thick && !tp && fab !== "towel", ink = big ? inkAt(thick, w, length(p) < 4 * w ? w : 0) : null;
    const r = q.length < 2 ? [] : sewPart(q, mode, ink && mode !== "run" ? ink.max : w, tp ? tp.wAt || CENTRE : ink?.at, p0, en, w, !!big);
    gap ||= !!g;
    if (gap && r.length) { r.gap = true; gap = false; }
    // (a run satined back over: a lock at its start goes 1 mm in along the stroke, under that satin; never past halfway)
    if (mode === "run" && satinW && r.length > 2) r.lockAt = along(p, Math.min(1, length(p) / 2));
    // (a run out from the node the last column came back to: the needle is on that column, at most half of it from
    // the centre line, and stitches to it under the column rather than jumping: from WIDE columns' edges it was over
    // 2 mm, a trim and locks at each junction)
    // (the column before may be a big script's thick stroke, wider than w: `lastW`)
    const from = last, fromW = lastW; last = p0[p0.length - 1]; lastW = ink && mode !== "run" ? Math.max(w, ink.max) : satinW;
    const on = satinW && r.length && !r.gap && from && Math.hypot(p0[0][0] - from[0], p0[0][1] - from[1]) < 1e-6;
    if (mode === "run" && on) r.reach = (fromW + 0.3 + pull) / 2 + 0.1;
    else if (on && r.reach) r.reach = Math.max(r.reach, (fromW + 0.3 + pull) / 2 + 0.1);
    // (a script piece that starts within `linkReach` of where the last one ended is stitched to: the needle is on
    // that column's edge, up to half of it further off than the centre lines are. Handed on past a part that sews
    // nothing, a dot's run, like `gap`; measured to where the stitches start, a dot's being its own end.)
    // (0.3 mm to spare over what `order` reckoned between centre lines: a start it chained and this refused would be
    // a 2 mm loose thread)
    if (from && Math.hypot(p0[0][0] - from[0], p0[0][1] - from[1]) > 1e-6) linked = g ? null : from;
    if (r.length) {
      const d = linked && !r.gap ? Math.hypot(r[0][0] - linked[0], r[0][1] - linked[1]) : Infinity;
      if (d <= linkReach(satinW) + 0.3) r.reach = Math.max(r.reach || 0, d + (satinW ? (fromW + 0.3 + pull) / 2 : 0) + 0.1);
      linked = null;
    }
    return r;
  });
  function sewPart(p, mode, satinW, wAt = null, self = p, en = null, base = satinW, ink = false) {
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
    // (by the usual column `base`, as its run is: a big script's satin may be wider, and a stroke sewn out as a run and
    // back as a dot left the walk 2-3 mm off, a loose thread)
    if (satinW && length(p) < base) {
      const c = p[p.length >> 1];
      if (!parts.some(([q]) => q !== self && length(q) >= base && q.some(([x, y]) => Math.hypot(x - c[0], y - c[1]) < base))) {
        if (mode === "run") return [];
        const a = p[0], b = p[p.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = L > 0.01 ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : [1, 0];
        // (a big script's dot (`inkAt`) is the ink's size: as wide as it, at least the usual column, and its line plus
        // most of that long, rounded at its ends. As a 1.3 mm satin it was a tick on the j of a 60 mm name)
        // (a round dot's line is 0.6 of a stroke, about 0.55 of its width: `skeletonEdges`)
        // (only a dot alone: several short strokes from one point (Yellowtail's i dot thins to a little star) stay as
        // they were, or the bigger dots left loose threads between them)
        // (its own run is the same points the other way)
        const twin = (q) => q.length === self.length && q.every((v, i) => { const w = self[self.length - 1 - i]; return v[0] === w[0] && v[1] === w[1]; });
        const alone = ink && !parts.some(([q]) => q !== self && !twin(q) && [q[0], q[q.length - 1]].some((e) => self.some((f) => Math.hypot(e[0] - f[0], e[1] - f[1]) < 0.5)));
        const dw = alone ? Math.max(base, satinW) : base, h = Math.max(alone ? dw + Math.max(0, L - 0.6 * dw) : L, 1) / 2, e1 = [c[0] - u[0] * h, c[1] - u[1] * h], e2 = [c[0] + u[0] * h, c[1] + u[1] * h];
        return [e1, ...satin([e1, c, e2], dw, density, 0.1 + pull, false, false, alone ? (t) => dw * Math.max(0.5, Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2))) : null)];
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
    // (`reach`: the needle, at the end of the column before, is at most half this column from its start, under it. A
    // knit's wider pull took that past the 2 mm jump rule: a Satisfy Z sewed 8 trims and locks round one junction,
    // 26 hits/mm²: tests/browser/engine_fuzz.html)
    if (satinW) {
      const pc = (base >= 1.5 ? 0.3 : 0.1) + pull, r = [p[0], ...satin(p, satinW, density, pc, false, false, wAt, en?.shape)];
      r.reach = (Math.max(base, satinW) + pc) / 2 + 0.1;
      return r;
    }
    const r = spaced(followRun(p, 1.6, 0.1, 0.8)), back = r.slice().reverse();   // the walk's way back: back, forth and back again
    return r.length > 1 ? [...r, ...back.slice(1), ...r.slice(1)] : r;
  }
}
// A fine line's corners (an A's apex, a V's point): the strokes into the point are carried on to where their centre
// lines meet (`tapered`'s tip with the whole stroke as its cut), bending over their last stretch, and the corner stroke
// itself isn't sewn. Sewn out and back to the font's tip, it stood 1-1.3 mm above where the strokes met (Josefin's
// and Quicksand's A at 6 mm read as a Y); stopped at the meeting point, it was still a 0.6 mm stub over a junction that
// thinning puts lower.
function pointed(parts) {
  const moves = [];
  for (const [p, , , , taper] of parts) {
    if (!taper || p.length < 2) continue;
    const q = taper.atEnd ? p.slice().reverse() : p, L = length(q);   // (from the point in)
    let tip = 0;
    for (const [d, w] of taper.prof) { if (w - taper.cut > 0) break; tip = d; }
    const J = q[q.length - 1], M = along(q, Math.min(tip, L));
    if (!moves.some((m) => m.J[0] === J[0] && m.J[1] === J[1])) moves.push({ J, M });
  }
  const at = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  // (only where other strokes end at the junction, to carry on)
  const ok = moves.filter((m) => parts.some(([p, , , , t]) => !t && p.length > 1 && (at(p[0], m.J) || at(p[p.length - 1], m.J))));
  if (!ok.length) return parts;
  // (each point within R of the junction along the stroke moves by (M - J), less linearly with the distance)
  const bend = (p, { J, M }) => {
    const D = [M[0] - J[0], M[1] - J[1]], R = Math.min(length(p) * 0.6, Math.max(2 * Math.hypot(...D), 0.8));
    let d = 0;
    return p.map((v, i) => { if (i) d += Math.hypot(v[0] - p[i - 1][0], v[1] - p[i - 1][1]); const f = Math.max(0, 1 - d / R); return [v[0] + D[0] * f, v[1] + D[1] * f]; });
  };
  let gap = false;   // (a dropped corner that started a separate piece hands its jump on)
  return parts.flatMap((part) => {
    const [p, , g, , taper] = part;
    if (taper && p.length > 1 && ok.some((m) => at(m.J, taper.atEnd ? p[0] : p[p.length - 1]))) { gap ||= !!g; return []; }
    let r = p;
    for (const m of ok) {
      if (r.length < 2) break;
      if (at(r[0], m.J)) r = bend(r, m);
      else if (at(r[r.length - 1], m.J)) r = bend(r.slice().reverse(), m).reverse();
    }
    const out = r === p && !gap ? part : [r, part[1], part[2] || gap, ...part.slice(3)];
    gap = false;
    return [out];
  });
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
export function along(p, d) {
  for (let i = 1; i < p.length; i++) {
    const L = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (L >= d) { const t = d / (L || 1); return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]; }
    d -= L;
  }
  return p[p.length - 1];
}
export const length = (p) => p.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);
// no stitch shorter than 0.4 mm (tiny letters have tiny strokes; short stitches pile thread and break it)
export function spaced(p, min = 0.4) {
  const out = [p[0]], end = p[p.length - 1];
  for (const q of p.slice(1)) if (Math.hypot(q[0] - out[out.length - 1][0], q[1] - out[out.length - 1][1]) >= min) out.push(q);
  // keep the stroke's real end (the next stroke starts there), dropping a kept point that sits too close to it
  if (out[out.length - 1] !== end) { if (out.length > 1 && Math.hypot(end[0] - out[out.length - 1][0], end[1] - out[out.length - 1][1]) < min) out.pop(); out.push(end); }
  return out;
}
// the lettering whose size matters: the words, or a monogram's middle letter (its sides are 0.68 of a 3-letter one,
// so with 3 letters that smaller size is what blurs first); null for other pieces
// (the sizes and counters only: the strokes' sewing order (`order`) is not worked out, which was most of the time
// for each size tried: duplicating a towel name searched ~90 sizes, 1.2 s)
export function bulk(p) {
  if (p.kind !== "text" && p.kind !== "monogram") return null;
  const chars = initials(p.letters);
  if (p.kind === "text") return letters(p.text, p.font, p.size, p.style, 0, null, false);
  // (a letter with a tail is sewn bigger: `initialSizes`)
  const { sizes } = initialSizes(chars.slice(0, 3), p.font, p.size), at = chars.length > 1 ? sizes[1] : sizes[0] ?? p.size;
  return letters(chars[1] || p.letters, p.font, chars.length === 3 ? at * 0.68 : at, p.style, 0, null, false);
}
// Lettering drawn ahead of the stitches, one step at a time (its lines, then its words as one line for `bulk`), each
// step true when it drew something new: the Design tab draws new words a task apart from stitching them (a 22-letter
// line drew and stitched in one 0.5-0.8 s task on every key). Nothing here decides anything: it only fills the cache.
// (a long line's drawing and thinning, then its counters and sewing order, are two steps: `inking`)
let drawn = 0, inking = false;
// (for `drawAhead`: how many drawings so far, and whether the next is a drawing-only step)
export const drawings = () => drawn;
export function inkOnly(on) { inking = on; }
const inks = new Map(), INKED = new Error("inked");
// `pacer`: while `on`, new lettering or stitches, once cached, throw PACED when the task has run 150 ms (from `since`),
// and `hit` says so: the editor's warnings (which try many sizes, lines, fonts and frames) catch it, let the page answer,
// and start again with all that cached (a long line's fixes held the page 1.5 s; on a patch, growing the frame refilled
// it 25 times, 3.5 s). Never on outside them, so nothing else is cut short.
export const pacer = { on: false, hit: false, since: 0 };
export const PACED = new Error("paced");
export function paced() { if (pacer.on && performance.now() - pacer.since > 150) { pacer.hit = true; throw PACED; } }
// whether bulk(p) is worked out already: a long text drawn again as one line takes a while (0.3-0.7 s for three
// lines), so what only needs it for a tip or a label can say so a moment later instead of holding up the preview
export function bulkReady(p) {
  if (p.kind !== "text" && p.kind !== "monogram") return true;
  const chars = initials(p.letters), text = ((p.kind === "text" ? p.text : chars[1] || p.letters) || "").replace(/\s*\n\s*/g, " ").trim();
  return !text || lettering.has(p.font + "\n" + text + "\n0");
}
// Automatic lettering this small sews as a fine line (its satin would be under 1 mm): said, since a name shrunk by
// Fit to hoop or a long name in a batch turned thin without a word.
export function fineLine(p) {
  if ((p.style || "auto") !== "auto") return false;
  const l = bulk(p);
  return !!l && l.parts.length > 0 && l.satinW === 0;
}
// A monogram initial's tail: a lowercase letter with a descender (g j p q y, script f and z) is sized by its x-height,
// as the others are by their height, so its tail hangs below the shared baseline and a j's dot stands above (sized
// by its whole height and centred, the Pocket monogram's "jKm" sewed the j as a short stub floating above the m's
// baseline). { k: sewn size over the letter's size, up: its top above the baseline, down: its tail below, both in
// x-heights }, or null. Capitals keep their whole height (a script J's loop is the letter).
function hangs(c, font) {
  if (c === c.toUpperCase() || c !== c.toLowerCase()) return null;
  const l = letters(c, font, 10);
  return l.parts.length && l.xh && l.bottom > 0.12 * l.xh ? { k: 10 / l.xh, up: -l.top / l.xh, down: l.bottom / l.xh } : null;
}
// The size each initial is sewn at (three letters: small, BIG, small) and its `hangs`. Long tails (a script g's loop
// is longer than the letter) would make the monogram far taller than asked: then every letter shrinks alike so it's
// at most a quarter taller than its size (Sacramento "gp" at 20 mm was 45 mm tall), keeping the shared baseline.
// Each letter's ink is matched to the others' (`inkK`): a letter is sized by its strokes' centre lines, which stop half a
// stroke inside a flat top or foot but run to a pointed one's tip, so Josefin's P and K sewed as tall as the W meant to
// be 1½ times them (1.26). The middle letter (the first of one or two) keeps its size; the others are sized to its ink.
export function initialSizes(chars, font, size) {
  const h = chars.map((c) => hangs(c, font)), n = chars.length === 3 ? [0.68, 1, 0.68] : chars.map(() => 1);
  // (bodies centred on the middle: each letter's top and bottom from there)
  const top = Math.max(...n.map((v, i) => v * ((h[i] ? h[i].up : 1) - 0.5))), bottom = Math.max(...n.map((v, i) => v * (0.5 + (h[i] ? h[i].down : 0))));
  const f = Math.min(1, 1.25 / (top + bottom));
  // (a letter with a tail is sized by its x-height, `hangs`: left as it is, and no measure for the others)
  const ref = chars.length === 3 ? 1 : 0, r = h[ref] ? 0 : inkK(chars[ref], font), k = chars.map((c, i) => (r && !h[i] && i !== ref ? r / (inkK(c, font) || r) : 1));
  return { h, base: n.map((v) => v * f * size), sizes: n.map((v, i) => v * f * (h[i] ? h[i].k : k[i]) * size) };
}
// a letter's ink height over the height it's sized by (its strokes, before their ends reach out), or 0
const inks1 = new Map();
function inkK(c, font) {
  const key = font + "\n" + c;
  if (inks1.has(key)) return inks1.get(key);
  const { info } = letterStrokes(c, font), { w, h, data } = info.mask;
  let a = Infinity, b = -Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x]) { if (y < a) a = y; b = y; break; }
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of info.sized) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const v = b >= a && y1 - y0 > 0 ? (b - a + 1) / (y1 - y0) : 0;
  if (fontReady(font)) inks1.set(key, v);
  return v;
}
