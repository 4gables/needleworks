// Design tab: pieces (text, monogram, frame) -> stitches, laid out around the hoop centre (mm, y down).
// Uses the shared lettering and stitch engines and returns a Design; the PES file is written by the locked
// writer in js/core/formats.js, which nothing here touches.
import { Design } from "../core/design.js";
import { fillPolygon } from "../core/digitize.js";
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
function letters(text, family, size, style = "auto") {
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
  // A satin column no wider than the font's own stroke, and never more than a fifth of the x-height (a sixth for
  // thin monoline fonts, which get a satin sized to the letters like the bookmark). Under 1 mm a satin can't be sewn
  // cleanly and fills small loops, so those letters get a fine line instead.
  const stroke = info.stroke * s, xh = info.mid * s;
  const w = stroke >= 0.95 ? Math.min(3.2, stroke, xh * 0.2) : Math.min(2.0, xh * 0.17);
  const satinW = style === "line" ? 0 : style === "satin" ? Math.max(1.0, w) : w >= 1.0 ? Math.max(1.2, w) : 0;
  return { parts, satinW, xh, top: (y0 - info.baseline) * s, bottom: (y1 - info.baseline) * s };
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
  const l = letters(t, p.font, size, p.style);
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
  const bumps = Math.max(8, Math.round((Math.PI * (rx + ry)) / 15));
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2, k = 0.94 + 0.06 * Math.cos(bumps * t);
    return [rx * k * Math.sin(t), -ry * k * Math.cos(t)];
  });
}
function fitBox(pts, w, h) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return pts.map(([x, y]) => [((x - cx) / (x1 - x0)) * w, ((y - cy) / (y1 - y0)) * h]);
}
export const BORDERS = { line: "Thin line", bold: "Bold line", satin: "Satin border", patch: "Filled patch", applique: "Appliqué" };

// ---------- pieces ----------
// text:     { kind: "text", text, font, size, shape: "straight"|"up"|"down", radius, x, y, rot, color }
// monogram: { kind: "monogram", letters, font, size, x, y, rot, color }  (3 letters: small, BIG, small)
// frame:    { kind: "frame", shape, w, h, border: "line"|"bold"|"satin"|"applique", x, y, rot, color }
// file:     { kind: "file", name, blocks: [{ color, name, paths }], x, y, rot }  (an opened PES/DST, stitches as is)
//
// A piece sews in stages; each stage is one colour block. `pause` forces a machine stop even in the same thread,
// with `you` telling the person what to do at it.
// Stitches don't change when a piece only moves or turns, so they're built once per shape and placed after.
const built = new Map();
export function pieceStages(p) {
  const { x, y, rot, id, ...shape } = p, key = JSON.stringify(shape);
  if (!built.has(key)) {
    built.set(key, localStages(p));
    if (built.size > 80) built.delete(built.keys().next().value);
  }
  const a = ((rot || 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const place = ([u, v]) => [u * c - v * sn + x, u * sn + v * c + y];
  return built.get(key).map((st) => ({ ...st, paths: st.paths.map((q) => q.map(place)) }));
}

function localStages(p) {
  let stages = [];
  if (p.kind === "text") {
    const { parts, satinW, top, bottom } = letters(p.text, p.font, p.size, p.style);
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
    } else if (p.border === "patch") {
      // solid tatami fill (inset so the satin edge covers its ragged ends), then the satin edge over it
      stages = [
        { color: p.fill || p.color, paths: fillPolygon(inset(edge, 1.0)), sews: `Fills the ${name} patch.` },
        { color: p.color, paths: [loop(zigzag(edge, 2.6, 2.0, true)), loop(satin(edge, 3.6, 0.4, 0.3, true))], sews: `Sews the patch's satin edge.` },
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
  return stages.map((st) => ({ ...st, paths: st.paths.filter((q) => q.length) }));
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

export const pieceStitches = (p) => pieceStages(p).flatMap((st) => st.paths);

function monogram(p) {
  const chars = [...(p.letters || "").replace(/\s+/g, "")].slice(0, 3);
  if (!chars.length) return [];
  // three letters sit close (the big middle one carries the shape); one or two need air between them
  const big = p.size, small = p.size * 0.68, gap = p.size * (chars.length === 3 ? 0.04 : 0.14);
  const sizes = chars.length === 3 ? [small, big, small] : chars.map(() => big);
  const ls = chars.map((c, i) => letters(c, p.font, sizes[i], p.style));
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
// needs a pause. A stage in a thread used earlier moves up to join it (one pause fewer) when it overlaps nothing
// it would jump ahead of, so what lies on top of what never changes; appliqué stages never move.
// Returns the design and the steps to show (what the machine sews, what the person does at pauses).
// Straight lettering whose centre sits inside an earlier frame shrinks to fit across it (a long name typed into
// "Name in a frame" would otherwise run over the border). Returns id -> the size it's stitched at.
export function fittedSizes(pieces) {
  const out = new Map();
  pieces.forEach((p, i) => {
    if (p.kind !== "text" || (p.shape && p.shape !== "straight") || (p.rot || 0) % 180) return;
    const frame = pieces.slice(0, i).reverse().find((f) => f.kind === "frame" && !(f.rot || 0)
      && Math.abs(p.x - f.x) < f.w / 2 && Math.abs(p.y - f.y) < (f.shape === "circle" ? f.w : f.h) / 2);
    if (!frame) return;
    const b = pieceBounds({ ...p, x: 0, y: 0 }); if (!b) return;
    const fh = frame.shape === "circle" ? frame.w : frame.h, dy = (p.y - frame.y) / (fh / 2);
    // room across the frame at the lettering's height (narrower toward the top and bottom of round shapes)
    const round = ["circle", "oval", "scallop", "heart"].includes(frame.shape) ? Math.sqrt(Math.max(0.2, 1 - dy * dy)) : 1;
    const room = frame.w * round * (frame.shape === "diamond" ? 0.55 : 0.82) - (frame.border === "line" ? 4 : 8);
    const w = b[2] - b[0];
    if (w > room && room > 5) out.set(p.id, Math.max(5, Math.floor(p.size * (room / w) * 2) / 2));
  });
  return out;
}

export function compose(pieces, hoop) {
  const fit = fittedSizes(pieces);
  pieces = pieces.map((p) => (fit.has(p.id) ? { ...p, size: fit.get(p.id) } : p));
  const box = (paths) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of paths) for (const [x, y] of q) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0 - 1, y0 - 1, x1 + 1, y1 + 1];
  };
  const hits = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const order = [];
  for (const p of pieces) for (const st of pieceStages(p)) {
    if (!st.paths.length) continue;
    const s = { ...st, label: label(p), box: box(st.paths) };
    let at = order.length;
    if (!s.pause && !s.fabric) {
      for (let j = order.length - 1; j >= 0; j--) {
        if (order[j].color === s.color && !order[j].fabric) { at = j + 1; break; }
        if (hits(order[j].box, s.box) || order[j].pause) break;
      }
    }
    order.splice(at, 0, s);
  }
  const d = new Design(hoop), steps = [];
  let last = null;
  for (const st of order) {
    if (st.color !== last || st.pause || st.fabric) {
      d.color(st.color, st.label); last = st.color;
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
