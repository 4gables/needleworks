// Build a stitch pattern block by block (mm in, 0.1 mm out). Port of needleworks/pes.py Design.
import { COLOR_CHANGE, END, JUMP, STITCH, TRIM, writePES } from "./formats.js";
import { MARGIN } from "./machines.js";

export class Design {
  constructor(hoop) { this.hoop = hoop; this.stitches = []; this.threads = []; this.cur = null; this.started = false; }

  color(hex, description = "") {
    if (this.started) this.stitches.push([0, 0, COLOR_CHANGE]);
    this.threads.push({ color: hex, description, brand: "" });
    this.cur = null;
  }

  st(cmd, [x, y]) { this.stitches.push([x * 10, y * 10, cmd]); }

  // stitch a run of points; jumps (with a trim) if it starts away from the needle
  path(pts, lock = true) {
    if (!pts.length) return;
    const far = !this.cur || Math.hypot(pts[0][0] - this.cur[0], pts[0][1] - this.cur[1]) > 2.0;
    if (this.cur && far) this.stitches.push([0, 0, TRIM]);
    if (far) {
      this.st(JUMP, pts[0]);
      if (lock) {
        let d = pts.length > 1 ? [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]] : [1, 0];
        const L = Math.max(Math.hypot(...d), 1e-9); d = [(d[0] / L) * 0.5, (d[1] / L) * 0.5];
        const p = pts[0], q = [p[0] + d[0], p[1] + d[1]];
        for (const r of [p, q, p, q, p]) this.st(STITCH, r);
      }
    } else this.st(STITCH, pts[0]);
    for (let i = 1; i < pts.length; i++) this.st(STITCH, pts[i]);
    this.cur = pts[pts.length - 1]; this.started = true;
  }

  finish() {
    if (this.cur) {
      const c = this.cur;
      for (const r of [[c[0] + 0.3, c[1]], c, [c[0], c[1] + 0.3], c]) this.st(STITCH, r);
    }
    this.stitches.push([0, 0, END]);
    this.check();
    return this;
  }

  bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y, c] of this.stitches) if (c === STITCH || c === JUMP) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return [x0 / 10, y0 / 10, x1 / 10, y1 / 10];
  }

  check() {
    const [x0, y0, x1, y1] = this.bounds(), w = x1 - x0, h = y1 - y0;
    const lw = this.hoop.w - 2 * MARGIN, lh = this.hoop.h - 2 * MARGIN;
    if (w > lw || h > lh) {
      const err = new Error(`This design is ${w.toFixed(1)} × ${h.toFixed(1)} mm, but the ${this.hoop.name} fits ${lw} × ${lh} mm.`);
      err.overBy = Math.max(w / lw, h / lh);
      throw err;
    }
  }

  pattern() { return { stitches: this.stitches, threads: this.threads }; }
  toBytes() { return writePES(this.pattern()); }
}
