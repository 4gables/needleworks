/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
import { turnForMachine, turnPattern } from "./core/design.js";
import { FONTS } from "./core/fonts.js";
import { STITCH, designStats, machineThreads, readEmbroidery, validatePES, writePES } from "./core/formats.js";
import { DEFAULT_MACHINE, MACHINES, MAKERS, MARGIN, hoop as getHoop, hoopLabel } from "./core/machines.js";
import { PEC_MATCH, PEC_THREADS, hexToRgb, nearestBrotherThread, pecThread, rgbToHex } from "./core/threads.js";
import { CLOTHS, colorBlocks, draw } from "./render.js";
import { TURNED, TURN_PIC, cutDXF, cutName, cutSVG, firstStep, sewSheet, sewTime, stepTime, told, youHtml } from "./sheet.js";
import { handOut, judge } from "./gate.js";
import { DST_COLOURS, blockLoads, checkup, fewerBlocks, fix, heat, openedFile, pauses, shortJumps, sortedChanges } from "./doctor.js";
import { HARD, MAX_BLOCKS, denseWords, moves, verdictOf } from "./quality.js";
import { BLOCK, LOOK, LOOK_HEAD, TIP, TIP_HEAD, isolate, problemsHtml, problemsInline, problemsItems, problemsOf, shownOn, stopWords, stopsAt, mmText } from "./words.js";
import { brief, monogramHelp, safeName, tidy, uniqueName, withSwash } from "./core/typed.js";
import { BRANDS, apart, brotherNum, chartSpools, exampleSpools, lab, nearestSpool, nearestSpools, ownSpoolOf, spools } from "./core/brands.js";
import { COLORS as LINE_THREADS, initStudio, savedDesign } from "./studio/ui.js";
import { $, designHoop, designTurned, fileFormat, fileThreads, forgetPicture, hoop, janomeName, keepPicture, kept, machineFormat, maker, outName, shownHoop, square, state, store, toMachine, turnCut, turned, turnedFile } from "./state.js";
import { OUT_FORMATS, janomeThreads, jefThreads } from "./core/formats-out.js";
import { keepFocus, keyboard, live, next } from "./focus.js";
import "./onitem.js";   // (it sets itself up: nothing here calls into it)
import { along, namesFor } from "./along.js";
import { brandUI, nearOwn, ownSpool, ownedPalette, ownedSpools, owns, relabel, threadHtml, threadLabel, threadLine, threadList } from "./threadui.js";

// The Picture and Open tabs' code (picture.js, opened.js and the picture engine behind them: a quarter of the
// scripts) isn't part of the first load: it comes when the first design is on screen, or at once when one of those
// tabs, a dropped file or a shared one asks for it. Reason: on a slow phone the first preview waited 18 s, every
// byte of it download (50 KB/s), and the Design tab needs none of this. Until it is here the two tabs say "Getting
// ready…"; `tabs.picture` / `tabs.opened` are the modules once loaded.
export const tabs = { picture: null, opened: null, coming: null };
export function tabCode() {
  return (tabs.coming ||= Promise.all([import("./picture.js"), import("./opened.js")]).then(([p, o]) => { tabs.picture = p; tabs.opened = o; fillMachines(); return tabs; },
    (err) => { tabs.coming = null; throw err; }));
}
// (what the other parts call before the tabs' code is in does nothing: there is no picture or opened file yet)
export const makePicture = (...a) => tabs.picture?.makePicture(...a);
export const paletteUI = (...a) => tabs.picture?.paletteUI(...a);
export const openDesign = (...a) => tabs.opened.openDesign(...a);
// a file dropped, pasted or shared: to the tab that takes it, once its code is here
const route = (file) => { if (file) tabCode().then((t) => t.opened.route(file)).catch(() => showError(NOT_HERE)); };
const NOT_HERE = "That part of Needleworks didn't load: the internet connection may have dropped. Check it and try again.";
export { threadHtml } from "./threadui.js";

// the old bookmark panel's colours as saved, mapped to the exact Brother PEC colours (#1a1a1a showed as "Olive Green"),
// for an old #bookmark link opening the Bookmark starter
const OLD_THREADS = { "#c8102e": "#ed171f", "#e1252f": "#ed171f", "#f06292": "#f64a8a", "#7b2d8e": "#770176",
  "#1f3a68": "#0e1f7c", "#2e6b3a": "#00673e", "#c99a2e": "#e8a900", "#1a1a1a": "#000000" };

// ---------- start ----------
fillMachines();
brandUI();

// ---------- preview ----------
export const canvas = $("view");
// the design as it is after colour block i (step view, sew along): sewn so far, the rest faint; placement lines show
// until the fabric goes over them
export function stepLook(v, i, block) {
  const fab = v.fabricShapeBlock;
  return { upto: block ? block.segs.reduce((m, sg) => Math.max(m, sg[sg.length - 1][2]), 0) + 1 : undefined,
    hide: new Set([...(v.hide || [])].filter((k) => k < i)), fabricShapeBlock: fab != null && i <= fab ? undefined : fab };
}
// While words are typed into a piece, the preview keeps the scale it had (`typeFit`) until focus leaves the box: each
// letter changed the note under the preview, the threads row and the Download button's name, the preview's height
// with them, and the hoop jumped in and out as the name was typed (newcomer, round 13). Not while the design is too
// big for the hoop: then it's fitted whole, as it must be to be seen.
const typing = () => state.mode === "design" && document.activeElement?.matches?.("#controls textarea, #controls input[type=text], #controls input:not([type])");
document.addEventListener("input", (e) => { if (typing() && e.target === document.activeElement && state.tf && !state.view?.whole) state.typeFit ??= state.tf.base.fit; }, true);
document.addEventListener("focusout", () => setTimeout(() => { if (state.typeFit && !typing()) { state.typeFit = null; paint(); } }), true);
export function paint() {
  const v = state.view;
  if (state.typeFit && (!typing() || !v || v.whole || state.hold)) state.typeFit = null;
  $("empty").hidden = !!v || !$("error").hidden;   // (an error says what's wrong; "Nothing to stitch yet" under it misled)
  // (room kept clear for the chips at the top and a message at the bottom: the too-big note covered the hoop on phones)
  const err = $("error"), room = { padTop: $("facts").offsetHeight + 16, padBottom: err.hidden ? undefined : err.offsetHeight + 28, corner: zoomCorner(), base: state.hold, fit: state.typeFit };
  const field = { hoop: shownHoop(), showHoop: state.showHoop && !state.backdrop, field: state.bg };
  // (nothing to stitch yet: the hoop stays, so there's still something to put the first piece in)
  if (!v) { state.tf = draw(canvas, null, { ...field, ...room, zoom: state.zoom, pan: state.pan }); return; }
  const block = state.step != null && state.mode === "design" && v.cache.blocks.find((b) => b.index === state.step);
  const look = block ? stepLook(v, state.step, block) : { upto: state.upto ?? undefined, hide: v.hide, fabricShapeBlock: v.fabricShapeBlock };
  state.tf = draw(canvas, v.shown, {
    // (a design too big for the hoop, or split in two, is fitted whole: centred on the hoop it was cut off)
    center: state.mode === "design" && !v.whole ? [0, 0] : undefined, ghost: !!block,
    cache: v.cache, fabric: v.fabric, ...look,
    heat: state.heat ? (v.heat ||= heat(v.shown)) : null, backdrop: state.backdrop,
    ...field, zoom: state.zoom, pan: state.pan, showNeedle: state.upto != null,
    real: state.real, boxes: v.hoopings, marks: v.marks, ...room,
    // (the selected piece, boxed on every screen size: on a phone the editor is far below and nothing showed which)
    sel: state.mode === "design" && !block && state.upto == null && !v.hoopings ? selBox() : null,
  });
}
let selBox = () => null;   // (the Design tab's, once it's started)
// the zoom pad's share of the preview's top-right corner ([w, h] px), kept clear by `draw`
function zoomCorner() {
  const c = canvas.getBoundingClientRect(), z = document.querySelector(".zoom").getBoundingClientRect();
  return z.width ? [c.right - z.left, z.bottom - c.top] : undefined;
}
new ResizeObserver(() => paint()).observe(canvas);
const dark = matchMedia("(prefers-color-scheme: dark)");
dark.addEventListener("change", () => paint());

