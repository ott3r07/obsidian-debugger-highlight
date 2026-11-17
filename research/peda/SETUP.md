# Reproducing the PEDA captures

Host: macOS arm64 with Docker Desktop (engine 24.0.6, linux/aarch64). Nothing is installed on the host.
All helper files are in `build/`:

| File | Purpose |
|---|---|
| `build/Dockerfile` | arm64 Ubuntu 24.04 + `qemu-user` 8.2.2 + `gdb-multiarch` 15.1 + x86_64/i686 cross gcc + PEDA pinned to `84d38bd` |
| `build/test.c` | test program: `add`/`mul`, function pointer `op_fn`, `compute()`, `malloc`'d heap string, stack buffer, global string `greeting`, `vuln()` with `strcpy` overflow |
| `build/peda_qemu_shim.py` | harness-only fix so PEDA's memory map / colours are correct over a qemu-user gdbstub (see "Accommodations") |
| `build/run_session.sh` | starts `qemu-x86_64`/`qemu-i386 -g 1234`, runs `gdb-multiarch` + PEDA inside a pty (`script`), feeds `build/cmds/<name>.cmds` one line every 1.2 s, writes `build/out/<name>.ansi` |
| `build/cmds/*.cmds` | exact command lists for each capture (`#SLEEP n` = extra wait) |
| `build/strip_ansi.py` | `.ansi` → `.txt` (removes CSI/OSC sequences, CR, readline `\001/\002`) |
| `build/render_spec.py` + `build/SPEC.template.md` | build `SPEC.md`, pulling every example verbatim from `captures/*.txt` |
| `build/peda-src/` | copy of `/opt/peda` from the image, used for the file:line citations in SPEC.md |

## Commands

```sh
cd /Users/ott3r/tmp/obsidian_plugin/research/peda/build
docker build -t research-peda-img .
docker run -d --name research-peda-main -v "$PWD":/work research-peda-img sleep infinity

# compile (x86_64 static non-PIE, x86_64 dynamic PIE+canary+full RELRO, i386 static)
docker exec research-peda-main bash -c 'cd /work &&
  x86_64-linux-gnu-gcc -g -O0 -static -fno-stack-protector -no-pie -o test_static test.c &&
  x86_64-linux-gnu-gcc -g -O0 -fstack-protector-all -pie -fPIE -Wl,-z,relro,-z,now -o test_dyn test.c &&
  i686-linux-gnu-gcc  -g -O0 -static -fno-stack-protector -no-pie -o test_static32 test.c'

PAT='AAA%AAsAABAA$AAnAACAA-AA(AADAA;AA)AAEAAaAA0AAFAAbAA1AAGAAcAA2AAHAAdAA3AAIAAeAA4AAJAAfAA5AAKAAgAA6AAL'  # = `pattern create 100`
R=/work/run_session.sh; C=/work/cmds
docker exec research-peda-main bash $R s1_main         ./test_static   $C/s1_main.cmds
docker exec research-peda-main bash $R s2_crash        ./test_static   $C/s2_crash.cmds -- "$PAT"
docker exec -e GDB_EXTRA="-ex 'set sysroot /usr/x86_64-linux-gnu'" research-peda-main \
            bash $R s3_dyn          ./test_dyn      $C/s3_dyn.cmds -L /usr/x86_64-linux-gnu -- hello
docker exec -e QEMU=qemu-i386 -e GDBARCH=i386 research-peda-main \
            bash $R s4_x86          ./test_static32 $C/s4_x86.cmds -- "$PAT"
docker exec research-peda-main bash $R s5_static_extra ./test_static   $C/s5_static_extra.cmds
docker exec -e NOSHIM=1 research-peda-main \
            bash $R s6_noshim_degraded ./test_static $C/s6_noshim_degraded.cmds

cp out/*.ansi ../captures/
for f in ../captures/*.ansi; do python3 strip_ansi.py "$f" "${f%.ansi}.txt"; done
python3 render_spec.py          # regenerates ../SPEC.md

docker rm -f research-peda-main  # cleanup (image research-peda-img can be removed with docker rmi)
```

What `run_session.sh` runs (simplified):
```sh
qemu-x86_64 -d page -D /tmp/qemu_pages.log [-L sysroot] -g 1234 ./bin [args] &
script -q -f -e -c "stty cols 120 rows 50; gdb-multiarch -q -ex 'set architecture i386:x86-64' \
    -x /work/peda_qemu_shim.py -ex 'target remote :1234' ./bin" out/NAME.ansi   # stdin = cmds file, 1.2 s/line
```
`~/.gdbinit` in the image is `source /opt/peda/peda.py`, so PEDA loads before the shim. The `script` pty makes PEDA emit ANSI colour
(`ansicolor` is on by default; PEDA does not check isatty).

## Captures (`captures/`)

