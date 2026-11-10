// Busy-design speed budget (category check "speed"): tests/browser/perf.html times the Design tab's everyday actions
// (typing in long lettering, fabric, thread, + Appliqué letters, the names batch) on the 15-piece design, with and
// without appliqué letters, and on a few starters, by the longest task that blocked the page. Fails when one is over
// the budget (500 ms; the names batch only reported: it may take longer as long as the page answers between names).
// usage (the test server and a headless Chrome running, as for the batches):
//   .venv/bin/python tests/batch_server.py out/batch 8784 &   node tests/cdp.mjs 9314 start /tmp/pf
//   node tests/perf.mjs 9314 8784 [--start fifteen,fifteen-letters,kitchen,wedding,bookmark] [--only type,fabric] [--budget 500]
// ~3 min. Headless Chrome draws without a GPU, so the preview's share is more than on a person's computer.
import { execFileSync } from "node:child_process";
import path from "node:path";

const [cdp, http, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf("--" + k); return i < 0 ? d : rest[i + 1]; };
const here = path.dirname(new URL(import.meta.url).pathname);
const d = (...a) => execFileSync("node", [path.join(here, "cdp.mjs"), cdp, ...a], { encoding: "utf8", maxBuffer: 64 << 20 }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = new URLSearchParams({ budget: opt("budget", "500"), ...(opt("start") ? { start: opt("start") } : {}), ...(opt("only") ? { only: opt("only") } : {}), v: Date.now() });
let t = "";
for (let attempt = 0; attempt < 3 && !/DONE/.test(t); attempt++) {
  d("goto", `http://127.0.0.1:${http}/tests/browser/perf.html?${q}`);
  for (let i = 0; i < 400; i++) { await sleep(1500); t = d("eval", "document.title"); if (/DONE/.test(t)) break; if (i === 20 && !/perf/.test(t) && !d("eval", "document.getElementById('out').textContent")) break; }
}
const rows = JSON.parse(JSON.parse(d("eval", "JSON.stringify(window.perf || null)")) || "null");
if (!rows) { console.log("perf page didn't finish: " + t); process.exit(1); }
const budget = +opt("budget", "500");
for (const r of rows) console.log(`${r.long > budget && r.act !== "names" ? "OVER" : "ok  "} ${String(r.long).padStart(5)} ms  ${r.start} | ${r.act}${r.what ? ` ${r.what.replace(/\n/g, " / ")}` : ""}`);
const over = rows.filter((r) => r.long > budget && r.act !== "names");
console.log(`\n${rows.length} actions, ${over.length} over ${budget} ms; worst ${Math.max(...rows.filter((r) => r.act !== "names").map((r) => r.long))} ms`);
process.exit(over.length ? 1 : 0);
