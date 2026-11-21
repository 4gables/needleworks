/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Picture -> embroidery. Reduce to a few thread colours, then stitch each shape by its width, as a digitizer would:
// hairlines a triple run along their centre, strokes 1-4 mm wide and small blobs satin columns, wider shapes a
// tatami fill.
// Other styles: line drawing (`lineArt`) and cross-stitch (`crossStitch`).
import { labOf } from "./colour.js";
import { Design, UNDER } from "./design.js";
import { FILL, FILL_PATTERNS, SEWN, WORN, fillPolygon, makeRouter, routeBudget, routeFill, tatami } from "./fill.js";
import { arclen, followRun, normals, resample, run, satin } from "./geom.js";
import { MARGIN } from "./machines.js";
import { COLUMNS, LIMITS, PICTURES, ROWS, SHADE, SHAPES, UNDERLAY, letterRecipe } from "./recipes.js";
import { distanceTransform as wholeDT, label, order, skeletonEdges, tour } from "./raster.js";
import { cleanShapes } from "./regions.js";
import { shading } from "./shade.js";
import { PEC_MATCH, hexToRgb, nearestBrotherThread, pecThread, pyRound, rgbToHex } from "./threads.js";
import { DEFAULTS, across, deltaE2000, faintLines, pixels, srgbToLab } from "./palette.js";
import { artShapes } from "./artcheck.js";
export { DEFAULTS, analyze, labelWith, learnColours, pictureInk, toPalette } from "./palette.js";

export { FILL_PATTERNS, fillPolygon, routeBudget };   // (core/fill.js)
// fill row spacing in mm (recipes.js ROWS): standard covers the fabric, solid is closer still for fleece, towels and
// dark fabric.
// (what the page does with a picture before it is stitches is in picprep.js, handed on here)
import { DENSITY, LEARN, MOST, contentBox, cutPart, findParts, lostMuch, pictureImage, picturePlan, sewSized } from "./picprep.js";
export { DENSITY, LEARN, MOST, contentBox, cutPart, findParts, lostMuch, pictureImage, picturePlan, sewSized };
// A colour's fill reaches this far (mm) under the colours sewn after it, so thread pull can't open a gap of fabric
// where two colours meet (digitizing guides: 0.2-0.4 mm).
const OVERLAP = 0.35;
// Moves between parts of one colour up to this far (mm) travel under stitches still to come rather than jump
// (10 until 2026-11: 20 took another 51 of the 12 sample pictures' 1,213 trims; 30 only 9 more)
const TRAVEL = 20;
// Parts of a shape narrower than twice this (mm) get no fill rows and are sewn along their centre instead
const THIN_PART = 0.35;

// The distance transform of the part of a picture a mask lies in. One colour of a picture covers a corner of it, and
// eight of these per colour were a quarter of a picture's time: outside the mask's own box (and a pixel round it)
// every value is 0, and inside it the nearest 0 is in that box, so the answer is the whole picture's, to the bit.
function cropDT(m, x0, x1, y0, y1, rest) {
  const { w, h, data } = m, n = w * h, cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  if (cw * ch > 0.8 * n) return wholeDT(m);
  const part = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) part.set(data.subarray((y + y0) * w + x0, (y + y0) * w + x0 + cw), y * cw);
  const d = wholeDT({ w: cw, h: ch, data: part }), out = new Float64Array(n);
  if (rest) out.fill(rest);
  for (let y = 0; y < ch; y++) out.set(d.subarray(y * cw, (y + 1) * cw), (y + y0) * w + x0);
  return out;
}
function boxOf({ w, h, data }, of = 1) {
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) if (!data[i] === !of) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0, x1, y0, y1];
}
export function distanceTransform(m) {
  const b = boxOf(m), { w, h } = m;
  return b ? cropDT(m, Math.max(0, b[0] - 1), Math.min(w - 1, b[1] + 1), Math.max(0, b[2] - 1), Math.min(h - 1, b[3] + 1), 0) : new Float64Array(w * h);
}
// The same for a mask of the pixels *off* some shapes, where the caller only asks "within `grow` px of one?": exact
// in the shapes' box and `grow` px round it, Infinity past that (and everywhere when there is no shape).
function distanceTo(m, grow) {
  const b = boxOf(m, 0), { w, h } = m, pad = Math.ceil(grow) + 2;
  return b ? cropDT(m, Math.max(0, b[0] - pad), Math.min(w - 1, b[1] + pad), Math.max(0, b[2] - pad), Math.min(h - 1, b[3] + pad), Infinity) : new Float64Array(w * h).fill(Infinity);
}

// Gaps narrower than 0.5 mm between parts of one colour (between small letters, inside an M's notch) close up once
// sewn. Returns their area in mm²: a morphological closing of the colour, minus the colour, counted only where the
// fabric would show (not where another stitched colour fills the gap), ignoring corner tips.
const MIN_GAP = 0.5;
function narrowGaps(mask, res, open) {
  const { w, h, data } = mask, r = (MIN_GAP / 2) * res, n = w * h;
  const out = distanceTo({ w, h, data: data.map((v) => 1 - v) }, r);
  const dil = { w, h, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) dil.data[i] = data[i] || out[i] <= r ? 1 : 0;
  const inn = distanceTransform(dil), gap = { w, h, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) gap.data[i] = !data[i] && open(i) && inn[i] > r ? 1 : 0;
  // every sharp inside corner (an N's, a V's) narrows to a point: only a gap that stays narrow over a length counts
  const { labels, count } = label(gap), size = new Array(count + 1).fill(0);
  for (let i = 0; i < n; i++) size[labels[i]]++;
  let mm2 = 0;
  for (let c = 1; c <= count; c++) if (size[c] / (res * res) >= 0.3) mm2 += size[c] / (res * res);
  return mm2;
}

// Fill edges and satin outlines reach a little past the picture, so a picture sized to the hoop's edge can land
// just over it; shrink to fit (more pixels per mm) rather than refuse.
export function digitize(img, analysis, opts = {}) {
  if (analysis.empty) throw Object.assign(new Error(analysis.empty), { code: "empty" });
  let res = opts.res || DEFAULTS.res;
  const make = opts.style === "line" ? lineArt : opts.style === "cross" ? crossStitch : build;
  for (let tries = 0; ; tries++) {
    try {
      const r = make(img, analysis, { ...opts, res });
      // (the longest line too thin to keep, as a share of the picture's longer side: the page says so)
      r.fine.lost = analysis.lost || 0;
      r.res = res;   // (working px per mm, after any shrink to fit)
      r.origin ||= [img.width / 2, img.height / 2];   // (where mm 0,0 lies, working px)
      return r;
    }
    catch (e) { if (!e.overBy || tries === 3) throw e; res *= e.overBy * 1.01; }
  }
}

// A stitch as the file holds it (0.1 mm, rounded as the writer rounds): its length, and the hole a point lands in
const R10 = (v) => pyRound(v * 10);
const sewnLen = (a, b) => Math.hypot(R10(b[0]) - R10(a[0]), R10(b[1]) - R10(a[1]));
const tinyStep = (a, b) => { const d = sewnLen(a, b); return d > 0 && d <= LIMITS.tiny; };

// No tiny stitch in a path (mm). Rows turn on one needle point (fill.js `sewRows`), so a row link is no stitch of
// its own; what is left is where sections join and travel meets a row (when rows were 0.35-0.4 mm apart and each
// turn two points, a third of the links rounded to 0.3 mm or less in the file: 336 tiny stitches in the 12 sample
// pictures). The point moves along its own row by 0.1-0.4 mm (out first) until the link sews over 0.3 mm; the row
// keeps its place and the edge moves by less than a thread's width. Dropping the point (`untiny`) would take the
// row's end off the edge instead. first: the point the needle is at (never moved).
function noTiny(pts, first = null) {
  const p = first ? [first, ...pts] : pts.slice(), unit = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
  const ok = (a, b) => !a || !b || sewnLen(a, b) > LIMITS.tiny;
  for (let i = 1; i < p.length; i++) {
    if (!tinyStep(p[i - 1], p[i])) continue;
    // the point to move: this one along the stitch after it, or (at the path's end) the one before along the stitch before it
    const tries = [];
    if (i < p.length - 1) tries.push([i, p[i + 1]]);
    if (i > 1) tries.push([i - 1, p[i - 2]]);
    let done = false;
    for (const [k, toward] of tries) {
      const d = unit(p[k], toward);
      for (const t of [-1, 1, -2, 2, -3, 3, -4, 4]) {
        const q = [p[k][0] + d[0] * t * 0.1, p[k][1] + d[1] * t * 0.1];
        if (ok(p[k - 1], q) && ok(q, p[k + 1])) { p[k] = q; done = true; break; }
      }
      if (done) break;
    }
    // (nowhere to move it: one stitch instead of two, if that isn't a long one)
    if (!done && i < p.length - 1 && Math.hypot(p[i + 1][0] - p[i - 1][0], p[i + 1][1] - p[i - 1][1]) <= 4) { p.splice(i, 1); i--; }
  }
  return first ? p.slice(1) : p;
}

// A run that starts after a jump is tied in 0.7 mm along its first stitch (`Design.path`: start, 0.7 mm on, aside, back,
// start). If the path's own next point is that 0.7 mm on (a fill's first row at a shape's tip, a short line's first
// step), the hole takes three hits in six stitches: 164 such tie-ins in the 12 sample pictures. The path then starts
// from its next point (the tip's 0.7 mm row is sewn over by the tie-in anyway).
function clearStart(pts) {
  let p = pts;
  for (let n = 0; n < 3 && p.length > 3; n++) {
    const a = p[0], ahead = p.find((q) => Math.hypot(q[0] - a[0], q[1] - a[1]) > 0.3);
    if (!ahead) break;
    const L = Math.hypot(ahead[0] - a[0], ahead[1] - a[1]), q = [a[0] + ((ahead[0] - a[0]) / L) * 0.7, a[1] + ((ahead[1] - a[1]) / L) * 0.7];
    const next = p.find((v, i) => i && sewnLen(a, v) > 0);
    if (!next || sewnLen(a, next) > 10 || sewnLen(q, next) > 0) break;
    p = p.slice(1);
  }
  return p;
}

// Lines too faint for the labels (`lostLines` said them, nothing sewed them): a 1 px hairline rule at 60 mm read as
// fabric, and a 0.3 mm red rule the labelling broke into dashes 3 mm apart, so "2 colours" sewed 1. Each straight line
// of the picture labelled as the fabric (palette.js `faintLines`: unlike the fabric by ΔE 20, 2 px clear of any ink,
// fabric either side) at least FAINT.long mm long is sewn in the sewn colour it is a blend of with the fabric: its
// mean colour lies FAINT.toward or more of the way from the fabric to that colour, within FAINT.off of the line between
// them. It is then a thin line like any other (a triple run along it). Returns { labels, lines }.
const FAINT = { long: 6, toward: 0.3, off: 15 };
function faintKept(img, labels, w, h, colors, used, res) {
  const bg = colors.find((c) => c.background);
  if (!bg || !used.length || img.width !== w || img.height !== h) return { labels, lines: 0 };
  const P = pixels(img), { cl, len } = faintLines(P, labels, colors, true);
  const keep = [];
  for (let c = 1; c < len.length; c++) if (len[c] >= FAINT.long * res) keep.push(c);
  if (!keep.length) return { labels, lines: 0 };
  const sum = new Map(keep.map((c) => [c, [0, 0, 0, 0]]));
  for (let i = 0; i < w * h; i++) { const s = cl[i] && sum.get(cl[i]); if (s) { s[0] += P.lab[3 * i]; s[1] += P.lab[3 * i + 1]; s[2] += P.lab[3 * i + 2]; s[3]++; } }
  const lab3 = (c) => srgbToLab(...hexToRgb(c.picture || c.hex)), F = lab3(bg), to = new Map();
  for (const [c, s] of sum) {
    const M = [s[0] / s[3] - F[0], s[1] / s[3] - F[1], s[2] / s[3] - F[2]];
    let best = -1, bd = FAINT.off;
    for (const col of used) {
      if (col.inside) continue;
      const C = lab3(col), D = [C[0] - F[0], C[1] - F[1], C[2] - F[2]], DD = D[0] ** 2 + D[1] ** 2 + D[2] ** 2;
      if (!DD) continue;
      const t = (M[0] * D[0] + M[1] * D[1] + M[2] * D[2]) / DD, off = Math.hypot(M[0] - t * D[0], M[1] - t * D[1], M[2] - t * D[2]);
      if (t >= FAINT.toward && t <= 1.3 && off < bd) { bd = off; best = col.id; }
    }
    if (best >= 0) to.set(c, best);
  }
  if (!to.size) return { labels, lines: 0 };
  const out = labels.slice();
  for (let i = 0; i < w * h; i++) if (cl[i] && to.has(cl[i])) out[i] = to.get(cl[i]);
  return { labels: out, lines: to.size };
}

// The fabric's colour closed in by a line drawing (a mandala's rings, a colouring page's outlines) is the paper the
// lines are drawn on, not a colour of the design: sewn, a line-art mandala was a 95 mm disc of white fill under its
// lines (look 76 -> 67) and its 24 dots fell under the fleck rule inside it. A closed-in piece is left as fabric when
// under `LINE_INK` of the ink round it is thick (inside a stroke at least COLUMNS.min wide: sewn as a fill or a satin,
// not a line). White lettering on a badge, a jersey's diamonds, an eye's white, a white star in a red ring and the
// counters of bold letters are closed in by thick ink and stay sewn. Not when the person asked for it sewn ("all").
// Returns { labels (a copy when anything changed), mm2: the area left as fabric }.
const LINE_INK = 0.4, LINE_SOLID = 0.25, LINE_SMALL = 25, LINE_EDGE = 0.4;
function lineInside(labels, w, h, colors, res) {
  const ins = colors.find((c) => c.inside), bg = colors.find((c) => c.background), n = w * h;
  if (!ins || !bg) return { labels, mm2: 0 };
  const m = { w, h, data: new Uint8Array(n) };
  let any = false;
  for (let i = 0; i < n; i++) if (labels[i] === ins.id) { m.data[i] = 1; any = true; }
  if (!any) return { labels, mm2: 0 };
  // thick ink: within reach of a disc COLUMNS.min across inside one colour (a morphological opening)
  const thick = new Uint8Array(n), r = (COLUMNS.min / 2) * res;
  let ink = 0, solid = 0;
  for (const c of colors) {
    if (c.background || c.inside) continue;
    const s = { w, h, data: new Uint8Array(n) };
    let has = false;
    for (let i = 0; i < n; i++) if (labels[i] === c.id) { s.data[i] = 1; has = true; ink++; }
    if (!has) continue;
    const dt = distanceTransform(s), core = { w, h, data: new Uint8Array(n).fill(1) };
    for (let i = 0; i < n; i++) if (dt[i] > r) core.data[i] = 0;
    const to = distanceTo(core, r + 1);
    for (let i = 0; i < n; i++) if (s.data[i] && to[i] <= r + 0.5) { thick[i] = 1; solid++; }
  }
  // Only a drawing made of lines has paper. Where the design has solid parts (LINE_SOLID of its ink thick), what it
  // closes in is part of it and is sewn, whatever rings it (a tester, 2026-11: "if the design is fully surrounded by
  // a different colour the inside needs to be white, not transparent"): a mascot drawn in outline over block letters
  // was left as fabric. Not a piece under LINE_SMALL mm²: the counter of an o in thin print stays open (6 mm capitals: 20 mm²).
  // And thick ink counts through a soft edge (`near`: LINE_EDGE mm): the blend between a white letter and the solid
  // oval round it is a ring of a third colour a pixel wide, which read as a thin line, and the letter was left out.
  const whole = solid >= LINE_SOLID * ink, near = distanceTo({ w, h, data: thick.map((v) => 1 - v) }, LINE_EDGE * res + 1);
  const { labels: cl, count } = label(m), rim = new Int32Array(count + 1), fat = new Int32Array(count + 1), size = new Int32Array(count + 1);
  for (let i = 0; i < n; i++) {
    const c = cl[i]; if (!c) continue;
    size[c]++;
    const x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= n || cl[j] || labels[j] < 0) continue;
      rim[c]++; if (near[j] <= LINE_EDGE * res) fat[c]++;
    }
  }
  const go = new Uint8Array(count + 1);
  let mm2 = 0;
  for (let c = 1; c <= count; c++) if (rim[c] && fat[c] < LINE_INK * rim[c] && !(whole && size[c] >= LINE_SMALL * res * res)) { go[c] = 1; mm2 += size[c]; }
  if (!mm2) return { labels, mm2: 0 };
  const out = labels.slice();
  for (let i = 0; i < n; i++) if (cl[i] && go[cl[i]]) out[i] = bg.id;
  return { labels: out, mm2: mm2 / (res * res) };
}

// Flecks take the colour round them before anything is sewn (Wilcom's "Details" slider and mySewnet's Despeckle
// filter small areas of colour out of the picture first; Stitch Era's guide deletes 30-50 % of the traced shapes as
// "too small to be stitched", then fills the holes). A fleck is a piece of one sewn colour that is a dot (as below:
// under 1.5 mm², or under 4 mm² and 2.5 mm across) or under PICTURES.fleck mm², with PICTURES.enclosed of its edge
// against other sewn colours. It joins the one it touches most. Up to PICTURES.eyes of them in a colour stay (an eye).
// Returns the labels to sew (a copy when anything changed) and how many pieces were folded in.
function foldFlecks(labels, w, h, colors, used, res) {
  const n = w * h, out = [];
  const minPx = 1.5 * res * res, dotPx = 4 * res * res, dotW = 2.5 * res, fleckPx = PICTURES.fleck * res * res;
  // each sewn colour's pieces, and where a fill has body: a piece of 4 mm² or more that is 1.5 mm wide somewhere. A
  // fleck joins only such a fill: the blend round a dark letter on a pale label is a ring of a third colour, and the
  // letters took it (a label's "Embroidered" went from black to the grey of its own halo).
  const body = new Uint8Array(n), parts = [], fabric = colors.find((c) => c.background);
  for (const col of used) {
    const m = { w, h, data: new Uint8Array(n) };
    for (let i = 0; i < n; i++) m.data[i] = labels[i] === col.id ? 1 : 0;
    const { labels: cl, count } = label(m);
    if (!count) continue;
    const dt = distanceTransform(m), size = new Int32Array(count + 1), wide = new Float64Array(count + 1);
    const x0 = new Int32Array(count + 1).fill(w), x1 = new Int32Array(count + 1).fill(-1), y0 = new Int32Array(count + 1).fill(h), y1 = new Int32Array(count + 1).fill(-1);
    for (let i = 0; i < n; i++) {
      const c = cl[i]; if (!c) continue;
      const x = i % w, y = (i - x) / w; size[c]++;
      if (dt[i] > wide[c]) wide[c] = dt[i];
      if (x < x0[c]) x0[c] = x; if (x > x1[c]) x1[c] = x; if (y < y0[c]) y0[c] = y; if (y > y1[c]) y1[c] = y;
    }
    for (let i = 0; i < n; i++) { const c = cl[i]; if (c && size[c] >= dotPx && (2 * wide[c]) / res >= 1.5) body[i] = 1; }
    parts.push({ col, cl, count, size, wide, x0, x1, y0, y1 });
  }
  for (const { col, cl, count, size, wide, x0, x1, y0, y1 } of parts) {
    // (a line under 1 mm wide is drawn on top of a fill, however short its pieces: only its dots are flecks)
    const dot = (c) => size[c] < minPx || (size[c] < dotPx && x1[c] - x0[c] < dotW && y1[c] - y0[c] < dotW);
    const small = (c) => dot(c) || (size[c] < fleckPx && (2 * wide[c]) / res >= 1.0);
    const rim = new Int32Array(count + 1), on = new Map();   // on: piece * 64 + other colour -> shared edge
    for (let i = 0; i < n; i++) {
      const c = cl[i]; if (!c || !small(c)) continue;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= n || cl[j] === c) continue;
        rim[c]++;
        if (body[j]) on.set(c * 64 + labels[j], (on.get(c * 64 + labels[j]) || 0) + 1);
      }
    }
    const to = new Int32Array(count + 1).fill(-1), best = new Int32Array(count + 1), all = new Int32Array(count + 1);
    for (const [key, k] of on) { const c = Math.floor(key / 64), l = key % 64; all[c] += k; if (k > best[c]) { best[c] = k; to[c] = l; } }
    const flecks = [];
    for (let c = 1; c <= count; c++) if (small(c) && rim[c] && all[c] >= PICTURES.enclosed * rim[c]) flecks.push(c);
    // (pieces big enough to sew as a dot: see `fair` below)
    const meant = flecks.filter((c) => size[c] >= 0.6 * res * res && Math.min(x1[c] - x0[c] + 1, y1[c] - y0[c] + 1) >= 0.8 * res);
    const keep = new Set(meant.length <= PICTURES.eyes ? meant : []);
    const go = new Int32Array(count + 1).fill(-1);
    let any = false;
    // (a fleck of the fabric's colour inside the design, `inside`, is fabric again: folded, the hole in a letter filled
    // with the letter's thread)
    for (const c of flecks) if (!keep.has(c)) { go[c] = col.inside && fabric ? fabric.id : to[c]; any = true; }
    if (any) out.push({ cl, go });
  }
  if (!out.length) return { labels, folded: 0 };
  const next = labels.slice();
  let folded = 0;
  for (const { cl, go } of out) {
    for (let i = 0; i < n; i++) if (cl[i] && go[cl[i]] >= 0) next[i] = go[cl[i]];
    for (const g of go) if (g >= 0) folded++;
  }
  return { labels: next, folded };
}

// A centre line's reach `r` (one side) near a joint, within `zone` of that end (`atStart`; `s`: each sample's distance
// along, the same unit), no more than `k` times what it is just past there (the next `zone`): by the joint the normal
// runs down the other stroke. Measured just past it, not along the whole line: a serif U's thick stem was capped to
// the median of its thin bowl and sewn a third of its width, off to one side (2026-11)
function capJoint(r, s, atStart, zone, k) {
  const L = s[s.length - 1], d = (i) => (atStart ? s[i] : L - s[i]), near = r.filter((_, i) => d(i) >= zone && d(i) < 2 * zone);
  const v = (near.length >= 3 ? near : r).slice().sort((x, y) => x - y), m = v[v.length >> 1] * k;
  for (let i = 0; i < r.length; i++) if (d(i) < zone && r[i] > m) r[i] = m;
}

