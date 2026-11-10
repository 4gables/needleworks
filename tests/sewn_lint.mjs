// Class guarded: asked vs sewn (rounds 9-11: a size fix the frame shrank back, the Height slider beside "Shrunk to
// 22 mm", the selection box, Make another's "what's on the fob", Fit to hoop on a quilt label, two hoopings'
// boxes, cut file names, the chip vs the note). A piece's asked size (p.size, pieceBounds(p) as typed) isn't what's
// sewn: a frame shrinks the lettering in it (`fittedSizes`). Whatever decides or says something about where a piece
// shows measures it as sewn: `sewn(p, pieces)` / `sewnBox` / `sewnBoxes` / `layoutSize` (pieces.js).
// This test fails on (1) a call measuring a piece (pieceBounds, touching, touchingAll, inFrame) whose piece isn't
// passed through sewn()/sewnAt(), and (2) a read of a piece's .size, in the UI code, outside the functions listed
// below with the reason each may use the asked size. A new one is either measured as sewn or listed here, on purpose.
// Stale entries fail too. Run: node tests/sewn_lint.mjs (< 1 s, CI).
import { readFileSync } from "fs";

const FILES = ["js/studio/ui.js", "js/app.js", "js/sheet.js", "js/words.js", "js/gate.js", "js/studio/pieces.js"];
// (pieces.js: its measuring calls only; its builders stitch the size they're handed)
const SIZES_IN = (f) => f !== "js/studio/pieces.js";
const MEASURE = /\b(pieceBounds|touchingAll|touching|inFrame)\(/g;
// a piece's size read: <name>.size, except Maps/Sets and the like
const SIZE = /\b([a-zA-Z_]\w*)(?:\[[^\]]*\])?\.size\b/g;
const NOT_PIECES = new Set(["advice", "pointers", "opened", "mine", "dataset", "pic", "seen", "fit", "picFits", "cache", "need", "fact", "chips"]);

