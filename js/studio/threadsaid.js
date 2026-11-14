/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// How the editor names threads: the machine's name for a colour as this design's file has it, the thread line
// under a piece's swatches, swatch tips, and the offers that save thread changes (one thread for everything, the
// same spool). The editor hands in its state and helpers as S. (Part of ui.js until 2026-11.)
import { compose, THREADS } from "./pieces.js";

export function threadSaid(S) {
  const { api, $ } = S;
  // the name the machine will show for `hex` if the piece's colour `was` became it: the file's palette gives each colour
  // its nearest Brother thread no earlier colour took (machineThreads; a JEF's Janome threads alike, `api.fileThreads`),
  // so a colour may get its second-nearest. The
  // editor said "Brother Dark Gray" (the nearest) while the chips, steps and sew sheet said Olive Green (Dark Gray taken)
  // (`p`: the piece being recoloured. Another piece keeping the colour `was` keeps its blocks: a Madeira swatch's tooltip
  // said Pink with the name sharing navy with the heading, both recoloured in the guess, while the file named Light Lilac)
  function machineName(hex, was = hex, p = null) {
    const seg = S.hoopings.find((h) => h.includes(was)) || S.hoopings[0] || [];
    const shared = p && S.pieces.some((q) => q.id !== p.id && [q.color, q.fill, q.blend].includes(was));
    const cols = !seg.includes(was) ? [...seg, hex] : !shared ? seg.map((c) => (c === was ? hex : c))
      : seg.includes(hex) ? seg : [...seg.slice(0, seg.lastIndexOf(was) + 1), hex, ...seg.slice(seg.lastIndexOf(was) + 1)];
    return api.fileThreads(cols.map((color) => ({ color })))[cols.indexOf(hex)].name;
  }
  // a piece's thread as every surface labels it (their spool first when they own one, else the machine's name)
  function threadOf(p, k = "color") { return api.threadLine(p[k], machineName(p[k]), S.guides.has(p[k])); }

  // (their spool's tooltip in the words every surface uses: app.js `threadLabel`)
  function swatchTip(hex, was, own, p) { const m = machineName(hex, was, p); return own ? api.threadLine(hex, m) : `${api.maker()} ${m}`; }
  // after the design is made: the editor's thread labels and swatch tooltips as the file now names them
  // One thread for the whole design, offered beside a piece's thread when others differ and it saves thread changes
  // (newcomer, round 13: a name in its own pink added two thread changes to the bookmark, and nothing said "use Pink for
  // the whole bookmark"). Counted on the design composed with every piece in it (`steps`: a change is a step in another
  // colour than the one before); quilting and fills aren't worked out for it (they sew in their frame's thread).
  function changesOf(steps) { return steps.filter((st, i) => i && !st.rehoop && !steps[i - 1].rehoop && st.color !== steps[i - 1].color).length; }
  function allThread(steps) {
    const p = S.current(), el = $("st-edit").querySelector("[data-all-thread]");
    if (!el) return;
    const others = p && p.color && p.kind !== "file" ? S.pieces.filter((q) => q !== p && q.kind !== "file" && q.color && q.color !== p.color) : [];
    let fewer = 0;
    if (others.length && steps?.length && !steps.some((st) => st.rehoop)) {
      // (worked out once per design made and thread: the editor is drawn again on every pick)
      if (allMemo.steps !== steps || allMemo.color !== p.color) {
        allMemo = { steps, color: p.color, fewer: 0 };
        try { allMemo.fewer = changesOf(steps) - changesOf(compose(oneThread(p.color), api.hoop(), { fabric: S.fabric, baste: S.baste, thread: S.thread, later: [], unquilted: [], fillLater: true }).steps); } catch {}
      }
      fewer = allMemo.fewer;
    }
    el.hidden = fewer < 1;
    el.innerHTML = fewer < 1 ? "" : `<button type="button" class="link" data-all-thread-set="${p.color}">Use ${api.maker()} ${api.escapeHtml(machineName(p.color))} for everything</button>: ${fewer === 1 ? "1 fewer thread change" : `${fewer} fewer thread changes`}.`;
  }
  let allMemo = {};
  function oneThread(c) { return S.pieces.map((q) => (q.kind !== "file" && q.color ? { ...q, color: c } : q)); }
  function relabelThreads(steps) {
    const p = S.current(); if (!p || S.drawnId !== p.id) return;
    allThread(steps);
    for (const el of $("st-edit").querySelectorAll("[data-thread-of]")) el.textContent = threadOf(p, el.dataset.threadOf);
    for (const k of ["color", "fill", "blend"]) for (const b of $("st-edit").querySelectorAll(`button[data-${k}]`)) {
      const own = (api.ownedSpools?.() || []).find((s) => s.hex === b.dataset[k]);
      b.title = swatchTip(b.dataset[k], p[k], own?.label, p);
    }
  }
  // each step's thread as the machine's screen names it (the file's own palette, one per hooping: a colour may get its
  // second-nearest Brother thread), or their own spool; a thread change says which ("Change to the next thread" left
  // the colour to the swatch beside it)
  function threadNames(steps) {
    const name = new Map();
    let seg = [];
    S.hoopings = [];
    const flush = () => { if (seg.length) S.hoopings.push(seg.map((st) => st.color)); api.fileThreads(seg.map((st) => ({ color: st.color }))).forEach((t, k) => name.set(seg[k], t.name)); seg = []; };
    for (const st of steps) if (st.rehoop) flush(); else seg.push(st);
    flush();
    return steps.map((st) => {
      if (st.rehoop) return st;
      const own = api.ownSpool(st.color), spool = own ? `your ${own}` : `${api.maker()} ${name.get(st)}`;
      return { ...st, machine: name.get(st), thread: spool, you: st.you && st.you.replace(/^Change to the next thread\b/, `Change to ${spool}`) };
    });
  }
  // two colours in a row that are the same spool of theirs ("Threads I own"): keep it on, not "change to the next thread"
  function sameSpool(steps) {
    return steps.map((st, i) => {
      const a = i && st.you && !st.rehoop && !steps[i - 1].rehoop && st.color !== steps[i - 1].color && api.ownSpool?.(steps[i - 1].color);
      if (!a || a !== api.ownSpool(st.color)) return st;
      const keep = `Keep the same thread on (both colours are your ${a})`;
      return { ...st, you: st.you.replace(/^Change to the next thread and press Start\.$/, `${keep} and press Start.`).replace(/^Change to the next thread\. /, `${keep}. `) };
    });
  }
  // thread and needle advice that matches the thread chosen: Automatic sews small letters for 60 wt and says so; a weight
  // picked by hand gets its own tip (the quilt label said "60 wt" while 30 wt was picked)
  // (with spools of their own listed, Automatic's 60 wt advice says their usual 40 wt sews them too: a Sulky Rayon owner
  // was told to use a thread she didn't have)
  const threadTip = (small) => S.thread === "auto" ? (small ? S.SMALL_TIP + (api.ownedSpools?.().length ? " No 60 wt? Your own 40 wt spools sew them too, a little bolder." : "") : "")
    : THREADS[S.thread].tip + (small && S.thread !== "60" ? ` These letters are small for ${THREADS[S.thread].name}: 60 wt sews them crisper.` : "");
  return { swatchTip, threadOf, machineName, allThread, threadTip, threadNames, sameSpool, relabelThreads, oneThread };
}
