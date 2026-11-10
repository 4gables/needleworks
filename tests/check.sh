#!/bin/zsh
# The checks that matter, picked by what changed. usage: zsh tests/check.sh [BASE_REF=origin/main] [BASELINE_DIR]
# Always: CI tests (golden bytes, doctor fixes, damaged files, gate, typed text, offline list) and the three browser
# checks that have caught real bugs: ui_sweep --quick (layout, keyboard, focus), monkey (Design-tab invariants), files_flow
# (every exit). Stitch code changed: both batches, pe900_check and the byte compare with BASELINE_DIR (then the VM).
# Area checks only when their area changed. The rest (surfaces, matrix, perf, text_fuzz, engine_fuzz) are on demand.
# Needs the venv; starts its own server (8796) and Chrome (9396, 9397); every check has a time limit.
set -u
cd "${0:A:h}/.."
REF=${1:-origin/main}; BASE=${2:-}; HP=8796; CDP=9396; U=http://127.0.0.1:$HP
PY=/Volumes/4TB_SSD/needleworks/.venv/bin/python; OUT=${TMPDIR:-/tmp}/nw-check; mkdir -p $OUT/batch
to() { perl -e 'alarm shift; exec @ARGV' "$@"; }   # (no `timeout` on macOS; a hung check ended a run at 0 % CPU)
fail=0; say() { print -- "$@"; }; run() { local name=$1 secs=$2; shift 2; say "== $name"; to $secs "$@" 2>&1 | grep -E "FAIL|PROBLEM|problem|DONE|passed|failed|bad|ok:" | tail -6; (( ${pipestatus[1]} )) && fail=1; }
changed=$(git diff --name-only $REF -- . ; git diff --name-only)
has() { print -- "$changed" | grep -qE "$1"; }

say "changed since $REF: $(print -- "$changed" | sort -u | grep -c .) files"
for t in formats doctor open_fuzz gate text sw flow_lint; do run "$t.test" 600 node tests/$t.test.mjs; done
run sewn_lint 60 node tests/sewn_lint.mjs

$PY tests/batch_server.py $OUT/batch $HP >/dev/null 2>&1 & SRV=$!
node tests/cdp.mjs $CDP start $OUT/chrome >/dev/null 2>&1; node tests/cdp.mjs $CDP nocache >/dev/null
trap 'node tests/cdp.mjs $CDP stop >/dev/null 2>&1; node tests/cdp.mjs $((CDP+1)) stop >/dev/null 2>&1; kill $SRV 2>/dev/null' EXIT

# stitches: anything that builds, writes or reads them
if has '^js/(core/|studio/(pieces|outline|quilt|motifs)|doctor|worker|quilt-worker)'; then
  say "== batches (stitch code changed)"
  rm -f $OUT/batch/*.pes(N)
  for pg in pe900_batch studio_batch; do
    node tests/cdp.mjs $CDP goto "$U/tests/browser/$pg.html?v=$RANDOM" >/dev/null; t=""
    for i in $(seq 1 240); do t=$(node tests/cdp.mjs $CDP eval document.title); [[ $t == *DONE* ]] && break; sleep 5; done
    say "$pg $t"; [[ $t == *"DONE"*" 0\""* ]] || fail=1
  done
  $PY -I tests/pe900_check.py $OUT/batch/*.pes > $OUT/check.txt 2>&1 || fail=1
  say "pe900_check ok $(grep -c '^ok' $OUT/check.txt) of $(ls $OUT/batch/*.pes | wc -l)"; grep '^FAIL' $OUT/check.txt | head -5
  # the scoreboard (docs/roadmap.md): each kind of design's trims, loose threads, wasted moves, exposed locks, tiny
  # stitches and files at the density limit, with the change from the last release's (tests/fixtures/quality.json;
  # save a new one with --save= when a release moves it)
  say "== scoreboard (change from tests/fixtures/quality.json in brackets)"; to 300 node tests/flow_lint.mjs --score --against=tests/fixtures/quality.json $OUT/batch
  [[ -n $BASE ]] && say "compare: changed files vs $BASE" && for f in $BASE/*.pes; do cmp -s $f $OUT/batch/${f:t} || say "  changed ${f:t}"; done | tail -40
  # (picture_corpus.sh starts and stops its own browser on the port it's given: not ours)
  has '^js/core/digitize' && run picture_corpus 600 zsh tests/picture_corpus.sh $((CDP+3)) $HP $OUT/pc
  has '^js/core/(text|raster|fonts)|^js/studio/pieces' && { node tests/cdp.mjs $CDP goto "$U/tests/browser/lettering_look.html?v=$RANDOM" >/dev/null; for i in $(seq 1 120); do t=$(node tests/cdp.mjs $CDP eval document.title); [[ $t == *DONE* ]] && break; sleep 5; done; say "== lettering_look $t"; [[ $t == *" 0\""* ]] || fail=1; }
fi

run files_flow 600 node tests/files_flow.mjs $CDP $U
has 'sheet\.js|words\.js|studio/' && run steps_lint 600 node tests/steps_lint.mjs $CDP $U
has 'app\.js|studio/ui' && run entry_state 900 node tests/entry_state.mjs $CDP $U
has 'words\.js|quality\.js|app\.js' && run said_flow 300 node tests/said_flow.mjs $CDP $U
node tests/cdp.mjs $CDP stop >/dev/null 2>&1
run ui_sweep 1200 node tests/ui_sweep.mjs --quick --port $((CDP+2)) --url $U/ --out $OUT/sweep
node tests/cdp.mjs $((CDP+1)) start $OUT/chrome2 >/dev/null 2>&1
run monkey 2400 node tests/monkey.mjs $((CDP+1)) $HP --seeds 1-3 --steps 80 --start default,fifteen,random,kitchen

say; (( fail )) && say "CHECK FAILED" || say "CHECK PASSED"
exit $fail
