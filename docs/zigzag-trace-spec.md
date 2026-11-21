# ZigZag picture tracing: a functional specification (clean room, step 1)

Written 2026-11-21 by an agent that read ZigZag's source (Rust, Apache-2.0, release 0.1.2, commit `7fdb49f`) and the
tracing library it vendors (VectorCraft Image Trace, `vectorcraft-trace` 0.17, MIT or Apache-2.0, from
storytold/vectorcraft at `f05c33c`), for an agent that will never see either. It describes behaviour, numbers and
formulas only, in this document's own words and structure: no code of theirs, no wording of theirs. The
implementer works from this file, from `docs/zigzag-spec.md` (the earlier spec of ZigZag's stitching, which this
one leans on and does not repeat) and from our own code and docs, and proves the result with the test cases here
(`AGENTS.md`, "Clean room").

- Ideas are credited where described: "(ZigZag's …)" for the glue in ZigZag itself, "(VectorCraft's …)" for the
  tracing library, and the paper's authors where VectorCraft names the published method it follows. The library
  must not be vendored or ported; every method below that has a paper should be written from the paper.
- Lengths are in mm where they are physical, and in **source pixels** (px) or **working pixels** (wpx, see 3.1)
  where they belong to the image. The y axis points down. Colour channels are 0-255 unless said; "RGB distance" is
  the plain Euclidean distance over the three channels.
- "Ours wins" marks a place where their behaviour breaks a hard rule of `AGENTS.md`. Those rules are not up for
  change by this spec.
- Nothing here was run (no Rust toolchain on this machine). Every number is from reading. The test cases were
  worked out by hand from the rules and are this spec's claims, to be re-derived by the implementer's tests.

## 0. Scope

| Covered here | Section |
|---|---|
| The options a person sets and how they map onto the tracer; how the result is sized | 1, 2 |
| The default route for flat art ("flat logo"): working copy, palette, flatness test, unmixing, smooth field, contours, specks and holes, white left out, outline fitting, order | 3 |
| The fallback route ("posterized"): photos, noisy scans, and centre lines | 4 |
| From traced shapes to objects and stitch types; thread colours | 5 |
| How those objects are stitched by default, and why the edges look crisp | 6 |
| Why their output breaks our density and tiny-stitch limits | 7 |
| Where ours wins, in one table; what is worth taking | 8 |
| Test cases | 9 |
| Not determined | 10 |

Out of scope: their tracer's other modes and presets as a drawing program offers them (Black and White,
Grayscale, gradients as gradient fills, exact shape recognition, auto grouping, "Document Library" palettes),
which ZigZag never asks for; the editor's trace panel layout; their file writers.

### Their picture path in six lines
1. Decode the image (any size up to 64 megapixels; larger ones up to 192 are box-filtered down). DPI is never read.
2. Pick a width in mm (80 mm, or 80 % of the hoop in the editor); mm per pixel = width / image width.
3. Try the flat-logo tracer: each pixel is read as a *blend* of a few flat colours, the blend fractions are
   interpolated smoothly, and each colour's outline is the line where it is exactly as present as its strongest
   rival. Outlines are fitted with corners put back, straight runs as lines, round runs as arcs, the rest as few
   Bézier curves as a tight tolerance allows. White is never traced: it is bare fabric.
4. If the image is not flat art (under 93 % of its solid pixels near one of its colours), posterize instead.
5. Every traced shape becomes a filled object (an SVG `path` with a fill), stacked largest first.
6. Every filled object is sewn as their tatami (`zigzag-spec.md` 1.2) with the "standard" fabric's numbers.

### What we have today
`digitize.js` (in `worker.js`): colours learned per picture, then Filled / Line drawing / Cross-stitch styles on a
pixel raster; outlines follow pixel edges; white inside a design is decided by position (`docs/pictures.md`,
"background is by position"); small pieces are dropped by size rules. The bake-off of 2026-11-21 (8 customer
pictures: logos, a wordmark, a letter sheet) found theirs cleaner on three counts: smooth edges, white left bare,
small letters kept. Sections 3.8-3.12 are the edge story, 3.9 and 3.10 the white and speck story, 6 the stitch story.

---

## 1. Options and how they map (ZigZag's trace options)

| Option (panel words) | Default | Range | Becomes |
|---|---|---|---|
| Colours | 0 = find them | 2-10 | Flat logo: the most colours the palette search looks for (unset: 8). Posterized: unset = "Automatic" palette with a starting count of 6, set = exactly that many ("Limited") |
| Remove white background | on | checkbox | Flat logo: white is not traced and every colour's shape keeps its holes (3.10). Posterized: palette colours with every channel at 245 or more are left out; also any stroked centre line within RGB distance 30 of pure white |
| Lines (trace thin lines as lines) | off | checkbox | Forces the posterized route with centre lines on (4.7) |
| Line width | 1.5 mm | 0.3-5.0 | The widest feature traced as a centre line, converted to px (at least 1 px) |
| Detail | 60 | 0-100 | Fitting tolerance (3.12, 4.6) |
| Speck size | 1.0 mm | 0-10 | A *square of this side*: areas under speck² mm² are dropped (flat logo) or merged away (posterized). The panel says "across"; the rule is on area |
| Width | 80 mm; editor: see 2 | 5-400 (0.5 steps) | Sets mm per px |
| Use thread colours | off | checkbox | Each traced colour is replaced by the nearest thread of the active chart (Brother by default), by CIEDE2000 |

