/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Files for other machines: Tajima DST, Melco EXP, Husqvarna Viking / Pfaff VP3 (docs/formats-out-spec.md, the
// clean-room spec; writer-changes.md W5). They take the pattern writePES takes and sew the needle points of its PES
// file: the same normalize (7 mm splits, whole units), the same locks and trims, only the encoding differs. formats.js
// is never touched. JEF waits for a measured Janome thread order (spec section 7) and is not here.
// readBack is the inverse of these writers, for the exit gate (spec section 8): not a reader for other people's files.
import { COLOR_CHANGE, END, JUMP, STITCH, STOP, TRIM, normalize } from "./formats.js";
import { hexToRgb, pyRound } from "./threads.js";

// the formats offered, in the order the page lists them (`pes` is formats.js's own)
export const OUT_FORMATS = {
  pes: { ext: "pes", short: "PES", label: "Brother (PES)", machines: "Brother" },
  dst: { ext: "dst", short: "DST", label: "Tajima & most machines (DST)", machines: "Tajima or other" },
  exp: { ext: "exp", short: "EXP", label: "Melco & Bernina (EXP)", machines: "Melco or Bernina" },
  vp3: { ext: "vp3", short: "VP3", label: "Husqvarna Viking & Pfaff (VP3)", machines: "Husqvarna Viking or Pfaff" },
};

// st (spec 2.2): normalize, cut after the first END; the two errors writePES has, worded for the format
function stitchList(pattern, fmt) {
  const all = normalize(pattern), end = all.findIndex((e) => e[2] === END), st = all.slice(0, end + 1);
  if (!st.some((e) => e[2] === STITCH)) throw new Error("There's nothing to stitch.");
  if (st.filter((e) => e[2] === COLOR_CHANGE || e[2] === STOP).length > 250) throw new Error(`Too many colour changes for a ${fmt} file (250 max).`);
  return st;
}

const isStop = (c) => c === COLOR_CHANGE || c === STOP;

// Segments (spec 2.3): st cut at every COLOR_CHANGE and STOP (the change itself in none), and the thread each sews:
// a COLOR_CHANGE moves on to the next thread, a STOP keeps it.
function segments(st, threads) {
  const segs = [[]], T = (threads || []).slice(), changes = st.filter((e) => e[2] === COLOR_CHANGE).length;
  while (T.length < changes + 1) T.push(T.length ? T[T.length - 1] : { color: "#000000" });
  const S = [T[0]];
  let t = 0;
  for (const e of st) {
    if (!isStop(e[2])) { segs[segs.length - 1].push(e); continue; }
    if (e[2] === COLOR_CHANGE) t++;
    segs.push([]); S.push(T[t]);
  }
  return { segs, S };
}

// The move list (spec 2.4): relative records with each axis within ±L. { k: "s" | "j" | "t" | "c" | "e", dx, dy }
function moveList(st, L) {
  const out = [];
  let ex = 0, ey = 0;
  for (const [x, y, c] of st) {
    if (c === STITCH || c === JUMP) {
      const dx = x - ex, dy = y - ey, n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / L);
      if (n === 0) { if (c === STITCH) out.push({ k: "s", dx: 0, dy: 0 }); }
      else {
        let px = 0, py = 0;
        for (let i = 1; i <= n; i++) {
          const qx = pyRound((dx * i) / n), qy = pyRound((dy * i) / n);
          out.push({ k: i === n && c === STITCH ? "s" : "j", dx: qx - px, dy: qy - py });
          px = qx; py = qy;
        }
      }
      ex = x; ey = y;
    } else if (c === TRIM) out.push({ k: "t" });
    else if (isStop(c)) out.push({ k: "c" });
    else if (c === END) out.push({ k: "e" });
  }
  return out;
}

// [minX, minY, maxX, maxY] of every entry (spec 2.5)
function box(st) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of st) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

// Where the fabric is pierced (spec 2.6): STITCH positions, less one at the needle point kept before it.
export function needlePoints(stitches) {
  const out = [];
  for (const [x, y, c] of stitches) {
    if (c !== STITCH) continue;
    const l = out[out.length - 1];
    if (!l || l[0] !== x || l[1] !== y) out.push([x, y]);
  }
  return out;
}

