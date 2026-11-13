/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// A piece's own stitch settings (Z1a; docs/design-tab.md "Stitch settings"): plain data on the piece, every field
// optional, each unset field meaning today's value for the design's fabric and thread weight (core/recipes.js). The
// record is grouped by the kind of stitches it changes, so later rounds add groups or fields without reshaping it:
//   p.stitches = { fill: { angle, spacing, length, pull, underlay } }   (satin settings, start and end points, trim and
//   pause after: their own keys beside `fill`)
// Every number is clamped to recipes.js `FILL_SET` wherever it is read (a saved file, a paste, an agent's design),
// so no setting can break a rule of AGENTS.md.
import { FILL_SET, UNDERLAYS } from "../core/recipes.js";
import { FILL } from "../core/fill.js";

const FIELDS = Object.keys(FILL_SET);
// a number in [lo, hi], to 0.01 (angles to 0.1°); null where it isn't one
const clamp = (v, [lo, hi]) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100 : null);
// an angle as one fill: 30° and 210° sew alike, kept in (-90, 90]
export function angleOf(a) {
  if (typeof a !== "number" || !Number.isFinite(a)) return null;
  let t = Math.round((((a % 180) + 180) % 180) * 10) / 10;
  if (t > 90) t -= 180;
  return t === -90 ? 90 : t;
}
// a fill record checked: only fields that are set and make sense, each clamped; null when nothing is left
function cleanFill(f) {
  if (!f || typeof f !== "object" || Array.isArray(f)) return null;
  const out = {};
  for (const k of FIELDS) {
    const v = k === "angle" ? angleOf(f[k]) : clamp(f[k], FILL_SET[k]);
    if (v != null) out[k] = v;
  }
  if (UNDERLAYS.includes(f.underlay) && f.underlay !== "both") out.underlay = f.underlay;
  return Object.keys(out).length ? out : null;
}
// a piece's `stitches` checked (`cleanPiece`): undefined when nothing in it is set
export function cleanStitches(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return undefined;
  const fill = cleanFill(s.fill);
  return fill ? { fill } : undefined;
}
// the piece's own fill settings, checked, or null (a piece with none sews as it always did)
export const ownFill = (p) => cleanFill(p?.stitches?.fill);
// Kinds of piece whose stitches include a fill of a drawn shape: a patch frame and a filled motif. (Not the motif
// either side of lettering, nor appliqué: its fabric is the fill.)
export const hasFill = (p) => (p?.kind === "frame" && p.border === "patch") || (p?.kind === "motif" && (p.style || "fill") === "fill");

// The fill options a builder passes to `fillPolygon`: `base` (today's, by fabric and thread weight) with the piece's
// own settings on top. With none set, `base` itself, unchanged (the files stay byte for byte as they were).
// Rows of a fill with settings lie on one grid for the whole design (ZigZag's tatami grid, after Ink/Stitch): row k
// at (k + 0.5) x spacing across the rows from the hoop's centre, so two such fills at one angle and spacing, side
// by side, have rows that line up. The piece is built in its own coordinates and then turned (`rot`), mirrored
// (`flip`) and moved (`x`, `y`); across the rows, its own coordinate and the design's differ only by the move along
// the design's row normal, whichever way it is mirrored, so the grid in its coordinates is that move's remainder.
// Not for a blend's layers (`share`: spaced unevenly) nor rings.
export function fillOpts(p, base) {
  const f = hasFill(p) && ownFill(p);
  if (!f) return base;
  const o = { ...base };
  if (f.angle != null) o.angle = f.angle;
  if (f.spacing != null) o.density = f.spacing;
  if (f.length != null) o.stitch = f.length;
  if (f.pull != null) o.pull = f.pull;
  if (f.underlay) o.underlay = { rows: "rows", edge: "edge", none: false }[f.underlay];
  if (!o.share && o.pattern !== "contour") o.grid = gridAt(p, o.angle ?? FILL.angle, o.density);
  return o;
}
// where the shared grid lies in a piece's own coordinates (mm across its rows, 0 <= g < spacing, to 0.001 mm)
export function gridAt(p, angle, spacing) {
  const A = (((p.rot || 0) + (p.flip ? -angle : angle)) * Math.PI) / 180, across = -(p.x || 0) * -Math.sin(A) - (p.y || 0) * Math.cos(A);
  return Math.round((((across % spacing) + spacing) % spacing) * 1000) / 1000;
}
// one setting changed (`v` null: back to unset), as a new record: copies of a piece may share the old one
export function withSetting(p, group, k, v) {
  const g = { ...(p.stitches?.[group] || {}) };
  if (v == null) delete g[k]; else g[k] = v;
  const s = { ...(p.stitches || {}), [group]: g };
  if (!Object.keys(g).length) delete s[group];
  return Object.keys(s).length ? s : undefined;
}
