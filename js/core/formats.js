/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Embroidery files: the PES writer (v6 with a Brother-style PEC block), PES/PEC/DST readers, stats and a self-check.
// Stitch lists are [x, y, command] in 0.1 mm, y down.
import { MARGIN } from "./machines.js";
import { PEC_BLANK_ICON, PEC_MATCH, PEC_THREADS, hexToRgb, nearestIndex, pecThread, pyRound, rgbToHex } from "./threads.js";

export const STITCH = 0, JUMP = 1, TRIM = 2, STOP = 3, END = 4, COLOR_CHANGE = 5;

const utf8 = new TextEncoder();

// Bytes to text the way the WHATWG "latin1" label does it (windows-1252). Done by hand: Node's TextDecoder gives
// ISO-8859-1 for that label, which would make Node and the browser disagree on 0x80-0x9F.
const HIGH = [0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d,
  0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d,
  0x17e, 0x178];
function text(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b >= 0x80 && b < 0xa0 ? HIGH[b - 0x80] : b);
  return s;
}

// [minX, minY, maxX, maxY] over the entries that pass `keep` (loops: spreading big lists overflows the stack)
function extents(list, keep = () => true) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of list) {
    if (!keep(e)) continue;
    if (e[0] < x0) x0 = e[0];
    if (e[0] > x1) x1 = e[0];
    if (e[1] < y0) y0 = e[1];
    if (e[1] > y1) y1 = e[1];
  }
  return [x0, y0, x1, y1];
}

const count = (list, cmd) => { let n = 0; for (const e of list) if (e[2] === cmd) n++; return n; };

// Colour blocks that hold at least one stitch.
function blockCount(st) {
  let n = 0, fresh = true;
  for (const [, , c] of st) {
    if (c === STITCH) { if (fresh) n++; fresh = false; }
    else if (c === COLOR_CHANGE) fresh = true;
  }
  return n;
}

// Whole-number coordinates, stitches split to 7 mm and jumps to 121 mm (on the longer axis), commands at the needle,
// END at the end. The first stitch or jump is never split.
export function normalize(pattern) {
  const out = [];
  let nx = 0, ny = 0, started = false;
  for (const [x, y, c] of pattern.stitches) {
    if (c !== STITCH && c !== JUMP) { out.push([nx, ny, c]); continue; }
    const rx = pyRound(x), ry = pyRound(y);
    if (started) {
      const dx = rx - nx, dy = ry - ny, n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (c === STITCH ? 70 : 1210));
      for (let i = 1; i < n; i++) out.push([nx + pyRound((dx * i) / n), ny + pyRound((dy * i) / n), c]);
    }
    out.push([rx, ry, c]);
    nx = rx; ny = ry; started = true;
  }
  if (!out.length || out[out.length - 1][2] !== END) out.push([nx, ny, END]);
  return out;
}

// PEC palette index per thread: each distinct colour string claims its nearest free Brother thread (so no two share
// one), then every thread takes the nearest claimed one.
function pecIndices(threads) {
  const free = PEC_MATCH.slice(), claimed = new Array(65).fill(null), seen = new Set();
  for (const t of threads) {
    if (seen.has(t.color)) continue;
    seen.add(t.color);
    const rgb = hexToRgb(t.color), i = nearestIndex(rgb, free);
    if (i === null) break;
    free[i] = null;
    claimed[i] = [null, ...rgb];
  }
  return threads.map((t) => nearestIndex(hexToRgb(t.color), claimed));
}

export const machineThreads = (threads) => pecIndices(threads).map(pecThread);

