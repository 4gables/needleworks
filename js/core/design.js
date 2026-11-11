/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Build a stitch pattern block by block (mm in, 0.1 mm out).
import { COLOR_CHANGE, END, JUMP, STITCH, TRIM, writePES } from "./formats.js";
import { MARGIN } from "./machines.js";
import { LIMITS, TIE_INS } from "./recipes.js";
import { pyRound } from "./threads.js";

// Which side of the line from p along d the points mostly lie on: 1 for the left (-d.y, d.x), -1 for the right
// (left when they're on the line: the side every lock used before).
function inward(p, d, pts) {
  let s = 0;
  for (const q of pts) s += d[0] * (q[1] - p[1]) - d[1] * (q[0] - p[0]);
  return s < 0 ? -1 : 1;
}

export class Design {
  constructor(hoop) { this.hoop = hoop; this.stitches = []; this.threads = []; this.cur = null; this.started = false; }

  color(hex, description = "") {
    this.tieOff();
    if (this.started) this.stitches.push([0, 0, COLOR_CHANGE]);
    this.threads.push({ color: hex, description, brand: "" });
    this.cur = null;
  }

  st(cmd, [x, y]) { this.stitches.push([x * 10, y * 10, cmd]); }

  // stitch a run of points; jumps (with a trim) if it starts away from the needle, or when told the way there
  // would show (it crosses open fabric)
  // lockAt: a point under stitches still to come (1 mm along a lettering stroke that's satined back over): the needle
  // comes down and locks there, then stitches to the run's start. A lock on the start itself, a column's end, put two
  // hits on the letter's outer edge (Josefin's h, at the top of its stem).
  // reach: how far (mm, over 2) the needle may be and still stitch to the start (a satin column whose start it's under)
  path(pts, lock = true, jump = false, lockAt = null, reach = 0) {
    if (!pts.length) return;
    const far = !this.cur || jump || Math.hypot(pts[0][0] - this.cur[0], pts[0][1] - this.cur[1]) > Math.max(2.0, reach || 0);
    if (this.cur && far) { this.tieOff(); this.stitches.push([0, 0, TRIM]); }
    if (far && lock && lockAt && Math.hypot(lockAt[0] - pts[0][0], lockAt[1] - pts[0][1]) >= 0.7) {
      this.path([lockAt, pts[0]], true, false);
      for (let i = 1; i < pts.length; i++) this.st(STITCH, pts[i]);
      this.cur = pts[pts.length - 1]; this.recent = pts.slice(-7, -1);
      this.back = pts.slice().reverse().find((q) => Math.hypot(q[0] - this.cur[0], q[1] - this.cur[1]) > 0.3) || null;
      return;
    }
    if (far) {
      this.st(JUMP, pts[0]);
      if (lock) {
        // toward the first point that isn't on top of the start (repeated points would make a 0 mm tie-in)
        const ahead = pts.find((q) => Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]) > 0.3);
        let d = ahead ? [ahead[0] - pts[0][0], ahead[1] - pts[0][1]] : [1, 0];
        // 0.7 mm tie-in, mid-range of sold designs (0.5-0.8); shorter ones can pull out before the bobbin thread catches
        // (0.5 where the run's own next points land on the 0.7 one: a run whose second point is 0.7 mm on put three
        // hits in that hole, 71 tie-ins over the batch: script columns begun at a junction, picture runs)
        const L = Math.max(Math.hypot(...d), 1e-9), u = [d[0] / L, d[1] / L], near = pts.slice(1, 5);
        const tie = TIE_INS.find((t) => near.every((r) => Math.hypot(r[0] - pts[0][0] - u[0] * t, r[1] - pts[0][1] - u[1] * t) > 0.12)) || TIE_INS[0];
        d = [u[0] * tie, u[1] * tie];
        // one hit 0.35 mm to the side, so the needle doesn't go through the same hole three times: on the side the
        // stitches go (it poked 0.5 mm out of script strokes on the other side)
        const p = pts[0], q = [p[0] + d[0], p[1] + d[1]], k = inward(p, d, pts.slice(1, 7)), e = [p[0] - (k * d[1]) / 2, p[1] + (k * d[0]) / 2];
        for (const r of [p, q, e, q, p]) this.st(STITCH, r);
      }
    } else if (Math.hypot(pts[0][0] - this.cur[0], pts[0][1] - this.cur[1]) >= 0.3) this.st(STITCH, pts[0]);   // (a run that starts where the needle is needs no extra stitch)
    for (let i = 1; i < pts.length; i++) this.st(STITCH, pts[i]);
    this.cur = pts[pts.length - 1]; this.started = true; this.recent = pts.slice(-7, -1);
    // where a tie-off can step back to: along the line just sewn, so it hides in those stitches
    this.back = pts.slice().reverse().find((q) => Math.hypot(q[0] - this.cur[0], q[1] - this.cur[1]) > 0.3) || null;
  }

  // Lock the thread before it's cut (trim, colour change, end): two 0.7 mm stitches back and forth along the
  // last line, the second beside the first. Without it a trimmed thread can work loose (PEmbroider #105; Ink/Stitch locks every trim).
  tieOff() {
    if (!this.cur) return;
    const c = this.cur;
    let d = this.back ? [this.back[0] - c[0], this.back[1] - c[1]] : [1, 0];
    const L = Math.max(Math.hypot(...d), 1e-9); d = [(d[0] / L) * 0.7, (d[1] / L) * 0.7];
    // (the second hit 0.35 mm aside, toward the stitches just sewn so it hides in them)
    const k = inward(c, d, this.recent || []), q = [c[0] + d[0], c[1] + d[1]], e = [q[0] - (k * d[1]) / 2, q[1] + (k * d[0]) / 2];
    for (const r of [q, c, e, c]) this.st(STITCH, r);
    this.cur = null;
  }

  // opts.untiny: drop stitches under 0.3 mm first (the Design tab; pictures and the bookmark sew as they always have)
  finish({ untiny: drop = false } = {}) {
    this.tieOff();
    this.stitches.push([0, 0, END]);
    this.stitches = relieve(dedupe(drop ? untiny(this.stitches) : this.stitches));
    // A design that ends up over 200 mm from the hoop's centre (a piece placed far out, a word on a 400 mm curve from a
    // saved design) is moved onto it, as the machine centres it anyway: a PES design box holds 204.8 mm either way,
    // and past that the file read back shifted and was refused at Download (tests/browser/engine_fuzz.html). Designs
    // nearer the centre stay exactly where they are.
    // (`shifted`, 0.1 mm: how far, so a preview can draw it where it was made, under the pieces it came from)
    const [x0, y0, x1, y1] = this.bounds();
    this.shifted = null;
    if (Math.max(-x0, x1, -y0, y1) > LIMITS.recentre) {
      const cx = Math.round((x0 + x1) * 5), cy = Math.round((y0 + y1) * 5);
      this.stitches = this.stitches.map(([x, y, c]) => [x - cx, y - cy, c]);
      this.shifted = [cx, cy];
    }
    this.check();
    return this;
  }

  bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y, c] of this.stitches) if (c === STITCH || c === JUMP) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return [x0 / 10, y0 / 10, x1 / 10, y1 / 10];
  }

  check() {
    const [x0, y0, x1, y1] = this.bounds(), w = x1 - x0, h = y1 - y0;
    const lw = this.hoop.w - 2 * MARGIN, lh = this.hoop.h - 2 * MARGIN;
    if (w > lw || h > lh) {
      const err = new Error(`This design is ${w.toFixed(1)} × ${h.toFixed(1)} mm, but the ${this.hoop.name} fits ${lw} × ${lh} mm.`);
      err.overBy = Math.max(w / lw, h / lh);
      throw err;
    }
  }

  pattern() { return { stitches: this.stitches, threads: this.threads }; }
  toBytes() { return writePES(this.pattern()); }
}

