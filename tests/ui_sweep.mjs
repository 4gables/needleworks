// UI sweep: guards layout that breaks at some screen size or state, and focus/scroll/keyboard regressions (the
// category audit's classes 5 and 6: the too-big note that squeezed the phone's hoop to 35 px, the file chooser below
// the fold at 960 x 540, the 200 % zoom strip, the Download bar over warnings and toasts, 60 W's running out of their
// box, chips squeezed to "B / P", focus dropped to the page after a one-tap fix, Fit to hoop jumping 1185 px).
// It loads every tab in every state (empty, a design, too big, an error, long words, many threads, a toast, a picture,
// an opened file, every dialog, the View menu, the steps) at 12 window sizes, in light, dark and forced colours, and
// measures: sideways page scroll, text running out of its box, controls covered by something else (elementFromPoint
// at their centre, scrolled into view), what must be on screen at load (preview, Download, the file chooser), the
// hoop's drawn size, text contrast and the focus ring. The keyboard sweep Tabs through every control and presses each
// (Enter, Space, an arrow, a typed letter), asserting focus lands on a live, visible control with a ring and the page
// doesn't jump. Writes OUT/report.json, OUT/contact.html and OUT/contact.png (thumbnails with their problems).
//   needs the site served:   .venv/bin/python tests/batch_server.py out/batch 8783
//   usage: node tests/ui_sweep.mjs [--url http://127.0.0.1:8783/] [--port 9313] [--out out/ui_sweep]
//          [--quick] [--vp 390x844m,1413x717] [--only design,open-file] [--no-keys] [--keys-only]
//          [--workers 4]   (tabs side by side, each in a browser context of its own)
// Prints "DONE <shots> <problems>" and exits 1 when there are problems. Full run ~8 min (504 screens, ~200 key
// presses), --quick ~2 min. Thresholds: the hoop gets at least 200 px of preview (160 under 700 px tall, 110 on a
// phone, 100 on a phone on its side); text contrast WCAG AA; focus rings 1.5 px or more.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k) => process.argv.includes("--" + k);
const URL0 = arg("url", "http://127.0.0.1:8783/");
const PORT = +arg("port", 9313);
const OUT = path.resolve(arg("out", "out/ui_sweep"));
const QUICK = flag("quick");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });

// ---------- window sizes (m = phone or tablet: touch, phone user agent, 2x pixels) ----------
const VIEWPORTS = [
  "320x568m", "360x640m", "390x844m", "568x320m", "768x1024m", "820x1180m",
  "844x390m", "1024x600", "1280x720", "1413x717", "1920x1080", "2560x1440", "960x540z",   // z: 200 % of 1920 x 1080
].map((s) => { const [, w, h, t] = s.match(/(\d+)x(\d+)(\w?)/); return { id: s, w: +w, h: +h, mobile: t === "m", dpr: t ? 2 : 1 }; });
const SCHEMES_AT = new Set(["390x844m", "1413x717", "960x540z", "1920x1080"]);   // dark and forced colours here too
const KEYS_AT = new Set(["1413x717", "390x844m", "960x540z"]);

