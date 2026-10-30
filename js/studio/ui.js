// Design tab UI: start from a card, edit pieces in a short list, drag them on the preview.
import { buildBookmark, hiddenBlocks } from "../core/bookmark.js";
import { turnPattern } from "../core/design.js";
import { APPLIQUE_FONTS, FONTS } from "../core/fonts.js";
import { hoop as getHoop } from "../core/machines.js";
import { nearestBrotherThread } from "../core/threads.js";
import { readEmbroidery } from "../core/formats.js";
import { FILL_PATTERNS } from "../core/digitize.js";
import { draw } from "../render.js";
import { QUILTS } from "./quilt.js";
import { MOTIFS } from "./motifs.js";
import { BORDERS, FABRICS, THREADS, SHAPES, TEXT_SHAPES, splitPieces, archRoom, archTight, touching, towelMin, fineLine, compose, fileBlocks, fittedSizes, followFrame, label, minSize, pieceBounds, previewLook, smallText } from "./pieces.js";

const SCRIPT = "NW Great Vibes", PRINT = "NW Josefin Sans";
// exact Brother PEC thread colours, so the name on screen is the one the machine shows
const RED = "#ed171f", NAVY = "#0e1f7c", BLACK = "#000000";
const PINK = "#f993bc";
export const TURNED = "The hoop is turned: the machine shows this design on its side. Hoop the fabric a quarter turn round, with the top of the design toward the right of the hoop (as the sew sheet shows).";
const SMALL_TIP = "Small letters come out crisper with 60 wt thread and a 65/9 or 70/10 needle, and with the machine slowed down.";
const COLORS = [RED, NAVY, "#00673e", "#770176", "#e8a900", "#f993bc", BLACK, "#f0f0f0"];

let nextId = 1;
const piece = (o) => ({ id: nextId++, x: 0, y: 0, color: NAVY, ...o });
const text = (o) => piece({ kind: "text", text: "Emma", font: SCRIPT, size: 18, shape: "straight", radius: 30, ...o });
const mono = (o) => piece({ kind: "monogram", letters: "aMs", font: SCRIPT, size: 30, ...o });
const appl = (o) => piece({ kind: "letters", text: "AB", font: APPLIQUE_FONTS[0].family, size: 60, color: NAVY, ...o });
const motif = (o) => piece({ kind: "motif", motif: "heart", size: 40, style: "fill", color: RED, ...o });
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
    text({ text: "Emma", size: 16, shape: "up", radius: 32, y: 14, color: NAVY })],   // (30 ran into the heart's dip)
    tip: "Hoop sticky (self-adhesive) tear-away stabilizer, score and peel its paper, and press the bib onto it (or float it on plain tear-away with spray adhesive). On terry, lay a water-soluble topper over it so the stitches don't sink." },
  { id: "towel", name: "Towel name", note: "a big name that stands up to terry", make: () => [text({ text: "Emma", size: 32, style: "satin" })], fabric: "towel", baste: true },
  { id: "ornament", name: "Ornament", note: "two-sided, sewn in the hoop", make: () => [
    frame({ shape: "circle", w: 80, h: 80, border: "ith", color: RED }),
    text({ text: "Emma", size: 20, y: -4 }),
    text({ text: "2026", font: PRINT, size: 8, y: 14 })],
    tip: "Made in the hoop, front and back. Have ready: tear-away stabilizer, front and back fabric cut 1 in bigger than the circle, tape, and a 6 in ribbon for hanging. Smaller (Fit to hoop or the size slider) makes a keychain." },
  { id: "mugrug", name: "Mug rug", note: "quilted, sewn in the hoop", make: () => [
    frame({ shape: "square", w: 120, h: 90, border: "ith", quilt: "stipple", color: NAVY }),
    text({ text: "Tea time", size: 18, color: RED })],
    tip: "Made in the hoop: front fabric with thin batting under it, then backing. Have ready: tear-away stabilizer, front and back fabric and batting 1 in bigger than the rug, and tape." },
  { id: "coaster", name: "Coaster", note: "echo-quilted round a letter", make: () => [
    frame({ shape: "circle", w: 96, h: 96, border: "ith", quilt: "echo", color: RED }),
    mono({ letters: "A", size: 34, color: NAVY })],
    tip: "Made in the hoop, front and back. Thin batting under the front fabric makes the echo lines puff up." },
  { id: "quiltblock", name: "Quilt block", note: "a stippled square with a heart", make: () => [
    frame({ shape: "square", w: 112, h: 112, border: "bold", quilt: "stipple", color: BLACK }),
    frame({ shape: "heart", w: 52, h: 48, border: "satin", color: RED })],
    tip: "Hoop the quilt sandwich (top, batting, backing) or float it on tear-away stabilizer. Stitch the blocks, then sew them together." },
  { id: "pouch", name: "Zipper pouch", note: "sewn in the hoop, turned through the zipper", make: () => [
    frame({ shape: "square", w: 110, h: 90, border: "zip", color: NAVY }),
    text({ text: "Makeup", size: 16, y: 14, color: RED })],
    tip: "Medium-weight cotton or canvas works best. Use a nylon coil zipper (the needle can't hit metal teeth, so keep the zipper tab past the side while it sews)." },
  { id: "keyfob", name: "Key fob", note: "two-sided, with a ribbon loop", make: () => [
    frame({ shape: "square", w: 44, h: 80, border: "ith", color: RED }),
    mono({ letters: "J", size: 30, y: 6, color: NAVY })],
    tip: "Like the ornament: tape a 5 in piece of ribbon or webbing, folded in half, at the top before the back goes on. Felt or vinyl doesn't fray, so it can be cut right up to the satin." },
  { id: "applique", name: "Appliqué", note: "a fabric shape with a name", make: () => [
    frame({ shape: "heart", w: 84, h: 76, border: "applique", y: -4 }), text({ size: 18, y: -6, color: NAVY })] },
  { id: "initials", name: "Appliqué letters", note: "fabric letters with satin edges", make: () => [appl({ text: "AB", size: 60 })] },
  { id: "patch", name: "Patch", note: "a filled badge with an edge", make: () => [
    frame({ shape: "circle", w: 76, h: 76, border: "patch", fill: NAVY, color: RED }),
    mono({ letters: "JD", size: 26, font: PRINT, color: "#f0f0f0" })] },
  { id: "decorated", name: "Name with motifs", note: "a little heart either side", make: () => [text({ text: "Emma", size: 20, deco: "heart", color: RED })] },
  { id: "words", name: "Just lettering", note: "a word or name on its own", make: () => [text({ size: 24 })] },
];

