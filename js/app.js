import { buildBookmark, hiddenBlocks, READY, RED, stepsFor } from "./core/bookmark.js";
import { turnForMachine, turnPattern } from "./core/design.js";
import { FONTS, fontOf } from "./core/fonts.js";
import { STITCH, designStats, machineThreads, readEmbroidery, validatePES, writePES } from "./core/formats.js";
import { DEFAULT_MACHINE, MACHINES, MARGIN, hoop as getHoop } from "./core/machines.js";
import { DENSITY, workingSize } from "./core/digitize.js";
import { nearestBrotherThread, pecThread } from "./core/threads.js";
import { CLOTHS, colorBlocks, draw } from "./render.js";
import { cutSVG, sewSheet } from "./sheet.js";
import { zip } from "./zip.js";
import { checkup, heat, landJumps, shortJumps, sortedChanges } from "./doctor.js";
import { BRANDS, nearestSpool, spools } from "./core/brands.js";
import { initStudio } from "./studio/ui.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("nw:" + k)) ?? d; } catch { return d; } },
  set(k, v) {
    try { localStorage.setItem("nw:" + k, JSON.stringify(v)); }
    catch { if (k === "studio" && !store.warned) { store.warned = true; showError("This design is too big to keep in the browser between visits. Use Save design to keep it."); } }
  },
};

// exact Brother PEC colours, so the name on the machine's screen is the swatch's (#1a1a1a showed as "Olive Green")
const THREADS = ["#ed171f", "#c70156", "#f64a8a", "#770176", "#0e1f7c", "#00673e", "#e8a900", "#000000"];
const OLD_THREADS = { "#c8102e": "#ed171f", "#e1252f": "#ed171f", "#f06292": "#f64a8a", "#7b2d8e": "#770176",
  "#1f3a68": "#0e1f7c", "#2e6b3a": "#00673e", "#c99a2e": "#e8a900", "#1a1a1a": "#000000" };

const state = {
  mode: "picture",
  machine: store.get("machine", DEFAULT_MACHINE),
  hoopId: store.get("hoop", null),
  view: null,          // { pattern, bytes, filename, file (the bytes read back), shown, cache, fabric, fabricShapeBlock, hide,
                       //   steps, sheet, split, verifyAgainst, threadLabel }
  views: {},           // last view per mode
  zoom: 1, pan: [0, 0], upto: null,
  step: null,   // Design tab: show the design as it is after that colour block
  showHoop: store.get("showHoop", true),
  // hoop turned sideways on screen, per tab; the bookmark reads best lying down
  turn: { picture: false, bookmark: true, design: false, open: false, ...store.get("turn", {}) },
  bm: { name: store.get("bm.name", "Emma"), font: store.get("bm.font", FONTS[0].family), color: (c => OLD_THREADS[c] || c)(store.get("bm.color", RED)), fabric: store.get("bm.fabric", "pink"), lead: store.get("bm.lead", true), tail: store.get("bm.tail", true), blank: store.get("bm.blank", false) },
  brand: BRANDS[store.get("brand", "")] ? store.get("brand", "") : "",   // thread brand for spool numbers ("" = Brother only)
  spools: store.get("spools", {}),   // { brand: [spool numbers owned] }
  pic: { mine: store.get("pic.mine", false), style: "fill", cross: 2.5, file: null, bitmap: null, key: 0, skip: [], colors: 4, size: 100, angle: 45, bg: true, density: store.get("pic.density", "standard"), req: 0, colorsInfo: [] },
};
if (!MACHINES[state.machine]) state.machine = DEFAULT_MACHINE;
const hoop = () => getHoop(state.machine, state.hoopId);
// (a square hoop turned is the same hoop: the turn is off there, or a 4x4 file came out sideways with a turn note)
const square = () => { const h = hoop(); return h.w === h.h; };
const turned = () => !!state.turn[state.mode] && !square();
// the hoop as it looks on screen
const shownHoop = () => { const h = hoop(); return turned() ? { ...h, w: h.h, h: h.w } : h; };
// the Design tab lays pieces out in the hoop as it's shown (turned: the long side across), and its files are turned
// clockwise into the machine's orientation, as a turned picture is
const designTurned = () => !!state.turn.design && !square();
const designHoop = () => { const h = hoop(); return designTurned() ? { ...h, w: h.h, h: h.w } : h; };
const toMachine = (p) => (designTurned() ? turnForMachine(p) : p);
const turnCut = (loops) => loops.map((l) => l.map(([x, y]) => [-y, x]));

// ---------- preview ----------
const canvas = $("view");
// the design as it is after colour block i (step view, sew along): sewn so far, the rest faint; placement lines show
// until the fabric goes over them
function stepLook(v, i, block) {
  const fab = v.fabricShapeBlock;
  return { upto: block ? block.segs.reduce((m, sg) => Math.max(m, sg[sg.length - 1][2]), 0) + 1 : undefined,
    hide: new Set([...(v.hide || [])].filter((k) => k < i)), fabricShapeBlock: fab != null && i <= fab ? undefined : fab };
}
function paint() {
  const v = state.view;
  $("empty").hidden = !!v;
  if (!v) { draw(canvas, null); return; }
  const block = state.step != null && state.mode === "design" && v.cache.blocks.find((b) => b.index === state.step);
  const look = block ? stepLook(v, state.step, block) : { upto: state.upto ?? undefined, hide: v.hide, fabricShapeBlock: v.fabricShapeBlock };
  state.tf = draw(canvas, v.shown, {
    // (a design too big for the hoop, or split in two, is fitted whole: centred on the hoop it was cut off)
    center: state.mode === "design" && !v.whole ? [0, 0] : undefined, ghost: !!block,
    cache: v.cache, fabric: v.fabric, ...look,
    heat: state.heat ? (v.heat ||= heat(v.shown)) : null, backdrop: state.backdrop,
    hoop: shownHoop(), showHoop: state.showHoop && !state.backdrop, zoom: state.zoom, pan: state.pan, showNeedle: state.upto != null,
    real: state.real, boxes: v.hoopings,
    fieldColor: dark.matches && state.showHoop && !state.backdrop ? "#ece5da" : undefined,
    padTop: $("facts").offsetHeight + 16,
  });
}
new ResizeObserver(() => paint()).observe(canvas);
const dark = matchMedia("(prefers-color-scheme: dark)");
dark.addEventListener("change", () => paint());