// A stitch onto the point the needle is already in (as the file rounds it, 0.1 mm) is a second hit in the same hole
// and nothing else: line drawings had a quarter of their stitches doubled, lettering 12-47 at satin/run junctions.
// (A stitch after a jump is the jump's anchor and stays.)
// (rounded as the writer rounds: half to even)
export function dedupe(st) {
  const out = [];
  for (const s of st) {
    const q = out[out.length - 1];
    if (s[2] === STITCH && q && q[2] === STITCH && pyRound(s[0]) === pyRound(q[0]) && pyRound(s[1]) === pyRound(q[1])) continue;
    out.push(s);
  }
  return out;
}

// No stitch of `min` or less (0.1 mm units, as the file rounds them) between two others: Ink/Stitch's minimum stitch
// length. The point that ends one is dropped (or, when that point is a lock's or a command's, the one before it), so
// the needle goes on to the next point. Skeleton junctions in small script (a knot of strokes 0.1-0.3 mm long, each
// sewn out and back) gave lettering 1-4% tiny stitches. Tie-ins (7 stitches after a command) and the stitches just
// before one (a tie-off and its stroke end) are never touched.
export function untiny(st, min = LIMITS.tiny) {
  const n = st.length, fixed = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (st[i][2] !== STITCH) {
    for (let j = i - 5; j <= i + 7; j++) if (j >= 0 && j < n) fixed[j] = 1;
  }
  const out = [], from = [];
  const R = (s) => [pyRound(s[0]), pyRound(s[1])];
  const far = (a, b) => { const [ax, ay] = R(a), [bx, by] = R(b), d = Math.hypot(bx - ax, by - ay); return d === 0 || d > min; };   // (exactly 0.3 too: the checker reads it as 0.29999)
  for (let i = 0; i < n; i++) {
    const s = st[i], q = out[out.length - 1];
    if (s[2] === STITCH && q && q[2] === STITCH && !far(q, s)) {
      if (!fixed[i]) continue;   // (drop this point: the next stitch starts from q)
      const p = out[out.length - 2];
      if (!fixed[from[from.length - 1]] && p && p[2] === STITCH && far(p, s)) { out.pop(); from.pop(); }
    }
    out.push(s); from.push(i);
  }
  return out;
}

