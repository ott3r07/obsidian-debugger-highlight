#!/bin/bash
# Usage: run_session.sh <name> <binary> <cmdfile> [qemu-args...] -- [program args...]
# Runs qemu-x86_64 gdbstub + gdb-multiarch(PEDA) inside a pty (script), feeding commands
# from <cmdfile> one per line with a delay. Writes /rv/out/<name>.ansi
set -u
name=$1; bin=$2; cmds=$3; shift 3
qargs=(); while [ $# -gt 0 ] && [ "$1" != "--" ]; do qargs+=("$1"); shift; done
[ "${1:-}" = "--" ] && shift
QEMU=${QEMU:-qemu-x86_64}; GDBARCH=${GDBARCH:-i386:x86-64}
pkill -x qemu-x86_64 2>/dev/null; pkill -x qemu-i386 2>/dev/null; sleep 0.3
export PEDA_QEMU_PAGELOG=/tmp/qemu_pages.log; rm -f $PEDA_QEMU_PAGELOG
cd /rv
$QEMU -d page -D $PEDA_QEMU_PAGELOG "${qargs[@]}" -g 1234 "$bin" "$@" > /tmp/prog_stdout.txt 2>&1 &
sleep 0.5
mkdir -p /rv/out
export COLUMNS=120 LINES=50 TERM=xterm-256color
GDBCMD="gdb-multiarch -q -ex 'set architecture $GDBARCH' ${GDB_EXTRA:-} ${NOSHIM:+-ex echo}${NOSHIM:--x /work/peda_qemu_shim.py} -ex 'target remote :1234' $bin"
{ while IFS= read -r line; do
    case "$line" in
      "#SLEEP "*) sleep "${line#\#SLEEP }";;
      *) printf '%s\n' "$line"; sleep ${DELAY:-1.2};;
    esac
  done < "$cmds"; sleep 1; } | script -q -f -e -c "stty cols 120 rows 50; $GDBCMD" /rv/out/$name.ansi > /dev/null
pkill -x $QEMU 2>/dev/null
echo "--- program stdout ---"; cat /tmp/prog_stdout.txt
