"""Polyline helpers and stitch generators. All units are millimetres."""
import numpy as np


def arclen(p):
    return np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])


def resample(p, step, closed=False):
    p = np.asarray(p, float)
    if closed:
        p = np.vstack([p, p[:1]])
    s = arclen(p)
    if s[-1] < 1e-9:
        return p[:1]
    n = max(1, int(round(s[-1] / step)))
    t = np.linspace(0, s[-1], n + 1)
    out = np.column_stack([np.interp(t, s, p[:, 0]), np.interp(t, s, p[:, 1])])
    return out[:-1] if closed else out


def smooth(p, window, closed=False):
    """Moving-average smoothing; endpoints of open paths stay fixed."""
    p = np.asarray(p, float)
    if window < 3 or len(p) < window:
        return p
    k = np.ones(window) / window
    h = window // 2
    if closed:
        ext = np.vstack([p[-h:], p, p[:h]])
        return np.column_stack([np.convolve(ext[:, i], k, "valid") for i in range(2)])
    ext = np.vstack([np.repeat(p[:1], h, 0), p, np.repeat(p[-1:], h, 0)])
    out = np.column_stack([np.convolve(ext[:, i], k, "valid") for i in range(2)])
    out[0], out[-1] = p[0], p[-1]
    return out


def normals(p, closed=False):
    if len(p) < 2:
        return np.zeros_like(p)
    if closed:
        t = np.roll(p, -1, 0) - np.roll(p, 1, 0)
    else:
        t = np.gradient(p, axis=0)
    t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)
    return np.column_stack([-t[:, 1], t[:, 0]])


def run(p, length=2.0, closed=False):
    """Running stitch along a path."""
    return resample(p, length, closed=closed)


def satin(p, width, density=0.4, pull_comp=0.2, closed=False):
    """Satin column centred on path p.

    Stations are spaced so the *outer* edge of a curve never opens up wider than
    `density` (no gaps on loops), and where the inner edge bunches up every other
    stitch is shortened there so the needle doesn't perforate one spot.
    """
    c = resample(p, 0.05, closed=closed)
    n = normals(c, closed=closed)
    if closed:
        c, n = np.vstack([c, c[:1]]), np.vstack([n, n[:1]])
    half = (width + pull_comp) / 2
    sides = [c + n * half, c - n * half]
    lens = [arclen(e) for e in sides] + [arclen(c)]
    idx, last = [0], 0
    for i in range(1, len(c)):
        if max(l[i] - l[last] for l in lens) >= density:
            idx.append(i); last = i
    if idx[-1] != len(c) - 1:
        idx.append(len(c) - 1)
    idx = np.array(idx)
    out = []
    for j, i in enumerate(idx):
        sgn = 1.0 if j % 2 == 0 else -1.0
        r = half
        if 0 < j < len(idx) - 1:
            inner = sides[1] if sgn > 0 else sides[0]  # the side this stitch is NOT landing on
            this = sides[0] if sgn > 0 else sides[1]
            gap_this = np.linalg.norm(this[i] - this[idx[j - 1]])
            gap_other = np.linalg.norm(inner[i] - inner[idx[j - 1]])
            if gap_this < density * 0.45 and gap_other > gap_this * 1.8 and j % 4 in (2, 3):
                r = half * 0.55  # short stitch on the crowded inner edge
        out.append(c[i] + n[i] * r * sgn)
    return np.array(out)


def zigzag(p, width, spacing=2.0, closed=False):
    """Open zig-zag (underlay / tack-down)."""
    return satin(p, width, density=spacing / 2, pull_comp=0, closed=closed)


def fillet_polygon(verts, radius, seg=8):
    """Round every corner of a closed polygon."""
    v = np.asarray(verts, float)
    out = []
    for i in range(len(v)):
        a, b, c = v[i - 1], v[i], v[(i + 1) % len(v)]
        d1, d2 = (a - b), (c - b)
        l1, l2 = np.linalg.norm(d1), np.linalg.norm(d2)
        d1, d2 = d1 / l1, d2 / l2
        ang = np.arccos(np.clip(np.dot(d1, d2), -1, 1))
        t = min(radius / np.tan(ang / 2), l1 / 2, l2 / 2)
        p1, p2 = b + d1 * t, b + d2 * t
        for s in np.linspace(0, 1, seg):  # quadratic bezier approximates the arc
            out.append((1 - s) ** 2 * p1 + 2 * (1 - s) * s * b + s ** 2 * p2)
    return np.array(out)


def circle(center, r, n=48):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    return np.column_stack([center[0] + r * np.cos(t), center[1] + r * np.sin(t)])
