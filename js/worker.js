// Runs picture digitizing off the main thread.
import { analyze, digitize, toPalette } from "./core/digitize.js";
import { writePES } from "./core/formats.js";
import { turnPattern } from "./core/design.js";

let last = null;   // { key, analysis } so moving sliders that don't change colours is fast
self.onmessage = (e) => {
  const { id, img, opts } = e.data;
  try {
    const key = `${img.width}x${img.height}:${opts.colors}:${opts.removeBackground}:${opts.imageKey}`;
    const analysis = last && last.key === key ? last.analysis : analyze(img, opts);
    last = { key, analysis };
    const a = opts.palette?.length ? toPalette(analysis, opts.palette) : analysis;
    const { design, summary, fine } = digitize(img, a, opts);
    // digitized in the sideways hoop when turned; the file always loads in the machine's orientation
    const pattern = opts.turn ? turnPattern(design.pattern()) : design.pattern();
    const bytes = writePES(pattern);
    self.postMessage({ id, ok: true, pattern, bytes, summary, fine,
      colors: a.colors, labels: a.labels, w: a.w, h: a.h }, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message || String(err) });
  }
};