// A column piece (`px`: its pixels in the working copy, `w` x `h`; `more`: pixels of the fill it grows out of, which
// its ends may reach into) as satin nets, each a connected set of centre lines: [{ edges: [{ a, b, p (mm), s (mm
// along p), A, B (each side's reach, mm, on p's normal's side and the other) }], W (its width, mm), dotted }].
// The centre lines are the piece's skeleton (`skeletonEdges`, spurs under a stroke pruned, loose ends carried on to the
// edge as a line drawing's are); a dot, or a piece that thins to nothing, has one: its long axis (moments). Each side
// is measured across the shape along the normal (a round end narrows as the shape does; the distance to the edge
// alone would sew it as a diamond), at most COLUMNS.cap times that distance at the centre line, so a junction's
// other strokes don't count. A column stops where it is under COLUMNS.tip across.
export function columnNets(px, more, w, h, own, res, toMm, dotted, serif = 0, apex = 0, knots = 0, reachOut = false) {
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (const i of [...px, ...more]) { const x = i % w, y = (i - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const ox = Math.max(0, x0 - 2), oy = Math.max(0, y0 - 2), cw = Math.min(w - 1, x1 + 2) - ox + 1, ch = Math.min(h - 1, y1 + 2) - oy + 1;
  const pm = { w: cw, h: ch, data: new Uint8Array(cw * ch) };
  for (const i of [...px, ...more]) { const x = i % w, y = (i - x) / w; pm.data[(y - oy) * cw + x - ox] = 1; }
  const at = (x, y) => { const X = Math.round(x), Y = Math.round(y); return X >= 0 && Y >= 0 && X < cw && Y < ch && pm.data[Y * cw + X] === 1; };
  const ownAt = (x, y) => own[(Math.min(ch - 1, Math.max(0, Math.round(y))) + oy) * w + Math.min(cw - 1, Math.max(0, Math.round(x))) + ox];
  const hw = px.map((i) => own[i]).sort((a, b) => a - b), stroke = Math.max(2, 2 * hw[Math.floor(0.9 * (hw.length - 1))]);
  let es = [];
  // (a loop shorter than two strokes round is thinning's knot at a blunt end, not a ring: sewn, a little star of
  // satin stood off a bold c's end)
  const loopLen = (p) => p.reduce((t, q, i) => (i ? t + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);
  // (unless it rings fabric: a small P's or e's counter. Dropped, the bowl round it sewed as one fan from the stem)
  // (a counter at least a quarter stroke square: a pinhole in a blob, ringed, sewed as a starburst)
  const hole = 0.25 * stroke * stroke, rings = (p) => {
    let n = 0, bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    for (const [x, y] of p) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
    for (let y = Math.ceil(by0); y <= by1; y++) for (let x = Math.ceil(bx0); x <= bx1; x++) {
      if (at(x, y)) continue;
      let odd = false;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < p[j][0] + ((p[i][0] - p[j][0]) * (y - p[j][1])) / (p[i][1] - p[j][1])) odd = !odd;
      if (odd && ++n >= hole) return true;
    }
    return false;
  };
  if (!dotted) { es = skeletonEdges(pm, stroke, { spur: 1, stubs: serif, forks: true, knots: knots * stroke }).filter((e) => e[2].length > 1 && (e[0] !== e[1] || loopLen(e[2]) >= 2 * stroke || rings(e[2])));
    // (a short dead end is a serif's arm when it lies square to one stroke at its node and straight on from another,
    // or from its own twin: an I's serif either side of its stem, an E's past its top arm. A V's or an A's point leaves
    // a dead end too, straight on from both legs and square to neither: dropped, or the point is a joint of three)
    if (serif) {
      const deg = new Map(), dirAt = (e, k) => { const p = e[0] === k ? e[2] : e[2].slice().reverse(); let j = 1, d = 0; while (j < p.length - 1 && d < stroke) { d += Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]); j++; } const L = Math.hypot(p[j][0] - p[0][0], p[j][1] - p[0][1]) || 1; return [(p[j][0] - p[0][0]) / L, (p[j][1] - p[0][1]) / L]; };
      for (const e of es) for (const k of [e[0], e[1]]) deg.set(k, (deg.get(k) || 0) + 1);
      es = es.filter((e) => {
        if (e[0] === e[1] || e[2].length >= stroke) return true;   // (only what `stubs` kept: longer dead ends were never pruned)
        const k = deg.get(e[0]) === 1 ? e[1] : deg.get(e[1]) === 1 ? e[0] : null; if (k === null || deg.get(k) < 3) return true;
        const u = dirAt(e, k); let on = false, square = false;
        for (const o of es) if (o !== e && (o[0] === k || o[1] === k)) { const v = dirAt(o, k), d = u[0] * v[0] + u[1] * v[1]; if (d < -0.8) on = true; if (Math.abs(d) < 0.5) square = true; }
        // (or a crossing's arm, straight on through a joint of four: a fat X's shorter arms, cut by thinning under a stroke)
        return on && (square || deg.get(k) >= 4);
      });
    }
    lineEnds(es, pm, stroke); }
  if (!es.length) {
    // (the long axis: the shape's second moments)
    let n = 0, sx = 0, sy = 0, xx = 0, yy = 0, xy = 0;
    for (let i = 0; i < cw * ch; i++) if (pm.data[i]) { const x = i % cw, y = (i - x) / cw; n++; sx += x; sy += y; xx += x * x; yy += y * y; xy += x * y; }
    const cx = sx / n, cy = sy / n, vx = xx / n - cx * cx, vy = yy / n - cy * cy, cv = xy / n - cx * cy, th = 0.5 * Math.atan2(2 * cv, vx - vy), u = [Math.cos(th), Math.sin(th)];
    let t0 = Infinity, t1 = -Infinity;
    for (let i = 0; i < cw * ch; i++) if (pm.data[i]) { const x = i % cw, y = (i - x) / cw, t = (x - cx) * u[0] + (y - cy) * u[1]; if (t < t0) t0 = t; if (t > t1) t1 = t; }
    t0 += 0.5; t1 -= 0.5;
    if (!(t1 > t0)) { t0 = -0.5; t1 = 0.5; }
    es = [["a", "b", [[cx + u[0] * t0, cy + u[1] * t0], [cx + u[0] * t1, cy + u[1] * t1]]]];
    dotted = true;
  }
  // (`reachOut`: ink no centre line reaches, COLUMNS.reach strokes square or more, gets a stroke of its own, straight
  // from the nearest point of a centre line to its far end: a serif A's line ran round its counter and never up into
  // its apex, which was bare, and the letter a fill)
  if (reachOut && !dotted && es.length) for (let n = 0, grown = true; grown && n < COLUMNS.grow; n++) {
    grown = false;
    const near = new Uint8Array(cw * ch);
    for (const e of es) for (const [x, y] of e[2]) { const r = ownAt(x, y) + 1.5; for (let dy = -Math.ceil(r); dy <= r; dy++) for (let dx = -Math.ceil(r); dx <= r; dx++) { if (dx * dx + dy * dy > r * r) continue; const X = Math.round(x + dx), Y = Math.round(y + dy); if (X >= 0 && Y >= 0 && X < cw && Y < ch) near[Y * cw + X] = 1; } }
    // (the largest such patch each time, then the rest again: one patch can be an apex and a leg's far side)
    const seen = new Uint8Array(cw * ch);
    let blob = [];
    for (let s0 = 0; s0 < cw * ch; s0++) {
      if (!pm.data[s0] || near[s0] || seen[s0]) continue;
      const b = [s0], st = [s0]; seen[s0] = 1;
      while (st.length) { const i = st.pop(), x = i % cw; for (const j of [x > 0 ? i - 1 : -1, x < cw - 1 ? i + 1 : -1, i - cw, i + cw]) if (j >= 0 && j < cw * ch && pm.data[j] && !near[j] && !seen[j]) { seen[j] = 1; st.push(j); b.push(j); } }
      if (b.length > blob.length) blob = b;
    }
    if (blob.length < (COLUMNS.reach * stroke) ** 2) break;
    let cx = 0, cy = 0; for (const i of blob) { cx += i % cw; cy += Math.floor(i / cw); } cx /= blob.length; cy /= blob.length;
    let best = null;
    es.forEach((e, k) => e[2].forEach(([x, y], j) => { const d = (x - cx) ** 2 + (y - cy) ** 2; if (!best || d < best.d) best = { d, k, j }; }));
    const e = es[best.k], P = e[2][best.j];
    let tip = null, far = -1; for (const i of blob) { const x = i % cw, y = Math.floor(i / cw), d = (x - P[0]) ** 2 + (y - P[1]) ** 2; if (d > far) { far = d; tip = [x, y]; } }
    const L = Math.sqrt(far), u = [(tip[0] - P[0]) / L, (tip[1] - P[1]) / L], end = L - Math.min(ownAt(...tip) + 1, 0.3 * stroke);
    if (end < 0.5 * stroke) break;
    // (the new stroke runs on the ink all the way, or it is no stroke)
    const line = []; for (let t = 0; t <= end; t += 1) { const q = [P[0] + u[0] * t, P[1] + u[1] * t]; if (!at(q[0], q[1])) break; line.push(q); }
    if (line.length < 0.5 * stroke) break;
    let node;
    if (best.j === 0) node = e[0]; else if (best.j === e[2].length - 1) node = e[1];
    else { node = `o${n}`; es.splice(best.k, 1, [e[0], node, e[2].slice(0, best.j + 1)], [node, e[1], e[2].slice(best.j)]); }
    es.push([node, `o${n}t`, line]); grown = true;
  }
  // (two centre lines that meet at a node nothing else comes to are one line: left as two, each ended at the node as
  // a column's end does, and where the node sat on a corner of an outline both fanned round it: `satin`'s mitre
  // needs the corner inside one line)
  for (let again = true; again; ) {
    again = false;
    const at = new Map();
    es.forEach((e, k) => { for (const v of [e[0], e[1]]) { if (!at.has(v)) at.set(v, []); at.get(v).push(k); } });
    for (const [v, ks] of at) {
      if (ks.length !== 2 || ks[0] === ks[1]) continue;
      const [e1, e2] = [es[ks[0]], es[ks[1]]], p1 = e1[1] === v ? e1[2] : e1[2].slice().reverse(), p2 = e2[0] === v ? e2[2] : e2[2].slice().reverse();
      const joined = [e1[1] === v ? e1[0] : e1[1], e2[0] === v ? e2[1] : e2[0], [...p1, ...p2.slice(1)]];
      es = es.filter((_, k) => k !== ks[0] && k !== ks[1]); es.push(joined); again = true; break;
    }
  }
  // (a centre line that doubles back at a point, COLUMNS.apex degrees or more: an N's or M's corners, a V's foot. The
  // skeleton rounds the corner off and prunes its point as a spur, and sewn along it an N came out an "n", its corners
  // bare (cover 0.6-0.9, so it stayed a fill). There the line is cut into its strokes, each carried on straight to the
  // ink's edge, as a digitizer lays an N: three columns that lap at the corners)
  if (!dotted && apex) {
    const k = Math.max(2, Math.ceil(stroke / (0.1 * res))), f = Math.round(COLUMNS.legs * k), cut = [],   // (f: a leg is read straight from k to f along it, COLUMNS.legs widths: over 1.6 a thin arc, a cat's eye, passed as two straight legs and was cut)
    unit = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
    const grow = (p, u) => { const o = []; let [x, y] = p; for (let t = 0; t < 4 * stroke && at(x + u[0] * 0.5, y + u[1] * 0.5); t += 0.5) { x += u[0] * 0.5; y += u[1] * 0.5; o.push([x, y]); } return o; };
    let n = 0;
    for (const e of es) {
      const q = resample(e[2], 0.1 * res), tops = [], pick = [];
      if (e[0] !== e[1]) for (let i = f; i < q.length - f; i++) {
        const u = unit(q[i - f], q[i - k]), v = unit(q[i + k], q[i + f]), t = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])));
        if (t < (apex * Math.PI) / 180) continue;
        // (both legs straight where their directions are read: a U's bend turns as far, all the way round)
        const h = k >> 1, bend = (a, m, b) => { const u1 = unit(a, m), u2 = unit(m, b); return Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]))); };
        if (Math.max(bend(q[i - f], q[(2 * i - k - f) >> 1], q[i - k]), bend(q[i + k], q[(2 * i + k + f) >> 1], q[i + f])) > (COLUMNS.straight * Math.PI) / 180) continue;
        // (and nearly all of the turn made within a stroke's width of the point, COLUMNS.sharp of it: a small U's
        // bend has straight legs too, but turns all the way along)
        const u2 = unit(q[i - k], q[i - h]), v2 = unit(q[i + h], q[i + k]), near = Math.acos(Math.max(-1, Math.min(1, u2[0] * v2[0] + u2[1] * v2[1])));
        // (or the ink runs on past the turn, out along the corner's middle, COLUMNS.point strokes or more: a V's point.
        // A 6 mm V's skeleton turned round over two widths, and its point was left bare; a U's bend reaches half a stroke)
        const out = unit([0, 0], [u[0] - v[0], u[1] - v[1]]); let r = 0;
        while (r < 3 * stroke && at(q[i][0] + out[0] * (r + 0.5), q[i][1] + out[1] * (r + 0.5))) r += 0.5;
        if (near >= COLUMNS.sharp * t || r >= COLUMNS.point * stroke) tops.push([t, i]);
      }
      tops.sort((x, y) => y[0] - x[0] || x[1] - y[1]);
      for (const [, i] of tops) if (!pick.some((j) => Math.abs(j - i) < 2 * f)) pick.push(i);
      if (!pick.length) { cut.push(e); continue; }
      pick.sort((x, y) => x - y);
      let from = 0, a = e[0], lead = [];
      for (const i of pick) {
        cut.push([a, `apex${n}a`, [...lead, ...q.slice(from, i - k + 1), ...grow(q[i - k], unit(q[i - f], q[i - k]))], true]);
        lead = grow(q[i + k], unit(q[i + f], q[i + k])).reverse(); from = i + k; a = `apex${n++}b`;
      }
      cut.push([a, e[1], [...lead, ...q.slice(from)], true]);
    }
    es = cut;
  }
  const E = [], deg = new Map(), cov = new Uint8Array(cw * ch);
  for (const [a, b] of es) for (const k of [a, b]) deg.set(k, (deg.get(k) || 0) + 1);
  for (const [a, b, p0, apex] of es) {
    let q = resample(p0, 0.1 * res);
    if (q.length < 2) continue;
    // (a sharp turn of the centre line, a star's point on its outline: the outer side reaches 1 / sin(half the
    // inside angle) times as far, the mitre, measured over a stroke width either way; capped at the distance to the
    // edge, the column stopped short of the point and left it bare: corpus holes 22 -> 49 mm²)
    const k = Math.max(2, Math.ceil(stroke / (0.1 * res))), ring = a === b && q.length > 2 * k + 2;
    const turns = () => q.map((_, i) => {
      // (not on a line under 6 widths long: a blob's short curl of a centre line turns all round, and mitred every
      // way it sewed as a starburst at the density limit)
      if (dotted || q.length < 6 * k || (!ring && (i < k || i + k >= q.length))) return [0, 1];
      const n = q.length - 1, P = q[ring ? (i - k + n) % n : i - k], N = q[ring ? (i + k) % n : i + k];
      const ux = q[i][0] - P[0], uy = q[i][1] - P[1], vx = N[0] - q[i][0], vy = N[1] - q[i][1], L = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      if (!L) return [0, 1];
      const turn = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / L))), s = Math.sin((Math.PI - turn) / 2);
      return [ux * vy - uy * vx > 0 ? -1 : 1, 1 / Math.max(s, COLUMNS.mitre)];
    });
    let mitre = turns();
    // (a ring alone, a star's outline, starts and ends at its straightest place: a column's end is sewn square across,
    // so a point there stayed bare whatever its reach)
    if (ring && deg.get(a) === 2) {
      let j = 0;
      for (let i = 1; i < q.length - 1; i++) if (mitre[i][1] < mitre[j][1]) j = i;
      if (j) { const base = q.slice(0, -1); q = [...base.slice(j), ...base.slice(0, j), base[j]]; mitre = turns(); }
    }
    const nm = normals(q);
    const reach = (i, sg) => {
      const [x, y] = q[i], cap = dotted ? Infinity : COLUMNS.cap * ownAt(x, y) * (mitre[i][0] === sg ? mitre[i][1] : 1) + 1, far = cw + ch;
      let t = 0;
      while (t < cap && t < far && at(x + nm[i][0] * sg * (t + 0.25), y + nm[i][1] * sg * (t + 0.25))) t += 0.25;
      // (the last step found ink up to the pixel's middle at best: the edge lies a quarter pixel back on average)
      return Math.max(0, t - 0.25);
    };
    const ra = q.map((_, i) => reach(i, 1)), rb = q.map((_, i) => reach(i, -1));
    // (evened over 0.2 mm either way: a pixel's stair is not the shape)
    const even = (r) => r.map((_, i) => { let s = 0, k = 0; for (let j = Math.max(0, i - 2); j <= Math.min(r.length - 1, i + 2); j++) { s += r[j]; k++; } return s / k / res; });
    const A = even(ra), B = even(rb);
    // (a stroke cut at an apex is as wide as it usually is: at the corner its normal runs along the next stroke)
    if (apex) { const s0 = q.map((_, i) => 0); for (let i = 1; i < q.length; i++) s0[i] = s0[i - 1] + Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]); for (const r of [A, B]) for (const end of [true, false]) capJoint(r, s0, end, 1.5 * stroke, 1.15); }
    // (only a loose end stops short; a column narrower than `tip` between two others, a leaf's vein in its outline, is
    // sewn `tip` wide: cut out, the vein was lost)
    let i0 = 0, i1 = q.length - 1;
    if (deg.get(a) === 1 || dotted) while (i0 < i1 && A[i0] + B[i0] < COLUMNS.tip) i0++;
    if (deg.get(b) === 1 || dotted) while (i1 > i0 && A[i1] + B[i1] < COLUMNS.tip) i1--;
    if (i1 - i0 < 3) continue;
    // (what the column covers, each stitch's line and a pixel round it)
    for (let i = i0; i <= i1; i++) for (let t = -B[i] * res; t <= A[i] * res; t += 0.5) {
      const X = Math.round(q[i][0] + nm[i][0] * t), Y = Math.round(q[i][1] + nm[i][1] * t);
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = X + dx, y = Y + dy; if (x >= 0 && y >= 0 && x < cw && y < ch) cov[y * cw + x] = 1; }
    }
    const p = toMm(q.slice(i0, i1 + 1).map(([x, y]) => [x + ox, y + oy])), lo = COLUMNS.tip / 2;
    // (each side less half a thread: the satin's thread lies past its needle holes, and sewn to the drawn edge a 1 mm
    // outline came out half again as bold)
    const in2 = COLUMNS.thread / 2;
    // (each stitch's slant off the centre line's normal: square across the line as it runs over `steady` stroke widths
    // either way, not as it bends under a stitch. Square to every wiggle of a small letter's skeleton, the stitches of
    // a 1.2 mm stroke turned every way at once, a fuzzy fan)
    const s = arclen(p), K = steadySlant(p, s, COLUMNS.steady * stroke / res);
    E.push({ a, b, p, s, K, joins: [deg.get(a) > 1, deg.get(b) > 1], A: A.slice(i0, i1 + 1).map((v) => Math.max(lo, v - in2)), B: B.slice(i0, i1 + 1).map((v) => Math.max(lo, v - in2)) });
  }
  // (where three or more strokes meet, the two that run on through each other are one stroke, and the others are
  // branches off it: an E's middle arm off its stem, an A's bar off each leg. A branch's satin stops COLUMNS.lap mm
  // inside the stroke it joins. Sewn to the node at the stroke's middle, arm and stem lay across each other over half
  // the stem's width with both their underlays, a knot of thread at every joint)
  if (COLUMNS.lap) {
    const ends = new Map(), dir = (e, atA) => { const p = atA ? e.p : e.p.slice().reverse(), s = arclen(p), far = Math.min(s[s.length - 1], stroke / res); let j = 1; while (j < p.length - 1 && s[j] < far) j++; const L = Math.hypot(p[j][0] - p[0][0], p[j][1] - p[0][1]) || 1; return [(p[j][0] - p[0][0]) / L, (p[j][1] - p[0][1]) / L]; };
    const half = (e) => { const v = e.A.map((a, i) => a + e.B[i]).sort((x, y) => x - y); return v[v.length >> 1] / 2; };
    for (const e of E) { if (e.a === e.b) continue; for (const atA of [true, false]) { const k = atA ? e.a : e.b; if (!ends.has(k)) ends.set(k, []); ends.get(k).push({ e, atA, u: dir(e, atA) }); } }
    for (const list of ends.values()) {
      if (list.length < 3) continue;
      let best = -0.7, pair = null;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const d = list[i].u[0] * list[j].u[0] + list[i].u[1] * list[j].u[1]; if (d < best) { best = d; pair = [list[i], list[j]]; } }
      if (!pair) continue;
      const cut = Math.max(0, Math.max(half(pair[0].e), half(pair[1].e)) - COLUMNS.lap);
      // (the stroke itself is no wider by the joint than it usually is: there its normal runs down the branch, and a
      // serif's bar sewed long stitches down into its stem)
      for (const t of pair) { const e = t.e, L = e.s[e.s.length - 1]; e.A0 ||= e.A.slice(); e.B0 ||= e.B.slice();
        for (const r of [e.A, e.B]) capJoint(r, e.s, t.atA, (1.5 * stroke) / res, 1.1); }
      // (and is as wide as the branch usually is: by the joint its normal runs along the stroke it joins)
      for (const t of list) if (!pair.includes(t)) { t.e[t.atA ? "ta" : "tb"] = cut; t.e.A0 ||= t.e.A.slice(); t.e.B0 ||= t.e.B.slice(); for (const r of [t.e.A, t.e.B]) capJoint(r, t.e.s, t.atA, (1.5 * stroke) / res, 1.1); }
    }
  }
  // (connected sets of centre lines: each one walk)
  const root = new Map(), find = (k) => { while (root.get(k) !== k) k = root.get(k); return k; };
  for (const e of E) { for (const k of [e.a, e.b]) if (!root.has(k)) root.set(k, k); root.set(find(e.a), find(e.b)); }
  const nets = new Map();
  for (const e of E) { const k = find(e.a); if (!nets.has(k)) nets.set(k, []); nets.get(k).push(e); }
  // (whether a point, mm, lies on the piece's ink: `netStitches` keeps every satin stitch's ends on it)
  const m0 = toMm([[ox, oy]])[0], m1 = toMm([[ox + 1, oy]])[0], m2 = toMm([[ox, oy + 1]])[0], det = (m1[0] - m0[0]) * (m2[1] - m0[1]) - (m2[0] - m0[0]) * (m1[1] - m0[1]);
  const ink = (X, Y) => { const u = X - m0[0], v = Y - m0[1]; return at((u * (m2[1] - m0[1]) - v * (m2[0] - m0[0])) / det, (v * (m1[0] - m0[0]) - u * (m1[1] - m0[1])) / det); };
  const out = [...nets.values()].map((edges) => ({ edges, W: stroke / res, dotted, ink }));
  let hit = 0;
  for (const i of px) { const x = i % w, y = (i - x) / w; if (cov[(y - oy) * cw + x - ox]) hit++; }
  out.cover = hit / px.length;
  return out;
}

// The slant (satin's `shape` third value: tangent of the stitch's turn off the normal) that lays each stitch square
// across the line's direction averaged over `h` mm either way along it, at most 45°. 0 everywhere when h is 0.
function steadySlant(p, s, h) {
  const n = p.length, K = new Array(n).fill(0);
  if (!(h > 0) || n < 3) return K;
  const tx = [], ty = [];
  for (let i = 0; i < n; i++) { const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; tx.push((b[0] - a[0]) / L); ty.push((b[1] - a[1]) / L); }
  let lo = 0, hi = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    while (hi < n && s[hi] <= s[i] + h) { sx += tx[hi]; sy += ty[hi]; hi++; }
    while (s[lo] < s[i] - h) { sx -= tx[lo]; sy -= ty[lo]; lo++; }
    const L = Math.hypot(sx, sy);
    if (!L) continue;
    // (the stitch d is square to the mean tangent; as n + k t with n = (-ty, tx) and t the local tangent: k = d.t / d.n)
    const dx = -sy / L, dy = sx / L, dn = dx * -ty[i] + dy * tx[i], dt = dx * tx[i] + dy * ty[i];
    if (dn > 1e-6) K[i] = Math.max(-1, Math.min(1, dt / dn));
  }
  return K;
}

// A piece's area over the area of its convex hull (pixel corners): 1 for a disc or an ellipse, under 0.85 for a ragged
// patch or a crescent.
function solidity(px, w) {
  const pts = [];
  for (const i of px) { const x = i % w, y = (i - x) / w; pts.push([x - 0.5, y - 0.5], [x + 0.5, y - 0.5], [x - 0.5, y + 0.5], [x + 0.5, y + 0.5]); }
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  const hull = [...lo.slice(0, -1), ...hi.slice(0, -1)];
  let A = 0;
  for (let i = 0; i < hull.length; i++) { const p = hull[i], q = hull[(i + 1) % hull.length]; A += p[0] * q[1] - q[0] * p[1]; }
  return A ? px.length / (Math.abs(A) / 2) : 1;
}

// Whether a centre line's width (as measured, `A0`, smoothed over 9 samples) rises and falls at most `turns` times
// its range all along it (or barely changes: 0.3 mm). `off`: mm left out at each end that meets another line (where
// two strokes join the width swells to the joint's: a serif B's bowls failed on that alone)
function smooth(e, turns, off = 0) {
  const L = e.s[e.s.length - 1], j = e.joins || [], keep = (i) => e.a === e.b || ((!j[0] || e.s[i] > off) && (!j[1] || L - e.s[i] > off));
  const A = (e.A0 || e.A).filter((_, i) => keep(i)), B = (e.B0 || e.B).filter((_, i) => keep(i)), v = A.map((a, i) => a + B[i]), k = 4, sm = v.map((_, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - k); j <= Math.min(v.length - 1, i + k); j++) { s += v[j]; n++; } return s / n; });
  let tv = 0, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < sm.length; i++) { if (i) tv += Math.abs(sm[i] - sm[i - 1]); lo = Math.min(lo, sm[i]); hi = Math.max(hi, sm[i]); }
  return !(hi - lo > 0.3 && tv > turns * (hi - lo));
}

