# PEDA output format spec (for a plain-text ```peda highlighter)

Subject: **longld/peda** at commit `84d38bda505941ba823db7f6c1bcca1e485a2d43` (2021-01-03, the latest upstream
commit), running on GDB 15.1 + Python 3.12.3 (Ubuntu 24.04, `gdb-multiarch`), against x86_64 and i386 targets
emulated with `qemu-user` (see `SETUP.md`). Source copy used for citations: `build/peda-src/`
(`peda.py`, `lib/utils.py`, `lib/config.py`). All `file:line` references are to that commit.

Evidence labels:

* **captured**: the example is copied byte-for-byte from `captures/*.txt` (ANSI stripped by
  `build/strip_ansi.py`, CR removed). Colours quoted come from the matching `captures/*.ansi`.
* **source-only**: the format string exists in the source but was not produced in any capture.
* **gdb**: the line is printed by GDB itself, not by PEDA. A paste will contain these lines too.

Notation: `⇥` marks a literal TAB in the prose. The example blocks contain the real TAB bytes.
Regexes are JavaScript and are meant to be applied per line, after the line has been split on `\n`.
Make them tolerant of `[\t ]+` wherever a TAB appears, because copy/paste and Obsidian can turn TABs into spaces.

---

## 0. Colour model (source)

`colorize(text, color, attrib)` emits `ESC[` + `;attr`… + `;color` + `m` + text + `ESC[0m`
(`lib/utils.py:107-129`). The colour codes are red 31, green 32, yellow 33, blue 34, purple 35, cyan 36, white 37.
The attributes are bold 1, underline 4, dark 2 (`utils.py:113-116`). Each `msg()` line is also wrapped in `ESC[m … ESC[0m`
(`utils.py:194-198`, visible in the `.ansi` files as `^[[m`). `ansicolor` defaults to on (`lib/config.py:28`).

| Meaning | PEDA colour | Source |
|---|---|---|
| `code` address (executable mapping inside a code section) | red | `utils.py:446-455` (`format_address`) |
| `data` address (writable mapping: stack, heap, .data/.bss) | blue | `utils.py:449` |
| `rodata` address (readable, non-writable, non-code) | green | `utils.py:451` |
| `value` (not an address) | no colour | `utils.py:452`, `utils.py:470-471` |
| Section banners and footer | blue | `peda.py:4253, 4279, 4340, 4390` |
| Register names (`RAX`, `EFLAGS`) | green | `peda.py:4833, 4802` |
| Set flag (upper-case) | bold red | `peda.py:4797` |
| Clear flag (lower-case) | green | `peda.py:4799` |
| Prompt `gdb-peda$ ` | red | `peda.py:6154` |
| Current instruction (`=>` line, instruction part) | bold green | `utils.py:551-553` |
| Instructions before PC | dark (dim), keeping the colour for the mnemonic class | `utils.py:549-550` |
| `cmp`/`test` | red; `call`: green; `j*`: yellow; `ret`: blue | `utils.py:504-510` |
| `call` whose text contains a "vulnerable" function name | bold underline red | `utils.py:484-488, 534-539` |
| ` |->` jump-target first line and `JUMP is taken` | red | `peda.py:4305, 4313` |
| `JUMP is NOT taken` | green | `peda.py:4316` |
| `Stopped reason: <SIG>` (the signal name) | red | `peda.py:4395` |
| `Warning: …` | yellow | `utils.py:206-208` |
| `Error: …` | red | `utils.py:210-212` |
| `Invalid $PC/$SP address` | red | `peda.py:4324, 4346, 4748` |
| vmmap header | bold blue; rows with `rwx` perm: red | `peda.py:4449-4452` |
| checksec values | `disabled` red, `ENABLED` green, `Partial` yellow, `FULL` green, `Dynamic Shared Object` yellow | `peda.py:5024-5030` |
| xinfo mapping block | `Start`/`End` green, `Offset` yellow, `Perm` red, `Name` blue | `peda.py:4865-4870` |
| hexdump address column | blue | `peda.py:3375` |
| pattern search headings | red, yellow, green, blue (in order) | `peda.py:5350, 5368, 5386, 5404` |

Captured check: these colour codes appear exactly as listed in `captures/s1_main.ansi` (for example
`^[[;31mgdb-peda$ ^[[0m`, `^[[;32mRIP^[[0m: ^[[;31m0x401967^[[0m (<main+19>:…`,
`=> 0x401967 <main+19>:^[[;1;32m⇥cmp …`, `^[[;2;31m⇥cmp` for a cmp before PC, `^[[;33m⇥jle`,
and `^[[;1;4;31m⇥call   0x404e90 <printf>` in `s5_static_extra.ansi`).

**Plain-text consequence:** after copy, none of the memory-type colours survive. The highlighter has to infer
code, data and rodata from structure; see §Ambiguities.

---

## 1. Prompt and command echo

Description: every command line begins with the prompt `gdb-peda$ `. PEDA sets it with
`set prompt \001%s\002 % red("\002gdb-peda$ \001")` (peda.py:6154). The `\001`/`\002` readline markers do not appear in
terminal output (verified: there are no 0x01/0x02 bytes in the `.ansi` files). The bracketed-paste sequences
`ESC[?2004h/l` around the prompt are terminal noise.

Examples (captured, s1_main.txt):
```text
@@G s1_main.txt 3 ^gdb-peda\$ (break main|continue|x/20gx)
```
Pager prompt (captured, `pager()` utils.py:247-271, `pagesize` default 25, config.py:29). Whatever the user typed
at the pager can show up on the same line:
```text
@@G s1_main.txt 2 ^--More--
```

* Regex prompt: `/^(gdb-peda\$)(?: (.*))?$/` gives `prompt` = group 1 and `command` = group 2.
* Regex pager: `/^(--More--\(\d+\/\d+\))(.*)$/` gives `pager-prompt` and `command`.
* Token classes: `prompt`, `command`. The first word of the command can be `command-name`.
* Colour: prompt red (peda.py:6154). The command text is user input and has no colour.
* Evidence: captured (all sessions); source peda.py:6154, utils.py:265.

---

## 2. Context section banners, footer, legend

