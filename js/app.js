import { buildBookmark, RED, STEPS } from "./core/bookmark.js";
import { designStats, readEmbroidery, writePES } from "./core/formats.js";
import { DEFAULT_MACHINE, MACHINES, MARGIN, hoop as getHoop } from "./core/machines.js";
import { workingSize } from "./core/digitize.js";
import { nearestBrotherThread } from "./core/threads.js";
import { FABRICS, colorBlocks, draw } from "./render.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("nw:" + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("nw:" + k, JSON.stringify(v)); } catch {} },
};

const FONTS = [
  { family: "NW Sacramento", name: "Sacramento", note: "like the photo" },
  { family: "NW Allura", name: "Allura" },
  { family: "NW Parisienne", name: "Parisienne" },
  { family: "NW Corinthia", name: "Corinthia" },
  { family: "NW Ephesis", name: "Ephesis" },
  { family: "NW Meow Script", name: "Meow Script" },
];
const THREADS = ["#c8102e", "#e1252f", "#f06292", "#7b2d8e", "#1f3a68", "#2e6b3a", "#c99a2e", "#1a1a1a"];

const state = {
  mode: "bookmark",
  machine: store.get("machine", DEFAULT_MACHINE),
  hoopId: store.get("hoop", null),
  view: null,          // { pattern, bytes, filename, fabricShapeBlock, hide, cache }
  views: {},           // last view per mode
  zoom: 1, pan: [0, 0], upto: null, showHoop: store.get("showHoop", true),
  bm: { name: store.get("bm.name", "ashley"), font: store.get("bm.font", FONTS[0].family), color: store.get("bm.color", RED), fabric: store.get("bm.fabric", "pink") },
  pic: { file: null, bitmap: null, key: 0, skip: [], colors: 4, size: 100, angle: 45, bg: true, req: 0, colorsInfo: [] },
};
if (!MACHINES[state.machine]) state.machine = DEFAULT_MACHINE;
const hoop = () => getHoop(state.machine, state.hoopId);

// ---------- preview ----------
const canvas = $("view");
function paint() {
  const v = state.view;
  $("empty").hidden = !!v;
  if (!v) { draw(canvas, null); return; }
  draw(canvas, v.pattern, {
    cache: v.cache, fabric: v.fabric, fabricShapeBlock: v.fabricShapeBlock, hide: v.hide, upto: state.upto ?? undefined,
    hoop: hoop(), showHoop: state.showHoop, zoom: state.zoom, pan: state.pan, showNeedle: state.upto != null,
  });
}
new ResizeObserver(() => paint()).observe(canvas);

function fmtMm(mm) { return `${mm.toFixed(0)} × `; }
function setView(v) {
  stopPlay();
  state.view = v; state.views[state.mode] = v; state.upto = null; $("progress").value = 1000;
  if (!v) { $("facts").innerHTML = ""; $("threads").innerHTML = ""; $("download").disabled = true; paint(); return; }
  v.cache = colorBlocks(v.pattern);
  const st = designStats(v.pattern), h = hoop();
  const fits = st.widthMm <= h.w - 2 * MARGIN && st.heightMm <= h.h - 2 * MARGIN;
  const inch = (mm) => (mm / 25.4).toFixed(1);
  const minutes = Math.max(1, Math.round(st.stitches / 550 + st.colorChanges * 0.5));
  $("facts").innerHTML = [
    `<span>${st.widthMm.toFixed(0)} × ${st.heightMm.toFixed(0)} mm · ${inch(st.widthMm)} × ${inch(st.heightMm)} in</span>`,
    `<span>${st.stitches.toLocaleString()} stitches</span>`,
    st.colorChanges ? `<span>${st.colorChanges} ${st.colorChanges === 1 ? "pause" : "pauses"}</span>` : "",
    `<span>≈ ${minutes} min</span>`,
    fits ? "" : `<span class="bad">Too big for the ${h.name}</span>`,
  ].join("");
  const seen = new Set();
  $("threads").innerHTML = v.cache.blocks.filter((b) => !(v.hide && v.hide.has(b.index)))
    .map((b) => {
      const t = nearestBrotherThread(b.color), label = v.threadLabel ? v.threadLabel(b) : `Brother ${t.name}`;
      const k = b.color + label; if (seen.has(k)) return ""; seen.add(k);
      return `<li><i style="background:${b.color}"></i><span>${label}<br><small>${b.color}</small></span></li>`;
    }).join("");
  $("download").disabled = !fits;
  $("download").textContent = fits ? `Download ${v.filename}` : "Too big for this hoop";
  paint();
}
function showError(msg) { const e = $("error"); e.textContent = msg; e.hidden = !msg; }
function busy(on, text = "Stitching…") { $("busy").hidden = !on; $("busy-text").textContent = text; }

