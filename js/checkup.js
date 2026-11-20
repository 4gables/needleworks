/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// What the page reads off a file: the checkup, the Thickness view, the machine's loads and pauses, the thread changes
// colour sort would leave, and a file opened as it was meant. Nothing here makes stitches (that is doctor.js, which
// hands these on), so both builds ship it (docs/roadmap.md "The paid version").
import { COLOR_CHANGE, designBlockAgrees, END, JUMP, readEmbroidery, STITCH, STOP, TRIM, writePES } from "./core/formats.js";
import { density } from "./core/density.js";
import { LIMITS, MOVES } from "./core/limits.js";
import { nearestBrotherThread, pecThread } from "./core/threads.js";
import { endsEarly, HARD, LIMIT, MAX_BLOCKS, MAX_STITCH, moves, peak, satinGap, stopWords, verdict, verdictOf } from "./quality.js";

// (LIMIT: 24 needle hits per mm² per colour block, the densest spot in sold designs; the counts are pe900_check.py's,
// from quality.js, so the checkup and the download's verdict agree)

// the Thickness view: for each 1 mm cell, the most hits in any 1 mm window round it in one colour block
// (Map "cx,cy" -> count; counted at every offset, as the checker counts)
export function heat(pattern) {
  const out = new Map();
  for (const c of density(pattern.stitches, (hits) => hits < LIMIT / 2).cells) { const k = `${c.cx},${c.cy}`; if (c.top > (out.get(k) || 0)) out.set(k, c.top); }
  return out;
}

// what the checkup says about a pattern: give it the file as it will be saved (decoded from its bytes), so the
// numbers are the saved file's (they described the design before the writer split its long stitches: "up to 26"
// beside a file that measured 24)
export function checkup(pattern) {
  const st = pattern.stitches, m = moves(st);
  let long = 0, last = null, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, c] of st) {
    if (c === STITCH) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      if (last && Math.hypot(x - last[0], y - last[1]) > 100) long++;
      last = [x, y];
    } else if (c === JUMP) last = [x, y];
  }
  const { max, hot } = peak(pattern);
  const sqin = Math.max(((x1 - x0) / 254) * ((y1 - y0) / 254), 0.1);
  return { stitches: m.stitches, tiny: m.tiny, long, over: m.over, longest: m.longest, max, hot, perSqIn: Math.round(m.stitches / sqin), satinGap: satinGap(st), verdict: verdict(pattern) };
}

// moves between 1 and 5 mm, from the last stitch to the next: too short for the PE900 to trim (its lowest setting is
// 5 mm), left as loose thread
export const shortJumps = (p) => (p.shortJumps ??= blockLoads(p).reduce((a, b) => a + b.snips, 0));
// What the machine does in each colour block (indexed as render.js colorBlocks counts them, a COLOR_CHANGE each):
// stitches, threads cut (trims) and loose threads left (`snips`). The time and the loose threads every surface says
// come from these counts (the chips said 13 min where Sew along's steps added up to 12: each step counted its own way).
export function blockLoads(p) {
  if (p.loads) return p.loads;
  const out = [{ stitches: 0, trims: 0, snips: 0 }];
  let from = null, last = null;
  for (const [x, y, c] of p.stitches) {
    const b = out[out.length - 1];
    if (c === JUMP) { if (!from) from = last; last = [x, y]; continue; }
    if (c === STITCH) {
      b.stitches++;
      if (from) { const d = Math.hypot(x - from[0], y - from[1]); if (d > MOVES.looseFrom * 10 && d <= MOVES.trimmed * 10) b.snips++; from = null; }
      last = [x, y];
    }
    if (c === TRIM) b.trims++;
    if (c === COLOR_CHANGE) { from = null; last = null; out.push({ stitches: 0, trims: 0, snips: 0 }); }
  }
  return (p.loads = out);
}

