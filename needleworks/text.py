"""Script text -> centerline strokes -> satin stitch sequence.

Render the word in a monoline script font, skeletonize it, turn the skeleton
into a graph of strokes, then walk the graph so every stroke is stitched as a
centre-run underlay on the way out and a satin column on the way back. That
covers each connected word with zero jumps.
"""
from collections import defaultdict

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from skimage.morphology import skeletonize

from . import geom

PX = 400  # font size used for rasterising

NB = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def _cubic(p0, p1, p2, p3, n=60):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = (np.asarray(p, float) for p in (p0, p1, p2, p3))
    return [tuple(q) for q in (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3]


def _swash(p0, d, length, xh, ybase, s):
    """Calligraphic swash leaving a stroke end p0 along its own direction d: it sweeps into a shallow
    cup just under the baseline, then flicks up at the far end. s = -1 runs left (lead-in), +1 right (tail)."""
    p0, d = np.asarray(p0, float), np.asarray(d, float)
    cup = np.array([p0[0] + s * 0.45 * length, ybase + 0.15 * xh])
    tip = np.array([p0[0] + s * length, ybase - 0.4 * xh])
    r1, r2 = np.linalg.norm(cup - p0), np.linalg.norm(tip - cup)
    d = d + 0.5 * (cup - p0) / max(r1, 1e-9)  # ease a stroke end that curls away (A's foot) toward the cup
    d /= max(np.linalg.norm(d), 1e-9)
    flick = np.array([s * 0.7, -0.7])
    leg1 = _cubic(p0, p0 + d * min(0.5 * r1, 0.35 * xh), cup - (s * 0.45 * r1, 0), cup)
    leg2 = _cubic(cup, cup + (s * 0.45 * r2, 0), tip - flick * 0.35 * r2, tip)
    return leg1 + leg2[1:]


def _brush(draw, pts, width):
    """Stamp a round brush along pts; gap-free even for tiny segments, unlike wide ImageDraw.line."""
    p = geom.resample(np.asarray(pts, float), 1.0)
    r = width / 2
    for x, y in p:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=255)


def _endpoints(mask, stroke):
    """Stroke ends of the skeleton: [(xy, outward unit vector)]."""
    pos, edges = _graph(skeletonize(mask))
    edges = _prune(pos, edges, min_len=stroke * 1.3)
    deg = defaultdict(int)
    for a, b, _ in edges:
        deg[a] += 1; deg[b] += 1
    out = []
    for a, b, path in edges:
        p = np.array(path, float)[:, ::-1]
        k = min(len(p) - 1, int(stroke * 2))
        for node, end, inner in ((a, p[0], p[k]), (b, p[-1], p[-1 - k])):
            if deg[node] == 1 and a != b:
                d = end - inner
                out.append((end, d / max(np.linalg.norm(d), 1e-9)))
    return out


