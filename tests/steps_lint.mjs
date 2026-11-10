// Class guarded: the words that guide someone through a project contradict themselves or repeat (round 9: the turned
// hoop's note said "Hoop the fabric a quarter turn round" beside step 1's "Hoop tear-away stabilizer on its own";
// "Sews the monogram J. Sews the monogram J." with two key fobs in the hoop; "2 of everything" doubled the
// stabilizer; step 2 ended "put the hoop back" and step 3 began "Take the hoop off"; a starter's tip gave other fabric
// sizes than Have ready; the steps never said a Cutter-file piece needs no trimming; the time left out trims).
// For every starter, its in-the-hoop projects made twice (Make another in the hoop) and turned, it reads the steps,
// Have ready, the hooping note, the tip and the time, and checks:
//  - no sentence twice in one step, no Have ready line twice;
//  - no "put the hoop back" straight before "Take the hoop off";
//  - a turned hoop whose step 1 hoops bare stabilizer never says "Hoop the fabric"; the note is the same in the steps,
//    the sew sheet's notes and the download dialog;
//  - a tip's sizes are Have ready's (no "Have ready:" of its own);
//  - several in the hoop: no "of everything", fabric "for each" or one piece "to cover" them;
//  - a design with a cut file says so in Have ready and in the step that lays the fabric;
//  - the time is stitches / 550 + 6 s a trim + half a minute a pause;
// then the download dialog (turned bookmark: its note, the Cutter file line, the How to stitch it link opening the
// steps) and Open > Add words after a felt starter (the fabric goes back to cotton).
// usage: node tests/cdp.mjs PORT start DIR; serve the site (tests/batch_server.py out/batch HTTP); then
//        node tests/steps_lint.mjs PORT http://127.0.0.1:HTTP [starter,...]
// ~3 minutes; one line per case, "DONE <cases> <problems>"; exit code 1 on any problem.
import path from "node:path";
import { fileURLToPath } from "node:url";