PEDA builds each banner as `"[%s]" % name.center(78, "-")`, so the line is **always 80 characters**: `[` + 78 + `]`.
The footer is `"[" + "-"*78 + "]"`.
Measured in s1_main.txt: `registers` gives 34 dashes + name + 35 dashes, `code` gives 37+37, `stack` gives 36+37, and the footer is 78 dashes.

```text
@@G s1_main.txt 1 ^\[-+registers
@@G s1_main.txt 1 ^\[-+code-
@@G s1_main.txt 1 ^\[-+stack-
@@G s1_main.txt 1 ^\[-{78}\]$
@@G s1_main.txt 1 ^Legend:
@@G s2_crash.txt 1 ^Stopped reason: SIGSEGV
@@G s4_x86.txt 1 ^Stopped reason: SIGTRAP
```

* Regex banner: `/^\[(-{30,40})(registers|code|stack)(-{30,40})\]$/`. Tokens: `section-header` for the whole line, with `section-name` for group 2.
* Regex footer: `/^\[-{78}\]$/` gives `section-footer`.
* Regex legend: `/^(Legend): (code), (data), (rodata), (value)$/`. Tokens are `legend-label`, then `address-code` (red),
  `address-data` (blue), `address-rodata` (green) and `value` (plain). This lets the theme show the same colour key.
* Regex stop: `/^(Stopped reason): (SIG[A-Z0-9]+)$/` gives `stop-reason` and `signal` (red).
* Order inside `context` (peda.py:4350-4397): optional clear-screen `ESC[2J ESC[H` (stripped in plain text), then
  registers, code, stack, footer, legend, and finally "Stopped reason" only when the status contains "SIG".
  The stack section is forced on SIGSEGV (peda.py:4387-4389).
  `context reg|code|stack` prints only that banner, then footer and legend (captured: s1_main.txt after `context reg`).
* Evidence: captured; source peda.py:4253, 4279, 4340, 4390-4395.

---

## 3. Register lines (context "registers" section and `xinfo register`)

Format: `green(REG.upper().ljust(3)) + ": " + format_reference_chain(chain)` (peda.py:4832-4836). So `R8`
becomes `R8 :` (padded to 3). The register list is fixed: 64-bit `RAX RBX RCX RDX RSI RDI RBP RSP RIP R8..R15`, 32-bit
`EAX EBX ECX EDX ESI EDI EBP ESP EIP` (peda.py:54-60). EFLAGS comes last (§4).

64-bit (captured s1_main.txt):
```text
@@L s1_main.txt 18 ^RAX: 0x401954 \(<main>
```
32-bit (captured s4_x86.txt):
```text
@@L s4_x86.txt 10 ^EAX: 0x6a
```
Degraded memory map, where code pointers show as raw dereferenced qwords (captured s6_noshim_degraded.txt):
```text
@@G s6_noshim_degraded.txt 1 ^RIP: 0x401967 --> 
@@G s6_noshim_degraded.txt 1 ^R14: 0x4a7f68 --> 0x401870 --> 
@@G s6_noshim_degraded.txt 1 ^0056\| .* --> 0x40f1a2 --> 
```

* Regex: `/^(R(?:[ABCD]X|[SD]I|[BS]P|IP|8|9|1[0-5])|E(?:[ABCD]X|[SD]I|[BS]P|IP)) ?: (.*)$/` gives `register-name`, then the
  rest is parsed as a **reference chain** (§6).
* Note the trailing space after a bare value (`RBX: 0x1 `). It comes from `"%s%s " %` in utils.py:469-471. R15/EDI, the last
  register line, has no trailing space because `msg(text.strip())` is used (peda.py:4851).
* Colour: name green. Chain elements are coloured by memory type (§6).
* Evidence: captured; source peda.py:4832-4853, 54-60.

---

## 4. EFLAGS line

Format: `"%s: 0x%x (%s)" % (green("EFLAGS"), eflags, text)`, where text is 9 words in fixed order
Carry Parity Adjust Zero Sign Trap Interrupt Direction Overflow. A set flag is `UPPER` in bold red and a clear flag is
`lower` in green (peda.py:4781-4802; bit masks peda.py:1142-1150).

```text
@@G s1_main.txt 1 ^EFLAGS: 0x297
@@G s1_main.txt 1 ^EFLAGS: 0x246
@@G s4_x86.txt 1 ^EFLAGS: 0x202
```

* Line regex: `/^(EFLAGS): (0x[0-9a-f]+) \(([A-Za-z ]+)\)$/`
* Inner word regex: `/\b(CARRY|PARITY|ADJUST|ZERO|SIGN|TRAP|INTERRUPT|DIRECTION|OVERFLOW)\b/` gives `flag-set`, and
  `/\b(carry|parity|adjust|zero|sign|trap|interrupt|direction|overflow)\b/` gives `flag-clear`. The case of each word alone shows
  whether the flag is set, so this works on plain text.
* Tokens: `register-name` (EFLAGS), `immediate` (0x…), `flag-set`, `flag-clear`.
* The standalone `eflags` command prints the same line (captured: s5_static_extra.txt after `eflags`).
  `eflags set|clear|toggle FLAG` prints nothing.
* Do not confuse this with gdb's `info registers eflags` / `p $eflags` form `[ IOPL=0 IF AF ]` (§12).

---

## 5. Stack / telescope lines

Format: `"%04d| " % idx` + chain. idx is a **decimal byte offset** that steps by the pointer size
(`8` on x86_64, `4` on i386) (peda.py:4760-4768). Used by the context stack section, `telescope`/`stack`/`viewmem`
(aliases peda.py:6145-6146), and `context stack N`. Default 8 lines.

```text
@@L s1_main.txt 8 ^0000\| 0x2aaaab2abba0 --> 0x2aaaab2abd28
@@L s4_x86.txt 8 ^0000\| 0x40800ba0
```

* Regex: `/^(\d{4,})\| (.*)$/` gives `stack-offset` (group 1, include the `|` as punctuation) plus a chain (§6).
  `%04d` grows past 4 digits once the offset is ≥10000 (`telescope 1300` would do it). That is source behaviour, not captured.