// zoom & pan
$("zoom-in").onclick = () => { state.zoom = Math.min(12, state.zoom * 1.4); paint(); };
$("zoom-out").onclick = () => { state.zoom = Math.max(0.4, state.zoom / 1.4); paint(); };
$("zoom-fit").onclick = () => { state.zoom = 1; state.pan = [0, 0]; paint(); };
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const f = Math.exp(-e.deltaY * 0.0015), r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
  const nz = Math.min(12, Math.max(0.4, state.zoom * f)), k = nz / state.zoom;
  state.pan = [mx - (mx - state.pan[0]) * k, my - (my - state.pan[1]) * k]; state.zoom = nz; paint();
}, { passive: false });
const pointers = new Map();
canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); });
canvas.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()], d0 = Math.hypot(a[0] - b[0], a[1] - b[1]);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    const [c, d] = [...pointers.values()], d1 = Math.hypot(c[0] - d[0], c[1] - d[1]);
    if (d0 > 0) { state.zoom = Math.min(12, Math.max(0.4, state.zoom * (d1 / d0))); paint(); }
    return;
  }
  state.pan = [state.pan[0] + e.clientX - prev[0], state.pan[1] + e.clientY - prev[1]];
  pointers.set(e.pointerId, [e.clientX, e.clientY]); paint();
});
const up = (e) => pointers.delete(e.pointerId);
canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
canvas.addEventListener("dblclick", () => $("zoom-fit").click());

// sew-out playback
let playing = 0;
function stopPlay() { if (playing) cancelAnimationFrame(playing); playing = 0; $("play").textContent = "▶︎ Watch it sew"; }
$("play").onclick = () => {
  if (!state.view) return;
  if (playing) { stopPlay(); return; }
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
  if (!state.view) return; stopPlay();
  const v = +e.target.value; state.upto = v >= 1000 ? null : Math.round((v / 1000) * state.view.cache.total); paint();
};
$("show-hoop").checked = state.showHoop;
$("show-hoop").onchange = (e) => { state.showHoop = e.target.checked; store.set("showHoop", state.showHoop); paint(); };

$("download").onclick = () => {
  const v = state.view; if (!v) return;
  const url = URL.createObjectURL(new Blob([v.bytes], { type: "application/octet-stream" }));
  const a = document.createElement("a"); a.href = url; a.download = v.filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

// ---------- machine & hoop ----------
function fillMachines() {
  $("machine").innerHTML = Object.entries(MACHINES).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join("");
  $("machine").value = state.machine;
  const m = MACHINES[state.machine];
  if (!m.hoops[state.hoopId]) state.hoopId = m.defaultHoop;
  $("hoop").innerHTML = Object.entries(m.hoops).map(([k, h]) => `<option value="${k}">${h.name}</option>`).join("");
  $("hoop").value = state.hoopId;
  const h = hoop();
  $("pic-size").max = Math.floor(Math.max(h.w, h.h) - 2 * MARGIN - 2);
}
$("machine").onchange = (e) => { state.machine = e.target.value; state.hoopId = null; store.set("machine", state.machine); fillMachines(); refresh(); };
$("hoop").onchange = (e) => { state.hoopId = e.target.value; store.set("hoop", state.hoopId); fillMachines(); refresh(); };
function refresh() { if (state.mode === "bookmark") makeBookmark(); else if (state.mode === "picture") makePicture(); else if (state.view) setView(state.view); }

// ---------- tabs ----------
const MODES = ["bookmark", "picture", "open"];
function setMode(mode, push = true) {
  if (!MODES.includes(mode)) mode = "bookmark";
  state.mode = mode;
  for (const m of MODES) { $("tab-" + m).setAttribute("aria-selected", m === mode); $("panel-" + m).hidden = m !== mode; }
  if (push) history.replaceState(null, "", "#" + mode);
  showError("");
  $("empty").textContent = mode === "picture" ? "Choose a picture to see it as stitches." : mode === "open" ? "Open a PES, PEC or DST file to see it here." : "";
  state.zoom = 1; state.pan = [0, 0];
  if (mode === "bookmark" && !state.views.bookmark) makeBookmark();
  else setView(state.views[mode] || null);
}
for (const m of MODES) $("tab-" + m).onclick = () => setMode(m);
document.querySelector(".tabs").addEventListener("keydown", (e) => {
  const i = MODES.indexOf(state.mode);
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    const n = MODES[(i + (e.key === "ArrowRight" ? 1 : MODES.length - 1)) % MODES.length];
    setMode(n); $("tab-" + n).focus();
  }
});

