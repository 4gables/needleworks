// Embroidery file formats: write PES (v6: header + CEmbOne/CSewSeg blocks + PEC) and read PES / PEC / DST.
// Ported from pyembroidery so files match what it writes, byte for byte.
// Units are pyembroidery's: 0.1 mm, y down.
import { PEC_MATCH, PEC_THREADS, PEC_BLANK_ICON, hexToRgb, nearestIndex, pecThread, pyRound, rgbToHex } from "./threads.js";

export const STITCH = 0, JUMP = 1, TRIM = 2, STOP = 3, END = 4, COLOR_CHANGE = 5;

const MAX_STITCH = 70;   // 7 mm; longer stitches are split
const MAX_JUMP = 1210;

// ---------- byte helpers ----------
class Writer {
  constructor() { this.buf = new Uint8Array(1 << 16); this.pos = 0; }
  ensure(n) {
    if (this.pos + n <= this.buf.length) return;
    const b = new Uint8Array(Math.max(this.buf.length * 2, this.pos + n));
    b.set(this.buf); this.buf = b;
  }
  u8(v) { this.ensure(1); this.buf[this.pos++] = v & 0xff; }
  bytes(arr) { this.ensure(arr.length); this.buf.set(arr, this.pos); this.pos += arr.length; }
  u16(v) { this.u8(v); this.u8(v >> 8); }
  u24(v) { this.u8(v); this.u8(v >> 8); this.u8(v >> 16); }
  u32(v) { this.u16(v & 0xffff); this.u16((v >>> 16) & 0xffff); }
  f32(v) { const b = new Uint8Array(new Float32Array([v]).buffer); this.bytes(b); }
  ascii(s) { this.bytes(new TextEncoder().encode(s)); }
  pesString(s) {
    if (s == null) { this.u8(0); return; }
    const b = new TextEncoder().encode(s).slice(0, 255);
    this.u8(b.length); this.bytes(b);
  }
  at(pos, fn) { const p = this.pos; this.pos = pos; fn(); this.pos = p; }
  result() { return this.buf.slice(0, this.pos); }
}

class Reader {
  constructor(bytes) { this.b = bytes; this.pos = 0; }
  u8() { return this.pos < this.b.length ? this.b[this.pos++] : null; }
  u16() { const a = this.u8(), b = this.u8(); return a | (b << 8); }
  u24() { const a = this.u8(), b = this.u8(), c = this.u8(); return a | (b << 8) | (c << 16); }
  u24be() { const a = this.u8(), b = this.u8(), c = this.u8(); return (a << 16) | (b << 8) | c; }
  u32() { return (this.u16() | (this.u16() << 16)) >>> 0; }
  str(n) { const s = this.b.slice(this.pos, this.pos + n); this.pos += n; return new TextDecoder("latin1").decode(s); }
  pesString() { const n = this.u8(); return n ? this.str(n) : null; }
  skip(n) { this.pos += n; }
}

// ---------- normalise: absolute 0.1mm stitches -> rounded, long stitches split ----------
export function normalize(pattern) {
  const out = [];
  let nx = 0, ny = 0, started = false;
  for (const [x, y, c] of pattern.stitches) {
    if (c === STITCH || c === JUMP) {
      const rx = pyRound(x), ry = pyRound(y);
      const lim = c === STITCH ? MAX_STITCH : MAX_JUMP;
      if (started) {
        const dx = rx - nx, dy = ry - ny, n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / lim);
        for (let i = 1; i < n; i++) out.push([nx + pyRound((dx * i) / n), ny + pyRound((dy * i) / n), c]);
      }
      out.push([rx, ry, c]); nx = rx; ny = ry; started = true;
    } else {
      out.push([nx, ny, c]);  // commands sit at the needle position
    }
  }
  if (!out.length || out[out.length - 1][2] !== END) out.push([nx, ny, END]);
  return out;
}

function bounds(st) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of st) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}

function colorBlockCount(st) {
  let n = 0, init = true;
  for (const [, , c] of st) {
    if (c === STITCH) { if (init) { n++; init = false; } } else if (c === COLOR_CHANGE) init = true;
  }
  return n;
}

