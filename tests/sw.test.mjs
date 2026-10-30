// sw.js precaches every file the page can need offline: every module, font and image in the repo.
import { readFileSync, readdirSync } from "fs";
const sw = readFileSync("sw.js", "utf8"), listed = new Set([...sw.matchAll(/"([^"]+\.(?:js|woff2|png|css|html|webmanifest))"/g)].map((m) => m[1]));
const want = [["js", /\.js$/], ["js/core", /\.js$/], ["js/studio", /\.js$/], ["fonts", /\.woff2$/], ["assets", /\.png$/]]
  .flatMap(([d, re]) => readdirSync(d).filter((f) => re.test(f)).map((f) => `${d}/${f}`));
const missing = want.filter((f) => !listed.has(f)), gone = [...listed].filter((f) => f.includes("/") && !want.includes(f) && f !== "css/app.css");
if (missing.length || gone.length) { console.error("sw.js FILES out of date. Missing:", missing, "no longer exist:", gone); process.exit(1); }
console.log(`sw: ${want.length} files listed`);
