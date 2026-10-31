/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Runs picture digitizing off the main thread.
import { digitize, labelWith, learnColours, toPalette } from "./core/digitize.js";
import { writePES } from "./core/formats.js";
import { turnForMachine } from "./core/design.js";

// The colours learned from the picture's fixed-size copy, kept per picture and colour count (Size, Turn hoop and the
// fill settings reuse them), and the last labelled working copy (moving sliders that don't change it is fast)
let model = null, labelled = null;
self.onmessage = (e) => {
  const { id, key, learn, img, crop, opts } = e.data;
  try {
    if (model?.key !== key) model = { key, m: learnColours(learn, opts) };
    const m = model.m;
    if (m.empty) throw Object.assign(new Error(m.empty), { code: "empty" });
    // only the colours and where each lies: the page cuts and sizes the picture by what will be sewn
    if (!img) {
      self.postMessage({ id, ok: true, measure: true, key, boxes: m.boxes, colors: m.colors.map(({ id: i, background }) => ({ id: i, background })) });
      return;
    }
    const lk = `${key}:${img.width}x${img.height}:${crop.join(",")}`;
    if (labelled?.key !== lk) labelled = { key: lk, analysis: labelWith(img, m, crop) };
    const analysis = labelled.analysis;
    const a = opts.palette?.length ? toPalette(analysis, opts.palette) : analysis;
    const { design, summary, fine } = digitize(img, a, opts);
    // digitized in the sideways hoop when turned; the file always loads in the machine's orientation
    const pattern = opts.turn ? turnForMachine(design.pattern()) : design.pattern();
    const bytes = writePES(pattern);
    self.postMessage({ id, ok: true, pattern, bytes, summary, fine,
      colors: a.colors, merged: analysis.merged, owned: a.owned, labels: a.labels, w: a.w, h: a.h }, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message || String(err), code: err.code });
  }
};
