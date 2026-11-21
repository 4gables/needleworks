# Making a picture embroidery-ready (docs/pictures.md "Making a picture embroidery-ready"): the worked example of
# 2026-11-21, kept so the steps can be run again. Tooling, not the product: the Picture tab is to do this itself.
# usage: .venv/bin/python tests/art_ready/flatten.py IN.png OUT.png [palette.json]   (palette: {"name": [r,g,b], ...};
#   default: the Needleworks badge's six threads; sample yours by hue, as the doc says)
import sys, json
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage
src, out = sys.argv[1], sys.argv[2]
PAL = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else {"cream": (224, 217, 200), "navy": (38, 50, 71), "red": (128, 38, 48), "gold": (196, 150, 70), "green": (85, 105, 65), "grey": (150, 152, 155)}
names = list(PAL); C = np.array([PAL[n] for n in names], float)
N = 1536
im = Image.open(src).convert("RGBA").resize((N, N), Image.LANCZOS)
a = np.array(im.split()[3]) > 128
rgb = im.convert("RGB")
for _ in range(2): rgb = rgb.filter(ImageFilter.MedianFilter(5))
X = np.array(rgb).reshape(-1, 3).astype(float)
def lab(x):
    x = x / 255; x = np.where(x > 0.04045, ((x + 0.055) / 1.055) ** 2.4, x / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = x @ M.T / np.array([0.9505, 1, 1.089]); f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)
L = ((lab(X)[:, None, :] - lab(C)[None]) ** 2).sum(2).argmin(1).reshape(N, N)
# mode filter per label, then islands under ~1 mm² at 120 mm (12.8 px/mm -> 164 px²) given to the neighbour
L = np.array(Image.fromarray(L.astype(np.uint8)).filter(ImageFilter.ModeFilter(7)))
for it in range(2):
    for k in range(len(names)):
        lab_, n = ndimage.label(L == k)
        sizes = ndimage.sum(np.ones_like(L), lab_, range(1, n + 1))
        for j, s in enumerate(sizes, 1):
            if s < 164:
                m = lab_ == j; ring = ndimage.binary_dilation(m, iterations=2) & ~m
                if ring.any(): L[m] = np.bincount(L[ring], minlength=len(names)).argmax()
O = C[L].astype(np.uint8)
Image.fromarray(np.dstack([O, a.astype(np.uint8) * 255])).save(out)
print({n: int((L[a] == k).sum()) for k, n in enumerate(names)})
# embroidery clean-up: grey only on the needle (the largest grey part); other grey (painted shadows) and the painted
# gold dashes round the rim (small gold parts 0.84-0.97 of the radius) go to the colour around them
g, gd = names.index("grey"), names.index("gold")
lab_, n = ndimage.label(L == g)
if n:
    sizes = ndimage.sum(np.ones_like(L), lab_, range(1, n + 1)); keep = 1 + int(np.argmax(sizes))
    for j in range(1, n + 1):
        if j == keep: continue
        m = lab_ == j; ring = ndimage.binary_dilation(m, iterations=3) & ~m & (L != g)
        if ring.any(): L[m] = np.bincount(L[ring], minlength=len(names)).argmax()
ys, xs = np.nonzero(a); cy, cx, R = ys.mean(), xs.mean(), (np.sqrt(a.sum() / np.pi))
lab_, n = ndimage.label(L == gd)
cents = ndimage.center_of_mass(np.ones_like(L), lab_, range(1, n + 1)); sizes = ndimage.sum(np.ones_like(L), lab_, range(1, n + 1))
for j, ((y, x), s) in enumerate(zip(cents, sizes), 1):
    r = np.hypot(y - cy, x - cx) / R
    if 0.80 < r < 0.97 and s < 12000:
        m = lab_ == j; ring = ndimage.binary_dilation(m, iterations=3) & ~m & (L != gd)
        if ring.any(): L[m] = np.bincount(L[ring], minlength=len(names)).argmax()
O = C[L].astype(np.uint8)
Image.fromarray(np.dstack([O, a.astype(np.uint8) * 255])).save(out)
print("cleaned", {n_: int((L[a] == k).sum()) for k, n_ in enumerate(names)})