// ---------- test files (made here, deterministic) ----------
function png(w, h, px) {   // px(x, y) -> [r, g, b, a]
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 4 + 1) + 1 + x * 4; const c = px(x, y); raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = c[3]; }
  const crc = (b) => { let c = ~0; for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const FILES = path.join(OUT, "files"); fs.mkdirSync(FILES, { recursive: true });
fs.writeFileSync(path.join(FILES, "blank.png"), png(160, 160, () => [255, 255, 255, 255]));
fs.writeFileSync(path.join(FILES, "badge.png"), png(240, 240, (x, y) => {   // a red ring, a blue square, a gold bar
  const d = Math.hypot(x - 120, y - 120);
  if (d > 80 && d < 104) return [200, 20, 40, 255];
  if (Math.abs(x - 120) < 40 && Math.abs(y - 105) < 40) return [20, 40, 140, 255];
  if (y > 160 && y < 175 && x > 70 && x < 170) return [230, 180, 20, 255];
  return [255, 255, 255, 255];
}));
fs.writeFileSync(path.join(FILES, "junk.pes"), Buffer.from("#PES0001 this is not really a design file at all"));
const PES = fs.existsSync(path.join(ROOT, "tests/external/pes/peace.pes")) ? path.join(ROOT, "tests/external/pes/peace.pes") : path.join(ROOT, "tests/fixtures/multi.pes");

// ---------- designs for the Design tab (seeded into localStorage) ----------
const studio = (pieces, extra = {}) => ({ "nw:studio": { pieces, sel: pieces.at(-1)?.id ?? null, fabric: "cotton", baste: false, thread: "auto", fitted: false, from: "", ...extra }, "nw:studio.guideSeen": true });
const text = (id, t, o = {}) => ({ id, x: 0, y: 0, color: "#0e1f7c", kind: "text", text: t, font: "NW Great Vibes", size: 18, shape: "straight", radius: 30, ...o });
const COLOURS = ["#ed171f", "#0e1f7c", "#ffd911", "#3a8a3a", "#ff7f00", "#7f2fa0", "#00a3d9", "#222222", "#ff66aa", "#8b5a2b", "#00796b", "#c0c0c0"];
const many = COLOURS.map((c, i) => text(i + 1, String.fromCharCode(65 + i), { color: c, font: "NW Quicksand", size: 10, x: -45 + (i % 4) * 30, y: -45 + Math.floor(i / 4) * 30 }));

// ---------- states ----------
// mode: the hash; seed: localStorage; setup: after load (p = page helpers); wait: what "ready" means
const STATES = [
  { id: "design-first", hash: "design", seed: {} },
  { id: "design", hash: "design", seed: studio([{ id: 1, x: 0, y: 0, color: "#ed171f", kind: "frame", shape: "circle", w: 90, h: 90, border: "satin" }, text(2, "Emma", { y: 0 })]) },
  { id: "design-empty", hash: "design", seed: studio([]) },
  { id: "design-toobig", hash: "design", seed: studio([text(1, "W".repeat(60), { font: "NW Quicksand", size: 30 })]), keys: true },
  { id: "design-long", hash: "design", seed: studio([text(1, "Supercalifragilisticexpialidocious\nWWWWWWWWWWWWWWW", { font: "NW Quicksand", size: 6 })]), setup: async (p) => { await p.eval(`for (const d of document.querySelectorAll('#panel-design details')) d.open = true`); } },
  { id: "design-toobig-open", hash: "design", seed: studio([text(1, "W".repeat(60), { font: "NW Quicksand", size: 30 })]), setup: async (p) => { await p.eval(`for (const d of document.querySelectorAll('#panel-design details')) d.open = true`); } },
  { id: "design-threads", hash: "design", seed: studio(many) },
  { id: "design-fix", hash: "design", seed: studio([{ id: 1, x: 0, y: 0, color: "#ed171f", kind: "frame", shape: "circle", w: 90, h: 90, border: "satin" }, text(2, "Emma bbe", { size: 3 })]), keys: true },
  { id: "design-toast", hash: "design", seed: studio([text(1, "Emma"), text(2, "Liam", { y: 25 })]), setup: async (p) => { await p.click('[data-op="del"]'); }, wait: "!document.getElementById('st-toast')?.hidden", keys: true },
  { id: "design-steps", hash: "design", seed: studio([{ id: 1, x: 0, y: 0, color: "#ed171f", kind: "frame", shape: "circle", w: 90, h: 90, border: "applique" }, text(2, "Emma")]),
    setup: async (p) => { await p.eval(`(()=>{const d=document.querySelector('#panel-design details.steps');d.open=true;d.scrollIntoView({block:'start'})})()`); await p.click("#st-steps [data-step]"); } },
  { id: "design-sewn", hash: "design", seed: studio([text(1, "Emma")], { fabric: "towel" }), setup: async (p) => { await p.eval(`document.getElementById('st-sewn').open=true`); } },
  { id: "design-more", hash: "design", seed: studio([text(1, "Emma")]), setup: async (p) => { await p.eval(`(()=>{const d=document.querySelector('#st-edit details.more');if(d){d.open=true;d.scrollIntoView({block:'center'})}})()`); } },
  { id: "bookmark", hash: "bookmark", seed: { "nw:bm.name": "Ashley" }, keys: true },
  { id: "picture", hash: "picture", seed: {}, wait: "!document.getElementById('download').disabled", keys: true },
  { id: "picture-mine", hash: "picture", seed: { "nw:brand": "isacord" }, setup: async (p) => { await p.upload("#pic-file", path.join(FILES, "badge.png")); }, wait: "!document.getElementById('download').disabled && !document.getElementById('pic-thumb').hidden" },
  { id: "picture-error", hash: "picture", seed: {}, setup: async (p) => { await p.upload("#pic-file", path.join(FILES, "blank.png")); }, wait: "!document.getElementById('error').hidden" },
  { id: "open", hash: "open", seed: {} },
  { id: "open-file", hash: "open", seed: {}, setup: async (p) => { await p.upload("#open-file", PES); }, wait: "!document.getElementById('open-info').hidden", keys: true },
  { id: "open-bad", hash: "open", seed: {}, setup: async (p) => { await p.upload("#open-file", path.join(FILES, "junk.pes")); }, wait: "!document.getElementById('error').hidden" },
  { id: "dlg-done", hash: "design", seed: studio([text(1, "Emma")]), setup: async (p) => { await p.click("#download"); }, dialog: "done" },
  { id: "dlg-names", hash: "design", seed: studio([text(1, "Emma")]), setup: async (p) => { await p.click("#names-open"); await p.eval(`(()=>{const t=document.getElementById('names-list');t.value='Emma\\nLiam\\nOlivia\\nAlexandrina-Wilhelmina\\nNoah';t.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(1500); }, dialog: "names" },
  { id: "dlg-spools", hash: "design", seed: { ...studio([text(1, "Emma")]), "nw:brand": "isacord", "nw:spools": { isacord: ["0015", "1902", "3541"] } },
    setup: async (p) => { await p.eval(`(()=>{const s=document.getElementById('brand');s.value='@mine';s.dispatchEvent(new Event('change',{bubbles:true}))})()`); }, dialog: "spools" },
  { id: "dlg-along", hash: "design", seed: studio([{ id: 1, x: 0, y: 0, color: "#ed171f", kind: "frame", shape: "circle", w: 90, h: 90, border: "applique" }, text(2, "Emma")]), setup: async (p) => { await p.click("#along-open"); }, dialog: "along" },
  { id: "dlg-item", hash: "design", seed: studio([text(1, "Emma")]), setup: async (p) => { await p.click("#item-open"); }, dialog: "item", pre: async (p) => { await p.eval(`document.querySelector('details.views').open=true`); } },
  { id: "view-menu", hash: "design", seed: studio([text(1, "Emma")]), setup: async (p) => { await p.click("details.views > summary"); }, keys: true },
];
const ONLY = arg("only", "") ? new Set(arg("only").split(",")) : null;
let states = STATES.filter((s) => !ONLY || ONLY.has(s.id));
let viewports = VIEWPORTS;
if (arg("vp")) { const want = arg("vp").split(","); viewports = VIEWPORTS.filter((v) => want.includes(v.id)); }
if (QUICK) { viewports = viewports.filter((v) => ["390x844m", "1413x717", "960x540z", "568x320m"].includes(v.id)); }

// ---------- Chrome ----------
// (a headless Chrome already on the port, tests/cdp.mjs's, gets tabs of its own; otherwise one is started). Several
// tabs work side by side, each in a browser context of its own, so each has its own localStorage.
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prof = path.join(OUT, "chrome"); fs.mkdirSync(path.join(prof, "tmp"), { recursive: true });
const running = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(() => true, () => false);
const proc = running ? null : spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", `--user-data-dir=${prof}/profile`, "--no-first-run",
  "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
  "--disable-features=IntensiveWakeUpThrottling", "about:blank"], { stdio: "ignore", env: { ...process.env, TMPDIR: path.join(prof, "tmp"), MAC_CHROMIUM_TMPDIR: path.join(prof, "tmp") } });
for (let i = 0; i < 80; i++) { if (await fetch(`http://127.0.0.1:${PORT}/json/version`).then(() => true, () => false)) break; await sleep(200); }
const tabs = [];
const browserWs = new WebSocket((await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl);
await new Promise((r, j) => { browserWs.onopen = r; browserWs.onerror = j; });
let bid = 0; const bwait = new Map();
browserWs.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bwait.has(d.id)) { const { r, j } = bwait.get(d.id); bwait.delete(d.id); d.error ? j(new Error(d.error.message)) : r(d.result); } };
const browser = (method, params = {}) => new Promise((r, j) => { const i = ++bid; bwait.set(i, { r, j }); browserWs.send(JSON.stringify({ id: i, method, params })); });
const cleanup = () => { if (proc) proc.kill(); else for (const t of tabs) browser("Target.disposeBrowserContext", { browserContextId: t.ctx }).catch(() => {}); };
process.on("SIGINT", () => { cleanup(); setTimeout(() => process.exit(130), 300); });
process.on("SIGTERM", () => { cleanup(); setTimeout(() => process.exit(143), 300); });
const SETTLED = `document.body.dataset.mode && document.getElementById('busy').hidden && document.fonts.status === 'loaded'`;
let run = 0;

async function openTab(url0) {
  const { browserContextId: ctx } = await browser("Target.createBrowserContext", { disposeOnDetach: true });
  const { targetId } = await browser("Target.createTarget", { url: "about:blank", browserContextId: ctx });
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/devtools/page/${targetId}`);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let mid = 0; const waiting = new Map(); const events = [];
  const send = (method, params = {}) => new Promise((r, j) => { const i = ++mid; waiting.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiting.has(d.id)) { const { r, j } = waiting.get(d.id); waiting.delete(d.id); d.error ? j(new Error(d.error.message)) : r(d.result); }
    else if (d.method) {
      events.push(d);
      if (d.method === "Page.javascriptDialogOpening") send("Page.handleJavaScriptDialog", { accept: false }).catch(() => {});
    }
  };
  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable"); await send("Network.enable");
  // (each browser context starts with an empty cache, so files are fresh for every run; within a run they're cached:
  // four tabs loading every module each time made the test server drop requests)
  await send("Page.setInterceptFileChooserDialog", { enabled: true });
  await send("Browser.setDownloadBehavior", { behavior: "deny" }).catch(() => {});
  // no print dialog, alert, confirm or prompt can block the page; each is recorded instead
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const log = (k, m) => (window.__sweep ||= []).push([k, String(m ?? "")]);
    window.print = () => log("print"); window.alert = (m) => log("alert", m);
    window.confirm = (m) => { log("confirm", m); return false; }; window.prompt = (m) => { log("prompt", m); return null; };
    try { Object.defineProperty(navigator, "share", { value: async () => log("share"), configurable: true }); } catch {}
  })();` });
  const t = { id: targetId, ctx, url0, origin: new URL(url0).origin, send, ev, events, ws };
  t.setViewport = async (vp) => {
    await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr, mobile: vp.mobile });
    await send("Emulation.setTouchEmulationEnabled", { enabled: vp.mobile, maxTouchPoints: vp.mobile ? 5 : 1 });
    await send("Emulation.setUserAgentOverride", { userAgent: vp.mobile ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" : "" });
  };
  t.scheme = (sc) => send("Emulation.setEmulatedMedia", { features: [
    { name: "prefers-color-scheme", value: sc === "dark" ? "dark" : "light" }, { name: "forced-colors", value: sc === "forced" ? "active" : "none" },
    { name: "prefers-reduced-motion", value: "reduce" }] });
  t.until = async (expr, ms = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { if (await ev(`!!(${expr})`)) return true; } catch {} await sleep(150); }
    return false;
  };
  t.page = {   // what a state's setup can do
    eval: ev,
    async click(sel) {
      const c = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      if (!c) throw new Error("no " + sel);
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: c[0], y: c[1], button: "left", clickCount: 1 });
      await sleep(500);
    },
    async upload(sel, file) {
      const doc = await send("DOM.getDocument", {});
      const { nodeId } = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: sel });
      await send("DOM.setFileInputFiles", { nodeId, files: [file] });
      await sleep(800);
    },
  };
  t.load = async (st) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      // (the design is put in localStorage before app.js runs, by a script that runs first on this one load)
      const v = ++run;
      const { identifier } = await send("Page.addScriptToEvaluateOnNewDocument", { source: `if (location.search === "?v=${v}") { localStorage.clear(); ${Object.entries(st.seed || {}).map(([k, val]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(val))});`).join("")} }` });
      await send("Page.navigate", { url: `${url0}?v=${v}#${st.hash}` });
      await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
      // (headless sometimes doesn't start app.js, and the test server sometimes drops a request: then load again)
      if (!(await t.until(`document.body && document.body.dataset.mode && getComputedStyle(document.body).display === 'flex'`, 8000))) continue;
      await t.until(SETTLED, 20000);
      await sleep(300);
      if (st.pre) await st.pre(t.page);
      if (st.setup) await st.setup(t.page);
      if (st.wait && !(await t.until(st.wait, 30000))) return `never ready (${st.wait})`;
      await t.until(SETTLED, 20000);
      if (st.dialog && !(await t.until(`document.getElementById(${JSON.stringify(st.dialog)}).open`, 5000))) return `dialog ${st.dialog} didn't open`;
      await sleep(500);
      return null;
    }
    const why = events.filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text).slice(-1)[0];
    return "app never started" + (why ? ": " + why.slice(0, 200) : "") + " " + JSON.stringify(await ev(`[document.readyState, document.body?.dataset.mode, getComputedStyle(document.body).display, location.href]`).catch((e) => e.message));
  };
  tabs.push(t);
  return t;
}

