/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// A doctor job: an opened pattern fixed (and resized), its PES bytes and its checkup. Called by the doctor worker
// (doctor-worker.js) and by the server (server/handler.mjs) alike. data: { d (the opened pattern), opts, fit }: with
// `fit` ([w, h] mm) a size meant to fit the hoop is made smaller until the copy does, and the scale it was made at
// comes back.
import { checkup, fitFix, fix } from "./doctor.js";
import { readEmbroidery, writePES } from "./core/formats.js";

export function doctorJob({ d, opts, fit }) {
  // (the checkup reads the bytes back: it describes the file that will be saved, after the writer's splits and
  // rounding, not the pattern handed to it)
  const made = fit ? fitFix(d, opts, fit) : null, scale = made ? made.scale : opts.scale;
  const pattern = made ? made.pattern : fix(d, opts), bytes = writePES(pattern), check = checkup(readEmbroidery(bytes, "fixed.pes"));
  return { pattern, bytes, check, scale };
}
