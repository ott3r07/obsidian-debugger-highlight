#!/bin/bash
# Generate per-arch command files from *.cmds.in templates.
cd "$(dirname "$0")"
LONG=$(python3 -c 'print("A"*100)')
gen(){ # template arch start go go2 pcreg
  local t=$1 a=$2 out="${1%.cmds.in}_$2.cmds"
  sed -e "s#@START@#$3#" -e "s#@GO@#$4#" -e "s#@GO2@#$5#" -e "s#@PCREG@#$6#" -e "s#@JLE@#$7#" "$t" | sed '/^$/d' > "$out"
}
for a in arm64 x64; do
  if [ $a = arm64 ]; then pc=pc; jle="main+140"; else pc=rip; jle="main+168"; fi
  for t in main segv smash extra nopie vanilla vsegv vsmash calls; do
    s=${t}; p=""; [ $t != main ] && p="${t}_"
    case $t in vanilla|nopie|main) p="";; vsegv) p="v_segv_";; vsmash) p="v_smash_";; esac
    if [ $a = arm64 ]; then start=""; go="${p}run|run"; [ $t = nopie ] && go="nopie_run|run $LONG"
       [ $t = main ] && go="run_bp|run"; [ $t = vanilla ] && go="v_run|run"
       go2="${p}run|run $LONG"
    else start="${p}target_remote|target remote :1234"; go="${p}continue_start|continue"
       [ $t = main ] && { start="target_remote|target remote :1234"; go="continue_main|continue"; }
       [ $t = vanilla ] && { start="v_target_remote|target remote :1234"; go="v_continue_main|continue"; }
       go2="${p}continue|continue"
    fi
    gen $t.cmds.in $a "$start" "$go" "$go2" "$pc" "$jle"
  done
done
