/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Picture -> embroidery. Reduce to a few thread colours, then stitch each shape by its width:
// hairlines get a double running stitch along their centre; every shape with width gets a solid tatami fill.
// Other styles: line drawing (`lineArt`) and cross-stitch (`crossStitch`).
import { labOf } from "./colour.js";
import { Design } from "./design.js";
import { FILL, FILL_PATTERNS, SEWN, WORN, fillPolygon, makeRouter, routeBudget, routeFill, tatami } from "./fill.js";
import { arclen, followRun } from "./geom.js";
import { MARGIN } from "./machines.js";
import { LIMITS, PICTURES, ROWS, SHAPES } from "./recipes.js";
import { distanceTransform as wholeDT, label, order, skeletonEdges } from "./raster.js";
import { cleanShapes } from "./regions.js";
import { shading } from "./shade.js";
import { PEC_MATCH, hexToRgb, nearestBrotherThread, pecThread, pyRound, rgbToHex } from "./threads.js";
import { DEFAULTS, across, deltaE2000, pixels, srgbToLab } from "./palette.js";
export { DEFAULTS, analyze, labelWith, learnColours, pictureInk, toPalette } from "./palette.js";

export { FILL_PATTERNS, fillPolygon, routeBudget };   // (core/fill.js)
// fill row spacing in mm. Solid covers the fabric; standard is lighter and faster. 0.3 fails the PE900 check:
// the links between rows become stitches under 0.3 mm, which nest.
export const DENSITY = ROWS;   // (core/recipes.js)
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
function distanceTransform(m) {
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

// No tiny stitch in a path (mm). A fill's rows are 0.35-0.4 mm apart, so the link from one row's end to the next
// row's start is 0.35-0.41 mm where the edge runs square to the rows, and a third of those round to 0.3 mm or less in
// the file (0.25 + 0.25 at 45 degrees is 0.2 + 0.2): 336 tiny stitches in the 12 sample pictures, every one a row
// link. The row's end moves along its own row by 0.1-0.4 mm (out first) until the link sews over 0.3 mm; the row
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

function build(img, analysis, opts) {
  const o = { ...DEFAULTS, ...opts };
  const { w, h, colors } = analysis;
  const used0 = colors.filter((c) => !c.background && c.area > 0 && !(o.skip || []).includes(c.id));
  const level = PICTURES.details[o.details] || PICTURES.details.most;
  // (the picture made into clean shapes first: core/regions.js)
  const clean = o.shapes === false ? { labels: analysis.labels } : cleanShapes(analysis.labels, w, h, colors, o.res, { img, keep: o.details === "all" ? "all" : "" });
  const { labels, folded } = foldFlecks(clean.labels, w, h, colors, used0, o.res);
  // (soft gradients sewn as blends of two threads, core/shade.js: `of` says where a colour sews, `rows` its rows there)
  const sh = shading(img, labels, colors, used0, o.res, o);
  const res = o.res;
  const hoop = o.hoop;
  const cx = w / 2, cy = h / 2, toMm = (p) => p.map(([x, y]) => [(x - cx) / res, (y - cy) / res]);
  const d = new Design(hoop);
  const used = colors.filter((c) => !c.background && c.area > 0 && !(o.skip || []).includes(c.id))
    .sort((a, b) => b.lightness - a.lightness);   // light first, dark details on top
  const summary = [], stitched = new Set(used.map((c) => c.id));
  const fine = { narrowMm2: 0, hairlines: 0, inkMm2: 0, folded, left: 0, shaded: Math.round(sh.area), shades: sh.found || 0, offer: sh.offer, ...(o.shadeDebug ? { shadeDebug: sh.debug } : {}) };   // details too small to stitch cleanly (shown as a hint)
  for (let i = 0; i < w * h; i++) if (stitched.has(labels[i])) fine.inkMm2++;
  fine.inkMm2 /= res * res;
  // ignore specks: under 1.5 mm², or under 4 mm² and under 2.5 mm across (a dot, not a stem: each speck left was a
  // trim, two locks and often a loose thread; 4 mm² for all erased the thin stems of a line-art bouquet)
  const minPx = 1.5 * res * res, EYES = 6, dotPx = 4 * res * res, dotW = 2.5 * res;
  // where each colour's fill will surely lie: over 0.6 mm inside a shape that isn't a speck. A travel run sewn there
  // by an earlier colour is covered.
  // (the thread a fill of so many px sews: its rows and its underlay)
  const fillThread = (px) => (px / (res * res)) * (1 / o.density + 1 / 2.5);
  const solid = new Uint8Array(w * h), budget = routeBudget();
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
      for (let i = 0; i < w * h; i++) if (!cl[i] && shut[i] > R && (later.has(labels[i]) || labels[i] === col.id)) ok[i] = 1;
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
    for (const comp of comps) {
      const mine = comp.pixels.filter((i) => sh.of(i, col.id));
      if (!mine.length) continue;
      let maxDt = 0, sx = 0, sy = 0;
      for (const i of mine) { maxDt = Math.max(maxDt, own[i]); sx += i % w; sy += Math.floor(i / w); }
      const widthMm = (2 * maxDt) / res, centre = [sx / mine.length, sy / mine.length];
      // anything with width is a solid fill that matches its outline exactly
      // pull compensation widens a fill past its edge; on thin letters that closes the gaps between them
      const shaded = sh.rows(col.id, comp, mask, { spacing: o.density, stitch: 3.5, pull: widthMm < 2 ? 0.05 : 0.15 });
      const under = shaded ? shaded.under : tatami(mask, comp, res, { angle: angle + 90, spacing: 2.5, stitch: 3, inset: 0.4, pull: 0 });
      const fill = shaded ? shaded.fill : tatami(mask, comp, res, { angle, spacing: o.density, stitch: 3.5, pull: widthMm < 2 ? 0.05 : 0.15 });
      blocks.push({ centre, paths: routeFill([under, fill], comp, mask, res, budget, WORN, false, 0, null, PICTURES.edge).map(toMm), kind: "fill", comp: comp.id, thread: fillThread(mine.length), meant: dot(comp.id) });
      filled[comp.id] = 1;
    }
    if (anyThin) {
      // thickened a pixel (like a line drawing) so a line broken by a pixel joins up, then walked like lettering:
      // each line out as a triple run (it shows like a thin outline) and back, so a connected line has no jumps.
      // A line out and back is four passes: it shows about as well as a thin outline drawn in the picture.
      const thick = { w, h, data: thin.data.slice() };
      for (let i = 0; i < w * h; i++) if (thin.data[i]) { const x = i % w; if (x < w - 1) thick.data[i + 1] = 1; if (i + w < w * h) thick.data[i + w] = 1; }
      const walks = order(skeletonEdges(thick, 2, { spur: 1 })).map((seq) => {
        const mm = seq.map(([p, kind]) => [toMm(p), kind]);
        return { mm, len: mm.reduce((a, [p, kind]) => a + (kind === "run" ? arclen(p).at(-1) : 0), 0) };
      // (a piece under 1.5 mm of line is a dot: sewn four times over with two locks and a trim, beside a bigger piece
      // too; 17-43 per picture were kept for being within LINK of one)
      }).filter((t) => t.len >= 1.5);
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
      const total = new Map();
      walks.forEach((t, i) => total.set(find(i), (total.get(find(i)) || 0) + t.len));
      walks.forEach((t, i) => {
        if (total.get(find(i)) < GROUP) return;
        fine.hairlines++;
        const paths = t.mm.map(([p, kind]) => {
          const q = followRun(p, 1.5, 0.1, 0.6);
          return kind === "run" && q.length > 1 ? [...q, ...q.slice(0, -1).reverse(), ...q.slice(1)] : q;
        });
        blocks.push({ centre: paths[0][0], paths, kind: "run", thread: 3 * t.len });
      });
    }
    if (!blocks.length) continue;
    // Moves between sections and shapes travel where stitches still to come will cover the run: this colour's fills
    // not sewn yet (kept 0.25 mm off their edges) or a later colour's solid fill. Each jump was a trim, two locks and,
    // up to 5 mm (the PE900 never trims those), a loose thread: etsy_8 had 293 trims and 101 loose threads.
    const toPx = ([x, y]) => [x * res + cx, y * res + cy], ink = (i) => mask.data[i] || thin.data[i] || later.has(labels[i]);
    const hop = (a, b) => {   // the step between a point and its first cell: on this colour or one still to come
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (0.2 * res));
      for (let i = 1; i <= n; i++) if (!ink(Math.round(a[1] + ((b[1] - a[1]) * i) / n) * w + Math.round(a[0] + ((b[0] - a[0]) * i) / n))) return false;
      return true;
    };
    // ... or along this colour's own thin lines (within 2 px), which are sewn in this thread anyway
    const near2 = new Uint8Array(w * h);
    if (anyThin) for (let i = 0; i < w * h; i++) if (thin.data[i]) { const x = i % w, y = (i - x) / w; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) near2[Y * w + X] = 1; } }
    const router = () => makeRouter(mask, res, (x, y) => {
      const i = y * w + x;
      return solid[i] && later.has(labels[i]) ? 2 : filled[cl[i]] && dt[i] > 0.25 * res ? 1 : near2[i] ? 1 : 0;
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
      const pt = (q) => ({ q, r: R.regionOf(toPx(q)) }), along = (b) => b.paths.flat().filter((_, i, a) => i % 6 === 0 || i === a.length - 1).map(pt);
      const from = blocks.map((b) => (b.kind === "run" ? along(b) : [pt(b.paths[b.paths.length - 1].at(-1))]));
      const to = blocks.map((b, i) => (b.kind === "run" ? from[i] : [pt(b.paths[0][0])]));
      const goes = (i, j) => from[i].some((a) => to[j].some((b) => { const v = Math.hypot(a.q[0] - b.q[0], a.q[1] - b.q[1]); return v <= 2 || (v <= TRAVEL && a.r && a.r === b.r); }));
      for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) if (find(i) !== find(j) && (goes(i, j) || goes(j, i))) root[find(i)] = find(j);
      const sum = new Map();
      blocks.forEach((b, i) => sum.set(find(i), (sum.get(find(i)) || 0) + b.thread));
      const most = Math.max(...sum.values()), go = (b, i) => !b.meant && sum.get(find(i)) < level.start && sum.get(find(i)) < level.share * most;
      const out = new Set(blocks.filter(go).filter((b) => b.kind === "fill").map((b) => b.comp)), n0 = blocks.length;
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
      blocks.forEach((b, i) => {
        (b.tour || [b.paths[0][0]]).forEach((qm, k) => {
          const q = toPx(qm), v = Math.hypot(q[0] - at[0], q[1] - at[1]) / res;
          // (a jump of 2-5 mm is left as a loose thread by the machine: one over 5 mm, trimmed, is better)
          const score = v <= 2 || (v <= TRAVEL && from && R.regionOf(q) === from) ? v : v > 5 ? v + 1000 : v + 2000;
          if (score < bd) { bd = score; bi = i; bk = k; }
        });
      });
      const b = blocks.splice(bi, 1)[0];
      if (b.tour) { const t = b.tour; b.paths = [bk ? [...t.slice(bk), ...t.slice(1, bk + 1)] : t]; }
      const last = b.paths[b.paths.length - 1];
      ordered.push(b); at = toPx(last[last.length - 1]);
    }
    // a short move to the next piece is sewn straight unless it would cross fabric this colour doesn't cover
    const covered = ([x, y]) => mask.data[Math.round(y * res + cy) * w + Math.round(x * res + cx)] === 1;
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
      let q = clearStart(noTiny(p)), at = b.kind === "fill" ? inside(q[0], q.slice(1, 16)) : null;
      if (at && nearer(gapTo(d.cur, q[0]), gapTo(d.cur, at))) at = null;
      tuck(at || q[0]);
      if (at && nearer(gapTo(d.cur, q[0]), gapTo(d.cur, at))) at = null;
      d.path(at ? noTiny(q, at) : q, true, true, at);
      return q;
    };
    let out = null;   // a piece left out when the needle came to it
    const gone = [];   // ... and all of them: a kept mark is kept for the piece it sits by
    const by = (p) => gone.some((g) => g.paths.some((q) => q.some((v) => Math.hypot(v[0] - p[0], v[1] - p[1]) <= 2.5)));
    for (const b of ordered) for (const [pi, p] of b.paths.entries()) {
      let q;
      if (b === out) continue;
      if (!d.cur) q = jumpTo(b, p);
      else {
        const gap = Math.hypot(p[0][0] - d.cur[0], p[0][1] - d.cur[1]);
        if (gap <= 2 && !crosses(d.cur, p[0])) d.path((q = noTiny(p, d.cur)));
        else {
          const r = gap <= TRAVEL ? R.route(toPx(d.cur), toPx(p[0]), SEWN, 1.5 * gap + 3) : null;
          if (r && r.sewnMm <= SEWN && r.mm <= 1.5 * gap + 3) d.path([d.cur, ...(q = noTiny([...toMm(R.stitches(r)), ...p], d.cur))]);
          // (a part of a shape that travel can't reach and that sews less thread than its own locks: left out)
          else if (gap > 2 && b.kind === "fill" && pi && pathLen(p) < PICTURES.start) continue;
          // (nor a piece that only a jump reaches and that sews under level.lone mm in all: a dash 2 mm from its
          // line's other dashes but not from where the needle is. Each was a run of nothing but its own locks: 8 of them
          // were 75 of the 90 lock hits with nothing over them in the 12 sample pictures)
          // (a dot kept for the piece beside it goes with that piece: left, it was a start of its own for a knot)
          else if (gap > 2 && level.lone && !pi && (!b.meant || by(p[0])) && b.paths.reduce((a, v) => a + pathLen(v), 0) < level.lone) { out = b; gone.push(b); fine.left++; continue; }
          else if (gap > 2) q = jumpTo(b, p);
          else d.path((q = noTiny(p, d.cur)), true, false);
        }
      }
      tail = b.kind === "fill" ? q : null;
      if (b.kind === "fill") R.markSewn(p.map(toPx));
    }
    tuck();
    summary.push({ ...col, shapes: ordered.length, kinds: [...new Set(ordered.map((b) => b.kind))] });
  }
  if (!d.stitches.length) throw nothing(used, o);
  d.finish();
  return { design: d, summary, fine };
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

