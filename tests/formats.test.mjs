// node tests/formats.test.mjs — JS reader/writer vs pyembroidery oracles
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { machineThreads, normalize, readEmbroidery, validatePES, writePES, STITCH, JUMP, TRIM, COLOR_CHANGE, END } from "../js/core/formats.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { endsEarly } from "../js/quality.js";
import { JANOME, WRITERS, janomeThreads, jefThreads, needlePoints, readBack, validateOut, writeJEF } from "../js/core/formats-out.js";
import { createHash } from "node:crypto";

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

// DST, EXP and VP3 (docs/formats-out-spec.md): every file sews the needle points of the pattern (as the gate proves it:
// validatePES proves the PES does the same, less PEC's anchor stitches after jumps) and passes the gate's read-back.
// WRITE_DIR gets them beside the PES, for pe900_check.py's comparison with the PES file.
function sameNeedle(pattern, what, base = "") {
  const st = normalize(pattern), want = JSON.stringify(needlePoints(st.slice(0, st.findIndex((e) => e[2] === END) + 1)));
  for (const [fmt, write] of Object.entries(WRITERS)) {
    const b = write(pattern), v = validateOut(b, fmt, pattern), got = JSON.stringify(needlePoints(readBack(b, fmt).stitches || []));
    ok(v.ok && got === want, `${what} ${fmt}: ${v.error || "needle points differ from the pattern's"}`);
    if (base) writeFileSync(`${base}.${fmt}`, b);
  }
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
  // 0. LOCK: the exact bytes checked against Brother's own files and PE-DESIGN 11 (2026-10-29) and sent to Ashley.
  //    Any writer change that moves a byte fails here. Only regenerate tests/fixtures/golden/ after re-running the
  //    Brother checks in AGENTS.md ("PEC design box") and the PE900 checker.
  const golden = new Uint8Array(readFileSync(`tests/fixtures/golden/${name}.pes`));
  ok(golden.length === full.length && golden.every((b, i) => b === full[i]), `writer ${name}: output changed from the locked golden file`);
}

