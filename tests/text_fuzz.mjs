// Text input outside the happy path (category 9), the app side: strings from tests/text_corpus.mjs typed (pasted) into
// every place the app takes text, in the real page, checking what each place does with them:
// - Words (Design tab lettering), Initials (monogram), Letters (appliqué), the bookmark Name: the field holds the text
//   tidied (`tidy` in js/core/words.js: composed accents, plain spaces, no invisible characters, the field's length),
//   the editor and the note beside Download name exactly the letters the font lacks (`lacks`, the font's own glyph
//   map, NFD input included), the file name is plain ASCII and never a Windows device name, nothing throws, and the
//   design settles within 15 s;
// - One for each name (Design tab words, monogram initials, bookmark): one file per name in the ZIP, names ASCII,
//   unique ignoring case (and accents), never empty, letters the font lacks refused with a reason, every name accounted for;
// - Save design / Open saved: the words come back as they were; Send by text or email: the share text carries no
//   control or invisible characters and stays under ~1900 characters;
// - punctuation (O'Neil, Mary-Kate, Jo., Ann & Bo, Hi!, Ava, Mia) in every lettering font, with and without swashes:
//   in the ink the strokes are thinned from, no mark is one piece with a letter, and the mark is still there;
// - layout: with 60-letter words, long names and long refusals, no text runs out of the pieces list, the editor, the
//   note beside Download, the Download button, the toast, the names dialog or the done dialog, and the page doesn't
//   scroll sideways (desktop 1413 x 717 and phone 390 x 844).
// It catches: R8 "font has no ễ ị ằ / А н а" in fonts that have them, Greek/Cyrillic/Hebrew names saved as design.pes,
// R6 CON.pes and Ł/ø names, R5 emma/Emma in one ZIP, R7 5000 W's and O'Neil's apostrophe sewn into the O, NFD "José"
// listed as lacking a lone accent, invisible characters splitting a script word or listed as “”, bookmark names in a
// font without their letters (no warning), a "." alone drawn 5880000000000 mm wide, a 60-W word running out of the
// steps and the toast.
// Run (from the repo, server and Chrome on your own ports):
//   .venv/bin/python tests/batch_server.py out/batch 8786 &  node tests/cdp.mjs 9316 start /tmp/tf
//   node tests/text_fuzz.mjs 9316 8786 [--quick] [--shots DIR]
//     [--only words,initials,letters,fonts,bookmark,names,saved,share,marks,layout]
//   (about 15 min, quick about 5; prints "DONE <checks> <problems>" and exits 1 on a problem)
import { FONTS, APPLIQUE_FONTS } from "../js/core/fonts.js";
import { initials, lackList, lacks, safeName, tidy } from "../js/core/words.js";
import { FIXED, LONG, VARIANTS, corpus, rng } from "./text_corpus.mjs";