// ---------- DST (spec 3) ----------
// one axis's balanced-ternary digits, weights 81 27 9 3 1 (thresholds ⌊w/2⌋)
function trits(v) {
  const d = [];
  for (const w of [81, 27, 9, 3, 1]) {
    const h = Math.floor(w / 2);
    if (v > h) { d.push(1); v -= w; } else if (v < -h) { d.push(-1); v += w; } else d.push(0);
  }
  return d;
}
// per weight (81, 27, 9, 3, 1): [byte, x+1 bit, x-1 bit, y+1 bit, y-1 bit]
const DST_BITS = [[2, 2, 3, 5, 4], [1, 2, 3, 5, 4], [0, 2, 3, 5, 4], [1, 0, 1, 7, 6], [0, 0, 1, 7, 6]];
function dstRecord(dx, fileDy, jump) {
  const b = [0, 0, jump ? 0x83 : 0x03], tx = trits(dx), ty = trits(fileDy);
  DST_BITS.forEach(([i, xp, xn, yp, yn], k) => {
    if (tx[k] > 0) b[i] |= 1 << xp; else if (tx[k] < 0) b[i] |= 1 << xn;
    if (ty[k] > 0) b[i] |= 1 << yp; else if (ty[k] < 0) b[i] |= 1 << yn;
  });
  return b;
}
const pad = (v, n) => String(v).padStart(n, " ");

export function writeDST(pattern, name = "Untitled") {
  const st = stitchList(pattern, "DST"), rec = [];
  for (const m of moveList(st, 121)) {
    if (m.k === "s" || m.k === "j") rec.push(dstRecord(m.dx, -m.dy, m.k === "j"));
    else if (m.k === "t") rec.push(dstRecord(2, -2, true), dstRecord(-4, 4, true), dstRecord(2, -2, true));
    else if (m.k === "c") rec.push([0, 0, 0xc3]);
    else rec.push([0, 0, 0xf3]);
  }
  const [x0, y0, x1, y1] = box([...st, [0, 0]]), end = st[st.length - 1];
  const label = String(name).replace(/[^\x20-\x7e]/g, "_").slice(0, 16).padEnd(16, " ");
  const sign = (v) => (v < 0 ? "-" : "+") + pad(Math.abs(v), 5);
  const head = [`LA:${label}`, `ST:${pad(rec.length, 7)}`, `CO:${pad(rec.filter((r) => r[2] === 0xc3).length, 3)}`,
    `+X:${pad(x1, 5)}`, `-X:${pad(-x0, 5)}`, `+Y:${pad(-y0, 5)}`, `-Y:${pad(y1, 5)}`,
    `AX:${sign(end[0])}`, `AY:${sign(-end[1] || 0)}`, "MX:+    0", "MY:+    0", "PD:******"].map((s) => s + "\r").join("") + "\x1a";
  const out = new Uint8Array(512 + 3 * rec.length).fill(0x20);
  for (let i = 0; i < head.length; i++) out[i] = head.charCodeAt(i);
  rec.forEach((r, i) => out.set(r, 512 + 3 * i));
  return out;
}

// ---------- EXP (spec 4) ----------
export function writeEXP(pattern) {
  const st = stitchList(pattern, "EXP"), b = [];
  for (const m of moveList(st, 127)) {
    if (m.k === "s") b.push(m.dx & 0xff, -m.dy & 0xff);
    else if (m.k === "j") b.push(0x80, 0x04, m.dx & 0xff, -m.dy & 0xff);
    else if (m.k === "t") b.push(0x80, 0x80, 0x07, 0x00);
    else if (m.k === "c") b.push(0x80, 0x01, 0x00, 0x00);
  }
  return new Uint8Array(b);
}

