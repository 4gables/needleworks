/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The app's shared state: what's kept in the browser (store, the kept picture), the page's state (tab, machine,
// hoop, turn, view, thread brand, the picture's settings) and the hoop as each tab shows and sews it. Every part
// of the app reads these. (Part of app.js until 2026-11.)
import { turnForMachine } from "./core/design.js";
import { DEFAULT_MACHINE, MACHINES, hoop as getHoop } from "./core/machines.js";
import { BRANDS, spools } from "./core/brands.js";
import { OUT_FORMATS } from "./core/formats-out.js";
import { toast } from "./app.js";   // (used when the browser won't keep a design: by then app.js is running)

export const $ = (id) => document.getElementById(id);
export const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("nw:" + k)) ?? d; } catch { return d; } },
  // (false when the browser wouldn't keep it: private mode, or full)
  set(k, v) {
    try { localStorage.setItem("nw:" + k, JSON.stringify(v)); return true; }
    catch { if (k === "studio" && !store.warned) { store.warned = true; toast("This design is too big to keep in the browser between visits. Use Save design to keep it."); } return false; }
  },
  del(k) { try { localStorage.removeItem("nw:" + k); } catch {} },
};
// The Picture tab's own picture (and its settings, `pic.last` in store), kept in this browser (IndexedDB: a photo is too
// big for localStorage) and opened again on the next visit: a newcomer came back to the tab and her picture was gone,
// the sample flower in its place (round 11). One picture, up to `PIC_KEEP`; anything failing (private mode, full,
// no IndexedDB) leaves it as before: the sample.
const PIC_KEEP = 15e6;
export const kept = {
  db: null,
  open() {
    return (this.db ||= new Promise((ok, no) => {
      const r = indexedDB.open("needleworks", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kept");
      // (another tab deleting or upgrading it: this connection gives way, else that waited for good and every open
      // queued behind it, the Picture tab never ready, not even with the sample)
      r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); this.db = null; }; ok(db); };
      r.onerror = () => no(r.error); r.onblocked = () => no(new Error("blocked"));
    })).catch((e) => { this.db = null; throw e; });
  },
  async run(mode, f) {
    const db = await this.open();
    return new Promise((ok, no) => { const t = db.transaction("kept", mode), r = f(t.objectStore("kept")); t.oncomplete = () => ok(r?.result); t.onerror = t.onabort = () => no(t.error); });
  },
  // (at most 2 s: what's kept is a nicety, the tab must open either way)
  async get(k) { try { return await Promise.race([this.run("readonly", (o) => o.get(k)), new Promise((ok) => setTimeout(ok, 2000))]); } catch { return undefined; } },
  async set(k, v) { try { await this.run("readwrite", (o) => o.put(v, k)); } catch { /* not kept: the next visit starts with the sample */ } },
};
export const keepPicture = (blob, name) => { if (blob.size <= PIC_KEEP) kept.set("picture", { blob, name }); };
// A picture with nothing in it to stitch isn't brought back: kept like any other, a blank picture opened the tab on
// its own error at every visit after, in place of the sample (and it was the Picture tab "never ready" in 1-2 of a
// full ui_sweep's runs: whichever tab had the blank-picture state before the plain one).
export const forgetPicture = () => kept.set("picture", null);
export const state = {
  mode: "picture",
  machine: store.get("machine", DEFAULT_MACHINE),
  hoopId: store.get("hoop", null),
  view: null,          // { pattern, bytes, filename, file (the bytes read back), shown, cache, fabric, fabricShapeBlock, hide,
                       //   steps, sheet, split, verifyAgainst, fileNote }
  views: {},           // last view per mode
  zoom: 1, pan: [0, 0], upto: null,
  step: null,   // Design tab: show the design as it is after that colour block
  showHoop: store.get("showHoop", true),
  // hoop turned sideways on screen, per tab
  turn: { picture: false, design: false, open: false, ...store.get("turn", {}) },
  brand: BRANDS[store.get("brand", "")] ? store.get("brand", "") : "",   // thread brand for spool numbers ("" = Brother only)
  spools: store.get("spools", {}),   // { brand: [spool numbers owned] }
  // the file Download makes: pes, dst, exp or vp3 (formats-out.js), set by the machine chosen (`machineFormat`) unless
  // "File for" is changed after; remembered
  fileFormat: OUT_FORMATS[store.get("fileFormat", "pes")] ? store.get("fileFormat", "pes") : "pes",
  // their spools from brands not charted here (Madeira), matched by colour: [{ brand, num, hex }]. Ticking the nearest
  // Brother spool stood for it, and every surface then said "Your Brother 079 Salmon Pink", a spool they didn't own
  mine: (store.get("myspools", []) || []).filter((o) => o && typeof o.brand === "string" && /^#[0-9a-f]{6}$/i.test(o.hex)),
  pic: { mine: store.get("pic.mine", false), style: "fill", cross: 2.5, file: null, bitmap: null, key: 0, skip: [], swap: {}, colors: 6, size: 100, angle: 45, bg: true, loads: 0, sample: false, density: store.get("pic.density", "standard"), req: 0, colorsInfo: [], line: "", edge: false, inside: "auto", smooth: null, models: new Map() },
};
if (!MACHINES[state.machine]) state.machine = DEFAULT_MACHINE;
export const hoop = () => getHoop(state.machine, state.hoopId);
// the chosen file format ({ ext, short, label, machines }), and a .pes name as that format's
export const fileFormat = () => OUT_FORMATS[state.fileFormat];
// the file a machine gets: the first its manual lists that this site writes (a Janome reads JEF and DST: DST, until JEF
// is made here)
export const machineFormat = (id = state.machine) => MACHINES[id].reads.find((f) => OUT_FORMATS[f]) || "dst";
export const outName = (name) => name.replace(/\.pes$/i, "." + state.fileFormat);
// (a square hoop turned is the same hoop: the turn is off there, or a 4x4 file came out sideways with a turn note)
export const square = () => { const h = hoop(); return h.w === h.h; };
export const turned = () => !!state.turn[state.mode] && !square();
// the hoop as it looks on screen
export const shownHoop = () => { const h = hoop(); return turned() ? { ...h, w: h.h, h: h.w } : h; };
// the Design tab lays pieces out in the hoop as it's shown (turned: the long side across), and its files are turned
// clockwise into the machine's orientation, as a turned picture is
export const designTurned = () => !!state.turn.design && !square();
export const designHoop = () => { const h = hoop(); return designTurned() ? { ...h, w: h.h, h: h.w } : h; };
export const toMachine = (p) => (designTurned() ? turnForMachine(p) : p);
// the file is turned into the machine's orientation, so the machine shows it on its side (Design and Picture tabs)
export const turnedFile = () => (state.mode === "design" ? designTurned() : state.mode === "picture" && !!state.turn.picture);
export const turnCut = (loops) => loops.map((l) => l.map(([x, y]) => [-y, x]));
