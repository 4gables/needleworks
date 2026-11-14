/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The one way out: every file the page hands over (Download, a design in two hoopings, one for each name, a fixed
// copy, the share sheet, a saved design, the cut files) goes through `handOut`, which judges every file first and
// hands over nothing when one is refused. A PES must read back as the design it was written from (`validatePES`)
// and break none of the rules the machine itself needs (quality.js `HARD`); the rest of the verdict (dense, tiny...)
// goes back with it to be said in plain words. Until 2026-10-31 each exit made its own checks: a 121-colour PES was
// saved byte for byte, and a names ZIP was saved before its files were judged. tests/gate.test.mjs fails if any other
// file starts a download or a share.
// Other machines' files (DST, EXP, VP3: `format`, docs/formats-out-spec.md section 8): the PES of the same pattern is
// judged exactly as above (stitches, fit, the machine's rules: the only check there is), then the file is written from
// that pattern and read back: the same needle points and colour changes, or nothing is handed over. The hoop given is
// the chosen machine's (machines.js): its field, and its stitch and colour limits where the maker publishes them.
import { COLOR_CHANGE, STITCH, readEmbroidery, validatePES } from "./core/formats.js";
import { WRITERS, validateOut } from "./core/formats-out.js";
import { HARD, verdictOf } from "./quality.js";
import { zip } from "./zip.js";
import { safeName, uniqueName } from "./core/typed.js";

const no = (f, error) => ({ ...f, ok: false, error, problems: [], hard: [] });
// a cut file's shapes must be the size its page and its name say (`_52x165mm`, sheet.js cutName): a cutter that
// opened MOM_cut_52x165mm.svg showed 56 x 169.2 mm, the shapes plus a 2 mm margin (round 10)
function sized(f, w, h, page = null) {
  if (page && (Math.abs(page[0] - w) > 0.15 || Math.abs(page[1] - h) > 0.15)) return no(f, "The cut file's page isn't the size of its shapes.");
  const m = f.name.match(/_(\d+)x(\d+)mm\.\w+$/);
  if (m && (Math.abs(+m[1] - w) > 0.55 || Math.abs(+m[2] - h) > 0.55)) return no(f, `The cut file's shapes are ${w.toFixed(1)} x ${h.toFixed(1)} mm, not the size in its name.`);
  return { ...f, ok: true, error: "", problems: [], hard: [] };
}
// a cut file: an SVG at actual size, every outline closed and every number a number
function judgeSVG(f) {
  const t = typeof f.bytes === "string" ? f.bytes : new TextDecoder().decode(f.bytes);
  const size = t.match(/<svg[^>]*\swidth="([\d.]+)mm"\s+height="([\d.]+)mm"/), paths = [...t.matchAll(/\sd="([^"]*)"/g)].map((m) => m[1]);
  if (!size || !/<\/svg>\s*$/.test(t)) return no(f, "The cut file is damaged.");
  if (!(+size[1] > 0 && +size[2] > 0 && +size[1] < 1000 && +size[2] < 1000)) return no(f, "The cut file has no size.");
  if (!paths.length || paths.some((d) => !/^(M-?[\d.]+,-?[\d.]+(L-?[\d.]+,-?[\d.]+){2,}Z)+$/.test(d))) return no(f, "The cut file has a shape that isn't closed.");
  const xy = paths.flatMap((d) => [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]));
  return sized(f, Math.max(...xy.map((q) => q[0])) - Math.min(...xy.map((q) => q[0])), Math.max(...xy.map((q) => q[1])) - Math.min(...xy.map((q) => q[1])), [+size[1], +size[2]]);
}
// a DXF cut file: ASCII group-code pairs from SECTION to EOF, every outline a closed POLYLINE of 3 or more vertices
// with numbers in reach (under 1 m)
function judgeDXF(f) {
  const t = (typeof f.bytes === "string" ? f.bytes : new TextDecoder().decode(f.bytes)).split(/\r?\n/);
  if (t.at(-1) === "") t.pop();
  if (t.length % 2 || t[0].trim() !== "0" || t[1] !== "SECTION" || t.at(-1) !== "EOF") return no(f, "The cut file is damaged.");
  let shapes = 0, vertices = -1, closed = false, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < t.length; i += 2) {
    const code = t[i].trim(), v = t[i + 1];
    if (code === "0") {
      if (v === "POLYLINE") { vertices = 0; closed = false; }
      else if (v === "VERTEX") { if (vertices < 0) return no(f, "The cut file is damaged."); vertices++; }
      else if (v === "SEQEND") { if (vertices < 3 || !closed) return no(f, "The cut file has a shape that isn't closed."); shapes++; vertices = -1; }
    } else if (code === "70" && vertices === 0 && t[i - 2]?.trim() !== "9") closed = (+v & 1) === 1;
    else if (code === "10" || code === "20") {
      const x = +v; if (!/^-?\d+(\.\d+)?$/.test(v) || !(Math.abs(x) < 1000)) return no(f, "The cut file has no size.");
      // (a vertex's own coordinates, not the POLYLINE's 0,0 reference point)
      if (t[i - (code === "10" ? 3 : 5)] === "VERTEX") { if (code === "10") { x0 = Math.min(x0, x); x1 = Math.max(x1, x); } else { y0 = Math.min(y0, x); y1 = Math.max(y1, x); } }
    }
  }
  if (!shapes || vertices >= 0) return no(f, "The cut file has a shape that isn't closed.");
  return sized(f, x1 - x0, y1 - y0);
}
// a saved design: what Open saved reads back
function judgeJSON(f) {
  try {
    const d = JSON.parse(typeof f.bytes === "string" ? f.bytes : new TextDecoder().decode(f.bytes));
    if (d?.needleworks !== 1 || !Array.isArray(d.pieces) || !d.pieces.length) return no(f, "The saved design is empty.");
  } catch { return no(f, "The saved design couldn't be written."); }
  return { ...f, ok: true, error: "", problems: [], hard: [] };
}

