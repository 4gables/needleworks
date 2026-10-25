// In-the-hoop applique bookmark with a script name.
// Five colour blocks, one thread: each block change is a machine pause for a fabric step.
import { circle, filletPolygon, run, satin, zigzag } from "./geom.js";
import { Design } from "./design.js";
import { MARGIN } from "./machines.js";
import { order } from "./raster.js";
import { strokes } from "./text.js";

export const RED = "#c8102e";
const W = 50, MAX_L = 165, CHAMFER = 9, BORDER = 3.6, TEXT_SATIN = 1.8, EYE_R = 4.2, EYE_W = 2.2;

export const STEPS = [
  { title: "Placement line", machine: "Sews the bookmark outline on the bare stabilizer." },
  { title: "Front fabric", you: "Tape the front fabric on, right side up, covering the outline by ½ in. Press Start. Then take the hoop off (leave everything hooped), trim about ⅛ in outside the line, and put it back." },
  { title: "The name", machine: "Sews the name." },
  { title: "Back fabric", you: "Tape felt to the back of the hoop covering the outline. Press Start. Then take the hoop off, trim the felt about ⅛ in outside the line, and put it back." },
  { title: "Border and ribbon hole", machine: "Sews the ribbon ring and the satin border through every layer." },
];

function outline(L) {
  const t = -L / 2, b = L / 2, h = W / 2;
  return filletPolygon([[-h + CHAMFER, t], [h - CHAMFER, t], [h, t + CHAMFER], [h, b], [-h, b], [-h, t + CHAMFER]], 3.0, 10);
}

function textPaths(name, family, boxLen, boxH, lead, tail) {
  const { edges, info } = strokes(name, family, { leadIn: lead ? 2.4 : 0, tail: tail ? 3.8 : 0 });
  const comps = order(edges);
  const all = edges.flatMap((e) => e[2]);
  const mn = [Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1]))];
  const mx = [Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))];
  // lengthwise: centre the whole word. Across: centre the letters' own band (swashes excluded)
  const body = all.filter((p) => p[0] > info.firstX && p[0] < info.lastX);
  const by = body.length ? body.map((p) => p[1]) : all.map((p) => p[1]);
  const c = [(mn[0] + mx[0]) / 2, (Math.min(...by) + Math.max(...by)) / 2];
  const half = Math.max(c[1] - mn[1], mx[1] - c[1]);
  const s = Math.min(boxLen / (mx[0] - mn[0]), boxH / (2 * half));
  // px -> mm, rotate 90° clockwise so the word reads top-to-bottom with letter tops to the right
  const xf = (p) => p.map(([x, y]) => [-(y - c[1]) * s, (x - c[0]) * s]);
  return comps.map((comp) => comp.map(([p, mode]) => [xf(p), mode]));
}

export function buildBookmark({ name, family, color = RED, hoop, lead = true, tail = true }) {
  name = (name || "").trim();
  if (!name) throw new Error("Type a name first.");
  const L = Math.min(MAX_L, hoop.h - 2 * MARGIN - 6);
  if (W + 4 > hoop.w - 2 * MARGIN) throw new Error(`The ${hoop.name} is too narrow for a bookmark.`);
  const edge = outline(L), eye = [0, -L / 2 + 13];
  const top = eye[1] + EYE_R + EYE_W / 2 + 6, bottom = L / 2 - BORDER / 2 - 6, innerW = W - 2 * BORDER - 6;
  const comps = textPaths(name, family, bottom - top, innerW, lead, tail);
  const ys = comps.flatMap((c) => c.flatMap(([p]) => p.map((q) => q[1])));
  const shift = (top + bottom) / 2 - (Math.min(...ys) + Math.max(...ys)) / 2;

  const d = new Design(hoop);
  d.color(color, "Step 1 - Placement");
  d.path(run(edge, 2.5, true)); d.path([edge[0]]);
  d.color(color, "Step 2 - Tack down front");
  d.path(run(edge, 2.0, true)); d.path(run(edge.slice().reverse(), 2.0, true));
  d.color(color, "Step 3 - Name");
  for (const comp of comps) for (const [p0, mode] of comp) {
    const p = p0.map(([x, y]) => [x, y + shift]);
    d.path(mode === "run" ? run(p, 1.2) : satin(p, TEXT_SATIN, 0.38, 0.2));
  }
  d.color(color, "Step 4 - Tack down back");
  d.path(run(edge, 2.0, true));
  d.color(color, "Step 5 - Border + eyelet");
  const ring = circle(eye, EYE_R, 64);
  d.path(run(ring, 1.0, true));
  d.path(zigzag(ring, EYE_W * 0.6, 1.2, true));
  d.path(satin(ring, EYE_W, 0.3, 0.2, true));
  d.path(zigzag(edge, BORDER * 0.7, 2.0, true));
  d.path(satin(edge, BORDER, 0.4, 0.3, true));
  return d.finish();
}