const [port, base, only] = process.argv.slice(2);
if (!port || !base) { console.log("usage: node tests/steps_lint.mjs CDP_PORT BASE_URL [starters]"); process.exit(2); }
const here = path.dirname(fileURLToPath(import.meta.url));
const ctl = `http://127.0.0.1:${+port + 100}/`;
const call = async (cmd, ...args) => (await (await fetch(ctl, { method: "POST", body: JSON.stringify({ cmd, args }) })).text()).trim();
const ev = async (js) => {
  const t = await call("eval", js);
  if (t.startsWith("ERROR")) throw new Error(t);
  return t === "undefined" || t === "" ? undefined : JSON.parse(t);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(hash) {
  for (let i = 0; i < 8; i++) {
    await call("goto", `${base}/?v=l${Date.now()}${i}${hash}`);
    for (let k = 0; k < 30; k++) { await sleep(300); if (await ev("document.body.dataset.mode && typeof nwTest === 'object' ? 1 : 0").catch(() => 0)) return; }
  }
  throw new Error("the page didn't start");
}
// the design settled: a view with steps, nothing still being worked out
async function settle() {
  await sleep(500);
  for (let k = 0; k < 80; k++) { await sleep(250); if (await ev(`(() => { const v = nwTest.view(); return v && !v.block && v.sheet ? 1 : 0 })()`).catch(() => 0)) break; }
  await sleep(300);
}
// what the view says, with the facts' time and the file's counts
const READ = `(async () => {
  const v = nwTest.view(); if (!v || !v.sheet) return null;
  const { shortJumps } = await import("/js/doctor.js");
  const n = (c) => v.file.stitches.filter((e) => e[2] === c).length;
  const tip = document.getElementById("st-tip");
  return { steps: v.sheet.steps, ready: v.sheet.ready || [], after: v.sheet.after || [], notes: v.sheet.notes || [], cut: (v.sheet.cut || []).length,
    turnNote: document.querySelector("#st-steps .turned")?.textContent || "", bare: /no fabric yet/.test(v.sheet.steps[0]?.you || ""), tip: tip.hidden ? "" : tip.textContent,
    min: +((document.getElementById("facts").textContent.match(/≈ (\\d+) min/) || [])[1]),
    stitches: n(0), trims: n(2), stops: n(5), snips: shortJumps(v.file),
    frames: document.querySelectorAll("#st-pieces .pick").length };
})()`;
const sentences = (t) => String(t || "").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
const SIZE = /\d+(?:\.\d+)?\s?(?:in|cm)\b/g;

const problems = [];
let cases = 0;
function lint(name, d, gang) {
  cases++;
  const bad = [];
  if (!d) { problems.push(`${name}: no design`); console.log(`${name}: no design`); return; }
  d.steps.forEach((st, i) => {
    for (const [what, t] of [["sews", st.sews], ["you", st.you]]) {
      const seen = new Set();
      for (const s of sentences(t)) { if (seen.has(s)) bad.push(`step ${i + 1} ${what} says twice: "${s}"`); seen.add(s); }
    }
    const next = d.steps[i + 1];
    if (next && /put the hoop back\.$/.test(st.you || "") && /^(Change to [^.]*\. )?Take the hoop off/.test(next.you || ""))
      bad.push(`step ${i + 1} puts the hoop back, step ${i + 2} takes it off`);
    if (/covering (it|them|the \w+) by/.test(st.you || "")) bad.push(`step ${i + 1}: "covering it by ½ in" (unclear)`);
  });
  if (new Set(d.ready).size !== d.ready.length) bad.push("Have ready lists a line twice");
  const ready = d.ready.join(" ");
  if (d.turnNote) {
    if (/no fabric yet/.test(d.steps[0]?.you || "") && /Hoop the fabric/.test(d.turnNote)) bad.push(`turned note "Hoop the fabric" vs step 1 bare stabilizer`);
    if (d.notes[0] !== d.turnNote) bad.push("sew sheet's turned note differs from the steps'");
  }
  if (d.tip) {
    if (/Have ready/.test(d.tip) && /:/.test(d.tip.split("Have ready")[1] || "")) bad.push("tip lists its own Have ready");
    for (const m of d.tip.matchAll(SIZE)) {
      if (/^\s*(down from|embroidery hoop)/.test(d.tip.slice(m.index + m[0].length))) continue;   // (where it goes, not a supply)
      if (!ready.includes(m[0])) bad.push(`tip's size "${m[0]}" isn't Have ready's`);
    }
  }
  if (gang) {
    if (/of everything/.test(ready)) bad.push(`several in the hoop: "of everything"`);
    if (!/for each/.test(ready) || !/to cover/.test(ready)) bad.push("several in the hoop: Have ready doesn't say fabric for each or one piece to cover them");
  }
  if (d.cut) {
    if (!/Cutter file/.test(ready)) bad.push("cut file, Have ready doesn't say");
    if (!d.steps.some((st) => /Cutter file/.test(st.you || ""))) bad.push("cut file, no step says to lay a cut piece");
  }
  const want = Math.max(1, Math.round(d.stitches / 550 + Math.max(0, d.trims - d.snips) / 10 + d.stops / 2));
  if (d.min !== want) bad.push(`time ${d.min} min, want ${want} (${d.stitches} stitches, ${d.trims - d.snips} trims, ${d.stops} pauses)`);
  for (const b of bad) problems.push(`${name}: ${b}`);
  console.log(`${name}: ${bad.length ? bad.join("; ") : "ok"}`);
}

await open("#design");
const ids = await ev(`[...document.querySelectorAll('[data-start]')].map((b) => b.dataset.start)`);
for (const id of ids) {
  if (only && !only.split(",").includes(id)) continue;
  await ev(`document.querySelector('[data-start="${id}"]').click(), 1`); await settle();
  const d = await ev(READ);
  lint(id, d, false);
  // turned too, where step 1 hoops bare stabilizer and the starter isn't already
  if (d && d.bare && !d.turnNote) {
    await ev(`document.getElementById("turn").click(), 1`); await settle();
    const t = await ev(READ);
    if (t?.turnNote) lint(`${id} turned`, t, false);
    await ev(`document.getElementById("turn").click(), 1`); await settle();
  }
  // two in the hoop
  await ev(`document.querySelector('#st-pieces .pick').click(), 1`); await sleep(400);
  if (await ev(`(() => { const b = document.querySelector('[data-two-up]'); if (!b) return 0; b.click(); return 1 })()`)) {
    await settle();
    const g = await ev(READ);
    if (g && g.frames > d.frames) lint(`${id} x2`, g, true);
  }
}

if (!only) {
  // the download dialog, for the turned bookmark: its hooping note, the Cutter file line, the link to the steps
  cases++;
  await ev(`document.querySelector('[data-start="bookmark"]').click(), 1`); await settle();
  await ev(`localStorage.removeItem("nw:doneSeen"), document.getElementById("download").click(), 1`); await sleep(1500);
  const dl = await ev(`(() => ({ open: document.getElementById("done").open, turn: document.getElementById("done-turn").textContent, turnShown: !document.getElementById("done-turn").hidden,
    cut: document.getElementById("done-cut")?.hidden === false, link: !!document.querySelector("#done [data-steps-link]"), note: document.querySelector("#st-steps .turned")?.textContent }))()`);
  const bad = [];
  if (!dl.open) bad.push("the dialog didn't open");
  else {
    if (!dl.turnShown || dl.turn !== dl.note) bad.push(`dialog's turned note "${dl.turn.slice(0, 60)}…" isn't the steps'`);
    if (!dl.cut) bad.push("dialog doesn't mention the Cutter file");
    if (!dl.link) bad.push("dialog's How to stitch it isn't a link");
    else {
      await ev(`document.querySelector("#done [data-steps-link]").click(), 1`); await sleep(800);
      const after = await ev(`(() => { const d = document.getElementById("st-steps").closest("details"), r = d.getBoundingClientRect(); return { closed: !document.getElementById("done").open, open: d.open, focus: document.activeElement === d.querySelector("summary"), top: r.top, h: innerHeight } })()`);
      if (!after.closed || !after.open || !after.focus || after.top < -1 || after.top > after.h) bad.push(`How to stitch it link: ${JSON.stringify(after)}`);
    }
  }
  for (const b of bad) problems.push(`download dialog: ${b}`);
  console.log(`download dialog: ${bad.length ? bad.join("; ") : "ok"}`);

  // Open > Add words after a felt starter: a new design, on cotton
  cases++;
  await ev(`document.querySelector('[data-start="stocking"]').click(), 1`); await settle();
  await open("#open");
  await call("upload", "#open-file", path.join(here, "fixtures/multi.pes"));
  for (let k = 0; k < 40 && !(await ev(`document.getElementById("open-words")?.offsetParent ? 1 : 0`).catch(() => 0)); k++) await sleep(250);
  await ev(`document.getElementById("open-words").click(), 1`); await settle();
  const w = await ev(READ), felt = w ? /felt/i.test(w.steps[0]?.you || "") : true;
  if (felt) problems.push("Add words: kept the last starter's felt");
  console.log(`add words: ${felt ? "kept the last starter's felt" : "ok"}`);
}
console.log(`DONE ${cases} ${problems.length}`);
process.exit(problems.length ? 1 : 0);
