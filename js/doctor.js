// Design doctor for opened files: what might go wrong at the machine, a thickness map, and gentle fixes (resize
// 80-120 %, drop tiny stitches, thin the densest spots). Stitch units 0.1 mm; the PES writer stays untouched.
import { COLOR_CHANGE, END, JUMP, STITCH, STOP, TRIM } from "./core/formats.js";
import { Design, relieve } from "./core/design.js";
import { fillPolygon } from "./core/digitize.js";
import { distanceTransform } from "./core/raster.js";
import { contours } from "./studio/quilt.js";
import { pyRound } from "./core/threads.js";

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
  let tiny = 0, long = 0, over = 0, longest = 0, last = null, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
  for (const [x, y, c] of st) {
    if (c === STITCH) {
      n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      if (last) { const d = Math.hypot(x - last[0], y - last[1]); if (d > 0 && d < 3) tiny++; if (d > 100) long++; if (d > 121) over++; if (d > longest) longest = d; }
      last = [x, y];
    } else if (c === JUMP) last = [x, y];
    else if (c === TRIM || c === COLOR_CHANGE) last = null;
  }
  const max = Math.max(0, ...h.values()), hot = [...h.values()].filter((v) => v > LIMIT).length;
  const sqin = Math.max(((x1 - x0) / 254) * ((y1 - y0) / 254), 0.1);
  return { stitches: n, tiny, long, over, longest: longest / 10, max, hot, perSqIn: Math.round(n / sqin), satinGap: satinGap(st) };
}

