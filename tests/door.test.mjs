// The engine's door (docs/paid-version.md): the public build reaches no file that makes stitches, only the files
// named for it, and the two doors (js/engine.js, js/engine-remote.js) offer the same names.
import fs from "node:fs";
import { problems, reach } from "../server/build-public.mjs";
const bad = problems(reach("."));
const names = (f) => [...fs.readFileSync(f, "utf8").matchAll(/^export (?:async )?(?:const|function) (\w+)|^export \{ (\w+) \}/gm)].map((m) => m[1] || m[2]).sort();
const full = names("js/engine.js"), paid = names("js/engine-remote.js");
if (full.join() !== paid.join()) bad.push(`the doors differ: engine.js offers ${full.join(", ")}; engine-remote.js ${paid.join(", ")}`);
if (bad.length) { console.error("door: FAIL\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`door: the public build is ${reach(".").size} scripts, none makes stitches; both doors offer ${full.length} names`);
