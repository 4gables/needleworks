/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Picture tab: the file is a function of the picture and its settings, never of what was sewn before (class: round 10,
// etsy_7 Filled 60 mm sewed 1578, 1576 or 1430 stitches by what had been tried before, because the size fit was
// carried from the last size and style), and what a picture leaves out is said with fixes that work (etsy_7's doodles
// at 60 mm left out while the dialog said "Checked").
// Through the page itself: a doodle sheet drawn here (a bold title and hairline doodles), sewn at settings A, then
// others, then A again, then A in a fresh page: the same bytes every time. At Filled 60 mm the lost note must show,
// and every one-tap fix it offers must keep most of what was left out once tapped.
// usage: node tests/picture_history.mjs CDP_PORT HTTP_PORT   (a server on HTTP_PORT, `node tests/cdp.mjs CDP_PORT start DIR`
// first). Also runs etsy_7 when tests/external/images has it. Exit 1 on any problem. ~2-4 min.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const [CDP, HP] = process.argv.slice(2);
const cdp = (...a) => execFileSync("node", [new URL("./cdp.mjs", import.meta.url).pathname, CDP, ...a], { encoding: "utf8" }).trim();
const ev = (js) => { const r = cdp("eval", js); try { return JSON.parse(r); } catch { return r; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let problems = 0;
const fail = (s) => { problems++; console.log("  FAIL " + s); };

async function open() {
  for (let i = 0; i < 3; i++) {
    cdp("goto", `http://127.0.0.1:${HP}/?v=${Date.now()}#picture`);
    await sleep(1500);
    if (ev("document.body.dataset.mode") === "picture") return;
  }
}
// the doodle sheet, drawn in the page and chosen as the picture
const DRAW = `(async () => {
  const cv = document.createElement("canvas"); cv.width = 800; cv.height = 600; const g = cv.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, 800, 600);
  g.fillStyle = "#e0218a"; g.font = "bold 90px sans-serif"; g.textAlign = "center"; g.fillText("DOODLES", 400, 110);
  const cols = ["#d9609f", "#5f9fd6", "#8f7bc8", "#5fae5f"]; g.lineWidth = 1.6;
  for (let i = 0; i < 48; i++) {
    const x = 90 + (i % 8) * 88, y = 170 + Math.floor(i / 8) * 70; g.strokeStyle = cols[i % 4]; g.beginPath();
    if (i % 2) g.arc(x + 20, y + 20, 15, 0, 7); else { g.moveTo(x, y + 30); g.lineTo(x + 15, y + 5); g.lineTo(x + 30, y + 30); g.lineTo(x + 42, y + 8); }
    g.stroke();
  }
  const blob = await new Promise((r) => cv.toBlob(r, "image/png")), dt = new DataTransfer(); dt.items.add(new File([blob], "doodles.png", { type: "image/png" }));
  const inp = document.getElementById("pic-file"); inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true })); return 1; })()`;
const IDLE = "!!nwTest.view() && document.getElementById('busy').hidden && !nwTest.fine()?.checking";
async function idle() { for (let i = 0; i < 400; i++) { if (ev(IDLE) === true) return; await sleep(300); } fail("the picture never settled"); }
// set style and size as a user does (the style chip, then the slider) and wait for the file and its checks
async function sew([style, size]) {
  ev(`(()=>{const b=document.querySelector('#pic-style button[data-s=${style}]'); if(b.getAttribute('aria-pressed')!=='true') b.click();
    const s=document.getElementById('pic-size'); if(+s.value!==${size}){s.value=${size}; s.dispatchEvent(new Event('input',{bubbles:true}));} return 1})()`);
  await sleep(600); await idle();
  return ev(`(async()=>{const v=nwTest.view(), h=[...new Uint8Array(await crypto.subtle.digest('SHA-1', v.bytes))].slice(0,6).map(b=>b.toString(16).padStart(2,'0')).join('');
    return { hash: h, problems: nwTest.problems().map(p=>p.id), fixes: nwTest.fine()?.fixes || [], ids: nwTest.fine()?.kept?.ids || [] }})()`);
}

async function run(name, load) {
  console.log(name);
  await open(); await load(); await idle();
  const A = ["fill", 60], seq = [A, ["cross", 120], A, ["fill", 120], ["line", 60], A, ["cross", 60], ["fill", 100], A];
  const seen = [];
  for (const s of seq) { const r = await sew(s); console.log(`  ${s.join(" ")}: ${r.hash} ${r.problems.join(",") || "-"} ${r.fixes.join(" | ")}`); if (s === A) seen.push(r); }
  // (a fresh page: nothing tried before)
  await open(); await load(); await idle();
  const fresh = await sew(A); console.log(`  fresh ${A.join(" ")}: ${fresh.hash}`); seen.push(fresh);
  if (new Set(seen.map((r) => r.hash)).size > 1) fail(`${name}: ${A.join(" ")} sewed differently by history: ${seen.map((r) => r.hash).join(" ")}`);
  // the lost note at 60 mm, and each fix it offers lands without one
  if (!fresh.problems.includes("lost")) fail(`${name}: no lost note at ${A.join(" ")}`);
  if (!fresh.fixes.length) fail(`${name}: no fix offered for what's left out`);
  for (let k = 0; k < fresh.fixes.length; k++) {
    await sew(A);
    const label = ev(`(()=>{const b=document.querySelectorAll('#pic-fine [data-fix]')[${k}]; b.click(); return b.textContent})()`);
    await sleep(600); await idle();
    const after = ev("nwTest.problems().map(p=>p.id)"), still = ev(`nwTest.fine().kept.ids.filter((i) => ${JSON.stringify(fresh.ids)}.includes(i)).length`);
    console.log(`  fix "${label}": ${after.join(",") || "-"}, ${still} of ${fresh.ids.length} still left out`);
    if (still > 0.25 * fresh.ids.length) fail(`${name}: the fix "${label}" still leaves out ${still} of the ${fresh.ids.length} parts the note said`);
  }
}

await run("doodle sheet", async () => ev(DRAW));
const E7 = new URL("./external/images/etsy_7.jpg", import.meta.url).pathname;
if (fs.existsSync(E7)) await run("etsy_7", async () => cdp("upload", "#pic-file", E7));
console.log(problems ? `${problems} problems` : "ok");
process.exit(problems ? 1 : 0);
