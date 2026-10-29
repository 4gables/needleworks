// Brother PEC thread palette (index 1..64) and colour matching, ported from pyembroidery.
// Index 0 is "unknown" and never matched.
export const PEC_THREADS = [
  null,
  ["Prussian Blue", 14, 31, 124],
  ["Blue", 10, 85, 163],
  ["Teal Green", 0, 135, 119],
  ["Cornflower Blue", 75, 107, 175],
  ["Red", 237, 23, 31],
  ["Reddish Brown", 209, 92, 0],
  ["Magenta", 145, 54, 151],
  ["Light Lilac", 228, 154, 203],
  ["Lilac", 145, 95, 172],
  ["Mint Green", 158, 214, 125],
  ["Deep Gold", 232, 169, 0],
  ["Orange", 254, 186, 53],
  ["Yellow", 255, 255, 0],
  ["Lime Green", 112, 188, 31],
  ["Brass", 186, 152, 0],
  ["Silver", 168, 168, 168],
  ["Russet Brown", 125, 111, 0],
  ["Cream Brown", 255, 255, 179],
  ["Pewter", 79, 85, 86],
  ["Black", 0, 0, 0],
  ["Ultramarine", 11, 61, 145],
  ["Royal Purple", 119, 1, 118],
  ["Dark Gray", 41, 49, 51],
  ["Dark Brown", 42, 19, 1],
  ["Deep Rose", 246, 74, 138],
  ["Light Brown", 178, 118, 36],
  ["Salmon Pink", 252, 187, 197],
  ["Vermilion", 254, 55, 15],
  ["White", 240, 240, 240],
  ["Violet", 106, 28, 138],
  ["Seacrest", 168, 221, 196],
  ["Sky Blue", 37, 132, 187],
  ["Pumpkin", 254, 179, 67],
  ["Cream Yellow", 255, 243, 107],
  ["Khaki", 208, 166, 96],
  ["Clay Brown", 209, 84, 0],
  ["Leaf Green", 102, 186, 73],
  ["Peacock Blue", 19, 74, 70],
  ["Gray", 135, 135, 135],
  ["Warm Gray", 216, 204, 198],
  ["Dark Olive", 67, 86, 7],
  ["Flesh Pink", 253, 217, 222],
  ["Pink", 249, 147, 188],
  ["Deep Green", 0, 56, 34],
  ["Lavender", 178, 175, 212],
  ["Wisteria Violet", 104, 106, 176],
  ["Beige", 239, 227, 185],
  ["Carmine", 247, 56, 102],
  ["Amber Red", 181, 75, 100],
  ["Olive Green", 19, 43, 26],
  ["Dark Fuchsia", 199, 1, 86],
  ["Tangerine", 254, 158, 50],
  ["Light Blue", 168, 222, 235],
  ["Emerald Green", 0, 103, 62],
  ["Purple", 78, 41, 144],
  ["Moss Green", 47, 126, 32],
  ["Flesh Pink", 255, 204, 204],
  ["Harvest Gold", 255, 217, 17],
  ["Electric Blue", 9, 91, 166],
  ["Lemon Yellow", 240, 249, 112],
  ["Fresh Green", 227, 243, 91],
  ["Applique Material", 255, 153, 0],
  ["Applique Position", 255, 240, 141],
  ["Applique", 255, 200, 200],
];
// 62-64 aren't threads: Brother machines read them as applique steps and show "Applique Material/Position" instead
// of a colour (pyembroidery called 62/63 Orange and Cream Yellow; fixed in inkstitch/pyembroidery#140, checked on
// an SE700 against its manual). Never match a colour to them.
export const PEC_MATCH = PEC_THREADS.map((t, i) => (i >= 62 ? null : t));

export const PEC_BLANK_ICON = [0, 0, 0, 0, 0, 0, 240, 255, 255, 255, 255, 15, 8, 0, 0, 0, 0, 16, 4, 0, 0, 0, 0, 32, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 64, 4, 0, 0, 0, 0, 32, 8, 0, 0, 0, 0, 16, 240, 255, 255, 255, 255, 15, 0, 0, 0, 0, 0, 0];

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// "red mean" colour distance (compuphase.com/cmetric.htm), integer maths as in pyembroidery
export function colorDistance(r1, g1, b1, r2, g2, b2) {
  const rm = pyRound((r1 + r2) / 2);
  const r = r1 - r2, g = g1 - g2, b = b1 - b2;
  return (((512 + rm) * r * r) >> 8) + 4 * g * g + (((767 - rm) * b * b) >> 8);
}

// values: array of [name, r, g, b] or null. Ties go to the later entry, like pyembroidery.
export function nearestIndex(rgb, values) {
  let best = null, bestD = Infinity;
  values.forEach((t, i) => {
    if (!t) return;
    const d = colorDistance(rgb[0], rgb[1], rgb[2], t[1], t[2], t[3]);
    if (d <= bestD) { bestD = d; best = i; }
  });
  return best;
}

export function pecThread(i) {
  const t = PEC_THREADS[i];
  return t ? { index: i, name: t[0], hex: rgbToHex([t[1], t[2], t[3]]) } : { index: i, name: "Unknown", hex: "#000000" };
}

export function nearestBrotherThread(hex) {
  return pecThread(nearestIndex(hexToRgb(hex), PEC_MATCH));
}

// Python's round(): half to even
export function pyRound(v) {
  const f = Math.floor(v), d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
