/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Frame shapes: the outlines a frame can have (circle, oval, heart, scallop, bookmark...), their smallest size, the
// ribbon hole, and the part of an in-the-hoop or zipper frame that takes lettering. (Part of pieces.js until 2026-11.)
import { bounds, filletPolygon } from "../core/geom.js";

// ---------- frames ----------
export const SHAPES = {
  circle: { name: "Circle", path: (w, h) => ellipse(w / 2, w / 2) },
  oval: { name: "Oval", path: (w, h) => ellipse(w / 2, h / 2) },
  square: { name: "Rounded square", path: (w, h) => filletPolygon([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], Math.min(w, h) * 0.12, 10) },
  diamond: { name: "Diamond", path: (w, h) => filletPolygon([[0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0]], Math.min(w, h) * 0.05, 8) },
  heart: { name: "Heart", path: heart },
  scallop: { name: "Scallop", path: (w, h) => scallop(w / 2, h / 2) },
  // a bookmark's outline: its narrow end's corners cut off (9 mm on a 50 mm bookmark) and every corner rounded 3 mm;
  // the top end when it's tall, the left end when it lies across (the starter: easier to read, Turn hoop does the rest)
  bookmark: { name: "Bookmark", path: (w, h) => {
    const n = Math.min(w, h), c = Math.min(n * 0.18, Math.max(w, h) * 0.2), r = Math.min(3, n * 0.06), x = w / 2, y = h / 2;
    return w > h ? filletPolygon([[-x + c, -y], [x, -y], [x, y], [-x + c, y], [-x, y - c], [-x, -y + c]], r, 10)
      : filletPolygon([[-x + c, -y], [x - c, -y], [x, -y + c], [x, y], [-x, y], [-x, -y + c]], r, 10); } },
};
// A ribbon hole at the narrow end (`eyelet` on an in-the-hoop frame: a bookmark, a luggage tag): a 4.2 mm ring of
// 2.2 mm satin 13 mm in from the top edge (from the left edge on a frame wider than tall), sewn through every layer
// with the border; cut out after Fray Check. Frame-local mm.
export const EYE = { r: 4.2, w: 2.2, down: 13 };
export const eyeWide = (f) => f.w > frameH(f);
export const eyeAt = (f) => {
  const [x0, y0] = bounds(shapeOf(f).path(f.w, f.h));
  return eyeWide(f) ? [x0 + Math.min(EYE.down, f.w * 0.2), 0] : [0, y0 + Math.min(EYE.down, frameH(f) * 0.2)];
};
// how far past the ring's centre what's sewn on the frame keeps clear
const EYE_CLEAR = EYE.r + EYE.w / 2 + 2;
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
  // tip and the placement and tack lines showed past it (and the edge walk poked out 2 mm). It's rounded to the
  // circle that fits the point (the border's inside half, 2.2 mm since 2026-11-06, so the inside edge doesn't fold:
  // at 1.8 it folded past the tip by 0.8 mm), then stretched back to h.
  const R = 2.2, low = pts.filter(([, y]) => y > 0);
  const gap = (yc) => Math.min(...low.map(([x, y]) => Math.hypot(x, y - yc)));
  let lo = 0, hi = h / 2;   // lowest centre whose circle fits: as the centre rises, the nearest point gets further
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (gap(m) < R) hi = m; else lo = m; }
  const yc = lo, touch = low.reduce((a, q) => (Math.hypot(q[0], q[1] - yc) < Math.hypot(a[0], a[1] - yc) ? q : a));
  const xt = Math.min(R, Math.abs(touch[0]));   // (between the two points where the circle touches the sides)
  const cut = (q) => q[1] > yc && Math.abs(q[0]) <= xt, i0 = pts.findIndex(cut), i1 = pts.length - 1 - [...pts].reverse().findIndex(cut);
  if (i0 >= 0) {   // (the curve runs down the right side to the point, then up the left)
    // (angles kept in -90°..270° so the arc runs round the bottom, 90°: where the points beside it sit above the
    // centre, atan2's wrap at 180° drew it over the top, a notch at the point of a 100 x 84 heart)
    const ang = (q) => { const a = Math.atan2(q[1] - yc, q[0]); return a < -Math.PI / 2 ? a + 2 * Math.PI : a; };
    const a0 = ang(pts[i0 - 1]), a1 = ang(pts[i1 + 1]);
    const arc = Array.from({ length: 11 }, (_, k) => { const a = a0 + ((a1 - a0) * (k + 1)) / 12; return [R * Math.cos(a), yc + R * Math.sin(a)]; });
    pts = [...pts.slice(0, i0), ...arc, ...pts.slice(i1 + 1)];
  }
  return fitBox(pts, w, h);
}
// soft waves, not cusps: a satin border can't turn a sharp inside corner cleanly. Its valleys are SCALLOP_IN of its
// size (0.94 - 0.06 over 0.94 + 0.06, once fitted to its box).
export const SCALLOP_IN = 0.88;
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
// (every outline at least MIN across each way, as a saved design is loaded: a frame 0 mm wide, which Make the frames
// fit the hoop once asked for, drew NaN corners and the satin border's edge walk threw on a ganged key fob)
const atLeast = (v) => (v >= MIN ? v : MIN);
export const shapeOf = (p) => { const s = SHAPES[p.shape] || SHAPES.circle; return { name: s.name, path: (w, h) => s.path(atLeast(w), atLeast(h)) }; };
// a circle frame is w across both ways
export const frameH = (f) => (f.shape === "circle" ? f.w : f.h);
export const hasEye = (f) => !!f.eyelet && f.border === "ith";
// a zipper pouch's zipper line (frame-relative y, from the outline's top); its tack lines run 5 mm and its topstitch
// 7 mm either side
export const zipY = (f, top) => top + Math.max(14, f.h * 0.2);
// The part of frame f where what's sewn on it goes, as [top, bottom] in mm (hoop y): a zipper pouch's front below
// its topstitch (the zipper band above is no place for a monogram: one fitted there sewed across the zipper), any
// other frame the whole height.
// the same across: [left, right] (hoop x), past the ribbon hole of a frame lying across
export function frontAcross(f) {
  const [x0, , x1] = bounds(shapeOf(f).path(f.w, f.h));
  return hasEye(f) && eyeWide(f) ? [f.x + eyeAt(f)[0] + EYE_CLEAR, f.x + x1] : [f.x + x0, f.x + x1];
}
export function frontPanel(f) {
  const [, top, , bot] = bounds(shapeOf(f).path(f.w, f.h));
  return f.border === "zip" ? [f.y + zipY(f, top) + 7, f.y + bot] : hasEye(f) && !eyeWide(f) ? [f.y + eyeAt(f)[1] + EYE_CLEAR, f.y + bot] : [f.y + top, f.y + bot];
}
export const BORDERS = { line: "Thin line", bold: "Bold line", fancy: "Decorative line", satin: "Satin border", patch: "Filled patch", applique: "Appliqué", ith: "In the hoop (two-sided)", zip: "Zipper pouch (in the hoop)" };
// (as small as Fit to hoop makes things, so a saved design opens as it was: a fitted 6.5 mm monogram reopened at 10;
// the editor warns about sizes too small to stitch)
export const MIN = 0.5;