export function setView(v) {
  stopPlay();
  state.view = v; state.views[state.mode] = v; state.upto = null; $("progress").value = 1000;
  if (state.step != null && !(v?.steps > state.step)) showStep(null);   // the design changed under a step view
  $("turn").setAttribute("aria-pressed", turned());
  $("turn").disabled = square(); $("turn").title = square() ? "A square hoop is the same either way round." : "Turn the hoop sideways, so a long design can use the hoop's long side.";
  if (!v) { $("rename-open").hidden = $("another-open").hidden = true; $("dl-warn").hidden = true; $("facts").innerHTML = ""; $("threads").innerHTML = ""; $("download").disabled = true; $("download").textContent = `Download ${fileFormat().short}`; $("share").disabled = true; $("sheet-print").disabled = $("along-open").disabled = true; $("cut-files").hidden = true; $("names-open").hidden = true; paint(); return; }
  // the preview is the file: decode the PES bytes and draw those, not the design they were made from
  if (!v.file) {
    // (a design moved onto the hoop's centre to be written, `shift`: drawn back where its pieces are, so the selection
    // box and a drag line up with the stitches: they were 100 mm apart after a piece was dragged far out of the hoop)
    try { v.file = v.source ? v.pattern : unwrap(readEmbroidery(v.bytes, v.filename), state.mode === "design" && v.pattern, v.shift ? (turned() ? [-v.shift[1], v.shift[0]] : v.shift) : undefined); }
    catch (err) { v.file = null; showError("This file didn't read back: " + err.message); $("download").disabled = true; $("share").disabled = true; return; }
  }
  v.shown = turned() ? turnPattern(v.file, false) : v.file; v.heat = null;
  // (the turned hoop's note as the view says it: an in-the-hoop design hoops bare stabilizer, so its fabric goes round)
  $("done-turn-text").textContent = v.turnNote || TURNED;
  v.cache = colorBlocks(v.shown);
  const st = designStats(v.file), h = hoop(), shown = designStats(v.shown);
  // (a split design is checked part by part when it's downloaded)
  const fits = !!v.split || (st.widthMm <= h.w - 2 * MARGIN && st.heightMm <= h.h - 2 * MARGIN);
  v.whole = !!v.split || !fits;
  // (two hoopings: the pauses the machine makes in the two files, as the steps and the done dialog count them; the whole
  // design's colour changes said "1 pause" beside steps with none)
  const stops = v.split ? v.split.reduce((a, p) => a + designStats(p.pattern).colorChanges, 0) : st.colorChanges;
  const counts = (v.split ? v.split.map((q) => stopCounts(q.pattern)) : [stopCounts(v.file, st.colorChanges)]).reduce((a, b) => [a[0] + b[0], a[1] + b[1]]);
  // (the threads the machine cuts take time too: a jump of 5 mm or less isn't cut, `snips`)
  const snips = shortJumps(v.file), time = sewTime(blockLoads(v.file), stops), minutes = time.total;
  $("fact-tip")?.remove();
  const orient = turned() ? "turned" : state.mode === "open" && !square() ? "machine" : "";
  // What every surface says of the design (the chips here, the sew sheet, the download dialog, Sew along, the Open
  // tab's file card), worked out once: the sew sheet said 54 × 169 mm for the turned bookmark the chips and the dialog
  // called 169 × 54, and Sew along's steps added up to another time.
  // (a size just over the field isn't rounded down to read as if it fits: 126.4 showed as 126 beside "fits 126")
  // (which way round, where it can differ: a bookmark is 169 × 54 in the Design tab, hoop turned, and its file
  // 54 × 169 in the Open tab, as the machine's screen shows it)
  v.fact = { size: mmText([shown.widthMm, shown.heightMm], [shownHoop().w - 2 * MARGIN, shownHoop().h - 2 * MARGIN]), machineSize: `${st.widthMm.toFixed(0)} × ${st.heightMm.toFixed(0)} mm`,
    turned: orient === "turned", stitches: `${st.stitches.toLocaleString()} stitches`, stops: counts[0] + counts[1] ? stopWords(...counts) : "no thread changes",
    minutes, steps: time.steps, time: `≈ ${minutes} min`, hoop: `${h.machineName} ${h.name}`, snips: snips ? `${snips} loose ${snips === 1 ? "thread" : "threads"} to snip after` : "" };
  $("facts").innerHTML = [
    `<span>${v.fact.size}</span>`,
    orient === "turned" ? `<span${tip(`The size across × down with the hoop turned sideways, as shown here. The machine's screen shows it on its side: ${v.fact.machineSize}.`)}>Hoop turned</span>`
      : orient ? `<span${tip("The size across × down with the hoop upright, as the machine's screen shows it. A design made with the hoop turned reads the other way round here.")}>As the machine shows it</span>` : "",
    // (what there is to do after sewing comes second: last in the row, a phone's one line of chips cut it off)
    snips ? `<span${tip(snipsTip())}>${v.fact.snips}</span>` : "",
    `<span>${v.fact.stitches}</span>`,
    // (thread changes and pauses in the same thread, in the same words on every tab: the Design tab said "1 pause" for
    // the stop the Open tab called "1 thread change"; two hoopings count the stops in both files)
    stops ? stopsFact(...counts) : "",
    `<span>${v.fact.time}</span>`,
    // (the Design and Picture tabs never said it fits, as the Open tab's file card does)
    v.split ? `<span>${v.split.length} hoopings</span>` : fits ? (state.mode !== "open" ? `<span>Fits ${escapeHtml(h.name.replace(/ hoop$/, ""))}</span>` : "") : `<span class="bad">Too big for the ${h.name}</span>`,
    offCentre(v, fits) ? `<span class="note">Off centre here: the machine centres it <button type="button" class="link" id="recentre">Centre it</button></span>` : "",
  ].join("");
  // One chip per thread, in the order each is first put on, with how many times it's put on: a chip per colour block
  // (Black, Red, Black) named one thread twice, each with its own note, and the row grew over the preview. Blocks in a
  // row in one thread (pauses) are one time. Every thread, hidden placement lines too: an ornament's chips read Blue,
  // Red while its steps and Have ready said Red, Blue, because its first red block is a placement line hidden in the
  // preview. (the chip's note is the short one; the whole label is its tooltip, and the steps say it in full)
  // One chip per machine thread, not per label: two colours sewn in one spool of theirs were one chip, "Your Isacord
  // 0020 · the machine calls it Dark Gray", while the steps named Black for the second (the machine shows both)
  const mt = machineThreadList(v), chips = new Map();
  let last = "";
  for (const b of v.cache.blocks) {
    const t = mt[b.index] || nearestBrotherThread(b.color), l = threadLabel(b.color, t.name), key = t.name;
    if (!chips.has(key)) chips.set(key, { color: b.color, l, file: v.fileNote?.(b, t) || "", times: 0 });
    if (key !== last) chips.get(key).times++;
    last = key;
  }
  $("threads").innerHTML = [...chips.values()].map(({ color, l, file, times }) => { const name = l.name;
    const small = [file, l.short, times > 1 ? `used ${times === 2 ? "twice" : `${times} times`}` : ""].filter(Boolean).join(" · ");
    return `<li${l.note ? ` title="${escapeHtml(`${name} · ${l.note}`)}"` : ""}><i style="background:${color}"></i><span>${escapeHtml(name)}${small ? `<br><small>${escapeHtml(small)}</small>` : ""}</span></li>`;
  }).join("");
  // (the sew sheet's line: the chips' words; its 1:1 drawing is the file, on its side when the hoop is turned)
  v.fact.threads = chips.size;
  v.facts = [v.fact.size, v.fact.turned ? `hoop turned: drawn below on its side, as the machine's screen shows it (${v.fact.machineSize})` : "", v.fact.stitches, v.fact.stops, v.fact.time, v.fact.hoop, v.fact.snips].filter(Boolean);
  // (`block`: a design that can't be sewn as it is, such as words wrapped round into themselves: no file until it's fixed)
  const blocked = blocking(v);
  $("download").disabled = !fits || !!blocked; $("share").disabled = !fits || !!v.split || !!blocked;
  // (nor a sew sheet or Sew along for a file that can't be made)
  $("sheet-print").disabled = $("along-open").disabled = !fits || !!v.split || !!blocked; $("cut-files").hidden = !v.sheet?.cut?.length; $("names-open").hidden = !!v.split || !namesFor();
  // (Make another, by the preview too: on a phone the one under the starters is 1,475 px down, past the preview and the
  // first-run note, and a tester making two bookmarks never reached it)
  $("another-open").hidden = state.mode !== "design" || !!v.split || !studio.another(); $("rename-open").hidden = state.mode !== "design";
  // (one per name from a design that doesn't fit yet made a zip of names that didn't fit either)
  // (and not while Download is blocked: every way out of the tab follows the same rule. It stayed on beside "Fix the
  // lettering first" and made a ZIP of names from a design that couldn't be sewn.)
  $("names-open").disabled = !fits || !!blocked; $("names-open").title = !fits ? "Make the design fit the hoop first." : blocked ? `${blocked.replace(/\.$/, "")}: fix that first.` : "";
  if (state.mode === "picture") picSteps(v, st);
  // (pieces running into each other said beside Download, before the file is saved, not only in the editor)
  warnUI(v);
  // (the file's own verdict, as tests/pe900_check.py would give it, a moment later: not on every frame of a drag)
  clearTimeout(qTimer);
  if (fits && !v.split && !v.verdict) qTimer = setTimeout(() => { if (state.view === v) { v.verdict = verdictOf(v.bytes); warnUI(v); } }, 250);
  // (and the size controls: "Largest that fits the 5x7" stayed after the hoop was changed to 4x4 on another tab)
  if (state.mode === "open" && state.opened) { tabs.opened.openInfo(v, st, fits); if ($("doc-scale")) tabs.opened.sizeUI(); }
  $("download").textContent = v.split ? `Download ${v.split.length} files (.zip)` : !fits ? "Too big for this hoop" : blocked ? v.blockLabel || "Fix the lettering first" : v.action || `Download ${outName(v.filename)}`;
  // (the whole name where the button cuts it short)
  $("download").title = $("download").textContent;
  paint();
}
let qTimer = 0;
$("dl-warn").addEventListener("click", (e) => { const b = e.target.closest("[data-show-fix]"); if (b) studio.showFix(+b.dataset.showFix); });
// what stops a file being made: a wait (a design file re-stitching) or a problem that blocks it (words.js)
const blocking = (v) => v.block || problemsOf(v).find((q) => q.level === BLOCK)?.text || "";
// beside Download: the view's problems (words.js), then what's wrong with the file itself
export function warnUI(v) {
  const all = shownOn(problemsOf(v), "download"), own = all.filter((q) => !q.file), file = all.filter((q) => q.file);
  // (where the fix is, as a button that shows it: "Select the piece in the list" was said with it selected, round 13)
  const fixAt = own.length && v.fixHint && state.mode === "design" ? `${v.fixHint.many ? "Each piece's fix is with its settings" : "The fix is with the piece's settings"}: <button type="button" class="link" data-show-fix="${v.fixHint.piece}">${v.fixHint.many ? "show the first" : "show it"}</button>.` : "";
  const html = [v.block ? escapeHtml(v.block) : "", problemsInline(own), fixAt,
    // (a rule the machine needs: nothing is saved as it is, so not "Download it": the dialog offers a fixed copy instead)
    file.length ? `This file may not sew well: ${problemsInline(file)}${file.some((q) => HARD.has(q.id.slice(5))) ? " It can't be saved as it is: Download offers a fixed copy if one can be made." : state.mode === "open" ? "" : " Download it and the next screen offers a fixed copy."}` : ""].filter(Boolean).join(" ");
  $("dl-warn").innerHTML = html; $("dl-warn").hidden = !html;
}
// thread changes, and pauses where the next block is in the same thread (an in-the-hoop bookmark's fabric steps: the
// Open tab said "4 thread changes" for an all-red file)
function stopsFact(ch, same) {
  return (ch ? `<span${tip("The machine stops for each one: thread the next colour and press Start.")}>${ch} thread ${ch === 1 ? "change" : "changes"}</span>` : "")
    + (same ? `<span${tip("The machine stops but the thread stays the same: usually a fabric step (in-the-hoop or appliqué). Sew along says what to do at each pause.")}>${same} ${same === 1 ? "pause" : "pauses"} in the same thread</span>` : "");
}
// a design's stops: [thread changes, pauses in the same thread]
function stopCounts(p, n = designStats(p).colorChanges) { const same = Math.min(n, pauses(p)); return [n - same, same]; }
// the Picture tab's steps: what to have ready, then one thread per pause (it had none: "3 pauses" went unexplained).
// The same words go to Sew along and the sew sheet (`v.sheet`: they said only "Thread the machine…")
function picSteps(v, st) {
  const mt = machineThreadList(v), blocks = v.cache.blocks, heavy = st.stitches > 8000;
  const thread = (b) => { const n = threadLabel(b.color, (mt[b.index] || nearestBrotherThread(b.color)).name).name; return n.startsWith("Your ") ? "your" + n.slice(4) : n; };
  const ready = [heavy ? "Cut-away stabilizer (or two layers of tear-away on woven fabric): this is a lot of stitching." : "Tear-away stabilizer under woven fabric; cut-away under knits (T-shirts, sweatshirts), which stretch.",
    `${threadList(blocks.map((b) => b.color), (h) => state.pic.machineName?.get(h) || nearestBrotherThread(h).name)} They are sewn in this order.`];
  // (each thread named: "thread this colour" left the colour to the swatch)
  const steps = blocks.map((b, i) => ({ you: i ? `Change to ${thread(b)} and press Start.` : firstStep(v.filename, thread(b), "Hoop the fabric with the stabilizer under it"), sews: "" }));
  const after = "Take the hoop off and snip any loose threads between parts. Tear-away stabilizer: tear it off gently, holding the stitches down with your thumb. Cut-away: trim it about ¼ in from the stitching (don't tear it: it keeps the design in shape).";
  const said = v.sheet = told({ ...v.sheet, ready, steps, after: [after] });
  // (counted as the Design tab counts its steps, the stops in the chips' words: "· 4 threads" counted colour blocks,
  // so a thread put on twice was two threads beside one chip)
  $("pic-steps-count").textContent = `· ${blocks.length} ${blocks.length === 1 ? "step" : "steps"}${blocks.length > 1 ? `, ${v.fact.stops}` : ""}`;
  $("pic-steps").innerHTML = problemsItems(shownOn(problemsOf(v), "steps")) + (turned() ? `<li class="after"><b>Hooping</b><span class="turned">${TURN_PIC}${escapeHtml($("done-turn").textContent)}</span></li>` : "")
    + `<li class="after"><b>Have ready</b><ul class="ready">${said.ready.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul></li>`
    + blocks.map((b, i) => { const t = mt[b.index] || nearestBrotherThread(b.color);
      return `<li><b><span class="n">${i + 1}</span><i style="background:${b.color}"></i>${threadHtml(b.color, t.name)}</b>${youHtml(said.steps[i].you, escapeHtml)}</li>`; }).join("")
    + `<li class="after"><b>When it's done</b><span>${escapeHtml(said.after.join(" "))}</span></li>`;
}
// A design reaching past 204.8 mm from its centre (only a too-big or split design's whole view, never a file to sew)
// overflows the PEC box's signed 12 bits and reads back shifted: put it back where it was made, or a piece dragged
// past that point jumped across the preview and couldn't be picked up where it showed
function unwrap(file, pattern, [sx, sy] = [0, 0]) {
  const lo = (p) => { let x = Infinity, y = Infinity; for (const s of p?.stitches || []) if (s[2] === STITCH) { if (s[0] < x) x = s[0]; if (s[1] < y) y = s[1]; } return [x, y]; };
  const [ax, ay] = lo(file), [bx, by] = lo(pattern), dx = Math.round(bx - ax) + sx, dy = Math.round(by - ay) + sy;
  if (isFinite(dx) && isFinite(dy) && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) for (const s of file.stitches) { s[0] += dx; s[1] += dy; }
  return file;
}
// a Design-tab layout that fits the hoop but sits past its edge on screen (pieces dragged off to one side): the
// machine centres the whole design, so it sews fine, but it looked like it would hit the hoop
function offCentre(v, fits) {
  if (state.mode !== "design" || !fits || v.split) return false;
  const h = shownHoop(), lx = (h.w / 2 - MARGIN) * 10, ly = (h.h / 2 - MARGIN) * 10;
  for (const [x, y, c] of v.shown.stitches) if (c === STITCH && (Math.abs(x) > lx || Math.abs(y) > ly)) return true;
  return false;
}
// thread names exactly as the machine will show them: the file's own PEC palette, or for a JEF the Janome threads its
// palette numbers name, worked out from the pattern the gate writes it from (formats-out.js jefThreads; validateOut
// refuses a JEF whose numbers aren't these)
export function machineThreadList(v) {
  const p = v.file;
  if (state.fileFormat === "jef") { try { return jefThreads(v.verifyAgainst || p).map(janomeName); } catch { return janomeThreads(p.threads).map(janomeName); } }
  return p.pec ? p.pec.map(pecThread) : machineThreads(p.threads);
}
// A dialog opens at its top. Taller than the window (the download dialog on a phone, two bookmarks), its button's
// autofocus scrolled it to the bottom: the title and the verdict were above the fold and it opened mid hooping note.
// Then focus goes to its title instead, and Tab goes on from there.
export function modal(d) {
  d.showModal();
  if (d.scrollTop > 0) { d.scrollTop = 0; const h = d.querySelector("h2"); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }
}
// an error in plain words, with a one-tap fix when there is one ({ label, run })
// (`fix`: one { label, run } or a list of them, joined by "or")
export function showError(msg, fix) {
  const e = $("error"), was = e.hidden; e.textContent = msg; e.hidden = !msg;
  if (msg) [].concat(fix || []).forEach((f, i) => { const b = document.createElement("button"); b.type = "button"; b.className = "link"; b.textContent = f.label; b.onclick = f.run; e.append(i ? ", or " : " ", b); });
  if (msg || !was) paintSoon();   // (the preview keeps clear of the message)
}
// A moment's note at the bottom ("Removed Monogram aMs. Undo", "Couldn't open the share sheet"), on every tab. A note
// that only says something goes by itself after time to read it (2.5 s and 0.3 s a word, 3-8 s), held while the
// pointer or focus is on it. A note with a one-tap action stays until it's used, dismissed (its ×, Escape), the design
// changes (`hideToast`) or the tab does: on a timer it went before people got to it (10-12 s: a newcomer reading 35
// words, a keyboard user 14 Tabs away with focus already on its button, a first click on nothing). A failed share said
// in the preview's message box stayed there for minutes: what went wrong with a tap is a toast; the box is for what's
// wrong with the design until it changes.
const toastBox = Object.assign(document.createElement("div"), { id: "st-toast", className: "toast", hidden: true });
toastBox.setAttribute("role", "status"); document.body.append(toastBox);
let toastTimer = 0, toastAt = 0, toastAct = false, toastLeft = 0, toastFrom = null;
const toastMs = (msg) => Math.min(8000, Math.max(3000, 2500 + 300 * msg.split(/\s+/).length));
// Going, it fades and keeps catching taps for a moment before it's hidden: a late tap on Undo just after it went
// landed on "+ Appliqué letters" under it, and so did a second tap on Undo. Focus in it goes back where it came from
// (hidden with focus on its button, focus fell to the page and the next Tab started from the top).
function toastGone() {
  if (toastBox.hidden || toastBox.classList.contains("gone")) return;
  const had = toastBox.contains(document.activeElement);
  toastBox.classList.add("gone"); clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastBox.hidden = true; toastBox.classList.remove("gone"); }, 700);
  if (had) (toastFrom && live(toastFrom) && !toastFrom.disabled ? toastFrom : $("view")).focus({ preventScroll: true });
}
// (`action`: { label, run }, or a list of them)
export function toast(msg, action) {
  const acts = [].concat(action || []);
  toastBox.innerHTML = `<span>${isolate(escapeHtml(msg))}</span>${acts.map((a) => `<button type="button" class="link">${escapeHtml(a.label)}</button>`).join("")}${acts.length ? `<button type="button" class="toast-x" aria-label="Dismiss this note" title="Dismiss">×</button>` : ""}`;
  const bs = toastBox.querySelectorAll("button");
  acts.forEach((a, i) => { bs[i].onclick = () => { if (toastBox.classList.contains("gone")) return; toastGone(); a.run(); }; });
  if (acts.length) bs[acts.length].onclick = () => toastGone();
  toastAct = acts.length > 0; toastBox.classList.remove("gone"); toastBox.hidden = false; toastAt = Date.now(); clearTimeout(toastTimer);
  toastLeft = toastAct ? 0 : toastMs(msg); if (toastLeft) toastTimer = setTimeout(toastGone, toastLeft);
  toastPlace();
}
// A note never covers the control focus is on: it goes to the top of the screen instead (round 13: notes that stay
// until dismissed sat over Share, which raised one, and over a phone's Turn hoop, so a keyboard user's focus was hidden).
function toastPlace() {
  if (toastBox.hidden) return;
  toastBox.classList.remove("top");
  // (nor Download and Send, whatever has focus: "Replaced your design…" sat over both for 15 s on a phone and a
  // laptop, and a tester waited for it to go before she could get her file)
  const a = document.activeElement, t = toastBox.getBoundingClientRect();
  const under = (el) => { const r = el?.getBoundingClientRect(); return !!r && r.width > 0 && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top; };
  if ((a && a !== document.body && !toastBox.contains(a) && under(a)) || under($("download")) || under($("share"))) toastBox.classList.add("top");
}
// (held while it's being read or reached for, then given a moment more)
const toastHold = (on) => {
  if (!toastLeft || toastBox.hidden || toastBox.classList.contains("gone")) return;
  clearTimeout(toastTimer); if (!on && !toastBox.matches(":hover, :focus-within")) toastTimer = setTimeout(toastGone, Math.max(2000, toastLeft - (Date.now() - toastAt)));
};
toastBox.addEventListener("pointerenter", () => toastHold(true)); toastBox.addEventListener("pointerleave", () => toastHold(false));
toastBox.addEventListener("focusin", () => toastHold(true)); toastBox.addEventListener("focusout", () => setTimeout(() => toastHold(false)));
// (where focus was before it came into the note, to go back to)
document.addEventListener("focusin", (e) => { if (e.target instanceof Element && !toastBox.contains(e.target)) { toastFrom = e.target; toastPlace(); } });
toastBox.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); toastGone(); } });
// a note with an action ("Removed … Undo") goes with the next change, once it's been up a moment
// (`now`: whatever its age, as Undo takes the design back past what the note was about)
function hideToast(now = false) { if ((now || Date.now() - toastAt > 400) && toastAct) toastGone(); }
export function busy(on, text = "Stitching…") { $("busy").hidden = !on; $("busy-text").textContent = text; }

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
// A piece drag holds the view's fit and centre (`state.hold`) until it's let go, then the view refits. A tap on empty
// preview (not a pan) unselects the piece (there was no way to, so copying the whole design was out of reach).
let dragging = false, tap = null;
// (past this zoom a drag slides the view unless it starts on the selected piece: ui.js `start`)
const ZOOMED = 1.2;
// a slide never takes the design off the preview: the fitted view's middle stays inside it (it was left blank)
const held = ([x, y]) => { const lx = (canvas.clientWidth / 2) * Math.max(1, state.zoom), ly = (canvas.clientHeight / 2) * Math.max(1, state.zoom); return [Math.max(-lx, Math.min(lx, x)), Math.max(-ly, Math.min(ly, y))]; };
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  tap = null;
  if (state.mode === "design" && !pointers.size) {
    const mm = toMm(e); dragging = !!(mm && studio.start(mm, state.zoom > ZOOMED));
    if (dragging) state.hold = state.tf?.base; else tap = [e.clientX, e.clientY, mm];
  }
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
});
canvas.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  if (tap && Math.hypot(e.clientX - tap[0], e.clientY - tap[1]) > 6) tap = null;
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
  } else state.pan = held([state.pan[0] + e.clientX - prev[0], state.pan[1] + e.clientY - prev[1]]);
  pointers.set(e.pointerId, [e.clientX, e.clientY]); paintSoon();
});
export const up = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size) { tap = null; return; }
  if (dragging) { dragging = false; state.hold = null; studio.end(); paintSoon(); }
  else if (tap && e.type === "pointerup" && state.mode === "design") studio.pick(tap[2]);
  tap = null;
};
canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
canvas.addEventListener("dblclick", () => $("zoom-fit").click());