* When an entry is not readable, the chain is empty and the line reads `NNNN| Cannot access memory address`
  (utils.py:463-464). **source-only.**
* Colour: offset uncoloured; chain coloured per §6.

---

## 6. Reference chains (`-->`) and annotations (core of PEDA output)

Grammar, from `format_reference_chain` (utils.py:457-481) and `examine_mem_reference` (peda.py:2128-2154):

```
chain      := element ( " --> " element )* " " [ annotation ]
element    := "0x" hex          (to_hex: NOT zero-padded, utils.py:330-337)
annotation := "(" ( "<" symbol ">:" TAB insn      # code pointer with symbol    (examine_mem_value, peda.py:2092-2096)
                  | insn                          # code pointer, no symbol
                  | '"' gdb-x/s-string '"'        # data/rodata string (gdb C escapes)
                  | "'" python-repr-string "'"    # last VALUE decoded as little-endian ASCII (utils.py:477-480)
                  | "--> ..."                     # depth limit (5) reached (peda.py:2144-2147)
                  | "MemError"                    # rodata read failed (peda.py:2123)          [source-only]
                  ) ")"
```

If the first element itself has a string/code annotation, the chain is a single element with **no arrow**, for example
`0x2aaaab2abbb0 ("Hello, PEDA highlighter!")`.

Captured examples:
```text
@@G s1_main.txt 1 ^RBP: 0x2aaaab2abc10 --> 0x2aaaab2abcb0 --> 0x2aaaab2abd00 --> 0x0 $
@@G s1_main.txt 1 ^RIP: 0x401967 \(<main\+19>
@@G s1_main.txt 1 ^R14: 0x4a7f68 --> 0x401870 \(<frame_dummy>
@@G s1_main.txt 1 ^RDI: 0x40 \('@'\)
@@G s1_main.txt 1 ^RAX: 0xd \('\\r'\)
@@G s1_main.txt 1 ^0016\| 0x2aaaab2abbb0 \("Hello
@@G s1_main.txt 1 \(--> \.\.\.\)$
@@G s3_dyn.txt 1 ^0008\| 0x2aaaab2abbc8 --> 0x2aaaab3181ca \(mov
@@G s3_dyn.txt 1 ^0016\| 0x2aaaab2abcf0 --> 0x2aaaab2abebd --> 0x4f48006f6c6c6568 \('hello'\)
@@G s2_crash.txt 1 ^RIP: 0x4141464141304141
@@G s4_x86.txt 1 ^EIP: 0x80498f3
@@G s4_x86.txt 1 ^0020\| 0x40800b84 --> 0x80b4036 \("%s %s %d\\n"\)
@@G s3_dyn.txt 1 ^0048\| 0x2aaaab2abd10 --> 0x2aaaab2abee3 \("GDB_EXTRA
```

Proposed tokenisation for the text after `REG: ` / `NNNN| ` / `arg[N]: ` / `name : `:

1. Peel the annotation off the end, trying these anchored regexes in order:
   * `/ ?\((--> \.\.\.)\)$/` gives `chain-truncated`
   * `/ ?\(("(?:[^"\\]|\\.)*"(?:\.\.\.)?)\)$/` gives `string` (gdb-quoted; can contain `(`, `)`, `'`, `;`)
   * `/ ?\(('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\)$/` after a value gives `string-value`. Python `repr` switches to
     double quotes when the bytes contain `'`, so this overlaps with the case above; see Ambiguities.
   * `/ ?\((<[^>]+>):[\t ]+(.*)\)$/` gives `symbol` + `disasm` (tokenise the instruction as in §7)
   * `/ ?\((MemError)\)$/` gives `error`
   * `/ ?\(([a-z][a-z0-9]*(?:[\t ].*)?)\)$/` gives `disasm` with no symbol. Check this one last.
2. Split the remainder on `/ --> /`, giving `arrow` tokens between elements.
3. Each element `/0x[0-9a-f]+/`. Elements before the last are **always addresses**, because the chain only continues
   through mapped memory (peda.py:2140-2152). The last element is an **address** if an address-style annotation follows
   (`"str"`, `<sym>`/insn, `--> ...`, MemError). It is a **value** if nothing or `'…'` follows.
4. Memory-type colour (code red, data blue, rodata green) cannot be recovered from plain text. Use these heuristics:
   * An element whose annotation is code (symbol+insn or bare insn) gives `address-code`.
   * Any element that equals `$sp`-region values: a `0x7ff…`-prefixed value on real Linux, or a value that recurs as a telescope row
     address. These give `address-stack` (a subtype of data).
   * An element followed by `"str"` gives `address-data` (it cannot be told apart from rodata without the map; see Ambiguities).
   * Otherwise an intermediate element gives `address` (generic) and a final bare element gives `value`.

Tokens: `address`, `address-code`, `address-data`, `address-rodata`, `address-stack`, `address-heap` (heuristic),
`value`, `arrow`, `string`, `string-value`, `symbol`, `disasm`, `chain-truncated`.

Arrows: `-->` is the only chain arrow PEDA prints. `<-` does **not** exist in PEDA (it is GEF/pwndbg style; grep of
peda.py finds no `<-` arrow formatter). There are also two other arrow-like forms:
` |->` (jump target, §8) and `"-->"*d` in pattern search (`[RSP] --> offset 48 …`, peda.py:5370).

---

## 7. Disassembly lines (context code, `x/Ni`, `pdisass`, `disassemble`)

The context code section comes from gdb `x/Ni` output (peda.py:841-872) re-coloured by `format_disasm_code` (utils.py:490-563).
The line layout comes from **gdb**:
`<marker><addr> <sym+off>:⇥<mnemonic><spaces><operands>[        # <comment>]`, with marker `=> ` for the PC and `   ` otherwise.