// Whether a stroke's centre lines make plain columns: few short strokes between junctions (a ragged patch thins to a
// tangle of them, and each is a column turned its own way), and an even width along them away from their ends (a
// leaf's half, 0 to 4 mm across, sewed as a fan; an outline is even). Else the piece stays a fill.
export function plain(nets, letter = false) {
  let all = 0, short = 0;
  const wd = [], near = [];
  for (const net of nets) for (const e of net.edges) {
    const L = e.s[e.s.length - 1];
    all += L;
    if (e.a !== e.b && L < COLUMNS.stub * net.W) short += L;
    // (as measured, `A0`: not as a branch was evened by its joint)
    const A = e.A0 || e.A, B = e.B0 || e.B;
    for (let i = 0; i < e.s.length; i++) { if (e.s[i] > net.W && L - e.s[i] > net.W) wd.push(A[i] + B[i]); if (e.s[i] > net.W / 2 && L - e.s[i] > net.W / 2) near.push(A[i] + B[i]); }
  }
  if (!all) return false;
  const spreadOf = (v) => { v.sort((x, y) => x - y); return v.length < 10 ? 1 : v[Math.floor(0.9 * (v.length - 1))] / v[Math.floor(0.1 * (v.length - 1))]; };
  // (short strokes between junctions are a letter's when they are all one width, COLUMNS.letter, and together
  // COLUMNS.run widths long: an E, an H, an A. A ragged patch's are every width, and a fat letter's X is four stubs
  // that sew as a knot. A small letter's strokes are each under two widths: measured from half a width off their ends)
  // (a letter's strokes may swell and thin as a serif face's do, 4-5 times over: Georgia's O, C, S, its thick stems
  // and hairline bars, all fills when every stroke had to be one width. Each stroke's width turns at most once per
  // COLUMNS.serifs widths of its length, as a pen's does; a ragged patch's goes up and down all along it)
  // (as well as, not instead of, the rules below: alone it turned a bold logo's small line from satin to fill)
  // (in a row of letters, COLUMNS.word widths are enough: a condensed face's strokes are fat, and Impact's T is 5.97)
  const run = (letter ? COLUMNS.word : COLUMNS.run) * nets[0].W;
  if (letter && COLUMNS.serifs && all >= run && nets.every((net) => net.edges.every((e) => smooth(e, Math.max(COLUMNS.taper, e.s[e.s.length - 1] / (COLUMNS.serifs * net.W)), net.W)))) return true;
  if (short > COLUMNS.short * all) { const v = wd.length >= 10 ? wd : near; return v.length >= 10 && all >= run && spreadOf(v) <= COLUMNS.letter; }
  const spread = spreadOf(wd);
  if (wd.length < 10) return true;
  if (spread <= COLUMNS.even) return true;
  // (or uneven only as a taper is: along each centre line the width rises and falls at most `taper` times its range,
  // a brush stroke narrowing to its point (once) or a leaf's half swelling and narrowing again (twice); a ragged
  // patch's width goes up and down all along it)
  // (only one open line at least 4 widths long: a blob whose centre line is a short curl or a loop passed as a taper
  // and sewed as a starburst of satin)
  if (!COLUMNS.taper || nets.length !== 1 || nets[0].edges.length !== 1) return false;
  for (const net of nets) for (const e of net.edges) {
    if (e.a === e.b || e.s[e.s.length - 1] < 4 * net.W) return false;
    if (!smooth(e, COLUMNS.taper)) return false;
  }
  return true;
}

// A satin net's stitches from node `start`: each centre line out as its underlay (a centre run; from `zigzagFrom` mm
// across a zigzag 0.4 mm inside each edge, as lettering) and back as the satin, so a connected net sews in one go,
// ending where it began (`tour`; the lettering engine's walk). A dot narrower than `zigzagFrom` is one satin from the
// end the needle is at, with nothing under it.
export function netStitches(net, start, sat) {
  const E = net.edges, pick = (arr, s, ss) => {
    let lo = 0, hi = ss.length - 1;
    if (s <= 0) return arr[0];
    if (s >= ss[hi]) return arr[hi];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] <= s) lo = m; else hi = m; }
    const f = ss[hi] > ss[lo] ? (s - ss[lo]) / (ss[hi] - ss[lo]) : 0;
    return arr[lo] + (arr[hi] - arr[lo]) * f;
  };
  const column = (e, p, fwd) => {
    const L = e.s[e.s.length - 1], a = (s) => (fwd ? pick(e.A, s, e.s) : pick(e.B, L - s, e.s)), b = (s) => (fwd ? pick(e.B, s, e.s) : pick(e.A, L - s, e.s));
    const k = (s) => pick(e.K, fwd ? s : L - s, e.s);
    let top = 0, sum = 0;
    for (let i = 0; i < e.A.length; i++) { top = Math.max(top, e.A[i], e.B[i]); sum += e.A[i] + e.B[i]; }
    return { L, a, b, k, W: 2 * top + 0.01, mid: sum / e.A.length };
  };
  if (net.dotted && E.length === 1 && net.W < sat.zigzagFrom) {
    const e = E[0], fwd = start === e.a, p = fwd ? e.p : e.p.slice().reverse(), c = column(e, p, fwd);
    return satin(p, c.W, sat.gap, COLUMNS.pull + sat.pull, false, true, null, (s) => [c.a(s), c.b(s), c.k(s)]);
  }
  // (no satin stitch ends off the ink, COLUMNS.past mm at most: a stitch's end out there is drawn back along the
  // stitch. A mitred A's point stood 3.6 mm over the letter, an arm's end 0.8 mm past its ink: 2026-11, the owner's
  // "the V is bigger than the other letters")
  const keep = (q) => {
    if (!net.ink || !COLUMNS.past) return q;
    for (let i = 0; i < q.length; i++) {
      const o = q[i - 1] || q[i + 1]; if (!o) continue;
      const L = Math.hypot(o[0] - q[i][0], o[1] - q[i][1]); if (L < 0.2) continue;
      const u = [(o[0] - q[i][0]) / L, (o[1] - q[i][1]) / L];
      let t = 0;
      while (t < 0.6 * L && !net.ink(q[i][0] + u[0] * (t + COLUMNS.past), q[i][1] + u[1] * (t + COLUMNS.past))) t += 0.1;
      if (t) { q[i][0] += u[0] * t; q[i][1] += u[1] * t; }
    }
    // (and a stitch wholly off the ink is not sewn: a mitre's point past a letter's flat top)
    const on = ([x, y]) => { for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (net.ink(x + a * COLUMNS.past, y + b * COLUMNS.past)) return true; return false; };
    for (let i = q.length - 1; i >= 0; i--) if (!on(q[i])) q.splice(i, 1);
    return q;
  };
  // (the part of a line from s0 to s1 mm along it)
  const span = (p, s0, s1) => {
    const s = arclen(p), o = [], pt = (t) => { let j = 1; while (j < p.length - 1 && s[j] < t) j++; const f = s[j] > s[j - 1] ? (t - s[j - 1]) / (s[j] - s[j - 1]) : 0; return [p[j - 1][0] + (p[j][0] - p[j - 1][0]) * f, p[j - 1][1] + (p[j][1] - p[j - 1][1]) * f]; };
    o.push(pt(s0)); for (let j = 0; j < p.length; j++) if (s[j] > s0 + 1e-6 && s[j] < s1 - 1e-6) o.push(p[j]); o.push(pt(s1));
    return o;
  };
  const out = [];
  for (const [p0, kind, k] of tour(E.map((e) => [e.a, e.b, e.p]), start)) {
    const e = E[k], fwd = p0[0] === e.p[0] && p0[1] === e.p[1], c0 = column(e, p0, fwd);
    // (a branch's stitches start and stop short of the stroke it joins: the way to the node is a plain run)
    let t0 = (fwd ? e.ta : e.tb) || 0, t1 = (fwd ? e.tb : e.ta) || 0;
    if (c0.L - t0 - t1 < 1) t0 = t1 = 0;
    const cutShort = t0 || t1, p = cutShort ? span(p0, t0, c0.L - t1) : p0;
    const c = cutShort ? { ...c0, L: c0.L - t0 - t1, a: (s) => c0.a(s + t0), b: (s) => c0.b(s + t0), k: (s) => c0.k(s + t0) } : c0;
    if (t0) out.push(...run(span(p0, 0, t0), 1.2));
    if (kind === "run") {
      if (c.mid >= sat.zigzagFrom) {
        // (from COLUMNS.edges mm across, an edge run 0.4 mm inside each side first, out along one and back along the
        // other, then the zigzag out: sold designs hold a wide column's edges so, and the owner's sewn letters showed
        // their satin's sides pulled in and the fabric between the stitches. Narrower, the zigzag alone)
        if (COLUMNS.edges && c.mid >= COLUMNS.edges) {
          const q = resample(p, 0.5), sq = arclen(q), nq = normals(q);
          const side = (sg) => q.map((pt, i) => { const r = Math.max(0.1, (sg > 0 ? c.a(sq[i]) : c.b(sq[i])) - 0.4); return [pt[0] + nq[i][0] * sg * r, pt[1] + nq[i][1] * sg * r]; });
          out.push(...keep(run(side(1), 2.0)), ...keep(run(side(-1).reverse(), 2.0)));
        }
        out.push(p[0], ...keep(satin(p, c.W, 2.5, 0, false, false, (t) => Math.max(0.05, c.a(t * c.L) + c.b(t * c.L) - 0.8))), p[p.length - 1]);
      }
      else out.push(...run(p, 1.2));
    } else out.push(...keep(satin(p, c.W, sat.gap, COLUMNS.pull + sat.pull, false, true, null, (s) => [c.a(s), c.b(s), c.k(s)], { mitre: true })));
    if (t1) out.push(...run(span(p0, c0.L - t1, c0.L), 1.2));
  }
  return out;
}

// Small lettering in a picture (a logo's second line: 3-4 mm capitals with strokes a third of a mm wide; a tester,
// 2026-11: "I want the lettering to be more clear"). Its rows are found as the page's check finds them (artcheck.js
// `artShapes`: three or more letter-like pieces on one baseline), on labels where a colour between the fabric's and
// a darker one counts as the darker (a thin dark stroke's soft edge is learned as a grey of its own when threads are
// to spare, and half of each letter was grey). In a row under TEXT.small mm tall:
// - that in-between colour is the letters' colour (one thread a letter, the stroke its full width);
// - every piece is kept, however little thread it sews (an I is 3.5 mm of line: under the 6 mm a group of lines
//   needs and the 8 mm a piece only a jump reaches needs; UNIVERSITY lost its two I's and its T);
// - the needle jumps from letter to letter where the move would cross fabric (a sewn move of up to 2 mm joined S to
//   C to H at whatever height the last stroke ended: the word read as one scribble). The machine leaves a jump that
//   short uncut, so each is a thread to snip, as between the Design tab's print letters, and is counted.
// Returns { labels (a copy when anything changed), px: 1 on every pixel of such a row, rows }.
const TEXT = { small: 9, sure: 6, many: 6, least: 2, pad: 0.4, word: 3, flat: 0.55, pen: 0.8, bold: 0.2, satin: 0.7, column: 5, line: 3.2, least2: 0.35, most: 0.7 };
// How wide (mm, needle to needle) a small letter's strokes are sewn, by the letters' height: thread is 0.4 mm thick, so
// a satin shows 0.4 mm wider than it is sewn and a 0.6 mm satin made a 1 mm stroke on a 3 mm letter, every counter
// shut (2026-11: SCHOOL OF MEDICINE at 3 mm read as blobs). Under TEXT.line mm tall a stroke is one line of thread three
// times over (0: no satin); from there the satin grows from TEXT.least2 to TEXT.most at TEXT.column mm.
const textWide = (mm) => (mm < TEXT.line ? 0 : Math.min(TEXT.most, TEXT.least2 + ((TEXT.most - TEXT.least2) * (mm - TEXT.line)) / (TEXT.column - TEXT.line)));
function smallText(labels, w, h, colors, used, res) {
  const fab = colors.find((c) => c.background), none = { labels, px: null, rows: 0 };
  if (!used.length) return none;
  // (a see-through picture has no fabric colour, and so no colour in between it and the letters': its letters are
  // found all the same. They were not, and words on a clear background sewed as hairlines: 2026-11)
  const lab = (c) => srgbToLab(...hexToRgb(c.picture || c.hex)), e = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), F = fab ? lab(fab) : null, bare0 = fab ? fab.id : -1;   // (bare fabric: the background's colour, or see-through)
  // each sewn colour's darker end: the sewn colour furthest from the fabric that it lies between the fabric and
  const to = new Map();
  for (const q of F ? used : []) {
    if (q.inside) continue;   // (the fabric's colour closed in by the design is no one's soft edge)
    let best = null, bd = e(F, lab(q));
    for (const c of used) if (c !== q && e(F, lab(c)) > bd && e(F, lab(q)) + e(lab(q), lab(c)) <= 1.25 * e(F, lab(c))) { best = c; bd = e(F, lab(c)); }
    if (best) to.set(q.id, best.id);
  }
  const L = to.size ? labels.map((v) => (to.has(v) ? to.get(v) : v)) : labels;
  const rows = artShapes({ w, h, labels: L, colors }, res).rows.filter((r) => r.mm < TEXT.small && r.mm >= TEXT.least && (r.mm < TEXT.sure || r.n >= TEXT.many));   // (under 2 mm: flecks along a bold word's edge, on one line as letters are)
  if (!rows.length) return none;
  // (a word a space away is the row's too: a piece of the colour as tall as the letters, level with them, within
  // TEXT.word heights of the row's end. "OF" after "UNIVERSITY" was not in its row, and its F stayed half grey)
  for (const col of new Set(rows.map((r) => r.col))) {
    const m = { w, h, data: new Uint8Array(w * h) };
    for (let i = 0; i < w * h; i++) if (L[i] === col) m.data[i] = 1;
    const { labels: cl, count } = label(m), x0 = new Int32Array(count + 1).fill(w), x1 = new Int32Array(count + 1).fill(-1), y0 = new Int32Array(count + 1).fill(h), y1 = new Int32Array(count + 1).fill(-1);
    for (let i = 0; i < w * h; i++) { const c = cl[i]; if (!c) continue; const x = i % w, y = (i - x) / w; if (x < x0[c]) x0[c] = x; if (x > x1[c]) x1[c] = x; if (y < y0[c]) y0[c] = y; if (y > y1[c]) y1[c] = y; }
    for (const r of rows) if (r.col === col) for (let more = true; more;) {
      more = false;
      const H = r.box[3] - r.box[1] + 1;
      for (let c = 1; c <= count; c++) {
        if (x0[c] >= r.box[0] && x1[c] <= r.box[2]) continue;
        const gap = Math.max(r.box[0] - x1[c], x0[c] - r.box[2]);
        if (gap > TEXT.word * H || y0[c] < r.box[1] - 0.2 * H || y1[c] > r.box[3] + 0.2 * H || y1[c] - y0[c] + 1 < 0.5 * H || x1[c] - x0[c] + 1 > 1.6 * H) continue;
        r.box[0] = Math.min(r.box[0], x0[c]); r.box[2] = Math.max(r.box[2], x1[c]); more = true;
      }
    }
  }
  // Letters apart, each whole. Their cores (the letters' colour a pixel inside its edge; a piece too thin to have one
  // is its own core, and so is a stroke that is all soft edge: a piece of the in-between colour, as tall as half
  // the row, touching no letter) grow back out through the colour and then up to 3 px into the in-between colour,
  // all at once; where two meet, and wherever the in-between colour is left over, is fabric. So a neck a pixel or
  // two wide between two letters is cut (round letters 0.2 mm apart touch once drawn at 8 px a mm: SCHOOL was one
  // piece and its centre line ran from letter to letter), and a soft edge never bridges two. By the row's box alone
  // the soft top edge of a red word under a black row turned black.
  const px = new Int16Array(w * h), out = labels.slice(), pad = Math.round(TEXT.pad * res), id = new Int32Array(w * h), n = w * h;
  for (const r of rows) {
    // (a pixel above and below, no more: the dark top edge of the next line's bold word was sewn as ticks)
    const X0 = Math.max(0, r.box[0] - pad), X1 = Math.min(w - 1, r.box[2] + pad), Y0 = Math.max(0, r.box[1] - 1), Y1 = Math.min(h - 1, r.box[3] + 1), H = r.box[3] - r.box[1] + 1;
    const each = (f) => { for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) f(y * w + x, x, y); };
    const around = (i, f) => { const x = i % w; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, j = i + dy * w + dx; if ((dx || dy) && X >= 0 && X < w && j >= 0 && j < n) f(j); } };
    const ink = (i) => labels[i] === r.col, soft = (i) => to.get(labels[i]) === r.col;
    each((i) => { px[i] = r.col + 1; id[i] = 0; });
    let ids = 0;
    // 8-connected pieces of `ok` pixels in the box, each { all, y0, y1, touches (an ink pixel beside it) }
    const pieces = (ok) => {
      const seen = new Set(), found = [];
      each((s) => {
        if (seen.has(s) || !ok(s)) return;
        const p = { all: [s], y0: h, y1: -1, touches: false }, st = [s]; seen.add(s);
        while (st.length) { const i = st.pop(), y = Math.floor(i / w); if (y < p.y0) p.y0 = y; if (y > p.y1) p.y1 = y; around(i, (j) => { if (ink(j)) p.touches = true; if (!seen.has(j) && ok(j) && j % w >= X0 && j % w <= X1 && Math.floor(j / w) >= Y0 && Math.floor(j / w) <= Y1) { seen.add(j); st.push(j); p.all.push(j); } }); }
        found.push(p);
      });
      return found;
    };
    const core = (i) => { if (!ink(i)) return false; let all = true; around(i, (j) => { if (!ink(j)) all = false; }); return all; };
    let front = [];
    for (const p of pieces(core)) { ids++; for (const i of p.all) { id[i] = ids; front.push(i); } }
    for (const p of pieces(ink)) if (!p.all.some((i) => id[i])) { ids++; for (const i of p.all) { id[i] = ids; front.push(i); } }
    for (const p of pieces(soft)) if (!p.touches && p.y0 >= r.box[1] - 1 && p.y1 <= r.box[3] + 1 && p.y1 - p.y0 + 1 >= 0.5 * H) { ids++; for (const i of p.all) { id[i] = ids; out[i] = r.col; front.push(i); } }
    // (and on into the fabric until the strokes are TEXT.pen mm wide, 2 px a side at most: a 0.7 mm stroke sewn to its
    // own width is a satin half a millimetre across, or one line of thread, and the owner found a single line too
    // thin to read as lettering. Letters still stop where two would meet.)
    const dts = distanceTransform({ w, h, data: Uint8Array.from(id, (v, i) => (ink(i) && px[i] === r.col + 1 ? 1 : 0)) }), hw = [];
    each((i) => { if (ink(i)) hw.push(dts[i]); });
    hw.sort((a, b) => a - b);
    const pen = hw.length ? (2 * hw[Math.floor(0.9 * (hw.length - 1))]) / res : 0, fat = r.mm < TEXT.column ? 0 : Math.max(0, Math.min(2, Math.round(((Math.min(TEXT.pen, TEXT.bold * r.mm) - pen) / 2) * res)));   // (never bolder than a bold face, TEXT.bold of the letters' height: at 4 mm, 1.1 mm strokes closed every counter)
    const depth = new Uint8Array(n), out2 = new Uint8Array(n);
    while (front.length) {
      const next = [], set = [];
      for (const i of front) if (id[i] > 0) around(i, (j) => {
        const bare = !ink(j) && !soft(j) && (labels[j] === bare0 || labels[j] < 0);
        if (id[j] || px[j] !== r.col + 1 || !(ink(j) || (soft(j) && depth[i] < 3) || (bare && out2[i] < fat))) return;
        let k = 0, two = false; around(j, (q) => { if (id[q] > 0) { if (!k) k = id[q]; else if (id[q] !== k) two = true; } });
        set.push([j, two ? -1 : k, soft(j) ? depth[i] + 1 : depth[i], bare ? out2[i] + 1 : out2[i], bare]);
      });
      for (const [j, k, dp, o2, bare] of set) if (!id[j]) { id[j] = k; depth[j] = dp; out2[j] = o2; if (k > 0) { next.push(j); if (bare) out[j] = r.col; } }
      front = next;
    }
    each((i) => { if (ink(i) || soft(i)) out[i] = id[i] > 0 ? r.col : bare0; });
  }
  return { labels: out, px, rows: rows.length, list: rows };
}

