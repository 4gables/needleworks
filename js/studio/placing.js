/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Where a piece goes: what's on a frame, the spot in a frame for a new piece, the nearest free room in the hoop,
// and what is offered when there is none. One path for add, duplicate, paste and files (place() in S.ui.js calls
// these). The editor hands in its state and helpers as S. (Part of S.ui.js until 2026-11.)
import { pieceBounds, minSize, towelMin, inFrame, frontPanel, sewn, fittedSizes, touching, layoutSize, sewnBox, label, FILE_SCALE, sewnBoxes } from "./pieces.js";

export function placing(S) {
  const { api } = S;
  // could p at `size` fit a w x h box at all? (its box at its own size scaled, with a little to spare: stitching each
  // size of a 60 mm appliqué AB that couldn't fit held "+ Appliqué letters" up for 1.2 s)
  function roughly(p) {
    const b = p.size == null ? null : pieceBounds({ ...p, x: 0, y: 0 });
    return (size, w, h) => !b || ((b[2] - b[0]) * size) / p.size <= w + 2 && ((b[3] - b[1]) * size) / p.size <= h + 2;
  }
  // made smaller to find it room, a piece must still stitch cleanly (and on a towel, keep its letters open): "Move it
  // to the free space in the circle, 17 mm" closed a towel monogram up
  const MOTIF_MIN = (q) => (q.kind === "motif" ? S.MOTIF_LEAST[q.style || "fill"] || 0 : 0);
  // (a motif under the size it's said too small at, too: + Motif put a filled heart in at 20 mm, then said it was too
  // small to fill)
  const readable = (q) => !minSize(q) && !(S.fabric === "towel" && (q.kind === "text" || q.kind === "monogram") && towelMin(q) > q.size * 1.04) && !(q.size < MOTIF_MIN(q));
  // a patch whose satin edge p (as sewn) would lie on: over the patch's box but not 3 mm inside its outline (collisions
  // leave patches out, as lettering sits on their fill: "Move it to the free space" put a flower on a patch's edge
  // inside a circle that was its target)
  function patchEdge(p, ps = S.pieces) {
    const b = pieceBounds(p);
    return b && ps.find((f) => f.kind === "frame" && f.border === "patch" && f.id !== p.id && !(f.rot || 0) && ((c) => c && b[0] < c[2] && b[2] > c[0] && b[1] < c[3] && b[3] > c[1])(pieceBounds(f)) && !inFrame(p, f, 3));
  }
  // x, y that put p in the middle of frame f's front (a zipper pouch's is below the zipper)
  function middleOf(f, p) {
    const fb = pieceBounds({ ...p, x: 0, y: 0 }), [t, b] = frontPanel(f);
    return fb ? { x: Math.round((f.x - (fb[0] + fb[2]) / 2) * 2) / 2, y: Math.round(((t + b) / 2 - (fb[1] + fb[3]) / 2) * 2) / 2 } : { x: p.x, y: p.y };
  }
  // p at the size it's sewn: lettering a frame shrinks at its S.fitted size (`fittedSizes`). Whatever measures a piece
  // where it shows goes by this: measured at the size asked for, a key fob's 25 mm monogram sewn 9 mm wasn't "on" the
  // fob (Make another left it off the copy), a copy of it found "no free room" in the empty fob beside it, and the
  // selection box ran far past the letters.
  function sewnAt(p, ps = S.pieces) { return sewn(p, ps); }
  // frames alike (an in-the-hoop project made again beside the first, `twoUp`)
  // a frame of several alike (Make another) given its own thread: they no longer sew in the same steps, said, with the
  // thread put on all of them as the way back (one key fob's thread changed took 2 steps to 8, nothing said)
  function ungang(p, was) {
    if (p?.kind !== "frame" || was == null || p.color === was) return;
    const twins = S.pieces.filter((q) => alike(q, p) && q.color === was);
    if (!twins.length) return;
    S.toast(`The ${S.shapeLabel(p)}s now sew one after the other, in more steps: they have different threads.`, { label: "Use this thread on all of them", run: () => { S.remember(); for (const q of twins) { const t = S.pieces.find((o) => o.id === q.id); if (t) t.color = p.color; } S.save(); S.ui(); S.make(); } });
  }
  function alike(a, b) { return a !== b && a.kind === "frame" && b.kind === "frame" && a.border === b.border && a.shape === b.shape && a.w === b.w && a.h === b.h; }
  // what's on frame f (at the sizes it's sewn)
  function onFrame(f, ps = S.pieces) {
    const fit = fittedSizes(ps);
    return ps.filter((q) => q !== f && q.id !== f.id && inFrame(sewn(q, ps, fit), f, -2));
  }
  // Where p goes inside a frame with room for it, running into nothing: the selected frame first, then an empty one of
  // several alike (the second key fob after "Make another": a monogram copied or added went to the first fob, full, and
  // found no room), then the biggest. In the middle of the frame's front, or below, above or beside what's in it
  // already, at its own size or smaller (10 % steps, down to `S.least`), measured at the size the frame then sews it.
  // { f, x, y, size }, or null.
  // (`fix`: as a one-tap fix, no smaller than the piece's style stitches well either: "Move it to the free space, 20.5
  // mm" made a filled motif too small for its detail; a new piece may go that small, and the editor says so)
  function spotIn(p, fix = false, src = null) {
    const H = (f) => (f.shape === "circle" ? f.w : f.h), others = S.pieces.filter((o) => o.id !== p.id);
    const frames = others.filter((f) => f.kind === "frame" && !(f.rot || 0)).sort((a, b) => b.w * H(b) - a.w * H(a));
    if (!frames.length) return null;
    const chosen = S.current()?.kind === "frame" && frames.includes(S.current()) ? [S.current()] : [];
    const empty = frames.filter((f) => frames.some((g) => alike(f, g)) && !onFrame(f, others).length).sort((a, b) => (chosen.includes(b) - chosen.includes(a)) || others.indexOf(a) - others.indexOf(b));
    // (a copy of a piece on a frame, into an empty one alike: where the original is on its own, at its size)
    const home = src && frames.find((g) => onFrame(g, others).includes(src));
    for (const f of home ? empty.filter((f) => alike(f, home)) : []) {
      const q = { ...p, x: src.x - home.x + f.x, y: src.y - home.y + f.y }, ps = [...S.pieces.filter((o) => o.id !== p.id), q], s = sewnAt(q, ps);
      if (inFrame(s, f, f.border === "patch" ? 3 : 4) && !touching(s, others)) return { f, x: q.x, y: q.y, size: p.size };
    }
    for (const fs of [...chosen.map((f) => [f]), ...empty.filter((f) => !chosen.includes(f)).map((f) => [f]), frames]) { const at = spotInOf(p, fs, others, fix); if (at) return at; }
    return null;
  }
  function spotInOf(p, frames, others, fix) {
    const H = (f) => (f.shape === "circle" ? f.w : f.h);
    const sizes = p.size == null ? [p.size] : [...new Set(Array.from({ length: 10 }, (_, i) => Math.max(S.least(p), Math.round(p.size * (1 - i / 10) * 2) / 2)))];
    const big = roughly(p);
    // (what's on each frame, worked out once: it was measured again for every size tried, ~0.1 s of + Appliqué letters)
    const boxes = new Map(), boxesOn = (f) => { if (!boxes.has(f)) boxes.set(f, onFrame(f, others).map((o) => pieceBounds(sewnAt(o, others))).filter(Boolean)); return boxes.get(f); };
    for (const size of sizes) {
      // (lettering is S.fitted to the frame it lands in: across it, and a monogram up and down too, so it may be asked
      // bigger than the frame)
      if (!frames.some((f) => p.kind === "monogram" || big(size, p.kind === "text" ? Infinity : f.w, H(f)))) continue;
      const q0 = { ...p, size }, fb = pieceBounds({ ...q0, x: 0, y: 0 });
      if (!fb || (size !== p.size && (!readable(q0) || (fix && size < MOTIF_MIN(q0) && p.size >= MOTIF_MIN(q0))))) continue;
      const cx = (fb[0] + fb[2]) / 2, cy = (fb[1] + fb[3]) / 2;
      for (const f of frames) {
        // what's in it already (frames too: the quilt block's heart), and the spots round that
        const [t] = frontPanel(f), mid = middleOf(f, q0), bs = boxesOn(f);
        const spots = [[mid.x, mid.y]];
        if (bs.length) {
          const L = Math.min(...bs.map((b) => b[0])), T = Math.min(...bs.map((b) => b[1])), R = Math.max(...bs.map((b) => b[2])), B = Math.max(...bs.map((b) => b[3]));
          spots.push([mid.x, B + 4 - fb[1]], [mid.x, T - 4 - fb[3]], [R + 4 - fb[0], (T + B) / 2 - cy], [L - 4 - fb[2], (T + B) / 2 - cy]);
        }
        for (const [x, y] of spots) {
          const q = { ...q0, x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 };
          // (on a zipper pouch, clear of the zipper band and its topstitch)
          if (f.border === "zip" && q.y + fb[1] < t + 3) continue;
          // (measured at the size the frame then sews it: "Shrunk to 23.5 mm so it fits" under a monogram just put in at 24)
          const ps = S.pieces.some((o) => o.id === p.id) ? S.pieces.map((o) => (o.id === p.id ? q : o)) : [...S.pieces, q], s = sewnAt(q, ps);
          if ((s.size !== q.size && !readable(s)) || !inFrame(s, f, f.border === "patch" ? 3 : 4) || touching(s, others) || patchEdge(s, others)) continue;
          // (as a fix, nor a size that brings a problem of its own, as `landing` checks every other fix: "Move it to the
          // free space in the heart appliqué, 15.5 mm" filled the loops of "Abbie goes", monkey gang-keyfob seed 1)
          if (fix && S.pieces.some((o) => o.id === p.id) && S.newProblem(p, q, ps, { size })) continue;
          return { f, x: q.x, y: q.y, size: s.size ?? size };
        }
      }
    }
    return null;
  }
  // does the layout with p added still fit the hoop's field (as boxes, at the sizes they're sewn)?
  function fitsWith(p) {
    const [w, h] = layoutSize(p ? [...S.pieces, p] : S.pieces), hp = api.hoop();
    return w <= hp.w - 5 && h <= hp.h - 5;
  }
  // The nearest free space for a new piece where a frame had no room (`spotIn`): its box 2 mm clear of every other
  // piece's box and running into nothing, the whole layout still fitting the hoop's field, at its own size or smaller
  // (10 % steps down to `S.least`), as near the middle of what's there as it can be (above costs a little more than
  // below). On an in-the-hoop project (`ith`) it stays on the project's front. { x, y, size } or null: no room left.
  function freeRoom(p, ith, sameSize = false) {
    const hp = api.hoop(), fw = hp.w - 5, fh = hp.h - 5, fit = fittedSizes(S.pieces);
    const boxes = S.pieces.map((o) => [o, sewnBox(o, S.pieces, fit)]).filter(([, b]) => b);
    if (!boxes.length) return null;
    const obst = boxes.filter(([o]) => o !== ith).map(([, b]) => b), all = boxes.map(([, b]) => b);
    const L = Math.min(...all.map((b) => b[0])), T = Math.min(...all.map((b) => b[1])), R = Math.max(...all.map((b) => b[2])), B = Math.max(...all.map((b) => b[3]));
    // (`fitsWith`, with the others' boxes measured once: q goes last, so it changes no one else's S.fitted size; every
    // spot tried measured every piece again, 1.2 s for appliqué letters pasted beside the bib)
    const fitsBeside = (q, fb) => {
      const fs = fittedSizes([...S.pieces, q]).get(q.id), b = fs != null ? pieceBounds({ ...q, size: fs }) : [fb[0] + q.x, fb[1] + q.y, fb[2] + q.x, fb[3] + q.y];
      return !b || (Math.max(R, b[2]) - Math.min(L, b[0]) <= fw && Math.max(B, b[3]) - Math.min(T, b[1]) <= fh);
    };
    const [ft, fb0] = ith ? frontPanel(ith) : [0, 0], prefer = ith ? [ith.x, (ft + fb0) / 2] : [(L + R) / 2, (T + B) / 2];
    const sizes = p.size == null || sameSize ? [p.size] : [...new Set(Array.from({ length: 10 }, (_, i) => Math.max(S.least(p), Math.round(p.size * (1 - i / 10) * 2) / 2)))];
    const area = ith ? pieceBounds(ith) : [R - fw, B - fh, L + fw, T + fh], big = roughly(p);
    // where its box (fb, at the origin) keeps the whole layout within the field (or within the project's front) and
    // clear of every other box, nearest the middle first
    const spotsFor = (fb) => {
      const x0 = area[0] - fb[0], x1 = area[2] - fb[2], y0 = Math.max(area[1], ith ? ft + (ith.border === "zip" ? 3 : 0) : -Infinity) - fb[1], y1 = area[3] - fb[3];
      const spots = [];
      for (let x = x0; x <= x1; x += 2) for (let y = y0; y <= y1; y += 2) {
        const bx = [x + fb[0] - 2, y + fb[1] - 2, x + fb[2] + 2, y + fb[3] + 2];
        if (obst.some((o) => o[0] < bx[2] && bx[0] < o[2] && o[1] < bx[3] && bx[1] < o[3])) continue;
        const dx = x + (fb[0] + fb[2]) / 2 - prefer[0], dy = y + (fb[1] + fb[3]) / 2 - prefer[1];
        spots.push([Math.hypot(dx, dy < 0 ? dy * 1.2 : dy), x, y]);
      }
      return spots;
    };
    const f0 = p.size == null ? null : pieceBounds({ ...p, x: 0, y: 0 });
    for (const size of sizes) {
      if (!big(size, area[2] - area[0], area[3] - area[1])) continue;
      // (no spot even for its box at its own size scaled down a tenth more: not stitched at this size at all. Each
      // size of appliqué letters stitched to find there was no room held a paste up 1.2 s.)
      if (f0 && size !== p.size && !spotsFor(f0.map((v) => (v * size * 0.9) / p.size)).length) continue;
      const q0 = { ...p, size }, fb = pieceBounds({ ...q0, x: 0, y: 0 });
      if (!fb || (size !== p.size && !readable(q0))) continue;
      const spots = spotsFor(fb);
      spots.sort((a, b) => a[0] - b[0]);
      for (const [, x, y] of spots.slice(0, 150)) {
        const q = { ...q0, x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 };
        if (ith && !inFrame(q, ith, 4)) continue;
        // (rounded to the half mm, a spot on the field's edge could take the layout 0.08 mm past it: the design then
        // counted as two hoopings already, and every later piece went below it, out of the hoop)
        if (!ith && !fitsBeside(q, fb)) continue;
        if (p.kind !== "frame" && touching(q, S.pieces)) continue;
        // (at the size a frame it lands in then sews it, as `spotIn` does)
        return { x: q.x, y: q.y, ...(p.size == null ? {} : { size: fittedSizes([...S.pieces, q]).get(p.id) ?? size }) };
      }
    }
    return null;
  }
  // nothing added: there's no room for it, said plainly (with "Add it anyway" where that can still be sewn, in two
  // hoopings or a bigger hoop; not on an in-the-hoop project, where it would sew on the bare stabilizer)
  const whatOf = (p) => ({ text: "more lettering", monogram: "a monogram", letters: "appliqué letters", frame: "another frame" }[p.kind] || `a ${label(p).toLowerCase()}`);
  // Where there's room with the hoop turned (the long side across), or for a design file made smaller (it's re-stitched
  // at that size, 90 % down to 50 %), that's offered first: a 100 mm bolt.pes on the tote bag offered only "Add it
  // anyway", which made the design too big, though turning the hoop S.fitted it. Each is worked out before it's offered.
  function noRoom(p, ith, insert = (q) => S.pieces.push(q)) {
    const what = whatOf(p);
    if (ith) {
      const where = ith.border === "zip" ? "on the pouch's front" : `inside the ${label(ith).toLowerCase()}`;
      // (with the biggest thing on it made smaller, where that makes the room and brings no problem of its own: worked
      // out by trying, a tenth at a time down to 60 %. "+ Motif" on the coaster, full of its monogram, said only "Make
      // what's there smaller", and how much smaller was left to find by hand)
      // (from the size it's sewn at: its frame may have shrunk it already)
      const fit = fittedSizes(S.pieces), sewnSize = (o) => fit.get(o.id) ?? o.size;
      const on = onFrame(ith).filter((o) => o.size != null && !(o.rot || 0)).sort((a, b) => sewnSize(b) - sewnSize(a))[0];
      const keep = S.pieces;
      for (let k = 0.9; on && k >= 0.6 - 1e-9; k -= 0.1) {
        const size = Math.round(sewnSize(on) * k * 2) / 2; if (size < S.least(on)) break;
        const change = S.sizeChange(on, size); if (!S.landing(on, change).fits) continue;
        let room = null;
        try { S.pieces = keep.map((o) => (o.id === on.id ? { ...o, ...change } : o)); room = freeRoom({ ...p }, ith); } finally { S.pieces = keep; }
        if (!room) continue;
        S.toast(`There's no free room ${where} for ${what}. With ${label(on)} at ${size} mm there is.`, { label: `Make ${label(on)} ${size} mm and add it`, run: () => {
          const q = S.pieces.find((o) => o.id === on.id); if (!q) return;
          S.remember(); Object.assign(q, change);
          const at = freeRoom(p, S.pieces.find((o) => o.id === ith.id)); if (!at) { S.undo(); return; }
          Object.assign(p, at); insert(p); S.sel = p.id; S.save(); S.ui(); S.make();
        } });
        return;
      }
      S.toast(`There's no free room ${where} for ${what}. Make what's there smaller, or take something out first.`); return;
    }
    const add = (q, turn) => { S.remember(); S.fitted = false; if (turn) { api.setTurn(!api.turned()); api.fit(); } Object.assign(p, q); insert(p); S.sel = p.id; S.recentre(); S.save(); S.ui(); S.make(); };
    // (with the hoop turned: tried, and the turn put back)
    let turned = null;
    if (api.hoop().w !== api.hoop().h) { api.setTurn(!api.turned()); try { turned = (p.kind !== "frame" && spotIn(p)) || freeRoom(p, null, p.kind === "file"); } finally { api.setTurn(!api.turned()); } }
    if (turned) { S.toast(`There's no free room in the hoop for ${what} as it's turned now. With the hoop turned the other way there is.`, { label: "Turn the hoop and add it", run: () => add(turned, true) }); return; }
    if (p.kind === "file") for (let k = Math.min(0.9, (p.scale || 1) - 0.1); k >= FILE_SCALE[0] - 1e-9; k -= 0.1) {
      const q = { ...p }, f = Math.round(k * 10) / 10; S.resizeFile(q, f);
      const room = freeRoom(q, null, true);
      if (room) { S.toast(`There's no free room in the hoop for ${what} at its size. Made ${Math.round(f * 100)} % of its size, it fits beside what's there.`, { label: `Add it at ${Math.round(f * 100)} %`, run: () => { S.resizeFile(p, f); add(room, false); } }); return; }
    }
    S.toast(`There's no free room in the hoop for ${what}. Make something smaller, or take something out first.`, { label: "Add it anyway", run: () => {
      S.remember(); S.fitted = false; freeSpot(p, "down"); insert(p); S.sel = p.id; S.recentre(); S.save(); S.ui(); S.make();
    } });
  }
  // a new piece in free space beside what's there: above or below (the other way if that doesn't fit the hoop)
  function freeSpot(p, prefer) {
    const bs = sewnBoxes(S.pieces), fb = pieceBounds({ ...p, x: 0, y: 0 }), hp = api.hoop();
    if (!bs.length || !fb) return;
    const top = Math.min(...bs.map((b) => b[1])), bottom = Math.max(...bs.map((b) => b[3])), lim = hp.h / 2 - 5;
    const up = top - 4 - fb[3], down = bottom + 4 - fb[1], fitsUp = up + fb[1] >= -lim, fitsDown = down + fb[3] <= lim;
    p.x = 0; p.y = prefer === "down" ? (fitsDown || !fitsUp ? down : up) : (fitsUp || !fitsDown ? up : down);
  }
  // where to centre a box (mm) of pasted pieces: below everything when the whole layout then fits the hoop's field, else
  // above, else beside it (right, then left), else below anyway (the layout says it's too big)
  function spotFor([x0, y0, x1, y1], anyway = false) {
    const bs = sewnBoxes(S.pieces), hp = api.hoop(), w = x1 - x0, h = y1 - y0;
    const L = Math.min(...bs.map((b) => b[0])), T = Math.min(...bs.map((b) => b[1])), R = Math.max(...bs.map((b) => b[2])), B = Math.max(...bs.map((b) => b[3]));
    const fits = (cx, cy) => Math.max(R, cx + w / 2) - Math.min(L, cx - w / 2) <= hp.w - 5 && Math.max(B, cy + h / 2) - Math.min(T, cy - h / 2) <= hp.h - 5;
    const mx = (L + R) / 2, my = (T + B) / 2;
    const spots = [[mx, B + 4 + h / 2], [mx, T - 4 - h / 2], [R + 4 + w / 2, my], [L - 4 - w / 2, my]];
    return spots.find(([cx, cy]) => fits(cx, cy)) || (anyway ? spots[0] : null);
  }
  return { spotIn, freeRoom, freeSpot, sewnAt, noRoom, onFrame, fitsWith, ungang, spotFor, MOTIF_MIN, alike };
}