// No 1 x 1 mm square may take more than `limit` needle hits within one colour block (nest / broken needle risk;
// tests/pe900_check.py enforces the same). Where strokes pile up (satin junctions), drop interior stitch points:
// two stitches become one slightly longer one. Tie-ins and tie-offs (5 points around any jump/trim/colour change)
// are kept. The machine's grid can sit at any 0.1 mm offset from ours, so every offset is checked.
export function relieve(st, limit = LIMITS.hits) {
  const n = st.length, keep = new Uint8Array(n).fill(1), blk = new Int32Array(n);
  for (let i = 0, b = 0; i < n; i++) { if (st[i][2] === COLOR_CHANGE) b++; blk[i] = b; }
  // (each point's place as the file rounds it, worked out once: asked for again at every window, the rounding alone
  // was a fifth of the time)
  const XR = new Int32Array(n), YR = new Int32Array(n);
  for (let i = 0; i < n; i++) { XR[i] = pyRound(st[i][0]); YR[i] = pyRound(st[i][1]); }
  const X = (i) => XR[i], Y = (i) => YR[i];
  const removable = (i) => { for (let j = i - 5; j <= i + 5; j++) if (j < 0 || j >= n || st[j][2] !== STITCH) return false; return true; };
  const near = (i, d) => { let j = i + d; while (j >= 0 && j < n && !keep[j]) j += d; return j; };
  // (cells keyed by number, in the order their first stitch comes: text keys, built and split again for every stitch
  // and corner, were most of what was left of the time)
  const cells = new Map(), key = (b, cx, cy) => (b * 8192 + cx + 4096) * 8192 + cy + 4096;
  for (let i = 0; i < n; i++) if (st[i][2] === STITCH) {
    const cx = Math.floor(XR[i] / 10), cy = Math.floor(YR[i] / 10), k = key(blk[i], cx, cy);
    let c = cells.get(k);
    if (!c) cells.set(k, (c = { b: blk[i], cx, cy, at: [] }));
    c.at.push(i);
  }
  // every 1 mm window whose corner lies in a cell is inside that cell and its right/lower neighbours; the corner
  // cell itself can be empty (missed until 2026-10-30: towel names reached 27), so occupied cells' left/upper
  // neighbours are corners too
  const corners = new Map();
  for (const c of cells.values()) for (const i of [0, 1]) for (const j of [0, 1]) { const k = key(c.b, c.cx - i, c.cy - j); if (!corners.has(k)) corners.set(k, [c.b, c.cx - i, c.cy - j]); }
  const sums = new Uint16Array(21 * 21);
  for (const [b, cx, cy] of corners.values()) {
    const pts = [cells.get(key(b, cx, cy)), cells.get(key(b, cx + 1, cy)), cells.get(key(b, cx, cy + 1)), cells.get(key(b, cx + 1, cy + 1))].flatMap((c) => (c ? c.at : []));
    if (pts.length <= limit) continue;
    // the kept hits at each 0.1 mm point of these four cells, summed from the top left: a window's count is four
    // reads, and only a window over the limit is looked at point by point (most aren't; the same windows are thinned,
    // in the same order, as when each one's points were picked out: a busy design's thinning took 0.5 s of a change)
    const count = () => {
      sums.fill(0);
      for (const i of pts) if (keep[i]) sums[(YR[i] - cy * 10 + 1) * 21 + XR[i] - cx * 10 + 1]++;
      for (let y = 1; y < 21; y++) for (let x = 1; x < 21; x++) sums[y * 21 + x] += sums[y * 21 + x - 1] + sums[(y - 1) * 21 + x] - sums[(y - 1) * 21 + x - 1];
    };
    count();
    for (let ox = 0; ox < 10; ox++) for (let oy = 0; oy < 10; oy++) {
      if (sums[(oy + 10) * 21 + ox + 10] - sums[oy * 21 + ox + 10] - sums[(oy + 10) * 21 + ox] + sums[oy * 21 + ox] <= limit) continue;
      const x0 = cx * 10 + ox, y0 = cy * 10 + oy;
      let dropped = false;
      const inside = pts.filter((i) => keep[i] && X(i) >= x0 && X(i) < x0 + 10 && Y(i) >= y0 && Y(i) < y0 + 10);
      for (let cap = 40; inside.length > limit && cap <= 70; cap += 30) while (inside.length > limit) {
        // merged stitch stays under 4 mm (fill stitches are 3.5); where that isn't enough (travel through one spot),
        // under 7 mm
        let best = -1, bestD = cap, pair = -1, pairD = cap;
        for (const i of inside) {
          if (!removable(i)) continue;
          const a = near(i, -1), c = near(i, 1);
          if (a < 0 || c >= n || st[a][2] !== STITCH || st[c][2] !== STITCH) continue;
          const d = Math.hypot(X(c) - X(a), Y(c) - Y(a));
          // (A, B, A: dropping B would put the needle into A's hole again; and never a stitch of 0.3 mm or less: the
          // shortest merge across a satin is its own edge, which on a tight inner curve is 0.1-0.2 mm, and small
          // script lettering came out of here with 2-4% tiny stitches. Then B and C go together, if that's enough.)
          if (d > 3) { if (d < bestD) { bestD = d; best = i; } continue; }
          const e = near(c, 1);
          if (!removable(c) || e >= n || st[e][2] !== STITCH) continue;
          const d2 = Math.hypot(X(e) - X(a), Y(e) - Y(a));
          if (d2 > 3 && d2 < pairD) { pairD = d2; pair = i; }
        }
        if (best < 0 && pair < 0) break;
        const drop = best >= 0 ? [best] : [pair, near(pair, 1)];
        for (const i of drop) { keep[i] = 0; const at = inside.indexOf(i); if (at >= 0) inside.splice(at, 1); }
        dropped = true;
      }
      if (dropped) count();
    }
  }
  return st.filter((_, i) => keep[i]);
}

// A design laid out in the turned hoop, turned clockwise into the machine's: thinned again after the turn, since a
// quarter turn moves the 1 mm windows' edges (a turned picture thinned before it reached 26 hits/mm²)
export function turnForMachine(p) {
  const t = turnPattern(p);
  return { ...t, stitches: relieve(t.stitches) };
}

// A quarter turn of a pattern (y down): clockwise turns a sideways design into the machine's hoop, and back.
export function turnPattern(p, clockwise = true) {
  return { ...p, stitches: p.stitches.map(([x, y, c]) => (clockwise ? [-y, x, c] : [y, -x, c])) };
}