// ---------- PES writer ----------
// pattern: { stitches: [[x, y, cmd]] (0.1mm), threads: [{ color: "#rrggbb", description }] }
// Full v6 (pyembroidery write_pes version 6): PES header + CEmbOne/CSewSeg design blocks + PEC. The PE900 sizes and
// places the design from the PES blocks; a truncated file (PEC only) loaded half-size and off-centre on Ashley's machine.
export function writePES(pattern) {
  const st = normalize(pattern);
  if (!st.some((s) => s[2] === STITCH)) throw new Error("There's nothing to stitch.");
  if (st.filter((s) => s[2] === COLOR_CHANGE).length > 250) throw new Error("Too many colour changes for a PES file (250 max).");
  const threads = pattern.threads.slice();
  while (threads.length < colorBlockCount(st)) threads.push(threads[threads.length - 1] || { color: "#000000" });
  const w = new Writer();
  w.ascii("#PES0060");
  const pecPtr = w.pos; w.u32(0);
  w.u16(0x01); w.ascii("02");
  for (let i = 0; i < 5; i++) w.pesString(null);   // name, category, author, keywords, comments
  for (const v of [0, 0, 0x64, 0x64, 0, 0xc8, 0xc8, 0x64, 0x64, 0x64, 0x07, 0x13, 1, 1, 0, 100, 1, 0]) w.u16(v);
  w.u8(0);
  for (const v of [1, 0, 0, 1, 0, 0]) w.f32(v);
  w.u16(0); w.u16(0); w.u16(0);
  w.u16(threads.length);
  for (const t of threads) {
    const [r, g, b] = hexToRgb(t.color);
    w.pesString(t.catalog ?? null); w.u8(r); w.u8(g); w.u8(b); w.u8(0); w.u32(0xa);
    w.pesString(t.description ?? t.name ?? null); w.pesString(t.brand ?? null); w.pesString(null);
  }
  w.u16(1);                     // one design block
  w.u16(0xffff); w.u16(0);
  const log = writePESBlocks(w, st, threads);
  w.u32(0); w.u32(0);           // v6 node list
  log.forEach((_, i) => { w.u32(i); w.u32(0); });
  const pos = w.pos;
  w.at(pecPtr, () => w.u32(pos));
  const idx = writePEC(w, st, threads);
  // addendum: PEC colour list (with its count byte), then the thread colours
  w.u8(idx.length - 1); w.bytes(idx); w.bytes(new Uint8Array(127 - idx.length).fill(0x20));
  w.bytes(new Uint8Array(0x90 * threads.length));
  for (const t of threads) { const [r, g, b] = hexToRgb(t.color); w.u24((r << 16) | (g << 8) | b); }
  w.u16(0);
  return w.result();
}

function pesString16(w, s) { w.u16(s.length); w.ascii(s); }

// CEmbOne header + one CSewSeg holding every stitch run and jump, in coordinates from the design's bottom-left
function writePESBlocks(w, st, threads) {
  const [x0, y0, x1, y1] = bounds(st);
  const width = x1 - x0, height = y1 - y0;
  pesString16(w, "CEmbOne");
  for (let i = 0; i < 8; i++) w.u16(0);
  for (const v of [1, 0, 0, 1, 350 + 650 - width / 2, 100 + height + 900 - height / 2]) w.f32(v);  // 130x180 hoop
  w.u16(1); w.u16(0); w.u16(0); w.u16(Math.trunc(width)); w.u16(Math.trunc(height));
  w.bytes(new Uint8Array(8));
  const sectionsAt = w.pos; w.u16(0);
  w.u16(0xffff); w.u16(0);
  pesString16(w, "CSewSeg");
  const chart = threads.map((t) => [null, ...hexToRgb(t.color)]);
  const code = (i) => nearestIndex(hexToRgb((threads[i] || threads[threads.length - 1]).color), chart);
  let colorIndex = 0, colorCode = code(colorIndex++), sx = 0, sy = 0;
  let section = 0, flag = -1, previous = -1;
  const log = [];
  const emit = (pts, f) => {
    if (flag !== -1) w.u16(0x8003);
    flag = f;
    if (previous !== colorCode) { log.push([section, colorCode]); previous = colorCode; }
    w.u16(f); w.u16(colorCode); w.u16(pts.length);
    for (const [x, y] of pts) { w.u16(Math.trunc(x - x0)); w.u16(Math.trunc(y - y1)); }
    section++;
  };
  for (let i = 0; i < st.length;) {
    const c = st[i][2];
    let j = i; while (j < st.length && st[j][2] === c) j++;
    const run = st.slice(i, j); i = j;
    if (c === JUMP) emit([[sx, sy], run[run.length - 1]], 1);
    else if (c === COLOR_CHANGE) colorCode = code(colorIndex++);
    else if (c === STITCH) { [sx, sy] = run[run.length - 1]; emit(run, 0); }
  }
  w.u16(log.length);
  for (const [s, c] of log) { w.u16(s); w.u16(c); }
  w.at(sectionsAt, () => w.u16(section));
  w.u16(0); w.u16(0);
  return log;
}

