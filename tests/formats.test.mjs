// node tests/formats.test.mjs — JS reader/writer vs pyembroidery oracles
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { readEmbroidery, writePES } from "../js/core/formats.js";

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } };

// 1. writer: same commands as the Python Design -> identical bytes
const ref = JSON.parse(readFileSync("tests/fixtures/ashley_v3_commands.json"));
const pyBytes = readFileSync("tests/fixtures/ashley_v3.pes");
const js = writePES({ stitches: ref.commands, threads: ref.threads.map((t) => ({ color: t.color, description: t.description, brand: "" })) });
let diff = -1;
for (let i = 0; i < Math.max(js.length, pyBytes.length); i++) if (js[i] !== pyBytes[i]) { diff = i; break; }
ok(diff === -1, `writer bytes differ at ${diff} (js ${js.length} vs py ${pyBytes.length})`);
console.log("writer: ashley_v3", diff === -1 ? "byte-identical" : `first diff @${diff}`);

// 2. reader: every sample reads exactly like pyembroidery
const files = ["tests/fixtures/ashley_v3.pes"];
if (existsSync("tests/external/pes")) for (const f of readdirSync("tests/external/pes")) files.push("tests/external/pes/" + f);
for (const f of files) {
  const name = f.split("/").pop();
  const oracleFile = ["tests/fixtures/", "tests/external/oracle/"].map((d) => d + name + ".json").find(existsSync);
  if (!oracleFile) continue;
  const o = JSON.parse(readFileSync(oracleFile));
  const d = readEmbroidery(new Uint8Array(readFileSync(f)), name);
  let bad = d.stitches.length !== o.stitches.length ? `count ${d.stitches.length} vs ${o.stitches.length}` : "";
  if (!bad) for (let i = 0; i < d.stitches.length; i++) {
    const a = d.stitches[i], b = o.stitches[i];
    if (a[2] !== b[2] || (a[2] !== 2 && (a[0] !== b[0] || a[1] !== b[1]))) { bad = `stitch ${i}: ${a} vs ${b}`; break; }
  }
  const colors = d.threads.map((t) => t.color).join(",") === o.threads.join(",");
  ok(!bad, `${name}: ${bad}`);
  ok(colors, `${name}: threads ${d.threads.map((t) => t.color)} vs ${o.threads}`);
  console.log("reader:", name.padEnd(22), !bad && colors ? "match" : "MISMATCH", d.stitches.length);
}
console.log(fail ? `${fail} failures` : "all passed");
process.exit(fail ? 1 : 0);
