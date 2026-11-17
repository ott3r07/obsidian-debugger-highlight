/**
 * PEDA (longld/peda) output, ANSI-stripped, as pasted into ```peda blocks.
 *
 * Evidence: research/peda/SPEC.md, corrected by research/peda/REVIEW.md
 * (the review's first-match-wins regex set in
 * review_samples/_tools/fixed_regexes.cjs is the basis of the line rules).
 *
 * Structure: every PEDA rule matches a WHOLE line (`^…$`, `m` flag) and
 * tokenizes it with an `inside` grammar. Whole-line matching matters in
 * Prism: an untouched remainder of a partially matched line would start a
 * new fragment where `^` matches again. Lines no rule claims are left as
 * whole lines for the vanilla-gdb rules composed after this grammar
 * (index.ts: compose(peda, gdb)).
 *
 * Container tokens (`peda-line`, `peda-ref`, `peda-insn`) only group leaf
 * tokens; they are not part of the TOKENS.md taxonomy and carry no alias,
 * so neither the plugin CSS nor stock Prism themes colour them.
 *
 * Address kinds (REVIEW.md §5): plain-text PEDA loses its code/data/rodata
 * colours, so only structurally certain kinds are emitted:
 *   - `address-code`: followed by an instruction (`(<sym>:\tinsn)`, `(insn)`),
 *     disassembly-line addresses, branch targets, ROP gadget addresses,
 *     `elfheader … (code)`;
 *   - `address-rodata`: chain element followed by `(MemError)` (only produced
 *     in PEDA's read-only branch), `elfheader … (rodata)`;
 *   - otherwise `address`. No stack/heap/data inference by magnitude.
 * Chains are parsed left to right: elements before `-->` are addresses; the
 * last element is an address only when a pointer-style annotation follows,
 * else (`('…')` value repr, or nothing) it is a `number`.
 */
import type { Grammar, GrammarValue, TokenObject } from "prismjs";
import { SRC, lineSrc, trimmed, instruction } from "./shared.ts";

const H = String.raw`0x[0-9a-fA-F]+`;
const W = String.raw`[\t ]`;
/** whole-line pattern (multiline); trailing blanks stay outside (see shared `lineSrc`) */
const L = (src: string) => new RegExp(lineSrc(src), "m");
/** inner pattern (content of a single line, no `m` flag) */
const I = (src: string, flags = "") => new RegExp(src, flags);

const STRING = `${SRC.dq}|${SRC.sq}`;
/** lazy symbol anchored by what follows (handles C++ `<std::vector<int>::size()+4>`) */
const SYM_LAZY = String.raw`<.+?>`;

// ---------------------------------------------------------------- instructions

/**
 * One instruction (Intel/AT&T). Unlike shared `instructionWithMnemonic`, the
 * mnemonic pattern has no leading `\s*`: Prism re-applies a pattern to the
 * remainder of a fragment, so `^\s*[a-z]…` would also tag the first operand.
 */
const insn: Grammar = {
	"msg-error": { pattern: I(String.raw`^Cannot access memory at address(?: ${H})?`), alias: "deleted" },
	"address-code": {
		// branch target: `jle    0x401976 <main+34>`, `call   0x404e90 <printf>`
		pattern: I(String.raw`(^(?:(?:bnd|notrack)${W}+)?(?:j[a-z]{1,4}|call[lq]?|loop[a-z]{0,3}|xbegin)${W}+\*?)${H}\b`),
		lookbehind: true,
		alias: "number",
	},
	"mnemonic-branch": {
		pattern: I(String.raw`^(?:(?:bnd|notrack|rep[a-z]{0,2})${W}+)?(?:j[a-z]{1,4}|call[lq]?|ret[nfq]?|loop[a-z]{0,3})(?![\w.])`),
		alias: "keyword",
	},
	mnemonic: {
		pattern: I(String.raw`^(?:(?:lock|rep[a-z]{0,2}|bnd|notrack|data16|addr32)${W}+)*[a-z][a-z0-9.]*(?![\w.])`),
		alias: "keyword",
	},
	...instruction,
};

const insnToken = (pattern: RegExp, lookbehind = false): GrammarValue => ({ pattern, lookbehind, inside: insn });

/** `pop rdi; pop rbp; ret` (dumprop / ropsearch / asmsearch gadget text) */
const gadget: Grammar = {
	"peda-insn": insnToken(/[a-z][^;]*?(?=[\t ]*(?:;|$))/),
	punctuation: /;/,
};

