# Embroidery file formats: functional specification

This document specifies two ES modules of the Needleworks site, `js/core/threads.js` and `js/core/formats.js`, in
enough detail to write them from scratch and get output that is byte-identical to the current files. It describes
behaviour, byte layouts and algorithms. It deliberately says nothing about how the code should be structured: any
internal design is fine as long as every exported name behaves as described here.

What must stay byte-identical, and is checked byte for byte:

- `tests/fixtures/golden/ashley_v3.pes` and `tests/fixtures/golden/multi.pes`: `tests/formats.test.mjs` rebuilds them
  from `tests/fixtures/*_commands.json` and compares them byte for byte.
- `tests/formats.test.mjs` also compares the writer, with the 4 design-box bytes removed, against files written by
  pyembroidery (`tests/fixtures/ashley_v3.pes`, `multi.pes`), and the readers against pyembroidery read oracles.
- About 800 PES files from the browser batches (`tests/browser/pe900_batch.html`, `studio_batch.html`), compared
  with the current output.
- `tests/doctor.test.mjs` re-reads and re-writes every fixture (and `tests/external/` when present). Every file must
  pass `validatePES`.

Appendix C has a worked example: one small design, its normalised stitch list, every byte of the file it produces,
and what the reader gives back. Use it as a test vector.

---

## 1. Conventions used throughout

### 1.1 Units and coordinates

- Coordinates are in units of 0.1 mm. x grows to the right, y grows **downwards**.
- A *stitch list* is an ordered list of entries `[x, y, command]`. x and y are numbers. Input lists may hold
  fractions; after normalisation (section 3.2) they are integers.
- Command codes (exported constants, section 3.1): STITCH 0, JUMP 1, TRIM 2, STOP 3, END 4, COLOR_CHANGE 5.

### 1.2 Integer encodings

- **u8**: one byte. A value written as u8 is reduced to its low 8 bits (two's complement for negatives, so -1 is
  0xFF).
- **u16 / u24 / u32 little-endian**: low byte first. The value is reduced to its low 16/24/32 bits, so a negative
  number is written as two's complement. When this document says only "u16" it means little-endian.
- **Big-endian 16-bit** fields appear only in the PEC stitch stream and the PEC design box. They are named that way
  where they occur.
- **f32**: IEEE-754 single precision, little-endian, rounded to nearest-even from the double-precision value. Only the
  values 0, 1 and the two CEmbOne translations occur (section 4.4).

### 1.3 Strings

- **PES string (8-bit length)**: when written, a missing value (null or undefined) is a single 0x00 byte. Otherwise
  the value is converted to a string, encoded as UTF-8 (lone surrogates become U+FFFD, bytes EF BF BD), cut to its
  first 255 **bytes** (the cut may fall inside a multi-byte character), and written as one length byte followed by
  those bytes. The empty string is therefore written as 0x00, the same as a missing value.
- **PES string (16-bit length)**: only `CEmbOne` and `CSewSeg` are written this way: u16 length 7, then the 7 ASCII
  bytes.
- **Reading strings**: every byte-to-text decode in the readers uses the WHATWG `"latin1"` label, which is in fact
  **windows-1252**. Bytes 0x80-0x9F map to the windows-1252 characters (0x93 is U+201C “, 0x80 is U+20AC €, and so
  on), not to C1 controls. This matters: thread names read from a file are written back as UTF-8 when the file is
  re-saved, so a wrong decode changes the bytes.
- A PES string read from a file: read the length byte n. If it is 0 or past the end of the data, the result is
  **null**. Otherwise the result is the next n bytes, decoded as windows-1252. If fewer than n bytes are left, the
  result is whatever is left.

### 1.4 Reading past the end of the data

The readers never fail because a file is short. Their primitives behave like this:

- Reading one byte past the end gives "absent", a null-like value. Code checks for it where this document says so.
- Reading a multi-byte little-endian or big-endian integer treats each absent byte as 0. So a u16 whose two bytes
  are both past the end reads as 0, never as absent. (The one exception is spelt out in section 6.3: the PEC stream
  reads single bytes.)
- Skipping past the end is allowed. The position simply moves beyond the end.
- Reading a string of n bytes near the end returns the bytes that exist.

### 1.5 Python-style rounding (`pyRound`)

