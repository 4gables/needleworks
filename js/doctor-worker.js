/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Runs the design doctor's fixes off the main thread: re-stitching a big design at 250 % took 10 s (star_badge.pes)
// with the page frozen. Gets { id, d (the opened pattern), opts }, sends back the fixed pattern, its PES bytes and its
// checkup.
import { checkup, fix } from "./doctor.js";
import { readEmbroidery, writePES } from "./core/formats.js";

self.onmessage = (e) => {
  const { id, d, opts } = e.data;
  try {
    // (the checkup reads the bytes back: it describes the file that will be saved, after the writer's splits and
    // rounding, not the pattern handed to it)
    const pattern = fix(d, opts), bytes = writePES(pattern), check = checkup(readEmbroidery(bytes, "fixed.pes"));
    self.postMessage({ id, ok: true, pattern, bytes, check }, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message || String(err) });
  }
};
