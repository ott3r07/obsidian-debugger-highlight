# Adversarial test report: debugger-output highlighter

Scope: the grammars, `src/core/{fences,tokens}.ts`, `src/obsidian/editor.ts` and `src/main.ts`, run with npm prismjs 1.30 on node 24. Nothing under `src/`, `test/` or `styles.css` was modified.

## Reproduce
```sh
sh research/adversarial/integration/build.sh          # bundles editor.ts + main.ts (obsidian stubbed)
node --test research/adversarial/adversarial.test.ts   # 18 tests, 16 fail = findings
node research/adversarial/tools/lines.ts <lang> <file> # per-line styled tokens (same flatten() as the editor)
node research/adversarial/tools/probe.ts <lang> 'line' ...
node research/adversarial/tools/trailing.ts trail|tab|indent
node research/adversarial/perf/{perf,scale,padded}.ts
node research/adversarial/integration/{fence_probe,parity_probe,main_probe,offsets_check,editor_perf,truncation_check,nesting_check}.ts
```

**Corpus.** 48 new pastes in `samples/`: 10 gdb, 8 peda, 14 pwndbg, 16 gef. Each starts with a `# SOURCE:` line.
- Sources: GitHub issues, sourceware bugzilla, Stack Overflow, CTFtime, blogs.
- Languages: English, Chinese, Japanese, Korean.
- Architectures: x86_64, i386, ARM (including big-endian), Cortex-M, AArch64, MIPS, MIPS64, RISC-V.
- Dates: 2014–2026.

Per-file coverage is in `samples_stats.txt`. Non-debugger inputs are in `fp/`: C, Python/pwntools, shell, xxd, `hexdump -C`, objdump (Intel/AT&T/arm64), r2 `pdf`/`px`/`iS`, lldb, prose and Markdown. The samples were collected by sub-agents and were not independently re-checked against their sources.

## HIGH

### H1. The editor misses or blanks indented fences and list-item fences (`fences.ts`)
Repro, from `integration/fence_probe.ts` cases 3, 4, 4b and 4c:
- `- step` / `\t```gdb` / `\t(gdb) bt` / `\t```` → no block found.
- `1. step` / `    ```gdb` … → no block found.
- `   ```gdb` / `   (gdb) info registers rip` → block found, but 0 marks.

Expected: highlighted, as reading view does after Obsidian strips the indentation.

Cause:
- The opening-fence regex allows only 0–3 spaces and no tab.
- Content lines are never de-indented, and every grammar wrapper is anchored at `^`.

Impact: a 4-space indent on the fixtures removes all colour from gdb 1070/1871, pwndbg 1522/2103, gef 453/633 and peda 191/294 lines. Real sample `gdb_6.txt` loses L1–11 (`    (gdb) bt`).

Tests: F2, F3, G3.

Fix:
- Best: use Obsidian's syntax tree (`syntaxTree(state)`, the `HyperMD-codeblock*` line nodes).
- Otherwise: record the opener's indent and strip that much from each content line, adjusting offsets.
- Also accept or strip a common leading indent before tokenizing.

### H2. Data symbols become `address-code`
In `gdbValue`, `gdb-examine` and `gdbFrame`, `tokens.addressBeforeSym` runs before the `(T *)` cast rule, so that rule never fires.
- `0x00007ffff7dd1b78 <main_arena+88>` → `address-code`
- `$1 = (FILE *) 0x7ffff7f9e780 <_IO_2_1_stdout_>` → `address-code`
- `$2 = 0x404040 <completed.0>` → `address-code`
- `_vptr.Base = 0x400c68 <vtable for Derive+16>` → `address-code`; `gdb_4.txt` says in its own text that this is rodata
- `0x400c88 <typeinfo for Derive>` → `address-code`

Test: W1.

Fix:
- Use `address-code` only with code evidence: disasm or `x/i` rows, a frame pc, a function-pointer cast, `{void (void)}`, or a code pane.
- Otherwise use plain `address`.
- Move the cast rule first.
- Stop-gap: exclude `main_arena`, `_IO_*`, `vtable for`, `typeinfo`, `@@GLIBC`, `completed.*`, `stdout`, `environ`.