// ---------- in-page measurement ----------
// (one function, run with the state as it is: returns problems [{kind, el, detail}] and facts)
const MEASURE = String.raw`(async (opts) => {
  const out = [], facts = {};
  const W = innerWidth, H = innerHeight;
  const desc = (e) => { if (!e || e.nodeType !== 1) return String(e);
    const t = (e.getAttribute('aria-label') || e.innerText || e.value || e.title || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : '') + (t ? ' "' + t + '"' : ''); };
  const dlg = document.querySelector('dialog[open]');
  const scope = dlg || document.body;
  // (checkVisibility: the inside of a closed <details> still has boxes, it just isn't drawn)
  const hidden = (e) => !e.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }) || e.closest('[hidden],[inert]') || (!dlg && e.closest('dialog:not([open])'));
  const opacity = (e) => { let o = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; };
  const sr = (e) => { const r = e.getBoundingClientRect(); return r.width <= 2 || r.height <= 2 || e.closest('.sr, .sr-file'); };
  const scrollers = () => [document.scrollingElement, ...document.querySelectorAll('*')].filter((n) => { const s = getComputedStyle(n); return n === document.scrollingElement || (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1)); });
  const saved = scrollers().map((n) => [n, n.scrollLeft, n.scrollTop]);
  // clipping box: the viewport cut by every overflow-clipping ancestor
  // (opts2.scrolls: scrolling boxes clip too, for what's on screen now; otherwise only boxes that cut their content off)
  const clipOf = (e, opts2 = {}) => { let r = opts2.scrolls ? { l: 0, t: 0, r: W, b: H } : { l: -1e9, t: -1e9, r: 1e9, b: 1e9 };
    for (let n = e.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n); if (s.position === 'fixed') break;
      if (!opts2.scrolls && /auto|scroll/.test(s.overflowX + s.overflowY)) break;   // (what a scrolling row holds can be scrolled to)
      if (opts2.scrolls ? s.overflowX !== 'visible' || s.overflowY !== 'visible' : /hidden|clip/.test(s.overflowX + s.overflowY)) { const b = n.getBoundingClientRect(); r = { l: Math.max(r.l, b.left), t: Math.max(r.t, b.top), r: Math.min(r.r, b.right), b: Math.min(r.b, b.bottom) }; }
    } return r; };
  // (dark and forced colours change no layout: only the colours are measured there)
  if (opts.layout) {
  // 1. sideways page scroll, and anything past the right edge that isn't inside a scrolling row
  const se = document.scrollingElement;
  if (se.scrollWidth > W + 1) out.push({ kind: 'page-overflow-x', el: 'page', detail: se.scrollWidth + ' px wide in ' + W });
  const inScroller = (e) => { for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) { const s = getComputedStyle(n); if (s.overflowX !== 'visible') return true; } return false; };
  for (const e of scope.querySelectorAll('*')) {
    if (hidden(e) || e.closest('.sr, .skips, #sheet, canvas')) continue;
    const r = e.getBoundingClientRect(); if (!r.width) continue;
    if ((r.right > W + 1 || r.left < -1) && !inScroller(e) && getComputedStyle(e).position !== 'fixed') { out.push({ kind: 'off-edge', el: desc(e), detail: Math.round(r.left) + '..' + Math.round(r.right) + ' of ' + W }); }
  }
  // 2. text running out of its box (or clipped by it)
  for (const e of scope.querySelectorAll('*')) {
    if (hidden(e) || e.closest('.sr, .skips, #sheet, option, select, textarea, script, style')) continue;
    const own = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()); if (!own.length) continue;
    const s = getComputedStyle(e); if (s.display === 'inline' || s.textOverflow === 'ellipsis' || /(auto|scroll)/.test(s.overflowX)) continue;
    const b = e.getBoundingClientRect(); const rg = document.createRange(); let tl = 1e9, tr = -1e9, tb = -1e9, tt = 1e9;
    for (const n of own) { rg.selectNodeContents(n); for (const q of rg.getClientRects()) { tl = Math.min(tl, q.left); tr = Math.max(tr, q.right); tt = Math.min(tt, q.top); tb = Math.max(tb, q.bottom); } }
    if (tr < -1e8) continue;
    const pl = parseFloat(s.borderLeftWidth), pr = parseFloat(s.borderRightWidth);
    if (tr > b.right - pr + 2 || tl < b.left + pl - 2) out.push({ kind: 'text-overflow', el: desc(e), detail: 'text ' + Math.round(tl) + '..' + Math.round(tr) + ' in box ' + Math.round(b.left) + '..' + Math.round(b.right) });
    else if (s.overflowY !== 'visible' && tb > b.bottom + 2) out.push({ kind: 'text-clipped', el: desc(e), detail: 'text to ' + Math.round(tb) + ', box to ' + Math.round(b.bottom) });
    else { const c = clipOf(e); if (tr > c.r + 2 || tl < c.l - 2) out.push({ kind: 'text-clipped', el: desc(e), detail: 'text ' + Math.round(tl) + '..' + Math.round(tr) + ' cut at ' + Math.round(c.l) + '..' + Math.round(c.r) }); }
    // squeezed: a few letters a line ("B / P" thread chips)
    const words = own.map((n) => n.textContent).join(' ').trim(), px = parseFloat(s.fontSize);
    if (words.length >= 4 && b.width < 3.5 * px) { const tops = new Set(); for (const n of own) { rg.selectNodeContents(n); for (const q of rg.getClientRects()) tops.add(Math.round(q.top)); }
      if (tops.size >= 3) out.push({ kind: 'squeezed', el: desc(e), detail: tops.size + ' lines in ' + Math.round(b.width) + ' px' }); }
  }
  // 3. at load (nothing scrolled): the preview, Download and the file chooser on screen
  if (!dlg && opts.atLoad && !document.scrollingElement.scrollTop && !document.querySelector('.controls').scrollTop) {
    const onScreen = (e, frac = 0.5) => { if (!e || hidden(e)) return null; const r = e.getBoundingClientRect(), c = clipOf(e, { scrolls: true });
      const w = Math.max(0, Math.min(r.right, c.r) - Math.max(r.left, c.l)), h = Math.max(0, Math.min(r.bottom, c.b) - Math.max(r.top, c.t));
      return w * h >= frac * r.width * r.height; };
    const need = [['#view', 0.5]];
    const mode = document.body.dataset.mode;
    if (!document.getElementById('download').disabled) need.push(['#download', 0.9]);
    // (the tab's own file chooser too, unless the screen is too short for anything but the preview: a phone on its side)
    if (mode === 'picture' && H >= 400) need.push(['#pick-picture, #pic-drop', 0.9]);
    if (mode === 'open' && H >= 400) need.push(['#pick-design, #empty button, #open-drop', 0.9]);
    // (a warning beside Download is read before the file is saved: on screen, not under the Download bar)
    // (except on a screen too short for the preview and a warning together: a landscape phone scrolls to it)
    if (!hidden(document.getElementById('dl-warn')) && H >= 560) need.push(['#dl-warn', 0.9]);
    const clear = (e) => { const r = e.getBoundingClientRect(), y = Math.min(r.bottom - 2, H - 1), h = document.elementFromPoint(r.left + r.width / 2, Math.max(0, (r.top + y) / 2)); return h && (e.contains(h) || h.contains(e) || !!h.closest('.toast')); };   // (a toast sits over the Download bar on purpose, and goes by itself)
    for (const [sel, f] of need) { const all = [...document.querySelectorAll(sel)].filter((e) => !hidden(e)); if (!all.some((e) => onScreen(e, f) && (e.id === 'view' || clear(e)))) out.push({ kind: 'below-fold', el: sel, detail: all.length ? (onScreen(all[0], f) ? 'covered by ' + desc(document.elementFromPoint(all[0].getBoundingClientRect().left + all[0].getBoundingClientRect().width / 2, all[0].getBoundingClientRect().top + 4)) : 'at ' + Math.round(all[0].getBoundingClientRect().top) + ' of ' + H) : 'not shown' }); }
  }
  // 4. the preview: the hoop as drawn, the canvas
  const cv = document.getElementById('view').getBoundingClientRect();
  // (the room the preview has for the hoop, px along its longer side, whatever the design's size: as draw() fits
  // it, below the chips and above a message over the preview)
  const { MACHINES } = await import(new URL('js/core/machines.js', document.baseURI));
  const hs = MACHINES[document.getElementById('machine').value]?.hoops[document.getElementById('hoop').value];
  let [hw, hh] = hs ? [hs.w, hs.h] : [130, 180]; if (document.getElementById('turn').getAttribute('aria-pressed') === 'true') [hw, hh] = [hh, hw];
  const er = document.getElementById('error'), top = document.getElementById('facts').offsetHeight + 16, bot = er.hidden ? 24 : er.offsetHeight + 28;
  facts.canvas = [Math.round(cv.width), Math.round(cv.height)];
  facts.hoop = cv.width ? Math.round(Math.max(0, Math.min((cv.width - 48) / hw, (cv.height - top - bot) / hh)) * Math.max(hw, hh)) : 0;
  if (!dlg && facts.hoop && facts.hoop < opts.minHoop) out.push({ kind: 'small-hoop', el: '#view', detail: 'hoop ' + facts.hoop + ' px across (canvas ' + facts.canvas.join(' x ') + ')' });
  // 5. controls covered by something else, once scrolled into view (or that can't be scrolled into view)
  const CONTROLS = 'button, a[href], input:not([type=hidden]), select, textarea, summary, label.pick, label.drop, label.st-load, label.item-pick, [role=button], [tabindex="0"]';
  const ctl = [...scope.querySelectorAll(CONTROLS)].filter((e) => !hidden(e) && !(e.matches('input') && sr(e)) && !e.closest('.skips, .sr') && !(e.disabled && e.matches('button')) && e.id !== 'view');
  facts.controls = ctl.length;
  for (const e of ctl) {
    e.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = e.getBoundingClientRect(), c = clipOf(e, { scrolls: true });
    const x0 = Math.max(r.left, c.l, 0), x1 = Math.min(r.right, c.r, W), y0 = Math.max(r.top, c.t, 0), y1 = Math.min(r.bottom, c.b, H);
    if (x1 - x0 < Math.min(8, r.width / 2) || y1 - y0 < Math.min(8, r.height / 2)) { out.push({ kind: 'unreachable', el: desc(e), detail: 'can\'t be scrolled into view (' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',') + ')' }); continue; }
    const x = (x0 + x1) / 2, y = (y0 + y1) / 2, hit = document.elementFromPoint(x, y);
    if (!hit) continue;
    const lab = hit.closest('label');
    if (hit === e || e.contains(hit) || (lab && (lab === e || lab.control === e || lab.contains(e))) || (hit.contains(e) && getComputedStyle(e).pointerEvents === 'none')) continue;
    if (hit.closest('.toast, .views-menu')) continue;   // (a toast sits over the Download bar on purpose, for a few seconds; an open menu over what's under it)
    out.push({ kind: 'covered', el: desc(e), detail: 'under ' + desc(hit) + ' at ' + Math.round(x) + ',' + Math.round(y) });
  }
  // messages (warnings, errors, toasts) never sit under something else once scrolled to
  for (const e of scope.querySelectorAll('[role=status], [role=alert], .toast, .dl-warn, .warn, .fine-warn')) {
    if (hidden(e) || !e.textContent.trim() || e.closest('.sr')) continue;
    e.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = e.getBoundingClientRect(), c = clipOf(e, { scrolls: true });
    const x = (Math.max(r.left, c.l) + Math.min(r.right, c.r)) / 2, y = (Math.max(r.top, c.t, 0) + Math.min(r.bottom, c.b, H)) / 2;
    const hit = document.elementFromPoint(x, y);
    if (hit && !(e.contains(hit) || hit.contains(e)) && !(hit.closest('.toast') && !e.closest('.toast'))) out.push({ kind: 'message-covered', el: desc(e), detail: 'under ' + desc(hit) });
  }
  for (const [n, l, t] of saved) { n.scrollLeft = l; n.scrollTop = t; }
  }
  // 6. text contrast (WCAG AA: 4.5, 3 for large text) against the backgrounds behind it
  const rgba = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v[3] ?? 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const over = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const bgOf = (e) => { const stack = [];
    for (let n = e; n; n = n.parentElement) { const s = getComputedStyle(n);
      if (s.backgroundImage !== 'none' && !/gradient/.test(s.backgroundImage)) return null;
      if (n.tagName === 'CANVAS') return null;
      const c = rgba(s.backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; }
      if (n.tagName === 'DIALOG') { if (!stack.length || stack.at(-1)[3] < 1) stack.push(rgba(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1]); break; } }
    let bg = [255, 255, 255, 1]; for (const c of stack.reverse()) bg = over(c, bg); return bg; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  if (!opts.forced) for (const e of scope.querySelectorAll('*')) {
    if (hidden(e) || e.closest('.sr, .skips, #sheet, option, script, style, [aria-hidden=true]')) continue;
    if (![...e.childNodes].some((n) => n.nodeType === 3 && /[A-Za-z0-9]/.test(n.textContent))) continue;
    if (e.closest(':disabled, [aria-disabled=true]')) continue;
    const s = getComputedStyle(e), fg = rgba(s.color), bg = bgOf(e); if (!fg || !bg) continue;
    const o = opacity(e); const col = over([fg[0], fg[1], fg[2], fg[3] * o], bg);
    const px = parseFloat(s.fontSize), big = px >= 24 || (px >= 18.66 && +s.fontWeight >= 700);
    const r = ratio(col, bg), need = big ? 3 : 4.5;
    if (r < need - 0.05) out.push({ kind: 'contrast', el: desc(e), detail: r.toFixed(2) + ':1, needs ' + need + ' (' + s.color + ' on rgb(' + bg.slice(0, 3).map(Math.round).join(',') + '))' });
  }
  return { out, facts };
})`;

