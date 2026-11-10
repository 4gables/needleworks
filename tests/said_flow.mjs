// Class guarded: silent change or loss (rounds 9-11: the names batch dropped a name, lettering that drew nothing,
// picture parts lost, duplicates, a field's maxlength cut, Open saved switched the hoop, ...) and asked vs sewn at run
// time (tests/sewn_lint.mjs is the static half). Every transform of what the user asked for is driven here, and each
// must be said, once, in plain words (a toast, the problems list, a note), or not happen:
// - Open saved and a paste: an unreadable piece, an unknown font, words past the most, a crazy size; lettering with
//   no words yet is kept (it vanished), and said as empty.
// - A saved design dropped on the page goes to Open saved; chosen in Open a design, it says what it is and offers
//   Design your own.
// - Quilting with no room left in its frame says it isn't quilted.
// - The names batch: a name whose file name another took says its file; names start from the design's sewn size
//   (a frame that shrank the design's name let "Al" come out half as big again).
// - Arch up on lettering a frame shrank keeps the size it was sewn at (it jumped to the size asked).
// - A duplicate made smaller to find room says so.
// - Rename: a pasted name past 60 letters says it was cut.
// - Picture: a band of colour round the edge taken as a frame says it isn't sewn.
// usage: node tests/cdp.mjs PORT start DIR; serve the site (tests/batch_server.py out/batch HTTP); then
//        node tests/said_flow.mjs PORT http://127.0.0.1:HTTP      (~1 min; prints DONE <checks> <problems>)
const [port, base] = process.argv.slice(2);
if (!port || !base) { console.log("usage: node tests/said_flow.mjs CDP_PORT BASE_URL"); process.exit(2); }
const ctl = `http://127.0.0.1:${+port + 100}/`;
const call = async (cmd, ...args) => (await (await fetch(ctl, { method: "POST", body: JSON.stringify({ cmd, args }) })).text()).trim();
const ev = async (js) => { const t = await call("eval", js); if (t.startsWith("ERROR")) throw new Error(t); return t === "undefined" || t === "" ? undefined : JSON.parse(t); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0; const problems = [];
const check = (what, ok, detail = "") => { checks++; if (!ok) problems.push(`${what}${detail ? `: ${detail}` : ""}`); };
async function open(hash) {
  for (let i = 0; i < 8; i++) {
    await call("goto", `${base}/?v=s${Date.now()}${i}${hash}`);
    for (let k = 0; k < 30; k++) { await sleep(300); if (await ev("document.body.dataset.mode && typeof nwTest === 'object' ? 1 : 0").catch(() => 0)) return; }
  }
  throw new Error("the page didn't start");
}
const H = `(() => { if (window.__sf) return; window.__sf = {
  put: (sel, bytes, name, type = "") => { const dt = new DataTransfer(); dt.items.add(new File([bytes], name, { type })); const i = document.querySelector(sel); i.files = dt.files; i.dispatchEvent(new Event("change", { bubbles: true })); },
  wait: async (ok, ms = 20000) => { for (let t = 0; t < ms && !ok(); t += 100) await new Promise((r) => setTimeout(r, 100)); return ok(); },
  toast: () => document.getElementById("st-toast").hidden ? "" : document.getElementById("st-toast").textContent,
  close: () => { for (const d of document.querySelectorAll("dialog[open]")) d.close(); },
  pieces: () => document.querySelectorAll("#st-pieces li[data-id]").length,
  load: async (json) => { __sf.close(); document.getElementById("st-toast").hidden = true; __sf.put("#st-load", JSON.stringify(json), "d.needleworks.json", "application/json");
    await __sf.wait(() => nwTest.view() && !document.getElementById("busy").hidden === false, 20000); await new Promise((r) => setTimeout(r, 600)); },
  ids: () => nwTest.problems().map((p) => p.id),
}; })()`;
const run = async (js) => { await ev(H); return ev(`(async () => { ${js} })()`); };
const t0 = Date.now();
const frame = (o) => ({ kind: "frame", shape: "oval", w: 110, h: 64, border: "satin", x: 0, y: 0, color: "#c00000", ...o });
const words = (o) => ({ kind: "text", text: "Ashley", font: "NW Great Vibes", size: 24, shape: "straight", radius: 30, x: 0, y: 0, color: "#000080", ...o });
const design = (pieces) => ({ needleworks: 1, hoop: "5x7", pieces: pieces.map((p, i) => ({ id: i + 1, ...p })) });

await open("#design");
// ---- Open saved and paste: what came out different is said; empty lettering is kept
{
  const odd = design([frame(), words({ text: "", size: 30 }), words({ text: "Hi", font: "NW Comic Papyrus", size: 12, y: 22 }), { kind: "blob" }, words({ text: "x".repeat(90), size: 10, y: -20, font: "NW Quicksand" }), { kind: "motif", motif: "heart", size: 9999, x: 40, y: 0 }]);
  const r = await run(`await __sf.load(${JSON.stringify(odd)}); await __sf.wait(() => __sf.ids().some((id) => /^empty:/.test(id)), 8000); return { toast: __sf.toast(), n: __sf.pieces(), ids: __sf.ids() };`);   // (problems come a tick after the preview: make() is paced)
  check("Open saved: an unreadable piece is said", /1 piece couldn't be read/.test(r.toast), r.toast);
  check("Open saved: an unknown font is named", /Comic Papyrus/.test(r.toast) && /Great Vibes is used instead/.test(r.toast), r.toast);
  check("Open saved: words past the most are said cut", /cut short/.test(r.toast), r.toast);
  check("Open saved: a size past any hoop is said", /set to the nearest that works/.test(r.toast), r.toast);
  check("Open saved: lettering with no words is kept, and said as empty", r.n === 5 && r.ids.some((id) => /^empty:/.test(id)), JSON.stringify(r));
  const p = await run(`await __sf.load(${JSON.stringify(design([words()]))}); document.getElementById("st-toast").hidden = true;
    const dt = new DataTransfer(); dt.setData("text/plain", ${JSON.stringify(JSON.stringify({ needleworks: 1, pieces: [words({ text: "Bo", font: "NW Comic Papyrus", y: 30, size: 12 }), { kind: "blob" }] }))});
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    await __sf.wait(() => __sf.toast()); return { toast: __sf.toast(), n: __sf.pieces() };`);
  check("Paste: what came out different is said with it", /Pasted/.test(p.toast) && /Comic Papyrus/.test(p.toast) && /couldn't be read/.test(p.toast), p.toast);
}
// ---- a saved design dropped on the page, or chosen in Open a design
{
  const json = JSON.stringify(design([words({ text: "Dropped" })]));
  const r = await run(`location.hash = "#open"; await __sf.wait(() => document.body.dataset.mode === "open");
    const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(json)}], "mine.needleworks.json", { type: "application/json" }));
    document.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    await __sf.wait(() => document.body.dataset.mode === "design" && /Dropped/.test(document.getElementById("st-pieces").textContent), 8000);
    return [document.body.dataset.mode, document.getElementById("st-pieces").textContent];`);
  check("A saved design dropped on the page opens in Design your own", r[0] === "design" && /Dropped/.test(r[1]), JSON.stringify(r).slice(0, 200));
  // (picked on Open a design, it opens straight in Design your own, as dropping it does: `savedDesign`)
  const o = await run(`location.hash = "#open"; await __sf.wait(() => document.body.dataset.mode === "open");
    __sf.put("#open-file", ${JSON.stringify(JSON.stringify(design([words({ text: "Picked" })])))}, "mine.needleworks.json");
    await __sf.wait(() => document.body.dataset.mode === "design" && /Picked/.test(document.getElementById("st-pieces").textContent), 8000);
    return [document.body.dataset.mode, document.getElementById("st-pieces").textContent, document.getElementById("error").hidden];`);
  check("Open a design: a saved design picked there opens in Design your own", o[0] === "design" && /Picked/.test(o[1]), JSON.stringify(o).slice(0, 200));
}
// ---- quilting with no room left in its frame
{
  const r = await run(`await __sf.load(${JSON.stringify(design([frame({ shape: "circle", w: 40, h: 40, border: "line", quilt: "stipple" }), { kind: "motif", motif: "heart", size: 34, style: "fill", x: 0, y: 0, color: "#c00000" }]))});
    await __sf.wait(() => __sf.ids().some((id) => /^quilt:/.test(id)), 15000); return __sf.ids();`);
  check("Quilting with no room in its frame says it isn't quilted", r.some((id) => /^quilt:/.test(id)), JSON.stringify(r));
  const ok = await run(`await __sf.load(${JSON.stringify(design([frame({ shape: "circle", w: 100, h: 100, border: "line", quilt: "stipple" }), { kind: "motif", motif: "heart", size: 30, style: "fill", x: 0, y: 0, color: "#c00000" }]))});
    await __sf.wait(() => !document.getElementById("download").disabled, 20000); return __sf.ids();`);
  check("Quilting with room says nothing of it", !ok.some((id) => /^quilt:/.test(id)), JSON.stringify(ok));
}
// ---- names batch: sewn size, and a file name another name took
{
  const r = await run(`await __sf.load(${JSON.stringify(design([frame(), words({ size: 60 })]))});
    const m = ["Al", "Ashley"].map((n) => nwTest.names(n, true)); return m.map((x) => [x.xh, x.own]);`);
  check("Names batch: a short name keeps the design's sewn letter size (frame-shrunk design)", r.every(([xh, own]) => Math.abs(xh - own) <= 0.1 * own), JSON.stringify(r));
  const n = await run(`await __sf.load(${JSON.stringify(design([frame(), words()]))});
    document.getElementById("names-open").click(); document.getElementById("names-list").value = "Zoe\\nZoë"; document.getElementById("names-make").click();
    await __sf.wait(() => document.querySelectorAll("#names-thumbs figcaption").length >= 2, 30000);
    const c = [...document.querySelectorAll("#names-thumbs figcaption")].map((f) => f.textContent); __sf.close(); return c;`);
  check("Names batch: a name saved under another file name says which", n.length === 2 && /· Zoe_2\.pes/.test(n[1]) && !/·/.test(n[0]), JSON.stringify(n));
}
// ---- Arch up on lettering a frame shrank keeps its sewn size
{
  const r = await run(`await __sf.load(${JSON.stringify(design([frame(), words({ size: 60 })]))});
    document.querySelectorAll("#st-pieces li[data-id]")[1].click(); await new Promise((r) => setTimeout(r, 400));
    const shown = document.querySelector('[data-k="size"]').nextElementSibling.textContent;
    document.querySelector('[data-seg="shape"] [data-v="up"]').click(); await new Promise((r) => setTimeout(r, 1500));
    return [shown, +document.querySelector('[data-k="size"]').value];`);
  const sewnAt = parseFloat(r[0]);
  check("Arch up keeps the size it was sewn at", /sewn/.test(r[0]) && Math.abs(r[1] - sewnAt) <= 0.5, JSON.stringify(r));
}
// ---- a duplicate made smaller to find room says so
{
  const r = await run(`await __sf.load(${JSON.stringify(design([frame({ shape: "square", w: 120, h: 70, border: "line" }), { kind: "motif", motif: "heart", size: 30, style: "fill", x: -30, y: 0, color: "#c00000" }, { kind: "motif", motif: "star", size: 30, style: "fill", x: 30, y: 0, color: "#c00000" }]))});
    document.getElementById("st-toast").hidden = true; document.querySelector('#st-pieces li[data-id] [data-op="dup"]') || 0;
    const b = document.querySelectorAll('#st-pieces [data-op="dup"]')[1]; b.click(); await new Promise((r) => setTimeout(r, 1200));
    const sizes = []; return [__sf.toast(), __sf.pieces()];`);
  check("A duplicate made smaller to find room says so (or keeps its size)", r[1] === 4 && (/the original/.test(r[0]) || /Pasted|^$/.test(r[0]) || !/mm/.test(r[0])), JSON.stringify(r));
  const sz = await run(`const p = [...document.querySelectorAll("#st-pieces li[data-id]")].length; return p;`);
  if (!/the original/.test(r[0])) {
    // (where it kept its size, it must be the size of the original)
    const k = await run(`const li = document.querySelectorAll("#st-pieces li[data-id]"); li[li.length - 2].click(); await new Promise((r) => setTimeout(r, 300)); return +document.querySelector('[data-k="size"]').value;`);
    check("A duplicate that says nothing keeps the original's size", k === 30, `${k} (${sz} pieces)`);
  }
}
// ---- Rename: a name past 60 letters
{
  const r = await run(`document.getElementById("rename-open").click(); const i = document.getElementById("rename-name"); i.value = "A very long name for a design that goes on and on past the most it takes"; i.dispatchEvent(new Event("input"));
    const t = [i.value.length, document.getElementById("rename-note").textContent]; __sf.close(); return t;`);
  check("Rename: a name past 60 letters is cut and said", r[0] === 60 && /60 letters/.test(r[1]), JSON.stringify(r));
}
// ---- Picture: a band round the edge taken as a frame
{
  await open("#picture");
  const r = await run(`const c = Object.assign(document.createElement("canvas"), { width: 400, height: 400 }), g = c.getContext("2d");
    g.fillStyle = "#c81e1e"; g.fillRect(0, 0, 400, 400); g.fillStyle = "#ffffff"; g.fillRect(28, 28, 344, 344); g.fillStyle = "#1e3cc8"; g.beginPath(); g.arc(200, 200, 110, 0, 7); g.fill();
    const blob = await new Promise((r) => c.toBlob(r, "image/png")); __sf.put("#pic-file", new Uint8Array(await blob.arrayBuffer()), "framed.png", "image/png");
    await __sf.wait(() => nwTest.view() && document.body.dataset.mode === "picture" && !document.getElementById("download").disabled, 40000);
    return { ids: nwTest.problems().map((p) => p.id), note: document.getElementById("pic-merged").hidden ? "" : document.getElementById("pic-merged").textContent };`);
  check("Picture: a frame band left out is said (problem and panel)", r.ids.includes("framed") && /frame/.test(r.note), JSON.stringify(r));
}

console.log(problems.length ? problems.map((p) => "PROBLEM " + p).join("\n") : "");
console.log(`DONE ${checks} ${problems.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
process.exit(problems.length ? 1 : 0);
