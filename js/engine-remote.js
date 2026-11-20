/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The engine's door in the paid build (docs/paid-version.md): the same names as engine.js, and nothing behind them
// that makes stitches. The jobs go to the server; the Design tab is not here yet.
import { jobQueue } from "./jobs.js";
import { API } from "./api.js";

export const BUILD = "paid";

export const pictureJobs = (opts) => jobQueue(new URL("./remote-picture.js", import.meta.url), opts);
export const doctorJobs = (opts) => jobQueue(new URL("./remote-doctor.js", import.meta.url), opts);

// The whole file of a job, for one use of a code: { ok, bytes, left } or { ok: false, error }.
export async function wholeFile(job, code) {
  try {
    const res = await fetch(`${API}/file`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job, code }) });
    if (!res.ok) { const r = await res.json().catch(() => ({})); return { ok: false, code: r.code, error: r.error || "The file couldn't be fetched. Try again." }; }
    const left = res.headers.get("x-uses-left");
    return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()), left: left === "Infinity" ? Infinity : left == null ? null : +left };
  } catch {
    return { ok: false, code: "offline", error: "The stitching service couldn't be reached. Check your connection and try again." };
  }
}

// (the checkup's fixes run on the server; a failing file gets no one-tap fixed copy at Download here)
export const fixedCopy = () => null;
// (only the Design tab turns a design into the machine's hoop on the page)
export const turnForMachine = (p) => p;
// The Design tab, not in this build yet: nothing in it, nothing to add to, nothing to make.
export function initStudio() {
  const never = { empty: () => true, another: () => false, forNames: () => null, selBox: () => null, title: () => "", autoName: () => "" };
  return new Proxy(never, { get: (t, k) => t[k] || (() => undefined) });
}
