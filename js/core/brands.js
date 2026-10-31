/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Spool numbers in the thread brand people actually own: the nearest spool to a colour, overall or among the ones
// they've listed. Labels only; the PES file always carries Brother PEC colours.
import { BRAND_CHARTS as OTHERS } from "./brandcharts.js";
import { PEC_THREADS, hexToRgb, rgbToHex } from "./threads.js";

// Brother Embroidery thread: the numbers on the spools for the 61 colours the machine names (Brother's own list,
// support.brother.com Artspira thread names), coloured as the PEC palette, so "Brother 800 Red" is exactly the
// machine's Red. Most PE900 owners' spools are these.
const BROTHER_NUM = { "Prussian Blue": "007", Blue: "405", "Teal Green": "534", "Cornflower Blue": "070", Red: "800", "Reddish Brown": "337",
  Magenta: "620", "Light Lilac": "810", Lilac: "612", "Mint Green": "502", "Deep Gold": "214", Orange: "208", Yellow: "205", "Lime Green": "513",
  Brass: "328", Silver: "005", "Russet Brown": "330", "Cream Brown": "010", Pewter: "704", Black: "900", Ultramarine: "406", "Royal Purple": "869",
  "Dark Gray": "707", "Dark Brown": "058", "Deep Rose": "086", "Light Brown": "323", "Salmon Pink": "079", Vermilion: "030", White: "001",
  Violet: "613", Seacrest: "542", "Sky Blue": "019", Pumpkin: "126", "Cream Yellow": "812", Khaki: "348", "Clay Brown": "339", "Leaf Green": "509",
  "Peacock Blue": "415", Gray: "817", "Warm Gray": "399", "Dark Olive": "517", "Flesh Pink": "124", Pink: "085", "Deep Green": "808",
  Lavender: "804", "Wisteria Violet": "607", Beige: "843", Carmine: "807", "Amber Red": "333", "Olive Green": "519", "Dark Fuchsia": "107",
  Tangerine: "209", "Light Blue": "017", "Emerald Green": "507", Purple: "614", "Moss Green": "515", "Harvest Gold": "206",
  "Electric Blue": "420", "Lemon Yellow": "202", "Fresh Green": "027" };
const seen = new Set();
const BRAND_CHARTS = { brother: { name: "Brother", rows: PEC_THREADS.slice(1, 62).filter((t) => BROTHER_NUM[t[0]] && !seen.has(t[0]) && seen.add(t[0]))
  .map(([name, r, g, b]) => `${rgbToHex([r, g, b]).slice(1)}|${BROTHER_NUM[name]}|${name}`).join(";") }, ...OTHERS };

// CIELAB (D65): the brand charts' approximate darks are told apart by eye, not by the red-mean distance the machine
// uses (that called black "Ivy", a dark green, in Robison-Anton)
function lab([r, g, b]) {
  const f = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const [R, G, B] = [f(r), f(g), f(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, y = 0.2126 * R + 0.7152 * G + 0.0722 * B, z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * t(y) - 16, 500 * (t(x) - t(y)), 200 * (t(y) - t(z))];
}

const charts = {};
function chart(brand) {
  if (!BRAND_CHARTS[brand]) return null;
  return (charts[brand] ||= BRAND_CHARTS[brand].rows.split(";").map((r) => {
    const [hex, num, name] = r.split("|");
    return { hex: "#" + hex, num, name, lab: lab(hexToRgb(hex)) };
  }));
}
export const BRANDS = Object.fromEntries(Object.entries(BRAND_CHARTS).map(([k, b]) => [k, b.name]));

// spool numbers typed any way ("20, 1902 0015") -> the chart's own spellings that exist
export function spools(brand, text) {
  const c = chart(brand); if (!c) return [];
  const byNum = new Map(c.map((s) => [s.num.replace(/^0+/, ""), s.num]));
  return [...new Set((text || "").split(/[\s,;]+/).map((t) => byNum.get(t.replace(/^0+/, ""))).filter(Boolean))];
}

// nearest spool to hex: among `owned` numbers if given (and any match), else the whole chart
export function nearestSpool(brand, hex, owned = null) {
  let c = chart(brand); if (!c) return null;
  if (owned?.length) { const o = new Set(owned); const mine = c.filter((s) => o.has(s.num)); if (mine.length) c = mine; }
  const [L, A, B] = lab(hexToRgb(hex));
  let best = null, bd = Infinity;
  for (const s of c) { const d = (s.lab[0] - L) ** 2 + (s.lab[1] - A) ** 2 + (s.lab[2] - B) ** 2; if (d < bd) { bd = d; best = s; } }
  return best && { ...best, dE: Math.sqrt(bd), brand: BRANDS[brand], label: `${BRANDS[brand]} ${best.num}${best.name ? ` ${best.name}` : ""}` };
}
