/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Design tab UI: start from a card, edit pieces in a short list, drag them on the preview.
import { APPLIQUE_FONTS, FONTS, loadFont } from "../core/fonts.js";
import { MAX_INITIALS, MAX_WORDS, initials, lackList, lacks, swashes, tidy, tidyField, unswashed, withSwash } from "../core/typed.js";
import { nearestBrotherThread } from "../core/threads.js";
import { designStats, machineThreads, readEmbroidery } from "../core/formats.js";
import { BLOCK, LOOK, TIP, problemsItems, shownOn, stopWords } from "../words.js";
import { FILL_PATTERNS } from "../core/digitize.js";
import { draw } from "../render.js";
import { TURN_PIC, youHtml } from "../sheet.js";
import { QUILTS, quiltOf } from "./quilt.js";
import { MOTIFS } from "./motifs.js";
import { quiltDone, scaledFit, BORDERS, FABRICS, THREADS, SHAPES, TEXT_SHAPES, splitPieces, archFit, archStart, frontPanel, inkHeight, monoSize, archRoom, archShrink, archTight, cleanPiece, clearSize, collision, collisions, inFrame, letterMetrics, underPatch, crossName, crossStep, layoutSize, touching, touchingAll, towelMin, fineLine, loopsFill, compose, fileBlocks, blocksPattern, scaleBlocks, FILE_SCALE, fittedSizes, followFrame, label, minSize, pieceBounds, pieceStitches, previewLook, smallText, bulkReady } from "./pieces.js";

const SCRIPT = "NW Great Vibes", PRINT = "NW Josefin Sans", ROUND = "NW Quicksand";
// exact Brother PEC thread colours, so the name on screen is the one the machine shows
const RED = "#ed171f", NAVY = "#0e1f7c", BLACK = "#000000";
const PINK = "#f993bc", WHITE = "#f0f0f0";
export const TURNED = "The hoop is turned, so the machine sews this design on its side. Hoop the fabric a quarter turn round: the top of the design goes to the right-hand side of the hoop as you face the machine (the sew sheet shows it that way).";
// thread weight in plain words, on the chips (the number is printed on the spool; a bigger number is a finer thread)
const WT_TITLE = { auto: "Standard 40 weight thread, the usual machine embroidery thread", 30: "30 weight: a thicker thread, for bold letters",
  40: "40 weight: the usual machine embroidery thread", 60: "60 weight: a finer thread, for small letters and fine detail" };
const SMALL_TIP = "Small letters come out crisper with 60 wt thread (a finer thread: the weight is printed on the spool, and a bigger number is finer) and a 65/9 or 70/10 needle (a fine needle: the size is on the needle pack), and with the machine slowed down.";
export const COLORS = [RED, NAVY, "#00673e", "#770176", "#e8a900", "#f993bc", BLACK, "#f0f0f0"];

let nextId = 1;
const piece = (o) => ({ id: nextId++, x: 0, y: 0, color: NAVY, ...o });
const text = (o) => piece({ kind: "text", text: "Ashley", font: SCRIPT, size: 18, shape: "straight", radius: 30, ...o });
const mono = (o) => piece({ kind: "monogram", letters: "aMs", font: SCRIPT, size: 30, ...o });
const appl = (o) => piece({ kind: "letters", text: "AB", font: APPLIQUE_FONTS[0].family, size: 60, color: NAVY, ...o });
const motif = (o) => piece({ kind: "motif", motif: "heart", size: 40, style: "fill", color: RED, ...o });
const frame = (o) => piece({ kind: "frame", shape: "circle", w: 80, h: 80, border: "satin", color: RED, ...o });

// (the bookmark had its own panel and engine until 2026-10-31; it's pieces like every other starter now, and its
// swash checkboxes became "~" typed at either end of the words)
const SACRAMENTO = "NW Sacramento";
export const STARTERS = [
  // A name along an in-the-hoop bookmark: cotton front, felt back, one thread, a ribbon hole. It lies across with the
  // hoop turned (`turn`), so the name reads straight and still uses the 7 in side (it stood on end until 2026-10-31,
  // hard to read). The letters' height is about 72 % of the inside height, as the old bookmark sized them; a long name
  // shrinks to fit its length.
  { id: "bookmark", name: "Bookmark", note: "in the hoop, with a ribbon hole", turn: true, make: () => [
    frame({ shape: "bookmark", w: 165, h: 50, border: "ith", hang: false, eyelet: true, color: RED }),
    text({ text: "~Ashley~", font: SACRAMENTO, size: 26, x: 8, color: RED })],
    tip: "Made in the hoop on tear-away stabilizer: cotton for the front and felt for the back, each about 3 × 8 in, plus tape, Fray Check and a ribbon. Full size needs the 5 × 7 hoop. Type ~ at either end of a name for a swash." },
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
    // (Quicksand at 9 mm: Josefin's single-storey a sewed as an o at label sizes, its stem merged with the bowl, and
    // 8 mm warned "too small" out of the box)
    text({ text: "Made for", font: ROUND, size: 9, y: -23, color: BLACK }),
    text({ text: "Ashley", size: 20, y: -3, color: RED }),
    text({ text: "by Ashley in 2026", font: ROUND, size: 9, y: 19, color: BLACK })],
    tip: "Stitch it on cotton backed with tear-away stabilizer, then turn the edges under and hand-sew it to the back of the quilt." },
  { id: "bib", name: "Baby bib", note: "a name over a little heart", make: () => [
    frame({ shape: "heart", w: 46, h: 42, border: "applique", y: 14, color: PINK }),
    text({ text: "Ashley", size: 16, shape: "up", radius: 32, y: 14, color: NAVY })],   // (30 ran into the heart's dip)
    tip: "Hoop sticky (self-adhesive) tear-away stabilizer, score and peel its paper, and press the bib onto it (or float it on plain tear-away with spray adhesive). On terry, lay a water-soluble topper over it so the stitches don't sink." },
  { id: "towel", name: "Towel name", note: "a big name that stands up to terry", make: () => [text({ text: "Ashley", size: 32, style: "satin" })], fabric: "towel", baste: true },
  { id: "ornament", name: "Ornament", note: "two-sided, sewn in the hoop", make: () => [
    frame({ shape: "circle", w: 80, h: 80, border: "ith", hang: true, color: RED }),
    text({ text: "Ashley", size: 20, y: -4 }),
    text({ text: "2026", font: PRINT, size: 8, y: 14 })],
    tip: "Made in the hoop, front and back. Have ready: tear-away stabilizer, front and back fabric cut 1 in bigger than the circle, tape, and a 6 in ribbon for hanging. Smaller (Fit to hoop or the size slider) makes a keychain." },
  { id: "mugrug", name: "Mug rug", note: "quilted, sewn in the hoop", make: () => [
    frame({ shape: "square", w: 120, h: 90, border: "ith", quilt: "stipple", hang: false, color: NAVY }),
    text({ text: "Tea time", size: 18, color: RED })],
    tip: "Made in the hoop: front fabric with thin batting under it, then backing. Have ready: tear-away stabilizer, front and back fabric and batting 1 in bigger than the rug, and tape." },
  { id: "coaster", name: "Coaster", note: "echo-quilted round a letter", make: () => [
    frame({ shape: "circle", w: 96, h: 96, border: "ith", quilt: "echo", hang: false, color: RED }),
    mono({ letters: "A", size: 34, color: NAVY })],
    tip: "Made in the hoop, front and back. Thin batting under the front fabric makes the echo lines puff up." },
  { id: "quiltblock", name: "Quilt block", note: "a stippled square with a heart", make: () => [
    frame({ shape: "square", w: 112, h: 112, border: "bold", quilt: "stipple", color: BLACK }),
    frame({ shape: "heart", w: 52, h: 48, border: "satin", color: RED })],
    tip: "Hoop the quilt sandwich (top, batting, backing) or float it on tear-away stabilizer. Stitch the blocks, then sew them together." },
  { id: "pouch", name: "Zipper pouch", note: "sewn in the hoop, turned through the zipper", make: () => [
    frame({ shape: "square", w: 110, h: 90, border: "zip", color: NAVY }),
    text({ text: "Makeup", size: 20, y: 14, color: RED })],   // (at 16 its a and e loops filled in)
    tip: "Medium-weight cotton or canvas works best. Use a nylon coil zipper (the needle can't hit metal teeth, so keep the zipper tab past the side while it sews)." },
  { id: "keyfob", name: "Key fob", note: "two-sided, with a ribbon loop", make: () => [
    frame({ shape: "square", w: 44, h: 80, border: "ith", hang: true, color: RED }),
    mono({ letters: "J", size: 30, y: 6, color: NAVY })],
    tip: "Like the ornament: tape a 5 in piece of ribbon or webbing, folded in half, at the top before the back goes on. Felt or vinyl doesn't fray, so it can be cut right up to the satin stitches." },
  { id: "applique", name: "Appliqué", note: "a fabric shape with a name", make: () => [
    frame({ shape: "heart", w: 84, h: 76, border: "applique", y: -4 }), text({ size: 16, y: -4, color: NAVY })] },   // (18 at -6 ran into the lobes)
  { id: "initials", name: "Appliqué letters", note: "fabric letters with satin-stitched edges", make: () => [appl({ text: "AB", size: 60 })] },
  { id: "patch", name: "Patch", note: "a filled badge with an edge", make: () => [
    frame({ shape: "circle", w: 76, h: 76, border: "patch", fill: NAVY, color: RED }),
    mono({ letters: "JD", size: 26, font: PRINT, color: "#f0f0f0" })] },
  { id: "decorated", name: "Name with motifs", note: "a little heart either side", make: () => [text({ text: "Ashley", size: 20, deco: "heart", color: RED })] },
  { id: "words", name: "Just lettering", note: "a word or name on its own", make: () => [text({ size: 24 })] },
  // more of what people sew most (2026-10-31), then a few of our own
  { id: "tag", name: "Luggage tag", note: "two-sided, with a hole for the strap", make: () => [
    frame({ shape: "square", w: 60, h: 100, border: "ith", hang: false, eyelet: true, color: NAVY }),
    text({ text: "Ashley", size: 18, y: 4, color: RED }),
    text({ text: "555-0123", font: ROUND, size: 8, y: 26, color: NAVY })],
    tip: "Made in the hoop like the bookmark. Felt or vinyl on the back doesn't fray; a strip of clear vinyl over the front makes it wipe clean." },
  { id: "pocket", name: "Pocket monogram", note: "small initials for a shirt or polo", make: () => [mono({ letters: "jKm", font: PRINT, size: 20, color: NAVY })],
    fabric: "knit", tip: "Sew it on the left chest, about 7-9 in down from the shoulder seam. Hoop cut-away stabilizer with the shirt, and a water-soluble topper on piqué." },
  { id: "tote", name: "Tote bag", note: "two lines of words for a canvas bag", make: () => [text({ text: "Ashley's\nbooks", font: ROUND, size: 18, color: NAVY })],
    fabric: "canvas", tip: "Turn the bag inside out to hoop the front panel only, with tear-away stabilizer behind it." },
  { id: "stocking", name: "Stocking cuff", note: "a name with swashes for the cuff", make: () => [text({ text: "~Ashley~", size: 28, color: WHITE })],
    fabric: "felt", tip: "Sew the cuff before the stocking is put together, so it can be hooped flat. White on red felt reads from across the room." },
  { id: "birth", name: "Birth announcement", note: "name, date and weight for a keepsake", make: () => [
    frame({ shape: "oval", w: 100, h: 140, border: "line", color: NAVY }),
    motif({ motif: "baby", size: 25, y: -40, color: PINK }),
    text({ text: "Ashley", size: 22, y: -6, color: NAVY }),
    text({ text: "June 1, 2026\n7 lb 2 oz · 20 in", font: ROUND, size: 7, y: 22, color: NAVY })],
    tip: "Pretty framed in a 6 in embroidery hoop on the wall. Cotton or linen with medium tear-away stabilizer." },
  { id: "wedding", name: "Wedding keepsake", note: "two names and the date in a scallop", make: () => [
    frame({ shape: "scallop", w: 120, h: 120, border: "satin", color: "#e8a900" }),
    text({ text: "Sam\n& Alex", size: 20, y: -12, leading: 115, color: NAVY }),
    text({ text: "06.20.2026", font: ROUND, size: 8, y: 30, color: NAVY })] },
  { id: "bookplate", name: "Book plate", note: "“from the library of”, for a book cover", make: () => [
    frame({ shape: "square", w: 96, h: 120, border: "line", color: BLACK }),
    text({ text: "from the library of", font: ROUND, size: 8, y: -36, color: BLACK }),
    text({ text: "Ashley", size: 22, y: -10, color: RED }),
    motif({ motif: "book", size: 25, y: 26, color: NAVY })],
    tip: "Sew it on linen or cotton, then glue or stitch it inside a fabric book cover. Goes with the Bookmark." },
  { id: "pet", name: "Pet bandana", note: "a pet's name between two paws", make: () => [text({ text: "~Buddy~", size: 20, deco: "paw", color: NAVY })],
    tip: "Sew it on one corner of a cotton square before it's folded into a bandana, with tear-away stabilizer." },
  { id: "kitchen", name: "Kitchen sign", note: "family name and a year", make: () => [
    frame({ shape: "oval", w: 120, h: 80, border: "bold", color: RED }),
    text({ text: "Grandma's\nKitchen", size: 16, y: -4, color: NAVY }),
    text({ text: "EST. 1968", font: ROUND, size: 6, y: 25, color: RED })],
    tip: "Good on a flour-sack tea towel (pick Cotton) or an apron." },
];

