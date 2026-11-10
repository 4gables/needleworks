/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
import { turnForMachine, turnPattern } from "./core/design.js";
import { FONTS } from "./core/fonts.js";
import { COLOR_CHANGE, STITCH, designStats, machineThreads, readEmbroidery, validatePES, writePES } from "./core/formats.js";
import { DEFAULT_MACHINE, MACHINES, MARGIN, hoop as getHoop } from "./core/machines.js";
import { DENSITY, LEARN, MOST, contentBox, lostMuch, picturePlan, pictureImage, sewSized } from "./core/digitize.js";
import { PEC_MATCH, PEC_THREADS, hexToRgb, nearestBrotherThread, pecThread, rgbToHex } from "./core/threads.js";
import { CLOTHS, colorBlocks, draw } from "./render.js";
import { TURNED, TURN_PIC, cutDXF, cutName, cutSVG, firstStep, sewSheet, sewTime, stepTime, told, youHtml } from "./sheet.js";
import { handOut, judge } from "./gate.js";
import { DST_COLOURS, blockLoads, checkup, fewerBlocks, fix, heat, openedFile, pauses, shortJumps, sortedChanges } from "./doctor.js";
import { HARD, MAX_BLOCKS, denseWords, moves, verdictOf } from "./quality.js";
import { BLOCK, LOOK, LOOK_HEAD, TIP, TIP_HEAD, problemsHtml, problemsInline, problemsItems, problemsOf, shownOn, stopWords, stopsAt, mmText } from "./words.js";
import { brief, safeName, tidy, uniqueName, withSwash } from "./core/typed.js";
import { BRANDS, apart, brotherNum, chartSpools, exampleSpools, lab, nearestSpool, nearestSpools, ownSpoolOf, spools } from "./core/brands.js";
import { COLORS as LINE_THREADS, initStudio, savedDesign } from "./studio/ui.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("nw:" + k)) ?? d; } catch { return d; } },
  set(k, v) {
    try { localStorage.setItem("nw:" + k, JSON.stringify(v)); }
    catch { if (k === "studio" && !store.warned) { store.warned = true; toast("This design is too big to keep in the browser between visits. Use Save design to keep it."); } }
  },
  del(k) { try { localStorage.removeItem("nw:" + k); } catch {} },
};

// the old bookmark panel's colours as saved, mapped to the exact Brother PEC colours (#1a1a1a showed as "Olive Green"),
// for an old #bookmark link opening the Bookmark starter
const OLD_THREADS = { "#c8102e": "#ed171f", "#e1252f": "#ed171f", "#f06292": "#f64a8a", "#7b2d8e": "#770176",
  "#1f3a68": "#0e1f7c", "#2e6b3a": "#00673e", "#c99a2e": "#e8a900", "#1a1a1a": "#000000" };

const state = {
  mode: "picture",
  machine: store.get("machine", DEFAULT_MACHINE),
  hoopId: store.get("hoop", null),
  view: null,          // { pattern, bytes, filename, file (the bytes read back), shown, cache, fabric, fabricShapeBlock, hide,
                       //   steps, sheet, split, verifyAgainst, fileNote }
  views: {},           // last view per mode
  zoom: 1, pan: [0, 0], upto: null,
  step: null,   // Design tab: show the design as it is after that colour block
  showHoop: store.get("showHoop", true),
  // hoop turned sideways on screen, per tab
  turn: { picture: false, design: false, open: false, ...store.get("turn", {}) },
  brand: BRANDS[store.get("brand", "")] ? store.get("brand", "") : "",   // thread brand for spool numbers ("" = Brother only)
  spools: store.get("spools", {}),   // { brand: [spool numbers owned] }
  // their spools from brands not charted here (Madeira), matched by colour: [{ brand, num, hex }]. Ticking the nearest
  // Brother spool stood for it, and every surface then said "Your Brother 079 Salmon Pink", a spool they didn't own
  mine: (store.get("myspools", []) || []).filter((o) => o && typeof o.brand === "string" && /^#[0-9a-f]{6}$/i.test(o.hex)),
  pic: { mine: store.get("pic.mine", false), style: "fill", cross: 2.5, file: null, bitmap: null, key: 0, skip: [], swap: {}, colors: 6, size: 100, angle: 45, bg: true, density: store.get("pic.density", "standard"), req: 0, colorsInfo: [], line: "", edge: false, models: new Map() },
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
// the file is turned into the machine's orientation, so the machine shows it on its side (Design and Picture tabs)
const turnedFile = () => (state.mode === "design" ? designTurned() : state.mode === "picture" && !!state.turn.picture);
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
  $("empty").hidden = !!v || !$("error").hidden;   // (an error says what's wrong; "Nothing to stitch yet" under it misled)
  // (room kept clear for the chips at the top and a message at the bottom: the too-big note covered the hoop on phones)
  const err = $("error"), room = { padTop: $("facts").offsetHeight + 16, padBottom: err.hidden ? undefined : err.offsetHeight + 28, corner: zoomCorner(), base: state.hold };
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
    real: state.real, boxes: v.hoopings, ...room,
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

function setView(v) {
  stopPlay();
  state.view = v; state.views[state.mode] = v; state.upto = null; $("progress").value = 1000;
  if (state.step != null && !(v?.steps > state.step)) showStep(null);   // the design changed under a step view
  $("turn").setAttribute("aria-pressed", turned());
  $("turn").disabled = square(); $("turn").title = square() ? "A square hoop is the same either way round." : "Turn the hoop sideways, so a long design can use the hoop's long side.";
  if (!v) { $("rename-open").hidden = true; $("dl-warn").hidden = true; $("facts").innerHTML = ""; $("threads").innerHTML = ""; $("download").disabled = true; $("download").textContent = "Download PES"; $("share").disabled = true; $("sheet-print").disabled = $("along-open").disabled = true; $("cut-files").hidden = true; $("names-open").hidden = true; paint(); return; }
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
    `<span>${v.fact.stitches}</span>`,
    // (thread changes and pauses in the same thread, in the same words on every tab: the Design tab said "1 pause" for
    // the stop the Open tab called "1 thread change"; two hoopings count the stops in both files)
    stops ? stopsFact(...counts) : "",
    `<span>${v.fact.time}</span>`,
    // (the Design and Picture tabs never said it fits, as the Open tab's file card does)
    v.split ? `<span>${v.split.length} hoopings</span>` : fits ? (state.mode !== "open" ? `<span>Fits ${escapeHtml(h.name.replace(/ hoop$/, ""))}</span>` : "") : `<span class="bad">Too big for the ${h.name}</span>`,
    offCentre(v, fits) ? `<span class="note">Off centre here: the machine centres it <button type="button" class="link" id="recentre">Centre it</button></span>` : "",
    snips ? `<span${tip("Short threads the machine leaves between two parts instead of cutting them. They're locked at both ends, so snip them after stitching. (The machine only cuts moves longer than its “jump stitch not to trim” setting, 5 mm at the lowest.)")}>${v.fact.snips}</span>` : "",
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
  $("sheet-print").disabled = $("along-open").disabled = !fits || !!v.split || !!blocked; $("cut-files").hidden = !v.sheet?.cut?.length; $("names-open").hidden = !!v.split || !namesFor(); $("rename-open").hidden = state.mode !== "design";
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
  if (state.mode === "open" && state.opened) { openInfo(v, st, fits); if ($("doc-scale")) sizeUI(); }
  $("download").textContent = v.split ? `Download ${v.split.length} files (.zip)` : !fits ? "Too big for this hoop" : blocked ? v.blockLabel || "Fix the lettering first" : v.action || `Download ${v.filename}`;
  paint();
}
let qTimer = 0;
// what stops a file being made: a wait (a design file re-stitching) or a problem that blocks it (words.js)
const blocking = (v) => v.block || problemsOf(v).find((q) => q.level === BLOCK)?.text || "";
// beside Download: the view's problems (words.js), then what's wrong with the file itself
function warnUI(v) {
  const all = shownOn(problemsOf(v), "download"), own = all.filter((q) => !q.file), file = all.filter((q) => q.file);
  const html = [v.block ? escapeHtml(v.block) : "", problemsInline(own), own.length && v.fixHint ? escapeHtml(v.fixHint) : "",
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
// thread names exactly as the machine will show them: the file's own PEC palette
function machineThreadList(v) {
  const p = v.file;
  return p.pec ? p.pec.map(pecThread) : machineThreads(p.threads);
}
// an error in plain words, with a one-tap fix when there is one ({ label, run })
// (`fix`: one { label, run } or a list of them, joined by "or")
function showError(msg, fix) {
  const e = $("error"), was = e.hidden; e.textContent = msg; e.hidden = !msg;
  if (msg) [].concat(fix || []).forEach((f, i) => { const b = document.createElement("button"); b.type = "button"; b.className = "link"; b.textContent = f.label; b.onclick = f.run; e.append(i ? ", or " : " ", b); });
  if (msg || !was) paintSoon();   // (the preview keeps clear of the message)
}
// A moment's note at the bottom ("Removed Monogram aMs. Undo", "Couldn't open the share sheet"), on every tab. One
// rule for how long: every note goes by itself, after time to read it (2.5 s and 0.3 s a word, 3-8 s), and one with a
// one-tap action 4 s longer, at least 10 s (6 s went before a newcomer found Undo). A failed share said in the
// preview's message box stayed there for minutes: what went wrong with a tap is a toast; the box is for what's wrong
// with the design until it changes.
const toastBox = Object.assign(document.createElement("div"), { id: "st-toast", className: "toast", hidden: true });
toastBox.setAttribute("role", "status"); document.body.append(toastBox);
let toastTimer = 0, toastAt = 0;
const toastMs = (msg, action) => { const read = Math.min(8000, Math.max(3000, 2500 + 300 * msg.split(/\s+/).length)); return action ? Math.max(10000, read + 4000) : read; };
// Going, it fades and keeps catching taps for a moment before it's hidden: a late tap on Undo just after it went
// landed on "+ Appliqué letters" under it, and so did a second tap on Undo
function toastGone() {
  if (toastBox.hidden || toastBox.classList.contains("gone")) return;
  toastBox.classList.add("gone"); clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastBox.hidden = true; toastBox.classList.remove("gone"); }, 700);
}
function toast(msg, action) {
  toastBox.innerHTML = `<span>${escapeHtml(msg)}</span>${action ? `<button type="button" class="link">${escapeHtml(action.label)}</button>` : ""}`;
  if (action) toastBox.querySelector("button").onclick = () => { if (toastBox.classList.contains("gone")) return; toastGone(); action.run(); };
  toastBox.classList.remove("gone"); toastBox.hidden = false; toastAt = Date.now(); clearTimeout(toastTimer); toastTimer = setTimeout(toastGone, toastMs(msg, action));
}
// a note with an action ("Removed … Undo") goes with the next change, once it's been up a moment
// (`now`: whatever its age, as Undo takes the design back past what the note was about)
function hideToast(now = false) { if ((now || Date.now() - toastAt > 400) && toastBox.querySelector("button")) toastGone(); }
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
// A piece drag holds the view's fit and centre (`state.hold`) until it's let go, then the view refits. A tap on empty
// preview (not a pan) unselects the piece (there was no way to, so copying the whole design was out of reach).
let dragging = false, tap = null;
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  tap = null;
  if (state.mode === "design" && !pointers.size) {
    const mm = toMm(e); dragging = !!(mm && studio.start(mm));
    if (dragging) state.hold = state.tf?.base; else tap = [e.clientX, e.clientY];
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
  } else state.pan = [state.pan[0] + e.clientX - prev[0], state.pan[1] + e.clientY - prev[1]];
  pointers.set(e.pointerId, [e.clientX, e.clientY]); paintSoon();
});
const up = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size) { tap = null; return; }
  if (dragging) { dragging = false; state.hold = null; studio.end(); paintSoon(); }
  else if (tap && e.type === "pointerup" && state.mode === "design") studio.deselect();
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
document.addEventListener("focusin", shutTip); document.addEventListener("pointerdown", shutTip, true);
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
document.addEventListener("pointerdown", (e) => { if (!views.contains(e.target)) shutViews(false); });
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
  const lines = [`Embroidery file for a ${hoop().machineName} (${hoop().name}). Copy it to a USB stick.`];
  if (turnedFile()) lines.push("", $("done-turn").textContent);
  // (what's still wrong, and worth knowing, as every other surface says it: before the steps, so a long list of steps
  // can't cut it off)
  const probs = shownOn(problemsOf(v), "share");
  for (const [level, head] of [[LOOK, LOOK_HEAD], [TIP, TIP_HEAD]]) { const l = probs.filter((q) => q.level === level); if (l.length) lines.push("", head + ":", ...l.map((q) => `- ${q.text}`)); }
  if (sheet.ready?.length) lines.push("", "Have ready:", ...sheet.ready.map((r) => `- ${r}`));
  const thread = (i) => { const b = blocks.find((x) => x.index === i); return b ? threadLabel(b.color, mt[i].name).name : `Brother ${mt[i].name}`; };
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
  const r = handOut([{ name: v.filename, bytes: v.bytes, against: v.verifyAgainst }], { hoop: hoop(), share: { title: v.filename, text: shareText(v) } });
  if (!r.ok) { toast("Sending stopped: " + r.error); return; }
  try {
    await r.shared;
  } catch (err) {
    if (err && err.name !== "AbortError") toast("Couldn't open the share sheet. Use Download instead.");
  }
};

