// Design-tab monkey (category audit "layout": classes 2, 3, 4, 10). Seeded random action sequences through the real
// page (index.html in an iframe, driven through its own controls: buttons, sliders, menus, keys, pointer drags, paste,
// Open saved, + Design file, starters, hoop changes, tab visits, names batch, every one-tap fix the editor, the
// too-big note and the toasts offer), and after every step a fresh computation of what the screen should say:
//   fit       the design fits the hoop as sewn (compose + the file read back), or the page says Too big; never "Fits"
//             beside a design that doesn't, nor Too big beside one that does
//   split     two hoopings only when the user chose them ("Sew it in two hoopings"), never on its own
//   placed    an action that places things for the user (add, paste, duplicate, starter, file, one-tap fix, Fit to
//             hoop) never takes a design that fitted past the hoop; a new piece runs into nothing and sits on an
//             in-the-hoop project's front
//   collide   every pair of pieces that run into each other is said beside Download, and in the editor for the
//             selected piece
//   offcentre stitches past the field at the hoop's centre are said ("Off centre here")
//   fix       every one-tap fix, applied, removes its warning, adds none, runs nothing into anything new, keeps a
//             fitting design fitting and does something; Undo takes it back in one step
//   stale     what's shown (size and stitch chips, Fits <hoop>, steps count, fabric/thread/turn buttons, the Open
//             tab's "Largest that fits", the Picture tab's size) equals a fresh computation after any settings change
//   undo      undo then redo, and Save design then Open saved, give back the same design
//   slow      no action blocks the page longer than the budget (?budget, 1000 ms); every action settles in 15 s
//   error     no uncaught exception or console error
// Query: ?seed=1&steps=200&start=default|fifteen|fifteen-letters|random|<starter id>&budget=1000&shrink=1, or &replay=<base64 JSON of steps>.
// Title "DONE <steps> <problems>"; window.monkey holds the result (problems with a shrunk, replayable step list).
// Run many seeds with: node tests/monkey.mjs CDP_PORT HTTP_PORT [--seeds 1-20] [--steps 200] [--start default,fifteen]
const Q = new URLSearchParams(location.search);
const SEED = +(Q.get("seed") || 1), STEPS = +(Q.get("steps") || 200), START = Q.get("start") || "default", BUDGET = +(Q.get("budget") || 1000);
const SHRINK = Q.get("shrink") !== "0", REPLAY = Q.get("replay");
const frame = document.getElementById("app"), out = document.getElementById("out");
const log = (s) => { out.textContent += s + "\n"; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

let W, D, P, MC, F, DS, UI;   // the page's window and document, and its own modules (the same instances the app uses)
const $ = (id) => D.getElementById(id);
const all = (s) => [...D.querySelectorAll(s)];
const shown = (el) => el && !el.hidden && !el.disabled && el.offsetParent !== null;

// ---------- the page ----------
const fixtures = {};
async function fixture(path) { return (fixtures[path] ||= await (await fetch(path)).arrayBuffer()); }
async function firstOf(paths) { for (const p of paths) { const r = await fetch(p, { method: "HEAD" }); if (r.ok) return p; } return null; }

async function boot(start = START, seed = SEED, keep = false) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!keep) for (const k of Object.keys(localStorage)) if (k.startsWith("nw:")) localStorage.removeItem(k);
    const set = (k, v) => localStorage.setItem("nw:" + k, JSON.stringify(v));
    set("studio.guideSeen", true); set("studio.applSeen", true); set("doneSeen", true);
    if (start.startsWith("fifteen") && !keep) {
      const d = JSON.parse(new TextDecoder().decode(await fixture("../fixtures/fifteen.needleworks.json")));
      set("studio", { pieces: d.pieces, sel: null, fabric: "cotton", baste: false, thread: "auto", fitted: false, from: "fifteen" }); set("hoop", d.hoop || "5x7");
    }
    frame.src = `../../index.html?mk=${Date.now()}#design`;
    await new Promise((r) => (frame.onload = r));
    W = frame.contentWindow; D = W.document;
    for (let i = 0; i < 100 && D.body.dataset.mode !== "design"; i++) await sleep(50);
    if (D.body.dataset.mode !== "design") continue;   // (the test server sometimes drops a module request)
    instrument();
    const mod = (m) => W.eval(`import(${JSON.stringify(new URL(m, W.location.href).href)})`);
    P = await mod("js/studio/pieces.js"); MC = await mod("js/core/machines.js"); F = await mod("js/core/formats.js"); DS = await mod("js/core/design.js");
    // (the same module instances as the page's own: its caches and settings, not a second copy)
    UI = await mod("js/studio/ui.js");
    await idle(30000);
    // (the page saves the design on the first change: the starter it opens with is picked, so there's one to read)
    if (start === "default" && !keep && !studio()) { D.querySelector('#st-cards [data-start="monogram"]').click(); await idle(); }
    // (a starter by its id: its layout as the user opens it, the Kitchen sign or Wedding keepsake)
    if (!keep && UI.STARTERS.some((x) => x.id === start)) { D.querySelector(`#st-cards [data-start="${start}"]`).click(); await idle(); }
    // (the 15 pieces with appliqué letters added past the hoop, "Add it anyway": every change of that too-big design
    // took 0.5-1.9 s, tests/monkey.mjs --start fifteen-letters)
    if (start === "fifteen-letters" && !keep) {
      $("st-add").querySelector('[data-add="letters"]').click(); await idle();
      D.querySelector("#st-toast:not([hidden]) button")?.click(); await idle();
    }
    // (gang-<starter id>: that starter, then "Make another in the hoop" on its frame: two key fobs, two bookmarks)
    if (!keep && start.startsWith("gang-")) {
      D.querySelector(`#st-cards [data-start="${start.slice(5)}"]`).click(); await idle();
      const f = all("#st-pieces .pick").find((b) => studio()?.pieces.find((p) => p.id === +b.dataset.id)?.kind === "frame");
      if (f) { f.click(); await idle(); D.querySelector("#st-edit [data-two-up]")?.click(); await idle(); D.querySelector("#st-toast:not([hidden]) button")?.click(); await idle(); }
    }
    if (start === "random" && !keep) { const cards = all("#st-cards [data-start]"); cards[Math.floor(rng(seed * 7919)() * cards.length)].click(); await idle(); }
    W.__mk.errors.length = 0; W.__mk.long.length = 0;
    return;
  }
  throw new Error("the page didn't start");
}
// timers, frames and idle callbacks the page has waiting (toasts' long timers left out), long tasks, errors, and
// downloads swallowed (the names batch and Save design would otherwise save files)
function instrument() {
  W.eval(`(() => {
    const st = window.__mk = { timers: new Map(), raf: new Set(), idle: new Set(), errors: [], long: [], saved: [] };
    const sT = window.setTimeout.bind(window), cT = window.clearTimeout.bind(window);
    window.setTimeout = (fn, ms = 0, ...a) => { const id = sT(() => { st.timers.delete(id); if (typeof fn === "function") fn(...a); }, ms); if (ms <= 1500) st.timers.set(id, ms); return id; };
    window.clearTimeout = (id) => { st.timers.delete(id); cT(id); };
    const sR = window.requestAnimationFrame.bind(window), cR = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) => { const id = sR((t) => { st.raf.delete(id); fn(t); }); st.raf.add(id); return id; };
    window.cancelAnimationFrame = (id) => { st.raf.delete(id); cR(id); };
    if (window.requestIdleCallback) { const sI = window.requestIdleCallback.bind(window); window.requestIdleCallback = (fn, o) => { const id = sI((d) => { st.idle.delete(id); fn(d); }, o); st.idle.add(id); return id; }; }
    window.addEventListener("error", (e) => st.errors.push("error: " + e.message));
    window.addEventListener("unhandledrejection", (e) => st.errors.push("rejection: " + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
    const ce = console.error.bind(console); console.error = (...a) => { st.errors.push("console: " + a.map((x) => (x && x.stack) || String(x)).join(" ")); ce(...a); };
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) st.long.push(e.duration); }).observe({ type: "longtask" }); } catch {}
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) { st.saved.push(this.download); return; } return click.call(this); };
    // (synthetic pointers have no capture to take)
    const cap = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function (id) { try { cap.call(this, id); } catch {} };
  })()`);
}
const filePending = () => (studio()?.pieces || []).some((p) => p.kind === "file" && p.pending);
async function idle(max = 15000) {
  const t0 = performance.now();
  let calm = 0;
  while (performance.now() - t0 < max) {
    await sleep(20);
    const s = W.__mk, busy = s.timers.size || s.raf.size || s.idle.size || filePending() || D.fonts.status !== "loaded" || ($("busy") && !$("busy").hidden)
      || /Quilting|Filling|Re-stitching/.test($("download").textContent);   // (workers: quilting, a patch's fill, a design file re-stitched)
    calm = busy ? 0 : calm + 1;
    if (calm >= 3) return performance.now() - t0;
  }
  return -1;
}

