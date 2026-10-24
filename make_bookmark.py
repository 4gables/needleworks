"""In-the-hoop applique bookmark with a script name.

usage: .venv/bin/python make_bookmark.py Ashley [--font fonts/Sacramento-Regular.ttf] [--color #c8102e]
"""
import argparse
import json
import os

from needleworks import bookmark, machines, preview
from needleworks.pes import stats

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("name")
    ap.add_argument("--font", default="fonts/Sacramento-Regular.ttf")
    ap.add_argument("--out", default="out")
    ap.add_argument("--color", default=bookmark.RED, help="thread colour, e.g. #c8102e")
    ap.add_argument("--machine", default=machines.DEFAULT_MACHINE, choices=list(machines.MACHINES))
    ap.add_argument("--hoop", default=None)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    d = bookmark.build(a.name, a.font, a.color, machines.hoop(a.machine, a.hoop))
    base = os.path.join(a.out, f"{a.name}_bookmark")
    with open(base + ".pes", "wb") as f:
        f.write(d.to_bytes())
    preview.render(base + ".pes", base + "_preview.png", fabric_block=0, hide_blocks=(0, 1, 3))
    print(base, json.dumps(stats(base + ".pes")))
