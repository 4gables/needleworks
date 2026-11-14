/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The Picture tab's words about art (PX6, docs/pictures.md "Art that stitches well"): the guide for making a picture
// that stitches well, with its ready-to-copy prompt for an AI image tool, and what the check of a picture says
// (core/artcheck.js measures). Every number is recipes.js `ART` or one handed in (`most`: digitize.js `MOST`), never
// typed here. Its own module, loaded with the Picture tab, so the first screen's words.js doesn't carry it; DOM-free,
// so tests/browser/picture_corpus.html says the same words over the corpus.
import { ART } from "./core/recipes.js";

const list = (a) => (a.length < 3 ? a.join(" and ") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`);
// The shapes a picture may be asked for in, as the AI tools offer them (width : height)
const RATIOS = [[1, 1], [4, 5], [3, 4], [2, 3], [9, 16]];
// The hoop's shape as the nearest of those ("3:4", upright or not), or square
export function hoopShape(w, h) {
  const r = Math.min(w, h) / Math.max(w, h);
  const [a, b] = RATIOS.reduce((best, q) => (Math.abs(q[0] / q[1] - r) < Math.abs(best[0] / best[1] - r) ? q : best));
  return a === b ? { ratio: "1:1", words: "square", ask: "Square image (1:1)." } : w < h ? { ratio: `${a}:${b}`, words: `upright ${a}:${b}`, ask: `Portrait image, ${a}:${b}.` }
    : { ratio: `${b}:${a}`, words: `wide ${b}:${a}`, ask: `Landscape image, ${b}:${a}.` };
}

// The guide. `sizeMm`: the longer side it will be sewn at (the hoop's, filled); `w`, `h`: the hoop's field (mm, the way
// it is held); `colours`: the thread colours owned ([{ name, hex }]) or none; `most`: the most thread colours; `subject`.
// Returns { rules: [sentences], prompt, tip }.
export function artGuide({ sizeMm, w, h, colours = [], most, subject = "" }) {
  // (as pixels too, on a picture 1024 px along its longer side, the size AI image tools make: an AI tool and a person
  // drawing both work in pixels. PX-R: "rules in mm become rules in pixels once the sewn size is known")
  const PX = 1024, px = (mm) => Math.max(1, Math.round((mm * PX) / sizeMm)), shape = hoopShape(w, h);
  const owned = colours.length ? colours.slice(0, 24) : null;
  const rules = [
    `Flat colours, ${ART.fewest} to ${most} of them: each colour is one thread${owned ? ", so use the colours of thread you own" : ""}.`,
    `Bold, clean outlines, at least ${ART.line} mm thick once stitched: ${px(ART.line)} px on a ${PX} px picture sewn ${sizeMm} mm long. Thinner lines sew as a single thread, or break.`,
    `No fine texture, soft gradients or shading: thread sews flat colour, so a blend becomes bands. Flat, pop-art, simple, silhouette and line-art styles sew well; crayon, sketch, watercolour and anime shading don't.`,
    `No detail under ${ART.detail} mm across (${px(ART.detail)} px) and no words under ${ART.text} mm tall (${px(ART.text)} px). Better: leave words out and add them in Design your own, where lettering sews from much smaller.`,
    `A plain background in one colour, with nothing else in it, so it can be left as fabric.`,
    shape.ratio === "1:1" ? `A square picture: the hoop's shape.` : `Square, or ${shape.words} like the hoop, so the design can fill it.`,
    `Sewn smaller than ${sizeMm} mm, everything shrinks with it: keep it simpler still.`,
  ];
  const what = subject.trim().replace(/[.\s]+$/, "") || "[what you want stitched]";
  const names = owned && owned.map((c) => `${c.name} (${c.hex.toUpperCase()})`).join(", ");
  const palette = !owned ? null : owned.length <= ART.fewest ? `Use only these colours: ${names}.` : `Use only ${ART.fewest} to ${Math.min(most, owned.length)} of these colours: ${names}.`;
  const prompt = [
    `A simple flat illustration of ${what}, for machine embroidery.`,
    `${palette || `Use only ${ART.fewest} to ${most} solid colours.`} No gradients, shading, shadows, highlights, texture or noise: every area is one flat colour.`,
    `Flat vector or pop-art style, not crayon, sketch, watercolour or painterly.`,
    `Bold, clean shapes with smooth edges and thick, even outlines, at least ${px(ART.ask * ART.line)} px thick on a ${PX} px image.`,
    `No detail smaller than ${px(ART.ask * ART.detail)} px across, no thin lines, no small text.`,
    `Centred on a plain white background with nothing else in it.`,
    shape.ask,
  ].join(" ");
  return { rules, prompt, tip: `Midjourney: add --ar ${shape.ratio} --style raw at the end. If the picture comes back with shading or a busy background, ask again: "flatter, fewer colours, plain background".` };
}

