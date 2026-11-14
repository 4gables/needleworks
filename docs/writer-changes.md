# PES writer: changes wanted

`js/core/formats.js` `writePES` is frozen byte for byte by `tests/fixtures/golden/*.pes`. The owner (2026-11-11):
changes that push what the files can do WILL be allowed. Every limit a round meets that comes from the writer is
listed here, with what it blocks and what proves the change. Nothing here is done until its row says so.

## How a writer change ships
1. The byte-level fact goes in `docs/formats-spec.md` first (from Brother's own files, measured; clean room).
2. One change at a time, behind nothing: the writer has one behaviour.
3. Proof, all of it: the Brother diff in the VM (`sh tests/vm/run.sh`: none of Brother's 379 samples sew
   differently, bytes differ only where listed), `pe900_check.py` on both batches, the box check and PE-DESIGN
   open in the VM, then the golden files regenerated in the same commit with the reason in the message.
4. A small test pack for a real machine, and a line in the release report saying it is unproven until sewn:
   PE-DESIGN reads only the design block, never the PEC bytes the machine sews.

## The list
| # | Change | Blocks | What is known | State |
|---|---|---|---|---|
| W1 | The page (hoop) in the PES header | 6" x 10" machines; any design bigger than 130 x 180 mm | See "W1" below: measured in PE-DESIGN 11 | **done** for 160 x 260 (v28). Unproven on a 6" x 10" machine |
| W1b | The 130 x 180 page for designs between 100 x 100 and 130 x 180 mm | Nothing on a machine. PE-DESIGN shows a 5x7 design on a 100 x 100 page (it draws past the page) | The same two u16; (130, 180) is in PE-DESIGN's hoop list | wanted, small: it moves two bytes in every 5x7 file and both golden files, so it goes with the next writer change that regenerates them |
| W1c | Pages for frames bigger than 160 x 260 mm, and fields past 409.6 mm | Brother and Baby Lock frames over 160 x 260 (left out of machines.js: PE-DESIGN would draw such a design past the page); Janome's RE46d (280 x 460) and Husqvarna's Regal (465 x 260), left out because every file, whatever its format, is judged as its PES and a PES stitch block holds 204.8 mm each side of its centre | Brother's hoop numbers in versions 9-11 (below); the PEC box is 12-bit | wanted, PX5 (2026-11-13): the page needs a measured version 6 layout; the 409.6 mm needs a gate that judges DST/VP3 on their own read-back for size, not through PES |
| W2 | Where a long stitch is split | Stitches over 7 mm are halved inside the writer, out of the builders' and `relieve`'s sight; a Brother-made satin over 7 mm wide gets a needle hole down its middle when a file is opened and written again | Brother's 379 samples: 49 have a stitch over 7 mm, 16 over 10 mm, 9 between 12 and 12.1, one at 16.7 (the Brother diff's "45 with our long-stitch splits" are these). So the machine sews 12.1 mm stitches from Brother's own files. Tried 2026-11-11: the split raised to 12.1 mm keeps both old golden files and every Node test but one: the doctor's "long" fix on `gnome.pes` relies on the writer's split to shorten stitches | wanted: `fix`'s long-stitch fix splits in the doctor first, then the writer's limit goes to 12.1 mm (Brother diff expected: the 45 become byte-identical or closer) |
| W3 | Jumps the machine need not cut | Every jump is written as a trim. On machines with Jump Stitch Trim nothing changes; PE-DESIGN shows a cut at every short hop | Brother's samples: 78 files leave 412 jumps uncut (flag 0x10), 249 files cut 1,668 (flag 0x20); the Brother diff's "78 trim where Brother only jumps" | to study: which jumps Brother leaves (by length), before anything is written differently |
| W4 | Thread chart entries carrying the chosen brand's name and number | Makers on Madeira or Isacord see Brother names in PE-DESIGN | None of Brother's samples is version 6, so no Brother-written chart in our layout exists to compare; `tests/vm/measure.ps1` `Chart` reads a v6 chart only | to study: needs a machine to see what its screen shows |
| W5 | Other formats out (DST, JEF, EXP, VP3) | Sharing with non-Brother machines | `js/core/formats-out.js` from `docs/formats-out-spec.md` (clean room), read back by pyembroidery; `formats.js` untouched | **done** for DST, EXP, VP3 (owner approved 2026-11-13): golden files, every batch design read back with the PES's needle points. Unproven on a Tajima, Melco, Bernina, Husqvarna or Pfaff machine (spec section 11). JEF **waiting**: Janome's thread order must be measured first (spec section 7). PX5 (2026-11-13): Janome machines are listed and get DST, which their manuals say they read; Janome's Artistic Digitizer (Windows) is the program to measure in, by trial only (serial and activation code by email, offered as dated promotions; none found open), so the VM step waits for one |

Add a row the moment a round is stopped by the writer; say what it blocked and how it was found.

## W1: what was measured and what ships (2026-11-11)
- **Where the hoop is.** In our version 6 header, after the five strings, the eighteen u16 begin 0, 0, 100, 100, 0,
  200, 200. PE-DESIGN 11 opened ten files written here that differ in one of these each (`docs/formats-spec.md`
  4.3.1): the second u16 is the page type (0 hoop, else custom size), the third and fourth are the hoop's width and
  height in mm (160, 260 selects "160 x 260 mm (Color LCD)" and the 150 x 250 mm design sits centred on it), the
  sixth and seventh the custom size. The first and fifth showed nothing.
- **How firm.** Firm for PE-DESIGN 11: seen in its Design Settings dialog, file by file. Not from a Brother-written
  version 6 file: Brother's 379 samples are versions 8 to 11 (none 6), where the same things sit in a longer layout
  (a hoop number, mm, tenths of an inch). A PE-DESIGN made for a 6x10 hoop and saved as version 6 would settle it
  for good; the trial cannot save.
- **The machine.** Brother machines sew the PEC block, which names no hoop: its bytes for a design are the same
  whatever the page (formats.test: the 160 x 260 file differs from the 100 x 100 one in those four bytes alone).
  Brother's own samples made for bigger hoops (180 x 300, 200 x 200, 200 x 300) have ordinary PEC blocks.
- **What the writer does.** `pesPage`: (100, 100) for a design a 130 x 180 field holds either way up, as always
  (441 of 441 batch files and both golden files byte-identical to v27); (160, 260) for anything bigger. New golden
  file `big_6x10.pes`; three batch files `st_6x10_*`. `pe900_check.py` judges files named `*6x10*` on the 160 x 260
  field and checks every v6 file's page.
- **Proof run.** formats.test; Brother diff in the VM: 378 compared, 227 byte-identical, 73 sew the same, 78 trim
  where Brother only jumps, 0 differ (as before); box check FITS 14 of 14; the three batch files opened in
  PE-DESIGN 11 on the 160 x 260 page.
- **Unproven.** Nobody here has sewn one of these on a 6" x 10" machine. First thing for a tester with one:
  `st_6x10_frame_name` (153 x 243 mm): does the machine list it, show it whole and centred, and ask for the 6x10
  frame; then a 5x7-sized file on the same machine.
- Brother's hoop numbers in versions 9 to 11, for later: 0 = 100 x 100, 1 = 130 x 180, 4 = 180 x 300, 5 and 6 hold
  designs up to 170 x 170 and 190 x 253 (200 x 200 and 200 x 300 by size), 19 one of 277 x 175. `tests/vm/measure.ps1`
  reads them (load it with `iex (gc D:\m\m.ps1 -Raw)`: dot-sourcing is blocked by the VM's script policy).
