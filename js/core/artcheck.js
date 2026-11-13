/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// What in a picture will sew well and what won't, measured on the picture at the size it is sewn (PX6, docs/pictures.md
// "The check of a picture"). The numbers are recipes.js `ART`, the digitizer's own rules; the words are words.js
// `artSaid`. Two halves, both run in the picture worker:
// - `artPicture`: once per picture and colour count, on the copy the colours are learned from (800 px): how many
//   colours it really has, how much of it is soft colour blends, whether its background is one plain colour.
// - `artShapes`: on the labelled working copy (`res` px per mm, so sizes are sewn mm): details too small, lines too
//   thin, lettering too small. Every finding carries `spots` (fractions of the learned copy, as keptParts' are, for
//   the page to ring on the picture) and, where a bigger Size would mend it, `need`: how many times bigger.
// Measures only: nothing here changes what is sewn.
import { ART } from "./recipes.js";
import { pixels } from "./palette.js";
import { label } from "./raster.js";

let SPOTS = 12;
export const allSpots = (on) => { SPOTS = on ? 1e9 : 12; };   // (tests: every spot, to look at)
const lab3 = (L, i) => [L[i * 3], L[i * 3 + 1], L[i * 3 + 2]];
const dE = (L, i, j) => Math.hypot(L[i * 3] - L[j * 3], L[i * 3 + 1] - L[j * 3 + 1], L[i * 3 + 2] - L[j * 3 + 2]);
// Greedy colour groups: Lab bins (5 units) by count, each joining the first group within `r` (plain Lab distance) of
// its seed. Returns the groups' pixel counts, biggest first.
function groups(L, idx, r) {
  const bins = new Map();
  for (const i of idx) {
    const k = `${Math.round(L[i * 3] / 5)},${Math.round(L[i * 3 + 1] / 5)},${Math.round(L[i * 3 + 2] / 5)}`, b = bins.get(k);
    if (b) b.n++; else bins.set(k, { n: 1, c: lab3(L, i) });
  }
  const seeds = [];
  for (const b of [...bins.values()].sort((x, y) => y.n - x.n)) {
    const s = seeds.find((q) => Math.hypot(q.c[0] - b.c[0], q.c[1] - b.c[1], q.c[2] - b.c[2]) <= r);
    if (s) s.n += b.n; else seeds.push({ c: b.c, n: b.n });
  }
  return seeds.map((s) => s.n).sort((a, b) => b - a);
}
// the biggest components of a mask, as boxes (fractions of the copy), at least `least` px each
function boxes(m, least = 1) {
  const { w, h } = m, { labels: cl, count } = label(m), x0 = new Int32Array(count + 1).fill(w), x1 = new Int32Array(count + 1).fill(-1), y0 = new Int32Array(count + 1).fill(h), y1 = new Int32Array(count + 1).fill(-1), size = new Int32Array(count + 1);
  for (let i = 0; i < w * h; i++) { const c = cl[i]; if (!c) continue; const x = i % w, y = (i - x) / w; size[c]++; if (x < x0[c]) x0[c] = x; if (x > x1[c]) x1[c] = x; if (y < y0[c]) y0[c] = y; if (y > y1[c]) y1[c] = y; }
  const ids = []; for (let c = 1; c <= count; c++) if (size[c] >= least) ids.push(c);
  return ids.sort((a, b) => size[b] - size[a]).slice(0, SPOTS).map((c) => [x0[c] / w, y0[c] / h, (x1[c] + 1) / w, (y1[c] + 1) / h]);
}