// ---------- VP3 (spec 6) ----------
class BE {
  constructor() { this.b = []; }
  get at() { return this.b.length; }
  u8(...v) { for (const x of v) this.b.push(x & 0xff); }
  u16(v) { this.u8(v >> 8, v); }
  u32(v) { this.u8(v >>> 24, v >> 16, v >> 8, v); }
  i32(...v) { for (const x of v) this.u32(x | 0); }
  wide(s) { this.u16(2 * s.length); for (let i = 0; i < s.length; i++) this.u16(s.charCodeAt(i)); }
  str(s) { const e = new TextEncoder().encode(s); this.u16(e.length); this.u8(...e); }
  // a u32 length to fill in once its block is done: counts the bytes after the field
  hold() {
    const at = this.at; this.u32(0);
    return () => { const n = this.at - at - 4; [n >>> 24, n >> 16, n >> 8, n].forEach((v, i) => { this.b[at + i] = v & 0xff; }); };
  }
}
const PRODUCER = "Produced by     Software Ltd";
const s8 = (v) => v & 0xff;

export function writeVP3(pattern) {
  const st = stitchList(pattern, "VP3"), { segs, S } = segments(st, pattern.threads);
  const [x0, y0, x1, y1] = box(st), W = x1 - x0, H = y1 - y0, cx = (x0 + x1) * 50, cy = (y0 + y1) * 50;
  const o = new BE();
  o.u8(0x25, 0x76, 0x73, 0x6d, 0x25, 0); o.wide(PRODUCER);
  o.u8(0, 2, 0); const fileLen = o.hold();
  o.wide(""); o.i32(x1 * 100, -y0 * 100, x0 * 100, -y1 * 100);
  o.u32(st.filter((e) => e[2] === STITCH).length); o.u16(segs.length); o.u8(0x0c); o.u16(1);
  o.u8(0, 3, 0); const designLen = o.hold();
  o.i32(cx, -cy); o.u8(0, 0, 0); o.i32(-W * 50, W * 50, -H * 50, H * 50, W * 100, H * 100);
  o.wide(""); o.u8(0x64, 0x64); o.i32(4096, 0, 0, 4096); o.u8(0x78, 0x78, 0x50, 0x50, 1, 0); o.wide(PRODUCER);
  o.u16(segs.length);
  let sx = 0, sy = 0;
  segs.forEach((seg, k) => {
    const t = S[k], [ex, ey] = seg.length ? seg[seg.length - 1] : [sx, sy];
    o.u8(0, 5, 0); const blockLen = o.hold();
    o.i32(sx * 100 - cx, -(sy * 100 - cy));
    o.u8(1, 0, ...hexToRgb(t.color), 0, 0, 0, 5, 0x28);
    o.str(t.catalog == null ? "" : String(t.catalog));
    o.str(String(t.description ?? t.name ?? t.color));
    o.str(t.brand == null ? "" : String(t.brand));
    o.i32((ex - sx) * 100, -(ey - sy) * 100);
    o.u8(0, 1, 0); const runLen = o.hold();
    o.u8(0x0a, 0xf6, 0);
    let lx = sx, ly = sy;
    for (const [x, y, c] of seg) {
      if (c === STITCH) {
        const dx = x - lx, dy = y - ly;
        if (Math.abs(dx) <= 127 && Math.abs(dy) <= 127) o.u8(s8(dx), s8(dy));
        else { o.u8(0x80, 1); o.u16(dx); o.u16(dy); o.u8(0x80, 2); }
        lx = x; ly = y;
      } else if (c === TRIM || c === END) o.u8(0x80, 3);
    }
    runLen(); o.u8(0); blockLen();
    sx = ex; sy = ey;
  });
  designLen(); fileLen();
  return new Uint8Array(o.b);
}

export const WRITERS = { dst: writeDST, exp: writeEXP, vp3: writeVP3 };

// ---------- reading back (spec 8) ----------
const sb = (v) => (v > 127 ? v - 256 : v);

