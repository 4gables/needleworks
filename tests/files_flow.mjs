// Class guarded: what a file is called, what's said about a file that isn't a design, and how a design gets from one
// tab to another (round 11): four coasters with different motifs all downloaded as Coaster.pes with no way to name
// them; a PNG renamed .pes said "has no stitches... may be damaged"; the download dialog said "each file you've saved
// is a design of its own" after one save, counting another tab's; a picture had no way into Design your own; a
// picture's colour could only be left out, not sewn in another thread; "Threads I own" had nothing for a Madeira spool.
// Checks, in the browser:
// - Open a design: a PNG, JPEG, zip, PDF or empty file named .pes says what it is; a picture offers "Turn it into
//   stitches", which opens it on the Picture tab. + Design file says the same.
// - The download dialog's "design of its own" line only after two different files saved on that tab.
// - Rename: the name asked for is on the Download button and every file the Design tab makes (PES, saved design,
//   cutter files, names ZIP), is kept with the saved design and back when it's opened; a starter clears it. A design
//   of motifs alone is named after its starter and motifs.
// - Picture -> Design your own: "start a new design with it" (the picture alone, a file piece) and "add it to my
//   design" (one piece more), both with the picture's threads.
// - A picture colour's chip swaps its thread: the file then carries the thread picked, and Back undoes it.
// - Threads I own: a search for an unlisted brand says it isn't listed; a colour picked shows the nearest spools.
// - (round 12) One for each name: a name saved under another file name (Zoë as Zoe.pes, a second Emma as Emma_2.pes)
//   says so under its thumbnail.
// usage: node tests/cdp.mjs PORT start DIR; serve the site (tests/batch_server.py out/batch HTTP); then
//        node tests/files_flow.mjs PORT http://127.0.0.1:HTTP      (~1 min; prints DONE <checks> <problems>)
const [port, base] = process.argv.slice(2);
if (!port || !base) { console.log("usage: node tests/files_flow.mjs CDP_PORT BASE_URL"); process.exit(2); }
const ctl = `http://127.0.0.1:${+port + 100}/`;
const call = async (cmd, ...args) => (await (await fetch(ctl, { method: "POST", body: JSON.stringify({ cmd, args }) })).text()).trim();
const ev = async (js) => { const t = await call("eval", js); if (t.startsWith("ERROR")) throw new Error(t); return t === "undefined" || t === "" ? undefined : JSON.parse(t); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0; const problems = [];
const check = (what, ok, detail = "") => { checks++; if (!ok) problems.push(`${what}${detail ? `: ${detail}` : ""}`); };
async function open(hash) {
  for (let i = 0; i < 8; i++) {
    await call("goto", `${base}/?v=f${Date.now()}${i}${hash}`);
    for (let k = 0; k < 30; k++) { await sleep(300); if (await ev("document.body.dataset.mode ? 1 : 0").catch(() => 0)) return; }
  }
  throw new Error("the page didn't start");
}
// in-page helpers: a file put on an <input type=file>, the names of files handed out (gate.js clicks an <a download>)
const H = `(() => { if (window.__ff) return; window.__ff = { got: [],
  put: (sel, bytes, name, type = "") => { const dt = new DataTransfer(); dt.items.add(new File([bytes], name, { type })); const i = document.querySelector(sel); i.files = dt.files; i.dispatchEvent(new Event("change", { bubbles: true })); },
  wait: async (ok, ms = 20000) => { for (let t = 0; t < ms && !ok(); t += 100) await new Promise((r) => setTimeout(r, 100)); return ok(); } };
  HTMLAnchorElement.prototype.click = function () { if (this.download) __ff.got.push(this.download); };
  const close = () => { for (const d of document.querySelectorAll("dialog[open]")) d.close(); }; __ff.close = close; })()`;
const run = async (js) => { await ev(H); return ev(`(async () => { ${js} })()`); };
const t0 = Date.now();

// ---- Open: files that aren't designs
// (as a new visitor: a profile another test left on the 4x4 hoop made ashley_v3.pes "Too big for this hoop", and one
// left with "Don't show this again" never opened the dialog, so the dialog checks below failed or passed for nothing)
await open("#open");
await ev(`localStorage.clear(), 1`); await open("#open");
const png = `new Uint8Array(await (await fetch("assets/sample-flower.png")).arrayBuffer())`;
for (const [bytes, says, pic] of [[png, /is a picture \(PNG\)/, true], ["new Uint8Array(0)", /empty \(0 bytes\)/], ["new Uint8Array([0x50, 0x4b, 3, 4, 20, 0])", /zip folder/],
  ["new TextEncoder().encode('%PDF-1.4')", /a PDF/], ["new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])", /picture \(JPEG\)/, true]]) {
  const r = await run(`const e0 = document.getElementById("error"); e0.textContent = ""; e0.hidden = true;
    __ff.put("#open-file", ${bytes}, "logo.pes"); await __ff.wait(() => !document.getElementById("error").hidden);
    const e = document.getElementById("error"); return { text: e.textContent, button: e.querySelector("button")?.textContent || "" };`);
  check(`Open says what a non-design is (${says.source})`, says.test(r.text), r.text);
  check(`Open offers Picture to stitches only for a picture (${says.source})`, /Turn it into stitches/.test(r.button) === !!pic, r.button);
}
{
  await run(`__ff.put("#open-file", ${png}, "logo.pes"); await __ff.wait(() => document.querySelector("#error button"));`);
  const r = await run(`document.querySelector("#error button").click(); await __ff.wait(() => document.body.dataset.mode === "picture" && document.getElementById("download").disabled === false, 40000);
    return [document.body.dataset.mode, document.getElementById("download").textContent];`);
  check("Turn it into stitches opens the picture on Picture to stitches", r[0] === "picture" && /logo/.test(r[1]), JSON.stringify(r));
}

{
  await open("#design");
  const t = await run(`__ff.put("#st-file", ${png}, "logo.pes"); await __ff.wait(() => /picture/.test(document.getElementById("st-toast").textContent), 5000); return document.getElementById("st-toast").textContent;`);
  check("+ Design file says a picture is a picture", /is a picture \(PNG\)/.test(t), t);
}

// ---- the dialog's "a design of its own": two different files saved on this tab
{
  await open("#open");
  const golden = (f) => `new Uint8Array(await (await fetch("tests/fixtures/golden/${f}")).arrayBuffer())`;
  // (opened, the file is the view's: an untouched one's button says "Save a copy", not its name. "not saved" when the
  // dialog never opened, so the checks can't pass on a file that wasn't saved)
  const save = async (f) => run(`__ff.close(); __ff.put("#open-file", ${golden(f)}, "${f}"); await __ff.wait(() => nwTest.view()?.filename === "${f}" && !document.getElementById("download").disabled);
    document.getElementById("download").click(); return await __ff.wait(() => document.getElementById("done").open, 5000) ? document.getElementById("done-own").hidden : "not saved";`);
  // (a save on the Design tab first: not this tab's)
  await run(`location.hash = "#design"; await __ff.wait(() => document.body.dataset.mode === "design" && !document.getElementById("download").disabled); document.getElementById("download").click(); await __ff.wait(() => document.getElementById("done").open, 5000); __ff.close(); location.hash = "#open"; await __ff.wait(() => document.body.dataset.mode === "open");`);
  check("one save on this tab: no \"design of its own\"", await save("multi.pes") === true);
  check("the same file again: still one design", await save("multi.pes") === true);
  check("a second file saved on this tab: said", await save("ashley_v3.pes") === false);
}

// ---- names: a motif design, Rename and every exit
{
  await open("#design");
  const r = await run(`document.querySelector("[data-start=coaster]").click(); await new Promise((r) => setTimeout(r, 1500));
    for (const b of document.querySelectorAll("#st-pieces [data-op=del]")) if (/Monogram/.test(b.getAttribute("aria-label"))) b.click();
    await new Promise((r) => setTimeout(r, 800)); [...document.querySelectorAll("#panel-design button")].find((b) => b.textContent.trim() === "+ Motif").click();
    await __ff.wait(() => /Coaster_/.test(document.getElementById("download").textContent)); return document.getElementById("download").textContent;`);
  check("a design of motifs alone is named after its starter and motifs", /Download Coaster_Heart\.pes/.test(r), r);
  const n = await run(`document.getElementById("rename-open").click(); const i = document.getElementById("rename-name"); i.value = "Mom’s coaster #2"; i.dispatchEvent(new Event("input"));
    document.getElementById("rename-save").click(); await __ff.wait(() => /Mom_s/.test(document.getElementById("download").textContent)); __ff.got.length = 0;
    document.getElementById("st-save").click(); document.getElementById("cut-file").click(); document.getElementById("cut-dxf").click(); document.getElementById("download").click();
    await __ff.wait(() => __ff.got.length >= 4, 5000); __ff.close();
    // (names need lettering to swap)
    [...document.querySelectorAll("#panel-design button")].find((b) => b.textContent.trim() === "+ Lettering").click();
    await __ff.wait(() => !document.getElementById("names-open").hidden && !document.getElementById("download").disabled); await new Promise((r) => setTimeout(r, 1000));
    document.getElementById("names-open").click(); document.getElementById("names-list").value = "Ann\\nBo"; document.getElementById("names-make").click();
    await __ff.wait(() => __ff.got.length >= 5 && !document.getElementById("names-make").disabled, 30000); __ff.close(); return [document.getElementById("download").textContent, __ff.got];`);
  check("Rename names the Download", /Download Mom_s_coaster_2\.pes/.test(n[0]), n[0]);
  for (const [what, re] of [["PES", /^Mom_s_coaster_2\.pes$/], ["saved design", /^Mom_s_coaster_2\.needleworks\.json$/], ["Cricut file", /^Mom_s_coaster_2_cut_\d+x\d+mm\.svg$/], ["Silhouette file", /^Mom_s_coaster_2_cut_\d+x\d+mm\.dxf$/], ["names ZIP", /^Mom_s_coaster_2_\d+_(names|monograms)\.zip$/]])
    check(`Rename names the ${what}`, n[1].some((f) => re.test(f)), n[1].join(" "));
  // (round 12) each name's thumbnail says the file it went to where that isn't the name as typed: the note names files
  // (Hoop the fabric a quarter turn round for Zoe.pes) and the machine's screen shows them
  const caps = await run(`document.getElementById("names-open").click(); document.getElementById("names-list").value = "Zoë\\nemma\\nEmma"; document.getElementById("names-make").click();
    await __ff.wait(() => document.querySelectorAll("#names-thumbs figcaption").length === 3 && !document.getElementById("names-make").disabled, 30000);
    const c = [...document.querySelectorAll("#names-thumbs figcaption")].map((f) => f.textContent); __ff.close(); return c;`);
  check("a name's thumbnail says its file where it isn't the name", caps.some((t) => /^Zoë · Zoe\.pes/.test(t)) && caps.some((t) => /^Emma · Emma_2\.pes/.test(t)) && caps.some((t) => /^emma(?! ·)/.test(t)), caps.join(" | "));
  const k = await run(`location.reload(); return 1;`).catch(() => 1);
  await open("#design");
  const kept = await run(`return document.getElementById("download").textContent;`);
  check("the name is kept with the design", /Mom_s_coaster_2/.test(kept), kept);
  const s = await run(`document.querySelector("[data-start=oval]").click(); await new Promise((r) => setTimeout(r, 1500)); return document.getElementById("download").textContent;`);
  check("a starter clears the name", !/Mom_s/.test(s), s);
}

// ---- Picture -> Design your own, and a thread swapped on a colour's chip
{
  await open("#picture");
  const r = await run(`await __ff.wait(() => !document.getElementById("pic-use").hidden && !document.getElementById("download").disabled, 40000);
    const threads = () => [...document.querySelectorAll("#threads li")].map((l) => l.textContent.trim()).sort().join("|"), want = threads();
    document.getElementById("pic-new").click(); await __ff.wait(() => document.body.dataset.mode === "design" && /sample-flower/.test(document.getElementById("download").textContent));
    await new Promise((r) => setTimeout(r, 1000));
    return { want, got: threads(), pieces: [...document.querySelectorAll("#st-pieces .pick")].map((b) => b.textContent.trim()) };`);
  check("start a new design with the picture: it alone, as a file piece", r.pieces.length === 1 && /sample-flower/.test(r.pieces[0]), r.pieces.join(", "));
  check("the picture keeps its threads in Design your own", r.want === r.got, `${r.want} -> ${r.got}`);
  const a = await run(`document.querySelector("[data-start=tote]").click(); await new Promise((r) => setTimeout(r, 1500)); const before = document.querySelectorAll("#st-pieces .pick").length;
    location.hash = "#picture"; await __ff.wait(() => document.body.dataset.mode === "picture" && !document.getElementById("pic-add").hidden); document.getElementById("pic-add").click();
    await __ff.wait(() => document.body.dataset.mode === "design"); await new Promise((r) => setTimeout(r, 1500));
    return [before, [...document.querySelectorAll("#st-pieces .pick")].map((b) => b.textContent.trim()), document.getElementById("st-toast").textContent];`);
  check("add the picture to my design: one piece more", a[1].length === a[0] + 1 && a[1].some((t) => /sample-flower/.test(t)), `${a[0]} -> ${a[1].join(", ")}; ${a[2]}`);
  const w = await run(`location.hash = "#picture"; await __ff.wait(() => document.body.dataset.mode === "picture" && !document.getElementById("download").disabled);
    const chip = document.querySelector("#pic-palette button"); chip.click(); await new Promise((r) => setTimeout(r, 200));
    const pick = document.querySelector("#pic-swap [data-hex][aria-pressed=false]"), hex = pick.dataset.hex, was = chip.querySelector("i").style.background; pick.click();
    const has = () => { const v = nwTest.view(); return v && v.file.threads.some((t) => t.color.toLowerCase() === hex); };
    await __ff.wait(has, 40000); const swapped = has();
    document.querySelector("#pic-swap [data-do=back]").click(); await __ff.wait(() => !has(), 40000);
    return { hex, swapped, back: !has(), shown: document.getElementById("pic-swap").hidden };`);
  check("a swapped thread is the one in the file", w.swapped, JSON.stringify(w));
  check("Back to the matched thread undoes the swap", w.back, JSON.stringify(w));
}

// ---- Threads I own: a brand not listed
{
  const r = await run(`__ff.close(); const s = document.getElementById("brand"); s.value = "@mine"; s.dispatchEvent(new Event("change")); await new Promise((r) => setTimeout(r, 300));
    const f = document.getElementById("spools-find"); f.value = "Madeira 1147"; f.dispatchEvent(new Event("input")); const none = document.getElementById("spools-none").textContent;
    const c = document.getElementById("spools-colour"); c.value = "#7f3fbf"; c.dispatchEvent(new Event("input"));
    const shown = [...document.querySelectorAll("#spools-grid button:not([hidden])")].map((b) => b.title); __ff.close(); return { none, shown };`);
  check("an unlisted brand is said as not listed", /Madeira isn't one of the brands here/.test(r.none), r.none);
  check("a colour picked shows the nearest spools", r.shown.length > 0 && r.shown.length <= 8 && r.shown.some((t) => /Violet|Purple/.test(t)), r.shown.join(", "));
}
for (const p of problems) console.log("FAIL " + p);
console.log(`files flow: ${Math.round((Date.now() - t0) / 1000)} s`);
console.log(`DONE ${checks} ${problems.length}`);
process.exit(problems.length ? 1 : 0);