function build(img, analysis, opts) {
  const o = { ...DEFAULTS, ...opts };
  const { w, h, colors } = analysis;
  const used0 = colors.filter((c) => !c.background && c.area > 0 && !(o.skip || []).includes(c.id));
  const level = PICTURES.details[o.details] || PICTURES.details.most;
  // (the picture made into clean shapes first: core/regions.js)
  // (the paper inside a line drawing stays fabric, unless the person asked for the closed-in colour sewn)
  // (and lines too faint to label sewn in the colour they are a blend of)
  const faint = faintKept(img, analysis.labels, w, h, colors, used0, o.res);
  const paper = o.inside === "all" ? { labels: faint.labels, mm2: 0 } : lineInside(faint.labels, w, h, colors, o.res);
  const clean = o.shapes === false ? { labels: paper.labels } : cleanShapes(paper.labels, w, h, colors, o.res, { img, keep: o.details === "all" ? "all" : "" });
  const flecked = foldFlecks(clean.labels, w, h, colors, used0, o.res), folded = flecked.folded;
  // (small lettering: one thread a letter, every letter kept, no sewn moves between letters)
  // (not in a picture shaded like a photo, `TEXT.flat`: a photographed title's strokes are grain, and etsy_8's two
  // lines of 3 mm script cost 45 trims and 28 loose threads to read no better)
  // (nor where that can't be told: a picture sewn without its scale, as the batch page's are)
  const lettered = o.lettering === false || !(analysis.flat >= TEXT.flat) ? { labels: flecked.labels, px: null, rows: 0 } : smallText(flecked.labels, w, h, colors, used0, o.res), labels = lettered.labels;
  const rowAt = ([x, y]) => { const X = x * o.res + w / 2, Y = y * o.res + h / 2; return (lettered.list || []).find((r) => X >= r.box[0] - 4 && X <= r.box[2] + 4 && Y >= r.box[1] - 4 && Y <= r.box[3] + 4) || null; };
  const inText = ([x, y]) => { if (!lettered.px) return false; const X = Math.round(x * o.res + w / 2), Y = Math.round(y * o.res + h / 2); return X >= 0 && Y >= 0 && X < w && Y < h && lettered.px[Y * w + X] > 0; };
  // (soft gradients sewn as blends of two threads, core/shade.js: `of` says where a colour sews, `rows` its rows there)
  const sh = shading(img, labels, colors, used0, o.res, o);
  const res = o.res;
  const hoop = o.hoop;
  const cx = w / 2, cy = h / 2, toMm = (p) => p.map(([x, y]) => [(x - cx) / res, (y - cy) / res]);
  // (hits counted as they are made, as the Design tab's: satin ends at a junction give way at 19 per mm² rather than
  // being thinned afterwards. `ease: false` sews as before PX2, for comparing)
  const d = new Design(hoop, { ease: o.ease !== false });
  const used = colors.filter((c) => !c.background && c.area > 0 && !(o.skip || []).includes(c.id))
    .sort((a, b) => b.lightness - a.lightness);   // light first, dark details on top
  // Small lettering on a filled colour is sewn after that colour, whichever is lighter: white words on a navy oval
  // were sewn first and the navy's rows, which reach 0.2 mm past every edge, closed over their half-millimetre
  // strokes (2026-11). The colour the row lies in: what most of its box is, the letters apart.
  for (const r of lettered.list || []) {
    const n = new Map();
    for (let y = r.box[1]; y <= r.box[3]; y++) for (let x = r.box[0]; x <= r.box[2]; x++) { const v = labels[y * w + x]; if (v !== r.col) n.set(v, (n.get(v) || 0) + 1); }
    const [on, most] = [...n].sort((a, b) => b[1] - a[1])[0] || [], all = [...n.values()].reduce((a, b) => a + b, 0);
    const at = used.findIndex((c) => c.id === r.col), under = used.findIndex((c) => c.id === on);
    if (under > at && at >= 0 && most > 0.6 * all) used.splice(under, 0, ...used.splice(at, 1));
  }
  const summary = [], stitched = new Set(used.map((c) => c.id));
  const fine = { narrowMm2: 0, hairlines: 0, inkMm2: 0, folded, left: 0, columns: 0, paper: Math.round(paper.mm2), faint: faint.lines, shaded: Math.round(sh.area), shades: sh.found || 0, offer: sh.offer, ...(o.shadeDebug ? { shadeDebug: sh.debug } : {}) };   // details too small to stitch cleanly (shown as a hint)
  for (let i = 0; i < w * h; i++) if (stitched.has(labels[i])) fine.inkMm2++;
  fine.inkMm2 /= res * res;
  // ignore specks: under 1.5 mm², or under 4 mm² and under 2.5 mm across (a dot, not a stem: each speck left was a
  // trim, two locks and often a loose thread; 4 mm² for all erased the thin stems of a line-art bouquet)
  const minPx = 1.5 * res * res, EYES = 6, dotPx = 4 * res * res, dotW = 2.5 * res;
  // where each colour's fill will surely lie: over 0.6 mm inside a shape that isn't a speck. A travel run sewn there
  // by an earlier colour is covered.
  // (the thread a fill of so many px sews: its rows and its underlay)
  const fillThread = (px) => (px / (res * res)) * (1 / o.density + 1 / UNDERLAY.rows);
  const solid = new Uint8Array(w * h), budget = routeBudget();
  // (rows of letters of any size, as the page's check finds them: a stroke in one is a letter's, and may swell and
  // thin as a serif face's do, COLUMNS.serifs. Not in a photo, as `smallText`)
  const words = analysis.flat >= TEXT.flat ? artShapes({ w, h, labels, colors }, res).rows : [];
  const inWords = (px, id) => { const i = px[px.length >> 1], x = i % w, y = (i - x) / w; return words.some((r) => r.col === id && x >= r.box[0] && x <= r.box[2] && y >= r.box[1] && y <= r.box[3]); };
  for (const col of used) {
    const m = { w, h, data: new Uint8Array(w * h) };
    for (let i = 0; i < w * h; i++) m.data[i] = sh.of(i, col.id) ? 1 : 0;
    const dt = distanceTransform(m), { labels: cl, count } = label(m), big = new Uint8Array(count + 1);
    const size = new Int32Array(count + 1), x0 = new Int32Array(count + 1).fill(w), x1 = new Int32Array(count + 1).fill(-1), y0 = new Int32Array(count + 1).fill(h), y1 = new Int32Array(count + 1).fill(-1);
    for (let i = 0; i < w * h; i++) {
      const c = cl[i]; if (!c) continue;
      const x = i % w, y = (i - x) / w; size[c]++;
      if (x < x0[c]) x0[c] = x; if (x > x1[c]) x1[c] = x; if (y < y0[c]) y0[c] = y; if (y > y1[c]) y1[c] = y;
    }
    // (and not one the Details choice may leave out: travel under it would lie bare)
    for (let c = 1; c <= count; c++) big[c] = (size[c] >= dotPx || (size[c] >= minPx && (x1[c] - x0[c] >= dotW || y1[c] - y0[c] >= dotW))) && fillThread(size[c]) >= level.start ? 1 : 0;
    for (let i = 0; i < w * h; i++) if (cl[i] && big[cl[i]] && dt[i] > 0.6 * res) solid[i] = 1;
  }
  for (const [k, col] of used.entries()) {
    const mask = { w, h, data: new Uint8Array(w * h) };
    for (let i = 0; i < w * h; i++) mask.data[i] = sh.of(i, col.id) ? 1 : 0;
    fine.narrowMm2 += narrowGaps(mask, res, (i) => !stitched.has(labels[i]));
    const own = distanceTransform(mask);   // the colour's own shapes, for their widths
    // (specks: see minPx above)
    // Each shape grows under the colours sewn later (they cover the join), never into the background or an
    // earlier colour. Specks go first, and shapes grow apart: merged, scattered specks would fill the colour above
    // them, and a bridge between two shapes funnels every fill travel through it.
    const later = new Set(used.slice(k + 1).map((c) => c.id));
    const { labels: cl, count } = label(mask);
    // Lines under 1 mm wide (stems, small lettering, outlines) are sewn along their centre, however small each piece
    // is: a thin line breaks into short pieces in a picture, and dropping those as specks erased whole titles and
    // most of the stems. Wider specks (dots) go: each was a trim, two locks and often a loose thread.
    const size = new Int32Array(count + 1), wide = new Float64Array(count + 1), bx0 = new Int32Array(count + 1).fill(w), bx1 = new Int32Array(count + 1).fill(-1), by0 = new Int32Array(count + 1).fill(h), by1 = new Int32Array(count + 1).fill(-1);
    for (let i = 0; i < w * h; i++) {
      const c = cl[i]; if (!c) continue;
      const x = i % w, y = (i - x) / w; size[c]++;
      if (own[i] > wide[c]) wide[c] = own[i];
      if (x < bx0[c]) bx0[c] = x; if (x > bx1[c]) bx1[c] = x; if (y < by0[c]) by0[c] = y; if (y > by1[c]) by1[c] = y;
    }
    const thinC = (c) => (2 * wide[c]) / res < 1.0;
    const dot = (c) => size[c] < minPx || (size[c] < dotPx && bx1[c] - bx0[c] < dotW && by1[c] - by0[c] < dotW);
    // (a mark at least 2 mm long and half as long again as it's wide, within 2 mm of a bigger piece of its colour, is
    // no dot: KENJI'S apostrophe at 60 mm went. Marks out on their own still go: each is a trim and two locks)
    const away = { w, h, data: new Uint8Array(w * h) };
    for (let i = 0; i < w * h; i++) away.data[i] = cl[i] && !dot(cl[i]) ? 0 : 1;
    const toBig = distanceTo(away, 5 * res), near = new Uint8Array(count + 1), byText = new Uint8Array(count + 1);
    for (let i = 0; i < w * h; i++) if (cl[i] && toBig[i] <= 2 * res) near[cl[i]] = 1;
    for (let i = 0; i < w * h; i++) if (cl[i] && toBig[i] <= 5 * res) byText[cl[i]] = 1;
    const mark = (c) => { const a = bx1[c] - bx0[c] + 1, b = by1[c] - by0[c] + 1; return near[c] && Math.max(a, b) >= 2 * res && Math.max(a, b) >= 1.5 * Math.min(a, b); };
    // (nor is a dot on the fabric, 0.8 mm across and 0.6 mm² or more, within 5 mm of one or of another such dot: an
    // i's dot, a full stop, a colon after a space. Text lost every one of them under 4 mm². On the fabric: all but a fifth
    // of its edge against open fabric (a blend colour's slivers along a crayon line's flecks aren't). It's filled,
    // however thin: as a line it was under the 1.5 mm a line needs)
    // (a colour between the fabric's and this one round it is its anti-aliased edge: fabric too)
    const fab = colors.find((q) => q.background), lab3 = (id) => srgbToLab(...hexToRgb(colors[id].picture || colors[id].hex)), me = lab3(col.id);
    const e3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), F = fab ? lab3(fab.id) : null;
    const edgy = new Map(colors.map((q) => [q.id, !stitched.has(q.id) || (F && e3(F, lab3(q.id)) + e3(lab3(q.id), me) <= 1.25 * e3(F, me))]));
    const rim = new Int32Array(count + 1), bare = new Int32Array(count + 1), sewnOn = new Int32Array(count + 1);
    for (let i = 0; i < w * h; i++) {
      const c = cl[i]; if (!c || !dot(c)) continue;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || cl[j] === c) continue;
        rim[c]++; if (labels[j] < 0 || edgy.get(labels[j])) bare[c]++; else if (labels[j] !== col.id) sewnOn[c]++;
      }
    }
    const fair = (c) => size[c] >= 0.6 * res * res && Math.min(bx1[c] - bx0[c] + 1, by1[c] - by0[c] + 1) >= 0.8 * res;
    const solo = (c) => fair(c) && bare[c] >= 0.8 * rim[c];
    // (nor is a dot of that size inside another colour that's sewn, all but a fifth of its edge against it: an eye.
    // A child's dinosaur at 100 mm lost its 1.5 mm eye. More than EYES of them in one colour are a texture's flecks)
    const eyes = [];
    for (let c = 1; c <= count; c++) if (dot(c) && fair(c) && sewnOn[c] >= 0.8 * rim[c]) eyes.push(c);
    const eye = new Uint8Array(count + 1);
    if (eyes.length <= EYES) for (const c of eyes) eye[c] = 1;
    const cand = [], pair = new Uint8Array(count + 1);
    for (let c = 1; c <= count; c++) if (dot(c) && solo(c)) cand.push(c);
    for (const a of cand) for (const b of cand) {
      const gx = Math.max(bx0[a], bx0[b]) - Math.min(bx1[a], bx1[b]), gy = Math.max(by0[a], by0[b]) - Math.min(by1[a], by1[b]);
      if (a !== b && Math.max(gx, gy) <= 5 * res) pair[a] = 1;
    }
    const tittle = (c) => solo(c) && (byText[c] || pair[c]);
    const speck = (c) => dot(c) && !mark(c) && !tittle(c) && !eye[c], line = (c) => thinC(c) && !(dot(c) && tittle(c));
    // A thin piece lying between the fabric and another colour, in a colour between theirs, is the blend along that
    // colour's edge (a dark letter's anti-aliasing read as green), not a line of its own.
    const touch = new Map();
    for (let i = 0; i < w * h; i++) {
      const c = cl[i]; if (!c || !line(c)) continue;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || cl[j] === c) continue;
        const l = labels[j];
        if (l === col.id) continue;
        const key = c * 4096 + (stitched.has(l) ? 2048 : 0) + (l + 1);
        touch.set(key, (touch.get(key) || 0) + 1);
      }
    }
    const most = new Map();   // per piece: [open colour, count], [other stitched colour, count]
    for (const [key, k] of touch) {
      const c = Math.floor(key / 4096), sew = key & 2048 ? 1 : 0, l = (key & 2047) - 1, m = most.get(c) || [[-1, 0], [-1, 0]];
      if (k > m[sew][1]) m[sew] = [l, k];
      most.set(c, m);
    }
    const labOf = (id) => srgbToLab(...hexToRgb(colors[id].picture || colors[id].hex)), mine = labOf(col.id), dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    // (only its pixels beside that colour go: a stem that runs past a leaf keeps the rest of its length)
    const between = new Map();
    for (const [c, m] of most) {
      if (m[0][0] < 0 || m[1][0] < 0) continue;
      const A = labOf(m[0][0]), B = labOf(m[1][0]);
      if (dE(A, mine) + dE(mine, B) <= 1.25 * dE(A, B)) between.set(c, m[1][0]);
    }
    const edgeOf = (i, l) => {
      const x = i % w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, j = i + dy * w + dx;
        if (X >= 0 && X < w && j >= 0 && j < w * h && labels[j] === l) return true;
      }
      return false;
    };
    const thin = { w, h, data: new Uint8Array(w * h) };
    let anyThin = false;
    for (let i = 0; i < w * h; i++) {
      if (!cl[i]) continue;
      // (small lettering is sewn along its strokes' centres, whatever their width: as rows a millimetre long each
      // letter was a ragged block. Not its dots: an i's dot is a dot, kept and filled as before)
      if (lettered.px && lettered.px[i] === col.id + 1 && !dot(cl[i])) continue;   // (small lettering: satin below, else its centre line)
      if (line(cl[i]) && between.has(cl[i]) && edgeOf(i, between.get(cl[i]))) { cl[i] = 0; mask.data[i] = 0; }
      else if (line(cl[i])) { thin.data[i] = 1; anyThin = true; cl[i] = 0; mask.data[i] = 0; }
      else if (speck(cl[i])) { cl[i] = 0; mask.data[i] = 0; }
    }
    // The thin parts of a filled shape (a stem growing out of its leaves) are too narrow for fill rows (rows under
    // 0.6 mm are dropped): they're sewn as lines too. Thin = not reached by a 0.7 mm disc that fits inside the shape.
    {
      const r = THIN_PART * res, core = { w, h, data: new Uint8Array(w * h) };
      for (let i = 0; i < w * h; i++) core.data[i] = cl[i] && own[i] > r ? 0 : 1;
      const toCore = distanceTo(core, r + 0.5);
      for (let i = 0; i < w * h; i++) if (cl[i] && toCore[i] > r + 0.5) { thin.data[i] = 1; anyThin = true; }
    }
    // Satin columns (PX2; research I4, after Goldman's auto-digitizing patents, expired: thick or thin from the
    // distance to the edge along the centre line, satin anchored at the ends and junctions). What a digitizer sews
    // as satin is what no fill should: a stroke 1-5 mm wide (an outline, a stem, a letter's stroke) and a small dot
    // (an eye, a highlight). Filled, each was a strip of rows a few stitches long, and a dot a knot of rows and
    // underlay. A shape no wider than COLUMNS.wide is a column whole; a wider one keeps its body as a fill (where a
    // disc COLUMNS.wide across fits: a morphological opening) and the strokes growing out of it are columns.
    const cols = [], colPx = new Uint8Array(w * h);
    // (not the fabric's colour closed in by the design: its leftover slivers between outlines sewed as white fans)
    if (COLUMNS.wide && count && !col.inside) {
      // (nor in a row of letters whose pen is under COLUMNS.wide: where two strokes meet, and at a V's flat foot, the
      // ink holds a wider disc than either stroke, and an Impact H, K, V and W were cut there and filled)
      const r = (COLUMNS.wide / 2) * res, notCore = { w, h, data: new Uint8Array(w * h) }, word = new Uint8Array(w * h);
      for (const row of words) if (row.col === col.id && row.pen <= COLUMNS.wide) for (let y = row.box[1]; y <= row.box[3]; y++) word.fill(1, y * w + row.box[0], y * w + row.box[2] + 1);
      for (let i = 0; i < w * h; i++) notCore.data[i] = cl[i] && own[i] > r && !word[i] ? 0 : 1;
      const toCore = distanceTo(notCore, r + 1), part = { w, h, data: new Uint8Array(w * h) }, thick = new Uint8Array(count + 1);
      for (let i = 0; i < w * h; i++) if (cl[i]) { if (toCore[i] > r + 0.5) part.data[i] = 1; else thick[cl[i]] = 1; }
      const { labels: pl, count: pc } = label(part);
      const P = Array.from({ length: pc + 1 }, () => ({ px: [], c: 0, hw: [] }));
      for (let i = 0; i < w * h; i++) if (pl[i]) { const q = P[pl[i]]; q.px.push(i); q.c = cl[i]; q.hw.push(own[i]); }
      for (let k = 1; k <= pc; k++) {
        const q = P[k], c = q.c, whole = !thick[c];
        q.hw.sort((a, b) => a - b);
        // (its width: twice the 90th percentile of the distance to the edge, about the stroke's own width)
        const W = (2 * q.hw[Math.floor(0.9 * (q.hw.length - 1))]) / res, A = q.px.length / (res * res);
        // (by its usual width, not its widest: a network of 0.6 mm lines is over 1 mm where two cross, and sewn as
        // satin the mandala's lines came out twice as bold)
        // (small lettering is satin from TEXT.satin mm, whatever its strokes' shapes: a letter is short strokes at
        // every angle, which `plain` and `cover` are there to refuse in a ragged patch)
        const text = !!lettered.px && lettered.px[q.px[0]] === col.id + 1 && !dot(c);
        if (text) {
          const tall = (rowAt(toMm([[q.px[0] % w, Math.floor(q.px[0] / w)]])[0]) || { mm: 0 }).mm >= TEXT.column;
          let nets = tall && W >= TEXT.satin && whole ? columnNets(q.px, [], w, h, own, res, toMm, false) : [];
          // (cut at its sharp corners where that covers COLUMNS.gain more, as larger letters: a 6 mm N's corners and a
          // V's and a W's points were left bare, 9-12 % of the letter)
          if (nets.length && COLUMNS.apex && nets.cover < COLUMNS.whole) { const alt = columnNets(q.px, [], w, h, own, res, toMm, false, 0, COLUMNS.apex); if (alt.length && alt.cover >= nets.cover + COLUMNS.gain) nets = alt; }
          // (and with its serifs kept as bars, as larger letters: a 6 mm slab face's feet were bare, 18 letters of 36)
          if (nets.length && COLUMNS.serif && nets.cover < COLUMNS.whole) { const alt = columnNets(q.px, [], w, h, own, res, toMm, false, COLUMNS.serif, COLUMNS.apex); if (alt.length && alt.cover >= nets.cover + COLUMNS.gain) nets = alt; }
          if (nets.length) { cols.push({ px: q.px, c, whole, nets, meant: true, text: true }); for (const i of q.px) { colPx[i] = 1; cl[i] = 0; mask.data[i] = 0; thin.data[i] = 0; } }
          continue;
        }
        if (W < COLUMNS.min) continue;
        // (nor a piece under COLUMNS.small mm²: a satin that small is all tie-in and tie-off, and the cap on thread per
        // square mm left a 1 mm dot only its locks, a knot. A mark that small stays as it was)
        if (A < COLUMNS.small) continue;
        const stroke = A / (W * W) >= COLUMNS.long;
        // (a part of a wider shape is a column only when it is a stroke: the corners an opening cuts off a fill stay
        // the fill's)
        if (!whole && !stroke) continue;
        // (a dot only when it is a plain blob, nearly convex: a ragged patch sewn as one satin fanned every way)
        if (!stroke && solidity(q.px, w) < COLUMNS.solid) continue;
        // (a stroke cut off a fill reaches COLUMNS.into mm into it, so the two meet with no gap)
        const more = [];
        if (!whole) {
          const seen = new Set(q.px);
          let front = q.px;
          for (let s = 0; s < COLUMNS.into * res && front.length; s++) {
            const next = [];
            for (const i of front) { const x = i % w; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < w * h && !seen.has(j) && cl[j] === c) { seen.add(j); next.push(j); more.push(j); } }
            front = next;
          }
        }
        const letter = stroke && inWords(q.px, col.id);
        let nets = columnNets(q.px, more, w, h, own, res, toMm, !stroke);
        // (and only when its columns cover the piece: thinning prunes a stroke shorter than it is wide as a spur, and a
        // slab F's middle arm was left bare)
        const fine2 = (n) => n.length && n.cover >= COLUMNS.cover && (!stroke || plain(n, letter));
        // (a piece its strokes don't cover is tried cut at its sharp corners, COLUMNS.apex: an N, an M, a V. Only then:
        // cut everywhere, a cat's thin eye that sewed well was cut at its curl and sewn askew, look 82.8 -> 80.9)
        let cutAt = 0;
        // (or one they cover with ink to spare, under COLUMNS.whole, when cut it covers COLUMNS.gain more: an M's corners)
        if (stroke && COLUMNS.apex && (!fine2(nets) || nets.cover < COLUMNS.whole)) { const alt = columnNets(q.px, more, w, h, own, res, toMm, false, 0, COLUMNS.apex); if (fine2(alt) && (!fine2(nets) || alt.cover >= nets.cover + COLUMNS.gain)) { nets = alt; cutAt = COLUMNS.apex; } }
        // (a piece its strokes don't cover is tried again with its serifs kept as strokes, COLUMNS.serif: a slab I is
        // a stem and two bars, as a cap's is sewn. Only then: kept for every piece, the dead ends at a V's point and
        // a T's bar made joints of three in letters that sewed well without them)
        // (or that they cover with ink to spare, under COLUMNS.whole: then the serifs' way is taken when it covers
        // COLUMNS.gain more. A slab E's strokes cover 0.93 of it, its serifs bare)
        if (stroke && COLUMNS.serif && (!fine2(nets) || nets.cover < COLUMNS.whole)) { const alt = columnNets(q.px, more, w, h, own, res, toMm, false, COLUMNS.serif, cutAt || (fine2(nets) ? 0 : COLUMNS.apex)); const count = (n) => n.reduce((t, x) => t + x.edges.length, 0);
          // (and only when it found serifs, more strokes than before: a thin arc gained no stroke, only a longer one
          // that "covered more" sewn askew, and a cat's eye came out a smear)
          // (a letter's may as well, by COLUMNS.gain: an Impact L's foot, shorter than its stem is wide, was left bare)
          if (fine2(alt) && (count(alt) > count(nets) || letter) && (!fine2(nets) || alt.cover >= nets.cover + COLUMNS.gain)) nets = alt; }
        // (and with strokes grown out to ink its centre lines don't reach, when that covers COLUMNS.gain more)
        if (letter && COLUMNS.reach && (!fine2(nets) || nets.cover < COLUMNS.whole)) { const alt = columnNets(q.px, more, w, h, own, res, toMm, false, COLUMNS.serif, cutAt, 0, true); if (fine2(alt) && (!fine2(nets) || alt.cover >= nets.cover + COLUMNS.gain)) nets = alt; }
        // (a letter is tried once more with its joints a short bridge apart made one, COLUMNS.knot strokes, and taken when
        // that leaves fewer joints and covers as much: where a fat X's strokes cross, thinning leaves two joints and a
        // bridge, and the X sewed as two bent strokes and a knot. Always so, an R's and an N's joints were bent)
        if (letter && COLUMNS.knot && fine2(nets)) {
          const joints = (n) => { const d = new Map(); for (const x of n) for (const e of x.edges) for (const k of [e.a, e.b]) d.set(k, (d.get(k) || 0) + 1); return [...d.values()].filter((v) => v >= 3).length; };
          const alt = columnNets(q.px, more, w, h, own, res, toMm, false, COLUMNS.serif, cutAt, COLUMNS.knot);
          if (fine2(alt) && joints(alt) < joints(nets) && alt.cover >= nets.cover) nets = alt;
        }
        if (!fine2(nets)) continue;
        cols.push({ px: q.px, c, whole, nets, meant: dot(c) || (mark(c) && size[c] < 2 * dotPx) });
        for (const i of q.px) { colPx[i] = 1; cl[i] = 0; mask.data[i] = 0; thin.data[i] = 0; }
      }
    }
    // (small lettering no column took is sewn along its centre lines, never as a fill)
    if (lettered.px) for (let i = 0; i < w * h; i++) if (cl[i] && lettered.px[i] === col.id + 1 && !dot(cl[i])) { thin.data[i] = 1; anyThin = true; cl[i] = 0; mask.data[i] = 0; }
    // Layers: a hole or bay in this colour's shapes that only colours sewn later fill (a rose's dark shading, the
    // outline strokes across a petal), under SHAPES.layer mm across, is sewn under them, as a person digitizes
    // the shape behind whole and lays the front on top (research I3, "Illustrator's Depth" / amodal completion: the
    // hidden part completed). Cut round, each such hole split the rows round it into parts, stranded behind finished
    // rows or trimmed to, and opened gaps at every join. Never a hole with fabric or an earlier colour in it (a letter's
    // counter stays open).
    if (later.size && SHAPES.layer) {
      // (what a closing of the colour's shapes, SHAPES.layer mm across, covers: holes and bays narrower than that.
      // Enclosed holes alone were too few to matter: a rose's shading reaches its edge)
      const R = (SHAPES.layer / 2) * res, off = { w, h, data: new Uint8Array(w * h) };
      for (let i = 0; i < w * h; i++) off.data[i] = cl[i] ? 0 : 1;
      const to = distanceTo(off, R + 1), dil = { w, h, data: new Uint8Array(w * h) };
      for (let i = 0; i < w * h; i++) dil.data[i] = cl[i] || to[i] <= R ? 1 : 0;
      const shut = distanceTransform(dil), ok = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) if (!cl[i] && !colPx[i] && shut[i] > R && (later.has(labels[i]) || labels[i] === col.id)) ok[i] = 1;
      let front = [];
      for (let i = 0; i < w * h; i++) if (cl[i]) front.push(i);
      while (front.length) {
        const next = [];
        for (const i of front) {
          const x = i % w;
          for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < w * h && !cl[j] && ok[j]) { cl[j] = cl[i]; mask.data[j] = 1; next.push(j); }
        }
        front = next;
      }
    }
    if (later.size) {
      const src = new Int32Array(w * h).fill(-1), R = OVERLAP * res;
      let front = [];
      for (let i = 0; i < w * h; i++) if (cl[i]) { src[i] = i; front.push(i); }
      const near = (j) => { const x = j % w; return [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w].filter((q) => q >= 0 && q < w * h); };
      while (front.length) {
        const next = [];
        for (const i of front) for (const j of near(i)) {
          if (cl[j] || !later.has(labels[j])) continue;
          const s0 = src[i], dx = (j % w) - (s0 % w), dy = Math.floor(j / w) - Math.floor(s0 / w);
          if (dx * dx + dy * dy > R * R || near(j).some((q) => cl[q] && cl[q] !== cl[i])) continue;
          cl[j] = cl[i]; src[j] = s0; mask.data[j] = 1; next.push(j);
        }
        front = next;
      }
    }
    // neighbouring colours alternate the row direction so their joins don't open into one seam
    // (the fabric's colour inside the design, `inside`, takes no turn of its own: the other colours' rows run as they
    // did without it. With it counted, a logo's navy turned 90 degrees and its apostrophe sewed under 8 mm: left out)
    const turnOf = used.slice(0, k).filter((c) => !c.inside).length, angle = o.fillAngle + ((col.inside ? turnOf + 1 : turnOf) % 2) * 90;
    const dt = distanceTransform(mask);
    const comps = [];
    for (let id = 1; id <= count; id++) comps.push({ id, pixels: [], labels: cl, dt, ...(o.direction === "auto" ? { form: angle } : {}) });
    for (let i = 0; i < w * h; i++) if (cl[i]) comps[cl[i] - 1].pixels.push(i);
    let blocks = [];
    const filled = new Uint8Array(count + 1);   // shapes sewn as fills
    // In a blend (shade.js) a thread's stretches are combs reaching into the other thread's side, and the way between
    // them lay over its own finished rows: a trim each (an icon's sky 11 -> 17 trims). Its travel may also run where a
    // later thread alone sews every row, SHADE.hide mm inside that (its rows cover it), as a fill's travel runs under
    // a later colour's fill between shapes.
    let under2 = null;
    if (sh.found && later.size) {
      const m = { w, h, data: new Uint8Array(w * h).fill(1) };
      for (let i = 0; i < w * h; i++) { const s = sh.sole(i); if (s >= 0 && later.has(s) && solid[i]) m.data[i] = 0; }
      const to = distanceTransform({ w, h, data: m.data.map((v) => 1 - v) });
      under2 = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) if (!m.data[i] && to[i] > SHADE.hide * res) under2[i] = 1;
    }
    const cellOf = (comp) => (x, y) => { const i = y * w + x; return comp.labels[i] !== comp.id ? (under2 && under2[i] ? 2 : 0) : comp.dt[i] <= PICTURES.edge * res ? 2 : 1; };
    for (const comp of comps) {
      const mine = comp.pixels.filter((i) => sh.of(i, col.id));
      if (!mine.length) continue;
      let maxDt = 0, sx = 0, sy = 0;
      for (const i of mine) { maxDt = Math.max(maxDt, own[i]); sx += i % w; sy += Math.floor(i / w); }
      const widthMm = (2 * maxDt) / res, centre = [sx / mine.length, sy / mine.length];
      // anything with width is a solid fill that matches its outline exactly
      // pull compensation widens a fill past its edge; on thin letters that closes the gaps between them
      const shaded = sh.rows(col.id, comp, mask, { spacing: o.density, stitch: 3.5, pull: widthMm < 2 ? 0.05 : PICTURES.pull });
      const under = shaded ? shaded.under : tatami(mask, comp, res, { angle: angle + 90, spacing: UNDERLAY.rows, stitch: 3, inset: 0.4, pull: 0 });
      const fill = shaded ? shaded.fill : tatami(mask, comp, res, { angle, spacing: o.density, stitch: 3.5, pull: widthMm < 2 ? 0.05 : PICTURES.pull });
      // (the underlay's points are marked as they turn into mm: core/design.js `UNDER`, the paid build's preview)
      const lay = new Set(under.flat()), mmOf = (p) => p.map((q) => { const m = [(q[0] - cx) / res, (q[1] - cy) / res]; if (lay.has(q)) UNDER.add(m); return m; });
      blocks.push({ centre, paths: routeFill([under, fill], comp, mask, res, budget, WORN, false, 0, shaded && under2 ? cellOf(comp) : null, PICTURES.edge, shaded && under2 ? 90 : 30).map(mmOf), kind: "fill", comp: comp.id, thread: fillThread(mine.length), meant: dot(comp.id) || (mark(comp.id) && size[comp.id] < 2 * dotPx) });
      filled[comp.id] = 1;
    }
    if (anyThin) {
      // thickened a pixel (like a line drawing) so a line broken by a pixel joins up, then walked like lettering:
      // each line out as a triple run (it shows like a thin outline) and back, so a connected line has no jumps.
      // A line out and back is four passes: it shows about as well as a thin outline drawn in the picture.
      const thick = { w, h, data: thin.data.slice() };
      // (not small lettering: a pixel thicker, letters a pixel or two apart joined)
      for (let i = 0; i < w * h; i++) if (thin.data[i] && !(lettered.px && lettered.px[i])) { const x = i % w; if (x < w - 1) thick.data[i + 1] = 1; if (i + w < w * h) thick.data[i + w] = 1; }
      // (small lettering apart: its short strokes are letters' parts, not thinning noise. A t's crossbar and an f's
      // are a stroke's width long each side of the stem once thinned, and were cut as spurs: "University of" sewed
      // as "Universily ol" (2026-11). Its dead ends are kept from half a stroke, and carried on to the ink's edge)
      const inRow = lettered.px ? { w, h, data: thick.data.map((v, i) => (v && lettered.px[i] ? 1 : 0)) } : null;
      const other = inRow ? { w, h, data: thick.data.map((v, i) => (v && !lettered.px[i] ? 1 : 0)) } : thick;
      // Where the page sent the picture twice as fine (`o.fine`, flat pictures: picprep.js `finer`), the letters' centre
      // lines are read from that copy: at 8 px a mm a 3 mm letter is 24 px tall and its strokes 2-3 px, so an M's
      // notch, a crossbar and the gap between two letters are a pixel or none. A fine pixel is a letter's when it
      // lies in a row of this colour and this colour is the nearest of the picture's to it (see-through: none).
      const F = o.fine && o.fine.width === 2 * w && o.fine.height === 2 * h ? o.fine : null;
      let textLines = [];
      if (inRow && F) {
        const rgb = colors.map((c) => hexToRgb(c.picture || c.hex)), mine = colors.indexOf(colors.find((c) => c.id === col.id)), hi = { w: 2 * w, h: 2 * h, data: new Uint8Array(4 * w * h) };
        for (let Y = 0; Y < 2 * h; Y++) for (let X = 0; X < 2 * w; X++) {
          if (lettered.px[(Y >> 1) * w + (X >> 1)] !== col.id + 1) continue;
          const k = (Y * 2 * w + X) * 4, d = F.data; if (d[k + 3] <= 127) continue;
          let best = -1, bd = Infinity;
          for (let c = 0; c < rgb.length; c++) { const e = (d[k] - rgb[c][0]) ** 2 + (d[k + 1] - rgb[c][1]) ** 2 + (d[k + 2] - rgb[c][2]) ** 2; if (e < bd) { bd = e; best = c; } }
          if (best === mine) hi.data[Y * 2 * w + X] = 1;
        }
        textLines = skeletonEdges(hi, 4, { spur: 0.5, reach: true, dots: true }).map(([a, b, p]) => [`t${a}`, `t${b}`, p.map(([x, y]) => [(x + 0.5) / 2 - 0.5, (y + 0.5) / 2 - 0.5])]);
      } else if (inRow) textLines = skeletonEdges(inRow, 2, { spur: 0.5, reach: true, dots: true }).map(([a, b, p]) => [`t${a}`, `t${b}`, p]);
      const lines = [...skeletonEdges(other, 2, { spur: 1 }), ...textLines];
      const walks = order(lines).map((seq) => {
        const mm = seq.map(([p, kind]) => [toMm(p), kind]);
        return { mm, len: mm.reduce((a, [p, kind]) => a + (kind === "run" ? arclen(p).at(-1) : 0), 0) };
      // (a piece under 1.5 mm of line is a dot: sewn four times over with two locks and a trim, beside a bigger piece
      // too; 17-43 per picture were kept for being within LINK of one. Unless it is one dash of a line broken into
      // dashes, none of them 1.5 mm, that is GROUP mm long in all: below)
      }).filter((t) => t.len >= 0.4 || (t.len >= 0.15 && inText(t.mm[0][0][0])));
      // A piece counts with the pieces of this line colour within LINK of it (the letters of a word, the dashes of a
      // broken stem): a group under GROUP mm of line in all is a speck (each one a trim and two locks), dropped.
      const LINK = 2, GROUP = 6;
      const key = (x, y) => `${Math.floor(x / LINK)},${Math.floor(y / LINK)}`, cells = new Map();
      const root = walks.map((_, i) => i), find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
      walks.forEach((t, i) => { for (const [p] of t.mm) for (const [x, y] of p) { const c = key(x, y); if (!cells.has(c)) cells.set(c, new Set()); cells.get(c).add(i); } });
      walks.forEach((t, i) => {
        for (const [p] of t.mm) for (const [x, y] of p) {
          const gx = Math.floor(x / LINK), gy = Math.floor(y / LINK);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const j of cells.get(`${gx + dx},${gy + dy}`) || []) {
            if (find(j) === find(i)) continue;
            if (walks[j].mm.some(([q]) => q.some(([u, v]) => Math.hypot(u - x, v - y) <= LINK))) root[find(j)] = find(i);
          }
        }
      });
      // (a group of nothing but short dashes is a line the labelling broke: a 0.3 mm red rule at 60 mm came out as 32
      // dashes under 1 mm and was dropped whole, its colour with it. Its dashes are kept and sewn one after the
      // other; in a group with a longer piece the short ones stay dots, dropped)
      const total = new Map(), long = new Map();
      walks.forEach((t, i) => { total.set(find(i), (total.get(find(i)) || 0) + t.len); if (t.len >= 1.5) long.set(find(i), (long.get(find(i)) || 0) + t.len); });
      // (and only when the dashes run on as a line: the group's extent half its length or more. A photo's thread texture
      // is short dashes in clumps: etsy_8 sewed them, +40 trims on the batch's four settings)
      const ext = new Map();
      walks.forEach((t, i) => { const r = find(i), e = ext.get(r) || [Infinity, Infinity, -Infinity, -Infinity]; for (const [p] of t.mm) for (const [x, y] of p) { e[0] = Math.min(e[0], x); e[1] = Math.min(e[1], y); e[2] = Math.max(e[2], x); e[3] = Math.max(e[3], y); } ext.set(r, e); });
      const lineLike = (r) => { const e = ext.get(r); return Math.hypot(e[2] - e[0], e[3] - e[1]) >= 0.5 * total.get(r); };
      const sewn = (r) => long.get(r) || (lineLike(r) ? total.get(r) : 0);
      for (const t of walks) t.text = inText(t.mm[0][0][0]);
      for (let i = walks.length - 1; i >= 0; i--) if (walks[i].len < 1.5 && !walks[i].text && (long.get(find(i)) || !lineLike(find(i)))) walks[i].drop = true;
      walks.forEach((t, i) => {
        if (t.drop || (!t.text && sewn(find(i)) < GROUP)) return;
        fine.hairlines++;
        // (small lettering: each stroke out and back as a centre run, then out again as a narrow satin, TEXT.narrow of
        // the letters' height wide, 0.6-0.9 mm, whatever the stroke's own width. One line of thread, three times
        // over, was too thin to read as lettering (owner, 2026-11); a satin as wide as each stroke was drawn closed
        // the counters of 4 mm letters and ran R into P)
        const row = t.text ? rowAt(t.mm[0][0][0]) : null, wide = row ? textWide(row.mm) : 0;
        const paths = t.mm.map(([p, kind]) => {
          const q = followRun(p, 1.5, 0.1, 0.6);
          if (wide && kind === "run" && q.length > 1 && arclen(q).at(-1) >= 0.8) return [...q, ...q.slice(0, -1).reverse(), ...satin(q, wide, 0.4, 0, false, true), q.at(-1)];
          return kind === "run" && q.length > 1 ? [...q, ...q.slice(0, -1).reverse(), ...q.slice(1)] : q;
        });
        blocks.push({ centre: paths[0][0], paths, kind: "run", thread: 3 * t.len, ...(t.text ? { text: true, meant: true } : {}) });
      });
    }
    // the columns, each net a block entered at whichever of its nodes is nearest the needle (`make`)
    if (cols.length) {
      const sat = letterRecipe(o.fabric || "cotton", "auto", false);
      for (const cp of cols) {
        for (const net of cp.nets) {
          const nodes = [];
          for (const e of net.edges) { if (!nodes.some((v) => v[0] === e.a)) nodes.push([e.a, e.p[0]]); if (!nodes.some((v) => v[0] === e.b)) nodes.push([e.b, e.p[e.p.length - 1]]); }
          const make = (k) => netStitches(net, nodes[k][0], sat), p0 = make(0);
          if (p0.length < 2) continue;
          blocks.push({ centre: p0[0], paths: [p0], kind: "column", nodes, make, px: cp.px, meant: cp.meant, ...(cp.text ? { text: true } : {}), parent: cp.whole ? 0 : cp.c, thread: arclen(p0).at(-1) });
          fine.columns++;
        }
      }
    }
    if (!blocks.length) continue;
    // Moves between sections and shapes travel where stitches still to come will cover the run: this colour's fills
    // not sewn yet (kept 0.25 mm off their edges) or a later colour's solid fill. Each jump was a trim, two locks and,
    // up to 5 mm (the PE900 never trims those), a loose thread: etsy_8 had 293 trims and 101 loose threads.
    const toPx = ([x, y]) => [x * res + cx, y * res + cy], ink = (i) => mask.data[i] || thin.data[i] || colPx[i] || later.has(labels[i]);
    const hop = (a, b) => {   // the step between a point and its first cell: on this colour or one still to come
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (0.2 * res));
      for (let i = 1; i <= n; i++) if (!ink(Math.round(a[1] + ((b[1] - a[1]) * i) / n) * w + Math.round(a[0] + ((b[0] - a[0]) * i) / n))) return false;
      return true;
    };
    // ... or along this colour's own thin lines (within 2 px), which are sewn in this thread anyway
    const near2 = new Uint8Array(w * h);
    if (anyThin) for (let i = 0; i < w * h; i++) if (thin.data[i]) { const x = i % w, y = (i - x) / w; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) near2[Y * w + X] = 1; } }
    // ... or within a column of this colour, and from it under a later colour as far as a fill reaches under one: a
    // column doesn't grow under its neighbours as a fill does, and the way from it to them was cut (a stem's walk and
    // the flower over it in two pieces: a trim)
    const colWay = new Uint8Array(w * h);
    if (cols.length) {
      const off = { w, h, data: new Uint8Array(w * h) };
      for (let i = 0; i < w * h; i++) off.data[i] = colPx[i] ? 0 : 1;
      const to = distanceTo(off, OVERLAP * res + 1);
      for (let i = 0; i < w * h; i++) if (colPx[i] || (to[i] <= OVERLAP * res + 0.5 && later.has(labels[i]))) colWay[i] = 1;
    }
    const router = () => makeRouter(mask, res, (x, y) => {
      const i = y * w + x;
      return solid[i] && later.has(labels[i]) ? 2 : filled[cl[i]] && dt[i] > 0.25 * res ? 1 : near2[i] || colWay[i] ? 1 : 0;
    }, hop, budget);
    let R = router();
    // Shapes in nearest-first order, preferring the nearest one a hidden way reaches (keeps travel and trims down),
    // then one far enough for the machine to trim the jump
    const ordered = [];
    blocks = blocks.map((b) => ({ ...b, paths: b.paths.filter((p) => p.length) })).filter((b) => b.paths.length);
    // The Details choice (Wilcom, Hatch and BERNINA have a "Details" slider; Stitch Era's guide deletes 30-50 % of the
    // traced shapes): what is left of a picture's trims is its own count of separate pieces (18 sprigs in 8 threads is
    // over 100 starts, each a trim, two locks and two thread ends). A piece is the parts of this colour the needle
    // reaches without a cut: one's end within 2 mm of the next one's start, or in its travel region and within TRAVEL. It is left out when
    // it would sew under level.start mm of thread and under level.share of the colour's biggest piece (four flower
    // centres in one thread are each its biggest). Never a dot that was kept as meant (an eye, an i's dot, a mark by a
    // bigger piece).
    // Worse, as a third choice ("Main shapes only"): by thread alone (under 80 mm, the smallest 30 %) a sheet's stems,
    // a bow and half a caption's letters went while specks stayed; flecks to 12 mm² folded a dog's eye into its face;
    // and judged by reach and by what a thing joins (small, 3 mm from its colour, touching no other) it left out
    // nothing this level doesn't: 1,132 trims against 1,119 on the 12 samples.
    if (level.start && blocks.length > 1) {
      const root = blocks.map((_, i) => i), find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
      // (a fill begins and ends where its rows do; a line's walk comes back to where it began, so it may begin anywhere)
      const pt = (q) => ({ q, r: R.regionOf(toPx(q)) }), along = (b) => b.paths.flat().filter((_, i, a) => i % (b.nodes ? 2 : 6) === 0 || i === a.length - 1).map(pt);
      // (a column's walk passes along all of it and may begin at any of its nodes: counted along it, as a line's.
      // By its nodes alone, a word's apostrophe beside a letter sewn as a column was no longer counted with it, and went)
      const from = blocks.map((b) => (b.kind === "run" || b.nodes ? along(b) : [pt(b.paths[b.paths.length - 1].at(-1))]));
      const to = blocks.map((b, i) => (b.kind === "run" || b.nodes ? from[i] : [pt(b.paths[0][0])]));
      const goes = (i, j) => from[i].some((a) => to[j].some((b) => { const v = Math.hypot(a.q[0] - b.q[0], a.q[1] - b.q[1]); return v <= 2 || (v <= TRAVEL && a.r && a.r === b.r); }));
      for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) if (find(i) !== find(j) && (goes(i, j) || goes(j, i))) root[find(i)] = find(j);
      const sum = new Map();
      blocks.forEach((b, i) => sum.set(find(i), (sum.get(find(i)) || 0) + b.thread));
      const most = Math.max(...sum.values()), go = (b, i) => !b.meant && sum.get(find(i)) < level.start && sum.get(find(i)) < level.share * most;
      const out = new Set(blocks.filter(go).filter((b) => b.kind === "fill").map((b) => b.comp)), n0 = blocks.length;
      for (const b of blocks.filter(go)) if (b.px) for (const i of b.px) colPx[i] = 0;
      blocks = blocks.filter((b, i) => !go(b, i));
      fine.left += n0 - blocks.length;
      if (out.size) {
        // (not there for travel or a short straight stitch either)
        for (const c of out) filled[c] = 0;
        for (let i = 0; i < w * h; i++) if (out.has(cl[i])) mask.data[i] = 0;
        R = router();
      }
    }
    let at = d.cur ? toPx(d.cur) : [0, 0];
    // A line's walk ends where it began, so it can start anywhere along it: it's entered at its point nearest the
    // needle (a step of 2 mm or less is sewn, not jumped)
    // (steps under 0.4 mm, where the walk turns back on a short stroke, are merged: rounded to the file's 0.1 mm a 0.3 mm
    // step can come out under 0.3, and tiny stitches nest and break thread)
    for (const b of blocks) if (b.kind === "run") {
      const t = [];
      for (const q of b.paths.flat()) if (!t.length || Math.hypot(q[0] - t.at(-1)[0], q[1] - t.at(-1)[1]) >= 0.4) t.push(q);
      if (Math.hypot(t[0][0] - t.at(-1)[0], t[0][1] - t.at(-1)[1]) < 0.4) t[t.length - 1] = t[0]; else t.push(t[0]);
      b.tour = t;
    }
    while (blocks.length) {
      const from = R.regionOf(at);
      let bi = 0, bk = 0, bd = Infinity;
      // (a fill's strokes, cut off it as columns, are sewn before it: the needle reaches them under the fill still to
      // come and comes back into it where each stroke's walk began. After it, the way to them lay on finished rows:
      // a trim each)
      const kids = new Set(blocks.map((b) => b.parent).filter((c) => c));
      blocks.forEach((b, i) => {
        if (b.kind === "fill" && kids.has(b.comp)) return;
        (b.tour || (b.nodes && b.nodes.map((v) => v[1])) || [b.paths[0][0]]).forEach((qm, k) => {
          const q = toPx(qm), v = Math.hypot(q[0] - at[0], q[1] - at[1]) / res;
          // (a jump of 2-5 mm is left as a loose thread by the machine: one over 5 mm, trimmed, is better)
          const score = v <= 2 || (v <= TRAVEL && from && R.regionOf(q) === from) ? v : v > 5 ? v + 1000 : v + 2000;
          if (score < bd) { bd = score; bi = i; bk = k; }
        });
      });
      const b = blocks.splice(bi, 1)[0];
      if (b.tour) { const t = b.tour; b.paths = [bk ? [...t.slice(bk), ...t.slice(1, bk + 1)] : t]; }
      if (b.make && bk) b.paths = [b.make(bk)];
      const last = b.paths[b.paths.length - 1];
      ordered.push(b); at = toPx(last[last.length - 1]);
    }
    // a short move to the next piece is sewn straight unless it would cross fabric this colour doesn't cover
    const covered = ([x, y]) => { const i = Math.round(y * res + cy) * w + Math.round(x * res + cx); return mask.data[i] === 1 || colPx[i] === 1; };
    // (fill rows end a little past the shape's edge, so the last 0.3 mm at each end isn't checked)
    const crosses = (a, b) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 0.2);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        if (t * L < 0.3 || (1 - t) * L < 0.3) continue;
        if (!covered([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return true;
      }
      return false;
    };
    d.color(col.hex, col.thread.name);
    // Within 2 mm a move is sewn straight when it doesn't cross open fabric, and otherwise too if there's no hidden
    // way: a jump that short is never trimmed by the machine (a loose thread plus two locks).
    // A fill's locks lie under its own rows. Its path starts and ends at a shape's tips, where the first and last rows
    // are a stitch long: a tie-in or tie-off there had nothing over it but that stitch (87 of the 173 exposed locks in
    // the 12 sample pictures). After a jump the needle comes down 1-2 mm into the path (`lockAt`), locks there under
    // rows still to come and stitches out to the start; before a trim it stitches 1-2 mm back onto its last rows and
    // locks there.
    // (the point 1.4 mm away along the path, on a stitch if no needle point lies there)
    const inside = (from, pts) => {
      const far = (q) => Math.hypot(q[0] - from[0], q[1] - from[1]);
      let prev = from;
      for (const q of pts) {
        if (far(q) >= 1.4) {
          let lo = 0, hi = 1, at = q;
          for (let n = 0; n < 12; n++) { const t = (lo + hi) / 2; at = [prev[0] + (q[0] - prev[0]) * t, prev[1] + (q[1] - prev[1]) * t]; if (far(at) < 1.4) lo = t; else hi = t; }
          if (far(at) >= 1.1 && far(at) <= 1.9 && !crosses(from, at)) return at;
          break;
        }
        prev = q;
      }
      return pts.find((q) => far(q) >= 1.1 && far(q) <= 1.9 && !crosses(from, q)) || null;
    };
    const pathLen = (q) => { let L = 0; for (let i = 1; i < q.length; i++) L += Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]); return L; };
    // (neither when it would bring a jump the machine trims, over 5 mm, down to one it leaves as a loose thread, or a
    // jump down to a step it could have sewn, 2 mm)
    const gapTo = (a, c) => (a ? Math.hypot(c[0] - a[0], c[1] - a[1]) : Infinity);
    const nearer = (was, now) => (was > 5 && now <= 5) || (was > 2 && now <= 2);
    let tail = null;   // the fill path the needle is at the end of
    const tuck = (to = null) => {
      const q = tail && d.cur && inside(d.cur, tail.slice(-16, -1).reverse());
      if (q && !(to && nearer(gapTo(d.cur, to), gapTo(q, to)))) d.path([d.cur, q]);
      tail = null;
    };
    const jumpTo = (b, p) => {
      let q = clearStart(noTiny(p)), at = b.kind === "fill" || b.kind === "column" ? inside(q[0], q.slice(1, 16)) : null;
      if (at && nearer(gapTo(d.cur, q[0]), gapTo(d.cur, at))) at = null;
      tuck(at || q[0]);
      if (at && nearer(gapTo(d.cur, q[0]), gapTo(d.cur, at))) at = null;
      d.path(at ? noTiny(q, at) : q, true, true, at);
      return q;
    };
    let out = null;   // a piece left out when the needle came to it
    const gone = [];   // ... and all of them: a kept mark is kept for the piece it sits by
    const by = (p) => gone.some((g) => g.paths.some((q) => q.some((v) => Math.hypot(v[0] - p[0], v[1] - p[1]) <= 2.5)));
    // (what the needle sews from a piece on without a cut: it and the pieces after it each within 2 mm of the last. A
    // piece a jump reaches is left out as too small only when all of that is: the dash the needle jumped to that
    // starts a word's letters was left out, and a 0 lost its left side, when columns changed where the needle came from)
    const chain = ordered.map((b) => b.paths.reduce((a, v) => a + pathLen(v), 0));
    for (let i = ordered.length - 2; i >= 0; i--) {
      const e = ordered[i].paths.at(-1).at(-1), n = ordered[i + 1].paths[0][0];
      if (Math.hypot(n[0] - e[0], n[1] - e[1]) <= 2) chain[i] += chain[i + 1];
    }
    const sews = new Map(ordered.map((b, i) => [b, chain[i]]));
    for (const b of ordered) for (const [pi, p] of b.paths.entries()) {
      let q;
      if (b === out) continue;
      if (!d.cur) q = jumpTo(b, p);
      else {
        const gap = Math.hypot(p[0][0] - d.cur[0], p[0][1] - d.cur[1]);
        if (gap <= 2 && !crosses(d.cur, p[0])) d.path((q = noTiny(p, d.cur)));
        // (between small letters: a jump, never a stitch or a travel run across the fabric. The router's half-mm
        // cells take a word's letters, a few tenths apart, for one region, and its way ran straight through the o's)
        else if (gap > 0.6 && (b.text || inText(d.cur))) { q = jumpTo(b, p); fine.letters = (fine.letters || 0) + 1; }
        else {
          const r = gap <= TRAVEL ? R.route(toPx(d.cur), toPx(p[0]), SEWN, 1.5 * gap + 3) : null;
          if (r && r.sewnMm <= SEWN && r.mm <= 1.5 * gap + 3) d.path([d.cur, ...(q = noTiny([...toMm(R.stitches(r)), ...p], d.cur))]);
          // (a part of a shape that travel can't reach and that sews less thread than its own locks: left out)
          else if (gap > 2 && b.kind === "fill" && pi && pathLen(p) < PICTURES.start) continue;
          // (nor a piece that only a jump reaches and that sews under level.lone mm in all: a dash 2 mm from its
          // line's other dashes but not from where the needle is. Each was a run of nothing but its own locks: 8 of them
          // were 75 of the 90 lock hits with nothing over them in the 12 sample pictures)
          // (a dot kept for the piece beside it goes with that piece: left, it was a start of its own for a knot)
          else if (gap > 2 && level.lone && !pi && (!b.meant || by(p[0])) && sews.get(b) < level.lone) { out = b; gone.push(b); fine.left++; continue; }
          else if (gap > 2) q = jumpTo(b, p);
          else d.path((q = noTiny(p, d.cur)), true, false);
        }
      }
      // (not after a column: the stitch back onto it lay across the satin, a bar on top)
      tail = b.kind === "fill" ? q : null;
      if (b.kind === "fill" || b.kind === "column") R.markSewn(p.map(toPx));
    }
    tuck();
    summary.push({ ...col, shapes: ordered.length, kinds: [...new Set(ordered.map((b) => b.kind))] });
  }
  if (!d.stitches.length) throw nothing(used, o);
  // (eased, a satin's short stitches at a tight tip can come to 0.3 mm: dropped, as the Design tab's are)
  d.finish({ untiny: true });
  // (the labels as sewn: the paper inside a line drawing is fabric, faint lines are their colour)
  return { design: d, summary, fine, labels: paper.labels !== analysis.labels ? paper.labels : undefined };
}

