/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The fill engine: tatami rows inside a shape (patterns, blends), travel routed under stitches still to come, and
// `fillPolygon` for a shape given as outlines. Pictures (digitize.js), patches and motifs (studio/pieces.js) and the
// Open tab's re-stitching (doctor.js) all fill through here. (Part of digitize.js until 2026-11.)
import { distanceTransform, label } from "./raster.js";
import { ROWS } from "./recipes.js";

// the fill angle (degrees) and working pixels per mm when nothing else is asked (8: 5 lost the narrow notches of
// small lettering, e.g. an M)
export const FILL = { angle: 45, res: 8 };

// Travel may lie on this colour's finished stitches for this far (mm) in all: a few stitches of the same thread on its
// own fill against a trim, two locks and often a loose thread to snip (2 mm until 2026-10-30: 3 mm took 5-15% of the
// trims and a third of the loose threads off the batch pictures)
export const SEWN = 3;

// Fill patterns: where each row's needle points fall, as a fraction of the stitch length by row number. Tatami's
// quarter steps hide the points; the others line them up into a texture you can see (programmable fills).
export const FILL_PATTERNS = {
  tatami: { name: "Plain", off: (r) => (r % 4) / 4 },
  brick: { name: "Brick", off: (r) => (r % 2) / 2 },
  chevron: { name: "Chevron", off: (r) => Math.abs((r % 12) - 6) / 12 },
  wave: { name: "Wave", off: (r) => 0.5 + 0.25 * Math.sin((r * Math.PI) / 8) },
};
// share(f): this layer's part of the full density at f, how far across the shape (0-1) the row lies: rows are
// spaced spacing / share, none where the share is under 0.15 (a colour blend: two layers whose spacings change
// gradually, so neither skips rows and leaves long links)
export function tatami(mask, comp, res, { angle, spacing, stitch, inset = 0, pull = 0.15, pattern = "tatami", share = null }) {
  const { w, h } = mask, th = (angle * Math.PI) / 180;
  const U = [Math.cos(th), Math.sin(th)], V = [-Math.sin(th), Math.cos(th)];
  const inside = (x, y) => {
    const X = Math.round(x), Y = Math.round(y);
    return X >= 0 && Y >= 0 && X < w && Y < h && comp.labels[Y * w + X] === comp.id && (!inset || comp.dt[Y * w + X] > inset * res);
  };
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const i of comp.pixels) {
    const x = i % w, y = (i - x) / w, u = x * U[0] + y * U[1], v = x * V[0] + y * V[1];
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
  }
  const sp = spacing * res, step = 0.5, L = stitch * res, rows = [];
  for (let v = v0 + sp / 2, r = 0; v <= v1; r++) {
    const k = share ? share((v - v0) / Math.max(v1 - v0, 1e-9)) : 1;
    if (k < 0.15) { v += sp; continue; }
    const ivs = [];
    let start = null;
    for (let u = u0 - 1; u <= u1 + 1; u += step) {
      const x = u * U[0] + v * V[0], y = u * U[1] + v * V[1], ins = inside(x, y);
      if (ins && start === null) start = u;
      if (!ins && start !== null) { ivs.push([start - pull * res, u - step + pull * res]); start = null; }
    }
    if (start !== null) ivs.push([start, u1]);
    rows.push({ v, r, ivs: ivs.filter(([a, b]) => b - a >= 0.6 * res) });
    v += sp / k;
  }
  // group intervals into regions that can be sewn back-and-forth without leaving the shape
  const regions = [];
  let prev = [];
  for (const row of rows) {
    const cur = row.ivs.map((iv) => ({ iv, region: null }));
    for (const c of cur) {
      const over = prev.filter((p) => p.iv[0] < c.iv[1] && c.iv[0] < p.iv[1]);
      if (over.length === 1) {
        const p = over[0], back = cur.filter((q) => q.iv[0] < p.iv[1] && p.iv[0] < q.iv[1]);
        if (back.length === 1 && p.region.open) { c.region = p.region; }
      }
      if (!c.region) { c.region = { rows: [], open: true }; regions.push(c.region); }
      c.region.rows.push({ v: row.v, r: row.r, iv: c.iv });
    }
    for (const p of prev) if (!cur.some((c) => c.region === p.region)) p.region.open = false;
    prev = cur;
  }
  const toXY = (u, v) => [u * U[0] + v * V[0], u * U[1] + v * V[1]];
  // the step from one row's end to the next row's start runs along the edge; where the edge curves in (the S's
  // counter) that step would cross open fabric, so the path is split there and the needle jumps instead
  const leaves = (p, q) => {
    const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / (0.2 * res));
    for (let i = 1; i < n; i++) {
      const x = p[0] + ((q[0] - p[0]) * i) / n, y = p[1] + ((q[1] - p[1]) * i) / n;
      if (!inside(x, y) && !inside(x + 1, y) && !inside(x - 1, y) && !inside(x, y + 1) && !inside(x, y - 1)) return true;
    }
    return false;
  };
  return regions.flatMap((reg) => {
    const paths = [[]];
    reg.rows.forEach((row, k) => {
      let [a, b] = row.iv;
      const fwd = k % 2 === 0, off = (FILL_PATTERNS[pattern] || FILL_PATTERNS.tatami).off(row.r) * L, line = [a];
      for (let u = Math.ceil((a - off) / L) * L + off; u < b; u += L) if (u - a > L * 0.3 && b - u > L * 0.3) line.push(u);
      line.push(b);
      // a short remainder at a row's end is merged into the last stitch (up to 1.3 x L, more with pull): halve
      // the ones over 4 mm, which lay loose on top of the fill
      for (let i = line.length - 1; i > 0; i--) if (line[i] - line[i - 1] > 4 * res) line.splice(i, 0, (line[i] + line[i - 1]) / 2);
      const pts = (fwd ? line : line.reverse()).map((u) => toXY(u, row.v)), cur = paths[paths.length - 1];
      if (cur.length && leaves(cur[cur.length - 1], pts[0])) { paths.push(pts); return; }
      // where the edge runs nearly along the rows, the step to the next row is long (up to 7.6 mm): a loose stitch
      // lying on top. Split into steps of 3 mm at most along it.
      const q = cur[cur.length - 1], n = q ? Math.ceil(Math.hypot(pts[0][0] - q[0], pts[0][1] - q[1]) / (3 * res)) : 1;
      for (let i = 1; i < n; i++) cur.push([q[0] + ((pts[0][0] - q[0]) * i) / n, q[1] + ((pts[0][1] - q[1]) * i) / n]);
      cur.push(...pts);
    });
    return paths;
  });
}