const [CDP, HTTP] = process.argv.slice(2);
const QUICK = process.argv.includes("--quick"), SHOTS = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : null;
if (!CDP || !HTTP) { console.log("usage: node tests/text_fuzz.mjs CDP_PORT HTTP_PORT [--quick] [--shots DIR]"); process.exit(2); }
const ctl = `http://127.0.0.1:${+CDP + 100}/`;
async function cdp(cmd, ...args) {
  const r = await fetch(ctl, { method: "POST", body: JSON.stringify({ cmd, args: args.map(String) }) });
  return r.text();
}
async function ev(js) {
  const t = await cdp("eval", js);
  if (!t.trim()) return null;
  try { return JSON.parse(t); } catch { throw new Error("eval: " + t.slice(0, 400)); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- in the page: drive a field, wait for the design to settle, read what each place says
const PAGE = String.raw`(() => {
  if (window.__tf) return true;
  const $ = (id) => document.getElementById(id);
  const tf = window.__tf = { files: [] };
  // downloads: what would be saved (name, and the ZIP's file names or the text)
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (!this.download) return click.call(this);
    const name = this.download, rec = { name };
    tf.files.push(rec);
    rec.ready = fetch(this.href).then((r) => r.arrayBuffer()).then((b) => {
      const u = new Uint8Array(b), dv = new DataView(b);
      if (/\.zip$/.test(name)) {
        rec.entries = [];
        for (let i = 0; i + 30 <= u.length && dv.getUint32(i, true) === 0x04034b50;) {
          const size = dv.getUint32(i + 18, true), n = dv.getUint16(i + 26, true), x = dv.getUint16(i + 28, true);
          rec.entries.push(new TextDecoder().decode(u.subarray(i + 30, i + 30 + n)));
          i += 30 + n + x + size;
        }
      } else if (/\.json$/.test(name)) rec.text = new TextDecoder().decode(u);
      else rec.size = u.length;
    });
  };
  // the share sheet, as a phone would open it
  tf.shared = null;
  navigator.canShare = () => true;
  navigator.share = async (d) => { tf.shared = { title: d.title, text: d.text, files: (d.files || []).map((f) => f.name) }; };
  tf.errors = [];
  addEventListener("error", (e) => tf.errors.push(String(e.message)));
  addEventListener("unhandledrejection", (e) => tf.errors.push(String(e.reason && e.reason.message || e.reason)));
  const ce = console.error; console.error = (...a) => { tf.errors.push(a.map(String).join(" ")); ce.apply(console, a); };
  tf.set = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
  // settled: nothing busy, Download's label and the notes unchanged for 400 ms
  tf.settle = async (min = 500, max = 15000) => {
    const t0 = performance.now(); let last = "", same = 0;
    await new Promise((r) => setTimeout(r, min));
    while (performance.now() - t0 < max) {
      const busy = !$("busy").hidden, now = [$("download").textContent, $("dl-warn").textContent, (document.querySelector("#st-edit [data-warn]") || {}).textContent].join("|");
      if (!busy && now === last) { if (++same >= 2) break; } else same = 0;
      last = now; await new Promise((r) => setTimeout(r, 200));
    }
    return Math.round(performance.now() - t0);
  };
  // text sticking out of its box (an ellipsis on purpose doesn't count), or the page scrolling sideways
  tf.overflow = (sels) => {
    const out = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push("page scrolls sideways: " + document.documentElement.scrollWidth + " > " + innerWidth);
    for (const sel of sels) for (const box of document.querySelectorAll(sel)) {
      if (!box.offsetParent && getComputedStyle(box).position !== "fixed") continue;
      const b = box.getBoundingClientRect(), walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      for (let n; (n = walk.nextNode());) {
        if (!n.data.trim() || !n.parentElement.offsetParent) continue;
        // the box the text has to fit: the nearest one that clips it, or the container; text in a row that scrolls
        // sideways on purpose (the starter cards) or cut short with an ellipsis on purpose is fine
        let edge = b, skip = false;
        for (let e = n.parentElement; e && e !== box.parentElement; e = e.parentElement) {
          const st = getComputedStyle(e);
          if (st.textOverflow === "ellipsis" || /auto|scroll/.test(st.overflowX) && e !== document.scrollingElement && e.id !== "controls") { skip = true; break; }
          if (st.overflowX !== "visible" && e !== box) { edge = e.getBoundingClientRect(); break; }
        }
        if (skip || edge.width <= 2) continue;   // (text for screen readers only, in a 1 px box)
        const r = document.createRange(); r.selectNodeContents(n);
        for (const q of r.getClientRects()) if (q.width && (q.right > Math.min(edge.right, innerWidth) + 2 || q.left < Math.max(edge.left, 0) - 2)) { out.push(sel + ": “" + n.data.trim().slice(0, 30) + "” " + Math.round(q.left) + "-" + Math.round(q.right) + " outside " + Math.round(edge.left) + "-" + Math.round(edge.right)); break; }
      }
      for (const f of box.querySelectorAll("input, textarea, select, button")) {
        let scrolled = false; for (let e = f.parentElement; e && e !== box; e = e.parentElement) if (/auto|scroll/.test(getComputedStyle(e).overflowX)) scrolled = true;
        const r = f.getBoundingClientRect();
        if (!scrolled && f.offsetParent && r.width && (r.right > Math.min(b.right, innerWidth) + 2 || r.left < Math.max(b.left, 0) - 2)) out.push(sel + ": " + (f.textContent.trim().slice(0, 30) || f.tagName) + " sticks out " + Math.round(r.left) + "-" + Math.round(r.right) + " of " + Math.round(b.left) + "-" + Math.round(b.right));
      }
    }
    return [...new Set(out)];
  };
  tf.read = () => ({
    warn: (document.querySelector("#st-edit [data-warn]:not([hidden])") || {}).textContent || "",
    dl: $("dl-warn").hidden ? "" : $("dl-warn").textContent, download: $("download").textContent, disabled: $("download").disabled,
    list: [...document.querySelectorAll("#st-pieces .nm")].map((e) => e.textContent), error: ($("error") && !$("error").hidden) ? $("error").textContent : "",
    errors: tf.errors.splice(0),
  });
  return true;
})()`;

let checks = 0;
const problems = [];
const show = (s) => JSON.stringify(s.length > 30 ? s.slice(0, 30) + "…" : s);
function check(kind, ok, what) { checks++; if (!ok) problems.push(`${kind}: ${what}`); }
const DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
const fileOk = (f) => /^[A-Za-z0-9_-]+(\.needleworks\.json|\.pes|\.zip)$/.test(f) && !DEVICE.test(f);
// what a place says about letters the font lacks, against the font's own map
function lackSaid(where, said, text, family, what) {
  const gone = lacks(text, family);
  if (gone.length) check(`${where} names the missing letters`, said.includes(`has no ${lackList(gone)}`), `${what}: wants ${lackList(gone)}, says ${show(said)}`);
  else check(`${where} says nothing is missing`, !/has no /.test(said), `${what}: says ${show(said.slice(said.indexOf("has no")))}`);
}

// (headless Chrome sometimes doesn't start app.js, and the test server sometimes drops a module: load again)
async function load(hash) {
  await cdp("console");
  for (let i = 0; i < 6; i++) {
    await cdp("goto", `http://127.0.0.1:${HTTP}/?tf=${Date.now()}${hash}`);
    for (let k = 0; k < 10 && !(await ev("!!document.body.dataset.mode && !!document.querySelector('[data-start]')")); k++) await sleep(500);
    if (await ev("!!document.body.dataset.mode && !!document.querySelector('[data-start]')")) break;
    // (said with what the page logged and the design it had stored, to find out why)
    if (i === 5) throw new Error(`the page didn't start: ${(await cdp("console")).slice(0, 300)} stored ${String(await ev("localStorage.getItem('nw:studio')")).slice(0, 200)}`);
  }
  await ev(PAGE);
}
const start = (id) => ev(`(async () => { document.querySelector('[data-start="${id}"]').click(); await __tf.settle(800); return true; })()`);
const settled = async () => { const ms = await ev("__tf.settle()"); check("settles within 15 s", ms < 15000, `${ms} ms`); return ev("__tf.read()"); };

const r = rng(31), all = corpus(QUICK ? 40 : 160, 5), sample = (n) => { const a = [...all]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
const pickFont = (list) => list[Math.floor(r() * list.length)].family;
const t0 = Date.now();

// ---- Words, Initials, Letters: typed (pasted) into the editor
async function field(kind, starter, sel, opts, fonts, strings) {
  await load("#design");
  await ev(`localStorage.clear()`); await load("#design"); await start(starter);
  for (const s of strings) {
    const font = pickFont(fonts);
    const got = await ev(`(async () => {
      const f = document.querySelector('#st-edit select[data-k="font"]'); if (f && f.value !== ${JSON.stringify(font)}) { f.value = ${JSON.stringify(font)}; f.dispatchEvent(new Event("input", { bubbles: true })); await __tf.settle(300); }
      const el = document.querySelector(${JSON.stringify(sel)}); __tf.set(el, ${JSON.stringify(s)});
      return { value: document.querySelector(${JSON.stringify(sel)}).value };
    })()`);
    // (a one-line field drops line breaks itself, as the browser does with a paste)
    const seen = await settled(), want = tidy(sel.includes("textarea") ? s : s.replace(/[\r\n]/g, ""), opts), what = `${kind} ${font.replace("NW ", "")} ${show(s)}`;
    check(`${kind} field holds the tidied text`, got.value === want, `${what}: ${show(got.value)} not ${show(want)}`);
    check(`${kind}: nothing throws`, !seen.errors.length && !/went wrong|TypeError|undefined/.test(seen.error), `${what}: ${seen.errors.concat(seen.error).join(" ")}`);
    if (!want.trim()) continue;
    lackSaid(`${kind} editor`, seen.warn, want, font, what);
    if (!seen.disabled) lackSaid(`${kind} Download note`, seen.dl, want, font, what);   // (too big: the error says so instead)
    const file = /^Download (.*)$/.exec(seen.download)?.[1];
    if (file && !seen.disabled) check(`${kind} file name`, fileOk(file), `${what}: ${file}`);
    if (kind === "Initials") check("Initials: more than 3 said", (initials(want).length > 3) === /3 initials at most/.test(seen.warn), `${what}: ${initials(want).length} initials, says ${show(seen.warn)}`);
  }
}

// ---- the bookmark's name
async function bookmark(strings) {
  await load("#bookmark");
  for (const s of strings) {
    const font = pickFont(FONTS), what = `Bookmark ${font.replace("NW ", "")} ${show(s)}`;
    const got = await ev(`(async () => {
      const b = document.querySelector('#bm-fonts [data-f="${font}"]'); if (b && b.getAttribute("aria-pressed") !== "true") { b.click(); await __tf.settle(300); }
      __tf.set(document.getElementById("bm-name"), ${JSON.stringify(s)}); return { value: document.getElementById("bm-name").value };
    })()`);
    const seen = await settled(), want = tidy(s.replace(/[\r\n]/g, ""), { max: 14 });   // (a one-line field drops line breaks itself)
    check("Bookmark field holds the tidied text", got.value === want, `${what}: ${show(got.value)} not ${show(want)}`);
    check("Bookmark: nothing throws", !seen.errors.length, `${what}: ${seen.errors.join(" ")}`);
    if (!want.trim()) continue;
    if (!seen.disabled) lackSaid("Bookmark Download note", seen.dl, want.trim(), font, what);
    const file = /^Download (.*)$/.exec(seen.download)?.[1];
    if (file && !seen.disabled) check("Bookmark file name", fileOk(file) && file === `${safeName(want, "name")}_bookmark.pes`, `${what}: ${file}`);
  }
}

// ---- One for each name
async function names(where, names, family) {
  const got = await ev(`(async () => {
    __tf.files.length = 0;
    document.getElementById("names-open").click();
    document.getElementById("names-list").value = ${JSON.stringify(names.join("\n"))};
    document.getElementById("names-make").click();
    for (let i = 0; i < 600 && document.getElementById("names-make").disabled !== false || i < 3; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 300));
    await Promise.all(__tf.files.map((f) => f.ready));
    const out = { files: __tf.files.map((f) => ({ name: f.name, entries: f.entries })), note: document.getElementById("names-note").textContent,
      caps: [...document.querySelectorAll("#names-thumbs figcaption")].map((c) => c.textContent), overflow: __tf.overflow(["#names .names-thumbs", "#names-note", "#names-bad"]), errors: __tf.errors.splice(0) };
    return out;
  })()`);
  const zip = got.files.find((f) => /\.zip$/.test(f.name)), entries = zip?.entries || [];
  const typed = [...new Set(names.map((n) => tidy(n).trim()).filter(Boolean))].slice(0, 40);
  check(`${where} names: nothing throws`, !got.errors.length, got.errors.join(" "));
  check(`${where} names: ZIP name`, !zip || fileOk(zip.name), zip?.name);
  for (const e of entries) check(`${where} names: file names ASCII, not a device`, fileOk(e), e);
  check(`${where} names: one file each, unique ignoring case`, new Set(entries.map((e) => e.toLowerCase())).size === entries.length, entries.join(" "));
  // every name is made, or said why not
  const made = got.caps.length, refused = typed.filter((n) => lacks(n, family).length || !/[\p{L}\p{N}]/u.test(n));
  check(`${where} names: a file per name made`, made === entries.length, `${made} shown, ${entries.length} in the ZIP`);
  for (const n of refused) check(`${where} names: lacking letters refused with a reason`, got.note.includes(n) && (/has no|no letters|3 initials/.test(got.note)), `${show(n)} in ${show(got.note.slice(0, 200))}`);
  check(`${where} names: every name accounted for`, made + (got.note.match(/Couldn't make: (.*?)\. (?:Left out|$)/)?.[1] || "").split(/\), /).filter(Boolean).length >= typed.length - refused.length || made >= typed.length - refused.length, `${made} made of ${typed.length}, ${refused.length} refused`);
  check(`${where} names dialog layout`, !got.overflow.length, got.overflow.join("; "));
  await ev(`(() => { const d = document.getElementById("names"); if (d.open) d.close(); return true; })()`);
}

// ---- Save design, then Open saved
async function roundTrip(strings) {
  await load("#design"); await start("words");
  for (const s of strings) {
    const want = tidy(s, { lines: 3, max: 60 });
    if (!want.trim()) continue;
    const got = await ev(`(async () => {
      __tf.set(document.querySelector('#st-edit textarea[data-k="text"]'), ${JSON.stringify(s)}); await __tf.settle(400);
      __tf.files.length = 0; document.getElementById("st-save").click(); await new Promise((r) => setTimeout(r, 100)); await Promise.all(__tf.files.map((f) => f.ready));
      const saved = __tf.files[0];
      __tf.set(document.querySelector('#st-edit textarea[data-k="text"]'), "Other"); await __tf.settle(400);
      const input = document.getElementById("st-load"), dt = new DataTransfer(); dt.items.add(new File([saved.text], saved.name, { type: "application/json" }));
      input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true })); await __tf.settle(600);
      const back = (document.querySelector('#st-edit textarea[data-k="text"]') || {}).value;
      return { name: saved.name, text: JSON.parse(saved.text).pieces.map((p) => p.text).filter(Boolean)[0], back, toast: (document.getElementById("st-toast") || {}).textContent || "", errors: __tf.errors.splice(0) };
    })()`);
    check("Save design: file name", fileOk(got.name), got.name);
    check("Save design: saves the words as shown", got.text === want, `${show(s)}: ${show(got.text)}`);
    check("Open saved: the words come back", got.back === want, `${show(s)}: ${show(got.back)}`);
    check("Open saved: nothing said cut", !/cut|shortened/i.test(got.toast) || want.length >= 60, `${show(s)}: ${got.toast}`);
    check("Save/Open: nothing throws", !got.errors.length, got.errors.join(" "));
  }
}

// ---- Send by text or email
async function share(strings) {
  await load("#design"); await start("words");
  for (const s of strings) {
    const got = await ev(`(async () => {
      __tf.set(document.querySelector('#st-edit textarea[data-k="text"]'), ${JSON.stringify(s)}); await __tf.settle(500);
      __tf.shared = null; if (!document.getElementById("share").disabled) { await document.getElementById("share").onclick(); }
      return __tf.shared;
    })()`);
    if (!got) continue;
    check("Share: title is the file", fileOk(got.title) && got.files[0] === got.title, `${show(s)}: ${got.title}`);
    check("Share: text has no control or invisible characters", !/(?![\n\u200d])[\p{Cc}\p{Cf}]/u.test(got.text) && !/[\ud800-\udfff]/.test(got.text.replace(/[\ud800-\udbff][\udc00-\udfff]/g, "")), show(s));
    check("Share: text short enough for a message", got.text.length <= 1900, `${show(s)}: ${got.text.length}`);
  }
}

// ---- long text in every box, desktop and phone
async function layout(size) {
  const [w, h, m] = size;
  await cdp("viewport", w, h, m || "");
  const where = `${w}x${h}`, boxes = ["#st-pieces", "#st-edit", "#dl-warn", ".bottom", "#controls", "header"];
  for (const s of (QUICK ? [LONG[4]] : LONG.filter((x) => x.length >= 30).concat(["Великолепная Александра", "Nguyễn Thị Hằng Nguyễn Thị Hằng Nguyễn"]))) {
    await load("#design"); await start("words");
    const got = await ev(`(async () => {
      __tf.set(document.querySelector('#st-edit textarea[data-k="text"]'), ${JSON.stringify(s)}); await __tf.settle(600);
      const a = __tf.overflow(${JSON.stringify(boxes)});
      // the toast after removing it, then the done dialog after a download
      const b = [];
      document.querySelector('#st-pieces button[data-op="del"]').click(); await new Promise((r) => setTimeout(r, 300));
      b.push(...__tf.overflow(["#st-toast"]));
      document.querySelector("#st-toast button")?.click(); await __tf.settle(500);
      if (!document.getElementById("download").disabled) { document.getElementById("download").click(); await new Promise((r) => setTimeout(r, 600)); if (document.getElementById("done").open) { b.push(...__tf.overflow(["#done"])); document.getElementById("done").close(); } }
      return a.concat(b);
    })()`);
    check(`layout ${where}`, !got.length, `${show(s)}: ${got.join("; ")}`);
    if (SHOTS && s === LONG[4]) await cdp("shot", `${SHOTS}/text_${where}.png`);
  }
  await load("#bookmark");
  const bm = await ev(`(async () => { __tf.set(document.getElementById("bm-name"), "WWWWWWWWWWWWWW"); await __tf.settle(800); return __tf.overflow(["#panel-bookmark", ".bottom", "#bm-fonts"]); })()`);
  check(`layout ${where} bookmark`, !bm.length, bm.join("; "));
  if (SHOTS) await cdp("shot", `${SHOTS}/bookmark_${where}.png`);
}

// ---- punctuation the font draws into a letter is drawn apart from it (O'Neil: Great Vibes' apostrophe touches the O
// and was thinned into a spur off it, then pruned or sewn as a lump): in the ink the lettering is thinned from, no mark
// shares a piece with a letter
async function marks() {
  await load("#design");
  const got = await ev(`(async () => {
    const T = await import("/js/core/text.js"), R = await import("/js/core/raster.js"), F = await import("/js/core/fonts.js");
    const PX = 400, out = [];
    // the pixels characters [i, j) of the word cover, drawn alone where the word puts them
    const alone = (text, i, family, o, j = i + 1) => {
      const p = document.createElement("canvas").getContext("2d"); p.font = PX + 'px "' + family + '"'; p.fontKerning = "normal";
      const m = p.measureText(text), pad = Math.ceil(PX * (0.2 + (o.leadIn || 0) + (o.tail || 0)));
      const inkL = -m.actualBoundingBoxLeft, w = Math.ceil(m.actualBoundingBoxRight - inkL + 2 * pad), h = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + PX);
      const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.font = p.font; g.fontKerning = "normal";
      g.fillText(text.slice(i, j), pad - inkL + p.measureText(text.slice(0, j)).width - p.measureText(text.slice(i, j)).width, PX / 2 + m.actualBoundingBoxAscent);
      const a = g.getImageData(0, 0, w, h).data, set = new Set();
      for (let k = 0; k < w * h; k++) if (a[k * 4 + 3] > 127) set.add(k);
      return { set, w };
    };
    for (const f of F.FONTS) {
      await document.fonts.load('40px "' + f.family + '"');
      for (const word of ["O'Neil", "O\u2019Neil", "D'Arcy", "Mary-Kate", "Jo.", "Ann & Bo", "Hi!", "Ava, Mia"]) for (const sw of [0, 0.6]) {
        const o = { join: !f.print, leadIn: sw, tail: sw, deco: f.print ? "dash" : "swash" }, r = T.renderWord(word, f.family, o), { labels } = R.label(r.mask);
        for (let i = 0; i < word.length; i++) {
          if (/[\\p{L}\\p{N}\\s]/u.test(word[i])) continue;
          const a = alone(word, i, f.family, o), before = alone(word, 0, f.family, o, i), after = alone(word, i + 1, f.family, o, word.length);
          if (a.w !== r.mask.w) continue;
          // the mark's own ink (not where a letter is drawn too), and how much letter ink is in one piece with it
          const letter = (k) => before.set.has(k) || after.set.has(k), ls = new Set();
          for (const k of a.set) if (r.mask.data[k] && !letter(k)) ls.add(labels[k]);
          let extra = 0;
          for (let k = 0; k < labels.length; k++) if (ls.has(labels[k]) && letter(k)) extra++;
          // and the mark is still there (moved a little at most): ink that isn't a letter's round where it was drawn
          let x0 = a.w, y0 = 1e9, x1 = 0, y1 = 0;
          for (const k of a.set) { const x = k % a.w, y = Math.floor(k / a.w); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
          const grow = Math.ceil(2 * r.stroke);
          let kept = 0;
          for (let y = Math.max(0, y0 - grow); y <= y1 + grow; y++) for (let x = Math.max(0, x0 - grow); x <= Math.min(a.w - 1, x1 + grow); x++) { const k = y * a.w + x; if (k < r.mask.data.length && r.mask.data[k] && !letter(k) && !ls.has(-1)) kept++; }
          out.push([f.name, word, sw, word[i], extra, kept / Math.max(1, [...a.set].filter((k) => !letter(k)).length)]);
        }
      }
    }
    return out;
  })()`);
  for (const [font, word, sw, mark, extra, kept] of got) {
    check("punctuation drawn apart from the letters", extra <= 50, `${font} ${word}${sw ? " with swashes" : ""}: “${mark}” is one piece with ${extra} px of letter`);
    check("punctuation kept", kept >= 0.6, `${font} ${word}${sw ? " with swashes" : ""}: “${mark}” ${Math.round(kept * 100)} % left`);
  }
}

const scripted = FIXED;
const strings = QUICK ? sample(40) : [...new Set([...scripted, ...sample(120)])];
// --only words,initials,letters,fonts,bookmark,names,saved,share,marks,layout
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
// (a part that stops with an error is a problem, and the rest still run)
const on = (k) => !ONLY || ONLY.includes(k);
async function part(k, f) { if (!on(k)) return; try { await f(); } catch (err) { check(`${k}: runs to the end`, false, String(err.message).slice(0, 300)); } }
await cdp("viewport", 1413, 717);
await part("words", () => field("Words", "words", '#st-edit textarea[data-k="text"]', { lines: 3, max: 60 }, FONTS, strings));
await part("initials", () => field("Initials", "monogram", '#st-edit input[data-k="letters"]', { max: 12 }, FONTS, QUICK ? sample(15) : sample(80)));
await part("letters", () => field("Letters", "initials", '#st-edit input[data-k="text"]', { max: 12 }, APPLIQUE_FONTS, QUICK ? sample(10) : sample(40)));
// every font for the names people reported
await part("fonts", async () => {
  await field("Words", "words", '#st-edit textarea[data-k="text"]', { lines: 3, max: 60 }, FONTS, []);
  for (const f of QUICK ? FONTS.slice(0, 3) : FONTS) {
    for (const s of ["Jose\u0301", "Анна", "Nguyễn Thị Hằng", "Σοφία", "Em\u200bma", "❤\ufe0f Emma"]) {
      await ev(`(async () => { const f = document.querySelector('#st-edit select[data-k="font"]'); f.value = ${JSON.stringify(f.family)}; f.dispatchEvent(new Event("input", { bubbles: true })); await __tf.settle(300);
        __tf.set(document.querySelector('#st-edit textarea[data-k="text"]'), ${JSON.stringify(s)}); return true; })()`);
      const seen = await settled();
      lackSaid("Words editor (every font)", seen.warn, tidy(s, { lines: 3 }), f.family, `${f.name} ${show(s)}`);
    }
  }
});
await part("bookmark", () => bookmark(QUICK ? sample(12) : [...sample(50), "Анна", "Jose\u0301", "CON", "Zoë", "שרה", "❤\ufe0f", ".", "Jo."]));
// names batches: corpus names plus names differing only by case or accent
const batch = (n) => [...VARIANTS, "CON", "con", "nul", "Łukasz", "Søren", "Анна", "Σοφία", "שרה", "李明", "❤\ufe0f", "O'Neil", ".", ...sample(n)];
await part("names", async () => {
  await load("#design"); await start("words");
  await names("Words", batch(QUICK ? 6 : 20), "NW Great Vibes");
  await start("monogram");
  await names("Initials", ["JKM", "jkm", "ÉMJ", "E\u0301MJ", "A", "AB", "ABCD", "Ł Ø Ž", "АБВ", "李", "❤", "  ", "J K M"], "NW Great Vibes");
  await load("#bookmark");
  await ev(`(async () => { document.querySelector('#bm-fonts [data-f="NW Sacramento"]').click(); await __tf.settle(500); return true; })()`);
  await names("Bookmark", batch(QUICK ? 4 : 10), "NW Sacramento");
});
await part("saved", () => roundTrip(QUICK ? ["Jose\u0301", "Line one\nLine two", "Em\u200bma"] : ["Jose\u0301", "Line one\nLine two\nLine three\nLine four", "\n\nEmma", "Em\u200bma", "O’Neil & Co", "Анна", "❤\ufe0f Emma", "<b>x</b>", "W".repeat(5000), "e\u0301".repeat(40), ...sample(12)]));
await part("share", () => share(QUICK ? ["Emma", "Em\u0000ma"] : ["Emma", "Em\u0000ma", "\u202eamme", "W".repeat(60), "❤\ufe0f Emma", ...sample(6)]));
await part("marks", marks);
await part("layout", async () => { await layout([1413, 717]); await layout([390, 844, "mobile"]); });
await cdp("viewport", 1413, 717);

const kinds = new Map();
for (const p of problems) { const k = p.slice(0, p.indexOf(":")); kinds.set(k, (kinds.get(k) || 0) + 1); }
for (const [k, n] of kinds) console.log(`  ${n} x ${k}`);
for (const p of problems.slice(0, 60)) console.log("FAIL " + p);
console.log(`text fuzz: ${strings.length} strings, ${Math.round((Date.now() - t0) / 1000)} s`);
console.log(`DONE ${checks} ${problems.length}`);
process.exit(problems.length ? 1 : 0);
