// Picture -> embroidery. Reduce to a few thread colours, then stitch each shape by its width:
// hairlines get a double running stitch along their centre; every shape with width gets a solid tatami fill.
import { Design } from "./design.js";
import { run } from "./geom.js";
import { MARGIN } from "./machines.js";
import { distanceTransform, label, order, skeletonEdges } from "./raster.js";
import { nearestBrotherThread, rgbToHex } from "./threads.js";

export const DEFAULTS = {
  colors: 4,          // thread colours (not counting background)
  sizeMm: 100,        // longest side of the finished design
  removeBackground: true,
  fillAngle: 45,      // degrees
  density: 0.35,      // mm between fill rows (DENSITY.solid)
  res: 8,             // working pixels per mm (5 lost the narrow notches of small lettering, e.g. an M)
};

// fill row spacing in mm. Solid covers the fabric; standard is lighter and faster. 0.3 fails the PE900 check:
// the links between rows become stitches under 0.3 mm, which nest.
export const DENSITY = { solid: 0.35, standard: 0.4 };
// A colour's fill reaches this far (mm) under the colours sewn after it, so thread pull can't open a gap of fabric
// where two colours meet (digitizing guides: 0.2-0.4 mm).
const OVERLAP = 0.35;

// Gaps narrower than 0.5 mm between parts of one colour (between small letters, inside an M's notch) close up once
// sewn. Returns their area in mm²: a morphological closing of the colour, minus the colour, counted only where the
// fabric would show (not where another stitched colour fills the gap), ignoring corner tips.
const MIN_GAP = 0.5;
function narrowGaps(mask, res, open) {
  const { w, h, data } = mask, r = (MIN_GAP / 2) * res, n = w * h;
  const out = distanceTransform({ w, h, data: data.map((v) => 1 - v) });
  const dil = { w, h, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) dil.data[i] = data[i] || out[i] <= r ? 1 : 0;
  const inn = distanceTransform(dil), gap = { w, h, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) gap.data[i] = !data[i] && open(i) && inn[i] > r ? 1 : 0;
  // every sharp inside corner (an N's, a V's) narrows to a point: only a gap that stays narrow over a length counts
  const { labels, count } = label(gap), size = new Array(count + 1).fill(0);
  for (let i = 0; i < n; i++) size[labels[i]]++;
  let mm2 = 0;
  for (let c = 1; c <= count; c++) if (size[c] / (res * res) >= 0.3) mm2 += size[c] / (res * res);
  return mm2;
}

// ---------- colour ----------
function srgbToLab(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = f(r), G = f(g), B = f(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B,
    Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))];
}

// k-means (k-means++ seeding) on Lab colours of opaque pixels
function kmeans(lab, idxs, k, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const sample = idxs.length > 30000 ? Array.from({ length: 30000 }, () => idxs[Math.floor(rnd() * idxs.length)]) : idxs;
  const C = [lab.slice(sample[0] * 3, sample[0] * 3 + 3)];
  const d2 = (i, c) => { const a = lab[i * 3] - c[0], b = lab[i * 3 + 1] - c[1], e = lab[i * 3 + 2] - c[2]; return a * a + b * b + e * e; };
  while (C.length < k) {
    const ds = sample.map((i) => Math.min(...C.map((c) => d2(i, c))));
    const tot = ds.reduce((a, b) => a + b, 0);
    if (tot === 0) break;
    let r = rnd() * tot, j = 0;
    while (r > ds[j] && j < ds.length - 1) r -= ds[j++];
    C.push(lab.slice(sample[j] * 3, sample[j] * 3 + 3));
  }
  for (let it = 0; it < 15; it++) {
    const sum = C.map(() => [0, 0, 0, 0]);
    for (const i of sample) {
      let best = 0, bd = Infinity;
      C.forEach((c, j) => { const v = d2(i, c); if (v < bd) { bd = v; best = j; } });
      const t = sum[best]; t[0] += lab[i * 3]; t[1] += lab[i * 3 + 1]; t[2] += lab[i * 3 + 2]; t[3]++;
    }
    sum.forEach((t, j) => { if (t[3]) C[j] = [t[0] / t[3], t[1] / t[3], t[2] / t[3]]; });
  }
  return C;
}