function uniquePalette(threads) {
  const palette = PEC_MATCH.slice(), chart = new Array(palette.length).fill(null);
  const seen = new Set();
  for (const t of threads) {
    if (seen.has(t.color)) continue;
    seen.add(t.color);
    const rgb = hexToRgb(t.color);
    const i = nearestIndex(rgb, palette);
    if (i == null) break;
    palette[i] = null;
    chart[i] = [t.color, ...rgb];
  }
  return threads.map((t) => nearestIndex(hexToRgb(t.color), chart));
}

// The Brother thread the machine will show for each colour block: what writePES puts in the PEC palette.
// Two colours never share a thread there, so the second one to want a thread gets its next-closest.
export function machineThreads(threads) { return uniquePalette(threads).map(pecThread); }

function writePEC(w, st, threads) {
  const ext = bounds(st);
  w.ascii("LA:" + "Untitled".padEnd(16, " ") + "\r");
  w.bytes([0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0xff, 0x00]);
  w.u8(6); w.u8(38);  // icon byte stride, icon height
  const idx = uniquePalette(threads);
  w.bytes(new Uint8Array(12).fill(0x20));
  w.u8(idx.length - 1); w.bytes(idx);
  w.bytes(new Uint8Array(463 - idx.length).fill(0x20));
  // stitch block
  const start = w.pos;
  w.u8(0); w.u8(0); w.u24(0); w.bytes([0x31, 0xff, 0xf0]);
  w.u16(Math.round(ext[2] - ext[0])); w.u16(Math.round(ext[3] - ext[1]));
  w.u16(0x1e0); w.u16(0x1b0);
  // Brother machines read these two fields as the design box's top-left relative to the stitch origin and start
  // decoding after them. pyembroidery puts the opening jump here instead, so the machine dropped that jump and
  // showed Ashley's designs shifted and clipped to half size.
  for (const v of [-ext[0], -ext[1]]) { const b = 0x9000 | (v & 0xfff); w.u8(b >> 8); w.u8(b); }
  pecEncode(w, st);
  const len = w.pos - start;
  w.at(start + 2, () => w.u24(len));
  // icons: whole design, then one per colour block
  let icon = PEC_BLANK_ICON.slice();
  let block = [];
  for (const s of st) {
    if (s[2] === STITCH) block.push(s);
    else { drawIcon(ext, block, icon, 4); block = []; }
  }
  drawIcon(ext, block, icon, 4);
  w.bytes(icon);
  block = [];
  for (const s of st) {
    if (s[2] === STITCH) block.push(s);
    if (s[2] === COLOR_CHANGE) { icon = PEC_BLANK_ICON.slice(); drawIcon(ext, block, icon, 5); w.bytes(icon); block = []; }
  }
  icon = PEC_BLANK_ICON.slice(); drawIcon(ext, block, icon, 5); w.bytes(icon);
  return idx;
}

function drawIcon(ext, pts, g, buffer) {
  const stride = 6, gw = stride * 8, gh = g.length / stride;
  const dw = ext[2] - ext[0] || 1, dh = ext[3] - ext[1] || 1;
  const scale = Math.min((gw - buffer) / dw, (gh - buffer) / dh);
  const tx = -((ext[2] + ext[0]) / 2) * scale + gw / 2, ty = -((ext[3] + ext[1]) / 2) * scale + gh / 2;
  for (const [x, y] of pts) {
    const px = Math.floor(x * scale + tx), py = Math.floor(y * scale + ty);
    let i = py * stride + Math.trunc(px / 8);
    if (i < 0) i += g.length;           // python negative indexing
    if (i < 0 || i >= g.length) continue;
    g[i] |= 1 << (((px % 8) + 8) % 8);
  }
}

