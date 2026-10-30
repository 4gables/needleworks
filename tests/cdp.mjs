// Tiny CDP driver for headless Chrome user testing.
// usage: node tests/cdp.mjs PORT CMD [args...]   (persona user tests: one headless Chrome per tester, held by a small daemon on PORT+100 so emulation sticks)
//   start [dir]            launch headless Chrome on PORT (profile + downloads in dir)
//   stop                   kill it
//   viewport W H [mobile]  set size (mobile = touch + phone UA)
//   goto URL               navigate and wait for load
//   shot FILE              screenshot (PNG)
//   click X Y | tap X Y    mouse click / touch tap at CSS px
//   clicksel CSS           click centre of first match
//   drag X1 Y1 X2 Y2
//   type TEXT              insert text into focused element
//   key NAME [mods]        Enter, Tab, Backspace, ArrowLeft, Escape, a ... ; mods: shift,ctrl,meta,alt (comma list)
//   upload CSS FILE...     set files on an <input type=file>
//   eval JS                evaluate (awaits promises), prints JSON
//   text                   document.body.innerText
//   els                    visible buttons/inputs/links with centre coords
//   dark on|off            emulate prefers-color-scheme
//   offline on|off
//   console                console messages + uncaught exceptions since the last call
//   reload                 hard reload
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [port, cmd, ...args] = process.argv.slice(2);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctl = `http://127.0.0.1:${+port + 100}/`;

if (cmd === "start") {
  const dir = path.resolve(args[0] || `/tmp/cdp-${port}`);
  fs.mkdirSync(path.join(dir, "downloads"), { recursive: true });
  fs.mkdirSync(path.join(dir, "tmp"), { recursive: true });
  spawn(CHROME, [`--remote-debugging-port=${port}`, "--headless=new", `--user-data-dir=${dir}/profile`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
    // (headless pages count as hidden: without these a 300 ms timer took ~57 s and debounced UI looked hung)
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-features=IntensiveWakeUpThrottling", "about:blank"],
    // (Chrome's temp files go beside the profile: a full system disk stopped it starting)
    { detached: true, stdio: "ignore", env: { ...process.env, TMPDIR: path.join(dir, "tmp"), MAC_CHROMIUM_TMPDIR: path.join(dir, "tmp") } }).unref();
  for (let i = 0; i < 50; i++) { try { await fetch(`${base}/json/version`); break; } catch { await sleep(200); } }
  spawn(process.execPath, [process.argv[1], port, "serve", dir], { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 50; i++) { try { await fetch(ctl); break; } catch { await sleep(200); } }
  console.log(`started on ${port}, downloads -> ${dir}/downloads`);
  process.exit(0);
}
if (cmd === "stop") {
  try { execSync(`pkill -f "remote-debugging-port=${port}"`); } catch {}
  try { execSync(`pkill -f "cdp.mjs ${port} serve"`); } catch {}
  console.log("stopped"); process.exit(0);
}
if (cmd !== "serve") {
  try {
    const r = await fetch(ctl, { method: "POST", body: JSON.stringify({ cmd, args }) });
    console.log(await r.text());
  } catch { console.log(`no browser on ${port}: run start first`); }
  process.exit(0);
}

async function session() {
  const list = await (await fetch(`${base}/json/list`)).json();
  const page = list.find((t) => t.type === "page" && !t.url.startsWith("chrome")) || list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map(); const events = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) { const { r, j } = wait.get(d.id); wait.delete(d.id); d.error ? j(new Error(d.error.message)) : r(d.result); }
    else if (d.method) events.push(d);
  };
  return {
    events,
    send: (method, params = {}) => new Promise((r, j) => { const i = ++id; wait.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params })); }),
    close: () => ws.close(),
  };
}

