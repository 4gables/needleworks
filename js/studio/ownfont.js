/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Use your own font file for lettering. The file (.ttf or .otf) is read here, in the browser: it is never sent
// anywhere and never becomes part of the site. The browser draws it like the bundled fonts (a FontFace), so the
// lettering engine sews it the same way; this module reads the file's own tables for what the engine can't ask the
// browser: the font's name, the letters it has (`lacks`), and whether its shapes will sew well.
// The reader is written from the OpenType specification's table layouts (Microsoft Typography: the font directory,
// `head`, `hhea`, `hmtx`, `maxp`, `name`, `OS/2`, `cmap` formats 4, 6 and 12, `loca`/`glyf`, and Adobe's CFF and
// Type 2 charstring notes for `.otf` outlines). Nothing of anyone's code.
// Kept for the next visit, offline: the list of names in localStorage (so a saved design finds its font as the page
// starts), the files themselves in IndexedDB.
import { FONTS, fontWaits } from "../core/fonts.js";
import { registerGlyphs } from "../core/glyphs.js";

export const OWN = "Own ";                 // family prefix: "Own Pacifico"
export const PICK = "__own";               // the font list's last entry: "Use my own font file…"
const MAX_BYTES = 10e6, MAX_FONTS = 8;
const said = (msg) => Object.assign(new Error(msg), { said: true });

// ---------------------------------------------------------------- the file
class View {
  constructor(bytes, at = 0) { this.b = bytes; this.d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.at = at; }
  u8(o = this.adv(1)) { return this.d.getUint8(o); }
  u16(o = this.adv(2)) { return this.d.getUint16(o); }
  i16(o = this.adv(2)) { return this.d.getInt16(o); }
  u32(o = this.adv(4)) { return this.d.getUint32(o); }
  adv(n) { const o = this.at; this.at += n; return o; }
}

// name, letters, measures. Throws an Error with `said` (plain words for the page) when the file can't be used.
export function readFont(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (bytes.length < 12) throw said("That file is empty or cut short.");
  if (bytes.length > MAX_BYTES) throw said("That font file is over 10 MB, too big to keep in the browser.");
  const v = new View(bytes), tag = String.fromCharCode(...bytes.subarray(0, 4));
  if (tag === "wOFF" || tag === "wOF2") throw said("That's a web font (.woff). Use the font's .ttf or .otf file instead.");
  if (tag === "ttcf") throw said("That file holds several fonts in one (.ttc). Use a .ttf or .otf file with one font in it.");
  const kind = v.u32(0);
  if (kind !== 0x00010000 && tag !== "OTTO" && tag !== "true") throw said("That isn't a font file. Choose a .ttf or .otf file.");
  const n = v.u16(4), T = {};
  if (12 + 16 * n > bytes.length) throw said("That font file is cut short.");
  for (let i = 0; i < n; i++) { const o = 12 + 16 * i, t = String.fromCharCode(...bytes.subarray(o, o + 4)); T[t] = { at: v.u32(o + 8), len: v.u32(o + 12) }; if (T[t].at + T[t].len > bytes.length) throw said("That font file is cut short."); }
  for (const t of ["head", "cmap", "hhea", "hmtx", "maxp"]) if (!T[t]) throw said("That font file is missing parts a font needs. Try another copy of it.");
  const unitsPerEm = v.u16(T.head.at + 18) || 1000, locLong = v.i16(T.head.at + 50) === 1, glyphCount = v.u16(T.maxp.at + 4), nH = v.u16(T.hhea.at + 34);
  const cmap = readCmap(v, T.cmap), has = new Set(cmap.keys());
  const name = readName(v, T.name) || "My font";
  const adv = (g) => v.u16(T.hmtx.at + 4 * Math.min(g, nH - 1));
  let outline = null;
  try {
    if (T.glyf && T.loca) outline = glyfOutlines(v, T, locLong, glyphCount);
    else if (T["CFF "]) outline = cffOutlines(bytes.subarray(T["CFF "].at, T["CFF "].at + T["CFF "].len));
  } catch { outline = null; }   // (a table we can't follow: the font still draws, only its shapes go unmeasured)
  const shape = outline ? measure(cmap, outline, adv, unitsPerEm, T["OS/2"] && v.u16(T["OS/2"].at) >= 2 ? v.i16(T["OS/2"].at + 86) : 0) : null;
  const letters = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"].filter((c) => has.has(c.codePointAt(0))).length;
  if (letters < 40) throw said(`${name} has ${letters ? `only ${letters} of the 52` : "none of the"} letters A to Z and a to z: it may be a symbol font, or made for another alphabet. Lettering here needs those letters.`);
  return { name, has, unitsPerEm, shape, otf: tag === "OTTO" };
}

