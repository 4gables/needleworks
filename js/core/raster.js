// Binary-image tools: thinning, distance transform, labelling, and skeleton -> stroke graph.
// A mask is { w, h, data: Uint8Array } with 1 = ink.
import { smooth } from "./geom.js";

export function makeMask(w, h) { return { w, h, data: new Uint8Array(w * h) }; }

// Zhang-Suen thinning (what skimage.skeletonize does for 2-D)
export function skeletonize(m) {
  const { w, h } = m, d = m.data.slice();
  // work only inside the ink bounding box
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[y * w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { w, h, data: d };
  x0 = Math.max(1, x0); y0 = Math.max(1, y0); x1 = Math.min(w - 2, x1); y1 = Math.min(h - 2, y1);
  const del = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (!d[i]) continue;
        const p2 = d[i - w], p3 = d[i - w + 1], p4 = d[i + 1], p5 = d[i + w + 1],
          p6 = d[i + w], p7 = d[i + w - 1], p8 = d[i - 1], p9 = d[i - w - 1];
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
        if (A !== 1) continue;
        if (pass === 0 ? (p2 && p4 && p6) || (p4 && p6 && p8) : (p2 && p4 && p8) || (p2 && p6 && p8)) continue;
        del.push(i);
      }
      if (del.length) { changed = true; for (const i of del) d[i] = 0; }
    }
  }
  return { w, h, data: d };
}

// exact Euclidean distance transform (Felzenszwalb & Huttenlocher), distance to nearest 0 pixel
export function distanceTransform(m) {
  const { w, h, data } = m, INF = 1e20, f = new Float64Array(Math.max(w, h));
  const g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = data[i] ? INF : 0;
  const v = new Int32Array(Math.max(w, h)), z = new Float64Array(Math.max(w, h) + 1), dd = new Float64Array(Math.max(w, h));
  const pass = (n, get, set) => {
    for (let q = 0; q < n; q++) f[q] = get(q);
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s;
      for (;;) {
        const r = v[k];
        s = (f[q] + q * q - (f[r] + r * r)) / (2 * q - 2 * r);
        if (s <= z[k] && k > 0) k--; else break;
      }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = v[k]; dd[q] = (q - r) * (q - r) + f[r]; }
    for (let q = 0; q < n; q++) set(q, dd[q]);
  };
  for (let x = 0; x < w; x++) pass(h, (y) => g[y * w + x], (y, val) => { g[y * w + x] = val; });
  for (let y = 0; y < h; y++) pass(w, (x) => g[y * w + x], (x, val) => { g[y * w + x] = val; });
  for (let i = 0; i < w * h; i++) g[i] = Math.sqrt(g[i]);
  return g;
}

// 8-connected components. Returns { labels: Int32Array (0 = background), count }
export function label(m, sel = null) {
  const { w, h, data } = m, labels = new Int32Array(w * h), stack = [];
  let count = 0;
  for (let s = 0; s < w * h; s++) {
    if (!data[s] || labels[s] || (sel && !sel[s])) continue;
    count++; labels[s] = count; stack.push(s);
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (data[j] && !labels[j] && (!sel || sel[j])) { labels[j] = count; stack.push(j); }
      }
    }
  }
  return { labels, count };
}

const NB = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]; // [dy, dx]

// skeleton pixels -> nodes (clustered junctions / endpoints) and edges (pixel paths as [x, y])
export function skeletonGraph(sk) {
  const { w, h, data } = sk, N = w * h;
  const has = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x];
  const deg = new Uint8Array(N), nodeMask = new Uint8Array(N);
  const pix = [];
  for (let i = 0; i < N; i++) if (data[i]) {
    pix.push(i);
    const x = i % w, y = (i - x) / w;
    let k = 0; for (const [dy, dx] of NB) if (has(x + dx, y + dy)) k++;
    deg[i] = k; if (k !== 2) nodeMask[i] = 1;
  }
  const { labels } = label(sk, nodeMask);
  const nodeOf = new Int32Array(N).fill(-1);
  let n = 0;
  for (const i of pix) if (labels[i]) { nodeOf[i] = labels[i] - 1; n = Math.max(n, labels[i]); }
  const used = new Set(), key = (a, b) => a * N + b;
  const onEdge = new Uint8Array(N), edges = [];

  const walk = (start, first) => {
    const path = [start, first];
    used.add(key(start, first)); used.add(key(first, start));
    let prev = start, cur = first;
    while (nodeOf[cur] < 0) {
      const cx = cur % w, cy = (cur - cx) / w;
      let best = -1, bestD = 9;
      for (const [dy, dx] of NB) {
        const q = (cy + dy) * w + (cx + dx);
        if (!has(cx + dx, cy + dy) || q === prev || used.has(key(cur, q))) continue;
        const dd = Math.abs(dy) + Math.abs(dx);   // prefer orthogonal steps
        if (dd < bestD) { bestD = dd; best = q; }
      }
      if (best < 0) break;
      used.add(key(cur, best)); used.add(key(best, cur));
      path.push(best); prev = cur; cur = best;
    }
    return path;
  };

  for (const p of pix) {
    if (nodeOf[p] < 0) continue;
    const px = p % w, py = (p - px) / w;
    for (const [dy, dx] of NB) {
      if (!has(px + dx, py + dy)) continue;
      const q = (py + dy) * w + (px + dx);
      if (used.has(key(p, q)) || nodeOf[q] === nodeOf[p]) continue;
      const path = walk(p, q);
      let end = nodeOf[path[path.length - 1]];
      if (end < 0) { end = n++; nodeOf[path[path.length - 1]] = end; }
      edges.push([nodeOf[p], end, path]);
      for (const i of path) onEdge[i] = 1;
    }
  }
  // closed loops with no junctions
  for (const p of pix) {
    if (onEdge[p] || nodeOf[p] >= 0) continue;
    nodeOf[p] = n;
    const px = p % w, py = (p - px) / w;
    for (const [dy, dx] of NB) if (has(px + dx, py + dy)) {
      const path = walk(p, (py + dy) * w + px + dx);
      edges.push([n, n, path]); for (const i of path) onEdge[i] = 1;
      break;
    }
    n++;
  }
  const sum = new Map();
  for (const i of pix) if (nodeOf[i] >= 0) {
    const k = nodeOf[i], s = sum.get(k) || [0, 0, 0];
    s[0] += i % w; s[1] += Math.floor(i / w); s[2]++; sum.set(k, s);
  }
  const pos = new Map();
  for (const [k, s] of sum) pos.set(k, [s[0] / s[2], s[1] / s[2]]);
  return { pos, edges: edges.map(([a, b, path]) => [a, b, path.map((i) => [i % w, Math.floor(i / w)])]) };
}

