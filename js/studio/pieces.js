/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Design tab: pieces (lettering, monogram, frame, appliqué letters, motif, opened file) -> stitches, laid out around
// the hoop centre (mm, y down).
// Uses the shared lettering and stitch engines and returns a Design; the PES file is written by the locked
// writer in js/core/formats.js, which nothing here touches.
import { Design } from "../core/design.js";
import { FILL_PATTERNS, fillPolygon } from "../core/fill.js";
import { APPLIQUE_FONTS, FONTS, fontOf } from "../core/fonts.js";
import { machineThreads } from "../core/formats.js";
import { MARGIN } from "../core/machines.js";
import { BORDERS as EDGES, fillFor, fillRecipe, letterRecipe, satinFor } from "../core/recipes.js";
import { back, bounds, circle, edgeWalk, enter, filletPolygon, followRun, loop, moveCost, normals, rings, run, satin, within, zigzag } from "../core/geom.js";
import { counterPockets, distanceTransform, order } from "../core/raster.js";
import { strokes } from "../core/text.js";
import { MAX_INITIALS, MAX_WORDS, brief, initials, latin, swashes, tidy, unswashed } from "../core/typed.js";
import { PEC_MATCH, pecThread } from "../core/threads.js";
import { inchFirst, measure, measure2 } from "../words.js";
import { MOTIFS } from "./motifs.js";
import { letterOutlines, motifOutlines } from "./outline.js";
import { QUILTS, contours, quiltOf } from "./quilt.js";
import { BORDERS, EYE, MIN, SCALLOP_IN, SHAPES, eyeAt, eyeWide, frameH, frontAcross, frontPanel, hasEye, shapeOf, zipY } from "./shapes.js";
import { FABRICS, THREADS } from "./fabrics.js";
import { FILE_SCALE } from "./files.js";
import { OPEN, along, bend, bulk, densify, drawings, fontReady, initialSizes, inkOnly, length, letterStrokes, lettering, letters, paced, pacer, recent, spaced, stitchLetters } from "./lettering.js";
export { PACED, along, bulkReady, drawings, fineLine, initialSizes, inkOnly, letterMetrics, pacer, recent } from "./lettering.js";
export { carveDone, compose, crossName, crossStep, patchFillOf, quiltDone, splitPieces } from "./compose.js";
export { FILE_SCALE, blocksPattern, fileBlocks, scaleBlocks } from "./files.js";
export { FABRICS, THREADS } from "./fabrics.js";
export { BORDERS, SHAPES, frontAcross, frontPanel } from "./shapes.js";

// min and max of a long list (spread into Math.min, 60 letters' points overflowed the stack: a crafted file's "WWW…")
const minOf = (a) => { let m = Infinity; for (const v of a) if (v < m) m = v; return m; };
const maxOf = (a) => { let m = -Infinity; for (const v of a) if (v > m) m = v; return m; };

// The tightest radius of curvature (mm) under an arched word: (a^2 cos^2 t + b^2 sin^2 t)^1.5 / ab, walking the word's
// half span from the middle of the arch.
function archRho(p, l) {
  const a = Math.max(p.radius, 8), b = Math.max(p.ry ?? p.radius, 8), xs = l.parts.flatMap(([q]) => q.map((v) => v[0]));
  const span = maxOf(xs.map(Math.abs));
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
// on the bib's 32 mm arch bunched "iver" with no warning. Joined script letters over the top also bunch where their
// x-height is over 0.24 x the radius (Great Vibes "Olivia" 24 mm: "vi" ran together at 38 mm, read cleanly from ~48;
// the bib's Emma is 0.23). Script descenders over the top (a p's or y's loop) point in and meet their neighbours' past
// 0.15 x the radius: "Happy" in Great Vibes, 24 mm on a 36 mm arch (0.19), knotted "ppy" with nothing said.
export function archTight(p) {
  if (p.kind !== "text" || (p.shape !== "up" && p.shape !== "down")) return false;
  const l = letters(p.text, p.font, p.size, p.style);
  if (!l.parts.length) return false;
  const rho = archRho(p, l);
  const script = !fontOf(p.font).print;
  return p.shape === "up" ? l.bottom > (script ? 0.15 : 0.8) * rho || -l.top > 0.6 * rho || (script && l.xh > 0.24 * rho) : -l.top > 0.8 * rho;
}
// The curve an arch starts on when lettering is first bent (the 30 mm default made a 24 mm "Olivia" read "Oliuia"): the
// word over about a third of the way round, never tighter than its letters need (`archFit`).
export function archStart(p) {
  const l = letters(p.text, p.font, p.size, p.style);
  if (!l.parts.length) return { radius: p.radius };
  const xs = l.parts.flatMap(([q]) => q.map((v) => v[0])), span = maxOf(xs) - minOf(xs);
  const q = { ...p, radius: Math.max(15, Math.min(80, Math.round(span / (2 * Math.PI * 0.3)))) };   // (under `ARCH`)
  delete q.ry;
  return { radius: archFit(q)?.radius ?? q.radius };
}
// The height (px, as drawn) of a word's strokes in its font: lettering `size` is that height in mm, so two words
// drawn at the same scale have sizes in this ratio ("emma" has no capital: at Emma's size its letters came out twice
// as big)
export function inkHeight(text, family) {
  const t = swashes((text || "").replace(/\s*\n\s*/g, " ").trim()).text;
  if (!t) return 0;
  const { info } = letterStrokes(t, family);
  if (!info.sized?.length) return 0;
  const [, y0, , y1] = bounds(info.sized);
  return y1 - y0;
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
// How far round its curve an arched word goes, as a share of the whole way round (0.5: half), or 0
export function archWrap(p) {
  if (p.kind !== "text" || (p.shape !== "up" && p.shape !== "down")) return 0;
  const l = letters(p.text, p.font, p.size, p.style);
  if (!l.parts.length) return 0;
  const xs = l.parts.flatMap(([q]) => q.map((v) => v[0])), span = maxOf(xs) - minOf(xs);
  const a = Math.max(p.radius, 8), b = Math.max(p.ry ?? p.radius, 8);
  return span / (Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))));
}
// Arched lettering that wraps more than ~40% of the way round its curve (a long name on the bib's small arch) reads
// as a ring and runs into what's under it: the curve size that brings it to a third, or null when it's fine. (55 %
// let "Anne-Marie" go 150° round the wedding scallop's curve with nothing said; a new arch aims for a third, `ARCH`)
export const ARCH = 1 / 3;
export function archRoom(p) {
  const wrap = archWrap(p);
  if (wrap <= 0.4) return null;
  const k = wrap / ARCH, a = Math.max(p.radius, 8), b = Math.max(p.ry ?? p.radius, 8);
  // (`full`: more than the whole way round, so the ends overlap; not a curve setting)
  return Object.defineProperty({ radius: Math.round(a * k), ry: Math.round(b * k) }, "full", { value: wrap > 0.95 });
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
  return touchingAll(p, pieces, true)[0] || null;
}
// every other piece p runs into (`first`: stop at the first). Pieces whose boxes are further apart than CLEAR are
// skipped without measuring (the same answer, faster: a design of 15 pieces measured every pair).
export function touchingAll(p, pieces, first = false) {
  if (p.kind === "frame") return [];
  const fit = fittedSizes(pieces), sewnOf = (o) => sewn(o, pieces, fit);
  const paths = pieceStitches(p), pts = paths.flat(), out = [];
  if (!pts.length) return out;
  const b = bounds(pts);
  let mine = null;
  for (const o of pieces) {
    if (o === p || o.id === p.id || (o.kind === "frame" && o.border === "patch")) continue;
    const theirs = pieceStitches(sewnOf(o)), tp = theirs.flat();
    if (!tp.length) continue;
    const c = bounds(tp);
    if (c[0] > b[2] + CLEAR || c[2] < b[0] - CLEAR || c[1] > b[3] + CLEAR || c[3] < b[1] - CLEAR) continue;
    mine ||= cloud(paths);
    if (near(mine, theirs, CLEAR)) { out.push(o); if (first) break; }
  }
  return out;
}
// the first piece that runs into another, and what it runs into ([p, q]), or null
export function collision(pieces) {
  const fit = fittedSizes(pieces);
  for (const p of pieces) { const q = touching(sewn(p, pieces, fit), pieces); if (q) return [p, q]; }
  return null;
}
// every pair of pieces that run into each other, each pair once ([p, q] in list order)
export function collisions(pieces) {
  const fit = fittedSizes(pieces), out = [], seen = new Set();
  for (const p of pieces) for (const q of touchingAll(sewn(p, pieces, fit), pieces)) {
    const [a, b] = pieces.indexOf(p) < pieces.indexOf(q) ? [p, q] : [q, p], k = a.id + ":" + b.id;
    if (!seen.has(k)) { seen.add(k); out.push([a, b]); }
  }
  return out;
}
// What scaling the whole layout by k (Fit to hoop) would leave, judged from the stitches as they are, scaled (nothing
// stitched again: worked out for every change while a design is too big, re-stitching each piece at the fitted size
// held the page up 4.6 s): { tiny: lettering that would be too small to stitch and isn't now, hit: [a, b] a pair that
// would run into each other and doesn't now }
export function scaledFit(pieces, k) {
  const fit = fittedSizes(pieces), sewnOf = (o) => sewn(o, pieces, fit);
  const tiny = pieces.find((p) => { const q = sewnOf(p), l = bulk(q), least = q.kind === "text" ? fontOf(q.font).min || 4 : 4; return l && l.parts.length && l.xh >= least && l.xh * k < least; }) || null;
  const was = new Set(collisions(pieces).map(([a, b]) => `${a.id}:${b.id}`));
  const st = new Map(pieces.map((o) => [o.id, pieceStitches(sewnOf(o)).map((q) => q.map(([x, y]) => [x * k, y * k]))]));
  for (const p of pieces) {
    if (p.kind === "frame") continue;
    const mine = st.get(p.id), b = bounds(mine.flat());
    if (!mine.flat().length) continue;
    let c0 = null;
    for (const o of pieces) {
      if (o === p || (o.kind === "frame" && o.border === "patch")) continue;
      const theirs = st.get(o.id), tp = theirs.flat(); if (!tp.length) continue;
      const [i, j] = pieces.indexOf(p) < pieces.indexOf(o) ? [p, o] : [o, p];
      if (was.has(`${i.id}:${j.id}`)) continue;
      const c = bounds(tp);
      if (c[0] > b[2] + CLEAR || c[2] < b[0] - CLEAR || c[1] > b[3] + CLEAR || c[3] < b[1] - CLEAR) continue;
      c0 ||= cloud(mine);
      if (near(c0, theirs, CLEAR)) return { tiny, hit: [i, j] };
    }
  }
  return { tiny, hit: null };
}
// the biggest size (0.5 mm steps, down to 60 %, never too small to stitch) at which p clears `other`, or 0
// (halving the range, not 0.5 mm at a time: a 113 mm filled heart over a monogram stitched ~90 sizes, 4.7 s per change)
export function clearSize(p, pieces, other) {
  const from = fittedSizes(pieces).get(p.id) ?? p.size, theirs = cloud(pieceStitches(sewn(other, pieces))), sizes = [];
  for (let s = Math.ceil(from * 2) / 2 - 0.5; s >= Math.max(5, from * 0.6); s -= 0.5) sizes.push(s);
  // the sizes before the first one too small to stitch (smaller is never better there)
  let x = -1, n = sizes.length;
  while (n - x > 1) { const m = (x + n) >> 1; if (minSize({ ...p, size: sizes[m] })) n = m; else x = m; }
  const clears = (i) => !near(cloud(pieceStitches({ ...p, size: sizes[i] })), theirs, CLEAR);
  if (!n || !clears(n - 1)) return 0;
  if (clears(0)) return sizes[0];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (clears(m)) hi = m; else lo = m; }
  return sizes[hi];
}
// points every 0.5 mm along stitch paths, in 1 mm cells (`n`: how many)
export function cloud(paths) {
  const m = new Map();
  m.n = 0;
  for (const q of paths) for (let i = 0; i < q.length; i++) {
    const [ax, ay] = q[i], [bx, by] = q[i + 1] || q[i], n = i + 1 < q.length ? Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5)) : 1;
    for (let k = 0; k < n; k++) {
      const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n, key = Math.floor(x) * 8192 + Math.floor(y);
      let c = m.get(key); if (!c) m.set(key, (c = [])); c.push(x, y); m.n++;
    }
  }
  return m;
}
// do any of `paths` (or their cloud) come within d mm of the points in cloud `c`? (either way round, the same answer:
// the fewer points are the ones looked round; a patch's fill beside a word was every point of the fill, for each size)
export function near(c, paths, d) {
  const r = Math.ceil(d), o0 = paths instanceof Map ? paths : cloud(paths), [a, b] = o0.n <= c.n ? [o0, c] : [c, o0];
  c = b;
  for (const pts of a.values()) for (let i = 0; i < pts.length; i += 2) {
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
  const b = layoutBox(pieces);
  return b ? [b[2] - b[0], b[3] - b[1]] : [0, 0];
}
// Every piece's box at the size it's sewn (lettering a frame shrinks at its fitted size), and the whole layout's box
// (or null). Whatever measures, fits or centres the layout goes by these: Fit to hoop measured the sizes asked for, so a
// quilt label whose two-line words were asked wider than their frame "fitted" the 5x7 smaller (92 -> 91 mm wide).
export function sewnBoxes(pieces) {
  const fit = fittedSizes(pieces);
  return pieces.map((p) => pieceBounds(sewn(p, pieces, fit))).filter(Boolean);
}
// p as it's sewn among `pieces` (it may be a new piece not in the list yet): lettering a frame shrinks at its fitted
// size (`fittedSizes`), anything else as it is. The one way to measure a piece where it shows: decide or say
// nothing from p.size / pieceBounds(p) as asked (tests/sewn_lint.mjs). Measured as asked, a key fob's 25 mm monogram
// sewn 9 mm wasn't "on" the fob, Fit to hoop shrank a quilt label, the selection box ran past the letters.
// (`fit`: fittedSizes of the same list, when the caller has it)
export function sewn(p, pieces, fit = null) {
  fit ||= fittedSizes(pieces.some((o) => o.id === p.id) ? pieces : [...pieces, p]);
  const f = fit.get(p.id);
  return f != null && f !== p.size ? { ...p, size: f } : p;
}
export function sewnBox(p, pieces, fit = null) { return pieceBounds(sewn(p, pieces, fit)); }
export function layoutBox(pieces) {
  const bs = sewnBoxes(pieces);
  return bs.length ? [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))] : null;
}

