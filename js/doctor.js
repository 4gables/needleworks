// Design doctor for opened files: what might go wrong at the machine, a thickness map, and gentle fixes (resize
// 80-120 %, drop tiny stitches, thin the densest spots). Stitch units 0.1 mm; the PES writer stays untouched.
import { COLOR_CHANGE, JUMP, STITCH, TRIM } from "./core/formats.js";
import { relieve } from "./core/design.js";

const LIMIT = 24;   // needle hits per mm² per colour block: the densest spot in sold designs (pe900_check.py)

// hits per 1 mm cell, the most in any one colour block: Map "cx,cy" -> count
export function heat(pattern) {
  const cells = new Map(), out = new Map();
  let blk = 0;
  for (const [x, y, c] of pattern.stitches) {
    if (c === COLOR_CHANGE) { blk++; continue; }
    if (c !== STITCH) continue;
    const k = `${blk},${Math.floor(x / 10)},${Math.floor(y / 10)}`;
    cells.set(k, (cells.get(k) || 0) + 1);
  }
  for (const [k, n] of cells) { const xy = k.slice(k.indexOf(",") + 1); if (n > (out.get(xy) || 0)) out.set(xy, n); }
  return out;
}

export function checkup(pattern) {
  const st = pattern.stitches, h = heat(pattern);
  let tiny = 0, long = 0, last = null, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
  for (const [x, y, c] of st) {
    if (c === STITCH) {
      n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      if (last) { const d = Math.hypot(x - last[0], y - last[1]); if (d > 0 && d < 3) tiny++; if (d > 100) long++; }
      last = [x, y];
    } else if (c === JUMP) last = [x, y];
    else if (c === TRIM || c === COLOR_CHANGE) last = null;
  }
  const max = Math.max(0, ...h.values()), hot = [...h.values()].filter((v) => v > LIMIT).length;
  const sqin = Math.max(((x1 - x0) / 254) * ((y1 - y0) / 254), 0.1);
  return { stitches: n, tiny, long, max, hot, perSqIn: Math.round(n / sqin), satinGap: satinGap(st) };
}

// satin coverage, as pe900_check.py measures it: in long zigzags, the gap between hits on the same edge (mm, median);
// sold designs 0.30-0.42. null when there's too little satin to judge.
function satinGap(st) {
  const pts = st.filter((s) => s[2] === STITCH), same = [];
  let run = [];
  for (let k = 2; k < pts.length; k++) {
    const [a, b, c] = [pts[k - 2], pts[k - 1], pts[k]], v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    if (l1 >= 12 && l1 <= 60 && l2 >= 12 && l2 <= 60 && (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2) < -0.85) run.push(Math.hypot(c[0] - a[0], c[1] - a[1]) / 10);
    else { if (run.length >= 6) same.push(...run); run = []; }
  }
  if (run.length >= 6) same.push(...run);
  if (same.length < 200) return null;
  same.sort((a, b) => a - b);
  return Math.round(same[same.length >> 1] * 100) / 100;
}

// a new pattern: scaled about its centre, tiny stitches merged into the next, long ones split, dense spots thinned
export function fix(pattern, { scale = 1, tiny = false, thin = false } = {}) {
  let st = pattern.stitches;
  if (scale !== 1) {
    // (a loop, not Math.min(...pts): spreading 110k+ stitches overflows the stack)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y, c] of st) if (c === STITCH || c === JUMP) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // whole 0.1 mm units here, so the writer's rounding can't collapse a stitch the check then misses
    st = st.map(([x, y, c]) => [Math.round(cx + (x - cx) * scale), Math.round(cy + (y - cy) * scale), c]);
  }
  // a file that starts with a stitch at the origin (gnome.pes) starts somewhere else once scaled: jump there first,
  // as our own designs do, or the needle sews a stitch out from the origin
  const first = st.find((s) => s[2] === STITCH || s[2] === JUMP), out = first && first[2] === STITCH ? [[first[0], first[1], JUMP]] : [];
  let last = null;
  for (let i = 0; i < st.length; i++) {
    const [x, y, c] = st[i];
    if (c === STITCH && last) {
      const d = Math.hypot(x - last[0], y - last[1]);
      if (scale !== 1 && d === 0) continue;
      // (keep the stitch before a command: it's the end of a run or a lock)
      if (tiny && d < 3 && st[i + 1]?.[2] === STITCH) continue;
      if (d > 120) { const k = Math.ceil(d / 100); for (let j = 1; j < k; j++) out.push([last[0] + ((x - last[0]) * j) / k, last[1] + ((y - last[1]) * j) / k, STITCH]); }
    }
    out.push([x, y, c]);
    if (c === STITCH || c === JUMP) last = [x, y]; else if (c === TRIM || c === COLOR_CHANGE) last = null;
  }
  return { stitches: thin ? relieve(out, LIMIT) : out, threads: pattern.threads };
}
