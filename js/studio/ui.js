/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Design tab UI: start from a card, edit pieces in a short list, drag them on the preview.
import { editorPanel } from "./editor.js";
import { problemsOfPieces, sewsThin } from "./problems.js";
import { layoutPanel } from "./layout.js";
import { offPage } from "./offpage.js";
import { stepsPanel } from "./stepsui.js";
import { fixes } from "./fixes.js";
import { tooBigWays } from "./toobig.js";
import { threadSaid } from "./threadsaid.js";
import { placing } from "./placing.js";
import { recentDesigns } from "./recent.js";
import { luminance, rgbOf } from "../core/colour.js";
import { APPLIQUE_FONTS, FONTS, fontOf, loadFont } from "../core/fonts.js";
import { ownFontNote, ownFontOption } from "./ownfont.js";
import { MAX_INITIALS, MAX_WORDS, initials, monogramHelp, lackList, lacks, reswashed, swashes, swashless, tidy, tidyField, unswashed, withSwash } from "../core/typed.js";
import { nearestBrotherThread } from "../core/threads.js";
import { designStats, machineThreads, readEmbroidery } from "../core/formats.js";
import { BLOCK, LOOK, TIP, explained, inchFirst, isolate, mmText, problemsItems, shownOn, stopWords } from "../words.js";
import { FILL_PATTERNS } from "../core/fill.js";
import { MARGIN } from "../core/machines.js";
import { draw } from "../render.js";
import { THREADING, TURN_PIC, pickIt, snipsSaid, turnedNote, youHtml } from "../sheet.js";
import { notEmbroidery, shortJumps } from "../doctor.js";
import { QUILTS, quiltOf } from "./quilt.js";
import { MOTIFS } from "./motifs.js";
import { sewAs, quiltDone, scaledFit, BORDERS, FABRICS, THREADS, SHAPES, TEXT_SHAPES, splitPieces, archFit, archStart, archWrap, ARCH, frontPanel, inkHeight, monoSize, archRoom, archShrink, archTight, cleanPiece, cleanPieces, clearSize, collision, collisions, inFrame, letterMetrics, underPatch, crossName, crossStep, layoutSize, touching, touchingAll, towelMin, fineLine, loopsFill, compose, fileBlocks, blocksPattern, scaleBlocks, FILE_SCALE, fittedSizes, fitFrame, sewnBoxes, sewn, sewnBox, followFrame, label, minSize, pieceBounds, pieceStitches, previewLook, smallText, bulkReady, carveDone, patchFillOf, drawAhead, pacer, PACED } from "./pieces.js";
import { forNames as namesFor } from "./names.js";
import { BLACK, BOLD, NAVY, RED, ROUND, SCRIPT, STARTERS, WHITE, appl, frame, ids, mono, motif, piece, text } from "./starters.js";
export { STARTERS } from "./starters.js";

// thread weight in plain words, on the chips (the number is printed on the spool; a bigger number is a finer thread)
const WT_TITLE = { auto: "Standard 40 weight thread, the usual machine embroidery thread", 30: "30 weight: a thicker thread, for bold letters",
  40: "40 weight: the usual machine embroidery thread", 60: "60 weight: a finer thread, for small letters and fine detail" };
const SMALL_TIP = "Small letters come out crisper with 60 wt thread (a finer thread: the weight is printed on the spool, and a bigger number is finer) and a 65/9 or 70/10 needle (a fine needle: the size is on the needle pack), and with the machine slowed down.";
export const COLORS = [RED, NAVY, "#00673e", "#770176", "#e8a900", "#f993bc", BLACK, "#f0f0f0"];

// the least a frame is made, each way: the Width and Height sliders' (a circle is w across both ways)
const FRAME_MIN = 20, frameH = (f) => (f.shape === "circle" ? f.w : f.h);

// A design saved from here (.needleworks.json), from a file's bytes, or null: dropped on the page, shared to it, opened on
// the Open tab or added with + Design file, it was called a damaged embroidery file.
export function savedDesign(bytes) {
  let i = 0; while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x0a || bytes[i] === 0x0d || bytes[i] === 0x09 || bytes[i] === 0xef || bytes[i] === 0xbb || bytes[i] === 0xbf)) i++;
  if (bytes[i] !== 0x7b) return null;   // ({)
  try { const d = JSON.parse(new TextDecoder().decode(bytes)); return d?.needleworks === 1 && Array.isArray(d.pieces) ? d : null; } catch { return null; }
}

