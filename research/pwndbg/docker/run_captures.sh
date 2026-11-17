#!/bin/bash
# Run inside the research-pwndbg container: bash /out/docker/run_captures.sh [session ...]
# Sessions: main segv smash extra nopie vanilla vsegv vsmash   (default: all)
export PWNDBG_NO_AUTOUPDATE=1 TERM=xterm-256color
cp /out/docker/inputrc ~/.inputrc
OUT=${OUT:-/out/captures}; D=/out/docker
cd /work
LONG=$(python3 -c 'print("A"*100)')
SESSIONS=${*:-main segv smash extra nopie calls vanilla vsegv vsmash}
for s in $SESSIONS; do
  BIN=test; FLAGS="-q"; SUF=""; ARG=""
  case $s in
    nopie) BIN=test_nopie; ARG="$LONG";;
    smash) ARG="$LONG";;
    vanilla) FLAGS="-nx"; SUF="vanilla_";;       # no -q: keep the GDB banner in startup_*
    vsegv) FLAGS="-nx -q"; SUF="vanilla_";;
    vsmash) FLAGS="-nx -q"; SUF="vanilla_"; ARG="$LONG";;
  esac
  # native aarch64 (ptrace)
  python3 $D/drive.py $OUT ${SUF}arm64 $D/${s}_arm64.cmds -- gdb $FLAGS ./${BIN}_arm64
  # x86_64 under qemu-user gdbstub. NB: the tonistiigi/binfmt qemu build expects argv[0]
  # explicitly (preserve-argv0 convention), hence the binary name is passed twice.
  python3 $D/drive.py $OUT ${SUF}x64 $D/${s}_x64.cmds -- bash -c \
    "qemu-x86_64 -g 1234 -L /usr/x86_64-linux-gnu ./${BIN}_x64 ./${BIN}_x64 $ARG & sleep 0.5; exec gdb-multiarch $FLAGS -ex 'set sysroot /usr/x86_64-linux-gnu' ./${BIN}_x64"
  pkill -f qemu-x86_64; sleep 0.5
done