// Little-endian byte sink; values are cut to their low bits (NaN writes 0).
class Out {
  constructor() { this.b = []; }
  get at() { return this.b.length; }
  u8(v) { this.b.push(v & 0xff); }
  u16(v) { this.u8(v); this.u8(v >> 8); }
  u24(v) { this.u16(v); this.u8(v >> 16); }
  u32(v) { this.u16(v); this.u16(v >> 16); }
  be16(v) { this.u8(v >> 8); this.u8(v); }
  fill(n, v = 0) { for (let i = 0; i < n; i++) this.b.push(v); }
  bytes(a) { for (const v of a) this.u8(v); }
  ascii(s) { for (let i = 0; i < s.length; i++) this.b.push(s.charCodeAt(i)); }
  f32(v) { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, v, true); this.bytes(new Uint8Array(d.buffer)); }
  // PES string: a length byte and up to 255 bytes of UTF-8; missing or empty is one 0x00
  str(v) {
    if (v == null) return this.u8(0);
    const e = utf8.encode(String(v)).subarray(0, 255);
    this.u8(e.length); this.bytes(e);
  }
  set(at, v, n) { for (let i = 0; i < n; i++) this.b[at + i] = (v >> (8 * i)) & 0xff; }
}

export function writePES(pattern) {
  const st = normalize(pattern);
  if (!st.some((e) => e[2] === STITCH)) throw new Error("There's nothing to stitch.");
  if (count(st, COLOR_CHANGE) > 250) throw new Error("Too many colour changes for a PES file (250 max).");
  const T = pattern.threads.slice(), blocks = blockCount(st);
  while (T.length < blocks) T.push(T.length ? T[T.length - 1] : { color: "#000000" });
  const N = T.length;
  if (N > 127) throw new Error("Too many threads for a PES file (127 max).");
  const rgbs = T.map((t) => hexToRgb(t.color));
  const [minX, minY, maxX, maxY] = extents(st), W = maxX - minX, H = maxY - minY;
  const o = new Out();

  // header
  o.ascii("#PES0060"); o.u32(0); o.u16(1); o.ascii("02"); o.fill(5);
  for (const v of [0, 0, 0x64, 0x64, 0, 0xc8, 0xc8, 0x64, 0x64, 0x64, 0x07, 0x13, 1, 1, 0, 100, 1, 0]) o.u16(v);
  o.u8(0);
  for (const v of [1, 0, 0, 1, 0, 0]) o.f32(v);
  o.fill(6);

  // thread chart
  o.u16(N);
  T.forEach((t, i) => {
    o.str(t.catalog); o.bytes(rgbs[i]); o.u8(0); o.u32(0x0a);
    o.str(t.description != null ? t.description : t.name); o.str(t.brand); o.u8(0);
  });

  // design block: CEmbOne (size and placement in a 130 x 180 mm hoop), then CSewSeg (the stitches by section,
  // relative to the bottom-left, with their thread-list colour codes)
  o.u16(1); o.u16(0xffff); o.u16(0); o.u16(7); o.ascii("CEmbOne"); o.fill(16);
  for (const v of [1, 0, 0, 1, 350 + 650 - W / 2, 100 + H + 900 - H / 2]) o.f32(v);
  o.u16(1); o.u16(0); o.u16(0); o.u16(W); o.u16(H); o.fill(8);
  const sAt = o.at;
  o.u16(0); o.u16(0xffff); o.u16(0); o.u16(7); o.ascii("CSewSeg");

  const code = (k) => nearestIndex(rgbs[Math.min(k, N - 1)], rgbs.map((c) => [null, ...c]));
  let cur = code(0), block = 1, lastEnd = [0, 0], sections = 0, logged;
  const log = [];
  const section = (flag, pts) => {
    if (sections) o.u16(0x8003);
    if (cur !== logged) { log.push([sections, cur]); logged = cur; }
    o.u16(flag); o.u16(cur); o.u16(pts.length);
    for (const [x, y] of pts) { o.u16(x - minX); o.u16(y - maxY); }
    sections++;
  };
  for (let i = 0; i < st.length;) {
    const c = st[i][2];
    let j = i;
    while (j + 1 < st.length && st[j + 1][2] === c) j++;
    if (c === JUMP) section(1, [lastEnd, st[j]]);
    else if (c === STITCH) { lastEnd = st[j]; section(0, st.slice(i, j + 1)); }
    else if (c === COLOR_CHANGE) cur = code(block++);
    i = j + 1;
  }
  o.set(sAt, sections, 2);
  o.u16(log.length);
  for (const [s, c] of log) { o.u16(s); o.u16(c); }
  o.u16(0); o.u16(0); o.u32(0); o.u32(0);
  log.forEach((_, i) => { o.u32(i); o.u32(0); });

  // PEC header
  const P = o.at, idx = pecIndices(T);
  o.set(8, P, 4);
  o.ascii("LA:Untitled        \r"); o.fill(12, 0x20); o.bytes([0xff, 0x00, 0x06, 0x26]); o.fill(12, 0x20);
  o.u8(N - 1); o.bytes(idx); o.fill(463 - N, 0x20);

  // PEC stitches, after the design box Brother machines read at B+16
  const B = o.at;
  o.fill(2); o.u24(0); o.bytes([0x31, 0xff, 0xf0]); o.u16(W); o.u16(H); o.u16(0x1e0); o.u16(0x1b0);
  o.be16(0x9000 | (-minX & 0xfff)); o.be16(0x9000 | (-minY & 0xfff));
  const long = (v, flag) => o.be16((v & 0xfff) | 0x8000 | (flag << 8));
  const short = (v) => (v > -64 && v < 63 ? o.u8(v & 0x7f) : long(v, 0));
  let xx = 0, yy = 0, toggle = 2, jumping = true;
  for (let i = 0; i < st.length; i++) {
    const [x, y, c] = st[i], dx = pyRound(x - xx), dy = pyRound(y - yy);
    xx += dx; yy += dy;
    if (c === STITCH) {
      if (jumping) { if (dx !== 0 && dy !== 0) o.fill(2); jumping = false; }
      short(dx); short(dy);
    } else if (c === JUMP) {
      jumping = true;
      const flag = i === 0 ? 0x10 : 0x20;
      long(dx, flag); long(dy, flag);
    } else if (c === COLOR_CHANGE) {
      if (jumping) { o.fill(2); jumping = false; }
      o.bytes([0xfe, 0xb0, toggle]); toggle = toggle === 2 ? 1 : 2;
    } else if (c === END) { o.u8(0xff); break; }
  }
  o.set(B + 2, o.at - B, 3);

  // thumbnails: the whole design, then one per colour section
  const dw = W || 1, dh = H || 1;
  const icon = (pts, border) => {
    const img = PEC_BLANK_ICON.slice(), s = Math.min((48 - border) / dw, (38 - border) / dh);
    const tx = 24 - ((maxX + minX) / 2) * s, ty = 19 - ((maxY + minY) / 2) * s;
    for (const [x, y] of pts) {
      const px = Math.floor(x * s + tx), py = Math.floor(y * s + ty);
      let i = py * 6 + Math.trunc(px / 8);
      if (i < 0) i += 228;
      if (i < 0 || i > 227) continue;
      img[i] |= 1 << (((px % 8) + 8) % 8);
    }
    o.bytes(img);
  };
  icon(st.filter((e) => e[2] === STITCH), 4);
  let part = [];
  for (const e of st) {
    if (e[2] === STITCH) part.push(e);
    else if (e[2] === COLOR_CHANGE) { icon(part, 5); part = []; }
  }
  icon(part, 5);

  // colour addendum
  o.u8(N - 1); o.bytes(idx); o.fill(127 - N, 0x20); o.fill(144 * N);
  for (const [r, g, b] of rgbs) o.u24(r * 65536 + g * 256 + b);
  o.u16(0);
  return new Uint8Array(o.b);
}

