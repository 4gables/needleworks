# Step two of the worked example: the badge's subtitle set again as type round its arc, strands to 1 mm, sparkles out.
# Specific to the Needleworks badge (its arc, its delta), kept as the record of how; see flatten.py.
# usage: .venv/bin/python tests/art_ready/retype.py DIR CAP_PX BASELINE_RADIUS_PX GAP_DEG   (DIR/logo/flat.png in, DIR/logo/improved.png out;
#   DIR/logo/Poppins-SemiBold.ttf from fonts/ via fontTools)
import sys, math
from PIL import Image, ImageDraw, ImageFont
import numpy as np
from scipy import ndimage
S = sys.argv[1]; cap = int(sys.argv[2]); rb = float(sys.argv[3]); gap_deg = float(sys.argv[4])
im = np.array(Image.open(f"{S}/logo/flat.png").convert("RGBA")); N = im.shape[0]
PAL = {"cream": (224, 217, 200), "navy": (38, 50, 71), "red": (128, 38, 48), "gold": (196, 150, 70), "green": (85, 105, 65), "grey": (150, 152, 155)}
names = list(PAL); C = np.array([PAL[k] for k in names])
a = im[..., 3] > 128
L = np.abs(im[..., :3].astype(int)[:, :, None, :] - C[None, None]).sum(3).argmin(2)
nv, cr = names.index("navy"), names.index("cream")
# 1. the old subtitle: small navy parts above the delta's tip and below NEEDLEWORKS
lab, n = ndimage.label(L == nv); objs = ndimage.find_objects(lab); sizes = ndimage.sum(np.ones_like(L), lab, range(1, n + 1))
gone = 0
for k in range(n):
    sl = objs[k]
    if sizes[k] < 4000 and sl[1].start >= 360 and sl[1].stop <= 1150 and sl[0].start >= 240 and sl[0].stop <= 480:
        L[lab == k + 1] = cr; gone += 1
# 2. strands (red, gold) at least 1 mm: 12.8 px per mm at 120 mm -> grow each by 2 px into cream only
for c in ("red", "gold"):
    k = names.index(c); grow = ndimage.binary_dilation(L == k, iterations=2) & (L == cr) & a
    L[grow] = k
# 3. sparkles: parts of gold or red under 2.5 mm (32 px) across with only cream round them
for c in ("gold", "red"):
    k = names.index(c); lab2, n2 = ndimage.label(L == k); o2 = ndimage.find_objects(lab2)
    for j in range(n2):
        sl = o2[j]; h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if max(h, w) >= 40: continue
        m = lab2 == j + 1; ring = ndimage.binary_dilation(m, iterations=3) & ~m
        if (L[ring] == cr).mean() > 0.97: L[m] = cr
out = Image.fromarray(np.dstack([C[L].astype(np.uint8), a.astype(np.uint8) * 255]))
# 4. FATHER & | DAUGHTER on an arc round (765, 921), baseline radius rb, either side of the tip
font = ImageFont.truetype(f"{S}/logo/Poppins-SemiBold.ttf", int(round(max(cap, 1) * 1000 / 701)))
cx, cy = 767, 768
def arc_text(text, start_deg, direction):
    # lay glyphs along the arc; direction -1: text ends at start_deg (left of the tip), +1: starts there
    widths = [font.getlength(ch) for ch in text]
    total = sum(widths) / rb * 180 / math.pi
    phi = start_deg - total if direction < 0 else start_deg
    for ch, wch in zip(text, widths):
        mid = phi + (wch / 2) / rb * 180 / math.pi
        M = 2 * cap; g = Image.new("RGBA", (int(wch) + 2 * M, cap * 4), (0, 0, 0, 0)); d = ImageDraw.Draw(g)
        asc = font.getmetrics()[0]
        d.text((M, cap * 2 - asc), ch, font=font, fill=PAL["navy"] + (255,))
        # baseline at y = 2*cap, glyph centre x = 20 + wch/2
        r = g.rotate(-mid, resample=Image.BICUBIC, expand=False, center=(M + wch / 2, cap * 2))
        px = cx + rb * math.sin(math.radians(mid)); py = cy - rb * math.cos(math.radians(mid))
        out.alpha_composite(r, (int(round(px - (M + wch / 2))), int(round(py - cap * 2))))
        phi += wch / rb * 180 / math.pi
if cap > 0:
    arc_text("FATHER &", -gap_deg, -1)
    arc_text("DAUGHTER", gap_deg, +1)
# 5. snap the new letters' soft edges to navy or cream (one thread each)
o = np.array(out); rgb = o[..., :3].astype(int)
Lf = np.abs(rgb[:, :, None, :] - C[None, None]).sum(3).argmin(2)
o[..., :3] = C[Lf]
Image.fromarray(o).save(f"{S}/logo/improved.png")
print("old subtitle parts removed:", gone, "cap mm at 120 mm:", round(cap / 12.8, 2) if cap else "no subtitle")
