# pwndbg + vanilla GDB plain-text output spec (for a Prism grammar / Obsidian highlighter)

Status: evidence-backed. Every example below is copied verbatim from a capture in `captures/`
(file named in the **Evidence** line) unless it is explicitly labelled **source-only**.

* pwndbg version captured: `2026.10.28` (git `389764e`, "gdb: detect Darwin platform from osabi (#4311)", 2026-11-17),
  GDB 15.1 (Ubuntu 24.04), glibc 2.39. Source citations are `path:line` in that checkout.
* Arches: **x86_64** (`*_x64.*`, via `qemu-x86_64 -g` + `gdb-multiarch`), **aarch64 native** (`*_arm64.*`).
  Vanilla GDB (`gdb -nx`) captures carry the infix `_vanilla_`.
* Capture naming: `<slug>_<arch>.txt` (ANSI stripped) and `<slug>_<arch>.ansi` (raw, incl. `\r\n`).
  Each per-command file starts with the prompt line + typed command, followed by output.
  `_session_<session>_<arch>.*` are complete transcripts. `startup_*` is the text before the first prompt.
* Terminal width during capture: 120 columns (banners are exactly 120 chars wide; real users' widths vary).

## 0. Summary of the most important facts

1. **No colour survives copy/paste**, so classification must be lexical. pwndbg's
   colour → meaning mapping (STACK yellow, HEAP blue, CODE red, DATA purple, RODATA normal, WX underline,
   guard cyan) is only *inferable heuristically* from plain text (see §A "Ambiguities").
2. The output is a mix of (a) **pwndbg-rendered blocks** (context sections, telescope, vmmap, heap, …),
   whose format is defined in pwndbg Python source, and (b) **ordinary GDB output** (`x/`, `p`, `bt`,
   `info registers`, `disassemble`, breakpoint/signal messages) which pwndbg leaves untouched except that
   it sets intel disassembly flavour (and, as observed, hex output radix: `argc=0x1`, `$1 = 0x0`).
3. Unicode glyphs are the strongest anchors: `─` (U+2500) banners, `│` (U+2502) telescope/hexdump separators,
   `—▸` / `◂—` chain arrows, `►` current marker, `✔`/`✘` branch markers, `↓` skip markers, `⏎`/`↪` compact regs.
   There is **no ASCII fallback** in current pwndbg (no config switch; GDB charset is forced to UTF-8,
   `pwndbginit/gdbinit.py:37-41`); all glyphs are theme parameters a user *could* change (§B).
4. Version drift (details in §C): legend `RWX` → `WX` (2024-06, #2265); heap commands renamed
   `vis_heap_chunks` → `vis-heap-chunks`, `malloc_chunk` → `malloc-chunk`, `top_chunk` → `top-chunk`
   (2025-04, #2857; old names are now *Undefined command*); telescope frame-pointer offset column
   `│-0c8 ` (2023-10); `{var}` stack-variable names (2024-08); disasm annotations `RAX => …` (2024-04,
   #2001); `b+`/`b►` breakpoint markers (2025-04, #2828); backtrace `f 0` label (≤ 2022.12, now plain `0`).

---

## 1. Prompt and command echo

| | |
|---|---|
| Description | pwndbg prompt is the literal `pwndbg> ` (`pwndbg/gdblib/prompt.py:117-126`). Vanilla: `(gdb) `. The typed command follows on the same line. |
| Examples | `pwndbg> telescope $sp 20` (telescope_x64.txt) · `pwndbg> x/20gx $sp` (x_20gx_x64.txt) · `(gdb) x/20gx $sp` (v_x_20gx_vanilla_arm64.txt) |
| Regex | `/^(pwndbg>|\(gdb\))( )(.*)$/` → groups: prompt, sp, command. Optional extra prefix for gef/peda not covered here. |
| Token | `prompt` (group 1), `command` (group 3; first word could be `command-keyword`, rest `command-args`) |
| Colour | prompt `bold,red` when no process is alive, `bold,green` when alive (`theme prompt-color`, `prompt-alive-color`, `pwndbg/color/message.py:41-44`; alive switch added 2024-07, #2326). Captured raw: `\x1b[31m\x1b[1mpwndbg> \x1b[0m` (run_bp_arm64.ansi). |
| Evidence | every capture; prompt colour: `_session_main_x64_x64.ansi` |

Note: GDB y/n queries look like `Delete all breakpoints? (y or n) [answered Y; input not from terminal]` or
an interactive `(y or n) ` followed by the answer (v_delete_*_vanilla_*). Treat `/\(y or n\)/` lines as `gdb-message`.

## 2. pwndbg startup lines

```
pwndbg: loaded 200 pwndbg commands. Type pwndbg [filter] for a list.
pwndbg: created 12 GDB functions (can be used with print/break). Type help function to see them.
Reading symbols from ./test_x64...
------- tip of the day (disable with set show-tips off) -------
Use search to find bytes/strings/ints/pointers in the process memory. See search --help for filters or examples
```
(startup_x64.txt). Regex: `/^pwndbg: (loaded|created) .*$/`, `/^-{7} tip of the day .* -{7}$/`, `/^Reading symbols from .*\.\.\.$/`.
Token: `comment`/`meta`. The tip text on the following line is free text (no reliable regex: treat the single line after the tip header as `comment`).

## 3. Context display (after `break`/`run`/`continue`/`ni`/`si`/`context`)

Order of sections is config-driven: default `context-sections = 'regs disasm code ghidra stack backtrace expressions threads heap_tracker last_signal'`
(docs/configuration/config.md; empty/inapplicable sections are not printed). Output structure:

```
<gdb stop message lines>          (e.g. "Breakpoint 1, main (argc=0x1, ...) at test.c:24" + source echo)
LEGEND: STACK | HEAP | CODE | DATA | WX | RODATA
───[ REGISTERS / show-flags off / show-compact-regs off ]───
 register lines
───[ DISASM / x86-64 / set emulate on ]───
 disasm lines
───[ SOURCE (CODE) ]───
In file: /work/test.c:24
 source lines
───[ STACK ]───
 telescope lines
───[ BACKTRACE ]───
 backtrace lines
───[ LAST SIGNAL ]───            (only after a real signal; arm64 capture)
Program received signal SIGSEGV (fault address: 0x0).
────────────────────────────────── (bottom rule, full width)
```
Evidence: continue_main_x64.txt, run_bp_arm64.txt, sigsegv_arm64.txt.

### 3.1 Legend line

| | |
|---|---|
| Examples | `LEGEND: STACK \| HEAP \| CODE \| DATA \| WX \| RODATA` (continue_main_x64.txt, vmmap_x64.txt, elfsections_x64.txt) |
| Older | `LEGEND: STACK \| HEAP \| CODE \| DATA \| RWX \| RODATA` (**source-only**, tags ≤ 2024.02.14, `pwndbg/color/memory.py:58-67` @2023.07.17) |
| Suffixes (source-only) | ` (history 2/5)` when browsing context history; ` [<vmmap cache status>]` (`pwndbg/commands/context.py:750-766`) |
| Regex | `/^LEGEND: (STACK) \| (HEAP) \| (CODE) \| (DATA) \| (R?WX) \| (RODATA)(.*)$/` |
| Token | `legend`; each word should get the class of the memory type it names (`address-stack`, `address-heap`, `address-code`, `address-data`, `address-wx`, `address-rodata`) so the legend renders as a key. |
| Colour | STACK yellow `\x1b[33m`, HEAP blue `\x1b[34m`, CODE red `\x1b[31m`, DATA purple `\x1b[35m`, WX underline+red `\x1b[4m\x1b[31m`, RODATA normal `\x1b[0m` (`pwndbg/color/memory.py:19-30, 142-151`; raw in run_bp_arm64.ansi) |
| Also | `vmmap --gaps` uses a different legend `LEGEND: MAPPED \| GUARD \| GAP` (**source-only**, `pwndbg/commands/vmmap.py:119`) |

### 3.2 Section banner (header) and bottom rule

| | |
|---|---|
| Description | `title.upper()` wrapped in `[ ` ` ]`, centred, padded with `─` (U+2500) to terminal width; the "extra" info after the title is NOT upper-cased (`pwndbg/ui.py:32-47`). The context ends with a full-width rule without a title (`pwndbg/commands/context.py:794-799`). |
| Examples | `─────────────────────────────────[ REGISTERS / show-flags off / show-compact-regs off ]─────────────────────────────────` (continue_main_x64.txt) |
| | `──────────────────────────────────────────[ DISASM / x86-64 / set emulate on ]──────────────────────────────────────────` (continue_main_x64.txt) · `─────────────────────────────────────────[ DISASM / aarch64 / set emulate on ]──────────────────────────────────────────` (run_bp_arm64.txt) |
| | `───────────────────────────────────────────────────[ SOURCE (CODE) ]────────────────────────────────────────────────────` · `───────────────────────────────────────────────────────[ STACK ]────────────────────────────────────────────────────────` · `─────────────────────────────────────────────────────[ BACKTRACE ]──────────────────────────────────────────────────────` · `────────────────────────────────────────────────────[ LAST SIGNAL ]─────────────────────────────────────────────────────` (sigsegv_arm64.txt) |
| | `─────────────────────────────────[ REGISTERS / show-flags on / show-compact-regs off ]──────────────────────────────────` (context_regs_flags_x64.txt) |
| Known titles | `REGISTERS`, `DISASM`, `SOURCE (CODE)`, `STACK`, `BACKTRACE`, `LAST SIGNAL` (captured); `DECOMP`, `ARGUMENTS`, `EXPRESSIONS`, `HEAP TRACKER`, `THREADS (n total)` (**source-only**, `pwndbg/commands/context.py:638,1171,1561,1689,1750`). DISASM extra may be ` / arm / thumb mode / set emulate on` (`context.py:1455`); emulate value can be `on`, `off`, `jumps-only`. |
| Regex | header: `/^(─+)\[ ([A-Z][A-Z0-9 ()]*?)((?: \/ [^\]]+)*) \](─+)$/` → rule, title, extra, rule. Bottom: `/^─{20,}$/`. For robustness accept other separators: `/^(\S)\1{3,}\[ .+ \]\1{3,}$/` (separator, surroundings, position are theme params `banner-separator`, `banner-title-surrounding-left/right`, `banner-title-position` = center/left/right). |
| Token | `section-rule` (dashes), `section-header` (title), `section-meta` (the ` / show-flags off …` extra) |
| Colour | whole banner blue `\x1b[34m` (`theme banner-color = blue`, `pwndbg/color/context.py:30`); title colour `none` |
| Note | Heap commands print *colour-only* "banners" with no rule: plain lines `tcachebins`, `fastbins`, `unsortedbin`, `smallbins`, `largebins` (bins_x64.txt; `pwndbg/commands/glibc_malloc.py:773-898` uses `ctx_color.banner()` which is just the blue colour function `pwndbg/color/context.py:77`). |

### 3.3 Register lines (REGISTERS section, `regs`, `context regs`)

Format per line: `<marker><NAME padded to 4> <value-chain>` where marker is `*` if the register changed since the last stop, else a space (`pwndbg/commands/context.py:1204-1217`).

| | |
|---|---|
| Examples (x86_64) | `*RAX  0x5555555572fb (main) ◂— endbr64` · ` R8   0` · `*RSP  0xffff9342cb00 {argv} —▸ 0xffff9342ccf8 —▸ 0xffff9342cec8 ◂— './test_x64'` · `*RIP  0x555555557317 (main+28) ◂— mov rax, qword ptr fs:[0x28]` (continue_main_x64.txt) |
| Examples (aarch64) | ` X0   1` · ` X16  0xfffff7f9fd68 (_dl_audit_preinit@got.plt) —▸ 0xfffff7fd0d40 (_dl_audit_preinit) ◂— stp x29, x30, [sp, #-0x50]!` · ` SP   0xfffffffffa80 {argv} —▸ 0xfffffffffcc8 —▸ 0xfffffffffec6 ◂— '/work/test_arm64'` · ` LR   0xfffff7e184c4 (__libc_start_call_main+116) ◂— bl exit` · ` PC   0xaaaaaaaa0ae8 (main+20) ◂— adrp x0, 0xaaaaaaabf000` (run_bp_arm64.txt) |
| Flags (show-flags on) | `*EFLAGS 0x206 [ cf PF af zf sf IF df of iopl:00 ac ]` (context_regs_flags_x64.txt) · ` CPSR 0x80001000 [ N z c v q pan il d a i f el sp ]` (context_regs_flags_arm64.txt). UPPERCASE flag = set (green bold), lowercase = clear (red), changed = underline (`theme context-flag-*`, `pwndbg/color/context.py:15-29`). |
| Compact (show-compact-regs on) | ` RAX  0                                                       *R11  0x55555555b420 ◂— 0x55555555b` · `*R14  ⏎` then continuation `↪*R14  0x555555559da0 (__do_global_dtors_aux_fini_array_entry) —▸ …` (context_regs_compact_x64.txt). Two (configurable) columns; `⏎` means "value too long, shown below", `↪` prefixes the overflow line (`pwndbg/commands/context.py:836-960`). |
| Regex | `/^([* ])(?:(↪)\*?)?([A-Z][A-Z0-9]{1,7})(\s+)(.*)$/` — simpler non-compact form `/^([* ])([A-Z][A-Z0-9]{1,6}) {1,3}(\S.*)$/`; flags: `/^([* ])(EFLAGS|CPSR|FLAGS)\s+(0x[0-9a-f]+) \[ ((?:[A-Za-z]+(?::\d+)? )*)\]$/`. Compact lines contain 2+ register groups: split on `/\s{2,}(?=[* ][A-Z][A-Z0-9]{1,6}\s)/`. |
| Token | `register-changed` (the `*`), `register-name`, value → chain tokens (§4). For flags: `flag-set` (uppercase word), `flag-clear` (lowercase). |
| Colour | name `bold`; changed: marker AND name red (`\x1b[31m*\x1b[0m\x1b[31m\x1b[1mRSP `, regs_x64.ansi); value colours by memory type (§4). |
| Disambiguation | Register names are upper-case only here; GDB `info registers` uses lower-case (§9.5). Must only apply inside REGISTERS section or `regs` output, else e.g. `R8` could collide with source text. Anchor: the line is preceded by the REGISTERS banner or another register line. |

### 3.4 Disassembly lines (DISASM section, `nearpc`, `pdisass`)

Line = `prefix address [opcodes] <symbol> asm [annotation | <target>]`, elements joined by one space,
address and symbol columns left-padded to the longest in the block (`pwndbg/aglib/nearpc.py:584-707`).

* prefix (2 cols): `   ` default (spaces), ` ►` current PC, `b►` current PC with breakpoint, `b+` breakpoint (`nearpc.py:76-84, 595-645`).
* asm starts with a 2-char condition field: `  ` normal, `✔ ` branch will be taken, `✘ ` won't be taken, `? ` undetermined (`pwndbg/color/disasm.py:27-69`).
* call/jump: target shown as `<symbol>` padded to column 36 of asm (`pwndbg/color/disasm.py:99,117`); syscalls ` <SYS_write>`.
* annotation after padding: `REG => value`, `[addr] <= value`, `REG, [addr] => value`, `a - b     EFLAGS => 0x297 [ … ]`, `(0x… + 0x918)` arithmetic (`pwndbg/aglib/disasm/assistant.py:126,130`).
* after a taken branch an extra line `    ↓`; after a non-taken branch/call a line consisting of a single space ` ` (`nearpc.py:752-768`).
* call arguments, when PC is at a call: lines indented 8 spaces, `name: chain` (`f"{'':>8}{arg}"`, `nearpc.py:744-749`, `pwndbg/arguments.py:297`). The source pads `name:` to 10 columns but the padding is computed on the ANSI-coloured string, so in practice there is a single space: `        format: 0x55555555801b ◂— '%s %s r=%d stack=%s\n'` · `        rsi: 0x555555558004 ◂— 'Hello, pwndbg!'` · `        r8: 0xffff89f5eb90 {stackbuf} ◂— 'AAAAAAAABBBBBBBBCCCCCCCC'` (calls_nextcall_x64.txt). Regex `/^ {8}([a-z_][a-z0-9_]*|r\d+|[xw]\d+):( +)(.*)$/` → `argument-name`, chain.
* `✘` example: `b► 0x5555555573a3 <main+168>  ✘ jle    main+128                    <main+128>` (calls_continue_start_x64.txt); `? je` example with no symbol: `   0xffff8948e1de             ? je     0xffff8948e1f0              <0xffff8948e1f0>`; multi-word mnemonic `lock sub dword ptr [rip + 0x1d8ef2], 1`; `ret                                <0xffff8948e1ca>` (calls_stepret_x64.txt).

| | |
|---|---|
| Examples (x86_64) | `   0x555555557303 <main+8>     sub    rsp, 0xd0` · `b► 0x555555557317 <main+28>    mov    rax, qword ptr fs:[0x28]        RAX, [0xffff92927768] => 0x76f85efbfd30d300` · `   0x555555557320 <main+37>    mov    qword ptr [rbp - 8], rax        [0xffff9342cbc8] <= 0x76f85efbfd30d300` (continue_main_x64.txt) |
| | `   0x555555557379 <main+126>    jmp    main+161                    <main+161>` / `    ↓` / `   0x55555555739c <main+161>    cmp    dword ptr [rbp - 0xc0], 7       0 - 7     EFLAGS => 0x297 [ CF PF AF zf SF IF df of iopl:00 ac ]` / `   0x5555555573a3 <main+168>  ✔ jle    main+128                    <main+128>` (next_source_x64.txt) |
| | `   0x555555557484 <main+393>    call   free@plt                    <free@plt>` followed by ` ` (continue_main_x64.txt) · `b+ 0x555555557317 <main+28>    mov    rax, qword ptr fs:[0x28]` · ` ► 0x555555557320 <main+37>    mov    qword ptr [rbp - 8], rax …` (ni_x64.txt) |
| | no symbol: `   0xffffaa0be564    test   edx, 2` · `   0xffffaa0be56a  ? je     0xffffaa0be57d              <0xffffaa0be57d>` (target_remote_x64.txt) · ` ► 0xffff929df500 <malloc>        endbr64` (step_x64.txt) |
| Examples (aarch64) | `b► 0xaaaaaaaa0ae8 <main+20>    adrp   x0, 0xaaaaaaabf000     X0 => 0xaaaaaaabf000 ◂— 0` · `   0xaaaaaaaa0b00 <main+44>    add    x0, x0, #0x918         X0 => 0xaaaaaaaa0918 (add) (0xaaaaaaaa0000 + 0x918)` (run_bp_arm64.txt) |
| Invalid PC | `Invalid address 0x0` followed by blank lines (sigsegv_x64.txt) |
| Regex | `/^(b►|b\+| ►|  ) (0x[0-9a-f]+)(\s+)(<[^>]+>)?(\s+)([✔✘?] |  )?([a-z][a-z0-9.]*)(?:(\s+)(.*?))?$/` then split the tail: `/^(.*?)(\s{2,})(<[^>]+>)$/` (branch target) or `/^(.*?)(\s{2,})((?:[A-Z][A-Z0-9]*|\[[^\]]+\]|\[\{[^}]+\}\])(?:, \[[^\]]+\])? (?:=>|<=) .*|\S+ [-+] \S+ {2,}.*=> .*)$/` (annotation). Separators: `/^    ↓$/`, `/^ $/` (only inside DISASM). |
| Token | `current-marker` (`►`, `b►`), `breakpoint-marker` (`b+`), `address-code`, `symbol` (`<main+8>`), `branch-taken` (`✔`), `branch-not-taken` (`✘`), `branch-unknown` (`?`), `mnemonic` (branch mnemonics may get `mnemonic-branch`), operands → `operand-register` (`/\b(?:[re]?[abcd]x|[re]?[sd]i|[re]?[sb]p|r\d{1,2}[dwb]?|[abcd][lh]|[re]ip|[xw]\d{1,2}|[xw]zr|sp|lr|pc|q\d+|[xyz]mm\d+|fs|gs|cs|ds|ss|es)\b/`), `immediate` (`/(?:#-?)?\b0x[0-9a-f]+\b|#-?\d+\b|\b\d+\b/`), `keyword` (`qword|dword|word|byte|ptr|xmmword`), `punctuation` (`[ ] , ! { }`), `arrow` (`=>`, `<=`, `◂—`, `—▸`), `annotation` (whole tail), `branch-target` (`<…>` at end). |
| Colour | current line address+symbol `green,bold` (`theme highlight-color`), breakpoints `red`, branch mnemonics `bold`, `✔` green, `✘` red, `?` gray, asm text pygments `monokai` 256-colour (mnemonic `38;5;148`, register `38;5;81`, number `38;5;141`, punctuation `38;5;255`) (`pwndbg/color/syntax_highlight.py:21-27`; raw in next_source_x64.ansi). Already-executed instructions in emulated look-ahead are grayed (`nearpc.py:741-742`) — not inferable from text. |

### 3.5 Source lines (SOURCE (CODE), `context code`)

Format ` {prefix:{w}} {line_number:>{num_width}} {code}` (`pwndbg/lib/pretty_print.py:341`), preceded by `In file: <path>:<line>` (`context.py:1550`).

| | |
|---|---|
| Examples | `In file: /work/test.c:24` · `   18 void vuln(const char *src) {` · ` ► 24 int main(int argc, char **argv) {` · `   23 ` (blank source line) (continue_main_x64.txt) · `    7 const char *greeting = "Hello, pwndbg!";` (continue_compute_x64.txt) |
| Regex | header `/^In file: (.+):(\d+)$/`; line `/^ (►| ) +(\d+) (?!0x[0-9a-f]+(?: \S+)?$)(.*)$/` — the negative lookahead is required: without it the BACKTRACE row ` ► 0 0x555555557317 main+28` also matches (verified against _session_main_x64_x64.txt). Prefer section context, else test the backtrace regex first. |
| Token | `file-path`, `line-number`, `current-marker`, code → delegate to a C/C++ grammar (Prism `c`) if available |
| Colour | current line whole `green,bold`; code syntax-highlighted with pygments monokai (next_source_x64.ansi). |

### 3.6 Stack / telescope lines (STACK section, `telescope`, `stack`, `tls` dump)

Format: `{idx:02x}:{byteoffset:04x}│{reg-or-fp-offset} {chain}` (`pwndbg/commands/telescope.py:259-262, 291-302`).
The column after `│` is either register names (right-justified to ≥3, multiple separated by spaces,
`rsp-4`-style partial offsets) or the offset to the frame pointer `-0c8`/`+008` (`{offset:+04x}`).
Repeated values collapse into `... ↓  N skipped` (`telescope.py:231-241`).

| | |
|---|---|
| Examples x86_64 | `00:0000│ rsp 0xffff9342cb00 {argv} —▸ 0xffff9342ccf8 —▸ 0xffff9342cec8 ◂— './test_x64'` · `01:0008│-0c8 0xffff9342cb08 ◂— 0x100000006` · `1a:00d0│ rbp 0xffff9342cbd0 —▸ 0xffff9342cc70 —▸ 0xffff9342ccd0 ◂— 0` · `1b:00d8│+008 0xffff9342cbd8 —▸ 0xffff9295c1ca ◂— mov edi, eax` (stack_default_x64.txt) · `03:0018│-0b8 0xffff9342cb18 {fp} ◂— 0x40 /* '@' */` (continue_main_x64.txt) |
| No frame offset | `00:0000│     0x55555555a020 (global_buf) ◂— 'global data string'` · `02:0010│     0x55555555a030 (global_buf+16) ◂— 0x676e /* 'ng' */` (tele_global_x64.txt) |
| Skip marker | `... ↓     2 skipped` (tele_heap_x64.txt) · `... ↓        5 skipped` (nopie_ret_crash_x64.txt) · `... ↓       2 skipped` (run_bp_arm64.txt) |
| aarch64 | `00:0000│  sp 0xfffffffffa80 {argv} —▸ 0xfffffffffcc8 —▸ 0xfffffffffec6 ◂— '/work/test_arm64'` (two-letter reg right-justified) (run_bp_arm64.txt) · `00:0000│ fs_base 0xffff9a6b8740 ◂— 0xffff9a6b8740` (tls_x64.txt) |
| Other | `<Could not read memory at 0x…>` (**source-only**, telescope.py:248) |
| Regex | `/^([0-9a-f]{2,}):([0-9a-f]{4,})(│)(\s*(?:[a-z][a-z0-9_]*(?:-\d+)?(?: [a-z][a-z0-9_]*(?:-\d+)?)*)?\s*|[+-][0-9a-f]{3,4}\s*)(0x[0-9a-f]+)(.*)$/` ; skip `/^(\.\.\. ↓)(\s+)(\d+)( skipped)$/` |
| Token | `telescope-index` (`00:0000`), `separator` (`│`), `register-name` (lower-case here) or `frame-offset` (`-0c8`), then chain (§4), `skip-marker` |
| Colour | index/offset/separator `normal`, register `bold` (`pwndbg/color/telescope.py:5-24`), addresses by memory type. |

### 3.7 Backtrace lines (BACKTRACE section, `context backtrace`)

| | |
|---|---|
| Examples | ` ► 0 0x555555557489 main+398` · `   1 0xfffff7e184c4` · `   3 0x555555557105 _start+37` (continue_main_x64.txt) · ` ► 0 0x0` (sigsegv_x64.txt) · ` ► 0 0xaaaaaaaa0ae8 main+20` (run_bp_arm64.txt) |
| Older | ` ► f 0   0x55555555513d main+4` style: label `f ` default ≤ 2022.12.19 (**source-only**, `pwndbg/commands/context.py:756` @2022.12.19); column alignment via `rich` table only since 2026-06 (#3946). |
| Regex | `/^ (►| ) (?:f )?(\d+)\s+(0x[0-9a-f]+)(?: (\S+))?$/` |
| Token | `current-marker`, `frame-number`, address, `symbol` (`name+off`) |

### 3.8 LAST SIGNAL section

`Program received signal SIGSEGV (fault address: 0x0).` · `Program received signal SIGABRT` (sigsegv_arm64.txt, smash_run_arm64.txt). Bold red (`theme message-signal-color`). Under qemu-user the section was not shown (x64 captures) because the stop is not reported with siginfo. Regex `/^Program received signal (SIG[A-Z0-9]+)(.*)$/` (same as GDB's line, §9.2).

## 4. Pointer chains (shared by registers, telescope, annotations, got, search, retaddr …)

Grammar (`pwndbg/chain.py:105-249`, `pwndbg/enhance.py`, `pwndbg/color/memory.py:33-139`):
```
chain   := link ( " —▸ " link )* ( " ◂— " final | " —▸ " "..." )?
link    := ADDR [ " (" SYMBOL ")" | " {" VAR "}" ]
final   := INSTR | STRING | INT [ " ('" ascii "')" ] [ " /* " comment " */" ] | ADDR-with-symbol | "???"
```
* `—▸` (U+2014 U+25B8) = "points to (and continues)"; `◂—` (U+25C2 U+2014) = "dereferenced value / end of chain".
  If the chain hit the dereference limit (`dereference-limit = 5`) it ends with ` —▸ ...` (contiguous marker).
* symbols are in **parentheses** in chains (`(main+28)`), in **angle brackets** in disasm (`<main+28>`), and stack-variable names in **braces** (`{argv}`, `{big+0x8}`).
* Strings are Python `repr()` → normally single-quoted, may be double-quoted if they contain `'`, with `\n` escapes: `'buf=AAAA…\nack=AAAAAAAABBBBBBBBCCCCCCCC\n'` (nopie_ret_crash_x64.txt).
* Integers are hex without padding (`0x100000006`, `0`, `7`); small ints are decimal (`1`, `7`). If all bytes are printable an ASCII repr is appended: `0x4141414141414141 ('AAAAAAAA')` (`enhance.py:30-40`). Comments: `0x40 /* '@' */`, `0x41414141 /* 'AAAA' */` (`enhance.py:177`).
* An instruction appears after `◂—` when the pointer is code: `◂— endbr64`, `◂— mov rax, qword ptr [rbp - 0xb8]`, `◂— stp x29, x30, [sp, #-0x50]!`.

| | |
|---|---|
| Examples | `0xffff9342ccf8 —▸ 0xffff9342cec8 ◂— './test_x64'` · `0x555555559da0 (__do_global_dtors_aux_fini_array_entry) —▸ 0x555555557180 (__do_global_dtors_aux) ◂— endbr64` (continue_main_x64.txt) · `0xffff896e1820 —▸ 0xffff896e18e0 —▸ 0xffff896e1a00 —▸ 0xffff896e1a10 —▸ ...` (step_x64.txt) · `0x4342424242424242 ('BBBBBBBC')` (next_source_x64.txt) |
| Regexes | arrow `/ (—▸|◂—) /`; address+symbol `/\b0x[0-9a-f]+(?: \(([^()]+)\))?(?: \{([^{}]+)\})?/`; quoted string `/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/`; ascii-int `/\('[^']*'\)/`; comment `/\/\* .*? \*\//`; contiguous `/ —▸ \.\.\.$/` |
| Token | `arrow`, `address-*` (memory type by heuristic §A), `symbol`, `stack-var`, `string`, `number`, `comment`, `ellipsis` |
| Colour | arrows `none`; each address coloured by its mapping (STACK yellow, HEAP blue, CODE red, DATA purple, RODATA/unknown normal, WX underline); the address *and* its `(symbol)`/`{var}` share that colour (raw: `\x1b[33m0xffff9342cb00 {argv}\x1b[0m`, telescope_x64.ansi). Instructions after `◂—` are pygments-highlighted; strings/ints `none` by default (`pwndbg/color/enhance.py:5-17`). |

## 5. Memory display commands

### 5.1 `hexdump` / `dc`
```
+0000 0xffff9342cb00  f8 cc 42 93 ff ff 00 00  06 00 00 00 01 00 00 00  │..B.....│........│
+0010 0x55555555a030  6e 67 00 00 00 00 00 00  00 00 00 00 00 00 00 00  │ng......│........│
```
(hexdump_x64.txt, hexdump2_x64.txt, dc_x64.txt). Skipped identical lines: `... ↓            skipped N identical lines (M bytes)` (**source-only**, `pwndbg/hexdump.py:117`).
Regex `/^(\+[0-9a-f]{4,}) (0x[0-9a-f]+)  ((?:[0-9a-f]{2} {1,2})+)\s*(│)(.*?)(│)(.*?)(│)$/`.
Tokens: `offset`, address, `hex-byte` (00 → could be `hex-zero`), ascii → `string`. Colours: printable bytes bold, `00` red, special (0x0a, 0xff, …) yellow (`theme hexdump-*`, `pwndbg/color/hexdump.py:7-30`); ascii coloured likewise (`hexdump-colorize-ascii on`).

### 5.2 windbg-style `dq`/`dd`/`dw`/`db`/`ds`
```
0000ffff9b1bdb00     0000ffff9b1bdcf8 0000000100000006
0000ffff9b1bdb00     9b1bdcf8 0000ffff 00000006 00000001
0000ffff9b1bdb00     f8 dc 1b 9b ff ff 00 00 06 00 00 00 01 00 00 00
555555558004 'Hello, pwndbg!'
```
(dq/dd/db/ds_x64.txt). Address is zero-padded **without** `0x`, 5 spaces, then hex words. Regex `/^([0-9a-f]{8,16})(     )((?:[0-9a-f]{2,16} ?)+)$/`; ds `/^([0-9a-f]+) ('.*')$/`. Source `pwndbg/commands/windbg.py:192`.

### 5.3 `x/` (GDB, unchanged by pwndbg) — see §9.3; pwndbg-specific difference: intel syntax in `x/i`.

## 6. `vmmap`, `xinfo`, `elfsections`, `piebase`, `checksec`, `got`, `plt`

### 6.1 vmmap
```
LEGEND: STACK | HEAP | CODE | DATA | WX | RODATA
             Start                End Perm     Size  Offset File (set vmmap-prefer-relpaths on)
    0x555555556000     0x555555557000 r--p     1000       0 test_x64
    0x55555555b000     0x55555557c000 rw-p    21000       0 [heap]
    0xffff92c2d000     0xffff9342d000 rw-p   800000       0 [stack]
0xffffffffff600000 0xffffffffff601000 --xp     1000       0 [vsyscall]
```
(vmmap_x64.txt). Filtered: `►     0xffff92c2d000     0xffff9342d000 rw-p   800000       0 [stack]` with neighbours indented by 2 (vmmap_stack_x64.txt); single filtered address appends ` +0x…` (**source-only**, `pwndbg/commands/vmmap.py:340-341`). aarch64 end can exceed width: `    0xfffffffdf000    0x1000000000000 rw-p    21000       0 [stack]` (vmmap_arm64.txt). WX example: `    0xffffaa0de000     0xffffaa8de000 rwxp   800000       0 [stack]` (nopie_vmmap_x64.txt).
Header: `pwndbg/commands/vmmap.py:45-54`; row `pwndbg/lib/memory.py:32-41` (`{vaddr:#{w}x} {end:#{w}x} {perm} {size:8x} {offset:7x} {objfile}`, hex sizes **without** 0x).
Regex row `/^(►)?(\s*)(0x[0-9a-f]+)(\s+)(0x[0-9a-f]+) ([r-][w-][x-][ps]) (\s*[0-9a-f]+) (\s*[0-9a-f]+) ?(.*?)(?: (\+0x[0-9a-f]+))?$/`; header `/^\s+Start\s+End Perm\s+Size\s+Offset File.*$/`.
Colour: **the whole row** is coloured by type — stack yellow, heap blue, executable red, writable purple, read-only normal, `rwx` underline+colour (nopie_vmmap_x64.ansi: `\x1b[4m\x1b[33m … rwxp … [stack]`). Here the class *is* inferable from text: perm `x` → code, `[stack…]` → stack, `[heap…]` → heap, `w` → data, else rodata; `rwx` → also wx (exactly the order of `pwndbg/color/memory.py:107-129`).
Under qemu-user anonymous maps are labelled `[anon_ffff917f8]`; on qemu < 8.1 a footer `[QEMU <8.1 target detected - vmmap result might not be accurate; see \`help vmmap\`]` (**source-only**, vmmap.py:355-358).

### 6.2 checksec (pwntools `ELF.checksec()` text, `pwndbg/wrappers/checksec.py:30-39`)
```
File:     /work/test_x64
Arch:     amd64
RELRO:      Full RELRO
Stack:      Canary found
NX:         NX enabled
PIE:        PIE enabled
SHSTK:      Enabled
IBT:        Enabled
Stripped:   No
Debuginfo:  Yes
```
(checksec_x64.txt) and the weak variant (nopie_checksec_x64.txt): `RELRO:      No RELRO`, `Stack:      No canary found`, `NX:         NX unknown - GNU_STACK missing`, `PIE:        No PIE (0x400000)`, `Stack:      Executable`, `RWX:        Has RWX segments`. aarch64 omits SHSTK/IBT (checksec_arm64.txt). Other pwntools values (**source-only**, pwntools): `Partial RELRO`, `NX disabled`, `FORTIFY: Enabled`, `RPATH:`/`RUNPATH:`, `ASAN`/`UBSAN`.
Regex `/^(File|Arch|RELRO|Stack|NX|PIE|SHSTK|IBT|Stripped|Debuginfo|RWX|FORTIFY|RPATH|RUNPATH|ASAN|UBSAN|Packer|Comment):(\s+)(.*)$/`. Colour (pwntools red/green/yellow mapped to pwndbg error/success/warn): good values green (`Full RELRO`, `Canary found`, `NX enabled`, `PIE enabled`, `Enabled`), bad red (`No RELRO`, `No canary found`, `No PIE`, `Executable`, `Has RWX segments`), partial yellow. Token `checksec-key`, `checksec-good` / `checksec-bad` / `checksec-warn` via value word lists.

### 6.3 got / plt / piebase / canary / xinfo / elfsections / retaddr / search / distance
* got: `[0x555555559fb0] free@GLIBC_2.2.5 -> 0xffff9a770be0 (free) ◂— endbr64` (got_r_x64.txt), header `GOT protection: Full RELRO | Found 10 GOT entries passing the filter`. Regex `/^\[(0x[0-9a-f]+)\] (\S+) -> (.*)$/` (note: plain ASCII `->`, then chain).
* plt: `0x555555557090: free@plt`, `Section .plt.sec 0x555555557090 - 0x5555555570e0:` (plt_x64.txt).
* piebase: `Calculated VA from /work/test_x64 = 0x555555556000` (piebase_x64.txt). brva: `Breakpoint 3 at 0x555555557000`.
* canary: `AT_RANDOM  = 0xffff9342ceb0 # points to the canary value on glibc < 2.44` · `Canary     = 0x76f85efbfd30d300` · `00:0000│-308 0xffff9342c8c8 ◂— 0x76f85efbfd30d300` (canary_x64.txt). `# …` is a comment.
* retaddr: `0xffff9342cc78 —▸ 0xffff9295c28b (__libc_start_main+139) ◂— mov r15, qword ptr [rip + 0x1d8cf6]` (retaddr_x64.txt).
* search: `Searching for byte: b'global data'` then `test_x64        0x55555555a020 'global data string'` / `[stack]         0xffff9342cb90 'AAAAAAAABBBBBBBBCCCCCCCC'` (search_str/search_t_x64.txt). Regex `/^(\S+)(\s+)(0x[0-9a-f]+) (.*)$/` after a `Searching for` header.
* xinfo: `       Stack Top 0xffff9342cb00 = 0xffff92c2d000 + 0x7ffb00` (xinfo_x64.txt).
* elfsections: `    0x555555556318     0x555555556334      R--       0x1c  .interp` (elfsections_x64.txt).
* distance: `0xffff9342cb00->0x555555557489 is -0xaaaa3ded5677 bytes (-0x155547bdaacf words)`.
* cyclic: `aaaabaaacaaadaaaeaaafaaagaaahaaa`; `Finding cyclic pattern of 4 bytes: b'laaa' (hex: 0x6c616161)` / `Found at offset 44` (cyclic*_x64.txt).

## 7. Heap (glibc) commands

### 7.1 `heap`, `malloc-chunk`, `top-chunk`
```
Allocated chunk | PREV_INUSE
Addr: 0x55555555b000
Size: 0x290 (with flag bits: 0x291)

Free chunk (tcachebins) | PREV_INUSE
Addr: 0x55555555b290
Size: 0x30 (with flag bits: 0x31)
fd: 0x55555555b

Free chunk (unsortedbin) | PREV_INUSE
Addr: 0x55555555b5c0
Size: 0x510 (with flag bits: 0x511)
fd: 0x55500000e78b
bk: 0xfffff7fa0ab0

Top chunk | PREV_INUSE
Addr: 0x55555555bfe0
Size: 0x20020 (with flag bits: 0x20021)
```
(heap_x64.txt, top_chunk_x64.txt). Header regex `/^(Allocated chunk|Free chunk \([a-z]+(?: [a-z]+)?\)|Top chunk|Fake chunk)((?: \| (?:PREV_INUSE|IS_MMAPED|NON_MAIN_ARENA))*)$/`; field `/^(Addr|Size|prev_size|fd|bk|fd_nextsize|bk_nextsize): (0x[0-9a-f]+)(?: \(with flag bits: (0x[0-9a-f]+)\))?$/`.
Colours (`pwndbg/commands/glibc_malloc.py:618-690`): `Allocated chunk` yellow (hint), `Free chunk (…)` green (on), `Top chunk` red (off), flags yellow, field names light-red (system).
Note safe-linking: tcache/fastbin `fd` values are mangled (`fd: 0x55500000e7fb`, `fd: 0x55555555b`) — they do not look like heap pointers.

### 7.2 `bins`, `tcachebins`, `fastbins`, `unsortedbin`, `smallbins`, `largebins`
```
tcachebins
0x30 [  7]:  0x55555555b3c0 —▸ 0x55555555b390 —▸ … —▸ 0x55555555b2a0 ◂— 0
0x90 [  1]:  0x55555555b420 ◂— 0
fastbins
0x30:        0x55555555b3e0 ◂— 0
unsortedbin
all:         0x55555555b5c0 —▸ 0xffff92b35b20 ◂— 0x55555555b5c0
smallbins
empty
largebins
empty
```
(bins_x64.txt; `pwndbg/commands/glibc_malloc.py:72-147`). Size label padded to 13 cols; tcache count `[%3d]`; largebins `0x400-0x430`, last `…-∞`; corrupted: `0x80 [corrupted]` + `FD: …` / `BK: …` (**source-only**, lines 117-135).
Regex: bin-type line `/^(tcachebins|fastbins|unsortedbin|smallbins|largebins)$/`; entry `/^(0x[0-9a-f]+(?:-(?:0x[0-9a-f]+|∞))?|all)(?: \[\s*(\d+)\])?(:)(\s+)(.*)$/`; `/^empty$/`; `/^(FD|BK): (.*)$/`.
Colours: size labels / counts / `empty` yellow (hint), `[corrupted]` red.

### 7.3 `vis-heap-chunks` / `vis`
Tab separated: `addr\t0x<cell>\t0x<cell>\t<ascii>[\t <-- label, label]`:
```
0x55555555b290	0x0000000000000000	0x0000000000000031	........1.......
0x55555555b2a0	0x000000055555555b	0x5368e5dc04201038	[UUU....8. ...hS	 <-- tcachebins[0x30][6/7]
```
(vis_x64.txt; `pwndbg/aglib/memory.py:483-600`). Collapsed repeats `\t... ↓     N repeated lines skipped` (`memory.py:513`); truncated huge chunks: a line of dots as long as the address (`memory.py:540-542`); footer `Not all chunks were shown, see \`vis --help\` for more information.`; top label `Top chunk`.
Regex `/^(0x[0-9a-f]+)\t(0x[0-9a-f]+)\t(0x[0-9a-f]+|\s+)\t(\S*)(?:\t (<--) (.*))?$/`.
Colour: each chunk's cells+ascii coloured cyclically yellow, cyan, purple, green, blue (`glibc_malloc.py:1228-1234`) — **not inferable from text** (chunk boundaries can be reconstructed from size fields but that is beyond a regex highlighter).

### 7.4 `arena` — a GDB struct print (`{ mutex = 0x0, … }`, arena_x64.txt): highlight with the GDB value grammar (§9.4).
### 7.5 `try-free`, `find-fake-fast`: free text with `FAKE CHUNKS` header, `Free should succeed!` (try_free_x64.txt).

## 8. Misc pwndbg messages

* Errors: `Exception occurred: malloc_chunk: Cannot access memory at address 0x555554000000 (<class 'pwndbg.dbg_mod.DebuggerError'>)` + `For more info invoke \`set exception-verbose on\` and rerun the command` (find_fake_fast_x64.txt). Regex `/^Exception occurred: .*$/` → `error`.
* `Undefined command: "vis_heap_chunks".  Try "help".` (GDB error; old_vis_heap_chunks_x64.txt, see §C).
* `QEMU target detected: showing result for the qemu process …` (procinfo_x64.txt); `ASLR is ??? (Could not detect ASLR on QEMU targets)` (aslr_x64.txt).
* Value-returned after finish: `Value returned is $6 = 0xd` (finish_x64.txt).

## 9. Vanilla GDB (also appears inside pwndbg sessions)

Vanilla captures: `*_vanilla_arm64.*`, `*_vanilla_x64.*` (`gdb -nx`, GDB 15.1). GDB 15 *does* colourise
(styling) on a tty: file names green, function names yellow, variables cyan, addresses blue, source lines via
GNU source-highlight (raw: run_bp_arm64.ansi `Breakpoint 1, \x1b[33mmain\x1b[m (\x1b[36margc\x1b[m=0x1, …) at \x1b[32mtest.c\x1b[m:24`).
These colours are also lost on paste.

**Radix difference:** under pwndbg, GDB prints values in hex (`main (argc=0x1, argv=…)`, `$1 = 0x0`,
`Value returned is $6 = 0xd`, `i = 0x8`); vanilla prints decimal (`argc=1`, `Value returned is $10 = 13`, `i = 8`)
(bt_x64.txt vs v_bt_vanilla_x64.txt). **Disassembly flavour:** vanilla x86 is AT&T (`mov    %rsp,%rbp`, `$0xd0`,
`-0xc4(%rbp)`), pwndbg sets Intel (`mov    rbp,rsp`, `DWORD PTR [rbp-0xc4]`) — a highlighter must handle both.

### 9.1 Startup banner / misc
```
GNU gdb (Ubuntu 15.1-1ubuntu1~24.04.1) 15.1
Copyright (C) 2024 Free Software Foundation, Inc.
…
For help, type "help".
Type "apropos word" to search for commands related to "word"...
Reading symbols from ./test_arm64...
```
(startup_vanilla_banner_arm64.txt). `(No debugging symbols found in /usr/x86_64-linux-gnu/lib64/ld-linux-x86-64.so.2)` (target_remote_x64.txt). Token: `comment`.

### 9.2 Run-control messages (identical with and without pwndbg)

| Line type | Verbatim examples | Regex | Token |
|---|---|---|---|
| breakpoint set | `Breakpoint 1 at 0x555555557317: file test.c, line 24.` (break_main_x64.txt) · `Breakpoint 1 at 0xae8: file test.c, line 24.` (pre-run PIE offset, v_break_main_vanilla_arm64.txt) · `Temporary breakpoint 2 at 0x55555555725c: file test.c, line 13.` · `Breakpoint 3 at 0x555555557000` (breakrva_x64.txt) · `Hardware watchpoint 2: r` (watch_r_x64.txt) | `/^(Temporary breakpoint|Breakpoint|Hardware watchpoint|Watchpoint|Hardware read watchpoint|Hardware access \(read\/write\) watchpoint|Catchpoint) (\d+)(?: at (0x[0-9a-f]+))?(?:: (?:file (.+), line (\d+)\.|(.+)))?$/` | `bp-message`, number, address, file-path, line-number |
| breakpoint hit | `Breakpoint 1, main (argc=0x1, argv=0xfffffffffcc8) at test.c:24` · `Breakpoint 1, 0x00005555555573a3 in main (argc=0x1, argv=0xffff89f5ecf8) at test.c:31` (calls_continue_start_x64.txt) · `Temporary breakpoint 2, compute (f=0x5555555571c9 <add>, x=6, y=7) at test.c:13` (v_continue_tbreak_vanilla_x64.txt) | `/^(Temporary breakpoint|Breakpoint) (\d+), (?:(0x[0-9a-f]+) in )?([\w:~<>.@]+) \((.*)\)(?: at (.+):(\d+))?$/` | `bp-hit`, function → `function`, args → `name=value` pairs |
| watchpoint hit | `Hardware watchpoint 2: r` / blank / `Old value = 0x0` / `New value = 0xd` (watch_hit_arm64.txt) | `/^(Old|New) value = (.*)$/` | `watch-label`, value |
| frame line (after stop/finish/up/frame/until) | `main (argc=1, argv=0xfffffffffcc8) at test.c:41` · `0x00005555555574a2 in main (argc=1, argv=0xffff935a9cf8) at test.c:38` · `0x0000000000000000 in ?? ()` · `0x0000ffff929df500 in malloc () from /usr/x86_64-linux-gnu/lib/libc.so.6` (step_x64.txt) · `__pthread_kill_implementation (threadid=…, signo=signo@entry=6, no_tid=no_tid@entry=0)` + continuation `    at ./nptl/pthread_kill.c:44` | `/^(?:(0x[0-9a-f]+) in )?([\w:~<>.@?]+) \((.*)\)(?: (at|from) (.+?)(?::(\d+))?)?$/`; continuation `/^    at (.+):(\d+)$/` | address, `function`, `file-path` |
| source echo | `24	int main(int argc, char **argv) {` (TAB after number) · `0x0000555555557320	24	int main(int argc, char **argv) {` (ni mid-line: address TAB line TAB source, ni_x64.txt) · `warning: 44	./nptl/pthread_kill.c: No such file or directory` | `/^(?:(0x[0-9a-f]{16})\t)?(\d+)\t(.*)$/` | address, `line-number`, code (C grammar) |
| list | `19	    char buf[32];` (v_list_vanilla_arm64.txt) — same as source echo | as above | |
| continuing | `Continuing.` · `Starting program: /work/test_arm64 ` · `Run till exit from #0  compute (f=0x5555555571c9 <add>, x=0x6, y=0x7) at test.c:13` · `Value returned is $6 = 0xd` · `[Thread debugging using libthread_db enabled]` · `Using host libthread_db library "/lib/aarch64-linux-gnu/libthread_db.so.1".` · `Remote debugging using :1234` | `/^(Continuing\.|Starting program: .*|Run till exit from .*|Value returned is (\$\d+) = (.*)|\[Thread debugging .*\]|Using host libthread_db .*|Remote debugging using .*)$/` | `gdb-message`, value-history `$6` |
| signal | `Program received signal SIGSEGV, Segmentation fault.` (sigsegv_x64.txt) · `Program received signal SIGABRT, Aborted.` · `Program received signal SIGBUS, Bus error.` (nopie_ret_crash_arm64.txt) · `*** stack smashing detected ***: terminated` (program stderr) | `/^Program (received|terminated with) signal (SIG[A-Z0-9]+), (.*)\.$/` | `signal` (pwndbg colour bold red for its own LAST SIGNAL line) |
| exit | `[Inferior 1 (process 422) exited normally]` (continue_end_x64.txt) · `[Inferior 1 (process 885) killed]` (v_kill_confirm_vanilla_x64.txt) · `[Inferior 1 (process N) exited with code 01]` (**source-only**, standard GDB) | `/^\[Inferior (\d+) \(process (\d+)\) (exited normally|exited with code (\d+)|killed)\]$/` | `exit-message` |
| errors | `The program is not being run.` · `No registers.` · `Cannot access memory at address 0x0` (`=> 0x0:	Cannot access memory at address 0x0`, v_x_i_segv_vanilla_x64.txt) · `Undefined command: "malloc_chunk".  Try "help".` · `Initial frame selected; you cannot go up.` · `Could not insert hardware watchpoint 2.` | `/^(No registers\.|The program is not being run\.|Cannot access memory at address 0x[0-9a-f]+|Undefined command: ".*"\.  Try "help"\.|warning: .*|Warning:)$/` | `error` |
| info breakpoints | `Num     Type           Disp Enb Address            What` / `1       breakpoint     keep y   0x0000555555557317 in main at test.c:24` (info_breakpoints_x64.txt) · `2       breakpoint     del  y   0x0000000000000a00 in compute at test.c:13` · `No breakpoints, watchpoints, tracepoints, or catchpoints.` | `/^(\d+)(\s+)(breakpoint|hw watchpoint|read watchpoint|acc watchpoint|catchpoint)\s+(keep|del|dis)\s+([yn])\s+(0x[0-9a-f]+)?\s*(.*)$/` | |

### 9.3 `x/` examine output
Line = `ADDR[ <sym+off>]:\t` + items separated by TAB (`\t`).

| Format | Verbatim | Notes |
|---|---|---|
| `x/20gx` | `0x555555558004:	0x48	0x65` (x_20gx_x64.txt) | 2 per line, zero-padded 16 hex |
| `x/3xg &sym` | `0x55555555a020 <global_buf>:	0x64206c61626f6c67	0x6972747320617461` (x_3xg_x64.txt) | symbol label `<sym+off>` before colon |
| `x/4wx` | `0x555555558004:	0x48	0x65	0x6c	0x6c` | 4 per line |
| `x/8bx` | `0x555555558004:	0x48	0x65	0x6c	0x6c	0x6f	0x2c	0x20	0x70` | 8 per line |
| `x/4dw` | `0xffff9b1bdb00:	-1692672776	65535	6	1` (x_d_x64.txt) | decimal |
| `x/8c` | `0xaaaaaaaa0d28:	72 'H'	101 'e'	108 'l'	108 'l'	111 'o'	44 ','	32 ' '	112 'p'` (v_x_c_vanilla_arm64.txt) | |
| `x/s` | `0x555555558004:	"Hello, pwndbg!"` · `0x55555555a033 <global_buf+19>:	""` (x_s_x64.txt, x_s2_x64.txt) | double-quoted C string |
| `x/i` | `=> 0x555555557489 <main+398>:	mov    rax,QWORD PTR [rbp-0xb8]` (pwndbg, intel) · `=> 0x555555557489 <main+398>:	mov    -0xb8(%rbp),%rax` (vanilla AT&T) · `   0x5555555574a8 <main+429>:	lea    rax,[rip+0xfffffffffffffd59]        # 0x555555557208 <mul>` · aarch64 `=> 0xaaaaaaaa0c44 <main+368>:	mov	w2, #0x7                   	// #7` | `=> ` marks PC, `   ` otherwise; x86 mnemonic padded with spaces, aarch64 mnemonic followed by TAB; comments `# …` (x86) or `// …` (aarch64) |

Regex (data): `/^(0x[0-9a-f]+)(?: (<[^>]+>))?:(\t.*)$/`, then items `/\t(-?0x[0-9a-f]+|-?\d+(?: '(?:[^'\\]|\\.*)')?|"(?:[^"\\]|\\.)*")/g`.
Regex (insn): `/^(=> |   )(0x[0-9a-f]+)(?: (<[^>]+>))?:\t(\S+)(\s+)?(.*?)(?:(\s+)((?:#|\/\/) .*))?$/`.
Tokens: address, symbol, `number`, `string`, `current-marker` (`=>`), mnemonic, operands, `comment`.

### 9.4 `p` / `print`, `info locals`, `bt full`, `ptype`
`$1 = 0x0` · `$2 = 0x5555555571c9` · `$3 = {0x55555555b2a0, 0x55555555b2d0, 0x55555555b300}` · `$4 = 0x555555558004 "Hello, pwndbg!"` ·
`$5 = "global data string", '\000' <repeats 45 times>` · `$3 = (op_fn) 0x5555555571c9 <add>` · `$1 = (void *) 0xffff9b1bdb00` · `type = int (*)(int, int)` (p*_x64.txt, ptype_x64.txt, p_sp_x64.txt).
Locals: `stackbuf = "AAAAAAAABBBBBBBBCCCCCCCC", '\000' <repeats 17 times>, "\373\255\221\377\377\000"` (info_locals_x64.txt); in `bt full` the same lines are indented 8 spaces; long arrays wrap with 2-space continuation.
Regex: `/^(\$\d+) = (?:\(([^)]+)\) )?(.*)$/`, locals `/^(\s*)([A-Za-z_]\w*) = (.*)$/`, type `/^type = (.*)$/`. Value sub-tokens: `/0x[0-9a-f]+/` address, `/<[^>]+>/` symbol, `"…"`/`'…'` strings (with `\ooo` escapes), `<repeats \d+ times>`/`<optimized out>` → `comment`, `{`/`}` punctuation, `name = ` field names (arena struct, arena_x64.txt).

### 9.5 `info registers`
x86_64 (pwndbg/vanilla identical layout; column 1 name padded to 15, column 2 hex padded to 19, column 3 natural):
`rax            0x0                 0` (vanilla) / `rax            0x0                 0x0` (pwndbg radix 16) · `rip            0x555555557489      0x555555557489 <main+398>` · `eflags         0x206               [ IOPL=0 IF PF ]` · `cs             0x33                51` · `fs_base        0xffff92aa4740      281473142376256` (v_info_registers_vanilla_x64.txt, info_registers_x64.txt). qemu adds `cr0 … [ PG WP PE ]`, `efer`, `k_gs_base` — not present natively.
aarch64: `x0             0x510               0x510` · `sp             0xfffffffffa80      0xfffffffffa80` · `pc             0xaaaaaaaa0c44      0xaaaaaaaa0c44 <main+368>` · `cpsr           0x80001000          [ EL=0 BTYPE=0 SSBS N ]` · `fpcr           0x0                 [ Len=0 Stride=0 RMode=0 ]` (info_registers_arm64.txt).
Vector regs print as multi-line structs: `xmm0           {` / `  v4_float = {0x0, 0x0, 0x0, 0x0},` / `}`.
Regex `/^([a-z][a-z0-9_]*)(\s+)(0x[0-9a-f]+|\{)(\s+)?(.*)$/` (only when the line also has 2+ columns; lower-case register name = vanilla style).

### 9.6 `disassemble`
```
Dump of assembler code for function main:
   0x00005555555572fb <+0>:	endbr64
   0x0000555555557326 <+43>:	lea    rax,[rip+0xfffffffffffffe9c]        # 0x5555555571c9 <add>
=> 0x0000555555557489 <+398>:	mov    rax,QWORD PTR [rbp-0xb8]          (current-PC form, standard GDB)
   0x0000555555557380 <+133>:	call   0x5555555570d0 <malloc@plt>
End of assembler dump.
```
(disassemble_x64.txt; `=>` line form from x_10i). AT&T: `   0x0000555555557303 <+8>:	sub    $0xd0,%rsp` (v_disassemble_vanilla_x64.txt). `/r`: `   0x00005555555571db <+18>:	64 48 8b 04 25 28 00 00 00	mov    rax,QWORD PTR fs:0x28` (v_disassemble_r_vanilla_x64.txt, after `set disassembly-flavor intel`); aarch64 `/r`: `   0x0000aaaaaaaa0918 <+0>:	d100c3ff	sub	sp, sp, #0x30`. `/s` interleaves `test.c:` and `11	int mul(...)` source lines (v_disassemble_s_vanilla_arm64.txt). aarch64 branch with condition comment: `b.eq	0xaaaaaaaa0970 <add+88>  // b.none`.
Regex `/^(=> |   )(0x[0-9a-f]+) (<\+\d+>):\t(?:((?:[0-9a-f]{2} )+[0-9a-f]{2}|[0-9a-f]{8})\s*\t)?(\S+)(?:(\s+)(.*?))?(?:(\s+)((?:#|\/\/) .*))?$/`; framing `/^(Dump of assembler code for function (.+):|End of assembler dump\.)$/`.
Operands: Intel `QWORD PTR [rbp-0xb8]`; AT&T `%reg` registers, `$imm` immediates, `disp(%base,%index,scale)` memory → register regex must accept an optional `%` prefix and immediates an optional `$` / `#` prefix.

### 9.7 `bt` / `backtrace`
`#0  main (argc=0x1, argv=0xfffffffffcc8) at test.c:38` · `#1  0x0000ffff9295c1ca in ?? () from /usr/x86_64-linux-gnu/lib/libc.so.6` · `#3  0x0000555555557105 in _start ()` (bt_x64.txt) ·
`#1  0x0000fffff7e184c4 in __libc_start_call_main (main=main@entry=0xaaaaaaaa0ad4 <main>, argc=argc@entry=0x1, ` + continuation `    argv=argv@entry=0xfffffffffcc8) at ../sysdeps/nptl/libc_start_call_main.h:58` (bt_arm64.txt) ·
`#10 0x00000000004042d0 in ?? ()` (two-digit frame: one space) · `Backtrace stopped: previous frame identical to this frame (corrupt stack?)` (v_bt_smash_vanilla_arm64.txt) · `#7  0x0000aaaaaaaa0ac8 in vuln (src=0xfffffffffe72 'A' <repeats 100 times>) at test.c:22`.
Regex `/^(#\d+)(\s+)(?:(0x[0-9a-f]+) in )?([\w:~<>.@?]+|\?\?) \((.*?)\)?(?: (at|from) (.+?)(?::(\d+))?)?$/`, continuation `/^ {4}\S.*$/` when previous line was a frame.
Tokens: `frame-number`, address, `function`, args, `file-path`, `line-number`.

### 9.8 `info frame`, `info proc mappings`, `info sharedlibrary`, `info threads`, `info symbol`, `info line`
* `Stack level 0, frame at 0xffff935a9be0:` / ` rip = 0x555555557489 in main (test.c:38); saved rip = 0xffff92ad91ca` / `  rbp at 0xffff935a9bd0, rip at 0xffff935a9bd8` (info_frame_x64.txt).
* mappings header `          Start Addr           End Addr       Size     Offset  Perms  objfile`, rows `      0x555555556000     0x555555557000     0x1000        0x0  r--p   /work/test_x64` (info_proc_mappings_x64.txt; older GDB releases print the table without the `Perms` column — **not captured/verified**, accept both). Unlike pwndbg vmmap, Size/Offset have `0x`. Regex `/^\s+(0x[0-9a-f]+)\s+(0x[0-9a-f]+)\s+(0x[0-9a-f]+)\s+(0x[0-9a-f]+)\s+([r-][w-][x-][ps])\s*(.*)$/`.
* `From                To                  Syms Read   Shared Object Library` / `0x0000ffff92bef000  0x0000ffff92c19195  Yes (*)     /usr/x86_64-linux-gnu/lib64/ld-linux-x86-64.so.2`.
* `* 1    Thread 717.717 (CPU#0 [running]) main (argc=0x1, argv=0xffff9b1bdcf8) at test.c:38` (qemu; native shows `process N`/`Thread 0x… (LWP N)`).
* `main + 423 in section .text of /work/test_x64` · `Line 38 of "test.c" starts at address 0x555555557489 <main+398> and ends at 0x5555555574a8 <main+429>.`
* `display/i $pc` → `1: x/i $pc` / `=> 0x555555557490 <main+405>:	mov    edx,0x7` (si_display_x64.txt).

---

## Regex validation

The main regexes in this file were run (Node 24) against the captures: banner 11/11 header lines, register 68 lines with 0 misses
inside REGISTERS, disasm 0 misses inside DISASM (blank, ` ` and `    ↓` lines excluded), telescope 0 misses inside STACK, plus
vmmap/bins/hexdump/x/disassemble/bt/info-registers/call-args/breakpoint-hit samples all matching. Outside their sections the
register and disasm regexes only matched genuine `regs`/`nearpc` output; the source-line regex needed the lookahead above.

## A. Ambiguities / heuristics (plain text only)

1. **Memory type of an address is not in the text.** pwndbg colours by looking up the live vmmap
   (`pwndbg/color/memory.py:101-139`). Heuristics, in priority order:
   1. If the paste contains a `vmmap` table (or `info proc mappings`, `xinfo`), build a range table from it and classify every
      address by the same rules pwndbg uses: objfile contains `[stack` → STACK; perm has `x` → CODE; no `w` → RODATA;
      `[heap` → HEAP; writable → DATA; `rwx` → additionally WX. This is exact.
   2. Context clues on the same line: telescope rows (`NN:NNNN│`) are always stack/telescoped region — the first address of a
      STACK-section row is a stack address; a `{var}` suffix means a stack variable (STACK); `(symbol)` after an address means
      it's in a mapped object → usually CODE if the chain ends with an instruction (`◂— endbr64`, `◂— mov …`), else DATA/RODATA
      (`(global_buf)`, `(_rtld_global)`, `(main_arena+96)` → DATA); values in RSP/RBP/SP/X29 registers → STACK; `fd:`/`bk:`/bins
      chain heads and `Addr:` in `heap` output → HEAP; `[heap]`, `[stack]` words.
   3. Numeric ranges (Linux x86_64 native, ASLR on): `0x7ffc…–0x7fff…` stack, `0x7f……` libraries/mmap (CODE if followed by an
      instruction, else DATA/RODATA), `0x55…/0x56…` PIE image, and heap directly after it (`0x55…`/`0x56…` + ~0x1000-0x21000),
      `0x40xxxx`/`0x4xxxxx` non-PIE image, heap `0x4xxxxx`–`0x2xxxxxx` after it; `0xffffffffff600000` vsyscall.
      With GDB's default `disable-randomization on`: PIE `0x555555558004`, libs `0x7ffff7…`, stack `0x7ffffffde000-0x7ffffffff000`.
      aarch64 native (captured): PIE `0xaaaaaaaa0000`, heap `0xaaaaaaac1000`, libs `0xfffff7……`, stack `0xfffffffdf000-0x1000000000000`.
      qemu-user x86_64 (captured): libs/stack at `0xffff……` — the numeric heuristic is unreliable there, prefer (1)/(2).
   4. Otherwise emit a neutral `address` class. Never guess WX from the address alone.
2. **Changed register** is marked by a literal `*` → reliable. Colour (red) adds nothing.
3. **Current instruction / line**: `►`/`b►` (disasm), ` ►` (source, backtrace), `=>` (GDB) → reliable. The *grayed* already-executed
   emulated instructions and PC-highlight colour are not inferable.
4. **Branch taken**: `✔`/`✘`/`?` reliable; `    ↓` = jump-follow arrow. A line containing only a single space is a branch/call separator,
   indistinguishable from an empty line except by containing exactly `" "`.
5. **Flags**: case encodes set/clear (`CF` vs `cf`) → reliable; *changed* flags (underline) not inferable.
6. **Strings vs. instructions after `◂—`**: strings are quoted; integers start with `0x` or a digit; anything else is an instruction
   (mnemonic first). `???` = unknown.
7. **Safe-linked pointers** (`0x55500000e7fb`, `0x55555555b`) look like garbage; don't try to classify them as heap.
8. **Section membership** matters: register regexes (`^[ *][A-Z]…`) and disasm regexes should be enabled only after the
   matching banner (stateful/line-context highlighting), otherwise C source (`   12 `) and program output can false-positive.
   Without banners (e.g. a pasted `regs` or `nearpc` alone) the lines are still self-identifying by their shapes (marker column +
   upper-case reg; `0x…` + `<sym>` + mnemonic).
9. **Program stdout is interleaved** with debugger output (`Hello, pwndbg! global data string …`, `buf=AAAA…`) — no marker.
10. Banner width = terminal width at capture time; never rely on a fixed number of `─`.
11. pwndbg vs vanilla: `(gdb)` prompt → vanilla; `pwndbg>` prompt / `LEGEND:` / `─[` → pwndbg. Hex vs decimal radix and Intel vs
    AT&T are also hints but users can change them.
12. Colour themes: users may change every glyph/colour via `theme` (§B); `set disable-colors on` gives plain output identical to what
    we get after stripping.

## B. Configurable glyphs (all theme params; defaults from docs/configuration/theme.md, autogenerated)

| param | default | where |
|---|---|---|
| banner-separator / banner-title-surrounding-left/right / banner-title-position | `─` / `[ ` / ` ]` / center | `pwndbg/ui.py:32-47` |
| chain-arrow-right / chain-arrow-left / chain-contiguous-marker | `—▸` / `◂—` / `...` | `pwndbg/chain.py:99-103` |
| nearpc-prefix / nearpc-breakpoint-prefix / nearpc-current-breakpoint-prefix | `►` / `b+` / `b►` | `pwndbg/aglib/nearpc.py:76-84` |
| nearpc-branch-marker / nearpc-branch-marker-contiguous | `    ↓` / ` ` | `nearpc.py:66-72` |
| disasm-branch-on / disasm-branch-off | `✔` / `✘` (configurable since 2025-08, #3242; hard-coded before, since ≤ 2022) | `pwndbg/color/disasm.py:27-33` |
| code-prefix / backtrace-prefix / backtrace-frame-label | `►` / `►` / `` (was `f ` ≤ 2022.12) | context.py, pretty_print.py:326 |
| context-register-changed-marker | `*` | `pwndbg/color/context.py:35` |
| telescope-offset-separator / -delimiter / repeating-marker | `│` / `:` / `... ↓` | `pwndbg/commands/telescope.py:54-61` |
| hexdump-ascii-block-separator | `│` | `pwndbg/hexdump.py:27` |
| Colours: memory-stack yellow, -heap blue, -code red, -data purple, -rodata normal, -wx underline, -guard cyan; banner blue; register bold, changed red; highlight green,bold; comment gray; message-hint yellow, -on green, -off red, -system light-red, -signal bold,red; prompt bold,red / alive bold,green; syntax-highlight-style monokai | | `pwndbg/color/*.py` |

Relevant `config` params changing layout: `context-sections`, `context-stack-lines` (8), `context-disasm-lines` (10),
`context-code-lines` (14), `show-flags` (off), `show-compact-regs` (off), `nearpc-num-opcode-bytes` (0 → when >0 opcodes appear between
address and symbol: `► 0x… 0f bd c0    <__strrchr_avx2+70>    bsr …`, **source-only** `nearpc.py:697-703`), `telescope-framepointer-offset` (on),
`telescope-pad-leading-zeroes` (off), `dereference-limit` (5), `emulate` (on/jumps-only/off), `left-pad-disasm` (on), `vmmap-prefer-relpaths` (on).

## C. Version differences (from git history of github.com/pwndbg/pwndbg)

| Change | When (commit / first tag) | Plain-text effect |
|---|---|---|
| Legend/colour `RWX` → `WX` | 2024-06-26 `3bb28e9` (#2265), first in tag 2024.08.29 | `LEGEND: … \| RWX \| RODATA` before, `WX` after |
| Telescope frame-pointer offset column | 2023-10-19 `5a485c0`, tag 2024.02.14 | `01:0008│-0c8 0x…` vs older `01:0008│     0x…` |
| Disasm annotations (`RAX => …`, `[addr] <= …`, `EFLAGS => …`) | 2024-04-24 `50c47f4` (#2001), tag 2024.08.29 | older lines end after operands / `<target>` |
| `{var}` stack-variable names in chains | 2024-08-01 `1ea126a` (#2282), tag 2024.08.29 | `0x7ffe… {argv} —▸` vs `0x7ffe… —▸` |
| Prompt green when process alive | 2024-07-31 `42a2c02` (#2326) | colour only |
| LAST SIGNAL as selectable section | 2024-09-17 `41c0b84` (#2437) (signal line existed earlier) | |
| `b+` / `b►` breakpoint markers in nearpc | 2025-04-07 `37b0337` (#2828), tag 2025.05.30 | older shows only ` ►` |
| Commands must use `-` (`vis-heap-chunks`, `malloc-chunk`, `top-chunk`, `find-fake-fast`, `try-free`) | 2025-04-12 `c5d0ede` (#2857), tag 2025.05.30 | old `vis_heap_chunks` now `Undefined command` (old_vis_heap_chunks_x64.txt, old_top_chunk_x64.txt). Prompt-line highlighter should accept both spellings |
| Branch markers configurable | 2025-08-18 `254da39` (#3242) | glyphs unchanged by default |
| Backtrace column alignment via rich table | 2026-06-05 `db3fc9e` (#3946) | spacing between number/address may differ in older pastes |
| Backtrace frame label `f ` | default `"f "` in 2022.12.19, `""` from 2023 | ` ► f 0   0x… main+4` in very old pastes |
| Banner extras `REGISTERS / show-flags off / show-compact-regs off`, `DISASM / x86-64 / set emulate on` | present already in tag 2022.12.19 (`pwndbg/commands/context.py:503-508, 614` @2022.12.19) | stable for all versions a user is likely to paste; older-than-2022 formats not examined |
| `SOURCE (CODE)` title | unchanged since ≤ 2022.12 | |
| Heap module path `commands/heap.py` → `ptmalloc2.py` → `glibc_malloc.py` | refactors | output text unchanged in sampled tags (`Allocated chunk \| PREV_INUSE`) — older sampled tags not diffed line-by-line |

## D. Capture environment caveats (what is degraded)

* x86_64 runs under qemu-user (qemu 10.2.3 from tonistiigi/binfmt; Ubuntu's 8.2.2 crashed with `QEMU internal SIGSEGV` when pwndbg
  read `/proc/<tid>/smaps` via `vFile:open`). Consequences: guest addresses for libs/stack are `0xffff……` instead of `0x7f……`/`0x7ffd……`;
  `info registers` shows system regs (cr0/cr3/efer); hardware watchpoints unsupported (watch_hit_x64.txt) — use watch_hit_arm64.txt;
  LAST SIGNAL section not shown; `aslr`/`procinfo` print QEMU notes; libc has no debug symbols so `main_arena` symbol is not shown in
  x64 chains (it is in arm64: `0xfffff7fa0ab0 (main_arena+96)`); a non-canonical return address faults *after* `ret`
  (RIP=`0x4141414141414141`) whereas native x86_64 would stop *at* the `ret` (SIGSEGV on #GP) — native-x86 behaviour **not captured**.
* aarch64 is native ptrace; everything works (heap, watchpoints, signals).
* Not captured: 32-bit x86 (`EAX…`, `ESP`), ARM thumb (`/ arm / thumb mode /` banner), kernel/qemu-system output, `context ghidra`/decomp,
  `threads` section (single-threaded test), `rop`, `ropper`, `onegadget`, `largebins` non-empty, `[corrupted]` bins, `vmmap --gaps`.