| File | Target | Content |
|---|---|---|
| `s1_main.{ansi,txt}` | x86_64 static | attach context (SIGTRAP), `break main`/`continue`, `ni`/`si` (JUMP taken, call with Guessed arguments), `context [reg/code/stack]`, `telescope`/`stack`, `x/20gx x/s x/4s x/10i x/8wx x/16bx`, `info registers`, `p`/`p/x`, `bt`, `finish`, `eflags`, `vmmap` (+binary/stack/addr), `checksec`, `disassemble`, `pdisass`, `hexdump`, `nextcall`, `nextjmp`, `xinfo` (stack/code/heap/rodata/register/non-address), `xprint`, `distance`, `elfheader`, `elfsymbol`, `searchmem`/`find`/`refsearch`/`sgrep`/`strings`, `pattern create/offset`, `dumpargs`, `getpid`, `skeleton` (usage error), `pshow`/`phelp`, `ropgadget` with the `--More--` pager, `ropsearch`, `asmsearch`, `jmpcall`, `aslr`, `procinfo`, `lookup`, exit (`[Inferior 1 … exited normally]`) |
| `s2_crash.{ansi,txt}` | x86_64 static, argv = 100-byte pattern | JUMP is NOT taken, `nextcall` to strcpy, `Program received signal SIGSEGV`, `Stopped reason: SIGSEGV`, `Invalid $PC address`, `pattern search`, `pattern offset`, `bt` of garbage frames, `signal SIGSEGV` → `Program terminated with signal SIGSEGV` |
| `s3_dyn.{ansi,txt}` | x86_64 PIE, dynamic, canary, full RELRO | vmmap with ld.so/libc, `vmmap libc`, checksec (PIE/FULL), PIE elfheader, libc code pointers, `ropgadget libc`, `readelf libc .text`, `dumprop`, `searchmem "/bin/sh" libc` |
| `s4_x86.{ansi,txt}` | i386 static, argv = pattern | 32-bit registers (EAX…EIP), 4-byte telescope (`0004|`), 32-bit vmmap widths, JUMP taken through PLT, `x/8wx`, `hexdump`, checksec (Partial RELRO), crash `EIP: 0x41414641 ('AFAA')`, `pattern search` |
| `s5_static_extra.{ansi,txt}` | x86_64 static | correct checksec, `context code 16` with a VULN-function call after PC (bold underline red), `pdisass main`, `xrefs`, `eflags set`, `dumprop start end` |
| `s6_noshim_degraded.{ansi,txt}` | x86_64 static, **without** the shim | what stock PEDA prints over a qemu gdbstub: host aarch64 maps in vmmap, code pointers shown as raw qwords, `procinfo` of the qemu process |
| `load_unpatched_py312.txt` | n/a | stock PEDA (bundled six 1.9.0) loading on Python 3.12: 31 SyntaxWarnings + `No module named 'six.moves'` |

Capture artefacts that do not come from PEDA: the second line of each `.txt` is the first command, echoed by the tty before gdb started
(type-ahead). The first/last lines `Script started …`/`Script done …` come from `script`. In s1, the `sgrep PEDA` line inside the `refsearch` output is type-ahead echo interleaved with slow output.

## Results / what failed

* **Native amd64 container + ptrace: does not work.** `docker run --platform linux/amd64 --cap-add=SYS_PTRACE --security-opt seccomp=unconfined ubuntu:24.04`
  with gdb (Rosetta, `model name: VirtualApple`) fails: `Cannot PTRACE_GETREGS: Input/output error` / `Couldn't get registers: Input/output error`.
  Everything was therefore done with arm64 `gdb-multiarch` + `qemu-x86_64 -g` / `qemu-i386 -g`.
* **PEDA on Python 3.12 / gdb 15**: it fails to load as shipped (bundled `six` 1.9.0; captured `load_unpatched_py312.txt`). After replacing
  `lib/six.py` it works. The remaining issues are cosmetic: SyntaxWarnings (silenced with `PYTHONWARNINGS=ignore`), gdb's deprecation warnings for
  `set logging on/off` (visible in captures), `ropsearch` printing `b'…'`, and `pdisass ADDR COUNT` printing a garbled header.

## Accommodations (all documented in `build/Dockerfile` / `build/peda_qemu_shim.py`)

1. `lib/six.py` replaced with Ubuntu's `six` 1.16 (Python 3.12 compatibility). PEDA code is otherwise unmodified.
2. **Memory map over qemu-user (test-harness shim, not PEDA).** Stock PEDA on a remote Linux target does
   `remote get /proc/<pid>/maps` (peda.py:1480-1490). qemu-user serves the *host* qemu process maps, so vmmap lists aarch64 libraries
   and all code/data/rodata classification is wrong (captured: `s6_noshim_degraded.txt`). The guest cannot read its own
   `/proc/self/maps` either, because qemu 8.2.2 crashes with `QEMU internal SIGSEGV {code=MAPERR, addr=0x20}`. The shim replaces `PEDA.get_vmmap`
   with a version that parses qemu's `-d page` log (the last "page layout changed" table) and names the ranges as described in its
   header. With it, vmmap, xinfo, colours, searchmem and pattern search behave as on a real host. Remaining differences from a real
   Linux box:
   * Address layout comes from qemu: stack `0x2aaaaaaac000-0x2aaaab2ac000`, libs at `0x2aaaab2…`, PIE at `0x555555556000`. Real Linux would be
     `0x7ffd…`/`0x7f…`/`0x55…`/`0x56…`.
   * gdb registers no shared libraries over qemu's stub (`info sharedlibrary` → "No shared libraries loaded at this time.", and
     `info files` is not relocated for PIE). So PLT calls show as bare `call 0x5555555570f0` without `<printf@plt>`, `elfsymbol` finds nothing, and
     libc addresses have no `<sym+off>` (the cross libc is stripped; the shim add-symbol-files it anyway).
   * Library paths are the cross-sysroot paths (`/usr/x86_64-linux-gnu/lib/libc.so.6`).
   * x86_64 `ret` to a non-canonical address leaves RIP = `0x4141464141304141` under qemu. Real CPUs fault on the `ret`.
   * The first stop is at the ELF/ld.so entry with `Stopped reason: SIGTRAP` (attach), not `Starting program:` (`run` is not used with a remote target).
   * `procinfo`/`getpid` report the qemu process. `aslr` prints nothing.
3. `/usr/bin/readelf` and `/usr/bin/objdump` are symlinked to the x86-64 cross binutils. Without them `checksec` silently prints defaults
   (`CANARY disabled … NX ENABLED … RELRO disabled`). This was observed in a first run of s1 and s3, which were then re-captured.
