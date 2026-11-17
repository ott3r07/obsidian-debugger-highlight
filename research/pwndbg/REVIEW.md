# Adversarial review of SPEC.md (pwndbg + vanilla GDB plain-text output)

## Method

* **Source checks.** I cloned pwndbg at `389764e` (`git describe`: `2026.10.28-21-g389764e47`), the commit named in SETUP.md. I checked 33 citations against it (§7). I also read older tags (2017.02.01 … 2024.08.29) with `git show <tag>:<file>` to test the spec's version-history claims.
* **Regex runs.** I copied every regex in SPEC.md verbatim into a Node 24 harness and ran it first-match, in section order, over:
  * (a) **all 459 non-session `.txt` captures** (7,749 lines);
  * (b) **105 new captures** of my own;
  * (c) **31 real-world samples**.

  Each corpus was run four ways: as is, with tabs expanded to 8-column stops, right-trimmed, and with `\r` appended (CRLF). False negatives are measured per family with an independent oracle: section context (lines between `─[ REGISTERS ]─` and the next banner, and so on), or a loose shape regex. The corrected rules in §2.3 went through the same harness.
* **New captures.** These came from a throwaway container `review-pwndbg-main` built from `research-pwndbg-img`; it has since been removed. All captures were taken under pwndbg 389764e and GDB 15.1, aarch64 native, with test program `rv.c`:
  * populated small and large bins, an 8-node heap linked list, and a pthread;
  * a 6-argument function with a long string, which makes GDB wrap lines;
  * `exit(1)`;
  * a FORTIFY/RELRO/stripped build;
  * a 32-bit i386 static binary run under `qemu-i386`;
  * 80-column runs (`out80*`, `outv80*`);
  * vanilla `gdb -nx` runs (`outv*`).

  They are saved under `review_samples/local_captures/`, each with a `# SOURCE:` header, plus `rv.c.txt`. I also fixed two bugs in `drive.py`; see C14.
* **Real-world samples.** 31 files in `review_samples/NN_*.txt`, each starting with `# SOURCE: <url>`. They date from 2014 to 2026. Most were taken from raw GitHub markdown or issue bodies, so the whitespace is what the author pasted. I spot-checked several against their URLs, e.g. issue #766 and #260 lines match byte for byte.

Numbers are "lines", not distinct lines, unless stated otherwise.

---

## 1. Critical errors (spec claims that are wrong or misleading)