```text
@@L s1_main.txt 8 ^   0x40195c <main\+8>:
@@G s1_main.txt 1 ^   0x401986 <main\+50>:\tcall
@@G s1_main.txt 1 ^   0x4018d3 <mul\+22>:\tret
@@G s4_x86.txt 1 ^=> 0x8049020:\tjmp
@@G s1_main.txt 1 ^   0x4019fe <main\+170>:\tlea    rax,\[rip\+0x7f62d\]        # 0x481032$
@@G s3_dyn.txt 1 ^=> 0x5555555572d8 <vuln\+16>:\tmov    rax,QWORD PTR fs:0x28
```
`x/10i $pc` (gdb, captured):
```text
@@L s1_main.txt 11 ^gdb-peda\$ x/10i \$pc
```
`disassemble main` / `pdisass main` (gdb format with 16-digit addresses and `<+off>`; `pdisass` adds PEDA colours, peda.py:3570-3586):
```text
@@L s5_static_extra.txt 3 ^Dump of assembler code for function main:
@@G s5_static_extra.txt 1 ^=> 0x00000000004019f0
@@G s5_static_extra.txt 1 ^End of assembler dump\.
```

Regexes:
* Context / x/i line: `/^(=> |   )(0x[0-9a-f]+)(?: <([^>]+)>)?:[\t ]+(\S+)(?:[ \t]+(.*?))?$/`
  gives `current-marker`/indent, `address-code`, `symbol` (`<main+19>`), `mnemonic`, `operands`.
* disassemble line: `/^(=> |   )(0x[0-9a-f]{8,16}) <\+(\d+)>:[\t ]+(\S+)(?:[ \t]+(.*?))?$/`
* Unreadable PC (gdb): `=> 0x4141464141304141:⇥Cannot access memory at address 0x4141464141304141` (captured s2_crash.txt).
* gdb comment: `/(\s+)(# 0x[0-9a-f]+(?: <[^>]+>)?)$/` gives `comment`. PEDA only splits off `;`-comments (utils.py:555-557).
  Intel-syntax gdb output uses `#`, so in practice the comment takes the line colour.
* Operand tokens (inside group 5):
  * `operand-register`: `/\b(?:[re]?(?:ax|bx|cx|dx|si|di|bp|sp|ip)|[abcd][lh]|(?:si|di|bp|sp)l|r(?:[89]|1[0-5])[dwb]?|[cdefgs]s|[xyz]mm\d{1,2}|st\(\d\))\b/`
  * `size-ptr`: `/\b(?:BYTE|WORD|DWORD|QWORD|TBYTE|XMMWORD|YMMWORD|ZMMWORD|FWORD) PTR\b/`
  * `immediate`: `/\b0x[0-9a-f]+\b|(?<![\w$])-?\d+\b/`
  * `branch-target`: in `call|j*`, `0x… <sym+off>` gives `address-code` + `symbol`
  * punctuation `[ ] + - * , :`
* Mnemonic classes, matching PEDA's colour rules (utils.py:504-540): `mnemonic-cmp` for /cmp|test/ (red), `mnemonic-call`
  for /call/ (green; bold underline red when the line contains a VULN function name such as printf, strcpy, gets, system, memcpy, read,
  utils.py:484-488), `mnemonic-jump` for /^j/ (yellow), `mnemonic-ret` for /ret/ (blue), everything else plain. The PEDA rule is substring
  `c in opcode` checked in dict order cmp, test, call, j, ret (utils.py:531-540), so `jmp`→yellow and `repz ret`→blue.
* Current line: `=>` gives `current-marker`, and the whole instruction is bold green (utils.py:551-553), overriding the class colour.
  Lines with addresses below PC are dim (`dark` attribute); a highlighter can mark them `disasm-past`.
* `pdisass` calls `format_disasm_code(code)` with no PC (peda.py:3586), so nothing is dimmed and the `=>` line is not
  bold green (captured `.ansi`: `=> 0x00000000004019f0 <+156>:^[[m⇥mov …`).
* `pdisass main 6` prints a garbled header (`Dump of assembler code from 0x401954 to 0x6::⇥Dump of …`). This is a
  PEDA bug (captured s1_main.txt) and is harmless for highlighting.

---

## 8. Jump / call annotations in the code section

