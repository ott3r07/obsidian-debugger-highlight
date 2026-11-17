# GEF capture setup (reproduction)

Host: macOS arm64, Docker Desktop (arm64 Linux VM, kernel 6.4.16-linuxkit).
Everything below lives in `research/gef/build/`; captures land in `research/gef/captures/`.

| Component | Version used |
|---|---|
| Ubuntu | 24.04 (arm64 container) |
| GDB | `GNU gdb (Ubuntu 15.1-1ubuntu1~24.04.1) 15.1` (`gdb` and `gdb-multiarch`) |
| GEF | `hugsy/gef` `main` @ `8514ebc8f1710beb3acb8ae4d09643b00031ead9` (commit date Mon Nov 16 2026), 13,549 lines. A copy is at `build/gef.py`. Every `gef.py:N` citation in SPEC.md refers to this file. |
| glibc | 2.39 (Ubuntu 24.04, arm64 native and amd64 cross) |
| QEMU user | `qemu-x86_64 version 8.2.2 (Debian 1:8.2.2+ds-0ubuntu1.18)` |
| Older GEF releases (source comparison only) | `build/oldgef/gef-{2021.10,2022.06,2023.06,2024.06,2025.01,2026.01}.py`, fetched from `raw.githubusercontent.com/hugsy/gef/<tag>/gef.py` |

## 1. Image

`build/Dockerfile`:

```dockerfile
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 LC_ALL=C.UTF-8
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates curl file python3 \
      gdb gdb-multiarch gcc libc6-dbg build-essential \
      qemu-user gcc-x86-64-linux-gnu libc6-dev-amd64-cross \
      bsdutils util-linux procps binutils && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/hugsy/gef /opt/gef \
 && cd /opt/gef && git log -1 --format='%H %cd' > /opt/gef/COMMIT \
 && echo "source /opt/gef/gef.py" > /root/.gdbinit
WORKDIR /work
```

```sh
cd research/gef/build
docker build -t research-gef-img .
docker run -d --name research-gef-main --cap-add=SYS_PTRACE --security-opt seccomp=unconfined \
  -v "$PWD":/work -v "$PWD/../captures":/captures research-gef-img sleep infinity
```

## 2. Test program and binaries

`build/test.c` is the same program used for the pwndbg research, with only the greeting changed to `"Hello, gef!"`. It has functions (`add`, `mul`, `compute`, `vuln`), a function pointer, a stack buffer, a global string, 8x malloc(0x20), 3x malloc(0x80) and 2x malloc(0x500). It frees 8 small chunks (7 go to tcache, 1 to fastbin), one 0x80 chunk (tcache) and one 0x500 chunk (unsorted bin). `vuln()` has a `strcpy` overflow.

```sh
docker exec research-gef-main sh -c 'cd /work
gcc -g -O0 -fno-omit-frame-pointer -o test_arm64 test.c
gcc -g -O0 -fno-omit-frame-pointer -fno-stack-protector -o test_arm64_nossp test.c
x86_64-linux-gnu-gcc -g -O0 -fno-omit-frame-pointer -static -o test_x64 test.c
x86_64-linux-gnu-gcc -g -O0 -fno-omit-frame-pointer -static -fno-stack-protector -o test_x64_nossp test.c'
```

## 3. PTY driver

`build/drive.py` forks GDB in a real pty (110x50, `TERM=xterm-256color`). It waits until the stripped output ends with `gef➤`, sends the next command from a command file (`name<TAB>command`; a name of `-` means the output is not saved), and writes each command's output to a separate file:

* `<name>_<prefix>.ansi`: raw bytes, including the `\x01`/`\x02` readline markers GEF wraps around every SGR code (gef.py:588-605). The `\x1b[H\x1b[J` clear-screen before each context and the `\x1b[?2004h/l` bracketed-paste toggles are also kept.
* `<name>_<prefix>.txt`: the same output with ANSI codes and `\x01\x02` stripped and CRLF changed to LF. This is what a user's plain-text paste looks like. The trailing prompt is removed. When several commands share a name, their output is appended to one file.
* `session_<prefix>.{ansi,txt}`: the full session transcript.

GEF colors its output when stdout is a tty. No `gef.disable_color` override was used.

## 4. Sessions

