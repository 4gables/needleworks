/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// A traced picture's shapes (core/trace.js) as stitches. Each shape is drawn at `res` px per mm from its smooth outline
// and judged as the picture path judges a part (digitize.js): a stroke, thin and long, is sewn as satin columns along
// its centre lines, with the same tries (cut at sharp corners, serifs kept, strokes grown to the ink, joints made one)
// and the same test that the columns cover it; anything else is a fill, cut on the smooth outline (fill.js
// `fillPolygon`), its pull the picture path's: 0.05 mm under 2 mm across, else PICTURES.pull.
// Why: sewn as fill, a traced letter's strokes swelled by the pull on both sides and small lettering ran together (the
// 2026-11-21 bake-off lost its letter sheet and both wordmarks so); ZigZag fills them too and breaks the density limit
// (docs/zigzag-trace-spec.md section 7).
import { columnNets, distanceTransform, netStitches, plain } from "./digitize.js";
import { fillPolygon } from "./fill.js";
import { COLUMNS, PICTURES, ROWS, letterRecipe } from "./recipes.js";

export const TRACESEW = { res: 10, narrow: 2 };   // px per mm the shapes are judged at; under `narrow` mm the pull is 0.05

function raster(rings, res) {
  const pts = rings.flat(), x0 = Math.min(...pts.map((p) => p[0])) - 0.3, y0 = Math.min(...pts.map((p) => p[1])) - 0.3;
  const w = Math.ceil((Math.max(...pts.map((p) => p[0])) - x0 + 0.3) * res) + 1, h = Math.ceil((Math.max(...pts.map((p) => p[1])) - y0 + 0.3) * res) + 1;
  const mask = { w, h, data: new Uint8Array(w * h) };
  for (let y = 0; y < h; y++) {
    const Y = y0 + (y + 0.5) / res, cut = [];
    for (const l of rings) for (let i = 0; i < l.length; i++) {
      const [ax, ay] = l[i], [bx, by] = l[(i + 1) % l.length];
      if ((ay <= Y) !== (by <= Y)) cut.push(ax + ((Y - ay) * (bx - ax)) / (by - ay));
    }
    cut.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cut.length; k += 2) {
      const a = Math.max(0, Math.ceil((cut[k] - x0) * res - 0.5)), b = Math.min(w - 1, Math.floor((cut[k + 1] - x0) * res - 0.5));
      for (let x = a; x <= b; x++) mask.data[y * w + x] = 1;
    }
  }
  return { mask, x0, y0, w, h };
}

// One shape (`rings`: outline then holes, mm) as { kind: "satin" | "fill", paths (mm) }
export function sewShape(rings, { fabric = "cotton", density = ROWS.solid, angle = 45 } = {}) {
  const res = TRACESEW.res, { mask, x0, y0, w, h } = raster(rings, res), px = [];
  for (let i = 0; i < w * h; i++) if (mask.data[i]) px.push(i);
  const fill = (W) => ({ kind: "fill", W, paths: fillPolygon(rings, { angle, density, pull: W < TRACESEW.narrow ? 0.05 : PICTURES.pull }) });
  if (px.length < 4) return { kind: "fill", W: 0, paths: [] };
  const own = distanceTransform(mask), hw = px.map((i) => own[i]).sort((a, b) => a - b);
  // (its width: twice the 90th percentile of the distance to the edge, as the picture path measures a part)
  const W = (2 * hw[Math.floor(0.9 * (hw.length - 1))]) / res, A = px.length / (res * res);
  const stroke = A / (W * W) >= COLUMNS.long;
  if (W > COLUMNS.wide || W < COLUMNS.min * 0.5 || A < COLUMNS.small || !stroke) return fill(W);
  const toMm = (p) => p.map(([x, y]) => [x0 + (x + 0.5) / res, y0 + (y + 0.5) / res]);
  const ok = (n) => n.length && n.cover >= COLUMNS.cover && plain(n, true);
  let nets = columnNets(px, [], w, h, own, res, toMm, false), cutAt = 0;
  if (COLUMNS.apex && (!ok(nets) || nets.cover < COLUMNS.whole)) { const alt = columnNets(px, [], w, h, own, res, toMm, false, 0, COLUMNS.apex); if (ok(alt) && (!ok(nets) || alt.cover >= nets.cover + COLUMNS.gain)) { nets = alt; cutAt = COLUMNS.apex; } }
  if (COLUMNS.serif && (!ok(nets) || nets.cover < COLUMNS.whole)) { const alt = columnNets(px, [], w, h, own, res, toMm, false, COLUMNS.serif, cutAt || (ok(nets) ? 0 : COLUMNS.apex)); if (ok(alt) && (!ok(nets) || alt.cover >= nets.cover + COLUMNS.gain)) nets = alt; }
  if (COLUMNS.reach && (!ok(nets) || nets.cover < COLUMNS.whole)) { const alt = columnNets(px, [], w, h, own, res, toMm, false, COLUMNS.serif, cutAt, 0, true); if (ok(alt) && (!ok(nets) || alt.cover >= nets.cover + COLUMNS.gain)) nets = alt; }
  if (COLUMNS.knot && ok(nets)) {
    const joints = (n) => { const d = new Map(); for (const x of n) for (const e of x.edges) for (const k of [e.a, e.b]) d.set(k, (d.get(k) || 0) + 1); return [...d.values()].filter((v) => v >= 3).length; };
    const alt = columnNets(px, [], w, h, own, res, toMm, false, COLUMNS.serif, cutAt, COLUMNS.knot);
    if (ok(alt) && joints(alt) < joints(nets) && alt.cover >= nets.cover) nets = alt;
  }
  if (!ok(nets)) return fill(W);
  const sat = letterRecipe(fabric, "auto", false), paths = [];
  for (const net of nets) {
    const first = net.edges[0];
    const p = netStitches(net, first.a, sat);
    if (p.length >= 2) paths.push(p);
  }
  return paths.length ? { kind: "satin", W, paths } : fill(W);
}
