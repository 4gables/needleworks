// Script text -> centerline strokes. Port of needleworks/text.py.
// The word is drawn on a canvas, swashes and bridges between unjoined letters are added tangent to
// real stroke ends, then the ink is thinned to a graph of strokes.
import { cubic, resample } from "./geom.js";
import { label, prune, skeletonEdges, skeletonGraph, skeletonize, strokeWidth } from "./raster.js";

const PX = 400;

function canvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}

function maskOf(ctx, w, h) {
  const a = ctx.getImageData(0, 0, w, h).data, data = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = a[i * 4 + 3] > 127 ? 1 : 0;
  return { w, h, data };
}

function endpoints(mask, stroke) {
  const { pos, edges: raw } = skeletonGraph(skeletonize(mask));
  const edges = prune(raw, stroke * 1.3);
  const deg = new Map();
  for (const [a, b] of edges) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
  const out = [];
  for (const [a, b, p] of edges) {
    if (a === b) continue;
    const k = Math.min(p.length - 1, Math.floor(stroke * 2));
    for (const [node, end, inner] of [[a, p[0], p[k]], [b, p[p.length - 1], p[p.length - 1 - k]]]) {
      if (deg.get(node) !== 1) continue;
      const d = [end[0] - inner[0], end[1] - inner[1]], L = Math.max(Math.hypot(...d), 1e-9);
      out.push([end, [d[0] / L, d[1] / L]]);
    }
  }
  return out;
}

function brush(ctx, pts, width) {
  const r = width / 2;
  ctx.beginPath();
  for (const [x, y] of resample(pts, 1.0)) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
  ctx.fill();
}

// Calligraphic swash leaving a stroke end p0 along its own direction d: it sweeps into a shallow
// cup just under the baseline, then flicks up at the far end. s = -1 runs left (lead-in), +1 right (tail).
function swash(p0, d, length, xh, ybase, s) {
  const cup = [p0[0] + s * 0.45 * length, ybase + 0.15 * xh], tip = [p0[0] + s * length, ybase - 0.4 * xh];
  const r1 = Math.max(Math.hypot(cup[0] - p0[0], cup[1] - p0[1]), 1e-9), r2 = Math.hypot(tip[0] - cup[0], tip[1] - cup[1]);
  // ease a stroke end that curls away (A's foot) toward the cup
  let e = [d[0] + (0.5 * (cup[0] - p0[0])) / r1, d[1] + (0.5 * (cup[1] - p0[1])) / r1];
  const L = Math.max(Math.hypot(...e), 1e-9), k = Math.min(0.5 * r1, 0.35 * xh);
  e = [e[0] / L, e[1] / L];
  const flick = [s * 0.7, -0.7];
  const leg1 = cubic(p0, [p0[0] + e[0] * k, p0[1] + e[1] * k], [cup[0] - s * 0.45 * r1, cup[1]], cup);
  const leg2 = cubic(cup, [cup[0] + s * 0.45 * r2, cup[1]], [tip[0] - flick[0] * 0.35 * r2, tip[1] - flick[1] * 0.35 * r2], tip);
  return [...leg1, ...leg2.slice(1)];
}

