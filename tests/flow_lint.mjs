// Stitch-flow lint: wasted motion inside one design (category audit class 8). Reports, doesn't fail.
// Each stage builder (frames, appliqué, quilting, lettering walk, bookmark) used to decide its own start and end, and
// nothing measured continuity: a satin frame's edge walk ended on the far side (trim + jump at 12 o'clock), square
// bold laps each started elsewhere (two 55-61 mm jumps), quilting sewed after the border (its trim ends on top),
// lettering satins began a column apart at junctions (11 trims on "Ashley"), tie-ins of 0 mm. This reads PES/DST files
// as written and counts, per colour block and per file:
//   trims     trims inside a colour block; short: jumps of 1-5 mm the PE900 leaves as loose thread (as pe900_check)
//   near      trims/jumps whose next run starts within 2 mm of where the last ended (it could have been a stitch)
//   hidden    trims whose straight way across (2-12 mm) lies under stitches sewn later (a travel run would be hidden)
//   loop      a closed loop left (or entered) far from where the next part starts (or the needle is) when one of its
//             own points is within 2 mm: it should be entered where the next part leaves
//   reverse   an open run started at its far end: its other end is within 2 mm of the needle
//   ends      thread ends (the cut before a trim, the start after it) that nothing sewn later covers (left on top)
//   lockOut   lock hits more than 0.5 mm from every stitch they could hide in
//   zeroTie   tie-ins that never leave the hole (0 mm), or hit one hole 3+ times
// "avoid" = near + hidden + loop + reverse (each trim counted once). Brother-made samples (tests/external/pes) are
// the reference for what professionals leave.
// Run: node tests/flow_lint.mjs [--blocks] [--json] FILES...   (a directory is read for its .pes/.dst files)
// e.g. node tests/flow_lint.mjs out/batch tests/external/pes    (~20 s for the 401-file batch)
import { readFileSync, readdirSync, statSync } from "fs";
import { COLOR_CHANGE, END, JUMP, STITCH, STOP, TRIM, readEmbroidery } from "../js/core/formats.js";

const NEAR = 20, HIDE_MAX = 120, SAVE = 10, R_COVER = 3, R_LOCK = 5, LOCK_ZONE = 10;   // 0.1 mm units

