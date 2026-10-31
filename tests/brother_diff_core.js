// Our PEC encoder against Brother's own (shared by tests/brother_diff.mjs in Node and tests/vm/brother_diff.html in
// the VM). A Brother-made PES carries Brother's encoding of its stitches in the PEC block, which is what the machine
// sews. We read those stitches, write them again with our writePES, and compare our PEC block with Brother's:
// palette, the stitch block's fixed fields, design box and size, the stitch stream byte for byte, and where bytes
// differ, whether the machine would still put the needle in the same holes with the same jumps, trims and colour
// changes. PE-DESIGN's trial can't save, so its 380 Brother-made sample designs are how we test against Brother's
// encoder. Plain script, no imports: the VM page bundles it with formats.js (see tests/vm/make.mjs).

const u16 = (b, i) => b[i] | b[i + 1] << 8, u32 = (b, i) => (b[i] | b[i + 1] << 8 | b[i + 2] << 16) + b[i + 3] * 2 ** 24;
const s12 = (v) => (v & 0x800 ? (v & 0xfff) - 0x1000 : v & 0xfff);
const hex = (a) => [...a].map((v) => v.toString(16).padStart(2, "0")).join(" ");

// The PEC block as a machine reads it, walked by hand (nothing shared with formats.js's reader).
function pecBlock(b) {
  const sig = String.fromCharCode(...b.subarray(0, 8)), p = sig === "#PEC0001" ? 8 : u32(b, 8);
  const ncol = b[p + 48] + 1, blk = p + 512, len = b[blk + 2] | b[blk + 3] << 8 | b[blk + 4] << 16;
  const cmds = []; let i = blk + 20, x = 0, y = 0;
  const val = () => {
    const v = b[i];
    if (v & 0x80) { const n = s12((v & 0x0f) << 8 | b[i + 1]); i += 2; return [n, v & 0x70]; }
    i++; return [v > 0x3f ? v - 0x80 : v, 0];
  };
  while (i < blk + len) {
    if (b[i] === 0xff) { cmds.push(["END", x, y]); i++; break; }
    if (b[i] === 0xfe && b[i + 1] === 0xb0) { cmds.push(["COLOR", x, y]); i += 3; continue; }
    const [dx, fx] = val(), [dy, fy] = val();
    x += dx; y += dy;
    cmds.push([(fx | fy) & 0x20 ? "TRIM" : (fx | fy) & 0x10 ? "JUMP" : "STITCH", x, y]);
  }
  return {
    palette: [...b.subarray(p + 49, p + 49 + ncol)],
    // stitch block bytes 0-1 and 5-7 (bytes 2-4 are its length), the two fields Brother writes before the box
    fixed: [b[blk], b[blk + 1], b[blk + 5], b[blk + 6], b[blk + 7], u16(b, blk + 12), u16(b, blk + 14)],
    wh: [u16(b, blk + 8), u16(b, blk + 10)],
    box: [-s12(b[blk + 16] << 8 | b[blk + 17]), -s12(b[blk + 18] << 8 | b[blk + 19])],
    boxFlags: [b[blk + 16] >> 4, b[blk + 18] >> 4],
    stream: b.subarray(blk + 20, i), cmds,
  };
}

// The needle's holes in order, with the jumps, trims and colour changes between them: what the machine does.
// Zero-length stitches (PEC's anchors after a jump) and the middle of a run of moves don't change any of that.
function sewn(cmds) {
  // a run of moves is one move to its last point, a trim if any of it trims; the needle starts at the origin
  const out = []; let last = [0, 0];
  for (const [k, x, y] of cmds) {
    const prev = out[out.length - 1];
    if (k === "STITCH") { if (!last || last[0] !== x || last[1] !== y) out.push({ k: "S", x, y }); last = [x, y]; }
    else if (k === "JUMP" || k === "TRIM") {
      if (prev && "JT".includes(prev.k)) Object.assign(prev, { k: prev.k === "T" || k === "TRIM" ? "T" : "J", x, y });
      else out.push({ k: k[0], x, y });
      last = [x, y];
    } else out.push({ k });
  }
  return out;
}