$("download").onclick = () => {
  const v = state.view; if (!v) return;
  // never hand out a file we haven't proven decodes to exactly this design and the machine can take
  // (judged on the bytes saved, every time: a verdict made earlier from the design described something else, and an
  // opened file's PEC header listing 2 threads for 1 block was saved "Checked")
  // (a design in two hoopings: one file per hooping, in a .zip, each proven like any other download)
  const files = v.split ? v.split.map((p) => ({ name: p.filename, bytes: writePES(p.pattern), against: p.pattern })) : [{ name: v.filename, bytes: v.bytes, against: v.verifyAgainst }];
  const r = handOut(files, { hoop: hoop(), zip: v.split ? v.filename : "" });
  // (a file the machine can't take isn't saved: the dialog says why and offers a fixed copy when one helps)
  if (!r.ok && !r.files.some((f) => f.hard.length)) { showError("Download stopped: " + r.error); return; }
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
const fixedName = (name) => name.replace(/_fixed(?=[_.])/g, "").replace(/(\.\w+)$/, "_fixed$1");
// files [{ name, bytes, problems }] that fail, with their fixed copies: the fixes and what's still wrong, in words
function badFiles(files) {
  return files.filter((f) => f.problems.length).map((f) => ({ ...f, fixed: fixedCopy(f.bytes, f.problems) }));
}
// the fixed copies saved: one file, or the whole zip again with the bad files swapped
function saveFixed(files, bad, zipName) {
  if (!zipName) return handOut([{ name: fixedName(bad[0].name), ...bad[0].fixed }], { hoop: hoop() });
  const swap = new Map(bad.filter((b) => b.fixed).map((b) => [b.name, b.fixed]));
  return handOut(files.map((f) => ({ name: f.name, ...(swap.get(f.name) || { bytes: f.bytes, against: f.against }) })), { hoop: hoop(), zip: fixedName(zipName) });
}
// what's wrong with saved files, in plain words, and a button for the fixed copies when every one could be fixed
function badReport(el, files, zipName) {
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
    btn.onclick = () => { const r = saveFixed(files, bad, zipName); btn.disabled = true; btn.textContent = r.ok ? "Saved to your downloads" : "Couldn't save it: " + r.error; };
    el.append(btn);
  }
  return bad;
}
// what was checked and the next steps at the machine, until "Don't show this again" (a file that fails the quality
// check always says so)
// (`saved` false: refused at the gate for a rule the machine needs, nothing saved)
function downloaded(v, zipped, files = [], saved = true) {
  const box = $("done-bad") || Object.assign(document.createElement("div"), { id: "done-bad", className: "done-bad" });
  if (!box.isConnected) $("done-checked").after(box);
  const bad = badReport(box, files, zipped ? v.filename : null);
  if (store.get("doneSeen", false) && !bad.length) return;
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
    : part ? `It opens ${what}, but only part of the design is in it: the file it came from ends early. Download that file again if you can.` : `Checked: it opens ${what}.`;
  $("done-checked").className = bad.length || part ? "warn" : "good";
  $("done-zip").hidden = !zipped;
  // (several designs saved this session: a newcomer asked which order to sew them in) Counted per tab: saves on
  // another tab said "each file you've saved is a design of its own" after one save of one opened file. Pictures and
  // Design your own count together (each makes a design of its own: a picture saved after two names didn't say it)
  const mine = ((downloaded.names ||= {})[state.mode === "open" ? "open" : "made"] ||= new Set());
  if (saved) mine.add(v.filename);
  $("done-own").hidden = !saved || mine.size < 2;
  $("done-phone").hidden = !matchMedia("(pointer: coarse)").matches;
  // (an Android phone has no Lightning port, nor an iPhone a "Files by Google")
  $("done-phone").textContent = /Android/i.test(navigator.userAgent)
    ? " On a phone: plug a USB-C stick (or an adapter for a USB stick) into it, then in the Files app move the file from Downloads to the stick. Or email the file to yourself and copy it on a computer."
    : " On a phone: plug a USB-C (or Lightning) stick into it, then in the Files app move the file from Downloads to the stick. Or email the file to yourself and copy it on a computer.";
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
  $("done").showModal();
}
$("done-turn").insertAdjacentHTML("afterbegin", TURN_PIC);   // (the note's text stays its textContent)
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
const cutFiles = (v, ext) => {
  const shapes = v?.sheet?.upright || v?.sheet?.cut;
  if (!shapes?.length) return [];
  const name = v.filename.replace(/\.pes$/i, "");
  return [{ name: cutName(name, shapes, ext), bytes: (ext === "dxf" ? cutDXF : cutSVG)(shapes, name) }];
};
const cutFile = (ext) => () => {
  const files = cutFiles(state.view, ext); if (!files.length) return;
  const r = handOut(files);
  if (!r.ok) showError("Cut file stopped: " + r.error);
};
$("cut-file").onclick = cutFile("svg");
$("cut-dxf").onclick = cutFile("dxf");

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
  const blocks = v.cache.blocks, mt = machineThreadList(v);
  const sheet = told(v.sheet, blocks, mt, v.filename), steps = [...sheet.steps];
  // (the first screen says what to have by the machine and how to hoop it, each on its own: they ran together as one
  // bold paragraph with the action at the end)
  if (sheet.ready.length && steps.length) steps[0] = { ...steps[0], ready: sheet.ready };
  if (turnedFile() && steps.length) steps[0] = { ...steps[0], turn: $("done-turn").textContent };
  return steps.map((s, i) => {
    // (each step's share of the chips' time, its pause included: the steps add up to it)
    return { ...s, block: blocks.find((x) => x.index === i), minutes: v.fact?.steps[i] ?? 0 };
  });
}
function alongShow() {
  const v = state.view, steps = alongSteps(v), i = along.i, done = i >= steps.length, mt = machineThreadList(v);
  // (the hoop turned: drawn on its side, as the machine shows it, like the steps say; it was drawn upright)
  const machine = turned() && !!v.file;
  $("along-count").textContent = (done ? "All done" : `Step ${i + 1} of ${steps.length}`) + (machine ? " · as the machine shows it" : "");
  $("along-back").disabled = i === 0;
  $("along-next").textContent = done ? "Close" : i === steps.length - 1 ? "Finish" : "Next step";
  let look = { hide: v.hide, fabricShapeBlock: v.fabricShapeBlock };
  if (done) {
    $("along-title").textContent = "Finished";
    $("along-you").innerHTML = youHtml(told(v.sheet, v.cache.blocks, mt, v.filename).after.join(" "), escapeHtml, "p");
    $("along-ready").hidden = $("along-turn").hidden = $("along-look").hidden = true;
    $("along-sews").textContent = ""; $("along-time").textContent = ""; $("along-wrong").hidden = true;
  } else {
    const s = steps[i], t = mt[i];
    $("along-title").innerHTML = `<i style="background:${s.block?.color || "#999"}"></i>${s.title ? escapeHtml(s.title) + " · " : ""}${s.block ? threadHtml(s.block.color, t?.name || "") : `Brother ${escapeHtml(t?.name || "")}`}`;
    $("along-ready").hidden = !s.ready; $("along-ready").querySelector("ul").innerHTML = (s.ready || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("");
    $("along-turn").hidden = !s.turn; $("along-turn").innerHTML = s.turn ? TURN_PIC + escapeHtml(s.turn) : "";
    // (what's still wrong, and worth knowing, on the first screen, as the steps and the sew sheet say it: words.js)
    const probs = i ? "" : problemsItems(shownOn(problemsOf(v), "along"), "div", "");
    $("along-look").hidden = !probs; $("along-look").innerHTML = probs;
    $("along-you").innerHTML = s.you || !i ? youHtml(s.you || firstStep(v.filename), escapeHtml, "p") : "";
    $("along-sews").textContent = s.sews || "";
    $("along-time").textContent = stepTime(s.minutes);
    // (what to do when the wrong thread went on: nothing said, a tester stopped and started over)
    // (closed again on a new step only: a resize redraws the screen)
    $("along-wrong").hidden = false; if (along.at !== i) $("along-wrong").open = false;
    look = stepLook(v, i, s.block);
  }
  along.at = i;
  draw($("along-view"), machine ? v.file : v.shown, { cache: machine ? (v.fileCache ||= colorBlocks(v.file)) : v.cache, fabric: v.fabric, field: state.bg, ...look, ghost: look.upto != null, hoop: machine ? hoop() : shownHoop(), showHoop: false, pad: 12 });
}
$("along-open").onclick = async () => {
  if (!state.view?.cache) return;
  along.i = 0; along.at = null; $("along").showModal(); alongShow();
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

// one file per name, in a zip: the Design tab swaps its lettering
function namesFor() {
  if (state.mode === "design") {   // (studio is set up further down)
    // (only the names that need the turned hoop are turned into the machine's orientation)
    try { const n = studio.forNames(); return n && { ...n, build: (...a) => { const m = n.build(...a); return { ...m, pattern: m.turned ? turnForMachine(m.pattern) : m.pattern, shown: m.pattern }; } }; }
    catch { return null; }
  }
  return null;
}
// Rename (Design your own): a file name of their own, kept with the design and used by every file it makes. Four
// coasters with different motifs all downloaded as Coaster.pes, with no way to tell them apart on the USB stick.
$("rename-open").onclick = () => {
  const auto = studio.autoName();
  $("rename-name").value = studio.title(); $("rename-name").placeholder = auto;
  renameNote(); $("rename").showModal(); $("rename-name").select();
};
// (60 letters at most, as the Design tab keeps it: a field's maxlength cut a pasted name with nothing said)
function renameNote() {
  const el = $("rename-name"), cut = el.value.length > 60;
  if (cut) el.value = el.value.slice(0, 60);
  const t = tidy(el.value).trim(), as = safeName(t, "");
  $("rename-auto").hidden = !studio.title();
  $("rename-note").textContent = (cut ? "60 letters and spaces is the most: the rest was left out. " : "") + (!t ? `Empty, it's named from the design: ${studio.autoName()}.pes.`
    : !as ? "Use some letters or numbers: the machine shows only those." : `The file will be ${as}.pes${as !== t.replace(/\s+/g, "_") ? " (the machine's screen shows plain letters, numbers, - and _)" : ""}. Saved designs, ZIPs and cutter files take this name too.`);
}
$("rename-name").addEventListener("input", renameNote);
$("rename-name").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("rename-save").click(); } });
$("rename-save").onclick = () => { studio.rename($("rename-name").value); $("rename").close(); };
$("rename-auto").onclick = () => { studio.rename(""); $("rename").close(); };
$("names-open").onclick = () => {
  const n = namesFor(); if (!n) return;
  // (a monogram takes initials: "JKM", one set a line)
  $("names-what").textContent = n.monogram ? `Each line's initials take the place of the monogram “${n.what}” (up to 3, in the order first, LAST, middle). Everything else stays the same.`
    : `Each name takes the place of “${n.what}”. Everything else stays the same.`;
  $("names-list").value = store.get(n.monogram ? "names.initials" : "names", ""); $("names-note").classList.remove("warn"); if ($("names-bad")) $("names-bad").hidden = true;
  $("names-list").placeholder = n.monogram ? "JKM\nALB\nR" : "Ashley\nLiam\nOlivia"; $("names-list").setAttribute("aria-label", n.monogram ? "Initials, one set per line" : "Names, one per line");
  $("names-note").textContent = n.monogram ? "One set of initials per line, up to 40. You get one file for each, in a single .zip." : "One name per line, up to 40. You get one file for each, in a single .zip.";
  $("names-shrink-row").hidden = false;
  $("names-thumbs").innerHTML = ""; $("names-cancel").textContent = "Cancel";
  $("names").showModal();
  // (last time's list, all selected: typing replaces it. The caret at its end glued "Ava" onto "Name35")
  $("names-list").focus(); $("names-list").select();
};
// (the last run's result goes once the list is changed: it described names no longer there)
$("names-list").addEventListener("input", () => {
  if (!$("names-thumbs").innerHTML && !$("names-note").classList.contains("warn")) return;
  const n = namesFor(); $("names-thumbs").innerHTML = ""; $("names-note").classList.remove("warn"); if ($("names-bad")) $("names-bad").hidden = true;
  $("names-note").textContent = n?.monogram ? "One set of initials per line, up to 40. You get one file for each, in a single .zip." : "One name per line, up to 40. You get one file for each, in a single .zip.";
  $("names-cancel").textContent = "Cancel";
});
let smallerOk = false;   // (the turn was offered and they chose to make them smaller anyway)
$("names-make").onclick = async () => {
  const n = namesFor(); if (!n) return;
  // (past 40, the rest are said as left out: the 41st was dropped without a word)
  // (a name typed twice is made once, and said: "Ola" twice left one file with nothing said)
  const typed = $("names-list").value.split("\n").map((s) => tidy(s).trim()).filter(Boolean), all = [...new Set(typed)], list = all.slice(0, 40), left = all.slice(40);
  const twice = all.filter((n) => typed.indexOf(n) !== typed.lastIndexOf(n));
  store.set(n.monogram ? "names.initials" : "names", all.join("\n"));
  if (!list.length) { $("names-note").textContent = "Type at least one name."; return; }
  $("names-make").disabled = true; $("names-note").textContent = "Making the files…";
  // (file names compared ignoring case: emma.pes and Emma.pes are one file on a Mac, Windows or the USB stick)
  const files = [], bad = [], used = new Set(), made = [], small = [];
  for (const [k, name] of list.entries()) {
    await new Promise((r) => setTimeout(r, 0));
    if (list.length > 2) $("names-note").textContent = `Making the files… ${k + 1} of ${list.length}`;
    try {
      const { pattern, shown, smaller, pct, lines, thin, turned: sideways, runs, xh, least, own } = n.build(name, $("names-shrink").checked);
      const f = uniqueName(safeName(name, "name"), used);
      // (judged as the zip will be: a name the gate would refuse is left out and said so, not the whole zip)
      const j = judge({ name: f + ".pes", bytes: writePES(pattern), against: pattern }, hoop());
      if (!j.ok) { used.delete(f.toLowerCase()); throw new Error(j.error); }
      // (a name whose file name another one already took, ignoring case and accents: "Zoe" and "Zoë" both
      // Zoe, the second saved as Zoe_2.pes with nothing saying which was which)
      files.push(j); made.push({ name, file: f + ".pes", renamed: f !== safeName(name, "name"), pattern, shown, smaller, pct, lines, thin, sideways, runs, size: [xh, least, own] });
    } catch (err) { bad.push(`${brief(name)} (${/hoop fits|too big/i.test(err.message) ? "too long for the hoop" : err.message})`); if (/too long to sew clearly/.test(err.message)) small.push(name); }
  }
  $("names-make").disabled = false;
  // Names made smaller (or too long) that would sew full size with the hoop turned: the turn is offered before any
  // file is made (Benjamin and Ella-Rose came out smaller on an upright 5x7 that had room for them across)
  // (and names too small to sew clearly, refused: turned, a long name may have the room)
  const cut = [...made.filter((m) => m.smaller).map((m) => m.name), ...bad.filter((b) => / \(too long for the hoop\)$/.test(b)).map((b) => b.replace(/ \(too long for the hoop\)$/, "")), ...small];
  if (!smallerOk && n.canTurn && cut.length && cut.every((name) => { try { const t = hoop(), m = n.build(name, false, { ...t, w: t.h, h: t.w }); return !m.smaller && !m.runs; } catch { return false; } })) {
    const names = cut.length === 1 ? cut[0] : `${cut.slice(0, -1).join(", ")} and ${cut.at(-1)}`;
    $("names-note").classList.add("warn");
    $("names-note").textContent = `${names} ${cut.length === 1 ? "is" : "are"} too long for the hoop as it is${$("names-shrink").checked ? ` and would be made smaller` : ""}. With the hoop turned ${cut.length === 1 ? "it fits" : "they fit"} full size. `;
    const go = (text, run) => Object.assign(document.createElement("button"), { type: "button", className: "link", textContent: text, onclick: run });
    $("names-note").append(go("Turn the hoop and make them", () => { $("turn").click(); $("names-make").click(); }), " or ",
      go($("names-shrink").checked ? "make them smaller" : "make them anyway", () => { smallerOk = true; $("names-make").click(); }), ".");
    $("names-note").querySelector("button").focus();
    return;
  }
  smallerOk = false;
  // every name as it'll sew, to look over (is one crowded?), with what's different about it, and its file's name where
  // that isn't the name as typed (Zoë is Zoe.pes, a second Emma Emma_2.pes: the note names files, the machine shows them)
  // (a name sewn as a thin line where the design is bold stands out: it was one more word in the brackets)
  // (how much smaller, said: "(smaller)" was all a name made at 28 % said)
  const notes = (m) => [m.smaller ? `smaller, ${m.pct} %` : "", m.lines ? "on two lines" : "", m.sideways ? "hoop turned" : "", m.runs ? `runs into ${m.runs}` : ""].filter(Boolean).join(", ");
  $("names-thumbs").innerHTML = made.map((m, i) => `<figure data-size="${m.size.map((v) => +(v || 0).toFixed(2)).join(" ")}"><canvas data-i="${i}"></canvas><figcaption>${escapeHtml(m.name)}${m.file !== `${m.name}.pes` ? ` · ${escapeHtml(m.file)}` : ""}${notes(m) ? ` (${escapeHtml(notes(m))})` : ""}${m.thin ? `<br><strong class="names-thin">Thin line, not bold</strong>` : ""}</figcaption></figure>`).join("");
  for (const c of $("names-thumbs").querySelectorAll("canvas")) {
    const m = made[+c.dataset.i]; draw(c, m.shown || m.pattern, { pad: 6, fabric: "white" });   // (3 px: an arched name's top sat on the edge)
  }
  const zipName = `${n.zip || "names"}_${files.length}_${n.monogram ? "monograms" : "names"}.zip`;
  if (files.length) {
    const r = handOut(files, { hoop: hoop(), zip: zipName });
    if (!r.ok) { bad.push(r.error); files.length = 0; } else $("names-cancel").textContent = "Done";
  }
  // (each file through the same quality check as a single download, with fixed copies when they help)
  const box = $("names-bad") || Object.assign(document.createElement("div"), { id: "names-bad", className: "warn" });
  if (!box.isConnected) $("names-note").after(box);
  const poor = files.length ? badReport(box, files, zipName) : (box.hidden = true, []);
  // (a turned file needs the fabric hooped a quarter turn round: said per file, since only the long names are)
  // (an in-the-hoop design hoops bare stabilizer: it's the fabric laid on it that goes round)
  const lay = state.views.design?.bare ? "lay the fabric pieces" : "hoop the fabric";
  const side = made.filter((m) => m.sideways), runs = made.filter((m) => m.runs), thin = made.filter((m) => m.thin);
  // (names under the font's least x-height where the design's own is too: made, as the design is, but said; "Made 9
  // files" was all a batch of 1.4 mm letters said)
  const tiny = made.filter((m) => m.size[0] && m.size[1] && m.size[0] < m.size[1] - 0.05);
  $("names-note").classList.toggle("warn", bad.length > 0 || runs.length > 0 || poor.length > 0 || left.length > 0 || thin.length > 0 || twice.length > 0 || tiny.length > 0);
  $("names-note").textContent = `${files.length ? `Made ${files.length} ${files.length === 1 ? "file" : "files"}, saved as one .zip (open it and copy the .pes files to the USB stick). ` : ""}`
    + (side.length === made.length && side.length > 1 ? `Every file is turned like the design: ${lay} a quarter turn round for each, with the top of the name toward the right of the hoop (the machine shows them on their side). `
      : side.length ? `${lay[0].toUpperCase() + lay.slice(1)} a quarter turn round for ${side.map((m) => m.file).join(", ")}: the machine shows ${side.length === 1 ? "it" : "them"} on ${side.length === 1 ? "its" : "their"} side, with the top of the name toward the right of the hoop. ` : "")
    + (runs.length ? `Runs into another piece: ${runs.map((m) => m.name).join(", ")} (${$("names-shrink").checked ? "even at half size: shorten" : `tick "Make long names smaller", or shorten`} ${runs.length === 1 ? "it" : "them"}). ` : "")
    + (tiny.length ? `Too small to stitch cleanly, like the design's own lettering: ${tiny.map((m) => m.name).join(", ")} (letters ${mmText(Math.min(...tiny.map((m) => m.size[0])))} tall; this font needs ${mmText(tiny[0].size[1])}). Make the lettering bigger first. ` : "")
    + (thin.length ? `Sewn as a thin line, not bold like the design (too small for bold once shrunk to fit): ${thin.map((m) => m.name).join(", ")}. ` : "")
    + (bad.length ? `Couldn't make: ${bad.join(", ")}. ` : "")
    + (twice.length ? `${twice.length === 1 ? "1 name was" : `${twice.length} names were`} typed twice, made once: ${twice.map(brief).join(", ")}. ` : "")
    + (left.length ? `Left out (40 at a time): ${left.join(", ")}. Make them in a second batch.` : "")
    + (poor.length ? ` ${poor.length === 1 ? "One file" : `${poor.length} files`} may not sew well:` : "");

  // (Make the files is disabled while they're made, which sent focus to the page: on to the result's first action,
  // or back to the list when nothing was made)
  if (!$("names").contains(document.activeElement) || document.activeElement === $("names-make"))
    (files.length ? [...box.querySelectorAll("button, a[href]")].find((b) => b.offsetParent) || $("names-cancel") : $("names-list")).focus();
};

