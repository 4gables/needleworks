/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The piece editor panel: the controls for the selected piece (words, font, size, shape, threads, frame and
// motif settings), drawn from the piece as it is. The editor hands in its state and helpers as S.
// (Part of ui.js until 2026-11.)
import { QUILTS } from "./quilt.js";
import { COVERS, TRIMS } from "./borders.js";
import { FILL_PATTERNS } from "../core/fill.js";
import { NAVY } from "./starters.js";
import { MOTIFS } from "./motifs.js";
import { TEXT_SHAPES, followFrame, SHAPES, BORDERS, FILE_SCALE, bulkReady } from "./pieces.js";
import { FONTS, APPLIQUE_FONTS } from "../core/fonts.js";
import { MAX_WORDS, swashless, MAX_INITIALS, monogramHelp } from "../core/typed.js";

export function editorPanel(S) {
  const { $, api } = S;
  function drawEditor() {
    const p = S.current();
    $("st-center").hidden = !p; $("st-drag-hint").hidden = !p;   // (no piece, nothing to drag)
    // (no "Selected piece" heading over nothing: an empty design showed it with nothing under it)
    const box = $("st-edit").closest("fieldset"), head = box?.querySelector("legend")?.firstChild;
    if (box) box.hidden = !p && !S.pieces.length;
    if (head?.nodeType === 3) head.textContent = p ? "Selected piece " : "No piece selected ";
    if (!p) { $("st-edit").innerHTML = `<p class="hint">Tap a piece in the list above or on the preview to change it.</p>`; return; }
    let h = "";
    // (said when typing or pasting goes past the most a piece takes, `MAX_WORDS` in typed.js: a field's maxlength cut a
    // pasted 200-letter name to 60 without a word)
    const cutHint = `<p class="hint" data-cut-hint aria-live="polite" hidden></p>`;
    if (p.kind === "text") {
      const lines = p.text.split("\n").length, arc = p.shape === "up" || p.shape === "down";
      // (a new line first: the parser drops one straight after <textarea>, so words starting on a new line lost it on
      // every redraw)
      h += `<label class="field"><span>Words</span><textarea data-k="text" rows="${Math.min(3, lines)}" data-max="${MAX_WORDS}" autocomplete="off" spellcheck="false">\n${api.escapeHtml(swashless(p.text))}</textarea></label>`
        + `<p class="hint" data-lines-hint aria-live="polite" hidden>Three lines is the most: that new line became a space.</p>` + cutHint;
      // swashes are typed (~ at either end of the words); these put them on or take them off
      {
        const { lead, tail } = S.swashOn(p.text);
        const kind = FONTS.find((f) => f.family === p.font)?.print ? "Dash" : "Swash";
        h += `<div class="seg swash" role="group" aria-label="${kind}es" title="Or type ~ at the start or end of the words">`
          + `<button type="button" data-swash="lead" aria-pressed="${lead}">${kind} before</button><button type="button" data-swash="tail" aria-pressed="${tail}">${kind} after</button></div>`;
      }
      h += `<label class="field"><span>Font</span>${S.fontSelect(p)}</label>${S.fontRow(p)}`;
      h += S.range("size", "Height", 5, 60, p.size);
      h += `<p class="hint">About 10 mm for a pocket or cuff, 15-20 mm for a T-shirt's chest, 20-30 mm for a onesie, pillow or blanket corner, 30-50 mm for a towel.</p>`;
      h += S.seg("shape", TEXT_SHAPES, p.shape);
      h += S.stitchSeg(p);
      h += `<label class="field"><span>Motif either side</span><select data-k="deco"><option value="">None</option>${Object.entries(MOTIFS).map(([k, m]) => `<option value="${k}" ${k === p.deco ? "selected" : ""}>${m.name}</option>`).join("")}</select></label>`;   // (a heart or star either side was hidden under More)
      if (arc) {
        h += S.range("radius", "Curve width", 15, 80, p.radius);
        h += S.range("ry", "Curve height", 15, 80, p.ry ?? p.radius);
        // (only when it would change something: on a scallop it was there, did nothing, and the words ran into it)
        const ff = followFrame(p, S.pieces);
        if (ff && Object.entries(ff).some(([k, v]) => Math.abs((p[k] ?? (k === "ry" ? p.radius : 0)) - v) > 0.25)) h += `<button type="button" class="link" data-follow>Follow the frame</button>`;
      }
      if (p.shape === "wave") { h += S.range("amp", "Wave height", 2, 30, p.amp ?? Math.round(p.size * 0.35)); h += S.range("waves", "Waves", 1, 3, p.waves ?? 1, "", 0.5); }
      if (p.shape === "bridge") h += S.range("bulge", "Bulge", 10, 80, p.bulge ?? 30, "%", 5);
      // the rarer settings, folded away
      const print = FONTS.find((f) => f.family === p.font)?.print;
      const more = ''
        + (print ? S.range("spacing", "Letter spacing", -10, 40, p.spacing || 0, "%") + `<div data-pairs>${S.pairUI(p)}</div>` : "")
        + (p.shape === "straight" ? `<p class="hint">Press Enter in Words for a new line (up to 3).</p>` : "")
        + (p.shape === "straight" && lines > 1 ? S.seg("align", { left: "Left", center: "Centre", right: "Right" }, p.align || "center") + S.range("leading", "Line spacing", 80, 200, p.leading ?? 130, "%", 5) : "");
      // (only when there's something in it: an arched script name opened an empty "More")
      if (more) h += `<details class="more" ${S.moreOpen ? "open" : ""}><summary>More</summary>${more}</details>`;
    } else if (p.kind === "monogram") {
      h += `<label class="field"><span>Initials</span><input type="text" data-k="letters" value="${api.escapeHtml(p.letters)}" data-max="${MAX_INITIALS}" autocomplete="off" spellcheck="false"></label>` + cutHint;
      // (what it does, measured: typed.js monogramHelp; kept up as the initials are typed)
      h += `<p class="hint" data-mono-help>${api.escapeHtml(monogramHelp(p.letters))}</p>`;
      h += `<label class="field"><span>Font</span>${S.fontSelect(p)}</label>${S.fontRow(p)}`;
      h += S.range("size", "Height", 15, 90, p.size);
      h += S.stitchSeg(p);
    } else if (p.kind === "motif") {
      h += `<div class="field"><span>Motif</span><div class="motifs" role="group" aria-label="Motif">${Object.entries(MOTIFS).map(([k, m]) => `<button type="button" data-motif="${k}" aria-pressed="${k === p.motif}" title="${m.name}"><svg viewBox="0 0 256 256" aria-hidden="true"><path d="${m.d}"/></svg></button>`).join("")}</div></div>`;
      h += S.range("size", "Size", 10, 120, p.size);
      h += S.seg("style", { fill: "Filled", outline: "Outline", applique: "Appliqué" }, p.style || "fill");
      // (rows one way across it, or rings that follow its outline)
      if ((p.style || "fill") === "fill") h += `<div class="field"><span>Fill</span>${S.seg("pattern", { tatami: "Rows", contour: "Rings" }, p.pattern || "tatami")}</div>`;
      if (p.style === "applique") h += `<p class="hint">Sews an outline, pauses for you to lay fabric on and trim it, then sews satin stitch round the edges. 50 mm or bigger cuts most easily.</p>`;
    } else if (p.kind === "letters") {
      h += `<label class="field"><span>Letters</span><input type="text" data-k="text" value="${api.escapeHtml(p.text)}" data-max="${MAX_INITIALS}" autocomplete="off" spellcheck="false"></label>` + cutHint;
      h += `<label class="field"><span>Font</span><select data-k="font">${APPLIQUE_FONTS.map((f) => `<option value="${f.family}" ${f.family === p.font ? "selected" : ""}>${f.name} (${f.note})</option>`).join("")}</select></label>${S.fontRow(p, APPLIQUE_FONTS)}`;
      h += S.range("size", "Height", 20, 120, p.size);
      h += `<p class="hint">Cut from fabric: the machine sews an outline, pauses for you to lay fabric on and trim it, then sews satin stitch round the edges. Letters 30 mm or taller cut and sew most easily.</p>`;
    } else if (p.kind === "frame") {
      h += S.seg("shape", Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, s.name])), p.shape);
      h += S.range("w", p.shape === "circle" ? "Size" : "Width", S.FRAME_MIN, 170, p.w);
      if (p.shape !== "circle") h += S.range("h", "Height", S.FRAME_MIN, 170, p.h);
      // (a zipper across a heart's lobes or a diamond's point makes no pouch)
      h += S.seg("border", Object.fromEntries(Object.entries(BORDERS).filter(([k]) => k !== "zip" || ["square", "oval", "circle"].includes(p.shape) || p.border === "zip")), p.border);
      if (p.border === "fancy") h += `<div class="field"><span>Line</span>${S.seg("trim", TRIMS, p.trim || "scallop")}</div>`;
      if (p.border === "applique") h += `<div class="field"><span>Edge</span>${S.seg("cover", COVERS, p.cover || "satin")}</div>`
        + (p.cover === "blanket" ? `<p class="hint">A blanket stitch leaves the fabric's cut edge in sight: use felt, or cotton with fusible web ironed on its back, so it doesn't fray.</p>` : "");
      if (p.border === "zip") h += `<p class="hint">A lined zipper pouch made in the hoop: the zipper, the front in two folded pieces, what goes on the front (the pieces below it in the list), then the back and one seam through everything. Fabric sizes are under “How to stitch it”.</p>`;
      if (p.border === "patch") {
        p.fill ||= NAVY;
        h += `<div class="field"><span>Fill thread</span><div class="swatches">${S.swatches(p, "fill")}</div><p class="hint"><span data-thread-of="fill">${api.escapeHtml(S.threadOf(p, "fill"))}</span>. The edge uses the Edge thread below.</p></div>`;
        // (what `carve` in pieces.js does, in plain words)
        h += `<p class="hint">Under a filled motif or big bold letters the fill is left out, so they don't sit on two layers of thread. Thinner letters sew on top of the fill.</p>`;
        // the expert fills, folded away: a stitch texture, and a second colour fading in across the patch
        h += `<details class="more" ${S.moreOpen ? "open" : ""}><summary>More</summary>${S.seg("pattern", Object.fromEntries(Object.entries(FILL_PATTERNS).map(([k, f]) => [k, f.name])), p.pattern || "tatami")}
          <label class="check small"><input type="checkbox" data-blend ${p.blend ? "checked" : ""}> Blend into a second colour</label>
          ${p.blend ? `<div class="swatches">${S.swatches(p, "blend")}</div><p class="hint">Fades from Brother ${S.machineName(p.fill)} to ${S.machineName(p.blend)} across the patch: one more thread change.</p>` : ""}</details>`;
      }
      if (p.border !== "patch") h += `<div class="field"><span>Quilting</span>${S.seg("quilt", QUILTS, p.quilt || "none")}</div>`
        + (p.quilt && p.quilt !== "none" ? `<p class="hint">Fills the frame around everything on it, in the frame's thread.</p>` : "");
      if (p.border === "ith") h += `<p class="hint">Two-sided, made in the hoop: an appliqué front, then the pieces below it in the list, then backing fabric under the hoop and a satin-stitch edge through everything. The steps are under “How to stitch it”.</p>`
        + `<label class="check small"><input type="checkbox" data-eyelet ${p.eyelet ? "checked" : ""}> Ribbon hole at the end (a bookmark, a tag)</label>`;
      // several of one in-the-hoop project at once: the same fabric steps, sewn together (`gang` in pieces.js)
      if (p.border === "ith" || p.border === "zip") h += `<button type="button" class="link" data-two-up>Make another in the hoop</button> <span class="hint">Copies it and what's on it beside it: both sew in the same steps.</span>`;
      // (made another before anything was put on the first: what's on this one copied onto the empty ones, placed alike)
      const bare = S.sameTargets(p);
      if (bare.length) h += ` <button type="button" class="link" data-same-on>Put the same on the other ${bare.length === 1 ? "one" : `${bare.length}`}</button>`;
      if (p.border === "applique") h += `<p class="hint">Sews an outline, pauses for you to lay fabric on and trim it, then covers the edge in satin stitch. The steps are under “How to stitch it”.</p>`;
    } else {
      // a design file is resized as Open a design resizes it: re-stitched at the new size (`resizeFile`), so it can
      // shrink with the words added to it (it could only be moved and turned: Fit to hoop shrank just the words)
      const pct = Math.round((p.scale || 1) * 100);
      h += `<label class="range"><span>Size</span><input type="range" data-file-scale min="${FILE_SCALE[0] * 100}" max="${FILE_SCALE[1] * 100}" step="1" value="${pct}"><output>${S.fileSize(p, pct / 100)}</output></label>`;
      h += `<p class="hint">${api.escapeHtml(p.name)}: ${p.pending ? "re-stitching it at this size…" : pct === 100 ? "its stitches exactly as they are in the file." : `made ${pct < 100 ? "smaller" : "bigger"} from its own stitches, spaced as closely as the file had them.`}</p>`;
    }
    if (p.kind === "text" || p.kind === "monogram") h += `<p class="hint" data-fit hidden></p>`;
    if (p.kind !== "frame") h += `<p class="hint warn" data-warn aria-live="polite" hidden></p>`;
    h += S.range("rot", "Turn", -180, 180, p.rot || 0, "°", 5);
    // (a patch has two: "Thread" under "Fill thread" read as the fill's own)
    if (p.kind !== "file") h += `<div class="field"><span>${p.kind === "frame" && p.border === "patch" ? "Edge thread" : "Thread"}</span><div class="swatches">${S.swatches(p)}</div><p class="hint" data-thread-of="color">${api.escapeHtml(S.threadOf(p))}</p><p class="hint" data-all-thread hidden></p></div>`;
    const old = S.drawnId === p.id && $("st-edit").querySelector("[data-warn]");
    const was = S.drawnId === p.id ? $("st-edit").querySelector(".font-row")?.scrollLeft : undefined;
    $("st-edit").innerHTML = h; S.drawnId = p.id; S.allThread(S.lastSteps);
    // (the font row keeps where it was scrolled to while the font in use shows there, else brings it into the middle: a
    // font picked from the list stayed out of sight in the row)
    const row = $("st-edit").querySelector(".font-row");
    if (row) { if (was != null) row.scrollLeft = was; S.showPicked(row); new ResizeObserver(() => S.showPicked(row)).observe(row); }
    // (lettering not worked out yet, after a font change: the warnings a moment later, after the preview, the last ones
    // kept up meanwhile; worked out here the menu held for 0.8 s)
    const w = $("st-edit").querySelector("[data-warn]");
    if (bulkReady(p) || !w) { S.warn(); return; }
    if (old) { w.innerHTML = old.innerHTML; w.hidden = old.hidden; }
    clearTimeout(S.warnTimer); S.warnTimer = setTimeout(S.warn, 300);
  }
  return { drawEditor };
}
