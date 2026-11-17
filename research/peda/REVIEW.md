# Adversarial review of `SPEC.md` (PEDA output → ```peda highlighter)

Reviewer evidence (all reproducible):

| Path | What |
|---|---|
| `review_samples/_tools/spec_regexes.cjs` | every line regex from SPEC.md, verbatim |
| `review_samples/_tools/harness.cjs` | runs them on every line under 5 paste variants (original, trailing-ws trimmed, TAB→4 spaces, TAB→1 space, TAB→8-col tab stops) and runs the §6 chain "peel" tokeniser |
| `review_samples/_tools/fixed_regexes.cjs` + `harness2.cjs` | the corrected regex set below (first match wins, in file order) + chain classifier |
| `review_samples/_tools/tabloss.cjs` | counts matches lost when TABs become spaces |
| `review_samples/qemu_review/` | 5 fresh captures from `research-peda-img` (container `review-peda-1`, removed): `rv.c`, `rv*.cmds`, `r1`–`r5.{ansi,txt}`; r3/r4 are offline (no process) sessions |
| `review_samples/*.txt` | 18 real-world PEDA pastes extracted verbatim from public writeups; the first line of each file is `# SOURCE: <url>`. Raw downloads are in `review_samples/raw/` |

Run, e.g.: `node review_samples/_tools/harness.cjs review_samples/_tools/spec_regexes.cjs captures/s*.txt`
(the tools are `.cjs` because the repo's `package.json` has `"type":"module"`).

Headline numbers:

| Input | SPEC regexes: unmatched lines | SPEC chain-tokeniser failures | Corrected set: unmatched | Corrected: chain failures |
|---|---|---|---|---|
| `captures/s*.txt`, original | 302 / 3541 (75 shapes) | 0 | 70 / 3541 (all gdb `info frame`/help text/type-ahead) | 0 |
| `captures/s*.txt`, TABs→spaces | **618** / 3541 (119 shapes) | 0 | 71 | 0 |
| captures + `qemu_review` + 18 real-world samples | 1172 / 8164 | **118** | 792 / 8147 (mostly prose/shell lines in writeups) | 0 (2 UNKNOWN annotations, both from GEF output) |

---

## 1. Critical errors

1. **The chain annotation grammar (§6) is incomplete, and the parser that peels from the end fails on very common real output.** Three annotation forms are missing:
   * **gdb repeat blocks**: `('A' <repeats 80 times>, "BBBB")`, `('L' <repeats 200 times>...)`, `('A' <repeats 148 times>, "BBBB", 'C' <repeats 48 times>...)`. gdb's `x/s` collapses runs of 10 or more identical characters (`repeat_count_threshold`), so any overflow buffer full of `A`s looks like this. Captured in `qemu_review/r1.txt` (RAX/RDI, 9 telescope rows). In the real-world samples, **57 of the 118** tokeniser failures are this form, e.g. `EAX: 0xffffd5f0 ('A' <repeats 28 times>, "DCBA")` in nnamon's course and `ESP: 0xbffff508 ('C' <repeats 104 times>)` in the hardenedlinux off-by-one writeup.
   * **Zero-padded self/cycle reference**: `RDX: 0x2aaaab2abb88 (0x00002aaaab2abb88)` and `0x2aaaab2abb90 --> 0x2aaaab2abb98 (0x00002aaaab2abb90)`. Source: `examine_mem_reference` stops when `vn` points to itself or back into the chain (peda.py:2150-2155). The last tuple's `vn` is then raw `x/gx` text (zero-padded to 16 digits, or 8 on i386), and `format_reference_chain` prints it in parentheses. These chains are common with heap free lists and `main_arena` bins. Captured in r1 (6 shapes). Real-world examples: `R9 : 0x7ffff7fb94c0 (0x00007ffff7fb94c0)` (firmianay rop_x86) and `0056| 0x7fffffffe2b0 --> 0x7fffffffe400 --> 0x7ffff7fd9740 (0x00007ffff7fd9740)` (9447 cards). Under the spec rules the last element is a "value", which is wrong: it is an address.
   * **Empty value repr `('')`**: `RCX: 0x2000 ('')` and `RAX: 0x4d4100 ('')`. `is_printable` accepts NUL, and the repr is cut at the first NUL (utils.py:477-480). Any value whose low byte is 0x00 and whose other bytes are printable produces this. Captured in r1 and r5. The spec regex happens to accept `''`, but the form is undocumented.
   
   **Fix:** parse chains **from the left**, not by peeling from the right. The elements are strictly `0x[0-9a-f]+` joined by ` --> `. Everything between the first ` (` after the last element and the final `)` is the annotation:
   `/^(0x[0-9a-f]+)((?: --> 0x[0-9a-f]+)*)(?: \((.*)\))?[\t ]*$/`
   Then classify the annotation, in this order:
   | Class | Regex |
   |---|---|
   | truncated | `/^--> \.\.\.$/` |
   | symbol+disasm | `/^(<.+?>)?:[\t ]+(.*)$/` |
   | self-reference | `/^0x[0-9a-f]{8}(?:[0-9a-f]{8})?$/` |
   | gdb-string | ``^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)+' <repeats \d+ times>)(?:, (?:"…"|'…' <repeats \d+ times>))*(?:\.\.\.)?$`` |
   | value-repr | `/^'(?:[^'\\]|\\.)*'$/` |
   | MemError | `/^MemError$/` |
   | bare disasm | `/^[a-z][a-z0-9.]*(?:[\t ].*)?$/` |
   | anything else | neutral |
   
   Tested result: 0 parse failures over 8147 lines, and the only UNKNOWN annotation was `("0000"?)` from GEF output.

