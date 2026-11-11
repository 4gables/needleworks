/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Build a stitch pattern block by block (mm in, 0.1 mm out).
import { COLOR_CHANGE, END, JUMP, STITCH, TRIM, writePES } from "./formats.js";
import { MARGIN } from "./machines.js";
import { EASE, LIMITS, LOCKS, TIE_INS } from "./recipes.js";
import { Hits } from "./density.js";
import { pyRound } from "./threads.js";

// Which side of the line from p along d the points mostly lie on: 1 for the left (-d.y, d.x), -1 for the right
// (left when they're on the line: the side every lock used before).
function inward(p, d, pts) {
  let s = 0;
  for (const q of pts) s += d[0] * (q[1] - p[1]) - d[1] * (q[0] - p[0]);
  return s < 0 ? -1 : 1;
}

// Whether the points all lie within `LOCKS.line` mm of the line from p along d: a single line of thread (a fine
// line's letter, a line border, a picture's run), with no column for a lock's sideways hit to hide in.
function bare(p, d, pts) {
  const L = Math.hypot(d[0], d[1]) || 1;
  return pts.every((q) => Math.abs((q[0] - p[0]) * d[1] - (q[1] - p[1]) * d[0]) / L < LOCKS.line);
}

export class Design {
  // ease: stitches give way where this colour is already thick (the Design tab's pieces; pictures and the Open tab's
  // fixes sew as they always have)
  constructor(hoop, { ease = false } = {}) { this.hoop = hoop; this.stitches = []; this.threads = []; this.cur = null; this.started = false; this.hits = ease ? new Hits() : null; }

  color(hex, description = "") {
    this.tieOff();
    if (this.started) this.stitches.push([0, 0, COLOR_CHANGE]);
    this.threads.push({ color: hex, description, brand: "" });
    this.cur = this.at = null;
    if (this.hits) this.hits = new Hits();   // (the limit is per colour block)
  }

  st(cmd, [x, y], counted = false) {
    this.stitches.push([x * 10, y * 10, cmd]);
    if (this.hits && cmd === STITCH && !counted) this.hits.add(pyRound(x * 10), pyRound(y * 10));
  }