// Line drawing (redwork): every shape's outline and every line's or even stroke's centre, in the picture's darkest
// colour. The lines are walked like lettering (each one out and back), so a connected drawing sews without a trim.
function lineArt(img, analysis, opts) {
  const o = { ...DEFAULTS, ...opts }, { w, h, colors } = analysis, res = o.res;
  const used = colors.filter((c) => !c.background && c.area > 0 && !(o.skip || []).includes(c.id));
  if (!used.length) throw nothing(used, o);
  const ink = used.reduce((a, c) => (c.lightness < a.lightness ? c : a)), mine = new Set(used.map((c) => c.id));
  const labels = closeSlivers(analysis.labels, w, h, mine, res);
  const cx = w / 2, cy = h / 2, toMm = (p) => p.map(([x, y]) => [(x - cx) / res, (y - cy) / res]);
  // Only a change of colour draws a line: two shades of one (a textured lawn in two greens) don't, and a thin piece that
  // is a shade of the colour round it, or the blend between two colours (a yellow bird's edge against its black
  // outline), takes the neighbouring colour instead of being drawn as a line beside the outline.
  const fabric = colors.find((c) => c.background), labOf = new Map(colors.map((c) => [c.id, srgbToLab(...hexToRgb(c.picture || c.hex))]));
  const colOf = (l) => (mine.has(l) ? labOf.get(l) : fabric ? labOf.get(fabric.id) : null);
  const alike = (a, b) => !!a && !!b && deltaE2000(a, b) < 15;
  const toFabric = fabric ? fabric.id : -1, moves = [];
  // JPEG noise: a thin piece (nowhere 1.5 mm across) under 5 mm long of a strong colour (30 or more from the fabric,
  // ΔE00) whose own pixels are faint, under 30 % as far from the fabric as its colour is, is the ringing a JPEG leaves
  // beside a hard edge, not a line: it's fabric. A flower's JPEG drew a 3 mm streak over its lettering. (A real line a
  // pixel or two wide is anti-aliased, but keeps most of its colour. A pale colour's lines are faint all along, as
  // faint as noise: at 40 % of etsy_1's lavender, 16 from the paper, its stems came out in pieces.)
  if (fabric) {
    const fl = labOf.get(fabric.id), { data } = img;
    for (const col of used) {
      const mask = { w, h, data: new Uint8Array(w * h) };
      for (let i = 0; i < w * h; i++) mask.data[i] = labels[i] === col.id ? 1 : 0;
      const dt = distanceTransform(mask), { labels: cl, count } = label(mask), wide = new Uint8Array(count + 1);
      const x0 = new Int32Array(count + 1).fill(w), x1 = new Int32Array(count + 1).fill(-1), y0 = new Int32Array(count + 1).fill(h), y1 = new Int32Array(count + 1).fill(-1);
      for (let i = 0; i < w * h; i++) {
        const c = cl[i]; if (!c) continue;
        if (dt[i] > 0.75 * res) wide[c] = 1;
        const x = i % w, y = (i - x) / w;
        if (x < x0[c]) x0[c] = x; if (x > x1[c]) x1[c] = x; if (y < y0[c]) y0[c] = y; if (y > y1[c]) y1[c] = y;
      }
      const short = (c) => !wide[c] && Math.max(x1[c] - x0[c], y1[c] - y0[c]) + 1 < 5 * res, full = deltaE2000(labOf.get(col.id), fl);
      if (full < 30) continue;
      const sum = new Float64Array(count + 1), n = new Int32Array(count + 1);
      for (let i = 0; i < w * h; i++) {
        const c = cl[i]; if (!c || !short(c)) continue;
        sum[c] += deltaE2000(srgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]), fl); n[c]++;
      }
      for (let i = 0; i < w * h; i++) { const c = cl[i]; if (c && n[c] && sum[c] / n[c] < 0.3 * full) labels[i] = toFabric; }
    }
  }
  const before = labels.slice();
  for (const col of used) {
    const mask = { w, h, data: new Uint8Array(w * h) };
    for (let i = 0; i < w * h; i++) mask.data[i] = before[i] === col.id ? 1 : 0;
    const dt = distanceTransform(mask), { labels: cl, count } = label(mask), wide = new Uint8Array(count + 1), size = new Int32Array(count + 1);
    for (let i = 0; i < w * h; i++) if (cl[i]) { size[cl[i]]++; if (dt[i] > 0.75 * res) wide[cl[i]] = 1; }
    const nb = new Map();
    for (let i = 0; i < w * h; i++) {
      const c = cl[i]; if (!c || wide[c]) continue;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || cl[j] === c) continue;
        const l = mine.has(before[j]) ? before[j] : toFabric, m = nb.get(c) || new Map();
        m.set(l, (m.get(l) || 0) + 1); nb.set(c, m);
      }
    }
    const me = labOf.get(col.id), to = new Map();
    for (const [c, m] of nb) {
      const [[A] = [], [B] = []] = [...m.entries()].sort((p, q) => q[1] - p[1]), a = colOf(A), b = colOf(B);
      // (into the fabric only a speck: a pale line on white is still a line)
      if (alike(me, a) && (A !== toFabric || size[c] < 0.5 * res * res)) to.set(c, A);
      // (a blend with the fabric is the edge of the colour it blends into: thin dark lettering anti-aliased to grey
      // stays lettering)
      else if (a && b && deltaE2000(a, me) + deltaE2000(me, b) <= 1.25 * deltaE2000(a, b)) to.set(c, A === toFabric ? B : B === toFabric ? A : deltaE2000(a, me) <= deltaE2000(me, b) ? A : B);
    }
    if (to.size) moves.push([cl, to]);
  }
  // (all at once, from the colours as they were: one piece's move can't pass another on to the fabric)
  for (const [cl, to] of moves) for (let i = 0; i < w * h; i++) if (to.has(cl[i])) labels[i] = to.get(cl[i]);
  // Outlines drawn in the picture (a dark band under BAND mm wide) are lines already: sewn once along their centre.
  // Tracing both their edges drew two parallel lines round Snoopy. Parts of a dark colour's shapes no disc BAND/2 mm
  // across reaches into are such bands (a filled ear stays a shape, the outline running from it a line); a small dark
  // shape on its own (an eye, a nose) is outlined.
  const BAND = 3, dark = (c) => c.lightness <= Math.max(35, ink.lightness + 15);
  // A whole piece that is one stroke of an even width (a crayon or marker line, a logo's letters) is sewn once along
  // its centre whatever its colour, up to STROKE of the drawing's longer side (3-6 mm). Deciding by parts drew the
  // corners of a 3 mm crayon line, where a BAND disc just fits, as little outlines and cut the line there (a house's
  // lumps and broken door), and 4 mm letters as half outlines, half centre lines (KENJI'S at 120 mm).
  const STROKE = 0.04, wMax = Math.min(6, Math.max(BAND, (STROKE * Math.max(w, h)) / res)) * res;
  const lines = { w, h, data: new Uint8Array(w * h) }, bands = { w, h, data: new Uint8Array(w * h) }, wideAt = new Uint8Array(w * h);
  const strokes = { w, h, data: new Uint8Array(w * h) }, widths = [], sw = [], dots = [];
  for (const col of used) {
    const mask = { w, h, data: new Uint8Array(w * h) };
    for (let i = 0; i < w * h; i++) mask.data[i] = labels[i] === col.id ? 1 : 0;
    const dt = distanceTransform(mask), { labels: cl, count } = label(mask), wide = new Uint8Array(count + 1);
    for (let i = 0; i < w * h; i++) if (cl[i] && dt[i] > 0.75 * res) wide[cl[i]] = 1;   // over 1.5 mm across somewhere
    // each wide piece's depths along its middle (the ridge of its distance to the edge), deepest point, area and what
    // its edge touches (fabric, or another colour of the drawing)
    const ridge = Array.from({ length: count + 1 }, () => []), top = new Float32Array(count + 1), area = new Int32Array(count + 1);
    const open = new Int32Array(count + 1), shut = new Int32Array(count + 1);
    for (let i = 0; i < w * h; i++) {
      const c = cl[i]; if (!c || !wide[c]) continue;
      area[c]++; if (dt[i] > top[c]) top[c] = dt[i];
      const x = i % w;
      let peak = dt[i] >= 1.5;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || !mine.has(labels[j])) open[c]++;
        else if (labels[j] !== col.id) shut[c]++;
        if (j >= 0 && j < w * h && dt[j] > dt[i]) peak = false;
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
      if ((W <= wMax || (W <= 6 * res && area[c] >= 12 * W * W)) && d[Math.floor(d.length * 0.2)] >= 0.6 * d[Math.floor(d.length * 0.8)] && top[c] <= W && open[c] >= (long[c] && area[c] >= 12 * W * W ? 2 : 4) * shut[c])
        stroke[c] = long[c] ? 1 : 2;
    }
    // A stroke's centre line keeps its limbs: where a quarter of it is limbs shorter than the stroke is wide but over
    // half that (not a corner's spur), which the centre line's pruning takes off, the piece is outlined instead. Fat
    // letters' limbs are that short: a bold N 3 mm wide sewed as a hook, an i went altogether.
    const fat = new Uint8Array(count + 1);
    {
      const m = { w, h, data: new Uint8Array(w * h) };
      for (let i = 0; i < w * h; i++) m.data[i] = cl[i] && stroke[cl[i]] ? 1 : 0;
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
      for (let c = 1; c <= count; c++) if (stroke[c] && (lost[c] >= 0.25 * all[c] || (L >= 0.08 * A && area[c] < 12 * across[c] ** 2))) { stroke[c] = 0; fat[c] = 1; }
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
    const r = (BAND / 2) * res, core = { w, h, data: new Uint8Array(w * h) }, small = 2 * BAND * res;
    const x0 = new Int32Array(count + 1).fill(w), x1 = new Int32Array(count + 1), y0 = new Int32Array(count + 1).fill(h), y1 = new Int32Array(count + 1);
    const pc = new Int32Array(count + 1), sx = new Float64Array(count + 1), sy = new Float64Array(count + 1);
    for (let i = 0; i < w * h; i++) {
      const c = cl[i]; if (!c) continue;
      const x = i % w, y = (i - x) / w;
      if (x < x0[c]) x0[c] = x; if (x > x1[c]) x1[c] = x; if (y < y0[c]) y0[c] = y; if (y > y1[c]) y1[c] = y;
      pc[c]++; sx[c] += x; sy[c] += y;
    }
    // A dot (0.8-2.5 mm across, 0.6 mm² or more, too thin to outline) is a short line across its middle, out and back:
    // its centre line was a point, and an i's dots and full stops went
    const dotC = (c) => !wide[c] && pc[c] >= 0.6 * res * res && Math.min(x1[c] - x0[c], y1[c] - y0[c]) + 1 >= 0.8 * res && Math.max(x1[c] - x0[c], y1[c] - y0[c]) + 1 < 2.5 * res;
    for (let c = 1; c <= count; c++) if (dotC(c)) {
      const cx = sx[c] / pc[c], cy = sy[c] / pc[c], across = x1[c] - x0[c] >= y1[c] - y0[c], L = Math.max(0.35 * res, (Math.max(x1[c] - x0[c], y1[c] - y0[c]) + 1 - 0.5 * res) / 2);
      dots.push([`d${col.id}_${c}a`, `d${col.id}_${c}b`, across ? [[cx - L, cy], [cx + L, cy]] : [[cx, cy - L], [cx, cy + L]]]);
    }
    for (let i = 0; i < w * h; i++) core.data[i] = cl[i] && dt[i] > r ? 0 : 1;
    const toCore = distanceTransform(core), thin = (i) => cl[i] && wide[cl[i]] && !stroke[cl[i]] && toCore[i] > r + 0.5, part = new Int32Array(count + 1);
    const tm = { w, h, data: new Uint8Array(w * h) };
    for (let i = 0; i < w * h; i++) if (thin(i)) { part[cl[i]]++; tm.data[i] = 1; }
    const { labels: tl, count: tc } = label(tm), tA = new Int32Array(tc + 1), tW = new Float32Array(tc + 1), tO = new Int32Array(tc + 1), tS = new Int32Array(tc + 1);
    for (let i = 0; i < w * h; i++) {
      const t = tl[i]; if (!t) continue;
      tA[t]++; if (dt[i] > tW[t]) tW[t] = dt[i];
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || cl[j] === cl[i]) continue;
        if (mine.has(labels[j])) tS[t]++; else tO[t]++;
      }
    }
    const longPart = (t) => { const wd = 2 * tW[t]; return wd > 0 && tA[t] >= 4 * wd * wd && tA[t] / wd >= 5 * res && tO[t] >= 0.5 * tS[t]; };
    const band = (i) => thin(i) && ((dark(col) && part[cl[i]] >= 0.5 * area[cl[i]] && (x1[cl[i]] - x0[cl[i]] > small || y1[cl[i]] - y0[cl[i]] > small)) || longPart(tl[i]));
    for (let i = 0; i < w * h; i++) {
      if (!cl[i]) continue;
      if (!wide[cl[i]]) { if (!dotC(cl[i])) lines.data[i] = 1; }   // a thin line: its centre comes from the skeleton
      else if (stroke[cl[i]]) { strokes.data[i] = 1; bands.data[i] = 1; sw.push(across[cl[i]]); }
      else if (band(i)) { bands.data[i] = 1; widths.push(dt[i]); }
      else wideAt[i] = 1;
    }
  }
  // an outline, drawn on one side only where two colours meet (the lower id), so it isn't doubled, and not along a
  // band (its centre line is the line)
  for (let i = 0; i < w * h; i++) {
    if (!wideAt[i]) continue;
    const x = i % w, l = labels[i];
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= w * h || !mine.has(labels[j])) { lines.data[i] = 1; break; }
      if (labels[j] !== l && labels[j] > l && !bands.data[j] && !lines.data[j] && !alike(labOf.get(l), labOf.get(labels[j]))) { lines.data[i] = 1; break; }
    }
  }
  // thicken the 1 px outlines so the skeleton follows them smoothly
  const thick = { w, h, data: lines.data.slice() };
  for (let i = 0; i < w * h; i++) if (lines.data[i]) { const x = i % w; if (x < w - 1) thick.data[i + 1] = 1; if (i + w < w * h) thick.data[i + w] = 1; }
  // (pruning dead ends under 2 mm too took the strokes off small lettering)
  const edges = lineEnds(skeletonEdges(thick, 3, { spur: 1 }), thick, res);
  if (widths.length) {
    // (the bands' own skeleton, pruned at their width: corners of a wide stroke grow short spurs)
    widths.sort((a, b) => a - b);
    const stroke = Math.max(3, Math.min(BAND * res, 2 * widths[Math.floor(widths.length * 0.9)]));
    const part = { w, h, data: bands.data.map((v, i) => v && !strokes.data[i]) };
    for (const [a, b, p] of skeletonEdges(part, stroke, { spur: 1 })) edges.push([`b${a}`, `b${b}`, p]);
  }
  if (sw.length) {
    sw.sort((a, b) => a - b);
    const W = Math.max(3, sw[Math.floor(sw.length * 0.9)]);
    // (spurs pruned under 0.6 of the width: a whole width took a slab E's lower arm)
    for (const [a, b, p] of lineEnds(skeletonEdges(strokes, W, { spur: 0.6 }), strokes, W)) edges.push([`s${a}`, `s${b}`, p]);
  }
  // each connected drawing walked out and back: a closed tour (mm) that ends where it starts; pieces under 2 mm long
  // in all, and not joined to another drawing, are specks (each one a trim, two locks and often a loose thread)
  // (stitches that keep to the curve, not 2 mm chords across a small flower's petals; points under 0.4 mm apart, where
  // short skeleton edges meet, are merged: tiny stitches nest and break thread)
  const firstDot = edges.length;
  edges.push(...dots);
  const tours = order(edges).map((comp) => {
    const t = [];
    t.dot = comp.some(([, , k]) => k >= firstDot);
    for (const q of comp.flatMap(([p], k) => followRun(toMm(p), 2.0, 0.1).slice(k ? 1 : 0)))
      if (!t.length || Math.hypot(q[0] - t.at(-1)[0], q[1] - t.at(-1)[1]) >= 0.4) t.push(q);
    const s = comp[0][0][0], e = comp.at(-1)[0].at(-1);
    if (Math.hypot(s[0] - e[0], s[1] - e[1]) < 0.01 && t.length > 1) t[t.length - 1] = t[0];   // (still ends where it began)
    return t;
  }).filter((t) => t.length > 1);
  // A line end within 2 mm of another drawing is joined to it: the needle steps across, sews that drawing and steps
  // back over the same stitch, instead of jumping (a gap that short is a loose thread the machine never trims; 3 mm
  // drew visible bars between small letters)
  const key = ([x, y]) => `${Math.floor(x / 3)},${Math.floor(y / 3)}`, cells = new Map();
  tours.forEach((t, i) => t.forEach((q, k) => { const c = key(q); if (!cells.has(c)) cells.set(c, []); cells.get(c).push([i, k]); }));
  const deg = new Map();
  for (const [a, b] of edges) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
  const ends = edges.flatMap(([a, b, p]) => [...(deg.get(a) === 1 ? [p[0]] : []), ...(deg.get(b) === 1 ? [p[p.length - 1]] : [])]).map((q) => toMm([q])[0]);
  const near = (q, skip, r) => {   // the nearest tour point within r of q, not in tour `skip`
    const [gx, gy] = key(q).split(",").map(Number);
    let best = null, bd = r;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const [i, k] of cells.get(`${gx + dx},${gy + dy}`) || []) {
      const v = Math.hypot(tours[i][k][0] - q[0], tours[i][k][1] - q[1]);
      if (i !== skip && v <= bd) { bd = v; best = [i, k, v]; }
    }
    return best;
  };
  // (across the fabric only between parts of one colour in the picture, as a word's letters are: a sun's ray 1.25 mm
  // from a dinosaur's head, yellow beside green, was joined to it by a stitch across the gap. Parts that touch, a stem
  // and its flower, still join: the step lies along the drawing)
  const inks = (q) => {
    const X = Math.round(q[0] * res + cx), Y = Math.round(q[1] * res + cy), r = Math.ceil(0.8 * res), out = new Set();
    for (let y = Math.max(0, Y - r); y <= Math.min(h - 1, Y + r); y++) for (let x = Math.max(0, X - r); x <= Math.min(w - 1, X + r); x++)
      if (mine.has(labels[y * w + x])) out.add(labels[y * w + x]);
    return out;
  };
  const across = (p, q) => {   // over 0.5 mm of open fabric on the way from p to q
    const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) * res * 2);
    let run = 0;
    for (let k = 0; k <= n; k++) {
      const X = Math.round((p[0] + ((q[0] - p[0]) * k) / Math.max(1, n)) * res + cx), Y = Math.round((p[1] + ((q[1] - p[1]) * k) / Math.max(1, n)) * res + cy);
      run = X >= 0 && Y >= 0 && X < w && Y < h && !mine.has(labels[Y * w + X]) ? run + 0.5 : 0;
      if (run > 0.5 * res) return true;
    }
    return false;
  };
  const oneInk = (p, q) => {
    if (!across(p, q)) return true;
    const a = inks(p), b = inks(q);
    return !a.size || !b.size || [...a].some((l) => [...b].some((m) => l === m || alike(labOf.get(l), labOf.get(m))));
  };
  const joins = [];
  for (const e of ends) {
    const at = near(e, -1, 0.05);
    if (!at) continue;
    const to = near(e, at[0], 2);
    if (to && oneInk(e, tours[to[0]][to[1]])) joins.push({ a: at[0], ka: at[1], b: to[0], kb: to[1], v: to[2] });
  }
  // (and so is a drawing too short to sew on its own, at its point nearest another: an i's dot or a full stop, which
  // as a closed outline has no loose end)
  tours.forEach((t, i) => {
    if (arclen(t).at(-1) >= 4) return;
    let best = null;
    t.forEach((q, k) => { const to = near(q, i, 2); if (to && (!best || to[2] < best.v) && oneInk(q, tours[to[0]][to[1]])) best = { a: i, ka: k, b: to[0], kb: to[1], v: to[2] }; });
    if (best) joins.push(best);
  });
  joins.sort((p, q) => p.v - q.v);
  const root = tours.map((_, i) => i), find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
  const links = tours.map(() => []);
  for (const j of joins) if (find(j.a) !== find(j.b)) { root[find(j.a)] = find(j.b); links[j.a].push([j.ka, j.b, j.kb]); links[j.b].push([j.kb, j.a, j.ka]); }
  // a tour from its point k, with every joined drawing sewn where it's joined (and the step back)
  const rotate = (t, k) => [...t.slice(k), ...t.slice(1, k + 1)];
  const nest = (i, k, from) => {
    const t = tours[i], n = t.length - 1, at = new Map();
    for (const [ka, j, kb] of links[i]) if (j !== from) { const r = (ka - k + n) % n; if (!at.has(r)) at.set(r, []); at.get(r).push([j, kb]); }
    const out = [];
    rotate(t, k).forEach((q, r) => { out.push(q); for (const [j, kb] of at.get(r) || []) out.push(...nest(j, kb, i), q); });
    return out;
  };
  // (a short one joined to a drawing costs no trim: KENJI'S apostrophe at 60 mm, 1.6 mm long, was left out)
  const total = new Map();
  tours.forEach((t, i) => total.set(find(i), (total.get(find(i)) || 0) + arclen(t).at(-1)));
  // (the step onto a joined drawing can be a tenth of a mm: points under 0.4 mm after the last are dropped again)
  const spaced = (t) => {
    const o = [t[0]];
    for (let k = 1; k < t.length; k++) if (k === t.length - 1 || Math.hypot(t[k][0] - o.at(-1)[0], t[k][1] - o.at(-1)[1]) >= 0.4) o.push(t[k]);
    return o;
  };
  // (a dot not joined to a drawing is kept when another drawing is within 5 mm: a colon after a space)
  const by = (i) => tours.some((u, j) => j !== i && find(j) !== find(i) && tours[i].some((q) => u.some((v) => Math.hypot(v[0] - q[0], v[1] - q[1]) <= 5)));
  let left = tours.map((_, i) => i).filter((i) => find(i) === i && (total.get(i) >= 4 || (tours[i].dot && by(i)))).map((i) => spaced(nest(i, 0, -1)));
  const d = new Design(o.hoop);
  // (sewn in the darkest colour, or the thread picked for the lines)
  const line = o.line ? { hex: o.line, thread: nearestBrotherThread(o.line) } : ink;
  d.color(line.hex, line.thread.name);
  const shapes = left.length;
  // nearest drawing next, entered at its nearest point; rather one over 5 mm away (the machine trims the jump) than
  // a loose 2-5 mm thread
  while (left.length) {
    let bi = 0, bk = 0, bd = Infinity;
    left.forEach((t, i) => t.forEach((q, k) => {
      const v = d.cur ? Math.hypot(q[0] - d.cur[0], q[1] - d.cur[1]) : q[0], s = !d.cur || v <= 2 || v > 5 ? v : v + 1e3;
      if (s < bd) { bd = s; bi = i; bk = k; }
    }));
    // (a step under 2 mm onto a drawing of another colour is a move, not a stitch across the gap: see oneInk)
    d.path(rotate(left[bi], bk), true, !!d.cur && !oneInk(d.cur, left[bi][bk]));
    left.splice(bi, 1);
  }
  if (!d.stitches.length) throw Object.assign(new Error("No lines in this picture are big enough to stitch."), { code: "small" });
  d.finish();
  return { design: d, summary: [{ ...ink, hex: line.hex, thread: line.thread, shapes, kinds: ["run"] }], fine: { narrowMm2: 0, hairlines: 0 } };
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

