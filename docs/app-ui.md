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
  (`rove`). Undo skips equal snapshots; Redo ⇧⌘Z / Ctrl+Y. Ctrl+S / ⌘S focuses Download from anywhere (it was
  48-67 Tabs from the Words box); focus, not a save, so the button says what it will save or why it can't. 44 px coarse targets; `forced-colors` keeps thread
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
  dismissed); never over the focused control, nor over Download or Send whatever has focus (`toastPlace` moves it to
  the top: "Replaced your design…" sat on both for 15 s); a failure from a tap is a toast, `#error` only for what's wrong with the design. View menu stays open for ticks/Background.
- Sew sheet (`sewSheet`: `#sheet` + `window.print()`, also on `beforeprint`): field at 1:1 in mm, centred as the
  machine centres, 5 cm bar; steps with machine names (`machineThreadList`); appliqué shapes. Cut files (any design with
  fabric shapes: appliqué, in-the-hoop fronts): "Cricut cut file (SVG)" `cutSVG` (width/height in mm, viewBox in mm:
  Inkscape's form, which Design Space reads at size) and "Silhouette cut file (DXF)" `cutDXF` (R12 ASCII, closed
  POLYLINEs in mm, y up; Silhouette Studio's free edition opens DXF, not SVG). DXF keeps no size, so the file name
  carries it (`_cut_169x54mm`). Both judged in gate.js; ezdxf (in .venv) reads ours at size. Verify with headless `Page.printToPDF`, never the real print dialog via the Chrome extension (it blocks).
- Cut files are exactly the shapes' size (no margin), named by `cutName`, upright as the design reads (`sheet.upright`,
  never the machine's turn); gate.js refuses a size/name mismatch. Its toast, titles and the download dialog say it's
  for the cutting machine only (`NOT_SEWN`): a tester copied it to the USB stick with the .pes.
- Sew along (`#along`): a step per screen, minutes = stitches / 550, own Have ready, Screen Wake Lock (retaken on
  visibilitychange). Its first screen has "How to hoop it, and which needle" (`hooping`): how to hoop (bare
  stabilizer for an in-the-hoop design), the design's own notes that are about hooping or the needle, else a
  general needle line. Share text carries the steps (`shareText`). On my item (`#item`): a measured photo under the
  design at true size (`state.backdrop`), never uploaded or saved.
- Offline and one release at a time (`sw.js`, cache `needleworks-vN-<set>`): `FILES` lists every file with its
  SHA-256 (`node tests/sw.test.mjs --write`); add every new file there. Install fetches each past the browser's own
  cache and keeps the release only if every file is its copy; the page's own files are then served from that set
  alone (anything else, a test page, from the network); Google's text fonts are network first, the cached copy after
  3 s. A new release waits: app.js offers "A new version of Needleworks is ready. Reload", and the worker takes over
  on that (`activate` message) or when every tab is closed. https only (`?sw` on 127.0.0.1 for tests/upgrade.sh).
  Share target: POST `./?share` -> `needleworks-shared` cache -> `./?shared` -> `route()`.
- Work off the page (`js/jobs.js` `jobQueue`): one queue per worker (pictures x2, the doctor's fixes, re-stitched
  file pieces, quilting and carved fills): one job at a time, only the newest waiting (`stale`), a worker that dies
  or can't start answers `died` and is replaced. Time limits: pictures 60 s, doctor and file pieces 90 s (`slow`);
  quilting none (it's part of the file: stopped, it would be worked out on the page, frozen for longer).
- First load: `#busy` is in the page's own markup saying "Getting ready…" (setMode takes it down), then the first
  design says "Getting the lettering ready…" until it's made (`waitSaid`); `.busy` hides `.empty`. Before, a slow
  first load showed an empty preview, then "Nothing to stitch yet" while the font came. Measured on the slow-phone
  profile (`cdp.mjs slow`: 400 ms, 50 KB/s, CPU 4x) it is all download: every byte asked for before the first
  preview is 20 ms of waiting, whatever its order, so the only cuts are bytes not sent.
  - The Picture and Open tabs' code (picture.js, opened.js, digitize.js, palette.js: 65 KB of 441 gzipped) is not
    in the first load: app.js `tabCode` fetches it when the first design is on screen, or at once when one of those
    tabs, a dropped, pasted or shared file asks (the tab shows "Getting ready…" meanwhile). Nothing the Design tab
    runs may import those four again (`sw.test.mjs` fails). What the page does for every tab (the drop and paste
    handlers, skip links, `fillMachines`, `brandUI`) is in app.js.
  - index.html lists the first screen's modules as `modulepreload` links (written and checked by `sw.test.mjs`
    from app.js's imports), after the stylesheet and `fetchpriority="low"`: at the default priority the 51 of them
    shared the line with the stylesheet and the page stayed blank for 4-8 s; now it paints at 1.6 s.
  - The first design's lettering font is asked for by a line of script in the page (the saved design's fonts, or
    the first starter's), not when the scripts are in. The offline copy (sw.js) and the other fonts start after
    the first preview: both took the line from it.
  - The page's own text faces (Google Fonts, 109 KB) come after the first design on a first visit (owner's
    choice, 2026-11-11): index.html's `nwFonts` adds their stylesheet when app.js `uiFonts` asks, alone for up to
    5 s (the font list's 17 lettering fonts and the starters' wait for them: ui.js `facesOn`; behind those the
    text changed face at 31 s, now 16.8 s). A visit that has had them (`nw:uifonts`) writes the stylesheet into
    the page as before, so later visits and offline ones never show the stand-ins. Until they arrive the text is
    in css/app.css's stand-in faces (`NW Body A/R`, `NW Display A/R`, `NW Mono`: Arial or Roboto set to the final
    face's width with `size-adjust`, and to its line with the ascent and descent overrides). The swap measured:
    layout shift 0.0000 at 390 px and 0.0002 at 1413 px; of 157 elements none moved up or down or changed height,
    the widest sideways move 7 px bar one link at a line's end. Lettering is never drawn or stitched from a
    stand-in: only `--body`, `--display` and `--mono` have them. `ui_sweep --standin` sweeps the page in that state.
  - Measured (local server with gzip and HTTP/2, three runs each): first paint 4.0 -> 1.8 s; first preview 17.7 ->
    14.1-14.2 s; the text changes face once at 16.8 s. Desktop, first visit: preview at 0.4-0.5 s, the faces at
    1.1-1.4 s; later visits as before. What is left before the preview: scripts 376 KB, Great Vibes 158 KB,
    Sacramento (the wordmark) 31 KB.
  - Not done, each the owner's call: the scripts without their comments (a third of their gzipped bytes, 2.7 s:
    a release step, and the site has none); a lighter font for the first starter (Great Vibes is the heaviest
    script font; it changes the starters). Small and left: brandcharts.js (16 KB) only for a chosen brand,
    doctor.js's fixes (13 KB) apart from its counts.