// ---------------------------------------------------------- reference chains

const ANN = {
	/** `(<main+19>:\tcmp …)`, `(:\ttest eax,eax)` (symbol lost in an HTML copy) */
	code: String.raw`\((?:${SYM_LAZY})?${W}*:${W}+.*\)`,
	/** `(mov    edi,eax)`, `(endbr64)` */
	disasm: String.raw`\([a-z][a-z0-9.]*(?:${W}.*)?\)`,
	/** `('AA0A')`, `('')`, `('\r')`: python repr of the value itself */
	value: String.raw`\('(?:[^'\\]|\\.)*'\)`,
	memerror: String.raw`\(MemError\)`,
	any: String.raw`\(.*\)`,
};
/** element + annotation, which must run to the end of the line */
const ref = (ann: string) => I(String.raw`${H}${W}+${ann}(?=${W}*$)`);

const parens = { punctuation: /^\(|\)$/ };

const annCode: Grammar = {
	"peda-insn": insnToken(I(String.raw`(^\((?:${SYM_LAZY})?${W}*:${W}+)\S[^]*?(?=\)$)`), true),
	symbol: { pattern: I(SYM_LAZY), alias: "function" },
	punctuation: /[():]/,
};
const annDisasm: Grammar = {
	"peda-insn": insnToken(/(^\()[^]+(?=\)$)/, true),
	...parens,
};
const annValue: Grammar = { string: { pattern: I(SRC.sq), alias: "string" }, ...parens };
const annOther: Grammar = {
	string: { pattern: I(STRING), alias: "string" },
	comment: { pattern: /<repeats \d+ times>|\.\.\./, alias: "comment" },
	arrow: { pattern: /-->/, alias: "operator" },
	address: { pattern: I(H), alias: "number" },
	"msg-error": { pattern: /\bMemError\b/, alias: "deleted" },
	punctuation: /[(),]/,
};

const refPart = (type: string, alias: string, ann: Grammar): Grammar => ({
	// a value that cannot be an address is a number whatever its annotation (as in pwndbg)
	"peda-nonaddr": { pattern: I(`^${SRC.nonAddr}`), inside: { number: { pattern: /[^]+/, alias: "number" } } },
	[type]: { pattern: I(`^${H}`), alias },
	"peda-annotation": { pattern: /\([^]*\)$/, inside: ann },
});

/**
 * Chain rules; spread FIRST into any grammar whose line contains a chain.
 * `peda-ref` claims "last element + annotation" so that nothing else can
 * match inside an annotation (strings may contain `-->`, `0x…`, parens).
 */
const chain: Grammar = {
	"peda-ref": [
		{ pattern: ref(ANN.code), inside: refPart("address-code", "number", annCode) },
		{ pattern: ref(ANN.disasm), inside: refPart("address-code", "number", annDisasm) },
		{ pattern: ref(ANN.memerror), inside: refPart("address-rodata", "number", annOther) },
		{ pattern: ref(ANN.value), inside: refPart("number", "number", annValue) },
		// gdb string / <repeats> / self reference (0x0000…) / (--> ...) / unknown
		{ pattern: ref(ANN.any), inside: refPart("address", "number", annOther) },
	],
	address: { pattern: I(`${H}(?=${W}+-->)`), alias: "number" },
	arrow: { pattern: /-->/, alias: "operator" },
	number: { pattern: I(H), alias: "number" },
	"msg-error": { pattern: /Cannot access memory address/, alias: "deleted" },
};

/**
 * Chain whose first element is known to be a stack address (the `RSP:`/`ESP:`
 * value, a `0000| 0x…` stack-pane slot). `lead` is a lookbehind source for
 * what precedes that element.
 */
const stackChain = (lead: string): Grammar => ({
	"peda-sp": {
		pattern: I(String.raw`(${lead})${H}(?:${W}+\(.*\))?(?=${W}*$|${W}+-->)`),
		lookbehind: true,
		inside: {
			"address-stack": { pattern: I(`^${H}`), alias: "number" },
			"peda-annotation": { pattern: /\([^]*\)$/, inside: annOther },
		},
	},
	...chain,
});

/** chain body as a regex fragment, for line rules */
const CHAIN = String.raw`${H}(?:${W}+-->${W}+${H})*(?:${W}+\(.*\))?`;
const CHAIN_OR_ERR = String.raw`(?:${CHAIN}|Cannot access memory address)`;