// What of the picture made it into stitches, whatever the style: every part of the picture (a connected piece of what
// isn't fabric, on the learned copy, so it's the same at every Size) is kept when most of its edge lies within thread's
// reach of a stitch. Each style leaves things out by its own rules (specks, lone cells, lines too fine to label, a pale
// colour merged into the fabric when threads run short), and etsy_7's hundred doodles vanished at 60 mm with the
// dialog saying "Checked". Parts under 1 mm across or 0.5 mm² at this size (JPEG flecks) aren't counted.
// ink: pictureInk(learn copy, colours learned at the most threads: what the picture has, whatever the count asked);
// full: labelWith(learn copy, the colours sewn: for the colours left out on purpose); pattern: the design before any
// turn (0.1 mm); at: { w, h, res, origin } of the working copy; crop: the part of the learned copy it shows (fractions).
// Returns { parts, lost (how many), share (of the area), mm2, big (the longest lost part, mm), bulk (the largest lost
// part's area, mm²), ids: the lost parts (the same part has the same id at every
// Size, style and colour count of one picture) }.
// the most thread colours a picture can be sewn in (the Picture tab's slider)
export const MOST = 8;
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

// Size is the sewn design's longer side, not the picture's: a framed photo at "174 mm" sewed 84 x 58 mm, and a
// picture could never fill the hoop. box: the part of the picture whose colours were learned ({ sx, sy, sw, sh },
// picture px); boxes: the extent of each colour to be sewn, fractions of box ([x0, y0, x1, y1], from learnColours).
// Returns where to cut the picture (`crop`, picture px, and `frac`, fractions of box), the working size in px to draw
// it at, and `max`: the largest longer side (mm) that fits the hoop field. `fit`: how much bigger to draw it than its
// colours' extent says, learned from the last time it was sewn (the edges' blend pixels and specks aren't sewn: 100 mm
// came out 99 x 88).
export function picturePlan(box, boxes, sizeMm, hoop, res = DEFAULTS.res, fit = 1) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const b of boxes) if (b[2] > b[0] && b[3] > b[1]) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  if (x1 <= x0 || y1 <= y0) { x0 = y0 = 0; x1 = y1 = 1; }
  const cw = (x1 - x0) * box.sw, ch = (y1 - y0) * box.sh, L = Math.max(cw, ch);
  const maxW = hoop.w - 2 * MARGIN - 2, maxH = hoop.h - 2 * MARGIN - 2, max = L * Math.min(maxW / cw, maxH / ch);
  const s = (Math.min(sizeMm, max) * fit) / L;   // mm per picture px
  // (a little room round it: 2% and 3 working px)
  const m = 0.02 * L + 3 / (s * res);
  const sx = Math.max(box.sx, box.sx + x0 * box.sw - m), sy = Math.max(box.sy, box.sy + y0 * box.sh - m);
  const ex = Math.min(box.sx + box.sw, box.sx + x1 * box.sw + m), ey = Math.min(box.sy + box.sh, box.sy + y1 * box.sh + m);
  const crop = { sx, sy, sw: ex - sx, sh: ey - sy };
  return { crop, frac: [(sx - box.sx) / box.sw, (sy - box.sy) / box.sh, (ex - box.sx) / box.sw, (ey - box.sy) / box.sh],
    w: Math.max(8, Math.round(crop.sw * s * res)), h: Math.max(8, Math.round(crop.sh * s * res)), max: Math.floor(max), sizeMm: Math.min(sizeMm, max) };
}

