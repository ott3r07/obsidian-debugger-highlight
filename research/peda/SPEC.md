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
gdb-peda$ break main
gdb-peda$ continue
gdb-peda$ continue
```
Pager prompt (captured, `pager()` utils.py:247-271, `pagesize` default 25, config.py:29). Whatever the user typed
at the pager can show up on the same line:
```text
--More--(25/52)
--More--(50/52)
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
[----------------------------------registers-----------------------------------]
[-------------------------------------code-------------------------------------]
[------------------------------------stack-------------------------------------]
[------------------------------------------------------------------------------]
Legend: code, data, rodata, value
Stopped reason: SIGSEGV
Stopped reason: SIGTRAP
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
RAX: 0x401954 (<main>:	endbr64)
RBX: 0x1 
RCX: 0x4b58f0 --> 0x0 
RDX: 0x2aaaab2abd38 --> 0x2aaaab2abef2 ("HOSTNAME=e34b95a55858")
RSI: 0x2aaaab2abd28 --> 0x2aaaab2abee4 ("./test_static")
RDI: 0x1 
RBP: 0x2aaaab2abc10 --> 0x2aaaab2abcb0 --> 0x2aaaab2abd00 --> 0x0 
RSP: 0x2aaaab2abba0 --> 0x2aaaab2abd28 --> 0x2aaaab2abee4 ("./test_static")
RIP: 0x401967 (<main+19>:	cmp    DWORD PTR [rbp-0x64],0x2)
R8 : 0x4ac260 --> 0x4b58f0 --> 0x0 
R9 : 0x110 
R10: 0x1 
R11: 0x0 
R12: 0x2aaaab2abd28 --> 0x2aaaab2abee4 ("./test_static")
R13: 0x2aaaab2abd38 --> 0x2aaaab2abef2 ("HOSTNAME=e34b95a55858")
R14: 0x4a7f68 --> 0x401870 (<frame_dummy>:	endbr64)
R15: 0x1
EFLAGS: 0x206 (carry PARITY adjust zero sign trap INTERRUPT direction overflow)
```
32-bit (captured s4_x86.txt):
```text
EAX: 0x6a ('j')
EBX: 0x61414145 ('EAAa')
ECX: 0x0 
EDX: 0x0 
ESI: 0x40800c30 --> 0x2 
EDI: 0x1 
EBP: 0x41304141 ('AA0A')
ESP: 0x40800ba0 ("bAA1AAGAAcAA2AAHAAdAA3AAIAAeAA4AAJAAfAA5AAKAAgAA6AAL")
EIP: 0x41414641 ('AFAA')
EFLAGS: 0x202 (carry parity adjust zero sign trap INTERRUPT direction overflow)
```
Degraded memory map, where code pointers show as raw dereferenced qwords (captured s6_noshim_degraded.txt):
```text
RIP: 0x401967 --> 0x8d48097e029c7d83 
R14: 0x4a7f68 --> 0x401870 --> 0x47f370b8fa1e0ff3 
0056| 0x2aaaab2abbc8 --> 0x40f1a2 --> 0x81840fc08548 
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
EFLAGS: 0x297 (CARRY PARITY ADJUST zero SIGN trap INTERRUPT direction overflow)
EFLAGS: 0x246 (carry PARITY adjust ZERO sign trap INTERRUPT direction overflow)
EFLAGS: 0x202 (carry parity adjust zero sign trap INTERRUPT direction overflow)
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
0000| 0x2aaaab2abba0 --> 0x2aaaab2abd28 --> 0x2aaaab2abee4 ("./test_static")
0008| 0x2aaaab2abba8 --> 0x1004ac200 
0016| 0x2aaaab2abbb0 --> 0xf 
0024| 0x2aaaab2abbb8 --> 0x0 
0032| 0x2aaaab2abbc0 --> 0x4b3190 --> 0x4b57f0 --> 0x4 
0040| 0x2aaaab2abbc8 --> 0x7f580 
0048| 0x2aaaab2abbd0 --> 0x2aaaab2abc00 --> 0x2aaaab2abc20 --> 0x2aaaab2abca0 --> 0x2aaaab2abcb0 --> 0x2aaaab2abd00 (--> ...)
0056| 0x2aaaab2abbd8 --> 0x40f1a2 (<malloc+418>:	test   rax,rax)
0000| 0x40800ba0 ("bAA1AAGAAcAA2AAHAAdAA3AAIAAeAA4AAJAAfAA5AAKAAgAA6AAL")
0004| 0x40800ba4 ("AAGAAcAA2AAHAAdAA3AAIAAeAA4AAJAAfAA5AAKAAgAA6AAL")
0008| 0x40800ba8 ("AcAA2AAHAAdAA3AAIAAeAA4AAJAAfAA5AAKAAgAA6AAL")
0012| 0x40800bac ("2AAHAAdAA3AAIAAeAA4AAJAAfAA5AAKAAgAA6AAL")
0016| 0x40800bb0 ("AAdAA3AAIAAeAA4AAJAAfAA5AAKAAgAA6AAL")
0020| 0x40800bb4 ("A3AAIAAeAA4AAJAAfAA5AAKAAgAA6AAL")
0024| 0x40800bb8 ("IAAeAA4AAJAAfAA5AAKAAgAA6AAL")
0028| 0x40800bbc ("AA4AAJAAfAA5AAKAAgAA6AAL")
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
RBP: 0x2aaaab2abc10 --> 0x2aaaab2abcb0 --> 0x2aaaab2abd00 --> 0x0 
RIP: 0x401967 (<main+19>:	cmp    DWORD PTR [rbp-0x64],0x2)
R14: 0x4a7f68 --> 0x401870 (<frame_dummy>:	endbr64)
RDI: 0x40 ('@')
RAX: 0xd ('\r')
0016| 0x2aaaab2abbb0 ("Hello, PEDA highlighter!")
0048| 0x2aaaab2abbd0 --> 0x2aaaab2abc00 --> 0x2aaaab2abc20 --> 0x2aaaab2abca0 --> 0x2aaaab2abcb0 --> 0x2aaaab2abd00 (--> ...)
0008| 0x2aaaab2abbc8 --> 0x2aaaab3181ca (mov    edi,eax)
0016| 0x2aaaab2abcf0 --> 0x2aaaab2abebd --> 0x4f48006f6c6c6568 ('hello')
RIP: 0x4141464141304141 ('AA0AAFAA')
EIP: 0x80498f3 (<vuln+22>:	sub    esp,0x8)
0020| 0x40800b84 --> 0x80b4036 ("%s %s %d\n")
0048| 0x2aaaab2abd10 --> 0x2aaaab2abee3 ("GDB_EXTRA=-ex 'set sysroot /usr/x86_64-linux-gnu'")
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
   0x40195c <main+8>:	sub    rsp,0x70
   0x401960 <main+12>:	mov    DWORD PTR [rbp-0x64],edi
   0x401963 <main+15>:	mov    QWORD PTR [rbp-0x70],rsi