const s = await session();
await s.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: path.join(path.resolve(args[0]), "downloads") }).catch(() => {});
await s.send("Page.enable"); await s.send("Runtime.enable");
const ev = async (expr) => {
  const r = await s.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const MODS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
const mouse = async (x, y) => {
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"])
    await s.send("Input.dispatchMouseEvent", { type, x: +x, y: +y, button: "left", clickCount: 1 });
};

async function run(cmd, args) {
  const out = [];
  try {
  switch (cmd) {
    case "viewport": {
      const [w, h, mobile] = args; const m = mobile === "mobile";
      await s.send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: m ? 2 : 1, mobile: m });
      await s.send("Emulation.setTouchEmulationEnabled", { enabled: m, maxTouchPoints: m ? 5 : 1 });
      if (m) await s.send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
      out.push("ok"); break;
    }
    case "goto": {
      const n = s.events.length;
      await s.send("Page.navigate", { url: args[0] });
      for (let i = 0; i < 100 && !s.events.slice(n).some((e) => e.method === "Page.loadEventFired"); i++) await sleep(100);
      await sleep(1200); out.push("loaded", await ev("location.href")); break;
    }
    case "shot": {
      await sleep(300);
      const r = await s.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(args[0], Buffer.from(r.data, "base64")); out.push("saved", args[0]); break;
    }
    case "click": await mouse(args[0], args[1]); await sleep(400); out.push("clicked"); break;
    case "tap": {
      const p = [{ x: +args[0], y: +args[1] }];
      await s.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: p });
      await s.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await sleep(400); out.push("tapped"); break;
    }
    case "clicksel": {
      const c = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(args[0])});if(!e)return null;e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      if (!c) { out.push("no match"); break; }
      await mouse(c[0], c[1]); await sleep(400); out.push("clicked at", c.map(Math.round).join(" ")); break;
    }
    case "drag": {
      const [x1, y1, x2, y2] = args.map(Number);
      await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1, y: y1 });
      await s.send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", clickCount: 1 });
      for (let i = 1; i <= 10; i++)
        await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1 + (x2 - x1) * i / 10, y: y1 + (y2 - y1) * i / 10, button: "left", buttons: 1 });
      await s.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", clickCount: 1 });
      await sleep(400); out.push("dragged"); break;
    }
    case "type": await s.send("Input.insertText", { text: args.join(" ") }); await sleep(300); out.push("typed"); break;
    case "key": {
      const [name, mods = ""] = args;
      const modifiers = mods.split(",").filter(Boolean).reduce((a, m) => a | MODS[m], 0);
      const special = { Enter: [13, "\r"], Tab: [9, ""], Backspace: [8, ""], Escape: [27, ""], Delete: [46, ""], " ": [32, " "],
        ArrowLeft: [37, ""], ArrowUp: [38, ""], ArrowRight: [39, ""], ArrowDown: [40, ""], Home: [36, ""], End: [35, ""] };
      const [code, text] = special[name] || [name.toUpperCase().charCodeAt(0), modifiers & ~8 ? "" : name];
      const base = { key: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers, code: name.length === 1 ? `Key${name.toUpperCase()}` : name };
      await s.send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", text, ...base });
      await s.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      await sleep(300); out.push("key", name, mods); break;
    }
    case "upload": {
      const [sel, ...files] = args;
      const doc = await s.send("DOM.getDocument", {});
      const { nodeId } = await s.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: sel });
      if (!nodeId) { out.push("no match"); break; }
      await s.send("DOM.setFileInputFiles", { nodeId, files: files.map((f) => path.resolve(f)) });
      await sleep(1500); out.push("uploaded"); break;
    }
    case "eval": out.push(JSON.stringify(await ev(args.join(" ")), null, 1)); break;
    case "text": out.push(await ev("document.body.innerText")); break;
    case "els": {
      out.push(await ev(`[...document.querySelectorAll('button,a,input,select,textarea,label,summary,[role=button],[tabindex]')]
        .filter(e=>{const r=e.getBoundingClientRect();const st=getComputedStyle(e);return r.width>0&&r.height>0&&st.visibility!=='hidden'&&r.bottom>0&&r.top<innerHeight})
        .map(e=>{const r=e.getBoundingClientRect();const t=(e.innerText||e.value||e.getAttribute('aria-label')||e.title||e.placeholder||'').trim().replace(/\\s+/g,' ').slice(0,50);
          return \`\${Math.round(r.x+r.width/2)},\${Math.round(r.y+r.height/2)}  <\${e.tagName.toLowerCase()}\${e.type?' '+e.type:''}\${e.id?' #'+e.id:''}> \${t}\`}).join('\\n')`)); break;
    }
    case "dark":
      await s.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: args[0] === "on" ? "dark" : "light" }] });
      out.push("dark", args[0]); break;
    case "offline":
      await s.send("Network.enable");
      await s.send("Network.emulateNetworkConditions", { offline: args[0] === "on", latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      out.push("offline", args[0]); break;
    case "console": {
      for (const e of s.events.splice(0)) {
        if (e.method === "Runtime.consoleAPICalled") out.push(e.params.type + " " + e.params.args.map((a) => a.value ?? a.description).join(" "));
        if (e.method === "Runtime.exceptionThrown") out.push("EXCEPTION " + (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text));
      }
      out.push("(end)"); break;
    }
    case "nocache": await s.send("Network.enable"); await s.send("Network.setCacheDisabled", { cacheDisabled: true }); out.push("cache off"); break;
    case "reload": await s.send("Page.reload", { ignoreCache: true }); await sleep(2500); out.push("reloaded"); break;
    default: out.push("unknown command");
  }
} catch (e) { out.push("ERROR " + e.message); }
  return out.map((a) => Array.isArray(a) ? a.join(" ") : a).join("\n");
}
const http = await import("node:http");
http.createServer(async (req, res) => {
  let b = ""; for await (const c of req) b += c;
  if (!b) return res.end("up");
  const { cmd, args } = JSON.parse(b);
  res.end(await run(cmd, args));
}).listen(+port + 100, "127.0.0.1");
