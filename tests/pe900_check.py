"""Independent check that PES files will sew on a Brother PE900 (5x7 hoop).

Uses pyembroidery (the reader/writer Ink/Stitch ships, whose PES files are sewn on Brother machines every day)
plus a raw byte walk of the PEC block, so it shares no code with js/core/formats.js.

usage: .venv/bin/python tests/pe900_check.py file.pes [more.pes ...]   -> exit 1 if any file fails
"""
import io
import math
import struct
import sys
from collections import Counter

import pyembroidery as pe

FIELD_W, FIELD_H = 130.0, 180.0     # PE900 5x7 sewable field, mm
MAX_STITCH = 12.1                   # longest needle move we produce (mm); stricter than sold designs (some reach 15 mm)
TINY = 0.3                          # stitches shorter than this pile thread / break it, unless part of a tie-in
MAX_PER_MM2 = 24                    # needle hits in any 1x1 mm cell within one colour block (nest / broken needle risk);
                                    # (24 = densest spot in the sold designs we compared; script loops crossing on a tight
                                    # curve reach 23). Separate blocks are separate fabric steps, so tie-ins may share a spot
MAX_BLOCKS = 99                     # colour blocks the machine will step through


def raw_pec(b):
    """Walk the PEC block by hand: header fields, colour list, every stitch command."""
    out = {}
    assert b[:4] == b"#PES", "no #PES signature"
    pec = struct.unpack_from("<I", b, 8)[0]
    assert 12 <= pec < len(b), "PEC offset out of range"
    assert b[pec:pec + 3] == b"LA:", "PEC label missing"
    assert b[pec + 19] == 0x0D, "PEC label not terminated"
    ncol = b[pec + 48] + 1
    out["pec_colors"] = ncol
    out["pec_palette"] = list(b[pec + 49:pec + 49 + ncol])
    assert all(0 < c <= 64 for c in out["pec_palette"]), "PEC palette index outside Brother's 64 colours"
    blk = pec + 512
    blen = b[blk + 2] | b[blk + 3] << 8 | b[blk + 4] << 16
    w, h = struct.unpack_from("<HH", b, blk + 8)
    out["pec_wh"] = (w / 10, h / 10)
    i, x, y, cmds, toggles = blk + 20, 0, 0, [], []
    end = blk + blen
    while i < end:
        if b[i] == 0xFF:
            cmds.append(("END", x, y)); i += 1; break
        if b[i] == 0xFE and b[i + 1] == 0xB0:
            toggles.append(b[i + 2]); cmds.append(("COLOR", x, y)); i += 3; continue

        def val(i):
            v = b[i]
            if v & 0x80:
                flag = v & 0x70
                n = ((v & 0x0F) << 8) | b[i + 1]
                if n > 0x7FF:
                    n -= 0x1000
                return n, flag, i + 2
            return (v - 0x80 if v > 0x3F else v), 0, i + 1
        dx, fx, i = val(i)
        dy, fy, i = val(i)
        x += dx; y += dy
        kind = "TRIM" if (fx | fy) & 0x20 else "JUMP" if (fx | fy) & 0x10 else "STITCH"
        cmds.append((kind, x, y))
    out["cmds"], out["toggles"] = cmds, toggles
    out["block_len_ok"] = i == end - 0 or i <= end
    return out


def check(path):
    b = open(path, "rb").read()
    errs, info = [], {}

    # 1. independent structure walk
    try:
        r = raw_pec(b)
    except Exception as e:  # noqa: BLE001
        return [f"PEC walk failed: {e}"], info
    cmds = r["cmds"]
    if not cmds or cmds[-1][0] != "END":
        errs.append("no END marker in the stitch data")
    if any(t != (2 if k % 2 == 0 else 1) for k, t in enumerate(r["toggles"])):
        errs.append(f"colour-change toggle bytes not 2,1,2…: {r['toggles']}")
    blocks = len(r["toggles"]) + 1
    if r["pec_colors"] != blocks:
        errs.append(f"PEC header says {r['pec_colors']} colours but the stitches have {blocks} blocks")
    if blocks > MAX_BLOCKS:
        errs.append(f"{blocks} colour blocks")

    # 2. pyembroidery reads it and writes back the exact same bytes
    p = pe.read_pes(path)
    if p is None or not p.stitches:
        return errs + ["pyembroidery could not read it"], info
    buf = io.BytesIO()
    pe.write_pes(p, buf, {"version": "6t"})
    info["identical_to_pyembroidery"] = buf.getvalue() == b
    sts = [(x / 10, y / 10, c & pe.COMMAND_MASK) for x, y, c in p.stitches]

    # 3. size against the hoop, and the PEC header's own size field
    pts = [(x, y) for x, y, c in sts if c == pe.STITCH]
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    y0, y1 = min(p[1] for p in pts), max(p[1] for p in pts)
    w, h = x1 - x0, y1 - y0
    info["size_mm"] = (round(w, 1), round(h, 1))
    if w > FIELD_W or h > FIELD_H:
        errs.append(f"{w:.1f} x {h:.1f} mm is bigger than the {FIELD_W:.0f} x {FIELD_H:.0f} mm field")
    if abs(r["pec_wh"][0] - w) > 0.15 or abs(r["pec_wh"][1] - h) > 0.15:
        errs.append(f"PEC size field {r['pec_wh']} doesn't match the stitches {w:.1f} x {h:.1f}")

    # 4. needle moves: longest stitch, tiny stitches, trims before long travel
    longest, tiny, prev, after_jump = 0.0, 0, None, 0
    run = 0
    for x, y, c in sts:
        if c == pe.STITCH and prev is not None:
            d = math.hypot(x - prev[0], y - prev[1])
            longest = max(longest, d)
            # tie-ins after a jump and tie-offs repeat 0.3-0.5 mm on purpose; count tiny ones elsewhere
            if 0 < d < TINY and after_jump > 6:
                tiny += 1
            after_jump += 1
        if c in (pe.JUMP, pe.TRIM, pe.COLOR_CHANGE):
            after_jump = 0
        if c in (pe.STITCH, pe.JUMP):
            prev = (x, y)
        run += 1
    info["longest_stitch_mm"] = round(longest, 2)
    info["tiny_stitches"] = tiny
    if longest > MAX_STITCH:
        errs.append(f"a {longest:.1f} mm stitch (limit {MAX_STITCH})")
    if tiny > 0.02 * len(pts):
        errs.append(f"{tiny} stitches under {TINY} mm ({100 * tiny / len(pts):.1f}%)")

    # 5. needle pile-up: penetrations per 1 mm cell, per colour block
    blk, cells = 0, Counter()
    for x, y, c in sts:
        if c == pe.COLOR_CHANGE:
            blk += 1
        elif c == pe.STITCH:
            cells[(blk, math.floor(x), math.floor(y))] += 1
    info["max_per_mm2"] = max(cells.values())
    if info["max_per_mm2"] > MAX_PER_MM2:
        hot = [k for k, v in cells.items() if v > MAX_PER_MM2]
        errs.append(f"{len(hot)} spots with more than {MAX_PER_MM2} needle hits per mm² (max {info['max_per_mm2']})")

    info.update(stitches=len(pts), blocks=blocks, threads=len(p.threadlist))
    return errs, info


if __name__ == "__main__":
    bad = 0
    for f in sys.argv[1:]:
        errs, info = check(f)
        bad += bool(errs)
        print(("FAIL " if errs else "ok   ") + f, info)
        for e in errs:
            print("     -", e)
    sys.exit(1 if bad else 0)
