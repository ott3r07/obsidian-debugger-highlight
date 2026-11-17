#!/bin/bash
# Compile test binaries inside the container (run from /work).
set -e
cp /out/docker/test.c /work/test.c; cd /work
gcc -g -O0 -fstack-protector-all -o test_arm64 test.c
x86_64-linux-gnu-gcc -g -O0 -fstack-protector-all -o test_x64 test.c
NOPIE="-g -O0 -fno-stack-protector -no-pie -z execstack -Wl,-z,norelro"
gcc $NOPIE -o test_nopie_arm64 test.c
x86_64-linux-gnu-gcc $NOPIE -o test_nopie_x64 test.c