// sew-out playback
let playing = 0;
function stopPlay() { if (playing) cancelAnimationFrame(playing); playing = 0; $("play").textContent = "▶︎ Watch it sew"; }
$("play").onclick = () => {
  if (!state.view) return;
  showStep(null);
  if (playing) { stopPlay(); return; }
  // (phones: the hoop was mostly scrolled off while it played; scrolled to the middle, Pause went under the Download bar)
  const r = canvas.getBoundingClientRect(), sew = $("play").parentElement.getBoundingClientRect();
  const room = innerHeight - (matchMedia("(max-width: 600px)").matches ? 88 : 0), lo = sew.bottom - room + 8, hi = r.top - 8;
  const dy = lo > hi ? lo : lo > 0 ? lo : hi < 0 ? hi : 0;
  if (dy) scrollBy({ top: dy, behavior: "smooth" });
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
// the background the design is shown on (View > Background), the same on every tab; white unless picked
state.bg = CLOTHS[store.get("bg", "white")] ? store.get("bg", "white") : "white";
$("show-bg").innerHTML = Object.entries(CLOTHS).map(([k, c]) => `<option value="${k}" ${k === state.bg ? "selected" : ""}>${c.label}</option>`).join("");
$("show-bg").onchange = (e) => { state.bg = e.target.value; store.set("bg", state.bg); paint(); };
$("facts").addEventListener("click", (e) => { if (e.target.id === "recentre") studio.recentre(); const t = e.target.closest("[data-tip]"); if (t) factTip(t); });
$("facts").addEventListener("keydown", (e) => { const t = e.target.closest("[data-tip]"); if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); factTip(t); } });
// a chip's explanation under the chips, tapped open and shut (touch screens have no tooltips: "1 pause" went unexplained)
const tip = (t) => ` data-tip="${t}" title="${t}" tabindex="0" role="button"`;
function factTip(el) {
  let p = $("fact-tip");
  if (p?.dataset.for === el.textContent) { p.remove(); return; }
  if (!p) { p = document.createElement("p"); p.id = "fact-tip"; p.className = "fact-tip"; p.setAttribute("role", "status"); $("facts").after(p); }
  p.dataset.for = el.textContent; p.textContent = el.dataset.tip; p.style.top = `${$("facts").offsetTop + $("facts").offsetHeight + 6}px`;
}
// (it closes when focus or a tap goes elsewhere: left open, it covered the zoom buttons tabbed to next)
const shutTip = (e) => { if (!e.target.closest?.("#facts, #fact-tip")) $("fact-tip")?.remove(); };
document.addEventListener("focusin", shutTip);
$("show-real").onchange = (e) => { state.real = e.target.checked; store.set("real", state.real); if (state.real && state.zoom < 3) { state.zoom = 3; } paint(); };
$("show-hoop").checked = state.showHoop;
$("show-hoop").onchange = (e) => { state.showHoop = e.target.checked; store.set("showHoop", state.showHoop); paint(); };
// the View menu stays open while its ticks and Background change the view (it sits beside the preview, which shows
// each change; shutting on every tick made trying Hoop, Thickness and Realistic thread one menu trip each), and closes
// on a click anywhere else, when focus leaves it and on Escape, focus going back to View. "On my item" closes it
// (capture, so it closes before its dialog opens and the dialog hands focus back to View, not to a button in a shut
// menu).
const views = document.querySelector(".views"), viewsBtn = views.querySelector("summary");
const shutViews = (focus) => { if (!views.open) return; views.open = false; if (focus) viewsBtn.focus(); };
views.addEventListener("focusout", (e) => { if (e.relatedTarget && !views.contains(e.relatedTarget)) shutViews(false); });
views.querySelector(".views-menu").addEventListener("click", (e) => { if (e.target.closest("button")) shutViews(true); }, true);
views.addEventListener("keydown", (e) => { if (e.key === "Escape" && views.open) { e.preventDefault(); shutViews(true); } });
// One rule for every popup (the View menu, a chip's tip): a tap outside one only closes it. Closing the View menu by
// tapping the preview also picked the piece under the finger (newcomer, round 13); the press, the mouse press and the
// click it makes are all swallowed, so nothing under the finger is pressed, focused or dragged.
let swallow = 0;
document.addEventListener("pointerdown", (e) => {
  swallow = 0;
  // (each open popup, and whether the press is inside it: a chip's tip counts the chips, so another chip swaps it)
  const open = [];
  if (views.open) open.push(views.contains(e.target));
  if ($("fact-tip")) open.push(!!e.target.closest?.("#facts, #fact-tip"));
  if (!open.length || open.includes(true)) return;
  shutViews(false); $("fact-tip")?.remove();
  e.preventDefault(); e.stopPropagation(); swallow = e.timeStamp;
}, true);
for (const t of ["mousedown", "mouseup", "click", "pointerup", "touchend"]) document.addEventListener(t, (e) => {
  if (swallow && e.timeStamp - swallow < 1000) { e.preventDefault(); e.stopPropagation(); if (t === "click") swallow = 0; }
}, true);
$("turn").onclick = () => {
  if (square()) return;
  if (state.mode === "design") studio.remember();   // (a turn is undone like any other change)
  state.turn[state.mode] = !turned(); store.set("turn", state.turn);
  state.zoom = 1; state.pan = [0, 0];
  if (state.mode === "picture") makePicture(); else if (state.mode === "design") studio.make(); else setView(state.view);
};