// ---------- what the page holds, and what it should show ----------
const studio = () => { try { return JSON.parse(localStorage.getItem("nw:studio")); } catch { return null; } };
function hoopNow() {
  const h = MC.hoop($("machine").value, $("hoop").value), t = D.body.dataset.mode === "design" && $("turn").getAttribute("aria-pressed") === "true";
  return { h, t, dh: t ? { ...h, w: h.h, h: h.w } : h };
}
function fresh() {
  const s = studio(), { h, t, dh } = hoopNow();
  if (!s?.pieces?.length) return { empty: true, s };
  const opts = { fabric: s.fabric, baste: s.baste, thread: s.thread };
  let c;
  try { c = P.compose(s.pieces, dh, opts); }
  catch (e) { if (e.empty) return { empty: true, s }; if (!e.overBy) return { error: e.message, s }; return { over: e.overBy, s, h, t, dh, hits: P.collisions(s.pieces) }; }
  const pat = c.design.pattern(), file = F.readEmbroidery(F.writePES(t ? DS.turnForMachine(pat) : pat), "x.pes"), st = F.designStats(file);
  const view = t ? DS.turnPattern(file, false) : file, vs = F.designStats(view);
  const fits = st.widthMm <= h.w - 2 * MC.MARGIN && st.heightMm <= h.h - 2 * MC.MARGIN;
  // stitches past the field with the hoop's centre fixed (the preview's "Off centre here")
  const lx = (dh.w / 2 - MC.MARGIN) * 10, ly = (dh.h / 2 - MC.MARGIN) * 10;
  const off = fits && view.stitches.some(([x, y, cmd]) => cmd === 0 && (Math.abs(x) > lx || Math.abs(y) > ly));
  // (what's sewn, as one number: a fix that changes the pieces but not the stitches did nothing, "Make it 17 mm" that
  // the frame shrank straight back to 15)
  let sig = 0; for (const [x, y, cmd] of file.stitches) sig = (Math.imul(sig, 31) + x * 7 + y * 13 + cmd) | 0;
  return { fits, over: fits ? 0 : 1, st, vs, steps: c.steps.length, off, s, h, t, dh, hits: P.collisions(s.pieces), sig };
}
// what the page shows
function screen() {
  const dl = $("download"), t = dl.textContent.trim();
  const kind = /^Download \d+ files/.test(t) ? "split" : /^Too big/.test(t) ? "big" : dl.disabled && /^Download PES$/.test(t) ? "none" : "one";
  return { kind, dl: t, dlOff: dl.disabled, facts: $("facts").innerText.replace(/\s+/g, " "), warn: $("dl-warn").hidden ? "" : $("dl-warn").textContent,
    big: $("st-big").hidden ? "" : $("st-big").textContent, error: $("error").hidden ? "" : $("error").textContent,
    edit: all("#st-edit [data-warn] > span").map((s) => s.textContent), stepsCount: $("st-steps-count").textContent };
}
// a warning's kind, from its words (numbers and names left out)
// (thin before loops: "Make it bold (small loops may fill in)"; loops before towel: "Thin line keeps them open." ends
// like the towel's "… mm or more keeps them open.")
const KINDS = [["small", /too small to stitch cleanly/], ["thin", /sews as a thin line/], ["loops", /small loops .*fill in/], ["towel", /closes? (the |these )?letters up|leave the letters open|keeps them open\.$/], ["arch", /wrap most of the way round|too tight for letters/],
  ["hit", /^This runs into/], ["lines", /^On (two|three) lines/], ["motif", /this small, the/],
  ["named", /looks like a name|has 3 initials at most/], ["caps", /^Capitals in a joined script/], ["oneline", /sews the words on one line/], ["under", /patch sews after this|sews before the patch/],
  ["same", /nearly the same thread/], ["kern", /pushed into each other/], ["missing", /has no /], ["framefit", /^Shrunk to fit inside the frame/]];
