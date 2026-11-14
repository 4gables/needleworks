/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The fill engine: tatami rows inside a shape (patterns, blends), travel routed under stitches still to come, and
// `fillPolygon` for a shape given as outlines. Pictures (digitize.js), patches and motifs (studio/pieces.js) and the
// Open tab's re-stitching (doctor.js) all fill through here. (Part of digitize.js until 2026-11.)
import { distanceTransform, label } from "./raster.js";
import { arclen, resample, smooth } from "./geom.js";
import { CONTOUR, FILLS, FORM, PICTURES, ROWS, TATAMI } from "./recipes.js";

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
  // (not rows at all: rings that follow the shape's outline inward, `ringFill`. Rows read off a drawing sew it plain.)
  contour: { name: "Rings", off: (r) => (r % 4) / 4, rings: true },
};
// share(f): this layer's part of the full density at f, how far across the shape (0-1) the row lies: rows are
// spaced spacing / share, none where the share is under 0.15 (a colour blend: two layers whose spacings change
// gradually, so neither skips rows and leaves long links)
// comp.form (a picture's automatic direction): the angle the caller asks for when the part has no direction of its
// own; its rows then lie at the part's own angle (`formPick`), turned by however far `angle` is from comp.form (the
// underlay's 90 degrees), or, asked for at comp.form itself, curve with it where that suits the part better
export function tatami(mask, comp, res, { angle, spacing, stitch, inset = 0, pull = 0.15, pattern = "tatami", share = null }) {
  let field = null;
  if (comp.form != null) { const f = formOf(comp, mask, res, comp.form); if (angle === comp.form && !share) field = f.field; angle = f.angle + (angle - comp.form); }
  const { w, h } = mask, th = (angle * Math.PI) / 180;
  const U = [Math.cos(th), Math.sin(th)], V = [-Math.sin(th), Math.cos(th)];
  const inside = (x, y) => {
    const X = Math.round(x), Y = Math.round(y);
    return X >= 0 && Y >= 0 && X < w && Y < h && comp.labels[Y * w + X] === comp.id && (!inset || comp.dt[Y * w + X] > inset * res);
  };
  if (field) { const c = curvedRows(comp, mask, res, comp.dt, { spacing, stitch, pull, pattern, inside, fd: field }); if (c) return c.paths; }
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
export function sewRows(rows, U, V, res, L, pattern, leaves) {
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
      for (let i = line.length - 1; i > 0; i--) if (line[i] - line[i - 1] > TATAMI.loose * res) line.splice(i, 0, (line[i] + line[i - 1]) / 2);
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
// grid (px, across the rows): rows on the lines grid + (k + 0.5) x spacing, k numbering them (the shared row grid of
// a piece with its own settings, `fillPolygon`), instead of half a row in from the shape's own edge
function exactRows(loops, shape, res, { angle, spacing, inset = 0, pull, share = null, grid = null }) {
  const th = (angle * Math.PI) / 180, U = [Math.cos(th), Math.sin(th)], V = [-Math.sin(th), Math.cos(th)];
  const { v0, v1, at } = outlineRows(loops, U, V, inset * res), { w, h } = shape.mask, sp = spacing * res, P = pull * res, rows = [];
  const part = (u, v) => { const X = Math.round(u * U[0] + v * V[0]), Y = Math.round(u * U[1] + v * V[1]); return X >= 0 && Y >= 0 && X < w && Y < h ? shape.labels[Y * w + X] : 0; };
  // (the row number a pattern staggers by follows the grid too, kept 0..47: a multiple of every pattern's period)
  const k0 = grid == null ? 0 : Math.ceil((v0 - grid) / sp - 0.5);
  for (let v = grid == null ? v0 + sp / 2 : grid + (k0 + 0.5) * sp, r = grid == null ? 0 : ((k0 % 48) + 48) % 48; v <= v1; r++) {
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
// The levels of a shape's distance from its edge, as closed lines: `first` px in from the edge, then every `step` px.
// One pass over the drawing's squares of four pixel centres (marching squares): a square whose corners lie either
// side of a level holds a piece of that level's line, its ends where the distance (taken as even along a side) passes
// the level; the pieces are joined end to end into rings. Returns rings[level] = [closed line (px), ...].
function levelRings(dt, w, h, first, step) {
  const segs = [];   // per level, six numbers a piece: edge id, x, y of one end, then of the other
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = y * w + x, a = dt[i], b = dt[i + 1], c = dt[i + w + 1], d = dt[i + w];
    const hi = a > b ? (a > c ? (a > d ? a : d) : c > d ? c : d) : b > c ? (b > d ? b : d) : c > d ? c : d; if (hi < first) continue;
    const lo = a < b ? (a < c ? (a < d ? a : d) : c < d ? c : d) : b < c ? (b < d ? b : d) : c < d ? c : d;
    for (let k = Math.max(0, Math.ceil((lo - first) / step + 1e-9)); first + k * step <= hi; k++) {
      const L = first + k * step, bits = (a >= L ? 8 : 0) | (b >= L ? 4 : 0) | (c >= L ? 2 : 0) | (d >= L ? 1 : 0);
      if (!bits || bits === 15) continue;
      const g = (segs[k] ||= []);
      // the four sides' crossings: top, bottom, left, right (worked out only where a piece uses them)
      const T = () => g.push(2 * i, x + (L - a) / (b - a), y), B = () => g.push(2 * (i + w), x + (L - d) / (c - d), y + 1);
      const Lf = () => g.push(2 * i + 1, x, y + (L - a) / (d - a)), R = () => g.push(2 * (i + 1) + 1, x + 1, y + (L - b) / (c - b));
      const mid = (a + b + c + d) / 4 >= L;
      switch (bits) {
        case 1: case 14: Lf(); B(); break; case 2: case 13: B(); R(); break; case 3: case 12: Lf(); R(); break;
        case 4: case 11: T(); R(); break; case 6: case 9: T(); B(); break; case 7: case 8: T(); Lf(); break;
        case 5: if (mid) { T(); Lf(); B(); R(); } else { T(); R(); Lf(); B(); } break;
        case 10: if (mid) { T(); R(); Lf(); B(); } else { T(); Lf(); B(); R(); } break;
      }
    }
  }
  return segs.map((g) => {
    const n = g.length / 6, at = new Map();   // edge id -> the pieces that end on it (one, or one + n * the other)
    for (let m = 0; m < n; m++) for (const e of [g[6 * m], g[6 * m + 3]]) at.set(e, at.has(e) ? at.get(e) + (m + 1) * (n + 1) : m + 1);
    const used = new Uint8Array(n), rings = [];
    for (let m0 = 0; m0 < n; m0++) {
      if (used[m0]) continue;
      const ring = [[g[6 * m0 + 1], g[6 * m0 + 2]], [g[6 * m0 + 4], g[6 * m0 + 5]]]; let e = g[6 * m0 + 3], closed = false;
      used[m0] = 1;
      for (;;) {
        const v = at.get(e), m1 = (v % (n + 1)) - 1, m2 = Math.floor(v / (n + 1)) - 1, nx = m1 >= 0 && !used[m1] ? m1 : m2 >= 0 && !used[m2] ? m2 : -1;
        if (nx < 0) { closed = e === g[6 * m0]; break; }
        used[nx] = 1;
        const fw = g[6 * nx] === e; ring.push(fw ? [g[6 * nx + 4], g[6 * nx + 5]] : [g[6 * nx + 1], g[6 * nx + 2]]); e = fw ? g[6 * nx + 3] : g[6 * nx];
      }
      if (closed && ring.length > 8) { ring.pop(); rings.push(ring); }
    }
    return rings;
  });
}
// A shape filled with rings that follow its outline inward (a contour fill: the stitches lie along the shape, so it
// catches the light as a shell or a tree's rings do, where rows lie one way across everything). recipes.js CONTOUR.
// The rings are the levels of the distance from the edge. They are sewn from the outside in, each started where the
// last one stopped; where the shape pinches into separate middles, all but one middle is sewn from its centre out
// (reached through cloth its own rings then cover), so the needle is back at the pinch for the next. A way that
// would lie on finished rings for more than SEWN mm is a trim. Under them: the edge run and the lattice of a plain fill.
function ringFill(px, shape, comp, res, { spacing, edge, across, cell }) {
  const { mask, labels } = shape, w = mask.w, step = spacing * res, sp = CONTOUR.stitch * res;
  // (this part's own distances: 0 outside it)
  const dt = shape.dt, mine = new Float32Array(dt.length);
  for (const i of comp.pixels) mine[i] = dt[i];
  const len = (l) => { let t = 0; for (let i = 0; i < l.length; i++) { const q = l[(i + 1) % l.length]; t += Math.hypot(q[0] - l[i][0], q[1] - l[i][1]); } return t; };
  // (a ring's points lie a pixel apart, stepped as the drawing is: evened out over 0.6 mm, then one point per 0.25 mm)
  const tidy = (l) => { const r = resample(l, 0.25 * res, true), n = r.length, k = 2; return r.map((_, i) => { let x = 0, y = 0; for (let j = -k; j <= k; j++) { const q = r[(i + j + n) % n]; x += q[0]; y += q[1]; } return [x / (2 * k + 1), y / (2 * k + 1)]; }); };
  // (levels half a row apart: every second one is a ring; the ones between are kept only where no ring lies inside
  // them, round a crest where the rings from two sides meet up to two rows apart: bare cloth along a heart's cleft
  // and round a hole, a row wide)
  const halves = levelRings(mine, w, mask.h, CONTOUR.first * res + 0.5, step / 2).map((rs) => rs.map(tidy).filter((l) => l.length > 4 && len(l) >= CONTOUR.least * res));
  const levels = halves.filter((_, k) => k % 2 === 0).map((rs, k) => rs.map((p) => ({ p, k, kids: [] })));
  const all = levels.flat();
  if (!all.length) return routeFill([edge, across], comp, mask, res, undefined, undefined, true, 2, cell);
  // each ring's parent: the ring one level out that passes nearest its first point
  const near = (l, q) => { let bd = Infinity, bi = 0; for (let i = 0; i < l.length; i++) { const d = (l[i][0] - q[0]) ** 2 + (l[i][1] - q[1]) ** 2; if (d < bd) { bd = d; bi = i; } } return [Math.sqrt(bd), bi]; };
  const roots = [];
  levels.forEach((rs, k) => { for (const r of rs) {
    let best = null, bd = 2.5 * step;
    if (k) for (const o of levels[k - 1]) { const [d] = near(o.p, r.p[0]); if (d < bd) { bd = d; best = o; } }
    if (best) best.kids.push(r); else roots.push(r);
  } });
  // the stretches of a between-level that have no ring of the next level within 0.8 of a row: sewn as open lines
  const seen = new Int16Array(mask.w * mask.h), R2 = Math.ceil(0.8 * step);
  halves.forEach((rs, k2) => { if (k2 % 2) {
    const k = (k2 - 1) / 2;
    for (const c of levels[k + 1] || []) for (const [x, y] of c.p) {
      const X0 = Math.round(x), Y0 = Math.round(y);
      for (let dy = -R2; dy <= R2; dy++) for (let dx = -R2; dx <= R2; dx++) if (dx * dx + dy * dy <= 0.64 * step * step) { const X = X0 + dx, Y = Y0 + dy; if (X >= 0 && Y >= 0 && X < mask.w && Y < mask.h) seen[Y * mask.w + X] = k + 1; }
    }
    for (const p of rs) {
      const bare = p.map(([x, y]) => seen[Math.round(y) * mask.w + Math.round(x)] !== k + 1), n = p.length, from = bare.indexOf(false);
      const arcs = from < 0 ? [p] : [];
      if (from >= 0) for (let i = 0, arc = []; i <= n; i++) { const q = (from + i) % n; if (i < n && bare[q]) arc.push(p[q]); else { if (arc.length) arcs.push(arc); arc = []; } }
      for (const a of arcs) {
        if (a.length * 0.25 < CONTOUR.least / 2) continue;
        let best = null, bd = 1.5 * step;
        for (const o of levels[k]) { const [d] = near(o.p, a[a.length >> 1]); if (d < bd) { bd = d; best = o; } }
        if (best) best.kids.push({ p: a, k, kids: [], open: true });
      }
    }
  } });
  // the order: a ring, then its middles; every middle but the last from its centre out
  const size = (r) => (r.n ??= 1 + r.kids.reduce((t, c) => t + size(c), 0));
  // (the open stretches after the middles sewn outward, before the one sewn inward: beside the pinch, where both end)
  const inward = (r) => { const ks = r.kids.filter((c) => !c.open).sort((a, b) => size(a) - size(b)), last = ks.pop(); return [r, ...ks.flatMap((c) => inward(c).reverse()), ...r.kids.filter((c) => c.open), ...(last ? inward(last) : [])]; };
  // (a hole's own rings grow outward from it and meet the outline's at their last: sewn from there back to the hole)
  const order = roots.sort((a, b) => a.k - b.k || len(b.p) - len(a.p)).flatMap((r, i) => (i ? inward(r).reverse() : inward(r)));
  const R = makeRouter(mask, res, cell || ((x, y) => (labels[y * w + x] === comp.id ? 1 : 0)));
  const out = routeFill([edge, across], comp, mask, res, undefined, undefined, true, 2, cell);
  let cur = out.length ? out[out.length - 1].at(-1) : null, path = out.length ? out[out.length - 1] : null;
  for (const r of order) {
    // (an open stretch: from whichever end is nearer)
    const p = r.open && cur && Math.hypot(r.p.at(-1)[0] - cur[0], r.p.at(-1)[1] - cur[1]) < Math.hypot(r.p[0][0] - cur[0], r.p[0][1] - cur[1]) ? r.p.slice().reverse() : r.p;
    const n = p.length;
    let [d, i0] = r.open ? [cur ? Math.hypot(p[0][0] - cur[0], p[0][1] - cur[1]) : Infinity, 0] : cur ? near(p, cur) : [Infinity, 0];
    // how the needle gets there: straight on (the ring next door), by a hidden way, or not at all (a trim)
    let how = cur && d <= 2 * step + 0.2 * res ? "on" : "", way = null;
    if (!how && cur) { way = R.route(cur, p[i0], SEWN); if (way && way.sewnMm <= SEWN) how = "way"; }
    if (!how && r.open && cur) continue;   // (a stretch along a crest that only a jump reaches isn't worth a trim)
    // (a jump of 5 mm or less is never cut, a loose thread to snip: the ring starts further round instead, or, too
    // small for that, the needle sews straight across)
    if (!how && cur && d <= 5.6 * res) {
      let bj = -1, bd = Infinity;
      for (let j = 0; j < n; j++) { const dd = Math.hypot(p[j][0] - cur[0], p[j][1] - cur[1]); if (dd > 5.6 * res && dd < bd) { bd = dd; bj = j; } }
      if (bj >= 0) i0 = bj; else how = "across";
    }
    // round the ring from the point nearest the needle, in whole stitches, home, and `lap` further (so the rings'
    // starts don't line up into a seam)
    // (stitches up to CONTOUR.stitch long, shorter where a longer one would leave the ring's line by `off` mm: a
    // corner gets a needle point; even 3 mm stitches cut every corner, a bare line along a square's diagonals)
    const end = r.open ? n - 1 : n + Math.round((CONTOUR.lap * res * n) / len(p)), at = (j) => p[(i0 + j) % n], ring = [];
    for (let a = 0; a < end;) {
      let j = Math.min(end, a + 3);
      while (j < end && Math.hypot(at(j)[0] - at(a)[0], at(j)[1] - at(a)[1]) < 0.6 * res) j++;   // (round a hairpin the line doubles back)
      grow: for (let L = Math.hypot(at(j)[0] - at(a)[0], at(j)[1] - at(a)[1]); j < end; j++) {
        const q = at(j + 1), A = at(a), dx = q[0] - A[0], dy = q[1] - A[1], D = Math.hypot(dx, dy);
        if (D > sp) break;
        for (let i = a + 1; i <= j; i++) if (Math.abs((at(i)[0] - A[0]) * dy - (at(i)[1] - A[1]) * dx) / (D || 1) > CONTOUR.off * res) break grow;
        L = D;
      }
      // (never a last stitch under 0.6 mm: it stops at the one before)
      if (j >= end && ring.length && Math.hypot(at(end)[0] - at(a)[0], at(end)[1] - at(a)[1]) < 0.6 * res) break;
      ring.push(at(j)); a = j;
    }
    if (how === "on") path.push(...ring);   // (the first stitch slants across to it)
    else if (how === "way") path.push(...R.stitches(way), p[i0], ...ring);
    else if (how === "across") path.push(p[i0], ...ring);
    else out.push((path = [p[i0], ...ring]));
    R.markSewn([p[i0], ...ring]);
    cur = path[path.length - 1];
  }
  return out;
}
// --- Rows that follow the form (PX3; docs/stitch-model.md "Direction that follows the form", numbers in recipes.js
// FORM) ---
// A part's outline, smooth: the marching-squares line at 0.5 through its mask blurred twice by a 3 x 3 box (a picture's
// mask is stair-stepped; its raw outline runs only at 0, 45 and 90 degrees). comp: { id, labels, pixels }. In px.
function traceComp(comp, w) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of comp.pixels) { const x = i % w, y = (i - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const cx = x0 - 3, cy = y0 - 3, cw = x1 - x0 + 7, ch = y1 - y0 + 7;
  let f = new Float32Array(cw * ch), g = new Float32Array(cw * ch);
  for (const i of comp.pixels) { const x = i % w, y = (i - x) / w; f[(y - cy) * cw + (x - cx)] = 1; }
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += f[(y + dy) * cw + x + dx];
      g[y * cw + x] = s / 9;
    }
    [f, g] = [g, f];
  }
  return (levelRings(f, cw, ch, 0.5, 1)[0] || []).map((r) => r.map(([x, y]) => [x + cx, y + cy]));
}
// (the angle between a line at a and one at b, degrees, folded to 0..90)
const apart = (a, b) => { const d = (((a - b) % 180) + 180) % 180; return d > 90 ? 180 - d : d; };
// How rows at angle th (degrees) would lie in a part (rings: its outline, px): `ends`, the row ends at rows 0.5 mm
// apart, per mm across (fewer: longer rows); `sections`, how many runs of rows can be sewn back and forth without leaving the part (each
// more is travel or a trim; `sewRows`' rule); `ragged`, mm of outline the rows meet at a grazing angle (FORM.ragged:
// each row end steps spacing / sin(angle) along the edge, a saw-tooth from about 1 mm, which a 3 mm diamond's edge 15
// degrees off the rows showed).
function rowsAt(rings, th, res) {
  const t = (th * Math.PI) / 180, U = [Math.cos(t), Math.sin(t)], V = [-Math.sin(t), Math.cos(t)];
  const { v0, v1, at } = outlineRows(rings, U, V, 0);
  let ends = 0, sections = 0, prev = [];
  for (let v = v0 + res / 4; v <= v1; v += res / 2) {
    const cur = at(v).filter(([a, b]) => b - a >= 0.6 * res).map((iv) => ({ iv, reg: null }));
    ends += cur.length;
    for (const c of cur) {
      const over = prev.filter((p) => p.iv[0] < c.iv[1] && c.iv[0] < p.iv[1]);
      if (over.length === 1 && cur.filter((q) => q.iv[0] < over[0].iv[1] && over[0].iv[0] < q.iv[1]).length === 1 && over[0].reg.open) c.reg = over[0].reg;
      if (!c.reg) { c.reg = { open: true }; sections++; }
    }
    for (const p of prev) if (!cur.some((c) => c.reg === p.reg)) p.reg.open = false;
    prev = cur;
  }
  let ragged = 0;
  const [lo, hi, fade] = FORM.ragged;
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!len) continue;
    const a = apart((Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI, th);
    ragged += (len / res) * (a < lo ? a / lo : a <= hi ? 1 : a < hi + fade ? (hi + fade - a) / fade : 0);
  }
  return { ends, sections, ragged };
}
// The three readings of a part's own direction (degrees), each a candidate:
//   axis:  the principal axis of its area (the long way of an ellipse fitted to it)
//   edges: its edges' dominant direction (length-weighted, over FORM.blur degrees either side)
//   runs:  the rows with the fewest ends (the longest straight runs across it), every FORM.step degrees
function readings(rings, pixels, w, res) {
  let n = 0, mx = 0, my = 0;
  for (const i of pixels) { const x = i % w; mx += x; my += (i - x) / w; n++; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const i of pixels) { const x = i % w - mx, y = (i - (i % w)) / w - my; sxx += x * x; syy += y * y; sxy += x * y; }
  const axis = (0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI, round = Math.hypot(sxx - syy, 2 * sxy) / (sxx + syy || 1);
  const hist = new Float64Array(180);
  let perim = 0;
  for (const r of rings) {
    const q = resample(r, 0.5 * res, true);
    for (let i = 0; i < q.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      hist[Math.round(((((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI) % 180) + 180) % 180) % 180] += len; perim += len;
    }
  }
  let edges = 0, best = -1;
  for (let a = 0; a < 180; a++) {
    let s = 0;
    for (let d = -FORM.blur; d <= FORM.blur; d++) s += hist[(a + d + 180) % 180] * (FORM.blur + 1 - Math.abs(d));
    if (s > best) { best = s; edges = a; }
  }
  const sweep = [];
  for (let a = 0; a < 180; a += FORM.step) sweep.push({ a, ...rowsAt(rings, a, res) });
  const runs = sweep.reduce((m, s) => (s.ends < m.ends || (s.ends === m.ends && s.sections < m.sections) ? s : m)).a;
  // (the baseline: Goldman's expired patent US 6,804,573, the fewest fragments of 16 angles, the first on a tie)
  let fewest = 0, fs = Infinity;
  for (let k = 0; k < 16; k++) { const s = rowsAt(rings, k * 11.25, res).sections; if (s < fs) { fs = s; fewest = k * 11.25; } }
  return { axis, edges, runs, fewest, round, perim: perim / res, sweep };
}
// testing only (measuring which reading to sew by): "cost" (as sewn), "axis", "edges", "runs" or "fewest"
export const FORM_TRY = { method: "cost", curved: true };
// A part's rows: { angle } (degrees), or { angle, field } where curved rows (`rowField`) suit it better. `prefer`
// where its shape doesn't say (a round part: the caller's angle, so neighbouring colours still alternate). Measured,
// not guessed: every candidate (the sweep, the three readings and the curved rows) is scored by its rows as they would
// lie, ends against the fewest any gives, plus ragged outline and sections beyond the fewest, weighted by FORM, among
// those with no more sections than the caller's angle; within FORM.keep of the best straight angle, the caller's
// angle wins, then the axis; curved rows only when better than the best straight by FORM.curve.
// comp: { id, labels, pixels }; dt: each pixel's distance to the part's edge (px), for the curved rows' field.
function formPick(comp, mask, res, prefer, dt, spacing = ROWS.standard) {
  const { w } = mask, pixels = comp.pixels;
  if (pixels.length < FORM.least * res * res) return { angle: prefer };
  // (its outline evened over FORM.even mm, then every 0.5 mm: the drawing's steps stay in the traced line, and a
  // bar at 5 degrees read from 0 to 13, its straight edges as ragged)
  const k = 2 * Math.round((FORM.even * res) / 2) + 1;
  const rings = traceComp(comp, w).filter((r) => r.length > 2 * k).map((r) => resample(smooth(r, k, true), 0.5 * res, true)).filter((r) => r.length >= 3);
  if (!rings.length) return { angle: prefer };
  const R = readings(rings, pixels, w, res);
  if (FORM_TRY.method !== "cost") return { angle: R[FORM_TRY.method] };
  // (never more sections than the caller's angle gives: each is travel or a trim, and thin wavy strokes cut along
  // their length gained 8 trims and 3 loose threads over the picture corpus when they were only weighed)
  const mine = { a: prefer, ...rowsAt(rings, prefer, res) }, axis = { a: R.axis, ...rowsAt(rings, R.axis, res) };
  const cands = [...R.sweep, mine, axis, { a: R.edges, ...rowsAt(rings, R.edges, res) }].filter((c) => c.sections <= mine.sections);
  // the curved rows, where the part is big enough to be worth it and the straight rows leave room to gain
  let curved = null;
  if (FORM_TRY.curved && dt && pixels.length >= FORM.curvedLeast * res * res) {
    const fd = rowField(comp, w, mask.h, res, dt);
    const lab = comp.labels, id = comp.id, inside = (x, y) => { const X = Math.round(x), Y = Math.round(y); return X >= 0 && Y >= 0 && X < w && Y < mask.h && lab[Y * w + X] === id; };
    // (its runs as the travel joins them, swept from either side, the fewer kept: a crescent's outer rows are cut by
    // its inner arc, as straight rows are, and run on through rows still to sew)
    let c = null, parts = Infinity;
    if (fd) for (const rev of [false, true]) {
      const t = curvedRows(comp, mask, res, dt, { spacing, stitch: TATAMI.stitch, pull: 0, inside, fd, rev });
      const n = t ? routeFill([t.paths], comp, mask, res, routeBudget(), Infinity, true).length : Infinity;
      if (n < parts) { parts = n; c = t; fd.rev = rev; }
    }
    if (c && parts <= mine.sections) curved = { a: null, fd, ends: c.ends, sections: parts, ragged: fieldRagged(rings, fd, res) };
  }
  const scorer = (list) => {
    const e0 = Math.min(...list.map((c) => c.ends)), s0 = Math.min(...list.map((c) => c.sections));
    return (c) => c.ends / Math.max(e0, 1) + (FORM.rag * c.ragged) / Math.max(R.perim, 1) + FORM.sec * (c.sections - s0);
  };
  // the straight angle (the underlay's too, turned), among the straight candidates alone
  const cost = scorer(cands);
  let best = cands[0], bc = Infinity;
  for (const c of cands) { const k = cost(c); if (k < bc - 1e-9) { bc = k; best = c; } }
  // (near ties: the caller's angle, then the axis: a leaf scored alike from 145 to 160 degrees, and along its vein
  // it reads as one)
  let angle = best.a;
  for (const c of [axis, mine]) if (cands.includes(c) && cost(c) - bc <= FORM.keep) angle = c.a;
  const both = curved && scorer([best, curved]);
  if (curved && both(curved) < both(best) - FORM.curve) return { angle, field: curved.fd };
  return { angle };
}
// mm of outline the curved rows meet at a grazing angle (as `rowsAt`), the rows' direction taken from the field's
// nearest cell
function fieldRagged(rings, fd, res) {
  const [lo, hi, fade] = FORM.ragged;
  let ragged = 0;
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!len) continue;
    const gx = Math.min(fd.gw - 1, Math.max(0, Math.round((p[0] - fd.bx) / fd.C))), gy = Math.min(fd.gh - 1, Math.max(0, Math.round((p[1] - fd.by) / fd.C))), c = gy * fd.gw + gx;
    const row = (Math.atan2(fd.NX[c], -fd.NY[c]) * 180) / Math.PI, a = apart((Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI, row);
    ragged += (len / res) * (a < lo ? a / lo : a <= hi ? 1 : a < hi + fade ? (hi + fade - a) / fade : 0);
  }
  return ragged;
}
// The part's rows, kept on the part (a picture's underlay and fill ask for them in turn)
// A picture's part sews its own angle only where that, sewn as the picture sews it (underlay, then rows 0.4 mm apart,
// routed nearer end first with travel along the edge), ends in no more parts than the caller's angle: measured on the
// rows alone, parts under 100 mm² and a few bigger ones (a one-colour cat, 0 trims -> 3) gained trims on the
// picture corpus through the travel between sections.
const forms = new WeakMap();
function formOf(comp, mask, res, prefer) {
  if (forms.has(comp)) return forms.get(comp);
  let f = comp.pixels.length < FORM.picture * res * res ? { angle: prefer } : formPick(comp, mask, res, prefer, comp.dt);
  if (f.angle !== prefer || f.field) {
    const plain = { ...comp, form: null }, sew = (a, field) => {
      const under = tatami(mask, plain, res, { angle: a + 90, spacing: 2.5, stitch: 3, inset: 0.4, pull: 0 });
      const fill = field ? curvedRows(plain, mask, res, comp.dt, { spacing: ROWS.standard, stitch: TATAMI.stitch, pull: 0.15, fd: field, inside: (x, y) => { const X = Math.round(x), Y = Math.round(y); return X >= 0 && Y >= 0 && X < mask.w && Y < mask.h && comp.labels[Y * mask.w + X] === comp.id; } })?.paths : tatami(mask, plain, res, { angle: a, spacing: ROWS.standard, stitch: TATAMI.stitch, pull: 0.15 });
      return fill ? routeFill([under, fill], comp, mask, res, routeBudget(), WORN, false, 0, null, PICTURES.edge).length : Infinity;
    };
    const was = sew(prefer, null);
    if (f.field && sew(f.angle, f.field) > was) f = { angle: f.angle };
    if (!f.field && f.angle !== prefer && sew(f.angle, null) > was) f = { angle: prefer };
  }
  forms.set(comp, f);
  return f;
}
// --- Curved rows (PX3): rows that bend with a part's form, evenly spaced ---
// The rows are the level lines of one field phi over the part, fitted so its gradient follows the part's own direction
// field: rows as the level lines of a stripe pattern (Knöppel, Crane, Pinkall, Schröder, "Stripe patterns on
// surfaces", 2015), here without singularities, so one sparse least-squares solve. The direction field is the
// structure tensor of the distance-to-edge gradient, smoothed across the part (edge tangent flow: Kang, Lee, Chui,
// "Coherent line drawing", 2007): near an edge the rows lie along it, and both sides of a band agree. Rows lie
// `spacing` apart where phi's gradient is 1; it is scaled so they are never closer than that (density met where the
// rows are made, not by taking stitches out after) and the field is used only where they are nowhere further apart
// than FORM.stretch times. On a grid of FORM.cell mm, the part and a ring of two cells round it (so rows reach the
// edge and their pull past it).
function rowField(comp, w, h, res, dt) {
  const C = FORM.cell * res, id = comp.id, lab = comp.labels;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, maxDt = 0;
  for (const i of comp.pixels) { const x = i % w, y = (i - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (dt[i] > maxDt) maxDt = dt[i]; }
  const bx = x0 - 3 * C, by = y0 - 3 * C, gw = Math.ceil((x1 - bx) / C) + 4, gh = Math.ceil((y1 - by) / C) + 4, n = gw * gh;
  const at = (X, Y) => { const x = Math.round(X), y = Math.round(Y); return x >= 0 && y >= 0 && x < w && y < h && lab[y * w + x] === id ? y * w + x : -1; };
  const ins = new Uint8Array(n), Jxx = new Float64Array(n), Jxy = new Float64Array(n), Jyy = new Float64Array(n);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const X = bx + gx * C, Y = by + gy * C, c = gy * gw + gx;
    if (at(X, Y) < 0) continue;
    ins[c] = 1;
    const d = (dx, dy) => { const i = at(X + dx, Y + dy); return i < 0 ? 0 : dt[i]; };
    const gX = d(1, 0) - d(-1, 0), gY = d(0, 1) - d(0, -1);
    Jxx[c] = gX * gX; Jxy[c] = gX * gY; Jyy[c] = gY * gY;
  }
  // (smoothed across the part, over about its half width, inside cells only)
  const r = Math.max(2, Math.min(FORM.blurMax, Math.round((FORM.blurK * maxDt) / C)));
  for (const J of [Jxx, Jxy, Jyy]) for (let pass = 0; pass < 2; pass++) {
    const t = new Float64Array(n);
    for (let gy = 0; gy < gh; gy++) { let s = 0, k = 0; for (let gx = -r; gx < gw; gx++) { const a = gx + r, b = gx - r - 1; if (a < gw) { s += J[gy * gw + a]; k += ins[gy * gw + a]; } if (b >= 0) { s -= J[gy * gw + b]; k -= ins[gy * gw + b]; } if (gx >= 0) t[gy * gw + gx] = k ? s / k : 0; } }
    for (let gx = 0; gx < gw; gx++) { let s = 0, k = 0; for (let gy = -r; gy < gh; gy++) { const a = gy + r, b = gy - r - 1; if (a < gh) { s += t[a * gw + gx]; k += ins[a * gw + gx]; } if (b >= 0) { s -= t[b * gw + gx]; k -= ins[b * gw + gx]; } if (gy >= 0) J[gy * gw + gx] = ins[gy * gw + gx] ? (k ? s / k : 0) : 0; } }
  }
  // the rows' normal at each cell (a direction, sign still free) and how sure: (l1 - l2) / (l1 + l2)
  const NX = new Float64Array(n), NY = new Float64Array(n), coh = new Float64Array(n);
  for (let c = 0; c < n; c++) if (ins[c]) {
    const t = 0.5 * Math.atan2(2 * Jxy[c], Jxx[c] - Jyy[c]); NX[c] = Math.cos(t); NY[c] = Math.sin(t);
    coh[c] = Math.hypot(Jxx[c] - Jyy[c], 2 * Jxy[c]) / (Jxx[c] + Jyy[c] || 1);
  }
  // the ring round the part takes its nearest inside cell's direction (breadth first)
  const dom = ins.slice();
  let front = [];
  for (let c = 0; c < n; c++) if (ins[c]) front.push(c);
  for (let ring = 0; ring < 2; ring++) {
    const next = [];
    for (const c of front) { const cx = c % gw, cy = (c - cx) / gw; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + dx, y = cy + dy, m = y * gw + x; if (x >= 0 && y >= 0 && x < gw && y < gh && !dom[m]) { dom[m] = 2; NX[m] = NX[c]; NY[m] = NY[c]; next.push(m); } } }
    front = next;
  }
  // one sign for the whole field, from its surest cell outward; a turn it can't take (a disc's middle, a star's) is
  // a singularity, and the part keeps straight rows
  let seed = -1;
  for (let c = 0; c < n; c++) if (ins[c] && (seed < 0 || coh[c] > coh[seed])) seed = c;
  if (seed < 0) return null;
  const seen = new Uint8Array(n), q = [seed]; seen[seed] = 1;
  for (let k = 0; k < q.length; k++) {
    const c = q[k], cx = c % gw, cy = (c - cx) / gw;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + dx, y = cy + dy, m = y * gw + x; if (x >= 0 && y >= 0 && x < gw && y < gh && dom[m] && !seen[m]) { if (NX[m] * NX[c] + NY[m] * NY[c] < 0) { NX[m] = -NX[m]; NY[m] = -NY[m]; } seen[m] = 1; q.push(m); } }
  }
  let pairs = 0, bad = 0;
  for (let c = 0; c < n; c++) if (ins[c]) for (const m of [c + 1, c + gw]) if (m < n && ins[m]) { pairs++; if (NX[m] * NX[c] + NY[m] * NY[c] < 0) bad++; }
  if (bad > FORM.turns * pairs + 2) return null;
  // phi: least squares over every pair of neighbouring cells, phi(b) - phi(a) = the mean normal . (b - a) (mm);
  // conjugate gradients, Jacobi preconditioned
  const cells = q, idx = new Int32Array(n).fill(-1);
  cells.forEach((c, k) => (idx[c] = k));
  // (a pair within FORM.hug mm of the edge counts up to FORM.hugW times: there the rows must lie along it, or they
  // graze it and come apart into sections of their own, an S curve's outer rows)
  const near = (c) => { const X = Math.round(bx + (c % gw) * C), Y = Math.round(by + Math.floor(c / gw) * C); const i = at(X, Y); return i < 0 ? 0 : dt[i] / res; };
  const wt = (c) => 1 + (FORM.hugW - 1) * Math.max(0, 1 - near(c) / FORM.hug);
  const N = cells.length, W = new Float64Array(n), start = new Int32Array(N + 1), to = new Int32Array(4 * N), wv = new Float64Array(4 * N);
  const diag = new Float64Array(N), bv = new Float64Array(N), phi = new Float64Array(N), eps = 1e-6;
  for (const c of cells) W[c] = ins[c] ? wt(c) : FORM.hugW;
  let m0 = 0;
  cells.forEach((c, i) => {
    start[i] = m0; diag[i] = eps;
    const cx = c % gw;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const m = c + dy * gw + dx; if (cx + dx < 0 || cx + dx >= gw || m < 0 || m >= n || idx[m] < 0) continue;
      let ax = NX[c] + NX[m], ay = NY[c] + NY[m]; const L = Math.hypot(ax, ay) || 1; ax /= L; ay /= L;
      const wgt = Math.min(W[c], W[m]);
      to[m0] = idx[m]; wv[m0] = wgt; m0++; diag[i] += wgt; bv[i] -= wgt * FORM.cell * (ax * dx + ay * dy);
    }
  });
  start[N] = m0;
  const A = (x, out) => { for (let i = 0; i < N; i++) { let s = diag[i] * x[i]; for (let k = start[i]; k < start[i + 1]; k++) s -= wv[k] * x[to[k]]; out[i] = s; } };
  const R = bv.slice(), Z = new Float64Array(N), P = new Float64Array(N), AP = new Float64Array(N);
  for (let i = 0; i < N; i++) { Z[i] = R[i] / diag[i]; P[i] = Z[i]; }
  let rz = 0; for (let i = 0; i < N; i++) rz += R[i] * Z[i];
  let b2 = 0; for (let i = 0; i < N; i++) b2 += bv[i] * bv[i];
  for (let it = 0; it < FORM.iters && rz > 0; it++) {
    A(P, AP);
    let pap = 0; for (let i = 0; i < N; i++) pap += P[i] * AP[i];
    const al = rz / pap; let rr = 0;
    for (let i = 0; i < N; i++) { phi[i] += al * P[i]; R[i] -= al * AP[i]; rr += R[i] * R[i]; }
    if (rr < 1e-8 * b2) break;
    let rz2 = 0; for (let i = 0; i < N; i++) { Z[i] = R[i] / diag[i]; rz2 += R[i] * Z[i]; }
    const be = rz2 / rz; rz = rz2;
    for (let i = 0; i < N; i++) P[i] = Z[i] + be * P[i];
  }
  // how far apart rows of one phi step lie: 1 / |grad phi| (mm per mm), over the part's own cells
  const F = new Float64Array(n).fill(NaN);
  cells.forEach((c, k) => (F[c] = phi[k]));
  const grads = [];
  for (const c of cells) if (ins[c]) {
    const g = (a, z) => (Number.isNaN(F[a]) || Number.isNaN(F[z]) ? null : (F[a] - F[z]) / (2 * FORM.cell));
    const cx = c % gw, gX = cx > 0 && cx < gw - 1 ? g(c + 1, c - 1) : null, gY = g(c + gw, c - gw);
    if (gX != null && gY != null) grads.push(Math.hypot(gX, gY));
  }
  if (grads.length < 8) return null;
  grads.sort((p, z) => p - z);
  const hi = grads[Math.floor(0.99 * (grads.length - 1))], lo = grads[Math.floor(0.02 * (grads.length - 1))];
  if (!(hi > 0)) return null;
  for (const c of cells) F[c] /= hi;
  return { F, gw, gh, C, bx, by, NX, NY, ins, stretch: hi / Math.max(lo, 1e-9) };
}
// The level lines of the field at phi = (k + 0.5) x step, on its grid (marching squares over squares of four cells
// all in the field), joined end to end. Returns [{ k, p: [[x, y] px, ...], closed }].
function fieldLines(fd, step) {
  const { F, gw, gh, C, bx, by } = fd, segs = new Map();   // level -> six numbers a piece, as levelRings
  for (let y = 0; y < gh - 1; y++) for (let x = 0; x < gw - 1; x++) {
    const i = y * gw + x, a = F[i], b = F[i + 1], c = F[i + gw + 1], d = F[i + gw];
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) continue;
    const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
    for (let k = Math.ceil(lo / step - 0.5); (k + 0.5) * step <= hi; k++) {
      const L = (k + 0.5) * step, bits = (a >= L ? 8 : 0) | (b >= L ? 4 : 0) | (c >= L ? 2 : 0) | (d >= L ? 1 : 0);
      if (!bits || bits === 15) continue;
      if (!segs.has(k)) segs.set(k, []);
      const g = segs.get(k);
      const T = () => g.push(2 * i, x + (L - a) / (b - a), y), B = () => g.push(2 * (i + gw), x + (L - d) / (c - d), y + 1);
      const Lf = () => g.push(2 * i + 1, x, y + (L - a) / (d - a)), R = () => g.push(2 * (i + 1) + 1, x + 1, y + (L - b) / (c - b));
      const mid = (a + b + c + d) / 4 >= L;
      switch (bits) {
        case 1: case 14: Lf(); B(); break; case 2: case 13: B(); R(); break; case 3: case 12: Lf(); R(); break;
        case 4: case 11: T(); R(); break; case 6: case 9: T(); B(); break; case 7: case 8: T(); Lf(); break;
        case 5: if (mid) { T(); Lf(); B(); R(); } else { T(); R(); Lf(); B(); } break;
        case 10: if (mid) { T(); R(); Lf(); B(); } else { T(); Lf(); B(); R(); } break;
      }
    }
  }
  const out = [];
  for (const k of [...segs.keys()].sort((p, q) => p - q)) {
    const g = segs.get(k), m = g.length / 6, ends = new Map();
    for (let s = 0; s < m; s++) for (const e of [g[6 * s], g[6 * s + 3]]) { if (!ends.has(e)) ends.set(e, []); ends.get(e).push(s); }
    const used = new Uint8Array(m);
    const walk = (s0, e0) => {   // from piece s0 leaving by its end e0's other end
      const line = []; let s = s0, from = e0;
      for (;;) {
        used[s] = 1;
        const fw = g[6 * s] === from, P1 = fw ? [g[6 * s + 1], g[6 * s + 2]] : [g[6 * s + 4], g[6 * s + 5]], P2 = fw ? [g[6 * s + 4], g[6 * s + 5]] : [g[6 * s + 1], g[6 * s + 2]], to = fw ? g[6 * s + 3] : g[6 * s];
        if (!line.length) line.push(P1);
        line.push(P2);
        const nx = (ends.get(to) || []).find((t) => !used[t]);
        if (nx == null) return { line, closed: to === e0 };
        s = nx; from = to;
      }
    };
    // (open lines from their ends first, then what is left is closed)
    for (const [e, ss] of ends) if (ss.length === 1 && !used[ss[0]]) { const r = walk(ss[0], e); out.push({ k, p: r.line, closed: false }); }
    for (let s = 0; s < m; s++) if (!used[s]) { const r = walk(s, g[6 * s]); out.push({ k, p: r.line, closed: true }); }
  }
  for (const o of out) o.p = o.p.map(([x, y]) => [bx + x * C, by + y * C]);
  return out;
}
// Curved rows of a part as stitches (px paths), or null where the field won't do (a singularity, rows spread too far,
// a ring of closed rows). The rows are cut by the part (its labels, and `inside` for an inset), each stretch pulled
// out by `pull` px at both ends, sewn back and forth in runs as `sewRows` does: a run goes on while a stretch has
// just one neighbour in the next row and that one just it. Needle points every L px along a row, staggered by the
// pattern from the stretch's start. Also returns { sections, ends (per mm across at `spacing`), ragged }.
function curvedRows(comp, mask, res, dt, { spacing, stitch, pull, pattern = "tatami", inside, fd = rowField(comp, mask.w, mask.h, res, dt), rev = fd?.rev || false }) {
  if (!fd || fd.stretch > FORM.stretch) return null;
  const sp = spacing, L = stitch * res, P = pull * res;
  const lines = fieldLines(fd, sp);
  if (lines.some((l) => l.closed && l.p.length > 8)) return null;
  // (a step between rows may leave the part by the pull and 0.15 mm, as in `fillPolygon`)
  const far = P + 0.15 * res, RING = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7]];
  // stretches inside the part, sampled every half pixel along each line
  const rows = new Map();
  for (const { k, p } of lines) {
    const q = resample(p, 0.5), s = arclen(q), n = q.length;
    let a = -1;
    for (let i = 0; i <= n; i++) {
      const ok = i < n && inside(q[i][0], q[i][1]);
      if (ok && a < 0) a = i;
      if (!ok && a >= 0) {
        // (a row along the edge leaves and comes back over the drawing's steps: stretches FORM.gap mm apart are one)
        // (or any gap that stays within the pull and 0.15 mm of the part: a row grazing an edge it nearly follows)
        const s0 = Math.max(0, s[a] - P), s1 = Math.min(s[n - 1], s[i - 1] + P), mine = rows.get(k), last = mine?.[mine.length - 1];
        const hugs = () => { for (let j = 0; j < n; j++) if (s[j] > last.s1 && s[j] < s0 && !inside(q[j][0], q[j][1]) && !RING.some(([dx, dy]) => inside(q[j][0] + dx * far, q[j][1] + dy * far))) return false; return true; };
        if (last && last.q === q && (s0 - last.s1 <= FORM.gap * res || hugs())) last.s1 = s1;
        else if (s1 - s0 >= 0.6 * res) { if (!mine) rows.set(k, []); rows.get(k).push({ k, q, s, s0, s1 }); }
        a = -1;
      }
    }
  }
  const ks = [...rows.keys()].sort((p, q) => (rev ? q - p : p - q));
  // neighbours in the next row: some point of one within 1.5 rows (+0.15 mm) of the other's, on a hash of 0.25 mm
  const near = 1.5 * sp * res + 0.15 * res, cellOf = (x, y) => `${Math.floor(x / near)},${Math.floor(y / near)}`;
  const pts = (st) => { const out = []; for (let i = 0; i < st.q.length; i++) if (st.s[i] >= st.s0 && st.s[i] <= st.s1) out.push(st.q[i]); return out.filter((_, i) => i % 4 === 0); };
  const regions = [];
  let prev = [], prevK = null;
  for (const k of ks) {
    const cur = rows.get(k).map((st) => ({ st, region: null, nb: [] }));
    if (prevK === k + (rev ? 1 : -1)) {
      const hash = new Map();
      prev.forEach((p, j) => { for (const [x, y] of pts(p.st)) { const c = cellOf(x, y); if (!hash.has(c)) hash.set(c, new Set()); hash.get(c).add(j); } });
      for (const c of cur) {
        const found = new Set();
        for (const [x, y] of pts(c.st)) { const gx = Math.floor(x / near), gy = Math.floor(y / near); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const j of hash.get(`${gx + dx},${gy + dy}`) || []) found.add(j); }
        c.nb = [...found];
      }
    }
    // (unlike straight rows, a run goes on where a row splits or two meet: into the longest stretch beside its last
    // row; the rest begin runs of their own. Kept to sewRows' rule, an S curve's outer rows, cut where they graze its
    // edge, ended the body's run and stranded a piece behind it)
    const len = (st) => st.s1 - st.s0, taken = new Set();
    for (const c of [...cur].sort((x, y) => len(y.st) - len(x.st))) {
      const p = c.nb.map((j) => prev[j]).filter((o) => o.region.open && !taken.has(o.region)).sort((x, y) => len(y.st) - len(x.st))[0];
      if (p) { c.region = p.region; taken.add(p.region); }
    }
    // (a run that branches off another, or ends beside one, is sewn before it (`of`, `order` below)
    for (const c of cur) {
      if (!c.region) { c.region = { rows: [], open: true, of: c.nb.length ? prev[c.nb[0]].region : null }; regions.push(c.region); }
      c.region.rows.push(c.st);
    }
    for (const [j, p] of prev.entries()) if (!cur.some((c) => c.region === p.region)) { p.region.open = false; const nx = cur.find((c) => c.nb.includes(j)); if (nx && !p.region.of) p.region.of = nx.region; }
    prev = cur; prevK = k;
  }
  const leaves = (p, z) => {
    const m = Math.ceil(Math.hypot(z[0] - p[0], z[1] - p[1]) / (0.2 * res));
    for (let i = 1; i < m; i++) { const x = p[0] + ((z[0] - p[0]) * i) / m, y = p[1] + ((z[1] - p[1]) * i) / m; if (!inside(x, y) && !RING.some(([dx, dy]) => inside(x + dx * far, y + dy * far) || inside(x + dx * far * 0.5, y + dy * far * 0.5))) return true; }
    return false;
  };
  const along = (st, t) => { let j = 1; while (j < st.s.length - 1 && st.s[j] < t) j++; const f = (t - st.s[j - 1]) / (st.s[j] - st.s[j - 1] || 1); return [st.q[j - 1][0] + (st.q[j][0] - st.q[j - 1][0]) * f, st.q[j - 1][1] + (st.q[j][1] - st.q[j - 1][1]) * f]; };
  // (branches before their trunk, deepest first: the needle goes on to the trunk through rows still to sew)
  const order = [], done = new Set();
  const visit = (r) => { if (done.has(r)) return; done.add(r); for (const q of regions) if (q.of === r) visit(q); order.push(r); };
  for (const r of regions) if (!r.of) visit(r);
  for (const r of regions) visit(r);
  const paths = [];
  for (const reg of order) {
    let cur = [];
    paths.push(cur);
    for (const st of reg.rows) {
      const off = (FILL_PATTERNS[pattern] || FILL_PATTERNS.tatami).off(st.k) * L, a = st.s0, b = st.s1, line = [a];
      for (let t = a + off + (off < 0.3 * L ? L : 0); t < b; t += L) if (t - a > L * 0.3 && b - t > L * 0.3) line.push(t);
      line.push(b);
      for (let i = line.length - 1; i > 0; i--) if (line[i] - line[i - 1] > TATAMI.loose * res) line.splice(i, 0, (line[i] + line[i - 1]) / 2);
      // (whichever way round starts nearer the needle)
      let ps = line.map((t) => along(st, t));
      const end = cur[cur.length - 1];
      if (end && Math.hypot(ps[ps.length - 1][0] - end[0], ps[ps.length - 1][1] - end[1]) < Math.hypot(ps[0][0] - end[0], ps[0][1] - end[1])) ps = ps.reverse();
      if (end && leaves(end, ps[0])) { cur = []; paths.push(cur); }
      const z = cur[cur.length - 1], m = z ? Math.ceil(Math.hypot(ps[0][0] - z[0], ps[0][1] - z[1]) / (3 * res)) : 1;
      for (let i = 1; i < m; i++) cur.push([z[0] + ((ps[0][0] - z[0]) * i) / m, z[1] + ((ps[0][1] - z[1]) * i) / m]);
      cur.push(...ps);
    }
  }
  let ends = 0;
  for (const k of ks) ends += rows.get(k).length;
  return { paths: paths.filter((p) => p.length), sections: regions.length, ends: (ends * sp) / 0.5, fd };
}
// opts.pull: how far each row runs past the outline at both ends (mm; the fabric's, core/recipes.js FILLS)
// opts.cover: mm inside the first outline that a border sewn later covers (a patch's satin edge reaches 1.2 mm over
// its fill): travel there is hidden whatever is sewn already, so a section stranded behind finished rows is reached
// round the edge and not by a trim (a carved heart patch: a 27 mm trim between two parts of one region)
// opts.raster: rows read off the 8 px/mm drawing, as every fill was until 2026-11 (the Open tab's re-stitching: its
// outlines are traced from a drawing of the file's stitches already, stair-stepped)
// opts.stitch: the rows' stitch length (mm)
// opts.underlay: true (an edge run and rows across), "edge" or "rows" (only that one), false (none)
// opts.grid (mm): rows on the lines grid + (k + 0.5) x density across them (in the shape's own coordinates), so two
// fills whose grids agree have rows that line up: a piece with its own settings passes where the design's origin
// puts them (studio/settings.js `fillOpts`). Without it the first row lies half a row in from the shape's edge.
// Not with `share` (a blend's rows are spaced unevenly) nor rings.
export function fillPolygon(poly, { angle = FILL.angle, density = ROWS.solid, res = FILL.res, inset = 0, pattern = "tatami", share = null, underlay = true, pull = FILLS.cotton.pull, raster = false, cover = 0, stitch = TATAMI.stitch, grid = null } = {}) {
  const loops = Array.isArray(poly[0][0]) ? poly : [poly];
  const shape = shaped(loops, inset, res), { x0, y0, mask, labels, count, parts } = shape, paths = [];
  const toMm = (p) => p.map(([x, y]) => [x0 + (x + 0.5) / res, y0 + (y + 0.5) / res]);
  if (raster) {
    for (let id = 1; id <= count; id++) {
      const comp = { id, labels, dt: shape.dt, pixels: parts[id] };
      if (comp.pixels.length < 1.5 * res * res) continue;
      // (angle "auto": the part's own, `formPick`, through comp.form as a picture's)
      if (angle === "auto") comp.form = FILL.angle;
      const a = angle === "auto" ? FILL.angle : angle;
      const under = underlay ? tatami(mask, comp, res, { angle: a + 90, spacing: 2.5, stitch: 3, inset: 0.4, pull: 0 }) : [];
      const fill = tatami(mask, comp, res, { angle: a, spacing: density, stitch, pull: 0.15, pattern, share });
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
  // (angle "auto": each part's own, `formPick`, its rows worked out part by part below; no shared grid)
  const auto = angle === "auto", under = (a) => (underlay && underlay !== "edge" ? exactRows(px, shape, res, { angle: a + 90, spacing: UNDER.rows, inset: inset + UNDER.inset, pull: 0 }) : null);
  const across = auto ? null : under(angle);
  // (rings: not a blend's layers, which thin out across the shape as only rows can)
  const rings = !!FILL_PATTERNS[pattern]?.rings && !share;
  // (the grid in the drawing's pixels: px = (mm - x0, y0) x res - 0.5)
  const th = auto ? 0 : (angle * Math.PI) / 180, gV = [-Math.sin(th), Math.cos(th)];
  const gridPx = grid == null || share || auto ? null : res * (grid - gV[0] * x0 - gV[1] * y0) - 0.5 * (gV[0] + gV[1]);
  const along = rings || auto ? null : exactRows(px, shape, res, { angle, spacing: density, inset, pull, share, grid: gridPx });
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
    const edge = underlay && underlay !== "rows" ? edgeRuns(px, comp, mask, res, UNDER.inset * res, UNDER.run) : [];
    // (sections taken strictly in row order, each from its first row: going to whichever end of the first was nearer
    // sewed it backwards and stranded the rest behind it, 275 parts against 184 over 164 test shapes; each part is a
    // trim. Where that still leaves parts, the sweep from the far side is tried too and the fewer kept: 30 motifs at
    // 20 mm, 56 parts -> 49)
    // (travel may use the inset band too: the satin the inset is there for covers it. A 20 mm snowflake's arms are
    // 1 mm wide once inset, too thin for the router's 0.5 mm cells to join up)
    const cell = inset ? (x, y) => (labels[y * mask.w + x] === id ? (band && band[y * mask.w + x] ? 2 : 1) : shape.whole[y * mask.w + x] ? 2 : 0)
      : band ? (x, y) => (labels[y * mask.w + x] === id ? (band[y * mask.w + x] ? 2 : 1) : 0) : null;
    let A = along, C = across, curved = null;
    if (auto) {
      const f = formPick(comp, mask, res, FILL.angle, rings || share ? null : shape.dt, density);
      C = under(f.angle); A = rings ? null : exactRows(px, shape, res, { angle: f.angle, spacing: density, inset, pull, share });
      // (curved rows are cut by the drawing, 0.125 mm a pixel, where straight rows are cut by the outline itself)
      if (f.field) curved = curvedRows(comp, mask, res, shape.dt, { spacing: density, stitch, pull, pattern, fd: f.field, inside: (x, y) => { const X = Math.round(x), Y = Math.round(y); return X >= 0 && Y >= 0 && X < mask.w && Y < mask.h && labels[Y * mask.w + X] === id; } });
    }
    if (rings) { paths.push(...ringFill(px, shape, comp, res, { spacing: density, edge, across: C ? of(C, id, UNDER.stitch, "tatami") : [], cell }).map(toMm)); continue; }
    const groups = [edge, C ? of(C, id, UNDER.stitch, "tatami") : [], curved ? curved.paths : of(A, id, stitch, pattern)];
    let best = routeFill(groups, comp, mask, res, undefined, undefined, true, 1, cell);
    if (best.length > 1) {
      const other = routeFill([edge, groups[1], groups[2].map((p) => p.slice().reverse()).reverse()], comp, mask, res, undefined, undefined, true, 1, cell);
      if (other.length < best.length) best = other;
    }
    // (curved rows that still end in more parts than straight rows at the part's own angle: the straight rows)
    if (curved && best.length > 1) {
      const flat = routeFill([edge, groups[1], of(A, id, stitch, pattern)], comp, mask, res, undefined, undefined, true, 1, cell);
      if (flat.length < best.length) best = flat;
    }
    paths.push(...best.map(toMm));
  }
  return paths;
}
// (testing only: tests measure the readings and the rows they give)
export const formTest = { rowsAt, traceComp, readings, rowField, curvedRows, fieldLines };