// ---------- bookmark ----------
let bmTimer = 0, bmSeq = 0;
function bookmarkUI() {
  $("bm-name").value = state.bm.name;
  $("bm-fonts").innerHTML = FONTS.map((f) => `<button type="button" data-f="${f.family}" aria-pressed="${f.family === state.bm.font}">
    <span class="sample" style="font-family:'${f.family}'">${escapeHtml(stitchedName() || "ashley")}</span>
    <span class="fname">${f.name}${f.note ? " · " + f.note : ""}</span></button>`).join("");
  const custom = !THREADS.includes(state.bm.color);
  $("bm-colors").innerHTML = THREADS.map((c) => `<button type="button" data-c="${c}" style="background:${c}" aria-pressed="${c === state.bm.color}" aria-label="Brother ${nearestBrotherThread(c).name}" title="Brother ${nearestBrotherThread(c).name}"></button>`).join("")
    + `<span class="custom" style="width:40px;height:40px;border-radius:50%;display:inline-block;position:relative;box-shadow:0 0 0 ${custom ? "2.5px var(--ink)" : "1.5px var(--line)"}" title="Any colour"><input type="color" id="bm-custom" value="${state.bm.color}" aria-label="Any colour"></span>`
    + `<span class="swatch-name">Closest Brother thread: <b>${nearestBrotherThread(state.bm.color).name}</b></span>`;
  $("bm-fabrics").innerHTML = Object.entries(FABRICS).map(([k, f]) => `<button type="button" data-fab="${k}" aria-pressed="${k === state.bm.fabric}"><i style="background:${f.solid || `repeating-conic-gradient(${f.cross} 0 25%, ${f.base} 0 50%) 0 0/8px 8px`}"></i>${f.label}</button>`).join("");
  $("bm-steps").innerHTML = STEPS.map((s) => `<li><b>${s.title}</b><span>${s.you || s.machine}</span></li>`).join("");
}
// stitched exactly as typed
const stitchedName = () => state.bm.name.trim();
function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
$("bm-name").addEventListener("input", (e) => {
  state.bm.name = e.target.value; store.set("bm.name", state.bm.name);
  document.querySelectorAll("#bm-fonts .sample").forEach((s) => (s.textContent = stitchedName() || "ashley"));
  clearTimeout(bmTimer); bmTimer = setTimeout(makeBookmark, 350);
});
$("bm-fonts").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; state.bm.font = b.dataset.f; store.set("bm.font", b.dataset.f); bookmarkUI(); makeBookmark(); };
$("bm-colors").addEventListener("click", (e) => { const b = e.target.closest("button[data-c]"); if (!b) return; state.bm.color = b.dataset.c; store.set("bm.color", b.dataset.c); bookmarkUI(); makeBookmark(); });
$("bm-colors").addEventListener("change", (e) => { if (e.target.id !== "bm-custom") return; state.bm.color = e.target.value; store.set("bm.color", e.target.value); bookmarkUI(); makeBookmark(); });
$("bm-fabrics").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return; state.bm.fabric = b.dataset.fab; store.set("bm.fabric", b.dataset.fab); bookmarkUI();
  if (state.views.bookmark) { state.views.bookmark.fabric = state.bm.fabric; if (state.mode === "bookmark") paint(); }
};

async function makeBookmark() {
  const seq = ++bmSeq, name = stitchedName();
  showError("");
  if (!name) { setView(null); $("empty").textContent = "Type a name to see the bookmark."; return; }
  busy(true, "Lettering…");
  try {
    await document.fonts.load(`40px "${state.bm.font}"`);
    await new Promise((r) => setTimeout(r, 0));
    if (seq !== bmSeq) return;
    const d = buildBookmark({ name, family: state.bm.font, color: state.bm.color, hoop: hoop() });
    const pattern = d.pattern();
    if (seq !== bmSeq || state.mode !== "bookmark") { state.views.bookmark = null; return; }
    setView({ pattern, bytes: writePES(pattern), filename: `${state.bm.name.trim().replace(/[^\p{L}\p{N}_-]+/gu, "_")}_bookmark.pes`,
      fabricShapeBlock: 0, hide: new Set([0, 1, 3]), fabric: state.bm.fabric, threadLabel: () => `Brother ${nearestBrotherThread(state.bm.color).name} · whole bookmark` });
  } catch (err) { console.error(err); showError(err.message); }
  finally { if (seq === bmSeq) busy(false); }
}

// ---------- picture ----------
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
worker.onmessage = (e) => {
  const r = e.data;
  if (r.id !== state.pic.req) return;
  busy(false);
  if (!r.ok) { showError(r.error); return; }
  showError("");
  state.pic.colorsInfo = r.colors;
  paletteUI();
  const base = (state.pic.file?.name || "picture").replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_-]+/gu, "_");
  const v = { pattern: r.pattern, bytes: r.bytes, filename: `${base}.pes`, fabric: "linen",
    threadLabel: (b) => `Brother ${nearestBrotherThread(b.color).name}` };
  state.views.picture = v;
  if (state.mode === "picture") setView(v);
};
worker.onerror = (e) => { busy(false); showError("Something went wrong while stitching this picture. " + (e.message || "")); };

