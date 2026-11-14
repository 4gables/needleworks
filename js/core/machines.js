/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Embroidery machines and hoops. Add a machine here and the whole site picks it up: the machine choice, the hoop
// list, the fit check (the field less MARGIN), the file it gets (the first of `reads` this site writes) and its limits.
// Sizes are the sewable field in mm (w = left-right, h = front-back), as the maker states them.
//
// Every number comes from the maker's own pages or manuals, cited by the machine. A number the maker doesn't publish
// is left out, never guessed:
//   - `reads`: the embroidery files its manual lists, the maker's own first. The site writes PES, DST, EXP, JEF and VP3
//     (formats-out.js; a JEF names only the 51 Janome threads whose palette numbers are measured, spec section 7.1).
//   - `cuts`: what it does with a move between parts. A number: it trims jump stitches itself, all but those up to
//     that many mm (Brother's "Jump Stitch Trim" and its lowest "length of jump stitch not to trim"); the loose-thread
//     count (doctor.js shortJumps, MOVES.trimmed) is made for 5. "file": it cuts where the file says (trim codes) and
//     its maker gives no length. "length": it cuts moves longer than a length set on it, the
//     range not given in words. null: not published. A machine whose maker says it cuts no jumps at all is left out.
//   - `blocks`, `stitches`: the most colour blocks / stitches in one design, where the maker says. Every machine keeps
//     the checker's 99 blocks (recipes.js LIMITS.blocks, the PE900's), which no maker here publishes lower.
// Brother (read 2026-11):
//   PE900:  operation manual 888-K80/L80/L82 (frames 18 x 13, 18 x 10, 10 x 10 cm; pattern up to 180 x 130 mm and
//           200,000 stitches; Jump Stitch Trim p.38); brother-usa.com/p/sewing-embroidery/PE900.
//   SE2000: brother-usa.com/p/sewing-embroidery-combo/SE2000 (5" x 7" field, "Jump Stitch Trimming function"), its
//           operation manual 888-K10/L11/L12 (Jump Stitch Trim) and Brother's options list (frame set SA443, 10 x
//           10 cm).
//   NQ1700E: operation manual 888-G60/G70/G72 (download.brother.com/welcome/doch102340/888g60_g70_g72_om01en.pdf:
//           "embroidery patterns up to a maximum of 26 cm x 16 cm", p.48; "Using the Thread Trimming Function (Jump
//           Stitch Trim)" and "Selecting the Length of Jump Stitch Not to Trim", pp.39-41; .pes files from a USB
//           stick); brother-usa.com/products/nq1700e ('6" x 10" Maximum embroidery area').
//   More Brother (read 2026-11-13; download.brother.com/welcome/<doc>, PDF pages; the manuals name product codes, the
//   model from the support page that lists them):
//   NQ3550W: doch102337/888g26_g30_g32_g34_om02en.pdf: extra large 26 x 16, large 18 x 13, medium 10 x 10 cm (p.98);
//           .pes .phc .pen .dst (p.103); Jump Stitch Trim, its lengths only on the keys ("25 mm": not trimmed at 25 mm
//           or less), so `cuts` "length" (p.95).
//   Stellaire XE1 / XJ1: doch101722/882w80_w82_om02en.pdf and doch101717/882w70_om02en.pdf: 36 x 24, 30 x 20,
//           24 x 24, 20 x 20, 18 x 13, 15 x 15, 10 x 10 cm (XE1 pp.14-15); .pes .phc .phx .dst .pen (XE1 p.118);
//           "Select a setting from 5 mm to 50 mm in 5 mm increments" (XE1 p.78, XJ1 p.148).
//   Luminaire XP3: doch102491/xp3_omemb01usca_en.pdf: fields 408 x 272, 272 x 272, 240 x 240, 180 x 130, 100 x 100
//           (p.29); Jump Stitch Trim, its range only on the keys (p.103); doch102490/xp3_omsew02usca_en.pdf: .pes
//           .phc .phx .dst .pen (p.196).
//   Baby Lock (babylock.com/<model>/ pages, their instruction and reference guides and spec sheets):
//   Flare (flare-blmfl-instruction-and-reference-guide-1): 26 x 16, 18 x 13, 15 x 15, 10 x 10 cm (pp.13-14); .pes
//           .phc .dst (p.50); Jump Stitch Trim as the NQ3550W (p.43); "up to 200,000 stitches per design" (spec sheet).
//   Journey (journey-bljy-instruction-and-reference-guide): 300 x 180, 180 x 130, 150 x 150, 100 x 100 (pp.16-17);
//           .pes .phc .dst (p.232); 500,000 stitches or 125 color changes (p.233); 5 to 50 mm (p.221).
//   Pathfinder (pathfinder-blpf-instruction-and-reference-guide): 300 x 200, 200 x 200, 180 x 130, 150 x 150,
//           100 x 100 (pp.15-16); .pes .phc .dst, 500,000 stitches or 125 color changes (p.110); 5 to 50 mm (p.99).
//   Altair 2 (altair2-blta2-instruction-and-reference-guide-2): 36 x 24 ... 18 x 13, 15 x 15, 10 x 10 (pp.16-17);
//           .pes .phc .phx .dst (p.198); 5 to 50 mm (p.154).
//   Solaris 2 (solaris-2-blsa2-instruction-and-reference-guide-embroidery-2): 408 x 272 ... 180 x 130, 100 x 100
//           (p.31); .pes .pha .phb .phc .dst .phx (p.109); 750,000 stitches or 127 color changes (p.110); 5 to 50 mm
//           (p.104).
//   Frames over 160 x 260 mm are left out for now (W1c); the 2 x 6 cm frame too (no machine above lists the design
//   size it takes). The colour-change numbers are as blocks (125 changes = 126 blocks), above the checker's 99 kept
//   for all. Not published: the default "not to trim" length (every manual says only "initially on").
//   Not listed, no Jump Stitch Trim (only "END COLOR TRIM" or a thread cutter): PE800 and SE1900 (doch100741, doch100730:
//   200,000 stitches or 125 color changes), SE700, SE630, PE535, Baby Lock Aurora.
// Janome (read 2026-11-13; www.janome.com refuses automated reading, the PDFs under janome.com/wp-content/uploads/
// open; pages are the PDF's own, not the printed numbers):
//   Memory Craft 500E: 2015/08/500e-le-instruction-manual.pdf: hoops SQ14b 14 cm square, RE20b 14 by 20 cm, SQ20b
//           20 cm square, RE28b 20 by 28 cm (pp.7, 18); JEF, JEF+, JPX, DST from USB (p.58); jump thread cut from 3
//           mm, cutting command for trim codes (p.55).
//   Skyline S9: 2019/11/inst-book-sks9.pdf: SQ14a 14 cm square, RE20a 17 by 20 cm, FA10a 10 by 4 cm (pp.9, 114);
//           JEF, JEF+, JPX, DST (p.160); "Jump thread cutting length can be set from 3 mm to 30 mm or off" (p.156).
//   Continental M17: 2025/04/ML_E_868A_ver.2_Emb_CM17_EN_DG24868029_Webs.pdf: SQ10d 10 cm square, RE20d 14 by 20
//           cm, SQ28d 28 cm square, RE46d 28 by 46 cm, ASQ27d 27 cm square (p.39); JEF, JEF+, JPX, DST (p.116); jump
//           thread 3 mm or longer (p.106). RE46d (280 x 460) is left out: the gate judges every file as its PES, and
//           a PES stitch block holds 409.6 mm (writer-changes.md W1c).
//   MB-7: 2024/09/inst-book-mb-7.pdf: M1 240 x 200, M2 126 x 110, M3 50 x 50 mm (pp.12, 29); .jef, .jef+, .dst
//           (p.18); jump thread trimming on by default, at a run of jump codes, 3 by default, 1 to 8 (p.69).
//   Not published in these: stitches or colour changes per design (none found), which side of a hoop is across.
//   Not listed: MC12000 and MC9850 (their manuals list no file formats), MC550E (no Janome-hosted manual found).
// Bernina (read 2026-11-13; bernina.com refuses automated reading, read in a browser):
//   Manuals under bernina.com/bernina/media/Support/Sewing_Quilting_Embroidery/: B 700 (7_Serie/BERNINA_700/.../
//           0371485_10A_04_print_manual_B700_2018-11_EN.pdf: Large Oval 145 x 255, Medium 100 x 130, Small 72 x 50
//           p.21; EXP, PES, PEC, XXX, PCS, JEF, DST p.27; connecting stitches cut, 1 to 15 mm, default 6, p.52),
//           B 570 QE (5_Serie_NEW/BERNINA_570QE/.../1028835_20A_04_web_manual_B570QE_2022-09_EN.pdf: hoops p.116,
//           formats p.119, cutting p.54), B 535 (5_Serie_NEW/BERNINA_535/.../1028875_00B_04_print_2017_10_EN_online.pdf:
//           hoops pp.129-130, formats p.132, cutting p.60), B 790 PRO (7_Serie/BERNINA_790PRO/.../
//           1072895_00A_04_web_manual_B790PRO_2023-03_EN.pdf: hoops p.18, formats p.74, "On Jump Stitch" with a length
//           to set, its range not given, p.44).
//   Hoop pages bernina.com/en-US/Accessories-US/Embroidery-Accessories/Embroidery-Hoops-and-Adapters/<Name>-Embroidery-
//           Hoop: Midi 265 x 165, Mega 150 x 400, Maxi 210 x 400 (700 E, 735, 790... not the 5 Series), each with
//           the machines it fits.
//   bernette 79 / 70 DECO: My bernette Embroidery Mastery Workbook (bernina.com/bernina/media/BoA/Learn%20and%20
//           Create/ebooks/2021/My-bernette-Embroidery-Mastery-Workbook-b70-11242020.pdf): Large 160 x 260, Medium
//           120 x 180, Small 50 x 70 mm (p.8); VP3, VIP, PEC, HUS, DST, EXP, JEF, PES (p.9). Its cutting: not found.
//   Not published: stitches or colour changes per design (none in any manual), whether an EXP's or DST's trim codes
//   are obeyed (the manuals say only that connecting stitches over the length set are cut). Not listed: B 500 E and
//   B 590 (no manual found, the formats unconfirmed), the Jumbo hoop (its page gives 260 x 400 and 210 x 400).
//   Bernina says it "cannot guarantee" designs not made in its own software read right (B 700 manual p.27).
// Husqvarna Viking and Pfaff (read 2026-11-13: user's guides on SVP's file host, svpworldwide.widen.net/content/
// <id>/pdf/<file>, linked for every model from singer.com/pages/product-manuals-for-singer-pfaff-and-husqvarna-viking-
// sewing-machines; PDF pages):
//   Designer EPIC 3 (p38crai6az/User-Manual_DE3_EN.pdf): Regal 465 x 260, Royal II 360 x 200, Jewel II 240 x 150,
//           Splendid Square II 120 x 120 (p.17); .VP4, .VP3 ... .PES ... .JEF, .EXP ... .DST (p.151); "approximately
//           500,000 stitches" (p.117); automatic jump stitch trim, cut commands (pp.138, 141). Regal is left out: wider
//           than a PES stitch block holds (409.6 mm), and the gate judges every file as its PES.
//   Designer Ruby 90 (korjc6uc05/viking_designer_ruby_90.pdf): Imperial 360 x 260, Crown 260 x 200, Splendid Square
//           120 x 120 (p.20), Majestic 360 x 350 (p.132); .VP3 ... .DST (p.167); "approximately 500.000 stitches"
//           (p.128); "Automatic Jump Stitch Trim" (p.159).
//   creative 4.5 (dcwmsjtj4s/Creative4.5_EN_a.pdf): 120 Square, Master 240 x 150, Deluxe 360 x 200, Elite 260 x 200
//           (p.90); .SHV, .DHV, .VP3 ... .DST (p.135); "approximately 500.000 stitches" (p.120); "Cut jump stitches"
//           (p.45).
//   creative 3.0 (euly3ujcqp/creative_3_0-manual-EN_ikoz10.pdf): 120 Square, Elite 260 x 200 (p.10); the same files
//           (p.98); 500.000 stitches (p.86); "Cut jump stitches" (p.35).
//   Not published: colour blocks per design (only a "too many color blocks" message), the shortest jump cut.
//   Not listed: Designer Topaz 50 and creative icon 2 (their file lists didn't read cleanly, not yet confirmed);
//   Designer Jade 35 and creative ambition 640 (VP3 only, and no jump stitch trim: they stop for the thread to be cut
//   by hand, which nothing here counts yet).
// Singer (the same host): none listed. Legacy SE300 (63xbk0rung/SE300_EN.pdf: 100 x 100 and 260 x 150, .xxx and .dst,
//   pp.7, 48, 51) and SE9150-9185 (oqidxvnt8f/SE9150_EN.pdf: 170 x 100, VP3 only, pp.11, 31) name no jump stitch
//   trimming (the SE300 stops for a cut by hand); the EM200, Futura and SE340 manuals weren't on Singer's page. A
//   Singer owner picks Other machine (DST).
// A design bigger than 130 x 180 mm is written with the 160 x 260 mm page in its PES header (formats.js `pesPage`,
// docs/writer-changes.md W1). Checked in PE-DESIGN 11; not yet sewn on a 6" x 10" machine by anyone here. PES
// machines' frames bigger than 160 x 260 mm are left out until the page for them is measured (writer-changes.md W1c).
// Not listed, and why (docs/app-ui.md):
//   - 4" x 4" Brother machines (SE700, PE545, SE600, PE535...): Brother's pages name an automatic thread cutter but
//     no jump-stitch trimming, so every jump would be a thread to snip by hand, which nothing here counts yet.
// Brother's frames as their manuals give them ("18 cm x 13 cm"), the long side front to back
const F6x10 = { name: '6" × 10" hoop', w: 160, h: 260 }, F5x7 = { name: '5" × 7" hoop', w: 130, h: 180 };
const F6x6 = { name: '6" × 6" hoop', w: 150, h: 150 }, F4x4 = { name: '4" × 4" hoop', w: 100, h: 100 };
// Bernina's hoops for the 5 and 7 Series (each hoop's page lists the machines it fits; Maxi is 7 Series only)
const BERNINA_5 = {
  "large-oval": { name: "Large Oval hoop", w: 145, h: 255 },
  "medium": { name: "Medium hoop", w: 100, h: 130 },
  "small": { name: "Small hoop", w: 50, h: 72 },
  "midi": { name: "Midi hoop", w: 165, h: 265 },
  "mega": { name: "Mega hoop", w: 150, h: 400 },
};
export const MACHINES = {
  "brother-pe900": {
    brand: "Brother", model: "PE900", name: "Brother PE900", reads: ["pes"], cuts: 5, stitches: 200000,
    hoops: {
      "5x7": { name: '5" × 7" hoop', w: 130, h: 180 },
      "4x4": { name: '4" × 4" hoop', w: 100, h: 100 },
    },
    defaultHoop: "5x7",
  },
  "brother-se2000": {
    brand: "Brother", model: "SE2000", name: "Brother SE2000", reads: ["pes"], cuts: 5,
    hoops: {
      "5x7": { name: '5" × 7" hoop', w: 130, h: 180 },
      "4x4": { name: '4" × 4" hoop', w: 100, h: 100 },
    },
    defaultHoop: "5x7",
  },
  "brother-nq1700e": {
    brand: "Brother", model: "NQ1700E", name: "Brother NQ1700E", reads: ["pes"], cuts: 5,
    hoops: {
      "6x10": { name: '6" × 10" hoop', w: 160, h: 260 },
      "5x7": { name: '5" × 7" hoop', w: 130, h: 180 },
      "4x4": { name: '4" × 4" hoop', w: 100, h: 100 },
    },
    defaultHoop: "6x10",
  },
  "brother-nq3550w": {
    brand: "Brother", model: "Innov-is NQ3550W", also: "NQ3550W", name: "Brother NQ3550W", reads: ["pes", "phc", "pen", "dst"], cuts: "length",
    hoops: { "6x10": F6x10, "5x7": F5x7, "4x4": F4x4 }, defaultHoop: "6x10",
  },
  "brother-xe1": {
    brand: "Brother", model: "Stellaire XE1 / XJ1", also: "XE1 XJ1 Innov-is", name: "Brother Stellaire", reads: ["pes", "phc", "phx", "dst", "pen"], cuts: 5,
    hoops: { "5x7": F5x7, "6x6": F6x6, "4x4": F4x4 }, defaultHoop: "5x7",
  },
  "brother-xp3": {
    brand: "Brother", model: "Luminaire XP3", also: "XP3 Innov-is", name: "Brother Luminaire XP3", reads: ["pes", "phc", "phx", "dst", "pen"], cuts: "length",
    hoops: { "5x7": F5x7, "4x4": F4x4 }, defaultHoop: "5x7",
  },
  // Baby Lock: made by Brother, the same PES files and Jump Stitch Trim
  "babylock-flare": {
    brand: "Baby Lock", model: "Flare", also: "BLMFL", name: "Baby Lock Flare", reads: ["pes", "phc", "dst"], cuts: "length", stitches: 200000,
    hoops: { "6x10": F6x10, "5x7": F5x7, "6x6": F6x6, "4x4": F4x4 }, defaultHoop: "6x10",
  },
  "babylock-journey": {
    brand: "Baby Lock", model: "Journey", also: "BLJY", name: "Baby Lock Journey", reads: ["pes", "phc", "dst"], cuts: 5, stitches: 500000, blocks: 126,
    hoops: { "5x7": F5x7, "6x6": F6x6, "4x4": F4x4 }, defaultHoop: "5x7",
  },
  "babylock-pathfinder": {
    brand: "Baby Lock", model: "Pathfinder", also: "BLPF", name: "Baby Lock Pathfinder", reads: ["pes", "phc", "dst"], cuts: 5, stitches: 500000, blocks: 126,
    hoops: { "5x7": F5x7, "6x6": F6x6, "4x4": F4x4 }, defaultHoop: "5x7",
  },
  "babylock-altair2": {
    brand: "Baby Lock", model: "Altair 2", also: "BLTA2", name: "Baby Lock Altair 2", reads: ["pes", "phc", "phx", "dst"], cuts: 5,
    hoops: { "5x7": F5x7, "6x6": F6x6, "4x4": F4x4 }, defaultHoop: "5x7",
  },
  "babylock-solaris2": {
    brand: "Baby Lock", model: "Solaris 2", also: "BLSA2", name: "Baby Lock Solaris 2", reads: ["pes", "pha", "phb", "phc", "dst", "phx"], cuts: 5, stitches: 750000, blocks: 128,
    hoops: { "5x7": F5x7, "4x4": F4x4 }, defaultHoop: "5x7",
  },
  // Janome: JEF is theirs (what they get here), DST is read too. Jump thread cutting:
  // "trim the threads if the jump thread is 3 mm or longer" (3 to 30 mm or off), and a trim code in a file is cut
  // when "Cutting command" is on. Janome's manuals say "14 cm by 20 cm", not which way is left-right: taken as written
  // (across, then front to back), as Brother's 5" x 7" reads; the hoop can be turned either way.
  "janome-mc500e": {
    brand: "Janome", model: "Memory Craft 500E", also: "MC500E", name: "Janome Memory Craft 500E", reads: ["jef", "dst"], cuts: 3,
    hoops: {
      "re20b": { name: "RE20b hoop", w: 140, h: 200 },
      "sq14b": { name: "SQ14b hoop", w: 140, h: 140 },
      "sq20b": { name: "SQ20b hoop", w: 200, h: 200 },
      "re28b": { name: "RE28b hoop", w: 200, h: 280 },
    },
    defaultHoop: "re20b",
  },
  "janome-s9": {
    brand: "Janome", model: "Skyline S9", also: "S9", name: "Janome Skyline S9", reads: ["jef", "dst"], cuts: 3,
    hoops: {
      "re20a": { name: "RE20a hoop", w: 170, h: 200 },
      "sq14a": { name: "SQ14a hoop", w: 140, h: 140 },
      "fa10a": { name: "FA10a free-arm hoop", w: 100, h: 40 },
    },
    defaultHoop: "re20a",
  },
  "janome-m17": {
    brand: "Janome", model: "Continental M17", also: "CM17", name: "Janome Continental M17", reads: ["jef", "dst"], cuts: 3,
    hoops: {
      "re20d": { name: "RE20d hoop", w: 140, h: 200 },
      "sq10d": { name: "SQ10d hoop", w: 100, h: 100 },
      "sq28d": { name: "SQ28d hoop", w: 280, h: 280 },
      "asq27d": { name: "ASQ27d quilting hoop", w: 270, h: 270 },
    },
    defaultHoop: "re20d",
  },
  // (a multi-needle machine: it trims at a run of jump codes, 3 by default, which is how a DST says "cut here")
  "janome-mb7": {
    brand: "Janome", model: "MB-7", also: "MB7 multi-needle", name: "Janome MB-7", reads: ["jef", "dst"], cuts: "file",
    hoops: {
      "m1": { name: "M1 hoop", w: 240, h: 200 },
      "m2": { name: "M2 hoop", w: 126, h: 110 },
      "m3": { name: "M3 hoop", w: 50, h: 50 },
    },
    defaultHoop: "m1",
  },
  // Bernina: EXP is theirs; the 5 and 7 Series read PES, DST and others too. "All connecting stitches longer than 6 mm
  // are cut automatically", the length set from 1 to 15 mm. Bernina writes the long side first (145 x 255) and doesn't
  // say which is across: the short side is taken across, as on Brother's frames; the hoop can be turned.
  "bernina-700": {
    brand: "Bernina", model: "B 700 / 700 E", also: "700E", name: "Bernina B 700", reads: ["exp", "pes", "pec", "xxx", "pcs", "jef", "dst"], cuts: 1,
    hoops: { ...BERNINA_5, "maxi": { name: "Maxi hoop", w: 210, h: 400 } },
    defaultHoop: "large-oval",
  },
  "bernina-790": {
    brand: "Bernina", model: "B 790 PRO", also: "790PRO 790", name: "Bernina B 790 PRO", reads: ["exp", "bqm", "sew", "pes", "pec", "xxx", "pcs", "jef", "dst"], cuts: "length",
    hoops: { ...BERNINA_5, "maxi": { name: "Maxi hoop", w: 210, h: 400 } },
    defaultHoop: "large-oval",
  },
  "bernina-570": {
    brand: "Bernina", model: "B 570 QE", also: "570QE 570", name: "Bernina B 570 QE", reads: ["exp", "pes", "pec", "xxx", "pcs", "jef", "dst"], cuts: 1,
    hoops: BERNINA_5, defaultHoop: "large-oval",
  },
  "bernina-535": {
    brand: "Bernina", model: "B 535", also: "535", name: "Bernina B 535", reads: ["exp", "pes", "pec", "xxx", "pcs", "jef", "dst"], cuts: 1,
    hoops: BERNINA_5, defaultHoop: "large-oval",
  },
  // (Bernina's own lower brand: VP3 first in its list)
  "bernette-79": {
    brand: "Bernina", model: "bernette 79 / 70 DECO", also: "b79 b70 deco", name: "bernette 79", reads: ["vp3", "vip", "pec", "hus", "dst", "exp", "jef", "pes"], cuts: null,
    hoops: {
      "large": { name: "Large hoop", w: 160, h: 260 },
      "medium": { name: "Medium hoop", w: 120, h: 180 },
      "small": { name: "Small hoop", w: 50, h: 70 },
    },
    defaultHoop: "large",
  },
  // Husqvarna Viking and Pfaff (SVP): VP3 is theirs, DST and PES are read too. "Automatic Jump Stitch Trim": the upper
  // thread "is cut automatically at the start of a jump stitch", and at "cut commands in designs"; no length given.
  // Sizes as written (360 x 200), the short side taken across.
  "husqvarna-epic3": {
    brand: "Husqvarna Viking", model: "Designer EPIC 3", also: "epic3 de3", name: "Husqvarna Viking Designer EPIC 3", reads: ["vp4", ...["vp3", "shv", "dhv", "vip", "hus", "pec", "pes", "pcs", "xxx", "sew", "jef", "exp", "10*", "dst"]], cuts: "file", stitches: 500000,
    hoops: {
      "royal": { name: "Royal II hoop", w: 200, h: 360 },
      "jewel": { name: "Jewel II hoop", w: 150, h: 240 },
      "square": { name: "Splendid Square II hoop", w: 120, h: 120 },
    },
    defaultHoop: "jewel",
  },
  "husqvarna-ruby90": {
    brand: "Husqvarna Viking", model: "Designer Ruby 90", also: "ruby90", name: "Husqvarna Viking Designer Ruby 90", reads: ["vp3", "shv", "dhv", "vip", "hus", "pec", "pes", "pcs", "xxx", "sew", "jef", "exp", "10*", "dst"], cuts: "file", stitches: 500000,
    hoops: {
      "crown": { name: "Crown hoop", w: 200, h: 260 },
      "imperial": { name: "Imperial hoop", w: 260, h: 360 },
      "majestic": { name: "Majestic hoop", w: 350, h: 360 },
      "square": { name: "Splendid Square hoop", w: 120, h: 120 },
    },
    defaultHoop: "crown",
  },
  "pfaff-creative45": {
    brand: "Pfaff", model: "creative 4.5", also: "creative45", name: "Pfaff creative 4.5", reads: ["vp3", "shv", "dhv", "vip", "hus", "pec", "pes", "pcs", "xxx", "sew", "jef", "exp", "10*", "dst"], cuts: "file", stitches: 500000,
    hoops: {
      "master": { name: "creative Master hoop", w: 150, h: 240 },
      "square": { name: "creative 120 Square hoop", w: 120, h: 120 },
      "elite": { name: "creative Elite hoop", w: 200, h: 260 },
      "deluxe": { name: "creative Deluxe hoop", w: 200, h: 360 },
    },
    defaultHoop: "master",
  },
  "pfaff-creative30": {
    brand: "Pfaff", model: "creative 3.0", also: "creative30", name: "Pfaff creative 3.0", reads: ["vp3", "shv", "dhv", "vip", "hus", "pec", "pes", "pcs", "xxx", "sew", "jef", "exp", "10*", "dst"], cuts: "file", stitches: 500000,
    hoops: {
      "elite": { name: "creative Elite hoop", w: 200, h: 260 },
      "square": { name: "creative 120 Square hoop", w: 120, h: 120 },
    },
    defaultHoop: "elite",
  },
  // Any other machine: a DST file (the one nearly every machine reads) for the field picked, its sizes the common
  // hoops' fields. Nothing about its cutting or limits is known.
  "other-dst": {
    brand: "Other", model: "Other machine (DST)", name: "DST machine", reads: ["dst"], cuts: null,
    hoops: {
      "4x4": { name: "100 × 100 mm field", w: 100, h: 100 },
      "5x7": { name: "130 × 180 mm field", w: 130, h: 180 },
      "6x10": { name: "160 × 260 mm field", w: 160, h: 260 },
      "8x8": { name: "200 × 200 mm field", w: 200, h: 200 },
      "8x12": { name: "200 × 300 mm field", w: 200, h: 300 },
    },
    defaultHoop: "5x7",
  },
};
export const DEFAULT_MACHINE = "brother-pe900";
export const MARGIN = 2;
// the makers in the order the machine choice lists them
export const MAKERS = [...new Set(Object.values(MACHINES).map((m) => m.brand))];

export function hoop(machine = DEFAULT_MACHINE, hoopId) {
  const m = MACHINES[machine], id = hoopId || m.defaultHoop;
  return { ...m.hoops[id], id, machine, machineName: m.name, brand: m.brand, reads: m.reads, cuts: m.cuts, blocks: m.blocks, stitches: m.stitches };
}
// a hoop as its choice says it: its own name, with the field's size where the name doesn't give it
// (short, "RE20b (140 × 200 mm)": the header holds machine, hoop and thread brand on one line at 1413 px)
export const hoopLabel = (h) => (/["”]|mm/.test(h.name) ? h.name : `${h.name.replace(/ hoop$/, "")} (${h.w} × ${h.h} mm)`);
