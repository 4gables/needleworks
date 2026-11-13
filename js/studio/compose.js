/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Putting a design together: every piece's stages in sewing order (compose), quilting and carved patch fills
// round the other pieces, several in-the-hoop projects sewn stage by stage together (gang), two hoopings, and the
// step words tidied. The pieces' own stitches are pieces.js. (Part of pieces.js until 2026-11.)
import { Design } from "../core/design.js";
import { MARGIN } from "../core/machines.js";
import { back, bounds, circle, enter, moveCost, run } from "../core/geom.js";
import { distanceTransform, order } from "../core/raster.js";
import { LINED, contours, quiltOf } from "./quilt.js";
import { EYE, eyeAt, hasEye, shapeOf } from "./shapes.js";
import { FABRICS } from "./fabrics.js";
import { ownFill } from "./settings.js";
import { QUILTED, along, ascii, cloud, cut, fittedSizes, inset, inside, insideLoops, label, moved, movingNow, near, onOutline, own, patchFill, pick, pieceBounds, pieceStages, pieceStitches, placed, placer, plainBorder, recent, seamAt, sewAs, sewWith, sewing, sewn, startAt, wt } from "./pieces.js";

export function quiltDone(key, paths) { quilted.set(key, paths); if (quilted.size > 12) quilted.delete(quilted.keys().next().value); }
const quilted = new Map(), lastQuilt = new Map();   // (lastQuilt: per frame, reused while a piece is being dragged)
// `later`: a list to put the quilting on when it isn't worked out yet, for a worker to do (`quiltOf`, then `quiltDone`):
// the quilting last sewn in this frame stands in meanwhile, as while dragging (a 15-piece design with a stippled frame
// held the page 4-5 s after each drop, letter typed or font change)
function withQuilt(p, stages, others, dragging = false, later = null, empty = null) {
  // around every other piece's stitches, and inside none of their filled shapes (an appliqué's fabric)
  // (not a shape the frame itself sits on, a patch or appliqué under the whole frame: that would leave no room)
  const edge = shapeOf(p).path(p.w, p.h).map(placer(p)), key0 = JSON.stringify(p), frame = key0;
  const under = (loops) => edge.filter((q) => insideLoops(loops, q)).length > edge.length / 2;
  // (and round the frame's own ribbon hole, which sews later in its last stage)
  const ring = hasEye(p) ? [circle(placer(p)(eyeAt(p)), EYE.r + EYE.w / 2, 48)] : [];
  const obstacles = [...others.flatMap((s) => s.paths), ...ring], solids = others.filter((s) => s.solid?.length && !under(s.solid)).map((s) => s.solid);
  // keyed on every obstacle point: moving a middle piece reused the old quilting, sewn through it
  let h = obstacles.length;
  for (const o of [...obstacles, ...solids.flat()]) for (const [x, y] of o) h = (Math.imul(h ^ Math.round(x * 10), 16777619) ^ Math.round(y * 10)) | 0;
  const key = JSON.stringify([p, h]), covered = true;
  if (!quilted.has(key) && !(dragging && lastQuilt.has(frame))) {
    const job = { key, kind: p.quilt, edge, obstacles, opts: { inset: p.border === "line" || p.border === "bold" ? 3 : 4.5, solids,
      // (straight lines run to the frame line where a border covers it, else to 3 mm inside it; an appliqué's or an in-the-hoop
      // front's tack-down leaves the needle on the frame line a third round: they start from there)
      ...(LINED(p.quilt) ? { cover: covered, bound: covered ? edge : inset(shapeOf(p).path(p.w, p.h), 3).map(placer(p)), from: covered && (p.border === "applique" || p.border === "ith") ? seamAt(edge, 1 / 3)[0] : null,
        lap: p.border === "fancy" && p.trim !== "blanket" } : {}) } };
    if (later) later.push(job); else quiltDone(key, quiltOf(job));
  }
  const paths = quilted.get(key) || lastQuilt.get(frame) || [];
  if (!later || quilted.has(key)) { lastQuilt.set(frame, paths); if (lastQuilt.size > 12) lastQuilt.delete(lastQuilt.keys().next().value); }
  // (worked out and nothing fits: said, `empty`; a frame quilted with no room left in it sewed no quilting, said nowhere)
  if (!paths.length) { if (quilted.has(key)) empty?.push(p.id); return stages; }
  const q = { color: p.color, paths, sews: `Quilts the ${shapeOf(p).name.toLowerCase()} (${p.quilt}).`, label: label(p) };
  // (an in-the-hoop frame lists its batting already; a quilt block's Have ready had none)
  if (p.border !== "ith") Object.assign(q, { sandwich: true,
    before: "A quilt sandwich big enough to hoop: top fabric, thin batting and backing (too thick to hoop: float it on hooped tear-away stabilizer with basting spray).",
    after: "Take it out of the hoop, snip any loose threads and tear away the stabilizer if you floated it on some." });
  const at = stages.findIndex((s) => s.last);
  if (at >= 0) return [...stages.slice(0, at), q, ...stages.slice(at)];
  // the border sews after the quilting (a quilter's order) and covers where it starts and stops: each end of the
  // quilting near the frame runs on to the frame line and the border starts where it stops, one block with no trim
  // (it was the border, a trim and a 7 mm jump into the quilting, its first and last locks in the open, until 2026-10-31)
  const b = stages.findIndex((s) => s.border);
  if (b < 0) return [...stages, q];
  // (after an appliqué's tack-down the needle is on the frame line where it began, a third round: the quilting starts
  // there if it can)
  // (straight lines under a border that covers the frame line begin and end on it already)
  const end = paths[paths.length - 1].at(-1);
  const led = LINED(p.quilt) && covered ? { paths, at: onOutline(edge, end)[0] < 0.05 ? end : null }
    : toFrame(paths, edge, obstacles, p.border === "applique" ? seamAt(edge, 1 / 3)[0] : null);
  q.paths = led.paths;
  // (an appliqué's border sews after a pause, so it isn't joined on: it keeps its own start, moved on by compose if
  // that's within 5.5 mm of where the quilting stopped: `reseam`. Started where the quilting stopped, it began 1.4 mm
  // away across the pause, a loose thread)
  const border = p.border === "applique" || !led.at ? stages[b] : { ...stages[b], paths: plainBorder(startAt(edge, led.at), p.border, p.trim) };
  return [...stages.slice(0, b), q, border, ...stages.slice(b + 1)];
}
// Quilting led on to the frame line at its ends (within 8 mm of it, by a straight run that keeps 1.5 mm clear of
// every other piece's stitches): a closed loop (stipple) is entered and left at its point nearest the frame, out and
// back along one run; an open line (echo, sewn inside out) only at an end that's already near. `from`: where on the
// frame line the needle already is, to start from. Returns the paths and where on the frame line the quilting ends
// (null if it doesn't).
function toFrame(paths, edge, obstacles, from = null) {
  const pts = obstacles.flat();
  const clear = (a, c) => {
    const dx = c[0] - a[0], dy = c[1] - a[1], L = dx * dx + dy * dy || 1;
    return pts.every(([x, y]) => { const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)); return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) >= 1.5; });
  };
  const lead = (pt, to) => { const q = to || onOutline(edge, pt)[2]; return Math.hypot(pt[0] - q[0], pt[1] - q[1]) <= 8 && clear(pt, q) ? q : null; };
  const closed = (l) => l.length > 2 && Math.hypot(l[0][0] - l[l.length - 1][0], l[0][1] - l[l.length - 1][1]) < 0.01;
  const leg = (a, c) => run([a, c], 2.5);   // a to c in stitches up to 2.5 mm
  // a closed loop turned to start at its nearest point to the frame (or to `to`) that has a clear run to it
  const turn = (l, to) => {
    const order = l.slice(0, -1).map((pt, i) => [to ? Math.hypot(pt[0] - to[0], pt[1] - to[1]) : onOutline(edge, pt)[0], i]).sort((u, v) => u[0] - v[0]);
    for (const [d, i] of order.slice(0, 40)) {
      if (d > 8) break;
      const q = lead(l[i], to);
      if (q) return [[...l.slice(i, -1), ...l.slice(0, i + 1)], q];
    }
    return to ? turn(l, null) : [l, null];
  };
  // from `from` along the frame line to q (the shorter way, up to 20 mm; the border covers it), ending just before q
  const along = (q) => {
    if (!from || Math.hypot(q[0] - from[0], q[1] - from[1]) < 0.3) return [];
    const e = startAt(edge, from), k = onOutline(e, q)[1], fwd = [...e.slice(0, k + 1)], bwd = [e[0], ...e.slice(k + 1).reverse()];
    const len = (l) => l.reduce((s, r, i) => s + (i ? Math.hypot(r[0] - l[i - 1][0], r[1] - l[i - 1][1]) : 0), 0) + Math.hypot(q[0] - l[l.length - 1][0], q[1] - l[l.length - 1][1]);
    const w = len(fwd) <= len(bwd) ? fwd : bwd;
    return len(w) <= 20 ? run([...w, q], 2.0).slice(0, -1) : [];
  };
  const out = paths.slice();
  let at = null;
  const n = out.length - 1;
  if (closed(out[n])) {
    const [l, q] = turn(out[n], n === 0 ? from : null);
    if (q) { out[n] = [...l, ...leg(l[l.length - 1], q).slice(1)]; at = q; }
    // (q itself is sewn: `along` stops just before it. Dropped, a start right where the needle was began at the
    // loop's own point, 2.3 mm on: a loose thread)
    if (q && n === 0) out[0] = [...along(q), ...leg(q, l[0]), ...out[0].slice(1)];
  } else {
    const q = lead(out[n][out[n].length - 1]);
    if (q) { out[n] = [...out[n], ...leg(out[n][out[n].length - 1], q).slice(1)]; at = q; }
  }
  if (n > 0) {
    if (closed(out[0])) { const [l, q] = turn(out[0], from); out[0] = q ? [...along(q), ...leg(q, l[0]), ...l.slice(1)] : l; }
    // (from where the needle is, along the frame line, as a closed start is: since the tack-down ends a third round,
    // 2026-11-06, an appliqué heart's stipple began 2.3 mm from it, a loose thread)
    else { const q = lead(out[0][0]); if (q) out[0] = [...along(q), ...leg(q, out[0][0]), ...out[0].slice(1)]; }
  }
  return { paths: out, at };
}
// A patch's fill cut away under what's sewn on top of it (lettering, a motif, a file): a name in satin on a full
// tatami stacked two layers of thread (stiff, and over 24 hits/mm²). The hole is what the later stitches cover,
// closed over 0.4 mm and then 0.8 mm smaller, so the fill still runs 0.4 mm under their edges. Decided per piece,
// all of it or none: only a piece that's wide all over (its columns, measured along their middles, typically
// CARVE_W mm or wider: a filled motif, or lettering at the widest satin, 3.5 mm, which measures 3.7; a 2.4 mm satin
// measures 3.0) and only holes of 20 mm² or more.
// Thin satin lettering on a fill is normal (the fill is its base), and cutting round every stroke broke the fill into
// sections (trims 3 -> 9 on a name); fine lines are never carved. (Until 2026-10-30 each part was decided on its own,
// cut where it was somewhere 4 mm across: the junctions of a thin "m" qualified, so in "Sam" only the m was carved
// and sat flatter than S and a.) `above` is one list of stages per piece. Worked in the patch's own (unturned) frame.
// Cached in three layers, so a change that leaves the holes as they were (typing in thin lettering on the patch, a
// font change, dragging a piece that isn't carved) never refills the patch, the slowest thing in compose: the patch's
// own grids (by its shape), each piece's hole (by its stitches) and the fill (by the holes it ends up with).
// `later` (the Design tab's preview): a fill not worked out yet goes on that list for a worker (`patchFillOf`, then
// `carveDone`), the patch's last fill standing in meanwhile, as quilting does (a fabric or thread change refilled a
// busy design's patch, 0.3-0.6 s of the page held up)
const carved = new Map(), grids = new Map(), lastCarve = new Map(), CARVE_W = 3.4;
export function carveDone(key, fill) { carved.set(key, fill); if (carved.size > 12) carved.delete(carved.keys().next().value); }
export function patchFillOf(job) {
  const was = sewing();
  sewWith([was[0], job.wt]);
  try { return patchFill(job.p, job.loops, job.fab); } finally { sewWith(was); }
}
function carve(p, stages, above, fab, later = null) {
  const a = ((p.rot || 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), f = p.flip ? -1 : 1;
  const local = above.map((sts) => sts.flatMap((s) => s.paths).map((q) => q.map(([x, y]) => [((x - p.x) * c + (y - p.y) * sn) * f, -(x - p.x) * sn + (y - p.y) * c])))
    .filter((g) => g.length);
  if (!local.length) return stages;
  const shape = JSON.stringify({ ...p, x: 0, y: 0, rot: 0 }), R = 4;
  if (!grids.has(shape)) {
    const edge = inset(shapeOf(p).path(p.w, p.h), 1.0), [x0, y0, x1, y1] = bounds(edge);
    const w = Math.ceil((x1 - x0) * R) + 2, hh = Math.ceil((y1 - y0) * R) + 2, n = w * hh;
    // only well inside the patch's outline (a hole crossing it would add fill outside it, even-odd)
    const inside = { w, h: hh, data: new Uint8Array(n) };
    for (let y = 0; y < hh; y++) {
      const Y = y0 + y / R, cut = [];
      for (let i = 0; i < edge.length; i++) { const [ax, ay] = edge[i], [bx, by] = edge[(i + 1) % edge.length]; if ((ay <= Y) !== (by <= Y)) cut.push(ax + ((Y - ay) * (bx - ax)) / (by - ay)); }
      cut.sort((u, v) => u - v);
      for (let k = 0; k + 1 < cut.length; k += 2) for (let x = Math.max(0, Math.ceil((cut[k] - x0) * R)); x <= Math.min(w - 1, Math.floor((cut[k + 1] - x0) * R)); x++) inside.data[y * w + x] = 1;
    }
    grids.set(shape, { edge, x0, y0, w, hh, n, room: distanceTransform(inside), bits: new Map() });
    if (grids.size > 4) grids.delete(grids.keys().next().value);
  }
  const { edge, x0, y0, w, hh, n, room, bits: carvedBits } = recent(grids, shape), hole = { w, h: hh, data: new Uint8Array(n) };
  for (const g of local) {
    let h = g.length;
    for (const q of g) for (const [x, y] of q) h = (Math.imul(h ^ Math.round(x * 10), 16777619) ^ Math.round(y * 10)) | 0;
    const gk = h + ":" + g.reduce((t, q) => t + q.length, 0);
    if (!carvedBits.has(gk)) {
      const m = { w, h: hh, data: new Uint8Array(n) };
      const dot = (x, y) => { const X = Math.round((x - x0) * R), Y = Math.round((y - y0) * R); if (X >= 0 && Y >= 0 && X < w && Y < hh) m.data[Y * w + X] = 1; };
      for (const q of g) for (let i = 1; i < q.length; i++) {
        const [ax, ay] = q[i - 1], [bx, by] = q[i], k1 = Math.ceil(Math.hypot(bx - ax, by - ay) * R * 2);
        for (let k = 0; k <= k1; k++) dot(ax + ((bx - ax) * k) / k1, ay + ((by - ay) * k) / k1);
      }
      // close over 0.4 mm (satin's needle points are 0.4 apart), then keep only what's 0.8 mm inside that
      const near = distanceTransform({ w, h: hh, data: m.data.map((v) => 1 - v) });
      const deep = distanceTransform({ w, h: hh, data: near.map((d) => (d <= 0.4 * R ? 1 : 0)) });
      // how wide the piece is: the median distance to its edge along the middles of its columns (pixels no
      // neighbour is deeper than), times two, less the 0.4 mm grown each side
      const mid = [];
      for (let y = 1; y < hh - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x, d = deep[i];
        if (d > 0 && d >= deep[i - 1] && d >= deep[i + 1] && d >= deep[i - w] && d >= deep[i + w]) mid.push(d);
      }
      mid.sort((u, v) => u - v);
      let bits = null;
      if (mid.length && (2 * mid[mid.length >> 1]) / R - 0.8 >= CARVE_W) {
        const on = [];
        for (let i = 0; i < n; i++) if (deep[i] > 0.8 * R && room[i] > 1.5 * R) on.push(i);
        bits = Int32Array.from(on);
      }
      carvedBits.set(gk, bits);
      if (carvedBits.size > 64) carvedBits.delete(carvedBits.keys().next().value);
    }
    const bits = recent(carvedBits, gk);
    if (bits) for (const i of bits) hole.data[i] = 1;
  }
  let h = 0, cnt = 0;
  for (let i = 0; i < n; i++) if (hole.data[i]) { h = Math.imul(h ^ i, 16777619) | 0; cnt++; }
  // (all `patchFill` reads of them; and where the patch is, when its rows lie on the design's grid: settings.js)
  const key = JSON.stringify([shape, h, cnt, fab === "knit", sewing()[1] === "30", ...(ownFill(p) ? [p.x, p.y, p.rot || 0] : [])]);
  if (!carved.has(key)) {
    const holes = cnt ? contours(hole).map((l) => l.map(([x, y]) => [x0 + x / R, y0 + y / R]))
      .filter((l) => l.length > 8 && Math.abs(l.reduce((s, q, i) => s + q[0] * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * q[1], 0)) / 2 >= 20) : [];
    const job = holes.length && { key, kind: "patch", p, loops: [edge, ...holes], fab, wt: sewing()[1] };
    if (job && later) later.push(job); else carveDone(key, job ? patchFillOf(job) : null);
  }
  const done = carved.has(key), fill = done ? recent(carved, key) : lastCarve.get(shape);
  if (done) { lastCarve.set(shape, fill); if (lastCarve.size > 12) lastCarve.delete(lastCarve.keys().next().value); }
  if (!fill) return stages;
  const place = placer(p), placed = fill.map((st) => ({ ...st, label: label(p, true), paths: st.paths.map((q) => moved(q, place)) }));
  return [...placed, ...stages.filter((s) => !s.patchFill)];
}
// Bigger than the hoop: split into two hoopings by whole pieces (never through a stitch), along the design's long
// side, at the most even cut where both halves fit. Two basting crosses on the cut line line the second hooping up
// with the first: sewn at the end of the first and again at the start of the second. null when it can't be done
// (one piece is bigger than the hoop by itself, or no cut leaves both halves small enough).
export function splitPieces(pieces, hoop) {
  const lw = hoop.w - 2 * MARGIN - 2, lh = hoop.h - 2 * MARGIN - 2;
  // (each at the size it's sewn: lettering asked bigger than its frame counted as bigger than half the hoop)
  const fit = fittedSizes(pieces), items = pieces.map((p) => { const q = sewn(p, pieces, fit); return { p, q, b: pieceBounds(q) }; }).filter((it) => it.b);
  if (items.length < 2) return null;
  const all = [Math.min(...items.map((i) => i.b[0])), Math.min(...items.map((i) => i.b[1])), Math.max(...items.map((i) => i.b[2])), Math.max(...items.map((i) => i.b[3]))];
  for (const ax of all[2] - all[0] - lw > all[3] - all[1] - lh ? [0, 1] : [1, 0]) {
    const L = ax ? lh : lw, C = ax ? lw : lh, lo = ax ? 1 : 0, hi = ax ? 3 : 2, c0 = all[ax ? 0 : 1], c1 = all[ax ? 2 : 3];
    if (c1 - c0 > C) continue;
    const sorted = items.slice().sort((a, b) => a.b[lo] + a.b[hi] - b.b[lo] - b.b[hi]);
    let best = null;
    for (let k = 1; k < sorted.length; k++) {
      const A = sorted.slice(0, k), B = sorted.slice(k);
      const aLo = Math.min(...A.map((i) => i.b[lo])), aHi = Math.max(...A.map((i) => i.b[hi])), bLo = Math.min(...B.map((i) => i.b[lo])), bHi = Math.max(...B.map((i) => i.b[hi]));
      // the crosses sit between the halves, as near the middle of the gap as both hoopings allow (each must hold them)
      const uLo = bHi - L + 5, uHi = aLo + L - 5;
      if (uLo > uHi || aHi - aLo > L || bHi - bLo > L) continue;
      const m = Math.min(uHi, Math.max(uLo, (aHi + bLo) / 2));
      const spanA = Math.max(aHi, m + 5) - Math.min(aLo, m - 5), spanB = Math.max(bHi, m + 5) - Math.min(bLo, m - 5);
      if (spanA > L || spanB > L) continue;
      if (!best || Math.max(spanA, spanB) < best.worst) best = { worst: Math.max(spanA, spanB), A, B, m };
    }
    if (!best) continue;
    const at = (u, v) => (ax ? [v, u] : [u, v]);
    const marks = crossSpots(items, best, at, { lo, hi, L, C, c0, c1 }) || [at(best.m, c0 + (c1 - c0) * 0.25), at(best.m, c0 + (c1 - c0) * 0.75)];
    return [{ pieces: best.A.map((i) => i.p), marks, end: true }, { pieces: best.B.map((i) => i.p), marks, end: false }];
  }
  return null;
}
// Where the two crosses go: on a line between the halves (u, as near the middle of the gap as both hoopings allow),
// each 1.5 mm clear of every stitch (a cross sewn on the "e" of one half, or under the next half's satin, can't be
// pulled out), near a quarter and three quarters of the way across, at least 20 mm apart when the hooping allows
// (the further apart, the truer the second hooping lines up). null when no line has two clear spots.
function crossSpots(items, best, at, { lo, hi, L, C, c0, c1 }) {
  const ink = cloud(items.flatMap((i) => pieceStitches(i.q)));
  const ext = (g) => [Math.min(...g.map((i) => i.b[lo])), Math.max(...g.map((i) => i.b[hi]))];
  const [aLo, aHi] = ext(best.A), [bLo, bHi] = ext(best.B);
  const vLo = c1 - C + 5, vHi = c0 + C - 5, mid = (c0 + c1) / 2, half = Math.max((c1 - c0) / 4, Math.min(20, (vHi - vLo) / 2));
  const t1 = Math.max(vLo, mid - half), t2 = Math.min(vHi, mid + half), apart = Math.min(20, t2 - t1);
  let pick = null;
  for (let du = 0; du <= L && !(pick && 2 * du > pick.cost); du++) {
    for (const u of du ? [best.m + du, best.m - du] : [best.m]) {
      if (Math.max(aHi, u + 5) - Math.min(aLo, u - 5) > L || Math.max(bHi, u + 5) - Math.min(bLo, u - 5) > L) continue;
      const clear = [];
      for (let v = Math.ceil(vLo); v <= vHi; v++) if (!near(ink, crosses([at(u, v)]), 1.5)) clear.push(v);
      let v1 = null, v2 = null;
      for (const v of clear) if (v1 == null || Math.abs(v - t1) < Math.abs(v1 - t1)) v1 = v;
      for (const v of clear) if (v1 != null && Math.abs(v - v1) >= Math.max(12, apart) && (v2 == null || Math.abs(v - t2) < Math.abs(v2 - t2))) v2 = v;
      if (v2 == null) continue;
      const cost = Math.abs(v1 - t1) + Math.abs(v2 - t2) + 2 * du;
      if (!pick || cost < pick.cost) pick = { cost, marks: [at(u, v1), at(u, v2)] };
    }
  }
  return pick?.marks || null;
}
// The cross the second hooping lines up on (the first mark), named as the machine shows it: "top", "bottom", "left" or
// "right" ("the left cross" was said even when the crosses sat one above the other). With the hoop turned the machine
// shows the layout a quarter turn clockwise: the preview's top is the machine's right.
export function crossName(marks, turned = false) {
  const [a, b] = turned ? marks.map(([x, y]) => [-y, x]) : marks;
  return Math.abs(a[1] - b[1]) >= Math.abs(a[0] - b[0]) ? (a[1] < b[1] ? "top" : "bottom") : a[0] < b[0] ? "left" : "right";
}
// What to do before the second hooping sews its crosses. `which`: the cross named as the machine shows it (said by the
// caller when the hoop is turned); `move`: how far to slide the fabric, from where the machine centres each half (the
// caller knows both halves)
export function crossStep({ pts, which, move }) {
  return `${move || "Hoop the fabric again, as straight as you can, with both crosses from the first hooping inside the hoop."} Put the hoop on the machine. Use the machine's layout arrows to move the design until the needle sits over the centre of the ${which || crossName(pts) + " cross"} (turn the handwheel to lower it and check). Press Start: the crosses should sew right on top of the old ones. If they don't, stop, move the design and try again.`;
}
// basting crosses (long stitches, easy to pull out), each starting and ending at its centre
const crosses = (marks) => marks.map(([x, y]) => [[x, y], [x + 5, y], [x - 5, y], [x, y], [x, y + 5], [x, y - 5], [x, y]]);
// Sew the pieces in list order. Neighbouring stages in the same thread share one colour block unless a stage
// needs a pause. A stage in a thread used earlier moves up to join it (one pause fewer) when it overlaps nothing
// it would jump ahead of, so what lies on top of what never changes; appliqué stages never move.
// Returns the design and the steps to show (what the machine sews, what the person does at pauses).
// opts: { fabric: key of FABRICS, thread: key of THREADS, baste: a basting box round everything first (floating, towels), dragging (a piece
//         is mid-drag: quilting stays as it was, for speed; the drop composes it properly),
//         marks: { pts, end } alignment crosses for a split design (end: after everything, else first) }
// Several of one in-the-hoop project in the hoop (two bookmarks, "Make two in the hoop"): frames alike (same border,
// shape, thread and stages) that don't overlap sew each stage together, so the fabric steps stay one pause each: both
// outlines, one stop to lay the fronts, both tack-downs, what's on each, one stop for the backs, both edges. Sewn one
// after the other, each would add its own two stops (2 bookmarks: 6 pauses, not 3). The later frames' stages are
// emptied into the first's (`staged` changed in place); what's on each frame is untouched.
const GANG = ["ith", "zip"];
function gang(pieces, staged) {
  const gangs = [];
  const box = (p) => { const [x0, y0, x1, y1] = bounds(shapeOf(p).path(p.w, p.h).map(placer(p))); return [x0, y0, x1, y1]; };
  const apart = (a, b) => a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1];
  const twin = (a, b) => a.border === b.border && a.shape === b.shape && a.color === b.color && !!a.quilt === !!b.quilt && !!a.eyelet === !!b.eyelet;
  const done = new Set();
  pieces.forEach((p, i) => {
    if (p.kind !== "frame" || !GANG.includes(p.border) || done.has(i)) return;
    const group = [i];
    pieces.forEach((q, j) => {
      if (j <= i || done.has(j) || q.kind !== "frame" || !twin(p, q) || staged[j].length !== staged[i].length) return;
      if (group.every((k) => apart(box(pieces[k]), box(q)))) group.push(j);
    });
    if (group.length < 2) return;
    const n = group.length, all = n === 2 ? "both" : `all ${n}`, name = shapeOf(p).name.toLowerCase();
    const bs = group.map((k) => box(pieces[k])), W = Math.max(...bs.map((b) => b[2])) - Math.min(...bs.map((b) => b[0])), H = Math.max(...bs.map((b) => b[3])) - Math.min(...bs.map((b) => b[1]));
    gangs.push({ n, name });
    staged[i] = staged[i].map((st, k) => {
      const mates = group.slice(1).map((j) => staged[j][k]);
      // (the stage's own words for n of them, `many`, where it has them: "…on the stabilizer, on both." and "Dab Fray
      // Check inside the ribbon ring" for two bookmarks, "fold the ribbon in half" for two key fobs)
      const own = st.many?.(n, all) || {};
      const out = { ...st, paths: [...st.paths, ...mates.flatMap((m) => m.paths)], sews: own.sews || (st.sews ? `${st.sews.replace(/\.$/, "")} on ${all} ${name}s.` : st.sews) };
      if (st.after) out.after = own.after || st.after.replace(`cut round the ${name}`, `cut round each ${name}`);
      if (own.you) out.you = own.you;
      for (const key of ["cut", "solid"]) if (st[key]) out[key] = [...st[key], ...mates.flatMap((m) => m[key] || [])];
      // (the needle comes to the first frame's outline first: only its start moves)
      if (st.reseam) out.reseam = (f) => [...st.reseam(f), ...mates.flatMap((m) => m.paths)];
      if (st.before) out.before = st.kit ? st.kit(n, all, W, H) : `${st.before} That's for one ${name}: the fabric pieces ${n} times over, one set for each. One piece of stabilizer does for ${all}.`;
      // (the outlines, plural: "over the bookmark outline" with two in the hoop)
      if (st.pause && st.you && !own.you) out.you = st.you.replace(/\b(the|each) (front|backing) fabric\b/, (m) => `${m} (one piece over ${all} ${name}s, or one each)`)
        .replace(`the ${name} outline`, `the ${name} outlines`).replace("past the outline all round", "past the outlines all round").replace("a piece cut with", "pieces cut with").replace("exactly on the line", "exactly on the lines");
      return out;
    });
    for (const j of group.slice(1)) { staged[j] = []; done.add(j); }
    done.add(i);
  });
  return gangs;
}
// Several appliqués in one thread (two hearts, a heart and appliqué letters beside it): their outlines are sewn
// together, then one stop to lay the fabric, their tack-downs, one stop to trim, their satins. One after the other,
// each added its own two stops (two appliqués: 6 pauses where 3 do; a tester's finding, docs/decisions.md). Only
// pieces that are placement, tack-down, satin and nothing else, whose stitches don't overlap, and with nothing sewn
// between them in the list that the later one would lie on. The later ones' stages are emptied into the first's;
// each outline keeps its own seam (`seam` paths are never re-entered).
function gangAppliques(staged, box, hits) {
  const appl = (st) => st.length === 3 && st[0].fabric && !st[0].bare && !st[0].pause && !st[0].nocut && st[1].pause && st[1].under && st[1].then && st[2].pause && !st[2].last && !st[2].edge
    && st.every((s) => s.paths.length && s.color === st[0].color);
  const done = new Set();
  staged.forEach((si, i) => {
    if (done.has(i) || !appl(si)) return;
    const group = [i], boxes = [box(si.flatMap((s) => s.paths))];
    for (let j = i + 1; j < staged.length; j++) {
      const sj = staged[j];
      if (done.has(j) || !appl(sj) || sj[0].color !== si[0].color) continue;
      const bj = box(sj.flatMap((s) => s.paths));
      if (boxes.some((b) => hits(b, bj))) continue;
      let under = false;
      for (let k = i + 1; k < j && !under; k++) under = !group.includes(k) && staged[k].some((s) => s.paths.length && hits(box(s.paths), bj));
      if (under) continue;
      group.push(j); boxes.push(bj);
    }
    if (group.length < 2) return;
    const n = group.length, all = n === 2 ? "both" : `all ${n}`;
    staged[i] = si.map((st, k) => {
      const mates = group.slice(1).map((j) => staged[j][k]), every = [st, ...mates];
      const out = { ...st, paths: every.flatMap((m) => m.paths), sews: every.flatMap((m) => m.sews || []) };
      for (const key of ["cut", "solid"]) if (every.some((m) => m[key])) out[key] = every.flatMap((m) => m[key] || []);
      if (st.reseam) out.reseam = (f) => [...st.reseam(f), ...mates.flatMap((m) => m.paths)];
      const thens = every.map((m) => m.then).filter(Boolean);
      if (thens.length) { delete out.then; out.thens = thens.filter((t, a) => thens.findIndex((u) => u.trim === t.trim && u.where === t.where) === a); }
      if (k === 1) {
        // "Lay the appliqué fabric over the heart outline and “AB”, right side up, …past the outlines all round…"
        const over = every.map((m) => /^Lay the appliqué fabric over (.+?), right side up, /.exec(m.you || "")?.[1]).filter(Boolean);
        const same = over.length === n && over.every((o) => o === over[0]) && /^the (.+) outline$/.exec(over[0]);
        const what = same ? `${all} ${same[1]} outlines` : listed([...new Set(over)]);
        if (over.length && st.you) out.you = st.you.replace(/^Lay the appliqué fabric over .+?, right side up, /, `Lay the appliqué fabric over ${what} (one piece over ${n === 2 ? "both" : "all"}, or one each), right side up, `)
          .replace(/past the outline all round/, "past the outlines all round").replace(/or lay a piece cut with/, "or lay pieces cut with").replace(/exactly on the line(?!s)/, "exactly on the lines").replace(/tacks it down/, "tacks them down");
      }
      return out;
    });
    for (const j of group.slice(1)) { staged[j] = []; done.add(j); }
  });
}
// The steps' words, read as a whole: the same sentence twice in a step is said once with how many ("Sews the monogram
// J. Sews the monogram J." with two key fobs in the hoop): "on both key fobs" when that many were made in the hoop
// together, else "(2 of them)". Things sewn one after another are one sentence ("Sews “Noel”. Sews “2026”." read as
// two jobs): "Sews the circle frame, “HANDMADE” and “WITH LOVE”."
const THING = /^Sews (“[^”]*”|the (?:(?! and | on | with | through | then |, ).)+?)\.$/;
const listed = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
function tidySteps(steps, gangs) {
  for (const st of steps) {
    const n = new Map();
    for (const t of st.sews) n.set(t, (n.get(t) || 0) + 1);
    const on = (k) => { const g = gangs.find((x) => x.n === k); return g ? ` on ${k === 2 ? "both" : `all ${k}`} ${g.name}s` : ` (${k} of them)`; };
    const out = [];
    for (const [t, k] of n) {
      const m = THING.exec(t), prev = out.at(-1);
      if (m && prev?.things && prev.k === k) prev.things.push(m[1]);
      else out.push(m ? { things: [m[1]], k } : { t, k });
    }
    st.sews = out.map(({ t, things, k }) => (things ? `Sews ${listed(things)}${k > 1 ? on(k) : ""}.` : k < 2 ? t : `${t.replace(/\.$/, "")}${on(k)}.`));
  }
}
// The trims owed from the stop before (`then` on a tack-down stage), then the step's own words: "Unless you laid a cut
// piece, take the hoop off…, trim…, and put the hoop back." A step that takes the hoop off anyway (an in-the-hoop
// project's backing) trims while it's off: it said "put the hoop back", then "Take the hoop off the machine".
const OFF = "Take the hoop off the machine (leave the fabric in the hoop)";
function trimsFor(trims, own) {
  if (!trims.length) return own;
  const what = trims.map((t) => `${t.trim} close to the stitching${t.where || ""}`).join(", and "), cut = trims.length > 1 ? "cut pieces" : "a cut piece";
  if (own?.startsWith(OFF)) return `${OFF}. Unless you laid ${cut}, trim ${what}. ${own.slice(OFF.length).replace(/^,? and (\w)/, (_, c) => c.toUpperCase()).trim()}`;
  return `Unless you laid ${cut}, take the hoop off the machine (leave the fabric in the hoop), trim ${what}, and put the hoop back. ${own || "Press Start."}`;
}
export function compose(pieces, hoop, opts = {}) {
  const was = sewing(), wasMoving = movingNow(opts.dragging);
  sewAs(opts.fabric, opts.thread);
  try { return build(pieces, hoop, opts); } finally { sewWith(was); movingNow(wasMoving); }
}
function build(pieces, hoop, opts) {
  const fab = FABRICS[opts.fabric] ? opts.fabric : "cotton";
  const fit = fittedSizes(pieces);
  pieces = pieces.map((p) => sewn(p, pieces, fit));
  const box = (paths) => { const [x0, y0, x1, y1] = bounds(paths.flat()); return [x0 - 1, y0 - 1, x1 + 1, y1 + 1]; };
  const hits = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const order = [], last = [], edges = [], staged = pieces.map((p) => pieceStages(p, fab).map((st) => ({ label: label(p, true), ...st })));
  pieces.forEach((p, i) => { if (QUILTED(p)) staged[i] = withQuilt(p, staged[i], staged.filter((_, j) => j !== i).flat(), opts.dragging, opts.later, opts.unquilted); });
  // patches: no fill under what's sewn on them (fine-line lettering excepted). Not while dragging, nor when only the
  // size is wanted (`measure`: does it fit the hoop?): the holes are cut 2.5 mm or more inside the patch's outline, well
  // within its satin edge, so they never change the design's size (the same to 0.1 mm on every starter at 50-150 %,
  // tests/browser/measure.html), and carving each new patch size held "Make the frames fit" up ~0.6 s.
  pieces.forEach((p, i) => {
    if (p.kind !== "frame" || p.border !== "patch" || opts.dragging || opts.measure) return;
    const above = pieces.slice(i + 1).map((q, k) => (q.kind === "frame" || q.style === "line" ? [] : staged[i + 1 + k].filter((s) => !s.under && !s.fabric)));
    staged[i] = carve(p, staged[i], above, fab, opts.fillLater ? opts.later : null);
  });
  const gangs = gang(pieces, staged);
  gangAppliques(staged, box, hits);
  for (const st of staged.flat()) {
    if (!st.paths.length) continue;
    const s = { ...st, box: box(st.paths) };
    if (s.last) { last.push(s); continue; }   // two-sided in-the-hoop edge: after everything that goes on the front
    if (s.edge) { edges.push(s); continue; }   // a patch's satin edge: after what's sewn on the patch
    let at = order.length;
    if (!s.pause && !s.fabric) {
      for (let j = order.length - 1; j >= 0; j--) {
        if (order[j].color === s.color && !order[j].fabric && !order[j].under) { at = j + 1; break; }
        if (hits(order[j].box, s.box) || order[j].pause) break;
      }
    }
    if (at < order.length) s.early = true;
    order.splice(at, 0, s);
  }
  order.push(...edges, ...last);
  // a stage after a pause that starts within 5.5 mm of where the last one stopped starts further round (`reseam`)
  let stop = null;
  order.forEach((st, i) => {
    if (st.reseam && st.pause && stop) {
      const near = (ps) => { const a = ps.find((q) => q.length)?.[0]; return a && Math.hypot(a[0] - stop[0], a[1] - stop[1]) < 5.5; };
      for (let k = 1; k < 20 && near(st.paths); k++) order[i] = st = { ...st, paths: st.reseam((st.seam + k * 0.05) % 1) };
    }
    const lastPath = [...st.paths].reverse().find((q) => q.length);
    if (lastPath) stop = lastPath[lastPath.length - 1];
  });
  if (opts.marks && order.length) {
    const color = opts.marks.end ? order[order.length - 1].color : order[0].color, paths = crosses(opts.marks.pts);
    if (opts.marks.end) order.push({ color, paths, label: "Alignment crosses", sews: "Sews two alignment crosses where the next hooping lines up." });
    else order.unshift({ color, paths, label: "Alignment crosses", pause: true,
      you: crossStep(opts.marks),
      sews: "Sews the alignment crosses again, on top of the first ones.", after: "Pull out the alignment crosses (they're long stitches; snip and pull)." });
  }
  if (opts.baste && order.length) {
    // long stitches 9 mm round everything (as far as the hoop allows), centred on the design so it stays centred;
    // part of the first block, so it needs no stop of its own
    const b = box(order.flatMap((s) => s.paths)), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const hw = Math.min((b[2] - b[0]) / 2 + 9, hoop.w / 2 - MARGIN - 1), hh = Math.min((b[3] - b[1]) / 2 + 9, hoop.h / 2 - MARGIN - 1);
    const rect = [[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh], [cx - hw, cy - hh]];
    // side by side, so the corners stay square
    const sides = rect.slice(1).flatMap((q, i) => run([rect[i], q], 4).slice(i ? 1 : 0));
    order[0] = { ...order[0], paths: [sides, ...order[0].paths], sews: Array.isArray(order[0].sews) ? ["Sews a basting box to hold everything flat.", ...order[0].sews] : "Sews a basting box to hold everything flat. " + order[0].sews };
  }
  const d = new Design(hoop, { ease: true }), steps = [], after = [], before = [];
  // where the next part of the same block starts, past closed rings (a ring the needle has to jump to anyway starts
  // there instead, so the move after it is a stitch; rings after it are entered where it ends: `enter`)
  const items = [];
  { let th = null, b = 0; for (const st of order) { if (st.color !== th || st.pause || st.fabric) { b++; th = st.color; } for (const q of st.paths) items.push([q, b]); } }
  const ring = (q) => q.length > 3 && q[0][0] === q[q.length - 1][0] && q[0][1] === q[q.length - 1][1];
  const ahead = items.map(() => null);
  for (let i = items.length - 2; i >= 0; i--) { const [q, b] = items[i + 1]; ahead[i] = b !== items[i][1] || q.gap ? null : ring(q) ? ahead[i + 1] : q[0]; }
  let k = 0, thread = null;
  const owed = [];
  for (const st of order) {
    if (st.after && !after.includes(st.after)) after.push(st.after);
    if (st.before && !before.includes(st.before)) before.push(st.before);
    if (st.color !== thread || st.pause || st.fabric) {
      // a fabric step in a new thread says so first: "Take the hoop off…" after blue, in red, got sewn in blue
      const change = steps.length && st.color !== thread;
      // (the thread's description in the file in plain ASCII: “Noah” in UTF-8 came back as â€œNoahâ€ in readers)
      d.color(st.color, ascii(st.label)); thread = st.color;
      // (a pause in the same thread says so, every time: two red appliqués read "Change to the next thread" from red to
      // red, and an appliqué's fabric steps named the same thread again with nothing said; what's owed from the stop
      // before, a trim after a tack-down, goes between the thread and this step's own words)
      const lead = !steps.length ? "" : change ? "Change to the next thread" : "Keep the same thread on", you = trimsFor(owed.splice(0), st.you);
      steps.push({ color: st.color, sews: [], you: !lead ? you || null : you ? `${lead}. ${you}` : `${lead} and press Start.`,
        fabric: !!st.fabric, bare: !!st.bare, under: !!st.under || !!st.fabric, early: false, cut: st.fabric && !st.nocut ? st.cut || st.paths : null });
    }
    if (st.sews) steps[steps.length - 1].sews.push(...[].concat(st.sews));   // (several: appliqués sewn together, `gangAppliques`)
    for (const then of st.thens || (st.then ? [st.then] : [])) if (!owed.some((t) => t.trim === then.trim && t.where === then.where)) owed.push(then);
    if (st.early) steps[steps.length - 1].early = true;
    // something you'd see joining a tack-down (quilting, lettering in the same thread) shows the block in the preview;
    // the tack line sits at the edge, under the satin that comes later
    const cur = steps[steps.length - 1];
    if (cur.under && !st.under && !st.fabric) cur.under = false;
    // (a closed loop the needle is beside is entered there, not at its own start: `enter`)
    for (const q of st.paths) {
      const i = k++;
      let r = q.gap || q.seam ? q : enter(q, d.cur);
      // (not at the start of an appliqué's stage: its seams are placed so they don't stack; and only where the moves in
      // and out cost less, `moveCost`: a trim must not become a loose thread)
      if (r === q && !q.gap && !q.seam && ahead[i] && (d.cur || (!st.pause && !st.fabric))) {
        const t = enter(q, ahead[i]), c = (a) => (d.cur ? moveCost(Math.hypot(a[0][0] - d.cur[0], a[0][1] - d.cur[1])) : 0) + moveCost(Math.hypot(a[0][0] - ahead[i][0], a[0][1] - ahead[i][1]));
        if (c(t) < c(q)) r = t;
      }
      d.path(r, true, !!q.gap, q.lockAt, r === q ? q.reach : 0);
    }
  }
  if (!steps.length) throw Object.assign(new Error("Nothing to stitch yet: type some words, or pick a starting idea."), { empty: true });
  if (owed.length) after.unshift(trimsFor(owed, "").trim());
  tidySteps(steps, gangs);
  if (opts.baste) after.push("Unpick the basting box (snip every few stitches on the back, then pull it out from the front).");
  // (too big for the hoop: the error carries the design all the same, finished, so the too-big preview shows it
  // without building it all again in a bigger hoop; only basting is sized to the hoop)
  let over = null;
  try { d.finish({ untiny: true }); } catch (err) { if (!err.overBy) throw err; over = err; }
  // step 1 starts with hooping: the bare stabilizer for in-the-hoop projects, the patch fabric for a patch
  const first = order[0], hoopIt = first?.bare ? "Hoop tear-away stabilizer on its own (no fabric yet)" : first?.patch ? "Hoop the felt or twill with the stabilizer under it"
    : order.some((s) => s.sandwich) ? "Hoop the quilt sandwich (or float it on hooped tear-away stabilizer)" : FABRICS[fab].hoop;
  // (`bare`: nothing but stabilizer is hooped, so a turned hoop's note says where the fabric's top goes, not "Hoop the fabric")
  const done = { design: d, steps, after, before, hoop: hoopIt, bare: !!first?.bare, tip: [FABRICS[fab].tip, FABRICS[fab].item].filter(Boolean).join(" ") };
  if (over) throw Object.assign(over, { composed: opts.baste ? null : done });
  return done;
}