// moves between 1 and 5 mm, from the last stitch to the next: too short for the PE900 to trim (its lowest setting is
// 5 mm), left as loose thread
export function shortJumps(p) {
  if (p.shortJumps != null) return p.shortJumps;
  let n = 0, from = null, last = null;
  for (const [x, y, c] of p.stitches) {
    if (c === JUMP) { if (!from) from = last; last = [x, y]; continue; }
    if (c === STITCH) {
      if (from) { const d = Math.hypot(x - from[0], y - from[1]); if (d > 10 && d <= 50) n++; from = null; }
      last = [x, y];
    }
    if (c === COLOR_CHANGE) { from = null; last = null; }
  }
  return (p.shortJumps = n);
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
// every 0.2 mm along them again (0.4 mm on each edge), split where it's grown past 6.8 mm; a fill (most of its length in one direction, many stitches)
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
    G = new Map();
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
    const paths = [];
    for (const r of runs) paths.push(...(r.paths || refill(fills.get(r.fill), r.fill, taken) || fills.get(r.fill).map(line)));
    spread(paths);
    for (const p of paths) d.path(p);
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
// a satin column: its two edges (alternate needle points), resampled to a station every 0.2 mm of the centre line.
// Grown wide it stays a satin, split (`split`): filling each wide column on its own (everything over 8 mm until
// 2026-10-30) criss-crossed the peace sign's ring with travel, trims 49 -> 103 at 150 %. Only a column over 30 mm
// wide is filled.
function column(p) {
  const widths = p.slice(1).map((q, k) => Math.hypot(q[0] - p[k][0], q[1] - p[k][1])).sort((a, b) => a - b);
  if (widths[widths.length >> 1] > WIDE) return refill([p], 45) || [line(p)];
  const A = p.filter((_, k) => k % 2 === 0), B = p.filter((_, k) => k % 2 === 1), n = Math.min(A.length, B.length);
  let L = 0;
  for (let k = 1; k < n; k++) L += Math.hypot((A[k][0] + B[k][0] - A[k - 1][0] - B[k - 1][0]) / 2, (A[k][1] + B[k][1] - A[k - 1][1] - B[k - 1][1]) / 2);
  // (an even count when the run ends on its first edge, odd on the other: the next run starts where it ended, and a
  // column that stopped on the wrong edge, a satin width away, jumped there: ursula at 150 % had 20 loose threads)
  let m = Math.max(2, Math.round(L / 0.2));
  if (m % 2 !== (p.length - 1) % 2) m++;
  const at = (E, t) => { const f = t * (n - 1), i = Math.min(n - 2, Math.floor(f)), r = f - i; return [E[i][0] + (E[i + 1][0] - E[i][0]) * r, E[i][1] + (E[i + 1][1] - E[i][1]) * r]; };
  // (a hit landing where the block is already crowded, at a fan's pivot or where columns overlap, becomes a short
  // stitch: moved in along its stitch toward the other edge to the first spot with room, at most 40% of the way)
  const room = (q, o) => {
    if (crowd(q) < SHORT) return q;
    const l = Math.hypot(o[0] - q[0], o[1] - q[1]);
    let best = q, bc = crowd(q);
    for (let d = 0.3; d <= 0.4 * l; d += 0.3) {
      const r = [q[0] + ((o[0] - q[0]) * d) / l, q[1] + ((o[1] - q[1]) * d) / l], c = crowd(r);
      if (c < bc) { bc = c; best = r; }
      if (c < SHORT) break;
    }
    return best;
  };
  const out = [at(A, 0)];
  hit(out[0]);
  for (let k = 1, prev = out[0]; k <= m; k++) {
    const e = k === m ? p[p.length - 1] : at(k % 2 ? B : A, k / m), q = k === m ? e : room(e, at(k % 2 ? A : B, k / m));
    for (const s of split(prev, q, k)) { out.push(s); hit(s); }
    out.push(q); hit(q); prev = q;
  }
  return [out];
}
// needle hits so far in this colour block's columns, on a 0.5 mm grid (`G`, reset per block by restitch)
let G = new Map();
const hit = ([x, y]) => { const k = Math.floor(x * 2) + "," + Math.floor(y * 2); G.set(k, (G.get(k) || 0) + 1); };
// hits in the densest 1 mm window holding a point
function crowd([x, y]) {
  const X = Math.floor(x * 2), Y = Math.floor(y * 2), c = (i, j) => G.get(X + i + "," + (Y + j)) || 0;
  let best = 0;
  for (const i of [-1, 0]) for (const j of [-1, 0]) best = Math.max(best, c(i, j) + c(i + 1, j) + c(i, j + 1) + c(i + 1, j + 1));
  return best;
}
// split satin: a stitch over 6.8 mm is cut into equal pieces of at most 5.5 mm (the writer would halve anything over
// 7 mm wherever the middle fell), every cut shifted by up to a quarter piece in golden-ratio steps from stitch to
// stitch so the cuts don't line up into a seam
function split(a, b, k) {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (l <= MAXS) return [];
  const n = Math.ceil(l / PIECE), piece = l / n, off = (((k * 0.618034) % 1) - 0.5) * piece * 0.5, out = [];
  for (let j = 1; j < n; j++) {
    const t = (j * piece + off) / l, q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    q.cut = true; out.push(q);
  }
  return out;
}
// Thinning that changes nothing you can see: in a 1 mm window (any 0.1 mm offset, as pe900_check.py) with over
// `limit` hits in one colour block, a hit in the middle of a straight line (a split satin's cut, a point along a
// running line) slides along that line, so the thread lies exactly as before, to where the windows round it are
// thinnest, keeping both stitches 1-6.8 mm. Locks (5 points round any command) stay. Stitch units 0.1 mm.
export function slide(st, limit = LIMIT) {
  const n = st.length, blk = new Int32Array(n), cells = new Map();
  for (let i = 0, b = 0; i < n; i++) { if (st[i][2] === COLOR_CHANGE) b++; blk[i] = b; }
  const R = pyRound, key = (b, cx, cy) => b + "," + cx + "," + cy;
  const place = (i, v) => {
    const k = key(blk[i], Math.floor(R(st[i][0]) / 10), Math.floor(R(st[i][1]) / 10));
    if (v > 0) { if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i); } else { const a = cells.get(k); a.splice(a.indexOf(i), 1); }
  };
  for (let i = 0; i < n; i++) if (st[i][2] === STITCH) place(i, 1);
  // hits in the window with corner (x0, y0)
  const count = (b, x0, y0) => {
    let c = 0;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (const k of cells.get(key(b, Math.floor(x0 / 10) + i, Math.floor(y0 / 10) + j)) || []) {
      const x = R(st[k][0]), y = R(st[k][1]);
      if (x >= x0 && x < x0 + 10 && y >= y0 && y < y0 + 10) c++;
    }
    return c;
  };
  // the fullest window holding (x, y)
  const worst = (b, x, y) => { let w = 0; for (let ox = 0; ox < 10; ox++) for (let oy = 0; oy < 10; oy++) w = Math.max(w, count(b, R(x) - ox, R(y) - oy)); return w; };
  const free = (i) => {
    for (let j = i - 5; j <= i + 5; j++) if (j < 0 || j >= n || st[j][2] !== STITCH) return false;
    const [a, p, b] = [st[i - 1], st[i], st[i + 1]], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    return l > 20 && Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / l < 0.5 && ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l > 0 && ((b[0] - p[0]) * dx + (b[1] - p[1]) * dy) / l > 0;
  };
  for (const k0 of [...cells.keys()]) {
    const [b, cx, cy] = k0.split(",").map(Number);
    // (a window with its corner in this cell lies in it and its right/lower neighbours: never fuller than those four)
    let most = 0;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) most += (cells.get(key(b, cx + i, cy + j)) || []).length;
    if (most <= limit) continue;
    for (let ox = 0; ox < 10; ox++) for (let oy = 0; oy < 10; oy++) {
      const x0 = cx * 10 + ox, y0 = cy * 10 + oy;
      for (let tries = 0, now; (now = count(b, x0, y0)) > limit && tries < 40; tries++) {
        // the movable hits in this window; the one that finds the thinnest spot moves
        let best = null;
        for (let i0 = 0; i0 < 2; i0++) for (let j0 = 0; j0 < 2; j0++) for (const i of cells.get(key(b, cx + i0, cy + j0)) || []) {
          const x = R(st[i][0]), y = R(st[i][1]);
          if (x < x0 || x >= x0 + 10 || y < y0 || y >= y0 + 10 || !free(i)) continue;
          const a = st[i - 1], c = st[i + 1], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
          for (let t = 10; t <= l - 10; t += 2.5) {
            if (t > MAXS * 10 || l - t > MAXS * 10) continue;
            const q = [a[0] + ((c[0] - a[0]) * t) / l, a[1] + ((c[1] - a[1]) * t) / l];
            if (R(q[0]) >= x0 && R(q[0]) < x0 + 10 && R(q[1]) >= y0 && R(q[1]) < y0 + 10) continue;
            const w = worst(b, q[0], q[1]);
            if (w + 1 < now - 1 && (!best || w < best.w)) best = { i, q, w };   // (the move must leave both windows better off)
          }
        }
        if (!best) break;
        place(best.i, -1); st[best.i] = [best.q[0], best.q[1], STITCH]; place(best.i, 1);
      }
    }
  }
  return st;
}
// Where a colour block's columns put over 16 hits in a 1 mm window (where the peace sign's bars meet its ring, split
// cuts in fixed places piled 33-40), the split satin's cuts in it slide along their own stitch (the thread lies
// exactly as before) to the least crowded spot that keeps both pieces 1-6.8 mm. A 0.25 mm grid, every 1 mm window;
// `slide` then checks the finished stitches exactly.
function spread(paths) {
  const C = new Map(), cell = (q) => [Math.floor(q[0] * 4), Math.floor(q[1] * 4)];
  const add = (q, v) => { const [X, Y] = cell(q), k = X + "," + Y; C.set(k, (C.get(k) || 0) + v); };
  const win = (q) => {
    const [X, Y] = cell(q), c = (i, j) => C.get(X + i + "," + (Y + j)) || 0;
    let best = 0;
    for (let i0 = -3; i0 <= 0; i0++) for (let j0 = -3; j0 <= 0; j0++) {
      let s = 0;
      for (let i = i0; i < i0 + 4; i++) for (let j = j0; j < j0 + 4; j++) s += c(i, j);
      if (s > best) best = s;
    }
    return best;
  };
  for (const p of paths) for (const q of p) add(q, 1);
  for (let pass = 0; pass < 4; pass++) for (const p of paths) for (let k = 1; k < p.length - 1; k++) {
    const q = p[k];
    if (!q.cut || win(q) <= LIMIT - 8) continue;
    const a = p[k - 1], b = p[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    add(q, -1);
    let best = null, bc = Infinity;
    for (let t = 1; t <= l - 1; t += 0.25) {
      if (t > MAXS || l - t > MAXS) continue;
      const r = [a[0] + ((b[0] - a[0]) * t) / l, a[1] + ((b[1] - a[1]) * t) / l], c = win(r);
      if (c < bc) { bc = c; best = r; }
    }
    if (best && bc < win(q)) { q[0] = best[0]; q[1] = best[1]; }
    add(q, 1);
  }
}
const MAXS = 6.8;   // the writer splits stitches over 7 mm in equal parts (the 0.1 mm rounding can add 0.07)
// split satin: pieces at most 5.5 mm; a hit where a 1 mm window already holds 16 becomes a short stitch; columns
// over 30 mm wide (median) are filled instead (the peace ring at 250 % is 25 mm: filling those columns took trims 54 -> 82)
const PIECE = 5.5, SHORT = 16, WIDE = 30;
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

// Jumps land where their first stitch goes in. Our writer (like pyembroidery's) puts the needle down where a jump
// ends before the first stitch, so a file whose jumps stop short of it (all 49 of peace.pes's, by 0.5-12 mm) gained a
// hole there, often 2-5 mm from the last stitch: a loose thread too short for the machine to trim (3 -> 31 when
// re-saved). A run of jumps becomes one (the writer splits any over 121 mm).
export function landJumps(pattern) {
  const st = pattern.stitches, out = [];
  for (let i = 0; i < st.length; i++) {
    if (st[i][2] !== JUMP) { out.push(st[i]); continue; }
    let j = i;
    while (st[j + 1]?.[2] === JUMP) j++;
    const s = st[j + 1];
    out.push(s?.[2] === STITCH ? [s[0], s[1], JUMP] : st[j]);
    i = j;
  }
  return { ...pattern, stitches: out };
}

// a new pattern: scaled about its centre, tiny stitches merged into the next, long ones split, dense spots thinned;
// `sort` merges same-thread blocks first; past 80-120 % it's re-stitched (`restitch`)
export function fix(pattern, { scale = 1, tiny = false, thin = false, sort = false } = {}) {
  pattern = landJumps(pattern);
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
      // (not the stitch a jump lands on: it's the run's first hole, which the writer would add anyway, out of sight of
      // relieve and slide: peace.pes at 80 % thinned read back 25 hits/mm²)
      if (scale !== 1 && d === 0 && st[i - 1][2] !== JUMP) continue;
      // (keep the stitch before a command: it's the end of a run or a lock)
      if (tiny && d < 3 && st[i + 1]?.[2] === STITCH && st[i - 1][2] !== JUMP) continue;
      // (split here as split satin, not by the writer, which halves anything over 7 mm where relieve and slide can't
      // see it: those halves piled peace.pes at 80 % to 25 hits/mm² even thinned)
      if (d > MAXS * 10) for (const q of split([last[0] / 10, last[1] / 10], [x / 10, y / 10], i)) out.push([Math.round(q[0] * 10), Math.round(q[1] * 10), STITCH]);
    }
    out.push([x, y, c]);
    if (c === STITCH || c === JUMP) last = [x, y]; else if (c === TRIM || c === COLOR_CHANGE) last = null;
  }
  return { stitches: slide(thin ? relieve(out, LIMIT) : out), threads: pattern.threads };
}