// (beside Download each problem names its pieces: "“Emma” runs into Heart; …")
const GLOBAL = [["hit", /runs into/], ["missing", /has no /], ["under", /sews before the patch/], ["same", /nearly the same thread/], ["small", /too small to stitch/],
  ["towel", /closes up on a towel/], ["loops", /loops that fill in/], ["verdict", /may not sew well/]];
const globalKinds = (t) => new Set(GLOBAL.filter(([, re]) => re.test(t)).map(([k]) => k));
const kindOf = (t) => (KINDS.find(([, re]) => re.test(t)) || [t.replace(/[\d.,]+|“[^”]*”/g, "#").slice(0, 40)])[0];
// ("on two lines it can be…" is an offer, and "it sews as a thin line" a note with an offer, not problems)
const kinds = (spans) => new Set(spans.filter((t) => t.trim()).map(kindOf).filter((k) => k !== "lines" && k !== "thin"));
const pairKeys = (hits) => new Set((hits || []).map(([a, b]) => `${a.id}:${b.id}`));
const nameOf = (h) => h.name.replace(/ hoop$/, "");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// the first difference between two designs, said briefly
function diff(a, b) {
  if (!a || !b) return `${!a ? "nothing" : "a design"} then ${!b ? "nothing" : "a design"}`;
  for (const k of ["fabric", "baste", "thread", "hoop", "turn", "two"]) if (!same(a[k], b[k])) return `${k} ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`;
  if (a.pieces.length !== b.pieces.length) return `${a.pieces.length} pieces -> ${b.pieces.length}`;
  for (let i = 0; i < a.pieces.length; i++) for (const k of new Set([...Object.keys(a.pieces[i]), ...Object.keys(b.pieces[i])]))
    if (k !== "blocks" && k !== "orig" && !same(a.pieces[i][k], b.pieces[i][k])) return `piece ${i + 1} (${a.pieces[i].kind}) ${k} ${JSON.stringify(a.pieces[i][k])?.slice(0, 40)} -> ${JSON.stringify(b.pieces[i][k])?.slice(0, 40)}`;
  return "file stitches";
}
// the design as saved (ids and the selection left out), with the hoop and its turn
function design() {
  const s = studio(); if (!s) return null;
  return { pieces: s.pieces.map(({ id, ...p }) => p), fabric: s.fabric, baste: s.baste, thread: s.thread, hoop: $("hoop").value, turn: hoopNow().t, two: !!s.two };
}

