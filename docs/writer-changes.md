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

## W1: where the work stands (2026-11-11, stopped early; `formats.js` and the golden files untouched)
Known:
- What we write today (`docs/formats-spec.md` 4.3-4.4): u16 `1` at offset 12; eighteen u16 after the five header
  strings, starting 0, 0, 100, 100, 0, 200, 200; `CEmbOne`'s translation 1000 - W/2, 1000 + H/2 (the design's
  centre at 1000, 1000 in 0.1 mm). None of these changes with the hoop. Which of them Brother reads as the page
  (the u16 at 12, the 100/100 pair, the 200/200 pair, or the translation) is NOT established: that is step one.
- Of the 11 files in `tests/external/pes` only the #PES0060 ones carry our own layout (same header values): they
  are not Brother-made and prove nothing about the page.
- The Brother diff already shows Brother's PEC size field is sometimes its page, not the stitches' extent (lace
  and tutorial samples: 120 x 170 mm), that Brother leaves some jumps uncut (W3) and keeps longer stitches (W2).
- PE-DESIGN's trial cannot save, so the VM cannot make a 160 x 260 file: the facts must come from the 379
  samples in the VM's `C:\bro`, or from a Brother-made 6x10 file from a maker's machine or Brother's site.
- The VM has no network adapter: nothing comes out but the screen. `tests/vm/measure.ps1` (goes in on the ISO
  under `D:\m\`; `. D:\m\m.ps1; $R = Measure-All`) reads each sample's version, header fields, `CEmbOne`
  translation and size, PEC size, longest stitch and the jump flags (0x10 uncut, 0x20 cut), and `Chart FILE` a
  thread chart (W4). It was written and loaded but its first run was cut short: no numbers yet.
Next: run it (`$R | group Ver`, then `$R | group Hdr`, `$R | group A12`, the translation against EW/EH), write the
page bytes into the spec, then the writer, then the proof in "How a writer change ships".