export function drawAhead(p) {
  if (p.kind !== "text") return [];
  const step = (fn, ink = false) => () => { const n = drawings(), on = pacer.on; inkOnly(ink); pacer.on = false; try { fn(); } catch {} finally { inkOnly(false); pacer.on = on; } return drawings() > n; };
  return [step(() => textRows(p), true), step(() => textRows(p)), step(() => bulk(p), true), step(() => bulk(p))];
}

// Lettering smaller than this blurs: the bulk of the letters (x-height, or caps) under ~4 mm, or the font's own `min`
// for lettering (a script whose small loops close sooner: Alex Brush at the 4 mm "Abbie" read "Avvie").
export function minSize(p) {
  const l = bulk(p), least = p.kind === "text" ? fontOf(p.font).min || 4 : 4;
  if (!l || !l.parts.length || l.xh >= least) return 0;
  return Math.ceil((p.size * least) / l.xh);
}

// On a towel the satin is at least 2.5 mm wide (a fine line sinks into the loops), so a small x-height fills its loops
// and counters in ("Harper" at 17.5 mm in Great Vibes sewed as "Harpa"): the height at which the x-height is 8 mm or
// more and every letter-sized counter (over a tenth of the x-height across: a script s's curl may fill) stays 0.8 mm
// open under that column, or 0 when it already does. Arched down, the counters close up by the bend at mid x-height.
// (Until 2026-10-30 only the 8 mm x-height: "Oliver" in Great Vibes at the suggested 17 mm was unreadable.)
export function towelMin(p) {
  if (p.kind === "monogram") return eachInitial(p, towelMin);
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
// (Bold chosen by hand too: Allura and Meow Script in Bold at their smallest size sewed as blobs with no word)
export function loopsFill(p) {
  if (p.kind === "monogram") return eachInitial(p, loopsFill);
  if ((p.style || "auto") === "line") return 0;
  const l = bulk(p);
  if (!l || !l.parts.length || !l.satinW) return 0;
  const shut = l.pockets.filter((c) => c.peak >= Math.max(0.45, 0.1 * l.xh) && Math.max(c.saddle - 0.2, c.peak - OPEN / 2) < 0.45);
  return shut.length ? Math.ceil((p.size * 0.86) / Math.min(...shut.map((c) => c.peak))) : 0;
}

// A monogram's size where every initial passes `test` (each sewn at its own size, as `monogram` sews it): the middle
// letter alone was measured, so RMK's M said nothing while the R's bowl filled in on a towel. 0 when they all pass.
function eachInitial(p, test) {
  const chars = initials(p.letters).slice(0, 3), { sizes } = initialSizes(chars, p.font, 1), f = (i) => sizes[i];
  return chars.reduce((need, c, i) => {
    const n = test({ kind: "text", text: c, font: p.font, size: p.size * f(i), style: p.style, shape: "straight" });
    return n ? Math.max(need, n > 150 ? n : Math.ceil(n / f(i))) : need;
  }, 0);
}

// Lettering under ~6 mm (x-height, or caps) stitches cleanest with thinner thread and needle (Ink/Stitch's small
// fonts: "thin thread (60) and thin needle (60) is mandatory").
export function smallText(p) {
  const l = bulk(p);
  return !!l && l.parts.length > 0 && l.xh < 6;
}

const eyeRing = (c) => { const ring = circle(c, EYE.r, 64); return [loop(run(ring, 1.0, true)), loop(zigzag(ring, EYE.w * 0.6, 1.2, true)), loop(satin(ring, EYE.w, sd(0.35), 0.2, true))]; };
// fabric to cut for a w x h mm in-the-hoop piece, with 2.5 cm (1 in) spare all round to trim off
// (`measure2`, rounded up: never short of the piece)
export const cut = (w, h, extra = 25) => measure2(w + extra, h + extra, true);
// How far fabric laid over an outline reaches ("covering it by ½ in" read as unclear), the piece the Cutter file cuts
// as the other way (it had no word in the steps, so testers trimmed a cut piece), and the trim it saves. Only for
// stages with a cut file (`cut`): a design file's placement line has none.
const PAST = `${inchFirst(12.7)} past`;   // (½ in)
const past = (many) => `reaching ${PAST} the outline${many ? "s" : ""} all round`;
const cutPiece = (many) => `, or lay ${many ? "pieces" : "a piece"} cut with the Cutter file (Cricut or Silhouette) exactly on the line${many ? "s" : ""}`;
// The trim after a tack-down is done at the machine's next stop, so it's said there (`then` on the tack-down stage,
// put into the next step by compose: `trimsFor`). Said in the tack-down's own step, after "Press Start", it read as
// trimming before the machine had tacked anything (the mug rug, round 10).
const trimIt = (what, where = "") => ({ trim: what, where });

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
// (keyed on the fabric and thread weight only where they change the piece's stitches, `sewnWith`: changing fabric or
// thread on a 15-piece design rebuilt every frame and motif, 1.5 s)
const built = new Map();
export function pieceStages(p, fab = cloth) {
  const { x, y, rot, id, flip, ...shape } = p, key = JSON.stringify(shape) + sewnWith(p, fab);
  if (!built.has(key)) {
    const st = localStages(p, fab);
    if (!fontReady(p.font)) return st.map((s) => placed(s, placer(p)));
    built.set(key, st);
    if (built.size > 120) built.delete(built.keys().next().value);
    paced();
  }
  const place = placer(p);
  return recent(built, key).map((st) => placed(st, place));
}
// what else a piece's stitches depend on: the fabric only for lettering (towel, knit) and a fill (its recipe); the
// thread weight for lettering (Automatic sews small letters for 60 wt), else only 30 and 60 (`sd`, `fd`: Automatic is 40)
function sewnWith(p, fab) {
  const lettering = p.kind === "text" || p.kind === "monogram";
  // (a fill's recipe, core/recipes.js FILLS: a patch's, a filled motif's, the motif either side of lettering)
  const rec = fillRecipe(fab), fill = p.kind === "frame" && p.border === "patch" ? rec.rows : p.kind === "motif" || (lettering && p.deco) ? rec.pull + "/" + rec.rows : "";
  const f = (lettering ? (fab === "towel" || fab === "knit" ? fab : "") : "") + fill;
  return "\n" + f + "\n" + (lettering || wt === "30" || wt === "60" ? wt : "");
}
// a stage moved into place: its stitches, its cut outlines and the filled area it covers (`solid`: closed loops,
// even-odd, that quilting keeps clear of). (Until 2026-10-30 `cut` stayed where the piece was built, at the centre
// unturned and unmirrored, so two appliqué pieces' shapes sat on top of each other in the cut file.)
export function placed(st, place) {
  const s = { ...st, paths: st.paths.map((q) => moved(q, place)) };
  if (st.reseam) s.reseam = (f) => st.reseam(f).map((q) => moved(q, place));
  if (st.cut) s.cut = st.cut.map((l) => l.map(place));
  if (st.solid) s.solid = st.solid.map((l) => l.map(place));
  return s;
}
// a path's points moved, keeping its `gap` (sewn after a jump: the first stroke of a separate letter)
export const moved = (q, f) => { const r = q.map(f); if (q.gap) r.gap = true; if (q.seam) r.seam = true; if (q.lockAt) r.lockAt = f(q.lockAt); if (q.reach) r.reach = q.reach; return r; };
// mirrored (left to right) before it's turned
export function placer({ x, y, rot, flip }) {
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
  if (p.shape === "up" || p.shape === "down") return unbent(print, (chain) => {
    const l = letters(lines.join(" "), p.font, p.size, style, sp, joined, chain);
    return l.parts.length ? [{ parts: bend(l.parts, p.shape, Math.max(p.radius, 8), Math.max(p.ry ?? p.radius, 8)), satinW: l.satinW, xh: l.xh }] : [];
  });
  if (p.shape === "wave" || p.shape === "bridge") return unbent(print, (chain) => {
    const l = letters(lines.join(" "), p.font, p.size, style, sp, joined, chain);
    if (!l.parts.length) return [];
    const mid = (l.top + l.bottom) / 2;   // (letters come with the baseline at y = 0)
    return [{ parts: p.shape === "wave" ? wave(l.parts.map(([q, ...r]) => [q.map(([x, y]) => [x, y - mid]), ...r]), p) : bridge(l.parts, p), satinW: l.satinW, xh: l.xh }];
  });
  // straight: one size for every line (scaled to the first line's x-height), baselines `leading` x size apart
  let ls = lines.map((t, i) => letters(t, p.font, p.size, style, sp, kerns[i]));
  if (ls.length > 1) ls = ls.map((l, i) => (i && l.xh ? letters(lines[i], p.font, (p.size * ls[0].xh) / l.xh, style, sp, kerns[i]) : l));
  ls = ls.filter((l) => l.parts.length);
  if (!ls.length) return [];
  // Baselines `leading` x size apart, and the ink of one line at least half an x-height (a quarter of the size at most:
  // a line in capitals measures its x-height to the top of them) clear of the next's (scaled with the leading): the size is the first line's ink, so a line with no descenders over one with tall digits came
  // out crowded ("14 March 2026 / 3.2 kg" 0.36 x-height apart)
  const pitch = (p.size * (p.leading ?? 130)) / 100, least = (Math.min(ls[0].xh * 0.5, p.size * 0.25) * (p.leading ?? 130)) / 130;
  const base = [0];
  for (let i = 1; i < ls.length; i++) base.push(base[i - 1] + Math.max(pitch, ls[i - 1].bottom - ls[i].top + least));
  const span = (l) => { const xs = l.parts.flatMap(([q]) => q.map((v) => v[0])); return [minOf(xs), maxOf(xs)]; };
  const spans = ls.map(span), W = Math.max(...spans.map(([a, b]) => b - a));
  const top = Math.min(...ls.map((l, i) => l.top + base[i])), bottom = Math.max(...ls.map((l, i) => l.bottom + base[i]));
  return ls.map((l, i) => {
    const [a, b] = spans[i], dx = p.align === "left" ? -W / 2 - a : p.align === "right" ? W / 2 - b : -(a + b) / 2, dy = base[i] - (top + bottom) / 2;
    return { parts: l.parts.map(([q, ...r]) => [q.map(([x, y]) => [x + dx, y + dy]), ...r]), satinW: l.satinW, xh: l.xh };
  });
}
// Bent lettering with its pieces chained (`letters` chain) unless that costs more moves once bent (`moveCost`): the
// chaining reckons gaps before the bend, and an arch or wave stretches them (a 2 mm gap in a waved "Happy Birthday"
// came out a loose thread).
// (print: every move is a trim or, up to 5 mm, a loose thread, however short)
function unbent(print, make) {
  const cost = (rows) => rows.reduce((c, { parts, satinW }) => {
    for (let i = 1; i < parts.length; i++) {
      const a = parts[i - 1][0], b = parts[i][0];
      if (!a.length || !b.length) continue;
      const d = Math.hypot(b[0][0] - a[a.length - 1][0], b[0][1] - a[a.length - 1][1]);
      if (d > 0.01) c += print ? (d + (satinW ? satinW / 2 + 0.3 : 0) <= 5 ? 1.5 : 1) : moveCost(d + 0.25 + (satinW ? satinW / 2 + 0.3 : 0));
    }
    return c;
  }, 0);
  const a = make(true), b = make(false);
  return cost(a) <= cost(b) ? a : b;
}
// along y = amp·sin(waves·2πx/W), letters spaced by arc length and turned with the curve
function wave(parts, p) {
  const xs = parts.flatMap(([q]) => q.map((v) => v[0])), x0 = minOf(xs), x1 = maxOf(xs), W = Math.max(x1 - x0, 1);
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
  const cx = (minOf(out.flatMap(([q]) => q.map((v) => v[0]))) + maxOf(out.flatMap(([q]) => q.map((v) => v[0])))) / 2;
  const ys = out.flatMap(([q]) => q.map((v) => v[1])), cy = (minOf(ys) + maxOf(ys)) / 2;
  return out.map(([q, ...r]) => [q.map(([x, y]) => [x - cx, y - cy]), ...r]);
}
// letters stretched upward toward the middle: the tops make an arch, the baseline stays put
function bridge(parts, p) {
  const xs = parts.flatMap(([q]) => q.map((v) => v[0])), x0 = minOf(xs), x1 = maxOf(xs), W = Math.max(x1 - x0, 1);
  const k = (p.bulge ?? 30) / 100;
  const out = parts.map(([q, ...r]) => [densify(q, 1).map(([x, y]) => { const u = (2 * (x - (x0 + x1) / 2)) / W; return [x, y < 0 ? y * (1 + k * (1 - u * u)) : y]; }), ...r]);
  const ys2 = out.flatMap(([q]) => q.map((v) => v[1])), cy = (minOf(ys2) + maxOf(ys2)) / 2;
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
  const sewn = stitchLetters(laid, satinW, fab, xh < 6, wt);
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

// (`loop`, `back`: geom.js, shared with the bookmark)
// a tack-down: round the outline and back again
const tack = (e) => [loop(run(e, 2.0, true)), loop(run(back(e), 2.0, true))];
// the 4 mm satin border of appliqué, patch and in-the-hoop edges: edge walk, zigzag, satin at 0.34 (3.6 mm at 0.4 let
// the fabric show through and fray past it on Ashley's bookmarks, 2026-11-05). Its centre is 0.2 mm inside the line,
// so it reaches 1.8 mm out as the 3.6 mm one did (sizes, fits and cut files unchanged: wider both ways, two key fobs
// no longer fitted the 4x4 hoop) and 2.2 mm in, over the fabric's trimmed edge.
const satinEdge = (e, B) => [edgeWalk(e, B.width, true), loop(zigzag(e, ...B.zigzag, true)), loop(satin(e, B.width, sd(B.gap), B.pull, true))];   // (core/recipes.js BORDERS)
const satinBorder = (edge) => satinEdge(inset(edge, EDGES.edge.inset), EDGES.edge);
// A closed outline started `f` of the way round, kept there (`seam`: compose doesn't enter it where the needle is).
// Each stage of an outline sewn in stages (in-the-hoop, appliqué frame, zipper pouch) starts a third further round:
// all three started at one corner, whose hole took 16 hits and its neighbour 15 more (the locks of three stages) on
// bare tear-away, which tore there on Ashley's first bookmark (2026-11-05).
export function seamAt(e, f) {
  const cum = [0];
  for (let i = 1; i <= e.length; i++) cum.push(cum[i - 1] + Math.hypot(e[i % e.length][0] - e[i - 1][0], e[i % e.length][1] - e[i - 1][1]));
  const L = cum[e.length] * f, i = Math.max(0, cum.findIndex((c) => c > L) - 1), a = e[i], b = e[(i + 1) % e.length], t = (L - cum[i]) / Math.max(1e-9, cum[i + 1] - cum[i]);
  return startAt(e, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
}
const seamed = (paths) => paths.map((q) => Object.assign(q, { seam: true }));
// a stage's paths from an outline started `f` round (`make(f)`), kept rebuildable: compose moves the start on
// (`reseam`) when it falls within 5.5 mm of where the needle stopped before the pause, as appliqué letters' runs do
// (the machine leaves a move of 5 mm or less untrimmed: a loose thread across the fabric just laid)
const seamStage = (f, make) => ({ seam: f, reseam: (g) => seamed(make(g)), paths: seamed(make(f)) });
// a frame that's only a border: satin (3 mm), bold (a triple run) or a line
// (the edge walk isn't closed: it ends on the side the zigzag starts. Closing it stepped 2.2 mm back across the
// border, a trim and two locks on every satin frame, until 2026-10-31)
export const plainBorder = (e, border) => border === "satin" ? satinEdge(e, EDGES.frame)
  : border === "bold" ? [run(e, 2.0, true), run(back(e), 2.0, true), run(e, 2.0, true)].map(loop)
  : [loop(run(e, 2.2, true))];

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
      const side = (dx, f) => motifStitches(motifOutlines(MOTIFS[p.deco].d, s), "fill", fab).map((q) => q.map(([x, y]) => [f * x + dx, y + (y0 + y1) / 2]));
      paths = [...side(x0 - gap - s / 2, face < 0 ? -1 : 1), ...paths, ...side(x1 + gap + s / 2, face > 0 ? -1 : 1)];
    }
    const words = unswashed(p.text).replace(/\s*\n\s*/g, " / ").trim();
    // (a motif either side is said: "Sews “Leo”." sewed two bunnies as well)
    const both = paths.length && MOTIFS[p.deco] ? ` with ${/^[aeiou]/i.test(MOTIFS[p.deco].name) ? "an" : "a"} ${MOTIFS[p.deco].name.toLowerCase()} either side` : "";
    if (paths.length) stages = [{ color: p.color, paths, sews: fab === "towel" ? `Sews a light base to flatten the loops, then “${words}”${both} on it.` : `Sews “${words}”${both}.` }];
  } else if (p.kind === "monogram") {
    const paths = monogram(p, fab);
    if (paths.length) stages = [{ color: p.color, paths, sews: fab === "towel" ? `Sews a light base to flatten the loops, then the monogram ${p.letters}.` : `Sews the monogram ${p.letters}.` }];
  } else if (p.kind === "frame") {
    const edge = shapeOf(p).path(p.w, p.h), name = shapeOf(p).name.toLowerCase();
    if (p.border === "applique") {
      stages = [
        { color: p.color, paths: [loop(run(edge, 2.5, true))], sews: `Sews the ${name} outline on the base fabric.`, fabric: true, solid: [edge] },
        { color: p.color, pause: true, ...seamStage(1 / 3, (f) => tack(seamAt(edge, f))),
          you: `Lay the appliqué fabric over the ${name} outline, right side up, ${past()}${cutPiece()}. Press Start: the machine tacks it down.`, then: trimIt("the appliqué fabric"),
          sews: "", under: true },
        { color: p.color, pause: true, ...seamStage(2 / 3, (f) => satinBorder(seamAt(edge, f))), you: "Press Start.", sews: "Covers the raw edge with a satin border.", border: true },
      ];
    } else if (p.border === "zip") {
      // in-the-hoop zipper pouch: zipper across the top, the front in two folded pieces either side of it, whatever
      // goes on the front (the pieces after it), then the back face down and one seam through everything; turned
      // right side out through the zipper
      const [, top, , bot] = bounds(edge), x = p.w / 2 + 5;
      const yz = zipY(p, top), line = (y) => run([[-x, y], [x, y]], 2.5), a = yz - top, b = bot - yz;
      stages = [
        { color: p.color, paths: [line(yz)], sews: "Sews the zipper line on the stabilizer.", under: true, bare: true,
          // (folded in half, each front piece has to reach from the zipper past the outline: twice that, plus spare)
          before: `Fabric: two front pieces, ${cut(p.w, 2 * (a + 15), 25)} for the top and ${cut(p.w, 2 * (b + 15), 25)} for the bottom (each folded in half along its length, wrong sides together), and the back, ${cut(p.w, p.h)}. Tear-away stabilizer, a #3 nylon coil zipper (it can be sewn and cut through) at least ${measure(p.w + 50, true)} long, and tape.` },
        { color: p.color, pause: true, paths: [line(yz - 5), line(yz + 5).reverse()], under: true,   // (±3.5 left 0.5 mm beside a coil's teeth)
          you: "Lay the zipper face up with its teeth on the line and the ends past both sides (pull the zipper tab past the side too). Tape the ends down. Press Start.",
          sews: "Tacks the zipper down along both sides of the teeth." },
        // (`bare` here only for the preview: the front is the whole pouch, shown on the background like an ITH front)
        { color: p.color, pause: true, fabric: true, bare: true, nocut: true, solid: [edge], paths: [loop(run(edge, 2.5, true))],
          you: "Lay the top front piece above the zipper, folded edge along the teeth, and the bottom piece below it the same way, both right side up and past the outline. Tape them. Press Start.",
          sews: `Tacks the front pieces down round the ${name}.` },
        { color: p.color, paths: [line(yz - 7), line(yz + 7).reverse()], sews: "Topstitches beside the zipper." },
        { color: p.color, pause: true, last: true, ...seamStage(1 / 2, (f) => [...tack(seamAt(edge, f)), loop(run(seamAt(edge, f), 2.0, true))]),
          you: `Open the zipper halfway (you'll turn the pouch through it). Lay the back piece right side down over everything, ${past()}, and tape it. Press Start.`,
          sews: `Sews round the ${name} through every layer, three times.`,
          after: "Take it out of the hoop and tear the stabilizer away. Trim ¼ in outside the seam (pinking shears stop fraying), trim the zipper ends, clip the corners, then turn it right side out through the zipper and press." },
      ];
    } else if (p.border === "ith") {
      // in-the-hoop ornament or keychain: an appliqué front, then whatever goes on it (the pieces after it in the list),
      // then backing fabric taped under the hoop and one satin edge through every layer; cut out when it's done.
      // Only something that hangs (`hang`: the ornament and key fob starters; a quilted frame is a coaster or mug rug)
      // gets the ribbon loop
      const hang = p.hang ?? !QUILTED(p), eye = hasEye(p) ? eyeAt(p) : null;
      // (the ribbon hole is outlined with it, on the bare stabilizer: where the hole goes shows from the start. Started
      // half way round from its satin ring's start, so their locks don't share holes. The cut file is the outline
      // alone: the hole is cut after its satin ring)
      // (what the front and back are, as the starters' tips say: the bookmark's said felt for the back, its supplies didn't)
      const pieces1 = p.quilt ? "front and back pieces and thin batting" : "front and back pieces";
      const kinds = p.quilt ? " (the front can be cut to shape with the Cutter file)" : ": cotton for the front (or a piece cut to shape with the Cutter file), felt for the back (it doesn't fray)";
      const extras = (n) => `Tear-away stabilizer, tape and Fray Check${hang ? `, and ${n > 1 ? `${n} ribbons` : "a ribbon"} ${inchFirst(152.4)} long for the loop${n > 1 ? "s" : ""}` : ""}${eye ? `, and ${n > 1 ? `${n} ribbons` : "a ribbon"} for the hole${n > 1 ? "s" : ""}` : ""}.`;
      // the last stage's words for n of them in the hoop (`gang`): "fold the ribbon in half" and "Dab Fray Check inside
      // the ribbon ring" were said once for two key fobs and two bookmarks
      const backWords = (n, all) => {
        const one = n < 2, each = one ? `the ${name}` : `each ${name}`, outline = one ? `the ${name} outline` : `the ${name} outlines`;
        return {
          // (one sentence per action: the steps show them numbered. "On the front" was read while the hoop was upside
          // down, so the ribbon goes on once it's turned back over, the embroidered side up; and before the hoop goes
          // back on the machine, while it's in hand: round 11 put the hoop back, then taped the loop)
          you: `Take the hoop off the machine (leave the fabric in the hoop) and turn it upside down. Tape the backing fabric${one ? "" : ` (one piece over ${all} ${name}s, or one each)`} over the stabilizer, right side facing you, reaching ${PAST} ${outline} all round. Turn the hoop back over.${hang ? ` For the ${one ? "loop" : "loops"}, fold ${one ? "the ribbon" : "each ribbon"} in half and tape it on the embroidered side at the top of ${each}, loop pointing in toward the middle, ends ½ in past the outline.` : ""} Put the hoop back on the machine and press Start.`,
          sews: one ? `Tacks the backing on and covers the edge${eye ? " and a ribbon ring" : ""} with satin stitch through every layer.`
            : `Tacks the backing on and covers the edges${eye ? " and ribbon rings" : ""} of ${all} ${name}s with satin stitch through every layer.`,
          after: `Take it out of the hoop, tear the stabilizer away and cut round ${each} as close to the satin stitches as you can without nicking them${hang ? ` (keep the ribbon ${one ? "loop" : "loops"} clear of the scissors). Flip the ribbon ${one ? "loop" : "loops"} up.` : "."} Run Fray Check along the cut ${one ? "edge" : "edges"} and let it dry, then snip off any fibres still poking out.${eye ? ` Dab Fray Check inside ${one ? "the ribbon ring" : "each ribbon ring"} and let it dry, then snip out the hole inside it and loop a ribbon through.` : ""}`,
        };
      };
      stages = [
        { color: p.color, paths: [loop(run(edge, 2.5, true)), ...(eye ? [loop(run(seamAt(circle(eye, EYE.r, 64), 1 / 2), 1.5, true))] : [])], cut: [edge],
          sews: `Sews the ${name} outline${eye ? " and its ribbon hole" : ""} on the stabilizer.`, fabric: true, bare: true, solid: [edge],
          many: (n, all) => ({ sews: `Sews ${all} ${name} outlines${eye ? " and their ribbon holes" : ""} on the stabilizer.` }),
          before: `Fabric: ${pieces1}, each ${cut(p.w, p.h)}${kinds}. ${extras(1)}`,
          // (several in the hoop, `gang`: fabric for each, or one piece over them all; the rest once. "2 of everything"
          // doubled the stabilizer, tape and Fray Check)
          kit: (n, all, W, H) => `Fabric: ${pieces1} for each ${name}, each ${cut(p.w, p.h)}, or one of each ${cut(W, H)} to cover ${all}${kinds}. ${extras(n)} One piece of stabilizer does for ${all}.` },
        { color: p.color, pause: true, ...seamStage(1 / 3, (f) => tack(seamAt(edge, f))),
          you: `Lay ${p.quilt ? "the batting, then " : ""}the front fabric over the ${name} outline, right side up, ${past()}${cutPiece()}. Press Start.`, then: trimIt(`the fabric${p.quilt ? " and batting" : ""}`),
          sews: "Tacks the front fabric down.", under: true },
        { color: p.color, pause: true, last: true,
          ...seamStage(2 / 3, (f) => [loop(run(seamAt(edge, f), 2.0, true)), ...(eye ? eyeRing(eye) : []), ...satinBorder(seamAt(edge, f))]),
          ...backWords(1),
          many: (n, all) => backWords(n, all) },
      ];
    } else if (p.border === "patch") {
      // solid tatami fill (inset so the satin edge covers its ragged ends), then the satin edge over it; `compose`
      // cuts the fill away under what's sewn on it (`carve`)
      // (the edge sews after what goes on the patch, `edge` in compose: it covers the pull of the lettering at the
      // border and the fill's row ends, as a digitizer would order it)
      // (a patch is a separate piece: its fabric, a stabilizer firm enough for thousands of fill stitches, and how to
      // cut it out and put it on; it listed only "Tear-away stabilizer")
      const fill = patchFill(p, [inset(edge, 1.0)], fab);
      stages = [...fill, { color: p.color, edge: true, solid: [edge], paths: satinBorder(edge), sews: `Sews the patch's satin-stitch edge.`,
        after: `Take it out of the hoop, trim or tear the stabilizer away and cut the patch out close to the satin-stitched edge without nicking it. To put it on, iron patch adhesive (or fusible web) on the back and press it on, or sew it on by hand or machine just inside the edge.` }];
    } else {
      stages = [{ color: p.color, paths: plainBorder(edge, p.border), sews: `Sews the ${name} frame.`, border: true }];
    }
  } else if (p.kind === "letters") {
    // appliqué letters: one piece of fabric for the whole word, outlined letter by letter (holes too)
    stages = appliqued(letterOutlines(p.text, p.font, p.size), p.color, p.text.trim(), "the letters", "around each letter (and inside the holes)", "them");
  } else if (p.kind === "motif") {
    // (named as a motif: "Sews the baby." for the onesie drawing)
    const m = MOTIFS[p.motif] || MOTIFS.heart, loops = motifOutlines(m.d, p.size), name = m.name.toLowerCase();
    if (p.style === "applique") stages = appliqued(loops, p.color, `the ${name} motif`, `the ${name} motif`, "around it (and inside any holes)");
    else if (loops.length) stages = [{ color: p.color, paths: motifStitches(loops, p.style, fab), sews: `Sews the ${name} motif${p.style === "outline" ? " as an outline" : ""}.`, ...(p.style === "outline" ? {} : { solid: loops }) }];
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
      if (was === "place") s.you = `Lay the appliqué fabric over the placement line, right side up, reaching ${PAST} it all round. Press Start.`;
      else if (was === "tack") s.you = "Take the hoop off the machine (leave the fabric in the hoop), trim the appliqué fabric close to the tack-down stitching, put the hoop back and press Start.";
      else if (was === "cut") s.you = "If the design's own instructions say to cut here, cut along that line (leave the fabric in the hoop). Then press Start.";
      if (s.you) s.pause = true;
    });
  }
  return stages.map((st) => ({ ...st, paths: st.paths.filter((q) => q.length) }));
}
// A plain fill of a shape, kept by the shape and its settings alone. A piece's stitches are kept by everything they
// depend on, the thread weight among it: going to 60 wt (which changes a satin, not a fill) or to another fabric and
// back made every motif's and patch's fill again on the page, ~500 ms of a busy design's thread change.
const fills = new Map();
function filled(loops, opts) {
  const key = JSON.stringify([loops, opts]);
  let f = fills.has(key) && recent(fills, key);
  if (!f) { f = fillPolygon(loops, opts); fills.set(key, f); if (fills.size > 40) fills.delete(fills.keys().next().value); }
  return f.slice();
}
// A patch's fill in its thread, in a FILL_PATTERNS `pattern`; with `blend`, two layers across the patch, the first
// thinning out as the second fills in (row spacing changes gradually in each), the second with no underlay of its
// own (Hatch's colour blend, on one needle)
export function patchFill(p, loops, fab, name = shapeOf(p).name.toLowerCase()) {
  // (the rows follow what the patch goes on, lighter on knit; the pull is the patch's own fabric's, felt or twill,
  // whatever it's sewn on later: a towel design's patch is cotton's, and a change to Towel fills nothing again)
  const base = { density: fd(fillRecipe(fab).rows), pull: fillRecipe("felt").pull, pattern: p.pattern || "tatami" }, color = p.fill || p.color;
  const st = !p.blend || p.blend === color ? [{ color, paths: filled(loops, base), sews: `Fills the ${name} patch.`, patchFill: true }]
    : [{ color, paths: fillPolygon(loops, { ...base, share: (f) => 1 - f }), sews: `Fills the ${name} patch, fading out.`, patchFill: true },
      { color: p.blend, paths: fillPolygon(loops, { ...base, underlay: false, share: (f) => f }), sews: `Blends the second colour in across the patch.`, patchFill: true }];
  // what to hoop (`patch`: step 1 says so) and a stabilizer firm enough for a dense fill (thousands of stitches)
  return st.map((f, i) => (i ? f : { ...f, patch: true,
    before: "Patch fabric: felt or twill, big enough to hoop, and cut-away stabilizer (or two layers of heavy tear-away): a patch is thousands of stitches. Optional: patch adhesive or fusible web, to iron it on." }));
}