Fixed inside ZigZag, not shown: flat logo corners 50; posterized corners 60, colour detail 85; "snap curves to
lines" on in both; at most 60 000 anchor points in the whole trace, else the trace is refused with "too much
detail: fewer colours, less detail or a bigger speck size".

Derived numbers (mm per px = width / image width in px):
- speck area in px² = (speck_mm / mm per px)²
- flat logo: areas under that many **source** px² are dropped (the library takes ten times the number and divides
  by ten again: no effect but rounding)
- posterized: regions under that many px (rounded, capped at 10⁶) are merged into a neighbour; holes under it are
  not cut
- line width in px = line_mm / mm per px, at least 1

## 2. Size (ZigZag's)

- The image's own resolution or DPI is never consulted. Opening an image as a document, or converting it on the
  command line, traces it at **80 mm wide**, height by aspect, centred on the hoop centre.
- In the editor, the panel's starting width is the largest that fits **80 % of the hoop**:
  width = max(5, min(0.8 x hoop width, 0.8 x hoop height / aspect)), aspect = image height / width, rounded to
  the nearest 0.5 mm. The person can change it before placing. Artwork larger than the hoop when placed is scaled
  down to fit (`zigzag-spec.md` 2.2).
- The traced SVG has a `viewBox` in source pixels and `width`/`height` in mm, so every later length scales with
  the chosen width.
- Consequence: the same picture's lettering is as large as the design allows, never as small as a 72-dpi file
  would say. Small letters in a letter sheet survive partly because they are sewn at 80 mm, not at the file's
  nominal size.

---

## 3. The flat-logo route (VectorCraft's Flat Logo mode; the default)

### 3.1 Working copy
- The image is converted to premultiplied RGBA in 0..1 (colour x alpha).
- If its longer side exceeds **1024 px** it is averaged down by an integer factor
  f = ceil(longer side / 1024): each working pixel is the plain mean of an f x f block of source pixels
  (premultiplied, so transparency counts correctly; the last row and column of blocks may be partial). f = 1
  otherwise. Lengths found on the working copy are mapped back by x f (the partial last block by its own width).
- A busy image is halved again (f doubled), at most six times, while the number of *distinct* working-pixel
  values that are not within 4/255 (premultiplied RGBA distance) of a palette class exceeds **150 000**, unless the
  working copy is already 16 384 pixels or fewer.

### 3.2 Palette (VectorCraft's)
1. **Solid pixels vote.** A working pixel votes when it and its 3 x 3 neighbourhood are fully opaque (alpha over
   0.98) and the neighbourhood's colour variance (sum over channels of mean of squares less square of mean, in
   0-255 units) is under **20**. Edge pixels, being blends, do not vote. If fewer than max(2, k) x 20 pixels vote,
   every pixel with alpha over 0.9 votes instead.
2. **Cluster.** At most 20 000 votes (evenly strided) are clustered by k-means in RGB, k = the asked colour count
   clamped to 2-10 (unset: 8), seeded the k-means++ way (Arthur and Vassilvitskii 2007) from a fixed seed, 30
   Lloyd iterations; four seeds are tried and the lowest total squared error kept (deterministic).
3. **Drop.** A cluster with under 0.1 % of the votes is noise. A cluster whose centre has every channel at 245 or
   more is white, and **white is never a palette colour**: it is always a class of its own (3.4).
4. **Merge.** Repeatedly merge the two centres closer than RGB distance 20 into their vote-weighted mean.
   Order: most votes first.
5. **Line art fallback.** If nothing survives (a page of thin strokes, where no 3 x 3 block is uniform except
   paper), and ink covers at least 1 % of opaque pixels (ink = darker than white by 48 or more in some channel),
   the votes are the *cores* of strokes instead: ink pixels at least as far from white as each of their four
   neighbours. Clustered as above, then **fringe folding**: a found colour that lies on the line from white to a
   darker found colour (within RGB distance 20 of that line, strictly between the two) is folded into the darker
   one (the anti-aliased edge of a stroke is no colour of its own).
6. **Tone folding.** Two palette colours within RGB distance 60 are tested as tones of one colour (a scan's paper
   shading, an uneven wash): assign every opaque pixel to its nearest palette colour; for the pair, split the
   pixels of either by where they project on the segment between them (first third, middle third, last third). If
   the middle holds at least a third as many as the smaller end, the two are one colour: their mean weighted by
   (end count + half the middle). The pair with the fullest middle is merged first; repeat until no pair qualifies.

### 3.3 Flatness test (VectorCraft's)
- Solid pixels again, now with variance under **60**. The share of them within RGB distance **22** of a palette
  colour (the unfolded tones, plus white) is the flat score.
- Score under **0.93**: not flat art; ZigZag falls back to the posterized route (section 4).

### 3.4 Unmixing: every pixel as a blend (VectorCraft's)
- Classes: each palette colour (opaque), then **white** (opaque), then **transparent** (all zero). In
  premultiplied RGBA 0..1.