// Travel routing on a grid of 0.5 mm cells over the picture (Ink/Stitch's tatami travel, heatstitch's travel grid):
// A* over 8-neighbour cells that may be crossed (`inside`), where cells already sewn cost 6x and every earlier travel
// through a cell costs more, so ways hide under stitches still to come and don't funnel through one spot.
// cell(x, y): 1 where a cell (sampled at its centre pixel) may be crossed, 2 where it may and stitches sewn over it
// later hide whatever is sewn now (it's never counted as finished). hop(a, b): whether the straight step from a point
// to the cell it starts from (or ends on) is covered.
// Hard limits on the search, so no picture spends more than a few seconds routing (a framed photo's textured backdrop
// made one fill of 1782 sections, each tried from each: minutes, and the page never finished): one route gives up
// after ROUTE_CELLS cells, a router after ROUTER_CELLS and a whole picture after PICTURE_CELLS (`budget`, shared), and
// the needle jumps instead. Counted in cells, not time, so the browser and Node sew the same file.
// In a picture's fill, a cell travelled through this often takes no more travel: a narrow neck that was a big fill's
// only way between its parts was crossed 70 times (72 hits/mm² on etsy_8 at 4 colours, turned; trims 509 -> 384)
export const WORN = 20;
const ROUTE_CELLS = 50000, ROUTER_CELLS = 6e6, PICTURE_CELLS = 12e6;
export const routeBudget = () => ({ cells: PICTURE_CELLS });
export function makeRouter(mask, res, cell, hop = null, budget = routeBudget(), worn = Infinity) {
  let mine = ROUTER_CELLS;
  const C = Math.max(1, Math.round(res * 0.5));   // 0.5 mm cells
  const gw = Math.ceil(mask.w / C), gh = Math.ceil(mask.h / C), n = gw * gh, inside = new Uint8Array(n);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++)
    inside[gy * gw + gx] = cell(Math.min(mask.w - 1, gx * C + (C >> 1)), Math.min(mask.h - 1, gy * C + (C >> 1)));
  const sewn = new Uint8Array(n), trod = new Uint8Array(n);
  const cellOf = ([x, y]) => Math.min(gh - 1, Math.max(0, Math.floor(y / C))) * gw + Math.min(gw - 1, Math.max(0, Math.floor(x / C)));
  const centre = (c) => [(c % gw) * C + C / 2, Math.floor(c / gw) * C + C / 2];
  // f returning false stops the walk (and along returns false)
  const along = (a, b, f) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (C / 2)));
    for (let k = 0; k <= steps; k++) if (f(cellOf([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps])) === false) return false;
    return true;
  };
  // row ends sit on (or a pull-compensation past) the edge: start from the nearest cell inside
  const snap = (p) => {
    const c = cellOf(p);
    if (inside[c] && (!hop || hop(p, centre(c)))) return c;
    const cx = c % gw, cy = (c - cx) / gw;
    let best = -1, bd = Infinity;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx, y = cy + dy, m = y * gw + x;
      if (x >= 0 && y >= 0 && x < gw && y < gh && inside[m] && dx * dx + dy * dy < bd && (!hop || hop(p, centre(m)))) { bd = dx * dx + dy * dy; best = m; }
    }
    return best;
  };
  // 8-connected regions of inside cells: no way between two of them, so route() says so without flooding one
  // (half of all calls on a busy picture, and most of the time)
  const region = new Int32Array(n);
  for (let c0 = 0, r = 0; c0 < n; c0++) {
    if (!inside[c0] || region[c0]) continue;
    const st = [c0]; region[c0] = ++r;
    while (st.length) {
      const c = st.pop(), cx = c % gw, cy = (c - cx) / gw;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy, m = y * gw + x;
        if (x >= 0 && y >= 0 && x < gw && y < gh && inside[m] && !region[m]) { region[m] = r; st.push(m); }
      }
    }
  }
  // A* state reused between calls (a cell's g/from count only if stamped this call); the open list is a binary heap
  // in typed arrays (a linear scan was most of a busy picture's time)
  const G = new Float64Array(n), FROM = new Int32Array(n), SW = new Float32Array(n), LN = new Float32Array(n), STAMP = new Uint32Array(n), DONE = new Uint32Array(n), HK = new Float64Array(20010), HC = new Int32Array(20010);
  let hn = 0;
  const push = (k, c) => {
    let i = hn++;
    while (i) { const up = (i - 1) >> 1; if (HK[up] <= k) break; HK[i] = HK[up]; HC[i] = HC[up]; i = up; }
    HK[i] = k; HC[i] = c;
  };
  const pop = () => {
    const top = HC[0], k = HK[--hn], c = HC[hn];
    let i = 0;
    for (;;) {
      let m = 2 * i + 1; if (m >= hn) break;
      if (m + 1 < hn && HK[m + 1] < HK[m]) m++;
      if (HK[m] >= k) break;
      HK[i] = HK[m]; HC[i] = HC[m]; i = m;
    }
    HK[i] = k; HC[i] = c;
    return top;
  };
  let gen = 0;
  // Search from cell s: A* toward cell t, or (t < 0) a flood that stops once a cell in `stop` is reached. Ways with
  // more than maxSewn mm on finished stitches or longer than maxMm aren't followed (a search that can't succeed stops
  // early instead of flooding the whole shape). Leaves g/from stamped with `gen` for pathTo.
  const mmPer = C / res;
  function search(s, t, maxSewn, maxMm, stop = null) {
    let popped = 0;
    gen++;
    const g = (c) => (STAMP[c] === gen ? G[c] : Infinity);
    const hx = t < 0 ? () => 0 : (c) => Math.hypot((c % gw) - (t % gw), Math.floor(c / gw) - Math.floor(t / gw));
    STAMP[s] = gen; G[s] = 0; FROM[s] = -1; SW[s] = 0; LN[s] = 0; hn = 0; push(0, s);
    while (hn) {
      const c = pop();
      if (c === t || (stop && stop.has(c))) break;
      if (DONE[c] === gen) continue;   // (a stale entry: the cell was expanded at its best already)
      DONE[c] = gen;
      if (++popped > ROUTE_CELLS || hn > 20000) break;
      const cx = c % gw, cy = (c - cx) / gw;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
        const m = y * gw + x; if (!inside[m] || trod[m] >= worn) continue;
        const step = Math.hypot(dx, dy), v = g(c) + step * ((sewn[m] ? 6 : 1) + 2 * trod[m]);
        if (v >= g(m)) continue;
        const sw = SW[c] + (sewn[m] ? step * mmPer : 0), ln = LN[c] + step * mmPer;
        if (sw > maxSewn || ln + hx(m) * mmPer > maxMm) continue;
        STAMP[m] = gen; G[m] = v; FROM[m] = c; SW[m] = sw; LN[m] = ln; push(v + hx(m), m);
      }
    }
    mine -= popped; budget.cells -= popped;
  }
  // the way the last search found from a (cell s) to b (cell t) as { pts, sewnMm (how much of it lies on finished
  // stitches), mm (its length) }, or null
  function pathTo(s, t, a, b) {
    const from = (c) => (STAMP[c] === gen ? FROM[c] : -1);
    if (from(t) < 0 && s !== t) return null;
    const cells = [t]; while (cells[cells.length - 1] !== s) cells.push(from(cells[cells.length - 1]));
    cells.reverse();
    let sewnMm = 0;
    for (let i = 1; i < cells.length; i++) if (sewn[cells[i]]) sewnMm += Math.hypot((cells[i] % gw) - (cells[i - 1] % gw), Math.floor(cells[i] / gw) - Math.floor(cells[i - 1] / gw)) * C / res;
    // pull the staircase straight where a straight line stays inside (and off finished rows if the route was)
    const ok = (p, q) => along(p, q, (c) => !!inside[c] && !(sewn[c] && !sewnMm));
    const pts = [a], cs = cells.map(centre); let i = 0;
    while (i < cs.length - 1) { let j = cs.length - 1; while (j > i + 1 && !ok(pts[pts.length - 1], cs[j])) j--; pts.push(cs[j]); i = j; }
    pts.push(b);
    let mm = 0;
    for (let k = 1; k < pts.length; k++) mm += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]) / res;
    return { pts, sewnMm, mm };
  }
  const spent = () => mine <= 0 || budget.cells <= 0;
  // the way from a to b (px), or null
  function route(a, b, maxSewn = Infinity, maxMm = Infinity) {
    const s = snap(a), t = snap(b);
    if (s < 0 || t < 0 || region[s] !== region[t] || spent()) return null;
    search(s, t, maxSewn, maxMm);
    return pathTo(s, t, a, b);
  }
  // One search from a toward many places: way(b) is the way to b, or null. It stops early once it reaches one of
  // `first` (the places preferred most). One flood per move instead of one search per place tried: a fill of many
  // sections tried each in turn, and each search that failed flooded the shape.
  function reach(a, maxSewn, first = []) {
    const s = snap(a);
    if (s < 0 || spent()) return () => null;
    search(s, -1, maxSewn, Infinity, new Set(first.map(snap).filter((c) => c >= 0)));
    const at = gen;
    return (b) => {
      const t = snap(b);
      return at !== gen || t < 0 || region[s] !== region[t] ? null : pathTo(s, t, a, b);
    };
  }
  // the route as travel stitches up to 2.5 mm, none under 0.6 mm (ending exactly on b, which isn't included)
  function stitches(r) {
    const travel = [];
    let at = r.pts[0];
    for (let k = 1; k < r.pts.length; k++) {
      const [ax, ay] = r.pts[k - 1], [bx, by] = r.pts[k], m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (2.5 * res)));
      for (let q = 1; q <= m; q++) {
        const t = [ax + ((bx - ax) * q) / m, ay + ((by - ay) * q) / m];
        if (Math.hypot(t[0] - at[0], t[1] - at[1]) >= 0.6 * res) { travel.push(t); at = t; }
      }
    }
    const b = r.pts[r.pts.length - 1];
    while (travel.length && Math.hypot(travel[travel.length - 1][0] - b[0], travel[travel.length - 1][1] - b[1]) < 0.6 * res) travel.pop();
    for (let k = 1; k < r.pts.length; k++) along(r.pts[k - 1], r.pts[k], (c) => (trod[c] = Math.min(255, trod[c] + 1)));
    return travel;
  }
  const markSewn = (p) => { for (let i = 1; i < p.length; i++) along(p[i - 1], p[i], (c) => { if (inside[c] !== 2) sewn[c] = 1; }); };
  // which connected stretch of crossable cells a point starts in (0: none), so a route between two can't exist
  const regionOf = (p) => { const c = snap(p); return c < 0 ? 0 : region[c]; };
  return { route, reach, stitches, markSewn, regionOf };
}

