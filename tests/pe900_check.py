"""Independent check that PES files will sew on a Brother PE900 (5x7 hoop), or, for a file whose name holds
"6x10", on a 160 x 260 mm field (Brother NQ1700E class; such a file bigger than 130 x 180 must also carry the
160 x 260 page in its PES header, where PE-DESIGN reads the hoop).

Uses pyembroidery (the reader/writer Ink/Stitch ships, whose PES files are sewn on Brother machines every day)
plus a raw byte walk of the PEC block, so it shares no code with js/core/formats.js.

usage: .venv/bin/python tests/pe900_check.py [--writer-only] file.pes [more.pes ...]   -> exit 1 if any file fails

A DST, EXP or VP3 file beside a PES (same name: the batch pages save them, docs/formats-out-spec.md section 9) is read
with pyembroidery and must sew the PES file's needle points, as the Brother machine reads them from the PEC block,
with as many colour changes.
"""
import os
import io
import math
import struct
import sys
from collections import Counter

import pyembroidery as pe

FIELD_W, FIELD_H = 130.0, 180.0     # PE900 5x7 sewable field, mm
BIG_W, BIG_H = 160.0, 260.0         # the 6" x 10" field (files named *6x10*)
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
    out["applique_codes"] = [c for c in out["pec_palette"] if c >= 62]
    blk = pec + 512
    blen = b[blk + 2] | b[blk + 3] << 8 | b[blk + 4] << 16
    w, h = struct.unpack_from("<HH", b, blk + 8)
    out["pec_wh"] = (w / 10, h / 10)
    # Brother machines read the two fields after 0x1E0/0x1B0 as the design box's top-left relative to the origin
    # (0x9000 | -left, 0x9000 | -top) and decode stitches after them. pyembroidery writes its opening jump there,
    # which a machine drops: Ashley's PE900 showed those files shifted and clipped to about half (2026-10-27).
    p1, p2 = struct.unpack_from(">HH", b, blk + 16)
    s12 = lambda v: (v & 0xFFF) - 0x1000 if v & 0x800 else v & 0xFFF  # noqa: E731
    out["box"] = (-s12(p1), -s12(p2), w, h)
    out["box_flags"] = (p1 >> 12, p2 >> 12)
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
    out["block_len_ok"] = i <= end           # the END byte lies inside what the length field covers (some pad after)
    out["after_block"] = len(b) - end        # thumbnails (and the v6 addendum) follow
    return out


def raw_sewseg(b):
    """Walk the PES section's CEmbOne/CSewSeg design block by hand (what PE-Design opens; machines sew the PEC block).
    Returns (w, h, transform, moves), or None for a PEC-only (truncated) PES."""
    pec = struct.unpack_from("<I", b, 8)[0]
    one = b.find(b"\x07\x00CEmbOne", 12, pec)
    seg = b.find(b"\x07\x00CSewSeg", one, pec) if one >= 0 else -1
    if seg < 0:
        return None
    o = one + 9
    transform = struct.unpack_from("<6f", b, o + 16)
    w, h = struct.unpack_from("<HH", b, o + 46)
    i, moves = seg + 9, []
    while True:
        flag, _color, n = struct.unpack_from("<HHH", b, i)
        pts = [struct.unpack_from("<hh", b, i + 6 + 4 * k) for k in range(n)]
        i += 6 + 4 * n
        moves += [("JUMP", *pts[-1])] if flag == 1 else [("STITCH", *q) for q in pts]
        if struct.unpack_from("<H", b, i)[0] != 0x8003:
            break
        i += 2
    return w, h, transform, moves


def needle_moves(cmds):
    """Stitch positions, dropping the zero-length anchors PEC puts after jumps."""
    out, last = [], None
    for k, x, y in cmds:
        if k == "STITCH" and (x, y) != last:
            out.append((x, y))
        if k in ("STITCH", "JUMP", "TRIM"):
            last = (x, y)
    return out


