/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Work done off the page, one queue per worker: pictures (worker.js), the doctor's fixes and re-stitched design files
// (doctor-worker.js), quilting and carved fills (quilt-worker.js). Each had its own queue, and only the pictures' had
// a time limit or outlived a worker that died.
//   run(msg): the worker's reply; one job at a time, only the newest waiting (three quick slider moves on a slow
//     picture computed all three): a job overtaken while it waited answers { ok: false, stale: true }.
//   A job past `limit` ms is stopped and answers { ok: false, code: "slow", error: slow } (a photo once routed for
//     over 5 minutes, every later change queued behind it). A worker that dies, or can't be started, answers
//     { ok: false, died: true, error } (it never answered: Download waited for good). Either way the next job gets
//     a new worker.
//   stop(): drops what's waiting and running (each answers stale).
export function jobQueue(url, { limit = 0, slow = "This is taking too long.", eager = false } = {}) {
  let w = null, running = null, waiting = null, watch = 0;
  const start = () => {
    w = new Worker(url, { type: "module" });
    w.onmessage = (e) => finish(e.data);
    w.onerror = (e) => { drop(); finish({ ok: false, died: true, error: e.message || "" }); };
  };
  const drop = () => { clearTimeout(watch); try { w?.terminate(); } catch { /* gone already */ } w = null; };
  const finish = (r) => { clearTimeout(watch); const j = running; running = null; j?.ok(r); next(); };
  const next = () => {
    if (running || !waiting) return;
    running = waiting; waiting = null;
    try { if (!w) start(); w.postMessage(running.msg); }
    catch (err) { drop(); setTimeout(() => finish({ ok: false, died: true, error: err.message || "" })); return; }
    if (limit) watch = setTimeout(() => { drop(); finish({ ok: false, code: "slow", error: slow }); }, limit);
  };
  if (eager) try { start(); } catch { w = null; }
  return {
    run: (msg) => new Promise((ok) => { waiting?.ok({ ok: false, stale: true }); waiting = { msg, ok }; next(); }),
    stop() { waiting?.ok({ ok: false, stale: true }); waiting = null; if (running) { drop(); const j = running; running = null; j.ok({ ok: false, stale: true }); } },
    get busy() { return !!running; },
  };
}