// What the check of a picture says (core/artcheck.js `art`, as the worker returns it). `c`: { size (mm, as sewn),
// max (the biggest that fits), colors (thread colours asked), most, style, flat (the picture's colours are flat:
// no photo or texture verdict above), smoothed (it was smoothed first), lost (the left-out note is said: it rings those parts and offers its own fixes),
// bg (the background is left unstitched), skip (colour ids left out), sewn (colours sewn) }.
// Returns { bad: [{ id, text, spots, fix: { label, over } | null, else: what to do when no tap mends it }], good }.
export function artSaid(art, c) {
  if (!art) return { bad: [], good: "" };
  const bad = [], good = [], at = `at ${c.size} mm`, fill = c.style === "fill";
  // the smallest Size, in 5 mm steps, that mends it, when the hoop holds it
  const bigger = (need) => { if (!(need > 1) || c.size >= c.max) return null; const s = Math.min(c.max, Math.ceil((c.size * need) / 5) * 5); return s * 1.0001 >= c.size * need ? { label: `Make it ${s} mm${s === c.max ? " (as big as fits)" : ""}`, over: { size: s } } : null; };
  const t = art.text || { n: 0 };
  if (t.small) bad.push({ id: "text", spots: t.spots, fix: bigger(t.need),
    text: `The lettering is about ${t.mm} mm tall ${at}. Under ${ART.text} mm a picture's letters sew blotchy: their strokes are too thin to fill and the holes in them close up.`,
    else: "Leave the words out of the picture and add them in Design your own, which sews lettering as lettering." });
  else if (t.n) good.push(`lettering ${t.mm} mm tall`);
  const sm = art.small || { n: 0 };
  // (a photo's specks and lines are its texture, said by the verdict above: not counted one by one)
  const photo = !c.flat && !c.smoothed;
  if (fill && !c.lost && !photo && sm.n >= 3) bad.push({ id: "small", spots: sm.spots, fix: bigger(sm.need),
    text: `${sm.n} details are under ${ART.detail} mm across ${at}: too small for thread to draw as a shape, so they are left out or sewn into the colour round them.`,
    else: "Draw them bigger in the picture, or leave them out of it." });
  else if (fill && !c.lost && !photo) good.push("details big enough");
  const th = art.thin || { n: 0 };
  if (fill && !photo && th.n) bad.push({ id: "thin", spots: th.spots, fix: bigger(th.need),
    text: `${th.n === 1 ? "A line is" : `${th.n} lines are`} thinner than ${ART.line} mm ${at}, so ${th.n === 1 ? "it is" : "each is"} sewn as a single line of thread, thinner than drawn.`,
    else: `Draw ${th.n === 1 ? "it" : "them"} bolder in the picture to have ${th.n === 1 ? "it" : "them"} filled.` });
  else if (fill && !photo) good.push("lines thick enough");
  // (colours and blends only on a flat picture: a photo's or a textured one's are said by the verdict above)
  if (c.flat && art.blend >= ART.blend && c.style !== "line") bad.push({ id: "blend", spots: art.blendSpots,
    fix: c.colors > ART.fewest ? { label: `Use ${ART.fewest} thread colours`, over: { colors: ART.fewest } } : null,
    text: "Parts of the picture blend softly from one colour to another. Each thread is one colour, so a blend sews as bands of flat colour, and fewer colours make fewer, bolder bands.",
    else: "Ask for the picture again without gradients or shading." });
  // (against the colours sewn, not asked: the fabric's colour closed in by the design is sewn as one more)
  else if (c.flat && c.style !== "line" && art.colours > c.sewn && !c.skip.length) {
    const want = Math.min(c.most, c.colors + art.colours - c.sewn);
    bad.push({ id: "colours", spots: [], fix: want > c.colors ? { label: `Use ${want} thread colours`, over: { colors: want } } : null,
      text: `The picture has about ${art.colours} colours and is sewn in ${c.sewn} ${c.sewn === 1 ? "thread" : "threads"}, so colours close to each other share one.`,
      else: `Thread colours go up to ${c.most}: a picture with fewer colours sews closer to what was drawn.` });
  } else if (c.flat && c.style !== "line" && c.sewn) good.push(`${c.sewn} flat ${c.sewn === 1 ? "colour" : "colours"}`);
  const edgeLeft = (art.edgeIds || []).filter((id) => !c.skip.includes(id));
  if (c.bg && art.busy) bad.push({ id: "background", spots: art.edgeSpots,
    fix: edgeLeft.length && edgeLeft.length < c.sewn ? { label: "Leave out the background's colours", over: { skip: [...c.skip, ...edgeLeft] } } : null,
    // (its own colours left out, what is left of it shares threads with the design)
    text: edgeLeft.length || !art.edgeIds?.length ? "The background isn't one plain colour, so it can't be told apart from the design and is sewn as part of it."
      : "The background's own colours are left out; the rest of it is in the design's colours, so it is still sewn.",
    else: "Ask for the picture again on a plain white background, or cut the background away first." });
  else if (c.bg) good.push(art.seeThrough ? "a see-through background" : "a plain background");
  return { bad, good: good.length ? `Sews well ${at}: ${list(good)}.` : "" };
}
