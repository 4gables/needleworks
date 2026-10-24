"""In-the-hoop applique bookmark with a script name.

Five colour blocks, all the same thread; each block change is a machine pause for a fabric step:
placement line, front tack-down, name, back tack-down, eyelet + satin border.
"""
import numpy as np

from . import geom, machines, text
from .pes import Design

RED = "#c8102e"

W, MAX_L = 50.0, 165.0     # bookmark width / longest length (mm); shorter if the hoop is smaller
CHAMFER = 9.0
BORDER = 3.6               # satin border width
TEXT_SATIN = 1.8           # satin width of the letters
EYE_R, EYE_W = 4.2, 2.2    # eyelet centreline radius / satin width -> ~6mm hole
STEPS = ["Placement", "Tack down front", "Name", "Tack down back", "Border + eyelet"]


def outline(L):
    t, b, h = -L / 2, L / 2, W / 2
    verts = [(-h + CHAMFER, t), (h - CHAMFER, t), (h, t + CHAMFER), (h, b), (-h, b), (-h, t + CHAMFER)]
    return geom.fillet_polygon(verts, 3.0, seg=10)


def text_paths(name, font, box_len, box_h):
    edges, info = text.strokes(name, font, lead_in=2.4, tail=3.8)
    comps = text.order(edges)
    allp = np.vstack([e[2] for e in edges])
    mn, mx = allp.min(0), allp.max(0)
    # lengthwise: centre the whole word. Across: centre the letters' own band (cap/ascender
    # top to descender bottom, ignoring the flat swashes) so the name sits in the middle
    body = allp[(allp[:, 0] > info["first_x"]) & (allp[:, 0] < info["last_x"])]
    c = np.array([(mn[0] + mx[0]) / 2, (body[:, 1].min() + body[:, 1].max()) / 2])
    half = max(c[1] - mn[1], mx[1] - c[1])
    s = min(box_len / (mx - mn)[0], box_h / (2 * half))

    def xf(p):  # px -> mm, rotate 90deg CW so the word reads top-to-bottom, letter tops to the right
        q = (p - c) * s
        return np.column_stack([-q[:, 1], q[:, 0]])
    return [[(xf(p), mode) for p, mode in comp] for comp in comps]


def build(name, font, color=RED, hoop=None):
    """Returns a finished Design (call .to_bytes() for the machine file)."""
    name = name.strip()
    if not name:
        raise ValueError("type a name first")
    hoop = hoop or machines.hoop()
    L = min(MAX_L, hoop["h"] - 2 * machines.MARGIN - 6)
    if W + 4 > hoop["w"] - 2 * machines.MARGIN:
        raise ValueError(f"the {hoop['name']} hoop is too narrow for a bookmark")
    edge = outline(L)
    eye_c = np.array([0.0, -L / 2 + 13.0])
    # equal 6 mm breathing room below the eyelet ring and above the inner edge of the border
    top, bottom = eye_c[1] + EYE_R + EYE_W / 2 + 6, L / 2 - BORDER / 2 - 6
    inner_w = W - 2 * BORDER - 6
    comps = text_paths(name, font, box_len=bottom - top, box_h=inner_w)
    pts = np.vstack([p for comp in comps for p, _ in comp])
    shift = np.array([0.0, (top + bottom) / 2 - (pts[:, 1].min() + pts[:, 1].max()) / 2])

    d = Design(hoop)
    d.color(color, f"Step 1 - {STEPS[0]}")
    d.path(geom.run(edge, 2.5, closed=True))
    d.path(edge[:1])
    d.color(color, f"Step 2 - {STEPS[1]}")
    d.path(geom.run(edge, 2.0, closed=True))
    d.path(geom.run(edge[::-1], 2.0, closed=True))
    d.color(color, f"Step 3 - {name}")
    for comp in comps:
        for p, mode in comp:
            p = p + shift
            d.path(geom.run(p, 1.2) if mode == "run" else geom.satin(p, TEXT_SATIN, density=0.38, pull_comp=0.2))
    d.color(color, f"Step 4 - {STEPS[3]}")
    d.path(geom.run(edge, 2.0, closed=True))
    d.color(color, f"Step 5 - {STEPS[4]}")
    ring = geom.circle(eye_c, EYE_R, 64)
    d.path(geom.run(ring, 1.0, closed=True))
    d.path(geom.zigzag(ring, EYE_W * 0.6, 1.2, closed=True))
    d.path(geom.satin(ring, EYE_W, 0.3, pull_comp=0.2, closed=True))
    d.path(geom.zigzag(edge, BORDER * 0.7, 2.0, closed=True))
    d.path(geom.satin(edge, BORDER, 0.4, pull_comp=0.3, closed=True))
    return d.finish()