function readName(v, t) {
  if (!t) return "";
  const o = t.at, count = v.u16(o + 2), strs = o + v.u16(o + 4), got = {};
  for (let i = 0; i < count; i++) {
    const r = o + 6 + 12 * i, plat = v.u16(r), id = v.u16(r + 6), len = v.u16(r + 8), at = strs + v.u16(r + 10);
    if ((id !== 1 && id !== 4 && id !== 16) || at + len > t.at + t.len) continue;
    let s = "";
    if (plat === 3 || plat === 0) for (let k = 0; k + 1 < len; k += 2) s += String.fromCharCode(v.u16(at + k));
    else if (plat === 1) for (let k = 0; k < len; k++) s += String.fromCharCode(v.u8(at + k));
    else continue;
    s = s.replace(/[^\p{L}\p{N} .,'&()+-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
    const rank = (plat === 3 ? 2 : 1) + (v.u16(r + 4) === 0x409 ? 2 : 0);   // (Windows, English first)
    if (s && (!got[id] || rank > got[id].rank)) got[id] = { s, rank };
  }
  // (the family, else the typographic family, else the full name: "Pacifico", not "Pacifico Regular")
  return (got[1] || got[16] || got[4] || { s: "" }).s.replace(/\s+(Regular|Normal)$/i, "");
}

// code point -> glyph, from the best Unicode subtable
function readCmap(v, t) {
  const o = t.at, n = v.u16(o + 2), map = new Map();
  let best = null, score = -1;
  for (let i = 0; i < n; i++) {
    const r = o + 4 + 8 * i, plat = v.u16(r), enc = v.u16(r + 2), at = o + v.u32(r + 4), fmt = v.u16(at);
    const s = fmt !== 4 && fmt !== 12 && fmt !== 6 ? -1 : plat === 3 && enc === 10 ? 5 : plat === 0 && enc >= 4 ? 4 : plat === 3 && enc === 1 ? 3 : plat === 0 ? 2 : -1;
    if (s > score) { score = s; best = at; }
  }
  if (best == null) return map;
  const fmt = v.u16(best);
  if (fmt === 4) {
    const segs = v.u16(best + 6) / 2, ends = best + 14, starts = ends + 2 * segs + 2, deltas = starts + 2 * segs, offs = deltas + 2 * segs;
    for (let s = 0; s < segs; s++) {
      const end = v.u16(ends + 2 * s), start = v.u16(starts + 2 * s), delta = v.i16(deltas + 2 * s), off = v.u16(offs + 2 * s);
      if (start === 0xffff) continue;
      for (let c = start; c <= end && c < 0xffff; c++) {
        let g;
        if (!off) g = (c + delta) & 0xffff;
        else { const p = offs + 2 * s + off + 2 * (c - start); if (p + 2 > t.at + t.len) break; g = v.u16(p); if (g) g = (g + delta) & 0xffff; }
        if (g) map.set(c, g);
      }
    }
  } else if (fmt === 12) {
    const groups = v.u32(best + 12);
    for (let i = 0; i < groups; i++) { const r = best + 16 + 12 * i, a = v.u32(r), b = v.u32(r + 4), g = v.u32(r + 8); for (let c = a; c <= b && c - a < 70000; c++) if (g + c - a) map.set(c, g + c - a); }
  } else if (fmt === 6) {
    const first = v.u16(best + 6), cnt = v.u16(best + 8);
    for (let i = 0; i < cnt; i++) { const g = v.u16(best + 10 + 2 * i); if (g) map.set(first + i, g); }
  }
  return map;
}

// ---------------------------------------------------------------- outlines, as closed polylines in font units
const quad = (out, a, c, b) => { for (let k = 1; k <= 6; k++) { const t = k / 6, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } };
const cubic = (out, a, c, d, b) => { for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; out.push([u * u * u * a[0] + 3 * u * u * t * c[0] + 3 * u * t * t * d[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c[1] + 3 * u * t * t * d[1] + t * t * t * b[1]]); } };

function glyfOutlines(v, T, locLong, glyphCount) {
  const loc = (g) => T.glyf.at + (locLong ? v.u32(T.loca.at + 4 * g) : 2 * v.u16(T.loca.at + 2 * g));
  const get = (g, depth = 0) => {
    if (g < 0 || g >= glyphCount || depth > 6) return [];
    const a = loc(g), b = loc(g + 1);
    if (b <= a) return [];
    const r = new View(v.b, a), nc = r.i16();
    r.adv(8);
    if (nc >= 0) {
      const ends = []; for (let i = 0; i < nc; i++) ends.push(r.u16());
      const np = nc ? ends[nc - 1] + 1 : 0; r.adv(r.u16());
      const flags = []; while (flags.length < np) { const f = r.u8(); flags.push(f); if (f & 8) for (let k = r.u8(); k > 0; k--) flags.push(f); }
      const xs = [], ys = []; let x = 0, y = 0;
      for (const f of flags) { if (f & 2) x += (f & 16 ? 1 : -1) * r.u8(); else if (!(f & 16)) x += r.i16(); xs.push(x); }
      for (const f of flags) { if (f & 4) y += (f & 32 ? 1 : -1) * r.u8(); else if (!(f & 32)) y += r.i16(); ys.push(y); }
      const out = []; let from = 0;
      for (const end of ends) {
        const pts = []; for (let i = from; i <= end; i++) pts.push({ p: [xs[i], ys[i]], on: !!(flags[i] & 1) });
        from = end + 1;
        if (pts.length < 2) continue;
        // (start on an on-curve point, or between the first two off-curve ones)
        let s = pts.findIndex((q) => q.on), ring;
        if (s < 0) { const m = [(pts[0].p[0] + pts[pts.length - 1].p[0]) / 2, (pts[0].p[1] + pts[pts.length - 1].p[1]) / 2]; ring = [{ p: m, on: true }, ...pts]; } else ring = [...pts.slice(s), ...pts.slice(0, s)];
        const line = [ring[0].p]; let cur = ring[0].p, ctl = null;
        for (const q of [...ring.slice(1), ring[0]]) {
          if (q.on) { if (ctl) quad(line, cur, ctl, q.p); else line.push(q.p); cur = q.p; ctl = null; }
          else { if (ctl) { const m = [(ctl[0] + q.p[0]) / 2, (ctl[1] + q.p[1]) / 2]; quad(line, cur, ctl, m); cur = m; } ctl = q.p; }
        }
        out.push(line);
      }
      return out;
    }
    const out = [];
    for (let more = true; more;) {
      const f = r.u16(), child = r.u16();
      let dx = 0, dy = 0, m = [1, 0, 0, 1];
      if (f & 1) { dx = r.i16(); dy = r.i16(); } else { dx = (r.u8() << 24) >> 24; dy = (r.u8() << 24) >> 24; }
      if (!(f & 2)) dx = dy = 0;   // (point matching: rare, left where it is)
      const f2 = () => r.i16() / 16384;
      if (f & 8) { const s = f2(); m = [s, 0, 0, s]; } else if (f & 0x40) m = [f2(), 0, 0, f2()]; else if (f & 0x80) m = [f2(), f2(), f2(), f2()];
      for (const c of get(child, depth + 1)) out.push(c.map(([x, y]) => [m[0] * x + m[2] * y + dx, m[1] * x + m[3] * y + dy]));
      more = !!(f & 0x20);
    }
    return out;
  };
  return get;
}

// CFF (.otf): the Top DICT's CharStrings, each a Type 2 charstring run to its outline
function cffOutlines(b) {
  const v = new View(b);
  const index = (at) => {
    const count = v.u16(at); if (!count) return { items: [], end: at + 2 };
    const sz = v.u8(at + 2), off = (i) => { let n = 0; for (let k = 0; k < sz; k++) n = n * 256 + v.u8(at + 3 + i * sz + k); return n; }, base = at + 3 + (count + 1) * sz - 1, items = [];
    for (let i = 0; i < count; i++) items.push([base + off(i), base + off(i + 1)]);
    return { items, end: base + off(count) };
  };
  const dict = (a, e) => {
    const d = {}; let st = [];
    for (let i = a; i < e;) {
      const c = v.u8(i++);
      if (c <= 21) { const op = c === 12 ? 1200 + v.u8(i++) : c; d[op] = st; st = []; }
      else if (c === 28) { st.push(v.i16(i)); i += 2; }
      else if (c === 29) { st.push(v.d.getInt32(i)); i += 4; }
      else if (c === 30) { let s = ""; for (let done = false; !done;) { const x = v.u8(i++); for (const nb of [x >> 4, x & 15]) { if (nb === 15) { done = true; break; } s += "0123456789.EE -"[nb] + (nb === 12 ? "-" : ""); } } st.push(parseFloat(s.replace("E -", "E-")) || 0); }
      else if (c >= 32 && c <= 246) st.push(c - 139);
      else if (c >= 247 && c <= 250) st.push((c - 247) * 256 + v.u8(i++) + 108);
      else if (c >= 251 && c <= 254) st.push(-(c - 251) * 256 - v.u8(i++) - 108);
    }
    return d;
  };
  const names = index(v.u8(2)), tops = index(names.end), strings = index(tops.end), gsubrs = index(strings.end);
  const top = dict(...tops.items[0]), chars = index(top[17][0]);
  const priv = (p) => { if (!p) return []; const d = dict(p[1], p[1] + p[0]); return d[19] ? index(p[1] + d[19][0]).items : []; };
  let subrsFor;
  if (top[1236]) {   // (a CID font: each glyph's Private DICT by FDSelect)
    const fds = index(top[1236][0]).items.map(([a, e]) => priv(dict(a, e)[18])), sel = top[1237][0], fmt = v.u8(sel);
    subrsFor = (g) => {
      if (fmt === 0) return fds[v.u8(sel + 1 + g)] || [];
      const n = v.u16(sel + 1); for (let i = 0; i < n; i++) if (g >= v.u16(sel + 3 + 3 * i) && g < v.u16(sel + 6 + 3 * i)) return fds[v.u8(sel + 5 + 3 * i)] || [];
      return [];
    };
  } else { const s = priv(top[18]); subrsFor = () => s; }
  const bias = (list) => (list.length < 1240 ? 107 : list.length < 33900 ? 1131 : 32768);
  return (g) => {
    if (g < 0 || g >= chars.items.length) return [];
    const out = [], st = [], lsub = subrsFor(g);
    let x = 0, y = 0, line = null, stems = 0, first = true, steps = 0;
    const close = () => { if (line && line.length > 2) out.push(line); line = null; };
    const move = (dx, dy) => { close(); x += dx; y += dy; line = [[x, y]]; };
    const to = (dx, dy) => { x += dx; y += dy; (line ||= [[x - dx, y - dy]]).push([x, y]); };
    const curve = (a, b2, c, d, e, f) => { const p0 = [x, y], p1 = [x + a, y + b2], p2 = [p1[0] + c, p1[1] + d], p3 = [p2[0] + e, p2[1] + f]; line ||= [p0]; cubic(line, p0, p1, p2, p3); x = p3[0]; y = p3[1]; };
    const width = (want) => { if (first && st.length > want) st.shift(); first = false; };   // (an odd first argument is the width)
    const run = (a, e, depth) => {
      for (let i = a; i < e;) {
        if (++steps > 200000 || depth > 10) return true;
        const c = v.u8(i++);
        if (c === 28) { st.push(v.i16(i)); i += 2; continue; }
        if (c >= 32 && c <= 246) { st.push(c - 139); continue; }
        if (c >= 247 && c <= 250) { st.push((c - 247) * 256 + v.u8(i++) + 108); continue; }
        if (c >= 251 && c <= 254) { st.push(-(c - 251) * 256 - v.u8(i++) - 108); continue; }
        if (c === 255) { st.push(v.d.getInt32(i) / 65536); i += 4; continue; }
        if (c === 1 || c === 3 || c === 18 || c === 23) { if (first && st.length % 2) st.shift(); first = false; stems += st.length >> 1; st.length = 0; }
        else if (c === 19 || c === 20) { if (first && st.length % 2) st.shift(); first = false; stems += st.length >> 1; st.length = 0; i += (stems + 7) >> 3; }
        else if (c === 21) { width(2); move(st[0], st[1]); st.length = 0; }
        else if (c === 22) { width(1); move(st[0], 0); st.length = 0; }
        else if (c === 4) { width(1); move(0, st[0]); st.length = 0; }
        else if (c === 5) { for (let k = 0; k + 1 < st.length; k += 2) to(st[k], st[k + 1]); st.length = 0; }
        else if (c === 6 || c === 7) { let h = c === 6; for (const d of st) { if (h) to(d, 0); else to(0, d); h = !h; } st.length = 0; }
        else if (c === 8) { for (let k = 0; k + 5 < st.length; k += 6) curve(...st.slice(k, k + 6)); st.length = 0; }
        else if (c === 24) { let k = 0; for (; k + 7 < st.length; k += 6) curve(...st.slice(k, k + 6)); to(st[k], st[k + 1]); st.length = 0; }
        else if (c === 25) { let k = 0; for (; k + 7 < st.length; k += 2) to(st[k], st[k + 1]); curve(...st.slice(k, k + 6)); st.length = 0; }
        else if (c === 26) { let k = 0, dx = 0; if (st.length % 2) dx = st[k++]; for (; k + 3 < st.length; k += 4) { curve(dx, st[k], st[k + 1], st[k + 2], 0, st[k + 3]); dx = 0; } st.length = 0; }
        else if (c === 27) { let k = 0, dy = 0; if (st.length % 2) dy = st[k++]; for (; k + 3 < st.length; k += 4) { curve(st[k], dy, st[k + 1], st[k + 2], st[k + 3], 0); dy = 0; } st.length = 0; }
        else if (c === 30 || c === 31) {
          let h = c === 31, k = 0;
          for (; k + 3 < st.length; k += 4) {
            const last = st.length - k === 5 ? st[k + 4] : 0;
            if (h) curve(st[k], 0, st[k + 1], st[k + 2], last, st[k + 3]); else curve(0, st[k], st[k + 1], st[k + 2], st[k + 3], last);
            h = !h;
          }
          st.length = 0;
        }
        else if (c === 10 || c === 29) { const list = c === 10 ? lsub : gsubrs.items, s = list[st.pop() + bias(list)]; if (s && run(s[0], s[1], depth + 1)) return true; }
        else if (c === 11) return false;
        else if (c === 14) { close(); return true; }
        else if (c === 12) {
          const e2 = v.u8(i++);
          if (e2 === 35) { curve(...st.slice(0, 6)); curve(...st.slice(6, 12)); }
          else if (e2 === 34) { curve(st[0], 0, st[1], st[2], st[3], 0); curve(st[4], 0, st[5], -st[2], st[6], 0); }
          else if (e2 === 36) { curve(st[0], st[1], st[2], st[3], st[4], 0); curve(st[5], 0, st[6], st[7], st[8], -(st[1] + st[3] + st[7])); }
          else if (e2 === 37) {
            const dx = st[0] + st[2] + st[4] + st[6] + st[8], dy = st[1] + st[3] + st[5] + st[7] + st[9], hz = Math.abs(dx) > Math.abs(dy);
            curve(...st.slice(0, 6)); curve(st[6], st[7], st[8], st[9], hz ? st[10] : -dx, hz ? -dy : st[10]);
          }
          st.length = 0;
        }
        else st.length = 0;
      }
      return false;
    };
    run(chars.items[g][0], chars.items[g][1], 0); close();
    return out;
  };
}

// ---------------------------------------------------------------- will it sew well?
// Ink runs along scanlines (non-zero winding), across (stems) and up (bars), for a few plain letters: how thick the
// strokes are against the x-height, how even, and how many lines a single stroke is drawn with.
function runs(contours, at, axis) {
  const hits = [];
  for (const c of contours) for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length], a0 = a[1 - axis], b0 = b[1 - axis];
    if ((a0 <= at) === (b0 <= at)) continue;
    hits.push([a[axis] + ((at - a0) / (b0 - a0)) * (b[axis] - a[axis]), b0 > a0 ? 1 : -1]);
  }
  hits.sort((p, q) => p[0] - q[0]);
  const out = []; let w = 0, from = 0;
  for (const [x, d] of hits) { if (!w) from = x; w += d; if (!w && x - from > 0) out.push(x - from); }
  return out;
}
const box = (cs) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const c of cs) for (const [x, y] of c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
const pct = (list, p) => (list.length ? list.slice().sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor(p * list.length))] : 0);

