# Lettering (`text.js`, `raster.js`, `pieces.js`)

Reference for this part of Needleworks: the rules, the reason for each (it stops someone undoing it) and the number that proved it. Hard rules are in `AGENTS.md`. Add a lesson where its topic is, never as a round log.

- `renderWord` draws on a canvas (`fontKerning = "normal"`), adds swashes, bridges letters the font leaves unjoined
  (Sacramento A→s), skeletonizes; `skeletonEdges` builds the stroke graph and prunes spurs; `order()` walks it: each
  stroke a centre run out and a satin back, every forward run satined exactly once, no jumps inside a connected word.
  Each walk ends where it began, so moves between print letters are trims whatever the order. Script pieces are
  chained by `order(edges, near, loose)`: a walk may start at any node or mid-stroke, a DP picks the starts with the
  fewest costed moves; print letters and pictures keep the leftmost start. Moves are measured where they are sewn:
  bent text (arch, wave, bridge) hands `letters` its bend (`warp`), and `order(..., at)` reckons each start there
  (reckoned flat and kept only if no dearer once bent, arched script left a piece far from the next one it passed).
  Satin columns carry `reach` (half width + 0.1 mm) so `Design.path`
  stitches to a start under the column instead of jumping (knit's 2.05 mm half-width: 8 trims round one junction).
- Script pieces are sewn in one go when their columns are at most 0.5 mm apart (`linkReach`, numbers in recipes.js
  `LINK`: centre lines within column + 0.3 pull + 0.5, at most 2.2 mm, or the next start under the last column; a
  fine line 1.8 mm), and `stitchLetters` gives the next piece's first stitches the `reach` to be stitched to from the
  last column's edge (handed on past a dot's skipped run; a towel's lattice takes it over). Before, half the column
  was taken off 1.5 mm: only centre lines within 0.2-0.8 mm were chained and none from 2.4 mm columns up, so touching
  pieces were trimmed apart. Arcs and ovals: 513 -> 442 trims, 52 -> 13 wasted moves, 7 -> 3 loose threads; bookmark
  names 641 -> 625 trims. What flow_lint still calls a loop there is a gap of 1.5-2.3 mm between columns, a thread
  you would see: left trimmed. Print letters never link (`gap`).
- Where the columns' own widths at the two points are known (`order` col: a script's column, which follows the
  ink once it is 2 mm wide), two pieces are stitched across when their centre lines are no further apart than half
  of each column, 0.3 pull and 0.9 (`LINK.open`), up to 3.6 mm (`far`). `order` marks the piece (`link`, the ninth
  entry of a part) and `stitchLetters` gives it the reach, so the two never disagree. An Allura T at 20 mm, its
  stem's end 0.63 mm from its bar by the stitches but 3.08 mm by the centre lines (a column is sewn out to the
  ink's end, past its centre line's), was trimmed apart: a 16 mm move inside one letter (a digitizer on v27).