### 4a. Native aarch64 (ptrace works natively)

```sh
docker exec research-gef-main python3 /work/drive.py /captures/arm64 arm64 /work/cmds_arm64.txt -- gdb -q /work/test_arm64
# crash sessions: SIGBUS (no canary) and SIGABRT (stack smashing) with a 128-byte GEF pattern as argv[1]
P=$(gdb -q -batch -ex "pattern create 128" /work/test_arm64 | sed -n 4p)   # aaaaaaaabaaaaaaa...
sed "s/^run_segv.*/run_segv\trun $P/" cmds_crash_arm64.txt > /tmp/c.txt
python3 drive.py /captures/arm64_crash arm64     /tmp/c.txt -- gdb -q /work/test_arm64_nossp
python3 drive.py /captures/arm64_crash arm64_ssp /tmp/c.txt -- gdb -q /work/test_arm64
```

### 4b. x86_64 through qemu-user plus the gdbstub

Native ptrace of amd64 binaries is not possible in this setup, so a static x86_64 binary runs under `qemu-x86_64 -g 1234`. `gdb-multiarch` attaches to it with GEF's own QEMU mode:

```sh
qemu-x86_64 -g 1234 /work/test_x64 &
python3 drive.py /captures/x86_64 x86_64 /work/cmds_x64.txt -- gdb-multiarch -q /work/test_x64
# first command in cmds_x64.txt:
#   gef-remote --qemu-user --qemu-binary /work/test_x64 localhost 1234
```

Known degradations and the workarounds used. Each is marked in the command files with `[research]` output.

1. **Memory map.** In `--qemu-user` mode GEF writes a fake `/proc/<pid>/maps` that holds one region, `0-0xffffffffffffffff rwx` (gef.py:13203-13241). The QEMU 8.2 gdbstub also answers `info proc mappings` with "Not supported on this target", and reading `/proc/self/maps` from inside the guest crashed QEMU (`QEMU internal SIGSEGV`). With the fake map every integer counts as a valid pointer. Chains then never end in strings or code, e.g. `0x0000000000000001 → 0x0000000000000001`, and nothing is colored as stack or heap. That raw, degraded output is preserved in `captures/x86_64_qemu_degraded/` because real users of `gef-remote --qemu-user` paste exactly this.
   *Workaround for the main capture:* the real guest layout came from `qemu-x86_64 -d page -D pages.log ./test_x64`, was written as `build/maps_x64_qemu.txt`, and was copied over GEF's fake maps file right after `gef-remote`:
   `python import shutil; shutil.copy('/work/maps_x64_qemu.txt', str(gef.session.remote.maps)); reset_all_caches()`
2. **libc version.** A static binary has no libc mapping, so GEF cannot detect the glibc version and parses `malloc_state` with the wrong layout (`Arena(... top=0x0 ...)`). Workaround: `gef config gef.libc_version 2.39`.
3. **Heap base.** The `mp_` symbol has no type info in the static binary, so GEF falls back to the start of `[heap]`. That is wrong here because static TLS sits at the start of the brk area. Workaround (one-line Python before the `heap` commands): set GEF's private `__heap_base` to `*(unsigned long*)((char*)&mp_+96)`, i.e. `mp_.sbrk_base` = `0x4b2d00`.
4. Other degradations, not worked around: no thread `Name:` in the threads pane; `checksec` reports a temp-dir path (`/tmp/tmpXXXX/work/test_x64`); `got` is empty (static binary); the prompt carries a `(qemu) ` prefix; `canary` reports a QEMU-internal pid.

x86_64 crash session: `qemu-x86_64 -g 1234 /work/test_x64_nossp <pattern>` plus `cmds_crash_x64.txt` gives a SIGSEGV on `ret` into the pattern.

## 5. Regex validation

`build/gef_line_regexes.mjs` contains the proposed line classifiers from SPEC.md. Running `node gef_line_regexes.mjs ../captures` prints hit counts and the lines no rule matched. Of those, 74 are GDB `info registers` xmm blocks and program stdout. `node sample_rules.mjs ../captures` prints three sample lines per rule.

## 6. Cleanup

```sh
docker rm -f research-gef-main      # done
docker rmi research-gef-img         # optional; image kept for follow-up captures
```
