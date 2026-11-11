# Measures PES files inside the PESCHECK VM (no network there: results are read off the screen). See docs/writer-changes.md, W1.
# Measures PES files (ours; reads Brother's own samples in C:\bro). Dot-source, then: $R = Measure-All; queries on $R.
$L1 = [Text.Encoding]::GetEncoding(28591)
function U16($b,$o){ [int]$b[$o] + 256*[int]$b[$o+1] }
function S12($v){ $v = $v -band 0xFFF; if($v -gt 0x7FF){ $v - 0x1000 } else { $v } }
function Measure-One($path){
  $b = [IO.File]::ReadAllBytes($path); $r = [ordered]@{ File = [IO.Path]::GetFileName($path); Ver = $L1.GetString($b,0,8) }
  $r.A12 = U16 $b 12; $r.Sub = $L1.GetString($b,14,2) -replace '[^ -~]','.'
  $o = 16
  if($r.Ver -ge '#PES0040'){
    $sl = @(); for($i=0;$i -lt 5;$i++){ $n = $b[$o]; $sl += $n; $o += 1 + $n }
    $u = @(); for($i=0;$i -lt 18;$i++){ $u += (U16 $b $o); $o += 2 }
    $r.Hdr = ($u -join ','); $r.HdrAt = $o
  } else { $u = @(); for($i=0;$i -lt 6;$i++){ $u += (U16 $b (12+2*$i)) }; $r.Hdr = ($u -join ',') }
  $t = $L1.GetString($b); $at = $t.IndexOf('CEmbOne')
  if($at -gt 0){ $p = $at + 7 + 16; $f = @(); for($i=0;$i -lt 6;$i++){ $f += [Math]::Round([BitConverter]::ToSingle($b,$p),1); $p += 4 }
    $r.T = "$($f[4]),$($f[5])"; $r.M = "$($f[0]),$($f[1]),$($f[2]),$($f[3])"; $r.EW = U16 $b ($p+6); $r.EH = U16 $b ($p+8); $r.Emb = ([regex]::Matches($t,'CEmbOne')).Count }
  $P = [BitConverter]::ToUInt32($b,8); $q = $P + 512
  $r.PW = U16 $b ($q+8); $r.PH = U16 $b ($q+10)
  $i = $q + 20; $long = 0.0; $j10 = 0; $j20 = 0; $other = 0; $x=0; $y=0; $a=1e9; $c=-1e9; $e=1e9; $g=-1e9
  while($i -lt $b.Length){ if($b[$i] -eq 255){break}; if($b[$i] -eq 254 -and $b[$i+1] -eq 176){ $i += 3; continue }
    $d = @(); $fl = 0
    for($k=0;$k -lt 2;$k++){ $v = $b[$i]; if($v -band 128){ $fl = $fl -bor ($v -band 0x70); $d += (S12 (($v -band 15)*256 + $b[$i+1])); $i += 2 } elseif($v -gt 63){ $d += $v - 128; $i++ } else { $d += $v; $i++ } }
    $x += $d[0]; $y += $d[1]
    if($fl -band 0x20){ $j20++ } elseif($fl -band 0x10){ $j10++ } elseif($fl){ $other++ } else { $len = [Math]::Sqrt($d[0]*$d[0]+$d[1]*$d[1]); if($len -gt $long){ $long = $len }; $a=[Math]::Min($a,$x); $c=[Math]::Max($c,$x); $e=[Math]::Min($e,$y); $g=[Math]::Max($g,$y) } }
  $r.Long = [Math]::Round($long/10,1); $r.J10 = $j10; $r.J20 = $j20; $r.JX = $other; $r.SW = $c - $a; $r.SH = $g - $e
  [pscustomobject]$r
}
function Measure-All($dir = 'C:\bro'){ gci $dir -Filter *.pes | % { try { Measure-One $_.FullName } catch { [pscustomobject]@{ File = $_.Name; Ver = 'ERR' } } } }
# thread chart of a v6-style file whose header is plain (no image name, no fills): catalogue | description | brand
function Chart($path, $max = 6){
  $b = [IO.File]::ReadAllBytes($path); $o = 16; for($i=0;$i -lt 5;$i++){ $o += 1 + $b[$o] }; $o += 36; $o += 1 + $b[$o]; $o += 24
  $z = (U16 $b $o),(U16 $b ($o+2)),(U16 $b ($o+4)); $o += 6; if(($z | measure -Sum).Sum){ return "fills/motifs present: $z" }
  $n = U16 $b $o; $o += 2; $out = @("threads $n")
  for($k=0;$k -lt [Math]::Min($n,$max);$k++){ $l=$b[$o]; $cat=$L1.GetString($b,$o+1,$l); $o+=1+$l; $rgb = '{0:x2}{1:x2}{2:x2}' -f $b[$o],$b[$o+1],$b[$o+2]; $o+=3; $o+=1; $ty = [BitConverter]::ToUInt32($b,$o); $o+=4
    $l=$b[$o]; $de=$L1.GetString($b,$o+1,$l); $o+=1+$l; $l=$b[$o]; $br=$L1.GetString($b,$o+1,$l); $o+=1+$l; $l=$b[$o]; $ch=$L1.GetString($b,$o+1,$l); $o+=1+$l
    $out += "$cat | $rgb | $ty | $de | $br | $ch" }
  $out
}