// colour blocks: [{ stitches (no colour changes or END), thread }]
export function blocksOf(pattern) {
  const out = [{ stitches: [], thread: pattern.threads[0], i: 0 }];
  for (const s of pattern.stitches) {
    if (s[2] === COLOR_CHANGE) out.push({ stitches: [], thread: pattern.threads[out.length] || pattern.threads[pattern.threads.length - 1], i: out.length });
    else if (s[2] !== END) out[out.length - 1].stitches.push(s);
  }
  return out.filter((b) => b.stitches.some((s) => s[2] === STITCH));
}
function joinBlocks(blocks) {
  const stitches = [];
  blocks.forEach((b, i) => {
    if (i) { const l = stitches[stitches.length - 1]; stitches.push([l[0], l[1], COLOR_CHANGE]); }
    stitches.push(...b.stitches);
  });
  const l = stitches[stitches.length - 1]; stitches.push([l[0], l[1], END]);
  return { stitches, threads: blocks.map((b) => b.thread) };
}

// Fewer thread changes (Embrilliance's colour sort at tolerance 0): a block moves up to join the last earlier block in
// the same thread when it touches nothing sewn in between (cells 1 mm, grown by one), so what lies on top of what
// never changes. Files with machine stops (appliqué fabric steps) are left alone. null when nothing can move.
export function sortColors(pattern) {
  if (pattern.stitches.some((s) => s[2] === STOP)) return null;
  const blocks = blocksOf(pattern);
  // (a DST has no thread colours: every block would look like the same thread)
  if (blocks.length < 2 || pattern.threads.length < blocks.length || blocks.some((b) => !b.thread?.color)) return null;
  // (two blocks in a row in one thread are a pause, not a thread change: an in-the-hoop bookmark's or appliqué's
  // fabric steps. Merged, the bookmark lost all four and its copy piled 25 hits/mm²)
  if (pauses(pattern)) return null;
  const cells = (b) => {
    const c = new Set();
    for (const [x, y, k] of b.stitches) if (k === STITCH) { const X = Math.floor(x / 10), Y = Math.floor(y / 10); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) c.add(X + dx + "," + (Y + dy)); }
    return c;
  };
  const out = [];
  let moved = 0;
  for (const b of blocks) {
    const mine = cells(b), hex = (b.thread?.color || "").toLowerCase();
    let at = -1;
    for (let i = out.length - 1; i >= 0; i--) {
      if ((out[i].thread?.color || "").toLowerCase() === hex) { at = i; break; }
      if ([...mine].some((k) => out[i].cells.has(k))) break;
    }
    if (at < 0) { out.push({ ...b, stitches: b.stitches.slice(), cells: mine }); continue; }
    // trim, then jump to where the moved block starts
    const t = out[at], last = t.stitches[t.stitches.length - 1], first = b.stitches.find((s) => s[2] === STITCH || s[2] === JUMP);
    t.stitches.push([last[0], last[1], TRIM]);
    if (first[2] === STITCH) t.stitches.push([first[0], first[1], JUMP]);
    t.stitches.push(...b.stitches); for (const k of mine) t.cells.add(k); moved++;
  }
  return moved ? joinBlocks(out) : null;
}
// Few enough colour blocks for the machine (99, MAX_BLOCKS; the PES writer refuses over 127): consecutive blocks in
// one colour joined (a trim where the machine would have stopped), then colour sort. The pattern, or null when that
// still leaves too many.
export function fewerBlocks(pattern) {
  const j = joinSame(pattern), p = sortColors(j) || j;
  return p.threads.length <= MAX_BLOCKS ? p : null;
}
// Consecutive blocks in one colour joined, a trim where the machine would have stopped (the same pattern when there
// are none). Only for files whose colours were picked here (DST) or that hold too many: in a PES two blocks in a
// row in one thread are a fabric step.
export function joinSame(pattern) {
  const out = [];
  let joined = 0;
  for (const b of blocksOf(pattern)) {
    const t = out[out.length - 1];
    if (!t || (t.thread?.color || "").toLowerCase() !== (b.thread?.color || "").toLowerCase()) { out.push({ ...b, stitches: b.stitches.slice() }); continue; }
    const last = t.stitches[t.stitches.length - 1], first = b.stitches.find((s) => s[2] === STITCH || s[2] === JUMP);
    t.stitches.push([last[0], last[1], TRIM]);
    if (first[2] === STITCH) t.stitches.push([first[0], first[1], JUMP]);
    t.stitches.push(...b.stitches); joined++;
  }
  return joined ? joinBlocks(out) : pattern;
}
// thread changes that are machine pauses: the next block is in the same thread (same PEC thread, or same colour)
export function pauses(pattern) {
  const pec = pattern.pec, t = pattern.threads;
  let n = 0, k = 0;
  for (const s of pattern.stitches) if (s[2] === STOP) n++; else if (s[2] === COLOR_CHANGE) {
    k++;
    const same = pec && pec.length > k ? pec[k] === pec[k - 1] : !!t[k]?.color && t[k].color.toLowerCase() === t[k - 1]?.color?.toLowerCase();
    if (same) n++;
  }
  return n;
}
// how many thread changes colour sort would leave (null: it can't help)
// (`join`: consecutive blocks in one colour count as one, for colours picked here)
export const sortedChanges = (pattern, join = false) => {
  const j = join ? joinSame(pattern) : pattern, s = sortColors(j) || (j !== pattern ? j : null);
  return s && s.threads.length - 1;
};

