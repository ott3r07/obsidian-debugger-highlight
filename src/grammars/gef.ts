/**
 * GEF (hugsy/gef) grammar: tool-specific rules only. `index.ts` appends the
 * vanilla-gdb rules after these, so plain GDB lines (breakpoint hits, `x/`,
 * `bt`, `p`, `info …`) are deliberately NOT matched here.
 *
 * Evidence: research/gef/SPEC.md as corrected by research/gef/REVIEW.md.
 *
 * Structure: every top-level rule matches whole lines (or a small block of
 * lines anchored on a unique header) and tokenizes the line with `inside`.
 * Top-level keys are prefixed `gef-` so they never collide with the gdb base
 * grammar's keys in `compose()` (Object.assign would otherwise replace them in
 * place) and so the line wrappers' CSS classes never clash with the token
 * taxonomy in TOKENS.md. Only leaf tokens use taxonomy types.
 *
 * Address kinds follow REVIEW.md §4: stack only from structure (`← $sp` hints,
 * the stack pane, `$sp` register, `[stack]` in scan/search/vmmap), heap from
 * `Chunk(addr=…)`/bin pointers/`Arena(top=…)`/`[heap]`, code from code-pane
 * locations, branch targets, `→ <sym+off> insn` hops and `r?x` vmmap rows.
 * Everything else is plain `address` (or `number` when GEF printed it unpadded,
 * i.e. it is not a mapped address). Never by numeric prefix.
 */
import type { Grammar as PrismGrammar, GrammarValue, TokenObject } from "prismjs";

type Grammar = Record<string, GrammarValue>;
import { BRANCH_MNEMONIC, instruction, re, SRC, lineSrc, trimmed } from "./shared.ts";

const H = SRC.hex;
/** end of line: tolerate trailing blanks and CR */
const EOL = String.raw`[\t ]*\r?$`;
/**
 * GEF location `<sym+off>`: GEF always appends `+off` (hex ≥2024.06, decimal
 * before). Names may be demangled C++ with spaces, parens and one level of `<…>`.
 */
const SYM_LOC = String.raw`<(?:[^<>\n]|<[^<>\n]*>)*?\+[0-9a-fA-F]+>`;
const FLAG3 = String.raw`(?:PREV_INUSE|IS_MMAPPED|NON_MAIN_ARENA)`;

type PatternObj = TokenObject;
const lb = (pattern: RegExp, extra: Partial<PatternObj> = {}): PatternObj => ({ pattern, lookbehind: true, ...extra });
/** A structural wrapper whose whole match is one leaf token of `type` (for a type needed at two rule positions). */
const as = (type: string, pattern: RegExp, lookbehind = false): PatternObj => ({
	pattern,
	lookbehind,
	inside: { [type]: /[\s\S]+/ },
});
/** Object spread that refuses duplicate keys (a duplicate would silently keep the first position but the last value). */
function join(...parts: Grammar[]): Grammar {
	const out: Grammar = {};
	for (const p of parts)
		for (const [k, v] of Object.entries(p)) {
			if (k in out) throw new Error(`gef grammar: duplicate rule key "${k}"`);
			out[k] = v;
		}
	return out;
}

/** hex printed `0x%016x` / `0x%08x` = GEF says it is mapped; anything else is a value */
const value: Grammar = {
	address: re(String.raw`\b0x(?:[0-9a-fA-F]{16}|[0-9a-fA-F]{8})\b`),
	number: lb(/\b0x[0-9a-fA-F]+\b|(^|[^\w.])\d+\b/),
};

const PREFIX = String.raw`(?:(?:lock|rep[a-z]*|bnd|notrack|data16|addr32)[\t ]+)*`;
/**
 * Instruction text after the location (mnemonic first). The operands are
 * wrapped first so the `^`-anchored mnemonic rule cannot re-match an operand
 * (Prism re-runs a rule on the remainder of a fragment after each match).
 */
