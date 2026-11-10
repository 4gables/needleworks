/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Design doctor for opened files: what might go wrong at the machine, a thickness map, and gentle fixes (resize
// 80-120 %, drop tiny stitches, thin the densest spots). Stitch units 0.1 mm; the PES writer stays untouched.
import { COLOR_CHANGE, END, JUMP, STITCH, STOP, TRIM, designBlockAgrees, readEmbroidery, writePES } from "./core/formats.js";
import { Design, relieve } from "./core/design.js";
import { fillPolygon } from "./core/digitize.js";
import { distanceTransform } from "./core/raster.js";
import { contours } from "./studio/quilt.js";
import { nearestBrotherThread, pecThread, pyRound } from "./core/threads.js";
import { HARD, LIMIT, MAX_BLOCKS, MAX_STITCH, endsEarly, moves, peak, satinGap, stopWords, verdict, verdictOf } from "./quality.js";

// (LIMIT: 24 needle hits per mm² per colour block, the densest spot in sold designs; the counts are pe900_check.py's,
// from quality.js, so the checkup and the download's verdict agree)

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

// what the checkup says about a pattern: give it the file as it will be saved (decoded from its bytes), so the
// numbers are the saved file's (they described the design before the writer split its long stitches: "up to 26"
// beside a file that measured 24)
export function checkup(pattern) {
  const st = pattern.stitches, m = moves(st);
  let long = 0, last = null, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, c] of st) {
    if (c === STITCH) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      if (last && Math.hypot(x - last[0], y - last[1]) > 100) long++;
      last = [x, y];
    } else if (c === JUMP) last = [x, y];
  }
  const { max, hot } = peak(pattern);
  const sqin = Math.max(((x1 - x0) / 254) * ((y1 - y0) / 254), 0.1);
  return { stitches: m.stitches, tiny: m.tiny, long, over: m.over, longest: m.longest, max, hot, perSqIn: Math.round(m.stitches / sqin), satinGap: satinGap(st), verdict: verdict(pattern) };
}

// moves between 1 and 5 mm, from the last stitch to the next: too short for the PE900 to trim (its lowest setting is
// 5 mm), left as loose thread
export const shortJumps = (p) => (p.shortJumps ??= blockLoads(p).reduce((a, b) => a + b.snips, 0));
// What the machine does in each colour block (indexed as render.js colorBlocks counts them, a COLOR_CHANGE each):
// stitches, threads cut (trims) and loose threads left (`snips`). The time and the loose threads every surface says
// come from these counts (the chips said 13 min where Sew along's steps added up to 12: each step counted its own way).
export function blockLoads(p) {
  if (p.loads) return p.loads;
  const out = [{ stitches: 0, trims: 0, snips: 0 }];
  let from = null, last = null;
  for (const [x, y, c] of p.stitches) {
    const b = out[out.length - 1];
    if (c === JUMP) { if (!from) from = last; last = [x, y]; continue; }
    if (c === STITCH) {
      b.stitches++;
      if (from) { const d = Math.hypot(x - from[0], y - from[1]); if (d > 10 && d <= 50) b.snips++; from = null; }
      last = [x, y];
    }
    if (c === TRIM) b.trims++;
    if (c === COLOR_CHANGE) { from = null; last = null; out.push({ stitches: 0, trims: 0, snips: 0 }); }
  }
  return (p.loads = out);
}