=> 0x401967 <main+19>:	cmp    DWORD PTR [rbp-0x64],0x2
   0x40196b <main+23>:	jle    0x401976 <main+34>
   0x40196d <main+25>:	lea    rax,[rip+0xffffffffffffff49]        # 0x4018bd <mul>
   0x401974 <main+32>:	jmp    0x40197d <main+41>
   0x401976 <main+34>:	lea    rax,[rip+0xffffffffffffff28]        # 0x4018a5 <add>
   0x401986 <main+50>:	call   0x40f000 <malloc>
   0x4018d3 <mul+22>:	ret
=> 0x8049020:	jmp    DWORD PTR ds:0x80e9000
   0x4019fe <main+170>:	lea    rax,[rip+0x7f62d]        # 0x481032
=> 0x5555555572d8 <vuln+16>:	mov    rax,QWORD PTR fs:0x28
```
`x/10i $pc` (gdb, captured):
```text
gdb-peda$ x/10i $pc
=> 0x4019ed <main+153>:	mov    DWORD PTR [rbp-0x14],eax
   0x4019f0 <main+156>:	mov    ecx,DWORD PTR [rbp-0x14]
   0x4019f3 <main+159>:	mov    rdx,QWORD PTR [rbp-0x10]
   0x4019f7 <main+163>:	lea    rax,[rbp-0x60]
   0x4019fb <main+167>:	mov    rsi,rax
   0x4019fe <main+170>:	lea    rax,[rip+0x7f62d]        # 0x481032
   0x401a05 <main+177>:	mov    rdi,rax
   0x401a08 <main+180>:	mov    eax,0x0
   0x401a0d <main+185>:	call   0x404e90 <printf>
   0x401a12 <main+190>:	cmp    DWORD PTR [rbp-0x64],0x1