// One file: { name, bytes (an embroidery file's are always PES), against? (the pattern it was written from) } -> the
// same with ok, error (why it's refused), problems (quality.js verdict) and hard (the problems the machine can't take).
// `format` dst, exp or vp3: bytes become that file's (named so), the PES judged kept as `pes`.
const EMB = /\.(pes|dst|exp|vp3)$/i;
export function judge(f, hoop = null, format = "pes") {
  if (/\.svg$/i.test(f.name)) return judgeSVG(f);
  if (/\.dxf$/i.test(f.name)) return judgeDXF(f);
  if (/\.json$/i.test(f.name)) return judgeJSON(f);
  if (!EMB.test(f.name)) return no(f, "This page only saves embroidery files.");
  const check = validatePES(f.bytes, f.against || null, hoop);
  if (!check.ok) return no(f, check.error);
  // (the chosen machine's own published limits, machines.js `stitches` and `blocks`, past the rules every file keeps)
  const st = check.decoded.stitches, n = st.filter((e) => e[2] === STITCH).length, b = st.filter((e) => e[2] === COLOR_CHANGE).length + 1;
  if (hoop?.stitches && n > hoop.stitches) return no(f, `The design has ${n.toLocaleString()} stitches: the ${hoop.machineName} takes ${hoop.stitches.toLocaleString()} at most in one design.`);
  if (hoop?.blocks && b > hoop.blocks) return no(f, `The design has ${b - 1} thread changes: the ${hoop.machineName} takes ${hoop.blocks - 1} at most in one design.`);
  const problems = verdictOf(f.bytes), hard = problems.filter((q) => HARD.has(q.key));
  const out = { ...f, ok: !hard.length, error: hard.map((q) => q.text).join(" "), problems, hard };
  if (!WRITERS[format] || !out.ok) return out;
  try {
    const pattern = f.against || readEmbroidery(f.bytes, "x.pes"), bytes = WRITERS[format](pattern, f.name.replace(EMB, ""));
    const back = validateOut(bytes, format, pattern);
    if (!back.ok) return no(f, back.error);
    return { ...out, name: f.name.replace(EMB, "." + format), bytes, pes: f.bytes };
  } catch (err) { return no(f, `The ${format.toUpperCase()} file couldn't be written: ${err.message}`); }
}

const TYPES = { pes: "application/octet-stream", dst: "application/octet-stream", exp: "application/octet-stream", vp3: "application/octet-stream", zip: "application/zip", svg: "image/svg+xml", dxf: "application/dxf", json: "application/json" };
// Every file judged (`format`: embroidery files handed out as pes, dst, exp or vp3), then saved (one file, or a .zip
// of them all when `zip` names it) or shared (`share`: { title, text }, the phone's share sheet). Nothing is handed over when any file is refused. Returns { ok, files (judged),
// refused (the files refused), error }; a share resolves when the sheet closes.
// File names leave as the machine's USB reader can show them (`safeName` in core/typed.js: ASCII letters, digits, _ and
// -, never a Windows device name); a name that isn't is spelled that way here, and names in one ZIP differing only by
// case get _2, _3 (one file on a Mac, Windows or the USB stick).
// (an extension may hold digits after its first letter: .vp3)
const OK_NAME = /^[A-Za-z0-9_-]+(\.[A-Za-z][A-Za-z0-9]*)+$/;
function fileName(n, used) {
  const ext = /(\.[A-Za-z][A-Za-z0-9]*)+$/.exec(n)?.[0] || "", base = n.slice(0, n.length - ext.length);
  const b = OK_NAME.test(n) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base) ? base : safeName(base, "design");
  return uniqueName(b, used) + ext;
}
export function handOut(files, { hoop = null, zip: zipName = "", share = null, format = "pes" } = {}) {
  const used = new Set();
  files = files.map((f) => ({ ...f, name: fileName(EMB.test(f.name) ? f.name.replace(EMB, "." + format) : f.name, used) }));
  if (zipName) zipName = fileName(zipName, new Set());
  const judged = files.map((f) => judge(f, hoop, format)), refused = judged.filter((f) => !f.ok);
  const out = { ok: !refused.length, files: judged, refused, error: refused.map((f) => (files.length > 1 ? `${f.name}: ` : "") + f.error).join(" ") };
  if (!out.ok) return out;
  // (the judged file's bytes: as another format they are that file, not the PES it was judged as)
  const name = zipName || judged[0].name, ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  const bytes = zipName ? zip(judged.map((f) => ({ name: f.name, bytes: f.bytes }))) : judged[0].bytes;
  if (share) {
    out.shared = navigator.share({ files: [new File([bytes], name, { type: TYPES[ext] || "application/octet-stream" })], title: share.title, text: share.text });
    return out;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: TYPES[ext] || "application/octet-stream" })), a = document.createElement("a");
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return out;
}