function readDST(b) {
  const head = String.fromCharCode(...b.subarray(0, Math.min(512, b.length)));
  const R = +(/ST:\s*(\d+)\r/.exec(head)?.[1] ?? NaN), CO = +(/CO:\s*(\d+)\r/.exec(head)?.[1] ?? NaN);
  if (!(b.length === 512 + 3 * R)) return { error: "The DST file's length doesn't match its stitch count." };
  if (b[b.length - 3] !== 0 || b[b.length - 2] !== 0 || b[b.length - 1] !== 0xf3) return { error: "The DST file has no end marker." };
  const stitches = [], X = [[2, 2, 81], [1, 2, 27], [0, 2, 9], [1, 0, 3], [0, 0, 1]];
  let x = 0, y = 0, changes = 0, ended = false;
  for (let i = 512; i + 3 <= b.length && !ended; i += 3) {
    const r = [b[i], b[i + 1], b[i + 2]];
    let dx = 0, fy = 0;
    // (each weight's x bits sit at `bit` and bit+1, its y bits at the pair 3 above: DST_BITS read the other way)
    for (const [k, bit, w] of X) {
      if (r[k] & (1 << bit)) dx += w;
      if (r[k] & (1 << (bit + 1))) dx -= w;
      const yp = bit === 2 ? 5 : 7, yn = yp - 1;
      if (r[k] & (1 << yp)) fy += w;
      if (r[k] & (1 << yn)) fy -= w;
    }
    if (r[2] === 0xf3) { ended = true; stitches.push([x, y, END]); }
    else if (r[2] === 0xc3) { changes++; stitches.push([x, y, COLOR_CHANGE]); }
    else if ((r[2] & 0x83) === 0x83) { x += dx; y -= fy; stitches.push([x, y, JUMP]); }
    else if ((r[2] & 0x83) === 0x03) { x += dx; y -= fy; stitches.push([x, y, STITCH]); }
    else return { error: "The DST file has a damaged record." };
  }
  if (!ended || stitches.length !== R) return { error: "The DST file ends before its end marker." };
  if (CO !== changes) return { error: "The DST file's colour-change count is wrong." };
  return { stitches, changes };
}

function readEXP(b) {
  if (b.length % 2) return { error: "The EXP file is cut short." };
  const stitches = [];
  let x = 0, y = 0, changes = 0;
  for (let i = 0; i < b.length; i += 2) {
    if (b[i] !== 0x80) { x += sb(b[i]); y -= sb(b[i + 1]); stitches.push([x, y, STITCH]); continue; }
    const code = b[i + 1];
    if (i + 4 > b.length) return { error: "The EXP file is cut short." };
    i += 2;
    if (code === 0x04) { x += sb(b[i]); y -= sb(b[i + 1]); stitches.push([x, y, JUMP]); }
    else if (code === 0x01) { changes++; stitches.push([x, y, COLOR_CHANGE]); }
    else if (code === 0x80) stitches.push([x, y, TRIM]);
    else return { error: "The EXP file has an unknown code." };
  }
  stitches.push([x, y, END]);
  return { stitches, changes };
}

