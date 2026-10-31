#!/bin/sh
# Runs the Brother diff in the PESCHECK VM (UTM, PE-DESIGN 11 trial, driven over VNC with vm-pescheck/tools/vnc.py):
# builds the page, swaps it in as the VM's CD, boots, gathers Brother's 379 sample PES files into C:\bro (first run
# only) with an index.txt, and opens the page in Edge with ?dir=C:/bro and --allow-file-access-from-files so it reads
# them itself (driving the folder dialog over VNC was unreliable). Screenshots land in out/vm/; read out/vm/result.png: the bold line is the verdict.
# usage: sh tests/vm/run.sh [extra .pes files for D:\pes]
set -e
cd "$(dirname "$0")/../.."
VM=/Volumes/4TB_SSD/vm-pescheck UTM=/Applications/UTM.app/Contents/MacOS/utmctl
vnc() { python3 "$VM/tools/vnc.py" "$@"; }
node tests/vm/make.mjs "$@"
$UTM stop PESCHECK 2>/dev/null || true; sleep 5
cat out/vm/files.iso > "$VM/files.iso"          # cat keeps UTM's sandbox access to the file
$UTM start PESCHECK; sleep 80
vnc key win; sleep 2; vnc type powershell; sleep 2; vnc key ret; sleep 8
vnc type 'if (-not (Test-Path C:\bro)) { mkdir C:\bro | Out-Null; $n=0; gci "C:\Program Files (x86)\Brother","C:\Users\tester\Documents" -Recurse -Filter *.pes -EA 0 | % { $n++; Copy-Item $_.FullName ("C:\bro\{0:d4}_{1}" -f $n, $_.Name) } }; (gci C:\bro -Filter *.pes).Name | Set-Content C:\bro\index.txt; Stop-Process -Name msedge -Force -EA 0; sleep 2; Start-Process msedge "--allow-file-access-from-files","--hide-crash-restore-bubble","file:///D:/diff/brother_diff.html?dir=C:/bro"'
vnc key ret; sleep 45
vnc shot out/vm/result.png
echo "verdict: out/vm/result.png (scroll the page with: python3 $VM/tools/vnc.py key pgdn; ... shot out/vm/result2.png)"