// why a picture with colours to sew came out empty (code: what the page can offer to change)
function nothing(used, o) {
  return !used.length && (o.skip || []).length ? Object.assign(new Error("Every thread is left out, so there's nothing to stitch."), { code: "skipped" })
    : Object.assign(new Error("Nothing in this picture is big enough to stitch at this size."), { code: "small" });
}

// Fabric-coloured specks and slivers inside a drawing (the blend between a white fill and its black outline, read as
// background; a textured fill's lighter flecks) would each be outlined: they take the colour round them. Fabric that
// reaches the picture's edge, or is 0.5 mm² and over 0.6 mm across somewhere (a letter's counter), stays.
function closeSlivers(labels, w, h, mine, res) {
  const n = w * h, m = { w, h, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) m.data[i] = mine.has(labels[i]) ? 0 : 1;
  const dt = distanceTransform(m), { labels: cl, count } = label(m);
  const edge = new Uint8Array(count + 1), area = new Int32Array(count + 1), wide = new Float32Array(count + 1);
  for (let i = 0; i < n; i++) {
    const c = cl[i]; if (!c) continue;
    const x = i % w, y = (i - x) / w;
    area[c]++; if (dt[i] > wide[c]) wide[c] = dt[i];
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge[c] = 1;
  }
  const out = labels.slice(), open = new Uint8Array(n);
  let front = [];
  const near = (i) => { const x = i % w; return [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i + w < n ? i + w : -1]; };
  // Slivers: fabric under 0.6 mm across, as a closing finds it (a sliver can run on to open fabric), lying between two
  // different colours. Between parts of one colour (the gaps between letters) it stays.
  const r = 0.3 * res, dil = { w, h, data: new Uint8Array(n) }, thin = { w, h, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) dil.data[i] = !m.data[i] || dt[i] <= r ? 1 : 0;
  const shut = distanceTransform(dil);
  for (let i = 0; i < n; i++) thin.data[i] = cl[i] && (shut[i] > r || (!edge[cl[i]] && wide[cl[i]] <= r)) ? 1 : 0;
  const { labels: sl, count: sc } = label(thin), sides = Array.from({ length: sc + 1 }, () => new Set());
  for (let i = 0; i < n; i++) if (sl[i]) for (const j of near(i)) if (j >= 0 && !m.data[j]) sides[sl[i]].add(labels[j]);
  for (let i = 0; i < n; i++) if (cl[i] && ((!edge[cl[i]] && area[cl[i]] < 0.5 * res * res) || (sl[i] && sides[sl[i]].size >= 2))) open[i] = 1;
  for (let i = 0; i < n; i++) if (open[i] && near(i).some((j) => j >= 0 && !open[j] && mine.has(out[j]))) front.push(i);
  while (front.length) {
    const next = [];
    for (const i of front) {
      if (!open[i]) continue;
      const j = near(i).find((q) => q >= 0 && !open[q] && mine.has(out[q]));
      if (j === undefined) continue;
      out[i] = out[j]; open[i] = 0;
      for (const q of near(i)) if (q >= 0 && open[q]) next.push(q);
    }
    front = next;
  }
  return out;
}