function readVP3(b) {
  const bad = (m = "The VP3 file is damaged.") => ({ error: m });
  let p = 0;
  const u8 = () => b[p++], u16 = () => (b[p++] << 8) | b[p++], u32 = () => ((b[p++] << 24) | (b[p++] << 16) | (b[p++] << 8) | b[p++]) >>> 0;
  const i32 = () => u32() | 0, i16 = () => { const v = u16(); return v > 0x7fff ? v - 0x10000 : v; };
  const tag = (a, c) => b[p] === 0 && b[p + 1] === a && b[p + 2] === c && (p += 3, true);
  const skipWide = () => { const n = u16(); p += n; }, str = () => { const n = u16(), s = new TextDecoder().decode(b.subarray(p, p + n)); p += n; return s; };
  if (String.fromCharCode(...b.subarray(0, 6)) !== "%vsm%\0") return bad();
  p = 6; skipWide();
  if (!tag(2, 0)) return bad();
  if (p + 4 + u32() !== b.length) return bad("The VP3 file's length is wrong.");
  skipWide(); p += 16;
  const count = u32(), N = u16();
  if (u8() !== 0x0c || u16() !== 1) return bad();
  if (!tag(3, 0)) return bad();
  if (p + 4 + u32() !== b.length) return bad("The VP3 file's length is wrong.");
  const cx = i32(), cy = -i32();
  p += 3 + 16 + 8; skipWide(); p += 2 + 16 + 6; skipWide();
  if (u16() !== N) return bad("The VP3 file's colour count is wrong.");
  const stitches = [], threads = [];
  let x = 0, y = 0, made = 0;
  for (let k = 0; k < N; k++) {
    if (!tag(5, 0)) return bad();
    const end = p + 4 + u32();
    if (!(end === b.length ? k === N - 1 : b[end] === 0 && b[end + 1] === 5 && b[end + 2] === 0)) return bad("A VP3 colour block's length is wrong.");
    const rx = i32(), ry = i32(), sx = (rx + cx) / 100, sy = (cy - ry) / 100;
    if (sx !== x || sy !== y) return bad("A VP3 colour block doesn't start where the last one ended.");
    if (u8() !== 1 || u8() !== 0) return bad();
    const rgb = [u8(), u8(), u8()];
    p += 5;
    const catalog = str(), name = str(), brand = str();
    threads.push({ color: "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join(""), catalog, name, brand });
    const ex = sx + i32() / 100, ey = sy - i32() / 100;
    if (!tag(1, 0)) return bad();
    const runEnd = p + 4 + u32();
    if (runEnd !== end - 1 || b[runEnd] !== 0) return bad("A VP3 stitch run's length is wrong.");
    if (u8() !== 0x0a || u8() !== 0xf6 || u8() !== 0) return bad();
    if (k) { stitches.push([x, y, COLOR_CHANGE]); }
    while (p < runEnd) {
      if (b[p] !== 0x80) { x += sb(b[p]); y += sb(b[p + 1]); p += 2; stitches.push([x, y, STITCH]); made++; continue; }
      const code = b[p + 1]; p += 2;
      if (code === 0x03) stitches.push([x, y, TRIM]);
      else if (code === 0x01) { x += i16(); y += i16(); if (u8() !== 0x80 || u8() !== 0x02) return bad(); stitches.push([x, y, STITCH]); made++; }
      else return bad("The VP3 file has an unknown code.");
    }
    if (p !== runEnd) return bad("A VP3 stitch run's length is wrong.");
    p = end;
    x = ex; y = ey;
  }
  if (made !== count) return bad("The VP3 file's stitch count is wrong.");
  stitches.push([x, y, END]);
  return { stitches, changes: N - 1, threads };
}

const READERS = { dst: readDST, exp: readEXP, vp3: readVP3 };
// { stitches, changes } (VP3: and threads), or { error } when a structure check fails (spec 8's table)
export function readBack(bytes, format) {
  const r = READERS[format];
  if (!r) return { error: `Can't read back .${format} files.` };
  try { return r(bytes); } catch (err) { return { error: `The ${format.toUpperCase()} file couldn't be read back: ${err.message}` }; }
}

// Spec 8 steps 2 and 3 (step 1, the PES of the same pattern through validatePES, is the gate's): the file to hand out
// sews exactly the PES file's needle points, with as many colour changes.
export function validateOut(bytes, format, pattern) {
  const fmt = format.toUpperCase(), r = readBack(bytes, format);
  if (r.error) return { ok: false, error: r.error };
  const st = normalize(pattern), cut = st.slice(0, st.findIndex((e) => e[2] === END) + 1);
  const want = needlePoints(cut), got = needlePoints(r.stitches);
  if (want.length !== got.length) return { ok: false, error: `Stitch count changed in the ${fmt} file (${got.length} vs ${want.length}).` };
  const i = want.findIndex((q, k) => q[0] !== got[k][0] || q[1] !== got[k][1]);
  if (i >= 0) return { ok: false, error: `Stitch ${i + 1} moved when written to the ${fmt} file.` };
  if (r.changes !== cut.filter((e) => isStop(e[2])).length) return { ok: false, error: `Colour changes were lost when writing the ${fmt} file.` };
  return { ok: true };
}