function setView(v) {
  stopPlay();
  state.view = v; state.views[state.mode] = v; state.upto = null; $("progress").value = 1000;
  if (state.step != null && !(v?.steps > state.step)) showStep(null);   // the design changed under a step view
  $("turn").setAttribute("aria-pressed", turned());
  $("turn").disabled = square(); $("turn").title = square() ? "A square hoop is the same either way round." : "Turn the hoop sideways, so a long design can use the hoop's long side.";
  if (!v) { $("dl-warn").hidden = true; $("facts").innerHTML = ""; $("threads").innerHTML = ""; $("download").disabled = true; $("download").textContent = "Download PES"; $("share").disabled = true; $("sheet-print").disabled = $("along-open").disabled = true; $("cut-file").hidden = true; $("names-open").hidden = true; paint(); return; }
  // the preview is the file: decode the PES bytes and draw those, not the design they were made from
  if (!v.file) {
    try { v.file = v.source ? v.pattern : readEmbroidery(v.bytes, v.filename); }
    catch (err) { v.file = null; showError("This file didn't read back: " + err.message); $("download").disabled = true; $("share").disabled = true; return; }
  }
  v.shown = turned() ? turnPattern(v.file, false) : v.file; v.heat = null;
  v.cache = colorBlocks(v.shown);
  const st = designStats(v.file), h = hoop(), shown = designStats(v.shown);
  // (a split design is checked part by part when it's downloaded)
  const fits = !!v.split || (st.widthMm <= h.w - 2 * MARGIN && st.heightMm <= h.h - 2 * MARGIN);
  v.whole = !!v.split || !fits;
  const inch = (mm) => (mm / 25.4).toFixed(1), over = (v, side) => (v > side - 2 * MARGIN && Math.round(v) <= side - 2 * MARGIN ? v.toFixed(1) : v.toFixed(0));
  const minutes = Math.max(1, Math.round(st.stitches / 550 + st.colorChanges * 0.5)), snips = shortJumps(v.file);
  $("facts").innerHTML = [
    // (a size just over the field isn't rounded down to read as if it fits: 126.4 showed as 126 beside "fits 126")
    `<span>${over(shown.widthMm, shownHoop().w)} × ${over(shown.heightMm, shownHoop().h)} mm · ${inch(shown.widthMm)} × ${inch(shown.heightMm)} in</span>`,
    `<span>${st.stitches.toLocaleString()} stitches</span>`,
    // (on the Picture and Open tabs every pause is a change of thread: say so; the Design tab's can be fabric steps)
    st.colorChanges ? (state.mode === "picture" || state.mode === "open" ? `<span title="The machine stops for each one: thread the next colour and press Start.">${st.colorChanges} thread ${st.colorChanges === 1 ? "change" : "changes"}</span>` : `<span>${st.colorChanges} ${st.colorChanges === 1 ? "pause" : "pauses"}</span>`) : "",
    `<span>≈ ${minutes} min</span>`,
    v.split ? `<span>${v.split.length} hoopings</span>` : fits ? "" : `<span class="bad">Too big for the ${h.name}</span>`,
    offCentre(v, fits) ? `<span class="note">Off centre here: the machine centres it <button type="button" class="link" id="recentre">Centre it</button></span>` : "",
    snips ? `<span title="The machine only trims jumps longer than its 'jump stitch not to trim' setting (5 mm at the lowest). The thread is locked at both ends, so these are safe to snip after stitching.">${snips} loose ${snips === 1 ? "thread" : "threads"} to snip after</span>` : "",
  ].join("");
  const seen = new Set(), mt = machineThreadList(v);
  $("threads").innerHTML = v.cache.blocks.filter((b) => !(v.hide && v.hide.has(b.index)))
    .map((b) => {
      const t = mt[b.index] || nearestBrotherThread(b.color), label = v.threadLabel ? v.threadLabel(b, t) : `Brother ${t.name}`;
      const k = b.color + label; if (seen.has(k)) return ""; seen.add(k);
      return `<li><i style="background:${b.color}"></i><span>${label}${spool(b.color) ? `<br><small>${spool(b.color)}</small>` : ""}</span></li>`;
    }).join("");
  v.facts = [`${st.widthMm.toFixed(0)} × ${st.heightMm.toFixed(0)} mm (${inch(st.widthMm)} × ${inch(st.heightMm)} in)`, `${st.stitches.toLocaleString()} stitches`,
    `${st.colorChanges} ${st.colorChanges === 1 ? "pause" : "pauses"}`, `≈ ${minutes} min`, `${h.machineName} ${h.name}`];
  // (`block`: a design that can't be sewn as it is, such as words wrapped round into themselves: no file until it's fixed)
  $("download").disabled = !fits || !!v.block; $("share").disabled = !fits || !!v.split || !!v.block;
  $("sheet-print").disabled = $("along-open").disabled = !fits || !!v.split; $("cut-file").hidden = !v.sheet?.cut?.length; $("names-open").hidden = !!v.split || !namesFor();
  // (one per name from a design that doesn't fit yet made a zip of names that didn't fit either)
  $("names-open").disabled = !fits; $("names-open").title = fits ? "" : "Make the design fit the hoop first.";
  if (state.mode === "picture") picSteps(v, st);
  // (pieces running into each other said beside Download, before the file is saved, not only in the editor)
  $("dl-warn").textContent = v.block || v.warn || ""; $("dl-warn").hidden = !v.block && !v.warn;
  $("download").textContent = v.split ? `Download ${v.split.length} files (.zip)` : !fits ? "Too big for this hoop" : v.block ? "Fix the lettering first" : v.action || `Download ${v.filename}`;
  paint();
}
// the Picture tab's steps: what to have ready, then one thread per pause (it had none: "3 pauses" went unexplained)
function picSteps(v, st) {
  const mt = machineThreadList(v), blocks = v.cache.blocks;
  $("pic-steps-count").textContent = `· ${blocks.length} ${blocks.length === 1 ? "thread" : "threads"}`;
  $("pic-steps").innerHTML = `<li class="after"><b>Have ready</b><span>${st.stitches > 8000 ? "Cut-away stabilizer (or two layers of tear-away): this is a lot of stitching." : "Tear-away stabilizer under woven fabric, cut-away under knits."} The threads below, in this order.</span></li>`
    + blocks.map((b, i) => { const t = mt[b.index] || nearestBrotherThread(b.color);
      return `<li><b><span class="n">${i + 1}</span><i style="background:${b.color}"></i>Brother ${escapeHtml(t.name)}${spool(b.color) ? ` <small>${escapeHtml(spool(b.color))}</small>` : ""}</b><span class="you">${i ? "The machine stops: thread this colour and press Start." : "Hoop the fabric with the stabilizer, thread this colour and press Start."}</span></li>`; }).join("")
    + `<li class="after"><b>When it's done</b><span>Take the hoop off, snip any loose threads between parts, and tear or cut away the stabilizer.</span></li>`;
}
// a Design-tab layout that fits the hoop but sits past its edge on screen (pieces dragged off to one side): the
// machine centres the whole design, so it sews fine, but it looked like it would hit the hoop
function offCentre(v, fits) {
  if (state.mode !== "design" || !fits || v.split) return false;
  const h = shownHoop(), lx = (h.w / 2 - MARGIN) * 10, ly = (h.h / 2 - MARGIN) * 10;
  for (const [x, y, c] of v.shown.stitches) if (c === STITCH && (Math.abs(x) > lx || Math.abs(y) > ly)) return true;
  return false;
}
// thread names exactly as the machine will show them: the file's own PEC palette
function machineThreadList(v) {
  const p = v.file;
  return p.pec ? p.pec.map(pecThread) : machineThreads(p.threads);
}
// an error in plain words, with a one-tap fix when there is one ({ label, run })
function showError(msg, fix) {
  const e = $("error"); e.textContent = msg; e.hidden = !msg;
  if (msg && fix) { const b = document.createElement("button"); b.type = "button"; b.className = "link"; b.textContent = fix.label; b.onclick = fix.run; e.append(" ", b); }
}
function busy(on, text = "Stitching…") { $("busy").hidden = !on; $("busy-text").textContent = text; }

// zoom & pan
$("zoom-in").onclick = () => { state.zoom = Math.min(12, state.zoom * 1.4); paint(); };
$("zoom-out").onclick = () => { state.zoom = Math.max(0.4, state.zoom / 1.4); paint(); };
$("zoom-fit").onclick = () => { state.zoom = 1; state.pan = [0, 0]; paint(); };
// pan, pinch and wheel move faster than the screen redraws: at most one paint a frame
let paintQueued = 0;
const paintSoon = () => { paintQueued ||= requestAnimationFrame(() => { paintQueued = 0; paint(); }); };
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const f = Math.exp(-e.deltaY * 0.0015), r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
  const nz = Math.min(12, Math.max(0.4, state.zoom * f)), k = nz / state.zoom;
  state.pan = [mx - (mx - state.pan[0]) * k, my - (my - state.pan[1]) * k]; state.zoom = nz; paintSoon();
}, { passive: false });
const pointers = new Map();
// screen point -> design mm (undoing the on-screen hoop turn)
function toMm(e) {
  const tf = state.tf, r = canvas.getBoundingClientRect();
  if (!tf) return null;
  const sx = (e.clientX - r.left - tf.ox) / tf.scale / 10, sy = (e.clientY - r.top - tf.oy) / tf.scale / 10;
  return turned() && state.mode !== "design" ? [-sy, sx] : [sx, sy];
}
let dragging = false;
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (state.mode === "design" && !pointers.size) { const mm = toMm(e); dragging = !!(mm && studio.start(mm)); }
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
});
canvas.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  if (dragging && pointers.size === 1) { const mm = toMm(e); if (mm) studio.move(mm); return; }
  const prev = pointers.get(e.pointerId);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()], d0 = Math.hypot(a[0] - b[0], a[1] - b[1]);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    const [c, d] = [...pointers.values()], d1 = Math.hypot(c[0] - d[0], c[1] - d[1]);
    if (d0 > 0) { state.zoom = Math.min(12, Math.max(0.4, state.zoom * (d1 / d0))); paintSoon(); }
    return;
  }
  // on a photo of the item, a drag that isn't on a piece slides the photo under the design
  if (state.backdrop && state.tf) {
    const k = 1 / state.tf.scale; state.backdrop.center = [state.backdrop.center[0] + (e.clientX - prev[0]) * k, state.backdrop.center[1] + (e.clientY - prev[1]) * k];
  } else state.pan = [state.pan[0] + e.clientX - prev[0], state.pan[1] + e.clientY - prev[1]];
  pointers.set(e.pointerId, [e.clientX, e.clientY]); paintSoon();
});
const up = (e) => { pointers.delete(e.pointerId); if (dragging && !pointers.size) { dragging = false; studio.end(); } };
canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
canvas.addEventListener("dblclick", () => $("zoom-fit").click());

// sew-out playback
let playing = 0;
function stopPlay() { if (playing) cancelAnimationFrame(playing); playing = 0; $("play").textContent = "▶︎ Watch it sew"; }
$("play").onclick = () => {
  if (!state.view) return;
  showStep(null);
  if (playing) { stopPlay(); return; }
  // (phones: the hoop was mostly scrolled off while it played)
  const r = canvas.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) canvas.scrollIntoView({ block: "center", behavior: "smooth" });
  const total = state.view.cache.total, dur = Math.min(14000, 3000 + total * 1.2);
  const from = state.upto == null || state.upto >= total ? 0 : state.upto, t0 = performance.now() - (from / total) * dur;
  $("play").textContent = "❚❚ Pause";
  const step = (t) => {
    state.upto = Math.min(total, Math.round(((t - t0) / dur) * total));
    $("progress").value = Math.round((state.upto / total) * 1000); paint();
    if (state.upto < total) playing = requestAnimationFrame(step); else { stopPlay(); state.upto = null; paint(); }
  };
  playing = requestAnimationFrame(step);
};
$("progress").oninput = (e) => {
  if (!state.view) return; stopPlay(); showStep(null);
  const v = +e.target.value; state.upto = v >= 1000 ? null : Math.round((v / 1000) * state.view.cache.total); paint();
};
$("show-heat").onchange = (e) => { state.heat = e.target.checked; paint(); };
$("show-real").checked = state.real = store.get("real", false);
$("facts").addEventListener("click", (e) => { if (e.target.id === "recentre") studio.recentre(); });
$("show-real").onchange = (e) => { state.real = e.target.checked; store.set("real", state.real); if (state.real && state.zoom < 3) { state.zoom = 3; } paint(); };
$("show-hoop").checked = state.showHoop;
$("show-hoop").onchange = (e) => { state.showHoop = e.target.checked; store.set("showHoop", state.showHoop); paint(); };
$("turn").onclick = () => {
  if (square()) return;
  if (state.mode === "design") studio.remember();   // (a turn is undone like any other change)
  state.turn[state.mode] = !turned(); store.set("turn", state.turn);
  state.zoom = 1; state.pan = [0, 0];
  if (state.mode === "picture") makePicture(); else if (state.mode === "design") studio.make(); else setView(state.view);
};

