/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// A design too big for the hoop: what is drawn and said, and the ways out that are offered only where they land
// (Fit to hoop, fit and turn, a sliver trimmed, the frames made to fit, two hoopings). The editor hands in its state
// and helpers as S. (Part of ui.js until 2026-11.)
import { ids } from "./starters.js";
import { mmText } from "../words.js";
import { designStats } from "../core/formats.js";
import { MARGIN } from "../core/machines.js";
import { splitPieces, compose, crossName, crossStep, sewnBoxes, scaledFit, label, layoutSize, fittedSizes, pieceBounds, sewn, collisions, minSize, inkHeight, letterMetrics, sewnBox } from "./pieces.js";

export function tooBigWays(S) {
  const { api, $ } = S;
  // the too-big message, over the preview and under the selected piece's controls (with a second fix there too)
  // (the same fixes in both places: the preview's said Fit to hoop alone where the editor also offered the turn)
  function tooBig(msg, ...fixes) {
    fixes = fixes.filter(Boolean);
    api.showError(msg, fixes);
    const n = $("st-big"); n.hidden = false; n.textContent = msg;
    fixes.forEach((f, i) => { const b = document.createElement("button"); b.type = "button"; b.className = "link"; b.textContent = f.label; b.onclick = f.run; n.append(i ? ", or " : " ", b); });
  }
  // too big for the hoop: two hoopings if whole pieces can be shared out, else say how much to shrink
  // (`dragging`: once a frame while a piece is dragged; what the one-tap ways back to one hooping are is worked out
  // when it's let go, as the problems list is)
  function split(err, dragging = false) {
    const hoop = api.hoop(), parts = S.two ? splitPieces(S.pieces, hoop) : null;
    // can't be shared out: show it whole (a big pretend hoop) so it can be seen and dragged back; setView turns
    // Download into "Too big for this hoop"
    if (!parts) {
      // (the size said is the one the preview shows: the whole design, not the first try that failed)
      let msg = err.message, turn = false;
      try {
        // (in a pretend hoop big enough for it: past 2 m the preview was left empty beside "This design is 6429 mm")
        const whole = (o) => { try { return compose(S.pieces, { ...hoop, w: 2000, h: 2000 }, o); } catch (e) { if (!e.overBy) throw e; return compose(S.pieces, { ...hoop, w: 2000 * e.overBy * 1.1, h: 2000 * e.overBy * 1.1 }, o); } };
        // (the design that didn't fit, as compose built it, when it fits the pretend hoop: building it all again there
        // held every edit, drag frame and undo of a too-big 16-piece design up ~0.3 s more)
        const [a0, b0, a1, b1] = err.composed?.design.bounds() || [0, 0, Infinity, Infinity];
        const composed = a1 - a0 <= 2000 - 2 * MARGIN && b1 - b0 <= 2000 - 2 * MARGIN ? err.composed : whole({ fabric: S.fabric, baste: S.baste, thread: S.thread, later: [], dragging });
        const big = composed.design, [x0, y0, x1, y1] = big.bounds();
        // (the size as the size chip says it, the stitches' extent: the error said 138 × 40 beside a 138 × 41 chip)
        // and never rounded down to look as if it fits ("126 × 23 mm, but the hoop fits 126 × 176" for 126.4)
        // (the preview first, so the note's size is the size chip's: the file read back, not the stitches before it)
        const { steps, done, ready, small } = S.stepsOf(composed);
        const st = api.setView(big.pattern(), S.fileName(), { fabric: "linen", steps: 0, problems: S.problems, fixHint: S.fixHint(), shift: big.shifted }) || designStats(big.pattern());
        // (the stitches' box counts moves too: only where that's what takes it past the field does it say so)
        const side = (v, b, lim) => (v <= lim && b > lim ? lim + 0.1 : v), w = side(st.widthMm, x1 - x0, hoop.w - 4), h = side(st.heightMm, y1 - y0, hoop.h - 4);
        // (inches too, as the size chip says it)
        msg = `This design is ${mmText([w, h], [hoop.w - 4, hoop.h - 4])}, but the ${hoop.name} fits ${mmText([hoop.w - 4, hoop.h - 4])}.`;
        turn = hoop.w !== hoop.h && x1 - x0 <= hoop.h - 4 && y1 - y0 <= hoop.w - 4;   // fits with the long side across
        // the steps kept up to date while it doesn't fit (they still said "Emma" and had no 30 wt tip), marked as waiting
        S.stepsUI(steps, done, small, ready, "These are the steps for the design as it is now. It doesn't fit the hoop yet: they apply once it does.");
        for (const b of $("st-steps").querySelectorAll("[data-step]")) b.disabled = true;
      } catch { api.setView(null); }
      // (said over the preview and again under the piece's own controls: on a phone a size slider pushed past the hoop
      // showed nothing near it, the message was a screen up. Fit to hoop runs in place: clicking the Pieces box's button
      // for it scrolled the page 1185 px down to that button.)
      // (offered only where it lands: fitted, nothing too small to stitch or run into something that wasn't; a pasted
      // design fitted to the hoop came out with 6 mm letters run into each other)
      // (and where Fit to hoop leaves something too small, the frames alone made smaller, what's in them fitted to
      // them, or Fit with the hoop turned where that's much bigger: a quilt label moved to the 4x4 had no one-tap way
      // back, and appliqué letters fitted upright came out 121 mm long where turned they'd be 169)
      // (a sliver over is also offered smaller, as it is: `snug`)
      if (turn) { const sn = !dragging && snugWay(); tooBig(msg + ` It fits with the hoop turned${sn ? ", or a little smaller" : ""}:`, { label: "Turn the hoop", run: () => $("turn").click() }, sn); return; }
      if (dragging) { tooBig(msg); return; }
      // two hoopings, when they're possible: with the hoop turned, or with long lettering split between two words (that
      // one stitches both halves: worked out once the design has been still for a moment, not on every letter typed)
      const say = ({ lands, ways }, way) => {
        const fitNow = ways.fit || ways.frame || ways.snug || ways.turn || ways.lines || null, alt = [ways.snug, ways.turn, ways.lines].filter((x) => x && x !== fitNow);
        if (way.ok) tooBig(`${msg} ${way.ok} the machine sews one half, then you hoop the fabric again for the other (crosses line them up).${fitNow ? ` Or ${fitNow.label.replace(/^\w/, (c) => c.toLowerCase())} for one hooping, smaller.` : ` (Fitted to one hooping, ${lands.why}.)`}`,
          { label: "Sew it in two hoopings", run: () => { S.remember(); S.fitted = false; S.two = true; if (way.pieces) S.pieces = JSON.parse(way.pieces); if (way.turn) { api.setTurn(!api.turned()); api.fit(); } S.save(); S.ui(); S.make(); } }, fitNow, ways.lines !== fitNow && ways.lines);
        else tooBig(`${msg}${way.why ? ` ${way.why}` : ""} ${fitNow ? "Make the biggest piece smaller, or" : `Make the biggest piece smaller, or take something out (fitted to the hoop, ${lands.why}).`}`, fitNow, ...alt);
      };
      // The ways back to one hooping (each stitches the design again, scaled or with its frames made smaller) and to
      // two, kept per design and hoop (undo and redo come back to designs already worked out), and worked out a moment
      // after the preview and the size are shown: on a 16-piece design with a patch they held every change ~0.7 s more.
      const key = adviceKey(), s = S.seq, had = advice.has(key);
      if (!had) { advice.set(key, {}); if (advice.size > 24) advice.delete(advice.keys().next().value); }
      const known = advice.get(key);
      // (the pieces two hoopings would sew kept as text: the live pieces change in place with every later edit)
      const twoWay = (quick) => { const w = twoHoopings(hoop, quick); return w.pieces ? { ...w, pieces: JSON.stringify(w.pieces) } : w; };
      const ways = () => (known.ways ||= ((lands) => ({ lands, ways: fitWays(lands) }))(fitLands()));
      const full = () => { known.full ||= twoWay(false); say(ways(), known.full); };
      const go = () => {
        if (s !== S.seq) return;
        say(ways(), (known.quick ||= known.full || twoWay(true)));
        if (known.quick.later) { if (known.full) full(); else setTimeout(() => { if (s === S.seq) full(); }, 700); }
      };
      if (had) { go(); return; }
      tooBig(msg); setTimeout(go, 0);
      return;
    }
    const opts = { fabric: S.fabric, baste: S.baste, thread: S.thread }, base = api.safeName(S.firstWords(), "design");
    // the cross to line up on, named as the machine's screen shows it (the hoop goes on the machine that way round;
    // naming the preview's too, turned, read as two different crosses)
    const which = (pt) => `${crossName(pt.marks, api.turned())} cross${api.turned() ? " on the machine's screen" : ""}`;
    const built = parts.map((pt, i) => ({ ...compose(pt.pieces, hoop, { ...opts, marks: { pts: pt.marks, end: pt.end, which: which(pt) } }), filename: `${base}_hooping_${i + 1}_of_2.pes` }));
    // how far to slide the fabric for the second hooping: the machine centres each file, so the fabric moves by the
    // distance between the two halves' centres, and the crosses land that far from where they were (it said only
    // "hoop it again", and "the right cross as the machine shows it, the top one in this preview")
    const mid = (b) => { const [x0, y0, x1, y1] = b.design.bounds(); return [(x0 + x1) / 2, (y0 + y1) / 2]; };
    const [c1, c2] = built.map(mid), m = parts[1].marks[0], onMachine = ([x, y]) => (api.turned() ? [-y, x] : [x, y]);
    const [sx, sy] = onMachine([c1[0] - c2[0], c1[1] - c2[1]]), [ox, oy] = onMachine([m[0] - c2[0], m[1] - c2[1]]), across = Math.abs(sx) >= Math.abs(sy);
    const side = (v) => (across ? (v < 0 ? "left" : "right") : v < 0 ? "top" : "bottom"), dist = Math.hypot(sx, sy), off = across ? ox : oy;
    const from = across ? `${side(off)} of` : off < 0 ? "above" : "below";
    const move = `Hoop the fabric again with fresh stabilizer under it, slid about ${mmText(Math.round(dist))} toward the ${side(across ? sx : sy)} of the hoop from where it was, as straight as you can. The crosses from the first hooping should sit ${Math.abs(off) < 3 ? "on the hoop's centre line" : `about ${mmText(Math.round(Math.abs(off)))} ${from} the hoop's centre`} (the hoop's grid sheet helps).`;
    const b1 = built[0].steps, s2 = built[1].steps[0], change = s2.color !== b1[b1.length - 1].color ? "Change to the next thread. " : "Keep the same thread on. ";
    built[1].steps[0] = { ...s2, you: change + crossStep({ pts: parts[1].marks, which: which(parts[1]), move }) };
    // the whole design for the preview (a big pretend hoop) with the crosses the files sew, and every step of both
    // hoopings in order, the rehooping between them (not a step: the machine doesn't stop for it, so it's no pause)
    const all = compose(S.pieces, { ...hoop, w: 2000, h: 2000 }, { ...opts, marks: { pts: parts[0].marks, end: true } });
    const steps = S.firstStep(S.threadNames(S.sameSpool([...built[0].steps, { rehoop: true, title: `Second hooping: ${built[1].filename}`, you: `When ${built[0].filename} is done, take the hoop off the machine and the fabric out of the hoop. Leave the crosses in: the second file lines up on them. On the machine's screen, touch the USB key and pick ${built[1].filename}.` }, ...built[1].steps])), built[0].hoop, built[0].filename);
    // (what to have ready and do after, for the whole design: it listed only the first file's, without the fabric's)
    const whole = S.stepsOf(all), told = S.explainAll(whole.ready, steps, [...new Set([...whole.done, ...built[1].after])]);
    S.stepsUI(told.steps, told.done, whole.small, told.ready, "", built[0].filename);
    for (const b of $("st-steps").querySelectorAll("[data-step]")) b.disabled = true;   // (the step view follows one file)
    // each hooping's field, where the machine centres that half (mm, as the preview shows it)
    const fw = hoop.w - 4, fh = hoop.h - 4, hoopings = built.map((b) => { const [x0, y0, x1, y1] = b.design.bounds(), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; return [cx - fw / 2, cy - fh / 2, cx + fw / 2, cy + fh / 2]; });
    api.setView(all.design.pattern(), `${base}_2_hoopings.zip`, { fabric: "linen", steps: 0, hoopings, problems: S.problems, fixHint: S.fixHint(), turnNote: S.turnText(),
      split: built.map((b) => ({ pattern: b.design.pattern(), filename: b.filename })) });
  }
  // What Fit to hoop would leave: { ok } when nothing would then be too small to stitch or run into something it doesn't
  // now; else { why } in a few words (judged from the stitches as they are, scaled: `scaledFit`). Kept for the same
  // design and hoop.
  let lastLands = null;
  // what split() worked out for a design too big for the hoop, by design and hoop
  const advice = new Map(), adviceKey = () => JSON.stringify({ pieces: S.pieces, fabric: S.fabric, baste: S.baste, thread: S.thread, turn: api.turned(), hoop: api.hoop() });
  function fitLands() {
    const key = S.snap() + JSON.stringify(api.hoop());
    if (lastLands?.key === key) return lastLands.val;
    const bs = sewnBoxes(S.pieces), hp = api.hoop();
    let val = { ok: true };
    if (bs.length) {
      const w = Math.max(...bs.map((b) => b[2])) - Math.min(...bs.map((b) => b[0])), h = Math.max(...bs.map((b) => b[3])) - Math.min(...bs.map((b) => b[1]));
      const { tiny, hit } = scaledFit(S.pieces, Math.min((hp.w - 10) / w, (hp.h - 10) / h));
      if (tiny) val = { why: `${label(tiny)} would be too small to stitch` };
      else if (hit) val = { why: `${label(hit[0])} would run into ${label(hit[1])}` };
    }
    lastLands = { key, val };
    return val;
  }
  // The one-tap ways to one hooping besides two: { fit: Fit to hoop where it lands (`lands`), turn: Fit with the hoop
  // turned where that's a tenth bigger or more and lands, frame: the frames alone made to fit (what's in them fitted
  // to them, the rest kept at its size) where Fit to hoop doesn't land and that does }
  function fitWays(lands) {
    const hp = api.hoop(), [w, h] = layoutSize(S.pieces), out = {};
    if (!w || !h) return out;
    if (lands.ok) out.fit = { label: "Fit to hoop", run: () => { S.remember(); S.fitHoop(); } };
    const k = Math.min((hp.w - 10) / w, (hp.h - 10) / h), kt = hp.w !== hp.h ? Math.min((hp.h - 10) / w, (hp.w - 10) / h) : 0;
    if (kt > k * 1.1) { const t = scaledFit(S.pieces, Math.min(kt, S.mostScale())); if (!t.tiny && !t.hit) out.turn = { label: "Fit and turn the hoop", run: () => { S.remember(); api.setTurn(!api.turned()); api.fit(); S.fitHoop(); } }; }
    if (!lands.ok) { const ps = framesFit(); if (ps) out.frame = { label: `Make the ${ps.n === 1 ? "frame" : "frames"} fit the hoop`, run: () => { S.remember(); S.fitted = false; S.pieces.forEach((q, i) => Object.assign(q, ps.list[i])); S.save(); S.ui(); S.make(); } }; }
    const sn = snugWay(); if (sn) out.snug = sn;
    // (the longest line of words on two or three lines, where that alone brings the design inside the hoop)
    const ln = S.hoopLines(k);
    if (ln) out.lines = { label: `Put ${S.pieces.filter((o) => o.kind === "text").length > 1 ? label(ln.p) : "the words"} on ${ln.n === 2 ? "two" : "three"} lines${ln.size < ln.p.size ? ` at ${ln.size} mm` : ""}`, run: () => { const q = S.pieces.find((o) => o.id === ln.p.id); if (!q) return; S.remember(); S.fitted = false; q.text = ln.text; q.size = ln.size; S.save(); S.ui(); S.make(); } };
    return out;
  }
  function snugWay() {
    const sn = snug();
    return sn && { label: `Make ${label(sn.p)} ${sn.size} mm`, run: () => { S.remember(); S.fitted = false; const q = S.pieces.find((o) => o.id === sn.p.id); if (q) q.size = sn.size; S.save(); S.ui(); S.make(); } };
  }
  // A design a sliver too big (up to a tenth over): its biggest sized piece made just small enough, where that lands
  // (Appliqué letters 0.3 mm over after a font change offered only Turn the hoop, and Fit to hoop takes a tenth off
  // everything): { p, size } or null
  function snug() {
    const hp = api.hoop(), [w, h] = layoutSize(S.pieces), fw = hp.w - 5, fh = hp.h - 5, k = Math.min(fw / w, fh / h);
    if (!w || !h || k >= 1 || k < 0.9) return null;
    const fit = fittedSizes(S.pieces), wide = (q) => { const b = pieceBounds(sewn(q, S.pieces, fit)); return b ? Math.max((b[2] - b[0]) / fw, (b[3] - b[1]) / fh) : 0; };
    const p = S.pieces.filter((q) => q.size != null && q.kind !== "file" && !fit.has(q.id)).sort((a, b) => wide(b) - wide(a))[0];
    if (!p) return null;
    for (let size = Math.floor(p.size * k * 2) / 2, n = 0; n < 4 && size >= p.size * 0.85; size -= 0.5, n++)
      if (S.landing(p, { size }).fits === "fits") return { p, size };
    return null;
  }
  // every frame (and every place) made smaller together until the design fits the hoop, lettering in the frames fitted
  // to them and everything else at its size: { list: the pieces' new places and frame sizes, n frames }, or null when
  // there are no frames, it doesn't fit even so, or something would then be too small to stitch or run into
  // something it doesn't now
  function framesFit() {
    const n = S.pieces.filter((f) => f.kind === "frame").length, hp = api.hoop();
    if (!n) return null;
    const [w, h] = layoutSize(S.pieces), r = (v) => Math.round(v * 2) / 2;
    const was = new Set(collisions(S.pieces).map(([a, b]) => `${a.id}:${b.id}`)), fit0 = fittedSizes(S.pieces), small0 = new Set(S.pieces.filter((p) => minSize(fit0.has(p.id) ? { ...p, size: fit0.get(p.id) } : p)).map((p) => p.id));
    // (the side that's over first, the other kept: an oval badge widened to 120 mm on the 4x4 was shrunk both ways, its
    // height under the arches' curves, and no fix was offered; then both sides alike)
    const kx0 = Math.min(1, (hp.w - 10) / w), ky0 = Math.min(1, (hp.h - 10) / h), k0 = Math.min(kx0, ky0);
    for (let [kx, ky] of [[kx0, ky0], [k0, k0]].filter(([a, b], i) => !i || a !== kx0 || b !== ky0)) {
      for (let i = 0; i < 6 && Math.min(kx, ky) < 1; i++) {
        // (a circle stays round: by the side shrunk most)
        const ps = S.pieces.map((q) => {
          if (q.kind !== "frame") return { ...q, x: r(q.x * kx), y: r(q.y * ky) };
          const [a, b] = q.shape === "circle" ? [Math.min(kx, ky), Math.min(kx, ky)] : [kx, ky];
          return { ...q, x: r(q.x * kx), y: r(q.y * ky), w: Math.floor(q.w * a * 2) / 2, h: Math.floor(q.h * b * 2) / 2 };
        });
        // (a frame made smaller than the sliders' least, or than it already was, is no way to fit: with lettering too wide
        // to fit anyway, six rounds of shrinking took a ganged key fob to 0 x 0.5 mm, and its satin border threw)
        if (ps.some((q, j) => q.kind === "frame" && Math.min(q.w, S.frameH(q)) < Math.min(S.FRAME_MIN, S.pieces[j].w, S.frameH(S.pieces[j])))) break;
        try { compose(ps, hp, { fabric: S.fabric, baste: S.baste, thread: S.thread, later: [], measure: true }); }
        catch (err) { if (!err.overBy) throw err; if (kx < 1) kx *= 0.98 / err.overBy; if (ky < 1) ky *= 0.98 / err.overBy; continue; }
        const fit = fittedSizes(ps);
        if (ps.some((p) => !small0.has(p.id) && minSize(fit.has(p.id) ? { ...p, size: fit.get(p.id) } : p))) break;
        if (collisions(ps).some(([a, b]) => !was.has(`${a.id}:${b.id}`))) break;
        return { list: ps.map(({ x, y, w, h }) => ({ x, y, ...(w != null ? { w, h } : {}) })), n };
      }
    }
    return null;
  }
  // Too big for one hooping and not shared out as it is (`splitPieces` needs two or more whole pieces, each half fitting
  // the hoop): would it share out with the hoop turned, or with the longest straight lettering split into two pieces
  // between words (each word where it was, at the same letter size)? { ok: what's done, pieces, turn } or { why } (a
  // 266 mm "HAPPY BIRTHDAY" said only "Make the biggest piece smaller, or Fit to hoop")
  function twoHoopings(hoop, quick = false) {
    const other = hoop.w !== hoop.h ? { ...hoop, w: hoop.h, h: hoop.w } : null, ways = [[hoop, false], ...(other ? [[other, true]] : [])];
    if (splitPieces(S.pieces, hoop)) return { ok: "It can be sewn in two hoopings:" };
    for (const [h, t] of ways) if (t && splitPieces(S.pieces, h)) return { ok: "It can be sewn in two hoopings with the hoop turned:", turn: true };
    const fit = fittedSizes(S.pieces), wide = (q) => { const b = pieceBounds(q); return b ? b[2] - b[0] : 0; };
    const long = S.pieces.filter((p) => p.kind === "text" && (p.shape || "straight") === "straight" && !p.text.includes("\n") && !fit.has(p.id) && !(p.rot || 0) && !p.deco && / /.test(p.text.trim()))
      .sort((a, b) => wide(b) - wide(a))[0];
    if (long && quick) return { later: true };
    if (long) {
      // (the two gaps nearest the middle: each try draws both halves' lettering, and this runs as the words are typed)
      const t = long.text.trim(), gaps = [...t.matchAll(/ +/g)].map((m) => [m.index, m.index + m[0].length]).sort((a, b) => Math.abs(a[0] - t.length / 2) - Math.abs(b[0] - t.length / 2)).slice(0, 2);
      const b0 = pieceBounds({ ...long, x: 0, y: 0 }), h0 = inkHeight(t, long.font), m0 = letterMetrics(t, long.font, long.size, long.style);
      // (each word at the same letter scale, its baseline and outer end where they were)
      const part = (text, end) => {
        const size = Math.round(((long.size * inkHeight(text, long.font)) / h0) * 2) / 2, q = { ...long, id: end ? long.id : ids.next, of: long.of ?? long.id, text, size, x: 0, y: 0 };
        const b = pieceBounds(q), m = letterMetrics(text, long.font, size, long.style);
        if (!b) return null;
        q.x = Math.round((long.x + (end ? b0[2] - b[2] : b0[0] - b[0])) * 2) / 2;
        q.y = Math.round((long.y - (m0.top + m0.bottom) / 2 + (m.top + m.bottom) / 2) * 2) / 2;
        return q;
      };
      // (the gap nearest the middle first, the next only when that one doesn't share out: each try stitches both halves)
      const fitsOne = (q) => { const b = pieceBounds(q), w = b[2] - b[0], hh = b[3] - b[1]; return ways.some(([h]) => w <= h.w - 6 && hh <= h.h - 6); };
      let over = null;
      for (const [ga, gb] of gaps) {
        const a = part(t.slice(0, ga), false), b = part(t.slice(gb), true);
        if (!a || !b) continue;
        const big = [a, b].find((q) => !fitsOne(q));
        if (big) { over ||= big; continue; }
        const ps = S.pieces.flatMap((p) => (p === long ? [a, b] : [p]));
        for (const [h, tt] of ways) if (splitPieces(ps, h)) {
          ids.next = Math.max(ids.next, a.id + 1);
          return { ok: `It can be sewn in two hoopings${tt ? ", with the hoop turned" : ""}, with ${label(a)} and ${label(b)} as two pieces:`, pieces: ps, turn: tt };
        }
      }
      if (over) return { why: `Even split between two hoopings, ${label(over)} would be bigger than the hoop by itself.` };
    }
    // why not: one piece bigger than the hoop by itself, either way round
    const big = S.pieces.find((p) => { const b = sewnBox(p, S.pieces, fit); if (!b) return false; const w = b[2] - b[0], hh = b[3] - b[1];
      return !ways.some(([h]) => w <= h.w - 6 && hh <= h.h - 6); });
    if (big) return { why: `Two hoopings can't help: ${label(big)} is bigger than the hoop by itself${big.kind === "text" && !/ /.test(big.text.trim()) ? " (lettering can only be split at a space between words)" : ""}.` };
    return { why: S.pieces.length > 1 ? "Two hoopings can't help either: it's too big both ways." : "" };
  }
  // appliqué tips: shown the first time a design has fabric to lay on, then on request
  // real appliqué (shapes cut from fabric and satined), not the front of an in-the-hoop project: its fabric is in its
  // own supply list (the mug rug listed curved scissors and appliqué shapes)
  // (a design file with a placement line too: its Have ready listed no appliqué fabric)
  const appliqued = () => S.pieces.some((p) => p.kind === "letters" || (p.kind === "motif" && p.style === "applique") || (p.kind === "frame" && p.border === "applique")
    || (p.kind === "file" && p.blocks.some((b) => /placement|position/i.test(b.name || ""))));
  return { split, appliqued };
}
