// sw.js precaches every file the page can need offline: every module, font and image in the repo, each with the
// SHA-256 of this release's copy (the service worker installs a release only when every file it fetched is that copy).
// `node tests/sw.test.mjs --write` fills the hashes in after files change; without it a stale hash fails here (CI),
// since a release with one would never install.
// `--wip` (CI on a round's branch): a stale hash is said, not failed. Hashes are written once, at the release, so
// a branch in progress always has some (2026-11-11: 17 failed-build emails from four branches doing just that).
import { createHash } from "crypto";
const WIP = process.argv.includes("--wip");
import { readFileSync, readdirSync, writeFileSync } from "fs";
const sw = readFileSync("sw.js", "utf8"), listed = new Set([...sw.matchAll(/"([^"]+\.(?:js|woff2|png|css|html|webmanifest))"/g)].map((m) => m[1]));
const want = [["js", /\.js$/], ["js/core", /\.js$/], ["js/studio", /\.js$/], ["fonts", /\.woff2$/], ["assets", /\.png$/]]
  .flatMap(([d, re]) => readdirSync(d).filter((f) => re.test(f)).map((f) => `${d}/${f}`));
const missing = want.filter((f) => !listed.has(f)), gone = [...listed].filter((f) => f.includes("/") && !want.includes(f) && f !== "css/app.css");
if (missing.length || gone.length) { console.error("sw.js FILES out of date. Missing:", missing, "no longer exist:", gone); process.exit(1); }
console.log(`sw: ${want.length} files listed`);

// index.html asks for the first screen's modules at once: exactly js/app.js and what it imports, however deep. One
// missing is a round trip more on a slow connection; one too many (the Picture and Open tabs' code, which comes when
// the first design is on screen: app.js `tabCode`) is a download the first preview waits for (2026-11: 18 s to the
// first preview on a slow phone, every second of it bytes). `--write` writes the list (before the hashes: index.html has one).
{
  const src = Object.fromEntries(want.filter((f) => f.endsWith(".js")).map((f) => [f, readFileSync(f, "utf8")])), dir = (f) => f.slice(0, f.lastIndexOf("/")), join = (d, r) => { const out = d.split("/"); for (const k of r.split("/")) { if (k === "..") out.pop(); else if (k !== ".") out.push(k); } return out.join("/"); };
  const first = new Set(), walk = (f) => { if (first.has(f) || !src[f]) return; first.add(f); for (const m of src[f].matchAll(/^(?:import|export) (?:[^"]*? from )?"([^"]+)";/gm)) walk(join(dir(f), m[1])); };
  walk("js/app.js");
  const html = readFileSync("index.html", "utf8"), block = html.match(/<!-- first screen: start -->\n([\s\S]*?)<!-- first screen: end -->/);
  if (!block) { console.error("index.html: no `first screen` block of modulepreload links"); process.exit(1); }
  const lines = [...first].sort().map((f) => `<link rel="modulepreload" href="${f}" fetchpriority="low">`), now = [];
  for (let i = 0; i < lines.length; i += 4) now.push(lines.slice(i, i + 4).join(""));
  const text = now.join("\n") + "\n";
  if (block[1] !== text && process.argv.includes("--write")) { writeFileSync("index.html", html.replace(block[0], `<!-- first screen: start -->\n${text}<!-- first screen: end -->`)); console.log(`sw: index.html asks for ${first.size} modules`); }
  else if (block[1] !== text) { console.error("index.html's modulepreload list isn't js/app.js's imports (run node tests/sw.test.mjs --write)"); if (!WIP) process.exit(1); }   // (written at the release, like the hashes)
  for (const heavy of ["js/picture.js", "js/opened.js", "js/core/digitize.js", "js/core/palette.js"]) if (first.has(heavy)) { console.error(`${heavy} is part of the first load again (something the Design tab runs imports it): see app.js tabCode`); process.exit(1); }
  const script = (src["js/studio/starters.js"].match(/^export const SCRIPT = "([^"]+)"/m) || [])[1];
  if (!script || !html.includes(`["${script}"]`)) { console.error(`index.html asks early for a first font that isn't starters.js SCRIPT (${script})`); process.exit(1); }
  console.log(`sw: the first screen is ${first.size} modules, asked for at once`);
}

const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const entries = [...sw.matchAll(/^  "([^"]+)": "([0-9a-f]*)",$/gm)].map((m) => ({ file: m[1], hash: m[2], line: m[0] }));
if (entries.length !== listed.size) { console.error(`sw.js FILES: ${entries.length} entries with a hash, ${listed.size} files named: one line each, "path": "hash",`); process.exit(1); }
const stale = entries.filter((e) => e.hash !== sha(e.file));
if (stale.length && process.argv.includes("--write")) {
  let out = sw;
  for (const e of stale) out = out.replace(e.line, `  "${e.file}": "${sha(e.file)}",`);
  writeFileSync("sw.js", out);
  console.log(`sw: ${stale.length} hashes written (${stale.map((e) => e.file).join(", ").slice(0, 200)})`);
} else if (stale.length) {
  console.error(`sw.js hashes are stale for ${stale.length} files (run node tests/sw.test.mjs --write, and bump CACHE for a release):\n  ` + stale.map((e) => e.file).join("\n  "));
  if (!WIP) process.exit(1);
} else console.log(`sw: ${entries.length} hashes match`);
// the fingerprint of the set in the cache's name
{
  const now = readFileSync("sw.js", "utf8"), set = createHash("sha256").update([...now.matchAll(/^  "([^"]+)": "([0-9a-f]*)",$/gm)].map((m) => m[1] + m[2]).join("\n")).digest("hex").slice(0, 12);
  const has = (now.match(/^const SET = "([0-9a-f]*)";$/m) || [])[1];
  if (has === undefined || !/const CACHE = `needleworks-v\d+-\$\{SET\}`/.test(now)) { console.error("sw.js: CACHE must be `needleworks-vN-${SET}` with a const SET line"); process.exit(1); }
  if (has !== set && process.argv.includes("--write")) { writeFileSync("sw.js", now.replace(/^const SET = "[0-9a-f]*";$/m, `const SET = "${set}";`)); console.log(`sw: set ${set}`); }
  else if (has !== set) { console.error("sw.js SET is stale (run node tests/sw.test.mjs --write)"); if (!WIP) process.exit(1); }
}

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
