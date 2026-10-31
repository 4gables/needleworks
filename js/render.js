/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Draw a stitch pattern ({ stitches: [[x, y, cmd]] in 0.1 mm, threads }) like real thread on fabric.
import { COLOR_CHANGE, JUMP, STITCH, TRIM } from "./core/formats.js";

export function colorBlocks(design) {
  const blocks = [];
  let cur = { segs: [], index: 0 }, seg = [], ti = 0, n = 0;
  const flush = () => { if (seg.length > 1) cur.segs.push(seg); seg = []; };
  for (const [x, y, c] of design.stitches) {
    if (c === STITCH) { seg.push([x, y, n++]); }
    else if (c === JUMP) { flush(); seg = [[x, y, n]]; }
    else if (c === TRIM) flush();
    else if (c === COLOR_CHANGE) { flush(); if (cur.segs.length) blocks.push(cur); ti++; cur = { segs: [], index: ti }; }
  }
  flush(); if (cur.segs.length) blocks.push(cur);
  for (const b of blocks) {
    const t = design.threads[Math.min(b.index, design.threads.length - 1)];
    b.color = t?.color || ["#2b2b2b", "#c8102e", "#1f5fa8", "#2e8b57", "#d4a017"][b.index % 5];
    b.name = t?.name || t?.description || "";
  }
  return { blocks, total: n };
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (f < 0 ? v * (1 + f) : v + (255 - v) * f));
  return `rgb(${c.map((v) => Math.round(v)).join(",")})`;
}

// thread pale enough to vanish on light fabric
function pale(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255) > 0.85 * 255;
}

function bbox(blocks) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of blocks) for (const s of b.segs) for (const [x, y] of s) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x0 === Infinity ? [0, 0, 1, 1] : [x0, y0, x1, y1];
}

function gingham(ctx, colors, cell) {
  const t = document.createElement("canvas"); t.width = t.height = cell * 2;
  const g = t.getContext("2d");
  g.fillStyle = colors.base; g.fillRect(0, 0, cell * 2, cell * 2);
  g.globalAlpha = 0.55; g.fillStyle = colors.stripe;
  g.fillRect(0, 0, cell, cell * 2); g.fillRect(0, 0, cell * 2, cell);
  g.globalAlpha = 1; g.fillStyle = colors.cross; g.fillRect(0, 0, cell, cell);
  return ctx.createPattern(t, "repeat");
}

// cloth drawn under the preview (what a design is sewn on is FABRICS in studio/pieces.js)
export const CLOTHS = {
  linen: { label: "Linen", solid: "#f4efe7" },
  white: { label: "White", solid: "#fbfbfa" },
  pink: { label: "Pink gingham", base: "#fbf7f8", stripe: "#f19ab3", cross: "#e2577f" },
  blue: { label: "Blue gingham", base: "#f7f9fc", stripe: "#9cbbe6", cross: "#4f7fc4" },
  green: { label: "Green gingham", base: "#f7faf6", stripe: "#a6d1a0", cross: "#4f9a4a" },
  black: { label: "Black", solid: "#232022" },
};

