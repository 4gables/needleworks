/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// On my item: a photo of the real towel or shirt under the design at true size, measured by two taps on something
// of known width. Never uploaded or saved. (Part of app.js until 2026-11.)
import { state } from "./state.js";
import { keyboard } from "./focus.js";
import { $ } from "./state.js";
import { modal, paint } from "./app.js";

// ---------- on my item ----------
// a photo of the real bib or towel under the design at true size: two dots on something measured set the scale
const cal = { bmp: null, a: [0.25, 0.5], b: [0.75, 0.5], drag: null };
$("item-open").onclick = () => {
  if (state.backdrop) { state.backdrop = null; $("item-open").textContent = "On my item"; state.zoom = 1; state.pan = [0, 0]; paint(); return; }
  $("item-done").disabled = !cal.bmp; modal($("item")); calDraw();
};
$("item-file").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  $("item-error").hidden = true;
  try { cal.bmp = await createImageBitmap(f, { imageOrientation: "from-image" }); }
  catch { $("item-error").textContent = "That photo couldn't be opened. Try a JPG or PNG."; $("item-error").hidden = false; return; }
  cal.a = [0.25, 0.5]; cal.b = [0.75, 0.5]; $("item-done").disabled = false; calDraw();
};
function calDraw() {
  const c = $("item-cal"), has = !!cal.bmp;
  c.hidden = $("item-len-row").hidden = !has; if (!has) return;
  const W = Math.min(c.parentElement.clientWidth, 600), H = Math.round(W * Math.min(1.2, cal.bmp.height / cal.bmp.width)), dpr = devicePixelRatio || 1;
  c.style.width = W + "px"; c.style.height = H + "px"; c.width = W * dpr; c.height = H * dpr;
  const ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const k = Math.min(W / cal.bmp.width, H / cal.bmp.height), iw = cal.bmp.width * k, ih = cal.bmp.height * k, ox = (W - iw) / 2, oy = (H - ih) / 2;
  cal.box = [ox, oy, iw, ih];
  ctx.drawImage(cal.bmp, ox, oy, iw, ih);
  const P = ([u, v]) => [ox + u * iw, oy + v * ih], [ax, ay] = P(cal.a), [bx, by] = P(cal.b);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.strokeStyle = "#b3133a"; ctx.lineWidth = 2; ctx.stroke();
  for (const [x, y] of [[ax, ay], [bx, by]]) { ctx.fillStyle = "#b3133a"; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.stroke(); }
}
const calAt = (e) => { const r = $("item-cal").getBoundingClientRect(), [ox, oy, iw, ih] = cal.box; return [Math.min(1, Math.max(0, (e.clientX - r.left - ox) / iw)), Math.min(1, Math.max(0, (e.clientY - r.top - oy) / ih))]; };
$("item-cal").addEventListener("pointerdown", (e) => {
  const p = calAt(e), [, , iw, ih] = cal.box, d = (q) => Math.hypot((q[0] - p[0]) * iw, (q[1] - p[1]) * ih);
  cal.drag = d(cal.a) < d(cal.b) ? "a" : "b"; cal[cal.drag] = p; $("item-cal").setPointerCapture(e.pointerId); calDraw();
});
$("item-cal").addEventListener("pointermove", (e) => { if (cal.drag) { cal[cal.drag] = calAt(e); calDraw(); } });
$("item-cal").addEventListener("pointerup", () => { cal.drag = null; });
// keyboard: arrows move the first dot, Shift + arrows the second
$("item-cal").addEventListener("keydown", (e) => {
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d || !cal.bmp) return;
  e.preventDefault(); const k = e.shiftKey ? "b" : "a";
  cal[k] = [Math.min(1, Math.max(0, cal[k][0] + d[0] * 0.005)), Math.min(1, Math.max(0, cal[k][1] + d[1] * 0.005))]; calDraw();
});
$("item-done").onclick = () => {
  const mm = +$("item-len").value * +$("item-unit").value, px = Math.hypot((cal.a[0] - cal.b[0]) * cal.bmp.width, (cal.a[1] - cal.b[1]) * cal.bmp.height);
  if (!(mm > 0) || px < 5) return;
  // the photo's own pixels in 0.1 mm stitch units, centred under the design
  state.backdrop = { bmp: cal.bmp, unit: (mm * 10) / px, center: [0, 0] };
  $("item").close(); $("item-open").textContent = "Remove photo"; state.zoom = 1; state.pan = [0, 0]; paint();
};