// stitch stream -> runs (stitched sequences between jumps/trims/colour changes), in 0.1 mm
export function flow(pattern) {
  const st = pattern.stitches.filter((s) => s[2] !== END);
  // runs: [{ block, trimBefore, jumpBefore, pts: [[x, y, index in st]] }] (a PEC jump's anchor stitch left out)
  const runs = [];
  let block = 0, cur = null, trimmed = false, jumped = false;
  for (let i = 0; i < st.length; i++) {
    const [x, y, c] = st[i];
    if (c === COLOR_CHANGE || c === STOP) { block++; cur = null; trimmed = false; jumped = false; continue; }
    if (c === TRIM) { trimmed = true; cur = null; continue; }
    if (c === JUMP) { jumped = true; cur = null; continue; }
    if (c !== STITCH) continue;
    if (!cur) { cur = { block, trimBefore: trimmed, jumpBefore: jumped, pts: [], anchor: jumped || trimmed }; runs.push(cur); trimmed = false; jumped = false; }
    const q = cur.pts[cur.pts.length - 1];
    if (q && q[0] === x && q[1] === y && cur.anchor) { cur.anchor = false; continue; }   // (the anchor stitch a PEC jump lands with)
    if (cur.pts.length) cur.anchor = false;
    cur.pts.push([x, y, i]);
  }
  // lock zones: from a run's start while within 1 mm of it (at most 6 points), and back from its end likewise
  for (const r of runs) {
    const p = r.pts, n = p.length, lock = new Uint8Array(n);
    let a = 0; while (a < Math.min(n, 6) && Math.hypot(p[a][0] - p[0][0], p[a][1] - p[0][1]) <= LOCK_ZONE) lock[a++] = 1;
    let b = n - 1; while (b >= Math.max(0, n - 5) && Math.hypot(p[b][0] - p[n - 1][0], p[b][1] - p[n - 1][1]) <= LOCK_ZONE) lock[b--] = 1;
    r.lock = lock; r.headLen = a;
    // the run without its locks (its shape)
    r.body = p.filter((_, k) => !lock[k]);
    if (!r.body.length) r.body = p;
  }

  // rasters at 0.1 mm over the design: latest stitch index covering each cell (R_COVER), and non-lock stitches (R_LOCK)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of runs) for (const [x, y] of r.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = 8, W = Math.ceil(x1 - x0) + 2 * pad + 1, H = Math.ceil(y1 - y0) + 2 * pad + 1;
  const last = new Int32Array(W * H).fill(-1), body = new Uint8Array(W * H);
  const disc = (R) => { const o = []; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R * R) o.push([dx, dy]); return o; };
  const dC = disc(R_COVER), dL = disc(R_LOCK);
  const stamp = (a, b, f) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L));
    for (let k = 0; k <= n; k++) f(Math.round(a[0] + ((b[0] - a[0]) * k) / n - x0 + pad), Math.round(a[1] + ((b[1] - a[1]) * k) / n - y0 + pad));
  };
  for (const r of runs) for (let k = 1; k < r.pts.length; k++) {
    const a = r.pts[k - 1], b = r.pts[k], t = b[2];
    stamp(a, b, (cx, cy) => { for (const [dx, dy] of dC) { const j = (cy + dy) * W + cx + dx; if (last[j] < t) last[j] = t; } });
    if (!(r.lock[k - 1] && r.lock[k])) stamp(a, b, (cx, cy) => { for (const [dx, dy] of dL) body[(cy + dy) * W + cx + dx] = 1; });
  }
  const cell = (p) => (Math.round(p[1] - y0 + pad)) * W + Math.round(p[0] - x0 + pad);
  const coveredAfter = (p, t) => last[cell(p)] > t;

  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const closed = (r) => r.body.length > 4 && d(r.pts[0], r.pts[r.pts.length - 1]) <= 10 && pathLen(r.body) >= 50;
  const blocks = [];
  const B = (k) => (blocks[k] ||= { trims: 0, jumps: 0, short: 0, near: 0, hidden: 0, loop: 0, reverse: 0, ends: 0, lockOut: 0, zeroTie: 0, travel: 0, stitches: 0, examples: [] });
  for (const r of runs) B(r.block).stitches += r.pts.length;
  for (let k = 1; k < runs.length; k++) {
    const r = runs[k - 1], s = runs[k];
    if (r.block !== s.block) continue;
    const blk = B(s.block), A = r.pts[r.pts.length - 1], Bp = s.pts[0], dist = d(A, Bp);
    blk.jumps++; blk.travel += dist;
    if (s.trimBefore) blk.trims++;
    if (dist > 10 && dist <= 50) blk.short++;
    let why = null;
    if (dist <= NEAR) why = "near";
    else if (dist <= HIDE_MAX) {
      const n = Math.ceil(dist / 2); let hid = 0;
      for (let q = 0; q <= n; q++) if (coveredAfter([A[0] + ((Bp[0] - A[0]) * q) / n, A[1] + ((Bp[1] - A[1]) * q) / n], Bp[2])) hid++;
      if (hid >= 0.95 * (n + 1)) why = "hidden";
    }
    // (only where the better point would make it a plain stitch: between separate pieces a trim is a trim whatever
    // its length)
    const better = (m) => m <= NEAR && dist - m >= SAVE;
    if (!why && closed(r) && better(Math.min(...r.body.map((p) => d(p, Bp))))) why = "loop";
    if (!why && closed(s) && better(Math.min(...s.body.map((p) => d(p, A))))) why = "loop";
    if (!why && !closed(s) && s.body.length > 1 && better(d(s.pts[s.pts.length - 1], A))) why = "reverse";
    if (why) { blk[why]++; if (blk.examples.length < 12) blk.examples.push(`${why} ${(dist / 10).toFixed(1)}mm @${(A[0] / 10).toFixed(1)},${(A[1] / 10).toFixed(1)}`); }
    // thread ends left on top: the cut end at A, the new start at B (past its own tie-in and first stitches)
    if (s.trimBefore) {
      if (!coveredAfter(A, A[2] + 1)) blk.ends++;
      const t = s.pts[Math.min(s.pts.length - 1, s.headLen + 2)][2];
      if (!coveredAfter(Bp, t)) blk.ends++;
    }
  }
  for (const r of runs) {
    const blk = B(r.block);
    for (let k = 0; k < r.pts.length; k++) if (r.lock[k] && !body[cell(r.pts[k])]) blk.lockOut++;
    // tie-in after a jump: never leaves the hole, or one hole three times
    if (r.jumpBefore || r.trimBefore) {
      const head = r.pts.slice(0, r.headLen);
      if (head.length >= 3) {
        const far = Math.max(...head.map((p) => d(p, head[0]))), hits = new Map();
        for (const p of head) { const key = `${Math.round(p[0])},${Math.round(p[1])}`; hits.set(key, (hits.get(key) || 0) + 1); }
        if (far < 2 || Math.max(...hits.values()) >= 3) blk.zeroTie++;
      }
    }
  }
  const sum = (key) => blocks.reduce((a, b) => a + (b ? b[key] : 0), 0);
  const total = Object.fromEntries(["stitches", "trims", "jumps", "short", "near", "hidden", "loop", "reverse", "ends", "lockOut", "zeroTie", "travel"].map((k) => [k, sum(k)]));
  total.avoid = total.near + total.hidden + total.loop + total.reverse;
  total.travel = Math.round(total.travel / 10);
  return { total, blocks: blocks.map((b) => b && { ...b, travel: Math.round(b.travel / 10) }) };
}