// USB file names the machine can show: plain ASCII (José -> Jose, Łukasz -> Lukasz, Søren -> Soren), nothing else,
// never empty (letters with no accent to strip were dropped: "Zoe_ukasz", "S_ren")
const LATIN = { Ł: "L", ł: "l", Ø: "O", ø: "o", ß: "ss", Æ: "AE", æ: "ae", Œ: "OE", œ: "oe", Đ: "D", đ: "d", Ð: "D", ð: "d", Þ: "Th", þ: "th", ı: "i", Ħ: "H", ħ: "h", Ŧ: "T", ŧ: "t", Ŋ: "N", ŋ: "n", ĸ: "k" };
function safeName(s, fallback) {
  const t = s.replace(/[ŁłØøßÆæŒœĐđÐðÞþıĦħŦŧŊŋĸ]/g, (c) => LATIN[c]).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return t || fallback;
}
// a file handed to the browser's downloads
function saveFile(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
// iPhone/iPad/Android share sheet: Messages, Mail, AirDrop, Save to Files
function pesFile(v) { return new File([v.bytes], v.filename, { type: "application/octet-stream" }); }
function canShareFile() {
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], "x.pes", { type: "application/octet-stream" })] })); }
  catch { return false; }
}
$("share").hidden = !canShareFile();
$("share").onclick = async () => {
  const v = state.view; if (!v) return;
  const check = validatePES(v.bytes, v.verifyAgainst || null, hoop());
  if (!check.ok) { showError("Sending stopped: " + check.error); return; }
  try {
    await navigator.share({ files: [pesFile(v)], title: v.filename,
      text: `Embroidery file for a ${hoop().machineName} (${hoop().name}). Copy it to a USB stick to stitch it.` });
  } catch (err) {
    if (err && err.name !== "AbortError") showError("Couldn't open the share sheet. Use Download instead.");
  }
};

$("download").onclick = () => {
  const v = state.view; if (!v) return;
  if (v.split) {   // one file per hooping, each proven like any other download
    const files = [];
    for (const p of v.split) {
      const bytes = writePES(p.pattern), check = validatePES(bytes, p.pattern, hoop());
      if (!check.ok) { showError(`Download stopped (${p.filename}): ${check.error}`); return; }
      files.push({ name: p.filename, bytes });
    }
    saveFile(new Blob([zip(files)], { type: "application/zip" }), v.filename);
    downloaded(v, true);
    return;
  }
  // never hand out a file we haven't proven decodes to exactly this design
  const check = validatePES(v.bytes, v.verifyAgainst || null, hoop());
  if (!check.ok) { showError("Download stopped: " + check.error); return; }
  saveFile(new Blob([v.bytes], { type: "application/octet-stream" }), v.filename);
  downloaded(v, false);
};
// what was checked and the next steps at the machine, until "Don't show this again"
function downloaded(v, zipped) {
  if (store.get("doneSeen", false)) return;
  // (the size as the preview shows it: a turned bookmark is 169 × 54, not 54 × 169)
  const h = hoop(), s = v.shown && designStats(v.shown);
  $("done-checked").textContent = `Checked: it opens on a ${h.machineName} in the ${h.name}${s ? `, ${s.widthMm.toFixed(0)} × ${s.heightMm.toFixed(0)} mm, ${s.colorChanges ? (state.mode === "picture" || state.mode === "open" ? `${s.colorChanges} thread ${s.colorChanges === 1 ? "change" : "changes"}` : `${s.colorChanges} ${s.colorChanges === 1 ? "pause" : "pauses"}`) : "no pauses"}` : ""}.`;
  $("done-zip").hidden = !zipped;
  $("done-phone").hidden = !matchMedia("(pointer: coarse)").matches;
  $("done-turn").hidden = !(state.mode === "design" && designTurned());
  // (Design-tab warnings still showing: "Checked" shouldn't read as "all good")
  const warns = state.mode === "design" ? [...document.querySelectorAll("#st-edit [data-warn]:not([hidden])")].map((w) => w.textContent.trim()) : [];
  $("done-warn").hidden = !warns.length; $("done-warn").textContent = warns.length ? "Still to look at: " + warns.join(" ") : "";
  // (only the Design tab and the bookmark have “How to stitch it”)
  $("done-sew").textContent = state.mode === "design" || state.mode === "bookmark"
    ? "Pick the design, then follow “How to stitch it” (or Sew along) at every pause."
    : "Pick the design and press Start. At each pause, thread the next colour listed beside the preview (Sew along shows each one).";
  $("done").showModal();
}
$("done-close").onclick = () => { if ($("done-never").checked) store.set("doneSeen", true); $("done").close(); };

// sew sheet: the design at 1:1 on the hoop field, the steps, appliqué shapes; printed from a hidden block
function fillSheet() {
  const v = state.view; if (!v?.file || v.split) return false;
  $("sheet").innerHTML = sewSheet({ pattern: v.file, filename: v.filename, hoop: hoop(), facts: v.facts, threads: machineThreadList(v), hide: v.hide, sheet: v.sheet, spool });
  return true;
}
$("sheet-print").onclick = () => { if (fillSheet()) window.print(); };
addEventListener("beforeprint", () => { if (!$("sheet").innerHTML) fillSheet(); });
addEventListener("afterprint", () => { $("sheet").innerHTML = ""; });
$("cut-file").onclick = () => {
  const v = state.view; if (!v?.sheet?.cut?.length) return;
  const name = v.filename.replace(/\.pes$/i, "");
  saveFile(new Blob([cutSVG(v.sheet.cut, name)], { type: "image/svg+xml" }), `${name}_cut.svg`);
};

// ---------- on my item ----------
// a photo of the real bib or towel under the design at true size: two dots on something measured set the scale
const cal = { bmp: null, a: [0.25, 0.5], b: [0.75, 0.5], drag: null };
$("item-open").onclick = () => {
  if (state.backdrop) { state.backdrop = null; $("item-open").textContent = "On my item"; state.zoom = 1; state.pan = [0, 0]; paint(); return; }
  $("item-done").disabled = !cal.bmp; $("item").showModal(); calDraw();
};
$("item-file").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  $("item-error").hidden = true;
  try { cal.bmp = await createImageBitmap(f, { imageOrientation: "from-image" }); }
  catch { $("item-error").textContent = "That photo couldn't be opened. Try a JPG or PNG."; $("item-error").hidden = false; return; }
  cal.a = [0.25, 0.5]; cal.b = [0.75, 0.5]; $("item-done").disabled = false; calDraw();
};
function calDraw() {
  const c = $("item-cal"), has = !!cal.bmp;
  c.hidden = $("item-len-row").hidden = !has; if (!has) return;
  const W = Math.min(c.parentElement.clientWidth, 600), H = Math.round(W * Math.min(1.2, cal.bmp.height / cal.bmp.width)), dpr = devicePixelRatio || 1;
  c.style.width = W + "px"; c.style.height = H + "px"; c.width = W * dpr; c.height = H * dpr;
  const ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const k = Math.min(W / cal.bmp.width, H / cal.bmp.height), iw = cal.bmp.width * k, ih = cal.bmp.height * k, ox = (W - iw) / 2, oy = (H - ih) / 2;
  cal.box = [ox, oy, iw, ih];
  ctx.drawImage(cal.bmp, ox, oy, iw, ih);
  const P = ([u, v]) => [ox + u * iw, oy + v * ih], [ax, ay] = P(cal.a), [bx, by] = P(cal.b);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.strokeStyle = "#b3133a"; ctx.lineWidth = 2; ctx.stroke();
  for (const [x, y] of [[ax, ay], [bx, by]]) { ctx.fillStyle = "#b3133a"; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.stroke(); }
}
const calAt = (e) => { const r = $("item-cal").getBoundingClientRect(), [ox, oy, iw, ih] = cal.box; return [Math.min(1, Math.max(0, (e.clientX - r.left - ox) / iw)), Math.min(1, Math.max(0, (e.clientY - r.top - oy) / ih))]; };
$("item-cal").addEventListener("pointerdown", (e) => {
  const p = calAt(e), [, , iw, ih] = cal.box, d = (q) => Math.hypot((q[0] - p[0]) * iw, (q[1] - p[1]) * ih);
  cal.drag = d(cal.a) < d(cal.b) ? "a" : "b"; cal[cal.drag] = p; $("item-cal").setPointerCapture(e.pointerId); calDraw();
});
$("item-cal").addEventListener("pointermove", (e) => { if (cal.drag) { cal[cal.drag] = calAt(e); calDraw(); } });
$("item-cal").addEventListener("pointerup", () => { cal.drag = null; });
// keyboard: arrows move the first dot, Shift + arrows the second
$("item-cal").addEventListener("keydown", (e) => {
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d || !cal.bmp) return;
  e.preventDefault(); const k = e.shiftKey ? "b" : "a";
  cal[k] = [Math.min(1, Math.max(0, cal[k][0] + d[0] * 0.005)), Math.min(1, Math.max(0, cal[k][1] + d[1] * 0.005))]; calDraw();
});
$("item-done").onclick = () => {
  const mm = +$("item-len").value * +$("item-unit").value, px = Math.hypot((cal.a[0] - cal.b[0]) * cal.bmp.width, (cal.a[1] - cal.b[1]) * cal.bmp.height);
  if (!(mm > 0) || px < 5) return;
  // the photo's own pixels in 0.1 mm stitch units, centred under the design
  state.backdrop = { bmp: cal.bmp, unit: (mm * 10) / px, center: [0, 0] };
  $("item").close(); $("item-open").textContent = "Remove photo"; state.zoom = 1; state.pan = [0, 0]; paint();
};