// a motif filled (tatami inside, then a narrow satin edge over the row ends) or as a satin outline
// (outline and holes nearest first, each from where the needle is: `rings`)
function motifStitches(loops, style, fab = cloth) {
  if (style === "outline") return rings(loops, (l) => edgeSatin(l, 2.2));
  const rec = fillRecipe(fab), fill = filled(loops, { inset: 0.6, density: fd(rec.rows), pull: rec.pull }), end = fill[fill.length - 1];
  return [...fill, ...rings(loops, (l) => [loop(run(l, 2.0, true)), loop(satin(l, 1.4, sd(0.4), 0.2, true))], end && end[end.length - 1])];
}

// a satin edge round a closed outline: as wide as `max`, narrower round a small hole (a 2.8 mm satin in the top of an
// A overlaps itself), over an edge walk and a zigzag
// (`top`: its satin, worked out already by `edgeTop`)
function edgeSatin(l, max, min = 1.2, top = null) {
  const w = edgeWidth(l, max, min);
  return [edgeWalk(l, w, true, Math.min(0.4, w / 4), true), loop(zigzag(l, w * 0.7, 2.0, true, true)), top || edgeTop(l, max, min)];
}
const edgeWidth = (l, max, min) => { const [x0, y0, x1, y1] = bounds(l); return Math.max(min, Math.min(max, Math.min(x1 - x0, y1 - y0) / 3.5)); };
// the satin of `edgeSatin` on its own (where it ends decides where the next outline's satin goes: the underlay is built
// only for the start that's taken)
function edgeTop(l, max, min = 1.2) { const w = edgeWidth(l, max, min); return loop(satin(l, w, sd(0.4), w > 2 ? 0.3 : 0.2, true, true)); }

