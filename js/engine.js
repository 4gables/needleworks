/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The engine's door. Everything that MAKES stitches reaches the page through this one module: the picture and doctor
// jobs, the fixed copy of a failing file, the Design tab. What only READS a file (the reader, the counts, the checker's
// rules, the drawing) the page imports where it lives.
//
// This file is the full app's door: the engine runs in the page and its workers. The paid build ships
// engine-remote.js in its place (same names, the jobs sent to the server), and tests/door.test.mjs holds the page to
// the door: a page file that imports a stitch-making module directly fails it. docs/roadmap.md "The paid version".
import { jobQueue } from "./jobs.js";
import { fewerBlocks } from "./checkup.js";
import { fix } from "./doctor.js";
import { readEmbroidery, validatePES, writePES } from "./core/formats.js";
import { verdictOf } from "./quality.js";

export const BUILD = "full";
// (the paid build fetches a job's whole file for a code; here the page holds every file whole)
export const wholeFile = async () => ({ ok: false, error: "" });
export { initStudio } from "./studio/ui.js";
export { turnForMachine } from "./core/design.js";

// One job at a time, only the newest waiting (jobs.js). The picture worker takes { key, learn, img, crop, opts, pick }
// (worker.js), the doctor's { d, opts, fit } (doctor-worker.js).
export const pictureJobs = (opts) => jobQueue(new URL("./worker.js", import.meta.url), opts);
export const doctorJobs = (opts) => jobQueue(new URL("./doctor-worker.js", import.meta.url), opts);

// A copy of a file that fails the quality check, fixed by the design doctor (thin to 24 hits/mm², drop tiny and
// same-hole stitches, even out sparse satins; long stitches are always split), judged again, or null when that doesn't
// make it pass. Each try adds what the last still failed (splitting long15.pes's stitches showed a same-hole stitch of
// its own), the last every fix. Same blocks and pauses, so "How to stitch it" still holds.
export function fixedCopy(bytes, problems, hoop) {
  const k = new Set(problems.map((p) => p.key));
  try {
    for (let pass = 0; pass < 3; pass++) {
      const opts = pass === 2 ? { thin: true, tiny: true, satin: true } : { thin: k.has("dense"), tiny: k.has("tiny") || k.has("same"), satin: k.has("sparse") };
      // (more thread changes than the machine handles: each thread's parts sewn together, if that's enough)
      let src = readEmbroidery(bytes, "x.pes");
      if (k.has("blocks") && !(src = fewerBlocks(src))) return null;
      const p = fix(src, opts), out = writePES(p), left = verdictOf(out);
      if (validatePES(out, p, hoop).ok && !left.length) return { bytes: out, against: p };
      for (const q of left) k.add(q.key);
    }
  } catch {}
  return null;
}