// api: { hoop(), setView(pattern, filename, look) (null pattern: nothing to show), showError(msg), busy(on, text),
//        safeName(s, fb), escapeHtml(s), saveFile(blob, name), store, showStep(i), step(), setMode(mode), spool(hex) }
export function initStudio(api) {
  const $ = (id) => document.getElementById(id);
  const saved = api.store.get("studio", null);
  let pieces = saved?.pieces?.length ? saved.pieces : STARTERS.find((s) => s.make).make();
  nextId = Math.max(0, ...pieces.map((p) => p.id)) + 1;
  let sel = saved?.sel ?? pieces[pieces.length - 1]?.id, seq = 0, timer = 0;
  // what it's sewn on (changes the stitches for knit and towel) and the basting box
  let fabric = FABRICS[saved?.fabric] ? saved.fabric : "cotton", baste = !!saved?.baste, thread = THREADS[saved?.thread] ? String(saved.thread) : "auto";

  const save = () => api.store.set("studio", { pieces, sel, fabric, baste, thread });
  // undo: a snapshot before each change (a burst of slider moves counts as one)
  // (a snapshot equal to the last one is skipped: picking a piece or a no-op starter made undo look dead for a press)
  const history = [], future = [];
  let quiet = 0;
  const snap = () => JSON.stringify({ pieces, sel, fabric, baste, thread });
  const sameDesign = (a, b) => { const x = JSON.parse(a), y = JSON.parse(b); delete x.sel; delete y.sel; return JSON.stringify(x) === JSON.stringify(y); };
  function remember(burst = false) {
    if (burst && Date.now() - quiet < 800) { quiet = Date.now(); return; }
    quiet = burst ? Date.now() : 0;
    const now = snap();
    if (history.length && sameDesign(history[history.length - 1], now)) return;
    history.push(now); if (history.length > 60) history.shift();
    future.length = 0; buttons();
  }
  const buttons = () => { $("st-undo").disabled = !history.length; $("st-redo").disabled = !future.length; };
  function restore(h) { ({ pieces, sel, fabric, baste, thread = "auto" } = JSON.parse(h)); quiet = 0; buttons(); save(); ui(); make(); }
  function undo() {
    const now = snap();
    // (skip anything that looks the same as now: the last change may not have changed the design)
    while (history.length && sameDesign(history[history.length - 1], now)) history.pop();
    const h = history.pop(); if (!h) { buttons(); return; }
    future.push(now); restore(h);
  }
  function redo() {
    const h = future.pop(); if (!h) return;
    history.push(snap()); restore(h);
  }
  const current = () => pieces.find((p) => p.id === sel);

  function cards() {
    $("st-cards-count").textContent = `· ${STARTERS.length} ideas, scroll for more →`;
    $("st-cards").innerHTML = STARTERS.map((s) => `<button type="button" data-start="${s.id}" title="${s.note}"><canvas aria-hidden="true"></canvas><b>${s.name}</b><small>${s.note}</small></button>`).join("");
  }
  // a small stitched preview of each starter (drawn once the tab is on screen and has a size), one at a time when
  // the page is idle: composing all of them at once held the first visit to the tab up for 1.6 s
  let thumbed = false;
  const idle = () => new Promise((r) => ("requestIdleCallback" in window ? requestIdleCallback(() => r(), { timeout: 600 }) : setTimeout(r, 0)));
  async function thumbs() {
    if (thumbed || !$("st-cards").offsetWidth) return;
    thumbed = true;
    const fonts = [...new Set(STARTERS.flatMap((s) => (s.make ? s.make() : [])).filter((p) => p.font).map((p) => p.font).concat(SCRIPT))];
    await Promise.all(fonts.map((f) => document.fonts.load(`40px "${f}"`)));
    for (const s of STARTERS) {
      await idle();
      const c = $("st-cards").querySelector(`[data-start="${s.id}"] canvas`);
      try {
        if (s.mode === "bookmark") {   // lying down, like the bookmark tab shows it
          const d = buildBookmark({ name: "Emma", family: SCRIPT, hoop: getHoop() });
          draw(c, turnPattern(d.pattern(), false), { pad: 4, fabricShapeBlock: 0, fabric: "pink", hide: hiddenBlocks(false) });
          continue;
        }
        const { design, steps } = compose(s.make(), { w: 1000, h: 1000, name: "" });
        draw(c, design.pattern(), { pad: 4, ...previewLook(steps) });
      } catch { c.remove(); }
    }
  }
  function list() {
    $("st-pieces").innerHTML = pieces.map((p, i) => `<li data-id="${p.id}" aria-selected="${p.id === sel}">
      <button type="button" class="pick" data-id="${p.id}" ${p.id === sel ? `aria-current="true"` : ""}><i style="background:${p.color}"></i><span class="nm">${api.escapeHtml(label(p))}</span></button>
      <span class="ops">
        <button type="button" data-op="up" data-id="${p.id}" aria-label="Sew earlier" ${i ? "" : "disabled"}>↑</button>
        <button type="button" data-op="down" data-id="${p.id}" aria-label="Sew later" ${i < pieces.length - 1 ? "" : "disabled"}>↓</button>
        <button type="button" data-op="dup" data-id="${p.id}" aria-label="Duplicate" title="Duplicate">⧉</button>
        <button type="button" data-op="flip" data-id="${p.id}" aria-label="Mirror" title="Mirror (flip left to right)" aria-pressed="${!!p.flip}">⇋</button>
        <button type="button" data-op="del" data-id="${p.id}" aria-label="Remove">✕</button>
      </span></li>`).join("");
  }
  const swatches = (p, k = "color") => COLORS.map((c) => `<button type="button" data-${k}="${c}" style="background:${c}" aria-pressed="${c === p[k]}" title="Brother ${nearestBrotherThread(c).name}"></button>`).join("")
    + `<span class="custom"><input type="color" data-${k}-any value="${p[k]}" aria-label="Any colour"></span>`;
  const fontSelect = (p) => `<select data-k="font">${FONTS.map((f) => `<option value="${f.family}" ${f.family === p.font ? "selected" : ""}>${f.name}${f.print ? " (print)" : ""}</option>`).join("")}</select>`;
  const range = (k, lab, min, max, v, unit = "mm", step = 1) => `<label class="range"><span>${lab}</span><input type="range" data-k="${k}" data-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${v} ${unit}</output></label>`;
  // one letter pair closer or further apart (print fonts): `kern` = { index of the pair's first letter in the words: % of
  // the height }, on top of the font's own kerning
  let pairAt = -1, pairOf = null;
  const pairs = (t) => { const out = []; for (let i = 0; i < t.length - 1; i++) if (/\S/.test(t[i]) && /\S/.test(t[i + 1])) out.push(i); return out; };
  function pairUI(p) {
    const all = pairs(p.text || ""); if (!all.length) return "";
    if (pairOf !== p.id || !all.includes(pairAt)) pairAt = all.find((i) => p.kern?.[i]) ?? all[0];
    pairOf = p.id;
    const v = p.kern?.[pairAt] || 0, any = Object.values(p.kern || {}).some((x) => x);
    return `<label class="field"><span>Letter pair</span><select data-pair>${all.map((i) => `<option value="${i}" ${i === pairAt ? "selected" : ""}>${api.escapeHtml(p.text[i] + " " + p.text[i + 1])}${p.kern?.[i] ? ` (${p.kern[i] > 0 ? "+" : ""}${p.kern[i]}%)` : ""}</option>`).join("")}</select></label>`
      + `<label class="range"><span>Space in this pair</span><input type="range" data-kern min="-30" max="50" step="1" value="${v}"><output>${v} %</output></label>`
      + (any ? `<p><button type="button" class="link" data-kern-reset>Even out all pairs</button></p>` : "");
  }
  // pair adjustments follow their letters when the words are edited (shared start and end kept, the changed middle dropped)
  function rekern(kern, old, now) {
    if (!kern) return kern;
    let a = 0; while (a < old.length && a < now.length && old[a] === now[a]) a++;
    let b = 0; while (b < old.length - a && b < now.length - a && old[old.length - 1 - b] === now[now.length - 1 - b]) b++;
    const out = {};
    for (const [k, v] of Object.entries(kern)) { const i = +k; if (i + 1 < a) out[i] = v; else if (i >= old.length - b) out[i + now.length - old.length] = v; }
    return Object.keys(out).length ? out : undefined;
  }
  // characters the font doesn't have (the browser would draw them in a stand-in font). The fonts are Latin only, so
  // anything past Latin Extended (emoji, CJK, Hebrew…) other than punctuation and currency is missing; a Latin letter
  // is missing when the font doesn't change its width against either fallback. (Measuring alone misses CJK: the
  // system's fallback chain changes with the font in front of it.)
  const probe = document.createElement("canvas").getContext("2d");
  const width = (font, ch) => { probe.font = font; return probe.measureText(ch).width; };
  function missing(text, family) {
    if (!family) return [];
    return [...new Set(text.replace(/\s/g, ""))].filter((ch) => {
      const cp = ch.codePointAt(0);
      if (cp > 0x24f && !(cp >= 0x2100 && cp <= 0x214f)) return !(cp >= 0x2000 && cp <= 0x20cf);
      return width(`40px "${family}", monospace`, ch) === width("40px monospace", ch) && width(`40px "${family}", serif`, ch) === width("40px serif", ch);
    });
  }
  const seg = (k, opts, v) => `<div class="seg" data-seg="${k}">${Object.entries(opts).map(([key, name]) => `<button type="button" data-v="${key}" aria-pressed="${key === v}">${name}</button>`).join("")}</div>`;

  // satin and fine line, said plainly: bold columns or a thin outline of the letter
  const STITCHES = { auto: "Stitch: automatic", satin: "Bold", line: "Thin line" };
  let moreOpen = false;
  $("st-edit").addEventListener("toggle", (e) => { if (e.target.matches("details.more")) moreOpen = e.target.open; }, true);
  const editor = () => api.keepFocus($("st-edit"), drawEditor);
  function drawEditor() {
    const p = current();
    if (!p) { $("st-edit").innerHTML = `<p class="hint">Pick a piece above, or add one.</p>`; return; }
    let h = "";
    if (p.kind === "text") {
      const lines = p.text.split("\n").length, arc = p.shape === "up" || p.shape === "down";
      h += `<label class="field"><span>Words</span><textarea data-k="text" rows="${Math.min(3, lines)}" maxlength="60" style="font-family:'${p.font}', sans-serif" autocomplete="off" spellcheck="false">${api.escapeHtml(p.text)}</textarea></label>`;
      h += `<label class="field"><span>Font</span>${fontSelect(p)}</label>`;
      h += range("size", "Height", 5, 60, p.size);
      h += seg("shape", TEXT_SHAPES, p.shape);
      h += seg("style", STITCHES, p.style || "auto");
      if (arc) {
        h += range("radius", "Curve width", 15, 80, p.radius);
        h += range("ry", "Curve height", 15, 80, p.ry ?? p.radius);
        if (followFrame(p, pieces)) h += `<button type="button" class="link" data-follow>Follow the frame</button>`;
      }
      if (p.shape === "wave") { h += range("amp", "Wave height", 2, 30, p.amp ?? Math.round(p.size * 0.35)); h += range("waves", "Waves", 1, 3, p.waves ?? 1, "", 0.5); }
      if (p.shape === "bridge") h += range("bulge", "Bulge", 10, 80, p.bulge ?? 30, "%", 5);
      // the rarer settings, folded away
      const print = FONTS.find((f) => f.family === p.font)?.print;
      const more = `<label class="field"><span>Motif either side</span><select data-k="deco"><option value="">None</option>${Object.entries(MOTIFS).map(([k, m]) => `<option value="${k}" ${k === p.deco ? "selected" : ""}>${m.name}</option>`).join("")}</select></label>`
        + (print ? range("spacing", "Letter spacing", -10, 40, p.spacing || 0, "%") + `<div data-pairs>${pairUI(p)}</div>` : "")
        + (p.shape === "straight" ? `<p class="hint">Press Enter in Words for a new line (up to 3).</p>` : "")
        + (p.shape === "straight" && lines > 1 ? seg("align", { left: "Left", center: "Centre", right: "Right" }, p.align || "center") + range("leading", "Line spacing", 80, 200, p.leading ?? 130, "%", 5) : "");
      h += `<details class="more" ${moreOpen ? "open" : ""}><summary>More</summary>${more}</details>`;
    } else if (p.kind === "monogram") {
      h += `<label class="field"><span>Initials</span><input type="text" data-k="letters" style="font-family:'${p.font}', sans-serif" value="${api.escapeHtml(p.letters)}" maxlength="3" autocomplete="off" spellcheck="false"></label>`;
      h += `<p class="hint">Traditional order: first, LAST, middle. The middle letter is stitched biggest.</p>`;
      h += `<label class="field"><span>Font</span>${fontSelect(p)}</label>`;
      h += range("size", "Height", 15, 90, p.size);
      h += seg("style", STITCHES, p.style || "auto");
    } else if (p.kind === "motif") {
      h += `<div class="field"><span>Motif</span><div class="motifs" role="group" aria-label="Motif">${Object.entries(MOTIFS).map(([k, m]) => `<button type="button" data-motif="${k}" aria-pressed="${k === p.motif}" title="${m.name}"><svg viewBox="0 0 256 256" aria-hidden="true"><path d="${m.d}"/></svg></button>`).join("")}</div></div>`;
      h += range("size", "Size", 10, 120, p.size);
      h += seg("style", { fill: "Filled", outline: "Outline", applique: "Appliqué" }, p.style || "fill");
      if ((p.style || "fill") === "fill" && p.size < 25) h += `<p class="hint warn">Filled this small, the detail closes up. Make it 25 mm or more, or choose Outline.</p>`;
      if (p.style === "applique") h += `<p class="hint">Sews an outline, pauses for you to lay fabric on and trim it, then satins the edges. 50 mm or bigger cuts most easily.</p>`;
    } else if (p.kind === "letters") {
      h += `<label class="field"><span>Letters</span><input type="text" data-k="text" style="font-family:'${p.font}', sans-serif" value="${api.escapeHtml(p.text)}" maxlength="12" autocomplete="off" spellcheck="false"></label>`;
      h += `<label class="field"><span>Font</span><select data-k="font">${APPLIQUE_FONTS.map((f) => `<option value="${f.family}" ${f.family === p.font ? "selected" : ""}>${f.name} (${f.note})</option>`).join("")}</select></label>`;
      h += range("size", "Height", 20, 120, p.size);
      h += `<p class="hint">Cut from fabric: the machine sews an outline, pauses for you to lay fabric on and trim it, then satins the edges. Letters 30 mm or taller cut and sew most easily.</p>`;
    } else if (p.kind === "frame") {
      h += seg("shape", Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, s.name])), p.shape);
      h += range("w", p.shape === "circle" ? "Size" : "Width", 20, 170, p.w);
      if (p.shape !== "circle") h += range("h", "Height", 20, 170, p.h);
      // (a zipper across a heart's lobes or a diamond's point makes no pouch)
      h += seg("border", Object.fromEntries(Object.entries(BORDERS).filter(([k]) => k !== "zip" || ["square", "oval", "circle"].includes(p.shape) || p.border === "zip")), p.border);
      if (p.border === "zip") h += `<p class="hint">A lined zipper pouch made in the hoop: the zipper, the front in two folded pieces, what goes on the front (the pieces below it in the list), then the back and one seam through everything. Fabric sizes are under “How to stitch it”.</p>`;
      if (p.border === "patch") {
        p.fill ||= NAVY;
        h += `<div class="field"><span>Fill thread</span><div class="swatches">${swatches(p, "fill")}</div><p class="hint">Brother ${nearestBrotherThread(p.fill).name}. The edge uses the thread below.</p></div>`;
        // the expert fills, folded away: a stitch texture, and a second colour fading in across the patch
        h += `<details class="more" ${moreOpen ? "open" : ""}><summary>More</summary>${seg("pattern", Object.fromEntries(Object.entries(FILL_PATTERNS).map(([k, f]) => [k, f.name])), p.pattern || "tatami")}
          <label class="check small"><input type="checkbox" data-blend ${p.blend ? "checked" : ""}> Blend into a second colour</label>
          ${p.blend ? `<div class="swatches">${swatches(p, "blend")}</div><p class="hint">Fades from Brother ${nearestBrotherThread(p.fill).name} to ${nearestBrotherThread(p.blend).name} across the patch: one more thread change.</p>` : ""}</details>`;
      }
      if (p.border !== "patch") h += `<div class="field"><span>Quilting</span>${seg("quilt", QUILTS, p.quilt || "none")}</div>`
        + (p.quilt && p.quilt !== "none" ? `<p class="hint">Fills the frame around everything on it, in the frame's thread.</p>` : "");
      if (p.border === "ith") h += `<p class="hint">Two-sided, made in the hoop: an appliqué front, then the pieces below it in the list, then backing fabric under the hoop and a satin edge through everything. The steps are under “How to stitch it”.</p>`;
      if (p.border === "applique") h += `<p class="hint">Sews an outline, pauses for you to lay fabric on and trim it, then covers the edge in satin. The steps are under “How to stitch it”.</p>`;
    } else {
      h += `<p class="hint">${api.escapeHtml(p.name)}: its stitches are used exactly as they are, so it can be moved and turned but not resized.</p>`;
    }
    if (p.kind === "text") h += `<p class="hint" data-fit hidden></p>`;
    if (p.kind !== "frame") h += `<p class="hint warn" data-warn hidden></p>`;
    h += range("rot", "Turn", -180, 180, p.rot || 0, "°", 5);
    if (p.kind !== "file") h += `<div class="field"><span>Thread</span><div class="swatches">${swatches(p)}</div><p class="hint">Brother ${nearestBrotherThread(p.color).name}${api.spool(p.color) ? ` · ${api.escapeHtml(api.spool(p.color))}` : ""}</p></div>`;
    $("st-edit").innerHTML = h;
    warn();
  }
  function ui() { api.keepFocus($("panel-design"), () => { list(); editor(); sewnOn(); }); }
  function sewnOn() {
    $("st-fabric").innerHTML = Object.entries(FABRICS).map(([k, f]) => `<button type="button" data-fab="${k}" aria-pressed="${k === fabric}">${f.name}</button>`).join("");
    $("st-baste").checked = baste; $("st-fabric-tip").textContent = FABRICS[fabric].tip; $("st-fabric-name").textContent = FABRICS[fabric].name + (baste ? ", basted" : "");
    // (numeric keys come first in an object, so the order is spelled out)
    $("st-thread").innerHTML = `<span class="chips-label">Thread</span>` + ["auto", "30", "40", "60"].map((k) => `<button type="button" data-thread="${k}" aria-pressed="${k === thread}">${THREADS[k].name}</button>`).join("");
    $("st-thread-tip").textContent = THREADS[thread].tip; $("st-thread-name").textContent = thread === "auto" ? "" : `, ${THREADS[thread].name} thread`;
  }
  $("st-fabric").onclick = (e) => { const b = e.target.closest("[data-fab]"); if (!b || b.dataset.fab === fabric) return; remember(); fabric = b.dataset.fab; save(); sewnOn(); make(); warn(); };
  $("st-thread").onclick = (e) => { const b = e.target.closest("[data-thread]"); if (!b || b.dataset.thread === thread) return; remember(); thread = b.dataset.thread; save(); sewnOn(); make(); };
  $("st-baste").onchange = (e) => { remember(); baste = e.target.checked; save(); sewnOn(); make(); };
  // too-small lettering, said plainly (updated in place so typing keeps focus)
  async function warn() {
    const w = $("st-edit").querySelector("[data-warn]"), p = current(); if (!w || !p) return;
    if (p.font) await document.fonts.load(`40px "${p.font}"`);
    const fit = $("st-edit").querySelector("[data-fit]"), fs = fittedSizes(pieces).get(p.id);
    if (fit) { fit.hidden = !fs; fit.textContent = fs ? `Shrunk to ${fs} mm so it fits inside the frame.` : ""; }
    const q = fs ? { ...p, size: fs } : p, m = minSize(q), room = archRoom(p), near = touching(q, pieces);
    const towel = fabric === "towel" && !m && (p.kind === "text" || p.kind === "monogram") ? towelMin(q) : 0, gone = missing(p.text ?? p.letters ?? "", p.font);
    // (said plainly, with a one-tap fix where there is one)
    w.innerHTML = [
      gone.length ? `This font has no ${gone.map((c) => `“${api.escapeHtml(c)}”`).join(" ")}: ${gone.length === 1 ? "it" : "they"} would be stitched in a stand-in letter. Take ${gone.length === 1 ? "it" : "them"} out or try another font.` : "",
      m ? `These letters are too small to stitch cleanly. Make the height ${m} mm or more.` : "",
      towel ? `On a towel these letters close up (the loops need a wide satin). Make the height ${towel} mm or more. <button type="button" class="link" data-size="${towel}">Make it ${towel} mm</button>` : "",
      room ? `The words wrap most of the way round the curve${room.full ? " and run into themselves" : ""}. <button type="button" class="link" data-room>Widen the curve</button>` : "",
      archTight(p) ? "The curve is too tight for letters this tall: they'd bunch up. Make the curve bigger or the letters smaller." : "",
      near ? `This runs into ${api.escapeHtml(label(near))}. Drag it apart or make it smaller.` : "",
      !m && !towel && fabric !== "towel" && fineLine(q) ? `At this size it sews as a thin line. <button type="button" class="link" data-seg-set="style:satin">Make it bold</button> (small loops may fill in).` : "",
    ].filter(Boolean).map((t) => `<span>${t}</span>`).join("<br>");
    w.hidden = !w.innerHTML;
  }

  function change(fn, now = false) {
    const p = current(); if (!p) return;
    remember(!now); fn(p); save(); list();
    clearTimeout(warnTimer); warnTimer = setTimeout(warn, 300);
    clearTimeout(timer); timer = setTimeout(make, now ? 0 : 160);
  }

  async function make(dragging = false) {
    thumbs();
    const s = ++seq;
    api.showError("");
    try {
      const fonts = [...new Set(pieces.filter((p) => p.font).map((p) => p.font))];
      await Promise.all(fonts.map((f) => document.fonts.load(`40px "${f}"`)));
      if (s !== seq) return;
      let composed;
      try { composed = compose(pieces, api.hoop(), { fabric, baste, thread, dragging }); }
      catch (err) { if (!err.overBy) throw err; if (s === seq) split(err); return; }
      const { design, steps, after, before, tip } = composed;
      if (s !== seq) return;
      const fit = fittedSizes(pieces), small = thread !== "60" && pieces.some((p) => smallText(fit.has(p.id) ? { ...p, size: fit.get(p.id) } : p));
      // (what the fabric needs goes first: a towel's topper was only in the folded "Sewing on")
      const ready = [FABRICS[fabric].ready, ...before].filter(Boolean), done = [...after, FABRICS[fabric].after].filter(Boolean);
      stepsUI(steps, done, small, ready);
      const look = previewLook(steps);
      api.setView(design.pattern(), `${api.safeName(firstWords(), "design")}.pes`, {
        ...look, fabric: look.fabricShapeBlock != null ? "pink" : "linen", steps: steps.length,
        sheet: { steps: steps.map((st) => ({ you: st.you, sews: st.sews.join(" ") })), after: done, ready, cut: steps.filter((st) => st.cut).map((st) => st.cut),
          notes: [api.turned() ? TURNED : "", ...ready.map((b) => "Have ready: " + b), $("st-tip").hidden ? "" : $("st-tip").textContent, tip, thread === "auto" ? "" : THREADS[thread].tip, small ? SMALL_TIP : ""] } });
    } catch (err) {
      if (s !== seq) return;
      api.setView(null);
      // (an empty design isn't a mistake: the preview says what to do, in its own words, not in red)
      if (err.empty) stepsUI([]); else { console.error(err); api.showError(err.message); }
    }
  }
  // too big for the hoop: two hoopings if whole pieces can be shared out, else say how much to shrink
  function split(err) {
    const hoop = api.hoop(), parts = splitPieces(pieces, hoop);
    // can't be shared out: show it whole (a big pretend hoop) so it can be seen and dragged back; setView turns
    // Download into "Too big for this hoop"
    if (!parts) {
      // (the size said is the one the preview shows: the whole design, not the first try that failed)
      let msg = err.message, turn = false;
      try {
        const big = compose(pieces, { ...hoop, w: 2000, h: 2000 }, { fabric, baste, thread }).design, [x0, y0, x1, y1] = big.bounds();
        msg = `This design is ${(x1 - x0).toFixed(0)} × ${(y1 - y0).toFixed(0)} mm, but the ${hoop.name} fits ${hoop.w - 4} × ${hoop.h - 4} mm.`;
        turn = x1 - x0 <= hoop.h - 4 && y1 - y0 <= hoop.w - 4;   // fits with the long side across
        api.setView(big.pattern(), `${api.safeName(firstWords(), "design")}.pes`, { fabric: "linen", steps: 0 });
      } catch { api.setView(null); }
      if (turn) api.showError(msg + " It fits with the hoop turned:", { label: "Turn the hoop", run: () => $("turn").click() });
      else api.showError(msg + " Make the biggest piece smaller, or", { label: "Fit to hoop", run: () => $("st-fit").click() });
      return;
    }
    const opts = { fabric, baste, thread }, base = api.safeName(firstWords(), "design");
    const built = parts.map((pt, i) => ({ ...compose(pt.pieces, hoop, { ...opts, marks: { pts: pt.marks, end: pt.end } }), filename: `${base}_hooping_${i + 1}_of_2.pes` }));
    // the whole design for the preview (a big pretend hoop), and every step of both hoopings in order
    const all = compose(pieces, { ...hoop, w: 2000, h: 2000 }, opts);
    // (with the hoop turned, the machine's left cross is the bottom one on screen)
    const where = (st) => (api.turned() && st.you ? { ...st, you: st.you.replace("the left cross", "the left cross as the machine shows it (the bottom one in this preview)") } : st);
    const steps = [...built[0].steps, { color: built[1].steps[0].color, sews: ["Nothing: this step is the rehooping."], you: "Take the fabric out and hoop it again for the second half. The next step says how to line it up." }, ...built[1].steps.map(where)];
    stepsUI(steps, [...built[0].after, ...built[1].after], false, built[0].before);
    for (const b of $("st-steps").querySelectorAll("[data-step]")) b.disabled = true;   // (the step view follows one file)
    api.setView(all.design.pattern(), `${base}_2_hoopings.zip`, { fabric: "linen", steps: 0,
      split: built.map((b) => ({ pattern: b.design.pattern(), filename: b.filename })) });
  }
  // appliqué tips: shown the first time a design has fabric to lay on, then on request
  function applGuide(steps) {
    const has = steps.some((st) => st.fabric && st.cut);
    $("st-appl-open").hidden = !has;
    if (!has) $("st-appl").hidden = true;
    else if (!api.store.get("studio.applSeen", false) && $("st-guide").hidden) $("st-appl").hidden = false;
  }
  $("st-appl-close").onclick = () => { $("st-appl").hidden = true; api.store.set("studio.applSeen", true); };
  $("st-appl-open").onclick = () => { $("st-appl").hidden = false; $("st-appl").scrollIntoView({ block: "nearest", behavior: "smooth" }); };
  function stepsUI(steps, after = [], small = false, before = []) {
    applGuide(steps);
    const pauses = steps.length - 1;
    $("st-steps-count").textContent = !steps.length ? "" : `· ${steps.length} ${steps.length === 1 ? "step" : "steps"}, ${pauses} ${pauses === 1 ? "pause" : "pauses"}`;
    // each step is a button: the preview shows the design as it is after that step, what's still to come faint
    $("st-steps").innerHTML = (api.turned() ? `<li class="after"><b>Hooping</b><span>${TURNED}</span></li>` : "") + (before.length ? `<li class="after"><b>Have ready</b><span>${api.escapeHtml(before.join(" "))}</span></li>` : "") + steps.map((st, i) => `<li><button type="button" data-step="${i}" aria-pressed="${api.step() === i}">
      <b><span class="n">${i + 1}</span><i style="background:${st.color}"></i>Brother ${nearestBrotherThread(st.color).name}${api.spool(st.color) ? ` <small>${api.escapeHtml(api.spool(st.color))}</small>` : ""}</b>
      ${st.you ? `<span class="you">${api.escapeHtml(st.you)}</span>` : ""}<span>${api.escapeHtml(st.sews.join(" "))}</span>
      ${st.early ? `<small>Sewn early, with the other ${api.escapeHtml(nearestBrotherThread(st.color).name)} parts, to save a thread change.</small>` : ""}</button></li>`).join("")
      + (small ? `<li class="after"><b>Thread and needle</b><span>${SMALL_TIP}</span></li>` : "")
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
    fabric = s.fabric || "cotton";   // (a towel left on made every later starter towel-heavy, +40-75 % stitches)
    baste = !!s.baste;
    $("st-tip").hidden = !s.tip; $("st-tip").textContent = s.tip || "";
    save(); ui(); make();
    // phones: the preview is above the cards, so the change happened off-screen
    if (matchMedia("(max-width: 600px)").matches) $("view").scrollIntoView({ block: "center", behavior: "smooth" });
  };
  $("st-add").onclick = (e) => {
    const b = e.target.closest("[data-add]"); if (!b) return;
    if (b.dataset.add === "file") { $("st-file").click(); return; }
    remember();
    const p = b.dataset.add === "text" ? text({ y: 20 }) : b.dataset.add === "monogram" ? mono() : b.dataset.add === "letters" ? appl() : b.dataset.add === "motif" ? motif() : frame({ border: "line" });
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
    else if (b.dataset.op === "flip") pieces[i].flip = !pieces[i].flip;
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
    if (t.matches("[data-blend-any]")) { change((p) => (p.blend = t.value)); return; }
    if (t.matches("[data-blend]")) { change((p) => (t.checked ? (p.blend = p.fill === RED ? NAVY : RED) : delete p.blend), true); editor(); return; }
    if (t.matches("[data-pair]")) { pairAt = +t.value; editor(); return; }
    if (t.matches("[data-kern]")) {
      t.nextElementSibling.textContent = `${t.value} %`;
      change((p) => { p.kern = { ...p.kern, [pairAt]: +t.value }; if (!+t.value) delete p.kern[pairAt]; });
      const o = edit.querySelector(`[data-pair] option[value="${pairAt}"]`), p = current();
      if (o) o.textContent = p.text[pairAt] + " " + p.text[pairAt + 1] + (+t.value ? ` (${+t.value > 0 ? "+" : ""}${t.value}%)` : "");
      return;
    }
    if (!k) return;
    if (k === "text" && t.tagName === "TEXTAREA" && t.value.split("\n").length > 3) {
      const at = t.selectionStart; t.value = t.value.split("\n").slice(0, 3).join("\n"); t.setSelectionRange(Math.min(at, t.value.length), Math.min(at, t.value.length));
    }
    if (t.type === "range") t.nextElementSibling.textContent = `${t.value} ${t.dataset.unit}`;
    change((p) => {
      if (k === "text") { if (p.kern) p.kern = rekern(p.kern, p.text, t.value); pairAt = +Object.keys(rekern({ [pairAt]: 1 }, p.text, t.value) || { [-1]: 1 })[0]; }
      p[k] = t.type === "range" ? +t.value : t.value;
    });
    if (k === "text") { const box = edit.querySelector("[data-pairs]"); if (box) box.innerHTML = pairUI(current()); }   // (the pairs follow the words)
    if (["size", "text", "letters", "font", "radius", "ry", "spacing"].includes(k)) { clearTimeout(warnTimer); warnTimer = setTimeout(warn, 300); }
    // a new line in the words shows the alignment and line spacing
    if (k === "text" && (t.value.split("\n").length > 1) !== !!edit.querySelector('[data-seg="align"]') && current().shape === "straight") editor();
  });
  let warnTimer = 0;
  edit.addEventListener("change", (e) => { if (e.target.dataset.k === "font" || e.target.dataset.k === "deco" || e.target.matches("[data-color-any], [data-fill-any], [data-blend-any]")) editor(); });
  edit.addEventListener("click", (e) => {
    const c = e.target.closest("[data-color]");
    if (c) { change((p) => (p.color = c.dataset.color), true); editor(); return; }
    const mo = e.target.closest("[data-motif]");
    if (mo) { change((p) => (p.motif = mo.dataset.motif), true); editor(); list(); return; }
    const f = e.target.closest("[data-fill]");
    if (f) { change((p) => (p.fill = f.dataset.fill), true); editor(); return; }
    const bl = e.target.closest("button[data-blend]");
    if (bl) { change((p) => (p.blend = bl.dataset.blend), true); editor(); return; }
    if (e.target.closest("[data-kern-reset]")) { change((p) => delete p.kern, true); editor(); return; }
    const ss = e.target.closest("[data-seg-set]");
    if (ss) { const [k, v] = ss.dataset.segSet.split(":"); change((p) => (p[k] = v), true); editor(); return; }
    const sz = e.target.closest("[data-size]");
    if (sz) { change((p) => (p.size = Math.min(+sz.dataset.size, p.kind === "monogram" ? 90 : 60)), true); editor(); return; }
    if (e.target.closest("[data-room]")) { change((p) => Object.assign(p, archRoom(p) || {}), true); editor(); return; }
    if (e.target.closest("[data-follow]")) { change((p) => Object.assign(p, followFrame(p, pieces)), true); editor(); return; }
    const s = e.target.closest("[data-seg] button");
    if (s) { change((p) => (p[s.closest("[data-seg]").dataset.seg] = s.dataset.v), true); editor(); }
  });

  // drag a piece on the preview (mm in the hoop; the machine centres the whole design)
  let drag = null;
  // the smallest piece under the pointer, so letters inside a frame can be picked (the frame's box holds them all)
  const hit = ([x, y]) => {
    let best = null, area = Infinity;
    for (const p of pieces) {
      const b = pieceBounds(p);
      if (!b || x < b[0] - 2 || x > b[2] + 2 || y < b[1] - 2 || y > b[3] + 2) continue;
      const a = (b[2] - b[0] + 4) * (b[3] - b[1] + 4);
      if (a < area) { best = p; area = a; }
    }
    return best;
  };
  function start(mm) {
    const p = hit(mm); if (!p) return false;
    if (sel !== p.id) { sel = p.id; ui(); }
    drag = { p, from: mm, x: p.x, y: p.y, moved: false };
    return true;
  }
  function move(mm) {
    if (!drag) return;
    if (!drag.moved) { remember(); drag.moved = true; }
    drag.p.x = Math.round((drag.x + mm[0] - drag.from[0]) * 2) / 2; drag.p.y = Math.round((drag.y + mm[1] - drag.from[1]) * 2) / 2;
    // once a frame while dragging (restarting a timer on every move showed nothing until the pointer stopped), with
    // the quilting left as it was until the drop
    dragFrame ||= requestAnimationFrame(() => { dragFrame = 0; if (drag) make(true); });
  }
  let dragFrame = 0;
  function end() { if (drag) { const moved = drag.moved; drag = null; save(); if (moved) { make(); warn(); } } }
  function nudge(dx, dy) { change((p) => { p.x += dx; p.y += dy; }); }
  function center() { change((p) => { p.x = 0; p.y = 0; }, true); }
  $("st-center").onclick = center;
  // shrink (or grow) everything together so the whole design fills the hoop, less a little room
  $("st-fit").onclick = () => {
    const bs = pieces.map(pieceBounds).filter(Boolean);
    if (!bs.length) return;
    const w = Math.max(...bs.map((b) => b[2])) - Math.min(...bs.map((b) => b[0])), h = Math.max(...bs.map((b) => b[3])) - Math.min(...bs.map((b) => b[1]));
    const hp = api.hoop();
    remember();
    const scale = (f) => { for (const p of pieces) {
      p.x *= f; p.y *= f;
      if (p.kind !== "file") for (const k of ["size", "radius", "ry", "w", "h"]) if (p[k] != null) p[k] = Math.round(p[k] * f * 2) / 2;
    } };
    scale(Math.min((hp.w - 10) / w, (hp.h - 10) / h));
    // the outlines leave out satin width and swashes: shrink again until what's sewn fits (a few tries at most)
    for (let i = 0; i < 4; i++) {
      try { compose(pieces, hp, { fabric, baste, thread }); break; }
      catch (err) { if (!err.overBy) break; scale(0.98 / err.overBy); }
    }
    save(); ui(); make();
  };

  $("st-undo").onclick = undo;
  $("st-redo").onclick = redo;
  // a design file to keep and change later (the pieces, not the stitches)
  $("st-save").onclick = () => {
    api.saveFile(new Blob([JSON.stringify({ needleworks: 1, pieces, fabric, baste, thread }, null, 1)], { type: "application/json" }),
      `${api.safeName(firstWords(), "design")}.needleworks.json`);
  };
  $("st-load").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || data.needleworks !== 1 || !Array.isArray(data.pieces)) throw new Error("it isn't a design saved from this page");
      const kinds = new Set(["text", "monogram", "frame", "file", "letters", "motif"]);
      const loaded = data.pieces.filter((p) => p && kinds.has(p.kind) && Number.isFinite(p.x) && Number.isFinite(p.y));
      if (!loaded.length) throw new Error("it has no pieces");
      remember(); nextId = 1; pieces = loaded.map((p) => ({ ...p, id: nextId++ })); sel = pieces[pieces.length - 1].id;
      fabric = FABRICS[data.fabric] ? data.fabric : "cotton"; baste = !!data.baste; thread = THREADS[data.thread] ? String(data.thread) : "auto";
      save(); ui(); make();
    } catch (err) { api.showError("That design couldn't be opened: " + err.message); }
  };
  document.addEventListener("keydown", (e) => {
    if (document.body.dataset.mode !== "design" || e.defaultPrevented || e.target.matches?.("input[type=text], textarea, [role=tab]")) return;
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if ((e.metaKey || e.ctrlKey) && k === "z") { e.preventDefault(); undo(); return; }
    // Delete / Backspace removes the selected piece (from the page or the preview, never while typing)
    if ((e.key === "Delete" || e.key === "Backspace") && (e.target === document.body || e.target.id === "view") && current()) {
      e.preventDefault(); $("st-pieces").querySelector(`[data-op="del"][data-id="${sel}"]`)?.click(); return;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (arrows && (e.target === document.body || e.target.id === "view")) { e.preventDefault(); nudge(arrows[0] * (e.shiftKey ? 5 : 1), arrows[1] * (e.shiftKey ? 5 : 1)); }
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

  // one file per name: the biggest lettering (the name, nearly always) gets each name in turn
  function forNames() {
    const p = pieces.filter((q) => q.kind === "text").reduce((a, q) => (!a || q.size > a.size ? q : a), null);
    if (!p) return null;
    return {
      what: p.text.replace(/\s*\n\s*/g, " / "),
      // shrink: a name too long for the hoop is tried at 90 %, 80 %… down to half its size
      build: (name, shrink = false) => {
        for (let f = 1; ; f -= 0.1) {
          try {
            const q = { ...p, text: name, size: Math.round(p.size * f * 2) / 2 }, ps = pieces.map((r) => (r.id === p.id ? q : r));
            const pattern = compose(ps, api.hoop(), { fabric, baste, thread }).design.pattern();
            // (lettering inside a frame shrinks to fit it, so a long name can come out small without f changing)
            const was = fittedSizes(pieces).get(p.id) ?? p.size, now = fittedSizes(ps).get(p.id) ?? q.size;
            return { pattern, name, smaller: f < 1 || now < was - 0.25, thin: fabric !== "towel" && fineLine({ ...q, size: now }) && !fineLine({ ...p, size: was }) };
          }
          catch (err) { if (!shrink || !err.overBy || f < 0.55) throw err; }
        }
      },
    };
  }

  cards(); ui();
  return { make, start, move, end, nudge, forNames };
}