// Sew a fill's sections in one go: between sections the needle travels inside the shape, through rows not sewn
// yet, so the fill covers the travel. It only jumps (and trims) when every way would lie on top of finished rows for
// more than SEWN mm. groups: [underlay paths, fill paths] in px; the underlay is covered by the fill, so travel over it is
// hidden too.
// edge (mm, pictures): travel may also run along the shape's own edge, this far inside it, over rows already sewn
// (Ink/Stitch's fill travels along the border when it can't travel inside): there it lies beside the row ends in
// the same thread. A section stranded behind finished rows was a trim, two locks and a restart inside one shape:
// 282 of the 1,402 trims in the 12 sample pictures. Not over `edgeMax` mm in one go.
export function routeFill(groups, comp, mask, res, budget = routeBudget(), worn = Infinity, edge = 0, edgeMax = 30) {
  const { w } = mask, R = makeRouter(mask, res, (x, y) => (comp.labels[y * w + x] !== comp.id ? 0 : edge && comp.dt[y * w + x] <= edge * res ? 2 : 1), null, budget, worn);
  const out = [];
  let cur = null;
  groups.forEach((paths, gi) => {
    // sections in the fill's own row order (top to bottom of the sweep): each next one begins beside rows still to
    // sew, so the way there stays hidden. Picking the nearest instead strands earlier sections behind finished rows.
    // If the next one can only be reached over finished rows, take the first later one with a hidden way there.
    const left = paths.filter((p) => p.length);
    while (left.length) {
      // (a section can also be sewn from its last row back, entering from its far side)
      let k = 0, r = null, rev = false;
      if (cur) {
        const way = R.reach(cur, SEWN, [left[0][0], left[0][left[0].length - 1]]);
        search: for (let i = 0; i < left.length; i++) for (const back of [false, true]) {
          const q = back ? left[i][left[i].length - 1] : left[i][0];
          if (Math.hypot(q[0] - cur[0], q[1] - cur[1]) <= res) { k = i; r = null; rev = back; break search; }
          const ri = way(q);
          if (ri && ri.sewnMm <= SEWN && (!edge || ri.mm <= edgeMax)) { k = i; r = ri; rev = back; break search; }
        }
      }
      let p = left.splice(k, 1)[0]; if (rev) p = p.slice().reverse();
      const d = cur ? Math.hypot(p[0][0] - cur[0], p[0][1] - cur[1]) : Infinity;
      // within 1 mm: sew straight on (skipping a first point that would make a stitch under 0.4 mm)
      if (cur && d <= res) out[out.length - 1].push(...(d < 0.4 * res ? p.slice(1) : p));
      else if (r && r.sewnMm <= SEWN) out[out.length - 1].push(...R.stitches(r), ...p);
      else out.push(p.slice());
      if (gi === groups.length - 1) R.markSewn(p);
      cur = p[p.length - 1];
    }
  });
  return out;
}

