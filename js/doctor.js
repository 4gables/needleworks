// Design doctor for opened files: what might go wrong at the machine, a thickness map, and gentle fixes (resize
// 80-120 %, drop tiny stitches, thin the densest spots). Stitch units 0.1 mm; the PES writer stays untouched.
import { COLOR_CHANGE, END, JUMP, STITCH, STOP, TRIM } from "./core/formats.js";
import { Design, relieve } from "./core/design.js";
import { fillPolygon } from "./core/digitize.js";
import { distanceTransform } from "./core/raster.js";
import { contours } from "./studio/quilt.js";

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

// colour blocks: [{ stitches (no colour changes or END), thread }]
function blocksOf(pattern) {
  const out = [{ stitches: [], thread: pattern.threads[0] }];
  for (const s of pattern.stitches) {
    if (s[2] === COLOR_CHANGE) out.push({ stitches: [], thread: pattern.threads[out.length] || pattern.threads[pattern.threads.length - 1] });
    else if (s[2] !== END) out[out.length - 1].stitches.push(s);
  }
  return out.filter((b) => b.stitches.some((s) => s[2] === STITCH));
}
function joinBlocks(blocks) {
  const stitches = [];
  blocks.forEach((b, i) => {
    if (i) { const l = stitches[stitches.length - 1]; stitches.push([l[0], l[1], COLOR_CHANGE]); }
    stitches.push(...b.stitches);
  });
  const l = stitches[stitches.length - 1]; stitches.push([l[0], l[1], END]);
  return { stitches, threads: blocks.map((b) => b.thread) };
}

// Fewer thread changes (Embrilliance's colour sort at tolerance 0): a block moves up to join the last earlier block in
// the same thread when it touches nothing sewn in between (cells 1 mm, grown by one), so what lies on top of what
// never changes. Files with machine stops (appliqué fabric steps) are left alone. null when nothing can move.
export function sortColors(pattern) {
  if (pattern.stitches.some((s) => s[2] === STOP)) return null;
  const blocks = blocksOf(pattern);
  // (a DST has no thread colours: every block would look like the same thread)
  if (blocks.length < 2 || pattern.threads.length < blocks.length || blocks.some((b) => !b.thread?.color)) return null;
  const cells = (b) => {
    const c = new Set();
    for (const [x, y, k] of b.stitches) if (k === STITCH) { const X = Math.floor(x / 10), Y = Math.floor(y / 10); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) c.add(X + dx + "," + (Y + dy)); }
    return c;
  };
  const out = [];
  let moved = 0;
  for (const b of blocks) {
    const mine = cells(b), hex = (b.thread?.color || "").toLowerCase();
    let at = -1;
    for (let i = out.length - 1; i >= 0; i--) {
      if ((out[i].thread?.color || "").toLowerCase() === hex) { at = i; break; }
      if ([...mine].some((k) => out[i].cells.has(k))) break;
    }
    if (at < 0) { out.push({ ...b, stitches: b.stitches.slice(), cells: mine }); continue; }
    // trim, then jump to where the moved block starts
    const t = out[at], last = t.stitches[t.stitches.length - 1], first = b.stitches.find((s) => s[2] === STITCH || s[2] === JUMP);
    t.stitches.push([last[0], last[1], TRIM]);
    if (first[2] === STITCH) t.stitches.push([first[0], first[1], JUMP]);
    t.stitches.push(...b.stitches); for (const k of mine) t.cells.add(k); moved++;
  }
  return moved ? joinBlocks(out) : null;
}
// how many thread changes colour sort would leave (null: it can't help)
export const sortedChanges = (pattern) => { const s = sortColors(pattern); return s && s.threads.length - 1; };