// ---------- sew along ----------
// one step per screen at the machine: the design as it is after the step, the thread, what to do, how long it takes;
// the screen stays on while it's open
const along = { i: 0, lock: null };
function alongSteps(v) {
  const blocks = v.cache.blocks;
  const steps = [...(v.sheet?.steps?.length ? v.sheet.steps : blocks.map((b, i) => ({ you: i ? "Change to the next thread and press Start." : null, sews: "" })))];
  // (the first screen says what to have by the machine)
  if (v.sheet?.ready?.length && steps.length) steps[0] = { ...steps[0], you: `Have ready: ${v.sheet.ready.join(" ")} ${steps[0].you || ""}`.trim() };
  if (state.mode === "design" && designTurned() && steps.length) steps[0] = { ...steps[0], you: `${$("done-turn").textContent} ${steps[0].you || ""}`.trim() };
  return steps.map((s, i) => {
    const b = blocks.find((x) => x.index === i), n = b ? b.segs.reduce((a, sg) => a + sg.length, 0) : 0;
    return { ...s, block: b, minutes: Math.max(1, Math.round(n / 550)) };
  });
}
function alongShow() {
  const v = state.view, steps = alongSteps(v), i = along.i, done = i >= steps.length, mt = machineThreadList(v);
  $("along-count").textContent = done ? "All done" : `Step ${i + 1} of ${steps.length}`;
  $("along-back").disabled = i === 0;
  $("along-next").textContent = done ? "Close" : i === steps.length - 1 ? "Finish" : "Next step";
  let look = { hide: v.hide, fabricShapeBlock: v.fabricShapeBlock };
  if (done) {
    $("along-title").textContent = "Finished";
    $("along-you").textContent = (v.sheet?.after || []).join(" ") || "Take the hoop off, cut the jump threads, and tear or cut away the stabilizer.";
    $("along-sews").textContent = ""; $("along-time").textContent = "";
  } else {
    const s = steps[i], t = mt[i], sp = s.block && spool(s.block.color);
    $("along-title").innerHTML = `<i style="background:${s.block?.color || "#999"}"></i>${s.title ? escapeHtml(s.title) + " · " : ""}Brother ${escapeHtml(t?.name || "")}${sp ? ` <small>${escapeHtml(sp)}</small>` : ""}`;
    $("along-you").textContent = s.you || (i ? "" : "Thread the machine, put the hoop on, and press Start.");
    $("along-sews").textContent = s.sews || "";
    $("along-time").textContent = `About ${s.minutes} min of sewing.`;
    look = stepLook(v, i, s.block);
  }
  draw($("along-view"), v.shown, { cache: v.cache, fabric: v.fabric, ...look, ghost: look.upto != null, hoop: shownHoop(), showHoop: false, pad: 12 });
}
$("along-open").onclick = async () => {
  if (!state.view?.cache) return;
  along.i = 0; $("along").showModal(); alongShow();
  try { along.lock = await navigator.wakeLock?.request("screen"); } catch { along.lock = null; }
};
$("along-next").onclick = () => { if (along.i >= alongSteps(state.view).length) { $("along").close(); return; } along.i++; alongShow(); };
$("along-back").onclick = () => { if (along.i > 0) { along.i--; alongShow(); } };
$("along-close").onclick = () => $("along").close();
$("along").addEventListener("close", () => { along.lock?.release?.(); along.lock = null; });
// the wake lock lapses when the page is hidden; take it again on return
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && $("along").open && !along.lock) try { along.lock = await navigator.wakeLock?.request("screen"); } catch {}
});
new ResizeObserver(() => { if ($("along").open) alongShow(); }).observe($("along-view"));

// one file per name, in a zip: the Design tab swaps its lettering, the bookmark its name
function namesFor() {
  if (state.mode === "design") {   // (studio is set up further down)
    // (only the names that need the turned hoop are turned into the machine's orientation)
    try { const n = studio.forNames(); return n && { ...n, build: (...a) => { const m = n.build(...a); return { ...m, pattern: m.turned ? turnForMachine(m.pattern) : m.pattern, shown: m.pattern }; } }; }
    catch { return null; }
  }
  if (state.mode !== "bookmark" || state.bm.blank) return null;
  return { what: state.bm.name, bookmark: true, build: (name) => ({ name, pattern: buildBookmark({ name, family: state.bm.font, color: state.bm.color, hoop: hoop(),
    lead: state.bm.lead, tail: state.bm.tail, print: !!fontOf(state.bm.font).print }).pattern() }) };
}
$("names-open").onclick = () => {
  const n = namesFor(); if (!n) return;
  $("names-what").textContent = `Each name takes the place of “${n.what}”. Everything else stays the same.`;
  $("names-list").value = store.get("names", ""); $("names-note").classList.remove("warn");
  $("names-note").textContent = "One name per line, up to 40. You get one file for each, in a single .zip.";
  $("names-shrink-row").hidden = !!n.bookmark;   // (the bookmark shrinks a long name by itself)
  $("names-thumbs").innerHTML = ""; $("names-cancel").textContent = "Cancel";
  $("names").showModal();
};
$("names-make").onclick = async () => {
  const n = namesFor(); if (!n) return;
  const list = [...new Set($("names-list").value.split("\n").map((s) => s.trim()).filter(Boolean))].slice(0, 40);
  store.set("names", list.join("\n"));
  if (!list.length) { $("names-note").textContent = "Type at least one name."; return; }
  $("names-make").disabled = true; $("names-note").textContent = "Making the files…";
  const files = [], bad = [], used = new Set(), made = [];
  for (const name of list) {
    await new Promise((r) => setTimeout(r, 0));
    try {
      const { pattern, shown, smaller, thin, turned: sideways, runs } = n.build(name, $("names-shrink").checked), bytes = writePES(pattern), check = validatePES(bytes, pattern, hoop());
      if (!check.ok) throw new Error(check.error);
      let base = safeName(name, "name") + (n.bookmark ? "_bookmark" : ""), f = base, k = 2;
      while (used.has(f)) f = `${base}_${k++}`;
      used.add(f); files.push({ name: f + ".pes", bytes }); made.push({ name, file: f + ".pes", pattern, shown, smaller, thin, sideways, runs });
    } catch (err) { bad.push(`${name} (${/hoop fits|too big/i.test(err.message) ? "too long for the hoop" : err.message})`); }
  }
  $("names-make").disabled = false;
  // every name as it'll sew, to look over (is one crowded?), with what's different about it
  const notes = (m) => [m.thin ? "smaller, thin line" : m.smaller ? "smaller" : "", m.sideways ? "hoop turned" : "", m.runs ? `runs into ${m.runs}` : ""].filter(Boolean).join(", ");
  $("names-thumbs").innerHTML = made.map((m, i) => `<figure><canvas data-i="${i}"></canvas><figcaption>${escapeHtml(m.name)}${notes(m) ? ` (${escapeHtml(notes(m))})` : ""}</figcaption></figure>`).join("");
  for (const c of $("names-thumbs").querySelectorAll("canvas")) {
    const m = made[+c.dataset.i]; draw(c, m.shown || (n.bookmark ? turnPattern(m.pattern, false) : m.pattern), { pad: 6, fabric: "white" });   // (3 px: an arched name's top sat on the edge)
  }
  if (files.length) {
    saveFile(new Blob([zip(files)], { type: "application/zip" }), `${n.bookmark ? "bookmarks" : "names"}_${files.length}.zip`);
    $("names-cancel").textContent = "Done";
  }
  // (a turned file needs the fabric hooped a quarter turn round: said per file, since only the long names are)
  const side = made.filter((m) => m.sideways), runs = made.filter((m) => m.runs);
  $("names-note").classList.toggle("warn", bad.length > 0 || runs.length > 0);
  $("names-note").textContent = `${files.length ? `Made ${files.length} ${files.length === 1 ? "file" : "files"}, saved as one .zip (open it and copy the .pes files to the USB stick). ` : ""}`
    + (side.length ? `Hoop the fabric a quarter turn round for ${side.map((m) => m.file).join(", ")}: the machine shows ${side.length === 1 ? "it" : "them"} on ${side.length === 1 ? "its" : "their"} side, with the top of the name toward the right of the hoop. ` : "")
    + (runs.length ? `Runs into another piece: ${runs.map((m) => m.name).join(", ")} (${$("names-shrink").checked ? "even at half size: shorten" : `tick "Make long names smaller", or shorten`} ${runs.length === 1 ? "it" : "them"}). ` : "")
    + (bad.length ? `Couldn't make: ${bad.join(", ")}.` : "");
};

// ---------- thread brand ----------
// "≈ Isacord 1306", or the nearest spool they own ("your Isacord 1902"); "" when they use Brother thread
function spool(hex) {
  if (!state.brand) return "";
  const own = state.spools[state.brand], s = nearestSpool(state.brand, hex, own);
  // (an owned spool far from the colour isn't a match: white showed as "your Isacord 5513", a green)
  return !s ? "" : !own?.length ? `≈ ${s.label}` : s.dE > 25 ? `nearest of yours, ${s.label}, is quite different` : `your ${s.label}`;
}
function brandUI() {
  $("brand").innerHTML = `<option value="">Brother thread</option>` + Object.entries(BRANDS).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")
    + `<option value="@mine">Threads I own…</option>`;
  // (with spools listed, the brand reads "Isacord (threads I own)")
  for (const o of $("brand").options) if (o.value && state.spools[o.value]?.length) o.textContent += " (threads I own)";
  $("brand").value = state.brand;
  const mine = state.brand && state.spools[state.brand]?.length;
  $("pic-mine-row").hidden = !mine; $("pic-mine").checked = !!mine && state.pic.mine;
}
function relabel() { if (state.view) setView(state.view); paletteUI(); if (state.mode === "design") studio.make(); }
$("brand").onchange = (e) => {
  if (e.target.value === "@mine") { e.target.value = state.brand; openSpools(); return; }
  state.brand = e.target.value; store.set("brand", state.brand); brandUI(); relabel();
  if (state.pic.mine && state.mode === "picture") makePicture();
};
function openSpools() {
  $("spools-brand").innerHTML = Object.entries(BRANDS).map(([k, n]) => `<option value="${k}">${n}</option>`).join("");
  $("spools-brand").value = state.brand || "isacord";
  $("spools-list").value = (state.spools[$("spools-brand").value] || []).join(" ");
  spoolsPreview(); $("spools").showModal();
}
function spoolsPreview() {
  const b = $("spools-brand").value, typed = $("spools-list").value.split(/[\s,;]+/).filter(Boolean), got = spools(b, $("spools-list").value);
  const missing = typed.filter((t) => !spools(b, t).length);
  $("spools-note").textContent = (got.length ? `${got.length} ${BRANDS[b]} ${got.length === 1 ? "spool" : "spools"} found.` : "Type the numbers printed on your spools, separated by spaces.")
    + (missing.length ? ` Not in our ${BRANDS[b]} chart: ${missing.join(", ")}.` : "");
  $("spools-chips").innerHTML = got.map((n) => { const s = nearestSpool(b, "#000000", [n]); return `<span><i style="background:${s.hex}"></i>${n}</span>`; }).join("");
}
$("spools-brand").onchange = () => { $("spools-list").value = (state.spools[$("spools-brand").value] || []).join(" "); spoolsPreview(); };
$("spools-list").oninput = spoolsPreview;
$("spools-save").onclick = () => {
  const b = $("spools-brand").value;
  state.spools[b] = spools(b, $("spools-list").value); store.set("spools", state.spools);
  state.brand = b; store.set("brand", b); $("spools").close(); brandUI(); relabel();
  if (state.mode === "picture" && state.pic.mine) makePicture();
};
$("pic-mine").onchange = (e) => { state.pic.mine = e.target.checked; store.set("pic.mine", state.pic.mine); state.pic.skip = []; makePicture(); };
// the owned spools' colours, for "Use only threads I own"
function ownedPalette() {
  const own = state.brand && state.spools[state.brand];
  return state.pic.mine && own?.length ? own.map((n) => nearestSpool(state.brand, "#000000", [n]).hex) : null;
}