// a point inside closed loops (even-odd)
export const insideLoops = within;   // (core/geom.js)

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
      you: `Lay the appliqué fabric over ${cover}, right side up, ${past(them === "them")}${cutPiece(them === "them")}. Press Start: the machine tacks it down.`, then: trimIt("the fabric", " " + trim),
      sews: "", under: true },
    { color, pause: true, paths: R.satin, you: "Press Start.", sews: "Covers the raw edges with satin stitch." },
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
    const [x0, y0, x1, y1] = box[j];
    for (let s = 0; s < T; s += 0.5) {
      const p = at(loops[i], i, s).p; let bd = Infinity, bs = 0;
      // (further than max from outline j's box: no spot here, whatever its nearest point)
      if (Math.hypot(Math.max(0, x0 - p[0], p[0] - x1), Math.max(0, y0 - p[1], p[1] - y1)) > max + 1e-9) continue;
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
  const contains = (l, q) => within([l], q);
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
            const l = from(out[i], i, c.si, rev), top = edgeTop(l, width[i], Math.min(2.0, width[i])), e = top[top.length - 1], b = nearestOn(out[j], e);
            if (hidden(e, b, ok, 0.3)) return { j, s: c.si, sat: edgeSatin(l, width[i], Math.min(2.0, width[i]), top), bridge: [e, b], sj: arcOf(out[j], j, b) };
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
export function inset(pts, d) {
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
// (every fabric piece, appliqué too, is shown in the background chosen under View, white unless changed: the pink
// gingham patches read as a background of their own; the satin edge shows the shape)
export function previewLook(steps) {
  const fab = steps.findIndex((st) => st.fabric);
  return { fabricShapeBlock: fab >= 0 ? fab : undefined, fabric: undefined, hide: new Set(steps.flatMap((st, i) => (st.under ? [i] : []))) };
}

export const pieceStitches = (p) => pieceStages(p).flatMap((st) => st.paths);

function monogram(p, fab = "cotton") {
  const chars = initials(p.letters).slice(0, 3);
  if (!chars.length) return [];
  // three letters sit close (the big middle one carries the shape); one or two need air between them
  const gap = p.size * (chars.length === 3 ? 0.04 : 0.14), { h, base, sizes } = initialSizes(chars, p.font, p.size);
  const ls = chars.map((c, i) => letters(c, p.font, sizes[i], styleOn(p, fab)));
  const widths = ls.map((l) => { const xs = l.parts.flatMap(([q]) => q.map((v) => v[0])); return xs.length ? maxOf(xs) - minOf(xs) : 0; });
  // Print letters are spaced by what's sewn: their satins reach half a column past the centre lines the widths are
  // measured on, so TKM in Josefin ran the T's bar into the K and the K's leg into the M. Each letter moves right until
  // its stitches, band by band (0.5 mm tall, each checked against its neighbours too), clear the last one's by the gap
  // plus a thread's width. Script monograms too: spaced by the widths of their centre lines, a script capital's swash
  // or loop left gaps of every size (Great Vibes BTL: the L far off to the right, AGM run together).
  // (each letter centred up and down on what stands above its baseline: a descender hangs below, so small letters
  // share a baseline whatever their tails)
  const sewn = ls.map((l, i) => lettersOn(l.parts.map(([q, ...r]) => [q.map(([a, b]) => [a, h[i] ? b + base[i] / 2 : b - (l.top + l.bottom) / 2]), ...r]), l.satinW, fab, l.xh));
  const prof = sewn.map((paths) => { const m = new Map(); for (const [a, b] of paths.flat()) { const k = Math.floor(b / 0.5), v = m.get(k); m.set(k, v ? [Math.min(v[0], a), Math.max(v[1], a)] : [a, a]); } return m; });
  const at = [0];
  for (let i = 1; i < sewn.length; i++) {
    let need = -Infinity;
    for (const [k, [, right]] of prof[i - 1]) for (let d = -1; d <= 1; d++) { const v = prof[i].get(k + d); if (v) need = Math.max(need, right - v[0]); }
    at.push(at[i - 1] + (need === -Infinity ? widths[i - 1] : need) + gap + 0.4);
  }
  const xs = sewn.flatMap((paths, i) => paths.flat().map(([a]) => a + at[i])), c = (minOf(xs) + maxOf(xs)) / 2;
  // (with a tail hanging, the whole monogram is centred up and down too, so it sits in its frame as measured)
  const ys = h.some(Boolean) ? sewn.flat(2).map(([, b]) => b) : [0], m = (minOf(ys) + maxOf(ys)) / 2;
  return sewn.flatMap((paths, i) => paths.map((q) => moved(q, ([a, b]) => [a + at[i] - c, b - m])));
}

export function pieceBounds(p) {
  const pts = pieceStitches(p).flat();
  return pts.length ? bounds(pts) : null;
}

// Is every stitch of p at least `margin` mm inside frame f's outline? (where a new piece can go on a frame)
export function inFrame(p, f, margin = 3) {
  const edge = shapeOf(f).path(f.w, f.h).map(placer(f)), pts = pieceStitches(p).flat();
  if (!pts.length) return false;
  for (let i = 0; i < pts.length; i += 3) if (!inside(pts[i], edge) || closer(pts[i], edge, margin)) return false;
  return true;
}
// is [x, y] under d mm from the polygon's edge? (stopping at the first edge that close, and skipping edges
// whose box is clearly further: inFrame measured every edge for every stitch, the most of placing a new piece)
function closer([x, y], poly, d) {
  if (!(d > 0)) return false;   // (a distance is never under 0: onFrame's -2)
  const far = d + 1e-6;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    if (x < Math.min(ax, bx) - far || x > Math.max(ax, bx) + far || y < Math.min(ay, by) - far || y > Math.max(ay, by) + far) continue;
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0;
    if (Math.hypot(x - ax - t * dx, y - ay - t * dy) < d) return true;
  }
  return false;
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
// point in polygon (even-odd)
export const inside = (q, poly) => within([poly], q);

// A piece as the page names it, long words `brief` (`whole`: all of them, for the thread name in the file, which a
// design's saved bytes carry). One with no words yet is named for what it is: the list showed an empty “” (round 13).
const blank = (s) => !/\S/.test(s || "");
export const label = (p, whole = false) => p.kind === "motif" ? `${(MOTIFS[p.motif] || MOTIFS.heart).name}`
  : p.kind === "text" ? (blank(unswashed(p.text)) ? "Lettering (empty)" : `“${((t) => (whole ? t : brief(t)))(unswashed(p.text).replace(/\s*\n\s*/g, " / "))}”`)
  : p.kind === "letters" ? (blank(p.text) ? "Appliqué letters (empty)" : `Appliqué ${p.text}`) : p.kind === "monogram" ? (blank(p.letters) ? "Monogram (empty)" : `Monogram ${p.letters}`)
  : p.kind === "file" ? p.name : `${shapeOf(p).name}${p.border === "applique" ? " appliqué" : ""}`;

// A piece read from a saved design, the clipboard or the page's own storage, made safe to build: every field checked
// and clamped (an unknown font -> the default, a size of -5 or 1000 -> the nearest that can be sewn, with room for
// what Fit to hoop sets; a motif or shape that doesn't exist -> the first one). Returns null for one that can't be
// read at all (no words, an unknown kind). A crafted file showed "Cannot read properties of undefined" and a piece
// named "undefined", and stayed through a reload.
export const own = (o, k) => typeof k === "string" && Object.hasOwn(o, k);
const num = (v, lo, hi, d) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const hex = (v, d) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
export const pick = (v, ok, d) => (ok.includes(v) ? v : d);
// (no piece bigger than the biggest hoop holds: one piece can't be shared between two hoopings, and `size: 1e9` loaded
// as an 808 mm word)
const BIG = 180;
export function cleanPiece(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  // (a place far past any hoop is taken as the middle, not the hoop's edge: x 1e9 made a 1072 mm design)
  const at = (v) => (typeof v === "number" && Math.abs(v) <= 300 ? v : 0);
  const q = { ...p, x: at(p.x), y: at(p.y), color: hex(p.color, "#0e1f7c") };
  if (q.rot != null) q.rot = num(q.rot, -180, 180, 0);
  if (q.flip != null) q.flip = q.flip === true;
  if (q.of != null && !Number.isInteger(q.of)) delete q.of;   // (lettering split from one piece: named together)
  const font = (list, d) => (list.some((f) => f.family === q.font) ? q.font : d);
  const style = () => { if (q.style != null) q.style = pick(q.style, ["auto", "satin", "line"], "auto"); };
  if (p.kind === "text") {
    // (the words tidied as typing tidies them: tidy in core/typed.js; a saved "\r\n" or a cut emoji came back as stand-ins)
    // (lettering with no words yet is kept, as the editor keeps it, and said there: saved and opened, it vanished)
    if (typeof q.text !== "string") return null;
    q.text = tidy(q.text, { lines: 3, max: MAX_WORDS });
    q.font = font(FONTS, "NW Great Vibes"); q.size = num(q.size, MIN, BIG, 18); style();
    q.shape = pick(q.shape, Object.keys(TEXT_SHAPES), "straight"); q.radius = num(q.radius, MIN, 400, 30);
    for (const [k, lo, hi] of [["ry", MIN, 400], ["amp", 0, 100], ["waves", 0.5, 6], ["bulge", 0, 100], ["spacing", -10, 40], ["leading", 80, 200]])
      if (q[k] != null) { q[k] = num(q[k], lo, hi, undefined); if (q[k] === undefined) delete q[k]; }
    if (q.align != null) q.align = pick(q.align, ["left", "center", "right"], "center");
    if (q.deco != null && !own(MOTIFS, q.deco)) delete q.deco;
    if (q.kern != null) {
      const k = q.kern && typeof q.kern === "object" ? Object.entries(q.kern).filter(([i, v]) => /^\d+$/.test(i) && +i < q.text.length && Number.isFinite(v)) : [];
      if (k.length) q.kern = Object.fromEntries(k.map(([i, v]) => [i, Math.min(50, Math.max(-30, Math.round(v)))])); else delete q.kern;
    }
  } else if (p.kind === "monogram") {
    if (typeof q.letters !== "string") return null;
    q.letters = tidy(q.letters, { max: MAX_INITIALS });
    q.font = font(FONTS, "NW Great Vibes"); q.size = num(q.size, MIN, BIG, 30); style();
  } else if (p.kind === "letters") {
    if (typeof q.text !== "string") return null;
    q.text = tidy(q.text, { max: MAX_INITIALS });
    q.font = font(APPLIQUE_FONTS, APPLIQUE_FONTS[0].family); q.size = num(q.size, MIN, BIG, 60);
  } else if (p.kind === "motif") {
    q.motif = own(MOTIFS, q.motif) ? q.motif : "heart"; q.size = num(q.size, MIN, BIG, 40);
    q.style = pick(q.style, ["fill", "outline", "applique"], "fill");
  } else if (p.kind === "frame") {
    q.shape = own(SHAPES, q.shape) ? q.shape : "circle"; q.border = own(BORDERS, q.border) ? q.border : "satin";
    q.w = num(q.w, MIN, BIG, 80); q.h = num(q.h, MIN, BIG, q.w);
    if (q.fill != null) q.fill = hex(q.fill, "#0e1f7c");
    if (q.blend != null) { q.blend = hex(q.blend, undefined); if (!q.blend) delete q.blend; }
    if (q.pattern != null && !own(FILL_PATTERNS, q.pattern)) delete q.pattern;
    if (q.quilt != null && !own(QUILTS, q.quilt)) delete q.quilt;
    if (q.hang != null) q.hang = q.hang === true;
    if (q.eyelet != null) q.eyelet = q.eyelet === true;
    if (q.most != null) { q.most = num(q.most, MIN, BIG, undefined); if (q.most === undefined) delete q.most; }
  } else if (p.kind === "file") {
    const pt = (v) => Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Math.abs(v[0]) < 1000 && Math.abs(v[1]) < 1000;
    const clean = (bs) => (Array.isArray(bs) ? bs.filter((b) => b && Array.isArray(b.paths)).map((b) => ({
      color: hex(b.color, "#000000"), name: typeof b.name === "string" ? b.name.slice(0, 40) : "",
      paths: b.paths.filter((r) => Array.isArray(r) && r.length > 1 && r.every(pt)).map((r) => r.map(([x, y]) => [x, y])) })).filter((b) => b.paths.length) : []);
    const blocks = clean(q.blocks);
    if (!blocks.length) return null;
    q.blocks = blocks; q.name = typeof q.name === "string" && q.name.trim() ? q.name.slice(0, 60) : "Design file";
    // resized (`resizeFile` in ui.js): the stitches as opened, the size against them, and whether the re-stitch is done
    const orig = clean(q.orig);
    if (orig.length && typeof q.scale === "number" && Number.isFinite(q.scale) && q.scale !== 1) {
      q.orig = orig; q.scale = num(q.scale, FILE_SCALE[0], FILE_SCALE[1], 1);
      if (q.pending != null) q.pending = q.pending === true;
    } else { if (orig.length) q.blocks = orig; delete q.orig; delete q.scale; delete q.pending; }
  } else return null;
  // (only lettering has a font: a frame carrying a crafted one stopped the design building)
  if (p.kind !== "text" && p.kind !== "monogram" && p.kind !== "letters") delete q.font;
  return q;
}

// Pieces from a saved design or a paste, each checked (`cleanPiece`), and what came out other than it went in, said
// in plain words (one sentence a kind, said once by whoever opens them: Open saved, a paste, a dropped or shared
// saved design). A paste left unreadable pieces out and set an unknown font in Great Vibes with nothing said.
// { pieces, said, huge (a size cut down to the biggest piece there can be) }
export function cleanPieces(list) {
  const pairs = list.map((p) => [p, cleanPiece(p)]), pieces = pairs.map(([, q]) => q).filter(Boolean), said = [];
  const left = list.length - pieces.length;
  if (left) said.push(`${left} ${left === 1 ? "piece" : "pieces"} couldn't be read and ${left === 1 ? "was" : "were"} left out.`);
  // (words past the editor's 60 letters, or initials past 12; measured on the words tidied, as they're kept: accents
  // typed apart, which join up, aren't letters cut)
  const cut = pairs.some(([p, q]) => q && typeof p.text === "string" && typeof q.text === "string" && q.text.length < tidy(p.text, { lines: 3 }).length)
    || pairs.some(([p, q]) => q && typeof p.letters === "string" && typeof q.letters === "string" && tidy(p.letters).length > q.letters.length);
  if (cut) said.push(`Words longer than this page takes (${MAX_WORDS} letters, ${MAX_INITIALS} initials) were cut short.`);
  // (a font this page hasn't got, named, and the one it's sewn in)
  const fonts = new Map();
  for (const [p, q] of pairs) if (q && typeof p.font === "string" && q.font && p.font !== q.font) fonts.set(p.font.replace(/^NW /, ""), (q.font || "").replace(/^NW /, ""));
  for (const [a, b] of fonts) said.push(`The font “${a.slice(0, 40)}” isn't on this page: ${b} is used instead.`);
  // (a setting it had that came out different; ones it lacked and got filled in aren't counted, nor a font said above)
  const changed = pairs.filter(([p, q]) => q && Object.keys(p).some((k) => !["id", "text", "letters", "font"].includes(k) && JSON.stringify(p[k]) !== JSON.stringify(q[k]))).length;
  if (changed) said.push(`${changed === 1 ? "One piece had settings" : `${changed} pieces had settings`} this page doesn't have: ${changed === 1 ? "it was" : "they were"} set to the nearest that works.`);
  const huge = pairs.some(([p, q]) => q && ["size", "w", "h"].some((k) => typeof p[k] === "number" && q[k] < p[k]));
  return { pieces, said: said.join(" "), huge };
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
    const frame = fitFrame(p, pieces);
    if (!frame) return;
    const mono = p.kind === "monogram", r = (((p.rot || 0) % 360) + 360) % 360, side = r === 90 || r === 270;
    const b = pieceBounds({ ...p, x: 0, y: 0, rot: 0 }); if (!b) return;
    const dy = (p.y - frame.y) / (frameH(frame) / 2), gap = frame.border === "line" ? 4 : 8, [pt, pb] = frontPanel(frame);
    // room across the frame at the lettering's height (narrower toward the top and bottom of round shapes)
    const round = ["circle", "oval", "scallop", "heart"].includes(frame.shape) ? Math.sqrt(Math.max(0.2, 1 - dy * dy)) : 1;
    // (a monogram only shrinks when it would reach the border: the starters' monograms fill their frames on purpose)
    const fill = frame.shape === "diamond" ? 0.55 : mono ? 0.92 : 0.82;
    // Turned a quarter (a name running down a bookmark): its length fits the frame's front lengthwise less 4 mm at the
    // top and the border plus 6 mm at the bottom (the old bookmark's box), about where it sits, and its height the
    // frame's width
    const lt = pt + 4, lb = pb - 7.8;
    // (a frame lying across with a ribbon hole at its left end: the room is right of the hole, as the turned case)
    const [ax, bx] = frontAcross(frame), al = ax + 4, ar = bx - 7.8;
    const room = side ? lb - lt - 2 * Math.abs(p.y - (lt + lb) / 2)
      : hasEye(frame) && eyeWide(frame) ? ar - al - 2 * Math.abs(p.x - (al + ar) / 2) : frame.w * round * fill - (mono ? gap / 2 : gap);
    const w = b[2] - b[0];
    let k = w > room && room > 5 ? room / w : 1;
    if (side) { const across = frame.w * fill - gap, h = b[3] - b[1]; if (h > across && across > 5) k = Math.min(k, across / h); }
    // a monogram is tall: it must fit up and down too (a script R overran a key fob's border)
    if (mono && !side) {
      // (in a zipper pouch, the front below the zipper: fitted to the whole frame, it sewed across the zipper)
      const roomH = frame.border === "zip" ? (pb - pt) * fill - gap / 2 - 2 * Math.abs(p.y - (pt + pb) / 2)
        : frameH(frame) * fill - gap / 2 - 2 * Math.abs(p.y - frame.y), h = b[3] - b[1];
      if (h > roomH && roomH > 5) k = Math.min(k, roomH / h);
    }
    if (k < 1) out.set(p.id, clearOf(p, frame, Math.max(5, Math.floor(p.size * k * 2) / 2)));
  });
  return out;
}
// The frame whose fit sizes p (`fittedSizes`), whether or not it shrinks it now: straight lettering or a monogram, square
// on, centred in an earlier unturned frame; else null
export function fitFrame(p, pieces) {
  const r = (((p.rot || 0) % 360) + 360) % 360;
  if ((p.kind !== "text" && p.kind !== "monogram") || (p.shape && p.shape !== "straight") || r % 90) return null;
  return frameAround(p, pieces.filter((f) => f === p || !(f.rot || 0))) || null;
}
// The fitted size, made smaller (0.5 mm steps, down to 60 %) until the stitches clear the frame's (CLEAR): the room
// above is the frame's outline, so a scallop's valleys or a satin border's inner edge could still meet the letters
// (a Great Vibes JMK in a scallop, after Circle -> Scallop). Left as it was when no smaller size clears.
const cleared = new Map();
function clearOf(p, frame, size) {
  const { x, y, id, ...shape } = p, key = JSON.stringify([shape, x - frame.x, y - frame.y, { ...frame, x: 0, y: 0, id: 0 }, size, wt, cloth]);
  if (!cleared.has(key)) {
    const edge = cloud(pieceStitches(frame));
    let s = size;
    for (let t = size; t >= Math.max(5, size * 0.6); t -= 0.5) if (!near(cloud(pieceStitches({ ...p, size: t })), edge, CLEAR)) { s = t; break; }
    cleared.set(key, s);
    if (cleared.size > 200) cleared.delete(cleared.keys().next().value);
  }
  return cleared.get(key);
}