// api: { hoop(), setView(pattern, filename, look) (null pattern: nothing to show), showError(msg), busy(on, text),
//        safeName(s, fb), escapeHtml(s), handOut(files, opts) (gate.js: the only way a file leaves), store, showStep(i), step(), setMode(mode), spool(hex) }
export function initStudio(api) {
  const $ = (id) => document.getElementById(id);
  const saved = api.store.get("studio", null);
  // (checked like an opened design: a crafted file's pieces stayed broken through a reload)
  let pieces = (Array.isArray(saved?.pieces) ? saved.pieces : []).map(cleanPiece).filter(Boolean);
  if (!pieces.length) pieces = STARTERS.find((s) => s.id === "monogram").make();
  if (new Set(pieces.map((p) => p.id)).size < pieces.length || !pieces.every((p) => Number.isInteger(p.id))) pieces.forEach((p, i) => (p.id = i + 1));
  nextId = Math.max(0, ...pieces.map((p) => p.id)) + 1;
  // (nothing selected stays so through a reload: `?? last` picked the last piece again)
  let sel = saved?.sel === null ? null : saved?.sel ?? pieces[pieces.length - 1]?.id, seq = 0, timer = 0;
  // what it's sewn on (changes the stitches for knit and towel) and the basting box
  let fabric = FABRICS[saved?.fabric] ? saved.fabric : "cotton", baste = !!saved?.baste, thread = THREADS[saved?.thread] ? String(saved.thread) : "auto";
  // made to fit with Fit to hoop: a font or style change that then takes it past the hoop fits it again
  let fitted = !!saved?.fitted, refitted = false;
  // sewn in two hoopings because they chose it ("Sew it in two hoopings"), until it fits one again: a design that grew
  // past the hoop was shared out between two files without a word (a pasted copy, a smaller hoop)
  let two = !!saved?.two;
  // the design's problems as last worked out (words.js), shown with the steps and handed to the view
  let problems = [];
  const fixHint = () => (problems.some((x) => x.piece != null && x.level !== TIP) ? "Select the piece in the list for its fix before you stitch." : "");
  // what the design is called (the starter it began as, or the saved file it came from), for the names ZIP
  let from = typeof saved?.from === "string" ? saved.from : "";

  const save = () => api.store.set("studio", { pieces, sel, fabric, baste, thread, fitted, two, from });
  // undo: a snapshot before each change (a burst of slider moves counts as one), with the hoop's turn (a turned design
  // undone to unturned said Too big)
  // (a snapshot equal to the last one is skipped: picking a piece or a no-op starter made undo look dead for a press)
  const history = [], future = [];
  let quiet = 0;
  const snap = () => JSON.stringify({ pieces, sel, fabric, baste, thread, fitted, two, turn: api.turned() });
  const sameDesign = (a, b) => { const x = JSON.parse(a), y = JSON.parse(b); delete x.sel; delete y.sel; return JSON.stringify(x) === JSON.stringify(y); };
  function remember(burst = false) {
    if (Date.now() - toastAt > 400) hideToast();   // (a "Removed … Undo" note goes with the next change)
    if (burst && Date.now() - quiet < 800) { quiet = Date.now(); return; }
    quiet = burst ? Date.now() : 0;
    const now = snap();
    if (history.length && sameDesign(history[history.length - 1], now)) return;
    history.push(now); if (history.length > 60) history.shift();
    future.length = 0; buttons();
  }
  const buttons = () => { $("st-undo").disabled = !history.length; $("st-redo").disabled = !future.length; };
  function restore(h) {
    let turn; ({ pieces, sel, fabric, baste, thread = "auto", fitted = false, two = false, turn } = JSON.parse(h));
    if (turn != null) api.setTurn(turn);
    quiet = 0; buttons(); save(); ui(); make();
  }
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
    // (one tab stop for the row, arrow keys between cards: 19 cards were 19 Tab presses before the pieces)
    $("st-cards").innerHTML = STARTERS.map((s, i) => `<button type="button" data-start="${s.id}" title="${s.note}" tabindex="${i ? -1 : 0}"><canvas aria-hidden="true"></canvas><b>${s.name}</b><small>${s.note}</small></button>`).join("");
  }
  $("st-cards").addEventListener("keydown", (e) => {
    const all = [...$("st-cards").querySelectorAll("[data-start]")], i = all.indexOf(e.target);
    const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: -i, End: all.length - 1 - i }[e.key];
    if (i < 0 || k == null) return;
    e.preventDefault(); const n = all[Math.max(0, Math.min(all.length - 1, i + k))];
    for (const b of all) b.tabIndex = b === n ? 0 : -1;
    n.focus(); n.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  // a small stitched preview of each starter (drawn once the tab is on screen and has a size), one at a time when
  // the page is idle: composing all of them at once held the first visit to the tab up for 1.6 s
  let thumbed = false;
  const idle = () => new Promise((r) => ("requestIdleCallback" in window ? requestIdleCallback(() => r(), { timeout: 600 }) : setTimeout(r, 0)));
  async function thumbs() {
    if (thumbed || !$("st-cards").offsetWidth) return;
    thumbed = true;
    const fonts = [...new Set(STARTERS.flatMap((s) => (s.make ? s.make() : [])).filter((p) => p.font).map((p) => p.font).concat(SCRIPT))];
    await Promise.allSettled(fonts.map(loadFont));
    for (const s of STARTERS) {
      await idle();
      const c = $("st-cards").querySelector(`[data-start="${s.id}"] canvas`);
      try {
        const { design, steps } = compose(s.make(), { w: 1000, h: 1000, name: "" });
        // (no background: the card is the background; an in-the-hoop front white like it)
        const look = previewLook(steps);
        draw(c, design.pattern(), { pad: 4, ...look, fabric: look.fabric || "white" });
      } catch { c.remove(); }
    }
  }
  // One Tab stop for the whole list, arrow keys within it (each row was 5-6 Tab presses, ~22 from the starters to the
  // editor): Up/Down go between pieces, Left/Right along a row's buttons, Home/End to the first/last piece. `rove` is
  // the button holding the Tab stop (the last one focused), else the selected piece's name.
  let rove = null;
  const OPS = [["up", "↑", "Earlier", "Sew earlier (move up the list)", "Sew earlier"], ["down", "↓", "Later", "Sew later (move down the list)", "Sew later"],
    ["dup", "⧉", "Copy", "Duplicate: add a copy below it (or copy and paste)", "Duplicate"], ["flip", "⇋", "Mirror", "Mirror: flip it left to right", "Mirror"],
    ["del", "✕", "Remove", "Remove this piece", "Remove"]];
  function list() {
    $("st-pieces").innerHTML = pieces.map((p, i) => `<li data-id="${p.id}" aria-selected="${p.id === sel}">
      <button type="button" class="pick" data-id="${p.id}" title="${api.escapeHtml(label(p))}" aria-describedby="st-pieces-keys" tabindex="-1" ${p.id === sel ? `aria-current="true"` : ""}><i style="background:${p.color}"></i><span class="nm">${api.escapeHtml(label(p))}</span></button>
      <span class="ops">${OPS.map(([op, icon, cap, tip, name]) => `
        <button type="button" data-op="${op}" data-id="${p.id}" aria-label="${name}: ${api.escapeHtml(label(p))}" title="${tip}" tabindex="-1"${op === "flip" ? ` aria-pressed="${!!p.flip}"` : ""}${(op === "up" && !i) || (op === "down" && i === pieces.length - 1) ? " disabled" : ""}><span aria-hidden="true">${icon}</span><small aria-hidden="true">${cap}</small></button>`).join("")}
      </span></li>`).join("");
    roving();
  }
  const roveBtns = () => [...$("st-pieces").querySelectorAll("button")];
  function roving(to) {
    const all = roveBtns(), q = (s) => $("st-pieces").querySelector(s);
    const at = to || (rove && q(`button[data-id="${rove.id}"]${rove.op ? `[data-op="${rove.op}"]` : ".pick"}`)), ok = at && !at.disabled ? at
      : (rove && q(`.pick[data-id="${rove.id}"]`)) || q(`.pick[data-id="${sel}"]`) || q(".pick");
    for (const b of all) b.tabIndex = b === ok ? 0 : -1;
    return ok;
  }
  $("st-pieces").addEventListener("focusin", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    rove = { id: b.dataset.id, op: b.dataset.op || "" }; roving(b);
  });
  $("st-pieces").addEventListener("keydown", (e) => {
    const b = e.target.closest("button"), row = b?.closest("li");
    if (!row || e.altKey || e.ctrlKey || e.metaKey) return;
    const rows = [...$("st-pieces").children], r = rows.indexOf(row), here = [...row.querySelectorAll("button")], c = here.indexOf(b);
    // (in the row above or below: the same column, else the nearest button there that can be pressed)
    const near = (li, col) => { const bs = [...li.querySelectorAll("button")]; for (let d = 0; d < bs.length; d++) for (const j of [col - d, col + d]) if (bs[j] && !bs[j].disabled) return bs[j]; };
    let n = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { const d = e.key === "ArrowLeft" ? -1 : 1; for (let j = c + d; j >= 0 && j < here.length && !n; j += d) if (!here[j].disabled) n = here[j]; }
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") { const li = rows[r + (e.key === "ArrowUp" ? -1 : 1)]; n = li && near(li, c); }
    else if (e.key === "Home" || e.key === "End") n = rows.at(e.key === "Home" ? 0 : -1)?.querySelector(".pick");
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); row.querySelector("[data-op=del]").click(); return; }
    else return;
    e.preventDefault();
    if (n) { roving(n); n.focus(); }
  });
  // the spools they own ("Threads I own") as swatches of their own, after Brother's: the piece takes the spool's colour
  // and the file the nearest Brother colour as always (only Any colour's hex reached a spool, and the machine named it
  // Dark Fuchsia)
  const swatches = (p, k = "color") => COLORS.map((c) => `<button type="button" data-${k}="${c}" style="background:${c}" aria-pressed="${c === p[k]}" title="Brother ${nearestBrotherThread(c).name}"></button>`).join("")
    + `<span class="custom"><input type="color" data-${k}-any value="${p[k]}" aria-label="Any colour"></span>`
    + ((own) => own.length ? `<span class="own-swatches" role="group" aria-label="Your threads"><span class="hint">Yours:</span>${own.map((s) => `<button type="button" data-${k}="${s.hex}" style="background:${s.hex}" aria-pressed="${s.hex === p[k]}" title="Your ${api.escapeHtml(s.label)} (the machine calls it ${nearestBrotherThread(s.hex).name})" aria-label="Your ${api.escapeHtml(s.label)}"></button>`).join("")}</span>` : "")(api.ownedSpools?.() || []);
  const fontSelect = (p) => `<select data-k="font">${FONTS.map((f) => `<option value="${f.family}" ${f.family === p.font ? "selected" : ""}>${f.name}${f.print ? " (print)" : ""}</option>`).join("")}</select>`;
  // (a size set past the slider's end, by Fit to hoop, stretches it: Fit set 67 mm on a slider that stopped at 60)
  const range = (k, lab, min, max, v, unit = "mm", step = 1) => `<label class="range"><span>${lab}</span><input type="range" data-k="${k}" data-unit="${unit}" min="${Number.isFinite(v) ? Math.min(min, Math.floor(v)) : min}" max="${Number.isFinite(v) ? Math.max(max, Math.ceil(v)) : max}" step="${step}" value="${v}"><output>${shown(v, unit)}</output></label>`;
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
  // characters the font doesn't have (the browser would draw them in a stand-in font), from the font's own character
  // map (`lacks` in words.js, also the bookmark's). Guessing by code point (anything past Latin Extended) said Great
  // Vibes had no ễ or А, which it has; measuring widths against fallbacks misses CJK.
  const missing = lacks, probe = document.createElement("canvas").getContext("2d");
  // mm with inches beside them (US sewists think in inches)
  const own = (o, k) => typeof k === "string" && Object.hasOwn(o, k);
  const shown = (v, unit) => (unit === "mm" ? `${v} mm · ${(v / 25.4).toFixed(2)} in` : `${v} ${unit}`);
  const seg = (k, opts, v) => `<div class="seg" data-seg="${k}">${Object.entries(opts).map(([key, name]) => `<button type="button" data-v="${key}" aria-pressed="${key === v}">${name}</button>`).join("")}</div>`;

  // satin and fine line, said plainly: bold columns or a thin outline of the letter
  const STITCHES = { auto: "Automatic", satin: "Bold", line: "Thin line" };
  // the automatic chip says what it'll do here ("Stitch: automatic" was lit while the note said it sews as a thin line)
  // (said once the lettering is worked out: a font change waited 0.8 s for it before the menu let go; warn() fills it in)
  const autoName = (p) => {
    if (fabric === "towel") return "Automatic: bold";
    if (!bulkReady(p)) return "Automatic";
    const fs = fittedSizes(pieces).get(p.id); return !fineLine({ ...p, size: fs ?? p.size, style: "auto" }) ? "Automatic: bold" : "Automatic: thin line";
  };
  const stitchSeg = (p) => seg("style", { ...STITCHES, auto: autoName(p) }, p.style || "auto");
  let moreOpen = false;
  $("st-edit").addEventListener("toggle", (e) => { if (e.target.matches("details.more")) moreOpen = e.target.open; }, true);
  const editor = () => api.keepFocus($("st-edit"), drawEditor);
  function drawEditor() {
    const p = current();
    $("st-center").hidden = !p; $("st-drag-hint").hidden = !p;   // (no piece, nothing to drag)
    // (no "Selected piece" heading over nothing: an empty design showed it with nothing under it)
    const box = $("st-edit").closest("fieldset"), head = box?.querySelector("legend")?.firstChild;
    if (box) box.hidden = !p && !pieces.length;
    if (head?.nodeType === 3) head.textContent = p ? "Selected piece " : "No piece selected ";
    if (!p) { $("st-edit").innerHTML = `<p class="hint">Tap a piece in the list above or on the preview to change it.</p>`; return; }
    let h = "";
    // (said when typing or pasting goes past the most a piece takes, `MAX_WORDS` in typed.js: a field's maxlength cut a
    // pasted 200-letter name to 60 without a word)
    const cutHint = `<p class="hint" data-cut-hint aria-live="polite" hidden></p>`;
    if (p.kind === "text") {
      const lines = p.text.split("\n").length, arc = p.shape === "up" || p.shape === "down";
      // (a new line first: the parser drops one straight after <textarea>, so words starting on a new line lost it on
      // every redraw)
      h += `<label class="field"><span>Words</span><textarea data-k="text" rows="${Math.min(3, lines)}" data-max="${MAX_WORDS}" autocomplete="off" spellcheck="false">\n${api.escapeHtml(p.text)}</textarea></label>`
        + `<p class="hint" data-lines-hint aria-live="polite" hidden>Three lines is the most: that new line became a space.</p>` + cutHint;
      // swashes are typed (~ at either end of the words); these put them on or take them off
      {
        const ls = p.text.split("\n").filter((l) => l.trim()), lead = swashes(ls[0] || "").lead, tail = swashes(ls[ls.length - 1] || "").tail;
        const kind = FONTS.find((f) => f.family === p.font)?.print ? "Dash" : "Swash";
        h += `<div class="seg swash" role="group" aria-label="${kind}es" title="Or type ~ at the start or end of the words">`
          + `<button type="button" data-swash="lead" aria-pressed="${lead}">${kind} before</button><button type="button" data-swash="tail" aria-pressed="${tail}">${kind} after</button></div>`;
      }
      h += `<label class="field"><span>Font</span>${fontSelect(p)}</label>`;
      h += range("size", "Height", 5, 60, p.size);
      h += `<p class="hint">About 10 mm for a pocket or cuff, 15-20 mm for a T-shirt's chest, 20-30 mm for a onesie, pillow or blanket corner, 30-50 mm for a towel.</p>`;
      h += seg("shape", TEXT_SHAPES, p.shape);
      h += stitchSeg(p);
      h += `<label class="field"><span>Motif either side</span><select data-k="deco"><option value="">None</option>${Object.entries(MOTIFS).map(([k, m]) => `<option value="${k}" ${k === p.deco ? "selected" : ""}>${m.name}</option>`).join("")}</select></label>`;   // (a heart or star either side was hidden under More)
      if (arc) {
        h += range("radius", "Curve width", 15, 80, p.radius);
        h += range("ry", "Curve height", 15, 80, p.ry ?? p.radius);
        if (followFrame(p, pieces)) h += `<button type="button" class="link" data-follow>Follow the frame</button>`;
      }
      if (p.shape === "wave") { h += range("amp", "Wave height", 2, 30, p.amp ?? Math.round(p.size * 0.35)); h += range("waves", "Waves", 1, 3, p.waves ?? 1, "", 0.5); }
      if (p.shape === "bridge") h += range("bulge", "Bulge", 10, 80, p.bulge ?? 30, "%", 5);
      // the rarer settings, folded away
      const print = FONTS.find((f) => f.family === p.font)?.print;
      const more = ''
        + (print ? range("spacing", "Letter spacing", -10, 40, p.spacing || 0, "%") + `<div data-pairs>${pairUI(p)}</div>` : "")
        + (p.shape === "straight" ? `<p class="hint">Press Enter in Words for a new line (up to 3).</p>` : "")
        + (p.shape === "straight" && lines > 1 ? seg("align", { left: "Left", center: "Centre", right: "Right" }, p.align || "center") + range("leading", "Line spacing", 80, 200, p.leading ?? 130, "%", 5) : "");
      h += `<details class="more" ${moreOpen ? "open" : ""}><summary>More</summary>${more}</details>`;
    } else if (p.kind === "monogram") {
      h += `<label class="field"><span>Initials</span><input type="text" data-k="letters" value="${api.escapeHtml(p.letters)}" data-max="${MAX_INITIALS}" autocomplete="off" spellcheck="false"></label>` + cutHint;
      h += `<p class="hint">Traditional order: first, LAST, middle. The middle letter is stitched biggest.</p>`;
      h += `<label class="field"><span>Font</span>${fontSelect(p)}</label>`;
      h += range("size", "Height", 15, 90, p.size);
      h += stitchSeg(p);
    } else if (p.kind === "motif") {
      h += `<div class="field"><span>Motif</span><div class="motifs" role="group" aria-label="Motif">${Object.entries(MOTIFS).map(([k, m]) => `<button type="button" data-motif="${k}" aria-pressed="${k === p.motif}" title="${m.name}"><svg viewBox="0 0 256 256" aria-hidden="true"><path d="${m.d}"/></svg></button>`).join("")}</div></div>`;
      h += range("size", "Size", 10, 120, p.size);
      h += seg("style", { fill: "Filled", outline: "Outline", applique: "Appliqué" }, p.style || "fill");
      if (p.style === "applique") h += `<p class="hint">Sews an outline, pauses for you to lay fabric on and trim it, then sews satin stitch round the edges. 50 mm or bigger cuts most easily.</p>`;
    } else if (p.kind === "letters") {
      h += `<label class="field"><span>Letters</span><input type="text" data-k="text" value="${api.escapeHtml(p.text)}" data-max="${MAX_INITIALS}" autocomplete="off" spellcheck="false"></label>` + cutHint;
      h += `<label class="field"><span>Font</span><select data-k="font">${APPLIQUE_FONTS.map((f) => `<option value="${f.family}" ${f.family === p.font ? "selected" : ""}>${f.name} (${f.note})</option>`).join("")}</select></label>`;
      h += range("size", "Height", 20, 120, p.size);
      h += `<p class="hint">Cut from fabric: the machine sews an outline, pauses for you to lay fabric on and trim it, then sews satin stitch round the edges. Letters 30 mm or taller cut and sew most easily.</p>`;
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
        // (what `carve` in pieces.js does, in plain words)
        h += `<p class="hint">Under a filled motif or big bold letters the fill is left out, so they don't sit on two layers of thread. Thinner letters sew on top of the fill.</p>`;
        // the expert fills, folded away: a stitch texture, and a second colour fading in across the patch
        h += `<details class="more" ${moreOpen ? "open" : ""}><summary>More</summary>${seg("pattern", Object.fromEntries(Object.entries(FILL_PATTERNS).map(([k, f]) => [k, f.name])), p.pattern || "tatami")}
          <label class="check small"><input type="checkbox" data-blend ${p.blend ? "checked" : ""}> Blend into a second colour</label>
          ${p.blend ? `<div class="swatches">${swatches(p, "blend")}</div><p class="hint">Fades from Brother ${nearestBrotherThread(p.fill).name} to ${nearestBrotherThread(p.blend).name} across the patch: one more thread change.</p>` : ""}</details>`;
      }
      if (p.border !== "patch") h += `<div class="field"><span>Quilting</span>${seg("quilt", QUILTS, p.quilt || "none")}</div>`
        + (p.quilt && p.quilt !== "none" ? `<p class="hint">Fills the frame around everything on it, in the frame's thread.</p>` : "");
      if (p.border === "ith") h += `<p class="hint">Two-sided, made in the hoop: an appliqué front, then the pieces below it in the list, then backing fabric under the hoop and a satin-stitch edge through everything. The steps are under “How to stitch it”.</p>`
        + `<label class="check small"><input type="checkbox" data-eyelet ${p.eyelet ? "checked" : ""}> Ribbon hole at the end (a bookmark, a tag)</label>`;
      // several of one in-the-hoop project at once: the same fabric steps, sewn together (`gang` in pieces.js)
      if (p.border === "ith" || p.border === "zip") h += `<button type="button" class="link" data-two-up>Make another in the hoop</button> <span class="hint">Copies it and what's on it beside it: both sew in the same steps.</span>`;
      if (p.border === "applique") h += `<p class="hint">Sews an outline, pauses for you to lay fabric on and trim it, then covers the edge in satin stitch. The steps are under “How to stitch it”.</p>`;
    } else {
      // a design file is resized as Open a design resizes it: re-stitched at the new size (`resizeFile`), so it can
      // shrink with the words added to it (it could only be moved and turned: Fit to hoop shrank just the words)
      const pct = Math.round((p.scale || 1) * 100);
      h += `<label class="range"><span>Size</span><input type="range" data-file-scale min="${FILE_SCALE[0] * 100}" max="${FILE_SCALE[1] * 100}" step="1" value="${pct}"><output>${fileSize(p, pct / 100)}</output></label>`;
      h += `<p class="hint">${api.escapeHtml(p.name)}: ${p.pending ? "re-stitching it at this size…" : pct === 100 ? "its stitches exactly as they are in the file." : `made ${pct < 100 ? "smaller" : "bigger"} from its own stitches, spaced as closely as the file had them.`}</p>`;
    }
    if (p.kind === "text" || p.kind === "monogram") h += `<p class="hint" data-fit hidden></p>`;
    if (p.kind !== "frame") h += `<p class="hint warn" data-warn aria-live="polite" hidden></p>`;
    h += range("rot", "Turn", -180, 180, p.rot || 0, "°", 5);
    if (p.kind !== "file") h += `<div class="field"><span>Thread</span><div class="swatches">${swatches(p)}</div><p class="hint">Brother ${nearestBrotherThread(p.color).name}${api.spool(p.color) ? ` · ${api.escapeHtml(api.spool(p.color))}` : ""}</p></div>`;
    const old = drawnId === p.id && $("st-edit").querySelector("[data-warn]");
    $("st-edit").innerHTML = h; drawnId = p.id;
    // (lettering not worked out yet, after a font change: the warnings a moment later, after the preview, the last ones
    // kept up meanwhile; worked out here the menu held for 0.8 s)
    const w = $("st-edit").querySelector("[data-warn]");
    if (bulkReady(p) || !w) { warn(); return; }
    if (old) { w.innerHTML = old.innerHTML; w.hidden = old.hidden; }
    clearTimeout(warnTimer); warnTimer = setTimeout(warn, 300);
  }
  let drawnId = null;
  function ui() { api.keepFocus($("panel-design"), () => { list(); editor(); sewnOn(); }); }
  function sewnOn() {
    $("st-fabric").innerHTML = Object.entries(FABRICS).map(([k, f]) => `<button type="button" data-fab="${k}" aria-pressed="${k === fabric}">${f.name}</button>`).join("");
    $("st-baste").checked = baste; $("st-fabric-tip").textContent = fabricTip(); $("st-fabric-name").textContent = FABRICS[fabric].name + (baste ? ", basted" : "");
    // (numeric keys come first in an object, so the order is spelled out)
    $("st-thread").innerHTML = `<span class="chips-label">Thread</span>` + ["auto", "30", "40", "60"].map((k) => `<button type="button" data-thread="${k}" aria-pressed="${k === thread}" title="${WT_TITLE[k]}">${THREADS[k].name}</button>`).join("");
    $("st-thread-tip").textContent = THREADS[thread].tip; $("st-thread-name").textContent = thread === "auto" ? "" : `, ${THREADS[thread].name} thread`;
  }
  // a project that brings its own fabric (a patch's felt, an in-the-hoop project's pieces, a quilt sandwich): "Sewing on"
  // says what the choice still changes, not that fabric's stabilizer advice (Knit on a quilt block changed no stitch
  // and still said to hoop cut-away). Knit and towel change only lettering and a patch's fill; the rest only advice.
  function ownBase() {
    const f = pieces.filter((p) => p.kind === "frame");
    if (f.some((p) => p.border === "patch")) return "A patch is sewn on its own felt or twill (see Have ready)";
    if (f.some((p) => p.border === "ith" || p.border === "zip")) return "An in-the-hoop project is sewn on the fabric in its Have ready list";
    if (f.some((p) => p.quilt === "stipple" || p.quilt === "echo")) return "Quilting is sewn through a quilt sandwich (see Have ready)";
    return "";
  }
  function lettered() { return pieces.some((p) => p.kind === "text" || p.kind === "monogram"); }
  function fabricTip() {
    const base = ownBase(); if (!base) return FABRICS[fabric].tip;
    const what = [(fabric === "knit" || fabric === "towel") && lettered() ? "the lettering" : "", fabric === "knit" && pieces.some((p) => p.kind === "frame" && p.border === "patch") ? "the patch's fill" : ""].filter(Boolean);
    return what.length ? `${base}, so ${FABRICS[fabric].name} only changes how ${what.join(" and ")} ${what.length > 1 ? "are" : "is"} sewn${fabric === "towel" ? " (bold, on a light base)" : " (to suit a knit)"}.`
      : `${base}, so the fabric chosen here doesn't change the stitches.`;
  }
  $("st-fabric").onclick = (e) => { const b = e.target.closest("[data-fab]"); if (!b || b.dataset.fab === fabric) return; remember(); fabric = b.dataset.fab; save(); sewnOn(); make(); warn(); };
  $("st-thread").onclick = (e) => { const b = e.target.closest("[data-thread]"); if (!b || b.dataset.thread === thread) return; remember(); thread = b.dataset.thread; save(); sewnOn(); make(); };
  $("st-baste").onchange = (e) => { remember(); baste = e.target.checked; save(); sewnOn(); make(); };
  // What's wrong with piece p, as every surface says it: { list: [{ id, kind, level, text, piece }], d: what was
  // measured, for the editor's fixes }. The editor shows the list with a one-tap fix each; make() puts every piece's in
  // the view's problems (words.js), so beside Download, the download dialog, the steps, the sew sheet, the share text
  // and Sew along say the same (a fleece "Lily" that closes up was said only in the editor, under a green "Checked";
  // a too-small motif, a tight arch, letters pushed together and a thin line were said only there).
  const MOTIF_LEAST = { fill: 25, outline: 30, applique: 30 };
  function pieceProblems(p, fit = fittedSizes(pieces)) {
    const list = [], L = label(p), add = (kind, level, text, id = `${kind}:${p.id}`) => list.push({ id, kind, level, text, piece: p.id });
    const fs = fit.get(p.id), q = fs ? { ...p, size: fs } : p, lettering = p.kind === "text" || p.kind === "monogram";
    const d = { fs, q, lettering, max: p.kind === "monogram" ? 90 : 60, onTowel: fabric === "towel" && lettering, m: 0, towel: 0, fills: 0, room: null, nears: [], near: null, gone: [], pushed: [], rows: 0, thin: false, cover: null, better: "" };
    if (p.kind === "frame") return { list, d };
    // Lettering with no words sews nothing, and lettering that draws nothing (words past the most it takes, in a crafted
    // design) is left out of the file: both said, never a file without the words asked for.
    const words = p.kind === "monogram" ? p.letters : p.kind === "text" ? unswashed(p.text) : p.kind === "letters" ? p.text : null;
    if (words !== null && !/[^\s]/u.test(words || "")) {
      add("empty", LOOK, p.kind === "monogram" ? "A monogram has no initials yet: type them, or remove it." : "A lettering piece has no words yet: type some, or remove it.");
      return { list, d };
    }
    if (words !== null && !pieceStitches(q).length) add("undrawn", BLOCK, `${L} comes out as no stitches at all: use fewer or other letters.`);
    d.m = minSize(q); d.room = archRoom(p); d.nears = touchingAll(q, pieces); d.near = d.nears[0] || null; d.fills = loopsFill(q);
    d.gone = missing(p.text ?? p.letters ?? "", p.font); d.thin = fineLine(q);
    d.towel = d.onTowel ? towelMin(d.m ? { ...q, size: d.m } : q) : 0;
    d.cover = underPatch(p, pieces);
    const base = p.kind !== "file" && underPatch(p, pieces, true), lost = !!base && hard(p.color, base.fill || base.color);
    d.better = lost ? against(base, pieces) : "";
    d.pushed = p.kind === "text" ? overlapping(p) : [];
    d.rows = p.kind === "text" ? p.text.split("\n").filter((l) => l.trim()).length : 0;
    if (p.kind === "monogram") {
      const t = initials(p.letters), word = t.join("");
      if (t.length > 3) add("named", LOOK, `${L} has ${t.length} letters: a monogram sews 3 initials at most.`);
      else if (/^\p{Lu}\p{Ll}{2,}$/u.test(word)) add("named", LOOK, `${L} looks like a name: a monogram sews initials, so it won't read as “${word}”.`);
    }
    if (d.rows > 1 && (p.shape || "straight") !== "straight") add("lines", LOOK, `${L} is sewn on one line: ${TEXT_SHAPES[p.shape]} joins its ${d.rows} lines.`);
    if (d.cover) add("covered", LOOK, `${L} sews before the patch that covers it.`);
    if (lost) add("hidden", LOOK, `${L} is nearly the same thread as the patch under it, so it won't show.`);
    if (d.pushed.length) add("pushed", LOOK, `${L} has letters pushed into each other: their stitches would pile up as a lump.`);
    const style = p.style || "fill", least = p.kind === "motif" ? MOTIF_LEAST[style] || 0 : 0;
    if (least && p.size < least) add("motif", LOOK, style === "fill" ? `${L} is too small to fill: the detail closes up.` : style === "outline" ? `${L} is too small as an outline: the edges run together.` : `${L} is too small for appliqué: the fabric piece is tiny and the edges run together.`);
    if (d.gone.length) add("missing", LOOK, `The font of ${L} has no ${lackList(d.gone)}: ${d.gone.length === 1 ? "it" : "they"} would be stitched in a stand-in letter.`);
    if (d.towel > d.max || (!d.m && d.towel > q.size * 1.04)) add("towel", LOOK, `${L} closes up on a towel or fleece.`);
    else if (d.m) add("small", LOOK, `${L} is too small to stitch cleanly.`);
    if (d.room?.full) add("arch", BLOCK, `${L} runs into itself round the curve.`);
    else if (d.room || archTight(p)) add("arch", LOOK, d.room ? `${L} wraps most of the way round its curve.` : `${L} is too tall for its curve: the letters would bunch up.`);
    // (a pair is one problem, said once, whichever of the two is selected)
    for (const o of d.nears) { const [a, b] = pieces.indexOf(p) < pieces.indexOf(o) ? [p, o] : [o, p]; add("runs", LOOK, `${label(a)} runs into ${label(b)}.`, `runs:${a.id}-${b.id}`); }
    const plain = !d.m && !d.towel && fabric !== "towel";
    if (plain && d.thin) add("thin", TIP, `${L} sews as a thin line at this size.`);
    if (plain && d.fills) add("loops", LOOK, `${L} has small loops that fill in at this size.`);
    return { list, d };
  }
  // too-small lettering, said plainly (updated in place so typing keeps focus)
  async function warn() {
    const w = $("st-edit").querySelector("[data-warn]"), p = current(); if (!w || !p) return;
    if (p.font) try { await loadFont(p.font); } catch { return; }
    const fit = $("st-edit").querySelector("[data-fit]"), fs = fittedSizes(pieces).get(p.id);
    if (fit) {
      // (in a tall frame, turned a quarter to run up it, as letters on a key fob do: offered when that's much bigger;
      // three initials on the 44 × 80 mm fob were 9.5 mm across it, 18 up it)
      const up = fs ? runUp(p, fs) : 0;
      fit.hidden = !fs; fit.innerHTML = fs ? `Shrunk to ${fs} mm so it fits inside the frame.${up ? ` Turned to run up the frame it can be ${up} mm: <button type="button" class="link" data-run-up="${up}">Turn it to run up the frame</button>` : ""}` : "";
    }
    // what's wrong with it, worked out once (`pieceProblems`) as every other surface says it; here each with its fix
    const { list, d } = pieceProblems(p), { q, m, room, nears, near, gone, fills, towel, max, lettering, onTowel } = d;
    const ids = (kind) => list.filter((x) => x.kind === kind).map((x) => x.id).join(" ");
    const tag = (kind, html) => (html && ids(kind) ? `<span data-problem="${ids(kind)}">${html}</span>` : "");
    // Every one-tap fix is checked before it's offered: it must leave nothing it could have avoided (a towel size that
    // took the design past the hoop, a size the frame fit shrank straight back, two taps where one would do).
    // The size the letters need: big enough to stitch cleanly and, on a towel, for the loops to stay open
    // (within 4 % of it isn't worth a warning: the towel starter's own 32 mm asked for 33 for "The Smiths").
    const need = towel > max ? 0 : towel && (m || towel > q.size * 1.04) ? towel : m;
    const btn = (attrs, text, l) => `<button type="button" class="link" ${attrs}${l?.fits === "turn" ? " data-turn" : ""}>${text}${l?.fits === "turn" ? " and turn the hoop" : ""}</button>`;
    const cotton = onTowel ? ` A flat-weave tea towel (no loops) can be sewn as Cotton: ${btn(`data-fab-set="cotton"`, "Sew it as Cotton")}` : "";
    let size = "";
    if (towel > max) size = `On a towel or fleece the stitches are made wide so they sit on top of the loops, and that closes these letters up even at the biggest size. Try a bolder font, like Yellowtail or Satisfy.${cotton}`;
    else if (need) {
      const what = m ? `These letters are too small to stitch cleanly${need > m ? ` (on a towel or fleece they need to be ${need} mm, so the wide stitches that sit on top of the loops leave the letters open)` : ""}.` : `On a towel or fleece the stitches are made wide so they sit on top of the loops, and at this size that closes the letters up: ${need} mm or more keeps them open.`;
      if (fs) {   // (the frame fit sets the size: a bigger size would be shrunk straight back, the "Make it 10 mm" loop)
        // two lines, at the biggest size (up to the one asked for) that fits the frame and clears everything else
        const two = twoLines(p);
        let at2 = 0;
        for (let t = p.size; two && t >= 5 && !at2; t -= 0.5) {
          const r = { ...p, text: two, size: t }, ps2 = pieces.map((o) => (o.id === p.id ? r : o)), s2 = fittedSizes(ps2).get(p.id) ?? t;
          if (minSize({ ...r, size: s2 }) || (onTowel && towelMin({ ...r, size: s2 }) > s2 * 1.04)) break;
          if (!touching({ ...r, size: s2 }, ps2)) at2 = t;
        }
        // or the frame made bigger by as much, where that lands (a towel monogram's R filled in, with no way out but
        // "make the frame bigger")
        const host = !at2 && frameOf(p), grow = host ? frameFor(p, host, need) : null;
        const bigger = grow ? btn(`data-frame-grow="${host.id}:${grow.w}:${grow.h}:${need}"`, `Make the frame ${grow.w} mm`, grow) : "";
        size = `Shrunk to fit inside the frame, ${what[0].toLowerCase() + what.slice(1)} ${at2 ? `${btn(`data-lines="${at2}"`, "Put it on two lines")} or make the frame bigger.`
          : bigger ? `${bigger}${p.kind === "monogram" ? "" : ", or use fewer words"}.` : p.kind === "monogram" ? "Make the frame bigger, or use a bolder font." : "Use fewer words, or make the frame bigger."}`;
      } else if (need > max) size = `${what} Use fewer or shorter words, or a bolder font.`;
      else {
        const l = landing(p, sizeChange(p, need));
        size = l.fits ? `${what} ${btn(`data-size="${need}"`, `Make it ${need} mm`, l)}`
          : l.hit ? `${what} At ${need} mm it would ${l.out ? "go outside" : "run into"} ${api.escapeHtml(label(l.hit))}: give it more room first.`
          : `${what} At ${need} mm it would be ${l.w.toFixed(0)} × ${l.h.toFixed(0)} mm, too big for the hoop even turned. Use fewer or shorter lines${onTowel ? ", or a bolder font (Yellowtail, Satisfy)." + cotton : "."}`;
      }
    }
    // an arch too tight or wrapped too far round: a wider curve, or smaller letters, whichever lands in the hoop
    let arc = "";
    if (ids("arch")) {
      const widen = { ...(room || {}), ...(archFit({ ...p, ...(room || {}) }) || {}) }, wl = Object.keys(widen).length ? landing(p, widen) : null;
      const sh = archShrink(p), sl = sh ? landing(p, { size: sh }) : null;
      const fixes = [wl?.fits ? btn("data-room", "Widen the curve", wl) : "", sl?.fits ? btn(`data-size="${sh}"`, `Make the letters ${sh} mm`, sl) : ""].filter(Boolean);
      arc = (room ? `The words wrap most of the way round the curve${room.full ? " and run into themselves" : ""}.` : "The curve is too tight for letters this tall: they'd bunch up.")
        + (fixes.length ? " " + fixes.map((f, i) => (i ? f.replace(">Make", ">make") : f)).join(" or ")
          : wl?.hit ? ` A curve wide enough would ${wl.out ? "go outside" : "run into"} ${api.escapeHtml(label(wl.hit))}: use fewer words.`
          : wl ? ` A curve wide enough would be ${wl.w.toFixed(0)} × ${wl.h.toFixed(0)} mm, too big for the hoop: use fewer words.` : " Use fewer words.");
    }
    // run into another piece: the size that clears it (lettering centred in a frame isn't dragged apart, it's made smaller)
    let hit = "";
    if (near) {
      // (the frame it's on: the nearest earlier one whose box holds its middle)
      const host = pieces.slice(0, pieces.indexOf(p)).reverse().find((f) => f.kind === "frame" && Math.abs(p.x - f.x) < f.w / 2 && Math.abs(p.y - f.y) < (f.shape === "circle" ? f.w : f.h) / 2);
      const inside = host && host.id === near.id, frameName = host && api.escapeHtml(label(host).toLowerCase());
      // (checked like every other fix: clear of the frame at 19 mm, a monogram ran into the R beside it instead)
      const cs = ((c) => (c && landing(p, { size: c }).fits === "fits" && !touchingAll({ ...q, size: fittedSizes(pieces.map((o) => (o.id === p.id ? { ...p, size: c } : o))).get(p.id) ?? c }, pieces).length ? c : 0))(lettering || p.kind === "motif" ? clearSize(p, pieces, near) : 0);
      // (no size clears it: a spot in the frame that does, at a size that fits there, else no advice that can't work;
      // "Make it smaller." with no button sat under a monogram across a pouch's zipper)
      const to = host && !cs ? spotIn(p, true) : null, zip = host?.border === "zip";
      const move = to ? btn("data-move", `Move it ${zip ? "below the zipper" : `to the free space in the ${frameName}`}${to.size !== (d.fs ?? p.size) ? `, ${to.size} mm` : ""}`) : "";
      const full = host ? `There's no free space for it in the ${frameName}: make the frame bigger, or take something out.` : "";
      // (or, at the size it is, to free room beside what it runs into: a motif made bigger over the name under it had
      // only "Drag it apart", as did a design file)
      const away = !inside && !to ? moveAway(p, near) : null;
      const go = away ? btn(`data-move-to="${away.x},${away.y}"`, `Move it ${away.where}`, away.l) : "";
      hit = inside ? `This runs into the ${frameName} around it${zip ? " (the zipper and its stitching are across the top)" : ""}. ${cs ? btn(`data-size="${cs}"`, `Make it ${cs} mm`) : move || full}`
        : `This runs into ${api.escapeHtml(and(nears.map((o) => label(o))))}. ${cs || go ? `${[cs ? btn(`data-size="${cs}"`, `Make it ${cs} mm`) : "", go].filter(Boolean).map((b, i) => (i ? b.replace(">Move", ">move") : b)).join(", ")} or drag it apart.` : move ? `${move}, or drag it apart.` : full || "Drag it apart."}`;
    }
    // a motif too small for its style: filled, the detail closes up under 25 mm; as an outline or appliqué the satin
    // edges run together under 30 mm (a 15 mm butterfly's antennae merged, a house's window filled in, and the
    // appliqué fabric piece was 7 mm across). Outline was offered as the way out for a small filled one: it's worse.
    let small = "";
    if (ids("motif")) {
      const style = p.style || "fill", least = MOTIF_LEAST[style], l = landing(p, { size: least });
      small = `${style === "fill" ? "Filled this small, the detail closes up." : style === "outline" ? "As an outline this small, the edges run together and the detail fills in." : "As appliqué this small, the fabric piece is tiny to cut and the edges run together."} `
        + (l.fits ? btn(`data-size="${least}"`, `Make it ${least} mm`, l) : `Move it where there's room, then make it ${least} mm or more.`);
    }
    // (a bigger size for loops that fill in is offered only when it lands, like every other fix)
    const fillsAt = ids("loops") && fills <= 3 * q.size ? landing(p, sizeChange(p, fills)) : null;
    // a name typed as initials ("Max" sewed as a first/LAST/middle monogram, "MaX" with a big a): as lettering instead
    let named = "";
    if (ids("named")) {
      const t = initials(p.letters), word = t.join("");
      named = (t.length > 3 ? `A monogram has 3 initials at most, so only “${api.escapeHtml(t.slice(0, 3).join(""))}” would be sewn.`
        : `“${api.escapeHtml(word)}” looks like a name: a monogram sews initials (first, LAST, middle) with the middle one biggest, so it wouldn't read as “${api.escapeHtml(word)}”.`)
        + ((l) => (l.fits ? ` ${btn("data-as-text", `Sew “${api.escapeHtml(p.letters.trim())}” as lettering`, l)}`
          : ` Sewn as lettering it would ${l.out ? "go outside" : l.hit ? `run into ${api.escapeHtml(label(l.hit))}` : "be too big for the hoop"}: make it smaller first.`))(landing(p, asLettering(p)));
    }
    // under a patch that sews after it (hidden), or sewn on a patch in nearly the same thread (it won't show)
    const under = d.cover ? `The ${api.escapeHtml(label(d.cover).toLowerCase())} patch sews after this and would cover it. <button type="button" class="link" data-after="${d.cover.id}">Sew it after the patch</button>` : "";
    const same = `This is nearly the same thread as the patch under it, so it wouldn't show.${d.better ? ` <button type="button" class="link" data-color-set="${d.better}">Use ${api.escapeHtml(nearestBrotherThread(d.better).name)}</button>` : " Pick a thread that stands out from it."}`;
    // letter pairs pushed into each other
    const kerned = d.pushed.length ? `The letters ${d.pushed.map((i) => `“${api.escapeHtml(p.text[i] + p.text[i + 1])}”`).join(", ")} are pushed into each other: their stitches would pile up as a lump. ${d.pushed.map((i) => `<button type="button" class="link" data-kern-off="${i}">Space ${api.escapeHtml(p.text[i] + p.text[i + 1])} as the font does</button>`).join(" ")}` : "";
    // lines typed into a curved shape (they're joined into one line: a 3-line text on a wave came out 203 mm long
    // with nothing said)
    // (offered where the lines then land: straight, "Lily / Rose" on two lines ran into the "Emma" under it)
    const straight = ids("lines") ? landing(p, { shape: "straight" }) : null;
    const oneLine = straight ? `${TEXT_SHAPES[p.shape]} sews the words on one line, so the ${d.rows} lines are joined into one. ${straight.fits ? `${btn(`data-seg-set="shape:straight"`, "Make it straight", straight)} to keep the lines.` : `Straight, the lines would ${straight.out ? "go outside" : straight.hit ? `run into ${api.escapeHtml(label(straight.hit))}` : "be too big for the hoop"}: give it more room first.`}` : "";
    // (a style change is checked too: bold is wider, and "Make it bold" ran “Emma” into the “Emma” beside it)
    const no = (l) => `${l.out ? "go outside" : l.hit ? `run into ${api.escapeHtml(label(l.hit))}` : "be too big for the hoop"}`;
    const bold = ids("thin") ? landing(p, { style: "satin" }) : null, line = ids("loops") ? landing(p, { style: "line" }) : null;
    // (too small, thin, or loops filling on one long line, as Fit to hoop leaves a long name: two lines may be much
    // bigger; said with the problem it fixes)
    const lines = !d.fs && (m || fills || (d.thin && fabric !== "towel")) ? ((c) => (c ? ` On ${c.n === 2 ? "two" : "three"} lines${c.turn ? " with the hoop turned" : ""} it can be ${c.size} mm. ${btn(`data-lines="${c.size}" data-text="${encodeURIComponent(c.text)}"`, `Put it on ${c.n === 2 ? "two" : "three"} lines`, { fits: c.turn ? "turn" : "fits" })}` : ""))(lineChoice(p)) : "";
    const withLines = ["small", "towel", "loops", "thin"].find((k) => ids(k));
    // (said plainly, with a one-tap fix where there is one; each item names the problem it's about, `data-problem`)
    const said = { named, lines: oneLine, covered: under, hidden: same, pushed: kerned, motif: small,
      missing: gone.length ? `This font has no ${api.escapeHtml(lackList(gone))}: ${gone.length === 1 ? "it" : "they"} would be stitched in a stand-in letter. Take ${gone.length === 1 ? "it" : "them"} out or try another font.` : "",
      small: size, towel: size, arch: arc, runs: hit,
      empty: p.kind === "monogram" ? "No initials yet: type them above, or remove this piece." : "No words yet: type some above, or remove this piece.",
      undrawn: "These words come out as no stitches at all: use fewer or other letters.",
      thin: bold && `At this size it sews as a thin line.${bold.fits ? ` ${btn(`data-seg-set="style:satin"`, "Make it bold", bold)} (small loops may fill in).` : ` Bold, it would ${no(bold)}.`}`,
      loops: line && `At this size the small loops (the holes in letters like b and e) fill in.${line.fits ? ` ${btn(`data-seg-set="style:line"`, "Thin line", line)} keeps them open` : ""}${fillsAt?.fits ? `${line.fits ? ", or" : ""} ${btn(`data-size="${fills}"`, `${line.fits ? "make" : "Make"} it ${fills} mm`, fillsAt)}` : ""}${line.fits || fillsAt?.fits ? "." : ""}` };
    w.innerHTML = [...new Set(list.map((x) => x.kind))].map((k) => tag(k, said[k] + (k === withLines ? lines : ""))).filter(Boolean).join(" <br>");   // (a space too: read aloud or copied, "lines.On two lines")
    w.hidden = !w.innerHTML;
    const auto = $("st-edit").querySelector('[data-seg="style"] [data-v="auto"]');
    if (auto) auto.textContent = autoName(p);
  }
  // the size (0.5 mm) p can be turned a quarter (reading up) in the tall frame it's shrunk into, inside its outline by
  // 4 mm and running into nothing; 0 when that isn't at least a third bigger than `fs`
  function runUp(p, fs) {
    const f = pieces.slice(0, pieces.indexOf(p)).reverse().find((o) => o.kind === "frame" && Math.abs(p.x - o.x) < o.w / 2 && Math.abs(p.y - o.y) < o.h / 2);
    if (!f || p.rot || f.rot || f.shape === "circle" || f.h < 1.4 * f.w || (p.kind === "text" && (p.shape || "straight") !== "straight")) return 0;
    const ok = (sz) => { const q = { ...p, rot: -90, size: sz }; return inFrame(q, f, 4) && !touching(q, pieces); };
    let lo = fs * 1.33, hi = Math.min(p.kind === "monogram" ? 90 : 60, Math.max(p.size, fs * 3));
    if (!ok(lo)) return 0;
    while (hi - lo > 0.5) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
    return Math.floor(lo * 2) / 2;
  }
  // frame f made big enough (up to half as big again) for p to be sewn at `need` inside it, the layout still in the
  // hoop: { w, h, fits } (fits "fits" or "turn", as `landing`), or null
  function frameFor(p, f, need) {
    const hp = api.hoop(), fw = hp.w - 5, fh = hp.h - 5, H = f.shape === "circle" ? f.w : f.h;
    for (let k = 1.02; k <= 1.5; k += 0.02) {
      const g = { ...f, w: Math.ceil(f.w * k), h: Math.ceil(H * k) }, q = { ...p, size: Math.max(p.size, need) };
      const ps = pieces.map((o) => (o.id === f.id ? g : o.id === p.id ? q : o));
      if ((fittedSizes(ps).get(p.id) ?? q.size) < need) continue;
      const [w, h] = layoutSize(ps), fits = w <= fw && h <= fh ? "fits" : w <= fh && h <= fw ? "turn" : null;
      if (!fits || touching(q, ps)) return null;
      return { w: g.w, h: g.h, fits };
    }
    return null;
  }
  // frame f (a circle) centred on everything there and just big enough to hold it all 6 mm inside its line (about
  // 4 mm of fabric inside the border), as long as the hoop takes it; else as it was
  function roundAll(f) {
    const bs = pieces.map(pieceBounds).filter(Boolean); if (!bs.length) return;
    const x = (Math.min(...bs.map((b) => b[0])) + Math.max(...bs.map((b) => b[2]))) / 2, y = (Math.min(...bs.map((b) => b[1])) + Math.max(...bs.map((b) => b[3]))) / 2;
    const hp = api.hoop(), most = Math.min(hp.w, hp.h) - 8;
    for (let w = 30; w <= most; w += 2) {
      const g = { ...f, x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2, w, h: w };
      if (pieces.every((o) => inFrame(o, g, 6))) { Object.assign(f, { x: g.x, y: g.y, w, h: w }); return; }
    }
  }
  // the frame p sits in: the nearest earlier one whose box holds its middle
  const frameOf = (p) => pieces.slice(0, pieces.indexOf(p)).reverse().find((f) => f.kind === "frame" && Math.abs(p.x - f.x) < f.w / 2 && Math.abs(p.y - f.y) < (f.shape === "circle" ? f.w : f.h) / 2);
  // p at the size it is, moved to the nearest free room (`freeRoom`, with p itself out of the way) that runs into
  // nothing and keeps one hooping; said by where it goes from `other`: { x, y, where, l } or null
  function moveAway(p, other) {
    const keep = pieces, fs = fittedSizes(pieces).get(p.id);
    if (fs) return null;   // (sized by its frame: moving it out of the frame isn't the fix)
    let r;
    try { pieces = pieces.filter((o) => o.id !== p.id); r = freeRoom({ ...p }, null, true); } finally { pieces = keep; }
    if (!r || (p.size != null && r.size !== p.size)) return null;
    const l = landing(p, { x: r.x, y: r.y });
    if (!l.fits) return null;
    const a = pieceBounds({ ...p, x: r.x, y: r.y }), b = pieceBounds(other);
    const nm = api.escapeHtml(other.kind === "motif" || other.kind === "frame" ? `the ${label(other).toLowerCase()}` : label(other));
    const where = !a || !b ? "to free space" : a[1] >= b[3] - 1 ? `below ${nm}` : a[3] <= b[1] + 1 ? `above ${nm}` : `beside ${nm}`;
    return { x: r.x, y: r.y, where, l };
  }
  const and = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] || "");
  // what a one-tap change to p would leave: { w, h, fits: "fits" (as the hoop is now), "turn" (only with the hoop
  // turned the other way) or null (too big either way) }
  // (a fix that runs the piece into something it was clear of doesn't count as fitting: a ring's arch widened past
  // its own frame)
  function landing(p, change) {
    const q = { ...p, ...change }, ps = pieces.map((r) => (r.id === p.id ? q : r)), [w, h] = layoutSize(ps), hp = api.hoop();
    const fw = hp.w - 5, fh = hp.h - 5;   // (the field less its 2 mm margins, and 1 mm for the locks)
    // (every piece it then runs into, not only the first: "Make it 5 mm" ran "QUALITY" into the anchor and the flower
    // beside the "Since 2006" it already touched)
    const fit = fittedSizes(ps).get(p.id), f0 = fittedSizes(pieces).get(p.id), was = new Set(touchingAll(f0 ? { ...p, size: f0 } : p, pieces).map((o) => o.id));
    const hit = touchingAll(fit ? { ...q, size: fit } : q, ps).find((o) => !was.has(o.id));
    if (hit) return { w, h, fits: null, hit };
    // nor one that takes it out of the frame it sat in (the same ring's words widened outside the circle)
    const inside = (a, b) => a && b && a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
    const b0 = pieceBounds(f0 ? { ...p, size: f0 } : p), b1 = pieceBounds(fit ? { ...q, size: fit } : q);
    const out = pieces.find((f) => f.kind === "frame" && f.id !== p.id && inside(b0, pieceBounds(f)) && !inside(b1, pieceBounds(f)));
    if (out) return { w, h, fits: null, hit: out, out: true };
    return { w, h, fits: w <= fw && h <= fh ? "fits" : w <= fh && h <= fw ? "turn" : null };
  }
  // a monogram that was given a name, made lettering: same font, thread and place, at the size that fits its frame
  // (checked like any fix before it's offered: "ABCD" as lettering took the design past the hoop)
  function asLettering(p) {
    const t = { id: p.id, x: p.x, y: p.y, color: p.color, kind: "text", text: p.letters.trim(), font: p.font, size: Math.min(60, p.size), shape: "straight", radius: 30,
      ...(p.rot ? { rot: p.rot } : {}), ...(p.flip ? { flip: true } : {}), ...(p.style && p.style !== "auto" ? { style: p.style } : {}) };
    const fs = fittedSizes(pieces.map((o) => (o.id === p.id ? t : o))).get(t.id); if (fs) t.size = fs;
    return { ...t, letters: undefined };
  }
  function asText(turn) {
    const p = current(); if (!p || p.kind !== "monogram") return;
    remember(); fitted = false;
    const { letters, ...t } = asLettering(p);
    pieces[pieces.indexOf(p)] = t;
    if (turn) { api.setTurn(!api.turned()); api.fit(); }
    save(); ui(); make();
  }
  // a piece the patch after it would cover goes just after that patch (`underPatch`)
  function sewAfter(id) {
    const p = current(), i = pieces.indexOf(p), j = pieces.findIndex((o) => o.id === id); if (!p || j < i) return;
    remember(); pieces.splice(i, 1); pieces.splice(j, 0, p);
    save(); ui(); make();
  }
  // threads that are hard to tell apart on each other: nearly the same lightness, or the same Brother thread
  const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hard = (a, b) => ratio(a, b) < 1.6 || nearestBrotherThread(a).name === nearestBrotherThread(b).name;
  // a thread that shows on patch f: what's already sewn on it, then its edge, else white or black
  function against(f, ps) {
    const under = f.fill || f.color;
    const on = ps.filter((o) => o.kind !== "frame" && o.kind !== "file" && underPatch(o, ps, true)?.id === f.id).map((o) => o.color);
    return [...on, f.color].find((c) => ratio(c, under) >= 3) || (ratio(WHITE, under) >= ratio(BLACK, under) ? WHITE : BLACK);
  }
  // Letter pairs (kern) pushed closer than the font has them until their stitches meet: the indices. The letters are
  // drawn as the lettering engine places them, the first grown by how far a satin can reach past the ink (half a
  // column where a stroke ends square across a slanted foot, and 0.3 mm), and counted where it then covers the second:
  // AV at -20 % in Josefin was 1.8 mm apart as ink but sewed as one lump.
  const inkA = document.createElement("canvas"), inkB = document.createElement("canvas");
  function overlapping(p) {
    if (!p.kern || !FONTS.find((f) => f.family === p.font)?.print || !document.fonts.check(`40px "${p.font}"`)) return [];
    const PX = 100, W = 3 * PX, H = 2 * PX, line = p.text.split("\n")[0];
    probe.font = `${PX}px "${p.font}"`; probe.fontKerning = "normal";
    const m = probe.measureText(line), mmPx = p.size / Math.max(1, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
    const lm = letterMetrics(line, p.font, fittedSizes(pieces).get(p.id) ?? p.size, p.style), grow = Math.ceil((Math.max(lm.satinW || 0, lm.stroke || 0) / 2 + 0.3) / mmPx);
    const ink = (c, ch, x) => {
      c.width = W; c.height = H; const g = c.getContext("2d", { willReadFrequently: true });
      g.font = `${PX}px "${p.font}"`; g.fontKerning = "normal"; g.fillText(ch, x, 1.4 * PX);
      const d = g.getImageData(0, 0, W, H).data, out = new Uint8Array(W * H);
      for (let i = 0; i < out.length; i++) out[i] = d[4 * i + 3] > 128 ? 1 : 0;
      return out;
    };
    // (grown as a square, rows then columns)
    const dilate = (a, r) => {
      const t = new Uint8Array(a.length), o = new Uint8Array(a.length);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[y * W + x]) for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r); k++) t[y * W + k] = 1;
      for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (t[y * W + x]) for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r); k++) o[k * W + x] = 1;
      return o;
    };
    const both = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) n += a[i] & b[i]; return n; };
    return Object.entries(p.kern).filter(([, v]) => v < 0).map(([k]) => +k).filter((i) => {
      const a = p.text[i], b = p.text[i + 1]; if (!a || !b || /\s/.test(a + b)) return false;
      const at = PX / 2 + probe.measureText(a + b).width - probe.measureText(b).width + ((p.spacing || 0) / 100) * PX, A = dilate(ink(inkA, a, PX / 2), grow);
      const now = both(A, ink(inkB, b, at + (p.kern[i] / 100) * PX)), was = both(A, ink(inkB, b, at));
      return now > was + 10;
    }).sort((x, y) => x - y);
  }
  // a size, and the curve an arched word then needs (what the size button does)
  const sizeChange = (p, size) => { const s = Math.min(size, p.kind === "monogram" ? 90 : 60); return { size: s, ...(archFit({ ...p, size: s }) || {}) }; };
  // the biggest size (0.5 mm, up to 60) p fits the hoop at on two lines (`twoLines`), running into nothing new; 0 when
  // that isn't at least a quarter bigger than now (Fit to hoop made "Mrs. Lee" 17 mm on a 4x4, its loops filling in)
  // The biggest size p reaches on two or three lines, with the hoop as it is or turned: { n, text, size, turn }, or
  // null when none is at least a quarter bigger. Three lines or the turn only when 10 % bigger again (a 60-letter
  // name fitted to the hoop was offered two lines at 5 mm, when three lines turned gave it 9).
  function lineChoice(p) {
    const hp = api.hoop();
    let best = null;
    for (const n of [2, 3]) {
      const text = n === 2 ? twoLines(p) : threeLines(p); if (!text) continue;
      for (const turn of hp.w === hp.h ? [false] : [false, true]) {
        const fw = (turn ? hp.h : hp.w) - 5, fh = (turn ? hp.w : hp.h) - 5;
        const fits = (t) => { const [w, h] = layoutSize(pieces.map((r) => (r.id === p.id ? { ...p, text, size: t } : r))); return w <= fw && h <= fh; };
        let lo = p.size * 1.25, hi = 60;
        if (lo > hi || !fits(lo)) continue;
        while (hi - lo > 0.5) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
        const t = Math.floor(lo * 2) / 2;
        if (landing(p, { text, size: t }).fits !== (turn ? "turn" : "fits")) continue;
        if (!best || t >= best.size * 1.1) best = { n, text, size: t, turn };
      }
    }
    return best;
  }
  // one line of three or more words split into three lines as even as they can be (the longest line shortest)
  function threeLines(p) {
    if (p.kind !== "text" || (p.shape && p.shape !== "straight") || p.text.includes("\n")) return null;
    const w = p.text.trim().split(/ +/), line = (a, b) => w.slice(a, b).join(" ");
    if (w.length < 3) return null;
    let best = null;
    for (let i = 1; i < w.length - 1; i++) for (let j = i + 1; j < w.length; j++) {
      const worst = Math.max(line(0, i).length, line(i, j).length, line(j).length);
      if (!best || worst < best[0]) best = [worst, [line(0, i), line(i, j), line(j)].join("\n")];
    }
    return best[1];
  }
  // one line of two or more words split into two, at the space nearest the middle; null when that's not possible
  function twoLines(p) {
    if (p.kind !== "text" || (p.shape && p.shape !== "straight") || p.text.includes("\n")) return null;
    const t = p.text.trim(), at = [...t.matchAll(/ +/g)].map((x) => x.index);
    if (!at.length) return null;
    const i = at.reduce((a, b) => (Math.abs(b - t.length / 2) < Math.abs(a - t.length / 2) ? b : a));
    return t.slice(0, i) + "\n" + t.slice(i).trim();
  }

  // (`keep`: a change that doesn't set a size or a place, such as the font, keeps a fitted design fitted)
  function change(fn, now = false, keep = false) {
    const p = current(); if (!p) return;
    remember(!now); fn(p); if (!keep) fitted = false; save(); list();
    clearTimeout(warnTimer); warnTimer = setTimeout(warn, 300);
    clearTimeout(timer); timer = setTimeout(make, now ? 0 : 160);
  }

  async function make(dragging = false) {
    thumbs();
    const s = ++seq;
    api.showError(""); $("st-big").hidden = true;
    try {
      const fonts = [...new Set(pieces.filter((p) => p.font).map((p) => p.font))];
      await Promise.all(fonts.map(loadFont));
      if (s !== seq) return;
      if (!dragging) restitchFiles();
      // what's wrong with it, every piece's problems in one list, two hoopings too (worked out when the design settles, not on every
      // drag frame: the last list stands meanwhile); lettering wrapped round into itself can't be sewn, so Download
      // waits for it
      if (!dragging) { const fit = fittedSizes(pieces); problems = [...new Map(pieces.flatMap((p) => pieceProblems(p, fit).list).map((x) => [x.id, x])).values()]; }
      // (quilting not worked out yet is done by a worker: `unquilted`, then `quiltSoon`)
      let composed;
      const unquilted = dragging ? null : [];
      try { composed = compose(pieces, api.hoop(), { fabric, baste, thread, dragging, later: unquilted }); }
      catch (err) {
        if (!err.overBy) throw err;
        if (s !== seq) return;
        // fitted with Fit to hoop and since grown by a font or style change: fitted again (it came out 1 mm over)
        if (fitted && !dragging && !refitted) { refitted = true; fitHoop(); return; }
        split(err); return;
      }
      if (s !== seq) return;
      refitted = false;
      if (two && !dragging) { two = false; save(); }   // (fits one hooping again: growing past it later asks again)
      if (!dragging) roomier();
      const resizing = !dragging && pieces.find((p) => p.kind === "file" && p.pending), quilting = unquilted?.length > 0;
      if (quilting) quiltSoon(unquilted[0]);
      const { design, steps, done, ready, small, later } = stepsOf(composed, true);
      stepsUI(steps, done, small, ready);
      const look = previewLook(steps);
      const notes = [api.turned() ? TURNED : "", $("st-tip").hidden ? "" : $("st-tip").textContent, fabricTip(), threadTip(small)];
      api.setView(design.pattern(), `${api.safeName(firstWords(), "design")}.pes`, {
        ...look, problems, fixHint: fixHint(),
        block: resizing ? `Re-stitching ${resizing.name} at ${Math.round(resizing.scale * 100)} %…` : quilting ? "Working out the quilting…" : "",
        blockLabel: resizing ? "Re-stitching…" : quilting ? "Quilting…" : "",
        fabric: look.fabric, steps: steps.length,   // (an in-the-hoop front: the background; appliqué: pink gingham)
        sheet: { steps: steps.map((st) => ({ you: st.you, sews: st.sews.join(" ") })), after: done, ready, cut: steps.filter((st) => st.cut).map((st) => st.cut),
          notes } });
      // (whether the letters are small, when the lettering wasn't worked out yet: said a moment later, after the preview)
      if (later) setTimeout(() => {
        if (s !== seq) return;
        const now = smallNow(); if (now === small) return;
        stepsUI(steps, done, now, ready); notes.splice(1, 3, $("st-tip").hidden ? "" : $("st-tip").textContent, fabricTip(), threadTip(now));
      }, 350);
    } catch (err) {
      if (s !== seq) return;
      api.setView(null);
      // (an empty design isn't a mistake: the preview says what to do, in its own words, not in red)
      if (err.empty) stepsUI([]);
      // (a font that didn't load, a network blip: said plainly, tried again on the next change or the button; not
      // "Nothing to stitch yet" over a raw "A network error occurred.")
      else if (err.font) { api.showError(err.message, { label: "Try again", run: () => make() }); $("empty").hidden = true; }
      else { console.error(err); api.showError(err.message); }
    }
  }
  // ---------- quilting, worked out off the page ----------
  // A stippled or echoed frame's quilting is worked out again whenever anything on it moves or changes (seconds on a
  // busy design): the preview shows the last quilting meanwhile and Download waits. One job at a time, the newest
  // waiting one next; the design is made again when it's done.
  let quiltWorker = null, quiltBusy = null, quiltNext = null;
  function quiltSoon(job) {
    if (quiltBusy) { if (quiltBusy.key !== job.key) quiltNext = job; return; }
    const finish = (paths) => {
      const done = quiltBusy; quiltBusy = null;
      quiltDone(done.key, paths ?? quiltOf(done));   // (no worker, or it failed: worked out here)
      const n = quiltNext; quiltNext = null;
      if (n && n.key !== done.key) quiltSoon(n);
      make();
    };
    quiltBusy = job;
    try {
      if (!quiltWorker) {
        quiltWorker = new Worker(new URL("../quilt-worker.js", import.meta.url), { type: "module" });
        quiltWorker.onmessage = (e) => finish(e.data.paths);
        quiltWorker.onerror = () => { quiltWorker = null; finish(null); };
      }
      quiltWorker.postMessage({ key: job.key, job });
    } catch { quiltWorker = null; setTimeout(() => finish(null)); }
  }
  // ---------- design files resized ----------
  // A file piece keeps the stitches it was opened with (`orig`) and its size against them (`scale`); `blocks` are what
  // it sews. A new size is the stitches scaled as a stand-in (`pending`, Download waits) while the doctor's `fix`
  // re-stitches it in a worker, one at a time; results are kept for undo and redo.
  const restitched = new Map();
  const fileKey = (p, f) => `${p.name}|${p.orig.length}|${p.orig[0].paths.length}|${p.orig[0].paths[0][0]}|${f}`;
  function resizeFile(p, f) {
    f = Math.min(FILE_SCALE[1], Math.max(FILE_SCALE[0], Math.round(f * 100) / 100));
    const orig = p.orig || p.blocks;
    if (f === 1) { p.blocks = orig; delete p.orig; delete p.scale; delete p.pending; return; }
    if (f === p.scale) return;
    p.orig = orig; p.scale = f;
    const hit = restitched.get(fileKey(p, f));
    if (hit) { p.blocks = hit; delete p.pending; } else { p.blocks = scaleBlocks(orig, f); p.pending = true; }
  }
  // its size in words, at scale f: "62 % · 55 × 48 mm"
  function fileSize(p, f) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of p.orig || p.blocks) for (const q of b.paths) for (const [x, y] of q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return `${Math.round(f * 100)} % · ${Math.round((x1 - x0) * f)} × ${Math.round((y1 - y0) * f)} mm`;
  }
  let fileWorker = null, fileJob = null;
  function restitchFiles() {
    if (fileJob) return;
    const p = pieces.find((q) => q.kind === "file" && q.pending);
    if (!p) return;
    const hit = restitched.get(fileKey(p, p.scale));
    if (hit) { p.blocks = hit; delete p.pending; save(); make(); return; }
    if (!fileWorker) {
      fileWorker = new Worker(new URL("../doctor-worker.js", import.meta.url), { type: "module" });
      fileWorker.onmessage = (e) => {
        const job = fileJob; fileJob = null;
        const q = pieces.find((o) => o.id === job.id && o.kind === "file" && o.pending && o.scale === job.scale);
        let blocks = null;
        if (e.data.ok) try { blocks = fileBlocks(e.data.pattern); restitched.set(job.key, blocks); } catch (err) { e.data.error = err.message; }
        if (q && blocks) { q.blocks = blocks; delete q.pending; }
        // (it couldn't be re-stitched at that size: back to the size it came in, and said)
        else if (q) { resizeFile(q, 1); api.showError(`${q.name} couldn't be resized: ${e.data.error}`); }
        save(); if (q && current()?.id === q.id) editor(); make();
      };
    }
    fileJob = { id: p.id, scale: p.scale, key: fileKey(p, p.scale) };
    fileWorker.postMessage({ id: 0, d: blocksPattern(p.orig), opts: { scale: p.scale, tiny: p.scale < 1, thin: true } });
  }
  // A design opened on the Open tab, to add words to: a new design of the file and a line of lettering under it (the
  // last design stays one Undo away). Fit to hoop then resizes both.
  function addWords(d, name) {
    const blocks = fileBlocks(d), had = pieces.length;
    remember();
    const f = piece({ kind: "file", name, blocks, color: blocks[0].color }), t = text({ text: "Your words", font: SCRIPT });
    pieces = [f]; fitted = false; two = false; from = name;
    freeSpot(t, "down"); pieces.push(t); sel = t.id; recentre();
    api.setMode("design"); save(); ui(); make();
    if (had) toast(`Started a new design with ${name}.`, { label: "Undo", run: undo });
    // (straight into the words, selected, so typing replaces them)
    const w = $("st-edit").querySelector('textarea[data-k="text"]');
    if (w) { w.focus(); w.select(); }
  }

  // A bigger hoop picked for a design that fits: offered once, the design made as big as it allows (Fit to hoop). A
  // 93 mm design moved from the 4x4 to the 5x7 stayed 93 mm with nothing said.
  let lastHoop = null;
  function roomier() {
    const hp = api.hoop(), key = `${hp.machine}/${hp.id}/${hp.w}x${hp.h}`, was = lastHoop;
    lastHoop = { key, area: hp.w * hp.h };
    if (!was || was.key === key || hp.w * hp.h <= was.area || document.body.dataset.mode !== "design") return;
    const [w, h] = layoutSize(pieces);
    if (!w || !h || Math.min((hp.w - 10) / w, (hp.h - 10) / h) < 1.1) return;
    toast(`The ${hp.name} has room to make this design bigger.`, { label: `Make it as big as the ${hp.name.replace(/ hoop$/, "")} allows`, run: () => { remember(); fitHoop(); } }, 12000);
  }
  // the steps as shown and printed: what to have ready, what's done after, and whether the letters are small
  // (`lazy`: lettering not worked out yet (a long text drawn again as one line, 0.3-0.7 s) is taken as small as it last
  // was, and `later` says to check: typing waited for it before the preview changed)
  let lastSmall = false;
  const smallNow = () => { const fit = fittedSizes(pieces); return (lastSmall = thread !== "60" && pieces.some((p) => smallText(fit.has(p.id) ? { ...p, size: fit.get(p.id) } : p))); };
  function stepsOf({ design, steps, after, before, hoop }, lazy = false) {
    const later = lazy && thread !== "60" && !pieces.every(bulkReady), small = later ? lastSmall : smallNow();
    // (what the fabric needs goes first: a towel's topper was only in the folded "Sewing on"; the threads by the
    // spools they own when they've listed them, not the Brother names)
    // (the fabric's own stabilizer and finishing are left out when a project's own list already says (in-the-hoop,
    // patch, quilt sandwich), bar a towel's topper)
    // (a towel's topper only where there's lettering to sew under it)
    const own = (list) => !(fabric === "towel" && lettered()) && list.some((b) => /stabilizer/i.test(b));
    const ready = [own(before) ? "" : FABRICS[fabric].ready, ...before,
      appliqued() ? "A piece of fabric for each appliqué shape, 1 in bigger than its outline, and small curved scissors (iron-on fusible web on the back stops cotton fraying)." : "",
      api.threadList(steps.map((st) => st.color))].filter(Boolean), done = [own(after) ? "" : FABRICS[fabric].after, ...after].filter(Boolean);
    return { design, steps: firstStep(threadNames(sameSpool(steps)), hoop), done, ready, small, later };
  }
  // step 1 says what to do too: hoop it, put the thread on, Start (a one-step design said only "Sews “Leo”."), one
  // sentence each so they show as numbered sub-steps (a towel's hoop, topper, thread and Start ran together as one)
  function firstStep(steps, hoop) {
    if (!steps.length || !hoop) return steps;
    const h = `${hoop}.`.replace(/\.\.$/, "."), t = steps[0].thread;
    return [{ ...steps[0], you: `${h} Put on ${t}. ${steps[0].you || "Press Start."}` }, ...steps.slice(1)];
  }
  // each step's thread as the machine's screen names it (the file's own palette, one per hooping: a colour may get its
  // second-nearest Brother thread), or their own spool; a thread change says which ("Change to the next thread" left
  // the colour to the swatch beside it)
  function threadNames(steps) {
    const name = new Map();
    let seg = [];
    const flush = () => { machineThreads(seg.map((st) => ({ color: st.color }))).forEach((t, k) => name.set(seg[k], t.name)); seg = []; };
    for (const st of steps) if (st.rehoop) flush(); else seg.push(st);
    flush();
    return steps.map((st) => {
      if (st.rehoop) return st;
      const own = api.ownSpool(st.color), thread = own ? `your ${own}` : `Brother ${name.get(st)}`;
      return { ...st, machine: name.get(st), thread, you: st.you && st.you.replace(/^Change to the next thread\b/, `Change to ${thread}`) };
    });
  }
  // two colours in a row that are the same spool of theirs ("Threads I own"): keep it on, not "change to the next thread"
  function sameSpool(steps) {
    return steps.map((st, i) => {
      const a = i && st.you && !st.rehoop && !steps[i - 1].rehoop && st.color !== steps[i - 1].color && api.ownSpool?.(steps[i - 1].color);
      if (!a || a !== api.ownSpool(st.color)) return st;
      const keep = `Keep the same thread on (both colours are your ${a})`;
      return { ...st, you: st.you.replace(/^Change to the next thread and press Start\.$/, `${keep} and press Start.`).replace(/^Change to the next thread\. /, `${keep}. `) };
    });
  }
  // thread and needle advice that matches the thread chosen: Automatic sews small letters for 60 wt and says so; a weight
  // picked by hand gets its own tip (the quilt label said "60 wt" while 30 wt was picked)
  const threadTip = (small) => thread === "auto" ? (small ? SMALL_TIP : "")
    : THREADS[thread].tip + (small && thread !== "60" ? ` These letters are small for ${THREADS[thread].name}: 60 wt sews them crisper.` : "");
  // the too-big message, over the preview and under the selected piece's controls (with a second fix there too)
  function tooBig(msg, fix, alt) {
    api.showError(msg, fix);
    const n = $("st-big"); n.hidden = false; n.textContent = msg;
    for (const f of [fix, alt]) if (f) { const b = document.createElement("button"); b.type = "button"; b.className = "link"; b.textContent = f.label; b.onclick = f.run; n.append(" ", b); }
  }
  // too big for the hoop: two hoopings if whole pieces can be shared out, else say how much to shrink
  function split(err) {
    const hoop = api.hoop(), parts = two ? splitPieces(pieces, hoop) : null;
    // can't be shared out: show it whole (a big pretend hoop) so it can be seen and dragged back; setView turns
    // Download into "Too big for this hoop"
    if (!parts) {
      // (the size said is the one the preview shows: the whole design, not the first try that failed)
      let msg = err.message, turn = false;
      try {
        // (in a pretend hoop big enough for it: past 2 m the preview was left empty beside "This design is 6429 mm")
        const whole = (o) => { try { return compose(pieces, { ...hoop, w: 2000, h: 2000 }, o); } catch (e) { if (!e.overBy) throw e; return compose(pieces, { ...hoop, w: 2000 * e.overBy * 1.1, h: 2000 * e.overBy * 1.1 }, o); } };
        const composed = whole({ fabric, baste, thread, later: [] }), big = composed.design, [x0, y0, x1, y1] = big.bounds();
        // (the size as the size chip says it, the stitches' extent: the error said 138 × 40 beside a 138 × 41 chip)
        // and never rounded down to look as if it fits ("126 × 23 mm, but the hoop fits 126 × 176" for 126.4)
        const st = designStats(big.pattern()), mm = (v, lim) => (v > lim && Math.round(v) <= lim ? v.toFixed(1) : v.toFixed(0));
        const w = Math.max(st.widthMm, Math.min(x1 - x0, hoop.w - 4 + 0.1)), h = Math.max(st.heightMm, Math.min(y1 - y0, hoop.h - 4 + 0.1));
        // (inches too: the size chip says both, the message said mm only)
        const inch = (v, lim) => (v > lim && (v / 25.4).toFixed(1) === (lim / 25.4).toFixed(1) ? (v / 25.4).toFixed(2) : (v / 25.4).toFixed(1));
        msg = `This design is ${mm(w, hoop.w - 4)} × ${mm(h, hoop.h - 4)} mm (${inch(w, hoop.w - 4)} × ${inch(h, hoop.h - 4)} in), but the ${hoop.name} fits ${hoop.w - 4} × ${hoop.h - 4} mm (${((hoop.w - 4) / 25.4).toFixed(1)} × ${((hoop.h - 4) / 25.4).toFixed(1)} in).`;
        turn = hoop.w !== hoop.h && x1 - x0 <= hoop.h - 4 && y1 - y0 <= hoop.w - 4;   // fits with the long side across
        // the steps kept up to date while it doesn't fit (they still said "Emma" and had no 30 wt tip), marked as waiting
        const { steps, done, ready, small } = stepsOf(composed);
        stepsUI(steps, done, small, ready, "These are the steps for the design as it is now. It doesn't fit the hoop yet: they apply once it does.");
        for (const b of $("st-steps").querySelectorAll("[data-step]")) b.disabled = true;
        api.setView(big.pattern(), `${api.safeName(firstWords(), "design")}.pes`, { fabric: "linen", steps: 0, problems, fixHint: fixHint() });
      } catch { api.setView(null); }
      // (said over the preview and again under the piece's own controls: on a phone a size slider pushed past the hoop
      // showed nothing near it, the message was a screen up. Fit to hoop runs in place: clicking the Pieces box's button
      // for it scrolled the page 1185 px down to that button.)
      // (offered only where it lands: fitted, nothing too small to stitch or run into something that wasn't; a pasted
      // design fitted to the hoop came out with 6 mm letters run into each other)
      const lands = fitLands(), fitNow = lands.ok ? { label: "Fit to hoop", run: () => { remember(); fitHoop(); } } : null;
      if (turn) { tooBig(msg + " It fits with the hoop turned:", { label: "Turn the hoop", run: () => $("turn").click() }); return; }
      // two hoopings, when they're possible: with the hoop turned, or with long lettering split between two words (that
      // one stitches both halves: worked out once the design has been still for a moment, not on every letter typed)
      const say = (way) => {
        if (way.ok) tooBig(`${msg} ${way.ok} the machine sews one half, then you hoop the fabric again for the other (crosses line them up).${fitNow ? " Or Fit to hoop for one hooping, smaller." : ` (Fitted to one hooping, ${lands.why}.)`}`,
          { label: "Sew it in two hoopings", run: () => { remember(); fitted = false; two = true; if (way.pieces) pieces = way.pieces; if (way.turn) { api.setTurn(!api.turned()); api.fit(); } save(); ui(); make(); } }, fitNow);
        else tooBig(`${msg}${way.why ? ` ${way.why}` : ""} ${fitNow ? "Make the biggest piece smaller, or" : `Make the biggest piece smaller, or take something out (fitted to the hoop, ${lands.why}).`}`, fitNow);
      };
      const way = twoHoopings(hoop, true), s = seq;
      say(way);
      if (way.later) setTimeout(() => { if (s === seq) say(twoHoopings(hoop)); }, 700);
      return;
    }
    const opts = { fabric, baste, thread }, base = api.safeName(firstWords(), "design");
    // the cross to line up on, named as the machine's screen shows it (the hoop goes on the machine that way round;
    // naming the preview's too, turned, read as two different crosses)
    const which = (pt) => `${crossName(pt.marks, api.turned())} cross${api.turned() ? " on the machine's screen" : ""}`;
    const built = parts.map((pt, i) => ({ ...compose(pt.pieces, hoop, { ...opts, marks: { pts: pt.marks, end: pt.end, which: which(pt) } }), filename: `${base}_hooping_${i + 1}_of_2.pes` }));
    // how far to slide the fabric for the second hooping: the machine centres each file, so the fabric moves by the
    // distance between the two halves' centres, and the crosses land that far from where they were (it said only
    // "hoop it again", and "the right cross as the machine shows it, the top one in this preview")
    const mid = (b) => { const [x0, y0, x1, y1] = b.design.bounds(); return [(x0 + x1) / 2, (y0 + y1) / 2]; };
    const [c1, c2] = built.map(mid), m = parts[1].marks[0], onMachine = ([x, y]) => (api.turned() ? [-y, x] : [x, y]);
    const [sx, sy] = onMachine([c1[0] - c2[0], c1[1] - c2[1]]), [ox, oy] = onMachine([m[0] - c2[0], m[1] - c2[1]]), across = Math.abs(sx) >= Math.abs(sy);
    const side = (v) => (across ? (v < 0 ? "left" : "right") : v < 0 ? "top" : "bottom"), dist = Math.hypot(sx, sy), off = across ? ox : oy;
    const inch = (mm) => (mm / 25.4).toFixed(1), from = across ? `${side(off)} of` : off < 0 ? "above" : "below";
    const move = `Hoop the fabric again with fresh stabilizer under it, slid about ${dist.toFixed(0)} mm (${inch(dist)} in) toward the ${side(across ? sx : sy)} of the hoop from where it was, as straight as you can. The crosses from the first hooping should sit ${Math.abs(off) < 3 ? "on the hoop's centre line" : `about ${Math.abs(off).toFixed(0)} mm (${inch(Math.abs(off))} in) ${from} the hoop's centre`} (the hoop's grid sheet helps).`;
    const b1 = built[0].steps, s2 = built[1].steps[0], change = s2.color !== b1[b1.length - 1].color ? "Change to the next thread. " : "";
    built[1].steps[0] = { ...s2, you: change + crossStep({ pts: parts[1].marks, which: which(parts[1]), move }) };
    // the whole design for the preview (a big pretend hoop) with the crosses the files sew, and every step of both
    // hoopings in order, the rehooping between them (not a step: the machine doesn't stop for it, so it's no pause)
    const all = compose(pieces, { ...hoop, w: 2000, h: 2000 }, { ...opts, marks: { pts: parts[0].marks, end: true } });
    const steps = firstStep(threadNames(sameSpool([...built[0].steps, { rehoop: true, title: `Second hooping: ${built[1].filename}`, you: `When ${built[0].filename} is done, take the hoop off the machine and the fabric out of the hoop. Leave the crosses in: the second file lines up on them.` }, ...built[1].steps])), built[0].hoop);
    // (what to have ready and do after, for the whole design: it listed only the first file's, without the fabric's)
    const whole = stepsOf(all), done = [...new Set([...whole.done, ...built[1].after])];
    stepsUI(steps, done, whole.small, whole.ready, "", built[0].filename);
    for (const b of $("st-steps").querySelectorAll("[data-step]")) b.disabled = true;   // (the step view follows one file)
    // each hooping's field, where the machine centres that half (mm, as the preview shows it)
    const fw = hoop.w - 4, fh = hoop.h - 4, hoopings = built.map((b) => { const [x0, y0, x1, y1] = b.design.bounds(), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; return [cx - fw / 2, cy - fh / 2, cx + fw / 2, cy + fh / 2]; });
    api.setView(all.design.pattern(), `${base}_2_hoopings.zip`, { fabric: "linen", steps: 0, hoopings, problems, fixHint: fixHint(),
      split: built.map((b) => ({ pattern: b.design.pattern(), filename: b.filename })) });
  }
  // What Fit to hoop would leave: { ok } when nothing would then be too small to stitch or run into something it doesn't
  // now; else { why } in a few words (judged from the stitches as they are, scaled: `scaledFit`). Kept for the same
  // design and hoop.
  let lastLands = null;
  function fitLands() {
    const key = snap() + JSON.stringify(api.hoop());
    if (lastLands?.key === key) return lastLands.val;
    const bs = pieces.map(pieceBounds).filter(Boolean), hp = api.hoop();
    let val = { ok: true };
    if (bs.length) {
      const w = Math.max(...bs.map((b) => b[2])) - Math.min(...bs.map((b) => b[0])), h = Math.max(...bs.map((b) => b[3])) - Math.min(...bs.map((b) => b[1]));
      const { tiny, hit } = scaledFit(pieces, Math.min((hp.w - 10) / w, (hp.h - 10) / h));
      if (tiny) val = { why: `${label(tiny)} would be too small to stitch` };
      else if (hit) val = { why: `${label(hit[0])} would run into ${label(hit[1])}` };
    }
    lastLands = { key, val };
    return val;
  }
  // Too big for one hooping and not shared out as it is (`splitPieces` needs two or more whole pieces, each half fitting
  // the hoop): would it share out with the hoop turned, or with the longest straight lettering split into two pieces
  // between words (each word where it was, at the same letter size)? { ok: what's done, pieces, turn } or { why } (a
  // 266 mm "HAPPY BIRTHDAY" said only "Make the biggest piece smaller, or Fit to hoop")
  function twoHoopings(hoop, quick = false) {
    const other = hoop.w !== hoop.h ? { ...hoop, w: hoop.h, h: hoop.w } : null, ways = [[hoop, false], ...(other ? [[other, true]] : [])];
    if (splitPieces(pieces, hoop)) return { ok: "It can be sewn in two hoopings:" };
    for (const [h, t] of ways) if (t && splitPieces(pieces, h)) return { ok: "It can be sewn in two hoopings with the hoop turned:", turn: true };
    const fit = fittedSizes(pieces), wide = (q) => { const b = pieceBounds(q); return b ? b[2] - b[0] : 0; };
    const long = pieces.filter((p) => p.kind === "text" && (p.shape || "straight") === "straight" && !p.text.includes("\n") && !fit.has(p.id) && !(p.rot || 0) && !p.deco && / /.test(p.text.trim()))
      .sort((a, b) => wide(b) - wide(a))[0];
    if (long && quick) return { later: true };
    if (long) {
      // (the two gaps nearest the middle: each try draws both halves' lettering, and this runs as the words are typed)
      const t = long.text.trim(), gaps = [...t.matchAll(/ +/g)].map((m) => [m.index, m.index + m[0].length]).sort((a, b) => Math.abs(a[0] - t.length / 2) - Math.abs(b[0] - t.length / 2)).slice(0, 2);
      const b0 = pieceBounds({ ...long, x: 0, y: 0 }), h0 = inkHeight(t, long.font), m0 = letterMetrics(t, long.font, long.size, long.style);
      // (each word at the same letter scale, its baseline and outer end where they were)
      const part = (text, end) => {
        const size = Math.round(((long.size * inkHeight(text, long.font)) / h0) * 2) / 2, q = { ...long, id: end ? long.id : nextId, text, size, x: 0, y: 0 };
        const b = pieceBounds(q), m = letterMetrics(text, long.font, size, long.style);
        if (!b) return null;
        q.x = Math.round((long.x + (end ? b0[2] - b[2] : b0[0] - b[0])) * 2) / 2;
        q.y = Math.round((long.y - (m0.top + m0.bottom) / 2 + (m.top + m.bottom) / 2) * 2) / 2;
        return q;
      };
      // (the gap nearest the middle first, the next only when that one doesn't share out: each try stitches both halves)
      const fitsOne = (q) => { const b = pieceBounds(q), w = b[2] - b[0], hh = b[3] - b[1]; return ways.some(([h]) => w <= h.w - 6 && hh <= h.h - 6); };
      let over = null;
      for (const [ga, gb] of gaps) {
        const a = part(t.slice(0, ga), false), b = part(t.slice(gb), true);
        if (!a || !b) continue;
        const big = [a, b].find((q) => !fitsOne(q));
        if (big) { over ||= big; continue; }
        const ps = pieces.flatMap((p) => (p === long ? [a, b] : [p]));
        for (const [h, tt] of ways) if (splitPieces(ps, h)) {
          nextId = Math.max(nextId, a.id + 1);
          return { ok: `It can be sewn in two hoopings${tt ? ", with the hoop turned" : ""}, with ${label(a)} and ${label(b)} as two pieces:`, pieces: ps, turn: tt };
        }
      }
      if (over) return { why: `Even split between two hoopings, ${label(over)} would be bigger than the hoop by itself.` };
    }
    // why not: one piece bigger than the hoop by itself, either way round
    const big = pieces.find((p) => { const b = pieceBounds(fit.has(p.id) ? { ...p, size: fit.get(p.id) } : p); if (!b) return false; const w = b[2] - b[0], hh = b[3] - b[1];
      return !ways.some(([h]) => w <= h.w - 6 && hh <= h.h - 6); });
    if (big) return { why: `Two hoopings can't help: ${label(big)} is bigger than the hoop by itself${big.kind === "text" && !/ /.test(big.text.trim()) ? " (lettering can only be split at a space between words)" : ""}.` };
    return { why: pieces.length > 1 ? "Two hoopings can't help either: it's too big both ways." : "" };
  }
  // appliqué tips: shown the first time a design has fabric to lay on, then on request
  // real appliqué (shapes cut from fabric and satined), not the front of an in-the-hoop project: its fabric is in its
  // own supply list (the mug rug listed curved scissors and appliqué shapes)
  const appliqued = () => pieces.some((p) => p.kind === "letters" || (p.kind === "motif" && p.style === "applique") || (p.kind === "frame" && p.border === "applique"));
  function applGuide(steps) {
    const has = steps.length > 0 && appliqued();
    $("st-appl-open").hidden = !has;
    if (!has) $("st-appl").hidden = true;
    else if (!api.store.get("studio.applSeen", false) && $("st-guide").hidden) $("st-appl").hidden = false;
  }
  $("st-appl-close").onclick = () => { $("st-appl").hidden = true; api.store.set("studio.applSeen", true); };
  $("st-appl-open").onclick = () => { $("st-appl").hidden = false; $("st-appl").scrollIntoView({ block: "nearest", behavior: "smooth" }); };
  // (`first`: a split design's first file, named over its steps; the rehooping between the files isn't a step or a
  // pause: the steps said "2 pauses" where the download said "no pauses")
  function stepsUI(steps, after = [], small = false, before = [], waiting = "", first = "") {
    applGuide(steps);
    // (stops in the words the facts beside the preview use: "2 thread changes and 1 pause", not "3 pauses"; a split
    // design's rehooping between its files is neither)
    const rehoops = steps.filter((st) => st.rehoop).length, count = steps.length - rehoops;
    let changes = 0, same = 0, prev = null;
    for (const st of steps) { if (st.rehoop) { prev = null; continue; } if (prev) st.color === prev.color ? same++ : changes++; prev = st; }
    $("st-steps-count").textContent = !steps.length ? "" : `· ${rehoops ? `${rehoops + 1} hoopings, ` : ""}${count} ${count === 1 ? "step" : "steps"}${changes + same ? `, ${stopWords(changes, same)}` : ""}`;
    let n = 0;
    // each step is a button: the preview shows the design as it is after that step, what's still to come faint
    // (what's still wrong, and worth knowing, first: the steps said nothing of a name that closes up on fleece)
    $("st-steps").innerHTML = (steps.length ? problemsItems(shownOn(problems, "steps")) : "")
      + (waiting ? `<li class="after"><b>Waiting for a fit</b><span>${api.escapeHtml(waiting)}</span></li>` : "")
      + (api.turned() ? `<li class="after"><b>Hooping</b><span class="turned">${TURN_PIC}${TURNED}</span></li>` : "") + (before.length ? `<li class="after"><b>Have ready</b><ul class="ready">${before.map((r) => `<li>${api.escapeHtml(r)}</li>`).join("")}</ul></li>` : "")
      + (first ? `<li class="after"><b>First hooping: ${api.escapeHtml(first)}</b></li>` : "")
      + steps.map((st, i) => st.rehoop ? `<li class="after"><b>${api.escapeHtml(st.title)}</b>${youHtml(st.you, api.escapeHtml)}</li>` : `<li><button type="button" data-step="${i}" aria-pressed="${api.step() === i}">
      <b><span class="n">${++n}</span><i style="background:${st.color}"></i>Brother ${api.escapeHtml(st.machine || nearestBrotherThread(st.color).name)}${api.spool(st.color) ? ` <small>${api.escapeHtml(api.spool(st.color))}</small>` : ""}</b>
      ${st.you ? youHtml(st.you, api.escapeHtml) : ""}<span>${api.escapeHtml(st.sews.join(" "))}</span>
      ${st.early ? `<small>Sewn early, with the other ${api.escapeHtml(st.machine || nearestBrotherThread(st.color).name)} parts, to save a thread change.</small>` : ""}</button></li>`).join("")
      + (threadTip(small) ? `<li class="after"><b>Thread and needle</b><span>${api.escapeHtml(threadTip(small))}</span></li>` : "")
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
  // the file's name: who it's for when a line says so ("Made for Lily": the label was by_Grandma_Jean.pes, its biggest
  // line), else the biggest lettering (the name, not the quilt label's "Made for")
  const firstWords = () => {
    const words = pieces.filter((p) => p.kind === "text" || p.kind === "letters");
    for (const p of words) for (const line of unswashed(p.text).split("\n")) {
      const m = /\bfor\s+(\S+(?:\s+\S+){0,2})\s*$/i.exec(line);
      if (m) return m[1];
    }
    // (straight lettering first, it's the name: a coaster's 34 mm "A" pasted beside "Emma" made it A.pes; else a
    // monogram, which beats arched words: the ring with JKM in it downloaded as HANDMADE.pes)
    // (words with letters in them before a date: the ring-bearer pillow's bigger "06.20.27" named it 06_20_27.pes, not
    // after "Sam & Alex")
    const big = (ps) => ps.reduce((a, p) => (!a || p.size > a.size ? p : a), null), lettered = (p) => /\p{L}/u.test(p.text ?? p.letters ?? "");
    const pick = (ok) => big(pieces.filter((p) => ok(p) && p.kind === "text" && (p.shape || "straight") === "straight")) || big(pieces.filter((p) => ok(p) && p.kind === "monogram"))
      || big(pieces.filter((p) => ok(p) && (p.kind === "text" || p.kind === "monogram" || p.kind === "letters")));
    // (only words a file name can carry: empty lettering named it after the starter, spaces alone design.pes)
    const said = (p) => (p.kind === "monogram" ? p.letters : unswashed(p.text)), named = (p) => !!api.safeName(said(p), "");
    const m = pick((p) => lettered(p) && named(p)) || pick(named);
    if (!m) return from || "design";   // (else the starter: a quilt block was design.pes)
    // its copies, the same kind, font and size (two bookmarks made in the hoop, Lily and Noah, were Lily.pes), named
    // together in the order they sew
    const twins = pieces.filter((q) => q.kind === m.kind && q.size === m.size && q.font === m.font && (q.shape || "straight") === (m.shape || "straight") && named(q));
    return [...new Set((twins.length ? twins : [m]).map(said))].join(" ");
  };
  // the design's main lettering: the biggest straight-or-arched words or monogram (`letters`: appliqué letters too)
  // (words with letters before a date: One for each name swapped each name in for the pillow's "06.20.27")
  const main = (letters = false) => {
    const all = pieces.filter((p) => p.kind === "text" || p.kind === "monogram" || (letters && p.kind === "letters")), named = all.filter((p) => /\p{L}/u.test(p.text ?? p.letters ?? ""));
    return (named.length ? named : all).reduce((a, p) => (!a || p.size > a.size ? p : a), null);
  };

  // ---------- events ----------
  $("st-cards").onclick = (e) => {
    const b = e.target.closest("[data-start]"); if (!b) return;
    pickStarter(STARTERS.find((x) => x.id === b.dataset.start));
  };
  // a starter in place of the design (`tweak` changes its pieces first: an old #bookmark link's saved name and font)
  function pickStarter(s, tweak) {
    if (!s) return;
    const phone = matchMedia("(max-width: 600px)").matches;
    api.store.set("studio.guideSeen", true);   // (step 1 done: the guide isn't shown on the next visit)
    api.fit();   // (a new design opens whole, not at the last one's zoom)
    api.unturn();   // (and upright: the last starter's turned hoop made a bib hoop sideways; too big offers the turn)
    if (s.turn) api.setTurn(true);   // (a starter laid out long side across, the bookmark; a square hoop ignores it)
    // (a design that was there is one Undo away, and said so: a 15-piece design went with one tap, no word)
    const had = pieces.length && snap();
    remember(); pieces = s.make(); if (tweak) tweak(pieces); sel = pieces[pieces.length - 1].id;
    fabric = s.fabric || "cotton";   // (a towel left on made every later starter towel-heavy, +40-75 % stitches)
    baste = !!s.baste; fitted = false; two = false; from = s.name;
    thread = s.thread || "auto";   // (30 wt stuck to every later starter, and through a reload, while fabric reset)
    // made to fit the hoop it's opened in, everything scaled together (the coaster, quilt block, mug rug and zipper
    // pouch opened Too big on the 4x4)
    // Lettering it made small enough for its loops to fill in goes back up to the size that keeps them open (up to its
    // own) where that still fits and runs into nothing: the 4x4 pouch's "Makeup" at 15 mm.
    const fits = () => { try { compose(pieces, api.hoop(), { fabric, baste, thread, later: [] }); return true; } catch (err) { if (err.overBy) return false; throw err; } };
    if (!fits()) {
      const was = new Map(pieces.map((p) => [p.id, p.size]));
      fitHoop(false);
      for (const p of pieces) {
        const fs = fittedSizes(pieces).get(p.id), need = p.kind === "text" ? loopsFill({ ...p, size: fs ?? p.size }) : 0;
        if (!need || need > was.get(p.id)) continue;
        const keep = p.size; p.size = Math.max(p.size, need);
        if ((fittedSizes(pieces).get(p.id) ?? p.size) < need || touching(p, pieces) || !fits()) p.size = keep;
      }
    }
    $("st-tip").hidden = !s.tip; $("st-tip").textContent = s.tip || "";
    save(); ui(); make();
    if (had && !sameDesign(had, snap())) toast(`Replaced your design with “${s.name}”.`, { label: "Undo", run: undo });
    // phones: the preview is above the cards, so the change happened off-screen (scrolled to its top, so the sewing
    // controls under it stay above the Download bar)
    if (phone) $("view").scrollIntoView({ block: "start", behavior: "smooth" });
  }
  $("st-add").onclick = (e) => {
    const b = e.target.closest("[data-add]"); if (!b) return;
    if (b.dataset.add === "file") { $("st-file").click(); return; }
    api.store.set("studio.guideSeen", true);
    remember(); fitted = false;
    // (a motif starts near the lettering's height: a 40 mm heart landed under a 20 mm name; 25 mm at least, as
    // a filled motif any smaller loses its detail)
    const tall = Math.max(0, ...pieces.filter((q) => q.kind === "text" || q.kind === "monogram").map((q) => q.size));
    const p = b.dataset.add === "text" ? text({ y: 20 }) : b.dataset.add === "monogram" ? mono() : b.dataset.add === "letters" ? appl()
      : b.dataset.add === "motif" ? motif(tall ? { size: Math.min(40, Math.max(25, Math.round(tall * 1.25))) } : {}) : frame({ border: "line" });
    // on a frame when there's room inside it (made smaller to fit, down to `least`: a second 40 mm motif landed
    // outside the quilt block)
    // the first frame goes round what's there, with room inside it (`roundAll`): an 80 mm circle came in 2 mm from
    // the G of a 62 mm "Grandma"
    if (p.kind === "frame" && pieces.length && !pieces.some((f) => f.kind === "frame")) roundAll(p);
    place(p, (q) => pieces.push(q));
  };
  // A new piece (added, duplicated or pasted) goes where it runs into nothing and the design stays in one hooping: in a
  // frame with room for it (`spotIn`), else where it is when that's clear, else the nearest free space (`freeRoom`): on
  // an in-the-hoop project's front (outside it would sew on the bare stabilizer), else anywhere in the hoop. No room:
  // said so, and nothing is added (pieces piled up on one spot with one warning, went outside a patch until the
  // design quietly became two hoopings, and a duplicate or a paste went below everything, out of the hoop).
  // `insert(p)` puts it in the list; false when nothing was added.
  function place(p, insert) {
    const at = p.kind !== "frame" && spotIn(p);
    if (at) Object.assign(p, { x: at.x, y: at.y, size: at.size });
    const ith = pieces.find((f) => f.kind === "frame" && (f.border === "zip" || f.border === "ith") && !(f.rot || 0));
    // (a design already too big for one hooping, two hoopings on purpose, takes it below what's there as before)
    const over = !fitsWith(null);
    const placing = !at && pieces.length && !(over && !ith) && (p.kind === "frame" ? pieces.some((f) => f.kind === "frame") : ith || !clear(p));
    if (over && !ith && !at && p.kind !== "frame" && touching(p, pieces)) freeSpot(p, "down");
    if (placing) {
      const room = freeRoom(p, ith);
      if (!room) { noRoom(p, ith, insert); return false; }
      Object.assign(p, room);
    }
    const moved = (!!placing || over) && !ith;
    insert(p); sel = p.id;
    // in a thread that shows on a patch it's sewn on, wherever it landed (+ Lettering on the patch starter came in
    // navy on the navy fill)
    const base = p.kind !== "frame" && underPatch(p, pieces, true);
    if (base && hard(p.color, base.fill || base.color)) p.color = against(base, pieces);
    if (moved) recentre();
    save(); ui(); make();
    return true;
  }
  // p where it is runs into nothing and keeps the design in one hooping
  const clear = (p) => !touching(p, pieces) && fitsWith(p);
  let deleted = 0, toastTimer = 0, toastAt = 0;
  const note = Object.assign(document.createElement("div"), { id: "st-toast", className: "toast", hidden: true });
  function hideToast() { if (note.querySelector("button")) gone(); }
  note.setAttribute("role", "status"); document.body.append(note);
  // Going, it fades and keeps catching taps for a moment before it's hidden: a late tap on Undo just after it went
  // landed on "+ Appliqué letters" under it, and so did a second tap on Undo
  function gone() {
    if (note.hidden || note.classList.contains("gone")) return;
    note.classList.add("gone"); clearTimeout(toastTimer); toastTimer = setTimeout(() => { note.hidden = true; note.classList.remove("gone"); }, 700);
  }
  // a moment's note with a one-tap way back ("Removed Monogram aMs. Undo")
  // (10 s, or until the next change: 6 s went before a newcomer found Undo)
  function toast(msg, action, ms = action ? 10000 : 3000) {
    note.innerHTML = `<span>${api.escapeHtml(msg)}</span>${action ? `<button type="button" class="link">${action.label}</button>` : ""}`;
    if (action) note.querySelector("button").onclick = () => { if (note.classList.contains("gone")) return; gone(); action.run(); };
    note.classList.remove("gone"); note.hidden = false; toastAt = Date.now(); clearTimeout(toastTimer); toastTimer = setTimeout(gone, ms);
  }
  $("st-pieces").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const id = +b.dataset.id, i = pieces.findIndex((p) => p.id === id);
    // (the next row's ✕ slides under the same finger: a second tap straight after is ignored)
    if (b.dataset.op === "del" && Date.now() - deleted < 600) return;
    if (b.dataset.op) { remember(); fitted = false; }
    if (b.dataset.op === "del") { deleted = Date.now(); toast(`Removed ${label(pieces[i])}.`, { label: "Undo", run: undo }); pieces.splice(i, 1); if (sel === id) sel = pieces[Math.max(0, i - 1)]?.id; }
    else if (b.dataset.op === "dup") {
      // the copy goes just below the original, where there's room (else wherever there's room, as a new piece does)
      const bb = pieceBounds(pieces[i]), c = { ...structuredClone(pieces[i]), id: nextId++, y: pieces[i].y + (bb ? bb[3] - bb[1] + 4 : 10) };
      if (!place(c, (q) => pieces.splice(i + 1, 0, q))) return;
    }
    else if (b.dataset.op === "flip") pieces[i].flip = !pieces[i].flip;
    else if (b.dataset.op === "up" && i > 0) [pieces[i - 1], pieces[i]] = [pieces[i], pieces[i - 1]];
    else if (b.dataset.op === "down" && i < pieces.length - 1) [pieces[i + 1], pieces[i]] = [pieces[i], pieces[i + 1]];
    else sel = id;
    const had = $("st-pieces").contains(document.activeElement);
    save(); ui(); if (b.dataset.op) make();
    // (✕, or ↓ on what is now the last piece, leaves nothing focused: the list keeps the keyboard)
    if (had && !$("st-pieces").contains(document.activeElement)) roving()?.focus();
  };
  const edit = $("st-edit");
  // (a word an input method has finished composing is tidied then: no input event follows the composition's end)
  edit.addEventListener("compositionend", (e) => e.target.dispatchEvent(new Event("input", { bubbles: true })));
  edit.addEventListener("input", (e) => {
    const t = e.target, k = t.dataset.k;
    if (t.matches("[data-color-any]")) { change((p) => (p.color = t.value)); return; }
    if (t.matches("[data-fill-any]")) { change((p) => (p.fill = t.value)); return; }
    if (t.matches("[data-blend-any]")) { change((p) => (p.blend = t.value)); return; }
    if (t.matches("[data-eyelet]")) { change((p) => { if (t.checked) p.eyelet = true; else delete p.eyelet; }, true); editor(); return; }
    if (t.matches("[data-blend]")) { change((p) => (t.checked ? (p.blend = p.fill === RED ? NAVY : RED) : delete p.blend), true); editor(); return; }
    if (t.matches("[data-pair]")) { pairAt = +t.value; editor(); return; }
    if (t.matches("[data-file-scale]")) { t.nextElementSibling.textContent = fileSize(current(), t.value / 100); return; }
    if (t.matches("[data-kern]")) {
      t.nextElementSibling.textContent = `${t.value} %`;
      change((p) => { p.kern = { ...p.kern, [pairAt]: +t.value }; if (!+t.value) delete p.kern[pairAt]; });
      const o = edit.querySelector(`[data-pair] option[value="${pairAt}"]`), p = current();
      if (o) o.textContent = p.text[pairAt] + " " + p.text[pairAt + 1] + (+t.value ? ` (${+t.value > 0 ? "+" : ""}${t.value}%)` : "");
      return;
    }
    if (!k) return;
    // the words as they'll be stitched (`tidy` in words.js: composed accents, plain spaces, no invisible characters),
    // and a 4th Enter becomes a space, so words typed after it don't run into the line ("Line threeFour")
    // (not mid-way through a word an input method is still composing: changing the field then breaks it)
    if ((k === "text" || k === "letters") && !e.isComposing) {
      const many = t.tagName === "TEXTAREA" && t.value.split("\n").length > 3, lines = t.tagName === "TEXTAREA" ? 3 : 1, max = +t.dataset.max || Infinity;
      const whole = tidy(t.value, { lines }).length, cut = tidyField(t, { lines, max }).length < whole;
      if (many) setTimeout(() => { const hint = edit.querySelector("[data-lines-hint]"); if (hint) hint.hidden = false; });
      setTimeout(() => { const hint = edit.querySelector("[data-cut-hint]"); if (hint && (cut || !hint.hidden)) { hint.textContent = `${max} letters and spaces is the most: the rest was left out.`; hint.hidden = !cut; } });
    }
    if (t.type === "range") t.nextElementSibling.textContent = shown(t.value, t.dataset.unit);
    change((p) => {
      if (k === "text") { if (p.kern) p.kern = rekern(p.kern, p.text, t.value); pairAt = +Object.keys(rekern({ [pairAt]: 1 }, p.text, t.value) || { [-1]: 1 })[0]; }
      // (fewer initials in a frame grow to its width: one letter of "aMs" stayed 23 mm tall in a 90 mm circle)
      if (k === "letters" && p.kind === "monogram") {
        const was = p.size; p.size = monoSize(p, t.value, pieces);
        const r = edit.querySelector('input[data-k="size"]');
        if (r && p.size !== was) { r.max = Math.max(+r.max, Math.ceil(p.size)); r.value = p.size; r.nextElementSibling.textContent = shown(p.size, "mm"); }
      }
      const longer = k === "text" && p.kind === "text" && t.value.trim().length > (p.text || "").trim().length && t.value.trim().length >= 3;
      p[k] = t.type === "range" ? +t.value : t.value;
      if (longer) reArch(p);
    }, false, k === "font" || k === "deco");
    if (k === "text") { const box = edit.querySelector("[data-pairs]"); if (box) box.innerHTML = pairUI(current()); }   // (the pairs follow the words)
    if (["size", "text", "letters", "font", "radius", "ry", "spacing"].includes(k)) { clearTimeout(warnTimer); warnTimer = setTimeout(warn, 300); }
    // a new line in the words shows the alignment and line spacing
    if (k === "text" && (t.value.split("\n").length > 1) !== !!edit.querySelector('[data-seg="align"]') && current().shape === "straight") editor();
  });
  // Arched words retyped into a name the curve is now too tight for get the curve they need (`archFit`, the least
  // that's enough), the word kept where it is shown; not on a frame's curve or an oval set by hand (a retyped name kept
  // the old, too tight curve). Only ever wider, and only as
  // the words get longer (3 letters on): re-sizing it as each letter was typed or deleted made it jump about.
  function reArch(p) {
    if (p.kind !== "text" || (p.shape !== "up" && p.shape !== "down") || p.ry != null || followFrame(p, pieces)) return;
    // (too tight: the least curve that's enough; round more than 40 % of it, far past the third `archStart` aims for:
    // that one)
    const b = pieceBounds({ ...p, shape: "straight", x: 0, y: 0 }), wraps = b && b[2] - b[0] > 0.4 * 2 * Math.PI * p.radius;
    const radius = archFit(p)?.radius ?? (wraps ? archStart(p).radius : 0);
    if (!radius || radius <= p.radius) return;
    const d = p.shape === "up" ? 1 : -1;
    p.y = Math.round((p.y + d * (radius - p.radius)) * 2) / 2; p.radius = radius;
    const r = edit.querySelector('input[data-k="radius"]'), r2 = edit.querySelector('input[data-k="ry"]');
    for (const el of [r, r2]) if (el) { el.max = Math.max(+el.max, radius); el.value = radius; el.nextElementSibling.textContent = shown(radius, "mm"); }
  }
  let warnTimer = 0;
  edit.addEventListener("change", (e) => {
    // (re-stitched once the slider is let go: each step is a re-stitch)
    if (e.target.matches("[data-file-scale]")) { const v = e.target.value / 100; change((p) => resizeFile(p, v), true); editor(); return; }
    if (e.target.dataset.k === "font" || e.target.dataset.k === "deco" || e.target.matches("[data-color-any], [data-fill-any], [data-blend-any]")) editor(); });
  edit.addEventListener("click", (e) => {
    const c = e.target.closest("[data-color]");
    if (c) { change((p) => (p.color = c.dataset.color), true, true); editor(); return; }
    const mo = e.target.closest("[data-motif]");
    if (mo) { change((p) => (p.motif = mo.dataset.motif), true, true); editor(); list(); return; }
    const f = e.target.closest("[data-fill]");
    if (f) { change((p) => (p.fill = f.dataset.fill), true, true); editor(); return; }
    const bl = e.target.closest("button[data-blend]");
    if (bl) { change((p) => (p.blend = bl.dataset.blend), true, true); editor(); return; }
    if (e.target.closest("[data-kern-reset]")) { change((p) => delete p.kern, true); editor(); return; }
    // (`data-turn`: the fix only fits with the hoop turned, so it turns it too)
    // (part of the same change, one Undo for both: the Turn button made it a second step)
    const turnToo = (b) => { if (b.hasAttribute("data-turn")) { api.setTurn(!api.turned()); api.fit(); clearTimeout(timer); make(); } };
    const ss = e.target.closest("[data-seg-set]");
    if (ss) { const [k, v] = ss.dataset.segSet.split(":"); change((p) => (p[k] = v), true, true); turnToo(ss); editor(); return; }
    const sz = e.target.closest("[data-size]");
    // (an arched word made bigger gets the curve it then needs too, so the size it was told reads)
    if (sz) { change((p) => Object.assign(p, sizeChange(p, +sz.dataset.size)), true); turnToo(sz); editor(); return; }
    const rm = e.target.closest("[data-room]");
    if (rm) { change((p) => { Object.assign(p, archRoom(p) || {}); Object.assign(p, archFit(p) || {}); }, true); turnToo(rm); editor(); return; }
    const ln = e.target.closest("[data-lines]");
    if (ln) { change((p) => { p.text = ln.dataset.text ? decodeURIComponent(ln.dataset.text) : twoLines(p) || p.text; p.size = +ln.dataset.lines || p.size; }, true); turnToo(ln); editor(); return; }
    const fb = e.target.closest("[data-fab-set]");
    if (fb) { remember(); fabric = fb.dataset.fabSet; save(); sewnOn(); make(); warn(); return; }
    const at = e.target.closest("[data-as-text]");
    if (at) { asText(at.hasAttribute("data-turn")); return; }
    const cs = e.target.closest("[data-color-set]");
    if (cs) { change((p) => (p.color = cs.dataset.colorSet), true, true); editor(); return; }
    const af = e.target.closest("[data-after]");
    if (af) { sewAfter(+af.dataset.after); return; }
    const kr = e.target.closest("[data-kern-off]");
    if (kr) { change((p) => { delete p.kern[kr.dataset.kernOff]; if (!Object.keys(p.kern).length) delete p.kern; }, true); editor(); return; }
    const ru = e.target.closest("[data-run-up]");
    if (ru) { change((p) => Object.assign(p, { rot: -90, size: +ru.dataset.runUp }), true); editor(); return; }
    const fg = e.target.closest("[data-frame-grow]");
    if (fg) {
      const [id, w, h, size] = fg.dataset.frameGrow.split(":").map(Number), f = pieces.find((o) => o.id === id), p = current();
      if (f && p) { remember(); fitted = false; f.w = w; f.h = h; p.size = Math.max(p.size, size); turnToo(fg); save(); ui(); make(); }
      return;
    }
    const mt = e.target.closest("[data-move-to]");
    if (mt) { const [x, y] = mt.dataset.moveTo.split(",").map(Number); change((p) => { Object.assign(p, { x, y }); recentre(); }, true); turnToo(mt); editor(); return; }
    if (e.target.closest("[data-move]")) { const to = spotIn(current(), true); if (to) change((p) => Object.assign(p, { x: to.x, y: to.y, size: to.size }), true); editor(); return; }
    if (e.target.closest("[data-two-up]")) { twoUp(current()); return; }
    if (e.target.closest("[data-follow]")) { change((p) => Object.assign(p, followFrame(p, pieces)), true); editor(); return; }
    const sw = e.target.closest("[data-swash]");
    if (sw) { const on = sw.getAttribute("aria-pressed") !== "true"; change((p) => { const t = withSwash(p.text, sw.dataset.swash, on); if (p.kern) p.kern = rekern(p.kern, p.text, t); p.text = t; }, true); editor(); return; }
    const s = e.target.closest("[data-seg] button");
    if (s) {
      change((p) => {
        const k = s.closest("[data-seg]").dataset.seg, arc = (v) => v === "up" || v === "down", was = p.shape;
        p[k] = s.dataset.v;
        // words first bent into an arch get a curve to suit them: just inside a round frame they're in, else one sized
        // from the word (the 30 mm default made a 24 mm "Olivia" read "Oliuia")
        // (kept where it was: the piece's place is the curve's centre, so a wider curve threw the word up out of the hoop)
        // (and the word stays where it's shown when bent back or flipped: the curve's centre was kept as the place, so
        // each Straight / Arch up moved it a curve's height further down the hoop)
        const ring = p.kind === "text" && pieces.some((f) => f.kind === "frame" && Math.abs(f.x - p.x) < 0.5 && Math.abs(f.y - p.y) < 0.5 && ["circle", "oval", "scallop"].includes(f.shape));
        const wordY = (shape, y) => (arc(shape) ? y + (shape === "up" ? -1 : 1) * (p.ry ?? p.radius) : y);
        if (p.kind === "text" && k === "shape" && arc(p.shape) && !arc(was)) {
          delete p.ry;
          const ff = followFrame(p, pieces);
          if (ff) Object.assign(p, ff);
          else { const { radius } = archStart(p); p.radius = radius; p.y = Math.round((p.y + (p.shape === "up" ? radius : -radius)) * 2) / 2; }
        } else if (p.kind === "text" && k === "shape" && arc(was) && !ring) {
          const y = wordY(was, p.y);
          p.y = Math.round((arc(p.shape) ? y - (p.shape === "up" ? -1 : 1) * (p.ry ?? p.radius) : y) * 2) / 2;
        }
      }, true, true);
      editor();
    }
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
  function end() { if (drag) { const moved = drag.moved; drag = null; if (moved) { fitted = false; settle(); } save(); if (moved) { make(); warn(); } } }
  // nothing selected (Escape, or a tap on empty preview): copy then takes the whole design
  function deselect() {
    if (sel == null) return;
    const lost = $("st-edit").contains(document.activeElement);
    sel = null; save(); ui();
    if (lost) roving()?.focus();   // (Escape from the editor: the keyboard stays in the list)
  }
  function nudge(dx, dy) { change((p) => { p.x += dx; p.y += dy; settle(); }); }
  // A layout that fits but spills past the hoop's field (pieces dragged or nudged off to one side) goes back to the
  // middle when the piece is let go: the machine centres it anyway, and the preview drew stitches past the hoop and
  // off the canvas with Download on. Inside the field, pieces stay where they're put.
  function settle() {
    const bs = pieces.map(pieceBounds).filter(Boolean), hp = api.hoop(), lx = hp.w / 2 - 2, ly = hp.h / 2 - 2;
    if (!bs.length) return;
    const x0 = Math.min(...bs.map((b) => b[0])), y0 = Math.min(...bs.map((b) => b[1])), x1 = Math.max(...bs.map((b) => b[2])), y1 = Math.max(...bs.map((b) => b[3]));
    if ((x0 < -lx || x1 > lx || y0 < -ly || y1 > ly) && x1 - x0 <= 2 * lx && y1 - y0 <= 2 * ly) recentre();
  }
  function center() { change((p) => { p.x = 0; p.y = 0; }, true); }
  $("st-center").onclick = center;
  // shrink (or grow) everything together so the whole design fills the hoop, less a little room
  $("st-fit").onclick = () => { remember(); fitHoop(); };
  function fitHoop(draw = true) {
    const bs = pieces.map(pieceBounds).filter(Boolean);
    if (!bs.length) return;
    const w = Math.max(...bs.map((b) => b[2])) - Math.min(...bs.map((b) => b[0])), h = Math.max(...bs.map((b) => b[3])) - Math.min(...bs.map((b) => b[1]));
    const hp = api.hoop();
    fitted = true;
    // (made smaller, sizes round down: rounded to the nearest half mm, an 8 mm word shrunk by 2 % stayed 8 mm, so
    // Fit to hoop on a design of small lettering moved the pieces closer and never fitted)
    const scale = (f) => { for (const p of pieces) {
      p.x *= f; p.y *= f;
      if (p.kind === "file") resizeFile(p, (p.scale || 1) * f);
      else for (const k of ["size", "radius", "ry", "w", "h"]) if (p[k] != null) p[k] = (f < 1 ? Math.floor : Math.round)(p[k] * f * 2) / 2;
    } };
    scale(Math.min((hp.w - 10) / w, (hp.h - 10) / h));
    recentre();   // (in the middle, as the machine sews it: a fitted layout said "Off centre here")
    // the outlines leave out satin width and swashes: shrink again until what's sewn fits (a few tries at most)
    for (let i = 0; i < 6; i++) {
      try { compose(pieces, hp, { fabric, baste, thread, later: [] }); break; }
      catch (err) { if (!err.overBy) break; scale(0.98 / err.overBy); }
    }
    if (draw) { save(); ui(); make(); }
  }

  $("st-undo").onclick = undo;
  $("st-redo").onclick = redo;
  // a design file to keep and change later (the pieces, not the stitches)
  $("st-save").onclick = () => {
    // (with the hoop it was laid out in and its turn: a turned design reopened said Too big)
    const r = api.handOut([{ name: `${api.safeName(firstWords(), "design")}.needleworks.json`,
      bytes: JSON.stringify({ needleworks: 1, pieces, fabric, baste, thread, fitted, ...(two ? { two } : {}), hoop: api.hoopId(), turned: api.turned() }, null, 1) }]);
    if (!r.ok) api.showError(r.error === "The saved design is empty." ? "Add a piece first: there's nothing to save yet." : r.error);
  };
  const bad0 = "it isn't a design saved from this page, or it's damaged (saved designs end in .needleworks.json)";
  $("st-load").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      // (a damaged file said "Expected property name or '}' in JSON at position 1"; one wording for every file that
      // can't be read: it was four, one of them a raw "Maximum call stack size exceeded")
      const bad = () => new Error(bad0);
      let data; try { data = JSON.parse(await f.text()); } catch { throw bad(); }
      if (!data || data.needleworks !== 1 || !Array.isArray(data.pieces)) throw bad();
      // every piece checked and clamped (`cleanPiece`): ones that can't be read are left out, and said so
      const pairs = data.pieces.map((p) => [p, cleanPiece(p)]), loaded = pairs.map(([, q]) => q).filter(Boolean);
      if (!loaded.length) throw bad();
      // (words past the editor's 60 letters, or initials past 12, are cut: said so plainly)
      // (measured on the words tidied, as they're kept: accents typed apart, which join up, aren't letters cut)
      const cut = pairs.some(([p, q]) => q && typeof p.text === "string" && typeof q.text === "string" && q.text.length < tidy(p.text, { lines: 3 }).length) || pairs.some(([p, q]) => q?.letters && tidy(p.letters).length > q.letters.length);
      // (a setting it had that came out different; ones it lacked and got filled in aren't counted)
      const changed = pairs.filter(([p, q]) => q && Object.keys(p).some((k) => k !== "id" && k !== "text" && k !== "letters" && JSON.stringify(p[k]) !== JSON.stringify(q[k]))).length;
      remember(); nextId = 1; pieces = loaded.map((p) => ({ ...p, id: nextId++ })); sel = pieces[pieces.length - 1].id;
      fabric = own(FABRICS, data.fabric) ? data.fabric : "cotton"; baste = data.baste === true; thread = own(THREADS, data.thread) ? String(data.thread) : "auto"; fitted = data.fitted === true; two = data.two === true;
      from = f.name.replace(/\.needleworks\.json$|\.json$/i, "");
      // the hoop (when this machine has it) and the turn it was saved with
      if (typeof data.hoop === "string") api.setHoop(data.hoop);
      api.setTurn(data.turned === true);
      // (a size past what any hoop holds, cut down to the biggest piece there can be, is then fitted to this hoop:
      // `size: 1e9` opened as a 486 mm "Emma")
      const huge = pairs.some(([p, q]) => q && ["size", "w", "h"].some((k) => typeof p[k] === "number" && q[k] < p[k]));
      if (huge) try { compose(pieces, api.hoop(), { fabric, baste, thread, later: [] }); } catch (err) { if (err.overBy) fitHoop(false); }
      settle(); save(); ui(); make();
      const left = data.pieces.length - loaded.length;
      if (left || changed || cut) toast([left ? `${left} ${left === 1 ? "piece" : "pieces"} in that file couldn't be read and ${left === 1 ? "was" : "were"} left out.` : "",
        cut ? "Words longer than this page takes (60 letters, 12 initials) were cut short." : "",
        changed ? `${changed === 1 ? "One piece had settings" : `${changed} pieces had settings`} this page doesn't have: ${changed === 1 ? "it was" : "they were"} set to the nearest that works.` : ""].filter(Boolean).join(" "), null, 12000);
    } catch (err) { console.error(err); api.showError("That design couldn't be opened: " + (err instanceof RangeError || err instanceof TypeError ? bad0 : err.message)); }
  };
  document.addEventListener("keydown", (e) => {
    if (document.body.dataset.mode !== "design" || e.defaultPrevented || e.target.matches?.("input[type=text], textarea, [role=tab]")) return;
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if ((e.metaKey || e.ctrlKey) && k === "z") { e.preventDefault(); undo(); return; }
    // Delete / Backspace removes the selected piece (from the page or the preview, never while typing)
    if ((e.key === "Delete" || e.key === "Backspace") && (e.target === document.body || e.target.id === "view") && current()) {
      e.preventDefault(); $("st-pieces").querySelector(`[data-op="del"][data-id="${sel}"]`)?.click(); sel = null; save(); ui(); return;
    }
    // Escape unselects the piece (anywhere on the Design tab but a text box, a menu or a dialog)
    if (e.key === "Escape" && !typing(e.target) && !document.querySelector("dialog[open]") && current()) { e.preventDefault(); deselect(); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (arrows && (e.target === document.body || e.target.id === "view")) { e.preventDefault(); nudge(arrows[0] * (e.shiftKey ? 5 : 1), arrows[1] * (e.shiftKey ? 5 : 1)); }
  });
  // ⌘C / ⌘V copy and paste the selected piece, or the whole design when none is (as a saved design's JSON, so it pastes
  // into another window too); anywhere on the Design tab but a text box or selected text (a piece picked in the list
  // didn't count, only the preview), and a picture on the clipboard is left to the picture tab
  const typing = (t) => t?.matches?.("input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=color]):not([type=file]), textarea, select, [contenteditable], [contenteditable] *");
  const onPage = (e) => document.body.dataset.mode === "design" && !typing(e.target) && !typing(document.activeElement) && !document.querySelector("dialog[open]") && !getSelection()?.toString();
  document.addEventListener("copy", (e) => {
    const p = current(); if (!onPage(e) || !pieces.length) return;
    e.preventDefault(); e.clipboardData.setData("text/plain", JSON.stringify({ needleworks: 1, pieces: p ? [p] : pieces }));
    toast(p ? `Copied ${label(p)}. Paste to add a copy.` : `Copied the whole design. Paste to add a copy.`);
  });
  document.addEventListener("paste", (e) => {
    if (!onPage(e) || e.clipboardData?.files?.length) return;
    let got; try { got = JSON.parse(e.clipboardData.getData("text/plain")); } catch { return; }
    const ps = got?.needleworks === 1 && Array.isArray(got.pieces) ? got.pieces.map(cleanPiece).filter(Boolean) : [];
    if (!ps.length) return;
    e.preventDefault(); remember(); fitted = false;
    const add = ps.map((q) => ({ ...structuredClone(q), id: nextId++ })), bs = add.map(pieceBounds).filter(Boolean);
    // one piece goes where a new one would (`place`): beside its original, or in a frame, or in free space
    if (add.length === 1 && pieces.length) { if (place(add[0], (q) => pieces.push(q))) toast(`Pasted ${label(add[0])}.`); return; }
    // several in free space beside what's there (below, else above), moved together, then the layout recentred: it was
    // pasted just below the original, half out of the hoop; with no room left, said so (it went below anyway, into
    // two hoopings)
    const go = (box, at) => {
      const dx = at[0] - (box[0] + box[2]) / 2, dy = at[1] - (box[1] + box[3]) / 2;
      for (const c of add) { c.x = Math.round((c.x + dx) * 2) / 2; c.y = Math.round((c.y + dy) * 2) / 2; }
      pieces.push(...add); sel = add.length === 1 ? add[0].id : null;
      recentre(); save(); ui(); make();
    };
    if (bs.length && pieces.length) {
      const box = [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))], at = spotFor(box);
      if (!at) { toast(`There's no free room in the hoop for ${add.length} more pieces. Make something smaller, or take something out first.`, { label: "Paste anyway", run: () => { remember(); fitted = false; go(box, spotFor(box, true)); } }); return; }
      go(box, at);
    } else go([0, 0, 0, 0], [0, 0]);
    toast(add.length === 1 ? `Pasted ${label(add[0])}.` : `Pasted ${add.length} pieces.`);
  });
  // the smallest a new piece is made to fit a frame: half its size for lettering, what still stitches well for the
  // rest (a filled motif under 25 mm starts to lose its detail, and the editor says so, but inside the quilt block's
  // frame beats outside it)
  const least = (p) => (p.size == null ? p.size : p.kind === "text" ? Math.max(5, Math.round(p.size) / 2) : p.kind === "monogram" ? Math.min(p.size, 15)
    : p.kind === "motif" ? Math.min(p.size, 20) : p.kind === "letters" ? Math.min(p.size, 30) : p.size);
  // could p at `size` fit a w x h box at all? (its box at its own size scaled, with a little to spare: stitching each
  // size of a 60 mm appliqué AB that couldn't fit held "+ Appliqué letters" up for 1.2 s)
  function roughly(p) {
    const b = p.size == null ? null : pieceBounds({ ...p, x: 0, y: 0 });
    return (size, w, h) => !b || ((b[2] - b[0]) * size) / p.size <= w + 2 && ((b[3] - b[1]) * size) / p.size <= h + 2;
  }
  // made smaller to find it room, a piece must still stitch cleanly (and on a towel, keep its letters open): "Move it
  // to the free space in the circle, 17 mm" closed a towel monogram up
  const MOTIF_MIN = (q) => (q.kind === "motif" ? MOTIF_LEAST[q.style || "fill"] || 0 : 0);
  const readable = (q) => !minSize(q) && !(fabric === "towel" && (q.kind === "text" || q.kind === "monogram") && towelMin(q) > q.size * 1.04);
  // x, y that put p in the middle of frame f's front (a zipper pouch's is below the zipper)
  function middleOf(f, p) {
    const fb = pieceBounds({ ...p, x: 0, y: 0 }), [t, b] = frontPanel(f);
    return fb ? { x: Math.round((f.x - (fb[0] + fb[2]) / 2) * 2) / 2, y: Math.round(((t + b) / 2 - (fb[1] + fb[3]) / 2) * 2) / 2 } : { x: p.x, y: p.y };
  }
  // Where p goes inside the biggest (unturned) frame with room for it, running into nothing: in the middle of the
  // frame's front, or below, above or beside what's in it already, at its own size or smaller (10 % steps, down to
  // `least`). { f, x, y, size }, or null.
  // (`fix`: as a one-tap fix, no smaller than the piece's style stitches well either: "Move it to the free space, 20.5
  // mm" made a filled motif too small for its detail; a new piece may go that small, and the editor says so)
  function spotIn(p, fix = false) {
    const H = (f) => (f.shape === "circle" ? f.w : f.h), others = pieces.filter((o) => o.id !== p.id);
    const frames = others.filter((f) => f.kind === "frame" && !(f.rot || 0)).sort((a, b) => b.w * H(b) - a.w * H(a));
    if (!frames.length) return null;
    const sizes = p.size == null ? [p.size] : [...new Set(Array.from({ length: 10 }, (_, i) => Math.max(least(p), Math.round(p.size * (1 - i / 10) * 2) / 2)))];
    const big = roughly(p);
    for (const size of sizes) {
      if (!frames.some((f) => big(size, f.w, H(f)))) continue;
      const q0 = { ...p, size }, fb = pieceBounds({ ...q0, x: 0, y: 0 });
      if (!fb || (size !== p.size && (!readable(q0) || (fix && size < MOTIF_MIN(q0) && p.size >= MOTIF_MIN(q0))))) continue;
      const cx = (fb[0] + fb[2]) / 2, cy = (fb[1] + fb[3]) / 2;
      for (const f of frames) {
        // what's in it already (frames too: the quilt block's heart), and the spots round that
        const [t] = frontPanel(f), mid = middleOf(f, q0), bs = others.filter((o) => o !== f && inFrame(o, f, -2)).map(pieceBounds).filter(Boolean);
        const spots = [[mid.x, mid.y]];
        if (bs.length) {
          const L = Math.min(...bs.map((b) => b[0])), T = Math.min(...bs.map((b) => b[1])), R = Math.max(...bs.map((b) => b[2])), B = Math.max(...bs.map((b) => b[3]));
          spots.push([mid.x, B + 4 - fb[1]], [mid.x, T - 4 - fb[3]], [R + 4 - fb[0], (T + B) / 2 - cy], [L - 4 - fb[2], (T + B) / 2 - cy]);
        }
        for (const [x, y] of spots) {
          const q = { ...q0, x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 };
          // (on a zipper pouch, clear of the zipper band and its topstitch)
          if (f.border === "zip" && q.y + fb[1] < t + 3) continue;
          if (!inFrame(q, f, f.border === "patch" ? 3 : 4) || touching(q, others)) continue;
          // (at the size the frame then sews it: "Shrunk to 23.5 mm so it fits" under a monogram just put in at 24)
          const ps = pieces.some((o) => o.id === p.id) ? pieces.map((o) => (o.id === p.id ? q : o)) : [...pieces, q];
          return { f, x: q.x, y: q.y, size: fittedSizes(ps).get(p.id) ?? size };
        }
      }
    }
    return null;
  }
  // does the layout with p added still fit the hoop's field (as boxes, at the sizes they're sewn)?
  function fitsWith(p) {
    const [w, h] = layoutSize(p ? [...pieces, p] : pieces), hp = api.hoop();
    return w <= hp.w - 5 && h <= hp.h - 5;
  }
  // The nearest free space for a new piece where a frame had no room (`spotIn`): its box 2 mm clear of every other
  // piece's box and running into nothing, the whole layout still fitting the hoop's field, at its own size or smaller
  // (10 % steps down to `least`), as near the middle of what's there as it can be (above costs a little more than
  // below). On an in-the-hoop project (`ith`) it stays on the project's front. { x, y, size } or null: no room left.
  function freeRoom(p, ith, sameSize = false) {
    const hp = api.hoop(), fw = hp.w - 5, fh = hp.h - 5, fit = fittedSizes(pieces);
    const boxes = pieces.map((o) => [o, pieceBounds(fit.has(o.id) ? { ...o, size: fit.get(o.id) } : o)]).filter(([, b]) => b);
    if (!boxes.length) return null;
    const obst = boxes.filter(([o]) => o !== ith).map(([, b]) => b), all = boxes.map(([, b]) => b);
    const L = Math.min(...all.map((b) => b[0])), T = Math.min(...all.map((b) => b[1])), R = Math.max(...all.map((b) => b[2])), B = Math.max(...all.map((b) => b[3]));
    const [ft, fb0] = ith ? frontPanel(ith) : [0, 0], prefer = ith ? [ith.x, (ft + fb0) / 2] : [(L + R) / 2, (T + B) / 2];
    const sizes = p.size == null || sameSize ? [p.size] : [...new Set(Array.from({ length: 10 }, (_, i) => Math.max(least(p), Math.round(p.size * (1 - i / 10) * 2) / 2)))];
    const area = ith ? pieceBounds(ith) : [R - fw, B - fh, L + fw, T + fh], big = roughly(p);
    for (const size of sizes) {
      if (!big(size, area[2] - area[0], area[3] - area[1])) continue;
      const q0 = { ...p, size }, fb = pieceBounds({ ...q0, x: 0, y: 0 });
      if (!fb || (size !== p.size && !readable(q0))) continue;
      // where its box keeps the whole layout within the field (or within the project's front)
      const x0 = area[0] - fb[0], x1 = area[2] - fb[2], y0 = Math.max(area[1], ith ? ft + (ith.border === "zip" ? 3 : 0) : -Infinity) - fb[1], y1 = area[3] - fb[3];
      if (x0 > x1 || y0 > y1) continue;
      const spots = [];
      for (let x = x0; x <= x1; x += 2) for (let y = y0; y <= y1; y += 2) {
        const bx = [x + fb[0] - 2, y + fb[1] - 2, x + fb[2] + 2, y + fb[3] + 2];
        if (obst.some((o) => o[0] < bx[2] && bx[0] < o[2] && o[1] < bx[3] && bx[1] < o[3])) continue;
        const dx = x + (fb[0] + fb[2]) / 2 - prefer[0], dy = y + (fb[1] + fb[3]) / 2 - prefer[1];
        spots.push([Math.hypot(dx, dy < 0 ? dy * 1.2 : dy), x, y]);
      }
      spots.sort((a, b) => a[0] - b[0]);
      for (const [, x, y] of spots.slice(0, 150)) {
        const q = { ...q0, x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 };
        if (ith && !inFrame(q, ith, 4)) continue;
        if (p.kind !== "frame" && touching(q, pieces)) continue;
        // (rounded to the half mm, a spot on the field's edge could take the layout 0.08 mm past it: the design then
        // counted as two hoopings already, and every later piece went below it, out of the hoop)
        if (!ith && !fitsWith(q)) continue;
        // (at the size a frame it lands in then sews it, as `spotIn` does)
        return { x: q.x, y: q.y, ...(p.size == null ? {} : { size: fittedSizes([...pieces, q]).get(p.id) ?? size }) };
      }
    }
    return null;
  }
  // nothing added: there's no room for it, said plainly (with "Add it anyway" where that can still be sewn, in two
  // hoopings or a bigger hoop; not on an in-the-hoop project, where it would sew on the bare stabilizer)
  function noRoom(p, ith, insert = (q) => pieces.push(q)) {
    const what = { text: "more lettering", monogram: "a monogram", letters: "appliqué letters", frame: "another frame" }[p.kind] || `a ${label(p).toLowerCase()}`;
    if (ith) { toast(`There's no free room ${ith.border === "zip" ? "on the pouch's front" : `inside the ${label(ith).toLowerCase()}`} for ${what}. Make what's there smaller, or take something out first.`, null, 8000); return; }
    toast(`There's no free room in the hoop for ${what}. Make something smaller, or take something out first.`, { label: "Add it anyway", run: () => {
      remember(); fitted = false; freeSpot(p, "down"); insert(p); sel = p.id; recentre(); save(); ui(); make();
    } });
  }
  // a new piece in free space beside what's there: above or below (the other way if that doesn't fit the hoop)
  function freeSpot(p, prefer) {
    const bs = pieces.map(pieceBounds).filter(Boolean), fb = pieceBounds({ ...p, x: 0, y: 0 }), hp = api.hoop();
    if (!bs.length || !fb) return;
    const top = Math.min(...bs.map((b) => b[1])), bottom = Math.max(...bs.map((b) => b[3])), lim = hp.h / 2 - 5;
    const up = top - 4 - fb[3], down = bottom + 4 - fb[1], fitsUp = up + fb[1] >= -lim, fitsDown = down + fb[3] <= lim;
    p.x = 0; p.y = prefer === "down" ? (fitsDown || !fitsUp ? down : up) : (fitsUp || !fitsDown ? up : down);
  }
  // where to centre a box (mm) of pasted pieces: below everything when the whole layout then fits the hoop's field, else
  // above, else beside it (right, then left), else below anyway (the layout says it's too big)
  function spotFor([x0, y0, x1, y1], anyway = false) {
    const bs = pieces.map(pieceBounds).filter(Boolean), hp = api.hoop(), w = x1 - x0, h = y1 - y0;
    const L = Math.min(...bs.map((b) => b[0])), T = Math.min(...bs.map((b) => b[1])), R = Math.max(...bs.map((b) => b[2])), B = Math.max(...bs.map((b) => b[3]));
    const fits = (cx, cy) => Math.max(R, cx + w / 2) - Math.min(L, cx - w / 2) <= hp.w - 5 && Math.max(B, cy + h / 2) - Math.min(T, cy - h / 2) <= hp.h - 5;
    const mx = (L + R) / 2, my = (T + B) / 2;
    const spots = [[mx, B + 4 + h / 2], [mx, T - 4 - h / 2], [R + 4 + w / 2, my], [L - 4 - w / 2, my]];
    return spots.find(([cx, cy]) => fits(cx, cy)) || (anyway ? spots[0] : null);
  }
  // the whole layout back to the middle of the hoop (the machine centres it anyway; the preview should too)
  // another of in-the-hoop frame f and everything on it, beside it across its short side (two bookmarks fit a 5x7
  // that way), the layout recentred; said and undone if it doesn't fit the hoop (turned when that's what fits)
  function twoUp(f) {
    if (!f || f.kind !== "frame") return;
    const on = pieces.filter((q) => q === f || (q.kind !== "frame" && inFrame(q, f, -2)));
    const twins = pieces.filter((q) => q.kind === "frame" && q.border === f.border && q.shape === f.shape);
    const across = f.w >= (f.shape === "circle" ? f.w : f.h), step = (across ? (f.shape === "circle" ? f.w : f.h) : f.w) + 8;
    // (past the last one already there: a third goes beside the second)
    const far = twins.reduce((m, q) => Math.max(m, across ? q.y - f.y : q.x - f.x), 0);
    const copies = on.map((q) => ({ ...structuredClone(q), id: nextId++, ...(across ? { y: q.y + far + step } : { x: q.x + far + step }) }));
    remember(); pieces = [...pieces, ...copies]; recentre();
    const fit = (() => { try { compose(pieces, api.hoop(), { fabric, baste, thread, later: [] }); return "fits"; } catch (err) { if (!err.overBy) throw err; }
      if (api.hoop().w !== api.hoop().h) { api.setTurn(!api.turned()); try { compose(pieces, api.hoop(), { fabric, baste, thread, later: [] }); return "turned"; } catch (err) { api.setTurn(!api.turned()); if (!err.overBy) throw err; } }
      return ""; })();
    // (recentre moved the originals too: put everything back as it was, with no redo left behind)
    if (!fit) { undo(); future.length = 0; buttons(); toast(`Another ${shapeLabel(f)} doesn't fit this hoop beside the first. Make it smaller first, or pick a bigger hoop.`); return; }
    if (fit === "turned") api.fit();
    sel = copies[0].id; save(); ui(); make();
    toast(`Two ${shapeLabel(f)}s in the hoop${fit === "turned" ? " (hoop turned to fit)" : ""}: they sew in the same steps.`, { label: "Undo", run: undo });
  }
  const shapeLabel = (f) => label(f).toLowerCase();
  function recentre() {
    const all = pieces.map(pieceBounds).filter(Boolean);
    if (!all.length) return;
    const cx = (Math.min(...all.map((b) => b[0])) + Math.max(...all.map((b) => b[2]))) / 2, cy = (Math.min(...all.map((b) => b[1])) + Math.max(...all.map((b) => b[3]))) / 2;
    // (one shift for all, in half mm: rounding each piece on its own moved them up to half a mm apart)
    const sx = Math.round(cx * 2) / 2, sy = Math.round(cy * 2) / 2;
    for (const q of pieces) { q.x = Math.round((q.x - sx) * 2) / 2; q.y = Math.round((q.y - sy) * 2) / 2; }
  }
  // add an opened design (PES/PEC/DST) as a piece, to combine a motif with lettering
  $("st-file").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const d = readEmbroidery(new Uint8Array(await f.arrayBuffer()), f.name);
      remember();
      const blocks = fileBlocks(d), p = piece({ kind: "file", name: f.name.replace(/\.[^.]+$/, ""), blocks, color: blocks[0].color });
      // in free space, above what's there (or below, if only that fits), not on top of it: centred, a bought design
      // landed on the lettering. It sews first, after any frames, so lettering added under it sews on top.
      // (where there's room, as any new piece: it went above everything, the design then two hoopings)
      freeSpot(p, "up");
      if (!place(p, (q) => { const at = pieces.findIndex((o) => o.kind !== "frame"); pieces.splice(at < 0 ? pieces.length : at, 0, q); })) return;
      recentre(); save(); ui(); make();
    } catch (err) { api.showError("That file couldn't be added: " + err.message); }
  };

  $("st-guide").hidden = !!api.store.get("studio.guideSeen", false);
  $("st-guide-close").onclick = () => { $("st-guide").hidden = true; api.store.set("studio.guideSeen", true); };

  // one file per name: the biggest lettering (the name, nearly always) gets each name in turn; when that's a monogram
  // (the coaster, the key fob), each line's initials take its place
  function forNames() {
    const p = main();
    if (!p) return null;
    const mono = p.kind === "monogram";
    // (a design that already runs into itself isn't shrunk name by name for it: every name would come out smaller)
    const clean = !collision(pieces), opts = { fabric, baste, thread };
    return {
      what: mono ? p.letters : unswashed(p.text).replace(/\s*\n\s*/g, " / "), monogram: mono,
      // the ZIP is named after the design (the starter or the saved file it came from), not "names_4.zip"
      zip: api.safeName(from || label(pieces.find((q) => q.kind === "frame") || p), "names"),
      // Each name is checked like the design itself: a letter the font lacks is refused (a stand-in glyph was stitched),
      // and a name that runs into another piece is made smaller with `shrink` (Lily-Rose's y in the bib's heart) or
      // said. shrink: a name too long for the hoop, or running into something, is tried at 90 %, 80 %… down to half.
      // With the hoop turned every file is turned like the design (`turned`), as the steps and the hooping note say:
      // names that fit upright came out upright beside turned ones, and a towel hooped sideways for the batch sewed
      // them across it. Each name is drawn at the design's own letter scale (`inkHeight`: the size is the height of
      // the word's strokes, so "emma", with no capital, came out twice Emma's size); fewer initials grow to the
      // monogram's width (`monoSize`).
      build: (name, shrink = false) => {
        if (!/[\p{L}\p{N}]/u.test(name)) throw new Error("no letters to stitch");
        // (as long as the editor takes, `MAX_WORDS`: a 200-letter name drew nothing and its file held the heart alone)
        const most = mono ? MAX_INITIALS : MAX_WORDS;
        if (name.length > most) throw new Error(`too long: ${most} letters and spaces at most`);
        const gone = missing(name, p.font);
        if (gone.length) throw new Error(`the font has no ${lackList(gone)}`);
        if (mono && initials(name).length > 3) throw new Error("a monogram takes 3 initials at most");
        // (each name keeps the design's swashes: "~Emma~" -> "~Lily~")
        const ls = (p.text || "").split("\n").filter((l) => l.trim()), ends = (t) => withSwash(withSwash(t, "lead", swashes(ls[0] || "").lead), "tail", swashes(ls[ls.length - 1] || "").tail);
        const h0 = mono ? 0 : inkHeight(p.text.split("\n").find((l) => l.trim()) || p.text, p.font), h1 = mono ? 0 : inkHeight(name, p.font);
        const size0 = mono ? monoSize(p, name, pieces) : h0 && h1 ? Math.min(60, (p.size * h1) / h0) : p.size;
        // A name the design sews bold stays bold where it can. Shrinking clear of something in 10 % steps, a step that
        // turns it thin goes back and walks down half a mm at a time from the last bold size first ("Jack" ran into the
        // bib's heart at 18 mm and sewed thin at 15.5 though 16 cleared it bold, as typed in the editor). Shrunk by a
        // frame to letters at least 85 % of the design's x-height, it's sewn bold (satin) rather than thin. A thin line
        // only where bold genuinely can't sew, and the dialog says so.
        const was = fittedSizes(pieces).get(p.id) ?? p.size, bold = fabric !== "towel" && (p.style || "auto") === "auto" && !fineLine({ ...p, size: was });
        const xh = (q) => (mono ? q.size : letterMetrics(q.text.split("\n").find((l) => l.trim()) || q.text, q.font, q.size, "auto").xh || 0);
        const step = (v) => Math.round(v * 2) / 2;
        let f = 1, size = step(size0), lastBold = 0, floor = 0, refined = false;
        for (;;) {
          try {
            let q = { ...p, [mono ? "letters" : "text"]: mono ? name : ends(name), size }, ps = pieces.map((r) => (r.id === p.id ? q : r));
            // (lettering inside a frame shrinks to fit it, so a long name can come out small without f changing)
            const now = fittedSizes(ps).get(p.id) ?? q.size, ref = mono ? was : (size0 * was) / p.size, thin = bold && fineLine({ ...q, size: now });
            if (thin && lastBold && !refined && !floor && size < lastBold - 0.5) { floor = size; size = lastBold - 0.5; continue; }
            if (thin && xh({ ...q, size: now }) >= 0.85 * xh({ ...p, size: was }) && !minSize({ ...q, size: now })) { q = { ...q, style: "satin" }; ps = pieces.map((r) => (r.id === p.id ? q : r)); }
            const turned = api.turned(), pattern = compose(ps, api.hoop(), opts).design.pattern();
            const hit = clean && touching({ ...q, size: now }, ps);
            if (hit && shrink && f > 0.55) {
              if (floor && size - 0.5 > floor) { size -= 0.5; continue; }
              if (floor) { size = floor; floor = 0; refined = true; continue; }
              if (!thin) lastBold = size;
              f -= 0.1; size = step(size0 * f); continue;
            }
            // (never a file without the name in it)
            if (!pieceStitches({ ...q, size: now }).length) throw new Error("it comes out as no stitches");
            return { pattern, name, turned, runs: hit ? label(hit) : "", smaller: now < ref * 0.95,   // (said from 5 % smaller: "Ben (smaller)" stood beside an Ava the same height)
             thin: fabric !== "towel" && fineLine({ ...q, size: now }) && !fineLine({ ...p, size: was }) };
          }
          catch (err) { if (!shrink || !err.overBy || f < 0.55) throw err; f -= 0.1; size = step(size0 * f); floor = 0; }
        }
      },
    };
  }

  cards(); ui();
  const starter = (id, tweak) => pickStarter(STARTERS.find((x) => x.id === id), tweak);
  return { make, addWords, starter, relabel: () => { ui(); make(); }, start, move, end, nudge, deselect, forNames, remember, recentre: () => { remember(); recentre(); save(); ui(); make(); } };
}
