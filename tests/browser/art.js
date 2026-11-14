// Pictures in the styles makers bring, often made with an AI image tool (roadmap PX0): flat vector illustration,
// logo, cartoon character, mascot, sticker with a white border, line art, watercolour, a photo of a pet, gradient.
// Drawn here with canvas calls (no icon set, no one's artwork looked at), so they are ours to commit. Each is a spec
// for tests/browser/picture_corpus.html: `kind` (the row it is reported under), size, `back` (the page; null:
// see-through), `noise`/`jpeg` (photo grain, compression), `rough` (texture the picture tab may smooth), and draw(c, r)
// with r a seeded random number.
const TAU = 2 * Math.PI;
const ell = (c, x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); };
const circ = (c, x, y, r) => ell(c, x, y, r, r);
const poly = (c, pts, close = true) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); if (close) c.closePath(); };
const fill = (c, col) => { c.fillStyle = col; c.fill(); };
const line = (c, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.lineJoin = "round"; c.lineCap = "round"; c.stroke(); };
const both = (c, col, ink, w) => { fill(c, col); line(c, ink, w); };
// a closed curve through the midpoints of pts (smooth, like a vector blob)
function smooth(c, pts) {
  const n = pts.length, m = (i) => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
  c.beginPath(); c.moveTo(...m(0));
  for (let i = 1; i <= n; i++) c.quadraticCurveTo(pts[i % n][0], pts[i % n][1], ...m(i));
  c.closePath();
}
const blobPts = (r, x, y, rx, ry, n = 14, j = 0.18, rot = 0) => Array.from({ length: n }, (_, k) => {
  const a = (k * TAU) / n, q = 1 + j * (r() - 0.5) * 2, px = Math.cos(a) * rx * q, py = Math.sin(a) * ry * q;
  return [x + px * Math.cos(rot) - py * Math.sin(rot), y + px * Math.sin(rot) + py * Math.cos(rot)];
});
const text = (c, s, x, y, font, col) => { c.font = font; c.fillStyle = col; c.textAlign = "center"; c.textBaseline = "alphabetic"; c.fillText(s, x, y); };
const outText = (c, s, x, y, font, col, ink, w) => { c.font = font; c.textAlign = "center"; c.textBaseline = "alphabetic"; c.lineJoin = "round"; c.strokeStyle = ink; c.lineWidth = w; c.strokeText(s, x, y); c.fillStyle = col; c.fillText(s, x, y); };
// watercolour: a wash of a few jittered layers, darker where it dried at the edge, pigment grain
function wash(c, r, x, y, rx, ry, col, rot = 0, layers = 7) {
  c.save(); c.fillStyle = col;
  for (let k = 0; k < layers; k++) { c.globalAlpha = 0.16; smooth(c, blobPts(r, x + (r() - 0.5) * rx * 0.1, y + (r() - 0.5) * ry * 0.1, rx * (0.85 + 0.15 * r()), ry * (0.85 + 0.15 * r()), 16, 0.12, rot)); c.fill(); }
  c.globalAlpha = 0.35; c.strokeStyle = col; c.lineWidth = 3; smooth(c, blobPts(r, x, y, rx * 0.97, ry * 0.97, 16, 0.08, rot)); c.stroke();
  c.globalAlpha = 0.12; for (let k = 0; k < (rx * ry) / 40; k++) { const a = r() * TAU, d = Math.sqrt(r()); circ(c, x + Math.cos(a) * rx * d * 0.9, y + Math.sin(a) * ry * d * 0.9, 1 + 2 * r()); c.fill(); }
  c.restore();
}
// photo fur: short strands from a centre outwards, colour jittered round `col`
function fur(c, r, cx, cy, clipPath, col, n, len) {
  const [R, G, B] = [1, 3, 5].map((k) => parseInt(col.slice(k, k + 2), 16));
  c.save(); clipPath(); c.clip();
  for (let k = 0; k < n; k++) {
    const x = cx + (r() - 0.5) * 520, y = cy + (r() - 0.5) * 520, a = Math.atan2(y - cy, x - cx) + (r() - 0.5) * 0.6, l = len * (0.6 + 0.8 * r()), v = 0.75 + 0.5 * r();
    c.strokeStyle = `rgb(${Math.min(255, R * v) | 0},${Math.min(255, G * v) | 0},${Math.min(255, B * v) | 0})`; c.lineWidth = 1 + r() * 1.5;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  c.restore();
}
const studio = (c, w, h, a, b) => { const g = c.createRadialGradient(w / 2, h * 0.45, 50, w / 2, h / 2, w * 0.75); g.addColorStop(0, a); g.addColorStop(1, b); c.fillStyle = g; c.fillRect(0, 0, w, h); };
const INK = "#1c1c1c";

export const ART = [
  // ---- flat vector illustration ----
  { name: "art_flat_landscape", kind: "flat illustration", w: 800, h: 800, draw: (c) => {
    c.save(); circ(c, 400, 400, 330); c.clip();
    c.fillStyle = "#8ecae6"; c.fillRect(0, 0, 800, 800);
    circ(c, 520, 290, 62); fill(c, "#ffb703");
    poly(c, [[40, 560], [250, 300], [400, 470], [520, 330], [760, 580], [760, 800], [40, 800]]); fill(c, "#219ebc");
    poly(c, [[250, 300], [205, 356], [232, 345], [258, 362], [292, 349]]); fill(c, "#ffffff");
    poly(c, [[520, 330], [478, 375], [505, 368], [530, 382], [560, 372]]); fill(c, "#ffffff");
    poly(c, [[40, 640], [330, 470], [560, 600], [760, 520], [760, 800], [40, 800]]); fill(c, "#023047");
    for (const [x, y, s] of [[180, 640, 1], [250, 660, 0.8], [600, 650, 1.1], [660, 670, 0.8]]) {
      c.fillStyle = "#7f5539"; c.fillRect(x - 6 * s, y, 12 * s, 40 * s);
      for (let k = 0; k < 3; k++) { poly(c, [[x, y - 110 * s + k * 35 * s], [x - (36 + 12 * k) * s, y - (45 - k * 35) * s + 0], [x + (36 + 12 * k) * s, y - (45 - k * 35) * s]]); fill(c, "#2a9d8f"); }
    }
    c.fillStyle = "#8ab17d"; c.fillRect(0, 700, 800, 100);
    c.restore();
  } },
  { name: "art_flat_coffee", kind: "flat illustration", w: 800, h: 800, draw: (c) => {
    ell(c, 400, 640, 270, 52); fill(c, "#d9d9d9");
    ell(c, 400, 630, 190, 30); fill(c, "#bdbdbd");
    c.beginPath(); c.arc(590, 450, 70, -1.2, 1.2); line(c, "#e76f51", 30);
    poly(c, [[230, 330], [570, 330], [540, 560], [500, 625], [300, 625], [260, 560]]); fill(c, "#e76f51");
    ell(c, 400, 330, 170, 36); fill(c, "#f4a261"); ell(c, 400, 334, 150, 26); fill(c, "#6f4518");
    for (const x of [330, 400, 470]) { c.beginPath(); c.moveTo(x, 280); c.bezierCurveTo(x - 30, 240, x + 30, 200, x, 160); c.bezierCurveTo(x - 25, 130, x + 20, 110, x, 90); line(c, "#c4c4c4", 14); }
    c.beginPath(); c.moveTo(400, 520); c.bezierCurveTo(330, 470, 340, 420, 380, 425); c.bezierCurveTo(395, 427, 400, 440, 400, 445); c.bezierCurveTo(400, 440, 405, 427, 420, 425); c.bezierCurveTo(460, 420, 470, 470, 400, 520); fill(c, "#ffffff");
  } },
  { name: "art_flat_plant", kind: "flat illustration", w: 800, h: 800, draw: (c) => {
    const leaf = (x, y, rx, ry, a, col) => { ell(c, x, y, rx, ry, a); fill(c, col); c.beginPath(); c.moveTo(x - Math.cos(a) * rx * 0.9, y - Math.sin(a) * rx * 0.9); c.lineTo(x + Math.cos(a) * rx * 0.9, y + Math.sin(a) * rx * 0.9); line(c, "#1b4332", 5); };
    for (const [x1, y1] of [[260, 260], [400, 170], [540, 250], [300, 400], [500, 390]]) { c.beginPath(); c.moveTo(400, 520); c.quadraticCurveTo(400, 400, x1, y1); line(c, "#40916c", 10); }
    leaf(260, 260, 110, 50, -2.4, "#2d6a4f"); leaf(400, 170, 120, 52, -1.57, "#52b788"); leaf(540, 250, 110, 50, -0.7, "#2d6a4f"); leaf(290, 400, 95, 42, -2.8, "#52b788"); leaf(510, 390, 95, 42, -0.35, "#52b788");
    poly(c, [[270, 520], [530, 520], [500, 720], [300, 720]]); fill(c, "#c8553d");
    c.fillStyle = "#a4442f"; c.fillRect(250, 500, 300, 50);
    ell(c, 400, 500, 145, 14); fill(c, "#4a3426");
  } },
  { name: "art_flat_house", kind: "flat illustration", w: 800, h: 700, draw: (c) => {
    ell(c, 400, 640, 380, 50); fill(c, "#6a994e");
    c.fillStyle = "#8d99ae"; c.fillRect(470, 150, 50, 110);
    for (const [x, y, rr] of [[500, 120, 22], [525, 85, 28], [560, 50, 32]]) { circ(c, x, y, rr); fill(c, "#dedede"); }
    c.fillStyle = "#f4d35e"; c.fillRect(170, 330, 360, 280);
    poly(c, [[140, 340], [350, 160], [560, 340]]); fill(c, "#ee6352");
    c.fillStyle = "#3d405b"; c.fillRect(310, 470, 80, 140); circ(c, 375, 545, 6); fill(c, "#f4d35e");
    for (const x of [200, 430]) { c.fillStyle = "#a8dadc"; c.fillRect(x, 400, 70, 70); c.fillStyle = "#ffffff"; c.fillRect(x + 32, 400, 6, 70); c.fillRect(x, 432, 70, 6); }
    c.fillStyle = "#7f5539"; c.fillRect(630, 450, 30, 170);
    for (const [x, y, rr] of [[645, 400, 70], [600, 440, 50], [690, 440, 50]]) { circ(c, x, y, rr); fill(c, "#57a773"); }
  } },
  // ---- logos ----
  { name: "art_logo_mountain", kind: "logo", w: 800, h: 800, draw: (c) => {
    circ(c, 400, 330, 250); fill(c, "#1d3557");
    c.save(); circ(c, 400, 330, 250); c.clip();
    circ(c, 470, 260, 46); fill(c, "#e63946");
    poly(c, [[140, 470], [320, 250], [400, 340], [470, 290], [660, 470]]); fill(c, "#f1faee");
    c.restore();
    circ(c, 400, 330, 272); line(c, "#1d3557", 10);
    text(c, "PEAK", 400, 690, "150px 'T Alfa'", "#1d3557");
    text(c, "SUPPLY CO.", 400, 765, "52px 'T Josefin'", "#e63946");
  } },
  { name: "art_logo_bee", kind: "logo", w: 800, h: 800, draw: (c) => {
    const hex = (r) => poly(c, Array.from({ length: 6 }, (_, k) => [400 + r * Math.cos((k * TAU) / 6 - Math.PI / 2), 320 + r * Math.sin((k * TAU) / 6 - Math.PI / 2)]));
    hex(260); fill(c, "#ffb703"); hex(222); line(c, "#023047", 14);
    ell(c, 340, 250, 70, 45, -0.5); both(c, "#ffffff", "#023047", 10); ell(c, 460, 250, 70, 45, 0.5); both(c, "#ffffff", "#023047", 10);
    c.save(); ell(c, 400, 350, 120, 80); c.clip(); c.fillStyle = "#023047"; c.fillRect(270, 260, 260, 200); c.fillStyle = "#ffb703"; for (const x of [330, 400, 470]) c.fillRect(x - 18, 260, 30, 200); c.restore();
    ell(c, 400, 350, 120, 80); line(c, "#023047", 10);
    text(c, "HONEY CO.", 400, 720, "110px 'T Lilita'", "#023047");
  } },
  { name: "art_logo_monogram", kind: "logo", w: 800, h: 800, draw: (c) => {
    circ(c, 400, 400, 280); line(c, "#7b2cbf", 16);
    for (let k = 0; k < 9; k++) for (const s of [-1, 1]) {
      const a = Math.PI / 2 + s * (0.35 + k * 0.17), x = 400 + 240 * Math.cos(a), y = 400 + 240 * Math.sin(a);
      ell(c, x, y, 26, 11, a + s * 1.2); fill(c, "#5a189a");
    }
    text(c, "AB", 400, 480, "230px 'T Alfa'", "#3c096c");
  } },
  // ---- cartoon characters: flat colours, heavy dark outlines, highlights in the eyes ----
  { name: "art_cartoon_cat", kind: "cartoon", w: 800, h: 800, draw: (c) => {
    for (const s of [-1, 1]) { poly(c, [[400 + s * 210, 330], [400 + s * 220, 120], [400 + s * 70, 250]]); both(c, "#f4a261", INK, 10); poly(c, [[400 + s * 190, 300], [400 + s * 200, 170], [400 + s * 110, 255]]); fill(c, "#f7a8b8"); }
    ell(c, 400, 430, 240, 195); both(c, "#f4a261", INK, 10);
    ell(c, 400, 500, 120, 80); fill(c, "#fde4cf");
    for (const s of [-1, 1]) {
      ell(c, 400 + s * 100, 400, 48, 58); both(c, "#ffffff", INK, 8); ell(c, 400 + s * 95, 410, 28, 38); fill(c, INK); circ(c, 400 + s * 85, 392, 11); fill(c, "#ffffff");
      ell(c, 400 + s * 175, 490, 36, 22); fill(c, "#f28482");
      for (const d of [-14, 14]) { c.beginPath(); c.moveTo(400 + s * 150, 500 + d); c.lineTo(400 + s * 290, 485 + d * 2.2); line(c, INK, 5); }
    }
    poly(c, [[375, 470], [425, 470], [400, 495]]); both(c, "#e5989b", INK, 6);
    c.beginPath(); c.moveTo(400, 495); c.quadraticCurveTo(390, 535, 360, 525); c.moveTo(400, 495); c.quadraticCurveTo(410, 535, 440, 525); line(c, INK, 7);
  } },
  { name: "art_cartoon_robot", kind: "cartoon", w: 800, h: 800, draw: (c) => {
    c.beginPath(); c.moveTo(400, 150); c.lineTo(400, 90); line(c, INK, 10); circ(c, 400, 80, 22); both(c, "#e63946", INK, 8);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(400 + s * 160, 470); c.lineTo(400 + s * 250, 560); line(c, INK, 34); c.beginPath(); c.moveTo(400 + s * 160, 470); c.lineTo(400 + s * 250, 560); line(c, "#adb5bd", 20); circ(c, 400 + s * 255, 570, 30); both(c, "#6c757d", INK, 8); }
    c.beginPath(); c.roundRect(240, 400, 320, 280, 30); both(c, "#adb5bd", INK, 10);
    c.beginPath(); c.roundRect(220, 150, 360, 240, 50); both(c, "#ced4da", INK, 10);
    c.beginPath(); c.roundRect(260, 190, 280, 160, 30); both(c, "#003049", INK, 8);
    for (const s of [-1, 1]) { circ(c, 400 + s * 65, 255, 28); fill(c, "#4cc9f0"); circ(c, 400 + s * 58, 247, 8); fill(c, "#ffffff"); }
    c.beginPath(); c.arc(400, 290, 50, 0.2 * Math.PI, 0.8 * Math.PI); line(c, "#4cc9f0", 8);
    [["#e63946", 320], ["#fcbf49", 400], ["#4cc9f0", 480]].forEach(([col, x]) => { circ(c, x, 470, 22); both(c, col, INK, 6); });
    c.beginPath(); c.roundRect(300, 540, 200, 90, 14); both(c, "#6c757d", INK, 6);
    for (const y of [565, 590, 615]) { c.beginPath(); c.moveTo(320, y); c.lineTo(480, y); line(c, "#ced4da", 6); }
  } },
  { name: "art_cartoon_dino", kind: "cartoon", w: 800, h: 700, draw: (c) => {
    for (let k = 0; k < 6; k++) { const x = 220 + k * 70, y = 260 - Math.sin((k / 5) * Math.PI) * 60; poly(c, [[x - 30, y + 30], [x, y - 30], [x + 30, y + 30]]); both(c, "#f77f00", INK, 8); }
    c.beginPath(); c.moveTo(120, 520); c.bezierCurveTo(60, 470, 150, 420, 210, 430); c.bezierCurveTo(220, 300, 420, 220, 560, 260); c.bezierCurveTo(620, 200, 760, 210, 740, 320);
    c.bezierCurveTo(730, 400, 640, 400, 600, 390); c.bezierCurveTo(600, 470, 560, 560, 520, 600); c.lineTo(470, 600); c.lineTo(470, 560); c.lineTo(330, 560); c.lineTo(330, 600); c.lineTo(270, 600);
    c.bezierCurveTo(250, 560, 200, 540, 120, 520); c.closePath(); both(c, "#80b918", INK, 10);
    c.save(); c.clip(); ell(c, 430, 520, 160, 70); fill(c, "#d9ed92"); for (const [x, y, rr] of [[300, 380, 26], [380, 330, 20], [460, 360, 28], [540, 310, 16], [250, 450, 16]]) { circ(c, x, y, rr); fill(c, "#55a630"); } c.restore();
    circ(c, 660, 285, 30); both(c, "#ffffff", INK, 7); circ(c, 668, 290, 15); fill(c, INK); circ(c, 662, 282, 5); fill(c, "#ffffff");
    c.beginPath(); c.moveTo(640, 355); c.quadraticCurveTo(690, 380, 725, 345); line(c, INK, 7);
    ell(c, 700, 320, 18, 10); fill(c, "#f4978e");
  } },
  // ---- mascots: bold, two-tone shading, a banner ----
  { name: "art_mascot_bear", kind: "mascot", w: 800, h: 800, draw: (c) => {
    for (const s of [-1, 1]) { circ(c, 400 + s * 190, 190, 75); both(c, "#7f4f24", INK, 14); circ(c, 400 + s * 190, 195, 40); fill(c, "#ddb892"); }
    circ(c, 400, 380, 250); both(c, "#7f4f24", INK, 14);
    c.save(); circ(c, 400, 380, 243); c.clip(); c.beginPath(); c.arc(400, 380, 243, 0.4 * Math.PI, 1.1 * Math.PI); c.arc(440, 340, 240, 1.05 * Math.PI, 0.45 * Math.PI, true); fill(c, "#582f0e"); c.restore();
    ell(c, 400, 470, 130, 95); both(c, "#ddb892", INK, 10);
    ell(c, 400, 420, 50, 32); fill(c, INK); ell(c, 390, 410, 14, 8); fill(c, "#ffffff");
    c.beginPath(); c.moveTo(400, 450); c.lineTo(400, 490); c.moveTo(340, 500); c.quadraticCurveTo(400, 540, 460, 500); line(c, INK, 9);
    for (const s of [-1, 1]) { ell(c, 400 + s * 95, 320, 34, 30); both(c, "#ffffff", INK, 8); circ(c, 400 + s * 90, 326, 15); fill(c, INK); poly(c, [[400 + s * 45, 290], [400 + s * 150, 260], [400 + s * 150, 285], [400 + s * 50, 305]]); fill(c, INK); }
    poly(c, [[130, 600], [670, 600], [700, 700], [100, 700]]); both(c, "#c1121f", INK, 12);
    outText(c, "BEARS", 400, 683, "100px 'T Lilita'", "#ffffff", INK, 10);
  } },
  { name: "art_mascot_fox", kind: "mascot", w: 800, h: 800, draw: (c) => {
    for (const s of [-1, 1]) { poly(c, [[400 + s * 90, 220], [400 + s * 230, 70], [400 + s * 250, 300]]); both(c, "#f77f00", INK, 12); poly(c, [[400 + s * 130, 225], [400 + s * 220, 120], [400 + s * 228, 260]]); fill(c, "#3d2c1e"); }
    poly(c, [[150, 260], [400, 200], [650, 260], [620, 430], [400, 620], [180, 430]]); both(c, "#f77f00", INK, 12);
    for (const s of [-1, 1]) { poly(c, [[400 + s * 235, 420], [400 + s * 60, 470], [400, 620], [400 + s * 160, 500]]); both(c, "#ffffff", INK, 10); }
    for (const s of [-1, 1]) { poly(c, [[400 + s * 50, 360], [400 + s * 150, 320], [400 + s * 130, 380]]); both(c, "#fcbf49", INK, 8); circ(c, 400 + s * 110, 357, 12); fill(c, INK); }
    poly(c, [[370, 560], [430, 560], [400, 600]]); fill(c, INK);
    outText(c, "FOXES", 400, 760, "120px 'T Alfa'", "#003049", "#ffffff", 4);
  } },
  { name: "art_mascot_owl", kind: "mascot", w: 800, h: 800, draw: (c) => {
    for (const s of [-1, 1]) { poly(c, [[400 + s * 120, 200], [400 + s * 200, 80], [400 + s * 200, 230]]); both(c, "#6d597a", "#22223b", 10); }
    ell(c, 400, 420, 220, 290); both(c, "#6d597a", "#22223b", 10);
    for (const s of [-1, 1]) { ell(c, 400 + s * 200, 470, 70, 170, s * 0.2); both(c, "#4a3b56", "#22223b", 10); }
    ell(c, 400, 510, 140, 170); fill(c, "#e5d9f2");
    for (let y = 0; y < 4; y++) for (let x = -2 + (y % 2) * 0.5; x <= 2; x++) { c.beginPath(); c.arc(400 + x * 50, 440 + y * 55, 16, 0.15 * Math.PI, 0.85 * Math.PI); line(c, "#9d8bb0", 6); }
    for (const s of [-1, 1]) { circ(c, 400 + s * 85, 290, 75); both(c, "#ffffff", "#22223b", 9); circ(c, 400 + s * 85, 290, 52); fill(c, "#ffd166"); circ(c, 400 + s * 85, 295, 28); fill(c, "#22223b"); circ(c, 400 + s * 75, 282, 9); fill(c, "#ffffff"); }
    poly(c, [[375, 345], [425, 345], [400, 400]]); both(c, "#f4a261", "#22223b", 7);
    for (const s of [-1, 1]) for (const d of [-25, 0, 25]) { ell(c, 400 + s * 70 + d, 700, 14, 26); both(c, "#f4a261", "#22223b", 6); }
  } },
  // ---- stickers: a white border round the design, a soft shadow, often see-through ----
  { name: "art_sticker_avocado", kind: "sticker", w: 800, h: 800, back: null, draw: (c) => {
    const shape = () => { c.beginPath(); c.arc(400, 500, 210, 0, TAU); c.moveTo(400 + 140, 260); c.arc(400, 260, 140, 0, TAU); };
    c.save(); c.filter = "blur(10px)"; c.translate(10, 14); shape(); c.fillStyle = "rgba(0,0,0,0.3)"; c.fill(); c.lineWidth = 60; c.strokeStyle = "rgba(0,0,0,0.3)"; c.stroke(); c.restore();
    shape(); c.lineWidth = 60; c.strokeStyle = "#ffffff"; c.stroke(); c.fillStyle = "#ffffff"; c.fill();
    shape(); c.fillStyle = "#386641"; c.fill("nonzero"); c.lineWidth = 9; c.strokeStyle = INK; c.stroke();
    c.save(); c.beginPath(); c.arc(400, 505, 170, 0, TAU); c.moveTo(400 + 105, 280); c.arc(400, 280, 105, 0, TAU); c.fillStyle = "#d4e09b"; c.fill("nonzero"); c.restore();
    circ(c, 400, 530, 85); both(c, "#7f5539", INK, 8); circ(c, 375, 500, 18); fill(c, "#b08968");
    for (const s of [-1, 1]) { circ(c, 400 + s * 40, 330, 13); fill(c, INK); ell(c, 400 + s * 75, 360, 20, 11); fill(c, "#f4978e"); }
    c.beginPath(); c.arc(400, 350, 22, 0.15 * Math.PI, 0.85 * Math.PI); line(c, INK, 7);
  } },
  { name: "art_sticker_rainbow", kind: "sticker", w: 800, h: 640, back: "#f0f0f0", draw: (c) => {
    const cols = ["#e63946", "#f4a261", "#e9c46a", "#2a9d8f", "#457b9d"], clouds = [[170, 480], [630, 480]];
    const arcs = (w0, col) => { c.beginPath(); c.arc(400, 480, 230, Math.PI, 0); line(c, col, w0); };
    const puffs = (grow, col) => { for (const [x, y] of clouds) for (const [dx, dy, rr] of [[-50, 10, 50], [0, -15, 65], [55, 10, 50]]) { circ(c, x + dx, y + dy, rr + grow); fill(c, col); } };
    c.save(); c.filter = "blur(12px)"; c.translate(8, 12); arcs(5 * 38 + 70, "rgba(0,0,0,0.25)"); puffs(35, "rgba(0,0,0,0.25)"); c.restore();
    arcs(5 * 38 + 70, "#ffffff"); puffs(35, "#ffffff");
    cols.forEach((col, k) => { c.beginPath(); c.arc(400, 480, 306 - k * 38, Math.PI, 0); line(c, col, 40); });
    puffs(4, INK); puffs(0, "#ffffff");
  } },
  { name: "art_sticker_heart", kind: "sticker", w: 800, h: 760, back: null, draw: (c) => {
    const heart = () => { c.beginPath(); c.moveTo(400, 690); c.bezierCurveTo(130, 520, 60, 330, 160, 210); c.bezierCurveTo(250, 110, 370, 150, 400, 240); c.bezierCurveTo(430, 150, 550, 110, 640, 210); c.bezierCurveTo(740, 330, 670, 520, 400, 690); c.closePath(); };
    c.save(); c.filter = "blur(10px)"; c.translate(8, 12); heart(); c.lineWidth = 70; c.strokeStyle = "rgba(0,0,0,0.3)"; c.stroke(); c.fill(); c.restore();
    heart(); c.lineWidth = 70; c.strokeStyle = "#ffffff"; c.stroke(); fill(c, "#ffffff");
    heart(); both(c, "#ff006e", INK, 9);
    c.save(); heart(); c.clip(); ell(c, 250, 260, 60, 30, -0.7); fill(c, "#ff8fab"); c.restore();
    outText(c, "LOVE", 400, 470, "150px 'T Lilita'", "#ffffff", INK, 12);
  } },
  // ---- line art: one dark ink, strokes of one width ----
  { name: "art_line_flower", kind: "line art", w: 800, h: 800, draw: (c) => {
    for (let k = 0; k < 6; k++) { const a = (k * TAU) / 6; ell(c, 400 + 85 * Math.cos(a), 260 + 85 * Math.sin(a), 75, 38, a); line(c, "#111111", 5); }
    circ(c, 400, 260, 42); line(c, "#111111", 5);
    for (let k = 0; k < 9; k++) { circ(c, 400 + 20 * Math.cos(k * 0.7), 260 + 20 * Math.sin(k * 0.7), 3); fill(c, "#111111"); }
    c.beginPath(); c.moveTo(400, 345); c.bezierCurveTo(380, 480, 430, 580, 400, 740); line(c, "#111111", 5);
    for (const s of [-1, 1]) {
      const y = s < 0 ? 520 : 610;
      c.beginPath(); c.moveTo(402, y); c.quadraticCurveTo(400 + s * 120, y - 120, 400 + s * 190, y - 60); c.quadraticCurveTo(400 + s * 120, y + 10, 402, y); line(c, "#111111", 5);
      c.beginPath(); c.moveTo(402, y); c.quadraticCurveTo(400 + s * 110, y - 60, 400 + s * 185, y - 58); line(c, "#111111", 3);
    }
  } },
  { name: "art_line_mandala", kind: "line art", w: 800, h: 800, draw: (c) => {
    for (const rr of [60, 150, 300]) { circ(c, 400, 400, rr); line(c, "#1a1a2e", 4); }
    for (let k = 0; k < 12; k++) { const a = (k * TAU) / 12; ell(c, 400 + 105 * Math.cos(a), 400 + 105 * Math.sin(a), 42, 17, a); line(c, "#1a1a2e", 4); }
    for (let k = 0; k < 16; k++) { const a = (k * TAU) / 16; c.beginPath(); c.moveTo(400 + 150 * Math.cos(a - 0.15), 400 + 150 * Math.sin(a - 0.15)); c.quadraticCurveTo(400 + 270 * Math.cos(a), 400 + 270 * Math.sin(a), 400 + 150 * Math.cos(a + 0.15), 400 + 150 * Math.sin(a + 0.15)); line(c, "#1a1a2e", 4); }
    for (let k = 0; k < 24; k++) { const a = (k * TAU) / 24 + 0.13; circ(c, 400 + 280 * Math.cos(a), 400 + 280 * Math.sin(a), 6); fill(c, "#1a1a2e"); }
    for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8; c.beginPath(); c.moveTo(400, 400); c.lineTo(400 + 60 * Math.cos(a), 400 + 60 * Math.sin(a)); line(c, "#1a1a2e", 3); }
  } },
  { name: "art_line_cat", kind: "line art", w: 700, h: 800, draw: (c) => {
    c.beginPath();
    c.moveTo(250, 720); c.bezierCurveTo(150, 640, 160, 430, 250, 360); c.lineTo(230, 230); c.lineTo(300, 290); c.bezierCurveTo(330, 275, 380, 275, 410, 290);
    c.lineTo(480, 230); c.lineTo(460, 360); c.bezierCurveTo(560, 440, 560, 640, 460, 720); c.closePath(); line(c, "#222222", 6);
    c.beginPath(); c.moveTo(460, 720); c.bezierCurveTo(600, 720, 650, 640, 600, 560); line(c, "#222222", 6);
    for (const s of [-1, 1]) { c.beginPath(); c.arc(355 + s * 45, 370, 18, 0.1 * Math.PI, 0.9 * Math.PI); line(c, "#222222", 5); }
    c.beginPath(); c.moveTo(345, 410); c.lineTo(365, 410); c.lineTo(355, 422); c.closePath(); fill(c, "#222222");
    for (const s of [-1, 1]) for (const d of [-8, 8]) { c.beginPath(); c.moveTo(355 + s * 30, 420 + d); c.lineTo(355 + s * 120, 410 + d * 2); line(c, "#222222", 3); }
    c.beginPath(); c.moveTo(300, 720); c.lineTo(300, 600); c.moveTo(410, 720); c.lineTo(410, 600); line(c, "#222222", 5);
  } },
  // ---- watercolour: soft washes, darker dried edges, pigment grain, paper ----
  { name: "art_water_flowers", kind: "watercolour", w: 800, h: 800, back: "#fbf8f1", rough: true, noise: 4, draw: (c, r) => {
    for (const [x, y, a] of [[300, 520, -0.6], [520, 560, 0.7], [410, 640, 0.1]]) wash(c, r, x, y, 80, 30, "#4f772d", a);
    c.save(); c.globalAlpha = 0.6; for (const [x1, y1] of [[290, 330], [420, 260], [540, 360]]) { c.beginPath(); c.moveTo(410, 720); c.quadraticCurveTo(410, 500, x1, y1); line(c, "#4f772d", 7); } c.restore();
    wash(c, r, 290, 320, 95, 85, "#e56b6f"); wash(c, r, 290, 320, 45, 40, "#b5179e");
    wash(c, r, 430, 240, 105, 90, "#f4a6c1"); wash(c, r, 430, 240, 40, 36, "#e56b6f");
    wash(c, r, 550, 360, 85, 75, "#9d4edd"); wash(c, r, 550, 360, 32, 30, "#5a189a");
  } },
  { name: "art_water_lemons", kind: "watercolour", w: 800, h: 700, back: "#fbf8f1", rough: true, noise: 4, draw: (c, r) => {
    wash(c, r, 560, 210, 120, 45, "#6a994e", -0.5);
    for (const [x, y, R] of [[300, 380, 190], [560, 430, 150]]) {
      wash(c, r, x, y, R, R, "#f2c94c"); wash(c, r, x, y, R * 0.86, R * 0.86, "#fff3b0", 0, 5);
      c.save(); c.globalAlpha = 0.5; for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8; c.beginPath(); c.moveTo(x, y); c.lineTo(x + R * 0.8 * Math.cos(a), y + R * 0.8 * Math.sin(a)); line(c, "#f7f3e3", 6); } c.restore();
      wash(c, r, x, y, R * 0.12, R * 0.12, "#f7f3e3", 0, 3);
    }
  } },
  { name: "art_water_whale", kind: "watercolour", w: 800, h: 600, back: "#fbf8f1", rough: true, noise: 4, draw: (c, r) => {
    wash(c, r, 380, 330, 260, 120, "#5e8bc0");
    wash(c, r, 360, 300, 230, 75, "#264b80", 0, 5);
    wash(c, r, 420, 400, 170, 40, "#cfe1f2", 0, 5);
    c.save(); c.translate(660, 260); c.rotate(-0.6); wash(c, r, 0, 0, 80, 35, "#264b80", 0, 5); c.restore();
    circ(c, 230, 330, 9); fill(c, "#1b2a41");
    for (const [x, y, rr] of [[220, 140, 14], [250, 110, 10], [190, 115, 9], [230, 80, 7]]) wash(c, r, x, y, rr, rr, "#7fb3d5", 0, 4);
  } },
  // ---- photos of pets: a studio backdrop, fur, soft shading, grain, JPEG ----
  { name: "art_photo_dog", kind: "pet photo", w: 800, h: 800, back: "#e4ddd2", rough: true, noise: 5, jpeg: 0.85, draw: (c, r) => {
    studio(c, 800, 800, "#ece6dc", "#d4cabb");
    const head = () => { c.beginPath(); c.ellipse(400, 400, 190, 220, 0, 0, TAU); c.moveTo(560, 560); c.ellipse(400, 560, 160, 120, 0, 0, TAU); };
    c.save(); c.filter = "blur(18px)"; ell(c, 400, 760, 260, 40); fill(c, "rgba(60,40,20,0.35)"); c.restore();
    c.save(); c.filter = "blur(1.2px)";
    head(); fill(c, "#a86b35");
    for (const s of [-1, 1]) { ell(c, 400 + s * 200, 380, 70, 170, s * -0.25); fill(c, "#6b3f1d"); }
    fur(c, r, 400, 470, head, "#a86b35", 9000, 14);
    c.save(); head(); c.clip(); const g = c.createRadialGradient(330, 330, 40, 400, 450, 330); g.addColorStop(0, "rgba(255,230,190,0.35)"); g.addColorStop(1, "rgba(40,20,5,0.45)"); c.fillStyle = g; c.fillRect(0, 0, 800, 800); c.restore();
    ell(c, 400, 560, 120, 95); fill(c, "#dcb48a");
    fur(c, r, 400, 600, () => ell(c, 400, 560, 120, 95), "#dcb48a", 3000, 9);
    for (const s of [-1, 1]) { ell(c, 400 + s * 80, 390, 26, 24); fill(c, "#2a1607"); circ(c, 400 + s * 80 - 8, 382, 7); fill(c, "rgba(255,255,255,0.85)"); }
    ell(c, 400, 515, 46, 32); fill(c, "#1a1110"); ell(c, 388, 505, 12, 6); fill(c, "rgba(255,255,255,0.4)");
    c.beginPath(); c.moveTo(400, 545); c.lineTo(400, 585); c.moveTo(355, 600); c.quadraticCurveTo(400, 625, 445, 600); line(c, "#3a2414", 4);
    c.restore();
  } },
  { name: "art_photo_cat", kind: "pet photo", w: 800, h: 800, back: "#cfd8dc", rough: true, noise: 5, jpeg: 0.85, draw: (c, r) => {
    studio(c, 800, 800, "#dbe3e6", "#b8c4c9");
    const head = () => { c.beginPath(); c.ellipse(400, 450, 230, 200, 0, 0, TAU); c.moveTo(220, 330); c.lineTo(200, 120); c.lineTo(330, 270); c.closePath(); c.moveTo(580, 330); c.lineTo(600, 120); c.lineTo(470, 270); c.closePath(); };
    c.save(); c.filter = "blur(1px)";
    head(); fill(c, "#8f8f8f");
    fur(c, r, 400, 470, head, "#8f8f8f", 9000, 12);
    c.save(); head(); c.clip(); c.filter = "blur(6px)";
    for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(400 + k * 40, 260); c.quadraticCurveTo(400 + k * 55, 320, 400 + k * 30, 360); line(c, "rgba(50,50,50,0.8)", 16); }
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(400 + s * 230, 420 + k * 45); c.quadraticCurveTo(400 + s * 170, 430 + k * 45, 400 + s * 140, 470 + k * 40); line(c, "rgba(50,50,50,0.7)", 14); }
    c.restore();
    ell(c, 400, 540, 110, 75); fill(c, "#ebe7e2");
    for (const s of [-1, 1]) { ell(c, 400 + s * 90, 420, 42, 34); fill(c, "#7fb069"); ell(c, 400 + s * 90, 420, 9, 30); fill(c, "#101010"); circ(c, 400 + s * 90 - 14, 408, 7); fill(c, "rgba(255,255,255,0.9)"); }
    poly(c, [[380, 500], [420, 500], [400, 522]]); fill(c, "#d98c95");
    c.restore();
    for (const s of [-1, 1]) for (const d of [-10, 5, 20]) { c.beginPath(); c.moveTo(400 + s * 60, 545 + d); c.quadraticCurveTo(400 + s * 160, 530 + d * 1.5, 400 + s * 250, 540 + d * 2.5); line(c, "rgba(250,250,250,0.9)", 2); }
  } },
  // ---- gradients: the smooth shading AI images are full of ----
  { name: "art_gradient_sunset", kind: "gradient", w: 800, h: 800, draw: (c) => {
    c.save(); circ(c, 400, 400, 330); c.clip();
    const g = c.createLinearGradient(0, 70, 0, 730); g.addColorStop(0, "#ff7b00"); g.addColorStop(0.5, "#ff006e"); g.addColorStop(1, "#8338ec"); c.fillStyle = g; c.fillRect(0, 0, 800, 800);
    const s = c.createLinearGradient(0, 220, 0, 500); s.addColorStop(0, "#ffd60a"); s.addColorStop(1, "#ff9e00"); circ(c, 400, 420, 160); c.fillStyle = s; c.fill();
    c.fillStyle = "#3a0ca3"; for (let k = 0; k < 7; k++) c.fillRect(0, 500 + k * 34, 800, 12 + k * 3);
    c.beginPath(); c.moveTo(560, 760); c.quadraticCurveTo(570, 500, 520, 320); line(c, "#10002b", 22);
    for (let k = 0; k < 6; k++) { const a = -Math.PI + (k * Math.PI) / 5; ell(c, 520 + 80 * Math.cos(a), 320 + 40 * Math.sin(a) + 15, 90, 20, a * 0.8); fill(c, "#10002b"); }
    c.restore();
  } },
  { name: "art_gradient_icon", kind: "gradient", w: 800, h: 800, draw: (c) => {
    const g = c.createLinearGradient(120, 120, 680, 680); g.addColorStop(0, "#4cc9f0"); g.addColorStop(1, "#7209b7");
    c.beginPath(); c.roundRect(120, 120, 560, 560, 120); c.fillStyle = g; c.fill();
    c.save(); c.filter = "blur(14px)"; ell(c, 410, 560, 150, 30); fill(c, "rgba(20,0,50,0.45)"); c.restore();
    const b = c.createRadialGradient(350, 330, 20, 400, 400, 190); b.addColorStop(0, "#ffd166"); b.addColorStop(0.6, "#f78c6b"); b.addColorStop(1, "#ef476f");
    circ(c, 400, 400, 170); c.fillStyle = b; c.fill();
    c.save(); c.beginPath(); c.roundRect(120, 120, 560, 560, 120); c.clip(); ell(c, 330, 200, 260, 110, -0.3); fill(c, "rgba(255,255,255,0.25)"); c.restore();
  } },
];