// ---------- thread brand ----------
// One label for a thread on every surface (chips, steps, Sew along, sew sheet, Picture palette, the editor): `name`
// leads, `note` follows in small. A spool they own and use for the colour leads ("Your Sulky Rayon 1076 Royal Blue",
// note "the machine calls it Wisteria Violet": "Brother Wisteria Violet · your Sulky 1076 Royal Blue" read as the wrong
// thread); otherwise the machine's name, with "≈ Isacord 1306", "spool 007" or a far owned spool in the note; `short`:
// the chips' note (a long "nearest of yours … is quite different" under each chip shrank the preview: it's the tooltip).
// `machine`: the name the file gives the colour, so Brother's spool number is that thread's
// `guide`: the colour is sewn only as guide lines under fabric (the Design tab says so from its steps; else the view's)
function threadLabel(hex, machine, guide = guideColour(hex)) {
  const lead = { name: `Brother ${machine}`, note: "", short: "" };
  if (!state.brand) return lead;
  const s = owns() ? nearOwn(hex) : nearestSpool(state.brand, hex);
  if (!s) return lead;
  // (an owned spool far from the colour isn't a match: white showed as "your Isacord 5513", a green; `far` in brands.js)
  // (Brother's own spools match the machine's colours exactly: just the number of the thread the machine names)
  if (!owns()) { const note = state.brand === "brother" ? `spool ${brotherNum(machine) || s.num}` : `≈ ${s.label}`; return { ...lead, note, short: note }; }
  // (one wording for no close spool on every surface: the chip said "none of yours is close" and the steps and editor
  // "nearest of yours, Sulky 1076 Royal Blue, is quite different". A placement line under the appliqué fabric is only
  // a guide: its thread hardly matters, so it isn't "quite different")
  if (s.far) return guide ? { ...lead, note: "only a guide line: any thread will do", short: "only a guide line: any thread will do" }
    : { ...lead, note: `none of yours is close (the nearest, ${s.label}, is quite different)`, short: "none of yours is close" };
  const name = `Your ${s.label}`;
  // (their Brother spool is the machine's own thread: "Your Brother 007 Prussian Blue · the machine calls it Prussian
  // Blue" said the name twice)
  if (!s.own && state.brand === "brother" && s.name === machine) return { name, note: "", short: "" };
  // (the file's thread for this colour may be another colour, its nearest being taken by another colour: a navy spool
  // of theirs read "the machine calls it Olive Green" with nothing to say that's fine)
  const t = PEC_THREADS.find((x) => x && x[0] === machine), other = t && apart(s.hex, rgbToHex(t.slice(1, 4)));
  return other ? { name, note: `the machine calls it ${machine}: that's fine, it's only the name on its screen`, short: `the machine calls it ${machine}: that's fine` }
    : { name, note: `the machine calls it ${machine}`, short: `the machine calls it ${machine}` };
}
// whether they've listed spools of their own for the brand shown (its chart's, or their own from other brands)
const owns = () => !!state.brand && (state.spools[state.brand]?.length > 0 || state.mine.length > 0);
// the nearest spool of theirs to a colour (`far` when none is close), or null when they've listed none
const nearOwn = (hex) => owns() ? nearestSpool(state.brand, hex, state.spools[state.brand] || [], state.mine) : null;
// a colour sewn only as guide lines under fabric (appliqué placement lines: hidden in the preview, `hide`)
function guideColour(hex) {
  const v = state.view, bl = v?.cache?.blocks;
  if (!v?.hide?.size || !bl) return false;
  const mine = bl.filter((b) => b.color === hex);
  return mine.length > 0 && mine.every((b) => v.hide.has(b.index));
}
// the label as one line ("Your Isacord 1902 · the machine calls it Red"), for text without a small note
const threadLine = (hex, machine, guide) => { const l = threadLabel(hex, machine, guide); return l.note ? `${l.name} · ${l.note}` : l.name; };
// as html: the name, then the note in small (`sep` before it)
const threadHtml = (hex, machine, sep = " ", guide) => { const l = threadLabel(hex, machine, guide); return `${escapeHtml(l.name)}${l.note ? `${sep}<small>${escapeHtml(l.note)}</small>` : ""}`; };
// the spool they own for a colour ("Isacord 0015 White"), for supply lists; "" when they haven't listed one close to it
function ownSpool(hex) {
  const s = nearOwn(hex);
  return s && !s.far ? s.label : "";
}
// the threads for a supply list: by the spools they own when they've listed some, the rest as what to buy ("To buy:
// Brother 007 Prussian Blue"; Have ready mixed owned and missing threads)
// `machineName(hex)`: the name the file's own palette gives the colour (a colour whose nearest Brother thread another
// colour took gets the next one: "for Brother Dark Gray" while the steps said Olive Green)
// (one spool per entry: "Isacord 3541 (for Brother Violet, Brother Purple)", not 3541 three times; a spool that's only
// the nearest the brand has says so, as the thread chips do; a brand without spools listed gives its numbers here too)
function threadList(colors, machineName = (hex) => nearestBrotherThread(hex).name) {
  const own = owns(), name = (hex) => `Brother ${machineName(hex)}`;
  const and = (a) => a.length < 3 ? a.join(" and ") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`;
  const uniq = [...new Set(colors)];
  if (state.brand && !own && state.brand !== "brother") {
    const by = new Map();
    for (const h of uniq) { const s = nearestSpool(state.brand, h); if (!by.has(s.label)) by.set(s.label, { s, names: [] }); const n = name(h); if (!by.get(s.label).names.includes(n)) by.get(s.label).names.push(n); }
    return `Thread: ${[...by.values()].map(({ s, names }) => `${and(names)} ≈ ${s.label}${s.far ? " (the nearest, quite different)" : ""}`).join(", ")}.`;
  }
  if (!own) return `Thread: ${[...new Set(uniq.map((h) => state.brand ? `Brother ${brotherNum(machineName(h)) || nearestSpool(state.brand, h).num} ${machineName(h)}` : name(h)))].join(", ")}.`;
  const mine = [...new Set(uniq.map(ownSpool).filter(Boolean))];
  const buy = new Map();
  for (const h of uniq.filter((x) => !ownSpool(x))) {
    const s = nearestSpool(state.brand, h);
    if (state.brand === "brother") { const n = brotherNum(machineName(h)); if (n) Object.assign(s, { label: `Brother ${n} ${machineName(h)}`, far: false }); }
    if (!buy.has(s.label)) buy.set(s.label, { names: [], far: [] });
    const e = buy.get(s.label), n = machineName(h);
    if (!e.names.includes(n)) { e.names.push(n); if (s.far) e.far.push(n); }
  }
  const bought = [...buy].map(([label, { names, far }]) => state.brand === "brother" ? label
    : `${label} (for ${and(names.map((n) => `Brother ${n}`))}${far.length ? `; a rough match${far.length < names.length ? ` for ${and(far)}` : ""}` : ""})`);
  return [mine.length ? `Your threads: ${mine.join(", ")}.` : "", bought.length ? `To buy: ${bought.join(", ")}.` : ""].filter(Boolean).join(" ");
}
function brandUI() {
  // (one choice per meaning: "Brother thread" and "Brother spool numbers" side by side read as the same thing. The
  // machine's names are always shown; a brand adds its spool numbers)
  $("brand").innerHTML = `<option value="">Thread names</option><optgroup label="Add spool numbers for">`
    + Object.entries(BRANDS).map(([k, n]) => `<option value="${k}">${n}</option>`).join("") + `</optgroup><option value="@mine">Threads I own…</option>`;
  // (with spools listed, the brand reads "My Isacord": "Isacord (threads I own)" was cut off by the select)
  for (const o of $("brand").options) if (o.value && state.spools[o.value]?.length) o.textContent = `My ${BRANDS[o.value]}`;
  // (only spools of other brands: "My threads", the brand still giving the numbers of threads to buy)
    else if (o.value && o.value === state.brand && state.mine.length) o.textContent = "My threads";
  $("brand").value = state.brand;
  $("brand").title = state.brand ? `The machine's thread names, with the ${BRANDS[state.brand]} spool numbers beside them` : "The machine's thread names. Pick a brand to see its spool numbers too.";
  const mine = owns();
  $("pic-mine-row").hidden = !mine; $("pic-mine").checked = !!mine && state.pic.mine;
}
// (the Design tab's editor too: its thread hint kept the old label until a reload)
function relabel() { if (state.view) setView(state.view); paletteUI(); if (state.mode === "design") studio.relabel(); }
$("brand").onchange = (e) => {
  if (e.target.value === "@mine") { e.target.value = state.brand; openSpools(); return; }
  state.brand = e.target.value; store.set("brand", state.brand); brandUI(); relabel();
  if (state.pic.mine && state.mode === "picture") makePicture();
};
function openSpools() {
  $("spools-brand").innerHTML = Object.entries(BRANDS).map(([k, n]) => `<option value="${k}">${n}</option>`).join("");
  $("spools-brand").value = state.brand || "brother";   // (a Brother machine's owner mostly has Brother spools)
  $("spools-list").value = (state.spools[$("spools-brand").value] || []).join(" ");
  $("spools-find").value = ""; spoolNear = null; spoolsMine = state.mine.map((o) => ({ ...o }));
  $("spools-own").hidden = true; $("own-brand").value = $("own-num").value = ""; $("own-hint").textContent = "";
  spoolsGrid(); $("spools").showModal();
}
// (examples in the brand's own numbers: Brother's showed Isacord-like "0020 1902 3541")
const spoolsHint = () => { $("spools-list").placeholder = `The numbers on your spools, e.g. ${exampleSpools($("spools-brand").value)}`; };
// Every spool in the brand's chart as a swatch to tick, in colour-card order, with a search by number or name: a list
// of numbers typed from memory was the only way in, and Isacord's chart has no names to guess from. The numbers box
// (for pasting a list) stays the record; ticking adds or takes a number from it.
function spoolsGrid() {
  const b = $("spools-brand").value, all = chartSpools(b);
  $("spools-grid").innerHTML = all.map((s) => `<button type="button" data-spool="${s.num}" aria-pressed="false" tabindex="-1" title="${escapeHtml(s.label)}" aria-label="${escapeHtml(s.label)}"><i style="background:${s.hex}"></i><span>${s.num}</span></button>`).join("");
  spoolsFind(); spoolsPreview();
}
// Brands not charted here, by name, so a search for one says so (it said "No spool with that number or name")
const UNLISTED = ["Madeira", "Gunold", "Floriani", "Marathon", "Polyneon", "Mettler", "Coats", "Gütermann", "Gutermann", "Janome", "Simthread", "Exquisite", "Superior", "Aurifil", "Fil-Tec", "Glide", "Embrilliance", "Pfaff", "Husqvarna", "Bernina", "Singer", "Babylock", "Baby Lock", "Amann", "Ackermann", "Royal", "Medeira"];
// A spool from a brand that isn't charted (Madeira) is matched by its colour: the colour picked shows the nearest
// spools of the brand chosen here (`near`), to tick the closest; any search is set aside meanwhile.
let spoolNear = null;
// their own spools from other brands while the dialog is open (state.mine once saved)
let spoolsMine = [];
function spoolsFind() {
  const q = $("spools-find").value.trim().toLowerCase(), b = $("spools-brand").value, nz = q.replace(/^0+(?=\d)/, "");
  const names = Object.fromEntries(chartSpools(b).map((s) => [s.num, s.name.toLowerCase()]));
  const near = spoolNear && new Set(nearestSpools(b, spoolNear));
  let first = null;
  for (const el of $("spools-grid").children) {
    const n = el.dataset.spool, show = near ? near.has(n) : !q || n.replace(/^0+(?=\d)/, "").startsWith(nz) || n.startsWith(q) || names[n].includes(q);
    el.hidden = !show; if (show && !first) first = el;
  }
  roveSpool($("spools-grid").querySelector("button:not([hidden])[tabindex='0']") || first);
  $("spools-all").hidden = !near;
  const other = UNLISTED.find((u) => q.includes(u.toLowerCase()));
  $("spools-none").hidden = !!first || !q || !!near;
  $("spools-none").textContent = other ? `${other} isn't one of the brands here: pick your spool's colour below and add it as your own ${other === "Medeira" ? "Madeira" : other} spool.`
    : `No ${BRANDS[b]} spool with that number or name. A spool from another brand: pick its colour below and add it as your own.`;
}
// (a colour picked offers to add it as their own spool, its brand from the search if one was named there: "Madeira");
// the search is cleared, as it's set aside ("Prussian" stayed in the box while the grid showed pinks)
$("spools-colour").oninput = (e) => {
  const other = UNLISTED.find((u) => $("spools-find").value.toLowerCase().includes(u.toLowerCase()));
  if (other && !$("own-brand").value.trim()) $("own-brand").value = other === "Medeira" ? "Madeira" : other;
  spoolNear = e.target.value; $("spools-find").value = ""; $("spools-own").hidden = false;
  $("own-hint").textContent = `Below: the nearest ${BRANDS[$("spools-brand").value]} spools. Tick one only if you own that spool too.`;
  spoolsFind();
};
$("own-add").onclick = () => {
  const brand = $("own-brand").value.trim().replace(/\s+/g, " "), num = $("own-num").value.trim().replace(/\s+/g, " "), hex = $("spools-colour").value.toLowerCase();
  if (!brand) { $("own-hint").textContent = "Type the brand printed on the spool first (Madeira, Gunold…)."; $("own-brand").focus(); return; }
  const o = { brand, num, hex };
  spoolsMine = [...spoolsMine.filter((x) => !(x.brand.toLowerCase() === brand.toLowerCase() && x.num === num && (num || x.hex === hex))), o];
  $("own-num").value = ""; $("own-hint").textContent = `Added your ${ownSpoolOf(o).label}. Save keeps it.`;
  spoolsPreview();
};
for (const id of ["own-brand", "own-num"]) $(id).onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); $("own-add").click(); } };
$("spools-all").onclick = () => { spoolNear = null; spoolsFind(); $("spools-colour").focus(); };
function roveSpool(el) { for (const x of $("spools-grid").querySelectorAll("[tabindex='0']")) x.tabIndex = -1; if (el) el.tabIndex = 0; }
function spoolsPreview() {
  const b = $("spools-brand").value, typed = $("spools-list").value.split(/[\s,;]+/).filter(Boolean), got = spools(b, $("spools-list").value);
  spoolsHint();
  const missing = typed.filter((t) => !spools(b, t).length), have = new Set(got);
  for (const el of $("spools-grid").children) el.setAttribute("aria-pressed", have.has(el.dataset.spool));
  const n = spoolsMine.length;
  $("spools-note").textContent = (got.length ? `${got.length} ${BRANDS[b]} ${got.length === 1 ? "spool" : "spools"} ticked.` : n ? "" : "None ticked yet.")
    + (n ? ` ${n} of your own from other brands.` : "")
    + (missing.length ? ` Not in our ${BRANDS[b]} chart: ${missing.join(", ")} (another brand's numbers? Pick that brand above, or match each spool by its colour).` : "");
  $("spools-chips").innerHTML = got.map((n) => { const s = nearestSpool(b, "#000000", [n]); return `<span><i style="background:${s.hex}"></i>${n}${s.name ? ` ${escapeHtml(s.name)}` : ""}</span>`; }).join("")
    + spoolsMine.map((o, i) => { const l = escapeHtml(ownSpoolOf(o).label); return `<span><i style="background:${o.hex}"></i>${l}<button type="button" class="x" data-unown="${i}" aria-label="Take ${l} off" title="Take it off">×</button></span>`; }).join("");
}
$("spools-grid").onclick = (e) => {
  const el = e.target.closest("[data-spool]"); if (!el) return;
  const b = $("spools-brand").value, n = el.dataset.spool, got = spools(b, $("spools-list").value);
  const next = got.includes(n) ? got.filter((x) => x !== n) : [...got, n];
  // (anything typed that isn't in the chart stays, so the note can still say so)
  const odd = $("spools-list").value.split(/[\s,;]+/).filter((t) => t && !spools(b, t).length);
  $("spools-list").value = [...next, ...odd].join(" ");
  roveSpool(el); spoolsPreview();
};
// arrow keys go between the swatches (one Tab stop for the whole chart: 391 Isacord spools)
$("spools-grid").onkeydown = (e) => {
  const el = e.target.closest("[data-spool]"); if (!el) return;
  const shown = [...$("spools-grid").children].filter((x) => !x.hidden), i = shown.indexOf(el);
  const cols = Math.max(1, shown.filter((x) => x.offsetTop === shown[0].offsetTop).length);
  const to = { ArrowLeft: i - 1, ArrowRight: i + 1, ArrowUp: i - cols, ArrowDown: i + cols, Home: 0, End: shown.length - 1 }[e.key];
  if (to == null || !shown[to]) return;
  e.preventDefault(); roveSpool(shown[to]); shown[to].focus();
};
// (typing a search goes back from colour matching to the whole chart)
$("spools-find").oninput = () => { spoolNear = null; spoolsFind(); };
// (Enter in the search box ticks the only spool left, rather than closing the dialog)
$("spools-find").onkeydown = (e) => {
  if (e.key !== "Enter") return; e.preventDefault();
  const shown = [...$("spools-grid").children].filter((x) => !x.hidden);
  if (shown.length === 1) shown[0].click(); else shown[0]?.focus();
};
$("spools-brand").onchange = () => { $("spools-list").value = (state.spools[$("spools-brand").value] || []).join(" "); $("spools-find").value = ""; spoolsGrid(); };
$("spools-list").oninput = spoolsPreview;
$("spools-chips").onclick = (e) => {
  const x = e.target.closest("[data-unown]"); if (!x) return;
  spoolsMine.splice(+x.dataset.unown, 1); spoolsPreview(); $("own-brand").focus();
};
$("spools-save").onclick = () => {
  const b = $("spools-brand").value;
  state.spools[b] = spools(b, $("spools-list").value); store.set("spools", state.spools);
  state.mine = spoolsMine; store.set("myspools", state.mine);
  state.brand = b; store.set("brand", b); $("spools").close(); brandUI(); relabel();
  if (state.mode === "picture" && state.pic.mine) makePicture();
};
$("pic-mine").onchange = (e) => { state.pic.mine = e.target.checked; store.set("pic.mine", state.pic.mine); state.pic.skip = []; state.pic.swap = {}; makePicture(); };
// the spools they own in the brand shown, in colour-card order, for the Design tab's thread swatches
function ownedSpools() {
  const own = state.brand && state.spools[state.brand];
  return state.brand ? [...(own?.length ? chartSpools(state.brand).filter((s) => own.includes(s.num)) : []), ...state.mine.map(ownSpoolOf)] : [];
}
// the owned spools' colours, for "Use only threads I own"
function ownedPalette() {
  return state.pic.mine && owns() ? ownedSpools().map((s) => s.hex) : null;
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
const sizeLabel = (v) => mmText(v);
function hoopChanged() { if (state.mode !== "picture") state.pic.req++; for (const m of ["picture", "design"]) if (m !== state.mode) state.views[m] = null; fillMachines(); refresh(); }
// (on the Design tab a hoop change is an Undo step, as a turn is: Undo puts a design back in the hoop it was in)
$("machine").onchange = (e) => { if (state.mode === "design") studio.remember(); state.machine = e.target.value; state.hoopId = null; store.set("machine", state.machine); hoopChanged(); };
$("hoop").onchange = (e) => { if (state.mode === "design") studio.remember(); state.hoopId = e.target.value; store.set("hoop", state.hoopId); hoopChanged(); };
function refresh() { if (state.mode === "picture") makePicture(); else if (state.mode === "design") studio.make(); else if (state.view) setView(state.view); }

// ---------- tabs ----------
const MODES = ["picture", "design", "open"];
function setMode(mode, push = true) {
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
  $("empty").textContent = mode === "picture" ? "Choose a picture to see it as stitches." : mode === "open" ? "Open a PES, PEC or DST file to see it here." : mode === "design" ? "Nothing to stitch yet: type some words, or pick a starting idea." : "";
  // (the file chooser in the preview too: at 960 x 540 the panel's was below the fold, under an empty hoop)
  if (mode === "open") $("empty").append(Object.assign(document.createElement("button"), { type: "button", className: "primary", textContent: "Choose a design file", onclick: () => $("open-file").click() }));
  state.zoom = 1; state.pan = [0, 0];
  if (mode === "picture" && !state.pic.bitmap) loadSample();
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

// ---------- keyboard focus that survives redraws ----------
// One mechanism for the whole page. A redraw (the editor, the piece list, a message and its one-tap fix, the steps)
// that takes away the focused control puts focus on the same control in the new markup, found by its id or data-
// attributes (in its [data-seg] group) in the nearest part of the page that's left, caret and all: typing and Enter on
// a swatch carry on. With no such control, a keyboard user's focus goes to the first control still showing there (it
// fell to the page, and the next Tab started again from the top); after a tap it's left alone (focusing the words
// box would open a phone's keyboard). Keyboard or not is the last real input, never a click's `detail`: a one-tap fix
// that called .click() looked like a key press and sent focus, and the page, 1185 px away. Right after a key press
// the focused control is kept in view as what's around it changes size, scrolling no more than that needs.
const FOCUSABLE = "button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex='0']";
let keyboard = false, keyAt = 0, held = null;
addEventListener("keydown", () => { keyboard = true; keyAt = Date.now(); }, true);
addEventListener("pointerdown", () => { keyboard = false; keyAt = 0; }, true);
const keyed = () => Date.now() - keyAt < 2000;   // (scrolling follows focus only straight after a key press)
const live = (n) => n.isConnected && n.getClientRects().length > 0 && !n.closest("[hidden], [inert]") && n.checkVisibility?.() !== false;
document.addEventListener("focusin", (e) => {
  const f = e.target; if (!(f instanceof Element)) return;
  const attrs = [...f.attributes].filter((x) => x.name.startsWith("data-")).map((x) => `[${x.name}="${CSS.escape(x.value)}"]`).join("");
  const group = f.closest("[data-seg]");
  const up = []; for (let n = f.parentElement; n && n !== document.body; n = n.parentElement) up.push(n);
  held = { el: f, up, idx: up.map((n, i) => [...n.children].indexOf(i ? up[i - 1] : f)),
    sel: attrs || f.id ? (group ? `[data-seg="${CSS.escape(group.dataset.seg)}"] ` : "") + (f.id ? `#${CSS.escape(f.id)}` : f.tagName.toLowerCase() + attrs) : null };
  // (the browser's own scrolling left a chip in the sideways-scrolling chip row out of sight, and a file chooser's
  // input is a pixel beside its label: the pixel was scrolled into view, the label stayed under the Download bar)
  if (keyed()) setTimeout(() => document.activeElement === f && inView(f.matches(".sr-file") ? f.closest("label") || document.querySelector(`label[for="${f.id}"]`) || f : f));
});
function inView(n) {
  const r = n.getBoundingClientRect(), pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) || 0;
  let clip = [0, innerHeight - pad, 0, innerWidth];
  for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p), b = p.getBoundingClientRect();
    if (/auto|scroll/.test(s.overflowY)) clip = [Math.max(clip[0], b.top), Math.min(clip[1], b.bottom), clip[2], clip[3]];
    if (/auto|scroll/.test(s.overflowX)) clip = [clip[0], clip[1], Math.max(clip[2], b.left), Math.min(clip[3], b.right)];
  }
  if (r.top < clip[0] || r.bottom > clip[1] || r.left < clip[2] - 1 || r.right > clip[3] + 1) n.scrollIntoView({ block: "nearest", inline: "nearest" });
}
function refocus(late) {
  const h = held; if (!h) return;
  const a = document.activeElement, gone = !live(h.el) || h.el.disabled;
  if (!gone) { if (a === h.el && keyed()) inView(a); return; }
  if (a && a !== document.body && a !== h.el) return;   // (focus has gone somewhere of its own accord)
  const i = h.up.findIndex(live); if (i < 0) return;
  const n = h.up[i], same = h.sel && n.querySelector(h.sel);
  let c = same && live(same) && !same.disabled ? same : null;
  if (!c && keyboard) {
    // (no such control: where it stood, once the redraw has settled; a message's words fill in a moment later)
    if (late !== true) { if (!h.later) { h.later = true; setTimeout(() => { h.later = false; if (held === h) refocus(true); }); } return; }
    c = next(n, h, i);
  }
  if (!c) return;
  const caret = "selectionStart" in h.el && "setSelectionRange" in c ? [h.el.selectionStart, h.el.selectionEnd] : null;
  c.focus({ preventScroll: true });
  if (caret) try { c.setSelectionRange(...caret); } catch {}
  if (keyed()) inView(c);
}
// the control that now stands where the lost one stood, or the first after it in reading order (the first control in
// the editor took it: a one-tap fix sent focus up to the Words box or "Centre it", the next Tab starting over)
function next(n, h, i) {
  const all = [...n.querySelectorAll(FOCUSABLE)].filter(live); if (!all.length) return null;
  // (the same place in the new markup, child by child, as far as it goes)
  let at = n, past = false;
  for (let j = i; j >= 0; j--) { const c = at.children[h.idx[j]]; if (!c) { past = j < i || h.idx[j] > 0; break; } at = c; }
  const after = (c) => past ? at.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING && !at.contains(c)
    : at === c || at.contains(c) || at.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING;
  return all.find(after) || all[all.length - 1];
}
new MutationObserver(refocus).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "disabled", "open"] });
// (redraws that check where focus is straight after can have it put back at once)
function keepFocus(root, render) { render(); refocus(); }

