/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Runs picture digitizing off the main thread.
import { DEFAULTS, MOST, digitize, keptParts, labelWith, learnColours, pictureInk, toPalette } from "./core/digitize.js";
import { insideOf } from "./core/palette.js";
import { writePES } from "./core/formats.js";
import { turnForMachine } from "./core/design.js";
import { nearestBrotherThread } from "./core/threads.js";

// The colours learned from the picture's fixed-size copy, kept per picture and colour count (Size, Turn hoop and the
// fill settings reuse them), and the last labelled working copy (moving sliders that don't change it is fast); `ref`:
// the learned copy labelled with the most colours, kept per picture, for what's left out (keptParts)
let model = null, labelled = null, ref = null;
self.onmessage = (e) => {
  const { id, key, learn, img, crop, opts } = e.data;
  try {
    if (model?.key !== key) model = { key, m: learnColours(learn, opts) };
    const m = model.m;
    if (m.empty) throw Object.assign(new Error(m.empty), { code: "empty" });
    // only the colours and where each lies: the page cuts and sizes the picture by what will be sewn
    if (!img) {
      self.postMessage({ id, ok: true, measure: true, key, boxes: m.boxes, colors: m.colors.map(({ id: i, background, inside }) => ({ id: i, background, inside })) });
      return;
    }
    // (a line drawing draws the edges of colours: the fabric's colour inside the design stays fabric)
    const inside = insideOf(opts), lk = `${key}:${img.width}x${img.height}:${crop.join(",")}:${inside}`;
    if (labelled?.key !== lk) labelled = { key: lk, analysis: labelWith(img, m, crop, { inside, res: DEFAULTS.res }) };
    const analysis = labelled.analysis;
    const p = opts.palette?.length ? toPalette(analysis, opts.palette) : analysis;
    // a thread picked on a colour's chip (`swap`: id -> { hex: a Brother thread's }) sews that colour instead of the one it
    // was matched to; where it comes in the sewing order stays (its lightness is the picture's)
    const a = opts.swap ? { ...p, colors: p.colors.map((c) => (opts.swap[c.id] ? { ...c, hex: opts.swap[c.id].hex, thread: nearestBrotherThread(opts.swap[c.id].hex) } : c)) } : p;
    const { design, summary, fine, res, origin } = digitize(img, a, opts);
    // (what of the picture was left out, measured on the learned copy: the same parts at every Size and colour count)
    model.full ||= labelWith(learn, m);
    if (ref?.key !== e.data.ref) ref = { key: e.data.ref, ink: pictureInk(learn, labelWith(learn, learnColours(learn, { ...opts, colors: MOST }))) };
    fine.kept = keptParts(ref.ink, model.full, design.pattern(), { w: img.width, h: img.height, res, origin }, crop, opts);
    // digitized in the sideways hoop when turned; the file always loads in the machine's orientation
    const pattern = opts.turn ? turnForMachine(design.pattern()) : design.pattern();
    const bytes = writePES(pattern);
    self.postMessage({ id, ok: true, pattern, bytes, summary, fine,
      colors: a.colors, merged: analysis.merged, closed: analysis.closed || 0, spare: !!m.spare && inside === "auto", flat: m.flat, smooth: !!m.smooth, framed: !!analysis.frame, owned: a.owned, labels: a.labels, w: a.w, h: a.h, res }, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message || String(err), code: err.code });
  }
};