// (every file leaves through gate.js `handOut`: checked first, nothing handed over when one is refused)
// iPhone/iPad/Android share sheet: Messages, Mail, AirDrop, Save to Files
function canShareFile() {
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], "x.pes", { type: "application/octet-stream" })] })); }
  catch { return false; }
}
$("share").hidden = !canShareFile();
// what goes with a shared file: what to have ready and the steps, short and plain (it said only "Embroidery file for a
// Brother PE900. Copy it to a USB stick"), cut at a line past ~1800 characters so a text message can carry it
function shareText(v) {
  const blocks = v.cache?.blocks || [], mt = machineThreadList(v), sheet = told(v.sheet, blocks, mt, v.filename), steps = sheet.steps;
  // (copy it to a USB stick: how it's picked on the machine is step 1, as everywhere)
  const f = fileFormat(), note = formatNote(), lines = [`Embroidery file${state.fileFormat === "pes" ? "" : ` (${f.short})`} for a ${hoop().machineName} (${hoopLabel(hoop())}). Copy it to a USB stick.${note ? " " + note : ""}`];
  if (turnedFile()) lines.push("", $("done-turn").textContent);
  // (what's still wrong, and worth knowing, as every other surface says it: before the steps, so a long list of steps
  // can't cut it off)
  const probs = shownOn(problemsOf(v), "share");
  for (const [level, head] of [[LOOK, LOOK_HEAD], [TIP, TIP_HEAD]]) { const l = probs.filter((q) => q.level === level); if (l.length) lines.push("", head + ":", ...l.map((q) => `- ${q.text}`)); }
  if (sheet.ready?.length) lines.push("", "Have ready:", ...sheet.ready.map((r) => `- ${r}`));
  const thread = (i) => { const b = blocks.find((x) => x.index === i); return b ? threadLabel(b.color, mt[i].name).name : `${mt[i].maker || "Brother"} ${mt[i].name}`; };
  lines.push("", "Steps:", ...steps.map((st, i) => `${i + 1}. ${mt[i] ? `${thread(i)}: ` : ""}${st.you || "Press Start."}`));
  if (sheet.after?.length) lines.push("", "When it's done: " + sheet.after.join(" "));
  const out = [];
  for (const l of lines) {
    if (out.join("\n").length + l.length > 1800) { out.push("", "(The rest is on the sew sheet: Print a sew sheet in Needleworks.)"); break; }
    out.push(l);
  }
  return out.join("\n");
}
$("share").onclick = async () => {
  const v = state.view; if (!v) return;
  const r = handOut([{ name: v.filename, bytes: v.bytes, against: v.verifyAgainst }], { hoop: hoop(), format: state.fileFormat, share: { title: outName(v.filename), text: shareText(v) } });
  if (!r.ok) { toast("Sending stopped: " + r.error); return; }
  try {
    await r.shared;
    if (v === state.views.design) studio.downloaded();
  } catch (err) {
    if (err && err.name !== "AbortError") toast("Couldn't open the share sheet. Use Download instead.");
  }
};