```
`disassemble main` / `pdisass main` (gdb format with 16-digit addresses and `<+off>`; `pdisass` adds PEDA colours, peda.py:3570-3586):
```text
Dump of assembler code for function main:
   0x0000000000401954 <+0>:	endbr64
   0x0000000000401958 <+4>:	push   rbp
=> 0x00000000004019f0 <+156>:	mov    ecx,DWORD PTR [rbp-0x14]
End of assembler dump.
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
   0x401960 <main+12>:	mov    DWORD PTR [rbp-0x64],edi
   0x401963 <main+15>:	mov    QWORD PTR [rbp-0x70],rsi
   0x401967 <main+19>:	cmp    DWORD PTR [rbp-0x64],0x2
=> 0x40196b <main+23>:	jle    0x401976 <main+34>
 | 0x40196d <main+25>:	lea    rax,[rip+0xffffffffffffff49]        # 0x4018bd <mul>
 | 0x401974 <main+32>:	jmp    0x40197d <main+41>
 | 0x401976 <main+34>:	lea    rax,[rip+0xffffffffffffff28]        # 0x4018a5 <add>
 | 0x40197d <main+41>:	mov    QWORD PTR [rbp-0x8],rax
 |->   0x401976 <main+34>:	lea    rax,[rip+0xffffffffffffff28]        # 0x4018a5 <add>
       0x40197d <main+41>:	mov    QWORD PTR [rbp-0x8],rax
       0x401981 <main+45>:	mov    edi,0x40
       0x401986 <main+50>:	call   0x40f000 <malloc>
                                                                  JUMP is taken
   0x804901b <_init+27>:	add    esp,0x8
   0x804901e <_init+30>:	pop    ebx
   0x804901f <_init+31>:	ret
=> 0x8049020:	jmp    DWORD PTR ds:0x80e9000
 | 0x8049026:	xchg   ax,ax
 | 0x8049028:	jmp    DWORD PTR ds:0x80e9004
 | 0x804902e:	xchg   ax,ax
 | 0x8049030:	jmp    DWORD PTR ds:0x80e9008
 |->   0x80588d0 <__strcpy_ssse3>:	mov    edx,DWORD PTR [esp+0x4]
       0x80588d4 <__strcpy_ssse3+4>:	mov    ecx,DWORD PTR [esp+0x8]
       0x80588d8 <__strcpy_ssse3+8>:	cmp    BYTE PTR [ecx],0x0
       0x80588db <__strcpy_ssse3+11>:	je     0x8059fb0 <__strcpy_ssse3+5856>
                                                                  JUMP is taken
   0x401a08 <main+180>:	mov    eax,0x0
   0x401a0d <main+185>:	call   0x404e90 <printf>
   0x401a12 <main+190>:	cmp    DWORD PTR [rbp-0x64],0x1
=> 0x401a16 <main+194>:	jle    0x401a2b <main+215>
   0x401a18 <main+196>:	mov    rax,QWORD PTR [rbp-0x70]
   0x401a1c <main+200>:	add    rax,0x8
   0x401a20 <main+204>:	mov    rax,QWORD PTR [rax]
   0x401a23 <main+207>:	mov    rdi,rax
                                                              JUMP is NOT taken
Guessed arguments:
arg[0]: 0x4018a5 (<add>:	endbr64)
arg[1]: 0x6 
arg[2]: 0x7 
Guessed arguments:
arg[0]: 0x481032 ("%s %s %d\n")
arg[1]: 0x2aaaab2abbb0 ("Hello, PEDA highlighter!")
arg[2]: 0x4b5900 ("heap string AAAABBBB")
arg[3]: 0xd ('\r')
No argument
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
Invalid $PC address: 0x4141464141304141
Warning: not running
Error: missing argument
Stepping through, Ctrl-C to stop...
```
* `/^(Invalid \$(?:PC|SP) address): (0x[0-9a-f]+)$/` gives `error` (red) + `address` (peda.py:4324, 4346, 4748).
* `/^(Warning): (.*)$/` gives `warning` (yellow, utils.py:206-208). `/^(Error): (.*)$/` gives `error` (red, utils.py:210-212).
  `/^(Debug): (.*)$/` is cyan (utils.py:214-216, **source-only**).
* `Warning: not running` is printed by `_is_running()` (peda.py:3037-3047). It also appears right after
  `[Inferior 1 (process N) exited normally]`, because the hook-stop (`peda context`, peda.py:6121-6124) still fires.
  This is captured in s1_main.txt, s3_dyn.txt and s2_crash.txt.
* gdb ≥12 prints these at PEDA load, because PEDA still uses `set logging on/off` (peda.py:111-126):
  ```text
