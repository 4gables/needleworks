/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Words people type, handled once for every place they go:
// - `tidy`: the one clean-up at input (the editor's words and initials, appliqué letters, the names
//   list, saved and pasted designs), so the lettering, its warnings, its file name and its saved copy all see the same
//   text;
// - `lacks`: the letters a font doesn't have, from the font's own character map (glyphs.js);
// - `latin` and `safeName`: plain ASCII for file names and the thread names inside the file.
import { glyphs } from "./glyphs.js";

// Invisible characters that only steer how text is laid out (zero-width space, soft hyphen, word joiner, byte order
// mark, left-to-right/right-to-left marks and embeddings) and control characters: none draws anything, but each one
// split a script word in two (letters are joined only to the letter beside them) or showed up in a warning as an empty
// “”. The joiners an emoji or a flag is built with (U+200C/U+200D, tag characters) are kept with it.
const INVISIBLE = /(?![\u200c\u200d\u{e0020}-\u{e007f}])[\p{Cc}\p{Cf}]/gu;
// line breaks of every kind, and the odd spaces (no-break, thin, ideographic...): a plain new line or space
const BREAK = /\r\n|[\r\n\v\f\u0085\u2028\u2029]/g, SPACE = /[\t\p{Zs}]/gu;

let seg = null;
// the letters as a reader sees them: an accented letter, a flag or an emoji family is one, however many code points
export function graphemes(s) {
  if (seg === null) seg = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("en", { granularity: "grapheme" }) : false;
  return seg ? [...seg.segment(s)].map((g) => g.segment) : [...s];
}

// a monogram's initials: its letters without the spaces ("J K M" is JKM, "É" typed as E + ◌\u0301 is one)
export const initials = (s) => graphemes(String(s ?? "").replace(/\s+/g, ""));

// The text as stitched: composed accents (an "é" typed or pasted as e + \u25cc\u0301, as macOS file names and some keyboards
// send it, was two letters: the font's accent wasn't placed and the script join after it was lost), plain spaces and
// new lines, no invisible characters, no half emoji. `lines`: how many lines it may have (later ones join the last
// with a space, as a 4th Enter in Words does); `max`: its longest, in the units a text field's maxlength counts,
// never cutting a letter in two. Typing-safe: spaces at the ends stay (the space before the next word).
export function tidy(s, { lines = 1, max = Infinity } = {}) {
  if (typeof s !== "string") return "";
  let t = (s.toWellFormed ? s.toWellFormed() : s.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "\ufffd"))
    .replace(/\ufffd/g, "").replace(BREAK, "\n").replace(SPACE, " ").replace(INVISIBLE, (c) => (c === "\n" ? c : "")).normalize("NFC")
    // (a variation selector with nothing before it to vary: "︎ " alone was words with nothing to stitch)
    .replace(/(^|\s)[\ufe00-\ufe0f]+/g, "$1");
  const ls = t.split("\n");
  if (ls.length > lines) t = [...ls.slice(0, lines - 1), ls.slice(lines - 1).join(" ")].join("\n");
  if (t.length > max) {
    let out = "";
    for (const g of graphemes(t)) { if (out.length + g.length > max) break; out += g; }
    t = out;
  }
  return t;
}

// Swashes are typed: "~Emma~" is Emma with a lead-in and a tail (dashes in a print font). Only a "~" at either end of
// the words counts, with any spaces beside it; one in the middle is the font's own tilde. `cut`: how many characters
// came off each end (pair adjustments are keyed by position).
export function swashes(s) {
  const t = String(s ?? ""), a = /^\s*~+\s*/.exec(t), rest = a ? t.slice(a[0].length) : t, b = /\s*~+\s*$/.exec(rest);
  const text = b ? rest.slice(0, b.index) : rest;
  return { text, lead: !!a && !!text, tail: !!b && !!text, cut: [a ? a[0].length : 0, b ? b[0].length : 0] };
}
// the words as read (labels, step text, file names): each line without its swash marks
export const unswashed = (s) => String(s ?? "").split("\n").map((l) => swashes(l).text).join("\n");
// the words with a swash put on or taken off one end (the editor's Swash before/after)
export function withSwash(s, end, on) {
  const ls = String(s ?? "").split("\n"), i = end === "lead" ? 0 : ls.length - 1, w = swashes(ls[i]);
  ls[i] = `${(end === "lead" ? on : w.lead) ? "~" : ""}${w.text}${(end === "tail" ? on : w.tail) ? "~" : ""}`;
  return ls.join("\n");
}

