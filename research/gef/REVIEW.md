# Adversarial review of SPEC.md (GEF plain-text output)

Reviewer method
* I re-read the cited `build/gef.py` code. I ran every rule in `build/gef_line_regexes.mjs` against every line of every capture (first-match and every-rule overlap). I also ran them against whitespace-mutated copies (tabs expanded, trailing spaces trimmed, CRLF) and against the pwndbg and PEDA captures.
* **New captures** came from a throwaway container `review-gef-main` (since removed) built from `research-gef-img`:
  * aarch64 native, dynamic PIE, non-PIE and stripped builds. The test program fills the small and large bins, calls `printf(fmt)`, and the binary was copied to `/t` so `got` works.
  * i386 static via `qemu-i386` + `gef-remote --qemu-user`.
  * GEF releases **2021.10, 2023.06 and 2024.06 actually run** under GDB 15.1 / Python 3.12 (2022.06 loads but mis-detects arm64 as 32-bit, so only its format strings are usable).
  * The transcripts are in the scratchpad (`/private/tmp/claude-501/-Users-ott3r-tmp-obsidian-plugin/e27bd0c1-a604-4542-b4ef-de24fec957ae/scratchpad/rv/{cap,old_*}`), which may be cleaned up. Every example below is quoted verbatim so this file stands alone.
* "orig" means `captures/`. "new" means the review captures.

---

## 1. Critical errors (spec claims that are wrong)

