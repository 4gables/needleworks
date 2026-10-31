// Builds the Brother diff page for the PESCHECK VM and the ISO it travels on. PE-DESIGN's trial can't save and the
// VM can't hand files back, so the comparison runs in the VM: Edge opens D:\diff\brother_diff.html (our writer and
// tests/brother_diff_core.js inlined as one classic script, since Edge won't load ES modules from a CD), you pick
// Brother's sample folder and it shows the verdict. Extra PES files (e.g. a batch to box-check) go in D:\pes.
//
// usage: node tests/vm/make.mjs [pes files to add under pes/ ...]
//   -> out/vm/iso/ and out/vm/files.iso; then `cat out/vm/files.iso > /Volumes/4TB_SSD/vm-pescheck/files.iso`
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../.."), out = path.join(root, "out/vm");
// ES module -> a function returning its exports; imports become lookups of modules already defined
function wrap(file) {
  let src = fs.readFileSync(path.join(root, file), "utf8"); const names = [];
  src = src.replace(/^import \{([^}]*)\} from "\.\/([\w.]+)\.js";$/gm, (_, list, mod) => `const {${list}} = M[${JSON.stringify(mod)}];`);
  src = src.replace(/^export (const|let|function) (\w+)/gm, (_, kw, name) => { names.push(name); return `${kw} ${name}`; });
  // `export const A = 0, B = 1` declares more than one name
  for (const m of src.matchAll(/^const (\w+) = [^;\n]*?, (\w+ = .*)$/gm)) if (names.includes(m[1])) for (const n of m[2].matchAll(/(?:^|, )(\w+) = /g)) names.push(n[1]);
  if (/^\s*(import|export) /m.test(src)) throw new Error(`${file}: an import/export the bundler doesn't handle`);
  return `M[${JSON.stringify(path.basename(file, ".js"))}] = (() => {\n${src}\nreturn { ${[...new Set(names)].join(", ")} };\n})();\n`;
}
const core = fs.readFileSync(path.join(root, "tests/brother_diff_core.js"), "utf8");
const bundle = "const M = {};\n" + ["js/core/machines.js", "js/core/threads.js", "js/core/formats.js"].map(wrap).join("") +
  `M.core = (() => {\n${core}\nreturn { brotherDiff, brotherSummary };\n})();\n`;

const page = `<!doctype html>
<meta charset="utf-8"><title>Brother diff</title>
<style>body{font:15px/1.4 system-ui;margin:16px} #sum{font-size:22px;font-weight:700;margin:10px 0} .fail{color:#b00020}
pre{font:12px/1.35 Consolas,monospace;white-space:pre-wrap}</style>
<p>Pick the folder of Brother-made PES files (PE-DESIGN's samples). Each design's stitches are written again by our
writer and our PEC block is compared with Brother's.</p>
<input type="file" id="dir" webkitdirectory multiple>
<div id="sum">waiting for a folder</div><pre id="fails" class="fail"></pre><pre id="all"></pre>
<script>
${bundle}
// ?dir=C:/bro reads the folder's index.txt (one name per line) itself: Edge started with --allow-file-access-from-files
// lets a file:// page read other local files, so no dialog has to be driven over VNC
const read = (url) => new Promise((ok, no) => { const x = new XMLHttpRequest(); x.open("GET", url); x.responseType = "arraybuffer";
  x.onload = () => ok(new Uint8Array(x.response)); x.onerror = () => no(new Error("can't read " + url)); x.send(); });
const dir = new URLSearchParams(location.search).get("dir");
if (dir) (async () => {
  const names = new TextDecoder().decode(await read("file:///" + dir + "/index.txt")).split(/\\r?\\n/).filter((n) => /\\.pes$/i.test(n));
  show(await Promise.all(names.map(async (n) => M.core.brotherDiff(await read("file:///" + dir + "/" + n), n, M.formats))));
})().catch((e) => { document.getElementById("sum").textContent = "ERROR " + e.message; document.title = "ERROR"; });
document.getElementById("dir").onchange = async (e) => {
  const files = [...e.target.files].filter((f) => /\\.pes$/i.test(f.name)), results = [];
  for (const f of files) results.push(M.core.brotherDiff(new Uint8Array(await f.arrayBuffer()), f.webkitRelativePath || f.name, M.formats));
  show(results);
};
function show(results) {
  const line = (x) => (x.status === "fail" ? "FAIL " : x.status === "skip" ? "skip " : "ok   ") + x.name + ": " + x.text + (x.notes.length ? " [" + x.notes.join("; ") + "]" : "");
  document.getElementById("sum").textContent = M.core.brotherSummary(results);
  document.getElementById("fails").textContent = results.filter((x) => x.status === "fail").map(line).join("\\n");
  document.getElementById("all").textContent = results.map(line).join("\\n");
  document.title = "DONE " + M.core.brotherSummary(results);
}
</script>
`;
fs.rmSync(path.join(out, "iso"), { recursive: true, force: true });
fs.mkdirSync(path.join(out, "iso/diff"), { recursive: true });
fs.mkdirSync(path.join(out, "iso/pes"), { recursive: true });
fs.writeFileSync(path.join(out, "iso/diff/brother_diff.html"), page);
for (const f of process.argv.slice(2)) fs.copyFileSync(f, path.join(out, "iso/pes", path.basename(f)));
fs.rmSync(path.join(out, "files.iso"), { force: true });
execFileSync("hdiutil", ["makehybrid", "-iso", "-joliet", "-default-volume-name", "PESFILES", "-o", path.join(out, "files.iso"), path.join(out, "iso")], { stdio: "ignore" });
console.log(`out/vm/files.iso: diff page + ${process.argv.length - 2} PES files`);