// Sews a picture at a Size: the sewn design's longer side, within 0.4 mm (a cross-stitch: half a cell, its grid can't
// do better). What's sewn is smaller than the colours' extent (blends and specks aren't sewn) or, when bigger parts
// survive, larger, so it's drawn again: proportionally, then between the closest tries under and over (etsy_7 in
// cross-stitch: 40 mm with its doodles dropped, 90 with them kept, and back). The closest try wins, an over-size
// counting half again. The tries depend only on the settings, never on what was sewn before: the fit used to be carried from the last
// size and style, so one setting sewed 1578, 1576 or 1430 stitches by history. `fit` (from an earlier sewing of these
// exact settings) is sewn once as it is.
// job(img, frac) -> the worker's reply; plan(fit) -> picturePlan(...). Returns the reply with `plan` and `tries`.
export async function sewSized(job, plan, { style = "fill", cross = 2.5, fit = null } = {}) {
  const tol = style === "cross" ? cross / 2 : 0.4, tries = [], most = fit ? 1 : style === "cross" ? 10 : 5;
  // (over the Size is worse than under: it was asked to fit somewhere)
  const miss = (got, want) => (got > want ? 1.5 * (got - want) : want - got);
  let f = fit || 1, best = null, bracketed = 0;
  for (let t = 0; t < most; t++) {
    const pl = plan(f), r = await job(pl);
    if (!r.ok) return r;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y, c] of r.pattern.stitches) if (c === 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const got = x1 > x0 || y1 > y0 ? Math.max(x1 - x0, y1 - y0) / 10 : 0, e = { fit: f, got, off: miss(got, pl.sizeMm), r, plan: pl };
    tries.push(e);
    if (!best || e.off < best.off - 1e-6) best = e;
    if (Math.abs(got - pl.sizeMm) <= tol || !got) break;
    // (bracketed: between the closest under and over, in proportion once, then halving (parts appear and vanish
    // between two sizes: a jump no proportion finds); else in proportion)
    const under = tries.filter((q) => q.got < pl.sizeMm).sort((a, b) => b.fit - a.fit)[0], over = tries.filter((q) => q.got > pl.sizeMm).sort((a, b) => a.fit - b.fit)[0];
    let n = (f * pl.sizeMm) / got;
    if (under && over && under.fit < over.fit) {
      const a = under, b = over;
      n = bracketed++ ? (a.fit + b.fit) / 2 : a.fit + ((pl.sizeMm - a.got) * (b.fit - a.fit)) / (b.got - a.got);
      if (!(n > a.fit + 0.1 * (b.fit - a.fit) && n < b.fit - 0.1 * (b.fit - a.fit))) n = (a.fit + b.fit) / 2;
      if (b.fit - a.fit < 0.004) break;
    }
    const np = plan(n);
    if (tries.some((q) => q.plan.w === np.w && q.plan.h === np.h)) break;   // (the same working copy again)
    f = n;
  }
  return { ...best.r, plan: best.plan, fit: best.fit, tries: tries.map((q) => [+q.fit.toFixed(4), q.got]) };
}