def check(path):
    b = open(path, "rb").read()
    errs, info = [], {}
    FW, FH = (BIG_W, BIG_H) if "6x10" in path.rsplit("/", 1)[-1] else (FIELD_W, FIELD_H)

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
    if not r["block_len_ok"]:
        errs.append("the stitches run past the PEC stitch block's length field")
    if r["after_block"] < (blocks + 1) * 228:
        errs.append(f"room for {r['after_block'] // 228} thumbnails after the stitches, need {blocks + 1}")
    if r["applique_codes"]:
        errs.append(f"PEC palette uses {r['applique_codes']}: Brother machines read 62-64 as applique steps, not threads")
    if r["pec_colors"] != blocks:
        errs.append(f"PEC header says {r['pec_colors']} colours but the stitches have {blocks} blocks")
    if blocks > MAX_BLOCKS:
        errs.append(f"{blocks} colour blocks")

    # 1a. every stitch inside the design box the machine reads from the PEC block
    bx, by, bw, bh = r["box"]
    pts0 = [(x, y) for k, x, y in cmds if k in ("STITCH", "JUMP")]
    if r["box_flags"] != (9, 9):
        errs.append(f"design box fields aren't Brother's 0x9000 form: flags {r['box_flags']}")
    if any(x < bx - 1 or x > bx + bw + 1 or y < by - 1 or y > by + bh + 1 for x, y in pts0):
        vx = max(0, min(bx + bw, max(x for x, _ in pts0)) - max(bx, min(x for x, _ in pts0)))
        vy = max(0, min(by + bh, max(y for _, y in pts0)) - max(by, min(y for _, y in pts0)))
        errs.append(f"stitches fall outside the design box: a Brother machine loads it shifted and clipped "
                    f"(about {vx / 10:.1f} x {vy / 10:.1f} mm = {vx / 254:.2f}\" x {vy / 254:.2f}\" shown)")

    # 1b. a PES design block, if present, must and hold the same stitches as the PEC block, inside the 130x180 hoop page
    try:
        sew = raw_sewseg(b)
    except struct.error:
        sew = False   # a layout we don't know (PE-Design v10's CSewSeg differs); only ours (v6) must parse
        if b[:8] == b"#PES0060":
            errs.append("PES design block is damaged")
    if sew is False:
        pass
    elif sew is None:
        info["pes_block_mm"] = "none (PEC only)"
    else:
        sw, sh, tf, smoves = sew
        a, bm = needle_moves(cmds), needle_moves(smoves)
        if len(a) != len(bm) or not a:
            errs.append(f"PES design block has {len(bm)} stitches, PEC has {len(a)}")
        else:
            ox, oy = a[0][0] - bm[0][0], a[0][1] - bm[0][1]
            if any((p[0] - q[0], p[1] - q[1]) != (ox, oy) for p, q in zip(a, bm)):
                errs.append("PES design block stitches differ from the PEC stitches")
        info["pes_block_mm"] = (sw / 10, sh / 10)
        if (abs(sw / 10 - r["pec_wh"][0]) > 0.15) or (abs(sh / 10 - r["pec_wh"][1]) > 0.15):
            errs.append(f"PES design block size {sw / 10} x {sh / 10} doesn't match PEC {r['pec_wh']}")
        # translation puts the block's bottom-left on the 130x180 page, offset by (350, 100) like pyembroidery/PE-Design
        # (the page's centre is at 1000, 1000 whatever the hoop: 350 and 100 are that less half of 130 x 180 mm)
        if not (1000 - FW * 5 <= tf[4] <= 1000 + FW * 5 and 1000 - FH * 5 <= tf[5] <= 1000 + FH * 5 + sh):
            errs.append(f"PES design block placed off the hoop page: {tf}")

    # 2. pyembroidery reads it (box fields removed, so it decodes from the origin like the machine) and writes
    #    back the exact same bytes
    blk = struct.unpack_from("<I", b, 8)[0] + 512
    nb = bytearray(b[:blk + 16] + b[blk + 20:])
    nlen = (nb[blk + 2] | nb[blk + 3] << 8 | nb[blk + 4] << 16) - 4
    nb[blk + 2:blk + 5] = bytes([nlen & 0xFF, nlen >> 8 & 0xFF, nlen >> 16 & 0xFF])
    p = pe.read_pes(io.BytesIO(bytes(nb)))
    if p is None or not p.stitches:
        return errs + ["pyembroidery could not read it"], info
    buf = io.BytesIO()
    pe.write_pes(p, buf, {"version": 6})
    w = buf.getvalue()
    # A pause between two blocks of one thread (the bookmark's and appliqué's fabric steps) keeps that thread's palette
    # index in our files, as Brother's in-the-hoop files do; pyembroidery reads it as a STOP and writes another index
    # there, so those bytes (in the PEC palette and the v6 colour list) always differ: reported as "except pauses".
    dup = {c for c in r["pec_palette"] if r["pec_palette"].count(c) > 1}
    diff = [i for i in range(len(w)) if w[i] != nb[i]] if len(w) == len(nb) else None
    info["identical_to_pyembroidery"] = (w == bytes(nb)) or ("except pauses" if diff and all(nb[i] in dup for i in diff) else False)
    sts = [(x / 10, y / 10, c & pe.COMMAND_MASK) for x, y, c in p.stitches]

    # 3. size against the hoop, and the PEC header's own size field
    pts = [(x, y) for x, y, c in sts if c == pe.STITCH]
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    y0, y1 = min(p[1] for p in pts), max(p[1] for p in pts)
    w, h = x1 - x0, y1 - y0
    info["size_mm"] = (round(w, 1), round(h, 1))
    if w > FW or h > FH:
        errs.append(f"{w:.1f} x {h:.1f} mm is bigger than the {FW:.0f} x {FH:.0f} mm field")
    # the PES header's page (v6: the two u16 after the five strings and 0, 0): 100 x 100 as always written, or the
    # 160 x 260 hoop for a design no 130 x 180 field holds (PE-DESIGN reads its hoop there; machines don't read it)
    if b[:8] == b"#PES0060":
        o = 16
        for _ in range(5):
            o += 1 + b[o]
        page = struct.unpack_from("<4H", b, o)
        need = (0, 0, 160, 260) if (min(w, h) > 130.05 or max(w, h) > 180.05) else (0, 0, 100, 100)
        info["page"] = page[2:]
        if page != need:
            errs.append(f"PES header page {page} for a {w:.1f} x {h:.1f} mm design, expected {need}")
    if abs(r["pec_wh"][0] - w) > 0.15 or abs(r["pec_wh"][1] - h) > 0.15:
        errs.append(f"PEC size field {r['pec_wh']} doesn't match the stitches {w:.1f} x {h:.1f}")

    # 4. needle moves: longest stitch, tiny stitches, trims before long travel
    longest, tiny, same, prev, after_jump = 0.0, 0, 0, None, 0
    run = 0
    for x, y, c in sts:
        if c == pe.STITCH and prev is not None:
            d = math.hypot(x - prev[0], y - prev[1])
            longest = max(longest, d)
            # tie-ins after a jump and tie-offs repeat 0.3-0.5 mm on purpose; count tiny ones elsewhere
            # (measured in whole 0.1 mm units, the file's own: in float mm an exact 0.3 mm stitch came out 0.29999999999999893
            # about half the time and counted, so a square-wave satin's 0.3 mm steps read as 48 tiny stitches on star_badge)
            d10 = math.hypot(round(x * 10) - round(prev[0] * 10), round(y * 10) - round(prev[1] * 10))
            if 0 < d10 < round(TINY * 10) and after_jump > 6:
                tiny += 1
            # a second hit in the same hole (line drawings had a quarter of their stitches doubled until 2026-10-30)
            if d == 0 and after_jump > 6:
                same += 1
            after_jump += 1
        if c in (pe.JUMP, pe.TRIM, pe.COLOR_CHANGE):
            after_jump = 0
        if c in (pe.STITCH, pe.JUMP):
            prev = (x, y)
        run += 1
    first = next(k for k, s in enumerate(sts) if s[2] == pe.STITCH)
    tie = [math.hypot(sts[k][0] - sts[k - 1][0], sts[k][1] - sts[k - 1][1]) for k in range(first + 1, first + 5)]
    info["start_tie_in_mm"] = round(max(tie), 2) if tie else 0
    info["longest_stitch_mm"] = round(longest, 2)
    info["tiny_stitches"] = tiny
    info["same_hole"] = same
    if longest > MAX_STITCH:
        errs.append(f"a {longest:.1f} mm stitch (limit {MAX_STITCH})")
    if same > 0.01 * len(pts):
        errs.append(f"{same} stitches into the hole the needle is already in ({100 * same / len(pts):.1f}%)")
    if tiny > 0.02 * len(pts):
        errs.append(f"{tiny} stitches under {TINY} mm ({100 * tiny / len(pts):.1f}%)")

    # 5. needle pile-up: penetrations per 1 mm cell, per colour block
    #    The machine's grid can sit at any 0.1 mm offset from ours, so every offset is checked (offset 0 alone passed
    #    towel files that reach 27 a few tenths over; found 2026-10-30): a window at any offset lies in a 2 x 2 group
    #    of offset-0 cells (its corner cell may itself be empty), so only groups holding more than the limit are scanned.
    blk, cells, pts_in = 0, Counter(), {}
    for x, y, c in sts:
        # (pyembroidery reads a pause between two blocks of the same thread as a STOP: still a new fabric step)
        if c in (pe.COLOR_CHANGE, pe.STOP):
            blk += 1
        elif c == pe.STITCH:
            X, Y = round(x * 10), round(y * 10)
            k = (blk, X // 10, Y // 10)
            cells[k] += 1
            pts_in.setdefault(k, []).append((X, Y))
    worst, hot = max(cells.values()), set()
    # (a window's corner cell can be empty while the three cells it reaches into are full: every occupied cell's
    # left/upper neighbours are corners too)
    corners = {(b, cx - i, cy - j) for (b, cx, cy) in cells for i in (0, 1) for j in (0, 1)}
    for (b, cx, cy) in corners:
        group = [(b, cx + i, cy + j) for i in (0, 1) for j in (0, 1)]
        if sum(cells.get(g, 0) for g in group) <= MAX_PER_MM2:
            continue
        near = [q for g in group for q in pts_in.get(g, [])]   # (not `pts`: that is every stitch, reported below)
        for ox in range(10):
            for oy in range(10):
                x0, y0 = cx * 10 + ox, cy * 10 + oy
                m = sum(1 for X, Y in near if x0 <= X < x0 + 10 and y0 <= Y < y0 + 10)
                worst = max(worst, m)
                if m > MAX_PER_MM2:
                    hot.add((b, cx, cy))
    info["max_per_mm2"] = worst
    if worst > MAX_PER_MM2:
        errs.append(f"{len(hot)} spots with more than {MAX_PER_MM2} needle hits per mm² at some grid offset (max {worst})")

    # 6. satin coverage: in a zigzag across a column, the gap between hits on the same edge. Sold designs measure
    #    0.30-0.42 mm; ours were 0.8 until 2026-10-29 (fabric showed through). Only judged with enough columns.
    stitch_pts = [(x, y) for x, y, c in sts if c == pe.STITCH]
    # (a satin is a long unbroken zigzag; fill rows meeting a near-parallel edge reverse a few times at most)
    same, run_gaps = [], []
    for k in range(2, len(stitch_pts)):
        a, b2, c2 = stitch_pts[k - 2], stitch_pts[k - 1], stitch_pts[k]
        v1, v2 = (b2[0] - a[0], b2[1] - a[1]), (c2[0] - b2[0], c2[1] - b2[1])
        l1, l2 = math.hypot(*v1), math.hypot(*v2)
        if 1.2 <= l1 <= 6 and 1.2 <= l2 <= 6 and (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2) < -0.85:
            # (along the edge, across the stitch: a short stitch's step in on a tight curve isn't a gap; 2026-10-31)
            run_gaps.append(abs((c2[0] - a[0]) * v1[1] - (c2[1] - a[1]) * v1[0]) / l1)
        else:
            if len(run_gaps) >= 6:
                same += run_gaps
            run_gaps = []
    if len(run_gaps) >= 6:
        same += run_gaps
    if len(same) >= 200:
        same.sort()
        info["satin_gap_mm"] = round(same[len(same) // 2], 2)
        if info["satin_gap_mm"] > 0.6 and not WRITER_ONLY:
            errs.append(f"sparse satin: {info['satin_gap_mm']} mm between hits on each edge (sold designs 0.30-0.42)")
    # 7. trims, and jumps of 1-5 mm the PE900 won't trim (left as loose thread)
    info["trims"] = sum(1 for _, _, c in sts if c == pe.TRIM)
    short, frm, last = 0, None, None
    for x, y, c in sts:
        if c == pe.JUMP:
            frm = frm or last
        elif c == pe.STITCH:
            if frm and 1 < math.hypot(x - frm[0], y - frm[1]) <= 5:
                short += 1
            frm, last = None, (x, y)
        elif c == pe.COLOR_CHANGE:
            frm = last = None
    info["short_jumps"] = short

    info.update(stitches=len(pts), blocks=blocks, threads=len(p.threadlist))
    more, seen = other_formats(path, cmds)
    errs += more
    if seen:
        info["same_as"] = "+".join(seen)
    return errs, info


def needle_points(entries):
    """Spec 2.6: STITCH positions, less one at the needle point kept before it. Entries are (kind, x, y)."""
    out = []
    for k, x, y in entries:
        if k == "STITCH" and (not out or out[-1] != (x, y)):
            out.append((x, y))
    return out


def other_formats(path, cmds):
    """The DST / EXP / VP3 beside a PES, read by pyembroidery, against the machine's reading of the PES (raw_pec)."""
    errs, seen = [], []
    # (a stitch at a jump's end is PEC's anchor: the PES writer adds it, the other formats carry only the pattern's)
    anchor = [k == "STITCH" and i and cmds[i - 1][0] in ("JUMP", "TRIM") and cmds[i - 1][1:] == (x, y) for i, (k, x, y) in enumerate(cmds)]
    pes_pts = []
    for (k, x, y), a in zip(cmds, anchor):
        if k == "STITCH" and (not pes_pts or pes_pts[-1][:2] != (x, y)):
            pes_pts.append((x, y, a))
    pes_changes = sum(1 for k, _, _ in cmds if k == "COLOR")
    names = {pe.STITCH: "STITCH", pe.JUMP: "JUMP", pe.TRIM: "TRIM", pe.COLOR_CHANGE: "COLOR", pe.END: "END"}
    for ext in ("dst", "exp", "vp3"):
        other = path[:-4] + "." + ext
        if not os.path.exists(other):
            continue
        seen.append(ext)
        p = pe.read(other)
        if p is None:
            errs.append(f"{ext}: pyembroidery can't read it"); continue
        got = needle_points([(names.get(c & pe.COMMAND_MASK, "?"), x, y) for x, y, c in p.stitches])
        i = j = 0
        while i < len(pes_pts) and j < len(got):
            if abs(pes_pts[i][0] - got[j][0]) < 1e-6 and abs(pes_pts[i][1] - got[j][1]) < 1e-6:
                i += 1; j += 1
            elif pes_pts[i][2]:
                i += 1
            else:
                break
        while i < len(pes_pts) and pes_pts[i][2]:
            i += 1
        if i < len(pes_pts) or j < len(got):
            errs.append(f"{ext}: needle point {j + 1} isn't the PES file's ({len(got)} points, the PES {len(pes_pts)})")
        changes = sum(1 for _, _, c in p.stitches if c & pe.COMMAND_MASK == pe.COLOR_CHANGE)
        if changes != pes_changes:
            errs.append(f"{ext}: {changes} colour changes, the PES {pes_changes}")
        if not p.stitches or p.stitches[-1][2] & pe.COMMAND_MASK != pe.END:
            errs.append(f"{ext}: no END")
    return errs, seen


# --writer-only: judge the file format only, not stitch quality (the golden files freeze old stitches on purpose)
WRITER_ONLY = "--writer-only" in sys.argv

if __name__ == "__main__":
    bad = 0
    for f in [a for a in sys.argv[1:] if a != "--writer-only"]:
        errs, info = check(f)
        bad += bool(errs)
        print(("FAIL " if errs else "ok   ") + f, info)
        for e in errs:
            print("     -", e)
    sys.exit(1 if bad else 0)
