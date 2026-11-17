# Debugger Output Highlight

Syntax highlighting for pasted **GDB**, **pwndbg**, **GEF** and **PEDA** output in Obsidian code blocks.

````markdown
```pwndbg
pwndbg> context
LEGEND: STACK | HEAP | CODE | DATA | WX | RODATA
─────────────[ REGISTERS / show-flags off / show-compact-regs off ]─────────────
*RAX  0x5555555572fb (main) ◂— endbr64
...
```
````

Languages: `gdb`, `pwndbg`, `gef`, `peda` (aliases `gdb-pwndbg`, `gdb-gef`, `gdb-peda`).
Each tool grammar also understands plain GDB output (breakpoint hits, `x/`, `bt`, `p`, signals, …).

## What it recognises

- prompts and commands, section banners, legends
- registers (changed-register markers, EFLAGS set/clear), disassembly (current-instruction markers, branch taken/not taken, `<sym+off>`, Intel / AT&T / aarch64)
- telescope / stack / dereference chains (`—▸`, `◂—`, `→`, `-->`), strings, annotations
- `vmmap`, `checksec`, `got`, heap chunks and bins, `hexdump`, `search`, pattern/cyclic output, messages (`[+]`, `[*]`, `[!]`)
- old and current formats of each tool (e.g. GEF decimal vs hex symbol offsets, pwndbg `RWX`→`WX` legend)

Copy/paste damage is tolerated: tabs turned into spaces, trailing spaces, CRLF, NBSP, uniformly indented pastes.

**Address colours** (stack / heap / code / data) are only used when the text itself proves the kind
(e.g. `rsp` label, heap chunk header, disassembly row, function-pointer type). Plain-text output has
lost the debugger's colours, so everything else is shown as a neutral address rather than a guess.

## How it works in Obsidian

- **Reading view**: the grammars are registered with Obsidian's own Prism, so the native code block
  (copy button, theme) is kept.
- **Live Preview / source mode**: CodeMirror 6 mark decorations — blocks stay editable.
- Works inside callouts, blockquotes and list items. Desktop and mobile.

Colours follow your theme (`--color-red`, `--color-blue`, …). Override any of them with a CSS snippet:

```css
body { --dbg-address-stack: #e5c07b; --dbg-address-code: #e06c75; }
```

See `styles.css` for the full list of `--dbg-*` variables.

## Using the grammars elsewhere (blogs, Docusaurus, …)

The grammars in `src/grammars/` are plain Prism grammars with standard aliases (`keyword`, `number`,
`string`, …), so they look reasonable with any Prism theme:

```js
import Prism from "prismjs";
import { LANGUAGES } from "./src/grammars/index.ts";
Object.assign(Prism.languages, LANGUAGES);
```

The token contract is documented in [`src/grammars/TOKENS.md`](src/grammars/TOKENS.md).

## Development

```sh
npm install
npm run dev     # watch build → main.js
npm test        # node --test (grammar, fence-scanner and core tests)
node scripts/hl.ts pwndbg path/to/output.txt          # render in the terminal
node scripts/hl.ts pwndbg --stats path/to/output.txt  # lines no rule matched
```

`research/` holds the format specifications, adversarial reviews and the real captures
(pwndbg 2026.10, GEF 2021.10–2026, PEDA, GDB 15) the grammars were built and tested against.

## License

MIT
