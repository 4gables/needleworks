// Class guarded: what a file is called, what's said about a file that isn't a design, and how a design gets from one
// tab to another (round 11): four coasters with different motifs all downloaded as Coaster.pes with no way to name
// them; a PNG renamed .pes said "has no stitches... may be damaged"; the download dialog said "each file you've saved
// is a design of its own" after one save, counting another tab's; a picture had no way into Design your own; a
// picture's colour could only be left out, not sewn in another thread; "Threads I own" had nothing for a Madeira spool.
// Checks, in the browser:
// - Open a design: a PNG, JPEG, zip, PDF or empty file named .pes says what it is; a picture offers "Turn it into
//   stitches", which opens it on the Picture tab. + Design file says the same.
// - The download dialog says which file to sew only for files that belong together: a file and its fixed copy ("Sew
//   peace_fixed.pes, not peace.pes"), never after separate designs (it said "each a design of its own, any order").
// - Rename: the name asked for is on the Download button and every file the Design tab makes (PES, saved design,
//   cutter files, names ZIP), is kept with the saved design and back when it's opened; a starter clears it. A design
//   of motifs alone is named after its starter and motifs.
// - Picture -> Design your own: "start a new design with it" (the picture alone, a file piece) and "add it to my
//   design" (one piece more), both with the picture's threads; a starter picked over the picture offers to bring it.
// - A picture colour's chip swaps its thread: the file then carries the thread picked, and Back undoes it.
// - Threads I own: a search for an unlisted brand says it isn't listed; a colour picked shows the nearest spools.
// - (round 12) One for each name: a name saved under another file name (Zoë as Zoe.pes, a second Emma as Emma_2.pes)
//   says so under its thumbnail.
// - Every kind of project with a modifier, out through every exit (the matrix, below; all of it with --matrix).
// usage: node tests/cdp.mjs PORT start DIR; serve the site (tests/batch_server.py out/batch HTTP); then
//        node tests/files_flow.mjs PORT http://127.0.0.1:HTTP [--matrix] [--only kind,kind] [--mods mod,mod]
//        (~3 min, ~12 with --matrix; prints DONE <checks> <problems>)
const [port, base, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf("--" + k); return i < 0 ? null : rest[i + 1].split(","); };
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