// Ctrl+S (⌘S) goes to Download from anywhere on the page: from the Words box it was 48-67 Tabs away. It takes focus
// there and Enter saves, so the button says what it will save, or why it can't, before anything is downloaded.
addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "s") return;
  e.preventDefault();
  if (document.querySelector("dialog[open]")) return;
  const b = $("download");
  if (b.disabled) { toast(`${/^Download [A-Z0-9]+$/.test(b.textContent.trim()) ? "Nothing to download yet" : b.textContent.trim()}${$("error").textContent ? ": the note over the preview says why." : "."}`); return; }
  b.focus(); b.scrollIntoView({ block: "nearest" });
});
$("download").onclick = () => {
  const v = state.view; if (!v) return;
  // never hand out a file we haven't proven decodes to exactly this design and the machine can take
  // (judged on the bytes saved, every time: a verdict made earlier from the design described something else, and an
  // opened file's PEC header listing 2 threads for 1 block was saved "Checked")
  // (a design in two hoopings: one file per hooping, in a .zip, each proven like any other download)
  const files = v.split ? v.split.map((p) => ({ name: p.filename, bytes: writePES(p.pattern), against: p.pattern })) : [{ name: v.filename, bytes: v.bytes, against: v.verifyAgainst }];
  const r = handOut(files, { hoop: hoop(), zip: v.split ? v.filename : "", format: state.fileFormat });
  // (a file the machine can't take isn't saved: the dialog says why and offers a fixed copy when one helps)
  if (!r.ok && !r.files.some((f) => f.hard.length)) { showError("Download stopped: " + r.error); return; }
  if (r.ok && v === state.views.design) studio.downloaded();
  downloaded(v, !!v.split, r.files, r.ok);
};
// A copy of a file that fails the quality check, fixed by the design doctor (thin to 24 hits/mm², drop tiny and
// same-hole stitches, even out sparse satins; long stitches are always split), judged again, or null when that doesn't
// make it pass. Each try adds what the last still failed (splitting long15.pes's stitches showed a same-hole stitch of
// its own), the last every fix. Same blocks and pauses, so "How to stitch it" still holds.
function fixedCopy(bytes, problems) {
  const k = new Set(problems.map((p) => p.key));
  try {
    for (let pass = 0; pass < 3; pass++) {
      const opts = pass === 2 ? { thin: true, tiny: true, satin: true } : { thin: k.has("dense"), tiny: k.has("tiny") || k.has("same"), satin: k.has("sparse") };
      // (more thread changes than the machine handles: each thread's parts sewn together, if that's enough)
      let src = readEmbroidery(bytes, "x.pes");
      if (k.has("blocks") && !(src = fewerBlocks(src))) return null;
      const p = fix(src, opts), out = writePES(p), left = verdictOf(out);
      if (validatePES(out, p, hoop()).ok && !left.length) return { bytes: out, against: p };
      for (const q of left) k.add(q.key);
    }
  } catch {}
  return null;
}
// (never "_fixed_fixed": "_fixed" once, at the end, whatever the name had: peace_fixed_80pct.pes -> peace_80pct_fixed.pes)
export const fixedName = (name) => name.replace(/_fixed(?=[_.])/g, "").replace(/(\.\w+)$/, "_fixed$1");
// files [{ name, bytes, problems }] that fail, with their fixed copies: the fixes and what's still wrong, in words
function badFiles(files) {
  // (judged as another format, a file's PES is `pes`: the fix works on that)
  return files.filter((f) => f.problems.length).map((f) => ({ ...f, fixed: fixedCopy(f.pes || f.bytes, f.problems) }));
}
// the fixed copies saved: one file, or the whole zip again with the bad files swapped
function saveFixed(files, bad, zipName) {
  if (!zipName) return handOut([{ name: fixedName(bad[0].name), ...bad[0].fixed }], { hoop: hoop(), format: state.fileFormat });
  const swap = new Map(bad.filter((b) => b.fixed).map((b) => [b.name, b.fixed]));
  return handOut(files.map((f) => ({ name: f.name, ...(swap.get(f.name) || { bytes: f.pes || f.bytes, against: f.against }) })), { hoop: hoop(), zip: fixedName(zipName), format: state.fileFormat });
}
// what's wrong with saved files, in plain words, and a button for the fixed copies when every one could be fixed
export function badReport(el, files, zipName) {
  const bad = badFiles(files);
  el.hidden = !bad.length; el.innerHTML = "";
  if (!bad.length) return bad;
  // (in words.js's list, as everywhere else: one item per problem, its id on it)
  const many = files.length > 1, holder = document.createElement("div");
  holder.innerHTML = problemsHtml(bad.flatMap((b) => (many ? [{ id: "file:" + b.name, level: LOOK, text: b.name + ": " + b.problems.map((x) => x.text).join(" ") }]
    : b.problems.map((q) => ({ id: "file:" + q.key, level: LOOK, text: q.text })))));
  const ul = holder.firstElementChild; ul.style.margin = "4px 0"; ul.style.paddingLeft = "20px";
  // (what the fix does, from what's wrong)
  const keys = new Set(bad.flatMap((b) => b.problems.map((q) => q.key))), does = [keys.has("dense") && "thins the crowded spots",
    keys.has("long") && "splits the long stitches", (keys.has("tiny") || keys.has("same")) && "drops the tiny stitches", keys.has("sparse") && "evens out the satin stitches",
    keys.has("colours") && "lists one thread per colour", keys.has("block") && "makes what PE-DESIGN shows match what the machine sews", keys.has("applique") && "uses threads where it had appliqué codes"].filter(Boolean);
  const fixable = bad.every((b) => b.fixed), p = document.createElement("p");
  p.textContent = fixable ? `A fixed copy ${does.join(", ").replace(/, ([^,]*)$/, " and $1")}, without changing the design. Use ${many ? "the fixed files" : "it"} instead.`
    : keys.has("blocks") ? `It has too many thread changes for the machine, and sewing each thread's parts together doesn't bring it under. ${state.mode === "open" ? "Ask where it came from for a version with fewer colours." : "Use fewer thread colours, or a design file with fewer of them."}`
    : state.mode === "open" ? "This couldn't be fixed here without changing the design. Try another size under Checkup, or ask where it came from for a better file."
    : `This couldn't be fixed here without changing the design. Open the saved file in “Open a design” to see where (Thickness under the preview)${keys.has("dense") && !keys.has("long") ? ", or make the design a little bigger" : ""}.`;
  el.append(ul, p);
  if (fixable) {
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "primary";
    btn.textContent = zipName ? `Save fixed copies (${fixedName(zipName)})` : `Save a fixed copy (${fixedName(bad[0].name)})`;
    btn.onclick = () => {
      const r = saveFixed(files, bad, zipName); btn.disabled = true; btn.textContent = r.ok ? "Saved to your downloads" : "Couldn't save it: " + r.error;
      // (the original was saved too, unless the gate refused it: say which of the two to sew)
      const name = zipName ? fixedName(zipName) : fixedName(bad[0].name);
      if (r.ok) { savedNames().add(name); ownNote(name); }
    };
    el.append(btn);
  }
  return bad;
}
// Files saved on this tab that belong together: a file and its fixed copy, whichever was saved first. Then which one
// to sew is said (`done-own`). It said "each file you've saved is a design of its own: sew them in any order" after
// any two saves, so separate projects in one visit read as parts of one, and a failing file and its fixed copy as two
// designs to sew. (Two hoopings say their order in the steps; names come as one .zip of their own.)
const savedNames = () => ((downloaded.names ||= {})[state.mode] ||= new Set());
function ownNote(name) {
  const plain = name && name.replace(/_fixed(?=\.\w+$)/, ""), fixed = name && fixedName(name);
  const both = name && savedNames().has(plain) && savedNames().has(fixed) && plain !== fixed;
  $("done-own").hidden = !both;
  if (both) $("done-own").textContent = `Sew ${fixed} at the machine, not ${plain}: that one is the file as it came, with the problems the check found.`;
}
// what was checked and the next steps at the machine, until "Don't show this again" (a file that fails the quality
// check always says so)
// (`saved` false: refused at the gate for a rule the machine needs, nothing saved)
function downloaded(v, zipped, files = [], saved = true) {
  const box = $("done-bad") || Object.assign(document.createElement("div"), { id: "done-bad", className: "done-bad" });
  if (!box.isConnected) $("done-checked").after(box);
  const bad = badReport(box, files, zipped ? v.filename : null);
  // (the dialog put away with "Don't show this again": still said what was saved, as every way out does)
  if (store.get("doneSeen", false) && !bad.length) { if (saved) toast(`Saved ${zipped ? v.filename : files[0]?.name || v.filename} to your downloads.`); return; }
  // (the size as the preview shows it: a turned bookmark is 169 × 54, not 54 × 169)
  const h = hoop(), s = v.shown && designStats(v.shown);
  // (a design in two hoopings: each hooping's size, not the whole design's 136 × 170 that the hoop can't take)
  const parts = v.split?.map((p) => designStats(turned() ? turnPattern(p.pattern, false) : p.pattern));
  // (the chips' words for it: the dialog said sizes to the tenth, "169.3 × 54 mm", beside the chips' whole "169 × 54")
  const lim = [shownHoop().w - 2 * MARGIN, shownHoop().h - 2 * MARGIN];
  const size = parts ? `in ${parts.length} hoopings, ${parts.map((q) => mmText([q.widthMm, q.heightMm], lim)).join(" and ")}, each fitting the hoop` : s ? v.fact?.size || mmText([s.widthMm, s.heightMm], lim) : "";
  const [ch, same] = (v.split ? v.split.map((q) => stopCounts(q.pattern)) : [stopCounts(v.file)]).reduce((a, b) => [a[0] + b[0], a[1] + b[1]]);
  const what = `on a ${h.machineName} in the ${h.name}${s ? `, ${size}, ${ch + same ? `${stopWords(ch, same)}${parts ? " in all" : ""}` : parts ? "no thread changes in either" : "no thread changes"}` : ""}`;
  // ("Checked" only when the stitches pass too: it said so for files tests/pe900_check.py fails; and not for a file cut
  // short, which holds only part of the design)
  const part = state.mode === "open" && state.opened?.short;
  // (a rule the machine itself needs, broken: never "It opens on a Brother PE900")
  const hardBad = bad.some((b) => b.problems.some((q) => HARD.has(q.key)));
  $("done-title").textContent = saved ? "Saved to your downloads" : "Not saved";
  // (nothing to copy to a USB stick: only what's wrong and the fixed copy)
  document.querySelector("#done .done-steps").hidden = !saved;
  $("done-checked").textContent = hardBad ? `${saved ? "It may not open or sew right" : "It wouldn't open or sew right"} ${what}: ${bad.length > 1 ? `${bad.length} of the files break` : zipped ? "one of the files breaks" : "it breaks"} a rule the machine needs.`
    : bad.length ? `It opens ${what}, but ${bad.length > 1 ? `${bad.length} of the files` : zipped ? "one of the files" : "it"} may not sew well:`
    : part ? `It opens ${what}, but only part of the design is in it: the file it came from ends early. Download that file again if you can.` : proven() ? `Checked: it opens ${what}.` : `Checked: it fits ${what}.`;
  $("done-checked").className = bad.length || part ? "warn" : "good";
  $("done-zip").hidden = !zipped;
  // (as many files as were handed out: "Copy the file to a USB stick" for a ZIP of two hoopings)
  // (in the format chosen: "Copy the 2 .dst files")
  const ext = "." + fileFormat().ext, pes = files.filter((f) => f.name.toLowerCase().endsWith(ext)).length, many = pes > 1;
  $("done-copy").textContent = many ? `Copy the ${pes} ${ext} files to a USB stick.` : "Copy the file to a USB stick.";
  $("done-zip").textContent = `It's a .zip: open it first (double-click it) and copy the ${ext} files inside, not the .zip. The machine can't read a .zip.`;
  // (another machine's file: only its PES twin was checked, and what that means at the machine)
  $("done-format").textContent = formatNote(); $("done-format").hidden = !$("done-format").textContent;
  if (saved) savedNames().add(v.filename);
  ownNote(saved && v.filename);
  $("done-phone").hidden = !matchMedia("(pointer: coarse)").matches;
  // (an Android phone has no Lightning port, nor an iPhone a "Files by Google")
  $("done-phone").textContent = /Android/i.test(navigator.userAgent)
    ? ` On a phone: plug a USB-C stick (or an adapter for a USB stick) into it, then in the Files app move the ${many ? "files" : "file"} from Downloads to the stick. Or email the ${many ? ".zip" : "file"} to yourself and copy ${many ? "them" : "it"} on a computer.`
    : ` On a phone: plug a USB-C (or Lightning) stick into it, then in the Files app move the ${many ? "files" : "file"} from Downloads to the stick. Or email the ${many ? ".zip" : "file"} to yourself and copy ${many ? "them" : "it"} on a computer.`;
  $("done-turn").hidden = !turnedFile();
  // (Design-tab warnings still showing: "Checked" shouldn't read as "all good")
  // (what's said beside Download covers every piece, the editor's note only the one selected: a fleece name that closes
  // up downloaded under a green "Checked" with the editor scrolled away)
  // (the view's problems, as said beside Download (words.js); the file's own verdict is the list above, and a file cut
  // short is said in the line above)
  const warns = shownOn(problemsOf(v), "done").filter((q) => !q.file && !(part && q.id === "short"));
  $("done-warn").hidden = !warns.length; $("done-warn").innerHTML = warns.length ? `${LOOK_HEAD}: ${problemsInline(warns)}` : "";
  if (warns.length && !bad.length && !part) { $("done-checked").textContent = `The file is checked: it opens ${what}.`; $("done-checked").className = ""; }
  // (only the Design tab has “How to stitch it”)
  // (and a design with no pauses has none to follow)
  // (two hoopings: which file first, and the rehooping between them; it said "Pick the design and press Start")
  // (stops named as they are: "at each pause, thread the next colour" on a picture with thread changes only)
  // (“How to stitch it” is a link to the steps: at 1413 x 717 they were ~850 px down, under the whole editor)
  const at = stopsAt(ch, same), how = `<button type="button" class="link" data-steps-link>How to stitch it</button>`;
  $("done-sew").innerHTML = parts ? `Sew ${escapeHtml(v.split[0].filename)} first${ch + same ? `, following ${how} ${at}` : ""}. Then hoop the fabric again as ${how} says (it lines up on the two crosses) and sew ${escapeHtml(v.split[1].filename)}.`
    : !(ch + same) ? "Pick the design and press Start."
    : state.mode === "design" ? `Pick the design, then follow ${how} (or Sew along) ${at}.`
    : escapeHtml(`Pick the design and press Start. ${ch ? `At each thread change, put on the next thread listed with the preview${same ? "; at a pause, keep the same thread on" : ""}` : "At each pause, keep the same thread on"} (Sew along shows each step).`);
  // (fabric shapes to cut: the Cutter file is said here too, not only under Download)
  $("done-cut").hidden = !saved || !v.sheet?.cut?.length;
  modal($("done"));
}
$("done-turn").insertAdjacentHTML("afterbegin", TURN_PIC);