function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }

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

// ---------- picture ----------
// A picture worker: one job at a time, and only the newest waiting (three quick slider moves on a slow picture
// computed all three). A job that runs past a minute is stopped (a photo once routed for over 5 minutes and every later
// change queued behind it): the worker is replaced and the picture tab says what to try. `stop()` drops what's
// waiting and running (the checks of settings that just changed).
function picWorker() {
  let w = null, running = null, waiting = null, watch = 0;
  const start = () => {
    w = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    w.onmessage = (e) => finish(e.data);
    w.onerror = (e) => finish({ ok: false, error: "Something went wrong while stitching this picture. " + (e.message || "") });
  };
  const finish = (r) => { clearTimeout(watch); const j = running; running = null; j?.ok(r); next(); };
  const kill = () => { clearTimeout(watch); w.terminate(); start(); };
  const next = () => {
    if (running || !waiting) return;
    running = waiting; waiting = null; w.postMessage(running.msg);
    watch = setTimeout(() => { kill(); finish({ ok: false, code: "slow", error: "This picture is taking too long to stitch. Try fewer colours, a smaller size, or Line drawing." }); }, 60000);
  };
  start();
  return {
    run: (msg) => new Promise((ok) => { waiting?.ok({ ok: false, stale: true }); waiting = { msg, ok }; next(); }),
    stop() { waiting?.ok({ ok: false, stale: true }); waiting = null; if (running) { kill(); const j = running; running = null; j.ok({ ok: false, stale: true }); } },
  };
}
// the picture's own, and one that tries the one-tap fixes for what a picture leaves out, so they're offered only if
// they work (and the picture never waits for them)
const picJobs = picWorker(), picChecks = picWorker();
// Everything a picture's stitches depend on (the stitches are a function of these and the picture, nothing else)
function picSettings(over = {}) {
  const p = state.pic, h = hoop(), turn = !!state.turn.picture && !square();
  return { size: p.size, style: p.style, cross: p.cross, skip: p.skip, swap: p.swap, colors: p.colors, bg: p.bg, angle: p.angle, density: p.density,
    line: p.line, edge: p.edge, turn, hoop: turn ? { ...h, w: h.h, h: h.w } : h, palette: ownedPalette(), ...over };
}
// the fit each exact setting was sewn at (sewing it again gives the same file, at once)
const picFits = new Map();
// Sews the picture with settings s on worker wk: the colours and where each lies first (once per picture and colour
// count), then sized so the sewn design's longer side is s.size (sewSized). The reply, or { stale } once newer
// settings came (isStale).
async function sewPicture(s, wk, isStale = () => false) {
  const p = state.pic, bitmap = p.bitmap;
  // (the whole picture when its edge band is sewn: the content box is what differs from the edge, so it cut the band
  // down to its inner 2 px)
  const box = s.bg && !s.edge ? (p.box ||= contentBox(bitmap)) : { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height };
  const key = `${p.key}:${s.colors}:${s.bg}:${s.edge ? 1 : 0}:${box.sx},${box.sy},${box.sw},${box.sh}`, k = LEARN / Math.max(box.sw, box.sh);
  if (p.learn?.key !== key) p.learn = { key, img: pictureImage(bitmap, box, Math.max(1, Math.round(box.sw * k)), Math.max(1, Math.round(box.sh * k))) };
  const learn = p.learn.img;
  const opts = { colors: s.colors, removeBackground: s.bg, fillAngle: s.angle, density: DENSITY[s.density] || DENSITY.standard, skip: s.skip, ...(s.swap && Object.keys(s.swap).length ? { swap: s.swap } : {}), hoop: s.hoop, turn: s.turn, palette: s.palette, style: s.style, cross: s.cross, line: s.line || undefined, edge: s.edge || undefined };
  // (kept per colour count: the checks try other counts)
  if (!p.models.has(key)) {
    const m = await wk.run({ key, learn, opts });
    if (!m.ok || isStale()) return isStale() ? { stale: true } : m;
    p.models.set(key, { boxes: m.boxes, colors: m.colors });
  }
  const { boxes, colors } = p.models.get(key), sewn = boxes.filter((_, i) => !colors[i].background && !s.skip.includes(i));
  const fk = JSON.stringify([key, s.size, opts]);
  const r = await sewSized(async (pl) => {
    if (isStale()) return { ok: false, stale: true };
    const q = await wk.run({ key, ref: `${p.key}:${s.bg}:${s.edge ? 1 : 0}`, learn, img: pictureImage(bitmap, pl.crop, pl.w, pl.h), crop: pl.frac, opts });
    return isStale() ? { ok: false, stale: true } : q;
  }, (fit) => picturePlan(box, sewn, s.size, s.hoop, undefined, fit), { style: s.style, cross: s.cross, fit: picFits.get(fk) });
  if (r.stale || isStale()) return { stale: true };
  if (r.ok) picFits.set(fk, r.fit);
  return r;
}
async function makePicture() {
  const p = state.pic; if (!p.bitmap) return;
  // (nothing from another tab stays on screen, with its Download, while this picture stitches)
  if (state.mode === "picture" && state.view && state.view !== state.views.picture) setView(null);
  const req = ++p.req; busy(true, "Stitching your picture…");
  picChecks.stop(); p.fixes = [];
  const s = picSettings(), r = await sewPicture(s, picJobs, () => req !== p.req);
  if (r.stale || req !== p.req) return;
  busy(false);
  if (r.plan) sizeRange(r.plan.max);
  if (!r.ok) { state.views.picture = null; $("pic-use").hidden = $("pic-size-note").hidden = true; if (state.mode === "picture") { setView(null); pictureError(r); } return; }
  showError("");
  // (in the order they're sewn, then any left out)
  const byId = new Map(r.colors.map((c) => [c.id, c]));
  // (a line drawing's thread may be one picked for it, not the colour's own)
  p.colorsInfo = [...r.summary.map((c) => byId.has(c.id) && { ...byId.get(c.id), hex: c.hex, thread: c.thread }), ...p.skip.map((id) => byId.get(id))].filter(Boolean);
  if (p.style === "line" && !p.line) { p.autoLine = r.summary[0]?.hex || ""; lineUI(); }
  // (asked for 4, got 3: say why, instead of a slider that looks ignored)
  state.pic.merged = r.merged || 0;
  // (a band of one colour round the edge is taken as a frame and left out (`findFrame`): said, it went with no word)
  state.pic.framed = !!r.framed; if (r.framed) p.edgeSeen = true;
  state.pic.owned = r.owned || null;
  const mt = machineThreads(r.pattern.threads);
  state.pic.machineName = new Map(r.pattern.threads.map((t, i) => [t.color, mt[i].name]));
  paletteUI();
  // (sewn longer or shorter than the Size asked, past what the style can do: said why. etsy_7 in cross-stitch at 60 mm
  // sewed 52 x 10 with nothing said)
  {
    // (measured on the file, as the size chip is)
    const st = designStats(readEmbroidery(r.bytes)), got = +Math.max(st.widthMm, st.heightMm).toFixed(0), want = Math.min(s.size, p.max || s.size), tol = s.style === "cross" ? s.cross / 2 : 0.4;
    const off = Number.isFinite(got) && Math.abs(got - want) > Math.max(tol, 1);
    $("pic-size-note").hidden = !off;
    $("pic-size-note").textContent = off ? `It sews ${got} mm long, not ${want}: ${s.style === "cross" ? `cross-stitch grows ${s.cross} mm at a time, and parts too small for a cross drop out` : "parts too small to sew at this Size drop out"}, so the nearest it can be is ${got} mm.` : "";
  }
  p.fine = { ...r.fine, tries: r.tries }; p.checking = false;
  fineUI(r.fine);
  const base = safeName((state.pic.file?.name || "picture").replace(/\.[^.]+$/, ""), "picture");
  const v = { pattern: r.pattern, verifyAgainst: r.pattern, bytes: r.bytes, filename: `${base}${state.pic.style === "line" ? "_line" : state.pic.style === "cross" ? "_cross" : ""}.pes`, fabric: "linen",
    sheet: turned() ? { notes: [$("done-turn").textContent] } : undefined,
    // (what the panel says of it, as every surface says it: words.js)
    get problems() { return [...(state.pic.fineProblems || []), ...(state.pic.ownedProblem ? [state.pic.ownedProblem] : []), ...(state.pic.framed ? [{ id: "framed", level: TIP, text: FRAMED }] : [])]; },
  };
  state.views.picture = v;
  // (adding needs a design there to add to)
  $("pic-use").hidden = false; $("pic-add").hidden = $("pic-or").hidden = (() => { try { return studio.empty(); } catch { return true; } })();
  if (state.mode === "picture") setView(v);
  if (lostMuch(r.fine.kept)) checkLost(s, req);
}
// Nothing to stitch: say why, and offer only what can still be done (it said "make it bigger" at the largest size and
// "turn off background removal" with it already off)
function pictureError(r) {
  const p = state.pic, bigger = p.size < (p.max || 0), msg = [r.error];
  $("empty").textContent = "";   // (not "Choose a picture" beside the error)
  if (r.code === "cross") msg.push(p.cross > 1.5 ? (bigger ? "Try smaller crosses or a bigger Size." : "Try smaller crosses.") : bigger ? "Try a bigger Size." : "");
  else if (r.code === "small" && !bigger) msg.push("It's as big as this hoop allows.");
  showError(msg.filter(Boolean).join(" "), r.code === "small" && bigger ? { label: "Make it as big as fits", run: () => setSize(p.max) } : r.code === "skipped" ? { label: "Sew every thread", run: () => { p.skip = []; makePicture(); } } : undefined);
}
function setSize(mm) { state.pic.size = mm; $("pic-size").value = mm; $("pic-size-out").textContent = sizeLabel(mm); makePicture(); }

