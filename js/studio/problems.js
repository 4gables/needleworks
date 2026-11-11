/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// What's wrong with each piece and what to do about it: the one problems list of the Design tab (too small, loops
// that fill, touching, off its frame, missing letters...), each with the fixes that land, worked out in paced
// steps so typing never waits for it. The editor hands in its state and helpers as S. (Part of ui.js until 2026-11.)
import { ROUND } from "./starters.js";
import { nearestBrotherThread } from "../core/threads.js";
import { MOTIFS } from "./motifs.js";
import { FONTS, fontOf, loadFont } from "../core/fonts.js";
import { letters } from "./lettering.js";
import { LOOK, BLOCK, TIP, mmText, isolate } from "../words.js";
import { unswashed, initials, lackList, swashes } from "../core/typed.js";
import { fittedSizes, label, pieceStitches, minSize, archRoom, touchingAll, loopsFill, fineLine, towelMin, underPatch, TEXT_SHAPES, archTight, pacer, PACED, drawAhead, fitFrame, inFrame, touching, archFit, archShrink, clearSize } from "./pieces.js";

// Whether automatic lettering sews as a thin line, as the file has it: straight lines are each sized by the first
// line's own ink (`textRows`), so it is the first line that decides. (Asked of all the lines as one, "Handmade with
// love / by Grandma / March 2026" at 6 mm read "Automatic: thin line" over a satin file: the g and y of the later
// lines made the joined words taller, so smaller.)
export function sewsThin(p) {
  if (p.kind !== "text" || (p.shape && p.shape !== "straight") || (p.style || "auto") !== "auto") return fineLine(p);
  const raw = (p.text || "").split("\n"), i = raw.findIndex((l) => l.trim());
  if (i < 0 || raw.filter((l) => l.trim()).length < 2) return fineLine(p);
  // (drawn as `textRows` draws it, its spacing and letter pairs with it, so this reads the drawing already made)
  const line = raw[i].trim(), at = raw.slice(0, i).reduce((a, l) => a + l.length + 1, 0) + raw[i].length - raw[i].trimStart().length;
  const print = fontOf(p.font).print, kern = Array.from({ length: line.length }, (_, k) => ((print && p.kern?.[at + k]) || 0) / 100);
  const l = letters(line, p.font, p.size, "auto", print ? (p.spacing || 0) / 100 : 0, kern, false);
  return l.parts.length > 0 && l.satinW === 0;
}

