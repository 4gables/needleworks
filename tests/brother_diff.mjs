// Our PEC encoder against Brother's, over Brother-made PES files (tests/brother_diff_core.js says how).
// usage: node tests/brother_diff.mjs file.pes|dir ... [--all] [--verbose]   -> exit 1 if any compared file sews differently
//   --all compares files that aren't Brother-made too; --verbose prints every file, not just the differences
import fs from "node:fs";
import path from "node:path";
import { readEmbroidery, writePES } from "../js/core/formats.js";
import core from "./brother_diff_core.js";

const args = process.argv.slice(2), all = args.includes("--all"), verbose = args.includes("--verbose");
const files = args.filter((a) => !a.startsWith("--")).flatMap((a) =>
  fs.statSync(a).isDirectory() ? fs.readdirSync(a, { recursive: true }).map((f) => path.join(a, f)) : [a])
  .filter((f) => /\.pes$/i.test(f)).sort();
if (!files.length) { console.error("usage: node tests/brother_diff.mjs file.pes|dir ... [--all] [--verbose]"); process.exit(2); }

const results = files.map((f) => core.brotherDiff(new Uint8Array(fs.readFileSync(f)), path.basename(f), { readEmbroidery, writePES }, { all }));
for (const x of results) if (verbose || x.status === "fail")
  console.log(`${x.status === "fail" ? "FAIL" : x.status === "skip" ? "skip" : "ok  "} ${x.name}: ${x.text}${x.notes.length ? " [" + x.notes.join("; ") + "]" : ""}`);
console.log(core.brotherSummary(results));
process.exit(results.some((x) => x.status === "fail") ? 1 : 0);