$("pic-merged").onclick = (e) => {
  const b = e.target.closest("[data-edge]"); if (!b) return;
  state.pic.edge = b.dataset.edge === "1"; state.pic.skip = []; state.pic.swap = {}; makePicture();
};
const FRAMED = "The band of one colour round the picture's edge looks like a frame round it, so it isn't sewn.";
function paletteUI() {
  const cols = state.pic.colorsInfo.filter((c) => !c.background && c.area > 0);
  const edge = state.pic.edge && state.pic.edgeSeen;
  $("pic-merged").hidden = !state.pic.merged && !state.pic.framed && !edge;
  // (said as what happened, not as a fault: "3 colours were too close" beside a slider at 6 read like an error)
  const asked = state.pic.colors;
  $("pic-merged").textContent = state.pic.merged ? `${asked} asked for, ${cols.length} used: this picture has only ${cols.length} ${cols.length === 1 ? "colour" : "colours"} different enough to need ${cols.length === 1 ? "a thread of its own" : "threads of their own"} (the rest are shades of ${cols.length === 1 ? "it" : "these"} or of the fabric).` : "";
  // (a guess: the band may be the drawing's own, so it can be sewn, and left out again)
  if (state.pic.framed) $("pic-merged").insertAdjacentHTML("beforeend", `${state.pic.merged ? " " : ""}<span data-problem="framed">${FRAMED} <button type="button" class="link" data-edge="1">Sew the edge band too</button></span>`);
  else if (edge) $("pic-merged").insertAdjacentHTML("beforeend", `${state.pic.merged ? " " : ""}<span>The band round the picture's edge is sewn too. <button type="button" class="link" data-edge="0">Leave it out</button></span>`);
  ownedNote();
  const open = state.pic.swapOpen;
  $("pic-palette").innerHTML = cols.map((c) => `<button type="button" data-id="${c.id}" aria-pressed="${!state.pic.skip.includes(c.id)}" aria-expanded="${c.id === open}" aria-controls="pic-swap">
    <i style="background:${c.hex}"></i><span>${threadHtml(c.hex, state.pic.machineName?.get(c.hex) || c.thread.name, "")}</span></button>`).join("");
  swapUI(cols);
}
// A colour's chip, tapped: leave it out (or sew it again), or swap its thread for one of the nearest Brother threads to
// the picture's own colour that no other colour sews (a violet logo matched Brother Magenta, the nearest by eye and
// the matcher's choice, and there was no way to sew it in Violet or Purple instead)
const swapLab = (hex) => lab(hexToRgb(hex));
function swapUI(cols = state.pic.colorsInfo.filter((c) => !c.background && c.area > 0)) {
  const p = state.pic, c = cols.find((x) => x.id === p.swapOpen), box = $("pic-swap");
  box.hidden = !c;
  if (!c) { box.innerHTML = ""; return; }
  const name = (x) => p.machineName?.get(x.hex) || x.thread.name, out = p.skip.includes(c.id);
  // (the thread it sews in now among them, pressed: picking one keeps focus on it)
  const others = new Set(cols.filter((x) => x.id !== c.id).map((x) => x.hex)), want = swapLab(c.picture || c.hex), seen = new Set();
  const near = PEC_MATCH.map((t, i) => t && pecThread(i)).filter((t) => t && !others.has(t.hex) && !seen.has(t.hex) && seen.add(t.hex))
    .map((t) => ({ t, d: Math.hypot(...swapLab(t.hex).map((v, k) => v - want[k])) })).sort((a, b) => a.d - b.d).slice(0, 6).map((x) => x.t);
  if (!near.some((t) => t.hex === c.hex)) near.splice(5, 1, { hex: c.hex, name: name(c) });
  const was = p.swap[c.id]?.was, line = p.style === "line";
  box.innerHTML = `<p class="hint"><b>${threadHtml(c.hex, name(c), " ")}</b>${out ? " is left out." : ` sews the picture's <i class="pic-own" style="background:${c.picture || c.hex}" title="The picture's colour"></i> colour.`}</p>`
    + (!out && !line ? `<div class="pic-near" role="group" aria-label="Sew it in another thread instead">${near.map((t) => `<button type="button" data-hex="${t.hex}" aria-pressed="${t.hex === c.hex}"><i style="background:${t.hex}"></i><span>${threadHtml(t.hex, t.name, "")}</span></button>`).join("")}</div>` : "")
    + `<p class="pic-swap-do"><button type="button" class="link" data-do="skip">${out ? "Sew it again" : "Leave it out"}</button>`
    + `${was && !out ? ` · <button type="button" class="link" data-do="back">Back to ${escapeHtml(was.name)}</button>` : ""}</p>`;
}
// "Use only threads I own": say which of the picture's colours share one spool, and which have none close (the
// Design tab says "quite different"; here yellow and pink sewed in one spool without a word)
function ownedNote() {
  const groups = state.pic.mine && owns() ? state.pic.owned || [] : [];
  const name = (hex) => nearestBrotherThread(hex).name.toLowerCase(), list = (a) => a.length < 3 ? a.join(" and ") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`;
  const said = [];
  for (const { hex, from } of groups) {
    const s = nearOwn(hex); if (!s) continue;
    const names = [...new Set(from.map(name))], far = from.some((c) => nearOwn(c)?.far);
    if (names.length > 1) said.push(`${list(names)} ${names.length === 2 ? "both" : "all"} sew in your ${s.label}${far ? " (quite different for some)" : ""}.`);
    else if (far) said.push(`${names[0]} sews in your ${s.label}, which is quite different.`);
  }
  const p = $("pic-owned") || Object.assign(document.createElement("p"), { id: "pic-owned", className: "hint" });
  if (!p.isConnected) $("pic-merged").after(p);
  // (one of the picture's problems: said beside Download and after too, words.js)
  const text = said.length ? `With only your threads, the picture's ${said.join(" Its ")}` : "";
  state.pic.ownedProblem = text ? { id: "owned", level: LOOK, text } : null;
  p.hidden = !said.length;
  p.innerHTML = text ? `<span data-problem="owned">${escapeHtml(text)} Add a closer spool in Threads I own, or untick “Use only threads I own”.</span>` : "";
  if (state.view && state.view === state.views.picture) warnUI(state.view);
}
$("pic-palette").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const id = +b.dataset.id;
  state.pic.swapOpen = state.pic.swapOpen === id ? null : id; paletteUI();
};
$("pic-swap").onclick = (e) => {
  const b = e.target.closest("button"), p = state.pic, id = p.swapOpen; if (!b || id == null) return;
  const c = p.colorsInfo.find((x) => x.id === id);
  if (b.dataset.hex === c?.hex) return;
  if (b.dataset.hex) {
    // (with the thread it had first, to go back to)
    const was = p.swap[id]?.was || (c && { hex: c.hex, name: p.machineName?.get(c.hex) || c.thread.name });
    p.swap = { ...p.swap, [id]: { hex: b.dataset.hex, was } };
    if (was?.hex === b.dataset.hex) delete p.swap[id];
  } else if (b.dataset.do === "back") { p.swap = { ...p.swap }; delete p.swap[id]; }
  else if (b.dataset.do === "skip") p.skip = p.skip.includes(id) ? p.skip.filter((x) => x !== id) : [...p.skip, id];
  paletteUI(); makePicture();
};
const bindRange = (id, key, fmt) => {
  $(id).value = state.pic[key]; $(id + "-out").textContent = fmt(state.pic[key]);
  let t = 0;
  $(id).addEventListener("input", (e) => {
    state.pic[key] = +e.target.value; $(id + "-out").textContent = fmt(state.pic[key]);
    if (key === "colors") { state.pic.skip = []; state.pic.swap = {}; }
    clearTimeout(t); t = setTimeout(makePicture, 250);
  });
};
bindRange("pic-colors", "colors", (v) => String(v));
bindRange("pic-size", "size", sizeLabel);
bindRange("pic-angle", "angle", (v) => `${v}°`);
bindRange("pic-cross", "cross", (v) => `${v} mm`);
// warn when parts of the picture are finer than thread can show (they'd close up or turn into a single line)
// (lines under 1 mm aren't flagged: they're sewn as lines on purpose, and the warning fired on the sample flower;
// gaps only past 1.5% of what's sewn: some always close in a detailed picture, and at 0.8 mm² it showed on every one)
// (and a line too thin to keep at all, a logo's 1 px rule, over 5% of the picture across: left out without a word before)
// (and the parts of the picture no stitch reaches, in any style (keptParts, lostMuch): etsy_7's doodles at 60 mm,
// a drawing's sun rays in cross-stitch, its 1.5 mm eye, all left out while the dialog said "Checked")
function fineUI(fine) {
  const p = state.pic, gaps = fine?.narrowMm2 >= Math.max(2, 0.015 * (fine.inkMm2 || 0)), k = fine?.kept, lost = lostMuch(k);
  let hair = fine?.lost >= 0.05;
  // (the picture's problems, said beside Download and after too: words.js)
  // (said of any picture: "like inside or between small letters" was said of drawings with no letters in them)
  const gap = "Some gaps between parts of one colour are narrower than ½ mm, so they close up once sewn.", line = "A very thin line in the picture is finer than thread and is left out.";
  let gone = "";
  if (lost) {
    // (no colour named: a thin line's learned colour is its blend with the fabric, and etsy_7's pink doodles read "warm gray")
    const why = p.style === "cross" ? `for ${p.cross} mm crosses` : `to sew at ${Math.min(p.size, p.max || p.size)} mm`;
    gone = k.lost === 1 ? `One part of the picture (${k.big.toFixed(1)} mm) is too small or too thin ${why}, so it's left out.`
      : `${k.lost} of the picture's ${k.parts} parts are too small or too thin ${why}, so they're left out.`;
  }
  // (a thin line left out is one of those parts: said once)
  if (lost) hair = false;
  markThumb(lost ? k.spots : null);
  const ringed = lost && k.spots?.length ? (k.lost > k.spots.length ? " (the biggest are ringed in your picture above)" : " (ringed in your picture above)") : "";
  p.fineProblems = [gaps && { id: "gaps", level: LOOK, text: gap }, hair && { id: "hairline", level: LOOK, text: line }, lost && { id: "lost", level: LOOK, text: gone }].filter(Boolean);
  $("pic-fine").hidden = !gaps && !hair && !lost;
  // (each fix was sewn first and keeps them: checkLost)
  const fixes = (p.fixes || []).map((f, i) => `<button type="button" class="link" data-fix="${i}">${escapeHtml(f.label)}</button>`).join(" ");
  $("pic-fine").innerHTML = [
    gaps ? `<span data-problem="gaps">${gap} ${p.size < (p.max || 0) ? "A bigger Size keeps more of them open." : "This is as big as the hoop allows."}</span>` : "",
    hair ? `<span data-problem="hairline">${line} Draw it thicker in the picture to have it sewn.</span>` : "",
    lost ? `<span data-problem="lost">${escapeHtml(gone.replace(/\.$/, ringed + "."))} ${fixes || (p.checking ? "" : k.lost === 1 ? "Draw it bigger or bolder in the picture to have it sewn." : "Draw them bigger or bolder in the picture to have them sewn.")}</span>` : "",
  ].filter(Boolean).join(" ");
  if (state.view && state.view === state.views.picture) warnUI(state.view);
}
$("pic-fine").onclick = (e) => {
  const b = e.target.closest("[data-fix]"), f = b && state.pic.fixes?.[+b.dataset.fix]; if (!f) return;
  const p = state.pic, o = f.over;
  if (o.style) { p.style = o.style; styleUI(); }
  if (o.cross) { p.cross = o.cross; $("pic-cross").value = o.cross; $("pic-cross-out").textContent = `${o.cross} mm`; }
  if (o.colors) { p.colors = o.colors; p.skip = []; p.swap = {}; $("pic-colors").value = o.colors; $("pic-colors-out").textContent = String(o.colors); }
  if (o.size) { p.size = o.size; $("pic-size").value = o.size; $("pic-size-out").textContent = sizeLabel(o.size); }
  makePicture();
};
// The one-tap fixes for what a picture leaves out: each is sewn first on the checking worker (the picture never waits
// for it) and offered only if it keeps three in four of the parts left out now (the smallest bigger Size that does,
// more thread colours, smaller crosses, another style).
// Sewn again on the picture's worker it's the same file at once (picFits).
async function checkLost(s, req) {
  const p = state.pic, stale = () => req !== p.req;
  // (the parts left out now, three in four of them kept: a bigger Size counts parts too small to count before, so
  // "nothing worth saying" never came at 174 mm for etsy_7)
  const now = new Set(p.fine.kept.ids);
  // (null: newer settings came; else { kept: three in four of them sewn, quiet: no lost note at all })
  const keeps = async (over) => {
    const r = await sewPicture({ ...s, ...over }, picChecks, stale);
    if (r.stale || stale()) return null;
    const still = r.ok ? r.fine.kept.ids.filter((i) => now.has(i)).length : now.size, kept = still <= 0.25 * now.size;
    return { kept, quiet: kept && !lostMuch(r.fine.kept), saved: now.size - still };
  };
  const offer = (label, over) => { p.fixes.push({ label, over }); fineUI(p.fine); };
  p.checking = true;
  // the smallest Size, in 5 mm steps, that keeps them (with no note left, when the biggest that fits manages that)
  if (s.size < p.max) {
    const top = await keeps({ size: p.max }); if (!top) return;
    if (top.kept) {
      const good = (q) => (top.quiet ? q.quiet : q.kept);
      let lo = s.size, hi = p.max;
      for (let i = 0; i < 3; i++) {
        const mid = Math.round((lo + hi) / 10) * 5; if (mid <= lo || mid >= hi) break;
        const q = await keeps({ size: mid }); if (!q) return;
        if (good(q)) hi = mid; else lo = mid;
      }
      offer(`Make it ${hi} mm${hi === p.max ? " (as big as fits)" : ""}`, { size: hi });
    } else if (top.saved >= Math.max(2, 0.4 * now.size)) {
      // (no Size keeps three in four, but the biggest keeps many: said with how many. etsy_7 Filled at 30-70 mm had
      // no fix offered, though a bigger Size kept most of its doodles)
      offer(`Make it ${p.max} mm (as big as fits: ${top.saved} of the ${now.size} are sewn)`, { size: p.max });
    }
  }
  // the fewest more thread colours that keep them (a pale colour sewn as fabric when threads ran short)
  if (s.colors < MOST && !s.skip.length) {
    const top = await keeps({ colors: MOST }); if (!top) return;
    for (let c = s.colors + 1; top.kept && c <= MOST; c++) {
      const q = c === MOST ? top : await keeps({ colors: c }); if (!q) return;
      if (q.kept) { offer(`Use ${c} thread colours`, { colors: c }); break; }
    }
  }
  const others = [s.style === "cross" && s.cross > 1.5 && ["Use 1.5 mm crosses", { cross: 1.5 }], s.style !== "fill" && ["Sew it Filled", { style: "fill" }],
    s.style !== "line" && ["Sew it as a line drawing (one thread)", { style: "line" }]].filter(Boolean);
  for (const [label, over] of others) { const q = await keeps(over); if (!q) return; if (q.kept) offer(label, over); }
  p.checking = false; fineUI(p.fine);
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
  $("pic-colors-label").textContent = s === "line" ? "Colours to trace" : "Thread colours";
  $("pic-line-row").hidden = s !== "line";
  lineUI();
}
// Line drawing sews one thread: the picture's darkest colour (Auto), or one of the Design tab's Brother threads, or any
// colour (sewn in its nearest Brother thread)
$("pic-line").innerHTML = `<button type="button" data-line="" class="auto">Auto</button>`
  + LINE_THREADS.map((c) => `<button type="button" data-line="${c}" style="background:${c}" title="Brother ${nearestBrotherThread(c).name}" aria-label="Brother ${nearestBrotherThread(c).name}"></button>`).join("")
  + `<span class="custom" title="Any colour"><input type="color" id="pic-line-any" value="#000000" aria-label="Any colour"></span>`;