`pyRound(v)` rounds to the nearest integer, and exact halves go to the even integer (Python 3's `round()`). Define
f = ⌊v⌋ and d = v − f. Both are exact in double precision. Then:

| condition | result |
|---|---|
| d > 0.5 | f + 1 |
| d < 0.5 | f |
| d = 0.5 and f is even | f |
| d = 0.5 and f is odd | f + 1 |

"f is even" means f mod 2 = 0. With JavaScript's `%` on a negative odd f the remainder is −1, so that case falls
through to f + 1, which is correct: −2.5 gives −2 and −3.5 gives −4. Examples: 0.5 → 0, 1.5 → 2, 2.5 → 2, 3.5 → 4,
−0.5 → 0, −1.5 → −2, −2.5 → −2, 32.5 → 32, 42.5 → 42, 637.5 → 638. The function only ever sees finite numbers.
Whether a zero comes out as +0 or −0 is never visible in the output.

### 1.6 Extents

The **extents** of a stitch list are (minX, minY, maxX, maxY) over a stated set of its entries. Each section below
says which entries count. The writer always takes **every** entry, commands included (section 3.2 explains why that
matters). An empty set gives (+∞, +∞, −∞, −∞).

---

## 2. `js/core/threads.js`

### 2.1 Exports

| name | kind | summary |
|---|---|---|
| `PEC_THREADS` | array of 65 | Brother PEC palette. Index 0 is null; 1-64 are `[name, r, g, b]` |
| `PEC_MATCH` | array of 65 | the same, with 62, 63 and 64 (and 0) set to null: the entries a colour may be matched to |
| `PEC_BLANK_ICON` | array of 228 numbers | the empty 48 × 38 PEC thumbnail, as bytes |
| `hexToRgb(hex)` | function | `"#rrggbb"` → `[r, g, b]` |
| `rgbToHex([r, g, b])` | function | → `"#rrggbb"`, lowercase |
| `colorDistance(r1, g1, b1, r2, g2, b2)` | function | red-mean distance, integer arithmetic |
| `nearestIndex(rgb, values)` | function | index of the closest entry, ties go to the later entry |
| `pecThread(i)` | function | `{ index, name, hex }` for PEC index i |
| `nearestBrotherThread(hex)` | function | the closest matchable PEC thread for a colour |
| `pyRound(v)` | function | section 1.5 |

Other modules use these as follows. `PEC_MATCH` entries are indexed as `t[1], t[2], t[3]` for r, g, b and skipped
when null (digitize.js). `pecThread(i).hex`, `.name` and `.index` are all used. `hexToRgb` is used by brands.js and
digitize.js. `pyRound` is used by design.js and doctor.js. All entries must be plain arrays: some callers spread
them or call `.map` on them.

### 2.2 `PEC_THREADS` (the Brother PEC palette)

The array has 65 entries. Index 0 is `null` (it means "unknown"). Entries 1-64 are 4-element arrays
`[name, r, g, b]`:

| idx | name | R | G | B | hex |
|---|---|---|---|---|---|
| 1 | Prussian Blue | 14 | 31 | 124 | #0e1f7c |
| 2 | Blue | 10 | 85 | 163 | #0a55a3 |
| 3 | Teal Green | 0 | 135 | 119 | #008777 |
| 4 | Cornflower Blue | 75 | 107 | 175 | #4b6baf |
| 5 | Red | 237 | 23 | 31 | #ed171f |
| 6 | Reddish Brown | 209 | 92 | 0 | #d15c00 |
| 7 | Magenta | 145 | 54 | 151 | #913697 |
| 8 | Light Lilac | 228 | 154 | 203 | #e49acb |
| 9 | Lilac | 145 | 95 | 172 | #915fac |
| 10 | Mint Green | 158 | 214 | 125 | #9ed67d |
| 11 | Deep Gold | 232 | 169 | 0 | #e8a900 |
| 12 | Orange | 254 | 186 | 53 | #feba35 |
| 13 | Yellow | 255 | 255 | 0 | #ffff00 |
| 14 | Lime Green | 112 | 188 | 31 | #70bc1f |
| 15 | Brass | 186 | 152 | 0 | #ba9800 |
| 16 | Silver | 168 | 168 | 168 | #a8a8a8 |
| 17 | Russet Brown | 125 | 111 | 0 | #7d6f00 |
| 18 | Cream Brown | 255 | 255 | 179 | #ffffb3 |
| 19 | Pewter | 79 | 85 | 86 | #4f5556 |
| 20 | Black | 0 | 0 | 0 | #000000 |
| 21 | Ultramarine | 11 | 61 | 145 | #0b3d91 |
| 22 | Royal Purple | 119 | 1 | 118 | #770176 |
| 23 | Dark Gray | 41 | 49 | 51 | #293133 |
| 24 | Dark Brown | 42 | 19 | 1 | #2a1301 |
| 25 | Deep Rose | 246 | 74 | 138 | #f64a8a |
| 26 | Light Brown | 178 | 118 | 36 | #b27624 |
| 27 | Salmon Pink | 252 | 187 | 197 | #fcbbc5 |
| 28 | Vermilion | 254 | 55 | 15 | #fe370f |
| 29 | White | 240 | 240 | 240 | #f0f0f0 |
| 30 | Violet | 106 | 28 | 138 | #6a1c8a |
| 31 | Seacrest | 168 | 221 | 196 | #a8ddc4 |
| 32 | Sky Blue | 37 | 132 | 187 | #2584bb |
| 33 | Pumpkin | 254 | 179 | 67 | #feb343 |
| 34 | Cream Yellow | 255 | 243 | 107 | #fff36b |
| 35 | Khaki | 208 | 166 | 96 | #d0a660 |
| 36 | Clay Brown | 209 | 84 | 0 | #d15400 |
| 37 | Leaf Green | 102 | 186 | 73 | #66ba49 |
| 38 | Peacock Blue | 19 | 74 | 70 | #134a46 |
| 39 | Gray | 135 | 135 | 135 | #878787 |
| 40 | Warm Gray | 216 | 204 | 198 | #d8ccc6 |
| 41 | Dark Olive | 67 | 86 | 7 | #435607 |
| 42 | Flesh Pink | 253 | 217 | 222 | #fdd9de |
| 43 | Pink | 249 | 147 | 188 | #f993bc |
| 44 | Deep Green | 0 | 56 | 34 | #003822 |
| 45 | Lavender | 178 | 175 | 212 | #b2afd4 |
| 46 | Wisteria Violet | 104 | 106 | 176 | #686ab0 |
| 47 | Beige | 239 | 227 | 185 | #efe3b9 |
| 48 | Carmine | 247 | 56 | 102 | #f73866 |
| 49 | Amber Red | 181 | 75 | 100 | #b54b64 |
| 50 | Olive Green | 19 | 43 | 26 | #132b1a |
| 51 | Dark Fuchsia | 199 | 1 | 86 | #c70156 |
| 52 | Tangerine | 254 | 158 | 50 | #fe9e32 |
| 53 | Light Blue | 168 | 222 | 235 | #a8deeb |
| 54 | Emerald Green | 0 | 103 | 62 | #00673e |
| 55 | Purple | 78 | 41 | 144 | #4e2990 |
| 56 | Moss Green | 47 | 126 | 32 | #2f7e20 |
| 57 | Flesh Pink | 255 | 204 | 204 | #ffcccc |
| 58 | Harvest Gold | 255 | 217 | 17 | #ffd911 |
| 59 | Electric Blue | 9 | 91 | 166 | #095ba6 |
| 60 | Lemon Yellow | 240 | 249 | 112 | #f0f970 |
| 61 | Fresh Green | 227 | 243 | 91 | #e3f35b |
| 62 | Applique Material | 255 | 153 | 0 | #ff9900 |
| 63 | Applique Position | 255 | 240 | 141 | #fff08d |
| 64 | Applique | 255 | 200 | 200 | #ffc8c8 |

Note that "Flesh Pink" appears twice (42 and 57). Brother machines read entries 62-64 as appliqué steps, not
threads. pyembroidery once called 62 and 63 "Orange" and "Cream Yellow"; the names above are the corrected ones.

### 2.3 `PEC_MATCH`

`PEC_MATCH` is a 65-entry array, equal to `PEC_THREADS` except that indices 62, 63 and 64 are `null`. Index 0 is
null as well. Colours are only ever matched against this array (the writer and `nearestBrotherThread`). The readers
use the full `PEC_THREADS`, so a file that uses 62-64 still reads with those names.

### 2.4 `PEC_BLANK_ICON`

This is 228 bytes: a 48 × 38 one-bit thumbnail, 6 bytes per row, rows top to bottom. In each byte, bit 0 (the LSB) is
the leftmost pixel. The bytes draw a rounded rectangle border. Each row in hex:

| row | bytes | row | bytes |
|---|---|---|---|
| 0 | 00 00 00 00 00 00 | 19 | 02 00 00 00 00 40 |
| 1 | F0 FF FF FF FF 0F | 20 | 02 00 00 00 00 40 |
| 2 | 08 00 00 00 00 10 | 21 | 02 00 00 00 00 40 |
| 3 | 04 00 00 00 00 20 | 22 | 02 00 00 00 00 40 |
| 4 | 02 00 00 00 00 40 | 23 | 02 00 00 00 00 40 |
| 5 | 02 00 00 00 00 40 | 24 | 02 00 00 00 00 40 |
| 6 | 02 00 00 00 00 40 | 25 | 02 00 00 00 00 40 |
| 7 | 02 00 00 00 00 40 | 26 | 02 00 00 00 00 40 |
| 8 | 02 00 00 00 00 40 | 27 | 02 00 00 00 00 40 |
| 9 | 02 00 00 00 00 40 | 28 | 02 00 00 00 00 40 |
| 10 | 02 00 00 00 00 40 | 29 | 02 00 00 00 00 40 |
| 11 | 02 00 00 00 00 40 | 30 | 02 00 00 00 00 40 |
| 12 | 02 00 00 00 00 40 | 31 | 02 00 00 00 00 40 |
| 13 | 02 00 00 00 00 40 | 32 | 02 00 00 00 00 40 |
| 14 | 02 00 00 00 00 40 | 33 | 02 00 00 00 00 40 |
| 15 | 02 00 00 00 00 40 | 34 | 04 00 00 00 00 20 |
| 16 | 02 00 00 00 00 40 | 35 | 08 00 00 00 00 10 |
| 17 | 02 00 00 00 00 40 | 36 | F0 FF FF FF FF 0F |
| 18 | 02 00 00 00 00 40 | 37 | 00 00 00 00 00 00 |

Put another way: rows 0 and 37 are all zero; rows 1 and 36 are `F0 FF FF FF FF 0F`; rows 2 and 35 are
`08 00 00 00 00 10`; rows 3 and 34 are `04 00 00 00 00 20`; and rows 4 to 33 (30 rows) are `02 00 00 00 00 40`. The
writer always works on a fresh copy and never changes the exported array.

### 2.5 `hexToRgb(hex)`

The function removes the **first** `#` in the string, if there is one, and then parses characters 0-1, 2-3 and 4-5
as base-16 numbers to get `[r, g, b]`. The parsing follows JavaScript's `parseInt(s, 16)`: it reads the leading hex
digits of the slice, upper or lower case, and gives NaN when there are none (for example on an empty slice). NaN is
returned as it is. Callers always pass `#rrggbb`, but the writer has defined behaviour for NaN components:

- written as a byte, NaN becomes 0;
- every distance to a NaN colour is NaN, so it is never the nearest (section 2.7).

A non-string throws a TypeError. That only matters because a thread without a `color` makes `writePES` throw.

### 2.6 `rgbToHex([r, g, b])`

Returns `#` followed by each component as lowercase hex, left-padded with `0` to two digits. Inputs are integers
0-255.

### 2.7 `colorDistance(r1, g1, b1, r2, g2, b2)` — red-mean

This is the "red mean" weighted Euclidean metric from compuphase.com/cmetric.htm, in the integer form pyembroidery
uses (the squared distance, never square-rooted):

- r̄ = pyRound((r1 + r2) / 2), the half-to-even rounding of section 1.5. For example (199 + 200)/2 = 199.5 gives 200,
  and 2.5 gives 2.
- Δr = r1 − r2, Δg = g1 − g2, Δb = b1 − b2.
- distance = ⌊(512 + r̄)·Δr² / 256⌋ + 4·Δg² + ⌊(767 − r̄)·Δb² / 256⌋

Both floor divisions are arithmetic right shifts by 8 of non-negative 32-bit integers. The largest product,
767 × 255², is below 2³¹. The result is a non-negative integer.

Examples: colorDistance(200,16,46, 199,1,86) = 2 + 900 + 3543 = 4445. colorDistance(26,26,26, 19,43,26) = 1258.
colorDistance(26,26,26, 0,0,0) = 6081.

### 2.8 `nearestIndex(rgb, values)`

`values` is an array whose entries are either falsy (null or undefined: skipped) or arrays whose elements 1, 2 and 3
are r, g and b. Element 0 can be anything. The function goes through the entries in index order and returns the index
of the entry with the smallest `colorDistance(rgb, entry)`.

**Ties go to the later entry.** An entry replaces the current best when its distance is **≤** the best so far. The
starting best distance is +∞, so the first non-null entry with a finite distance always takes the lead. If no entry
qualifies (all null, or every distance is NaN) the result is `null`.

### 2.9 `pecThread(i)`

- If `PEC_THREADS[i]` exists: `{ index: i, name, hex }`, where `hex` is `rgbToHex` of the entry's r, g, b.
- Otherwise (i = 0, i out of range, or i null): `{ index: i, name: "Unknown", hex: "#000000" }`. The `index` field
  holds whatever was passed in, so null stays null.

Every call returns a new object.

### 2.10 `nearestBrotherThread(hex)`

Returns `pecThread(nearestIndex(hexToRgb(hex), PEC_MATCH))`. For example `#ff9900` gives index 11 Deep Gold (never 62
Applique Material), and `#ffffff` gives 29 White.

---

## 3. `js/core/formats.js`: constants, normalisation, overview

### 3.1 Exports

| name | value / signature |
|---|---|
| `STITCH` | 0 |
| `JUMP` | 1 |
| `TRIM` | 2 |
| `STOP` | 3 |
| `END` | 4 |
| `COLOR_CHANGE` | 5 |
| `normalize(pattern)` | → normalised stitch list (section 3.2) |
| `writePES(pattern)` | → `Uint8Array` (section 4) |
| `machineThreads(threads)` | → array of `pecThread` objects (section 4.7) |
| `readEmbroidery(bytes, filename = "design.pes")` | → design object (section 6) |
| `designStats(design)` | → stats object (section 8) |
| `validatePES(bytes, source = null, hoop = null)` | → `{ ok: true, decoded }` or `{ ok: false, error }` (section 9) |

The module imports `MARGIN` (= 2, millimetres) from `./machines.js` for the hoop check, and the threads.js exports it
needs. The file paths `js/core/formats.js` and `js/core/threads.js` must stay, because sw.js precaches them and
`tests/sw.test.mjs` checks that list. If the implementation adds new module files, they must be added to `FILES` in
`sw.js`. Every shipped file starts with the copyright comment
`/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */`.

**Pattern** (the writer's input): `{ stitches: [[x, y, cmd], ...], threads: [thread, ...] }`.
A **thread** is an object:

| field | used for |
|---|---|
| `color` | required, `"#rrggbb"` |
| `description` | the PES chart name. Used when not null/undefined (an empty string counts as present) |
| `name` | the PES chart name when `description` is null/undefined. Reader output has `name` and no `description` |
| `brand` | PES chart brand string |
| `catalog` | PES chart catalogue-number string |

Design-built patterns use `{ color, description, brand: "" }`. Patterns made from files the site opened are the
reader's output objects (section 6), passed back in as they are.

### 3.2 `normalize(pattern)`

Turns `pattern.stitches` into the list that everything else uses: integer coordinates, no stitch longer than 7 mm,
no jump longer than 121 mm, and an END at the end. The output entries are fresh 3-element arrays.

State: a needle position (nx, ny) starting at (0, 0), and a "started" flag starting false. Go through the input in
order:

1. **STITCH or JUMP** at (x, y): round both coordinates with pyRound to get (rx, ry). The limit L is 70 for STITCH
   and 1210 for JUMP.
   - If "started" is true: let dx = rx − nx, dy = ry − ny, and n = ⌈max(|dx|, |dy|) / L⌉. Note this is the
     larger of the two axis distances (Chebyshev), not the Euclidean length. For i = 1 … n − 1, output an extra
     entry of the same command at (nx + pyRound(dx·i / n), ny + pyRound(dy·i / n)). The quotient is the
     double-precision result of (dx × i) / n: multiply first, then divide. Each split point is rounded relative to
     the needle position before this stitch, not to the previous split point. If n ≤ 1 nothing is added (when
     dx = dy = 0, n is 0).
   - Then output (rx, ry, command), set (nx, ny) = (rx, ry), and set "started" to true.
   - The very first STITCH or JUMP is **never** split, however far it is from (0, 0).
2. **Any other command** (TRIM, STOP, END, COLOR_CHANGE, or any other value): output `[nx, ny, command]`. The input
   x and y are ignored, and commands always sit at the current needle position. Before the first STITCH or JUMP
   that position is (0, 0).
3. After the loop: if the output is empty or its last entry is not END, add `[nx, ny, END]`.

An END in the middle of the input is copied through like any other command, and processing goes on after it. The
writer's PEC encoder stops at the first END (section 4.5), but the PES design block does not (section 4.4).

Split examples: a stitch from (−100, −50) to (−15, −30): dx = 85, n = 2, extra point
(−100 + pyRound(42.5), −50 + pyRound(10)) = (−58, −40). A jump from (−10, −25) to (40, 1250): dy = 1275, n = 2,
extra point (−10 + pyRound(25), −25 + pyRound(637.5)) = (15, 613).

**Why "every entry" extents matter.** The writer's extents (box, CEmbOne size, CSewSeg origin, icon scaling) are
taken over every normalised entry, commands included. A command before the first stitch or jump sits at (0, 0), so it
pulls the extents out to include the origin. END sits at the last needle position, which is inside the extents
anyway.

### 3.3 Colour blocks

The **block count** of a normalised list is how many times a STITCH appears while a "new block" flag is set. The
flag starts set, is cleared by any STITCH, and is set again by every COLOR_CHANGE. It is the number of colour blocks
that hold at least one stitch. JUMP, TRIM and STOP do not touch the flag.

---

## 4. `writePES(pattern)`

### 4.1 Steps and errors

1. Normalise the stitches (section 3.2). Call the result **st**.
2. If st has no STITCH entry, throw `Error("There's nothing to stitch.")`.
3. If st has more than 250 COLOR_CHANGE entries, throw
   `Error("Too many colour changes for a PES file (250 max).")`. 250 is allowed.
4. **Threads**: copy `pattern.threads`. While the copy is shorter than the block count (section 3.3), append its last
   thread again (the same object), or `{ color: "#000000" }` when it is empty. Extra threads beyond the block count
   are kept. Call the result **T** and its length **N**. Everything below uses T.
5. Write the file (sections 4.2-4.6) and return it as a new `Uint8Array` of exactly the written length.

If N > 127 the padding sizes in sections 4.5 and 4.6 come out negative, and the current implementation throws a
RangeError ("Invalid typed array length"). Callers never pass that many threads. A new implementation should throw
some Error in that case as well. It must not write a file.

Let E = (minX, minY, maxX, maxY) be the extents of **all** entries of st, and W = maxX − minX, H = maxY − minY.

### 4.2 File layout

| part | start | content |
|---|---|---|
| PES header | 0 | sections 4.3 |
| PES thread chart | 90 | section 4.3 |
| Design block | after chart | section 4.4 (CEmbOne, CSewSeg, v6 trailer) |
| PEC section | P | section 4.5. P is written at offset 8 |
| Colour addendum | after PEC | section 4.6 |

### 4.3 PES header and thread chart

| offset | size | value |
|---|---|---|
| 0 | 8 | ASCII `#PES0060` |
| 8 | 4 | u32: P, the absolute offset of the PEC section (filled in once known) |
| 12 | 2 | u16 1 |
| 14 | 2 | ASCII `02` |
| 16 | 5 | five empty PES strings (5 × 0x00): name, category, author, keywords, comments |
| 21 | 36 | eighteen u16: 0, 0, 0x64, 0x64, 0, 0xC8, 0xC8, 0x64, 0x64, 0x64, 0x07, 0x13, 1, 1, 0, 100, 1, 0 |
| 57 | 1 | 0x00 (an empty PES string) |
| 58 | 24 | six f32: 1, 0, 0, 1, 0, 0 (bytes `00 00 80 3F`, `00 00 00 00`, `00 00 00 00`, `00 00 80 3F`, then 8 × 00) |
| 82 | 6 | three u16 0 (no fills, motifs or feather patterns) |
| 88 | 2 | u16 N (thread count) |
| 90 | var | N thread entries, in order |

Each thread entry:

| field | encoding |
|---|---|
| catalogue number | PES string of `catalog` (missing → 0x00) |
| colour | three bytes R, G, B, from `hexToRgb(color)` (NaN → 0) |
| | 0x00 |
| | u32 0x0000000A (bytes `0A 00 00 00`) |
| description | PES string of `description`, else `name`, else missing |
| brand | PES string of `brand` |
| (chart name) | 0x00 (always missing) |

### 4.4 Design block (CEmbOne + CSewSeg) and the v6 trailer

This part starts right after the thread chart:

| size | value |
|---|---|
| 2 | u16 1 (one design block) |
| 2 | u16 0xFFFF |
| 2 | u16 0 |
| 9 | u16 7, ASCII `CEmbOne` |
| 16 | eight u16 0 |
| 24 | six f32: 1, 0, 0, 1, 1000 − W/2, 1000 + H/2 |
| 2 | u16 1 |
| 2 | u16 0 |
| 2 | u16 0 |
| 2 | u16 W |
| 2 | u16 H |
| 8 | eight 0x00 |
| 2 | u16 S, the number of CSewSeg sections (filled in afterwards) |
| 2 | u16 0xFFFF |
| 2 | u16 0 |
| 9 | u16 7, ASCII `CSewSeg` |
| var | the sections, with u16 0x8003 (bytes `03 80`) **between** consecutive sections. There is none before the first or after the last |
| 2 | u16 K, the length of the colour log |
| 4·K | K × (u16 section index, u16 colour code) |
| 2 | u16 0 |
| 2 | u16 0 |
| 8 | u32 0, u32 0 |
| 8·K | for i = 0 … K − 1: u32 i, u32 0 |

The two translation floats are computed in double precision as (350 + 650) − W/2 and ((100 + H) + 900) − H/2, which
equal 1000 − W/2 and 1000 + H/2, and are then stored as f32. They centre the design in a 130 × 180 mm hoop (pyembroidery's
convention). W and H are integers, so the values are exact.

**Section format**: u16 flag (0 = stitches, 1 = jump), u16 colour code, u16 point count c, then c points, each u16 x
then u16 y. A point (x, y) is stored relative to the design's **bottom-left**: x − minX and y − maxY. The y value is
therefore ≤ 0 and is stored as 16-bit two's complement. All values are integers.

**Colour code of a block**: the CSewSeg colour code is an index into **the thread list T**, not a PEC index. For
colour block number k (0-based) take thread T[k], or the last thread of T when k ≥ N. The code is the
`nearestIndex` of that thread's RGB among all of T's colours, compared by red-mean. Ties go to the later index, so
when two threads have the same colour the code is the **last** thread with that colour. For example threads
[#c8102e, #1a1a1a, #c8102e] give the codes 2, 1, 2.

**Building the sections.** Go through st in *runs*: maximal stretches of consecutive entries with the same command.
Keep:

- the current colour code, starting at the code of block 0, and a block counter whose next value is 1;
- the "last stitch end", starting at (0, 0);
- a section counter, starting at 0;
- the colour log, starting empty, and the "last logged code", starting at none.

For each run:

| run command | action |
|---|---|
| JUMP | emit a **jump section** with exactly 2 points: the last stitch end, then the last entry of the run |
| STITCH | set the last stitch end to the run's last entry, then emit a **stitch section** with every entry of the run |
| COLOR_CHANGE | set the current colour code to the code of the block numbered by the block counter, then add 1 to the counter. This happens **once per run**, so two COLOR_CHANGEs in a row move on by only one block |
| anything else (TRIM, STOP, END) | nothing. These runs still split runs, so STITCH, TRIM, STITCH gives two stitch sections |

Emitting a section: if this is not the first section, first write the u16 0x8003 separator. If the current colour
code differs from the last logged code, add (section counter, colour code) to the colour log and make it the last
logged code. Then write the flag, the colour code, the point count and the points, and add 1 to the section counter.
So the first section is always logged, and later sections are logged only when the code has changed.

Note that a jump section starts at the end of the last **stitch run**, not at wherever the needle was before the
jump. A jump run that comes after another jump run, with only a TRIM between them, also starts at that last stitch
end. Before any stitch the jump section starts at (0, 0), stored as (−minX, −maxY).

S is the final section counter and K is the length of the colour log.

### 4.5 PEC section

The PEC section starts at offset P. Write P at offset 8 as u32.

**PEC header (512 bytes)**, offsets relative to P:

| offset | size | value |
|---|---|---|
| 0 | 3 | ASCII `LA:` |
| 3 | 16 | ASCII `Untitled` then 8 spaces (0x20) |
| 19 | 1 | 0x0D |
| 20 | 12 | 12 × 0x20 |
| 32 | 2 | 0xFF, 0x00 |
| 34 | 1 | 0x06 (thumbnail bytes per row) |
| 35 | 1 | 0x26 (= 38, thumbnail rows) |
| 36 | 12 | 12 × 0x20 |
| 48 | 1 | N − 1 |
| 49 | N | the PEC palette index of each thread in T, in order (section 4.7) |
| 49 + N | 463 − N | 0x20 padding (up to offset 511) |

**Stitch block**, starting at B = P + 512:

| offset from B | size | value |
|---|---|---|
| 0 | 2 | 0x00 0x00 |
| 2 | 3 | u24 L: the length of the stitch block from B up to and including its final 0xFF (filled in afterwards) |
| 5 | 3 | 0x31 0xFF 0xF0 |
| 8 | 2 | u16 W |
| 10 | 2 | u16 H |
| 12 | 2 | u16 0x01E0 (bytes `E0 01`) |
| 14 | 2 | u16 0x01B0 (bytes `B0 01`) |
| 16 | 2 | **big-endian** 0x9000 OR ((−minX) mod 4096) |
| 18 | 2 | **big-endian** 0x9000 OR ((−minY) mod 4096) |
| 20 | var | the encoded stitch stream (below), ending with 0xFF |

The four bytes at B+16 are the **design box**. Brother machines read them as the top-left of the design relative to
the stitch origin, and start decoding stitches after them. pyembroidery puts its opening jump there instead, which
makes machines show the design shifted and clipped. "mod 4096" here is the low 12 bits in two's complement. For example
minX = −438 gives −minX = 438 = 0x1B6 and the bytes `91 B6`; minX = 438 gives −438 → 0xE4A and the bytes `9E 4A`.

**Stitch stream.** Go through st in order. Keep the encoder position (xx, yy), starting at (0, 0), a "toggle" value
starting at 2, a "jumping" flag starting **true**, and a "first entry" flag that is true only for the first entry of
st.

For each entry, dx = pyRound(x − xx) and dy = pyRound(y − yy). Coordinates are integers, so this is plain
subtraction. Add dx and dy to xx and yy. This happens for every entry, commands included, and commands have
dx = dy = 0. Then:

| entry | bytes written |
|---|---|
| STITCH | if jumping: write two zero bytes `00 00` **only if dx ≠ 0 and dy ≠ 0**, and in either case clear jumping. Then write dx and dy as plain values |
| JUMP | set jumping. Let flag = 0x10 if this is the first entry of st, else 0x20. Write dx and dy as long values with that flag |
| COLOR_CHANGE | if jumping: write `00 00` (whatever dx and dy are) and clear jumping. Then write `FE B0` and the toggle byte, which is 2 for the first colour change, then 1, then 2, and so on |
| END | write `FF` and **stop**. Nothing after the first END is encoded |
| TRIM, STOP, others | nothing |

**Value encoding:**

- *Plain value* v (stitches): if −64 < v < 63 (so −63 … 62), write one byte v AND 0x7F. Otherwise write the long
  form with flag 0.
- *Long value* v with flag f: u = (v AND 0x0FFF) OR 0x8000 OR (f × 256). Write u **big-endian** (high byte first).
  So flag 0 gives 0x8nnn, flag 0x10 gives 0x9nnn, flag 0x20 gives 0xAnnn, where nnn is the 12-bit two's complement
  of v.

So every jump except one that is the very first entry of st carries the 0x20 ("trim") flag, whether or not a TRIM
came before it. Reading such a file back gives TRIM + JUMP for each of those jumps. Stitches 63 to 70 units long on
one axis use the long form with no flag, for example `80 41` for 65.

L is (the position after the 0xFF) − B.

**Thumbnails.** These follow the stitch block directly, each 228 bytes and each starting from a fresh copy of
`PEC_BLANK_ICON`:

1. One thumbnail of the whole design: every STITCH entry of st, drawn with a border of 4 (below). It does not matter
   how the stitches are grouped, because they all go on one image with the same transform.
2. Then one thumbnail per colour section, drawn with a border of 5. Go through st collecting STITCH entries. At every
   COLOR_CHANGE, draw what was collected on a fresh blank image, write it, and start collecting again. After the
   last entry, draw what is left on a fresh image and write it. So there are (number of COLOR_CHANGE entries + 1) of
   these, including empty ones when two COLOR_CHANGEs come in a row. JUMP, TRIM and END do not end a section.

In total there are (number of COLOR_CHANGE entries + 2) thumbnails. That count does not depend on N.

**Drawing points onto a thumbnail** with border β. Image width gw = 48 and height gh = 38. Use E, the extents of all
entries of st. All arithmetic is IEEE double, done in exactly this order, because the results are floored and every
rounding step counts:

- dw = maxX − minX, or 1 when that is 0; dh = maxY − minY, or 1 when that is 0.
- scale = min((gw − β) / dw, (gh − β) / dh).
- tx = 24 − ((maxX + minX) / 2) × scale, and ty = 19 − ((maxY + minY) / 2) × scale. Compute the product, round it,
  then do the addition (−(m × scale) + 24 gives the same bits).
- For each point (x, y): px = ⌊x × scale + tx⌋ and py = ⌊y × scale + ty⌋. Compute the product, round, then add.
- Byte index i = py × 6 + trunc(px / 8), truncating towards zero. If i < 0, add 228 (this copies Python's negative
  indexing). If i is still outside 0 … 227, skip the point. Otherwise set bit ((px mod 8) + 8) mod 8 of byte i, so
  the bit number is never negative.

Every point lies inside E, so in practice px and py fall well inside the image, and the negative cases are only
there for completeness.

### 4.6 Colour addendum

This comes right after the last thumbnail:

| size | value |
|---|---|
| 1 | N − 1 |
| N | the same PEC palette indices as in the PEC header |
| 127 − N | 0x20 padding |
| 144 · N | zero bytes (0x90 per thread) |
| 3 · N | for each thread in T: u24 of (R·65536 + G·256 + B), so the bytes come out **B, G, R** |
| 2 | u16 0 |

The file ends here.

### 4.7 PEC palette indices, and `machineThreads(threads)`

Each thread gets a PEC index so that **no two different colour strings share a Brother thread**:

1. Start with a working copy of `PEC_MATCH` (61 usable entries) and an empty 65-slot "claimed" table.
2. Go through the threads in order. Skip a thread whose `color` **string** has already been seen. This is an exact
   string comparison, so `#FF0000` and `#ff0000` are different colours. For a new colour, find `nearestIndex` of its
   RGB in the working copy. If that is null (every entry used, or the colour is NaN), **stop**: no later thread
   claims anything. Otherwise remove that entry from the working copy (set it to null) and record the colour's RGB in
   the claimed table at that index.
3. The index for each thread in the list (repeats and unclaimed ones included) is `nearestIndex` of its RGB in the
   claimed table, with ties going to the higher PEC index. A repeated colour gets the same index as its first
   occurrence, unless another claimed colour with the identical RGB sits at a higher index. A colour that never
   claimed an entry gets the nearest claimed one.

So the second colour that wants a thread gets its next-closest one. If the claimed table is empty (the first
distinct colour already found nothing, i.e. it was NaN) every index is null, and null is written as the byte 0.
Real designs never get there.

`machineThreads(threads)` returns these indices in thread order, each turned into `pecThread(index)`
(`{ index, name, hex }`). It must agree exactly with the bytes `writePES` writes: a test checks 200 random thread
lists against the PEC colour bytes read back. It takes the thread list as given, with no padding.

Examples: [#c8102e, #1a1a1a, #c8102e] gives indices 51 (Dark Fuchsia), 50 (Olive Green), 51.

---

## 5. Reading: shared output shape

A *design* returned by the readers:

| field | PES / PEC | DST |
|---|---|---|
| `stitches` | `[[x, y, cmd], ...]`, integers, ends with END | the same |
| `threads` | array of thread objects (section 6.4) | from TC header lines (section 7) |
| `format` | `"pes"` (PEC files too) | `"dst"` |
| `version` | the 4 characters after `#PES`/`#PEC` in the signature, e.g. `"0060"`, `"0001"` | `""` |
| `toggles` | the colour-change toggle bytes in order (empty array if none) | field absent |
| `pec` | array of the PEC palette bytes from the PEC header | absent |
| `misplaced` | boolean (section 6.3) | absent |

Keep the key order as listed: stitches, threads, format, version, toggles, pec, misplaced. Every stitch entry is a new
3-element array. The reader keeps a running needle position, starting at (0, 0):

- a *stitch* (dx, dy) moves the needle and adds STITCH at the new position;
- a *move* (dx, dy) moves the needle and adds JUMP at the new position;
- a *command* c adds c at the current position.

---

## 6. `readEmbroidery(bytes, filename = "design.pes")`

`bytes` is a `Uint8Array` (a Node Buffer works too). Dispatch:

1. ext = the part of `filename` after its last `.`, lowercased. With no dot it is the whole name. If that is empty
   the result is `""`.
2. Decode the first 8 bytes as windows-1252. If they start with `#PES` or `#PEC`, read as PES (section 6.1).
3. Else if ext is `dst`, read as DST (section 7).
4. Else if ext is `pes` or `pec`, read as PES.
5. Otherwise throw `Error("Can't open .<ext> files yet. Try a PES, PEC or DST file.")`, with the lowercased ext.

The PES and DST readers do not throw on bad data (section 1.4).

### 6.1 PES container

Read the 8-character signature at offset 0. version = characters 4-7.

- Signature exactly `#PEC0001`: the PEC section starts at offset 8. There is no thread chart.
- Anything else: read u32 at offset 8 as the PEC offset (unsigned). Then, starting at offset 12, try to read the
  thread chart for the versions below. If anything goes wrong while reading the chart, throw the chart away (empty).
  Then read the PEC section at the PEC offset.

Chart location by signature. Every row starts at offset 12 with "skip 4 bytes, read 5 PES strings":

| signature | then |
|---|---|
| `#PES0050`, `#PES0055`, `#PES0056` | skip 24, read 1 PES string, skip 24, thread chart |
| `#PES0060`, `#PES0070` | skip 36, read 1 PES string, skip 24, thread chart |
| `#PES0080` | skip 38, read 1 PES string, skip 26, thread chart |
| `#PES0090` | skip 14, read 1 PES string, skip 30, read 1 PES string, skip 34, thread chart |
| `#PES0100` | skip 14, read 1 PES string, skip 38, read 1 PES string, skip 34, thread chart |
| any other (v1-v4, unknown) | no chart |

The strings read here are thrown away.

**Thread chart:** read up to three u16 in turn. If any of them is non-zero, give up and leave the chart empty. These
are the fill, motif and feather counts, and the reader stops at the first non-zero one. Then read u16 n and n
entries. Each entry is: PES string catalogue; RGB as a **big-endian** 24-bit value (bytes R, G, B); skip 5 bytes;
PES string name; PES string brand; one more PES string, thrown away. Each entry becomes the object

  `{ color: rgbToHex(R, G, B), name: name or "" when null, brand: brand (may be null), catalog: catalog (may be null) }`.

Past the end of the file every field reads as 0 or null, so a bogus count still adds n entries, each
`{ color: "#000000", name: "", brand: null, catalog: null }`.

### 6.2 PEC header

Starting at the PEC offset: skip 3 (`LA:`), read 16 characters of label (thrown away), skip 15, read two single bytes
(thumbnail stride and height, thrown away), skip 12. Then read the byte **c**, the number of colour changes. If it is
absent, treat it as 0 for the count. The colour list is the next c + 1 bytes, or fewer if the file ends. Store them
as `pec`, an array of numbers.

The stitch block is always read at PEC offset + 512. The reader skips 0x1D0 − c bytes after the colour list (an absent
c counts as 0), which works out to PEC + 514 whatever c is.

**Threads for the design:**

- A PEC thread for byte b: entry `PEC_THREADS[b mod 65]` (the full palette, so 62-64 included). If it exists:
  `{ color: its hex, name: its name, brand: "Brother" }`. Index 0 (b = 0 or 65 or 130 …) gives
  `{ color: "#000000", name: "Unknown" }`, with no brand field.
- If the thread chart is empty: one PEC thread per colour byte, in order.
- Else if the chart has at least as many entries as there are colour bytes: the threads are the **whole** chart, in
  order, even if it is longer.
- Else (a short chart): give out chart entries in order to the distinct keys b mod 65 as they first appear. When the
  chart runs out, a new key gets its PEC thread. A repeated key reuses the same object. There is one thread per
  colour byte.

### 6.3 PEC stitch block, decoded the way the machine reads it

At PEC + 514: read u24 L (the block length; nothing after this point uses it). Skip 3. Read u16 w and u16 h. Skip 4
(0x1E0, 0x1B0). Read the design box: two **big-endian** 16-bit values, each reduced to a signed 12-bit number
(v AND 0xFFF, minus 4096 if over 0x7FF), giving px and py. The flag bits are ignored. These four bytes are **not** a
stitch.

Then decode, a byte at a time, with signed-7-bit s7(v) = v − 128 if v > 63, else v, and signed-12-bit s12 as above:

1. Read v1 and v2. If v2 is absent (the end of the data) or (v1, v2) = (0xFF, 0x00), stop.
2. If (v1, v2) = (0xFE, 0xB0): read one more byte (the toggle, possibly absent, which is stored as null), add it to
   `toggles`, add COLOR_CHANGE at the current position, and go back to step 1.
3. **x**: if v1 has bit 0x80 set, x is a long value: bit 0x20 of v1 marks trim, bit 0x10 marks jump,
   x = s12(v1·256 + v2), and then a **new** v2 is read (if it is absent, stop). If v1 does not have bit 0x80 set,
   x = s7(v1) and v2 stays the second byte read in step 1.
4. **y**: if v2 has bit 0x80 set, it is a long value with its own trim/jump bits (0x20/0x10, combined with x's). Read
   v3; if it is absent, stop. y = s12(v2·256 + v3). Otherwise y = s7(v2).
5. If jump is set: move (x, y). Else if trim is set: add a TRIM command at the current position, then move (x, y),
   which adds a JUMP. Else: stitch (x, y). Go back to step 1.

When the loop stops (by any route), add END at the current position.

A lone 0xFF followed by a non-zero byte is **not** an end: it decodes as a long value. The writer's 0xFF is always
followed by the first thumbnail byte, 0x00.

**misplaced:** the box says the design covers x0 = −px … x0 + w and y0 = −py … y0 + h. `misplaced` is true if any
STITCH or JUMP entry has x < x0 − 1, x > x0 + w + 1, y < y0 − 1 or y > y0 + h + 1. These are strict comparisons with
a tolerance of 1 unit. Such a file is pyembroidery-style: its "box" bytes are really its opening jump. If misplaced,
the stitch list becomes a JUMP at (px, py) followed by **every** decoded entry (commands too) shifted by (+px, +py).
That is what the file meant, and it matches pyembroidery's reading.

For a non-misplaced (Brother-style) file the coordinates are relative to the stitch origin, exactly as decoded.
Reading back a file from `writePES` gives the normalised stitches with these differences:

- each 0x20-flagged jump comes back as TRIM followed by JUMP;
- the writer's own TRIM, STOP and any second END are gone;
- where the writer added `00 00`, there is a zero-length STITCH right after the jump;
- COLOR_CHANGE entries are in the same places.

### 6.4 Thread objects

- From a chart: `{ color, name, brand, catalog }`.
- From the PEC palette: `{ color, name, brand: "Brother" }`, or `{ color: "#000000", name: "Unknown" }`.
- From DST: `{ color, name }`.

---

## 7. DST reader

1. **Header**: decode the first 512 bytes as windows-1252 and split them at every CR and every LF (each one separately,
   so empty lines appear). For each line that starts with `TC` and is longer than 3 characters, take everything after
   the first 3 characters, split it at commas, and trim each part with JavaScript `String.prototype.trim`. That
   removes ECMAScript white space and line terminators, including U+00A0. The first part is the colour and the
   second the name. Add `{ color: first part if it starts with "#", else "#" + first part, name: second part, or ""
   if missing or empty }`. Other lines are ignored.
2. **Records**: from offset 512, read 3-byte records b0, b1, b2 while a whole record remains. Ignore a partial
   trailing record. For each record:
   - dx = the sum of the terms present: b2 bit 2 → +81, b2 bit 3 → −81, b1 bit 2 → +27, b1 bit 3 → −27,
     b0 bit 2 → +9, b0 bit 3 → −9, b1 bit 0 → +3, b1 bit 1 → −3, b0 bit 0 → +1, b0 bit 1 → −1.
   - dy = **minus** the sum of: b2 bit 5 → +81, b2 bit 4 → −81, b1 bit 5 → +27, b1 bit 4 → −27, b0 bit 5 → +9,
     b0 bit 4 → −9, b1 bit 7 → +3, b1 bit 6 → −3, b0 bit 7 → +1, b0 bit 6 → −1. DST y grows upwards; ours grows
     downwards.
   - Classify by b2, in this order:

     | test | meaning | action |
     |---|---|---|
     | (b2 AND 0xF3) = 0xF3 | end | stop reading records (the needle does not move) |
     | (b2 AND 0xC3) = 0xC3 | colour change | move the needle by (dx, dy) without adding an entry, then add COLOR_CHANGE there |
     | (b2 AND 0x43) = 0x43 | sequin mode toggle | move the needle by (dx, dy), add nothing |
     | (b2 AND 0x83) = 0x83 | jump | move (dx, dy), adding a JUMP |
     | otherwise | stitch | stitch (dx, dy) |
3. Add END at the current position.
4. Run **trim interpolation** (below) on the list.
5. Return `{ stitches, threads, format: "dst", version: "" }`.

**Trim interpolation.** DST has no trim command, so three jumps in a row mean "trim here". Jump runs that end where
they started are removed. This copies pyembroidery's `interpolate_trims` with a required count of 3, including the
quirks below. Work on a copy of the list, walking an index i from the start. Keep:

- the previous entry's position (px, py), starting at (0, 0);
- a "jumping" flag (false);
- a "trimmed" flag (**true**);
- the run's start index, its jump count, and its running net displacement (jdx, jdy).

For each entry, in order:

1. Its displacement is (x − px, y − py). Then set (px, py) to its position, which also happens for entries that are
   later removed.
2. STITCH: clear trimmed and clear jumping. COLOR_CHANGE or TRIM: set trimmed and clear jumping. Other commands (END)
   change neither flag.
3. If it is a JUMP:
   - If not jumping: set start = i, count = 0, jdx = jdy = 0, and set jumping.
   - Add 1 to count, and add the displacement to jdx and jdy.
   - If not trimmed and count is exactly 3: **insert a new entry `[0, 0, TRIM]` at index start**. Note the
     coordinates (0, 0): this is not the needle position. Move start and i up by one (the TRIM is now before the run)
     and set trimmed.
   - Then, if jdx = 0 and jdy = 0: **remove** every entry from start to i inclusive. The walk carries on from the
     entry that now sits at index start. Jumping, count and the (now zero) net displacement **stay as they are**: if
     more jumps follow straight away, they continue the same run and the count keeps going up from where it was. A
     TRIM inserted earlier, before start, stays.
4. Move on to the next entry.

Example (positions along x only): S(1), J(4), J(7), J(10), S(11), J(14), J(11), S(12), J(15), J(12), J(15), J(18),
S(19), C, J(22), J(25), J(28), S(29), END becomes S(1), TRIM(0,0), J(4), J(7), J(10), S(11), S(12), TRIM(0,0), J(15),
J(18), S(19), C(19), J(22), J(25), J(28), S(29), END(29). The run J(15) J(12) is removed, and the next J(15) is the
3rd jump of the same run, so it gets the trim. The jumps after the colour change get no trim, because a colour change
counts as a trim.

---

## 8. `designStats(design)`

Input: anything with `stitches` (reader output or a pattern; coordinates may be fractional). Returns:

| field | value |
|---|---|
| `stitches` | the number of STITCH entries |
| `jumps` | the number of JUMP entries |
| `trims` | the number of TRIM entries |
| `colorChanges` | the number of COLOR_CHANGE entries |
| `bounds` | [minX, minY, maxX, maxY] over STITCH entries only ([∞, ∞, −∞, −∞] when there are none) |
| `widthMm` | (maxX − minX) / 10 |
| `heightMm` | (maxY − minY) / 10 |
| `longestMm` | the largest Euclidean distance (`Math.hypot`) between an entry and the entry just before it, counting only pairs where **both** are STITCH, divided by 10. 0 if there are none |

---

## 9. `validatePES(bytes, source = null, hoop = null)`

Checks the bytes of a PES file the site is about to hand out (or one it opened). It returns `{ ok: false, error }` at
the first failure, otherwise `{ ok: true, decoded }`, where `decoded` is the `readEmbroidery` result. The checks below
run **in this order**, and each error string must be exactly as given (the site shows them, and a test matches
`/cut off/`).

| # | check | error message |
|---|---|---|
| 1 | `bytes` is missing, or shorter than 512 bytes | `The file is too short to be a PES file.` |
| 2 | the first 8 bytes (windows-1252) match `#PES` followed by exactly four ASCII digits 0-9 | `The file doesn't start with a PES signature.` |
| 3 | pecAt = bytes 8-11 as a **signed** little-endian 32-bit integer (byte 11 ≥ 0x80 makes it negative). Fail if pecAt < 12 or pecAt ≥ length | `The PES file points to a missing stitch section.` |
| 4 | the (up to) 3 bytes at pecAt decode to `LA:` | `The stitch section is damaged.` |
| 5 | d = readEmbroidery(bytes, "check.pes"). If it throws: | `The file couldn't be read back: ` + the error's message |
| 6 | d has at least one STITCH entry | `The file has no stitches.` |
| 7 | d.misplaced is false | `This file would load cut off on Brother machines (its design box doesn't match its stitches).` |
| 8 | the last entry of d is END | `The file has no end marker.` |
| 9 | toggles[i] = 2 when i is even and 1 when i is odd, for every i | `A colour-change marker in the file is damaged.` |
| 10 | d.threads.length ≥ blocks, where blocks = (COLOR_CHANGE entries in d) + 1 | `The file has fewer thread colours than colour changes.` |

If `source` is given (a pattern, normally the one just passed to `writePES`), the following checks come next. They use
**moves(list)**: the STITCH entries of the list, leaving out any STITCH whose previous entry (of any command) has the
same x and y. The first entry is never left out. This removes PEC's zero-length anchor stitches after jumps.

| # | check | error message |
|---|---|---|
| 11 | want = moves(normalize(source)) and got = moves(d.stitches) have the same length | ``Stitch count changed in the file (<got length> vs <want length>).`` |
| 12 | for each i, want[i] and got[i] have the same x and y. Report the first one that differs | ``Stitch <i+1> moved when written to the file.`` |
| 13 | (COLOR_CHANGE entries in **source.stitches**, not normalised) + 1 = blocks | `Colour changes were lost when writing the file.` |
| 14 | the PES design block can be read (below) | `The file is missing its PES design block.` |
| 15 | seg = moves(design block stitches) has the same length as got | `The PES design block doesn't match the stitches.` |
| 16 | with (ox, oy) = got[0] − seg[0], every seg[i] + (ox, oy) equals got[i] | `The PES design block doesn't match the stitches.` |
| 17 | with E = the extents of **all** entries of normalize(source): block w = maxX − minX, block h = maxY − minY, ox = minX and oy = maxY | `The PES design block has the wrong size or position.` |

If `hoop` is given (`{ w, h, name }` in mm, e.g. `{ w: 130, h: 180, name: '5" × 7" hoop' }`):

| # | check | error message |
|---|---|---|
| 18 | with the extents of d's STITCH entries, w = (maxX − minX)/10 and h = (maxY − minY)/10. Fail if w > hoop.w − 2·MARGIN or h > hoop.h − 2·MARGIN | ``The design is <w> × <h> mm, but the <hoop.name> fits <lw> × <lh> mm.`` |

In message 18, w and h are formatted with JavaScript `toFixed(0)`, so an exact half rounds up: 146.5 gives "147".
lw = hoop.w − 4 and lh = hoop.h − 4 are printed as plain JavaScript numbers (126, 176). The `×` is U+00D7. For
example: `The design is 147 × 17 mm, but the 5x7 fits 126 × 176 mm.`

If both moves lists are empty (every stitch sits on its predecessor's position), check 16 reads the first element of
an empty list, and the current code throws a TypeError out of `validatePES`. That never happens with real designs. A
new implementation may throw too.

**Reading the PES design block** (for checks 14-17), given end = pecAt:

1. Find the first `CEmbOne` (ASCII) that starts at index 12 or later and ends at or before `end`. If it is found,
   find the first `CSewSeg` that starts at the `CEmbOne` index or later and ends at or before `end`. If either is
   missing: no block (check 14 fails).
2. All reads below treat bytes at or after `end` as absent (section 1.4).
3. Block w and h: the u16 values at (CEmbOne index + 7 + 46) and the 2 bytes after. That skips the 7-character name,
   16 zero bytes, 24 bytes of floats and 3 u16, landing on the W and H the writer stored.
4. From CSewSeg index + 7, read sections over and over. Each one is: u16 flag; u16 (colour code, thrown away); u16
   count n. If position + 4·n > end: no block. Read n points, each as two u16 values treated as signed 16-bit. If the
   flag is 1, add **one** JUMP at the section's last point (with n = 0 the current code throws a TypeError). Any
   other flag adds every point as a STITCH. Then read a u16. If it is 0x8003, read the next section; otherwise stop.
5. The result: w, h and the stitch list.

---

## 10. Behaviour checklist (things that are easy to get wrong)

1. The writer's extents (box, CEmbOne size and translation, CSewSeg origin, thumbnail scaling) cover **all**
   normalised entries, commands included, and commands before the first stitch or jump sit at (0, 0).
   `designStats` and the hoop check in `validatePES` use STITCH entries only.
2. Long stitches and jumps are split on the **larger axis distance**, with split points pyRound(d·i/n) **relative to
   the previous needle position**. The first stitch or jump is never split. Limits: 70 for stitches, 1210 for jumps.
3. pyRound is half-to-even, including negative halves (−2.5 → −2, −3.5 → −4).
4. `nearestIndex` ties go to the **later** index (≤ comparison). This decides the CSewSeg colour codes (a repeated
   colour takes the last thread with that colour) and the choice between PEC threads at equal distance.
5. PEC palette uniqueness uses exact `color` strings, stops at the first colour that finds nothing, and never uses
   62-64.
6. In CSewSeg: 0x8003 goes between sections only. A run of consecutive COLOR_CHANGEs moves on by one block. A jump
   section starts at the last stitch run's end. The colour log records only changes of code. y is stored relative to
   maxY (≤ 0).
7. PEC jump flag: 0x10 only when the jump is the **first entry** of st, otherwise 0x20. The `00 00` after a jump comes
   before a STITCH only when **both** dx ≠ 0 and dy ≠ 0, but before a COLOR_CHANGE whatever dx and dy are. "jumping"
   starts true, so a first entry that is a STITCH with both deltas non-zero also gets `00 00`.
8. A plain value fits one byte only for −63 … 62. Long values are big-endian. The design box is big-endian too.
   Every other multi-byte field is little-endian.
9. Toggle bytes start at 2 and alternate 2, 1, 2, ….
10. The PEC header is exactly 512 bytes. The addendum pads to 128 bytes (count byte + indices + 0x20s), then
    0x90·N zeros, then B, G, R per thread, then two zeros.
11. Thumbnails: 1 + (COLOR_CHANGE count + 1), using the floating-point order above.
12. Readers decode text as **windows-1252**, not ISO-8859-1.
13. The DST trim interpolation inserts TRIM at (0, 0), and its counter keeps going across removed runs.
14. PEC reading: chart threads replace the PEC colours when the chart is at least as long as the colour list. A short
    chart is handed out by distinct key b mod 65.
15. `misplaced` uses the box with a ±1 tolerance and re-bases **all** entries.

---

## Appendix A. Error messages

| function | condition | thrown / returned |
|---|---|---|
| writePES | no STITCH after normalising | throws `Error("There's nothing to stitch.")` |
| writePES | more than 250 COLOR_CHANGE | throws `Error("Too many colour changes for a PES file (250 max).")` |
| writePES | more than 127 threads after padding | throws (currently RangeError) |
| writePES | a thread without a string `color` | throws (TypeError) |
| readEmbroidery | unknown extension and no PES/PEC signature | throws `Error("Can't open .<ext> files yet. Try a PES, PEC or DST file.")` |
| validatePES | see section 9 | returns `{ ok: false, error: <message> }` |

## Appendix B. Numeric checks

- pyRound: 2.5 → 2, 3.5 → 4, −2.5 → −2, −0.5 → 0, 0.5 → 0, 1.5 → 2, −1.5 → −2, 637.5 → 638.
- colorDistance(200,16,46, 199,1,86) = 4445; (26,26,26, 19,43,26) = 1258; (26,26,26, 0,0,0) = 6081.
- nearestBrotherThread("#c8102e") = 51 Dark Fuchsia; "#1a1a1a" = 50 Olive Green; "#ff9900" = 11 Deep Gold;
  "#ffffff" = 29 White.

## Appendix C. Worked example (test vector)

**Input pattern:**

- threads: `{ color: "#c8102e", description: "Red" }`, `{ color: "#1a1a1a", description: "Black" }`,
  `{ color: "#c8102e" }`
- stitches (x, y, cmd): (−100.5, −50.5, JUMP), (−100.5, −50.5, STITCH), (−15, −30, STITCH), (−10, −25, STITCH),
  (0, 0, TRIM), (40, 1250, JUMP), (40, 1250, STITCH), (105, 1250, STITCH), (0, 0, COLOR_CHANGE), (40, 1310, JUMP),
  (30, 1320, STITCH), (20, 1330, STITCH), (0, 0, COLOR_CHANGE), (20, 1270, STITCH), (−10, 1270, STITCH),
  (0, 0, END)

**normalize →** (−100,−50,J) (−100,−50,S) (−58,−40,S) (−15,−30,S) (−10,−25,S) (−10,−25,T) (15,613,J) (40,1250,J)
(40,1250,S) (105,1250,S) (105,1250,C) (40,1310,J) (30,1320,S) (20,1330,S) (20,1330,C) (20,1270,S) (−10,1270,S)
(−10,1270,END)

Extents: minX −100, minY −50, maxX 105, maxY 1330, so W = 205 and H = 1380. CEmbOne floats 897.5 and 1690. CSewSeg
colour codes per block: 2, 1, 2. PEC indices: 51, 50, 51. 7 sections. Colour log: (0, 2), (4, 1), (6, 2). File
length 2451 bytes, SHA-256 `1657b14a16fc0fb735134d5f563e4ec477333cd5ec6d5b10b435edafe35b17df`, P = 390.

**Stitch block** (B = 902, L = 66):

```
00 00 42 00 00 31 ff f0 cd 00 64 05 e0 01 b0 01 90 64 90 32
9f 9c 9f ce                   jump (−100, −50), flag 0x10 (first entry)
00 00                         stitch (0, 0); no anchor, since dx = dy = 0
2a 0a 2b 0a 05 05             stitches
a0 19 a2 7e a0 19 a2 7d       two jump pieces (25, 638), (25, 637), flag 0x20
00 00                         stitch (0, 0)
80 41 00                      stitch (65, 0): long form, no flag
fe b0 02                      colour change, toggle 2
af bf a0 3c                   jump (−65, 60), flag 0x20
00 00                         anchor: next stitch has dx ≠ 0 and dy ≠ 0
76 0a 76 0a                   stitches (−10, 10) twice
fe b0 01                      colour change, toggle 1
00 44 62 00                   stitches (0, −60), (−30, 0)
ff                            END
```

**Read back** with `readEmbroidery(bytes, "x.pes")`: stitches (−100,−50,J) (−100,−50,S) (−58,−40,S) (−15,−30,S)
(−10,−25,S) (−10,−25,T) (15,613,J) (15,613,T) (40,1250,J) (40,1250,S) (105,1250,S) (105,1250,C) (105,1250,T)
(40,1310,J) (40,1310,S) (30,1320,S) (20,1330,S) (20,1330,C) (20,1270,S) (−10,1270,S) (−10,1270,END). threads
`{color:"#c8102e",name:"Red",brand:null,catalog:null}`, `{color:"#1a1a1a",name:"Black",brand:null,catalog:null}`,
`{color:"#c8102e",name:"",brand:null,catalog:null}`. format "pes", version "0060", toggles [2, 1],
pec [51, 50, 51], misplaced false. `validatePES(bytes, pattern, { w: 130, h: 180, name: "5x7" })` is ok.

**Full file** (xxd):

```
00000000: 2350 4553 3030 3630 8601 0000 0100 3032  #PES0060......02
00000010: 0000 0000 0000 0000 0064 0064 0000 00c8  .........d.d....
00000020: 00c8 0064 0064 0064 0007 0013 0001 0001  ...d.d.d........
00000030: 0000 0064 0001 0000 0000 0000 803f 0000  ...d.........?..
00000040: 0000 0000 0000 0000 803f 0000 0000 0000  .........?......
00000050: 0000 0000 0000 0000 0300 00c8 102e 000a  ................
00000060: 0000 0003 5265 6400 0000 1a1a 1a00 0a00  ....Red.........
00000070: 0000 0542 6c61 636b 0000 00c8 102e 000a  ...Black........
00000080: 0000 0000 0000 0100 ffff 0000 0700 4345  ..............CE
00000090: 6d62 4f6e 6500 0000 0000 0000 0000 0000  mbOne...........
000000a0: 0000 0000 0000 0080 3f00 0000 0000 0000  ........?.......
000000b0: 0000 0080 3f00 6060 4400 40d3 4401 0000  ....?.``D.@.D...
000000c0: 0000 00cd 0064 0500 0000 0000 0000 0007  .....d..........
000000d0: 00ff ff00 0007 0043 5365 7753 6567 0100  .......CSewSeg..
000000e0: 0200 0200 6400 cefa 0000 9cfa 0380 0000  ....d...........
000000f0: 0200 0400 0000 9cfa 2a00 a6fa 5500 b0fa  ........*...U...
00000100: 5a00 b5fa 0380 0100 0200 0200 5a00 b5fa  Z...........Z...
00000110: 8c00 b0ff 0380 0000 0200 0200 8c00 b0ff  ................
00000120: cd00 b0ff 0380 0100 0100 0200 cd00 b0ff  ................
00000130: 8c00 ecff 0380 0000 0100 0200 8200 f6ff  ................
00000140: 7800 0000 0380 0000 0200 0200 7800 c4ff  x...........x...
00000150: 5a00 c4ff 0300 0000 0200 0400 0100 0600  Z...............
00000160: 0200 0000 0000 0000 0000 0000 0000 0000  ................
00000170: 0000 0000 0000 0100 0000 0000 0000 0200  ................
00000180: 0000 0000 0000 4c41 3a55 6e74 6974 6c65  ......LA:Untitle
00000190: 6420 2020 2020 2020 200d 2020 2020 2020  d        .      
000001a0: 2020 2020 2020 ff00 0626 2020 2020 2020        ...&      
000001b0: 2020 2020 2020 0233 3233 2020 2020 2020        .323      
000001c0: 2020 2020 2020 2020 2020 2020 2020 2020                  
000001d0: 2020 2020 2020 2020 2020 2020 2020 2020                  
000001e0: 2020 2020 2020 2020 2020 2020 2020 2020                  
000001f0: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000200: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000210: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000220: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000230: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000240: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000250: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000260: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000270: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000280: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000290: 2020 2020 2020 2020 2020 2020 2020 2020                  
000002a0: 2020 2020 2020 2020 2020 2020 2020 2020                  
000002b0: 2020 2020 2020 2020 2020 2020 2020 2020                  
000002c0: 2020 2020 2020 2020 2020 2020 2020 2020                  
000002d0: 2020 2020 2020 2020 2020 2020 2020 2020                  
000002e0: 2020 2020 2020 2020 2020 2020 2020 2020                  
000002f0: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000300: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000310: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000320: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000330: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000340: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000350: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000360: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000370: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000380: 2020 2020 2020 0000 4200 0031 fff0 cd00        ..B..1....
00000390: 6405 e001 b001 9064 9032 9f9c 9fce 0000  d......d.2......
000003a0: 2a0a 2b0a 0505 a019 a27e a019 a27d 0000  *.+......~...}..
000003b0: 8041 00fe b002 afbf a03c 0000 760a 760a  .A.......<..v.v.
000003c0: feb0 0100 4462 00ff 0000 0000 0000 f0ff  ....Db..........
000003d0: ffff ff0f 0800 c000 0010 0400 0000 0020  ............... 
000003e0: 0200 0000 0040 0200 0000 0040 0200 0000  .....@.....@....
000003f0: 0040 0200 0000 0040 0200 0000 0040 0200  .@.....@.....@..
00000400: 0000 0040 0200 0000 0040 0200 0000 0040  ...@.....@.....@
00000410: 0200 0000 0040 0200 0000 0040 0200 0000  .....@.....@....
00000420: 0040 0200 0000 0040 0200 0000 0040 0200  .@.....@.....@..
00000430: 0000 0040 0200 0000 0040 0200 0000 0040  ...@.....@.....@
00000440: 0200 0000 0040 0200 0000 0040 0200 0000  .....@.....@....
00000450: 0040 0200 0000 0040 0200 0000 0040 0200  .@.....@.....@..
00000460: 0000 0040 0200 0000 0040 0200 0000 0040  ...@.....@.....@
00000470: 0200 0000 0040 0200 0000 0040 0200 0000  .....@.....@....
00000480: 0040 0200 0000 0040 0200 0000 0040 0200  .@.....@.....@..
00000490: 0000 0040 0400 8005 0020 0800 0001 0010  ...@..... ......
000004a0: f0ff ffff ff0f 0000 0000 0000 0000 0000  ................
000004b0: 0000 f0ff ffff ff0f 0800 e000 0010 0400  ................
000004c0: 8000 0020 0200 0000 0040 0200 0000 0040  ... .....@.....@
000004d0: 0200 0000 0040 0200 0000 0040 0200 0000  .....@.....@....
000004e0: 0040 0200 0000 0040 0200 0000 0040 0200  .@.....@.....@..
000004f0: 0000 0040 0200 0000 0040 0200 0000 0040  ...@.....@.....@
00000500: 0200 0000 0040 0200 0000 0040 0200 0000  .....@.....@....
00000510: 0040 0200 0000 0040 0200 0000 0040 0200  .@.....@.....@..
00000520: 0000 0040 0200 0000 0040 0200 0000 0040  ...@.....@.....@
00000530: 0200 0000 0040 0200 0000 0040 0200 0000  .....@.....@....
00000540: 0040 0200 0000 0040 0200 0000 0040 0200  .@.....@.....@..
00000550: 0000 0040 0200 0000 0040 0200 0000 0040  ...@.....@.....@
00000560: 0200 0000 0040 0200 0000 0040 0200 0000  .....@.....@....
00000570: 0040 0200 0005 0040 0400 0000 0020 0800  .@.....@..... ..
00000580: 0000 0010 f0ff ffff ff0f 0000 0000 0000  ................
00000590: 0000 0000 0000 f0ff ffff ff0f 0800 0000  ................
000005a0: 0010 0400 0000 0020 0200 0000 0040 0200  ....... .....@..
000005b0: 0000 0040 0200 0000 0040 0200 0000 0040  ...@.....@.....@
000005c0: 0200 0000 0040 0200 0000 0040 0200 0000  .....@.....@....
000005d0: 0040 0200 0000 0040 0200 0000 0040 0200  .@.....@.....@..
000005e0: 0000 0040 0200 0000 0040 0200 0000 0040  ...@.....@.....@
000005f0: 0200 0000 0040 0200 0000 0040 0200 0000  .....@.....@....
00000600: 0040 0200 0000 0040 0200 0000 0040 0200  .@.....@.....@..
00000610: 0000 0040 0200 0000 0040 0200 0000 0040  ...@.....@.....@
00000620: 0200 0000 0040 0200 0000 0040 0200 0000  .....@.....@....
00000630: 0040 0200 0000 0040 0200 0000 0040 0200  .@.....@.....@..
00000640: 0000 0040 0200 0000 0040 0200 0000 0040  ...@.....@.....@
00000650: 0200 0000 0040 0200 0000 0040 0400 0000  .....@.....@....
00000660: 0020 0800 0001 0010 f0ff ffff ff0f 0000  . ..............
00000670: 0000 0000 0000 0000 0000 f0ff ffff ff0f  ................
00000680: 0800 0000 0010 0400 0000 0020 0200 0000  ........... ....
00000690: 0040 0200 0000 0040 0200 0000 0040 0200  .@.....@.....@..
000006a0: 0000 0040 0200 0000 0040 0200 0000 0040  ...@.....@.....@
000006b0: 0200 0000 0040 0200 0000 0040 0200 0000  .....@.....@....
000006c0: 0040 0200 0000 0040 0200 0000 0040 0200  .@.....@.....@..
000006d0: 0000 0040 0200 0000 0040 0200 0000 0040  ...@.....@.....@
000006e0: 0200 0000 0040 0200 0000 0040 0200 0000  .....@.....@....
000006f0: 0040 0200 0000 0040 0200 0000 0040 0200  .@.....@.....@..
00000700: 0000 0040 0200 0000 0040 0200 0000 0040  ...@.....@.....@
00000710: 0200 0000 0040 0200 0000 0040 0200 0000  .....@.....@....
00000720: 0040 0200 0000 0040 0200 0000 0040 0200  .@.....@.....@..
00000730: 0000 0040 0200 0000 0040 0200 0000 0040  ...@.....@.....@
00000740: 0400 8001 0020 0800 0000 0010 f0ff ffff  ..... ..........
00000750: ff0f 0000 0000 0000 0233 3233 2020 2020  .........323    
00000760: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000770: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000780: 2020 2020 2020 2020 2020 2020 2020 2020                  
00000790: 2020 2020 2020 2020 2020 2020 2020 2020                  
000007a0: 2020 2020 2020 2020 2020 2020 2020 2020                  
000007b0: 2020 2020 2020 2020 2020 2020 2020 2020                  
000007c0: 2020 2020 2020 2020 2020 2020 2020 2020                  
000007d0: 2020 2020 2020 2020 0000 0000 0000 0000          ........
000007e0: 0000 0000 0000 0000 0000 0000 0000 0000  ................
000007f0: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000800: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000810: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000820: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000830: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000840: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000850: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000860: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000870: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000880: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000890: 0000 0000 0000 0000 0000 0000 0000 0000  ................
000008a0: 0000 0000 0000 0000 0000 0000 0000 0000  ................
000008b0: 0000 0000 0000 0000 0000 0000 0000 0000  ................
000008c0: 0000 0000 0000 0000 0000 0000 0000 0000  ................
000008d0: 0000 0000 0000 0000 0000 0000 0000 0000  ................
000008e0: 0000 0000 0000 0000 0000 0000 0000 0000  ................
000008f0: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000900: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000910: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000920: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000930: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000940: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000950: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000960: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000970: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000980: 0000 0000 0000 0000 2e10 c81a 1a1a 2e10  ................
00000990: c800 00                                  ...
```