// Characters the font doesn't have (the browser would draw them from a stand-in font), one per letter as a reader
// sees it, in the order typed. Accents count as part of their letter (Sacramento has é but no loose \u25cc\u0301); a variation
// selector or joiner inside an emoji isn't a letter to report. [] for a font we don't bundle.
const QUIET = (cp) => (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0x200c || cp === 0x200d || (cp >= 0xe0000 && cp <= 0xe01ef);
export function lacks(text, family) {
  const has = family && glyphs(family);
  if (!has) return [];
  const out = [];
  for (const g of graphemes(tidy(String(text ?? ""), { lines: 99 }))) {
    if (/^\s+$/u.test(g) || out.includes(g)) continue;
    if ([...g].some((c) => !QUIET(c.codePointAt(0)) && !has.has(c.codePointAt(0)))) out.push(g);
  }
  return out;
}
// a missing letter as it can be shown between quotes (a lone accent on a dotted circle, as type books show it)
export const shownLetter = (g) => (/^\p{M}/u.test(g) ? "\u25cc" + g : g);
// "This font has no “ж” “ф”" without repeating the wording in every place
export const lackList = (gone) => gone.map((g) => `“${shownLetter(g)}”`).join(" ");

// Letters with no accent to strip, spelled out in plain ASCII (lowercase; capitals follow the letter). Greek and
// Cyrillic by their modern sound, Hebrew consonants (its vowel points are marks, dropped with the accents). Our own
// choices, so a file or thread name always says something readable (Łukasz -> Lukasz, Søren -> Soren, Анна -> Anna,
// Σοφία -> Sofia, שרה -> Shrh; "S_ren" and design.pes before).
const LATIN = {};
for (const [from, to] of [
  ["łøßæœđðþıħŧŋĸ", "l o ss ae oe d d th i h t n k"],
  // the rest of the Latin letters our fonts have that don't come apart into a letter and an accent (African and
  // Azerbaijani alphabets, mostly: Ə, Ɛ, Ɔ, Ɓ, Ɗ, Ƙ, Ƴ...), each by the letter it's read as or looks like
  ...Object.entries({ ŀ: "l", ŉ: "n", ƀ: "b", ƃ: "b", ƈ: "c", ɖ: "d", ɗ: "d", ǝ: "e", ə: "e", ɛ: "e", ɇ: "e", ƒ: "f", ɠ: "g", ɣ: "g",
    ǥ: "g", ɥ: "h", ɦ: "h", ꜧ: "h", ɩ: "i", ɨ: "i", ɪ: "i", ᶤ: "i", ȷ: "j", ɉ: "j", ɟ: "j", ʝ: "j", ƙ: "k", ꝁ: "k", ƚ: "l", ƛ: "l",
    ɫ: "l", ɬ: "l", ⱡ: "l", ꟛ: "l", Ƛ: "L", ɯ: "m", ɲ: "n", ƞ: "n", ɵ: "o", ɔ: "o", ɤ: "o", ꞷ: "o", ƥ: "p", ᵽ: "p", ɋ: "q", ɍ: "r",
    ɽ: "r", ʃ: "sh", ꞩ: "s", ƭ: "t", ʈ: "t", ⱦ: "t", ʉ: "u", ʊ: "u", ꞹ: "u", ʋ: "v", ʌ: "a", ɑ: "a", ⱥ: "a", ⱳ: "w", ꭓ: "x", Ꭓ: "X",
    ƴ: "y", ɏ: "y", ƶ: "z", ʒ: "zh", ƹ: "zh", ǯ: "zh", ȣ: "ou", ȼ: "c", ɓ: "b", ꞵ: "b", ѣ: "e" }).map(([k, v]) => [k, v]),
  // Greek (modern sound values)
  ["αβγδεζηθικλμνξοπρσςτυφχψω", "a v g d e z i th i k l m n x o p r s s t y f ch ps o"],
  // Cyrillic: Russian, then Ukrainian, Belarusian, Serbian, Macedonian and older letters
  ["абвгдеёжзийклмнопрстуфхцчшщъыьэюя", "a b v g d e e zh z i y k l m n o p r s t u f kh ts ch sh shch - y - e yu ya"],
  ["іїєґўђјљњћџѓќѕ", "i yi ye g u dj j lj nj c dz gj kj dz"],
  // Hebrew consonants
  ["אבגדהוזחטיכךלמםנןסעפףצץקרשת", "a b g d h v z ch t y k k l m m n n s a p f ts ts k r sh t"],
]) if (from.length === 1) LATIN[from] = to; else [...from].forEach((c, i) => { if (!(c in LATIN)) LATIN[c] = to.split(" ")[i].replace("-", ""); });
// quotes, dashes and the like that ASCII has a plain stand-in for
const PUNCT = { "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'", "ʼ": "'", "ʹ": "'", "`": "'", "´": "'", "“": "\"", "”": "\"", "„": "\"", "‟": "\"", "″": "\"", "«": "\"", "»": "\"",
  "‹": "'", "›": "'", "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-", "·": ".", "•": ".", "ʻ": "'", "ʾ": "'", "ʿ": "'", "ʺ": "\"", "ˮ": "\"", "×": "x", "÷": "/", "¡": "!", "¿": "?" };
// (a capital followed or led by a capital is all capitals: ЖЕНЯ -> ZHENYA; Hebrew has no capitals, so a word starts with one)
const spell = (t) => t.replace(/./gu, (c, i) => {
  const l = c.toLowerCase(), r = LATIN[l], up = (d = "") => d !== d.toLowerCase();
  if (r === undefined) return c;
  if (l !== c && (up(t[i + 1]) || up(t[i - 1]))) return r.toUpperCase();
  return l !== c || (/[א-ת]/.test(c) && !/[א-ת]/.test(t[i - 1] || "")) ? r.charAt(0).toUpperCase() + r.slice(1) : r;
});
// plain readable ASCII (printable, spaces kept): what a file or thread name can carry
export function latin(s) {
  const t = spell(tidy(String(s ?? ""), { lines: 99 }));
  return spell(t.normalize("NFKD").replace(/\p{M}/gu, "")).replace(/[^\x20-\x7e]/g, (c) => PUNCT[c] ?? "");
}
// USB file names the machine can show: ASCII letters, digits, _ and -, never empty
export function safeName(s, fallback) {
  const t = latin(s).replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40).replace(/_+$/, "");
  // (Windows can't save a file called CON, PRN, AUX, NUL, COM1-9 or LPT1-9, in any case, with any extension: what's
  // added after the name here always follows a dot or an underscore, so only the bare word needs one)
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(t) ? t + "_" : t || fallback;
}
// `base` made unique among `used` (lowercase names: emma.pes and Emma.pes are one file on a Mac, Windows or the USB
// stick), which it's added to: Emma, Emma_2, Emma_3
export function uniqueName(base, used) {
  let f = base, k = 2;
  while (used.has(f.toLowerCase())) f = `${base}_${k++}`;
  used.add(f.toLowerCase());
  return f;
}
// a text field tidied as it's typed in (only when that changes something, with the caret kept after what it was after)
export function tidyField(el, opts) {
  const v = tidy(el.value, opts);
  if (v !== el.value) {
    const after = tidy(el.value.slice(el.selectionEnd ?? el.value.length), { lines: 99 }).length, at = Math.max(0, v.length - after);
    el.value = v;
    try { el.setSelectionRange(at, at); } catch {}
  }
  return v;
}