function lineUI() {
  const p = state.pic, auto = p.autoLine || "";
  for (const b of $("pic-line").querySelectorAll("button")) b.setAttribute("aria-pressed", b.dataset.line === p.line);
  const a = $("pic-line").querySelector(".auto");
  a.style.background = auto; a.style.color = auto && lightOf(auto) < 0.55 ? "#fff" : "";
  a.title = auto ? `Auto: Brother ${nearestBrotherThread(auto).name}, the picture's darkest colour` : "Auto: the picture's darkest colour";
  a.setAttribute("aria-label", a.title);
  $("pic-line-name").textContent = p.line ? `Brother ${nearestBrotherThread(p.line).name}.` : `${auto ? `Brother ${nearestBrotherThread(auto).name}: ` : ""}the picture's darkest colour.`;
}
const lightOf = (hex) => { const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
$("pic-line").onclick = (e) => {
  const b = e.target.closest("button"); if (!b || b.dataset.line === state.pic.line) return;
  state.pic.line = b.dataset.line; lineUI(); makePicture();
};
$("pic-line-any").onchange = (e) => { state.pic.line = nearestBrotherThread(e.target.value).hex; lineUI(); makePicture(); };
$("pic-style").onclick = (e) => { const b = e.target.closest("button"); if (!b || b.dataset.s === state.pic.style) return; state.pic.style = b.dataset.s; styleUI(); makePicture(); };
styleUI();
$("pic-bg").onchange = (e) => { state.pic.bg = e.target.checked; state.pic.skip = []; state.pic.swap = {}; makePicture(); };

// first visit: show a sample so the page opens on real stitches, not an empty box
async function loadSample() {
  try {
    const blob = await (await fetch("assets/sample-flower.png")).blob();
    if (state.pic.bitmap) return;
    await loadPicture(new File([blob], "sample-flower.png", { type: "image/png" }), true);
  } catch { /* the empty state still explains what to do */ }
}

async function loadPicture(file, sample = false) {
  if (file && /\.(pes|pec|dst)$/i.test(file.name)) { openDesign(file); return; }   // (an embroidery file: open it as one)
  if (!file || !file.type.startsWith("image/")) { showError("That doesn't look like a picture. Try a PNG or JPG."); return; }
  try {
    const bitmap = await createImageBitmap(file);
    Object.assign(state.pic, { file, bitmap, box: null, key: state.pic.key + 1, skip: [], swap: {}, edge: false, edgeSeen: false, models: new Map(), autoLine: "" });
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

// Size is the longer side of what's sewn, up to the largest that fits this hoop (it measured the whole picture: a
// framed photo at "174 mm" sewed 84 x 58)
function sizeRange(max) {
  const p = state.pic; p.max = max;
  $("pic-size").max = max;
  if (p.size > max) p.size = max;
  $("pic-size").value = p.size; $("pic-size-out").textContent = sizeLabel(p.size);
}
$("pic-file").onchange = (e) => loadPicture(e.target.files[0]);

function setThumb(blob) {
  const thumb = $("pic-thumb"), p = state.pic;
  if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl);
  p.thumbUrl = thumb.src = URL.createObjectURL(blob); p.marked = ""; thumb.hidden = false;
}
// The parts of the picture left out, ringed on its thumbnail (`spots`: fractions of the copy the colours were learned
// from, keptParts); none: the plain picture again. ("A very thin line is left out" didn't say which: a child's
// dinosaur had lost its eye and nobody could see where.)
function markThumb(spots) {
  const p = state.pic, b = p.bitmap, thumb = $("pic-thumb"), key = spots?.length ? JSON.stringify([p.key, p.bg, p.edge, spots]) : "";
  if (!b || key === (p.marked || "")) return;
  p.marked = key;
  if (!key) { thumb.src = p.thumbUrl; thumb.alt = ""; return; }
  const k = Math.min(1, 480 / Math.max(b.width, b.height)), c = document.createElement("canvas"), g = c.getContext("2d");
  c.width = Math.round(b.width * k); c.height = Math.round(b.height * k);
  g.drawImage(b, 0, 0, c.width, c.height);
  const box = p.bg && !p.edge && p.box ? p.box : { sx: 0, sy: 0, sw: b.width, sh: b.height }, u = Math.max(c.width, c.height) / 90;
  for (const [x0, y0, x1, y1] of spots) {
    const X = (box.sx + ((x0 + x1) / 2) * box.sw) * k, Y = (box.sy + ((y0 + y1) / 2) * box.sh) * k;
    const r = Math.max(((x1 - x0) * box.sw * k) / 2, ((y1 - y0) * box.sh * k) / 2, u) + 1.5 * u;
    g.beginPath(); g.arc(X, Y, r, 0, 2 * Math.PI);
    g.lineWidth = 2.2 * u; g.strokeStyle = "#fff"; g.stroke(); g.lineWidth = 1.2 * u; g.strokeStyle = "#d1005a"; g.stroke();
  }
  thumb.src = c.toDataURL(); thumb.alt = "Your picture, with the parts that are left out ringed";
}
// a quarter turn clockwise; the turned picture is what gets stitched (and shown in the thumbnail)
$("pic-rotate").onclick = async () => {
  const p = state.pic, b = p.bitmap; if (!b) return;
  const c = makeCanvas(b.height, b.width), ctx = c.getContext("2d");
  ctx.translate(b.height, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(b, 0, 0);
  Object.assign(p, { bitmap: await createImageBitmap(c), box: null, key: p.key + 1, skip: [], swap: {}, edge: false, edgeSeen: false, models: new Map() });
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
    // (a design saved from Design your own opens there, as Open saved opens it: dropped, shared to the app or opened
    // here, it was "couldn't be read as an embroidery file... may be damaged")
    if (savedDesign(bytes)) { studio.openSaved(file); return; }
    // (what the file is and what's saved from it: doctor.js `openedFile`, shared with tests/open_fuzz.test.mjs)
    const o = openedFile(bytes, file.name), { d, check, need } = o;
    const base = safeName(file.name.replace(/\.[^.]+$/, ""), "design"), st = designStats(d);
    state.opened = { ...o, bytes, name: file.name, base,
      opts: { scale: 1, tiny: need.has("tiny") || need.has("same"), thin: need.has("dense"), sort: false, split: need.has("long"), satin: need.has("sparse") },
      sorted: o.tooMany ? null : sortedChanges(d, o.colourless), needed: need.size ? check.verdict : null, pick: 0, srcLong: moves(d.stitches),
      check, longer: Math.max(st.widthMm, st.heightMm), size: [st.widthMm, st.heightMm], auto: false };
    $("doctor-fix").innerHTML = ""; $("doctor-fix").hidden = state.opened.noFix; setMode("open"); openView();
  } catch (err) {
    if (!err.plain) console.error(err);
    const said = err.plain ? err.message : `${file.name} couldn't be read as an embroidery file (PES, PEC or DST). It may be damaged: try downloading it again.`;
    // The design that was open stays, named as still open (a file that wouldn't open cleared it, and the design she'd
    // been working on with it); with none, nothing is shown.
    const was = state.opened;
    if (!was) { state.views.open = null; setMode("open"); setView(null); $("open-info").hidden = true; $("doctor").hidden = true; }
    else setMode("open");
    // (a picture renamed .pes, or opened here by mistake: one tap takes it to Picture to stitches)
    const pic = err.picture && { label: "Turn it into stitches", run: async () => loadPicture(new File([await file.arrayBuffer()], file.name.replace(/\.[^.]+$/, "") + "." + err.picture.split(/[/+]/)[1], { type: err.picture })) };
    // (and a saved design to Design your own)
    const saved = err.saved && { label: "Open it in Design your own", run: () => { setMode("design"); studioLoad(file); } };
    showError(was ? `${said} ${was.name} is still open.` : said, pic || saved);
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
      // (a size meant to fit, made smaller till the re-stitched copy did: that's the size now, and nothing bigger fits)
      const o = state.opened;
      if (r.scale != null && r.scale !== o.opts.scale) { o.opts.scale = r.scale; (o.fits ||= {})[fieldKey()] = r.scale; sizeUI(); }
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
  // (a size up to the largest that fits is made to fit as it comes out: re-stitched copies come out a little bigger)
  const h = hoop(), fit = scale <= largest().scale + 1e-9 ? [h.w - 2 * MARGIN, h.h - 2 * MARGIN] : null;
  docJob({ id, d: o.fixBase || o.d, opts: { ...o.opts, join: o.colourless }, fit });
}
function showOpened(p, bytes, check, changed) {
  const o = state.opened, { scale, tiny, thin, sort, split, satin } = o.opts;
  // ("fixed" only when it passes the check: never a "_fixed" file that fails, nor "_fixed_fixed" from the dialog; and
  // only when something needed fixing: shrinking ticks Remove tiny stitches and Thin by itself, and a plain resize of
  // a file that passed read "Save fixed copy" as if it had been broken. A file that failed as it came and passes now
  // is fixed at any size: gnome.pes at 50 and 80 % was "_fixed", at 120 and 160 % not, though each split its stitch.)
  const fixes = o.repair || !!o.merged || !!o.check.verdict.length || sort || split || satin || ((tiny || thin) && !o.auto);
  const fixed = fixes && !check.verdict.length;
  // (too many thread changes to write as PES: shown from its own bytes, no download)
  if (o.stuck) bytes = o.bytes;
  const v = { pattern: p, verifyAgainst: o.stuck ? null : changed || !o.isPes ? p : null, bytes,
    // (a fixed copy has a name of its own: the plain and fixed copies of rosacea.dst were both rosacea.pes)
    filename: `${o.base}${scale !== 1 ? `_${Math.round(scale * 100)}pct` : ""}.pes`, fabric: "linen", source: o.stuck ? o.bytes : changed || !o.isPes ? null : o.bytes,
    blockLabel: "Too many thread changes",
    // (a file she already has: say what the button gives her)
    action: fixed ? "Save fixed copy" : scale !== 1 ? "Save resized copy" : o.d.format === "pes" ? "Save a copy" : "Save as PES",
    // (the checkup read the file as it will be saved: the same verdict beside Download)
    // (a file too full of thread changes to save already says so: not twice)
    // (nor the machine's other rules for a file that isn't saved: it isn't written, so there's nothing to break them)
    verdict: o.stuck ? check.verdict.filter((q) => !HARD.has(q.key)) : check.verdict,
    // (what the file card says of it, in the one list every surface shows: words.js)
    problems: [o.stuck && { id: "stuck", level: BLOCK, text: `It has ${o.stops}, more than the machine can take in one design (${MAX_BLOCKS - 1} at most), so it can't be saved for it here.` },
      o.short && { id: "short", level: LOOK, text: "This file ends early: only part of the design is in it." },
      o.damaged ? { id: "damaged", level: LOOK, text: "The file you opened looks damaged: what's shown is what the machine would sew from it, which may not be the design." }
        : o.disagree && { id: "disagree", level: LOOK, text: "The file you opened holds two different designs, one for PE-DESIGN and one for the machine: the copy saved here is the one the machine sews, so both show the same." }].filter(Boolean),
    // (the machine's name, then what the file calls it: a design made here names its threads after its pieces)
    fileNote: (b, t) => fileCalls(b.name, t.name, b.color) };
  if (fixed) v.filename = fixedName(v.filename);
  state.views.open = v; setView(v);
  // (what the checkup warns of beyond the file's verdict is the view's problem too: said beside Download and after)
  v.problems.push(...checkupWarns(check || checkup(p), v.file || p).filter((q) => !q.id.startsWith("file:")));
  warnUI(v); doctorUI(p, check);
}
// What the file calls a thread, beside the machine's name, when it adds something: not a bare number (gnome.pes's
// "24"), the machine's own name again, or a colour it isn't (ursula.pes calls its black thread "Red": the chip read
// "Brother Black · Red").
const COLOUR_WORDS = { red: "#e02020", blue: "#2040c0", green: "#20a040", yellow: "#f0d020", black: "#000000", white: "#ffffff",
  pink: "#f080b0", purple: "#7030a0", violet: "#8040c0", orange: "#f08020", brown: "#7a4a20", grey: "#808080", gray: "#808080", navy: "#1a2a6c", gold: "#d4a020" };
function fileCalls(name, machine, hex) {
  name = (name || "").trim();
  if (!name || /^\d+$/.test(name) || name.toLowerCase() === machine.toLowerCase()) return "";
  const [L, A, B] = lab(hexToRgb(hex));
  for (const w of name.toLowerCase().match(/[a-z]+/g) || []) {
    const c = COLOUR_WORDS[w]; if (!c) continue;
    const [l, a, b] = lab(hexToRgb(c));
    if (Math.hypot(l - L, a - A, b - B) > 70) return "";
  }
  return `the file calls it “${name}”`;
}
// the file card: what the file is, and whether it fits as it now stands (resized past the hoop it still said "Fits"
// in green beside "Too big", and gave the stitch count of the file as it came)
function openInfo(v, st, fits) {
  const o = state.opened, h = hoop(), d = o.d, big = largest();
  // (threads as the chips count them, one per thread the machine shows: the file's own list can name a thread twice or
  // one it never uses)
  const threads = o.colourless ? new Set(d.threads.map((t) => (t.color || "").toLowerCase())).size : v.fact.threads;
  $("open-info").hidden = false;
  $("open-info").innerHTML = `<b>${escapeHtml(o.name)}</b>
    <span title="${d.format.toUpperCase()}${pesVersion(d.version)}">${v.fact.stitches} · ${o.colourless ? `no thread colours in the file (${threads === 1 ? "shown in one colour" : `shown in ${threads} colours to tell the parts apart`})` : `${threads} thread ${threads === 1 ? "colour" : "colours"}`}</span>
    ${fits ? `<span class="good">Fits the ${h.machineName} ${h.name}.</span>`
      : `<span class="warn">Too big for the ${h.name}: it's ${v.fact.size}. ${big.scale >= 0.5 ? `<button type="button" class="link" id="doc-largest">Make it the largest that fits (${big.pct} %)</button>` : "Even at half size it won't fit this hoop."}</span>`}
    ${o.damaged ? `<span class="warn" data-problem="damaged">This file looks damaged: its parts don't agree with each other, as happens when a download or copy goes wrong. What's shown is what your machine would sew from it, which may not be the design at all. Download it again from where it came from if you can.</span>`
      : o.disagree ? `<span class="warn" data-problem="disagree">This file holds two different designs: PE-DESIGN would open one, and your machine would sew the other. The copy saved here is the one the machine sews (shown here), so both will show the same.</span>` : ""}
    ${o.short ? `<span class="warn" data-problem="short">This file ends early: it may be damaged (cut short or changed when it was downloaded or copied), so only part of the design is here. Download it again from where it came from if you can. A copy saved here is complete for the part that's left.</span>` : ""}
    ${o.stuck ? `<span class="warn" data-problem="stuck">This design has ${o.stops}. Brother machines stop ${MAX_BLOCKS - 1} times at most in one design, and sewing each thread's parts together doesn't bring it under, so it can't be saved for your machine here${o.misplaced ? " (as it is, this file would also load cut off on a Brother machine)" : ""}. Ask where it came from for a version with fewer colours.</span>` : ""}
    ${o.merged ? `<span>It had ${o.stops}, more than the machine can take in one design (${MAX_BLOCKS - 1} at most). The copy here sews each thread's parts together where nothing in between is in the way: ${o.merged[1]} thread changes, and it looks the same.</span>` : ""}
    ${o.stuck || o.damaged ? "" : hardWords(o) ? `<span class="warn">As it came, this file ${hardWords(o)}, which Brother machines don't take as it is. The copy saved here is fixed.</span>` : ""}
    ${o.stuck || o.damaged ? "" : o.misplaced && !o.short ? `<span class="warn">As it is, this file would load cut off on a Brother machine (shifted, about half shown). The download here is fixed.</span>`
      : o.isPes || o.short || hardWords(o) ? "" : `<span>You can download it as a PES file for your machine.</span>`}`;
}
// what an opened file broke of the machine's own rules, as it came (too many thread changes and two designs in one
// file say so on their own)
function hardWords(o) {
  const k = new Set((o.hard || []).map((q) => q.key));
  return [k.has("colours") && "listed the wrong number of threads for its colours", k.has("applique") && "asked for appliqué steps where it meant threads"]
    .filter(Boolean).join(" and ");
}
// the largest size that fits the hoop (field less the margin), as a scale and a whole percent, a little under so the
// re-stitched copy's rounding can't take it over. Scaled from the file, until a copy made to fit came out smaller
// (`fits`, per hoop: re-stitching grows a design a little); openView makes any size up to it fit as it comes out.
// `top`: it's the slider's 250 %, not the hoop, that stops it (a 23 x 43 mm file said "Largest that fits: 250 %").
const fieldKey = () => { const h = hoop(); return `${h.w}x${h.h}`; };
function largest() {
  const h = hoop(), [w, ht] = state.opened.size;
  // (250 % is as big as it goes: when that fits it's 250, not "249.8 %")
  const fit = Math.min((h.w - 2 * MARGIN) / w, (h.h - 2 * MARGIN) / ht), top = fit >= 2.5;
  const made = state.opened.fits?.[fieldKey()], scale = Math.min(top ? 2.5 : Math.floor(fit * 1000 - 2) / 1000, made ?? Infinity);
  return { scale, top: top && scale === 2.5, pct: Math.floor(scale * 1000) / 10, mm: Math.round(state.opened.longer * scale) };
}
// what a file failed as it came, for "As it came, this file ..."
const NEED = { dense: "was too dense in places", long: "had stitches over 12 mm", tiny: "had too many tiny stitches", same: "had stitches into the hole the needle was already in", sparse: "had satin stitches too far apart", colours: "listed the wrong number of threads" };
// What the checkup warns of, keyed as the view's problems are (words.js): the file's verdict where it has the rule
// ("file:dense", its words beside Download), else its own ("packed", said beside Download too). `html`: the checkup's
// longer words, with the fix to tick; `text`: one plain sentence for every other surface. `file`: the copy as saved.
function checkupWarns(c, file) {
  const failed = new Set((c.verdict || []).map((q) => q.key)), out = [], o = state.opened.opts;
  const per = `title="Needle hits per square millimetre in one colour, at every 0.1 mm grid offset, as the machine check counts them"`;
  const add = (key, level, text, html) => out.push({ id: failed.has(key) ? `file:${key}` : key, level, text, html });
  // (a file too full of thread changes to save says so on the file card, "stuck": not the machine's other rules, as
  // the view's verdict leaves them out for a file that isn't written)
  if (state.opened.stuck) for (const k of HARD) failed.delete(k);
  if (state.opened.noFix && !state.opened.stuck) { const t = `It has ${state.opened.stops}, more than the machine can take in one design (${MAX_BLOCKS - 1} at most), and sewing each thread's parts together doesn't bring it under, so it can't be fixed or resized here.`; add("blocks", LOOK, t, t + " Ask where it came from for a version with fewer colours."); }
  if (c.hot) add("dense", LOOK, `${c.hot} ${c.hot === 1 ? "spot is" : "spots are"} very dense: thread can break or the fabric pucker there.`,
    `${c.hot} ${c.hot === 1 ? "spot is" : "spots are"} very dense (<span ${per}>${denseWords(c.max)}</span>): thread can break or the fabric pucker there. Turn on <b>Thickness</b> under the preview to see ${c.hot === 1 ? "it" : "them"}, and tick <b>Thin the densest spots</b> below.`);
  // (a few are normal in sold designs; only many are worth a worry, and always as many as pe900_check fails: 2 %)
  if (c.tiny > Math.max(50, c.stitches * 0.01) || failed.has("tiny")) add("tiny", LOOK, `${c.tiny} ${c.tiny === 1 ? "stitch is" : "stitches are"} shorter than 0.3 mm: they pile up thread and can break it.`,
    `${c.tiny} ${c.tiny === 1 ? "stitch is" : "stitches are"} shorter than 0.3 mm. They pile up thread and can break it. Tick <b>Remove tiny stitches</b> below.`);
  if (failed.has("same")) { const t = c.verdict.find((q) => q.key === "same").text; add("same", LOOK, t, t + " Tick <b>Remove tiny stitches</b> below."); }
  if (c.satinGap && c.satinGap > 0.6) add("sparse", LOOK, "The satin stitches are far apart, so fabric may show through.",
    `The satin stitches are far apart (${c.satinGap.toFixed(2)} mm on each edge; well-made designs 0.3–0.4 mm), so fabric may show through. Tick <b>Even out the satin stitches</b> below.`);
  // (packed tighter than sold designs: stiff, and the needle can deflect or the thread shred; gnome.pes at 80 %: 0.22)
  if (c.satinGap && c.satinGap < 0.25) add("packed", LOOK, "The satin stitches are packed very close: stiff, and thread can shred or the needle break.",
    `The satin stitches are packed very close (${c.satinGap.toFixed(2)} mm on each edge; well-made designs 0.3–0.4 mm): stiff, and thread can shred or the needle break. Tick <b>Even out the satin stitches</b> below.`);
  // (the PE900 sews 12.1 mm at most: pe900_check.py fails a file with a longer one; every fixed copy splits them)
  if (c.over) add("long", LOOK, `${c.over} ${c.over === 1 ? "stitch is" : "stitches are"} longer than 12 mm, more than the machine sews in one stitch.`,
    `${c.over} ${c.over === 1 ? "stitch is" : "stitches are"} longer than 12 mm (up to ${c.longest.toFixed(1)} mm), more than the machine sews in one stitch. Tick <b>Split long stitches</b> below.`);
  // (shrinking brings moves between parts under the machine's 5 mm trim setting: they stay as thread to snip)
  const loose = shortJumps(file) - shortJumps(state.opened.d);
  if (o.scale < 1 && loose > 0) { const t = `Made smaller, ${loose} ${loose === 1 ? "move between parts is" : "moves between parts are"} too short for the machine to trim: ${loose === 1 ? "it stays" : "they stay"} as loose thread to snip after stitching.`; add("loose", TIP, t, t); }
  // (the rest of the file's verdict, said beside Download, in the checkup too)
  for (const q of c.verdict || []) if (failed.has(q.key) && !out.some((x) => x.id === `file:${q.key}`)) out.push({ id: `file:${q.key}`, level: LOOK, text: q.text, html: escapeHtml(q.text) });
  return out;
}
// what might go wrong at the machine, in plain words, with the fixes that are safe on a finished design
function doctorUI(p, check) {
  const c = check || checkup(p), o = state.opened.opts, items = [], src = state.opened.check;
  // (ok: true a tick, false a warning, "note" neither: something the saved copy takes care of)
  const say = (ok, text) => items.push(`<li class="${ok === "note" ? "note" : ok ? "good" : "warn"}">${text}</li>`);
  const per = `title="Needle hits per square millimetre in one colour, at every 0.1 mm grid offset, as the machine check counts them"`;
  // (a file written again here is written fixed: say what it failed as it came, or the list reads as if all was well)
  const need = state.opened.needed, failedNow = !!(c.verdict || []).length;
  if (need && !failedNow) say(true, `As it came, this file ${need.map((q) => NEED[q.key]).filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1")}. The fixes below are ticked, so the copy saved here passes the check.`);
  // (the copy saved here takes care of it: a note, not a warning)
  if (state.opened.fixBase) say("note", `It has ${state.opened.stops}, more than the machine can take in one design (${MAX_BLOCKS - 1} at most): a fixed or resized copy sews each thread's parts together (${state.opened.fixBase.threads.length - 1} thread changes), and looks the same.`);
  // (the warnings, keyed as the view's problems are: words.js)
  const warns = checkupWarns(c, state.views.open?.file || p);
  for (const q of warns) if (q.html) items.push(`<li class="warn" data-problem="${q.id}">${q.html}</li>`);
  if (!warns.some((q) => q.id.endsWith("dense"))) say(true, `Thickness is fine: <span ${per}>at most ${c.max} stitches in one square millimetre</span> (sold designs have 24 at most).`);
  if (!c.over && c.long) say(true, `${c.long} ${c.long === 1 ? "stitch is" : "stitches are"} longer than 10 mm. Fine on a wall hanging; on clothes they can snag.`);
  // (a copy written here has its stitches over 7 mm split by the writer: the ones over the machine's 12 mm said so)
  const srcLong = state.opened.srcLong;
  if (!c.over && srcLong?.over && !state.opened.isPes && !state.opened.stuck) say("note", `${srcLong.over} ${srcLong.over === 1 ? "stitch was" : "stitches were"} longer than 12 mm (up to ${srcLong.longest.toFixed(1)} mm), more than the machine sews in one stitch: the copy saved here splits ${srcLong.over === 1 ? "it" : "them"}.`);
  say(true, c.perSqIn > 1500 ? `Heavy stitching (about ${c.perSqIn.toLocaleString()} stitches per square inch): use cut-away stabilizer, or two layers of tear-away.`
    : c.perSqIn > 600 ? `Medium stitching: tear-away stabilizer on woven fabric, cut-away on knits.` : `Light stitching: tear-away stabilizer is enough.`);
  $("doctor").hidden = false; $("doctor-list").innerHTML = items.join("");
  // the fixes are drawn once per file (redrawing the slider mid-drag would drop it); only their state follows
  const changes = Math.max(0, state.opened.d.threads.length - 1), sorted = state.opened.sorted;
  // (satins out of 0.3-0.5 mm on each edge in the file as it came: offered at full size, done by any resize)
  const uneven = src.satinGap && (src.satinGap < 0.3 || src.satinGap > 0.5);
  // (a file with no colours of its own, DST: a colour per block, to change)
  const colours = state.opened.colourless ? `<div id="doc-colours-box"></div>` : "";
  if (!$("doc-scale")) $("doctor-fix").innerHTML = `${colours}<label class="range"><span>Size</span><input type="range" id="doc-scale" min="50" max="250" step="5" value="100"><output>100 %</output></label>
    <label class="size-mm">Longer side <input type="number" id="doc-mm" inputmode="decimal" min="${Math.ceil(state.opened.longer * 0.5)}" max="${Math.floor(state.opened.longer * 2.5)}" step="1"> mm</label>
    <p class="hint" id="doc-fit-row"><span id="doc-fit-note"></span><button type="button" class="link" id="doc-fit"></button></p>
    <p class="hint" id="doc-scale-hint"></p>
    <div id="doc-sort-row"></div>
    ${uneven ? `<label class="check small"><input type="checkbox" id="doc-satin"> Even out the satin stitches (${src.satinGap.toFixed(2)} mm apart on each edge; 0.3–0.5 mm is right)</label>` : ""}
    <label class="check small"><input type="checkbox" id="doc-tiny"> Remove tiny stitches</label>
    ${src.over ? `<label class="check small"><input type="checkbox" id="doc-split"> Split long stitches</label>` : ""}
    <label class="check small"><input type="checkbox" id="doc-thin"> Thin the densest spots <span ${per}>(to 24 stitches per square millimetre at most)</span></label>`;
  sizeUI(); coloursUI();
  // (colour sort follows the colours: picking one thread for two parts can make it worth doing; and says so when the
  // order is already as short as it gets, rather than nothing)
  const repeats = new Set(state.opened.d.threads.map((t) => (t.color || "").toLowerCase())).size <= changes;
  const why = sorted != null || !changes || state.opened.tooMany ? "" : !state.opened.colourless && !repeats ? ""
    : state.opened.colourless && !repeats ? "Give two parts the same thread and they may be sewn together, with one thread change fewer."
    : pauses(state.opened.d) && !state.opened.colourless
    ? "The thread changes stay in the file's order: some are pauses in the same thread (fabric steps), which sorting would lose."
    : `Already the fewest thread changes${state.opened.colourless ? " for these colours" : ""}: each thread's parts can't be sewn together without going over something sewn in between.`;
  const sortHtml = sorted != null ? `<label class="check small"><input type="checkbox" id="doc-sort"> Fewer thread changes (${changes} → ${sorted}): sews each thread's parts together where nothing in between is in the way</label>` : why ? `<p class="hint">${why}</p>` : "";
  const row = $("doc-sort-row");
  if (row.dataset.html !== sortHtml) { keepFocus(row, () => { row.innerHTML = sortHtml; }); row.dataset.html = sortHtml; }
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
  // the largest that fits this hoop, one tap (testers typed sizes until it fit; 250 % never fits a 5x7)
  const big = largest();
  const at = Math.abs(big.scale - o.scale) < 0.005, capped = at && state.opened.capped;
  $("doc-fit-row").hidden = big.scale < 0.5 || (at && !capped);
  $("doc-fit").hidden = at;
  // (information in the hint's colour, the action a short link: the whole line as a red link read as an error)
  $("doc-fit-note").textContent = capped ? `${capped} mm is too big for the ${hoop().name}: ${big.mm} mm is the largest that fits.`
    : big.top ? `As big as it goes here: 250 % (${big.mm} mm), and it still fits the ${hoop().name}. ` : `Largest that fits the ${hoop().name}: ${big.pct} % (${big.mm} mm). `;
  $("doc-fit").textContent = "Use this size"; $("doc-fit").setAttribute("aria-label", `Use this size: ${big.pct} %, ${big.top ? "as big as it goes" : "the largest that fits"}`);   // (the visible words first, for voice control)
  // within 80-120 % the stitches are scaled as they are; past that they're re-stitched at the new size
  $("doc-scale-hint").textContent = o.scale >= 0.8 && o.scale <= 1.2 ? "Up to 20 % either way the stitches are scaled as they are (denser smaller, more open bigger), with the satin stitches spaced evenly again."
    : "Re-stitched at the new size: fills and satin stitches stay as close together as the file had them (satin stitches packed too tight or too open come out even). Check it in the preview: lettering and fine detail can change.";
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
  if (e.target.id === "doc-scale") { s.capped = null; setScale(+e.target.value / 100); }
  else if (e.target.id === "doc-mm") {
    const mm = parseFloat(e.target.value); if (!(mm > 0)) { sizeUI(); return; }
    // (a longer side that takes the other side past the hoop stops at the largest that fits, and says so: ursula at
    // 170 mm came out 149 mm wide)
    const big = largest(), want = mm / s.longer;
    s.capped = Math.round(mm) > big.mm && big.scale >= 0.5 ? Math.round(mm) : null;
    setScale(Math.min(big.scale, Math.round(want * 1000) / 1000));
  }
  else if (e.target.dataset.any != null) { blockColour(e.target.value); return; }
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
// "Largest that fits" (beside the size, and in the file card when it's too big)
const toLargest = () => { const b = largest(); if (b.scale < 0.5) return; state.opened.capped = null; setScale(b.scale); clearTimeout(docTimer); openView(); };
$("doctor-fix").addEventListener("click", (e) => {
  if (e.target.id === "doc-fit") toLargest();
  const b = e.target.closest("[data-pick], [data-swatch]");
  if (b?.dataset.pick != null) { state.opened.pick = +b.dataset.pick; coloursUI(); }
  else if (b) blockColour(b.dataset.swatch);
});
// DST threads: the block buttons pick a part, the swatches (exact Brother threads, as the Design tab has them) or
// Any colour give it a thread. The hobbyist had only the system colour wheel.
function coloursUI() {
  const o = state.opened, box = $("doc-colours-box");
  if (!box) return;
  const i = Math.min(o.pick, o.d.threads.length - 1), t = o.d.threads[i], hex = t.color.toLowerCase();
  keepFocus(box, () => {
    box.innerHTML = `<div class="doc-colours" role="group" aria-label="Thread colours"><span>Thread colours</span>${o.d.threads.map((b, k) => `<button type="button" class="doc-blk" data-pick="${k}" aria-pressed="${k === i}" title="Colour ${k + 1}: Brother ${escapeHtml(b.name)}"><i style="background:${b.color}"></i>${k + 1}</button>`).join("")}</div>
      <div class="swatches" role="group" aria-label="Thread for colour ${i + 1}">${DST_SWATCHES.map((c) => `<button type="button" data-swatch="${c}" style="background:${c}" aria-pressed="${c === hex}" title="Brother ${nearestBrotherThread(c).name}" aria-label="Brother ${nearestBrotherThread(c).name}"></button>`).join("")}<span class="custom" title="Any colour"><input type="color" data-any value="${hex}" aria-label="Any colour"></span></div>
      <p class="hint">Colour ${i + 1}: Brother ${escapeHtml(t.name)}. The file doesn't say which threads to use: pick a part's number, then its thread. The saved PES carries the nearest Brother thread.</p>`;
  });
}
// a thread for the picked block of a file without colours: the copy is written again in it
function blockColour(hex) {
  const o = state.opened, i = o.pick;
  o.d.threads[i] = brother(hex.toLowerCase());
  o.out = writePES(o.d); o.check = checkup(readEmbroidery(o.out, "x.pes")); o.sorted = sortedChanges(o.d, true);
  if (o.sorted == null) o.opts.sort = false;
  coloursUI(); openView();
}
$("open-info").addEventListener("click", (e) => { if (e.target.id === "doc-largest") toLargest(); });
// the opened design, as it stands here (resized or fixed), into Design your own with a line of words under it
$("open-words").onclick = () => {
  const o = state.opened, v = state.views.open; if (!o || !v) return;
  studio.addWords(v.bytes && v.verifyAgainst ? readEmbroidery(v.bytes, "x.pes") : o.d, o.base);
};
// the picture's stitches, as the file has them (upright when the hoop is turned), into Design your own: added to the
// design there, or a new design of it alone. A newcomer downloaded her logo, went to Design your own, picked the Tote
// starter and added the file back with + Design file.
function usePicture(fresh) {
  const v = state.views.picture; if (!v?.bytes) return;
  const d = readEmbroidery(v.bytes, "x.pes"), name = v.filename.replace(/\.pes$/i, "");
  studio.usePicture(turned() ? turnPattern(d, false) : d, name, fresh);
}
$("pic-add").onclick = () => usePicture(false);
$("pic-new").onclick = () => usePicture(true);
// colours for files that carry none (DST): distinct exact Brother threads, then round again
const DST_SWATCHES = [...DST_COLOURS, "#f0f0f0", "#2584bb", "#b27624", "#66ba49"];
const brother = (hex) => { const t = nearestBrotherThread(hex); return { color: hex, name: t.name, brand: "Brother" }; };
$("open-file").onchange = (e) => e.target.files[0] && openDesign(e.target.files[0]);

// drag & drop / paste anywhere
function route(file) {
  if (!file) return;
  // (a design saved from Design your own, dropped on the page or shared to it: opened as Open saved opens it. It went
  // to Open a design, which said it couldn't be read as an embroidery file)
  if (/\.json$/i.test(file.name) || file.type === "application/json") { setMode("design"); studioLoad(file); return; }
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

// skip links move focus without changing the address (its #hash is the tab)
for (const a of document.querySelectorAll(".skip")) a.onclick = (e) => { e.preventDefault(); const t = $(a.hash.slice(1)); t.focus({ preventScroll: true }); t.scrollIntoView({ block: "start" }); };

// ---------- start ----------
fillMachines();
brandUI();
// ---------- design your own ----------
// Design tab: show the design as it stands after one step (null = all of it)
// a saved design file into Design your own's Open saved (its own checks and what it says)
function studioLoad(file) {
  const i = $("st-load"), dt = new DataTransfer(); dt.items.add(file); i.files = dt.files; i.dispatchEvent(new Event("change"));
}
function showStep(i) {
  if (state.step === i) return;
  state.step = i; document.dispatchEvent(new CustomEvent("nw:step", { detail: i })); paint();
}
const studio = initStudio({
  hoop: designHoop, machineHoop: hoop, turned: designTurned, fit: () => { state.zoom = 1; state.pan = [0, 0]; }, store, showError, busy, safeName, escapeHtml, handOut, keepFocus, showStep, step: () => state.step, paint: () => state.mode === "design" && paint(), setMode, toast, hideToast, threadLine, threadHtml, ownSpool, threadList, ownedSpools,
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
    state.views.design = v;
    // (painted again only when setView moved the zoom: drawing a busy design twice was ~0.2 s of every change)
    if (state.mode === "design") { const keep = [state.zoom, state.pan]; setView(v); if (state.zoom !== keep[0] || state.pan !== keep[1]) { [state.zoom, state.pan] = keep; paint(); } }
    // (the size as the size chip says it, from the file read back, for words that give the size: the too-big note
    // said 171 × 33 beside a 171 × 34 chip)
    return v.shown ? designStats(v.shown) : null;
  },
});

selBox = studio.selBox;
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
// a link to another tab on this page (#design, #open...) switches to it; #bookmark opens the Bookmark starter
addEventListener("hashchange", () => { const m = location.hash.slice(1); if (m === "bookmark" || (m !== state.mode && MODES.includes(m))) setMode(m, false); });
// for tests/surfaces.mjs: the view on screen, its problems and its share text (what every surface should agree on)
globalThis.nwTest = { view: () => state.view, names: (name, shrink) => studio.forNames()?.build(name, shrink), state: () => ({ zoom: state.zoom, pan: state.pan, step: state.step, turn: designTurned(), hoop: hoop().id, mode: state.mode }), sel: () => selBox(), problems: () => problemsOf(state.view), share: () => state.view && shareText(state.view), cut: (ext = "svg") => cutFiles(state.view, ext).map((f) => ({ ...judge(f), bytes: String(f.bytes) })), fine: () => state.pic.fine && { ...state.pic.fine, checking: state.pic.checking, fixes: state.pic.fixes?.map((f) => f.label) } };