- Marks (`order`: a piece shorter than two and a half dots, clear of every other piece by three quarters of a
  column, and wholly above the letters: an ë's dots, an accent) are never stitched one to the next: the dots of
  "Zoë" in Great Vibes at 19 mm, under 2 mm apart, were sewn across and read as "Zoē" (tester, v27). A jump under
  5 mm between them would lie there as the same bar (the machine doesn't cut it), so a mark is sewn a little
  earlier or later, or last, wherever that makes every move long enough to be cut; only where that leaves fewer
  loose threads. A dot is still stitched to from its own letter where near enough, and a full stop from the
  word's last stroke: jumped to as well, every i in a small word cost a trim and two locks on a 1 mm dot (arcs and
  ovals went 444 -> 468 trims that way). Batch cases: `st_marks_<font>` (every script font), `st_marks_small`.
- Underlay under a script column: a centre run below `LETTERS.zigzagFrom` (cotton 2.0 mm, knit 1.5), a zigzag 0.4 mm
  inside each edge from there. A big script's column, as wide as the ink, has the zigzag too, as wide as the column
  is there less 0.8 (a centre line through its hairlines). Until S2 it was 2.5 mm on cotton and a centre run only
  under any column that follows the ink (Allura at 20 mm: 2.2 mm columns on a centre run).
- Print letters on a knit or a towel are sewn as read (`letters` asRead), whatever loose threads that leaves: the
  skip order sews the letters between ones already sewn, and on a fabric that gives under the needle the second
  pass can sit off the first's baseline. On stable fabrics the skip order stays (no loose threads to snip).
- Known, not done: lines of one piece are each sized to the first line's x-height, and a line of digits or capitals
  counts their full height as its x-height, so "2026" under "Made with love" comes out a third smaller (and at 9 mm
  as a fine line under satin lines).
- Print letters (`order(..., { whole, skip })`): each move between letters is a trim (over 5.5 mm + half a column
  between starts) or a loose thread to snip, never a stitch. Two things keep them trims: a letter may begin partway
  along a plain stroke (every half mm or tenth of the x-height; a stroke with a taper, a shaped end or sides is only
  begun at its ends, `whole`: those are measured along the whole stroke), and where the letters sewn as read would
  still leave loose threads (narrow letters: i, l, 1, a full stop, each within 5 mm of the last whatever the start),
  every second or third letter is sewn first and the ones between after (`skip`), so every move is long enough for
  the machine to cut. The order as read is kept whenever it leaves none. Small print (4 files): loose threads
  27 -> 0, trims the same 106, travel 780 -> 1,511 mm; caption starters 12 -> 5. flow_lint's "loop" on print letters
  sewn as read (a point of the letter within 2 mm of the next start) is the price of not stitching across: it is
  not a move to remove.
- The two dots of an ë are 2.7 mm apart end to end: a loose thread (v25 stitched across them by a 2.0 mm fluke, a
  bar joining the dots). Left.
- What `order` is told so its moves are the sewn ones (`how`): the starts tried along a stroke are 0.35 mm apart at
  most and never leave a half shorter than a dot (it would be sewn as a second dot); a lone short stroke is a dot,
  entered at the far end from its start and as long as it is sewn (1 mm satin, 0.7 mm line); a move is a loose
  thread up to 5.5 mm + half a column between centre lines (the needle leaves from the column's edge), and where
  every start leaves one the longest is taken, script as print.
  Strokes count as at least half the x-height when sizing (a whole x-height for marks alone: "." was sized
  5.9e12 mm). Punctuation drawn into a letter is moved clear (`apart` in text.js: up/sideways above the letters,
  sideways among them, else shaved if most survives); swashes never leave from a mark. Lettering drawn before
  its font loaded is never cached (it's the fallback font).
- Swashes (lead-in, tail): one calligraphic stroke from the letter's stroke end along its tangent, a shallow cup
  under the baseline, a flick up. E, O (no low entry) join at their lowest left point. Never flat along the baseline
  (reads as a ruled line).
- Swashes are typed: `~` at the start/end of the words (`swashes`/`unswashed`/`withSwash` in typed.js; spaces beside
  it ignored; one in the middle is the font's tilde). `letters()` strips them per call, so each straight line has its
  own and arches/waves/bridges take the first line's start and the last line's end; script lead 1.8 / tail 2.6
  x-heights, print dashes 2.2 (`SWASH`, the old bookmark's). Sized by the letters alone (`info.firstX..lastX`), so a
  name keeps its size with or without them; kern entries for the `~`s are dropped. Labels, step text, file names and
  names batches read `unswashed`; each batch name inherits the design's ends. Editor: "Swash/Dash before/after"
  toggles (`data-swash`) that add or remove the `~`.
- Print fonts (`print: true`): no bridges (the machine trims between pieces); decorations are dashes on the middle of
  the x-height (cap height for all-caps); spur pruning 0.45 strokes (script 1.3) so t bars and a stems survive; dots
  get a short stroke (`dots`); stroke ends reach the ink's edge (`reachEnds`; thinning stops half a stroke short and a
  single-storey a sewed as o), sized from the strokes before that (`info.sized`). Separate pieces always jump (`gap`;
  an i stem came within 2 mm of its dot and was stitched to it.
- Skeleton work: `tongues` keeps short script ends (an e's tongue, a y
  tail); `knots` contracts edges under 0.75 stroke between junctions (each was a star of satin); `untangle` caps
  merges at 2.4 knot lengths. Print corners: self-loops under one stroke dropped; a corner stroke is sewn as wide as
  the ink less (stroke - satin) / cos(angle), stopping at 0.4 mm (`wAt`); in Thin line strokes run on to where centre
  lines meet (`pointed`: an A read as Y). Ends are `decurl`ed and cut on the font's end line (`endShape`/`endCut`);
  sides stay within 0.15 mm of the ink (`sideClip`). Measure on the engine's mask with locks, not an image overlay.
- Satin width: `min(3.5, 0.2 xh, max(stroke, 0.12 xh, min(0.15 xh, 1.2)))`. Automatic: satin from 0.8 mm, fine line
  below (loops stay open); explicit Satin at least 1.0. (15 % of big x-heights filled thin scripts' e's; satin only
  from 1 mm sewed 20 mm script names as a thin line.)
- Column width now: `min(0.2 xh, max(min(3.5, max(stroke, 0.12 xh, min(0.15 xh, 1.2))), min(stroke, WIDE = 5)))`: only a
  font's own stroke takes a column past 3.5 mm (60 mm Quicksand was a skinny 3.5). Not 6: the checker reads satin
  over 6 mm as underlay ("sparse satin"). A run out of the node the last column came back to carries `reach` (wide
  columns trimmed at every junction without it). Print letters are chained with `order(..., nodesOnly)` preferring
  moves over 5.5 mm + half a column (trimmed) or else the longest: loose threads 75 -> 7 over the changed batch files.
  Monograms: a lowercase descender (g j p q y) is sized by its x-height and hangs below a shared baseline (`hangs`,
  `initialSizes`), the whole capped at 1.25x. `decurl` straightens a curl into a flared end (Josefin Z).
- Counters: `counterPockets` measures gaps between centre lines; `counterCaps` narrows the strokes round one that
  would close (0.8 mm between needle points after pull; gaps under 0.6 mm left), `notchCaps` loose short strokes down
  to 0.8 mm. Explicit Satin and towel ignore both. `loopsFill` warns when auto satin still closes a loop (switching
  those to a fine line left names thin at 28 mm).
- Satin spacing 0.38 (40 wt), 0.34 under a 6 mm x-height (sewn for 60 wt; "Small letters" tip: 60 wt, 65/9-70/10
  needle), 0.42 knit, else `THREADS[wt].satin` (+0.04 knit). Pull 0.15 mm a side from 1.5 mm satins, 0.05 below (more
  closes counters); knit +0.15. Underlay: from 2.5 mm (knit 1.5) a zigzag (width - 0.8, 2.5 mm) as the walk's way
  out, else a centre run. Satins start from the stroke's centre point and the underlay ends there (starting on the far
  edge put back-to-back satins 2.4 mm apart: a jump each).
- Fine line: bean stitch with `followRun(p, 1.6, 0.1, 0.8)`, points at least 0.4 mm apart (`spaced`). A lone stroke
  under 0.9 mm (full stop) sews 0.7 mm out and back once. Satin dots: one satin at least 1 mm long, no run under it.
- Layout (`textRows`): up to 3 lines at the first line's x-height; `align`, `leading`, `spacing` (print only:
  pulled-apart script came out unjoined), `wave`, `bridge`, `flip` (not in the cache key). Letter pairs `kern` (print
  only) add to the font's kerning; `rekern` keeps them across edits; `overlapping` warns.
- Arches: an ellipse (`radius`, optional `ry`), letters spaced by arc length; `followFrame` sits inside an earlier
  circle/oval/scallop. `archTight`: letters reach inside over 0.8 x the tightest radius of curvature, or an up arch's
  letters exceed 0.6 x its radius; script arched up keeps x-height at most 0.24 x radius. `archFit` grows the arch,
  `archRoom` flags over 55 % of the curve (widen to 45 %), `archShrink`, `archStart` (~30 % round). Words wrapped into
  themselves block Download.
- Monograms: print ones spaced by their stitches in 0.5 mm bands (gap + 0.4); in a frame they fit both ways
  (`fittedSizes`, 0.92 of the frame less half the gap); `monoSize` grows only while clear of the frame; checks run per
  initial (`eachInitial`). Initials take 12 characters; a name there gets "Sew it as lettering" (`asText`).
  `initialSizes` sizes side initials by ink (`inkK`: ink height over sized height) against the middle (or first of
  one or two); centre lines stop half a stroke inside flat tops but reach pointed tips, so Josefin's W was 1.26x its P,
  not 1.5x. Tail letters (`hangs`) untouched. Josefin's W crossing its middle strokes is the font's own.
- Big script (column 2 mm or more) follows the ink's thick and thin (`inkWidths`, 35th percentile over ±1.2 strokes)
  from `THIN` 1.2 / 0.45 x column up to min(WIDE, 0.2 xh, the counter cap); strokes under 4 columns never narrower than
  the column; centre-run underlay; `reach` takes the previous column's width (without it +19 loose threads at 40-60
  mm). A lone dot is a round satin as wide as its ink (Great Vibes j at 60 mm was a 1.4 mm tick); raster: an oval dot
  (a > 1.25b) is stroked along its long axis, a small full blob that thins to a star, ring or bars is one dot.
- Fonts: `@font-face` families `NW <Font>` (WOFF2 in `fonts/`), `document.fonts.load()` before drawing; a failed
  font stays failed until reload, so `loadFont` adds a second FontFace (Try again). `glyphs.js` = each font's
  characters (regenerate with `tests/make_glyphs.py`); `typed.js` `lacks` is the only glyph check, by grapheme, NFC
  and NFD alike, used by the editor, Download note and names batches. Per-font `min` x-height feeds `minSize` (default
  4 mm). Fonts after Meow Script are free lookalikes of embroiderydesigns.com samples (`note`). Try a font in
  `tests/browser/fonts.html?name=<word>`; reject unjoined or spurred ones (Petit Formal, Comforter, Damion).

## Own fonts (`js/studio/ownfont.js`)
- The maker picks a .ttf or .otf from their device (Font list, last entry). It is read in the page and never leaves
  it: the browser draws it through a `FontFace` exactly as it draws the bundled fonts, so the lettering engine needs
  nothing new. The family is `Own <name>`; the entry in `FONTS` has `own: true`, and `print: true` unless most
  lowercase letters reach their own advance width (a script's joining strokes: Pacifico 1.0, Dancing Script 0.96;
  Abril Fatface 0.62 and sans fonts about 0.1 are print; the line is 0.8).
- The file's own tables give what the browser can't be asked: the name (`name`), the letters (`cmap` formats 4, 6,
  12, registered with `glyphs.js` so `lacks` works as for bundled fonts), and the shapes (`glyf` outlines, or CFF
  Type 2 charstrings for .otf) measured along scanlines of n o u h m e d b p l: stroke width against the x-height,
  the thinnest strokes, and how many lines a stem is drawn with. Written from the OpenType and CFF specifications.
- What the maker is told, under the font row: an outline or inline font (1.6 or more lines per stem: Monoton 4)
  sews busy and thin; a bold one (stroke over 0.3 x-heights: Abril Fatface 0.39) comes out lighter, since a satin is
  at most a fifth of the x-height; a high-contrast one loses its hairlines; and the height from which the letters
  are satin, not a single line (0.8 mm satin). Refused in plain words: .woff/.woff2, .ttc, files that aren't fonts,
  fonts with fewer than 40 of A-Z a-z (symbol fonts), files over 10 MB, more than 8 fonts.
- Kept for the next visit and offline: names in localStorage (`nw.ownfonts`, read as the module loads so a saved
  design keeps its font), files in IndexedDB (`needleworks-fonts`). Until a file is out of IndexedDB its family has
  an unloaded stand-in face: `document.fonts.check` is true for a family the page has never heard of (Chrome), and
  lettering would have been drawn and stitched in the fallback font. `loadFont` waits for the real one (`fontWaits`).
- Limits: no kerning or ligatures beyond what the browser applies when it draws; a variable font sews at its
  default weight; a design saved to a file and opened where the font isn't kept falls back to the default font.

