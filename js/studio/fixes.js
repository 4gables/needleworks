/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// One-tap fixes: each is worked out and checked before it's offered (it lands, it brings no new problem), and
// says what would go wrong otherwise. A bigger frame, moving away, a size that clears, lines, lettering for a
// monogram. The editor hands in its state and helpers as S. (Part of ui.js until 2026-11.)
import { FONTS } from "../core/fonts.js";
import { WHITE, BLACK } from "./starters.js";
import { nearestBrotherThread } from "../core/threads.js";
import { luminance, rgbOf } from "../core/colour.js";
import { TIP } from "../words.js";
import { sewn, inFrame, touching, fittedSizes, layoutSize, sewnBoxes, sewnBox, label, touchingAll, pieceBounds, underPatch, letterMetrics, archFit } from "./pieces.js";

export function fixes(S) {
  const { api } = S;
  // the size (0.5 mm) p can be turned a quarter (reading up) in the tall frame it's shrunk into, inside its outline by
  // 4 mm and running into nothing; 0 when that isn't at least a third bigger than `fs`
  function runUp(p, fs) {
    const f = S.pieces.slice(0, S.pieces.indexOf(p)).reverse().find((o) => o.kind === "frame" && Math.abs(p.x - o.x) < o.w / 2 && Math.abs(p.y - o.y) < o.h / 2);
    if (!f || p.rot || f.rot || f.shape === "circle" || f.h < 1.4 * f.w || (p.kind === "text" && (p.shape || "straight") !== "straight")) return 0;
    // (at the size the frame then sews it, never one it shrinks back: turned a quarter, lettering is fitted to the
    // frame's length, so "it can be N mm" offered a size it didn't keep)
    const ok = (sz) => { const q = { ...p, rot: -90, size: sz }, s = sewn(q, S.pieces.map((o) => (o.id === p.id ? q : o))); return s.size >= sz - 0.25 && inFrame(s, f, 4) && !touching(s, S.pieces); };
    let lo = fs * 1.33, hi = Math.min(p.kind === "monogram" ? 90 : 60, Math.max(p.size, fs * 3));
    if (!ok(lo)) return 0;
    while (hi - lo > 0.5) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
    return Math.floor(lo * 2) / 2;
  }
  // frame f made big enough (up to half as big again) for p to be sewn at `need` inside it, the layout still in the
  // hoop: { w, h, fits } (fits "fits" or "turn", as `landing`), or null
  function frameFor(p, f, need) {
    const hp = api.hoop(), fw = hp.w - 5, fh = hp.h - 5, H = f.shape === "circle" ? f.w : f.h;
    for (let k = 1.02; k <= 1.5; k += 0.02) {
      const g = { ...f, w: Math.ceil(f.w * k), h: Math.ceil(H * k) };
      if (f.most && Math.max(g.w, g.h) > f.most) return null;
      const ps = carried(f, g).map((o) => (o.id === p.id ? { ...o, size: Math.max(p.size, need) } : o)), q = ps.find((o) => o.id === p.id);
      if ((fittedSizes(ps).get(p.id) ?? q.size) < need) continue;
      const [w, h] = layoutSize(ps), fits = w <= fw && h <= fh ? "fits" : w <= fh && h <= fw ? "turn" : null;
      if (!fits) return null;
      if (touching(sewn(q, ps), ps)) continue;   // (just big enough, the letters touched the frame: a little bigger clears it)
      return { w: g.w, h: g.h, fits };
    }
    return null;
  }
  // the display hoop a frame with a `most` is made for, said plainly ("a 6 in display hoop")
  const display = (f) => `a ${Math.ceil((f.most + 12) / 25.4)} in display hoop`;
  // the button that makes p's frame f big enough for it at `need` (`frameFor`), or ""
  function grown(p, f, need) {
    const g = f && frameFor(p, f, need);
    return g ? `<button type="button" class="link" data-frame-grow="${f.id}:${g.w}:${g.h}:${need}"${g.fits === "turn" ? " data-turn" : ""}>Make the frame ${g.w} mm${g.fits === "turn" ? " and turn the hoop" : ""}</button>` : "";
  }
  // what to say when a size fix is shrunk back by p's frame (`landing`'s `capped`): a bigger frame where that lands
  function roomIn(p, l, need) {
    const g = grown(p, l.host, need);
    return g ? `The frame only has room for ${l.capped} mm: ${g}.` : `The frame only has room for ${l.capped} mm: use fewer words${l.host?.most ? ` (the frame is as big as ${display(l.host)} takes)` : ", or make the frame bigger"}.`;
  }
  // frame f (a circle) centred on everything there and just big enough to hold it all 6 mm inside its line (about
  // 4 mm of fabric inside the border), as long as the hoop takes it; else as it was
  function roundAll(f) {
    const bs = sewnBoxes(S.pieces); if (!bs.length) return;
    const x = (Math.min(...bs.map((b) => b[0])) + Math.max(...bs.map((b) => b[2]))) / 2, y = (Math.min(...bs.map((b) => b[1])) + Math.max(...bs.map((b) => b[3]))) / 2;
    const hp = api.hoop(), most = Math.min(hp.w, hp.h) - 8;
    for (let w = 30; w <= most; w += 2) {
      const g = { ...f, x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2, w, h: w };
      if (S.pieces.every((o) => inFrame(o, g, 6))) { Object.assign(f, { x: g.x, y: g.y, w, h: w }); return; }
    }
  }
  // the frame p sits in: the nearest earlier one whose box holds its middle
  const frameOf = (p, ps = S.pieces) => ps.slice(0, ps.indexOf(p)).reverse().find((f) => f.kind === "frame" && Math.abs(p.x - f.x) < f.w / 2 && Math.abs(p.y - f.y) < (f.shape === "circle" ? f.w : f.h) / 2);
  // ps with frame f made g, what sits in it (`frameOf`) kept where it was in proportion: a quilt label's frame made
  // taller by its slider left the words where they were, high in it with an empty band below, and "Make the frame
  // 106 mm" did the same to a birth announcement's oval
  function carried(f, g, ps = S.pieces) {
    const kx = g.w / f.w, ky = (g.shape === "circle" ? g.w : g.h) / (f.shape === "circle" ? f.w : f.h);
    const on = new Set(ps.filter((q) => q !== f && frameOf(q, ps) === f).map((q) => q.id));
    return ps.map((q) => (q === f ? g : on.has(q.id) ? { ...q, x: Math.round((g.x + (q.x - f.x) * kx) * 2) / 2, y: Math.round((g.y + (q.y - f.y) * ky) * 2) / 2 } : q));
  }
  // a frame resized in place (pieces replaced by `carried`'s, keeping the selected one's object)
  function resizeFrame(f, w, h) {
    const next = carried(f, { ...f, w, h });
    S.pieces.forEach((q, i) => { if (q !== f) Object.assign(q, { x: next[i].x, y: next[i].y }); });
    f.w = w; f.h = h;
  }
  // p at the size it is, moved to the nearest free room (`freeRoom`, with p itself out of the way) that runs into
  // nothing and keeps one hooping; said by where it goes from `other`: { x, y, where, l } or null
  function moveAway(p, other) {
    const keep = S.pieces, fs = fittedSizes(S.pieces).get(p.id);
    if (fs) return null;   // (sized by its frame: moving it out of the frame isn't the fix)
    let r;
    try { S.pieces = S.pieces.filter((o) => o.id !== p.id); r = S.freeRoom({ ...p }, null, true); } finally { S.pieces = keep; }
    if (!r || (p.size != null && r.size !== p.size)) return null;
    const l = landing(p, { x: r.x, y: r.y });
    if (!l.fits) return null;
    const a = sewnBox({ ...p, x: r.x, y: r.y }, S.pieces), b = sewnBox(other, S.pieces);
    const nm = api.escapeHtml(other.kind === "motif" || other.kind === "frame" ? `the ${label(other).toLowerCase()}` : label(other));
    const where = !a || !b ? "to free space" : a[1] >= b[3] - 1 ? `below ${nm}` : a[3] <= b[1] + 1 ? `above ${nm}` : `beside ${nm}`;
    return { x: r.x, y: r.y, where, l };
  }
  const and = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] || "");
  // what a one-tap change to p would leave: { w, h, fits: "fits" (as the hoop is now), "turn" (only with the hoop
  // turned the other way) or null (too big either way) }
  // (a fix that runs the piece into something it was clear of doesn't count as fitting: a ring's arch widened past
  // its own frame)
  function landing(p, change) {
    const q = { ...p, ...change }, ps = S.pieces.map((r) => (r.id === p.id ? q : r)), [w, h] = layoutSize(ps), hp = api.hoop();
    const fw = hp.w - 5, fh = hp.h - 5;   // (the field less its 2 mm margins, and 1 mm for the locks)
    // (every piece it then runs into, not only the first: "Make it 5 mm" ran "QUALITY" into the anchor and the flower
    // beside the "Since 2006" it already touched)
    const fit = fittedSizes(ps).get(p.id), f0 = fittedSizes(S.pieces).get(p.id), was = new Set(touchingAll(f0 ? { ...p, size: f0 } : p, S.pieces).map((o) => o.id));
    const hit = touchingAll(fit ? { ...q, size: fit } : q, ps).find((o) => !was.has(o.id));
    if (hit) return { w, h, fits: null, hit };
    // nor one that takes it out of the frame it sat in (the same ring's words widened outside the circle)
    const inside = (a, b) => a && b && a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3], meets = (a, b) => a && b && a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    const b0 = pieceBounds(f0 ? { ...p, size: f0 } : p), b1 = pieceBounds(fit ? { ...q, size: fit } : q);
    // (a patch's edge too, which `touching` leaves out as lettering sits on the fill: "Make it 25 mm" put a heart on
    // the patch's satin edge)
    const s0 = f0 ? { ...p, size: f0 } : p, s1 = fit ? { ...q, size: fit } : q;
    const out = S.pieces.find((f) => f.kind === "frame" && f.id !== p.id && ((inside(b0, pieceBounds(f)) && !inside(b1, pieceBounds(f))) || (f.border === "patch" && !(f.rot || 0) && meets(b1, pieceBounds(f)) && inFrame(s0, f, 3) && !inFrame(s1, f, 3))));
    if (out) return { w, h, fits: null, hit: out, out: true };
    // nor a size its frame shrinks straight back (`fittedSizes`): "Make it 17 mm" left the words at 15, and the same
    // warning offered 17 again (Kitchen sign with hearts, Wedding keepsake's two names)
    if (change.size != null && fit != null && fit < change.size - 0.25) return { w, h, fits: null, capped: fit, host: frameOf(p) };
    const fits = w <= fw && h <= fh ? "fits" : w <= fh && h <= fw ? "turn" : null;
    // nor one that brings a problem of its own: "Make it straight" left a bridged name in a key fob too small to stitch
    // (its frame shrank the two lines), a new warning for the old one
    const worse = fits && newProblem(p, q, ps, change);
    return worse ? { w, h, fits: null, worse } : { w, h, fits };
  }
  // the first problem (said everywhere, not a tip) p changed to q in `ps` has that p hasn't, or null
  // ("Make it bold" says on its button that small loops may fill in)
  function newProblem(p, q, ps, change) {
    const of = (r, set) => S.pieceProblems(r, fittedSizes(set)).list.filter((x) => x.level !== TIP);
    const was = new Set(of(p, S.pieces).map((x) => x.kind));
    return of(q, ps).find((x) => !was.has(x.kind) && !(x.kind === "loops" && change.style === "satin")) || null;
  }
  // a new problem said as what the fix would do (after "it would")
  const worseSaid = (x) => ({ small: "come out too small to stitch cleanly", loops: "have small loops that fill in", towel: "close up on a towel", thin: "sew as a thin line",
    arch: "bunch up on the curve", caps: "be hard to read" }[x.kind] || `bring a new problem (${x.text.replace(/\.$/, "").toLowerCase()})`);
  // a monogram that was given a name, made lettering: same font, thread and place, at the size that fits its frame
  // (checked like any fix before it's offered: "ABCD" as lettering took the design past the hoop)
  function asLettering(p) {
    const t = { id: p.id, x: p.x, y: p.y, color: p.color, kind: "text", text: p.letters.trim(), font: p.font, size: Math.min(60, p.size), shape: "straight", radius: 30,
      ...(p.rot ? { rot: p.rot } : {}), ...(p.flip ? { flip: true } : {}), ...(p.style && p.style !== "auto" ? { style: p.style } : {}) };
    const fs = fittedSizes(S.pieces.map((o) => (o.id === p.id ? t : o))).get(t.id); if (fs) t.size = fs;
    return { ...t, letters: undefined };
  }
  function asText(turn) {
    const p = S.current(); if (!p || p.kind !== "monogram") return;
    S.remember(); S.fitted = false;
    const { letters, ...t } = asLettering(p);
    S.pieces[S.pieces.indexOf(p)] = t;
    if (turn) { api.setTurn(!api.turned()); api.fit(); }
    S.save(); S.ui(); S.make();
  }
  // a piece the patch after it would cover goes just after that patch (`underPatch`)
  function sewAfter(id) {
    const p = S.current(), i = S.pieces.indexOf(p), j = S.pieces.findIndex((o) => o.id === id); if (!p || j < i) return;
    S.remember(); S.pieces.splice(i, 1); S.pieces.splice(j, 0, p);
    S.save(); S.ui(); S.make();
  }
  // threads that are hard to tell apart on each other: nearly the same lightness, or the same Brother thread
  const lum = (h) => luminance(rgbOf(h));
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hard = (a, b) => ratio(a, b) < 1.6 || nearestBrotherThread(a).name === nearestBrotherThread(b).name;
  // a thread that shows on patch f: what's already sewn on it, then its edge, else white or black
  function against(f, ps) {
    const under = f.fill || f.color;
    const on = ps.filter((o) => o.kind !== "frame" && o.kind !== "file" && underPatch(o, ps, true)?.id === f.id).map((o) => o.color);
    return [...on, f.color].find((c) => ratio(c, under) >= 3) || (ratio(WHITE, under) >= ratio(BLACK, under) ? WHITE : BLACK);
  }
  // Letter pairs (kern) pushed closer than the font has them until their stitches meet: the indices. The letters are
  // drawn as the lettering engine places them, the first grown by how far a satin can reach past the ink (half a
  // column where a stroke ends square across a slanted foot, and 0.3 mm), and counted where it then covers the second:
  // AV at -20 % in Josefin was 1.8 mm apart as ink but sewed as one lump.
  const inkA = document.createElement("canvas"), inkB = document.createElement("canvas");
  function overlapping(p) {
    if (!p.kern || !FONTS.find((f) => f.family === p.font)?.print || !document.fonts.check(`40px "${p.font}"`)) return [];
    const PX = 100, W = 3 * PX, H = 2 * PX, line = p.text.split("\n")[0];
    S.probe.font = `${PX}px "${p.font}"`; S.probe.fontKerning = "normal";
    // (both at the size it's sewn: the pixel scale from the size asked made a frame-shrunk word's satin look thinner)
    const at = sewn(p, S.pieces).size, m = S.probe.measureText(line), mmPx = at / Math.max(1, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
    const lm = letterMetrics(line, p.font, at, p.style), grow = Math.ceil((Math.max(lm.satinW || 0, lm.stroke || 0) / 2 + 0.3) / mmPx);
    const ink = (c, ch, x) => {
      c.width = W; c.height = H; const g = c.getContext("2d", { willReadFrequently: true });
      g.font = `${PX}px "${p.font}"`; g.fontKerning = "normal"; g.fillText(ch, x, 1.4 * PX);
      const d = g.getImageData(0, 0, W, H).data, out = new Uint8Array(W * H);
      for (let i = 0; i < out.length; i++) out[i] = d[4 * i + 3] > 128 ? 1 : 0;
      return out;
    };
    // (grown as a square, rows then columns)
    const dilate = (a, r) => {
      const t = new Uint8Array(a.length), o = new Uint8Array(a.length);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[y * W + x]) for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r); k++) t[y * W + k] = 1;
      for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (t[y * W + x]) for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r); k++) o[k * W + x] = 1;
      return o;
    };
    const both = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) n += a[i] & b[i]; return n; };
    return Object.entries(p.kern).filter(([, v]) => v < 0).map(([k]) => +k).filter((i) => {
      const a = p.text[i], b = p.text[i + 1]; if (!a || !b || /\s/.test(a + b)) return false;
      const at = PX / 2 + S.probe.measureText(a + b).width - S.probe.measureText(b).width + ((p.spacing || 0) / 100) * PX, A = dilate(ink(inkA, a, PX / 2), grow);
      const now = both(A, ink(inkB, b, at + (p.kern[i] / 100) * PX)), was = both(A, ink(inkB, b, at));
      return now > was + 10;
    }).sort((x, y) => x - y);
  }
  // a change to an arched word's curve that keeps the word where it is shown: the piece's place is the curve's centre,
  // so "Widen the curve" on the bib floated THEO 30 mm above its heart (73 x 70 -> 67 x 109 mm). Words on a round
  // frame's curve keep the frame's centre (they follow the frame).
  function keepWord(p, ch) {
    const q = { ...p, ...ch }, R0 = p.ry ?? p.radius, R1 = q.ry ?? q.radius;
    if (p.kind !== "text" || (p.shape !== "up" && p.shape !== "down") || R0 === R1 || ch.y != null) return ch;
    if (S.pieces.some((f) => f.kind === "frame" && Math.abs(f.x - p.x) < 0.5 && Math.abs(f.y - p.y) < 0.5 && ["circle", "oval", "scallop"].includes(f.shape))) return ch;
    return { ...ch, y: Math.round((p.y + (p.shape === "up" ? 1 : -1) * (R1 - R0)) * 2) / 2 };
  }
  // a size, and the curve an arched word then needs (what the size button does)
  const sizeChange = (p, size) => { const s = Math.min(size, p.kind === "monogram" ? 90 : 60); return keepWord(p, { size: s, ...(archFit({ ...p, size: s }) || {}) }); };
  // the biggest size (0.5 mm, up to 60) p fits the hoop at on two lines (`twoLines`), running into nothing new; 0 when
  // that isn't at least a quarter bigger than now (Fit to hoop made "Mrs. Lee" 17 mm on a 4x4, its loops filling in)
  // The biggest size p reaches on two or three lines, with the hoop as it is or turned: { n, text, size, turn }, or
  // null when none is at least a quarter bigger. Three lines or the turn only when 10 % bigger again (a 60-letter
  // name fitted to the hoop was offered two lines at 5 mm, when three lines turned gave it 9).
  function lineChoice(p) {
    const hp = api.hoop();
    let best = null;
    for (const n of [2, 3]) {
      const text = n === 2 ? twoLines(p) : threeLines(p); if (!text) continue;
      for (const turn of hp.w === hp.h ? [false] : [false, true]) {
        const fw = (turn ? hp.h : hp.w) - 5, fh = (turn ? hp.w : hp.h) - 5;
        const fits = (t) => { const [w, h] = layoutSize(S.pieces.map((r) => (r.id === p.id ? { ...p, text, size: t } : r))); return w <= fw && h <= fh; };
        let lo = p.size * 1.25, hi = 60;
        if (lo > hi || !fits(lo)) continue;
        while (hi - lo > 0.5) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
        const t = Math.floor(lo * 2) / 2;
        if (landing(p, { text, size: t }).fits !== (turn ? "turn" : "fits")) continue;
        if (!best || t >= best.size * 1.1) best = { n, text, size: t, turn };
      }
    }
    return best;
  }
  // A design too big for the hoop whose longest single line of words (not in a frame) brings it inside on two or three
  // lines: { p, n, text, size }, at the size it has where that lands, else at the biggest that does when it's a quarter
  // over what Fit to hoop (the whole design scaled by `k`) would leave; null when neither. (A long line typed with no
  // frame was offered Fit to hoop alone, 26 -> 11 mm, where two lines kept it at 26: only a frame's shrink offered them.)
  function hoopLines(k) {
    const hp = api.hoop(), fw = hp.w - 5, fh = hp.h - 5, wide = (q) => { const b = pieceBounds(q); return b ? b[2] - b[0] : 0; };
    // (lettering no frame fits: its size asked is the size sewn)
    const fit = fittedSizes(S.pieces);
    const p = S.pieces.filter((q) => twoLines(q) && !(q.rot || 0) && !fit.has(q.id)).sort((a, b) => wide(b) - wide(a))[0];
    if (!p) return null;
    let best = null;
    for (const [n, text] of [[2, twoLines(p)], [3, threeLines(p)]]) {
      if (!text) continue;
      const fits = (t) => { const [w, h] = layoutSize(S.pieces.map((r) => (r.id === p.id ? { ...p, text, size: t } : r))); return w <= fw && h <= fh; };
      let t = p.size;
      if (!fits(t)) {
        let lo = p.size * k * 1.25, hi = p.size;
        if (lo >= hi || !fits(lo)) continue;
        while (hi - lo > 0.5) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
        t = Math.floor(lo * 2) / 2;
      }
      if (best && t < best.size * 1.1) continue;
      if (landing(p, { text, size: t }).fits === "fits") best = { p, n, text, size: t };
    }
    return best;
  }
  // Words of one line its frame shrank under 80 % of the size asked, on two (or three) lines: { n, text, size (as the
  // frame then sews it), ask, fits } at the biggest size up to the one asked that lands (`landing`), when that's at
  // least a quarter bigger, else null. Not only at the size asked: a quilt label's "Made with love for Grace" went
  // 9 -> 5 mm, thin, and on two lines at 9 it ran into the name below, so nothing was offered (round 14).
  function frameLines(p, fs) {
    if (fs > p.size * 0.8) return null;
    let best = null;
    for (const [n, text] of [[2, twoLines(p)], [3, threeLines(p)]]) {
      if (!text) continue;
      const sewn = (ask) => fittedSizes(S.pieces.map((r) => (r.id === p.id ? { ...p, text, size: ask } : r))).get(p.id) ?? ask;
      // (asked sizes from the one asked down, 0.5 mm at a time, while what's sewn stays a quarter over now)
      for (let ask = p.size; ask >= fs * 1.25 - 1e-9; ask = Math.round((ask - 0.5) * 2) / 2) {
        const size = sewn(ask);
        if (size < fs * 1.25 || (best && size <= best.size * (n === 3 ? 1.1 : 1))) break;
        const l = landing(p, { text, size: ask });
        if (l.fits) { best = { n, text, size, ask, fits: l.fits }; break; }
      }
    }
    return best;
  }
  // one line of three or more words split into three lines as even as they can be (the longest line shortest)
  function threeLines(p) {
    if (p.kind !== "text" || (p.shape && p.shape !== "straight") || p.text.includes("\n")) return null;
    const w = p.text.trim().split(/ +/), line = (a, b) => w.slice(a, b).join(" ");
    if (w.length < 3) return null;
    let best = null;
    for (let i = 1; i < w.length - 1; i++) for (let j = i + 1; j < w.length; j++) {
      const worst = Math.max(line(0, i).length, line(i, j).length, line(j).length);
      if (!best || worst < best[0]) best = [worst, [line(0, i), line(i, j), line(j)].join("\n")];
    }
    return best[1];
  }
  // one line of two or more words split into two, at the space nearest the middle; null when that's not possible
  function twoLines(p) {
    if (p.kind !== "text" || (p.shape && p.shape !== "straight") || p.text.includes("\n")) return null;
    const t = p.text.trim(), at = [...t.matchAll(/ +/g)].map((x) => x.index);
    if (!at.length) return null;
    const i = at.reduce((a, b) => (Math.abs(b - t.length / 2) < Math.abs(a - t.length / 2) ? b : a));
    return t.slice(0, i) + "\n" + t.slice(i).trim();
  }
  return { newProblem, landing, hard, against, overlapping, runUp, frameLines, twoLines, frameOf, frameFor, display, sizeChange, roomIn, worseSaid, keepWord, moveAway, and, grown, asLettering, lineChoice, hoopLines, roundAll, carried, asText, sewAfter, resizeFrame };
}