// ---------- the file's format ----------
// The machine chosen sets it (`machineFormat`: the first file its manual lists that this site writes); "File for"
// under Download changes it, and that stays (store `fileFormat`) until another machine is picked. PES is the file the
// checks were made on (pe900_check, the VM): another format is written from the same pattern and read back
// (formats-out.js; docs/formats-out-spec.md), its stitches judged as that PES with the chosen machine's field.
const listed = (a) => a.map((x) => x.toUpperCase()).join(a.length > 2 ? ", " : " and ").replace(/, ([^,]*)$/, " and $1");
// (a machine sewing Brother's own file, PES: the one the machine checks were proven on)
const proven = () => state.fileFormat === "pes" && MACHINES[state.machine].reads[0] === "pes";
export function formatNote() {
  const m = MACHINES[state.machine], f = fileFormat(), h = hoop(), other = m.brand === "Other";
  if (proven()) return "";
  // (a file the machine's manual doesn't list)
  // (only what its manual lists, as read for machines.js: a PE900's manual may list more than was cited)
  if (!m.reads.includes(state.fileFormat)) return `${other ? "Most machines read DST" : `Only ${listed(m.reads.filter((x) => OUT_FORMATS[x]))} files are checked for the ${h.machineName} here, the ones its manual lists`}: check your machine reads ${f.short} files before you use this one. It has the same stitches, untested on it so far.`;
  // (a JEF holds a Janome thread number per colour, not a colour: the nearest of the Janome threads whose numbers are
  // known here, docs/formats-out-spec.md 7.1, and the thread list names the same ones)
  const colours = state.fileFormat === "jef" ? ", and a JEF names Janome threads, not colours: the nearest of the 51 Janome threads whose numbers are known, the same ones the thread list names"
    : OUT_FORMATS[state.fileFormat] && !["pes", "vp3"].includes(state.fileFormat) ? `, and ${f.short} files hold no thread colours: follow the thread list` : "";
  return `The stitches, size and thread changes are checked here; the file itself is untested on ${other ? "your machine" : `${m.brand} machines`} so far${colours}.`;
}
// What the machine does with a short move between two parts, as its maker says (machines.js `cuts`)
function snipsTip() {
  const c = hoop().cuts, head = "Short threads between two parts, locked at both ends: snip them after stitching.";
  if (typeof c === "number" && hoop().reads[0] === "pes") return `${head} (The machine only cuts moves longer than its “jump stitch not to trim” setting, ${c} mm at the lowest.)`;
  return typeof c === "number" ? `${head} (Counted as a Brother machine leaves them, 5 mm or less. Yours cuts moves of ${c} mm or more when its jump thread cutting is on: snip any that are left.)`
    : `${head} (A Brother machine leaves moves of 5 mm or less uncut. ${c === "file" ? "Yours cuts where the file says" : c === "length" ? "Yours cuts moves longer than the length set on it" : "Your machine's maker doesn't say what it cuts"}: snip any that are left.)`;
}
function formatUI() {
  $("file-for").value = state.fileFormat;
  const note = formatNote();
  $("file-for-note").hidden = !note; $("file-for-note").textContent = note;
  const b = $("download");
  if (/\.(pes|dst|exp|jef|vp3)$/i.test(b.textContent) || /^Download [A-Z0-9]+$/.test(b.textContent)) b.textContent = b.title = b.textContent.replace(/\.(pes|dst|exp|jef|vp3)$/i, "." + state.fileFormat).replace(/^Download [A-Z0-9]+$/, `Download ${fileFormat().short}`);
}
function setFormat(f) { state.fileFormat = OUT_FORMATS[f] ? f : "pes"; store.set("fileFormat", state.fileFormat); formatUI(); }
$("file-for").innerHTML = Object.entries(OUT_FORMATS).map(([k, f]) => `<option value="${k}">${f.label}</option>`).join("");
$("file-for").onchange = (e) => {
  const was = maker();
  setFormat(e.target.value);
  // (from or to a JEF the threads are another maker's: every label, step and the picture's palette say the new ones)
  if (maker() !== was) { relabel(); if (state.mode === "picture") makePicture(); }
  const m = MACHINES[state.machine], own = machineFormat();
  toast(state.fileFormat === own ? `Downloads are ${fileFormat().short} files, as the ${hoop().machineName} reads.`
    : m.reads.includes(state.fileFormat) ? `Downloads are ${fileFormat().short} files now. The ${hoop().machineName} reads them too.`
    : `Downloads are ${fileFormat().short} files now, for ${fileFormat().machines} machines. ${m.brand === "Other" ? "" : `The ${hoop().machineName}'s manual doesn't list them.`}`.trim());
};
formatUI();   // (the note's text stays its textContent)
// the dialog's “How to stitch it”: closed, the steps opened and shown, focus on their heading
$("done").addEventListener("click", (e) => {
  if (!e.target.closest("[data-steps-link]")) return;
  $("done").close();
  const d = $("st-steps").closest("details"); d.open = true;
  const s = d.querySelector("summary"); s.scrollIntoView({ block: "start", behavior: "smooth" }); s.focus({ preventScroll: true });
});
$("done-close").onclick = () => { if ($("done-never").checked) store.set("doneSeen", true); $("done").close(); };

