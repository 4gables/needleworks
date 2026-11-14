/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The Picture tab: a picture to stitches. The picture's worker jobs (newest kept, restarted when too slow), its
// settings and sizes, the palette and thread swaps, what was left out and the fixes that bring it back, the sample
// and the picture kept from the last visit. (Part of app.js until 2026-11.)
import { turnPattern } from "./core/design.js";
import { designStats, machineThreads, readEmbroidery } from "./core/formats.js";
import { DENSITY, LEARN, MOST, contentBox, cutPart, findParts, lostMuch, picturePlan, pictureImage, sewSized } from "./core/digitize.js";
import { PEC_MATCH, hexToRgb, nearestBrotherThread, pecThread } from "./core/threads.js";
import { fix } from "./doctor.js";
import { moves } from "./quality.js";
import { LOOK, TIP, isolate } from "./words.js";
import { safeName } from "./core/typed.js";
import { colourWord, lab } from "./core/brands.js";
import { MARGIN } from "./core/machines.js";
import { artGuide, artSaid } from "./artwords.js";
import { COLORS as LINE_THREADS } from "./studio/ui.js";
import { $, forgetPicture, hoop, keepPicture, kept, square, state, store, turned } from "./state.js";
import { next } from "./focus.js";
import { nearOwn, ownedPalette, ownedSpools, owns, threadHtml, threadLabel } from "./threadui.js";
import { mmText } from "./words.js";
import { jobQueue } from "./jobs.js";
import { busy, escapeHtml, openDesign, paint, setMode, setView, showError, studio, warnUI } from "./app.js";   // (used when things happen, never while this file loads: app.js loads after it)

export const sizeLabel = (v) => mmText(v);
// ---------- picture ----------
// A picture worker (jobs.js: one job at a time, only the newest waiting). A job that runs past a minute is stopped (a
// photo once routed for over 5 minutes and every later change queued behind it): the worker is replaced and the
// picture tab says what to try. `stop()` drops what's waiting and running (the checks of settings that just changed).
function picWorker() {
  const q = jobQueue(new URL("./worker.js", import.meta.url), { limit: 60000, eager: true, slow: "This picture is taking too long to stitch. Try fewer colours, a smaller size, or Line drawing." });
  // (a worker that died says so in the picture tab's words)
  return { run: async (msg) => { const r = await q.run(msg); return r.died ? { ok: false, error: "Something went wrong while stitching this picture. " + r.error } : r; }, stop: q.stop };
}
// the picture's own, and one that tries the one-tap fixes for what a picture leaves out, so they're offered only if
// they work (and the picture never waits for them)
const picJobs = picWorker(), picChecks = picWorker();
// Everything a picture's stitches depend on (the stitches are a function of these and the picture, nothing else)
// Small details (core/digitize.js, recipes.js `PICTURES.details`): "most" unless the person chose
const DETAILS = ["all", "most"], detailsOf = (p) => (DETAILS.includes(p.details) ? p.details : "most");
function picSettings(over = {}) {
  const p = state.pic, h = hoop(), turn = !!state.turn.picture && !square();
  return { size: p.size, style: p.style, cross: p.cross, skip: p.skip, swap: p.swap, colors: p.colors, bg: p.bg, angle: p.angle, density: p.density, details: detailsOf(p), inside: p.inside === "none" || p.inside === "all" ? p.inside : "auto", smooth: p.smooth,
    line: p.line, edge: p.edge, turn, hoop: turn ? { ...h, w: h.h, h: h.w } : h, palette: ownedPalette(), ...over };
}
// the fit each exact setting was sewn at (sewing it again gives the same file, at once)
const picFits = new Map();
// Sews the picture with settings s on worker wk: the colours and where each lies first (once per picture and colour
// count), then sized so the sewn design's longer side is s.size (sewSized). The reply, or { stale } once newer
// settings came (isStale).
async function sewPicture(s, wk, isStale = () => false) {
  const p = state.pic, bitmap = p.bitmap;
  // (the whole picture when its edge band is sewn: the content box is what differs from the edge, so it cut the band
  // down to its inner 2 px)
  const box = s.bg && !s.edge ? (p.box ||= contentBox(bitmap)) : { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height };
  const key = `${p.key}:${s.colors}:${s.bg}:${s.edge ? 1 : 0}:${s.smooth ?? "auto"}:${box.sx},${box.sy},${box.sw},${box.sh}`, k = LEARN / Math.max(box.sw, box.sh);
  if (p.learn?.key !== key) p.learn = { key, img: pictureImage(bitmap, box, Math.max(1, Math.round(box.sw * k)), Math.max(1, Math.round(box.sh * k))) };
  const learn = p.learn.img;
  const opts = { colors: s.colors, scale: k, removeBackground: s.bg, fillAngle: s.angle, density: DENSITY[s.density] || DENSITY.standard, details: s.details, inside: s.inside, ...(s.smooth == null ? {} : { smooth: s.smooth }), skip: s.skip, ...(s.swap && Object.keys(s.swap).length ? { swap: s.swap } : {}), hoop: s.hoop, turn: s.turn, palette: s.palette, style: s.style, cross: s.cross, line: s.line || undefined, edge: s.edge || undefined };
  // (kept per colour count: the checks try other counts)
  if (!p.models.has(key)) {
    const m = await wk.run({ key, learn, opts });
    if (!m.ok || isStale()) return isStale() ? { stale: true } : m;
    p.models.set(key, { boxes: m.boxes, colors: m.colors });
  }
  const { boxes, colors } = p.models.get(key), sewn = boxes.filter((_, i) => !colors[i].background && !s.skip.includes(i));
  const fk = JSON.stringify([key, s.size, opts]);
  const r = await sewSized(async (pl) => {
    if (isStale()) return { ok: false, stale: true };
    const q = await wk.run({ key, ref: `${p.key}:${s.bg}:${s.edge ? 1 : 0}:${s.smooth ?? "auto"}`, learn, img: pictureImage(bitmap, pl.crop, pl.w, pl.h), crop: pl.frac, opts });
    return isStale() ? { ok: false, stale: true } : q;
  }, (fit) => picturePlan(box, sewn, s.size, s.hoop, undefined, fit), { style: s.style, cross: s.cross, fit: picFits.get(fk) });
  if (r.stale || isStale()) return { stale: true };
  if (r.ok) picFits.set(fk, r.fit);
  return r;
}
export async function makePicture() {
  const p = state.pic; if (!p.bitmap) return;
  if (!p.sample) store.set("pic.last", { style: p.style, colors: p.colors, size: p.size, angle: p.angle, cross: p.cross, bg: p.bg, line: p.line, details: detailsOf(p) });
  // (nothing from another tab stays on screen, with its Download, while this picture stitches)
  if (state.mode === "picture" && state.view && state.view !== state.views.picture) setView(null);
  const req = ++p.req; busy(true, "Stitching your picture…");
  picChecks.stop(); p.fixes = [];
  const s = picSettings(), r = await sewPicture(s, picJobs, () => req !== p.req);
  if (r.stale || req !== p.req) return;
  busy(false);
  if (r.plan) sizeRange(r.plan.max);
  if (!r.ok && r.code === "empty" && !p.sample) forgetPicture();
  if (!r.ok) { verdictUI(null); state.views.picture = null; $("pic-use").hidden = $("pic-size-note").hidden = true; if (state.mode === "picture") { setView(null); pictureError(r); } return; }
  showError("");
  // (in the order they're sewn, then any left out)
  const byId = new Map(r.colors.map((c) => [c.id, c]));
  // (a line drawing's thread may be one picked for it, not the colour's own)
  p.colorsInfo = [...r.summary.map((c) => byId.has(c.id) && { ...byId.get(c.id), hex: c.hex, thread: c.thread }), ...p.skip.map((id) => byId.get(id))].filter(Boolean);
  if (p.style === "line" && !p.line) { p.autoLine = r.summary[0]?.hex || ""; lineUI(); }
  // (asked for 4, got 3: say why, instead of a slider that looks ignored)
  state.pic.merged = r.merged || 0;
  // (a band of one colour round the edge is taken as a frame and left out (`findFrame`): said, it went with no word)
  state.pic.framed = !!r.framed; if (r.framed) p.edgeSeen = true;
  state.pic.owned = r.owned || null;
  // (the fabric's colour closed in by the design: sewn, or left out, and said: insideNote)
  verdictUI(r);
  state.pic.closed = r.closed || 0; state.pic.spare = !!r.spare; state.pic.fabric = r.colors.find((c) => c.background) || null;
  // (flecks sewn in the colour round them, `foldFlecks`: said in the panel when it's more than a handful, as what
  // happened; not a problem, so not on the sew sheet)
  state.pic.folded = r.fine?.folded >= FLECKS ? r.fine.folded : 0;
  // (pieces the Small details choice left out: said with the way back)
  state.pic.left = (p.style === "fill" && r.fine?.left) || 0;
  const mt = machineThreads(r.pattern.threads);
  state.pic.machineName = new Map(r.pattern.threads.map((t, i) => [t.color, mt[i].name]));
  paletteUI();
  // (sewn longer or shorter than the Size asked, past what the style can do: said why. etsy_7 in cross-stitch at 60 mm
  // sewed 52 x 10 with nothing said)
  {
    // (measured on the file, as the size chip is)
    const st = designStats(readEmbroidery(r.bytes)), got = +Math.max(st.widthMm, st.heightMm).toFixed(0), want = Math.min(s.size, p.max || s.size), tol = s.style === "cross" ? s.cross / 2 : 0.4;
    const off = Number.isFinite(got) && Math.abs(got - want) > Math.max(tol, 1);
    $("pic-size-note").hidden = !off;
    $("pic-size-note").textContent = off ? `It sews ${got} mm long, not ${want}: ${s.style === "cross" ? `cross-stitch grows ${s.cross} mm at a time, and parts too small for a cross drop out` : "parts too small to sew at this Size drop out"}, so the nearest it can be is ${got} mm.` : "";
  }
  // (a busy picture: how many separate pieces the machine cuts the thread between, counted on the file)
  { let cuts = 0, was = 0; for (const [, , c] of r.pattern.stitches) { if ((c === 1 || c === 2) && was === 0) cuts++; was = c === 1 || c === 2 ? 1 : 0; }
    p.busy = s.style === "fill" && cuts >= BUSY ? { cuts, stitches: r.pattern.stitches.filter((q) => q[2] === 0).length } : null; }
  p.fine = { ...r.fine, tries: r.tries }; p.checking = false;
  fineUI(r.fine);
  const base = safeName((state.pic.file?.name || "picture").replace(/\.[^.]+$/, "") + (p.part ? `_${p.part}` : ""), "picture");
  const v = { pattern: r.pattern, verifyAgainst: r.pattern, bytes: r.bytes, filename: `${base}${state.pic.style === "line" ? "_line" : state.pic.style === "cross" ? "_cross" : ""}.pes`, fabric: "linen",
    sheet: turned() ? { notes: [$("done-turn").textContent] } : undefined,
    // (what the panel says of it, as every surface says it: words.js)
    get problems() { return [...(state.pic.fineProblems || []), ...(state.pic.ownedProblem ? [state.pic.ownedProblem] : []), ...(state.pic.framed ? [{ id: "framed", level: TIP, text: FRAMED }] : [])]; },
  };
  state.views.picture = v;
  // (adding needs a design there to add to)
  $("pic-use").hidden = false; $("pic-add").hidden = $("pic-or").hidden = (() => { try { return studio.empty(); } catch { return true; } })();
  if (state.mode === "picture") setView(v);
  if (lostMuch(r.fine.kept)) checkLost(s, req);
}
// Nothing to stitch: say why, and offer only what can still be done (it said "make it bigger" at the largest size and
// "turn off background removal" with it already off)
function pictureError(r) {
  const p = state.pic, bigger = p.size < (p.max || 0), msg = [r.error];
  $("empty").textContent = "";   // (not "Choose a picture" beside the error)
  if (r.code === "cross") msg.push(p.cross > 1.5 ? (bigger ? "Try smaller crosses or a bigger Size." : "Try smaller crosses.") : bigger ? "Try a bigger Size." : "");
  else if (r.code === "small" && !bigger) msg.push("It's as big as this hoop allows.");
  showError(msg.filter(Boolean).join(" "), r.code === "small" && bigger ? { label: "Make it as big as fits", run: () => setSize(p.max) } : r.code === "skipped" ? { label: "Sew every thread", run: () => { p.skip = []; makePicture(); } } : undefined);
}
function setSize(mm) { state.pic.size = mm; $("pic-size").value = mm; $("pic-size-out").textContent = sizeLabel(mm); makePicture(); }

