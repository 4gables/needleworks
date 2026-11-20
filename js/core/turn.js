/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// A quarter turn of a pattern, for the page and the engine alike (design.js hands it on).

// A quarter turn of a pattern (y down): clockwise turns a sideways design into the machine's hoop, and back.
export function turnPattern(p, clockwise = true) {
  return { ...p, stitches: p.stitches.map(([x, y, c]) => (clockwise ? [-y, x, c] : [y, -x, c])) };
}
