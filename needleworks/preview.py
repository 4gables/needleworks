"""Render a realistic-ish preview by reading a PES/DST/etc. file back."""
import numpy as np
import pyembroidery as pe
from PIL import Image, ImageDraw, ImageFilter

SCALE = 12  # px per mm in the final image
SS = 3      # supersampling


def _blocks(p):
    """[(thread_rgb, [segments...])] where segment = list of (x,y) mm, split at jumps/trims."""
    out, segs, cur = [], [], []
    ti = 0
    for x, y, c in p.stitches:
        c &= pe.COMMAND_MASK
        if c == pe.STITCH:
            cur.append((x / 10, y / 10))
        elif c in (pe.JUMP, pe.TRIM):
            if len(cur) > 1:
                segs.append(cur)
            cur = [(x / 10, y / 10)] if c == pe.JUMP else []
        elif c in (pe.COLOR_CHANGE, pe.END):
            if len(cur) > 1:
                segs.append(cur)
            if segs:
                out.append((p.threadlist[min(ti, len(p.threadlist) - 1)].hex_color(), segs))
            segs, cur = [], []
            if c == pe.COLOR_CHANGE:
                ti += 1
    if len(cur) > 1:
        segs.append(cur)
    if segs:
        out.append((p.threadlist[min(ti, len(p.threadlist) - 1)].hex_color(), segs))
    return out


def _gingham(w, h, cell, a, b, base=(250, 248, 246)):
    yy, xx = np.mgrid[0:h, 0:w]
    vx = (xx // cell) % 2 == 0
    vy = (yy // cell) % 2 == 0
    img = np.empty((h, w, 3), float)
    img[:] = base
    img[vx ^ vy] = a
    img[vx & vy] = b
    return img


def render(path, out_png, fabric_block=0, hide_blocks=(), fabric="gingham", show_steps=False):
    """fabric_block: index of the color block whose outline is the fabric shape (placement line)."""
    p = pe.read(path)
    blocks = _blocks(p)
    allpts = np.array([q for _, segs in blocks for s in segs for q in s])
    mn, mx = allpts.min(0) - 8, allpts.max(0) + 8
    k = SCALE * SS
    W, H = (int((mx - mn)[0] * k), int((mx - mn)[1] * k))

    def tr(pts):
        return [((x - mn[0]) * k, (y - mn[1]) * k) for x, y in pts]

    bg = Image.new("RGB", (W, H), (236, 230, 222))
    if fabric_block is not None:
        outline = max(blocks[fabric_block][1], key=len)
        m = Image.new("L", (W, H), 0)
        ImageDraw.Draw(m).polygon(tr(outline), fill=255)
        cloth = _gingham(W, H, int(2.6 * k), (240, 150, 175), (226, 92, 130)) if fabric == "gingham" \
            else np.full((H, W, 3), (250, 248, 246), float)
        cloth = Image.fromarray(cloth.astype(np.uint8))
        shadow = m.filter(ImageFilter.GaussianBlur(k * 1.2))
        bg.paste((180, 170, 160), (int(k * 0.6), int(k * 0.9)), shadow)
        bg.paste(cloth, (0, 0), m)

    thread_w = max(1, int(0.45 * k))
    for bi, (hexc, segs) in enumerate(blocks):
        if bi in hide_blocks:
            continue
        rgb = tuple(int(hexc[i:i + 2], 16) for i in (1, 3, 5))
        dark = tuple(int(c * 0.45) for c in rgb)
        light = tuple(min(255, int(c + (255 - c) * 0.35)) for c in rgb)
        d = ImageDraw.Draw(bg)
        # thread realism: a soft shadow under the whole block, then each stitch as a body
        # with a thin sheen, so dense satin reads as a smooth glossy column (as on fabric)
        sh = int(0.25 * k)
        for s in segs:
            pts = tr(s)
            d.line([(x + sh, y + sh) for x, y in pts], fill=dark, width=thread_w, joint="curve")
        for s in segs:
            pts = tr(s)
            for a, b in zip(pts, pts[1:]):
                d.line([a, b], fill=rgb, width=thread_w)
                m = ((a[0] + b[0]) / 2 - thread_w * 0.15, (a[1] + b[1]) / 2 - thread_w * 0.15)
                ha = (a[0] * 0.8 + m[0] * 0.2, a[1] * 0.8 + m[1] * 0.2)
                hb = (b[0] * 0.8 + m[0] * 0.2, b[1] * 0.8 + m[1] * 0.2)
                d.line([ha, hb], fill=light, width=max(1, thread_w // 5))
    img = bg.resize((W // SS, H // SS), Image.LANCZOS)
    img.save(out_png)
    return out_png
