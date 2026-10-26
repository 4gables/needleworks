// Runs picture digitizing off the main thread.
import { analyze, digitize } from "./core/digitize.js";
import { writePES, designStats } from "./core/formats.js";
import { turnPattern } from "./core/design.js";

let last = null;   // { key, analysis } so moving sliders that don't change colours is fast
self.onmessage = (e) => {
  const { id, img, opts } = e.data;
  try {
    const key = `${img.width}x${img.height}:${opts.colors}:${opts.removeBackground}:${opts.imageKey}`;
    const analysis = last && last.key === key ? last.analysis : analyze(img, opts);
    last = { key, analysis };
    const { design, summary } = digitize(img, analysis, opts);
    // digitized in the sideways hoop when turned; the file always loads in the machine's orientation
    const pattern = opts.turn ? turnPattern(design.pattern()) : design.pattern();
    const bytes = writePES(pattern);
    self.postMessage({ id, ok: true, pattern, bytes, summary, stats: designStats(pattern),
      colors: analysis.colors, labels: analysis.labels, w: analysis.w, h: analysis.h }, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message || String(err) });
  }
};
