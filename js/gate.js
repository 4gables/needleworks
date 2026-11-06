/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The one way out: every file the page hands over (Download, a design in two hoopings, one for each name, a fixed
// copy, the share sheet, a saved design, the cut files) goes through `handOut`, which judges every file first and
// hands over nothing when one is refused. A PES must read back as the design it was written from (`validatePES`)
// and break none of the rules the machine itself needs (quality.js `HARD`); the rest of the verdict (dense, tiny...)
// goes back with it to be said in plain words. Until 2026-10-31 each exit made its own checks: a 121-colour PES was
// saved byte for byte, and a names ZIP was saved before its files were judged. tests/gate.test.mjs fails if any other
// file starts a download or a share.
import { validatePES } from "./core/formats.js";
import { HARD, verdictOf } from "./quality.js";
import { zip } from "./zip.js";
import { safeName, uniqueName } from "./core/typed.js";

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
// a DXF cut file: ASCII group-code pairs from SECTION to EOF, every outline a closed POLYLINE of 3 or more vertices
// with numbers in reach (under 1 m)
function judgeDXF(f) {
  const t = (typeof f.bytes === "string" ? f.bytes : new TextDecoder().decode(f.bytes)).split(/\r?\n/);
  if (t.at(-1) === "") t.pop();
  if (t.length % 2 || t[0].trim() !== "0" || t[1] !== "SECTION" || t.at(-1) !== "EOF") return no(f, "The cut file is damaged.");
  let shapes = 0, vertices = -1, closed = false;
  for (let i = 0; i < t.length; i += 2) {
    const code = t[i].trim(), v = t[i + 1];
    if (code === "0") {
      if (v === "POLYLINE") { vertices = 0; closed = false; }
      else if (v === "VERTEX") { if (vertices < 0) return no(f, "The cut file is damaged."); vertices++; }
      else if (v === "SEQEND") { if (vertices < 3 || !closed) return no(f, "The cut file has a shape that isn't closed."); shapes++; vertices = -1; }
    } else if (code === "70" && vertices === 0 && t[i - 2]?.trim() !== "9") closed = (+v & 1) === 1;
    else if (code === "10" || code === "20") { const x = +v; if (!/^-?\d+(\.\d+)?$/.test(v) || !(Math.abs(x) < 1000)) return no(f, "The cut file has no size."); }
  }
  if (!shapes || vertices >= 0) return no(f, "The cut file has a shape that isn't closed.");
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
  if (/\.dxf$/i.test(f.name)) return judgeDXF(f);
  if (/\.json$/i.test(f.name)) return judgeJSON(f);
  if (!/\.pes$/i.test(f.name)) return no(f, "This page only saves PES files.");
  const check = validatePES(f.bytes, f.against || null, hoop);
  if (!check.ok) return no(f, check.error);
  const problems = verdictOf(f.bytes), hard = problems.filter((q) => HARD.has(q.key));
  return { ...f, ok: !hard.length, error: hard.map((q) => q.text).join(" "), problems, hard };
}

const TYPES = { pes: "application/octet-stream", zip: "application/zip", svg: "image/svg+xml", dxf: "application/dxf", json: "application/json" };
// Every file judged, then saved (one file, or a .zip of them all when `zip` names it) or shared (`share`: { title,
// text }, the phone's share sheet). Nothing is handed over when any file is refused. Returns { ok, files (judged),
// refused (the files refused), error }; a share resolves when the sheet closes.
// File names leave as the machine's USB reader can show them (`safeName` in core/typed.js: ASCII letters, digits, _ and
// -, never a Windows device name); a name that isn't is spelled that way here, and names in one ZIP differing only by
// case get _2, _3 (one file on a Mac, Windows or the USB stick).
const OK_NAME = /^[A-Za-z0-9_-]+(\.[A-Za-z]+)+$/;
function fileName(n, used) {
  const ext = /(\.[A-Za-z]+)+$/.exec(n)?.[0] || "", base = n.slice(0, n.length - ext.length);
  const b = OK_NAME.test(n) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base) ? base : safeName(base, "design");
  return uniqueName(b, used) + ext;
}
export function handOut(files, { hoop = null, zip: zipName = "", share = null } = {}) {
  const used = new Set();
  files = files.map((f) => ({ ...f, name: fileName(f.name, used) }));
  if (zipName) zipName = fileName(zipName, new Set());
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
