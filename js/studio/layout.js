/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Layout tools: one piece arranged as several ordinary pieces (each can still be moved, changed or removed), and the
// order a monogram's initials go in. Nothing here makes a stitch: a piece's place is its x, y (mm from the hoop's
// centre), rot (degrees) and flip (mirrored left to right, before it's turned: pieces.js `placer`), and the builders
// sew it there. The copies go straight after the piece in the list, in its thread, so they sew one after another with
// no thread change between them.
//
// Mirrors, as a piece's rot and flip (a piece is drawn, flipped, then turned):
//   left to right:  flip, and the turn the other way      (rot -> -rot)
//   top to bottom:  flip, and half a turn less the turn    (rot -> 180 - rot)
//   both:           half a turn                            (rot -> rot + 180)
// Lettering is never mirrored (it would read backwards): its copies are plain copies.

import { label, sewnBox } from "./pieces.js";
import { ids } from "./starters.js";
import { MARGIN } from "../core/machines.js";

const turn = (r) => ((Math.round(r * 10) / 10) % 360 + 360) % 360;
const half = (v) => Math.round(v * 2) / 2;
// kinds a mirror would spoil: words read backwards
export const lettered = (p) => p.kind === "text" || p.kind === "monogram" || p.kind === "letters";
// kinds that can be repeated or set in corners (a frame holds other pieces: copies of it would each claim them)
export const arranged = (p) => !!p && p.kind !== "frame";

const spot = (p, by) => {
  const q = { ...p };
  if (by.x != null) q.x = half(by.x);
  if (by.y != null) q.y = half(by.y);
  if (by.rot != null) { const r = turn(by.rot); if (r) q.rot = r; else delete q.rot; }
  if (by.flip != null) { if (by.flip) q.flip = true; else delete q.flip; }
  return q;
};

// top to bottom, where it stands
export function flipDown(p) { return spot(p, { rot: 180 - (p.rot || 0), flip: !p.flip }); }

// How far out a ring of n copies sits. `size`: [w, h] of the piece as sewn (mm), `field`: [w, h] of the hoop's field.
// As far out as leaves each copy 2 mm clear of the next and inside the field; where both can't be had, clear of each
// other (the design then says it is too big, with the usual ways out).
export function ringRadius(n, [w, h], [fw, fh]) {
  const apart = n > 1 ? (w + 2) / (2 * Math.sin(Math.PI / n)) + h / 2 : 0, room = Math.min(fw, fh) / 2 - h / 2;
  // (a few copies with room to spare sit two thirds of the way out: at the field's edge a wreath leaves no middle for words)
  return Math.max(apart, room * 0.75);
}
// n copies round the hoop's centre, the first where the piece stands (or at the top, when it stands in the middle),
// each turned to face out. Returns the pieces in sewing order, the first one the piece itself (moved, same id).
// `next`: () => a new id.
export function ring(p, n, size, field, next) {
  const off = Math.hypot(p.x || 0, p.y || 0), out = off >= 5, R = out ? off : ringRadius(n, size, field);
  const a0 = out ? Math.atan2(p.x, -p.y) : 0, r0 = out ? (p.rot || 0) : 0;
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + (2 * Math.PI * i) / n, deg = (360 * i) / n;
    return { ...spot(p, { x: R * Math.sin(a), y: -R * Math.cos(a), rot: r0 + deg }), id: i ? next() : p.id };
  });
}
// One in each corner: where the piece stands is one corner (the field's top left corner, 3 mm in, when it stands in
// the middle), the other three its mirrors across the hoop's centre lines. Lettering is copied as it is.
// `upright`: the bottom two stand the same way up as the top two (a bunny, a flower in a pot), mirrored left to right only.
export function corners(p, size, field, next, upright = false) {
  const [w, h] = size, [fw, fh] = field, mid = Math.abs(p.x || 0) < 5 && Math.abs(p.y || 0) < 5;
  const x = mid ? -(fw / 2 - 3 - w / 2) : p.x, y = mid ? -(fh / 2 - 3 - h / 2) : p.y, r = p.rot || 0, f = !!p.flip, keep = lettered(p);
  const at = [
    { x, y, rot: r, flip: f },
    { x: -x, y, rot: keep ? r : -r, flip: keep ? f : !f },
    { x: -x, y: -y, rot: keep ? r : upright ? -r : r + 180, flip: keep ? f : upright ? !f : f },
    { x, y: -y, rot: keep || upright ? r : 180 - r, flip: keep || upright ? f : !f },
  ];
  return at.map((by, i) => ({ ...spot(p, by), id: i ? next() : p.id }));
}

