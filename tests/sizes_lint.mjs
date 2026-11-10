// Class guarded: one size said in two units that disagree (round 9: "15 × 12 cm (5.7 × 4.5 in)" was 5.9 in, "½ in
// (1 cm)"; round 11: fabric "12 cm (4⅜ in)", 12 cm being 4¾ in; "11 × 11 cm (4⅜ × 4¼ in)"; the size chip "90 × 90 mm
// · 3.6 × 3.6 in", 90 mm being 3½ in, and the sliders in hundredths). Every size comes from words.js (`measure`,
// `mmText`): the second unit is the first as shown, inches in eighths (a ruler's marks).
// sizes(text) -> what's wrong in it, [] when every pair agrees. Used by steps_lint.mjs and surfaces.mjs.
const FR = "⅛¼⅜½⅝¾⅞";
const inch = (t) => { const m = /^(\d*)([⅛¼⅜½⅝¾⅞]?)$/.exec(t); return m && (m[1] || m[2]) ? (+m[1] || 0) + (m[2] ? (FR.indexOf(m[2]) + 1) / 8 : 0) : NaN; };
const IN = `(?:just over )?\\d*[${FR}]?`, NUM = "\\d+(?:\\.\\d+)?";
const CM_IN = new RegExp(`(${NUM})(?: × (${NUM}))? cm \\((${IN})(?: × (${IN}))? in\\)`, "g");
const MM_IN = new RegExp(`(${NUM})(?: × (${NUM}))? mm \\((${IN})(?: × (${IN}))? in\\)`, "g");
const IN_CM = new RegExp(`(${IN}) in \\((${NUM}) cm\\)`, "g");
const EIGHTH = 25.4 / 8;
// (`seen`: one size says one thing wherever it's said: "11 × 11 cm (4⅜ × 4¼ in)"; pass a Map to check several texts)
export function sizes(t, seen = new Map()) {
  const bad = [];
  // (mm: the eighth nearest, or for fabric to cut the eighth at or above it; "just over": the size's eighth is the field's)
  const agree = (mm, i, tol, what) => {
    const over = /^just over /.test(i), v = inch(i.replace(/^just over /, "")) * 25.4;
    const key = `${mm}/${tol}`;
    if (seen.has(key) && seen.get(key) !== i) bad.push(`"${what}": ${mm} mm is ${seen.get(key)} in elsewhere`);
    seen.set(key, i);
    if (!(over ? mm > v - EIGHTH / 2 && mm - v <= EIGHTH / 2 + 0.05 : Math.abs(mm - v) <= tol + 0.05)) bad.push(`"${what}": ${mm} mm isn't ${i} in`);
  };
  for (const m of t.matchAll(CM_IN)) { agree(+m[1] * 10, m[3], EIGHTH, m[0]); if (m[2] && m[4]) agree(+m[2] * 10, m[4], EIGHTH, m[0]); }
  for (const m of t.matchAll(MM_IN)) { agree(+m[1], m[3], EIGHTH / 2, m[0]); if (m[2] && m[4]) agree(+m[2], m[4], EIGHTH / 2, m[0]); }
  // (inches first: the centimetres rounded from them, whole from 10 cm)
  for (const m of t.matchAll(IN_CM)) agree(+m[2] * 10, m[1], +m[2] >= 10 ? 5 : 0.5, m[0]);
  for (const m of t.matchAll(/\d\.\d+\s?in\b/g)) bad.push(`"${m[0]}": inches a ruler doesn't show (eighths: ⅛ ¼ ⅜ ½ …)`);
  for (const m of t.matchAll(/\bmm · [\d.]+/g)) bad.push(`"${m[0]}": a size not said the one way (words.js mmText)`);
  return bad;
}