function measure(cmap, outline, adv, unitsPerEm, sx) {
  const glyph = (ch) => { const g = cmap.get(ch.codePointAt(0)); return g ? outline(g) : []; };
  const xb = box(glyph("x")), xh = sx > 0 ? sx : xb[3] - xb[1] > 0 ? xb[3] - xb[1] : unitsPerEm / 2;
  const across = [], up = [];
  let lines = 0, tried = 0, joined = 0, lower = 0;
  for (const ch of "nouhmedbpl") {
    const cs = glyph(ch); if (!cs.length) continue;
    const [x0, y0, x1, y1] = box(cs);
    for (const f of [0.3, 0.5, 0.7]) across.push(...runs(cs, y0 + f * Math.min(xh, y1 - y0), 0).filter((r) => r < 0.7 * xh));
    for (const f of [0.35, 0.5, 0.65]) up.push(...runs(cs, x0 + f * (x1 - x0), 1).filter((r) => r < 0.7 * xh));
  }
  for (const ch of "lIi") { const cs = glyph(ch); if (!cs.length) continue; const [, y0, , y1] = box(cs); tried++; lines += runs(cs, y0 + 0.4 * (y1 - y0), 0).length; }
  for (const ch of "abcdefghijklmnopqrstuvwxyz") { const g = cmap.get(ch.codePointAt(0)), cs = g ? outline(g) : []; if (!cs.length) continue; lower++; if (box(cs)[2] >= adv(g) - 0.01 * unitsPerEm) joined++; }
  if (!across.length) return null;
  const stem = pct(across, 0.5), thin = Math.min(pct(across, 0.1), pct(up, 0.2) || 1e9);
  return { xh: xh / unitsPerEm, stem: stem / xh, thin: thin / xh, lines: tried ? lines / tried : 1, joined: lower ? joined / lower : 0 };
}