- "Make another in the hoop" is also among the preview's links (`#another-open`, a lone upright in-the-hoop
  project): on a phone the one under the starters is 1,475 px down.
- A long line too big for the hoop is offered on two or three lines beside Fit to hoop (`hoopLines`: at its own size
  where that lands, else the biggest that's a quarter over what Fit to hoop leaves). Each line count is tried in a
  task of its own after the note is up, and not at all where the one line's box says it can't fit: the words on new
  lines are drawn for the first time there (0.2-0.4 s), and both at once held "long line set" 850 ms. "+ Motif" (or any piece) on a
  full in-the-hoop project offers the biggest thing on it a tenth to four tenths smaller, where that makes room and
  lands (`noRoom`).
- A hoop change drops other tabs' designs. Min/max over stitches uses loops (`Math.min(...pts)` overflows past ~110k).

### What the v27 tester round changed (2026-11)
- What a control says is read from what is sewn, the same way the builder reads it. The Automatic stroke label asked
  whether the words were thin as one joined line; the file sizes straight lines by the first line (`sewsThin` in
  problems.js: "Automatic: thin line" stood over a satin file at 6 mm). The names batch and the problems list use it too.
- Zoomed in (over 1.2x), a drag slides the view unless it starts on the piece already selected; a tap picks a piece
  at any zoom (`studio.pick`); the slide is held so the fitted view's middle stays on the preview. (A tester zoomed in
  to read small lettering, dragged, and moved the letter under her finger off the design.)
- A choice that changes nothing in the design is not an Undo step and says what it did: My machine with the same
  hoop keeps the hoop picked and says "Set for the …". Fit to hoop says how much bigger or smaller, with Undo.
- The opening sample, untouched, is fitted when a smaller hoop is picked (no red "Too big" on a design she didn't make).
- An opened file's copy keeps the machine names the file came with: where its chart colour and its palette entry
  disagree, the copy is written from the palette's colour (`ownPalette`; ufront.pes resized read Light Lilac for Lavender).
  A caution in the checkup is a note, never a tick.
- Picture, Small details: its notes sit under the control, a sentence each. One word per thing: a speck is a small
  piece on its own (left out or kept), a dot is colour inside a bigger area (always sewn in that colour). "Show them"
  sews the picture once more with specks kept and rings what only that has (`v.marks`, render.js `marks`). A new
  picture starts from "Leave out specks". A busy picture (150 cuts or more) says its stitches and pieces and offers
  fewer colours.
- The loose-threads chip comes second in the row, and a phone's one-line row fades at its right edge.
- The file's name: appliqué letters count with straight words (the biggest names it); the Rename dialog says the rule.
- Sewing words explained where first used (words.js `GLOSSARY`): basting, floating, fusible web, cutter file, tacking
  down, satin, wt.
- Long read-outs go under their slider (`.range.wide`): beside it an opened design's size slider was 4 px wide.
