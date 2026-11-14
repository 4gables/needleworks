# Pictures (`digitize.js` in `worker.js`)

Reference for this part of Needleworks: the rules, the reason for each (it stops someone undoing it) and the number that proved it. Hard rules are in `AGENTS.md`. Add a lesson where its topic is, never as a round log.

- Looks like the picture (roadmap PX0): `picture_corpus.sh` renders every file as thread and scores it against the
  picture (colour, shape, outline, detail, structure; 0-100), per kind (logo, cartoon, mascot, sticker, line art,
  watercolour, pet photo, gradient, flat illustration, and the corpus's own drawings, shapes and photos) and style,
  against `tests/fixtures/look.json`. A picture round is better when its kinds' look rises and the stitch numbers
  beside it don't get worse; what each part means and how to read it: `docs/testing.md`. The AI-style art is drawn
  in `tests/browser/art.js` (ours to commit); `?ext=etsy_N` pictures get a look on their line, outside the baseline.
- One job at a time, newest kept; restarted after 60 s. Styles: Filled (`build`), Line drawing (`lineArt`),
  Cross-stitch (`crossStitch`). No fabric selector: density is the only fabric knob.
- Colours are learned once per picture (`learnColours`, `LEARN` 800 px copy of the content box) and labelled onto any
  working image (`labelWith`): Size and Turn never change threads (`analyze` = both, for the batch).
- Palette: `FINE` 24 k-means clusters on flat pixels, background shades set aside, merged pairwise, cheapest first, to
  the count asked and on while under `SAME` 7 (CIEDE2000, hue weighted, darks below L 30 read black, non-solid groups
  cheap, cross-family dear). Each count = the next with one split (more colours never lose one). Default 6
  (`DEFAULTS`). Worse: kL 2 (stems into leaves), 16 clusters, folding slivers into neighbours. `findFrame`: an edge band
  of one colour family is a frame; learned again without it.
- The background is by position, not colour (2026-11, a tester's white lettering and white diamonds went unsewn
  with nothing said): only the background's colour that the picture's edge (or a frame, or see-through) reaches is
  fabric (`labelWith`, a flood from the edge). What the design closes in is a colour of its own (`inside`, the
  background's thread; or the design colour that already has that thread) and is sewn in Filled and Cross-stitch; a
  line drawing leaves it. Pieces that are dots (under 1.5 mm², or under 4 mm² and 2.5 mm across: the hole in a small
  e) or nowhere 0.6 mm across stay fabric, and a fleck of it is never folded into the colour round it (the letter's
  hole would fill with the letter's thread). It takes no turn in the alternating row angles (counted, a logo's navy
  turned 90° and its apostrophe fell under the 8 mm lone-piece rule). The page says which white is fabric and which
  is sewn, with "Leave it out" / "Sew it" (`state.pic.inside`). Tried and dropped: sewing it only where the ink
  round it is at least as thick as the piece (a white star in a red ring was left out, and bouquets still gained
  white). Known cost: the hole of a big O, the inside of an outline and gaps in a bouquet are sewn white until
  tapped off.
- The Thread colours count is every thread sewn, the closed-in colour included (owner, 2026-11-13: a BYU logo at one
  colour came out Ultramarine and White, at two Prussian Blue, Cornflower Blue and White). `learnColours`: when the
  design's own colours fill the count and 0.2 % or more of the learned copy is closed in, the design learned one
  colour fewer is taken only if what it lost is a near-duplicate shade (`NEAR`, ΔE00 under 15 to every colour kept)
  or a blend of two colours kept (under 30; BYU at six learns Black and Dark Gray from soft edges). Else the model is
  `spare`: the closed-in colour stays fabric and the page offers "Sew it in white too (N + 1 threads)" (`inside`
  "all"; "auto" is the default, "none" is "Leave it out"). One colour is always `spare`. On the 9 samples at 1, 2,
  3, 4 and 6 colours: threads sewn never over the count (before: one over in 44 of 45 settings); the white sewn
  where a shade gave way (e.g. etsy_8 at 6, etsy_6 at 3). Worse: one colour fewer whenever white is closed in,
  whatever was lost (red text sewn purple at 3 colours, a purple stroke green at 4: six corpus cases).
- A see-through picture has no background to find: every opaque pixel is sewn, as drawn (the page's lede says so).
- Separate parts (picture.js `findParts`, `cutPart`): a picture of several things apart from each other (ink
  joined across gaps under 3 % of the picture; 2 to 8 parts of 3 % of the ink or more) offers each "on its own"
  under the picture. The part is then the picture: its own colours, its own Size, its own file (`name_2.pes`). A
  tester's sheet of a horse, a cup and a jersey at 6 threads left the cup none for its greys and sewed each 30 mm
  wide.
- Textured pictures (drawn to look stitched, photo noise) are smoothed before the colours are learned (`smoothed`,
  Kuwahara: squares two picture pixels across and 3 px at least, twice) and before labelling (one picture pixel
  across, three times: at 3 px a script title's 0.8 mm strokes wore away). Unsmoothed, each area was a
  salt-and-pepper mix of light and dark clusters: a silver cup and a jersey's white were one colour at any count and
  the cup sewed flat white.
  - The test (`flatShare`): of the ink pixels more than 3 `s` px inside the ink (not the page's colour, not
    see-through), the share flat to the four pixels `s` away, `s` = two of the picture's own pixels (`opts.scale`).
    Under `TEXTURED` 0.28 it is smoothed. Needs `INSIDE` 15 % of the ink that deep (thin stems and line art have no
    inside: 1).
  - Measured: the tester's sheet 0.25, its three parts 0.11-0.22; the corpus's stitched sheets (5: three sizes,
    see-through and on a white page) and their parts 0.04-0.24 where the texture survives the scaling; clip art
    0.52-1; a crayon drawing 0.49; photos of real embroidery 0.31 (etsy_5, etsy_8).
  - Photos are not smoothed unasked: smoothed, etsy_8's red, pink and purple roses became one mauve (shaded tones
    become solid colours and the merges average toward them). From `TEXTURED` to 0.55 the verdict under the picture
    suggests "Smooth it first"; a smoothed picture has "Don't smooth it" (`state.pic.smooth`).
  - Worse, each tried: every opaque pixel 1 px apart (0.23 for the sheet, 0.31-0.56 for its parts, 0.59 on a white
    page); smoothing only where the picture is rough (small lettering and 2 px rules are rough too and were lost;
    with "no calm square nearby" a stitched cup was no longer found); colours learned from the picture as it is and
    only the areas from the smoothed copy (the cup was flat white again).
  - Guard: `picture_corpus.html` `stitched_*` (the grey and the white beside it never share a thread, each part
    sews alone) and "a clean picture is never smoothed" on every other case.
- Swapping a thread: the six nearest, then "More colours" (every Brother thread by hue, less those other colours
  use) and any colour (the nearest thread no other colour uses: two colours never share one).
- Holes (`picture_corpus.html` `holes`): sewn area 0.35 mm inside its shape with no thread within 0.45 mm. Baseline
  v29: 20 bare patches (20.5 mm²) over 62 filled corpus cases; etsy_3 at 120 mm 48 patches (70 mm²), etsy_1 16,
  etsy_8 15. The 80 % rule passed all of them. Closing them is P1's (roadmap): dropped pieces handed to the
  neighbouring colour, thin bands absorbed, overlap both ways, a second underlay.
- Threads: each group the nearest unique Brother thread no bigger group took (CIEDE2000, never 62-64; plain Lab sent
  olive to Russet Brown); greys and other hue families (`FAMILY`, where Brother's names change) cost more for hued
  colours; the background's thread is skipped unless within SAME. Swatch = solid pixels' mean. The writer's red-mean
  then picks the same thread. Owned threads only: `toPalette()` merges colours landing on one spool.
- Colours from thin lines: `cluster(..., lines)` also learns from pixels flat along a line and not a blend (a 1-2 px
  line is never flat every way); those clusters take only pixels within ΔE 12 or not a blend of two others. Pale
  fringes (JPEG halos: 80 % within 3 px of a stronger colour over 1.5 SAME away) and soft shades (drop shadows: 70 % of
  the edge with the fabric soft over 5 px) are fabric unless the whole picture is soft. Colours under SAME apart
  merge whatever their size. Worse: half-soft colours to fabric when threads run short, scattered pale specks as
  fabric (both erased etsy_1's pale flowers).
- Size = the sewn design's longer side (`picturePlan`, capped to the field), rebuilt when over 0.4 mm off; over the
  field it shrinks, not errors. 8 px/mm (5 lost notches).
- `sewSized` (app.js and picture_corpus): tries from fit 1 every time, cached per exact setting (`picFits`); carrying
  the last fit made results depend on history. Cross-stitch may miss the Size (closest try wins, over counts 1.5x).
- Left out: `keptParts(pictureInk(...))` on the learned copy; `lostMuch` (5 % of area, or 3+ parts and 20 %, or one
  part of 1.4 mm2+ on a picture of 20 parts or fewer) is the `lost` problem with fixes checked on a second worker
  (`picChecks`; kept = 3 of 4 lost parts). The thin-line note is `hairline`, not said with it.
- `findFrame`: a frame covers at least half of two sides meeting at a corner (a ground line was dropped as a frame);
  "Sew the edge band too" (`opts.edge`). Lost parts are ringed on the thumbnail (`markThumb`); `#pic-size-note`
  explains a size gap. Filled keeps "eyes" (a dot of 0.6 mm2+ inside another colour, up to 6 per colour). Line drawing:
  outline bands sewn once from `tO >= 0.5 tS`; `oneInk`: no join across bare fabric between different colours.
- Clean shapes (`regions.js` `cleanShapes`, numbers in `recipes.js` `SHAPES`; Filled only): the labelled picture is
  made into fewer, cleaner regions before any stitch is planned, as every digitizing guide says to (Wilcom/Hatch/
  BERNINA "Prepare Bitmap", mySewnet Despeckle, Stitch Era; `docs/research/picture-sota.md` I2, I3). In order:
  - Blend bands: where two *sewn* colours meet, a band under 1 mm wide (`band` 0.5 mm from each side) of a colour
    between them (Lab distances adding to under 1.25 x theirs; the second side 20 % of its edge at least) is the soft
    edge, read as a third colour and sewn as a line of its own. Each of its pixels within 0.5 mm of both goes to the
    colour covering more of it: the pixel's own colour halved in *linear light* (halved in Lab, a pixel a fifth
    covered by a dark line was the line's: a mandala's 0.6 mm lines sewed 1 mm wide, look -5), grown outward from
    both sides a step at a time (by colour alone, pixels apart from their side made dots: etsy_1 +8 magenta starts).
    Pieces of the band left under 3 mm² go the same way. "Embroidered Flowers" on etsy_8's panel was tan halo
    around black; now black letters. Not between the fabric and a colour: there a band is a thin thing's edge as
    often as a blend (a stem's pale rim given to the fabric left the stem 1-2 px and broken: etsy_1 lost branches and
    gained 38 bare locks); build()'s own rule judges those.
  - Flecks: a piece of a sewn colour under 3 mm², 80 % of its edge on sewn colours, joins the one with body (4 mm²,
    1.5 mm wide somewhere) it touches most, smallest first. Kept on purpose: 0.3 mm² or more at ΔE00 25 or more from
    that colour (an eye, a highlight, a letter's stroke; by shape and a count of 6, as `foldFlecks` keeps eyes, the
    letters of etsy_8's title went into the tan round them). Into any neighbour, two specks came to over 1.5 mm² and
    were sewn: etsy_1 +18 trims. `foldFlecks` still runs after it (fills with body only, eyes by count).
  - Smooth edges: one step of threshold dynamics (Merriman, Bence & Osher 1992): each colour's area blurred (three
    box passes, 0.5 mm across in all), each pixel to the strongest colour beside it. Pixel stairs and JPEG-ragged
    edges go, the colours still meet with no gap. Never moved: regions under 1 mm wide, a wide region's parts no
    1 mm disc reaches (the blur took the hairlines off a script title), pieces under 4 mm² (an apostrophe rounded at
    both ends fell under the 2 mm a mark needs and was left out) and closed-in fabric under 4 mm² (a counter). At
    0.8 mm the held-out pictures had 12 more wasted moves and 43 more bare locks.
  - Layers (`build`, research I3): a hole or bay in a colour's shapes under 3 mm across (`layer`: a closing of the
    colour) that only later colours fill is sewn under them, as a person sews the shape behind whole. Cut round,
    the rows split round each piece of shading into parts stranded behind finished rows or trimmed to. Enclosed holes
    alone were too few to matter (a rose's shading reaches its edge). Never fabric or an earlier colour.
  - The form an imported drawing joins (round Z2): a partition of the working copy into one-colour regions
    (`regionsOf`; with `measure`: area, width, box, edge to each neighbour). An SVG's filled outlines painted in
    sewing order with the later ones' overlaps removed (`docs/zigzag-spec.md` 2.6) give the same labels.
  - Proof (2026-11, PX1, with the Thread colours count above), before -> after. The 12 samples in the browser
    batch: trims 1,238 -> 1,104, loose threads 62 -> 54, wasted moves 47 -> 32, thread ends 1,004 -> 994, bare locks
    81 -> 80, files at the density limit 6 -> 5, stitches -17 % (white closed in now fabric where no shade gave way).
    Five held-out pictures at the same three settings (Node): trims 1,593 -> 1,479, loose 75 -> 65, wasted 43 -> 32,
    ends 1,413 -> 1,391, bare locks 101 -> 104 (one more kept dot: each dot sewn on its own is 10-11 lock hits with no
    body). Corpus (filled): trims 1,267 -> 1,180, loose 26 -> 23, holes 23.1 -> 22.0 mm² (21 -> 20 patches), every
    file passing pe900_check; look by kind within 0.3 of PX0's baseline except shapes -1.6 (pc_framed_..._edge: the
    cream panel inside a sewn frame is closed-in colour and stays fabric at 3 colours, 86 -> 43), line art -1.3
    (art_line_mandala at 100 mm, 76 -> 70: colour part 0.60 -> 0.45, cause not found), watercolour -0.9, cartoon -0.8
    (white left as fabric). Digitizing time unchanged (etsy_8's three settings 15.2 s before, 14.3 s after).
  - Tried and dropped: sewing colours back to front by which lies on which (most of a colour's edge on another,
    twice the reverse share): samples trims 1,065 -> 1,046 and loose 44 -> 36, but held-out ends 1,380 -> 1,472;
    light-first stays.
- Soft shading (`shade.js`, numbers in `recipes.js` `SHADE`; roadmap PX4, research I7): where two colours meet in a
  real soft gradient, the border between their flat bands is sewn as a blend of those two threads; nowhere else. The
  general "blend fill" of digitizing courses and Ink/Stitch's gradient blocks: two fills interleaved row by row across
  a transition, on one grid at one angle.
  - Where: two sewn colours' regions meet softly when the picture, blurred 0.4 mm, takes 2 mm or more (`soft`) to
    change from one to the other (their Lab difference over the median rate of change along the border). A drawn edge,
    anti-aliased or not, measures about 1 mm; the corpus's soft borders 1.5-40 mm, its drawn ones 0.3-1.3. Blended only
    when it is shading over a meaningful area: border 8 mm long (`border`), both regions 6 mm across (`wide`: a
    tabby's 3-4 mm stripes stay drawn; round 1 blended them into scribbles), threads 10-30 ΔE00 apart (`near`, `far`:
    nearer, the blend shows nothing and only redraws shapes (an icon's yellow ball went lumpy, look -0.5); further, rows
    of the two side by side read as stripes, a whale's navy on pale blue), the band 25 mm² (`area`), and the picture
    across it correlating 0.5 or better (`agree`) with a ramp from one colour to the other. Flat pictures have none: of
    the corpus's 254 files only 8 changed (gradient bar, sunset, icon, dog, flowers).
  - Threads: only the two that meet at that border. Each pixel sews its own colour's thread or the one across the
    nearest blended border, never a third (round 1 fitted a chain of up to 6 threads over a whole group and put a stray
    orange patch on a dog's forehead).
  - Mix: a band either side of the border, half the measured transition wide, 12 mm at most (`band`). The share of the
    other thread is where the picture, blurred 1 mm (`field`), lies between the two threads in linear light (threads
    side by side mix as light does), eased into 0 or 1 at the band's edge so it meets the flat fill.
  - Stitches: every region a blend touches is sewn on one row grid at one angle, the mean normal of its blended borders
    (rows run across the borders), so the two threads never cross (round 1's cross-hatched cat and whale). Each row is
    cut into stretches, one thread each, by an ordered threshold (`levels` 2: rows alternate thresholds 1/4 and 3/4, so
    the change of thread is a comb). Stretches under 1 mm join their neighbour; where a row changes thread the one sewn
    first runs 0.3 mm under the next. Each thread's stretches are an ordinary fill (sewRows, routeFill, locks); the
    underlay is the first thread's, once under the group. A line screen, not two layers: the cloth is covered once and
    each colour block is a fill at most as dense as a flat one (24 hits per mm² per block holds as for any fill;
    pe900_check passes every corpus file).
  - Tried and dropped: a fixed geometric ramp across the band (gradient +0.3 where following the picture gives +0.8);
    4 threshold levels (every blended case 0.1-0.6 lower); a band capped by the regions' half-width (a wide sky's blend
    stayed a 3 mm fringe); round 1's whole-group thread chain, rows along the gradient's plane fit and 4 mm `wide`
    (above); rows along the level lines (thin lines across the blend, look 79.4 -> 75.8).
  - The Picture panel's Soft shading (Filled): Auto (above), Blend (any border softer than a crisp edge, 1.3 mm, and
    no `agree` asked), Flat colours. The note beside it says how many areas were blended, with "Sew flat colours";
    when Auto found none but Blend would, "Some colours here meet softly. Blend them".
  - Proof (2026-11-13, PX4 round 2) against v32's own corpus run, Filled look by kind: gradient 75.2 -> 75.7, pet photo
    82.8 -> 83.0, watercolour 75.9 -> 75.7, photo 84.8 -> 84.8, every other kind the same to the decimal. By case:
    sunset 76.8 -> 78.9 and 77.6 -> 79.7, gradient bar 79.4 -> 80.3, dog 78.3 -> 79.1, icon 77.8 -> 77.3 (trims 6 ->
    11), flowers 72.4 -> 71.6 (its watercolour rings softened: outline 0.75 -> 0.73). The cat and whale are not blended
    (their soft borders are narrow stripes or 24-29 ΔE apart). The gain is small because the palette already cuts a
    gradient into a few threads; blending only their borders can't bring back colours never chosen.
- Patents near shading (checked 2026-11 on Google Patents, claims read; not legal advice: the owner should check before
  shipping). Brother's photo-stitch family is live: US 7,693,598 (to 2028), 7,946,235 (2030), 8,200,357 (2031): a
  stored per-pixel angle and strength, a line segment laid on each pixel at its angle, coloured from the image under
  it; 8,271,123 (2031): segments grown from target pixels by similar angle; 8,335,584 (2031): the image split into
  areas, each given threads, each pixel's segment one of them; 8,065,030 (2030) and 8,903,536 (2034): segments joined
  by the angle between them, or by a preset table of distance and angle ranges. US 11,851,793 (Brother, to 2040): a
  thread added to an area's threads when mixed with them it nears a target colour within a threshold; US 8,897,909
  (2033): the palette chosen from threads plus mix colours counted by use. Lapsed: 8,473,090 (smooth areas one angle
  each, parallel segments), 5,481,992 (overlying density by gradation). Our design-around, each a claim element we
  lack: no per-pixel angle or strength (a group's one angle is the mean normal of its borders), no segment per pixel
  (stretches are cut from grid rows where a share crosses a row's fixed threshold), a blend's threads are only the two
  already chosen that meet at the border (no thread added for its mix colour), mix colours never enter the palette,
  and stretches are sewn in row order with travel by distance only (no angle between segments).
- Filled: shapes 1 mm or wider get tatami following the outline (skeleton satin broke corners); parts under 2 x
  `THIN_PART` and lines under 1 mm sew a triple run, never dropped. Specks: under 4 mm² and 2.5 mm across, groups
  under 6 mm of line, walks under 1.5 mm (`lostLines` reports dropped fine lines). Kept: text dots on the fabric (>= 0.8 mm across, 0.6
  mm², within 5 mm of their colour or another such dot) and marks >= 2 mm long, 1.5x longer than wide, within 2 mm of a
  bigger piece of their colour (apostrophes). Thin shapes (< 2 mm) 0.05 mm
  pull, else 0.15. `OVERLAP` 0.35 mm under later colours, shape by shape (growing the raw mask merged specks);
  neighbours alternate angle (+90°). With `direction: "auto"` (PX3; digitize.js's `form` on each part) each part takes
  its own measured angle or curved rows, the alternation kept only where its shape doesn't say (`docs/stitch-model.md`
  "Direction that follows the form"); the Picture panel doesn't offer it yet. `DENSITY` Standard 0.4 (the app's default; `DEFAULTS.density` is Dense) / Dense
  0.35; 0.3 fails the check (row links under 0.3 mm). Row steps split to 3 mm, row-end stitches over 4 mm halved.
- What other tools do (public manuals and guides, no code read): the picture is cleaned before any stitch is planned.
  Wilcom EmbroideryStudio / Hatch / BERNINA "Prepare Bitmap": reduce to the threads wanted, merge like colours, and a
  "Details" slider that filters out small areas of colour ("minimises the number of trims and colour changes");
  thin colours can be set to "Detail" (a run or satin line) or "Omit"; then "Remove Small Stitches". mySewnet:
  Despeckle (spots of 1-100 px). Stitch Era's guide (EduTech Wiki, Geneva): 30-50 % of the traced shapes deleted as
  too small to stitch, holes filled, shapes that belong together joined. Ink/Stitch: a fill travels inside the shape
  under rows to come and otherwise along its border; shapes too small for a fill become a run round the outline; a
  minimum stitch length (0.3 mm on one maker's machines) and no lock for a jump under a set length. Satin columns
  from 1 mm (0.8 with care), runs below that. No public tool was found that publishes its auto-digitized files to
  measure; the reference is the 11 hand-digitized designs in `tests/external/pes`: 4.2 trims per 1,000 stitches
  (ours on the 12 Filled samples: 12.2 before, 10.2 after the rules below), 56 loose threads in 11 files, 4 zero ties.
- Where the samples' trims came from (12 Filled files, 1,464 trims): 786 a shape's first start and 386 a thin line's
  (separate pieces of one colour, 5-30 mm apart over fabric: the picture's own count; 147 of them text-like dots kept
  on purpose), 282 a part of a shape stranded behind its own finished rows. Every one of the 336 tiny stitches was a
  fill's row link; every one of the 164 zero ties a tie-in whose 0.7 mm point was the path's own next point; half the
  173 exposed locks sat on a fill's one-stitch first or last row.
- Flecks (`foldFlecks`, numbers in `recipes.js` `PICTURES`): a piece of a sewn colour that is a dot, or under 3 mm² and
  1 mm wide or more, with 80 % of its edge against other colours' fills takes the colour it touches most, before
  anything is sewn. Left out, it was a hole in that fill (rows split round it); sewn, a trim and two locks. Up to 6
  per colour stay (an eye). Only into a fill with body (4 mm², 1.5 mm wide somewhere): the blend round a dark letter
  is a ring of a third colour and the letters took it. Lines under 1 mm wide are drawn on top and never folded,
  only their dots. Worse: folding any piece under 3 mm² (short dashes of leaf veins and petal outlines went).
- Fill travel along the edge (`routeFill(..., edge)`, 0.75 mm, at most 30 mm in one go): over finished rows travel may
  run inside the shape's own edge, beside the row ends in the same thread (Ink/Stitch's border travel). Stranded parts
  282 -> 107, trims -16 %, loose threads -39 % on the samples. Pictures only: patches and motifs pass no `edge`.
  A stranded part that would sew under 4 mm of thread (less than its own locks) is left out.
- No tiny stitch (`noTiny`): a row link that rounds to 0.3 mm or less in the file moves its row end 0.1-0.4 mm along
  the row (336 -> 0). A tie-in never lands on the path's next point (`clearStart`: the path starts one point on;
  164 -> 5). A fill's locks lie under its rows (`lockAt` 1-2 mm into the path after a jump; a stitch 1-2 mm back onto
  the last rows before a trim), unless that would shorten a trimmed jump to a loose one (5 mm) or a jump to a step
  it could have sewn (2 mm): exposed locks 173 -> 90 (the rest: tips with no covered point within 1.9 mm, and dots).
- All of it together (2026-11), before -> after: the 12 samples 1,464 -> 1,162 trims, 153 -> 67 loose threads, 48 ->
  39 wasted moves, 1,673 -> 1,093 thread ends left on top, 336 -> 0 tiny; the corpus (56 Filled files on the board) 791 -> 538 trims, 73 -> 9 loose,
  29 -> 0 tiny, its own checks of what is sewn against what was drawn all passing; five pictures never tuned on (etsy_2, 3, 5, 6, 7 at the batch's three settings) 1,741 ->
  1,418 trims, 196 -> 82 loose, 303 -> 0 tiny. What is left is the picture's own count of separate pieces (18 sprigs
  in 8 threads is over 100 starts): fewer needs fewer pieces, which is a choice for the person (a Details setting),
  not a rule.
- Small details (Picture panel, Filled; `opts.details`, `recipes.js` `PICTURES.details`; Wilcom, Hatch and BERNINA
  have a "Details" slider, Stitch Era deletes 30-50 % of traced shapes): "Leave out specks" is the default, "Keep
  all" is the rules above and nothing more (the clean shapes' flecks too; their bands, smoothing and layers stay). A *piece* is the parts of one colour the needle reaches
  without a cut (one's end within 2 mm of the next one's start, or in its travel region within `TRAVEL`), measured
  in mm of thread it sews.
  - Left out: a piece under 7 mm and under a tenth of its colour's biggest, and one that only a jump reaches and
    that sews under 8 mm (a run of nothing but its own locks). Kept dots (an eye, an i's dot, a mark by a bigger
    piece) stay, but a mark goes with the piece it sat beside (left, it became a start of its own for a knot: 10
    more bare lock hits on one sample). 12 samples: trims 1,162 -> 1,119, loose threads 67 -> 51, wasted moves
    39 -> 31, bare locks 90 -> 90; no sample has more trims, loose threads or wasted moves (at 8 mm one had a
    wasted move more). Five held-out pictures: 1,418 -> 1,375, 82 -> 75. The corpus hardly changes: its pictures
    have few specks.
  - The panel says how many pieces were left out, with "Keep them all"; the left-out-parts warning offers "Keep
    all the small details" when that sews them. Remembered with the picture (`pic.last`). Guard: ui_sweep
    `picture-details`; `picture_corpus.sh ... details=all`.
  - Travel under a later colour's fill is planned only under fills that can't be left out (`solid`: a fill of at
    least `level.start` mm of thread), so nothing left out bares a travel run.
  - Worse: pieces found from the picture alone (colour touching colour): the router's regions are narrower, so
    almost every piece looked joined and 5 of 1,162 went. 15 mm at the default: 2 mm leaves went from a 60 mm sheet.
  - Worse, a third choice "Main shapes only" (tried four ways, 2026-11). By thread alone (under 80 mm, or the
    smallest 30 % of a colour): trims -27 % on the samples, but the stems that join a sheet's sprigs, a bow and
    half a caption's letters went while specks stayed, and a pattern of equal dots lost a random third. Flecks to
    12 mm² folded into the colour round them: a dog's eye went into its face, and at half-enclosed a vine through
    a rose bed. Judged as asked of a main shape (things within 3 mm gathered whole, left out only when under
    3-8 mm across, touching no other colour): nothing more than the default leaves out, 1,132 trims against
    1,119. What is left of a picture's trims is whole sprigs, stems and letters: fewer means fewer colours or a
    simpler picture, which the person already controls.
- Speed: a colour's distance transforms are worked out in its own box (`cropDT`: the same values to the bit; a
  mask of everything *off* a shape only as far as the caller asks). Filled, 12 samples in Node: 20.8 s at v25,
  22.4 s at v26 (flecks), 18.9 s now; with the Small details pass about 20 s.
- Locks with nothing over them (scoreboard `lockOut`, 90 on the samples): 75 are 8 dots sewn as a start of their
  own (a 1 mm dot *is* its tie-in and tie-off: the count sees a run with no body), 15 are tie-ins on a path whose
  first stitch is under 1 mm (the count takes the first six points as lock). Neither is a lock lying bare beside a
  shape, so no lock was moved; one more dot gets its own start at "Most" (103).
- Travel (`makeRouter`, A* on 0.5 mm cells; Ink/Stitch's tatami travel): `routeFill` takes sections in row order
  through rows not sewn yet (`reach`), at most `SEWN` 3 mm on finished rows, repeated travel costs more, `WORN` 20
  crossings closes a cell. Between shapes (up to `TRAVEL` 20 mm) travel hides under fill still to come; moves under
  2 mm are sewn; else a jump over 5 mm (trimmed) beats 2-5 mm (loose). Budgets in cells (`routeBudget`), not time, so
  browser and Node match. `TRAVEL` 20 since 2026-11 (10 before: 51 more trims on the samples; 30 took only 9 more).
  Travel may follow any thin line of its colour, also one too short to keep (`thin`, not the walks kept): it sews
  one run where the picture has a line. Worse: only along lines that are sewn (the samples' trims 1,162 -> 1,551,
  more than before any of this, and the small bouquet's stems came apart).
- Line drawing (`opts.line`, Auto = darkest): outlines once where colours meet, none between colours within ΔE00 15;
  dark bands (`BAND`) and whole even strokes sewn once along their centre (both edges drew double lines), decided once
  per colour (centre lines if 80 % of its long pieces are strokes; fat letters outlined; marker lines up to 6 mm;
  spurs pruned at 0.6 width; narrow elongated parts of any colour centre-lined); text dots a short out-and-back line;
  `closeSlivers`; `lineEnds` reach the ink's edge; pieces under 2 mm dropped (`spur: 1`: pruning cut letters apart);
  ends within 2 mm of another drawing joined (3 mm drew bars). JPEG ringing is fabric: thin pieces under 5 mm of a colour
  at least 30 ΔE00 from the fabric whose own pixels are under 30 % of that (40 % with no floor cut etsy_1's lavender).
- Cross-stitch (`cross` mm cells): a row is two diagonal zigzags out and back plus one straight stitch (climbing every
  edge drew bowties); runs chained by Dijkstra over cell corners, else a jump over 5 mm; a lone cell dropped only if
  nothing touches it.
- `fine` (`narrowGaps`: gaps under 0.5 mm, at least 2 mm² and 1.5 % of the area) warns; notches under ~0.5 mm can't
  be kept by thread. Errors carry `code` (small, cross, skipped, empty); only followable advice is offered.
- A picture with nothing in it to stitch (`code: "empty"`: all one colour) is not kept for the next visit
  (`forgetPicture` in app.js). Kept like any other, a blank picture opened the tab on its own error every visit after,
  in place of the sample. It showed as ui_sweep's Picture state "never ready" in 1-2 of 330 cases, at v12 too:
  whichever tab had run the blank-picture state before the plain one. Guard: ui_sweep `picture-after-blank`.
- Art that stitches well (PX6; `js/core/artcheck.js` measures, `js/artwords.js` says, numbers `recipes.js` `ART`).
  Makers bring art from AI image tools that looks clean on screen and sews badly; the page said "Good for
  stitching" of a logo whose 3 mm lettering closed up. Two parts:
  - The guide, "Make art that stitches well" (a `<details>` under the picture, opened also from the check's "How to
    make art that stitches well"): the rules with their numbers for this hoop filled, as mm and as px on a 1024 px
    picture (what AI tools make; PX-R: "rules in mm become rules in pixels once the sewn size is known"), and a
    prompt to copy, filled in from the subject typed, the hoop's shape (nearest of 1:1, 4:5, 3:4, 2:3, 9:16; turned
    when the hoop is) and the threads owned (Threads I own: their colour words and hex). The prompt asks for
    `ART.ask` (2) times the least line and detail: it is worked out for the hoop filled and art is often sewn at
    half that. Styles named from Brother's Artspira AI (PX-R): flat, pop, simple, silhouette and line art go to
    embroidery; crayon, sketch, watercolour and manga don't. Copy: `navigator.clipboard`, else the text is selected.
  - The check, in the v29 verdict box under the picture (`verdictUI`): the texture headline stays (smoothed / shaded
    like a photo / flat), then what won't sew well and why, each with "Show where" (its places ringed on the
    picture, drawn bigger while shown: at 64 px a ring was a dot) and its one-tap fix where one mends it, else what to
    do; then "Sews well at N mm: …". Measured on the picture at the sewn size, in the worker beside `keptParts`:
    `artPicture` once per picture and colour count on the learned copy, `artShapes` on the labelled working copy
    (`res` px per mm, the digitizer's own labels).
  | Finding | Measure | Said when | Fix |
  |---|---|---|---|
  | `text` | rows of 3+ letter-like pieces of one colour (0.8-40 mm tall, at most 1.6x as wide, stroke at most 0.45 of the height, 12-75 % of the box inked; neighbours overlapping half the smaller height, under 1.8x taller, under 0.8 of the taller apart; not all one size; strokes within 30 %; 7 in 10 on one baseline), joined letters beside them absorbed | the smallest row's middle height under `ART.text` 6 mm (any style) | the smallest Size in 5 mm steps that brings it to 6 mm, if the hoop holds it; else "add the words in Design your own" |
  | `small` | pieces of one colour 0.5 mm² (keptParts' part) to `ART.dot` 4 mm² and under `ART.detail` 2.5 mm across, not lettering | 3 or more, Filled, not a photo, no left-out note (that one rings and fixes them) | the Size that brings three in four to 2.5 mm |
  | `thin` | ridges of each colour's own (3,4) chamfer distance under `ART.line` 1 mm wide along 3 mm or more, not lettering. A ridge: along x or y, both ways, the colour's edge within its own width and nothing deeper (a plain "local top" took stair-steps on slanted edges and every straight edge: 64 lines on a bold logo) | Filled, not a photo | the Size that brings three in four to 1 mm |
  | `blend` | share of the ink in smooth ramps: over 17 px of the learned copy the colour moves 3-50 ΔE with no step over a third and no back and forth | flat picture, share at least `ART.blend` 0.12 (the corpus gradient 0.32; JPEG logos 0.06-0.11, clean art under 0.03) | `ART.fewest` 4 thread colours: fewer, bolder bands |
  | `colours` | flat pixels (under 4 ΔE to their four neighbours) grouped 12 apart, groups of 1 % or more | flat picture, more than the colours sewn (not asked: the fabric's colour closed in is one more) | as many thread colours as that, up to 8 |
  | `background` | the picture's border (1 % deep) grouped 10 apart: its main group's share | under `ART.page` 0.8, not see-through, no frame, background left unstitched | leave out the sewn colours holding 10 % of the border or more |
  - Texture and photos are the headline's (`flatShare`): for a photo the specks and thin lines are its texture and
    are not counted one by one; colours and blends are judged only on a flat picture.
  - What the external pictures and the corpus get: `picture_corpus.sh ... "art"` logs it under each case (and
    `ext=etsy_1,…&fillonly&art` for `tests/external/images`). Guard: the corpus's `check: { say, never }` per drawing
    (a bold logo and one colour say nothing; the gradient says `blend`, the thin logo `text` and `thin`, `busy_back`
    `background`, polka dots' 5 mm "dots" `text`).
  - Known: a row of three florets on one baseline can read as lettering (etsy_3); script lettering joined into one
    piece is not found as lettering; the colour count of a soft picture is high, so it is said only on flat ones.