// ---------- checks after every step ----------
let chose2 = false;   // "Sew it in two hoopings" was chosen and the design hasn't fitted since
function checks(f, sc, act, before) {
  const bad = [];
  const add = (kind, msg) => bad.push({ kind, msg });
  if (D.body.dataset.mode !== "design") return bad;
  if (f.error) add("error", `compose failed: ${f.error}`);
  if (f.empty) { if (sc.kind !== "none") add("fit", `empty design but Download reads “${sc.dl}”`); return bad; }
  if (f.fits) {
    chose2 = false;
    if (sc.kind === "big") add("fit", `fits (${f.st.widthMm.toFixed(1)} × ${f.st.heightMm.toFixed(1)} mm) but the page says “${sc.dl}”`);
    if (sc.kind === "split") add("split", `fits but the page shows two hoopings`);
    if (sc.kind === "one" && !sc.facts.includes(`Fits ${nameOf(f.h)}`)) add("stale", `fits the ${f.h.name} but the chips read “${sc.facts}”`);
    if (sc.kind === "one") {
      const m = /^([\d.]+) × ([\d.]+) mm/.exec(sc.facts), want = [f.vs.widthMm, f.vs.heightMm];
      if (!m || Math.abs(+m[1] - want[0]) > 0.6 || Math.abs(+m[2] - want[1]) > 0.6) add("stale", `size chip “${m?.[0]}” but the design is ${want[0].toFixed(1)} × ${want[1].toFixed(1)} mm`);
      if (!sc.facts.includes(`${f.st.stitches.toLocaleString()} stitches`)) add("stale", `stitch chip doesn't say ${f.st.stitches} (“${sc.facts}”)`);
      const n = /(\d+) steps?/.exec(sc.stepsCount);
      if (!n || +n[1] !== f.steps) add("stale", `steps count “${sc.stepsCount}” but the design has ${f.steps} steps`);
      if (f.off && !/Off centre/.test(sc.facts)) add("offcentre", `stitches past the field at the hoop's centre, not said`);
    }
  } else {
    if (sc.kind === "one") add("fit", `doesn't fit the ${f.h.name} but Download reads “${sc.dl}”`);
    if (sc.kind === "split" && !chose2 && !["undo", "redo", "undoredo", "openSaved"].includes(act.t)) add("split", `split into two hoopings without being asked (after ${act.t})`);
    if (sc.kind === "big" && !sc.big && !sc.error) add("fit", `too big with nothing said`);
    if (/Fits /.test(sc.facts)) add("stale", `too big but the chips say “${sc.facts}”`);
    // the too-big note gives the size chip's size (171 × 33 beside a 171 × 34 chip)
    const said = /This design is ([\d.]+ × [\d.]+) mm/.exec(sc.big || sc.error), chip = /^([\d.]+ × [\d.]+) mm/.exec(sc.facts);
    if (said && chip && said[1] !== chip[1]) add("stale", `the note says ${said[1]} mm beside a ${chip[1]} mm size chip`);
  }
  // collisions said
  // (beside Download when it can be downloaded: a design too big for the hoop says that first)
  if (f.hits?.length && !/runs into/.test(sc.warn) && sc.kind === "one") add("collide", `${f.hits.map(([a, b]) => `${P.label(a)} / ${P.label(b)}`).join(", ")} run into each other, not said beside Download (“${sc.warn}”)`);
  const sel = f.s.pieces.find((p) => p.id === f.s.sel);
  if (sel && f.hits?.some(([a, b]) => a.id === sel.id || b.id === sel.id) && sel.kind !== "frame" && !sc.edit.some((t) => /runs into/.test(t))) add("collide", `${P.label(sel)} runs into something, not said in its editor`);
  // settings shown as they are
  const s = f.s, pressed = (sel) => all(sel).filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.fab || b.dataset.thread);
  if (!same(pressed("#st-fabric [data-fab]"), [s.fabric])) add("stale", `fabric ${s.fabric} but the chips show ${pressed("#st-fabric [data-fab]")}`);
  if (!same(pressed("#st-thread [data-thread]"), [String(s.thread)])) add("stale", `thread ${s.thread} but the chips show ${pressed("#st-thread [data-thread]")}`);
  if (!$("st-fabric-name").textContent.startsWith(P.FABRICS[s.fabric].name)) add("stale", `“Sewing on” says ${$("st-fabric-name").textContent}, fabric is ${s.fabric}`);
  const turnNote = all("#st-steps .turned").length > 0;
  if (sc.kind === "one" && turnNote !== f.t) add("stale", `the hooping note ${turnNote ? "shows" : "is missing"} with the hoop ${f.t ? "turned" : "upright"}`);
  // nothing in the editor opens empty (an arched script name's "More" had nothing under it)
  for (const d of all("#st-edit details")) if (![...d.children].some((c) => c.tagName !== "SUMMARY" && c.textContent.trim())) add("stale", `“${d.querySelector("summary")?.textContent}” opens empty`);
  // the size control says the size it's sewn at when a frame shrinks it (it said 24 mm beside "Shrunk to 22 mm")
  const fitNote = D.querySelector("#st-edit [data-fit]"), szOut = D.querySelector('#st-edit input[data-k="size"] + output');
  if (fitNote && !fitNote.hidden && szOut) { const m = /Shrunk to ([\d.]+) mm/.exec(fitNote.textContent); if (m && !szOut.textContent.includes(`${m[1]} mm`)) add("stale", `the height reads “${szOut.textContent}” beside “Shrunk to ${m[1]} mm”`); }
  // placing things for the user never takes a design that fitted past the hoop
  if (before?.f && PLACING.has(act.t) && before.f.fits && !f.fits && !act.allowBig) add("placed", `${act.t}${act.what ? ` (${act.what})` : ""} took a design that fitted past the hoop (${f.s.pieces.length} pieces)`);
  if ((act.t === "fit" || act.t === "starter") && !f.fits && !act.skipped) add("placed", `${act.t}${act.what ? ` (${act.what})` : ""} left the design too big`);
  // Fit to hoop fills the hoop (it measured the sizes asked for, not sewn, and made a quilt label smaller on a bigger
  // hoop); not past a frame's `most` (the size its project is made for)
  if (act.t === "fit" && f.fits && !act.skipped && !f.s.pieces.some((p) => p.most || p.kind === "file")) {
    const fill = Math.max(f.vs.widthMm / (f.dh.w - 10), f.vs.heightMm / (f.dh.h - 10));
    if (fill < 0.9) add("fit", `Fit to hoop left it ${f.vs.widthMm.toFixed(0)} × ${f.vs.heightMm.toFixed(0)} mm in the ${f.h.name} (${Math.round(fill * 100)} % of the room)`);
  }
  // the selection box goes round the selected piece as it's drawn: at the size it's sewn (it was drawn at the size
  // asked, far past frame-shrunk letters) and where its stitches are on screen (a design moved onto the hoop's centre
  // to be written drew its stitches 100 mm from the box)
  const v = W.nwTest.view(), box = W.nwTest.sel?.();
  if (sel && box && v?.shown && !v.hoopings && !v.split) {
    const fit = P.fittedSizes(f.s.pieces), pts = P.pieceStitches(fit.has(sel.id) ? { ...sel, size: fit.get(sel.id) } : sel).flat();
    if (pts.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      if ([x0, y0, x1, y1].some((q, i) => Math.abs(q - box[i]) > 1)) add("selbox", `the selection box [${box.map((q) => q.toFixed(1))}] isn't round ${P.label(sel)} as sewn [${[x0, y0, x1, y1].map((q) => q.toFixed(1))}]`);
      const cells = new Set();
      for (const [x, y, c] of v.shown.stitches) if (c === 0) cells.add(`${Math.round(x / 10)},${Math.round(y / 10)}`);
      const step = Math.max(1, Math.floor(pts.length / 200));
      let n = 0, near = 0;
      for (let i = 0; i < pts.length; i += step) {
        n++; const cx = Math.round(pts[i][0]), cy = Math.round(pts[i][1]);
        let hit = false; for (let dx = -1; dx <= 1 && !hit; dx++) for (let dy = -1; dy <= 1 && !hit; dy++) hit = cells.has(`${cx + dx},${cy + dy}`);
        if (hit) near++;
      }
      if (near < n * 0.6) add("selbox", `${P.label(sel)}'s stitches aren't drawn where its selection box is (${near} of ${n} points)`);
    }
  }
  // every way out follows Download's rule: nothing else saves or shares a design Download won't make
  if ($("download").disabled && !/Quilting|Filling|Re-stitching/.test(sc.dl)) for (const id of ["share", "sheet-print", "along-open", "names-open"]) {
    const el = $(id); if (el && !el.hidden && !el.disabled) add("exit", `“${sc.dl}” but ${el.textContent.trim()} is on`);
  }
  // a starter brings its own fabric and thread weight, or cotton and automatic (towel and 30 wt stuck to later starters)
  const st = act.t === "starter" && !act.skipped && UI.STARTERS.find((x) => x.id === act.what);
  if (st && (s.fabric !== (st.fabric || "cotton") || String(s.thread) !== String(st.thread || "auto"))) add("stale", `starter ${st.id} kept fabric ${s.fabric} / thread ${s.thread}`);
  return bad;
}
const PLACING = new Set(["add", "paste", "listop-dup", "starter", "file", "fix", "fixall", "bigfix", "toastfix", "fit", "twoup", "sameon"]);

// ---------- actions ----------
const WORDS = ["Emma", "Olivia Rose", "HAPPY BIRTHDAY GRANDMA", "Sam & Alex", "Merry Christmas from all of us", "A", "Lily\nRose", "Made with\nlove", "Wilhelmina Fitzgerald-Montgomery",
  "O'Neil", "Zoë", "1st Place 2026", "Max", "The Smiths", "Kenji's\nEmbroidery\nShop", "WILD", "Abbie goes", "Nguyễn Thị Hằng", "Анна", "Mrs. Lee", "", "Theo", "Our First Christmas 2026"];