// When what a picture leaves out (keptParts) is worth saying: a twentieth of its area, or a fifth of its parts and at
// least three (etsy_7 at 60 mm: 71 of 117 doodles; etsy_8's script title at 60 mm, 16 of 62), or a part of 1.4 mm² or
// more (a 1.4 mm dot: a drawing's eye, a 3 in "VP3") on a picture of few parts. A busy picture's berries and stem tips
// (etsy_3 at 120 mm: 34 of 240 parts, 1 % of it) and clean logos aren't (a JPEG's 2.8 mm sliver of 0.5 mm² is no part).
export function lostMuch(k) {
  return !!k && k.parts > 0 && (k.share >= 0.05 || (k.lost >= 3 && k.lost >= 0.2 * k.parts) || (k.parts <= 20 && k.bulk >= 1.4));
}

// The Picture tab's copies of a picture (also used by tests/browser/picture_corpus.html, so it sews what the page sews).
// OffscreenCanvas where available (iOS 16.4+), a plain canvas otherwise.
function canvasOf(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}
// bounding box of everything that isn't the border colour (or transparent), so "size" means the design
export function contentBox(bitmap) {
  const S = 256, k = Math.min(1, S / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k)), h = Math.max(1, Math.round(bitmap.height * k));
  const c = canvasOf(w, h), ctx = c.getContext("2d", { willReadFrequently: true });
  // (averaged, not sampled: a logo's 1 px rule fell between the samples, so the colours were learned without it and
  // nothing could say it was left out)
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const border = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  const avg = [0, 1, 2].map((ch) => border.reduce((a, i) => a + d[i * 4 + ch], 0) / border.length);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const ink = d[i + 3] > 127 && Math.abs(d[i] - avg[0]) + Math.abs(d[i + 1] - avg[1]) + Math.abs(d[i + 2] - avg[2]) > 60;
    if (ink) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height };
  const m = 2;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  return { sx: x0 / k, sy: y0 / k, sw: (x1 - x0 + 1) / k, sh: (y1 - y0 + 1) / k };
}

