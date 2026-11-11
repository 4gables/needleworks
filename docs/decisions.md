# Decided against, and still open

What was tried and rejected (don't retry without new numbers) and what is known but not done. The plan is `docs/roadmap.md`.

## Decided against
- Ink/Stitch short stitches and 3-hole locks (would change the bookmark for little), contour underlay under picture
  fills (overlap fixed the gaps), split satin (nothing over 3.6 mm in lettering; split at 7 mm if added), a 1.5 mm
  minimum satin, sewing all moves of 3 mm or less (lines between print letters), satin cut short at junctions (gaps
  in A and h), re-aiming print apex stubs.
- 1 px source lines in Filled pictures, keeping the On my item photo across starters, undo across reloads.
- Picture matcher for #803CC8: Brother Magenta (ΔE00 9.9) over Violet (11.8, 12 L darker); Violet stays in the swaps.
- Busy pictures' trims are their separate shapes: no safe win.

## Open
- Machine: does the PE900 also cut 0x20 trims of 5 mm or less (the loose-thread count assumes not)? Sew along's
  "Sewed with the wrong thread?" wording is unchecked on a PE900.
- Threads: pure white as Isacord 0015 rather than 0003 (Amann's card draws whites bluish)? Dusty pinks (chroma ~6)
  still Warm Gray.
- Lettering: Alex Brush's b loop is lost ("Abbie" reads "Avvie"); Quicksand's rounded V/M bottoms stop short; dense columns where 3 strokes meet the
  towel lattice (within 24); dots by READ's stars (the satin round the stars' points).
- Appliqué: combine same-thread stages (6 pauses could be 3); tack-down ends 1.4 mm from the edge walk's start (2
  short jumps across a pause); only the first fabric block gets a fabric shape in the preview.
- Quilting: narrow heart/diamond tips stay empty; quilt label with stipple sews as 3 lines.
- Lettering: where script strokes cross or meet, two or three satin columns lie on each other (Ashley 2026-11-06: "the
  thread got super thick"). Normal for script; the densest spots stay at or under 24/mm², and capping lettering at 18
  dropped only 15 of 3,300 stitches in "Read Receipts", so density isn't the lever. Unchecked: Brother's own script
  fonts at crossings.
- Pictures: "make it stitchable" (thicken/drop too-fine detail); 1-2 mm outlines as satin (needs variable-width satin
  through junctions); etsy_6's green panel still sewn; etsy_7's pastel lines; etsy_4's greyish-lavender title;
  etsy_5 at 4 colours merges grass and yellow; slab-serif centre lines lose serifs; a soft shadow's core joins its
  colour at 2 threads; 0.6 mm strokes in a compressed JPEG partly sewn.
- Open tab: trims rise after re-stitching at 70 %.
- `pe900_check.py`'s max density reads lower than a full offset scan below the limit (pass/fail unaffected).
- Design tab: Patch starter + Lettering lands below JD. Speed: a big carved patch refills on every change
  (1.5-4.7 s; wants a carve worker like quilting); thread/fabric change on 15-26 pieces 1.1-2 s.
- Pictures: etsy_7 cross-stitch can't hit the asked Size exactly (said under the Size slider). Junk JPEG streaks are
  traced as tiny lines in line drawings (jpeg_flower).
- Josefin N/M apex sides 0.5 mm outside the ink. Tiny print (5 mm dates) still leaves loose threads where no start helps.
  Pasting a 30+ letter line is one ~0.6 s drawing. A patch's `clearOf` measures lettering against the whole fill.
- Flow: fill-internal hidden moves in `fillPolygon`, repeated tie-in holes in `Design.path`, ~47 script moves on arcs.
- Text: CJK/Arabic names save as design.pes (the fonts lack them anyway).
- Not built: photo stitch, free-standing lace, 3D puff.
- Picture tab, intermittent: in a full `ui_sweep --quick` run the `picture` state is "never ready" (Download still
  disabled 30 s after the sample picture opens) in 1-2 of ~330 cases, at a different window size each time. Present
  at v12 too (1 of 2 runs), never when the state runs alone (80 of 80). Picture output is unaffected (corpus
  byte-identical). Not yet known whether the page's worker stalls (it restarts after 60 s) or the test's tabs get
  in each other's way; `check.sh` reports it as a failure until it is found.