// Reader over bytes [0, end): past the end a byte is null and a wider integer counts the missing bytes as 0.
class In {
  constructor(bytes, end = bytes.length) { this.b = bytes; this.end = end; this.p = 0; }
  byte() { const v = this.p < this.end ? this.b[this.p] : null; this.p++; return v; }
  u8z() { return this.byte() ?? 0; }
  u16() { return this.u8z() | (this.u8z() << 8); }
  u24() { return this.u16() | (this.u8z() << 16); }
  u32() { return (this.u24() | (this.u8z() << 24)) >>> 0; }
  be16() { return (this.u8z() << 8) | this.u8z(); }
  skip(n) { this.p += n; }
  str() {
    const n = this.byte();
    if (!n) return null;
    const s = text(this.b.subarray(this.p, Math.min(this.p + n, this.end)));
    this.p += n;
    return s;
  }
}

const s7 = (v) => (v > 63 ? v - 128 : v);
const s12 = (v) => { v &= 0xfff; return v > 0x7ff ? v - 4096 : v; };
const s16 = (v) => (v > 0x7fff ? v - 0x10000 : v);

// Where each PES version keeps its thread chart, after "skip 4, five strings" at offset 12:
// [skip, string, skip, (string, skip)]
const CHART = {
  "#PES0050": [24, 24], "#PES0055": [24, 24], "#PES0056": [24, 24], "#PES0060": [36, 24], "#PES0070": [36, 24],
  "#PES0080": [38, 26], "#PES0090": [14, 30, 34], "#PES0100": [14, 38, 34],
};