// ---------- machine & hoop ----------
function fillMachines() {
  $("machine").innerHTML = Object.entries(MACHINES).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join("");
  $("machine").value = state.machine;
  const m = MACHINES[state.machine];
  if (!m.hoops[state.hoopId]) state.hoopId = m.defaultHoop;
  $("hoop").innerHTML = Object.entries(m.hoops).map(([k, h]) => `<option value="${k}">${h.name}</option>`).join("");
  $("hoop").value = state.hoopId;
  const h = hoop();
  const max = Math.floor(Math.max(h.w, h.h) - 2 * MARGIN - 2);
  $("pic-size").max = max;
  if (state.pic.size > max) { state.pic.size = max; $("pic-size").value = max; $("pic-size-out").textContent = sizeLabel(max); }
}
const sizeLabel = (v) => `${v} mm · ${(v / 25.4).toFixed(1)} in`;
function hoopChanged() { if (state.mode !== "picture") state.pic.req++; for (const m of ["picture", "bookmark", "design"]) if (m !== state.mode) state.views[m] = null; fillMachines(); refresh(); }
$("machine").onchange = (e) => { state.machine = e.target.value; state.hoopId = null; store.set("machine", state.machine); hoopChanged(); };
$("hoop").onchange = (e) => { state.hoopId = e.target.value; store.set("hoop", state.hoopId); hoopChanged(); };
function refresh() { if (state.mode === "bookmark") makeBookmark(); else if (state.mode === "picture") makePicture(); else if (state.mode === "design") studio.make(); else if (state.view) setView(state.view); }

// ---------- tabs ----------
const MODES = ["picture", "bookmark", "design", "open"];
function setMode(mode, push = true) {
  if (!MODES.includes(mode)) mode = "design";
  state.mode = mode;
  document.body.dataset.mode = mode;
  for (const m of MODES) $("panel-" + m).hidden = m !== mode;
  // the bookmark is a starting idea inside Design your own, not a tab of its own
  // (one tab stop for the tab bar; the arrow keys move between tabs)
  for (const m of TABS) { const on = m === mode || (m === "design" && mode === "bookmark"); $("tab-" + m).setAttribute("aria-selected", on); $("tab-" + m).tabIndex = on ? 0 : -1; }
  if (push) history.replaceState(null, "", "#" + mode);
  showError(""); busy(false);   // (a picture still stitching from the last tab)
  $("empty").textContent = mode === "picture" ? "Choose a picture to see it as stitches." : mode === "open" ? "Open a PES, PEC or DST file to see it here." : mode === "design" ? "Nothing to stitch yet: type some words, or pick a starting idea." : "";
  state.zoom = 1; state.pan = [0, 0];
  if (mode === "picture" && !state.pic.bitmap) loadSample();
  else if (mode === "picture" && !state.views.picture) makePicture();
  else if (mode === "bookmark" && !state.views.bookmark) makeBookmark();
  else if (mode === "design" && !state.views.design) studio.make();
  else setView(state.views[mode] || null);
}
const TABS = MODES.filter((m) => m !== "bookmark");
for (const m of TABS) $("tab-" + m).onclick = () => setMode(m);
$("bm-back").onclick = () => setMode("design");
document.querySelector(".tabs").addEventListener("keydown", (e) => {
  // (in the order they're shown: MODES' order sent → from Design back to Picture)
  const tabs = [...document.querySelectorAll(".tabs [role=tab]")], i = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
  if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {
    const n = e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[tabs.length - 1] : tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    e.preventDefault(); n.click(); n.focus();
  }
});

// Redraw part of the page without losing keyboard focus: the focused control is found again in the new markup by its
// data- attributes (and its [data-seg] group), so Enter on a swatch doesn't send focus back to the top of the page.
function keepFocus(root, render) {
  const f = document.activeElement;
  let sel = null;
  if (f && f !== root && root.contains(f)) {
    const attrs = [...f.attributes].filter((x) => x.name.startsWith("data-")).map((x) => `[${x.name}="${CSS.escape(x.value)}"]`).join("");
    const group = f.closest("[data-seg]");
    if (attrs || f.id) sel = (group ? `[data-seg="${CSS.escape(group.dataset.seg)}"] ` : "") + (f.id ? `#${CSS.escape(f.id)}` : f.tagName.toLowerCase() + attrs);
  }
  const caret = f && "selectionStart" in f ? [f.selectionStart, f.selectionEnd] : null;
  render();
  const n = sel && root.querySelector(sel);
  if (n) { n.focus(); if (caret && "setSelectionRange" in n) try { n.setSelectionRange(...caret); } catch {} }
}

// ---------- bookmark ----------
let bmTimer = 0, bmSeq = 0;
function bookmarkUI() { keepFocus($("panel-bookmark"), drawBookmarkUI); }
function drawBookmarkUI() {
  $("bm-name").value = state.bm.name;
  $("bm-lead").checked = state.bm.lead; $("bm-tail").checked = state.bm.tail; $("bm-blank").checked = state.bm.blank;
  const kind = fontOf(state.bm.font).print ? "Dash" : "Swash";
  $("bm-lead-text").textContent = `${kind} before the name`; $("bm-tail-text").textContent = `${kind} after the name`;
  $("bm-name").disabled = state.bm.blank; $("bm-lettering").classList.toggle("off", state.bm.blank);
  $("bm-fonts").innerHTML = FONTS.map((f) => `<button type="button" data-f="${f.family}" title="${f.name}${f.note ? " · " + f.note : ""}" aria-pressed="${f.family === state.bm.font}">
    <span class="sample" style="font-family:'${f.family}'">${escapeHtml(stitchedName() || "Emma")}</span>
    <span class="fname">${f.name}${f.note ? " · " + f.note : ""}</span></button>`).join("");
  const custom = !THREADS.includes(state.bm.color);
  $("bm-colors").innerHTML = THREADS.map((c) => `<button type="button" data-c="${c}" style="background:${c}" aria-pressed="${c === state.bm.color}" aria-label="Brother ${nearestBrotherThread(c).name}" title="Brother ${nearestBrotherThread(c).name}"></button>`).join("")
    + `<span class="custom" style="box-shadow:0 0 0 ${custom ? "2.5px var(--ink)" : "1.5px var(--line)"}" title="Any colour"><input type="color" id="bm-custom" value="${state.bm.color}" aria-label="Any colour"></span>`
    + `<span class="swatch-name">Closest Brother thread: <b>${nearestBrotherThread(state.bm.color).name}</b></span>`;
  $("bm-fabrics").innerHTML = Object.entries(CLOTHS).map(([k, f]) => `<button type="button" data-fab="${k}" aria-pressed="${k === state.bm.fabric}"><i style="background:${f.solid || `repeating-conic-gradient(${f.cross} 0 25%, ${f.base} 0 50%) 0 0/8px 8px`}"></i>${f.label}</button>`).join("");
  const steps = stepsFor(state.bm.blank), pauses = steps.length - 1;
  $("bm-steps-count").textContent = `· ${steps.length} steps, ${pauses} pauses`;
  $("bm-steps-lede").textContent = `Keep the same thread in the whole time. The machine pauses ${pauses} times. Each pause is a fabric step.`;
  $("bm-steps").innerHTML = steps.map((s) => `<li><b>${s.title}</b><span>${s.you || s.machine}</span></li>`).join("");
}
// stitched exactly as typed
const stitchedName = () => state.bm.name.trim();
function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
$("bm-name").addEventListener("input", (e) => {
  state.bm.name = e.target.value; store.set("bm.name", state.bm.name);
  document.querySelectorAll("#bm-fonts .sample").forEach((s) => (s.textContent = stitchedName() || "Emma"));
  clearTimeout(bmTimer); bmTimer = setTimeout(makeBookmark, 350);
});
$("bm-fonts").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; state.bm.font = b.dataset.f; store.set("bm.font", b.dataset.f); bookmarkUI(); makeBookmark(); };
for (const k of ["lead", "tail", "blank"]) $("bm-" + k).onchange = (e) => { state.bm[k] = e.target.checked; store.set("bm." + k, state.bm[k]); bookmarkUI(); makeBookmark(); };
$("bm-colors").addEventListener("click", (e) => { const b = e.target.closest("button[data-c]"); if (!b) return; state.bm.color = b.dataset.c; store.set("bm.color", b.dataset.c); bookmarkUI(); makeBookmark(); });
$("bm-colors").addEventListener("change", (e) => { if (e.target.id !== "bm-custom") return; state.bm.color = e.target.value; store.set("bm.color", e.target.value); bookmarkUI(); makeBookmark(); });
$("bm-fabrics").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return; state.bm.fabric = b.dataset.fab; store.set("bm.fabric", b.dataset.fab); bookmarkUI();
  if (state.views.bookmark) { state.views.bookmark.fabric = state.bm.fabric; if (state.mode === "bookmark") paint(); }
};

