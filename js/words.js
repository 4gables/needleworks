/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// What the app says about a design, in one place: the words for its stops, and one list of its problems that every
// surface shows (the editor, beside Download, the download dialog, How to stitch it, the sew sheet, the share text,
// Sew along, the Open tab's checkup). Each surface used to work out its own: a fleece name that closes up was said
// only in the editor while the download dialog said "Checked", a thin line only in the editor, "At each pause" for a
// picture that only changes thread. tests/surfaces.mjs builds designs with known problems and checks every surface
// shows the same set.

// ---------- stops ----------
// "195 thread changes and 4 pauses": a stop in a new thread is a thread change, one in the same thread a pause (a
// fabric step in-the-hoop or appliqué)
export function stopWords(changes, pauses) {
  const c = `${changes} thread ${changes === 1 ? "change" : "changes"}`, p = `${pauses} ${pauses === 1 ? "pause" : "pauses"}`;
  return changes && pauses ? `${c} and ${p}` : pauses ? p : c;
}
// "at every thread change", "at every pause", "at every thread change and pause"
export const stopsAt = (changes, pauses) => `at every ${changes && pauses ? "thread change and pause" : changes ? "thread change" : "pause"}`;

// ---------- problems ----------
// A problem: { id (unique in the view, "small:3" = kind and piece), level, text (one plain sentence, naming the piece),
// piece? (its id: the editor shows it with the piece's one-tap fix) }.
//   block: no file until it's fixed (Download is off and says why)
//   look:  the file can be saved, but it won't sew as the preview suggests: said everywhere the design goes
//   tip:   worth knowing at the machine: said with the steps, not as a warning
export const BLOCK = "block", LOOK = "look", TIP = "tip";
// which levels each surface shows (the editor and the Open tab's checkup show all of a piece's or file's own, with fixes)
export const SHOWS = {
  download: [BLOCK, LOOK], done: [LOOK], steps: [LOOK, TIP], sheet: [LOOK, TIP], share: [LOOK, TIP], along: [LOOK, TIP],
};
export const LOOK_HEAD = "Still to look at", TIP_HEAD = "Good to know";
// the view's problems: its own, then the file's verdict (tests/pe900_check.py's rules on the bytes, a moment later)
export function problemsOf(v) {
  if (!v) return [];
  const file = (v.verdict || []).map((q) => ({ id: "file:" + q.key, level: LOOK, text: q.text, file: true }));
  return [...(v.problems || []), ...file];
}
// The file's own verdict ("file:" items) is about the file as saved, and the download dialog offers a fixed copy: it's
// said beside Download, in that dialog and in the Open tab's checkup, not with the steps of the design.
const FILE_ON = new Set(["download", "done"]);
export const shownOn = (list, surface) => list.filter((p) => SHOWS[surface].includes(p.level) && (!p.file || FILE_ON.has(surface)));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// as a list; each item carries its id (`data-problem`) so a check can tell what's shown where
export function problemsHtml(list, cls = "problems") {
  return list.length ? `<ul class="${cls}">${list.map((p) => `<li data-problem="${esc(p.id)}" class="${p.level}">${esc(p.text)}</li>`).join("")}</ul>` : "";
}
export const problemsText = (list) => list.map((p) => p.text).join(" ");
// at the top of "How to stitch it" (and the sew sheet, Sew along): what's still wrong, then what's worth knowing
export function problemsItems(list, tag = "li", cls = "after") {
  const look = list.filter((p) => p.level === LOOK), tips = list.filter((p) => p.level === TIP);
  return (look.length ? `<${tag} class="${cls} look"><b>${LOOK_HEAD}</b>${problemsHtml(look)}</${tag}>` : "")
    + (tips.length ? `<${tag} class="${cls} tips"><b>${TIP_HEAD}</b>${problemsHtml(tips)}</${tag}>` : "");
}
// in a line of text (beside Download, the download dialog): one span each, a space between
export const problemsInline = (list) => list.map((p) => `<span data-problem="${esc(p.id)}">${esc(p.text)}</span>`).join(" ");

// ---------- sizes ----------
// Supply sizes, as a ruler shows them: centimetres (whole from 10 cm, else to the millimetre) and inches in eighths
// (a tape measure's marks), both from the true size. `up`: fabric to cut, never short of it. ("15 × 12 cm (5.7 × 4.5 in)"
// was 5.9 in, and "½ in (1 cm)" 1.3 cm: each was rounded from the other, to tenths no ruler has.)
const EIGHTHS = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"];
const step = (v, up) => (up ? Math.ceil(v - 1e-6) : Math.round(v));
export function inches(mm, up = false) {
  const e = step((mm / 25.4) * 8, up), w = Math.floor(e / 8), f = EIGHTHS[e % 8];
  return `${w || !f ? w : ""}${f}`;
}
export const cm = (mm, up = false) => String(mm >= 100 ? step(mm / 10, up) : step(mm, up) / 10);
// "15 cm (6 in)", "15 × 12 cm (5⅞ × 4¾ in)"; in a sentence about inches, inches first: "½ in (1.3 cm)"
export const measure = (mm, up = false) => `${cm(mm, up)} cm (${inches(mm, up)} in)`;
export const measure2 = (w, h, up = false) => `${cm(w, up)} × ${cm(h, up)} cm (${inches(w, up)} × ${inches(h, up)} in)`;
export const inchFirst = (mm, up = false) => `${inches(mm, up)} in (${cm(mm, up)} cm)`;

// ---------- words explained ----------
// Sewing words a newcomer may not know (round 10: "stabilizer" and "topper" were never explained, and the loose-thread
// note led with the machine's setting), explained once, after the sentence that first uses them on a surface: Have
// ready, the steps, When it's done, read in that order (`explained`). Every surface takes them from there.
export const GLOSSARY = [
  [/\bstabilizer\b/i, "Stabilizer is a backing sheet, sold next to embroidery thread, that keeps the fabric from puckering while it's sewn."],
  [/\btopper\b/i, "A topper is a thin film laid on top of a fluffy fabric so the stitches don't sink into it; it tears or washes away."],
  [/\bloose threads?\b/i, "A loose thread is a short thread the machine leaves between two parts instead of cutting it."],
];
// `texts` in reading order, each with each word explained after its first sentence that uses it (where it isn't yet)
export function explained(texts) {
  const left = GLOSSARY.filter(([, say]) => !texts.some((t) => t?.includes(say)));
  return texts.map((t) => {
    if (!t) return t;
    for (let i = 0; i < left.length; i++) {
      const m = left[i][0].exec(t); if (!m) continue;
      const end = /[.!?](?=\s|$)/g; end.lastIndex = m.index;
      const e = end.exec(t), at = e ? e.index + 1 : t.length;
      t = `${t.slice(0, at)} ${left[i][1]}${t.slice(at)}`;
      left.splice(i--, 1);
    }
    return t;
  });
}