function pecValue(w, v, long, flag = 0) {
  if (!long && v > -64 && v < 63) { w.u8(v & 0x7f); return; }
  v = (v & 0x0fff) | 0x8000 | (flag << 8);
  w.u8(v >> 8); w.u8(v);
}

function pecEncode(w, st) {
  let colorTwo = true, jumping = true, init = true, xx = 0, yy = 0;
  for (const [x, y, c] of st) {
    const dx = pyRound(x - xx), dy = pyRound(y - yy);
    xx += dx; yy += dy;
    if (c === STITCH) {
      if (jumping) { if (dx !== 0 && dy !== 0) { pecValue(w, 0); pecValue(w, 0); } jumping = false; }
      pecValue(w, dx); pecValue(w, dy);
    } else if (c === JUMP) {
      jumping = true;
      const flag = init ? 0x10 : 0x20;
      pecValue(w, dx, true, flag); pecValue(w, dy, true, flag);
    } else if (c === COLOR_CHANGE) {
      if (jumping) { pecValue(w, 0); pecValue(w, 0); jumping = false; }
      w.bytes([0xfe, 0xb0, colorTwo ? 2 : 1]); colorTwo = !colorTwo;
    } else if (c === END) { w.u8(0xff); break; }
    init = false;
  }
}

// ---------- readers ----------
// Returns { stitches: [[x, y, cmd]], threads: [{ color, name }], format, version }
export function readEmbroidery(bytes, filename = "design.pes") {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 8));
  if (head.startsWith("#PES") || head.startsWith("#PEC")) return readPES(bytes);
  if (ext === "dst") return readDST(bytes);
  if (ext === "pes" || ext === "pec") return readPES(bytes);
  throw new Error(`Can't open .${ext} files yet. Try a PES, PEC or DST file.`);
}

function makeOut() {
  const o = { stitches: [], threads: [], x: 0, y: 0 };
  o.stitch = (dx, dy) => { o.x += dx; o.y += dy; o.stitches.push([o.x, o.y, STITCH]); };
  o.move = (dx, dy) => { o.x += dx; o.y += dy; o.stitches.push([o.x, o.y, JUMP]); };
  o.cmd = (c) => o.stitches.push([o.x, o.y, c]);
  return o;
}

function readPES(bytes) {
  const r = new Reader(bytes), out = makeOut();
  const sig = r.str(8);
  const chart = [];
  let version = sig.slice(4);
  if (sig === "#PEC0001") {
    readPEC(r, out, chart);
  } else {
    const pecPos = r.u32();
    const skips = { "#PES0060": [36, 24], "#PES0050": [24, 24], "#PES0055": [24, 24], "#PES0056": [24, 24],
      "#PES0070": [36, 24], "#PES0080": [38, 26] };
    try {
      if (skips[sig]) {
        r.skip(4); for (let i = 0; i < 5; i++) r.pesString();
        r.skip(skips[sig][0]); r.pesString(); r.skip(skips[sig][1]);
        readThreadChart(r, chart);
      } else if (sig === "#PES0090" || sig === "#PES0100") {
        r.skip(4); for (let i = 0; i < 5; i++) r.pesString();
        r.skip(14); r.pesString(); r.skip(sig === "#PES0090" ? 30 : 38); r.pesString(); r.skip(34);
        readThreadChart(r, chart);
      }
    } catch { chart.length = 0; }
    r.pos = pecPos;
    readPEC(r, out, chart);
  }
  return { stitches: out.stitches, threads: out.threads, format: "pes", version, toggles: out.toggles || [], pec: out.pec,
    misplaced: out.misplaced };
}