| # | SPEC claim | What is actually true | Evidence |
|---|---|---|---|
| C1 | §14 `got` regex `/^\[(0x…)\] (\S+) → (0x…)$/`; entries described as "`name → target`" | `build_line` formats `f"{name} {RIGHT_ARROW} {hex}"` and RIGHT_ARROW is already `" → "`, so the separator is **two spaces each side**. The spec regex matched **0 of 41** real GOT entries (current, 2021.10, 2023.06 and 2024.06 all agree). | gef.py:10744-10745; new `got`: `[0xaaaaaaabffa8] puts@GLIBC_2.17  →  0xfffff7e619d0` |
| C2 | §4 segment-line regex "`register-segments`" | It is **dead code**: `register-line` (`/^(\$[a-z][a-z0-9]*)\s*: (.*)$/`) comes first in the rule list and swallows `$cs: 0x33 $ss: …`. Every x86 segment line (orig + new i386) is mis-tagged as one register named `$cs` whose value is `0x33 $ss: 0x2b …`. | overlap run: `register-line > register-segments` |
| C3 | §13 "GEF ≤ 2022.06 printed … `! PREV_INUSE` … (gef-2021.10.py:1216-1224 is the same)" | 2021.10 is **not** the same: it never emits `! PREV_INUSE`. A clear P bit gives an **empty** `flags=`. Only 2022.06 adds `! PREV_INUSE`. | gef-2021.10.py:1215-1223 vs gef-2022.06.py:1647-1658; 2021.10 run: `Chunk(addr=0xaaaaaaac1aa0, size=0x20, flags=)` |
| C4 | §6/§7/§16 "GEF's code pane and deref chains use 4-digit zero-padded hex (`<main+0018>`), not GDB's decimal" (stated version-free; §20 says the code pane is unchanged since 2021.10) | That only holds from **2024.06**. 2021.10 through 2023.06 use **decimal**: `location = "<{}+{}>"` (gef-2023.06.py:2024). Observed in 2023.06: `→ 0xfffff7e619d0 <puts+0>  stp …`, `$pc : … →  <main+272> ldr w0, …`. Blog-era pastes therefore show `<main+272>` where current GEF shows `<main+0110>`. The two are visually ambiguous (`+0110` is hex 272), so never treat a GEF offset as decimal. The inline "GEF symbol" regex `\+[0-9a-f]{4}>` also misses offsets ≥ 0x10000 (`{:04x}` widens to 5+ digits) and every pre-2024 line. | grep `location = ` in oldgef/*; 2023.06/2024.06 runs |
| C5 | §13 tcache format `Tcachebins[idx=I, size=0x.., count=N] ←  …` (version-free) | ≤ 2021.10 prints `Tcachebins[idx=14, size=0x100] count=7  ←  Chunk(…)`, with count **outside** the brackets. The spec regex returns null. | gef-2021.10.py:7234; 2021.10 run |
| C6 | §13 bin titles `Fastbins for arena at 0x…`, `Unsorted Bin for arena at 0x…` (version-free) | 2021.10: `Fastbins for arena 0xfffff7fa0a50`, `Unsorted Bin for arena 'main_arena'`, `Small Bins for arena 'main_arena'`. | gef-2021.10.py:7338, 7390; 2021.10 run |
| C7 | §13 Arena regex `…mem=(\d+), mempeak=(\d+)\)` (only form given) | There are three historical forms. ≤ 2022.06: `…, next=0x…, next_free=0x…, system_mem=0x…)`. 2023.06: stops after `next=0x…)`. ≥ 2024.06: `mem=N, mempeak=N` (decimal). | gef-2022.06.py:1472-1474, gef-2023.06.py:1371-1373 |
| C8 | §13 `heap chunk X` = Chunk line + sizes + "a bare flags line" | ≤ 2022.06 prints three lines, `PREV_INUSE flag: On` / `IS_MMAPPED flag: Off` / `NON_MAIN_ARENA flag: Off`, which **carry the flag state in plain text**. This contradicts §17.2 "only the old Chunk(...) format shows the state". A free chunk is followed by **two** blank lines (`"\n\n"` joined with `"\n"`), not one. | gef-2022.06.py:1597-1601; 2021.10 run; new `heap chunk s1` |
| C9 | §17.3c range priors (x86_64 stack `0x7ffc…–0x7fff…`, libs `0x7f…`, non-PIE binary `0x40…`, aarch64 stack `0xfffffff…` vs libs `0xfffff7…`, heap "right after the binary") | These misfire on common real layouts. Under GDB's default (ASLR **off**) x86_64 libs are `0x7ffff7…` and the stack is `0x7ffffffd…`, so **both** start `0x7fff`. A non-PIE heap starts right after .bss and so shares the `0x4…` prefix (new aarch64 non-PIE: `[heap]` = `0x421000`). With ASLR on, arm64 libs (`0xffff9aba…`) and stack (`0xffffe6af…`) share `0xffff`, and the heap is **not** adjacent to the binary (`0xaaaad446…` binary vs `0xaaaafbf2…` heap). i386 under qemu-user has its stack at `0x40001000-0x40801000`. See §4 below. | new runs (vmmap with `aslr on`, `t2_nopie`, i386) |
| C10 | §14 `got`: "titlify(`<file>`), blank line, …" (version-free) | 2021.10 and 2023.06 print **no title**, only the blank line. The title appears from 2024.06. 2022.06 also emits `[*] gef-2022.06.py:L8817 'checksec' is deprecated …` before the table. | 2021.10, 2023.06 and 2022.06 runs |
| C11 | §7 / §11 / §8 / §10 items marked "source-only" (`show_opcodes_size`, extra pane, known-symbol args pane, `[loop detected]`, trace with no symbol, `grow_stack_down`) | All of these are now **observed**, and several break the spec regexes (see §2). Notably the trace with no symbol is `[#0] 0xaaaaaaaa084c → mov x5,  x0`. With no symbol at all the `<sym+off>` part is absent; when present it is **unpadded** hex (`<sym+1a>`, gef.py:9340), unlike everywhere else. | new stripped-binary run |
| C12 | §7 code location and §6 GEF-symbol token assume `<[^>]+>` | GEF's location comes from `info symbol`, which is demangled (gef.py:2398-2409). C++ names contain `<`, `>`, spaces and parentheses, so `<[^>]+>` truncates them and the whole code-line regex returns null. Use `<.*?\+[0-9a-f]+>` (GEF always appends `+off>`). | synthetic test (section 2, item R5) |
| C13 | §0.4 / §17.11 "regexes use `\t` only where GEF guarantees it; in the plugin relax to `[\t ]+`" | The shipped regexes are **not** relaxed. One-line relaxation is also unsafe: after a tab→space conversion, **29** GEF source lines become `args-entry` (`     26       op_fn fp = add;`), because `args-entry` matches any 3+ space-indented `x = y` (see R7). | xform run |
| C14 | §0.2 / §6 "`("…"?)` hint regex `/ \("(.*)"\?\)$/`" | It is anchored at `$`, so it fails on deref and telescope lines, where the hint is followed by `\t ← $sp`: `0x…│+0x0000: 0x… →  0x4f480032742f742f ("/t/t2"?)	 ← $sp`. GEF also does not escape quotes or control characters, and literal backslash escapes appear: `("""?)`, `(" \t"?)`, `("8\f"?)` (new `scan`). The string-token regex mis-pairs `"""`. | new captures |

Minor citation and wording errors (non-blocking)
* `titlify` is at gef.py:**2081-2093**, not 2066-2088 (line 2066 is `reveal_ptr`).
* `highlight add` is at gef.py:**10883**, not 10830.
* RISC-V `[Reason: …]` contains the evaluated operands (`f"{rs1}={rs2}"`, gef.py:2931-2934), not the literal text `rs1<rs2`.
* §7 says "3 previous and 6 following instructions". `nb_lines_code=6` *includes* the current one, so captures show 3 + 1 + 5 = 9 lines.
* `format_address` is `0x%08x` on 32-bit targets (gef.py:4517). §4, §5 and §12 say `0x%016x` without qualification. i386 example: `$ebx   : 0x080e4ff4  →  0x00000000`, `0x40800c50│+0x0000: …`.
* The `gdb-bt-cont` rule (`/^\s{4}(?:at |src=)/`) is over-fitted to the test program's argument name `src=`.

Citation spot-check: 38 citations checked; 34 correct and 4 wrong or misleading (the two line-number errors plus the RISC-V wording and the 32-bit format width above).

| Verified OK | gef.py lines |
|---|---|
| arrows and glyphs | 151-159 |
| colors | 588-605 |
| `Address.__str__` / text segment | 683-711 |
| `Instruction.__str__` / opcodes | 1467-1486 |
| Arena `__str__` | 1683-1689 |
| ChunkFlags | 1827-1845 |
| Chunk `__str__` / `psprint` | 2024-2036 |
| messages | 2096-2119 |
| `style_byte` / hexdump | 2210-2265 |
| `flags_to_human` | 2610-2619 |
| canary | 6051 |
| theme defaults | 6246-6287 |
| search-pattern | 6929-6942, 7093 |
| top chunk | 7715/7744 |
| `pprint_bin` | 7808-7820 |
| tcache | 7905-7944 |
| fastbins | 8137 |
| layout | 8720 |
| legend | 8757-8771 |
| `-` pane skip | 8799-8800 |
| `context_title` | 8827-8848 |
| raw registers | 8863-8921 |
| raw stack | 8929-8931 |
| TAKEN | 8997-9005 |
| preview | 9015-9027 |
| `Cannot disassemble` | 9030 |
| arguments | 9071-9093, 9156-9168 |
| source | 9171-9243 |
| trace / threads | 9281-9431 |
| memory pane | 9453 |
| deref | 9900-9973, 9990-10019 |
| vmmap | 10163-10249 |
| xinfo | 10325-10365 |
| pattern | 10580-10652 |
| checksec | 10691-10719 |
| got | 10731-10800 |
| prompt | 12206-12212, 13053-13060 |
| failed-command message | 5406-5408 |

---

## 2. Regex failures (tested), with corrections

Corpus: orig (3,573 lines) + new (85 files) + old-release runs. Total 6,608 lines. Unmatched lines: **311 with the spec rules → 176 with the corrected rules**. The remaining 176 are xmm blocks, program stdout and GDB `info frame` / `info sharedlibrary`, which are out of scope. The corrected rules caused no regressions on any capture.

| # | Rule | Problem | Count / example | Corrected regex (tested) |
|---|---|---|---|---|
| R1 | `got-entry` | Two-space arrow (C1) | 41/41 missed: `[0xaaaaaaabff98] __gmon_start__  →  0x0` | `/^\[(0x[0-9a-f]+)\] (\S+) +→ +(0x[0-9a-f]+)$/` |
| R2 | `register-segments` | Shadowed by `register-line` (C2) | every `$cs: …` line | Move it **before** `register-line`: `/^(?:\$[a-z]s: 0x[0-9a-f]+ ?)+$/` |
| R3 | `register-line` | No `_` allowed in register names; the raw-mode `Flags:` line is not covered (the spec regex exists but is not in the .mjs); raw mode puts 4 `$reg: val` pairs on one line, so the tokenizer must loop rather than treat everything after the first `: ` as one value | `Flags: [negative ZERO …]` → null; `$x0  : 0x0000aaaaaaaa0af8 $x1  : 0x0000aaaaaaac2400 $x2  : 0x1011  …` | `/^(\$[a-z][a-z0-9_]*)\s*: (.*)$/` + `/^Flags: \[(.*)\]$/` |
| R4 | `deref-line` | `scan` prefixes each deref line with `<section path>: ` (or one space) | 31 missed: `[stack]: 0x0000ffffffffed50│+0x1fd50: 0x0000fffff7e0efe5  →  "ld-linux-aarch64.so.1"` | `/^(?:(\S.*?): \| )?(0x[0-9a-f]+)│([+-]0x[0-9a-f]+): ?(.*?)(?:[\t ]+← (\$\w+(?:, \$\w+)*))?\s*$/` |
| R5 | `code-line` | (a) `context.show_opcodes_size` inserts an opcode column; lines whose opcode starts with a-f get that hex as the mnemonic, the rest are null. (b) C++/demangled `<…>` names. (c) The `(bad)` mnemonic. (d) Tabs required before TAKEN. | 9/9 opcode lines missed: `   0xaaaaaaaa0a5c 00000090    <main+0104>      adrp   x0,  0xaaaaaaaa0000`; `0x401020 <_init+0020>      (bad)` → null | `/^([● ])(→\| ) {1,3}(0x[0-9a-f]+)(?: ([0-9a-f]{2,}(?:\.\.\.)?)(?= {3}))? +(<.*?\+[0-9a-f]+>)? *([a-z(][\w.()]*)(?: +(.*?))?(?:[\t ]+(TAKEN\|NOT taken)(?: (\[Reason: .*\]))?)?\s*$/`. Opcodes are recognized by *exactly one* space plus hex after the address, because without opcodes the address is followed by ` <` or 17+ spaces. |
| R6 | `code-line` vs `code-target-line` | The two are distinguished only by indentation, and that breaks for addresses shorter than 8 characters (< 0x100000, e.g. firmware or real mode): `        0x1000      nop` is classed as a branch-preview line. The indentation is `3 + max(0, 10 - len(addr))`. | synthetic | In Prism, match the preview as one **multi-line block** anchored on `↳`: `/^ {3}↳ .*(?:\n {6,}0x.*)*/m`. Otherwise keep `{1,3}`. |
| R7 | `args-entry` | `[\w ]+?` also eats leading spaces, so it matches GDB `bt full` locals (8-space indent), tab-expanded GEF source lines and PEDA text. It misses i386 guessed args (`[sp + 0x0] = …`) and pointer types (`const char * s = …`). | 29 tab-expanded source lines; pwndbg `bt full`: 39 false positives (`        fp = 0xaaaaaaaa0918 <add>`); PEDA: 4 | `/^ {3}(?! )(\$\w+\|\[sp \+ 0x[0-9a-f]+\]\|[^=]+?) = (.*?),?$/`. Better: only apply it between an `args-open` line and `)`. |
| R8 | `args-open` | `name (<void>)` (no-argument known symbol, gef.py:9089) | becomes `gdb-frame-nopc` | add `/^(\S+) \(<void>\)$/` before the GDB frame rules |
| R9 | `hexdump-word` | Misses the symbol column and the ASCII column (`hexdump.always_show_ascii`). The offset is always `+` (`+{:#06x}`). | 4/4 missed: `0x0000aaaaaaac0010│+0x0000   <global_buf+0000> 0x64206c61626f6c67   ` | `/^(0x[0-9a-f]+)│\+(0x[0-9a-f]+) {3}(<.*?\+[0-9a-f]+> )?(0x[0-9a-f]+)(?: {3}(.*))?\s*$/` |
| R10 | `config-line` | Keys contain `-` and spaces, and there is a `(Path)` type | **18/82 (22%)** of full `gef config` lines missed: `heap-analysis-helper.check_uaf (bool) = True`, `pcustom edit.struct_path (Path) = /tmp/gef/structs` | `/^([\w.-]+(?: [\w.-]+)?) \((\w+)\) = (.*)$/`. Add `Description:` / `\t…` lines (from `gef config <one key>`) **after** `gdb-info-bp`, because GDB's `\tbreakpoint already hit` also starts with a tab. |
| R11 | `heap-tcachebin`, `heap-arena`, `heap-chunk-detail` | Old formats (C5, C7, C8) | 2021.10 tcache line, 3 Arena forms, `PREV_INUSE flag: On` | `/^Tcachebins\[idx=(\d+), size=(0x[0-9a-f]+)(?:, count=(\d+)\]\|\] count=(\d+))(.*)$/`; `/^Arena\(base=(0x…), top=(0x…), last_remainder=(0x…), next=(0x…)(?:, next_free=(0x…), system_mem=(0x…)\|, mem=(\d+), mempeak=(\d+))?\)$/`; add `(?:PREV_INUSE\|IS_MMAPPED\|NON_MAIN_ARENA) flag` to the detail alternation |
| R12 | (missing) | `All tcachebins are empty` (gef.py:7944) is in the prose but has no rule. `heap chunks --summary` output has none either. | null | `/^(All tcachebins are empty\|== Chunk distribution by (?:size\|flag) ==\|ChunkBytes\tCount.*\|Flag +\tTotalCount.*\|\d+ +\t\d+ +\t\d+ +\t.*\|(?:PREV_INUSE\|IS_MMAPPED\|NON_MAIN_ARENA) +\t\d+ +\t\d+)$/` |
| R13 | `source-line` | Hard `\t`; and trailing-space trimming turns an empty source line `     29\t ` into `     29` | tab→spaces: **285** lines missed; rtrim: 50 missed | `/^([● ])(→ \|  ) *(\d+)(?:[\t ]+(.*))?$/`. It must come after code, register and deref rules. It also matches pwndbg's source pane, which is acceptable in a shared grammar. |
| R14 | `gdb-x-insn`, `gdb-x-mem`, `gdb-addr-source`, `gdb-source-line` | Hard `\t` | tab→spaces: 278 + 22 + 5 + 19 lines become null | Replace `\t` with `[\t ]+`. For `gdb-source-line` use `(?:\t\| {2,})` and place it **after** `gdb-info-bp`; otherwise `1       breakpoint  keep y` matches (a regression I hit while testing). |
| R15 | `section-header` | `context_title` uses `max(cols - len - 6, 0)`. On a narrow terminal, or with a long `source:` title, the leading run is empty and the line starts with a space. | ` registers ────` → null | `/^(─*) (\S.*?) (─+)$/` |
| R16 | `gdb-bp-hit` / `gdb-bt` | (a) GDB **itself** wraps long frame lines at `width`; the spec only mentions terminal wrapping. (b) Multi-threaded targets print `Thread 2 "x" hit Breakpoint 1, …`. (c) C++ names contain spaces. | orig `#7  0x0000aaaaaaaa09f4 in vuln (` + `    src=…") at test.c:22`; new (60 cols): `Breakpoint 1, compute (f=0xaaaaaaaa0918 <add>, x=0x6, ` / `    y=0x7) at test.c:14` | `/^(?:Thread \d+ "[^"]*" hit )?(?:Temporary breakpoint\|Breakpoint) (\d+), (?:(0x[0-9a-f]+) in )?(.+?) \((.*)\)?(?: at (\S+):(\d+))?\s*$/`; continuation `/^ {4}(?:at \S+:\d+\|from \S+\|[\w.@]+=.*)$/` |
| R17 | (missing) | GDB `warning:` lines. Every stop inside libc without sources produces one. | 10 lines: `warning: 35\t./libio/ioputs.c: No such file or directory` | `/^warning: (.*)$/` |
| R18 | all | A CRLF paste makes **every** `$`-anchored rule fail (1,617 register lines and so on). | xform run | Strip `\r` before matching, or use `\r?$`. |

---

## 3. Missing coverage

**A. Present in the orig captures but not described in SPEC.md**
* `gef config <key>` single-key form: titlify `GEF configuration setting: <key>`, the value line, a blank line, `Description:`, then a TAB-indented description.
* `warning: N\t<path>: No such file or directory` (GDB).
* GDB-wrapped `bt` / bp-hit continuation lines (R16).
* The 2021.10 banner variant: `91 commands loaded for GDB 15.1 using Python engine 3.12` and `[*] 5 commands could not be loaded, run `gef missing` to know why.`

**B. Formats now captured (new) that SPEC.md lacks or marks source-only**

| Output | Verbatim sample |
|---|---|
| `got` (dynamic) | title `── /t/t2 ──`, blank, `GOT protection: Full RelRO \| GOT functions: 10`, a line containing **one space**, then `[0x…] name@GLIBC_x  →  0x…`. Unresolved entries point inside the binary (yellow); `__gmon_start__  →  0x0` |
| populated small/large bins | `[+] small_bins[15]: fw=0xaaaaaaac1ab0, bk=0xaaaaaaac1990` / ` →   Chunk(…)   →   Chunk(…)` (multiple chunks on **one** line, joined by 3 spaces) / `[+] Found 2 chunks in 1 small non-empty bins.`; `[+] large_bins[79]: …`. A failure prints `[*] Invalid backward and forward bin pointers(fw==bk==NULL)` (gef.py:7795) |
| free `heap chunk` | `Forward pointer: 0xfffff7fa0ba0` / `Backward pointer: 0xaaaaaaac1ab0` after **two** blank lines |
| `heap chunks --summary` | TAB-separated table (R12) |
| bad arena | `[!] Invalid arena: Cannot access memory at address 0x0` / `Arena Address: 0xaaaaaaaa0000` (no rule; `elfinfo-field` needs a space before the colon) |
| `checksec` non-PIE / i386 | `PIE  : ✘ `, `RelRO : Partial`, canary `(value: 0xb7635c00)` (32-bit) |
| `scan` | `[+] Searching for addresses in 'stack' that point to 'libc'` then `[stack]: <deref line>` (R4) |
| `format-string-helper` | `[+] Enabled 5 FormatString breakpoints`, preceded by 5 **empty lines**. Its hit goes to the **extra** pane: `── extra ────`, `[*] Format string helper`, `Possible insecure format string: printf('$x0'  →  0xfffffffffb68: '%p %p %p\n')`, `Reason: Call to 'printf()' with format string argument in position #0 is in page 0xfffffffdf000 ([stack]) that has write permission` |
| `memory watch` | `[+] Adding memwatch to 0x…`; context pane `── memory:0xfffffffffae0 ────` with hexdump-qword lines (`0x…│+0x0000   0x0000fffffffffd38   `) |
| `context.layout` edits | panes disappear; with `legend` removed the first line is the `registers` header |
| `show_registers_raw` | 4 `$reg : value` pairs per line + `Flags: […]` |
| `show_stack_raw` | stack pane in hexdump-byte form |
| `show_opcodes_size 4` | see R5 |
| `grow_stack_down` | stack lines in reverse order (`+0x0038` first) |
| `gef.disable_color 1` | no context legend and no vmmap legend; vmmap output ends without a trailing blank line; the prompt is bare `gef➤  ` (no `(qemu)`) |
| `vmmap $sp` / `--name` | ``[*] `$sp` has no type specified. We guessed it was an address filter.``, ``[addr = `$sp` (0xfffffffffae0)]``, `[name = 'libc']` |
| `hexdump` with symbols | byte: `0x… <global_buf+0000>    67 6c …    global data stri`; word: R9 |
| `dereference -r` | negative offsets observed: `0x0000fffffffffa90│-0x0020: …	 ← $x29, $sp`. Pressing Enter repeats the command with an **empty prompt** (`gef➤  `) and continues the offsets |
| deref instruction with no symbol | **3 spaces** after the arrow and a trailing space: `$pc  : 0x0000aaaaaaaa0840  →   nop `, `→   .inst 0x464c457f ; undefined` (gef.py:9945; the location is empty) |
| stripped binary | code lines with no `<sym>`, threads `in ?? ()`, trace `[#0] 0x… → mov x5,  x0`, `entry-break`: `[*] PIC binary detected, retrieving text base address` / `[+] Breaking at entry-point: 0x…`, GDB `Stopped due to shared library event (no libraries added or removed)`, `(No debugging symbols found in …)` |
| i386 | `code:x86:32`; 4-space code indent and 7-space preview indent; known-symbol args pane `compute (` / `   op_fn var_0 = 0x08049865 → <add+0000> endbr32 ,` / `)`; `[loop detected]`: `0x080e9380  →  0x080e9380  →  [loop detected]`; `$cs: 0x23 … $gs: 0x33 ` |
| misc one-liners | `aslr` → `ASLR is currently disabled`; `pie info` → `VNum    Num     Addr              `; `print-format` → `buf = [0xfd38, …]`; error `[!] Command 'hexdump byte' failed to execute properly, reason: Cannot convert value to long.` (`hexdump byte main`; it needs `&main`); `[!] Unmapped address: '0x40'`; `[!] invalid registers for architecture: …`; `[!] Could not find heap for arena` (i386 static) |

**C. Still not captured** (common in pastes; documented here from source only)
* `heap bins` with fastbin corruption: `[incorrect fastbin_index] `, `← [Corrupted chunk at 0x…]`, and `[!] Corrupted heap, cannot continue.` (gef.py:7720). 2022.06 printed `Tcachebins[idx=1, size=0x18, count=0] ←  [Corrupted chunk at 0xaaac18a0]` when it misparsed.
* `heap-analysis-helper` messages.
* `trace-run`, `pcustom`, `xor-memory`, `patch`, `nop`, `stub`, `process-status`, `ksymaddr`, `gef-remote` (non-qemu) and its `(remote)` prompt, `(core)` prompt, `gef.debug` `[=]`.
* `theme` listing; it has the same `name (type) = value` shape as `gef config theme`.
* **x86_64 native** (only qemu-user was captured): `0x7ffff7…` layouts, `$fs_base`/`$gs_base` are not in `all_registers`, AVX regs in `info registers`.
* gef-extras commands (`ropper`, `syscall-args`, `windbg`). These are common in blog pastes and are completely unmodeled.
* **2022.06**'s `flags=! PREV_INUSE|IS_MMAPPED` mix and its deprecation warnings were seen only on a misdetected run.
* Hard-wrapped pastes. The pty transcript keeps logical lines, but copying from tmux, screen or Windows conhost inserts newlines at the terminal width, splitting long register, tcache and deref lines. The continuation fragments have no anchor; the highlighter should degrade to inline token rules (addresses, arrows, `Chunk(…)`) when no line rule matches.

**D. GEF version matrix for highlighter-relevant text** (verified by running each release)

| Item | 2021.10 | 2022.06 | 2023.06 | ≥2024.06 / main |
|---|---|---|---|---|
| insn location | `<puts+0>` dec | dec | dec | `<puts+0000>` hex |
| tcache | `[idx=…, size=…] count=N` | `count=` inside | inside | inside |
| fast/unsorted title | `for arena 0x…` / `'main_arena'` | `at 0x…` | `at` | `at` |
| chunk flags | set names, `\|`-joined; empty if none | + `! PREV_INUSE` | 3 names, ` \| ` | 3 names |
| heap chunk flags | `X flag: On/Off` ×3 | same | bare line | bare line |
| Arena | `next_free=, system_mem=` | same | ends at `next=` | `mem=, mempeak=` |
| got title | none | none (+ deprecation warn) | none | titlify(path) |
| remote prompt | none | `(remote) ` | `(remote) ` | `(qemu)`/`(remote)`/`(rr)` |
| `$cpsr` flags | `[negative ZERO CARRY overflow interrupt fast]` | | `[… endian fast t32 m[4]]` | same |

---

## 4. Heuristic risks (address classification)

Where the spec priors misfire (evidence from the new runs):
1. **x86_64 with ASLR off (GDB default):** libc, ld.so and vdso sit at `0x7ffff7…` and the stack at `0x7ffffffd…–0x7ffffffff000`. A prefix rule `0x7ff[c-f]` → stack mis-tags every libc pointer as stack. A rule on `0x7f` → libc mis-tags every stack address.
2. **Non-PIE heap:** the heap follows .bss directly, e.g. x86_64 `0x405000`-ish. aarch64 measured `[heap] 0x421000-0x442000` with the binary at `0x400000`. The orig x86_64 static capture has its heap at `0x4b2000`. "`0x40…` = binary" therefore paints heap chunks as code or data.
3. **aarch64 with ASLR on:** binary `0xaaaad446…`, heap `0xaaaafbf2…` (not adjacent), libc `0xffff9aba…`, stack `0xffffe6af…`. Libs and stack share `0xffff`. Kernels with a 39-bit VA (Android, many Raspberry Pi builds) put everything at `0x7f…`.
4. **Non-main arenas and mmapped chunks** (threads, large malloc) live at `0x7ffff0…` / `0x7fffe…` (x86_64) or `0xffffe…`. A prior tags them libc or stack, yet `Chunk(addr=…)` says heap.
5. **32-bit:** native non-PIE binaries are `0x0804…`, PIE `0x5655…`, libs `0xf7…`, stack `0xff…`. qemu-user i386 put the stack at **`0x40001000-0x40801000`** and vdso at `0x40801000`. qemu-user x86_64 stack is `0x2aaaab2a…`. The degraded qemu map makes **everything** "valid".
6. **GEF itself does not color libc data**, only `.text` and executable mappings of the main binary (gef.py:697-702). So "libc `0x7f…` → code" over-colors data pointers relative to the real output.
7. Kernel addresses (`0xffffffff8…`, `0xffff8000…`) would fall into the aarch64 "stack" prior.

Safe fallbacks, in order:
1. **Paste-local map first.** Use `vmmap` rows (exact), xinfo `Page:`/`Pathname:`, `[name = …]` blocks, and `search-pattern`'s `In '<path>'(0xstart-0xend)`.
2. **Structural anchors.** Values in the `$sp/$rsp/$esp` register line and slot addresses carrying `← $sp` are stack. `Chunk(addr=)`, `fw=`/`bk=` and `Arena(top=)` are heap. An address followed by ` →  <sym+off> insn` or ` →   insn`, and code-pane addresses, are code. The section filename in `scan` lines (`[stack]: …`) is authoritative.
3. **Cluster by proximity to anchors.** Treat an unknown address as the same region as an anchor if it lies within, say, ±16 MiB and shares the anchor's high bits above bit 24 or so. This works for every layout above without arch-specific constants.
4. **Otherwise emit plain `address`.** Never use numeric-range priors without an arch signal, and if used at all, gate them on the arch seen in the paste (`$rax`/`$x0`/`$eax`, the `code:` title) plus `ASLR is currently …` output. Even then prefer `address`.
5. **Changed-register diffing** (§17.1) is fine, but only between two contexts that both show the same register set. Raw mode and `registers $x0 …` subsets break naive index-based diffs.

---

## 5. Lines shared with vanilla GDB and pwndbg (shared base grammar)

Running the GEF rules on `research/pwndbg/captures` and `research/peda/captures` shows which rules are not GEF-specific.

* **Identical GDB output in all three tools** (put these in a shared `gdb-base` grammar; first-match conflicts were found only as noted):
  * `Breakpoint N at …` / `Breakpoint N, …` / `Temporary breakpoint …` / `Thread N "x" hit …`
  * `Program received|terminated with signal …`, `[Inferior N (process P) exited …]`
  * `#N  0x… in f (…) at file:line` + wrapped continuations, `0x… in f ()`, `f (args) at file:line`
  * source `N\t…` and `0x…\tN\t…`
  * `x/i` and `disassemble` (`=> `/`   ` + `<+N>:` + TAB), `x/gx`, `x/s` (`0x…:\t…`)
  * `$N = …`, `info registers` (including the multi-line `{ v4_float = … }` xmm blocks, which no tool's rules cover), `info breakpoints` (+ `\tbreakpoint already hit N time`), `info frame`, `info sharedlibrary` (`From                To                  Syms Read   Shared Object Library`)
  * `Continuing.`, `Starting program:`, `Run till exit from`, `Value returned is $N = …`, `warning: …`, `[Thread debugging using libthread_db enabled]`, `Using host libthread_db library …`, `Reading symbols from …`, `(No debugging symbols found in …)`, `Stopped due to shared library event …`, `Error while writing index for …`
* **GEF rules that also fire on other tools' output** (so they cannot be used to auto-detect GEF):
  * `code-line` matches **161** pwndbg code-pane lines (`   0xaaaaaaaa0adc <main+8>     add    x29, sp, #0xc0`).
  * `section-rule` matches pwndbg's closing rule.
  * `args-entry` (spec version) matches 39 pwndbg `bt full` locals and 4 PEDA lines (R7).
  * `elfinfo-field` matches PEDA's `R8 : 0x0 ` register lines (41).
  * the relaxed `source-line` matches pwndbg's source pane (`   18 void vuln(...)`).
  * `gdb-frame-nopc` matches PEDA's `0x4b5900 ("heap string AAAABBBB")`.
* **GEF-unique discriminators** (safe for tool detection):
  * the `gef➤` prompt, `[ Legend: Modified register | Code | Heap | Stack | String ]`
  * `──…── title ────` with exactly 4 trailing `─`
  * `0x…│+0x0000: ` deref lines, `$reg   : ` with a space-padded colon
  * `[#0] Id 1, Name: "…", stopped …`, `[#0] 0x… → f(…)`
  * `Chunk(addr=…, size=…, flags=…)`, `Tcachebins[idx=`, `Fastbins[idx=`
  * `GOT protection:`, checksec `Canary                        : ✓`
  * code lines with a GEF-format `<sym+0004>` location (≥ 2024.06).