// Thinning stops a line's loose end about half its width short of the ink's end: each loose end of the skeleton edges
// `es` (px) goes on straight while there's ink in `mask`, up to `far` px (a crayon sun's rays came out a third short, a
// 2.3 mm apostrophe as a 0.9 mm speck, dropped)
function lineEnds(es, mask, far) {
  const { w, h } = mask, deg = new Map(), ink = (x, y) => { const X = Math.round(x), Y = Math.round(y); return X >= 0 && Y >= 0 && X < w && Y < h && mask.data[Y * w + X]; };
  for (const [a, b] of es) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
  const on = (p) => {   // p runs toward the loose end
    const e = p[p.length - 1], q = p[Math.max(0, p.length - 1 - Math.max(3, Math.round(far / 2)))], L = Math.hypot(e[0] - q[0], e[1] - q[1]);
    if (L < 1) return p;
    const u = [(e[0] - q[0]) / L, (e[1] - q[1]) / L];
    let t = 0;
    while (t < far && ink(e[0] + u[0] * (t + 0.5), e[1] + u[1] * (t + 0.5))) t += 0.5;
    t -= 0.5;
    return t >= 1 ? [...p, [e[0] + u[0] * t, e[1] + u[1] * t]] : p;
  };
  for (const ed of es) {
    if (ed[0] === ed[1]) continue;
    if (deg.get(ed[1]) === 1) ed[2] = on(ed[2]);
    if (deg.get(ed[0]) === 1) ed[2] = on(ed[2].slice().reverse()).reverse();
  }
  return es;
}

// A line drawing's own colours: the picture's colours told apart finer than its threads, so two near colours that the
// thread count merged still meet at a line (sky and teal mountains are 14.6 ΔE00 apart, an owl's black outline and its
// dark wing 10.3: neither was drawn at 4 threads). Seeds: each thread's picture colour and the fabric's; then, farthest
// first, a colour of the picture `apart` ΔE00 or more from every seed that `area` mm² of it lies within `near` of (flat
// pixels first, so the blends along edges don't take the places; then any pixel, so a pale line a pixel or two wide
// counts: a doodle sheet's pale pink column was sewn as nothing). Each pixel takes its nearest seed (Lab), then two 3x3
// majority passes (as `labelWith`). A seed's thread is its own; an added one's is the thread most of its pixels were
// labelled with, or the nearest by colour where that was the fabric. Within `fabric` of the fabric, a colour is fabric
// (a sticker's die-cut white on a white page was drawn round as a ring).
const FINE = { apart: 10, near: 5, area: 0.5, most: 12, tries: 60, fabric: 8, flat: 0.7 };
function fineColours(img, analysis, used, res, skip) {
  const { w, h, labels, colors } = analysis, n = w * h, { lab } = pixels(img), fab = colors.find((c) => c.background);
  const px = (i) => [lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]], labC = (c) => srgbToLab(...hexToRgb(c.picture || c.hex));
  const seeds = [], thread = [];
  if (fab) { seeds.push(labC(fab)); thread.push(null); }
  for (const c of used) { seeds.push(labC(c)); thread.push(c); }
  const base = seeds.length, step = Math.max(1, Math.floor(Math.sqrt(n / 40000))), S = [], flat = [];
  const dE = (i, j) => Math.hypot(lab[i * 3] - lab[j * 3], lab[i * 3 + 1] - lab[j * 3 + 1], lab[i * 3 + 2] - lab[j * 3 + 2]), close = (i, j) => dE(i, j) < 4;
  // (a blend: between the colours 2 px either side of it, along some axis, where those differ; the anti-aliased edge
  // between two colours. A pale line's middle is paler than both sides, not between them)
  const blend = (i) => [1, w, w + 1, w - 1].some((s) => { const a = i - 2 * s, b = i + 2 * s; return a >= 0 && b < n && dE(a, b) > 10 && dE(a, i) + dE(i, b) <= 1.15 * dE(a, b); });
  const plain = [], inkAt = (i) => i >= 0 && i < n && labels[i] >= 0 && !(fab && labels[i] === fab.id);
  let inside = 0, flatIn = 0;
  for (let y = 2; y < h - 2; y += step) for (let x = 2; x < w - 2; x += step) {
    const i = y * w + x;
    if (labels[i] < 0 || skip.has(labels[i])) continue;
    const k = [i - 1, i + 1, i - w, i + w].filter((j) => dE(i, j) < 6).length;
    S.push(i); flat.push(close(i, i - 1) && close(i, i + 1) && close(i, i - w) && close(i, i + w)); plain.push(k >= 2 && !blend(i));
    if (inkAt(i) && inkAt(i - 3) && inkAt(i + 3) && inkAt(i - 3 * w) && inkAt(i + 3 * w)) { inside++; if (flat.at(-1)) flatIn++; }
  }
  // (a textured picture, under FINE.flat of its ink flat 3 px inside (a photo's grain, paper noise, crayon), keeps the
  // colours it was labelled with: its grain learned finer drew 147 squiggles over a noisy page, and crayon's flecks
  // tangled the strokes)
  const textured = inside > 50 && flatIn < FINE.flat * inside;
  const d = S.map((i) => Math.min(...seeds.map((s) => deltaE2000(px(i), s)))), out = new Uint8Array(S.length);
  const need = (FINE.area * res * res) / (step * step);
  let tries = 0;
  for (const flatOnly of textured ? [] : [true, false]) {
    while (seeds.length - base < FINE.most && tries++ < FINE.tries) {
      let b = -1;
      for (let k = 0; k < S.length; k++) if (!out[k] && (flatOnly ? flat[k] : plain[k]) && d[k] >= FINE.apart && (b < 0 || d[k] > d[b])) b = k;
      if (b < 0) break;
      const c = px(S[b]), near = [];
      for (let k = 0; k < S.length; k++) if (d[k] >= FINE.near && deltaE2000(px(S[k]), c) < FINE.near) near.push(k);
      out[b] = 1;
      for (const k of near) out[k] = 1;
      if (near.length < need) continue;
      const m = [0, 0, 0];
      for (const k of near) { const q = px(S[k]); m[0] += q[0] / near.length; m[1] += q[1] / near.length; m[2] += q[2] / near.length; }
      seeds.push(m); thread.push(undefined);
      for (let k = 0; k < S.length; k++) d[k] = Math.min(d[k], deltaE2000(px(S[k]), m));
    }
  }
  const K = seeds.length;
  let L = new Int16Array(n).fill(-1);
  const seedOf = new Map(used.map((c, k) => [c.id, k + (fab ? 1 : 0)]));
  for (let i = 0; i < n; i++) {
    if (labels[i] < 0) continue;
    if (textured) { L[i] = seedOf.has(labels[i]) ? seedOf.get(labels[i]) : fab ? 0 : -1; continue; }
    let best = 0, bd = Infinity;
    for (let k = 0; k < K; k++) { const s = seeds[k], v = (lab[i * 3] - s[0]) ** 2 + (lab[i * 3 + 1] - s[1]) ** 2 + (lab[i * 3 + 2] - s[2]) ** 2; if (v < bd) { bd = v; best = k; } }
    L[i] = best;
  }
  for (let pass = 0; pass < (textured ? 0 : 2); pass++) {
    const o = L.slice(), cnt = new Int16Array(K + 1);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      cnt.fill(0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cnt[L[(y + dy) * w + x + dx] + 1]++;
      let best = 0; for (let j = 1; j <= K; j++) if (cnt[j] > cnt[best]) best = j;
      if (cnt[best] >= 5) o[y * w + x] = best - 1;
    }
    L = o;
  }
  // (how far a colour is from the blends of a thread with the fabric, Lab: a pale pink line is magenta thinned, not the
  // nearest thread, a lavender; a grey shadow under navy letters was given the orange thread)
  const page = fab ? seeds[0] : [100, 0, 0], mixOff = (t, c) => { let b = Infinity; for (let f = 0; f <= 1.0001; f += 0.05) b = Math.min(b, Math.hypot(t[0] + (page[0] - t[0]) * f - c[0], t[1] + (page[1] - t[1]) * f - c[1], t[2] + (page[2] - t[2]) * f - c[2])); return b; };
  // each added colour's thread: what most of its pixels were labelled (a thread, else the thread it is a blend of);
  // a skipped thread's pixels stay out
  const votes = Array.from({ length: K }, () => new Map()), byId = new Map(colors.map((c) => [c.id, c]));
  for (let i = 0; i < n; i++) if (L[i] >= base) { const v = votes[L[i]]; v.set(labels[i], (v.get(labels[i]) || 0) + 1); }
  for (let k = base; k < K; k++) {
    const [top] = [...votes[k].entries()].sort((p, q) => q[1] - p[1]), c = top && byId.get(top[0]);
    if (c && skip.has(c.id)) thread[k] = null;
    else if (c && !c.background && used.includes(c)) thread[k] = c;
    else thread[k] = used.reduce((a, u) => (mixOff(labC(u), seeds[k]) < mixOff(labC(a), seeds[k]) ? u : a));
  }
  // (with no fabric colour, the picture seen through: white is the fabric's, the page it's judged on; a see-through
  // sticker's white die-cut border was drawn round in the light green thread)
  const fl = fab ? seeds[0] : [100, 0, 0];
  for (let k = fab ? 1 : 0; k < K; k++) if (deltaE2000(seeds[k], fl) < FINE.fabric) thread[k] = null;
  for (let i = 0; i < n; i++) if (L[i] >= 0 && thread[L[i]] === null && (L[i] > 0 || !fab)) L[i] = fab ? 0 : -1;
  const area = new Int32Array(K);
  for (let i = 0; i < n; i++) if (L[i] >= 0) area[L[i]]++;
  return { textured, labels: L, lab, colors: seeds.map((s, k) => ({ id: k, lab: s, lightness: s[0], background: !!fab && k === 0, thread: thread[k], area: thread[k] === null && (k || !fab) ? 0 : area[k] })) };
}

// How each traced line is sewn, from its width in the picture (mm): a hairline a run, out and back along it; a line
// about 1 mm a triple run (out, back and out again, then back); 1.5 mm and wider a satin column as wide as the line
// (out as a centre run under it, back as the satin), up to 6 mm; a dot a satin across it. One run for every line
// sewed bold marker strokes, crayon lines and bold lettering as hairlines (C5 review: "a different font").
const WEIGHT = { triple: 0.9, satin: 1.5, most: 6, dot: 5 };

