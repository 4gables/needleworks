/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Files for other machines: Tajima DST, Melco EXP, Janome JEF, Husqvarna Viking / Pfaff VP3 (docs/formats-out-spec.md,
// the clean-room spec; writer-changes.md W5, W6). They take the pattern writePES takes and sew the needle points of its
// PES file: the same normalize (7 mm splits, whole units), the same locks and trims, only the encoding differs.
// formats.js is never touched.
// JEF's threads (`JANOME`): a JEF holds only a palette number per colour, looked up in the machine's own list of 78
// Janome threads. Janome publishes neither that order nor screen colours, and the public lists disagree, so the table
// holds only the 51 numbers measured (spec section 7.1, 2026-11-13): JEF and VP3 files of 127 Janome-sponsored designs
// on sew4home.com (Janome America), paired block by block; the name and Janome catalogue number are Janome's, the
// screen colour the digitizer's VP3 colour for that thread. The other 27 numbers are never written.
// readBack is the inverse of these writers, for the exit gate (spec section 8): not a reader for other people's files.
import { COLOR_CHANGE, END, JUMP, STITCH, STOP, TRIM, normalize } from "./formats.js";
import { hexToRgb, nearestIndex, pyRound, rgbToHex } from "./threads.js";

// the formats offered, in the order the page lists them (`pes` is formats.js's own)
export const OUT_FORMATS = {
  pes: { ext: "pes", short: "PES", label: "Brother (PES)", machines: "Brother" },
  dst: { ext: "dst", short: "DST", label: "Tajima & most machines (DST)", machines: "Tajima or other" },
  exp: { ext: "exp", short: "EXP", label: "Melco & Bernina (EXP)", machines: "Melco or Bernina" },
  jef: { ext: "jef", short: "JEF", label: "Janome (JEF)", machines: "Janome" },
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

// ---------- JEF (spec 5) ----------
// JEF palette number -> [Janome's name, r, g, b, Janome catalogue number] (spec 7.1: measured, see the file header)
const MEASURED = {
  1: ["Black", 0, 0, 0, "002"], 2: ["White", 255, 255, 255, "001"], 3: ["Yellow", 255, 255, 23, "204"],
  4: ["Orange", 255, 102, 0, "203"], 5: ["Olive Green", 47, 89, 51, "219"], 6: ["Green", 35, 115, 54, "226"],
  7: ["Sky", 101, 194, 200, "217"], 8: ["Purple", 171, 90, 150, "208"], 10: ["Red", 255, 0, 0, "225"],
  11: ["Brown", 177, 112, 78, "214"], 13: ["Gold", 228, 195, 93, "003"], 15: ["Pale Violet", 172, 156, 199, "209"],
  16: ["Pale Yellow", 252, 242, 148, "210"], 17: ["Pale Pink", 249, 153, 183, "211"], 18: ["Peach", 250, 179, 129, "212"],
  19: ["Beige", 201, 164, 128, "213"], 20: ["Wine Red", 151, 5, 51, "215"], 23: ["Silver Gray", 229, 229, 229, "220"],
  25: ["Pale Aqua", 152, 214, 189, "227"], 26: ["Baby Blue", 178, 225, 227, "228"], 27: ["Powder Blue", 54, 139, 160, "229"],
  31: ["Salmon Pink", 249, 153, 162, "233"], 32: ["Coral", 249, 103, 107, "234"], 33: ["Burnt Orange", 227, 49, 31, "235"],
  34: ["Cinnamon", 226, 161, 136, "236"], 35: ["Umber", 181, 148, 116, "237"], 36: ["Blond", 228, 207, 153, "238"],
  37: ["Sunflower", 255, 203, 0, "239"], 38: ["Orchid Pink", 225, 173, 212, "240"], 39: ["Peony Purple", 195, 0, 126, "241"],
  40: ["Burgundy", 128, 0, 75, "242"], 41: ["Royal Purple", 84, 5, 113, "243"], 42: ["Cardinal Red", 177, 5, 37, "244"],
  43: ["Opal Green", 202, 224, 192, "245"], 44: ["Moss Green", 137, 152, 86, "246"], 45: ["Meadow Green", 92, 148, 26, "247"],
  47: ["Aquamarine", 93, 174, 148, "249"], 48: ["Emerald Green", 76, 191, 143, "250"], 49: ["Peacock Green", 0, 119, 114, "251"],
  50: ["Dark Gray", 89, 91, 97, "252"], 51: ["Ivory White", 255, 255, 242, "253"], 52: ["Hazel", 177, 88, 24, "254"],
  55: ["Cocoa Brown", 152, 105, 45, "257"], 56: ["Sienna", 77, 52, 25, "258"], 57: ["Sepia", 76, 51, 11, "259"],
  62: ["Green Dust", 178, 221, 83, "264"], 63: ["Crimson", 243, 54, 137, "265"], 67: ["Meadow", 76, 136, 31, "269"],
  68: ["Mustard", 228, 222, 121, "270"], 74: ["Vermilion", 240, 51, 31, "202"], 77: ["Beige Gray", 227, 196, 180, "223"],
};
// 79 entries, 0 and the 27 unmeasured numbers null (so matching never picks them)
export const JANOME = Array.from({ length: 79 }, (_, i) => MEASURED[i] || null);
const janomeEntry = (i) => { const t = JANOME[i]; return { index: i, name: t[0], number: t[4], hex: rgbToHex(t.slice(1, 4)) }; };

// Each thread's Janome thread (spec 5.4, the PES rule of formats-spec 4.7 run on JANOME): every colour not seen before
// claims the nearest unclaimed entry, the entry then holding that colour; each thread gets the entry holding the
// colour nearest its own. Two colours never share a number while one is free.
export function janomeThreads(threads) {
  const free = JANOME.slice(), claimed = JANOME.map(() => null), seen = new Set();
  for (const t of threads) {
    if (seen.has(t.color)) continue;
    seen.add(t.color);
    const rgb = hexToRgb(t.color), i = nearestIndex(rgb, free);
    if (i == null) break;
    claimed[i] = [null, ...rgb]; free[i] = null;
  }
  return threads.map((t) => janomeEntry(nearestIndex(hexToRgb(t.color), claimed)));
}
// the Janome thread of each colour block a JEF of this pattern names, in order (what the machine shows)
export const jefThreads = (pattern) => { const st = stitchList(pattern, "JEF"); return janomeThreads(segments(st, pattern.threads).S); };

// Janome's hoops as the format codes them (spec 5.3): [code, half-width, half-height] in 0.1 mm, the first that holds
// the design. The spec's choice (pyembroidery's codes, 1-3 agreed by the KDE notes): bigger than 200 x 200 mm is code 0.
const JEF_HOOPS = [[1, 250, 250], [3, 630, 550], [2, 700, 1000], [4, 1000, 1000]];
// the four room groups: 110 x 110, 50 x 50, 140 x 200 and "custom" as 140 x 200
const JEF_ROOM = [[550, 550], [250, 250], [700, 1000], [700, 1000]];

// offsets 32-115 from the extents with the origin (spec 5.2, 5.3): the hoop code, left, up, right, down, the four rooms
function jefHead([x0, y0, x1, y1]) {
  const left = -x0, up = -y0, right = x1, down = y1, fits = (hw, hh) => left <= hw && right <= hw && up <= hh && down <= hh;
  return [(JEF_HOOPS.find(([, hw, hh]) => fits(hw, hh)) || [0])[0], left, up, right, down,
    ...JEF_ROOM.flatMap(([hw, hh]) => (fits(hw, hh) ? [hw - left, hh - up, hw - right, hh - down] : [-1, -1, -1, -1]))];
}
class LE {
  constructor() { this.b = []; }
  u8(...v) { for (const x of v) this.b.push(x & 0xff); }
  u32(...v) { for (const x of v) this.u8(x, x >> 8, x >> 16, x >>> 24); }
}
const stamp = (d = new Date()) => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()].map((v, i) => String(v).padStart(i ? 2 : 4, "0")).join("");

export function writeJEF(pattern, date) {
  if (date !== undefined && !/^[0-9]{14}$/.test(String(date))) throw new Error("A JEF date is 14 digits.");
  const st = stitchList(pattern, "JEF"), { S } = segments(st, pattern.threads), N = S.length;
  const numbers = janomeThreads(S).map((t) => t.index);
  const run = [];
  for (const m of moveList(st, 127)) {
    if (m.k === "s") run.push(m.dx & 0xff, -m.dy & 0xff);
    else if (m.k === "j") run.push(0x80, 0x02, m.dx & 0xff, -m.dy & 0xff);
    else if (m.k === "t") run.push(0x80, 0x02, 0, 0, 0x80, 0x02, 0, 0, 0x80, 0x02, 0, 0);
    else if (m.k === "c") run.push(0x80, 0x01, 0, 0);
    else run.push(0x80, 0x10);
  }
  const o = new LE();
  o.u32(116 + 8 * N, 0x14);
  o.u8(...[...String(date ?? stamp())].map((c) => c.charCodeAt(0)), 0, 0);
  o.u32(N, run.length / 2, ...jefHead(box([...st, [0, 0]])));
  o.u32(...numbers); o.u32(...numbers.map(() => 13));
  o.u8(...run);
  return new Uint8Array(o.b);
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

// (the gate passes a design name second: only DST keeps one, and a JEF's second argument is its date)
export const WRITERS = { dst: writeDST, exp: writeEXP, jef: (p) => writeJEF(p), vp3: writeVP3 };

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

// JEF (spec 8): the header's counts and offsets, then the records from the offset at 0 to the end code
function readJEF(b) {
  const bad = (m = "The JEF file is damaged.") => ({ error: m });
  if (b.length < 118) return bad("The JEF file is cut short.");
  const u32 = (at) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
  const start = u32(0), N = u32(24);
  if (!N || start !== 116 + 8 * N || start > b.length) return bad();
  if (u32(28) * 2 !== b.length - start) return bad("The JEF file's length doesn't match its stitch count.");
  const palette = Array.from({ length: N }, (_, k) => u32(116 + 4 * k));
  if (palette.some((i) => !(i >= 1 && i <= 78))) return bad("The JEF file names a thread the machine doesn't have.");
  if (b[b.length - 2] !== 0x80 || b[b.length - 1] !== 0x10) return bad("The JEF file has no end marker.");
  const stitches = [];
  let x = 0, y = 0, changes = 0, zero = 0;
  for (let i = start; i < b.length; i += 2) {
    if (b[i] !== 0x80) { x += sb(b[i]); y -= sb(b[i + 1]); stitches.push([x, y, STITCH]); zero = 0; continue; }
    const code = b[i + 1];
    if (code === 0x10) { if (i + 2 !== b.length) return bad("The JEF file goes on past its end marker."); stitches.push([x, y, END]); break; }
    if (i + 4 > b.length) return bad("The JEF file is cut short.");
    i += 2;
    if (code === 0x02) {
      const dx = sb(b[i]), dy = sb(b[i + 1]);
      // (three jumps that don't move are a trim: spec 5.5)
      if (!dx && !dy) { if (++zero === 3) { stitches.push([x, y, TRIM]); zero = 0; } continue; }
      x += dx; y -= dy; stitches.push([x, y, JUMP]);
    } else if (code === 0x01) { changes++; stitches.push([x, y, COLOR_CHANGE]); }
    else return bad("The JEF file has an unknown code.");
    zero = 0;
  }
  if (stitches.at(-1)?.[2] !== END) return bad("The JEF file has no end marker.");
  if (changes !== N - 1) return bad("The JEF file's colour count is wrong.");
  // the header as writeJEF makes it from these stitches: its date, the reach from the hoop centre, the hoop and the room
  if (u32(4) !== 0x14 || !/^[0-9]{14}$/.test(String.fromCharCode(...b.subarray(8, 22))) || b[22] || b[23]) return bad();
  if (palette.some((_, k) => u32(116 + 4 * (N + k)) !== 13)) return bad();
  const head = jefHead(box([...stitches, [0, 0]]));
  if (head.some((v, k) => (v >>> 0) !== u32(32 + 4 * k))) return bad("The JEF file's size or hoop is wrong.");
  return { stitches, changes, palette };
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

const READERS = { dst: readDST, exp: readEXP, jef: readJEF, vp3: readVP3 };
// { stitches, changes } (VP3: and threads; JEF: and its palette numbers), or { error } when a structure check fails (spec 8's table)
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
  // (a JEF's thread numbers are the Janome threads the page names: the machine shows what the steps say)
  if (format === "jef" && jefThreads(pattern).some((t, k) => t.index !== r.palette[k])) return { ok: false, error: "The JEF file's threads aren't the ones listed." };
  return { ok: true };
}
