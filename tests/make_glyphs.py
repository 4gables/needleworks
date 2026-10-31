# Writes js/core/glyphs.js: which characters each bundled font has (its cmap), so the Design tab can say exactly which
# letters a font lacks. Run after adding or changing a font: .venv/bin/python -I tests/make_glyphs.py
import re, pathlib
from fontTools.ttLib import TTFont

root = pathlib.Path(__file__).resolve().parent.parent
css = (root / "css/app.css").read_text()
out = []
for fam, src in re.findall(r'font-family: "(NW [^"]+)"; src: url\("\.\./fonts/([^"]+)"\)', css):
    cps = sorted(TTFont(root / "fonts" / src).getBestCmap())
    runs, last = [], -1
    for c in cps:
        if runs and c == runs[-1][1] + 1: runs[-1][1] = c
        else: runs.append([c, c])
    # each run: gap from the previous run's end, then its length - 1, both hex
    enc, prev = [], 0
    for a, b in runs:
        enc.append(f"{a - prev:x}" if a == b else f"{a - prev:x}+{b - a:x}")
        prev = b
    out.append(f'  "{fam}": "{",".join(enc)}",')
head = ("/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */\n"
        "// The characters each bundled font has, read from its own cmap by tests/make_glyphs.py (don't edit by hand).\n"
        "// Runs of code points: hex gap from the last run's end, then \"+\" and the run's length - 1 when longer than one.\n")
body = "const RUNS = {\n" + "\n".join(out) + "\n};\n"
tail = """const cache = new Map();
// the set of code points `family` has (null for a family we don't bundle)
export function glyphs(family) {
  if (!Object.hasOwn(RUNS, family)) return null;
  if (!cache.has(family)) {
    const set = new Set();
    let at = 0;
    for (const r of RUNS[family].split(",")) {
      const [gap, len = "0"] = r.split("+");
      const a = at + parseInt(gap, 16), b = a + parseInt(len, 16);
      for (let c = a; c <= b; c++) set.add(c);
      at = b;
    }
    cache.set(family, set);
  }
  return cache.get(family);
}
"""
(root / "js/core/glyphs.js").write_text(head + body + tail)