// ---- the dialog's "which one to sew": only for a file and its fixed copy saved on this tab
{
  await open("#open");
  const golden = (f) => `new Uint8Array(await (await fetch("tests/fixtures/golden/${f}")).arrayBuffer())`;
  // (opened, the file is the view's: an untouched one's button says "Save a copy", not its name. "not saved" when the
  // dialog never opened, so the checks can't pass on a file that wasn't saved)
  const save = async (f, bytes = golden(f)) => run(`__ff.close(); __ff.put("#open-file", ${bytes}, "${f}"); await __ff.wait(() => nwTest.view()?.filename.replace(/_fixed/, "") === "${f}" && !document.getElementById("download").disabled);
    document.getElementById("download").click(); return await __ff.wait(() => document.getElementById("done").open, 5000) ? (document.getElementById("done-own").hidden || document.getElementById("done-own").textContent) : "not saved";`);
  // (a save on the Design tab first: not this tab's)
  await run(`location.hash = "#design"; await __ff.wait(() => document.body.dataset.mode === "design" && !document.getElementById("download").disabled); document.getElementById("download").click(); await __ff.wait(() => document.getElementById("done").open, 5000); __ff.close(); location.hash = "#open"; await __ff.wait(() => document.body.dataset.mode === "open");`);
  check("one save on this tab: nothing said of other files", await save("multi.pes") === true);
  check("the same file again: still nothing", await save("multi.pes") === true);
  // (two separate designs saved in one visit read as parts of one: "each file you've saved is a design of its own")
  check("a second, unrelated file saved: nothing said", await save("ashley_v3.pes") === true);
  // a failing file saved as it came (its fixes unticked), then its fixed copy from the dialog: which one to sew, the
  // fixed one. (round 13) Opened again it opens with its fixes ticked and Download saves the fixed copy (peace.pes's
  // "Save a copy" saved it failing, the fixed copy only inside the dialog)
  if (await ev(`fetch("tests/external/pes/peace.pes").then((r) => r.ok)`).catch(() => false)) {
    const peace = `new Uint8Array(await (await fetch("tests/external/pes/peace.pes")).arrayBuffer())`;
    const first = await run(`__ff.close(); __ff.put("#open-file", ${peace}, "peace.pes"); await __ff.wait(() => /^peace/.test(nwTest.view()?.filename || "") && !document.getElementById("download").disabled);
      await new Promise((r) => setTimeout(r, 800)); for (const b of document.querySelectorAll("#doctor-fix input[type=checkbox]")) if (b.checked && !b.disabled) b.click();
      await __ff.wait(() => nwTest.view()?.filename === "peace.pes" && !document.getElementById("download").disabled, 20000);
      __ff.got.length = 0; document.getElementById("download").click(); await __ff.wait(() => document.getElementById("done").open, 5000);
      const own = document.getElementById("done-own").hidden; const b = [...document.querySelectorAll("#done-bad button")].find((x) => /fixed/.test(x.textContent));
      if (b) b.click(); await __ff.wait(() => __ff.got.length >= 2, 10000);
      return { own, fixed: !!b, got: __ff.got.slice(), now: document.getElementById("done-own").hidden ? "" : document.getElementById("done-own").textContent };`);
    check("peace.pes as it came: saved and its fixed copy offered", first.fixed && first.got.length === 2, JSON.stringify(first));
    if (first.fixed && first.got.length === 2) {
      check("a failing file saved: nothing said before its fixed copy", first.own === true, JSON.stringify(first));
      check("its fixed copy saved too: sew the fixed one, never both", /^Sew \S+_fixed\.pes at the machine, not \S+\.pes/.test(first.now) && !/any order/.test(first.now), JSON.stringify(first));
    }
    const fixed = await run(`__ff.close(); __ff.put("#open-file", ${peace}, "peace.pes"); await __ff.wait(() => /^peace/.test(nwTest.view()?.filename || "") && !document.getElementById("download").disabled);
      await __ff.wait(() => /fixed/.test(nwTest.view()?.filename || ""), 20000);   // (not the as-it-came view still showing)
      __ff.got.length = 0; const btn = document.getElementById("download").textContent; document.getElementById("download").click(); await __ff.wait(() => document.getElementById("done").open, 5000);
      return { btn, got: __ff.got.slice()};`);
    check("peace.pes: opens fixed, Download saves the fixed copy", fixed.btn === "Save fixed copy" && fixed.got.length === 1 && /^peace\S*_fixed\.pes$/.test(fixed.got[0]), JSON.stringify(fixed));
  }
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

// ---- (round 14) every way out says what it saved: the cutter files and Save design said nothing (Download opens its
// dialog, or with "Don't show this again" a note); the download dialog counts the files (a ZIP of two hoopings said
// "Copy the file to a USB stick"); One for each name says what Make will do as the names are typed (names typed twice,
// letters the font lacks, a second Emma saved as Emma_2.pes and past 40 were said only after Make)
{
  await open("#design");
  const said = await run(`document.querySelector("[data-start=bookmark]").click(); await __ff.wait(() => !document.getElementById("download").disabled && !document.getElementById("cut-files").hidden);
    const t = () => document.getElementById("st-toast").hidden ? "" : document.getElementById("st-toast").textContent, out = {};
    for (const id of ["st-save", "cut-file", "cut-dxf"]) { __ff.got.length = 0; document.getElementById(id).click(); await __ff.wait(() => __ff.got.length, 3000); out[id] = [__ff.got[0], t()]; }
    localStorage.setItem("nw:doneSeen", "true"); __ff.got.length = 0; document.getElementById("download").click(); await __ff.wait(() => __ff.got.length, 3000); out.download = [__ff.got[0], t()];
    localStorage.removeItem("nw:doneSeen"); return out;`);
  for (const [id, [file, toast]] of Object.entries(said)) check(`${id} says the file it saved`, file && toast.includes(`Saved ${file}`), `${file}: “${toast}”`);
  const typed = await run(`document.getElementById("names-open").click(); const l = document.getElementById("names-list"); l.value = "Ann\\nAnn\\nZoe 🎉\\nemma\\nEmma\\n" + Array.from({ length: 40 }, (_, i) => "Kid" + i).join("\\n");
    l.dispatchEvent(new Event("input", { bubbles: true })); const before = document.getElementById("names-note").textContent; __ff.close(); return before;`);
  check("the names dialog says names typed twice as they're typed", /Typed twice, made once: Ann/.test(typed), typed);
  check("the names dialog says a letter the font lacks as it's typed", /Zoe 🎉 \(the font has no “🎉”\)/.test(typed), typed);
  check("the names dialog says a second Emma's file name as it's typed", /Emma is saved as Emma_2\.pes/.test(typed), typed);
  check("the names dialog says past 40 as it's typed", /Past 40, left out: Kid/.test(typed), typed);
  const two = await run(`localStorage.setItem("nw:studio", JSON.stringify({ pieces: [{ id: 1, kind: "text", text: "Welcome to our Home", size: 19, font: "NW Yellowtail", x: 0, y: 0, color: "#0e1f7c" }], sel: 1, fabric: "cotton", thread: "auto", two: true }));
    localStorage.setItem("nw:hoop", '"5x7"'); localStorage.setItem("nw:turn", '{"design":false}'); location.reload(); return 1;`).catch(() => 1);
  await open("#design");
  const dlg = await run(`await __ff.wait(() => !document.getElementById("download").disabled); [...document.querySelectorAll("button")].find((b) => /Sew it in two hoopings/i.test(b.textContent))?.click();
    await __ff.wait(() => nwTest.view()?.split); document.getElementById("download").click(); await __ff.wait(() => document.getElementById("done").open, 3000);
    const c = document.getElementById("done-copy").textContent; __ff.close(); return c;`);
  check("the download dialog counts the files handed out", /Copy the 2 \.pes files/.test(dlg), dlg);
}

// ---- Picture -> Design your own, and a thread swapped on a colour's chip
{
  // (the sample flower: the picture opened earlier from the Open tab is kept for the next visit, round 14)
  await open("#design"); await ev(`new Promise((ok) => { const r = indexedDB.deleteDatabase("needleworks"); r.onsuccess = r.onerror = r.onblocked = () => ok(1); })`);
  await open("#picture");
  const r = await run(`await __ff.wait(() => !document.getElementById("pic-use").hidden && !document.getElementById("download").disabled, 40000);
    const threads = () => [...document.querySelectorAll("#threads li")].map((l) => l.textContent.trim()).sort().join("|"), want = threads();
    document.getElementById("pic-new").click(); await __ff.wait(() => document.body.dataset.mode === "design" && /sample-flower/.test(document.getElementById("download").textContent));
    await new Promise((r) => setTimeout(r, 1000));
    return { want, got: threads(), pieces: [...document.querySelectorAll("#st-pieces .pick")].map((b) => b.textContent.trim()) };`);
  check("start a new design with the picture: it alone, as a file piece", r.pieces.length === 1 && /sample-flower/.test(r.pieces[0]), r.pieces.join(", "));
  check("the picture keeps its threads in Design your own", r.want === r.got, `${r.want} -> ${r.got}`);
  // (round 13) a starter picked while the design is the picture: it can come along (it was gone, Undo the only way back)
  const b = await run(`document.querySelector("[data-start=tote]").click(); await new Promise((r) => setTimeout(r, 1500)); const n = document.querySelectorAll("#st-pieces .pick").length;
    const t = document.getElementById("st-toast"), go = [...t.querySelectorAll("button")].find((x) => /^Add sample-flower/.test(x.textContent)); const said = t.hidden ? "" : t.textContent;
    if (go) go.click(); await new Promise((r) => setTimeout(r, 2000));
    return { said, n, now: [...document.querySelectorAll("#st-pieces .pick")].map((x) => x.textContent.trim()) };`);
  check("a starter over the picture offers to bring the picture along", /Replaced your design/.test(b.said) && /Add sample-flower[^ ]* to it/.test(b.said), b.said);
  check("brought along: the starter's pieces and the picture", b.now.length === b.n + 1 && b.now.some((t) => /sample-flower/.test(t)), `${b.n} -> ${b.now.join(", ")}`);
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
  // (tester, 2026-11) any thread for a colour: the whole chart under More colours, and any colour, which never lands
  // on a thread another colour of the picture sews
  const m = await run(`const chips = [...document.querySelectorAll("#pic-palette button")]; if (document.getElementById("pic-swap").hidden) chips[0].click(); await new Promise((r) => setTimeout(r, 200));
    const chart = [...document.querySelectorAll("#pic-swap .pic-chart [data-hex]")].length, other = chips[1].querySelector("i").style.background;
    const hexOf = (rgb) => "#" + rgb.match(/[0-9]+/g).slice(0, 3).map((v) => (+v).toString(16).padStart(2, "0")).join("");
    const any = document.getElementById("pic-swap-any"); any.value = hexOf(other); any.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500)); await __ff.wait(() => !document.getElementById("download").disabled, 40000); await new Promise((r) => setTimeout(r, 500));
    const cols = [...document.querySelectorAll("#pic-palette button i")].map((i) => i.style.background);
    return { chart, other, cols, paste: !!document.getElementById("pic-paste") };`);
  check("More colours lists the Brother chart", m.chart >= 40, JSON.stringify(m));
  check("any colour never shares another colour's thread", new Set(m.cols).size === m.cols.length, JSON.stringify(m));
}

// ---- (round 13) the first draw asks only for the fonts it needs: the font row in all 16 faces and the starters' cards
// loaded every font with the design's, and on a slow connection the preview waited ~31 s for its one font. Every
// other font is asked for only once the design's own have come.
{
  await ev(`localStorage.clear(), 1`);
  await call("goto", `${base}/?v=fonts${Date.now()}#design`);
  // (the first-visit design: one lettering, selected, its font in the editor)
  const r = await run(`await __ff.wait(() => document.body.dataset.mode && !document.getElementById("download").disabled && document.querySelector('#st-edit select[data-k="font"]'), 30000);
    await new Promise((r) => setTimeout(r, 1500));
    const used = [document.querySelector('#st-edit select[data-k="font"]').value].map((f) => f.replace(/^NW /, "").replace(/ /g, "").toLowerCase());
    const all = performance.getEntriesByType("resource").filter((e) => e.name.includes("/fonts/") && e.name.endsWith(".woff2")).map((e) => ({ f: e.name.split("/").pop(), start: e.startTime, end: e.responseEnd }));
    const mine = all.filter((x) => used.some((u) => x.f.toLowerCase().startsWith(u))), came = Math.max(...mine.map((x) => x.end));
    return { used, mine: mine.map((x) => x.f), early: all.filter((x) => !mine.includes(x) && !/^Sacramento/.test(x.f) && x.start < came).map((x) => x.f) };`);
  check("the design's fonts load first, the others after", r.mine.length && !r.early.length, JSON.stringify(r));
}

// ---- Threads I own: a brand not listed
{
  const r = await run(`__ff.close(); const s = document.getElementById("brand"); s.value = "@mine"; s.dispatchEvent(new Event("change")); await new Promise((r) => setTimeout(r, 300));
    const f = document.getElementById("spools-find"); f.value = "Madeira 1147"; f.dispatchEvent(new Event("input")); const none = document.getElementById("spools-none").textContent;
    const c = document.getElementById("spools-colour"); c.value = "#7f3fbf"; c.dispatchEvent(new Event("input"));
    const shown = [...document.querySelectorAll("#spools-grid button:not([hidden])")].map((b) => b.title); __ff.close(); return { none, shown };`);
  check("an unlisted brand is said as not listed", /Madeira isn't one of the brands here/.test(r.none), r.none);
  check("a colour picked shows the nearest spools", r.shown.length > 0 && r.shown.length <= 8 && r.shown.some((t) => /Violet|Purple/.test(t)), r.shown.join(", "));
  // (round 13) the colour picked is added as their own Madeira spool (the brand named in the search), not as the
  // nearest Brother spool ticked to stand for it ("Your Brother 079 Salmon Pink" everywhere, a spool she didn't own);
  // the search is cleared (it kept "Prussian" while the grid showed pinks)
  const m = await run(`const s = document.getElementById("brand"); s.value = "@mine"; s.dispatchEvent(new Event("change")); await new Promise((r) => setTimeout(r, 300));
    const f = document.getElementById("spools-find"); f.value = "Madeira"; f.dispatchEvent(new Event("input"));
    const c = document.getElementById("spools-colour"); c.value = "#e8a0a8"; c.dispatchEvent(new Event("input"));
    const form = !document.getElementById("spools-own").hidden, brand = document.getElementById("own-brand").value, search = f.value;
    document.getElementById("own-num").value = "1147"; document.getElementById("own-add").click();
    const chips = document.getElementById("spools-chips").textContent; document.getElementById("spools-save").click();
    location.hash = "#design"; await new Promise((r) => setTimeout(r, 1500));
    // (the pieces in turn: a picture's file piece has no thread swatches)
    let sw = [];
    for (const id of [...document.querySelectorAll("#st-pieces .pick")].map((b) => b.dataset.id)) {
      document.querySelector('#st-pieces .pick[data-id="' + id + '"]').click(); await new Promise((r) => setTimeout(r, 800));
      sw = [...document.querySelectorAll("#st-edit .own-swatches button")].map((b) => b.getAttribute("aria-label") + " | " + b.title);
      if (sw.length) break;
    }
    const saved = localStorage.getItem("nw:myspools");
    for (const k of ["myspools", "spools", "brand"]) localStorage.removeItem("nw:" + k);
    return { form, brand, search, chips, sw, saved };`);
  check("a colour picked offers to add it as their own spool, the brand from the search", m.form && m.brand === "Madeira", JSON.stringify(m));
  check("a colour picked clears the search", m.search === "", JSON.stringify(m));
  check("their own Madeira spool is listed and saved", /Madeira 1147/.test(m.chips) && /"Madeira"/.test(m.saved || ""), JSON.stringify(m));
  check("their own Madeira spool is a swatch named as theirs, never as a Brother spool", m.sw.some((t) => /^Your Madeira 1147 \| Your Madeira 1147/.test(t)) && !m.sw.some((t) => /Your Brother/.test(t)), JSON.stringify(m.sw));
}
// ---------- every kind with every modifier, out through every exit (was tests/matrix.mjs) ----------
// Class guarded: features that each work alone but not together (rounds 9-11: a ganged key fob's monogram, a turned
// cut file sideways, a names batch past Download's block, two hoopings' files named after the second half, a towel
// fix that closed letters up). A project kind is made with a modifier, then taken out through every exit, and the
// exits must agree:
//   modifiers  none, turned, ganged (Make another), two hoopings, towel, knit, owned spools, 4x4, renamed
//   kinds      lettering, monogram, appliqué frame, in-the-hoop, patch, quilt, picture (a file piece)
//   exits      Download, cut files, sew sheet, Sew along, share text, One for each name
//   invariants a design too big for the hoop lets nothing out; Download hands over one file named as its button says,
//              that passes the gate (validatePES + the machine's hard rules) and fits the hoop (each hooping's file
//              in the ZIP for two hoopings); steps: the count and each step's thread agree on the steps list, Sew
//              along, the sew sheet and the share text; cut files pass the gate (page = shapes = name); the names
//              ZIP holds one passing file per name made, each named for its name; every piece has stitches in the
//              design or a problem said about it (nothing silently dropped).
// Every run: nine combinations, each modifier once and each kind at least once (~2 min). --matrix: all 63 (~10 min;
// a modifier that can't apply to a kind, Make another on a lettering design, is skipped and counted); --only and
// --mods narrow that.
let skipped = 0;
async function freshM(spools = false) {
  for (let i = 0; i < 8; i++) {
    await call("goto", `${base}/manifest.webmanifest?v=${Date.now()}`).catch(() => {});
    await ev(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("nw:")) localStorage.removeItem(k);
      for (const [k, v] of Object.entries({ doneSeen: true, "studio.guideSeen": true, "studio.applSeen": true, ...(${spools} ? { brand: "isacord", spools: { isacord: ["0015", "0020", "1902", "3810", "3711", "1755", "2702", "0700", "5233"] } } : {}) })) localStorage.setItem("nw:" + k, JSON.stringify(v)); return 1; })()`).catch(() => {});
    await call("goto", `${base}/?v=m${Date.now()}${i}#design`);
    for (let k = 0; k < 30; k++) { await sleep(300); if (await ev("document.body.dataset.mode ? 1 : 0").catch(() => 0)) { await runM(`await __m.settle(2500);`); return; } }
  }
  throw new Error("the page didn't start");
}
// in-page: files handed out (gate.js clicks an <a download> on a blob URL), waiting, and the checks of each exit
const HM = `(() => { if (window.__m) return; const $ = (id) => document.getElementById(id);
  const blobs = new Map(), mk = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { const u = mk(b); blobs.set(u, b); return u; };
  window.__m = { got: [], blobs,
    put: (sel, bytes, name, type = "") => { const dt = new DataTransfer(); dt.items.add(new File([bytes], name, { type })); const i = document.querySelector(sel); i.files = dt.files; i.dispatchEvent(new Event("change", { bubbles: true })); },
    wait: async (ok, ms = 30000) => { for (let t = 0; t < ms && !ok(); t += 100) await new Promise((r) => setTimeout(r, 100)); return ok(); },
    settle: async (ms = 1500) => { await new Promise((r) => setTimeout(r, ms)); await __m.wait(() => !/Quilting|Re-stitching|Waiting/.test($("download").textContent), 60000); await new Promise((r) => setTimeout(r, 300)); },
    close: () => { for (const d of document.querySelectorAll("dialog[open]")) d.close(); },
    files: async () => { const out = []; for (const g of __m.got.splice(0)) out.push({ name: g.name, bytes: new Uint8Array(await g.blob.arrayBuffer()) }); return out; },
    // a stored ZIP's files
    unzip: (b) => { const v = new DataView(b.buffer, b.byteOffset, b.byteLength), out = []; let o = 0;
      while (o + 30 <= b.length && v.getUint32(o, true) === 0x04034b50) { const n = v.getUint32(o + 18, true), l = v.getUint16(o + 26, true), x = v.getUint16(o + 28, true);
        out.push({ name: new TextDecoder().decode(b.subarray(o + 30, o + 30 + l)), bytes: b.slice(o + 30 + l + x, o + 30 + l + x + n) }); o += 30 + l + x + n; } return out; } };
  HTMLAnchorElement.prototype.click = function () { if (this.download) __m.got.push({ name: this.download, blob: blobs.get(this.href) }); };
  window.print = () => {}; })()`;
