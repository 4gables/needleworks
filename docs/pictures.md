# Pictures (`digitize.js` in `worker.js`)

Reference for this part of Needleworks: the rules, the reason for each (it stops someone undoing it) and the number that proved it. Hard rules are in `AGENTS.md`. Add a lesson where its topic is, never as a round log.

- One job at a time, newest kept; restarted after 60 s. Styles: Filled (`build`), Line drawing (`lineArt`),
  Cross-stitch (`crossStitch`). No fabric selector: density is the only fabric knob.
- Colours are learned once per picture (`learnColours`, `LEARN` 800 px copy of the content box) and labelled onto any
  working image (`labelWith`): Size and Turn never change threads (`analyze` = both, for the batch).
- Palette: `FINE` 24 k-means clusters on flat pixels, background shades set aside, merged pairwise, cheapest first, to
  the count asked and on while under `SAME` 7 (CIEDE2000, hue weighted, darks below L 30 read black, non-solid groups
  cheap, cross-family dear). Each count = the next with one split (more colours never lose one). Default 6
  (`DEFAULTS`). Worse: kL 2 (stems into leaves), 16 clusters, folding slivers into neighbours. `findFrame`: an edge band
  of one colour family is a frame; learned again without it.
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
- Filled: shapes 1 mm or wider get tatami following the outline (skeleton satin broke corners); parts under 2 x
  `THIN_PART` and lines under 1 mm sew a triple run, never dropped. Specks: under 4 mm² and 2.5 mm across, groups
  under 6 mm of line, walks under 1.5 mm (`lostLines` reports dropped fine lines). Kept: text dots on the fabric (>= 0.8 mm across, 0.6
  mm², within 5 mm of their colour or another such dot) and marks >= 2 mm long, 1.5x longer than wide, within 2 mm of a
  bigger piece of their colour (apostrophes). Thin shapes (< 2 mm) 0.05 mm
  pull, else 0.15. `OVERLAP` 0.35 mm under later colours, shape by shape (growing the raw mask merged specks);
  neighbours alternate angle (+90°). `DENSITY` Standard 0.4 (the app's default; `DEFAULTS.density` is Dense) / Dense
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
  have a "Details" slider, Stitch Era deletes 30-50 % of traced shapes): "Keep all" is the rules above and nothing
  more; "Most" is the default; "Main shapes only" is the person's choice. A *piece* is the parts of one colour the
  needle reaches without a cut (one's end within 2 mm of the next one's start, or in its travel region within
  `TRAVEL`), measured in mm of thread it sews.
  - Most: a piece under 8 mm and under a tenth of its colour's biggest goes, and so does one that only a jump
    reaches and that sews under 8 mm (a run of nothing but its own locks). Kept dots (an eye, an i's dot, a mark by
    a bigger piece) stay. 12 samples: trims 1,162 -> 1,118, loose threads 67 -> 55, wasted moves 39 -> 27; no sample
    has more trims or loose threads. The corpus hardly changes (2 of 117 files): its pictures have few specks.
  - Main shapes only: flecks to 12 mm² with half their edge against other colours take that colour; a piece under
    80 mm, under half its colour's biggest and among the smallest that together sew 30 % of the colour's thread
    goes, unless 30 % of its edge lies against other colours (part of something). Samples: trims 1,162 -> 853
    (-27 %), loose 67 -> 39 (-42 %); five held-out pictures 1,418 -> 950 (-33 %), 82 -> 46; corpus 538 -> 440
    (-18 %), 9 -> 5, where small lettering loses letters (17 of its 122 cases then fail its drawn-against-sewn
    checks, as they should). What is left is whole sprigs and shapes: a third off the trims on every picture would mean
    dropping those.
  - The panel says how many pieces were left out, with "Keep them all"; the left-out-parts warning offers "Keep
    all the small details" when that sews them, and is not raised for "Main shapes only" (a choice, not a fault).
    Remembered with the picture (`pic.last`). Guard: ui_sweep `picture-details`; `picture_corpus.sh ... details=main`.
  - Travel under a later colour's fill is planned only under fills no level can leave out (`solid`: a fill of at
    least `level.start` mm of thread), so nothing left out bares a travel run.
  - Worse: pieces found from the picture alone (colour touching colour): the router's regions are narrower, so
    almost every piece looked joined and 5 of 1,162 went. By size alone at 60 mm: a sheet of 18 sprigs lost 31 of
    its 49 pieces (every sprig is a main shape there: hence "among the smallest that sew 30 %"). The 30 % rule
    without "under half the biggest": a pattern of equal dots lost a random third of them. 15 mm at the default:
    2 mm leaves went from a 60 mm sheet.
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
