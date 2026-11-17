/**
 * pwndbg grammar: tool-specific rules only. `index.ts` appends the vanilla-gdb
 * rules after these (`compose(pwndbg, gdb)`), so plain GDB lines (breakpoint
 * hits, `x/`, `bt`, `p`, `info …`) are deliberately NOT matched here.
 *
 * Evidence: research/pwndbg/SPEC.md as corrected by research/pwndbg/REVIEW.md
 * (the review wins: §2.3 corrected regexes, §3 real-world formats, §6 address
 * heuristics), the captures, the reviewer's local captures and the real-world
 * samples in research/pwndbg/review_samples/.
 *
 * Formats covered, current and historical:
 *   banners `───[ REGISTERS / show-flags off / … ]───` (≥2022-09), bare
 *   `───[ DISASM ]───` (2018-2022), `[───REGISTERS───]` (≤2017, `CODE` pane);
 *   LEGEND with `RWX` (≤2024.02) or `WX`; registers incl. compact `⏎`/`↪`;
 *   disasm with `►`/`b►`/`b+`, `✔ ✘ ?`, opcode bytes, branch-art column,
 *   annotations; telescope with register or frame-offset column; backtrace
 *   pane (current, `f 0` ≤2023.03, no-`0x` ≤2020.07, padded columns);
 *   source pane; heap (struct dump ≤2019, `Free chunk (tcache)`, current);
 *   bins (negative counts, `[corrupted]`, `FD:`/`BK:`); vis; hexdump; vmmap
 *   (+`--gaps`, old column layout); checksec (current + pwntools-style);
 *   got/plt/search/rop/canary/tls/xinfo/elfsections/procinfo/cyclic/…
 *
 * Structure: every top-level rule matches whole lines (or a block anchored on
 * a unique header line) and tokenizes with `inside`. Top-level keys are
 * prefixed `pwndbg-` so they never collide with the gdb base grammar's keys in
 * `compose()`; wrapper tokens carry no style. Only leaf tokens use TOKENS.md
 * types (aliases are added by `withAliases`).
 *
 * Address kinds (REVIEW §6), never by numeric prefix:
 *   - stack: SP register value, telescope rows in the STACK pane or with a
 *     sp/bp/fp register label or a frame offset (`│-0c8`), `{var}` links,
 *     `[stack]` search hits / vmmap rows, xinfo stack offsets;
 *   - heap: `Addr:` of heap chunks, vis rows, bins chain heads (and tcache
 *     links), `[heap]` search hits / vmmap rows. NOT fd/bk (they point into
 *     main_arena for small/large/unsorted chunks);
 *   - code: disasm addresses, branch targets, backtrace frames, PC register,
 *     chain links dereferencing to an instruction, executable vmmap rows;
 *   - plain `address` for other dereferenced chain links; a bare hex value
 *     pwndbg could not dereference is a `number`.
 */
import type { Grammar as PrismGrammar, GrammarValue, TokenObject } from "prismjs";
import { BRANCH_MNEMONIC, REGISTER_NAMES, SRC, lineSrc, trimmed, instruction, re } from "./shared.ts";

type Grammar = Record<string, GrammarValue>;
type PatternObj = TokenObject;

const H = SRC.hex;
const W = String.raw`[\t ]`;
const SYM = SRC.angleSym;
/** end of a whole line: trailing blanks allowed (`$` with `m` also stops before `\r`) */
const EOL = String.raw`[\t ]*$`;
/** whole-line pattern; trailing blanks stay outside (see shared `lineSrc`) */
const line = (body: string) => re(lineSrc(body), "m");

const lb = (pattern: RegExp, extra: Partial<PatternObj> = {}): PatternObj => ({ pattern, lookbehind: true, ...extra });
/** A structural wrapper whose whole match is one leaf token of `type` (to use a type at two rule positions). */
const as = (type: string, pattern: RegExp, lookbehind = false): PatternObj => ({
	pattern,
	lookbehind,
	inside: { [type]: /[\s\S]+/ },
});
/** Object spread that refuses duplicate keys (a duplicate silently keeps the first position but the last value). */
function join(...parts: Grammar[]): Grammar {
	const out: Grammar = {};
	for (const p of parts)
		for (const [k, v] of Object.entries(p)) {
			if (k in out) throw new Error(`pwndbg grammar: duplicate rule key "${k}"`);
			out[k] = v;
		}
	return out;
}

// ── shared fragments ─────────────────────────────────────────────────────────

/** chain symbol `(main+28)`, `(free@got[plt])`, `(op<<(int)+5)` — not `(0x… + 0x918)` / `('AAAA')` */
const PSYM = String.raw`\((?!0x|-?\d|')[^()\s]+(?:\([^()\n]*\)[^()\s]*)?\)`;
/** stack-variable name `{argv}`, `{big+0x8}` */
const VAR = String.raw`\{[A-Za-z_$][^{}\n]*\}`;
/** Python `repr()` string */
const PYSTR = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"`;
const ARROW = String.raw`(?:—▸|◂—)`;
/** what may follow a chain link before the next arrow */
const LINK_TAIL = String.raw`(?:${W}+(?:${PSYM}|${VAR}))*`;
/** an instruction starts here (mnemonic, `.inst`, `(bad)`) */
const INSN_START = String.raw`(?:\.?[a-z]|\(bad\))`;
/** `—▸ ...` (dereference limit) — not the `...` inside a truncated string */
const ELLIPSIS = lb(/(^|[\t ])\.\.\.(?![^\t ])/);
/**
 * Rules whose `^` means the start of the fragment, not of a line: they must not
 * get the `m` flag (`ELLIPSIS` is not preceded by a newline inside its fragment).
 */
const FRAGMENT_START = new WeakSet<RegExp>([ELLIPSIS.pattern]);

const flagsInside: Grammar = {
	number: lb(/(:)\d+/),
	punctuation: /[[\]:]/,
	"flag-set": /\b[A-Z][A-Z0-9]*\b/,
	"flag-clear": /\b[a-z][a-z0-9]*\b/,
};
const FLAGS = String.raw`\[ (?:[A-Za-z]+(?::\d+)? )*\]`;

// ── instructions ─────────────────────────────────────────────────────────────