### H3. Whitespace robustness
**Trailing spaces or a trailing tab** (Markdown hard break, blog copies):
- gdb: 173/1871 fixture lines lose all colour, e.g. `Continuing.  `, `[Inferior 1 (process 1090) killed]  `, `[Thread debugging using libthread_db enabled]  `.
- pwndbg: 49 lines change and 15 lose everything, e.g. `0x555555557080: free@plt  ` loses the symbol.
- gef: `Undefined command…  ` loses everything.
- peda: `CANARY    : ENABLED  ` loses `enabled`.
- Cause: the `line()` wrappers end in a bare `$`.

**NBSP (U+00A0)** from web, WeChat or Notion pastes doesn't match `[\t ]`. Real `peda_4.txt` goes from 35/123 to 53/123 styled lines after replacing NBSP. The registers, signal and Legend lines come back.

Tests: G1, G2.

Fix:
- Make `line()` produce `^(?:src)[\t ]*$`.
- Run `text.replace(/\u00a0/g, " ")` before tokenizing. It keeps the length, so offsets stay valid.

## MEDIUM

### M1. The Prism `wrap` hook throws (`main.ts`)
`resolveLanguage(env.language)` throws when `env.language` is `undefined`. `Prism.highlight("int x=1;", Prism.languages.c, undefined)` gives `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`. The hook is on Obsidian's shared Prism, so other plugins that highlight without a language name break.

Repro: `integration/main_probe.ts`. Test: M1.

Fix: `if (typeof env.language !== "string") return;`.

### M2. `>` lines inside an unquoted fence are stripped as quotes (`fences.ts`)
gdb `commands`/`define`/`python` input prompts start with `>`, and Python's REPL uses `>>>`.
- `>silent` is tokenized as `silent`.
- `>>> print(x)` is tokenized as `print(x)`.
- A content line `>```` closes the fence. The real closing fence then opens a new one, inverting fence parity for the rest of the note.

Repro: `fence_probe.ts` cases 1, 2, 2b, and `parity_probe.ts`. Test: F1.

Fix: inside a fence, strip at most `open.quote` levels of `>`, and none when `open.quote` is 0.

### M3. `<-` annotations make the previous value `address-code`
The lookahead only checks for `[\t ]+<`.
- `…\t0x0000000000000031  <- fastbins[0x30]の値` → `0x31` (a chunk size) becomes `address-code`.
- `…\t0x6161616161616161 <- このchunkのfd…` → `address-code`.

Samples: `pwndbg_8`, `pwndbg_9`, `gef_15`. Test: W2.

Fix: `(?=[\t ]+<(?![-=])(?!repeats \d)[^<>\n]+>)`.

### M4. GEF ≤2020 bracketed banners are not sections
Banners like `───…[ registers ]────` get no token. Stack-pane rows are then `address-stack` only where they carry `← $esp`, so colours alternate. GEF `dereference` output without a banner has the same mix.

Samples:
- `gef_2.txt` L66, L83
- `gef_10.txt` L11/23/32/35, with stack rows L24 vs L25–31
- `gef_15.txt`

Tests: W6, W7.

Fix:
- Accept `─+\[ title \]─+` as a GEF banner.
- Classify stack rows consistently: all stack or none.

### M5. Editor cost (`editor.ts`)
`build()` walks from line 1 to the bottom of the viewport on every keystroke and viewport change. The cache key is the viewport-truncated block text, so scrolling misses the cache. Measured with the real ViewPlugin (`integration/editor_perf.ts`):
- 20k-line note with no debugger blocks: 3.9 ms per rebuild.
- With a gdb block every 200 lines: 7.4–7.7 ms per keystroke or one-line scroll, with a re-tokenize every scroll.
- Typing in a 2000-line pwndbg block: 6.8 ms median.

This is under 50 ms, but about half of a 16 ms frame.

Fix:
- Tokenize the whole block and key the cache by the full block text.
- Get fence ranges from the syntax tree, or re-scan only from the first changed line.

## LOW

**L1. Hexdump rows read as disassembly (pwndbg, gef).** `0x100000460  ff03 02d1 fd7b …` (r2 `px`) gives `address-code`, `mnemonic:ff03` and numbers. Test W5. r2 `iS` rows hit the pwndbg backtrace rule, which makes the rest of the line a single `symbol`.

**L2. `---p` mapping is `address-rodata`.** `pwndbg_4.txt` L7. Test W4.

**L3. C++ template frames are split.** `#2 0x… in std::vector<int, std::allocator<int> >::operator[] (…)` gives `symbol:"<int, std::allocator<int> >"`. Test W3. `{<Base> = …}` also becomes a `symbol` (`gdb_4.txt` L10).