At a conditional or unconditional jump, `testjump()` (peda.py:1241-1291) decides whether the jump is taken.
* **Taken** (peda.py:4292-4313): lines up to PC are formatted normally. Later lines get the prefix ` | ` and are stripped.
  Then comes ` |->` + red(first target line, which keeps gdb's 3-space indent). Further target lines are indented with 7 spaces, and then
  `"JUMP is taken".rjust(79)` in red. If the target cannot be disassembled, the text is
  `   Cannot evaluate jump destination` (peda.py:4307, **source-only**).
* **Not taken** (peda.py:4314-4316): normal listing, then `"JUMP is NOT taken".rjust(79)` in green.
* **At a call**: the normal listing plus `dumpargs` output (`Guessed arguments:` / `arg[N]: chain`, peda.py:3842-3861).
  `No argument` is printed when nothing could be guessed.

```text
@@K s1_main.txt 13 3 ^=> 0x40196b <main\+23>:\tjle
@@K s4_x86.txt 13 3 ^=> 0x8049020:\tjmp
@@K s2_crash.txt 9 3 ^=> 0x401a16 <main\+194>:
@@K s1_main.txt 4 1 ^arg\[0\]: 0x4018a5
@@K s1_main.txt 5 1 ^arg\[0\]: 0x481032
@@G s1_main.txt 1 ^No argument
```

Regexes:
* `/^( \| )(0x[0-9a-f]+)(?: <([^>]+)>)?:[\t ]+(\S+)(?:[ \t]+(.*?))?$/` gives `jump-skipped-marker` + disasm (skipped fall-through).
* `/^( \|->)(\s+)(0x[0-9a-f]+)(?: <([^>]+)>)?:[\t ]+(\S+)(?:[ \t]+(.*?))?$/` gives `jump-target-marker` + disasm. The whole line is red.
* `/^( {7})(0x[0-9a-f]+)(?: <([^>]+)>)?:[\t ]+(\S+)(?:[ \t]+(.*?))?$/` gives continuation of the jump target listing.
  Only treat it this way inside a code section, after a ` |->` line.
* `/^\s+(JUMP is taken)$/` gives `jump-taken` (red). `/^\s+(JUMP is NOT taken)$/` gives `jump-not-taken` (green). Both are
  right-aligned to column 79 (measured: lines are 79 chars long).
* `/^(Guessed arguments):$/` gives `label`. `/^(arg\[\d+\]): (.*)$/` gives `arg-label` + chain (§6).

---

## 9. Other messages inside / after the context

```text
@@G s2_crash.txt 1 ^Invalid \$PC address
@@G s1_main.txt 1 ^Warning: not running
@@G s1_main.txt 1 ^Error: missing argument
@@G s1_main.txt 1 ^Stepping through, Ctrl-C to stop\.\.\.
```
* `/^(Invalid \$(?:PC|SP) address): (0x[0-9a-f]+)$/` gives `error` (red) + `address` (peda.py:4324, 4346, 4748).
* `/^(Warning): (.*)$/` gives `warning` (yellow, utils.py:206-208). `/^(Error): (.*)$/` gives `error` (red, utils.py:210-212).
  `/^(Debug): (.*)$/` is cyan (utils.py:214-216, **source-only**).
* `Warning: not running` is printed by `_is_running()` (peda.py:3037-3047). It also appears right after
  `[Inferior 1 (process N) exited normally]`, because the hook-stop (`peda context`, peda.py:6121-6124) still fires.
  This is captured in s1_main.txt, s3_dyn.txt and s2_crash.txt.
* gdb ≥12 prints these at PEDA load, because PEDA still uses `set logging on/off` (peda.py:111-126):
  ```text
@@L s1_main.txt 5 ^Warning: 'set logging off'
  ```
* Command help on wrong usage (`pedacmd.help(cmd)`, peda.py:6030) prints a doc block: a description line, `Usage:`, and indented usage
  lines (captured s1_main.txt after `skeleton`, `hexdump`).

---

## 10. gdb lines that appear between PEDA blocks (stop events, stepping, exit)

These are **gdb** output. PEDA sets `output-radix 0x10` (peda.py:6153), so gdb prints integers in hex
(`argc=0x1`, `$8 = 0x37` for a plain `p`).

```text
@@G s1_main.txt 1 ^Breakpoint 1 at 0x401967
@@G s1_main.txt 1 ^Continuing\.
@@G s1_main.txt 1 ^Breakpoint 1, main
@@G s1_main.txt 1 ^26\t
@@G s1_main.txt 1 ^0x000000000040196b\t26\t
@@G s1_main.txt 1 ^Breakpoint 2, 0x00000000004019e8 in main
@@L s4_x86.txt 2 ^Breakpoint 1, vuln \(
@@G s1_main.txt 1 ^compute \(f=
@@G s1_main.txt 1 ^Run till exit
@@G s1_main.txt 1 ^Value returned
@@G s1_main.txt 1 ^0x0000000000404e90 in printf \(\)
@@G s2_crash.txt 1 ^Program received signal SIGSEGV
@@G s2_crash.txt 1 ^0x4141464141304141 in \?\? \(\)
@@L s2_crash.txt 3 ^Continuing with signal SIGSEGV
@@G s1_main.txt 1 ^\[Inferior 1 \(process \d+\) exited normally\]
@@G s3_dyn.txt 1 ^0x00002aaaab2cb550 in \?\? \(\)
```
(The `Breakpoint 1, vuln (` example wraps across two lines. gdb wraps long frame lines.)

Regexes (token classes in brackets):
* `/^(Breakpoint|Temporary breakpoint|Hardware watchpoint) (\d+) at (0x[0-9a-f]+)(?:: file (.+), line (\d+)\.)?$/` [`gdb-info`]
* `/^(Breakpoint|Temporary breakpoint) (\d+), (?:(0x[0-9a-f]+) in )?([\w.@<>:~]+) \((.*)$/` [`breakpoint-hit`, `address`, `function`]
* `/^(Program received signal) (SIG[A-Z0-9]+), (.*)$/` [`signal-msg`, `signal`]
* `/^(Program terminated with signal) (SIG[A-Z0-9]+), (.*)$/`
* `/^\[(Inferior \d+ \(process \d+\) exited (?:normally|with code \d+))\]$/` [`exit-msg`]. `with code` is gdb's wording, not captured.
* `/^(0x[0-9a-f]+)[\t ]+(\d+)[\t ]+(.*)$/` [`address`, `line-number`, `source`] (ni/si/nextcall step echo)
* `/^(\d+)\t(.*)$/` [`line-number`, `source`]
* `/^(0x[0-9a-f]+) in (\S+|\?\?) \((.*)\)$/` [`address`, `function`]
* `/^(Continuing\.|Continuing with signal \w+\.|The program no longer exists\.|The program is not being run\.|Run till exit from .*)$/` [`gdb-info`]

---

## 11. `x/` memory examine (gdb)

```text
@@L s1_main.txt 3 ^0x2aaaab2abba0:\t0x00002aaaab2abd28
@@L s1_main.txt 2 ^0x2aaaab2abba0:\t0xab2abd28
@@L s1_main.txt 2 ^0x2aaaab2abba0:\t0x28
@@L s1_main.txt 5 ^gdb-peda\$ x/4s
@@G s4_x86.txt 1 ^0x40800b70:\t"0
```
* Regex: `/^(0x[0-9a-f]+)(?: <([^>]+)>)?:\t(.*)$/` gives `address` + optional `symbol` + body. In the body, `/0x[0-9a-f]+/g` gives
  `immediate` and `/"(?:[^"\\]|\\.)*"/` gives `string`. gdb prints `<sym+off>` after the address when it resolves to a symbol;
  that is gdb behaviour and was not captured here.

---

## 12. `info registers` / `p` / `bt` (gdb)

```text
@@L s1_main.txt 3 ^rax            0xd
@@G s1_main.txt 1 ^rip            0x4019ed
@@G s1_main.txt 1 ^eflags         0x212
@@L s1_main.txt 3 ^xmm0           \{
@@G s1_main.txt 1 ^\$5 = 
@@G s1_main.txt 1 ^\$7 = 
@@G s1_main.txt 1 ^\$10 = 
@@G s1_main.txt 1 ^\$11 = 
@@L s1_main.txt 5 ^#0  compute
@@L s2_crash.txt 2 ^#0  0x4141464141304141
```
* info registers: `/^([a-z][a-z0-9_]*)\s+(0x[0-9a-f]+|-?\d+|\{)\s*(.*)$/` gives `register-name` (lower-case), `immediate`, natural
  value (with `<sym+off>` gives `symbol`, `[ IOPL=0 IF AF ]` gives `flag-set` words).
* print: `/^(\$\d+) = (.*)$/` gives `history-var` + value. Inside the value: `(void *)`/`(void (*)())` casts, `{int (int, char **)}`,
  `"string"`, `<sym>`.
* bt: `/^(#\d+)\s+(?:(0x[0-9a-f]+) in )?(\S+) \((.*?)\)(?: at (\S+):(\d+))?$/` gives `frame-index`, `address`, `function`, args, file:line.

---

## 13. `vmmap`

Header: `"%s %s %s\t%s" % ("Start".ljust(l), "End".ljust(l), "Perm", "Name")` in bold blue, with l = 18 on 64-bit and 10 on 32-bit
(peda.py:4446-4449). Rows use `to_address()` (utils.py:339-349): **`0x%08x` when the value is ≤ 0xffffffff and `0x%016x` otherwise**.
So one 64-bit table mixes 10-character and 18-character addresses. Rows whose perm contains `rwx` are red.

```text
@@L s1_main.txt 11 ^Start              End                Perm\tName
@@L s3_dyn.txt 4 ^gdb-peda\$ vmmap libc
@@L s4_x86.txt 5 ^Start      End        Perm\tName
```
When no map matches, PEDA prints `Warning: not found or cannot access procfs` (peda.py:4454). This was captured in a
discarded pre-fix run of `vmmap libc` and is otherwise **source-only**.

* Header regex: `/^(Start)\s+(End)\s+(Perm)\t(Name)$/` gives `table-header`.
* Row regex: `/^(0x[0-9a-f]{8,16})\s+(0x[0-9a-f]{8,16})\s+([r-][w-][x-][ps])\t(.*)$/` gives `address`, `address`, `perm`, `path`.
  Theme: `[stack]`/`[heap]`/`[vdso]`/`[vvar]`/`[vsyscall]` give `map-special`. Perm with `x` gives `address-code` styling for the row,
  and `rwx` gives `perm-rwx` (red in PEDA).

---

## 14. `checksec`

`"%s: %s" % (k.ljust(10), colorcodes[v])` with keys sorted: CANARY, FORTIFY, NX, PIE, RELRO (peda.py:5034-5037).

```text
@@L s5_static_extra.txt 5 ^CANARY    : ENABLED
@@L s3_dyn.txt 5 ^CANARY
@@L s4_x86.txt 5 ^CANARY
```
* Regex: `/^(CANARY|FORTIFY|NX|PIE|RELRO)\s+: (ENABLED|FULL|disabled|Partial|Dynamic Shared Object)$/`
  gives `security-key` + `security-enabled` (ENABLED/FULL, green), `security-disabled` (red) or `security-partial`
  (Partial/Dynamic Shared Object, yellow).
* checksec runs `/usr/bin/readelf -W -a` (peda.py:2545-2547; path from config.py:17). Without readelf it silently prints the defaults
  (`NX: ENABLED`, all others `disabled`). This happened in an earlier run of this study (see SETUP.md), so a paste can look valid and still be wrong.

---

## 15. `xinfo`, `xprint`, `distance`, `hexdump`

```text
@@L s1_main.txt 8 ^gdb-peda\$ xinfo 0x4b5900
@@L s3_dyn.txt 7 ^0x2aaaab3181ca \(mov
@@G s1_main.txt 1 ^0xdeadbeef $
@@G s1_main.txt 1 ^From 0x2aaaab2abac0 to
@@G s1_main.txt 1 ^From 0x2aaaab2abac0 \(SP\)
@@L s1_main.txt 3 ^0x00002aaaab2abba0 : 28
@@L s1_main.txt 2 ^0x00481010 : 48 65 6c 6c 6f 2c 20 50 45 44 41 20 68 69 67 68   Hello, PEDA high
@@L s4_x86.txt 3 ^0x40800b5c : 02
```
* xinfo first line is a chain (§6). Then:
  `/^Virtual memory mapping:$/` and `/^(Start|End|Offset|Perm|Name)\s*: (.*)$/` give `field-label` + `address`/`perm`/`path`
  (Start/End green, Offset yellow, Perm red, Name blue; peda.py:4865-4870).
* xinfo with a non-address: the value alone, followed by an empty line (captured `0xdeadbeef `).
  `Warning: not a register nor an address` for expressions.
* distance: `/^From (0x[0-9a-f]+)( \(SP\))? to (0x[0-9a-f]+): (-?\d+) bytes, (-?\d+) dwords( \(\+\d+ bytes\))?$/` (peda.py:3445-3446).
  The `(+N bytes)` suffix is **source-only**.
* hexdump (peda.py:3339-3380): `'%s : %s  %s' % (blue(to_address(addr)), hexbytes.ljust(48), ascii)`. ASCII uses `.` for bytes
  outside 0x20..0x7d. **Note**: 0x7e `~` is shown as `.` (the comparison is `< 0x7e`, peda.py:3348).
  Regex: `/^(0x[0-9a-f]{8,16}) : ((?:[0-9a-f]{2} ){0,15}[0-9a-f]{2}) *  (.{1,16})$/` gives `address`, `hex-bytes`, `ascii`.

---

## 16. Search commands: `searchmem`/`find`, `sgrep`, `refsearch`, `lookup`, `strings`, `xrefs`

```text
@@L s1_main.txt 5 ^Searching for 'PEDA' in: None ranges
@@L s1_main.txt 3 ^Searching for 'heap' in range
@@G s1_main.txt 1 ^Searching for reference to
@@G s1_main.txt 2 ^\[stack\] : 0x2aaaab2a.* --> 0x4b5900
@@G s1_main.txt 1 ^Searching for pointers on
@@L s3_dyn.txt 3 ^Searching for '/bin/sh' in: libc ranges
@@L s1_main.txt 2 ^Searching for '/bin' in: binary ranges
@@L s1_main.txt 3 ^0x481010: Hello
@@L s5_static_extra.txt 2 ^All references to
```
* `/^(Searching for) (.+?) (in(?: range)?:) (.*?)(?: ranges)?$/` gives `label` + `string` (Python repr of the pattern) + target.
  The `mapname` is printed raw, so `None` appears when none was given (peda.py:4654).
* `/^Found (\d+) results, display max (\d+) items:$/` (peda.py:2189)
* Result: `/^(\s*[^:]+?) : (0x[0-9a-f]+)(.*)$/` gives `map-name` (right-justified; library basename cut at the first `-` when it starts
  with `lib`, peda.py:2179-2183) + chain (§6).
* `Not found` (peda.py:2175) gives `gdb-info`.
* strings: `/^(0x[0-9a-f]+): (.*)$/` (peda.py:4914). This collides with the dumprop format (§18), so decide by context.

---

## 17. `pattern` (cyclic)

```text
@@G s1_main.txt 1 ^'AAA%
@@G s1_main.txt 1 ^Writing pattern of
@@G s1_main.txt 1 ^AA8A found at offset
@@G s1_main.txt 1 ^1094790465 found at offset
@@G s2_crash.txt 1 ^4702116732032008513 found at offset
@@L s2_crash.txt 23 ^Registers contain pattern buffer:
@@L s4_x86.txt 19 ^Registers contain pattern buffer:
```
* create: `/^'([A-Za-z0-9%$\-;()sn]+)'$/` gives `string` (pattern charset, utils.py:565-603).
* offset: `/^(.+?) found at offset: (\d+)$/`. Note: a hex argument is echoed **as decimal** (`"%s" % value` after normalize_argv,
  peda.py:5301-5317). `/^(.+) not found in pattern buffer$/` is **source-only**.
* search headings: `/^(Registers contain pattern buffer:|Registers point to pattern buffer:|Pattern buffer found at:|References to pattern buffer found at:)$/`
  (red, yellow, green, blue). Negative forms: `No register contains pattern buffer`, `No register points to pattern buffer`,
  `Pattern buffer not found in memory`, `Reference to pattern buffer not found in memory` (peda.py:5354, 5372, 5396, 5414; **source-only**).
* lines: `/^([A-Z0-9_]+)\+(-?\d+) found at offset: (\d+)$/` (register + nearby offset; note `FS_BASE+-92`),
  `/^\[([A-Z0-9_]+)\] ((?:-->)+) offset (\d+) - size ~(\d+)$/`,
  `/^(0x[0-9a-f]+) : offset +(\d+) - size +(\d+) \((.*)\)$/`, and `/^(0x[0-9a-f]+) : (0x[0-9a-f]+) \((.*)\)$/`.
  The trailing paren holds either `$sp + 0x… [N dwords]` or a map name.

---

## 18. ROP helpers: `ropgadget`, `dumprop`, `ropsearch`, `asmsearch`, `jmpcall`

```text
@@L s1_main.txt 5 ^gdb-peda\$ ropgadget
@@L s3_dyn.txt 3 ^addesp_0 = 
@@L s5_static_extra.txt 5 ^Warning: this can be very slow
@@L s3_dyn.txt 3 ^Warning: this can be very slow
@@L s1_main.txt 3 ^Searching for ROP gadget:
@@L s1_main.txt 2 ^Searching for ASM code:
@@L s1_main.txt 3 ^0x401014 : call rax
```
* ropgadget: `/^(ret|popret|pop\d+ret|addesp_\d+) = (0x[0-9a-f]+)$/` (peda.py:5233-5235)
* dumprop: `/^(0x[0-9a-f]+): (.+)$/`. The gadget has instructions separated by `; ` (peda.py:5212). Tokenise each instruction as in §7.
* ropsearch/asmsearch: `/^(0x[0-9a-f]{8,16}) : \((?:b'([0-9a-f]+)'|([0-9a-f]+))\)\t(.*)$/`. **ropsearch prints the raw
  Python 3 bytes repr `b'5f5dc3'`** (peda.py:5159, a py3 bug; asmsearch decodes it, peda.py:5116).
* jmpcall: `/^(0x[0-9a-f]+) : ((?:call|jmp) .*)$/` (peda.py:5273)

---

## 19. ELF helpers: `elfheader`, `readelf`, `elfsymbol`

```text
@@L s1_main.txt 4 ^\.note\.gnu\.property = 
@@G s1_main.txt 1 ^rodata\.cst32 = 
@@G s1_main.txt 1 ^\.text: 0x4011c0
@@G s3_dyn.txt 1 ^\.text: 0x2aaaab316800
@@G s1_main.txt 1 ^'printf': no match found
@@G s3_dyn.txt 1 ^'plt symbols': no match found
```
* list: `/^(\.?[A-Za-z_][\w.]*) = (0x[0-9a-f]+)$/` gives `section-name`, `address`. Not every name starts with `.` (`rodata.cst32`).
* single: `/^(\.?[\w.]+): (0x[0-9a-f]+) - (0x[0-9a-f]+) \((code|data|rodata)\)$/`. The type word is a memory-type token.
* elfsymbol success lines `Found %d symbols` / `Detail symbol info` / `name = 0x…` (peda.py:5009-5014) are **source-only**
  (no PLT symbols were visible over qemu, see SETUP.md).

---

## 20. Misc: `pshow`/`pset`, `procinfo`, `getpid`, `phelp`, `skeleton`, `aslr`

```text
@@G s1_main.txt 1 ^ansicolor = 'on'
@@G s1_main.txt 1 ^pagesize = 0
@@L s1_main.txt 4 ^exe = 
@@L s1_main.txt 3 ^Display various information of current execution context
```
* key/value: `/^([\w.@-]+) = (.*)$/` (shared with ropgadget/elfheader).
* procinfo fd lines: `/^(fd\[\d+\]) -> (.*)$/` (peda.py:3539).
* `aslr` prints `ASLR is ON|OFF` (peda.py:3396-3398). It printed nothing over a remote target, so it is **source-only**.
* `tracecall`/`traceinst` (peda.py:4005-4170) print `" dep:%02d "` trees with `|-- arg[%d]: chain` children. **source-only**.

---

## Ambiguities / heuristics

1. **Memory-type colours are lost.** In plain text, `0x401870` (code, red), `0x4b5900` (heap, blue) and `0x481010` (rodata, green)
   look the same. Use these recoverable signals:
   * The annotation shape after the last element: `(<sym+off>:⇥insn)` or `(insn)` means code. `("str")` means data or rodata.
     `('str')` or nothing means the last element is a value.
   * Elements before the last are always addresses (§6 rule 3). Colour them generically (`address`) unless the map is known.
   * Use the `vmmap` table pasted in the same block if one is there. Build ranges from it and classify by perm:
     `x` gives code, `w` gives data, otherwise rodata. This is exactly PEDA's rule (peda.py:2046-2125: writable first, then executable plus a
     code section, else rodata).
   * Address-magnitude heuristics (real Linux x86_64): `0x7ff[c-f]…` stack, `0x7f…` libraries/mmap, `0x55…`/`0x56…` PIE binary and
     heap, `0x4xxxxx` non-PIE binary, `0x08xxxxxx` i386 binary, `0xff…` i386 stack. **Under qemu-user (these captures) the stack and
     libraries are at `0x2aaaab2…`, so do not hard-code these ranges. Treat them as soft hints only.**