// ---------- keyboard ----------
const KEYS = { Enter: [13, "\r"], Tab: [9, ""], Escape: [27, ""], " ": [32, " "], ArrowRight: [39, ""], ArrowDown: [40, ""] };
async function key(t, name, shift = false) {
  const [code, text] = KEYS[name];
  const base = { key: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: shift ? 8 : 0, code: name === " " ? "Space" : name };
  await t.send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", text, ...base });
  await t.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}
// where focus is: a path to find the element again, and whether it can be seen with a ring
const FOCUS = String.raw`(() => {
  const e = document.activeElement; const W = innerWidth, H = innerHeight;
  const sy = [document.scrollingElement.scrollTop, ...[...document.querySelectorAll('.controls, dialog[open], .along-body')].map((n) => n.scrollTop)];
  const where = { dialog: document.querySelector('dialog[open]')?.id || '', mode: document.body.dataset.mode, pieces: document.querySelectorAll('#st-pieces > li').length, hash: location.hash };
  if (!e || e === document.body || e === document.documentElement) return { none: true, sy, ...where };
  const path = (n) => { if (n.id) return '#' + CSS.escape(n.id); const d = [...n.attributes].filter((a) => a.name.startsWith('data-')).map((a) => '[' + a.name + '="' + CSS.escape(a.value) + '"]').join('');
    if (d && document.querySelectorAll(n.tagName.toLowerCase() + d).length === 1) return n.tagName.toLowerCase() + d;
    const p = n.parentElement; const i = [...p.children].filter((c) => c.tagName === n.tagName).indexOf(n) + 1; return path(p) + ' > ' + n.tagName.toLowerCase() + ':nth-of-type(' + i + ')'; };
  const t = (e.getAttribute('aria-label') || e.innerText || e.value || e.title || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const d = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.type && e.tagName === 'INPUT' ? '[' + e.type + ']' : '') + (t ? ' "' + t + '"' : '');
  // the element that shows the ring: a visually hidden file input's label
  const show = e.matches('.sr-file') ? (e.closest('label') || document.querySelector('label[for="' + e.id + '"]')) : e;
  const r = show.getBoundingClientRect(), s = getComputedStyle(show);
  const visible = r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !show.closest('[hidden]');
  let clip = { l: 0, t: 0, r: W, b: H };
  for (let n = show.parentElement; n && n !== document.documentElement; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.position === 'fixed') break; if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const b = n.getBoundingClientRect(); clip = { l: Math.max(clip.l, b.left), t: Math.max(clip.t, b.top), r: Math.min(clip.r, b.right), b: Math.min(clip.b, b.bottom) }; } }
  const x0 = Math.max(r.left, clip.l), x1 = Math.min(r.right, clip.r), y0 = Math.max(r.top, clip.t), y1 = Math.min(r.bottom, clip.b);
  const seen = x1 - x0 >= Math.min(8, r.width * 0.5) && y1 - y0 >= Math.min(8, r.height * 0.5);
  let hit = seen ? document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2) : null;
  const lab = hit && hit.closest('label');
  const covered = seen && hit && e.id !== 'view' && !(hit === show || show.contains(hit) || hit.contains(show) || (lab && (lab === show || lab.control === e)));
  const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 1.5) || (s.boxShadow !== 'none' && /\d+px \d+px 0px [1-9]/.test(s.boxShadow.replace(/rgba?\([^)]*\)/g, '')));
  const menu = [...document.querySelectorAll('details[open].views')].some((m) => !m.contains(e));
  return { menu, path: path(e), desc: d, tag: e.tagName, type: e.type || '', role: e.getAttribute('role') || '', href: e.getAttribute('href') || '', visible, seen, covered: covered ? (hit.id ? hit.tagName.toLowerCase() + '#' + hit.id : hit.tagName.toLowerCase() + '.' + [...hit.classList].join('.')) : '', ring, sy, ...where };
})()`;