// sew sheet: the design at 1:1 on the hoop field, the steps, appliqué shapes; printed from a hidden block
function fillSheet() {
  const v = state.view; if (!v?.file || v.split) return false;
  $("sheet").innerHTML = sewSheet({ pattern: v.file, filename: v.filename, hoop: hoop(), facts: v.facts, threads: machineThreadList(v), hide: v.hide, sheet: v.sheet, label: threadLabel, problems: shownOn(problemsOf(v), "sheet") });
  return true;
}
$("sheet-print").onclick = () => { if (fillSheet()) window.print(); };
addEventListener("beforeprint", () => { if (!$("sheet").innerHTML) fillSheet(); });
addEventListener("afterprint", () => { $("sheet").innerHTML = ""; });
// The fabric shapes for a cutting machine (Ashley: "my Cricut Maker 3 and or my Silhouette Cameo"): SVG for Cricut
// Design Space (and CanvasWorkspace, Silhouette's paid editions), DXF for Silhouette's free edition. The size is in the
// name (sheet.js cutName). The shapes are as the design reads (`upright`), not as the machine sews it in a turned hoop:
// a turned MOM came out with its letters sideways (round 10).
const NOT_SEWN = "It's for the cutting machine only: the embroidery machine can't read it, so only the .pes goes on the USB stick.";
const cutFiles = (v, ext) => {
  const shapes = v?.sheet?.upright || v?.sheet?.cut;
  if (!shapes?.length) return [];
  const name = v.filename.replace(/\.pes$/i, "");
  return [{ name: cutName(name, shapes, ext), bytes: (ext === "dxf" ? cutDXF : cutSVG)(shapes, name) }];
};
const cutFile = (ext) => () => {
  const files = cutFiles(state.view, ext); if (!files.length) return;
  const r = handOut(files);
  if (!r.ok) { showError("Cut file stopped: " + r.error); return; }
  // (said, as Download says what it saved: the cutter files saved with nothing said, round 13)
  const f = r.files[0].name, mm = f.match(/_(\d+)x(\d+)mm\.\w+$/);
  // (and where it doesn't go: nothing said the SVG or DXF isn't for the embroidery machine, and a tester copied it
  // to the USB stick with the .pes)
  toast((ext === "dxf" ? `Saved ${f} to your downloads, for Silhouette Studio (File > Open). The shapes are ${mm ? `${mm[1]} × ${mm[2]} mm` : "the size in its name"}: check they open at that size.`
    : `Saved ${f} to your downloads, for Cricut Design Space (Upload). It opens at actual size.`) + ` ${NOT_SEWN}`);
};
$("another-open").onclick = () => studio.twoUp();
$("cut-file").onclick = cutFile("svg");
$("cut-dxf").onclick = cutFile("dxf");

// ---------- machine & hoop ----------
// One choice, by maker then model (machines.js): the select groups the models under their makers (typing a model's
// first letters finds it, on a phone it's the system's list), and its last item opens a search by any part of the
// name ("500E", "viking") with every machine listed under its maker. Remembered (store `machine`, `hoop`).
export function fillMachines() {
  const opt = ([k, m]) => `<option value="${k}">${escapeHtml(m.brand === "Other" ? m.model : m.name)}</option>`;
  $("machine").innerHTML = MAKERS.map((b) => `<optgroup label="${b === "Other" ? "Any other" : b}">${Object.entries(MACHINES).filter(([, m]) => m.brand === b).map(opt).join("")}</optgroup>`).join("")
    + `<option value="@find">Find my machine…</option>`;
  $("machine").value = state.machine;
  const m = MACHINES[state.machine];
  if (!m.hoops[state.hoopId]) state.hoopId = m.defaultHoop;
  $("hoop").innerHTML = Object.entries(m.hoops).map(([k, h]) => `<option value="${k}">${escapeHtml(hoopLabel(h))}</option>`).join("");
  $("hoop").value = state.hoopId;
  // (hoops named with their size, "RE20b (140 × 200 mm)": the MACHINE label makes way, as it does on narrower screens,
  // or the thread brand went onto a second line at 1413 px)
  $("hoop").parentElement.classList.toggle("long", Object.values(m.hoops).some((x) => hoopLabel(x).length > 14));
  const h = hoop();
  const max = Math.floor(Math.max(h.w, h.h) - 2 * MARGIN - 2);
  $("pic-size").max = max;
  if (state.pic.size > max) { state.pic.size = max; $("pic-size").value = max; if (tabs.picture) $("pic-size-out").textContent = tabs.picture.sizeLabel(max); }
}
function hoopChanged() { if (state.mode !== "picture") state.pic.req++; for (const m of ["picture", "design"]) if (m !== state.mode) state.views[m] = null; fillMachines(); refresh(); }
// (on the Design tab a hoop change is an Undo step, as a turn is: Undo puts a design back in the hoop it was in)
// (a machine with the same hoop changes nothing in the design: no Undo step for it (Undo lit up and nothing else
// showed the choice was taken), the hoop picked stays, and a quiet line says what the choice does)
// (the file follows the machine: a Janome gets its JEF, a Brother its PES)
function pickMachine(id) {
  if (!MACHINES[id]) return;
  const was = hoop(), to = MACHINES[id], keep = to.hoops[was.id], same = !!keep && keep.w === was.w && keep.h === was.h;
  if (id === state.machine) return;
  if (state.mode === "design" && !same) studio.remember();
  const fmt = state.fileFormat;
  state.machine = id; if (!keep) state.hoopId = null; store.set("machine", state.machine);
  setFormat(machineFormat());
  hoopChanged();
  const now = hoop(), files = state.fileFormat !== fmt || to.reads[0] !== "pes" ? ` Downloads are ${fileFormat().short} files.` : "";
  toast(same ? `Set for the ${now.machineName}: the same ${now.name}, so the design is as it was. Files are checked for this machine.${files}`
    : `Set for the ${now.machineName} and its ${hoopLabel(now)}. Files are checked for this machine.${files}`);
}
$("machine").onchange = (e) => {
  if (e.target.value === "@find") { e.target.value = state.machine; openMachines(); return; }
  pickMachine(e.target.value);
};
// "Find my machine…": every machine under its maker, narrowed as a name or number is typed; one tap picks it
function squash(t) { return t.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function machinesList() {
  const words = $("machines-find").value.toLowerCase().split(/[\s,]+/).map(squash).filter(Boolean);
  const hit = (m) => { const all = squash(`${m.brand} ${m.model} ${m.also || ""}`); return words.every((w) => all.includes(w)); };
  let found = 0;
  $("machines-list").innerHTML = MAKERS.map((b) => {
    const ms = Object.entries(MACHINES).filter(([, m]) => m.brand === b && (b === "Other" || hit(m)));
    if (b !== "Other") found += ms.length;
    return ms.length ? `<h3>${b === "Other" ? "Not listed?" : b}</h3><ul>${ms.map(([k, m]) => {
      const big = Object.values(m.hoops).reduce((a, h) => (h.w * h.h > a.w * a.h ? h : a));
      return `<li><button type="button" data-machine="${k}" aria-pressed="${k === state.machine}"><span>${escapeHtml(m.model)}</span><small>${listed(m.reads)} files · ${b === "Other" ? "most machines read them" : `fields up to ${big.w} × ${big.h} mm`}</small></button></li>`;
    }).join("")}</ul>` : "";
  }).join("");
  $("machines-none").hidden = !!found || !words.length;
  $("machines-none").textContent = `No machine here matches “${$("machines-find").value.trim()}”. Pick Other machine (DST): nearly every embroidery machine reads DST files.`;
}
function openMachines() { $("machines-find").value = ""; machinesList(); modal($("machines")); }
$("machines-find").oninput = machinesList;
$("machines-find").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); if ($("machines-find").value.trim()) $("machines-list").querySelector("button")?.click(); } };
$("machines-list").onclick = (e) => { const b = e.target.closest("[data-machine]"); if (!b) return; $("machines").close(); pickMachine(b.dataset.machine); };
$("hoop").onchange = (e) => { if (state.mode === "design") studio.remember(); state.hoopId = e.target.value; store.set("hoop", state.hoopId); hoopChanged(); };
function refresh() { if (state.mode === "picture") makePicture(); else if (state.mode === "design") studio.make(); else if (state.view) setView(state.view); }

// ---------- tabs ----------
const MODES = ["picture", "design", "open"];
export function setMode(mode, push = true) {
  // (#bookmark: the bookmark had a panel of its own until 2026-10-31; old links open the Bookmark starter)
  if (mode === "bookmark") { setMode("design", false); history.replaceState(null, "", "#design"); oldBookmark(); return; }
  if (!MODES.includes(mode)) mode = "design";
  state.mode = mode;
  document.body.dataset.mode = mode;
  for (const m of MODES) $("panel-" + m).hidden = m !== mode;
  // (one tab stop for the tab bar; the arrow keys move between tabs)
  for (const m of TABS) { const on = m === mode; $("tab-" + m).setAttribute("aria-selected", on); $("tab-" + m).tabIndex = on ? 0 : -1; }
  if (push) history.replaceState(null, "", "#" + mode);
  showError(""); busy(false);   // (a picture still stitching from the last tab)
  hideToast();   // (a note's action is about the tab it was said on)
  $("empty").textContent = mode === "picture" ? "Choose a picture to see it as stitches." : mode === "open" ? "Open a PES, PEC or DST file to see it here." : mode === "design" ? "Nothing to stitch yet: type some words, or pick a starting idea." : "";
  // (the file chooser in the preview too: at 960 x 540 the panel's was below the fold, under an empty hoop)
  if (mode === "open") $("empty").append(Object.assign(document.createElement("button"), { type: "button", className: "primary", textContent: "Choose a design file", onclick: () => $("open-file").click() }));
  state.zoom = 1; state.pan = [0, 0];
  // (a tab whose code isn't here yet: shown at once, filled when it is)
  if (mode !== "design" && !tabs.picture) {
    setView(null); busy(true, "Getting ready…");
    tabCode().then(() => { if (state.mode === mode) setMode(mode, false); }, () => { if (state.mode === mode) { busy(false); showError(NOT_HERE); } });
    return;
  }
  if (mode === "picture" && !state.pic.bitmap) tabs.picture.lastPicture();
  else if (mode === "picture" && !state.views.picture) makePicture();
  else if (mode === "design" && !state.views.design) studio.make();
  else setView(state.views[mode] || null);
}
const TABS = MODES;
for (const m of TABS) $("tab-" + m).onclick = () => setMode(m);
document.querySelector(".tabs").addEventListener("keydown", (e) => {
  // (in the order they're shown: MODES' order sent → from Design back to Picture)
  const tabs = [...document.querySelectorAll(".tabs [role=tab]")], i = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
  if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {
    const n = e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[tabs.length - 1] : tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    e.preventDefault(); n.click(); n.focus();
  }
});