function readChart(r, sig) {
  const gaps = CHART[sig];
  if (!gaps) return [];
  r.p = 12; r.skip(4);
  for (let i = 0; i < 5; i++) r.str();
  gaps.forEach((g, i) => { r.skip(g); if (i < gaps.length - 1) r.str(); });
  for (let i = 0; i < 3; i++) if (r.u16() !== 0) return [];   // fills, motifs, feathers: not read
  const n = r.u16(), out = [];
  for (let i = 0; i < n; i++) {
    const catalog = r.str(), rgb = [r.u8z(), r.u8z(), r.u8z()];
    r.skip(5);
    const name = r.str(), brand = r.str();
    r.str();
    out.push({ color: rgbToHex(rgb), name: name ?? "", brand, catalog });
  }
  return out;
}

function brotherThread(b) {
  const t = PEC_THREADS[b % 65];
  return t ? { color: rgbToHex(t.slice(1)), name: t[0], brand: "Brother" } : { color: "#000000", name: "Unknown" };
}

function readPES(bytes) {
  const r = new In(bytes), sig = text(bytes.subarray(0, 8)), version = sig.slice(4, 8);
  let pecAt = 8, chart = [];
  if (sig !== "#PEC0001") {
    r.p = 8; pecAt = r.u32();
    try { chart = readChart(r, sig); } catch { chart = []; }
  }

  // PEC header: colour count at +48, then the palette bytes
  r.p = pecAt + 48;
  const c = r.byte() ?? 0, pec = [...bytes.subarray(r.p, Math.min(r.p + c + 1, bytes.length))];
  let threads;
  if (!chart.length) threads = pec.map(brotherThread);
  else if (chart.length >= pec.length) threads = chart;
  else {
    const byKey = new Map();
    let next = 0;
    threads = pec.map((b) => {
      const k = b % 65;
      if (!byKey.has(k)) byKey.set(k, next < chart.length ? chart[next++] : brotherThread(b));
      return byKey.get(k);
    });
  }

  // stitch block, read as the machine does: the four bytes after 0x1E0, 0x1B0 are the design box, not a stitch
  r.p = pecAt + 514;
  r.u24(); r.skip(3);
  const w = r.u16(), h = r.u16();
  r.skip(4);
  const boxAt = r.p, bx = s12(r.be16()), by = s12(r.be16());
  const stitchesFrom = (at) => {
    r.p = at;
    const st = [], toggles = [];
    let x = 0, y = 0;
    for (;;) {
      const v1 = r.byte();
      let v2 = r.byte();
      if (v2 == null || (v1 === 0xff && v2 === 0)) break;
      if (v1 === 0xfe && v2 === 0xb0) { toggles.push(r.byte()); st.push([x, y, COLOR_CHANGE]); continue; }
      let jump = false, trim = false, dx, dy;
      if (v1 & 0x80) {
        trim = !!(v1 & 0x20); jump = !!(v1 & 0x10);
        dx = s12((v1 << 8) | v2);
        v2 = r.byte();
        if (v2 == null) break;
      } else dx = s7(v1);
      if (v2 & 0x80) {
        trim ||= !!(v2 & 0x20); jump ||= !!(v2 & 0x10);
        const v3 = r.byte();
        if (v3 == null) break;
        dy = s12((v2 << 8) | v3);
      } else dy = s7(v2);
      if (!jump && trim) st.push([x, y, TRIM]);
      x += dx; y += dy;
      st.push([x, y, jump || trim ? JUMP : STITCH]);
    }
    st.push([x, y, END]);
    return { st, toggles };
  };
  let { st, toggles } = stitchesFrom(boxAt + 4);

  // A file whose stitches leave its box was written pyembroidery's way: the "box" is really an opening jump, or, when
  // its first stitch is at the origin (no opening jump at all), the first stitches themselves (`00 00 01 80` read as
  // a box drew dense.pes 276 x 253 mm of garbage). Either way the stitches are read from where the box would be.
  const x0 = -bx, y0 = -by;
  const misplaced = st.some(([sx, sy, sc]) => (sc === STITCH || sc === JUMP) &&
    (sx < x0 - 1 || sx > x0 + w + 1 || sy < y0 - 1 || sy > y0 + h + 1));
  let stitches = st;
  if (misplaced) {
    // (two long-form values: an opening jump, as it always was read; anything else is the first stitches)
    if (bytes[boxAt] & 0x80 && bytes[boxAt + 2] & 0x80) stitches = [[bx, by, JUMP], ...st.map(([sx, sy, sc]) => [sx + bx, sy + by, sc])];
    else ({ st: stitches, toggles } = stitchesFrom(boxAt));
  }
  return { stitches, threads, format: "pes", version, toggles, pec, misplaced };
}