- A pixel within 4/255 of a class is that class, weight 1.
- Otherwise it is explained as the best blend of 1, 2 or 3 classes: for every pair and triple of classes, solve the
  least-squares weights that reproduce the pixel's four values, with the weights' sum held near 1 by an added
  equation (sum of weights = 1) weighted 30 (a ridge-style penalty, λ = 30). A solution with any weight under -0.02
  is rejected; weights are clamped to 0..1 and renormalised to sum 1. Error = squared RGBA error + a penalty for
  complexity: 0.0004 for a pair, 0.0012 for a triple, 0 for one class. The lowest error wins.
- Output: one **coverage plane** per class (each pixel's weights sum to 1) and each pixel's leftover error.
- Distinct pixel values are solved once each (a flat near-colour area costs one solve).

### 3.5 Colours found late (VectorCraft's)
Only when the palette was found automatically and has fewer than 10 colours. A small accent may have had too few
votes. A pixel is "missing" when:
- it is opaque, at least RGB distance 25 from every palette colour and white, its four neighbours are within RGB
  distance 10 of it, and its leftover error is at least 0.0064; or
- it is part of a flat bar exactly two pixels wide on a uniform ground (the two bar pixels within RGB distance
  about 3.5 of each other along three in a row, the ground pixels on both sides within 10 of each other and at
  least 25 from the bar), the ground is a known colour, and either the error is large as above or the bar is at
  least 1.5 times nearer the ground's colour than every other known colour.
Missing pixels within RGB distance 20 of each other are grouped (running mean). Groups of three or more pixels are
added, most pixels first, up to 10 colours; tone folding (3.2 step 6) runs again and unmixing is redone.

### 3.6 Hard-edged sources (VectorCraft's)
- A pixel is "blended" when its strongest coverage is under 0.9; a "boundary" is a pixel whose dominant class
  differs from its right or lower neighbour's.
- If there are boundaries and blended pixels are fewer than a quarter of them, the image has no anti-aliasing (a
  GIF, a 1-bit scan): every coverage plane is Gaussian-blurred with σ = **0.8 wpx** (radius 3σ, edges repeated),
  and fitting is loosened (3.12: tolerance x 2.5, line and circle tolerances x 1.8, smoothing σ 0.9 wpx).

### 3.7 Knockouts (VectorCraft's)
- Connected regions (4-neighbour) of pixels whose transparent coverage is over 0.2 that do **not** touch the image
  border are enclosed: letters cut out of a badge, the counter of an "o" in a transparent PNG.
- Grow them by one pixel (3 x 3), and in those pixels move all transparent coverage over 0.02 into white.
- So an enclosed see-through hole is white, and with "remove white background" on it becomes a real hole (bare
  fabric). Transparency touching the border stays outside.

### 3.8 The smooth field and its contours (VectorCraft's; B-spline method after Unser, Aldroubi and Eden 1993 and Thévenaz, Blu and Unser 2000; marching squares)
1. **Pad** every coverage plane with a 3 wpx border: transparent coverage 1 there, every other class 0, so every
   outline closes.
2. **Upsample** each padded plane u times with cubic B-spline interpolation (recursive prefilter, pole √3 - 2,
   mirror boundaries; output sample i sits at (i + 0.5)/u - 0.5 in input samples; result clamped to 0..1).
   u = floor(sqrt(6 000 000 / padded pixel count)), clamped to **2..8**. (A 1024 x 1024 working copy gets u = 2;
   a 300 x 300 one gets 8.)
3. **Competition field** for class c at each fine sample: its coverage minus the largest coverage of any other
   class there. Positive where c is the most present colour; zero exactly where it ties with its strongest rival.
   So an anti-aliased edge between red and blue lands where the pixels are half red, half blue, to a fraction of a
   pixel, and two neighbouring colours get the same edge from opposite sides.
4. **Contour** the field at level 0 by marching squares: crossing points on cell edges by linear interpolation;
   the ambiguous saddle cases decided by the mean of the four corners; segments oriented with the positive side on
   the left, so outer boundaries and holes wind opposite ways (no point-in-polygon test needed to tell them
   apart). Fine-grid point g maps to working pixel (g + 0.5)/u - 3.

### 3.9 Specks and small holes (VectorCraft's, set by ZigZag's speck size)
- Every contour, outer or hole, whose enclosed area is under **min_area** is ignored, where
  min_area (wpx²) = max(speck area in source px² / f², 0.3).
- So with the defaults a region under **1 mm²** of the finished design is dropped, and a hole under 1 mm² is filled
  in by the colour around it (a dropped hole is simply not cut). There is no merging into a neighbour colour in
  this route: a dropped island leaves whatever its surroundings' contours say. A colour region is not dropped for
  being thin, only for its area. A letter stroke 0.3 mm wide and 4 mm long (1.2 mm²) stays.
- More than 20 000 kept contours in one colour refuses the trace (never truncated).

### 3.10 White and background (VectorCraft's, ZigZag's default "remove white background")
- With it **on** (default): the white class is never contoured. Each colour's hole contours are kept and each hole
  is given to the smallest outer contour of that colour that contains its first point. So a colour region has
  holes wherever white (or another colour) sits inside it: **white areas are bare fabric**, and colours abut.
- With it **off**: white is contoured like any colour, and **no colour keeps its holes**: each region is its outer
  outline only, and the stacking order (3.13) puts the smaller shapes on top. The stitch stage's overlap removal
  (`zigzag-spec.md` 2.6) then cuts the lower fills, leaving 0.5 mm under each covering edge.

### 3.11 Hairline protection (VectorCraft's)
For each outer outline of a non-white colour, before fitting: at each vertex take the outward normal (from the
vertices either side); look at the dominant class 0.45 wpx outward; if it is another *colour* (not white, not
transparent), move the vertex outward by **0.06 wpx**. Neighbouring colours so overlap by a hair and no gap of
fabric shows between them. Holes and edges against white or transparency are not moved.

### 3.12 Fitting an outline (VectorCraft's; curve fitting after Schneider 1990, "An algorithm for automatically fitting digitized curves")
All lengths in wpx. ZigZag's numbers: tolerance tol = 0.04 + 0.2 x (1 - detail/100), so **0.12 at detail 60**,
0.04 at 100, 0.24 at 0; corner angle 90 - 55 x 0.5 = **62.5°**; snapping on.

| Step | Rule |
|---|---|
| Resample | The closed contour evenly at about 0.12 (at least 8 points) |
| Light smoothing | Gaussian along the loop, σ = 0.18 (at least one sample); used to find corners |
| Restore corners | See below |
| Find corners | Turning angle at each sample = angle between the chord from w samples back and the chord to w samples ahead, w = round(0.7 / step) (at least 2). A corner is a local maximum at or over the corner angle, at least w samples after the previous one |
| No corners | Smooth with σ = 0.5 (0.9 for hard-edged sources). If a circle fits with largest radial error under the circle tolerance (0.25) and radius over 2.5, the loop is an exact circle (cubic arcs, at most a quarter turn each, the loop's own direction kept). Else one Schneider fit of the whole loop |
| Between corners | Each run is smoothed with σ = 0.5 (ends pinned, odd reflection at the ends). A run whose smoothed points all lie within the line tolerance (**0.22**) of the chord, chord over 1.5, is one straight line. Else, if over 12 samples, chord over 1, a circle fits within **0.25**, radius 2.5-400 and the sweep is over 0.35 rad (20°), it is a true arc ending exactly on the corners. Else Schneider: chord-length parameters, least-squares handles along the end tangents (tangent from the 4th sample in), up to four Newton reparameterisations while the error is under 6 x tol, split at the worst point (never within 2 samples of an end) with a shared tangent there, depth at most 14, no split under 6 points |
| Verify | Sample the result every 0.03 and densify the raw contour every 0.1; every point of each must be within **1.4** of the other (two-way). Else try again with snapping and corner restoration off; if that fails too, fit the raw contour plainly (no smoothing) at tol |
| Anchor kinds | An anchor whose two handles line up (cross product under 0.07 of the product of their lengths, pointing on) is smooth; else a corner |
| Degenerate | A fitted outline or hole with (near) zero area is dropped (an outline with its holes) |

**Corner restoration** (VectorCraft's: blur rounds corners; put them back where the two straight edges meet):
- Candidates: samples where the turning angle over about 1 wpx is at least **35°**, strongest first, each
  suppressing others within 1.5 wpx.
- For each, fit a straight line (total least squares) to the light-smoothed outline on each side from **1.3** to
  **3.5** wpx away (the far end limited to half way to the neighbouring candidate plus 0.65; skip if that leaves
  under 0.8 wpx of edge). Each line must fit within **0.15**. The angle between them must be 30-160°. Their
  intersection must lie within **1.3** of the bend.
- Accepted: the samples within 1.3 wpx of the bend are replaced by the single intersection point, which is then a
  forced corner. Two accepted corners never share replaced samples.

**What this buys**: tolerances of 0.04-0.24 wpx on a sub-pixel edge, true lines and arcs where the art has them,
sharp corners where the art has them, and no pixel staircase. At 80 mm across a 1000 px logo (0.08 mm/px), 0.12
wpx is 0.01 mm: the outline is as exact as the picture allows.

### 3.13 Order and output (VectorCraft's, ZigZag's SVG)
- Shapes (one outer outline with its holes, one colour) are sorted by **area, largest first** (ties by palette
  order): the painter's order, so a small shape lies on what it belongs to. Coordinates are mapped back to source
  pixels.
- ZigZag writes each as an SVG `path` with `fill` = its colour (or the nearest chosen thread, section 5) and an id
  `trace_N`, numbers to three decimals of a pixel. The colours used are reported largest area first.

---

## 4. The posterized route (VectorCraft's Color mode, used by ZigZag when 3.3 refuses or Lines is on)

Summarised: our pictures are mostly flat art, and every rule below has the same purpose as section 3 on a harder
input. Credits are the published methods VectorCraft names.

### 4.1 When
Flat score under 0.93 (photos, gradients, heavily shaded scans), or the Lines option on.

### 4.2 Photo smoothing (bilateral filter, Tomasi and Manduchi 1998)
- Continuous-tone test: median-cut the colour histogram to 8 colours; the root-mean-square RGB distance from the
  pixels to the nearest of the 8 is over **6** levels and over a tenth of the same for one colour.
- Then the image is smoothed three rounds, rows then columns, three pixels at a time, each neighbour weighted by
  likeness (colours 20 levels apart, all channels together, count half). Edges stay; noise within a tone goes.

### 4.3 Colour reduction (Oklab, Ottosson 2020; median cut, Heckbert 1982; k-means, Lloyd 1982; Otsu's split criterion; salient-colour keeping after Fukuda et al. 2019)
- Pixels with alpha under 128 are transparent (untraced).
- 15-bit histogram: 5 bits per channel over each channel's own range in the image (a channel spanning 32 values or
  fewer keeps every value apart), with exact bin means.
- **Blend pixels do not shape the palette**: a pixel lying between the two pixels on opposite sides of it (row,
  column or a diagonal) that differ by more than 20 levels is an edge blend; the palette is built from the other
  pixels unless they are almost none.
- "Automatic" (ZigZag's unset colour count): flat art when the bins holding 90 % of pixels number at most 96, and
  median-cut boxes (up to 64, split while wider than 24 levels) with at least (0.04 - 0.035 x 0.85) of the pixels
  (about 1 %) hold 90 % of all pixels, at most 32 such boxes, with half their weight in their heaviest bin. Then
  that many colours by median cut refined by k-means; else up to 256 colours ("full tone", boxes split while wider
  than 96 - 88 x 0.85 = 21 levels).
- Median cut here splits each box where the two halves are most alike within themselves (largest between-side
  variance along one channel, Otsu's criterion), and splits next the box that gains most. Refinement assigns bins
  to the nearest centre in Oklab.
- Rare colours kept on purpose (Automatic on flat art only): at least 2.5 Oklab x 100 from every palette colour,
  mostly one histogram bin, and drawn: a 4-connected region of its own non-blend pixels of 8 or more, or three
  regions of 4 or more. At most 6, largest regions first. Noise removal never erases their regions of 4+ pixels.
- Colours split by noise are re-merged: under 30 levels apart and thoroughly mixed (the lesser one's pixels average
  over half a neighbour of the other), or under 12 apart and mixed in patches (JPEG blocks).
- Blend pixels whose nearest palette colour is a third colour (an olive between navy and yellow) take the nearer
  of the two colours around them within two pixels, when that pair explains them twice as well.
- Semi-transparent pixels on a cut edge (alpha 128-254 beside alpha under 128) that are a faded copy of the opaque
  colour within two pixels (that colour, or a darker shade of it, blended with the see-through background, within
  8 Oklab x 100) take that colour.

### 4.4 Noise
Whole 4-connected regions of one label are merged, smallest first, into the label most of their border pixels
touch, until no region under the speck area is left. Transparency is a barrier. Raising the threshold continues
the same sequence (results nest).

### 4.5 Boundaries and sub-pixel edges
- Each colour layer, in order of area (largest at the bottom), is a mask within its bounding box. Boundaries are
  followed along pixel cracks, inside on the right; at a diagonal saddle the walk turns right, so diagonal
  neighbours stay apart (4-connectivity, matching the regions).
- Each crack is moved along its normal to where the image says the edge is, by reading the column of up to four
  pixels across it as blends of the two colours either side: the edge sits as far out as there is inside colour in
  the outside pixels, less outside colour in the inside ones (shift clamped to ±0.5 px at junctions). A run at most
  three pixels deep with the other colour beyond (a thin line or thin gap) is read as one blob: its centroid and
  summed coverage give its middle and width. The reading is averaged from both sides so two regions get exactly
  the same points. A hard-edged image (no blends) is read as a staircase whose step middles lie on the edge.
- Outlines are cut at **junctions** (pixel corners where three or more regions meet, where a region touches itself
  only at a corner, or at the image border) and each piece between two junctions is fitted once, the same way
  from either side: two abutting regions share one curve exactly, so there is neither gap nor overlap.
- Holes smaller than the speck area are not cut. A loop whose fit has no area is dropped.

### 4.6 Fitting in this route
As 3.12, with: step 0.25 px; tolerance 0.08 + 0.7 x (1 - detail/100)^1.5 (**0.257 px** at 60); corner angle
90 - 55 x 0.6 = **57°**; line tolerance 0.5, circle 0.3; verify sampling 0.15; and straight pieces within 2.5° of
level or upright and at least 2 px long made exactly level or upright (ends moved at most 1.6 px; junction ends
stay put).

### 4.7 Centre lines (with Lines on)
- Per colour, per 8-connected blob: exact Euclidean distance transform (Felzenszwalb and Huttenlocher 2012). A blob
  whose widest point (2 x its largest inside distance - 1) is within the line width is a **line**; wider blobs
  stay filled areas, with the line pixels taken out of them.
- Skeleton by Guo-Hall thinning (1989), stray staircase pixels removed; branches between ends and junctions become
  polylines; spurs shorter than a threshold beyond the junction's largest inscribed disc are pruned (Blum 1967;
  Shaked and Bruckstein 1998); junctions whose discs overlap merge.
- Each skeleton point is moved to the middle of the ink across the line, read from the image's blend values; the
  stroke width is the median measured width; ends sit where the ink ends (less half a width for a round cap), or
  square caps when the ink ends square. Fitted as 3.12.
- ZigZag drops centre lines that are near-white when removing the background (white lettering detail is fabric).

---

## 5. From traced shapes to objects (ZigZag's)

| Traced item | Object | Stitch type, unset |
|---|---|---|
| Filled shape (all of the flat-logo route, and the areas of the posterized one) | Filled-shape object, rings = outer outline and its holes, non-zero rule (the windings already cancel) | **Fill** (tatami) |
| Centre line (Lines on) | Stroke object, width = measured ink width | **Satin when 1.0 mm or wider, Run when narrower** (`zigzag-spec.md` 2.3) |

- In the default route there are **no strokes at all**: a thin letter stroke, a hairline, a small serif are filled
  shapes and sewn as tatami. Their checks only *warn* ("only N mm wide: satin looks cleaner", "looks like small
  lettering under 4 mm tall", "a gap under 1 mm wide"); nothing changes the stitch type.
- Curves are flattened to polylines within 0.03 mm before stitching (`zigzag-spec.md` 2.2).
- **Thread colours**: unset, each object keeps the traced RGB, and the PES writer later picks the nearest PEC
  thread by red-mean distance; nothing stops two traced colours sharing a thread. With "use thread colours" each
  traced colour is snapped to the nearest thread of the chosen chart by CIEDE2000, and colours that snap to the
  same thread become one. **Ours wins**: `machineThreads()` (PEC palette less 62-64, red-mean, two colours never one
  thread, order = block order).
- Sewing order is the document order: largest area first, as 3.13 left it; colours are not grouped unless the
  person asks (`zigzag-spec.md` 2.7).

---

## 6. How the traced objects are stitched by default (ZigZag's; details in `zigzag-spec.md` 1.2, 1.8, 2.6)

The "standard" fabric preset applies; nothing in the picture path changes a setting.

| Setting | Value |
|---|---|
| Top rows | 0° (horizontal), spacing **0.25 mm**, stitch length 3.0 mm, tatami stagger 4 (quarter steps), rows on one grid for the whole design |
| Pull compensation | **0** |
| Edge walk under fills | **none** on "standard" |
| Underlay | one layer of rows at 90° to the top, 1.5 mm apart, 3.0 mm stitches, ends 0.4 mm inside the outline, stagger 1 |
| Shortest row kept | max(spacing / 2, 0.3 mm) = **0.3 mm** (after pull or inset) |
| Lattice points near a row end | none nearer than min(length / 4, 0.5 mm) = 0.5 mm to the row's ends |
| Row link | straight from one row's end to the next row's start, at the outline; split evenly only if over 3.0 mm |
| Overlap removal | on; a later object's area shrunk 0.5 mm is cut out of an earlier fill (abutting shapes: nothing to cut) |
| Shortest stitch kept | 0.1 mm (closer points merged) |
| Gaps | up to 1.0 mm always sewn across; up to 6 mm straight across if the line stays in the fill; else routed up to 50 mm along the outline 0.5 mm inside (3 mm stitches) or under anything sewn later; else trimmed |
| Locks (file stage) | at each run start, before each trim, colour change and the end: 4 hits 0.4 mm out and back along the stitch direction |
| Coordinates | rounded to 0.1 mm in the file |

**Why the edges look crisp**, ranked by how much each likely contributes:
1. The outline itself (3.8-3.12): edges on the half-blend line to a fraction of a pixel, corners restored, lines
   and arcs exact. The row ends land on that smooth line.
2. Rows only 0.25 mm apart, each ending exactly on the outline with no pull: the comb of row ends is fine enough
   to read as a line, and at 0.25 mm the fill is dense enough to hide the fabric between rows.
3. White never sewn (3.10): edges against the cloth are the design's own edges, not a white fill's.
4. Colours abut on one shared line with a 0.06 wpx overlap (3.8 step 3, 3.11): no gap, no ridge from double layers.
5. Tiny areas cleaned by area (1 mm²) rather than by width: specks go, thin strokes and small letters stay.
6. Painter's order largest first and the design-wide row grid: neighbouring fills' rows line up, so seams don't
   stripe.

---

## 7. Why their files break our limits (from reading; not measured on their files)

The bake-off checker found up to **38 hits per mm²** (ours: 24 per 1 mm square per colour block at any 0.1 mm
offset) and up to **15.6 %** of stitches of 0.3 mm or less (ours: 2 %, bar the first six after a jump, trim or
colour change). Their stitch builder has no density or short-stitch limit, and the picture path hands it shapes it
was not made for.

### 7.1 Tiny stitches: the row link on steep edges
- Each row ends on the outline and the next row starts on the outline beside it. Where the outline crosses the
  rows at angle φ (90° = square to the rows), the link between the two is spacing / sin φ long.
- With spacing 0.25 mm, the link is **0.25 mm at φ = 90°** and stays at or under 0.30 mm for φ ≥ 56.4°; after
  rounding to the 0.1 mm grid, links up to 0.349 mm read as 0.3. They are never merged (merging stops at 0.1 mm).
- A row's other stitches are at least 0.5 mm (lattice kept 0.5 mm from the ends), so the tiny share is about
  (links on steep edges) / (all stitches). A 10 x 10 mm square: 39 of 199 stitches, **19.6 %**. Shapes with long
  horizontal edges score less; lettering, made of upright strokes, scores more.
- Rows of 0.3-0.35 mm (the shortest kept) across thin strokes are themselves tiny: in lettering, a stroke 0.3 mm
  across the rows gives a row stitch, two links and nothing else.

### 7.2 Density: tatami on thin features is all row ends
- Inside a wide fill: about 1 / (0.25 x 3.0) = **1.3 hits per mm²** from the top, plus about 0.2 from the
  underlay. Harmless.
- Every time a row crosses an outline it leaves a hit there. In a 1 mm square, rows give 1 / 0.25 = 4 rows, so hits
  ≈ **4 x (number of outline crossings per row inside the square)** + the lattice.
- One thin stroke crossing a square: 2 crossings per row, 8 hits. Three strokes in one square (an "e", "m" or "w"
  at 2-3 mm cap height, close letters, a serif beside a stem): 6 crossings per row, **24 hits** from row ends
  alone, before anything else.
- On top of that, in the same colour block:
  - each run start adds 4 lock hits within 0.4 mm and each trimmed end 4 more; every small letter is its own run
    (gaps between letters over 1 mm are trimmed, with nothing to route under), so a small letter carries 8-9 lock
    hits in two spots;
  - underlay rows (1.5 mm apart) add their own ends on strokes over 1.1 mm wide;
  - travel between a shape's sections runs over or along the shape (a hit every 3 mm, often through the same narrow
    parts more than once).
- Worked: three 0.4 mm strokes 0.3 mm apart in one 1 mm square, rows square to them, plus one run start in that
  square: 24 (row ends) + 1 (lattice) + 5 (start and its lock) = 30; with a trimmed end there too, 34. A shape
  that reaches 38 is of this kind. (The exact spot in each bake-off file was not located: see section 10.)
- Overlap is not the cause in the default route: shapes abut (3.10), and overlap removal finds nothing to cut. With
  "remove white background" off it would add 0.5 mm double-sewn bands, but in two colour blocks, which our
  per-block rule does not add up.

### 7.3 Summary of causes
| Failure | Cause in their pipeline |
|---|---|
| Tiny stitches | Row links on outlines steeper than 56° to the rows (0.25 mm spacing), rows of 0.3 mm across thin strokes, 0.1 mm merge limit, rounding to 0.1 mm |
| Density | Every thin stroke and small letter sewn as tatami (no satin or run in the default route), so row ends pile up 4 per mm per crossing; locks of 4 hits at every run start and end; no density limit anywhere |

---

## 8. Where ours wins, and what is worth taking

| Their behaviour | Our rule | For the implementer |
|---|---|---|
| Thin strokes and small letters sewn as tatami at 0.25 mm | 24 hits per mm² per block; tiny stitches over 2 % fail | Keep their *outline* of a thin part, not their stitch: a part under about 2 mm across goes to our satin / run / lettering paths (`docs/lettering.md`, `docs/pictures.md`), built with easing on |
| Row links of 0.25 mm | Tiny over 2 % fails | Rows stay as `fill.js` makes them (our spacing and its link handling) |
| No locks in the planner; 4 hits at 0.4 mm in the file | `Design.tieOff()` and tie-ins (0.7 mm, one hit 0.35 mm aside) | Take none of theirs |
| Gaps up to 1 mm always sewn across; 1-5 mm gaps between letters cut | `MOVES`: up to 2 mm stitched, 2-5 mm loose thread counted, over 5 mm trimmed | Ours |
| Traced RGB kept; nearest PEC thread chosen in the writer | `machineThreads()`; two colours never one thread | Ours |
| Size from a fixed 80 mm or 80 % of the hoop | Our sizing (`digitize.js` sizing, hoop fit minus 2 mm) | Ours decides size; but note their result: small lettering survives because it is sewn large |
| Pull 0 on fills | `FILLS` pull by fabric (0.20 cotton) | Ours; their crisp edges do not come from pull |
| Speck rule by area only (1 mm²), no width rule | Our piece rules | Worth taking as a *replacement* for size rules that drop small letters: drop by area, keep thin |

**Worth taking** (all of it in the picture path, before stitches; none of it touches `formats.js`):
1. Read each pixel as a blend of the palette colours (3.4) and place edges on the equal-blend line of a smooth
   interpolation (3.8): edges to a fraction of a pixel instead of pixel cracks.
2. Fit outlines as 3.12: corner restoration, lines, arcs, few cubics within 0.04-0.24 px, two-way verification.
   Then hand fills exact outlines (our fills already cut rows off an outline).
3. White never a palette colour, always its own class; "background" white left bare with holes cut, enclosed
   transparency treated as white (3.7, 3.10). Reconcile with our position rule for white (`docs/pictures.md`):
   theirs leaves *all* white bare; ours lets a person sew white that the design needs.
4. Speck and hole cleanup by area (3.9), so thin strokes and small letters survive.
5. Shared edges: abutting colours from one competition field (3.8) or one fitted curve per shared edge (4.5), plus
   a hairline overlap (3.11); compare with our seams (`docs/pictures.md`).
6. The flat-art test and the posterize fallback (3.3, 4.1) as the switch between our flat and photo handling.

---

## 9. Test cases

Images are drawn in the test (no files). "AA" = anti-aliased (each edge pixel's colour is the area-weighted mix,
e.g. by 4 x 4 supersampling). Sizes are at ZigZag's default width unless said. Lengths in source px unless said.

| # | Input | Expect |
|---|---|---|
| T1 | 400 x 200 white image, AA red disc centre (100, 100) radius 60, AA blue bar x 260..340, y 40..160; defaults | Flat route; palette {red, blue}; two filled shapes; no white shape; design 80 x 40 mm (0.2 mm/px). Disc outline is one circle (arcs only, no corner) with radius 60 ± 0.1 px; bar outline is 4 straight lines with corners within 0.1 px of (260, 40) … (340, 160) |
| T2 | T1 drawn without AA (hard edges) | Still two shapes; the disc's outline within 0.5 px of the true circle everywhere and expected to be fitted as a circle (the hard-edge path, 3.6, loosens the tolerances; circle tolerance 0.45) |
| T3 | AA square 100 x 100 px rotated 30°, on white | Four corners within 0.15 px of the true corners (restored, 3.12), four straight lines, no curve |
| T4 | 800 px wide white image, black dots: 2 x 2 px, 9 x 9 px, 11 x 11 px; width 80 mm (0.1 mm/px) | Areas 0.04, 0.81, 1.21 mm²: the first two dropped, the third kept |
| T5 | Blue square 200 x 200 px with a white square counter inside of 9 x 9 px and another of 12 x 12 px, 0.1 mm/px, remove white on | Blue shape has exactly one hole (the 12 x 12, 1.44 mm²); the 0.81 mm² counter is filled blue |
| T6 | A red disc radius 80 with a blue disc radius 30 inside it, on white | Two shapes; red has one hole matching the blue disc's outline within 0.1 px plus the 0.06 wpx overlap; sewing order red then blue (larger area first) |
| T7 | T6 with remove white off | Three shapes (white background area, red, blue); none has a hole; order by area largest first |
| T8 | Transparent PNG: a black ring (outer radius 50, inner 30) with the inside transparent, outside transparent | The inner disc is enclosed: it becomes white (3.7); with remove white on, the ring has a hole; the outside is not traced |
| T9 | 256 x 64 horizontal gradient red to blue | Flat score under 0.93: posterized route ("posterized"), at most the asked colours |
| T10 | White page with black lines 2 px wide (AA), nothing else | Palette found from stroke cores = {black}; the light edge greys folded in; lines traced as thin filled shapes (Lines off) |
| T11 | A scan-like page: paper 250 grey top-left shading to 225 bottom-right, black text | Paper tones fold into one colour (3.2 step 6) or are white (≥ 245); text traced in one black |
| T12 | Sizing: 1000 x 500 image | Command line / open: 80 x 40 mm. Editor with a 130 x 180 hoop: min(104, 288) = 104 mm wide. A 500 x 1000 image in that hoop: min(104, 72) = 72 mm wide |
| T13 | Colour count: a 600 x 300 logo of 3 large colours plus a 3 x 30 px accent of a 4th | The accent is traced as its own shape in its own colour (found in 3.2, or, if its votes fall under 0.1 %, added in 3.5); it is not absorbed into a neighbour |
| T14 | Stitch check (theirs, for contrast): a 10 x 10 mm square fill, standard settings, underlay off | 200 points; 39 row links of 0.25 mm; 19.6 % tiny. **Ours must give 0 % links under 0.3 mm on the same outline** |
| T15 | Stitch check (theirs): three vertical bars 0.4 mm wide, 0.3 mm apart, 5 mm tall, one fill, rows at 0° | 24 row-end hits in a 1 mm square across the three bars, before locks. **Ours, from the same outline: under 24 at every 0.1 mm offset (the bars go to satin/run or eased rows)** |
| T16 | Speck rule vs thin: a 0.3 x 4 mm bar (1.2 mm²) and a 0.9 x 0.9 mm dot (0.81 mm²) | Bar kept, dot dropped |

---

## 10. Not determined
- Where exactly the 38 hits per mm² and the 15.6 % tiny stitches sit in the bake-off files: the stitch files were
  not analysed here (only ZigZag's traced SVGs were seen, not its PES). Section 7 is the mechanism from reading;
  confirm by running `quality.js` density maps on their PES, expecting the hot spots on small lettering and
  thin strokes.
- Which route each bake-off picture took (flat logo or posterized): it depends on the 0.93 score; a JPEG with
  heavy ringing or a shaded scan may have gone posterized. Their trace reports it ("flat logo" / "posterized").
- The exact pole-boundary initialisation of the B-spline prefilter and the marching-squares orientation table
  are textbook (the papers named); the implementer should take them from the papers, not from this summary.
- The Color-mode sub-pixel crack shift in Black and White mode (threshold-dependent) and the gradient detector:
  ZigZag never uses them; not specified.
- The centre-line spur threshold's constants (a minimum and a multiple of the width) were not pinned down; only
  the published rule (prune a branch reaching less than a threshold beyond its junction's maximal disc).
- Whether the editor's bake-off placement scaled any picture further (fit to hoop on placing): depends on how each
  file was opened.
- Nothing here was run.