// ---------- quantise the picture into colour regions ----------
export function analyze(img, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const { width: w, height: h, data } = img;
  const n = w * h, lab = new Float32Array(n * 3), opaque = [];
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] < 128) continue;
    const L = srgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    lab[i * 3] = L[0]; lab[i * 3 + 1] = L[1]; lab[i * 3 + 2] = L[2];
    opaque.push(i);
  }
  const hasAlpha = opaque.length < n * 0.98;
  const k = Math.max(1, o.colors + (o.removeBackground && !hasAlpha ? 1 : 0));
  // learn colours from flat pixels only: anti-aliased edges blend two colours and would steal a thread
  const flat = opaque.filter((i) => {
    const x = i % w;
    if (x === 0 || x === w - 1 || i < w || i >= n - w) return true;
    let m = 0;
    for (const j of [i - 1, i + 1, i - w, i + w]) {
      const a = lab[i * 3] - lab[j * 3], b = lab[i * 3 + 1] - lab[j * 3 + 1], e = lab[i * 3 + 2] - lab[j * 3 + 2];
      m = Math.max(m, a * a + b * b + e * e);
    }
    return m < 36;   // ΔE < 6 to every neighbour
  });
  const train = flat.length > opaque.length * 0.2 ? flat : opaque;
  // more clusters than the picture has colours split one colour into near-identical shades: merge those
  const C = [];
  for (const c of kmeans(lab, train, Math.min(k, Math.max(1, train.length))))
    if (!C.some((d) => (c[0] - d[0]) ** 2 + (c[1] - d[1]) ** 2 + (c[2] - d[2]) ** 2 < 36)) C.push(c);   // ΔE < 6
  let labels = new Int16Array(n).fill(-1);
  for (const i of opaque) {
    let best = 0, bd = Infinity;
    C.forEach((c, j) => {
      const a = lab[i * 3] - c[0], b = lab[i * 3 + 1] - c[1], e = lab[i * 3 + 2] - c[2], v = a * a + b * b + e * e;
      if (v < bd) { bd = v; best = j; }
    });
    labels[i] = best;
  }
  // fold sliver clusters (usually anti-aliased edges) into the nearest real colour
  {
    // a fringe cluster is almost all edge: few of its pixels have 4 neighbours of the same colour
    const cnt = new Array(C.length).fill(0), inner = new Array(C.length).fill(0);
    for (const i of opaque) {
      const l = labels[i], x = i % w;
      cnt[l]++;
      if (x > 0 && x < w - 1 && i >= w && i < n - w &&
        labels[i - 1] === l && labels[i + 1] === l && labels[i - w] === l && labels[i + w] === l) inner[l]++;
    }
    const tiny = new Set(cnt.map((c, j) => (c < opaque.length * 0.0005 || inner[j] < c * 0.2 ? j : -1)).filter((j) => j >= 0));
    if (tiny.size && tiny.size < C.length) {
      const keep = C.map((_, j) => j).filter((j) => !tiny.has(j));
      for (const i of opaque) {
        if (!tiny.has(labels[i])) continue;
        let best = keep[0], bd = Infinity;
        for (const j of keep) {
          const a = lab[i * 3] - C[j][0], b = lab[i * 3 + 1] - C[j][1], e = lab[i * 3 + 2] - C[j][2], v = a * a + b * b + e * e;
          if (v < bd) { bd = v; best = j; }
        }
        labels[i] = best;
      }
    }
  }
  // majority filter cleans anti-aliased fringes and speckle
  for (let pass = 0; pass < 2; pass++) {
    const out = labels.slice(), cnt = new Int16Array(C.length + 1);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      cnt.fill(0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cnt[labels[(y + dy) * w + x + dx] + 1]++;
      let best = 0; for (let j = 1; j < cnt.length; j++) if (cnt[j] > cnt[best]) best = j;
      if (cnt[best] >= 5) out[y * w + x] = best - 1;
    }
    labels = out;
  }
  // background = most common colour along the border (only when the picture has no transparency)
  let bg = -1;
  if (o.removeBackground && !hasAlpha) {
    const cnt = new Map();
    const add = (i) => { if (labels[i] >= 0) cnt.set(labels[i], (cnt.get(labels[i]) || 0) + 1); };
    for (let x = 0; x < w; x++) { add(x); add((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { add(y * w); add(y * w + w - 1); }
    bg = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
  }
  // shades of the background (a white box on an off-white page, paper texture) are background too
  const isBg = (j) => bg >= 0 && (j === bg || (C[j][0] - C[bg][0]) ** 2 + (C[j][1] - C[bg][1]) ** 2 + (C[j][2] - C[bg][2]) ** 2 < 64);   // ΔE < 8: a pale design colour is further off
  const area = new Array(C.length).fill(0), rgb = C.map(() => [0, 0, 0]);
  for (let i = 0; i < n; i++) {
    const l = labels[i]; if (l < 0) continue;
    area[l]++; rgb[l][0] += data[i * 4]; rgb[l][1] += data[i * 4 + 1]; rgb[l][2] += data[i * 4 + 2];
  }
  const colors = C.map((c, j) => {
    const col = area[j] ? rgb[j].map((v) => Math.round(v / area[j])) : [0, 0, 0];
    const hex = rgbToHex(col);
    return { id: j, hex, lightness: c[0], area: area[j], background: isBg(j), thread: nearestBrotherThread(hex) };
  });
  return { w, h, labels, colors };
}

// ---------- fills ----------
function tatami(mask, comp, res, { angle, spacing, stitch, inset = 0, pull = 0.15 }) {
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
  for (let v = v0 + sp / 2, r = 0; v <= v1; v += sp, r++) {
    const ivs = [];
    let start = null;
    for (let u = u0 - 1; u <= u1 + 1; u += step) {
      const x = u * U[0] + v * V[0], y = u * U[1] + v * V[1], ins = inside(x, y);
      if (ins && start === null) start = u;
      if (!ins && start !== null) { ivs.push([start - pull * res, u - step + pull * res]); start = null; }
    }
    if (start !== null) ivs.push([start, u1]);
    rows.push({ v, r, ivs: ivs.filter(([a, b]) => b - a >= 0.6 * res) });
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
      const fwd = k % 2 === 0, off = ((row.r % 4) * L) / 4, line = [a];
      for (let u = Math.ceil((a - off) / L) * L + off; u < b; u += L) if (u - a > L * 0.3 && b - u > L * 0.3) line.push(u);
      line.push(b);
      const pts = (fwd ? line : line.reverse()).map((u) => toXY(u, row.v)), cur = paths[paths.length - 1];
      if (cur.length && leaves(cur[cur.length - 1], pts[0])) paths.push(pts); else cur.push(...pts);
    });
    return paths;
  });
}