// A monogram given other initials inside a frame keeps the width it had (one letter left of the starter's "aMs" stayed
// 23 mm tall in a 90 mm circle), as big as the frame then lets it be sewn (`fittedSizes`). With no frame around it
// its size stays.
// It grows only as far as its stitches stay CLEAR of the frame's and everything else's (a Great Vibes L or A grew
// from 23 to 73 mm, past its circle: the fit measures the letters' box, and a script capital's swash reaches past it).
// Other initials of the same count fill the same width too (a names batch of monograms in the 90 mm circle: BTL came
// out wide and AGM tight, at one size), down to 70 % of the size (a W-heavy set).
export function monoSize(p, letters, pieces) {
  const n1 = initials(letters).length;
  if (p.kind !== "monogram" || !n1 || !frameAround(p, pieces.filter((f) => f === p || !(f.rot || 0)))) return p.size;
  const wide = (q) => { const b = pieceBounds({ ...q, x: 0, y: 0 }); return b ? b[2] - b[0] : 0; };
  const at = fittedSizes(pieces).get(p.id) ?? p.size, w0 = wide({ ...p, size: at }), w1 = wide({ ...p, letters, size: at });
  if (!w0 || !w1 || Math.abs(w1 - w0) < 0.5) return p.size;
  const q = { ...p, letters, size: Math.max(Math.round(p.size * 1.4) / 2, Math.min(90, Math.round(((at * w0) / w1) * 2) / 2)) };
  const ps = pieces.map((o) => (o.id === p.id ? q : o)), top = fittedSizes(ps).get(p.id) ?? q.size, others = ps.filter((o) => o.id !== p.id);
  if (q.size < p.size) return top;
  // (whole mm down from the biggest, then the half above the first that clears; never below where it started)
  const clear = (s) => !touchingAll({ ...q, size: s }, others, true).length;
  if (clear(top)) return top;
  for (let s = Math.floor(top) - 1; s > p.size; s--) if (clear(s)) return clear(s + 0.5) ? s + 0.5 : s;
  return p.size;
}