// The picture as a whole, on its learned copy `img` (ImageData) labelled with its colours (`full`: labelWith's
// { labels, colors }).
//   colours: how many colours it is drawn in: flat pixels (under 4 ΔE to the four next to them, so no edge blends) in
//            groups 12 apart, each 1 % of them or more. Clip art reads its own count; a gradient or a photo many.
//   blend:   the share of the ink in smooth ramps: across 17 px (about 2 % of the picture) the colour moves 3-50 with no
//            one step over a third of it and no back and forth (a gradient, soft shading; an edge is one big step,
//            photo noise goes back and forth). `blendSpots`: where.
//   edge:    the share of the picture's border (1 % deep) held by its main colour; `busy` under ART.page (not
//            see-through, no frame). `edgeIds`: the sewn colours that hold 10 % of the border or more (the background
//            the page couldn't tell from the design), `edgeSpots` where they touch the border.
export function artPicture(img, full) {
  const P = pixels(img), { w, h, n, lab: L } = P, labels = full.labels;
  const bg = new Set(full.colors.filter((c) => c.background).map((c) => c.id));
  const ink = new Uint8Array(n);
  let inked = 0;
  for (let i = 0; i < n; i++) if (labels[i] >= 0 && !bg.has(labels[i])) { ink[i] = 1; inked++; }
  // colours
  const flat = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (!ink[i] || labels[i - 1] < 0 || labels[i + 1] < 0 || labels[i - w] < 0 || labels[i + w] < 0) continue;
    if (dE(L, i, i - 1) < 4 && dE(L, i, i + 1) < 4 && dE(L, i, i - w) < 4 && dE(L, i, i + w) < 4) flat.push(i);
  }
  const gs = groups(L, flat, 12), colours = gs.filter((k) => k >= 0.01 * flat.length).length;
  // blends
  const R = 8, ramp = { w, h, data: new Uint8Array(n) };
  let blends = 0;
  const isRamp = (i, s) => {
    const a = i - R * s, b = i + R * s, span = dE(L, a, b);
    if (span < 3 || span > 50) return false;
    let most = 0, sum = 0;
    for (let k = -R; k < R; k++) { const d = dE(L, i + k * s, i + (k + 1) * s); sum += d; if (d > most) most = d; if (!ink[i + k * s] && labels[i + k * s] < 0) return false; }
    return most <= span / 3 && sum <= 1.5 * span;
  };
  for (let y = R; y < h - R; y++) for (let x = R; x < w - R; x++) {
    const i = y * w + x; if (!ink[i]) continue;
    if (isRamp(i, 1) || isRamp(i, w)) { ramp.data[i] = 1; blends++; }
  }
  const blend = inked ? blends / inked : 0;
  // the border
  const d = Math.max(2, Math.round(0.01 * Math.max(w, h))), border = [];
  let clear = 0, all = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= d && x < w - d && y >= d && y < h - d) continue;
    const i = y * w + x; all++;
    if (labels[i] < 0) { clear++; continue; }
    border.push(i);
  }
  const eg = groups(L, border, 10), edge = border.length ? eg[0] / border.length : 1;
  const seeThrough = clear >= 0.5 * all, busy = !seeThrough && !full.frame && edge < ART.page;
  const held = new Map(); for (const i of border) if (!bg.has(labels[i])) held.set(labels[i], (held.get(labels[i]) || 0) + 1);
  const edgeIds = busy ? [...held].filter(([, k]) => k >= 0.1 * border.length).map(([id]) => id) : [];
  let edgeSpots = [];
  if (edgeIds.length) {
    const m = { w, h, data: new Uint8Array(n) };
    for (let i = 0; i < n; i++) if (edgeIds.includes(labels[i])) m.data[i] = 1;
    const { labels: cl, count } = label(m), touch = new Uint8Array(count + 1);
    for (const i of border) if (cl[i]) touch[cl[i]] = 1;
    for (let i = 0; i < n; i++) if (cl[i] && !touch[cl[i]]) m.data[i] = 0;
    edgeSpots = boxes(m, 0.002 * n);
  }
  return { colours, blend: +blend.toFixed(3), blendSpots: blend >= ART.blend ? boxes(ramp, 0.004 * inked) : [], edge: +edge.toFixed(3), busy, seeThrough, edgeIds, edgeSpots };
}