// What to tell the maker about a font, in plain words: [] when there's nothing to say. `size`: the lettering's
// x-height in mm, when known. Numbers: lettering is sewn along the middle of each stroke, as a satin up to a fifth
// of the x-height wide and from 0.8 mm, a single line of thread below that (docs/lettering.md "Satin width").
export function fontNotes(shape, size = 0) {
  if (!shape) return ["Needleworks couldn't measure this font's shapes, so look closely at the preview before you sew."];
  const out = [];
  if (shape.lines >= 1.6) out.push("These letters are drawn with more than one line (an outline or inline style). Each line is sewn on its own, so they come out busy and thin. A plain script or print font sews best.");
  else if (shape.stem > 0.3) out.push("These are bold letters. Lettering is sewn along the middle of each stroke, at most a fifth of the letter height wide, so they'll come out lighter than the font looks. For big bold letters, appliqué letters do it better.");
  if (shape.lines < 1.6 && shape.stem <= 0.3 && shape.thin < 0.35 * shape.stem && shape.stem > 0.1) out.push("This font has thick and hair-thin strokes. The thin parts sew as a single line of thread beside satin thick parts, and fine serifs may be lost. Bigger letters keep more of it.");
  if (size && shape.lines < 1.6) {
    const need = 0.8 / Math.max(0.12, Math.min(shape.stem, 0.2));
    if (size < need - 0.05) out.push(`At this size the letters sew as a single line of thread. From about ${Math.ceil(need * 2) / 2} mm tall they sew as satin.`);
  }
  return out;
}

