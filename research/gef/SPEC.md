# GEF plain-text output spec (for a ```gef highlighter)

Evidence base:
* **Captures.** `captures/<arch>/<command>_<arch>.{ansi,txt}`. Arch directories: `arm64` (native aarch64), `arm64_crash`, `x86_64` (qemu-user with real maps patched in), `x86_64_crash`, `x86_64_qemu_degraded` (stock `gef-remote --qemu-user`, fake maps). Each `.txt` file is the plain text a user would paste; the matching `.ansi` file shows the colors.
* **Source.** `gef.py:N` means `build/gef.py`, hugsy/gef `main` @ `8514ebc` (Nov 2026). Older tags are in `build/oldgef/` and are cited as `gef-<tag>.py:N`.
* **Labels.** **source-only** marks a format seen in the code but not in any capture. **observed** marks a capture-only finding.
* **Pipes in tables.** Inside table cells, `\|` is Markdown escaping for `|`. The copy-pasteable regexes are in `build/gef_line_regexes.mjs`.
* **Validation.** Every regex here is in `build/gef_line_regexes.mjs` and was run against all captures (see SETUP.md §5).

Colors are GEF's `Color` names (gef.py:588-605): `gray`=SGR 90, `red`=31, `green`=32, `yellow`=33, `blue`=34, `pink`=35, `cyan`=36, `bold`=1, `underline`=4. GEF wraps every SGR in `\x01…\x02` readline markers, so a raw `.ansi` file contains `\x01\x1b[36m\x02`. That detail is irrelevant to plain-text pastes.

---

## 0. Overall structure and key facts

1. **The paste is a mix of three line families.** (a) GEF panes and commands, (b) plain GDB output (breakpoint/stop/signal messages, `bt`, `x/…`, `p`, `info …`, `disassemble`), and (c) inferior stdout. A highlighter has to classify line by line. Most lines are self-identifying (see the rule table in §16).
2. **Arrows.** GEF uses `→` (U+2192), `←` (U+2190), `↳` (U+21B3), `│` (U+2502), `─` (U+2500), `●` (U+25CF), `✓` (U+2713), `✘` (U+2718) and `➤` (U+27A4) (gef.py:151-159). Chains inside one value use `" → "` (RIGHT_ARROW, gef.py:152). In registers, telescope and deref output each separator is that padded once more, giving two spaces either side: `"  →  "` (gef.py:8358, 9994).
3. **Pane widths follow the terminal width** (gef.py:4362, 8778). The `─` run length varies between users, so never match a fixed length.
4. **Tabs are significant.** A TAB precedes ` ← $sp` in deref lines (gef.py:10015) and `TAKEN`/`NOT taken` in code lines (gef.py:9002/9005). Source lines have a TAB after the line number (gef.py:9223/9230). Editors and Obsidian may turn tabs into spaces, so accept `\s+`.
5. **Plain text cannot show which register changed, which chunk flags are set, or the address type of most values.** These are carried only by color. See §17.

---

## 1. Prompt

| | |
|---|---|
| Description | `gef➤` followed by two spaces (gef.py:159), then the typed command. With a live process it is bold green (`GEF_PROMPT_ON`, gef.py:160); with no process it is bold red (`GEF_PROMPT_OFF`, gef.py:161). For remote targets a bold prefix `(qemu) `, `(remote) ` or `(rr) ` comes first (gef.py:13053-13060; see §20 for history). Core files get `(core) ` (gef.py:12212). If `gef.readline_compat` or `gef.disable_color` is set, the bare `gef➤  ` is used (gef.py:12206-12210). |
| Examples | `gef➤  break main` (arm64/break_main_arm64.txt)<br>`gef➤  x/20gx $sp` (arm64/x_20gx_arm64.txt)<br>`(qemu) gef➤  heap chunks` (x86_64/heap_chunks_x86_64.txt) |
| Regex | `/^((?:\((?:qemu\|remote\|rr)\) )?(?:\(core\) )?gef➤)(\s*)(.*)$/` |
| Tokens | group1 → `prompt`; group3 → `command` (first word = command name, rest = args; `$reg` inside args → `operand-register`, `0x…` → `immediate`) |
| Color | bold green (alive) / bold red (not alive); remote prefix bold default |

Version note: the prompt string is identical in 2021.10 (`"gef\u27a4  "`, gef-2021.10.py:96) and later releases.

## 2. Pane/section header lines

| | |
|---|---|
| Description | **Context pane title** (`context_title`, gef.py:8827-8848): a run of `─` sized to `cols - len(title) - 6`, a space, the title, a space, then exactly four `─`. **Command title** (`titlify`, gef.py:2066-2088): the title centered with an equal run of `─` on each side. Used by heap bins, xinfo, got, elf-info and gef config. **Closing rule** after the context: a full-width run of `─` with no title (gef.py:8835-8837, 8817). |
| Context titles | `registers`, `stack`, `code:<arch>:<mode>` (gef.py:8970-8972, e.g. `code:x86:64`, `code:arm64:` with an empty mode and a trailing colon, `code:x86:32`), `arguments` / `arguments (guessed)` (gef.py:9088/9163), `source:<file>+<line>` (gef.py:9204-9205; a long path is shortened as `first15chars[...]basename`), `threads`, `trace`, `memory:0x…` (gef.py:9453, source-only), `extra` (gef.py:9438, source-only). Default order: `context.layout = "legend regs stack code args source memory threads trace extra"` (captured in gef_config_context_arm64.txt; gef.py:8720). Users can reorder these, and a leading `-` hides a pane (gef.py:8799-8800). |
| Examples | `─────────────…──────── registers ────` (arm64/run_arm64.txt)<br>`──────…── code:x86:64 ────` (x86_64/context_x86_64.txt)<br>`──────…── source:test.c+24 ────` (arm64/run_arm64.txt)<br>`──────…── arguments (guessed) ────` (x86_64/continue_bp_x86_64.txt)<br>`────────────────────────────────── Unsorted Bin for arena at 0xfffff7fa0a50 ──────────────────────────────────` (arm64/heap_bins_arm64.txt)<br>`─────────────────────────────────────────── xinfo: 0xfffffffffad0 ───────────────────────────────────────────` (arm64/xinfo_arm64.txt) |
| Regex | header: `/^(─+) (\S.*?) (─+)$/`; closing rule: `/^─{8,}$/` |
| Tokens | `─` runs → `section-rule` (punctuation); title → `section-header`; sub-tokens in titles: `code:`/`source:` prefix → `section-header`, `0x…` → address, `+24` → number |
| Color | rule `gray` (`theme.context_title_line` / `theme.default_title_line`), title `cyan` (`theme.context_title_message` / `theme.default_title_message`) (gef.py:6246-6249) |

## 3. Legend line