// ---------- monogram orders ----------
// The orders people expect, from the names (first, middle or a partner's first, last). `big`: which letter is the big
// one in the middle (a monogram piece sews three letters small, BIG, small, as typed), `plain`: sewn as plain
// lettering, all one size, in the order typed.
//   surname:  first LAST middle   the usual three-letter monogram for one person: the surname big in the middle
//   couple:   first LAST partner  two first names either side of the shared surname
//   block:    FIRST MIDDLE LAST   all one size, in the order the names are said
//   two:      first last          two initials side by side
const ini = (s) => { const c = Array.from((s || "").trim())[0] || ""; return /[\p{L}\p{N}]/u.test(c) ? c : ""; };
export const MONOGRAMS = [
  { id: "surname", name: "Last name big, in the middle", needs: ["first", "middle", "last"], order: (n) => [n.first, n.last, n.middle], big: 1 },
  { id: "couple", name: "A couple: the shared last name in the middle", needs: ["first", "middle", "last"], order: (n) => [n.first, n.last, n.middle], big: 1, partner: true },
  { id: "block", name: "In order, all one size", needs: ["first", "middle", "last"], order: (n) => [n.first, n.middle, n.last], plain: true },
  { id: "two", name: "Two initials", needs: ["first", "last"], order: (n) => [n.first, n.last] },
];
// { letters, show: [{ c, from, big }], missing: the names still needed } for a layout and the names typed
export function monogramOf(id, names) {
  const m = MONOGRAMS.find((q) => q.id === id) || MONOGRAMS[0];
  const n = { first: ini(names.first), middle: ini(names.middle), last: ini(names.last) };
  const from = { surname: ["first name", "last name", "middle name"], couple: ["first name", "last name", "partner's first name"], block: ["first name", "middle name", "last name"], two: ["first name", "last name"] }[m.id];
  const cs = m.order(n), up = (c, i) => (m.plain || m.id === "two" || i === m.big ? c.toUpperCase() : c.toLowerCase());
  const show = cs.map((c, i) => ({ c: c ? up(c, i) : "", from: from[i], big: i === m.big }));
  return { id: m.id, plain: !!m.plain, letters: show.map((s) => s.c).join(""), show, missing: show.filter((s) => !s.c).map((s) => s.from) };
}

