"""Write a PES fixture from a commands JSON with pyembroidery (the writer oracle for tests/formats.test.mjs).

.venv/bin/python tests/make_fixture.py tests/fixtures/ashley_v3_commands.json tests/fixtures/ashley_v3.pes [version]
Version defaults to 6 (full PES v6: CEmbOne/CSewSeg + PEC), what writePES writes.
"""
import json
import sys

import pyembroidery as pe


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
    main(*sys.argv[1:])