// Sew a fill's sections in one go: between sections the needle travels inside the shape, through rows not sewn
// yet, so the fill covers the travel (Ink/Stitch's tatami travel, heatstitch's travel grid). It only jumps (and
// trims) when every way would lie on top of finished rows for more than 2 mm. groups: [underlay paths, fill
// paths] in px; the underlay is covered by the fill, so travel over it is hidden too.
function routeFill(groups, comp, mask, res) {
  const { w } = mask, C = Math.max(1, Math.round(res * 0.5));   // 0.5 mm routing cells
  const gw = Math.ceil(mask.w / C), gh = Math.ceil(mask.h / C), n = gw * gh;
  const inside = new Uint8Array(n), sewn = new Uint8Array(n), trod = new Uint8Array(n);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const x = Math.min(mask.w - 1, gx * C + (C >> 1)), y = Math.min(mask.h - 1, gy * C + (C >> 1));
    inside[gy * gw + gx] = comp.labels[y * w + x] === comp.id ? 1 : 0;
  }
  const cellOf = ([x, y]) => Math.min(gh - 1, Math.max(0, Math.floor(y / C))) * gw + Math.min(gw - 1, Math.max(0, Math.floor(x / C)));
  const centre = (c) => [(c % gw) * C + C / 2, Math.floor(c / gw) * C + C / 2];
  const along = (a, b, f) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (C / 2)));
    for (let k = 0; k <= steps; k++) f(cellOf([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]));
  };
  const markSewn = (p) => { for (let i = 1; i < p.length; i++) along(p[i - 1], p[i], (c) => (sewn[c] = 1)); };
  // A* over 8-neighbour cells; finished rows cost 6x so travel hides under rows still to come
  // row ends sit on (or a pull-compensation past) the edge: start from the nearest cell inside
  const snap = (c) => {
    if (inside[c]) return c;
    const cx = c % gw, cy = (c - cx) / gw;
    let best = -1, bd = Infinity;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx, y = cy + dy, m = y * gw + x;
      if (x >= 0 && y >= 0 && x < gw && y < gh && inside[m] && dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = m; }
    }
    return best;
  };
  function route(a, b) {
    const s = snap(cellOf(a)), t = snap(cellOf(b));
    if (s < 0 || t < 0) return null;
    const g = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), heap = [[0, s]];
    const hx = (c) => Math.hypot((c % gw) - (t % gw), Math.floor(c / gw) - Math.floor(t / gw));
    g[s] = 0;
    while (heap.length) {
      let bi = 0; for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i;
      const [, c] = heap[bi]; heap[bi] = heap[heap.length - 1]; heap.pop();
      if (c === t) break;
      const cx = c % gw, cy = (c - cx) / gw;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
        const m = y * gw + x; if (!inside[m]) continue;
        // each earlier travel through a cell costs more, so ways don't all funnel through one spot (needle hits pile up)
        const v = g[c] + Math.hypot(dx, dy) * ((sewn[m] ? 6 : 1) + 2 * trod[m]);
        if (v < g[m]) { g[m] = v; from[m] = c; heap.push([v + hx(m), m]); }
      }
      if (heap.length > 20000) return null;
    }
    if (from[t] < 0 && s !== t) return null;
    const cells = [t]; while (cells[cells.length - 1] !== s) cells.push(from[cells[cells.length - 1]]);
    cells.reverse();
    let sewnMm = 0;
    for (let i = 1; i < cells.length; i++) if (sewn[cells[i]]) sewnMm += Math.hypot((cells[i] % gw) - (cells[i - 1] % gw), Math.floor(cells[i] / gw) - Math.floor(cells[i - 1] / gw)) * C / res;
    // pull the staircase straight where a straight line stays inside (and off finished rows if the route was)
    const ok = (p, q) => { let good = true; along(p, q, (c) => { if (!inside[c] || (sewn[c] && !sewnMm)) good = false; }); return good; };
    const pts = [a], cs = cells.map(centre); let i = 0;
    while (i < cs.length - 1) { let j = cs.length - 1; while (j > i + 1 && !ok(pts[pts.length - 1], cs[j])) j--; pts.push(cs[j]); i = j; }
    pts.push(b);
    return { pts, sewnMm };
  }
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
      if (cur) search: for (let i = 0; i < left.length; i++) for (const back of [false, true]) {
        const q = back ? left[i][left[i].length - 1] : left[i][0];
        if (Math.hypot(q[0] - cur[0], q[1] - cur[1]) <= res) { k = i; r = null; rev = back; break search; }
        const ri = route(cur, q);
        if (i === 0 && !back) r = ri;
        if (ri && ri.sewnMm <= 2) { k = i; r = ri; rev = back; break search; }
      }
      let p = left.splice(k, 1)[0]; if (rev) p = p.slice().reverse();
      const d = cur ? Math.hypot(p[0][0] - cur[0], p[0][1] - cur[1]) : Infinity;
      // within 1 mm: sew straight on (skipping a first point that would make a stitch under 0.4 mm)
      if (cur && d <= res) out[out.length - 1].push(...(d < 0.4 * res ? p.slice(1) : p));
      else {
        if (r && r.sewnMm <= 2) {
          // travel stitches up to 2.5 mm, none under 0.6 mm (it ends exactly on the section's first point)
          const travel = [];
          let at = cur;
          for (let k = 1; k < r.pts.length; k++) {
            const [ax, ay] = r.pts[k - 1], [bx, by] = r.pts[k], m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (2.5 * res)));
            for (let q = 1; q <= m; q++) {
              const t = [ax + ((bx - ax) * q) / m, ay + ((by - ay) * q) / m];
              if (Math.hypot(t[0] - at[0], t[1] - at[1]) >= 0.6 * res) { travel.push(t); at = t; }
            }
          }
          while (travel.length && Math.hypot(travel[travel.length - 1][0] - p[0][0], travel[travel.length - 1][1] - p[0][1]) < 0.6 * res) travel.pop();
          for (let k = 1; k < r.pts.length; k++) along(r.pts[k - 1], r.pts[k], (c) => (trod[c] = Math.min(255, trod[c] + 1)));
          out[out.length - 1].push(...travel, ...p);
        } else out.push(p.slice());
      }
      if (gi === groups.length - 1) markSewn(p);
      cur = p[p.length - 1];
    }
  });
  return out;
}