// ---------- the Arrange box (the editor hands its state in as S: ui.js) ----------
export function layoutPanel(S) {
  const { api, $ } = S;
  const kindOf = (p) => (p.kind === "motif" ? "motif" : p.kind === "file" ? "design" : p.kind === "letters" ? "appliqué letters" : p.kind === "monogram" ? "monogram" : "words");
  // which tools the selected piece can take, said where it can't
  function arrangeUI() {
    const p = S.current(), ok = arranged(p);
    $("st-arrange-for").textContent = !p ? "Pick a piece in the list first: a motif, words or a design file."
      : !ok ? "A frame holds the other pieces, so it isn't repeated: pick a motif, words or a design file."
      : `For ${label(p)}. Each copy is a piece of its own: move, change or remove any of them after.${lettered(p) ? " Lettering is copied, never mirrored, so it still reads." : ""}`;
    for (const b of $("st-arrange-tools").querySelectorAll("button")) b.disabled = !ok || (b.dataset.lay === "down" && lettered(p));
    $("st-ring-n").disabled = !ok;
    const mono = p?.kind === "monogram"; $("st-mono").hidden = !mono;
    if (mono) monoUI();
  }
  const size = (p) => { const b = sewnBox(p, S.pieces); return b ? [b[2] - b[0], b[3] - b[1]] : null; };
  const field = () => { const h = api.hoop(); return [h.w - 2 * MARGIN, h.h - 2 * MARGIN]; };
  // the piece's copies take its place in the list, so they sew together in its thread
  function put(p, made, said, more = []) {
    S.remember(); S.fitted = false;
    const i = S.pieces.findIndex((q) => q.id === p.id);
    S.pieces.splice(i, 1, ...made);
    S.sel = made[0].id; S.save(); S.ui(); S.make(); setTimeout(S.warn);
    S.toast(said, [...more, { label: "Undo", run: S.undo }]);
  }
  $("st-arrange-tools").onclick = (e) => {
    const b = e.target.closest("[data-lay]"), p = S.current(); if (!b || b.disabled || !arranged(p)) return;
    const sz = size(p);
    if (!sz) { S.toast(`${label(p)} has nothing to sew yet, so there's nothing to arrange.`); return; }
    const next = () => ids.next++;
    if (b.dataset.lay === "down") { put(p, [flipDown(p)], `Flipped ${label(p)} top to bottom.`); return; }
    if (b.dataset.lay === "ring") {
      const n = +$("st-ring-n").value || 6, out = Math.hypot(p.x || 0, p.y || 0) >= 5;
      put(p, ring(p, n, sz, field(), next), `${n} round a circle${out ? ", as far out as the first one stood" : ""}: ${n} ${kindOf(p)} pieces, sewn one after another in one thread.`);
      return;
    }
    if (b.dataset.lay === "corners") {
      const mid = Math.abs(p.x || 0) < 5 && Math.abs(p.y || 0) < 5;
      const made = corners(p, sz, field(), next), said = `One in each corner${mid ? " of the hoop" : ", mirrored from where the first one stood"}${lettered(p) ? " (lettering is copied, not mirrored)" : ""}.`;
      // (mirrored top to bottom the lower two stand on their heads, right for a flourish and wrong for a bunny: one tap stands them up)
      const stand = () => { const now = S.pieces, i = now.findIndex((q) => q.id === made[0].id); if (i < 0) return; S.remember(); const up = corners(now[i], sz, field(), next, true); made.forEach((m, k) => { const j = now.findIndex((q) => q.id === m.id); if (j >= 0 && k) now[j] = { ...up[k], id: m.id }; }); S.save(); S.ui(); S.make(); S.toast("The bottom two stand the same way up as the top two.", { label: "Undo", run: S.undo }); };
      put(p, made, said, lettered(p) ? [] : [{ label: "Stand the bottom two upright", run: stand }]);
    }
  };
  // a monogram's order, from the names: each choice shows the letters as they will sew, the big one bigger
  const names = () => ({ first: $("st-mono-first").value, middle: $("st-mono-middle").value, last: $("st-mono-last").value });
  function monoUI() {
    const n = names(), any = !!(n.first.trim() || n.middle.trim() || n.last.trim());
    $("st-mono-orders").innerHTML = MONOGRAMS.map((m) => {
      const o = monogramOf(m.id, n), eg = any ? o.show : monogramOf(m.id, m.partner ? { first: "Anna", middle: "Ben", last: "Lee" } : { first: "Anna", middle: "Marie", last: "Lee" }).show;
      return `<button type="button" class="ghost" data-mono="${m.id}"${any && o.missing.length ? " disabled" : ""}><span class="mono-eg" aria-hidden="true">${eg.map((s) => (s.big ? `<b>${api.escapeHtml(s.c || "·")}</b>` : api.escapeHtml(s.c || "·"))).join(" ")}</span><span>${m.name}<small>${eg.map((s) => s.from).join(", ")}${any && o.missing.length ? `: type the ${o.missing.join(" and the ")}` : !any ? " (an example: type the names above)" : ""}</small></span></button>`;
    }).join("");
  }
  for (const id of ["st-mono-first", "st-mono-middle", "st-mono-last"]) $(id).addEventListener("input", monoUI);
  $("st-mono-orders").onclick = (e) => {
    const b = e.target.closest("[data-mono]"), p = S.current(); if (!b || b.disabled || p?.kind !== "monogram") return;
    const o = monogramOf(b.dataset.mono, names());
    if (!o.letters || o.missing.length) { S.toast("Type the names first: the initials are taken from them."); return; }
    // (all one size, in order, is plain lettering: a monogram piece always sews the middle of three bigger)
    const made = o.plain ? (() => { const { letters, ...rest } = p; return { ...rest, kind: "text", text: o.letters, shape: "straight", radius: 30, size: Math.max(5, Math.round((p.size || 30) * 0.68)) }; })() : { ...p, letters: o.letters };
    put(p, [made], o.plain ? `${o.letters}, all one size, in the order of the names: it is plain lettering now.` : o.show.length === 3 ? `${o.letters}: the ${o.show[1].from} initial is the big one in the middle.` : `${o.letters}: two initials side by side.`);
  };
  $("st-arrange").addEventListener("toggle", arrangeUI);
  return { arrangeUI };
}