function readThreadChart(r, chart) {
  if (r.u16() !== 0 || r.u16() !== 0 || r.u16() !== 0) return;  // fills / motifs / feathers: give up
  const n = r.u16();
  for (let i = 0; i < n; i++) {
    const catalog = r.pesString();
    const rgb = r.u24be(); r.skip(5);
    const name = r.pesString(), brand = r.pesString(); r.pesString();
    chart.push({ color: rgbToHex([(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255]), name: name || "", brand, catalog });
  }
}

function readPEC(r, out, chart) {
  r.skip(3); r.str(16); r.skip(0xf);
  r.u8(); r.u8();             // icon stride, height
  r.skip(0xc);
  const changes = r.u8(), count = changes + 1;
  const colorBytes = Array.from(r.b.slice(r.pos, r.pos + count)); r.skip(count);
  out.pec = colorBytes;   // what the machine itself shows for each block
  const pec = (i) => { const t = PEC_THREADS[i % PEC_THREADS.length]; return t ? { color: rgbToHex([t[1], t[2], t[3]]), name: t[0], brand: "Brother" } : { color: "#000000", name: "Unknown" }; };
  if (!chart.length) colorBytes.forEach((b) => out.threads.push(pec(b)));
  else if (chart.length >= colorBytes.length) chart.forEach((t) => out.threads.push(t));
  else {
    const map = new Map(), pool = chart.slice();
    for (const b of colorBytes) {
      const k = b % PEC_THREADS.length;
      if (!map.has(k)) map.set(k, pool.length ? pool.shift() : pec(k));
      out.threads.push(map.get(k));
    }
  }
  r.skip(0x1d0 - changes);
  const blockEnd = r.u24() - 5 + r.pos;
  r.skip(3);
  const w = r.u16(), h = r.u16();
  r.skip(4);                  // 0x1e0, 0x1b0
  const s12 = (v) => { v &= 0xfff; return v > 0x7ff ? v - 0x1000 : v; };
  // design box offset (-left, -top), read the way Brother machines read it: not a stitch
  const px = s12((r.u8() << 8) | r.u8()), py = s12((r.u8() << 8) | r.u8());
  const s7 = (v) => (v > 63 ? v - 128 : v);
  for (;;) {
    let v1 = r.u8(), v2 = r.u8();
    if (v2 == null || (v1 === 0xff && v2 === 0x00)) break;
    if (v1 === 0xfe && v2 === 0xb0) { (out.toggles ||= []).push(r.u8()); out.cmd(COLOR_CHANGE); continue; }
    let jump = false, trim = false, x, y;
    if (v1 & 0x80) {
      if (v1 & 0x20) trim = true;
      if (v1 & 0x10) jump = true;
      x = s12((v1 << 8) | v2);
      v2 = r.u8(); if (v2 == null) break;
    } else x = s7(v1);
    if (v2 & 0x80) {
      if (v2 & 0x20) trim = true;
      if (v2 & 0x10) jump = true;
      const v3 = r.u8(); if (v3 == null) break;
      y = s12((v2 << 8) | v3);
    } else y = s7(v2);
    if (jump) out.move(x, y);
    else if (trim) { out.cmd(TRIM); out.move(x, y); }
    else out.stitch(x, y);
  }
  out.cmd(END);
  r.pos = blockEnd;
  // stitches outside the box: a pyembroidery-style file whose box fields are really its opening jump. The machine
  // loads it shifted and clipped; what was meant is that jump followed by the rest.
  const x0 = -px, y0 = -py;
  out.misplaced = out.stitches.some(([x, y, c]) => (c === STITCH || c === JUMP) &&
    (x < x0 - 1 || x > x0 + w + 1 || y < y0 - 1 || y > y0 + h + 1));
  if (out.misplaced) out.stitches = [[px, py, JUMP], ...out.stitches.map(([x, y, c]) => [x + px, y + py, c])];
}

function readDST(bytes) {
  const out = makeOut();
  const header = new TextDecoder("latin1").decode(bytes.slice(0, 512));
  for (const line of header.split(/[\r\n]/)) {
    if (line.startsWith("TC") && line.length > 3) {
      const [hex, desc] = line.slice(3).split(",").map((s) => s.trim());
      out.threads.push({ color: hex.startsWith("#") ? hex : "#" + hex, name: desc || "" });
    }
  }
  const bit = (b, p) => (b >> p) & 1;
  let sequin = false;
  for (let i = 512; i + 3 <= bytes.length; i += 3) {
    const [b0, b1, b2] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const dx = bit(b2, 2) * 81 - bit(b2, 3) * 81 + bit(b1, 2) * 27 - bit(b1, 3) * 27 + bit(b0, 2) * 9 - bit(b0, 3) * 9
      + bit(b1, 0) * 3 - bit(b1, 1) * 3 + bit(b0, 0) - bit(b0, 1);
    const dy = -(bit(b2, 5) * 81 - bit(b2, 4) * 81 + bit(b1, 5) * 27 - bit(b1, 4) * 27 + bit(b0, 5) * 9 - bit(b0, 4) * 9
      + bit(b1, 7) * 3 - bit(b1, 6) * 3 + bit(b0, 7) - bit(b0, 6));
    if ((b2 & 0xf3) === 0xf3) break;
    else if ((b2 & 0xc3) === 0xc3) { out.x += dx; out.y += dy; out.cmd(COLOR_CHANGE); }
    else if ((b2 & 0x43) === 0x43) { out.x += dx; out.y += dy; sequin = !sequin; }
    else if ((b2 & 0x83) === 0x83) out.move(dx, dy);
    else out.stitch(dx, dy);
  }
  out.cmd(END);
  return { stitches: interpolateTrims(out.stitches), threads: out.threads, format: "dst", version: "" };
}

// DST has no trim command: 3 jumps in a row mean "trim here" (pyembroidery's interpolate_trims),
// and jump runs that go nowhere are dropped.
function interpolateTrims(st, need = 3) {
  st = st.slice();
  let i = -1, ie = st.length - 1, x = 0, y = 0;
  let count = 0, start = 0, jdx = 0, jdy = 0, jumping = false, trimmed = true;
  while (i < ie) {
    i++;
    const s = st[i], dx = s[0] - x, dy = s[1] - y;
    x = s[0]; y = s[1];
    const c = s[2];
    if (c === STITCH) { trimmed = false; jumping = false; }
    else if (c === COLOR_CHANGE || c === TRIM) { trimmed = true; jumping = false; }
    if (c === JUMP) {
      if (!jumping) { jdx = 0; jdy = 0; count = 0; start = i; jumping = true; }
      count++; jdx += dx; jdy += dy;
      if (!trimmed && count === need) {
        st.splice(start, 0, [0, 0, TRIM]);
        start++; i++; ie++; trimmed = true;
      }
      if (jdx === 0 && jdy === 0) {
        st.splice(start, i + 1 - start);
        i = start - 1; ie = st.length - 1;
      }
    }
  }
  return st;
}

// ---------- shared helpers ----------
export function designStats(d) {
  const st = d.stitches;
  let n = 0, jumps = 0, trims = 0, changes = 0, longest = 0;
  const b = bounds(st.filter((s) => s[2] === STITCH));
  for (let i = 0; i < st.length; i++) {
    const c = st[i][2];
    if (c === STITCH) {
      n++;
      if (i && st[i - 1][2] === STITCH) longest = Math.max(longest, Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]));
    } else if (c === JUMP) jumps++;
    else if (c === TRIM) trims++;
    else if (c === COLOR_CHANGE) changes++;
  }
  return { stitches: n, jumps, trims, colorChanges: changes, bounds: b,
    widthMm: (b[2] - b[0]) / 10, heightMm: (b[3] - b[1]) / 10, longestMm: longest / 10 };
}