// ---------- build ----------
// Fill edges and satin outlines reach a little past the picture, so a picture sized to the hoop's edge can land
// just over it; shrink to fit (more pixels per mm) rather than refuse.
export function digitize(img, analysis, opts = {}) {
  let res = opts.res || DEFAULTS.res;
  for (let tries = 0; ; tries++) {
    try { return build(img, analysis, { ...opts, res }); }
    catch (e) { if (!e.overBy || tries === 3) throw e; res *= e.overBy * 1.01; }
  }
}

function build(img, analysis, opts) {
  const o = { ...DEFAULTS, ...opts };
  const { w, h, labels, colors } = analysis;
  const res = o.res;
  const hoop = o.hoop;
  const cx = w / 2, cy = h / 2, toMm = (p) => p.map(([x, y]) => [(x - cx) / res, (y - cy) / res]);
  const d = new Design(hoop);
  const used = colors.filter((c) => !c.background && c.area > 0 && !(o.skip || []).includes(c.id))
    .sort((a, b) => b.lightness - a.lightness);   // light first, dark details on top
  const summary = [], stitched = new Set(used.map((c) => c.id));
  const fine = { narrowMm2: 0, hairlines: 0 };   // details too small to stitch cleanly (shown as a hint)
  for (const [k, col] of used.entries()) {
    const mask = { w, h, data: new Uint8Array(w * h) };
    for (let i = 0; i < w * h; i++) mask.data[i] = labels[i] === col.id ? 1 : 0;
    fine.narrowMm2 += narrowGaps(mask, res, (i) => !stitched.has(labels[i]));
    const own = distanceTransform(mask);   // the colour's own shapes, for their widths
    const minPx = 1.5 * res * res;   // ignore specks under 1.5 mm²
    // Each shape grows under the colours sewn later (they cover the join), never into the background or an
    // earlier colour. Specks go first, and shapes grow apart: merged, scattered specks would fill the colour above
    // them, and a bridge between two shapes funnels every fill travel through it.
    const later = new Set(used.slice(k + 1).map((c) => c.id));
    const { labels: cl, count } = label(mask);
    if (later.size) {
      const size = new Int32Array(count + 1);
      for (let i = 0; i < w * h; i++) size[cl[i]]++;
      const src = new Int32Array(w * h).fill(-1), R = OVERLAP * res;
      let front = [];
      for (let i = 0; i < w * h; i++) {
        if (cl[i] && size[cl[i]] < minPx) { cl[i] = 0; mask.data[i] = 0; }
        else if (cl[i]) { src[i] = i; front.push(i); }
      }
      const near = (j) => { const x = j % w; return [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w].filter((q) => q >= 0 && q < w * h); };
      while (front.length) {
        const next = [];
        for (const i of front) for (const j of near(i)) {
          if (cl[j] || !later.has(labels[j])) continue;
          const s0 = src[i], dx = (j % w) - (s0 % w), dy = Math.floor(j / w) - Math.floor(s0 / w);
          if (dx * dx + dy * dy > R * R || near(j).some((q) => cl[q] && cl[q] !== cl[i])) continue;
          cl[j] = cl[i]; src[j] = s0; mask.data[j] = 1; next.push(j);
        }
        front = next;
      }
    }
    // neighbouring colours alternate the row direction so their joins don't open into one seam
    const angle = o.fillAngle + (k % 2) * 90;
    const dt = distanceTransform(mask);
    const comps = [];
    for (let id = 1; id <= count; id++) comps.push({ id, pixels: [], labels: cl, dt });
    for (let i = 0; i < w * h; i++) if (cl[i]) comps[cl[i] - 1].pixels.push(i);
    let blocks = [];
    for (const comp of comps) {
      const mine = comp.pixels.filter((i) => labels[i] === col.id);
      if (mine.length < minPx) continue;
      let maxDt = 0, sx = 0, sy = 0;
      for (const i of mine) { maxDt = Math.max(maxDt, own[i]); sx += i % w; sy += Math.floor(i / w); }
      const widthMm = (2 * maxDt) / res, centre = [sx / mine.length, sy / mine.length];
      // only hairlines follow a centre line; anything with width is a solid fill that matches its outline exactly
      if (widthMm < 1.0) {
        fine.hairlines++;
        const cm = { w, h, data: new Uint8Array(w * h) };
        for (const i of mine) cm.data[i] = 1;
        const edges = skeletonEdges(cm, Math.max(2, maxDt));
        if (!edges.length || edges.every((e) => e[2].length < 3)) {   // a dot: fill it instead
          blocks.push({ centre, paths: tatami(mask, comp, res, { angle, spacing: o.density, stitch: 3.5 }).map(toMm), kind: "fill" });
          continue;
        }
        const paths = [];
        for (const seq of order(edges)) for (const [p] of seq) {
          paths.push(run(toMm(p), 1.5));
        }
        blocks.push({ centre, paths, kind: "run" });
      } else {
        const under = tatami(mask, comp, res, { angle: angle + 90, spacing: 2.5, stitch: 3, inset: 0.4, pull: 0 });
        // pull compensation widens a fill past its edge; on thin letters that closes the gaps between them
        const fill = tatami(mask, comp, res, { angle, spacing: o.density, stitch: 3.5, pull: widthMm < 2 ? 0.05 : 0.15 });
        blocks.push({ centre, paths: routeFill([under, fill], comp, mask, res).map(toMm), kind: "fill" });
      }
    }
    if (!blocks.length) continue;
    // nearest-neighbour order between shapes of one colour keeps travel and trims down
    const ordered = [];
    let at = [0, 0];
    while (blocks.length) {
      let bi = 0, bd = Infinity;
      blocks.forEach((b, i) => { const v = Math.hypot(b.centre[0] - at[0], b.centre[1] - at[1]); if (v < bd) { bd = v; bi = i; } });
      const b = blocks.splice(bi, 1)[0]; ordered.push(b); at = b.centre;
    }
    d.color(col.hex, col.thread.name);
    // a short move to the next piece is sewn straight unless it would cross fabric this colour doesn't cover
    const covered = ([x, y]) => mask.data[Math.round(y * res + cy) * w + Math.round(x * res + cx)] === 1;
    // (fill rows end a little past the shape's edge, so the last 0.3 mm at each end isn't checked)
    const crosses = (a, b) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 0.2);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        if (t * L < 0.3 || (1 - t) * L < 0.3) continue;
        if (!covered([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return true;
      }
      return false;
    };
    // inside a fill, a move of more than 1 mm between sections would lie on top of finished stitches: jump it (trimmed)
    for (const b of ordered) for (const p of b.paths) if (p.length) {
      const far = !!d.cur && b.kind === "fill" && Math.hypot(p[0][0] - d.cur[0], p[0][1] - d.cur[1]) > 1.0;
      d.path(p, true, !!d.cur && (far || crosses(d.cur, p[0])));
    }
    summary.push({ ...col, shapes: ordered.length, kinds: [...new Set(ordered.map((b) => b.kind))] });
  }
  if (!d.stitches.length) throw new Error("Nothing to stitch. Try more colours or turn off background removal.");
  d.finish();
  return { design: d, summary, fine };
}