2. **Strings.** `("…")` is gdb `x/s` output and uses C escapes (`"0\f\200@\001"`, `"%s %s %d\n"`).
   `('…')` is Python `repr` of the value bytes (`'\r'`, `'@'`, `'AA0A'`). It switches to double quotes if the text contains a `'`, which
   overlaps with the gdb form (source behaviour of `repr`, utils.py:863-879). Strings can contain `(`, `)`, `;`, `'` and spaces
   (captured: `("GDB_EXTRA=-ex 'set sysroot /usr/x86_64-linux-gnu'")`, pattern strings with `(` `)` `;`). Always anchor the annotation
   at end of line. Long strings: gdb truncates at `print elements` (200) and appends `...`. That is gdb behaviour and was not captured.
3. **Code annotations contain a TAB** (`(<main+19>:⇥cmp …)`) and may have lost it after paste. The annotation for code without
   a symbol is just the instruction (`(mov    edi,eax)`, `(endbr64)`), which looks like any word in parentheses. Accept it only as the
   final annotation of a chain line.
4. **Trailing spaces.** Chains with no annotation end with a space (`RBX: 0x1 `). Obsidian or editors may trim it, so the regexes
   must not require it.
5. **Address widths vary**: chains use un-padded `0x401967`. vmmap, hexdump, pattern search and ropsearch use `to_address` (8 or 16 digits,
   mixed within one table). gdb `disassemble`/step echo uses 16 digits (`0x000000000040196b`).