// Line drawing (redwork): every shape's outline and every line's or even stroke's centre, each in its own colour's
// thread and at its own weight (`WEIGHT`; `opts.line`: all in that one thread). The lines are walked like lettering
// (each one out and back), so a connected drawing sews without a trim.
function lineArt(img, analysis, opts) {
  const o = { ...DEFAULTS, ...opts }, { w, h } = analysis, res = o.res, n = w * h;
  const threads = analysis.colors.filter((c) => !c.background && c.area > 0 && !(o.skip || []).includes(c.id));
  if (!threads.length) throw nothing(threads, o);
  const F = fineColours(img, analysis, threads, res, new Set(o.skip || [])), colors = F.colors;
  const used = colors.filter((c) => !c.background && c.area > 0);
  if (!used.length) throw nothing(threads, o);
  const ink = used.reduce((a, c) => (c.lightness < a.lightness ? c : a)), mine = new Set(used.map((c) => c.id));
  const labels = closeSlivers(F.labels, w, h, mine, res);
  const cx = w / 2, cy = h / 2, toMm = (p) => p.map(([x, y]) => [(x - cx) / res, (y - cy) / res]);
  // Only a change of colour draws a line: two shades of one (a textured lawn in two greens) don't, and a thin piece that
  // is a shade of the colour round it, or the blend between two colours (a yellow bird's edge against its black
  // outline), takes the neighbouring colour instead of being drawn as a line beside the outline. Alike: under ALIKE
  // ΔE00, and under SHADE for a thin piece whose edge is soft (under 0.7 of the difference across 4 px; 15 for all kept
  // sky and teal mountains, 14.6 apart, from meeting at a line, and an owl's outline from its wing, 10.3)
  const ALIKE = 8, SHADE = 15, fabric = colors.find((c) => c.background), labOf = new Map(colors.map((c) => [c.id, c.lab]));
  // (the fabric's colour, white when the picture is seen through: a see-through sticker's outline blends were left as
  // dashes round it)
  const colOf = (l) => (mine.has(l) ? labOf.get(l) : fabric ? labOf.get(fabric.id) : [100, 0, 0]);
  const alike = (a, b) => !!a && !!b && deltaE2000(a, b) < ALIKE;
  const toFabric = fabric ? fabric.id : -1, moves = [];
  // JPEG noise: a thin piece (nowhere 1.5 mm across) under 5 mm long of a strong colour (30 or more from the fabric,
  // ΔE00) whose own pixels are faint, under 30 % as far from the fabric as its colour is, is the ringing a JPEG leaves
  // beside a hard edge, not a line: it's fabric. A flower's JPEG drew a 3 mm streak over its lettering. (A real line a
  // pixel or two wide is anti-aliased, but keeps most of its colour. A pale colour's lines are faint all along, as
  // faint as noise: at 40 % of etsy_1's lavender, 16 from the paper, its stems came out in pieces.)
  if (fabric) {
    const fl = labOf.get(fabric.id), { data } = img;
    for (const col of used) {
      const mask = { w, h, data: new Uint8Array(n) };
      for (let i = 0; i < n; i++) mask.data[i] = labels[i] === col.id ? 1 : 0;
      const dt = distanceTransform(mask), { labels: cl, count } = label(mask), wide = new Uint8Array(count + 1);
      const x0 = new Int32Array(count + 1).fill(w), x1 = new Int32Array(count + 1).fill(-1), y0 = new Int32Array(count + 1).fill(h), y1 = new Int32Array(count + 1).fill(-1);
      for (let i = 0; i < n; i++) {
        const c = cl[i]; if (!c) continue;
        if (dt[i] > 0.75 * res) wide[c] = 1;
        const x = i % w, y = (i - x) / w;
        if (x < x0[c]) x0[c] = x; if (x > x1[c]) x1[c] = x; if (y < y0[c]) y0[c] = y; if (y > y1[c]) y1[c] = y;
      }
      const short = (c) => !wide[c] && Math.max(x1[c] - x0[c], y1[c] - y0[c]) + 1 < 5 * res, full = deltaE2000(labOf.get(col.id), fl);
      if (full < 30) continue;
      const sum = new Float64Array(count + 1), k = new Int32Array(count + 1);
      for (let i = 0; i < n; i++) {
        const c = cl[i]; if (!c || !short(c)) continue;
        sum[c] += deltaE2000(srgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]), fl); k[c]++;
      }
      for (let i = 0; i < n; i++) { const c = cl[i]; if (c && k[c] && sum[c] / k[c] < 0.3 * full) labels[i] = toFabric; }
    }
  }
  // Where the picture has no step (STEP: across 2 mm its colour changes by under half the two colours' difference)
  // there is no line: a gradient learned as two colours drew a straight line across a sunset's sky. And a pale piece
  // (under 35 ΔE00 from the fabric) lying against another colour whose edge on the fabric is soft nearly all round (2 px out
  // still not the fabric's colour, within 6, on four fifths of it) is a shadow or a glow, fabric: a soft shadow under "Holly" was traced in orange satin.
  const lab = F.lab, fl = fabric ? labOf.get(fabric.id) : [100, 0, 0], STEP = 0.5, reach = Math.max(2, Math.round(res));
  // (a tabby's blurred stripes take 1-2 mm to change; a sunset's sky 30 mm)
  const step = (i, j, p, q, f = STEP, r = reach) => {
    const A = i - r * (j - i), B = j + r * (j - i);
    if (A < 0 || B < 0 || A >= n || B >= n || Math.abs((A % w) - (i % w)) > r + 1 || Math.abs((B % w) - (j % w)) > r + 1) return true;
    return Math.hypot(lab[A * 3] - lab[B * 3], lab[A * 3 + 1] - lab[B * 3 + 1], lab[A * 3 + 2] - lab[B * 3 + 2]) >= f * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  };
  // (palest first: a blurred shadow learned as two greys is dropped from its outside in)
  const edgeOn = (i, j) => { const k = j + 2 * (j - i); return k < 0 || k >= n || Math.abs((k % w) - (j % w)) > 3 || Math.hypot(lab[k * 3] - fl[0], lab[k * 3 + 1] - fl[1], lab[k * 3 + 2] - fl[2]) <= 6; };
  for (const col of used.slice().sort((a, b) => deltaE2000(a.lab, fl) - deltaE2000(b.lab, fl))) {
    if (deltaE2000(col.lab, fl) >= 35) continue;
    const mask = { w, h, data: new Uint8Array(n) };
    for (let i = 0; i < n; i++) mask.data[i] = labels[i] === col.id ? 1 : 0;
    const { labels: cl, count } = label(mask), tot = new Int32Array(count + 1), crisp = new Int32Array(count + 1), by = new Int32Array(count + 1);
    for (let i = 0; i < n; i++) {
      const c = cl[i]; if (!c) continue;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= n || cl[j] === c) continue;
        if (mine.has(labels[j])) by[c]++;
        else { tot[c]++; if (edgeOn(i, j)) crisp[c]++; }
      }
    }
    // (and all of the colour when it is so taken as a whole: the shadow's bits left along the letters, crisp where they
    // ran under them, were drawn round in its thread)
    let T = 0, C = 0, B = 0;
    for (let c = 1; c <= count; c++) { T += tot[c]; C += crisp[c]; B += by[c]; }
    const all = T >= 2 * res && C <= 0.2 * T && B >= 0.1 * (T + B);
    for (let i = 0; i < n; i++) { const c = cl[i]; if (c && (all || (tot[c] >= 2 * res && crisp[c] <= 0.2 * tot[c] && by[c] >= 0.1 * (tot[c] + by[c])))) labels[i] = toFabric; }
  }
  // (again from what that left, up to three times: an anti-aliased edge in several shades moved each into the next,
  // and the shade next to the fabric was left as a dashed line beside an owl's outline)
  for (let round = 0; round < 3; round++) {
  const before = labels.slice();
  moves.length = 0;
  for (const col of used) {
    const mask = { w, h, data: new Uint8Array(n) };
    for (let i = 0; i < n; i++) mask.data[i] = before[i] === col.id ? 1 : 0;
    const dt = distanceTransform(mask), { labels: cl, count } = label(mask), wide = new Uint8Array(count + 1), size = new Int32Array(count + 1);
    for (let i = 0; i < n; i++) if (cl[i]) { size[cl[i]]++; if (dt[i] > 0.75 * res) wide[cl[i]] = 1; }
    const nb = new Map(), sharp = [], edge = [];
    for (let i = 0; i < n; i++) {
      const c = cl[i]; if (!c || wide[c]) continue;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= n || cl[j] === c) continue;
        const l = mine.has(before[j]) ? before[j] : toFabric, m = nb.get(c) || new Map();
        m.set(l, (m.get(l) || 0) + 1); nb.set(c, m);
        if (l !== toFabric) { sharp[c] = (sharp[c] || 0) + (step(i, j, labOf.get(col.id), labOf.get(l), 0.7, 1) ? 1 : 0); edge[c] = (edge[c] || 0) + 1; }
      }
    }
    const me = labOf.get(col.id), to = new Map();
    for (const [c, m] of nb) {
      const [[A] = [], [B] = []] = [...m.entries()].sort((p, q) => q[1] - p[1]), a = colOf(A), b = colOf(B);
      // (into the fabric only a speck: a pale line on white is still a line)
      // (and a shade under SHADE apart whose edge on its colours is soft: a dog's fur streaks drew 50 squiggles)
      if ((alike(me, a) || (A !== toFabric && deltaE2000(me, a) < SHADE && (sharp[c] || 0) < 0.5 * (edge[c] || 1))) && (A !== toFabric || size[c] < 0.5 * res * res)) to.set(c, A);
      // (a blend with the fabric is the edge of the colour it blends into: thin dark lettering anti-aliased to grey
      // stays lettering)
      else {
        // (between any two of the colours round it that hold a sixth of its edge, the two furthest apart: a black outline
        // anti-aliased to white through two greys of the drawing left each grey as a ring round a robot)
        const all = [...m.entries()], tot = all.reduce((t, e) => t + e[1], 0), round = all.filter((e) => e[1] >= tot / 6).map((e) => e[0]);
        let best = null, bd = 0;
        for (let x = 0; x < round.length; x++) for (let y = x + 1; y < round.length; y++) {
          const P = round[x], Q = round[y], p = colOf(P), q = colOf(Q);
          if (!p || !q) continue;
          const v = deltaE2000(p, q);
          if (v > bd && deltaE2000(p, me) + deltaE2000(me, q) <= 1.25 * v) { bd = v; best = [P, Q, p, q]; }
        }
        if (best) { const [P, Q, p, q] = best; to.set(c, P === toFabric ? Q : Q === toFabric ? P : deltaE2000(p, me) <= deltaE2000(me, q) ? P : Q); }
      }
    }
    if (to.size) moves.push([cl, to]);
  }
  // (all at once, from the colours as they were: one piece's move can't pass another on to the fabric)
  for (const [cl, to] of moves) for (let i = 0; i < n; i++) if (to.has(cl[i])) labels[i] = to.get(cl[i]);
  if (!moves.length) break;
  }
  // Each pixel's thread (`thr`: the thread colour's id, the line drawn through it), its line's width when it is a thin
  // piece (`wpx`, px) and its depth in its colour when it is a band or a stroke (`dep`, px): what each traced line is
  // sewn in and how (`WEIGHT`)
  const thr = new Int16Array(n).fill(-1), wpx = new Float32Array(n), dep = new Float32Array(n), pw = new Float32Array(n), tOf = (l) => colors[l].thread.id;
  // Outlines drawn in the picture (a dark band under BAND mm wide) are lines already: sewn once along their centre.
  // Tracing both their edges drew two parallel lines round Snoopy. Parts of a dark colour's shapes no disc BAND/2 mm
  // across reaches into are such bands (a filled ear stays a shape, the outline running from it a line); a small dark
  // shape on its own (an eye, a nose) is outlined.
  const BAND = 4, dark = (c) => c.lightness <= Math.max(35, ink.lightness + 15);
  // A whole piece that is one stroke of an even width (a crayon or marker line, a logo's letters) is sewn once along
  // its centre whatever its colour, up to STROKE of the drawing's longer side (3-6 mm). Deciding by parts drew the
  // corners of a 3 mm crayon line, where a BAND disc just fits, as little outlines and cut the line there (a house's
  // lumps and broken door), and 4 mm letters as half outlines, half centre lines (KENJI'S at 120 mm).
  const STROKE = 0.04, wMax = Math.min(6, Math.max(BAND, (STROKE * Math.max(w, h)) / res)) * res;
  const lines = { w, h, data: new Uint8Array(n) }, bands = { w, h, data: new Uint8Array(n) }, wideAt = new Uint8Array(n);
  const strokes = { w, h, data: new Uint8Array(n) }, widths = [], sw = [], dots = [];
  // (the fabric round the drawing, from the picture's edge: a robot's white grille lines, fabric closed in, made the dark
  // strips between them "on the fabric", sewn as satin bars)
  const outer = new Uint8Array(n), st = [];
  const reach0 = (i) => { if (!outer[i] && !mine.has(labels[i])) { outer[i] = 1; st.push(i); } };
  for (let x = 0; x < w; x++) { reach0(x); reach0((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { reach0(y * w); reach0(y * w + w - 1); }
  while (st.length) { const i = st.pop(), x = i % w; if (x > 0) reach0(i - 1); if (x < w - 1) reach0(i + 1); if (i >= w) reach0(i - w); if (i + w < n) reach0(i + w); }
  for (const col of used) {
    const mask = { w, h, data: new Uint8Array(n) };
    for (let i = 0; i < n; i++) mask.data[i] = labels[i] === col.id ? 1 : 0;
    const dt = distanceTransform(mask), { labels: cl, count } = label(mask), wide = new Uint8Array(count + 1), deep = new Float32Array(count + 1);
    for (let i = 0; i < n; i++) if (cl[i]) { if (dt[i] > 0.75 * res) wide[cl[i]] = 1; if (dt[i] > deep[cl[i]]) deep[cl[i]] = dt[i]; }   // over 1.5 mm across somewhere
    // each wide piece's depths along its middle (the ridge of its distance to the edge), deepest point, area and what
    // its edge touches (fabric, or another colour of the drawing)
    const ridge = Array.from({ length: count + 1 }, () => []), top = new Float32Array(count + 1), area = new Int32Array(count + 1);
    const open = new Int32Array(count + 1), shut = new Int32Array(count + 1), crisp = new Int32Array(count + 1);
    for (let i = 0; i < n; i++) {
      const c = cl[i]; if (!c || !wide[c]) continue;
      area[c]++; if (dt[i] > top[c]) top[c] = dt[i];
      const x = i % w;
      let peak = dt[i] >= 1.5;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j >= 0 && j < n && labels[j] !== col.id && step(i, j, col.lab, colOf(labels[j]) || fl, 0.5, 2)) crisp[c]++;
        if (j < 0 || j >= n || !mine.has(labels[j])) open[c]++;
        else if (labels[j] !== col.id) shut[c]++;
        if (j >= 0 && j < n && dt[j] > dt[i]) peak = false;
      }
      if (peak) ridge[c].push(dt[i]);
    }
    const stroke = new Uint8Array(count + 1), across = new Float32Array(count + 1), long = new Uint8Array(count + 1);
    for (let c = 1; c <= count; c++) {
      const d = ridge[c].sort((a, b) => a - b);
      if (!wide[c] || d.length < 3) continue;
      const W = 2 * d[d.length >> 1];
      // (even: along most of its middle (a fifth to four fifths) within 0.6 of itself, a leaf tapers; its deepest
      // point, at a corner or a join, under twice its half-width, a filled ear on an outline isn't; long: three widths
      // at least, a dot or a square is under 2; on the fabric: a coloured shape inside a drawing's outlines stays one)
      // (a marker line twelve widths long is a stroke up to 6 mm, however small the drawing: a 4.5 mm one in a 100 mm
      // drawing was traced round both edges; and one that runs into another colour, a stem into its flower, a third of
      // its edge)
      across[c] = W; long[c] = area[c] >= 3 * W * W ? 1 : 0;
      // (and drawn: crisp along half its edge at least; a 50 px heart's blurred rim was sewn as a satin ring round it)
      if ((W <= wMax || (W <= 6 * res && area[c] >= 12 * W * W)) && d[Math.floor(d.length * 0.2)] >= 0.6 * d[Math.floor(d.length * 0.8)] && top[c] <= W && open[c] >= (long[c] && area[c] >= 12 * W * W ? 2 : 4) * shut[c] && 2 * crisp[c] >= open[c] + shut[c])
        stroke[c] = long[c] ? 1 : 2;
    }
    // A stroke's centre line keeps its limbs: where a quarter of it is limbs shorter than the stroke is wide but over
    // half that (not a corner's spur), which the centre line's pruning takes off, the piece is outlined instead. Fat
    // letters' limbs are that short: a bold N 3 mm wide sewed as a hook, an i went altogether.
    // (sewn as a satin column, a limb is as wide as the stroke whatever its length: only a stroke too narrow for
    // satin (WEIGHT.satin) is outlined for it)
    const fat = new Uint8Array(count + 1);
    {
      const m = { w, h, data: new Uint8Array(n) };
      for (let i = 0; i < n; i++) m.data[i] = cl[i] && stroke[cl[i]] ? 1 : 0;
      const es = skeletonEdges(m, 1, { spur: 0 }), deg = new Map(), all = new Float64Array(count + 1), lost = new Float64Array(count + 1);
      for (const [a, b] of es) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
      for (const [a, b, q] of es) {
        const [x, y] = q[q.length >> 1].map(Math.round), c = cl[y * w + x] || cl[Math.round(q[0][1]) * w + Math.round(q[0][0])];
        if (!c) continue;
        all[c] += q.length;
        if (a !== b && ((deg.get(a) === 1 && deg.get(b) >= 3) || (deg.get(b) === 1 && deg.get(a) >= 3)) && q.length >= 0.5 * across[c] && q.length < across[c]) lost[c] += q.length;
      }
      // (and when an eighth of all this colour's centre lines would go so, its letters are fat: all are outlined, but
      // a marker line; "Night owl" came out with an outlined N among centre-lined letters)
      let A = 0, L = 0;
      for (let c = 1; c <= count; c++) { A += all[c]; L += lost[c]; }
      for (let c = 1; c <= count; c++) if (stroke[c] && across[c] < WEIGHT.satin * res && (lost[c] >= 0.25 * all[c] || (L >= 0.08 * A && area[c] < 12 * across[c] ** 2))) { stroke[c] = 0; fat[c] = 1; }
    }
    // One decision for all of a colour's letters: when a fifth of its long pieces (by area) aren't strokes, none is but a
    // marker line (a slab face came out with its O and i outlined, its N, e and & as centre lines); else so is any long
    // piece about as wide (a K whose arms meet its stem in a wider join)
    let sa = 0, la = 0;
    for (let c = 1; c <= count; c++) if (long[c] && across[c]) { la += area[c]; if (stroke[c] === 1) sa += area[c]; }
    const wsl = [];
    for (let c = 1; c <= count; c++) if (stroke[c] === 1) wsl.push(across[c]);
    wsl.sort((a, b) => a - b);
    for (let c = 1; c <= count; c++) {
      if (!long[c] || !across[c]) continue;
      if (sa < 0.8 * la) { if (stroke[c] && area[c] < 12 * across[c] ** 2) stroke[c] = 0; }
      else if (!stroke[c] && !fat[c] && across[c] <= Math.min(6 * res, 1.3 * wsl[wsl.length >> 1]) && open[c] >= 4 * shut[c]) stroke[c] = 1;
    }
    // (a short piece as wide as this colour's strokes, an apostrophe among the letters, is one too; on its own, an
    // outline)
    const ws = [];
    for (let c = 1; c <= count; c++) if (stroke[c] === 1) ws.push(across[c]);
    ws.sort((a, b) => a - b);
    for (let c = 1; c <= count; c++) if (stroke[c] === 2) stroke[c] = ws.length && across[c] <= 1.3 * ws[ws.length >> 1] && area[c] >= 1.6 * across[c] ** 2 ? 1 : 0;
    // Parts of a wide piece no disc BAND mm across reaches into are bands, sewn once along their centre: in a dark
    // colour's piece that is mostly such bands (a drawing's outline with a filled ear on it; in a bold letter the thin
    // parts, a serif or the e's bar, came out as centre lines with the rest outlined), and in any colour a band 4 times
    // as long as it's wide and 5 mm or more on the fabric (a stem growing out of its leaves was outlined, two lines 2 mm
    // apart)
    const r = (BAND / 2) * res, core = { w, h, data: new Uint8Array(n) }, small = 2 * BAND * res;
    const x0 = new Int32Array(count + 1).fill(w), x1 = new Int32Array(count + 1), y0 = new Int32Array(count + 1).fill(h), y1 = new Int32Array(count + 1);
    const pc = new Int32Array(count + 1), sx = new Float64Array(count + 1), sy = new Float64Array(count + 1);
    for (let i = 0; i < n; i++) {
      const c = cl[i]; if (!c) continue;
      const x = i % w, y = (i - x) / w;
      if (x < x0[c]) x0[c] = x; if (x > x1[c]) x1[c] = x; if (y < y0[c]) y0[c] = y; if (y > y1[c]) y1[c] = y;
      pc[c]++; sx[c] += x; sy[c] += y;
    }
    // A dot is a satin across its middle, along its longer side, as wide as it is there: a thin one (0.8-2.5 mm across,
    // 0.6 mm² or more, too thin to outline: its centre line was a point, and an i's dots and full stops went), and a
    // solid wide one up to WEIGHT.dot mm (a bold i's dot and an eye were drawn as hollow rings, read as "°")
    const dotC = (c) => !stroke[c] && pc[c] >= 0.6 * res * res && Math.min(x1[c] - x0[c], y1[c] - y0[c]) + 1 >= 0.8 * res
      && (!wide[c] ? Math.max(x1[c] - x0[c], y1[c] - y0[c]) + 1 < 2.5 * res : Math.max(x1[c] - x0[c], y1[c] - y0[c]) + 1 <= WEIGHT.dot * res && pc[c] >= 0.6 * (x1[c] - x0[c] + 1) * (y1[c] - y0[c] + 1));
    for (let c = 1; c <= count; c++) if (dotC(c)) {
      // (the long axis from the piece's second moments; its chord across at each point, for the satin's width)
      let xx = 0, yy = 0, xy = 0;
      const mx = sx[c] / pc[c], my = sy[c] / pc[c];
      for (let y = y0[c]; y <= y1[c]; y++) for (let x = x0[c]; x <= x1[c]; x++) if (cl[y * w + x] === c) { xx += (x - mx) ** 2; yy += (y - my) ** 2; xy += (x - mx) * (y - my); }
      const th = 0.5 * Math.atan2(2 * xy, xx - yy), u = [Math.cos(th), Math.sin(th)], v = [-u[1], u[0]];
      let t0 = Infinity, t1 = -Infinity;
      for (let y = y0[c]; y <= y1[c]; y++) for (let x = x0[c]; x <= x1[c]; x++) if (cl[y * w + x] === c) { const t = (x - mx) * u[0] + (y - my) * u[1]; t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
      const inC = (x, y) => { const X = Math.round(x), Y = Math.round(y); return X >= 0 && Y >= 0 && X < w && Y < h && cl[Y * w + X] === c; };
      const chord = (t) => { const p = [mx + u[0] * t, my + u[1] * t]; let a = 0, b = 0; while (a < 4 * res && inC(p[0] + v[0] * (a + 0.5), p[1] + v[1] * (a + 0.5))) a += 0.5; while (b < 4 * res && inC(p[0] - v[0] * (b + 0.5), p[1] - v[1] * (b + 0.5))) b += 0.5; return [a, b]; };
      t0 += 0.35 * res; t1 -= 0.35 * res;
      if (!(t1 > t0)) { t0 = -0.35 * res; t1 = 0.35 * res; }
      const k = 8, path = [], W = [];
      for (let s = 0; s <= k; s++) { const t = t0 + ((t1 - t0) * s) / k, [a, b] = chord(t); path.push([mx + u[0] * t + (v[0] * (a - b)) / 2, my + u[1] * t + (v[1] * (a - b)) / 2]); W.push((a + b + 1) / res); }
      dots.push({ e: [`d${col.id}_${c}a`, `d${col.id}_${c}b`, path], W, t: tOf(col.id) });
    }
    for (let i = 0; i < n; i++) core.data[i] = cl[i] && dt[i] > r ? 0 : 1;
    const toCore = distanceTransform(core), thin = (i) => cl[i] && wide[cl[i]] && !stroke[cl[i]] && toCore[i] > r + 0.5, part = new Int32Array(count + 1);
    const tm = { w, h, data: new Uint8Array(n) };
    for (let i = 0; i < n; i++) if (thin(i)) { part[cl[i]]++; tm.data[i] = 1; }
    const { labels: tl, count: tc } = label(tm), tA = new Int32Array(tc + 1), tW = new Float32Array(tc + 1), tO = new Int32Array(tc + 1), tS = new Int32Array(tc + 1);
    for (let i = 0; i < n; i++) {
      const t = tl[i]; if (!t) continue;
      tA[t]++; if (dt[i] > tW[t]) tW[t] = dt[i];
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= n || cl[j] === cl[i]) continue;
        if (mine.has(labels[j])) tS[t]++; else if (outer[j]) tO[t]++;
      }
    }
    // (each band's width: twice the median depth along its middle, so a band is sewn at one weight all along: an owl's
    // 1.5 mm outline came out part satin, part triple run where it narrowed)
    const tR = Array.from({ length: tc + 1 }, () => []);
    for (let i = 0; i < n; i++) { const t = tl[i]; if (!t) continue; const x = i % w; if ([x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w].every((j) => j < 0 || j >= n || dt[j] <= dt[i])) tR[t].push(dt[i]); }
    const tM = tR.map((r) => (r.length ? r.sort((a, b) => a - b)[r.length >> 1] : 0));
    // (a dark colour's such band wherever it lies: a palm's trunk between the sky and the sea was outlined, two lines)
    const longPart = (t) => { const wd = 2 * tW[t]; return wd > 0 && tA[t] >= 4 * wd * wd && tA[t] / wd >= 5 * res && (dark(col) || tO[t] >= 0.5 * tS[t]); };
    const band = (i) => thin(i) && ((dark(col) && part[cl[i]] >= 0.5 * area[cl[i]] && (x1[cl[i]] - x0[cl[i]] > small || y1[cl[i]] - y0[cl[i]] > small)) || longPart(tl[i]));
    const T = tOf(col.id);
    for (let i = 0; i < n; i++) {
      const c = cl[i];
      if (!c || dotC(c)) continue;
      if (!wide[c]) { lines.data[i] = 1; thr[i] = T; wpx[i] = 2 * deep[c] - 1; }   // a thin line: its centre comes from the skeleton
      else if (stroke[c]) { strokes.data[i] = 1; bands.data[i] = 1; sw.push(across[c]); thr[i] = T; dep[i] = dt[i]; pw[i] = across[c]; }
      else if (band(i)) { bands.data[i] = 1; widths.push(dt[i]); thr[i] = T; dep[i] = dt[i]; pw[i] = 2 * tM[tl[i]] - 1; }
      else wideAt[i] = 1;
    }
  }
  // an outline, drawn on one side only where two colours meet (the lower id), so it isn't doubled, and not along a
  // band (its centre line is the line), nor where the picture has no step; in the thread of the colour that stands out
  // more from the fabric
  const stand = new Map(used.map((c) => [c.id, deltaE2000(c.lab, fl)]));
  // (a shape's outline on the fabric in a thread that hardly stands out from it, under FAINT, is sewn in the nearest
  // colour that does, 10 more, and is within 30 of it: a grey cat on a grey-blue page was traced in grey, barely seen;
  // 30 for all and the most standing out sewed a watercolour's green leaves in purple)
  const FAINT = 25, faint = new Map(used.map((c) => {
    const to = used.filter((u) => stand.get(u.id) >= FAINT + 10 && deltaE2000(u.lab, c.lab) < 30).sort((p, q) => deltaE2000(p.lab, c.lab) - deltaE2000(q.lab, c.lab))[0];
    return [c.id, stand.get(c.id) < FAINT && to ? tOf(to.id) : tOf(c.id)];
  }));
  // (two shades of one thread SHADE apart, or ALIKE where the picture steps from one to the other within a pixel: a dog's
  // fur in two browns drew 40 small rings, and a dinosaur's crisp darker spots are kept)
  const apart = (i, j, l, m) => { const v = deltaE2000(labOf.get(l), labOf.get(m)); return v >= SHADE || (v >= ALIKE && (tOf(l) !== tOf(m) || step(i, j, labOf.get(l), labOf.get(m), 0.8, 1))); };
  for (let i = 0; i < n; i++) {
    if (!wideAt[i]) continue;
    const x = i % w, l = labels[i];
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= n || !mine.has(labels[j])) { lines.data[i] = 1; thr[i] = faint.get(l); break; }
      const m = labels[j];
      if (m !== l && m > l && !bands.data[j] && !lines.data[j] && apart(i, j, l, m) && step(i, j, labOf.get(l), labOf.get(m))) { lines.data[i] = 1; thr[i] = tOf(stand.get(m) > stand.get(l) ? m : l); break; }
    }
  }
  // the widths that set each skeleton's pruning (as one stroke: corners of a wide stroke grow short spurs)
  widths.sort((a, b) => a - b); sw.sort((a, b) => a - b);
  const bandW = widths.length && Math.max(3, Math.min(BAND * res, 2 * widths[Math.floor(widths.length * 0.9)])), strokeW = sw.length && Math.max(3, sw[Math.floor(sw.length * 0.9)]);
  const sat = letterRecipe(o.fabric || "cotton", "auto", false);
  // a path's width in px at each point: the widest of `of` in the pixel's 3x3
  const widthsOf = (p, of) => p.map(([x, y]) => {
    let v = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = Math.round(x) + dx, Y = Math.round(y) + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) v = Math.max(v, of(Y * w + X)); }
    return v;
  });
  const median = (a) => { const s = a.slice().sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };
  // Every line's centre (the skeletons of the outlines and thin lines, the bands and the strokes), each sewn by its
  // width and in the thread most of it was drawn in: decided per pixel, an ear's outline came out in two threads by turns,
  // a trim at every change
  const all = [], allHow = [], allT = [], darkest = threads.reduce((a, c) => (c.lightness < a.lightness ? c : a));
  const threadOf = (p) => {
    const v = new Map();
    for (const [x, y] of p) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = Math.round(x) + dx, Y = Math.round(y) + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && thr[Y * w + X] >= 0) v.set(thr[Y * w + X], (v.get(thr[Y * w + X]) || 0) + 1); }
    return [...v].sort((p, q) => q[1] - p[1])[0]?.[0] ?? -1;
  };
  {
    const thick = { w, h, data: lines.data.slice() }, part = { w, h, data: new Uint8Array(n) };
    for (let i = 0; i < n; i++) if (bands.data[i] && !strokes.data[i]) part.data[i] = 1;
    // thicken the 1 px outlines so the skeleton follows them smoothly
    for (let i = 0; i < n; i++) if (lines.data[i]) { const x = i % w; if (x < w - 1) thick.data[i + 1] = 1; if (i + w < n) thick.data[i + w] = 1; }
    // (pruning dead ends under 2 mm too took the strokes off small lettering)
    for (const e of lineEnds(skeletonEdges(thick, 3, { spur: 1 }), thick, res)) {
      const W = median(widthsOf(e[2], (i) => (lines.data[i] ? wpx[i] : 0))) / res;
      all.push(e); allHow.push({ how: W >= WEIGHT.triple ? "triple" : "run" });
    }
    // (the bands' own skeleton, pruned at their width; strokes' spurs pruned under 0.6 of the width: a whole width took a
    // slab E's lower arm) sewn by their width along them
    const byWidth = (e, stroke = false) => {
      // (its own median width, or its band's where they're within 0.35 mm: a bear's 3 mm brows joined to 1.2 mm eye rims
      // were sewn as hairlines by the band's median)
      const W = widthsOf(e[2], (i) => (bands.data[i] ? 2 * dep[i] - 1 : 0)).map((v) => v / res), own = median(W), all = median(widthsOf(e[2], (i) => (bands.data[i] ? pw[i] : 0))) / res;
      const m = Math.abs(own - all) < 0.35 ? all : own;
      return m >= WEIGHT.satin ? { band: !stroke, how: "satin", W: W.map((v) => Math.min(WEIGHT.most, Math.max(m / 2, v) - COLUMNS.thread)) } : { how: m >= WEIGHT.triple ? "triple" : "run" };
    };
    if (bandW) for (const [a, b, p] of skeletonEdges(part, bandW, { spur: 1 })) { const e = [`b${a}`, `b${b}`, p]; all.push(e); allHow.push(byWidth(e)); }
    if (strokeW) for (const [a, b, p] of lineEnds(skeletonEdges(strokes, strokeW, { spur: 0.6 }), strokes, strokeW)) { const e = [`s${a}`, `s${b}`, p]; all.push(e); allHow.push(byWidth(e, true)); }
    for (const e of all) allT.push(threadOf(e[2]));
  }
  // each thread's lines (all in one when a thread is picked for the line drawing), walked and sewn lightest first, so
  // the dark lines lie on top. A textured picture (`F.textured`: photos, painted or stitched-looking art) is traced in its
  // darkest thread, as before, when its threads walked apart cost over half again the trims and 10 more: its many small
  // shapes took 20 -> 68 trims (etsy_1), 25 -> 160 (etsy_8)
  const TRIMMED = 2;   // (formats.js TRIM)
  const sew = (one) => {
  const groups = new Map();
  for (const c of used) { const T = one ? -2 : c.thread.id; if (!groups.has(T)) groups.set(T, { T, thread: one ? darkest : c.thread, light: c.thread.lightness }); }
  const d = new Design(o.hoop), summary = [];
  for (const g of [...groups.values()].sort((p, q) => q.light - p.light)) {
    const edges = [], how = [];
    // (traced in one thread, a textured picture's dark patches are shading, not drawn bands: no satin but for whole
    // strokes, a busy rose sewed as a fuzzy blob)
    all.forEach((e, k) => { if (one || allT[k] === g.T) { edges.push(e); how.push(one && F.textured && allHow[k].band ? { how: "triple" } : allHow[k]); } });
    const firstDot = edges.length;
    for (const q of dots) if (one || q.t === g.T) { edges.push(q.e); how.push({ how: "satin", W: q.W.map((v) => Math.max(0.5, v - COLUMNS.thread)), dot: true }); }
    if (!edges.length) continue;
    const left = walks(edges, how, firstDot);
    if (!left.length) continue;
    const thread = o.line ? { hex: o.line, thread: nearestBrotherThread(o.line) } : g.thread;
    d.color(thread.hex, thread.thread.name);
    summary.push({ ...(one ? darkest : g.thread), hex: thread.hex, thread: thread.thread, shapes: left.length, kinds: [...new Set(how.map((q) => q.how))] });
    // the next drawing and where it's entered, by what the moves cost in trims: onto it (free within 2 mm, a loose 2-5 mm
    // thread dearer than a trim) and, as a drawing ends where it began, on from there to the nearest drawing still to sew
    // (0.9 of it: entered where it is near the next one, a word's letters 1-2 mm apart weren't each a trim); then the
    // nearest
    const cell = new Map(), ck = (x, y) => `${Math.floor(x / 2)},${Math.floor(y / 2)}`;
    left.forEach((t) => t.forEach((q) => { const c = ck(...q); if (!cell.has(c)) cell.set(c, []); cell.get(c).push([t, q]); }));
    const by = new Map(left.map((t) => [t, t.map((q) => {
      const gx = Math.floor(q[0] / 2), gy = Math.floor(q[1] / 2), out = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const [u, r] of cell.get(`${gx + dx},${gy + dy}`) || []) if (u !== t && !out.includes(u) && Math.hypot(r[0] - q[0], r[1] - q[1]) <= 2) out.push(u);
      return out;
    })])), still = new Set(left);
    const nextFree = (k, t) => (by.get(t)[k].some((u) => still.has(u)) ? 0 : 1);
    while (left.length) {
      let bi = 0, bk = 0, bd = Infinity;
      left.forEach((t, i) => t.forEach((q, k) => {
        if (!d.cur) { if (q[0] < bd) { bd = q[0]; bi = i; bk = k; } return; }
        const v = Math.hypot(q[0] - d.cur[0], q[1] - d.cur[1]), on = v <= 2 ? 0 : v > 5 ? 1 : 1.5;
        if (on + 1e-3 * v >= bd) return;
        const s = on + (left.length > 1 ? 0.9 * nextFree(k, t) : 0) + 1e-3 * v;
        if (s < bd) { bd = s; bi = i; bk = k; }
      }));
      // (a step under 2 mm onto a drawing of another colour is a move, not a stitch across the gap: see oneInk)
      d.path(rotate(left[bi], bk), true, !!d.cur && !oneInk(d.cur, left[bi][bk]));
      still.delete(left[bi]); left.splice(bi, 1);
    }
  }
  return { d, summary, trims: d.stitches.filter((q) => q[2] === TRIMMED).length };
  };
  let { d, summary, trims } = sew(!!o.line);
  if (!o.line && F.textured) { const q = sew(true); if (trims > Math.max(1.5 * q.trims, q.trims + 10)) ({ d, summary } = q); }
  if (!d.stitches.length) throw Object.assign(new Error("No lines in this picture are big enough to stitch."), { code: "small" });
  d.finish();
  // (darkest first: the page names the first as the line drawing's thread)
  summary.sort((p, q) => p.lightness - q.lightness);
  return { design: d, summary, fine: { narrowMm2: 0, hairlines: 0 } };

  // each connected drawing walked out and back: a closed tour (mm) that ends where it starts; pieces under 2 mm long
  // in all, and not joined to another drawing, are specks (each one a trim, two locks and often a loose thread)
  // (stitches that keep to the curve, not 2 mm chords across a small flower's petals; points under 0.4 mm apart, where
  // short skeleton edges meet, are merged: tiny stitches nest and break thread)
  function walks(edges, how, firstDot) {
    // one pass along an edge, sewn by its weight: out (`run`) and back (`satin` in `order`'s words)
    const pass = (p, kind, k) => {
      const q = toMm(p), hw = how[k];
      if (hw.how === "run") return followRun(q, 2.0, 0.1);
      if (hw.how === "triple") { const r = followRun(q, 1.5, 0.1); return kind === "run" ? [...r, ...r.slice(0, -1).reverse(), ...r.slice(1)] : r; }
      if (kind === "run") return hw.dot ? [q[0], q.at(-1)] : followRun(q, 1.5, 0.1);
      const e = edges[k][2], fwd = Math.hypot(p[0][0] - e[0][0], p[0][1] - e[0][1]) < 1e-6, W = hw.W, top = Math.max(...W);
      const at = (t) => { const f = (fwd ? t : 1 - t) * (W.length - 1), i = Math.min(W.length - 2, Math.floor(f)); return W.length < 2 ? W[0] : W[i] + (W[i + 1] - W[i]) * (f - i); };
      return [q[0], ...satin(q, top, sat.gap, COLUMNS.pull + sat.pull, false, true, at), q.at(-1)];
    };
    const tours = order(edges).map((comp) => {
      const t = [];
      t.dot = comp.some(([, , k]) => k >= firstDot);
      for (const q of comp.flatMap(([p, kind, k], j) => pass(p, kind, k).slice(j ? 1 : 0)))
        if (!t.length || Math.hypot(q[0] - t.at(-1)[0], q[1] - t.at(-1)[1]) >= 0.4) t.push(q);
      const s = comp[0][0][0], e = comp.at(-1)[0].at(-1);
      if (Math.hypot(s[0] - e[0], s[1] - e[1]) < 0.01 && t.length > 1) t[t.length - 1] = t[0];   // (still ends where it began)
      return t;
    }).filter((t) => t.length > 1);
    // A line end within 2 mm of another drawing is joined to it: the needle steps across, sews that drawing and steps
    // back over the same stitch, instead of jumping (a gap that short is a loose thread the machine never trims; 3 mm
    // drew visible bars between small letters)
    const key = ([x, y]) => `${Math.floor(x / 3)},${Math.floor(y / 3)}`, cells = new Map(), gone = new Set();
    tours.forEach((t, i) => t.forEach((q, k) => { const c = key(q); if (!cells.has(c)) cells.set(c, []); cells.get(c).push([i, k]); }));
    const deg = new Map();
    for (const [a, b] of edges) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
    const ends = edges.flatMap(([a, b, p]) => [...(deg.get(a) === 1 ? [p[0]] : []), ...(deg.get(b) === 1 ? [p[p.length - 1]] : [])]).map((q) => toMm([q])[0]);
    const near = (q, skip, r) => {   // the nearest tour point within r of q, not in tour `skip`
      const [gx, gy] = key(q).split(",").map(Number);
      let best = null, bd = r;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const [i, k] of cells.get(`${gx + dx},${gy + dy}`) || []) {
        const v = Math.hypot(tours[i][k][0] - q[0], tours[i][k][1] - q[1]);
        if (i !== skip && v <= bd && !gone.has(i)) { bd = v; best = [i, k, v]; }
      }
      return best;
    };
    // (a short piece lying along a longer one, within 0.8 mm of it nearly all its length, is a fleck of an edge's blend
    // beside the line, not a line: a robot's rounded corners each grew a tick)
    const len = tours.map((t) => arclen(t).at(-1));
    tours.forEach((t, i) => {
      if (len[i] >= 6 || t.dot) return;
      const k = t.filter((q) => { const at = near(q, i, 0.8); return at && len[at[0]] > 2 * len[i]; }).length;
      if (k >= 0.8 * t.length) gone.add(i);
    });
    const joins = [];
    for (const e of ends) {
      const at = near(e, -1, 0.05);
      if (!at || gone.has(at[0])) continue;
      const to = near(e, at[0], 2);
      if (to && oneInk(e, tours[to[0]][to[1]])) joins.push({ a: at[0], ka: at[1], b: to[0], kb: to[1], v: to[2] });
    }
    // (and so is a drawing too short to sew on its own, at its point nearest another: an i's dot or a full stop, which
    // as a closed outline has no loose end)
    tours.forEach((t, i) => {
      if (arclen(t).at(-1) >= 4 || gone.has(i)) return;
      let best = null;
      t.forEach((q, k) => { const to = near(q, i, 2); if (to && (!best || to[2] < best.v) && oneInk(q, tours[to[0]][to[1]])) best = { a: i, ka: k, b: to[0], kb: to[1], v: to[2] }; });
      if (best) joins.push(best);
    });
    joins.sort((p, q) => p.v - q.v);
    const root = tours.map((_, i) => i), find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
    const links = tours.map(() => []);
    for (const j of joins) if (find(j.a) !== find(j.b)) { root[find(j.a)] = find(j.b); links[j.a].push([j.ka, j.b, j.kb]); links[j.b].push([j.kb, j.a, j.ka]); }
    // a tour from its point k, with every joined drawing sewn where it's joined (and the step back)
    const nest = (i, k, from) => {
      const t = tours[i], m = t.length - 1, at = new Map();
      for (const [ka, j, kb] of links[i]) if (j !== from) { const r = (ka - k + m) % m; if (!at.has(r)) at.set(r, []); at.get(r).push([j, kb]); }
      const out = [];
      rotate(t, k).forEach((q, r) => { out.push(q); for (const [j, kb] of at.get(r) || []) out.push(...nest(j, kb, i), q); });
      return out;
    };
    // (a short one joined to a drawing costs no trim: KENJI'S apostrophe at 60 mm, 1.6 mm long, was left out)
    const total = new Map();
    tours.forEach((t, i) => total.set(find(i), (total.get(find(i)) || 0) + arclen(t).at(-1)));
    // (the step onto a joined drawing can be a tenth of a mm: points under 0.4 mm after the last are dropped again)
    const spaced = (t) => {
      const s = [t[0]];
      for (let k = 1; k < t.length; k++) if (k === t.length - 1 || Math.hypot(t[k][0] - s.at(-1)[0], t[k][1] - s.at(-1)[1]) >= 0.4) s.push(t[k]);
      return s;
    };
    // (a dot not joined to a drawing is kept when another drawing is within 5 mm: a colon after a space)
    const by = (i) => tours.some((u, j) => j !== i && find(j) !== find(i) && tours[i].some((q) => u.some((v) => Math.hypot(v[0] - q[0], v[1] - q[1]) <= 5)));
    return tours.map((_, i) => i).filter((i) => find(i) === i && !gone.has(i) && (total.get(i) >= 4 || (tours[i].dot && by(i)))).map((i) => spaced(nest(i, 0, -1)));
  }
  // a tour from its point k (it ends where it began)
  function rotate(t, k) { return [...t.slice(k), ...t.slice(1, k + 1)]; }
  // (across the fabric only between parts of one colour in the picture, as a word's letters are: a sun's ray 1.25 mm
  // from a dinosaur's head, yellow beside green, was joined to it by a stitch across the gap. Parts that touch, a stem
  // and its flower, still join: the step lies along the drawing)
  function inks(q) {
    const X = Math.round(q[0] * res + cx), Y = Math.round(q[1] * res + cy), r = Math.ceil(0.8 * res), out = new Set();
    for (let y = Math.max(0, Y - r); y <= Math.min(h - 1, Y + r); y++) for (let x = Math.max(0, X - r); x <= Math.min(w - 1, X + r); x++)
      if (mine.has(labels[y * w + x])) out.add(labels[y * w + x]);
    return out;
  }
  function bare(p, q) {   // over 0.5 mm of open fabric on the way from p to q
    const k = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) * res * 2);
    let run = 0;
    for (let s = 0; s <= k; s++) {
      const X = Math.round((p[0] + ((q[0] - p[0]) * s) / Math.max(1, k)) * res + cx), Y = Math.round((p[1] + ((q[1] - p[1]) * s) / Math.max(1, k)) * res + cy);
      run = X >= 0 && Y >= 0 && X < w && Y < h && !mine.has(labels[Y * w + X]) ? run + 0.5 : 0;
      if (run > 0.5 * res) return true;
    }
    return false;
  }
  function oneInk(p, q) {
    if (!bare(p, q)) return true;
    const a = inks(p), b = inks(q);
    return !a.size || !b.size || [...a].some((l) => [...b].some((m) => l === m || alike(labOf.get(l), labOf.get(m))));
  }
}