// opts: { fabric (CLOTHS key), fabricShapeBlock, hide: Set, upto, ghost (stitches after upto drawn faint), heat (Map "cx,cy" -> hits per mm²), backdrop ({ bmp, unit, center }: a photo under it), hoop: {w,h} (mm), showHoop, zoom, pan: [x,y], center: [x,y] (0.1 mm),
//         pad, padTop, padBottom (px kept clear), cache (colorBlocks result), showNeedle (a needle at upto), fieldColor (fill inside the hoop), real (thread twist when zoomed in),
//         boxes ([[x0, y0, x1, y1]] mm: each hooping of a split design) }
export function draw(canvas, design, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  // (nothing to stitch yet still shows the hoop it would go in)
  if (!design && !(opts.hoop && opts.showHoop !== false)) return null;
  const { blocks, total } = design ? opts.cache || colorBlocks(design) : { blocks: [], total: 0 };
  let [x0, y0, x1, y1] = bbox(blocks);
  // (outlines drawn over it, mm: each hooping of a split design; the view takes them in)
  for (const [a, b, c, d] of opts.boxes || []) { x0 = Math.min(x0, a * 10); y0 = Math.min(y0, b * 10); x1 = Math.max(x1, c * 10); y1 = Math.max(y1, d * 10); }
  // centred on the design, or on a fixed point (the Design tab keeps the hoop centre still while pieces move)
  let cxd = opts.center ? opts.center[0] : (x0 + x1) / 2, cyd = opts.center ? opts.center[1] : (y0 + y1) / 2;
  const hoop = opts.hoop && opts.showHoop !== false ? opts.hoop : null;
  const bd = opts.backdrop, bw = bd ? bd.bmp.width * bd.unit : 0, bh = bd ? bd.bmp.height * bd.unit : 0;
  const spanW = Math.max(x1 - x0, hoop ? hoop.w * 10 : 0, bw * 0.9), spanH = Math.max(y1 - y0, hoop ? hoop.h * 10 : 0, bh * 0.9);
  // leave room at the top for the info chips (they wrap to more rows on a phone)
  // (and at the bottom for a message over the preview: the too-big note covered the hoop on a phone)
  const pad = opts.pad ?? 24, bot = Math.max(pad, opts.padBottom ?? pad);
  let top = opts.padTop ?? pad, fit = Math.min((W - pad * 2) / spanW, (H - bot - top) / spanH);
  // a control over the top-right corner ([w, h] px: the zoom pad) is kept clear of what's drawn, by moving it down or
  // in, whichever loses less (it sat over the empty hoop's corner)
  if (opts.corner) {
    const [cw, ch] = opts.corner, ring = 14;
    if (W / 2 + (spanW * fit) / 2 + ring > W - cw && top + (H - bot - top - spanH * fit) / 2 - ring < ch) {
      const t = Math.max(top, ch + ring), down = Math.min((W - pad * 2) / spanW, (H - bot - t) / spanH), inward = Math.min((W - (cw + ring) * 2) / spanW, (H - bot - top) / spanH);
      if (down >= inward) { top = t; fit = down; } else fit = inward;
    }
  }
  // a drag holds the fit and centre it began with (`opts.base`, from the last result): the view refitted to "too big"
  // as a piece went past the hoop and the piece ran off several times faster than the pointer
  let my = top + (H - bot - top) / 2;
  if (opts.base) ({ fit, my, cxd, cyd } = opts.base);
  const s = fit * (opts.zoom || 1), pan = opts.pan || [0, 0];
  const ox = W / 2 - cxd * s + pan[0], oy = my - cyd * s + pan[1];
  const X = (x) => x * s + ox, Y = (y) => y * s + oy;

  if (bd) {   // a photo of the item at true size (bd.unit: 0.1 mm per photo pixel), its centre at bd.center
    ctx.drawImage(bd.bmp, X(cxd + bd.center[0] - bw / 2), Y(cyd + bd.center[1] - bh / 2), bw * s, bh * s);
  }
  if (hoop) {   // hoop: wooden ring around the sewable field
    const hw = hoop.w * 10 * s, hh = hoop.h * 10 * s, r = Math.min(hw, hh) * 0.12;
    const hx = W / 2 - hw / 2 + pan[0], hy = my - hh / 2 + pan[1];
    ctx.save();
    // a light field inside the hoop when asked (dark mode: navy and black thread vanished on the dark stage)
    if (opts.fieldColor) { ctx.fillStyle = opts.fieldColor; roundRect(ctx, hx, hy, hw, hh, r * 0.6); ctx.fill(); }
    ctx.lineWidth = Math.max(6, 3.2 * s);
    ctx.strokeStyle = opts.hoopColor || "#d9c3a5";
    roundRect(ctx, hx - 8, hy - 8, hw + 16, hh + 16, r + 6); ctx.stroke();
    ctx.setLineDash([4, 5]); ctx.lineWidth = 1; ctx.strokeStyle = opts.fieldLine || "rgba(120,100,90,0.45)";
    roundRect(ctx, hx, hy, hw, hh, r * 0.6); ctx.stroke();
    ctx.restore();
  }
  if (opts.boxes) {   // each hooping's field, dashed and numbered
    ctx.save(); ctx.setLineDash([7, 5]); ctx.lineWidth = 1.5; ctx.font = "600 12px system-ui, sans-serif";
    opts.boxes.forEach(([a, b, c, d], i) => {
      ctx.strokeStyle = ctx.fillStyle = i ? "rgba(176,72,32,0.9)" : "rgba(28,92,160,0.9)";
      ctx.strokeRect(X(a * 10), Y(b * 10), (c - a) * 10 * s, (d - b) * 10 * s);
      ctx.fillText(`Hooping ${i + 1}`, X(a * 10) + 6, i ? Y(d * 10) - 6 : Y(b * 10) + 16);
    });
    ctx.restore();
  }

  const fab = CLOTHS[opts.fabric || "linen"];
  const fabBlock = opts.fabricShapeBlock != null && blocks.find((b) => b.index === opts.fabricShapeBlock);   // (block index, as hide)
  if (fabBlock) {
    // every outline in the placement block (appliqué letters have several, and holes): fabric between them
    // (closed ones only, ends within 5 mm: a zipper pouch's topstitch lines share the block; the bookmark's outline
    // stops a 2.5 mm stitch short of where it began)
    const outlines = fabBlock.segs.flatMap(rings).filter((sg) => sg.length > 8 && Math.hypot(sg[0][0] - sg[sg.length - 1][0], sg[0][1] - sg[sg.length - 1][1]) <= 50);
    ctx.save();
    ctx.beginPath();
    for (const outline of outlines) { outline.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.closePath(); }
    ctx.shadowColor = "rgba(60,30,30,0.22)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    ctx.fillStyle = fab.solid || gingham(ctx, fab, Math.max(3, 26 * s)); ctx.fill("evenodd");
    ctx.restore();
  }

  const upto = opts.upto ?? total;
  const tw = Math.max(0.6, 5.6 * s);       // a stitched thread lies ~0.55 mm wide (it spreads)
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (opts.ghost && upto < total) {   // what's still to sew, faint, under what's sewn
    ctx.globalAlpha = 0.16; ctx.lineWidth = Math.max(0.6, tw * 0.5);
    for (const b of blocks) {
      if (opts.hide && opts.hide.has(b.index)) continue;
      ctx.strokeStyle = b.color; ctx.beginPath();
      for (const seg of b.segs) {
        let on = false;
        for (const [x, y, n] of seg) { if (n + 1 < upto) continue; if (on) ctx.lineTo(X(x), Y(y)); else { ctx.moveTo(X(x), Y(y)); on = true; } }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  for (const b of blocks) {
    if (opts.hide && opts.hide.has(b.index)) continue;
    const base = b.color, dark = shade(base, -0.42), light = shade(base, 0.38);
    // soft drop shadow under the whole colour block; white and cream thread get an edge too (they vanished on the
    // off-white fabric)
    ctx.strokeStyle = "rgba(40,20,20,0.18)"; ctx.lineWidth = tw * 1.15;
    strokeSegs(ctx, b.segs, X, Y, upto, tw * 0.35);
    if (pale(base)) { ctx.strokeStyle = "rgba(60,45,45,0.5)"; ctx.lineWidth = tw + 1.6; strokeSegs(ctx, b.segs, X, Y, upto, 0); }
    for (const seg of b.segs) {
      for (let i = 1; i < seg.length; i++) {
        if (seg[i][2] >= upto) break;
        const ax = X(seg[i - 1][0]), ay = Y(seg[i - 1][1]), bx = X(seg[i][0]), by = Y(seg[i][1]);
        // thread body with a soft edge, then a thin sheen: dense satin reads as one glossy column
        ctx.strokeStyle = dark; ctx.globalAlpha = 0.35; ctx.lineWidth = tw;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.globalAlpha = 1; ctx.strokeStyle = base; ctx.lineWidth = tw * 0.86;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        // realistic: the thread's twist, fine ridges across it (zoomed in enough to see, and on screen)
        if (opts.real && tw > 3 && Math.max(ax, bx) > 0 && Math.min(ax, bx) < W && Math.max(ay, by) > 0 && Math.min(ay, by) < H) {
          const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / (L || 1), uy = (by - ay) / (L || 1), k = tw * 0.32;
          ctx.strokeStyle = dark; ctx.globalAlpha = 0.28; ctx.lineWidth = Math.max(0.6, tw * 0.08); ctx.beginPath();
          for (let t = tw * 0.5; t < L - tw * 0.3; t += tw * 0.55) {
            const px = ax + ux * t, py = ay + uy * t;
            ctx.moveTo(px - uy * k - ux * k * 0.6, py + ux * k - uy * k * 0.6); ctx.lineTo(px + uy * k + ux * k * 0.6, py - ux * k + uy * k * 0.6);
          }
          ctx.stroke(); ctx.globalAlpha = 1;
        }
        if (tw > 2.2) {
          const mx = (ax + bx) / 2, my = (ay + by) / 2, o = -tw * 0.12;
          ctx.strokeStyle = light; ctx.lineWidth = tw * 0.2;
          ctx.beginPath(); ctx.moveTo(ax * 0.8 + mx * 0.2 + o, ay * 0.8 + my * 0.2 + o);
          ctx.lineTo(bx * 0.8 + mx * 0.2 + o, by * 0.8 + my * 0.2 + o); ctx.stroke();
        }
      }
    }
  }
  if (opts.heat) {   // thickness: needle hits per 1 mm cell (the most in one colour block), over the stitches faded
    ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillRect(0, 0, W, H);
    for (const [k, n] of opts.heat) {
      if (n < 12) continue;
      const [cx, cy] = k.split(",").map(Number);
      ctx.fillStyle = n > 24 ? "rgba(214,25,25,.9)" : n > 18 ? "rgba(240,120,20,.75)" : "rgba(235,190,20,.55)";
      ctx.fillRect(X(cx * 10), Y(cy * 10), 10 * s + 0.5, 10 * s + 0.5);
    }
  }
  if (opts.showNeedle && upto < total) {
    for (const b of blocks) for (const seg of b.segs) for (const p of seg) if (p[2] === upto) {
      ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  return { scale: s, total, ox, oy, base: { fit, my, cxd, cyd } };
}

// A run of stitches cut into the closed rings it sews (file units): the appliqué placement line goes round one outline
// and on to the next, so drawing the whole run as one shape put the moves into the fabric and even-odd lost the holes.
// A ring ends where the line comes back within 0.3 mm of a point earlier in it, more than 5 mm of line before; what's
// between rings (the moves) is left out. A run with no ring comes back as it is.
function rings(seg) {
  const grid = new Map(), out = [], key = (x, y) => Math.floor(x / 4) * 100003 + Math.floor(y / 4);
  const len = [0];
  for (let i = 1; i < seg.length; i++) len.push(len[i - 1] + Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]));
  let start = 0;
  for (let i = 0; i < seg.length; i++) {
    const [x, y] = seg[i];
    let hit = -1;
    for (let dx = -1; dx <= 1 && hit < 0; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const j of grid.get(key(x + dx * 4, y + dy * 4)) || []) {
        if (j >= start && i - j > 8 && len[i] - len[j] > 50 && Math.hypot(seg[j][0] - x, seg[j][1] - y) <= 3 && (hit < 0 || j < hit)) hit = j;
      }
    }
    if (hit >= 0) { out.push(seg.slice(hit, i + 1)); start = i; }
    const k = key(x, y); (grid.get(k) || grid.set(k, []).get(k)).push(i);
  }
  if (!out.length) return [seg];
  out.push(seg.slice(start));
  return out;
}

function strokeSegs(ctx, segs, X, Y, upto, off) {
  ctx.beginPath();
  for (const seg of segs) {
    let started = false;
    for (const [x, y, n] of seg) {
      if (n >= upto) break;
      if (!started) { ctx.moveTo(X(x) + off, Y(y) + off); started = true; } else ctx.lineTo(X(x) + off, Y(y) + off);
    }
  }
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
