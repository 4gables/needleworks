// Class guarded: a starter ("Start from" cards) that opens with something wrong (round 9: Appliqué, Name in a frame
// and Luggage tag opened saying "Ashley has small loops that fill in"; the Pet bandana with a 7-letter name was too big
// for the 5x7 until the hoop was turned). Every starter, on every hoop, opened through its card in the real page, must
// open with no problem above a tip (js/words.js levels: nothing `block` or `look`, no file verdict) and fit the hoop;
// and a starter made for a name must still fit the 5x7 with a 10-letter name typed over it. Cut files pass the gate
// and don't turn with the hoop.
// usage: node tests/cdp.mjs PORT start DIR; serve the site (tests/batch_server.py out/batch HTTP); then
//        node tests/starters.mjs PORT http://127.0.0.1:HTTP [starter-filter]
// ~3 minutes; one line per starter and hoop; "DONE <cases> <problems>"; exit code 1 when anything is wrong.
const [port, base, only] = process.argv.slice(2);
if (!port || !base) { console.log("usage: node tests/starters.mjs CDP_PORT BASE_URL [filter]"); process.exit(2); }
const ctl = `http://127.0.0.1:${+port + 100}/`;
const call = async (cmd, ...args) => (await (await fetch(ctl, { method: "POST", body: JSON.stringify({ cmd, args }) })).text()).trim();
const ev = async (js) => {
  const t = await call("eval", js);
  if (t.startsWith("ERROR")) throw new Error(t);
  return t === "undefined" || t === "" ? undefined : JSON.parse(t);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open() {
  for (let i = 0; i < 8; i++) {
    await call("goto", `${base}/manifest.webmanifest`);
    await ev(`(() => { localStorage.clear(); localStorage.setItem("nw:studio.guideSeen", "true"); localStorage.setItem("nw:studio.applSeen", "true"); return 1; })()`).catch(() => 0);
    await call("goto", `${base}/?v=st${Date.now()}#design`);
    for (let k = 0; k < 30; k++) { await sleep(300); if (await ev("document.body.dataset.mode === 'design' && typeof nwTest === 'object' ? 1 : 0").catch(() => 0)) return; }
  }
  throw new Error("the page didn't start");
}
// the design as it settles: problems above a tip (the file verdict included) and the Download button
const SETTLED = String.raw`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (s) => document.querySelector(s);
  await sleep(600);
  for (let i = 0; i < 100; i++) {
    const dl = $("#download").textContent;
    if (nwTest.view() && (!$("#busy") || $("#busy").hidden) && !/Quilting|Filling|Re-stitching/.test(dl)) break;
    await sleep(200);
  }
  await sleep(900);   // (the file check runs 250 ms after the view settles)
  return { dl: $("#download").textContent.trim(), off: $("#download").disabled,
    problems: nwTest.problems().filter((x) => x.level !== "tip").map((x) => x.text),
    blocks: nwTest.problems().filter((x) => x.level === "block" || x.file).map((x) => x.text) };
})()`;
const NAME = "Maximilian";   // (10 letters, wide ones)
const cards = async () => ev(`[...document.querySelectorAll("#st-cards [data-start]")].map((b) => b.dataset.start)`);
let n = 0, bad = 0;
// (the long name: it must fit and be sewable; what it then says about itself is the editor's to fix)
const say = (id, hoop, what, r, all = true) => {
  n++;
  const wrong = [...(all ? r.problems : r.blocks), ...(/^Too big|files/.test(r.dl) || r.off ? [`Download reads “${r.dl}”`] : [])];
  if (wrong.length) bad++;
  console.log(`${wrong.length ? "FAIL" : "ok  "} ${id} ${hoop}${what}${wrong.length ? ": " + wrong.join(" | ") : ""}`);
};
for (const hoop of ["5x7", "4x4"]) {
  await open();
  await ev(`(() => { const s = document.getElementById("hoop"); s.value = ${JSON.stringify(hoop)}; s.dispatchEvent(new Event("change", { bubbles: true })); return 1; })()`);
  await sleep(500);
  for (const id of await cards()) {
    if (only && !id.includes(only)) continue;
    await ev(`(() => { document.querySelector('#st-cards [data-start="${id}"]').click(); return 1; })()`);
    say(id, hoop, "", await ev(SETTLED));
    // its cut files (appliqué, in-the-hoop fronts) pass the gate and read as the design does whichever way the hoop is
    // turned (a turned MOM's cut file had its letters sideways, round 10)
    const cut = () => ev(String.raw`nwTest.cut("svg").concat(nwTest.cut("dxf")).map((f) => ({ name: f.name, ok: f.ok, error: f.error, size: (f.bytes.match(/width="([\d.]+)mm" height="([\d.]+)mm"/) || []).slice(1).join("x") }))`);
    const before = hoop === "5x7" && await cut();
    if (before?.length) {
      await ev(`(() => { document.getElementById("turn").click(); return 1; })()`);
      await ev(SETTLED);
      const after = await cut();
      await ev(`(() => { document.getElementById("turn").click(); return 1; })()`);
      await ev(SETTLED);
      n++;
      const wrong = [...before, ...after].filter((f) => !f.ok).map((f) => `${f.name}: ${f.error}`);
      // (none when the design doesn't fit the other way round: nothing to compare)
      if (after.length && (before[0].size !== after[0].size || before[1].name !== after[1].name)) wrong.push(`cut file ${before[0].size} mm, ${after[0].size} with the hoop turned`);
      if (wrong.length) bad++;
      console.log(`${wrong.length ? "FAIL" : "ok  "} ${id} ${hoop} cut files ${before.map((f) => f.name).join(", ")}${after.length ? "" : " (doesn't fit turned)"}${wrong.length ? ": " + wrong.join(" | ") : ""}`);
    }
    // the name it's made for (the biggest lettering, as One for each name picks it) swapped for a long one, keeping
    // its swashes and any lines after the first
    const named = hoop === "5x7" && await ev(String.raw`(() => {
      const s = JSON.parse(localStorage.getItem("nw:studio")), ts = s.pieces.filter((p) => p.kind === "text" && /^~?\p{L}+'?s?~?$/u.test(p.text.split("\n")[0]));
      const p = ts.reduce((a, q) => (!a || q.size > a.size ? q : a), null); if (!p) return null;
      const i = s.pieces.indexOf(p); document.querySelectorAll("#st-pieces .pick")[i].click();
      const el = document.querySelector("#st-edit textarea[data-k=text]"); if (!el) return null;
      const lines = el.value.split("\n"); lines[0] = lines[0].replace(/\p{L}+/u, ${JSON.stringify(NAME)}); el.value = lines.join("\n");
      el.dispatchEvent(new Event("input", { bubbles: true })); el.blur(); return el.value;
    })()`);
    if (named && hoop === "5x7") say(id, hoop, ` as “${named.replace(/\n/g, " / ")}”`, await ev(SETTLED), false);
  }
}
console.log(`DONE ${n} ${bad}`);
process.exit(bad ? 1 : 0);