// DST: three jumps in a row mean a trim (DST has none); jump runs that come back to where they started go.
function interpolateTrims(list) {
  const s = list.slice();
  let px = 0, py = 0, jumping = false, trimmed = true, start = 0, n = 0, jdx = 0, jdy = 0;
  for (let i = 0; i < s.length; i++) {
    const [x, y, c] = s[i], dx = x - px, dy = y - py;
    px = x; py = y;
    if (c === STITCH) { trimmed = false; jumping = false; }
    else if (c === COLOR_CHANGE || c === TRIM) { trimmed = true; jumping = false; }
    if (c !== JUMP) continue;
    if (!jumping) { start = i; n = 0; jdx = 0; jdy = 0; jumping = true; }
    n++; jdx += dx; jdy += dy;
    if (!trimmed && n === 3) { s.splice(start, 0, [0, 0, TRIM]); start++; i++; trimmed = true; }
    if (jdx === 0 && jdy === 0) { s.splice(start, i - start + 1); i = start - 1; }
  }
  return s;
}

function readDST(bytes) {
  const threads = [];
  for (const line of text(bytes.subarray(0, 512)).split(/[\r\n]/)) {
    if (!line.startsWith("TC") || line.length <= 3) continue;
    const [color, name] = line.slice(3).split(",").map((p) => p.trim());
    threads.push({ color: color.startsWith("#") ? color : "#" + color, name: name || "" });
  }
  const bit = (v, k) => (v >> k) & 1, st = [];
  let x = 0, y = 0;
  for (let p = 512; p + 3 <= bytes.length; p += 3) {
    const b0 = bytes[p], b1 = bytes[p + 1], b2 = bytes[p + 2];
    const dx = 81 * (bit(b2, 2) - bit(b2, 3)) + 27 * (bit(b1, 2) - bit(b1, 3)) + 9 * (bit(b0, 2) - bit(b0, 3)) +
      3 * (bit(b1, 0) - bit(b1, 1)) + (bit(b0, 0) - bit(b0, 1));
    const dy = -(81 * (bit(b2, 5) - bit(b2, 4)) + 27 * (bit(b1, 5) - bit(b1, 4)) + 9 * (bit(b0, 5) - bit(b0, 4)) +
      3 * (bit(b1, 7) - bit(b1, 6)) + (bit(b0, 7) - bit(b0, 6)));
    if ((b2 & 0xf3) === 0xf3) break;
    x += dx; y += dy;
    if ((b2 & 0xc3) === 0xc3) st.push([x, y, COLOR_CHANGE]);
    else if ((b2 & 0x43) === 0x43) continue;   // sequin mode: the needle moves, nothing sewn
    else st.push([x, y, (b2 & 0x83) === 0x83 ? JUMP : STITCH]);
  }
  st.push([x, y, END]);
  return { stitches: interpolateTrims(st), threads, format: "dst", version: "" };
}