// lengths of lead-in / tail are in x-heights
export function renderWord(text, family, { leadIn = 0, tail = 0, join = true } = {}) {
  const probe = canvas(10, 10).getContext("2d");
  const font = `${PX}px "${family}"`;
  probe.font = font;
  const m = probe.measureText(text), mx = probe.measureText("x");
  const inkL = -m.actualBoundingBoxLeft, inkR = m.actualBoundingBoxRight;
  const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
  const xh = mx.actualBoundingBoxAscent + mx.actualBoundingBoxDescent;
  const pad = Math.ceil(PX * (0.2 + leadIn + tail));
  const w = Math.ceil(inkR - inkL + 2 * pad), h = Math.ceil(asc + desc + PX);
  const ox = pad - inkL, baseline = PX / 2 + asc;
  const c = canvas(w, h), ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.font = font; ctx.fillStyle = "#000"; ctx.textBaseline = "alphabetic";
  ctx.fillText(text, ox, baseline);
  let mask = maskOf(ctx, w, h);

  const stroke = strokeWidth(mask);
  const sw = Math.max(2, Math.round(stroke)), ybase = baseline - stroke / 2;
  const span = [ox + inkL, ox + inkR];
  const ends = endpoints(mask, stroke);
  const { labels } = label(mask);
  const adv = Array.from({ length: text.length + 1 }, (_, i) => ox + probe.measureText(text.slice(0, i)).width);
  const low = ends.filter(([p]) => p[1] >= baseline - 0.75 * xh && p[1] <= baseline + 0.2 * xh);
  // lowest ink point (above descenders) in letter i's left half, as a stroke centre heading left
  const bottom = (i) => {
    const x0 = Math.max(0, Math.floor(adv[i] - 0.4 * xh)), x1 = Math.floor((adv[i] + adv[i + 1]) / 2);
    for (let y = Math.min(h, Math.floor(baseline + 0.3 * xh)) - 1; y >= 0; y--)
      for (let x = x0; x < x1; x++) if (mask.data[y * w + x]) return [[x, y - stroke / 2], [-1, 0]];
    return null;
  };
  const entry = (i) => {
    const cands = low.filter(([p]) => p[0] >= adv[i] - 0.4 * xh && p[0] <= (adv[i] + adv[i + 1]) / 2);
    return cands.length ? cands.reduce((a, b) => (b[0][0] < a[0][0] ? b : a)) : null;
  };
  const exit = (i, band = low) => {
    const cands = band.filter(([p]) => p[0] >= (adv[i] + adv[i + 1]) / 2 && p[0] <= adv[i + 1] + 0.4 * xh);
    return cands.length ? cands.reduce((a, b) => (b[0][0] > a[0][0] ? b : a)) : null;
  };
  const comp = ([x, y]) => {
    let best = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const X = Math.round(x) + dx, Y = Math.round(y) + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h) best = Math.max(best, labels[Y * w + X]);
    }
    return best;
  };
  const letter = (ch) => /\p{L}/u.test(ch);

  if (join) {
    for (let i = 0; i < text.length - 1; i++) {
      if (!letter(text[i]) || !letter(text[i + 1])) continue;
      const ex = exit(i), en = entry(i + 1);
      if (!ex || !en || comp(ex[0]) === comp(en[0])) continue;
      const dist = Math.hypot(en[0][0] - ex[0][0], en[0][1] - ex[0][1]);
      brush(ctx, cubic(ex[0], [ex[0][0] + ex[1][0] * dist * 0.4, ex[0][1] + ex[1][1] * dist * 0.4],
        [en[0][0] + en[1][0] * dist * 0.4, en[0][1] + en[1][1] * dist * 0.4], en[0]), sw);
    }
  }
  if (leadIn) {
    // first letter's entry stroke; letters without one (E, O) are joined tangentially at their lowest point
    const en = entry(0) || bottom(0);
    const [p0, d] = en || [[adv[0], ybase], [-1, 0]];
    brush(ctx, swash(p0, d, leadIn * xh, xh, ybase, -1), sw);
    span[0] = p0[0];
  }
  if (tail) {
    const ex = exit(text.length - 1, ends);
    const [p0, d] = ex || [[adv[text.length], ybase], [1, 0]];
    brush(ctx, swash(p0, d, tail * xh, xh, ybase, 1), sw);
    span[1] = p0[0];
  }
  mask = maskOf(ctx, w, h);
  return { mask, stroke, baseline, xh, span };
}

export function strokes(text, family, opts) {
  const r = renderWord(text, family, opts);
  return { edges: skeletonEdges(r.mask, r.stroke), info: { ...r, firstX: r.span[0], lastX: r.span[1] } };
}
