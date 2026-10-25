---
name: embroidery
description: Make Brother .PES embroidery files (e.g. a name bookmark like an inspiration photo) for a Brother PE900 with a 5x7 hoop, show a preview, and write simple stitching steps. Use whenever the user wants an embroidery design, a PES file, a bookmark with a name, or a preview of a PES file.
---

# Embroidery (Brother PE900, 5x7 hoop)

The person using this is a sewist, not a programmer. Talk plainly, never show code, and don't ask
technical questions. Do the setup yourself.

## First run on a new Mac
1. If `.venv` does not exist: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`.
   If macOS pops up "install command line developer tools", tell her to click **Install**, wait for it
   to finish, then say "done" so you can continue.
2. Fonts live in `fonts/`. To try another Google font, download its .ttf from
   `https://github.com/google/fonts/raw/main/ofl/<family>/<File>.ttf` into `fonts/`.

## Making a name bookmark (the common case)
1. Look at any inspiration image she gives you: note the lettering style (script? print? thin? bold?),
   thread color, and whether the name has long lead-in/tail lines.
2. Pick the closest font. Sacramento (`fonts/Sacramento-Regular.ttf`) matches thin monoline scripts. Also in `fonts/`:
   Allura, Parisienne, Corinthia, Ephesis, Meow Script, Great Vibes, Alex Brush, Ms Madi, Satisfy, Cookie,
   Yellowtail, Rouge Script, Italianno. If the long lead-in/tail strokes look wrong for a name, add `--no-swash`.
   If unsure, render a comparison sheet of 3-4 fonts with Pillow, `open` it, and let her choose by number.
3. Run: `.venv/bin/python make_bookmark.py "<Name>" --font fonts/<font>.ttf --color "#rrggbb"`
   (one word names work best). Output: `out/<Name>_bookmark.pes` and `out/<Name>_bookmark_preview.png`.
4. Look at the preview yourself (Read the PNG) before showing her. Check: letters joined, swashes flowing
   out of the first/last letter, text centered, nothing touching the border. Fix and re-run if not.
5. Run `open out/<Name>_bookmark_preview.png` so she sees it, and ask if she'd like any changes.
6. When she's happy: `cp out/<Name>_bookmark.pes ~/Desktop/` and tell her to copy that file from her
   Desktop onto a USB stick (not inside a folder).
7. Give her the stitching steps below, with the name filled in.

## Other designs
`needleworks/` is a small library: `text.py` (script text to satin strokes), `geom.py` (run, satin,
zigzag, shapes), `pes.py` (`Design` builder, PE900 size check), `preview.py` (render any PES).
Build new designs the same way `make_bookmark.py` does. Each `Design.color()` call makes the machine
pause, which is how in-the-hoop fabric steps work. Always keep designs inside 126 x 176 mm and always
render a preview by reading the PES back. To preview a PES she already has:
`.venv/bin/python -c "from needleworks import preview; preview.render('<file>.pes', 'out/p.png', fabric_block=None)"`.

## Stitching steps to give her (bookmark)
Supplies: tear-away stabilizer, front fabric ~3x8 in, felt for the back ~3x8 in, thread plus a
matching bobbin, tape, small sharp scissors, ~12 in of 3/8 in ribbon.
Hoop only the stabilizer. On the PE900: USB, pick the file, Set (don't rotate/resize). Keep the same
thread in the whole time. The 5 "colors" on screen are pauses:
1. It sews the outline on the stabilizer.
2. Tape the front fabric on, right side up, press Start. Remove the hoop (leave everything hooped),
   trim ~1/8 in outside the line, put the hoop back.
3. It sews the name.
4. Tape felt to the back of the hoop, press Start. Remove the hoop, trim the felt ~1/8 in outside the line, put it back.
5. It sews the ribbon hole and border.
Finish: tear away stabilizer, snip fuzz, cut out the ribbon hole, loop the ribbon through.
