/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Sew along (a step per screen at the machine, the screen kept awake) and the One for each name dialog: what is
// said as names are typed, and the files made. (Part of app.js until 2026-11.)
import { turnForMachine } from "./core/design.js";
import { writePES } from "./core/formats.js";
import { colorBlocks, draw } from "./render.js";
import { TURN_PIC, firstStep, stepTime, told, youHtml } from "./sheet.js";
import { handOut, judge } from "./gate.js";
import { shortJumps } from "./doctor.js";
import { problemsItems, problemsOf, shownOn, mmText } from "./words.js";
import { brief, monogramHelp, safeName, tidy, uniqueName } from "./core/typed.js";
import { apart } from "./core/brands.js";
import { $, hoop, kept, shownHoop, state, store, turned, turnedFile } from "./state.js";
import { next } from "./focus.js";
import { badReport, canvas, escapeHtml, machineThreadList, modal, stepLook, studio, threadHtml } from "./app.js";

// ---------- sew along ----------
// one step per screen at the machine: the design as it is after the step, the thread, what to do, how long it takes;
// the screen stays on while it's open
export const along = { i: 0, lock: null };
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
  along.i = 0; along.at = null; modal($("along")); alongShow();
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
export function namesFor() {
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
  renameNote(); modal($("rename")); $("rename-name").select();
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
  $("names-what").textContent = n.monogram ? `Each line's initials take the place of the monogram “${n.what}”. Everything else stays the same. ${monogramHelp("")}`
    : `Each name takes the place of “${n.what}”. Everything else stays the same.`;
  $("names-list").value = store.get(n.monogram ? "names.initials" : "names", ""); $("names-note").classList.remove("warn"); if ($("names-bad")) $("names-bad").hidden = true;
  $("names-list").placeholder = n.monogram ? "JKM\nALB\nR" : "Ashley\nLiam\nOlivia"; $("names-list").setAttribute("aria-label", n.monogram ? "Initials, one set per line" : "Names, one per line");
  { const said = namesSaid(n); $("names-note").textContent = said.text; $("names-note").classList.toggle("warn", said.warn); }
  $("names-shrink-row").hidden = false;
  $("names-thumbs").innerHTML = ""; $("names-cancel").textContent = "Cancel";
  modal($("names"));
  // (last time's list, all selected: typing replaces it. The caret at its end glued "Ava" onto "Name35")
  $("names-list").focus(); $("names-list").select();
};
// The list as Make reads it: each line tidied; a name typed twice made once; 40 at a time.
function namesTyped(text) {
  const typed = text.split("\n").map((s) => tidy(s).trim()).filter(Boolean), all = [...new Set(typed)];
  return { all, list: all.slice(0, 40), left: all.slice(40), twice: all.filter((n) => typed.indexOf(n) !== typed.lastIndexOf(n)) };
}
// What Make will do with the list, said as it's typed (round 13: names typed twice, letters the font lacks and past 40
// were said only after Make): the same checks Make makes (`refused`: the font's letters, the longest a name takes).
function namesSaid(n) {
  const one = n?.monogram ? "One set of initials per line, up to 40. You get one file for each, in a single .zip." : "One name per line, up to 40. You get one file for each, in a single .zip.";
  if (!n) return { text: one, warn: false };
  const { list, left, twice } = namesTyped($("names-list").value), no = list.map((t) => [t, n.refused(t)]).filter(([, why]) => why);
  // (names one file name apart, ignoring case: emma.pes and Emma.pes are one file on a Mac, Windows or the USB stick,
  // so the second is saved as Emma_2.pes, as Make names it)
  const used = new Set(), moved = list.filter((t) => !n.refused(t)).map((t) => [t, uniqueName(safeName(t, "name"), used)]).filter(([t, f]) => f !== safeName(t, "name"));
  const said = [twice.length ? `Typed twice, made once: ${twice.map(brief).join(", ")}.` : "",
    moved.length ? `The USB stick can't tell names apart by capitals alone, so ${moved.map(([t, f]) => `${brief(t)} is saved as ${f}.pes`).join(", ")}.` : "",
    no.length ? `Can't be made: ${no.map(([t, why]) => `${brief(t)} (${why})`).join(", ")}.` : "",
    left.length ? `Past 40, left out: ${left.map(brief).join(", ")}. Make them in a second batch.` : ""].filter(Boolean);
  if (!said.length) return { text: one, warn: false };
  const made = list.length - no.length;
  return { text: `${made} ${made === 1 ? "file" : "files"} to make. ${said.join(" ")}`, warn: true };
}
// (the last run's result goes once the list is changed: it described names no longer there)
$("names-list").addEventListener("input", () => {
  const n = namesFor(); $("names-thumbs").innerHTML = ""; if ($("names-bad")) $("names-bad").hidden = true;
  const said = namesSaid(n);
  $("names-note").textContent = said.text; $("names-note").classList.toggle("warn", said.warn);
  $("names-cancel").textContent = "Cancel";
});
let smallerOk = false;   // (the turn was offered and they chose to make them smaller anyway)
$("names-make").onclick = async () => {
  const n = namesFor(); if (!n) return;
  // (past 40, the rest are said as left out: the 41st was dropped without a word)
  // (a name typed twice is made once, and said: "Ola" twice left one file with nothing said)
  const { all, list, left, twice } = namesTyped($("names-list").value);
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
  // (and its loose threads, as the design's chip says them: Björk's 2 and Zoe's 1 were said nowhere)
  const notes = (m) => { const k = shortJumps(m.pattern); return [m.smaller ? `smaller, ${m.pct} %` : "", m.lines ? "on two lines" : "", m.sideways ? "hoop turned" : "", m.runs ? `runs into ${m.runs}` : "", k ? `${k} loose ${k === 1 ? "thread" : "threads"} to snip after` : ""].filter(Boolean).join(", "); };
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
