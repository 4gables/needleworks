/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// A picture before it is stitches, on the page: its copies drawn on a canvas, its separate parts, where it is cut and
// how big it is drawn for a Size, and the tries that land on that Size. Nothing here makes stitches (digitize.js does,
// and hands these on), so both builds ship it (docs/roadmap.md "The paid version").
import { distanceTransform, label } from "./grid.js";
import { RES, ROWS, STYLE } from "./limits.js";
import { MARGIN } from "./machines.js";

// the Density choice's rows apart (core/limits.js)
export const DENSITY = ROWS;

// The Picture tab's copies of a picture (also used by tests/browser/picture_corpus.html, so it sews what the page sews).
// OffscreenCanvas where available (iOS 16.4+), a plain canvas otherwise.
function canvasOf(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
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

// Size is the sewn design's longer side, not the picture's: a framed photo at "174 mm" sewed 84 x 58 mm, and a
// picture could never fill the hoop. box: the part of the picture whose colours were learned ({ sx, sy, sw, sh },
// picture px); boxes: the extent of each colour to be sewn, fractions of box ([x0, y0, x1, y1], from learnColours).
// Returns where to cut the picture (`crop`, picture px, and `frac`, fractions of box), the working size in px to draw
// it at, and `max`: the largest longer side (mm) that fits the hoop field. `fit`: how much bigger to draw it than its
// colours' extent says, learned from the last time it was sewn (the edges' blend pixels and specks aren't sewn: 100 mm
// came out 99 x 88).
export function picturePlan(box, boxes, sizeMm, hoop, res = RES, fit = 1) {
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
    // (the paid build's reply is a preview: the size is the whole file's)
    if (r.real?.extent) [x0, y0, x1, y1] = r.real.extent;
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

// A flat picture (a logo, lettering) is also sent twice as fine as it is worked at, when it has the pixels: small
// letters' strokes are read from that copy (digitize.js `o.fine`). `flat`: the worker's measure of it (0-1).
export const finer = (flat, crop, w) => flat >= 0.55 && crop.sw >= 1.2 * w;
// the picture's colours are learned from a copy this size (px, longer side) whatever the Size or hoop, so changing
// either never changes the threads
export const LEARN = 800;

export function pictureImage(bitmap, box, w, h) {
  const c = canvasOf(w, h), ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, box.sx, box.sy, box.sw, box.sh, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// The style a fresh picture starts in: Line drawing when at least STYLE.line of its ink lies in strokes no wider than
// STYLE.wide of the picture's longer side, drawn in at most STYLE.inks colours (artPicture's count, the page's colour
// with them); else Filled. Cross-stitch is never the start (a photo and a soft-shaded illustration measured alike:
// the person picks it). Scale-free: a line drawing is one at any Size (measured at the Size, the line cat's thin share
// fell from 0.98 at 100 mm to 0.25 at 150 mm). `size` (mm) only says in the reason how fine the lines sew.
// Returns { style, start, why, line } (`start`: the page starts the picture in it; `line`: the thin share).
export function chooseStyle(f, size) {
  const { line, wide, inks } = STYLE, k = (wide * f.long) / 2;
  const thin = f.thick.reduce((a, v, r) => a + (r > 0 && r <= k ? v : 0), 0);
  // (a picture of words is sewn as lettering, Filled: picjob.js `wordsShare`)
  if (f.ink > 0 && thin >= line && (f.colours || 0) <= inks && !(f.words >= 0.6)) {
    return { style: "line", start: true, line: +thin.toFixed(3), why: "Looks like a line drawing, so it's sewn as one." };
  }
  return { style: "fill", start: false, line: +thin.toFixed(3), why: "" };
}