// api: { hoop(), setView(pattern, filename, look) (null pattern: nothing to show), showError(msg), busy(on, text),
//        safeName(s, fb), escapeHtml(s), handOut(files, opts) (gate.js: the only way a file leaves), store, showStep(i), step(), setMode(mode),
//        threadLine(hex, machine name), threadHtml(hex, machine name) (app.js `threadLabel`: one thread label everywhere),
//        fileThreads(threads), maker() (whose threads the file names, and their names: state.js) }
export function initStudio(api) {
  const $ = (id) => document.getElementById(id);
  // The editor's state and helpers as they are when read, for the parts of the editor that live in their own files
  // (names.js, recent.js...): a part takes what it uses from here.
  const S = {
    api, $,
    get main() { return main; },
    get pieces() { return pieces; }, set pieces(v) { pieces = v; },
    get fabric() { return fabric; }, set fabric(v) { fabric = v; },
    get baste() { return baste; }, set baste(v) { baste = v; },
    get thread() { return thread; }, set thread(v) { thread = v; },
    get title() { return title; }, set title(v) { title = v; },
    get from() { return from; }, set from(v) { from = v; },
    get fitted() { return fitted; }, set fitted(v) { fitted = v; },
    get two() { return two; }, set two(v) { two = v; },
    get tip() { return tip; }, set tip(v) { tip = v; },
    get edited() { return edited; }, set edited(v) { edited = v; },
    get sent() { return sent; }, set sent(v) { sent = v; },
    get firstWords() { return firstWords; },
    get idle() { return idle; },
    get fontsIn() { return fontsIn; },
    get openDesign() { return openDesign; },
    get toast() { return toast; },
    get save() { return save; },
    get undo() { return undo; },
    get sel() { return sel; }, set sel(v) { sel = v; },
    get MOTIF_LEAST() { return MOTIF_LEAST; },
    get shapeLabel() { return shapeLabel; },
    get remember() { return remember; },
    get ui() { return ui; },
    get make() { return make; },
    get current() { return current; },
    get least() { return least; },
    get newProblem() { return newProblem; },
    get recentre() { return recentre; },
    get resizeFile() { return resizeFile; },
    get hoopings() { return hoopings; }, set hoopings(v) { hoopings = v; },
    get guides() { return guides; }, set guides(v) { guides = v; },
    get drawnId() { return drawnId; }, set drawnId(v) { drawnId = v; },
    get SMALL_TIP() { return SMALL_TIP; },
    get problems() { return problems; }, set problems(v) { problems = v; },
    get seq() { return seq; }, set seq(v) { seq = v; },
    get stepsOf() { return stepsOf; },
    get fileName() { return fileName; },
    get fixHint() { return fixHint; },
    get stepsUI() { return stepsUI; },
    get firstStep() { return firstStep; },
    get threadNames() { return threadNames; },
    get sameSpool() { return sameSpool; },
    get explainAll() { return explainAll; },
    get turnText() { return turnText; },
    get snap() { return snap; },
    get fitHoop() { return fitHoop; },
    get mostScale() { return mostScale; },
    get landing() { return landing; },
    get frameH() { return frameH; },
    get FRAME_MIN() { return FRAME_MIN; },
    get freeRoom() { return freeRoom; },
    get pieceProblems() { return pieceProblems; },
    get probe() { return probe; },
    get bareNow() { return bareNow; }, set bareNow(v) { bareNow = v; },
    get lastSmall() { return lastSmall; }, set lastSmall(v) { lastSmall = v; },
    get lastSteps() { return lastSteps; }, set lastSteps(v) { lastSteps = v; },
    get smallNow() { return smallNow; },
    get lettered() { return lettered; },
    get floated() { return floated; },
    get appliqued() { return appliqued; },
    get relabelThreads() { return relabelThreads; },
    get threadTip() { return threadTip; },
    get editor() { return editor; },
    get change() { return change; },
    get missing() { return missing; },
    get hard() { return hard; },
    get against() { return against; },
    get overlapping() { return overlapping; },
    get nextTask() { return nextTask; },
    get runUp() { return runUp; },
    get shown() { return shown; },
    get frameLines() { return frameLines; },
    get twoLines() { return twoLines; },
    get frameOf() { return frameOf; },
    get frameFor() { return frameFor; },
    get display() { return display; },
    get sizeChange() { return sizeChange; },
    get roomIn() { return roomIn; },
    get worseSaid() { return worseSaid; },
    get keepWord() { return keepWord; },
    get spotIn() { return spotIn; },
    get moveAway() { return moveAway; },
    get and() { return and; },
    get grown() { return grown; },
    get asLettering() { return asLettering; },
    get lineChoice() { return lineChoice; },
    get hoopLines() { return hoopLines; },
    get autoName() { return autoName; },
    get moreOpen() { return moreOpen; }, set moreOpen(v) { moreOpen = v; },
    get warnTimer() { return warnTimer; }, set warnTimer(v) { warnTimer = v; },
    get swashOn() { return swashOn; },
    get fontSelect() { return fontSelect; },
    get fontRow() { return fontRow; },
    get range() { return range; },
    get seg() { return seg; },
    get stitchSeg() { return stitchSeg; },
    get pairUI() { return pairUI; },
    get swatches() { return swatches; },
    get threadOf() { return threadOf; },
    get machineName() { return machineName; },
    get sameTargets() { return sameTargets; },
    get fileSize() { return fileSize; },
    get allThread() { return allThread; },
    get showPicked() { return showPicked; },
    get warn() { return warn; },
    // (parts: more of the editor's state and helpers as they need them)
  };
  // the editor's parts (each reads the editor through S when it's used, so they can all be made here)
  const { newProblem, landing, hard, against, overlapping, runUp, frameLines, twoLines, frameOf, frameFor, display, sizeChange, roomIn, worseSaid, keepWord, moveAway, and, grown, asLettering, lineChoice, hoopLines, roundAll, carried, asText, sewAfter, resizeFrame } = fixes(S);
  const { recentUI, keptSaid, keep } = recentDesigns(S);
  const { arrangeUI } = layoutPanel(S);
  const { swatchTip, threadOf, machineName, allThread, threadTip, threadNames, sameSpool, relabelThreads, oneThread } = threadSaid(S);
  const { split, appliqued } = tooBigWays(S);
  const { spotIn, freeRoom, freeSpot, sewnAt, noRoom, onFrame, fitsWith, ungang, spotFor, MOTIF_MIN, alike } = placing(S);
  const { stepsOf, stepsUI, firstStep, explainAll } = stepsPanel(S);
  const { resizeFile, fileSize, restitchFiles, quiltSoon } = offPage(S);
  const { pieceProblems, swashOn, warn } = problemsOfPieces(S);
  const { drawEditor } = editorPanel(S);
  const saved = api.store.get("studio", null);
  // (checked like an opened design: a crafted file's pieces stayed broken through a reload)
  let pieces = (Array.isArray(saved?.pieces) ? saved.pieces : []).map(cleanPiece).filter(Boolean);
  if (!pieces.length) pieces = STARTERS.find((s) => s.id === "framed").make();   // (a first visit: a name, not the initials "aMs")
  if (new Set(pieces.map((p) => p.id)).size < pieces.length || !pieces.every((p) => Number.isInteger(p.id))) pieces.forEach((p, i) => (p.id = i + 1));
  ids.next = Math.max(0, ...pieces.map((p) => p.id)) + 1;
  // (nothing selected stays so through a reload: `?? last` picked the last piece again)
  let sel = saved?.sel === null ? null : saved?.sel ?? pieces[pieces.length - 1]?.id, seq = 0, timer = 0;
  // what it's sewn on (changes the stitches for knit and towel) and the basting box
  // the design's thread colours in sewing order, one list per hooping, as the file's palette is made from them (set by
  // threadNames each time the design is made; `machineName`)
  let hoopings = [];
  // colours sewn only as guide lines hidden under fabric (an appliqué file's placement line): any thread will do
  let guides = new Set();
  let fabric = FABRICS[saved?.fabric] ? saved.fabric : "cotton", baste = !!saved?.baste, thread = THREADS[saved?.thread] ? String(saved.thread) : "auto";
  sewAs(fabric, thread);
  // made to fit with Fit to hoop: a font or style change that then takes it past the hoop fits it again
  let fitted = !!saved?.fitted, refitted = false;
  // sewn in two hoopings because they chose it ("Sew it in two hoopings"), until it fits one again: a design that grew
  // past the hoop was shared out between two files without a word (a pasted copy, a smaller hoop)
  let two = !!saved?.two;
  // the design's problems as last worked out (words.js), shown with the steps and handed to the view
  let problems = [];
  // where a piece's problem is fixed, for beside Download: { piece (the first one's id), many (more than one piece) }.
  // It said "Select the piece in the list for its fix" with that piece selected and its fix right below (round 13):
  // app.js offers a button that shows the fix, wherever the reader is
  const fixHint = () => {
    const ids = [...new Set(problems.filter((x) => x.piece != null && x.level !== TIP).map((x) => x.piece))];
    return ids.length ? { piece: ids[0], many: ids.length > 1 } : null;
  };
  // what the design is called (the starter it began as, or the saved file it came from), for the names ZIP
  let from = typeof saved?.from === "string" ? saved.from : "";
  // the file name they gave the design (Rename, beside Download), kept with it: every file it makes takes it (the PES,
  // two hoopings' ZIP, the names ZIP, the saved design, the cutter files). Empty: named from what's in it.
  let title = typeof saved?.title === "string" ? tidy(saved.title).slice(0, 60) : "";
  // the starter's tip (shown under the starters, and on the sew sheet), kept with the design it came with: a starter's
  // tip stayed up after Open saved and was printed on that design's sew sheet
  let tip = typeof saved?.tip === "string" ? saved.tip : "";

  // the starter's own way of hooping, for a project that can't be hooped (a made bib: `float`)
  const floated = () => STARTERS.find((s) => s.name === from)?.float;
  // changed since it was made (a starter or picture as it came isn't kept in Recent designs), downloaded since
  let edited = !!saved?.edited, sent = !!saved?.sent;
  const save = () => api.store.set("studio", { pieces, sel, fabric, baste, thread, fitted, two, from, title, tip, edited, sent });
  // undo: a snapshot before each change (a burst of slider moves counts as one), with the hoop's turn (a turned design
  // undone to unturned said Too big)
  // (a snapshot equal to the last one is skipped: picking a piece or a no-op starter made undo look dead for a press)
  // (with everything a new design resets, and the hoop: undoing a starter lost the file's name and the hoop's turn, and
  // undoing Open saved left the design it replaced in the hoop the saved one switched to, Too big)
  const history = [], future = [];
  let quiet = 0;
  const snap = () => JSON.stringify({ pieces, sel, fabric, baste, thread, fitted, two, turn: api.turned(), title, from, tip, hoop: api.hoopId() });
  const sameDesign = (a, b) => { const x = JSON.parse(a), y = JSON.parse(b); delete x.sel; delete y.sel; return JSON.stringify(x) === JSON.stringify(y); };
  function remember(burst = false) {
    api.hideToast();   // (a "Removed … Undo" note goes with the next change)
    edited = true;
    if (burst && Date.now() - quiet < 800) { quiet = Date.now(); return; }
    quiet = burst ? Date.now() : 0;
    const now = snap();
    if (history.length && sameDesign(history[history.length - 1], now)) return;
    history.push(now); if (history.length > 60) history.shift();
    future.length = 0; buttons();
  }
  const buttons = () => { $("st-undo").disabled = $("bar-undo").disabled = !history.length; $("st-redo").disabled = !future.length; };
  function restore(h) {
    let turn, hoop; ({ pieces, sel, fabric, baste, thread = "auto", fitted = false, two = false, turn, title = "", from = "", tip = "", hoop } = JSON.parse(h)); sewAs(fabric, thread);
    // (the hoop it was in, not offered as a roomier hoop: undoing Open saved said the 5x7 had room to make it bigger)
    if (hoop && hoop !== api.hoopId()) { api.setHoop(hoop); lastHoop = null; }
    if (turn != null) api.setTurn(turn);
    // (a note with an action is about the design as it was: "Replaced your design… Undo" stayed up after Undo, and
    // pressed, undid one step more)
    api.hideToast(true);
    edited = true; quiet = 0; buttons(); save(); ui(); make(); recentUI();
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
    const fonts = [...new Set(STARTERS.flatMap((s) => (s.make ? s.make() : []).concat(s.small ? s.small() : [])).filter((p) => p.font).map((p) => p.font).concat(SCRIPT))];
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
  // (each swatch's tooltip names the thread the file would give it, `machineName`: two of their spools both said "the
  // machine calls it Dark Gray", and the file gave the second Olive Green)
  const swatches = (p, k = "color") => COLORS.map((c) => `<button type="button" data-${k}="${c}" style="background:${c}" aria-pressed="${c === p[k]}" title="${api.escapeHtml(swatchTip(c, p[k], "", p))}"></button>`).join("")
    + `<span class="custom"><input type="color" data-${k}-any value="${p[k]}" aria-label="Any colour"></span>`
    + ((own) => own.length ? `<span class="own-swatches" role="group" aria-label="Your threads"><span class="hint">Yours:</span>${own.map((s) => `<button type="button" data-${k}="${s.hex}" style="background:${s.hex}" aria-pressed="${s.hex === p[k]}" title="${api.escapeHtml(swatchTip(s.hex, p[k], s.label, p))}" aria-label="Your ${api.escapeHtml(s.label)}"></button>`).join("")}</span>` : "")(api.ownedSpools?.() || []);
  const fontSelect = (p) => `<select data-k="font">${FONTS.map((f) => `<option value="${f.family}" ${f.family === p.font ? "selected" : ""}>${f.name}${f.print ? " (print)" : ""}</option>`).join("")}${ownFontOption()}</select>`;   // (the maker's own font file: studio/ownfont.js)
  // every font's name in its own lettering, in a row under the list to tap (names alone said nothing of the look); the
  // list stays the keyboard's and a screen reader's way to pick one
  // (each in its own lettering once the design's own fonts are in, `faces`: a row drawn in all of them asked for all 16 fonts
  // at once, and on a slow connection the preview waited ~31 s for the one font the design uses)
  let faces = false;
  const fontRow = (p, list = FONTS) => `<div class="font-row" role="group" aria-label="Fonts as they look">${list.map((f) => `<button type="button" tabindex="-1" data-font="${f.family}" aria-pressed="${f.family === p.font}"${faces || f.family === p.font ? ` style="font-family:'${f.family}',cursive"` : ""}>${f.name}</button>`).join("")}</div>${list === FONTS ? ownFontNote(p) : ""}`;
  // (`fontsIn`: settles once the design's own fonts are in, for anything else that draws lettering)
  let fontsDone; const fontsIn = new Promise((r) => (fontsDone = r));
  let facesIn = false;
  function facesOn() {
    if (faces) return;
    faces = true; fontsDone();
    // (after the page's own text faces, app.js `uiFonts`: these are 17 fonts, 740 KB, and on a slow first visit the
    // page's text waited 17 s behind them in its stand-in face)
    (api.pageFaces?.() || Promise.resolve()).then(() => { facesIn = true; for (const b of document.querySelectorAll(".font-row [data-font]")) b.style.fontFamily = `'${b.dataset.font}',cursive`; thumbs(); });
  }
  // the font in use brought into the middle of its row when it's out of sight there (drawn while the tab was hidden, or
  // the chips grown as their fonts came in, it was off the end of the row)
  function showPicked(row) {
    const on = row.querySelector('[aria-pressed="true"]'); if (!on || !row.clientWidth) return;
    if (on.offsetLeft < row.scrollLeft - 1 || on.offsetLeft + on.offsetWidth > row.scrollLeft + row.clientWidth + 1) row.scrollLeft = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
  }
  document.fonts.addEventListener("loadingdone", () => { const row = $("st-edit").querySelector(".font-row"); if (row) showPicked(row); });
  // (a size set past the slider's end, by Fit to hoop, stretches it: Fit set 67 mm on a slider that stopped at 60)
  // (and a value a fix or a fit set off the slider's steps gets finer steps: "Make it 18.5 mm" on a 1 mm slider stood at
  // 19 and its label, read back from the slider, said 19 mm; a 31.5 mm curve sat at 32 beside "31.5 mm")
  const on = (v, step) => Math.abs(v / step - Math.round(v / step)) < 1e-6;
  const stepFor = (v, step) => (!Number.isFinite(+v) || on(+v, step) ? step : [0.5, 0.1].find((s) => s < step && on(+v, s)) || "any");
  const range = (k, lab, min, max, v, unit = "mm", step = 1) => `<label class="range"><span>${lab}</span><input type="range" data-k="${k}" data-unit="${unit}" data-step="${step}" min="${Number.isFinite(v) ? Math.min(min, Math.floor(v)) : min}" max="${Number.isFinite(v) ? Math.max(max, Math.ceil(v)) : max}" step="${stepFor(v, step)}" value="${v}"><output>${shown(v, unit)}</output></label>`;
  // a slider set from code (a fit, a fix, initials that grow): stretched and stepped to take the value, labelled with it
  const setRange = (r, v) => {
    if (!r) return;
    r.min = Math.min(+r.min, Math.floor(v)); r.max = Math.max(+r.max, Math.ceil(v)); r.step = stepFor(v, +r.dataset.step || 1); r.value = v;
    r.nextElementSibling.textContent = shown(v, r.dataset.unit || "mm");
  };
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
  const shown = (v, unit) => (unit === "mm" ? mmText(v) : `${v} ${unit}`);
  const seg = (k, opts, v) => `<div class="seg" data-seg="${k}">${Object.entries(opts).map(([key, name]) => `<button type="button" data-v="${key}" aria-pressed="${key === v}">${name}</button>`).join("")}</div>`;

  // satin and fine line, said plainly: bold columns or a thin outline of the letter
  const STITCHES = { auto: "Automatic", satin: "Bold", line: "Thin line" };
  // the automatic chip says what it'll do here ("Stitch: automatic" was lit while the note said it sews as a thin line)
  // (said once the lettering is worked out: a font change waited 0.8 s for it before the menu let go; warn() fills it in)
  const autoName = (p) => {
    if (fabric === "towel") return "Automatic: bold";
    if (!bulkReady(p)) return "Automatic";
    return !sewsThin({ ...sewn(p, pieces), style: "auto" }) ? "Automatic: bold" : "Automatic: thin line";
  };
  const stitchSeg = (p) => seg("style", { ...STITCHES, auto: autoName(p) }, p.style || "auto");
  let moreOpen = false, sizing = null;   // (`sizing`: the layout as a frame's size slider was taken up)
  $("st-edit").addEventListener("toggle", (e) => { if (e.target.matches("details.more")) moreOpen = e.target.open; }, true);
  $("st-edit").addEventListener("change", (e) => { if (e.target.type === "range") sizing = null; });
  const editor = () => api.keepFocus($("st-edit"), drawEditor);

  let drawnId = null;   // (the piece the editor panel was last drawn for)
  function ui() { api.keepFocus($("panel-design"), () => { list(); editor(); sewnOn(); arrangeUI(); }); api.paint?.(); }
  // the design's one in-the-hoop project, upright (the one "Make another in the hoop" copies), or null
  const loneProject = () => { const ith = pieces.filter((f) => f.kind === "frame" && (f.border === "ith" || f.border === "zip") && !(f.rot || 0)); return ith.length === 1 ? ith[0] : null; };
  function sewnOn() {
    sewAs(fabric, thread);   // (pieces.js measures with the design's fabric and thread)
    $("st-fabric").innerHTML = Object.entries(FABRICS).map(([k, f]) => `<button type="button" data-fab="${k}" aria-pressed="${k === fabric}">${f.name}</button>`).join("");
    // (Make another, under the starter too for a lone in-the-hoop project: in the frame's own settings only, a newcomer
    // making two bookmarks didn't find it and made one for each name instead)
    const lone = loneProject();
    $("st-tip").hidden = !tip && !lone; $("st-tip").textContent = tip;
    if (lone) {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "link", textContent: "Make another in the hoop" });
      b.dataset.tipTwo = ""; b.onclick = () => { const f = pieces.find((o) => o.id === lone.id); if (f) twoUp(f); };
      $("st-tip").append(tip ? " " : "", b);
    }
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
    if (f.some((p) => p.quilt && p.quilt !== "none")) return "Quilting is sewn through a quilt sandwich (see Have ready)";
    return "";
  }
  function lettered() { return pieces.some((p) => p.kind === "text" || p.kind === "monogram"); }
  function fabricTip() {
    const base = ownBase();
    // (a floated project isn't hooped: the fabric's own "hoop it with…" said otherwise)
    if (!base && floated()) return `${floated().fabric}${fabric === "towel" ? " On terry, the letters are sewn bold on a light base that flattens the loops, under a water-soluble topper (see Have ready)." : ""}`;
    if (!base) return [FABRICS[fabric].tip, tip ? "" : FABRICS[fabric].item].filter(Boolean).join(" ");
    const what = [(fabric === "knit" || fabric === "towel") && lettered() ? "the lettering" : "", fabric === "knit" && pieces.some((p) => p.kind === "frame" && p.border === "patch") ? "the patch's fill" : ""].filter(Boolean);
    return what.length ? `${base}, so ${FABRICS[fabric].name} only changes how ${what.join(" and ")} ${what.length > 1 ? "are" : "is"} sewn${fabric === "towel" ? " (bold, on a light base)" : " (to suit a knit)"}.`
      : `${base}, so the fabric chosen here doesn't change the stitches.`;
  }
  $("st-fabric").onclick = (e) => { const b = e.target.closest("[data-fab]"); if (!b || b.dataset.fab === fabric) return; remember(); fabric = b.dataset.fab; save(); sewnOn(); make(); setTimeout(warn); };   // (warn in a task of its own: see make)
  $("st-thread").onclick = (e) => { const b = e.target.closest("[data-thread]"); if (!b || b.dataset.thread === thread) return; remember(); thread = b.dataset.thread; save(); sewnOn(); make(); };
  $("st-baste").onchange = (e) => { remember(); baste = e.target.checked; save(); sewnOn(); make(); };
  // What's wrong with piece p, as every surface says it: { list: [{ id, kind, level, text, piece }], d: what was
  // measured, for the editor's fixes }. The editor shows the list with a one-tap fix each; make() puts every piece's in
  // the view's problems (words.js), so beside Download, the download dialog, the steps, the sew sheet, the share text
  // and Sew along say the same (a fleece "Lily" that closes up was said only in the editor, under a green "Checked";
  // a too-small motif, a tight arch, letters pushed together and a thin line were said only there).
  const MOTIF_LEAST = { fill: 25, outline: 30, applique: 30 };

  // (`keep`: a change that doesn't set a size or a place, such as the font, keeps a fitted design fitted)
  function change(fn, now = false, keep = false) {
    const p = current(); if (!p) return;
    remember(!now);
    // (a change that takes lettering out of its frame's fit, bent into an arch or turned off square, keeps the size it
    // was sewn at: Arch up on a name the oval shrank 60 -> 39 mm sewed it at 60, wrapped into itself. Only out of the
    // fit: shorter words that now fit at the asked size keep it, "Ashley Ashley Ashley" -> "Ashley" stayed 9 mm)
    const fs = p.size == null ? null : fittedSizes(pieces).get(p.id), was = p.size;
    fn(p);
    // (the size control too, which a slider being dragged doesn't redraw: Turn to -35° read 90 mm beside a 58 mm A)
    if (fs != null && p.size === was && !fitFrame(p, pieces)) {
      p.size = fs;
      const r = $("st-edit").querySelector('input[data-k="size"]');
      if (r) { setRange(r, fs); r.nextElementSibling.title = ""; }
    }
    if (!keep) fitted = false; save(); list();
    clearTimeout(warnTimer); warnTimer = setTimeout(warn, 300);
    clearTimeout(timer); timer = setTimeout(make, now ? 0 : 160);
  }

  const nextTask = () => new Promise((r) => setTimeout(r));
  let waitSaid = false, madeOnce = false;   // ("Getting the lettering ready…" is up; a design has been made)
  const plain = (ps) => JSON.stringify(ps.map(({ id, ...q }) => q));
  let sample0 = null;
  const untouched = () => plain(pieces) === (sample0 ??= plain(STARTERS.find((q) => q.id === "framed").make()));
  async function make(dragging = false) {
    try { return await build(dragging); } finally { madeOnce = true; if (waitSaid) { waitSaid = false; api.busy(false); } }
  }
  async function build(dragging) {
    if (facesIn) thumbs();   // (the starters' fonts after the design's own and the page's: `facesOn`)
    const s = ++seq;
    api.showError(""); $("st-big").hidden = true;
    try {
      const fonts = [...new Set(pieces.filter((p) => p.font).map((p) => p.font))];
      // (said while a font is on its way: on a slow first load the preview read "Nothing to stitch yet: type some
      // words" for the 4-5 s the bookmark's font took)
      // (and until the design is made: `make` takes the note down)
      // (at once for the first design, where there's nothing to look at meanwhile; later only when a font takes a while)
      const say = () => { if (s === seq) { waitSaid = true; api.busy(true, "Getting the lettering ready…"); } };
      const wait = madeOnce || !fonts.length ? setTimeout(say, 250) : (say(), 0);
      try { await Promise.all(fonts.map(loadFont)); } finally { clearTimeout(wait); }
      // (the design's own fonts first, then the rest; a design with no lettering waits until it's still a moment, so a
      // passing empty state, before the design is in, doesn't ask for every font at once)
      if (fonts.length) facesOn(); else setTimeout(() => { if (s === seq) facesOn(); }, 1500);
      if (s !== seq) return;
      if (!dragging) restitchFiles();
      // (new words drawn in tasks of their own first: see `drawAhead`)
      if (!dragging) for (const p of pieces) for (const draw of drawAhead(p)) if (draw()) { await nextTask(); if (s !== seq) return; }
      // what's wrong with it, every piece's problems in one list, two hoopings too (worked out when the design settles, not on every
      // drag frame: the last list stands meanwhile); lettering wrapped round into itself can't be sewn, so Download
      // waits for it
      if (!dragging) { const fit = fittedSizes(pieces); await nextTask(); if (s !== seq) return; problems = [...new Map(pieces.flatMap((p) => pieceProblems(p, fit).list).map((x) => [x.id, x])).values()]; }
      // (the problems, the stitches and the preview each in a task of its own, so a key or a tap between them is
      // answered: one task of all three held a busy design's page up 0.6-0.9 s)
      if (!dragging) { await nextTask(); if (s !== seq) return; }
      // (quilting and a patch's fill not worked out yet are done by a worker: `unquilted`, then `quiltSoon`)
      let composed;
      const unquilted = dragging ? null : [], noRoom = dragging ? null : [];
      try { composed = compose(pieces, api.hoop(), { fabric, baste, thread, dragging, later: unquilted, unquilted: noRoom, fillLater: true }); }
      catch (err) {
        if (!err.overBy) throw err;
        if (s !== seq) return;
        // (a patch's fill is worked out too behind a design too big for the hoop: shown, and only it remade it)
        const fill = unquilted?.find((j) => j.kind === "patch"); if (fill) quiltSoon(fill);
        // fitted with Fit to hoop and since grown by a font or style change: fitted again (it came out 1 mm over)
        if (fitted && !dragging && !refitted) { refitted = true; fitHoop(); return; }
        // (the opening sample, untouched, is fitted to a smaller hoop when one is picked: a newcomer chose her 4x4
        // first and met a red "Too big for this hoop" on a design she hadn't made)
        if (!dragging && !refitted && untouched()) { refitted = true; fitHoop(); toast(`The sample is made smaller to fit the ${api.hoop().name}.`); return; }
        split(err, dragging); return;
      }
      if (s !== seq) return;
      if (!dragging) { await nextTask(); if (s !== seq) return; }
      refitted = false;
      if (two && !dragging) { two = false; save(); }   // (fits one hooping again: growing past it later asks again)
      if (!dragging) roomier();
      // (quilting asked for with no room left for it in the frame: said, as every problem is)
      for (const id of noRoom || []) { const f = pieces.find((o) => o.id === id); if (f) problems.push({ id: `quilt:${id}`, kind: "quilt", level: LOOK, piece: id, text: `The ${shapeLabel(f)} has no room left inside for its quilting, so it isn't quilted: make the ${shapeLabel(f)} bigger, or what's in it smaller.` }); }
      const resizing = !dragging && pieces.find((p) => p.kind === "file" && p.pending), quilting = unquilted?.length > 0, filling = quilting && unquilted[0].kind === "patch";
      if (quilting) quiltSoon(unquilted[0]);
      const { design, steps, done, ready, small, later } = stepsOf(composed, true);
      stepsUI(steps, done, small, ready);
      const look = previewLook(steps);
      const notes = [turnText(), tip, fabricTip(), threadTip(small)];
      api.setView(design.pattern(), fileName(), {
        ...look, problems, fixHint: fixHint(),
        block: resizing ? `Re-stitching ${resizing.name} at ${Math.round(resizing.scale * 100)} %…` : filling ? "Working out the patch's fill…" : quilting ? "Working out the quilting…" : "",
        blockLabel: resizing ? "Re-stitching…" : filling ? "Filling…" : quilting ? "Quilting…" : "",
        fabric: look.fabric, steps: steps.length, turnNote: turnText(), bare: bareNow,   // (an in-the-hoop front: the background; appliqué: pink gingham)
        sheet: { steps: steps.map((st) => ({ you: st.you, sews: st.sews.join(" ") })), after: done, ready, cut: steps.filter((st) => st.cut).map((st) => st.cut),
          notes } });
      // (whether the letters are small, when the lettering wasn't worked out yet: said a moment later, after the preview)
      if (later) setTimeout(() => {
        if (s !== seq) return;
        const now = smallNow(); if (now === small) return;
        stepsUI(steps, done, now, ready); notes.splice(1, 3, tip, fabricTip(), threadTip(now));
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

  // A design opened on the Open tab, to add words to: a new design of the file and a line of lettering under it (the
  // last design stays one Undo away). Fit to hoop then resizes both.
  // (`words` false: the design alone, selected: the Picture tab's "start a new design with it")
  function addWords(d, name, words = true) {
    const blocks = fileBlocks(d), had = pieces.length;
    const f = piece({ kind: "file", name, blocks, color: blocks[0].color }), t = words && text({ text: "Your words", font: SCRIPT });
    const kept = newDesign([f], { from: name });
    if (t) { freeSpot(t, "down"); pieces.push(t); }
    sel = (t || f).id; recentre();
    api.setMode("design"); save(); ui(); make();
    if (had) toast(`Started a new design with ${name}.${keptSaid(kept)}`, { label: "Undo", run: undo });
    // (straight into the words, selected, so typing replaces them)
    const w = t && $("st-edit").querySelector('textarea[data-k="text"]');
    if (w) { w.focus(); w.select(); }
  }
  // A new design in place of the one there, one Undo away: a starter (and an old #bookmark link), Add words, a picture
  // started as a new design, Open saved (and a saved design dropped, shared or opened on the Open tab), a whole design
  // pasted into an empty one. Everything the last design set goes back to what a fresh page has, but what the new one
  // brings (`o`: fabric, baste, thread, turn, fitted, two, from, title, tip): a towel stayed on for later starters, a
  // starter's felt after Add words, a turned stocking cuff for the next file, the zoom, a step view and a starter's tip
  // after Open saved, each unsaid.
  // (the design it replaces goes into Recent designs first: the kept entry, or null)
  function newDesign(ps, o = {}) {
    const kept = keep();
    remember();
    api.fit(); api.showStep(null);
    api.setTurn(!!o.turn);   // (a square hoop ignores it)
    pieces = ps; sel = ps.length ? ps[ps.length - 1].id : null;
    fabric = own(FABRICS, o.fabric) ? o.fabric : "cotton"; baste = o.baste === true; thread = own(THREADS, String(o.thread)) ? String(o.thread) : "auto"; sewAs(fabric, thread);
    fitted = o.fitted === true; two = o.two === true; refitted = false;
    from = o.from || ""; title = o.title || ""; tip = o.tip || "";
    edited = false; sent = false; recentUI();
    return kept;
  }

  // A design file (+ Design file, or the Picture tab's stitches: "Add it to my design") as a piece of this design, in
  // free space, above what's there (or below, if only that fits), not on top of it: centred, a bought design landed on
  // the lettering. It sews first, after any frames, so lettering added under it sews on top. (where there's room, as
  // any new piece: it went above everything, the design then two hoopings) False when there's no room (said).
  function addFile(d, name) {
    remember();
    const blocks = fileBlocks(d);
    return putFile(piece({ kind: "file", name, blocks, color: blocks[0].color }));
  }
  function putFile(p) {
    freeSpot(p, "up");
    if (!place(p, (q) => { const at = pieces.findIndex((o) => o.kind !== "frame"); pieces.splice(at < 0 ? pieces.length : at, 0, q); })) return false;
    recentre(); save(); ui(); make();
    return true;
  }

  // A bigger hoop picked for a design that fits: offered once, the design made as big as it allows (Fit to hoop). A
  // 93 mm design moved from the 4x4 to the 5x7 stayed 93 mm with nothing said.
  let lastHoop = null, turnedByHand = false;
  // (and the hoop turned by hand, the Turn hoop button: a quilt label turned on the 5x7 had room to grow and nothing
  // said so; not a turn that comes with Undo or a new design)
  $("turn").addEventListener("click", () => { turnedByHand = true; });
  function roomier() {
    const hp = api.hoop(), key = `${hp.machine}/${hp.id}/${hp.w}x${hp.h}`, was = lastHoop, hand = turnedByHand;
    lastHoop = { key, area: hp.w * hp.h }; turnedByHand = false;
    if (!was || was.key === key || hp.w * hp.h < was.area || (hp.w * hp.h === was.area && !hand) || document.body.dataset.mode !== "design") return;
    const [w, h] = layoutSize(pieces);
    if (!w || !h || Math.min((hp.w - 10) / w, (hp.h - 10) / h, mostScale()) < 1.1) return;
    toast(`The ${hp.name}${hp.w * hp.h === was.area ? " turned this way" : ""} has room to make this design bigger.`, { label: `Make it as big as the ${hp.name.replace(/ hoop$/, "")} allows`, run: () => { remember(); fitHoop(); } });
  }
  // the steps as shown and printed: what to have ready, what's done after, and whether the letters are small
  // (`lazy`: lettering not worked out yet (a long text drawn again as one line, 0.3-0.7 s) is taken as small as it last
  // was, and `later` says to check: typing waited for it before the preview changed)
  let lastSteps = null;   // (the steps of the design as last made, for the editor's thread offers)
  let lastSmall = false, bareNow = false;
  // the turned hoop's note, as step 1 hoops: bare stabilizer (in the hoop) or the fabric (sheet.js `turnedNote`)
  const turnText = () => (api.turned() ? turnedNote(bareNow) : "");
  const smallNow = () => { const fit = fittedSizes(pieces); return (lastSmall = thread !== "60" && pieces.some((p) => smallText(fit.has(p.id) ? { ...p, size: fit.get(p.id) } : p))); };

  document.addEventListener("nw:step", (e) => {
    for (const b of $("st-steps").querySelectorAll("[data-step]")) b.setAttribute("aria-pressed", +b.dataset.step === e.detail);
    $("st-steps-all").hidden = e.detail == null;
  });
  $("st-steps-all").onclick = () => api.showStep(null);
  // closing the steps shows the whole design again
  $("st-steps").closest("details").addEventListener("toggle", (e) => { if (!e.target.open) api.showStep(null); });
  // the file's name: who it's for when a line says so ("Made for Lily": the label was by_Grandma_Jean.pes, its biggest
  // line), else the biggest lettering (the name, not the quilt label's "Made for")
  const fileName = () => `${api.safeName(firstWords(), "design")}.pes`;
  const firstWords = () => title || autoWords();
  const autoWords = () => {
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
    // (appliqué letters count with straight words: a bib's 60 mm appliqué M was M.pes until a small "Est. 2026" was
    // typed under it, then Est_2026.pes)
    const pick = (ok) => big(pieces.filter((p) => ok(p) && ((p.kind === "text" && (p.shape || "straight") === "straight") || p.kind === "letters"))) || big(pieces.filter((p) => ok(p) && p.kind === "monogram"))
      || big(pieces.filter((p) => ok(p) && (p.kind === "text" || p.kind === "monogram" || p.kind === "letters")));
    // (only words a file name can carry: empty lettering named it after the starter, spaces alone design.pes)
    const said = (p) => (p.kind === "monogram" ? p.letters : unswashed(p.text)), named = (p) => !!api.safeName(said(p), "");
    const m = pick((p) => lettered(p) && named(p)) || pick(named);
    // (else the starter, with the motifs in it: four coasters, a snowflake, a heart..., all downloaded as Coaster.pes;
    // a quilt block was design.pes)
    const motifs = [...new Set(pieces.filter((p) => p.kind === "motif").map((p) => MOTIFS[p.motif]?.name).filter(Boolean))];
    if (!m) return [from, ...motifs].filter(Boolean).join(" ") || "design";
    // lettering split into pieces (Arch up keeps the other lines straight; two hoopings split at a word gap) is named
    // after all of it, in sewing order: "Happy / Birthday" was Birthday.pes, "Welcome to our Home" our_Home_2_hoopings.zip
    if (m.of != null) return [...new Set(pieces.filter((q) => q.of === m.of && named(q)).map(said))].join(" ");
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
    // (a design that was there is one Undo away, and said so: a 15-piece design went with one tap, no word)
    const had = pieces.length && snap();
    // (upright unless it's laid out long side across, the bookmark: the last starter's turned hoop made a bib hoop
    // sideways; its own fabric and thread or cotton and automatic: a towel left on made every later starter
    // towel-heavy, 30 wt stuck to every later starter)
    const kept = newDesign(s.make(), { fabric: s.fabric, baste: s.baste, thread: s.thread, turn: s.turn, from: s.name, tip: s.tip });
    if (tweak) tweak(pieces); sel = pieces[pieces.length - 1].id;
    // made to fit the hoop it's opened in, everything scaled together (the coaster, quilt block, mug rug and zipper
    // pouch opened Too big on the 4x4)
    // Lettering it made small enough for its loops to fill in goes back up to the size that keeps them open (up to its
    // own) where that still fits and runs into nothing: the 4x4 pouch's "Makeup" at 15 mm.
    const fits = () => { try { compose(pieces, api.hoop(), { fabric, baste, thread, later: [], measure: true }); return true; } catch (err) { if (err.overBy) return false; throw err; } };
    // Else, in a script that keeps its loops open at that size (Yellowtail): "Ashley" in Great Vibes at 19 mm in the
    // 4x4 quilt label. A starter with its own layout for a small hoop (`small`) uses that instead of shrinking it all.
    const hp = api.hoop();
    if (s.small && Math.max(hp.w, hp.h) < 150) { pieces = s.small(); if (tweak) tweak(pieces); sel = pieces[pieces.length - 1].id; }
    if (!fits()) {
      const was = new Map(pieces.map((p) => [p.id, p.size]));
      fitHoop(false);
      for (const p of pieces) {
        const fs = fittedSizes(pieces).get(p.id), need = p.kind === "text" ? loopsFill({ ...p, size: fs ?? p.size }) : 0;
        if (!need) continue;
        const keep = p.size; if (need <= was.get(p.id)) p.size = Math.max(p.size, need);
        if (p.size !== keep && ((fittedSizes(pieces).get(p.id) ?? p.size) < need || touching(sewnAt(p), pieces) || !fits())) p.size = keep;
        if (p.size !== keep || p.font === BOLD || FONTS.find((f) => f.family === p.font)?.print) continue;
        const back = pieces.map((o) => ({ ...o })); p.font = BOLD;
        if (!fits()) fitHoop(false);   // (a wider script: fitted again)
        const q = { ...p, size: fittedSizes(pieces).get(p.id) ?? p.size };
        if (loopsFill(q) || minSize(q) || archTight(q) || touching(q, pieces) || !fits()) pieces.forEach((o, i) => Object.assign(o, back[i]));
      }
    }
    save(); ui(); make();
    // (a picture or design file it replaced can come along: a newcomer with her logo picked the Tote bag and it was gone,
    // Undo the only way back and "add it to my design" on the Picture tab not found)
    if (had && !sameDesign(had, snap())) {
      const files = JSON.parse(had).pieces.filter((p) => p.kind === "file");
      const bring = files.length && { label: files.length === 1 ? `Add ${files[0].name} to it` : `Add your ${files.length} design files to it`,
        run: () => { remember(); for (const f of files) putFile({ ...f, id: ids.next++ }); } };
      toast(`Replaced your design with “${s.name}”.${keptSaid(kept)}`, [bring, { label: "Undo", run: undo }].filter(Boolean));
    }
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
    const fit = fittedSizes(pieces), tall = Math.max(0, ...pieces.filter((q) => q.kind === "text" || q.kind === "monogram").map((q) => sewn(q, pieces, fit).size));
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
  // (`src`: the piece p is a copy of: a copy goes on an empty frame alike where the original sits on its own)
  function place(p, insert, src = null) {
    const at = p.kind !== "frame" && spotIn(p, false, src);
    if (at) Object.assign(p, { x: at.x, y: at.y, size: at.size });
    const ith = pieces.find((f) => f.kind === "frame" && (f.border === "zip" || f.border === "ith") && !(f.rot || 0));
    // (a design already too big for one hooping, two hoopings on purpose, takes it below what's there as before)
    // (too big as sewn, not by the boxes' rougher margin: a 96 x 90 mm design that fits the 4x4 counted as too big
    // already, and appliqué letters went below it, out of the hoop)
    const over = !fitsNow();
    const placing = !at && pieces.length && !(over && !ith) && (p.kind === "frame" ? pieces.some((f) => f.kind === "frame") : ith || !clear(p));
    if (over && !ith && !at && p.kind !== "frame" && touching(sewnAt(p), pieces)) freeSpot(p, "down");
    if (placing) {
      const room = freeRoom(p, ith);
      if (!room) { noRoom(p, ith, insert); return false; }
      Object.assign(p, room);
    }
    const moved = (!!placing || over) && !ith;
    insert(p); sel = p.id;
    // put in a frame, it's sewn after it, with what's on it (only then is it on the frame: a copy put just below its
    // original, before the second key fob, sewed under that fob's front)
    if (at) {
      const i = pieces.indexOf(p), fi = pieces.indexOf(at.f);
      if (i < fi) { pieces.splice(i, 1); const on = new Set(onFrame(at.f)); let j = pieces.indexOf(at.f); while (j + 1 < pieces.length && on.has(pieces[j + 1])) j++; pieces.splice(j + 1, 0, p); }
    }
    // in a thread that shows on a patch it's sewn on, wherever it landed (+ Lettering on the patch starter came in
    // navy on the navy fill)
    const base = p.kind !== "frame" && underPatch(p, pieces, true);
    if (base && hard(p.color, base.fill || base.color)) p.color = against(base, pieces);
    if (moved) recentre();
    save(); ui(); make();
    // (a design already too big for the hoop takes it below what's there: said, with Undo, unless two hoopings were
    // chosen. After one "Add it anyway", each later piece went outside the hoop with nothing said.)
    if (over && !ith && !at && !two) toast(`Added the new ${{ text: "lettering", monogram: "monogram", letters: "appliqué letters", frame: "frame" }[p.kind] || label(p).toLowerCase()}, but the design is still too big for the ${api.hoop().name}: make something smaller, or take something out.`, { label: "Undo", run: undo });
    return true;
  }
  // a copy or a paste that `place` made smaller to find it room, said with the size: a duplicated 40 mm heart came out
  // 28 mm with nothing said (`quiet`: the words, for the caller's own toast)
  function smallerSaid(p, was, who, quiet = false) {
    const now = sewn(p, pieces).size;
    if (now == null || was == null || now >= was - 0.25) return "";
    const t = `${who || "It"} was made ${mmText(now)} to fit the room there: the original is ${mmText(was)}.`;
    if (!quiet) toast(t, { label: "Undo", run: undo });
    return quiet ? ` ${t}` : t;
  }
  // does the design as it is fit the hoop, sewn?
  function fitsNow() {
    try { compose(pieces, api.hoop(), { fabric, baste, thread, later: [], measure: true }); return true; } catch (err) { if (!err.overBy && !err.empty) throw err; return !err.overBy; }
  }
  // p where it is runs into nothing and keeps the design in one hooping
  const clear = (p) => !touching(sewnAt(p), pieces) && fitsWith(p);
  let deleted = 0;
  const toast = (msg, action) => api.toast(msg, action);   // (app.js: one note and one timing rule for every tab)
  $("st-pieces").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const id = +b.dataset.id, i = pieces.findIndex((p) => p.id === id);
    // (the next row's ✕ slides under the same finger: a second tap straight after is ignored)
    if (b.dataset.op === "del" && Date.now() - deleted < 600) return;
    if (b.dataset.op) { remember(); fitted = false; }
    if (b.dataset.op === "del") { deleted = Date.now(); toast(`Removed ${label(pieces[i])}.`, { label: "Undo", run: undo }); pieces.splice(i, 1); if (sel === id) sel = pieces[Math.max(0, i - 1)]?.id; }
    else if (b.dataset.op === "dup") {
      // the copy goes just below the original, where there's room (else wherever there's room, as a new piece does)
      const bb = sewnBox(pieces[i], pieces), c = { ...structuredClone(pieces[i]), id: ids.next++, y: pieces[i].y + (bb ? bb[3] - bb[1] + 4 : 10) }, was = sewn(pieces[i], pieces).size;
      if (!place(c, (q) => pieces.splice(i + 1, 0, q), pieces[i])) return;
      smallerSaid(c, was, "The copy");
    }
    else if (b.dataset.op === "flip") pieces[i].flip = !pieces[i].flip;
    else if (b.dataset.op === "up" && i > 0) [pieces[i - 1], pieces[i]] = [pieces[i], pieces[i - 1]];
    else if (b.dataset.op === "down" && i < pieces.length - 1) [pieces[i + 1], pieces[i]] = [pieces[i], pieces[i + 1]];
    else sel = id;
    const had = $("st-pieces").contains(document.activeElement);
    save(); ui(); if (b.dataset.op) make(); else showEditor(true, $("st-pieces").querySelector(`li[data-id="${id}"]`));
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
    // (motifs either side that make a frame shrink the words, said: a 17 mm name chosen for its loops came out 15 mm)
    const deco0 = k === "deco" && current() ? sewnAt(current()).size : null;
    // (the words with the swashes the buttons show: the box shows them without their marks, `swashless`)
    const pressed = (end) => edit.querySelector(`[data-swash="${end}"]`)?.getAttribute("aria-pressed") === "true";
    const words = k === "text" && current()?.kind === "text" ? reswashed(t.value, { lead: pressed("lead"), tail: pressed("tail") }) : t.value;
    change((p) => {
      if (k === "text") { if (p.kern) p.kern = rekern(p.kern, p.text, words); pairAt = +Object.keys(rekern({ [pairAt]: 1 }, p.text, words) || { [-1]: 1 })[0]; }
      // (fewer initials in a frame grow to its width: one letter of "aMs" stayed 23 mm tall in a 90 mm circle)
      if (k === "letters" && p.kind === "monogram") {
        const was = p.size; p.size = monoSize(p, t.value, pieces);
        const r = edit.querySelector('input[data-k="size"]');
        if (r && p.size !== was) setRange(r, p.size);
        const help = edit.querySelector("[data-mono-help]"); if (help) help.textContent = monogramHelp(t.value);
      }
      const longer = k === "text" && p.kind === "text" && unswashed(words).trim().length > unswashed(p.text || "").trim().length && unswashed(words).trim().length >= 3;
      // (a frame's size: what's in it keeps its place in proportion, from where it was when the slider was taken up,
      // so rounding to the half mm on every step doesn't creep)
      if (p.kind === "frame" && (k === "w" || k === "h")) {
        if (sizing?.id !== p.id || sizing.n !== pieces.length) sizing = { id: p.id, n: pieces.length, ps: pieces.map((q) => ({ ...q })) };
        const f0 = sizing.ps.find((q) => q.id === p.id), next = carried(f0, { ...f0, w: p.w, h: p.h, [k]: +t.value }, sizing.ps);
        pieces.forEach((q, i) => { if (q !== p && next[i]?.id === q.id) Object.assign(q, { x: next[i].x, y: next[i].y }); });
      }
      p[k] = t.type === "range" ? +t.value : words;
      if (longer) reArch(p);
    }, false, k === "font" || k === "deco");
    if (deco0 != null && current()?.deco) { const p = current(), s1 = sewnAt(p).size; if (s1 < deco0 - 0.25) toast(`With ${(MOTIFS[p.deco]?.name || "motif").toLowerCase()}s either side, the frame has room for ${label(p)} at ${mmText(s1)} instead of ${mmText(deco0)}.`, { label: "Undo", run: undo }); }
    if (k === "text") { const box = edit.querySelector("[data-pairs]"); if (box) box.innerHTML = pairUI(current()); }   // (the pairs follow the words)
    // (and the swash buttons: a ~ typed away left "Swash before" pressed until the piece was picked again)
    // (kept while the box is empty: the words typed next take them)
    if (k === "text" && unswashed(words).trim()) { const on = swashOn(words); for (const b of edit.querySelectorAll("[data-swash]")) b.setAttribute("aria-pressed", String(on[b.dataset.swash])); }
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
    for (const el of [r, r2]) setRange(el, radius);
  }
  let warnTimer = 0;
  edit.addEventListener("change", (e) => {
    // (re-stitched once the slider is let go: each step is a re-stitch)
    if (e.target.matches("[data-file-scale]")) { const v = e.target.value / 100; change((p) => resizeFile(p, v), true); editor(); return; }
    if (e.target.dataset.k === "font" || e.target.dataset.k === "deco" || e.target.matches("[data-color-any], [data-fill-any], [data-blend-any]")) editor(); });
  edit.addEventListener("click", (e) => {
    const fo = e.target.closest("[data-font]"), fs = fo && edit.querySelector('select[data-k="font"]');
    if (fs) { fs.value = fo.dataset.font; for (const t of ["input", "change"]) fs.dispatchEvent(new Event(t, { bubbles: true })); return; }
    const one = e.target.closest("[data-all-thread-set]");
    if (one) { remember(); const c = one.dataset.allThreadSet; pieces = oneThread(c); save(); ui(); make(); return; }
    const c = e.target.closest("[data-color]");
    if (c) { const was = current()?.color; change((p) => (p.color = c.dataset.color), true, true); editor(); ungang(current(), was); return; }
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
    if (sz) { change((p) => { if (sz.hasAttribute("data-no-deco")) p.deco = ""; Object.assign(p, sizeChange(p, +sz.dataset.size)); }, true); turnToo(sz); editor(); return; }
    const rm = e.target.closest("[data-room]");
    if (rm) { change((p) => { const r = archRoom(p) || {}; Object.assign(p, keepWord(p, { ...r, ...(archFit({ ...p, ...r }) || {}) })); }, true); turnToo(rm); editor(); return; }
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
      if (f && p) { remember(); fitted = false; resizeFrame(f, w, h); p.size = Math.max(p.size, size); turnToo(fg); save(); ui(); make(); }
      return;
    }
    const mt = e.target.closest("[data-move-to]");
    if (mt) { const [x, y] = mt.dataset.moveTo.split(",").map(Number); change((p) => { Object.assign(p, { x, y }); recentre(); }, true); turnToo(mt); editor(); return; }
    if (e.target.closest("[data-move]")) { const to = spotIn(current(), true); if (to) change((p) => Object.assign(p, { x: to.x, y: to.y, size: to.size }), true); editor(); return; }
    if (e.target.closest("[data-two-up]")) { twoUp(current()); return; }
    if (e.target.closest("[data-same-on]")) { sameOn(current()); return; }
    if (e.target.closest("[data-follow]")) { change((p) => Object.assign(p, followFrame(p, pieces)), true); editor(); return; }
    const sw = e.target.closest("[data-swash]");
    if (sw) { const on = sw.getAttribute("aria-pressed") !== "true"; change((p) => { const t = withSwash(p.text, sw.dataset.swash, on); if (p.kern) p.kern = rekern(p.kern, p.text, t); p.text = t; }, true); editor(); return; }
    const s = e.target.closest("[data-seg] button");
    if (s) {
      let rest = null, said = "";
      change((p) => {
        const k = s.closest("[data-seg]").dataset.seg, arc = (v) => v === "up" || v === "down", was = p.shape, at = p.size == null ? null : sewn(p, pieces).size;
        p[k] = s.dataset.v;
        // lines bent into an arch: the first line is arched and the rest stay straight as their own piece where they
        // were (an arch sews one line: "Anne-Marie / & Christopher" on Arch up were joined into one long line)
        const lines = p.kind === "text" && k === "shape" && arc(p.shape) && !arc(was) ? p.text.split("\n").filter((l) => l.trim()) : [];
        // (the lines as they were sewn: a frame's fit ends with the arch, see change())
        if (lines.length > 1) p.size = at;
        if (lines.length > 1) rest = lineRest(p, true);
        // words first bent into an arch get a curve to suit them: just inside a round frame they're in, else one sized
        // from the word (the 30 mm default made a 24 mm "Olivia" read "Oliuia")
        // (kept where it was: the piece's place is the curve's centre, so a wider curve threw the word up out of the hoop)
        // (and the word stays where it's shown when bent back or flipped: the curve's centre was kept as the place, so
        // each Straight / Arch up moved it a curve's height further down the hoop)
        const ring = p.kind === "text" && pieces.some((f) => f.kind === "frame" && Math.abs(f.x - p.x) < 0.5 && Math.abs(f.y - p.y) < 0.5 && ["circle", "oval", "scallop"].includes(f.shape));
        const wordY = (shape, y) => (arc(shape) ? y + (shape === "up" ? -1 : 1) * (p.ry ?? p.radius) : y);
        if (p.kind === "text" && k === "shape" && arc(p.shape) && !arc(was)) {
          delete p.ry;
          const ff = followed(p);
          if (ff) { if (ff.size !== p.size) said = `${label(p)} is ${mmText(ff.size)} now, to go round the frame without wrapping too far.`; Object.assign(p, ff); }
          else { const { radius } = archStart(p); p.radius = radius; p.y = Math.round((p.y + (p.shape === "up" ? radius : -radius)) * 2) / 2; }
        } else if (p.kind === "text" && k === "shape" && arc(was) && !ring) {
          const y = wordY(was, p.y);
          p.y = Math.round((arc(p.shape) ? y - (p.shape === "up" ? -1 : 1) * (p.ry ?? p.radius) : y) * 2) / 2;
        }
        if (rest) placeRest(p, rest);
      }, true, true);
      editor();
      if (rest || said) toast([rest ? `An arch sews one line, so “${unswashed(rest.text).replace(/\n/g, " ")}” is its own straight piece now.` : "", said].filter(Boolean).join(" "), { label: "Undo", run: undo });
    }
  });
  // Arched lettering given more lines (typed into the words box): the first line stays arched, the rest becomes its own
  // straight piece under it, as Arch up on lines does (typed, they were sewn round the curve as one long line). Done
  // when the words box is left, not while typing.
  edit.addEventListener("change", (e) => {
    const p = current();
    if (e.target.dataset.k !== "text" || p?.kind !== "text" || (p.shape !== "up" && p.shape !== "down") || p.text.split("\n").filter((l) => l.trim()).length < 2) return;
    let rest = null;
    change((q) => { rest = lineRest(q); placeRest(q, rest); }, true, true);
    editor();
    if (rest) toast(`An arch sews one line, so “${unswashed(rest.text).replace(/\n/g, " ")}” is its own straight piece now.`, { label: "Undo", run: undo });
  });
  // p's lines after the first as their own straight piece (p keeps the first, moved to where it was shown when `move`:
  // straight lines about to be bent), where they were (`placeRest` puts it)
  function lineRest(p, move = false) {
    const lines = p.text.split("\n").filter((l) => l.trim()), pitch = (p.size * (p.leading ?? 130)) / 100, y0 = p.y;
    // (both keep what they were split from, `of`: the file is named after all of it, "Happy Birthday", not the straight
    // line alone)
    p.of ??= p.id;
    const rest = { ...p, id: ids.next++, text: lines.slice(1).join("\n"), shape: "straight", y: Math.round((y0 + pitch / 2) * 2) / 2 };
    delete rest.ry; delete rest.deco; delete rest.kern;
    p.text = lines[0]; delete p.kern;
    if (move) p.y = Math.round((y0 - (pitch * (lines.length - 1)) / 2) * 2) / 2;
    return rest;
  }
  // the lines split from an arch put clear under it: under an arch up, an ink gap below its lowest stitch (left where
  // they were, the second line lay over the arch's ends: "& Christopher" over "Anne-Marie", "Grandma Rose" over
  // "day"); then, where that runs into something or past the hoop, placed as a new piece is
  function placeRest(p, rest) {
    if (p.shape === "up") {
      // (the line's box as it's sewn where it is, a frame may shrink it, about its place)
      const a = pieceBounds(sewn(p, pieces)), b = pieceBounds(sewn(rest, [...pieces, rest]))?.map((v, i) => v - (i % 2 ? rest.y : rest.x));
      if (a && b) {
        const m = letterMetrics(unswashed(rest.text).split("\n")[0], rest.font, rest.size, rest.style), gap = Math.max(2, Math.min((m.xh || rest.size) / 2, rest.size / 4));
        rest.x = Math.round(((a[0] + a[2]) / 2 - (b[0] + b[2]) / 2) * 2) / 2; rest.y = Math.ceil((a[3] + gap - b[1]) * 2) / 2;
      }
    }
    if (touching(sewnAt(rest), pieces) || !fitsWith(rest)) { const r = spotIn(rest) || freeRoom(rest, null, true); if (r) Object.assign(rest, { x: r.x, y: r.y, size: r.size ?? rest.size }); }
    pieces.splice(pieces.indexOf(p) + 1, 0, rest);
  }
  // the curve of a round frame p is in (`followFrame`), with the letters made smaller (to 80 %, never too small to
  // stitch) where it would take them more than a third of the way round (`ARCH`): { x, y, radius, ry, size } or null
  function followed(p) {
    const ff = followFrame(p, pieces);
    if (!ff) return null;
    for (let size = p.size; size >= p.size * 0.8; size -= 0.5) {
      const q = { ...p, size }, f = size === p.size ? ff : followFrame(q, pieces), r = { ...q, ...f };
      if (size !== p.size && minSize(r)) break;
      if (archWrap(r) <= ARCH + 0.03 && !archTight(r)) return { ...f, size };
    }
    return archWrap({ ...p, ...ff }) <= 0.4 ? { ...ff, size: p.size } : null;
  }
  // A one-tap fix pressed from the keyboard: focus goes to the control the fix changed (its size, style, curve…), else
  // to the problems that are left. The fix's button goes with the redraw, and what stood after it got focus: the Turn
  // slider, where the next arrow key rotated the lettering (also the "More" summary, after Follow the frame).
  let fixed = null;
  const CHANGED = [["[data-size], [data-run-up], [data-lines], [data-frame-grow]", () => 'input[data-k="size"]'],
    ["[data-seg-set]", (b) => `[data-seg="${b.dataset.segSet.split(":")[0]}"] [aria-pressed="true"]`],
    ["[data-room], [data-follow]", () => 'input[data-k="radius"]'], ["[data-kern-off]", () => "select[data-pair]"],
    ["[data-color-set]", () => '.swatches [data-color][aria-pressed="true"]'], ["[data-font]", () => 'select[data-k="font"]'],
    ["[data-fab-set]", (b) => `#st-fabric [data-fab="${b.dataset.fabSet}"]`]];
  edit.addEventListener("click", (e) => {
    const b = e.target.closest("[data-warn] button, [data-fit] button, button[data-follow]");
    fixed = b && api.keyboard?.() && document.activeElement === b ? (CHANGED.find(([m]) => b.matches(m))?.[1](b) || "") : null;
  }, true);
  edit.addEventListener("click", () => {
    if (fixed == null) return;
    const sel = fixed; fixed = null;
    const ok = (n) => n && n.getClientRects().length && n.checkVisibility?.() !== false && !n.closest("[hidden]") && !n.disabled;   // (not in a shut "More")
    const w = edit.querySelector("[data-warn]"), c = sel && $("panel-design").querySelector(sel);
    // (no such control, as for a move: the problems that are left, else the piece's size)
    const to = [c, w?.textContent.trim() && w, edit.querySelector('input[data-k="size"], input[data-k="w"], input[data-file-scale]')].find(ok);
    if (!to) return;
    if (to === w) w.tabIndex = -1;
    to.focus({ preventScroll: true }); to.scrollIntoView({ block: "nearest" });
  });

  // a piece just picked: its controls are brought up into sight, enough of them to see what changed, keeping the list
  // in view where that fits (at 1413 × 717 they opened ~800 px down, under the whole list, and nothing seemed to happen).
  // From the preview only beside it: on a phone the page would scroll away from the piece under the finger.
  function showEditor(page, keep) {
    const f = $("st-edit").closest("fieldset"), box = f.closest(".controls");
    const side = box && /auto|scroll/.test(getComputedStyle(box).overflowY);
    if (!side && !page) return;
    const sc = side ? box : document.scrollingElement, r = f.getBoundingClientRect();
    const top = side ? box.getBoundingClientRect().top : 0;
    const bottom = side ? box.getBoundingClientRect().bottom : innerHeight - (parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) || 0);
    if (r.top < bottom - 160) return;
    const by = Math.min(r.top - top - 8, r.top - (bottom - Math.min(360, (bottom - top) * 0.6)), keep ? keep.getBoundingClientRect().top - top - 8 : Infinity);
    if (by <= 0) return;
    sc.scrollBy({ top: by, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  // drag a piece on the preview (mm in the hoop; the machine centres the whole design)
  let drag = null;
  // the smallest piece under the pointer, so letters inside a frame can be picked (the frame's box holds them all)
  const hit = ([x, y]) => {
    // (at the size it's sewn, as it's drawn: a frame-shrunk name was picked up from the empty frame round it)
    let best = null, area = Infinity;
    const fit = fittedSizes(pieces);
    for (const p of pieces) {
      const b = sewnBox(p, pieces, fit);
      if (!b || x < b[0] - 2 || x > b[2] + 2 || y < b[1] - 2 || y > b[3] + 2) continue;
      const a = (b[2] - b[0] + 4) * (b[3] - b[1] + 4);
      if (a < area) { best = p; area = a; }
    }
    return best;
  };
  // Zoomed in, a drag moves a piece only when it is the one already selected: any other drag slides the view (a
  // tester zoomed in to read 6 mm lettering, dragged to reach it and moved the appliqué letter under her finger: the
  // design grew from 80 to 140 mm tall and the view went blank). A tap picks a piece at any zoom (`pick`).
  function start(mm, zoomed = false) {
    const p = hit(mm); if (!p) return false;
    if (zoomed && sel !== p.id) return false;
    if (sel !== p.id) { sel = p.id; ui(); showEditor(false); }
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
  // a tap that wasn't a drag: the piece under it is selected, or nothing is
  function pick(mm) {
    const p = mm && hit(mm); if (!p) { deselect(); return; }
    if (sel !== p.id) { sel = p.id; save(); ui(); showEditor(false); }
  }
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
    const bs = sewnBoxes(pieces), hp = api.hoop(), lx = hp.w / 2 - 2, ly = hp.h / 2 - 2;
    if (!bs.length) return;
    const x0 = Math.min(...bs.map((b) => b[0])), y0 = Math.min(...bs.map((b) => b[1])), x1 = Math.max(...bs.map((b) => b[2])), y1 = Math.max(...bs.map((b) => b[3]));
    if ((x0 < -lx || x1 > lx || y0 < -ly || y1 > ly) && x1 - x0 <= 2 * lx && y1 - y0 <= 2 * ly) recentre();
  }
  function center() { change((p) => { p.x = 0; p.y = 0; }, true); }
  $("st-center").onclick = center;
  // shrink (or grow) everything together so the whole design fills the hoop, less a little room
  // (said, with the way back: it made an opened design 156 % of its size and the only word of it was in the piece's
  // editor, once the piece was picked)
  $("st-fit").onclick = () => {
    const size = () => { const bs = sewnBoxes(pieces); return bs.length ? [Math.max(...bs.map((b) => b[2])) - Math.min(...bs.map((b) => b[0])), Math.max(...bs.map((b) => b[3])) - Math.min(...bs.map((b) => b[1]))] : null; };
    const was = size(); remember(); fitHoop(); const now = size();
    if (!was || !now) return;
    const k = Math.max(now[0], now[1]) / Math.max(was[0], was[1]);
    if (Math.abs(k - 1) >= 0.03) toast(`Fit to hoop made the whole design ${k > 1 ? "bigger" : "smaller"}, to fill the ${api.hoop().name}: ${Math.round(k * 100)} % of the size it was.`, { label: "Undo", run: undo });
  };
  // how much bigger the design may be made: never a frame past the size its project is made for (`most`: the birth
  // announcement's 6 in display hoop)
  const mostScale = () => Math.min(...pieces.filter((p) => p.kind === "frame" && p.most).map((p) => p.most / Math.max(p.w, p.shape === "circle" ? p.w : p.h)));
  function fitHoop(draw = true) {
    const bs = sewnBoxes(pieces);
    if (!bs.length) return;
    const w = Math.max(...bs.map((b) => b[2])) - Math.min(...bs.map((b) => b[0])), h = Math.max(...bs.map((b) => b[3])) - Math.min(...bs.map((b) => b[1]));
    const hp = api.hoop();
    fitted = true;
    // (made smaller, sizes round down: rounded to the nearest half mm, an 8 mm word shrunk by 2 % stayed 8 mm, so
    // Fit to hoop on a design of small lettering moved the pieces closer and never fitted)
    const scale = (f) => { for (const p of pieces) {
      p.x *= f; p.y *= f;
      if (p.kind === "file") resizeFile(p, (p.scale || 1) * f);
      else for (const k of ["size", "radius", "ry", "w", "h"]) if (p[k] != null) p[k] = Math.max(0.5, (f < 1 ? Math.floor : Math.round)(p[k] * f * 2) / 2);   // (0.5: cleanPiece's least)
    } };
    const most = mostScale(), k = Math.min((hp.w - 10) / w, (hp.h - 10) / h);
    // (a design that already fits, past the 10 mm Fit leaves round it, is kept as it is: 125 x 175 mm in the 5x7 came
    // out 120 x 168)
    const fitsNow = k < 1 && (() => { try { compose(pieces, hp, { fabric, baste, thread, later: [], measure: true }); return true; } catch (err) { if (!err.overBy) throw err; return false; } })();
    if (!fitsNow) scale(k > 1 ? Math.max(1, Math.min(k, most)) : k);
    recentre();   // (in the middle, as the machine sews it: a fitted layout said "Off centre here")
    // the outlines leave out satin width and swashes: shrink again until what's sewn fits (a few tries at most)
    for (let i = 0; i < 6; i++) {
      try { compose(pieces, hp, { fabric, baste, thread, later: [], measure: true }); break; }
      catch (err) { if (!err.overBy) break; scale(0.98 / err.overBy); }
    }
    if (draw) { save(); ui(); make(); }
  }

  $("st-undo").onclick = $("bar-undo").onclick = undo;
  $("st-redo").onclick = redo;
  // a design file to keep and change later (the pieces, not the stitches)
  $("st-save").onclick = () => {
    // (with the hoop it was laid out in and its turn: a turned design reopened said Too big)
    const r = api.handOut([{ name: `${api.safeName(firstWords(), "design")}.needleworks.json`,
      bytes: JSON.stringify({ needleworks: 1, pieces, fabric, baste, thread, fitted, ...(two ? { two } : {}), ...(title ? { title } : {}), hoop: api.hoopId(), turned: api.turned() }, null, 1) }]);
    // (said, as every way out says what it saved: Save design said nothing, round 13)
    if (!r.ok) toast(r.error === "The saved design is empty." ? "Add a piece first: there's nothing to save yet." : r.error);
    else toast(`Saved ${r.files[0].name} to your downloads. Open saved brings it back to change.`);
  };
  const bad0 = "it isn't a design saved from this page, or it's damaged (saved designs end in .needleworks.json)";
  $("st-load").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) openSaved(f); };
  // a saved design (Open saved, or dropped on the page, shared to it, opened on the Open tab) in place of this one
  async function openSaved(f) {
    try {
      // (a damaged file said "Expected property name or '}' in JSON at position 1"; one wording for every file that
      // can't be read: it was four, one of them a raw "Maximum call stack size exceeded")
      const bad = () => new Error(bad0);
      let data; try { data = JSON.parse(await f.text()); } catch { throw bad(); }
      if (!data || data.needleworks !== 1 || !Array.isArray(data.pieces)) throw bad();
      const kept = openDesign(data, { from: f.name.replace(/\.needleworks\.json$|\.json$/i, "") });
      if (!kept) throw bad();
      if (!kept.toasted && kept.kept) toast(`Opened ${f.name}.${keptSaid(kept.kept)}`, { label: "Undo", run: undo });
    } catch (err) { console.error(err); toast("That design couldn't be opened: " + (err instanceof RangeError || err instanceof TypeError ? bad0 : err.message)); }
  }
  // a saved design's JSON (a file, or one of Recent designs: `o` from, tip) in place of this one: what it replaced
  // ({ kept: Recent designs' entry or null, toasted }), or null when nothing in it can be opened
  function openDesign(data, o) {
    // every piece checked and clamped (`cleanPieces`): what came out different is said
    const { pieces: loaded, said, huge } = cleanPieces(data.pieces);
    if (!loaded.length) return null;
    api.setMode("design");
    const hoop0 = api.hoopId(), hoopName0 = api.hoop().name, mh0 = api.machineHoop();
    // the hoop (when this machine has it) and the turn it was saved with
    const kept = newDesign((ids.next = 1, loaded.map((p) => ({ ...p, id: ids.next++ }))), { fabric: data.fabric, baste: data.baste, thread: data.thread, fitted: data.fitted, two: data.two, turn: data.turned,
      from: o.from, tip: o.tip, title: typeof data.title === "string" ? tidy(data.title).slice(0, 60) : "" });
    // (said, with a way back to the hoop that was picked: it switched from the 5x7 to the 4x4 with nothing said)
    // (the hoop it was saved for isn't a bigger hoop picked, to offer filling: that note took the place of this one)
    if (typeof data.hoop === "string" && data.hoop !== hoop0) { api.setHoop(data.hoop); lastHoop = null; }
    const otherHoop = api.hoopId() !== hoop0 && api.hoop().name;
    // (a size past what any hoop holds, cut down to the biggest piece there can be, is then fitted to this hoop:
    // `size: 1e9` opened as a 486 mm "Emma")
    if (huge) try { compose(pieces, api.hoop(), { fabric, baste, thread, later: [], measure: true }); } catch (err) { if (err.overBy) fitHoop(false); }
    settle(); save(); ui(); make();
    // (the way back checked first: a 5x7 design taken back to the 4x4 was Too big there, so it's fitted to it, and
    // said so on the button; an Undo step)
    if (otherHoop) {
      const there = api.turned() ? { ...mh0, w: mh0.h, h: mh0.w } : mh0, n0 = hoopName0.replace(/ hoop$/, "");
      let fits = true; try { compose(pieces, there, { fabric, baste, thread, later: [], measure: true }); } catch (err) { if (!err.overBy) throw err; fits = false; }
      toast(`Opened for the ${otherHoop} it was saved for.`, { label: fits ? `Use the ${n0} instead` : `Fit it to the ${n0} instead`, run: () => { remember(); api.setHoop(hoop0); if (!fits) fitHoop(); } });
    }
    if (said) toast(`From that file: ${said}`);
    return { kept, toasted: !!(otherHoop || said) };
  }
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
    // (the whole design with what it's sewn on and the hoop's turn: pasted into an empty design, in another window, it
    // came out on cotton and upright)
    e.preventDefault(); e.clipboardData.setData("text/plain", JSON.stringify({ needleworks: 1, pieces: p ? [p] : pieces, ...(p ? {} : { fabric, baste, thread, turned: api.turned(), ...(title ? { title } : {}) }) }));
    toast(p ? `Copied ${label(p)}. Paste to add a copy.` : `Copied the whole design. Paste to add a copy.`);
  });
  document.addEventListener("paste", (e) => {
    if (!onPage(e) || e.clipboardData?.files?.length) return;
    let got; try { got = JSON.parse(e.clipboardData.getData("text/plain")); } catch { return; }
    // (checked as Open saved checks them, and what came out different said with the paste: `cleanPieces`)
    const { pieces: ps, said } = got?.needleworks === 1 && Array.isArray(got.pieces) ? cleanPieces(got.pieces) : { pieces: [] };
    if (!ps.length) { if (said) toast(`Nothing pasted: ${said}`); return; }
    e.preventDefault(); addPieces(ps, got, "Pasted", said);
  });
  // pieces pasted, or a saved design's added with + Design file: one where a new piece would go, several together in
  // free space; a whole design (`got` with its fabric) into an empty one is that design, as it was sewn
  function addPieces(ps, got = {}, verb = "Pasted", said = "") {
    const also = said ? ` ${said}` : "";
    if (!pieces.length && own(FABRICS, got.fabric)) {
      newDesign(ps.map((q) => ({ ...structuredClone(q), id: ids.next++ })), { fabric: got.fabric, baste: got.baste, thread: got.thread, turn: got.turned, title: typeof got.title === "string" ? tidy(got.title).slice(0, 60) : "" });
      settle(); save(); ui(); make(); toast(`${verb} the design.${also}`); return;
    }
    remember(); fitted = false;
    const add = ps.map((q) => ({ ...structuredClone(q), id: ids.next++ })), bs = sewnBoxes(add);
    // one piece goes where a new one would (`place`): beside its original, or in a frame, or in free space
    if (add.length === 1 && pieces.length) { const was = sewn(add[0], add).size; if (place(add[0], (q) => pieces.push(q))) toast(`${verb} ${label(add[0])}.${smallerSaid(add[0], was, "", true)}${also}`); return; }
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
      if (!at) { toast(`There's no free room in the hoop for ${add.length} more pieces. Make something smaller, or take something out first.${also}`, { label: `${verb === "Pasted" ? "Paste" : "Add them"} anyway`, run: () => { remember(); fitted = false; go(box, spotFor(box, true)); } }); return; }
      go(box, at);
    } else go([0, 0, 0, 0], [0, 0]);
    toast((add.length === 1 ? `${verb} ${label(add[0])}.` : `${verb} ${add.length} pieces.`) + also);
  }
  // the smallest a new piece is made to fit a frame: half its size for lettering, what still stitches well for the
  // rest (a filled motif under 25 mm starts to lose its detail, and the editor says so, but inside the quilt block's
  // frame beats outside it)
  const least = (p) => (p.size == null ? p.size : p.kind === "text" ? Math.max(5, Math.round(p.size) / 2) : p.kind === "monogram" ? Math.min(p.size, 15)
    : p.kind === "motif" ? Math.min(p.size, MOTIF_MIN(p)) : p.kind === "letters" ? Math.min(p.size, 30) : p.size);

  // the whole layout back to the middle of the hoop (the machine centres it anyway; the preview should too)
  // another of in-the-hoop frame f and everything on it, beside it across its short side (two bookmarks fit a 5x7
  // that way), the layout recentred; said and undone if it doesn't fit the hoop (turned when that's what fits)
  function twoUp(f) {
    if (!f || f.kind !== "frame") return;
    remember();
    const fit = another(f);
    // (recentre moved the originals too: put everything back as it was, with no redo left behind)
    if (!fit) {
      undo(); future.length = 0; buttons();
      // the biggest it can be with another beside it, offered (checked by making it: the default key fob refused the
      // 4x4 with "make it smaller first", and 38 mm wide of its 44 would do)
      const n = smallerTwins(f), side = f.w >= (f.shape === "circle" ? f.w : f.h) && f.shape !== "circle" ? "h" : "w";
      if (n) toast(`Another ${shapeLabel(f)} doesn't fit this hoop beside the first, but two fit at ${n} mm ${side === "h" ? "tall" : "wide"}.`,
        { label: `Make them ${n} mm and add another`, run: () => { const g = pieces.find((o) => o.id === f.id); if (!g) return; const t0 = api.turned(); remember(); resizeFrame(g, side === "w" ? n : g.w, side === "h" ? n : g.h); if (!another(g)) { undo(); return; } done(g, api.turned() !== t0); } });
      else { const n0 = pieces.filter((q) => alike(q, f) || q === f).length; toast(`Another ${shapeLabel(f)} doesn't fit this hoop beside ${n0 > 1 ? `the ${n0} there` : "the first"}. Make ${n0 > 1 ? "them" : "it"} smaller first, or pick a bigger hoop.`); }
      return;
    }
    done(f, fit === "turned");
    function done(g, turned) {
      if (turned) api.fit();
      sel = pieces.filter((q) => alike(q, g) || q === g).at(-1).id; save(); ui(); make();
      toast(`${pieces.filter((q) => alike(q, g) || q === g).length === 2 ? "Two" : "More"} ${shapeLabel(g)}s in the hoop${turned ? " (hoop turned to fit)" : ""}: they sew in the same steps.`, { label: "Undo", run: undo });
    }
  }
  // another of in-the-hoop frame f and everything on it, beside it across its short side (two bookmarks fit a 5x7
  // that way), the layout recentred: "fits", "turned" (the hoop turned, that's what fits) or "" (the pieces are left
  // with the copy in: the caller undoes it)
  function another(f) {
    const on = pieces.filter((q) => q === f || (q.kind !== "frame" && inFrame(sewnAt(q), f, -2)));
    const twins = pieces.filter((q) => q.kind === "frame" && q.border === f.border && q.shape === f.shape);
    const across = f.w >= (f.shape === "circle" ? f.w : f.h), step = (across ? (f.shape === "circle" ? f.w : f.h) : f.w) + 8;
    // (past the last one already there: a third goes beside the second)
    const far = twins.reduce((m, q) => Math.max(m, across ? q.y - f.y : q.x - f.x), 0);
    const copies = on.map((q) => ({ ...structuredClone(q), id: ids.next++, ...(across ? { y: q.y + far + step } : { x: q.x + far + step }) }));
    pieces = [...pieces, ...copies]; recentre();
    try { compose(pieces, api.hoop(), { fabric, baste, thread, later: [], measure: true }); return "fits"; } catch (err) { if (!err.overBy) throw err; }
    if (api.hoop().w !== api.hoop().h) { api.setTurn(!api.turned()); try { compose(pieces, api.hoop(), { fabric, baste, thread, later: [], measure: true }); return "turned"; } catch (err) { api.setTurn(!api.turned()); if (!err.overBy) throw err; } }
    return "";
  }
  // the biggest size (whole mm, across the side the copies go beside, down to 60 %) frame f can be made for another to
  // fit beside it, with nothing on it then too small or running into anything; tried on a copy of the design, or 0
  function smallerTwins(f) {
    const side = f.w >= (f.shape === "circle" ? f.w : f.h) && f.shape !== "circle" ? "h" : "w", was = f[side];
    const keep = pieces, turn = api.turned(), id = ids.next, bad0 = collisions(pieces).length;
    try {
      for (let n = Math.floor(was) - 1; n >= Math.max(20, was * 0.6); n--) {
        pieces = structuredClone(keep);
        const g = pieces.find((o) => o.id === f.id);
        resizeFrame(g, side === "w" ? n : g.w, side === "h" ? n : g.h);
        const on = onFrame(g).filter((q) => q.kind !== "frame");
        if (on.some((q) => minSize(sewnAt(q)))) return 0;   // (smaller still only makes them smaller)
        const fit = another(g);
        if (api.turned() !== turn) api.setTurn(turn);
        if (fit && collisions(pieces).length <= bad0) return n;
      }
      return 0;
    } finally { pieces = keep; ids.next = id; if (api.turned() !== turn) api.setTurn(turn); }
  }
  const shapeLabel = (f) => label(f).toLowerCase();
  // the empty frames alike f, when f has something on it
  function sameTargets(f) { return f?.kind === "frame" && onFrame(f).some((q) => q.kind !== "frame") ? pieces.filter((g) => alike(f, g) && !onFrame(g).length) : []; }
  // what's on frame f, copied onto each empty frame alike, placed alike (each copy just after its frame, in the same
  // order); undone and said if that runs into anything or takes the design past the hoop
  function sameOn(f) {
    const to = sameTargets(f); if (!to.length) return;
    const on = onFrame(f).filter((q) => q.kind !== "frame");
    remember();
    const added = [];
    for (const g of to) {
      const copies = on.map((q) => ({ ...structuredClone(q), id: ids.next++, x: q.x - f.x + g.x, y: q.y - f.y + g.y }));
      pieces.splice(pieces.indexOf(g) + 1, 0, ...copies); added.push(...copies);
    }
    const fits = fitsNow(), hit = added.find((q) => touching(sewnAt(q), pieces));
    if (!fits || hit) { undo(); future.length = 0; buttons(); toast(`What's on this ${shapeLabel(f)} doesn't fit on the other${to.length > 1 ? "s" : ""} as it is${hit ? `: it would run into ${label(touching(sewnAt(hit), pieces)).toLowerCase()}` : ""}.`); return; }
    sel = added[0].id; save(); ui(); make();
    toast(`The same on ${to.length === 1 ? "the other" : `all ${to.length + 1}`} ${shapeLabel(f)}${to.length === 1 ? "" : "s"}.`, { label: "Undo", run: undo });
  }
  function recentre() {
    const all = sewnBoxes(pieces);
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
      // (a picture, a zip or an empty file said as what it is, as the Open tab says it)
      const bytes = new Uint8Array(await f.arrayBuffer()), not = notEmbroidery(bytes, f.name);
      // (a design saved from here: its pieces added, as a paste adds them; it said the file couldn't be added)
      const kept = savedDesign(bytes);
      if (kept) { const { pieces: ps, said } = cleanPieces(kept.pieces); if (ps.length) { addPieces(ps, {}, "Added", said); return; } }
      if (not) { toast(not.message); return; }
      addFile(readEmbroidery(bytes, f.name), f.name.replace(/\.[^.]+$/, ""));
    } catch (err) { toast("That file couldn't be added: " + err.message); }
  };

  $("st-guide").hidden = !!api.store.get("studio.guideSeen", false);
  $("st-guide-close").onclick = () => { $("st-guide").hidden = true; api.store.set("studio.guideSeen", true); };

  const forNames = () => namesFor(S);

  cards(); ui(); recentUI();
  const starter = (id, tweak) => pickStarter(STARTERS.find((x) => x.id === id), tweak);
  // Rename (app.js): the name asked for, "" for the automatic one; the name it would have without one
  // (an Undo step of its own: undoing an earlier change took the name back with it)
  const rename = (t) => { t = tidy(t || "").trim().slice(0, 60); if (t === title) return; remember(); title = api.safeName(t, "") ? t : ""; save(); make(); };
  // the Picture tab's stitches into this design (`fresh`: a new design of it alone), in Design your own
  const usePicture = (d, name, fresh) => { if (fresh || !pieces.length) { addWords(d, name, false); return; } api.setMode("design"); if (addFile(d, name)) toast(`Added ${name} to your design.`, { label: "Undo", run: undo }); };
  // (Download handed the file over: a design downloaded and then replaced is said so in Recent designs)
  const downloaded = () => { if (!sent) { sent = true; save(); } };
  // the editor's fixes for piece `id` (beside Download's "Show the fix"): the piece picked, its problems in sight and
  // focused once they're drawn
  async function showFix(id) {
    if (!pieces.some((p) => p.id === id)) return;
    if (sel !== id) { sel = id; save(); ui(); }
    for (let k = 0; k < 40; k++) {
      const w = $("st-edit").querySelector("[data-warn]");
      if (w && !w.hidden && w.textContent.trim()) {
        w.tabIndex = -1; w.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); w.focus({ preventScroll: true });
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    showEditor(true);
  }
  return { make, addWords, showFix, usePicture, openSaved, downloaded, empty: () => !pieces.length, starter, rename, title: () => title, autoName: () => api.safeName(autoWords(), "design"), selBox: () => { const p = current(); return p ? pieceBounds(sewnAt(p)) : null; }, relabel: () => { ui(); make(); }, start, move, end, nudge, deselect, pick, forNames, remember, another: () => !!loneProject(), twoUp: () => twoUp(loneProject()), recentre: () => { remember(); recentre(); save(); ui(); make(); } };
}
