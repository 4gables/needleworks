/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The stores, in memory: for `node server/dev.mjs` and the tests. codes: { CODE: uses } (Infinity: never runs out).
export function memoryStore(codes = {}, { perMinute = 600, perDay = 2000 } = {}) {
  const files = new Map(), left = new Map(Object.entries(codes)), had = new Map(), hits = new Map(), days = new Map();
  return {
    files,
    async putFile(id, bytes) { files.set(id, bytes); },
    async getFile(id) { return files.get(id) || null; },
    // (a file already fetched with this code is fetched again for nothing)
    async spend(code, job) {
      if (!left.has(code)) return { ok: false, error: "That code isn't one of ours. Check it and try again." };
      const mine = had.get(code) || had.set(code, new Set()).get(code);
      if (mine.has(job)) return { ok: true, left: left.get(code) };
      if (left.get(code) < 1) return { ok: false, error: "That code has no downloads left." };
      left.set(code, left.get(code) - 1); mine.add(job);
      return { ok: true, left: left.get(code) };
    },
    async hit(who, code = "", counted = false) {
      const now = Math.floor(Date.now() / 60000), h = hits.get(who);
      if (!h || h.at !== now) hits.set(who, { at: now, n: 1 }); else if (++h.n > perMinute) return "often";
      if (!counted || left.has(code)) return "";
      const day = `${who}#${Math.floor(now / 1440)}`, n = (days.get(day) || 0) + 1;
      days.set(day, n);
      return n > perDay ? "daily" : "";
    },
  };
}