// The earlier round frame arched lettering sits in, and the curve that runs it just inside that frame's border
// ("up" letters stand inside the edge, "down" letters hang from it). Null when there's no such frame.
export function followFrame(p, pieces) {
  if (p.kind !== "text" || (p.shape !== "up" && p.shape !== "down")) return null;
  const f = frameAround(p, pieces, ["circle", "oval", "scallop"]);
  if (!f) return null;
  // (a scallop's valleys are 0.88 of its size across: the curve sized to its points ran the words into the valleys,
  // and Follow the frame changed nothing)
  const k = f.shape === "scallop" ? SCALLOP_IN : 1, gap = f.border === "line" ? 4 : 6, rx = (k * f.w) / 2, ry = (k * frameH(f)) / 2;
  const l = letters(p.text, p.font, p.size, p.style), up = p.shape === "up";
  const d = up ? gap - (l.parts.length ? l.top : -p.size) : gap + (l.parts.length ? Math.max(0, l.bottom) : 0);
  return { x: f.x, y: f.y, radius: Math.round(Math.max(8, rx - d) * 2) / 2, ry: Math.round(Math.max(8, ry - d) * 2) / 2 };
}

// what the design is sewn on: changes the stitches (knit, towel) and the stabilizer advice
// (thread names in the file in plain ASCII, spelled as the file names are (`latin` in core/typed.js): "Monogram Ø" was
// "Monogram " on the machine)
export const ascii = latin;

