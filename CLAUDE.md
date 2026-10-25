# needleworks

Embroidery-file tools for home machines. Two implementations of the same engine:

- **Website (primary)**: static, no build step, served by GitHub Pages from the repo root
  (https://4gables.com/needleworks/). ES modules in `js/`. Heavy picture digitizing runs in `js/worker.js`.
- **Python (reference + CLI)**: `needleworks/` + `make_bookmark.py`, venv in `.venv` from `requirements.txt`.
  For serving a non-technical user via Claude Code, see `.claude/skills/embroidery/SKILL.md`.

## Engine notes (both implementations)
- Units: mm while designing; stitch data is pyembroidery's 0.1 mm, y down. Commands: STITCH 0, JUMP 1, TRIM 2, END 4, COLOR_CHANGE 5.
- Lettering: render the word, add swashes tangent to the first letter's entry / last letter's exit stroke, bridge letters
  the font leaves unjoined (e.g. Sacramento A→s), skeletonize, build a stroke graph, prune spurs, then walk it so each
  stroke is a centre-run out and a satin back (no jumps within a connected word).
- Swashes (lead-in/tail, optional via the "Long swashes" toggle / `--no-swash`): one calligraphic stroke leaving the
  letter's own stroke end along its tangent, dipping into a shallow cup under the baseline and flicking up at the far
  end. Letters with no low entry end (E, O) are joined tangentially at their lowest left point. Never let it run flat
  along the baseline; that reads as a ruled line.
- `satin()`: stations spaced by the outer edge so curves don't gap; short stitches on a crowded inner edge.
- Bookmark: 5 colour blocks of one thread = 4 machine pauses for the in-the-hoop fabric steps. Name is centred on the
  letters' band (swashes excluded) and lengthwise with equal room below the eyelet and above the border.
- Machines/hoops: `js/core/machines.js` and `needleworks/machines.py` (keep in sync). Designs are checked to fit
  the hoop field minus a 2 mm margin. Brother PE900 5x7 = 130 x 180 mm, auto-trims jumps.

## Gotchas
- PES is written as truncated v6 ("6t": v6 header with thread chart + PEC block), same as pyembroidery
  `write_pes(..., {"version": "6t"})`. Coordinates are rounded half-to-even like Python's `round()`;
  `tests/formats.test.mjs` asserts byte-identical output vs `tests/fixtures/ashley_v3.pes`. Regenerate fixtures
  at full float precision (rounded fixtures caused a false mismatch once).
- Thread names come from the 64-colour Brother PEC palette with pyembroidery's red-mean distance; that's what
  the machine itself maps to, so a dusty pink can legitimately show as "Gray".
- The fonts after Meow Script are free (OFL/Apache) lookalikes of popular embroiderydesigns.com samples; the
  sample is named in the font's `note`. The store's own PES letters aren't used (paid, 1–2 letters per sample).
  `scripts/match_fonts.py "<word>" <dir> out.png [--stitched]` renders candidates for picking more; reject fonts
  whose stitched skeleton leaves letters unjoined or spurs (Petit Formal, Comforter, Damion did).
- Script fonts render via CSS `@font-face` families named `NW <Font>` (local TTFs in `fonts/`, OFL); the
  lettering engine needs `document.fonts.load()` before drawing.
- Canvas text and PIL rasterize slightly differently, so JS and Python bookmarks differ by a few stitches; formats are exact.
- `tests/external/` (gitignored) holds third-party PES/DST samples and Etsy images used for manual testing, with
  pyembroidery read oracles in `tests/external/oracle/`.
- Every download goes through `validatePES()` (js/core/formats.js): re-reads the bytes and requires the same needle
  movements as the source design (PEC's zero-length anchor stitches after jumps are ignored), an END marker, enough
  threads, colour-change toggle bytes alternating 2,1,2… (what Brother writes; real files follow it), and hoop fit.
  Opened PES files are offered as their original bytes after the same structural checks. Tests: re-encode of all
  samples, 300 fuzz designs, and 50 byte-flip corruptions must all behave.
- Hosting: 4gables.com is the `4gables/website` repo's custom domain (a *project* site). Other repos only appear under
  4gables.com/<repo>/ if the org site repo is named `4gables.github.io` and carries the custom domain.
