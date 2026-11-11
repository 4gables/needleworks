#!/bin/zsh
# One release at a time (sw.js): does a page ever run one release's files beside another's?
# Class guarded: mixed releases. 2026-10-31, minutes after a push: a new ui.js ran with the last pieces.js (the host
# still handed out old copies of some files) and drew the bookmark squashed, its hole on top. Nothing else can see
# this: every other check loads one set of files from one folder.
# Three copies of the site are made, A (as it is), B and C (a module and the page title changed, hashes rewritten, a
# new cache name), and served one after another from one address:
#   1. A installs and serves the page.
#   2. B is published: the page, loaded again, is still all A; B waits and the page offers it.
#   3. The page's Reload: all B, A's cache gone.
#   4. C is half published (its sw.js is up, one of its files is still B's copy): refused, the page stays all B.
#   5. C fully published: still all B, C waits.
# usage: zsh tests/upgrade.sh [HTTP_PORT=8811] [CDP_PORT=9491]     (~1.5 min; exit 1 when a step is wrong)
# Run it after changing sw.js or the registration in app.js (tests/check.sh does).
set -u
cd "${0:A:h}/.."; W=$PWD; PORT=${1:-8811}; CDP=${2:-9491}; T=${TMPDIR:-/tmp}/nw-upgrade; rm -rf $T; mkdir -p $T
for r in A B C; do rsync -a --exclude .git --exclude .claude --exclude .worktrees --exclude .agents --exclude node_modules --exclude out --exclude .venv --exclude 'tests/external' $W/ $T/$r/; done
mark() {   # folder, letter, version number
  ( cd $T/$1 && sed -i '' "s#<title>[^<]*</title>#<title>release $2</title>#" index.html \
    && sed -i '' "s#^export const SCRIPT = #export const RELEASE = \"$2\";\nexport const SCRIPT = #" js/studio/starters.js \
    && sed -i '' "s#needleworks-v[0-9]*-#needleworks-v$3-#" sw.js && node tests/sw.test.mjs --write >/dev/null && node tests/sw.test.mjs >/dev/null ) || { print "couldn't make release $2"; exit 1; }
}
mark A A 91; mark B B 92; mark C C 93
cp $T/B/js/studio/starters.js $T/C/js/studio/starters.js
# (the test server answers "not changed" by file time, to the second: each release's files are later than the last's)
find $T/B -type f -exec touch -A 000100 {} +; find $T/C -type f -exec touch -A 000200 {} +
ln -s $T/A $T/live
python3 -m http.server $PORT --directory $T/live >/dev/null 2>&1 & SRV=$!
d() { node $W/tests/cdp.mjs $CDP "$@"; }
trap 'd stop >/dev/null 2>&1; kill $SRV 2>/dev/null' EXIT
sleep 1; d start $T/chrome >/dev/null 2>&1
# (a new address each time: the same one again is no navigation, and no check for a new release)
go() { d goto "http://127.0.0.1:$PORT/?sw&n=$RANDOM#design" >/dev/null; sleep ${1:-9}; }
state='(async()=>{const reg=await navigator.serviceWorker.getRegistration(), mod=await (await fetch("js/studio/starters.js")).text(), page=await (await fetch("index.html")).text(); return [document.title.slice(-1), (mod.match(/RELEASE = "(\w)"/)||[])[1], (page.match(/<title>release (\w)/)||[])[1], "waiting:"+!!(reg&&reg.waiting), "caches:"+(await caches.keys()).filter((k)=>k!=="needleworks-shared").length, "offer:"+/new version/.test((document.querySelector(".toast:not([hidden]):not(.gone)")||{}).textContent||""), "mode:"+document.body.dataset.mode].join(" ")})()'
fail=0
step() {   # name, what the state must be
  local got=$(d eval "$state" | tr -d '"')
  if [[ $got == $2 ]]; then print "ok    $1: $got"; else print "FAIL  $1: $got (wanted $2)"; fail=1; fi
}
go; go 5
step "1. A installed" "A A A waiting:false caches:1 offer:false mode:design"
rm $T/live; ln -s $T/B $T/live; go
step "2. B published, page loaded again" "A A A waiting:true caches:2 offer:true mode:design"
d eval '(async()=>{[...document.querySelectorAll(".toast button")].find((b)=>/Reload/.test(b.textContent))?.click(); await new Promise((r)=>setTimeout(r,6000)); return 1})()' >/dev/null 2>&1; sleep 6
step "3. the page's Reload" "B B B waiting:false caches:1 offer:false mode:design"
rm $T/live; ln -s $T/C $T/live; go; go 5
step "4. C half published" "B B B waiting:false caches:2 offer:false mode:design"
sed -i '' 's#RELEASE = "B"#RELEASE = "C"#' $T/C/js/studio/starters.js; touch -A 000400 $T/C/js/studio/starters.js; go
step "5. C fully published" "B B B waiting:true caches:2 offer:true mode:design"
(( fail )) && print "upgrade: FAILED" || print "upgrade: passed"
exit $fail