| | |
|---|---|
| Description | Printed first in the context unless `gef.disable_color` is set (gef.py:8757-8771). Each word is drawn in the color it stands for, so the line documents the active theme. `vmmap` has its own legend with two spaces after the colon (gef.py:10244-10249), also suppressed when colors are off (gef.py:10173). |
| Examples | `[ Legend: Modified register \| Code \| Heap \| Stack \| String ]` (arm64/run_arm64.txt, x86_64/context_x86_64.txt)<br>`[ Legend:  Code \| Stack \| Heap ]` (arm64/vmmap_arm64.txt) |
| Regex | `/^\[ Legend:\s+(.*?) \]$/` |
| Tokens | whole line → `legend`. Optionally color the words: `Modified register` → `register-changed`, `Code` → `address-code`, `Heap` → `address-heap`, `Stack` → `address-stack`, `String` → `string` |
| Color | "Modified register" bold red, Code red, Heap green, Stack pink, String yellow (ANSI in arm64/ni_arm64.ansi: `\x1b[1m\x1b[31mModified register… \x1b[31mCode… \x1b[32mHeap… \x1b[35mStack… \x1b[33mString`) |

Unchanged since 2021.10 (gef-2021.10.py:8316, 9613).

## 4. Register lines (context `registers` pane and `registers` command)

| | |
|---|---|
| Description | The context pane calls `registers <all regs>` by default (gef.py:8855-8861). The format is `$<name>` left-padded to the widest register name, then `: `, then the value (gef.py:8285-8392). A value that is a mapped address is printed `0x%016x` (gef.py:4513-4517); otherwise it is `%#x` left-justified to `ptrsize*2+2` characters, which leaves trailing spaces (gef.py:4520-4529). Then the dereference chain `"  →  "`-joined (gef.py:8357-8360). If the last chain element decodes to printable ASCII, ` ("<ascii>"?)` is appended (gef.py:8363-8368). **The flag register** shows `[<flag names>]`: set flags are UPPERCASE and bold, clear flags are lowercase (gef.py:2610-2619). **x86 segment registers** share one line: `$cs: 0x33 $ss: 0x2b …` (gef.py:8331-8335, 8388-8389). An `<unavailable>` register shows `no value` in yellow underline (gef.py:8320-8325, source-only). Register names: x86_64 `$rax…$r15,$rip,$eflags,$cs…$gs` (gef.py:3506-3515); aarch64 `$x0…$x30,$sp,$pc,$cpsr,$fpsr,$fpcr` (gef.py:3167-3177); x86 `$eax…$eip` (gef.py:3307-3321). |
| Examples | `$rax   : 0x0000000000401926  →  <main+0000> endbr64 ` (x86_64/context_x86_64.txt)<br>`$rbx   : 0x1               ` (x86_64/context_x86_64.txt, padded non-pointer)<br>`$rdx   : 0x00002aaaab2abd98  →  0x00002aaaab2abf41  →  "HOSTNAME=47f545946d15"` (x86_64/context_x86_64.txt)<br>`$rbp   : 0x6161616161616165 ("eaaaaaaa"?)` (x86_64_crash/run_segv_x86_64.txt)<br>`$x16 : 0x0000fffff7f9fd68  →  0x0000fffff7fd0d40  →  <_dl_audit_preinit+0000> stp x29,  x30,  [sp,  #-80]!` (arm64/ni_arm64.txt)<br>`$eflags: [zero carry PARITY adjust sign trap INTERRUPT direction overflow resume virtualx86 identification]` (x86_64/ni_x86_64.txt)<br>`$cpsr: [negative ZERO CARRY overflow interrupt endian fast t32 m[4]]` (arm64/ni_arm64.txt)<br>`$cs: 0x33 $ss: 0x2b $ds: 0x00 $es: 0x00 $fs: 0x00 $gs: 0x00 ` (x86_64/context_x86_64.txt)<br>`$pc  : 0x61616161616166  ` (arm64_crash/run_segv_arm64.txt, unmapped PC) |
| Regex | line: `/^(\$[a-z][a-z0-9]*)\s*: (.*)$/`; segment line: `/^(?:\$[a-z]s: 0x[0-9a-f]+ ?)+$/`; flags body: `/^\[((?:[A-Za-z0-9\[\]]+ ?)+)\]$/` (uppercase word = set flag); ASCII hint: `/ \("(.*)"\?\)$/` |
| Tokens | `$rax` → `register-name` (no plain-text way to tell `register-changed`; §17); value → address token (§6); chain → §6; ASCII hint → `string` (note the `?` suffix); UPPER flag → `flag-set`, lower flag → `flag-clear` |
| Color | name: blue (`theme.registers_register_name`) or **bold red if changed since last stop** (`theme.registers_value_changed`, gef.py:6269-6276, 8337-8342). Value colored by memory type (§6). Flags: set = bold, clear = default. Segment names follow the same changed/unchanged rule. |

**Variant: `context.show_registers_raw = True`** (source-only, gef.py:8863-8921). Several registers per line (`nb = cols // (widest+5+ptrsize*2)`), each as `<padded name>: <value> `, with no deref chains, followed by a line `Flags: [ … ]`. Regex: `/^(?:(\$[a-z0-9]+)\s*: (0x[0-9a-f]+)\s+)+$/` and `/^Flags: \[(.*)\]$/`.

## 5. Stack pane / `dereference` / `telescope` lines

| | |
|---|---|
| Description | `pprint_dereferenced` (gef.py:9985-10019). Fields in order: the slot address `0x%016x` (cyan, `theme.dereference_base_address`), `│`, offset `{:+#07x}` (`+0x0000`, `+0x0008`, …; negative with `--reference`; widens past 0xffff), `: `, the chain from slot contents onward, padded to `ptrsize*2+2`. Then, if any register equals the slot address, TAB + ` ← ` + comma-separated register names, all bold blue (`theme.dereference_register_value`). The default context shows 8 lines (`context.nb_lines_stack`, gef_config_context_arm64.txt) and `dereference` defaults to 10 (gef.py:10023). `context.grow_stack_down` reverses the order (source-only). `context.show_stack_raw=True` switches the pane to a hexdump (§11) (gef.py:8929-8931). |
| Examples | `0x0000fffffffffad0│+0x0000: 0x0000fffffffffd18  →  0x0000fffffffffef8  →  "/work/test_arm64"	 ← $sp` (arm64/telescope_arm64.txt)<br>`0x0000fffffffffab0│+0x0000: 0x0000fffffffffba0  →  0x0000fffffffffcb0  →  0x0000fffffffffcc0  →  0x0000000000000000	 ← $x29, $sp` (arm64/continue_bp_arm64.txt)<br>`0x0000fffffffffab8│+0x0008: 0x0000aaaaaaaa0b80  →  <main+0180> str w0,  [sp,  #20]` (arm64/continue_bp_arm64.txt)<br>`0x00002aaaab2abb00│+0x0000: "gaaaaaaahaaaaaaaiaaaaaaajaaaaaaakaaaaaaalaaaaaaama[...]"	 ← $rsp` (x86_64_crash/run_segv_x86_64.txt; the slot itself holds string bytes)<br>`0x0000fffffffffae8│+0x0008: 0x0000000100000000` (arm64/telescope_arm64.txt; plain value) |
| Regex | `/^(0x[0-9a-f]+)│([+-]0x[0-9a-f]+): ?(.*?)(?:\s+ ← (\$\w+(?:, \$\w+)*))?\s*$/` |
| Tokens | g1 → `address-base` (always a slot address; when it falls in `[stack]` the pane is the stack); `│` → punctuation; g2 → `offset`; g3 → chain (§6); ` ← ` → `arrow`; g4 → `register-name` (as `register-hint`) |
| Color | g1 cyan; chain per §6; `← $sp` bold blue |

