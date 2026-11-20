/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Writes the public build (docs/paid-version.md): node server/build-public.mjs OUT_DIR API_ADDRESS
// The page's files as they are, with js/engine-remote.js in place of js/engine.js and the server's address in
// js/api.js; the offline list (sw.js) and the first screen's list (index.html) written for that set. It refuses to
// write a build that can reach a file that makes stitches, or a file not named in PUBLIC below: a new page file is
// added there on purpose, never by an import.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Every script the public build may hold. Nothing under js/studio/, none of the engine's core, no worker of the full app.
export const PUBLIC = ["app", "state", "picture", "opened", "along", "threadui", "focus", "onitem", "render", "sheet", "words", "gate", "quality", "checkup", "common",
  "artwords", "jobs", "zip", "wire", "api", "engine", "remote-worker", "remote-picture", "remote-doctor",
  "core/formats", "core/formats-out", "core/threads", "core/machines", "core/colour", "core/typed", "core/brands", "core/brandcharts", "core/glyphs", "core/fonts",
  "core/limits", "core/turn", "core/grid", "core/picprep", "core/areas", "core/density"].map((f) => `js/${f}.js`);
const DENIED = /^js\/(studio\/|core\/(digitize|palette|artcheck|regions|shade|fill|geom|raster|design|recipes|text)\.js|doctor\.js|worker\.js|doctor-worker\.js|quilt-worker\.js|picjob\.js|docjob\.js|engine-remote\.js)/;
const IMPORT = /(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)|import\s*["']([^"']+)["']|new URL\(\s*["']([^"']+\.js)["']/g;

// the scripts the public page reaches, engine.js read as the remote door
export function reach(root = ".") {
  const seen = new Map(), read = (f) => fs.readFileSync(path.join(root, f === "js/engine.js" ? "js/engine-remote.js" : f), "utf8");
  const walk = (f) => { if (seen.has(f)) return; const src = read(f); seen.set(f, src);
    for (const m of src.matchAll(IMPORT)) { const spec = m[1] || m[2] || m[3] || m[4]; if (spec.startsWith(".")) walk(path.posix.normalize(path.posix.join(path.posix.dirname(f), spec))); } };
  walk("js/app.js");
  return seen;
}
// what is wrong with that set ([] when nothing is)
export function problems(seen) {
  const out = [];
  for (const f of seen.keys()) { if (DENIED.test(f)) out.push(`${f} makes stitches and is reached by the public build`); else if (!PUBLIC.includes(f)) out.push(`${f} is reached by the public build but is not in PUBLIC (server/build-public.mjs)`); }
  for (const f of PUBLIC) if (!seen.has(f)) out.push(`${f} is in PUBLIC but the public build never loads it`);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [out, api] = process.argv.slice(2);
  if (!out || !/^https?:\/\//.test(api || "")) { console.error("usage: node server/build-public.mjs OUT_DIR API_ADDRESS"); process.exit(1); }
  const seen = reach("."), bad = problems(seen);
  if (bad.length) { console.error("Not written:\n  " + bad.join("\n  ")); process.exit(1); }
  fs.rmSync(out, { recursive: true, force: true });
  const put = (f, data) => { const to = path.join(out, f); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, data); };
  for (const [f, src] of seen) put(f, f === "js/api.js" ? src.replace(/export const API = "[^"]*";/, `export const API = ${JSON.stringify(api.replace(/\/$/, ""))};`) : src);
  for (const f of ["css/app.css", "manifest.webmanifest", "LICENSE", "THIRD_PARTY_NOTICES.md", "privacy.html", ...fs.readdirSync("fonts").map((f) => `fonts/${f}`), ...fs.readdirSync("assets").map((f) => `assets/${f}`)]) put(f, fs.readFileSync(f));
  // the first screen's modules: js/app.js and what it imports at once (tests/sw.test.mjs)
  const first = new Set(), walk = (f) => { if (first.has(f) || !seen.has(f)) return; first.add(f); for (const m of seen.get(f).matchAll(/^(?:import|export) (?:[^"]*? from )?"([^"]+)";/gm)) walk(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]))); };
  walk("js/app.js");
  const lines = [...first].sort().map((f) => `<link rel="modulepreload" href="${f}" fetchpriority="low">`), rows = [];
  for (let i = 0; i < lines.length; i += 4) rows.push(lines.slice(i, i + 4).join(""));
  const html = fs.readFileSync("index.html", "utf8").replace(/<!-- first screen: start -->\n[\s\S]*?<!-- first screen: end -->/, `<!-- first screen: start -->\n${rows.join("\n")}\n<!-- first screen: end -->`);
  put("index.html", html);
  // the offline list: this set's files, each with its hash, and the set's fingerprint in the cache's name
  const sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(out, f))).digest("hex");
  const listed = ["index.html", "manifest.webmanifest", "css/app.css", "privacy.html", ...[...seen.keys()].sort(), ...fs.readdirSync("fonts").filter((f) => f.endsWith(".woff2")).map((f) => `fonts/${f}`), ...fs.readdirSync("assets").filter((f) => f.endsWith(".png")).map((f) => `assets/${f}`)];
  const body = listed.map((f) => `  "${f}": "${sha(f)}",`).join("\n"), set = createHash("sha256").update(listed.map((f) => f + sha(f)).join("\n")).digest("hex").slice(0, 12);
  const sw = fs.readFileSync("sw.js", "utf8").replace(/const FILES = \{\n[\s\S]*?\n\};/, `const FILES = {\n${body}\n};`).replace(/^const SET = "[0-9a-f]*";$/m, `const SET = "${set}";`).replace(/needleworks-v(\d+)-\$\{SET\}/, "needleworks-p$1-${SET}");
  put("sw.js", sw);
  console.log(`public build: ${seen.size} scripts, ${listed.length} files offline, engine at ${api}, in ${out}`);
}
