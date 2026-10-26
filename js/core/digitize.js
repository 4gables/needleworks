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
  for (const col of used) {
    const mask = { w, h, data: new Uint8Array(w * h) };
    for (let i = 0; i < w * h; i++) mask.data[i] = labels[i] === col.id ? 1 : 0;
    fine.narrowMm2 += narrowGaps(mask, res, (i) => !stitched.has(labels[i]));
    const { labels: cl, count } = label(mask);
    const dt = distanceTransform(mask);
    const comps = [];
    for (let id = 1; id <= count; id++) comps.push({ id, pixels: [], labels: cl, dt });
    for (let i = 0; i < w * h; i++) if (cl[i]) comps[cl[i] - 1].pixels.push(i);
    const minPx = 1.5 * res * res;   // ignore specks under 1.5 mm²
    let blocks = [];
    for (const comp of comps) {
      if (comp.pixels.length < minPx) continue;
      let maxDt = 0, sx = 0, sy = 0;
      for (const i of comp.pixels) { maxDt = Math.max(maxDt, dt[i]); sx += i % w; sy += Math.floor(i / w); }
      const widthMm = (2 * maxDt) / res, centre = [sx / comp.pixels.length, sy / comp.pixels.length];
      // only hairlines follow a centre line; anything with width is a solid fill that matches its outline exactly
      if (widthMm < 1.0) {
        fine.hairlines++;
        const cm = { w, h, data: new Uint8Array(w * h) };
        for (const i of comp.pixels) cm.data[i] = 1;
        const edges = skeletonEdges(cm, Math.max(2, maxDt));
        if (!edges.length || edges.every((e) => e[2].length < 3)) {   // a dot: fill it instead
          blocks.push({ centre, paths: tatami(mask, comp, res, { angle: o.fillAngle, spacing: o.density, stitch: 3.5 }).map(toMm), kind: "fill" });
          continue;
        }
        const paths = [];
        for (const seq of order(edges)) for (const [p] of seq) {
          paths.push(run(toMm(p), 1.5));
        }
        blocks.push({ centre, paths, kind: "run" });
      } else {
        const under = tatami(mask, comp, res, { angle: o.fillAngle + 90, spacing: 2.5, stitch: 3, inset: 0.4, pull: 0 });
        // pull compensation widens a fill past its edge; on thin letters that closes the gaps between them
        const fill = tatami(mask, comp, res, { angle: o.fillAngle, spacing: o.density, stitch: 3.5, pull: widthMm < 2 ? 0.05 : 0.15 });
        blocks.push({ centre, paths: [...under, ...fill].map(toMm), kind: "fill" });
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
