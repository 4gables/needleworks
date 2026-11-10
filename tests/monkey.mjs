// Runs the Design-tab monkey (tests/browser/monkey.html) for a range of seeds and start designs and sums up what it
// found. It guards the layout class of bugs: a design that fits said Too big or the other way round, two hoopings
// nobody asked for, new pieces placed past the hoop or into each other, collisions not said, one-tap fixes that don't
// land or bring new warnings, settings shown stale after a hoop/fabric/turn change, actions that block the page past a
// budget (see the header of monkey.js for every check). Each problem comes with a shrunk step list to replay.
//
// usage (the test server and a headless Chrome running, as for the batches):
//   .venv/bin/python tests/batch_server.py out/batch 8782 &   node tests/cdp.mjs 9312 start /tmp/mk
//   node tests/monkey.mjs 9312 8782 [--seeds 1-20] [--steps 200] [--start default,fifteen,random,<starter id>...] [--budget 1000] [--shrink]
//   replay one:  open http://127.0.0.1:8782/tests/browser/monkey.html?start=default&replay=<replay string>
// Exit code 1 when anything was found. ~1 s a step (the 15-piece design ~2 s).
import { execFileSync } from "node:child_process";
import path from "node:path";

const [cdp, http, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf("--" + k); return i < 0 ? d : rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[i + 1] : true; };
const [s0, s1] = String(opt("seeds", "1-5")).split("-").map(Number);
const steps = +opt("steps", 200), starts = String(opt("start", "default,fifteen")).split(","), budget = +opt("budget", 1000), shrink = opt("shrink", false) ? 1 : 0;
const here = path.dirname(new URL(import.meta.url).pathname);
const d = (...a) => execFileSync("node", [path.join(here, "cdp.mjs"), cdp, ...a], { encoding: "utf8", maxBuffer: 64 << 20 }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const found = new Map();
let runs = 0, slow = 0, total = 0;
for (const start of starts) for (let seed = s0; seed <= (s1 || s0); seed++) {
  d("goto", `http://127.0.0.1:${http}/tests/browser/monkey.html?seed=${seed}&steps=${steps}&start=${start}&budget=${budget}&shrink=${shrink}&v=${Date.now()}`);
  let t = "";
  for (let i = 0; i < 4000; i++) { await sleep(1500); t = d("eval", "document.title"); if (/DONE/.test(t)) break; }
  const r = JSON.parse(JSON.parse(d("eval", "JSON.stringify(window.monkey || null)")) || "null");
  runs++;
  if (!r || r.crash) { console.log(`${start} seed ${seed}: CRASH ${r?.crash || t}`); found.set("crash " + start + seed, { kind: "crash", msg: r?.crash || t, seed, start }); continue; }
  slow += r.slow; total += r.steps;
  console.log(`${start} seed ${seed}: ${r.steps} steps, ${r.problems.length} problems, ${r.slow} slow, worst ${r.worst.map(([a, ms]) => `${a} ${ms}`).join(", ")}`);
  for (const p of r.problems) {
    const key = p.kind + "|" + p.msg.replace(/[\d.]+/g, "#").replace(/“[^”]*”/g, "“”");
    if (!found.has(key)) found.set(key, { ...p, seed, start, n: 0 });
    found.get(key).n++;
    console.log(`  ${p.kind} @${p.step} ${p.act}${p.what ? ` (${String(p.what).slice(0, 50)})` : ""}: ${p.msg}${p.replay ? `\n    replay: start=${start}&replay=${p.replay}` : ""}`);
  }
}
console.log(`\n${runs} runs, ${total} steps, ${slow} over ${budget} ms, ${found.size} kinds of problem`);
const by = {};
for (const p of found.values()) by[p.kind] = (by[p.kind] || 0) + 1;
console.log(Object.entries(by).map(([k, n]) => `${k} ${n}`).join(", "));
process.exit(found.size ? 1 : 0);
