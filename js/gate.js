/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The one way out: every file the page hands over (Download, a design in two hoopings, one for each name, a fixed
// copy, the share sheet, a saved design, the cut file) goes through `handOut`, which judges every file first and
// hands over nothing when one is refused. A PES must read back as the design it was written from (`validatePES`)
// and break none of the rules the machine itself needs (quality.js `HARD`); the rest of the verdict (dense, tiny...)
// goes back with it to be said in plain words. Until 2026-10-31 each exit made its own checks: a 121-colour PES was
// saved byte for byte, and a names ZIP was saved before its files were judged. tests/gate.test.mjs fails if any other
// file starts a download or a share.
import { validatePES } from "./core/formats.js";
import { HARD, verdictOf } from "./quality.js";
import { zip } from "./zip.js";

const no = (f, error) => ({ ...f, ok: false, error, problems: [], hard: [] });
// a cut file: an SVG at actual size, every outline closed and every number a number
function judgeSVG(f) {
  const t = typeof f.bytes === "string" ? f.bytes : new TextDecoder().decode(f.bytes);
  const size = t.match(/<svg[^>]*\swidth="([\d.]+)mm"\s+height="([\d.]+)mm"/), paths = [...t.matchAll(/\sd="([^"]*)"/g)].map((m) => m[1]);
  if (!size || !/<\/svg>\s*$/.test(t)) return no(f, "The cut file is damaged.");
  if (!(+size[1] > 0 && +size[2] > 0 && +size[1] < 1000 && +size[2] < 1000)) return no(f, "The cut file has no size.");
  if (!paths.length || paths.some((d) => !/^(M-?[\d.]+,-?[\d.]+(L-?[\d.]+,-?[\d.]+){2,}Z)+$/.test(d))) return no(f, "The cut file has a shape that isn't closed.");
  return { ...f, ok: true, error: "", problems: [], hard: [] };
}
// a saved design: what Open saved reads back
function judgeJSON(f) {
  try {
    const d = JSON.parse(typeof f.bytes === "string" ? f.bytes : new TextDecoder().decode(f.bytes));
    if (d?.needleworks !== 1 || !Array.isArray(d.pieces) || !d.pieces.length) return no(f, "The saved design is empty.");
  } catch { return no(f, "The saved design couldn't be written."); }
  return { ...f, ok: true, error: "", problems: [], hard: [] };
}

// One file: { name, bytes, against? (the pattern it was written from) } -> the same with ok, error
// (why it's refused), problems (quality.js verdict) and hard (the problems the machine can't take).
export function judge(f, hoop = null) {
  if (/\.svg$/i.test(f.name)) return judgeSVG(f);
  if (/\.json$/i.test(f.name)) return judgeJSON(f);
  if (!/\.pes$/i.test(f.name)) return no(f, "This page only saves PES files.");
  const check = validatePES(f.bytes, f.against || null, hoop);
  if (!check.ok) return no(f, check.error);
  const problems = verdictOf(f.bytes), hard = problems.filter((q) => HARD.has(q.key));
  return { ...f, ok: !hard.length, error: hard.map((q) => q.text).join(" "), problems, hard };
}

const TYPES = { pes: "application/octet-stream", zip: "application/zip", svg: "image/svg+xml", json: "application/json" };
// Every file judged, then saved (one file, or a .zip of them all when `zip` names it) or shared (`share`: { title,
// text }, the phone's share sheet). Nothing is handed over when any file is refused. Returns { ok, files (judged),
// refused (the files refused), error }; a share resolves when the sheet closes.
export function handOut(files, { hoop = null, zip: zipName = "", share = null } = {}) {
  const judged = files.map((f) => judge(f, hoop)), refused = judged.filter((f) => !f.ok);
  const out = { ok: !refused.length, files: judged, refused, error: refused.map((f) => (files.length > 1 ? `${f.name}: ` : "") + f.error).join(" ") };
  if (!out.ok) return out;
  const name = zipName || files[0].name, ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  const bytes = zipName ? zip(judged.map((f) => ({ name: f.name, bytes: f.bytes }))) : files[0].bytes;
  if (share) {
    out.shared = navigator.share({ files: [new File([bytes], name, { type: TYPES[ext] || "application/octet-stream" })], title: share.title, text: share.text });
    return out;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: TYPES[ext] || "application/octet-stream" })), a = document.createElement("a");
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return out;
}
