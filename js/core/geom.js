// Polyline helpers and stitch generators (mm).
// A path is an array of [x, y].

export function arclen(p) {
  const s = [0];
  for (let i = 1; i < p.length; i++) s.push(s[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  return s;
}

function interp(t, s, p) {
  // t ascending, s ascending (arc lengths), p points
  const out = [];
  let j = 0;
  for (const v of t) {
    while (j < s.length - 2 && s[j + 1] < v) j++;
    const span = s[j + 1] - s[j];
    const f = span > 0 ? Math.min(1, Math.max(0, (v - s[j]) / span)) : 0;
    out.push([p[j][0] + (p[j + 1][0] - p[j][0]) * f, p[j][1] + (p[j + 1][1] - p[j][1]) * f]);
  }
  return out;
}

export function resample(p, step, closed = false) {
  if (closed) p = [...p, p[0]];
  const s = arclen(p), L = s[s.length - 1];
  if (L < 1e-9 || p.length < 2) return [p[0]];
  const n = Math.max(1, Math.round(L / step));
  const t = Array.from({ length: n + 1 }, (_, i) => (L * i) / n);
  const out = interp(t, s, p);
  return closed ? out.slice(0, -1) : out;
}

export function smooth(p, window, closed = false) {
  if (window < 3 || p.length < window) return p;
  const h = Math.floor(window / 2), n = p.length, out = [];
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0;
    for (let k = -h; k <= h; k++) {
      let j = i + k;
      if (closed) j = (j + n) % n; else j = Math.min(n - 1, Math.max(0, j));
      sx += p[j][0]; sy += p[j][1];
    }
    out.push([sx / window, sy / window]);
  }
  if (!closed) { out[0] = p[0]; out[n - 1] = p[n - 1]; }
  return out;
}

export function normals(p, closed = false) {
  const n = p.length, out = [];
  for (let i = 0; i < n; i++) {
    let a, b;
    if (closed) { a = p[(i - 1 + n) % n]; b = p[(i + 1) % n]; }
    else if (n < 2) { out.push([0, 0]); continue; }
    else if (i === 0) { a = p[0]; b = p[1]; }
    else if (i === n - 1) { a = p[n - 2]; b = p[n - 1]; }
    else { a = p[i - 1]; b = p[i + 1]; }
    let tx = b[0] - a[0], ty = b[1] - a[1];
    if (!closed && i > 0 && i < n - 1) { tx /= 2; ty /= 2; }
    const L = Math.max(Math.hypot(tx, ty), 1e-9);
    out.push([-ty / L, tx / L]);
  }
  return out;
}

export const run = (p, length = 2.0, closed = false) => resample(p, length, closed);

// A run that keeps to the line (Ink/Stitch's running-stitch tolerance): stitches up to `length`, shortened so no
// point of the line between two needle holes strays more than `tol` from the stitch, never shorter than `min`, and a
// hole on every turn sharper than 30°. Uniform stitches cut tight curves: 1.6 mm round a 1 mm loop is 0.32 mm off.
export function followRun(p, length = 1.6, tol = 0.1, min = 0.8) {
  const c = resample(p, 0.05);
  if (c.length < 3) return c;
  const sharp = new Set();
  for (let i = 8; i < c.length - 8; i++) {   // the line's direction 0.4 mm before and after
    const a = c[i - 8], b = c[i], d = c[i + 8];
    const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]), t2 = Math.atan2(d[1] - b[1], d[0] - b[0]);
    let turn = Math.abs(t2 - t1); if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (turn > Math.PI / 6) sharp.add(i);
  }
  const out = [c[0]];
  let i = 0;
  while (i < c.length - 1) {
    let best = i + 1;
    for (let j = i + 1; j < c.length; j++) {
      const [ax, ay] = c[i], [bx, by] = c[j], L = Math.hypot(bx - ax, by - ay);
      if (L > length) break;
      let ok = true;
      for (let k = i + 1; k < j && ok; k++) ok = Math.abs((bx - ax) * (ay - c[k][1]) - (ax - c[k][0]) * (by - ay)) / (L || 1) <= tol;
      if (!ok && L >= min) break;
      best = j;
      if (sharp.has(j) && L >= min * 0.5) break;   // land on the corner
    }
    out.push(c[best]); i = best;
  }
  return out;
}

