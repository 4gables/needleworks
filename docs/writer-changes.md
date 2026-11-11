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
| # | Change | Blocks today | What is known | Proof needed beyond the usual | State |
|---|---|---|---|---|---|
| W1 | Design-block page (hoop) size other than 130 x 180 mm | 6" x 10" machines (NQ1700E class) and any hoop bigger than 5x7 (N4); a 4x4-only machine's page | The writer always writes the 130 x 180 page. Brother's lace samples carry a different page-size field (the one byte difference the Brother diff lists), so the field's place is known | Brother-made files for each hoop size read back with our reader; the PEC box rule unchanged; one sew-out on a 6x10 machine before it is offered | wanted (N4) |
| W2 | Where a long stitch is split | Stitches over 7 mm are halved inside the writer, out of `relieve`'s and the checker's sight: the extra needle holes land at cuts the builders never planned (the doctor works round it, `docs/open-tab.md`) | Brother keeps stitches up to 15.7 mm; our own limit is 12.1 mm | Splitting moved to `Design.finish` (builders see every hole) with the writer refusing over-long stitches, or the split raised to 12.1; density and longest-stitch rows on the scoreboard; a satin sew-out | wanted (S2) |
| W3 | Jumps the machine need not cut | Every jump is written as a trim (no uncut-jump flag `0x10`). On the PE900 nothing changes (it never cuts 5 mm or under, by its own setting), but PE-DESIGN and machines without that setting show and make a cut at every short hop | The flag's byte is in the spec | Which Brother machines honour the flag, from Brother-made files; no loose-thread count may change on the PE900 | to study |
| W4 | Thread chart entries carrying the chosen brand's name and number | The file's thread descriptions are plain ASCII colour names; a maker sewing Madeira or Isacord sees Brother names on the machine and in PE-DESIGN | PES v6 thread chart has catalogue-number, name and brand fields (spec) | What the PE900 screen shows for a non-Brother chart entry (it may show the nearest PEC colour regardless); ASCII rule kept | to study |
| W5 | Other formats out (DST, JEF, EXP, VP3) | Sharing with non-Brother machines | New writer files beside `formats.js`, each from a clean-room spec with an outside oracle (pyembroidery in tests) | Ask the owner first (roadmap) | not started |

Add a row the moment a round is stopped by the writer; say what it blocked and how it was found.
