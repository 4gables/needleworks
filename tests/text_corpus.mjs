// Text people may type, paste or load, for tests/text.test.mjs and tests/text_fuzz.mjs: a sample of every script the
// fonts may or may not have, accents typed composed and decomposed (NFC/NFD), combining marks, right-to-left text,
// emoji (skin tones, ZWJ families, flags, keycaps), variation selectors, zero-width and control characters, odd
// spaces and line breaks, apostrophes and quotes of every kind, digits and dates, Windows' reserved file names, HTML,
// names differing only by case or accent, and lengths 0 to 5000. `corpus(n, seed)` adds n seeded random mixes.
export const SAMPLES = {
  latin: ["Emma", "emma", "EMMA", "José", "Zoë", "Renée", "François", "Jürgen", "Ægir", "Søren", "Øyvind", "Łukasz", "Žofia",
    "Đorđe", "Şükrü", "İlkay", "Ğ", "Björk", "Siobhán", "Ḥana", "Ångström", "Nguyễn Thị Hằng", "Ðoàn", "Þóra", "Œuvre", "Straße",
    "Ŋgozi", "Əli", "Ɛsi", "Kɔfi", "Ɓello", "ĳsselmeer", "ŉ", "Ŀl", "Dž", "ǅ"],
  greek: ["Σοφία", "Γιώργος", "ΑΘΗΝΑ"],
  cyrillic: ["Анна", "Женя", "ЖЕНЯ", "Їжак", "Ђорђе", "Сёма", "Объект"],
  other: ["Անի", "ნინო", "שרה", "ש\u05b8\u05c2ר\u05b8ה", "فاطمة", "प\u094dरिया", "প\u09cdরিয\u09bcা", "สมชาย", "李明", "さくら", "김민준", "ሰላም", "Ꭳ", "ᠮᠣᠩᠭᠣᠯ"],
  emoji: ["❤\ufe0f", "❤", "👍🏽", "👨\u200d👩\u200d👧", "🇺🇸", "🏴\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}", "1\ufe0f⃣", "Emma ❤\ufe0f", "★ Emma ★", "♥", "✓", "©", "®", "™", "°", "€", "£", "½", "²"],
  punct: ["O'Neil", "O’Neil", "D‘Arcy", "“Quote”", "«Guillemets»", "„Anna“", "Mary-Kate", "Mary–Kate", "Mary—Kate", "Jo.", "A&B",
    "Sam & Alex", "06.20.27", "2026", "1/2", "#1", "@home", "100%", "!?", "...", ".", "…", "-", "_", "'", "\"", "Rock 'n' Roll", "Ann's", "C:\\x", "a/b", "a:b", "a*b?", "<>|"],
  spaces: ["Emma\u00a0Lee", "Emma\u2009Lee", "Emma\u3000Lee", "Emma\u2003Lee", "Emma\tLee", "  Emma  ", " ", "\u00a0", "\t"],
  invisible: ["Em\u200bma", "Em\u200cma", "Em\u200dma", "Em\u2060ma", "\ufeffEmma", "Em\u00adma", "\u200eEmma\u200f", "\u202eamme", "\u2066Emma\u2069", "Emma\u034f"],
  control: ["Em\u0000ma", "Em\u0007ma", "\u001b[31mEmma", "Emma\u007f", "Em\u0085ma", "Emma\u0008"],
  lines: ["Emma\r\nLee", "Emma\rLee", "Emma\u2028Lee", "Emma\u2029Lee", "A\nB\nC\nD\nE", "A\n\n\nB\n\nC", "\n\nEmma\n\n", "Line one\nLine two\nLine three\nLine four"],
  marks: ["n\u0308", "q\u0303", "x\u0302", "\u0301Emma", "Z\u0351\u0336\u0315a\u0352l\u0337g\u0353o", "e\u0301\u0301\u0301"],
  broken: ["Em\ud800ma", "\udc00Emma", "Emma\ud83d"],
  html: ["<b>x</b>", "&amp;", "a &lt; b", "\"quoted\"", "${x}", "<img src=x onerror=alert(1)>", "</textarea>"],
  reserved: ["CON", "con", "Aux", "NUL", "COM1", "LPT9", "prn", "CON.txt", "Con-", "nul_"],
  digits: ["0", "1", "2026", "06/20/27", "12:30", "3.14", "-1", "1st", "٣", "५"],
};
// the same names differing only by case or accent: one file each, never the same name twice
export const VARIANTS = ["Emma", "emma", "EMMA", "Émma", "E\u0301mma", "José", "Jose\u0301", "Jose", "JOSÉ", "Zoë", "Zoe", "Zoe\u0308"];
// lengths 0, 1, 2, 3, 60, 500, 5000
export const LONG = ["", "W", "Wi", "Wil", "W".repeat(60), "Wil ".repeat(15), "x".repeat(500), "W".repeat(5000),
  "Supercalifragilisticexpialidocious-Antidisestablishmentarian", "a".repeat(59) + "👍🏽", "é".repeat(30) + "e\u0301".repeat(30)];
// decomposed forms of everything with accents (as macOS file names and some keyboards send them)
const nfd = (list) => list.filter((s) => s.normalize("NFD") !== s).map((s) => s.normalize("NFD"));

export const FIXED = [...new Set([...Object.values(SAMPLES).flat(), ...nfd(SAMPLES.latin), ...nfd(SAMPLES.greek), ...nfd(SAMPLES.cyrillic), ...VARIANTS, ...LONG])];

// a small seeded generator (mulberry32), so a failure can be run again
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// n random mixes of pieces of the samples, odd characters and random code points from the blocks above
export function corpus(n = 300, seed = 1) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)], pool = Object.values(SAMPLES).flat();
  const odd = ["\u0301", "\u200b", "\u200d", "\ufe0f", "\u00a0", "\n", "\r", "\t", "\u0000", "\ud800", "'", "’", "&", " ", "\u2028", "\u00ad"];
  const blocks = [[0x20, 0x7e], [0xa0, 0x24f], [0x370, 0x3ff], [0x400, 0x4ff], [0x590, 0x5ff], [0x600, 0x6ff], [0x900, 0x97f], [0x1e00, 0x1eff],
    [0x2000, 0x206f], [0x3040, 0x30ff], [0x4e00, 0x4fff], [0xac00, 0xad00], [0x1f300, 0x1f6ff], [0xfe00, 0xfe0f]];
  const out = [...FIXED];
  for (let i = 0; i < n; i++) {
    let s = "";
    const parts = 1 + Math.floor(r() * 4);
    for (let k = 0; k < parts; k++) {
      const w = r();
      if (w < 0.45) s += pick(pool);
      else if (w < 0.7) s += pick(odd);
      else { const [a, b] = pick(blocks); s += String.fromCodePoint(a + Math.floor(r() * (b - a + 1))); }
      if (r() < 0.3) s += " ";
    }
    out.push(r() < 0.5 ? s : s.normalize("NFD"));
  }
  return out;
}
