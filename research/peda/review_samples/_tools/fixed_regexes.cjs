// Corrected / added regexes proposed in REVIEW.md. Order matters: first match wins.
const SYM = String.raw`<(.+?)>`; // lazy: allows C++ "<std::vector<int>::size()+4>", "<operator new(unsigned long)>"
const HEX = String.raw`0x[0-9a-f]+`;
const INSN_TAIL = String.raw`:[\t ]+(\S+)(?:[\t ]+(.*?))?[\t ]*$`;
const R = {
  prompt: /^(gdb-peda\$)(?:[\t ]+(.*?))?[\t ]*$/,
  pager: /^(--More--\(\d+\/\d+\))(.*)$/,
  banner: /^[\t ]*\[(-{3,})([A-Za-z][\w :]*?)(-{3,})\][\t ]*$/,
  footer: /^[\t ]*\[-{20,}\][\t ]*$/,
  legend: /^(Legend):[\t ]+(.*?)[\t ]*$/,
  stop: /^(Stopped reason):[\t ]+(\S+)[\t ]*$/,
  eflags: /^(EFLAGS):[\t ]+(0x[0-9a-f]+)[\t ]+\(([A-Za-z ]*)\)[\t ]*$/,
  register: /^(R(?:[ABCD]X|[SD]I|[BS]P|IP|8|9|1[0-5])|E(?:[ABCD]X|[SD]I|[BS]P|IP))[\t ]*:[\t ]+(0x[0-9a-f]+.*?|Cannot access memory address)[\t ]*$/,
  stack: /^(\d{4,})\|[\t ]+(.*?)[\t ]*$/,
  arg: /^(arg\[\d+\]):[\t ]+(.*?)[\t ]*$/,
  guessed: /^(Guessed arguments:|No argument)[\t ]*$/,
  disassemble: new RegExp(String.raw`^(=> |   )(0x[0-9a-f]{8,16})[\t ]+<\+(\d+)>` + INSN_TAIL),
  disasm: new RegExp(String.raw`^(=> |   )(${HEX})(?:[\t ]+${SYM}| (?=:))?` + INSN_TAIL),   // " (?=:)" = <sym> lost to HTML
  jumpSkipped: new RegExp(String.raw`^( \| )(${HEX})(?:[\t ]+${SYM})?` + INSN_TAIL),
  jumpTarget: new RegExp(String.raw`^( \|->)(=> |[\t ]+)(${HEX})(?:[\t ]+${SYM})?` + INSN_TAIL),
  jumpCont: new RegExp(String.raw`^( {7})(${HEX})(?:[\t ]+${SYM})?` + INSN_TAIL),
  jumpCannot: /^( \|->)[\t ]+(Cannot evaluate jump destination)[\t ]*$/,
  jumpTaken: /^[\t ]+(JUMP is taken)[\t ]*$/,
  jumpNotTaken: /^[\t ]+(JUMP is NOT taken)[\t ]*$/,
  invalid: /^(Invalid \$(?:PC|SP) address):[\t ]+(0x[0-9a-f]+)[\t ]*$/,
  pedaWarning: /^(Warning):[\t ]*(.*)$/,       // PEDA yellow AND gdb's own "Warning:\nCould not insert..."
  gdbWarning: /^(warning):[\t ]+(.*)$/,         // gdb's lower-case warnings
  error: /^(Error):[\t ]+(.*)$/,
  debug: /^(Debug):[\t ]+(.*)$/,
  checksec: /^(CANARY|FORTIFY|NX|PIE|RELRO)[\t ]+:[\t ]+(ENABLED|FULL|disabled|Partial|Dynamic Shared Object)[\t ]*$/,
  xinfoHeader: /^(Virtual memory mapping:)[\t ]*$/,
  xinfoField: /^(Start|End|Offset|Perm|Name)[\t ]*:[\t ]+(.*?)[\t ]*$/,
  vmmapHeader: /^(Start)[\t ]+(End)[\t ]+(Perm)[\t ]+(Name)[\t ]*$/,
  vmmapRow: /^(0x[0-9a-f]{8,16})[\t ]+(0x[0-9a-f]{8,16})[\t ]+([rwxps-]{4})(?:[\t ]+(.*?))?[\t ]*$/,
  hexdump: /^(0x[0-9a-f]{8,16}) : ((?:[0-9a-f]{2} ){0,15}[0-9a-f]{2})(?:[\t ]+(.{1,16}?))?[\t ]*$/,
  distance: /^From (0x[0-9a-f]+)( \(SP\))? to (0x[0-9a-f]+): (-?\d+) bytes, (-?\d+) dwords( \(\+\d+ bytes\))?[\t ]*$/,
  searching: /^(Searching for(?: reference to:| ROP gadget:| ASM code:)?) (.+?) (in(?: range)?:) (.*?)[\t ]*$/,
  searchingPtr: /^(Searching for (?:pointers|addresses) on:) (.*)$/,
  found: /^(Found \d+ results, display max \d+ items:)[\t ]*$/,
  notFound: /^(Not found)[\t ]*$/,
  patternCreate: /^'([A-Za-z0-9%$\-;()]+)'[\t ]*$/,
  patternReg: /^([A-Z][A-Z0-9_]*)\+(-?\d+) found at offset: (\d+)[\t ]*$/,
  patternOffset: /^(.+?) found at offset: (\d+)[\t ]*$/,
  patternNotFound: /^(.+?) not found in pattern buffer[\t ]*$/,
  patternHeading: /^(Registers contain pattern buffer:|Registers point to pattern buffer:|Pattern buffer found at:|References to pattern buffer found at:|No register contains pattern buffer|No register points to pattern buffer|Pattern buffer not found in memory|Reference to pattern buffer not found in memory)[\t ]*$/,
  patternRegPtr: /^\[([A-Z][A-Z0-9_]*)\] ((?:-->)+) offset (\d+) - size ~(\d+)[\t ]*$/,
  patternMem: /^(0x[0-9a-f]+) : offset +(\d+) - size +(\d+) \((.*)\)[\t ]*$/,
  patternRef: /^(0x[0-9a-f]+) : (0x[0-9a-f]+) \((.*)\)[\t ]*$/,
  ropsearch: /^(0x[0-9a-f]+) : \((b'[0-9a-f]*'|[0-9a-f]*)\)[\t ]+(.*?)[\t ]*$/,
  jmpcall: /^(0x[0-9a-f]+) : ((?:call|jmp) .*?)[\t ]*$/,
  // x/ examine (body starts with a value / string) vs dumprop/strings/xrefs (body is text)
  xExamine: new RegExp(String.raw`^(${HEX})(?:[\t ]+${SYM})?:[\t ]+((?:0x[0-9a-f]+|-?\d+|"|'|<|\{).*?)[\t ]*$`),
  xrefsInsn: new RegExp(String.raw`^(${HEX})(?:[\t ]+${SYM}):\t(\S+)(?:[\t ]+(.*?))?[\t ]*$`),
  addrColonText: /^(0x[0-9a-f]+): (.+?)[\t ]*$/,      // dumprop OR strings; decide by body
  searchResult: /^([\t ]*[^\s:][^:]*?) : (0x[0-9a-f]+(?: --> 0x[0-9a-f]+)*(?: \(.*\))?)[\t ]*$/,
  chainLine: /^(0x[0-9a-f]+)((?: --> 0x[0-9a-f]+)*)(?: \((.*)\))?[\t ]*$/,   // xinfo/xprint first line
  elfSingle: /^(\.?[\w.]+): (0x[0-9a-f]+) - (0x[0-9a-f]+) \((code|data|rodata)\)[\t ]*$/,
  elfNoMatch: /^('[^']*'): (no match found)[\t ]*$/,
  kv: /^([\w.@-]+) = (.*?)[\t ]*$/,                  // ropgadget, elfheader, pshow, procinfo, elfsymbol
  fd: /^(fd\[\d+\]) -> (.*)$/,
  pedaInfo: /^(Stepping through, Ctrl-C to stop\.\.\.|Writing ROP gadgets to file: .*|Writing pattern of \d+ chars to filename .*|All references to '.*':|Found \d+ symbols|Detail symbol info|ASLR is (?:ON|OFF)|Cannot access memory address)[\t ]*$/,
  // ---- gdb ----
  gdbBpSet: /^(Breakpoint|Temporary breakpoint|Hardware breakpoint) (\d+) at (0x[0-9a-f]+)(?:: (?:file (.+), line (\d+)\.|(.+)\.))?[\t ]*$/,
  gdbWatchSet: /^((?:Hardware |Software )?(?:read |access \(read\/write\) )?[Ww]atchpoint) (\d+): (.*)$/,
  gdbBpHit: /^(?:(Thread [\d.]+ "[^"]*") hit )?(Breakpoint|Temporary breakpoint|Hardware watchpoint|Watchpoint|Catchpoint) (\d+), (?:(0x[0-9a-f]+) in )?(.+?) \((.*)$/,
  gdbSignal: /^(?:(Thread [\d.]+ "[^"]*") received|Program received) signal (SIG[A-Z0-9]+), (.*)$/,
  gdbTerminated: /^(Program terminated with signal) (SIG[A-Z0-9]+), (.*)$/,
  gdbExit: /^\[(Inferior \d+ \(process \d+\) exited (?:normally|with code \d+))\][\t ]*$/,
  gdbBracket: /^\[(?:New |Switching to |Thread |Detaching |Attaching |Inferior \d+ \(process \d+\) detached|LWP ).*\][\t ]*$/,
  gdbStepEcho: /^(0x[0-9a-f]+)[\t ]+(\d+)[\t ]+(.*)$/,
  gdbSrcLine: /^(\d+)[\t ]+(.*)$/,
  gdbFrame: /^(0x[0-9a-f]+) in (.+?) \((.*?)\)(?: (at|from) (\S+?))?[\t ]*$/,
  gdbFrameNoAddr: /^([A-Za-z_][\w:.@<>~]*) \((.*)\) at (\S+):(\d+)[\t ]*$/,
  gdbInfo: /^(Continuing\.|Continuing with signal \w+\.|The program no longer exists\.|The program is not being run\.|The program has no registers now\.|Run till exit from .*|Starting program: .*|Reading symbols from .*|Remote debugging using .*|Attaching to process \d+|Value returned is .*|Dump of assembler code .*|End of assembler dump\.|No symbol table is loaded\..*|No shared libraries loaded at this time\.|Undefined command: .*|Backtrace stopped: .*|Cannot access memory at address 0x[0-9a-f]+|Using host libthread_db library .*|Core was generated by .*|process \d+ is executing new program: .*|Could not insert .*|Command aborted\.|Single stepping until exit .*)[\t ]*$/,
  print: /^(\$\d+) = (.*)$/,
  bt: /^(#\d+)[\t ]+(?:(0x[0-9a-f]+) in )?(.+?) \((.*?)\)(?: (at|from) (\S+?))?[\t ]*$/,
  infoRegisters: /^([a-z][a-z0-9_]*)[\t ]+(0x[0-9a-f]+|-?\d+|\{)[\t ]*(.*?)[\t ]*$/,
  continuation: /^[\t ]{2,}(?:at |from |\w+=|v\d+_|uint128|\})/,   // gdb-wrapped frame lines, xmm/ymm unions
};
module.exports = R;

// ---- chain annotation classifier ----
const GSTR = String.raw`(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)+' <repeats \d+ times>)`;
const A = [
  ['chain-truncated', /^--> \.\.\.$/],
  ['symbol+disasm', /^(<.+?>)?:[\t ]+(.*)$/],
  ['self-reference', /^0x[0-9a-f]{8}(?:[0-9a-f]{8})?$/],
  ['gdb-string', new RegExp(`^${GSTR}(?:, ${GSTR})*(?:\\.\\.\\.)?$`)],
  ['value-repr', /^'(?:[^'\\]|\\.)*'$/],
  ['memerror', /^MemError$/],
  ['disasm', /^[a-z][a-z0-9.]*(?:[\t ].*)?$/],
];
module.exports.classifyAnnotation = (a) => { for (const [k, re] of A) if (re.test(a)) return k; return 'UNKNOWN'; };
module.exports.CHAIN = /^(0x[0-9a-f]+)((?: --> 0x[0-9a-f]+)*)(?: \((.*)\))?[\t ]*$/;