2. **Five of the spec's own regexes require a literal TAB, which contradicts its rule to "make them tolerant of `[\t ]+` wherever a TAB appears".** When TABs are expanded to spaces (terminal copy, tmux copy mode, many blog engines), these regexes lose matches on the captures alone (`tabloss.cjs`):

   | Regex | Captured matches lost |
   |---|---|
   | `ropsearch` | 232 |
   | vmmap row | 54 |
   | `x/` examine | 25 |
   | gdb source line | 21 |
   | vmmap header | 8 |

   Together these 340 lost matches (plus collision fallout) raise the unmatched count from 302 to 618. This happens in the wild: firmianay's `0x00400883 : (b'5fc3')  pop rdi; ret`, hexinuni's `Start              End                Perm  Name`, and 104 tab-less `x/gx` lines (`0x7fffffffe278: 0x0000555555554e62      0x0000000000000004`) that the spec regexes classify as `strings`/`dumprop`. The spec's own Ambiguity #8 ("Prefer the TAB to detect x/ output") fails for the same reason. With the corrected set, the only match lost to TAB expansion is the `xrefsInsn` line (the TAB is the only thing that tells it apart from `dumprop`).

3. **The memory-type magnitude heuristic is wrong for the most common real-world case.** Ambiguity #1 says `0x7ff[c-f]…` is the stack. gdb disables ASLR by default, so libraries live at `0x7ffff7…` (`0x7ffff7a2d830 (<__libc_start_main+240>…)` in hexinuni, and `main_arena` at `0x7ffff7dd1b78`). These match `0x7ff[c-f]` and would be coloured as stack. Section 6, step 4 even promotes this to an `address-stack` token rule. **Drop magnitude rules as token rules**; see §5 below.

4. **The jump-target line can start with ` |->=> `.** When a jump's target is the current PC (`jmp $`, spin loops, the PLT stubs and `rep` loops), PEDA's `get_disasm(jumpto)` uses `x/Ni`, which marks the PC line itself. Captured in r1:
   ```
   =>  0x401900 <spin+8>:	jmp    0x401900 <spin+8>
    |->=> 0x401900 <spin+8>:	jmp    0x401900 <spin+8>
   ```
   The spec's `jumpTarget` regex requires `\s+` after `|->`, so this line is unmatched. Fix: `^( \|->)(=> |[\t ]+)(0x…)`.

5. **Several "source-only" claims are now captured, and two are wrong in detail:**
   * `NNNN| Cannot access memory address` is real (r5: `0016| Cannot access memory address`), and it has **no** trailing space.
   * vmmap with no process (before `run`, or after the process exits) uses the offline map builder (peda.py:1407-1424) and prints the perm **`rx-p`** (sic), with **unrelocated** PIE addresses (`0x00001000 0x00001395 rx-p	/rv/rvpie`, captured in r3/r4). The spec's row regex `[r-][w-][x-][ps]` rejects `rx-p`. Fix: `([rwxps-]{4})`. Never use such a table for address classification.

6. **`searchResult` (§16) shadows other line types.** `/^(\s*[^:]+?) : (0x[0-9a-f]+)(.*)$/` also matches every padded register line (`R8 : 0x0` … `R15`: 70 captured lines), `Start : 0x…`/`End   : 0x…` (18), and pattern-search reference lines (9). It must be evaluated **after** the register, xinfo and pattern regexes, and its value should be constrained to a chain (see the corrected regex).