const PREFIX = String.raw`(?:(?:lock|rep[a-z]*|bnd|notrack|data16|addr32)${W}+)*`;
const MNEM = String.raw`(?:\.?[a-z][\w.]*|\(bad\))`;
const NOT_OPERAND_WORD = String.raw`(?!(?:${REGISTER_NAMES}|byte|d?word|qword|tbyte|fword|[xyz]mmword|ptr|short|far|near)\b)`;
const TARGET_NAME = String.raw`[A-Za-z_.$][\w.$@]*(?:[+-](?:0x[0-9a-fA-F]+|\d+))?`;
/** up to two leading operands before a branch target (`cbz x0, T`, `tbz w0, #3, T`) */
const PRE_OPS = String.raw`(^(?:[^\s,]+,${W}*){0,2})`;

/**
 * Instruction text (mnemonic first). Operands are wrapped first, so the
 * `^`-anchored mnemonic rule cannot re-match an operand fragment.
 */
const insn: Grammar = {
	"pwndbg-bops": lb(re(String.raw`(^${W}*${PREFIX}${BRANCH_MNEMONIC}${W}+)\S.*`, "i"), {
		inside: join(
			{
				"pwndbg-tgt-addr": as("address-code", re(String.raw`${PRE_OPS}${H}(?![\w.])`), true),
				"pwndbg-tgt-sym": as(
					"symbol",
					re(String.raw`${PRE_OPS}${NOT_OPERAND_WORD}${TARGET_NAME}(?=${W}*(?:$|<|\/\*))`, "i"),
					true,
				),
			},
			instruction as Grammar,
		),
	}),
	"pwndbg-ops": lb(re(String.raw`(^${W}*${PREFIX}${MNEM}${W}+)\S.*`, "i"), { inside: instruction }),
	"mnemonic-branch": lb(re(String.raw`(^${W}*)${PREFIX}${BRANCH_MNEMONIC}(?![\w.])`, "i")),
	mnemonic: lb(re(String.raw`(^${W}*)${PREFIX}${MNEM}`, "i")),
};

// ── pointer chains ───────────────────────────────────────────────────────────

