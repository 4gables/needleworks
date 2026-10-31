/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Bookmark lettering fonts: CSS @font-face families in css/app.css. Print fonts get dashes instead of swashes.
export const FONTS = [
  { family: "NW Sacramento", name: "Sacramento", note: "flowing, joined" },
  { family: "NW Allura", name: "Allura" },
  { family: "NW Parisienne", name: "Parisienne" },
  { family: "NW Corinthia", name: "Corinthia" },
  { family: "NW Ephesis", name: "Ephesis" },
  { family: "NW Meow Script", name: "Meow Script" },
  { family: "NW Great Vibes", name: "Great Vibes", note: "like Cinderella" },
  { family: "NW Alex Brush", name: "Alex Brush", note: "like Birds of Paradise" },
  { family: "NW Ms Madi", name: "Ms Madi", note: "like Southampton" },
  { family: "NW Satisfy", name: "Satisfy", note: "like Amarillo" },
  { family: "NW Cookie", name: "Cookie", note: "like Cream Candy" },
  { family: "NW Yellowtail", name: "Yellowtail", note: "like Moon Time" },
  { family: "NW Rouge Script", name: "Rouge Script", note: "like Chopin Script" },
  { family: "NW Italianno", name: "Italianno", note: "like Bickley Script" },
  { family: "NW Quicksand", name: "Quicksand", note: "print", print: true },
  { family: "NW Josefin Sans", name: "Josefin Sans", note: "print", print: true },
];
export const fontOf = (family) => FONTS.find((f) => f.family === family) || FONTS[0];
// Bold display fonts for appliqué letters (cut from fabric, outlined in satin), not centre-line lettering.
export const APPLIQUE_FONTS = [
  { family: "NW Graduate", name: "Graduate", note: "varsity block" },
  { family: "NW Lilita One", name: "Lilita One", note: "rounded" },
  { family: "NW Alfa Slab One", name: "Alfa Slab One", note: "slab" },
];

// Load a lettering font before drawing with it. One that failed (a network blip) stays failed in the page's
// @font-face until a reload, and document.fonts.load() keeps rejecting with "A network error occurred.", so it's
// fetched again from the same file as a second copy, which is what's drawn from then on. Still failing: a plain error
// (`font: true`) to show, and the next use tries again.
const again = new Map();   // family -> the FontFace added after a failure
export async function loadFont(family) {
  if (typeof document === "undefined" || again.get(family)?.status === "loaded") return;
  try { await document.fonts.load(`40px "${family}"`); return; }
  catch {
    const src = fontSrc(family);
    if (src) try { const f = new FontFace(family, src); await f.load(); document.fonts.add(f); again.set(family, f); return; } catch {}
    const name = [...FONTS, ...APPLIQUE_FONTS].find((f) => f.family === family)?.name || family.replace(/^NW /, "");
    throw Object.assign(new Error(`The ${name} letters didn't load: the internet connection may have dropped. Check it and try again.`), { font: true });
  }
}
// the font's file, as the stylesheet names it (absolute, so it loads from here)
function fontSrc(family) {
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) {
      if (!(r instanceof CSSFontFaceRule) || r.style.getPropertyValue("font-family").replace(/["']/g, "").trim() !== family) continue;
      return r.style.getPropertyValue("src").replace(/url\((["']?)([^"')]+)\1\)/g, (m, q, u) => `url("${new URL(u, sheet.href || location.href).href}")`);
    }
  }
  return null;
}