// ---------------------------------------------------------------- line rules

const REG = String.raw`(?:R(?:[ABCD]X|[SD]I|[BS]P|IP|8|9|1[0-5])|E(?:[ABCD]X|[SD]I|[BS]P|IP))`;
const kw = (pattern: RegExp): GrammarValue => ({ pattern, alias: "keyword" });
const addr = (pattern: RegExp): GrammarValue => ({ pattern, alias: "number" });
const num = (pattern: RegExp): GrammarValue => ({ pattern, alias: "number" });

/** `($sp + -0x30 [-12 dwords])` / `(/work/test_static)` / `([heap])` */
const locationParen: Grammar = {
	comment: { pattern: /\(\$sp[^]*\)$/, alias: "comment" },
	path: { pattern: /(\()[^]+(?=\)$)/, lookbehind: true, alias: "string" },
	punctuation: /[()]/,
};

/** disassembly line: context code, ` | ` skipped, ` |->` target, x/i, xrefs */
const disasmLine: Grammar = {
	"peda-insn": insnToken(I(String.raw`(>${W}*:${W}+|${H}${W}*:${W}+)\S[^]*`), true),
	symbol: { pattern: /<.+>/, alias: "function" },
	current: { pattern: /=>/, alias: "important" },
	arrow: { pattern: /\|->/, alias: "operator" },
	punctuation: /[|:]/,
	"address-code": addr(I(H)),
};
const DIS_PREFIX = String.raw`(?:=>${W}*|${W}?\|->(?:=>)?${W}*|${W}?\|${W}+|${W}+(?:=>${W}*)?)`;
const DIS_TAIL = String.raw`${W}*:${W}+(?=[a-zA-Z])\S.*`;

const rules: TokenObject[] = [];
const line = (pattern: string, inside: Grammar) => rules.push({ pattern: L(pattern), inside: trimmed("peda", inside) });

