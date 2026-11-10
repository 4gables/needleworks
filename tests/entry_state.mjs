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
// (round 14) Recent designs: every entry point that replaces the dirty design lists it under Recent designs (a fresh
// profile's untouched starter isn't); after a reload it opens again as it was, byte for byte in its PES, and the
// design it replaced goes into the list. The Picture tab's own picture and its settings come back after a reload
// (IndexedDB), the same file; and with storage refused (private mode) both tabs still work.
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
    await ev(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("nw:")) localStorage.removeItem(k); indexedDB.deleteDatabase("needleworks"); localStorage.setItem("nw:doneSeen", "true"); localStorage.setItem("nw:studio.guideSeen", "true"); localStorage.setItem("nw:studio.applSeen", "true"); return 1; })()`).catch(() => {});
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
      recent: $("st-recent-box").hidden ? [] : [...$("st-recent").querySelectorAll("b")].map((b) => b.textContent),
      bytes: v?.bytes ? v.bytes.length + ":" + v.bytes.reduce((a, b, i) => (a * 31 + b * (i + 1)) % 1000000007, 7) : "",
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
  check(`${name}: nothing under Recent designs in a fresh profile`, !want.recent.length, JSON.stringify(want.recent));
  if (!name.startsWith("a whole design")) check(`${name}: the dirty design under Recent designs`, got.recent[0] === "Mine", JSON.stringify(got.recent));
  if (name.startsWith("a whole design")) continue;   // (its Undo goes back to the emptied design)
  // Undo: the dirty design back as it was, with its hoop and turn, and no note's action left up
  const back = await run(`document.getElementById("tab-design").click(); await __e.settle(500); document.getElementById("st-undo").click(); await __e.settle(2000); return __e.state();`);
  for (const k of ["fabric", "thread", "baste", "title", "from", "tip", "pieces", "turn", "hoop", "shownTip"]) check(`${name}, then Undo: ${k} back`, JSON.stringify(back[k]) === JSON.stringify(was[k]), `${JSON.stringify(back[k])}, was ${JSON.stringify(was[k])}`);
  check(`${name}, then Undo: no note's action left up`, !back.toastAction, back.toastAction);
}
// Recent designs after a reload: the dirty design opened again is the same file; the starter that replaced it, changed,
// goes into the list in its place, and Undo gives it back
{
  await fresh();
  await run(`await __e.dirty();`);
  const was = await run(`document.querySelector('[data-start="oval"]').click(); await __e.settle(); document.querySelector("#st-edit textarea[data-k=text]").value = "Ovaline";
    document.querySelector("#st-edit textarea[data-k=text]").dispatchEvent(new Event("input", { bubbles: true })); await __e.settle(2500); return __e.state();`);
  // (the dirty design as it was: Undo twice gives its state, then Redo twice back to the oval)
  const dirty = await run(`document.getElementById("st-undo").click(); await __e.settle(400); document.getElementById("st-undo").click(); await __e.settle(2500); const s = __e.state(); document.getElementById("st-redo").click(); await __e.settle(400); document.getElementById("st-redo").click(); await __e.settle(2500); return s;`);
  check("Recent designs: Undo gives the dirty design", dirty.title === "Mine", JSON.stringify(dirty));
  await call("goto", `${base}/?v=r${Date.now()}#design`); await sleep(2500);
  const got = await run(`await __e.settle(2500); const b = document.getElementById("st-recent-box"); b.open = true; const names = [...document.querySelectorAll("#st-recent b")].map((x) => x.textContent);
    document.querySelector('#st-recent [data-recent="0"]')?.click(); await __e.settle(3000); return { names, ...__e.state() };`);
  check("Recent designs after a reload: the replaced design listed", got.names[0] === "Mine", JSON.stringify(got.names));
  for (const k of ["fabric", "thread", "baste", "title", "pieces", "turn", "hoop", "bytes"]) check(`Recent designs: opened again, ${k} as it was`, JSON.stringify(got[k]) === JSON.stringify(dirty[k]), `${JSON.stringify(got[k])}, was ${JSON.stringify(dirty[k])}`);
  check("Recent designs: the changed oval it replaced is listed", got.recent[0] === "Ovaline", JSON.stringify(got.recent));
  check("Recent designs: the one opened isn't listed", !got.recent.includes("Mine"), JSON.stringify(got.recent));
  const back = await run(`document.getElementById("st-undo").click(); await __e.settle(2500); return __e.state();`);
  check("Recent designs: Undo after opening one gives the oval back", back.pieces === was.pieces && back.bytes === was.bytes, JSON.stringify([back.pieces, was.pieces]));
}
// the Picture tab's picture and settings after a reload
const pic = async () => run(`location.hash = "#picture"; await __e.wait(() => document.body.dataset.mode === "picture" && !document.getElementById("pic-use").hidden && !document.getElementById("download").disabled, 60000);
  await __e.settle(1500); await __e.wait(() => !document.getElementById("download").disabled, 60000); const v = nwTest.view();
  return { drop: document.querySelector("#pic-drop .drop-text").textContent, colors: document.getElementById("pic-colors").value, style: document.querySelector("#pic-style [aria-pressed=true]")?.dataset.s, bytes: __e.state().bytes, file: v?.filename };`);
{
  await fresh();
  await pic();
  await run(`__e.put("#pic-file", new Uint8Array(await (await fetch("assets/sample-flower.png")).arrayBuffer()), "my rose.png", "image/png"); await new Promise((r) => setTimeout(r, 1500));
    document.querySelector('#pic-style [data-s="cross"]').click(); const c = document.getElementById("pic-colors"); c.value = 4; c.dispatchEvent(new Event("input", { bubbles: true })); await new Promise((r) => setTimeout(r, 800));`);
  const was = await pic();
  check("Picture: the picture chosen is in use", /my rose/.test(was.drop) && was.colors === "4" && was.style === "cross", JSON.stringify(was));
  await call("goto", `${base}/?v=p${Date.now()}#design`); await sleep(2500);
  const got = await pic();
  check("Picture: after a reload, the same picture", /Your last picture, my rose\.png/.test(got.drop), got.drop);
  for (const k of ["colors", "style", "bytes", "file"]) check(`Picture: after a reload, ${k} as it was`, got[k] === was[k], `${got[k]}, was ${was[k]}`);
  // storage refused (private mode, full): the tabs work as before
  await fresh();
  const off = await run(`for (const k of ["setItem", "getItem"]) Storage.prototype[k] = () => { throw new DOMException("no", "SecurityError"); };
    Object.defineProperty(window, "indexedDB", { get() { throw new DOMException("no", "SecurityError"); } });
    document.querySelector("#st-edit textarea[data-k=text]").value = "Private"; document.querySelector("#st-edit textarea[data-k=text]").dispatchEvent(new Event("input", { bubbles: true })); await __e.settle(1500);
    document.querySelector('[data-start="oval"]').click(); await __e.settle();
    const dl = document.getElementById("download").textContent, toast = document.getElementById("st-toast").textContent;
    location.hash = "#picture"; await __e.wait(() => document.body.dataset.mode === "picture" && !document.getElementById("pic-use").hidden, 60000);
    __e.put("#pic-file", new Uint8Array(await (await fetch("assets/sample-flower.png")).arrayBuffer()), "private.png", "image/png");
    await __e.wait(() => /private\.png/.test(document.querySelector("#pic-drop .drop-text").textContent) && !document.getElementById("download").disabled, 60000);
    return { dl, toast, pic: document.querySelector("#pic-drop .drop-text").textContent, err: document.getElementById("error").hidden ? "" : document.getElementById("error").textContent };`);
  check("No storage: the Design tab works, nothing said kept", /Download/.test(off.dl) && /Replaced your design/.test(off.toast) && !/Recent/.test(off.toast), JSON.stringify(off));
  check("No storage: the Picture tab works", /private\.png/.test(off.pic) && !off.err, JSON.stringify(off));
}
for (const p of problems) console.log("FAIL " + p);
console.log(`entry state: ${Math.round((Date.now() - t0) / 1000)} s`);
console.log(`DONE ${checks} ${problems.length}`);
process.exit(problems.length ? 1 : 0);