// What the design is sewn with: the thread weight and the fabric. `compose` sets both for the length of its build
// (from its opts), and the editor sets them with `sewAs` whenever the design's change, so everything measured outside
// a build (what touches what, the size that clears a frame, Fit to hoop) is measured on the stitches that will be
// sewn. Until 2026-11 only `compose` set the weight and nothing set the fabric: those checks measured 40 wt stitches
// on cotton whatever the design used (towel lettering is wider and sits on a lattice 0.3 mm wider each side).
export let wt = "auto", cloth = "cotton";
export function sewAs(fabric, thread) { cloth = FABRICS[fabric] ? fabric : "cotton"; wt = THREADS[thread] ? String(thread) : "auto"; }
// what's set now, [fabric, thread weight], and setting it back (compose.js: a build puts back what was there)
export const sewing = () => [cloth, wt];
export function sewWith([fabric, weight]) { cloth = fabric; wt = weight; }
const sd = (x) => satinFor(wt, x), fd = (x) => fillFor(wt, x);   // (the numbers: core/recipes.js WEIGHTS)

// Quilting in a frame (`quilt`: stipple or echo) fills it around everything else on it, sewn right after the frame
// (after the front fabric on an in-the-hoop frame, before what goes on it). Kept for the last few layouts: it's the
// slowest thing in compose.
export const QUILTED = (p) => p.kind === "frame" && (p.quilt === "stipple" || p.quilt === "echo") && p.border !== "patch";
// The nearest point to `pt` on a closed outline: [distance, segment index, point]
export function onOutline(e, pt) {
  let best = [Infinity, 0, e[0]];
  for (let i = 0; i < e.length; i++) {
    const a = e[i], c = e[(i + 1) % e.length], dx = c[0] - a[0], dy = c[1] - a[1], L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L)) : 0, q = [a[0] + dx * t, a[1] + dy * t];
    const d = Math.hypot(pt[0] - q[0], pt[1] - q[1]);
    if (d < best[0]) best = [d, i, q];
  }
  return best;
}
// a closed outline starting at a point on it
export function startAt(e, pt) {
  const [, i, q] = onOutline(e, pt), rest = [...e.slice(i + 1), ...e.slice(0, i + 1)];
  return [q, ...rest.filter((r, k) => k < rest.length - 1 || Math.hypot(r[0] - q[0], r[1] - q[1]) > 0.05)].filter((r, k) => !k || Math.hypot(r[0] - q[0], r[1] - q[1]) > 0.05);
}