const insn: Grammar = {
	"gef-bops": lb(re(String.raw`(^[\t ]*${PREFIX}${BRANCH_MNEMONIC}[\t ]+)\S.*$`, "i"), {
		inside: join(
			// branch target, with or without a `<sym>`: `b.le x0, 0x…`, `call 0x… <malloc>`
			{ "gef-target": as("address-code", /(^(?:[^\s,]+,[\t ]*){0,2})0x[0-9a-fA-F]+/, true) },
			instruction as Grammar,
		),
	}),
	"gef-ops": lb(re(String.raw`(^[\t ]*${PREFIX}(?:\.?[a-z][\w.]*|\(bad\))[\t ]+)\S.*$`, "i"), { inside: instruction }),
	"mnemonic-branch": lb(re(String.raw`(^[\t ]*)${PREFIX}${BRANCH_MNEMONIC}(?![\w.])`, "i")),
	mnemonic: lb(re(String.raw`(^[\t ]*)${PREFIX}(?:\.?[a-z][\w.]*|\(bad\))`, "i")),
};

/** `<sym+off> insn` or a bare insn (no symbol), as a dereference-chain hop. */
const insnHop: Grammar = join({ "gef-hopsym": as("symbol", re(`^${SYM_LOC}`)) }, insn);

/** Dereference chain: `0x…  →  0x…  →  "str"` / `→  <sym+off> insn` / `("…"?)`. */
const chain: Grammar = join({
	// a value after an arrow that cannot be an address is a number (as in pwndbg/PEDA)
	"gef-nonaddr": as("number", re(String.raw`(→[\t ]+)${SRC.nonAddr}`), true),
	"address-code": re(String.raw`\b${H}(?=[\t ]+→[\t ]+(?:${SYM_LOC}[\t ]|[.a-z]))`),
	"gef-insn": lb(re(String.raw`(→[\t ]+)(?:${SYM_LOC}[\t ]+\S.*|[.a-z].*)$`), { inside: insnHop }),
	string: [/\("[^\n]*?"\?\)/, /"[^"\n]*"/, /'[^'\n]*'/],
	comment: /\[(?:loop detected|\.\.\.)\]/,
	symbol: re(SRC.angleSym),
}, value, { arrow: /[→←↳]/ });

/** Hexdump bytes `18 fd ff …`: `00` dimmed like GEF does. */
const hexBytes: Grammar = {
	comment: /\b00\b/,
	number: /\b[0-9a-fA-F]{2}\b/,
};
const BYTES = String.raw`(?:[0-9a-fA-F]{2} ){1,31}[0-9a-fA-F]{2}(?=[\t ]|$)`;

/** `0x…     18 fd …    ascii` (hexdump byte, raw stack pane) */
function hexByteLine(addrType: string): Grammar {
	return {
		[addrType]: re(`^${H}`),
		symbol: re(SYM_LOC),
		"gef-bytes": lb(re(String.raw`(^[\t ]+)${BYTES}`), { inside: hexBytes }),
		comment: /\S.*/,
	};
}

const regHint: GrammarValue = {
	pattern: /(^|[^\t ])[\t ]+←[\t ]*\$\w+(?:,[\t ]*\$\w+)*[\t ]*$/,
	lookbehind: true,
	inside: { arrow: /←/, register: /\$\w+/, punctuation: /,/ },
};

/** `[path: ]0x…│+0x0008: chain[\t ← $sp]` */
function derefLine(paneIsStack: boolean): Grammar {
	const slot = String.raw`(^(?:[^\n│]*?: | )?)${H}(?=│)`;
	const stack: PatternObj[] = [
		lb(re(String.raw`(^\[stack\]: )${H}`)),
		lb(re(`${slot}(?=[^\\n]*←[^\\n]*\\$(?:[re]?sp|[re]?bp|x29|fp|sp)\\b)`)),
	];
	if (paneIsStack) stack.push(lb(re(slot)));
	return join({
		"address-stack": stack,
		"address-heap": lb(re(String.raw`(^\[heap\]: )${H}`)),
		"gef-slot": as("address", re(slot), true),
		path: /^\S.*?(?=:[\t ]*$)/,
		offset: lb(re(String.raw`(│)[+-]${H}`)),
		punctuation: /^│|^:/,
		"gef-reghint": regHint,
	}, chain);
}

/** `0x…│+0x0008   [<sym+0000> ]0x…[   ascii]` (hexdump word/dword/qword, memory pane) */
const hexWordLine: Grammar = {
	address: [re(`^${H}`)],
	offset: lb(re(String.raw`(│)\+${H}`)),
	punctuation: /│/,
	symbol: re(SYM_LOC),
	// raw memory words: GEF pads every value, so "mapped" can't be inferred here
	"gef-val": as("number", re(String.raw`(^[\t ]+)${H}`), true),
	comment: /\S.*/,
};

