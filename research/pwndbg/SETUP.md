# Reproducing the pwndbg / GDB captures

Host: macOS arm64 with Docker Desktop (arm64 Linux VM). Everything lives in `research/pwndbg/docker/`.

## Files

| file | purpose |
|---|---|
| `docker/Dockerfile` | Ubuntu 24.04 + gdb 15.1 + gdb-multiarch + x86_64 cross gcc/libc + pwndbg (pinned to commit `389764e`, `setup.sh`) + qemu-x86_64 10.2.3 copied from `tonistiigi/binfmt` |
| `docker/test.c` | test program: functions, function pointer, stack buffer, string globals, 8×malloc(0x20) + 3×malloc(0x80) + 2×malloc(0x500), frees → 7 tcache + 1 fastbin (0x30), 1 tcache (0x90), 1 unsorted (0x510); `vuln()` strcpy overflow |
| `docker/build.sh` | compiles `test_arm64`, `test_x64` (PIE, `-fstack-protector-all`, `-g -O0`) and `test_nopie_{arm64,x64}` (`-no-pie -fno-stack-protector -z execstack -Wl,-z,norelro`) |
| `docker/drive.py` | pty driver: starts gdb in a 120x50 pty with `TERM=xterm-256color`, waits for `pwndbg> ` / `(gdb) ` / `(y or n) `, types each command, and writes `<slug>_<arch>.ansi` (raw) + `.txt` (ANSI stripped, `\r\n`→`\n`) per command plus `_session_*` transcripts |
| `docker/*.cmds.in` + `gen_cmds.sh` | command templates (`slug|command` per line) → per-arch `*_arm64.cmds` / `*_x64.cmds` |
| `docker/run_captures.sh` | runs sessions: `main segv smash extra nopie calls` (pwndbg) and `vanilla vsegv vsmash` (`gdb -nx`) for both arches |
| `docker/inputrc` | `set enable-bracketed-paste off` (keeps readline escape noise out of captures) |

## Commands

```sh
cd research/pwndbg/docker
docker build -t research-pwndbg-img .            # ~2 min; ARG PWNDBG_REF=<commit|dev> to change pwndbg version
docker run -d --name research-pwndbg-main \
  --cap-add=SYS_PTRACE --security-opt seccomp=unconfined \
  -v "$PWD/..":/out research-pwndbg-img sleep infinity
./gen_cmds.sh                                     # (host) regenerate *.cmds from *.cmds.in
docker exec research-pwndbg-main bash -c 'bash /out/docker/build.sh && bash /out/docker/run_captures.sh'
# or a subset:  docker exec research-pwndbg-main bash /out/docker/run_captures.sh vanilla calls
# GDB start-up banner (vanilla, no -q):
printf 'v_show_version|show version\n' > banner.cmds
docker exec research-pwndbg-main bash -c 'cd /work && python3 /out/docker/drive.py /tmp/bn vanilla_banner_arm64 /out/docker/banner.cmds -- gdb -nx ./test_arm64 && cp /tmp/bn/startup_vanilla_banner_arm64.* /out/captures/'
docker rm -f research-pwndbg-main
```
A full run takes ~15 min (each `slug` waits for the next prompt; commands that never return a prompt time out after 60 s).

### How each arch is debugged
* **aarch64 (native)**: `gdb -q ./test_arm64`, then `run` (needs `SYS_PTRACE` + `seccomp=unconfined`).
* **x86_64 (emulated)**: `bash -c "qemu-x86_64 -g 1234 -L /usr/x86_64-linux-gnu ./test_x64 ./test_x64 [ARGS] & exec gdb-multiarch -q -ex 'set sysroot /usr/x86_64-linux-gnu' ./test_x64"`, then `target remote :1234`, `continue`.
  * The binfmt qemu build uses the *preserve-argv0* convention, so argv[0] must be passed explicitly (binary name given twice); otherwise the first program argument is swallowed.
  * Ubuntu 24.04's own `qemu-user` 8.2.2 **does not work** with current pwndbg: on the first context display pwndbg reads `/proc/<tid>/smaps` through the gdbstub (`vFile:open:/proc/231/smaps`, `pwndbg/gdblib/vmmap.py:435-470`) and qemu dies with `qemu-x86_64: QEMU internal SIGSEGV {code=MAPERR, addr=0x20}`; GDB then shows `Exception occurred: context: Called send_remote() on a local process`. qemu 10.2.3 works (vmmap, heap, bins, got all functional).

## Known gaps / degradations (see SPEC.md §D)
* x86_64 addresses are qemu-guest addresses (`0xffff…` for libs/stack, PIE `0x555555556000`, heap `0x55555555b000`), not native `0x7f…`.
* No hardware watchpoints under qemu (`Could not insert hardware watchpoint`); captured on aarch64 instead.
* LAST SIGNAL section and `main_arena` symbolication only on aarch64.
* Native x86_64 ptrace was not attempted (Docker Desktop amd64 emulation generally cannot ptrace).

## Capture index (prefix → what)
`startup_*`, `break_main`, `info_breakpoints`, `run_bp`(arm64)/`continue_main`(x64) full context, `context`, `ni`, `ni2`, `si`, `nexti_count`,
`next_source`, `step`, `continue_bp`, `heap`, `bins`, `tcachebins`, `fastbins`, `unsortedbin`, `smallbins`, `vis` (`vis 5`), `vis_heap_chunks`
(`vis-heap-chunks`), `arena`, `malloc_chunk`, `top_chunk`, `old_*` (underscore names → Undefined command), `telescope`, `stack`, `stack_default`,
`x_*`, `info_registers`, `regs`, `vmmap`, `vmmap_stack`, `checksec`, `bt`, `backtrace_full`, `search*`, `p*`, `ptype`, `info_locals`, `info_frame`,
`disassemble*`, `hexdump*`, `canary`, `got`, `got_r`, `plt`, `piebase`, `breakrva`, `xinfo*`, `retaddr`, `distance`, `nearpc`, `procinfo`, `aslr`,
`elfsections`, `libc`, `continue_compute`, `bt_nested`, `backtrace_pwndbg`, `finish`, `context_regs|disasm|code|stack`, `context_regs_flags`,
`context_regs_compact`, `dq|dd|db|dc|ds`, `cyclic*`, `tele_*`, `info_proc_mappings`, `try_free`, `find_fake_fast`, `tls`, `errno`, `info_threads`,
`watch_r`, `watch_hit`, `display_i`, `si_display`, `kill`, `sigsegv` (+`bt_segv`), `smash_*` (stack-protector SIGABRT), `nopie_*` (no-PIE/no-canary/
RWX-stack checksec, got, vmmap, ret-to-0x4141… crash), `calls_*` (✘ branch, call-argument lines, nextcall/nextret), `continue_end` (exited normally),
`v_*_vanilla_*` (plain GDB equivalents, AT&T on x86_64), `startup_vanilla_banner_arm64`.
