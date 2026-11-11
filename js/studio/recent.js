/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Recent designs: a design replaced by another (a starter, Open saved, a picture or file) is kept in this browser
// as Save design's JSON and opens again as it was. The editor (ui.js) hands in its state and helpers as S.
// (Part of ui.js until 2026-11.)
import { draw } from "../render.js";
import { loadFont } from "../core/fonts.js";
import { cleanPieces, compose, previewLook } from "./pieces.js";
import { STARTERS } from "./starters.js";

export function recentDesigns(S) {
  const { api } = S;
  // Recent designs: the last designs another one replaced (a starter, Open saved, a picture or file as a new design,
  // Add words), kept in this browser as Save design writes them and opened as Open saved opens them (cleanPieces). A
  // newcomer's downloaded design went with the next starter, back only by Undo and gone after a reload (rounds 9, 11).
  // Whole designs, not S.undo history. A starter or picture as it came, unchanged and not downloaded, isn't kept. Kept
  // to `RECENT` and about 1.5 MB of the browser's ~5 MB (the design itself must still fit): oldest dropped first, and
  // with no storage (private mode, full) there's simply no list.
  const RECENT = 8, RECENT_CHARS = 1.5e6;
  const designKey = (d) => JSON.stringify([d.pieces.map(({ id, ...p }) => p), d.fabric, !!d.baste, d.thread, !!d.two, d.title || "", d.hoop, !!d.turned]);
  let recents = (() => { const r = api.store.get("studio.recent", []); return Array.isArray(r) ? r.filter((d) => d && Array.isArray(d.pieces) && d.pieces.length) : []; })();
  const thisDesign = () => ({ needleworks: 1, pieces: S.pieces, fabric: S.fabric, baste: S.baste, thread: S.thread, fitted: S.fitted, two: S.two, title: S.title, hoop: api.hoopId(), turned: api.turned(), from: S.from, tip: S.tip });
  function keep() {
    if (!S.pieces.length || (!S.edited && !S.sent && (!S.from || STARTERS.some((s) => s.name === S.from)))) return null;
    const d = JSON.parse(JSON.stringify({ ...thisDesign(), name: S.firstWords(), at: Date.now(), sent: S.sent })), k = designKey(d);
    recents = [d, ...recents.filter((r) => designKey(r) !== k)].slice(0, RECENT);
    putRecents();
    return recents[0] === d ? d : null;
  }
  function putRecents() {
    while (recents.length && (JSON.stringify(recents).length > RECENT_CHARS || !api.store.set("studio.recent", recents))) recents.pop();
    if (!recents.length) api.store.del("studio.recent");
    recentUI();
  }
  const keptSaid = (d) => (d ? ` “${d.name}”${d.sent ? ", which you downloaded," : ""} is kept under Recent designs.` : "");
  const when = (t) => { const d = new Date(t); return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" }); };
  // the list, without the design on screen (after Undo it's the first one); thumbnails drawn while it's open
  let recentShown = [];
  function recentUI() {
    const now = designKey(thisDesign());
    recentShown = recents.filter((d) => designKey(d) !== now);
    $("st-recent-box").hidden = !recentShown.length;
    $("st-recent-count").textContent = recentShown.length ? `· ${recentShown.length}` : "";
    $("st-recent").innerHTML = recentShown.map((d, i) => `<button type="button" data-recent="${i}" aria-label="Open ${api.escapeHtml(d.name || "design")} again (S.from ${when(d.at)})"><canvas aria-hidden="true"></canvas><b>${api.escapeHtml(d.name || "Design")}</b><small>${when(d.at)}${d.sent ? " · downloaded" : ""}</small></button>`).join("");
    recentThumbs();
  }
  async function recentThumbs() {
    if (!$("st-recent-box").open) return;
    for (const c of $("st-recent").querySelectorAll("canvas")) {
      const d = recentShown[+c.parentNode.dataset.recent];
      await S.idle();
      if (!c.isConnected) return;
      try {
        // (its fonts loaded first, after the design's own: drawn before, a thumbnail's lettering was the fallback font
        // and the canvas asked for its fonts ahead of the design's)
        const ps = cleanPieces(d.pieces).pieces;
        await S.fontsIn;
        await Promise.allSettled([...new Set(ps.filter((p) => p.font).map((p) => p.font))].map(loadFont));
        if (!c.isConnected) return;
        const { design, steps } = compose(ps, { w: 1000, h: 1000, name: "" }, { fabric: d.fabric, thread: d.thread });
        const look = previewLook(steps);
        draw(c, design.pattern(), { pad: 4, ...look, fabric: look.fabric || "white" });
      } catch { c.remove(); }
    }
  }
  $("st-recent-box").addEventListener("toggle", recentThumbs);
  $("st-recent").onclick = (e) => {
    const b = e.target.closest("[data-recent]"), d = b && recentShown[+b.dataset.recent]; if (!d) return;
    recents = recents.filter((r) => r !== d);
    let kept = null; try { kept = S.openDesign(d, { from: d.from || "", tip: d.tip || "" }); } catch (err) { console.error(err); }
    if (!kept) { putRecents(); S.toast("That design couldn't be opened again."); return; }
    S.edited = true; S.sent = !!d.sent; S.save();
    putRecents();
    if (!kept.toasted) S.toast(`Opened “${d.name || "your design"}” again.${keptSaid(kept.kept)}`, { label: "Undo", run: S.undo });
  };
  return { recentUI, keptSaid, keep };
}
