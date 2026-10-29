// Design tab UI: start from a card, edit pieces in a short list, drag them on the preview.
import { FONTS } from "../core/fonts.js";
import { nearestBrotherThread } from "../core/threads.js";
import { BORDERS, SHAPES, compose, label, pieceBounds } from "./pieces.js";

const SCRIPT = "NW Great Vibes", PRINT = "NW Josefin Sans";
// exact Brother PEC thread colours, so the name on screen is the one the machine shows
const RED = "#ed171f", NAVY = "#0e1f7c", BLACK = "#000000";
const COLORS = [RED, NAVY, "#00673e", "#770176", "#e8a900", "#f993bc", BLACK, "#f0f0f0"];

let nextId = 1;
const piece = (o) => ({ id: nextId++, x: 0, y: 0, color: NAVY, ...o });
const text = (o) => piece({ kind: "text", text: "Ashley", font: SCRIPT, size: 18, shape: "straight", radius: 30, ...o });
const mono = (o) => piece({ kind: "monogram", letters: "aMs", font: SCRIPT, size: 30, ...o });
const frame = (o) => piece({ kind: "frame", shape: "circle", w: 80, h: 80, border: "satin", color: RED, ...o });

export const STARTERS = [
  { id: "monogram", name: "Monogram", note: "3 initials in a frame", make: () => [frame({ shape: "circle", w: 90, h: 90, border: "satin" }), mono({ size: 23 })] },
  { id: "ring", name: "Name in a circle", note: "lettering around a ring", make: () => [
    frame({ shape: "circle", w: 92, h: 92, border: "bold" }),
    text({ text: "HANDMADE", font: PRINT, size: 9, shape: "up", radius: 33, color: RED }),
    text({ text: "WITH LOVE", font: PRINT, size: 7, shape: "down", radius: 36, color: RED }),
    mono({ letters: "A", size: 30, y: 2 })] },
  { id: "framed", name: "Name in a frame", note: "a name inside a border", make: () => [frame({ shape: "oval", w: 110, h: 64, border: "satin" }), text({ size: 22 })] },
  { id: "label", name: "Label", note: "two lines for a quilt or gift", make: () => [
    frame({ shape: "square", w: 100, h: 56, border: "line", color: BLACK }),
    text({ text: "Made by", font: PRINT, size: 7, y: -13, color: BLACK }),
    text({ text: "Ashley", size: 20, y: 6, color: RED })] },
  { id: "words", name: "Just lettering", note: "a word or name on its own", make: () => [text({ size: 24 })] },
];

