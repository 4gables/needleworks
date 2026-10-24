"""Build pyembroidery patterns block by block and write machine files (PES for Brother)."""
import io
import os

import numpy as np
import pyembroidery as pe

from . import machines

MAX_STITCH = 7.0  # anything longer is split / treated as a jump


class Design:
    def __init__(self, hoop=None):
        self.p = pe.EmbPattern()
        self.cur = None
        self.started = False
        self.hoop = hoop or machines.hoop()

    def color(self, hex_rgb, name, description=""):
        if self.started:
            self.p.add_command(pe.COLOR_CHANGE)
        t = pe.EmbThread()
        t.set_hex_color(hex_rgb)
        t.description = name
        t.brand = description
        self.p.add_thread(t)
        self.cur = None

    def _st(self, cmd, xy):
        self.p.add_stitch_absolute(cmd, xy[0] * 10, xy[1] * 10)  # pyembroidery units = 0.1mm

    def path(self, pts, lock=True):
        """Stitch a sequence of points; jumps (with trim) if it starts far from the needle."""
        pts = np.asarray(pts, float)
        if len(pts) == 0:
            return
        far = self.cur is None or np.linalg.norm(pts[0] - self.cur) > 2.0
        if self.cur is not None and far:
            self.p.add_command(pe.TRIM)
        if far:
            self._st(pe.JUMP, pts[0])
            if lock:
                self._lock(pts)
        else:
            self._st(pe.STITCH, pts[0])
        for q in pts[1:]:
            self._st(pe.STITCH, q)
        self.cur = pts[-1]
        self.started = True

    def _lock(self, pts):
        # tiny back-and-forth tie-in along the first segment
        d = pts[1] - pts[0] if len(pts) > 1 else np.array([1.0, 0])
        d = d / max(np.linalg.norm(d), 1e-9) * 0.5
        for q in (pts[0], pts[0] + d, pts[0], pts[0] + d, pts[0]):
            self._st(pe.STITCH, q)

    def tie_off(self):
        if self.cur is None:
            return
        c = self.cur
        for q in (c + [0.3, 0], c, c + [0, 0.3], c):
            self._st(pe.STITCH, q)

    def finish(self):
        self.tie_off()
        self.p.add_command(pe.END)
        check(self.p, self.hoop)
        return self

    def to_bytes(self):
        buf = io.BytesIO()
        write(self.p, buf, self.hoop["format"])
        return buf.getvalue()

    def save(self, path):
        self.finish()
        with open(path, "wb") as f:
            f.write(self.to_bytes())


def write(pattern, stream, fmt="pes"):
    if fmt == "pes":
        pe.write_pes(pattern, stream, {"version": "6t", "max_stitch": MAX_STITCH * 10, "max_jump": 1210})
    else:
        raise ValueError(f"unsupported machine format: {fmt}")


def check(p, hoop=None):
    hoop = hoop or machines.hoop()
    x0, y0, x1, y1 = p.bounds()
    w, h = (x1 - x0) / 10, (y1 - y0) / 10
    lim_w, lim_h = hoop["w"] - 2 * machines.MARGIN, hoop["h"] - 2 * machines.MARGIN
    if w > lim_w or h > lim_h:
        raise ValueError(f"design {w:.1f} x {h:.1f} mm is bigger than the {hoop['name']} hoop allows "
                         f"({lim_w:.0f} x {lim_h:.0f} mm)")
    return w, h


def read_bytes(data, filename="design.pes"):
    """Read any format pyembroidery understands (PES, DST, JEF, EXP, VP3, ...) from memory."""
    ext = os.path.splitext(filename)[1].lower().lstrip(".") or "pes"
    for fmt in pe.supported_formats():
        if fmt.get("extension") == ext and fmt.get("reader"):
            p = pe.EmbPattern()
            fmt["reader"].read(io.BytesIO(data), p, {})
            return p
    raise ValueError(f"can't read .{ext} files")


def stats(src):
    p = pe.read(src) if isinstance(src, str) else src
    x0, y0, x1, y1 = p.bounds()
    st = p.stitches
    n = sum(1 for s in st if (s[2] & pe.COMMAND_MASK) == pe.STITCH)
    jumps = sum(1 for s in st if (s[2] & pe.COMMAND_MASK) == pe.JUMP)
    longest = 0.0
    for a, b in zip(st, st[1:]):
        if (b[2] & pe.COMMAND_MASK) == pe.STITCH and (a[2] & pe.COMMAND_MASK) == pe.STITCH:
            longest = max(longest, np.hypot(b[0] - a[0], b[1] - a[1]) / 10)
    return dict(size_mm=(round((x1 - x0) / 10, 1), round((y1 - y0) / 10, 1)), stitches=n, jumps=jumps,
                colors=len(p.threadlist), longest_stitch_mm=round(longest, 2))
