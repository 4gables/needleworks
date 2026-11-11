/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The Design tab's steps: the design's stages as steps with their threads, Have ready, step 1 (how to hoop),
// the appliqué guide and the How to stitch it panel. The editor hands in its state and helpers as S.
// (Part of ui.js until 2026-11.)
import { shortJumps } from "../doctor.js";
import { snipsSaid, pickIt, THREADING, TURN_PIC, youHtml } from "../sheet.js";
import { nearestBrotherThread } from "../core/threads.js";
import { inchFirst, explained, stopWords, problemsItems, shownOn } from "../words.js";
import { bulkReady, FABRICS } from "./pieces.js";

export function stepsPanel(S) {
  const { api, $ } = S;
  function stepsOf({ design, steps, after, before, hoop, bare }, lazy = false) {
    S.bareNow = !!bare;
    const later = lazy && S.thread !== "60" && !S.pieces.every(bulkReady), small = later ? S.lastSmall : S.smallNow();
    // (what the fabric needs goes first: a towel's topper was only in the folded "Sewing on"; the threads by the
    // spools they own when they've listed them, not the Brother names)
    // (the fabric's own stabilizer and finishing are left out when a project's own list already says (in-the-hoop,
    // patch, quilt sandwich), bar a towel's topper)
    // (a towel's topper only where there's lettering to sew under it)
    const own = (list) => !(S.fabric === "towel" && S.lettered()) && list.some((b) => /stabilizer/i.test(b));
    // (Have ready names each thread as the steps do: the file's palette, `threadNames`)
    const named = S.threadNames(S.sameSpool(steps));
    const fl = S.floated(), towel = S.fabric === "towel";
    const ready = [own(before) ? "" : fl ? fl.ready : FABRICS[S.fabric].ready, fl && towel ? "A water-soluble topper (like Solvy) for on top of the terry." : "", ...before,
      S.appliqued() ? `A piece of fabric for each appliqué shape, ${inchFirst(25.4)} bigger than its outline${steps.some((st) => st.cut) ? " (or cut to shape with the Cutter file, then there's nothing to trim)" : ""}, and small curved scissors (iron-on fusible web on the back stops cotton fraying).` : "",
      api.threadList(named.map((st) => st.color), (hex) => named.find((st) => st.color === hex)?.machine || nearestBrotherThread(hex).name)].filter(Boolean),
      done = snipsSaid([own(after) ? "" : fl ? fl.after + (towel ? " Tear the topper away (a damp cloth melts the bits left in the letters)." : "") : FABRICS[S.fabric].after, ...after].filter(Boolean), shortJumps(design.pattern()));
    return { design, ...explainAll(ready, firstStep(named, hoop, S.fileName()), done), small, later };
  }
  // step 1 says what to do too: hoop it, put the thread on, Start (a one-step design said only "Sews “Leo”."), one
  // sentence each so they show as numbered sub-steps (a towel's hoop, topper, thread and Start ran together as one)
  // Have ready, the steps and When it's done with each sewing word explained where it's first used (words.js `explained`)
  function explainAll(ready, steps, done) {
    const all = explained([...ready, ...steps.map((st) => st.you), ...done]), n = ready.length;
    return { ready: all.slice(0, n), steps: steps.map((st, i) => ({ ...st, you: all[n + i] })), done: all.slice(n + steps.length) };
  }
  // How the starter's project is hooped when it can't be (`floated`), in place of the fabric's way; never over a
  // project's own (in-the-hoop, a patch, a quilt sandwich)
  const hoopAs = (hoop) => { const fl = S.floated(); return fl && hoop === FABRICS[S.fabric].hoop ? (S.fabric === "towel" ? `${fl.hoop}. Lay the water-soluble topper on top` : fl.hoop) : hoop; };
  // (and starts at the machine: the file picked from the USB stick, and where threading is shown, `pickIt`)
  function firstStep(steps, hoop, file) {
    hoop = hoopAs(hoop);
    if (!steps.length || !hoop) return steps;
    const h = `${hoop}.`.replace(/\.\.$/, "."), t = steps[0].thread;
    return [{ ...steps[0], you: `${pickIt(file)} ${h} Put on ${t}. ${THREADING} ${steps[0].you || "Press Start."}` }, ...steps.slice(1)];
  }


  function applGuide(steps) {
    const has = steps.length > 0 && S.appliqued();
    $("st-appl-open").hidden = !has;
    if (!has) $("st-appl").hidden = true;
    else if (!api.store.get("studio.applSeen", false) && $("st-guide").hidden) $("st-appl").hidden = false;
  }
  $("st-appl-close").onclick = () => { $("st-appl").hidden = true; api.store.set("studio.applSeen", true); };
  $("st-appl-open").onclick = () => { $("st-appl").hidden = false; $("st-appl").scrollIntoView({ block: "nearest", behavior: "smooth" }); };
  // (`first`: a split design's first file, named over its steps; the rehooping between the files isn't a step or a
  // pause: the steps said "2 pauses" where the download said "no pauses")
  function stepsUI(steps, after = [], small = false, before = [], waiting = "", first = "") {
    S.guides = new Set(steps.filter((st) => !st.rehoop && st.under && steps.every((o) => o.rehoop || o.color !== st.color || o.under)).map((st) => st.color));
    S.lastSteps = steps; applGuide(steps); S.relabelThreads(steps);
    // (stops in the words the facts beside the preview use: "2 thread changes and 1 pause", not "3 pauses"; a split
    // design's rehooping between its files is neither)
    const rehoops = steps.filter((st) => st.rehoop).length, count = steps.length - rehoops;
    let changes = 0, same = 0, prev = null;
    for (const st of steps) { if (st.rehoop) { prev = null; continue; } if (prev) st.color === prev.color ? same++ : changes++; prev = st; }
    $("st-steps-count").textContent = !steps.length ? "" : `· ${rehoops ? `${rehoops + 1} hoopings, ` : ""}${count} ${count === 1 ? "step" : "steps"}${changes + same ? `, ${stopWords(changes, same)}` : ""}`;
    let n = 0;
    // each step is a button: the preview shows the design as it is after that step, what's still to come faint
    // (what's still wrong, and worth knowing, first: the steps said nothing of a name that closes up on fleece)
    $("st-steps").innerHTML = (steps.length ? problemsItems(shownOn(S.problems, "steps")) : "")
      + (waiting ? `<li class="after"><b>Waiting for a fit</b><span>${api.escapeHtml(waiting)}</span></li>` : "")
      + (api.turned() ? `<li class="after"><b>Hooping</b><span class="turned">${TURN_PIC}${api.escapeHtml(S.turnText())}</span></li>` : "") + (before.length ? `<li class="after"><b>Have ready</b><ul class="ready">${before.map((r) => `<li>${api.escapeHtml(r)}</li>`).join("")}</ul></li>` : "")
      + (first ? `<li class="after"><b>First hooping: ${api.escapeHtml(first)}</b></li>` : "")
      + steps.map((st, i) => st.rehoop ? `<li class="after"><b>${api.escapeHtml(st.title)}</b>${youHtml(st.you, api.escapeHtml)}</li>` : `<li><button type="button" data-step="${i}" aria-pressed="${api.step() === i}">
      <b><span class="n">${++n}</span><i style="background:${st.color}"></i>${api.threadHtml(st.color, st.machine || nearestBrotherThread(st.color).name, " ", S.guides.has(st.color))}</b>
      ${st.you ? youHtml(st.you, api.escapeHtml) : ""}<span>${api.escapeHtml(st.sews.join(" "))}</span>
      ${st.early ? `<small>Sewn early, with the other ${api.escapeHtml(st.machine || nearestBrotherThread(st.color).name)} parts, to save a thread change.</small>` : ""}</button></li>`).join("")
      + (S.threadTip(small) ? `<li class="after"><b>Thread and needle</b><span>${api.escapeHtml(S.threadTip(small))}</span></li>` : "")
      + (after.length ? `<li class="after"><b>When it's done</b><span>${api.escapeHtml(after.join(" "))}</span></li>` : "");
  }
  $("st-steps").onclick = (e) => { const b = e.target.closest("[data-step]"); if (b) api.showStep(api.step() === +b.dataset.step ? null : +b.dataset.step); };
  return { stepsOf, stepsUI, firstStep, explainAll };
}