const derefStack = derefLine(true);
const derefAny = derefLine(false);

/** Chunk(addr=…, size=…, flags=…) — flags carry state only in the ≤2022.06 format */
const chunk: Grammar = {
	"heap-chunk": /^Chunk/,
	"address-heap": lb(re(`(addr=)${H}`)),
	number: lb(re(`(size=)${H}`)),
	"gef-flags3": {
		// ≥2023.06: all three names always printed, state only in colour → neutral
		pattern: re(`${FLAG3}(?: \\| ${FLAG3}){2}`),
		inside: { keyword: /\w+/, punctuation: /\|/ },
	},
	"flag-clear": /!\s*PREV_INUSE/,
	"flag-set": re(FLAG3),
	punctuation: /[(),=|]/,
};

const chunkRe = re(String.raw`\bChunk\(addr=${H}, size=${H}, flags=[^)\n]*\)`);

const heapChain: Grammar = {
	bin: /^(?:Tcachebins|Fastbins)(?=\[)/,
	"gef-chunk": { pattern: chunkRe, inside: chunk },
	keyword: /\btop chunk\b/,
	comment: re(String.raw`\[(?:loop detected|incorrect fastbin_index|Corrupted chunk at ${H})\]`),
	number: lb(re(String.raw`(\b(?:idx|size|count)=)(?:${H}|\d+)`)),
	arrow: /[→←]/,
	"gef-null": as("number", /\b0x0+\b/),
	address: re(H),
	punctuation: /[[\],=]/,
};

const message: Grammar = {
	"msg-ok": /^\[\+\]/,
	"msg-info": /^\[[*=]\]/,
	"msg-error": /^\[!\]/,
	bin: /\b(?:unsorted|small|large|fast)_bins\[\d+\]/,
	"address-heap": lb(re(String.raw`(\b(?:fw|bk)=)${H}`)),
	"gef-range-stack": lb(re(String.raw`(In '\[stack\]'\()${H}-${H}`), { inside: { "address-stack": re(H), punctuation: /-/ } }),
	"gef-range-heap": lb(re(String.raw`(In '\[heap\]'\()${H}-${H}`), { inside: { "address-heap": re(H), punctuation: /-/ } }),
	path: lb(/(\bIn ')[^'\n]+(?=')/),
	perm: lb(/(permission=)[r-][w-][x-]p?/),
	number: [lb(re(`(value is )${H}`)), /\b\d+\b/],
	string: [/'[^'\n]*'/, /`[^`\n]*`/, /"[^"\n]*"/],
	address: re(H),
};

const sourceText: Grammar = {
	comment: /\/\/.*|\/\*.*?(?:\*\/|$)/,
	string: [/"(?:[^"\\\n]|\\.)*"/, /'(?:[^'\\\n]|\\.){1,4}'/],
};

const KV_LABELS = [
	"Page",
	"Permissions",
	"Pathname",
	String.raw`Offset \(from page\)`,
	String.raw`Offset \(from segment\)`,
	"Inode",
	"Segment",
	"Symbol",
	"Chunk size",
	"Usable size",
	"Previous chunk size",
	"Forward pointer",
	"Backward pointer",
	"Arena Address",
	"Magic",
	"Class",
	"Endianness",
	"Version",
	"OS ABI",
	"ABI Version",
	"Type",
	"Machine",
	"Program Header Table",
	"Section Header Table",
	"Header Table",
	"ELF Version",
	"Header size",
	"Entry point",
].join("|");

const kv: Grammar = join({
	// value rules that depend on the label run before the label is split off
	"address-code": lb(re(String.raw`(^Entry point[\t ]*:[\t ]*)${H}`)),
	perm: lb(/(^Permissions:[\t ]*)[r-][w-][x-]p?/),
	path: lb(/(^Pathname:[\t ]*)\S.*/),
	symbol: [lb(/(^Symbol:[\t ]*)\S.*/), lb(/(^Segment:[\t ]*)\S+/)],
	address: lb(re(String.raw`(^(?:Forward|Backward) pointer:[\t ]*)${H}`)),
	number: lb(re(String.raw`(^(?:Program Header Table|Section Header Table|Header Table)[\t ]*:[\t ]*)${H}`)),
	"gef-magic": lb(/(^Magic[\t ]*:[\t ]*)(?:[0-9a-fA-F]{2} )*[0-9a-fA-F]{2}/, { inside: hexBytes }),
	keyword: [re(String.raw`^(?:${KV_LABELS})(?=[\t ]*:)`), /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/],
	punctuation: /^[\t ]*:/,
	arrow: /→/,
}, { "gef-num": { pattern: /[\s\S]+/, inside: value } });

const elfTable: Grammar = {
	symbol: lb(/(^[\t ]*\[[\t ]*\d+\][\t ]+)(?:\.[\w.-]+|[a-z][\w-]*\.[\w.-]+)/),
	offset: /^[\t ]*\[[\t ]*(?:#|\d+)\]/,
	keyword: /\b(?:PT|SHT|PF|SHF)_\w+(?:\|(?:PF|SHF)_\w+)*|\b(?:UNKN)\b/,
	number: /\b(?:0x[0-9a-fA-F]+|\d+)\b/,
};

const checksec: Grammar = {
	keyword: [/^(?:Canary|NX|PIE|Fortify|RelRO)\b/, /\bPartial\b/],
	enabled: /✓|\bFull\b/,
	disabled: /✘/,
	number: re(H),
	punctuation: /:/,
};

const vmmapRow = (end: string): GrammarValue =>
	re(String.raw`${H}(?=(?: ${H}){1,2} ${end})`);
const PERM = String.raw`[r-][w-][x-]p?`;
const vmmap: Grammar = {
	"address-stack": vmmapRow(String.raw`${PERM}[\t ]+\[stack[^\]\n]*\]${EOL}`),
	"address-heap": vmmapRow(String.raw`${PERM}[\t ]+\[heap\]${EOL}`),
	"address-code": vmmapRow(String.raw`[r-][w-]xp?(?![\w-])`),
	"address-rodata": vmmapRow(String.raw`r--p?(?![\w-])`),
	"address-data": vmmapRow(String.raw`[r-]w-p?(?![\w-])`),
	address: vmmapRow(PERM),
	number: re(H),
	perm: lb(re(String.raw`(^|[\t ])${PERM}(?=[\t ]|$)`)),
	path: /\S.*/,
};

const threads: Grammar = {
	offset: /^\[#\d+\]/,
	number: lb(/(\bId )\d+/),
	string: /"[^"\n]*"/,
	"address-code": re(String.raw`${H}(?= in (?!\?\? ))`),
	address: re(H),
	symbol: lb(/(\bin )\S+(?= \(\))/),
	signal: /\bSIG[A-Z0-9]+\b/,
	keyword: [/\b(?:stopped|running|exited)\b/, lb(/(reason: ).+/)],
	punctuation: /[(),:]/,
};

const callArgs: Grammar = join({ symbol: [/^[^\s(]+/, re(SRC.angleSym)], string: /"[^"\n]*"/ }, value, {
	punctuation: /[(),=]/,
});

const trace: Grammar = {
	offset: /^\[#\d+\]/,
	"address-code": lb(re(`(^[\\t ]+)${H}`)),
	"gef-call": lb(/(→[\t ]+)[^\s(<]+\(.*\)[\t ]*$/, { inside: callArgs }),
	"gef-insn": lb(/(→[\t ]+)\S.*/, { inside: insnHop }),
	arrow: /→/,
};

const codeLoc: Grammar = {
	keyword: /●/,
	current: /→/,
	arrow: /↳/,
	"address-code": re(H),
	symbol: re(SYM_LOC),
	number: /\b[0-9a-fA-F]{2,}(?:\.\.\.)?/,
};

const codeLine: Grammar = join({
	"gef-branch": lb(/([\t ])(?:TAKEN|NOT taken)(?: \[Reason: [^\n]*\])?[\t ]*$/, {
		inside: { "not-taken": /^NOT taken/, taken: /^TAKEN/, comment: /\[Reason: .*\]/ },
	}),
	"gef-loc": {
		pattern: re(String.raw`^[●→↳\t ]*${H}(?: [0-9a-fA-F]{2,}(?:\.\.\.)?(?=[\t ]{2}))?(?:[\t ]+${SYM_LOC}(?=[\t ]))?`),
		inside: codeLoc,
	},
}, insn);

const argsBlock: Grammar = {
	"address-code": lb(re(`(^\\*)${H}`, "m")),
	symbol: /^[^\s(*]+(?= \()/m,
	"gef-argline": {
		pattern: /^ {3}\S.*$/m,
		inside: join({
			register: lb(/(^ {3})\$\w+/),
			"gef-name": { pattern: /^ {3}[^=\n]+?(?= = )/, inside: { punctuation: /[[\]+]/, number: /0x[0-9a-fA-F]+/ } },
			punctuation: /^ = |,[\t ]*$/,
		}, chain),
	},
	keyword: /<void>/,
	punctuation: /[()*]/,
};

const configLine: Grammar = {
	keyword: [/^[\w.-]+(?: [\w.-]+)?(?= \(\w+\) = )/, /\b(?:True|False|None)\b/],
	comment: /\(\w+\)(?= = )/,
	punctuation: / = /,
	string: [/"[^"\n]*"/, /'[^'\n]*'/],
	number: lb(/(^|[^\w.])-?(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?)\b(?![\w.])/),
};

/** Builds whole-line multiline regexes; trailing blanks stay outside (see shared `lineSrc`). */
const line = (body: string, flags = "m") => re(lineSrc(body), flags);

const SEARCH_HIT = String.raw`[\t ]+${H} - ${H}[\t ]+→[\t ]+[^\n]*`;
function searchBlock(kind: "stack" | "heap"): PatternObj {
	return {
		pattern: re(String.raw`^\[\+\] In '\[${kind}\]'\([^\n]*(?:\n${SEARCH_HIT})+`, "m"),
		inside: {
			"gef-msg": { pattern: /^\[\+\].*/m, inside: message },
			"gef-hit": {
				pattern: re(`^${SEARCH_HIT}`, "m"),
				inside: { [`address-${kind}`]: re(H), arrow: /→/, string: /".*"/, punctuation: /-/ },
			},
		},
	};
}

/** a dereference/telescope row `[path: ]0x…│+0x0008: …` (no line end) */
const DEREF_ROW = String.raw`(?:[^\n│]*?: | )?${H}│[+-]${H}:[^\n]*`;
/** a dereference row whose slot is the stack/frame pointer (`… ← $rsp`) */
const DEREF_SP_ROW = String.raw`(?:[^\n│]*?: | )?${H}│[+-]${H}:[^\n]*←[^\n]*\$(?:[re]?sp|[re]?bp|x29|fp|sp)\b[^\n]*`;
/** pane banner: current `──── stack ────` and ≤2020 `────[ stack ]────` */
const banner = (title: string) => String.raw`─* ${title} ─+|─+\[ ${title} \]─*`;

const rules: Grammar = {
	"gef-prompt": {
		pattern: line(String.raw`(?:\((?:qemu|remote|rr|core)\) )*gef➤.*`),
		inside: { prompt: /^(?:\(\w+\) )*gef➤/, command: /\S(?:.*\S)?/ },
	},

	// ── stack pane: a block anchored on its header, so slot addresses are stack
	"gef-stack-pane": {
		pattern: re(
			String.raw`^(?:${banner("stack")})${EOL}(?:\n(?:${H}│[+-]${H}:[^\n]*|${H}[\t ]{2,}${BYTES}[^\n]*))+`,
			"m",
		),
		inside: {
			section: /^─.*/,
			"gef-deref": { pattern: re(String.raw`^${H}│.*`, "m"), inside: derefStack },
			"gef-hex": { pattern: re(`^${H}.*`, "m"), inside: hexByteLine("address-stack") },
		},
	},

	// `dereference $sp` without a pane banner: the rows from the `← $sp` slot on are
	// consecutive slots of the same stack, so all of them are stack (not just the hinted one)
	"gef-deref-sp": {
		pattern: re(String.raw`^${DEREF_SP_ROW}(?:\r?\n${DEREF_ROW})*`, "m"),
		inside: { "gef-deref": { pattern: re(`^${DEREF_ROW}`, "m"), inside: derefStack } },
	},

	section: [
		line(String.raw`─* \S.*? ─+`),
		line(banner(String.raw`[^\]\n]+`)),
		line(String.raw`─{2,}`),
		line(String.raw`== Chunk distribution by \w+ ==`),
	],
	legend: line(String.raw`\[ Legend:[\t ]+.*\]`),

	// ── registers
	"gef-flags": {
		pattern: line(String.raw`(?:\$\w+[\t ]*|Flags):[\t ]*\[[^\n]*\]`),
		inside: {
			register: /^\$\w+/,
			keyword: /^Flags\b/,
			"flag-set": /\b[A-Z][A-Z0-9]*(?:\[\d+\])?(?![\w[])/,
			"flag-clear": /\b[a-z][a-z0-9]*(?:\[\d+\])?(?![\w[])/,
			punctuation: /[[\]:]/,
		},
	},
	"gef-regs-multi": {
		// x86 segment line `$cs: 0x33 $ss: 0x2b …` and context.show_registers_raw
		pattern: line(String.raw`(?:\$\w+[\t ]*: ${H}[\t ]*){2,}`),
		inside: {
			"address-stack": lb(re(String.raw`(\$[re]?sp[\t ]*:[\t ]*)${H}`)),
			"address-code": lb(re(String.raw`(\$(?:[re]?ip|pc|lr)[\t ]*:[\t ]*)${H}`)),
			register: /\$\w+/,
			punctuation: /:/,
			...value,
		},
	},
	"gef-reg": {
		pattern: line(String.raw`\$[a-z][a-z0-9_]*[\t ]*: .*`),
		inside: join({
			"address-stack": lb(re(String.raw`(^\$[re]?sp[\t ]*:[\t ]*)${H}`)),
			// the program counter / link register hold code addresses, whatever they point to
			"gef-pc": as("address-code", re(String.raw`(^\$(?:[re]?ip|pc|lr)[\t ]*:[\t ]*)${H}`), true),
			register: /^\$\w+/,
			punctuation: lb(/(^[\t ]*):/),
			"gef-unavail": as("comment", /\bno value\b/),
		}, chain),
	},

	// ── dereference / telescope / scan (outside the stack pane)
	"gef-deref": {
		pattern: line(String.raw`(?:[^\n│]*?: | )?${H}│[+-]${H}:.*`),
		inside: derefAny,
	},
	"gef-hexword": {
		pattern: line(String.raw`${H}│\+${H}[\t ]+(?:${SYM_LOC}[\t ]+)?${H}(?:[\t ]+.*)?`),
		inside: hexWordLine,
	},
	"gef-hexbyte": {
		pattern: line(String.raw`${H}(?:[\t ]+${SYM_LOC})?[\t ]{2,}${BYTES}(?:[\t ]+.*)?`),
		inside: hexByteLine("address"),
	},

	// ── code pane (also the `↳` branch-target preview)
	"gef-code": {
		pattern: line(
			// not a hexdump row (r2 `px`: `0x100000460  ff03 02d1 fd7b …`)
			String.raw`[●\t ]*(?:[→↳][\t ]*)?${H}(?: [0-9a-fA-F]{2,}(?:\.\.\.)?(?=[\t ]{2}))?(?:[\t ]+${SYM_LOC}[\t ]+|[\t ]{2,})(?![0-9a-f]{4}(?:[\t ]+[0-9a-f]{4}){2})(?:\.?[a-z][\w.]*|\(bad\))(?:[\t ]+.*)?`,
		),
		inside: codeLine,
	},

	// ── source pane
	"gef-source": {
		pattern: line(String.raw`[● ](?:→|[\t ])[\t ]*\d+(?:[\t ]+.*)?`),
		inside: join({ keyword: /^●/, current: /→/, number: lb(/(^[●→\t ]*)\d+/) }, sourceText),
	},
	"gef-annot": {
		pattern: line(String.raw`[\t ]+// \w+=.*`),
		inside: join({ "gef-slashes": as("comment", /(^[\t ]*)\/\//, true), punctuation: /=|, / }, chain),
	},

	// ── arguments pane (block: `target (` … `)` or `name (<void>)`)
	"gef-args": {
		pattern: re(String.raw`^[^\s(]+ \((?:<void>\)|[\t ]*\r?\n(?: {3}\S.*\r?\n)*\))(?=[\t ]*\r?$)`, "m"),
		inside: argsBlock,
	},

	// ── threads / trace panes
	"gef-thread": {
		pattern: line(String.raw`\[#\d+\] Id \d+, (?:Name: "[^"\n]*", )?(?:stopped|running|exited)\b.*`),
		inside: threads,
	},
	"gef-trace": {
		pattern: line(String.raw`\[#\d+\] ${H} →.*`),
		inside: trace,
	},

	// ── heap
	"gef-heap": {
		pattern: line(String.raw`(?:Tcachebins\[|Fastbins\[|[\t ]*→[\t ]+Chunk\(|Chunk\(addr=).*`),
		inside: heapChain,
	},
	"gef-peek": {
		pattern: line(String.raw`[\t ]+\[${H}[\t ]{2,}${BYTES}.*\]`),
		inside: {
			punctuation: /^[\t ]*\[|\]$/,
			"address-heap": re(H),
			"gef-bytes": lb(re(String.raw`(^[\t ]+)${BYTES}`), { inside: hexBytes }),
			comment: /\S.*/,
		},
	},
	"gef-arena": {
		pattern: line(String.raw`Arena\(base=.*\)`),
		inside: {
			"heap-chunk": /^Arena/,
			"address-heap": lb(re(`(top=)${H}`)),
			number: [lb(re(String.raw`((?:mem|mempeak|system_mem)=)(?:${H}|\d+)`))],
			address: re(H),
			punctuation: /[(),=]/,
		},
	},
	"gef-chunkflag": {
		pattern: line(String.raw`${FLAG3} flag: (?:On|Off)`),
		inside: {
			"flag-set": re(`^${FLAG3}(?= flag: On)`),
			"flag-clear": re(`^${FLAG3}`),
			enabled: /\bOn\b/,
			disabled: /\bOff\b/,
		},
	},
	"gef-flagline": {
		pattern: line(String.raw`${FLAG3}(?: \| ${FLAG3}){2}`),
		inside: { keyword: /\w+/, punctuation: /\|/ },
	},
	"gef-heapsum": [
		as("keyword", line(String.raw`ChunkBytes[\t ]+Count.*|Flag[\t ]+TotalCount.*`)),
		{
			pattern: line(String.raw`\d+[\t ]+\d+[\t ]+\d+(?:[\t ]+.*)?|${FLAG3}[\t ]+\d+[\t ]+\d+`),
			inside: { keyword: re(FLAG3), number: /\b\d+\b/ },
		},
	],
	"gef-tcache-empty": as("comment", line("All tcachebins are empty")),

	// ── search-pattern blocks `  0x… - 0x…  →   "match"`; under `[+] In '[stack]'(…)`
	// (or `[heap]`) the hit addresses are known to be stack (heap)
	"gef-search-stack": searchBlock("stack"),
	"gef-search-heap": searchBlock("heap"),
	// ── messages `[+] [*] [!] [=]`
	"gef-msg": { pattern: line(String.raw`\[[+*!=]\] .*`), inside: message },

	// ── vmmap
	"gef-vmmap-head": as("keyword", line(String.raw`Start[\t ]+End[\t ]+Offset[\t ]+Perm[\t ]+Path`)),
	"gef-vmmap": {
		pattern: line(String.raw`${H} ${H} ${H} ${PERM}(?:[\t ]+.*)?`),
		inside: vmmap,
	},
	"gef-filter": {
		pattern: line(String.raw`\[(?:name|addr) = .*\]`),
		inside: {
			keyword: /^\[(?:name|addr)\b/,
			string: [/'[^'\n]*'/, /`[^`\n]*`/],
			address: re(H),
			punctuation: /[[\]=()]/,
		},
	},

	// ── checksec / got / xinfo / elf-info / heap-chunk details
	"gef-checksec": {
		pattern: line(String.raw`(?:Canary|NX|PIE|Fortify|RelRO)[\t ]*: .*`),
		inside: checksec,
	},
	"gef-gotprot": {
		pattern: line(String.raw`GOT protection: .*`),
		inside: {
			keyword: [/^GOT (?:protection|functions)\b/, /\bGOT functions\b/, /\bPartial RelRO\b/],
			enabled: /\bFull RelRO\b/,
			disabled: /\bNo RelRO\b/,
			number: /\b\d+\b/,
			punctuation: /[:|]/,
		},
	},
	"gef-got": {
		pattern: line(String.raw`\[${H}\] \S+[\t ]+→[\t ]+${H}`),
		inside: {
			punctuation: /^\[|\]/,
			"gef-null": as("number", /\b0x0+$/),
			address: re(H),
			arrow: /→/,
			symbol: /\S+/,
		},
	},
	"gef-kv": {
		pattern: line(String.raw`(?:${KV_LABELS})[\t ]*: .*`),
		inside: kv,
	},
	"gef-elftable": {
		pattern: line(String.raw`[\t ]+\[[\t ]*(?:#|\d+)\] .*`),
		inside: elfTable,
	},

	// ── search-pattern hits `  0x… - 0x…  →   "match"`
	"gef-search": {
		pattern: line(String.raw`[\t ]+${H} - ${H}[\t ]+→[\t ]+.*`),
		inside: { address: re(H), arrow: /→/, string: /".*"/, punctuation: /-/ },
	},

	// ── gef config listing / single-key description
	"gef-config": {
		pattern: line(String.raw`[\w.-]+(?: [\w.-]+)? \(\w+\) = .*`),
		inside: configLine,
	},
	"gef-descr": {
		pattern: /^Description:[\t ]*\r?\n(?:(?:\t| {2,})\S.*(?:\r?\n|$))+/m,
		inside: { keyword: /^Description:/, comment: /^[\t ]+\S.*/m },
	},

	// ── misc one-liners
	"gef-pattern": as("string", line(String.raw`aaaa(?:aaaa)?baaa[a-z]*`)),
	"gef-banner": as("comment", line(String.raw`GEF for \w+ ready, .*|\d+ commands loaded\b.*`)),
	"gef-aslr": {
		pattern: line(String.raw`ASLR is currently (?:enabled|disabled)`),
		inside: { enabled: /\benabled\b/, disabled: /\bdisabled\b/, keyword: /^ASLR\b/ },
	},
	"gef-fmtstr": {
		pattern: line(String.raw`Possible insecure format string: .*|Reason: Call to .*`),
		inside: {
			"msg-warn": /^(?:Possible insecure format string|Reason)(?=:)/,
			"address-stack": lb(re(String.raw`(\bpage )${H}(?= \(\[stack\]\))`)),
			path: /\[(?:stack|heap)\]/,
			string: /'[^'\n]*'/,
			arrow: /→/,
			address: re(H),
		},
	},
	"gef-pieinfo": as("keyword", line(String.raw`VNum[\t ]+Num[\t ]+Addr`)),
};

/** TOKENS.md type → stock-Prism alias. */
const ALIAS: Record<string, string> = {
	prompt: "keyword", command: "function", section: "comment", legend: "comment", register: "variable",
	"flag-set": "important", "flag-clear": "comment", address: "number", "address-stack": "number",
	"address-heap": "number", "address-code": "number", "address-data": "number", "address-rodata": "number",
	number: "number", symbol: "function", mnemonic: "keyword", "mnemonic-branch": "keyword", current: "important",
	arrow: "operator", string: "string", comment: "comment", offset: "comment", taken: "important",
	"not-taken": "comment", perm: "keyword", path: "string", "msg-info": "comment", "msg-ok": "inserted",
	"msg-warn": "important", "msg-error": "deleted", signal: "important", keyword: "keyword", enabled: "inserted",
	disabled: "deleted", punctuation: "punctuation", "heap-chunk": "class-name", bin: "class-name",
};

/** Copy the grammar, normalising every rule to an object carrying its taxonomy alias. */
function withAliases(g: Grammar, memo = new Map<Grammar, Grammar>()): Grammar {
	const done = memo.get(g);
	if (done) return done;
	const out: Grammar = {};
	memo.set(g, out);
	for (const [type, v] of Object.entries(g)) {
		if (v === undefined) continue;
		const one = (x: RegExp | PatternObj): PatternObj => {
			const o: PatternObj = x instanceof RegExp ? { pattern: x } : { ...x };
			// every rule is line-scoped: `m` lets `$` stop before a stray `\r` (CRLF pastes)
			if (!o.pattern.multiline) o.pattern = new RegExp(o.pattern.source, o.pattern.flags + "m");
			const alias = ALIAS[type];
			if (!o.alias && alias && alias !== type) o.alias = alias;
			if (o.inside) o.inside = withAliases(o.inside as Grammar, memo);
			return o;
		};
		out[type] = Array.isArray(v) ? v.map(one) : one(v);
	}
	return out;
}

/** Every top-level wrapper's inside first splits off trailing blanks (shared `trimmed`). */
function trimAll(g: Grammar): Grammar {
	const one = (v: RegExp | PatternObj): RegExp | PatternObj =>
		v instanceof RegExp || !v.inside ? v : { ...v, inside: trimmed("gef", v.inside) };
	return Object.fromEntries(
		Object.entries(g).map(([k, v]) => [k, Array.isArray(v) ? v.map(one) : one(v)]),
	);
}

export const gef: PrismGrammar = withAliases(trimAll(rules));