// A filled shape (mm polygon, y down) as tatami stitches: underlay across, then the fill, like a picture's colour.
// Used by the Design tab's patches.
// poly: one closed outline, or several (holes too, even-odd); `inset` mm keeps the rows off the edge (a satin covers it)
// opts.pattern: a FILL_PATTERNS key; opts.share: this layer's part of the density across the shape (see tatami);
// opts.underlay: false for a second layer
// A shape drawn and measured for filling: its mask (inset), its separate parts and each pixel's distance to the edge.
// None of it depends on how the shape is filled, so it's kept by the outlines, the inset and the scale: a change of
// row spacing (30 wt thread, knit) drew and measured every filled shape again, two distance transforms and a labelling
// each, ~260 ms of a busy design's thread change. Read only (the rows and their travel never write to it).
const drawn = new Map();
function shaped(loops, inset, res) {
  const key = JSON.stringify([loops, inset, res]);
  if (drawn.has(key)) { const v = drawn.get(key); drawn.delete(key); drawn.set(key, v); return v; }
  const pts = loops.flat(), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs) - 1, y0 = Math.min(...ys) - 1;
  const w = Math.ceil((Math.max(...xs) - x0 + 1) * res), h = Math.ceil((Math.max(...ys) - y0 + 1) * res);
  const mask = { w, h, data: new Uint8Array(w * h) };
  // even-odd scanline fill at pixel centres
  for (let y = 0; y < h; y++) {
    const Y = y0 + (y + 0.5) / res, cut = [];
    for (const l of loops) for (let i = 0; i < l.length; i++) {
      const [ax, ay] = l[i], [bx, by] = l[(i + 1) % l.length];
      if ((ay <= Y) !== (by <= Y)) cut.push(ax + ((Y - ay) * (bx - ax)) / (by - ay));
    }
    cut.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cut.length; k += 2)
      for (let x = Math.max(0, Math.ceil((cut[k] - x0) * res - 0.5)); x < Math.min(w, Math.floor((cut[k + 1] - x0) * res - 0.5) + 1); x++) mask.data[y * w + x] = 1;
  }
  if (inset) { const e = distanceTransform(mask); for (let i = 0; i < w * h; i++) if (e[i] <= inset * res) mask.data[i] = 0; }
  const { labels, count } = label(mask), dt = distanceTransform(mask), parts = Array.from({ length: count + 1 }, () => []);
  for (let i = 0; i < w * h; i++) if (labels[i]) parts[labels[i]].push(i);
  const v = { x0, y0, mask, labels, count, dt, parts };
  drawn.set(key, v); if (drawn.size > 6) drawn.delete(drawn.keys().next().value);
  return v;
}
export function fillPolygon(poly, { angle = FILL.angle, density = ROWS.solid, res = FILL.res, inset = 0, pattern = "tatami", share = null, underlay = true } = {}) {
  const loops = Array.isArray(poly[0][0]) ? poly : [poly];
  const { x0, y0, mask, labels, count, dt, parts } = shaped(loops, inset, res), paths = [];
  const toMm = (p) => p.map(([x, y]) => [x0 + (x + 0.5) / res, y0 + (y + 0.5) / res]);
  for (let id = 1; id <= count; id++) {
    const comp = { id, labels, dt, pixels: parts[id] };
    if (comp.pixels.length < 1.5 * res * res) continue;
    const under = underlay ? tatami(mask, comp, res, { angle: angle + 90, spacing: 2.5, stitch: 3, inset: 0.4, pull: 0 }) : [];
    const fill = tatami(mask, comp, res, { angle, spacing: density, stitch: 3.5, pull: 0.15, pattern, share });
    paths.push(...routeFill([under, fill], comp, mask, res).map(toMm));
  }
  return paths;
}
