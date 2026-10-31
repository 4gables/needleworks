// Stitch-flow lint (tests/flow_lint.mjs, category audit class 8: wasted motion inside one object) on the shapes that
// wasted motion before, built the old way and the way they're built now, through the real writer and reader. Fails
// only if the lint stops seeing a past instance or a shared helper (geom.js loop/back/enter/rings) brings one back;
// then reports the lint over the golden files and the Brother-made samples (reference, not judged).
// Run: node tests/flow_lint.test.mjs   (~2 s)
import { existsSync } from "fs";
import { Design } from "../js/core/design.js";
import { JUMP, STITCH, readEmbroidery, writePES } from "../js/core/formats.js";
import { back, edgeWalk, enter, loop, rings, run, satin, zigzag } from "../js/core/geom.js";
import { hoop } from "../js/core/machines.js";
import { flow } from "./flow_lint.mjs";

const lint = (paths) => {
  const d = new Design(hoop(undefined, "5x7"));
  d.color("#000000");
  let at = null;
  for (const q of paths) { const r = typeof q === "function" ? q(at) : q; d.path(r); at = r[r.length - 1]; }
  d.finish();
  return flow(readEmbroidery(writePES(d.pattern()))).total;
};
const square = [[-30, -30], [30, -30], [30, 30], [-30, 30]];
const circle = Array.from({ length: 120 }, (_, i) => [40 * Math.cos((i * Math.PI) / 60), 40 * Math.sin((i * Math.PI) / 60)]);
let bad = 0;
const expect = (name, t, key, want) => {
  const ok = want === 0 ? t[key] === 0 : t[key] >= want;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${key} ${t[key]} (want ${want === 0 ? 0 : `>= ${want}`})`);
};

// R8: bold square frame, laps reversed from their last point (two trims, 55-61 mm jumps) -> back(e) from the same start
expect("bold square, plain reverse (R8)", lint([run(square, 2, true), run(square.slice().reverse(), 2, true), run(square, 2, true)].map(loop)), "loop", 1);
expect("bold square, back()", lint([run(square, 2, true), run(back(square), 2, true), run(square, 2, true)].map(loop)), "avoid", 0);
// R8: satin frame whose edge walk was closed (stepped 2.2 mm back across the border: trim + jump) -> open edge walk
expect("satin frame, closed edge walk (R8)", lint([loop(edgeWalk(circle, 3, true)), loop(zigzag(circle, 2.1, 2, true)), loop(satin(circle, 3, 0.4, 0.3, true))]), "hidden", 1);
expect("satin frame, as built", lint([edgeWalk(circle, 3, true), loop(zigzag(circle, 2.1, 2, true)), loop(satin(circle, 3, 0.4, 0.3, true))]), "avoid", 0);
// bookmark border before 2026-10-31: zigzag and satin not closed, the satin a column away
// (a ring whose zigzag ends on the far edge from where the satin starts: it depends on the station count)
const odd = Array.from({ length: 106 }, (_, i) => [40 * Math.cos((i * Math.PI) / 53), 40 * Math.sin((i * Math.PI) / 53)]);
expect("border, zigzag/satin not looped (bookmark)", lint([edgeWalk(odd, 3.6, true), zigzag(odd, 2.5, 2, true), satin(odd, 3.6, 0.4, 0.3, true)]), "hidden", 1);
expect("border, looped", lint([edgeWalk(odd, 3.6, true), loop(zigzag(odd, 2.5, 2, true)), loop(satin(odd, 3.6, 0.4, 0.3, true))]), "avoid", 0);
// a ring entered at its own start, beside where the needle is (a filled motif's edge after its fill) -> enter()
const lead = [[0, 0], [38, 0], [38.5, 0.5]];
expect("ring entered at its start", lint([lead, run(circle.map(([x, y]) => [-x, y]), 2, true).concat([[-40, 0]])]), "loop", 1);
expect("ring entered by enter()", lint([lead, (at) => enter(loop(run(circle, 2, true)), at)]), "avoid", 0);
// two outlines, the second started at its first point though it passes where the first ended -> rings()
const inner = circle.map(([x, y]) => [x * 0.97, y * 0.97]).slice(60).concat(circle.map(([x, y]) => [x * 0.97, y * 0.97]).slice(0, 60));
expect("rings in list order", lint([loop(run(circle, 2, true)), loop(run(inner, 2, true))]), "loop", 1);
expect("rings()", lint(rings([circle, inner], (l) => [loop(run(l, 2, true))])), "avoid", 0);
// a 0 mm tie-in (2026-10-29: strokes starting with repeated points made 143 across the batch)
{
  const st = [[0, 0, JUMP], [0, 0, STITCH], [0, 0, STITCH], [0, 0, STITCH], [0, 0, STITCH], [20, 0, STITCH], [40, 0, STITCH], [40, 0, JUMP], [300, 0, JUMP], [300, 0, STITCH], [300, 0, STITCH], [300, 0, STITCH], [320, 0, STITCH]];
  expect("0 mm tie-in", flow({ stitches: st }).total, "zeroTie", 1);
}

// reference: what the lint finds in our golden files and in professionally made files (not judged)
const { readFileSync, readdirSync } = await import("fs");
for (const dir of ["tests/fixtures/golden", "tests/external/pes"].filter(existsSync)) {
  const sum = {};
  for (const f of readdirSync(dir).filter((x) => /\.(pes|dst)$/i.test(x))) {
    const t = flow(readEmbroidery(new Uint8Array(readFileSync(`${dir}/${f}`)), f)).total;
    for (const [k, v] of Object.entries(t)) sum[k] = (sum[k] || 0) + v;
  }
  console.log(`${dir}: ${Object.entries(sum).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}
if (bad) { console.error(`${bad} failed`); process.exit(1); }
console.log("all passed");
