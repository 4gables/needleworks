// Design tab UI: start from a card, edit pieces in a short list, drag them on the preview.
import { buildBookmark, hiddenBlocks } from "../core/bookmark.js";
import { turnPattern } from "../core/design.js";
import { APPLIQUE_FONTS, FONTS } from "../core/fonts.js";
import { hoop as getHoop } from "../core/machines.js";
import { nearestBrotherThread } from "../core/threads.js";
import { readEmbroidery } from "../core/formats.js";
import { draw } from "../render.js";
import { BORDERS, SHAPES, archTight, compose, fileBlocks, fittedSizes, followFrame, label, minSize, pieceBounds, smallText } from "./pieces.js";

const SCRIPT = "NW Great Vibes", PRINT = "NW Josefin Sans";
// exact Brother PEC thread colours, so the name on screen is the one the machine shows
const RED = "#ed171f", NAVY = "#0e1f7c", BLACK = "#000000";
const PINK = "#f993bc";
const COLORS = [RED, NAVY, "#00673e", "#770176", "#e8a900", "#f993bc", BLACK, "#f0f0f0"];

let nextId = 1;
const piece = (o) => ({ id: nextId++, x: 0, y: 0, color: NAVY, ...o });
const text = (o) => piece({ kind: "text", text: "Ashley", font: SCRIPT, size: 18, shape: "straight", radius: 30, ...o });
const mono = (o) => piece({ kind: "monogram", letters: "aMs", font: SCRIPT, size: 30, ...o });
const appl = (o) => piece({ kind: "letters", text: "AB", font: APPLIQUE_FONTS[0].family, size: 60, color: NAVY, ...o });
const frame = (o) => piece({ kind: "frame", shape: "circle", w: 80, h: 80, border: "satin", color: RED, ...o });

// `mode` cards open another part of the page (the bookmark has its own engine and controls) instead of pieces
export const STARTERS = [
  { id: "bookmark", name: "Name bookmark", note: "in the hoop, with a ribbon hole", mode: "bookmark" },
  { id: "monogram", name: "Monogram", note: "3 initials in a frame", make: () => [frame({ shape: "circle", w: 90, h: 90, border: "satin" }), mono({ size: 23 })] },
  { id: "ring", name: "Name in a circle", note: "lettering around a ring", make: () => [
    frame({ shape: "circle", w: 92, h: 92, border: "bold" }),
    text({ text: "HANDMADE", font: PRINT, size: 9, shape: "up", radius: 33, color: RED }),
    text({ text: "WITH LOVE", font: PRINT, size: 7, shape: "down", radius: 36, color: RED }),
    mono({ letters: "A", size: 30, y: 2 })] },
  { id: "oval", name: "Oval badge", note: "words arched round an oval", make: () => [
    frame({ shape: "oval", w: 120, h: 84, border: "satin" }),
    // curves just inside the border (what "Follow the frame" gives with the fonts loaded)
    text({ text: "HANDMADE", font: PRINT, size: 9, shape: "up", radius: 45, ry: 27, color: RED }),
    text({ text: "WITH LOVE", font: PRINT, size: 7, shape: "down", radius: 54, ry: 36, color: RED }),
    text({ size: 18 })] },
  { id: "framed", name: "Name in a frame", note: "a name inside a border", make: () => [frame({ shape: "oval", w: 110, h: 64, border: "satin" }), text({ size: 22 })] },
  { id: "quilt", name: "Quilt label", note: "who it's for, who made it", make: () => [
    frame({ shape: "square", w: 110, h: 70, border: "line", color: BLACK }),
    text({ text: "Made for", font: PRINT, size: 8, y: -20, color: BLACK }),
    text({ text: "Emma", size: 20, y: -3, color: RED }),
    text({ text: "by Ashley in 2026", font: PRINT, size: 8, y: 17, color: BLACK })],
    tip: "Stitch it on cotton backed with tear-away stabilizer, then turn the edges under and hand-sew it to the back of the quilt." },
  { id: "bib", name: "Baby bib", note: "a name over a little heart", make: () => [
    frame({ shape: "heart", w: 46, h: 42, border: "applique", y: 14, color: PINK }),
    text({ text: "Emma", size: 16, shape: "up", radius: 30, y: 14, color: NAVY })],
    tip: "Hoop tear-away stabilizer and stick the bib on it (or float it with spray adhesive). On terry, lay a water-soluble topper over it so the stitches don't sink." },
  { id: "towel", name: "Towel name", note: "a big name that stands up to terry", make: () => [text({ text: "Ashley", size: 32, style: "satin" })],
    tip: "Lay a water-soluble topper over the towel so the loops don't swallow the stitches, with tear-away stabilizer underneath. Tear the topper off afterwards; a damp cloth melts the rest." },
  { id: "ornament", name: "Ornament", note: "two-sided, sewn in the hoop", make: () => [
    frame({ shape: "circle", w: 80, h: 80, border: "ith", color: RED }),
    text({ text: "Emma", size: 20, y: -4 }),
    text({ text: "2026", font: PRINT, size: 8, y: 14 })],
    tip: "Made in the hoop, front and back. Have ready: tear-away stabilizer, front and back fabric cut 1 in bigger than the circle, tape, and a 6 in ribbon for hanging. Smaller (Fit to hoop or the size slider) makes a keychain." },
  { id: "applique", name: "Appliqué", note: "a fabric shape with a name", make: () => [
    frame({ shape: "heart", w: 84, h: 76, border: "applique", y: -4 }), text({ size: 18, y: -6, color: NAVY })] },
  { id: "initials", name: "Appliqué letters", note: "fabric letters with satin edges", make: () => [appl({ text: "AB", size: 60 })] },
  { id: "patch", name: "Patch", note: "a filled badge with an edge", make: () => [
    frame({ shape: "circle", w: 76, h: 76, border: "patch", fill: NAVY, color: RED }),
    mono({ letters: "JD", size: 26, font: PRINT, color: "#f0f0f0" })] },
  { id: "words", name: "Just lettering", note: "a word or name on its own", make: () => [text({ size: 24 })] },
];

