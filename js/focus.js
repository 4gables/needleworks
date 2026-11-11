/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Keyboard focus that survives redraws: one observer for the whole page. A redraw that removes the focused control
// focuses the same control in the new markup, or the nearest live one; whether the person is on the keyboard comes
// from the last real key or pointer press. No per-feature focus fixes. (Part of app.js until 2026-11.)

// ---------- keyboard focus that survives redraws ----------
// One mechanism for the whole page. A redraw (the editor, the piece list, a message and its one-tap fix, the steps)
// that takes away the focused control puts focus on the same control in the new markup, found by its id or data-
// attributes (in its [data-seg] group) in the nearest part of the page that's left, caret and all: typing and Enter on
// a swatch carry on. With no such control, a keyboard user's focus goes to the first control still showing there (it
// fell to the page, and the next Tab started again from the top); after a tap it's left alone (focusing the words
// box would open a phone's keyboard). Keyboard or not is the last real input, never a click's `detail`: a one-tap fix
// that called .click() looked like a key press and sent focus, and the page, 1185 px away. Right after a key press
// the focused control is kept in view as what's around it changes size, scrolling no more than that needs.
const FOCUSABLE = "button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex='0']";
export let keyboard = false, keyAt = 0, held = null;
addEventListener("keydown", () => { keyboard = true; keyAt = Date.now(); }, true);
addEventListener("pointerdown", () => { keyboard = false; keyAt = 0; }, true);
const keyed = () => Date.now() - keyAt < 2000;   // (scrolling follows focus only straight after a key press)
export const live = (n) => n.isConnected && n.getClientRects().length > 0 && !n.closest("[hidden], [inert]") && n.checkVisibility?.() !== false;
document.addEventListener("focusin", (e) => {
  const f = e.target; if (!(f instanceof Element)) return;
  const attrs = [...f.attributes].filter((x) => x.name.startsWith("data-")).map((x) => `[${x.name}="${CSS.escape(x.value)}"]`).join("");
  const group = f.closest("[data-seg]");
  const up = []; for (let n = f.parentElement; n && n !== document.body; n = n.parentElement) up.push(n);
  held = { el: f, up, idx: up.map((n, i) => [...n.children].indexOf(i ? up[i - 1] : f)),
    sel: attrs || f.id ? (group ? `[data-seg="${CSS.escape(group.dataset.seg)}"] ` : "") + (f.id ? `#${CSS.escape(f.id)}` : f.tagName.toLowerCase() + attrs) : null };
  // (the browser's own scrolling left a chip in the sideways-scrolling chip row out of sight, and a file chooser's
  // input is a pixel beside its label: the pixel was scrolled into view, the label stayed under the Download bar)
  if (keyed()) setTimeout(() => document.activeElement === f && inView(f.matches(".sr-file") ? f.closest("label") || document.querySelector(`label[for="${f.id}"]`) || f : f));
});
function inView(n) {
  const r = n.getBoundingClientRect(), pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) || 0;
  let clip = [0, innerHeight - pad, 0, innerWidth];
  for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p), b = p.getBoundingClientRect();
    if (/auto|scroll/.test(s.overflowY)) clip = [Math.max(clip[0], b.top), Math.min(clip[1], b.bottom), clip[2], clip[3]];
    if (/auto|scroll/.test(s.overflowX)) clip = [clip[0], clip[1], Math.max(clip[2], b.left), Math.min(clip[3], b.right)];
  }
  if (r.top < clip[0] || r.bottom > clip[1] || r.left < clip[2] - 1 || r.right > clip[3] + 1) n.scrollIntoView({ block: "nearest", inline: "nearest" });
}
function refocus(late) {
  const h = held; if (!h) return;
  const a = document.activeElement, gone = !live(h.el) || h.el.disabled;
  if (!gone) { if (a === h.el && keyed()) inView(a); return; }
  if (a && a !== document.body && a !== h.el) return;   // (focus has gone somewhere of its own accord)
  const i = h.up.findIndex(live); if (i < 0) return;
  const n = h.up[i], same = h.sel && n.querySelector(h.sel);
  let c = same && live(same) && !same.disabled ? same : null;
  if (!c && keyboard) {
    // (no such control: where it stood, once the redraw has settled; a message's words fill in a moment later)
    if (late !== true) { if (!h.later) { h.later = true; setTimeout(() => { h.later = false; if (held === h) refocus(true); }); } return; }
    c = next(n, h, i);
  }
  if (!c) return;
  const caret = "selectionStart" in h.el && "setSelectionRange" in c ? [h.el.selectionStart, h.el.selectionEnd] : null;
  c.focus({ preventScroll: true });
  if (caret) try { c.setSelectionRange(...caret); } catch {}
  if (keyed()) inView(c);
}
// the control that now stands where the lost one stood, or the first after it in reading order (the first control in
// the editor took it: a one-tap fix sent focus up to the Words box or "Centre it", the next Tab starting over)
export function next(n, h, i) {
  const all = [...n.querySelectorAll(FOCUSABLE)].filter(live); if (!all.length) return null;
  // (the same place in the new markup, child by child, as far as it goes)
  let at = n, past = false;
  for (let j = i; j >= 0; j--) { const c = at.children[h.idx[j]]; if (!c) { past = j < i || h.idx[j] > 0; break; } at = c; }
  const after = (c) => past ? at.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING && !at.contains(c)
    : at === c || at.contains(c) || at.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING;
  return all.find(after) || all[all.length - 1];
}
new MutationObserver(refocus).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "disabled", "open"] });
// (redraws that check where focus is straight after can have it put back at once)
export function keepFocus(root, render) { render(); refocus(); }