// 1b. the 6" x 10" page (docs/writer-changes.md W1): a design no 130 x 180 field holds is written with the 160 x 260
//     hoop in its header (where PE-DESIGN 11 reads the hoop), every other byte as with the 100 x 100 page; a design a
//     5x7 holds keeps the 100 x 100 page. Locked like the others (opened in PE-DESIGN 11, 2026-11-11).
{
  // (the "multi" design twice, one above the other: 103.7 x 227.3 mm, every stitch as it was sewn)
  const cmds = JSON.parse(readFileSync("tests/fixtures/multi_commands.json")), body = cmds.commands.filter((c) => c[2] !== END), first = body.find((c) => c[2] === STITCH);
  const threads = cmds.threads.map((t) => ({ color: t.color, description: t.description, brand: "" }));
  const big = { stitches: [...body, [first[0], first[1] + 1140, TRIM], [first[0], first[1] + 1140, COLOR_CHANGE], [first[0], first[1] + 1140, JUMP], ...body.map(([x, y, c]) => [x, y + 1140, c]), [0, 0, END]], threads: [...threads, ...threads] };
  const full = writePES(big), old = writePES(big, [100, 100]), page = (b) => [b[25] | (b[26] << 8), b[27] | (b[28] << 8)];
  ok(page(full).join() === "160,260", `6x10: page ${page(full)}, expected 160,260`);
  ok(page(writePES({ stitches: cmds.commands, threads })).join() === "100,100", "5x7 design: the page changed from 100,100");
  ok(full.length === old.length && full.every((v, i) => v === old[i] || (i >= 25 && i <= 28)), "6x10: bytes other than the page differ from the 100 x 100 file");
  const fit = (w, h) => validatePES(full, big, { name: "hoop", w, h }).ok;
  ok(fit(160, 260) && !fit(130, 180), "6x10: validatePES should pass the 160 x 260 field and refuse the 130 x 180");
  if (process.argv.includes("--write-6x10")) writeFileSync("tests/fixtures/golden/big_6x10.pes", full);
  const golden = new Uint8Array(readFileSync("tests/fixtures/golden/big_6x10.pes"));
  ok(golden.length === full.length && golden.every((v, i) => v === full[i]), "writer big_6x10: output changed from the locked golden file");
  console.log("writer: big_6x10 (104 x 227 mm) carries the 160 x 260 page; a 5x7 design the 100 x 100");
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
  sameNeedle(d, `re-encode ${name}`, outDir && `${outDir}/${name}`);
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
  sameNeedle(pattern, `fuzz ${t}`, outDir && t < 20 && `${outDir}/fuzz_${t}`);
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

// 7b. pyembroidery's PEC for a design whose first stitch is at the origin has no opening jump: the four bytes where
//     the box goes are the first stitches (dense.pes: 00 00 01 80). Read as a box, it came out 276 x 253 mm of garbage.
{
  const stitches = [[0, 0, STITCH], [1, 66, STITCH], [-40, 66, STITCH], [-40, 0, STITCH], [150, 0, STITCH], [150, 30, STITCH], [0, 0, END]];
  const ours = writePES({ stitches, threads: [{ color: "#112233" }] }), py = stripBoxPrefix(ours);
  const pts = (d) => d.stitches.filter((s) => s[2] === STITCH).map((s) => s.slice(0, 2) + "");
  const d = readEmbroidery(py, "py.pes"), got = pts(d), want = pts(readEmbroidery(ours, "ours.pes"));
  ok(d.misplaced && got.join(" ") === want.join(" "), `origin-start pyembroidery PES misread: ${got.join(" ")}`);
  ok(!endsEarly(py, "py.pes"), "origin-start pyembroidery PES said to end early");
  console.log("origin-start pyembroidery PES:", got.join(" ") === want.join(" ") ? "read as meant" : "MISREAD");
}

// 8. PEC 62-64 are applique codes on Brother machines, never threads: colours that used to land there must not
{
  const stitches = [], threads = ["#ff9900", "#fff08d", "#ffc8c8", "#ff9a05"].map((color) => ({ color }));
  threads.forEach((_, i) => { if (i) stitches.push([0, 0, COLOR_CHANGE]); stitches.push([i * 50, 0, JUMP], [i * 50, 0, STITCH], [i * 50 + 40, 0, STITCH]); });
  stitches.push([0, 0, END]);
  const pec = readEmbroidery(writePES({ stitches, threads }), "a.pes").pec;
  ok(pec.every((i) => i < 62), `colours mapped to applique codes: ${pec}`);
  console.log("applique codes avoided:", pec.join(","));
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

// 9. DST, EXP, JEF, VP3 (docs/formats-out-spec.md section 9). Locked like the PES: tests/fixtures/golden/<name>.dst|exp|jef|vp3,
//    rewritten only on purpose (`--write-out`), then read back with pyembroidery by hand (`tests/make_fixture.py
//    oracle ...`, the JSON committed beside them) and compared here within the spec's tolerances.
{
  const [S, J, T, E, C, P] = [STITCH, JUMP, TRIM, END, COLOR_CHANGE, 3];
  const fix = (name) => { const c = JSON.parse(readFileSync(`tests/fixtures/${name}_commands.json`)); return { stitches: c.commands, threads: c.threads.map((t) => ({ color: t.color, description: t.description, brand: "" })) }; };
  const OUT = {
    // Appendix B: odd width and height (395 x 125), an opening jump, trims, a colour change, a thread with every string
    appendix_b: { threads: [{ color: "#c8102e", description: "Red", brand: "Acme", catalog: "1147" }, { color: "#1a1a1a", description: "Black" }],
      stitches: [[-50, -40, J], [-50, -40, S], [-20, -40, S], [10.5, -38.5, S], [0, 0, T], [310, 60, J], [310, 60, S], [330, 85, S], [0, 0, C], [345, 85, J], [345, 85, S], [345, 20, S], [0, 0, T], [0, 0, E]] },
    ashley_v3: fix("ashley_v3"),
    multi: fix("multi"),
    // a pause (STOP: a block of its own, same thread), an empty segment (two changes in a row), stitches after the END (dropped), a name only, an
    // untrimmed 30 mm jump (three DST records: a Tajima cuts there, and pyembroidery reads a TRIM)
    pause: { threads: [{ color: "#2a6f3b", name: "Green" }, { color: "#f0e68c" }, { color: "#3060c0", description: "Blue", brand: "Brand", catalog: "77" }],
      stitches: [[400, -300, J], [400, -300, S], [430, -300, S], [430, -270, S], [0, 0, P], [460, -270, S], [490, -250, S], [0, 0, T], [190, -250, J], [190, -250, S], [190, -200, S],
        [0, 0, C], [0, 0, C], [-200, 100, J], [-200, 100, S], [-150, 160, S], [-150, 160, S], [-100, 160, S], [200, 160, J], [200, 160, S], [220, 175, S], [0, 0, T], [0, 0, E], [50, 50, S], [0, 0, E]] },
  };
  const VECTORS = { dst: "7e85b9f09624cf2d0d109d07410244105d1541722577f2e95d7c6147c0a4edd0", exp: "4aba03f836f53e827f29f6cf272de10f715e0659cec41652d1d02507fdd1a062", vp3: "6af47e19abc685d4e8366ff14b6bb0928fa3e265608b7ffcc3a936b9ac9aa5a4",
    // (B.3 takes the palette numbers as given, 9 and 1: written into the bytes before hashing)
    jef: "4ea3d8e930a5b36ebcac1a0ed5f0d58db0864bfba8894c17e0b673328bf0becf" };
  // a JEF holds its date: the tests fix it (spec B.3)
  const DATED = { ...WRITERS, jef: (p) => writeJEF(p, "20261113120000") };
  const names = { [S]: "STITCH", [J]: "JUMP", [T]: "TRIM", [C]: "COLOR_CHANGE", [E]: "END" };
  let checked = 0, oracles = 0;
  for (const [name, pattern] of Object.entries(OUT)) {
    const st = normalize(pattern), cut = st.slice(0, st.findIndex((e) => e[2] === E) + 1), changes = cut.filter((e) => e[2] === C || e[2] === P).length;
    sameNeedle(pattern, `golden ${name}`);
    for (const [fmt, write] of Object.entries(DATED)) {
      const b = write(pattern), file = `tests/fixtures/golden/${name}.${fmt}`, id = `${name}.${fmt}`;
      if (process.argv.includes("--write-out")) writeFileSync(file, b);
      const golden = existsSync(file) ? new Uint8Array(readFileSync(file)) : new Uint8Array();
      ok(golden.length === b.length && golden.every((v, i) => v === b[i]), `writer ${id}: output changed from the locked golden file`);
      if (name === "appendix_b") { const v = b.slice(); if (fmt === "jef") { v[0x74] = 9; v[0x78] = 1; } ok(createHash("sha256").update(v).digest("hex") === VECTORS[fmt], `writer ${id}: not the spec's Appendix B bytes`); }
      // (a JEF's palette numbers are the Janome threads the page names, one per segment: spec 9)
      if (fmt === "jef") { const n = b[24], nums = Array.from({ length: n }, (_, k) => b[116 + 4 * k]); ok(JSON.stringify(nums) === JSON.stringify(jefThreads(pattern).map((t) => t.index)), `${id}: palette ${nums}`); }
      if (fmt === "dst") ok(JSON.stringify(needlePoints(readEmbroidery(b, "x.dst").stitches)) === JSON.stringify(needlePoints(cut)), `${id}: readEmbroidery's needle points differ`);
      checked++;
      // the oracle: pyembroidery's reader on the golden file
      if (!existsSync(file + ".json")) { ok(false, `${id}: no oracle (.venv/bin/python tests/make_fixture.py oracle ${file})`); continue; }
      const o = JSON.parse(readFileSync(file + ".json")), got = o.stitches;
      const near = (a, q) => Math.abs(a[0] - q[0]) < 1e-6 && Math.abs(a[1] - q[1]) < 1e-6;
      // what pyembroidery must read, entry by entry: DST as our own reader's trim interpolation (formats-spec 7, the same
      // rule) with the trims where the needle is; EXP as written; VP3 as the gate reads it, less the zero-length jumps
      // pyembroidery puts at a block's start
      let want;
      if (fmt === "dst") {
        const r = readEmbroidery(b, "x.dst").stitches;
        // (our reader puts an interpolated TRIM at (0, 0); pyembroidery where the needle is)
        want = r.map((e, i) => { if (e[2] !== T) return e; const prev = r.slice(0, i).reverse().find((q) => q[2] !== T); return [prev ? prev[0] : 0, prev ? prev[1] : 0, T]; });
      }
      else if (fmt === "jef") {
        // (as DST, spec 9: a run of three or more jump records straight after a stitch reads with a TRIM before it)
        const r = readBack(b, fmt).stitches;
        want = [];
        r.forEach((e, i) => {
          const run = e[2] === J && r[i - 1]?.[2] !== J && r[i + 1]?.[2] === J && r[i + 2]?.[2] === J;
          if (run && r[i - 1]?.[2] === S) want.push([r[i - 1][0], r[i - 1][1], T]);
          want.push(e);
        });
      }
      else want = readBack(b, fmt).stitches;
      const have = fmt === "vp3" ? got.filter((e, i) => !(e[2] === "JUMP" && i && near(e, got[i - 1]))) : got;
      const bad = have.length !== want.length ? `${have.length} entries, want ${want.length}` : have.map((e, i) => (e[2] === names[want[i][2]] && near(e, want[i]) ? "" : `entry ${i}: ${e} vs ${want[i]}`)).find(Boolean);
      ok(!bad, `oracle ${id}: ${bad}`);
      ok(JSON.stringify(needlePoints(got.map(([x, y, c]) => [x, y, c === "STITCH" ? S : -1]))) === JSON.stringify(needlePoints(cut)), `oracle ${id}: needle points differ`);
      ok(got.filter((e) => e[2] === "COLOR_CHANGE").length === changes && got.at(-1)[2] === "END", `oracle ${id}: changes or END`);
      if (fmt === "vp3") {
        const want = (cut.reduce((a, e) => { if (e[2] === C) a.t++; if (e[2] === C || e[2] === P) a.s.push(a.t); return a; }, { t: 0, s: [0] })).s.map((k) => pattern.threads[Math.min(k, pattern.threads.length - 1)]);
        const str = (t) => [t.color, t.description ?? t.name ?? t.color, t.catalog ?? "", t.brand ?? ""].join("|");
        ok(o.threads.map((t) => [t.color, t.description, t.catalog ?? "", t.brand ?? ""].join("|")).join() === want.map(str).join(), `oracle ${id}: threads ${JSON.stringify(o.threads)}`);
      } else if (fmt === "jef") ok(o.threads.length === b[24], `oracle ${id}: ${o.threads.length} threads, want ${b[24]}`);
      else ok(o.threads.length === 0, `oracle ${id}: ${o.threads.length} threads`);
      oracles++;
    }
  }
  // a second witness, pyembroidery's own writers (spec 9; `tests/make_fixture.py pywriter`): a centred design of even
  // size, its jumps split already. EXP and DST identical; VP3 only its stitch count (0x59-0x5C: they count every entry)
  {
    const c = JSON.parse(readFileSync("tests/fixtures/centred_commands.json")), p = { stitches: c.commands, threads: c.threads.map((t) => ({ color: t.color, description: t.description, brand: "" })) };
    for (const [fmt, write] of Object.entries(WRITERS)) {
      const ours = write(p), py = new Uint8Array(readFileSync(`tests/fixtures/centred_py.${fmt}`)), allowed = fmt === "vp3" ? [0x59, 0x5a, 0x5b, 0x5c] : [];
      // (JEF: its date and palette numbers are its own, pyembroidery's from its own table; the hoop fields are the
      // spec's reading. The counts, offset and every stitch byte must agree)
      if (fmt === "jef") allowed.push(...Array.from({ length: ours[0] - 8 }, (_, i) => i + 8).filter((i) => i < 24 || i >= 32));
      const diff = [...ours.keys()].filter((i) => ours[i] !== py[i] && !allowed.includes(i));
      ok(ours.length === py.length && !diff.length, `${fmt}: differs from pyembroidery's writer at ${diff.slice(0, 8)} (${ours.length} vs ${py.length} bytes)`);
    }
  }
  // errors, as writePES words them
  for (const [fmt, write] of Object.entries(WRITERS)) {
    let e = ""; try { write({ stitches: [[0, 0, J], [0, 0, E]], threads: [] }); } catch (err) { e = err.message; }
    ok(e === "There's nothing to stitch.", `${fmt}: empty design said "${e}"`);
    e = ""; try { write({ stitches: [[0, 0, S], [5, 0, S], ...Array(251).fill([0, 0, P]), [0, 0, E]], threads: [] }); } catch (err) { e = err.message; }
    ok(e === `Too many colour changes for a ${fmt.toUpperCase()} file (250 max).`, `${fmt}: 251 stops said "${e}"`);
    const fine = write({ stitches: [[0, 0, S], [5, 0, S], ...Array(250).fill([0, 0, P]), [0, 0, E]], threads: [] });
    ok(validateOut(fine, fmt, { stitches: [[0, 0, S], [5, 0, S], ...Array(250).fill([0, 0, P]), [0, 0, E]] }).ok, `${fmt}: 250 stops refused`);
  }
  // the gate's read-back catches a damaged file
  {
    const p = OUT.multi;
    for (const [fmt, write] of Object.entries(WRITERS)) {
      const good = write(p);
      let caught = 0;
      for (let k = 0; k < 50; k++) { const bad = good.slice(), at = (fmt === "dst" ? 512 : 0) + ((k * 7919) % (good.length - (fmt === "dst" ? 512 : 0))); bad[at] ^= 0x24; if (!validateOut(bad, fmt, p).ok) caught++; }
      ok(caught >= 45, `${fmt}: damage caught ${caught}/50`);
      ok(!validateOut(good.slice(0, good.length - 7), fmt, p).ok, `${fmt}: a cut-short file passed`);
      console.log(`${fmt}: damage caught ${caught}/50 (a flip in the header text or a thread name can't move a stitch)`);
    }
  }
  // Janome threads (spec 5.4, 7.1): only measured numbers, two colours never sharing one while one is free, the same
  // colour always the same thread; 200 random thread lists
  {
    let r = 7;
    const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648, hex = () => "#" + Array.from({ length: 3 }, () => Math.floor(rnd() * 256).toString(16).padStart(2, "0")).join("");
    let bad = 0;
    for (let k = 0; k < 200; k++) {
      const cols = Array.from({ length: 1 + Math.floor(rnd() * 60) }, () => (rnd() < 0.3 ? "#000000" : hex())), t = janomeThreads(cols.map((color) => ({ color })));
      const by = new Map();
      cols.forEach((c, i) => { if (!JANOME[t[i].index]) bad++; if (by.has(c) && by.get(c) !== t[i].index) bad++; by.set(c, t[i].index); });
      const distinct = new Set(cols).size, used = new Set(t.map((x) => x.index)).size;
      if (used !== Math.min(distinct, 51)) bad++;
    }
    ok(!bad && JANOME.filter(Boolean).length === 51, `Janome threads: ${bad} bad of 200 lists`);
    ok(janomeThreads([{ color: "#000000" }, { color: "#ffffff" }, { color: "#ff0000" }]).map((t) => `${t.index} ${t.number} ${t.name}`).join() === "1 002 Black,2 001 White,10 225 Red", "Janome: black, white, red");
  }
  console.log(`other formats: ${checked} golden files (Appendix B byte for byte), ${oracles} read back by pyembroidery as written; a centred one as pyembroidery's writers write it`);
}

console.log(fail ? `${fail} failures` : "all passed");
process.exit(fail ? 1 : 0);