7. **gdb stop and frame lines are wrong for native Linux.** The frame regex `/^(0x…) in (\S+|\?\?) \((.*)\)$/` rejects:
   * ` at file:line`: `0x00000000004019ed in main (argc=0x1, …) at test.c:30`, captured twice in s1.
   * ` from /lib/…`: `0xf7e6fdd9 in free () from /lib/i386-linux-gnu/libc.so.6` (nightmare). This is the normal form for libc frames on native targets. It never occurs under qemu because no shared libraries were registered.
   * No address at all: `compute (f=…) at test.c:12` and `main (argc=0x2, …) at test.c:30` after `finish`/`nextcall` (s1, s3).
   
   `bt` has the same `from` problem. The breakpoint-hit regex misses modern gdb's threaded form `Thread 1 "revengme" hit Breakpoint 2, 0x0000000000488e99 in ?? ()` (Dvd848 BSidesTLV). The watchpoint-set form is `Hardware watchpoint 2: gcounter` (r1), not `… at 0x…`.

---

## 2. Regex failures (counts, examples, corrected and tested regexes)

All counts come from `captures/s*.txt` (3541 non-empty lines) unless marked otherwise. "RW" means the 18 real-world samples.

| SPEC regex | Problem | Evidence | Corrected (tested; full set in `fixed_regexes.cjs`) |
|---|---|---|---|
| banner `^\[(-{30,40})(registers\|code\|stack)…` | Leading space breaks it, and other PEDA banners are excluded | RW hexinuni: ` [----------------------------------registers---…]` (3×). PEDA `crashdump` prints `[---START OF CRASH DUMP---]` and `[---backtrace (innermost 10 frames)---]` (peda.py:5937-5958) | `/^[\t ]*\[(-{3,})([A-Za-z][\w :]*?)(-{3,})\][\t ]*$/` |
| footer `^\[-{78}\]$` | Leading or trailing whitespace breaks it | same | `/^[\t ]*\[-{20,}\][\t ]*$/` |
| legend (fixed 4 words) | Forks print a different word list | Scribd "pwn basic" PEDA fork: `Legend: code, data, rodata, heap, value` | `/^(Legend):[\t ]+(.*?)[\t ]*$/`, then tokenise the words |
| register | Fine on captures. Tighten it so it cannot catch `CANARY    :` and similar lines | 650 OK | `/^(R(?:[ABCD]X\|[SD]I\|[BS]P\|IP\|8\|9\|1[0-5])\|E(?:[ABCD]X\|[SD]I\|[BS]P\|IP))[\t ]*:[\t ]+(0x[0-9a-f]+.*?\|Cannot access memory address)[\t ]*$/` |
| §6 peel tokeniser | Fails on repeats and self-refs | 0 on captures. **118 on RW + review captures** (examples in §1.1) | Left-to-right chain regex + classifier (§1.1) |
| jumpTarget | Misses `\|->=>` | r1: 2 lines | `/^( \|->)(=> \|[\t ]+)(0x[0-9a-f]+)(?:[\t ]+<(.+?)>)?:[\t ]+(\S+)(?:[\t ]+(.*?))?[\t ]*$/` |
| disasm/jump `<([^>]+)>` | Breaks on C++ symbols such as `<std::vector<int>::size()+4>` and `<operator<<(…)@plt>`. Separately, symbols are lost entirely when copied from HTML pages, which leaves `   0x080485a7 :	push   ebp` and `(:	test   eax,eax)` | RW cspub 04-gdb: 40+ lines | Use lazy `<(.+?)>` (the `>:` + TAB anchor stops it). Accept `0x… :` (`(?:[\t ]+<(.+?)>\| (?=:))?`) and annotations `^(<.+?>)?:` |
| vmmapHeader / vmmapRow | Literal TAB required; `rx-p` rejected; empty name (trailing TAB trimmed) rejected | 62 lost when TABs become spaces; r3/r4 `rx-p`; RW hexinuni `0x00601000         0x00602000         rw-p` | `/^(Start)[\t ]+(End)[\t ]+(Perm)[\t ]+(Name)[\t ]*$/`, `/^(0x[0-9a-f]{8,16})[\t ]+(0x[0-9a-f]{8,16})[\t ]+([rwxps-]{4})(?:[\t ]+(.*?))?[\t ]*$/` |
| ropsearch `…\)\t(.*)$` | Literal TAB | 232 lost; RW firmianay 3 lines with spaces | `/^(0x[0-9a-f]+) : \((b'[0-9a-f]*'\|[0-9a-f]*)\)[\t ]+(.*?)[\t ]*$/` |
| xExamine `:\t(.*)$` | Literal TAB. Without it, `x/` lines collide with strings/dumprop | 25 lost; RW 104 misclassified | ``^(0x…)(?:[\t ]+<(.+?)>)?:[\t ]+((?:0x[0-9a-f]+|-?\d+|"|'|<|\{).*?)[\t ]*$`` (body must start with a value or quote). Then `/^(0x[0-9a-f]+): (.+?)[\t ]*$/` for dumprop/strings |
| gdbSrcLine `^(\d+)\t` | Literal TAB | 21 lost | `/^(\d+)[\t ]+(.*)$/` (also matches `info breakpoints` rows, which is harmless) |
| hexdump | Fails when the ASCII column is all spaces and the editor trims it. Breaks after the `.{1,16}` count when TABs are expanded inside ASCII (TAB bytes are shown as `.`, so this is OK) | source | `/^(0x[0-9a-f]{8,16}) : ((?:[0-9a-f]{2} ){0,15}[0-9a-f]{2})(?:[\t ]+(.{1,16}?))?[\t ]*$/` |
| searching | Matches, but puts `ROP gadget:` / `reference to:` inside the pattern group; misses `Searching for pointers on: …` | s1:1733 | `/^(Searching for(?: reference to:\| ROP gadget:\| ASM code:)?) (.+?) (in(?: range)?:) (.*?)[\t ]*$/` + `/^(Searching for (?:pointers\|addresses) on:) (.*)$/` |
| searchResult | Over-broad (see §1.6) | 97 collisions | `/^([\t ]*[^\s:][^:]*?) : (0x[0-9a-f]+(?: --> 0x[0-9a-f]+)*(?: \(.*\))?)[\t ]*$/`, ordered after register/xinfo/pattern |
| patternCreate | `pattern` option 2 (maximum charset, utils.py:591-592) can emit `'`, `"`, `!`… ; a custom `p_charset` can emit anything | source | Keep the regex as is, but fall back to plain `^'.*'$` → string |
| patternOffset vs patternReg | `RBP+0 found at offset: 32` matches both | 9 collisions | Put `patternReg` first |
| ropgadget / elfList / kv | Triple overlap | 163 + 43 lines | One `kv` regex; style the value by shape |
| gdbFrame, bt, gdbBpHit, watchpoint | See §1.7 | s1: 2, s3: 1, RW: several | `/^(0x[0-9a-f]+) in (.+?) \((.*?)\)(?: (at\|from) (\S+?))?[\t ]*$/`; `/^([A-Za-z_][\w:.@<>~]*) \((.*)\) at (\S+):(\d+)[\t ]*$/`; bp-hit with `(?:(Thread [\d.]+ "[^"]*") hit )?`; `/^((?:Hardware \|Software )?(?:read \|access \(read\/write\) )?[Ww]atchpoint) (\d+): (.*)$/` |
| Warning | gdb also prints a bare `Warning:` (r1: `Warning:` then `Could not insert hardware watchpoint 2.`). gdb prints lower-case `warning: BFD: …` (s4:6); Docker users see `warning: Error disabling address space randomization: Operation not permitted`. Old PEDA prints `Warning: not running or target is remote` (RW hexinuni) | | `/^(Warning):[\t ]*(.*)$/`, `/^(warning):[\t ]+(.*)$/` |
| xinfo / xprint first line | **No regex in the spec at all** (§15 says "is a chain"). 11 captured lines are unmatched: `0x4b5900 ("heap string AAAABBBB")`, `0xdeadbeef ` | s1, s2, s3, s4 | `/^(0x[0-9a-f]+)((?: --> 0x[0-9a-f]+)*)(?: \((.*)\))?[\t ]*$/` (order it after `x/` examine) |
| Lines the spec shows but gives no regex for | `Stepping through, Ctrl-C to stop...` (8), `Dump of assembler code …:` (5), `End of assembler dump.` (6), `'printf': no match found` (3), `All references to 'compute':`, `Writing ROP gadgets to file: …`, `Writing pattern of …`, `No argument`, `Value returned is $2 = 0xd` | captured | `pedaInfo`, `elfNoMatch`, `guessed`, and `gdbInfo` in `fixed_regexes.cjs` |

Regexes verified unaffected by trailing-whitespace trimming: every spec regex survives `trimEnd` (0 matches lost). The trailing-space warning in the spec is correct, but no spec regex depended on the trailing space. 80-column banners measured exactly 80 characters in all 123 captured banners, and `JUMP is …` lines are 79 characters wide. i386 vs x86_64 widths: there are no width-dependent regexes except `\d{4,}` and `{8,16}`, and both hold for i386 (`0x40800b5c`), x86_64 (`0x00002aaaab2abba0`) and mixed vmmap tables.

**Recommended evaluation order** (first match wins; this is the order in `fixed_regexes.cjs`): prompt → pager → banner/footer/legend/stop → EFLAGS → register → stack → arg → disassemble → disasm → jump lines → invalid/warning/error → checksec → xinfo fields → vmmap → hexdump → distance → search headers → pattern lines (`patternReg` before `patternOffset`) → ropsearch → jmpcall → x/ examine → xrefs → addr-colon-text → searchResult → chainLine → elf → kv → fd → gdb lines.

---

## 3. Real-world (native Linux) differences vs the qemu captures

These are checked against `review_samples/*.txt`. Regex hold means "do the corrected regexes still match".

| Area | qemu capture | Native PEDA (evidence) | Spec regex holds? |
|---|---|---|---|
| Stack / lib / PIE / heap addresses | `0x2aaaab2…`, PIE `0x5555…`, heap `0x4b5…` | x86_64 gdb default (ASLR off): stack `0x7ffffffde000-0x7ffffffff000`, libs `0x7ffff7…`, PIE `0x555555554000`, heap `0x555555559…`/`0x602…`. i386: stack `0xfffdd…`/`0xbfff…`, libs `0xf7…`/`0xb7…`, PIE `0x56555…`, heap `0x804b…`/`0x5655…` (RW: hexinuni, cspub, hardenedlinux) | Yes (address regexes are magnitude-free). **No** for the spec's `0x7ff[c-f]` = stack heuristic (§1.3) |
| PLT symbols | bare `call   0x5555555570f0` | `call   0x400400 <puts@plt>`, chain `(<puts@plt>:	jmp    QWORD PTR [rip+0x200be2]        # 0x601018)` (RW hexinuni). Static binaries' IFUNC slots show as `<*ABS*+0x4a0c10@plt>` | Yes. `<[^>]+>` accepts `@plt`, `*ABS*+…`. Note that `printf@plt` triggers PEDA's VULN bold-underline-red |
| libc symbols | none (stripped cross libc) | `0x7ffff7a2e830 (<__libc_start_main+240>:	mov    edi,eax)` | Yes |
| Overflow crash, x86_64 | `RIP: 0x4141464141304141 ('AA0AAFAA')`, `Invalid $PC address: 0x4141…`, `0x4141… in ?? ()` | `ret` faults first. RIP is in the binary, the code section shows `=> 0x4005f6 <main+70>:	ret`, the stack top shows the pattern, then `Stopped reason: SIGSEGV`, then `0x00000000004005f6 in main ()` | Yes. Only the "Invalid $PC" line disappears. RIP's annotation is code, not `('…')` |
| Overflow crash, i386 | same as native | `EIP: 0x41416d41 ('AmAA')`, `Invalid $PC address: 0x41416d41` (RW cspub 12) | Yes |
| Process start | `Remote debugging using :1234`, `Stopped reason: SIGTRAP` at `_start` | `Starting program: /path/bin args`, `[Thread debugging using libthread_db enabled]`, `Using host libthread_db library "…"`, `warning: Error disabling address space randomization…` (Docker), `(No debugging symbols found in ret2sc)` / old gdb `Reading symbols from x...(no debugging symbols found)...done.` | Add `gdbInfo`/`gdbBracket`/`gdbWarning` (done) |
| Exit / exec | `[Inferior 1 (process 865) exited normally]` | `exited with code 01` (two-digit octal), `process 7165 is executing new program: /bin/dash`, `[New process 7165]`, `[New LWP 1766]`, `[Detaching after fork …]` (RW dnstracer, Dvd848), then a shell prompt (`$ id`, `sh-4.3$`) | Spec regex OK for exit; bracket lines need `gdbBracket` |
| Frames | `… in printf ()` | `… in free () from /lib/i386-linux-gnu/libc.so.6`, `__GI_raise (sig=sig@entry=6) at ../sysdeps/unix/sysv/linux/raise.c:50`, then `50	../sysdeps/…: No such file or directory.`, `Backtrace stopped: previous frame inner to this frame (corrupt stack?)` (RW hardenedlinux) | **No** with spec regexes (§1.7); yes with the corrected ones |
| vmmap | `[stack]`, `[heap]`, `mapped`, cross paths | adds `[vvar]`, `[vdso]`, `[vsyscall]` (and `[vvar_vclock]` on 6.x kernels), `/usr/lib/x86_64-linux-gnu/libc.so.6`, `rw-s` shared maps, `… (deleted)`. For PIE+libs every address is 18 characters wide | Yes with `[rwxps-]{4}` and a free-text name |
| checksec | identical format | identical. Ubuntu packages commonly show `FORTIFY   : ENABLED` | Yes |
| `Stopped reason` | SIGTRAP on attach, SIGSEGV | SIGSEGV, SIGABRT, SIGILL, SIGFPE, SIGBUS, SIGINT (Ctrl-C), SIGTRAP (int3). Never shown for a breakpoint hit or a step (status `BREAKPOINT`/`UNKNOWN`, peda.py:385-409) | Yes |
| ropsearch bytes | `(b'5f5dc3')` (py3) | Python 2 era PEDA: `(5f5dc3)`. Blog copies often turn the TAB into spaces | Yes with the corrected regex |
| `procinfo`/`getpid`/`aslr` | qemu process; `aslr` prints nothing | real pid; `ASLR is OFF` (gdb disables ASLR) | Add `ASLR is (ON\|OFF)` (done in `pedaInfo`) |
| Old gdb (7.x) disasm | n/a | mnemonics padded with trailing spaces (`leave  `, `ret    `) | Yes with `[\t ]*$` |
| Web-copied pastes | n/a | `<sym>` stripped by HTML (`   0x080485a7 :	push`, `(:	test   eax,eax)`, `$1 = {} 0x3ab20 `), TABs turned into spaces, elisions such as `...`, `[...]` | Partially: see the tolerant disasm regex |
| Mixed debuggers | n/a | The nightmare "cookbook" writeup has PEDA and GEF blocks in the same fence (`[ Legend: Modified register \| Code \| Heap \| Stack \| String ]`, `$eax   : …`, `→`) | Block detection must not assume purity; unknown lines should render plain |

---

## 4. Missing coverage

**Present in the captures but not described (or described without a regex):**
* xinfo/xprint first-line chains (11 lines). `getpid` prints a bare number (`865`). `xinfo` on a non-address is followed by an empty line.
* `info frame` (7 lines/session), `info breakpoints` (table header `Num     Type …`, TAB-indented `	breakpoint already hit 1 time`), `info sharedlibrary`, the xmm/ymm union continuation lines of `info registers` (`  v4_float = {…}`, `  v16_int8 = {0x0 <repeats 16 times>}`, `}`): 175 lines in s1/s4.
* gdb's wrapped frame lines: `Breakpoint 1, vuln (` + `    src=0x… "…") at test.c:20`, `    at rv.c:10`, `    v=0x2000) at rv.c:10`, `Run till exit … b=0x2aaaab2abb88, ` (trailing space before the wrap). These depend on the terminal width, so expect them anywhere.
* The PEDA help/usage block printed after a usage error (`Display memory content …`, `Usage:`, indented usage lines), triggered for example by `telescope &gself 2`. Also gdb's `Undefined command: "echo1".  Try "help".` and `The program has no registers now.`
* With `pset option pagesize 0` (s3, r1), `telescope`/`context stack` output ends with an **empty line inside the context block**, before the footer. A block parser must not end a context at a blank line.
* With the default `pagesize` 25, a `telescope`/`context stack` of more than 25 rows contains `--More--(25/N)` lines in the middle of the stack listing. The user's answer to the pager also lands on that line.
* After SIGSEGV, `context reg` / `context code` **also print the stack section** (peda.py:4388), and every `context` call repeats `Stopped reason:` (s2 after `context stack 12`).

**Common PEDA output not captured (source-confirmed or seen in RW samples):**
* `crashdump` banners (`START OF CRASH DUMP`, `backtrace (innermost 10 frames)`, `END OF CRASH DUMP`), `tracecall`/`traceinst` trees (` dep:01 …`, `|-- arg[0]: …`), `elfsymbol` success (`Found 6 symbols`, `strlen@plt = 0x80483e0`; RW cspub), `pattern_arg`/`pattern_env` (`Set 1 arguments to program`; RW hardenedlinux), `skeleton` output (Python code), `nxtest`, `shellcode`, `assemble`, `pltbreak`, `goto`, `snapshot`, `session`, `peda help` listing (RW hexinuni), `searchmem` results in `[vdso]` with a bare-disasm annotation (`[vdso] : 0xf7fd8001 (inc    ebp)`; RW cspub 12).
* Value annotations for non-ASCII bytes: `('\x0c')` (RW aldaor). Truncated gdb strings `("AAA…yA"...)` (RW cspub 12). `EFLAGS: 0x10217` with RF set (5 hex digits; RW cspub 12; the regex holds).
* gdb watchpoint triggers `Hardware watchpoint 2: gcounter` / `Old value = 1` / `New value = 6`, `Core was generated by …`, `Missing separate debuginfos, use: …`, `Error in re-setting breakpoint 1: …`.

---

## 5. Heuristic risks and safe fallbacks

* **Use token classes that degrade.** Every chain element is at least `address` or `value`; refine only when the evidence is unambiguous:
  | Evidence | Class |
  |---|---|
  | Element that is not last (an arrow follows) | `address` (always true, peda.py:2140-2152) |
  | Last element with `symbol+disasm` or bare-disasm annotation | `address code` (exactly PEDA's "code" branch) |
  | Last element with `(MemError)` | `address rodata` (only produced in the read-only branch, peda.py:2123) |
  | Last element with self-reference `(0x0000…)` or `(--> ...)` | `address` |
  | Last element with gdb-string | `address string-target` (data or rodata cannot be told apart; keep the colour neutral) |
  | Last element with value-repr or no annotation | `value` |
  
  Do **not** emit `address-data`/`address-stack`/`address-heap` without a vmmap.
* **The first element of a stack row is a stack address only inside a `[---stack---]` section or after `telescope`/`stack` with no argument.** `telescope 0x4d3ff0` lists heap addresses. Inside the code section, `arg[N]:` first elements can be anything.
* **The RIP/EIP value is not necessarily code.** After a crash it is `('AA0AAFAA')`, a value. Classify by annotation, never by register name.
* **`<sym>` does not imply code.** `# 0x4aa0d0 <gcounter>`, `(<main_arena>)` in frames, and `x/gx` lines like `0x6b7a28 <__printf_function_table>:` are data. Only branch operands of `call`/`j*`, disassembly line addresses, and `symbol+disasm` annotations are code.
* **vmmap-in-block lookup is fine as a refinement, with guards.** Use it only if the table is in the same fenced block. Reject tables containing `rx-p` (offline, unrelocated). Treat everything as unknown if the table contains host-architecture maps (s6 degraded: `0x0000ffffcd990000 … [stack]` while the chain addresses are `0x2aaaab…`). Apply PEDA's rule order: writable → data, executable → code, otherwise rodata (peda.py:2077-2118).
* **Magnitude hints are opt-in at best**, and never `0x7ff[c-f]` → stack (§1.3). If they are kept, `0x7fffffff[0-9a-f]{4}`/`0x7ffc…`–`0x7ffe…` mean stack, `0x7ffff7…`/`0x7f[0-9a-e]…` mean libs, `0xff[89a-f]…`/`0xbf…` mean i386 stack, and `0xf7…`/`0xb7…` mean i386 libs. Even these are wrong under qemu, Docker with ASLR on, or ARM hosts.
* **Colours PEDA itself would not show.** The spec's mnemonic-class rules are close but differ in edge cases. PEDA takes the opcode as the token after the **last** `:` (utils.py:526 regex `.*(0x[^ ]*).*:\s*([^ ]*)`). So `jmp DWORD PTR ds:0x80e9000` is **not** yellow (verified in `s4_x86.ansi`: ` | 0x8049028:^[[m	jmp …`), and `mov rax,QWORD PTR fs:0x28` gets no class. Prefixed instructions `repz ret`, `bnd jmp`, `notrack jmp`, `lock cmpxchg` take the prefix as the opcode and get no colour. The spec's "`repz ret`→blue" is **false** (simulated with PEDA's regex). The VULN check is a **substring** test of the whole instruction text against the list at utils.py:484-488. That list includes `read`, `tmp`, `temp`, `exec`, `getc`, `recv`, so `call … <pthread_create@plt>` and `<__isoc99_scanf@plt>` are flagged too. A dim (before-PC) VULN call is dark red, not bold underline. Recommendation: highlight mnemonics by the conventional class (`j*` = jump and so on), not by PEDA's buggy rule, and document the difference.
* **Python repr vs gdb string ambiguity.** `("it's")` can be either. Classify by **form, not meaning**: double-quoted → `string`, single-quoted without `<repeats` → `string-value`. Only the last-element value/address decision depends on this, and both choices are harmless when the theme keeps `value` and `address` close.
* **Block detection (Ambiguity #14).** Add `^[\t ]*\[-{3,}` (leading space) and `^\d{4}\|[\t ]+(0x|Cannot)`. Accept `Legend: … value` with extra words. Mixed GEF/PEDA pastes exist, so scoring beats an all-or-nothing switch.

---

## 6. Lines shared with vanilla gdb (handle in a shared gdb base grammar)

Everything below is printed by gdb, not PEDA, and appears identically with or without PEDA (apart from PEDA's `set output-radix 0x10`, which makes `p` print hex, and `set disassembly-flavor intel`):

* Session: `Reading symbols from …` (`…(no debugging symbols found)…done.` on old gdb, `(No debugging symbols found in X)` on new), `Starting program: …`, `Remote debugging using …`, `The target architecture is set to …`, `Attaching to process N`, `Core was generated by …`, `Continuing.`, `Continuing with signal SIGX.`, `Run till exit from #0 …`, `Value returned is $N = …`, `Single stepping until exit …`, `[Inferior N (process N) exited normally|with code NN]`, `[New Thread/LWP/process …]`, `[Thread debugging using libthread_db enabled]`, `Using host libthread_db library …`, `process N is executing new program: …`, `The program no longer exists.`, `The program is not being run.`, `The program has no registers now.`, `Undefined command: …`, `No symbol table is loaded…`, `No shared libraries loaded at this time.`, `Cannot access memory at address 0x…`, `Backtrace stopped: …`, `Missing separate debuginfos …`, `Error in re-setting breakpoint …`.
* Stops: `Breakpoint N at 0x…[: file F, line L.]`, `Temporary breakpoint …`, `Hardware watchpoint N: expr`, `Old value = …`/`New value = …`, `Breakpoint N, [0x… in ]func (args) at f:l`, `Thread N "name" hit Breakpoint …`, `Program received signal SIGX, Desc.`, `Program terminated with signal SIGX, Desc.`, frame lines `0x… in f () [from lib|at f:l]`, `func (args) at f:l`, source lines `NN<TAB>text`, step echo `0x…<TAB>NN<TAB>text`, wrapped continuation lines (`    at …`, `    arg=…`).
* Lower-case `warning: …`, and gdb's own capitalised `Warning:` (deprecated `set logging` aliases, `Could not insert hardware watchpoint`).
* Data: `x/` examine (`0xADDR[ <sym>]:<TAB>values…`, `x/s` strings with `<repeats>`), `x/i` and `disassemble`/`Dump of assembler code …`/`End of assembler dump.`, `p`/`print` (`$N = …`, `(void *) 0x…`, `{int (int, char **)} 0x… <main>`, `[ IOPL=0 IF AF ]`), `info registers` (lower-case names + `{` unions), `bt` (`#N  …`), `info frame`, `info breakpoints`, `info sharedlibrary`.
* The *bodies* PEDA embeds come from gdb too: context disassembly lines are gdb `x/Ni` output (PEDA adds only `=> `/` | `/` |->`/7-space prefixes and colour), and `("…")` annotations are gdb `x/s` output. A shared gdb grammar should therefore export its instruction, operand and gdb-string tokenisers for the PEDA grammar to reuse.

PEDA-only: the prompt `gdb-peda$`, `[---name---]` banners and footer, `Legend:`, `Stopped reason:`, upper-case register lines and `EFLAGS: 0x… (flag words)`, `NNNN| ` rows, ` | `/` |->`/`JUMP is …`, `Guessed arguments:`/`arg[N]:`/`No argument`, `Invalid $PC|$SP address`, `Warning:`/`Error:` from PEDA, and the outputs of checksec, vmmap, xinfo, hexdump, distance, searchmem/refsearch/lookup/strings, pattern, ropgadget/ropsearch/asmsearch/dumprop/jmpcall, elfheader/readelf/elfsymbol, pshow, procinfo, getpid, skeleton and help.

---

## Citation spot-check (52 checked, all accurate)

utils.py: 107-129, 113-116, 150-152, 194-198, 206-216, 247-271, 290-296, 330-349, 446-455, 457-481, 484-488, 490-563, 504-510, 549-557, 565-603, 863-879.
peda.py: 54-60, 111/126, 385-409, 1142-1150, 1480-1490, 2092-2096, 2123, 2128-2154, 2175-2189, 2545-2547, 3037-3047, 3339-3380 (3348 `< 0x7e` confirmed), 3396-3398, 3445-3446, 3539, 3570-3586, 3842-3861, 4253, 4279, 4292-4316, 4324, 4340, 4346, 4350-4397, 4446-4454, 4654, 4748, 4760-4768, 4781-4802, 4833-4851, 4865-4870, 4914, 5009-5014, 5024-5037, 5116, 5159, 5212, 5233-5235, 5273, 5301-5317, 5350-5414, 6121-6124, 6145-6146, 6153-6154.

Every cited line produces the claimed format. Minor imprecisions:
* §0 attributes the `ESC[m` per-line wrapper to `msg` (utils.py:194-198). It actually comes from `colorize()` with no colour (utils.py:107-132), which `msg` calls.
* Section 7's "`repz ret`→blue" contradicts the code it cites (see §5).
* §16 omits that `refsearch`/`lookup` use the same result formatter (peda.py:2161-2197), and that `format_search_result` truncates library names at the first `-` only when the basename starts with `lib` (`libc.so.6` stays `libc.so.6`; `libc-2.27.so` becomes `libc`).