// Jumps land where their first stitch goes in. Our writer (like pyembroidery's) puts the needle down where a jump
// ends before the first stitch, so a file whose jumps stop short of it (all 49 of peace.pes's, by 0.5-12 mm) gained a
// hole there, often 2-5 mm from the last stitch: a loose thread too short for the machine to trim (3 -> 31 when
// re-saved). A run of jumps becomes one (the writer splits any over 121 mm).
// A file that starts with a stitch and goes straight on further than the machine sews in one stitch (12.1 mm) starts
// with its way to the design: a pyembroidery file starting at the origin (round 6's origin_start.pes) was saved
// sewing a line out from the origin in 6.7 mm stitches. That first move is a jump.
export function landJumps(pattern) {
  let st = pattern.stitches;
  const out = [], k = st.findIndex((s) => s[2] === STITCH || s[2] === JUMP), a = st[k], b = st[k + 1];
  if (a?.[2] === STITCH && b?.[2] === STITCH && Math.hypot(b[0] - a[0], b[1] - a[1]) > MAX_STITCH) st = [...st.slice(0, k), [b[0], b[1], JUMP], ...st.slice(k + 1)];
  // (and any design starting with a stitch starts with a jump there, as our own do: the writer starts at the origin,
  // so a DST or mended PES whose first stitch was elsewhere read back with a stitch more, out from the origin, and
  // was refused at Download: tests/open_fuzz.test.mjs)
  else if (a?.[2] === STITCH) st = [...st.slice(0, k), [a[0], a[1], JUMP], ...st.slice(k)];
  for (let i = 0; i < st.length; i++) {
    if (st[i][2] !== JUMP) { out.push(st[i]); continue; }
    let j = i;
    while (st[j + 1]?.[2] === JUMP) j++;
    const s = st[j + 1];
    // (jumps that go nowhere are dropped: at the very end, or before a trim or thread change after which the needle
    // jumps again. The writer puts the needle down where a jump ends, so each was a stitch the file never had, and a
    // damaged file's last jump 3.5 m away made the design unwritable)
    let k = j + 1;
    while (st[k] && st[k][2] !== STITCH && st[k][2] !== JUMP && st[k][2] !== END) k++;
    if (!s || s[2] === END || (s[2] !== STITCH && (!st[k] || st[k][2] !== STITCH))) { i = j; continue; }
    out.push(s[2] === STITCH ? [s[0], s[1], JUMP] : st[j]);
    i = j;
  }
  return { ...pattern, stitches: out };
}

