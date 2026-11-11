/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// One for each name: the design made again for every name typed (the main lettering or monogram swapped), each
// shrunk, put on two lines or turned as it needs, refused with a reason when it can't be made. The editor (ui.js)
// hands in its state and helpers as `S`. (Part of ui.js until 2026-11.)
import { fontOf } from "../core/fonts.js";
import { MAX_INITIALS, MAX_WORDS, initials, lackList, lacks, swashes, unswashed, withSwash } from "../core/typed.js";
import { inkHeight, monoSize, collision, letterMetrics, touching, fineLine, compose, fittedSizes, label, minSize, pieceStitches } from "./pieces.js";

// one file per name: the biggest lettering (the name, nearly always) gets each name in turn; when that's a monogram
// (the coaster, the key fob), each line's initials take its place
export function forNames(S) {
  const { api, main } = S;   // (the editor's own: its link to the app, and which piece carries the name)
  const p = main();
  if (!p) return null;
  const mono = p.kind === "monogram";
  // (a design that already runs into itself isn't shrunk name by name for it: every name would come out smaller)
  // (worked out with the first name: every preview asks whether there's lettering to swap, ~50 ms on 15 pieces)
  let clean = null;
  const isClean = () => (clean ??= !collision(S.pieces)), opts = { fabric: S.fabric, baste: S.baste, thread: S.thread };
  return {
    canTurn: !api.turned() && api.hoop().w !== api.hoop().h, refused,
    what: mono ? p.letters : unswashed(p.text).replace(/\s*\n\s*/g, " / "), monogram: mono,
    // the ZIP is named after the design (the starter or the saved file it came from), not "names_4.zip"
    zip: api.safeName(S.title || S.from || label(S.pieces.find((q) => q.kind === "frame") || p), "names"),
    // Each name is checked like the design itself: a letter the font lacks is refused (a stand-in glyph was stitched),
    // and a name that runs into another piece is made smaller with `shrink` (Lily-Rose's y in the bib's heart) or
    // said. shrink: a name too long for the hoop, or running into something, is tried at 90 %, 80 %… down to half.
    // With the hoop turned, a name that sews as it is (same size, nothing run into, as bold) with the hoop upright
    // is made upright; only the ones that need the room are turned (`turned`), each said so in its caption and the
    // note (Bo and Grace fitted upright but were turned with Benjamin: every file hooped sideways for nothing).
    // Each name is drawn at the design's own letter scale (`inkHeight`: the size is the height of
    // the word's strokes, so "emma", with no capital, came out twice Emma's size); fewer initials grow to the
    // monogram's width (`monoSize`).
    // (`hp`: another hoop to try it in, the turned one, to see whether the hoop turned would spare shrinking it)
    // A name that would come out too small to sew clearly (under the font's least x-height, `minSize`, where the
    // design's own lettering isn't) is refused, said with the size it would have been: in the oval a 36-letter name
    // fitted across the frame came out at 28 % with 2 mm letters, "(smaller)" all it said. A name of two or more
    // words is tried on two lines first (`lines: 2`).
    build: (name, shrink = false, hp) => {
      const h = api.hoop();
      if (!hp && api.turned() && h.w !== h.h) {
        try { const u = whole(name, false, { ...h, w: h.h, h: h.w }); if (!u.smaller && !u.runs && !u.thin && !u.lines) return { ...u, turned: false }; } catch {}
      }
      return whole(name, shrink, hp || h);
    },
  };
  function whole(name, shrink, hp) {
      const m = once(name, shrink, hp);
      // (and one shrunk under 70 % whose letters come out a quarter bigger on two lines)
      if (!m.small && !(m.smaller && m.pct < 70)) return m;
      const one = !mono && (p.text || "").split("\n").filter((l) => l.trim()).length === 1, gaps = [...name.matchAll(/ +/g)];
      if (one && gaps.length) {
        const g = gaps.reduce((a, b) => (Math.abs(b.index - name.length / 2) < Math.abs(a.index - name.length / 2) ? b : a));
        let two = null;
        try { two = once(name.slice(0, g.index) + "\n" + name.slice(g.index + g[0].length), shrink, hp); } catch {}
        if (two && !two.small && (m.small || two.pct >= m.pct * 1.25)) return { ...two, name, lines: 2 };
      }
      if (!m.small) return m;
      throw new Error(`too long to sew clearly in this design: its letters would be ${m.small.toFixed(1)} mm tall`);
  }
  // why a name can't be made, from its letters alone (said as it's typed, and by Make: the same checks), else ""
  function refused(name) {
    if (!/[\p{L}\p{N}]/u.test(name)) return "no letters to stitch";
    // (as long as the editor takes, `MAX_WORDS`: a 200-letter name drew nothing and its file held the heart alone)
    const most = mono ? MAX_INITIALS : MAX_WORDS;
    if (name.length > most) return `too long: ${most} letters and spaces at most`;
    const gone = lacks(name, p.font);
    if (gone.length) return `the font has no ${lackList(gone)}`;
    if (mono && initials(name).length > 3) return "a monogram takes 3 initials at most";
    return "";
  }
  function once(name, shrink, hp) {
      const no = refused(name);
      if (no) throw new Error(no);
      // (each name keeps the design's swashes: "~Emma~" -> "~Lily~")
      const ls = (p.text || "").split("\n").filter((l) => l.trim()), ends = (t) => withSwash(withSwash(t, "lead", swashes(ls[0] || "").lead), "tail", swashes(ls[ls.length - 1] || "").tail);
      const h0 = mono ? 0 : inkHeight(p.text.split("\n").find((l) => l.trim()) || p.text, p.font), h1 = mono ? 0 : inkHeight(name, p.font);
      // (from the size the design's lettering is sewn at: from the size asked, a frame that shrank "Ashley" 60 -> 39 mm
      // let "Al" grow to 54 % bigger letters than the design's, with nothing said)
      const was = fittedSizes(S.pieces).get(p.id) ?? p.size;
      const size0 = mono ? monoSize(p, name, S.pieces) : h0 && h1 ? Math.min(60, (was * h1) / h0) : was;
      // A name the design sews bold stays bold where it can. Shrinking clear of something in 10 % steps, a step that
      // turns it thin goes back and walks down half a mm at a time from the last bold size first ("Jack" ran into the
      // bib's heart at 18 mm and sewed thin at 15.5 though 16 cleared it bold, as typed in the editor). Shrunk by a
      // frame to letters at least 85 % of the design's x-height, it's sewn bold (satin) rather than thin. A thin line
      // only where bold genuinely can't sew, and the dialog says so.
      const bold = S.fabric !== "towel" && (p.style || "auto") === "auto" && !fineLine({ ...p, size: was });
      const xh = (q) => (mono ? q.size : letterMetrics(q.text.split("\n").find((l) => l.trim()) || q.text, q.font, q.size, "auto").xh || 0);
      const step = (v) => Math.round(v * 2) / 2;
      let f = 1, size = step(size0), lastBold = 0, floor = 0, refined = false;
      for (;;) {
        try {
          let q = { ...p, [mono ? "letters" : "text"]: mono ? name : ends(name), size }, ps = S.pieces.map((r) => (r.id === p.id ? q : r));
          // (lettering inside a frame shrinks to fit it, so a long name can come out small without f changing)
          const now = fittedSizes(ps).get(p.id) ?? q.size, ref = mono ? was : size0, thin = bold && fineLine({ ...q, size: now });
          if (thin && lastBold && !refined && !floor && size < lastBold - 0.5) { floor = size; size = lastBold - 0.5; continue; }
          if (thin && xh({ ...q, size: now }) >= 0.85 * xh({ ...p, size: was }) && !minSize({ ...q, size: now })) { q = { ...q, style: "satin" }; ps = S.pieces.map((r) => (r.id === p.id ? q : r)); }
          const turned = api.turned(), pattern = compose(ps, hp, opts).design.pattern();
          const hit = isClean() && touching({ ...q, size: now }, ps);
          if (hit && shrink && f > 0.55) {
            if (floor && size - 0.5 > floor) { size -= 0.5; continue; }
            if (floor) { size = floor; floor = 0; refined = true; continue; }
            if (!thin) lastBold = size;
            f -= 0.1; size = step(size0 * f); continue;
          }
          // (never a file without the name in it)
          if (!pieceStitches({ ...q, size: now }).length) throw new Error("it comes out as no stitches");
          // (`small`: the x-height it would sew at, when that's under the least that reads and the design's isn't)
          const small = minSize({ ...q, size: now }) && !minSize({ ...p, size: was }) ? xh({ ...q, size: now }) || 0.1 : 0;
          return { pattern, name, turned, runs: hit ? label(hit) : "", smaller: now < ref * 0.95,   // (said from 5 % smaller: "Ben (smaller)" stood beside an Ava the same height)
           // (`xh`, `least`, `own`: the x-height it sews at, the least that reads, the design's own: tests/text_fuzz.mjs)
           pct: Math.round((100 * now) / ref), small, xh: xh({ ...q, size: now }), least: mono ? 4 : fontOf(p.font).min || 4, own: xh({ ...p, size: was }), thin: S.fabric !== "towel" && fineLine({ ...q, size: now }) && !fineLine({ ...p, size: was }) };
        }
        catch (err) { if (!shrink || !err.overBy || f < 0.55) throw err; f -= 0.1; size = step(size0 * f); floor = 0; }
      }
  }
}