Warning: 'set logging off', an alias for the command 'set logging enabled', is deprecated.
Use 'set logging enabled off'.

Warning: 'set logging on', an alias for the command 'set logging enabled', is deprecated.
Use 'set logging enabled on'.
  ```
* Command help on wrong usage (`pedacmd.help(cmd)`, peda.py:6030) prints a doc block: a description line, `Usage:`, and indented usage
  lines (captured s1_main.txt after `skeleton`, `hexdump`).

---

## 10. gdb lines that appear between PEDA blocks (stop events, stepping, exit)

These are **gdb** output. PEDA sets `output-radix 0x10` (peda.py:6153), so gdb prints integers in hex
(`argc=0x1`, `$8 = 0x37` for a plain `p`).

```text
Breakpoint 1 at 0x401967: file test.c, line 26.
Continuing.
Breakpoint 1, main (argc=0x1, argv=0x2aaaab2abd28) at test.c:26
26	    op_fn fp = (argc > 2) ? mul : add;
0x000000000040196b	26	    op_fn fp = (argc > 2) ? mul : add;
Breakpoint 2, 0x00000000004019e8 in main (argc=0x1, argv=0x2aaaab2abd28) at test.c:30
Breakpoint 1, vuln (
    src=0x40800e71 "AAA%AAsAABAA$AAnAACAA-AA(AADAA;AA)AAEAAaAA0AAFAAbAA1AAGAAcAA2AAHAAdAA3AAIAAeAA4AAJAAfAA5AAKAAgAA6AAL") at test.c:20
compute (f=0x4ac200 <main_arena>, x=0x0, y=0x4b4fc0) at test.c:12
Run till exit from #0  compute (f=0x4ac200 <main_arena>, x=0x0, y=0x4b4fc0) at test.c:12
Value returned is $2 = 0xd
0x0000000000404e90 in printf ()
Program received signal SIGSEGV, Segmentation fault.
0x4141464141304141 in ?? ()
Continuing with signal SIGSEGV.

Program terminated with signal SIGSEGV, Segmentation fault.
[Inferior 1 (process 865) exited normally]
0x00002aaaab2cb550 in ?? ()
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
0x2aaaab2abba0:	0x00002aaaab2abd28	0x00000001004ac200
0x2aaaab2abbb0:	0x50202c6f6c6c6548	0x6867696820414445
0x2aaaab2abbc0:	0x217265746867696c	0x0000000000000000
0x2aaaab2abba0:	0xab2abd28	0x00002aaa	0x004ac200	0x00000001
0x2aaaab2abbb0:	0x6c6c6548	0x50202c6f	0x20414445	0x68676968
0x2aaaab2abba0:	0x28	0xbd	0x2a	0xab	0xaa	0x2a	0x00	0x00
0x2aaaab2abba8:	0x00	0xc2	0x4a	0x00	0x01	0x00	0x00	0x00
gdb-peda$ x/4s *(char**)&greeting
0x481010:	"Hello, PEDA highlighter!"
0x481029:	"buf: %s\n"
0x481032:	"%s %s %d\n"
0x48103c:	""
0x40800b70:	"0\f\200@\001"
```
* Regex: `/^(0x[0-9a-f]+)(?: <([^>]+)>)?:\t(.*)$/` gives `address` + optional `symbol` + body. In the body, `/0x[0-9a-f]+/g` gives
  `immediate` and `/"(?:[^"\\]|\\.)*"/` gives `string`. gdb prints `<sym+off>` after the address when it resolves to a symbol;
  that is gdb behaviour and was not captured here.

---

## 12. `info registers` / `p` / `bt` (gdb)