// colour blocks: [{ stitches (no colour changes or END), thread }]
function blocksOf(pattern) {
  const out = [{ stitches: [], thread: pattern.threads[0], i: 0 }];
  for (const s of pattern.stitches) {
    if (s[2] === COLOR_CHANGE) out.push({ stitches: [], thread: pattern.threads[out.length] || pattern.threads[pattern.threads.length - 1], i: out.length });
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
  // (two blocks in a row in one thread are a pause, not a thread change: an in-the-hoop bookmark's or appliqué's
  // fabric steps. Merged, the bookmark lost all four and its copy piled 25 hits/mm²)
  if (pauses(pattern)) return null;
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
// Few enough colour blocks for the machine (99, MAX_BLOCKS; the PES writer refuses over 127): consecutive blocks in
// one colour joined (a trim where the machine would have stopped), then colour sort. The pattern, or null when that
// still leaves too many.
export function fewerBlocks(pattern) {
  const j = joinSame(pattern), p = sortColors(j) || j;
  return p.threads.length <= MAX_BLOCKS ? p : null;
}
// Consecutive blocks in one colour joined, a trim where the machine would have stopped (the same pattern when there
// are none). Only for files whose colours were picked here (DST) or that hold too many: in a PES two blocks in a
// row in one thread are a fabric step.
export function joinSame(pattern) {
  const out = [];
  let joined = 0;
  for (const b of blocksOf(pattern)) {
    const t = out[out.length - 1];
    if (!t || (t.thread?.color || "").toLowerCase() !== (b.thread?.color || "").toLowerCase()) { out.push({ ...b, stitches: b.stitches.slice() }); continue; }
    const last = t.stitches[t.stitches.length - 1], first = b.stitches.find((s) => s[2] === STITCH || s[2] === JUMP);
    t.stitches.push([last[0], last[1], TRIM]);
    if (first[2] === STITCH) t.stitches.push([first[0], first[1], JUMP]);
    t.stitches.push(...b.stitches); joined++;
  }
  return joined ? joinBlocks(out) : pattern;
}
// thread changes that are machine pauses: the next block is in the same thread (same PEC thread, or same colour)
export function pauses(pattern) {
  const pec = pattern.pec, t = pattern.threads;
  let n = 0, k = 0;
  for (const s of pattern.stitches) if (s[2] === STOP) n++; else if (s[2] === COLOR_CHANGE) {
    k++;
    const same = pec && pec.length > k ? pec[k] === pec[k - 1] : !!t[k]?.color && t[k].color.toLowerCase() === t[k - 1]?.color?.toLowerCase();
    if (same) n++;
  }
  return n;
}
// how many thread changes colour sort would leave (null: it can't help)
// (`join`: consecutive blocks in one colour count as one, for colours picked here)
export const sortedChanges = (pattern, join = false) => {
  const j = join ? joinSame(pattern) : pattern, s = sortColors(j) || (j !== pattern ? j : null);
  return s && s.threads.length - 1;
};

// Resizing past 80-120 % by re-stitching (Embrilliance's stitch processor): each colour block's runs are scaled and
// then rebuilt at the source's own density (where it's sane) for the new size. A zigzag run (satin) keeps its two
// edges and is sewn again at its own gap on each edge (SATIN), split where it's grown past 6.8 mm; a fill (most of its
// length in one direction, many stitches) is traced as a shape and filled again at its own row spacing (ROWS) in its
// own direction; open zigzags (underlay) and anything else are running lines, resampled so no stitch is over 3.5 mm
// or under 0.5 mm. Locks come back from the Design writer. (A run counts as a fill when it's over 3 mm both ways and
// 70% of its length runs one way, or 45% one way and 80% with the 90° underlay.)
export function restitch(pattern, scale) {
  const pts = pattern.stitches.filter((s) => s[2] === STITCH || s[2] === JUMP);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, mm = ([x, y]) => [((x - cx) * scale) / 10, ((y - cy) * scale) / 10];
  const d = new Design({ w: 2000, h: 2000, name: "" });
  // where the source sews (0.25 mm cells -> the last colour block that does): a column end reaches on only into
  // these, and a fill is reached by a run only where this block or a later one sews over it
  COV = new Map(); BOX = [...mm([x0, y0]), ...mm([x1, y1])];
  let last = null, bi = 0;
  for (const s of pattern.stitches) {
    if (s[2] === COLOR_CHANGE) bi++;
    if (s[2] === STITCH && last) {
      const a = mm(last), b = mm(s), n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 8) || 1;
      for (let k = 0; k <= n; k++) COV.set(Math.floor((a[0] + ((b[0] - a[0]) * k) / n) * 4) + "," + Math.floor((a[1] + ((b[1] - a[1]) * k) / n) * 4), bi);
    }
    last = s[2] === STITCH || s[2] === JUMP ? s : null;
  }
  for (const b of blocksOf(pattern)) {
    const hidden = ([x, y]) => COV.get(Math.floor(x * 4) + "," + Math.floor(y * 4)) >= b.i;
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
    for (const r of runs) {
      const prev = paths[paths.length - 1]?.at(-1), ps = r.paths || refill(fills.get(r.fill), r.fill, taken, scale, prev) || fills.get(r.fill).map(line);
      // a refilled fill starts where its rows do, not where the source's did, and its separate parts jump: reached by
      // a run under the fill or where the source sews this thread or a later one, when one fits, not a trim (trims in
      // colour: gnome 24 -> 20 at 250 %, ufront 24 -> 18)
      if (ps.inside) {
        const ok = (q) => ps.inside(q) || hidden(q);
        if (prev) ps[0] = [...travel(prev, ps[0][0], ok, 20), ...ps[0]];
        for (let k = 1; k < ps.length; k++) ps[k] = [...travel(ps[k - 1].at(-1), ps[k][0], ok, 12), ...ps[k]];
      }
      paths.push(...ps);
    }
    spread(paths);
    for (const p of paths) d.path(p);
  }
  d.finish();
  return d.pattern();
}
// stitches up to 2 mm from a to b (neither included) when that line lies where `inside` says (bar 0.75 mm at either
// end), and the move is over 2 mm (shorter is sewn anyway) and at most `most` mm; else none
function travel(a, b, inside, most) {
  const g = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (g <= 2 || g > most) return [];
  // (both ends may sit on the edge)
  for (let t = 0.75; t < g - 0.75; t += 0.25) if (!inside([a[0] + ((b[0] - a[0]) * t) / g, a[1] + ((b[1] - a[1]) * t) / g])) return [];
  const n = Math.ceil(g / 2), out = [];
  for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  return out;
}
// one sewn run (mm, already scaled) -> rebuilt paths
function rebuild(p, scale) {
  const out = [];
  let lens = [], dir = [];
  const measure = () => {
    lens = []; dir = [];
    for (let i = 1; i < p.length; i++) { const dx = p[i][0] - p[i - 1][0], dy = p[i][1] - p[i - 1][1]; lens.push(Math.hypot(dx, dy)); dir.push([dx, dy]); }
  };
  measure();
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
  // a satin sewn as a square wave (across, a short step along the edge, back: star_badge's border) is a zigzag
  // whose edge points are the steps' middles; left as a line it grew 2.5 times as open at 250 %
  // (a step only where the next or last step goes the same way: a lone one is a satin turning back over itself, and
  // merged it lost peace.pes's column end)
  const step = (k) => k > 0 && k < lens.length - 1 && lens[k] > 0 && lens[k] < 0.3 * Math.min(lens[k - 1], lens[k + 1])
    && (dir[k - 1][0] * dir[k + 1][0] + dir[k - 1][1] * dir[k + 1][1]) / (lens[k - 1] * lens[k + 1]) < -0.8;
  const along = (k, j) => step(j) && dir[k][0] * dir[j][0] + dir[k][1] * dir[j][1] > 0;
  const q = [p[0]];
  for (let k = 1; k < p.length; k++) {
    if (step(k) && (along(k, k - 2) || along(k, k + 2))) {
      q.push([(p[k][0] + p[k + 1][0]) / 2, (p[k][1] + p[k + 1][1]) / 2]); k++;
    } else q.push(p[k]);
  }
  if (q.length < p.length) { p = q; measure(); }
  let i = 0, run = [p[0]];
  while (i < lens.length) {
    let j = i;
    while (j < lens.length - 1 && back(j)) j++;
    if (j - i >= 6) {   // p[i..j+1] is a satin column
      if (run.length > 1) out.push(line(run));
      out.push(...column(p.slice(i, j + 2), scale));
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
// a satin column: its two edges (alternate needle points), resampled to a station every gap / 2 of the centre line
// (`keep`: in place at full size, from and to its own first and last hole, ends not moved: `respace`).
// Grown wide it stays a satin, split (`split`): filling each wide column on its own (everything over 8 mm until
// 2026-10-30) criss-crossed the peace sign's ring with travel, trims 49 -> 103 at 150 %. Only a column over 30 mm
// wide is filled.
function column(p, scale = 1, keep = false) {
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), mid = (v) => v.sort((a, b) => a - b)[v.length >> 1];
  // the source's own spacing (hits on one edge, mm at its own size) where it's sane (sold designs 0.28-0.42); more
  // open or denser comes out at the nearest sane value
  const gap = satinGap1(p, scale);
  // (an open zigzag, underlay mostly, stays as it was: it's under the satin, and resampled it missed spots the scaled
  // original covered where peace.pes's bars meet its ring)
  if (gap > OPEN) return [line(p)];
  if (!keep && mid(p.slice(1).map((q, k) => dist(q, p[k]))) > WIDE) return refill([p], 45) || [line(p)];
  // (a half stitch into the middle at either end isn't an edge point: taken as one, it pulled the edge in and left
  // the corner where two columns meet bare at 150-250 %)
  // (still sewn from and to the run's own ends, so what comes before and after stays joined)
  let q = p, head = null, tail = null;
  if (!keep) {
    const l = (i) => dist(q[i], q[i + 1]);
    if (q.length > 8 && l(q.length - 2) < 0.65 * l(q.length - 3)) { tail = q[q.length - 1]; q = q.slice(0, -1); }
    if (q.length > 8 && l(0) < 0.65 * l(1)) { head = q[0]; q = q.slice(1); }
  }
  const A = q.filter((_, k) => k % 2 === 0), B = q.filter((_, k) => k % 2 === 1);
  // each column end reaches a little further on (`EXT`, half the end's width at a tip) so it tucks under the column
  // it meets: resampled flush, the joins opened (ursula at 250 %: 21 bare spots)
  if (!keep) for (const end of [0, 1]) {
    const c = (k) => { const a = end ? A[A.length - 1 - k] : A[k], b = end ? B[B.length - 1 - k] : B[k]; return a && b && [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    const c0 = c(0); let k = 1;
    while (c(k + 1) && dist(c(k), c0) < 1) k++;
    const ck = c(k), l = ck && dist(ck, c0);
    if (!l) continue;
    const a = end ? A[A.length - 1] : A[0], b = end ? B[B.length - 1] : B[0], e = Math.min(EXT, dist(a, b) / 2) / l;
    const out = (r, f = 1) => [r[0] + (c0[0] - ck[0]) * e * f, r[1] + (c0[1] - ck[1]) * e * f];
    // (only into other stitching, a little past where it would reach: an end at the design's edge stays put, or the
    // shape grew)
    if ([a, b, c0].filter((r) => sewn(out(r, 1 + 0.3 / EXT))).length < 2 || !inside(out(a)) || !inside(out(b))) continue;
    if (end) { A.push(out(a)); B.push(out(b)); } else { A.unshift(out(a)); B.unshift(out(b)); }
  }
  const n = Math.min(A.length, B.length);
  let L = 0;
  for (let k = 1; k < n; k++) L += Math.hypot((A[k][0] + B[k][0] - A[k - 1][0] - B[k - 1][0]) / 2, (A[k][1] + B[k][1] - A[k - 1][1] - B[k - 1][1]) / 2);
  // (an even count when the run ends on its first edge, odd on the other: the next run starts where it ended, and a
  // column that stopped on the wrong edge, a satin width away, jumped there: ursula at 150 % had 20 loose threads)
  let m = Math.max(2, Math.round(L / (gap / 2)));
  if (m % 2 !== (q.length - 1) % 2) m++;
  // (each edge by its own points, so both ends are its real ends when one edge has a hit more)
  const at = (E, t) => { const f = t * (E.length - 1), i = Math.min(E.length - 2, Math.floor(f)), r = f - i; return [E[i][0] + (E[i + 1][0] - E[i][0]) * r, E[i][1] + (E[i + 1][1] - E[i][1]) * r]; };
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
  const t = (k) => k / m;
  const out = [at(A, 0)];
  hit(out[0]);
  for (let k = 1, prev = out[0]; k <= m; k++) {
    const e = k === m && keep ? p[p.length - 1] : at(k % 2 ? B : A, t(k)), r = k === m ? e : room(e, at(k % 2 ? A : B, t(k)));
    for (const s of split(prev, r, k)) { out.push(s); hit(s); }
    out.push(r); hit(r); prev = r;
  }
  if (head) out.unshift(head);
  if (tail) out.push(tail);
  return [out];
}
// needle hits so far in this colour block's columns, on a 0.5 mm grid (`G`, reset per block by restitch)
let G = new Map(), COV = new Map(), BOX = [0, 0, 0, 0];
const inside = ([x, y]) => x >= BOX[0] && y >= BOX[1] && x <= BOX[2] && y <= BOX[3];
// thread from the source within a cell of a point (mm, scaled)
const sewn = ([x, y]) => {
  const X = Math.floor(x * 4), Y = Math.floor(y * 4);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (COV.has(X + i + "," + (Y + j))) return true;
  return false;
};
const hit = ([x, y], v = 1) => { const k = Math.floor(x * 2) + "," + Math.floor(y * 2); G.set(k, (G.get(k) || 0) + v); };
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
// a column end reaches 0.5 mm further on; satin same-edge gaps and fill rows (mm) kept from the source within these
// (rows down to 0.15, the cover of the densest satin kept: 0.3 mm on each edge is a thread every 0.15 mm)
const EXT = 0.5, SATIN = [0.3, 0.5], ROWS = [0.15, 0.5];
const clamp = (v, [a, b]) => Math.min(b, Math.max(a, v));
// a satin column's gap between hits on one edge, at the source's own size, brought into SATIN. Over OPEN it's a
// zigzag underlay (or meant open) and stays a line: rebuilt as satin, peace.pes's underlay took 81 % more thread.
// (Satins in the samples measure 0.2-0.9, underlay 1.0-3.)
const OPEN = 1;
function satinGap1(p, scale) {
  const g = p.slice(2).map((q, k) => Math.hypot(q[0] - p[k][0], q[1] - p[k][1])).sort((a, b) => a - b), raw = g[g.length >> 1] / scale;
  return raw > OPEN ? raw : clamp(raw, SATIN);
}
// fills: the area their stitches cover (closed over 1.2 mm on a 4 px/mm grid) filled again at the source's row
// spacing (`scale` given; else 0.4 mm), started from the end nearer `from`, less what
// `taken` (global 1/4 mm cells) already holds, bar a 0.5 mm overlap so the two don't open a gap (the peace sign's
// ring and bars, three directions, piled 37 hits/mm² where they met)
function refill(runs, angle, taken = new Set(), scale = 0, from = null) {
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
  // the source's row spacing, from the thread it lays per mm² (all its stitches here, underlay and travel too, at its
  // own size) less what our underlay adds (a row every 2.5 mm), kept within ROWS: the copy covers as the source did
  // at any size (rows within 15° of the fill's direction alone read gnome's hat as 0.18 for 0.15, and the old 0.35
  // floor gave its fills half the thread at 50 and 250 %; peace.pes's, re-stitched at 0.4, took 41-67 % more)
  let thread = 0;
  if (scale) for (const p of runs) for (let i = 1; i < p.length; i++) thread += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  const perMm2 = (thread * scale) / (mine.length / (R * R)) - 1 / 2.5;
  const density = thread ? clamp(perMm2 > 0 ? 1 / perMm2 : Infinity, ROWS) : 0.4;
  // (rows the same way round, started from the end nearer the needle: the tatami starts at the outline's far point
  // along its angle turned by (1, -1), and at the opposite one at angle + 180°)
  let dir = angle;
  if (from) {
    const r = (angle * Math.PI) / 180, v = [Math.cos(r) + Math.sin(r), Math.sin(r) - Math.cos(r)], pts = loops.flat();
    let hi = pts[0], lo = pts[0];
    for (const q of pts) { const t = q[0] * v[0] + q[1] * v[1]; if (t > hi[0] * v[0] + hi[1] * v[1]) hi = q; if (t < lo[0] * v[0] + lo[1] * v[1]) lo = q; }
    if (Math.hypot(lo[0] - from[0], lo[1] - from[1]) < Math.hypot(hi[0] - from[0], hi[1] - from[1])) dir = angle + 180;
  }
  // (sewn the other way round too, when that has fewer parts: a section the rows strand behind finished ones is a
  // trim, and dense rows strand more; ufront's big fill at 0.16 mm: 4 parts one way, 1 the other)
  let paths = fillPolygon(loops, { angle: dir, density });
  if (paths.length > 1) { const other = fillPolygon(loops, { angle: dir + 180, density }); if (other.length < paths.length) paths = other; }
  // (a point this fill will cover, 0.25 mm in from its edge)
  const on = (X, Y) => X >= 0 && Y >= 0 && X < w && Y < h && shape.data[Y * w + X];
  paths.inside = ([x, y]) => { const X = Math.round((x - x0) * R), Y = Math.round((y - y0) * R); return on(X, Y) && on(X - 1, Y) && on(X + 1, Y) && on(X, Y - 1) && on(X, Y + 1); };
  return paths.length ? paths : null;
}

// Jumps land where their first stitch goes in. Our writer (like pyembroidery's) puts the needle down where a jump
// ends before the first stitch, so a file whose jumps stop short of it (all 49 of peace.pes's, by 0.5-12 mm) gained a
// hole there, often 2-5 mm from the last stitch: a loose thread too short for the machine to trim (3 -> 31 when
// re-saved). A run of jumps becomes one (the writer splits any over 121 mm).
// A file that starts with a stitch and goes straight on further than the machine sews in one stitch (12.1 mm) starts
// with its way to the design: a pyembroidery file starting at the origin (round 6's origin_start.pes) was saved
// sewing a line out from the origin in 6.7 mm stitches. That first move is a jump.
export function landJumps(pattern) {
  let st = pattern.stitches;
  const out = [], k = st.findIndex((s) => s[2] === STITCH || s[2] === JUMP), a = st[k], b = st[k + 1];
  if (a?.[2] === STITCH && b?.[2] === STITCH && Math.hypot(b[0] - a[0], b[1] - a[1]) > MAX_STITCH) st = [...st.slice(0, k), [b[0], b[1], JUMP], ...st.slice(k + 1)];
  // (and any design starting with a stitch starts with a jump there, as our own do: the writer starts at the origin,
  // so a DST or mended PES whose first stitch was elsewhere read back with a stitch more, out from the origin, and
  // was refused at Download: tests/open_fuzz.test.mjs)
  else if (a?.[2] === STITCH) st = [...st.slice(0, k), [a[0], a[1], JUMP], ...st.slice(k)];
  for (let i = 0; i < st.length; i++) {
    if (st[i][2] !== JUMP) { out.push(st[i]); continue; }
    let j = i;
    while (st[j + 1]?.[2] === JUMP) j++;
    const s = st[j + 1];
    // (jumps that go nowhere are dropped: at the very end, or before a trim or thread change after which the needle
    // jumps again. The writer puts the needle down where a jump ends, so each was a stitch the file never had, and a
    // damaged file's last jump 3.5 m away made the design unwritable)
    let k = j + 1;
    while (st[k] && st[k][2] !== STITCH && st[k][2] !== JUMP && st[k][2] !== END) k++;
    if (!s || s[2] === END || (s[2] !== STITCH && (!st[k] || st[k][2] !== STITCH))) { i = j; continue; }
    out.push(s[2] === STITCH ? [s[0], s[1], JUMP] : st[j]);
    i = j;
  }
  return { ...pattern, stitches: out };
}

// Satin columns (6+ stitches over 0.5 mm, each turning back on the last) whose gap between hits on one edge is out of
// SATIN (gnome at 80 %: 0.22, packed stiff; rosacea at 80 %: 0.71, fabric showing) sewn again at the nearest sane
// gap, in place: each keeps its own first and last hole, so nothing around it moves. Underlay (over OPEN) is left.
// Stitch units 0.1 mm.
export function respace(st, scale = 1) {
  const out = [];
  // (the crowding grid holds the whole block, less each column as it's replaced, so a re-spaced column's hits make
  // room where it meets others: peace.pes at 110 % piled 25 hits/mm² without)
  const block = (i) => {
    G = new Map();
    for (let k = i; k < st.length && st[k][2] !== COLOR_CHANGE; k++) if (st[k][2] === STITCH) hit([st[k][0] / 10, st[k][1] / 10]);
  };
  block(0);
  for (let i = 0; i < st.length;) {
    if (st[i][2] !== STITCH) { if (st[i][2] === COLOR_CHANGE) block(i + 1); out.push(st[i++]); continue; }
    let j = i;
    while (j < st.length && st[j][2] === STITCH) j++;
    const p = st.slice(i, j).map(([x, y]) => [x / 10, y / 10]), lens = [], dir = [];
    for (let k = 1; k < p.length; k++) { const dx = p[k][0] - p[k - 1][0], dy = p[k][1] - p[k - 1][1]; lens.push(Math.hypot(dx, dy)); dir.push([dx, dy]); }
    const back = (k) => lens[k] > 0.5 && lens[k + 1] > 0.5 && (dir[k][0] * dir[k + 1][0] + dir[k][1] * dir[k + 1][1]) / (lens[k] * lens[k + 1]) < -0.6;
    const run = [p[0]];
    for (let a = 0; a < lens.length;) {
      let b = a;
      while (b < lens.length - 1 && back(b)) b++;
      const col = p.slice(a, b + 2), g = b - a >= 6 && col.slice(2).map((q, k) => Math.hypot(q[0] - col[k][0], q[1] - col[k][1])).sort((x, y) => x - y)[(col.length - 2) >> 1];
      if (g && (g < SATIN[0] - 0.005 || g > SATIN[1] + 0.005) && g / scale <= OPEN) {
        for (const q of col) hit(q, -1);
        run.push(...column(col, 1, true)[0].slice(1)); a = b + 1;
      }
      else { run.push(p[a + 1]); a++; }
    }
    for (const q of run) out.push([Math.round(q[0] * 10), Math.round(q[1] * 10), STITCH]);
    i = j;
  }
  return out;
}

// a new pattern: scaled about its centre, tiny stitches merged into the next, long ones split, dense spots thinned;
// `sort` merges same-thread blocks first; past 80-120 % it's re-stitched (`restitch`)
export function fix(pattern, { scale = 1, tiny = false, thin = false, sort = false, join = false, satin = false } = {}) {
  pattern = landJumps(pattern);
  if (sort) { const j = join ? joinSame(pattern) : pattern; pattern = sortColors(j) || j; }
  // (re-stitched, every stitch is new: tiny ones it made go whatever the box says; gnome at 150 %: 2 -> 43)
  if (scale < 0.8 - 1e-9 || scale > 1.2 + 1e-9) pattern = restitch(pattern, scale), scale = 1, satin = false, tiny = true;
  else if (scale !== 1) satin = true;
  let st = pattern.stitches;
  if (scale !== 1) {
    // (a loop, not Math.min(...pts): spreading 110k+ stitches overflows the stack)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y, c] of st) if (c === STITCH || c === JUMP) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // whole 0.1 mm units here, so the writer's rounding can't collapse a stitch the check then misses
    st = st.map(([x, y, c]) => [Math.round(cx + (x - cx) * scale), Math.round(cy + (y - cy) * scale), c]);
  }
  if (satin) st = respace(st, scale);
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
      // (at any size: a file's own same-hole stitch showed only once its long stitches were split, long15.pes)
      if (d === 0 && st[i - 1][2] !== JUMP) continue;
      // (keep the stitch before a command: it's the end of a run or a lock)
      if (tiny && d < 3 && st[i + 1]?.[2] === STITCH && st[i - 1][2] !== JUMP) continue;
      // (split here as split satin, not by the writer, which halves anything over 7 mm where relieve and slide can't
      // see it: those halves piled peace.pes at 80 % to 25 hits/mm² even thinned)
      if (d > MAXS * 10) for (const q of split([last[0] / 10, last[1] / 10], [x / 10, y / 10], i)) out.push([Math.round(q[0] * 10), Math.round(q[1] * 10), STITCH]);
    }
    out.push([x, y, c]);
    if (c === STITCH || c === JUMP) last = [x, y]; else if (c === TRIM || c === COLOR_CHANGE) last = null;
  }
  const done = slide(thin ? relieve(out, LIMIT) : out);
  return blockThreads({ stitches: tiny ? dropTiny(done) : done, threads: pattern.threads });
}
// One thread per colour block, as the writer needs: it lists every thread it's given in the PEC header, and the
// machine (and pe900_check) expects one per block. A PES whose header named two threads for its one block was saved
// "Checked" with "2 colours" for 1 (round 6's disagree.pes).
export function blockThreads(pattern) {
  let blocks = 1;
  for (const s of pattern.stitches) if (s[2] === COLOR_CHANGE) blocks++;
  return pattern.threads.length > blocks ? { ...pattern, threads: pattern.threads.slice(0, blocks) } : pattern;
}
// The last word on tiny stitches, on the coordinates the writer will use (whole 0.1 mm, half to even) and by the
// checker's rule (under 0.3 mm, bar the first 6 after a jump, trim or thread change): measured before thinning and on
// unrounded points, "Remove tiny stitches" left 23 on gnome at 70 % (star_badge's 48 at 80 % were exact 0.3 mm steps
// of a square-wave satin that the checker read as 0.29999 mm in float; it counts in 0.1 mm units now). A stitch goes when
// the next is a stitch too and dropping it doesn't put the needle back into the hole it just left; the last stitch
// of a run (before a trim or thread change) stays and the one before it goes instead.
function dropTiny(st) {
  const out = [];
  let last = null, after = 0;
  for (let i = 0; i < st.length; i++) {
    const c = st[i][2], s = c === STITCH || c === JUMP ? [pyRound(st[i][0]), pyRound(st[i][1]), c] : st[i];
    if (c === STITCH && last) {
      const d = Math.hypot(s[0] - last[0], s[1] - last[1]), nx = st[i + 1];
      if (after > 6 && d < 3) {
        if (nx?.[2] === STITCH && (pyRound(nx[0]) !== last[0] || pyRound(nx[1]) !== last[1])) continue;
        const pp = out[out.length - 2];
        if (nx?.[2] !== STITCH && after > 7 && out[out.length - 1][2] === STITCH && pp?.[2] === STITCH && Math.hypot(s[0] - pp[0], s[1] - pp[1]) >= 3) {
          out.pop(); after--;
        }
      }
      after++;
    }
    if (c === JUMP || c === TRIM || c === COLOR_CHANGE) after = 0;
    if (c === STITCH || c === JUMP) last = s;
    out.push(s);
  }
  return out;
}

// An opened file (Open a design): what it is, what's wrong with it, and the bytes a download starts from (`out`: the
// file's own bytes when they can go out as they are, else written again; null when it can't be saved at all). Throws
// an error with `plain` (words to show) for a file with no stitches; anything else that throws is an unreadable file.
// app.js `openDesign` shows it; tests/open_fuzz.test.mjs feeds it damaged files.
export const DST_COLOURS = ["#0e1f7c", "#ed171f", "#00673e", "#e8a900", "#770176", "#f64a8a", "#000000", "#c70156"];
const brother = (hex) => { const t = nearestBrotherThread(hex); return { color: hex, name: t.name, brand: "Brother" }; };
// A design far from the origin (over 200 mm: a PES box holds 204.8 mm either way, so it can't be written there) moved
// to sit on it, as the machine centres it anyway. Files that fit stay where they are, byte for byte.
// (centred on its stitches, and any jump still out there stops at their edge: the frame needn't travel further)
function centred(d) {
  const far = (c) => { for (const [x, y, k] of d.stitches) if ((k === STITCH || k === JUMP) && Math.max(Math.abs(x - c[0]), Math.abs(y - c[1])) > 2000) return true; return false; };
  if (!far([0, 0])) return d;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, c] of d.stitches) if (c === STITCH) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2), lim = (v, a, b) => Math.min(b, Math.max(a, v));
  return { ...d, stitches: d.stitches.map(([x, y, c]) => (c === JUMP ? [lim(x, x0, x1) - cx, lim(y, y0, y1) - cy, c] : [x - cx, y - cy, c])) };
}
// A design starts with its first needle move: thread changes and trims before it (empty blocks at the start of a
// damaged file) go, with their threads. Written as they were, the writer's start read back as one stitch more and
// Download refused the file.
function firstMove(d) {
  const k = d.stitches.findIndex((s) => s[2] === STITCH || s[2] === JUMP);
  if (k <= 0) return d;
  const skipped = d.stitches.slice(0, k).filter((s) => s[2] === COLOR_CHANGE).length;
  return { ...d, stitches: d.stitches.slice(k), threads: d.threads.slice(Math.min(skipped, Math.max(0, d.threads.length - 1))), pec: d.pec?.slice(skipped) };
}
// What a file that isn't an embroidery design is, from its first bytes, said plainly (with `picture`: the image type,
// for Picture to stitches to take it), or null. A PNG renamed .pes said "has no stitches in it... may be damaged", an
// empty file the same; a zipped download is the usual way designs come.
const SNIFF = [
  [[0x89, 0x50, 0x4e, 0x47], "a picture (PNG)", "image/png"], [[0xff, 0xd8, 0xff], "a picture (JPEG)", "image/jpeg"],
  [[0x47, 0x49, 0x46, 0x38], "a picture (GIF)", "image/gif"], [[0x25, 0x50, 0x44, 0x46], "a PDF (a pattern or instructions sheet?)"],
  [[0x50, 0x4b, 0x03, 0x04], "a .zip folder"],
];
export function notEmbroidery(bytes, name) {
  const b = bytes, at = (sig, i = 0) => sig.every((v, k) => b[i + k] === v), text = (i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (!b.length) return { message: `${name} is empty (0 bytes): nothing was saved in it. Download it again from where it came from.` };
  let what = null, type = null;
  for (const [sig, w, t] of SNIFF) if (at(sig)) { what = w; type = t || null; }
  if (text(0, "RIFF") && text(8, "WEBP")) { what = "a picture (WebP)"; type = "image/webp"; }
  if (text(4, "ftyp") && /^(heic|heix|mif1|avif)$/.test(String.fromCharCode(...b.subarray(8, 12)))) what = "a photo (HEIC or AVIF)";
  if (/^\s*(<\?xml[^]*)?<svg/i.test(String.fromCharCode(...b.subarray(0, 300)))) what = "a drawing (SVG)";
  if (!what) return null;
  const how = what === "a .zip folder" ? " Open it (double-click it) and pick the .pes file inside."
    : type ? " Picture to stitches can turn it into stitches." : /^a (photo|drawing)/.test(what) ? " Save it as a JPG or PNG, then Picture to stitches can turn it into stitches." : " Look for the .pes file that came with it.";
  return { message: `${name} is ${what}, not an embroidery design.${how}`, picture: type };
}
export function openedFile(bytes, name) {
  // (a picture, a PDF, a zip or an empty file, said as what it is)
  const not = notEmbroidery(bytes, name);
  if (not) throw Object.assign(new Error(not.message), { plain: true, picture: not.picture });
  // (jumps landed on their first stitch: a DST converted here, or a fixed copy, would gain a hole where each ended)
  let d = centred(firstMove(landJumps(readEmbroidery(bytes, name))));
  // (a needle move: a stitch that goes somewhere. A file cut down to one stitch on the origin opened, then Download
  // refused it as having no stitches)
  if (!d.stitches.some((s, i) => s[2] === STITCH && i && (s[0] !== d.stitches[i - 1][0] || s[1] !== d.stitches[i - 1][1]))) throw Object.assign(new Error(`${name} has no stitches in it. It may be damaged or not an embroidery file: try downloading it again.`), { plain: true });
  // (a file cut short still decodes, as the part that's there: peace.pes cut in half opened as 2,658 stitches, "Fits")
  const short = endsEarly(bytes, name);
  // A PES whose design block (what PE-DESIGN opens) isn't what its PEC block (what the machine sews) holds: its
  // threads are the PEC block's too (the header said "Red" for a block the machine sews green), and it's saved
  // again as what the machine sews, so both agree. (A file cut short disagrees too: it says so already.)
  const disagree = d.format === "pes" && !short && designBlockAgrees(bytes) === false;
  if (disagree) d.threads = d.pec.map((i) => { const t = pecThread(i); return { color: t.hex, name: t.name, brand: "Brother" }; });
  // a file with no thread colours (DST): each block gets its own, to tell them apart and to change
  const blocks = d.stitches.filter((s) => s[2] === COLOR_CHANGE).length + 1, colourless = d.threads.length < blocks;
  if (colourless) d.threads = Array.from({ length: blocks }, (_, i) => d.threads[i] || brother(DST_COLOURS[i % DST_COLOURS.length]));
  d = blockThreads(d);
  // A PES that breaks a rule the machine itself needs (a thread list that isn't one per colour, appliqué codes for
  // threads, too many thread changes) is never saved as it came: it's written again, or not saved at all. It was
  // "Save a copy", byte for byte, then "It opens on a Brother PE900" (pec_count_ff.pes, colours_121.pes).
  const hard = d.format === "pes" && !short ? verdictOf(bytes).filter((q) => HARD.has(q.key)) : [];
  const misplaced = d.format === "pes" && !!d.misplaced;
  // Two designs that don't agree, and the machine's own one broken as well (its design box, its thread list): a damaged
  // file, said so, not "two different designs" (flipped.pes, 99 bytes changed in a download: 489 mm of scribble was
  // called a second design, with three fixes said beside it)
  const damaged = disagree && (misplaced || hard.some((q) => q.key === "colours" || q.key === "applique"));
  const repair = misplaced || (d.format === "pes" && (short || disagree || hard.length > 0));
  const isPes = d.format === "pes" && !repair;
  // More colour blocks than the machine steps through (99; the PES writer refuses over 127: colors150.pes has 150,
  // and was called damaged): each thread's parts sewn together if that brings it under (`fewer`), else it's shown
  // but not saved (`stuck`; a PES too, since round 8: colours_121.pes was saved as it came).
  // (its stops as the facts beside the preview count them: thread changes, and pauses in the same thread)
  const same = Math.min(blocks - 1, pauses(d)), stops = stopWords(blocks - 1 - same, same);
  const tooMany = blocks > MAX_BLOCKS, fewer = tooMany ? fewerBlocks(d) : null, stuck = tooMany && !fewer && !isPes;
  let merged = null;
  if (tooMany && fewer && !isPes) { merged = [blocks - 1, fewer.threads.length - 1]; d = { ...fewer, format: d.format, version: d.version }; }
  const out = isPes ? bytes : stuck ? null : writePES(d);
  // (the checkup reads the file as it will be saved: the original bytes, or the copy written here)
  const check = checkup(out ? readEmbroidery(out, "x.pes") : d);
  // A file that's written again here anyway (a misplaced or cut-short PES, a DST) is written fixed: what it fails
  // is ticked. dense_k.pes was saved as "_fixed" with only its box mended, still 40 hits/mm².
  const need = new Set(isPes || stuck ? [] : check.verdict.map((q) => q.key));
  return { d, out, check, need, isPes, repair, hard, misplaced, short, disagree, damaged, colourless, tooMany, blocks, stops, merged, stuck,
    noFix: stuck || (tooMany && !fewer), fixBase: isPes && fewer ? fewer : null };
}