async function keyboard(t, vp, st, problems) {
  const { ev, send, events } = t;
  const add = (kind, el, detail) => problems.push({ vp: vp.id, scheme: "light", state: st.id, kind, el, detail });
  let err = await t.load(st); if (err) { add("state", st.id, err); return 0; }
  // every note goes by itself (round 10: "Couldn't open the share sheet" stayed in the preview's message box for
  // minutes): the Undo toast, then a failed share, each gone within 15 s, and the message box left empty
  if (st.id === "design-toast") {
    const goes = async (what) => {
      for (let i = 0; i < 75; i++) { if (await ev("!!document.getElementById('st-toast')?.hidden")) return; await sleep(200); }
      add("toast-stays", "#st-toast", `${what}: still showing after 15 s`);
    };
    await goes("Removed … Undo");
    await ev(`(()=>{Object.defineProperty(navigator,"share",{value:()=>Promise.reject(new Error("no share sheet")),configurable:true});const b=document.getElementById('share');b.hidden=false;b.click();return 1})()`);
    let said = false;
    for (let i = 0; i < 20 && !said; i++) { await sleep(100); said = await ev("!document.getElementById('st-toast').hidden"); }
    if (!said) add("toast-missing", "#share", "a failed share said nothing in a toast");
    if (await ev("!document.getElementById('error').hidden")) add("toast-stays", "#error", "a failed share was said in the preview's message box, which stays");
    await goes("failed share");
    return 2;
  }
  await ev(`document.activeElement?.blur(); window.scrollTo(0, 0)`);
  // 1. Tab through every stop
  const stops = []; let first = null;
  for (let i = 0; i < 220; i++) {
    await key(t, "Tab"); await sleep(60);
    const f = await ev(FOCUS);
    if (f.none) { if (i > 0) break; continue; }
    if (first && f.path === first) break;
    first ||= f.path;
    stops.push(f);
    if (!f.visible) add("focus-invisible", f.desc, "Tab stop " + (i + 1) + " has no size or is hidden");
    else if (!f.seen) add("focus-offscreen", f.desc, "Tab stop " + (i + 1) + " is out of view after the browser scrolled to it");
    else if (f.covered) add("focus-covered", f.desc, "Tab stop " + (i + 1) + " is under " + f.covered);
    if (f.visible && !f.ring) add("no-ring", f.desc, "no visible focus ring");
    if (f.menu && !stops.some((g, k) => g.menu && k < stops.length - 1)) add("menu-left-open", f.desc, "Tab stop " + (i + 1) + ": the View menu is still open with focus outside it");
  }
  // the ways in and out of each tab are all reached by Tab (hidden file inputs once weren't)
  const mode = await ev("document.body.dataset.mode");
  const need = [...({ picture: ["#pic-file"], open: ["#open-file"], design: ["#st-load"] }[mode] || []), ...((await ev("!document.getElementById('download').disabled")) ? ["#download"] : [])];
  for (const sel of need) if (!stops.some((f) => f.path === sel)) add("not-tabbable", sel, "never reached by Tab");
  // a list in the View menu (Background) keeps the menu open and focus on it while the arrow keys step through its
  // choices (each change shut the menu and sent focus to View)
  if (st.id === "view-menu") {
    const r = await ev(`(()=>{const v=document.querySelector('details.views');v.open=true;const s=v.querySelector('select');if(!s)return '';s.focus();s.selectedIndex=(s.selectedIndex+1)%s.options.length;s.dispatchEvent(new Event('change',{bubbles:true}));
      return v.open&&document.activeElement===s?'':'menu '+(v.open?'open':'shut')+', focus on '+(document.activeElement.id||document.activeElement.tagName)})()`);
    if (r) add("focus-lost", "#show-bg", "changing the Background: " + r);
    // (round 10: each tick shut the menu, so trying Hoop, Thickness and Realistic thread took a menu trip each) a tick
    // by Space keeps the menu open with focus on it; Escape then shuts it and focus goes back to View
    for (const id of await ev(`[...document.querySelectorAll('details.views input[type=checkbox]')].map((c)=>c.id)`)) {
      await ev(`(()=>{document.querySelector('details.views').open=true;document.getElementById(${JSON.stringify(id)}).focus();return 1})()`);
      await key(t, " "); await sleep(150);
      const r2 = await ev(`(()=>{const v=document.querySelector('details.views');return v.open&&document.activeElement.id===${JSON.stringify(id)}?'':'menu '+(v.open?'open':'shut')+', focus on '+(document.activeElement.id||document.activeElement.tagName)})()`);
      if (r2) add("menu-shut", "#" + id, "ticking it: " + r2);
      await key(t, " "); await sleep(150);
    }
    await key(t, "Escape"); await sleep(150);
    const r3 = await ev(`(()=>{const v=document.querySelector('details.views');return !v.open&&document.activeElement===v.querySelector('summary')?'':'menu '+(v.open?'open':'shut')+', focus on '+(document.activeElement.id||document.activeElement.tagName)})()`);
    if (r3) add("menu-left-open", "details.views", "Escape: " + r3);
    await t.load(st);
  }
  // 2. press each one, the way a keyboard user would
  let n = 0;
  for (const s of stops) {
    if (/^https?:/.test(s.href) && !s.href.startsWith(t.origin)) continue;
    if (s.tag === "SELECT") continue;   // (a select's arrow keys change the machine or hoop: covered elsewhere)
    // (each control remembers where it stood on the page and what came after it, to tell afterwards whether focus
    // went back up the page: what followed it moving up into its place is fine)
    const there = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(s.path)});if(!e||!e.getClientRects().length)return false;e.focus();
      const y=(n)=>{let t=n.getBoundingClientRect().top;for(let p=n.parentElement;p;p=p.parentElement)t+=p.scrollTop;return t};window.__y=y;const all=[...document.querySelectorAll('button,input,select,textarea,summary,a[href],[tabindex="0"]')];window.__was={e,top:y(e),next:all.slice(all.indexOf(e)+1).filter((n)=>!e.contains(n))};return document.activeElement===e})()`).catch(() => false);
    if (!there) continue;
    const before = await ev(FOCUS), pick = await ev("!!document.activeElement?.matches('#st-pieces .pick')");
    const isText = s.tag === "TEXTAREA" || (s.tag === "INPUT" && /^(text|search|number|)$/.test(s.type));
    let how;
    if (isText) { how = "typed"; await send("Input.insertText", { text: s.type === "number" ? "5" : "a" }); }
    else if (s.type === "checkbox" || s.type === "radio") { how = "Space"; await key(t, " "); }
    else if (s.type === "range" || s.tag === "CANVAS") { how = "ArrowRight"; await key(t, "ArrowRight"); }
    else { how = "Enter"; await key(t, "Enter"); }
    n++;
    await sleep(650);
    const after = await ev(FOCUS);
    const chooser = events.splice(0).some((e) => e.method === "Page.fileChooserOpened");
    const what = `${how} on ${s.desc}`;
    if (after.none) add("focus-lost", s.desc, `${what}: focus went to the page`);
    else if (!after.visible) add("focus-lost", s.desc, `${what}: focus went to hidden ${after.desc}`);
    else if (!after.seen) add("focus-offscreen", s.desc, `${what}: focus on ${after.desc}, out of view`);
    else if (after.covered) add("focus-covered", s.desc, `${what}: focus on ${after.desc}, under ${after.covered}`);
    if (isText && after.path !== before.path) add("focus-moved", s.desc, `typing moved focus to ${after.desc}`);
    // a control redrawn away hands focus to what stands in its place or after it, never back up the page (a one-tap
    // fix sent it to the Words box at the top of the editor, a turn fix to "Centre it"); a menu shut by its item hands
    // it to the menu's own button
    const back = await ev(`(()=>{const w=window.__was,a=document.activeElement;if(!w||!a||a===document.body||a===w.e||(w.e.isConnected&&w.e.getClientRects().length))return '';
      if(a.tagName==='SUMMARY'&&a.parentElement.contains(w.e))return '';
      const nx=w.next.find((n)=>n.isConnected&&n.getClientRects().length);if(nx&&(a===nx||nx.compareDocumentPosition(a)&Node.DOCUMENT_POSITION_FOLLOWING))return '';
      return window.__y(a)<w.top-30?'went back up the page to '+(a.id||a.getAttribute('aria-label')||a.innerText||a.value||a.tagName).trim().slice(0,40):''})()`).catch(() => "");

    if (back && after.path !== before.path && !after.dialog && after.mode === before.mode && after.hash === before.hash && after.pieces === before.pieces) add("focus-back", s.desc, `${what}: the control went and focus ${back}`);
    const moved = after.sy.reduce((a, v, i) => a + Math.abs(v - (before.sy[i] || 0)), 0);
    const ctx = after.dialog !== before.dialog || after.mode !== before.mode || after.hash !== before.hash || chooser || /^#/.test(s.href) || s.role === "tab";
    // (picking a piece in the list brings its controls up into view, the list row kept on screen: they opened ~800 px
    // down at 1413 x 717 and nothing seemed to happen)
    const picked = pick && after.path === s.path && after.seen;
    if (!ctx && !picked && moved > Math.max(240, vp.h * 0.6)) add("scroll-jump", s.desc, `${what}: scrolled ${Math.round(moved)} px, focus on ${after.desc || "page"}`);
    // put things back: close a dialog (focus must come back), reload when the design or tab changed
    if (after.dialog) {
      await key(t, "Escape"); await sleep(400);
      const back = await ev(FOCUS);
      if (back.none) add("focus-lost", s.desc, `Escape from the ${after.dialog} dialog: focus went to the page`);
    }
    const now = await ev(FOCUS);
    if (now.mode !== stops[0].mode || now.pieces !== stops[0].pieces || now.hash !== stops[0].hash || (await ev("!!document.querySelector('dialog[open]')"))) {
      err = await t.load(st); if (err) { add("state", st.id, err); return n; }
    }
  }
  return n;
}

// ---------- run ----------
const problems = [], shots = [];
const t0 = Date.now();
const keysOnly = flag("keys-only");
async function look(t, vp, st) {
  await t.scheme("light");
  const err = await t.load(st);
  if (err) { problems.push({ vp: vp.id, scheme: "light", state: st.id, kind: "state", el: st.id, detail: err }); return; }
  for (const sc of SCHEMES_AT.has(vp.id) ? ["light", "dark", "forced"] : ["light"]) {
    await t.scheme(sc); await sleep(sc === "light" ? 0 : 250);
    const atLoad = sc === "light";   // (and nothing scrolled: the first view of the state)
    let r;
    try { r = await t.ev(`${MEASURE}(${JSON.stringify({ atLoad, layout: sc === "light", minHoop: vp.h < 400 ? 100 : vp.w < 400 ? 110 : vp.h < 700 ? 160 : 200, forced: sc === "forced" })})`); }
    catch (e) { problems.push({ vp: vp.id, scheme: sc, state: st.id, kind: "state", el: st.id, detail: "measure: " + e.message }); continue; }
    const mine = r.out.map((p) => ({ vp: vp.id, scheme: sc, state: st.id, ...p }));
    problems.push(...mine);
    const file = `shots/${vp.id}_${st.id}_${sc}.jpg`;
    const shot = await t.send("Page.captureScreenshot", { format: "jpeg", quality: 60, ...(vp.dpr > 1 ? { clip: { x: 0, y: 0, width: vp.w, height: vp.h, scale: 1 / vp.dpr } } : {}) });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(shot.data, "base64"));
    shots.push({ vp: vp.id, w: vp.w, h: vp.h, state: st.id, scheme: sc, file, facts: r.facts, problems: mine.length });
  }
}
const jobs = [];
if (!keysOnly) for (const vp of viewports) for (const st of states) jobs.push({ vp, st });
if (!flag("no-keys")) for (const vp of viewports.filter((v) => KEYS_AT.has(v.id)))
  for (const st of states.filter((s) => s.keys || s.id === "design" || s.id === "design-first")) if (!QUICK || vp.id === "1413x717" || st.id === "design") jobs.push({ vp, st, keys: true });
let pressed = 0, done = 0;
const workers = await Promise.all(Array.from({ length: +arg("workers", 4) }, () => openTab(URL0)));
await Promise.all(workers.map(async (t) => {
  for (let j; (j = jobs.shift());) {
    await t.setViewport(j.vp);
    try {
      if (j.keys) { await t.scheme("light"); pressed += await keyboard(t, j.vp, j.st, problems); }
      else await look(t, j.vp, j.st);
    } catch (e) { problems.push({ vp: j.vp.id, scheme: "light", state: j.st.id, kind: "state", el: j.st.id, detail: "sweep: " + e.message }); }
    process.stdout.write(`\r${++done} ${j.keys ? "keys " : ""}${j.vp.id} ${j.st.id}                    `);
  }
}));
process.stdout.write("\n");

// ---------- report ----------
// (the same problem in the light, dark and forced runs counts once per kind/element/state)
const seen = new Set(), unique = [];
for (const p of problems) { const k = [p.vp, p.state, p.kind, p.el].join("|"); if (!seen.has(k)) { seen.add(k); unique.push(p); } }
const byKind = {}; for (const p of unique) byKind[p.kind] = (byKind[p.kind] || 0) + 1;
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ url: URL0, ran: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), keysPressed: pressed, byKind, problems: unique, shots }, null, 1));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const groups = {}; for (const s of shots) (groups[s.vp] ||= []).push(s);
const html = `<!doctype html><meta charset="utf-8"><title>UI sweep</title><style>body{font:12px system-ui;margin:12px;background:#fff;color:#111}
h2{font-size:14px;margin:18px 0 6px}.row{display:flex;flex-wrap:wrap;gap:8px}figure{margin:0;width:200px}img{width:200px;height:auto;border:1px solid #ccc;background:#eee}
figcaption{font-size:11px;line-height:1.25}figcaption b{color:#b00}ul{margin:2px 0 0;padding-left:14px;color:#b00;font-size:10px}</style>
<h1 style="font-size:16px">UI sweep: ${shots.length} screens, ${unique.length} problems ${esc(JSON.stringify(byKind))}</h1>
${Object.entries(groups).map(([vp, list]) => `<h2>${vp}</h2><div class="row">${list.map((s) => {
  const ps = unique.filter((p) => p.vp === s.vp && p.state === s.state && p.scheme === s.scheme);
  return `<figure><img src="${s.file}" loading="lazy"><figcaption>${esc(s.state)} · ${s.scheme}${s.facts.hoop ? ` · hoop ${s.facts.hoop} px` : ""}${ps.length ? ` <b>${ps.length}</b><ul>${ps.slice(0, 4).map((p) => `<li>${esc(p.kind)}: ${esc(p.el)}</li>`).join("")}</ul>` : ""}</figcaption></figure>`;
}).join("")}</div>`).join("")}
${unique.filter((p) => !shots.some((s) => s.vp === p.vp && s.state === p.state && s.scheme === p.scheme)).length ? `<h2>Keyboard</h2><ul>${unique.filter((p) => /focus|ring|scroll|state/.test(p.kind)).map((p) => `<li>${esc(p.vp)} ${esc(p.state)} ${esc(p.kind)}: ${esc(p.el)}: ${esc(p.detail)}</li>`).join("")}</ul>` : ""}`;
fs.writeFileSync(path.join(OUT, "contact.html"), html);
if (shots.length) {
  const { send, ev } = workers[0];
  await send("Emulation.setDeviceMetricsOverride", { width: 1700, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await workers[0].scheme("light");
  await send("Page.navigate", { url: "file://" + path.join(OUT, "contact.html") }).catch(() => {});
  await sleep(1500);
  await ev(`Promise.all([...document.images].map((i)=>{i.loading='eager';return i.complete?0:new Promise((r)=>{i.onload=i.onerror=r})}))`).catch(() => {});
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }).catch(() => null);
  if (shot) fs.writeFileSync(path.join(OUT, "contact.png"), Buffer.from(shot.data, "base64"));
}
for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(5)} ${k}`);
for (const p of unique.slice(0, 60)) console.log(`  ${p.vp} ${p.scheme} ${p.state} ${p.kind}: ${p.el}: ${p.detail}`);
if (unique.length > 60) console.log(`  ... ${unique.length - 60} more in ${path.join(OUT, "report.json")}`);
console.log(`DONE ${shots.length} ${unique.length}  (${Math.round((Date.now() - t0) / 1000)} s, ${pressed} keys pressed; ${path.join(OUT, "contact.html")})`);
for (const t of workers) t.ws.close();
cleanup(); await sleep(300); browserWs.close();
process.exit(unique.length ? 1 : 0);
