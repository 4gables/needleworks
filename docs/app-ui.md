# App and UI

Reference for this part of Needleworks: the rules, the reason for each (it stops someone undoing it) and the number that proved it. Hard rules are in `AGENTS.md`. Add a lesson where its topic is, never as a round log.

- Opens on `#design`; default name Ashley.
- Side by side needs 700 px wide AND 560 tall (200 % zoom on 1080p is 960x540); then 100dvh, only `.controls`
  scrolls (`position: relative`). Tiers: max-height 900 hides ledes (not `.sewn-on` tips); 700-1365 x 560-760 slimmer;
  header tabs wrap to 1259 px, no MACHINE label to 1365, no tagline to 1480. Stacked layouts scroll, preview first in
  the HTML (Tab order). Every stacked layout (`(max-width:699px),(max-height:559px)`) has the fixed Download bar (in
  Picture/Open it holds the chooser too) and `scroll-padding-bottom` so focus stops above it; the Download warning
  sits under the preview; phones: preview `calc(100svh - 370px)`, too-big message under the hoop and in the piece
  controls (`#st-big`). Body `overflow-wrap: break-word`, settings grids `minmax(0,1fr)` (long words never widen the
  page). Chrome doesn't scroll a sideways chip row to a Tab-focused chip: app.js does. Check 1413x717, 1024x600, 960x540, 820x1180, 800x600, 390x844.
- `draw` opts: `center`, `upto`/`ghost` (step view), `pad`, `padBottom`, `corner`, `boxes`, `real`, `base` (a drag
  holds the fit via `state.hold`, or the piece outran the pointer). Dark mode fills the field light (`fieldColor`).
  Thickness overlay (`heat`): 12+ yellow, 18+ orange, 24+ red.
- Focus: file inputs `.sr-file` (hidden but focusable). One MutationObserver in app.js (`refocus`, `held`): a redraw
  that removes the focused control focuses the same control in the new markup (id/data- attributes, caret kept), else
  a keyboard user's focus goes to the nearest live control; keyboard-or-not comes from the last real keydown/
  pointerdown (`keyboard`/`keyAt`), never a click's `detail`; for 2 s after a key the focused control is kept in view.
  `keepFocus` = render + `refocus`. No per-feature focus fixes. Arrow nudges only from the page or `#view`; the piece list is one Tab stop
  (`rove`). Undo skips equal snapshots; Redo ⇧⌘Z / Ctrl+Y. 44 px coarse targets; `forced-colors` keeps thread
  colours; `--danger/--warn/--good/--ink` tokens (red only for warnings).
- Focus when a control is gone with no replacement: `refocus` takes the control in its place in the new markup
  (child-index path) or the next in document order, one task later (after async warnings); the container's first
  control was the Words box after every one-tap fix. View menu closes on focusout, Escape, outside tap, a checkbox;
  the Background select keeps it open.