const INITIALS = ["aMs", "JKM", "R", "JD", "Max", "Ann", "ABCD", "ab", "Ł"];
const WEIGHTS = { add: 9, select: 8, range: 12, seg: 7, menu: 5, text: 6, swatch: 2, motif: 2, listop: 5, fabric: 3, thread: 2, baste: 1, hoop: 4, turn: 4, fit: 4,
  undo: 4, redo: 2, center: 1, nudge: 3, drag: 3, starter: 3, paste: 2, openSaved: 2, file: 1, filescale: 2, names: 1, tab: 2, del: 1, escape: 1, recentre: 1,
  undoredo: 2, reload: 1, fix: 12, bigfix: 4, toastfix: 2, fixall: 3, twoup: 1, sameon: 1, grow: 2 };
function gen(r) {
  const tot = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  let x = r() * tot, t = "add";
  for (const [k, w] of Object.entries(WEIGHTS)) { if ((x -= w) < 0) { t = k; break; } }
  return { t, a: +r().toFixed(4), b: +r().toFixed(4), c: +r().toFixed(4) };
}
const at = (xs, u) => xs[Math.min(xs.length - 1, Math.floor(u * xs.length))];
const fire = (el, type) => el.dispatchEvent(new W.Event(type, { bubbles: true }));
function key(k, shift = false) {
  D.activeElement?.blur?.();
  D.body.dispatchEvent(new W.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, shiftKey: shift }));
}
async function setRange(el, v, burst) {
  const lo = +el.min, hi = +el.max, step = +el.step || 1;
  const go = (x) => { el.value = String(Math.round(x / step) * step); fire(el, "input"); };
  if (burst) for (let k = 1; k <= 3; k++) { go(+el.value + ((v - +el.value) * k) / 4); await sleep(40); }
  go(Math.max(lo, Math.min(hi, v))); fire(el, "change");
}
// selects a piece that has fixes in its editor (or the one picked) and returns the fix buttons there
function editFixes() { return all("#st-edit [data-warn] button"); }
async function withFixes(u) {
  if (editFixes().length) return editFixes();
  const picks = all("#st-pieces .pick");
  for (let k = 0; k < picks.length; k++) {
    const p = picks[(Math.floor(u * picks.length) + k) % picks.length]; p.click(); await idle();
    if (editFixes().length) return editFixes();
  }
  return [];
}
// One step. Returns { t, what, skipped, allowBig, checked: extra problems found by the step itself }
async function exec(d) {
  const act = { t: d.t, what: "", extra: [] };
  const sel = () => all("#st-pieces .pick");
  switch (d.t) {
    case "add": { const k = at(["text", "monogram", "frame", "motif", "letters"], d.a); act.what = k; const n = studio()?.pieces.length || 0; $("st-add").querySelector(`[data-add="${k}"]`).click(); act.added = n; break; }
    case "select": { const p = sel(); if (!p.length) return { ...act, skipped: true }; at(p, d.a).click(); break; }
    case "range": {
      const rs = all("#st-edit input[type=range]"); if (!rs.length) return { ...act, skipped: true };
      const el = at(rs, d.a); act.what = el.dataset.k || (el.matches("[data-file-scale]") ? "file-scale" : "kern");
      await setRange(el, +el.min + d.b * (+el.max - +el.min), d.c < 0.3); break;
    }
    case "seg": { const bs = all("#st-edit [data-seg] button"); if (!bs.length) return { ...act, skipped: true }; const b = at(bs, d.a); act.what = `${b.closest("[data-seg]").dataset.seg}=${b.dataset.v}`; b.click(); break; }
    case "menu": {
      const ss = all("#st-edit select"); if (!ss.length) return { ...act, skipped: true };
      const s = at(ss, d.a), o = at([...s.options], d.b); act.what = `${s.dataset.k || "pair"}=${o.value}`; s.value = o.value; fire(s, "input"); fire(s, "change"); break;
    }
    case "text": {
      const el = D.querySelector("#st-edit textarea[data-k=text], #st-edit input[data-k=text], #st-edit input[data-k=letters]"); if (!el) return { ...act, skipped: true };
      let v = el.dataset.k === "letters" || el.tagName === "INPUT" ? at(INITIALS, d.b) : at(WORDS, d.b);
      if (el.maxLength > 0) v = v.slice(0, el.maxLength);
      act.what = JSON.stringify(v); el.focus();
      if (d.c < 0.3) for (let k = 1; k < v.length; k++) { el.value = v.slice(0, k); fire(el, "input"); await sleep(90); }   // typed, a letter at a time
      el.value = v; fire(el, "input"); el.blur(); break;
    }
    case "swatch": { const bs = all("#st-edit [data-color], #st-edit [data-fill], #st-edit button[data-blend]"); if (!bs.length) return { ...act, skipped: true }; at(bs, d.a).click(); break; }
    case "motif": { const bs = all("#st-edit [data-motif]"); if (!bs.length) return { ...act, skipped: true }; at(bs, d.a).click(); break; }
    case "listop": {
      const bs = all("#st-pieces button[data-op]:not([disabled])"); if (!bs.length) return { ...act, skipped: true };
      const b = at(bs, d.a); act.t = `listop-${b.dataset.op}`; act.what = b.dataset.op; b.click(); await sleep(650); break;   // (a second ✕ within 600 ms is ignored)
    }
    case "fabric": { const b = at(all("#st-fabric [data-fab]"), d.a); act.what = b.dataset.fab; b.click(); break; }
    case "thread": { const b = at(all("#st-thread [data-thread]"), d.a); act.what = b.dataset.thread; b.click(); break; }
    case "baste": $("st-baste").click(); break;
    case "grow": {   // the selected piece's size as big as its slider goes (lettering in a frame is then sewn smaller)
      const el = D.querySelector('#st-edit input[type=range][data-k="size"]'); if (!el) return { ...act, skipped: true };
      act.what = el.max; await setRange(el, +el.max, false); break;
    }
    case "twoup": case "sameon": {
      // "Make another in the hoop" / "Put the same on the other one" on an in-the-hoop frame
      const sel = d.t === "twoup" ? "[data-two-up]" : "[data-same-on]";
      const fs = all("#st-pieces .pick").filter((b) => studio()?.pieces.find((p) => p.id === +b.dataset.id)?.kind === "frame"); if (!fs.length) return { ...act, skipped: true };
      at(fs, d.a).click(); await idle(); const b = D.querySelector(`#st-edit ${sel}`); if (!b) return { ...act, skipped: true };
      b.click(); break;
    }
    case "hoop": { const s = $("hoop"), o = [...s.options].find((x) => x.value !== s.value); if (!o) return { ...act, skipped: true }; act.what = o.value; s.value = o.value; fire(s, "change"); break; }
    case "turn": $("turn").click(); break;
    case "fit": $("st-fit").click(); break;
    case "undo": if ($("st-undo").disabled) return { ...act, skipped: true }; $("st-undo").click(); break;
    case "redo": if ($("st-redo").disabled) return { ...act, skipped: true }; $("st-redo").click(); break;
    case "center": if (!shown($("st-center"))) return { ...act, skipped: true }; $("st-center").click(); break;
    case "recentre": if (!$("recentre")) return { ...act, skipped: true }; $("recentre").click(); break;
    case "nudge": key(at(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"], d.a), d.b < 0.5); break;
    case "del": key("Delete"); break;
    case "escape": key("Escape"); break;
    case "drag": {
      const c = $("view"), r = c.getBoundingClientRect(), x = r.left + r.width * (0.25 + 0.5 * d.a), y = r.top + r.height * (0.25 + 0.5 * d.b), dx = (d.c - 0.5) * 240, dy = (d.a - 0.5) * 160;
      const pe = (type, X, Y) => c.dispatchEvent(new W.PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, clientX: X, clientY: Y, button: 0, buttons: type === "pointerup" ? 0 : 1 }));
      pe("pointerdown", x, y);
      for (let k = 1; k <= 4; k++) { pe("pointermove", x + (dx * k) / 4, y + (dy * k) / 4); await new Promise((res) => W.requestAnimationFrame(res)); }
      pe("pointerup", x + dx, y + dy); break;
    }
    case "starter": {
      const cs = all("#st-cards [data-start]"), b = at(cs, d.a); act.what = b.dataset.start; b.click();
      break;
    }
    case "paste": {
      // copy (the selected piece, or the whole design) and paste it
      D.activeElement?.blur?.();
      const dt = new W.DataTransfer(); D.dispatchEvent(new W.ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: dt }));
      const got = dt.getData("text/plain"); if (!got) return { ...act, skipped: true };
      const dt2 = new W.DataTransfer(); dt2.setData("text/plain", got);
      D.body.dispatchEvent(new W.ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt2 })); break;
    }
    case "openSaved": {
      const was = design(), s = studio(); if (!s?.pieces.length) return { ...act, skipped: true };
      const json = JSON.stringify({ needleworks: 1, pieces: s.pieces, fabric: s.fabric, baste: s.baste, thread: s.thread, fitted: s.fitted, hoop: $("hoop").value, turned: hoopNow().t });
      const dt = new W.DataTransfer(); dt.items.add(new W.File([json], "monkey.needleworks.json", { type: "application/json" }));
      $("st-load").files = dt.files; fire($("st-load"), "change");
      await idle();
      const now = design();
      if (was) was.pieces = was.pieces.map((p) => { const { id, ...q } = P.cleanPiece({ ...p, id: 1 }) || {}; return q; });   // (missing settings filled in as opening does)
      // (a design that spilled past the field is recentred on opening; otherwise it comes back as it was saved)
      const strip = (x) => x && { ...x, pieces: x.pieces.map(({ x: _x, y: _y, ...p }) => p) };
      if (!same(strip(now), strip(was))) act.extra.push({ kind: "undo", msg: `Open saved changed the design it was saved from: ${diff(strip(was), strip(now))}` });
      break;
    }
    case "file": {
      const path = await firstOf(["../external/pes/ursula.pes", "../external/pes/gnome.pes"].slice(d.a < 0.5 ? 0 : 1).concat(["../fixtures/multi.pes", "../fixtures/ashley_v3.pes"]));
      const dt = new W.DataTransfer(); dt.items.add(new W.File([await fixture(path)], path.split("/").pop()));
      act.what = path.split("/").pop(); $("st-file").files = dt.files; fire($("st-file"), "change"); break;
    }
    case "filescale": {
      const s = studio(), f = s?.pieces.filter((p) => p.kind === "file") || []; if (!f.length) return { ...act, skipped: true };
      D.querySelector(`#st-pieces .pick[data-id="${at(f, d.a).id}"]`).click(); await idle();
      const el = D.querySelector("#st-edit [data-file-scale]"); if (!el) return { ...act, skipped: true };
      act.what = `${Math.round(50 + d.b * 200)} %`; el.value = String(Math.round(50 + d.b * 200)); fire(el, "input"); fire(el, "change"); break;
    }
    case "names": {
      if (!shown($("names-open"))) return { ...act, skipped: true };
      $("names-open").click(); $("names-list").value = d.b < 0.5 ? "Ava\nBenjamin Alexander\nZoë\nO'Neil" : "JKM\nR\nab"; fire($("names-list"), "input");
      const t0 = performance.now(); $("names-make").click();
      while (/Making the files/.test($("names-note").textContent) && performance.now() - t0 < 30000) await sleep(50);
      act.what = $("names-note").textContent.slice(0, 120);
      $("names").close(); break;
    }
    case "tab": {
      const to = d.a < 0.5 ? "open" : "picture"; act.what = to;
      if (to === "open") {
        $("tab-open").click(); await idle();
        if (!opened) {
          const path = (await firstOf(["../external/pes/ursula.pes"])) || "../fixtures/multi.pes";
          const dt = new W.DataTransfer(); dt.items.add(new W.File([await fixture(path)], path.split("/").pop())); $("open-file").files = dt.files; fire($("open-file"), "change");
          opened = path; await idle(30000);
        }
        await idle(30000);
        act.extra.push(...openChecks());
      } else {
        $("tab-picture").click(); await idle(60000); await idle(60000);
        const sc = screen(), h = hoopNow().h;
        if (/Too big/.test(sc.dl) || (sc.kind === "one" && !sc.dlOff && /Too big for the/.test(sc.facts))) act.extra.push({ kind: "stale", msg: `Picture tab: “${sc.dl}” / “${sc.facts}” in the ${h.name}` });
        const max = +$("pic-size").max;
        if (max > Math.max(h.w, h.h) - 2 * MC.MARGIN) act.extra.push({ kind: "stale", msg: `Picture tab: size slider goes to ${max} mm in the ${h.name}` });
      }
      $("tab-design").click(); break;
    }
    case "reload": {
      // everything kept through a reload (the turn, two hoopings chosen, the fabric…)
      const was = design(); await boot(START, SEED, true);
      if (!same(design(), was)) act.extra.push({ kind: "stale", msg: `a reload changed the design: ${diff(was, design())}` });
      break;
    }
    case "undoredo": {
      if ($("st-undo").disabled) return { ...act, skipped: true };
      const was = design(); $("st-undo").click(); await idle(); if ($("st-redo").disabled) { act.extra.push({ kind: "undo", msg: "Undo left nothing to redo" }); break; }
      $("st-redo").click(); await idle();
      if (!same(design(), was)) act.extra.push({ kind: "undo", msg: `undo then redo didn't give back the same design: ${diff(was, design())}` });
      break;
    }
    case "fix": {
      const bs = await withFixes(d.c); if (!bs.length) return { ...act, skipped: true };
      const b = at(bs, d.a); act.what = b.textContent.trim();
      act.extra.push(...(await tryFix(b, false))); act.done = true; break;
    }
    case "fixall": {
      const bs = await withFixes(d.c); if (!bs.length) return { ...act, skipped: true };
      const n = bs.length; act.what = `${n} fixes`;
      for (let k = 0; k < n; k++) {
        const b = editFixes()[k]; if (!b) break;
        act.extra.push(...(await tryFix(b, true)));
      }
      act.done = true; break;
    }
    case "bigfix": {
      const bs = $("st-big").hidden ? [] : all("#st-big button"); if (!bs.length) return { ...act, skipped: true };   // (its old buttons stay in it, hidden)
      const b = at(bs, d.a); act.what = b.textContent.trim(); if (/two hoopings/.test(act.what)) { chose2 = true; act.allowBig = true; }
      act.extra.push(...(await tryFix(b, false))); act.done = true; break;
    }
    case "toastfix": {
      const b = D.querySelector("#st-toast:not([hidden]) button"); if (!b || D.querySelector("#st-toast.gone")) return { ...act, skipped: true };
      act.what = b.textContent.trim(); if (/anyway/.test(act.what)) act.allowBig = true; if (/^Undo$/.test(act.what)) act.t = "undo";
      b.click(); break;
    }
  }
  return act;
}
let opened = null;
// the Open tab's size line against the file and the hoop now
function openChecks() {
  const bad = [], note = $("doc-fit-note"); if (!note || !opened) return bad;
  const d = F.readEmbroidery(new Uint8Array(fixtures[opened]), opened), st = F.designStats(d), h = hoopNow().h;
  const fit = Math.min((h.w - 2 * MC.MARGIN) / st.widthMm, (h.h - 2 * MC.MARGIN) / st.heightMm), scale = fit >= 2.5 ? 2.5 : Math.floor(fit * 1000 - 2) / 1000;
  if (!$("doc-fit-row").hidden && !note.textContent.includes(h.name)) bad.push({ kind: "stale", msg: `Open tab: “${note.textContent}” with the ${h.name}` });
  if (!$("doc-fit-row").hidden && !note.textContent.includes(`${Math.floor(scale * 1000) / 10} %`)) bad.push({ kind: "stale", msg: `Open tab: “${note.textContent}”, should be ${Math.floor(scale * 1000) / 10} %` });
  return bad;
}
// One one-tap fix, applied: its warning goes, none comes, nothing new runs into anything, a design that fitted still
// fits, something changed; with `undo`, one Undo takes it all back.
async function tryFix(b, undo) {
  const bad = [], label = b.textContent.trim(), span = b.closest("#st-edit [data-warn] > span"), k = span ? kindOf(span.textContent) : null;
  const f0 = fresh(), d0 = design(), sel0 = studio()?.sel, sc0 = screen().kind, k0 = kinds(screen().edit), g0 = globalKinds(screen().warn);
  const where = span ? `“${span.textContent.slice(0, 90)}”` : "";
  b.click(); await idle();
  const f1 = fresh(), d1 = design(), sc = screen(), sel1 = studio()?.sel;
  const add = (kind, msg) => bad.push({ kind, msg: `“${label}”: ${msg}${where ? ` (from ${where})` : ""}` });
  if (same(d0, d1) && !/two hoopings/.test(label)) add("fix", "changed nothing");
  else if (f0.sig != null && f0.sig === f1.sig && f0.fits === f1.fits && !/two hoopings|turn the hoop|Turn the hoop/.test(label)) add("fix", "changed nothing that's sewn");
  if (sel1 === sel0) {
    const k1 = kinds(sc.edit);
    if (k && k1.has(k)) add("fix", `its warning is still there: “${sc.edit.find((t) => kindOf(t) === k)}”`);
    // ("Make it bold (small loops may fill in)" says so on the button)
    const extra = [...k1].filter((x) => !k0.has(x) && !(x === "loops" && /^Make it bold/.test(label)));
    if (extra.length) add("fix", `brought new warnings: ${extra.map((x) => `“${sc.edit.find((t) => kindOf(t) === x)}”`).join(" ")}`);
  }
  const g1 = globalKinds(sc.warn), gx = [...g1].filter((x) => !g0.has(x));
  // (a design too big for the hoop says only that beside Download: what else is wrong shows once it fits)
  if (gx.filter((x) => !(x === "loops" && /^Make it bold/.test(label))).length && sc0 === "one") add("fix", `brought new warnings beside Download: ${gx.join(", ")} (“${sc.warn.slice(0, 160)}”)`);
  const h0 = pairKeys(f0.hits), nh = [...(f1.hits || [])].filter(([a, c]) => !h0.has(`${a.id}:${c.id}`));
  if (nh.length) add("fix", `ran ${nh.map(([a, c]) => `${P.label(a)} into ${P.label(c)}`).join(", ")}`);
  if (f0.fits && !f1.fits && !/two hoopings|anyway/.test(label)) add("fix", `took the design past the hoop`);
  if (/^(Fit to hoop|Turn the hoop|Make it as big)/.test(label) && !f1.fits) add("fix", `left it too big`);
  if (/two hoopings/.test(label) && sc.kind !== "split") add("fix", `didn't give two hoopings (Download reads “${sc.dl}”)`);
  if (undo) {
    $("st-undo").click(); await idle();
    if (!same(design(), d0)) add("undo", `one Undo didn't take it back: ${diff(d0, design())}`);
    for (let n = 0; n < 3 && !same(design(), d0) && !$("st-undo").disabled; n++) { $("st-undo").click(); await idle(); }
  }
  return bad;
}