// prompt + typed command
line(String.raw`gdb-peda\$(?:${W}.*)?`, {
	prompt: { pattern: /^gdb-peda\$/, alias: "keyword" },
	command: { pattern: /\S(?:.*\S)?/, alias: "function" },
});
// pager (the user's answer may land on the same line)
line(String.raw`--More--\(\d+\/\d+\).*`, {
	prompt: { pattern: /^--More--\(\d+\/\d+\)/, alias: "keyword" },
	command: { pattern: /\S(?:.*\S)?/, alias: "function" },
});
line(String.raw`Stopped reason:${W}+\S+`, {
	keyword: kw(/^Stopped reason/),
	signal: { pattern: /\bSIG[A-Z0-9]+\b/, alias: "important" },
	punctuation: /:/,
});
line(String.raw`EFLAGS:${W}+${H}${W}+\([A-Za-z ]*\)`, {
	register: { pattern: /^EFLAGS/, alias: "variable" },
	number: num(I(H)),
	"flag-set": { pattern: /\b[A-Z]{2,}\b/, alias: "important" },
	"flag-clear": { pattern: /\b[a-z]{2,}\b/, alias: "comment" },
	punctuation: /[():]/,
});
line(String.raw`[RE]SP${W}*:${W}+${CHAIN_OR_ERR}`, {
	...stackChain(String.raw`^[RE]SP${W}*:${W}+`),
	register: { pattern: /^[A-Z0-9]+/, alias: "variable" },
	punctuation: /:/,
});
line(String.raw`${REG}${W}*:${W}+${CHAIN_OR_ERR}`, {
	...chain,
	register: { pattern: /^[A-Z0-9]+/, alias: "variable" },
	punctuation: /:/,
});
// stack pane / `telescope` rows: the slot address is stack
line(String.raw`\d{4,}\|${W}*${CHAIN_OR_ERR}`, {
	...stackChain(String.raw`^\d{4,}\|${W}*`),
	offset: { pattern: /^\d+\|/, alias: "comment" },
});
line(String.raw`arg\[\d+\]:${W}+${CHAIN}`, {
	...chain,
	keyword: kw(/^arg\[\d+\]/),
	punctuation: /:/,
});
// disassembly (prefixed forms; symbol optional, `0x… :` when an HTML copy ate `<sym>`)
line(String.raw`${DIS_PREFIX}${H}(?:${W}+${SYM_LAZY}| (?=:))?${DIS_TAIL}`, disasmLine);
// unprefixed `0x… <sym>:\tinsn` (xrefs, left-trimmed pastes); needs the symbol
line(String.raw`${H}${W}+${SYM_LAZY}${DIS_TAIL}`, disasmLine);
line(String.raw`${W}?\|->${W}+Cannot evaluate jump destination`, {
	arrow: { pattern: /\|->/, alias: "operator" },
	"msg-error": { pattern: /Cannot evaluate jump destination/, alias: "deleted" },
});
line(String.raw`Invalid \$(?:PC|SP) address:${W}+${H}`, {
	address: addr(I(`${H}$`)),
	"msg-error": { pattern: /^[^:]+/, alias: "deleted" },
	punctuation: /:/,
});
// checksec
line(String.raw`(?:CANARY|FORTIFY|NX|PIE|RELRO)${W}+:${W}+(?:ENABLED|FULL|disabled|Partial|Dynamic Shared Object)`, {
	enabled: { pattern: /\b(?:ENABLED|FULL)$/, alias: "inserted" },
	disabled: { pattern: /\bdisabled$/, alias: "deleted" },
	keyword: kw(/^[A-Z]+|\b(?:Partial|Dynamic Shared Object)$/),
	punctuation: /:/,
});
// xinfo mapping block
line(String.raw`(?:Start|End)${W}*:${W}+${H}`, { keyword: kw(/^\w+/), address: addr(I(H)), punctuation: /:/ });
line(String.raw`Offset${W}*:${W}+${H}`, { keyword: kw(/^\w+/), number: num(I(H)), punctuation: /:/ });
line(String.raw`Perm${W}*:${W}+[rwxps-]{4}`, {
	keyword: kw(/^\w+/),
	perm: { pattern: /[rwxps-]{4}$/, alias: "keyword" },
	punctuation: /:/,
});
line(String.raw`Name${W}*:${W}+\S.*`, {
	keyword: kw(/^\w+/),
	path: { pattern: /(:[\t ]+)\S[^]*/, lookbehind: true, alias: "string" },
	punctuation: /:/,
});
// vmmap
line(String.raw`0x[0-9a-fA-F]{8,16}${W}+0x[0-9a-fA-F]{8,16}${W}+[rwxps-]{4}(?:${W}+.*)?`, {
	address: addr(I(H)),
	perm: { pattern: /(^[\t ]+)[rwxps-]{4}/, lookbehind: true, alias: "keyword" },
	path: { pattern: /\S(?:.*\S)?/, alias: "string" },
});
// hexdump
line(String.raw`0x[0-9a-fA-F]{8,16} : (?:[0-9a-f]{2} ){0,15}[0-9a-f]{2}(?:${W}+.{1,16}?)?`, {
	string: { pattern: /((?:^|\s)[0-9a-f]{2}[\t ]{2,})\S[^]*/, lookbehind: true, alias: "string" },
	address: addr(I(`^${H}`)),
	number: num(/\b[0-9a-f]{2}\b/),
	punctuation: /:/,
});
// distance
line(String.raw`From ${H}(?: \(SP\))? to ${H}: -?\d+ bytes, -?\d+ dwords(?: \(\+\d+ bytes\))?`, {
	address: addr(I(H)),
	register: { pattern: /\bSP\b/, alias: "variable" },
	number: num(/[-+]?\b\d+\b/),
	punctuation: /[():,]/,
});
// searchmem / find / refsearch / lookup / ropsearch / asmsearch headers
line(String.raw`Searching for(?: reference to:| ROP gadget:| ASM code:)? .+? in(?: range)?: .*`, {
	keyword: kw(/^Searching for(?: reference to:| ROP gadget:| ASM code:)?|\bin(?: range)?:/),
	string: { pattern: I(STRING), alias: "string" },
	address: addr(I(H)),
});
line(String.raw`Searching for (?:pointers|addresses) on: .*`, {
	keyword: kw(/^Searching for (?:pointers|addresses) on:/),
});
line(String.raw`Found \d+ results, display max \d+ items:`, {
	number: num(/\b\d+\b/),
	keyword: kw(/[^\d]+/),
});
// pattern search / offset
line(String.raw`[A-Z][A-Z0-9_]*\+-?\d+ found at offset: \d+`, {
	register: { pattern: /^[A-Z][A-Z0-9_]*/, alias: "variable" },
	number: num(/-?\b\d+\b/),
	punctuation: /[+:]/,
});
line(String.raw`.+? found at offset: \d+`, {
	number: num(/^(?:0x[0-9a-fA-F]+|\d+)(?= found)|\b\d+$/),
	string: { pattern: /^.+?(?= found at offset)/, alias: "string" },
	punctuation: /:/,
});
line(String.raw`\[[A-Z][A-Z0-9_]*\] (?:-->)+ offset \d+ - size ~\d+`, {
	register: { pattern: /[A-Z][A-Z0-9_]*/, alias: "variable" },
	arrow: { pattern: /(?:-->)+/, alias: "operator" },
	number: num(/~?\b\d+\b/),
	punctuation: /[[\]]/,
});
line(String.raw`${H} : offset +\d+ - size +\d+ \(.*\)`, {
	"peda-location": { pattern: /\(.*\)$/, inside: locationParen },
	address: addr(I(`^${H}`)),
	number: num(/\b\d+\b/),
	punctuation: /:/,
});
line(String.raw`${H} : ${H} \(.*\)`, {
	"peda-location": { pattern: /\(.*\)$/, inside: locationParen },
	address: addr(I(H)),
	punctuation: /:/,
});
// ropsearch / asmsearch: `0x004021f8 : (b'5f5dc3')\tpop rdi; pop rbp; ret`
line(String.raw`${H} : \((?:b'[0-9a-f]*'|[0-9a-f]*)\)${W}+.*`, {
	"peda-gadget": { pattern: /(\)[\t ]+)\S[^]*/, lookbehind: true, inside: gadget },
	"address-code": addr(I(`^${H}`)),
	string: { pattern: /b?'[0-9a-f]*'|(?<=\()[0-9a-f]+(?=\))/, alias: "string" },
	punctuation: /[():]/,
});
// jmpcall: `0x401014 : call rax`
line(String.raw`${H} : (?:call|jmp)[\t ].*`, {
	"peda-insn": insnToken(/(: )\S[^]*/, true),
	"address-code": addr(I(`^${H}`)),
	punctuation: /:/,
});
// dumprop: `0x401017: add esp,0x8; ret`
line(String.raw`${H}: [a-z][a-z0-9]*(?: [^;\n]*?)?(?: ?; [a-z][a-z0-9]*(?: [^;\n]*?)?)*`, {
	"peda-gadget": { pattern: /(: )\S[^]*/, lookbehind: true, inside: gadget },
	"address-code": addr(I(`^${H}`)),
	punctuation: /:/,
});
// strings: `0x481010: Hello, PEDA highlighter!` (not gdb x/: body is no value)
line(String.raw`${H}: (?![\t ]|0x|-?\d|["'<{]).+`, {
	address: addr(I(`^${H}`)),
	string: { pattern: /(: )[^]+/, lookbehind: true, alias: "string" },
	punctuation: /:/,
});
// elfheader single section: `.text: 0x4011c0 - 0x480740 (code)`
line(String.raw`\.?[\w.]+: ${H} - ${H} \(code\)`, {
	"address-code": addr(I(H)),
	keyword: kw(/\(code\)$/),
	symbol: { pattern: /^\.?[\w.]+(?=:)/, alias: "function" },
	punctuation: /[:\-]/,
});
line(String.raw`\.?[\w.]+: ${H} - ${H} \(rodata\)`, {
	"address-rodata": addr(I(H)),
	keyword: kw(/\(rodata\)$/),
	symbol: { pattern: /^\.?[\w.]+(?=:)/, alias: "function" },
	punctuation: /[:\-]/,
});
line(String.raw`\.?[\w.]+: ${H} - ${H} \(data\)`, {
	address: addr(I(H)),
	keyword: kw(/\(data\)$/),
	symbol: { pattern: /^\.?[\w.]+(?=:)/, alias: "function" },
	punctuation: /[:\-]/,
});
line(String.raw`'[^'\n]*': no match found`, {
	string: { pattern: /^'[^']*'/, alias: "string" },
	comment: { pattern: /no match found/, alias: "comment" },
	punctuation: /:/,
});
// searchmem / refsearch / lookup result: `    [stack] : 0x2aaaab2abb00 --> …`
line(String.raw`${W}*[^\s:][^:\n]*? : ${CHAIN}`, {
	...chain,
	path: { pattern: /[^\s:](?:[^:]*[^\s:])?/, alias: "string" },
	punctuation: /:/,
});
// xinfo / xprint first line: a bare chain
line(CHAIN, chain);
// ropgadget: `pop2ret = 0x401738`; elfsymbol: `strlen@plt = 0x80483e0`
line(String.raw`(?:ret|popret|pop\d+ret|addesp_\d+|[\w.]+@plt) = ${H}`, {
	"address-code": addr(I(`${H}$`)),
	symbol: { pattern: /^\S+/, alias: "function" },
	punctuation: /=/,
});
// elfheader / elfsymbol: `.rela.plt = 0x4002e8`
line(String.raw`[\w.@-]+ = ${H}`, {
	address: addr(I(`${H}$`)),
	symbol: { pattern: /^\S+/, alias: "function" },
	punctuation: /=/,
});
// pshow / procinfo: `ansicolor = 'on'`, `pagesize = 0`, `exe = /usr/bin/x`
line(String.raw`(?!type )[\w.@-]+ = .*`, {
	keyword: kw(/^\S+/),
	string: { pattern: I(`(= )(?:${STRING})$`), lookbehind: true, alias: "string" },
	number: { pattern: /(= )-?\d+$/, lookbehind: true, alias: "number" },
	path: { pattern: /(= )\/\S*$/, lookbehind: true, alias: "string" },
	punctuation: /=/,
});
line(String.raw`fd\[\d+\] -> .*`, {
	keyword: kw(/^fd\[\d+\]/),
	arrow: { pattern: /->/, alias: "operator" },
	path: { pattern: /\S.*/, alias: "string" },
});
line(String.raw`ASLR is (?:ON|OFF)`, {
	enabled: { pattern: /\bON$/, alias: "inserted" },
	disabled: { pattern: /\bOFF$/, alias: "deleted" },
	keyword: kw(/^ASLR/),
});
line(String.raw`All references to '.*':`, {
	string: { pattern: /'.*'/, alias: "string" },
	keyword: kw(/[^:]+/),
	punctuation: /:/,
});
line(String.raw`Writing pattern of \d+ chars to filename ".*"`, {
	string: { pattern: I(SRC.dq), alias: "string" },
	number: num(/\b\d+\b/),
	comment: { pattern: /[^"\d]+/, alias: "comment" },
});
// `peda help` / `phelp` command list: `aslr -- Show/set ASLR setting of GDB`
line(String.raw`[a-z][a-z_]* -- \S.*`, {
	command: { pattern: /^\S+/, alias: "function" },
	comment: { pattern: /(-- )[^]+/, lookbehind: true, alias: "comment" },
	punctuation: /--/,
});

export const peda: Grammar = {
	section: [
		// `[----registers----]`, `[---START OF CRASH DUMP---]`, any width; may be space-indented
		{ pattern: L(String.raw`${W}*\[-{3,}[A-Za-z][^\]\n]*?-{3,}\]`), alias: "comment" },
		{ pattern: L(String.raw`${W}*\[-{10,}\]`), alias: "comment" },
	],
	legend: { pattern: L(String.raw`Legend:${W}+.*`), alias: "comment" },
	taken: { pattern: /(^[\t ]*)JUMP is taken(?=[\t ]*$)/m, lookbehind: true, alias: "important" },
	"not-taken": { pattern: /(^[\t ]*)JUMP is NOT taken(?=[\t ]*$)/m, lookbehind: true, alias: "comment" },
	"peda-line": rules,
	keyword: {
		pattern: L(
			String.raw`Guessed arguments:|Virtual memory mapping:|Start${W}+End${W}+Perm${W}+Name|Registers contain pattern buffer:|Registers point to pattern buffer:|Pattern buffer found at:|References to pattern buffer found at:|Found \d+ symbols|Detail symbol info|Usage:`,
		),
		alias: "keyword",
	},
	comment: {
		pattern: L(
			String.raw`No argument|Not found|Stepping through, Ctrl-C to stop\.\.\.|Writing ROP gadgets to file: .*|No register contains pattern buffer|No register points to pattern buffer|Pattern buffer not found in memory|Reference to pattern buffer not found in memory|.+ not found in pattern buffer|Set \d+ (?:arguments to program|environment variables?)`,
		),
		alias: "comment",
	},
	"msg-warn": { pattern: L(String.raw`Warning:.*`), alias: "important" },
	"msg-error": { pattern: L(String.raw`Error:${W}.*`), alias: "deleted" },
	"msg-info": { pattern: L(String.raw`Debug:${W}.*`), alias: "comment" },
	// pattern create: `'AAA%AAsAABAA$AAnAACAA-AA(AADAA;AA)…'`
	string: { pattern: L(String.raw`'[^'\n]*'`), alias: "string" },
};