def render(text, font_path, lead_in=0.0, tail=0.0, join=True):
    """Rasterise text; add swashes (lengths in x-heights) and bridges between unjoined letters.

    Swashes and bridges attach tangentially to real stroke ends: the first letter's
    entry stroke, the last letter's exit stroke, and exit->entry between neighbours.
    """
    font = ImageFont.truetype(font_path, PX)
    l, t, r, b = font.getbbox(text)
    pad = int(PX * (0.2 + lead_in + tail))
    w, h = r - l + 2 * pad, b - t + PX
    img = Image.new("L", (w, h), 0)
    ox, oy = pad - l, PX // 2 - t
    ImageDraw.Draw(img).text((ox, oy), text, fill=255, font=font)
    mask = np.array(img) > 127

    dt = ndimage.distance_transform_edt(mask)
    stroke = 2 * np.median(dt[skeletonize(mask)])
    baseline = oy + font.getmetrics()[0]
    xh = font.getbbox("x")[3] - font.getbbox("x")[1]
    draw = ImageDraw.Draw(img)
    sw = max(2, int(round(stroke)))
    ybase = baseline - stroke / 2
    span = [ox + l, ox + r]  # x range of the letters themselves (swashes extend beyond)

    ends = _endpoints(mask, stroke)
    lab, _ = ndimage.label(mask, structure=np.ones((3, 3)))
    adv = [ox + font.getlength(text[:i]) for i in range(len(text) + 1)]
    low = [(p, d) for p, d in ends if baseline - 0.75 * xh <= p[1] <= baseline + 0.2 * xh]

    def bottom(i):
        """Lowest ink point (above descenders) in letter i's left half, as a stroke centre heading left."""
        x0, x1 = int(max(adv[i] - 0.4 * xh, 0)), int((adv[i] + adv[i + 1]) / 2)
        sub = mask[:int(baseline + 0.3 * xh), x0:x1]
        ys, xs = np.nonzero(sub)
        if not len(ys):
            return None
        k = np.lexsort((xs, -ys))[0]
        return np.array([x0 + xs[k], ys[k] - stroke / 2]), np.array([-1.0, 0])

    def entry(i):
        c = [(p, d) for p, d in low if adv[i] - 0.4 * xh <= p[0] <= (adv[i] + adv[i + 1]) / 2]
        return min(c, key=lambda e: e[0][0]) if c else None

    def exit_(i, band=low):
        c = [(p, d) for p, d in band if (adv[i] + adv[i + 1]) / 2 <= p[0] <= adv[i + 1] + 0.4 * xh]
        return max(c, key=lambda e: e[0][0]) if c else None

    def comp(p):
        y, x = int(round(p[1])), int(round(p[0]))
        win = lab[y - 3:y + 4, x - 3:x + 4]
        return win.max()

    if join:
        for i in range(len(text) - 1):
            if not text[i].isalpha() or not text[i + 1].isalpha():
                continue
            ex, en = exit_(i), entry(i + 1)
            if ex is None or en is None or comp(ex[0]) == comp(en[0]):
                continue
            dist = np.linalg.norm(en[0] - ex[0])
            _brush(draw, _cubic(ex[0], ex[0] + ex[1] * dist * 0.4, en[0] + en[1] * dist * 0.4, en[0]), sw)

    if lead_in:
        # first letter's entry stroke; letters without one (E, O) are joined tangentially at their lowest point
        en = entry(0) or bottom(0)
        p0, d = en if en else (np.array([adv[0], ybase]), np.array([-1.0, 0]))
        span[0] = p0[0]
        _brush(draw, _swash(p0, d, lead_in * xh, xh, ybase, -1), sw)

    if tail:
        ex = exit_(len(text) - 1, ends)
        p0, d = ex if ex else (np.array([adv[-1], ybase]), np.array([1.0, 0]))
        span[1] = p0[0]
        _brush(draw, _swash(p0, d, tail * xh, xh, ybase, 1), sw)

    mask = np.array(img) > 127
    return mask, stroke, baseline, xh, span


def _graph(skel):
    """Skeleton pixels -> nodes (clustered junctions/endpoints) and edges (pixel paths)."""
    pix = set(zip(*np.nonzero(skel)))
    deg = {p: sum((p[0] + dy, p[1] + dx) in pix for dy, dx in NB) for p in pix}
    nodemask = np.zeros_like(skel)
    for p, d in deg.items():
        if d != 2:
            nodemask[p] = True
    lab, n = ndimage.label(nodemask, structure=np.ones((3, 3)))
    node_of = {p: lab[p] - 1 for p in pix if lab[p]}
    used, edges = set(), []

    def walk(start, first):
        path, prev, cur = [start, first], start, first
        used.add((start, first)); used.add((first, start))
        while cur not in node_of:
            nxt = [(cur[0] + dy, cur[1] + dx) for dy, dx in NB]
            nxt = [q for q in nxt if q in pix and q != prev and (cur, q) not in used]
            if not nxt:
                break
            nxt.sort(key=lambda q: abs(q[0] - cur[0]) + abs(q[1] - cur[1]))  # prefer orthogonal
            q = nxt[0]
            used.add((cur, q)); used.add((q, cur))
            path.append(q); prev, cur = cur, q
        return path

    for p in list(node_of):
        for dy, dx in NB:
            q = (p[0] + dy, p[1] + dx)
            if q in pix and (p, q) not in used and node_of.get(q) != node_of[p]:
                path = walk(p, q)
                end = node_of.get(path[-1])
                if end is None:  # dead end without a node — treat tip as new node
                    end = n; n += 1; node_of[path[-1]] = end
                edges.append([node_of[p], end, path])

    # closed loops with no junctions (e.g. an "o" on its own)
    on_edge = {q for e in edges for q in e[2]}
    for p in pix:
        if p not in on_edge and p not in node_of:
            node_of[p] = n
            nb = [(p[0] + dy, p[1] + dx) for dy, dx in NB if (p[0] + dy, p[1] + dx) in pix]
            if nb:
                path = walk(p, nb[0])
                edges.append([n, n, path])
                on_edge.update(path)
            n += 1

    pos = defaultdict(list)
    for p, k in node_of.items():
        pos[k].append(p)
    pos = {k: np.mean(v, axis=0) for k, v in pos.items()}
    return pos, edges