6. **Disassembly line kinds share prefixes**: `   0x…` (context / x/i / disassemble), `=> 0x…` (current), ` | 0x…` (skipped),
   ` |->   0x…` (jump target), `       0x…` (target continuation). The 7-space form exists only after ` |->`.
7. **`key = value` lines** come from ropgadget, elfheader, pshow, procinfo and elfsymbol. They share one regex, so highlight value by type
   (hex gives `address`, quoted gives `string`).
8. **`0x…: …` lines** come from dumprop (`0x401017: add esp,0x8; ret`), `strings` (`0x481010: Hello…`) and gdb x/ (`0x481010:⇥"…"`, with a TAB).
   Prefer the TAB to detect x/ output, and an instruction-looking body to detect dumprop.
9. **gdb vs PEDA register names**: PEDA uses upper-case `RAX:`/`R8 :` and gdb `info registers` uses lower-case columns.
   `pattern search` uses `RBP+0 found at offset: 32`, `FS_BASE+-92 …`, `CR2+0 …`.
10. **Clear-screen.** Each context starts with `ESC[2J ESC[H` (utils.py:150-152). In plain text the context simply begins at the
    registers banner. Captures that include scroll-back therefore show many back-to-back contexts.
11. **Stop line placement.** The gdb stop line (`Breakpoint 1, main (...)`, `Program received signal …`) appears **after** the context block
    for breakpoints and `nextcall`, and **before** it for signals (captured order in s1/s2). For `ni`/`si` the source-line echo
    `0x…⇥26⇥…` comes after the Legend line.