export function readEmbroidery(bytes, filename = "design.pes") {
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  const sig = text(bytes.subarray(0, 8));
  if (sig.startsWith("#PES") || sig.startsWith("#PEC")) return readPES(bytes);
  if (ext === "dst") return readDST(bytes);
  if (ext === "pes" || ext === "pec") return readPES(bytes);
  throw new Error(`Can't open .${ext} files yet. Try a PES, PEC or DST file.`);
}

export function designStats(design) {
  const s = design.stitches, [x0, y0, x1, y1] = extents(s, (e) => e[2] === STITCH);
  let longest = 0;
  for (let i = 1; i < s.length; i++) {
    if (s[i][2] === STITCH && s[i - 1][2] === STITCH) longest = Math.max(longest, Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
  }
  return {
    stitches: count(s, STITCH), jumps: count(s, JUMP), trims: count(s, TRIM), colorChanges: count(s, COLOR_CHANGE),
    bounds: [x0, y0, x1, y1], widthMm: (x1 - x0) / 10, heightMm: (y1 - y0) / 10, longestMm: longest / 10,
  };
}

// Stitches that move the needle (PEC's zero-length anchors after jumps left out).
const moves = (list) => list.filter((e, i) => e[2] === STITCH && (i === 0 || list[i - 1][0] !== e[0] || list[i - 1][1] !== e[1]));

function find(bytes, word, from, end) {
  outer: for (let i = from; i + word.length <= end; i++) {
    for (let k = 0; k < word.length; k++) if (bytes[i + k] !== word.charCodeAt(k)) continue outer;
    return i;
  }
  return -1;
}

// The PES design block (what PE-Design opens) as w, h and stitches relative to the bottom-left; null if missing.
function readDesignBlock(bytes, end) {
  const one = find(bytes, "CEmbOne", 12, end), seg = one < 0 ? -1 : find(bytes, "CSewSeg", one, end);
  if (seg < 0) return null;
  const r = new In(bytes, end);
  r.p = one + 53;
  const w = r.u16(), h = r.u16(), stitches = [];
  r.p = seg + 7;
  do {
    const flag = r.u16();
    r.u16();
    const n = r.u16();
    if (r.p + 4 * n > end) return null;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([s16(r.u16()), s16(r.u16())]);
    if (flag === 1) { const [x, y] = pts[n - 1]; stitches.push([x, y, JUMP]); }
    else for (const [x, y] of pts) stitches.push([x, y, STITCH]);
  } while (r.u16() === 0x8003);
  return { w, h, stitches };
}

// Whether a version 6 PES file's design block (what PE-DESIGN opens) holds the stitches its PEC block (what the
// machine sews) does; null when there's nothing to compare (PEC only, another version's layout, unreadable). A file
// pieced together from two designs opened as a star and satin box in PE-DESIGN and sewed a bigger star (round 6's
// disagree.pes). Same stitch count (one either way: pyembroidery's own files count an origin stitch on one side
// only) and the same size within 1 mm. Reading only: the writer is untouched.
export function designBlockAgrees(bytes) {
  if (text(bytes.subarray(0, 8)) !== "#PES0060") return null;
  try {
    const pecAt = bytes[8] | (bytes[9] << 8) | (bytes[10] << 16) | (bytes[11] << 24), block = readDesignBlock(bytes, pecAt);
    if (!block) return null;
    const got = moves(readPES(bytes).stitches), seg = moves(block.stitches);
    if (!got.length || !seg.length) return null;
    const [a0, b0, a1, b1] = extents(got), [c0, d0, c1, d1] = extents(seg);
    return Math.abs(got.length - seg.length) <= 1 && Math.abs(a1 - a0 - (c1 - c0)) <= 10 && Math.abs(b1 - b0 - (d1 - d0)) <= 10;
  } catch { return null; }
}

// Checks a PES file before it's handed out: it must read back as `source` (when given) and fit `hoop` (mm).
export function validatePES(bytes, source = null, hoop = null) {
  const no = (error) => ({ ok: false, error });
  if (!bytes || bytes.length < 512) return no("The file is too short to be a PES file.");
  if (!/^#PES[0-9]{4}$/.test(text(bytes.subarray(0, 8)))) return no("The file doesn't start with a PES signature.");
  const pecAt = bytes[8] | (bytes[9] << 8) | (bytes[10] << 16) | (bytes[11] << 24);
  if (pecAt < 12 || pecAt >= bytes.length) return no("The PES file points to a missing stitch section.");
  if (text(bytes.subarray(pecAt, pecAt + 3)) !== "LA:") return no("The stitch section is damaged.");
  let d;
  try { d = readEmbroidery(bytes, "check.pes"); } catch (e) { return no("The file couldn't be read back: " + e.message); }
  const st = d.stitches;
  if (!st.some((e) => e[2] === STITCH)) return no("The file has no stitches.");
  if (d.misplaced) return no("This file would load cut off on Brother machines (its design box doesn't match its stitches).");
  if (st[st.length - 1][2] !== END) return no("The file has no end marker.");
  if (!d.toggles.every((t, i) => t === (i % 2 ? 1 : 2))) return no("A colour-change marker in the file is damaged.");
  const blocks = count(st, COLOR_CHANGE) + 1;
  if (d.threads.length < blocks) return no("The file has fewer thread colours than colour changes.");

  if (source) {
    const norm = normalize(source), want = moves(norm), got = moves(st);
    if (want.length !== got.length) return no(`Stitch count changed in the file (${got.length} vs ${want.length}).`);
    for (let i = 0; i < want.length; i++) {
      if (want[i][0] !== got[i][0] || want[i][1] !== got[i][1]) return no(`Stitch ${i + 1} moved when written to the file.`);
    }
    if (count(source.stitches, COLOR_CHANGE) + 1 !== blocks) return no("Colour changes were lost when writing the file.");
    const block = readDesignBlock(bytes, pecAt);
    if (!block) return no("The file is missing its PES design block.");
    const seg = moves(block.stitches), bad = "The PES design block doesn't match the stitches.";
    if (seg.length !== got.length) return no(bad);
    const ox = got[0][0] - seg[0][0], oy = got[0][1] - seg[0][1];
    for (let i = 0; i < seg.length; i++) if (seg[i][0] + ox !== got[i][0] || seg[i][1] + oy !== got[i][1]) return no(bad);
    const [x0, y0, x1, y1] = extents(norm);
    if (block.w !== x1 - x0 || block.h !== y1 - y0 || ox !== x0 || oy !== y1) return no("The PES design block has the wrong size or position.");
  }

  if (hoop) {
    const [x0, y0, x1, y1] = extents(st, (e) => e[2] === STITCH), w = (x1 - x0) / 10, h = (y1 - y0) / 10;
    const lw = hoop.w - 2 * MARGIN, lh = hoop.h - 2 * MARGIN;
    if (w > lw || h > lh) return no(`The design is ${w.toFixed(0)} × ${h.toFixed(0)} mm, but the ${hoop.name} fits ${lw} × ${lh} mm.`);
  }
  return { ok: true, decoded: d };
}