function pathLen(p) { let L = 0; for (let k = 1; k < p.length; k++) L += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); return L; }

// batch file name -> the builder it exercises (st_frame_square_bold -> st_frame_bold)
export function group(name) {
  const b = name.replace(/^.*\//, "").replace(/\.(pes|dst)$/i, "");
  let m;
  if ((m = b.match(/^st_frame_[a-z]+_(\w+)$/))) return `st_frame_${m[1]}`;
  if ((m = b.match(/^st_(q|quilt)_.*_(stipple|echo)/))) return `st_quilt_${m[2]}`;
  if ((m = b.match(/^st_([a-z]+)/))) return `st_${m[1]}`;
  if ((m = b.match(/^bm_.*_deco$/))) return "bm_deco";
  if ((m = b.match(/^bm_/))) return "bm";
  if ((m = b.match(/^pic_.*_(line|cross)_/))) return `pic_${m[1]}`;
  if ((m = b.match(/^pic_/))) return "pic_fill";
  return "other";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), opts = new Set(args.filter((a) => a.startsWith("--"))), files = [];
  for (const a of args.filter((x) => !x.startsWith("--"))) {
    if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.(pes|dst)$/i.test(f)) files.push(`${a}/${f}`); }
    else files.push(a);
  }
  const rows = [], groups = new Map();
  for (const f of files) {
    const res = flow(readEmbroidery(new Uint8Array(readFileSync(f)), f)), t = res.total, g = group(f);
    rows.push({ file: f, ...t, blocks: res.blocks });
    if (!groups.has(g)) groups.set(g, { files: 0 });
    const G = groups.get(g); G.files++;
    for (const [k, v] of Object.entries(t)) G[k] = (G[k] || 0) + v;
  }
  if (opts.has("--json")) console.log(JSON.stringify({ rows, groups: Object.fromEntries(groups) }));
  else report(rows, groups, opts);
}

function report(rows, groups, opts) {
  const cols = ["stitches", "trims", "short", "avoid", "near", "hidden", "loop", "reverse", "ends", "lockOut", "zeroTie", "travel"];
  const fmt = (name, o) => name.padEnd(46) + cols.map((k) => String(o[k] ?? "").padStart(k === "stitches" ? 8 : 7)).join("");
  console.log(fmt("file", Object.fromEntries(cols.map((k) => [k, k]))));
  for (const r of rows) {
    console.log(fmt(r.file.replace(/^.*\//, "").slice(0, 45), r));
    if (opts.has("--blocks")) r.blocks.forEach((b, i) => b && console.log(fmt(`  block ${i + 1}`, b) + "  " + b.examples.join("; ")));
  }
  console.log("\nby group (sums)");
  for (const [g, G] of [...groups].sort((a, b) => b[1].avoid - a[1].avoid)) console.log(fmt(`${g} (${G.files})`, G));
  const all = rows.reduce((a, r) => { for (const k of cols) a[k] = (a[k] || 0) + r[k]; return a; }, {});
  console.log(fmt(`TOTAL ${rows.length} files`, all));
}
