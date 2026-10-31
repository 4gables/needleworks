/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The app's own verdict on a file it hands out: tests/pe900_check.py's stitch-quality rules, run on the file as
// written (decoded from its bytes, so the writer's splits and rounding count), so "Checked" means what the checker
// means. Until 2026-10-30 the download dialog said "Checked: it opens on a Brother PE900" for files the checker
// failed (density 25, a 12.7 mm stitch). Stitch units 0.1 mm.
import { COLOR_CHANGE, JUMP, STITCH, STOP, TRIM, readEmbroidery } from "./core/formats.js";

export const LIMIT = 24;       // needle hits per mm² per colour block (pe900_check MAX_PER_MM2)
export const MAX_STITCH = 121; // 12.1 mm, the longest needle move (pe900_check MAX_STITCH)
const TINY = 3;                // stitches under 0.3 mm, bar tie-ins (the first 6 after a jump, trim or thread change)
const TINY_SHARE = 0.02, SAME_SHARE = 0.01, SPARSE = 0.6;

// The densest 1 mm window in one colour block at any 0.1 mm grid offset (the machine's grid isn't ours: offset 0
// alone said 17 for peace.pes where pe900_check finds 25), and how many offset-0 cells sit under a window over the
// limit. A window lies in a 2 x 2 group of offset-0 cells, its corner cell possibly empty; only groups over the
// limit (or over the most found so far) are scanned. A STOP starts a block too (a pause between two blocks of one
// thread: pyembroidery reads it so).
export function peak(pattern) {
  const cells = new Map();
  let blk = 0;
  for (const [x, y, c] of pattern.stitches) {
    if (c === COLOR_CHANGE || c === STOP) { blk++; continue; }
    if (c !== STITCH) continue;
    const X = Math.round(x), Y = Math.round(y), k = `${blk},${Math.floor(X / 10)},${Math.floor(Y / 10)}`;
    if (!cells.has(k)) cells.set(k, []); cells.get(k).push([X, Y]);
  }
  let max = 0; const hot = new Set(), corners = new Set();
  for (const [k, v] of cells) { max = Math.max(max, v.length); const [b, cx, cy] = k.split(",").map(Number); for (const i of [0, 1]) for (const j of [0, 1]) corners.add(`${b},${cx - i},${cy - j}`); }
  for (const k of corners) {
    const [b, cx, cy] = k.split(",").map(Number), group = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => `${b},${cx + i},${cy + j}`);
    const pts = group.flatMap((g) => cells.get(g) || []);
    if (pts.length <= LIMIT && pts.length <= max) continue;
    for (let ox = 0; ox < 10; ox++) for (let oy = 0; oy < 10; oy++) {
      const x0 = cx * 10 + ox, y0 = cy * 10 + oy;
      let n = 0; for (const [X, Y] of pts) if (X >= x0 && X < x0 + 10 && Y >= y0 && Y < y0 + 10) n++;
      if (n > max) max = n;
      if (n > LIMIT) for (const g of group) if (cells.has(g)) hot.add(g);
    }
  }
  return { max, hot: hot.size };
}

// satin coverage as pe900_check measures it: in long zigzags (stitches 1.2-6 mm, each turning back on the last), the
// gap between hits on the same edge (mm, median); null with under 200 such gaps
export function satinGap(st) {
  // (in mm, as the checker works)
  const pts = st.filter((s) => s[2] === STITCH).map(([x, y]) => [x / 10, y / 10]), same = [];
  let run = [];
  for (let k = 2; k < pts.length; k++) {
    const [a, b, c] = [pts[k - 2], pts[k - 1], pts[k]], v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    if (l1 >= 1.2 && l1 <= 6 && l2 >= 1.2 && l2 <= 6 && (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2) < -0.85) run.push(Math.hypot(c[0] - a[0], c[1] - a[1]));
    else { if (run.length >= 6) same.push(...run); run = []; }
  }
  if (run.length >= 6) same.push(...run);
  if (same.length < 200) return null;
  same.sort((a, b) => a - b);
  return Math.round(same[same.length >> 1] * 100) / 100;
}