| # | SPEC claim | What is actually true | Evidence |
|---|---|---|---|
| C1 | §3.3 compact-register regex `^([* ])(?:(↪)\*?)?([A-Z]…)` and the example `↪*R14` | The overflow line is `↪` **followed by** the change-marker column (`↪*R14`, `↪ X2`). The spec puts `[* ]` before `↪`, so **all 17 overflow lines in the captures miss**. 12 match nothing; 5 fall through to the `search` catch-all. The "Regex validation" section's claim of "register … 0 misses inside REGISTERS" is false. | `context_regs_compact_arm64.txt`: `↪ X2   0xfffff7fa0ab0 (main_arena+96) —▸ …` |
| C2 | §3.7 backtrace regex `… (0x[0-9a-f]+)(?: (\S+))?$` (exactly one space before the symbol); §3.5 says the negative lookahead keeps backtrace rows out of `source` and was "verified" | Since the rich-table change (#3946) the columns are padded. In the captures the **address** column is left-aligned with padding after it (` ► 0 0x401203       vuln+16`). In 2025 pastes it is right-aligned (` ► 0         0x4013fe vuln+192`). **11/253 BACKTRACE rows in the captures (20/311 overall) are mis-tagged as source-code lines**, because the lookahead only rejects a *single* space. Old forms also fail: ≤2020.07 printed the address **without `0x`** (`addrsz` = `"%{}x"`), e.g. ` ► f 0     7ffff7b165a0 __read_nocancel+7`. 2021.04 to 2023.03 padded it with `%#16x`. pwndbg can also print the literal symbol `None`. | `continue_start_x64.txt`, `smash_continue_x64.txt`; samples 08, 07 (` ► f 0 1d66a090`), 26 (`  2   0x7ffff7da46b5 None`); `git show 2020.07.23:pwndbg/ui.py` |
| C3 | §3.4 the disasm line format is `prefix address [opcodes] <symbol> asm …`, and the regex has no branch-art column | `nearpc`, `pdisass` and `u` (not `context`) draw **branch visualization** by default since 2026-02-10 (`f2e19df0e`, #3361). It is a 20-column field of `┌ └ ├ ─ │ ╎ ▲ < >` between the symbol and the mnemonic (`nearpc.py:135-466, 683-722`). Separator lines then become 50-space or `│` lines. The spec never mentions it. Its disasm regex fails on every line that carries the art. `nearpc-num-opcode-bytes` (§B mentions it, but the regex ignores it) puts `00 00 82 d2` before the symbol. The spec regex then **mis-parses `e2` as the mnemonic**; 11/11 lines in `ctx_disasm_op` are wrong. | `nearpc_arm64.txt`: `   0xaaaaaaaa0c30 <main+348>                    └<   b.le   main+308 …`; local `out__nearpc_loop`, `out__ctx_disasm_op` |
| C4 | §7.3 vis regex `\t(\S*)` for the ASCII column; tabs are treated as mandatory | `bin_ascii()` keeps every printable byte, **space included** (`aglib/memory.py:477-480`). **8/258 vis rows in the captures miss.** All of them carry a space in the ASCII, and 4 of them also carry the `<-- tcachebins[…]` label the regex exists for. With tabs expanded, **258/258** miss and fall into the `search` rule. | `vis_x64.txt`: `0x55555555b2a0⇥0x000000055555555b⇥0x5368e5dc04201038⇥[UUU....8. ...hS⇥ <-- tcachebins[0x30][6/7]` |
| C5 | §9.3 table: `x/20gx` → `0x555555558004:⇥0x48⇥0x65`, "2 per line"; `x/4wx` → `0x48 0x65 0x6c 0x6c` | Both examples are copied from the wrong capture (they are byte dumps of the greeting string). The real `x_20gx_x64.txt` is `0xffff9342cb00:⇥0x0000ffff9342ccf8⇥0x0000000100000006`. The real `x_4wx_x64.txt` is `0xffff9342cb00:⇥0x9342ccf8⇥0x0000ffff⇥0x00000006⇥0x00000001`. The highlighter author would build wrong unit tests from these. | captures as named |
| C6 | §0.2 and §9: pwndbg "leaves GDB output untouched except … intel flavour (and, as observed, hex output radix)" | pwndbg runs a fixed block of settings (`dbg_mod/gdb/__init__.py:1846-1872`): `set print pretty on`, `set output-radix 16`, `set backtrace past-main on`, `set step-mode on`, `set confirm off`, `set pagination off`, `set disassembly-flavor intel`. **`print pretty on` changes the line structure of every struct `p`**, `arena` included. Under pwndbg each field gets its own line (`  name = 0xaaaaaaaa0e30 "review",`, closing `}` lines). Vanilla prints one GDB-wrapped line with a 2-space continuation. §7.4 calls `arena` "`{ mutex = 0x0, … }`", but the capture is multi-line. `confirm off` is why pwndbg sessions have no `(y or n)` prompts. | local `keep__p_cfg_arm64` vs `outv__p_cfg_vanilla_arm64`; `arena_x64.txt` |
| C7 | §9.2 bp-hit regex `^(Temporary breakpoint\|Breakpoint) (\d+), … \((.*)\)(?: at (.+):(\d+))?$` | It misses four common real forms:<br>• **`Thread N "name" hit Breakpoint …`** (any multi-threaded target, `Thread 1 hit …` on Windows);<br>• the native **`… in f () from /lib/…`** form;<br>• **GDB-wrapped** first lines that end in `, ` or `(`;<br>• **C++** names such as `CheckPassword(Napi::CallbackInfo const&) ()`.<br>That is **12/45** bp/watch-hit lines in the combined corpus. The spec does say "wrap" only for `bt`. GDB wraps the hit line, `info threads`, `info frame` and `bt full` too, at its `width` (the terminal width, or 80 under `-batch`). | local `keep__c_many`: `Thread 1 "rv_arm64" hit Breakpoint 2, many_args (alpha_parameter=0x1111, beta_parameter=0x2222, ` + `    gamma_string=…`; samples 22, 23, 29 |
| C8 | §6.2 checksec is only the current pwntools-API form | pwndbg's `checksec` **shelled out to `checksec --file`** (checksec.sh table) or **`pwn checksec`** until the 2024.08 rewrite (`git show 2023.07.17:pwndbg/wrappers/checksec.py`). Most writeups show `[*] '/path'` followed by **4-space-indented** `    Arch:     amd64-64-little`. The spec's `^(File\|Arch\|…):` anchor misses all of them: **12/37 lines** in sample 13. | sample 13 (three formats in one issue) |
| C9 | §B / §C "Banner extras … present already in tag 2022.12.19 … stable for all versions a user is likely to paste; older-than-2022 formats not examined" | The extras arrived 2022-09-24 (DISASM, `f322fae4a`) and 2022-10-03 (REGISTERS, `86e4679f7`). Before that the banner was bare: `───[ REGISTERS ]───`, `───[ DISASM ]───` (2018–2022). **≤2017** it was `[───REGISTERS───]` (`"[{:─^width}]"`, `git show 2017.02.01:pwndbg/ui.py:30`), and the disasm pane was titled **`CODE`**. The spec header regex and its "robust" fallback both reject the 2017 form. | samples 07, 08, 14 |
| C10 | §C "`f ` label … default "f " in 2022.12.19, `""` from 2023" | The default changed on 2023-05-20 (`cd4217fa0`, #1727). Tag **2023.03.19 still has `"f "`**. The address format also changed (C2). | `git show 2023.03.19:pwndbg/commands/context.py` |
| C11 | §7.1 heap: one format (with the note "older sampled tags not diffed line-by-line") | There are three historical formats.<br>• **≤2019.12**: a GDB struct dump, `0x603000 FASTBIN {` / `  prev_size = 0, ` / … / `}` (`git show 2019.12.09:pwndbg/commands/heap.py`, `print(header, chunk["value"])`), with a `Top Chunk: 0x…` / `Last Remainder: 0` header.<br>• **2020 to 2023-07**: `Free chunk (tcache)` (not `tcachebins`) and `Size: 0x291` with no `(with flag bits: …)`; that suffix arrived in `e37591b25` (2023-07-17).<br>• current. | samples 09, 10 |
| C12 | §A.1.2 "`fd:`/`bk:`/bins chain heads and `Addr:` in heap output → HEAP" | `fd`/`bk` of small, large and unsorted chunks point **into `main_arena` (libc DATA)**, and tcache/fast `fd` values are safe-linked garbage. Colouring `fd:` values as heap is wrong for at least half of the free chunks. | local `out__heap_arm64`: `Free chunk (smallbins) … fd: 0xfffff7fa0b30 / bk: 0xaaaaaaac1910`; largebins `fd: 0xfffff7fa0ee0` |
| C13 | §A.1.3 numeric priors, "`0x7ffc…–0x7fff…` stack, `0x7f……` libraries" | With GDB's default ASLR-off, libc is at **`0x7ffff7…`**. That falls inside the "stack" prefix, so a prefix test calls every libc/ld/vdso address STACK. Tested on the real vmmap tables in samples 05/15/16/21/27/01: the spec rules gave **42 wrong of 210 probes**, e.g. `0x7ffff7d93000 truth=libc guess=stack`. §6 has a safer rule. | sample 21 vmmap |
| C14 | SETUP/drive.py: the captures are faithful | `drive.py` decodes each `os.read()` chunk separately with `errors='replace'`. A UTF-8 sequence split across reads becomes `���`. This happens at least once: the bottom rule in `context_code_x64.txt` contains `─���─`. I used an incremental decoder for the new captures. | `context_code_x64.txt` |
| C15 | §8 / §9.2 "warning lines" only `warning: .*` | GDB 17 prints **`⚠️ warning: …`** (emoji prefix, observed in pwndbg issue #4051). GDB ≤8.x prints `Reading symbols from X...done.` and `(no debugging symbols found)...done.`; the spec's `\.\.\.$` misses both. | samples 01, 22 |
| C16 | §3.6: telescope offset column only `-0c8`/`+008` | It is `{offset:+05x}` once \|offset\| ≥ 0x1000 (`+1008`), and it is **`ljust`-padded to the longest register list**, so `-018    0x…` and `+004     0x…` occur when another row shows `x12 sp` or `ebp esp`. The spec regex survives this; its description is incomplete. | local `keep__run_arm64`: `01:0008│-018    0xfffff7dee8c8 {arg}`; i386 `00:0000│ ebp esp 0x40800b98` |
| C17 | §7.2 bins entry `\[\s*(\d+)\]` | Counts can be **negative** when tcache is corrupted or uses the glibc-2.42+ large-tcache layout (`0x20 [-57536]: 0`). There is also a `tcache large` variant with sizes `0x410-0x820` (`glibc_malloc.py:121`) and the header text `Support for tcache large bins (a GLIBC 2.42 addition) has not been fully implemented…`. | sample 11 |

---

## 2. Regex failures

### 2.1 Spec regexes against the original 459 captures

First-match, spec order. "miss" means the line was not first-matched by the rule intended for its family.

| family (oracle) | n | as captured | tabs→spaces | right-trimmed | notes / example |
|---|---:|---:|---:|---:|---|
| REGISTERS section lines | 1480 | **17** | 17 | 17 | C1 `↪ X2 …` / `↪*R14 …` |
| DISASM section | 604 | 5 | 5 | 5 | `Invalid address 0x4141414141414141` has no rule |
| `nearpc` output | 40 | **2** | 2 | 2 | C3 branch art |
| SOURCE section | 661 | 1 | 1 | **41** | `   29 ` loses its trailing space and then fails `(\d+) ` |
| STACK / telescope | 582 | 0 | 0 | 0 | holds |
| BACKTRACE section | 253 | **11** | 11 | 11 | C2; all become `source` (false positives) |
| vis rows | 258 | **8** | **258** | 8 | C4; with tabs every row becomes `search` |
| `x/i`, `display/i` | 54 | 0 | **54** | 0 | hard `:\t`; with tabs they become `search` |
| `disassemble` | 711 | 0 | **711** | 0 | hard `:\t` |
| `x/` data | 78 | **62** | **78** | 62 | **ordering collision**: `bins-entry` `^(0x…)(:)(\s+)` swallows `0xfffffffffa80:⇥0x0000…` |
| source echo `N⇥code` | 82 | 0 | **82** | 2 | hard `\t` |
| everything else (bt, info registers, info breakpoints, checksec, bins, vmmap, proc mappings, signals, warnings) | | 0 | 0 | 0 | |
| **all non-blank lines unmatched** | 7525 | 483 (6.4%) | **1320 (17.5%)** | 530 | |
| **CRLF** | | | | | **every `$`-anchored rule fails: 21,221/21,319 non-blank lines unmatched (99.5%)** across all corpora (1,511 register, 737 x-insn, 627 source, 605 disasm, 577 telescope lines …) |

Over the combined corpus (captures + local + samples, 21,319 non-blank lines), the spec adds these misses:
* **bp/watch hit**: 12/45 (C7).
* **checksec**: 12/103 (C8).
* **vmmap**: 16/165 (`vmmap --gaps` rows have no offset/file).
* **⚠️ warning**: 4/20.
* **negative tcache counts**: 3.
* **BACKTRACE**: 20/311.
* **nearpc art**: 4/104.

**False positives and ordering collisions (spec):**
* `search` (`^(\S+)(\s+)(0x[0-9a-f]+) (.*)$`) is a catch-all. It first-matches:
  * `Offset 0x1000 rebased to module …` (breakrva);
  * `↪*R14 …`;
  * 8 `info sharedlibrary` rows;
  * `Size: 0x30 (with flag bits: 0x33) <- 这个…` (sample 31);
  * and, with tabs expanded, all 258 vis rows and 20 `x/i` rows.

  It must only apply after a `Searching for …` line.
* `bins-entry` vs `x/` data: 62 of 78 `x/` data lines, as above.
* `x-insn` vs `disassemble`: `<[^>]+>` accepts `<+368>`, so if `x-insn` is ordered first it takes all 711 `disassemble` lines. Order `disassemble` first.
* `source` vs pwndbg backtrace: 11 lines (C2).
* `locals` (`^(\s*)([A-Za-z_]\w*) = (.*)$`) takes:
  * `info frame` lines (` pc = 0x… in main (test.c:38); saved pc = …`);
  * every `info registers` vector sub-field (`  v4_float = {…},`);
  * all `arena` fields.

  That is acceptable only if the token is generic.
* `frame-cont` (`^ {4}\S.*$`) takes `elfsections` rows (`    0x555555556318     0x555555556334      R--  …`), `libc` command lines and `xinfo` lines. It needs a stateful guard: previous line was a frame/bt/hit line ending in `, ` or `(`.
* `register` and `disasm` are self-identifying enough that I found **no** false positives outside their sections, in 21k lines.

### 2.2 Whitespace robustness

* **Tabs.** GDB emits real TABs after `x/` addresses, after source line numbers, in `info breakpoints` detail lines (`⇥breakpoint already hit 1 time`) and in vis. pwndbg emits them in vis. Whether they survive a copy depends on the terminal: xterm, tmux copy-mode, VS Code and Windows Terminal turn them into spaces.
  * 5 of the 31 real samples have tabs converted (samples 17, 22, 25, 28, 29), e.g. `   0x3433e00a70 <_start>:       mov    %rsp,%rdi` and `        breakpoint already hit 39 times`.
  * An expanded tab after a 15-character `0xffff9342cb00:` becomes **one** space, so rules must accept `[\t ]+`, never `\t` or ` {2,}`.
* **Trailing whitespace.** pwndbg pads many lines:
  * ` R10  7   …   ` compact columns;
  * `◂— endbr64 `;
  * empty source lines `   23 `;
  * `info threads` header `Frame `;
  * `[anon] ` vmmap rows;
  * the branch separator line `" "`.

  Blogs and editors strip it, and 27 lines in sample 08 still carry it. Rules must end in `\s*$`. The `" "`-only separator becomes indistinguishable from a blank line, which is harmless.
* **CRLF.** Strip `\r` before matching (`line.replace(/\r$/, '')`), or end every rule in `\r?$`.

### 2.3 Corrected rules (tested)

These are ordered first-match rules. Apply them to each line after removing `\r`. Several rules (`frame-cont`, `search`, `callarg`, `source`, `register`) are only *safe* with section/command state, which §3.8 of the spec already recommends. Results on the same harness, with 21,319 non-blank lines across all three corpora: **as captured, tabs-expanded, right-trimmed and CRLF all give 664–666 unmatched**, vs the spec's 1,087 / 2,033 / 1,162 / 21,221. Every family in §2.1 drops to 0 misses, apart from these residuals:
* `Invalid address 0x…`, which is now `gdb-error`;
* the corrupted `─���─` capture line;
* `23⇥` after right-trimming, which cannot be told apart from a program printing `23`;
* author-mangled glyphs in samples 14 and 18.

The remaining unmatched lines are program stdout, prose and banners of other tools.

```js
// line = line.replace(/\r$/, '');  first match wins; order matters (see notes)
export const fixed = [
 ['prompt', /^(pwndbg>|\(gdb\))(?:[ \t](.*))?$/],                       // bare "pwndbg>" survives rtrim
 ['startup', /^(?:pwndbg: (?:loaded|created) .*|Loaded \d+ commands\. Type pwndbg \[filter\] for a list\.)\s*$/],
 ['tip', /^-{7} tip of the day .* -{7}\s*$/],
 ['reading', /^Reading symbols from .*?\.\.\.(?:done\.|\(no debugging symbols found\)\.\.\.done\.)?\s*$/],
 ['legend', /^LEGEND: (?:STACK \| HEAP \| CODE \| DATA \| R?WX \| RODATA|MAPPED \| GUARD \| GAP)\b(.*)$/],
 ['banner', /^(?=.*─)(─*)\[ ([A-Z][A-Z0-9 ()]*?)((?: \/ [^\]]+?)*) \](─*)\s*$/],   // rule runs may be empty (narrow tty)
 ['banner-old', /^\[(─+)([A-Z][A-Z0-9 ()]*?)(─+)\]\s*$/],                          // ≤2017 "[───REGISTERS───]"
 ['banner-bottom', /^─{10,}\s*$/],
 ['reg-flags', /^(↪)?([* ])([A-Z][A-Z0-9_]*)\s+(0x[0-9a-f]+)\s+\[ ((?:[A-Za-z]+(?::\d+)? )*)\]\s*$/],
 ['register', /^(↪)?([* ])([A-Z][A-Z0-9_]{0,7})( +)(0x[0-9a-f]+|-?\d+\b|⏎)(.*)$/],  // ↪ BEFORE marker
 ['disassemble', /^(=> |   )(0x[0-9a-f]+) (<\+\d+>):[\t ]+(?:((?:[0-9a-f]{2} )*[0-9a-f]{2}|[0-9a-f]{8})[\t ]+)?(\S+)(?:[\t ]+(.*?))?(?:\s+((?:#|\/\/) .*))?\s*$/],
 ['x-insn', /^(=> |   )(0x[0-9a-f]+)(?: (<[^>]+>))?:[\t ]+([a-z][\w.]*)(?:[\t ]+(.*?))?(?:\s+((?:#|\/\/) .*))?\s*$/],
 ['rop', /^(0x[0-9a-f]+) ?: ((?:[^;]+ ; )+[^;]+|ret|syscall)\s*$/],
 ['x-data', /^(0x[0-9a-f]{6,})(?: (<[^>]+>))?:[\t ]+(.*)$/],          // before bins-entry
 ['disasm', /^(b►|b\+| ►|  ) (0x[0-9a-f]+)(?: ((?:[0-9a-f]{2} )*[0-9a-f]{2}(?:\.\.\.)?))?( +)(?:(<[^>]+>)( +))?([┌└├│╎▲<>─ ]*?)([✔✘?] )?([a-z][a-z0-9.]*)\b(.*)$/],
 ['disasm-arrow', /^[ │╎]*↓\s*$/],
 ['callarg', /^ {8}([A-Za-z_$][\w$]*|arg\[\d+\]):( +)(.*)$/],
 ['infile', /^In file: (.+):(\d+)\s*$/],
 ['pbt', /^ ?(►| ) (?:f ( *\d+) +((?:0x)?[0-9a-f]+)|( *\d+) +(0x[0-9a-f]+))(?: +(\S.*?))?\s*$/],   // BEFORE source
 ['pthreads', /^ {1,2}(►| ) (\d+) +"([^"]*)" (\w+): (0x[0-9a-f]+)(?: (<[^>]+>))?\s*$/],
 ['source', /^ (►| ) +(\d+)(?: (.*))?$/],
 ['telescope', /^([0-9a-f]{2,}):([0-9a-f]{4,})(│)( *(?:[a-z][a-z0-9_]*(?:[-+]\d+)? *)*|[+-][0-9a-f]{3,4} *)(0x[0-9a-f]+)(.*)$/],
 ['tele-skip', /^(\.\.\. ↓)( +)(\d+)( skipped)\s*$/],
 ['hexdump', /^(\+[0-9a-f]{4,}) (0x[0-9a-f]+)  ((?:(?:[0-9a-f]{2}| {2}) {1,2})+)\s*(│)(.*)(│)\s*$/],
 ['hexdump-skip', /^\.\.\. ↓ +skipped (\d+) identical lines \((\d+) bytes\)\s*$/],
 ['windbg', /^([0-9a-f]{8,16})( {5})((?:[0-9a-f]{2,16} ?)+)\s*$/],
 ['windbg-ds', /^([0-9a-f]+) ('.*')\s*$/],
 ['vmmap-hdr', /^\s*Start\s+End\s+Perm\s+Size\s+(?:Offset\s+File|Note\s+Accumulated Size).*$/],
 ['vmmap', /^(►)?(\s*)(0x[0-9a-f]+)(\s+)(0x[0-9a-f]+) ([r-][w-][x-][ps]) +([0-9a-f]+)(?: +([0-9a-f]+|ADJACENT|GUARD)(?: +(.*?))?)?(?: (\+0x[0-9a-f]+))?\s*$/],
 ['vmmap-gap', /^ (?:-  )+ +GAP +(0x[0-9a-f]+)\s*$/],
 ['checksec', /^(?: {4})?(File|Arch|RELRO|Stack|NX|PIE|SHSTK|IBT|Stripped|Debuginfo|RWX|FORTIFY|RPATH|RUNPATH|ASAN|UBSAN|Packer|Comment):(\s+)(.*)$/],
 ['checksec-hdr', /^\[\*\] '(.+)'\s*$/],
 ['got', /^\[(0x[0-9a-f]+)\] (\S+) -> (.*)$/],
 ['got-hdr', /^(?:State of the GOT of (.+):|GOT protection: .*|Filtering out read-only entries .*)\s*$/],
 ['heap-hdr', /^(Allocated chunk|Free chunk \([a-z]+(?: [a-z]+)?\)|Top chunk|Fake chunk)((?: \| (?:PREV_INUSE|IS_MMAPED|NON_MAIN_ARENA))*)\s*$/],
 ['heap-old', /^(0x[0-9a-f]+)((?: (?:FAKE|FASTBIN|PREV_INUSE|IS_MMAPED|NON_MAIN_ARENA))*) \{/],
 ['heap-field', /^(Addr|Size|prev_size|fd|bk|fd_nextsize|bk_nextsize): (0x[0-9a-f]+)(?: \(with flag bits: (0x[0-9a-f]+)\))?\s*$/],
 ['bins-title', /^(tcachebins|fastbins|unsortedbin|smallbins|largebins)\s*$/],
 ['bins-entry', /^(0x[0-9a-f]{1,5}(?:-(?:0x[0-9a-f]+|∞))?|all)(?: \[ *(-?\d+)\])?(:)(\s+)(.*)$/],
 ['bins-corrupt', /^(0x[0-9a-f]+(?:-(?:0x[0-9a-f]+|∞))?|all) \[corrupted\]\s*$/],
 ['bins-empty', /^empty\s*$/],
 ['bins-fdbk', /^(FD|BK): (.*)$/],
 ['vis', /^(0x[0-9a-f]+)[\t ]+(0x[0-9a-f]{8,16})[\t ]+(0x[0-9a-f]{8,16}|[\t ]{8,})[\t ]+(.{1,16}?)(?:[\t ]+(<--) (.*?))?\s*$/],
 ['vis-skip', /^[\t ]+\.\.\. ↓ +(\d+) repeated lines skipped\s*$/],
 ['exception', /^(?:Exception occurred: .*|For more info invoke `set exception-verbose on`.*|or debug it by yourself with `set exception-debugger on`)\s*$/],
 ['bp-hit', /^(?:Thread (\d+)(?: "([^"]*)")? hit )?(Temporary breakpoint|Breakpoint|Hardware watchpoint|Hardware read watchpoint|Hardware access \(read\/write\) watchpoint|Watchpoint|Read watchpoint|Catchpoint) (\d+), (.*)$/],
 ['bp-set', /^(Temporary breakpoint|Breakpoint|Hardware watchpoint|Watchpoint|Hardware read watchpoint|Read watchpoint|Hardware access \(read\/write\) watchpoint|Access \(read\/write\) watchpoint|Catchpoint|Dprintf) (\d+)(?: at (0x[0-9a-f]+))?(?:: (?:file (.+), line (\d+)\.|(.+)))?(?: \((.+)\) pending\.)?\s*$/],
 ['watch-val', /^(Old|New) value = (.*)$/],
 ['continuing', /^(Continuing\.|Starting program: .*|Run till exit from .*|Value returned is (\$\d+) = (.*)|\[Thread debugging .*\]|Using host libthread_db .*|Remote debugging using .*|\[New Thread .*\]|\[Switching to Thread .*\]|\[Thread .* exited\]|\[Detaching after (?:v?fork|clone) .*\]|process \d+ is executing new program: .*)\s*$/],
 ['signal', /^(?:Program|Thread \d+(?: "[^"]*")?) (received|terminated with) signal (SIG[A-Z0-9]+)(.*)$/],
 ['exit', /^\[Inferior (\d+) \(process (\d+)\) (exited normally|exited with code (\d+)|killed|detached)\]\s*$/],
 ['warning', /^(?:⚠️ ?)?(?:warning|Warning|WARNING): (.*)$/],
 ['gdb-error', /^(No registers\.|The program is not being run\.|Cannot access memory at address 0x[0-9a-f]+|Undefined command: ".*"\.  Try "help"\.|No symbol .* in current context\.|No symbol table is loaded\.  Use the "file" command\.|Initial frame selected; you cannot go up\.|Bottom \(innermost\) frame selected; you cannot go down\.|Backtrace stopped: .*|Invalid address 0x[0-9a-f]+|Could not insert .*|Command aborted\.)\s*$/],
 ['info-bp-hdr', /^Num\s+Type\s+Disp\s+Enb\s+Address\s+What\s*$/],
 ['info-bp', /^(\d+(?:\.\d+)?)(\s+)(breakpoint|hw watchpoint|read watchpoint|acc watchpoint|watchpoint|catchpoint|dprintf|tracepoint)\s+(keep|del|dis|dstp)\s+([yn])\s+(0x[0-9a-f]+|<PENDING>|<MULTIPLE>)?\s*(.*)$/],
 ['info-bp-detail', /^(?:\t| {8})(breakpoint already hit \d+ times?|stop only if .*|stop only in thread .*|ignore next \d+ hits)\s*$/],
 ['disas-frame', /^(Dump of assembler code for function (.+):|End of assembler dump\.)\s*$/],
 ['bt', /^(#\d+)(\s+)(?:(0x[0-9a-f]+) in )?(\S+(?: \S+)*?) \((.*)$/],      // tail may be wrapped: sub-tokenise args / at / from
 ['bt-noargs', /^(#\d+)(\s+)(?:(0x[0-9a-f]+) in )?(\S+)\s*$/],
 ['frame', /^(?:(0x[0-9a-f]+) in )?([\w:~<>.@?$]+) \((?:(.*)\)(?: (at|from) (\S+?)(?::(\d+))?)?|(.*(?:, |\()))\s*$/],
 ['src-echo', /^(?:(0x[0-9a-f]{8,16})[\t ]+)?(\d+)(\t| {2,})(.*)$/],
 ['p-value', /^(\$\d+) = (.*)$/],
 ['ptype', /^type = (.*)$/],
 ['info-reg', /^([a-z][a-z0-9_]*)( {2,}|\t)(0x[0-9a-f]+|-?\d+|\{.*|<unavailable>)(?:\s+(.*))?$/],
 ['proc-map-hdr', /^\s*Start Addr\s+End Addr\s+Size\s+Offset\s+(?:Perms\s+)?objfile\s*$/],
 ['proc-map', /^\s+(0x[0-9a-f]+)\s+(0x[0-9a-f]+)\s+(0x[0-9a-f]+)\s+(0x[0-9a-f]+)(?:\s+([r-][w-][x-][ps]))?(?:\s+(.*?))?\s*$/],
 ['search-hdr', /^Searching for (.*)$/],
 ['rop-hdr', /^(Gadgets information|={20,}|Unique gadgets found: \d+)\s*$/],
 ['gdb-threads', /^([* ]) (\d+)\s+(Thread .*|process \d+.*|LWP \d+.*)$/],
 ['frame-cont', /^ {4}(?:at (\S+):(\d+)|from (\S+)|\S.*)$/],      // ONLY directly after a frame/bt/hit line ending ", " or "("
 ['search', /^(\S+)(\s+)(0x[0-9a-f]+) (.*)$/],                     // ONLY after a "Searching for" line
 ['locals', /^(\s*)([A-Za-z_]\w*) = (.*)$/],
 ['yn', /\(y or n\)/],
];
```

Notes on the corrected rules:
* **Disasm.** `disasm` needs a second pass over group 10 (operands / annotation / `<target>`). The spec's split regexes still work there. The branch-art group (7) must be tokenised as punctuation.
* **x-data vs bins.** `x-data` with `{6,}` hex digits and `bins-entry` with `{1,5}` digits keep `x/gx` and bins apart. The cost: `x/` of an address below 0x100000 (firmware) would be read as a bins line. An alternative is to require `[\t]` or `:\s{2,}` after bins labels, but expanded tabs defeat that.
* **vis.** The ASCII column can begin with a space. Once tabs are expanded that space is indistinguishable from padding, and is lost into the separator. The regex accepts this.
* **src-echo.** It cannot be made rtrim-safe for empty source lines (`23⇥` becomes `23`) without matching program output that prints bare numbers.

---

## 3. Real-world differences (from `review_samples/`)

Per-sample unmatched lines, spec → corrected:
* 08 (2017): 74 → 61;
* 13 (checksec): 15 → 1;
* 22 (mingw GDB 8.1): 101 → 66;
* 25 (watchpoints): 9 → 0;
* 28 (info breakpoints): 21 → 3;
* 29 (AT&T, tabs converted): 10 → 4;
* 31 (smallbins): 2 → 0.

What remains is prose, program I/O and GDB banners. The format differences the spec does not anticipate:

1. **Banners.** Three generations:
   * `[───REGISTERS───]` / `[───CODE───]` (2017, sample 08);
   * `───[ REGISTERS ]───` / `───[ DISASM ]───` (2018 to 2022-09, sample 07);
   * the current form with extras.

   Sample 14 (2024-02, LA CTF) mixes them: **`RWX` legend together with the `show-flags` extras**, which is consistent with the dates in C9 and §C.
2. **Backtrace pane.**
   * `► f 0     7ffff7b165a0 __read_nocancel+7` (no `0x`, 2017);
   * ` ► f 0    10000 _start` and ` ► f 0 1d66a090` (2020, i386, no `0x`);
   * ` ► 0         0x4013fe vuln+192` (2025, address right-justified);
   * the captures' ` ► 0 0x401203       vuln+16` (address left-justified, padded).
3. **Heap.**
   * Struct-style `0x603000 FASTBIN {` with ` prev_size = 0, ` lines (sample 09, 2017);
   * `Free chunk (tcache)` / `Size: 0x191` (sample 10, 2022);
   * `IS_MMAPED`, `0x90 [corrupted]`, `FD:` / `BK:` (sample 31, 2024) — the spec has no regex for `[corrupted]`;
   * negative tcache counts (sample 11, 2026).
4. **vis.** Old `vis_heap_chunks` output already used tabs and `<-- Top chunk` (sample 19). ASCII columns with spaces are routine: `.g...... puUUU..`. Sample 27 shows `<-- largebins[0x0][0]` (a size key of `0x0` from a pwndbg bug), so labels cannot be assumed to name a valid size.
5. **checksec.** Three formats appear (sample 13): current `File:` / `Arch:`, pwntools `[*] '/usr/bin/ls'` + `    Arch:     amd64-64-little`, and a bare `'/usr/bin/ls'` line.
6. **search.** `Searching for value: '0x0'` and `Searching for value: b'\x00…'` (2024) differ from the captured `Searching for byte: b'…'`, `Searching for an 8-byte integer: …` and `Searching for a pointer-width integer: …`. Use `^Searching for (.*)$`.
7. **rop.** The ROPgadget style `0x0007dce8 : pop rdi ; ret` (docs, sample 04) and pwndbg's own `0xaaaaaaaa0e0c: add sp, sp, #0x1a0 ; ret` (local `rop__rop`) differ in the spacing around `:`. Both come with `Gadgets information` / `====…` / `Unique gadgets found: N`. `rop` also prints a `Searching in 0x… 0x… /path` header and, under Python 3.12, **SyntaxWarning tracebacks from ROPgadget** (`  majorVersion = re.search(…`).
8. **GDB 17.** `⚠️ warning: …` (sample 01). Rich-rendered exception boxes (`╭─ Traceback ─╮`, `│ ❱ 123 │`, `╰──╯`) are another new line family (sample 01, `got` failure).
9. **Glyph mangling.** Sample 18 (lldb frontend) shows `►` and `◂—` replaced by `_`, and sample 14 shows a literal `\\x80` inside a banner. Highlighting must degrade gracefully; never require the exact glyph for the rest of the line to tokenise.
10. **Localisation.** Spanish GDB prints `Punto de interrupción temporal 1 at 0x401b4e: file touch.c, line 14.` and `Continuando.` (sample 17), and `No existe el fichero o el directorio` (sample 08). Accept this as unhighlighted.
11. **Native x86-64 addresses.** `0x7ffff7…` libs and `0x7ffffffde000` stack (samples 15, 16, 21, 26) behave as C13 describes. Static-PIE binaries sit at `0x7fe576653000` (sample 15), indistinguishable from libs.

---

## 4. Missing coverage

**A. Present in the captures but not described or given a regex in SPEC.md**
* **Disasm.** `nearpc`/`pdisass`/`u` branch visualization (C3). The ` ►` marker on a *non-PC* address when you run `nearpc <addr>`: `nearpc main+40` highlights `main+40`.
* **Headers and one-liners with no rules:**
  * `elfsections` rows (`    0x…  0x…      R-X       0x1b  .interp`); proposed `/^\s+(0x[0-9a-f]+)\s+(0x[0-9a-f]+)\s+([R-][W-][X-])\s+(0x[0-9a-f]+)\s+(\S+)\s*$/`;
  * the `elfsections` header `     Start  End  Perm  Size  Name`;
  * `xinfo` (`Extended information for virtual address 0x…:`, `  Containing mapping:`, `         Mapped Area 0x… = 0x… + 0x380`, `   Next Stack Canary …`);
  * `distance` (`0x…->0x… is -0x… bytes (-0x… words)`);
  * `plt` (`Section .plt 0x… - 0x…:`, `0x…: free@plt`);
  * `canary` (`AT_RANDOM  = … # …`, `TLS Canary @ …`, `Thread 1: Found valid canaries.`);
  * `procinfo` (`exe        '/work/test'`, `fd[3]      tcp …`);
  * `libc`, `tls`, `errno`, `aslr`;
  * `try-free` section lines;
  * `retaddr` bare chain lines (`0xffff… —▸ 0x… (__libc_start_main+139) ◂— …`), which need a generic `/^(0x[0-9a-f]+)( —▸ | ◂— )/` chain rule.
* **Messages.** `Set whether to show flags registers to 'on'.` and other `set` echoes. `qemu-x86_64: QEMU: Terminated via GDBstub`. `WARNING: Your register accessing on id 251 is deprecated …` (unicorn, i386 emulation).
* **GDB output with no rule:**
  * `info threads` header and rows;
  * `info frame` (`Stack level 0, frame at 0x…:`, ` Arglist at …`, ` Saved registers:`);
  * `info line`, `info symbol`, `info inferiors`;
  * `info sharedlibrary` (`From  To  Syms Read  Shared Object Library`, `(*): Shared library is missing debugging information.`);
  * `display` (`1: x/i $pc`);
  * `test.c:` in `disassemble /s`;
  * `No locals.`, `No symbol table info available.`;
  * `*** stack smashing detected ***: terminated`.

**B. Not captured by the spec. I captured these or found real samples.**
* **Context THREADS section.** `─[ THREADS (2 TOTAL) ]─` with rows `  ► 2   "rv_arm64" stopped: 0xaaaaaaaa0b08 <worker+44> ` (`context.py:1698-1750`; `pthreads` rule above).
* **Thread lifecycle lines.** `[New Thread 0x… (LWP 382)]`, `[Switching to Thread …]`, `[Thread 0x… (LWP 382) exited]`.
* **Populated small and large bins.**
  * `0x90:        0xaaaaaaac1910 —▸ 0xaaaaaaac1860 —▸ 0xfffff7fa0b30 (main_arena+224) ◂— 0xaaaaaaac1910`
  * `0x500-0x530: 0xaaaaaaac19c0 —▸ 0xfffff7fa0ee0 (main_arena+1168) ◂— …` (the label is exactly 13 characters, so only one space follows the colon)
  * Heap chunks with `fd_nextsize:` / `bk_nextsize:` (local `out__bins`, `out__heap`).
* **Long telescope chains.** Chains end in ` —▸ ...` after 5 links and mix `(main_arena+1168)` with `{large+0x8}` (local `out__tele_long`). Strings are truncated with `...'`: `'a fairly long string argument to force gdb line wr...'` (i386 DISASM annotation).
* **vis.** The truncation and footer lines: `0xaaaaaaac1420⇥0x0000000000000000⇥                  ⇥........`, then `Not all chunks were shown, see `vis --help` for more information.`
* **hexdump skip line, now captured.** `... ↓            skipped 2 identical lines (32 bytes)`.
* **`vmmap --gaps`.** A different header (`Start End Perm Size Note Accumulated Size`), rows without offset/file, ` -  -  - … GAP  0x1d000` rows, `ADJACENT` / `GUARD` notes, and `Total memory mapped: 0x234000 (2 MB)`.
* **checksec on a hardened binary.** Adds `FORTIFY:    Enabled` and drops `Stripped` / `Debuginfo` when stripped. 32-bit: `PIE:        No PIE (0x8048000)`, `RELRO:      Partial RELRO`.
* **32-bit x86 (qemu-i386).** The spec regexes handle these:
  * `*EAX  0x8102ff4 (_GLOBAL_OFFSET_TABLE_) ◂— 0`, ` EFLAGS 0x202 [ cf pf af zf sf IF df of iopl:00 ac ]`;
  * `─[ DISASM / i386 / set emulate on ]─`;
  * `00:0000│ ebp esp 0x40800b98`, `01:0004│+004     0x40800b9c`;
  * vmmap rows starting at column 1: ` 0x8048000  0x8049000 r--p`.

  Note `endbr32`, and `__x86.get_pc_thunk.ax` calls followed by a ` ` separator.
* **`malloc-chunk` on a non-chunk.** Prints `Size: 0xfffff7fa0ee0 (with flag bits: 0xfffff7fa0ee0)`, so sizes are not small.
* **Not covered by anyone.** ARM thumb banners, kernel/`kbase` (skipped as instructed), `context ghidra` / `DECOMP`, `HEXRAYS PSEUDOCODE` (old title), `GHIDRA DECOMPILE` (old title, `git show 2023.07.17:pwndbg/commands/context.py:220`), `ARGUMENTS` / `EXPRESSIONS` panes, DYLD shared-cache omission lines (`[Omitted N entries from the DYLD Shared Cache…]`, `vmmap.py:349-352`, Darwin), and `<Cannot dereference [0x…]>` / `<[rip + …], now=…>` jump targets (`color/disasm.py:104-117`).

---

## 5. Vanilla-GDB corrections

1. **`x/` examples.** Fix the `x/20gx` and `x/4wx` rows (C5). Add `x/gx` with labels, which GDB prints when memory is inside a symbol: `0xaaaaaaac0020 <g_cfg+16>:⇥0x…⇥0x…`. The symbol offset is **decimal** in GDB but hex in pwndbg backtraces with `context-backtrace-hex on` (`main+0x1e8`, 2026-02, #3754).
2. **`x/i`.** Mnemonic padding differs by architecture: x86 pads with spaces (`mov    `); aarch64 uses `\t` both after the mnemonic and before `// #6`. Vanilla aarch64 prints decimal immediates in memory operands (`ldr⇥x0, [x0, #4072]`), while pwndbg's radix-16 setting makes them `#0xfe8`. AT&T needs `%reg`, `$imm` and `*%rax` (indirect call) tokens. Older GDB/binutils print `callq` / `retq` / `leaveq` (sample 29), so mnemonic lists must not be closed.
3. **`bt`.**
   * GDB wraps at `width`. Continuation lines are 4 spaces, and the first line may end in `(`: `#2  0x0000fffff7e184c4 in __libc_start_call_main (` (80 columns, local `out80__bt`). `at file:line` can sit on its own line: `    at ../csu/libc-start.c:360`.
   * `bt full` locals are 8-space indented, with 10-space continuations.
   * `#0  0x… in _dl_start () from /lib64/ld-linux-x86-64.so.2` is the common native form (sample 29).
   * Frames ≥ 10 use one space (`#10 0x…`), which the spec already notes.
4. **Breakpoint and watchpoint hits.** `Thread N "comm" hit …` (C7). Watchpoint hit values can be typed: `Old value = (struct node *) 0x0`. `Hardware read watchpoint 5: g_cfg.ratio` and `Hardware access (read/write) watchpoint 6: g_cfg.in.a` are set messages; their hits print `Value = …`, which needs adding to `watch-val`: `/^(Old value|New value|Value) = (.*)$/`.
5. **`info breakpoints`.** The `Type` column widens to fit `read watchpoint` (`Num     Type            Disp …`). Watchpoint rows have **no address**: `4       hw watchpoint   keep y                      g_cfg.vals[3]`. Detail lines are TAB-indented (`⇥breakpoint already hit 1 time`, `⇥stop only if alpha_parameter == 0x1111`). Neither the header nor the detail lines have a spec regex. Pending breakpoints print `<PENDING>`; multi-location ones print `<MULTIPLE>` with `1.1` sub-rows.
6. **`p`.** Vanilla: `$1 = {name = 0xaaaaaaaa0e30 "review", vals = {1, 2, 3, 0, 0, 0}, in = {a = 7, tag = "inn\000\000\000\000"}, ` followed by `  ratio = 0.5, cb = 0xaaaaaaaa09d8 <cb>, pad = '\000' <repeats 39 times>}`. That is one logical line, GDB-wrapped with a **2-space** continuation. Under pwndbg the same value spans 12 lines (C6). `p/x` turns char arrays into `{0x69, 0x6e, …}` and doubles into `0x3fe0000000000000`. `<repeats N times>` appears both inside strings (`'\000' <repeats 39 times>`) and in arrays (`{0x0 <repeats 40 times>}`).
7. **`info registers`.** The spec's capture includes xmm/ymm/k-registers, cr0/cr3/cr4 and efer because **qemu's gdbstub reports them**. Native `info registers` on x86-64 stops at `fs_base` / `gs_base` (sample 24), with `k_gs_base` only under qemu. Native vector registers need `info all-registers`. The spec should state this rather than present the qemu dump as typical.
8. **`info proc mappings`.** The spec's regex *requires* `Perms`. Older GDB releases print the table without that column (I believe Perms was added around GDB 12; not verified here). The 32-bit layout is narrower (`        Start Addr   End Addr       Size     Offset  Perms   objfile`, sample 15). Anonymous rows end in trailing spaces after `rw-p`. The corrected `proc-map` rule makes Perms optional.
9. **Startup and paging.**
   * `Reading symbols from X...done.` (GDB ≤ 8.2) and `Reading symbols from X...(no debugging symbols found)...done.`
   * Pagination prompts: `---Type <return> to continue, or q <return> to quit---` (old) and `--Type <RET> for more, q to quit, c to continue without paging--` (GDB ≥ 9). They appear in vanilla pastes; pwndbg disables paging.
   * `Make breakpoint pending on future shared library load? (y or [n]) y` uses `(y or [n])`, which the spec's `\(y or n\)` misses. Use `/\(y or \[?n\]?\)|\(\[y\] or n\)/`.
10. **Exit and signals.** `[Inferior 1 (process 469) exited with code 01]` was captured natively and matches the spec. `Thread 2 "x" received signal SIGSEGV, Segmentation fault.` (no `Program`) is the multi-thread form.
11. **`frame`/`up`/`down` under pwndbg.** They print the pwndbg BACKTRACE pane, with ` ► 1` moving: `   0 0xaaaaaaaa0a58 many_args+36` then ` ► 1 0xaaaaaaaa0db8 main+616`. GDB's `#1  0x… in main (…)` line is not printed (local `keep__up`).

---

## 6. Heuristic risks and safe fallbacks

1. **Numeric address priors (C13).** Under GDB's default `disable-randomization on`:
   * x86-64: libs `0x7ffff7c00000–0x7ffff7fff000`, stack `0x7ffffffde000–0x7ffffffff000`, PIE `0x555555554000`, heap directly after .bss (`0x555555559000`);
   * aarch64: libs `0xfffff7…`, stack `0xfffffffdf000–0x1000000000000`, PIE `0xaaaaaaaa0000`;
   * i386 native: PIE `0x56555000`, libs `0xf7…`, stack `0xff…`;
   * qemu-i386: stack `0x40001000–0x40801000`;
   * non-PIE heap shares the `0x4…` / `0x8…` image prefix.

   A safe numeric table, which I tested and which gave 18 wrong of 210 probes vs 42 for the spec, all residual errors being static-PIE and vdso:
   * `0x7ffffff00000 ≤ a < 0x800000000000` → stack;
   * `0x7ffff7000000 ≤ a < 0x7ffff8000000` → lib (code/data unknown);
   * `0x7ffc… ≤ a < 0x7ffff7…` → stack only when ASLR is evidently on (no `0x7ffff7` addresses anywhere in the block);
   * `0xfffffff00000 ≤ a ≤ 0x1000000000000` → stack (aarch64);
   * `0xfffff7000000 ≤ a < 0xfffff8000000` → lib (aarch64);
   * everything else → neutral `address`.

   **Never** classify `0x55…`/`0x56…`/`0x4…` as heap vs binary from the number alone, and never classify qemu-user `0xffff…` addresses at all: in the captures libs and stack both start `0xffff9…`.
2. **Prefer in-paste evidence.** If a `vmmap` / `info proc mappings` / `xinfo` table is in the same block, use its ranges; that is exact. The spec's order, with `[stack` before `x` before `!w` before `[heap`, matches `color/memory.py:107-129`. Note that `---p` guard pages are therefore coloured **rodata**, not guard: `is_guard` is unreachable for non-writable pages, so the spec's "guard cyan" never appears for `---p`.
3. **`fd:` / `bk:` are not heap (C12).** Only `Addr:` and bins chain heads are reliably heap. Chain tails often end in `(main_arena+N)`, which is DATA.
4. **Telescope rows are not always stack.** Only rows inside the `STACK` banner, or rows with a register/frame-offset column (`│ rsp`, `│-0c8`), start on the stack. `telescope head` and `tele &global` rows have an empty column and are heap/data (`tele_global_x64`, local `keep__tele_chain`).
5. **`{var}` means a stack variable** only in chains and annotations. In disasm annotations `[{fp}]` it denotes a stack *slot* too, so this is fine. In plain GDB, `<sym>` in `x/` labels marks a symbol, not a stack variable.
6. **Instruction vs string after `◂—`.** Spec rule 6 holds, but pwndbg may append `/* 'review' */` to an *instruction* when the bytes are printable (`X3 … ◂— ldpsw x18, x25, [x11, #-0x50] /* 'review' */`, local `keep__c_many`). The comment rule must run after the instruction rule.
7. **Section state is mandatory, not optional.** Without it:
   * `source` eats padded backtrace rows;
   * `search` eats vis, `x/i` and arbitrary `word 0x…` lines;
   * `frame-cont` eats elfsections and xinfo;
   * `locals` eats `info frame`.

   Reset state on every prompt line and on every banner. Pastes very often omit the prompt (sample 02 is four bare disasm lines with no prompt or banner), so each rule must still produce *reasonable* tokens context-free. That is why the corrected rules lean on glyph anchors (`│`, `◂—`, `►`) rather than column counts.
8. **Terminal width.** Banners are as wide as the terminal: 120 in the captures, 80 under `gdb -batch` or 80-column ptys (local `out80__run`), 170+ in sample 26. Long source lines are not truncated by pwndbg; the terminal soft-wraps them, and a copy may or may not rejoin them. GDB itself hard-wraps frame, hit, `info threads` and `info frame` lines at its `width` (C7). Never depend on line length or column positions beyond the first fields.

---

## 7. Citation spot-check (pwndbg 389764e)

33 citations checked, 30 accurate. 3 are minor: off-range or slightly off lines.

| Citation | Verdict |
|---|---|
| `pwndbginit/gdbinit.py:37-41` (charset forced to UTF-8) | ✔ |
| `pwndbg/gdblib/prompt.py:117-126` (prompt `pwndbg> `) | ✔ |
| `pwndbg/color/message.py:41-44` (prompt colours) | ✔ |
| `pwndbg/ui.py:32-47` (banner) | ✔ |
| `pwndbg/commands/context.py:750-766` (legend suffixes) | ✔ |
| `context.py:794-799` (bottom rule) | ✔ |
| `pwndbg/commands/vmmap.py:119` (gaps legend) | ✔ |
| `context.py:638, 1171, 1561, 1689, 1750` (titles) | ✔ |
| `context.py:1455` (thumb banner extra) | ✔ (1453-1457) |
| `pwndbg/color/context.py:30, 77` | ✔ |
| `context.py:1204-1217` (register prefix and `*`) | ✔ |
| `pwndbg/aglib/nearpc.py:66-72, 76-84` (markers) | ✔ |
| `nearpc.py:584-707` (line assembly) | ✔, but the same range contains the **branch-visualization** code the spec omits |
| `nearpc.py:744-749, 752-768` (args, `↓`, separator) | ✔ |
| `nearpc.py:697-703` (opcode-bytes example) | ✔ |
| `pwndbg/color/disasm.py:27-33, 99, 117` | ✔ |
| `pwndbg/aglib/disasm/assistant.py:126, 130` (`=>`, `<=`) | ✔ |
| `pwndbg/arguments.py:297` (padding computed on the coloured string) | ✔ |
| `pwndbg/lib/pretty_print.py:326, 341` | ✔ |
| `pwndbg/commands/telescope.py:54-61, 231-241, 248, 259-262, 291-302` | ✔ (it omits the `+05x` / `ljust` details; see C16) |
| `pwndbg/chain.py:99-103` (arrows) | ✔ |
| `pwndbg/chain.py:105-249` | ✘ the file has 221 lines; `format()` is 106-221 |
| `pwndbg/enhance.py:30-40, 177` | ✔ |
| `pwndbg/hexdump.py:27, 117` | ✔ |
| `pwndbg/commands/windbg.py:192` | ~ it points at `def dX(`; the format is inside |
| `pwndbg/lib/memory.py:32-41` (vmmap row) | ✔ (the offset width drops to 6 when size > 4 GiB) |
| `vmmap.py:45-54, 340-341` | ✔ |
| `vmmap.py:355-358` (QEMU <8.1 note) | ✔ |
| `pwndbg/wrappers/checksec.py:30-39` | ✔ (current only; see C8 for older versions) |
| `pwndbg/commands/glibc_malloc.py:72-147, 117-135, 1228-1234` | ✔ (it misses the TCACHE_LARGE `0x…-0x…` branch at 121-122) |
| `pwndbg/aglib/memory.py:513` (vis skip line) | ~ the line is at 516; format `\t... ↓     {n:>3} repeated lines skipped` |
| `pwndbg/color/memory.py:58-67 @2023.07.17` (RWX legend) | ✔ |
| `pwndbg/color/syntax_highlight.py:21-27` | ✔ |

Version claims I checked against git:
* `RWX`→`WX`: tag 2024.02.14 still has `RWX`; 2024.08.29 has `WX`. ✔
* `f ` label: ✘, see C10.
* banner extras: ~, see C9.
* `-` command names (#2857): not re-checked; `old_*` captures agree.