- Preview: `draw` edges a thread whose contrast with its ground is under 1.6 (`groundOf`: cloth, `fieldColor`, else
  the computed background; white on white was unreadable); `{ sel }` draws a dashed box round the selected piece
  (`studio.selBox`; off in step view, playback, two hoopings). `showEditor` brings the editor into view. Phones:
  `#bar-undo` in the Download bar; `.link` in running text keeps its line (target grown by a ±6 px `::after`).
  `.font-row` shows each font name in its own lettering (the select stays the keyboard's way).
- Exit gate: every file leaves through `gate.js` `handOut(files, { hoop, zip, share })` (`judge`: PES = `validatePES`
  against its design + no `HARD` rule, the rest of the verdict said in words; cut SVG = mm size, closed shapes; saved
  JSON parses with a piece). Nothing is handed over when one file is refused; a HARD fail says "Not saved" and offers a
  fixed copy; a names ZIP lists refused names under "Couldn't make". `setView` runs quality.js 250 ms after a view
  settles; the done dialog says "Checked" only when it passes, even after "Don't show this again" (`doneSeen`).
- Steps (sheet.js): step 1 = how to hoop, which thread, Start; steps name the thread (`threadNames`/`nextThread`); a
  same-thread pause says "Keep the same thread on"; one sentence per action, three or more numbered (`youHtml`).
  Words (`words.js`): "pause"/"thread change" (`stopWords`/`stopsAt` only), never "stop"; "satin stitch(es)"/
  "satin-stitched"/"Satin border", never bare "satin"; "move between parts"/"loose thread", never "jump" (except
  the machine's "jump stitch not to trim").
- Turned-hoop note `turnedNote(bare)` (sheet.js): `compose` returns `bare` when step 1 hoops bare stabilizer, then it
  says hoop the stabilizer and lay the fabric a quarter turn round (it said "Hoop the fabric"). `tidySteps`: a repeated
  sentence -> "on both <frame>s" / "(N of them)"; "put the hoop back" + "Take the hoop off" -> "...if it's still on".
  Fabric over an outline: "reaching ½ in (1 cm) past the outline all round", or a piece cut with the Cutter file laid
  exactly on the line (Have ready and the dialog mention it). Ganged ITH: `kit(n, all, W, H)`, stabilizer etc. once.
  Time = `sewMinutes`: stitches/550 + 6 s per cut trim + 0.5 min per pause. Sew sheet prints threads brighter than
  0.8 in colour over a 0.6 mm #555 line (`pale`). "Add words" resets fabric to cotton.
- A step's `you` is what you do before it sews, ending "Press Start"; work owed after the machine sews (trim after a
  tack-down) goes on the stage as `then`, said at the next stop (`trimsFor`). Every step after the first leads with
  "Change to the next thread" or "Keep the same thread on". Step 1 starts with `pickIt(file)` + `THREADING`. Sizes via
  words.js `measure`/`inches` (whole cm from 10, inches in eighths, rounded up for fabric). Newcomer words (stabilizer,
  topper, loose thread) explained once per surface (`GLOSSARY`/`explained`; sheet.js `told()`). A starter's `float`
  (bib) overrides the fabric's hooping. Lettering split from one piece carries `of` and names the file as a whole.
  Sew along shares height 1:1.2 between preview and words (content-sized rows zoomed the preview).
- Every size a user reads comes from words.js (`measure`/`measure2`/`inchFirst` supplies, `mmText` design sizes):
  the second unit from the first as shown, inches in eighths (sizes_lint). Non-action sentences (THREADING, glossary:
  `ASIDES`) ride with the action before, never numbered. Hand actions before "put the hoop back". When it's done names
  the loose threads (`snipsSaid`). A patch frame's colour is "Edge thread".
- Toasts: one `toast()` in app.js (studio `api.toast`), one timing rule (3-8 s; an action's stays until used or
  dismissed); never over the focused control (`toastPlace` moves it to the top); a failure from a tap is a toast, `#error` only for what's wrong with the design. View menu stays open for ticks/Background.
- Sew sheet (`sewSheet`: `#sheet` + `window.print()`, also on `beforeprint`): field at 1:1 in mm, centred as the
  machine centres, 5 cm bar; steps with machine names (`machineThreadList`); appliqué shapes. Cut files (any design with
  fabric shapes: appliqué, in-the-hoop fronts): "Cricut cut file (SVG)" `cutSVG` (width/height in mm, viewBox in mm:
  Inkscape's form, which Design Space reads at size) and "Silhouette cut file (DXF)" `cutDXF` (R12 ASCII, closed
  POLYLINEs in mm, y up; Silhouette Studio's free edition opens DXF, not SVG). DXF keeps no size, so the file name
  carries it (`_cut_169x54mm`). Both judged in gate.js; ezdxf (in .venv) reads ours at size. Verify with headless `Page.printToPDF`, never the real print dialog via the Chrome extension (it blocks).
- Cut files are exactly the shapes' size (no margin), named by `cutName`, upright as the design reads (`sheet.upright`,
  never the machine's turn); gate.js refuses a size/name mismatch.
- Sew along (`#along`): a step per screen, minutes = stitches / 550, own Have ready, Screen Wake Lock (retaken on
  visibilitychange). Share text carries the steps (`shareText`). On my item (`#item`): a measured photo under the
  design at true size (`state.backdrop`), never uploaded or saved.
- Offline (`sw.js`, `needleworks-v12`): precaches `FILES`, network first, cache after 3 s; add every new file to
  `FILES`. https only. Share target: POST `./?share` -> `needleworks-shared` cache -> `./?shared` -> `route()`.
- A hoop change drops other tabs' designs. Min/max over stitches uses loops (`Math.min(...pts)` overflows past ~110k).