// [file, function, reason]: functions (or a function they're in) that may measure a piece not passed through sewn():
// each because what it measures is already the sewn piece, or a candidate size it fits before using, or a piece no
// frame fits
const RAW_MEASURE = process.env.EMPTY ? [] : [
  ["js/studio/ui.js", "pieceProblems", "q is the piece at its fitted size (fit.get), made at the top"],
  ["js/studio/ui.js", "warnNow", "candidate sizes fitted with fittedSizes on the same line (two lines, the size fix)"],
  ["js/studio/ui.js", "roundAll", "a first frame drawn round the pieces as asked, so it shrinks none of them"],
  ["js/studio/ui.js", "landing", "frames (never fitted) and the piece at fit / f0, its fitted sizes"],
  ["js/studio/ui.js", "twoHoopings", "lettering no frame fits (filtered by !fit.has), split at a word gap"],
  ["js/studio/ui.js", "reArch", "arched lettering: never frame-fitted"],
  ["js/studio/ui.js", "pickStarter", "q at its fitted size, made on the line before"],
  ["js/studio/ui.js", "roughly", "a quick bound at the asked size, scaled to each candidate size"],
  ["js/studio/ui.js", "middleOf", "a candidate size's box, fitted (sewnAt) before the spot is taken"],
  ["js/studio/ui.js", "spotInOf", "candidate sizes, fitted (sewnAt) before a spot is taken"],
  ["js/studio/ui.js", "freeRoom", "free space outside frames (nothing fitted there), q at fs, the in-the-hoop frame"],
  ["js/studio/ui.js", "freeSpot", "a piece put in free space above or below: no frame fits it there"],
  ["js/studio/ui.js", "once", "names batch: q at `now`, its fitted size"],
  ["js/studio/pieces.js", "touching", "p as handed: its callers pass it sewn (checked here)"],
  ["js/studio/pieces.js", "fittedSizes", "works the fit out from the size asked"],
  ["js/studio/pieces.js", "monoSize", "candidate sizes, each fitted with fittedSizes"],
];
// [file, function, reason]: functions that may read a piece's asked size
const RAW_SIZE = process.env.EMPTY ? [] : [
  ["js/studio/ui.js", "snug", "pieces no frame fits (fit.has excluded): asked = sewn; each size checked by landing()"],
  ["js/studio/ui.js", "snugWay", "sets the asked size snug() found (unfitted piece)"],
  ["js/studio/ui.js", "lineRest", "the line pitch from the size the lines were sewn at (set from sewn() just before)"],
  ["js/studio/ui.js", "placeRest", "a new straight piece no frame fits yet: asked = sewn; spotIn/freeRoom measure it sewn"],
  ["js/studio/ui.js", "followed", "an arched word (never frame-fitted): asked = sewn"],
  ["js/studio/ui.js", "drawEditor", "the controls show the size asked; warn() says the sewn one beside it (\"N mm sewn\")"],
  ["js/studio/ui.js", "pieceProblems", "q.size is the fitted size; motifs are never fitted"],
  ["js/studio/ui.js", "warnNow", "fixes and notes compare the asked size with d.fs, the sewn one; each fix is checked by landing()"],
  ["js/studio/ui.js", "runUp", "the most to try; each size measured sewn"],
  ["js/studio/ui.js", "frameFor", "the asked size kept as the frame grows; fitted after"],
  ["js/studio/ui.js", "moveAway", "freeRoom's answer at the same size (sameSize), for an unfitted piece"],
  ["js/studio/ui.js", "landing", "the capped test itself: change.size asked vs the size it's sewn"],
  ["js/studio/ui.js", "asLettering", "a monogram turned to lettering keeps the size asked, then fitted where it is"],
  ["js/studio/ui.js", "lineChoice", "offered only when no frame fits it (!d.fs): asked = sewn"],
  ["js/studio/ui.js", "twoHoopings", "lettering no frame fits: asked = sewn"],
  ["js/studio/ui.js", "autoWords", "the words made biggest name the file: what was asked (intent), not what a frame left"],
  ["js/studio/ui.js", "main", "the words made biggest are the name the names batch swaps (intent)"],
  ["js/studio/ui.js", "pickStarter", "a starter's own sizes, fitted (fitHoop, fittedSizes) before it's shown"],
  ["js/studio/ui.js", "place", "at.size from spotIn: already the size it's sewn"],
  ["js/studio/ui.js", "on:input", "a slider's value is the size asked; the sewn one is said beside it"],
  ["js/studio/ui.js", "on:click", "one-tap fixes set the asked size they were checked at (landing); change() keeps the sewn size when a fit ends"],
  ["js/studio/ui.js", "change", "keeps the sewn size when a change ends the frame's fit"],
  ["js/studio/ui.js", "least", "the smallest asked size placing may try"],
  ["js/studio/ui.js", "roughly", "scales the asked box to a candidate size"],
  ["js/studio/ui.js", "readable", "q at a candidate size"],
  ["js/studio/ui.js", "spotIn", "a copy keeps its original's asked size"],
  ["js/studio/ui.js", "spotInOf", "candidate sizes from the asked one; s.size is the sewn one"],
  ["js/studio/ui.js", "freeRoom", "candidate sizes from the asked one, fitted before one is taken"],
  ["js/studio/ui.js", "once", "names batch: q at a candidate size, `now` its fitted size"],
  ["js/app.js", "names-make.onclick", "m.size is a made name's sewn size (its file's)"],
  ["js/app.js", "picSettings", "the picture's Size control (sewSized makes the sewn design that size)"],
  ["js/app.js", "sewPicture", "the picture's Size, handed to sewSized"],
  ["js/app.js", "pictureError", "the picture's Size vs the most the hoop takes"],
  ["js/app.js", "fineUI", "the picture's Size (sewSized: the sewn design's longer side)"],
  ["js/app.js", "pic-fine.onclick", "the picture's Size, for a one-tap fix"],
  ["js/app.js", "checkLost", "the picture's Size, for a one-tap fix"],
  ["js/app.js", "sizeRange", "the picture's Size control vs the most"],
];