export function problemsOfPieces(S) {
  const { $, api } = S;
  function pieceProblems(p, fit = fittedSizes(S.pieces)) {
    const list = [], L = label(p), add = (kind, level, text, id = `${kind}:${p.id}`) => list.push({ id, kind, level, text, piece: p.id });
    const fs = fit.get(p.id), q = fs ? { ...p, size: fs } : p, lettering = p.kind === "text" || p.kind === "monogram";
    const d = { fs, q, lettering, max: p.kind === "monogram" ? 90 : 60, onTowel: S.fabric === "towel" && lettering, m: 0, towel: 0, fills: 0, room: null, nears: [], near: null, gone: [], pushed: [], rows: 0, thin: false, cover: null, better: "" };
    if (p.kind === "frame") return { list, d };
    // Lettering with no words sews nothing, and lettering that draws nothing (words past the most it takes, in a crafted
    // design) is left out of the file: both said, never a file without the words asked for.
    const words = p.kind === "monogram" ? p.letters : p.kind === "text" ? unswashed(p.text) : p.kind === "letters" ? p.text : null;
    if (words !== null && !/[^\s]/u.test(words || "")) {
      add("empty", LOOK, p.kind === "monogram" ? "A monogram has no initials yet: type them, or remove it." : "A lettering piece has no words yet: type some, or remove it.");
      return { list, d };
    }
    if (words !== null && !pieceStitches(q).length) add("undrawn", BLOCK, `${L} comes out as no stitches at all: use fewer or other letters.`);
    d.m = minSize(q); d.room = archRoom(p); d.nears = touchingAll(q, S.pieces); d.near = d.nears[0] || null; d.fills = loopsFill(q);
    d.gone = S.missing(p.text ?? p.letters ?? "", p.font); d.thin = sewsThin(q);
    d.towel = d.onTowel ? towelMin(d.m ? { ...q, size: d.m } : q) : 0;
    d.cover = underPatch(p, S.pieces);
    const base = p.kind !== "file" && underPatch(p, S.pieces, true), lost = !!base && S.hard(p.color, base.fill || base.color);
    d.better = lost ? S.against(base, S.pieces) : "";
    d.pushed = p.kind === "text" ? S.overlapping(p) : [];
    d.rows = p.kind === "text" ? p.text.split("\n").filter((l) => l.trim()).length : 0;
    if (p.kind === "monogram") {
      const t = initials(p.letters), word = t.join("");
      if (t.length > 3) add("named", LOOK, `${L} has ${t.length} letters: a monogram sews 3 initials at most.`);
      else if (/^\p{Lu}\p{Ll}{2,}$/u.test(word)) add("named", LOOK, `${L} looks like a name: a monogram sews initials, so it won't read as “${word}”.`);
    }
    if (d.rows > 1 && (p.shape || "straight") !== "straight") add("lines", LOOK, `${L} is sewn on one line: ${TEXT_SHAPES[p.shape]} joins its ${d.rows} lines.`);
    if (d.cover) add("covered", LOOK, `${L} sews before the patch that covers it.`);
    if (lost) add("hidden", LOOK, `${L} is nearly the same thread as the patch under it, so it won't show.`);
    if (d.pushed.length) add("pushed", LOOK, `${L} has letters pushed into each other: their stitches would pile up as a lump.`);
    // capitals in a joined script run together: in every script font "THEO" read wrong somewhere (Yellowtail's H as an
    // h: "ThEO" on the bib), so words mostly in capitals are said, with a print font as the fix
    if (p.kind === "text" && !FONTS.find((f) => f.family === p.font)?.print && capsHeavy(unswashed(p.text))) add("caps", LOOK, `${L} is in capitals, which run together in a joined script font and are hard to read.`);
    const style = p.style || "fill", least = p.kind === "motif" ? S.MOTIF_LEAST[style] || 0 : 0;
    if (least && p.size < least) add("motif", LOOK, style === "fill" ? `${L} is too small to fill: the detail closes up.` : style === "outline" ? `${L} is too small as an outline: the edges run together.` : `${L} is too small for appliqué: the fabric piece is tiny and the edges run together.`);
    if (d.gone.length) add("missing", LOOK, `The font of ${L} has no ${lackList(d.gone)}: ${d.gone.length === 1 ? "it" : "they"} would be stitched in a stand-in letter.`);
    if (d.towel > d.max || (!d.m && d.towel > q.size * 1.04)) add("towel", LOOK, `${L} closes up on a towel or fleece.`);
    else if (d.m) add("small", LOOK, `${L} is too small to stitch cleanly.`);
    if (d.room?.full) add("arch", BLOCK, `${L} runs into itself round the curve.`);
    else if (d.room || archTight(p)) add("arch", LOOK, d.room ? `${L} wraps too far round its curve.` : `${L} is too tall for its curve: the letters would bunch up.`);
    // (a pair is one problem, said once, whichever of the two is selected)
    for (const o of d.nears) { const [a, b] = S.pieces.indexOf(p) < S.pieces.indexOf(o) ? [p, o] : [o, p]; add("runs", LOOK, `${label(a)} runs into ${label(b)}.`, `runs:${a.id}-${b.id}`); }
    const plain = !d.m && !d.towel && S.fabric !== "towel";
    if (plain && d.thin) add("thin", TIP, `${L} sews as a thin line at this size.`);
    if (plain && d.fills) add("loops", LOOK, `${L} has small loops that fill in at this size.`);
    return { list, d };
  }
  // words mostly in capitals (3 or more, more capitals than small letters)
  const capsHeavy = (t) => { const up = (t.match(/\p{Lu}/gu) || []).length; return up >= 3 && up > (t.match(/\p{Ll}/gu) || []).length; };
  // the swashes the words have (`~` before the first line, after the last), as the Swash buttons show them
  const swashOn = (text) => { const ls = text.split("\n").filter((l) => l.trim()); return { lead: swashes(ls[0] || "").lead, tail: swashes(ls[ls.length - 1] || "").tail }; };
  // too-small lettering, said plainly (updated in place so typing keeps focus)
  // (each new lettering its fixes need drawn in a task of its own, `pacer`: started again after each, everything before
  // it cached; never said from a run that was stopped)
  async function warn() {
    for (let k = 0; k < 30; k++) {
      pacer.on = true; pacer.hit = false; pacer.since = performance.now();
      try { await warnNow(); } catch (err) { if (err !== PACED) throw err; } finally { pacer.on = false; }
      if (!pacer.hit) return;
      await S.nextTask();
    }
    await warnNow();
  }
  // (the pacer is on only while this runs, between its awaits: switched back on by the run itself once it's going again
  // (`go`), and off before it ends. Switched back on as an await finished, or left on as the run ended, it was on for
  // whatever else ran first, a redraw's focus handler or a font-load continuation, which threw "paced" uncaught)
  async function warnNow() {
    const on = pacer.on;
    try {
      const w = $("st-edit").querySelector("[data-warn]"), p = S.current(); if (!w || !p) return;
      const wait = (promise) => { pacer.on = false; return promise; }, go = () => { pacer.on = on; pacer.since = performance.now(); return false; };
      if (p.font) try { await wait(loadFont(p.font)); go(); } catch { return; }
      // (the fixes worked out a few tasks apart, so typing is answered between them: a long line's fixes draw it on two
      // lines and in a print font, 1.5 s in one task. A piece changed meanwhile has a newer warn coming: this one stops)
      const was = JSON.stringify(p), apart = async () => { await wait(S.nextTask()); return !w.isConnected || S.current() !== p || JSON.stringify(p) !== was; };
      // (new words drawn first, a task at a time, as make does: warn came before make had drawn them)
      for (const draw of drawAhead(p)) if (draw() && ((await apart()) || go())) return;
      const fit = $("st-edit").querySelector("[data-fit]"), fs = fittedSizes(S.pieces).get(p.id);
      if (fit) {
        // (in a tall frame, turned a quarter to run up it, as letters on a key fob do: offered when that's much bigger;
        // three initials on the 44 × 80 mm fob were 9.5 mm across it, 18 up it)
        const up = fs ? S.runUp(p, fs) : 0;
        // (the size control says it too: it read 24 mm beside "Shrunk to 22 mm")
        const r = $("st-edit").querySelector('input[data-k="size"]');
        if (r) { const o = r.nextElementSibling, cut = fs && fs !== +r.value; o.textContent = cut ? `${fs} mm sewn` : S.shown(r.value, "mm"); o.title = cut ? `Set to ${S.shown(r.value, "mm")}, sewn at ${S.shown(fs, "mm")} to fit inside the frame` : ""; }
        // (shrunk as far as it goes and still past the frame, said so: "Shrunk to 5 mm so it fits inside the frame" stood
        // beside 60 letters running 127 mm past a heart and the hoop)
        const host = fs && fitFrame(p, S.pieces), past = host && !inFrame({ ...p, size: fs }, host, 0);
        // (and words shrunk a lot by their frame, on two lines: a patch's one-line words went 20 -> 5.5 mm and a quilt
        // label's top line 7 -> 5 mm, thin, with no way back said)
        const two = fs && !up ? S.frameLines(p, fs) : null;
        const nw = two && (two.n === 3 ? "three" : "two");
        const lines = two ? ` On ${nw} lines it can be ${two.size} mm: <button type="button" class="link" data-lines="${two.ask}" data-text="${encodeURIComponent(two.text)}"${two.fits === "turn" ? " data-turn" : ""}>Put it on ${nw} lines${two.fits === "turn" ? " and turn the hoop" : ""}</button>` : "";
        fit.hidden = !fs; fit.innerHTML = past ? `Shrunk to ${fs} mm, the smallest it goes, and it still runs past the frame: use fewer words, or make the frame bigger.${lines}`
          : fs ? `Shrunk to ${fs} mm so it fits inside the frame.${up ? ` Turned to run up the frame it can be ${up} mm: <button type="button" class="link" data-run-up="${up}">Turn it to run up the frame</button>` : lines}` : "";
      }
      if ((await apart()) || go()) return;
      // what's wrong with it, worked out once (`pieceProblems`) as every other surface says it; here each with its fix
      const { list, d } = pieceProblems(p), { q, m, room, nears, near, gone, fills, towel, max, lettering, onTowel } = d;
      if ((await apart()) || go()) return;
      const ids = (kind) => list.filter((x) => x.kind === kind).map((x) => x.id).join(" ");
      const tag = (kind, html) => (html && ids(kind) ? `<span data-problem="${ids(kind)}">${html}</span>` : "");
      // Every one-tap fix is checked before it's offered: it must leave nothing it could have avoided (a towel size that
      // took the design past the hoop, a size the frame fit shrank straight back, two taps where one would do).
      // The size the letters need: big enough to stitch cleanly and, on a towel, for the loops to stay open
      // (within 4 % of it isn't worth a warning: the towel starter's own 32 mm asked for 33 for "The Smiths").
      const need = towel > max ? 0 : towel && (m || towel > q.size * 1.04) ? towel : m;
      const btn = (attrs, text, l) => `<button type="button" class="link" ${attrs}${l?.fits === "turn" ? " data-turn" : ""}>${text}${l?.fits === "turn" ? " and turn the hoop" : ""}</button>`;
      // (only where cotton clears it: letters too small for any fabric kept their warning after "Sew it as Cotton")
      const cotton = onTowel && !m ? ` A flat-weave tea towel (no loops) can be sewn as Cotton: ${btn(`data-fab-set="cotton"`, "Sew it as Cotton")}` : "";
      let size = "";
      if (towel > max) size = `On a towel or fleece the stitches are made wide so they sit on top of the loops, and that closes these letters up even at the biggest size. Try a bolder font, like Yellowtail or Satisfy.${cotton}`;
      else if (need) {
        const what = m ? `These letters are too small to stitch cleanly${need > m ? ` (on a towel or fleece they need to be ${need} mm, so the wide stitches that sit on top of the loops leave the letters open)` : ""}.` : `On a towel or fleece the stitches are made wide so they sit on top of the loops, and at this size that closes the letters up: ${need} mm or more keeps them open.`;
        if (fs) {   // (the frame fit sets the size: a bigger size would be shrunk straight back, the "Make it 10 mm" loop)
          // two lines, at the biggest size (up to the one asked for) that fits the frame and clears everything else
          const two = S.twoLines(p);
          let at2 = 0;
          for (let t = p.size; two && t >= 5 && !at2; t -= 0.5) {
            const r = { ...p, text: two, size: t }, ps2 = S.pieces.map((o) => (o.id === p.id ? r : o)), s2 = fittedSizes(ps2).get(p.id) ?? t;
            if (minSize({ ...r, size: s2 }) || (onTowel && towelMin({ ...r, size: s2 }) > s2 * 1.04)) break;
            if (!touching({ ...r, size: s2 }, ps2)) at2 = t;
          }
          // or the frame made bigger by as much, where that lands (a towel monogram's R filled in, with no way out but
          // "make the frame bigger")
          const host = !at2 && S.frameOf(p), grow = host ? S.frameFor(p, host, need) : null;
          const bigger = grow ? btn(`data-frame-grow="${host.id}:${grow.w}:${grow.h}:${need}"`, `Make the frame ${grow.w} mm`, grow) : "";
          size = `Shrunk to fit inside the frame, ${what[0].toLowerCase() + what.slice(1)} ${at2 ? `${btn(`data-lines="${at2}"`, "Put it on two lines")} or make the frame bigger.`
            : bigger ? `${bigger}${p.kind === "monogram" ? "" : ", or use fewer words"}.` : host?.most ? `${p.kind === "monogram" ? "Use a bolder font" : "Use fewer words"}: the frame is as big as ${S.display(host)} takes.`
            : p.kind === "monogram" ? "Make the frame bigger, or use a bolder font." : "Use fewer words, or make the frame bigger."}`;
        } else if (need > max) size = `${what} Use fewer or shorter words, or a bolder font.`;
        else {
          const l = S.landing(p, S.sizeChange(p, need));
          size = l.fits ? `${what} ${btn(`data-size="${need}"`, `Make it ${need} mm`, l)}`
            : l.capped ? `${what} ${S.roomIn(p, l, need)}`
            : l.hit ? `${what} At ${need} mm it would ${l.out ? "go outside" : "run into"} ${api.escapeHtml(label(l.hit))}: give it more room first.`
            : l.worse ? `${what} At ${need} mm it would ${S.worseSaid(l.worse)}.`
            : `${what} At ${need} mm it would be ${mmText([l.w, l.h])}, too big for the hoop even turned. Use fewer or shorter lines${onTowel ? ", or a bolder font (Yellowtail, Satisfy)." + cotton : "."}`;
        }
      }
      if ((await apart()) || go()) return;
      // an arch too tight or wrapped too far round: a wider curve, or smaller letters, whichever lands in the hoop
      let arc = "";
      if (ids("arch")) {
        const widen = S.keepWord(p, { ...(room || {}), ...(archFit({ ...p, ...(room || {}) }) || {}) }), wl = Object.keys(widen).length ? S.landing(p, widen) : null;
        const sh = archShrink(p), sl = sh ? S.landing(p, { size: sh }) : null;
        const fixes = [wl?.fits ? btn("data-room", "Widen the curve", wl) : "", sl?.fits ? btn(`data-size="${sh}"`, `Make the letters ${sh} mm`, sl) : ""].filter(Boolean);
        arc = (room ? `The words wrap too far round the curve${room.full ? " and run into themselves" : ""}.` : "The curve is too tight for letters this tall: they'd bunch up.")
          + (fixes.length ? " " + fixes.map((f, i) => (i ? f.replace(">Make", ">make") : f)).join(" or ")
            : wl?.hit ? ` A curve wide enough would ${wl.out ? "go outside" : "run into"} ${api.escapeHtml(label(wl.hit))}: use fewer words.`
            : wl?.worse ? ` A curve wide enough would ${S.worseSaid(wl.worse)}: use fewer words.`
            : wl ? ` A curve wide enough would be ${mmText([wl.w, wl.h])}, too big for the hoop: use fewer words.` : " Use fewer words.");
      }
      // run into another piece: the size that clears it (lettering centred in a frame isn't dragged apart, it's made smaller)
      let hit = "";
      if (near) {
        // (the frame it's on: the nearest earlier one whose box holds its middle)
        const host = S.pieces.slice(0, S.pieces.indexOf(p)).reverse().find((f) => f.kind === "frame" && Math.abs(p.x - f.x) < f.w / 2 && Math.abs(p.y - f.y) < (f.shape === "circle" ? f.w : f.h) / 2);
        const inside = host && host.id === near.id, frameName = host && api.escapeHtml(label(host).toLowerCase());
        // (checked like every other fix: clear of the frame at 19 mm, a monogram ran into the R beside it instead)
        const cs = ((c) => (c && S.landing(p, { size: c }).fits === "fits" && !touchingAll({ ...q, size: fittedSizes(S.pieces.map((o) => (o.id === p.id ? { ...p, size: c } : o))).get(p.id) ?? c }, S.pieces).length ? c : 0))(lettering || p.kind === "motif" ? clearSize(p, S.pieces, near) : 0);
        // (no size clears it: a spot in the frame that does, at a size that fits there, else no advice that can't work;
        // "Make it smaller." with no button sat under a monogram across a pouch's zipper)
        const to = host && !cs ? S.spotIn(p, true) : null, zip = host?.border === "zip";
        const move = to ? btn("data-move", `Move it ${zip ? "below the zipper" : `to the free space in the ${frameName}`}${to.size !== (d.fs ?? p.size) ? `, ${to.size} mm` : ""}`) : "";
        const full = host ? `There's no free space for it in the ${frameName}: make the frame bigger, or take something out.` : "";
        // (or, at the size it is, to free room beside what it runs into: a motif made bigger over the name under it had
        // only "Drag it apart", as did a design file)
        const away = !inside && !to ? S.moveAway(p, near) : null;
        const go = away ? btn(`data-move-to="${away.x},${away.y}"`, `Move it ${away.where}`, away.l) : "";
        hit = inside ? `This runs into the ${frameName} around it${zip ? " (the zipper and its stitching are across the top)" : ""}. ${cs ? btn(`data-size="${cs}"`, `Make it ${cs} mm`) : move || full}`
          : `This runs into ${api.escapeHtml(S.and(nears.map((o) => label(o))))}. ${cs || go ? `${[cs ? btn(`data-size="${cs}"`, `Make it ${cs} mm`) : "", go].filter(Boolean).map((b, i) => (i ? b.replace(">Move", ">move") : b)).join(", ")} or drag it apart.` : move ? `${move}, or drag it apart.` : full || "Drag it apart."}`;
      }
      // a motif too small for its style: filled, the detail closes up under 25 mm; as an outline or appliqué the satin
      // edges run together under 30 mm (a 15 mm butterfly's antennae merged, a house's window filled in, and the
      // appliqué fabric piece was 7 mm across). Outline was offered as the way out for a small filled one: it's worse.
      let small = "";
      if (ids("motif")) {
        const style = p.style || "fill", least = S.MOTIF_LEAST[style], l = S.landing(p, { size: least });
        small = `${style === "fill" ? "Filled this small, the detail closes up." : style === "outline" ? "As an outline this small, the edges run together and the detail fills in." : "As appliqué this small, the fabric piece is tiny to cut and the edges run together."} `
          + (l.fits ? btn(`data-size="${least}"`, `Make it ${least} mm`, l) : `Move it where there's room, then make it ${least} mm or more.`);
      }
      // (a bigger size for loops that fill in is offered only when it lands, like every other fix)
      const fillsAt = ids("loops") && fills <= 3 * q.size ? S.landing(p, S.sizeChange(p, fills)) : null;
      // (shrunk back by its frame: a frame big enough, else the motifs either side left out, where that lands)
      const plain = fillsAt?.capped && p.deco && !fillsAt.host?.deco ? S.landing(p, { deco: "", ...S.sizeChange(p, fills) }) : null;
      // (the motifs left out first where that holds: Motif either side shrank a 17 mm name to 15 and offered only "make
      // the frame 135 mm and turn the hoop", Kitchen sign)
      const growBtn = fillsAt?.capped ? S.grown(p, fillsAt.host, fills) : "";
      const fillsGrow = !fillsAt?.capped ? "" : [plain?.fits ? btn(`data-size="${fills}" data-no-deco`, `Make it ${fills} mm without the ${api.escapeHtml((MOTIFS[p.deco]?.name || "motif").toLowerCase())}s`, plain) : "",
        growBtn ? `${growBtn} for ${fills} mm letters` : ""].filter(Boolean).map((b, i) => (i ? b.replace(">Make", ">make") : b)).join(", or ");
      // a name typed as initials ("Max" sewed as a first/LAST/middle monogram, "MaX" with a big a): as lettering instead
      let named = "";
      if (ids("named")) {
        const t = initials(p.letters), word = t.join("");
        named = (t.length > 3 ? `A monogram has 3 initials at most, so only “${api.escapeHtml(t.slice(0, 3).join(""))}” would be sewn.`
          : `“${api.escapeHtml(word)}” looks like a name: a monogram sews initials (first, LAST, middle) with the middle one biggest, so it wouldn't read as “${api.escapeHtml(word)}”.`)
          + ((l) => (l.fits ? ` ${btn("data-as-text", `Sew “${api.escapeHtml(p.letters.trim())}” as lettering`, l)}`
            : ` Sewn as lettering it would ${l.out ? "go outside" : l.hit ? `run into ${api.escapeHtml(label(l.hit))}` : l.worse ? S.worseSaid(l.worse) : "be too big for the hoop"}${l.worse ? "." : ": make it smaller first."}`))(S.landing(p, S.asLettering(p)));
      }
      // under a patch that sews after it (hidden), or sewn on a patch in nearly the same thread (it won't show)
      const under = d.cover ? `The ${api.escapeHtml(label(d.cover).toLowerCase())} patch sews after this and would cover it. <button type="button" class="link" data-after="${d.cover.id}">Sew it after the patch</button>` : "";
      const same = `This is nearly the same thread as the patch under it, so it wouldn't show.${d.better ? ` <button type="button" class="link" data-color-set="${d.better}">Use ${api.escapeHtml(nearestBrotherThread(d.better).name)}</button>` : " Pick a thread that stands out from it."}`;
      // letter pairs pushed into each other
      const kerned = d.pushed.length ? `The letters ${d.pushed.map((i) => `“${api.escapeHtml(p.text[i] + p.text[i + 1])}”`).join(", ")} are pushed into each other: their stitches would pile up as a lump. ${d.pushed.map((i) => `<button type="button" class="link" data-kern-off="${i}">Space ${api.escapeHtml(p.text[i] + p.text[i + 1])} as the font does</button>`).join(" ")}` : "";
      // lines typed into a curved shape (they're joined into one line: a 3-line text on a wave came out 203 mm long
      // with nothing said)
      // (offered where the lines then land: straight, "Lily / Rose" on two lines ran into the "Emma" under it)
      const straight = ids("lines") ? S.landing(p, { shape: "straight" }) : null;
      const oneLine = straight ? `${TEXT_SHAPES[p.shape]} sews the words on one line, so the ${d.rows} lines are joined into one. ${straight.fits ? `${btn(`data-seg-set="shape:straight"`, "Make it straight", straight)} to keep the lines.` : `Straight, the lines would ${straight.out ? "go outside" : straight.hit ? `run into ${api.escapeHtml(label(straight.hit))}` : straight.worse ? S.worseSaid(straight.worse) : "be too big for the hoop"}: give it more room first.`}` : "";
      // (a style change is checked too: bold is wider, and "Make it bold" ran “Emma” into the “Emma” beside it)
      const no = (l) => `${l.out ? "go outside" : l.hit ? `run into ${api.escapeHtml(label(l.hit))}` : l.worse ? S.worseSaid(l.worse) : "be too big for the hoop"}`;
      const bold = ids("thin") ? S.landing(p, { style: "satin" }) : null, line = ids("loops") ? S.landing(p, { style: "line" }) : null;
      // (one piece of advice per size: where bold would fill the loops, "Make it bold" isn't offered, as bold there says
      // "Thin line keeps them open": a birth announcement's name flipped between the two at 14.5 and 20.5 mm)
      // (the size it sews bold with its loops open, found by trying: loops scale with the satin's width, which doesn't
      // grow with the size: measured at 12 mm the bold loops wanted 19, at 19 they wanted 24)
      let boldFills = bold ? loopsFill({ ...q, style: "satin" }) : 0;
      for (let i = 0; i < 4 && boldFills > q.size && boldFills <= 60; i++) { const r = { ...p, size: boldFills }, n = sewsThin(r) ? boldFills + 1 : loopsFill(r); if (!n || n <= boldFills) break; boldFills = n; }
      const boldAt = boldFills > q.size && boldFills <= 60 && !sewsThin({ ...p, size: boldFills }) && !(loopsFill({ ...p, size: boldFills }) > boldFills) ? S.landing(p, S.sizeChange(p, boldFills)) : null;
      // (too small, thin, or loops filling on one long line, as Fit to hoop leaves a long name: two lines may be much
      // bigger; said with the problem it fixes)
      const lines = !d.fs && (m || fills || (d.thin && S.fabric !== "towel")) ? ((c) => (c ? ` On ${c.n === 2 ? "two" : "three"} lines${c.turn ? " with the hoop turned" : ""} it can be ${c.size} mm. ${btn(`data-lines="${c.size}" data-text="${encodeURIComponent(c.text)}"`, `Put it on ${c.n === 2 ? "two" : "three"} lines`, { fits: c.turn ? "turn" : "fits" })}` : ""))(S.lineChoice(p)) : "";
      const withLines = ["small", "towel", "loops", "thin"].find((k) => ids(k));
      // (said plainly, with a one-tap fix where there is one; each item names the problem it's about, `data-problem`)
      if ((await apart()) || go()) return;
      const print = ids("caps") ? S.landing(p, { font: ROUND }) : null;
      const caps = print ? `Capitals in a joined script run together (an H can read as h). ${print.fits ? `${btn(`data-font="${ROUND}"`, "Sew it in Quicksand (print)", print)}, or type it in small letters.` : "Type it in small letters, or pick a print font."}` : "";
      const said = { named, lines: oneLine, caps, covered: under, hidden: same, pushed: kerned, motif: small,
        missing: gone.length ? `This font has no ${api.escapeHtml(lackList(gone))}: ${gone.length === 1 ? "it" : "they"} would be stitched in a stand-in letter. Take ${gone.length === 1 ? "it" : "them"} out or try another font.` : "",
        small: size, towel: size, arch: arc, runs: hit,
        empty: p.kind === "monogram" ? "No initials yet: type them above, or remove this piece." : "No words yet: type some above, or remove this piece.",
        undrawn: "These words come out as no stitches at all: use fewer or other letters.",
        thin: bold && (boldFills > q.size ? `At this size it sews as a thin line, which keeps the small loops open: bold, they'd fill in.${boldAt?.fits ? ` From ${boldFills} mm it sews bold with them open: ${btn(`data-size="${boldFills}"`, `Make it ${boldFills} mm`, boldAt)}.` : ""}`
          : `At this size it sews as a thin line.${bold.fits ? ` ${btn(`data-seg-set="style:satin"`, "Make it bold", bold)} (small loops may fill in).` : ` Bold, it would ${no(bold)}.`}`),
        loops: line && `At this size the small loops (the holes in letters like b and e) fill in.${line.fits ? ` ${btn(`data-seg-set="style:line"`, "Thin line", line)} keeps them open` : ""}${fillsAt?.fits ? `${line.fits ? ", or" : ""} ${btn(`data-size="${fills}"`, `${line.fits ? "make" : "Make"} it ${fills} mm`, fillsAt)}` : ""}${fillsGrow ? `${line.fits ? ", or" : ""} ${line.fits ? fillsGrow.replace(">Make", ">make") : fillsGrow}` : ""}${line.fits || fillsAt?.fits || fillsGrow ? "." : ""}` };
      if (pacer.hit) return;   // (a run stopped on the way: said by the next)
      w.innerHTML = isolate([...new Set(list.map((x) => x.kind))].map((k) => tag(k, said[k] + (k === withLines ? lines : ""))).filter(Boolean).join(" <br>"));   // (a space too: read aloud or copied, "lines.On two lines")
      w.hidden = !w.innerHTML;
      const auto = $("st-edit").querySelector('[data-seg="style"] [data-v="auto"]');
      if (auto) auto.textContent = S.autoName(p);
    } finally { pacer.on = false; }
  }
  return { pieceProblems, swashOn, warn };
}
