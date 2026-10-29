// node tests/formats.test.mjs — JS reader/writer vs pyembroidery oracles
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { machineThreads, readEmbroidery, validatePES, writePES, STITCH, JUMP, TRIM, COLOR_CHANGE, END } from "../js/core/formats.js";
import { mkdirSync, writeFileSync } from "node:fs";

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } };

const ref = JSON.parse(readFileSync("tests/fixtures/ashley_v3_commands.json"));

// Our PEC stitch block = pyembroidery's plus the 4-byte design-box prefix Brother machines expect after 0x1e0/0x1b0
// (pyembroidery puts the opening jump there). Strip it to compare with pyembroidery's bytes.
function stripBoxPrefix(bytes) {
  const pec = bytes[8] | (bytes[9] << 8) | (bytes[10] << 16), blk = pec + 512;
  const out = new Uint8Array(bytes.length - 4);
  out.set(bytes.subarray(0, blk + 16)); out.set(bytes.subarray(blk + 20), blk + 16);
  const len = (out[blk + 2] | (out[blk + 3] << 8) | (out[blk + 4] << 16)) - 4;
  out[blk + 2] = len; out[blk + 3] = len >> 8; out[blk + 4] = len >> 16;
  return out;
}

// 1. writer: same commands as the pyembroidery-written fixtures (tests/make_fixture.py, full v6) -> identical bytes
//    apart from the box prefix, and the prefix must hold every stitch the way a Brother machine reads it
for (const name of ["ashley_v3", "multi"]) {
  const cmds = JSON.parse(readFileSync(`tests/fixtures/${name}_commands.json`));
  const pyBytes = readFileSync(`tests/fixtures/${name}.pes`);
  const full = writePES({ stitches: cmds.commands, threads: cmds.threads.map((t) => ({ color: t.color, description: t.description, brand: "" })) });
  const js = stripBoxPrefix(full);
  let diff = -1;
  for (let i = 0; i < Math.max(js.length, pyBytes.length); i++) if (js[i] !== pyBytes[i]) { diff = i; break; }
  ok(diff === -1, `writer ${name}: bytes differ at ${diff} (js ${js.length} vs py ${pyBytes.length})`);
  const d = readEmbroidery(full, "w.pes");
  ok(!d.misplaced, `writer ${name}: stitches fall outside the design box`);
  console.log("writer:", name, diff === -1 ? "byte-identical apart from the box prefix" : `first diff @${diff}`, d.misplaced ? "MISPLACED" : "box ok");
}

// 2. reader: every sample reads like pyembroidery. Brother-made files: pyembroidery reads the box prefix as a
//    first jump, so drop it and shift back. pyembroidery-made files (box prefix = opening jump, which machines
//    load clipped) are flagged misplaced and read as meant, exactly like pyembroidery.
const PYEMBROIDERY_MADE = new Set(["ashley_v3.pes", "flower_ludd.pes", "star_badge.pes", "wreath.pes"]);
const files = ["tests/fixtures/ashley_v3.pes"];
if (existsSync("tests/external/pes")) for (const f of readdirSync("tests/external/pes")) files.push("tests/external/pes/" + f);
for (const f of files) {
  const name = f.split("/").pop();
  const oracleFile = ["tests/fixtures/", "tests/external/oracle/"].map((d) => d + name + ".json").find(existsSync);
  if (!oracleFile) continue;
  const o = JSON.parse(readFileSync(oracleFile));
  const d = readEmbroidery(new Uint8Array(readFileSync(f)), name);
  let want = o.stitches;
  if (name.endsWith(".pes")) {
    ok(!!d.misplaced === PYEMBROIDERY_MADE.has(name), `${name}: misplaced=${d.misplaced}`);
    if (!d.misplaced) { const [px, py] = want[0]; want = want.slice(1).map(([x, y, c]) => [x - px, y - py, c]); }
  }
  let bad = d.stitches.length !== want.length ? `count ${d.stitches.length} vs ${want.length}` : "";
  if (!bad) for (let i = 0; i < d.stitches.length; i++) {
    const a = d.stitches[i], b = want[i];
    if (a[2] !== b[2] || (a[2] !== 2 && (a[0] !== b[0] || a[1] !== b[1]))) { bad = `stitch ${i}: ${a} vs ${b}`; break; }
  }
  const colors = d.threads.map((t) => t.color).join(",") === o.threads.join(",");
  ok(!bad, `${name}: ${bad}`);
  ok(colors, `${name}: threads ${d.threads.map((t) => t.color)} vs ${o.threads}`);
  console.log("reader:", name.padEnd(22), !bad && colors ? "match" : "MISMATCH", d.stitches.length, d.misplaced ? "(misplaced: loads clipped on Brother machines)" : "");
}
// 3. every file the site can hand out must decode to exactly its design
const outDir = process.env.WRITE_DIR;
if (outDir) mkdirSync(outDir, { recursive: true });
for (const f of files) {
  const name = f.split("/").pop();
  const raw = new Uint8Array(readFileSync(f));
  const d = readEmbroidery(raw, name);
  if (name.endsWith(".pes")) {
    const o = validatePES(raw);
    ok(o.ok === !PYEMBROIDERY_MADE.has(name), `original ${name}: ${o.error || "accepted"}`);
  }
  const bytes = writePES(d);
  const v = validatePES(bytes, d);
  ok(v.ok, `re-encode ${name}: ${v.error}`);
  if (outDir) writeFileSync(`${outDir}/${name}.pes`, bytes);
}
console.log("re-encode: all samples validate");

