/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Runs the design doctor's fixes off the main thread (docjob.js `doctorJob`): re-stitching a big design at 250 % took
// 10 s (star_badge.pes) with the page frozen.
import { doctorJob } from "./docjob.js";

self.onmessage = (e) => {
  const { id } = e.data;
  try {
    const r = doctorJob(e.data);
    self.postMessage({ id, ok: true, ...r }, [r.bytes.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message || String(err) });
  }
};
