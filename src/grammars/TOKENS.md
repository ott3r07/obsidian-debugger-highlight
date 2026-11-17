# Token taxonomy (contract for all grammars)

Every grammar is a Prism grammar. Each token uses one of the **types** below
(becomes CSS class `token <type>`) and the listed **alias** (a standard Prism
token name, so the grammar looks sensible with any stock Prism theme on a blog).
Obsidian styling targets the `dbg-*`-free type names inside `.dbg-hl`.

| type | alias | meaning / examples |
|---|---|---|
| `prompt` | `keyword` | `pwndbg>`, `gef➤`, `gdb-peda$`, `(gdb)` |
| `command` | `function` | text the user typed after a prompt |
| `section` | `comment` | section banners / rules: `──── registers ────`, `[----stack----]` |
| `legend` | `comment` | `LEGEND: STACK \| HEAP \| …`, `Legend: code, data, rodata, value` |
| `register` | `variable` | register names: `RAX`, `$rsp`, `x29`, `EFLAGS` |
| `flag-set` | `important` | set CPU flag (`ZERO`, `PARITY` in uppercase forms) |
| `flag-clear` | `comment` | clear CPU flag (`carry`, lowercase forms) |
| `address` | `number` | an address whose memory kind is unknown |
| `address-stack` | `number` | address known (structurally) to be stack |
| `address-heap` | `number` | address known to be heap |
| `address-code` | `number` | address known to be code (followed by an instruction, `<sym+off>`, …) |
| `address-data` | `number` | address known to be writable data |
| `address-rodata` | `number` | address known to be read-only data |
| `number` | `number` | non-address numeric values, immediates, sizes, counts |
| `symbol` | `function` | `<main+4>`, `<printf@plt>`, `main`, `puts@got.plt` |
| `mnemonic` | `keyword` | `mov`, `call`, `ret`, `b.le` |
| `mnemonic-branch` | `keyword` | `jmp`/`jcc`/`call`/`b`/`bl`/`ret` (subset; optional) |
| `current` | `important` | current-instruction/line markers: `►`, `→` (gef code), `=>` |
| `arrow` | `operator` | pointer-chain arrows `—▸`, `◂—`, `→`, `-->`, `<-`, `↳`, `\|->` |
| `string` | `string` | `"…"` / `'…'` decoded strings |
| `comment` | `comment` | `; …` / `# …` annotations, filler |
| `offset` | `comment` | stack index/offset columns: `00:0000│`, `0000\|`, `+0x0008` |
| `taken` | `important` | `TAKEN`, `✔`, `JUMP is taken` |
| `not-taken` | `comment` | `NOT taken`, `✘`, `JUMP is NOT taken` |
| `perm` | `keyword` | `rwxp`, `r-xp`, `r--p` |
| `path` | `string` | file paths, `[stack]`, `[heap]`, `[vdso]` |
| `msg-info` | `comment` | `[*]` (pwndbg/gef info) and similar |
| `msg-ok` | `inserted` | `[+]` |
| `msg-warn` | `important` | warnings |
| `msg-error` | `deleted` | `[!]`, errors |
| `signal` | `important` | `Program received signal SIGSEGV, Segmentation fault.`, `SIGSEGV` |
| `keyword` | `keyword` | other fixed words worth emphasis (`Breakpoint`, `Enabled`/`Disabled`, `Partial RELRO`) |
| `enabled` | `inserted` | security feature on (`Canary found`, `NX enabled`, `✓`) |
| `disabled` | `deleted` | security feature off (`No PIE`, `✘`) |
| `punctuation` | `punctuation` | separators `│`, `:`, `[`, `]` |
| `heap-chunk` | `class-name` | `Chunk(…)`, `Allocated chunk`, `Free chunk (tcache)` headers |
| `bin` | `class-name` | `tcachebins`, `fastbins`, `unsortedbin`, `smallbins`, `largebins` |

Rules:
- Line-based structure: use the `m` flag and `^`/`$`; accept `[\t ]+` wherever
  the tool emits a tab (pastes often convert tabs to spaces), never require
  trailing whitespace, and tolerate `\r`.
- Never depend on fixed column widths or banner lengths (terminal width varies).
- When the memory kind of an address can't be known from the text, use plain
  `address`. Prefer a neutral token over a confident wrong one.
- Unknown lines must pass through untouched (no catch-all that colours prose).