function findAscii(bytes, name, from, end) {
  const pat = new TextEncoder().encode(name);
  outer: for (let i = from; i + pat.length <= end; i++) {
    for (let k = 0; k < pat.length; k++) if (bytes[i + k] !== pat[k]) continue outer;
    return i;
  }
  return -1;
}

// The PES section's design block: { w, h, stitches: [[x, y, cmd]] } in its own coordinates (from the design's
// bottom-left), or null when the file has none (truncated PES).
function readSewSeg(bytes, end) {
  const one = findAscii(bytes, "CEmbOne", 12, end), seg = one < 0 ? -1 : findAscii(bytes, "CSewSeg", one, end);
  if (seg < 0) return null;
  const r = new Reader(bytes.subarray(0, end)), s16 = (v) => (v > 0x7fff ? v - 0x10000 : v);
  r.pos = one + 7 + 46; const w = r.u16(), h = r.u16();
  r.pos = seg + 7;
  const stitches = [];
  for (;;) {
    const flag = r.u16(); r.u16(); const n = r.u16();
    if (n == null || r.pos + n * 4 > end) return null;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([s16(r.u16()), s16(r.u16())]);
    if (flag === 1) stitches.push([...pts[pts.length - 1], JUMP]);
    else pts.forEach(([x, y]) => stitches.push([x, y, STITCH]));
    if (r.u16() !== 0x8003) break;
  }
  return { w, h, stitches };
}

