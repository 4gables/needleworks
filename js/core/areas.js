/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// "Choose what is sewn": the person's taps, rub-outs and joins put onto a picture's colour map. The page draws the
// dialog with it and the engine sews with it (palette.js hands it on), so both builds ship it.

// One area: every pixel joined to pixel i (by a side) that has i's label takes the label `to`. Returns how many.
export function fillArea(labels, w, h, i, to) {
  const from = labels[i], n = w * h; if (from === to) return 0;
  const st = [i]; labels[i] = to; let c = 0;
  while (st.length) {
    const j = st.pop(), x = j % w; c++;
    for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w]) if (k >= 0 && k < n && labels[k] === from) { labels[k] = to; st.push(k); }
  }
  return c;
}

// What the person chose for single areas of the picture, in the order they chose it. No rule tells the page seen
// through a design (the gap between a mascot's legs) from the same colour meant as part of it (its white body), and
// `inside` is all of it or none: a tester's cougar had the gap between its back legs sewn white (2026-11). So the
// person taps the area: { x, y, sew } with x, y fractions of the learned copy. sew false: the sewn area under the
// point is left as fabric. sew true: the fabric under it (the background's colour; not see-through, which has no
// colour to sew) is sewn in the background's thread, the closed-in colour's (`inside`).
export function applyAreas(labels, w, h, areas, crop, model) {
  const fw = crop[2] - crop[0], fh = crop[3] - crop[1], n = w * h, bare = model.bg >= 0 ? model.bg : -1;
  const at = (q) => { const x = Math.floor(((q.x - crop[0]) / fw) * w), y = Math.floor(((q.y - crop[1]) / fh) * h); return x >= 0 && y >= 0 && x < w && y < h ? y * w + x : -1; };
  for (const a of areas) {
    // Rubbed out (`rub`: the brush's path, `r` its radius as a fraction of the copy's width): bare fabric under it.
    // A scan's speck, a signature, a shadow: nothing else removes one mark without changing the colours.
    if (a.rub) {
      const r = Math.max(0.5, (a.r / fw) * w), P = a.rub.map((q) => [((q[0] - crop[0]) / fw) * w, ((q[1] - crop[1]) / fh) * h]);
      for (let k = 0; k < P.length; k++) {
        const [ax, ay] = P[Math.max(0, k - 1)], [bx, by] = P[k], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
        for (let y = Math.max(0, Math.floor(Math.min(ay, by) - r)); y <= Math.min(h - 1, Math.ceil(Math.max(ay, by) + r)); y++)
          for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - r)); x <= Math.min(w - 1, Math.ceil(Math.max(ax, bx) + r)); x++) {
            const t = L2 ? Math.max(0, Math.min(1, ((x + 0.5 - ax) * vx + (y + 0.5 - ay) * vy) / L2)) : 0;
            if (Math.hypot(x + 0.5 - ax - t * vx, y + 0.5 - ay - t * vy) <= r) labels[y * w + x] = bare;
          }
      }
      continue;
    }
    const i = at(a); if (i < 0) continue;
    const L = labels[i], fabric = L < 0 || L === model.bg;
    // Joined (`to`: a point on the colour to become): every part in the colour under the point is sewn in the other's
    // thread. Two shades of one blue the picture meant as one, or a shadow that should be the shape's own colour.
    if (a.to) {
      const j = at(a.to), T = j < 0 ? -1 : labels[j];
      if (!fabric && T >= 0 && T !== model.bg && T !== L) for (let k = 0; k < n; k++) if (labels[k] === L) labels[k] = T;
    } else if (!a.sew && !fabric) fillArea(labels, w, h, i, bare);
    else if (a.sew && L >= 0 && L === model.bg && model.inside >= 0) fillArea(labels, w, h, i, model.inside);
  }
}
