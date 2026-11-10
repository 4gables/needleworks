// Text input outside the happy path (category 9), the engine side: every string in tests/text_corpus.mjs (every script
// sample, NFC and NFD accents, combining marks, right-to-left, emoji and ZWJ sequences, variation selectors, zero-width
// and control characters, odd spaces and line breaks, quotes, reserved names, 0-5000 characters, plus 400 seeded
// random mixes) through js/core/typed.js and what's built on it:
// - `tidy` (the one clean-up at input): well-formed, composed (NFC), no control or invisible characters, plain spaces,
//   at most the lines and length asked, never a letter cut in two, and tidying twice changes nothing;
// - `lacks` (the one glyph check, used by the editor, Download note, names batch and bookmark) agrees with each
//   font's own character map (glyphs.js), says the same for NFD and NFC input (Sacramento has é but no loose ◌\u0301), never
//   lists a space or an invisible character, and knows Great Vibes has ễ and А (R8: "This font has no ễ ị ằ");
// - `safeName` (every download): ASCII letters, digits, _ and -, never empty, never a Windows device name, at most 41,
//   and every letter any font has spells as something (R6/R7: Ł, ø; R8: Greek/Cyrillic/Hebrew came out design.pes);
// - `uniqueName`: names differing only by case or accent get different files (R5: emma.pes and Emma.pes);
// - `cleanPiece` (Open saved, paste, the stored design): text comes back tidied, and a saved copy loads back the same.
// Run: node tests/text.test.mjs  (about 2 s; CI)
import assert from "node:assert/strict";
import { glyphs } from "../js/core/glyphs.js";
import { APPLIQUE_FONTS, FONTS } from "../js/core/fonts.js";
import { MAX_INITIALS, MAX_WORDS, graphemes, initials, lacks, latin, safeName, tidy, uniqueName, unswashed } from "../js/core/typed.js";
import { cleanPiece, label } from "../js/studio/pieces.js";
import { FIXED, VARIANTS, corpus } from "./text_corpus.mjs";