const indent = (l) => l.match(/^\s*/)[0].length;
const DEF = [
  /(?:^|[^.\w])function\s+(\w+)\s*\(/g,
  /\b(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^()]*\)|\w+)\s*=>/g,
  /\$\("([\w-]+)"\)\.(on\w+)\s*=/g,
  /\baddEventListener\("(\w+)"/g,
  /\[data-([\w-]+)\]/g,
];
const defName = (m, re) => (re === DEF[2] ? `${m[1]}.${m[2]}` : re === DEF[3] ? `on:${m[1]}` : re === DEF[4] ? `data-${m[1]}` : m[1]);
// the function a position is in: a definition earlier on the same line, else the nearest line above indented less
// than everything between (a scope by indentation)
function defsOn(line, upto = Infinity) {
  const out = [];
  for (const re of DEF.slice(0, 4)) for (const m of line.matchAll(re)) if (m.index < upto) out.push([m.index, defName(m, re)]);
  return out.sort((a, b) => a[0] - b[0]);
}
function enclosing(lines, i, col) {
  const chain = defsOn(lines[i], col).map(([, n]) => n).reverse();
  let min = indent(lines[i]);
  for (let j = i - 1; j >= 0 && min > 0; j--) {
    if (!lines[j].trim() || /^\s*\/\//.test(lines[j])) continue;
    const ind = indent(lines[j]);
    if (ind >= min) continue;
    min = ind;
    chain.push(...defsOn(lines[j]).map(([, n]) => n).reverse());
  }
  return chain.length ? chain : ["(top)"];
}
// the first argument of the call whose "(" is at `at`
function firstArg(line, at) {
  let depth = 0, out = "";
  for (let k = at; k < line.length; k++) {
    const c = line[k];
    if ("([{".includes(c)) depth++;
    if (")]}".includes(c)) { depth--; if (depth === 0) break; }
    if (c === "," && depth === 1) break;
    if (k > at) out += c;
  }
  return out.trim();
}
const code = (line) => line.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/ .*$/, "");
const SEWN = /^(sewn|sewnAt)\(/;

let bad = 0, n = 0;
const fail = (m) => { bad++; console.error("FAIL " + m); };
const used = new Set();
const inventory = process.argv.includes("--list");
for (const f of FILES) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((raw, i) => {
    const line = code(raw);
    for (const m of line.matchAll(MEASURE)) {
      if (/function\s+$/.test(line.slice(0, m.index))) continue;
      const arg = firstArg(line, m.index + m[0].length - 1);
      n++;
      // (or a name just set from sewn(): `s = sewn(q, ps)` on this line or the few before)
      if (SEWN.test(arg) || (/^\w+$/.test(arg) && lines.slice(Math.max(0, i - 4), i + 1).some((l) => new RegExp(`\\b${arg}\\s*=\\s*(sewn|sewnAt)\\(`).test(l)))) continue;
      const chain = enclosing(lines, i, m.index), fn = chain[0], ok = chain.map((c) => RAW_MEASURE.find(([af, fnn]) => af === f && fnn === c)).find(Boolean);
      if (ok) { used.add("m:" + f + ok[1]); continue; }
      if (inventory) console.log(`measure ${f}:${i + 1} ${chain.join("<")}: ${m[1]}(${arg})`);
      else fail(`${f}:${i + 1} (${fn}) measures ${arg} as asked, not as sewn: pass it through sewn(p, pieces) / sewnBox, or list ${fn} in RAW_MEASURE with the reason`);
    }
    for (const m of SIZES_IN(f) ? line.matchAll(SIZE) : []) {
      if (NOT_PIECES.has(m[1]) || /^(hp|hoop|h|st|v|state|r\.plan|b|k)$/.test(m[1])) continue;
      n++;
      const chain = enclosing(lines, i, m.index), fn = chain[0], ok = chain.map((c) => RAW_SIZE.find(([af, fnn]) => af === f && fnn === c)).find(Boolean);
      if (ok) { used.add("s:" + f + ok[1]); continue; }
      if (inventory) console.log(`size ${f}:${i + 1} ${chain.join("<")}: ${m[0]}`);
      else fail(`${f}:${i + 1} (${fn}) reads ${m[0]}, the size asked: measure the piece as sewn (sewn(p, pieces).size), or list ${fn} in RAW_SIZE with the reason`);
    }
  });
}
for (const [f, fn] of RAW_MEASURE) if (!used.has("m:" + f + fn)) fail(`RAW_MEASURE entry ${f} ${fn} is stale (nothing there measures a piece as asked): remove it`);
for (const [f, fn] of RAW_SIZE) if (!used.has("s:" + f + fn)) fail(`RAW_SIZE entry ${f} ${fn} is stale (nothing there reads .size): remove it`);
console.log(`${bad ? "FAILED" : "ok"}: ${n} measures and size reads checked, ${bad} failing`);
process.exit(bad ? 1 : 0);