const runM = async (js) => { await ev(HM); return ev(`(async () => { ${js} })()`); };

const KINDS = { lettering: "words", monogram: "monogram", applique: "applique", ith: "keyfob", patch: "patch", quilt: "quiltblock", picture: null };
const MODS = ["none", "turned", "ganged", "two", "towel", "knit", "owned", "4x4", "renamed"];

let pictureM = null;   // (the Picture tab's sample as a design, made once and opened as a saved design after)

// the kind made, in a fresh profile
async function make(kind, mod) {
  await freshM(mod === "owned");
  if (kind !== "picture") return runM(`document.querySelector('[data-start="${KINDS[kind]}"]').click(); await __m.settle(); return 1;`);
  if (!pictureM) pictureM = await runM(`location.hash = "#picture"; await __m.wait(() => document.body.dataset.mode === "picture" && !document.getElementById("pic-use").hidden && !document.getElementById("download").disabled, 90000);
    document.getElementById("pic-new").click(); await __m.settle(2500); const s = JSON.parse(localStorage.getItem("nw:studio")); return JSON.stringify({ needleworks: 1, pieces: s.pieces });`);
  else await runM(`__m.put("#st-load", ${JSON.stringify(pictureM)}, "sample-flower.needleworks.json"); await __m.settle(2500); return 1;`);
}
// the modifier; false when it can't apply to this kind
async function modify(mod) {
  switch (mod) {
    case "none": return true;
    // (spools listed before the page opened: the steps then name them)
    case "owned": return runM(`return /Isacord/.test(document.getElementById("st-steps").textContent);`);
    case "turned": return runM(`const t = document.getElementById("turn"); if (t.getAttribute("aria-pressed") !== "true") t.click(); await __m.settle(); return t.getAttribute("aria-pressed") === "true";`);
    case "towel": case "knit": return runM(`document.querySelector('#st-fabric [data-fab="${mod}"]').click(); await __m.settle(); return true;`);
    case "renamed": return runM(`document.getElementById("rename-open").click(); document.getElementById("rename-name").value = "Mom’s gift #2"; document.getElementById("rename-save").click(); await __m.settle(); return true;`);
    case "4x4": return runM(`const h = document.getElementById("hoop"); h.value = "4x4"; h.dispatchEvent(new Event("change")); await __m.settle(); return true;`);
    case "ganged": return runM(`const s = JSON.parse(localStorage.getItem("nw:studio")), f = s.pieces.find((p) => p.kind === "frame" && (p.border === "ith" || p.border === "zip")); if (!f) return false;
      document.querySelector('#st-pieces .pick[data-id="' + f.id + '"]').click(); await __m.settle(500); const b = document.querySelector("#st-edit [data-two-up]"); if (!b) return false;
      b.click(); await __m.settle(); const t = document.querySelector("#st-toast:not([hidden]) button"); if (t && /Make them|Turn/.test(t.textContent)) { t.click(); await __m.settle(); }
      return JSON.parse(localStorage.getItem("nw:studio")).pieces.filter((p) => p.kind === "frame" && p.border === f.border).length > 1;`);
    case "two": return runM(`// (the whole design copied and pasted beside itself, "Paste anyway" (or the 4x4), then "Sew it in two hoopings")
      document.activeElement?.blur(); document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await __m.settle(300);
      const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: dt }));
      const dt2 = new DataTransfer(); dt2.setData("text/plain", dt.getData("text/plain")); document.body.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt2 })); await __m.settle();
      const any = document.querySelector("#st-toast:not([hidden]) button"); if (any && /anyway/.test(any.textContent)) { any.click(); await __m.settle(); }
      // (still fits: the 4x4)
      if (!/Too big/.test(document.getElementById("download").textContent)) { const h = document.getElementById("hoop"); h.value = "4x4"; h.dispatchEvent(new Event("change")); await __m.settle(); }
      const b = [...document.querySelectorAll("#st-big button, #error button")].find((x) => /two hoopings/i.test(x.textContent)); if (!b) return false;
      b.click(); await __m.settle(); return !!nwTest.view()?.split;`);
  }
}
// every exit, and the invariants between them
async function exits(tag) {
  const r = await runM(`
    const $ = (id) => document.getElementById(id), out = { bad: [] }, bad = (m) => out.bad.push(m), v = nwTest.view(), dl = $("download").textContent.trim();
    const mod = (m) => import(new URL(m, location.href).href);
    const [{ judge }, F, MC, P] = await Promise.all([mod("js/gate.js"), mod("js/core/formats.js"), mod("js/core/machines.js"), mod("js/studio/pieces.js")]);
    const machineHoop = () => { const h = MC.hoop($("machine").value, $("hoop").value); return h; };
    out.dl = dl;
    // a design too big lets nothing out
    if (/Too big/.test(dl) || $("download").disabled) {
      for (const id of ["share", "sheet-print", "along-open", "names-open"]) { const el = $(id); if (el && !el.hidden && !el.disabled) bad(\`“\${dl}” but \${el.textContent.trim()} is on\`); }
      out.blocked = true; return out;
    }
    // nothing silently dropped: every piece has stitches, or a problem is said about it
    const s = JSON.parse(localStorage.getItem("nw:studio")), fit = P.fittedSizes(s.pieces), probs = nwTest.problems() || [];
    for (const p of s.pieces) { const n = P.pieceStitches(fit.has(p.id) ? { ...p, size: fit.get(p.id) } : p).flat().length; if (!n && !probs.some((q) => q.piece === p.id)) bad(\`\${P.label(p)} has no stitches and nothing says so\`); }
    // the keyboard's way there: Ctrl+S takes focus to Download (it was 48-67 Tabs from the Words box)
    document.activeElement?.blur(); window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true }));
    if (document.activeElement !== $("download")) bad("Ctrl+S didn't take focus to Download");
    // Download: one file, named as the button says, passing the gate, fitting the hoop
    __m.got.length = 0; $("download").click(); await new Promise((r) => setTimeout(r, 300)); __m.close();
    const files = await __m.files(), want = /^Download (.+\\.(pes|zip))$/.exec(dl)?.[1] || /^Download \\d+ files/.test(dl) && null;
    if (files.length !== 1) bad(\`Download handed out \${files.length} files\`);
    const h = machineHoop(), room = (b) => { const st = F.designStats(F.readEmbroidery(b, "x.pes")); return st.widthMm <= h.w - 2 * MC.MARGIN + 0.05 && st.heightMm <= h.h - 2 * MC.MARGIN + 0.05; };
    for (const f of files) {
      if (want && f.name !== want) bad(\`Download saved \${f.name}, its button says \${want}\`);
      const pes = /\\.zip$/.test(f.name) ? __m.unzip(f.bytes) : [f];
      if (/\\.zip$/.test(f.name) && pes.length < 2) bad(\`two hoopings' ZIP holds \${pes.length} files\`);
      for (const p of pes) { const j = judge(p, h); if (!j.ok) bad(\`\${p.name} refused: \${j.error}\`); else if (!room(p.bytes)) bad(\`\${p.name} doesn't fit the \${h.name}\`); }
    }
    out.file = files[0]?.name;
    if (v.split) { for (const id of ["share", "sheet-print", "along-open", "names-open"]) { const el = $(id); if (el && !el.hidden && !el.disabled) bad(\`two hoopings but \${el.textContent.trim()} is on\`); } return out; }
    // steps: the count and each step's thread, on the steps list, Sew along, the sew sheet and the share text
    const thread = (t) => t.replace(/\\s+/g, " ").trim();
    const listed = +(/(\\d+) steps?/.exec($("st-steps-count").textContent)?.[1] || 0);
    $("along-open").click(); const along = [];
    for (let i = 0; i < 40 && /^Step/.test($("along-count").textContent); i++) { along.push(thread($("along-title").textContent).replace(/^.* · /, "")); $("along-next").click(); }
    $("along").close();
    $("sheet-print").click(); const sheet = [...document.querySelectorAll("#sheet ol.list > li > b")].map((b) => thread(b.childNodes.length ? [...b.childNodes].filter((n) => n.nodeName !== "SMALL").map((n) => n.textContent).join("") : b.textContent).replace(/^.* · /, ""));
    const sheetName = document.querySelector("#sheet h1")?.textContent; dispatchEvent(new Event("afterprint"));
    const share = nwTest.share(), shareSteps = share.includes("(The rest is on the sew sheet") ? null : [...share.split("\\nSteps:\\n")[1]?.split("\\n\\n")[0].matchAll(/^\\d+\\. (.*?): /gm) || []].map((m) => thread(m[1]));
    if (along.length !== listed || sheet.length !== listed || (shareSteps && shareSteps.length !== listed)) bad(\`steps: \${listed} listed, Sew along \${along.length}, sew sheet \${sheet.length}, share \${shareSteps?.length}\`);
    for (let i = 0; i < Math.min(along.length, sheet.length); i++) {
      if (!sheet[i].startsWith(along[i].split(" (")[0]) && !along[i].startsWith(sheet[i].split(" (")[0])) bad(\`step \${i + 1}'s thread: Sew along “\${along[i]}”, sew sheet “\${sheet[i]}”\`);
      if (shareSteps && shareSteps[i] && shareSteps[i].split(" (")[0] !== sheet[i].split(" (")[0]) bad(\`step \${i + 1}'s thread: share “\${shareSteps[i]}”, sew sheet “\${sheet[i]}”\`);
    }
    if (sheetName !== v.filename) bad(\`the sew sheet is headed \${sheetName}, the file is \${v.filename}\`);
    // cut files
    if (!$("cut-files").hidden) for (const ext of ["svg", "dxf"]) for (const c of nwTest.cut(ext)) {
      if (!c.ok) bad(\`cut file \${c.name}: \${c.error}\`);
      if (!c.name.startsWith(v.filename.replace(/\\.pes$/, "") + "_cut_")) bad(\`cut file \${c.name} isn't named after \${v.filename}\`);
    }
    // One for each name
    if (!$("names-open").hidden && !$("names-open").disabled) {
      $("names-open").click(); const mono = /monogram/i.test($("names-what").textContent);
      const names = mono ? ["JK", "AB"] : ["Ann", "Bea Lou"]; $("names-list").value = names.join("\\n"); $("names-list").dispatchEvent(new Event("input"));
      __m.got.length = 0; $("names-make").click();
      await __m.wait(() => __m.got.length || /Couldn't|couldn't/.test($("names-note").textContent), 60000);
      const z = await __m.files(); __m.close();
      if (z.length !== 1 || !/\\.zip$/.test(z[0]?.name)) bad(\`names: \${z.map((f) => f.name).join(", ") || "nothing"} (\${$("names-note").textContent.slice(0, 100)})\`);
      else {
        const inner = __m.unzip(z[0].bytes), refused = (/Couldn't make[^.]*?:? (.*)/.exec($("names-note").textContent)?.[1] || "");
        if (inner.length + (refused ? 1 : 0) < names.length) bad(\`names ZIP holds \${inner.length} of \${names.length} with nothing said\`);
        for (const f of inner) { const j = judge(f, h); if (!j.ok) bad(\`names file \${f.name} refused: \${j.error}\`); else if (!room(f.bytes)) bad(\`names file \${f.name} doesn't fit\`); }
        if (!names.every((n) => inner.some((f) => f.name.includes(n.split(" ")[0])) || refused)) bad(\`names ZIP files \${inner.map((f) => f.name).join(", ")} for \${names.join(", ")}\`);
        out.names = inner.length;
      }
    }
    out.steps = listed;
    return out;`);
  for (const b of r.bad) check(`${tag}: ${b}`, false);
  checks++;
  return r;
}

