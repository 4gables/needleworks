# Embroidery file formats out: DST, EXP, JEF, VP3 (functional specification)

This document specifies four writers that sit beside `js/core/formats.js` and never change it: Tajima **DST**, Melco
**EXP**, Janome **JEF** and Husqvarna Viking / Pfaff **VP3** (`docs/writer-changes.md` row W5, approved by the owner
2026-11-13). It is the clean-room spec of `AGENTS.md`: behaviour, byte layouts and rules, no code. Whoever implements
it works from this file and `docs/formats-spec.md` alone, in their own structure, and never opens the sources named
below.

It continues `docs/formats-spec.md` and uses its conventions, its `normalize` and its thread helpers. Section numbers
written "formats-spec 3.2" point there; plain "section 3" points here.

**Sources read for this spec** (2026-11-13):

- pyembroidery 1.5.1's DST, EXP, JEF and VP3 writers and readers (the byte layouts; the same code Ink/Stitch ships, so
  these layouts are what thousands of hobby machines already sew).
- Public format notes: EduTechWiki "Embroidery format DST / EXP / JEF / VP3" and the KDE Liberty project's "Tajima
  Ternary", "Janome Embroidery Format" and "Viking Pfaff" pages. Where they disagree with pyembroidery it is said.
- mySewnet's software help ("Thread Colors and the Husqvarna Viking Designer SE") for what a machine shows from a VP3.

**How firm it is.** Every layout below was written out by a throwaway script from this text and read back with
pyembroidery's four readers: stitches, colours and commands came back as section 9 says. Nothing here has been sewn
on a Tajima, Melco, Janome, Husqvarna or Pfaff machine by us. Section 11 lists what could not be determined.

Where this spec **departs from pyembroidery on purpose** it says so and why (section 10.2). The departures are in
header numbers only (extents, counts, centres); the stitch bytes are the same.

---

## 1. Conventions

Everything in formats-spec section 1 holds (0.1 mm units, y grows **downwards**, command codes, `pyRound`, extents).
Additions:

- **s8**: one byte holding a signed value −128 … 127 in two's complement. The writers only ever store −127 … 127.
- **u32 LE / i32 LE**: 4 bytes, low byte first (JEF). A negative i32 is two's complement, so −1 is `FF FF FF FF`.
- **u16 BE, i16 BE, u32 BE, i32 BE**: high byte first (VP3). VP3 has no little-endian field.
- **Wide string** (VP3): u16 BE byte length, then the text as UTF-16BE without a byte-order mark. The empty string is
  `00 00`.
- **Byte string** (VP3): u16 BE byte length, then the text as UTF-8. The length counts **bytes**, not characters.
- **File y**: DST, EXP, JEF and the VP3 header fields have y growing **upwards**. "File dy" below is always minus our
  dy. The VP3 stitch bytes are the one exception (section 6.6).
- Hex bytes are written `80 04`. ASCII text is written in backticks.

---

## 2. Input and the shared front end

### 2.1 Exports

One new module (suggested `js/core/formats-out.js`; any file layout is fine, new files go in `sw.js` `FILES` and start
with the copyright comment of formats-spec 3.1):

| name | signature | result |
|---|---|---|
| `writeDST` | `(pattern, name = "Untitled")` | `Uint8Array` (section 3) |
| `writeEXP` | `(pattern)` | `Uint8Array` (section 4) |
| `writeJEF` | `(pattern, date = now)` | `Uint8Array` (section 5) |
| `writeVP3` | `(pattern)` | `Uint8Array` (section 6) |
| `janomeThreads` | `(threads)` | the Janome palette entry of each thread (section 5.4) |
| `needlePoints` | `(stitches)` | section 2.6 |
| `readBack` | `(bytes, format)` | `{ stitches, changes }` (section 8) |

`pattern` is exactly what `writePES` takes (formats-spec 3.1): `{ stitches: [[x, y, cmd], ...], threads: [...] }`,
trims written as TRIM entries, tie-ins and tie-offs already in the stitches. The writers add **no** locks, no
connectors and no stitches of their own. pyembroidery's optional tie-on/tie-off is off by default as well, so nothing
is lost by that.

### 2.2 The stitch list

Every writer starts with `st = normalize(pattern)` (formats-spec 3.2) cut after its **first END** (entries after it
are dropped; `normalize` guarantees there is one). So all four formats sew the needle points of the PES file: stitches
split at 7 mm exactly where the PES writer splits them, integer coordinates by `pyRound`. The longer steps each
format could carry (12.1 or 12.7 mm) are deliberately not used: one design, one set of needle holes, one checker.

Errors, checked in this order, same wording as `writePES`:

1. No STITCH in st: `Error("There's nothing to stitch.")`.
2. More than 250 entries that are COLOR_CHANGE or STOP: `Error("Too many colour changes for a <FMT> file (250 max).")`
   with DST, EXP, JEF or VP3 for `<FMT>`.

### 2.3 Segments and their threads

A **segment** is a stretch of st between thread stops. st is cut at every COLOR_CHANGE **and every STOP**; the
COLOR_CHANGE or STOP entry itself belongs to no segment. There are always (COLOR_CHANGE count + STOP count + 1)
segments, and a segment may be empty (two changes in a row).

Threads: copy `pattern.threads`; while it is shorter than (COLOR_CHANGE count + 1), append its last thread again, or
`{ color: "#000000" }` when it is empty (formats-spec 4.1 step 4, with this count). Call it T. Segment 0 sews T[0].
A COLOR_CHANGE moves on to the next thread of T; a STOP keeps the current one. The **segment thread list** S has one
thread per segment, in order. Example: S, C, S, STOP, S, C, S with T = [a, b, c] gives S = [a, b, b, c].

Why STOP is a segment: none of these formats has a "pause" of its own. A machine pauses at a colour change, so a
pause is written as a change to the same thread. That is what commercial files do, and it is how the site's own
pauses reach the PES file (a COLOR_CHANGE between two blocks of one thread). pyembroidery drops STOP in VP3 and
gives it a private marker in JEF; neither is followed here.

DST and EXP carry no thread information, but they still write one colour-change record per segment boundary.

### 2.4 Moves (DST, EXP, JEF)

These three formats are a flat stream of relative records. The **move list** is built from st once, with the
format's per-axis step limit **L** (DST 121, EXP 127, JEF 127). Keep the encoder position (ex, ey), starting at
(0, 0). For each entry of st:

- **STITCH or JUMP** at (x, y): dx = x − ex, dy = y − ey, n = ⌈max(|dx|, |dy|) / L⌉.
  - JUMP with n = 0 (it does not move): emit **nothing**. (A zero jump is the trim signal in JEF, section 5.5.)
  - STITCH with n = 0: emit one stitch move (0, 0). It is a needle drop in place, e.g. the stitch that follows a jump
    to the same point.
  - Otherwise the points qᵢ = (pyRound(dx·i / n), pyRound(dy·i / n)) for i = 0 … n (multiply first, then divide, as
    in `normalize`), and the pieces pᵢ = qᵢ − qᵢ₋₁. Emit p₁ … pₙ₋₁ as **jump** moves, and pₙ as a jump move (JUMP) or
    a stitch move (STITCH). Every piece is within ±L on both axes.
  - Set (ex, ey) = (x, y).
- **TRIM**: a trim record. **COLOR_CHANGE or STOP**: a change record. **END**: the end record.

In a normalised list a STITCH needs more than one piece only when it is the very first STITCH or JUMP of the design
(which `normalize` never splits): the needle travels there by jumps and the last piece drops it. A JUMP of up to
121 mm becomes up to 10 pieces.

Example: a JUMP from (10, −38) to (310, 60) with L = 121 or 127: dx = 300, dy = 98, n = 3, q = (100, 33), (200, 65),
(300, 98), so three jump moves (100, 33), (100, 32), (100, 33).

### 2.5 Extents

- **E**: the extents of every entry of st (formats-spec 1.6), commands included. W = maxX − minX, H = maxY − minY.
- **E₀**: E widened to include the point (0, 0). From it, the four distances from the origin, all ≥ 0:
  **left** = −minX, **right** = maxX, **up** = −minY, **down** = maxY.

(0, 0) is where the machine's needle is when it starts: the middle of the hoop on a home machine, the operator's start
point on a Tajima. DST and JEF store how far the design reaches from that point, so they use E₀. VP3 stores a design
box and its centre, so it uses E.

### 2.6 `needlePoints(stitches)`