/** the value after `◂—` (or a search hit's value): instruction, string, int with repr/comment, `???` */
const final: Grammar = {
	"pwndbg-insn": { pattern: re(String.raw`^${INSN_START}.*`), inside: insn },
	comment: [/\/\*.*?\*\//, /\?\?\?/, ELLIPSIS],
	string: { pattern: re(PYSTR), greedy: true },
	address: re(String.raw`${H}(?=${W}+${PSYM})`),
	symbol: [re(PSYM), re(VAR)],
	number: /-?\b(?:0x[0-9a-fA-F]+|\d+)\b/,
	punctuation: /[()]/,
};

/**
 * `0x… (sym) {var} —▸ 0x… ◂— final`. A link that dereferences to an
 * instruction is code; one carrying a `{var}` is a stack variable; other
 * dereferenced links are plain addresses; a hex value nothing follows (pwndbg
 * could not dereference it) is a number.
 */
const chain: Grammar = {
	// link kinds look ahead past the arrow, so they run before the final value is split off
	"address-code": re(String.raw`${H}(?=${LINK_TAIL}${W}+◂—${W}+${INSN_START})`),
	"address-stack": re(String.raw`${H}(?=(?:${W}+${PSYM})?${W}+${VAR})`),
	address: re(String.raw`${H}(?=${LINK_TAIL}${W}+${ARROW}|${W}+${PSYM})`),
	"pwndbg-final": lb(/(◂—[\t ]+)\S.*/, { inside: final }),
	symbol: [re(PSYM), re(VAR)],
	arrow: re(ARROW),
	string: { pattern: re(PYSTR), greedy: true },
	comment: [ELLIPSIS, /\/\*.*?\*\//],
	number: /-?\b(?:0x[0-9a-fA-F]+|\d+)\b/,
	punctuation: /[()]/,
};

// ── registers ────────────────────────────────────────────────────────────────

const UREG = String.raw`[A-Z][A-Z0-9_]{0,9}`;
const REG_VALUE = String.raw`(?:${H}|-?\d+|⏎)(?![\w.])`;
const regGroup: Grammar = join(
	{
		"pwndbg-flags": { pattern: re(FLAGS), inside: flagsInside },
		"pwndbg-sp": as("address-stack", re(String.raw`(^↪?[* ]?[RE]?SP${W}+)${H}`), true),
		"pwndbg-pc": as("address-code", re(String.raw`(^↪?[* ]?(?:[RE]?IP|PC)${W}+)${H}`), true),
		"pwndbg-overflow": as("arrow", /^↪/),
		current: lb(/(^↪?)\*/),
		register: lb(re(String.raw`(^[↪* ]*)${UREG}`)),
		"pwndbg-ret": as("comment", /⏎/),
	},
	chain,
);
const registerLine: Grammar = join(
	{
		// compact regs: a second register column after 2+ blanks
		"pwndbg-reg2": lb(re(String.raw`(\S${W}{2,})[* ](?=${UREG}${W}+${REG_VALUE})[^\n]*`), { inside: regGroup }),
	},
	regGroup,
);

// ── disassembly ──────────────────────────────────────────────────────────────

const ART_CH = "┌└├│╎▲<>─";
const DIS_HEAD = [
	String.raw`${W}*(?:(?:b[►+]|[►_])${W}+)?${H}`,
	String.raw`(?:${W}+(?:[0-9a-f]{2} )*[0-9a-f]{2}(?:\.\.\.)?(?=${W}{2}))?`, // nearpc-num-opcode-bytes
	String.raw`(?:${W}+${SYM})?`,
	String.raw`${W}+(?:[${ART_CH}][${ART_CH} ]*?${W}+)?`, // branch-visualization column
	String.raw`(?:[✔✘?]${W}+)?`,
].join("");
/**
 * a word that makes `0x… word …` a GDB frame/info line, not an instruction; and
 * not a hexdump row (r2 `px`: `0x100000460  ff03 02d1 fd7b …`), whose first
 * 4-hex-digit group would otherwise pass for a mnemonic
 */
const NOT_MNEM = String.raw`(?!(?:in|is|at|from|to)\b|[0-9a-f]{4}(?:${W}+[0-9a-f]{4}){2})`;

const annotValue: Grammar = join(
	{
		"pwndbg-flags": { pattern: re(FLAGS), inside: flagsInside },
		"pwndbg-arith": {
			pattern: re(String.raw`\(${H} [-+*/&|^] ${H}\)`),
			inside: { number: re(H), punctuation: /[()]/, comment: /[-+*/&|^]/ },
		},
	},
	chain,
);

const disasmLine: Grammar = {
	// `RAX, [0x…] => v`, `[{fp}] <= v`, `0 - 7     EFLAGS => 0x297 [ … ]`
	"pwndbg-annot": lb(
		re(
			String.raw`(\S${W}{2,})(?:\S+ [-+*/&|^] \S+${W}{2,})?(?:[A-Z][A-Z0-9]*(?:, \[[^\]\n]*\])?|\[[^\]\n]*\]) (?:=>|<=) .*`,
		),
		{
			inside: {
				"pwndbg-val": lb(/((?:=>|<=)[\t ]+)\S.*/, { inside: annotValue }),
				arrow: /=>|<=/,
				"pwndbg-arith": {
					pattern: /^\S+ [-+*/&|^] \S+(?=[\t ])/,
					inside: { number: /-?\b(?:0x[0-9a-fA-F]+|\d+)\b/, comment: /[-+*/&|^]/ },
				},
				register: /\b[A-Z][A-Z0-9]*\b/,
				address: re(H),
				symbol: [re(VAR), /[\w.@$]+(?=\])/],
				punctuation: /[[\],]/,
			},
		},
	),
	// trailing branch/call target `<main+161>`, `<0x7f54cf7b9868>`, `<SYS_write>`
	"pwndbg-tgt": [
		{
			pattern: re(String.raw`(\S${W}+)<${H}>(?=${W}*$)`),
			lookbehind: true,
			inside: { punctuation: /[<>]/, "address-code": re(H) },
		},
		as("symbol", re(String.raw`(\S${W}+)${SYM}(?=${W}*$)`), true),
	],
	"pwndbg-insn": lb(re(String.raw`(^${DIS_HEAD})${NOT_MNEM}${MNEM}.*`), { inside: insn }),
	keyword: /^[\t ]*b\+?/,
	symbol: re(SYM),
	current: lb(/►|(^[\t ]*)_(?=[\t ])/),
	"address-code": re(H),
	number: /\b[0-9a-f]{2}\b|\.\.\./,
	punctuation: re(`[${ART_CH}]+`),
	taken: /✔/,
	"not-taken": /✘/,
	comment: /\?/,
};

// ── telescope / stack ────────────────────────────────────────────────────────

const TELE_IDX = String.raw`[0-9a-f]{2,}:[0-9a-f]{4,}│`;
const FRAME_OFF = String.raw`[+-][0-9a-f]{3,5}`;
const TELE_REG = String.raw`[a-z][a-z0-9_]*(?:[-+]\d+)?`;
const TELE_COL = String.raw`${W}*(?:${FRAME_OFF}${W}+|(?:${TELE_REG}${W}+)*)`;
const SP_REG = String.raw`(?:[re]?sp|[re]?bp|sp|wsp|x29|fp|s0)(?:[-+]\d+)?`;
const teleHead: Grammar = {
	offset: [re(`^[0-9a-f]+:[0-9a-f]+`), lb(re(String.raw`(│${W}*)${FRAME_OFF}`))],
	punctuation: /│/,
	register: re(TELE_REG),
};
function teleLine(paneIsStack: boolean): Grammar {
	const stack: PatternObj[] = [
		lb(re(String.raw`(^${TELE_IDX}${W}*${FRAME_OFF}${W}+)${H}`)),
		lb(re(String.raw`(^${TELE_IDX}${W}*(?:${TELE_REG}${W}+)*?${SP_REG}${W}+(?:${TELE_REG}${W}+)*)${H}`)),
	];
	if (paneIsStack) stack.push(lb(re(String.raw`(^${TELE_IDX}${TELE_COL})${H}`)));
	return join(
		{
			"pwndbg-slot-stack": stack.map((p) => ({ ...p, inside: { "address-stack": /[\s\S]+/ } })),
			"pwndbg-slot": as("address", re(String.raw`(^${TELE_IDX}${TELE_COL})${H}`), true),
			"pwndbg-tele-head": { pattern: re(`^${TELE_IDX}.*`), inside: teleHead },
		},
		chain,
	);
}
const TELE_LINE = String.raw`${TELE_IDX}${TELE_COL}${H}(?:${W}.*)?`;
const SKIP_LINE = String.raw`${W}*\.\.\. ↓(?:${W}+.*)?`;
const NO_READ = String.raw`<Could not read memory at ${H}>`;
const skipInside: Grammar = {
	comment: [/^[\t ]*\.\.\./, /\b(?:skipped|identical lines|repeated lines|bytes)\b/],
	arrow: /↓/,
	number: /\b\d+\b/,
	punctuation: /[()]/,
};
const noReadInside: Grammar = { address: re(H), "msg-error": /[^\s<>](?:[^<>\n]*[^\s<>])?/, punctuation: /[<>]/ };

/** backtrace row up to the function: ` ► 0 0x… `, `   f 1           400fd3 ` */
const BT_HEAD = String.raw`${W}*(?:[►_]${W}+)?(?:f${W}+)?\d+${W}+(?:0x)?[0-9a-f]+${W}+`;

// ── banners ──────────────────────────────────────────────────────────────────

const TITLE = String.raw`[A-Z][A-Z0-9 ()]*?`;
const banner = (title: string) =>
	[
		// current (with ` / extras`) and 2018-2022 bare; rule runs may be empty on a narrow tty
		String.raw`(?:─[^\n[]*)?\[ ${title}(?: \/ [^\]\n]*)? \]─*`,
		// ≤2017 `[────REGISTERS────]`
		String.raw`\[─+${title}─+\]`,
	].join("|");
const BANNER = banner(TITLE);
const STACK_BANNER = banner("STACK");

// ── source pane ──────────────────────────────────────────────────────────────

const sourceText: Grammar = {
	comment: { pattern: /\/\/.*|\/\*.*?(?:\*\/|$)/, greedy: true },
	string: { pattern: re(`${SRC.dq}|'(?:[^'\\\n]|\\.){1,4}'`), greedy: true },
};
const SRC_ROW = String.raw`${W}*(?:[►_]${W}+)?\d+(?:${W}[^\n]*)?`;

// ── heap ─────────────────────────────────────────────────────────────────────

const CHUNK_FLAG = String.raw`(?:PREV_INUSE|IS_MMAPP?ED|NON_MAIN_ARENA)`;
const BIN_NAME = String.raw`(?:tcachebins|fastbins|unsortedbin|smallbins|largebins)`;
const BIN_LABEL = String.raw`(?:0x[0-9a-f]{1,5}(?:-(?:0x[0-9a-f]+|∞))?|all)`;
/** an x/FMT row: all values padded to 2/4/8/16 hex digits, no arrows */
const XWORDS = String.raw`(?:${W}+0x(?:[0-9a-f]{2}){1,8}\b)+${W}*$`;

const binsHead: Grammar = {
	bin: /^all\b/,
	"pwndbg-label": {
		pattern: /^0x[0-9a-f]+(?:-(?:0x[0-9a-f]+|∞))?/,
		inside: { number: /0x[0-9a-f]+|∞/, punctuation: /-/ },
	},
	"pwndbg-count": { pattern: /^[\t ]*\[[\t ]*-?\d+\]/, inside: { number: /-?\d+/, punctuation: /[[\]]/ } },
};
const binColon: Grammar = { "pwndbg-colon": as("punctuation", /^:/) };
/** tcache entry (has a count): every link before an arrow is a chunk */
const tcacheEntry: Grammar = join(binsHead, { "address-heap": re(String.raw`${H}(?=${W}+${ARROW})`) }, binColon, chain);
/** fast/unsorted/small/large entry: only the head is known to be a chunk (fd/bk lead into main_arena) */
const binEntry: Grammar = join(binsHead, { "address-heap": lb(re(String.raw`(^:${W}+)${H}(?=${W}+${ARROW})`)) }, binColon, chain);

// ── vmmap ────────────────────────────────────────────────────────────────────

const PERM = String.raw`[r-][w-][x-][ps-]`;
const VMMAP_AFTER = String.raw`(?:${W}+${H})?${W}+`;
const vmmapAddr = (cond: string) => re(String.raw`${H}(?=${VMMAP_AFTER}${cond})`);
/** row kind in pwndbg's own order (color/memory.py): [stack, executable, read-only, [heap, writable */
const vmmapRow: Grammar = {
	current: /^►/,
	"address-stack": vmmapAddr(String.raw`${PERM}[^\n]*\[stack`),
	"address-code": vmmapAddr(String.raw`[r-][w-]x`),
	// `---p` (guard / reserved, not readable) is no rodata: plain address
	"address-rodata": vmmapAddr(String.raw`r-`),
	"address-heap": vmmapAddr(String.raw`${PERM}[^\n]*\[heap`),
	"address-data": vmmapAddr(String.raw`[r-]w`),
	address: vmmapAddr(PERM),
	path: lb(
		re(
			String.raw`(^[^\n]*?${PERM}${W}+[0-9a-f]+${W}+[0-9a-f]+${W}+)(?!(?:ADJACENT|GUARD)\b)[^\t\n ]+(?:${W}+(?!\+0x[0-9a-f]+${W}*$)[^\t\n ]+)*`,
		),
	),
	keyword: /\b(?:ADJACENT|GUARD)\b/,
	perm: lb(re(String.raw`([\t ])${PERM}(?=[\t ])`)),
	number: [/\+0x[0-9a-f]+/, /\b(?:0x)?[0-9a-f]+\b/],
};

// ── checksec ─────────────────────────────────────────────────────────────────

const CHECKSEC_KEYS = String.raw`(?:File|Arch|RELRO|Stack|NX|PIE|SHSTK|IBT|Stripped|Debuginfo|RWX|FORTIFY|Fortify|RPATH|RUNPATH|ASAN|UBSAN|Packer|Comment|Canary|SafeStack|MSAN)`;
const checksecLine: Grammar = {
	path: lb(/(^[\t ]*(?:File|RPATH|RUNPATH):[\t ]*)\S.*/),
	keyword: [re(`^${W}*${CHECKSEC_KEYS}(?=:)`), /\bPartial RELRO\b/],
	enabled: /\b(?:Full RELRO|Canary found|NX enabled|PIE enabled|Enabled)\b/,
	disabled: /\b(?:No RELRO|No canary found|NX disabled|NX unknown\b.*|No PIE|Executable|Has RWX segments|Disabled)\b/,
	address: re(H),
	punctuation: /:/,
};

// ── messages ─────────────────────────────────────────────────────────────────

const message: Grammar = {
	"msg-ok": /^\[\+\]/,
	// pwntools `[x] Starting local process …` is a progress line, not a failure
	"msg-info": /^\[[*x]\]/,
	"msg-error": /^\[[!-]\]/,
	path: lb(re(String.raw`(')\/[^'\n]*(?=')`)),
	string: /'[^'\n]*'|`[^`\n]*`/,
	address: re(H),
};

