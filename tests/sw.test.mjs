// sw.js precaches every file the page can need offline: every module, font and image in the repo.
import { readFileSync, readdirSync } from "fs";
const sw = readFileSync("sw.js", "utf8"), listed = new Set([...sw.matchAll(/"([^"]+\.(?:js|woff2|png|css|html|webmanifest))"/g)].map((m) => m[1]));
const want = [["js", /\.js$/], ["js/core", /\.js$/], ["js/studio", /\.js$/], ["fonts", /\.woff2$/], ["assets", /\.png$/]]
  .flatMap(([d, re]) => readdirSync(d).filter((f) => re.test(f)).map((f) => `${d}/${f}`));
const missing = want.filter((f) => !listed.has(f)), gone = [...listed].filter((f) => f.includes("/") && !want.includes(f) && f !== "css/app.css");
if (missing.length || gone.length) { console.error("sw.js FILES out of date. Missing:", missing, "no longer exist:", gone); process.exit(1); }
console.log(`sw: ${want.length} files listed`);

// Every module's imports resolve: the file exists, is in the offline list, and exports each name asked for (through
// `export { x } from` too). A mistyped path or a name left behind when code moved to another file stops the whole
// page loading, and nothing in Node saw it: pictures and the editor only run in a browser (2026-11: "./S.pieces.js").
import path from "path";
const mods = want.filter((f) => f.endsWith(".js")), src = Object.fromEntries(mods.map((f) => [f, readFileSync(f, "utf8")]));
const exportsOf = (f, seen = new Set()) => {
  if (seen.has(f) || !src[f]) return new Set();
  seen.add(f);
  const s = src[f], out = new Set();
  for (const m of s.matchAll(/^export (?:async )?(?:function\*?|class) ([\w$]+)/gm)) out.add(m[1]);
  // (every name of `export const a = ..., b = ...`: declarators at the top level of the statement's first line)
  for (const m of s.matchAll(/^export (?:const|let) (.*)$/gm)) {
    let depth = 0, cur = "";
    const parts = [];
    for (const ch of m[1]) { if ("([{".includes(ch)) depth++; else if (")]}".includes(ch)) depth--; if (ch === "," && !depth) { parts.push(cur); cur = ""; } else cur += ch; }
    parts.push(cur);
    for (const p of parts) { const n = p.match(/^\s*([\w$]+)\s*(=|$)/); if (n) out.add(n[1]); }
  }
  for (const m of s.matchAll(/^export \{([^}]*)\}(?: from "([^"]+)")?/gm)) {
    for (const part of m[1].split(",")) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) out.add(n); }
  }
  for (const m of s.matchAll(/^export \* from "([^"]+)"/gm)) for (const n of exportsOf(path.posix.join(path.posix.dirname(f), m[1]), seen)) out.add(n);
  return out;
};
const bad = [];
for (const f of mods) for (const m of src[f].matchAll(/^(?:import|export) \{([^}]*)\} from "([^"]+)";/gm)) {
  const to = path.posix.join(path.posix.dirname(f), m[2]);
  if (!src[to]) { bad.push(`${f}: "${m[2]}" isn't a file of the app`); continue; }
  const has = exportsOf(to);
  for (const part of m[1].split(",")) { const n = part.trim().split(/\s+as\s+/)[0]; if (n && !has.has(n)) bad.push(`${f}: ${to} doesn't export ${n}`); }
}
if (bad.length) { console.error("imports that don't resolve:\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`sw: every import of ${mods.length} modules resolves`);