async function makeBookmark() {
  const seq = ++bmSeq, name = stitchedName(), blank = state.bm.blank;
  showError("");
  if (!name && !blank) { setView(null); $("empty").textContent = "Type a name to see the bookmark."; return; }
  busy(true, "Lettering…");
  try {
    await document.fonts.load(`40px "${state.bm.font}"`);
    await new Promise((r) => setTimeout(r, 0));
    if (seq !== bmSeq) return;
    const d = buildBookmark({ name, family: state.bm.font, color: state.bm.color, hoop: hoop(), lead: state.bm.lead, tail: state.bm.tail,
      print: !!fontOf(state.bm.font).print, blank });
    const pattern = d.pattern();
    if (seq !== bmSeq || state.mode !== "bookmark") { state.views.bookmark = null; return; }
    setView({ pattern, verifyAgainst: pattern, bytes: writePES(pattern), filename: blank ? "blank_bookmark.pes" : `${safeName(state.bm.name, "name")}_bookmark.pes`,
      fabricShapeBlock: 0, hide: hiddenBlocks(blank), fabric: state.bm.fabric,
      sheet: { steps: stepsFor(blank).map((s) => ({ title: s.title, you: s.you, sews: s.machine })), cut: d.cut, ready: [READY], notes: ["Have ready: " + READY] }, threadLabel: () => `Brother ${nearestBrotherThread(state.bm.color).name} · whole bookmark` });
  } catch (err) {
    setView(null); $("empty").hidden = true;
    const big = Object.keys(MACHINES[state.machine].hoops).find((k) => { const h = getHoop(state.machine, k); return h.w >= 130 && h.h >= 180; });
    if (/needs the 5/.test(err.message) && big) showError(err.message.replace(/ Pick it at the top\.?$/, ""), { label: "Use the 5\" × 7\" hoop", run: () => { $("hoop").value = big; $("hoop").dispatchEvent(new Event("change")); } });
    else { console.error(err); showError(err.message); }
  }
  finally { if (seq === bmSeq) busy(false); }
}

// ---------- picture ----------
let worker = null;
// one job at a time, and only the newest waiting: three quick slider moves on a slow picture computed all three.
// A job that runs past a minute is stopped (a photo once routed for over 5 minutes and every later change queued
// behind it): the worker is replaced and the picture tab says what to try.
let picRunning = false, picNext = null, picWatch = 0;
function startWorker() {
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = onPicture;
  worker.onerror = (e) => { jobDone(); busy(false); if (state.mode === "picture") showError("Something went wrong while stitching this picture. " + (e.message || "")); };
}
function digitizeJob(msg) {
  if (picRunning) { picNext = msg; return; }
  picRunning = true; worker.postMessage(msg);
  clearTimeout(picWatch);
  picWatch = setTimeout(() => {
    worker.terminate(); startWorker(); picRunning = false; picNext = null; busy(false);
    state.views.picture = null;
    if (state.mode === "picture") { setView(null); showError("This picture is taking too long to stitch. Try fewer colours, a smaller size, or Line drawing."); }
  }, 60000);
}
function jobDone() { clearTimeout(picWatch); picRunning = false; if (picNext) { const m = picNext; picNext = null; digitizeJob(m); } }
function onPicture(e) {
  const r = e.data;
  jobDone();
  if (r.id !== state.pic.req) return;
  busy(false);
  if (!r.ok) { state.views.picture = null; if (state.mode === "picture") { setView(null); showError(r.error); } return; }
  showError("");
  const stitched = new Set(r.summary.map((c) => c.id));
  state.pic.colorsInfo = r.colors.filter((c) => stitched.has(c.id) || state.pic.skip.includes(c.id));
  // (asked for 4, got 3: say why, instead of a slider that looks ignored)
  state.pic.merged = r.merged || 0;
  const mt = machineThreads(r.pattern.threads);
  state.pic.machineName = new Map(r.pattern.threads.map((t, i) => [t.color, mt[i].name]));
  paletteUI();
  fineUI(r.fine);
  const base = safeName((state.pic.file?.name || "picture").replace(/\.[^.]+$/, ""), "picture");
  const v = { pattern: r.pattern, verifyAgainst: r.pattern, bytes: r.bytes, filename: `${base}${state.pic.style === "line" ? "_line" : state.pic.style === "cross" ? "_cross" : ""}.pes`, fabric: "linen",
  };
  state.views.picture = v;
  if (state.mode === "picture") setView(v);
}
startWorker();

function paletteUI() {
  const cols = state.pic.colorsInfo.filter((c) => !c.background && c.area > 0);
  $("pic-merged").hidden = !state.pic.merged;
  $("pic-merged").textContent = state.pic.merged ? `${state.pic.merged === 1 ? "One colour was" : `${state.pic.merged} colours were`} too close to another (or to the fabric) to need a thread of its own, so this picture uses ${cols.length} ${cols.length === 1 ? "thread" : "threads"}.` : "";
  $("pic-palette").innerHTML = cols.map((c) => `<button type="button" data-id="${c.id}" aria-pressed="${!state.pic.skip.includes(c.id)}">
    <i style="background:${c.hex}"></i><span>Brother ${state.pic.machineName?.get(c.hex) || c.thread.name}${spool(c.hex) ? `<small>${spool(c.hex)}</small>` : ""}</span></button>`).join("");
}
$("pic-palette").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const id = +b.dataset.id, s = state.pic.skip;
  state.pic.skip = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
  paletteUI(); makePicture();
};
const bindRange = (id, key, fmt) => {
  $(id).value = state.pic[key]; $(id + "-out").textContent = fmt(state.pic[key]);
  let t = 0;
  $(id).addEventListener("input", (e) => {
    state.pic[key] = +e.target.value; $(id + "-out").textContent = fmt(state.pic[key]);
    if (key === "colors") state.pic.skip = [];
    clearTimeout(t); t = setTimeout(makePicture, 250);
  });
};
bindRange("pic-colors", "colors", (v) => String(v));
bindRange("pic-size", "size", sizeLabel);
bindRange("pic-angle", "angle", (v) => `${v}°`);
bindRange("pic-cross", "cross", (v) => `${v} mm`);
// warn when parts of the picture are finer than thread can show (they'd close up or turn into a single line)
function fineUI(fine) {
  const issues = [];
  if (fine?.narrowMm2 >= 0.8) issues.push("some gaps (like inside or between small letters) are narrower than ½ mm and will close up");
  if (fine?.hairlines >= 5) issues.push("some lines are thinner than 1 mm and will be a single thread, not solid");
  $("pic-fine").hidden = !issues.length;
  $("pic-fine").textContent = issues.length
    ? `Some details are too small to stitch cleanly: ${issues.join(", and ")}. Make it bigger with Size, or try fewer thread colours.` : "";
}
const densityUI = () => document.querySelectorAll("#pic-density button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.d === state.pic.density));
densityUI();
$("pic-density").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  state.pic.density = b.dataset.d; store.set("pic.density", state.pic.density); densityUI(); makePicture();
};
// filled, a line drawing (redwork) or cross-stitch; each shows only its own settings
function styleUI() {
  const s = state.pic.style;
  document.querySelectorAll("#pic-style button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.s === s));
  $("pic-angle-row").hidden = $("pic-density-row").hidden = s !== "fill"; $("pic-cross-row").hidden = s !== "cross";
}
$("pic-style").onclick = (e) => { const b = e.target.closest("button"); if (!b || b.dataset.s === state.pic.style) return; state.pic.style = b.dataset.s; styleUI(); makePicture(); };
styleUI();
$("pic-bg").onchange = (e) => { state.pic.bg = e.target.checked; state.pic.skip = []; makePicture(); };

// first visit: show a sample so the page opens on real stitches, not an empty box
async function loadSample() {
  try {
    const blob = await (await fetch("assets/sample-flower.png")).blob();
    if (state.pic.bitmap) return;
    await loadPicture(new File([blob], "sample-flower.png", { type: "image/png" }), true);
  } catch { /* the empty state still explains what to do */ }
}

async function loadPicture(file, sample = false) {
  if (!file || !file.type.startsWith("image/")) { showError("That doesn't look like a picture. Try a PNG or JPG."); return; }
  try {
    const bitmap = await createImageBitmap(file);
    Object.assign(state.pic, { file, bitmap, box: null, key: state.pic.key + 1, skip: [] });
    setThumb(file); $("pic-rotate").hidden = false;
    $("pic-drop").querySelector(".drop-text").innerHTML = sample ? "<b>Choose your own picture</b> or drop it here." : `<b>${escapeHtml(file.name)}</b> · choose another`;
    $("pic-sample-note").hidden = !sample;
    $("pic-settings").hidden = false;
    setMode("picture"); makePicture();
  } catch { showError("This picture couldn't be opened. Try saving it as a PNG or JPG."); }
}
// OffscreenCanvas where available (iOS 16.4+), a plain canvas otherwise
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}

// bounding box of everything that isn't the border colour (or transparent), so "size" means the design
function contentBox(bitmap) {
  const S = 256, k = Math.min(1, S / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k)), h = Math.max(1, Math.round(bitmap.height * k));
  const c = makeCanvas(w, h), ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const border = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  const avg = [0, 1, 2].map((ch) => border.reduce((a, i) => a + d[i * 4 + ch], 0) / border.length);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const ink = d[i + 3] > 127 && Math.abs(d[i] - avg[0]) + Math.abs(d[i + 1] - avg[1]) + Math.abs(d[i + 2] - avg[2]) > 60;
    if (ink) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height };
  const m = 2;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  return { sx: x0 / k, sy: y0 / k, sw: (x1 - x0 + 1) / k, sh: (y1 - y0 + 1) / k };
}

