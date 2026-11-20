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
  white). Known cost: the hole of a big O and gaps in a bouquet are sewn white until tapped off.
- The paper inside a line drawing (`lineInside` in `build`, C5-KE): a closed-in piece with under 40 % (`LINE_INK`) of
  the ink round it thick (inside a stroke `COLUMNS.min` 1 mm wide or more, so sewn as a fill or satin, not a line)
  is the paper the lines are drawn on and stays fabric; the page says so ("the paper it's drawn on", with "Sew it":
  `inside` "all" sews it). Cause of PX1's "cause not found": the line mandala's 95 mm disc was sewn as a white fill
  under its 0.6 mm lines and its 24 dots, inside sewn white, were flecks folded into it. Mandala 100 mm 66.6 -> 75.1
  (stitches 16,832 -> 5,876), 60 mm 71.3 -> 81.5, every dot back. White lettering on a badge, a jersey's diamonds, an
  eye's white and bold letters' counters are closed in by thick ink and stay sewn (a counter inside thin small print
  is fabric now too).
  - Only a drawing made of lines has paper (tester, 2026-11: "if the design is fully surrounded by a different
    colour the inside needs to be white, not transparent"). Where a quarter (`LINE_SOLID`) of the design's ink is
    thick, every closed-in piece of 25 mm² (`LINE_SMALL`) or more is sewn whatever rings it: a mascot drawn in
    outline over block letters was fabric at 6 threads. Smaller pieces keep the rule above, so the o of thin small
    print stays open. Thick ink is counted through 0.4 mm (`LINE_EDGE`): the soft edge between a white letter and
    the solid oval round it is a ring of a third colour one pixel wide, which read as a thin line, and a white Y in
    a blue oval was left out. "Leave it out" on the page still leaves it.
  Corpus (all of C5-KE): Filled look line art 75.9 -> 80.8, drawing 82.2 -> 83.4, no kind down;
  line flower 77.5 -> 81.5, line cat 76.6 -> 80.4, crayon 79.2 -> 84.2, doodle sheet 76.8 -> 82.1; pastel lines -0.6
  (its white between pastel lines is fabric now, 4,510 -> 1,621 stitches). Filled stitches 663 k -> 630 k, trims
  1,635 -> 1,554, loose 33 -> 25 (line flower 60 mm 0 -> 2, watercolour flowers 100 mm trims 11 -> 14); every file
  passes pe900_check. Not done: a counter of bold lettering on the fabric (panel s120's D, sewn beige) is the same
  shape as a white star in a red ring, which the owner wants sewn; nothing here tells them apart yet.
- Choose what is sewn, part by part (`applyAreas`, `pic.areas`; a tester's cougar had the gap between its back legs
  sewn white, 2026-11): no rule tells page seen through a design from the same colour meant as part of it, and
  `inside` is all of it or none, so the person taps the part in "Choose what is sewn" (the picture in its thread
  colours, bare fabric as a checked pattern). A tap on a sewn part leaves it as fabric, a tap on the fabric's colour
  sews it in the closed-in colour's thread, a tap on a changed part takes its tap back. Each tap is a point
  ({ x, y, sew }, fractions of the whole picture, so it holds at any Size, colour count and style) applied after
  every rule of `labelWith`, to the area joined to it by pixel sides. A see-through part has no colour to sew. The
  taps are forgotten with the picture, and when the background or the edge band choice changes (the picture is cut
  differently). Guard: picture_corpus `gap_chosen`. Not done: the taps are not kept over a reload.
- The same dialog's other tools (S6-A5), each one more entry in `pic.areas`, applied in the order made: **Rub out**
  ({ rub: the brush's path, r }: bare fabric under the brush; a speck, a shadow, a signature) and **Join two
  colours** ({ x, y, to }: every part in the colour under the first point is sewn in the thread of the colour under
  the second). Undo takes the last entry back. What the person removed is not "left out": the worker takes it off
  the ink `keptParts` measures (a rubbed-out scribble was ringed as a lost part). The entries are kept in `pic.last`
  with the last visit's picture and come back with it (whole picture only, not one part of several); a new, turned
  or cropped picture starts with none. Corpus: `gap_chosen`, `mark_rubbed`, `colours_joined`.
- **Crop** (beside Rotate): drag across the part to keep; the cropped picture replaces the picture as a turned one
  does (`replacePicture`: kept for the next visit, parts found again, nothing chosen carries over).
- A closed-in part left bare (`spare`) that is a quarter of the picture or more (framed_s100_edge's cream panel at 3
  colours) is said as what to sew it on: "That is most of the design: sew it on cream fabric, or sew it in cream too
  (4 threads)" (picture.js `insideNote`). Keeping it sewn at the count would take a design colour.
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
  - Labels still equal the file: the choice ends on a PEC entry's own RGB, and red-mean from an exact PEC colour lands
    on that entry (distance 0), so the machine's screen, the file's palette and the page's label name one thread
    whichever distance chose it. A choice by another distance keeps this as long as it picks *an entry*, never a
    colour between entries.
  - Near-black (C5-CO): a colour's hue counts in full only from L 15, fading to none at L 0 (art_gradient_sunset's
    #10002b palm, L 3, was Prussian Blue at ΔE00 15 over Black at 19: it reads black, and sews Black now). Lighter
    navies keep theirs (#1d3557, L 22, stays Ultramarine).
  - Far threads: each part's difference is capped at FAR for choosing, the uncapped value breaking ties (all capped,
    every far thread tied and the first PEC entry won: art_water_whale's pale blue #8eacd0 was Prussian Blue, now
    Lavender; art_flat_coffee's brown #6f4518 was Prussian Blue, now Dark Brown).
  - Whether a free thread is "worse" than the colour's own (then the colour joins the one that took it) is judged
    uncapped and with a chroma gain: a thread over 1.6 x the colour's chroma and 20 more costs up to 0.8 x more, in
    full 20 past that (ΔE00 squeezes chroma at high chroma: art_photo_dog's mid-brown head rim #8d633b got bright
    Reddish Brown at ΔE00 16 beside Light Brown's 12; judged over the bar, it joins the head). The gain judges only:
    used for the choice too (tried at 0.5 x the excess over the colour's chroma), it fixed the framed flower's dusty
    red (Carmine -> Amber Red) and the owl's outline (Prussian Blue -> Dark Gray) but sent etsy_3's olive to Pewter
    and Harvest Gold, etsy_1's mauve to Black, a navy logo to Dark Gray and a leaf green to Seacrest.
- Colours from thin lines: `cluster(..., lines)` also learns from pixels flat along a line and not a blend (a 1-2 px
  line is never flat every way); those clusters take only pixels within ΔE 12 or not a blend of two others. Pale
  fringes (JPEG halos: 80 % within 3 px of a stronger colour over 1.5 SAME away) and soft shades (drop shadows: 70 % of
  the edge with the fabric soft over 5 px) are fabric unless the whole picture is soft. Colours under SAME apart
  merge whatever their size.
  - Soft shades, judged two steps either side of the edge as before, but each side the mean of its own side's
    pixels in the 3 x 3 round it (a photo's grain and JPEG noise per pixel is as big as a pale shadow's whole limit:
    art_photo_dog's drop shadow was sewn as a Silver blob), and only where two steps in is still the colour (a
    shadow's core runs thin between the lettering and its paler rim, and two steps in was the navy, a step:
    soft_shadow's core read 0.35 soft and was sewn Silver at 4-6 threads and orange at 2, joined to the dot). Its own
    side's pixels only: a plain 3 x 3 mean took in the paper beyond doodle_sheet's pale 2 px lines and lost them.
    A closed-in piece a third of which is shade or fringe stays fabric (`labelWith`, `model.shade`): with the shadow
    fabric, soft_shadow's O counter was sewn White over it; now the counter is bare, as a digitizer leaves it.
    (A fringe counted as fabric is fabric on both sides now: `out` was 0/1 for a fringe and true for the fabric, so
    a fringe beside the fabric counted as an edge.)
  - A picture blown up (`scale` over 2: each of its own pixels several copy px) is flat only where it is flat a whole
    picture pixel away, and a pale fringe hugs within 3 of its own px: tiny_50px (50 px, 18 copy px each) had its
    upscale blur learned as four pastel threads, sewn as satin rings round the heart and the dot (Deep Rose, Salmon
    Pink, Lavender, Cornflower at 6 colours); now Dark Fuchsia and Ultramarine at every count, the blur split at
    its midpoint by the nearest colour.
  - Corpus (C5-CO, against the v34 baseline): pet photo fill 83.2 -> 85.2, watercolour fill 76.7 -> 78.7, flat
    illustration fill +0.7, no kind down 2 or more; better: tiny_50px fill s60 61.1 -> 73.8, line 25.7 -> 31.5,
    water_whale fill s60 77.2 -> 83.4 and s100 76.6 -> 82.3, photo_dog fill s60 77.4 -> 82.2. Worse, all the scorer:
    tiny_50px fill s120 72.1 -> 66.6 (two clean threads against a blurred picture: the pastel rings had matched the
    blur's ramp; outline 0.49, detail 0.53), soft_shadow line 43.2 -> 36.5 and sticker_rainbow line 39.3 -> 33.4 (a
    line drawing scored against the filled picture, its shadow and blend no longer traced). pe900_check 254 ok. Worse: half-soft colours to fabric when threads run short, scattered pale specks as
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
  - Travel (C5-KE): a thread's stretches are combs reaching into the other thread's side, and the way between them
    lay over its own finished rows (v34's icon: Sky Blue 2 -> 7 trims). A blended fill's travel may also run where a
    later thread alone sews every row (`sole`: under the lowest row threshold or over the highest), `SHADE.hide`
    0.5 mm inside it, as hidden (cell 2), and its routes over 30 mm are taken (the edge travel's cap; under the later
    rows they don't show). Icon 100 mm trims 17 -> 10 (flat colours sew 11), 60 mm 6 -> 4 (flat 1); sunset 60 mm 21
    -> 13 trims, loose 7 -> 0 (flat 18 and 7); look within 0.1. The "loose 1 -> 7" of v34's note was the sea's
    stripes round the palm, sewn the same flat.
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
- Direction from the picture's own grain (C5-DI trial, not kept): each part's one angle from the structure tensor of
  the source pixels' lightness gradients inside it (Sobel, over 0.6 mm in from the part's edge), used where its
  coherence (l1 - l2) / (l1 + l2) is 0.3 or more, else the shape's angle. One angle per part, never one per pixel, and
  no segment per pixel: the photo-stitch claims' elements stay out. It changed nothing where it was meant to: fur and
  washes run many ways within one part (the dog's fur 0.0-0.2, the cat's body 0.10, washes 0.04-0.44), so one angle
  for the part reads as none; and flat art read its colours' own edges as grain (0.7-0.93 on white_inside, the
  cartoon cat). Full corpus against `dir=auto`: 24 files changed, all flat art; look by kind within 0.2. Following fur
  needs a field that turns with it (the curved rows' field from the picture's gradients, whose middle is a
  singularity on radial fur, so it would fall back to straight rows there too).
- Filled: shapes 1 mm or wider are a fill, a satin column or a satin dot (Stitch types, below); parts under 2 x
  `THIN_PART` and lines under 1 mm sew a triple run, never dropped. Specks: under 4 mm² and 2.5 mm across, groups
  under 6 mm of line, walks under 1.5 mm (`lostLines` reports dropped fine lines). A group of nothing but walks
  under 1.5 mm that comes to 6 mm is a line the labelling broke into dashes and is sewn (each dash, straight
  stitches between). Lines too faint to label (`faintKept`, numbers `FAINT`; palette.js `faintLines`: unlike the
  fabric by ΔE 20, 2 px clear of ink, fabric either side) 6 mm long or more are sewn in the sewn colour they are a
  blend of with the fabric (their mean 0.3 or more of the way to it, within ΔE 15 of the line between): pc_rules at
  60 mm sews its 1 px hairline, look 70.8 -> 75.4. Its 0.3 mm red rule is still lost: labelled as 16 dashes 3 mm
  apart, the gaps are blends too close to them to count as faint (palette's labelling, round C5-CO). Kept: text dots on the fabric (>= 0.8 mm across, 0.6
  mm², within 5 mm of their colour or another such dot) and marks >= 2 mm long, 1.5x longer than wide, within 2 mm of a
  bigger piece of their colour (apostrophes). Thin shapes (< 2 mm) 0.05 mm
  pull, else 0.15. `OVERLAP` 0.35 mm under later colours, shape by shape (growing the raw mask merged specks);
  neighbours alternate angle (+90°). With `direction: "auto"` (PX3; digitize.js's `form` on each part) each part takes
  its own measured angle or curved rows, the alternation kept only where its shape doesn't say (`docs/stitch-model.md`
  "Direction that follows the form"); the Picture panel offers it as Follow the shape under More settings (Filled),
  off by default: on the corpus it saves 3 % of trims and stitches with look unchanged (79.1 -> 79.2), but one flat
  landscape loses 3.7 and a few cases gain a loose thread (numbers in stitch-model.md). `DENSITY` (recipes.js `ROWS`): Solid 0.25 mm
  (the default) / Extra solid 0.2 (fleece, towels, dark fabric); 0.4 and 0.35 until v39, half a sold design's thread
  (stitch-model.md "Cover"). Pull 0.2 mm (`PICTURES.pull`; 0.05 on shapes under 2 mm), underlay rows 1.25 mm apart. Row steps split to 3 mm, row-end stitches over 4 mm halved.
- Small lettering (`digitize.js` `smallText`, numbers `TEXT`; a tester's logo, 2026-11: a 447 px picture at 90 mm,
  its second line 4 mm capitals with 0.7 mm strokes; "I want the lettering to be more clear"). Rows of lettering are
  found as the page's check finds them (`artShapes(...).rows`), on labels where a colour between the fabric's and a
  darker sewn colour counts as the darker; a word up to 3 letter heights (`word`) along the line joins its row. In a
  row 2-6 mm tall (`least`, `small`; under 2 mm the "rows" are flecks along a bold word's edge), in a flat picture
  (`flat` 0.55, the verdict's own line for "shaded like a photo": etsy_8's photographed 3 mm script title cost 45
  trims and 28 loose threads at 120 mm and read no better):
  - **2026-11 (owner: "pictures only, and it must work with small fonts"), measured on `tests/browser/text_probe.html`**
    (words drawn at 6, 5, 4, 3 and 2.5 mm, bold, regular, serif, and white on a navy oval; before: 3 mm capitals were
    blobs, "University of" sewed as "Universily ol", 2.5 mm was unreadable, a see-through picture's words were
    hairlines, white words on navy vanished; after: every row reads down to 3 mm, 2.5 mm reads in a plain face):
    - A see-through picture has no fabric colour: its rows are found all the same (they were skipped).
    - Rows up to 9 mm (`small`, was 6): a 6 mm serif line, lower case 4 mm, fell to the fill and column rules. From
      6 mm (`sure`) a row needs six letters (`many`): three parts of a fox mascot's face, 7 mm tall and level, were
      taken for a word and sewn as strokes (look 83 to 76, 32 mm² bare).
    - The stroke's width goes by the letters' height (`textWide`): thread is 0.4 mm thick, so a 0.6 mm satin made a
      1 mm stroke on a 3 mm letter. Under 3.2 mm (`line`) a stroke is one line of thread three times over (the
      owner's "single thread doesn't look good" was said of 4 mm letters, which stay satin); from there a satin
      of 0.35 mm growing to 0.7 mm at 5 mm (`least2`, `most`).
    - A letter's short strokes are kept: dead ends from half a stroke, carried to the ink's edge (`reach`), dots
      too. They were cut as thinning noise: t and f lost their crossbars, i its dot.
    - **The finer copy** (`picprep.js` `finer`, the job's `img2`, `o.fine`): a flat picture is also sent twice as
      fine as it is worked at, when it has the pixels, and the letters' centre lines are read from that copy. At
      8 px a mm a 3 mm letter is 24 px tall: an M's notch, a crossbar, the gap between two letters are one pixel
      or none. This alone made 2.5 mm readable and mended every M.
    - Lettering on a filled colour is sewn after that colour, whichever is lighter: the fill's rows reach 0.2 mm
      past every edge and closed over white letters sewn first.
    - A picture of words (`picjob.js` `wordsShare` 0.6 or more of its ink in rows) starts as Filled: as a line
      drawing its letters were joined by the lines between them.
  - One thread a letter: the in-between colour (a dark stroke's soft edge, learned as a grey of its own when threads
    are to spare: half of each letter was grey, some all grey) is the letters' colour where it touches a letter
    (3 px) or is a whole stroke; what is left of it in the row is fabric.
  - Letters apart: each letter's core (a pixel inside its edge) grows back out, all at once, and where two meet is
    fabric. Round letters 0.2 mm apart touch at 8 px per mm, and SCHOOL's centre line ran through all six.
  - Sewn as satin, never as fill rows (a millimetre long, each letter was a ragged block) and never as one line of
    thread (v37 sewed each stroke as a triple run; owner, 2026-11: "I don't think the single thread looks so good").
    Letters under 5 mm (`column`): each stroke's centre line (not thickened the pixel other lines are) out and back
    as a run, then out as a satin of one width, 0.17 of the letters' height (`narrow`; 0.6-0.9 mm), whatever the
    stroke's own width. Letters of 5-6 mm: the strokes grown to 0.8 mm (`pen`, never over a fifth of the height) and
    sewn as satin columns of their own shape, whatever `plain` and `cover` say of them. Tried at 4 mm: columns of the
    strokes' own width grown to 1.1 mm closed every counter and ran R into P, MEDICINE read MEDKINE; at 0.8 mm the
    same at 3.3 mm. Its dots stay dots (an i's dot under 1 mm of line was dropped).
  - Every letter kept: an I is 3.5 mm of line, under the 6 mm a group of lines needs and the 8 mm a piece only a jump
    reaches needs (UNIVERSITY lost both I's and its T).
  - A jump between letters, never a stitch or a travel run: sewn moves of up to 2 mm joined letter to letter at
    whatever height the last stroke ended, and the router's half-mm cells took the word for one region and ran
    straight through its o's. The machine leaves jumps that short uncut: threads to snip, as between the Design
    tab's print letters, counted in the file's note.
  - Left: a stroke the picture draws in one or two pixels can come out short (a Y's arm at 90 mm); the satin's edge
    follows every wobble of a centre line traced from a few pixels (lumpy at 3 mm); lettering under 6 mm is still better typed in Design your own, as the page's
    check says. `opts.lettering: false` sews as before.
- Stitch types (PX2, `digitize.js` `columnNets`/`netStitches`, numbers in `recipes.js` `COLUMNS`; research I4, after
  Goldman's expired auto-digitizing patents: thick or thin from the distance to the edge along the skeleton, satin
  anchored at ends and junctions). Each piece of a colour, after the clean shapes and the specks and lines above, is
  sewn as a digitizer would: under `min` 1 mm wide a line (triple run, as before); 1-4 mm (`wide`) a satin column
  along its centre lines; a compact blob that narrow a satin dot along its long axis; anything wider a fill. Width is
  twice the 90th percentile of the distance to the edge (by the widest point, a mandala's 0.6 mm lines were over 1 mm
  where two cross, sewn twice as bold: look 74 -> 60).
  - A stroke (area / width² >= 2) is a column only when it is `plain`: under 20 % of its centre lines in strokes
    shorter than 3 widths, and its width away from the ends within 2.2x narrow to wide, or uneven only as a taper is
    (C5-SA, `taper`: along each centre line, smoothed over 0.4 mm, the width rises and falls at most 2.5x its range: a
    brush stroke narrowing to its point, a leaf's half swelling and narrowing again; a ragged patch goes up and down
    all along; only a single open line at least 4 widths long: a blob's short curl passed as a taper and sewed as a
    starburst). Bold letters and ragged patches thin to stubby strokes each turned its own way; those stay fills. A dot needs 85 % of its convex hull (`solid`). Nothing under 3 mm² (`small`): a satin that small is all
    tie-in and tie-off, and the cap of 19 hits per mm² left a 1 mm one only its locks, a knot. The columns must cover
    90 % of the piece (`cover`): thinning prunes a short arm as a spur, and a slab F's middle arm was left bare. The
    fabric's colour closed in by the design is never a column (white slivers between outlines sewed as fans).
  - A wider shape keeps its body as a fill where a disc 4 mm across fits (a morphological opening) and a stroke
    growing out of it (a stem from a leaf) is cut off as a column reaching 0.6 mm (`into`) into the fill, and sewn
    before it: the needle reaches it under the fill still to come and comes back into the fill where its walk began
    (after the fill, the way lay over finished rows: a trim each).
  - Centre lines: `skeletonEdges` (spurs under a stroke pruned; a loop under two strokes round dropped, thinning's
    knot at a blunt end, sewn as a star of satin, unless it rings fabric at least a quarter stroke square: a small
    P's counter, whose bowl otherwise sewed as one fan from the stem; not a pinhole in a blob), loose ends carried to the edge (`lineEnds`). Each side is measured
    across the shape along the normal (a round end narrows as the shape does; by the distance to the edge it sewed as
    a diamond), at most 1.4x the distance to the edge at the centre line (a junction's other strokes), evened over
    0.2 mm, less 0.1 mm a side (`thread`: the thread lies past its holes; sewn to the drawn edge a 1 mm outline came
    out half again as bold). Only a loose end stops short, where the column is under 0.5 mm (`tip`); a narrow
    stretch between junctions (a leaf's vein in its outline) is sewn 0.5 mm wide, not cut out.
  - Sharp turns (C5-SA, after trial branch `px2-mitre`): where the centre line turns (measured over a stroke width
    either way) the outer side's cap is raised by 1 / sin(half the inside angle), at most 4x (`mitre` 0.25), so the
    satin reaches the drawn point of a star or an ear; capped at the distance to the edge, it stopped short and left
    the point bare. Not on a line under 6 widths long: a blob's short curl turns all round, and mitred every way it
    sewed as a starburst at the density limit. A ring alone (a star's outline, a D) starts and ends at its straightest place: a column's end is
    sewn square across, so a point there stayed bare whatever its reach.
  - Stitch angle (`steady` 0.75): each satin stitch lies square to the centre line's direction averaged over 0.75
    stroke widths either way (satin's slant), not to the skeleton's local wiggle: at 60 mm a 1.2 mm stroke's centre
    line bends at every pixel stair and corner, and stitches square to it turned every way at once (DESIGN's letters
    as fuzzy fans). Sideways reach is kept, so a straight stroke's edges are where they were.
  - Sewing: each net is walked as lettering is (`raster.js` `tour`, `order`'s walk): every centre line out as its
    underlay (a centre run in 1.2 mm stitches; from 2 mm wide a zigzag 0.4 mm inside each edge, `LETTERS.zigzagFrom`)
    and back as satin (`LETTERS` gap 0.38 mm, pull 0.1 + the fabric's; `fold` at tight inside corners). A net ends
    where it began and is entered at its node nearest the needle. A narrow dot is one satin from the end nearest the
    needle. Locks: the tie-in 1.1-1.9 mm into the underlay (`inside`); no stitch back over the satin before the
    tie-off (it lay across the satin, a bar). Travel may run inside a column of the colour and from it 0.35 mm under
    a later colour (a column doesn't grow under its neighbours as a fill does, and the way to them was cut).
  - Density: the picture's `Design` now counts hits (`ease`, as the Design tab): satin ends at junctions and fans
    give way at 19 hits per mm² instead of being thinned afterwards; `finish({ untiny })` drops the 0.3 mm stitches
    that leaves at tight tips (4 in the 12 samples). Files at the limit: 12 samples (Node) 7 -> 3, held-out 7 -> 5.
  - The Details choice counts a column along its whole walk (by its nodes alone an apostrophe beside a letter sewn
    as a column was no longer counted with it, and went) and a mark kept by a bigger piece is `meant` as a dot is. A
    piece only a jump reaches is left out as too small only when everything the needle sews on from it without a cut
    is (`sews`): the order changed with columns and a 0 lost its left side.
  - Proof (2026-11, before -> after, PX1's branch as base). Corpus (filled, 124 cases), look by kind: cartoon 84.8 ->
    85.5, drawing 79.1 -> 80.7, flat 80.8 -> 80.9, gradient 75.2 -> 75.6, line art 77.7 -> 79.0, logo 79.1 -> 80.6,
    mascot 75.2 -> 76.7, pet photo 82.8 -> 82.7, photo 84.8 -> 85.6, shapes 73.0 -> 73.4, sticker 81.7 -> 82.3,
    stitched sheet 82.0 -> 82.7, watercolour 75.9 -> 76.2 (all 78.1 -> 78.9; outline 0.81 -> 0.83); no case 3 down,
    eight 3-8 up (a line cat 82.8 -> 90.8, polka dots 84 -> 90, crayon 81 -> 87, marker 84 -> 89). Stitches +3 %,
    trims 1,405 -> 1,430, loose 26 -> 34, holes 22.0 -> 48.8 mm² (35 patches, 0.4 mm² a case: a satin outline's
    outer corner at a star's point stops short of the drawn point). Browser batch, 12 samples: trims 1,104 -> 1,120,
    loose 54 -> 60, wasted 32 -> 32, ends 994 -> 1,014, bare locks 80 -> 86, at the limit 5 -> 3, stitches +1 %.
    Held-out 15 (Node): trims 1,479 -> 1,492, loose 65 -> 71, wasted 32 -> 31, bare locks 104 -> 115, at the limit
    7 -> 5. Every file passes pe900_check. Digitizing time +5 % (12+15 in Node 88 -> 92 s).
  - Tried and dropped: columns up to 5 mm with every narrow shape a column (whole or not): rose petals and bold
    letters sewed as fans, look -2.4 on logos and -7.8 on line art, stitches +30 %; satin from the widest point
    (above); pull 0.3 on columns from 1.5 mm, as lettering (outlines too bold); dots of any size as satin (knots);
    choosing a column's node by what lies next to it (held-out loose threads 71 -> 82); a tuck back onto the satin
    before a trim (a bar across it).
  - Proof of C5-SA (2026-11, v34 base, browser corpus 127 filled cases): look by kind within -0.2..+0.1 (line art
    -0.2, mascot -0.1, shapes and other +0.1, the rest 0); no case 3 down, the most -1.0 (a line cat at 100 mm) and
    +1.3 (the star outline at 60 mm; +0.8 at 120). Holes 48.4 -> 42.9 mm² (35 -> 31 patches; star outline 5.4 ->
    2.1). Filled corpus: stitches -0.2 %, trims 1,635 -> 1,633, loose 33 -> 34, wasted 56 -> 49, bare locks 43 -> 43,
    at the limit 1 -> 2 (very_dark at 60 mm: a small ring's stitches, square to the line's run, meet at 24 hits, not
    over). Browser batch, 12 samples: trims 1,120 -> 1,114, loose 60 -> 60, wasted 32 -> 32, ends 1,014 -> 1,007,
    bare locks 86 -> 86, at the limit 3 -> 3. pe900_check 254 of 254 (corpus) and 553 of 553 (batches).
  - Tried and dropped: the tie-in searched up to 2.5 mm along a fill's first 30 points when nothing at 1.1-1.9 mm is
    reached without crossing fabric (a fill starting at a sharp tip ties in on the tip, bare): bare locks 86 -> 83,
    but one tie-in landed on a dense spot (etsy_8 at 170 mm 22 -> 24 hits). Mitre on any centre line and taper on any
    net: a blob's short curl sewed as a satin starburst at the density limit (etsy_4 at 170 mm 22 -> 24).
  - Not yet: back to front beyond light-first (PX1's measure stands); square column ends on bold letters (the holes
    left are not satin: 18 of the 43 mm² are a sun's 1 mm rays the Details choice leaves out in two drawings, the rest
    under 2 mm² a case); a corner of an E or a D's bowl round a small counter is still a fan (the stitch angle turns
    with the line: a digitizer splits the letter into a stem sewn straight across and arms or a bowl, which needs
    the letter's strokes, not its skeleton); bare locks: about 60 of the batch's 86 are dots under 1 mm sewn as a fill of
    one row (tie-in, a stitch, tie-off: all lock, nothing over them; specks, not satin) and the rest fill tie-ins on
    a sharp tip (above; `Design`'s tie-in goes toward the first point); none are columns; a lone
    dot of a dot-only satin counts 10 bare lock hits (the scoreboard's lockOut).
  - Needs a sew-out (nothing here is proven on a machine): satin outlines 1-1.5 mm wide on cotton (do they close up
    with 0.1 pull, and is 0.1 mm inside the drawn edge right?); a satin network's junctions eased to 19 hits/mm²; a
    hybrid stem cut off a leaf (does the 0.6 mm reach leave a gap?); 2-4 mm satin dots (eyes) with their tie-in under
    the satin; zigzag underlay under 2-4 mm picture columns.
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
- Line drawing (`lineArt`; `opts.line` sews everything in that one thread, Auto = each line in its own colour's
  thread). C5-LN, from the review of the 15 worst line drawings (all one thread, one 0.4 mm run, inner lines lost):
  - Colours told apart finer than the threads (`fineColours`, `FINE`): seeds are each thread's colour and the fabric,
    then farthest first any colour 10 ΔE00 from every seed that holds 0.5 mm² (flat pixels first, then any pixel that
    is not a blend between the colours 2 px either side and has 2 neighbours within 6: a pale pink doodle column was
    labelled fabric at 4 threads). Each added colour sews in the thread most of its pixels were labelled, or the thread
    it is a blend of with the fabric (a grey shadow had been given the orange thread). Within 8 of the fabric (white,
    with no fabric colour) it is fabric: a see-through sticker's die-cut white was a ring. A textured picture (under
    `FINE.flat` 0.7 of its ink flat 3 px inside: photo noise 0.02, watercolours 0.51-0.63, crayon 0.64, flat art 0.87+)
    keeps its thread labels: its grain drew 147 squiggles, crayon flecks tangled the strokes. It is traced in its darkest
    thread (and its bands as triple runs, not satin) when its threads walked apart cost over 1.5x the trims and 10 more:
    the batch's etsy pictures went 20 -> 68 trims (etsy_1), 25 -> 160 (etsy_8). A shape's outline on the fabric in a
    colour under 25 from it is sewn in the nearest colour within 30 that stands 35 out (a grey cat on a grey page).
  - A line where colours meet: `ALIKE` 8 ΔE00 apart (15 lost the sky/teal ridge, 14.6, and an owl's outline from its
    wing, 10.3); two shades of one thread `SHADE` 15, or 8 where the picture steps within a pixel (a dog's fur drew 40
    rings; a dinosaur's crisp spots stay). Only where the picture has a step: across 1 mm each side it changes by half
    the two colours' difference (`STEP`; a sunset's gradient drew a straight line across the sky; at 2 px a tabby's
    1-2 mm soft stripes went). Thin blends move into a colour beside them: the two furthest apart of the colours holding
    a sixth of the piece's edge (an outline anti-aliased through two greys left grey rings round a robot), three rounds
    (dashes beside an owl's outline); and a thin shade under 15 apart whose edge is soft. A pale colour (under 35 from
    the fabric) against another whose edge on the fabric fades (2 px out still not the fabric's colour) on 4/5 of it is a
    shadow: fabric, the whole colour when it is so as a whole (a soft shadow under "Holly" was traced in orange satin).
  - One centre line per band: dark bands under `BAND` 4 mm (3 left a palm trunk and a robot's neck as two lines), and
    a dark colour's long thin part wherever it lies (not only on the fabric); a long part of any colour counts only the
    fabric round the drawing (a robot's white grille lines, fabric closed in, made the strips between them satin bars).
    Strokes must be crisp on half their edge. Fat letters are outlined only when too narrow for satin.
  - Weight from the measured width (`WEIGHT`): thin lines a run (out and back), from 0.9 mm a triple run, from 1.5 mm
    a satin column as wide as the line along it (out as its centre-run underlay, back as the satin; a band's width is
    its median depth, so a whole outline is one weight: an owl's came out part satin, part triple), up to 6 mm; dots
    (0.8-2.5 mm thin pieces, and solid round pieces up to 4 mm) a satin across their long axis, as wide as each chord
    (bold i dots and eyes had been hollow rings). Thread per line: one skeleton of everything, each edge in the thread
    most of its pixels were drawn in (per pixel, an ear's outline alternated two threads, a trim each time); an outline
    between two colours is in the one that stands out more from the fabric. Threads sewn lightest first.
  - Unchanged: `closeSlivers`; `lineEnds` reach the ink's edge; pieces under 2 mm dropped (`spur: 1`: pruning cut
    letters apart); ends within 2 mm of another drawing joined (3 mm drew bars); a piece under 6 mm lying within 0.8 mm
    of a line twice its length for 4/5 of it is dropped (a fleck of a blend: ticks on a robot's corners). JPEG ringing
    is fabric: thin pieces under 5 mm of a colour at least 30 ΔE00 from the fabric whose own pixels are under 30 % of
    that (40 % with no floor cut etsy_1's lavender).
  - Routing: each drawing is entered where it is also within 2 mm of a drawing still to sew (it ends where it began, so
    that is where the needle leaves it): trims 9.7 -> 8.8 a case.
  - Measured (picture_corpus, 57 line cases, still scored against the filled picture until C5-LK): look 42.2 -> 54.2
    (logo +16.8, mascot +13, drawing +24, shapes +12, cartoon +12, flat illustration +10, photo/watercolour +8.5);
    marker 24.7 -> 84.6, text_dots 30 -> 86.8, crayon 28 -> 73, doodle sheet 34 -> 77, monogram 22 -> 64; trims
    8.6 -> 8.8 a case, loose 0.02 -> 0; pe900_check all ok. Down: lavender_title 61.5 -> 53.7 (its pale lavender
    title now sewn lavender, as drawn, not in the darkest thread), photo cat 46.5 -> ~42 (grey outline in its own
    thread), soft_shadow 43 -> 40 (the shadow left out: the scorer counts it as ink).
  - Left: laurel leaves touching in a chain still sew as one wobbly satin (their neck depth can't be told from crayon's
    flecks); a 50 px picture's blurred rim is a satin ring; trims between separate drawings (no travel along sewn lines
    yet; doodle sheet 45, owl 23); lock ticks on small circles.
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

## Style chosen per picture

A fresh picture starts in the style a person would pick (C5-AU): Line drawing when it is one, else Filled.
`artcheck.js` `artStyle` measures (in the worker, on the first measure of a new picture: the message's `pick`),
`chooseStyle` decides (numbers `recipes.js` `STYLE`), picture.js `startStyle` applies it.
- Measured on the learned copy labelled with closed-in fabric left as fabric (`labelWith` inside "none": a line
  drawing's insides and a frame are not ink). For each ink pixel its local thickness: the radius of the biggest disc
  of ink covering it (exact distance transform; each local top paints its disc; past 24 px "wide"). The thin share =
  ink in strokes no wider than `STYLE.wide` 1.6 % of the longer side. Line drawing when that is at least
  `STYLE.line` 0.55 and the picture is drawn in at most `STYLE.inks` 4 colours (`artPicture`'s flat-colour count).
- Only a new picture (chosen or dropped) is chosen for; the sample and the picture kept from the last visit keep
  their style, a part or a turn keeps the picture's, and a style tapped stands (the choice is made once, before the
  first stitching, so nothing is sewn twice). Under the Style chips, while the chosen style stands: "Looks like a
  line drawing, so it's sewn as one." Nothing is said when it starts Filled (as before).
- Ground truth: `tests/fixtures/style_labels.json`, the style a person would pick for each of the 74 pictures (the
  corpus drawings, `art.js`, `tests/external/images`), each with its reason, written from the pictures before the
  chooser was built (64 Filled, 8 Line drawing, 2 Cross-stitch; `also`: another a person could defend).
  `picture_corpus.sh ... styles` measures only (about 5 min with the lock) and reports agreement.
- Agreement: 69/74 (93.2 %), every miss a style the label allows (always-Filled: 64/74). Line drawings found 5 of 8
  (pastel_lines, the three line-art drawings, etsy_7's doodle bundle); no filled picture moved to Line drawing
  (logos, lettering, cartoons, flat illustrations, stickers, mascots all stay Filled). Missed: crayon and marker
  (strokes 2-6 mm: they sew well filled as columns), doodle_sheet (its bold title is two thirds of the ink), and the
  two pet photos (labelled Cross-stitch).
  Stable: the same 69 for `wide` 1.4-1.6 % at `line` 0.45-0.6; from 1.8 % a Filled picture turns Line drawing.
- Measured at the Size instead (mm): the line cat's thin share fell from 0.98 at 100 mm to 0.25 at 150 mm, while a
  person's pick doesn't change with the Size. A regular-weight wordmark (Bob's Bakery) is 0.72 thin at 60 mm by mm
  and under 0.4 by share of the picture: its strokes are 2-2.5 % of the picture, line art's 1-1.5 %.
- Colour count keeps photos of embroidered wildflower sheets Filled: as thin as line art (0.58-0.73) in 8-13 colours.
- Cross-stitch is never the start: the pet photos measured as clip art does (flat 0.84-0.90, blends 0.07-0.28, off
  their colours by 3.4 ΔE) and the gradient icon and sunset alike or more. Left: a photo measure that tells a photo
  from a soft-shaded illustration (fur texture at the picture's own pixel size), then a suggestion, not a default.

## Lettering drawn large in a picture (2026-11-20, v45)
- Measured letter by letter on `tests/browser/picture_letters.html` (docs/testing.md): every capital and digit in a
  face, sewn as the Picture tab sews them, against the ink it was drawn with.
- A letter with junctions (E, F, H, A, D) is satin: its short strokes between junctions pass `plain` when they are all
  one width (`COLUMNS.letter` 1.6, 90th over 10th percentile, as measured before a joint evens a branch) and together
  `COLUMNS.run` 6 widths long. Before, any piece over a fifth short strokes was a fill, and a logo's E, N, M sewed as
  fills beside satin O, U, S.
- State at v45 (flagged of 36): bold sans 12 mm 5, 6 mm 5; regular sans 12 mm 4; slab serif 12 mm 21, 6 mm 11; a
  thick-and-thin serif 34 (nearly all fills).
- Not done, each tried once and off: N and M (the centre line rounds their corners: an N sews as an "n", cover
  0.6-0.9, so it stays a fill; `COLUMNS.apex` cuts the line into strokes at a sharp corner but also cut a small U and
  an S: 0 until it tells a corner from a bend); slab serifs (`COLUMNS.serif`, `skeletonEdges` `stubs`: an I's top
  serif sewed as its own bar, as a cap's does, but an E turned to a fill: 0). A fat letter's X (strokes half its
  height) sews as satin with a knot at the crossing (corpus mascot_fox, look -1.1).