The positions `[x, y]` of the STITCH entries, in order, leaving out a STITCH at the same position as the needle point
kept before it. (Not formats-spec's `moves`, which looks at the previous *entry*.) This is what the fabric gets, and
it is the same list for the PES file and all four formats here: sections 8 and 9 are built on that.

---

## 3. `writeDST(pattern, name = "Untitled")`

Tajima's stitch format, read by nearly every commercial machine and every embroidery program. A 512-byte text header,
then 3-byte records. No threads, no hoop.

### 3.1 File layout

| part | start | size |
|---|---|---|
| header | 0 | 512 |
| records | 512 | 3 × R, R = the number of records, the end record included |

### 3.2 Header

ASCII text fields, each ended by a carriage return `0D`. Numbers are decimal, right-aligned, padded on the left with
**spaces**.

| offset | size | content |
|---|---|---|
| 0 | 20 | `LA:`, the label left-aligned in exactly 16 characters (space-padded), `0D` |
| 20 | 11 | `ST:`, R in 7 characters, `0D` |
| 31 | 7 | `CO:`, the number of change records in 3 characters, `0D` |
| 38 | 9 | `+X:`, **right** in 5 characters, `0D` |
| 47 | 9 | `-X:`, **left** in 5 characters, `0D` |
| 56 | 9 | `+Y:`, **up** in 5 characters, `0D` |
| 65 | 9 | `-Y:`, **down** in 5 characters, `0D` |
| 74 | 10 | `AX:`, a sign `+` or `-`, \|ax\| in 5 characters, `0D` |
| 84 | 10 | `AY:`, a sign, \|ay\| in 5 characters, `0D` |
| 94 | 10 | `MX:+    0`, `0D` |
| 104 | 10 | `MY:+    0`, `0D` |
| 114 | 10 | `PD:******`, `0D` |
| 124 | 1 | `1A` |
| 125 | 387 | spaces `20` |

- **Label**: `name` with every character outside 0x20 … 0x7E replaced by `_`, cut to 16 characters. A longer label
  would push every later field off its place.
- **R** counts every 3-byte record after the header: stitches, jumps (each trim is three), changes and the end.
- **left, right, up, down**: section 2.5, in 0.1 mm.
- **ax, ay**: where the design ends relative to its start: ax = the END entry's x, ay = **minus** its y. Zero takes
  `+`.
- MX, MY and PD belong to designs split over several files. They are always as shown.

### 3.3 Records

Each move or command is three bytes b0, b1, b2. A move carries dx and **file dy = −dy**, each within ±121, as five
balanced-ternary digits with the weights 81, 27, 9, 3 and 1. To find the digits of a value v, take the weights from
81 down: if v > ⌊w / 2⌋ the digit is +1 and v becomes v − w; if v < −⌊w / 2⌋ the digit is −1 and v becomes v + w;
otherwise the digit is 0. (The thresholds are 40, 13, 4, 1, 0.) v ends at 0 for every value within ±121.

Each non-zero digit sets one bit:

| weight | x digit +1 | x digit −1 | file-y digit +1 | file-y digit −1 |
|---|---|---|---|---|
| 81 | b2 bit 2 | b2 bit 3 | b2 bit 5 | b2 bit 4 |
| 27 | b1 bit 2 | b1 bit 3 | b1 bit 5 | b1 bit 4 |
| 9 | b0 bit 2 | b0 bit 3 | b0 bit 5 | b0 bit 4 |
| 3 | b1 bit 0 | b1 bit 1 | b1 bit 7 | b1 bit 6 |
| 1 | b0 bit 0 | b0 bit 1 | b0 bit 7 | b0 bit 6 |

This is the table of formats-spec section 7 turned round. Bits 0 and 1 of b2 are always set. Then:

| record | bytes |
|---|---|
| stitch move | the digits; b2 = digits OR `03` |
| jump move | the digits; b2 = digits OR `83` |
| change (COLOR_CHANGE or STOP) | `00 00 C3` |
| end | `00 00 F3` |
| **trim** | three jump moves: (+2, +2), (−4, −4), (+2, +2) in our coordinates, i.e. `82 41 83`, `82 82 83`, `82 41 83` |

Values to test with (dx alone, then dy alone, as stitch moves): 1 → `01 00 03` / `40 00 03`; 2 → `02 01 03` /
`80 40 03`; 5 → `06 02 03` / `90 80 03`; 14 → `0A 06 03` / `A0 90 03`; 41 → `0A 0A 07` / `A0 A0 13`; 70 →
`09 02 07` / `60 80 13`; 121 → `05 05 07` / `50 50 13`; −121 → `0A 0A 0B` / `A0 A0 23`.

Nothing follows the end record. The file length is always 512 + 3R.

### 3.4 Trims in DST

DST has no trim code. A Tajima-style machine cuts the thread when it meets a set number of jumps in a row; the usual
setting is 3 (machines can be set higher, EduTechWiki says up to 5). So:

- A **TRIM** entry is written as three small jumps that end where they began (0.2 mm out, 0.4 mm back, 0.2 mm out,
  needle up). This is pyembroidery's convention and the one Ink/Stitch files use. It is written for every TRIM,
  whatever follows.
- A **JUMP** with no TRIM before it stays uncut as long as it is one or two records (up to 24.2 mm). A longer untrimmed
  jump is three or more records and the machine will cut it. The site trims long jumps anyway (`AGENTS.md`, "Short
  jumps"), so this only makes a rare uncut long jump cut.
- A change record makes the machine stop; a machine with a cutter cuts there by itself.

Reading a file back (formats-spec section 7, or pyembroidery): the three trim jumps vanish and a TRIM appears before
the jump run they began; a jump run of three or more records that had no TRIM gets one too.

### 3.5 Colours

None. The file says how many changes there are, not which thread. The sew sheet carries the colours. pyembroidery has
an "extended" header that adds `TC:` lines (colour, name, number) which our own DST reader understands; it is **not
written**: no Tajima document describes it, and a controller that reads the header by position has spaces there
today. (Known and not done; a later row for `docs/writer-changes.md` if a maker asks to re-open their DST in colour.)

---

## 4. `writeEXP(pattern)`

Melco's "expanded" format, also read by Bernina machines. No header at all: the file is the move list (section 2.4,
L = 127).

| record | bytes |
|---|---|
| stitch move (dx, dy) | s8 dx, s8 **−dy** |
| jump move (dx, dy) | `80 04`, s8 dx, s8 −dy |
| trim | `80 80 07 00` |
| change (COLOR_CHANGE or STOP) | `80 01 00 00` |
| end | nothing |

`80` in the first byte of a pair is the escape, which is why a step is ±127 and never −128.

- **Trims** are a real command here, so a TRIM is written once, as it stands.
- **Colours**: none in the file. Melco and Bernina software keep them in a second file beside it (`.inf`); it is not
  written. The sew sheet carries the colours.
- An empty tail is fine: a design ending in TRIM, END ends with `80 80 07 00`.

---

## 5. `writeJEF(pattern, date)`

Janome's format (also Elna, Kenmore). A 116-byte header, a list of palette numbers, a list of thread types, then
2-byte and 4-byte records. Every multi-byte field is little-endian.

### 5.1 File layout

N = the number of segments (section 2.3). B = the stitch block's length in bytes.

| offset | size | value |
|---|---|---|
| 0 | 4 | u32: 116 + 8·N, the offset of the stitch block |
| 4 | 4 | u32 `14 00 00 00` (0x14; meaning unknown, the same in every writer seen) |
| 8 | 14 | ASCII date and time `YYYYMMDDHHMMSS` |
| 22 | 2 | `00 00` |
| 24 | 4 | u32 N |
| 28 | 4 | u32 B / 2 (the number of byte pairs: a stitch is 1, every 4-byte record is 2, the end is 1) |
| 32 | 4 | u32 hoop code (section 5.3) |
| 36 | 16 | i32 × 4: **left, up, right, down** (section 2.5) |
| 52 | 16 | i32 × 4: room in the 110 × 110 mm hoop (section 5.3) |
| 68 | 16 | i32 × 4: room in the 50 × 50 mm hoop |
| 84 | 16 | i32 × 4: room in the 140 × 200 mm hoop |
| 100 | 16 | i32 × 4: room in the "custom" hoop, written as 140 × 200 mm again |
| 116 | 4·N | u32 per segment: its Janome palette number (section 5.4) |
| 116 + 4·N | 4·N | u32 13 (`0D 00 00 00`) per segment: thread type |
| 116 + 8·N | B | stitch block (section 5.5) |

`date` is a string of exactly 14 ASCII digits. When it is not given, the local time now. The same pattern therefore
gives different bytes at different times unless the caller passes the date (the tests do).

### 5.2 The four extents

The four numbers at offset 36 are how far the design reaches from the origin, in 0.1 mm, in the order left, up,
right, down. The machine starts with the needle at the hoop's centre, so these are distances from the hoop centre.

pyembroidery writes half the width, half the height, half the width, half the height: the same numbers when the
design is centred on its origin and wrong ones when it is not (it would tell the machine the design is centred while
the stitches sew off-centre). The site places pieces off-centre on purpose, so the true distances are written. For a
centred design the bytes are identical to pyembroidery's.

### 5.3 Hoop code and hoop room

A design **fits** a hoop of half-width hw and half-height hh (0.1 mm) when left ≤ hw, right ≤ hw, up ≤ hh and
down ≤ hh.

**Hoop code**: the first row that fits.

| order | code | hoop | hw | hh |
|---|---|---|---|---|
| 1 | 1 | 50 × 50 mm | 250 | 250 |
| 2 | 3 | 126 × 110 mm | 630 | 550 |
| 3 | 2 | 140 × 200 mm | 700 | 1000 |
| 4 | 4 | 200 × 200 mm | 1000 | 1000 |
| otherwise | 0 | | | |

**Hoop room**, for each of the four groups at offsets 52, 68, 84 and 100, with (hw, hh) = (550, 550), (250, 250),
(700, 1000), (700, 1000): if the design fits, the four i32 are hw − left, hh − up, hw − right, hh − down (the free
space on each side). If it does not fit, four times −1 (`FF FF FF FF`).

The codes and sizes are pyembroidery's. The KDE notes name the codes differently (0 = "A Standard" 126 × 110, 1 = "C
Free Arm" 50 × 50, 2 = "B Large" 140 × 200, 3 = "F Spring Loaded" 126 × 110, 4 = "D Giga" 230 × 200). Both agree on
1, 2 and 3, which is all a design up to 140 × 200 mm ever uses. Newer Janome hoops (SQ14, RE20, SQ20, RE28, RE36)
have no known code: a design too big for 200 × 200 mm gets code 0 and no room anywhere, exactly as pyembroidery
writes it. See section 11.

### 5.4 The Janome palette, and `janomeThreads(threads)`

A JEF file holds **no colours**, only a number per segment that the machine looks up in its built-in list of 78
Janome threads (numbers 1 to 78; 0 is not a thread). The writer therefore needs that list: for each number, Janome's
thread name, Janome's catalogue number and a screen colour. Section 7 says where that table comes from and why it is
**not in this document**. Call it `JANOME`: 79 entries, index 0 null, entries 1-78 `[name, r, g, b, number]`.

Matching is the PES rule (formats-spec 4.7) run on `JANOME` instead of `PEC_MATCH`, so that two different colours
never show as the same Janome thread and the site and the machine agree:

1. Go through the threads in order; each `color` string not seen before claims the nearest unclaimed entry
   (`nearestIndex`, red-mean, ties to the later entry) and removes it. Stop claiming when nothing is left.
2. Each thread's number is the nearest **claimed** entry to its colour.

`janomeThreads(threads)` returns, per thread, `{ index, name, number, hex }`. `writeJEF` calls it with the segment
thread list S and writes the indices in order. So a STOP repeats the number before it: the machine stops and shows the
same thread again.

pyembroidery only avoids giving two *neighbouring* segments one number, and marks a STOP with palette number 0, which
only its own reader understands. Neither is copied.

### 5.5 Stitch block

The move list of section 2.4 with L = 127:

| record | bytes |
|---|---|
| stitch move (dx, dy) | s8 dx, s8 **−dy** |
| jump move (dx, dy) | `80 02`, s8 dx, s8 −dy |
| change (COLOR_CHANGE or STOP) | `80 01 00 00` |
| **trim** | `80 02 00 00` three times (12 bytes) |
| end | `80 10` |

**Trims in JEF.** There is no trim code. A jump that does not move (`80 02 00 00`) is the cut signal: EduTechWiki
reports it works as a trim on Janome machines whose thread-cutting setting allows a "cutting command", and
pyembroidery writes three of them when asked for trims (and reads three jumps in a row as a trim). Three are written
here for every TRIM: one is enough if the machine takes the first, and three are needed by readers that count.
Janome's own "auto" setting also cuts any jump longer than 3 mm and at every colour change, whatever the file says.
This is why section 2.4 never writes a JUMP that does not move.

---

## 6. `writeVP3(pattern)`

Husqvarna Viking and Pfaff. Nested blocks, each with a 3-byte tag and a 4-byte length; every number big-endian;
positions in **thousandths of a millimetre** (our unit × 100); one block per segment, each with its own thread record
(colour and three free strings), so there is no palette and nothing to match.

### 6.1 Numbers used

From E (section 2.5): minX, minY, maxX, maxY, W, H. The centre is ((minX + maxX) / 2, (minY + maxY) / 2), which may
end in .5; every field below is written from integers so nothing is rounded:

- cx100 = (minX + maxX) × 50, cy100 = (minY + maxY) × 50 (the centre × 100).
- A position (x, y) relative to the centre: (x × 100 − cx100, **−**(y × 100 − cy100)).

**Lengths.** Each of the four block kinds has a u32 BE length that counts the bytes **after the length field** up to
the end of that block. They are filled in once the block is complete.

### 6.2 File header

| size | value |
|---|---|
| 6 | `%vsm%` and `00` |
| 58 | wide string `Produced by     Software Ltd` (28 characters, five spaces between "by" and "Software"): `00 38` + 56 bytes |
| 3 | tag `00 02 00` |
| 4 | u32 length: to the end of the file |
| 2 | wide string, empty (`00 00`): the settings note |
| 16 | i32 × 4: maxX × 100, −minY × 100, minX × 100, −maxY × 100 (right, up, left, down, from the origin) |
| 4 | u32: the number of STITCH entries in st |
| 2 | u16: N, the number of segments |
| 1 | `0C` |
| 2 | u16: 1 (one design) |

Then the one design block, to the end of the file.

### 6.3 Design block

| size | value |
|---|---|
| 3 | tag `00 03 00` |
| 4 | u32 length: to the end of the file |
| 8 | i32 × 2: cx100, −cy100 (the design's centre from the origin) |
| 3 | `00 00 00` |
| 16 | i32 × 4: −W × 50, W × 50, −H × 50, H × 50 (the box from its centre) |
| 8 | i32 × 2: W × 100, H × 100 |
| 2 | wide string, empty |
| 2 | `64 64` |
| 16 | i32 × 4: 4096, 0, 0, 4096 |
| 6 | `78 78 50 50 01 00` (ASCII `xxPP`, then 1, 0) |
| 58 | the wide string of 6.2 again |
| 2 | u16: N |
| var | N colour blocks |

`64 64` and the four numbers are fixed in every file seen (a 100 % scale and an identity matrix in 20.12 fixed point,
by the look of them).

### 6.4 Colour block (one per segment)

Each block starts where the one before it **ended**; the first starts at the origin (0, 0). Call the start (sx, sy)
and the end (ex, ey) = the position of the segment's last entry of any kind, or the start when the segment is empty.

| size | value |
|---|---|
| 3 | tag `00 05 00` |
| 4 | u32 length: to the end of this block, its final `00` included |
| 8 | i32 × 2: the start relative to the centre (6.1): sx × 100 − cx100, −(sy × 100 − cy100) |
| var | thread record (6.5) |
| 8 | i32 × 2: (ex − sx) × 100, −(ey − sy) × 100 |
| 3 | tag `00 01 00` |
| 4 | u32 length: to the end of the stitch bytes (the final `00` not included) |
| 3 | `0A F6 00` |
| var | stitch bytes (6.6) |
| 1 | `00` |

The start rule is not free: pyembroidery's reader (and so Ink/Stitch) skips the move to a block's start when either
of its coordinates is 0, which is only harmless if the block starts where the needle already is.

### 6.5 Thread record

| size | value |
|---|---|
| 2 | `01 00` (one colour, no blend) |
| 3 | R, G, B from `hexToRgb(color)` |
| 5 | `00 00 00 05 28` (no parts, no length; type 5 = rayon; weight 40) |
| var | byte string: the catalogue number: `catalog`, or empty |
| var | byte string: the name: `description`, else `name`, else the `color` string itself (`#c8102e`) |
| var | byte string: the brand: `brand`, or empty |

null and undefined count as missing. The strings are whatever the pattern holds, as UTF-8 with a true byte length
(pyembroidery writes the character count, which breaks its own reader on the first accented letter). The site's
thread descriptions are ASCII already. mySewnet's help says a Husqvarna machine shows a VP3 thread as the first four
characters of its range abbreviation, its weight and its number, so `catalog` and `brand` are what reach the screen.
Type and weight are fixed at rayon 40 as in pyembroidery; the notes list 6 = polyester, 4 = cotton, 10 = silk, 3 or 1
= metallic, but no writer seen varies them.

### 6.6 Stitch bytes

Unlike the header fields these are in **our** orientation: dy is written as it is, not negated (the `0A F6` before
them reads as scale +10 and −10: the format flips y itself).

Keep (lx, ly), starting at the block's start (sx, sy). For each entry of the segment:

| entry | bytes |
|---|---|
| STITCH at (x, y), dx = x − lx, dy = y − ly, both within ±127 | s8 dx, s8 dy. Then (lx, ly) = (x, y) |
| STITCH with either beyond ±127 | `80 01`, i16 BE dx, i16 BE dy, `80 02`. Then (lx, ly) = (x, y) |
| TRIM | `80 03` |
| END | `80 03` |
| JUMP | nothing, and (lx, ly) does **not** move |

- **There is no jump.** The needle's travel is folded into the next stitch: a jump followed by a stitch becomes one
  record from the last needle point to the new one. Under 12.7 mm that is an ordinary 2-byte stitch, which is what an
  uncut jump is on a single-needle machine anyway (the thread lies from hole to hole). Over 12.7 mm it is the long
  form, which the notes call a "move".
- In a normalised list no real stitch is over 7 mm, so the long form appears only where the source had a jump (or
  for a first stitch far from the origin).
- **Trims**: `80 03`, pyembroidery's choice, written where the TRIM stands (before the travel it cuts). The END writes
  one more, so the thread is cut when the design finishes; a design that ends TRIM, END ends `80 03 80 03`.
- A jump at the end of a segment with no stitch after it is carried by the next block's start, not by a record.

---

## 7. Thread tables

Per `AGENTS.md`, thread data comes from the maker's own published source, cited in the file header, never from
another project's table.

| format | what the file holds | table needed |
|---|---|---|
| DST | nothing | none |
| EXP | nothing | none |
| VP3 | RGB and three strings per block | **none**: the pattern's own colour and words are written |
| JEF | a number 1-78 per segment | **yes**: Janome's 78 threads, in the machine's order |

**Husqvarna / Pfaff (VP3).** No palette exists in the format, so nothing is copied or matched. Singer/SVP's thread
ranges (Robison-Anton, Sulky) live in the mySewnet software's thread database, not in any published file; they are
not needed.

**Janome (JEF): what is published and what is not.**

- Janome publishes the **names and catalogue numbers** of its embroidery threads (001 White, 002 Black, 003 Gold and
  201 to 275): the "Embroidery Thread Sets 1, 2 and 3" page on janome.ca with its colour guide, the thread lists in
  its project sheets (janome.com, janome.com.au: "217 Sky", "238 Blond", "205 Dark Brown"), and the colour charts in
  its instruction books. Janome's sites refused automated reading on 2026-11-13, so the colour guide itself was not
  opened for this spec.
- Janome publishes **no screen colours** (RGB) that were found.
- Janome does **not publish the order**: which number 1-78 in a file means which thread. That is a fact about the
  format, known only from reverse engineering, and the public listings **disagree**. pyembroidery's order and the
  KDE Liberty notes' order agree on only 20 of the 78 numbers (among them 1 = Black 002, 2 = White 001, 9 = Pink
  201); for the other 58 they name different threads (number 10 is Red 225 in one and Vermilion 202 in the other).
  EduTechWiki's list is a third variant. Their RGB values differ throughout.

So no public table can be copied even if the rules allowed it: at most one of them is right.

### 7.1 The order measured from Janome-sponsored designs (2026-11-13)

**Source.** Sew4Home publishes free designs sponsored by Janome America, each as matched JEF, PES, VP3, EXP and ART
files made from one design by the digitizer. The VP3 of a design holds, per colour block, the thread's screen colour
(RGB), its catalogue number and name, and the brand ("Janome Polyester" or "Janome"); the JEF holds, per block, only
the palette number. Pairing block k of the JEF with block k of the VP3 gives one measured pair (palette number →
thread). No other project's table was opened or used; the JEF and VP3 headers were read by a throwaway script written
from sections 5.1 and 6 of this document.

**Method.**

- JEF: colour count N at offset 24, the N palette numbers at 116, the stitch block at the offset in the first u32;
  stitches per block counted between `80 01` changes.
- VP3: the N colour blocks after the design block; per block the RGB, the three byte strings (catalogue number, name,
  brand) and the stitch count.
- A pair counts only when both files have the same number of blocks. Stitch counts agreed within 5 % on 630 of 635
  blocks; the 5 that did not are one letter (Floral Alphabet "Q", a later edit of the JEF), with the same block order.
- **Excluded**: Aurifil "Autumn Leaves" (main design). Its VP3 names are placeholders in table order ("1 White" on a
  pink, "2 Black" on a pink, "201 Pink" on a grey, "203 Orange" on a grey) and its RGB values are Aurifil colours, so
  its JEF numbers are the digitizer's nearest Janome thread, not a labelled pair. It is the only conflicting source:
  without it every palette number has exactly one thread, every catalogue number exactly one palette number, and every
  thread one RGB across all designs.

**Designs used**: 127 designs (624 colour blocks after the exclusion) from these sets, all from sew4home.com:

| code | set (page) | designs |
|---|---|---|
| FA | Floral Alphabet (floral-alphabet-machine-embroidery-design-set) | 26 |
| AT | Atomic set (atomic-machine-embroidery-set): alphabet, diamonds, main designs, starbursts | 34 |
| FF | Friendly Forest Animals (friendly-forest-animals-machine-embroidery-designs) | 4 |
| FG | Feelin' Groovy (feelin-groovy-machine-embroidery-set) | 4 |
| FP | Flower Power (flower-power-machine-embroidery-design-set) | 8 |
| BF | Botanical Florals, large and small (botanical-florals-machine-embroidery-designs) | 12 |
| FR | Fancy Fruits (fancy-fruits-machine-embroidery-designs) | 5 |
| VO | Vintage Christmas Ornaments (downloads-for-vintage-christmas-ornaments-embroidery-files-bonus-napkin-tutorial) | 11 |
| TG | Tulip Garden (s4h-tulip-garden-emb-download) | 5 |
| SU | Sulky 30 wt: Handmade with Love, Life's a Stitch, two sizes each (s4h-sulky_30wt_embroidery_designs_download) | 4 |
| AU | Aurifil 80 wt: Lion, Gingham Fruit (3), Autumn Leaf Detail (s4h-aurifil_80wt_embroidery_designs_download) | 5 |
| GS | In-the-hoop Gift Stocking (in-the-hoop-gift-stocking-with-snowflake-embroidery) | 3 |
| TB | Large shopping tote border, three sizes (s4h-must-have-bags-fabric_com-download) | 3 |
| MS | Mountain Sunrise (s4h-mountain_sunrise_embroidery_design-download) | 1 |
| CO | Coaster outline (s4h-coaster_outline_emb_design_download) | 1 |
| LS | Let It Snow | 1 |

**Measured table**: 51 of the 78 palette numbers. RGB is the VP3's screen colour for that thread (the digitizing
software's, the same in every design that uses it; not a colour Janome publishes).

| JEF number | Janome no. | name | RGB (VP3) | sets |
|---|---|---|---|---|
| 1 | 002 | Black | `000000` | AT, FF, FG, MS, VO |
| 2 | 001 | White | `FFFFFF` | AT, AU, FF, FG, FR, GS, SU |
| 3 | 204 | Yellow | `FFFF17` | TG |
| 4 | 203 | Orange | `FF6600` | CO, FF, FG |
| 5 | 219 | Olive Green | `2F5933` | AT, BF, FP, TG |
| 6 | 226 | Green | `237336` | FA, FP |
| 7 | 217 | Sky | `65C2C8` | LS, MS |
| 8 | 208 | Purple | `AB5A96` | AU, TG |
| 10 | 225 | Red | `FF0000` | AU, FF, VO |
| 11 | 214 | Brown | `B1704E` | FA, VO |
| 13 | 003 | Gold | `E4C35D` | FF, GS, SU |
| 15 | 209 | Pale Violet | `AC9CC7` | FA |
| 16 | 210 | Pale Yellow | `FCF294` | TG |
| 17 | 211 | Pale Pink | `F999B7` | AT |
| 18 | 212 | Peach | `FAB381` | FR |
| 19 | 213 | Beige | `C9A480` | AU, FA |
| 20 | 215 | Wine Red | `970533` | BF |
| 23 | 220 | Silver Gray | `E5E5E5` | GS, LS |
| 25 | 227 | Pale Aqua | `98D6BD` | AT |
| 26 | 228 | Baby Blue | `B2E1E3` | FA |
| 27 | 229 | Powder Blue | `368BA0` | FA, FG, GS |
| 31 | 233 | Salmon Pink | `F999A2` | AT, BF, FA, FG, FP |
| 32 | 234 | Coral | `F9676B` | BF, FA, FG, FP, FR, MS |
| 33 | 235 | Burnt Orange | `E3311F` | AT, FA, FG |
| 34 | 236 | Cinnamon | `E2A188` | MS |
| 35 | 237 | Umber | `B59474` | AU, BF |
| 36 | 238 | Blond | `E4CF99` | AU, FF, VO |
| 37 | 239 | Sunflower | `FFCB00` | AU, BF, FA, FG, FP, TB |
| 38 | 240 | Orchid Pink | `E1ADD4` | TG |
| 39 | 241 | Peony Purple | `C3007E` | TG |
| 40 | 242 | Burgundy | `80004B` | AU, SU |
| 41 | 243 | Royal Purple | `540571` | FA |
| 42 | 244 | Cardinal Red | `B10525` | AU |
| 43 | 245 | Opal Green | `CAE0C0` | FA, FR |
| 44 | 246 | Moss Green | `899856` | FF, FR |
| 45 | 247 | Meadow Green | `5C941A` | BF, FA, FR, TG |
| 47 | 249 | Aquamarine | `5DAE94` | SU, TB, VO |
| 48 | 250 | Emerald Green | `4CBF8F` | FA |
| 49 | 251 | Peacock Green | `007772` | FA |
| 50 | 252 | Dark Gray | `595B61` | SU |
| 51 | 253 | Ivory White | `FFFFF2` | FP, MS |
| 52 | 254 | Hazel | `B15818` | AU, FF |
| 55 | 257 | Cocoa Brown | `98692D` | FF |
| 56 | 258 | Sienna | `4D3419` | AU, FF, FR |
| 57 | 259 | Sepia | `4C330B` | FF |
| 62 | 264 | Green Dust | `B2DD53` | AT, AU |
| 63 | 265 | Crimson | `F33689` | SU, TG |
| 67 | 269 | Meadow | `4C881F` | AU |
| 68 | 270 | Mustard | `E4DE79` | VO |
| 74 | 202 | Vermilion | `F0331F` | AT, AU, CO, GS, SU |
| 77 | 223 | Beige Gray | `E3C4B4` | AU |

Number 9 = Pink 201 (section B.3's "every public listing") is **not** among them: no design used Pink 201.

**Still unknown: 27 numbers**: 9, 12, 14, 21, 22, 24, 28, 29, 30, 46, 53, 54, 58, 59, 60, 61, 64, 65, 66, 69, 70,
71, 72, 73, 75, 76, 78. The 27 Janome threads never seen are exactly 27 (201, 205, 206, 207, 216, 218, 221, 222,
224, 230, 231, 232, 248, 255, 256, 260, 261, 262, 263, 266, 267, 268, 271, 272, 273, 274, 275), which fits a table
of 78 = 001-003 plus 201-275, one thread per number.

**A pattern, not a measurement.** All 26 measured numbers from 25 to 68 are the catalogue number minus 202 (25 =
227 … 68 = 270). If it holds, 28-30 = 230-232, 46 = 248, 53-54 = 255-256, 58-61 = 260-263, 64-66 = 266-268 and
69-73 = 271-275, leaving 201, 205, 206, 207, 216, 218, 221, 222 and 224 for 9, 12, 14, 21, 22, 24, 75, 76 and 78.
Below 25 and above 73 there is no such rule (74 = 202, 77 = 223, 13 = 003). The pattern names threads but gives no
screen colour, and it is unproven: nothing here relies on it.

**Proposal.**

1. **Measure the order** on Janome's own software or a machine, the way the PES header was measured in PE-DESIGN:
   `writeJEF` needs no table to write one test file of 78 one-stitch-block segments numbered 1 to 78. Open it in a
   Janome program or on a Janome machine and write down the thread name and number shown for each segment. That is a
   measurement of the maker's product, recorded in this document as a table (number, name, catalogue number), with
   the program and date.
2. **Take the colours from Janome's colour guide**: one screen colour per thread sampled from the maker's own
   published chart, as `brandcharts.js` does for Isacord, cited in the file header.
3. **Until both exist, JEF does not ship** with guessed colours. If it must ship earlier, the honest fallback is a
   table of only the numbers measured so far (a machine shows a right name, from a coarser choice), never a public
   list. There is no "RGB only" way out for JEF: the file has nowhere to put an RGB.

Section 7.1 is that fallback's table: 51 measured numbers, each with a Janome name, catalogue number and a screen
colour seen in Janome-sponsored files. Writing JEF from it means `JANOME` holds only those 51 entries (the rest null)
and the matching of section 5.4 runs on them alone; a design with more than 51 distinct colours shares numbers.
Steps 1 and 2 above would still replace it (the screen colours are a digitizer's, not Janome's chart).

The tests (section 9) check the table against the oracle without holding a copy of it: pyembroidery's reader names
each palette number with its own table, and a mismatch report between its names and ours is exactly the list of
numbers on which the measurement disagrees with pyembroidery. That is information, not a failure.

---

## 8. Reading back, and the exit gate

`AGENTS.md`: every download goes through a check of the bytes about to be handed out. For these formats the gate
(`gate.js`) does three things, in this order, and hands nothing out if one fails:

1. Write the **PES** of the same pattern and run `validatePES(bytes, pattern, hoop)` on it. The stitches, the fit and
   the thread count are proven there, once, by the checker everything else uses. (The PES bytes are thrown away.)
2. `readBack(bytes, format)` on the file to hand out, and compare:
   - `needlePoints(readBack.stitches)` equals `needlePoints(normalize(pattern))`, point for point;
   - `readBack.changes` equals the number of COLOR_CHANGE and STOP entries.
3. The structure checks in the table below.

`readBack` is the inverse of sections 3 to 6 and nothing more (it is not a general reader for other people's files):

| format | how to walk it | structure checks |
|---|---|---|
| DST | formats-spec section 7 without the trim interpolation: records from 512, stitch records give STITCH, jump records move, `C3` counts a change, `F3` ends | length = 512 + 3R with R from `ST:`; the last record is `00 00 F3`; `CO:` = changes |
| EXP | pairs: first byte not `80` is a stitch (dx, −file dy); `80 04` + pair moves; `80 01` + pair counts a change; `80 80` + pair is a trim | even length; no unknown code after `80` |
| JEF | from the offset at 0: the same with `80 02` for a move, `80 01` a change, `80 10` the end | offset = 116 + 8·N; B/2 at 28 matches; ends `80 10`; N − 1 = changes; every palette number 1-78 |
| VP3 | follow the four lengths; per colour block start at the previous end, then pairs: not `80` is a stitch (dx, dy), `80 01` reads two i16 and the `80 02`, `80 03` is a trim; a change is counted between blocks | the lengths at 6.2 and 6.3 end at the file's end; each block's length lands on the next `00 05 00` or the end; N at both places |

The preview stays what it is today: the PES of the pattern ("the preview is the file"). The other formats are proven
equal to it by needle points, not drawn separately.

---

## 9. Oracle tests

The outside oracle is pyembroidery from pip in `.venv`, used only by test tooling under `tests/`, never vendored and
never shipped. Its **readers** judge our bytes. Three layers, each an extension of a check that already runs:

1. **Golden files** (`tests/formats.test.mjs`, Node, CI). For the command fixtures already there
   (`ashley_v3_commands.json`, `multi_commands.json`) and the Appendix B design, write the four files and compare
   them byte for byte with `tests/fixtures/golden/<name>.dst|exp|jef|vp3` (JEF with a fixed date). Appendix B's bytes
   and SHA-256 are the first vectors. Also in Node, with no oracle: `readBack` needle points equal the PES needle
   points for every fixture, and `readEmbroidery(writeDST(p), "x.dst")` gives the same needle points.
2. **Oracle fixtures** (`tests/make_fixture.py` extended; run by hand when a golden file changes, results committed
   as JSON beside the golden files). It reads each golden file with `pyembroidery.read` and saves the stitch list and
   threads. `formats.test.mjs` then compares, with the tolerances below.
3. **The batches** (`tests/pe900_check.py` extended, part of `tests/check.sh` when stitch code changed). The batch
   pages save the four files beside each PES; the checker reads all five with pyembroidery and compares needle
   points and change counts. This is the "every design the path reaches" proof.

**What must match, per format** (positions are compared as numbers; pyembroidery returns floats for VP3):

| | DST | EXP | JEF | VP3 |
|---|---|---|---|---|
| read with settings | default | default | `{"trim_at": 3, "trim_distance": None}` | default |
| needle points | exact, 0 tolerance | exact | exact | exact |
| COLOR_CHANGE count and positions | = changes (a STOP reads as a colour change) | = changes | = changes | = changes |
| JUMP entries | one per jump record | one per jump record | one per jump record | only zero-length ones at block starts; ignore |
| TRIM entries | one before each jump run that holds a trim's three records or ≥ 3 jump records | one per TRIM, in place | as DST | one per TRIM, plus one for the END |
| thread count | 0 | 0 | N | N |
| thread colours | – | – | not compared (pyembroidery's own table) | exact RGB |
| thread strings | – | – | – | exact (catalogue, name, brand; test with ASCII) |
| END | last entry | last entry | last entry | last entry |

Notes on the tolerances:

- **Zero tolerance on positions is possible** because every writer stores exact integers. VP3 would be off by 0.1 mm
  on odd-sized designs if the centre were truncated as pyembroidery's writer does; section 6.1 avoids that, and this
  test is what guards it. Include a fixture with odd W and H (Appendix B has W = 395, H = 125).
- JEF must be read with those settings. By default pyembroidery's JEF reader ignores jump counts and adds a TRIM
  wherever a jump run travels more than 3 mm, which tests Janome's "auto" rule, not our bytes.
- pyembroidery (and formats-spec section 7) remove jump runs that end where they began, so the trim jumps themselves
  never appear in what is read.
- JEF palette numbers are checked from the bytes (u32 at 116 + 4k) against `janomeThreads`, as formats-spec checks
  PEC colour bytes against `machineThreads` (200 random thread lists).

**A second oracle, pyembroidery's writers.** Feeding pyembroidery's writer functions a pattern that already holds
st with its jumps pre-split (no re-encoding) gives, as measured for this spec:

| format | our bytes against pyembroidery's |
|---|---|
| EXP | identical, always |
| DST | identical for a centred design without trims; else only `ST:` (they count a trim as 1 record) and the four extents differ |
| JEF | identical for a centred design given the same palette numbers, date and `trims` on; else only offsets 36 to 115 differ |
| VP3 | the stitch-count field differs (they count every entry); for odd W or H the centre and start fields differ by half a unit |

Worth one test each on a centred, trimmed fixture; it pins the stitch bytes to a second witness.

---

## 10. Gotchas

### 10.1 What each format cannot say

| | DST | EXP | JEF | VP3 |
|---|---|---|---|---|
| thread colour | no | no | one of 78 Janome threads | yes, any RGB |
| thread name, brand, number | no | no | no (the machine's own names) | yes |
| trim | by convention (3 jumps) | yes | by convention (zero jumps) | `80 03` (unproven) |
| uncut jump | up to 24.2 mm | yes | subject to the machine's 3 mm rule | no jumps at all |
| pause without a colour change | no (written as a change) | no | no | no |
| hoop | no | no | 5 codes | no (a centre and a box) |
| design name | 16 ASCII characters | no | no | no |
| longest step | 12.1 mm | 12.7 mm | 12.7 mm | 12.7 mm, long form 3.27 m |

- **A STOP and a COLOR_CHANGE look the same** in all four. Counting "colours" from the file counts pauses too. Only
  the sew sheet tells them apart.
- **DST and EXP start where the needle is.** The origin (0, 0) is not the hoop centre unless the operator puts it
  there. Our designs keep their place relative to the origin, so an off-centre design sews off-centre from the start
  point. That is what `AX`/`AY` and the four extents are for.
- **JEF dates.** Two downloads of one design differ in 14 bytes. Compare from offset 24.
- **VP3 has no place for an untrimmed jump to differ from a stitch.** "N loose threads to snip" is the same on the
  fabric; the machine's stitch counter will count them as stitches.
- **Counts in headers are not the checker's counts.** DST `ST:` counts records; JEF counts byte pairs; VP3 counts
  STITCH entries. None equals `designStats().stitches` exactly except VP3's.

### 10.2 pyembroidery's choices: required, or arbitrary

| choice | status | here |
|---|---|---|
| DST record bits, `C3`, `F3`, 512-byte header and field order | required (Tajima) | same |
| DST numbers padded with spaces | arbitrary (EduTechWiki shows zero-padding; both are in the wild) | same as pyembroidery |
| DST `1A` after `PD` and spaces to 512 | convention | same |
| DST trim = +2, −4, +2 on both axes | arbitrary size; "three jumps, net zero" is what matters | same |
| DST `ST:` counts a trim as one | a slip (three records are written) | **records counted truly** |
| DST `+Y`/`-Y` taken from our y-down box, and absolute values | a slip: up and down are swapped against its own stitch flip, and a design wholly on one side of the origin gets a wrong extent | **true distances from the origin** |
| DST `TC:` lines | pyembroidery's own extension | not written |
| EXP codes `80 04`, `80 01` | required (Melco) | same |
| EXP trim `80 80 07 00` | from files in the wild; EduTechWiki calls `80 80` "END" | same; section 11 |
| JEF header order, `0x14`, list of 13s, `80 01`, `80 02`, `80 10` | required (all sources agree) | same |
| JEF bytes 22-23 zero | arbitrary (Janome writes a model letter and a space, or zeros) | same |
| JEF extents as half sizes | a simplification, wrong off-centre | **true distances** |
| JEF hoop thresholds strict (`<`) | arbitrary | fit test `≤`, the same test as the hoop room |
| JEF trims off unless asked | arbitrary default | **always three zero jumps** |
| JEF palette: neighbours differ; STOP = number 0 | arbitrary; 0 is private to pyembroidery | PES-style claiming; STOP repeats the thread |
| VP3 tags, lengths, string kinds, thread record, `0A F6 00` | required (notes agree) | same |
| VP3 producer string with a blank maker | arbitrary but in every file Ink/Stitch has made | same |
| VP3 centre and starts cut to whole units | a slip (0.1 mm shift when read back) | **exact halves** |
| VP3 string lengths in characters | a slip | **bytes** |
| VP3 stitch count = every entry bar END | arbitrary (the notes call it an estimate) | STITCH entries |
| VP3 block starts at the previous block's end, the first at the origin | needed by its own reader | same |
| VP3 jumps dropped, trim `80 03` | a reading of the format; the notes differ on `80 03` | same; section 11 |
| VP3 STOP dropped | a loss | **a new block, same thread** |
| Stitches up to 12.1/12.7 mm before splitting | allowed by the formats | 7 mm, as the PES |

### 10.3 Easy to get wrong

1. File dy is **minus** ours in DST, EXP and JEF and in every VP3 header field; the VP3 stitch bytes are **not**
   negated.
2. Split points come from `pyRound(d·i / n)` measured from the start of the move, never by adding a rounded step.
3. A JUMP that does not move writes nothing; a STITCH that does not move writes a record.
4. The DST digit rule uses ⌊w/2⌋ as its threshold, strictly: 40 is `+27 +9 +3 +1`, 41 is `+81 −27 −9 −3 −1`.
5. JEF's count at offset 28 is byte pairs, and the end record is one pair.
6. JEF and DST extents use E₀ (the origin included); VP3 uses E.
7. VP3 lengths count from after the length field; the colour block's includes its final `00`, the stitch run's does
   not.
8. VP3 byte strings are prefixed by their byte length; wide strings by twice their character count.
9. Segments are cut at STOP as well as COLOR_CHANGE, and only COLOR_CHANGE moves to the next thread.
10. Everything after the first END is dropped, in all four.

---

## 11. Not determined

1. **JEF palette order** and screen colours: section 7. 51 of 78 numbers measured (7.1); 27 still unknown.
2. **JEF hoop codes** beyond 1, 2, 3; what code 0 and 4 mean (the sources disagree: 110 × 110 or 126 × 110; 200 × 200
   or 230 × 200); what a current machine (MC500E, 550E, Skyline S9) does with a design bigger than every listed hoop,
   or with code 0. Whether the four room groups are read at all. The 129 Janome-sponsored JEFs of 7.1 use codes
   37 (96 files), 15 (14), 28 (8), 2 (5), 3 (4), 6 (1) and 65535 (1), mostly with all four room groups −1, so newer
   Janome software writes codes no public list names. The u32 at offset 4 is 0x14 in most of them and 0x0A in some
   (section 5.1 says always 0x14); the thread type at 116 + 4N is 13 in all 638 blocks.
3. **JEF trims on a real machine**: whether one zero jump or three is needed, and whether the "cutting command"
   setting is on by default.
4. **JEF extents off-centre**: section 5.2 follows the field names (left, top, right, bottom from the centre). No
   Janome-written off-centre file was available to confirm the order of "up" and "down".
5. **VP3 `80 03`**: pyembroidery writes it for a trim and at the end; the KDE notes call it a null stitch,
   EduTechWiki "end of stitches". Whether a Husqvarna or Pfaff machine cuts there is unproven. They cut at block ends
   and, by setting, on long moves.
6. **VP3 short stitch after a trim**: whether a machine sews the travel after `80 03` when it is under 12.7 mm
   (written as a plain stitch). If it does, the fix is to write every post-trim travel in the long form; that is a
   one-line rule change, to be made only on evidence.
7. **VP3 thread type and weight** values other than rayon 40, and how mySewnet maps `brand` to a "range
   abbreviation".
8. **DST number padding** (spaces or zeros) and whether any machine wants the Wilcom-style `1A` after the last
   record. Both variants load everywhere we know of.
9. **EXP trim**: `80 80 07 00` is not in the public notes as a trim; it is what pyembroidery writes and reads, and
   what Bernina-made EXP files are reported to hold.
10. Whether any of this needs a machine-side file name rule like the PES one (ASCII, 8.3 on old Tajima floppies).
    `safeName` already gives ASCII.

Each of 2 to 9 needs a tester with the machine, as `docs/writer-changes.md` asks for any writer change: a small test
pack and a line in the release report saying "unproven until sewn".

---

## Appendix A. Errors

| function | condition | thrown |
|---|---|---|
| all four | no STITCH after normalising | `Error("There's nothing to stitch.")` |
| all four | more than 250 COLOR_CHANGE + STOP | `Error("Too many colour changes for a DST file (250 max).")` (EXP, JEF, VP3 alike) |
| writeJEF | `date` given and not 14 ASCII digits | `Error("A JEF date is 14 digits.")` |
| writeJEF, writeVP3 | a thread without a string `color` | throws (TypeError), as `writePES` |

## Appendix B. Worked example (test vectors)

**Input pattern:**

- threads: `{ color: "#c8102e", description: "Red", brand: "Acme", catalog: "1147" }`,
  `{ color: "#1a1a1a", description: "Black" }`
- stitches (x, y, cmd): (−50, −40, JUMP), (−50, −40, STITCH), (−20, −40, STITCH), (10.5, −38.5, STITCH), (0, 0, TRIM),
  (310, 60, JUMP), (310, 60, STITCH), (330, 85, STITCH), (0, 0, COLOR_CHANGE), (345, 85, JUMP), (345, 85, STITCH),
  (345, 20, STITCH), (0, 0, TRIM), (0, 0, END)

**normalize →** (−50,−40,J) (−50,−40,S) (−20,−40,S) (10,−38,S) (10,−38,T) (310,60,J) (310,60,S) (330,85,S)
(330,85,C) (345,85,J) (345,85,S) (345,20,S) (345,20,T) (345,20,END)

Two segments; S = [Red, Black]. E = E₀ = (−50, −40, 345, 85): left 50, right 345, up 40, down 85, W = 395, H = 125.
Needle points: (−50,−40) (−20,−40) (10,−38) (310,60) (330,85) (345,85) (345,20). 7 STITCH entries.

**Move list** (the same for L = 121 and L = 127): J(−50,−40), S(0,0), S(30,0), S(30,2), trim, J(100,33), J(100,32),
J(100,33), S(0,0), S(20,25), change, J(15,0), S(0,0), S(0,−65), trim, end.

### B.1 DST

`writeDST(pattern)`: 572 bytes, R = 20, SHA-256
`7e85b9f09624cf2d0d109d07410244105d1541722577f2e95d7c6147c0a4edd0`.

Records from offset 512:

```
a1 a5 8b                      jump (−50, −40)
00 00 03                      stitch (0, 0)
00 05 03                      stitch (30, 0)
80 45 03                      stitch (30, 2)
82 41 83 82 82 83 82 41 83    trim: jumps (2, 2), (−4, −4), (2, 2)
19 94 87                      jump (100, 33)
99 94 87                      jump (100, 32)
19 94 87                      jump (100, 33)
00 00 03                      stitch (0, 0)
4a 95 03                      stitch (20, 25)
00 00 c3                      colour change
08 06 83                      jump (15, 0)
00 00 03                      stitch (0, 0)
60 90 23                      stitch (0, −65)
82 41 83 82 82 83 82 41 83    trim
00 00 f3                      end
```

Full file (xxd; lines 0x90 to 0x1f0 are all spaces like 0x80):

```
00000000: 4c41 3a55 6e74 6974 6c65 6420 2020 2020  LA:Untitled     
00000010: 2020 200d 5354 3a20 2020 2020 3230 0d43     .ST:     20.C
00000020: 4f3a 2020 310d 2b58 3a20 2033 3435 0d2d  O:  1.+X:  345.-
00000030: 583a 2020 2035 300d 2b59 3a20 2020 3430  X:   50.+Y:   40
00000040: 0d2d 593a 2020 2038 350d 4158 3a2b 2020  .-Y:   85.AX:+  
00000050: 3334 350d 4159 3a2d 2020 2032 300d 4d58  345.AY:-   20.MX
00000060: 3a2b 2020 2020 300d 4d59 3a2b 2020 2020  :+    0.MY:+    
00000070: 300d 5044 3a2a 2a2a 2a2a 2a0d 1a20 2020  0.PD:******..   
00000080: 2020 2020 2020 2020 2020 2020 2020 2020                  
   ...
000001f0: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000200: a1a5 8b00 0003 0005 0380 4503 8241 8382  ..........E..A..
00000210: 8283 8241 8319 9487 9994 8719 9487 0000  ...A............
00000220: 034a 9503 0000 c308 0683 0000 0360 9023  .J...........`.#
00000230: 8241 8382 8283 8241 8300 00f3            .A.....A....
```

pyembroidery reads it as (−50,−40,J) (−50,−40,S) (−20,−40,S) (10,−38,S) (10,−38,TRIM) (110,−5,J) (210,27,J)
(310,60,J) (310,60,S) (330,85,S) (330,85,C) (345,85,J) (345,85,S) (345,20,S) (345,20,TRIM) (345,20,END), no threads.

### B.2 EXP

`writeEXP(pattern)`: 46 bytes, SHA-256 `4aba03f836f53e827f29f6cf272de10f715e0659cec41652d1d02507fdd1a062`.

```
80 04 ce 28                   jump (−50, −40): dx −50 = ce, −dy 40 = 28
00 00                         stitch (0, 0)
1e 00                         stitch (30, 0)
1e fe                         stitch (30, 2)
80 80 07 00                   trim
80 04 64 df                   jump (100, 33)
80 04 64 e0                   jump (100, 32)
80 04 64 df                   jump (100, 33)
00 00                         stitch (0, 0)
14 e7                         stitch (20, 25)
80 01 00 00                   colour change
80 04 0f 00                   jump (15, 0)
00 00                         stitch (0, 0)
00 41                         stitch (0, −65)
80 80 07 00                   trim
```

```
00000000: 8004 ce28 0000 1e00 1efe 8080 0700 8004  ...(............
00000010: 64df 8004 64e0 8004 64df 0000 14e7 8001  d...d...d.......
00000020: 0000 8004 0f00 0000 0041 8080 0700       .........A....
```

pyembroidery reads the same list as for B.1.

### B.3 JEF

`writeJEF(pattern, "20261113120000")`, with the palette numbers **taken as given**: 9 for the red thread and 1 for
the black (the example does not depend on the table of section 7; 9 is Pink 201 and 1 is Black 002 in every public
listing). 196 bytes, SHA-256 `4ea3d8e930a5b36ebcac1a0ed5f0d58db0864bfba8894c17e0b673328bf0becf`.

| offset | bytes | meaning |
|---|---|---|
| 0x00 | `84 00 00 00` | stitch block at 132 = 116 + 8 × 2 |
| 0x04 | `14 00 00 00` | |
| 0x08 | `32 30 32 36 31 31 31 33 31 32 30 30 30 30` `00 00` | the date |
| 0x18 | `02 00 00 00` | 2 segments |
| 0x1C | `20 00 00 00` | 32 pairs (64 bytes of stitch block) |
| 0x20 | `03 00 00 00` | hoop code 3: does not fit 50 × 50 (right 345 > 250), fits 126 × 110 |
| 0x24 | `32 00 00 00` `28 00 00 00` `59 01 00 00` `55 00 00 00` | left 50, up 40, right 345, down 85 |
| 0x34 | `F4 01 00 00` `FE 01 00 00` `CD 00 00 00` `D1 01 00 00` | 110 × 110: 500, 510, 205, 465 |
| 0x44 | `FF` × 16 | 50 × 50: does not fit |
| 0x54 | `8A 02 00 00` `C0 03 00 00` `63 01 00 00` `93 03 00 00` | 140 × 200: 650, 960, 355, 915 |
| 0x64 | the same 16 bytes | custom |
| 0x74 | `09 00 00 00` `01 00 00 00` | palette numbers |
| 0x7C | `0D 00 00 00` `0D 00 00 00` | thread types |

Stitch block from 0x84:

```
80 02 ce 28                            jump (−50, −40)
00 00  1e 00  1e fe                    stitches (0, 0), (30, 0), (30, 2)
80 02 00 00 80 02 00 00 80 02 00 00    trim
80 02 64 df  80 02 64 e0  80 02 64 df  jumps (100, 33), (100, 32), (100, 33)
00 00  14 e7                           stitches (0, 0), (20, 25)
80 01 00 00                            colour change
80 02 0f 00                            jump (15, 0)
00 00  00 41                           stitches (0, 0), (0, −65)
80 02 00 00 80 02 00 00 80 02 00 00    trim
80 10                                  end
```

```
00000000: 8400 0000 1400 0000 3230 3236 3131 3133  ........20261113
00000010: 3132 3030 3030 0000 0200 0000 2000 0000  120000...... ...
00000020: 0300 0000 3200 0000 2800 0000 5901 0000  ....2...(...Y...
00000030: 5500 0000 f401 0000 fe01 0000 cd00 0000  U...............
00000040: d101 0000 ffff ffff ffff ffff ffff ffff  ................
00000050: ffff ffff 8a02 0000 c003 0000 6301 0000  ............c...
00000060: 9303 0000 8a02 0000 c003 0000 6301 0000  ............c...
00000070: 9303 0000 0900 0000 0100 0000 0d00 0000  ................
00000080: 0d00 0000 8002 ce28 0000 1e00 1efe 8002  .......(........
00000090: 0000 8002 0000 8002 0000 8002 64df 8002  ............d...
000000a0: 64e0 8002 64df 0000 14e7 8001 0000 8002  d...d...........
000000b0: 0f00 0000 0041 8002 0000 8002 0000 8002  .....A..........
000000c0: 0000 8010                                ....
```

pyembroidery, with `{"trim_at": 3, "trim_distance": None}`, reads the same list as for B.1, and two threads.

### B.4 VP3

`writeVP3(pattern)`: 368 bytes, SHA-256 `6af47e19abc685d4e8366ff14b6bb0928fa3e265608b7ffcc3a936b9ac9aa5a4`.
cx100 = 14750, cy100 = 2250.

| offset | bytes | meaning |
|---|---|---|
| 0x000 | `25 76 73 6D 25 00` | `%vsm%`, 0 |
| 0x006 | `00 38` + 56 bytes | the producer string |
| 0x040 | `00 02 00` | |
| 0x043 | `00 00 01 29` | 297 bytes follow (0x047 to the end) |
| 0x047 | `00 00` | empty settings |
| 0x049 | `00 00 86 C4` `00 00 0F A0` `FF FF EC 78` `FF FF DE CC` | 34500, 4000, −5000, −8500 |
| 0x059 | `00 00 00 07` | 7 stitches |
| 0x05D | `00 02` `0C` `00 01` | 2 segments, 12, 1 design |
| 0x062 | `00 03 00` | |
| 0x065 | `00 00 01 07` | 263 bytes follow |
| 0x069 | `00 00 39 9E` `FF FF F7 36` | centre 14750, −2250 |
| 0x071 | `00 00 00` | |
| 0x074 | `FF FF B2 DA` `00 00 4D 26` `FF FF E7 96` `00 00 18 6A` | −19750, 19750, −6250, 6250 |
| 0x084 | `00 00 9A 4C` `00 00 30 D4` | 39500, 12500 |
| 0x08C | `00 00` | empty string |
| 0x08E | `64 64` | |
| 0x090 | `00 00 10 00` `00 00 00 00` `00 00 00 00` `00 00 10 00` | 4096, 0, 0, 4096 |
| 0x0A0 | `78 78 50 50 01 00` | |
| 0x0A6 | `00 38` + 56 bytes | the producer string |
| 0x0E0 | `00 02` | 2 colour blocks |
| **0x0E2** | `00 05 00` | **block 1** |
| 0x0E5 | `00 00 00 48` | 72 bytes follow (to 0x130 inclusive) |
| 0x0E9 | `FF FF C6 62` `00 00 08 CA` | start (0, 0): −14750, 2250 |
| 0x0F1 | `01 00` `C8 10 2E` `00 00 00 05 28` | thread |
| 0x0FB | `00 04 31 31 34 37` | `1147` |
| 0x101 | `00 03 52 65 64` | `Red` |
| 0x106 | `00 04 41 63 6D 65` | `Acme` |
| 0x10C | `00 00 80 E8` `FF FF DE CC` | to the end (330, 85): 33000, −8500 |
| 0x114 | `00 01 00` `00 00 00 15` | stitch run, 21 bytes follow |
| 0x11B | `0A F6 00` | |
| 0x11E | `CE D8` | stitch (−50, −40) from the origin: the opening jump folded in |
| 0x120 | `1E 00` `1E 02` | stitches (30, 0), (30, 2) |
| 0x124 | `80 03` | trim |
| 0x126 | `80 01 01 2C 00 62 80 02` | long stitch (300, 98): the jump folded in |
| 0x12E | `14 19` | stitch (20, 25) |
| 0x130 | `00` | |
| **0x131** | `00 05 00` | **block 2** |
| 0x134 | `00 00 00 38` | 56 bytes follow (to the end) |
| 0x138 | `00 00 47 4A` `FF FF E7 96` | start (330, 85): 18250, −6250 |
| 0x140 | `01 00` `1A 1A 1A` `00 00 00 05 28` | thread |
| 0x14A | `00 00` | no catalogue number |
| 0x14C | `00 05 42 6C 61 63 6B` | `Black` |
| 0x153 | `00 00` | no brand |
| 0x155 | `00 00 05 DC` `00 00 19 64` | to the end (345, 20): 1500, 6500 |
| 0x15D | `00 01 00` `00 00 00 0B` | stitch run, 11 bytes follow |
| 0x164 | `0A F6 00` | |
| 0x167 | `0F 00` | stitch (15, 0): the 1.5 mm jump folded in |
| 0x169 | `00 BF` | stitch (0, −65) |
| 0x16B | `80 03` `80 03` | TRIM, END |
| 0x16F | `00` | |

```
00000000: 2576 736d 2500 0038 0050 0072 006f 0064  %vsm%..8.P.r.o.d
00000010: 0075 0063 0065 0064 0020 0062 0079 0020  .u.c.e.d. .b.y. 
00000020: 0020 0020 0020 0020 0053 006f 0066 0074  . . . . .S.o.f.t
00000030: 0077 0061 0072 0065 0020 004c 0074 0064  .w.a.r.e. .L.t.d
00000040: 0002 0000 0001 2900 0000 0086 c400 000f  ......).........
00000050: a0ff ffec 78ff ffde cc00 0000 0700 020c  ....x...........
00000060: 0001 0003 0000 0001 0700 0039 9eff fff7  ...........9....
00000070: 3600 0000 ffff b2da 0000 4d26 ffff e796  6.........M&....
00000080: 0000 186a 0000 9a4c 0000 30d4 0000 6464  ...j...L..0...dd
00000090: 0000 1000 0000 0000 0000 0000 0000 1000  ................
000000a0: 7878 5050 0100 0038 0050 0072 006f 0064  xxPP...8.P.r.o.d
000000b0: 0075 0063 0065 0064 0020 0062 0079 0020  .u.c.e.d. .b.y. 
000000c0: 0020 0020 0020 0020 0053 006f 0066 0074  . . . . .S.o.f.t
000000d0: 0077 0061 0072 0065 0020 004c 0074 0064  .w.a.r.e. .L.t.d
000000e0: 0002 0005 0000 0000 48ff ffc6 6200 0008  ........H...b...
000000f0: ca01 00c8 102e 0000 0005 2800 0431 3134  ..........(..114
00000100: 3700 0352 6564 0004 4163 6d65 0000 80e8  7..Red..Acme....
00000110: ffff decc 0001 0000 0000 150a f600 ced8  ................
00000120: 1e00 1e02 8003 8001 012c 0062 8002 1419  .........,.b....
00000130: 0000 0500 0000 0038 0000 474a ffff e796  .......8..GJ....
00000140: 0100 1a1a 1a00 0000 0528 0000 0005 426c  .........(....Bl
00000150: 6163 6b00 0000 0005 dc00 0019 6400 0100  ack.........d...
00000160: 0000 000b 0af6 000f 0000 bf80 0380 0300  ................
```

pyembroidery reads it as (−50,−40,S) (−20,−40,S) (10,−38,S) (10,−38,TRIM) (310,60,S) (330,85,S) (330,85,C)
(330,85,J) (345,85,S) (345,20,S) (345,20,TRIM) (345,20,TRIM) (345,20,END), with the threads (#c8102e, "Red", "1147",
"Acme") and (#1a1a1a, "Black", "", ""). Its needle points are the seven above.