## 6. Dereference chain (shared by registers, stack, telescope, args, source annotations)

`dereference_from` (gef.py:9900-9973). The first element is the raw value `0x%016x`. Each further hop is either:
* another valid address, printed by `Address.__str__` and colored by region (gef.py:683-694): **code** red when the address is in any `.text` zone or in an executable mapping of the main binary (gef.py:697-702), **heap** green when the section path is `[heap]`, **stack** pink when it is `[stack]`, otherwise uncolored. In arm64/ni_arm64.ansi, ld.so's `0x0000fffff7fd0d40` is red while libc .data pointers are uncolored.
* an **instruction**, when the previous address is executable, in `.text` and not ASCII: `<sym+XXXX> mnemonic op1, op2` in **gray** (`theme.dereference_code`, gef.py:9939-9947). The offset here is GEF's 4-digit hex (`<main+0018>`), not GDB's decimal.
* a **string**, when readable and ASCII: `"…"` in yellow (`theme.dereference_string`); `"<first 50 chars>[...]"` when longer than 50 (GEF_MAX_STRING_LENGTH=50, gef.py:146, 9955-9958); `0x… ("s"?)` when shorter than ptrsize (gef.py:9952-9954).
* the literal `[loop detected]` (gef.py:9917-9919), source-only.
* the terminal raw value `0x%016x` when the target is unmapped or not decodable.
* `[...]` stands for elided middle hops in the source-pane variable annotations (gef.py:9257-9258).

| | |
|---|---|
| Examples | `0x00002aaaab2abd88  →  0x00002aaaab2abf32  →  "/work/test_x64"`<br>`0x0000000000401830  →  <frame_dummy+0000> endbr64 ` (x86_64/context_x86_64.txt, `$r14`)<br>`0x0000aaaaaaaa0978  →  0xb9002fe0d63f0040 ("@"?)` (arm64/continue_bp_arm64.txt `$pc` at a breakpoint; observed odd case: the instruction word shown as a short string)<br>`0x00002aaaab2abd78  →  0x00002aaaab2abf25  →  0x65742f6b726f772f  →  0x65742f6b726f772f ("/work/te"?)` (x86_64_qemu_degraded, fake map: every value "valid") |
| Token regexes (inline) | address: `/\b0x[0-9a-f]{4,16}\b/`<br>arrow: `/ +→ +/`, `/ ← /`<br>GEF symbol: `/<[^<>\s]+?\+[0-9a-f]{4}>/` (e.g. `<main+0018>`)<br>GDB symbol: `/<[^<>\s]+(?:\+\d+)?>/` (e.g. `<main+92>`, `<add>`, `<malloc@plt>`) and `/<\+\d+>/` (`disassemble`)<br>string: `/"(?:[^"\\]\|\\.)*"(?:\?\))?/` and `/\[\.\.\.\]/`<br>instruction after symbol: `/(<[^>]+>) ([a-z][\w.]*)(?: (.*))?$/` |
| Token classes | `address-stack` / `address-heap` / `address-code` / `address-data` (by heuristic, §17); `symbol`; `mnemonic`; `operand-register`; `immediate`; `string`; `arrow`; `comment` |

## 7. Code pane (`code:<arch>`)

| | |
|---|---|
| Description | gef.py:8945-9031. Each instruction line has a 1-column **breakpoint glyph** (`●` red if a breakpoint is set at that address, else a space). Next comes a 2-column marker: past and future instructions get two spaces; the current instruction gets `→ ` (RIGHT_ARROW[1:]) and the whole text is green (`theme.disassemble_current_instruction`). The instruction text is `Instruction.__str__` = `f"{address:#10x} {location:16} {mnemonic:6} {operands}"` (gef.py:1485-1486), so short x86 addresses are right-aligned to 10 characters (`  0x4019ce`), an empty location is 16 spaces, and a location longer than 16 overflows (`<__do_global_dtors_aux+004c> ret`). Past instructions are gray (`theme.old_context`). Defaults: 3 previous and 6 following instructions (gef_config_context_arm64.txt; with the current one, 9 or 10 lines show). **Conditional branch** on the current instruction gets TAB + `TAKEN [Reason: <cond>]` in bold green, or TAB + `NOT taken [Reason: !(<cond>)]` in bold red (gef.py:8997-9005). The reason is omitted when empty. Conditions: x86 `Z`, `!Z`, `C`, `!C`, `C \|\| Z`, `!C && !Z`, `S==O`, `S!=O`, `Z \|\| S!=O`, `!Z && S==O`, `O`, `!O`, `P`, `!P`, `S`, `!S`, `!$CX` (gef.py:3402-3460); ARM `Z \|\| N!=V`, `N!=V`, `V`, `N`, etc. (gef.py:3063-3110); RISC-V `rs1<rs2` etc. (gef.py:2931-2953). **Branch-target preview**: after a TAKEN branch, or a call/ret when `peek_calls`/`peek_ret` are set, the target's instructions follow as `"   ↳  " + insn` for the first and `"      " + insn` for the rest, and the listing stops (gef.py:9015-9027). `context.show_opcodes_size=N` inserts hex opcodes after the address, truncated with `...` (gef.py:1467-1483, source-only). An unreadable PC gives `[!] Cannot disassemble from $PC` (gef.py:9030). |
| Examples | `●→ 0xaaaaaaaa0a14 <main+0014>      adrp   x0,  0xaaaaaaabf000` (arm64/run_arm64.txt: bp + current)<br>`●→   0x4019ce <main+00a8>      jle    0x4019a6 <main+128>	TAKEN [Reason: Z \|\| S!=O]` (x86_64/branch_taken_x86_64.txt)<br>`●→ 0xaaaaaaaa0a8c <main+008c>      b.le   0xaaaaaaaa0a5c <main+92>	NOT taken [Reason: !(Z \|\| N!=V)]` (arm64/branch_not_taken_arm64.txt)<br>`   ↳    0x4019a6 <main+0080>      mov    edi, 0x20` / `        0x4019ab <main+0085>      call   0x40f140 <malloc>` (x86_64/branch_taken_x86_64.txt)<br>`●  0xaaaaaaaa0a14 <main+0014>      adrp   x0,  0xaaaaaaabf000` (arm64/ni_arm64.txt: bp, not current)<br>` →   0x401740 <_start+0000>    endbr64 ` (x86_64/gef_remote_x86_64.txt)<br>`     0x401739                  nop    DWORD PTR [rax+0x0]` (x86_64/gef_remote_x86_64.txt: no symbol)<br>`   0xaaaaaaaa090c <__do_global_dtors_aux+004c> ret    ` (arm64/si_call_arm64.txt: location overflow) |
| Regex | instruction: `/^([● ])(→\| ) {1,3}(0x[0-9a-f]+) (<[^>]+>)?\s+([a-z][\w.]*)(?: +(.*?))?(?:\t(TAKEN\|NOT taken) (\[Reason: .*\])?)?\s*$/`<br>target preview: `/^ {3}(↳\| ) {2}\s*(0x[0-9a-f]+) (<[^>]+>)?\s+([a-z][\w.]*)(?: +(.*))?$/` |
| Tokens | `●` → `breakpoint-marker`; `→` → `current-marker`; address → `address-code`; `<main+0014>` → `symbol`; mnemonic → `mnemonic`; operands → split: registers (x86 `/\b(?:[re]?[abcd]x\|[abcd][lh]\|[re]?[sd]il?\|[re]?[sb]pl?\|r\d{1,2}[dwb]?\|[re]ip\|[cdefgs]s\|[xyz]mm\d+\|k[0-7])\b/`; arm64 `/\b(?:[xwbhsdqv]\d{1,2}\|sp\|wzr\|xzr\|lr\|fp\|pc)\b/`) → `operand-register`; `0x…`/`#0x…`/`#-80`/decimal → `immediate`; `QWORD PTR`/`DWORD PTR` → `keyword`; `[`/`]` → punctuation; `# 0x401865 <add>` (x86) and `// #32` (arm64) → `comment`; `TAKEN` → `branch-taken`; `NOT taken` → `branch-not-taken`; `[Reason: …]` → `comment`; `↳` → `arrow` |
| Color | `●` red; current line green; past lines gray; future lines default; TAKEN bold green; NOT taken bold red |

