/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Colour maths used by more than one part: CIELAB (D65) and WCAG relative luminance from sRGB. (Three copies of the
// first and two of the second until 2026-11.) The machine's own red-mean match is threads.js `colorDistance`; the
// picture matcher's CIEDE2000 is in digitize.js.

// "#rrggbb" or "rgb(r, g, b)" -> [r, g, b] (0-255); white when it can't be read
export const rgbOf = (c) => (c[0] === "#" ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : (c.match(/[\d.]+/g) || [255, 255, 255]).slice(0, 3).map(Number));

const linear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const cube = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

// CIELAB of sRGB 0-255
export function labOf(r, g, b) {
  return labLinear(linear(r), linear(g), linear(b));
}
// CIELAB of linear-light RGB 0-1 (threads mixed by how much of the cloth each covers mix in linear light)
export function labLinear(R, G, B) {
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  return [116 * cube(Y) - 16, 500 * (cube(X) - cube(Y)), 200 * (cube(Y) - cube(Z))];
}
export const lab = ([r, g, b]) => labOf(r, g, b);

// sRGB 0-255 -> linear light 0-1
export const toLinear = linear;
// relative luminance (WCAG) of [r, g, b]
export const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
