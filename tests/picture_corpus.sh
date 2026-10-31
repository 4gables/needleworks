#!/bin/zsh
# Picture corpus check (class: pictures unlike the 8 Etsy samples break the Picture tab). Draws a seeded corpus of our
# own pictures in tests/browser/picture_corpus.html, sends each through the Picture tab's own path and worker in all
# three styles, asserts what's sewn against what was drawn (see the page's header), then runs tests/pe900_check.py on
# every file it wrote. Takes ~2 minutes.
# usage: tests/picture_corpus.sh CDP_PORT HTTP_PORT OUT [query]   (query e.g. "only=crayon,rules&render": render
# writes a PNG per case beside the PES files: the drawn regions faint, the stitches over them)
# Both ports must be free; the script starts and stops its own server and headless Chrome. Exit 1 on any problem.
set -u
CDP=$1 HP=$2 OUT=${3:A} Q=${4:-}
cd ${0:A:h}/..
PY=/Volumes/4TB_SSD/needleworks/.venv/bin/python
[ -x $PY ] || PY=python3
mkdir -p $OUT; rm -f $OUT/pc_*.pes(N) $OUT/pc_*.png(N) $OUT/picture_corpus.json(N)
$PY tests/batch_server.py $OUT $HP > /dev/null 2>&1 &
SRV=$!
d() { node tests/cdp.mjs $CDP "$@"; }
d stop > /dev/null 2>&1; d start $OUT/chrome > /dev/null; sleep 2; d nocache > /dev/null
t=""
for attempt in 1 2 3; do
  d goto "http://127.0.0.1:$HP/tests/browser/picture_corpus.html?v=$RANDOM&$Q" > /dev/null
  for i in $(seq 1 120); do t=$(d eval document.title); case "$t" in *DONE*) break;; esac; sleep 5; done
  case "$t" in *DONE*) break;; esac
done
d eval 'document.getElementById("log").textContent' | sed 's/\\n/\n/g' > $OUT/picture_corpus.txt
d stop > /dev/null; kill $SRV
grep -A30 "FAIL" $OUT/picture_corpus.txt | grep -v "^  ok" | grep -v "pieces (" | grep -v "^--"
$PY -I tests/pe900_check.py $OUT/pc_*.pes > $OUT/pe900_check.txt 2>&1
echo "page: $t; pe900_check: $(grep -c '^ok' $OUT/pe900_check.txt) ok, $(grep -c '^FAIL' $OUT/pe900_check.txt) failed"
grep '^FAIL' $OUT/pe900_check.txt | cut -c1-200
case "$t" in *"DONE "*" 0"*) ;; *) exit 1;; esac
grep -q '^FAIL' $OUT/pe900_check.txt && exit 1
exit 0
