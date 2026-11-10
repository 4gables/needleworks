// Busy-design speed budget (category check "speed"). The real page in a frame, driven through its own controls; each
// action is timed by the longest task that blocked the page from the action until everything settled (timers, frames,
// workers), so a slow keystroke or chip shows however the work is split.
//   type     a letter at a time into the longest lettering (and back out), 140 ms apart, like typing
//   fabric   Towel, Knit, Cotton
//   thread   60 wt, 30 wt, Automatic
//   letters  + Appliqué letters (then Undo)
//   names    One for each name, 6 names (blocking time only: the batch may take longer as long as the page answers)
//   long     the longest lettering made one long line, "Happy Birthday Grandma", then typed onto
// Query: ?start=fifteen,fifteen-letters,<starter id>...&budget=500&only=type,fabric. Title "DONE <actions> <over budget>";
// window.perf holds [{ start, act, what, long, ms }]. Run with node tests/perf.mjs CDP_PORT HTTP_PORT.
const Q = new URLSearchParams(location.search);
const STARTS = (Q.get("start") || "fifteen,fifteen-letters,kitchen,wedding,bookmark").split(","), BUDGET = +(Q.get("budget") || 500);
const ONLY = Q.get("only") ? Q.get("only").split(",") : null;
const frame = document.getElementById("app"), out = document.getElementById("out");
const log = (s) => { out.textContent += s + "\n"; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let W, D;
const $ = (id) => D.getElementById(id);
const all = (s) => [...D.querySelectorAll(s)];
const studio = () => { try { return JSON.parse(localStorage.getItem("nw:studio")); } catch { return null; } };
const fire = (el, type) => el.dispatchEvent(new W.Event(type, { bubbles: true }));

async function boot(start) {
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const k of Object.keys(localStorage)) if (k.startsWith("nw:")) localStorage.removeItem(k);
    const set = (k, v) => localStorage.setItem("nw:" + k, JSON.stringify(v));
    set("studio.guideSeen", true); set("studio.applSeen", true); set("doneSeen", true);
    if (start.startsWith("fifteen")) {
      const d = await (await fetch("../fixtures/fifteen.needleworks.json")).json();
      set("studio", { pieces: d.pieces, sel: null, fabric: "cotton", baste: false, thread: "auto", fitted: false, from: "fifteen" }); set("hoop", d.hoop || "5x7");
    }
    frame.src = `../../index.html?pf=${Date.now()}#design`;
    await new Promise((r) => (frame.onload = r));
    W = frame.contentWindow; D = W.document;
    for (let i = 0; i < 100 && D.body.dataset.mode !== "design"; i++) await sleep(50);
    if (D.body.dataset.mode !== "design") continue;   // (the test server sometimes drops a module request)
    instrument();
    await idle(30000);
    if (!start.startsWith("fifteen")) { D.querySelector(`#st-cards [data-start="${start}"]`).click(); await idle(); }
    if (start === "fifteen-letters") { $("st-add").querySelector('[data-add="letters"]').click(); await idle(); D.querySelector("#st-toast:not([hidden]) button")?.click(); await idle(); }
    return;
  }
  throw new Error("the page didn't start");
}
function instrument() {
  W.eval(`(() => {
    const st = window.__pf = { timers: new Map(), raf: new Set(), long: [], errors: [] };
    const sT = window.setTimeout.bind(window), cT = window.clearTimeout.bind(window);
    window.setTimeout = (fn, ms = 0, ...a) => { const id = sT(() => { st.timers.delete(id); if (typeof fn === "function") fn(...a); }, ms); if (ms <= 1500) st.timers.set(id, ms); return id; };
    window.clearTimeout = (id) => { st.timers.delete(id); cT(id); };
    const sR = window.requestAnimationFrame.bind(window), cR = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) => { const id = sR((t) => { st.raf.delete(id); fn(t); }); st.raf.add(id); return id; };
    window.cancelAnimationFrame = (id) => { st.raf.delete(id); cR(id); };
    window.addEventListener("error", (e) => st.errors.push(e.message));
    new PerformanceObserver((l) => { for (const e of l.getEntries()) st.long.push(e.duration); }).observe({ type: "longtask" });
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) return; return click.call(this); };
  })()`);
}
async function idle(max = 30000) {
  const t0 = performance.now();
  let calm = 0;
  while (performance.now() - t0 < max) {
    await sleep(20);
    const s = W.__pf, busy = s.timers.size || s.raf.size || D.fonts.status !== "loaded" || ($("busy") && !$("busy").hidden)
      || /Quilting|Filling|Re-stitching/.test($("download").textContent);
    calm = busy ? 0 : calm + 1;
    if (calm >= 3) return performance.now() - t0;
  }
  return -1;
}
// one action: the longest task from its start until the page settles
async function timed(fn) {
  await idle(); await sleep(60);
  const n0 = W.__pf.long.length, t0 = performance.now();
  await fn();
  await idle(); await sleep(60);   // (a long task is reported a moment after it ends)
  return { long: Math.round(Math.max(0, ...W.__pf.long.slice(n0))), ms: Math.round(performance.now() - t0) };
}
function pick(id) { D.querySelector(`#st-pieces .pick[data-id="${id}"]`)?.click(); }
const chip = (sel) => async () => { D.querySelector(sel).click(); return ""; };
// each action: [name, what it does (null when it doesn't apply to this design)], timed one by one
const ACTS = {
  type: [["type", async () => {
    const s = studio(), ps = (s?.pieces || []).filter((p) => p.kind === "text");
    if (!ps.length) return null;
    const p = ps.reduce((a, b) => (b.text.length > a.text.length ? b : a)); pick(p.id); await idle();
    const el = D.querySelector("#st-edit textarea[data-k=text], #st-edit input[data-k=text]"); if (!el) return null;
    el.focus(); const v0 = el.value, add = " Ann";
    for (let k = 1; k <= add.length; k++) { el.value = v0 + add.slice(0, k); fire(el, "input"); await sleep(140); }
    for (let k = add.length - 1; k >= 0; k--) { el.value = v0 + add.slice(0, k); fire(el, "input"); await sleep(140); }
    el.blur();
    return JSON.stringify(p.text.slice(0, 20));
  }]],
  fabric: ["towel", "knit", "cotton"].map((f) => [`fabric ${f}`, chip(`#st-fabric [data-fab="${f}"]`)]),
  thread: ["60", "30", "auto"].map((t) => [`thread ${t}`, chip(`#st-thread [data-thread="${t}"]`)]),
  letters: [["+ Appliqué letters", async () => {
    $("st-add").querySelector('[data-add="letters"]').click(); await idle();
    const n = studio()?.pieces.length, b = D.querySelector("#st-toast:not([hidden]) button");
    return `${n} pieces${b ? `, toast "${b.textContent}"` : ""}`;
  }], ["undo", async () => { $("st-undo")?.click(); return ""; }]],
  names: [["names", async () => {
    if (!$("names-open") || $("names-open").hidden || $("names-open").disabled) return null;
    $("names-open").click(); $("names-list").value = "Ava\nBenjamin\nZoë\nO'Neil\nMia\nTheodore"; fire($("names-list"), "input");
    const t0 = performance.now(); $("names-make").click();
    while (/Making/.test($("names-note").textContent) && performance.now() - t0 < 60000) await sleep(50);
    const what = $("names-note").textContent.slice(0, 60); $("names").close(); return what;
  }]],
};
// (last: it changes the design) a long one-line name, then typed onto a letter at a time: every keystroke draws the
// whole line again (a 22-letter line in Great Vibes held the page 1.8 s)
ACTS.long = [["long line", async () => {
  const el = await longest(); if (!el) return null;
  el.focus(); el.value = "Happy Birthday Grandma"; fire(el, "input"); el.blur(); return "set";
}], ["long line typed", async () => {
  const el = await longest(); if (!el) return null;
  el.focus(); const v0 = el.value;
  for (const [k] of [..." Jo"].entries()) { el.value = v0 + " Jo".slice(0, k + 1); fire(el, "input"); await sleep(140); }
  el.blur(); return JSON.stringify(el.value);
}]];
async function longest() {
  const ps = (studio()?.pieces || []).filter((p) => p.kind === "text");
  if (!ps.length) return null;
  pick(ps.reduce((a, b) => (b.text.length > a.text.length ? b : a)).id); await idle();
  return D.querySelector("#st-edit textarea[data-k=text], #st-edit input[data-k=text]");
}
const res = [];
for (const start of STARTS) {
  await boot(start);
  for (const [k, list] of Object.entries(ACTS)) {
    if (ONLY && !ONLY.includes(k)) continue;
    for (const [name, fn] of list) {
      let what = null;
      const t = await timed(async () => { what = await fn(); });
      if (what === null) continue;
      const r = { start, act: name, what, ...t };
      res.push(r); log(`${start} | ${name}${what ? ` ${what}` : ""}: longest ${t.long} ms, ${t.ms} ms in all${t.long > BUDGET && k !== "names" ? "  OVER" : ""}`);
    }
  }
  if (W.__pf.errors.length) log(`${start} errors: ${W.__pf.errors.join(" | ")}`);
}
window.perf = res;
document.title = `DONE ${res.length} ${res.filter((r) => r.long > BUDGET && r.act !== "names").length}`;
