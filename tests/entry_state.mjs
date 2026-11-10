// Class guarded: state leaking across the ways a new design replaces the one there (rounds 9-11: felt stayed on after
// Add words, a turned stocking cuff left the next file turned, Open saved switched the hoop unsaid; round 12 found a
// starter's tip and the zoom kept after Open saved and printed on its sew sheet, a step view kept into a new starter,
// Undo of a starter losing the file's name and the hoop's turn, Undo of Open saved leaving the old design in the
// saved design's hoop, a saved design dropped on the page called a damaged embroidery file).
// Each entry point is taken twice: in a fresh profile, and after a "dirty" design (towel, 60 wt, basting, turned,
// renamed, zoomed, a step view, a starter's tip). Both must give the same state (fabric, thread, basting, two
// hoopings, name, starter, tip, zoom, step view, turn, pieces, sew-sheet notes), except what the entry point itself
// carries; then Undo gives back the dirty design as it was (and its hoop), with no note's action left up.
// Entry points: a starter, a starter laid out turned (Pet bandana), an old #bookmark link, Open > Add words, Picture >
// start a new design, Open saved (a plain file; one saved for the 4x4), a saved design opened on the Open tab (as a
// drop or the share target does), a whole design pasted into an empty one.
// usage: node tests/cdp.mjs PORT start DIR; serve the site (tests/batch_server.py out/batch HTTP); then
//        node tests/entry_state.mjs PORT http://127.0.0.1:HTTP      (~3 min; prints DONE <checks> <problems>)
const [port, base] = process.argv.slice(2);
if (!port || !base) { console.log("usage: node tests/entry_state.mjs CDP_PORT BASE_URL"); process.exit(2); }
const ctl = `http://127.0.0.1:${+port + 100}/`;
const call = async (cmd, ...args) => (await (await fetch(ctl, { method: "POST", body: JSON.stringify({ cmd, args }) })).text()).trim();
const ev = async (js) => { const t = await call("eval", js); if (t.startsWith("ERROR")) throw new Error(t); return t === "undefined" || t === "" ? undefined : JSON.parse(t); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0; const problems = [];
const check = (what, ok, detail = "") => { checks++; if (!ok) problems.push(`${what}${detail ? `: ${detail}` : ""}`); };
// a fresh profile (the page's own storage cleared), on the Design tab
async function fresh() {
  for (let i = 0; i < 8; i++) {
    await call("goto", `${base}/manifest.webmanifest?v=${Date.now()}`).catch(() => {});
    await ev(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("nw:")) localStorage.removeItem(k); localStorage.setItem("nw:doneSeen", "true"); localStorage.setItem("nw:studio.guideSeen", "true"); localStorage.setItem("nw:studio.applSeen", "true"); return 1; })()`).catch(() => {});
    await call("goto", `${base}/?v=e${Date.now()}${i}#design`);
    for (let k = 0; k < 30; k++) { await sleep(300); if (await ev("document.body.dataset.mode ? 1 : 0").catch(() => 0)) { await run(`await __e.settle(2500);`); return; } }
  }
  throw new Error("the page didn't start");
}
const H = `(() => { if (window.__e) return; const $ = (id) => document.getElementById(id);
  window.__e = {
  put: (sel, bytes, name, type = "") => { const dt = new DataTransfer(); dt.items.add(new File([bytes], name, { type })); const i = document.querySelector(sel); i.files = dt.files; i.dispatchEvent(new Event("change", { bubbles: true })); },
  wait: async (ok, ms = 30000) => { for (let t = 0; t < ms && !ok(); t += 100) await new Promise((r) => setTimeout(r, 100)); return ok(); },
  // (settled: the Download button no longer working something out)
  settle: async (ms = 1500) => { await new Promise((r) => setTimeout(r, ms)); await __e.wait(() => !/Quilting|Re-stitching|Waiting/.test($("download").textContent)); },
  state: () => { const s = JSON.parse(localStorage.getItem("nw:studio") || "null"), t = $("st-toast"), v = nwTest.view();
    return { fabric: s?.fabric, thread: s?.thread, baste: s?.baste, two: !!s?.two, title: s?.title || "", from: s?.from || "", fitted: !!s?.fitted, tip: s?.tip || "",
      pieces: (s?.pieces || []).map((p) => p.kind + ":" + (p.text ?? p.letters ?? p.name ?? p.border ?? "")).join("|"), ...nwTest.state(),
      shownTip: $("st-tip").hidden ? "" : $("st-tip").textContent, notes: (v?.sheet?.notes || []).filter(Boolean).join(" / "), dl: $("download").textContent,
      toastAction: !t.hidden && !t.classList.contains("gone") && t.querySelector("button") ? t.textContent : "" }; },
  // what a person left behind on the last design
  dirty: async () => {
    document.querySelector('[data-start="pet"]').click(); await __e.settle();
    document.querySelector('#st-fabric [data-fab="towel"]').click(); await __e.settle(400);
    document.querySelector('#st-thread [data-thread="60"]').click(); await __e.settle(400);
    if (!$("st-baste").checked) $("st-baste").click(); await __e.settle(400);
    $("rename-open").click(); $("rename-name").value = "Mine"; $("rename-save").click(); await __e.settle(400);
    $("zoom-in").click();
    const d = $("st-steps").closest("details"); d.open = true; document.querySelector('#st-steps [data-step="0"]')?.click();
    await __e.settle(600);
  } };
  document.addEventListener("click", (e) => { const a = e.target.closest?.("a[download]"); if (a) e.preventDefault(); }, true);
  HTMLAnchorElement.prototype.click = function () {}; })()`;
