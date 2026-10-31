# Needleworks

Make machine-embroidery files in the browser. **Live: https://4gables.com/needleworks/**

- **Name bookmark** (first card in Design your own; https://4gables.com/needleworks/#bookmark) — type a name, pick a script font and thread, download an in-the-hoop applique
  bookmark (satin border, ribbon hole, flowing script with lead-in and tail swashes).
- **Picture to stitches** — drop in a logo, clip art or drawing. It's reduced to a few thread colours
  and each shape is stitched by its width: running stitch for hairlines, satin for strokes, tatami fill
  (with underlay) for areas. Every colour is matched to the nearest Brother thread.
- **Open a design** — view any PES (v1–v10), PEC or DST file stitch by stitch, check it fits your hoop,
  watch it sew, and convert DST to PES.

Everything runs locally in the browser: no uploads, no build step, no server.

## Machines

Currently built for the **Brother PE900** with the **5" × 7" (130 × 180 mm)** hoop. Machines and hoops
live in `js/core/machines.js`; adding one there adds it to the site's picker, the hoop-fit checks and the
preview.

## Accuracy

The PES writer and readers are our own (written from `docs/formats-spec.md`) and checked against
[pyembroidery](https://github.com/EmbroidePy/pyembroidery), installed from pip as a test oracle:

```
node tests/formats.test.mjs
```

- the JS writer produces a **byte-identical** PES to pyembroidery for the same stitches
- `tests/pe900_check.py` independently re-checks PES files for the PE900 (needs `pip install -r requirements.txt`)
- the JS reader decodes sample files (PES v1, v6, v10, DST) exactly as pyembroidery does

## Layout

| Path | What |
|---|---|
| `index.html`, `css/`, `js/app.js` | the website |
| `js/core/` | stitch engine: formats, geometry, thinning, lettering, bookmark, picture digitizer |
| `js/render.js` | draws stitches like real thread from the stitch data |
| `tests/` | format tests and fixtures (`tests/external/` holds third-party samples, not committed) |

Run locally: `python3 -m http.server` in the repo, then open http://localhost:8000.

Bundled fonts and their licences: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Licence

Copyright (c) 2026 4Gables. All rights reserved. This is **not open source**: the code is public to read,
not to copy, rehost or republish. See [LICENSE](LICENSE); the bundled fonts' licences are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
