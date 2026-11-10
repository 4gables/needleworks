// Class guarded: a problem the app knows about is said on one surface and not another, or in different words per
// surface or tab (round 8: a fleece name that closes up was said only in the editor while the download dialog said
// "Checked"; round 7: a thin line only in the editor; the checkup described the pattern, not the file; "pause" /
// "stop" / "thread change" worded differently per tab; chips not in sewing order).
// It builds designs with known problems on every tab (Design your own from saved pieces, Picture from drawn images,
// Open a design from crafted PES files, the bookmark), then reads every surface: the editor (each piece selected in
// turn; the Picture tab's notes; the Open tab's file card and checkup), the note beside Download, the download dialog,
// "How to stitch it", the sew sheet, the share text and Sew along. Each must show exactly the view's problems
// (js/words.js `problemsOf`, filtered by `SHOWS` for that surface), every warning in the editor must belong to one, the
// stop counts and thread names must agree between the chips, the steps, the sew sheet, Sew along and the dialog, and
// a lint over all the text a user reads fails on jargon (underlay, "the pile", PEC, jumps, stops, colour blocks, satin
// on its own...).
// usage: node tests/cdp.mjs PORT start DIR; serve the site (tests/batch_server.py out/batch HTTP); then
//        node tests/surfaces.mjs PORT http://127.0.0.1:HTTP [case-filter]
// ~12 minutes (76 cases); prints one line per case and "DONE <cases> <problems>"; exit code 1 when anything disagrees.
import { writePES } from "../js/core/formats.js";

