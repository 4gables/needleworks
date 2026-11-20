/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Two plain operations on a grid of 0s and 1s ({ w, h, data }), read by the page too (a picture's separate parts)
// and so shipped in both builds; raster.js hands them on.

// exact Euclidean distance transform (Felzenszwalb & Huttenlocher), distance to nearest 0 pixel
export function distanceTransform(m) {
  const { w, h, data } = m, INF = 1e20, f = new Float64Array(Math.max(w, h));
  const g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = data[i] ? INF : 0;
  const v = new Int32Array(Math.max(w, h)), z = new Float64Array(Math.max(w, h) + 1), dd = new Float64Array(Math.max(w, h));
  // (one row or column of g: n values from `at`, `step` apart)
  const pass = (n, at, step) => {
    for (let q = 0; q < n; q++) f[q] = g[at + q * step];
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
    for (let q = 0; q < n; q++) g[at + q * step] = dd[q];
  };
  for (let x = 0; x < w; x++) pass(h, x, w);
  for (let y = 0; y < h; y++) pass(w, y * w, 1);
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