// 4. fuzz: random designs with long jumps, over-long stitches and many colours
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let t = 0; t < 300; t++) {
  const st = [], threads = [];
  const colors = 1 + Math.floor(rnd() * 60);
  let x = 0, y = 0;
  for (let c = 0; c < colors; c++) {
    if (c) st.push([0, 0, COLOR_CHANGE]);
    threads.push({ color: "#" + Math.floor(rnd() * 0xffffff).toString(16).padStart(6, "0"), description: "c" + c });
    const runs = 1 + Math.floor(rnd() * 4);
    for (let r = 0; r < runs; r++) {
      if (r || c) st.push([0, 0, TRIM]);
      x = (rnd() - 0.5) * 1260; y = (rnd() - 0.5) * 1760;   // anywhere in a 5x7 field (0.1 mm)
      st.push([x, y, JUMP]);
      const n = 1 + Math.floor(rnd() * 80);
      for (let k = 0; k < n; k++) {
        const L = rnd() < 0.1 ? 150 : 40;                     // some stitches longer than 7 mm
        x = Math.max(-630, Math.min(630, x + (rnd() - 0.5) * L)); y = Math.max(-880, Math.min(880, y + (rnd() - 0.5) * L));
        st.push([x, y, STITCH]);
      }
    }
  }
  st.push([0, 0, END]);
  const pattern = { stitches: st, threads };
  const v = validatePES(writePES(pattern), pattern, { w: 130, h: 180, name: "5x7" });
  ok(v.ok, `fuzz ${t}: ${v.error}`);
  if (outDir && t < 20) writeFileSync(`${outDir}/fuzz_${t}.pes`, writePES(pattern));
}
console.log("fuzz: 300 random designs validate");

// 5. garbage is rejected
ok(!validatePES(new Uint8Array(4000)).ok, "zeros accepted as PES");
ok(!validatePES(new TextEncoder().encode("#PES0060" + "x".repeat(5000))).ok, "junk accepted as PES");

// 6. a damaged stitch section is caught (flip bytes inside the PEC stitch data)
{
  const src = { stitches: ref.commands, threads: ref.threads };
  const good = writePES(src);
  const pec = good[8] | (good[9] << 8) | (good[10] << 16) | (good[11] << 24);
  let caught = 0;
  for (let k = 0; k < 50; k++) {
    const bad = good.slice(), at = pec + 532 + 20 + Math.floor(((k * 7919) % 997) / 997 * 3000);
    bad[at] ^= 0x05;
    if (!validatePES(bad, src).ok) caught++;
  }
  ok(caught === 50, `corruption caught ${caught}/50`);
  console.log(`corruption: caught ${caught}/50 damaged files`);
}

// 7. what we used to write (pyembroidery's PEC: opening jump in the box fields) is refused, and rewriting fixes it
{
  const src = { stitches: ref.commands, threads: ref.threads };
  const v = validatePES(new Uint8Array(readFileSync("tests/fixtures/ashley_v3_old.pes")), src);
  ok(!v.ok && /cut off/.test(v.error), `old PES accepted (${v.error})`);
  const d = readEmbroidery(new Uint8Array(readFileSync("tests/fixtures/ashley_v3_old.pes")), "old.pes");
  const again = writePES(d);
  ok(validatePES(again, d).ok && !readEmbroidery(again, "fixed.pes").misplaced, "old PES not repaired by rewriting");
  console.log("old PES:", v.ok ? "ACCEPTED" : "refused, rewrite fixes it");
}

// the thread names the site shows must be the ones the machine reads from the PEC palette
{
  let same = 0;
  for (let k = 0; k < 200; k++) {
    const n = 1 + (k % 9), threads = Array.from({ length: n }, (_, i) => ({ color: "#" + (((k * 2654435761 + i * 40503) >>> 0) % 0xffffff).toString(16).padStart(6, "0") }));
    if (k % 3 === 0) threads.push({ ...threads[0] });   // repeated colour, like the bookmark's five blocks
    const stitches = [];
    threads.forEach((_, i) => { if (i) stitches.push([0, 0, COLOR_CHANGE]); stitches.push([i * 10, 0, STITCH], [i * 10 + 30, 20, STITCH]); });
    stitches.push([0, 0, END]);
    const want = machineThreads(threads).map((t) => t.index), got = readEmbroidery(writePES({ stitches, threads })).pec;
    if (JSON.stringify(want) === JSON.stringify(got)) same++;
  }
  ok(same === 200, `site thread names match the PEC palette ${same}/200`);
  console.log(`thread names: ${same}/200 match what the machine reads`);
}

console.log(fail ? `${fail} failures` : "all passed");
process.exit(fail ? 1 : 0);
