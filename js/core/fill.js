/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The fill engine: tatami rows inside a shape (patterns, blends), travel routed under stitches still to come, and
// `fillPolygon` for a shape given as outlines. Pictures (digitize.js), patches and motifs (studio/pieces.js) and the
// Open tab's re-stitching (doctor.js) all fill through here. (Part of digitize.js until 2026-11.)
import { distanceTransform, label } from "./raster.js";
import { resample } from "./geom.js";
import { FILLS, ROWS } from "./recipes.js";

// the fill angle (degrees) and working pixels per mm when nothing else is asked (8: 5 lost the narrow notches of
// small lettering, e.g. an M)
export const FILL = { angle: 45, res: 8 };

// Travel may lie on this colour's finished stitches for this far (mm) in all: a few stitches of the same thread on its
// own fill against a trim, two locks and often a loose thread to snip (2 mm until 2026-10-30: 3 mm took 5-15% of the
// trims and a third of the loose threads off the batch pictures)
export const SEWN = 3;
const SCRAP = 3;

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
  return sewRows(rows, U, V, res, L, pattern, leaves);
}
// Rows into paths: each run of rows that can be sewn back and forth without leaving the shape, split where the step
// to the next row would cross open fabric (`leaves`).
function sewRows(rows, U, V, res, L, pattern, leaves) {
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
// hidden too. inOrder: the next section is always entered at its first row (a drawn shape's fill, `fillPolygon`).
// spare: sections of the first so many groups are left out when only a jump would reach them (a bit of edge run
// isn't worth a trim). With inOrder, a fill section under SCRAP mm of thread (a row or two in a corner, which rows
// read off a drawing never saw; every such fill's edge lies under a satin) is sewn only where the needle already is:
// going to one stranded the next real section behind finished rows (the snowflake motif at 20 mm, 3 parts -> 4).
// edge (mm, pictures): travel may also run along the shape's own edge, this far inside it, over rows already sewn
// (Ink/Stitch's fill travels along the border when it can't travel inside): there it lies beside the row ends in
// the same thread. A section stranded behind finished rows was a trim, two locks and a restart inside one shape:
// 282 of the 1,402 trims in the 12 sample pictures. Not over `edgeMax` mm in one go.
export function routeFill(groups, comp, mask, res, budget = routeBudget(), worn = Infinity, inOrder = false, spare = 0, cell = null, edge = 0, edgeMax = 30) {
  const { w } = mask, R = makeRouter(mask, res, cell || ((x, y) => (comp.labels[y * w + x] !== comp.id ? 0 : edge && comp.dt[y * w + x] <= edge * res ? 2 : 1)), null, budget, worn);
  const out = [];
  // (under SCRAP mm of thread in all: a row or two in a corner)
  const short = (p) => { let t = 0; for (let i = 1; i < p.length && t < SCRAP * res; i++) t += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return t < SCRAP * res; };
  let cur = null;
  groups.forEach((paths, gi) => {
    // sections in the fill's own row order (top to bottom of the sweep): each next one begins beside rows still to
    // sew, so the way there stays hidden. Picking the nearest instead strands earlier sections behind finished rows.
    // If the next one can only be reached over finished rows, take the first later one with a hidden way there.
    const left = paths.filter((p) => p.length);
    while (left.length) {
      // (a section can also be sewn from its last row back, entering from its far side)
      let k = 0, r = null, rev = false;
      const q0 = left[0][0], straight = inOrder && cur && Math.hypot(q0[0] - cur[0], q0[1] - cur[1]) > res ? R.route(cur, q0, SEWN) : null;
      if (straight && straight.sewnMm <= SEWN) r = straight;   // (one search toward it; the flood below only when that fails)
      else if (cur) {
        const way = R.reach(cur, SEWN, inOrder ? [left[0][0]] : [left[0][0], left[0][left[0].length - 1]]);
        search: for (let i = 0; i < left.length; i++) for (const back of [false, true]) {
          const q = back ? left[i][left[i].length - 1] : left[i][0];
          if (Math.hypot(q[0] - cur[0], q[1] - cur[1]) <= res) { k = i; r = null; rev = back; break search; }
          const ri = way(q);
          if (ri && ri.sewnMm <= SEWN && (!edge || ri.mm <= edgeMax)) { k = i; r = ri; rev = back; break search; }
        }
      }
      let p = left.splice(k, 1)[0]; if (rev) p = p.slice().reverse();
      const d = cur ? Math.hypot(p[0][0] - cur[0], p[0][1] - cur[1]) : Infinity;
      if (cur && d > res && ((!r && gi < spare) || (inOrder && gi === groups.length - 1 && short(p)))) continue;
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
// Under the fill: an edge run 0.4 mm inside the outline in 2.5 mm stitches, then rows across the fill's own every
// 2.5 mm in 3 mm stitches, kept 0.4 mm inside too (the fill's row ends cover both)
const UNDER = { inset: 0.4, run: 2.5, rows: 2.5, stitch: 3 };
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
  const whole = inset ? mask.data.slice() : mask.data;   // (the shape before the inset comes off)
  if (inset) { const e = distanceTransform(mask); for (let i = 0; i < w * h; i++) if (e[i] <= inset * res) mask.data[i] = 0; }
  const { labels, count } = label(mask), parts = Array.from({ length: count + 1 }, () => []);
  for (let i = 0; i < w * h; i++) if (labels[i]) parts[labels[i]].push(i);
  // (each pixel's distance to the edge: only rows read off the drawing ask for it)
  let dt = null;
  const v = { x0, y0, mask, whole, labels, count, parts, get dt() { return (dt ||= distanceTransform(mask)); } };
  drawn.set(key, v); if (drawn.size > 6) drawn.delete(drawn.keys().next().value);
  return v;
}
// A row's stretches inside drawn outlines, worked out from the outlines themselves: where the row's line crosses
// their edges (even-odd), less every stretch within `d` of an edge (the line through each edge's capsule: one
// stretch, since a capsule is convex). Exact, where a row read off the 8 px/mm drawing ended up to 0.19 mm off the
// edge (a pixel's 0.125 mm and the half-pixel sampling step): a motif's 1.4 mm satin edge covers its fill's row ends
// by 0.25 mm. Edges are met in order of v (rows are asked for from the lowest up), so a row looks only at the edges
// near it. loops in px, U and V the row's directions.
function outlineRows(loops, U, V, d) {
  const E = [];
  let v0 = Infinity, v1 = -Infinity;
  for (const l of loops) for (let i = 0; i < l.length; i++) {
    const p = l[i], q = l[(i + 1) % l.length];
    const au = p[0] * U[0] + p[1] * U[1], av = p[0] * V[0] + p[1] * V[1], bu = q[0] * U[0] + q[1] * U[1], bv = q[0] * V[0] + q[1] * V[1];
    if (av < v0) v0 = av; if (av > v1) v1 = av;
    if (au !== bu || av !== bv) E.push([au, av, bu, bv, Math.min(av, bv) - d, Math.max(av, bv) + d]);
  }
  E.sort((a, b) => a[4] - b[4]);
  let next = 0, live = [];
  const at = (v) => {
    while (next < E.length && E[next][4] <= v) live.push(E[next++]);
    live = live.filter((e) => e[5] >= v);
    const cut = [], off = [];
    for (const [au, av, bu, bv] of live) {
      if ((av <= v) !== (bv <= v)) cut.push(au + ((v - av) * (bu - au)) / (bv - av));
      if (!d) continue;
      let lo = Infinity, hi = -Infinity;
      for (const [cu, cv] of [[au, av], [bu, bv]]) {
        const k = v - cv;
        if (Math.abs(k) < d) { const r = Math.sqrt(d * d - k * k); if (cu - r < lo) lo = cu - r; if (cu + r > hi) hi = cu + r; }
      }
      // (the edge's own band: along it t in 0..1, across it within d)
      const dx = bu - au, dy = bv - av, L = Math.hypot(dx, dy), k = v - av;
      let a = -Infinity, b = Infinity;
      if (Math.abs(dx) > 1e-9) { const m = (-k * dy) / dx, n = (L * L - k * dy) / dx; a = Math.max(a, Math.min(m, n)); b = Math.min(b, Math.max(m, n)); }
      else if (k * dy < 0 || k * dy > L * L) a = Infinity;
      if (Math.abs(dy) > 1e-9) { const m = (k * dx - d * L) / dy, n = (k * dx + d * L) / dy; a = Math.max(a, Math.min(m, n)); b = Math.min(b, Math.max(m, n)); }
      else if (Math.abs(k) > d) a = Infinity;
      if (a < b) { if (au + a < lo) lo = au + a; if (au + b > hi) hi = au + b; }
      if (lo < hi) off.push([lo, hi]);
    }
    cut.sort((a, b) => a - b); off.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (let i = 0; i + 1 < cut.length; i += 2) {
      let a = cut[i];
      const b = cut[i + 1];
      for (const [lo, hi] of off) { if (hi <= a) continue; if (lo >= b) break; if (lo > a) out.push([a, lo]); a = hi; if (a >= b) break; }
      if (a < b) out.push([a, b]);
    }
    return out;
  };
  return { v0: v0 + d, v1: v1 - d, at };
}
// The rows of a drawn shape at an angle (see `tatami` for spacing, pull and share): each stretch pulled out by `pull`
// at both ends (two that meet are one) and marked with the part of the shape it lies in (`shape.labels`).
function exactRows(loops, shape, res, { angle, spacing, inset = 0, pull, share = null }) {
  const th = (angle * Math.PI) / 180, U = [Math.cos(th), Math.sin(th)], V = [-Math.sin(th), Math.cos(th)];
  const { v0, v1, at } = outlineRows(loops, U, V, inset * res), { w, h } = shape.mask, sp = spacing * res, P = pull * res, rows = [];
  const part = (u, v) => { const X = Math.round(u * U[0] + v * V[0]), Y = Math.round(u * U[1] + v * V[1]); return X >= 0 && Y >= 0 && X < w && Y < h ? shape.labels[Y * w + X] : 0; };
  for (let v = v0 + sp / 2, r = 0; v <= v1; r++) {
    const k = share ? share((v - v0) / Math.max(v1 - v0, 1e-9)) : 1;
    if (k < 0.15) { v += sp; continue; }
    const ivs = [];
    for (const [a, b] of at(v)) {
      let id = 0;
      for (const f of [0.5, 0.25, 0.75, 0.1, 0.9]) if ((id = part(a + (b - a) * f, v))) break;
      const last = ivs[ivs.length - 1];
      if (last && a - P <= last[1]) last[1] = b + P; else ivs.push(Object.assign([a - P, b + P], { part: id }));
    }
    rows.push({ v, r, ivs: ivs.filter((iv) => iv.part && iv[1] - iv[0] >= 0.6 * res) });
    v += sp / k;
  }
  return { rows, U, V };
}
// An edge run: one line of stitches `d` px inside each outline of a part, sewn before anything else. It holds the
// fabric to the stabilizer along the edge, where the rows pull hardest (the usual underlay of a tatami fill: edge
// run, then a lattice across). Each outline point is moved `d` along its normal to the side that is inside; points
// that land nearer the edge than 0.7 d (inside a sharp corner, a neck narrower than 2 d: looked for at eight places
// round the point) are left out and the run broken there.
function edgeRuns(loops, comp, mask, res, d, stitch) {
  const { w, h } = mask, out = [];
  const at = (x, y) => { const X = Math.round(x), Y = Math.round(y); return X >= 0 && Y >= 0 && X < w && Y < h && comp.labels[Y * w + X] === comp.id; };
  const k = 0.7 * d, ok = ([x, y]) => at(x, y) && at(x + k, y) && at(x - k, y) && at(x, y + k) && at(x, y - k) && at(x + 0.7 * k, y + 0.7 * k) && at(x - 0.7 * k, y + 0.7 * k) && at(x + 0.7 * k, y - 0.7 * k) && at(x - 0.7 * k, y - 0.7 * k);
  for (const l of loops) {
    const q = resample(l, 0.5 * res, true), n = q.length, pieces = [[]];
    if (n < 6) continue;
    for (let i = 0; i < n; i++) {
      const a = q[(i + n - 1) % n], b = q[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
      const c = [[q[i][0] + nx * d, q[i][1] + ny * d], [q[i][0] - nx * d, q[i][1] - ny * d]].find(ok), cur = pieces[pieces.length - 1], last = cur[cur.length - 1];
      if (!c || (last && Math.hypot(c[0] - last[0], c[1] - last[1]) > 1.5 * res)) { if (cur.length) pieces.push([]); if (!c) continue; }
      pieces[pieces.length - 1].push(c);
    }
    // (a run that goes all the way round closes on itself; one broken only at the outline's start is joined up)
    if (pieces.length === 1 && pieces[0].length === n) pieces[0].push(pieces[0][0]);
    else if (pieces.length > 1 && pieces[0].length && pieces[pieces.length - 1].length && Math.hypot(pieces[0][0][0] - pieces[pieces.length - 1].at(-1)[0], pieces[0][0][1] - pieces[pieces.length - 1].at(-1)[1]) <= 1.5 * res) pieces[0] = [...pieces.pop(), ...pieces[0]];
    for (const p of pieces) {
      let len = 0;
      for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (len >= 4 * res) out.push(resample(p, stitch * res));
    }
  }
  return out;
}
// opts.pull: how far each row runs past the outline at both ends (mm; the fabric's, core/recipes.js FILLS)
// opts.cover: mm inside the first outline that a border sewn later covers (a patch's satin edge reaches 1.2 mm over
// its fill): travel there is hidden whatever is sewn already, so a section stranded behind finished rows is reached
// round the edge and not by a trim (a carved heart patch: a 27 mm trim between two parts of one region)
// opts.raster: rows read off the 8 px/mm drawing, as every fill was until 2026-11 (the Open tab's re-stitching: its
// outlines are traced from a drawing of the file's stitches already, stair-stepped)
export function fillPolygon(poly, { angle = FILL.angle, density = ROWS.solid, res = FILL.res, inset = 0, pattern = "tatami", share = null, underlay = true, pull = FILLS.cotton.pull, raster = false, cover = 0 } = {}) {
  const loops = Array.isArray(poly[0][0]) ? poly : [poly];
  const shape = shaped(loops, inset, res), { x0, y0, mask, labels, count, parts } = shape, paths = [];
  const toMm = (p) => p.map(([x, y]) => [x0 + (x + 0.5) / res, y0 + (y + 0.5) / res]);
  if (raster) {
    for (let id = 1; id <= count; id++) {
      const comp = { id, labels, dt: shape.dt, pixels: parts[id] };
      if (comp.pixels.length < 1.5 * res * res) continue;
      const under = underlay ? tatami(mask, comp, res, { angle: angle + 90, spacing: 2.5, stitch: 3, inset: 0.4, pull: 0 }) : [];
      const fill = tatami(mask, comp, res, { angle, spacing: density, stitch: 3.5, pull: 0.15, pattern, share });
      paths.push(...routeFill([under, fill], comp, mask, res).map(toMm));
    }
    return paths;
  }
  const px = loops.map((l) => l.map(([x, y]) => [(x - x0) * res - 0.5, (y - y0) * res - 0.5]));
  // a step between rows may leave the shape by the pull and a little, no more: a point further out than that (the
  // drawing has nothing within that distance of it, looked for at eight places round it) splits the path, as in `tatami`
  const on = (x, y) => { const X = Math.round(x), Y = Math.round(y); return X >= 0 && Y >= 0 && X < mask.w && Y < mask.h && mask.data[Y * mask.w + X] === 1; };
  const far = (pull + 0.15) * res, RING = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7]];
  const leaves = (p, q) => {
    const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / (0.2 * res));
    for (let i = 1; i < n; i++) {
      const x = p[0] + ((q[0] - p[0]) * i) / n, y = p[1] + ((q[1] - p[1]) * i) / n;
      if (!on(x, y) && !RING.some(([dx, dy]) => on(x + dx * far, y + dy * far) || on(x + dx * far * 0.5, y + dy * far * 0.5))) return true;
    }
    return false;
  };
  const across = underlay ? exactRows(px, shape, res, { angle: angle + 90, spacing: UNDER.rows, inset: inset + UNDER.inset, pull: 0 }) : null;
  const along = exactRows(px, shape, res, { angle, spacing: density, inset, pull, share });
  const of = (R, id, stitch, pat) => sewRows(R.rows.map((row) => ({ ...row, ivs: row.ivs.filter((iv) => iv.part === id) })), R.U, R.V, res, stitch * res, pat, leaves);
  // the covered band: every pixel within `cover` of the first outline
  let band = null;
  if (cover > 0) {
    band = new Uint8Array(mask.w * mask.h);
    const r = Math.ceil(cover * res), r2 = (cover * res) ** 2, l = px[0];
    for (let i = 0; i < l.length; i++) {
      const [ax, ay] = l[i], [bx, by] = l[(i + 1) % l.length], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (0.5 * r)));
      for (let k = 0; k < n; k++) {
        const cx = ax + ((bx - ax) * k) / n, cy = ay + ((by - ay) * k) / n, X0 = Math.round(cx), Y0 = Math.round(cy);
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const X = X0 + dx, Y = Y0 + dy;
          if (X >= 0 && Y >= 0 && X < mask.w && Y < mask.h && (X - cx) ** 2 + (Y - cy) ** 2 <= r2) band[Y * mask.w + X] = 1;
        }
      }
    }
  }
  for (let id = 1; id <= count; id++) {
    const comp = { id, labels, pixels: parts[id] };
    if (comp.pixels.length < 1.5 * res * res) continue;
    const edge = underlay ? edgeRuns(px, comp, mask, res, UNDER.inset * res, UNDER.run) : [];
    // (sections taken strictly in row order, each from its first row: going to whichever end of the first was nearer
    // sewed it backwards and stranded the rest behind it, 275 parts against 184 over 164 test shapes; each part is a
    // trim. Where that still leaves parts, the sweep from the far side is tried too and the fewer kept: 30 motifs at
    // 20 mm, 56 parts -> 49)
    // (travel may use the inset band too: the satin the inset is there for covers it. A 20 mm snowflake's arms are
    // 1 mm wide once inset, too thin for the router's 0.5 mm cells to join up)
    const cell = inset ? (x, y) => (labels[y * mask.w + x] === id ? (band && band[y * mask.w + x] ? 2 : 1) : shape.whole[y * mask.w + x] ? 2 : 0)
      : band ? (x, y) => (labels[y * mask.w + x] === id ? (band[y * mask.w + x] ? 2 : 1) : 0) : null;
    const groups = [edge, across ? of(across, id, UNDER.stitch, "tatami") : [], of(along, id, 3.5, pattern)];
    let best = routeFill(groups, comp, mask, res, undefined, undefined, true, 1, cell);
    if (best.length > 1) {
      const other = routeFill([edge, groups[1], groups[2].map((p) => p.slice().reverse()).reverse()], comp, mask, res, undefined, undefined, true, 1, cell);
      if (other.length < best.length) best = other;
    }
    paths.push(...best.map(toMm));
  }
  return paths;
}