  // A run of points about to be sewn, giving way where this colour's thread is already thick (recipes.js EASE): the
  // first two and last two points stay (locks step along them), and so does every point that fits. One that
  // doesn't, where the stitch into it and the one out double back (a satin's or a zigzag's end), comes part of the
  // way back across its column: a short stitch, as a digitizer puts on the inside of a turn and where columns
  // meet, so the hits spread inward and the outer edge keeps every stitch. Where no short one fits it is left out,
  // and the point beside the last one kept with it (never a stitch under `least`, nor one over `most`). A point
  // on a straight stretch of a run (an underlay, a walk) is left out and its two stitches become one. Counted as
  // the file rounds them; every point kept is counted here, so `st` doesn't count it again.
  // 2026-11 (v27): 1,640 points were taken out afterwards by `relieve` over the batch, 790 of them from towel names
  // (2.5 mm columns fanning round a junction) and nearly all the rest where a script's strokes meet.
  // from: where the needle is, when it will stitch (not jump) to this run. Then a first point that doesn't fit is
  // left out and the needle goes straight to the second: strokes that meet at a node each began on it (a run out
  // from the node the last column came back to), and a kitchen caption's node took 10 hits in one hole.
  eased(pts, first = true, from = null) {
    const H = this.hits, n = pts.length, out = [], R = (v) => pyRound(v * 10);
    const keep = (q, hit = true) => { out.push(q); if (hit) H.add(R(q[0]), R(q[1])); };
    const fits = (q, more = 0) => H.top(R(q[0]), R(q[1]), EASE.cap + more) <= EASE.cap + more;
    const D = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    // Where this run's own turns crowd one spot (the inside of a tight bend of a wide column, a border's corner:
    // every stitch of the fan ends on one pivot), which of them come short is settled before any is sewn, evenly
    // through the fan: of the turns within a 1 mm window of this one, only as many as there is room for go the
    // whole way, the others between them stop short. Taken as they came, the first of the fan went the whole way
    // until the spot was full and the rest all stopped short, which left a wedge of the column bare beside the
    // pivot (a heart patch's tip: the fill showed through its border).
    const thin = n > 8 ? this.fan(pts) : null;
    let skipped = false, alt = 0;
    for (let i = 0; i < n; i++) {
      const b = pts[i];
      if (!i && n > 1 && first && from && !fits(b) && D(from, pts[1]) <= EASE.most && D(from, pts[1]) > EASE.least) continue;
      // (a hair from the last point kept: never a stitch of its own. With the run's end left out, such a pair was
      // the last stitch before a lock: the pouch's one tiny stitch)
      if (i && out.length > (i === n - 1 ? 1 : 0) && D(out[out.length - 1], b) < EASE.hair) continue;
      // (the last point too, where the run is already two points long and the stitch not sewn is a short one: the
      // needle stops a stitch short of a node other strokes end on. `path` still reckons the next run from the end
      // as drawn, so nothing that was stitched to becomes a jump.)
      if (i === n - 1 && i && out.length > 1 && !fits(b) && D(out[out.length - 1], b) <= EASE.merge) continue;
      if (i < 1 || i > n - 2) { keep(b, i > 0 || first); skipped = false; continue; }
      if (!out.length) { keep(b); continue; }   // (the first point was left out: this one starts the run)

      const a = out[out.length - 1], c = pts[i + 1], d1 = D(a, b), d2 = D(b, c);
      // (beside the last point kept, after one was left out: the same edge of a satin again)
      if (skipped && d1 < EASE.least && D(a, c) <= EASE.most && D(a, c) > EASE.least) continue;
      const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], h = D(m, b), wide = D(a, c);
      // A short stitch: its end `back` mm short of the edge, never more than `deep` of the way across. `seen` (a
      // fan): nor so far that the gap it leaves between its neighbours shows. They are `wide` apart at the far
      // edge (its own two ends there) and, at this one, twice as far as this end is from the last one kept on it:
      // nothing on a pivot, a third of a mm along a straight edge. (A stitch stopped 1.5 mm short beside a heart's
      // tip, its neighbours 0.6 mm apart, left a bare wedge there.)
      const near = out.length > 1 ? 2 * D(out[out.length - 2], b) : 0;
      const short = (backs, more = 0, seen = true) => d1 >= 0.8 && d2 >= 0.8 && backs.filter((k) => k <= EASE.deep * h && (!seen || (k * wide + (h - k) * near) / h <= EASE.show))
        .map((k) => [b[0] + ((m[0] - b[0]) * k) / h, b[1] + ((m[1] - b[1]) * k) / h]).find((q) => D(a, q) > EASE.least && D(q, c) > EASE.least && fits(q, more));
      const fan = thin ? thin[i] : 0;
      if (fan === 1) {
        const k = alt++ % EASE.back.length, s = short([...EASE.back.slice(k), ...EASE.back.slice(0, k)]);
        if (s) { keep(s); skipped = false; continue; }
      }
      if (fits(b)) { keep(b); skipped = false; continue; }
      const cos = d1 > 0 && d2 > 0 ? ((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) / (d1 * d2) : 1;
      if (cos < -0.5) {
        // (in a fan the column's own cover comes before the cap: whole a little over it, else short where that
        // doesn't show, else short however it shows, before a stitch is left out. Where columns meet, the others
        // cover what a short stitch leaves.)
        const s = fan ? (fits(b, EASE.slack) ? b : short(EASE.back) || short(EASE.back, EASE.slack) || short(EASE.back, EASE.slack, false)) : short(EASE.back, 0, false);
        if (s) { keep(s); skipped = false; continue; }
        if (D(a, c) <= EASE.most) { skipped = true; continue; }
      } else if (cos > 0.5) {
        const L = D(a, c), off = L > 0 ? Math.abs((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / L : 0;
        if (L <= EASE.merge && L > EASE.least && off <= EASE.stray) { skipped = true; continue; }
      }
      // (any other point, a corner or one of a pair a hair apart, where the stitch past it is no longer than `most`
      // and passes within `cut` of it)
      {
        const L = D(a, c), off = L > 0 ? Math.abs((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / L : d1;
        if (L <= EASE.most && L > EASE.least && off <= EASE.cut) continue;
      }
      keep(b); skipped = false;
    }
    return out;
  }

  // Which of a run's turns (a satin's ends) come short: 1 for each, where the turns within half a mm of it either way
  // and the hits already there are more than `EASE.cap`, less the share that still fits, spread evenly (`eased`).
  fan(pts) {
    const n = pts.length, turn = new Uint8Array(n), cells = new Map(), K = (gx, gy) => (gx + 32768) * 65536 + gy + 32768, key = (x, y) => K(Math.floor(x * 2), Math.floor(y * 2));
    let any = false;
    for (let i = 1; i < n - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1], ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
      const d1 = Math.hypot(ux, uy), d2 = Math.hypot(vx, vy);
      if (d1 < 0.8 || d2 < 0.8 || (ux * vx + uy * vy) / (d1 * d2) >= -0.5) continue;
      turn[i] = 1; any = true;
      const k = key(b[0], b[1]);
      let cell = cells.get(k);
      if (!cell) cells.set(k, (cell = []));
      cell.push(i);
    }
    if (!any) return null;
    const thin = new Uint8Array(n);
    let acc = 0, some = false;
    for (let i = 1; i < n - 1; i++) {
      if (!turn[i]) continue;
      const b = pts[i], gx = Math.floor(b[0] * 2), gy = Math.floor(b[1] * 2);
      // (own: this run's turns within the window; on: those on the pivot itself, within a quarter mm (four or more: along a straight edge they are a third of a mm apart). Only these come
      // short: the turns beside a corner, a few tenths along the edge from it, keep the column's inner edge where
      // it is, and room is left for them. Shortened with the rest, they let the fill show beside a heart's tip.)
      // (wide: within 1 mm, as far as a window holding this turn reaches)
      let own = 0, on = 0, wide = 0;
      for (let x = gx - 2; x <= gx + 2; x++) for (let y = gy - 2; y <= gy + 2; y++) for (const j of cells.get(K(x, y)) || []) {
        const dx = Math.abs(pts[j][0] - b[0]), dy = Math.abs(pts[j][1] - b[1]);
        if (dx < 1 && dy < 1) { wide++; if (dx < 0.5 && dy < 0.5) { own++; if (dx < 0.25 && dy < 0.25) on++; } }
      }
      if (own < EASE.fan) { if (wide >= 2 * EASE.fan) { thin[i] = 2; some = true; } continue; }
      if (on < 4) { thin[i] = 2; some = true; continue; }
      const there = this.hits.top(pyRound(b[0] * 10), pyRound(b[1] * 10), 0) - 1, room = Math.max(0, EASE.cap - there - (own - on));
      if (on <= room) continue;
      acc += room / on;
      if (acc >= 1) acc -= 1; else { thin[i] = 1; some = true; }
    }
    return some ? thin : null;
  }

  // stitch a run of points; jumps (with a trim) if it starts away from the needle, or when told the way there
  // would show (it crosses open fabric)
  // lockAt: a point under stitches still to come (1 mm along a lettering stroke that's satined back over): the needle
  // comes down and locks there, then stitches to the run's start. A lock on the start itself, a column's end, put two
  // hits on the letter's outer edge (Josefin's h, at the top of its stem).
  // reach: how far (mm, over 2) the needle may be and still stitch to the start (a satin column whose start it's under)
  path(pts, lock = true, jump = false, lockAt = null, reach = 0, counted = false) {
    if (!pts.length) return;
    const end = pts[pts.length - 1];
    const at = this.at || this.cur;   // (where the needle is: a stitch short of `cur` when the last run's end gave way)
    const far = !this.cur || jump || Math.hypot(pts[0][0] - this.cur[0], pts[0][1] - this.cur[1]) > Math.max(2.0, reach || 0);
    if (this.hits && !counted) {
      // (the first point is a hit unless the needle is in it already)
      const first = far || Math.hypot(pts[0][0] - at[0], pts[0][1] - at[1]) >= 0.3;
      pts = this.eased(pts, first, far ? null : at);
    }
    if (this.cur && far) { this.tieOff(); this.stitches.push([0, 0, TRIM]); }
    if (far && lock && lockAt && Math.hypot(lockAt[0] - pts[0][0], lockAt[1] - pts[0][1]) >= 0.7) {
      this.path([lockAt, pts[0]], true, false, null, 0, true);
      for (let i = 1; i < pts.length; i++) this.st(STITCH, pts[i], true);
      this.ended(pts, end);
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
        // (on a single line of thread there is no such side: the hit goes on along the line, `past` the tie-in's. Beside
        // it, it stood 0.4 mm off a fine-line letter's stroke, a nub at the top of an H: tester, 2026-11)
        const p = pts[0], q = [p[0] + d[0], p[1] + d[1]], k = inward(p, d, pts.slice(1, 7));
        const e = bare(p, d, pts.slice(1, 7)) ? [q[0] + u[0] * LOCKS.past, q[1] + u[1] * LOCKS.past] : [p[0] - (k * d[1]) / 2, p[1] + (k * d[0]) / 2];
        [p, q, e, q, p].forEach((r, i) => this.st(STITCH, r, counted ? false : !i));   // (the start is counted with the run's points)
      }
    } else if (Math.hypot(pts[0][0] - at[0], pts[0][1] - at[1]) >= 0.3) this.st(STITCH, pts[0], true);   // (a run that starts where the needle is needs no extra stitch)
    for (let i = 1; i < pts.length; i++) this.st(STITCH, pts[i], true);
    this.started = true; this.ended(pts, end);
  }

  // After a run: `cur` is its end as drawn (what the next run's distance is reckoned from), `at` where the needle
  // is (the same, unless the last point gave way: `eased`), `back` where a tie-off can step back to: along the line
  // just sewn, so it hides in those stitches.
  ended(pts, end) {
    this.cur = end; this.at = pts[pts.length - 1]; this.recent = pts.slice(-7, -1);
    this.back = pts.slice().reverse().find((q) => Math.hypot(q[0] - this.at[0], q[1] - this.at[1]) > 0.3) || null;
  }

  // Lock the thread before it's cut (trim, colour change, end): two 0.7 mm stitches back and forth along the
  // last line, the second beside the first. Without it a trimmed thread can work loose (PEmbroider #105; Ink/Stitch locks every trim).
  tieOff() {
    if (!this.cur) return;
    const c = this.at || this.cur;
    let d = this.back ? [this.back[0] - c[0], this.back[1] - c[1]] : [1, 0];
    const L = Math.max(Math.hypot(...d), 1e-9); d = [(d[0] / L) * 0.7, (d[1] / L) * 0.7];
    // (the second hit 0.35 mm aside, toward the stitches just sewn so it hides in them)
    // (further back along the line where the last stitches were a single line of thread: as a tie-in's)
    const k = inward(c, d, this.recent || []), q = [c[0] + d[0], c[1] + d[1]];
    const e = bare(c, d, this.recent || []) ? [q[0] + (d[0] / 0.7) * LOCKS.past, q[1] + (d[1] / 0.7) * LOCKS.past] : [q[0] - (k * d[1]) / 2, q[1] + (k * d[0]) / 2];
    for (const r of [q, c, e, c]) this.st(STITCH, r);
    this.cur = this.at = null;
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