// Cross-stitch: the picture on a grid of `cross` mm cells, each the colour most of its pixels have (or left empty when
// most are background). A run of cells in a row is two zigzags of diagonals (bottom-top-bottom… out, top-bottom-top…
// back), so the only straight stitch is one up the run's last edge; climbing every cell edge made lone cells bowties.
function crossStitch(img, analysis, opts) {
  const o = { ...DEFAULTS, ...opts }, { w, h, labels, colors } = analysis, res = o.res;
  const c = (o.cross || 2.5) * res, gw = Math.floor(w / c), gh = Math.floor(h / c), grid = new Int32Array(gw * gh).fill(-1);
  const bg = new Set(colors.filter((k) => k.background || (o.skip || []).includes(k.id)).map((k) => k.id));
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const n = new Map();
    for (let y = Math.floor(gy * c); y < Math.floor((gy + 1) * c); y++) for (let x = Math.floor(gx * c); x < Math.floor((gx + 1) * c); x++) {
      const l = labels[y * w + x]; n.set(l, (n.get(l) || 0) + 1);
    }
    let best = -1, bn = 0, fg = 0, all = 0;
    for (const [l, k] of n) { all += k; if (bg.has(l)) continue; fg += k; if (k > bn) { bn = k; best = l; } }
    if (fg * 2 > all) grid[gy * gw + gx] = best;
  }
  // a speck on open fabric (no cell of its colour within two, no other colour beside it) cost a trim and two locks:
  // dropped. (Every cell with no neighbour of its colour went too, but a small sprigged picture lost half its flowers.)
  const at = (gx, gy) => (gx >= 0 && gy >= 0 && gx < gw && gy < gh ? grid[gy * gw + gx] : -1), lone = [];
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const k = at(gx, gy);
    let near = 0;
    if (k >= 0) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const q = (dx || dy) ? at(gx + dx, gy + dy) : -1;
      if (q === k || (q >= 0 && Math.abs(dx) < 2 && Math.abs(dy) < 2)) near++;
    }
    if (k >= 0 && !near) lone.push(gy * gw + gx);
  }
  for (const i of lone) grid[i] = -1;
  const used = colors.filter((k) => grid.includes(k.id)).sort((a, b) => b.lightness - a.lightness);
  if (!used.length) throw Object.assign(new Error("No square of the grid is mostly picture, so there's nothing to cross-stitch."), { code: "cross" });
  const ox = (gw * c) / 2, oy = (gh * c) / 2, mm = ([gx, gy]) => [(gx * c - ox) / res, (gy * c - oy) / res];
  // cell corners are the vertices, v = gy * W + gx
  const W = gw + 1, V = W * (gh + 1), X = (v) => v % W, Y = (v) => Math.floor(v / W);
  const d = new Design(o.hoop), summary = [];
  for (const col of used) {
    d.color(col.hex, col.thread.name);
    const done = new Uint8Array(gw * gh);   // cells whose cross is sewn
    // Runs are chained by travel instead of a jump (etsy_8 at 2 mm had 722 trims, most runs under 20 stitches plus
    // two locks): a step along a cell edge costs 1 beside a cell of this colour, 2 beside another colour's, 3 across
    // open fabric, and back over a sewn diagonal 1; at most 6 (so open fabric two cells across at most)
    const edge = (c1, c2) => { const a = at(...c1), b = at(...c2); return a === col.id || b === col.id ? 1 : a >= 0 || b >= 0 ? 2 : 4; };
    const moves = (v) => {
      const x = X(v), y = Y(v), out = [];
      if (x < gw) out.push([v + 1, edge([x, y - 1], [x, y])]);
      if (x > 0) out.push([v - 1, edge([x - 1, y - 1], [x - 1, y])]);
      if (y < gh) out.push([v + W, edge([x - 1, y], [x, y])]);
      if (y > 0) out.push([v - W, edge([x - 1, y - 1], [x, y - 1])]);
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const cx = dx > 0 ? x : x - 1, cy = dy > 0 ? y : y - 1;
        if (cx >= 0 && cy >= 0 && cx < gw && cy < gh && done[cy * gw + cx]) out.push([v + dy * W + dx, 1]);
      }
      return out;
    };
    // runs of cells in a row; each can be sewn from any of its four corners (it ends on the other corner that side)
    const runs = [];
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) if (grid[gy * gw + gx] === col.id) {
      const r = runs[runs.length - 1];
      if (r && r.y === gy && r.b === gx - 1) r.b = gx; else runs.push({ y: gy, a: gx, b: gx });
    }
    const corners = (r) => [r.y * W + r.a, (r.y + 1) * W + r.a, r.y * W + r.b + 1, (r.y + 1) * W + r.b + 1];
    const starts = new Map();
    for (const r of runs) for (const s of corners(r)) { if (!starts.has(s)) starts.set(s, []); starts.get(s).push(r); }
    // the run's corners from corner s: zigzag out along one side's diagonals, up (or down) the far edge, zigzag back
    const sew = (r, s) => {
      const n = r.b - r.a + 1, fromLeft = X(s) === r.a, s0 = Y(s) - r.y, pts = [];
      const p = (k, off) => [fromLeft ? r.a + k : r.b + 1 - k, r.y + off];
      for (let k = 0; k <= n; k++) pts.push(p(k, k % 2 ? 1 - s0 : s0));
      for (let k = n; k >= 0; k--) pts.push(p(k, k % 2 ? s0 : 1 - s0));
      for (let x = r.a; x <= r.b; x++) done[r.y * gw + x] = 1;
      r.done = true;
      return pts;
    };
    const dist = new Float64Array(V).fill(Infinity), from = new Int32Array(V).fill(-1);
    let path = null, cur = -1, left = runs.length, crosses = 0;
    const flush = () => { if (path) d.path(path.map(mm)); path = null; };
    while (left--) {
      let pick = null;
      if (cur >= 0) {   // the nearest run start within reach (Dijkstra)
        const seen = [cur], open = [[0, cur]];
        dist[cur] = 0;
        while (open.length) {
          open.sort((a, b) => b[0] - a[0]);
          const [g, v] = open.pop();
          if (g > dist[v]) continue;
          const r = (starts.get(v) || []).find((q) => !q.done);
          if (r) { pick = [r, v]; break; }
          for (const [m, k] of moves(v)) if (g + k <= 6 && g + k < dist[m]) { if (dist[m] === Infinity) seen.push(m); dist[m] = g + k; from[m] = v; open.push([g + k, m]); }
        }
        if (pick) {
          const way = [];
          for (let v = pick[1]; v !== cur; v = from[v]) way.push([X(v), Y(v)]);
          path.push(...way.reverse());
        }
        for (const v of seen) { dist[v] = Infinity; from[v] = -1; }
      }
      if (!pick) {
        // jump to the nearest run, but rather one over 5 mm away (the machine trims it) than a loose 2-5 mm thread
        flush();
        let bd = Infinity;
        for (const r of runs) if (!r.done) for (const s of corners(r)) {
          const v = cur < 0 ? Y(s) * W + X(s) : (Math.hypot(X(s) - X(cur), Y(s) - Y(cur)) * c) / res;
          const score = cur < 0 || v > 5 ? v : v + 1e6;
          if (score < bd) { bd = score; pick = [r, s]; }
        }
        path = [[X(pick[1]), Y(pick[1])]];
      }
      const pts = sew(...pick), [ex, ey] = pts[pts.length - 1];
      path.push(...pts.slice(1));
      cur = ey * W + ex; crosses += pick[0].b - pick[0].a + 1;
    }
    flush();
    summary.push({ ...col, shapes: crosses, kinds: ["cross"] });
  }
  d.finish();
  // (the grid is centred, not the picture: where mm 0,0 lies in working px, for keptParts)
  return { design: d, summary, fine: { narrowMm2: 0, hairlines: 0 }, origin: [ox, oy] };
}

const SPOTS = 40;
export function keptParts(ink0, full, pattern, at, crop, { style = "fill", cross = 2.5, skip = [] } = {}) {
  const { w, h } = ink0, n = w * h, out = new Set(full.colors.filter((c) => skip.includes(c.id)).map((c) => c.id));
  const ink = { w, h, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) ink.data[i] = ink0.data[i] && !out.has(full.labels[i]) ? 1 : 0;
  // learned px -> mm, and stitches drawn onto the learned copy
  const kx = (crop[2] - crop[0]) * w / at.w, ky = (crop[3] - crop[1]) * h / at.h, mmPx = 1 / (at.res * kx);
  const toPx = (x, y) => [(crop[0] * w) + (x / 10 * at.res + at.origin[0]) * kx, (crop[1] * h) + (y / 10 * at.res + at.origin[1]) * ky];
  const sewn = { w, h, data: new Uint8Array(n).fill(1) };
  let prev = null;
  for (const [x, y, c] of pattern.stitches) {
    if (c !== 0) { prev = null; continue; }   // (STITCH; jumps, trims and colour changes draw nothing)
    const p = toPx(x, y);
    if (prev) {
      const k = Math.max(1, Math.ceil(Math.hypot(p[0] - prev[0], p[1] - prev[1]) * 2));
      for (let s = 0; s <= k; s++) {
        const X = Math.round(prev[0] + ((p[0] - prev[0]) * s) / k), Y = Math.round(prev[1] + ((p[1] - prev[1]) * s) / k);
        if (X >= 0 && Y >= 0 && X < w && Y < h) sewn.data[Y * w + X] = 0;
      }
    }
    prev = p;
  }
  const toStitch = distanceTransform(sewn), wide = distanceTransform(ink), { labels: cl, count } = label(ink);
  const area = new Float64Array(count + 1), half = new Float64Array(count + 1), x0 = new Int32Array(count + 1).fill(w), x1 = new Int32Array(count + 1).fill(-1), y0 = new Int32Array(count + 1).fill(h), y1 = new Int32Array(count + 1).fill(-1);
  for (let i = 0; i < n; i++) {
    const c = cl[i]; if (!c) continue;
    const x = i % w, y = (i - x) / w; area[c]++;
    if (wide[i] > half[c]) half[c] = wide[i];
    if (x < x0[c]) x0[c] = x; if (x > x1[c]) x1[c] = x; if (y < y0[c]) y0[c] = y; if (y > y1[c]) y1[c] = y;
  }
  // thread's reach (mm): a fill reaches its edge, sewing lines under 1 mm along their centre; a line drawing outlines
  // a shape or runs along a stroke's centre (up to 6 mm wide); a cross covers its cell
  const reach = (c) => 1 + (style === "cross" ? cross / mmPx : (0.6 + Math.min(half[c] * mmPx, style === "line" ? 3 : 0.5)) / mmPx);
  const edge = new Float64Array(count + 1), hit = new Float64Array(count + 1), gonePart = new Set();
  for (let i = 0; i < n; i++) {
    const c = cl[i]; if (!c) continue;
    const x = i % w;
    if (x > 0 && x < w - 1 && i >= w && i < n - w && cl[i - 1] && cl[i + 1] && cl[i - w] && cl[i + w]) continue;
    edge[c]++; if (toStitch[i] <= reach(c)) hit[c]++;
  }
  let parts = 0, lost = 0, all = 0, gone = 0, big = 0, bulk = 0;
  for (let c = 1; c <= count; c++) {
    const mm2 = area[c] * mmPx * mmPx;
    if (Math.max(x1[c] - x0[c], y1[c] - y0[c]) + 1 < 1 / mmPx || mm2 < 0.5) continue;
    parts++; all += mm2;
    if (hit[c] >= 0.3 * edge[c]) continue;
    lost++; gone += mm2; gonePart.add(c); big = Math.max(big, (Math.max(x1[c] - x0[c], y1[c] - y0[c]) + 1) * mmPx); bulk = Math.max(bulk, mm2);
  }
  // where the biggest of them are (fractions of the learned copy), for the page to ring on the picture: "a very thin
  // line is left out" didn't say which, and a child's dinosaur had lost its eye
  const spots = [...gonePart].sort((a, b) => area[b] - area[a]).slice(0, SPOTS).map((c) => [x0[c] / w, y0[c] / h, (x1[c] + 1) / w, (y1[c] + 1) / h]);
  return { parts, lost, share: all ? gone / all : 0, mm2: gone, big, bulk, ids: [...gonePart], spots };
}

// fit the picture's longest side to sizeMm, capped by the hoop
export function workingSize(imgW, imgH, sizeMm, hoop, res = DEFAULTS.res) {
  const maxW = hoop.w - 2 * MARGIN - 2, maxH = hoop.h - 2 * MARGIN - 2;
  let s = sizeMm / Math.max(imgW, imgH);
  s = Math.min(s, maxW / imgW, maxH / imgH);
  return { wMm: imgW * s, hMm: imgH * s, w: Math.max(8, Math.round(imgW * s * res)), h: Math.max(8, Math.round(imgH * s * res)) };
}
