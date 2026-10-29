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
  // satin as wide as the font's own stroke, within what sews well; a stroke thinner than ~1 mm can't take a satin
  // (it fills the counters and small script turns to mush), so it's a bean stitch: three runs along the line
  const stroke = info.stroke * s, satinW = stroke < 0.95 ? 0 : Math.min(3.2, Math.max(1.2, stroke));
  return { parts, satinW, xh: info.mid * s, top: (y0 - info.baseline) * s, bottom: (y1 - info.baseline) * s };
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
  return parts.map(([p, mode]) => {
    // thin lettering: a stroke under ~0.6 mm is a speck of the skeleton; skip it (the next stroke picks up there)
    if (!satinW && length(p) < 0.6) return [];
    if (mode === "run") return satinW ? run(p, 1.2) : spaced(run(p, 1.6));
    if (satinW) return satin(p, satinW, 0.38, 0.2);
    const r = spaced(run(p, 1.6)), back = r.slice().reverse();   // the walk's way back: back, forth and back again
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

// Lettering smaller than this blurs: the bulk of the letters (x-height, or caps) under ~4 mm.
export function minSize(p) {
  if (p.kind !== "text" && p.kind !== "monogram") return 0;
  const t = p.kind === "text" ? p.text : [...(p.letters || "")][1] || p.letters, size = p.kind === "monogram" && [...(p.letters || "")].length === 3 ? p.size * 0.68 : p.size;
  const l = letters(t, p.font, size);
  if (!l.parts.length || l.xh >= 4) return 0;
  return Math.ceil((p.size * 4) / l.xh);
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
// soft waves, not cusps: a satin border can't turn a sharp inside corner cleanly
function scallop(rx, ry, n = 360) {
  const bumps = Math.max(8, Math.round((Math.PI * (rx + ry)) / 11));
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2, k = 0.95 + 0.05 * Math.cos(bumps * t);
    return [rx * k * Math.sin(t), -ry * k * Math.cos(t)];
  });
}
function fitBox(pts, w, h) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return pts.map(([x, y]) => [((x - cx) / (x1 - x0)) * w, ((y - cy) / (y1 - y0)) * h]);
}
export const BORDERS = { line: "Thin line", bold: "Bold line", satin: "Satin border", applique: "Appliqué" };

// ---------- pieces ----------
// text:     { kind: "text", text, font, size, shape: "straight"|"up"|"down", radius, x, y, rot, color }
// monogram: { kind: "monogram", letters, font, size, x, y, rot, color }  (3 letters: small, BIG, small)
// frame:    { kind: "frame", shape, w, h, border: "line"|"bold"|"satin"|"applique", x, y, rot, color }
// file:     { kind: "file", name, blocks: [{ color, name, paths }], x, y, rot }  (an opened PES/DST, stitches as is)
//
// A piece sews in stages; each stage is one colour block. `pause` forces a machine stop even in the same thread,
// with `you` telling the person what to do at it.
export function pieceStages(p) {
  let stages = [];
  if (p.kind === "text") {
    const { parts, satinW, top, bottom } = letters(p.text, p.font, p.size);
    if (parts.length) {
      const paths = p.shape === "up" || p.shape === "down" ? stitchLetters(bend(parts, p.shape, Math.max(p.radius, 8)), satinW)
        : stitchLetters(parts.map(([q, m]) => [q.map(([x, y]) => [x, y - (top + bottom) / 2]), m]), satinW);
      stages = [{ color: p.color, paths, sews: `Sews “${p.text.trim()}”.` }];
    }
  } else if (p.kind === "monogram") {
    const paths = monogram(p);
    if (paths.length) stages = [{ color: p.color, paths, sews: `Sews the monogram ${p.letters}.` }];
  } else if (p.kind === "frame") {
    const edge = (SHAPES[p.shape] || SHAPES.circle).path(p.w, p.h), name = (SHAPES[p.shape] || SHAPES.circle).name.toLowerCase();
    const loop = (q) => [...q, q[0]];
    if (p.border === "applique") {
      stages = [
        { color: p.color, paths: [loop(run(edge, 2.5, true))], sews: `Sews the ${name} outline on the base fabric.`, fabric: true },
        { color: p.color, pause: true, paths: [loop(run(edge, 2.0, true)), loop(run(edge.slice().reverse(), 2.0, true))],
          you: `Lay the appliqué fabric over the ${name} outline, right side up, covering it by ½ in. Press Start. Then take the hoop off (leave everything hooped), trim the appliqué fabric close to the stitching, and put the hoop back.`,
          sews: "Tacks the appliqué fabric down.", under: true },
        { color: p.color, pause: true, paths: [loop(zigzag(edge, 2.6, 2.0, true)), loop(satin(edge, 3.6, 0.4, 0.3, true))],
          you: "Press Start.", sews: "Covers the raw edge with a satin border." },
      ];
    } else {
      const paths = p.border === "satin" ? [zigzag(edge, 2.1, 2.0, true), satin(edge, 3.0, 0.4, 0.3, true)]
        : p.border === "bold" ? [run(edge, 2.0, true), run(edge.slice().reverse(), 2.0, true), run(edge, 2.0, true)]
        : [run(edge, 2.2, true)];
      stages = [{ color: p.color, paths: paths.map(loop), sews: `Sews the ${name} frame.` }];
    }
  } else if (p.kind === "file") {
    stages = p.blocks.map((b) => ({ color: b.color, paths: b.paths, sews: `Sews ${p.name}${p.blocks.length > 1 ? ` (${b.name || "colour " + (p.blocks.indexOf(b) + 1)})` : ""}.` }));
  }
  const a = ((p.rot || 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const place = ([x, y]) => [x * c - y * sn + p.x, x * sn + y * c + p.y];
  return stages.map((st) => ({ ...st, paths: st.paths.filter((q) => q.length).map((q) => q.map(place)) }));
}

export const pieceStitches = (p) => pieceStages(p).flatMap((st) => st.paths);

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

export const label = (p) => p.kind === "text" ? `“${p.text}”` : p.kind === "monogram" ? `Monogram ${p.letters}`
  : p.kind === "file" ? p.name : `${(SHAPES[p.shape] || SHAPES.circle).name}${p.border === "applique" ? " appliqué" : ""}`;

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
  const cx = (Math.min(...pts.map((q) => q[0])) + Math.max(...pts.map((q) => q[0]))) / 2;
  const cy = (Math.min(...pts.map((q) => q[1])) + Math.max(...pts.map((q) => q[1]))) / 2;
  for (const b of kept) b.paths = b.paths.map((q) => q.map(([x, y]) => [Math.round((x - cx) * 10) / 10, Math.round((y - cy) * 10) / 10]));
  return kept;
}

// Sew the pieces in list order. Neighbouring stages in the same thread share one colour block unless a stage
// needs a pause. Returns the design and the steps to show (what the machine sews, what the person does at pauses).
export function compose(pieces, hoop) {
  const d = new Design(hoop), steps = [];
  let last = null;
  for (const p of pieces) for (const st of pieceStages(p)) {
    if (!st.paths.length) continue;
    if (st.color !== last || st.pause || st.fabric) {
      d.color(st.color, label(p)); last = st.color;
      steps.push({ color: st.color, sews: [], you: st.you || (steps.length ? "Change to the next thread and press Start." : null),
        fabric: !!st.fabric, under: !!st.under || !!st.fabric });
    }
    steps[steps.length - 1].sews.push(st.sews);
    for (const q of st.paths) d.path(q);
  }
  if (!steps.length) throw new Error("Add some lettering or a frame to start.");
  d.finish();
  return { design: d, steps };
}