const run = async (js) => { await ev(H); return ev(`(async () => { ${js} })()`); };

const saved = (o = {}) => JSON.stringify(JSON.stringify({ needleworks: 1, pieces: [{ kind: "text", text: "Zed", size: 20, x: 0, y: 0, id: 1 }], ...o }));
const PES = `new Uint8Array(await (await fetch("tests/fixtures/golden/multi.pes")).arrayBuffer())`;
// each entry point: how it's taken, and what it carries itself (left out of the comparison)
const ENTRIES = [
  ["a starter", `document.querySelector('[data-start="oval"]').click(); await __e.settle();`],
  ["a starter laid out turned", `document.querySelector('[data-start="bookmark"]').click(); await __e.settle();`],
  ["an old #bookmark link", `location.hash = "#bookmark"; await __e.settle(2500);`],
  ["Open > Add words", `location.hash = "#open"; await __e.wait(() => document.body.dataset.mode === "open"); __e.put("#open-file", ${PES}, "multi.pes");
    await __e.wait(() => !document.getElementById("open-words").hidden && /multi/.test(document.getElementById("download").textContent)); document.getElementById("open-words").click(); await __e.settle(2500);`],
  ["Picture > start a new design", `location.hash = "#picture"; await __e.wait(() => document.body.dataset.mode === "picture" && !document.getElementById("pic-use").hidden && !document.getElementById("download").disabled, 60000);
    document.getElementById("pic-new").click(); await __e.settle(2500);`],
  ["Open saved", `__e.put("#st-load", ${saved()}, "zed.needleworks.json"); await __e.settle(2500);`],
  ["Open saved (for the 4x4, towel, turned)", `__e.put("#st-load", ${saved({ hoop: "4x4", fabric: "towel", turned: true, title: "Their name" })}, "zed.needleworks.json"); await __e.settle(2500);`, ["hoop", "fabric", "turn", "title"]],
  ["a saved design opened on the Open tab", `location.hash = "#open"; await __e.wait(() => document.body.dataset.mode === "open"); __e.put("#open-file", ${saved()}, "zed.needleworks.json"); await __e.settle(2500);`],
  ["a whole design pasted into an empty one", `
    const copy = JSON.stringify({ needleworks: 1, pieces: [{ kind: "text", text: "Zed", size: 20, x: 0, y: 0, id: 1 }], fabric: "knit", baste: false, thread: "auto", turned: false });
    for (let i = 0; i < 12; i++) { const b = document.querySelector("#st-pieces [data-op=del]"); if (!b) break; b.click(); await new Promise((r) => setTimeout(r, 700)); }
    await __e.settle(800); document.activeElement?.blur();
    const dt = new DataTransfer(); dt.setData("text/plain", copy); document.body.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt })); await __e.settle(2500);`, ["fabric"]],
];
// what a fresh profile has that an entry point must give back whatever came before (the pieces' ids aside)
const KEYS = ["fabric", "thread", "baste", "two", "title", "from", "fitted", "tip", "pieces", "zoom", "pan", "step", "turn", "hoop", "mode", "shownTip", "notes", "dl"];
const t0 = Date.now();
for (const [name, go, carries = []] of ENTRIES) {
  await fresh();
  // (the paste empties the design first: its fresh case starts from the same empty design)
  const want = await run(`${go} return __e.state();`);
  await fresh();
  await run(`await __e.dirty();`);
  const was = await run(`return __e.state();`);
  check(`${name}: the dirty design is dirty`, was.fabric === "towel" && was.title === "Mine" && was.turn && was.zoom > 1, JSON.stringify(was));
  const got = await run(`${go} return __e.state();`);
  for (const k of KEYS) if (!carries.includes(k)) check(`${name}: ${k} as a fresh profile has it`, JSON.stringify(got[k]) === JSON.stringify(want[k]), `${JSON.stringify(got[k])} after the dirty design, ${JSON.stringify(want[k])} fresh`);
  if (name.startsWith("a whole design")) continue;   // (its Undo goes back to the emptied design)
  // Undo: the dirty design back as it was, with its hoop and turn, and no note's action left up
  const back = await run(`document.getElementById("tab-design").click(); await __e.settle(500); document.getElementById("st-undo").click(); await __e.settle(2000); return __e.state();`);
  for (const k of ["fabric", "thread", "baste", "title", "from", "tip", "pieces", "turn", "hoop", "shownTip"]) check(`${name}, then Undo: ${k} back`, JSON.stringify(back[k]) === JSON.stringify(was[k]), `${JSON.stringify(back[k])}, was ${JSON.stringify(was[k])}`);
  check(`${name}, then Undo: no note's action left up`, !back.toastAction, back.toastAction);
}
for (const p of problems) console.log("FAIL " + p);
console.log(`entry state: ${Math.round((Date.now() - t0) / 1000)} s`);
console.log(`DONE ${checks} ${problems.length}`);
process.exit(problems.length ? 1 : 0);