// api: { hoop(), setView(v), showError(msg), busy(on, text), safeName(s, fb), escapeHtml(s), store }
export function initStudio(api) {
  const $ = (id) => document.getElementById(id);
  const saved = api.store.get("studio", null);
  let pieces = saved?.pieces?.length ? saved.pieces : STARTERS[0].make();
  nextId = Math.max(0, ...pieces.map((p) => p.id)) + 1;
  let sel = saved?.sel ?? pieces[pieces.length - 1]?.id, seq = 0, timer = 0;

  const save = () => api.store.set("studio", { pieces, sel });
  const current = () => pieces.find((p) => p.id === sel);

  function cards() {
    $("st-cards").innerHTML = STARTERS.map((s) => `<button type="button" data-start="${s.id}"><b>${s.name}</b><small>${s.note}</small></button>`).join("");
  }
  function list() {
    $("st-pieces").innerHTML = pieces.map((p, i) => `<li data-id="${p.id}" aria-selected="${p.id === sel}">
      <button type="button" class="pick" data-id="${p.id}"><i style="background:${p.color}"></i>${api.escapeHtml(label(p))}</button>
      <span class="ops">
        <button type="button" data-op="up" data-id="${p.id}" aria-label="Sew earlier" ${i ? "" : "disabled"}>↑</button>
        <button type="button" data-op="down" data-id="${p.id}" aria-label="Sew later" ${i < pieces.length - 1 ? "" : "disabled"}>↓</button>
        <button type="button" data-op="del" data-id="${p.id}" aria-label="Remove">✕</button>
      </span></li>`).join("");
  }
  const swatches = (p) => COLORS.map((c) => `<button type="button" data-color="${c}" style="background:${c}" aria-pressed="${c === p.color}" title="Brother ${nearestBrotherThread(c).name}"></button>`).join("")
    + `<span class="custom"><input type="color" data-color-any value="${p.color}" aria-label="Any colour"></span>`;
  const fontSelect = (p) => `<select data-k="font">${FONTS.map((f) => `<option value="${f.family}" ${f.family === p.font ? "selected" : ""}>${f.name}${f.print ? " (print)" : ""}</option>`).join("")}</select>`;
  const range = (k, lab, min, max, v, unit = "mm") => `<label class="range"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" value="${v}"><output>${v} ${unit}</output></label>`;
  const seg = (k, opts, v) => `<div class="seg" data-seg="${k}">${Object.entries(opts).map(([key, name]) => `<button type="button" data-v="${key}" aria-pressed="${key === v}">${name}</button>`).join("")}</div>`;

  function editor() {
    const p = current();
    if (!p) { $("st-edit").innerHTML = `<p class="hint">Pick a piece above, or add one.</p>`; return; }
    let h = "";
    if (p.kind === "text") {
      h += `<label class="field"><span>Words</span><input type="text" data-k="text" value="${api.escapeHtml(p.text)}" maxlength="30" autocomplete="off" spellcheck="false"></label>`;
      h += `<label class="field"><span>Font</span>${fontSelect(p)}</label>`;
      h += range("size", "Height", 5, 60, p.size);
      h += seg("shape", { straight: "Straight", up: "Arch up", down: "Arch down" }, p.shape);
      if (p.shape !== "straight") h += range("radius", "Curve size", 15, 80, p.radius);
    } else if (p.kind === "monogram") {
      h += `<label class="field"><span>Initials</span><input type="text" data-k="letters" value="${api.escapeHtml(p.letters)}" maxlength="3" autocomplete="off" spellcheck="false"></label>`;
      h += `<p class="hint">Traditional order: first, LAST, middle. The middle letter is stitched biggest.</p>`;
      h += `<label class="field"><span>Font</span>${fontSelect(p)}</label>`;
      h += range("size", "Height", 15, 90, p.size);
    } else {
      h += seg("shape", Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, s.name])), p.shape);
      h += range("w", p.shape === "circle" ? "Size" : "Width", 20, 170, p.w);
      if (p.shape !== "circle") h += range("h", "Height", 20, 170, p.h);
      h += seg("border", BORDERS, p.border);
    }
    h += `<div class="field"><span>Thread</span><div class="swatches">${swatches(p)}</div><p class="hint">Brother ${nearestBrotherThread(p.color).name}</p></div>`;
    $("st-edit").innerHTML = h;
  }
  function ui() { list(); editor(); }

  function change(fn, now = false) {
    const p = current(); if (!p) return;
    fn(p); save(); list();
    clearTimeout(timer); timer = setTimeout(make, now ? 0 : 160);
  }

  async function make() {
    const s = ++seq;
    api.showError("");
    try {
      const fonts = [...new Set(pieces.filter((p) => p.font).map((p) => p.font))];
      await Promise.all(fonts.map((f) => document.fonts.load(`40px "${f}"`)));
      if (s !== seq) return;
      const pattern = compose(pieces, api.hoop()).pattern();
      if (s !== seq) return;
      api.setView(pattern, `${api.safeName(firstWords(), "design")}.pes`);
    } catch (err) { if (s === seq) { console.error(err); api.showError(err.message); } }
  }
  const firstWords = () => (pieces.find((p) => p.kind === "text")?.text || pieces.find((p) => p.kind === "monogram")?.letters || "design");

  // ---------- events ----------
  $("st-cards").onclick = (e) => {
    const b = e.target.closest("[data-start]"); if (!b) return;
    pieces = STARTERS.find((s) => s.id === b.dataset.start).make(); sel = pieces[pieces.length - 1].id;
    save(); ui(); make();
  };
  $("st-add").onclick = (e) => {
    const b = e.target.closest("[data-add]"); if (!b) return;
    const p = b.dataset.add === "text" ? text({ y: 20 }) : b.dataset.add === "monogram" ? mono() : frame({ border: "line" });
    pieces.push(p); sel = p.id; save(); ui(); make();
  };
  $("st-pieces").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const id = +b.dataset.id, i = pieces.findIndex((p) => p.id === id);
    if (b.dataset.op === "del") { pieces.splice(i, 1); if (sel === id) sel = pieces[Math.max(0, i - 1)]?.id; }
    else if (b.dataset.op === "up" && i > 0) [pieces[i - 1], pieces[i]] = [pieces[i], pieces[i - 1]];
    else if (b.dataset.op === "down" && i < pieces.length - 1) [pieces[i + 1], pieces[i]] = [pieces[i], pieces[i + 1]];
    else sel = id;
    save(); ui(); if (b.dataset.op) make();
  };
  const edit = $("st-edit");
  edit.addEventListener("input", (e) => {
    const t = e.target, k = t.dataset.k;
    if (t.matches("[data-color-any]")) { change((p) => (p.color = t.value)); return; }
    if (!k) return;
    if (t.type === "range") t.nextElementSibling.textContent = `${t.value} mm`;
    change((p) => (p[k] = t.type === "range" ? +t.value : t.value));
  });
  edit.addEventListener("change", (e) => { if (e.target.dataset.k === "font" || e.target.matches("[data-color-any]")) editor(); });
  edit.addEventListener("click", (e) => {
    const c = e.target.closest("[data-color]");
    if (c) { change((p) => (p.color = c.dataset.color), true); editor(); return; }
    const s = e.target.closest("[data-seg] button");
    if (s) { change((p) => (p[s.closest("[data-seg]").dataset.seg] = s.dataset.v), true); editor(); }
  });

  // drag a piece on the preview (mm in the hoop; the machine centres the whole design)
  let drag = null;
  const hit = ([x, y]) => {
    for (const id of [sel, ...pieces.map((p) => p.id).reverse()]) {
      const p = pieces.find((q) => q.id === id), b = p && pieceBounds(p);
      if (b && x >= b[0] - 2 && x <= b[2] + 2 && y >= b[1] - 2 && y <= b[3] + 2) return p;
    }
    return null;
  };
  function start(mm) {
    const p = hit(mm); if (!p) return false;
    if (sel !== p.id) { sel = p.id; ui(); }
    drag = { p, from: mm, x: p.x, y: p.y };
    return true;
  }
  function move(mm) {
    if (!drag) return;
    drag.p.x = Math.round((drag.x + mm[0] - drag.from[0]) * 2) / 2; drag.p.y = Math.round((drag.y + mm[1] - drag.from[1]) * 2) / 2;
    clearTimeout(timer); timer = setTimeout(make, 40);
  }
  function end() { if (drag) { drag = null; save(); } }
  function nudge(dx, dy) { change((p) => { p.x += dx; p.y += dy; }); }
  function center() { change((p) => { p.x = 0; p.y = 0; }, true); }
  $("st-center").onclick = center;
  // shrink (or grow) everything together so the whole design fills the hoop, less a little room
  $("st-fit").onclick = () => {
    const bs = pieces.map(pieceBounds).filter(Boolean);
    if (!bs.length) return;
    const w = Math.max(...bs.map((b) => b[2])) - Math.min(...bs.map((b) => b[0])), h = Math.max(...bs.map((b) => b[3])) - Math.min(...bs.map((b) => b[1]));
    const hp = api.hoop(), f = Math.min((hp.w - 10) / w, (hp.h - 10) / h);
    for (const p of pieces) {
      p.x *= f; p.y *= f;
      for (const k of ["size", "radius", "w", "h"]) if (p[k] != null) p[k] = Math.round(p[k] * f * 2) / 2;
    }
    save(); ui(); make();
  };

  cards(); ui();
  return { make, start, move, end, nudge };
}