// Brother's holes and ours side by side. Our writer splits stitches over 7 mm (and jumps over 121 mm) that Brother
// keeps whole: an extra hole of ours on the straight line to Brother's next one is a split, not a change.
function align(A, O) {
  let i = 0, j = 0, splits = 0, longest = 0, px = 0, py = 0, cuts = 0;
  const same = (a, o) => a.k === o.k && a.x === o.x && a.y === o.y;
  while (i < A.length && j < O.length) {
    const a = A[i], o = O[j];
    if (same(a, o)) { if (a.x !== undefined) { px = a.x; py = a.y; } i++; j++; continue; }
    // Brother's jump without a cut (flag 0x10) that our writer marks as a trim (0x20): it has no uncut jump
    if (a.k === "J" && o.k === "T" && a.x === o.x && a.y === o.y) { cuts++; px = a.x; py = a.y; i++; j++; continue; }
    if (o.k === a.k && a.x !== undefined) {
      const L = Math.hypot(a.x - px, a.y - py), t = ((o.x - px) * (a.x - px) + (o.y - py) * (a.y - py)) / (L * L || 1);
      const off = Math.abs((o.x - px) * (a.y - py) - (o.y - py) * (a.x - px)) / (L || 1);
      if (L > 70 && t > 0 && t < 1 && off <= 1) { splits++; longest = Math.max(longest, L); j++; continue; }
    }
    return { splits, longest, cuts, at: { i, brother: A.slice(i, i + 3), ours: O.slice(j, j + 3) } };
  }
  const done = i === A.length && j === O.length;
  return { splits, longest, cuts, at: done ? null : { i, brother: A.slice(i, i + 3), ours: O.slice(j, j + 3) } };
}
const show = (cs) => cs.map((c) => (c.x === undefined ? c.k : `${c.k}${c.x},${c.y}`)).join(" ") || "(end)";

// One file -> { name, status: "skip" | "same" | "sews-same" | "fail", text, notes }. Only files whose design box sits
// exactly at the stitch minimum are compared (every Brother-made file does; pyembroidery's and old tools' don't)
// unless opts.all. The palette (thread names on the machine's screen) is reported but isn't a sewing difference.
function brotherDiff(b, name, { readEmbroidery, writePES }, opts = {}) {
  const r = (status, text, notes = []) => ({ name, status, text, notes });
  let brother, d;
  try { brother = pecBlock(b); d = readEmbroidery(b, name); } catch (e) { return r("skip", `unreadable (${e.message})`); }
  let minX = Infinity, minY = Infinity;
  for (const [k, x, y] of brother.cmds) if (k === "STITCH") { minX = Math.min(minX, x); minY = Math.min(minY, y); }
  if (!(brother.box[0] === minX && brother.box[1] === minY) && !opts.all) return r("skip", `box ${brother.box} isn't the stitch minimum ${minX},${minY}: not Brother-made`);
  let ours;
  try { ours = pecBlock(writePES({ stitches: d.stitches, threads: d.threads })); } catch (e) { return r("fail", `our writer refused it: ${e.message}`); }
  const diffs = [], notes = [];
  for (const k of ["fixed", "box", "boxFlags"]) if (ours[k].join() !== brother[k].join()) diffs.push(`${k} ${brother[k]} -> ${ours[k]}`);
  // Brother's size is sometimes its page (lace and tutorial samples: 120 x 170 mm) or some width for a straight line;
  // ours is always the stitches' own extent, which is fine. A size that isn't our stitches' extent is a real fault.
  if (ours.wh.join() !== brother.wh.join()) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [k, x, y] of ours.cmds) if (k === "STITCH" || k === "JUMP" || k === "TRIM") { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    (ours.wh.join() === [x1 - x0, y1 - y0].join() ? notes : diffs).push(`size ${brother.wh} -> ${ours.wh}`);
  }
  const al = align(sewn(brother.cmds), sewn(ours.cmds));
  if (al.at) diffs.push(`sews differently from move ${al.at.i}: Brother ${show(al.at.brother)} | ours ${show(al.at.ours)}`);
  if (hex(ours.palette) !== hex(brother.palette)) notes.push(`palette ${hex(brother.palette)} -> ${hex(ours.palette)}`);
  if (al.cuts) notes.push(`${al.cuts} jumps Brother leaves uncut written as trims`);
  if (al.splits) notes.push(`${al.splits} long stitches split (longest ${(al.longest / 10).toFixed(1)} mm)`);
  if (diffs.length) return r("fail", diffs.join("; "), notes);
  if (al.cuts) return r("cuts", "same holes, but trims where Brother only jumps", notes);
  const bytes = hex(ours.stream) === hex(brother.stream);
  return r(bytes ? "same" : "sews-same", bytes ? "same bytes" : al.splits ? "same apart from our long-stitch splits" : "same holes and commands, different bytes", notes);
}

function brotherSummary(results) {
  const n = (s) => results.filter((x) => x.status === s).length;
  const compared = results.length - n("skip"), pal = results.filter((x) => x.notes.some((t) => t.startsWith("palette"))).length;
  const splits = results.filter((x) => x.notes.some((t) => t.includes("split"))).length;
  return `brother diff: ${compared} compared: ${n("same")} byte-identical, ${n("sews-same")} sew the same (${splits} with our long-stitch splits), ` +
    `${n("cuts")} trim where Brother only jumps, ${n("fail")} DIFFER; palette differs in ${pal}; ${n("skip")} skipped`;
}

if (typeof module === "object") module.exports = { brotherDiff, brotherSummary };