**Arch quirk (observed).** aarch64 operands have *two* spaces after each comma (`sub    sp,  sp,  #0xd0`, arm64/run_arm64.txt). GEF splits the GDB operand string on `,` and re-joins with `", "` while keeping the original leading space. x86 has one space (`mov    rax, QWORD PTR fs:0x28`). Inline comments from GDB survive after a TAB: arm64 `	// #32`, x86 `        # 0x401865 <add>`.

## 8. Arguments pane

| | |
|---|---|
| Description | Shown only when the current instruction is a call (gef.py:9033-9036). **Guessed** (no symbol): `<target> (`, then indented `$reg = <chain>` entries joined by `,\n   `, then `)` (gef.py:9156-9168). Here the chain separator is a single-padded ` → `. **Known symbol**: `name (\n   type name = chain,\n   …\n)` or `name (<void>)` (gef.py:9071-9093, source-only). |
| Examples | `*0x401865 (` / `   $rdi = 0x0000000000000006,` / `   $rcx = 0x0000000000401865 → <add+0000> endbr64 ` / `)` (x86_64/continue_bp_x86_64.txt)<br>`*0xaaaaaaaa0918 (` / `   $x2 = 0x0000aaaaaaaa0918 → <add+0000> sub sp,  sp,  #0x10` (arm64/continue_bp_arm64.txt) |
| Regex | `/^(\S+) \($/`, `/^ {3}(\$\w+\|[\w ]+?) = (.*?),?$/`, `/^\)$/` |
| Tokens | target → `symbol`; `$rdi` → `register-name` (blue, `theme.registers_register_name`, gef.py:9131); value → chain (§6) |

## 9. Source pane

| | |
|---|---|
| Description | gef.py:9171-9243. Past lines: bp glyph (`●` red or space) + 2 spaces + `{n:4d}` + TAB + space + text, all gray. Current line: bp glyph + `→ ` + `{n:4d}\t ` + text, all green (`theme.source_current_line`). Future lines: default color. When `context.show_source_code_variable_values` is on (the default), an annotation line `// var=value, …` goes above the current line, indented to the code's indentation, with variable names in yellow (gef.py:9227-9229, 9245-9279). Pointer values are deref chains collapsed to `first → [...] → last`. |
| Examples | `     19	     char buf[32];` (arm64/run_arm64.txt)<br>` →   24	 int main(int argc, char **argv) {` (arm64/run_arm64.txt)<br>`         // argc=0x1, argv=0x0000fffffffffae0  →  [...]  →  "/work/test_arm64"` (arm64/run_arm64.txt)<br>`             // small=0x0000fffffffffb28  →  0x0000000000000000, i=0x0` (arm64/branch_taken_arm64.txt) |
| Regex | `/^([● ])(→ \|  )\s*(\d+)\t ?(.*)$/`; annotation `/^\s+\/\/ (.*)$/`, then inside it `/(\w+)=([^,]+)/g` |
| Tokens | `●` → `breakpoint-marker`; `→` → `current-marker`; number → `line-number`; text → C-ish source (optional sub-highlight); annotation → `comment` with `variable` names |

Note: a `●` appears in the source pane only for breakpoints whose location string contains `file:line` (gef.py:9183-9188, 9165-9169). `break main` resolves to `main` and gets no glyph, as the captures show.

## 10. Threads and trace panes

| | |
|---|---|
| Threads (gef.py:9363-9431) | `[#i] Id N, Name: "comm", stopped 0x… in func (), reason: REASON`. `#i` is bold green for the selected thread and bold pink otherwise; `stopped` bold red (`running` bold green, `exited` bold yellow); the PC blue (`theme.threads_pc`); the function bold yellow; the reason bold pink. Reasons: `BREAKPOINT`, `SINGLE STEP`, `TEMPORARY BREAKPOINT`, `STOPPED`, `NOT RUNNING`, or a signal name like `SIGSEGV` (gef.py:9364-9383). `Name:` is absent when the target reports no thread name (qemu). |
| Examples | `[#0] Id 1, Name: "test_arm64", stopped 0xaaaaaaaa0a14 in main (), reason: BREAKPOINT` (arm64/run_arm64.txt)<br>`[#0] Id 1, stopped 0x6161616161616166 in ?? (), reason: SIGSEGV` (x86_64_crash/run_segv_x86_64.txt)<br>`[#0] Id 1, Name: "test_arm64", stopped 0xaaaaaaaa097c in compute (), reason: TEMPORARY BREAKPOINT` (arm64/finish_arm64.txt) |
| Regex | `/^\[#(\d+)\] Id (\d+), (?:Name: "([^"]*)", )?(stopped\|running\|exited)(?: (0x[0-9a-f]+) in (.+?) \(\), reason: (.+))?$/` |
| Trace (gef.py:9281-9361) | `[#i] 0x<pc> → func(arg=val, …)`, with the function green and argument names yellow. When there is no symbol name: `[#i] 0x<pc> →  <sym+off> mnemonic ops` in red (source-only). At most 10 frames (`context.nb_lines_backtrace`). The PC here is `%#x` (short), not zero-padded. |
| Examples | `[#0] 0xaaaaaaaa0a8c → main(argc=0x1, argv=0xfffffffffd18)` (arm64/branch_taken_arm64.txt)<br>`[#1] 0xaaaaaaaa097c → compute(f=0xaaaaaaaa0918 <add>, x=0x6, y=0x7)` (arm64/si_call_arm64.txt)<br>`[#5] 0xfffff7ee82a8 → __GI___fortify_fail(msg=0xfffff7f52cb0 "stack smashing detected")` (arm64_crash/run_segv_arm64_ssp.txt) |
| Regex | `/^\[#(\d+)\] (0x[0-9a-f]+) → (.*)$/`, then `/^([\w.@]+)\((.*)\)$/` on g3 |
| Tokens | `[#0]` → `frame-index`; PC → `address-code`; func → `function`; `arg=` → `variable`; `?? ()` → `unknown-symbol` |