// A picture of several separate things (a sheet of three motifs: a horse, a cup, a jersey) shares one set of thread
// colours and one Size between them: at 6 threads the cup had none left for its greys, and each part came out 30 mm
// wide. The parts are found (ink, as contentBox reads it, joined across gaps under 3 % of the picture; parts under 3 %
// of the ink go with the nearest) and offered under the picture: all together, or one on its own, which is then the
// picture (the others cleared from its cut-out).
export function findParts(b) {
  const S = 256, k = Math.min(1, S / Math.max(b.width, b.height)), w = Math.max(1, Math.round(b.width * k)), h = Math.max(1, Math.round(b.height * k));
  const c = canvasOf(w, h), g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingQuality = "high"; g.drawImage(b, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, border = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  const clear = border.filter((i) => d[i * 4 + 3] <= 127).length > border.length / 2;
  const avg = [0, 1, 2].map((ch) => border.reduce((a, i) => a + d[i * 4 + ch], 0) / border.length);
  const ink = { w, h, data: new Uint8Array(w * h) };
  let all = 0;
  for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 127 && (clear || Math.abs(d[i * 4] - avg[0]) + Math.abs(d[i * 4 + 1] - avg[1]) + Math.abs(d[i * 4 + 2] - avg[2]) > 60)) { ink.data[i] = 1; all++; }
  if (!all) return null;
  // (joined across small gaps: grown by 1.5 % of the picture each way)
  const r = Math.max(1.5, 0.015 * Math.max(w, h)), away = distanceTransform({ w, h, data: ink.data.map((v) => 1 - v) });
  const fat = { w, h, data: new Uint8Array(w * h) };
  for (let i = 0; i < w * h; i++) fat.data[i] = ink.data[i] || away[i] <= r ? 1 : 0;
  const { labels, count } = label(fat);
  if (count < 2) return null;
  const size = new Int32Array(count + 1), x0 = new Int32Array(count + 1).fill(w), x1 = new Int32Array(count + 1).fill(-1), y0 = new Int32Array(count + 1).fill(h), y1 = new Int32Array(count + 1).fill(-1);
  for (let i = 0; i < w * h; i++) {
    const q = labels[i]; if (!q) continue;
    const x = i % w, y = (i - x) / w;
    if (ink.data[i]) size[q]++;
    if (x < x0[q]) x0[q] = x; if (x > x1[q]) x1[q] = x; if (y < y0[q]) y0[q] = y; if (y > y1[q]) y1[q] = y;
  }
  const big = []; for (let q = 1; q <= count; q++) if (size[q] >= 0.03 * all) big.push(q);
  if (big.length < 2 || big.length > 8) return null;
  // (left to right, then top to bottom, in rows a third of the picture high)
  big.sort((a, q) => Math.round((3 * (y0[a] + y1[a])) / 2 / h) - Math.round((3 * (y0[q] + y1[q])) / 2 / h) || x0[a] - x0[q]);
  return { w, h, k, labels, clear, avg, parts: big.map((q) => ({ id: q, box: [x0[q], y0[q], x1[q] + 1, y1[q] + 1] })) };
}
// one part cut out of the whole picture: everything in its box that belongs to another part cleared (to the page's
// colour, or see-through)
export function cutPart(whole, found, n) {
  const { w, k, labels, clear, avg, parts } = found, [bx0, by0, bx1, by1] = parts[n].box, id = parts[n].id;
  const m = 2, X0 = Math.max(0, bx0 - m), Y0 = Math.max(0, by0 - m), X1 = Math.min(found.w, bx1 + m), Y1 = Math.min(found.h, by1 + m);
  const sx = X0 / k, sy = Y0 / k, sw = Math.min(whole.width - sx, (X1 - X0) / k), sh = Math.min(whole.height - sy, (Y1 - Y0) / k);
  const c = canvasOf(Math.max(1, Math.round(sw)), Math.max(1, Math.round(sh))), g = c.getContext("2d");
  g.drawImage(whole, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const mc = canvasOf(X1 - X0, Y1 - Y0), mg = mc.getContext("2d"), md = mg.createImageData(X1 - X0, Y1 - Y0);
  let others = false;
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { const q = labels[y * w + x]; if (q && q !== id) { md.data[((y - Y0) * (X1 - X0) + x - X0) * 4 + 3] = 255; others = true; } }
  if (others) {
    mg.putImageData(md, 0, 0);
    g.globalCompositeOperation = "destination-out"; g.imageSmoothingEnabled = false; g.drawImage(mc, 0, 0, c.width, c.height);
    if (!clear) { g.globalCompositeOperation = "destination-over"; g.fillStyle = `rgb(${avg.map(Math.round).join(",")})`; g.fillRect(0, 0, c.width, c.height); }
    g.globalCompositeOperation = "source-over";
  }
  return c;
}
// the picture's colours are learned from a copy this size (px, longer side) whatever the Size or hoop, so changing
// either never changes the threads
export const LEARN = 800;
export function pictureImage(bitmap, box, w, h) {
  const c = canvasOf(w, h), ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, box.sx, box.sy, box.sw, box.sh, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
// fit the picture's longest side to sizeMm, capped by the hoop
export function workingSize(imgW, imgH, sizeMm, hoop, res = DEFAULTS.res) {
  const maxW = hoop.w - 2 * MARGIN - 2, maxH = hoop.h - 2 * MARGIN - 2;
  let s = sizeMm / Math.max(imgW, imgH);
  s = Math.min(s, maxW / imgW, maxH / imgH);
  return { wMm: imgW * s, hMm: imgH * s, w: Math.max(8, Math.round(imgW * s * res)), h: Math.max(8, Math.round(imgH * s * res)) };
}