// ---------- validation ----------
// Re-read a PES we're about to hand out and prove it decodes to exactly the stitches we meant.
// Returns { ok, error, decoded }. `source` (a pattern) is optional; without it the file only has to parse sanely.
export function validatePES(bytes, source = null, hoop = null) {
  const fail = (error) => ({ ok: false, error });
  if (!bytes || bytes.length < 0x200) return fail("The file is too short to be a PES file.");
  const sig = new TextDecoder("latin1").decode(bytes.slice(0, 8));
  if (!/^#PES\d{4}$/.test(sig)) return fail("The file doesn't start with a PES signature.");
  const pecAt = bytes[8] | (bytes[9] << 8) | (bytes[10] << 16) | (bytes[11] << 24);
  if (pecAt < 12 || pecAt >= bytes.length) return fail("The PES file points to a missing stitch section.");
  if (new TextDecoder("latin1").decode(bytes.slice(pecAt, pecAt + 3)) !== "LA:") return fail("The stitch section is damaged.");
  let d;
  try { d = readEmbroidery(bytes, "check.pes"); } catch (e) { return fail("The file couldn't be read back: " + e.message); }
  const got = d.stitches.filter((s) => s[2] === STITCH);
  if (!got.length) return fail("The file has no stitches.");
  if (d.misplaced) return fail("This file would load cut off on Brother machines (its design box doesn't match its stitches).");
  if (d.stitches[d.stitches.length - 1][2] !== END) return fail("The file has no end marker.");
  const blocks = d.stitches.filter((s) => s[2] === COLOR_CHANGE).length + 1;
  if (d.toggles.some((t, i) => t !== (i % 2 === 0 ? 2 : 1))) return fail("A colour-change marker in the file is damaged.");
  if (d.threads.length < blocks) return fail("The file has fewer thread colours than colour changes.");
  if (source) {
    // compare needle movements; PEC adds zero-length anchor stitches after jumps, which don't move the needle
    const moves = (arr) => arr.filter((s, i) => s[2] === STITCH && !(i > 0 && arr[i - 1][0] === s[0] && arr[i - 1][1] === s[1]));
    const want = moves(normalize(source)), gotMoves = moves(d.stitches);
    if (want.length !== gotMoves.length) return fail(`Stitch count changed in the file (${gotMoves.length} vs ${want.length}).`);
    for (let i = 0; i < want.length; i++) {
      if (want[i][0] !== gotMoves[i][0] || want[i][1] !== gotMoves[i][1]) return fail(`Stitch ${i + 1} moved when written to the file.`);
    }
    const wantBlocks = source.stitches.filter((s) => s[2] === COLOR_CHANGE).length + 1;
    if (wantBlocks !== blocks) return fail("Colour changes were lost when writing the file.");
    // the PES design block (what the PE900 sizes and places the design from) must hold the same stitches
    const seg = readSewSeg(bytes, pecAt);
    if (!seg) return fail("The file is missing its PES design block.");
    const segMoves = moves(seg.stitches);
    if (segMoves.length !== gotMoves.length) return fail("The PES design block doesn't match the stitches.");
    const ox = gotMoves[0][0] - segMoves[0][0], oy = gotMoves[0][1] - segMoves[0][1];
    if (segMoves.some((s, i) => s[0] + ox !== gotMoves[i][0] || s[1] + oy !== gotMoves[i][1]))
      return fail("The PES design block doesn't match the stitches.");
    const b = bounds(normalize(source));
    if (seg.w !== b[2] - b[0] || seg.h !== b[3] - b[1] || ox !== b[0] || oy !== b[3])
      return fail("The PES design block has the wrong size or position.");
  }
  if (hoop) {
    const b = bounds(got), w = (b[2] - b[0]) / 10, h = (b[3] - b[1]) / 10;
    if (w > hoop.w || h > hoop.h) return fail(`The design is ${w.toFixed(0)} × ${h.toFixed(0)} mm, bigger than the ${hoop.name}.`);
  }
  return { ok: true, decoded: d };
}
