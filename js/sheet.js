/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Sew sheet (printed at 1:1 to take to the machine) and cut files for fabric (SVG for Cricut / ScanNCut / Silhouette
// Designer, DXF for Silhouette's free edition).
// Stitch units are 0.1 mm, cut outlines mm; the machine centres the design in the hoop, so the template does too.
import { colorBlocks } from "./render.js";
import { GLOSSARY, explained, problemsItems } from "./words.js";

// Step 1 starts at the machine, on every tab and surface, once (the first file's first step): the design picked from
// the USB stick as the PE900's screen has it, and where to learn threading. A newcomer's Sew along began "Hoop the
// fabric" with nothing about getting the design onto the machine or threading it (round 10).
export const pickIt = (file) => `Plug the USB stick into the machine, touch the USB key on its screen and pick ${file}.`;
export const THREADING = "New to threading the machine? The threading pages of its manual show each step.";
// (`hoop`: the project's own hooping; a file that says nothing of its fabric (an opened design): stabilizer, plainly)
export const firstStep = (file, thread = "the first thread", hoop = "Hoop the fabric with stabilizer under it") =>
  `${pickIt(file)} ${hoop}. Put on ${thread}. ${THREADING} Press Start.`;
// When it's done names the loose threads the chips count (round 11: a patch's "2 loose threads to snip after" chip,
// and nothing in its finishing words): said once, where the finish doesn't already say to snip them
export const snipsSaid = (after, n) => (n && !after.some((t) => /loose threads?/i.test(t)) ? [...after, `Snip the ${n === 1 ? "loose thread" : `${n} loose threads`} between parts.`] : after);
export const FINISH = "Take the hoop off and snip any loose threads. Tear-away stabilizer: tear it off gently, holding the stitches down with your thumb. Cut-away: trim it about ¼ in from the stitching (don't tear it).";

// The hooping note for a turned hoop, on every surface (steps, download dialog, sew sheet, share text, Sew along).
// `bare`: step 1 hoops stabilizer on its own (in-the-hoop projects), so what goes a quarter turn round is the fabric
// laid on later ("Hoop the fabric a quarter turn round" beside "Hoop tear-away stabilizer on its own" read as a
// contradiction)
export const TURNED = "The hoop is turned, so the machine sews this design on its side. Hoop the fabric a quarter turn round: the top of the design goes to the right-hand side of the hoop as you face the machine (the sew sheet shows it that way).";
export const turnedNote = (bare) => bare
  ? "The hoop is turned, so the machine sews this design on its side. Hoop the stabilizer as step 1 says (it has no top or bottom). Lay each fabric piece a quarter turn round: the top of the design goes to the right-hand side of the hoop as you face the machine (the sew sheet shows it that way)."
  : TURNED;

// Sewing time in minutes: 550 stitches a minute, about 6 s for each thread the machine cuts (`trims`: it slows, cuts
// and starts again; a picture with 275 trims said 27 min for ~55) and half a minute for each thread change or pause
// (`loads`: doctor.js blockLoads, per colour block). The whole design's time, and each step's share of it whole
// minutes that add up to it (Sew along's steps said 1 + 4 + 7 min beside the chips' 13: each step rounded on its own,
// left out its pause and counted loose threads as cut). A step under half a minute's share is 0: "under a minute".
// (`stops`: two hoopings count the pauses in their two files, not the whole design's)
export function sewTime(loads, stops = loads.length - 1) {
  const sum = (k) => loads.reduce((a, b) => a + b[k], 0);
  const total = Math.max(1, Math.round(sum("stitches") / 550 + Math.max(0, sum("trims") - sum("snips")) / 10 + stops / 2));
  const own = loads.map((b, i) => b.stitches / 550 + Math.max(0, b.trims - b.snips) / 10 + (i ? 0.5 : 0)), all = own.reduce((a, b) => a + b, 0) || 1;
  const exact = own.map((m) => (m * total) / all), steps = exact.map(Math.floor);
  const left = total - steps.reduce((a, b) => a + b, 0);
  exact.map((m, i) => [m - steps[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, left).forEach(([, i]) => steps[i]++);
  return { total, steps };
}
// a step's time, as Sew along says it
export const stepTime = (m) => (m ? `About ${m} min of sewing.` : "Under a minute of sewing.");

// the turned hoop as you face the machine: a house lying with its roof (the top) to the right, an arrow that way (no
// text in it: the note it sits in is read by its textContent for the share text and Sew along)
export const TURN_PIC = `<svg class="turn-pic" viewBox="0 0 58 52" width="70" height="63" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="38" height="48" rx="9"/><path d="M8 12 H22 L35 26 L22 40 H8 Z M8 21 H15 V31 H8"/><path d="M44 26 H55 M51 22 L55 26 L51 30"/></svg>`;

// a file's own steps, block by block: a stop in the same thread is a pause, not a thread change (an appliqué's fabric steps)
// (`name`: the thread as the machine shows it, "Brother Red": "Change to the next thread" didn't say which)
export const nextThread = (blocks, i, name, file) => (!i ? firstStep(file, name || undefined) : blocks[i]?.color === blocks[i - 1]?.color ? "The machine pauses: keep the same thread on and press Start."
  : `Change to ${name || "the next thread"} and press Start.`);

// What a surface says, { ready, steps, after }, with each sewing word explained where it's first used (words.js);
// a file's own steps (`blocks`, its threads' `names`, an opened design with no steps of its own) when it has none
export function told(sheet, blocks = [], names = [], file = "") {
  sheet ||= {};
  const steps = sheet.steps?.length ? sheet.steps : blocks.map((b, i) => ({ you: nextThread(blocks, i, names[i] && `Brother ${names[i].name}`, file), sews: "" }));
  const ready = sheet.ready || [], after = sheet.after?.length ? sheet.after : [FINISH];
  const all = explained([...ready, ...steps.map((st) => st.you), ...after]), n = ready.length;
  return { ...sheet, ready: all.slice(0, n), steps: steps.map((st, i) => ({ ...st, you: all[n + i] })), after: all.slice(n + steps.length) };
}
// A step's "what you do" as its actions, one per sentence ("Then take the hoop off" as "Take the hoop off"): the
// ornament's last step was one paragraph of six things to do
export function actions(text) {
  return String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z“"(])/).map((a) => a.trim().replace(/^Then (\w)/, (_, c) => c.toUpperCase())).filter(Boolean);
}
// Sentences that aren't something to do: where threading is shown, what a sewing word means. They stay with the
// action before them, never numbered (round 11: step 1's "New to threading the machine?" and its answer were sub-steps
// 4 and 5, and "Stabilizer is a backing sheet..." one more).
export const ASIDES = [THREADING, ...GLOSSARY.map(([, say]) => say)];
const aside = (a) => ASIDES.some((x) => x.includes(a));
// as HTML: three or more actions as numbered sub-steps, else one line (in `tag`, with the class `you`)
export function youHtml(text, escape = esc, tag = "span") {
  const items = [];
  for (const a of actions(text)) {
    if (aside(a) && items.length) items.at(-1).aside.push(a);
    else items.push({ a, aside: [] });
  }
  return items.length >= 3 ? `<ol class="you sub">${items.map((x) => `<li>${escape(x.a)}${x.aside.length ? ` <span class="aside">${escape(x.aside.join(" "))}</span>` : ""}</li>`).join("")}</ol>`
    : `<${tag} class="you">${escape(text)}</${tag}>`;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const f1 = (n) => (Math.round(n * 10) / 10).toString();
// white, cream, yellow and pale pink thread would vanish on paper: they print in their own colour on a thin dark
// edge (grey made yellow, white and Flesh Pink all one colour)
function pale(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255 > 0.8;
}
function box(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

// the hoop field at 1:1 with the design centred in it and a crosshair through the centre (in mm)
// `cut` (mm, as the design): where appliqué fabric goes, hatched under the stitches (a bare outline didn't read as appliqué)
function template(pattern, hoop, hide, cut) {
  const { blocks } = colorBlocks(pattern);
  const [x0, y0, x1, y1] = box(blocks.flatMap((b) => b.segs.flat()));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, W = hoop.w, H = hoop.h;
  const fabric = (cut || []).map((g) => `<path d="${g.map((l) => "M" + l.map(([x, y]) => `${f1(x - cx / 10 + W / 2)},${f1(y - cy / 10 + H / 2)}`).join("L") + "Z").join("")}"/>`).join("");
  const lines = blocks.filter((b) => !hide?.has(b.index)).map((b) => {
    const segs = b.segs.map((s) => `<polyline points="${s.map(([x, y]) => `${f1((x - cx) / 10 + W / 2)},${f1((y - cy) / 10 + H / 2)}`).join(" ")}"/>`).join("");
    return (pale(b.color) ? `<g stroke="#555" stroke-width="0.6">${segs}</g>` : "") + `<g stroke="${b.color}">${segs}</g>`;
  }).join("");
  const r = Math.min(W, H) * 0.07;
  return `<svg class="tpl" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.2" y="0.2" width="${W - 0.4}" height="${H - 0.4}" rx="${r}" fill="none" stroke="#999" stroke-width="0.3" stroke-dasharray="2 1.5"/>
    ${fabric ? `<defs><pattern id="fab" width="1.4" height="1.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="1.4" stroke="#a0a0a0" stroke-width="0.3"/></pattern></defs>
    <g fill="url(#fab)" fill-rule="evenodd" stroke="none">${fabric}</g>` : ""}
    <g fill="none" stroke-width="0.35" stroke-linecap="round" stroke-linejoin="round">${lines}</g>
    <g stroke="#000" stroke-width="0.25"><line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}" stroke-dasharray="3 2"/><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke-dasharray="3 2"/></g>
    <text x="${W / 2}" y="4" font-size="3" text-anchor="middle">▲ Top of the hoop</text>
  </svg>`;
}

// outlines (mm) as one SVG at 1:1; each fabric gets its own group so a cutter can cut them from different fabric. The
// page is the shapes' own size (no margin), so the size in the file name, the cutter's and the page's agree: with
// 2 mm round them, MOM_cut_52x165mm.svg opened as 56 x 169.2 mm (hobbyist, round 10). (overflow: the hairline
// along the edge isn't clipped.)
export function cutSVG(groups, title = "appliqué") {
  const all = groups.flat(2), [x0, y0, x1, y1] = box(all);
  const W = x1 - x0, H = y1 - y0;
  const path = (loops) => loops.map((l) => "M" + l.map(([x, y]) => `${f1(x - x0)},${f1(y - y0)}`).join("L") + "Z").join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${esc(title)}: fabric shapes at actual size (mm), from needleworks -->
<svg xmlns="http://www.w3.org/2000/svg" width="${f1(W)}mm" height="${f1(H)}mm" viewBox="0 0 ${f1(W)} ${f1(H)}" overflow="visible">
${groups.map((g, i) => `  <g id="fabric-${i + 1}"><path d="${path(g)}" fill="none" stroke="#000" stroke-width="0.25" fill-rule="evenodd"/></g>`).join("\n")}
</svg>
`;
}

// The same outlines as a DXF (AutoCAD R12, ASCII: the version every cutter's software reads), for Silhouette
// Studio's free edition, which opens DXF but not SVG. One closed POLYLINE per outline in mm, y up as DXF has it, a
// layer per fabric. DXF keeps no page size, so Silhouette may open it scaled: the size is in the file's name (`cutName`).
export function cutDXF(groups) {
  const all = groups.flat(2), [x0, y0, x1, y1] = box(all), H = y1 - y0, n = (v) => (Math.round(v * 100) / 100).toFixed(2);
  const out = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  groups.forEach((g, i) => {
    for (const l of g) {
      const pts = l.filter((q, k) => k < l.length - 1 || Math.hypot(q[0] - l[0][0], q[1] - l[0][1]) > 0.01);
      out.push("0", "POLYLINE", "8", `FABRIC${i + 1}`, "66", "1", "70", "1", "10", "0.00", "20", "0.00", "30", "0.00");
      for (const [x, y] of pts) out.push("0", "VERTEX", "8", `FABRIC${i + 1}`, "10", n(x - x0), "20", n(H - (y - y0)), "30", "0.00");
      out.push("0", "SEQEND", "8", `FABRIC${i + 1}`);
    }
  });
  out.push("0", "ENDSEC", "0", "EOF");
  return out.join("\r\n") + "\r\n";
}
// a cut file's name: the design's, then its size in whole mm (a DXF keeps none, so Silhouette can open it scaled, and
// the size to set is right there). gate.js refuses a cut file whose shapes aren't the size its name says.
export function cutName(design, groups, ext) {
  const [x0, y0, x1, y1] = box(groups.flat(2));
  return `${design}_cut_${Math.round(x1 - x0)}x${Math.round(y1 - y0)}mm.${ext}`;
}

// sheet: { steps: [{ title?, you?, sews? }], ready: [] (one "Have ready" list), after: [], notes: [], cut: [[loop...]...] }, thread names as the machine shows them
export function sewSheet({ pattern, filename, hoop, facts, threads, hide, sheet = {}, label = (hex, name) => ({ name: `Brother ${name}`, note: "" }), problems = [] }) {
  const { blocks } = colorBlocks(pattern);
  sheet = told(sheet, blocks, threads, filename);
  const { steps, after } = sheet;
  const rows = steps.map((s, i) => {
    const b = blocks.find((x) => x.index === i), t = threads[i], l = b ? label(b.color, t?.name || "") : { name: `Brother ${t?.name || ""}`, note: "" };
    return `<li><b><span class="sw" style="background:${b?.color || t?.color || "#999"}"></span>${s.title ? esc(s.title) + " · " : ""}${esc(l.name)}${l.note ? ` <small>(${esc(l.note)})</small>` : ""}</b>
      ${s.you ? youHtml(s.you, esc, "p") : ""}${s.sews ? `<p>${esc(s.sews)}</p>` : ""}</li>`;
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
    ${template(pattern, hoop, hide, sheet.cut)}
    <p class="note">${sheet.cut?.length ? "Hatched: where the fabric pieces go. " : ""}The machine stitches the design centred in the hoop, where the dashed lines cross. Pin this sheet on the fabric where you want the design and line the crosshair up with the hoop's grid sheet.</p>
  </section>
  <section class="pg"><h2>How to stitch it</h2>
    ${problemsItems(problems, "div", "probs")}
    ${(sheet.ready || []).length ? `<h3>Have ready</h3><ul class="ready">${sheet.ready.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
    <ol class="list">${rows}</ol>
    <h3>When it's done</h3><p>${esc(after.join(" "))}</p>
    ${(sheet.notes || []).filter(Boolean).map((n) => `<p class="tip">${esc(n)}</p>`).join("")}
    <p class="tip">Check the size on the machine's screen before you stitch.</p>
  </section>${shapes}`;
}
