# Threads and brands (`brands.js`, `brandcharts.js`)

Reference for this part of Needleworks: the rules, the reason for each (it stops someone undoing it) and the number that proved it. Hard rules are in `AGENTS.md`. Add a lesson where its topic is, never as a round log.

- Brother (Artspira numbers), Isacord (numbers only), Sulky Rayon, Robison-Anton Rayon, Hemingworth, each from the
  maker's own source (file header). No Sigma or Madeira.
- Naming decision: spools are bought and stored by brand + number, and names vary even between resellers. So a thread
  shows swatch, the machine's name (its screen at the colour change) and "≈ Brand number"; a maker's name only where
  published; no translation or toggle. Labels only: files carry PEC colours.
- Spool matching is CIELAB (red-mean called black "Ivy"). Threads I own: searchable swatches (`chartSpools`); the
  Design tab's "Yours:" row (`api.ownedSpools`) gives a piece the spool's colour, the file the nearest PEC; `far` flags
  a poor match; Have ready splits "Your threads" / "To buy" (`ownSpool`).
- Every surface names a colour by the file's palette: the Design tab's `machineName(hex, was)` (`hoopings` from
  `threadNames`) for the editor hint (`threadOf`), swatch tooltips (`swatchTip`, the name after the pick) and Have ready;
  never `nearestBrotherThread` for a label. `spool(hex, machine)`: a Brother number is `brotherNum(machine)`.
  `threadList`: one entry per spool ("for Brother A and Brother B; a rough match for A"); a brand with no spools gives
  its "≈" numbers. `nearestSpool` `far` also for two tints (chroma 5+) over 60° of hue apart past ΔE 10 (Flesh Pink vs
  white 0015 was 14.7).
- One label function `threadLabel(hex, machine)` (app.js) -> { name, note, short }, wrapped by `threadLine`/`threadHtml`
  for every surface; an owned close spool leads ("Your Sulky Rayon 1076 Royal Blue" · "the machine calls it Wisteria
  Violet"). Chips: one per thread in first-use order, "used N times", long notes in the tooltip.
- Spools from uncharted brands (Madeira) are the user's own (`nw:myspools` {brand, num, hex}, `state.mine`, matched
  with `nearestSpool(..., extra)`), labelled "Madeira 1147" / "Madeira (pink)". One chip per machine thread. "that's
  fine" when the machine's colour differs (`apart`); guide-line colours "any thread will do". `FABRICS.item` advice only
  when no starter tip says what it's sewn on.
- Facts about a design (size, machine size, turned, stitches, stops, time, hoop, loose threads, thread count) come from
  `v.fact`, set once in `setView`; never recomputed on a surface. Time = `sewTime(blockLoads(file), stops)`: Sew along
  steps are whole-minute shares adding up to it. Hoops are named only as machines.js names them.
- Unlisted brands (Madeira): Threads I own matches by colour (`nearestSpools`, 8 nearest). Picture threads can be
  swapped (`state.pic.swap`, applied in worker.js after `toPalette`); violet -> Brother Magenta (#913697) is right.