// ---------------------------------------------------------------- kept in this browser
const LIST = "nw.ownfonts";
const listed = () => { try { const l = JSON.parse(localStorage.getItem(LIST) || "[]"); return Array.isArray(l) ? l.filter((f) => f && typeof f.family === "string" && f.family.startsWith(OWN)) : []; } catch { return []; } };
const list = (l) => { try { localStorage.setItem(LIST, JSON.stringify(l)); } catch {} };
const db = () => new Promise((ok, no) => {
  const r = indexedDB.open("needleworks-fonts", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("fonts");
  r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); ok(r.result); };
  r.onerror = () => no(r.error); r.onblocked = () => no(new Error("blocked"));
});
const tx = async (mode, f) => { const d = await db(); try { return await new Promise((ok, no) => { const t = d.transaction("fonts", mode), r = f(t.objectStore("fonts")); t.oncomplete = () => ok(r?.result); t.onerror = t.onabort = () => no(t.error); }); } finally { d.close(); } };

const shapes = new Map();   // family -> shape (for the note)
const entry = (f) => ({ family: f.family, name: f.name, note: "your own font", own: true, ...(f.print ? { print: true } : {}) });
function enlist(f, shape, has) {
  if (!FONTS.some((x) => x.family === f.family)) FONTS.push(entry(f));
  if (has) registerGlyphs(f.family, has);
  if (shape !== undefined) shapes.set(f.family, shape);
}
// a face for the family from the file's bytes, in place of any stand-in
async function face(family, bytes) {
  const ff = new FontFace(family, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  await ff.load();
  for (const old of [...document.fonts]) if (old.family.replace(/["']/g, "") === family) document.fonts.delete(old);
  document.fonts.add(ff);
}
// As the page starts: every remembered font is on the list at once (a saved design keeps its font), with a stand-in
// face that isn't loaded, so nothing is drawn or stitched in another font while its file comes out of IndexedDB
// (`loadFont` waits for it: fonts.js `fontWaits`).
if (typeof document !== "undefined" && typeof FontFace !== "undefined") {
  for (const f of listed()) {
    enlist(f);
    try { document.fonts.add(new FontFace(f.family, 'url("data:font/ttf;base64,")')); } catch {}
    fontWaits(f.family, (async () => {
      const bytes = await tx("readonly", (s) => s.get(f.family));
      if (!bytes) throw new Error("gone");
      const info = readFont(new Uint8Array(bytes));
      enlist(f, info.shape, info.has);
      await face(f.family, new Uint8Array(bytes));
    })().catch(() => { throw Object.assign(new Error(`Your font ${f.name} is no longer kept in this browser. Choose its file again (Font, "Use my own font file…").`), { font: true }); }));
  }
}

// Take a file the maker chose. -> { family, name, notes } ; throws an Error with `said` in plain words.
export async function addOwnFont(file) {
  const bytes = new Uint8Array(await file.arrayBuffer()), info = readFont(bytes);
  let family = OWN + info.name;
  const known = listed();
  if (!known.some((f) => f.family === family) && known.length >= MAX_FONTS) throw said(`${MAX_FONTS} of your own fonts are kept already. Remove one first (clear this site's data in the browser's settings).`);
  try { await face(family, bytes); } catch { throw said(`The browser couldn't draw ${info.name}. The file may be damaged: try another copy.`); }
  // (a script font's letters reach past their own width to join the next; a print font's don't)
  const f = { family, name: info.name, print: !info.shape || info.shape.joined < 0.8 };
  enlist(f, info.shape, info.has);
  const at = FONTS.findIndex((x) => x.family === family); if (at >= 0) FONTS[at] = entry(f);
  fontWaits(family, Promise.resolve());
  list([...known.filter((x) => x.family !== family), f]);
  let keptIt = true;
  try { await tx("readwrite", (s) => s.put(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), family)); } catch { keptIt = false; list(known.filter((x) => x.family !== family)); }
  return { family, name: info.name, notes: [...fontNotes(info.shape), ...(keptIt ? [] : ["This browser wouldn't keep the font (private window, or no room), so choose it again next time."])] };
}

// ---------------------------------------------------------------- the font list's own entry
export const ownFontOption = () => `<option value="${PICK}">Use my own font file…</option>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let lastSaid = "";
// under the font list: what to know about the piece's own font (or why the last file wasn't taken)
export function ownFontNote(p) {
  const own = p && typeof p.font === "string" && p.font.startsWith(OWN);
  const notes = own && shapes.has(p.font) ? fontNotes(shapes.get(p.font), +p.size || 0) : [];
  const lines = [...(lastSaid ? [lastSaid] : []), ...notes, ...(own ? ["Your font stays in this browser only. A design saved to a file needs the same font chosen again on another computer."] : [])];
  return lines.length ? `<p class="hint own-font-note" role="status">${lines.map(esc).join("<br>")}</p>` : "";
}
if (typeof document !== "undefined") {
  let input = null;
  const pick = (sel) => {
    const was = [...sel.options].find((o) => o.defaultSelected)?.value || FONTS[0].family;
    sel.value = was;
    input ||= Object.assign(document.createElement("input"), { type: "file", accept: ".ttf,.otf,font/ttf,font/otf", hidden: true, id: "own-font-file" });
    if (!input.isConnected) document.body.append(input);
    input.onchange = async () => {
      const file = input.files[0]; input.value = "";
      if (!file) return;
      let family = was;
      try { const got = await addOwnFont(file); family = got.family; lastSaid = ""; }
      catch (e) { lastSaid = e.said ? e.message : "That file couldn't be used as a font. Choose a .ttf or .otf file."; }
      const now = document.querySelector('#st-edit select[data-k="font"]') || sel;
      if (![...now.options].some((o) => o.value === family)) now.insertBefore(new Option(family.slice(OWN.length), family), now.options[now.options.length - 1]);
      now.value = family;
      now.dispatchEvent(new Event("input", { bubbles: true })); now.dispatchEvent(new Event("change", { bubbles: true }));
      lastSaid = "";
    };
    input.click();
  };
  for (const type of ["input", "change"]) document.addEventListener(type, (e) => {
    const t = e.target;
    if (!(t instanceof HTMLSelectElement) || t.dataset.k !== "font" || t.value !== PICK) return;
    e.stopImmediatePropagation();
    if (type === "change") pick(t);
  }, true);
}