/** a `search` hit: `mapping   0x…  value`; the hit's kind comes from the mapping name or the value */
const hit = (kind: string): Grammar => ({
	"pwndbg-value": lb(re(String.raw`(^\S+${W}+${H}${W}+)\S.*`), { inside: final }),
	[kind]: re(H),
	path: /^\S+/,
});

const commentRest: Grammar = { comment: /\S(?:.*\S)?/ };
const errorRest: Grammar = { address: re(H), "msg-error": /\S(?:.*\S)?/ };
const warnRest: Grammar = { "msg-warn": /\S(?:.*\S)?/ };

// ── rules ────────────────────────────────────────────────────────────────────

const rules: Grammar = {
	"pwndbg-prompt": {
		pattern: line(String.raw`pwndbg>(?:${W}.*)?`),
		inside: { prompt: /^pwndbg>/, command: /\S(?:.*\S)?/ },
	},
	"pwndbg-startup": as(
		"comment",
		line(
			[
				String.raw`pwndbg: (?:loaded|created) .*`,
				String.raw`Loaded \d+ commands\.\s+Type pwndbg \[filter\] for a list\.`,
			].join("|"),
		),
	),
	// the tip header and the tip text on the next line
	"pwndbg-tip": as("comment", re(String.raw`^-{7} tip of the day .* -{7}${EOL}(?:\r?\n[^\n\r]*\S)?`, "m")),
	"pwndbg-legend": {
		pattern: line(String.raw`LEGEND: (?:STACK \| HEAP \| CODE \| DATA \| R?WX \| RODATA|MAPPED \| GUARD \| GAP).*`),
		inside: {
			legend: /^LEGEND:/,
			"address-stack": /\bSTACK\b/,
			"address-heap": /\bHEAP\b/,
			"address-code": /\bCODE\b/,
			"address-data": /\bDATA\b/,
			"address-rodata": /\bRODATA\b/,
			punctuation: /\|/,
			comment: /\S(?:.*\S)?/,
		},
	},

	// ── context panes anchored on their banner: STACK slots are stack, source rows are source
	"pwndbg-stack-pane": {
		pattern: re(
			String.raw`^(?:${STACK_BANNER})${EOL}(?:\r?\n(?:${TELE_LINE}|${SKIP_LINE}|${NO_READ})${EOL})+`,
			"m",
		),
		inside: {
			section: re(`^(?:${STACK_BANNER})`, "m"),
			"pwndbg-tele": { pattern: re(`^${TELE_LINE}`, "m"), inside: teleLine(true) },
			"pwndbg-skip": { pattern: re(`^${SKIP_LINE}`, "m"), inside: skipInside },
			"pwndbg-noread": { pattern: re(NO_READ), inside: noReadInside },
		},
	},
	"pwndbg-source-pane": {
		pattern: re(String.raw`^In file: [^\n]*$(?:\r?\n${SRC_ROW})*`, "m"),
		inside: {
			"pwndbg-infile": {
				pattern: /^In file: .*/m,
				inside: {
					keyword: /^In file:/,
					path: /\S.*?(?=:\d+[\t ]*$)/,
					number: /\d+(?=[\t ]*$)/,
					punctuation: /:/,
				},
			},
			"pwndbg-src": {
				pattern: re(`^${SRC_ROW}`, "m"),
				inside: join(
					{
						"pwndbg-code": lb(/(^[\t ]*(?:[►_][\t ]+)?\d+[\t ]+)\S.*/, { inside: sourceText }),
						current: /[►_]/,
						number: /\d+/,
					},
				),
			},
		},
	},

	"pwndbg-section": [as("section", line(BANNER)), as("section", line(String.raw`─{4,}`))],

	// ── registers (`*RAX  0x… —▸ …`, `↪*R14 …`, `EFLAGS 0x206 [ cf PF … ]`)
	"pwndbg-reg": { pattern: line(String.raw`↪?[* ]${UREG}${W}+${REG_VALUE}(?:${W}.*)?`), inside: registerLine },

	// ── disassembly (context DISASM, nearpc, pdisass, u)
	"pwndbg-disasm": {
		// not GDB's `0x0000…⇥24⇥source` (zero-padded pc + line number) once its tabs became spaces
		pattern: line(String.raw`(?!${W}*0x0[0-9a-f]*${W}+\d+${W})${DIS_HEAD}${NOT_MNEM}${MNEM}(?:${W}.*)?`),
		inside: disasmLine,
	},
	"pwndbg-disasm-arrow": as("arrow", line(String.raw`${W}*(?:[│╎]${W}*)*↓`)),
	"pwndbg-invalid": { pattern: line(String.raw`Invalid address ${H}`), inside: errorRest },
	// call arguments under a call: `        rdi: 0x… ◂— 'str'`
	"pwndbg-callarg": {
		pattern: line(String.raw` {8}(?:[A-Za-z_$][\w$]*|arg\[\d+\]):${W}+\S.*`),
		inside: join(
			{
				"pwndbg-argval": lb(/(:[\t ]+)\S.*/, { inside: chain }),
				register: re(String.raw`^${W}*${REGISTER_NAMES}(?=:)`),
				keyword: /^[\t ]*\S+(?=:)/,
				punctuation: /:/,
			},
		),
	},

	// ── backtrace / threads panes
	"pwndbg-bt": {
		pattern: line(
			[
				// not `0x… in f ()` (gdb) nor a table row with more numbers (r2 `iS`: `0   0x460  0xb0 …`)
				String.raw`${W}*(?:[►_]${W}+)?(?:f${W}+)?\d+${W}+${H}(?:${W}+(?!in${W}|0x)\S.*)?`,
				String.raw`${W}*(?:[►_]${W}+)?f${W}+\d+${W}+[0-9a-f]+(?:${W}+\S.*)?`, // ≤2020: no `0x`
			].join("|"),
		),
		inside: {
			"pwndbg-fn": as("symbol", re(String.raw`(^${BT_HEAD})(?!None\b)\S.*`), true),
			"pwndbg-none": as("comment", re(String.raw`(^${BT_HEAD})None\b`), true),
			"address-code": lb(re(String.raw`(^${W}*(?:[►_]${W}+)?(?:f${W}+)?\d+${W}+)(?:0x)?[0-9a-f]+`)),
			current: /[►_]/,
			keyword: /\bf\b/,
			number: /\d+/,
		},
	},
	"pwndbg-thread": {
		pattern: line(String.raw`${W}*(?:►${W}+)?\d+${W}+"[^"\n]*"${W}+\w+:${W}+${H}(?:${W}+${SYM})?`),
		inside: {
			current: /►/,
			string: /"[^"\n]*"/,
			keyword: /\b\w+(?=:)/,
			"address-code": re(H),
			symbol: re(SYM),
			number: /\b\d+\b/,
			punctuation: /:/,
		},
	},

	// ── telescope / stack (outside the STACK pane), skip markers
	"pwndbg-tele": { pattern: line(TELE_LINE), inside: teleLine(false) },
	"pwndbg-skip": { pattern: line(SKIP_LINE), inside: skipInside },
	"pwndbg-noread": { pattern: line(NO_READ), inside: noReadInside },
	// bare chains (`retaddr`): `0x… —▸ 0x… ◂— insn`
	"pwndbg-chain": { pattern: line(String.raw`${H}${LINK_TAIL}${W}+${ARROW}${W}.*`), inside: chain },

	// ── hexdump / windbg-style dumps
	"pwndbg-hexdump": {
		pattern: line(String.raw`\+[0-9a-f]{4,}${W}+${H}${W}+[0-9a-f]{2}(?:${W}+[0-9a-f]{2})*${W}*│.*│`),
		inside: {
			offset: /^\+[0-9a-f]+/,
			address: re(H),
			"pwndbg-ascii": as("comment", /(│)[^│\n]+(?=│)/, true),
			punctuation: /│/,
			"pwndbg-zero": as("comment", /\b00\b/),
			number: /\b[0-9a-f]{2}\b/,
		},
	},
	"pwndbg-windbg": {
		pattern: line(String.raw`[0-9a-f]{8,16} {2,}[0-9a-f]{2,16}(?: [0-9a-f]{2,16})*|[0-9a-f]{8,16} (?:${PYSTR})`),
		inside: { address: /^[0-9a-f]+/, string: re(PYSTR), number: /\b[0-9a-f]+\b/ },
	},

	// ── vmmap (+ `--gaps`), elfsections
	"pwndbg-vmmap-head": {
		pattern: line(
			String.raw`${W}*Start${W}+End${W}+(?:Perm${W}+Size${W}+(?:Offset${W}+File|Note${W}+Accumulated Size)|Perm${W}+Size${W}+Name)(?:${W}+\(.*\))?`,
		),
		inside: { comment: /\(.*\)/, keyword: /\S+(?: Size)?/ },
	},
	"pwndbg-vmmap": {
		pattern: line(String.raw`►?${W}*${H}${W}+${H}${W}+${PERM}${W}+[0-9a-f]+(?:${W}+.*)?`),
		inside: vmmapRow,
	},
	"pwndbg-vmmap-gap": {
		pattern: line(String.raw`${W}*(?:-${W}+)+GAP${W}+${H}`),
		inside: { keyword: /\bGAP\b/, number: re(H), comment: /-(?:[\t ]+-)*/ },
	},
	"pwndbg-vmmap-misc": {
		pattern: line(String.raw`Total memory mapped: .*|\[QEMU <8\.1 target detected.*\]|\[Omitted \d+ entries .*\]`),
		inside: { keyword: /^Total memory mapped:/, number: [re(H), /\b\d+\b/], "msg-warn": /\[.*\]/ },
	},
	"pwndbg-elfsection": {
		pattern: line(String.raw`${W}*${H}${W}+${H}${W}+[R-][W-][X-]${W}+${H}${W}+\S+`),
		inside: {
			"address-code": re(String.raw`${H}(?=(?:${W}+${H})?${W}+[R-][W-]X)`),
			"address-rodata": re(String.raw`${H}(?=(?:${W}+${H})?${W}+[R-]-)`),
			"address-data": re(String.raw`${H}(?=(?:${W}+${H})?${W}+[R-]W)`),
			perm: /\b[R-][W-][X-](?=[\t ])/,
			number: re(H),
			symbol: /\S+$/,
		},
	},

	// ── checksec: current, pwntools `[*] '/path'` + 4-space keys, bare `'/path'`
	"pwndbg-checksec": { pattern: line(String.raw`(?: {4})?${CHECKSEC_KEYS}:${W}+\S.*`), inside: checksecLine },
	"pwndbg-quoted-path": { pattern: line(String.raw`'\/[^'\n]*'`), inside: { path: /[^'\n]+/, punctuation: /'/ } },

	// ── got / plt
	"pwndbg-got": {
		pattern: line(String.raw`\[${H}\] \S+ -> .*`),
		inside: join(
			{
				"pwndbg-gotval": lb(/(-> )\S.*/, { inside: chain }),
				"pwndbg-slot": { pattern: re(String.raw`^\[${H}\]`), inside: { address: re(H), punctuation: /[[\]]/ } },
				arrow: /->/,
				symbol: /\S+/,
			},
		),
	},
	"pwndbg-got-head": {
		pattern: line(String.raw`State of the GOT of .*:|GOT protection: .*|Filtering out read-only entries .*`),
		inside: {
			keyword: [/^(?:State of the GOT of|GOT protection:)/, /\bPartial RELRO\b/],
			enabled: /\bFull RELRO\b/,
			disabled: /\bNo RELRO\b/,
			path: /\S+(?=:$)/,
			number: /\b\d+\b/,
			comment: /^Filtering.*|\bFound .*/,
			punctuation: /\|/,
		},
	},
	"pwndbg-plt": {
		pattern: line(String.raw`Section \.[\w.]+ ${H} - ${H}:|${H}: [\w.$]+@plt|No symbols found in section .*`),
		inside: {
			keyword: /^Section\b/,
			comment: /^No symbols found.*/,
			"address-code": re(H),
			symbol: /[\w.$@]+(?=$)|\.[\w.]+/,
			punctuation: /[:-]/,
		},
	},

	// ── heap (`heap`, `malloc-chunk`, `top-chunk`, `find-fake-fast`), three historical formats
	"pwndbg-chunk-head": {
		pattern: line(String.raw`(?:Allocated chunk|Free chunk \([a-z]+(?: [a-z]+)?\)|Top chunk|Fake chunk)(?: \| ${CHUNK_FLAG})*`),
		inside: { "heap-chunk": /^[A-Z][^|\n]*?(?=[\t ]*(?:\||$))/, "flag-set": re(CHUNK_FLAG), punctuation: /\|/ },
	},
	"pwndbg-chunk-field": {
		pattern: line(String.raw`(?:Addr|Size|prev_size|fd|bk|fd_nextsize|bk_nextsize): ${H}.*`),
		inside: {
			"address-heap": lb(re(`(^Addr: )${H}`)),
			address: lb(re(`(^(?:fd|bk|fd_nextsize|bk_nextsize): )${H}`)),
			number: lb(re(`(^(?:Size|prev_size): )${H}`)),
			keyword: /^\w+(?=:)/,
			"pwndbg-flagbits": {
				pattern: re(String.raw`\(with flag bits: ${H}\)`),
				inside: { comment: /with flag bits:/, number: re(H), punctuation: /[()]/ },
			},
			punctuation: /:/,
		},
	},
	"pwndbg-chunk-old": {
		pattern: line(String.raw`${H}(?: (?:FAKE|FASTBIN|PREV_INUSE|IS_MMAPP?ED|NON_MAIN_ARENA))* \{`),
		inside: { "address-heap": re(`^${H}`), "flag-set": /\b[A-Z_]+\b/, punctuation: /\{/ },
	},
	"pwndbg-heap-top": {
		pattern: line(String.raw`(?:Top Chunk|Last Remainder): (?:${H}|0)`),
		inside: { "heap-chunk": /^[A-Z][\w ]+(?=:)/, "address-heap": re(H), number: /\b0\b/, punctuation: /:/ },
	},
	"pwndbg-heap-note": as(
		"msg-warn",
		line(String.raw`Support for tcache large bins .*|Could not find the heap|Not all chunks were shown, see .*`),
	),

	// ── bins
	"pwndbg-bin-title": as("bin", line(String.raw`${BIN_NAME}(?: large)?`)),
	"pwndbg-bin-tcache": {
		pattern: line(String.raw`${BIN_LABEL}${W}+\[${W}*-?\d+\]:${W}+\S.*`),
		inside: tcacheEntry,
	},
	"pwndbg-bin-entry": {
		// `{1,5}` hex digits keep `0x603020:\t0x…` (x/gx) out; so does the padded-words check
		pattern: line(String.raw`${BIN_LABEL}:(?!${XWORDS})${W}+(?:0x[0-9a-f]+|\d+|empty)(?:${W}.*)?`),
		inside: binEntry,
	},
	"pwndbg-bin-corrupt": {
		pattern: line(String.raw`${BIN_LABEL} \[corrupted\]`),
		inside: { "msg-error": /\[corrupted\]/, bin: /^all/, number: /0x[0-9a-f]+|∞/, punctuation: /-/ },
	},
	"pwndbg-bin-fdbk": {
		pattern: line(String.raw`(?:FD|BK): .*`),
		inside: join(
			{
				"pwndbg-head": lb(re(String.raw`(^(?:FD|BK): )${H}(?=${W}+${ARROW})`), { inside: { "address-heap": /[\s\S]+/ } }),
				keyword: /^(?:FD|BK)(?=:)/,
				"pwndbg-colon": as("punctuation", /^:/),
			},
			chain,
		),
	},
	"pwndbg-bin-empty": as("comment", line("empty")),

	// ── vis-heap-chunks: `addr⇥cell⇥cell⇥ascii[⇥ <-- label]` (ASCII may hold spaces)
	"pwndbg-vis": {
		pattern: line(
			String.raw`${H}${W}+0x[0-9a-f]{8,16}(?:${W}+0x[0-9a-f]{8,16})?${W}+(?!(?:Yes|No)\b)[^\n\r]{4,16}?(?:${W}+<-- .*)?`,
		),
		inside: {
			"pwndbg-label": {
				pattern: /(^|[\t ])<-- .*/,
				lookbehind: true,
				inside: {
					arrow: /<--/,
					bin: re(BIN_NAME),
					"heap-chunk": /\bTop chunk\b/,
					number: /0x[0-9a-f]+|\b\d+\b/,
					punctuation: /[[\],/]/,
				},
			},
			"address-heap": re(`^${H}`),
			number: lb(/(^[\t ]*(?:0x[0-9a-f]+[\t ]+)??)0x[0-9a-f]+/),
			comment: /\S(?:.*\S)?/,
		},
	},

	// ── search: block anchored on `Searching for …`, so the row shape is not a catch-all
	"pwndbg-search": {
		pattern: re(
			String.raw`^Searching for [^\n]*$(?:\r?\n(?:\S+${W}+${H}(?:${W}[^\n]*)?|(?:⚠️ ?)?[Ww]arning: [^\n]*))*`,
			"m",
		),
		inside: {
			"pwndbg-search-head": {
				pattern: /^Searching for .*/m,
				inside: { keyword: /^Searching for/, string: /b?'(?:[^'\\\n]|\\.)*'|"[^"\n]*"/, address: re(H) },
			},
			"pwndbg-warn": { pattern: /^(?:⚠️ ?)?[Ww]arning: .*/m, inside: { address: re(H), "msg-warn": /\S(?:.*\S)?/ } },
			"pwndbg-hit": [
				{ pattern: re(String.raw`^\[stack[^\]\n]*\]${W}+${H}.*`, "m"), inside: hit("address-stack") },
				{ pattern: re(String.raw`^\[heap[^\]\n]*\]${W}+${H}.*`, "m"), inside: hit("address-heap") },
				{ pattern: re(String.raw`^\S+${W}+${H}(?=${W}+${INSN_START}).*`, "m"), inside: hit("address-code") },
				{ pattern: re(String.raw`^\S+${W}+${H}.*`, "m"), inside: hit("address") },
			],
		},
	},

	// ── rop (ROPgadget `0x… : insn ; insn`, pwndbg `0x…: insn ; …`)
	"pwndbg-rop": {
		pattern: line(String.raw`${H} ?: (?=[a-z])(?:[^;\n]+(?: ; [^;\n]+)+|(?:ret|syscall|leave|int 0x80)\b[^;\n]*)`),
		inside: {
			"pwndbg-gadget": lb(/((?:^0x[0-9a-fA-F]+ ?:|;) )[^;\n]*[^;\s]/, { inside: insn }),
			"address-code": re(`^${H}`),
			punctuation: /[:;]/,
		},
	},
	"pwndbg-rop-head": {
		pattern: line(String.raw`Gadgets information|={20,}|Unique gadgets found: \d+|Searching in ${H} ${H} \S.*|\[\.\.\.\]`),
		inside: {
			keyword: /^(?:Gadgets information|Unique gadgets found:|Searching in)/,
			comment: /^=+$|\[\.\.\.\]/,
			number: /\b\d+\b/,
			address: re(H),
			path: /\S+$/,
		},
	},

	// ── misc commands
	"pwndbg-canary": {
		pattern: line(
			String.raw`AT_RANDOM${W}+= ${H}.*|TLS Canary @ ${H}.*|Canary${W}+= ${H}.*|Thread \d+: Found valid canar(?:y|ies)\.?|Found valid canaries on the stacks:|Additional results hidden\. .*|No canaries found\.`,
		),
		inside: {
			address: lb(re(`(^(?:AT_RANDOM|TLS Canary)[\\t ]*[=@] )${H}`)),
			comment: [/#.*/, /^Additional results hidden.*/, /^No canaries found\./],
			keyword: /^(?:AT_RANDOM|TLS Canary|Canary|Thread \d+|Found valid canaries on the stacks)/,
			"msg-ok": /Found valid canar(?:y|ies)\.?/,
			number: re(H),
			punctuation: /[=@:]/,
		},
	},
	"pwndbg-misc-kv": {
		pattern: line(
			[
				String.raw`Calculated VA from \S+ = ${H}`,
				String.raw`Thread Local Storage \(TLS\) base: ${H}`,
				String.raw`TLS is located at:|Dumping the address:`,
				String.raw`tcbhead_t @ ${H}`,
				String.raw`Arena for thread \d+ is located at: ${H}`,
				String.raw`Extended information for virtual address ${H}:`,
				String.raw`${W}+(?:Containing mapping|Offset information|Containing ELF sections):`,
				String.raw`Finding cyclic pattern of \d+ bytes: .*`,
				String.raw`Found at offset -?\d+`,
				String.raw`${H}->${H} is -?${H} bytes \(-?${H} words\)`,
			].join("|"),
		),
		inside: {
			address: [
				lb(re(String.raw`(^(?:Calculated VA from \S+ =|Thread Local Storage \(TLS\) base:|Extended information for virtual address|tcbhead_t @|Arena for thread \d+ is located at:) )${H}`)),
				re(`^${H}`),
				lb(re(`(->)${H}`)),
			],
			path: lb(/(^Calculated VA from )\S+/),
			keyword: /^(?:Calculated VA from|tcbhead_t|Arena for thread \d+ is located at|Thread Local Storage \(TLS\) base|TLS is located at|Dumping the address|Extended information for virtual address|[\t ]+(?:Containing mapping|Offset information|Containing ELF sections)|Finding cyclic pattern of|Found at offset)/,
			string: /b'(?:[^'\\\n]|\\.)*'/,
			arrow: /->/,
			number: [/-?0x[0-9a-fA-F]+/, /-?\b\d+\b/],
			punctuation: /[:=()]/,
		},
	},
	"pwndbg-xinfo-offset": {
		pattern: line(String.raw`${W}+(?:[A-Z][A-Za-z() ]*?|\.[\w.]+) ${H} = (?:${H}|\S+) [-+] ${H}`),
		inside: {
			"pwndbg-stackoff": {
				pattern: re(String.raw`^${W}*(?:Stack Top|Stack End|Stack Pointer|Frame Pointer|Next Stack Canary|Stack) ${H} = ${H}`),
				inside: { keyword: /^[\t ]*[A-Za-z][A-Za-z ]*[a-z](?= 0x)/, "address-stack": re(H), punctuation: /=/ },
			},
			symbol: /^[\t ]*\.[\w.]+/,
			keyword: /^[\t ]*[A-Za-z][A-Za-z() ]*[A-Za-z)](?= 0x)/,
			number: lb(re(String.raw`([-+] )${H}`)),
			path: lb(/(= )[^\s0][^\s]*/),
			address: re(H),
			punctuation: /[=+-]/,
		},
	},
	"pwndbg-cyclic": as("string", line(String.raw`aaaa(?:aaaa)?baaa[a-z]*`)),
	"pwndbg-aslr": {
		pattern: line(String.raw`ASLR is (?:ON|OFF|\?\?\?)(?: .*)?`),
		inside: { keyword: /^ASLR is/, enabled: /\bON\b/, disabled: /\bOFF\b/, comment: /\?\?\?|\(.*\)/ },
	},
	"pwndbg-procinfo": {
		pattern: line(String.raw`(?:exe|cmdline|cwd|pid|tid|ppid|uid|gid|groups|fd\[\d+\])${W}{2,}\S.*`),
		inside: {
			keyword: /^\S+/,
			string: /'[^'\n]*'/,
			path: lb(/([\t ])\/\S*/),
			arrow: /=>/,
			number: /\b\d+(?:\.\d+){0,3}(?::\d+)?\b/,
			comment: /\((?:listen|established|[a-z_ ]+)\)/,
			punctuation: /[[\],]/,
		},
	},
	"pwndbg-struct-field": {
		// `tls`/`dt`: `    0x0000fffff7ff8620 +0x0000 dtv                  : 0xfffff7ff8d70`
		pattern: line(String.raw`${W}+${H} \+${H} \S+${W}+: .*`),
		inside: {
			"pwndbg-fval": lb(/(:[\t ]+)\S.*/, { inside: chain }),
			address: re(`^${W}*${H}`),
			offset: /\+0x[0-9a-f]+/,
			keyword: /\S+(?=[\t ]+:)/,
			punctuation: /:/,
		},
	},
	"pwndbg-libc": {
		pattern: line(String.raw`${W}+(?:libc|ld) is at:${W}+${H}|${W}{4,}\/\S+`),
		inside: { keyword: /^[\t ]*\w+ is at:/, address: re(H), path: /\S+/ },
	},

	// ── LAST SIGNAL pane (gdb prints the comma form; pwndbg the siginfo form)
	"pwndbg-signal": as("signal", line(String.raw`Program received signal SIG[A-Z0-9]+(?: \([^()\n]*\))?\.?`)),

	// ── messages, errors, exceptions
	"pwndbg-msg": { pattern: line(String.raw`\[[*+!x-]\] .*`), inside: message },
	"pwndbg-gdb17-error": { pattern: line(String.raw`❌️?${W}*\S.*`), inside: errorRest },
	"pwndbg-error": {
		pattern: line(
			[
				String.raw`ERROR: .*`,
				String.raw`Exception occurred: .*`,
				String.raw`[A-Z]\w*(?:Error|Exception): .*`,
				String.raw`╭─.*─╮`,
				String.raw`╰─+╯`,
			].join("|"),
		),
		inside: errorRest,
	},
	"pwndbg-warn": {
		pattern: line(
			String.raw`WARNING: .*|No arena found for thread .*|Offset ${H} rebased to module .*|Could not determine rebased breakpoint address.*`,
		),
		inside: warnRest,
	},
	"pwndbg-chatter": {
		pattern: line(
			[
				String.raw`For more info invoke \`set exception-verbose on\`.*`,
				String.raw`or debug it by yourself with \`set exception-debugger on\``,
				String.raw`If that is an issue, you can report it on .*`,
				String.raw`\(Please don't forget to search if it hasn't been reported before\)`,
				String.raw`To generate the report and open a browser, you may run .*`,
				String.raw`PS: Pull requests are welcome`,
				String.raw`│.*│`,
				String.raw`QEMU target detected: .*`,
				String.raw`qemu-\S+: QEMU: Terminated via GDBstub`,
				String.raw`Set .+ to .+\.`,
				String.raw`FAKE CHUNKS`,
				String.raw`Free should succeed!`,
				String.raw`Errno \d+: .*`,
				String.raw`libc(?: version)?: .*|linked: (?:dynamically|statically)`,
				String.raw`(?:URLs|Mappings|Symbolication):`,
				String.raw`${W}+(?:project homepage|read the source|download the archive|git clone|has exported symbols|has internal symbols|has debug info):?${W}+\S.*`,
			].join("|"),
		),
		inside: commentRest,
	},
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
			if (!o.pattern.multiline && !FRAGMENT_START.has(o.pattern)) o.pattern = new RegExp(o.pattern.source, o.pattern.flags + "m");
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
		v instanceof RegExp || !v.inside ? v : { ...v, inside: trimmed("pwndbg", v.inside) };
	return Object.fromEntries(
		Object.entries(g).map(([k, v]) => [k, Array.isArray(v) ? v.map(one) : one(v)]),
	);
}

export const pwndbg: PrismGrammar = withAliases(trimAll(rules));
