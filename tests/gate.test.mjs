// Class guarded: a file the app hands out that fails a machine or quality rule (category audit class 7). Every file
// that leaves the page goes through js/gate.js `handOut` (validatePES + quality.js verdict + HARD rules); this test
// fails when (1) any other file starts a download or a share (anchor download, navigator.share, object URLs, save
// pickers...), (2) the list of exits changes without this file being updated (each exit is named below: a new one
// is added here on purpose, after making sure it goes through handOut), or (3) the gate itself lets through a file
// that doesn't read back, breaks a HARD rule, or a zip with one such member. Run: node tests/gate.test.mjs (< 1 s, CI).
import { readFileSync, readdirSync } from "fs";
import { COLOR_CHANGE, END, STITCH, readEmbroidery, writePES } from "../js/core/formats.js";
import { handOut, judge } from "../js/gate.js";
import { readBack, validateOut } from "../js/core/formats-out.js";
import { cutDXF, cutName, cutSVG } from "../js/sheet.js";

let bad = 0, n = 0;
const fail = (m) => { bad++; console.error("FAIL " + m); };
const ok = (c, m) => { n++; if (!c) fail(m); };

// ---- 1. nothing else hands a file over ----
const files = ["index.html", "sw.js", ...["js", "js/core", "js/studio"].flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".js")).map((f) => `${d}/${f}`))];
const EXIT = [/navigator\.share\s*\(/, /\.download\s*=/, /<a\b[^>]*\sdownload\b/, /setAttribute\(\s*["']download/, /showSaveFilePicker/, /msSaveOrOpenBlob/, /saveAs\s*\(/,
  /createObjectURL\s*\(/, /window\.open\s*\(/, /location(\.href)?\s*=\s*[^=]*(blob:|data:)/, /from\s+["'][./]*zip\.js["']/];
// (what may match, and why: not a way out)
const ALLOWED = [
  ["js/picture.js", "thumb.src = URL.createObjectURL(blob)", "the chosen picture's thumbnail, shown on the page"],
];
const code = (line) => line.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/ .*$/, "");
for (const f of files.filter((f) => f !== "js/gate.js")) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    for (const re of EXIT) if (re.test(code(line)) && !ALLOWED.some(([af, s]) => af === f && line.includes(s))) fail(`${f}:${i + 1} hands a file over outside js/gate.js: ${line.trim().slice(0, 120)}`);
  });
  n++;
}
// ---- 2. the exits, by name: each one calls handOut ----
const EXITS = {
  "js/app.js": ["Share (the phone's share sheet)", "Download (one file, or a design in two hoopings as a zip)", "Save a fixed copy (one file)",
    "Save fixed copies (the zip again)", "Cut files (fabric shapes, SVG or DXF, one handOut for both)"],
  "js/along.js": ["One for each name (zip)"],
  "js/studio/ui.js": ["Save design (.needleworks.json)"],
};
for (const [f, want] of Object.entries(EXITS)) {
  const got = readFileSync(f, "utf8").split("\n").map(code).join("\n").match(/\bhandOut\s*\(/g)?.length || 0;
  ok(got === want.length, `${f} calls handOut ${got} times, this test lists ${want.length} exits (${want.join("; ")}): name the new exit here`);
}

// ---- 3. the gate itself ----
globalThis.document = { createElement: () => ({ click() { saved.push(this.download); }, remove() {} }), body: { append() {} } };
let saved = [], shared = [];
let blob = null;
URL.createObjectURL = (b) => { blob = b; return "blob:x"; }; URL.revokeObjectURL = () => {};
Object.defineProperty(globalThis, "navigator", { value: { share: async (d) => { shared.push(d.files[0].name); } }, configurable: true });
const hoop = { w: 130, h: 180, name: "5x7" };
const square = (x0, n = 40) => Array.from({ length: n }, (_, i) => [x0 + (i % 2) * 20, i * 4, STITCH]);
const design = (blocks, threads = blocks) => {
  const st = [];
  for (let b = 0; b < blocks; b++) { if (b) st.push([0, b * 4, COLOR_CHANGE]); st.push(...square(b % 3)); }
  st.push([0, 0, END]);
  return { stitches: st, threads: Array.from({ length: threads }, (_, i) => ({ color: ["#ed171f", "#0e1f7c", "#00673e"][i % 3] })) };
};
const good = design(2), goodBytes = writePES(good);
const golden = readdirSync("tests/fixtures/golden").filter((f) => f.endsWith(".pes")).map((f) => ({ name: f, bytes: new Uint8Array(readFileSync(`tests/fixtures/golden/${f}`)) }));
for (const g of golden) ok(judge(g).ok, `golden ${g.name} refused: ${judge(g).error}`);
ok(judge({ name: "a.pes", bytes: goodBytes, against: good }, hoop).ok, "a good file refused");
// doesn't read back as the design it was written from
ok(!judge({ name: "a.pes", bytes: goodBytes, against: design(3) }, hoop).ok, "a file that isn't its design passed");
ok(!judge({ name: "a.pes", bytes: goodBytes.slice(0, 600) }).ok, "a cut-short file passed");
// HARD: a thread list that isn't one per colour (the writer lists every thread it's given)
const twoForOne = design(1, 2), extra = judge({ name: "b.pes", bytes: writePES(twoForOne) });
ok(!extra.ok && extra.hard.some((q) => q.key === "colours"), "two threads for one colour passed");
// HARD: more thread changes than the machine takes
const many = design(110), lots = judge({ name: "c.pes", bytes: writePES(many), against: many });
ok(!lots.ok && lots.hard.some((q) => q.key === "blocks"), "110 colours passed");
// HARD: appliqué codes (PEC 62-64) for threads: the palette byte flipped to 62
{
  const b = goodBytes.slice(), pec = b[8] | (b[9] << 8) | (b[10] << 16);
  b[pec + 49] = 62;
  const j = judge({ name: "d.pes", bytes: b });
  ok(readEmbroidery(b, "d.pes").pec.includes(62) && !j.ok && j.hard.some((q) => q.key === "applique"), "appliqué codes for threads passed");
}
// nothing handed over when one file is refused; everything when all pass
saved = [];
let r = handOut([{ name: "a.pes", bytes: goodBytes, against: good }, { name: "c.pes", bytes: writePES(many), against: many }], { hoop, zip: "x.zip" });
ok(!r.ok && !saved.length, "a zip with a refused member was saved");
r = handOut([{ name: "a.pes", bytes: goodBytes, against: good }, { name: "e.pes", bytes: goodBytes, against: good }], { hoop, zip: "x.zip" });
ok(r.ok && saved.length === 1 && saved[0] === "x.zip", "a good zip wasn't saved");
r = handOut([{ name: "b.pes", bytes: writePES(twoForOne) }], { share: { title: "b", text: "" } });
ok(!r.ok && !shared.length && !r.shared, "a refused file was shared");
r = handOut([{ name: "a.pes", bytes: goodBytes, against: good }], { hoop, share: { title: "a", text: "" } });
await r.shared;
ok(r.ok && shared[0] === "a.pes", "a good file wasn't shared");
// the cut file: closed shapes at a real size; a saved design: pieces
const loop = [[0, 0], [30, 0], [30, 20], [0, 20]];
ok(judge({ name: "x_cut.svg", bytes: cutSVG([[loop]], "x") }).ok, "a good cut file refused");
ok(!judge({ name: "x_cut.svg", bytes: cutSVG([[loop.map(([x, y]) => [x, y * NaN])]], "x") }).ok, "a cut file with NaN passed");
ok(!judge({ name: "x_cut.svg", bytes: cutSVG([[[[0, 0], [1, 1]]]], "x") }).ok, "a cut file with a 2-point shape passed");
// the DXF cut file (Silhouette's free edition): the same checks
ok(judge({ name: "x_cut.dxf", bytes: cutDXF([[loop], [loop.map(([x, y]) => [x + 40, y])]]) }).ok, "a good DXF cut file refused");
ok(!judge({ name: "x_cut.dxf", bytes: cutDXF([[loop.map(([x, y]) => [x, y * NaN])]]) }).ok, "a DXF cut file with NaN passed");
ok(!judge({ name: "x_cut.dxf", bytes: cutDXF([[[[0, 0], [1, 1]]]]) }).ok, "a DXF cut file with a 2-point shape passed");
ok(!judge({ name: "x_cut.dxf", bytes: cutDXF([[loop]]).replace("70\r\n1\r\n10", "70\r\n0\r\n10") }).ok, "a DXF cut file with an open shape passed");
ok(!judge({ name: "x_cut.dxf", bytes: cutDXF([[loop]]).slice(0, 200) }).ok, "a cut-short DXF cut file passed");
// the size in a cut file's name is its shapes' size, and the SVG's page is too (MOM_cut_52x165mm.svg opened as 56 x
// 169.2 mm: the shapes plus a 2 mm margin)
const two = [[loop], [loop.map(([x, y]) => [x + 40, y + 5])]];
for (const ext of ["svg", "dxf"]) {
  const make = ext === "svg" ? cutSVG : cutDXF, name = cutName("x", two, ext);
  ok(name === `x_cut_70x25mm.${ext}` && judge({ name, bytes: make(two, "x") }).ok, `a ${ext} cut file named by its size refused (${name})`);
  ok(!judge({ name: `x_cut_74x29mm.${ext}`, bytes: make(two, "x") }).ok, `a ${ext} cut file bigger in its name than its shapes passed`);
}
ok(!judge({ name: "x_cut.svg", bytes: cutSVG([[loop]], "x").replace('width="30mm" height="20mm"', 'width="34mm" height="24mm"') }).ok, "an SVG cut file with a margin round its shapes passed");
ok(judge({ name: "d.needleworks.json", bytes: JSON.stringify({ needleworks: 1, pieces: [{ kind: "text", text: "Emma" }] }) }).ok, "a saved design refused");
ok(!judge({ name: "d.needleworks.json", bytes: "{" }).ok && !judge({ name: "d.needleworks.json", bytes: '{"needleworks":1,"pieces":[]}' }).ok, "a broken saved design passed");
ok(!judge({ name: "x.exe", bytes: new Uint8Array(10) }).ok, "an unknown file passed");
// other machines' files (DST, EXP, VP3): the PES judged as ever, then the file written from the same pattern and read
// back; the name and bytes are the format's, the PES kept for a fixed copy; anything the PES fails is refused too
for (const fmt of ["dst", "exp", "vp3"]) {
  saved = [];
  const j = judge({ name: "a." + fmt, bytes: goodBytes, against: good }, hoop, fmt);
  ok(j.ok && j.name === "a." + fmt && j.pes === goodBytes && validateOut(j.bytes, fmt, good).ok && readBack(j.bytes, fmt).changes === 1, `${fmt}: a good file refused or not written`);
  r = handOut([{ name: "a.pes", bytes: goodBytes, against: good }], { hoop, format: fmt });
  const kept = new Uint8Array(await blob.arrayBuffer());
  ok(r.ok && saved[0] === "a." + fmt && kept.length === r.files[0].bytes.length && kept.every((v, i) => v === r.files[0].bytes[i]) && validateOut(kept, fmt, good).ok, `${fmt}: a good file wasn't saved as a .${fmt} file (${saved})`);
  r = handOut([{ name: "a.pes", bytes: goodBytes, against: good }, { name: "a_2.pes", bytes: goodBytes, against: good }], { hoop, zip: "x.zip", format: fmt });
  const z = new Uint8Array(await blob.arrayBuffer()), at = (s) => { const t = new TextEncoder().encode(s); return z.findIndex((_, i) => t.every((v, k) => z[i + k] === v)); };
  ok(r.ok && saved.at(-1) === "x.zip" && r.files.every((f) => f.name.endsWith("." + fmt)) && at("a." + fmt) >= 0 && at("a.pes") < 0, `${fmt}: a zip of good files wasn't saved as .${fmt} files`);
  // (the share sheet gets the format's file too)
  shared = [];
  r = handOut([{ name: "a.pes", bytes: goodBytes, against: good }], { hoop, format: fmt, share: { title: "a", text: "" } });
  await r.shared;
  ok(r.ok && shared[0] === "a." + fmt, `${fmt}: shared as ${shared[0]}`);
  saved = [];
  r = handOut([{ name: "c.pes", bytes: writePES(many), against: many }], { hoop, format: fmt });
  ok(!r.ok && !saved.length && r.files[0].hard.some((q) => q.key === "blocks"), `${fmt}: 110 colours passed`);
  ok(!judge({ name: "a.pes", bytes: goodBytes, against: design(3) }, hoop, fmt).ok, `${fmt}: a file that isn't its design passed`);
  // an opened file has no pattern beside it: written from the PES itself
  const opened = judge({ name: "o.pes", bytes: goodBytes }, hoop, fmt);
  ok(opened.ok && opened.name === "o." + fmt && validateOut(opened.bytes, fmt, readEmbroidery(goodBytes, "o.pes")).ok, `${fmt}: an opened file wasn't written`);
}

console.log(`gate: ${n} checks, ${bad} failed`);
process.exit(bad ? 1 : 0);
