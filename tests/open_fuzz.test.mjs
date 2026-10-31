// Class guarded: hostile or damaged files through "Open a design" (category audit class 7, hostile files). Seeded
// mutations of PES/PEC/DST files (byte flips, truncation, cut and spliced chunks, huge counts in the headers) go
// through doctor.js `openedFile`, the same code app.js's Open tab runs, then through what the tab would save: the
// file as opened, and the checkup's fixes for what it fails (the doctor's `fix`). Fails when opening throws anything
// but a plain read error (a TypeError or RangeError means an unchecked path), takes over 3 s, or when what the Open
// tab offers to save is refused by the exit gate (js/gate.js), a HARD rule above all: the tab must never offer a
// file the machine can't take. Saved designs (.needleworks.json) are fuzzed in the browser (tests/browser/engine_fuzz.html).
// Run: node tests/open_fuzz.test.mjs [count=600] [seed=1]   (~1 min; tests/external/pes adds Brother-made samples)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { COLOR_CHANGE, END, JUMP, STITCH, designStats, writePES } from "../js/core/formats.js";
import { fix, openedFile } from "../js/doctor.js";
import { judge } from "../js/gate.js";

const COUNT = +(process.argv[2] || 600), SEED = +(process.argv[3] || 1);
let s = SEED >>> 0 || 1;
const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick = (a) => a[Math.floor(rnd() * a.length)];

// seeds: the golden files, every sample there is, a few designs written here (many colours, long stitches, jumps),
// and a DST of random records
const seeds = [];
for (const dir of ["tests/fixtures/golden", "tests/external/pes"].filter(existsSync))
  for (const f of readdirSync(dir).filter((x) => /\.(pes|dst)$/i.test(x))) seeds.push({ name: f, bytes: new Uint8Array(readFileSync(`${dir}/${f}`)) });
{
  const st = [];
  for (let b = 0; b < 12; b++) {
    if (b) st.push([b * 30, 0, COLOR_CHANGE]);
    st.push([b * 30, 0, JUMP]);
    for (let i = 0; i < 60; i++) st.push([b * 30 + (i % 2) * 25, i * 4, STITCH]);
  }
  st.push([0, 0, END]);
  seeds.push({ name: "made.pes", bytes: writePES({ stitches: st, threads: Array.from({ length: 12 }, (_, i) => ({ color: `#${(i * 0x153b7f).toString(16).padStart(6, "0").slice(-6)}` })) }) });
  // (round 8's colours_121.pes: more thread changes than the machine takes, two colours taking turns)
  const many = [];
  for (let b = 0; b < 121; b++) { if (b) many.push([b * 8, 0, COLOR_CHANGE]); many.push([b * 8, 0, JUMP]); for (let i = 0; i < 12; i++) many.push([b * 8 + (i % 2) * 6, i * 5, STITCH]); }
  many.push([0, 0, END]);
  seeds.push({ name: "colours_121.pes", bytes: writePES({ stitches: many, threads: Array.from({ length: 121 }, (_, i) => ({ color: i % 2 ? "#ed171f" : "#0e1f7c" })) }) });
  // (and a DST with 150 thread changes: no PES can hold that many)
  const changes = new Uint8Array(512 + 3 * 1200).fill(0x20);
  for (let i = 0; i < 1199; i++) changes.set(i % 8 === 7 ? [0, 0, 0xc3] : [i % 2 ? 0x05 : 0x06, 0, 0x03], 512 + 3 * i);
  changes.set([0, 0, 0xf3], 512 + 3 * 1199);
  seeds.push({ name: "changes_150.dst", bytes: changes });
  const dst = new Uint8Array(512 + 3 * 400).fill(0x20);
  for (let i = 512; i < dst.length - 3; i += 3) { dst[i] = ri(0, 255); dst[i + 1] = ri(0, 255); dst[i + 2] = ri(0, 255) & 0xf3 | 0x03; if ((dst[i + 2] & 0xf3) === 0xf3) dst[i + 2] = 0x03; }
  dst.set([0, 0, 0xf3], dst.length - 3);
  seeds.push({ name: "made.dst", bytes: dst });
}

const u32 = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
// one mutation, named for the log
function mutate(src) {
  let b = src.bytes.slice(), name = src.name, kind = pick(["none", "flip", "flip", "flipStitches", "truncate", "cut", "insert", "splice", "count", "count", "rename"]);
  const pec = /\.pes$/i.test(name) && b.length > 12 ? u32(b, 8) : 0;
  const stitchAt = pec && pec + 532 < b.length ? pec + 532 : 512;
  if (kind === "flip") for (let k = ri(1, 24); k--;) b[ri(0, b.length - 1)] = ri(0, 255);
  if (kind === "flipStitches") for (let k = ri(1, 40); k--;) b[ri(Math.min(stitchAt, b.length - 1), b.length - 1)] = ri(0, 255);
  if (kind === "truncate") b = b.slice(0, ri(0, b.length));
  if (kind === "cut") { const a = ri(0, b.length - 1), z = Math.min(b.length, a + ri(1, 2000)); b = new Uint8Array([...b.subarray(0, a), ...b.subarray(z)]); }
  if (kind === "insert") { const a = ri(0, b.length), junk = Array.from({ length: ri(1, 500) }, () => ri(0, 255)); b = new Uint8Array([...b.subarray(0, a), ...junk, ...b.subarray(a)]); }
  if (kind === "splice") { const o = pick(seeds).bytes, a = ri(0, b.length), c = ri(0, o.length); b = new Uint8Array([...b.subarray(0, a), ...o.subarray(c)]); }
  if (kind === "count") {
    // a count or offset in a header made huge, zero or off by a little
    const v = pick([0, 1, 0xff, 0xffff, 0x7fffffff, 0xffffffff, ri(0, 300)]), at = pec ? pick([8, pec + 48, pec + 514, pec + 520, pec + 522, 0x30, 0x31]) : pick([512, 3, 100]);
    if (at + 4 <= b.length) for (let i = 0; i < pick([1, 2, 3, 4]); i++) b[at + i] = (v >>> (8 * i)) & 0xff;
  }
  if (kind === "rename") name = name.replace(/\.\w+$/, pick([".pec", ".dst", ".pes"]));
  return { name, bytes: b, kind, from: src.name };
}