// fit the picture's longest side to sizeMm, capped by the hoop
export function workingSize(imgW, imgH, sizeMm, hoop, res = DEFAULTS.res) {
  const maxW = hoop.w - 2 * MARGIN - 2, maxH = hoop.h - 2 * MARGIN - 2;
  let s = sizeMm / Math.max(imgW, imgH);
  s = Math.min(s, maxW / imgW, maxH / imgH);
  return { wMm: imgW * s, hMm: imgH * s, w: Math.max(8, Math.round(imgW * s * res)), h: Math.max(8, Math.round(imgH * s * res)) };
}

// A filled shape (mm polygon, y down) as tatami stitches: underlay across, then the fill, like a picture's colour.
// Used by the Design tab's patches.
export function fillPolygon(poly, { angle = DEFAULTS.fillAngle, density = DENSITY.solid, res = DEFAULTS.res } = {}) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const x0 = Math.min(...xs) - 1, y0 = Math.min(...ys) - 1;
  const w = Math.ceil((Math.max(...xs) - x0 + 1) * res), h = Math.ceil((Math.max(...ys) - y0 + 1) * res);
  const mask = { w, h, data: new Uint8Array(w * h) };
  // even-odd scanline fill at pixel centres
  for (let y = 0; y < h; y++) {
    const Y = y0 + (y + 0.5) / res, cut = [];
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
      if ((ay <= Y) !== (by <= Y)) cut.push(ax + ((Y - ay) * (bx - ax)) / (by - ay));
    }
    cut.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cut.length; k += 2)
      for (let x = Math.max(0, Math.ceil((cut[k] - x0) * res - 0.5)); x < Math.min(w, Math.floor((cut[k + 1] - x0) * res - 0.5) + 1); x++) mask.data[y * w + x] = 1;
  }
  const { labels, count } = label(mask), dt = distanceTransform(mask), paths = [];
  const toMm = (p) => p.map(([x, y]) => [x0 + (x + 0.5) / res, y0 + (y + 0.5) / res]);
  for (let id = 1; id <= count; id++) {
    const comp = { id, labels, dt, pixels: [] };
    for (let i = 0; i < w * h; i++) if (labels[i] === id) comp.pixels.push(i);
    if (comp.pixels.length < 1.5 * res * res) continue;
    const under = tatami(mask, comp, res, { angle: angle + 90, spacing: 2.5, stitch: 3, inset: 0.4, pull: 0 });
    const fill = tatami(mask, comp, res, { angle, spacing: density, stitch: 3.5, pull: 0.15 });
    paths.push(...routeFill([under, fill], comp, mask, res).map(toMm));
  }
  return paths;
}
