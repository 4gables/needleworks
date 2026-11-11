/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The Open tab: a design file opened, checked and shown, the fixes offered (sizes, colours, thinning, re-stitching
// in the doctor's worker), and where a dropped or shared file goes. (Part of app.js until 2026-11.)
import { turnPattern } from "./core/design.js";
import { designStats, readEmbroidery, writePES } from "./core/formats.js";
import { MARGIN } from "./core/machines.js";
import { hexToRgb, nearestBrotherThread } from "./core/threads.js";
import { DST_COLOURS, checkup, fix, openedFile, pauses, shortJumps, sortedChanges } from "./doctor.js";
import { HARD, MAX_BLOCKS, denseWords, moves } from "./quality.js";
import { BLOCK, LOOK, TIP } from "./words.js";
import { safeName } from "./core/typed.js";
import { apart, lab } from "./core/brands.js";
import { savedDesign } from "./studio/ui.js";
import { $, hoop, square, state, turned } from "./state.js";
import { keepFocus } from "./focus.js";
import { brandUI } from "./threadui.js";
import { loadPicture } from "./picture.js";
import { busy, escapeHtml, fillMachines, fixedName, setMode, setView, showError, studio, studioLoad, up, warnUI } from "./app.js";

// ---------- open a design ----------
function pesVersion(v) {
  const n = parseInt(v, 10);
  if (!v || Number.isNaN(n)) return "";
  return ` version ${n >= 10 ? n / 10 : n}`;   // "0060" -> 6, "0100" -> 10, "0001" -> 1
}
export async function openDesign(file) {
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
export function openInfo(v, st, fits) {
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
export function sizeUI() {
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
export function route(file) {
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
