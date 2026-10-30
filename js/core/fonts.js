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
