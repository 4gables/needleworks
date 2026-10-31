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
