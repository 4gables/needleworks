/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Runs picture digitizing off the main thread (picjob.js `pictureJob`).
import { pictureJob } from "./picjob.js";

self.onmessage = (e) => {
  const { id } = e.data;
  try {
    const r = pictureJob(e.data);
    self.postMessage({ id, ok: true, ...r }, r.bytes ? [r.bytes.buffer] : []);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message || String(err), code: err.code });
  }
};