def _prune(pos, edges, min_len):
    """Drop short spurs and merge pass-through nodes."""
    def L(e):
        return len(e[2])
    changed = True
    while changed:
        changed = False
        deg = defaultdict(int)
        for a, b, _ in edges:
            deg[a] += 1; deg[b] += 1
        for e in edges:
            a, b, _ = e
            if a != b and L(e) < min_len and ((deg[a] == 1 and deg[b] >= 3) or (deg[b] == 1 and deg[a] >= 3)):
                edges.remove(e); changed = True; break
        if changed:
            continue
        for k in list(deg):
            ek = [e for e in edges if k in (e[0], e[1])]
            if deg[k] == 2 and len(ek) == 2 and ek[0] is not ek[1]:
                e1, e2 = ek
                p1 = e1[2] if e1[1] == k else e1[2][::-1]
                o1 = e1[0] if e1[1] == k else e1[1]
                p2 = e2[2] if e2[0] == k else e2[2][::-1]
                o2 = e2[1] if e2[0] == k else e2[0]
                edges.remove(e1); edges.remove(e2)
                edges.append([o1, o2, p1 + p2[1:]])
                changed = True; break
    return edges


def skeleton_edges(mask, stroke):
    """Centerline strokes of a binary mask: [(node_a, node_b, polyline (x, y) px)]."""
    pos, edges = _graph(skeletonize(mask))
    edges = _prune(pos, edges, min_len=stroke * 1.3)
    out = []
    for a, b, path in edges:
        pts = np.array(path, float)[:, ::-1]  # (row,col) -> (x,y)
        pts[0], pts[-1] = pos[a][::-1], pos[b][::-1]
        pts = geom.smooth(pts, max(3, int(stroke * 0.8) | 1))
        out.append((a, b, pts))
    return out


def strokes(text, font_path, lead_in=0.0, tail=0.0):
    """Returns ([(a, b, polyline_px)], info) for the rendered word."""
    mask, stroke, baseline, xh, span = render(text, font_path, lead_in, tail)
    out = skeleton_edges(mask, stroke)
    return out, dict(stroke=stroke, baseline=baseline, xh=xh, shape=mask.shape, first_x=span[0], last_x=span[1])


def order(edges):
    """Euler-style DFS: returns list of components, each a list of (polyline, 'run'|'satin')."""
    adj = defaultdict(list)
    for i, (a, b, _) in enumerate(edges):
        adj[a].append(i)
        if b != a:
            adj[b].append(i)
    used = [False] * len(edges)
    comps = []

    def dfs(u, seq):
        for i in adj[u]:
            if used[i]:
                continue
            used[i] = True
            a, b, p = edges[i]
            fwd = p if a == u else p[::-1]
            v = b if a == u else a
            seq.append((fwd, "run"))
            dfs(v, seq)
            seq.append((fwd[::-1], "satin"))

    # start each component at its left-most endpoint (where the lead-in begins)
    while not all(used):
        cand = [(min(edges[i][2][0][0], edges[i][2][-1][0]), i) for i in range(len(edges)) if not used[i]]
        _, i = min(cand)
        a, b, p = edges[i]
        start = a if p[0][0] <= p[-1][0] else b
        seq = []
        dfs(start, seq)
        comps.append(seq)
    return comps
