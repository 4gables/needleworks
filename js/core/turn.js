/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// A quarter turn of a pattern, for the page and the engine alike (design.js hands it on).

// A quarter turn of a pattern (y down): clockwise turns a sideways design into the machine's hoop, and back.
export function turnPattern(p, clockwise = true) {
  // (a stitch's fourth value, its role, goes with it: core/design.js `ROLE`)
  return { ...p, stitches: p.stitches.map((s) => { const [x, y, c] = s, t = clockwise ? [-y, x, c] : [y, -x, c]; if (s.length > 3) t.push(s[3]); return t; }) };
}