// drop short spurs, merge pass-through nodes
export function prune(edges, minLen) {
  edges = edges.slice();
  for (;;) {
    const deg = new Map(), inc = new Map();
    edges.forEach((e, i) => {
      for (const k of [e[0], e[1]]) { deg.set(k, (deg.get(k) || 0) + 1); }
      for (const k of new Set([e[0], e[1]])) { if (!inc.has(k)) inc.set(k, []); inc.get(k).push(i); }
    });
    const spur = edges.findIndex(([a, b, p]) => a !== b && p.length < minLen &&
      ((deg.get(a) === 1 && deg.get(b) >= 3) || (deg.get(b) === 1 && deg.get(a) >= 3)));
    if (spur >= 0) { edges.splice(spur, 1); continue; }
    let merged = false;
    for (const [k, d] of deg) {
      const ek = inc.get(k);
      if (d === 2 && ek.length === 2) {
        const e1 = edges[ek[0]], e2 = edges[ek[1]];
        const p1 = e1[1] === k ? e1[2] : e1[2].slice().reverse(), o1 = e1[1] === k ? e1[0] : e1[1];
        const p2 = e2[0] === k ? e2[2] : e2[2].slice().reverse(), o2 = e2[0] === k ? e2[1] : e2[0];
        edges = edges.filter((_, i) => i !== ek[0] && i !== ek[1]);
        edges.push([o1, o2, p1.concat(p2.slice(1))]);
        merged = true; break;
      }
    }
    if (!merged) return edges;
  }
}

// centerline strokes of a mask, smoothed: [[a, b, [[x, y], ...]]] in pixels
export function skeletonEdges(mask, stroke) {
  const { pos, edges } = skeletonGraph(skeletonize(mask));
  return prune(edges, stroke * 1.3).map(([a, b, path]) => {
    const pts = path.map((q) => q.slice());
    pts[0] = pos.get(a).slice(); pts[pts.length - 1] = pos.get(b).slice();
    return [a, b, smooth(pts, Math.max(3, Math.floor(stroke * 0.8) | 1))];
  });
}

export function strokeWidth(mask) {
  const dt = distanceTransform(mask), sk = skeletonize(mask), vals = [];
  for (let i = 0; i < sk.data.length; i++) if (sk.data[i]) vals.push(dt[i]);
  vals.sort((a, b) => a - b);
  return vals.length ? 2 * vals[Math.floor(vals.length / 2)] : 1;
}

// Euler-style walk: each stroke is a centre run on the way out and a satin back over it,
// so a connected shape is stitched with no jumps. Returns [[[pts, "run"|"satin"], ...] per component]
export function order(edges) {
  const adj = new Map();
  edges.forEach(([a, b], i) => {
    if (!adj.has(a)) adj.set(a, []); adj.get(a).push(i);
    if (b !== a) { if (!adj.has(b)) adj.set(b, []); adj.get(b).push(i); }
  });
  const used = new Array(edges.length).fill(false), comps = [];
  while (used.some((u) => !u)) {
    let bi = -1, bx = Infinity;
    edges.forEach((e, i) => {
      if (used[i]) return;
      const x = Math.min(e[2][0][0], e[2][e[2].length - 1][0]);
      if (x < bx) { bx = x; bi = i; }
    });
    const [a, b, p] = edges[bi];
    const start = p[0][0] <= p[p.length - 1][0] ? a : b;
    const seq = [], stack = [{ u: start, k: 0, back: null }];
    while (stack.length) {
      const fr = stack[stack.length - 1], list = adj.get(fr.u) || [];
      let next = -1;
      while (fr.k < list.length) { const i = list[fr.k++]; if (!used[i]) { next = i; break; } }
      if (next < 0) { stack.pop(); if (fr.back) seq.push([fr.back, "satin"]); continue; }
      used[next] = true;
      const [ea, eb, ep] = edges[next];
      const fwd = ea === fr.u ? ep : ep.slice().reverse();
      seq.push([fwd, "run"]);
      stack.push({ u: ea === fr.u ? eb : ea, k: 0, back: fwd.slice().reverse() });
    }
    comps.push(seq);
  }
  return comps;
}