// api: { hoop(), setView(v), showError(msg), busy(on, text), safeName(s, fb), escapeHtml(s), store }
export function initStudio(api) {
  const $ = (id) => document.getElementById(id);
  const saved = api.store.get("studio", null);
  let pieces = saved?.pieces?.length ? saved.pieces : STARTERS.find((s) => s.make).make();
  nextId = Math.max(0, ...pieces.map((p) => p.id)) + 1;
  let sel = saved?.sel ?? pieces[pieces.length - 1]?.id, seq = 0, timer = 0;

  const save = () => api.store.set("studio", { pieces, sel });
  // undo: a snapshot before each change (a burst of slider moves counts as one)
  const history = [];
  let quiet = 0;
  function remember(burst = false) {
    if (burst && Date.now() - quiet < 800) { quiet = Date.now(); return; }
    quiet = burst ? Date.now() : 0;
    history.push(JSON.stringify({ pieces, sel })); if (history.length > 60) history.shift();
    $("st-undo").disabled = false;
  }
  function undo() {
    const h = history.pop(); if (!h) return;
    ({ pieces, sel } = JSON.parse(h)); quiet = 0;
    $("st-undo").disabled = !history.length; save(); ui(); make();
  }
  const current = () => pieces.find((p) => p.id === sel);

  function cards() {
    $("st-cards").innerHTML = STARTERS.map((s) => `<button type="button" data-start="${s.id}" title="${s.note}"><canvas aria-hidden="true"></canvas><b>${s.name}</b><small>${s.note}</small></button>`).join("");
  }
  // a small stitched preview of each starter (drawn once the tab is on screen and has a size)
  let thumbed = false;
  async function thumbs() {
    if (thumbed || !$("st-cards").offsetWidth) return;
    thumbed = true;
    const fonts = [...new Set(STARTERS.flatMap((s) => (s.make ? s.make() : [])).filter((p) => p.font).map((p) => p.font).concat(SCRIPT))];
    await Promise.all(fonts.map((f) => document.fonts.load(`40px "${f}"`)));
    for (const s of STARTERS) {
      const c = $("st-cards").querySelector(`[data-start="${s.id}"] canvas`);
      try {
        if (s.mode === "bookmark") {   // lying down, like the bookmark tab shows it
          const d = buildBookmark({ name: "Ashley", family: SCRIPT, hoop: getHoop() });
          draw(c, turnPattern(d.pattern(), false), { pad: 4, fabricShapeBlock: 0, fabric: "pink", hide: hiddenBlocks(false) });
          continue;
        }
        const { design, steps } = compose(s.make(), { w: 1000, h: 1000, name: "" });
        const fab = steps.findIndex((st) => st.fabric);
        draw(c, design.pattern(), { pad: 4, fabricShapeBlock: fab >= 0 ? fab : undefined, fabric: "pink", hide: new Set(steps.flatMap((st, i) => (st.under ? [i] : []))) });
      } catch { c.remove(); }
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  function list() {
    $("st-pieces").innerHTML = pieces.map((p, i) => `<li data-id="${p.id}" aria-selected="${p.id === sel}">
      <button type="button" class="pick" data-id="${p.id}"><i style="background:${p.color}"></i>${api.escapeHtml(label(p))}</button>
      <span class="ops">
        <button type="button" data-op="up" data-id="${p.id}" aria-label="Sew earlier" ${i ? "" : "disabled"}>↑</button>
        <button type="button" data-op="down" data-id="${p.id}" aria-label="Sew later" ${i < pieces.length - 1 ? "" : "disabled"}>↓</button>
        <button type="button" data-op="dup" data-id="${p.id}" aria-label="Duplicate" title="Duplicate">⧉</button>
        <button type="button" data-op="del" data-id="${p.id}" aria-label="Remove">✕</button>
      </span></li>`).join("");
  }
  const swatches = (p, k = "color") => COLORS.map((c) => `<button type="button" data-${k}="${c}" style="background:${c}" aria-pressed="${c === p[k]}" title="Brother ${nearestBrotherThread(c).name}"></button>`).join("")
    + `<span class="custom"><input type="color" data-${k}-any value="${p[k]}" aria-label="Any colour"></span>`;
  const fontSelect = (p) => `<select data-k="font">${FONTS.map((f) => `<option value="${f.family}" ${f.family === p.font ? "selected" : ""}>${f.name}${f.print ? " (print)" : ""}</option>`).join("")}</select>`;
  const range = (k, lab, min, max, v, unit = "mm", step = 1) => `<label class="range"><span>${lab}</span><input type="range" data-k="${k}" data-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${v} ${unit}</output></label>`;
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
      h += seg("style", { auto: "Stitch: automatic", satin: "Satin", line: "Fine line" }, p.style || "auto");
      if (p.shape !== "straight") {
        h += range("radius", "Curve width", 15, 80, p.radius);
        h += range("ry", "Curve height", 15, 80, p.ry ?? p.radius);
        if (followFrame(p, pieces)) h += `<button type="button" class="link" data-follow>Follow the frame</button>`;
      }
    } else if (p.kind === "monogram") {
      h += `<label class="field"><span>Initials</span><input type="text" data-k="letters" value="${api.escapeHtml(p.letters)}" maxlength="3" autocomplete="off" spellcheck="false"></label>`;
      h += `<p class="hint">Traditional order: first, LAST, middle. The middle letter is stitched biggest.</p>`;
      h += `<label class="field"><span>Font</span>${fontSelect(p)}</label>`;
      h += range("size", "Height", 15, 90, p.size);
      h += seg("style", { auto: "Stitch: automatic", satin: "Satin", line: "Fine line" }, p.style || "auto");
    } else if (p.kind === "letters") {
      h += `<label class="field"><span>Letters</span><input type="text" data-k="text" value="${api.escapeHtml(p.text)}" maxlength="12" autocomplete="off" spellcheck="false"></label>`;
      h += `<label class="field"><span>Font</span><select data-k="font">${APPLIQUE_FONTS.map((f) => `<option value="${f.family}" ${f.family === p.font ? "selected" : ""}>${f.name} (${f.note})</option>`).join("")}</select></label>`;
      h += range("size", "Height", 20, 120, p.size);
      h += `<p class="hint">Cut from fabric: the machine sews an outline, pauses for you to lay fabric on and trim it, then satins the edges. Letters 30 mm or taller cut and sew most easily.</p>`;
    } else if (p.kind === "frame") {
      h += seg("shape", Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, s.name])), p.shape);
      h += range("w", p.shape === "circle" ? "Size" : "Width", 20, 170, p.w);
      if (p.shape !== "circle") h += range("h", "Height", 20, 170, p.h);
      h += seg("border", BORDERS, p.border);
      if (p.border === "patch") { p.fill ||= NAVY; h += `<div class="field"><span>Fill thread</span><div class="swatches">${swatches(p, "fill")}</div><p class="hint">Brother ${nearestBrotherThread(p.fill).name}. The edge uses the thread below.</p></div>`; }
      if (p.border === "ith") h += `<p class="hint">Two-sided, made in the hoop: an appliqué front, then the pieces below it in the list, then backing fabric under the hoop and a satin edge through everything. The steps are under “How to stitch it”.</p>`;
      if (p.border === "applique") h += `<p class="hint">Sews an outline, pauses for you to lay fabric on and trim it, then covers the edge in satin. The steps are under “How to stitch it”.</p>`;
    } else {
      h += `<p class="hint">${api.escapeHtml(p.name)}: its stitches are used exactly as they are, so it can be moved and turned but not resized.</p>`;
    }
    if (p.kind === "text") h += `<p class="hint" data-fit hidden></p>`;
    if (p.kind === "text" || p.kind === "monogram") h += `<p class="hint warn" data-warn hidden></p>`;
    h += range("rot", "Turn", -180, 180, p.rot || 0, "°", 5);
    if (p.kind !== "file") h += `<div class="field"><span>Thread</span><div class="swatches">${swatches(p)}</div><p class="hint">Brother ${nearestBrotherThread(p.color).name}</p></div>`;
    $("st-edit").innerHTML = h;
    warn();
  }
  function ui() { list(); editor(); }
  // too-small lettering, said plainly (updated in place so typing keeps focus)
  async function warn() {
    const w = $("st-edit").querySelector("[data-warn]"), p = current(); if (!w || !p) return;
    await document.fonts.load(`40px "${p.font}"`);
    const fit = $("st-edit").querySelector("[data-fit]"), fs = fittedSizes(pieces).get(p.id);
    if (fit) { fit.hidden = !fs; fit.textContent = fs ? `Shrunk to ${fs} mm so it fits inside the frame.` : ""; }
    const m = minSize(fs ? { ...p, size: fs } : p);
    w.hidden = !m && !archTight(p);
    w.textContent = m ? `These letters are too small to stitch cleanly. Make the height ${m} mm or more.`
      : archTight(p) ? "The curve is too tight for letters this tall: they'd bunch up. Make the curve bigger or the letters smaller." : "";
  }

  function change(fn, now = false) {
    const p = current(); if (!p) return;
    remember(!now); fn(p); save(); list();
    clearTimeout(warnTimer); warnTimer = setTimeout(warn, 300);
    clearTimeout(timer); timer = setTimeout(make, now ? 0 : 160);
  }

  async function make() {
    thumbs();
    const s = ++seq;
    api.showError("");
    try {
      const fonts = [...new Set(pieces.filter((p) => p.font).map((p) => p.font))];
      await Promise.all(fonts.map((f) => document.fonts.load(`40px "${f}"`)));
      if (s !== seq) return;
      const { design, steps, after } = compose(pieces, api.hoop());
      if (s !== seq) return;
      const fit = fittedSizes(pieces);
      stepsUI(steps, after, pieces.some((p) => smallText(fit.has(p.id) ? { ...p, size: fit.get(p.id) } : p)));
      // preview: appliqué fabric under its satin, placement and tack-down lines hidden beneath it
      const fabricBlock = steps.findIndex((st) => st.fabric);
      api.setView(design.pattern(), `${api.safeName(firstWords(), "design")}.pes`, {
        fabricShapeBlock: fabricBlock >= 0 ? fabricBlock : undefined,
        hide: new Set(steps.flatMap((st, i) => (st.under ? [i] : []))), fabric: fabricBlock >= 0 ? "pink" : "linen", steps: steps.length });
    } catch (err) { if (s === seq) { console.error(err); api.showError(err.message); } }
  }
  // appliqué tips: shown the first time a design has fabric to lay on, then on request
  function applGuide(steps) {
    const has = steps.some((st) => st.fabric);
    $("st-appl-open").hidden = !has;
    if (!has) $("st-appl").hidden = true;
    else if (!api.store.get("studio.applSeen", false)) $("st-appl").hidden = false;
  }
  $("st-appl-close").onclick = () => { $("st-appl").hidden = true; api.store.set("studio.applSeen", true); };
  $("st-appl-open").onclick = () => { $("st-appl").hidden = false; $("st-appl").scrollIntoView({ block: "nearest", behavior: "smooth" }); };
  function stepsUI(steps, after = [], small = false) {
    applGuide(steps);
    const pauses = steps.length - 1;
    $("st-steps-count").textContent = `· ${steps.length} ${steps.length === 1 ? "step" : "steps"}, ${pauses} ${pauses === 1 ? "pause" : "pauses"}`;
    // each step is a button: the preview shows the design as it is after that step, what's still to come faint
    $("st-steps").innerHTML = steps.map((st, i) => `<li><button type="button" data-step="${i}" aria-pressed="${api.step() === i}">
      <b><span class="n">${i + 1}</span><i style="background:${st.color}"></i>Brother ${nearestBrotherThread(st.color).name}</b>
      ${st.you ? `<span class="you">${api.escapeHtml(st.you)}</span>` : ""}<span>${api.escapeHtml(st.sews.join(" "))}</span>
      ${st.early ? `<small>Sewn early, with the other ${api.escapeHtml(nearestBrotherThread(st.color).name)} parts, to save a thread change.</small>` : ""}</button></li>`).join("")
      + (small ? `<li class="after"><b>Small letters</b><span>They come out crisper with 60 wt thread and a 65/9 or 70/10 needle, and with the machine slowed down.</span></li>` : "")
      + (after.length ? `<li class="after"><b>When it's done</b><span>${api.escapeHtml(after.join(" "))}</span></li>` : "");
  }
  $("st-steps").onclick = (e) => { const b = e.target.closest("[data-step]"); if (b) api.showStep(api.step() === +b.dataset.step ? null : +b.dataset.step); };
  document.addEventListener("nw:step", (e) => {
    for (const b of $("st-steps").querySelectorAll("[data-step]")) b.setAttribute("aria-pressed", +b.dataset.step === e.detail);
    $("st-steps-all").hidden = e.detail == null;
  });
  $("st-steps-all").onclick = () => api.showStep(null);
  // closing the steps shows the whole design again
  $("st-steps").closest("details").addEventListener("toggle", (e) => { if (!e.target.open) api.showStep(null); });
  const firstWords = () => (pieces.find((p) => p.kind === "text" || p.kind === "letters")?.text || pieces.find((p) => p.kind === "monogram")?.letters || "design");

  // ---------- events ----------
  $("st-cards").onclick = (e) => {
    const b = e.target.closest("[data-start]"); if (!b) return;
    const s = STARTERS.find((x) => x.id === b.dataset.start);
    if (s.mode) { api.setMode(s.mode); return; }
    remember(); pieces = s.make(); sel = pieces[pieces.length - 1].id;
    $("st-tip").hidden = !s.tip; $("st-tip").textContent = s.tip || "";
    save(); ui(); make();
  };
  $("st-add").onclick = (e) => {
    const b = e.target.closest("[data-add]"); if (!b) return;
    if (b.dataset.add === "file") { $("st-file").click(); return; }
    remember();
    const p = b.dataset.add === "text" ? text({ y: 20 }) : b.dataset.add === "monogram" ? mono() : b.dataset.add === "letters" ? appl() : frame({ border: "line" });
    pieces.push(p); sel = p.id; save(); ui(); make();
  };
  $("st-pieces").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const id = +b.dataset.id, i = pieces.findIndex((p) => p.id === id);
    if (b.dataset.op) remember();
    if (b.dataset.op === "del") { pieces.splice(i, 1); if (sel === id) sel = pieces[Math.max(0, i - 1)]?.id; }
    else if (b.dataset.op === "dup") {
      // the copy goes just below the original
      const bb = pieceBounds(pieces[i]), c = { ...structuredClone(pieces[i]), id: nextId++, y: pieces[i].y + (bb ? bb[3] - bb[1] + 4 : 10) };
      pieces.splice(i + 1, 0, c); sel = c.id;
    }
    else if (b.dataset.op === "up" && i > 0) [pieces[i - 1], pieces[i]] = [pieces[i], pieces[i - 1]];
    else if (b.dataset.op === "down" && i < pieces.length - 1) [pieces[i + 1], pieces[i]] = [pieces[i], pieces[i + 1]];
    else sel = id;
    save(); ui(); if (b.dataset.op) make();
  };
  const edit = $("st-edit");
  edit.addEventListener("input", (e) => {
    const t = e.target, k = t.dataset.k;
    if (t.matches("[data-color-any]")) { change((p) => (p.color = t.value)); return; }
    if (t.matches("[data-fill-any]")) { change((p) => (p.fill = t.value)); return; }
    if (!k) return;
    if (t.type === "range") t.nextElementSibling.textContent = `${t.value} ${t.dataset.unit}`;
    change((p) => (p[k] = t.type === "range" ? +t.value : t.value));
    if (["size", "text", "letters", "font", "radius", "ry"].includes(k)) { clearTimeout(warnTimer); warnTimer = setTimeout(warn, 300); }
  });
  let warnTimer = 0;
  edit.addEventListener("change", (e) => { if (e.target.dataset.k === "font" || e.target.matches("[data-color-any], [data-fill-any]")) editor(); });
  edit.addEventListener("click", (e) => {
    const c = e.target.closest("[data-color]");
    if (c) { change((p) => (p.color = c.dataset.color), true); editor(); return; }
    const f = e.target.closest("[data-fill]");
    if (f) { change((p) => (p.fill = f.dataset.fill), true); editor(); return; }
    if (e.target.closest("[data-follow]")) { change((p) => Object.assign(p, followFrame(p, pieces)), true); editor(); return; }
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
    remember(); drag = { p, from: mm, x: p.x, y: p.y };
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
    remember();
    for (const p of pieces) {
      p.x *= f; p.y *= f;
      if (p.kind !== "file") for (const k of ["size", "radius", "ry", "w", "h"]) if (p[k] != null) p[k] = Math.round(p[k] * f * 2) / 2;
    }
    save(); ui(); make();
  };

  $("st-undo").onclick = undo;
  // a design file to keep and change later (the pieces, not the stitches)
  $("st-save").onclick = () => {
    const blob = new Blob([JSON.stringify({ needleworks: 1, pieces }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `${api.safeName(firstWords(), "design")}.needleworks.json`; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $("st-load").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || data.needleworks !== 1 || !Array.isArray(data.pieces)) throw new Error("it isn't a design saved from this page");
      const kinds = new Set(["text", "monogram", "frame", "file", "letters"]);
      const loaded = data.pieces.filter((p) => p && kinds.has(p.kind) && Number.isFinite(p.x) && Number.isFinite(p.y));
      if (!loaded.length) throw new Error("it has no pieces");
      remember(); nextId = 1; pieces = loaded.map((p) => ({ ...p, id: nextId++ })); sel = pieces[pieces.length - 1].id;
      save(); ui(); make();
    } catch (err) { api.showError("That design couldn't be opened: " + err.message); }
  };
  document.addEventListener("keydown", (e) => {
    if (document.body.dataset.mode !== "design" || e.target.matches("input[type=text]")) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (arrows && !e.target.matches("input, select")) { e.preventDefault(); nudge(arrows[0] * (e.shiftKey ? 5 : 1), arrows[1] * (e.shiftKey ? 5 : 1)); }
  });
  // add an opened design (PES/PEC/DST) as a piece, to combine a motif with lettering
  $("st-file").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const d = readEmbroidery(new Uint8Array(await f.arrayBuffer()), f.name);
      remember();
      const p = piece({ kind: "file", name: f.name.replace(/\.[^.]+$/, ""), blocks: fileBlocks(d), color: d.threads[0]?.color || BLACK });
      pieces.push(p); sel = p.id; save(); ui(); make();
    } catch (err) { api.showError("That file couldn't be added: " + err.message); }
  };

  $("st-guide").hidden = !!api.store.get("studio.guideSeen", false);
  $("st-guide-close").onclick = () => { $("st-guide").hidden = true; api.store.set("studio.guideSeen", true); };

  cards(); ui();
  return { make, start, move, end, nudge };
}