const EVERY_RUN = [["lettering", "two"], ["monogram", "towel"], ["applique", "turned"], ["ith", "ganged"], ["patch", "4x4"], ["quilt", "knit"], ["picture", "owned"], ["lettering", "renamed"], ["ith", "none"]];
const combos = rest.includes("--matrix") || opt("only") || opt("mods") ? (opt("only") || Object.keys(KINDS)).flatMap((k) => (opt("mods") || MODS).map((md) => [k, md])) : EVERY_RUN;
for (const [kind, mod] of combos) {
  const tag = `${kind} + ${mod}`;
  try {
    await make(kind, mod);
    if (!(await modify(mod))) { skipped++; console.log(`${tag}: n/a`); continue; }
    let r = await exits(tag);
    // too big (the 4x4, a turn): nothing let out, then Fit to hoop and every exit again
    if (r.blocked) { await runM(`document.getElementById("st-fit").click(); await __m.settle(); return 1;`); r = await exits(tag + " (fitted)"); if (r.blocked) check(`${tag}: still blocked after Fit to hoop (${r.dl})`, false); }
    console.log(`${tag}: ${r.file || r.dl}, ${r.steps ?? "-"} steps${r.names != null ? `, ${r.names} names` : ""}`);
  } catch (e) { check(`${tag}: ${String(e.message || e).slice(0, 300)}`, false); }
}
console.log(`matrix: ${combos.length} combinations, ${skipped} n/a`);
for (const p of problems) console.log("FAIL " + p);
console.log(`files flow: ${Math.round((Date.now() - t0) / 1000)} s`);
console.log(`DONE ${checks} ${problems.length}`);
process.exit(problems.length ? 1 : 0);