```text
rax            0xd                 0xd
rbx            0x1                 0x1
rcx            0x4018a5            0x4018a5
rip            0x4019ed            0x4019ed <main+153>
eflags         0x212               [ IOPL=0 IF AF ]
xmm0           {
  v4_float = {0x6c6c6548, 0x50202c6f, 0x20414445, 0x68676968},
  v2_double = {0x50202c6f6c6c6548, 0x6867696820414445},
$5 = (void *) 0x2aaaab2abba0
$7 = 0x481010 "Hello, PEDA highlighter!"
$10 = {int (int, char **)} 0x401954 <main>
$11 = [ IOPL=0 IF AF ]
#0  compute (f=0x4ac200 <main_arena>, x=0x0, y=0x4b4fc0) at test.c:12
#1  0x00000000004019ed in main (argc=0x1, argv=0x2aaaab2abd28) at test.c:30
#2  0x0000000000401f68 in __libc_start_call_main ()
#3  0x0000000000404130 in __libc_start_main_impl ()
#4  0x00000000004017a5 in _start ()
#0  0x4141464141304141 in ?? ()
#1  0x4147414131414162 in ?? ()
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
Start              End                Perm	Name
0x00400000         0x00401000         r--p	/work/test_static
0x00401000         0x00481000         r-xp	/work/test_static
0x00481000         0x004a7000         r--p	/work/test_static
0x004a7000         0x004ae000         rw-p	/work/test_static
0x004ae000         0x004b4000         rw-p	/work/test_static
0x004b4000         0x004d6000         rw-p	[heap]
0x00002aaaaaaac000 0x00002aaaab2ac000 rw-p	[stack]
0x00002aaaab2ac000 0x00002aaaab2ad000 r-xp	mapped
0x00002aaaab2ad000 0x00002aaaab2af000 rw-p	mapped
0xffffffffff600000 0xffffffffff601000 --xp	[vsyscall]
gdb-peda$ vmmap libc
Start              End                Perm	Name
0x00002aaaab2ee000 0x00002aaaab316000 r--p	/usr/x86_64-linux-gnu/lib/libc.so.6
0x00002aaaab316000 0x00002aaaab49e000 r-xp	/usr/x86_64-linux-gnu/lib/libc.so.6
Start      End        Perm	Name
0x08048000 0x08049000 r--p	/work/test_static32
0x08049000 0x080b4000 r-xp	/work/test_static32
0x080b4000 0x080e6000 r--p	/work/test_static32
0x080e6000 0x080ea000 rw-p	/work/test_static32
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
CANARY    : ENABLED
FORTIFY   : disabled
NX        : ENABLED
PIE       : disabled
RELRO     : Partial
CANARY    : ENABLED
FORTIFY   : disabled
NX        : ENABLED
PIE       : ENABLED
RELRO     : FULL
CANARY    : ENABLED
FORTIFY   : disabled
NX        : ENABLED
PIE       : disabled
RELRO     : Partial
```
* Regex: `/^(CANARY|FORTIFY|NX|PIE|RELRO)\s+: (ENABLED|FULL|disabled|Partial|Dynamic Shared Object)$/`
  gives `security-key` + `security-enabled` (ENABLED/FULL, green), `security-disabled` (red) or `security-partial`
  (Partial/Dynamic Shared Object, yellow).
* checksec runs `/usr/bin/readelf -W -a` (peda.py:2545-2547; path from config.py:17). Without readelf it silently prints the defaults
  (`NX: ENABLED`, all others `disabled`). This happened in an earlier run of this study (see SETUP.md), so a paste can look valid and still be wrong.

---

## 15. `xinfo`, `xprint`, `distance`, `hexdump`

```text
gdb-peda$ xinfo 0x4b5900
0x4b5900 ("heap string AAAABBBB")
Virtual memory mapping:
Start : 0x004b4000
End   : 0x004d6000
Offset: 0x1900
Perm  : rw-p
Name  : [heap]
0x2aaaab3181ca (mov    edi,eax)
Virtual memory mapping:
Start : 0x00002aaaab316000
End   : 0x00002aaaab49e000
Offset: 0x21ca
Perm  : r-xp
Name  : /usr/x86_64-linux-gnu/lib/libc.so.6
0xdeadbeef 
From 0x2aaaab2abac0 to 0x2aaaab2abb90: 208 bytes, 52 dwords
From 0x2aaaab2abac0 (SP) to 0x2aaaab2abac0: 0 bytes, 0 dwords
0x00002aaaab2abba0 : 28 bd 2a ab aa 2a 00 00 00 c2 4a 00 01 00 00 00   (.*..*....J.....
0x00002aaaab2abbb0 : 48 65 6c 6c 6f 2c 20 50 45 44 41 20 68 69 67 68   Hello, PEDA high
0x00002aaaab2abbc0 : 6c 69 67 68 74 65 72 21 00 00 00 00 00 00 00 00   lighter!........
0x00481010 : 48 65 6c 6c 6f 2c 20 50 45 44 41 20 68 69 67 68   Hello, PEDA high
0x00481020 : 6c 69 67 68 74 65 72 21 00 62 75 66 3a 20 25 73   lighter!.buf: %s
0x40800b5c : 02 99 04 08 70 0b 80 40 71 0e 80 40 dd 06 05 08   ....p..@q..@....
0x40800b6c : ed 98 04 08 30 0c 80 40 01 00 00 00 18 0c 80 40   ....0..@.......@
0x40800b7c : e9 cb 04 08 60 9c 0e 08 36 40 0b 08 a4 0b 80 40   ....`...6@.....@
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
Searching for 'PEDA' in: None ranges
Found 3 results, display max 3 items:
test_static : 0x481017 ("PEDA highlighter!")
    [stack] : 0x2aaaab2abbb7 ("PEDA highlighter!")
    [stack] : 0x2aaaab2abf9c ("PEDA_QEMU_PAGELOG=/tmp/qemu_pages.log")