// The shapes as sewn: `a` = labelWith's { w, h, labels, colors } on the working copy, `res` px per mm, `crop` the part
// of the learned copy it shows (fractions), `skip` colour ids left out.
//   small: separate pieces of a colour under ART.dot mm² and ART.detail mm across (0.5 mm² and up, as keptParts counts a part: smaller is a
//          blend), not letters.
//   thin:  lines narrower than ART.line along 3 mm or more of their length (ridges of each colour's own distance to
//          its edge, so an outline joined to a filled shape counts too), not in lettering.
//   text:  rows of three or more letter-like pieces of one colour (each 0.8-40 mm tall, at most 1.6 times as wide,
//          a stroke at most 0.45 of its height, 12-75 % of its box inked; neighbours overlapping half the smaller
//          height, under 1.8 times taller, apart by under 0.8 of the taller; not all one size, as dots in a row are;
//          strokes within 30 % of each other's width; seven in ten on one baseline).
//          `mm`: the row's middle letter height, the smallest row's said.
// Each: { n, spots, need } (need: how many times bigger the Size must be for three in four of them to pass).
export function artShapes(a, res, crop = [0, 0, 1, 1], skip = []) {
  const { w, h, labels } = a, n = w * h, out = new Set([...a.colors.filter((c) => c.background).map((c) => c.id), ...skip]);
  const lab = (i) => (labels[i] >= 0 && !out.has(labels[i]) ? labels[i] : -1);
  const fx = (x) => crop[0] + (x / w) * (crop[2] - crop[0]), fy = (y) => crop[1] + (y / h) * (crop[3] - crop[1]);
  const spot = (x0, y0, x1, y1) => [fx(x0), fy(y0), fx(x1 + 1), fy(y1 + 1)];
  // each colour's distance to its own edge (chamfer 3-4: 3 a step across, 4 diagonal)
  const D = new Int32Array(n), BIG = 1 << 28;
  for (let i = 0; i < n; i++) D[i] = lab(i) < 0 ? 0 : BIG;
  const same = (i, j) => labels[i] === labels[j];
  // (a neighbour of another colour, or the picture's edge, is the edge: 3 across, 4 diagonally)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!D[i]) continue;
    let v = D[i];
    const look = (j, c) => { const t = same(i, j) ? D[j] + c : c; if (t < v) v = t; };
    if (x > 0) look(i - 1, 3); else v = Math.min(v, 3);
    if (y > 0) { look(i - w, 3); if (x > 0) look(i - w - 1, 4); if (x < w - 1) look(i - w + 1, 4); } else v = Math.min(v, 3);
    D[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!D[i]) continue;
    let v = D[i];
    const look = (j, c) => { const t = same(i, j) ? D[j] + c : c; if (t < v) v = t; };
    if (x < w - 1) look(i + 1, 3); else v = Math.min(v, 3);
    if (y < h - 1) { look(i + w, 3); if (x < w - 1) look(i + w + 1, 4); if (x > 0) look(i + w - 1, 4); } else v = Math.min(v, 3);
    D[i] = v;
  }
  // (D 3 = a pixel on the edge: a line k px wide has D about 3 * k / 2 down its middle)
  const widthMm = (d) => Math.max(1, (2 * d) / 3 - 0.5) / res;
  // pieces: 8-connected runs of one colour
  const cl = new Int32Array(n), st = [], P = [];
  for (let s = 0; s < n; s++) {
    if (cl[s] || lab(s) < 0) continue;
    const id = P.length + 1, p = { id, col: labels[s], area: 0, x0: w, x1: -1, y0: h, y1: -1, d: 0 };
    P.push(p); cl[s] = id; st.push(s);
    while (st.length) {
      const i = st.pop(), x = i % w, y = (i - x) / w;
      p.area++; if (x < p.x0) p.x0 = x; if (x > p.x1) p.x1 = x; if (y < p.y0) p.y0 = y; if (y > p.y1) p.y1 = y; if (D[i] > p.d) p.d = D[i];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = Y * w + X; if (!cl[j] && labels[j] === p.col) { cl[j] = id; st.push(j); }
      }
    }
  }
  const mm2 = (p) => p.area / (res * res), wd = (p) => (p.x1 - p.x0 + 1) / res, ht = (p) => (p.y1 - p.y0 + 1) / res;
  // lettering
  const letter = (p) => { const H = ht(p), W = wd(p), fill = p.area / ((p.x1 - p.x0 + 1) * (p.y1 - p.y0 + 1)); return H >= 0.8 && H <= 40 && W <= 1.6 * H && fill >= 0.12 && fill <= 0.75 && widthMm(p.d) <= 0.45 * H; };
  const L = P.filter(letter).sort((p, q) => p.x0 - q.x0), up = new Map(L.map((p) => [p.id, p.id]));
  const find = (k) => { while (up.get(k) !== k) { up.set(k, up.get(up.get(k))); k = up.get(k); } return k; };
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const p = L[i], q = L[j], hp = ht(p), hq = ht(q), big = Math.max(hp, hq);
    if ((q.x0 - p.x1 - 1) / res > 0.8 * big) continue;
    if (p.col !== q.col || big > 1.8 * Math.min(hp, hq)) continue;
    const over = (Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0) + 1) / res;
    if (over >= 0.5 * Math.min(hp, hq)) up.set(find(p.id), find(q.id));
  }
  const rows = new Map();
  for (const p of L) { const r = find(p.id); if (!rows.has(r)) rows.set(r, []); rows.get(r).push(p); }
  const med = (v) => { const s = [...v].sort((x, y) => x - y); return s[s.length >> 1]; };
  const spread = (v) => { const m = v.reduce((s, x) => s + x, 0) / v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) / m; };
  const text = [], inText = new Set();
  for (const g of rows.values()) {
    if (g.length < 3) continue;
    const H = med(g.map(ht)), x0 = Math.min(...g.map((p) => p.x0)), x1 = Math.max(...g.map((p) => p.x1));
    if ((x1 - x0 + 1) / res < 2.5 * H || (spread(g.map(wd)) < 0.08 && spread(g.map(mm2)) < 0.12)) continue;
    // (on one baseline: seven in ten of them end within 0.15 of the height of the middle one's foot; a cluster of
    // florets or dots doesn't)
    // (one pen: a font's strokes are much of a width, a bunch of flowers' are not)
    if (spread(g.map((p) => widthMm(p.d))) > 0.3) continue;
    const foot = med(g.map((p) => p.y1));
    if (g.filter((p) => Math.abs(p.y1 - foot) / res <= 0.15 * H).length < 0.7 * g.length) continue;
    const pen = med(g.map((p) => widthMm(p.d))), row = { mm: H, col: g[0].col, box: [x0, Math.min(...g.map((p) => p.y0)), x1, Math.max(...g.map((p) => p.y1))] };
    // (letters joined to each other, a word's dot or comma: what lies in the line beside them is lettering too)
    for (let more = true; more;) {
      more = false;
      for (const p of P) {
        if (inText.has(p.id) || g.includes(p) || p.col !== row.col || ht(p) > 1.8 * H || widthMm(p.d) > 1.6 * pen) continue;
        const gap = Math.max(row.box[0] - p.x1, p.x0 - row.box[2]) / res, over = (Math.min(p.y1, row.box[3]) - Math.max(p.y0, row.box[1]) + 1) / res;
        if (gap <= 0.8 * H && over >= 0.5 * Math.min(ht(p), H)) { g.push(p); row.box[0] = Math.min(row.box[0], p.x0); row.box[2] = Math.max(row.box[2], p.x1); more = true; }
      }
    }
    text.push(row);
    for (const p of g) inText.add(p.id);
  }
  const inRow = (x, y) => text.some((t) => x >= t.box[0] - 2 && x <= t.box[2] + 2 && y >= t.box[1] - 2 && y <= t.box[3] + 2);
  // small details
  const small = P.filter((p) => !inText.has(p.id) && mm2(p) >= 0.5 && mm2(p) < ART.dot && Math.max(wd(p), ht(p)) < ART.detail);
  const across = small.map((p) => Math.max(wd(p), ht(p))).sort((x, y) => x - y);
  // thin lines: ridge pixels (a local top of D) under ART.line wide, joined where they touch (a pixel apart)
  const ridge = { w, h, data: new Uint8Array(n) }, wide = new Float64Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, v = D[i]; if (!v || cl[i] === 0 || inText.has(cl[i])) continue;
    // (a top across the line: along one axis, both ways, the colour's edge comes within the line's own width with
    // nothing deeper on the way. A stair-step on a slanted edge has the deeper inside on one side; a straight edge
    // reaches no edge along it)
    const r = Math.ceil(v / 3) + 1;
    const falls = (dx, dy) => { for (let k = 1, X = x, Y = y; k <= r; k++) { X += dx; Y += dy; if (X < 0 || Y < 0 || X >= w || Y >= h) return true; const j = Y * w + X; if (!same(i, j)) return true; if (D[j] > v) return false; } return false; };
    if (!((falls(1, 0) && falls(-1, 0)) || (falls(0, 1) && falls(0, -1)))) continue;
    if (widthMm(v) < ART.line) { ridge.data[i] = 1; wide[i] = widthMm(v); }
  }
  const grown = { w, h, data: ridge.data.slice() };
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (ridge.data[y * w + x]) for (const j of [y * w + x - 1, y * w + x + 1, (y - 1) * w + x, (y + 1) * w + x]) if (lab(j) >= 0) grown.data[j] = 1;
  const { labels: rl, count } = label(grown), len = new Float64Array(count + 1), sum = new Float64Array(count + 1);
  const rx0 = new Int32Array(count + 1).fill(w), rx1 = new Int32Array(count + 1).fill(-1), ry0 = new Int32Array(count + 1).fill(h), ry1 = new Int32Array(count + 1).fill(-1);
  for (let i = 0; i < n; i++) {
    const c = rl[i]; if (!c) continue;
    const x = i % w, y = (i - x) / w;
    if (x < rx0[c]) rx0[c] = x; if (x > rx1[c]) rx1[c] = x; if (y < ry0[c]) ry0[c] = y; if (y > ry1[c]) ry1[c] = y;
    if (ridge.data[i]) { len[c]++; sum[c] += wide[i]; }
  }
  const thin = [];
  for (let c = 1; c <= count; c++) {
    const L0 = len[c] / res, Lb = Math.hypot(rx1[c] - rx0[c] + 1, ry1[c] - ry0[c] + 1) / res;
    if (Math.min(L0, Lb) < 3 || inRow((rx0[c] + rx1[c]) / 2, (ry0[c] + ry1[c]) / 2)) continue;
    thin.push({ c, mm: Lb, wide: sum[c] / len[c] });
  }
  thin.sort((p, q) => q.mm - p.mm);
  const need = (v, aim) => (v.length ? +Math.min(9, aim / v[Math.floor(0.25 * (v.length - 1))]).toFixed(3) : 0);
  const thinW = thin.map((t) => t.wide).sort((x, y) => x - y);
  text.sort((p, q) => p.mm - q.mm);
  return {
    small: { n: small.length, spots: small.sort((p, q) => q.area - p.area).slice(0, SPOTS).map((p) => spot(p.x0, p.y0, p.x1, p.y1)), need: need(across, ART.detail) },
    // (need: the thinnest quarter of them reaching ART.line; a line's width is the mean of its ridge)
    thin: { n: thin.length, spots: thin.slice(0, SPOTS).map((t) => spot(rx0[t.c], ry0[t.c], rx1[t.c], ry1[t.c])), need: need(thinW, ART.line) },
    text: { n: text.length, mm: text.length ? +text[0].mm.toFixed(1) : 0, small: text.filter((t) => t.mm < ART.text).length,
      spots: text.filter((t) => t.mm < ART.text).slice(0, SPOTS).map((t) => spot(...t.box)), need: text.length && text[0].mm < ART.text ? +(ART.text / text[0].mm).toFixed(3) : 0 },
  };
}
