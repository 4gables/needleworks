// In-the-hoop applique bookmark with a name (or blank).
// Five colour blocks, one thread: each block change is a machine pause for a fabric step. Blank skips the name block.
import { circle, edgeWalk, filletPolygon, normals, resample, run, satin, zigzag } from "./geom.js";
import { Design } from "./design.js";
import { MARGIN } from "./machines.js";
import { order } from "./raster.js";
import { strokes } from "./text.js";

export const RED = "#ed171f";
const W = 50, MAX_L = 165, LETTERS = 0.72, CHAMFER = 9, BORDER = 3.6, TEXT_SATIN = 1.8, EYE_R = 4.2, EYE_W = 2.2;

export const STEPS = [
  { title: "Placement line", machine: "Sews the bookmark outline on the bare stabilizer." },
  { title: "Front fabric", you: "Tape the front fabric on, right side up, covering the outline by ½ in. Press Start. Then take the hoop off (leave everything hooped), trim about ⅛ in outside the line, and put it back." },
  { title: "The name", machine: "Sews the name." },
  { title: "Back fabric", you: "Tape felt to the back of the hoop covering the outline. Press Start. Then take the hoop off, trim the felt about ⅛ in outside the line, and put it back." },
  { title: "Border and ribbon hole", machine: "Sews the ribbon ring and the satin border through every layer." },
];

export const stepsFor = (blank) => STEPS.filter((s) => !(blank && s.title === "The name"));
// blocks the preview leaves unstitched-looking (placement and tack-downs sit under the fabric/border)
export const hiddenBlocks = (blank) => new Set(blank ? [0, 1, 2] : [0, 1, 3]);

// the closed outline pushed out by d mm (whichever normal side makes it bigger)
function grow(p, d) {
  const c = resample(p, 0.5, true), n = normals(c, true);
  const side = (s) => c.map((q, i) => [q[0] + n[i][0] * d * s, q[1] + n[i][1] * d * s]);
  const span = (q) => Math.max(...q.map((v) => v[0])) - Math.min(...q.map((v) => v[0]));
  const a = side(1), b = side(-1);
  return span(a) > span(b) ? a : b;
}

function outline(L) {
  const t = -L / 2, b = L / 2, h = W / 2;
  return filletPolygon([[-h + CHAMFER, t], [h - CHAMFER, t], [h, t + CHAMFER], [h, b], [-h, b], [-h, t + CHAMFER]], 3.0, 10);
}

// Letters are sized the same with or without decorations: their own band fills LETTERS of the width,
// and the whole word only shrinks if it (with swashes/dashes) won't fit the length.
function textPaths(name, family, boxLen, boxH, lead, tail, print) {
  const deco = print ? { deco: "dash", join: false, leadIn: lead ? 2.2 : 0, tail: tail ? 2.2 : 0 }
    : { leadIn: lead ? 1.8 : 0, tail: tail ? 2.6 : 0 };
  const { edges, info } = strokes(name, family, deco);
  const comps = order(edges);
  const all = edges.flatMap((e) => e[2]);
  const mn = [Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1]))];
  const mx = [Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))];
  // lengthwise: centre the whole word. Across: centre the bulk of the letters (the x-height band), so loops
  // above and below may reach further one way than the other
  const body = all.filter((p) => p[0] >= info.firstX && p[0] <= info.lastX);
  const by = body.length ? body.map((p) => p[1]) : all.map((p) => p[1]);
  const b0 = Math.min(...by), b1 = Math.max(...by);
  const c = [(mn[0] + mx[0]) / 2, info.baseline - info.mid / 2];
  const half = Math.max(c[1] - mn[1], mx[1] - c[1]), halfBody = Math.max((b1 - b0) / 2, 1e-9);
  const s = Math.min((LETTERS * boxH) / (2 * halfBody), boxH / (2 * half), boxLen / (mx[0] - mn[0]));
  // px -> mm, rotate 90° clockwise so the word reads top-to-bottom with letter tops to the right
  const xf = (p) => p.map(([x, y]) => [-(y - c[1]) * s, (x - c[0]) * s]);
  return comps.map((comp) => comp.map(([p, mode]) => [xf(p), mode]));
}

export function buildBookmark({ name, family, color = RED, hoop, lead = true, tail = true, print = false, blank = false }) {
  name = (name || "").trim();
  if (!name && !blank) throw new Error("Type a name first.");
  if (hoop.h - 2 * MARGIN < MAX_L + 6 || hoop.w - 2 * MARGIN < W + 4) throw new Error(`The bookmark needs the 5" × 7" hoop. Pick it at the top.`);
  const L = MAX_L;
  const edge = outline(L), eye = [0, -L / 2 + 13];
  const top = eye[1] + EYE_R + EYE_W / 2 + 6, bottom = L / 2 - BORDER / 2 - 6, innerW = W - 2 * BORDER - 6;
  const comps = blank ? [] : textPaths(name, family, bottom - top, innerW, lead, tail, print);
  const ys = comps.flatMap((c) => c.flatMap(([p]) => p.map((q) => q[1])));
  const shift = ys.length ? (top + bottom) / 2 - (Math.min(...ys) + Math.max(...ys)) / 2 : 0;

  const d = new Design(hoop);
  d.color(color, "Step 1 - Placement");
  d.path(run(edge, 2.5, true)); d.path([edge[0]]);
  d.color(color, "Step 2 - Tack down front");
  d.path(run(edge, 2.0, true)); d.path(run(edge.slice().reverse(), 2.0, true));
  if (!blank) d.color(color, "Step 3 - Name");
  for (const comp of comps) for (const [p0, mode] of comp) {
    const p = p0.map(([x, y]) => [x, y + shift]);
    d.path(mode === "run" ? run(p, 1.2) : satin(p, TEXT_SATIN, 0.38, 0.3));
  }
  d.color(color, `Step ${blank ? 3 : 4} - Tack down back`);
  d.path(run(edge, 2.0, true));
  d.color(color, `Step ${blank ? 4 : 5} - Border + eyelet`);
  const ring = circle(eye, EYE_R, 64);
  d.path(run(ring, 1.0, true));
  d.path(zigzag(ring, EYE_W * 0.6, 1.2, true));
  d.path(satin(ring, EYE_W, 0.35, 0.2, true));
  d.path(edgeWalk(edge, BORDER, true));
  d.path(zigzag(edge, BORDER * 0.7, 2.0, true));
  d.path(satin(edge, BORDER, 0.4, 0.3, true));
  d.cut = [[grow(edge, 3)]];   // the front fabric for the cut file: the outline plus the ⅛ in it's trimmed to
  return d.finish();
}
