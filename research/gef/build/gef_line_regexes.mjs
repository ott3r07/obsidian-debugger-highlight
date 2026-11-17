// Proposed line-level regexes for GEF plain-text output (see ../SPEC.md).
// Run: node gef_line_regexes.mjs ../captures   -> prints per-rule hit counts + unmatched lines.
// Order matters: first match wins.
import fs from "node:fs";
import path from "node:path";

export const HEX = "0x[0-9a-fA-F]+";
export const RULES = [
  // prompt (+ optional remote/core prefix) followed by the typed command
  ["prompt", /^((?:\((?:qemu|remote|rr)\) )?(?:\(core\) )?gef➤)(\s*)(.*)$/],
  // context_title / titlify header:  "──── title ────"
  ["section-header", /^(─+) (\S.*?) (─+)$/],
  // bare separator line (end of context / empty title)
  ["section-rule", /^─{8,}$/],
  ["legend", /^\[ Legend:\s+(.*?) \]$/],
  // GEF messages
  ["message", /^\[([+!*=])\] (.*)$/],
  // registers pane / `registers` command:  "$rax   : 0x..."  "$eflags: [...]"
  ["register-line", /^(\$[a-z][a-z0-9]*)\s*: (.*)$/],
  // x86 segment line: "$cs: 0x33 $ss: 0x2b ..."
  ["register-segments", /^(?:\$[a-z]s: 0x[0-9a-f]+ ?)+$/],
  // dereference/telescope/stack pane:  "0x...│+0x0000: <chain>\t ← $sp"
  ["deref-line", /^(0x[0-9a-f]+)│([+-]0x[0-9a-f]+): ?(.*?)(?:\s+ ← (\$[\w]+(?:, \$[\w]+)*))?\s*$/],
  // hexdump qword/dword/word:  "0x...│+0x0000   0x0000..."
  ["hexdump-word", /^(0x[0-9a-f]+)│([+-]0x[0-9a-f]+)\s+(0x[0-9a-f]+)\s*$/],
  // hexdump byte / stack raw: "0x... <sym+0000>    41 42 ...    AB.."
  ["hexdump-byte", /^(0x[0-9a-f]+) (<[^>]+>)?\s{4}((?:[0-9a-f]{2} ){1,16})\s*(.*)$/],
  // heap chunk peek line: "    [0x...     00 01 ...    ....]"
  ["chunk-peek", /^ {4}\[(0x[0-9a-f]+)\s{5}((?:[0-9a-f]{2} ){1,16})\s*(.{0,16})\]$/],
  // context code pane: bp-glyph col, arrow col, address, <sym+off>, mnemonic, operands, branch note
  ["code-line", /^([● ])(→| ) {1,3}(0x[0-9a-f]+) (<[^>]+>)?\s+([a-z][\w.]*)(?: +(.*?))?(?:\t(TAKEN|NOT taken) (\[Reason: .*\])?)?\s*$/],
  // branch-target preview lines after TAKEN / call / ret:  "   ↳  0x... <sym>  insn" and "      0x..."
  ["code-target-line", /^ {3}(↳| ) {2}\s*(0x[0-9a-f]+) (<[^>]+>)?\s+([a-z][\w.]*)(?: +(.*))?$/],
  // context source pane: "     19\t ..." / " →   24\t ..." / "●    31\t ..."
  ["source-line", /^([● ])(→ |  )\s*(\d+)\t ?(.*)$/],
  // source pane variable annotation:  "         // argc=0x1, argv=0x... → [...] → "..."
  ["source-vars", /^\s+\/\/ (.*)$/],
  // threads pane
  ["thread-line", /^\[#(\d+)\] Id (\d+), (?:Name: "([^"]*)", )?(stopped|running|exited)(?: (0x[0-9a-f]+) in (.+?) \(\), reason: (.+))?$/],
  // trace pane
  ["trace-line", /^\[#(\d+)\] (0x[0-9a-f]+) → (.*)$/],
  // arguments pane
  ["args-open", /^(\S+) \($/],
  ["args-entry", /^ {3}(\$\w+|[\w ]+?) = (.*?),?$/],
  ["args-close", /^\)$/],
  // vmmap
  ["vmmap-header", /^Start\s+End\s+Offset\s+Perm\s+Path$/],
  ["vmmap-row", /^(0x[0-9a-f]+) (0x[0-9a-f]+) (0x[0-9a-f]+) ([r-][w-][x-]) ?(.*)$/],
  ["vmmap-filter", /^\[(?:name|addr) = .*\]$/],
  // heap
  ["heap-chunk", /^(Chunk)\(addr=(0x[0-9a-f]+), size=(0x[0-9a-f]+), flags=([A-Z_|! ]*)\)(?:\s+←\s+top chunk)?\s*$/],
  ["heap-arena", /^Arena\(base=(0x[0-9a-f]+), top=(0x[0-9a-f]+), last_remainder=(0x[0-9a-f]+), next=(0x[0-9a-f]+), mem=(\d+), mempeak=(\d+)\)$/],
  ["heap-tcachebin", /^Tcachebins\[idx=(\d+), size=(0x[0-9a-f]+), count=(\d+)\](.*)$/],
  ["heap-fastbin", /^Fastbins\[idx=(\d+), size=(0x[0-9a-f]+)\] (.*)$/],
  ["heap-bin-chain", /^ →   Chunk\(.*$/],
  ["heap-chunk-detail", /^(Chunk size|Usable size|Previous chunk size|Forward pointer|Backward pointer): (.*)$/],
  ["heap-flags-line", /^(?:!?\s?(?:PREV_INUSE|IS_MMAPPED|NON_MAIN_ARENA)(?:\s*\|\s*)?)+$/],
  // checksec
  ["checksec-row", /^(Canary|NX|PIE|Fortify|RelRO)\s+: (✓|✘|Full|Partial)\s*(?:\(value: (0x[0-9a-f]+)\))?\s*$/],
  // search-pattern hit
  ["search-hit", /^ {2}(0x[0-9a-f]+) - (0x[0-9a-f]+) {2}→ {3}"(.*)" ?$/],
  // xinfo body
  ["xinfo-field", /^(Page|Permissions|Pathname|Offset \(from page\)|Inode|Segment|Offset \(from segment\)|Symbol): (.*)$/],
  // got
  ["got-entry", /^\[(0x[0-9a-f]+)\] (\S+) → (0x[0-9a-f]+)$/],
  ["got-summary", /^GOT protection: (.*) \| GOT functions: (\d+)$/],
  // gef config listing
  ["config-line", /^([\w.]+) \((str|bool|int|float)\) = (.*)$/],
  // elf-info
  ["elfinfo-field", /^([A-Z][\w ]+?)\s+: (.*)$/],
  ["elfinfo-table", /^\s+\[\s*(#|\d+)\] /],
  // banner
  ["banner", /^(GEF for \w+ ready|\d+ commands loaded)/],
  // ---- plain GDB lines commonly mixed in ----
  ["gdb-bp-hit", /^(?:Temporary breakpoint|Breakpoint) (\d+), (?:(0x[0-9a-f]+) in )?(\S+) \((.*)\)(?: at (\S+):(\d+))?$/],
  ["gdb-bp-set", /^Breakpoint (\d+) at (0x[0-9a-f]+)(?:: file (.+), line (\d+)\.)?$/],
  ["gdb-signal", /^Program (?:received|terminated with) signal (SIG\w+), (.*)\.$/],
  ["gdb-inferior", /^\[Inferior (\d+) \(process (\d+)\) (exited normally|exited with code \d+|killed)\]$/],
  ["gdb-status", /^(Continuing\.|Starting program: .*|Run till exit from .*|Value returned is .*|Reading symbols from .*|Will ignore next \d+ crossings of breakpoint \d+\.|The program is not being run\.|No stack\.|Undefined command: .*|Backtrace stopped: .*|\[Thread debugging using libthread_db enabled\]|Using host libthread_db library .*|Dump of assembler code for function .*|End of assembler dump\.)$/],
  ["gdb-bt", /^#(\d+)\s+(?:(0x[0-9a-f]+) in )?(\S+) \((.*)\)(?: at (\S+):(\d+))?$/],
  ["gdb-bt-cont", /^\s{4}(?:at |src=)/],
  ["gdb-frame-stop", /^(0x[0-9a-f]+) in (\S+) \((.*)\)(?: at (\S+):(\d+))?$/],
  ["gdb-frame-nopc", /^([\w.@]+) \((.*)\)(?: at (\S+):(\d+))?$/],
  ["gdb-source-line", /^(\d+)\t(.*)$/],
  ["gdb-addr-source", /^(0x[0-9a-f]+)\t(\d+)\t(.*)$/],
  ["gdb-x-insn", /^(=> | {3})(0x[0-9a-f]+) <([^>]+)>:\t(\S+)\s*(.*)$/],
  ["gdb-x-mem", /^(0x[0-9a-f]+)(?: <[^>]+>)?:\t(.*)$/],
  ["gdb-print", /^\$(\d+) = (.*)$/],
  ["gdb-info-reg", /^([a-z][a-z0-9_]*)\s+(0x[0-9a-f]+|-?\d+)\s+(.*)$/],
  ["gdb-info-bp", /^(Num\s+Type\s+Disp Enb Address\s+What|\d+\s+(?:hw )?breakpoint\s+keep|\s+breakpoint already hit .*)/],
  ["pattern-string", /^[a-z]{16,}$/],
  ["blank", /^\s*$/],
];

export function classify(line) {
  for (const [name, re] of RULES) if (re.test(line)) return name;
  return null;
}

if (process.argv[2]) {
  const root = process.argv[2];
  const counts = {};
  const unmatched = new Map();
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".txt") && !f.startsWith("session_")) {
        for (const line of fs.readFileSync(p, "utf8").split("\n")) {
          const c = classify(line);
          if (c) counts[c] = (counts[c] || 0) + 1;
          else unmatched.set(line, p);
        }
      }
    }
  };
  walk(root);
  console.log(counts);
  console.log(`unmatched distinct lines: ${unmatched.size}`);
  for (const [l, p] of [...unmatched].slice(0, Number(process.argv[3] || 80)))
    console.log(`${path.basename(p)}: ${JSON.stringify(l)}`);
}