## 11. Hexdump (`hexdump byte|word|dword|qword`, chunk peek, raw stack)

| | |
|---|---|
| byte (gef.py:2233-2265) | `f"{addr:#0{ptrsize*2+2}x} {sym}    {hex bytes}    {ascii}"`. `sym` is `<name+XXXX>` when known (source-only) and otherwise empty, which leaves 5 spaces. Byte colors (style_byte, gef.py:2210-2230): `00` gray, `0a` blue, `ff` green, printable white (no visible color, observed), non-printable yellow. Non-printables show as `.` in the ASCII column. |
| qword/dword/word (observed) | `0x…│+0x0000   0x<value>   ` |
| Examples | `0x0000fffffffffad0     18 fd ff ff ff ff 00 00 00 00 00 00 01 00 00 00    ................` (arm64/hexdump_byte_arm64.txt)<br>`0x00002aaaab2abbd8│+0x0038   0x00000000004b3b10   ` (x86_64/hexdump_qword_x86_64.txt)<br>`0x0000fffffffffad4│+0x0004   0x0000ffff   ` (arm64/hexdump_dword_arm64.txt) |
| Regex | byte: `/^(0x[0-9a-f]+) (<[^>]+>)?\s{4}((?:[0-9a-f]{2} ){1,16})\s*(.*)$/`; word: `/^(0x[0-9a-f]+)│([+-]0x[0-9a-f]+)\s+(0x[0-9a-f]+)\s*$/` |
| Tokens | address → `address-base`; bytes → `hex-byte` (sub-classes `hex-null` for `00`, `hex-ff`, `hex-newline` for `0a`, `hex-printable` / `hex-nonprintable` decided from the byte value, so the color is recoverable from text); ASCII column → `hexdump-ascii` |

## 12. vmmap

| | |
|---|---|
| Description | Optional filter warnings (`[*] … guessed …`), then the legend, then a header in blue (`theme.table_heading`): `Start              End                Offset             Perm Path`, then one row per mapping: three `0x%016x` columns, a perm (`rwx`, underlined when equal to `rwx`), and a path (gef.py:10163-10241). A **whole row** is colored pink for `[stack]`, green for `[heap]`, and red for any `r?x` mapping. Others are uncolored. With filters, each filter is preceded by a blank line and a green `[name = 'libc']` / `[addr = …]` line (gef.py:10200-10207). |
| Examples | `0x0000aaaaaaaa0000 0x0000aaaaaaaa1000 0x0000000000000000 r-x /host_virtiofs/…/test_arm64` (arm64/vmmap_arm64.txt)<br>`0x0000fffffffdf000 0x0001000000000000 0x0000000000000000 rw- [stack]` (arm64/vmmap_arm64.txt)<br>`0x00000000004b2000 0x00000000004d4000 0x0000000000000000 rw- [heap]` (x86_64/vmmap_x86_64.txt)<br>`0x0000000000000000 0xffffffffffffffff 0x0000000000000000 rwx /work/test_x64` (x86_64_qemu_degraded/vmmap_x86_64.txt)<br>`[name = 'libc']` (arm64/vmmap_filter_arm64.txt) |
| Regex | header `/^Start\s+End\s+Offset\s+Perm\s+Path$/`; row `/^(0x[0-9a-f]+) (0x[0-9a-f]+) (0x[0-9a-f]+) ([r-][w-][x-]) ?(.*)$/`; filter `/^\[(?:name\|addr) = .*\]$/` |
| Tokens | Row class from text: path `[stack]` → `address-stack`; `[heap]` → `address-heap`; perm `r.x` → `address-code`; `rwx` → `address-rwx` (underline); else `address-data`. **This is fully recoverable from plain text.** It is also the best input for address classification elsewhere in the same paste (§17). |

## 13. Heap commands

| | |
|---|---|
| Chunk (gef.py:2024-2028) | `Chunk(addr=0x…, size=0x…, flags=<flags>)`. `Chunk` is yellow, bold and underlined. **Current flags format** (ChunkFlags.__str__, gef.py:1827-1845): always all three names, `PREV_INUSE \| IS_MMAPPED \| NON_MAIN_ARENA`, with **set = green, clear = red**. Plain text therefore cannot show which flags are set (observed in every chunk line of both arches). Addresses here are `%#x` (not zero-padded). |
| Chunk peek (`heap chunks`, gef.py:7734, `heap-chunks.peek_nb_byte`=16) | `    [0x%016x     <16 hex bytes>    <ascii>]` with the same byte colors as hexdump. |
| Top chunk | `Chunk(...)  ←  top chunk` with `top chunk` in green (gef.py:7715, 7743). |
| `heap chunk X` (psprint, gef.py:2030-2036, 1997-2022) | The Chunk line, then `Chunk size: N (0x..)`, `Usable size: …`, `Previous chunk size: …`, a bare flags line, and, if the chunk is free, a blank line plus `Forward pointer: 0x…` / `Backward pointer: 0x…` (source-only). |
| Arena (gef.py:1683-1689) | `Arena(base=0x…, top=0x…, last_remainder=0x…, next=0x…, mem=N, mempeak=N)`, with `Arena` in blue, bold and underlined. |
| Bins | Titles via titlify: `Tcachebins for thread N`, `Fastbins for arena at 0x…`, `Unsorted Bin for arena at 0x…`, `Small Bins for arena at 0x…`, `Large Bins for arena at 0x…` (gef.py:7897, 8137, 8199, 8228, 8268).<br>Tcache: `Tcachebins[idx=I, size=0x.., count=N] ←  Chunk(...)  ←  Chunk(...) ` (gef.py:7905-7944); `All tcachebins are empty` when there are none.<br>Fast: `Fastbins[idx=I, size=0x..] 0x00` (empty) or ` ←  Chunk(...) …`; also `→ [loop detected]`, `[incorrect fastbin_index] `, `← [Corrupted chunk at 0x…]` (gef.py:8139-8170, source-only parts).<br>Unsorted/small/large: `[+] unsorted_bins[0]: fw=0x…, bk=0x…` then ` →   Chunk(...)` (gef.py:7808-7820), and `[+] Found N chunks in unsorted bin.` / `[+] Found N chunks in M small non-empty bins.` (gef.py:8204, 8239, 8279). |
| Examples | `Chunk(addr=0xaaaaaaac14b0, size=0x90, flags=PREV_INUSE \| IS_MMAPPED \| NON_MAIN_ARENA)` (arm64/heap_chunk_arm64.txt)<br>`    [0x00000000004b34b0     e0 34 4b 00 00 00 00 00 30 35 4b 00 00 00 00 00    .4K.....05K.....]` (x86_64/heap_chunks_x86_64.txt)<br>`Chunk(addr=0x4b4650, size=0x1f9c0, flags=PREV_INUSE \| IS_MMAPPED \| NON_MAIN_ARENA)  ←  top chunk` (x86_64/heap_chunks_x86_64.txt)<br>`Tcachebins[idx=7, size=0x90, count=1] ←  Chunk(addr=0x4b3a80, size=0x90, flags=PREV_INUSE \| IS_MMAPPED \| NON_MAIN_ARENA) ` (x86_64/heap_bins_x86_64.txt)<br>`Fastbins[idx=0, size=0x20] 0x00` (arm64/heap_bins_arm64.txt)<br>`[+] unsorted_bins[0]: fw=0xaaaaaaac15c0, bk=0xaaaaaaac15c0` / ` →   Chunk(addr=0xaaaaaaac15d0, size=0x510, flags=PREV_INUSE \| IS_MMAPPED \| NON_MAIN_ARENA)` (arm64/heap_bins_arm64.txt)<br>`Arena(base=0xfffff7fa0a50, top=0xaaaaaaac1fe0, last_remainder=0x0, next=0xfffff7fa0a50, mem=135168, mempeak=135168)` (arm64/heap_arenas_arm64.txt)<br>`Chunk size: 144 (0x90)` (arm64/heap_chunk_arm64.txt) |
| Regex | chunk line: `/^(Chunk)\(addr=(0x[0-9a-f]+), size=(0x[0-9a-f]+), flags=([A-Z_\|! ]*)\)(?:\s+←\s+top chunk)?\s*$/`; inline chunk (in bins): `/Chunk\(addr=(0x[0-9a-f]+), size=(0x[0-9a-f]+), flags=([A-Z_\|! ]*)\)/g`; peek `/^ {4}\[(0x[0-9a-f]+)\s{5}((?:[0-9a-f]{2} ){1,16})\s*(.{0,16})\]$/`; arena `/^Arena\(base=…\)$/` (see .mjs); tcache `/^Tcachebins\[idx=(\d+), size=(0x[0-9a-f]+), count=(\d+)\](.*)$/`; fast `/^Fastbins\[idx=(\d+), size=(0x[0-9a-f]+)\] (.*)$/`; bin chain `/^ →   Chunk\(.*$/`; details `/^(Chunk size\|Usable size\|Previous chunk size\|Forward pointer\|Backward pointer): (.*)$/` |
| Tokens | `Chunk`/`Arena`/`Tcachebins`/`Fastbins` → `heap-keyword`; `addr=` value → `address-heap`; `size=` → `number`; flag names → `heap-flag` (state unknown in current GEF, §17); `top chunk` → `heap-top`; `←`/`→` → `arrow` |

