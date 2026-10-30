// Sew sheet (printed at 1:1 to take to the machine) and appliqué cut files (SVG for Cricut / ScanNCut).
// Stitch units are 0.1 mm, cut outlines mm; the machine centres the design in the hoop, so the template does too.
import { colorBlocks } from "./render.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const f1 = (n) => (Math.round(n * 10) / 10).toString();
// white and cream thread would vanish on paper
function ink(hex) {
  const n = parseInt(hex.slice(1), 16), l = (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255;
  return l > 0.85 ? "#bdbdbd" : hex;
}
function box(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

// the hoop field at 1:1 with the design centred in it and a crosshair through the centre (in mm)
function template(pattern, hoop, hide) {
  const { blocks } = colorBlocks(pattern);
  const [x0, y0, x1, y1] = box(blocks.flatMap((b) => b.segs.flat()));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, W = hoop.w, H = hoop.h;
  const lines = blocks.filter((b) => !hide?.has(b.index)).map((b) => `<g stroke="${ink(b.color)}">${b.segs.map((s) =>
    `<polyline points="${s.map(([x, y]) => `${f1((x - cx) / 10 + W / 2)},${f1((y - cy) / 10 + H / 2)}`).join(" ")}"/>`).join("")}</g>`).join("");
  const r = Math.min(W, H) * 0.07;
  return `<svg class="tpl" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.2" y="0.2" width="${W - 0.4}" height="${H - 0.4}" rx="${r}" fill="none" stroke="#999" stroke-width="0.3" stroke-dasharray="2 1.5"/>
    <g fill="none" stroke-width="0.35" stroke-linecap="round" stroke-linejoin="round">${lines}</g>
    <g stroke="#000" stroke-width="0.25"><line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}" stroke-dasharray="3 2"/><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke-dasharray="3 2"/></g>
    <text x="${W / 2}" y="4" font-size="3" text-anchor="middle">▲ Top of the hoop</text>
  </svg>`;
}

// outlines (mm) as one SVG at 1:1; each fabric gets its own group so a cutter can cut them from different fabric
export function cutSVG(groups, title = "appliqué") {
  const all = groups.flat(2), [x0, y0, x1, y1] = box(all), pad = 2;
  const W = x1 - x0 + 2 * pad, H = y1 - y0 + 2 * pad;
  const path = (loops) => loops.map((l) => "M" + l.map(([x, y]) => `${f1(x - x0 + pad)},${f1(y - y0 + pad)}`).join("L") + "Z").join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${esc(title)}: appliqué shapes at actual size (mm), from needleworks -->
<svg xmlns="http://www.w3.org/2000/svg" width="${f1(W)}mm" height="${f1(H)}mm" viewBox="0 0 ${f1(W)} ${f1(H)}">
${groups.map((g, i) => `  <g id="fabric-${i + 1}"><path d="${path(g)}" fill="none" stroke="#000" stroke-width="0.25" fill-rule="evenodd"/></g>`).join("\n")}
</svg>
`;
}

// sheet: { steps: [{ title?, you?, sews? }], after: [], notes: [], cut: [[loop...]...] }, thread names as the machine shows them
export function sewSheet({ pattern, filename, hoop, facts, threads, hide, sheet = {}, spool = () => "" }) {
  const { blocks } = colorBlocks(pattern);
  const steps = sheet.steps?.length ? sheet.steps : blocks.map(() => ({}));
  const rows = steps.map((s, i) => {
    const b = blocks.find((x) => x.index === i), t = threads[i];
    return `<li><b><span class="sw" style="background:${b?.color || t?.color || "#999"}"></span>${s.title ? esc(s.title) + " · " : ""}Brother ${esc(t?.name || "")}${b && spool(b.color) ? ` <small>(${esc(spool(b.color))})</small>` : ""}</b>
      ${s.you ? `<p class="you">${esc(s.you)}</p>` : ""}${s.sews ? `<p>${esc(s.sews)}</p>` : ""}</li>`;
  }).join("");
  const cut = sheet.cut?.length ? sheet.cut : null;
  let shapes = "";
  if (cut) {
    const all = cut.flat(2), [x0, y0, x1, y1] = box(all), W = x1 - x0 + 4, H = y1 - y0 + 4;
    shapes = `<section class="pg"><h2>Appliqué shapes, actual size</h2>
      <p>Cut the fabric to these shapes, or trace them. For fusible web, turn the page over and trace through from the back (the shape has to be mirrored on the paper side).</p>
      <svg width="${f1(W)}mm" height="${f1(H)}mm" viewBox="${f1(x0 - 2)} ${f1(y0 - 2)} ${f1(W)} ${f1(H)}" xmlns="http://www.w3.org/2000/svg">
      ${cut.map((g) => `<path d="${g.map((l) => "M" + l.map(([x, y]) => `${f1(x)},${f1(y)}`).join("L") + "Z").join("")}" fill="none" stroke="#000" stroke-width="0.3" fill-rule="evenodd"/>`).join("")}</svg></section>`;
  }
  return `<section class="pg">
    <header><h1>${esc(filename)}</h1><p>${facts.map(esc).join(" · ")}</p></header>
    <p class="note">Print at 100% ("Actual size"), not "Fit to page". Check: this bar is 5 cm long.<span class="bar"></span></p>
    ${template(pattern, hoop, hide)}
    <p class="note">The machine stitches the design centred in the hoop, where the dashed lines cross. Pin this sheet on the fabric where you want the design and line the crosshair up with the hoop's grid sheet.</p>
  </section>
  <section class="pg"><h2>How to stitch it</h2><ol class="list">${rows}</ol>
    ${(sheet.after || []).length ? `<h3>When it's done</h3><p>${esc(sheet.after.join(" "))}</p>` : ""}
    ${(sheet.notes || []).filter(Boolean).map((n) => `<p class="tip">${esc(n)}</p>`).join("")}
    <p class="tip">Check the size on the machine's screen before you stitch.</p>
  </section>${shapes}`;
}
