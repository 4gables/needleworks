/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Borders sewn as a line with a shape to it, round a closed outline (frame-local mm, y down): a blanket stitch (an
// appliqué's hand-sewn-looking edge, or a frame line with prongs), scallops and a chain of diamonds. Each is one
// path that ends where it began, so compose can start it anywhere on the outline (`startAt`) and nothing is trimmed.
// The numbers: core/recipes.js BORDER_RUNS.
import { within } from "../core/geom.js";
import { BORDER_RUNS } from "../core/recipes.js";

export const TRIMS = { scallop: "Scallops", diamond: "Diamonds", blanket: "Blanket stitch" };
export const COVERS = { satin: "Satin edge", blanket: "Blanket stitch" };

// the outline by length round it: at(s) = [point, unit normal pointing out of the shape]
function ruler(e) {
  const n = e.length, cum = [0];
  for (let i = 0; i < n; i++) { const a = e[i], b = e[(i + 1) % n]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const T = cum[n];
  // which side is out: a point half a millimetre to the left of the longest side
  let k = 0; for (let i = 1; i < n; i++) if (cum[i + 1] - cum[i] > cum[k + 1] - cum[k]) k = i;
  const a = e[k], b = e[(k + 1) % n], L = cum[k + 1] - cum[k] || 1, mid = [(a[0] + b[0]) / 2 - ((b[1] - a[1]) / L) * 0.5, (a[1] + b[1]) / 2 + ((b[0] - a[0]) / L) * 0.5];
  const sign = within([e], mid) ? -1 : 1;
  const pt = (s) => {
    s = ((s % T) + T) % T;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= s) lo = m; else hi = m - 1; }
    const p = e[lo], q = e[(lo + 1) % n], t = cum[lo + 1] > cum[lo] ? (s - cum[lo]) / (cum[lo + 1] - cum[lo]) : 0;
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  };
  // (the normal from the outline 0.6 mm either side: a corner's turns over that much, not at one point)
  const at = (s) => { const p = pt(s - 0.6), q = pt(s + 0.6), L2 = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [pt(s), [(-(q[1] - p[1]) / L2) * sign, ((q[0] - p[0]) / L2) * sign]]; };
  return { T, at };
}
const off = ([p, n], d) => [p[0] + n[0] * d, p[1] + n[1] * d];

// Blanket stitch: along the outline in stitches `step` long, each sewn three times (a hand blanket stitch is thick
// thread), and at each a prong `bite` mm into the shape and back. On an appliqué the line runs on the tack-down, at
// the fabric's cut edge, and the prongs hold the fabric.
export function blanket(e) {
  const { T, at } = ruler(e), { step, bite } = BORDER_RUNS.blanket, n = Math.max(4, Math.round(T / step)), out = [at(0)[0]];
  for (let i = 0; i < n; i++) {
    const a = at((i * T) / n), b = at(((i + 1) * T) / n)[0];
    out.push(off(a, -bite), a[0], b, a[0], b);
  }
  return [out];
}
// Scallops: half-ovals `rise` mm high standing out from the outline, `unit` mm each, sewn round and then back
// through the same holes (two threads: one reads as a faint line beside a satin name).
export function scallops(e) {
  const { T, at } = ruler(e), { unit, rise, per } = BORDER_RUNS.scallop, n = Math.max(4, Math.round(T / unit)), pts = [];
  for (let i = 0; i < n; i++) for (let k = 0; k < per; k++) pts.push(off(at(((i + k / per) * T) / n), rise * Math.sin((Math.PI * k) / per)));
  return [[...pts, pts[0], ...pts.slice().reverse()]];
}
// Diamonds: two zigzags `half` mm either side of the outline, one the other's mirror, `unit` mm a diamond. An even
// number of them, so each zigzag closes on itself.
export function diamonds(e) {
  const { T, at } = ruler(e), { unit, half } = BORDER_RUNS.diamond, n = Math.max(4, Math.round(T / unit)), a = [], b = [];
  for (let i = 0; i < 2 * n; i++) { const q = at((i * T) / (2 * n)); a.push(i % 2 ? off(q, half) : q[0]); b.push(i % 2 ? off(q, -half) : q[0]); }
  return [[...a, a[0], ...b.slice(1), b[0]]];
}
export const trimmed = (e, trim) => (trim === "diamond" ? diamonds : trim === "blanket" ? blanket : scallops)(e);