$("pic-merged").onclick = (e) => {
  const d = e.target.closest("[data-details]");
  if (d) { state.pic.details = d.dataset.details; detailsUI(); makePicture(); $("pic-details").querySelector('[aria-pressed="true"]')?.focus(); return; }
  const b = e.target.closest("[data-edge]"); if (!b) return;
  state.pic.edge = b.dataset.edge === "1"; state.pic.skip = []; state.pic.swap = {}; makePicture();
};
const FRAMED = "The band of one colour round the picture's edge looks like a frame round it, so it isn't sewn.";
// (a fleck alone is a cut thread and two knots, or a hole in the colour round it: core/digitize.js `foldFlecks`)
// (each piece left out would have been a start of its own: a cut thread and two knots for a few stitches)
// What the Small details choice did, said beside it, a sentence each (the words sat in one grey paragraph under the
// Threads list, run together with the edge band's link, and a newcomer couldn't tell what the choice had changed):
// - specks left out, with where they are ("Show them" rings each on the preview) and the way back;
// - none to leave out, so the two choices sew the same and say so;
// - specks kept;
// - dots of colour inside a bigger area sewn in that colour, whichever is chosen ("Keep all" over "84 flecks are sewn
//   in the colour round them" read as the choice ignored: one word for each thing, speck and dot).
const leftOut = (n) => `${n} ${n === 1 ? "speck is" : "specks are"} left out: ${n === 1 ? "it" : "each"} would be a knot and a cut thread for a few stitches. <button type="button" class="link" data-show-left>Show ${n === 1 ? "it" : "them"}</button> <button type="button" class="link" data-details="all">Keep ${n === 1 ? "it" : "them"}</button>`;
const FLECKS = 5, flecked = (n) => `${n} dots of colour inside a bigger area are too small to sew on their own, so with either choice they are sewn in the colour round them.`;
function detailsNote() {
  const p = state.pic, el = $("pic-details-note"), all = detailsOf(p) === "all";
  const said = [p.left ? leftOut(p.left) : all ? "Every speck is sewn: each small piece on its own is a knot and a cut thread." : "This picture has no specks to leave out.",
    p.folded ? flecked(p.folded) : ""].filter(Boolean);
  el.hidden = p.style !== "fill"; el.innerHTML = said.map((t) => `<span>${t}</span>`).join("<br>");
}
// "Show them": the specks left out, ringed on the preview for a few seconds. The picture is sewn once more with them
// kept (off the page), and what that has where this has nothing within about ¾ mm is a speck.
let showing = 0;
async function showLeft(btn) {
  const p = state.pic, v = state.views.picture, req = p.req; if (!v || showing) return;
  showing = 1; btn.disabled = true; btn.textContent = "Finding them…";
  try {
    const r = await sewPicture({ ...picSettings(), details: "all" }, picChecks, () => req !== p.req);
    if (r.stale || !r.ok || req !== p.req || state.view !== v) return;
    const turn = (q) => (turned() ? turnPattern(q, false) : q), A = v.shown.stitches, B = turn(readEmbroidery(r.bytes, "x.pes")).stitches;
    const mid = (st) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y, c] of st) if (c === 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [(x0 + x1) / 2, (y0 + y1) / 2]; };
    const cell = (x, y) => Math.round(x / 5) * 8192 + Math.round(y / 5), have = new Set();
    for (const [x, y, c] of A) if (c === 0) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) have.add(cell(x + i * 5, y + j * 5));
    // (each file is centred on its own stitches: with a speck at the edge left out the two differ by that shift)
    const ma = mid(A), mb = mid(B), extra = (dx, dy) => B.filter(([x, y, c]) => c === 0 && !have.has(cell(x + dx, y + dy))).map(([x, y]) => [x + dx, y + dy]);
    let pts = extra(0, 0); const moved = extra(ma[0] - mb[0], ma[1] - mb[1]); if (moved.length < pts.length) pts = moved;
    // (stitches within 2 mm of each other are one speck)
    const groups = [];
    for (const q of pts) { const g = groups.find((h) => h.some((o) => Math.abs(o[0] - q[0]) <= 20 && Math.abs(o[1] - q[1]) <= 20)); if (g) g.push(q); else groups.push([q]); }
    const marks = groups.filter((g) => g.length > 1).map((g) => { const xs = g.map((o) => o[0]), ys = g.map((o) => o[1]), x = (Math.min(...xs) + Math.max(...xs)) / 2, y = (Math.min(...ys) + Math.max(...ys)) / 2; return [x, y, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2]; });
    if (!marks.length) { btn.textContent = "They're too small to show"; return; }
    v.marks = marks; paint(); btn.textContent = `Ringed on the preview (${marks.length})`;
    clearTimeout(showing); showing = setTimeout(() => { showing = 0; if (v.marks === marks) { v.marks = null; if (state.view === v) paint(); } detailsNote(); }, 8000);
    return;
  } finally { if (showing === 1) { showing = 0; } }
}
$("pic-details-note").onclick = (e) => {
  const d = e.target.closest("[data-details]");
  if (d) { state.pic.details = d.dataset.details; detailsUI(); makePicture(); $("pic-details").querySelector('[aria-pressed="true"]')?.focus(); return; }
  const b = e.target.closest("[data-show-left]"); if (b) showLeft(b);
};
export function paletteUI() {
  const cols = state.pic.colorsInfo.filter((c) => !c.background && c.area > 0);
  const edge = state.pic.edge && state.pic.edgeSeen;
  $("pic-merged").hidden = !state.pic.merged && !state.pic.framed && !edge;
  // (said as what happened, not as a fault: "3 colours were too close" beside a slider at 6 read like an error)
  const asked = state.pic.colors;
  $("pic-merged").textContent = state.pic.merged ? `${asked} asked for, ${cols.length} used: this picture has only ${cols.length} ${cols.length === 1 ? "colour" : "colours"} different enough to need ${cols.length === 1 ? "a thread of its own" : "threads of their own"} (the rest are shades of ${cols.length === 1 ? "it" : "these"} or of the fabric).` : "";
  // (a guess: the band may be the drawing's own, so it can be sewn, and left out again)
  if (state.pic.framed) $("pic-merged").insertAdjacentHTML("beforeend", `${state.pic.merged ? " " : ""}<span data-problem="framed">${FRAMED} <button type="button" class="link" data-edge="1">Sew the edge band too</button></span>`);
  else if (edge) $("pic-merged").insertAdjacentHTML("beforeend", `${state.pic.merged ? " " : ""}<span>The band round the picture's edge is sewn too. <button type="button" class="link" data-edge="0">Leave it out</button></span>`);
  detailsNote();
  ownedNote();
  insideNote();
  const open = state.pic.swapOpen;
  $("pic-palette").innerHTML = cols.map((c) => `<button type="button" data-id="${c.id}" aria-pressed="${!state.pic.skip.includes(c.id)}" aria-expanded="${c.id === open}" aria-controls="pic-swap">
    <i style="background:${c.hex}"></i><span>${threadHtml(c.hex, state.pic.machineName?.get(c.hex) || c.thread.name, "")}</span></button>`).join("");
  swapUI(cols);
}
// Is this picture simple enough to stitch? Said under it as soon as it is sewn (core/palette.js `flatShare`): clip
// art and logos are flat colour inside their shapes; a picture that is shaded or drawn with texture is smoothed into
// flat colours first, and says so. Either way one tap does the other: the test is a guess, and the person can see
// which sews better. (The page said only "Photos won't stitch well", before any picture was chosen: a shaded cup
// sewed as a flat white shape and nothing said why.)
// Under it, the check of the picture at the size it is sewn (PX6: core/artcheck.js measures, artwords.js says): what
// won't sew well and why (lettering, details and lines too small, soft blends, more colours than threads, a busy
// background), each with "Show where" (ringed on the picture above) and its one-tap fix where one mends it, then what
// sews well. Makers bring art from AI image tools that looks clean on screen and sews badly; "Good for stitching"
// was said of a logo whose 3 mm lettering closed up.
function verdictUI(r) {
  const p = state.pic, el = $("pic-verdict");
  el.hidden = !r || p.sample || typeof r.flat !== "number"; if (el.hidden) { el.textContent = ""; p.art = null; return; }
  const flat = !r.smooth && p.smooth !== false && r.flat >= 0.55, sewn = (r.colors || []).filter((c) => !c.background && c.area > 0 && !p.skip.includes(c.id)).length;
  const said = artSaid(r.art, { size: Math.min(p.size, p.max || p.size), max: p.max || p.size, colors: p.colors, most: MOST, style: p.style, flat, smoothed: !!r.smooth, lost: lostMuch(r.fine?.kept), bg: p.bg, skip: p.skip, sewn });
  p.art = said; p.artShown = null; $("pic-thumb").classList.remove("showing");
  el.dataset.kind = r.smooth ? "smoothed" : !flat ? "photo" : said.bad.length ? "check" : "good";
  const head = r.smooth
    ? `<b>Shaded or textured.</b> Thread sews flat colours, so this picture was smoothed into flat areas first. Look over the preview: fine details and soft shading are simplified. <button type="button" class="link" data-verdict="rough">Don't smooth it</button>`
    : p.smooth === false ? `<b>Not smoothed.</b> Shading and texture are sewn as they are, in patches of colour. <button type="button" class="link" data-verdict="smooth">Smooth it first</button>`
    : !flat ? `<b>This picture looks shaded, like a photo.</b> Thread sews flat colours, so shading turns into patches. If areas come out flat or in the wrong colour: <button type="button" class="link" data-verdict="smooth">Smooth it first</button>`
    : said.bad.length ? `<b>Flat colours with clean edges</b>, but some of it won't sew well:` : `<b>Good for stitching:</b> flat colours with clean edges.`;
  // (the sentence, what to do when no tap mends it, then the taps: "Show where" ran into the advice after it)
  const items = said.bad.map((b, i) => `<li data-art="${b.id}">${escapeHtml(b.text)}${b.fix ? "" : ` ${escapeHtml(b.else)}`}<span class="art-do">`
    + (b.spots?.length ? `<button type="button" class="link" data-art-show="${i}" aria-pressed="false">Show where</button>` : "")
    + (b.fix ? `<button type="button" class="link" data-art-fix="${i}">${escapeHtml(b.fix.label)}</button>` : "") + "</span></li>").join("");
  const help = said.bad.length || !flat ? ` <button type="button" class="link" data-art-guide>How to make art that stitches well</button>` : "";
  el.innerHTML = `<p>${head}</p>${items ? `<ul class="art-list">${items}</ul>` : ""}${said.good || help ? `<p>${escapeHtml(said.good)}${help}</p>` : ""}`;
}
$("pic-verdict").onclick = (e) => {
  const p = state.pic;
  const show = e.target.closest("[data-art-show]");
  if (show) {
    // (ringed on the picture above, in place of the parts left out; tapped again, back to those)
    const i = +show.dataset.artShow, on = p.artShown !== i;
    p.artShown = on ? i : null;
    for (const b of $("pic-verdict").querySelectorAll("[data-art-show]")) b.setAttribute("aria-pressed", String(on && +b.dataset.artShow === i));
    // (the picture drawn bigger while its places are ringed: at a phone's 64 px a ring was a dot)
    markThumb(on ? p.art.bad[i].spots : lostMuch(p.fine?.kept) ? p.fine.kept.spots : null);
    $("pic-thumb").classList.toggle("showing", on);
    if (on) $("pic-thumb").scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  const fx = e.target.closest("[data-art-fix]");
  if (fx) {
    const o = p.art?.bad[+fx.dataset.artFix]?.fix?.over; if (!o) return;
    if (o.size) { p.size = o.size; $("pic-size").value = o.size; $("pic-size-out").textContent = sizeLabel(o.size); }
    if (o.colors) { p.colors = o.colors; p.skip = []; p.swap = {}; $("pic-colors").value = o.colors; $("pic-colors-out").textContent = String(o.colors); }
    if (o.skip) p.skip = o.skip;
    makePicture(); return;
  }
  if (e.target.closest("[data-art-guide]")) { const g = $("pic-guide"); g.open = true; guideUI(); g.querySelector("summary").focus(); g.scrollIntoView({ block: "nearest", behavior: "smooth" }); return; }
  const b = e.target.closest("[data-verdict]"); if (!b) return;
  p.smooth = b.dataset.verdict === "smooth"; p.skip = []; p.swap = {};
  makePicture();
};
// "Make art that stitches well": the rules with their numbers at the size this hoop sews (recipes.js `ART`), and a
// prompt to copy into an AI image tool, filled in from what they type, the hoop's shape and the threads they own.
function guideUI() {
  const h = hoop(), turn = !!state.turn.picture && !square(), w = (turn ? h.h : h.w) - 2 * MARGIN, ht = (turn ? h.w : h.h) - 2 * MARGIN;
  const colours = owns() ? [...new Map(ownedSpools().map((s) => [s.hex.toLowerCase(), { name: colourWord(s.hex), hex: s.hex }])).values()] : [];
  const g = artGuide({ sizeMm: Math.max(w, ht), w, h: ht, colours, most: MOST, subject: $("pic-guide-subject").value });
  $("pic-guide-rules").innerHTML = g.rules.map((t) => `<li>${escapeHtml(t)}</li>`).join("");
  $("pic-guide-prompt").value = g.prompt; $("pic-guide-tip").textContent = g.tip;
}
$("pic-guide").addEventListener("toggle", () => { if ($("pic-guide").open) guideUI(); });
$("pic-guide-subject").addEventListener("input", guideUI);
$("pic-guide-copy").onclick = async () => {
  guideUI();
  const t = $("pic-guide-prompt"), said = $("pic-guide-said");
  try { await navigator.clipboard.writeText(t.value); said.textContent = "Copied: paste it into your AI tool."; }
  catch { t.focus(); t.select(); said.textContent = "Selected: copy it with Ctrl+C (⌘C on a Mac)."; }
};
// The fabric's colour inside the design (white lettering on a badge, a jersey's white diamonds) is part of it and is
// sewn; the same colour round the design is the fabric. Both said, with the one tap that leaves it out or sews it again:
// white parts went unsewn with no word, and nothing on the page said why.
function insideNote() {
  const p = state.pic, el = $("pic-inside"), f = p.fabric, show = !!f && p.closed > 0 && p.style !== "line";
  el.hidden = !show; if (!show) { el.textContent = ""; return; }
  const name = escapeHtml(nearestBrotherThread(f.hex).name.toLowerCase());
  // (the design's colours fill the Thread colours count and none is cheap to give up: the closed-in colour stays fabric
  // unless asked for, `spare`. The count is every thread sewn, this one too)
  el.innerHTML = p.spare
    ? `The ${name} closed in by the design is left as fabric: ${p.colors > 1 ? `the ${p.colors} thread colours are all the design's` : "with one thread colour, that thread is the design's"}. <button type="button" class="link" data-inside="all">Sew it in ${name} too (${p.colors + 1} threads)</button>`
    : p.inside === "none"
    ? `The ${name} closed in by the design is left as fabric, like the ${name} round it. <button type="button" class="link" data-inside="all">Sew it in ${name}</button>`
    : `The ${name} round the design is the fabric and isn't sewn. The ${name} closed in by the design is part of it, so it is sewn. <button type="button" class="link" data-inside="none">Leave it out</button>`;
}
$("pic-inside").onclick = (e) => {
  const b = e.target.closest("[data-inside]"); if (!b) return;
  state.pic.inside = b.dataset.inside; state.pic.skip = []; state.pic.swap = {}; makePicture();
};
// Every Brother thread, by hue then light to dark (greys last), for "More colours"
const CHART = (() => {
  const seen = new Set(), all = PEC_MATCH.map((t, i) => t && pecThread(i)).filter((t) => t && !seen.has(t.hex) && seen.add(t.hex));
  const key = (t) => { const [L, a, b] = lab(hexToRgb(t.hex)), c = Math.hypot(a, b); return c < 12 ? [400, -L] : [Math.round((((Math.atan2(b, a) * 180) / Math.PI + 360) % 360) / 30), -L]; };
  return all.map((t) => ({ t, k: key(t) })).sort((x, y) => x.k[0] - y.k[0] || x.k[1] - y.k[1]).map((x) => x.t);
})();
// A colour's chip, tapped: leave it out (or sew it again), or swap its thread for one of the nearest Brother threads to
// the picture's own colour that no other colour sews (a violet logo matched Brother Magenta, the nearest by eye and
// the matcher's choice, and there was no way to sew it in Violet or Purple instead)
const swapLab = (hex) => lab(hexToRgb(hex));
function swapUI(cols = state.pic.colorsInfo.filter((c) => !c.background && c.area > 0)) {
  const p = state.pic, c = cols.find((x) => x.id === p.swapOpen), box = $("pic-swap");
  box.hidden = !c;
  if (!c) { box.innerHTML = ""; return; }
  const name = (x) => p.machineName?.get(x.hex) || x.thread.name, out = p.skip.includes(c.id);
  // (the thread it sews in now among them, pressed: picking one keeps focus on it)
  const others = new Set(cols.filter((x) => x.id !== c.id).map((x) => x.hex)), want = swapLab(c.picture || c.hex), seen = new Set();
  const near = PEC_MATCH.map((t, i) => t && pecThread(i)).filter((t) => t && !others.has(t.hex) && !seen.has(t.hex) && seen.add(t.hex))
    .map((t) => ({ t, d: Math.hypot(...swapLab(t.hex).map((v, k) => v - want[k])) })).sort((a, b) => a.d - b.d).slice(0, 6).map((x) => x.t);
  if (!near.some((t) => t.hex === c.hex)) near.splice(5, 1, { hex: c.hex, name: name(c) });
  const was = p.swap[c.id]?.was, line = p.style === "line";
  box.innerHTML = `<p class="hint"><b>${threadHtml(c.hex, name(c), " ")}</b>${out ? " is left out." : ` sews the picture's <i class="pic-own" style="background:${c.picture || c.hex}" title="The picture's colour"></i> colour.`}</p>`
    + (!out && !line ? `<div class="pic-near" role="group" aria-label="Sew it in another thread instead">${near.map((t) => `<button type="button" data-hex="${t.hex}" aria-pressed="${t.hex === c.hex}"><i style="background:${t.hex}"></i><span>${threadHtml(t.hex, t.name, "")}</span></button>`).join("")}</div>` : "")
    // (any thread at all: the six nearest were the only ones offered, and a picture's red could not be sewn in blue)
    + (!out && !line ? `<details class="pic-more-threads"${p.swapMore ? " open" : ""}><summary>More colours</summary><div class="pic-chart" role="group" aria-label="Every Brother thread">${CHART.filter((t) => !others.has(t.hex)).map((t) => `<button type="button" data-hex="${t.hex}" aria-pressed="${t.hex === c.hex}" style="background:${t.hex}" title="${escapeHtml(threadLabel(t.hex, t.name).name)}" aria-label="${escapeHtml(threadLabel(t.hex, t.name).name)}"></button>`).join("")}`
      + `<span class="custom" title="Any colour"><input type="color" id="pic-swap-any" value="${c.hex}" aria-label="Any colour: sewn in the nearest Brother thread"></span></div><p class="hint">Or pick any colour: it is sewn in the nearest Brother thread no other colour here uses.</p></details>` : "")
    + `<p class="pic-swap-do"><button type="button" class="link" data-do="skip">${out ? "Sew it again" : "Leave it out"}</button>`
    + `${was && !out ? ` · <button type="button" class="link" data-do="back">Back to ${escapeHtml(was.name)}</button>` : ""}</p>`;
}
// "Use only threads I own": say which of the picture's colours share one spool, and which have none close (the
// Design tab says "quite different"; here yellow and pink sewed in one spool without a word)
function ownedNote() {
  const groups = state.pic.mine && owns() ? state.pic.owned || [] : [];
  const name = (hex) => nearestBrotherThread(hex).name.toLowerCase(), list = (a) => a.length < 3 ? a.join(" and ") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`;
  const said = [];
  for (const { hex, from } of groups) {
    const s = nearOwn(hex); if (!s) continue;
    const names = [...new Set(from.map(name))], far = from.some((c) => nearOwn(c)?.far);
    if (names.length > 1) said.push(`${list(names)} ${names.length === 2 ? "both" : "all"} sew in your ${s.label}${far ? " (quite different for some)" : ""}.`);
    else if (far) said.push(`${names[0]} sews in your ${s.label}, which is quite different.`);
  }
  const p = $("pic-owned") || Object.assign(document.createElement("p"), { id: "pic-owned", className: "hint" });
  if (!p.isConnected) $("pic-merged").after(p);
  // (one of the picture's problems: said beside Download and after too, words.js)
  const text = said.length ? `With only your threads, the picture's ${said.join(" Its ")}` : "";
  state.pic.ownedProblem = text ? { id: "owned", level: LOOK, text } : null;
  p.hidden = !said.length;
  p.innerHTML = text ? isolate(`<span data-problem="owned">${escapeHtml(text)} Add a closer spool in Threads I own, or untick “Use only threads I own”.</span>`) : "";
  if (state.view && state.view === state.views.picture) warnUI(state.view);
}
$("pic-palette").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const id = +b.dataset.id;
  state.pic.swapOpen = state.pic.swapOpen === id ? null : id; paletteUI();
};
// (with the thread it had first, to go back to)
function swapTo(id, hex) {
  const p = state.pic, c = p.colorsInfo.find((x) => x.id === id);
  const was = p.swap[id]?.was || (c && { hex: c.hex, name: p.machineName?.get(c.hex) || c.thread.name });
  p.swap = { ...p.swap, [id]: { hex, was } };
  if (was?.hex === hex) delete p.swap[id];
}
$("pic-swap").addEventListener("toggle", (e) => { if (e.target.matches?.(".pic-more-threads")) state.pic.swapMore = e.target.open; }, true);
// any colour: the nearest Brother thread that no other colour of the picture sews (two colours never share a thread)
$("pic-swap").onchange = (e) => {
  const p = state.pic, id = p.swapOpen; if (e.target.id !== "pic-swap-any" || id == null) return;
  const others = new Set(p.colorsInfo.filter((x) => x.id !== id && !x.background && x.area > 0).map((x) => x.hex)), want = swapLab(e.target.value);
  const t = CHART.filter((q) => !others.has(q.hex)).map((q) => ({ q, d: Math.hypot(...swapLab(q.hex).map((v, k) => v - want[k])) })).sort((a, b) => a.d - b.d)[0]?.q;
  if (!t || t.hex === p.colorsInfo.find((x) => x.id === id)?.hex) return;
  swapTo(id, t.hex); paletteUI(); makePicture();
};
$("pic-swap").onclick = (e) => {
  const b = e.target.closest("button"), p = state.pic, id = p.swapOpen; if (!b || id == null) return;
  const c = p.colorsInfo.find((x) => x.id === id);
  if (b.dataset.hex === c?.hex) return;
  if (b.dataset.hex) swapTo(id, b.dataset.hex);
  else if (b.dataset.do === "back") { p.swap = { ...p.swap }; delete p.swap[id]; }
  else if (b.dataset.do === "skip") p.skip = p.skip.includes(id) ? p.skip.filter((x) => x !== id) : [...p.skip, id];
  paletteUI(); makePicture();
};
const bindRange = (id, key, fmt) => {
  $(id).value = state.pic[key]; $(id + "-out").textContent = fmt(state.pic[key]);
  let t = 0;
  $(id).addEventListener("input", (e) => {
    state.pic[key] = +e.target.value; $(id + "-out").textContent = fmt(state.pic[key]);
    if (key === "colors") { state.pic.skip = []; state.pic.swap = {}; }
    clearTimeout(t); t = setTimeout(makePicture, 250);
  });
};
bindRange("pic-colors", "colors", (v) => String(v));
bindRange("pic-size", "size", sizeLabel);
bindRange("pic-angle", "angle", (v) => `${v}°`);
bindRange("pic-cross", "cross", (v) => `${v} mm`);
// warn when parts of the picture are finer than thread can show (they'd close up or turn into a single line)
// (lines under 1 mm aren't flagged: they're sewn as lines on purpose, and the warning fired on the sample flower;
// gaps only past 1.5% of what's sewn: some always close in a detailed picture, and at 0.8 mm² it showed on every one)
// (and a line too thin to keep at all, a logo's 1 px rule, over 5% of the picture across: left out without a word before)
// (and the parts of the picture no stitch reaches, in any style (keptParts, lostMuch): etsy_7's doodles at 60 mm,
// a drawing's sun rays in cross-stitch, its 1.5 mm eye, all left out while the dialog said "Checked")
// A busy picture is said, with its numbers and the way out: a rose print came out 17,000 stitches in 180 pieces, 50
// minutes of sewing, under no more than the page's "Photos won't stitch well". (From 150 cuts: the sample drawings
// that sew well have up to 130.)
const BUSY = 150;
const busyText = (b) => `This is a busy picture for embroidery: ${b.stitches.toLocaleString()} stitches in about ${Math.round(b.cuts / 10) * 10} separate pieces, and the machine stops to cut the thread after each one. It will sew, slowly, and leave many thread ends on the back.`;
function fineUI(fine) {
  const p = state.pic, gaps = fine?.narrowMm2 >= Math.max(2, 0.015 * (fine.inkMm2 || 0)), k = fine?.kept, lost = lostMuch(k);
  let hair = fine?.lost >= 0.05;
  // (the picture's problems, said beside Download and after too: words.js)
  // (said of any picture: "like inside or between small letters" was said of drawings with no letters in them)
  const gap = "Some gaps between parts of one colour are narrower than ½ mm, so they close up once sewn.", line = "A very thin line in the picture is finer than thread and is left out.";
  let gone = "";
  if (lost) {
    // (no colour named: a thin line's learned colour is its blend with the fabric, and etsy_7's pink doodles read "warm gray")
    const why = p.style === "cross" ? `for ${p.cross} mm crosses` : `to sew at ${Math.min(p.size, p.max || p.size)} mm`;
    gone = k.lost === 1 ? `One part of the picture (${k.big.toFixed(1)} mm) is too small or too thin ${why}, so it's left out.`
      : `${k.lost} of the picture's ${k.parts} parts are too small or too thin ${why}, so they're left out.`;
  }
  // (a thin line left out is one of those parts: said once)
  if (lost) hair = false;
  markThumb(lost ? k.spots : null);
  const ringed = lost && k.spots?.length ? (k.lost > k.spots.length ? " (the biggest are ringed in your picture above)" : " (ringed in your picture above)") : "";
  const busyNow = p.busy && p.style === "fill" ? p.busy : null, fewer = busyNow && p.colors > 2 ? Math.max(2, Math.min(p.colors - 2, 4)) : 0;
  p.fineProblems = [gaps && { id: "gaps", level: LOOK, text: gap }, hair && { id: "hairline", level: LOOK, text: line }, lost && { id: "lost", level: LOOK, text: gone },
    busyNow && { id: "busy", level: TIP, text: busyText(busyNow) }].filter(Boolean);
  $("pic-fine").hidden = !gaps && !hair && !lost && !busyNow;
  // (each fix was sewn first and keeps them: checkLost)
  const fixes = (p.fixes || []).map((f, i) => `<button type="button" class="link" data-fix="${i}">${escapeHtml(f.label)}</button>`).join(" ");
  $("pic-fine").innerHTML = isolate([
    gaps ? `<span data-problem="gaps">${gap} ${p.size < (p.max || 0) ? "A bigger Size keeps more of them open." : "This is as big as the hoop allows."}</span>` : "",
    hair ? `<span data-problem="hairline">${line} Draw it thicker in the picture to have it sewn.</span>` : "",
    busyNow ? `<span data-problem="busy">${busyText(busyNow)} ${fewer ? `<button type="button" class="link" data-fewer="${fewer}">Try ${fewer} thread colours</button>, or a` : "A"} simpler picture, sews cleaner.</span>` : "",
    lost ? `<span data-problem="lost">${escapeHtml(gone.replace(/\.$/, ringed + "."))} ${fixes || (p.checking ? "" : k.lost === 1 ? "Draw it bigger or bolder in the picture to have it sewn." : "Draw them bigger or bolder in the picture to have them sewn.")}</span>` : "",
  ].filter(Boolean).join(" "));
  if (state.view && state.view === state.views.picture) warnUI(state.view);
}
$("pic-fine").onclick = (e) => {
  const few = e.target.closest("[data-fewer]");
  if (few) { const p = state.pic, n = +few.dataset.fewer; p.colors = n; p.skip = []; p.swap = {}; $("pic-colors").value = n; $("pic-colors-out").textContent = String(n); makePicture(); $("pic-colors").focus(); return; }
  const b = e.target.closest("[data-fix]"), f = b && state.pic.fixes?.[+b.dataset.fix]; if (!f) return;
  const p = state.pic, o = f.over;
  if (o.style) { p.style = o.style; styleUI(); }
  if (o.details) { p.details = o.details; detailsUI(); }
  if (o.cross) { p.cross = o.cross; $("pic-cross").value = o.cross; $("pic-cross-out").textContent = `${o.cross} mm`; }
  if (o.colors) { p.colors = o.colors; p.skip = []; p.swap = {}; $("pic-colors").value = o.colors; $("pic-colors-out").textContent = String(o.colors); }
  if (o.size) { p.size = o.size; $("pic-size").value = o.size; $("pic-size-out").textContent = sizeLabel(o.size); }
  makePicture();
};
// The one-tap fixes for what a picture leaves out: each is sewn first on the checking worker (the picture never waits
// for it) and offered only if it keeps three in four of the parts left out now (the smallest bigger Size that does,
// more thread colours, smaller crosses, another style).
// Sewn again on the picture's worker it's the same file at once (picFits).
async function checkLost(s, req) {
  const p = state.pic, stale = () => req !== p.req;
  // (the parts left out now, three in four of them kept: a bigger Size counts parts too small to count before, so
  // "nothing worth saying" never came at 174 mm for etsy_7)
  const now = new Set(p.fine.kept.ids);
  // (null: newer settings came; else { kept: three in four of them sewn, quiet: no lost note at all })
  const keeps = async (over) => {
    const r = await sewPicture({ ...s, ...over }, picChecks, stale);
    if (r.stale || stale()) return null;
    const still = r.ok ? r.fine.kept.ids.filter((i) => now.has(i)).length : now.size, kept = still <= 0.25 * now.size;
    return { kept, quiet: kept && !lostMuch(r.fine.kept), saved: now.size - still };
  };
  const offer = (label, over) => { p.fixes.push({ label, over }); fineUI(p.fine); };
  p.checking = true;
  // the Small details choice, when keeping them all sews those parts (it is why they're out; no bigger Size needed)
  if (s.style === "fill" && s.details !== "all" && p.fine.left) {
    const q = await keeps({ details: "all" }); if (!q) return;
    if (q.kept) offer("Keep the specks", { details: "all" });
  }
  // the smallest Size, in 5 mm steps, that keeps them (with no note left, when the biggest that fits manages that)
  if (s.size < p.max) {
    const top = await keeps({ size: p.max }); if (!top) return;
    if (top.kept) {
      const good = (q) => (top.quiet ? q.quiet : q.kept);
      let lo = s.size, hi = p.max;
      for (let i = 0; i < 3; i++) {
        const mid = Math.round((lo + hi) / 10) * 5; if (mid <= lo || mid >= hi) break;
        const q = await keeps({ size: mid }); if (!q) return;
        if (good(q)) hi = mid; else lo = mid;
      }
      offer(`Make it ${hi} mm${hi === p.max ? " (as big as fits)" : ""}`, { size: hi });
    } else if (top.saved >= Math.max(2, 0.4 * now.size)) {
      // (no Size keeps three in four, but the biggest keeps many: said with how many. etsy_7 Filled at 30-70 mm had
      // no fix offered, though a bigger Size kept most of its doodles)
      offer(`Make it ${p.max} mm (as big as fits: ${top.saved} of the ${now.size} are sewn)`, { size: p.max });
    }
  }
  // the fewest more thread colours that keep them (a pale colour sewn as fabric when threads ran short)
  if (s.colors < MOST && !s.skip.length) {
    const top = await keeps({ colors: MOST }); if (!top) return;
    for (let c = s.colors + 1; top.kept && c <= MOST; c++) {
      const q = c === MOST ? top : await keeps({ colors: c }); if (!q) return;
      if (q.kept) { offer(`Use ${c} thread colours`, { colors: c }); break; }
    }
  }
  const others = [s.style === "cross" && s.cross > 1.5 && ["Use 1.5 mm crosses", { cross: 1.5 }], s.style !== "fill" && ["Sew it Filled", { style: "fill" }],
    s.style !== "line" && ["Sew it as a line drawing (one thread)", { style: "line" }]].filter(Boolean);
  for (const [label, over] of others) { const q = await keeps(over); if (!q) return; if (q.kept) offer(label, over); }
  p.checking = false; fineUI(p.fine);
}
const detailsUI = () => document.querySelectorAll("#pic-details button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === detailsOf(state.pic)));
detailsUI();
$("pic-details").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  state.pic.details = b.dataset.v; detailsUI(); makePicture();
};
const densityUI = () => document.querySelectorAll("#pic-density button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.d === state.pic.density));
densityUI();
$("pic-density").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  state.pic.density = b.dataset.d; store.set("pic.density", state.pic.density); densityUI(); makePicture();
};
// filled, a line drawing (redwork) or cross-stitch; each shows only its own settings
function styleUI() {
  const s = state.pic.style;
  document.querySelectorAll("#pic-style button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.s === s));
  $("pic-angle-row").hidden = $("pic-density-row").hidden = $("pic-details-row").hidden = s !== "fill"; $("pic-cross-row").hidden = s !== "cross";
  $("pic-colors-label").textContent = s === "line" ? "Colours to trace" : "Thread colours";
  $("pic-line-row").hidden = s !== "line";
  lineUI();
}
// Line drawing sews one thread: the picture's darkest colour (Auto), or one of the Design tab's Brother threads, or any
// colour (sewn in its nearest Brother thread)
$("pic-line").innerHTML = `<button type="button" data-line="" class="auto">Auto</button>`
  + LINE_THREADS.map((c) => `<button type="button" data-line="${c}" style="background:${c}" title="Brother ${nearestBrotherThread(c).name}" aria-label="Brother ${nearestBrotherThread(c).name}"></button>`).join("")
  + `<span class="custom" title="Any colour"><input type="color" id="pic-line-any" value="#000000" aria-label="Any colour"></span>`;
function lineUI() {
  const p = state.pic, auto = p.autoLine || "";
  for (const b of $("pic-line").querySelectorAll("button")) b.setAttribute("aria-pressed", b.dataset.line === p.line);
  const a = $("pic-line").querySelector(".auto");
  a.style.background = auto; a.style.color = auto && lightOf(auto) < 0.55 ? "#fff" : "";
  a.title = auto ? `Auto: Brother ${nearestBrotherThread(auto).name}, the picture's darkest colour` : "Auto: the picture's darkest colour";
  a.setAttribute("aria-label", a.title);
  $("pic-line-name").textContent = p.line ? `Brother ${nearestBrotherThread(p.line).name}.` : `${auto ? `Brother ${nearestBrotherThread(auto).name}: ` : ""}the picture's darkest colour.`;
}
const lightOf = (hex) => { const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
$("pic-line").onclick = (e) => {
  const b = e.target.closest("button"); if (!b || b.dataset.line === state.pic.line) return;
  state.pic.line = b.dataset.line; lineUI(); makePicture();
};
$("pic-line-any").onchange = (e) => { state.pic.line = nearestBrotherThread(e.target.value).hex; lineUI(); makePicture(); };
$("pic-style").onclick = (e) => { const b = e.target.closest("button"); if (!b || b.dataset.s === state.pic.style) return; state.pic.style = b.dataset.s; styleUI(); makePicture(); };
styleUI();
$("pic-bg").onchange = (e) => { state.pic.bg = e.target.checked; state.pic.skip = []; state.pic.swap = {}; state.pic.inside = "auto"; makePicture(); };
// first visit: show a sample so the page opens on real stitches, not an empty box
async function loadSample() {
  try {
    const blob = await (await fetch("assets/sample-flower.png")).blob();
    if (state.pic.bitmap) return;
    await loadPicture(new File([blob], "sample-flower.png", { type: "image/png" }), true);
  } catch { /* the empty state still explains what to do */ }
}
// the picture from the last visit, with its settings, else the sample
export async function lastPicture() {
  const p = state.pic, n = p.loads, got = await kept.get("picture");
  if (p.bitmap || n !== p.loads || state.mode !== "picture") return;
  if (got?.blob instanceof Blob && typeof got.name === "string") {
    const o = store.get("pic.last", {}) || {};
    if (["fill", "line", "cross"].includes(o.style)) p.style = o.style;
    for (const [k, lo, hi] of [["colors", 1, 99], ["size", 10, 400], ["angle", 0, 180], ["cross", 1, 10]]) if (Number.isFinite(o[k]) && o[k] >= lo && o[k] <= hi) { p[k] = o[k]; $("pic-" + k).value = o[k]; $(`pic-${k}-out`).textContent = { colors: String, size: sizeLabel, angle: (v) => `${v}°`, cross: (v) => `${v} mm` }[k](o[k]); }
    if (typeof o.bg === "boolean") $("pic-bg").checked = p.bg = o.bg;
    if (DETAILS.includes(o.details)) { p.details = o.details; detailsUI(); }
    if (o.line === "" || /^#[0-9a-f]{6}$/i.test(o.line)) p.line = o.line;
    styleUI();
    await loadPicture(new File([got.blob], got.name, { type: got.blob.type }), false, true);
    if (p.bitmap) return;
  }
  loadSample();
}
// (`again`: the kept picture from the last visit, not kept again)
export async function loadPicture(file, sample = false, again = false) {
  if (file && /\.(pes|pec|dst)$/i.test(file.name)) { openDesign(file); return; }   // (an embroidery file: open it as one)
  if (!file || !file.type.startsWith("image/")) { showError("That doesn't look like a picture. Try a PNG or JPG."); return; }
  state.pic.loads++;
  try {
    const bitmap = await createImageBitmap(file);
    if (!sample && !again) keepPicture(file, file.name);
    // (the Small details choice is about one picture: a new one starts with specks left out, as the panel shows.
    // "Keep" taken for the last picture stayed on for the next with nothing said.)
    if (!again && state.pic.details === "all") { state.pic.details = "most"; detailsUI(); }
    Object.assign(state.pic, { file, bitmap, sample, box: null, key: state.pic.key + 1, skip: [], swap: {}, inside: "auto", smooth: null, edge: false, edgeSeen: false, models: new Map(), autoLine: "" });
    Object.assign(state.pic, { whole: bitmap, part: 0, partThumbs: null, found: sample ? null : findParts(bitmap) }); partsUI();
    setThumb(file); $("pic-rotate").hidden = false;
    $("pic-drop").querySelector(".drop-text").innerHTML = sample ? "<b>Choose your own picture</b> or drop it here." : `${again ? "Your last picture, " : ""}<b>${escapeHtml(file.name)}</b> · choose another`;
    $("pic-sample-note").hidden = !sample;
    $("pic-settings").hidden = false;
    setMode("picture"); makePicture();
  } catch { showError("This picture couldn't be opened. Try saving it as a PNG or JPG."); }
}
// (the parts of a picture of several separate things: core/digitize.js `findParts`, `cutPart`)
function partsUI() {
  const p = state.pic, f = p.found, row = $("pic-parts-row");
  row.hidden = !f || p.sample; if (row.hidden) { $("pic-parts").innerHTML = ""; return; }
  $("pic-parts-n").textContent = String(f.parts.length);
  p.partThumbs ||= f.parts.map((_, n) => { const c = cutPart(p.whole, f, n), t = document.createElement("canvas"), s = Math.min(1, 144 / Math.max(c.width, c.height)); t.width = Math.max(1, Math.round(c.width * s)); t.height = Math.max(1, Math.round(c.height * s)); t.getContext("2d").drawImage(c, 0, 0, t.width, t.height); return t.toDataURL(); });
  $("pic-parts").innerHTML = `<button type="button" data-part="0" aria-pressed="${!p.part}">All together</button>`
    + f.parts.map((_, n) => `<button type="button" data-part="${n + 1}" aria-pressed="${p.part === n + 1}" aria-label="Part ${n + 1} on its own"><img src="${p.partThumbs[n]}" alt="">Part ${n + 1}</button>`).join("");
}
$("pic-parts").onclick = async (e) => {
  const b = e.target.closest("[data-part]"), p = state.pic; if (!b || !p.whole) return;
  const n = +b.dataset.part; if (n === (p.part || 0)) return;
  const cut = n ? cutPart(p.whole, p.found, n - 1) : null, bitmap = cut ? await createImageBitmap(cut) : p.whole;
  // (the picture shown above is what is sewn: its left-out parts are ringed on it)
  setThumb(cut ? (cut.convertToBlob ? await cut.convertToBlob() : await new Promise((r) => cut.toBlob(r))) : p.file);
  Object.assign(p, { bitmap, part: n, box: null, key: p.key + 1, skip: [], swap: {}, inside: "auto", smooth: null, edge: false, edgeSeen: false, models: new Map(), autoLine: "" });
  partsUI(); makePicture(); $("pic-parts").querySelector('[aria-pressed="true"]')?.focus();
};
// OffscreenCanvas where available (iOS 16.4+), a plain canvas otherwise
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}
// Size is the longer side of what's sewn, up to the largest that fits this hoop (it measured the whole picture: a
// framed photo at "174 mm" sewed 84 x 58)
function sizeRange(max) {
  const p = state.pic; p.max = max;
  $("pic-size").max = max;
  if (p.size > max) p.size = max;
  $("pic-size").value = p.size; $("pic-size-out").textContent = sizeLabel(p.size);
}
$("pic-file").onchange = (e) => loadPicture(e.target.files[0]);
function setThumb(blob) {
  const thumb = $("pic-thumb"), p = state.pic;
  if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl);
  p.thumbUrl = thumb.src = URL.createObjectURL(blob); p.marked = ""; thumb.hidden = false;
}
// The parts of the picture left out, ringed on its thumbnail (`spots`: fractions of the copy the colours were learned
// from, keptParts); none: the plain picture again. ("A very thin line is left out" didn't say which: a child's
// dinosaur had lost its eye and nobody could see where.)
// Also the places the check of the picture points at ("Show where", verdictUI).
function markThumb(spots) {
  const p = state.pic, b = p.bitmap, thumb = $("pic-thumb"), key = spots?.length ? JSON.stringify([p.key, p.bg, p.edge, spots]) : "";
  if (!b || key === (p.marked || "")) return;
  p.marked = key;
  if (!key) { thumb.src = p.thumbUrl; thumb.alt = ""; return; }
  const k = Math.min(1, 480 / Math.max(b.width, b.height)), c = document.createElement("canvas"), g = c.getContext("2d");
  c.width = Math.round(b.width * k); c.height = Math.round(b.height * k);
  g.drawImage(b, 0, 0, c.width, c.height);
  const box = p.bg && !p.edge && p.box ? p.box : { sx: 0, sy: 0, sw: b.width, sh: b.height }, u = Math.max(c.width, c.height) / 90;
  for (const [x0, y0, x1, y1] of spots) {
    const X = (box.sx + ((x0 + x1) / 2) * box.sw) * k, Y = (box.sy + ((y0 + y1) / 2) * box.sh) * k;
    // (an ellipse round the part's box: a circle round a line of lettering covered the whole picture)
    const rx = Math.max(((x1 - x0) * box.sw * k) / 2, u) + 1.5 * u, ry = Math.max(((y1 - y0) * box.sh * k) / 2, u) + 1.5 * u;
    g.beginPath(); g.ellipse(X, Y, rx * (rx > 3 * ry ? 1.08 : 1), ry, 0, 0, 2 * Math.PI);
    g.lineWidth = 2.2 * u; g.strokeStyle = "#fff"; g.stroke(); g.lineWidth = 1.2 * u; g.strokeStyle = "#d1005a"; g.stroke();
  }
  thumb.src = c.toDataURL(); thumb.alt = "Your picture, with the parts that are left out ringed";
}
// a quarter turn clockwise; the turned picture is what gets stitched (and shown in the thumbnail)
$("pic-rotate").onclick = async () => {
  // (the whole picture turns, and its parts are found again)
  const p = state.pic, b = p.whole || p.bitmap; if (!b) return;
  const c = makeCanvas(b.height, b.width), ctx = c.getContext("2d");
  ctx.translate(b.height, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(b, 0, 0);
  Object.assign(p, { bitmap: await createImageBitmap(c), box: null, key: p.key + 1, skip: [], swap: {}, edge: false, edgeSeen: false, models: new Map() });
  Object.assign(p, { whole: p.bitmap, part: 0, partThumbs: null, found: p.sample ? null : findParts(p.bitmap) }); partsUI();
  const blob = c.convertToBlob ? await c.convertToBlob() : await new Promise((r) => c.toBlob(r));
  setThumb(blob); if (!p.sample) keepPicture(blob, p.file.name.replace(/\.[^.]+$/, ".png"));
  makePicture();
};