const ALL = corpus(400, 9);
const FAMILIES = [...FONTS, ...APPLIQUE_FONTS].map((f) => f.family);
let checks = 0, fails = 0;
const failed = new Map();
function check(kind, ok, what) {
  checks++;
  if (ok) return;
  fails++;
  if (!failed.has(kind)) failed.set(kind, []);
  if (failed.get(kind).length < 5) failed.get(kind).push(what);
}
const show = (s) => JSON.stringify(s.length > 40 ? s.slice(0, 40) + "…" : s);
const cps = (s) => [...s].map((c) => c.codePointAt(0));
const QUIET = (cp) => (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0x200c || cp === 0x200d || (cp >= 0xe0000 && cp <= 0xe01ef);

// ---- tidy
for (const s of ALL) for (const opts of [{}, { lines: 3, max: 60 }, { max: 12 }, { max: 14 }]) {
  const t = tidy(s, opts), lines = opts.lines || 1;
  check("tidy well-formed", !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(t), show(s));
  check("tidy NFC", t === t.normalize("NFC"), show(s));
  check("tidy no control/invisible", !/(?![\n\u200c\u200d\u{e0020}-\u{e007f}])[\p{Cc}\p{Cf}]/u.test(t), show(s) + " -> " + show(t));
  check("tidy plain spaces", !/(?! )\p{Zs}/u.test(t) && !/[\r\u2028\u2029]/.test(t), show(s));
  check("tidy lines", t.split("\n").length <= lines, show(s));
  check("tidy max", t.length <= (opts.max ?? Infinity), show(s));
  check("tidy idempotent", tidy(t, opts) === t, show(s));
  // a cut never splits a letter: the cut text is the start of the uncut text, letter by letter
  const whole = graphemes(tidy(s, { ...opts, max: Infinity })), cut = graphemes(t);
  check("tidy cuts whole letters", cut.every((g, i) => g === whole[i]), show(s));
}
assert.equal(tidy("Jose\u0301"), "José");
assert.equal(tidy("Em\u200bma\u00a0Lee\r\n", { lines: 3 }), "Emma Lee\n");
assert.equal(tidy("A\nB\nC\nD", { lines: 3 }), "A\nB\nC D");
assert.equal(tidy("a".repeat(59) + "👍🏽", { max: 60 }), "a".repeat(59));
assert.equal(tidy("👨\u200d👩\u200d👧"), "👨\u200d👩\u200d👧");   // (an emoji family keeps its joiners)

// ---- lacks: the font's own character map, the same for NFC and NFD
for (const fam of FAMILIES) {
  const has = glyphs(fam);
  assert.ok(has && has.size > 100, `${fam}: no glyph map (run tests/make_glyphs.py)`);
  for (const s of ALL) {
    const t = tidy(s, { lines: 3 }), gone = lacks(t, fam);
    check("lacks NFC = NFD", JSON.stringify(lacks(t.normalize("NFD"), fam)) === JSON.stringify(gone), `${fam} ${show(s)}`);
    check("lacks raw = tidied", JSON.stringify(lacks(s, fam)) === JSON.stringify(lacks(t, fam)), `${fam} ${show(s)}`);
    for (const g of gone) {
      check("lacks lists only missing", cps(g).some((c) => !QUIET(c) && !has.has(c)), `${fam} ${show(g)}`);
      check("lacks lists nothing invisible", g.trim() !== "" && !/^[\p{Cf}\p{Cc}\p{Z}\ufe0f]+$/u.test(g), `${fam} ${show(g)}`);
    }
    // everything else is in the font
    for (const g of graphemes(t)) if (!/^\s+$/.test(g) && !gone.includes(g)) check("lacks misses nothing", cps(g).every((c) => QUIET(c) || has.has(c)), `${fam} ${show(g)}`);
  }
}
assert.deepEqual(lacks("Nguyễn Thị Hằng", "NW Great Vibes"), []);
assert.deepEqual(lacks("Анна", "NW Great Vibes"), []);
assert.deepEqual(lacks("Анна", "NW Sacramento"), ["А", "н", "а"]);
assert.deepEqual(lacks("Jose\u0301", "NW Sacramento"), []);
assert.deepEqual(lacks("❤\ufe0f Emma", "NW Great Vibes"), ["❤\ufe0f"]);
assert.deepEqual(lacks("Em\u200bma", "NW Sacramento"), []);

// ---- safeName / latin
const DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
for (const s of ALL) {
  const n = safeName(s, "design"), l = latin(s);
  check("name ASCII", /^[A-Za-z0-9_-]+$/.test(n), show(s) + " -> " + n);
  check("name length", n.length <= 41, show(s));
  check("name not a device", !DEVICE.test(n), show(s) + " -> " + n);
  check("name trimmed", !/^_|_$/.test(n) || DEVICE.test(n.slice(0, -1)), show(s) + " -> " + n);
  check("latin printable", /^[\x20-\x7e]*$/.test(l), show(s));
  // anything with a letter in a script our fonts have gives a name of its own, not the fallback
  if (FAMILIES.some((f) => lacks(s, f).length === 0) && /[\p{Ll}\p{Lu}]/u.test(tidy(s))) check("name readable", n !== "design", show(s));
}
// every letter any font has spells as at least one ASCII letter (signs that are silent, clicks and glottal stops aside)
const SILENT = new Set([..."ЪЬъьǀǁǂǃɁɂʔʕʘꞋꞌ"]);
const union = new Set(FAMILIES.flatMap((f) => [...glyphs(f)]));
for (const cp of union) {
  const c = String.fromCodePoint(cp);
  if (/[\p{Ll}\p{Lu}\p{Lt}]/u.test(c) && !SILENT.has(c)) check("every font letter spells", /[A-Za-z]/.test(latin(c)), `${c} U+${cp.toString(16)}`);
}
for (const [from, to] of [["José", "Jose"], ["Jose\u0301", "Jose"], ["Łukasz", "Lukasz"], ["Søren", "Soren"], ["Анна", "Anna"], ["ЖЕНЯ", "ZHENYA"],
  ["Σοφία", "Sofia"], ["שרה", "Shrh"], ["Nguyễn Thị Hằng", "Nguyen_Thi_Hang"], ["O'Neil", "O_Neil"], ["O’Neil", "O_Neil"], ["CON", "CON_"],
  ["Əli", "Eli"], ["Kɔfi", "Kofi"], ["Straße", "Strasse"], ["李明", "design"], ["❤\ufe0f", "design"], ["Emma ❤\ufe0f", "Emma"], ["Em\u200bma", "Emma"], ["Bev's\nKitchen", "Bev_s_Kitchen"], ["Lily\r\nRose", "Lily_Rose"]])
  assert.equal(safeName(from, "design"), to, from);

// ---- one file per name: unique ignoring case, whatever the accents or how they were typed
{
  const used = new Set(), names = VARIANTS.map((v) => uniqueName(safeName(tidy(v), "name"), used));
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, names.length, names.join(" "));
}

// ---- saved designs: text comes back tidied, and a saved copy loads back the same
for (const s of ALL) {
  for (const p of [{ kind: "text", text: s, font: "NW Great Vibes", size: 20 }, { kind: "monogram", letters: s, size: 30 }, { kind: "letters", text: s, size: 60 }]) {
    const q = cleanPiece(p), k = p.kind === "monogram" ? "letters" : "text";
    if (!q) { check("load keeps typed text", !tidy(s, p.kind === "text" ? { lines: 3, max: MAX_WORDS } : { max: MAX_INITIALS }).trim(), show(s)); continue; }
    check("load tidies", q[k] === tidy(q[k], { lines: p.kind === "text" ? 3 : 1, max: p.kind === "text" ? MAX_WORDS : MAX_INITIALS }), `${p.kind} ${show(s)}`);
    check("load round trip", JSON.stringify(cleanPiece(JSON.parse(JSON.stringify(q)))) === JSON.stringify(q), `${p.kind} ${show(s)}`);
    check("thread name ASCII", /^[\x20-\x7e]*$/.test(latin(label(q, true))), `${p.kind} ${show(s)}`);
    // (the page names long words briefly, the file's thread name keeps them: a design's saved bytes carry it)
    if (p.kind === "text") check("label brief, whole in the file", graphemes(label(q)).length <= 34 && label(q, true).includes(unswashed(q.text).replace(/\s*\n\s*/g, " / ")), `${show(s)}`);
    if (p.kind === "monogram") check("initials are letters", initials(q.letters).every((g) => !/^\p{M}/u.test(g) || g === initials(q.letters)[0]), show(s));
  }
}

console.log(`text: ${ALL.length} strings, ${FAMILIES.length} fonts, ${checks} checks, ${fails} failed`);
for (const [k, v] of failed) console.log(`  FAIL ${k}: ${v.join(" | ")}`);
process.exit(fails ? 1 : 0);