// ---------- running ----------
async function step(d, k) {
  const before = { f: fresh() };
  // (the long task of the checks just made is reported a moment later: counted, it put ~300 ms on every step of a
  // 16-piece design)
  await sleep(30);
  const n0 = W.__mk.long.length, e0 = W.__mk.errors.length, t0 = performance.now();
  const act = await exec(d);
  const settle = await idle();
  if (D.body.dataset.mode !== "design") { $("tab-design")?.click(); await idle(); }
  const ms = performance.now() - t0, long = Math.max(0, ...W.__mk.long.slice(n0));
  const f = fresh(), sc = screen(), bad = [...act.extra, ...(act.skipped ? [] : checks(f, sc, act, before))];
  if (act.t === "add" && !act.skipped) {
    const s = f.s, p = s.pieces.length > act.added ? s.pieces.find((q) => q.id === s.sel) : null;
    const iths = s.pieces.filter((q) => q !== p && q.kind === "frame" && (q.border === "ith" || q.border === "zip") && !(q.rot || 0));
    if (p && !act.allowBig && P.touching(p, s.pieces)) bad.push({ kind: "placed", msg: `new ${act.what} put where it runs into ${P.label(P.touching(p, s.pieces))}` });
    // (on an in-the-hoop project's front, or in another frame put beside it: not loose on the bare stabilizer)
    if (p && iths.length && !s.pieces.some((f) => f !== p && f.kind === "frame" && !(f.rot || 0) && P.inFrame(p, f, 2))) bad.push({ kind: "placed", msg: `new ${act.what} put outside the ${P.label(iths[0])}'s front` });
  }
  if (settle < 0) bad.push({ kind: "slow", msg: `${act.t} never settled (15 s)` });
  // (the budget is for a design of up to 15 pieces, more in proportion: pasted twice, 57 pieces)
  if (long > BUDGET * Math.max(1, (f.s?.pieces?.length || 0) / 15) && !["names", "tab", "fixall", "undoredo", "openSaved"].includes(d.t)) bad.push({ kind: "slow", msg: `${act.t}${act.what ? ` (${act.what})` : ""} blocked the page ${Math.round(long)} ms (${f.s?.pieces?.length} pieces)` });
  for (const e of W.__mk.errors.slice(e0)) bad.push({ kind: "error", msg: e.slice(0, 300) });
  return { act, bad, ms, long };
}
async function run(list, stopAt = Infinity) {
  chose2 = false; opened = null;
  await boot();
  const problems = [], times = [];
  for (let k = 0; k < list.length && k <= stopAt; k++) {
    const { act, bad, long } = await step(list[k], k);
    times.push([act.t, long]);
    for (const b of bad) problems.push({ ...b, step: k, act: act.t, what: act.what });
  }
  return { problems, times };
}
async function main() {
  const r = rng(SEED);
  const list = [];
  const problems = [], times = [];
  if (REPLAY) list.push(...JSON.parse(atob(REPLAY.replace(/-/g, "+").replace(/_/g, "/"))));
  chose2 = false; opened = null;
  await boot();
  for (let k = 0; k < (REPLAY ? list.length : STEPS); k++) {
    // (a gang start first adds one of each kind, each grown as big as it goes: what goes on the second fob, and a
    // selection box round frame-shrunk letters)
    const d = REPLAY ? list[k] : START.startsWith("gang-") && k < 8 ? { t: k % 2 ? "grow" : "add", a: [0.1, 0.3, 0.7, 0.9][k >> 1], b: 0.5, c: 0.5 } : gen(r);
    if (!REPLAY) list.push(d);
    const { act, bad, long } = await step(d, k);
    times.push([act.t, Math.round(long)]);
    log(`${k} ${act.t}${act.what ? ` ${String(act.what).slice(0, 60)}` : ""}${act.skipped ? " (skipped)" : ""} ${Math.round(long)}ms${bad.length ? "  !! " + bad.map((b) => `${b.kind}: ${b.msg}`).join(" | ") : ""}`);
    for (const b of bad) problems.push({ ...b, step: k, act: act.t, what: act.what });
    document.title = `monkey ${k + 1}/${STEPS} ${problems.length}`;
  }
  // each kind of problem once, shrunk to the shortest run of steps that still shows it
  const seen = new Map();
  for (const p of problems) { const key = p.kind + "|" + p.msg.replace(/[\d.]+/g, "#").replace(/“[^”]*”/g, "“”"); if (!seen.has(key)) seen.set(key, p); }
  const found = [...seen.values()];
  if (SHRINK && !REPLAY) for (const p of found.slice(0, 8)) p.replay = b64(await shrink(list.slice(0, p.step + 1), p));
  const slow = times.filter(([, l]) => l > BUDGET).length;
  window.monkey = { seed: SEED, start: START, steps: list.length, problems: found, all: problems.length, slow, worst: times.slice().sort((a, b) => b[1] - a[1]).slice(0, 5), list: b64(list) };
  log(JSON.stringify(window.monkey, null, 1));
  document.title = `DONE ${list.length} ${found.length}`;
}
// the shortest run of steps (a suffix, then steps left out one at a time) that still shows a problem of the same kind
// and wording
const b64 = (x) => btoa(JSON.stringify(x)).replace(/\+/g, "-").replace(/\//g, "_");   // (fit for a URL)
// (a few minutes at most for each: every try starts the page again and replays the steps)
async function shrink(list, p) {
  const key = (b) => b.kind + "|" + b.msg.replace(/[\d.]+/g, "#").replace(/“[^”]*”/g, "“”");
  const want = key(p), t0 = performance.now(), more = () => performance.now() - t0 < 180000;
  const shows = async (l) => (await run(l)).problems.some((b) => key(b) === want);
  let best = list;
  for (let n = 1; n < list.length && n <= 32 && more(); n *= 2) { const l = list.slice(-n); if (await shows(l)) { best = l; break; } }
  for (let i = best.length - 2; i >= 0 && best.length <= 24 && more(); i--) { const l = best.filter((_, j) => j !== i); if (await shows(l)) best = l; }
  return best;
}
main().catch((e) => { log("CRASH " + (e.stack || e)); document.title = `DONE 0 crash`; window.monkey = { crash: String(e.stack || e) }; });
