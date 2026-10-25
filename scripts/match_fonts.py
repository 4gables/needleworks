"""Render a sample's own words in every candidate font, to pick a free lookalike for a store font.

usage: .venv/bin/python scripts/match_fonts.py "Cinderella" fonts_dir/ out.png [--stitched]

--stitched shows each candidate the way the bookmark engine will sew it (skeleton, one satin width),
which is what matters: heavy brush fonts and hairline copperplates both end up monoline.
"""
import argparse
import glob
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from needleworks import text  # noqa: E402

CELL_W, CELL_H = 520, 150


def cell(word, path, stitched):
    if stitched:
        m = text.render(word, path)[0]
        edges, info = text.strokes(word, path)
        im = Image.new("L", m.shape[::-1], 255)
        d = ImageDraw.Draw(im)
        w = max(2, int(info["stroke"]))
        for _, _, p in edges:
            d.line([tuple(q) for q in p], fill=0, width=w, joint="curve")
    else:
        f = ImageFont.truetype(path, 120)
        l, t, r, b = f.getbbox(word)
        im = Image.new("L", (r - l + 20, b - t + 20), 255)
        ImageDraw.Draw(im).text((10 - l, 10 - t), word, font=f, fill=0)
    a = np.array(im) < 128
    ys, xs = np.nonzero(a)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    im.thumbnail((CELL_W - 10, CELL_H - 30))
    return im


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("word")
    ap.add_argument("fonts")
    ap.add_argument("out")
    ap.add_argument("--stitched", action="store_true")
    a = ap.parse_args()
    paths = sorted(glob.glob(os.path.join(a.fonts, "*.ttf")))
    cols = 4
    sheet = Image.new("L", (cols * CELL_W, -(-len(paths) // cols) * CELL_H), 255)
    d = ImageDraw.Draw(sheet)
    for i, p in enumerate(paths):
        x, y = (i % cols) * CELL_W, (i // cols) * CELL_H
        try:
            sheet.paste(cell(a.word, p, a.stitched), (x + 5, y + 5))
        except Exception as e:  # noqa: BLE001 - a broken candidate shouldn't stop the sheet
            d.text((x + 5, y + 40), f"error: {e}"[:60], fill=0)
        d.text((x + 5, y + CELL_H - 20), os.path.basename(p), fill=0)
    sheet.save(a.out)