// needle moves as pe900_check counts them: longest stitch (from the last stitch or jump), tiny (under 0.3 mm, not
// among the first 6 after a jump/trim/thread change), same hole (0 mm, likewise), stitches
export function moves(st) {
  let longest = 0, tiny = 0, same = 0, n = 0, over = 0, prev = null, after = 0;
  for (const [x, y, c] of st) {
    if (c === STITCH) {
      n++;
      if (prev) {
        // (longest in float mm as the checker has it; tiny in whole 0.1 mm units, as it now counts them too)
        const d = Math.hypot(x / 10 - prev[0] / 10, y / 10 - prev[1] / 10), d10 = Math.hypot(Math.round(x) - Math.round(prev[0]), Math.round(y) - Math.round(prev[1]));
        if (d > longest) longest = d;
        if (d > MAX_STITCH / 10) over++;
        if (after > 6) { if (d10 > 0 && d10 < TINY) tiny++; if (d10 === 0) same++; }
        after++;
      }
    }
    // (a STOP doesn't count: pe900_check doesn't reset there either)
    if (c === JUMP || c === TRIM || c === COLOR_CHANGE) after = 0;
    if (c === STITCH || c === JUMP) prev = [x, y];
  }
  return { longest, tiny, same, stitches: n, over };
}

// what's wrong with a pattern (decoded from the file's bytes), in plain words: [{ key, text }] (empty: it passes)
export function verdict(pattern) {
  pattern = withStops(pattern);
  const m = moves(pattern.stitches), { max, hot } = peak(pattern), gap = satinGap(pattern.stitches), out = [];
  if (hot) out.push({ key: "dense", text: `${hot} ${hot === 1 ? "spot is" : "spots are"} too dense (up to ${max} needle hits per mm²; 24 is the most sold designs have): the thread can break or nest there.` });
  if (m.longest > MAX_STITCH / 10) out.push({ key: "long", text: `${m.over} ${m.over === 1 ? "stitch is" : "stitches are"} longer than the 12 mm the machine sews in one stitch (up to ${m.longest.toFixed(1)} mm).` });
  if (m.tiny > TINY_SHARE * m.stitches) out.push({ key: "tiny", text: `${m.tiny} stitches are shorter than 0.3 mm (${((100 * m.tiny) / m.stitches).toFixed(1)}%): they pile up thread and can break it.` });
  if (m.same > SAME_SHARE * m.stitches) out.push({ key: "same", text: `${m.same} stitches go back into the hole the needle is already in.` });
  if (gap != null && gap > SPARSE) out.push({ key: "sparse", text: `The satin stitches are far apart (${gap.toFixed(1)} mm on each edge; well-made designs 0.3–0.4 mm), so fabric may show through.` });
  return out;
}

// a thread change to the same PEC thread is a machine pause (pyembroidery's interpolate_duplicate_color_as_stop)
function withStops(pattern) {
  const pec = pattern.pec;
  if (!pec || pec.length < 2) return pattern;
  let k = 0;
  return { ...pattern, stitches: pattern.stitches.map((s) => (s[2] === COLOR_CHANGE && pec[++k] === pec[k - 1] ? [s[0], s[1], STOP] : s)) };
}

// the verdict on PES bytes (a file that won't decode is someone else's problem: validatePES refuses it first)
export function verdictOf(bytes) {
  try { return verdict(readEmbroidery(bytes, "check.pes")); } catch { return []; }
}

// A file that ends before its stitches do (cut short in a download or copy): PES/PEC whose stitch block runs past
// the end of the file or has no end marker, or a DST without its end code. It still decodes, as part of the design.
export function endsEarly(bytes, name = "") {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 8));
  const u24 = (i) => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
  if (head.startsWith("#PES") || head.startsWith("#PEC")) {
    const pec = head.startsWith("#PEC") ? 8 : bytes[8] | (bytes[9] << 8) | (bytes[10] << 16) | (bytes[11] << 24);
    const blk = pec + 512;
    if (!(pec > 0) || blk + 20 > bytes.length) return true;
    const end = blk + u24(blk + 2);
    if (end > bytes.length) return true;
    // (the end marker, 0xFF, inside the block: walk the stitches as the reader does)
    let i = blk + 20;
    while (i < end) {
      const v1 = bytes[i];
      if (v1 === 0xff) return false;
      if (v1 === 0xfe && bytes[i + 1] === 0xb0) { i += 3; continue; }
      i += v1 & 0x80 ? 2 : 1;
      i += bytes[i] & 0x80 ? 2 : 1;
    }
    return true;
  }
  if (/\.dst$/i.test(name)) {
    for (let i = 512; i + 3 <= bytes.length; i += 3) if ((bytes[i + 2] & 0xf3) === 0xf3) return false;
    return true;
  }
  return false;
}