// Satin column centred on p. `density` is the gap between needle hits on the same edge (0.4 mm: Ink/Stitch's
// default and what Brother-made files measure, 0.30-0.42). Stitches alternate edges, so stations are density / 2
// apart, spaced by the outer edge so curves don't gap; where the inner edge crowds, every other stitch is shortened.
// (Until 2026-10-29 stations were `density` apart: 0.8 mm per edge, half the coverage of sold designs.)
export function satin(p, width, density = 0.4, pullComp = 0.2, closed = false) {
  const station = density / 2;
  let c = resample(p, 0.02, closed);
  let n = normals(c, closed);
  if (closed) { c = [...c, c[0]]; n = [...n, n[0]]; }
  const half = (width + pullComp) / 2;
  const A = c.map((q, i) => [q[0] + n[i][0] * half, q[1] + n[i][1] * half]);
  const B = c.map((q, i) => [q[0] - n[i][0] * half, q[1] - n[i][1] * half]);
  const lens = [arclen(A), arclen(B), arclen(c)];
  const idx = [0];
  let last = 0;
  for (let i = 1; i < c.length; i++) {
    if (Math.max(lens[0][i] - lens[0][last], lens[1][i] - lens[1][last], lens[2][i] - lens[2][last]) >= station - 1e-6) {   // (steps of 0.02 can sum just under)
      idx.push(i); last = i;
    }
  }
  if (idx[idx.length - 1] !== c.length - 1) idx.push(c.length - 1);
  const out = [];
  idx.forEach((i, j) => {
    const sgn = j % 2 === 0 ? 1 : -1;
    let r = half;
    if (j > 0 && j < idx.length - 1) {
      const thisSide = sgn > 0 ? A : B, other = sgn > 0 ? B : A, k = idx[j - 1];
      const gThis = Math.hypot(thisSide[i][0] - thisSide[k][0], thisSide[i][1] - thisSide[k][1]);
      const gOther = Math.hypot(other[i][0] - other[k][0], other[i][1] - other[k][1]);
      if (gThis < station * 0.45 && gOther > gThis * 1.8 && (j % 4 === 2 || j % 4 === 3)) r = half * 0.55;
    }
    out.push([c[i][0] + n[i][0] * r * sgn, c[i][1] + n[i][1] * r * sgn]);
  });
  return out;
}

// Edge-walk underlay for a satin 2.5-4 mm wide: a run just inside each edge (0.4 mm in), out along one side and back
// along the other, so the satin's edges sit on a firm line (Ink/Stitch "contour underlay", Lilo's 2.5-4 mm band).
export function edgeWalk(p, width, closed = false, inset = 0.4) {
  let c = resample(p, 0.5, closed);
  let n = normals(c, closed);
  if (closed) { c = [...c, c[0]]; n = [...n, n[0]]; }
  const d = width / 2 - inset;
  const side = (s) => c.map((q, i) => [q[0] + n[i][0] * d * s, q[1] + n[i][1] * d * s]);
  // out along the far side, back along the near one: it ends on the side where the zigzag and satin start, so they
  // sew straight on (ending on the other side left a 2 mm gap: a jump, trim and two locks on the seam)
  return [...run(side(-1), 2.5), ...run(side(1).reverse(), 2.5)];
}

// open zigzag (underlay): `spacing` between hits on the same edge
export const zigzag = (p, width, spacing = 2.0, closed = false) => satin(p, width, spacing, 0, closed);

export function filletPolygon(verts, radius, seg = 8) {
  const out = [], n = verts.length;
  for (let i = 0; i < n; i++) {
    const a = verts[(i - 1 + n) % n], b = verts[i], c = verts[(i + 1) % n];
    let d1 = [a[0] - b[0], a[1] - b[1]], d2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
    d1 = [d1[0] / l1, d1[1] / l1]; d2 = [d2[0] / l2, d2[1] / l2];
    const ang = Math.acos(Math.min(1, Math.max(-1, d1[0] * d2[0] + d1[1] * d2[1])));
    const t = Math.min(radius / Math.tan(ang / 2), l1 / 2, l2 / 2);
    const p1 = [b[0] + d1[0] * t, b[1] + d1[1] * t], p2 = [b[0] + d2[0] * t, b[1] + d2[1] * t];
    for (let k = 0; k < seg; k++) {
      const s = k / (seg - 1);
      out.push([(1 - s) ** 2 * p1[0] + 2 * (1 - s) * s * b[0] + s * s * p2[0],
        (1 - s) ** 2 * p1[1] + 2 * (1 - s) * s * b[1] + s * s * p2[1]]);
    }
  }
  return out;
}

export function circle([cx, cy], r, n = 48) {
  return Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)]);
}

export function cubic(p0, p1, p2, p3, n = 60) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1), u = 1 - t;
    return [u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
      u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]];
  });
}