12. **qemu fidelity caveats** (affect examples, not formats): stack and library addresses are `0x2aaaab…` instead of `0x7ff…`/`0x7f…`.
    After the overflow, x86_64 RIP became the non-canonical `0x4141464141304141`; on real hardware `ret` faults first and RIP stays on
    the `ret` instruction. `procinfo` shows the host qemu process. gdb did not register shared libraries, so PLT calls show as bare
    `call   0x5555555570f0` without `<printf@plt>`.
13. **Degraded memory map** (no `/proc/<pid>/maps`, e.g. any gdbserver/qemu remote without a fix): PEDA cannot classify addresses, so
    code pointers appear as raw dereferenced values (`RIP: 0x401967 --> 0x8d48097e029c7d83 `, captured s6_noshim_degraded.txt)
    and rodata reads can show `(MemError)`. A highlighter should accept both forms.
14. **Block detection for ```peda**: strong signals are any of `gdb-peda$`, `^\[-+(registers|code|stack)-+\]$`, `^Legend: code, data, rodata, value$`,
    `^\d{4}\| 0x`, `^EFLAGS: 0x[0-9a-f]+ \(`. GEF uses `$rsp`-style and `─` box-drawing banners, and pwndbg uses `─────[ REGISTERS ]` and `◂—`. Neither uses
    PEDA's `[----…]` ASCII banners or `-->` chains with `NNNN| ` offsets.

---

## Python 3 / modern gdb status (found while capturing)

* **PEDA does not load out of the box on Python 3.12**: the bundled `lib/six.py` is 1.9.0 and fails with
  `No module named 'six.moves'` (captured `captures/load_unpatched_py312.txt`). Fix: replace it with a current `six`.
* Python 3.12 prints 31 `SyntaxWarning: invalid escape sequence` lines at load (regex strings in peda.py). This is harmless and was
  silenced with `PYTHONWARNINGS=ignore`.
* gdb ≥12 prints `'set logging off'… is deprecated` warnings at first use (captured).
* `ropsearch` prints `b'…'` byte reprs (py3 bug). `pdisass <addr> <count>` prints a garbled header. Neither stops the tool from working.