export function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }

// ---------- an old #bookmark link ----------
// The Bookmark starter, with the name, font, colour and swashes the old bookmark panel saved (its keys are then
// dropped, so the next #bookmark link is the plain starter)
function oldBookmark() {
  const name = store.get("bm.name", null), font = store.get("bm.font", null), color = store.get("bm.color", null);
  const lead = store.get("bm.lead", true), tail = store.get("bm.tail", true);
  studio.starter("bookmark", (ps) => {
    const t = ps.find((p) => p.kind === "text"), fr = ps.find((p) => p.kind === "frame");
    if (!t) return;
    const word = tidy(name ?? "", { max: 14 }).trim();
    if (word) t.text = withSwash(withSwash(word, "lead", lead), "tail", tail);
    if (font && FONTS.some((f) => f.family === font)) t.font = font;
    if (color && /^#[0-9a-f]{6}$/i.test(color)) t.color = fr.color = OLD_THREADS[color] || color;
  });
  for (const k of ["name", "font", "color", "fabric", "lead", "tail", "blank"]) store.del("bm." + k);
}

// ---------- design your own ----------
// Design tab: show the design as it stands after one step (null = all of it)
// a saved design file into Design your own's Open saved (its own checks and what it says)
export function studioLoad(file) {
  const i = $("st-load"), dt = new DataTransfer(); dt.items.add(file); i.files = dt.files; i.dispatchEvent(new Event("change"));
}
function showStep(i) {
  if (state.step === i) return;
  state.step = i; document.dispatchEvent(new CustomEvent("nw:step", { detail: i })); paint();
}
export const studio = initStudio({
  hoop: designHoop, machineHoop: hoop, turned: designTurned, pageFaces: uiFonts, fit: () => { state.zoom = 1; state.pan = [0, 0]; }, store, showError, busy, safeName, escapeHtml, handOut, keepFocus, showStep, step: () => state.step, paint: () => state.mode === "design" && paint(), setMode, toast, hideToast, keyboard: () => keyboard, threadLine, threadHtml, ownSpool, threadList, ownedSpools, fileThreads, maker,
  // (undo, redo and Open saved put the hoop's turn back as it was; the caller rebuilds)
  setTurn: (on) => { state.turn.design = !!on; store.set("turn", state.turn); $("turn").setAttribute("aria-pressed", designTurned()); },
  hoopId: () => hoop().id,
  setHoop: (id) => { if (MACHINES[state.machine].hoops[id] && hoop().id !== id) { state.hoopId = id; store.set("hoop", id); hoopChanged(); } },
  setView(pattern, filename, look = {}) {
    if (!pattern) { state.views.design = null; if (state.mode === "design") setView(null); return; }
    pattern = toMachine(pattern);
    if (look.split) look = { ...look, split: look.split.map((p) => ({ ...p, pattern: toMachine(p.pattern) })) };
    if (designTurned() && look.sheet?.cut) look = { ...look, sheet: { ...look.sheet, upright: look.sheet.cut, cut: look.sheet.cut.map((c) => turnCut(c)) } };
    // (a design the writer can't hold, such as two 121-colour design files, 241 thread changes: said, and no stale file
    // left to download; it threw past here and the last design stayed on screen)
    let bytes;
    try { bytes = writePES(pattern); }
    catch { state.views.design = null; if (state.mode === "design") setView(null); showError("This design has more thread changes than a file can hold. Use fewer thread colours, or a design file with fewer of them."); return; }
    const v = { pattern, verifyAgainst: pattern, bytes, filename, fabric: "linen", ...look };
    state.views.design = v; setTimeout(firstShown);
    // (painted again only when setView moved the zoom: drawing a busy design twice was ~0.2 s of every change)
    if (state.mode === "design") { const keep = [state.zoom, state.pan]; setView(v); if (state.zoom !== keep[0] || state.pan !== keep[1]) { [state.zoom, state.pan] = keep; paint(); } }
    // (the size as the size chip says it, from the file read back, for words that give the size: the too-big note
    // said 171 × 33 beside a 171 × 34 chip)
    return v.shown ? designStats(v.shown) : null;
  },
});

selBox = studio.selBox;
setMode((location.hash || "#design").slice(1), false);

// Once the first design is on screen (or after 6 s without one: an empty Design tab), and the page is still: the
// page's own text faces, the other tabs' code, then the offline copy. Not before: all are downloads, and on a slow
// connection they took the line from the lettering font the first preview was waiting for. (The font list's and
// the starters' lettering fonts wait for the page's faces too: ui.js `facesOn`.)
let shownOnce = false;
function firstShown() {
  if (shownOnce) return;
  shownOnce = true;
  const still = (f) => ("requestIdleCallback" in window ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 800));
  // (the faces first and alone, for 5 s at most: they are what the visitor sees change)
  still(() => uiFonts().then(() => tabCode().then(offline, offline)));
}
// The page's own text faces (index.html `nwFonts`). A visit that has had them asks for them at once from then on.
let uiFontsAsked = null;
function uiFonts() { return (uiFontsAsked ||= askUiFonts()); }
function askUiFonts() {
  globalThis.nwFonts?.();
  const sheet = document.querySelector('link[rel="stylesheet"][href*="fonts.googleapis.com"]');
  if (!sheet) return Promise.resolve();
  const faces = ['400 17px "Atkinson Hyperlegible"', '700 17px "Atkinson Hyperlegible"', '500 17px "Bricolage Grotesque"', '700 17px "Bricolage Grotesque"', '500 14px "IBM Plex Mono"'];
  const got = () => Promise.all(faces.map((f) => document.fonts.load(f))).then((f) => { if (f[0].length) store.set("uifonts", true); }, () => {});
  const here = sheet.sheet ? got() : new Promise((r) => { sheet.addEventListener("load", () => got().then(r)); sheet.addEventListener("error", r); });
  return Promise.race([here, new Promise((r) => setTimeout(r, 5000))]);
}
setTimeout(firstShown, 6000);

// installable and offline (sw.js); a picture or design shared to the installed app opens straight away
// A new release installs beside the one that's running and waits: the page offers it, and reloads into it when it has
// taken over (sw.js: a page never runs one release's files beside another's). Its design is kept in the browser, so
// nothing is lost by the reload. (`?sw` on this computer: tests/ only; the page is otherwise https.)
function offline() {
  if (!("serviceWorker" in navigator && (location.protocol === "https:" || (location.hostname === "127.0.0.1" && new URLSearchParams(location.search).has("sw"))))) return;
  let reloading = false;
  const offer = (reg) => toast("A new version of Needleworks is ready.", { label: "Reload", run: () => { reloading = true; reg.waiting?.postMessage("activate"); } });
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloading) location.reload(); });
  navigator.serviceWorker.register("sw.js").then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(reg); });
    });
  }).catch(() => {});
}
if (new URLSearchParams(location.search).has("shared")) (async () => {
  try {
    const c = await caches.open("needleworks-shared"), r = await c.match("shared");
    if (r) { const blob = await r.blob(); await c.delete("shared"); route(new File([blob], decodeURIComponent(r.headers.get("x-name") || "shared"), { type: blob.type })); }
  } catch {}
  history.replaceState(null, "", location.pathname + location.hash);
})();
// a link to another tab on this page (#design, #open...) switches to it; #bookmark opens the Bookmark starter
// a file dropped or pasted anywhere on the page
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  document.querySelectorAll(".drop.over").forEach((d) => d.classList.remove("over"));
  route(e.dataTransfer.files[0]);
});
// (a picture copied from a web page or a chat can come as an item with no file: read too. One with no type is a
// picture when the browser can draw it.)
const pasted = (f) => (f.type || /\.[a-z0-9]+$/i.test(f.name) ? f : new File([f], "pasted.png", { type: "image/png" }));
document.addEventListener("paste", (e) => {
  const cd = e.clipboardData, f = [...(cd?.files || [])][0] || [...(cd?.items || [])].find((i) => i.kind === "file")?.getAsFile();
  if (f) { e.preventDefault(); route(pasted(f)); }
});
// "Paste a picture": a phone has no Ctrl+V, so the picture copied in Photos or a chat had no way in but saving it
// first. Shown where the browser can read a picture from the clipboard (it asks the person each time).
if (navigator.clipboard?.read) {
  $("pic-paste").hidden = false;
  $("pic-paste").onclick = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) { const blob = await item.getType(type); route(new File([blob], `pasted.${type.split("/")[1].replace("jpeg", "jpg").replace(/\+.*/, "")}`, { type })); return; }
      }
      showError("There's no picture to paste yet. Copy one first (press and hold a picture, then Copy), then tap Paste a picture.");
    } catch { showError("The picture couldn't be pasted. Copy it again, allow Paste when asked, or save it and use Choose a picture."); }
  };
}
// skip links move focus without changing the address (its #hash is the tab)
for (const a of document.querySelectorAll(".skip")) a.onclick = (e) => { e.preventDefault(); const t = $(a.hash.slice(1)); t.focus({ preventScroll: true }); t.scrollIntoView({ block: "start" }); };
addEventListener("hashchange", () => { const m = location.hash.slice(1); if (m === "bookmark" || (m !== state.mode && MODES.includes(m))) setMode(m, false); });
// for tests/surfaces.mjs: the view on screen, its problems and its share text (what every surface should agree on)
globalThis.nwTest = { view: () => state.view, names: (name, shrink) => studio.forNames()?.build(name, shrink), state: () => ({ zoom: state.zoom, scale: state.tf?.scale, whole: !!state.view?.whole, pan: state.pan, step: state.step, turn: designTurned(), hoop: hoop().id, mode: state.mode }), sel: () => selBox(), problems: () => problemsOf(state.view), share: () => state.view && shareText(state.view), cut: (ext = "svg") => cutFiles(state.view, ext).map((f) => ({ ...judge(f), bytes: String(f.bytes) })), fine: () => state.pic.fine && { ...state.pic.fine, checking: state.pic.checking, fixes: state.pic.fixes?.map((f) => f.label) } };