// Resizing past 80-120 % by re-stitching (Embrilliance's stitch processor): each colour block's runs are scaled and
// then rebuilt at the right density for the new size. A zigzag run (satin) keeps its two edges and gets stations
// every 0.2 mm along them again (0.4 mm on each edge); a fill (most of its length in one direction, many stitches)
// is traced as a shape and filled again at 0.4 mm rows in its own direction; anything else is a running line,
// resampled so no stitch is over 3.5 mm or under 0.5 mm. Locks come back from the Design writer. (A run counts as a
// fill when it's over 3 mm both ways and 70% of its length runs one way, or 45% one way and 80% with the 90° underlay.)
export function restitch(pattern, scale) {
  const pts = pattern.stitches.filter((s) => s[2] === STITCH || s[2] === JUMP);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, mm = ([x, y]) => [((x - cx) * scale) / 10, ((y - cy) * scale) / 10];
  const d = new Design({ w: 2000, h: 2000, name: "" });
  for (const b of blocksOf(pattern)) {
    d.color(b.thread?.color || "#000000", b.thread?.description || b.thread?.name || "");
    // a block's fill runs in one direction are refilled together, where the first of them was (one shape sewn in
    // several runs, refilled run by run, came out doubled: 37 hits/mm²)
    const runs = [], fills = new Map();
    let seg = [];
    const flush = () => {
      if (seg.length > 1) {
        const r = rebuild(seg.map(mm), scale);
        if (!Array.isArray(r)) { if (!fills.has(r.fill)) { fills.set(r.fill, []); runs.push({ fill: r.fill }); } fills.get(r.fill).push(r.pts); }
        else runs.push({ paths: r });
      }
      seg = [];
    };
    for (const s of b.stitches) {
      if (s[2] === STITCH) seg.push(s);
      else if (s[2] === JUMP) { flush(); seg = [s]; }
      else if (s[2] === TRIM) flush();
    }
    flush();
    const taken = new Set();   // (this block's refilled area so far: a fill in another direction leaves it out)
    for (const r of runs) for (const p of r.paths || refill(fills.get(r.fill), r.fill, taken) || fills.get(r.fill).map(line)) d.path(p);
  }
  d.finish();
  return d.pattern();
}
// one sewn run (mm, already scaled) -> rebuilt paths
function rebuild(p, scale) {
  const out = [], lens = [], dir = [];
  for (let i = 1; i < p.length; i++) { const dx = p[i][0] - p[i - 1][0], dy = p[i][1] - p[i - 1][1]; lens.push(Math.hypot(dx, dy)); dir.push([dx, dy]); }
  // satin: 6+ stitches in a row, each turning back on the last
  const back = (k) => lens[k] > 0.5 * scale && lens[k + 1] > 0.5 * scale && (dir[k][0] * dir[k + 1][0] + dir[k][1] * dir[k + 1][1]) / (lens[k] * lens[k + 1]) < -0.6;
  const isFill = () => {
    if (p.length < 40) return false;
    const bins = new Float64Array(18); let total = 0;
    lens.forEach((l, k) => { const a = ((Math.atan2(dir[k][1], dir[k][0]) * 180) / Math.PI + 360) % 180; bins[Math.floor(a / 10)] += l; total += l; });
    // rows in one direction, often with their underlay at 90° in the same run
    const best = bins.indexOf(Math.max(...bins)), win = (k) => bins[k % 18] + bins[(k + 17) % 18] + bins[(k + 1) % 18];
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]), wide = Math.max(...xs) - Math.min(...xs) > 3 && Math.max(...ys) - Math.min(...ys) > 3;
    return wide && (win(best) > 0.7 * total || (win(best) > 0.45 * total && win(best) + win(best + 9) > 0.8 * total)) ? best * 10 + 5 : false;
  };
  const angle = isFill();
  if (angle !== false && !lens.every((_, k) => k >= lens.length - 1 || back(k))) return { fill: angle, pts: p };
  let i = 0, run = [p[0]];
  while (i < lens.length) {
    let j = i;
    while (j < lens.length - 1 && back(j)) j++;
    if (j - i >= 6) {   // p[i..j+1] is a satin column
      if (run.length > 1) out.push(line(run));
      out.push(...column(p.slice(i, j + 2)));
      run = [p[j + 1]]; i = j + 1;
    } else { run.push(p[i + 1]); i++; }
  }
  if (run.length > 1) out.push(line(run));
  return out;
}
// a running line: no stitch over 3.5 mm (scaled up) or under 0.5 mm (scaled down; old locks go, new ones are added)
function line(p) {
  const out = [p[0]];
  for (const q of p.slice(1)) {
    const l = out[out.length - 1], dist = Math.hypot(q[0] - l[0], q[1] - l[1]);
    if (dist < 0.5) continue;
    const n = Math.ceil(dist / 3.5);
    for (let k = 1; k <= n; k++) out.push([l[0] + ((q[0] - l[0]) * k) / n, l[1] + ((q[1] - l[1]) * k) / n]);
  }
  if (out.length === 1) out.push(p[p.length - 1]);
  return out;
}
// a satin column: its two edges (alternate needle points), resampled to a station every 0.2 mm of the centre line;
// grown past 8 mm wide it's no satin any more (long loose stitches) and is filled instead
function column(p) {
  const widths = p.slice(1).map((q, k) => Math.hypot(q[0] - p[k][0], q[1] - p[k][1])).sort((a, b) => a - b);
  if (widths[widths.length >> 1] > 8) return refill([p], 45) || [line(p)];
  const A = p.filter((_, k) => k % 2 === 0), B = p.filter((_, k) => k % 2 === 1), n = Math.min(A.length, B.length);
  let L = 0;
  for (let k = 1; k < n; k++) L += Math.hypot((A[k][0] + B[k][0] - A[k - 1][0] - B[k - 1][0]) / 2, (A[k][1] + B[k][1] - A[k - 1][1] - B[k - 1][1]) / 2);
  const m = Math.max(2, Math.round(L / 0.2)), at = (E, t) => { const f = t * (n - 1), i = Math.min(n - 2, Math.floor(f)), r = f - i; return [E[i][0] + (E[i + 1][0] - E[i][0]) * r, E[i][1] + (E[i + 1][1] - E[i][1]) * r]; };
  return [Array.from({ length: m + 1 }, (_, k) => at(k % 2 ? B : A, k / m))];
}
// fills: the area their stitches cover (closed over 1.2 mm on a 4 px/mm grid) filled again at 0.4 mm rows, less what
// `taken` (global 1/4 mm cells) already holds, bar a 0.5 mm overlap so the two don't open a gap (the peace sign's
// ring and bars, three directions, piled 37 hits/mm² where they met)
function refill(runs, angle, taken = new Set()) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of runs) for (const [x, y] of p) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const R = 4; x0 -= 3; y0 -= 3;
  const w = Math.ceil((x1 - x0 + 3) * R), h = Math.ceil((y1 - y0 + 3) * R), m = { w, h, data: new Uint8Array(w * h) };
  for (const p of runs) for (let i = 1; i < p.length; i++) {
    const [ax, ay] = p[i - 1], [bx, by] = p[i], n = Math.ceil(Math.hypot(bx - ax, by - ay) * R * 2);
    for (let k = 0; k <= n; k++) { const X = Math.round((ax + ((bx - ax) * k) / n - x0) * R), Y = Math.round((ay + ((by - ay) * k) / n - y0) * R); m.data[Y * w + X] = 1; }
  }
  const near = distanceTransform({ w, h, data: m.data.map((v) => 1 - v) }), grown = { w, h, data: near.map((v) => (v <= 1.2 * R ? 1 : 0)) };
  const deep = distanceTransform(grown), shape = { w, h, data: deep.map((v) => (v > 1.2 * R ? 1 : 0)) };
  const key = (i) => { const x = i % w, y = (i - x) / w; return Math.round(x0 * R) + x + "," + (Math.round(y0 * R) + y); };
  const mine = [], held = (i) => taken.has(key(i));
  for (let i = 0; i < w * h; i++) if (shape.data[i]) mine.push(i);
  const cut = mine.filter((i) => held(i) && held(i - 2) && held(i + 2) && held(i - 2 * w) && held(i + 2 * w));
  for (const i of mine) taken.add(key(i));
  for (const i of cut) shape.data[i] = 0;
  const loops = contours(shape).filter((l) => l.length > 8).map((l) => l.map(([x, y]) => [x0 + x / R, y0 + y / R]));
  if (!loops.length) return null;
  const paths = fillPolygon(loops, { angle, density: 0.4 });
  return paths.length ? paths : null;
}

// a new pattern: scaled about its centre, tiny stitches merged into the next, long ones split, dense spots thinned;
// `sort` merges same-thread blocks first; past 80-120 % it's re-stitched (`restitch`)
export function fix(pattern, { scale = 1, tiny = false, thin = false, sort = false } = {}) {
  if (sort) pattern = sortColors(pattern) || pattern;
  if (scale < 0.8 - 1e-9 || scale > 1.2 + 1e-9) pattern = restitch(pattern, scale), scale = 1;
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