// One thread per colour block, as the writer needs: it lists every thread it's given in the PEC header, and the
// machine (and pe900_check) expects one per block. A PES whose header named two threads for its one block was saved
// "Checked" with "2 colours" for 1 (round 6's disagree.pes).
export function blockThreads(pattern) {
  let blocks = 1;
  for (const s of pattern.stitches) if (s[2] === COLOR_CHANGE) blocks++;
  return pattern.threads.length > blocks ? { ...pattern, threads: pattern.threads.slice(0, blocks) } : pattern;
}

// An opened file (Open a design): what it is, what's wrong with it, and the bytes a download starts from (`out`: the
// file's own bytes when they can go out as they are, else written again; null when it can't be saved at all). Throws
// an error with `plain` (words to show) for a file with no stitches; anything else that throws is an unreadable file.
// app.js `openDesign` shows it; tests/open_fuzz.test.mjs feeds it damaged files.
export const DST_COLOURS = ["#0e1f7c", "#ed171f", "#00673e", "#e8a900", "#770176", "#f64a8a", "#000000", "#c70156"];
const brother = (hex) => { const t = nearestBrotherThread(hex); return { color: hex, name: t.name, brand: "Brother" }; };
// A design far from the origin (over 200 mm: a PES box holds 204.8 mm either way, so it can't be written there) moved
// to sit on it, as the machine centres it anyway. Files that fit stay where they are, byte for byte.
// (centred on its stitches, and any jump still out there stops at their edge: the frame needn't travel further)
function centred(d) {
  const far = (c) => { for (const [x, y, k] of d.stitches) if ((k === STITCH || k === JUMP) && Math.max(Math.abs(x - c[0]), Math.abs(y - c[1])) > LIMITS.recentre * 10) return true; return false; };
  if (!far([0, 0])) return d;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, c] of d.stitches) if (c === STITCH) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2), lim = (v, a, b) => Math.min(b, Math.max(a, v));
  return { ...d, stitches: d.stitches.map(([x, y, c]) => (c === JUMP ? [lim(x, x0, x1) - cx, lim(y, y0, y1) - cy, c] : [x - cx, y - cy, c])) };
}
// A design starts with its first needle move: thread changes and trims before it (empty blocks at the start of a
// damaged file) go, with their threads. Written as they were, the writer's start read back as one stitch more and
// Download refused the file.
function firstMove(d) {
  const k = d.stitches.findIndex((s) => s[2] === STITCH || s[2] === JUMP);
  if (k <= 0) return d;
  const skipped = d.stitches.slice(0, k).filter((s) => s[2] === COLOR_CHANGE).length;
  return { ...d, stitches: d.stitches.slice(k), threads: d.threads.slice(Math.min(skipped, Math.max(0, d.threads.length - 1))), pec: d.pec?.slice(skipped) };
}
// What a file that isn't an embroidery design is, from its first bytes, said plainly (with `picture`: the image type,
// for Picture to stitches to take it), or null. A PNG renamed .pes said "has no stitches in it... may be damaged", an
// empty file the same; a zipped download is the usual way designs come.
const SNIFF = [
  [[0x89, 0x50, 0x4e, 0x47], "a picture (PNG)", "image/png"], [[0xff, 0xd8, 0xff], "a picture (JPEG)", "image/jpeg"],
  [[0x47, 0x49, 0x46, 0x38], "a picture (GIF)", "image/gif"], [[0x25, 0x50, 0x44, 0x46], "a PDF (a pattern or instructions sheet?)"],
  [[0x50, 0x4b, 0x03, 0x04], "a .zip folder"],
];
export function notEmbroidery(bytes, name) {
  const b = bytes, at = (sig, i = 0) => sig.every((v, k) => b[i + k] === v), text = (i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (!b.length) return { message: `${name} is empty (0 bytes): nothing was saved in it. Download it again from where it came from.` };
  let what = null, type = null;
  for (const [sig, w, t] of SNIFF) if (at(sig)) { what = w; type = t || null; }
  if (text(0, "RIFF") && text(8, "WEBP")) { what = "a picture (WebP)"; type = "image/webp"; }
  if (text(4, "ftyp") && /^(heic|heix|mif1|avif)$/.test(String.fromCharCode(...b.subarray(8, 12)))) what = "a photo (HEIC or AVIF)";
  if (/^\s*(<\?xml[^]*)?<svg/i.test(String.fromCharCode(...b.subarray(0, 300)))) what = "a drawing (SVG)";
  // (a design saved from Design your own: its pieces, not stitches)
  const saved = /^\s*\{\s*"needleworks"\s*:/.test(String.fromCharCode(...b.subarray(0, 40)));
  if (saved) return { message: `${name} is a design saved from Design your own, not stitches: open it there with Open saved.`, saved: true };
  if (!what) return null;
  const how = what === "a .zip folder" ? " Open it (double-click it) and pick the .pes file inside."
    : type ? " Picture to stitches can turn it into stitches." : /^a (photo|drawing)/.test(what) ? " Save it as a JPG or PNG, then Picture to stitches can turn it into stitches." : " Look for the .pes file that came with it.";
  return { message: `${name} is ${what}, not an embroidery design.${how}`, picture: type };
}
// A .dst whose records aren't DST records: every one has its third byte's two low bits set (the format's own marker),
// so random bytes fail three in four. Random bytes behind a DST header opened as a 212-stitch design with 7 thread
// changes, "ends early". (A few changed bytes in a real file don't come near: it opens, damaged or cut short.) Read
// past an end code (random bytes hold one every 16 records) but not padding (zeros, spaces, 0x1A).
function notDST(bytes, name) {
  if (!/\.dst$/i.test(name) || /^#PE[SC]/.test(String.fromCharCode(...bytes.subarray(0, 4)))) return false;
  const pad = (v) => v === 0 || v === 0x1a || v === 0x20;
  let n = 0, bad = 0;
  for (let i = 512; i + 3 <= bytes.length && n < 4000; i += 3) {
    const [a, b, c] = bytes.subarray(i, i + 3);
    if ((c & 0xf3) === 0xf3 || (pad(a) && pad(b) && pad(c))) continue;
    n++; if ((c & 3) !== 3) bad++;
  }
  return n >= 8 && bad > n * 0.1;
}
export function openedFile(bytes, name) {
  // (a picture, a PDF, a zip or an empty file, said as what it is)
  const not = notEmbroidery(bytes, name);
  if (not) throw Object.assign(new Error(not.message), { plain: true, picture: not.picture, saved: not.saved });
  const plain = (message) => Object.assign(new Error(message), { plain: true });
  if (notDST(bytes, name)) throw plain(`${name} doesn't read as a DST design: what follows its header isn't stitches. It may be damaged, or another kind of file renamed .dst: try downloading it again.`);
  // (a file cut short still decodes, as the part that's there: peace.pes cut in half opened as 2,658 stitches, "Fits")
  const short = endsEarly(bytes, name);
  // (cut short before its stitches, a PES cut in half before its PEC block: said as cut short, not "not an embroidery file")
  const cut = `${name} was cut short before its stitches: only the start of the file is there. Download it again from where it came from.`;
  // (jumps landed on their first stitch: a DST converted here, or a fixed copy, would gain a hole where each ended)
  let d;
  try { d = centred(firstMove(landJumps(readEmbroidery(bytes, name)))); } catch (err) { if (short) throw plain(cut); throw err; }
  // (a needle move: a stitch that goes somewhere. A file cut down to one stitch on the origin opened, then Download
  // refused it as having no stitches)
  if (!d.stitches.some((s, i) => s[2] === STITCH && i && (s[0] !== d.stitches[i - 1][0] || s[1] !== d.stitches[i - 1][1]))) throw plain(short ? cut : `${name} has no stitches in it. It may be damaged or not an embroidery file: try downloading it again.`);
  // A PES whose design block (what PE-DESIGN opens) isn't what its PEC block (what the machine sews) holds: its
  // threads are the PEC block's too (the header said "Red" for a block the machine sews green), and it's saved
  // again as what the machine sews, so both agree. (A file cut short disagrees too: it says so already.)
  const disagree = d.format === "pes" && !short && designBlockAgrees(bytes) === false;
  if (disagree) d.threads = d.pec.map((i) => { const t = pecThread(i); return { color: t.hex, name: t.name, brand: "Brother" }; });
  // a file with no thread colours (DST): each block gets its own, to tell them apart and to change
  const blocks = d.stitches.filter((s) => s[2] === COLOR_CHANGE).length + 1, colourless = d.threads.length < blocks;
  if (colourless) d.threads = Array.from({ length: blocks }, (_, i) => d.threads[i] || brother(DST_COLOURS[i % DST_COLOURS.length]));
  d = blockThreads(d);
  // A PES that breaks a rule the machine itself needs (a thread list that isn't one per colour, appliqué codes for
  // threads, too many thread changes) is never saved as it came: it's written again, or not saved at all. It was
  // "Save a copy", byte for byte, then "It opens on a Brother PE900" (pec_count_ff.pes, colours_121.pes).
  const hard = d.format === "pes" && !short ? verdictOf(bytes).filter((q) => HARD.has(q.key)) : [];
  const misplaced = d.format === "pes" && !!d.misplaced;
  // Two designs that don't agree, and the machine's own one broken as well (its design box, its thread list): a damaged
  // file, said so, not "two different designs" (flipped.pes, 99 bytes changed in a download: 489 mm of scribble was
  // called a second design, with three fixes said beside it)
  const damaged = disagree && (misplaced || hard.some((q) => q.key === "colours" || q.key === "applique"));
  const repair = misplaced || (d.format === "pes" && (short || disagree || hard.length > 0));
  const isPes = d.format === "pes" && !repair;
  // More colour blocks than the machine steps through (99; the PES writer refuses over 127: colors150.pes has 150,
  // and was called damaged): each thread's parts sewn together if that brings it under (`fewer`), else it's shown
  // but not saved (`stuck`; a PES too, since round 8: colours_121.pes was saved as it came).
  // (its stops as the facts beside the preview count them: thread changes, and pauses in the same thread)
  const same = Math.min(blocks - 1, pauses(d)), stops = stopWords(blocks - 1 - same, same);
  const tooMany = blocks > MAX_BLOCKS, fewer = tooMany ? fewerBlocks(d) : null, stuck = tooMany && !fewer && !isPes;
  let merged = null;
  if (tooMany && fewer && !isPes) { merged = [blocks - 1, fewer.threads.length - 1]; d = { ...fewer, format: d.format, version: d.version }; }
  const out = isPes ? bytes : stuck ? null : writePES(d);
  // (the checkup reads the file as it will be saved: the original bytes, or the copy written here)
  const check = checkup(out ? readEmbroidery(out, "x.pes") : d);
  // What it fails is ticked, so the copy saved here is fixed. dense_k.pes was saved as "_fixed" with only its box
  // mended, still 40 hits/mm²; and a PES the machine takes as it is was too ("Save a copy" of peace.pes, 25 hits/mm²
  // and 15.7 mm stitches, nothing ticked, gnome.pes's 12.7 mm stitch the same): saving it as it came means unticking.
  const noFix = stuck || (tooMany && !fewer), need = new Set(noFix ? [] : check.verdict.map((q) => q.key));
  return { d, out, check, need, isPes, repair, hard, misplaced, short, disagree, damaged, colourless, tooMany, blocks, stops, merged, stuck,
    noFix, fixBase: isPes && fewer ? fewer : null };
}