function makePicture() {
  const p = state.pic; if (!p.bitmap) return;
  const box = p.bg ? (p.box ||= contentBox(p.bitmap)) : { sx: 0, sy: 0, sw: p.bitmap.width, sh: p.bitmap.height };
  const h = shownHoop(), sz = workingSize(box.sw, box.sh, p.size, h);
  const c = makeCanvas(sz.w, sz.h), ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(p.bitmap, box.sx, box.sy, box.sw, box.sh, 0, 0, sz.w, sz.h);
  const img = ctx.getImageData(0, 0, sz.w, sz.h);
  // (nothing from another tab stays on screen, with its Download, while this picture stitches)
  if (state.mode === "picture" && state.view && state.view !== state.views.picture) setView(null);
  p.req++; busy(true, "Stitching your picture…");
  digitizeJob({ id: p.req, img, opts: { colors: p.colors, removeBackground: p.bg, fillAngle: p.angle, density: DENSITY[p.density] || DENSITY.standard, skip: p.skip, hoop: h, turn: turned(), imageKey: p.key, palette: ownedPalette(), style: p.style, cross: p.cross } });
}
$("pic-file").onchange = (e) => loadPicture(e.target.files[0]);

function setThumb(blob) {
  const thumb = $("pic-thumb");
  if (thumb.src) URL.revokeObjectURL(thumb.src);
  thumb.src = URL.createObjectURL(blob); thumb.hidden = false;
}
// a quarter turn clockwise; the turned picture is what gets stitched (and shown in the thumbnail)
$("pic-rotate").onclick = async () => {
  const p = state.pic, b = p.bitmap; if (!b) return;
  const c = makeCanvas(b.height, b.width), ctx = c.getContext("2d");
  ctx.translate(b.height, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(b, 0, 0);
  Object.assign(p, { bitmap: await createImageBitmap(c), box: null, key: p.key + 1, skip: [] });
  setThumb(c.convertToBlob ? await c.convertToBlob() : await new Promise((r) => c.toBlob(r)));
  makePicture();
};

// ---------- open a design ----------
function pesVersion(v) {
  const n = parseInt(v, 10);
  if (!v || Number.isNaN(n)) return "";
  return ` version ${n >= 10 ? n / 10 : n}`;   // "0060" -> 6, "0100" -> 10, "0001" -> 1
}
async function openDesign(file) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // (jumps landed on their first stitch: a DST converted here, or a fixed copy, would gain a hole where each ended)
    const d = landJumps(readEmbroidery(bytes, file.name));
    if (!d.stitches.some((s) => s[2] === STITCH)) throw Object.assign(new Error(`${file.name} has no stitches in it. It may be damaged or not an embroidery file: try downloading it again.`), { plain: true });
    const repair = d.format === "pes" && d.misplaced;
    const isPes = d.format === "pes" && !repair;
    const out = isPes ? bytes : writePES(d);
    const st = designStats(d), h = hoop();
    const fits = st.widthMm <= h.w - 2 * MARGIN && st.heightMm <= h.h - 2 * MARGIN;
    const base = safeName(file.name.replace(/\.[^.]+$/, ""), "design");
    $("open-info").hidden = false;
    $("open-info").innerHTML = `<b>${escapeHtml(file.name)}</b>
      <span title="${d.format.toUpperCase()}${pesVersion(d.version)}">${st.stitches.toLocaleString()} stitches · ${d.threads.length || "no"} thread colours${d.threads.length ? " (named as the file names them)" : ""}</span>
      ${fits ? `<span class="good">Fits the ${h.machineName} ${h.name}.</span>` : `<span class="warn">Too big for the ${h.name}: it's ${st.widthMm.toFixed(0)} × ${st.heightMm.toFixed(0)} mm.</span>`}
      ${repair ? `<span class="warn">As it is, this file would load cut off on a Brother machine (shifted, about half shown). The download here is fixed.</span>`
        : isPes ? "" : `<span>You can download it as a PES file for your machine.</span>`}`;
    state.opened = { d, bytes, out, isPes, repair, base, opts: { scale: 1, tiny: false, thin: false, sort: false, split: false, satin: false }, sorted: sortedChanges(d),
      check: checkup(d), longer: Math.max(st.widthMm, st.heightMm), auto: false };
    $("doctor-fix").innerHTML = ""; setMode("open"); openView();
  } catch (err) {
    // (nothing from an earlier file stays on screen to be saved by mistake)
    if (!err.plain) console.error(err); state.opened = null; state.views.open = null; setMode("open"); setView(null);
    $("open-info").hidden = true; $("doctor").hidden = true;
    showError(err.plain ? err.message : `${file.name} couldn't be read as an embroidery file (PES, PEC or DST). It may be damaged: try downloading it again.`);
  }
}
// The fixes run in a worker (re-stitching star_badge.pes at 250 % froze the page for 10 s): one job at a time, only
// the newest waiting, and a result that's no longer wanted (another size, another file) is dropped.
// (started on the first fix, not with the page)
let docWorker = null, docRunning = false, docNext = null, docSeq = 0, docBusy = 0;
function docJob(msg) {
  if (!docWorker) {
    docWorker = new Worker(new URL("./doctor-worker.js", import.meta.url), { type: "module" });
    docWorker.onmessage = (e) => {
      const r = e.data;
      docDone();
      if (r.id !== docSeq || !state.opened) return;
      docIdle();
      if (!r.ok) { showError("This fix didn't work on this design: " + r.error); return; }
      showError(""); showOpened(r.pattern, r.bytes, r.check, true);
    };
    docWorker.onerror = (e) => { docDone(); docIdle(); if (state.mode === "open") showError("Something went wrong while fixing this design. " + (e.message || "")); };
  }
  if (docRunning) docNext = msg; else { docRunning = true; docWorker.postMessage(msg); }
}
function docDone() { docRunning = false; if (docNext) { const m = docNext; docNext = null; docJob(m); } }
const docIdle = () => { clearTimeout(docBusy); busy(false); };
// the opened file as it stands after the checkup's fixes (none: its own bytes, as they came)
function openView() {
  const o = state.opened, { scale, tiny, thin, sort, split, satin } = o.opts, changed = scale !== 1 || tiny || thin || sort || split || satin;
  docSeq++; docIdle();
  if (!changed) { showOpened(o.d, o.out, o.check, false); return; }
  // (a quick fix shows no spinner; re-stitching says so)
  const id = docSeq;
  docBusy = setTimeout(() => id === docSeq && busy(true, scale < 0.8 || scale > 1.2 ? "Re-stitching…" : "Working…"), 150);
  docJob({ id, d: o.d, opts: { ...o.opts } });
}
function showOpened(p, bytes, check, changed) {
  const o = state.opened, { scale, tiny, thin, sort, split, satin } = o.opts;
  const v = { pattern: p, verifyAgainst: changed || !o.isPes ? p : null, bytes,
    filename: `${o.base}${scale !== 1 ? `_${Math.round(scale * 100)}pct` : ""}.pes`, fabric: "linen", source: changed || !o.isPes ? null : o.bytes,
    // (a file she already has: say what the button gives her)
    action: o.repair || tiny || thin || sort || split || satin ? "Save fixed copy" : changed ? "Save resized copy" : o.isPes ? "Save a copy" : "Save as PES",
    // (the machine's name first: a design made here names its threads after its pieces, "peace", "“Sunny”")
    threadLabel: (b, t) => `Brother ${t.name}${b.name && b.name !== t.name ? " · " + escapeHtml(b.name) : ""}` };
  state.views.open = v; setView(v); doctorUI(p, check);
}
// what might go wrong at the machine, in plain words, with the fixes that are safe on a finished design
function doctorUI(p, check) {
  const c = check || checkup(p), o = state.opened.opts, items = [], src = state.opened.check;
  const say = (ok, text) => items.push(`<li class="${ok ? "good" : "warn"}">${text}</li>`);
  say(!c.hot, c.hot ? `${c.hot} ${c.hot === 1 ? "spot is" : "spots are"} very dense (up to ${c.max} needle hits per mm²; sold designs stay under 25): thread can break or the fabric pucker there. Turn on <b>Thickness</b> under the preview to see ${c.hot === 1 ? "it" : "them"}.`
    : `Thickness is fine: the densest spot has ${c.max} needle hits per mm².`);
  // (a few are normal in sold designs; only many are worth a worry)
  if (c.tiny > Math.max(50, c.stitches * 0.01)) say(false, `${c.tiny} stitches are shorter than 0.3 mm. They pile up thread and can break it.`);
  if (c.satinGap && c.satinGap > 0.6) say(false, `The satin stitches are far apart (${c.satinGap.toFixed(1)} mm on each edge; well-made designs 0.3–0.4 mm), so fabric may show through. Tick <b>Even out the satin stitches</b> below.`);
  // (packed tighter than sold designs: stiff, and the needle can deflect or the thread shred; gnome.pes at 80 %: 0.22)
  if (c.satinGap && c.satinGap < 0.25) say(false, `The satin stitches are packed very close (${c.satinGap.toFixed(2)} mm on each edge; well-made designs 0.3–0.4 mm): stiff, and thread can shred or the needle break. Tick <b>Even out the satin stitches</b> below.`);
  // (the PE900 sews 12.1 mm at most: pe900_check.py fails a file with a longer one; every fixed copy splits them)
  if (c.over) say(false, `${c.over} ${c.over === 1 ? "stitch is" : "stitches are"} longer than 12 mm (up to ${c.longest.toFixed(1)} mm), more than the machine sews in one stitch. Tick <b>Split long stitches</b> below.`);
  else if (c.long) say(true, `${c.long} ${c.long === 1 ? "stitch is" : "stitches are"} longer than 10 mm. Fine on a wall hanging; on clothes they can snag.`);
  // (shrinking brings jumps under the machine's 5 mm trim setting: they stay as thread to snip)
  const loose = shortJumps(state.views.open?.file || p) - shortJumps(state.opened.d);
  if (o.scale < 1 && loose > 0) say(false, `Shrinking brings ${loose} ${loose === 1 ? "jump" : "jumps"} under 5 mm, too short for the machine to trim: ${loose === 1 ? "it stays" : "they stay"} as loose thread to snip after stitching.`);
  say(true, c.perSqIn > 1500 ? `Heavy stitching (about ${c.perSqIn.toLocaleString()} stitches per square inch): use cut-away stabilizer, or two layers of tear-away.`
    : c.perSqIn > 600 ? `Medium stitching: tear-away stabilizer on woven fabric, cut-away on knits.` : `Light stitching: tear-away stabilizer is enough.`);
  $("doctor").hidden = false; $("doctor-list").innerHTML = items.join("");
  // the fixes are drawn once per file (redrawing the slider mid-drag would drop it); only their state follows
  const changes = Math.max(0, state.opened.d.threads.length - 1), sorted = state.opened.sorted;
  // (satins out of 0.3-0.5 mm on each edge in the file as it came: offered at full size, done by any resize)
  const uneven = src.satinGap && (src.satinGap < 0.3 || src.satinGap > 0.5);
  if (!$("doc-scale")) $("doctor-fix").innerHTML = `<label class="range"><span>Size</span><input type="range" id="doc-scale" min="50" max="250" step="5" value="100"><output>100 %</output></label>
    <label class="size-mm">Longer side <input type="number" id="doc-mm" inputmode="decimal" min="${Math.ceil(state.opened.longer * 0.5)}" max="${Math.floor(state.opened.longer * 2.5)}" step="1"> mm</label>
    <p class="hint" id="doc-scale-hint"></p>
    ${sorted != null ? `<label class="check small"><input type="checkbox" id="doc-sort"> Fewer thread changes (${changes} → ${sorted}): sews each thread's parts together where nothing in between is in the way</label>` : ""}
    ${uneven ? `<label class="check small"><input type="checkbox" id="doc-satin"> Even out the satin stitches (${src.satinGap.toFixed(2)} mm apart on each edge; 0.3–0.5 mm is right)</label>` : ""}
    <label class="check small"><input type="checkbox" id="doc-tiny"> Remove tiny stitches</label>
    ${src.over ? `<label class="check small"><input type="checkbox" id="doc-split"> Split long stitches</label>` : ""}
    <label class="check small"><input type="checkbox" id="doc-thin"> Thin the densest spots to 24 hits per mm²</label>`;
  sizeUI();
  $("doc-tiny").checked = o.tiny; $("doc-thin").checked = o.thin; if ($("doc-sort")) $("doc-sort").checked = o.sort;
  // (any resize splits long stitches and evens out satins itself: shown ticked)
  const resized = o.scale !== 1;
  if ($("doc-split")) { const other = resized || o.tiny || o.thin || o.sort; $("doc-split").checked = o.split || other; $("doc-split").disabled = other; }
  if ($("doc-satin")) { $("doc-satin").checked = o.satin || resized; $("doc-satin").disabled = resized; }
}
// the size controls follow o.scale (the slider moves in 5 % steps; the mm box can land anywhere between)
function sizeUI() {
  const o = state.opened.opts, pct = Math.round(o.scale * 100);
  if (document.activeElement !== $("doc-scale")) $("doc-scale").value = pct;
  $("doc-scale").nextElementSibling.textContent = `${pct} %`;
  if (document.activeElement !== $("doc-mm")) $("doc-mm").value = Math.round(state.opened.longer * o.scale);
  // within 80-120 % the stitches are scaled as they are; past that they're re-stitched at the new size
  $("doc-scale-hint").textContent = o.scale >= 0.8 && o.scale <= 1.2 ? "Up to 20 % either way the stitches are scaled as they are (denser smaller, more open bigger); satins are evened out."
    : "Re-stitched at the new size: satins and fills keep the file's own density. Check it in the preview: lettering and fine detail can change.";
}
// A new size. Shrinking packs short stitches into tiny ones, closer together: it ticks Remove tiny stitches and Thin,
// and untick them again back at 100 % or more if it was the slider that ticked them (ufront back at 100 % had lost 88
// stitches and offered "Save fixed copy").
function setScale(scale) {
  const s = state.opened, o = s.opts, was = o.scale;
  o.scale = Math.min(2.5, Math.max(0.5, scale));
  if (o.scale < 1 && was >= 1 && !o.tiny && !o.thin) { o.tiny = o.thin = true; s.auto = true; }
  if (o.scale >= 1 && s.auto) { o.tiny = o.thin = false; s.auto = false; }
  if ($("doc-tiny")) { $("doc-tiny").checked = o.tiny; $("doc-thin").checked = o.thin; }
  sizeUI();
}
// (the slider only shows the size while it moves; the design is made again when it's let go, or 300 ms after the
// last arrow key: each step re-stitched after every 250 ms pause until then)
$("doctor-fix").addEventListener("input", (e) => {
  if (e.target.id !== "doc-scale") return;
  e.target.nextElementSibling.textContent = `${e.target.value} %`; $("doc-mm").value = Math.round((state.opened.longer * e.target.value) / 100);
});
$("doctor-fix").addEventListener("change", (e) => {
  const s = state.opened, o = s.opts;
  if (e.target.id === "doc-scale") setScale(+e.target.value / 100);
  else if (e.target.id === "doc-mm") { const mm = parseFloat(e.target.value); if (!(mm > 0)) { sizeUI(); return; } setScale(Math.round((mm / s.longer) * 1000) / 1000); }
  else {
    if (e.target.id === "doc-tiny") { o.tiny = e.target.checked; s.auto = false; }
    if (e.target.id === "doc-thin") { o.thin = e.target.checked; s.auto = false; }
    if (e.target.id === "doc-sort") o.sort = e.target.checked;
    if (e.target.id === "doc-split") o.split = e.target.checked;
    if (e.target.id === "doc-satin") o.satin = e.target.checked;
    openView(); return;
  }
  clearTimeout(docTimer); docTimer = setTimeout(openView, 300);
});
let docTimer = 0;
$("open-file").onchange = (e) => e.target.files[0] && openDesign(e.target.files[0]);

// drag & drop / paste anywhere
function route(file) {
  if (!file) return;
  if (file.type.startsWith("image/")) loadPicture(file);
  else openDesign(file);
}
for (const id of ["pic-drop", "open-drop"]) {
  const el = $(id);
  el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("over"); });
  el.addEventListener("dragleave", () => el.classList.remove("over"));
}
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  document.querySelectorAll(".drop.over").forEach((d) => d.classList.remove("over"));
  route(e.dataTransfer.files[0]);
});
document.addEventListener("paste", (e) => {
  const f = [...(e.clipboardData?.files || [])][0];
  if (f) { e.preventDefault(); route(f); }
});

// ---------- start ----------
fillMachines();
brandUI();
bookmarkUI();
// ---------- design your own ----------
// Design tab: show the design as it stands after one step (null = all of it)
function showStep(i) {
  if (state.step === i) return;
  state.step = i; document.dispatchEvent(new CustomEvent("nw:step", { detail: i })); paint();
}
const studio = initStudio({
  hoop: designHoop, machineHoop: hoop, turned: designTurned, unturn: () => { if (state.turn.design) { state.turn.design = false; store.set("turn", state.turn); $("turn").setAttribute("aria-pressed", false); } }, fit: () => { state.zoom = 1; state.pan = [0, 0]; }, store, showError, busy, safeName, escapeHtml, saveFile, keepFocus, showStep, step: () => state.step, setMode, spool,
  // (undo, redo and Open saved put the hoop's turn back as it was; the caller rebuilds)
  setTurn: (on) => { state.turn.design = !!on; store.set("turn", state.turn); $("turn").setAttribute("aria-pressed", designTurned()); },
  hoopId: () => hoop().id,
  setHoop: (id) => { if (MACHINES[state.machine].hoops[id] && hoop().id !== id) { state.hoopId = id; store.set("hoop", id); hoopChanged(); } },
  // the spool of theirs a colour is sewn in ("Threads I own"), or null
  ownSpool: (hex) => { const own = state.brand && state.spools[state.brand]; return own?.length ? nearestSpool(state.brand, hex, own)?.label || null : null; },
  setView(pattern, filename, look = {}) {
    if (!pattern) { state.views.design = null; if (state.mode === "design") setView(null); return; }
    pattern = toMachine(pattern);
    if (look.split) look = { ...look, split: look.split.map((p) => ({ ...p, pattern: toMachine(p.pattern) })) };
    if (designTurned() && look.sheet?.cut) look = { ...look, sheet: { ...look.sheet, cut: look.sheet.cut.map((c) => turnCut(c)) } };
    const v = { pattern, verifyAgainst: pattern, bytes: writePES(pattern), filename, fabric: "linen", ...look };
    state.views.design = v;
    if (state.mode === "design") { const keep = [state.zoom, state.pan]; setView(v); [state.zoom, state.pan] = keep; paint(); }
  },
});

setMode((location.hash || "#design").slice(1), false);

// installable and offline (sw.js); a picture or design shared to the installed app opens straight away
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
if (new URLSearchParams(location.search).has("shared")) (async () => {
  try {
    const c = await caches.open("needleworks-shared"), r = await c.match("shared");
    if (r) { const blob = await r.blob(); await c.delete("shared"); route(new File([blob], decodeURIComponent(r.headers.get("x-name") || "shared"), { type: blob.type })); }
  } catch {}
  history.replaceState(null, "", location.pathname + location.hash);
})();
// a link to another tab on this page (#bookmark, #design...) switches to it
addEventListener("hashchange", () => { const m = location.hash.slice(1); if (m !== state.mode && MODES.includes(m)) setMode(m, false); });