// (the gate throwing is a problem too: it would leave the button doing nothing)
const judgeSafe = (file, hoop) => { try { return judge(file, hoop); } catch (err) { return { ok: false, error: `the gate threw ${err.constructor.name}: ${err.message}` }; } };
const t0 = Date.now();
const HOOP = { w: 130, h: 180, name: "5x7 hoop" };
let bad = 0, opened = 0, refusedRead = 0, fixed = 0, soft = 0, tooBig = 0, shrunk = 0, overshoot = 0;
const reasons = new Map();
// (DUMP=dir keeps each failing file, as fail_<n>_<name>, to open in the app or step through)
const fail = (m, f) => {
  bad++; if (bad <= 40) console.error(`FAIL ${f.from} ${f.kind} -> ${f.name} (${f.bytes.length} bytes): ${m}`);
  if (process.env.DUMP) { mkdirSync(process.env.DUMP, { recursive: true }); writeFileSync(`${process.env.DUMP}/fail_${bad}_${f.name}`, f.bytes); }
};
for (let i = 0; i < COUNT; i++) {
  const f = mutate(pick(seeds)), t = Date.now();
  let o;
  try { o = openedFile(f.bytes, f.name); }
  catch (err) {
    // (the Open tab says the file couldn't be read: fine for a damaged file; a TypeError/RangeError is a path nobody checked)
    if (err instanceof TypeError || err instanceof RangeError) fail(`${err.constructor.name}: ${err.message}`, f);
    else { refusedRead++; const k = err.message.replace(/\d+/g, "N").slice(0, 60); reasons.set(k, (reasons.get(k) || 0) + 1); }
    continue;
  }
  if (Date.now() - t > 3000) fail(`took ${Date.now() - t} ms to open`, f);
  opened++;
  // what Download would hand out as the file stands, in the 5x7 hoop (a design too big for it says so and has no
  // Download: Make it the largest that fits is a resize, the doctor's `fix` with a scale)
  const st = designStats(o.d), fits = st.widthMm <= HOOP.w - 4 && st.heightMm <= HOOP.h - 4;
  if (!fits) {
    // (Make it the largest that fits: the size box goes down to 50 %, and shrinking ticks Remove tiny stitches and Thin)
    tooBig++;
    const scale = Math.min((HOOP.w - 4) / st.widthMm, (HOOP.h - 4) / st.heightMm) * 0.995;
    if (scale < 0.5 || rnd() > 0.25 || o.stuck) continue;
    try {
      const p = fix(o.fixBase || o.d, { scale, tiny: true, thin: true, join: o.colourless }), ps = designStats(p);
      // (re-stitched, it can come out a hair bigger: the tab then says Too big and has no Download)
      if (ps.widthMm > HOOP.w - 4 || ps.heightMm > HOOP.h - 4) { overshoot++; continue; }
      const j = judgeSafe({ name: "x.pes", bytes: writePES(p), against: p }, HOOP);
      shrunk++;
      if (!j.ok) fail(`shrunk to ${(scale * 100).toFixed(0)} %, it's refused: ${j.error}`, f);
    } catch (err) { if (!/too many|nothing to stitch/i.test(err.message)) fail(`shrinking it threw ${err.constructor.name}: ${err.message}`, f); }
    continue;
  }
  if (o.out) {
    const j = judgeSafe({ name: "x.pes", bytes: o.out, against: o.isPes ? null : o.d }, HOOP);
    if (!j.ok) fail(`the file the Open tab offers is refused: ${j.error}`, f);
  } else if (!o.stuck) fail("nothing to save, yet not said why", f);
  // and the checkup's fixes for what it fails, as the Open tab ticks them (doctor-worker.js runs `fix`)
  if (o.need.size && o.out && rnd() < 0.5) {
    try {
      const p = fix(o.fixBase || o.d, { tiny: o.need.has("tiny") || o.need.has("same"), thin: o.need.has("dense"), split: o.need.has("long"), satin: o.need.has("sparse"), join: o.colourless });
      const j = judgeSafe({ name: "x.pes", bytes: writePES(p), against: p }, HOOP);
      fixed++;
      if (!j.ok) fail(`the fixed copy is refused: ${j.error}`, f); else if (j.problems.length) soft++;
    } catch (err) { if (!/too many|nothing to stitch/i.test(err.message)) fail(`fixing it threw ${err.constructor.name}: ${err.message}`, f); }
  }
}
console.log(`open fuzz: ${COUNT} files from ${seeds.length} seeds (seed ${SEED}): ${opened} opened (${tooBig} too big for the 5x7, ${shrunk} of them shrunk to fit, ${overshoot} still over after shrinking), ${refusedRead} refused as unreadable, ${fixed} fixed (${soft} still with quality notes), ${bad} problems, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (process.env.VERBOSE) console.log(reasons);
process.exit(bad ? 1 : 0);
