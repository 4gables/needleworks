// Lettering (script and print fonts) -> centerline strokes.
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

function endpoints(sk, stroke) {
  const { pos, edges: raw } = skeletonGraph(sk);
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

// lengths of lead-in / tail are in x-heights. deco "swash" curls off the letters; "dash" is a straight
// rule on the middle of the x-height, apart from the letters (print fonts, which are also left unjoined).
// spacing: extra room between letters, as a fraction of the font size (canvas letterSpacing; the joins below bridge
// script letters it pulls apart). kern: room added after letter i (kern[i], a fraction of the size, may be negative),
// on top of the font's own kerning: the letters are then drawn one by one where the whole word would put them.
export function renderWord(text, family, { leadIn = 0, tail = 0, join = true, deco = "swash", spacing = 0, kern = null } = {}) {
  const probe = canvas(10, 10).getContext("2d");
  const font = `${PX}px "${family}"`;
  probe.font = font;
  if (spacing) probe.letterSpacing = `${spacing * PX}px`;
  const m = probe.measureText(text), mx = probe.measureText("x");
  const shift = [0];
  for (let i = 1; i < text.length; i++) shift.push(shift[i - 1] + (kern?.[i - 1] || 0) * PX);
  const kerned = shift.some((v) => v), lo = Math.min(0, ...shift), hi = Math.max(0, ...shift);
  let inkL = -m.actualBoundingBoxLeft, inkR = m.actualBoundingBoxRight;
  const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
  const xh = mx.actualBoundingBoxAscent + mx.actualBoundingBoxDescent;
  // height of the bulk of the letters: the x-height, or the capitals for an all-caps name
  const mid = /\p{Ll}/u.test(text) ? xh : probe.measureText("H").actualBoundingBoxAscent;
  const pad = Math.ceil(PX * (0.2 + leadIn + tail));
  const w = Math.ceil(inkR - inkL + hi - lo + 2 * pad), h = Math.ceil(asc + desc + PX);
  const ox = pad - inkL - lo, baseline = PX / 2 + asc;
  const c = canvas(w, h), ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.font = font; ctx.fillStyle = "#000"; ctx.textBaseline = "alphabetic";
  if (spacing) ctx.letterSpacing = probe.letterSpacing;
  if (!kerned) ctx.fillText(text, ox, baseline);
  else for (let i = 0; i < text.length; i++)   // (where letter i starts in the whole word, so the font's kerning stays)
    ctx.fillText(text[i], ox + shift[i] + probe.measureText(text.slice(0, i + 1)).width - probe.measureText(text[i]).width, baseline);
  let mask = maskOf(ctx, w, h);
  if (kerned) {   // the ink's real ends, for the dashes
    let a = w, b = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask.data[y * w + x]) { if (x < a) a = x; if (x > b) b = x; }
    if (b >= a) { inkL = a - ox; inkR = b + 1 - ox; }
  }

  // thinned once: the stroke width, the stroke ends and (when nothing gets drawn on) the lettering's own skeleton
  const sk = skeletonize(mask), stroke = strokeWidth(mask, sk);
  const sw = Math.max(2, Math.round(stroke)), ybase = baseline - stroke / 2;
  const span = [ox + inkL, ox + inkR];
  // stroke ends and letter pieces only matter for joins and swashes (not print letters with dashes)
  const needEnds = join || (deco !== "dash" && (leadIn || tail));
  const ends = needEnds ? endpoints(sk, stroke) : [];
  const { labels } = join ? label(mask) : { labels: null };
  let drew = false;
  const adv = Array.from({ length: text.length + 1 }, (_, i) => ox + probe.measureText(text.slice(0, i)).width + (shift[Math.min(i, text.length - 1)] || 0));
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
      drew = true;
    }
  }
  if (deco === "dash") {
    const y = baseline - mid / 2, gap = 0.6 * mid;
    if (leadIn) brush(ctx, [[span[0] - gap - leadIn * xh, y], [span[0] - gap, y]], sw);
    if (tail) brush(ctx, [[span[1] + gap, y], [span[1] + gap + tail * xh, y]], sw);
    drew ||= !!(leadIn || tail);
  } else {
    drew ||= !!(leadIn || tail);
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
  }
  if (!drew) return { mask, stroke, baseline, xh, mid, span, sk };
  return { mask: maskOf(ctx, w, h), stroke, baseline, xh, mid, span };
}

// opts.tongues: keep short dead ends that reach well out of their stroke, a fifth of the x-height or more (`skeletonEdges`;
// thin scripts kept every flick, and a fine line sewn three times over each piled up where it joined)
export function strokes(text, family, opts) {
  const { sk, ...r } = renderWord(text, family, opts);
  // print letters have real short strokes (t's crossbar, a's stem) that script-sized pruning would cut (print fonts are
  // the ones drawn with dash decorations: both callers pass deco "dash" for them)
  // and their loose ends reach out to the ink's edge (an a's stem past its bowl); `sized` are the points to size the
  // lettering by: the strokes as they were before that, so words keep their size
  const edges = skeletonEdges(r.mask, r.stroke, { spur: opts?.deco === "dash" ? 0.45 : 1.3, dots: true, sk, reach: opts?.deco === "dash", tongues: opts?.tongues ? r.mid * 0.2 : 0 });
  return { edges, info: { ...r, firstX: r.span[0], lastX: r.span[1], sized: (edges.before || edges.map((e) => e[2])).flat() } };
}
