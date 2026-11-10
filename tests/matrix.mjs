// Class guarded: features that each work alone but not together (rounds 9-11: a ganged key fob's monogram, a turned
// cut file sideways, a names batch past Download's block, two hoopings' files named after the second half, a towel
// fix that closed letters up). Every project kind is made with every modifier, then taken out through every exit, and
// the exits must agree:
//   modifiers  none, turned, ganged (Make another), two hoopings, towel, knit, owned spools, 4x4, renamed
//   kinds      lettering, monogram, appliqué frame, in-the-hoop, patch, quilt, picture (a file piece)
//   exits      Download, cut files, sew sheet, Sew along, share text, One for each name
//   invariants a design too big for the hoop lets nothing out; Download hands over one file named as its button says,
//              that passes the gate (validatePES + the machine's hard rules) and fits the hoop (each hooping's file
//              in the ZIP for two hoopings); steps: the count and each step's thread agree on the steps list, Sew
//              along, the sew sheet and the share text; cut files pass the gate (page = shapes = name); the names
//              ZIP holds one passing file per name made, each named for its name; every piece has stitches in the
//              design or a problem said about it (nothing silently dropped).
// A modifier that can't apply to a kind (Make another on a lettering design) is skipped and counted.
// usage: node tests/cdp.mjs PORT start DIR; serve the site (tests/batch_server.py out/batch HTTP); then
//        node tests/matrix.mjs PORT http://127.0.0.1:HTTP [--only kind,kind] [--mods mod,mod]   (~10 min)
const [port, base, ...rest] = process.argv.slice(2);
if (!port || !base) { console.log("usage: node tests/matrix.mjs CDP_PORT BASE_URL [--only kinds] [--mods modifiers]"); process.exit(2); }
const opt = (k) => { const i = rest.indexOf("--" + k); return i < 0 ? null : rest[i + 1].split(","); };
const ctl = `http://127.0.0.1:${+port + 100}/`;
const call = async (cmd, ...args) => (await (await fetch(ctl, { method: "POST", body: JSON.stringify({ cmd, args }) })).text()).trim();
const ev = async (js) => { const t = await call("eval", js); if (t.startsWith("ERROR")) throw new Error(t); return t === "undefined" || t === "" ? undefined : JSON.parse(t); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0, skipped = 0; const problems = [];
const check = (what, ok, detail = "") => { checks++; if (!ok) problems.push(`${what}${detail ? `: ${detail}` : ""}`); };

async function fresh(spools = false) {
  for (let i = 0; i < 8; i++) {
    await call("goto", `${base}/manifest.webmanifest?v=${Date.now()}`).catch(() => {});
    await ev(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("nw:")) localStorage.removeItem(k);
      for (const [k, v] of Object.entries({ doneSeen: true, "studio.guideSeen": true, "studio.applSeen": true, ...(${spools} ? { brand: "isacord", spools: { isacord: ["0015", "0020", "1902", "3810", "3711", "1755", "2702", "0700", "5233"] } } : {}) })) localStorage.setItem("nw:" + k, JSON.stringify(v)); return 1; })()`).catch(() => {});
    await call("goto", `${base}/?v=m${Date.now()}${i}#design`);
    for (let k = 0; k < 30; k++) { await sleep(300); if (await ev("document.body.dataset.mode ? 1 : 0").catch(() => 0)) { await run(`await __m.settle(2500);`); return; } }
  }
  throw new Error("the page didn't start");
}
// in-page: files handed out (gate.js clicks an <a download> on a blob URL), waiting, and the checks of each exit
const H = `(() => { if (window.__m) return; const $ = (id) => document.getElementById(id);
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
const run = async (js) => { await ev(H); return ev(`(async () => { ${js} })()`); };

const KINDS = { lettering: "words", monogram: "monogram", applique: "applique", ith: "keyfob", patch: "patch", quilt: "quiltblock", picture: null };
const MODS = ["none", "turned", "ganged", "two", "towel", "knit", "owned", "4x4", "renamed"];
const kinds = opt("only") || Object.keys(KINDS), mods = opt("mods") || MODS;
let picture = null;   // (the Picture tab's sample as a design, made once and opened as a saved design after)

// the kind made, in a fresh profile
async function make(kind, mod) {
  await fresh(mod === "owned");
  if (kind !== "picture") return run(`document.querySelector('[data-start="${KINDS[kind]}"]').click(); await __m.settle(); return 1;`);
  if (!picture) picture = await run(`location.hash = "#picture"; await __m.wait(() => document.body.dataset.mode === "picture" && !document.getElementById("pic-use").hidden && !document.getElementById("download").disabled, 90000);
    document.getElementById("pic-new").click(); await __m.settle(2500); const s = JSON.parse(localStorage.getItem("nw:studio")); return JSON.stringify({ needleworks: 1, pieces: s.pieces });`);
  else await run(`__m.put("#st-load", ${JSON.stringify(picture)}, "sample-flower.needleworks.json"); await __m.settle(2500); return 1;`);
}
// the modifier; false when it can't apply to this kind
async function modify(mod) {
  switch (mod) {
    case "none": return true;
    // (spools listed before the page opened: the steps then name them)
    case "owned": return run(`return /Isacord/.test(document.getElementById("st-steps").textContent);`);
    case "turned": return run(`const t = document.getElementById("turn"); if (t.getAttribute("aria-pressed") !== "true") t.click(); await __m.settle(); return t.getAttribute("aria-pressed") === "true";`);
    case "towel": case "knit": return run(`document.querySelector('#st-fabric [data-fab="${mod}"]').click(); await __m.settle(); return true;`);
    case "renamed": return run(`document.getElementById("rename-open").click(); document.getElementById("rename-name").value = "Mom’s gift #2"; document.getElementById("rename-save").click(); await __m.settle(); return true;`);
    case "4x4": return run(`const h = document.getElementById("hoop"); h.value = "4x4"; h.dispatchEvent(new Event("change")); await __m.settle(); return true;`);
    case "ganged": return run(`const s = JSON.parse(localStorage.getItem("nw:studio")), f = s.pieces.find((p) => p.kind === "frame" && (p.border === "ith" || p.border === "zip")); if (!f) return false;
      document.querySelector('#st-pieces .pick[data-id="' + f.id + '"]').click(); await __m.settle(500); const b = document.querySelector("#st-edit [data-two-up]"); if (!b) return false;
      b.click(); await __m.settle(); const t = document.querySelector("#st-toast:not([hidden]) button"); if (t && /Make them|Turn/.test(t.textContent)) { t.click(); await __m.settle(); }
      return JSON.parse(localStorage.getItem("nw:studio")).pieces.filter((p) => p.kind === "frame" && p.border === f.border).length > 1;`);
    case "two": return run(`// (the whole design copied and pasted beside itself, "Paste anyway" (or the 4x4), then "Sew it in two hoopings")
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
  const r = await run(`
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

const t0 = Date.now();
for (const kind of kinds) for (const mod of mods) {
  const tag = `${kind} + ${mod}`;
  try {
    await make(kind, mod);
    if (!(await modify(mod))) { skipped++; console.log(`${tag}: n/a`); continue; }
    let r = await exits(tag);
    // too big (the 4x4, a turn): nothing let out, then Fit to hoop and every exit again
    if (r.blocked) { await run(`document.getElementById("st-fit").click(); await __m.settle(); return 1;`); r = await exits(tag + " (fitted)"); if (r.blocked) check(`${tag}: still blocked after Fit to hoop (${r.dl})`, false); }
    console.log(`${tag}: ${r.file || r.dl}, ${r.steps ?? "-"} steps${r.names != null ? `, ${r.names} names` : ""}`);
  } catch (e) { check(`${tag}: ${String(e.message || e).slice(0, 300)}`, false); }
}
for (const p of problems) console.log("FAIL " + p);
console.log(`matrix: ${Math.round((Date.now() - t0) / 1000)} s, ${skipped} combinations n/a`);
console.log(`DONE ${checks} ${problems.length}`);
process.exit(problems.length ? 1 : 0);
