/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Threads as the app names them: one label per colour on every surface (the machine's name, the person's own close
// spool first), the thread list for Have ready, the brand chooser and Threads I own. Labels only: files carry
// the machine's colours. (Part of app.js until 2026-11.)
import { PEC_THREADS, nearestBrotherThread, rgbToHex } from "./core/threads.js";
import { BRANDS, apart, brotherNum, chartSpools, exampleSpools, nearestSpool, nearestSpools, ownSpoolOf, spools } from "./core/brands.js";
import { $, kept, state, store } from "./state.js";
import { next } from "./focus.js";
import { along } from "./along.js";
import { escapeHtml, makePicture, modal, paletteUI, setView, studio } from "./app.js";

// ---------- thread brand ----------
// One label for a thread on every surface (chips, steps, Sew along, sew sheet, Picture palette, the editor): `name`
// leads, `note` follows in small. A spool they own and use for the colour leads ("Your Sulky Rayon 1076 Royal Blue",
// note "the machine calls it Wisteria Violet": "Brother Wisteria Violet · your Sulky 1076 Royal Blue" read as the wrong
// thread); otherwise the machine's name, with "≈ Isacord 1306", "spool 007" or a far owned spool in the note; `short`:
// the chips' note (a long "nearest of yours … is quite different" under each chip shrank the preview: it's the tooltip).
// `machine`: the name the file gives the colour, so Brother's spool number is that thread's
// `guide`: the colour is sewn only as guide lines under fabric (the Design tab says so from its steps; else the view's)
export function threadLabel(hex, machine, guide = guideColour(hex)) {
  const lead = { name: `Brother ${machine}`, note: "", short: "" };
  if (!state.brand) return lead;
  const s = owns() ? nearOwn(hex) : nearestSpool(state.brand, hex);
  if (!s) return lead;
  // (an owned spool far from the colour isn't a match: white showed as "your Isacord 5513", a green; `far` in brands.js)
  // (Brother's own spools match the machine's colours exactly: just the number of the thread the machine names)
  if (!owns()) { const note = state.brand === "brother" ? `spool ${brotherNum(machine) || s.num}` : `≈ ${s.label}`; return { ...lead, note, short: note }; }
  // (one wording for no close spool on every surface: the chip said "none of yours is close" and the steps and editor
  // "nearest of yours, Sulky 1076 Royal Blue, is quite different". A placement line under the appliqué fabric is only
  // a guide: its thread hardly matters, so it isn't "quite different")
  if (s.far) return guide ? { ...lead, note: "only a guide line: any thread will do", short: "only a guide line: any thread will do" }
    : { ...lead, note: `none of yours is close (the nearest, ${s.label}, is quite different)`, short: "none of yours is close" };
  const name = `Your ${s.label}`;
  // (their Brother spool is the machine's own thread: "Your Brother 007 Prussian Blue · the machine calls it Prussian
  // Blue" said the name twice)
  if (!s.own && state.brand === "brother" && s.name === machine) return { name, note: "", short: "" };
  // (the file's thread for this colour may be another colour, its nearest being taken by another colour: a navy spool
  // of theirs read "the machine calls it Olive Green" with nothing to say that's fine)
  const t = PEC_THREADS.find((x) => x && x[0] === machine), other = t && apart(s.hex, rgbToHex(t.slice(1, 4)));
  return other ? { name, note: `the machine calls it ${machine}: that's fine, it's only the name on its screen`, short: `the machine calls it ${machine}: that's fine` }
    : { name, note: `the machine calls it ${machine}`, short: `the machine calls it ${machine}` };
}
// whether they've listed spools of their own for the brand shown (its chart's, or their own from other brands)
export const owns = () => !!state.brand && (state.spools[state.brand]?.length > 0 || state.mine.length > 0);
// the nearest spool of theirs to a colour (`far` when none is close), or null when they've listed none
export const nearOwn = (hex) => owns() ? nearestSpool(state.brand, hex, state.spools[state.brand] || [], state.mine) : null;
// a colour sewn only as guide lines under fabric (appliqué placement lines: hidden in the preview, `hide`)
function guideColour(hex) {
  const v = state.view, bl = v?.cache?.blocks;
  if (!v?.hide?.size || !bl) return false;
  const mine = bl.filter((b) => b.color === hex);
  return mine.length > 0 && mine.every((b) => v.hide.has(b.index));
}
// the label as one line ("Your Isacord 1902 · the machine calls it Red"), for text without a small note
export const threadLine = (hex, machine, guide) => { const l = threadLabel(hex, machine, guide); return l.note ? `${l.name} · ${l.note}` : l.name; };
// as html: the name, then the note in small (`sep` before it)
export const threadHtml = (hex, machine, sep = " ", guide) => { const l = threadLabel(hex, machine, guide); return `${escapeHtml(l.name)}${l.note ? `${sep}<small>${escapeHtml(l.note)}</small>` : ""}`; };
// the spool they own for a colour ("Isacord 0015 White"), for supply lists; "" when they haven't listed one close to it
export function ownSpool(hex) {
  const s = nearOwn(hex);
  return s && !s.far ? s.label : "";
}
// the threads for a supply list: by the spools they own when they've listed some, the rest as what to buy ("To buy:
// Brother 007 Prussian Blue"; Have ready mixed owned and missing threads)
// `machineName(hex)`: the name the file's own palette gives the colour (a colour whose nearest Brother thread another
// colour took gets the next one: "for Brother Dark Gray" while the steps said Olive Green)
// (one spool per entry: "Isacord 3541 (for Brother Violet, Brother Purple)", not 3541 three times; a spool that's only
// the nearest the brand has says so, as the thread chips do; a brand without spools listed gives its numbers here too)
export function threadList(colors, machineName = (hex) => nearestBrotherThread(hex).name) {
  const own = owns(), name = (hex) => `Brother ${machineName(hex)}`;
  const and = (a) => a.length < 3 ? a.join(" and ") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`;
  const uniq = [...new Set(colors)];
  if (state.brand && !own && state.brand !== "brother") {
    const by = new Map();
    for (const h of uniq) { const s = nearestSpool(state.brand, h); if (!by.has(s.label)) by.set(s.label, { s, names: [] }); const n = name(h); if (!by.get(s.label).names.includes(n)) by.get(s.label).names.push(n); }
    return `Thread: ${[...by.values()].map(({ s, names }) => `${and(names)} ≈ ${s.label}${s.far ? " (the nearest, quite different)" : ""}`).join(", ")}.`;
  }
  if (!own) return `Thread: ${[...new Set(uniq.map((h) => state.brand ? `Brother ${brotherNum(machineName(h)) || nearestSpool(state.brand, h).num} ${machineName(h)}` : name(h)))].join(", ")}.`;
  const mine = [...new Set(uniq.map(ownSpool).filter(Boolean))];
  const buy = new Map();
  for (const h of uniq.filter((x) => !ownSpool(x))) {
    const s = nearestSpool(state.brand, h);
    if (state.brand === "brother") { const n = brotherNum(machineName(h)); if (n) Object.assign(s, { label: `Brother ${n} ${machineName(h)}`, far: false }); }
    if (!buy.has(s.label)) buy.set(s.label, { names: [], far: [] });
    const e = buy.get(s.label), n = machineName(h);
    if (!e.names.includes(n)) { e.names.push(n); if (s.far) e.far.push(n); }
  }
  const bought = [...buy].map(([label, { names, far }]) => state.brand === "brother" ? label
    : `${label} (for ${and(names.map((n) => `Brother ${n}`))}${far.length ? `; a rough match${far.length < names.length ? ` for ${and(far)}` : ""}` : ""})`);
  return [mine.length ? `Your threads: ${mine.join(", ")}.` : "", bought.length ? `To buy: ${bought.join(", ")}.` : ""].filter(Boolean).join(" ");
}
export function brandUI() {
  // (one choice per meaning: "Brother thread" and "Brother spool numbers" side by side read as the same thing. The
  // machine's names are always shown; a brand adds its spool numbers)
  $("brand").innerHTML = `<option value="">Thread names</option><optgroup label="Add spool numbers for">`
    + Object.entries(BRANDS).map(([k, n]) => `<option value="${k}">${n}</option>`).join("") + `</optgroup><option value="@mine">Threads I own…</option>`;
  // (with spools listed, the brand reads "My Isacord": "Isacord (threads I own)" was cut off by the select)
  for (const o of $("brand").options) if (o.value && state.spools[o.value]?.length) o.textContent = `My ${BRANDS[o.value]}`;
  // (only spools of other brands: "My threads", the brand still giving the numbers of threads to buy)
    else if (o.value && o.value === state.brand && state.mine.length) o.textContent = "My threads";
  $("brand").value = state.brand;
  $("brand").title = state.brand ? `The machine's thread names, with the ${BRANDS[state.brand]} spool numbers beside them` : "The machine's thread names. Pick a brand to see its spool numbers too.";
  const mine = owns();
  $("pic-mine-row").hidden = !mine; $("pic-mine").checked = !!mine && state.pic.mine;
}
// (the Design tab's editor too: its thread hint kept the old label until a reload)
function relabel() { if (state.view) setView(state.view); paletteUI(); if (state.mode === "design") studio.relabel(); }
$("brand").onchange = (e) => {
  if (e.target.value === "@mine") { e.target.value = state.brand; openSpools(); return; }
  state.brand = e.target.value; store.set("brand", state.brand); brandUI(); relabel();
  if (state.pic.mine && state.mode === "picture") makePicture();
};
function openSpools() {
  $("spools-brand").innerHTML = Object.entries(BRANDS).map(([k, n]) => `<option value="${k}">${n}</option>`).join("");
  $("spools-brand").value = state.brand || "brother";   // (a Brother machine's owner mostly has Brother spools)
  $("spools-list").value = (state.spools[$("spools-brand").value] || []).join(" ");
  $("spools-find").value = ""; spoolNear = null; spoolsMine = state.mine.map((o) => ({ ...o }));
  $("spools-own").hidden = true; $("own-brand").value = $("own-num").value = ""; $("own-hint").textContent = "";
  spoolsGrid(); modal($("spools"));
}
// (examples in the brand's own numbers: Brother's showed Isacord-like "0020 1902 3541")
const spoolsHint = () => { $("spools-list").placeholder = `The numbers on your spools, e.g. ${exampleSpools($("spools-brand").value)}`; };
// Every spool in the brand's chart as a swatch to tick, in colour-card order, with a search by number or name: a list
// of numbers typed from memory was the only way in, and Isacord's chart has no names to guess from. The numbers box
// (for pasting a list) stays the record; ticking adds or takes a number from it.
function spoolsGrid() {
  const b = $("spools-brand").value, all = chartSpools(b);
  $("spools-grid").innerHTML = all.map((s) => `<button type="button" data-spool="${s.num}" aria-pressed="false" tabindex="-1" title="${escapeHtml(s.label)}" aria-label="${escapeHtml(s.label)}"><i style="background:${s.hex}"></i><span>${s.num}</span></button>`).join("");
  spoolsFind(); spoolsPreview();
}
// Brands not charted here, by name, so a search for one says so (it said "No spool with that number or name")
const UNLISTED = ["Madeira", "Gunold", "Floriani", "Marathon", "Polyneon", "Mettler", "Coats", "Gütermann", "Gutermann", "Janome", "Simthread", "Exquisite", "Superior", "Aurifil", "Fil-Tec", "Glide", "Embrilliance", "Pfaff", "Husqvarna", "Bernina", "Singer", "Babylock", "Baby Lock", "Amann", "Ackermann", "Royal", "Medeira"];
// A spool from a brand that isn't charted (Madeira) is matched by its colour: the colour picked shows the nearest
// spools of the brand chosen here (`near`), to tick the closest; any search is set aside meanwhile.
let spoolNear = null;
// their own spools from other brands while the dialog is open (state.mine once saved)
let spoolsMine = [];
function spoolsFind() {
  const q = $("spools-find").value.trim().toLowerCase(), b = $("spools-brand").value, nz = q.replace(/^0+(?=\d)/, "");
  const names = Object.fromEntries(chartSpools(b).map((s) => [s.num, s.name.toLowerCase()]));
  const near = spoolNear && new Set(nearestSpools(b, spoolNear));
  let first = null;
  for (const el of $("spools-grid").children) {
    const n = el.dataset.spool, show = near ? near.has(n) : !q || n.replace(/^0+(?=\d)/, "").startsWith(nz) || n.startsWith(q) || names[n].includes(q);
    el.hidden = !show; if (show && !first) first = el;
  }
  roveSpool($("spools-grid").querySelector("button:not([hidden])[tabindex='0']") || first);
  $("spools-all").hidden = !near;
  const other = UNLISTED.find((u) => q.includes(u.toLowerCase()));
  $("spools-none").hidden = !!first || !q || !!near;
  $("spools-none").textContent = other ? `${other} isn't one of the brands here: pick your spool's colour below and add it as your own ${other === "Medeira" ? "Madeira" : other} spool.`
    : `No ${BRANDS[b]} spool with that number or name. A spool from another brand: pick its colour below and add it as your own.`;
}
// (a colour picked offers to add it as their own spool, its brand from the search if one was named there: "Madeira");
// the search is cleared, as it's set aside ("Prussian" stayed in the box while the grid showed pinks)
$("spools-colour").oninput = (e) => {
  const other = UNLISTED.find((u) => $("spools-find").value.toLowerCase().includes(u.toLowerCase()));
  if (other && !$("own-brand").value.trim()) $("own-brand").value = other === "Medeira" ? "Madeira" : other;
  spoolNear = e.target.value; $("spools-find").value = ""; $("spools-own").hidden = false;
  $("own-hint").textContent = `Below: the nearest ${BRANDS[$("spools-brand").value]} spools. Tick one only if you own that spool too.`;
  spoolsFind();
};
$("own-add").onclick = () => {
  const brand = $("own-brand").value.trim().replace(/\s+/g, " "), num = $("own-num").value.trim().replace(/\s+/g, " "), hex = $("spools-colour").value.toLowerCase();
  if (!brand) { $("own-hint").textContent = "Type the brand printed on the spool first (Madeira, Gunold…)."; $("own-brand").focus(); return; }
  const o = { brand, num, hex };
  spoolsMine = [...spoolsMine.filter((x) => !(x.brand.toLowerCase() === brand.toLowerCase() && x.num === num && (num || x.hex === hex))), o];
  $("own-num").value = ""; $("own-hint").textContent = `Added your ${ownSpoolOf(o).label}. Save keeps it.`;
  spoolsPreview();
};
for (const id of ["own-brand", "own-num"]) $(id).onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); $("own-add").click(); } };
$("spools-all").onclick = () => { spoolNear = null; spoolsFind(); $("spools-colour").focus(); };
function roveSpool(el) { for (const x of $("spools-grid").querySelectorAll("[tabindex='0']")) x.tabIndex = -1; if (el) el.tabIndex = 0; }
function spoolsPreview() {
  const b = $("spools-brand").value, typed = $("spools-list").value.split(/[\s,;]+/).filter(Boolean), got = spools(b, $("spools-list").value);
  spoolsHint();
  const missing = typed.filter((t) => !spools(b, t).length), have = new Set(got);
  for (const el of $("spools-grid").children) el.setAttribute("aria-pressed", have.has(el.dataset.spool));
  const n = spoolsMine.length;
  $("spools-note").textContent = (got.length ? `${got.length} ${BRANDS[b]} ${got.length === 1 ? "spool" : "spools"} ticked.` : n ? "" : "None ticked yet.")
    + (n ? ` ${n} of your own from other brands.` : "")
    + (missing.length ? ` Not in our ${BRANDS[b]} chart: ${missing.join(", ")} (another brand's numbers? Pick that brand above, or match each spool by its colour).` : "");
  $("spools-chips").innerHTML = got.map((n) => { const s = nearestSpool(b, "#000000", [n]); return `<span><i style="background:${s.hex}"></i>${n}${s.name ? ` ${escapeHtml(s.name)}` : ""}</span>`; }).join("")
    + spoolsMine.map((o, i) => { const l = escapeHtml(ownSpoolOf(o).label); return `<span><i style="background:${o.hex}"></i>${l}<button type="button" class="x" data-unown="${i}" aria-label="Take ${l} off" title="Take it off">×</button></span>`; }).join("");
}
$("spools-grid").onclick = (e) => {
  const el = e.target.closest("[data-spool]"); if (!el) return;
  const b = $("spools-brand").value, n = el.dataset.spool, got = spools(b, $("spools-list").value);
  const next = got.includes(n) ? got.filter((x) => x !== n) : [...got, n];
  // (anything typed that isn't in the chart stays, so the note can still say so)
  const odd = $("spools-list").value.split(/[\s,;]+/).filter((t) => t && !spools(b, t).length);
  $("spools-list").value = [...next, ...odd].join(" ");
  roveSpool(el); spoolsPreview();
};
// arrow keys go between the swatches (one Tab stop for the whole chart: 391 Isacord spools)
$("spools-grid").onkeydown = (e) => {
  const el = e.target.closest("[data-spool]"); if (!el) return;
  const shown = [...$("spools-grid").children].filter((x) => !x.hidden), i = shown.indexOf(el);
  const cols = Math.max(1, shown.filter((x) => x.offsetTop === shown[0].offsetTop).length);
  const to = { ArrowLeft: i - 1, ArrowRight: i + 1, ArrowUp: i - cols, ArrowDown: i + cols, Home: 0, End: shown.length - 1 }[e.key];
  if (to == null || !shown[to]) return;
  e.preventDefault(); roveSpool(shown[to]); shown[to].focus();
};
// (typing a search goes back from colour matching to the whole chart)
$("spools-find").oninput = () => { spoolNear = null; spoolsFind(); };
// (Enter in the search box ticks the only spool left, rather than closing the dialog)
$("spools-find").onkeydown = (e) => {
  if (e.key !== "Enter") return; e.preventDefault();
  const shown = [...$("spools-grid").children].filter((x) => !x.hidden);
  if (shown.length === 1) shown[0].click(); else shown[0]?.focus();
};
$("spools-brand").onchange = () => { $("spools-list").value = (state.spools[$("spools-brand").value] || []).join(" "); $("spools-find").value = ""; spoolsGrid(); };
$("spools-list").oninput = spoolsPreview;
$("spools-chips").onclick = (e) => {
  const x = e.target.closest("[data-unown]"); if (!x) return;
  spoolsMine.splice(+x.dataset.unown, 1); spoolsPreview(); $("own-brand").focus();
};
$("spools-save").onclick = () => {
  const b = $("spools-brand").value;
  state.spools[b] = spools(b, $("spools-list").value); store.set("spools", state.spools);
  state.mine = spoolsMine; store.set("myspools", state.mine);
  state.brand = b; store.set("brand", b); $("spools").close(); brandUI(); relabel();
  if (state.mode === "picture" && state.pic.mine) makePicture();
};
$("pic-mine").onchange = (e) => { state.pic.mine = e.target.checked; store.set("pic.mine", state.pic.mine); state.pic.skip = []; state.pic.swap = {}; makePicture(); };
// the spools they own in the brand shown, in colour-card order, for the Design tab's thread swatches
export function ownedSpools() {
  const own = state.brand && state.spools[state.brand];
  return state.brand ? [...(own?.length ? chartSpools(state.brand).filter((s) => own.includes(s.num)) : []), ...state.mine.map(ownSpoolOf)] : [];
}
// the owned spools' colours, for "Use only threads I own"
export function ownedPalette() {
  return state.pic.mine && owns() ? ownedSpools().map((s) => s.hex) : null;
}