const [port, base, only] = process.argv.slice(2);
if (!port || !base) { console.log("usage: node tests/surfaces.mjs CDP_PORT BASE_URL [filter]"); process.exit(2); }
const ctl = `http://127.0.0.1:${+port + 100}/`;
const call = async (cmd, ...args) => (await (await fetch(ctl, { method: "POST", body: JSON.stringify({ cmd, args }) })).text()).trim();
const ev = async (js) => {
  const t = await call("eval", js);
  if (t.startsWith("ERROR")) throw new Error(t);
  return t === "undefined" || t === "" ? undefined : JSON.parse(t);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ver = 0;
// load a tab with a fresh module cache; the local server sometimes drops a module request and the page never starts
async function open(hash, before = "") {
  for (let i = 0; i < 8; i++) {
    if (before) { await call("goto", `${base}/manifest.webmanifest`); await ev(`(() => { ${before}; return 1; })()`).catch(() => 0); }
    await call("goto", `${base}/?v=s${Date.now()}${ver++}${hash}`);
    for (let k = 0; k < 30; k++) { await sleep(300); if (await ev("document.body.dataset.mode && typeof nwTest === 'object' ? 1 : 0").catch(() => 0)) return; }
    if (i > 2) await sleep(2000);   // (give a busy server a moment)
  }
  throw new Error("the page didn't start");
}

// ---------- cases ----------
let id = 0;
const T = (text, size, o = {}) => ({ id: ++id, kind: "text", text, size, font: "NW Great Vibes", x: 0, y: 0, color: "#0e1f7c", ...o });
const M = (motif, size, o = {}) => ({ id: ++id, kind: "motif", motif, size, x: 0, y: 0, color: "#b3133a", style: "fill", ...o });
const F = (shape, w, h, border, o = {}) => ({ id: ++id, kind: "frame", shape, w, h, border, x: 0, y: 0, color: "#0e1f7c", ...o });
const Mono = (letters, size, o = {}) => ({ id: ++id, kind: "monogram", letters, size, font: "NW Great Vibes", x: 0, y: 0, color: "#0e1f7c", ...o });
const design = (name, pieces, o = {}) => ({ name, tab: "design", setup: { pieces, sel: pieces.at(-1)?.id ?? null, fabric: o.fabric || "cotton", thread: o.thread || "auto" }, hoop: o.hoop || "5x7", turn: !!o.turn });
const PRINT = "NW Josefin Sans", ROUND = "NW Quicksand";
const CASES = [
  design("fleece Lily", [T("Lily", 24)], { fabric: "towel" }),
  design("fleece Lily 4x4", [T("Lily", 24)], { fabric: "towel", hoop: "4x4" }),
  design("small outline motif", [T("Lily", 24, { y: -20 }), M("heart", 15, { y: 25, style: "outline" })]),
  design("small filled motif", [M("butterfly", 18)]),
  design("small applique motif", [M("house", 20, { style: "applique" })]),
  design("too small script", [T("Emma", 5)]),
  design("thin line", [T("Emma", 13)]),
  design("thin line print", [T("Hello there", 7, { font: ROUND })]),
  design("loops fill", [T("Abbie bee", 12)]),
  design("monogram name", [Mono("Max", 30)]),
  design("monogram 4 letters", [Mono("ABCD", 30)]),
  design("lines on a wave", [T("one\ntwo\nthree", 12, { font: PRINT, shape: "wave", amp: 4, waves: 2 })]),
  design("under a patch", [T("Sam", 18, { color: "#f0f0f0" }), F("circle", 70, 70, "patch", { fill: "#0e1f7c" })]),
  design("same as patch", [F("circle", 70, 70, "patch", { fill: "#0e1f7c" }), T("Sam", 18, { color: "#0e1f7c" })]),
  design("letters pushed", [T("AVA", 20, { font: PRINT, kern: { 0: -30, 1: -30 } })]),
  design("missing letters", [T("Emma 日本", 20)]),
  design("tight arch", [T("Oliver", 28, { shape: "up", radius: 20 })]),
  design("wrapped arch", [T("Happy Birthday Grandma", 14, { shape: "up", radius: 10 })]),
  design("runs into", [T("Emma", 24, { y: 0 }), T("Noah", 24, { y: 8 })]),
  design("three run into one", [M("heart", 30), M("star", 30, { x: 5 }), M("flower", 30, { x: -5 })]),
  design("towel monogram", [Mono("RMK", 21)], { fabric: "towel", hoop: "4x4" }),
  design("knit 30wt small", [T("Leo", 9, { font: ROUND })], { fabric: "knit", thread: "30" }),
  design("turned long name", [T("Alexandria", 30)], { turn: true }),
  design("split in two", [T("Emma", 6, { x: -60 }), M("heart", 60, { x: 30 }), M("star", 60, { x: 100 })]),
  design("too big", [M("heart", 170)], { hoop: "4x4" }),
  design("appliqué frame + small", [F("heart", 46, 42, "applique", { color: "#f993bc" }), T("Emma", 6, { y: 0 })]),
  design("clean starter-like", [F("oval", 110, 64, "satin"), T("Emma", 22)]),
  // (words typed away to nothing: a saved design drops such a piece, so they're cleared in the editor, `act`)
  { ...design("empty lettering", [F("heart", 84, 76, "applique"), T("Emma", 16)]), act: `const t = document.querySelector('#st-edit textarea[data-k="text"]'); t.value = "  "; t.dispatchEvent(new Event("input", { bubbles: true }));` },
  design("quilted frame + name", [F("square", 100, 100, "satin", { quilt: "stipple" }), T("Ava", 7, { font: ROUND })]),
  // (an old #bookmark link: the Bookmark starter with the old panel's saved name)
  { name: "bookmark", tab: "bookmark" },
  // every starter as it comes, on both hoops (pauses, appliqué, in-the-hoop, patches, quilting)
  ...["monogram", "ring", "oval", "framed", "quilt", "bib", "towel", "ornament", "mugrug", "coaster", "quiltblock", "pouch", "keyfob", "applique", "initials", "patch", "decorated", "words",
    "bookmark", "tag", "pocket", "tote", "stocking", "birth", "wedding", "bookplate", "pet", "kitchen"]
    .flatMap((s) => ["5x7", "4x4"].map((h) => ({ name: `starter ${s} ${h}`, tab: "design", starter: s, hoop: h }))),
  { name: "picture: fine logo", tab: "picture", image: "logo" },
  { name: "picture: blobs", tab: "picture", image: "blobs" },
  { name: "picture: owned threads", tab: "picture", image: "blobs", owned: true },
  { name: "open: clean", tab: "open", file: "clean" },
  { name: "open: dense", tab: "open", file: "dense" },
  { name: "open: tiny", tab: "open", file: "tiny" },
  { name: "open: packed satin", tab: "open", file: "packed" },
  { name: "open: sparse satin", tab: "open", file: "sparse" },
  { name: "open: 121 colours", tab: "open", file: "colours" },
  { name: "open: old misplaced", tab: "open", file: "misplaced" },
  { name: "open: shrunk 60%", tab: "open", file: "jumpy", scale: 60 },
  // (round 9: a PES changed in a download was "two different designs"; a DST whose end code came early opened as whole)
  { name: "open: damaged", tab: "open", file: "damaged" },
  { name: "open: DST ending early", tab: "open", file: "early" },
];

// ---------- files for the Open tab (written with the site's own writer) ----------
function pes(kind) {
  const S = [], at = (x, y, c = 0) => S.push([Math.round(x), Math.round(y), c]);
  const threads = [{ color: "#0e1f7c" }];
  const zig = (x0, len, w, gap) => { for (let x = x0, k = 0; x < x0 + len; x += gap, k++) at(x, k % 2 ? w : 0); };
  if (kind === "clean") { at(0, 0, 1); zig(0, 300, 30, 2); }
  if (kind === "dense") { at(0, 0, 1); for (let i = 0; i < 400; i++) at((i % 2) * 6, (i % 3) * 4); at(200, 0); zig(200, 200, 30, 2); }
  if (kind === "tiny") { at(0, 0, 1); for (let i = 0; i < 300; i++) at(i * 2 + (i % 2), (i % 4)); }
  if (kind === "packed") { at(0, 0, 1); zig(0, 300, 30, 1); }
  if (kind === "sparse") { at(0, 0, 1); zig(0, 400, 30, 4); }
  if (kind === "jumpy") { for (let k = 0; k < 8; k++) { at(k * 130, 0, 1); zig(k * 130, 60, 30, 2); at(k * 130 + 60, 0, 2); } }
  if (kind === "colours") {
    threads.length = 0;
    for (let k = 0; k < 121; k++) { threads.push({ color: `#${((k * 2654435761) >>> 8 & 0xffffff).toString(16).padStart(6, "0")}` }); if (k) at(S.at(-1)[0], S.at(-1)[1], 5); at((k % 11) * 60, Math.floor(k / 11) * 60, 1); zig((k % 11) * 60, 40, 20, 2); }
  }
  if (kind === "damaged" || kind === "early") { at(0, 0, 1); zig(0, 300, 30, 2); }
  S.push([...S.at(-1).slice(0, 2), 4]);
  const bytes = writePES({ stitches: S, threads });
  if (kind === "damaged") {   // (the design box and a few stitches in the machine's block changed)
    const blk = (bytes[8] | (bytes[9] << 8) | (bytes[10] << 16) | (bytes[11] << 24)) + 512;
    bytes[blk + 17] ^= 0x15; for (const k of [40, 77, 120]) bytes[blk + k] ^= 0x22;
  }
  if (kind === "early") {   // a DST of 300 stitches with an end code after the 100th
    const t = new Uint8Array(512 + 3 * 301).fill(0x20);
    for (let i = 0; i < 300; i++) t.set([i % 2 ? 0x05 : 0x06, 0x01, 0x03], 512 + 3 * i);
    t.set([0, 0, 0xf3], 512 + 300); t.set([0, 0, 0xf3], 512 + 900);
    return { bytes: t, name: "early.dst" };
  }
  return { bytes, name: `${kind}.pes` };
}

// ---------- in the page: every surface, read ----------
const READ = String.raw`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  const ids = (sel) => [...new Set($$(sel).flatMap((e) => e.dataset.problem.split(" ")))].sort();
  const textOf = (el) => (el ? [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim() : "");
  const out = { mode: document.body.dataset.mode, texts: [], attrs: [] };
  const grab = (el) => { if (!el) return; out.texts.push(el.innerText); for (const e of el.querySelectorAll("[title],[aria-label],[data-tip]")) out.attrs.push(e.title || "", e.getAttribute("aria-label") || "", e.dataset.tip || ""); };
  for (let i = 0; i < 150 && !nwTest.view(); i++) await sleep(100);
  await sleep(1200);
  for (let i = 0; i < 50 && $("#busy") && !$("#busy").hidden; i++) await sleep(200);
  const v = nwTest.view(); if (!v) return { ...out, none: true };
  out.expected = nwTest.problems().map(({ id, level, text, file }) => ({ id, level, text, file: !!file }));
  out.download = ids("#dl-warn [data-problem]");
  out.facts = $("#facts").innerText; out.chips = $$("#threads li span").map((s) => textOf(s));
  grab(document.body);
  if (out.mode === "design") {
    const all = new Set(), untagged = [];
    // (the list is drawn again on every pick: each button found afresh)
    for (const pid of $$("#st-pieces .pick").map((b) => b.dataset.id)) {
      $('#st-pieces .pick[data-id="' + pid + '"]').click(); await sleep(1000);
      ids("#st-edit [data-warn] [data-problem]").forEach((x) => all.add(x));
      untagged.push(...$$("#st-edit [data-warn] > span:not([data-problem])").map((e) => e.textContent));
      grab($("#st-edit"));
    }
    out.editor = [...all].sort(); out.untagged = untagged;
    out.steps = ids("#st-steps [data-problem]"); out.stepsCount = $("#st-steps-count").innerText;
    out.stepThreads = $$("#st-steps [data-step] b").map((b) => textOf(b));
    grab($("#st-steps"));
  } else if (out.mode === "picture") {
    out.editor = ids("#pic-fine [data-problem], #pic-owned [data-problem]");
    out.untagged = [...$$("#pic-fine, #pic-owned")].filter((e) => !e.hidden && e.textContent.trim() && !e.querySelector("[data-problem]")).map((e) => e.textContent);
    out.steps = ids("#pic-steps [data-problem]"); out.stepsCount = $("#pic-steps-count").innerText;
    out.stepThreads = []; grab($("#pic-steps"));
  } else if (out.mode === "open") {
    out.editor = ids("#open-info [data-problem], #doctor-list [data-problem]");
    out.untagged = $$("#doctor-list li.warn:not([data-problem])").map((e) => e.textContent);
  }
  out.split = !!v.split;
  if (!$("#sheet-print").disabled) {
    dispatchEvent(new Event("beforeprint")); out.sheet = ids("#sheet [data-problem]");
    out.sheetThreads = $$("#sheet .list > li > b").map((b) => textOf(b)); grab($("#sheet")); dispatchEvent(new Event("afterprint"));
  }
  out.share = nwTest.share() || "";
  if (!$("#along-open").disabled) {
    $("#along-open").click(); await sleep(400);
    out.along = ids("#along-look [data-problem]"); out.alongThreads = [];
    for (let i = 0; i < 40 && $("#along").open; i++) {
      grab($("#along")); const t = textOf($("#along-title")); if (t && t !== "Finished") out.alongThreads.push(t);
      if ($("#along-next").textContent === "Close") break;
      $("#along-next").click(); await sleep(120);
    }
    $("#along-close").click();
  }
  if (!$("#download").disabled) {
    $("#download").click();
    for (let i = 0; i < 60 && !$("#done").open; i++) await sleep(100);
    if ($("#done").open) {
      out.done = ids("#done-warn [data-problem]"); out.doneBad = $$("#done-bad li").length;
      out.doneChecked = $("#done-checked").innerText; out.doneSew = $("#done-sew").innerText; grab($("#done"));
      $("#done-close").click();
    }
  }
  return out;
})()`;

// ---------- what each surface must show (js/words.js SHOWS, mirrored) ----------
const SHOWS = { download: ["block", "look"], done: ["look"], steps: ["look", "tip"], sheet: ["look", "tip"], share: ["look", "tip"], along: ["look", "tip"] };
const FILE_ON = new Set(["download", "done"]);
const want = (exp, surface) => exp.filter((p) => SHOWS[surface].includes(p.level) && (!p.file || FILE_ON.has(surface)));
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const collapse = (xs) => xs.filter((x, i) => !i || x !== xs[i - 1]);

// jargon a user shouldn't read (from CLAUDE.md's plain-words history), with the context it's allowed in
const JARGON = [
  [/\bunderlay\b/i, "underlay"], [/\bthe pile\b/i, "'the pile' (say the loops)"], [/\bPEC\b(?!,? or DST)/, "PEC"],
  [/\bjumps?\b(?! stitch not to trim)/i, "jump (say move between parts / loose thread)"],
  [/\b(each|every|more|\d+) stops?\b/i, "stops (say thread changes / pauses)"], [/\bcolou?r blocks?\b/i, "colour block"],
  [/\btatami\b/i, "tatami"], [/\bpull comp/i, "pull compensation"], [/\bskeleton/i, "skeleton"], [/\bx-height\b/i, "x-height"],
  [/\bsatins?\b(?!\s+(stitch|border)|-stitch)/i, "satin on its own (say satin stitch, or bold)"], [/\bfine line\b/i, "fine line (the app says thin line)"],
  [/\bkerning\b/i, "kerning"], [/\bdensity\b/i, "density"], [/\bdigitiz/i, "digitize"],
];

const problems = [];
const fail = (c, what) => { problems.push(`${c}: ${what}`); console.log(`  FAIL ${what}`); };
const seenKinds = new Set();
for (const c of CASES) {
  if (only && !c.name.includes(only)) continue;
  console.log(c.name);
  try {
    const store = (k, v) => `localStorage.setItem("nw:${k}", ${JSON.stringify(JSON.stringify(v))})`;
    const common = [store("doneSeen", false), store("studio.applSeen", true), store("studio.guideSeen", true)];
    if (c.tab === "design" && c.starter) {
      await open("#design", [...common, store("hoop", c.hoop), store("turn", { design: false, bookmark: true }), store("brand", ""), store("spools", {})].join(";"));
      await ev(`(async () => { document.querySelector('[data-start="${c.starter}"]').click(); return 1; })()`); await sleep(1500);
    } else if (c.tab === "design") await open("#design", [...common, store("studio", c.setup), store("hoop", c.hoop), store("turn", { design: c.turn, bookmark: true }), store("brand", ""), store("spools", {})].join(";"));
    else if (c.tab === "bookmark") await open("#bookmark", [...common, store("bm.name", "Emma"), store("hoop", "5x7")].join(";"));
    else if (c.tab === "picture") {
      await open("#picture", [...common, store("hoop", "5x7"), store("turn", { picture: false }), store("brand", c.owned ? "isacord" : ""), store("spools", c.owned ? { isacord: ["0015", "0020"] } : {}), store("pic.mine", !!c.owned)].join(";"));
      await ev(`(async () => {
        const cv = document.createElement("canvas"); cv.width = 600; cv.height = 400; const g = cv.getContext("2d");
        g.fillStyle = "#fff"; g.fillRect(0, 0, 600, 400);
        if (${JSON.stringify(c.image)} === "logo") { g.fillStyle = "#111"; g.font = "bold 40px sans-serif"; g.fillText("KENJI'S BAKERY", 40, 120); g.font = "13px serif"; g.fillText("fresh bread and cakes every morning since 1987, made by hand", 30, 200); g.fillStyle = "#777"; g.fillRect(10, 260, 580, 1); }
        else { g.fillStyle = "#c0182a"; g.beginPath(); g.arc(200, 200, 120, 0, 7); g.fill(); g.fillStyle = "#e8b400"; g.fillRect(330, 90, 200, 220); g.fillStyle = "#1a7a2e"; g.beginPath(); g.arc(430, 200, 60, 0, 7); g.fill(); }
        const blob = await new Promise((r) => cv.toBlob(r, "image/png")), dt = new DataTransfer(); dt.items.add(new File([blob], "drawing.png", { type: "image/png" }));
        const inp = document.getElementById("pic-file"); inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true })); return 1; })()`);
      for (let i = 0; i < 100 && !(await ev("nwTest.view() ? 1 : 0")); i++) await sleep(300);
    } else if (c.tab === "open") {
      await open("#open", [...common, store("hoop", "5x7")].join(";"));
      const f = c.file === "misplaced" ? { bytes: new Uint8Array((await import("node:fs")).readFileSync(new URL("./fixtures/ashley_v3_old.pes", import.meta.url))), name: "ashley_old.pes" } : pes(c.file);
      await ev(`(() => { const b = Uint8Array.from(atob(${JSON.stringify(Buffer.from(f.bytes).toString("base64"))}), (ch) => ch.charCodeAt(0)), dt = new DataTransfer();
        dt.items.add(new File([b], ${JSON.stringify(f.name)})); const inp = document.getElementById("open-file"); inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true })); return 1; })()`);
      for (let i = 0; i < 60 && !(await ev("nwTest.view() ? 1 : 0")); i++) await sleep(300);
      if (c.scale) {
        await sleep(800);
        await ev(`(() => { const s = document.getElementById("doc-scale"); s.value = ${c.scale}; s.dispatchEvent(new Event("input", { bubbles: true })); s.dispatchEvent(new Event("change", { bubbles: true })); return 1; })()`);
        await sleep(3000);
      }
    }
    if (c.act) { await sleep(1500); await ev(`(() => { ${c.act}; return 1; })()`); await sleep(1500); }
    const r = await ev(READ);
    if (r.none) { console.log("  (nothing to show)"); continue; }
    const exp = r.expected, idsOf = (l) => l.map((p) => p.id);
    for (const p of exp) seenKinds.add(`${r.mode}:${p.id.replace(/:.*$/, "")}${p.file ? ":" + p.id.split(":")[1] : ""}`);
    console.log(`  ${r.mode}: ${exp.map((p) => `${p.id}(${p.level})`).join(" ") || "no problems"}`);
    // every surface shows the same problems
    const check = (surface, got, expected) => { if (got !== undefined && !same(got, expected)) fail(c.name, `${surface} shows [${got.join(" ")}], the view has [${expected.join(" ")}]`); };
    check("beside Download", r.download, idsOf(want(exp, "download")));
    check("the editor", r.editor, idsOf(r.mode === "open" ? exp : exp.filter((p) => !p.file)));
    check("How to stitch it", r.steps, idsOf(want(exp, "steps")));
    check("the sew sheet", r.sheet, idsOf(want(exp, "sheet")));
    check("Sew along", r.along, idsOf(want(exp, "along")));
    check("the download dialog", r.done, idsOf(want(exp, "done").filter((p) => !p.file && !(r.mode === "open" && p.id === "short"))));
    if (r.doneBad !== undefined && (r.doneBad > 0) !== exp.some((p) => p.file)) fail(c.name, `the download dialog's file check (${r.doneBad} items) disagrees with the verdict beside Download`);
    for (const u of r.untagged || []) fail(c.name, `a warning that isn't one of the view's problems: "${u.slice(0, 120)}"`);
    // the share text: each problem's own words, under its heading, and nothing else there
    const section = (head) => { const m = r.share.match(new RegExp(`^${head}:\\n((?:- .*\\n?)*)`, "m")); return m ? m[1].trim().split("\n").filter(Boolean).map((l) => l.slice(2)) : []; };
    for (const [level, head] of [["look", "Still to look at"], ["tip", "Good to know"]]) {
      const got = section(head), exp2 = want(exp, "share").filter((p) => p.level === level).map((p) => p.text);
      if (!same(got, exp2)) fail(c.name, `the share text's "${head}" lists [${got.join(" | ")}], the view has [${exp2.join(" | ")}]`);
    }
    // stops counted the same everywhere
    const count = (t, re) => { const m = (t || "").match(re); return m ? +m[1] : null; };
    const stops = [["chips", r.facts], ["How to stitch it", r.stepsCount], ["download dialog", r.doneChecked]];
    for (const [re, word] of [[/(\d+) thread changes?/, "thread changes"], [/(\d+) pauses?/, "pauses"]]) {
      const vals = stops.map(([n, t]) => [n, count(t, re)]).filter(([, x]) => x != null);
      if (new Set(vals.map(([, x]) => x)).size > 1) fail(c.name, `${word}: ${vals.map(([n, x]) => `${n} ${x}`).join(", ")}`);
    }
    if (r.doneSew) {
      const ch = count(r.facts, /(\d+) thread changes?/) || 0, pa = count(r.facts, /(\d+) pauses?/) || 0;
      if (!pa && /\bpause/i.test(r.doneSew)) fail(c.name, `the download dialog speaks of pauses with none: "${r.doneSew}"`);
      if (!ch && /thread change/i.test(r.doneSew)) fail(c.name, `the download dialog speaks of thread changes with none: "${r.doneSew}"`);
    }
    // threads named the same, in sewing order, on the chips, the steps, the sew sheet and Sew along
    // (past 12 thread changes the chips list each thread once)
    if (!r.split && collapse(r.chips).length <= 13) {
      const chips = collapse(r.chips.map((x) => x.replace(/ · .*$/, "")));
      for (const [n, l] of [["How to stitch it", r.stepThreads], ["the sew sheet", r.sheetThreads], ["Sew along", r.alongThreads]]) {
        if (!l?.length) continue;
        const got = collapse(l.map((x) => x.replace(/^.* · /, "").trim()));
        if (!same([got.join("|")], [chips.join("|")])) fail(c.name, `${n} names the threads ${got.join(", ")}; the chips ${chips.join(", ")}`);
      }
      for (const x of r.chips) if (!/^(Brother |your )/.test(x)) fail(c.name, `a thread chip not named as the machine names it: "${x}"`);
    }
    // jargon in anything a user reads
    const all = [...r.texts, ...r.attrs, r.share];
    for (const [re, what] of JARGON) for (const t of all) {
      const m = t.match(re); if (!m) continue;
      const i = t.indexOf(m[0]); fail(c.name, `jargon "${what}": …${t.slice(Math.max(0, i - 60), i + 60).replace(/\s+/g, " ")}…`); break;
    }
  } catch (err) { fail(c.name, `error: ${err.message.slice(0, 300)}`); }
}
console.log(`\nproblem kinds covered: ${[...seenKinds].sort().join(" ")}`);
const NEED = ["design:towel", "design:motif", "design:small", "design:thin", "design:loops", "design:named", "design:lines", "design:covered", "design:hidden",
  "design:pushed", "design:missing", "design:arch", "design:runs", "open:file:dense", "open:packed", "open:stuck", "open:damaged", "open:short", "design:empty"];
if (!only) for (const k of NEED) if (![...seenKinds].some((s) => s === k || s.startsWith(k + ":"))) problems.push(`coverage: no case shows ${k}`);
const unique = [...new Set(problems)];
if (unique.length) { console.log(`\n${unique.length} problems:`); for (const p of unique) console.log("  " + p); }
console.log(`DONE ${CASES.filter((c) => !only || c.name.includes(only)).length} ${unique.length}`);
process.exit(unique.length ? 1 : 0);