function paletteUI() {
  const cols = state.pic.colorsInfo.filter((c) => !c.background && c.area > 0);
  $("pic-palette").innerHTML = cols.map((c) => `<button type="button" data-id="${c.id}" aria-pressed="${!state.pic.skip.includes(c.id)}">
    <i style="background:${c.hex}"></i><span>Brother ${c.thread.name}<small>${c.hex}</small></span></button>`).join("");
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
bindRange("pic-size", "size", (v) => `${v} mm · ${(v / 25.4).toFixed(1)} in`);
bindRange("pic-angle", "angle", (v) => `${v}°`);
$("pic-bg").onchange = (e) => { state.pic.bg = e.target.checked; state.pic.skip = []; makePicture(); };

async function loadPicture(file) {
  if (!file || !file.type.startsWith("image/")) { showError("That doesn't look like a picture. Try a PNG or JPG."); return; }
  try {
    const bitmap = await createImageBitmap(file);
    Object.assign(state.pic, { file, bitmap, box: null, key: state.pic.key + 1, skip: [] });
    const thumb = $("pic-thumb"); thumb.src = URL.createObjectURL(file); thumb.hidden = false;
    $("pic-drop").querySelector(".drop-text").innerHTML = `<b>${escapeHtml(file.name)}</b> · choose another`;
    $("pic-settings").hidden = false;
    setMode("picture"); makePicture();
  } catch { showError("This picture couldn't be opened. Try saving it as a PNG or JPG."); }
}
// bounding box of everything that isn't the border colour (or transparent), so "size" means the design
function contentBox(bitmap) {
  const S = 256, k = Math.min(1, S / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k)), h = Math.max(1, Math.round(bitmap.height * k));
  const c = new OffscreenCanvas(w, h), ctx = c.getContext("2d", { willReadFrequently: true });
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
  const h = hoop(), sz = workingSize(box.sw, box.sh, p.size, h);
  const c = new OffscreenCanvas(sz.w, sz.h), ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(p.bitmap, box.sx, box.sy, box.sw, box.sh, 0, 0, sz.w, sz.h);
  const img = ctx.getImageData(0, 0, sz.w, sz.h);
  p.req++; busy(true, "Stitching your picture…");
  worker.postMessage({ id: p.req, img, opts: { colors: p.colors, removeBackground: p.bg, fillAngle: p.angle, skip: p.skip, hoop: h, imageKey: p.key } });
}
$("pic-file").onchange = (e) => loadPicture(e.target.files[0]);

// ---------- open a design ----------
function pesVersion(v) {
  const n = parseInt(v, 10);
  if (!v || Number.isNaN(n)) return "";
  return ` version ${n >= 10 ? n / 10 : n}`;   // "0060" -> 6, "0100" -> 10, "0001" -> 1
}
async function openDesign(file) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const d = readEmbroidery(bytes, file.name);
    const isPes = d.format === "pes";
    const out = isPes ? bytes : writePES(d);
    const st = designStats(d), h = hoop();
    const fits = st.widthMm <= h.w - 2 * MARGIN && st.heightMm <= h.h - 2 * MARGIN;
    const base = file.name.replace(/\.[^.]+$/, "");
    $("open-info").hidden = false;
    $("open-info").innerHTML = `<b>${escapeHtml(file.name)}</b>
      <span>${d.format.toUpperCase()}${pesVersion(d.version)} · ${st.stitches.toLocaleString()} stitches · ${d.threads.length || "no"} thread colours</span>
      ${fits ? `<span class="good">Fits the ${h.machineName} ${h.name}.</span>` : `<span class="warn">Too big for the ${h.name}: it's ${st.widthMm.toFixed(0)} × ${st.heightMm.toFixed(0)} mm.</span>`}
      ${isPes ? "" : `<span>You can download it as a PES file for your machine.</span>`}`;
    const v = { pattern: d, bytes: out, filename: `${base}.pes`, fabric: "linen",
      threadLabel: (b) => (/[a-z]{2}/i.test(b.name || "") ? escapeHtml(b.name) : `Brother ${nearestBrotherThread(b.color).name}${b.name ? " · " + escapeHtml(b.name) : ""}`) };
    state.views.open = v; setMode("open"); setView(v);
  } catch (err) { console.error(err); setMode("open"); showError(err.message || "This file couldn't be read."); }
}
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
bookmarkUI();
setMode((location.hash || "#bookmark").slice(1), false);