**Version difference (verified from source).** GEF ≤ 2022.06 printed only the flags that are *set*, joined by `|` with no spaces, all red bold, and printed `! PREV_INUSE` in green bold when P was clear (`flags_as_string`, gef-2022.06.py:1649-1659; gef-2021.10.py:1216-1224 is the same). Examples of that form (source-only): `flags=PREV_INUSE`, `flags=! PREV_INUSE`, `flags=PREV_INUSE|IS_MMAPPED`. From 2023.06 on, the three-name green/red form is used (gef-2023.06.py:1504-1514). Only the old format carries the flag state in plain text, so the flags regex has to accept `[A-Z_|! ]*`.

## 14. Other GEF commands

| Command | Format, examples and regex |
|---|---|
| `checksec` (gef.py:10691-10719) | `[+] checksec for '<path>'`, then `f"{prop:<30s}: {msg}"` for Canary/NX/PIE/Fortify. `✓ ` is green bold and `✘ ` is red bold. Canary adds `(value: 0x…)` when the process is alive. RelRO is `Full` (green), `Partial` (yellow) or `✘` (red bold). Examples: `Canary                        : ✓ (value: 0x154844b1b73fc000)`, `PIE                           : ✘ `, `RelRO                         : Partial` (arm64/checksec_arm64.txt, x86_64/checksec_x86_64.txt). Regex `/^(Canary\|NX\|PIE\|Fortify\|RelRO)\s+: (✓\|✘\|Full\|Partial)\s*(?:\(value: (0x[0-9a-f]+)\))?\s*$/`. Tokens: `✓`/`Full` → `check-ok`, `✘` → `check-fail`, `Partial` → `check-warn`. The state is recoverable from text. |
| `canary` (gef.py:6051) | `[+] The canary of process 453 is at 0xfffffffffed8, value is 0x154844b1b73fc000` (arm64/canary_arm64.txt). Message line. |
| `got` (gef.py:10740-10800) | titlify(`<file>`), blank line, `GOT protection: Partial RelRO \| GOT functions: N`, then per entry `[0x<got slot>] name → 0x<target>`. The `name → target` part is yellow when the GOT value still points inside the binary (unresolved) and green otherwise (resolved). Colors come from `got.function_not_resolved`/`got.function_resolved` (gef.py:10731-10738, 10816-10824); the line is built by `build_line` (gef.py:10742-10746). Entries are source-only: the static x64 binary had 0 functions, and arm64 printed nothing because no executable mapping path matched `gef.session.file` (bind-mount realpath, observed in arm64/got_arm64.txt). Regex `/^\[(0x[0-9a-f]+)\] (\S+) → (0x[0-9a-f]+)$/`. |
| `xinfo` (gef.py:10325-10365) | titlify(`xinfo: 0x…`), then `Page: 0x… → 0x… (size=0x…)`, `Permissions: rw-`, `Pathname: [stack]`, `Offset (from page): 0x…`, `Inode: 0`, and optionally `Segment: .text (0x…-0x…)`, `Offset (from segment): 0x…`, `Symbol: main+32`. Unmapped: `[*] Cannot reach 0x10 in memory space`. Examples in arm64/xinfo_arm64.txt, arm64/errors_arm64.txt. Regex `/^(Page\|Permissions\|Pathname\|Offset \(from page\)\|Inode\|Segment\|Offset \(from segment\)\|Symbol): (.*)$/`. `Pathname: [stack]`/`[heap]` classifies the address. |
| `search-pattern` (gef.py:6929-6942, 7093) | `[+] Searching 'pat' in memory` (pattern in yellow), `[+] In '<path>'(0xstart-0xend), permission=rw-` (path in blue), then hits `  0x… - 0x…  →   "<match>" ` with the match in pink. Example: `  0xfffffffffb58 - 0xfffffffffb70  →   "AAAAAAAABBBBBBBBCCCCCCCC" ` (arm64/search_pattern_arm64.txt). Regex `/^ {2}(0x[0-9a-f]+) - (0x[0-9a-f]+) {2}→ {3}"(.*)" ?$/`. |
| `pattern create/search` (gef.py:10580-10652) | `[+] Generating a pattern of 64 bytes (n=8)`, the pattern on its own line (`/^[a-z]{16,}$/` heuristic), `[+] Saved as '$_gef0'`; `[+] Searching for '6761616161616161'/'6161616161616167' with period=8`, `[+] Found at offset 48 (little-endian search) likely`, or `[!] Pattern '$pc' not found` (arm64/pattern_*_arm64.txt, arm64_crash/pattern_search_pc_arm64.txt). |
| `elf-info` (gef.py:8452-8650) | `Field                 : value` lines, then titlify(`Program Header`) and `  [ #] Type …` tables, then titlify(`Section Header`). Example `Entry point           : 0x0000000000401740` (x86_64/elf_info_x86_64.txt). Regex `/^([A-Z][\w ]+?)\s+: (.*)$/`, `/^\s+\[\s*(#\|\d+)\] /`. |
| `gef config` | `name (type) = value`, e.g. `theme.address_stack (str) = "pink"` (arm64/gef_config_theme_arm64.txt). Regex `/^([\w.]+) \((str\|bool\|int\|float)\) = (.*)$/`. |
| Banner | `GEF for linux ready, type `gef' to start, `gef config' to configure` and `90 commands loaded and 5 functions added for GDB 15.1 in 0.00ms using Python engine 3.12` (*_startup.txt). |

## 15. Message prefixes

| Prefix | Function | Color | Examples |
|---|---|---|---|
| `[+]` | `ok()` (gef.py:2112-2114) | **bold green** | `[+] Found at offset 48 (little-endian search) likely`; `[+] unsorted_bins[0]: …`; `[+] In '[stack]'(…)` |
| `[+]` | `info()` (gef.py:2117-2119) | **bold blue** | `[+] checksec for '/work/test_arm64'`; `[+] Searching 'heap string' in memory`; `[+] Generating a pattern…`; `[+] The canary of process …` |
| `[*]` | `warn()` (gef.py:2107-2109) | bold yellow | `[*] Cannot reach 0x10 in memory space`; ``[*] `libc` has no type specified. We guessed it was a name filter.`` |
| `[!]` | `err()` (gef.py:2102-2104) | bold red | `[!] Command 'heap chunk' failed to execute properly, reason: Cannot access memory at address 0x0` (gef.py:5406-5408); `[!] Cannot disassemble from $PC`; `[!] Cannot access memory at address 0x61616161616166` (arm64_crash/run_segv_arm64.txt) |
| `[=]` | `dbg()` (gef.py:2096-2099), only with `gef.debug` | bold cyan | source-only |
| `[#]` | **does not exist** as a message prefix (no occurrence in gef.py). `[#0]` appears only in the threads/trace panes. | | |

Regex `/^\[([+!*=])\] (.*)$/`. Token: `+` → `message-info` (ok vs info differ only by color, so plain text cannot separate them), `*` → `message-warn`, `!` → `message-error`. These prefixes are identical in 2021.10 (gef-2021.10.py:1297-1300).

## 16. Plain-GDB lines frequently present (all observed)

| Kind | Regex | Example |
|---|---|---|
| bp set | `/^Breakpoint (\d+) at (0x[0-9a-f]+)(?:: file (.+), line (\d+)\.)?$/` | `Breakpoint 1 at 0xa14: file test.c, line 24.` |
| bp hit | `/^(?:Temporary breakpoint\|Breakpoint) (\d+), (?:(0x[0-9a-f]+) in )?(\S+) \((.*)\)(?: at (\S+):(\d+))?$/` | `Breakpoint 3, 0x00000000004019ce in main (argc=0x1, argv=0x2aaaab2abd88) at test.c:31` |
| signal | `/^Program (?:received\|terminated with) signal (SIG\w+), (.*)\.$/` | `Program received signal SIGSEGV, Segmentation fault.` |
| exit | `/^\[Inferior (\d+) \(process (\d+)\) (exited normally\|exited with code \d+\|killed)\]$/` | `[Inferior 1 (process 90) exited normally]` |
| stop frame | `/^(0x[0-9a-f]+) in (\S+) \((.*)\)(?: at (\S+):(\d+))?$/`, `/^([\w.@]+) \((.*)\)(?: at (\S+):(\d+))?$/` | `0x6161616161616166 in ?? ()`; `add (a=0xaaaa, b=0xaaaa0b70) at test.c:10` |
| source line | `/^(\d+)\t(.*)$/`, `/^(0x[0-9a-f]+)\t(\d+)\t(.*)$/` | `24	int main(int argc, char **argv) {`; `0x0000aaaaaaaa0a18	24	int main(…` (after `ni` mid-line) |
| bt | `/^#(\d+)\s+(?:(0x[0-9a-f]+) in )?(\S+) \((.*)\)(?: at (\S+):(\d+))?$/` | `#1  0x0000aaaaaaaa0b80 in main (argc=0x1, argv=0xfffffffffd28) at test.c:38` |
| x/i, disassemble | `/^(=> \| {3})(0x[0-9a-f]+) <([^>]+)>:\t(\S+)\s*(.*)$/` | `=> 0x401951 <main+43>:	lea    rax,[rip+0xffffffffffffff0d]        # 0x401865 <add>`; `   0x0000aaaaaaaa0a00 <+0>:	sub	sp, sp, #0xd0` (note TAB between mnemonic and operands on arm64 GDB output) |
| x/gx, x/s | `/^(0x[0-9a-f]+)(?: <[^>]+>)?:\t(.*)$/` | `0xfffffffffad0:	0x0000fffffffffd18	0x0000000100000000`; `0xaaaaaaaa0c58:	"Hello, gef!"` |
| print | `/^\$(\d+) = (.*)$/` | `$3 = (void (*)()) 0xaaaaaaaa0a20 <main+32>` |
| info registers | `/^([a-z][a-z0-9_]*)\s+(0x[0-9a-f]+\|-?\d+)\s+(.*)$/` | `x0             0xfffff7ffdb50      0xfffff7ffdb50`; `mxcsr          0x1f80              [ IM DM ZM OM UM PM ]` |
| misc status | `Continuing.`, `Starting program: …`, `Run till exit from …`, `Value returned is $6 = 0xd`, `Will ignore next 7 crossings of breakpoint 3.`, `Backtrace stopped: …`, `Dump of assembler code for function main:`, `End of assembler dump.` | |

Note that GDB symbols use **decimal** offsets (`<main+92>`, `<main+43>`), while GEF's code pane and deref chains use **4-digit zero-padded hex** (`<main+005c>`, gef.py:1485 via `insn.location`). One code line can contain both: `b.le   0xaaaaaaaa0a5c <main+92>` (the operand from GDB). Both are `symbol`.

## 17. Ambiguities and heuristics (what plain text loses)

1. **Changed registers.** GEF marks them only by coloring the *name* bold red (gef.py:8337-8342); the text is identical. They cannot be inferred from a single paste. Heuristic: if the paste holds two consecutive contexts, diff the register values and mark the changed ones as `register-changed`. Otherwise use `register-name`.
2. **Heap chunk flags (GEF ≥ 2023.06).** All three names are always printed and only color shows the state. Do not color by flag. Only the pre-2023 format (`flags=PREV_INUSE|IS_MMAPPED`, `! PREV_INUSE`) shows the state in text. The flag state can be recomputed from `size=` only when the raw size word is visible, which GEF does not print (it prints masked sizes), so it is not inferable.
3. **Address memory type** (stack/heap/code/data), in decreasing reliability:
   a. **Structural.** The left column of a stack-pane or deref line is a slot address and points to stack when followed by `← $sp`/`$rsp`/`$esp`/`$x29`/`$rbp`. `Chunk(addr=…)`, `Tcachebins`, `fw=`/`bk=` and `Arena(top=…)` values are heap. A value followed by `→ <sym+XXXX> insn` is code. The code pane's addresses are code. `Pathname: [stack]` in xinfo is authoritative.
   b. **Paste-local map.** If the paste contains `vmmap` output (§12) or xinfo `Page:` lines, build an interval table and classify every `0x…` against it. This reproduces GEF's own logic (gef.py:697-711) except the `.text`-zone test for libraries.
   c. **Range priors** (general Linux knowledge, *not from captures except where noted*). x86_64 native: stack `0x7ffc…–0x7fff…`; PIE binary and heap `0x55…/0x56…` (heap right after the binary); shared libraries `0x7f…`; non-PIE binary `0x40…` (observed `0x401…` code in the static x64). aarch64 native (observed): PIE binary `0xaaaaaaaa….`, heap `0xaaaaaaac1…` (just after the binary), libs `0xfffff7…`, stack `0xfffffff…`. qemu-user x86_64 (observed): stack `0x2aaaab2a…`, which no native prior covers. Treat priors as weak hints and prefer leaving addresses as a generic `address` token over guessing wrong.
   d. **Strings** are always `"…"` (yellow); `("…"?)` marks a short or ASCII-guess string. Both are recoverable.
4. **`[+]` ok (green) vs info (blue)** cannot be told apart. Use a single `message-info` class.
5. **Breakpoint glyph `●`** is text, so it is recoverable. Note that GEF matches breakpoint locations by address substring (gef.py:8942-8943), so it can mark several lines.
6. **Current instruction / current source line** is recoverable from the `→` in column 2 (code) or `→ ` before the line number (source). The whole line was green.
7. **Past (gray) vs future instructions** can be inferred by position relative to the `→` line within the code pane.
8. **TAKEN / NOT taken** are text. `↳` marks the taken-branch target preview.
9. **Deref hop that is "code" vs "data"**: an instruction text after `→` means the previous address was code (red). Libraries' `.text` is red too (observed `0x0000fffff7fd0d40`, ld.so).
10. **qemu-user degraded output** (`x86_64_qemu_degraded/`): with GEF's fake rwx map every chain ends in a self-repeat (`0x… → 0x…` with equal values) and no strings or code are decoded. The highlighter should not try to "fix" this, only tolerate it (all regexes above match it).
11. **Tabs vs spaces.** Captures contain literal TABs (deref register hints, branch notes, source pane, GDB `x/` output). Pasting through some editors converts them. The regexes use `\t` only where GEF guarantees it; in the plugin, relax to `[\t ]+`.
12. **Terminal width** changes header lengths and nothing else. GEF's register and deref lines are not width-wrapped by GEF, but a user's terminal may hard-wrap long tcache lines (observed as one very long line in the `.txt`).
13. **Theme overrides.** `gef config theme.*` or `theme <key> <color>` (gef.py:6237-6290) changes colors only, never text. The defaults listed in this spec match `captures/arm64/gef_config_theme_arm64.txt` exactly.
14. **`highlight add` (gef.py:10830)** lets users color arbitrary substrings; not recoverable, ignore.
15. **`gef.disable_color=True`** drops the context legend and the vmmap legend (gef.py:8758, 10173), so a paste lacking `[ Legend:` is still GEF if `─── registers ────` style headers are present.

## 18. Theme defaults (gef.py:6246-6287, verified by `gef config theme` capture)

| Key | Default | Applies to |
|---|---|---|
| context_title_line / default_title_line | gray | `─` rules |
| context_title_message / default_title_message | cyan | header titles |
| table_heading | blue | vmmap header |
| old_context | gray | past code/source lines |
| disassemble_current_instruction | green | current code line |
| dereference_string | yellow | `"…"` |
| dereference_code | gray | `<sym+off> insn` in chains |
| dereference_base_address | cyan | deref slot address |
| dereference_register_value | bold blue | `← $sp` hint |
| registers_register_name | blue | `$rax` |
| registers_value_changed | bold red | changed `$rax` |
| address_stack | pink | stack addresses / vmmap row |
| address_heap | green | heap addresses / vmmap row |
| address_code | red | code addresses / vmmap row |
| source_current_line | green | current source line |
| threads_pc | blue | threads pane PC |

Hard-coded (not themeable): `●` red; TAKEN bold green; NOT taken bold red; message prefixes (§15); `Chunk` yellow bold underline; `Arena` blue bold underline; flags green/red; `top chunk` green; ✓ green bold; ✘ red bold; Partial yellow; Full green; threads `#n` bold green/pink, `stopped` bold red, function bold yellow, reason bold pink; trace function green and arg names yellow; source-annotation var names yellow; search hits pink; hexdump byte colors (§11).

## 19. Proposed token classes (summary)

`prompt`, `command`, `section-header`, `section-rule`, `legend`, `register-name`, `register-changed` (diff heuristic only), `flag-set`, `flag-clear`, `address` (generic), `address-stack`, `address-heap`, `address-code`, `address-data`, `address-rwx`, `address-base` (deref slot), `offset`, `symbol`, `function`, `variable`, `mnemonic`, `operand-register`, `immediate`, `keyword` (PTR sizes), `comment`, `string`, `arrow` (`→ ← ↳ │`), `current-marker` (`→` in column 2), `breakpoint-marker` (`●`), `branch-taken`, `branch-not-taken`, `line-number`, `frame-index`, `hex-byte` (+ `hex-null`, `hex-ff`, `hex-newline`, `hex-printable`, `hex-nonprintable`), `hexdump-ascii`, `heap-keyword`, `heap-flag`, `heap-top`, `check-ok`, `check-fail`, `check-warn`, `message-info`, `message-warn`, `message-error`, `message-debug`, `gdb-event` (bp/signal/exit lines), `number`.

## 20. Version differences found

| Item | Old | Current (2023.06 → main) | Evidence |
|---|---|---|---|
| Chunk flags | only set flags, `\|`-joined, `! PREV_INUSE` when clear | always 3 names `A \| B \| C`, green/red | gef-2022.06.py:1649-1659 vs gef.py:1827-1845 |
| Prompt, arrows, glyphs, message prefixes, legend text, code-title `code:{arch}:{mode}`, TAKEN/NOT taken text | same | same | gef-2021.10.py:88-96, 1297-1300, 6915, 8316, 8500 |
| Remote prompt prefix | 2022.06/2023.06: always `(remote) ` for any remote session (gef-2022.06.py:10112-10113, gef-2023.06.py:10153); 2021.10: none found | 2024.06+: `(qemu) ` / `(remote) ` by mode (gef-2024.06.py:11340-11346); `(rr) ` added by 2026.01 (gef-2026.01.py:11505) | gef.py:13053-13060 |
| Theme defaults | identical colors | identical | gef-2021.10.py:5306-5314, gef-2022.06.py:5122-5130 |