**L4. pwntools `[x]` (in progress) is `msg-error`.** See `fp/python.txt`. Test W8.

**L5. Inconsistent address kinds.**
- PEDA stack rows and `RSP:` values are never `address-stack` (`peda_1` L53–60).
- pwndbg `stack 30` without a banner marks only the rsp/rbp rows as stack (`pwndbg_10`).
- gef `$pc   : 0x8002d44` and `$lr` are `number` (`gef_2` L81–82).
- GEF and PEDA type non-canonical values after an arrow, like `0x8d4c5741fa1e0ff3` or `0x1d`, as `address`, while pwndbg uses `number`.

**L6. Coverage gaps.**
- `info functions` "Non-debugging symbols" rows.
- `Symbol "x" is at 0x… in a file compiled without debugging.`
- `All functions matching regular expression …`
- `Program terminated with signal 11, Segmentation fault.` (numeric signal; `gdb_10` L13).
- ARM coprocessor operands `p15`/`c2`/`c10`.
- `EL=`/`BTYPE=` names in `cpsr [ … ]`.
- `$1 =` typed as `register`.
- The 2025 pwndbg kernel `vmmap` row where `►` overwrites the `0` of `0x` (`pwndbg_13`).

**L7. Frontmatter containing a fence swallows the note.** `---\nsnippet: |\n  ```gdb\n---\n(gdb) prose` → the rest of the note is treated as gdb code. Test F4. Obsidian `%%…%%` comments are also highlighted.

**L8. Reading view tokenizes twice.** Obsidian's own Prism pass and `highlightRendered` both tokenize each block. The ordering claimed in the code comment couldn't be verified outside Obsidian. Rendered previews are not re-rendered on unload.

**L9. Size limits.** Throughput is linear with no catastrophic backtracking, at most about 0.24 µs/char (pwndbg). Synthetic 2000-line blocks over about 500 KB exceed 50 ms:
- 500 spaces per line (1 MB): 132/240/172/197 ms (gdb/pwndbg/gef/peda).
- 40 addresses per line: 133/164/145/162 ms.
- 60 `—▸` per line: up to 109 ms.
- 50 `Breakpoint 1, ` per line: up to 99 ms.

Realistic 2000-line blocks take ≤ 23 ms, and ≤ 28 ms when padded to 300 columns (590 KB). Optional fix: skip highlighting, or highlight only the viewport, above about 300 KB.

## OK (verified)
- **Editor offsets:** identical to `flatten(tokenize)` in 93/93 fixture × quote-prefix runs (`offsets_check.ts`).
- **CRLF:** identical to LF (`tools/crlf.ts`).
- **Pathological single lines:** all 50k-character cases take ≤ 12 ms, with linear scaling from 8k to 64k characters.
- **Viewport truncation:** changes visible tokens on only 3 of about 4900 lines, so there is no visible flicker.
- **Nesting:** flatten and nested spans give the same colours, except one lost bold.
- **Unload:** cleanup is safe and idempotent.
- **Info strings:** `{.cls}`, `title=`, uppercase `GDB`, `~~~` blocks and an unclosed fence at EOF all work.
- **False positives:** few on C, objdump, r2 `pdf`, xxd and shell.

## Notes
`editor.ts` imports the type-only names `DecorationSet`, `ViewUpdate` and `LineInfo` as values. esbuild handles this, but node's type stripping can't load the file directly, so `build.sh` bundles it. `peda_4` and `gdb_4` contain NBSP and `gdb_10` uses CRLF; both are deliberate.
