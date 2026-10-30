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

export const FABRICS = {
  linen: { label: "Linen", solid: "#f4efe7" },
  white: { label: "White", solid: "#fbfbfa" },
  pink: { label: "Pink gingham", base: "#fbf7f8", stripe: "#f19ab3", cross: "#e2577f" },
  blue: { label: "Blue gingham", base: "#f7f9fc", stripe: "#9cbbe6", cross: "#4f7fc4" },
  green: { label: "Green gingham", base: "#f7faf6", stripe: "#a6d1a0", cross: "#4f9a4a" },
  black: { label: "Black", solid: "#232022" },
};

// opts: { fabric, fabricShapeBlock, hide: Set, upto, ghost (stitches after upto drawn faint), heat (Map "cx,cy" -> hits per mm²), backdrop ({ bmp, unit, center }: a photo under it), hoop: {w,h} (mm), showHoop, zoom, pan: [x,y], center: [x,y] (0.1 mm) }
export function draw(canvas, design, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!design) return null;
  const { blocks, total } = opts.cache || colorBlocks(design);
  const [x0, y0, x1, y1] = bbox(blocks);
  // centred on the design, or on a fixed point (the Design tab keeps the hoop centre still while pieces move)
  const cxd = opts.center ? opts.center[0] : (x0 + x1) / 2, cyd = opts.center ? opts.center[1] : (y0 + y1) / 2;
  const hoop = opts.hoop && opts.showHoop !== false ? opts.hoop : null;
  const bd = opts.backdrop, bw = bd ? bd.bmp.width * bd.unit : 0, bh = bd ? bd.bmp.height * bd.unit : 0;
  const spanW = Math.max(x1 - x0, hoop ? hoop.w * 10 : 0, bw * 0.9), spanH = Math.max(y1 - y0, hoop ? hoop.h * 10 : 0, bh * 0.9);
  // leave room at the top for the info chips (they wrap to more rows on a phone)
  const pad = opts.pad ?? 24, top = opts.padTop ?? pad, fit = Math.min((W - pad * 2) / spanW, (H - pad - top) / spanH);
  const s = fit * (opts.zoom || 1), pan = opts.pan || [0, 0];
  const ox = W / 2 - cxd * s + pan[0], oy = top + (H - pad - top) / 2 - cyd * s + pan[1];
  const X = (x) => x * s + ox, Y = (y) => y * s + oy;

  if (bd) {   // a photo of the item at true size (bd.unit: 0.1 mm per photo pixel), its centre at bd.center
    ctx.drawImage(bd.bmp, X(cxd + bd.center[0] - bw / 2), Y(cyd + bd.center[1] - bh / 2), bw * s, bh * s);
  }
  if (hoop) {   // hoop: wooden ring around the sewable field
    const hw = hoop.w * 10 * s, hh = hoop.h * 10 * s, r = Math.min(hw, hh) * 0.12;
    const hx = W / 2 - hw / 2 + pan[0], hy = top + (H - pad - top) / 2 - hh / 2 + pan[1];
    ctx.save();
    ctx.fillStyle = opts.fieldColor || "rgba(255,255,255,0.0)";
    ctx.lineWidth = Math.max(6, 3.2 * s * 10 / 10);
    ctx.strokeStyle = opts.hoopColor || "#d9c3a5";
    roundRect(ctx, hx - 8, hy - 8, hw + 16, hh + 16, r + 6); ctx.stroke();
    ctx.setLineDash([4, 5]); ctx.lineWidth = 1; ctx.strokeStyle = opts.fieldLine || "rgba(120,100,90,0.45)";
    roundRect(ctx, hx, hy, hw, hh, r * 0.6); ctx.stroke();
    ctx.restore();
  }

  const fab = FABRICS[opts.fabric || "linen"];
  if (opts.fabricShapeBlock != null && blocks[opts.fabricShapeBlock]) {
    // every outline in the placement block (appliqué letters have several, and holes): fabric between them
    // (closed ones only, ends within 5 mm: a zipper pouch's topstitch lines share the block; the bookmark's outline
    // stops a 2.5 mm stitch short of where it began)
    const outlines = blocks[opts.fabricShapeBlock].segs.filter((sg) => sg.length > 8 && Math.hypot(sg[0][0] - sg[sg.length - 1][0], sg[0][1] - sg[sg.length - 1][1]) <= 50);
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
    // soft drop shadow under the whole colour block
    ctx.strokeStyle = "rgba(40,20,20,0.18)"; ctx.lineWidth = tw * 1.15;
    strokeSegs(ctx, b.segs, X, Y, upto, tw * 0.35);
    for (const seg of b.segs) {
      for (let i = 1; i < seg.length; i++) {
        if (seg[i][2] >= upto) break;
        const ax = X(seg[i - 1][0]), ay = Y(seg[i - 1][1]), bx = X(seg[i][0]), by = Y(seg[i][1]);
        // thread body with a soft edge, then a thin sheen: dense satin reads as one glossy column
        ctx.strokeStyle = dark; ctx.globalAlpha = 0.35; ctx.lineWidth = tw;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.globalAlpha = 1; ctx.strokeStyle = base; ctx.lineWidth = tw * 0.86;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
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
  return { scale: s, total, ox, oy };
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
