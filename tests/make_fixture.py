"""Test fixtures from pyembroidery, the outside oracle for tests/formats.test.mjs (used through its API only).

Write a PES fixture from a commands JSON (the writer oracle):
  .venv/bin/python tests/make_fixture.py tests/fixtures/ashley_v3_commands.json tests/fixtures/ashley_v3.pes [version]
Version defaults to 6 (full PES v6: CEmbOne/CSewSeg + PEC), what writePES writes.

Read our DST / EXP / JEF / VP3 golden files back (docs/formats-out-spec.md section 9, layer 2; run by hand when a golden
file changes, the JSON is committed beside it):
  .venv/bin/python tests/make_fixture.py oracle tests/fixtures/golden/*.dst tests/fixtures/golden/*.exp tests/fixtures/golden/*.jef tests/fixtures/golden/*.vp3
Each FILE gets FILE.json: { stitches: [[x, y, "STITCH" | "JUMP" | "TRIM" | "COLOR_CHANGE" | "STOP" | "END"]], threads }.

pyembroidery's own DST / EXP / JEF / VP3 writers as a second witness (spec section 9): a commands JSON already normalised,
its jumps split here by spec section 2.4 (so pyembroidery re-encodes nothing), written to PREFIX.dst/.exp/.jef/.vp3 (JEF with its trims on, spec section 9):
  .venv/bin/python tests/make_fixture.py pywriter tests/fixtures/centred_commands.json tests/fixtures/centred_py
"""
import math
import json
import sys

import pyembroidery as pe

NAMES = {pe.STITCH: "STITCH", pe.JUMP: "JUMP", pe.TRIM: "TRIM", pe.COLOR_CHANGE: "COLOR_CHANGE", pe.STOP: "STOP", pe.END: "END"}
# JEF must be read with these (spec 9): by default pyembroidery adds a trim wherever a jump run travels over 3 mm
SETTINGS = {"jef": {"trim_at": 3, "trim_distance": None}}


def oracle(path):
    p = pe.read(path, SETTINGS.get(path.rsplit(".", 1)[-1].lower()))
    stitches = [[x, y, NAMES.get(c & pe.COMMAND_MASK, str(c & pe.COMMAND_MASK))] for x, y, c in p.stitches]
    threads = [{"color": t.hex_color(), "description": t.description, "catalog": t.catalog_number, "brand": t.brand} for t in p.threadlist]
    with open(path + ".json", "w") as f:
        json.dump({"stitches": stitches, "threads": threads}, f, separators=(",", ":"))
        f.write("\n")


def pywriter(src, prefix):
    ref = json.load(open(src))
    cmd = {0: pe.STITCH, 1: pe.JUMP, 2: pe.TRIM, 3: pe.STOP, 4: pe.END, 5: pe.COLOR_CHANGE}
    for fmt, limit in (("dst", 121), ("exp", 127), ("jef", 127), ("vp3", 127)):
        p = pe.EmbPattern()
        for t in ref["threads"]:
            th = pe.EmbThread()
            th.set_color(*[int(t["color"][i:i + 2], 16) for i in (1, 3, 5)])
            th.description = t.get("description")
            th.brand = ""
            p.add_thread(th)
        ex = ey = 0
        for x, y, c in ref["commands"]:
            if c in (0, 1):
                dx, dy = x - ex, y - ey
                n = math.ceil(max(abs(dx), abs(dy)) / limit)
                for i in range(1, n):  # (round() is half-to-even, as pyRound)
                    p.add_stitch_absolute(pe.JUMP, ex + round(dx * i / n), ey + round(dy * i / n))
                p.add_stitch_absolute(cmd[c], x, y)
                ex, ey = x, y
            else:
                p.add_stitch_absolute(cmd[c], ex, ey)
        pe.write(p, f"{prefix}.{fmt}", {"trims": True} if fmt == "jef" else None)


def main(src, dst, version="6"):
    ref = json.load(open(src))
    p = pe.EmbPattern()
    for t in ref["threads"]:
        th = pe.EmbThread()
        th.set_color(*[int(t["color"][i:i + 2], 16) for i in (1, 3, 5)])
        th.description = t.get("description")
        th.brand = ""
        p.add_thread(th)
    for x, y, c in ref["commands"]:
        p.add_stitch_absolute(c, x, y)
    pe.write_pes(p, dst, {"version": version})


if __name__ == "__main__":
    if sys.argv[1] == "oracle":
        for f in sys.argv[2:]:
            oracle(f)
    elif sys.argv[1] == "pywriter":
        pywriter(*sys.argv[2:])
    else:
        main(*sys.argv[1:])