Searching for 'heap' in range: 0x4b5000 - 0x4b6000
Found 1 results, display max 1 items:
[heap] : 0x4b5900 ("heap string AAAABBBB")
Searching for reference to: '0x4b5900' in: all ranges
[stack] : 0x2aaaab2aba00 --> 0x2aaaab2abaf0 --> 0x4b5900 ("heap string AAAABBBB")
[stack] : 0x2aaaab2aabd0 --> 0x2aaaab2abc00 --> 0x4b5900 ("heap string AAAABBBB")
Searching for pointers on: stack pointed to: binary, this may take minutes to complete...
Searching for '/bin/sh' in: libc ranges
Found 1 results, display max 1 items:
libc.so.6 : 0x2aaaab4b942f --> 0x68732f6e69622f ('/bin/sh')
Searching for '/bin' in: binary ranges
Not found
0x481010: Hello, PEDA highlighter!
0x481029: buf: %s
0x481032: %s %s %d
All references to 'compute':
0x4019e8 <main+148>:	call   0x4018d4 <compute>
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
'AAA%AAsAABAA$AAnAACAA-AA(AADAA;AA)AAEAAaAA0AAFAAbAA1AAGAAcAA2AAH'
Writing pattern of 40 chars to filename "/tmp/pat.txt"
AA8A found at offset: 112
1094790465 found at offset: 20
4702116732032008513 found at offset: 40
Registers contain pattern buffer:
RBP+0 found at offset: 32
R11+52 found at offset: 69
RIP+0 found at offset: 40
FS_BASE+-92 found at offset: 52742
CR2+0 found at offset: 40
Registers point to pattern buffer:
[RSP] --> offset 48 - size ~52
Pattern buffer found at:
0x004aa78b : offset 37729 - size    4 (/work/test_static)
0x004b5986 : offset    0 - size  100 ([heap])
0x00002aaaab2aab76 : offset 37729 - size    4 ($sp + -0xfba [-1007 dwords])
0x00002aaaab2abb00 : offset    0 - size  100 ($sp + -0x30 [-12 dwords])
0x00002aaaab2abe81 : offset 37729 - size    4 ($sp + 0x351 [212 dwords])
0x00002aaaab2abe8d : offset    0 - size  100 ($sp + 0x35d [215 dwords])
0x00002aaaab2abfec : offset 37729 - size    4 ($sp + 0x4bc [303 dwords])
References to pattern buffer found at:
0x00002aaaab2ab370 : 0x00002aaaab2abb00 ($sp + -0x7c0 [-496 dwords])
0x00002aaaab2aba38 : 0x00002aaaab2abb00 ($sp + -0xf8 [-62 dwords])
0x004ada90 : 0x00002aaaab2abe81 (/work/test_static)
0x00002aaaab2aba40 : 0x00002aaaab2abe8d ($sp + -0xf0 [-60 dwords])
0x00002aaaab2abaf8 : 0x00002aaaab2abe8d ($sp + -0x38 [-14 dwords])
0x00002aaaab2abcc0 : 0x00002aaaab2abe8d ($sp + 0x190 [100 dwords])
Registers contain pattern buffer:
EBX+0 found at offset: 36
EBP+0 found at offset: 40
EIP+0 found at offset: 44
CR2+0 found at offset: 44
Registers point to pattern buffer:
[ESP] --> offset 48 - size ~52
Pattern buffer found at:
0x080e8163 : offset 37729 - size    4 (/work/test_static32)
0x080edfa6 : offset    0 - size  100 ([heap])
0x407ffc16 : offset 37729 - size    4 ($sp + -0xf8a [-995 dwords])
0x40800b70 : offset    0 - size  100 ($sp + -0x30 [-12 dwords])
0x40800e63 : offset 37729 - size    4 ($sp + 0x2c3 [176 dwords])
0x40800e71 : offset    0 - size  100 ($sp + 0x2d1 [180 dwords])
0x40800fea : offset 37729 - size    4 ($sp + 0x44a [274 dwords])
References to pattern buffer found at:
0x40800b64 : 0x40800b70 ($sp + -0x3c [-15 dwords])
0x080e9eec : 0x40800e63 (/work/test_static32)
0x40800d58 : 0x40800e71 ($sp + 0x1b8 [110 dwords])
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
gdb-peda$ ropgadget
addesp_1 = 0x41d911
ret = 0x40101a
popret = 0x401739
pop2ret = 0x401738
addesp_0 = 0x2aaaab35b5b7
addesp_1 = 0x2aaaab31a254
ret = 0x2aaaab31682f
Warning: this can be very slow, do not run for large memory range
Writing ROP gadgets to file: test_static-rop.txt ...
0x401017: add esp,0x8; ret
0x401016: add rsp,0x8; ret
0x401014: call rax; add rsp,0x8; ret
Warning: this can be very slow, do not run for large memory range
Writing ROP gadgets to file: test_dyn-rop.txt ...
0x5555555571d3: pop rbp; ret
Searching for ROP gadget: 'pop rdi' in: binary ranges
0x004021f8 : (b'5f5dc3')	pop rdi; pop rbp; ret
0x004028b8 : (b'5f5dc3')	pop rdi; pop rbp; ret
Searching for ASM code: 'pop rdi ; ret' in: binary ranges
Not found
0x401014 : call rax
0x40125d : jmp [rax]
0x4017dc : jmp rax
```
* ropgadget: `/^(ret|popret|pop\d+ret|addesp_\d+) = (0x[0-9a-f]+)$/` (peda.py:5233-5235)
* dumprop: `/^(0x[0-9a-f]+): (.+)$/`. The gadget has instructions separated by `; ` (peda.py:5212). Tokenise each instruction as in §7.
* ropsearch/asmsearch: `/^(0x[0-9a-f]{8,16}) : \((?:b'([0-9a-f]+)'|([0-9a-f]+))\)\t(.*)$/`. **ropsearch prints the raw
  Python 3 bytes repr `b'5f5dc3'`** (peda.py:5159, a py3 bug; asmsearch decodes it, peda.py:5116).
* jmpcall: `/^(0x[0-9a-f]+) : ((?:call|jmp) .*)$/` (peda.py:5273)

---

## 19. ELF helpers: `elfheader`, `readelf`, `elfsymbol`

```text
.note.gnu.property = 0x400270
.note.gnu.build-id = 0x4002a0
.note.ABI-tag = 0x4002c4
.rela.plt = 0x4002e8
rodata.cst32 = 0x49d340
.text: 0x4011c0 - 0x480740 (code)
.text: 0x2aaaab316800 - 0x2aaaab49db4d (code)
'printf': no match found
'plt symbols': no match found
```
* list: `/^(\.?[A-Za-z_][\w.]*) = (0x[0-9a-f]+)$/` gives `section-name`, `address`. Not every name starts with `.` (`rodata.cst32`).
* single: `/^(\.?[\w.]+): (0x[0-9a-f]+) - (0x[0-9a-f]+) \((code|data|rodata)\)$/`. The type word is a memory-type token.
* elfsymbol success lines `Found %d symbols` / `Detail symbol info` / `name = 0x…` (peda.py:5009-5014) are **source-only**
  (no PLT symbols were visible over qemu, see SETUP.md).

---

## 20. Misc: `pshow`/`pset`, `procinfo`, `getpid`, `phelp`, `skeleton`, `aslr`

```text
ansicolor = 'on'
pagesize = 0
exe = /usr/bin/qemu-x86_64
fd[0] -> /dev/null
fd[1] -> /tmp/prog_stdout.txt
fd[2] -> /tmp/prog_stdout.txt
Display various information of current execution context
Usage:
    context [reg,code,stack,all] [code/stack length]
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
