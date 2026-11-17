/**
 * Vanilla GDB output (also the base appended after every tool grammar).
 *
 * Structure: every top-level key is a `gdb-*` line wrapper that matches one
 * whole line (`^…$`, `m` flag) and carries the taxonomy tokens in `inside`.
 * Wrappers have no style of their own. Matching whole lines first means the
 * inner rules see the complete line, so anchors and lookbehind groups are
 * reliable, and unknown lines (program stdout) stay untouched.
 *
 * Tolerances: tabs may be spaces (`[\t ]+`), trailing whitespace may be
 * trimmed, CR before LF is ignored (`.` and `$` stop at `\r`), and GDB's own
 * wrapping of long frame/value lines is handled by continuation rules.
 *
 * Evidence: research/pwndbg/captures/*_vanilla_* (GDB 15.1, x86_64 + aarch64),
 * research/pwndbg/SPEC.md §9, research/gef/REVIEW.md §5,
 * research/peda/REVIEW.md §1.7/§3 and research/peda/review_samples/.
 */
import type { Grammar, GrammarValue, TokenObject } from "prismjs";
import { SRC, re, tokens, asmInstruction } from "./shared.ts";

const H = SRC.hex;
const W = SRC.ws;
const SYM = SRC.angleSym;

/** whole-line wrapper regex */
const line = (src: string): RegExp => re(`^(?:${src})$`, "m");
/** wrapper token with an inside grammar */
const wrap = (src: string, inside: Grammar): GrammarValue => ({ pattern: line(src), inside });

/** function name in a frame: `main`, `std::foo<int>::bar`, `??` */
const FN = String.raw`(?:(?:[\w$~]+::)*operator(?: [A-Za-z_]\w*(?:\[\])?| ?[^\s\w(]+)|[A-Za-z_~$][\w$:~.@<>]*|\?\?)`;
/** source line: number + TAB (or the spaces a pasted TAB became) */
const SRCSEP = String.raw`(?:\t|[\t ]{2,})`;

const num: GrammarValue = { pattern: /-?\b(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b|-?\binf\b|-?\bnan\(0x[0-9a-f]+\)/, alias: "number" };
const addr: GrammarValue = { pattern: re(`\\b${H}\\b`), alias: "number" };
const addrCode: GrammarValue = { pattern: re(`\\b${H}\\b`), alias: "number" };
const kw = (src: string, flags = "m"): TokenObject => ({ pattern: re(src, flags), alias: "keyword" });
const rest = (type: string, alias: string): Grammar => ({ [type]: { pattern: /\S(?:.*\S)?/, alias } });

/**
 * A GDB value as printed by `print`, `info locals`, `x/s`, `Value returned`…:
 * `(op_fn) 0x… <add>`, `{a = 1, b = 0x…}`, `"str", '\000' <repeats 45 times>`.
 * An address is `address-code` only when followed by `<sym>`; a pointer
 * (after a `(T *)` cast or before a string) is `address`; other hex is `number`.
 */
export const gdbValue: Grammar = {
	// address rules look ahead at `<sym>` / a string, so they run before those
	"address-code": tokens.addressBeforeSym,
	address: [
		{ pattern: re(`(\\*\\)${W}?)${H}`), lookbehind: true, alias: "number" },
		{ pattern: re(`${H}(?=${W}+["'])`), alias: "number" },
	],
	string: tokens.string,
	"msg-error": { pattern: /<error: [^<>\n]*>/, alias: "deleted" },
	comment: tokens.gdbPlaceholder,
	symbol: tokens.symbol,
	number: num,
	punctuation: /[{}[\],]/,
};

/**
 * A frame description: `#1  0x… in foo (a=1, s=0x… "x") at f.c:3`,
 * `main (argc=1, …) at test.c:24`, `0x… in ?? () from /lib/libc.so.6`.
 * The frame's own pc (`0x… in`) is `address-code`.
 */
export const gdbFrame: Grammar = {
	string: tokens.string,
	"msg-error": { pattern: /<error: [^<>\n]*>/, alias: "deleted" },
	comment: tokens.gdbPlaceholder,
	path: [
		{ pattern: /(\b(?:at|from)[\t ]+)\S+?(?=:\d+[\t ]*$)/, lookbehind: true, alias: "string" },
		{ pattern: /(\bfrom[\t ]+)\S+(?=[\t ]*$)/, lookbehind: true, alias: "string" },
	],
	"address-code": [{ pattern: re(`\\b${H}(?=${W}+in\\b)`), alias: "number" }, tokens.addressBeforeSym],
	symbol: [
		tokens.symbol,
		// after the pc token the fragment starts with ` in `; the name may be a demangled
		// C++ signature with its own parens: `in CheckPassword(Napi::CallbackInfo const&) ()`
		{ pattern: /(^ in )[^\s(].*?(?= \()/, lookbehind: true, alias: "function" },
		{ pattern: re(`(?<![\\w$.:])${FN}(?=[\\t ]\\()`), alias: "function" },
	],
	address: addr,
	number: { pattern: /#\d+\b|-?\b(?:0x[0-9a-fA-F]+|\d+)\b/, alias: "number" },
	punctuation: /[(),]/,
};

const BP_KIND = String.raw`(?:Temporary breakpoint|Breakpoint|Catchpoint|Dprintf|(?:Fast |Static )?[Tt]racepoint|(?:Hardware |Software )?(?:read |access \(read\/write\) )?[Ww]atchpoint|(?:Read|Access \(read\/write\)) watchpoint)`;
const THREAD_HIT = String.raw`(?:Thread \d+(?:\.\d+)?(?: "[^"\n]*")? hit )`;
const bpHead: TokenObject = {
	pattern: re(`^${THREAD_HIT}?${BP_KIND} \\d+`),
	alias: "keyword",
	inside: { string: tokens.string, number: /\b\d+\b/ },
};

const REGNAME = String.raw`[a-z][a-z0-9_]*`;
const regName: GrammarValue = { pattern: re(`^${REGNAME}`), alias: "variable" };
const NATURAL = String.raw`-?(?:\d+(?:\.\d+)?(?:e[+-]?\d+)?|inf|nan\(${H}\))`;

/** `info proc mappings` row: address kind follows from the row's own perms/objfile */
const MAP_TAIL = (what: string) => re(`\\b${H}(?=(?:${W}+${H}){2,3}${W}+${what})`);
const mappingRow: Grammar = {
	"address-stack": { pattern: MAP_TAIL(String.raw`(?:[r-][w-][x-][ps-]${W}+)?\[stack[^\]\n]*\]`), alias: "number" },
	"address-heap": { pattern: MAP_TAIL(String.raw`(?:[r-][w-][x-][ps-]${W}+)?\[heap\]`), alias: "number" },
	"address-code": { pattern: MAP_TAIL(String.raw`[r-][w-]x[ps-](?![\w-])`), alias: "number" },
	"address-data": { pattern: MAP_TAIL(String.raw`[r-]w-[ps-](?![\w-])`), alias: "number" },
	"address-rodata": { pattern: MAP_TAIL(String.raw`r--[ps-](?![\w-])`), alias: "number" },
	address: { pattern: re(`\\b${H}(?=(?:${W}+${H}){2,3})`), alias: "number" },
	number: { pattern: re(`\\b${H}\\b`), alias: "number" },
	perm: { pattern: /(?<=[\t ])[r-][w-][x-][ps-](?=[\t ]|$)/, alias: "keyword" },
	path: { pattern: /(?<=[\t ])[/[].*?(?=[\t ]*$)/, alias: "string" },
};

const errorInside: Grammar = {
	string: tokens.string,
	address: addr,
	"msg-error": { pattern: /\S(?:.*\S)?/, alias: "deleted" },
};

const commentInside: Grammar = {
	string: tokens.string,
	path: tokens.path,
	comment: { pattern: /\S(?:.*\S)?/, alias: "comment" },
};

const infoInside: Grammar = {
	string: tokens.string,
	path: tokens.path,
	address: addr,
	number: { pattern: /\b\d+\b/, alias: "number" },
	punctuation: /[[\]]/,
	"msg-info": { pattern: /[^\s[\]](?:[^[\]\n]*[^\s[\]])?/, alias: "comment" },
};

/** source text after a line number (C-ish): strings and comments only */
const sourceText: Grammar = {
	comment: { pattern: /\/\/.*|\/\*.*?(?:\*\/|$)/, greedy: true, alias: "comment" },
	string: tokens.string,
};

export const gdb: Grammar = {
	// ── prompt and queries ────────────────────────────────────────────────
	"gdb-prompt": wrap(String.raw`\(gdb\)(?:[\t ].*)?`, {
		prompt: { pattern: /^\(gdb\)/, alias: "keyword" },
		command: { pattern: /\S(?:.*\S)?/, alias: "function" },
	}),
	"gdb-query": wrap(String.raw`.*\((?:y or n|y or \[n\]|\[y\] or n)\).*`, {
		comment: { pattern: /\[answered [YN]; input not from terminal\]/, alias: "comment" },
		prompt: { pattern: /\((?:y or n|y or \[n\]|\[y\] or n)\)/, alias: "keyword" },
		command: { pattern: /(^[\t ]+)\S+(?=[\t ]*$)/, lookbehind: true, alias: "function" },
	}),
	"gdb-pager": wrap(String.raw`-{2,3}Type <(?:RET|return)>.*`, rest("comment", "comment")),

	// ── disassembly / x/i ─────────────────────────────────────────────────
	"gdb-disasm-frame": wrap(String.raw`Dump of assembler code (?:for function .+|from ${H} to ${H}):|End of assembler dump\.`, {
		symbol: { pattern: /(for function ).+(?=:$)/, lookbehind: true, alias: "function" },
		"address-code": addrCode,
		comment: { pattern: /[A-Za-z][A-Za-z ]*[A-Za-z]\.?/, alias: "comment" },
	}),
	"gdb-disasm": wrap(
		String.raw`(?:=>${W}+|${W}*)${H}(?:${W}+${SYM})?${W}*:${W}+(?:(?:${SRC.insnBytes})${W}+)?(?:\(bad\)|[a-z][\w.]*)(?:${W}.*)?`,
		{
			"gdb-insn": {
				pattern: re(String.raw`(^(?:=>${W}+|${W}*)${H}(?:${W}+${SYM})?${W}*:${W}+(?:(?:${SRC.insnBytes})${W}+)?)\S.*`),
				lookbehind: true,
				inside: asmInstruction,
			},
			current: { pattern: /^=>/, alias: "important" },
			"address-code": addrCode,
			symbol: tokens.symbol,
			number: { pattern: re(String.raw`\b(?:${SRC.insnBytes})\b`), alias: "number" },
			punctuation: /:/,
		},
	),
	// x/FMT data rows, and `=> 0x0:\tCannot access memory at address 0x0`
	"gdb-examine": wrap(String.raw`(?:=>${W}+)?${H}(?:${W}+${SYM})?${W}*:${W}+(?:0x|-?\d|["'<{]|Cannot access memory).*`, {
		// the row label: the pc under `=>` (x/i) is code, a data row label is a plain address
		"address-code": [
			{ pattern: re(`(^=>${W}+)${H}`), lookbehind: true, alias: "number" },
			{ pattern: re(`(?<=[\\t ,{])${H}(?=${W}+<(?!repeats \\d))`), alias: "number" },
		],
		address: [{ pattern: re(`^${H}`), alias: "number" }, { pattern: re(`(at address )${H}`), lookbehind: true, alias: "number" }],
		current: { pattern: /^=>/, alias: "important" },
		"msg-error": [{ pattern: /Cannot access memory at address/, alias: "deleted" }, { pattern: /<error: [^<>\n]*>/, alias: "deleted" }],
		string: tokens.string,
		comment: tokens.gdbPlaceholder,
		symbol: tokens.symbol,
		number: num,
		punctuation: /[{}[\],:]/,
	}),

	// ── info registers ────────────────────────────────────────────────────
	"gdb-reg-pc": wrap(String.raw`(?:[re]?ip|pc)${W}+${H}${W}+${H}(?:${W}+${SYM})?${W}*`, {
		register: regName,
		"address-code": addrCode,
		symbol: tokens.symbol,
	}),
	"gdb-reg-sp": wrap(String.raw`[re]?sp${W}+${H}${W}+${H}${W}*`, {
		register: regName,
		"address-stack": { pattern: re(H), alias: "number" },
	}),
	"gdb-reg-flags": wrap(String.raw`${REGNAME}${W}+${H}${W}+\[[^\]\n]*\]${W}*`, {
		register: regName,
		"flag-set": { pattern: /\b[A-Z][A-Z0-9_]*\b(?!=)/, alias: "important" },
		number: [{ pattern: re(H), alias: "number" }, { pattern: /(=)\w+/, lookbehind: true, alias: "number" }],
		punctuation: /[[\]=]/,
	}),
	"gdb-reg-ptr": wrap(String.raw`${REGNAME}${W}+${H}${W}+${H}(?:${W}+${SYM})?${W}*`, {
		register: regName,
		"address-code": tokens.addressBeforeSym,
		symbol: tokens.symbol,
		address: addr,
	}),
	"gdb-reg-val": wrap(String.raw`${REGNAME}${W}+${H}${W}+${NATURAL}${W}*`, {
		register: regName,
		number: num,
	}),
	"gdb-reg-x87": wrap(String.raw`st[0-7]${W}+\S+${W}+\(raw ${H}\)${W}*`, {
		register: regName,
		number: num,
		punctuation: /[()]/,
	}),
	"gdb-reg-vector": wrap(String.raw`${REGNAME}${W}+\{.*`, { register: regName, ...gdbValue }),

	// ── breakpoints, watchpoints, signals, run control ────────────────────
	"gdb-bp-hit": wrap(String.raw`${THREAD_HIT}?(?:Temporary breakpoint|Breakpoint|Catchpoint) \d+(?: \([^()\n]*\))?, .*`, {
		keyword: bpHead,
		...gdbFrame,
	}),
	"gdb-bp-set": wrap(String.raw`${THREAD_HIT}?${BP_KIND} \d+(?:(?: at|:| \(|\.).*)?`, {
		keyword: [bpHead, kw(String.raw`\bpending\b`)],
		"address-code": { pattern: re(`(\\bat )${H}`), lookbehind: true, alias: "number" },
		path: { pattern: /(\bfile )[^,\n]+(?=, line \d)/, lookbehind: true, alias: "string" },
		number: { pattern: /(\bline )\d+|\b\d+(?= locations)/, lookbehind: true, alias: "number" },
		string: tokens.string,
	}),
	"gdb-watch-value": wrap(String.raw`(?:Old|New) value = .*`, { keyword: kw(String.raw`^(?:Old|New) value`), ...gdbValue }),
	"gdb-watch-scope": wrap(
		String.raw`Watchpoint \d+ deleted because the program has left the block in|which its expression is valid\.`,
		rest("msg-warn", "important"),
	),
	"gdb-signal": wrap(
		String.raw`(?:Program|Thread \d+(?:\.\d+)?(?: "[^"\n]*")?) (?:received|terminated with) signal SIG[A-Z0-9+-]+(?:, .*)?|The program no longer exists\.`,
		rest("signal", "important"),
	),
	"gdb-exit": wrap(String.raw`\[Inferior \d+ \(process \d+\) (?:exited normally|exited with code \d+|killed|detached)\]`, {
		punctuation: /[[\]()]/,
		"msg-ok": { pattern: /exited normally/, alias: "inserted" },
		"msg-warn": { pattern: /exited with code(?= \d)/, alias: "important" },
		"msg-error": { pattern: /\bkilled\b/, alias: "deleted" },
		number: /\b\d+\b/,
		keyword: kw(String.raw`\b(?:Inferior|process|detached)\b`),
	}),
	"gdb-bracket": wrap(
		String.raw`\[(?:New (?:Thread|LWP|process|inferior)|Switching to|Detaching|Attaching|Current thread|Thread debugging|Thread ${H}|Thread \d|LWP \d|Inferior \d).*\]`,
		infoInside,
	),
	"gdb-run": wrap(String.raw`Continuing\.|Starting program: .*|Run till exit from .*|Value returned is .*`, {
		// lookbehind-anchored rules first, while the line is still one fragment
		"gdb-run-value": { pattern: /(^Value returned is \$\d+ = ).+/, lookbehind: true, inside: gdbValue },
		register: { pattern: /(^Value returned is )\$\d+/, lookbehind: true, alias: "variable" },
		path: { pattern: /(^Starting program: )\S+/, lookbehind: true, alias: "string" },
		"gdb-run-frame": { pattern: /(^Run till exit from ).+/, lookbehind: true, inside: gdbFrame },
		keyword: kw(String.raw`^(?:Continuing\.|Starting program:|Run till exit from|Value returned is)`),
	}),
	"gdb-new-program": wrap(String.raw`process \d+ is executing new program: .*`, {
		number: /\b\d+\b/,
		path: tokens.path,
		"msg-info": { pattern: /is executing new program:/, alias: "comment" },
	}),
	"gdb-step-msg": wrap(String.raw`Single stepping until exit from function .*,|which has no line number information\.`, {
		symbol: { pattern: /(function )[^,\n]+/, lookbehind: true, alias: "function" },
		comment: { pattern: /[A-Za-z][^,\n]*[A-Za-z.]/, alias: "comment" },
	}),

	// ── backtrace and stop locations ──────────────────────────────────────
	"gdb-bt": wrap(String.raw`#\d+${W}+.*`, gdbFrame),
	"gdb-frame-pc": wrap(String.raw`${H} in .*`, gdbFrame),
	"gdb-frame": wrap(
		String.raw`${FN} \(.*\)${W}+(?:at \S+:\d+|from \S+)${W}*|${FN} \([\w$.@]+=.*|${FN} \(\)`,
		gdbFrame,
	),
	// GDB wraps long frame lines with a 4-space indent
	"gdb-frame-cont": wrap(String.raw`${W}{2,}(?:at \S+:\d+|from \S+)${W}*| {4}[\w$.@]+=(?! ).*`, gdbFrame),
	// `bt` pasted through Markdown loses the leading `#`: `10 0x… in f (…) at …`
	"gdb-bt-nohash": wrap(String.raw`\d+${W}+(?:${H} in .*|${FN} \(.*\) at \S+:\d+${W}*)`, gdbFrame),
	"gdb-bt-stop": wrap(String.raw`Backtrace stopped: .*`, rest("msg-warn", "important")),

	// ── print / locals / values ───────────────────────────────────────────
	"gdb-value": wrap(String.raw`\$\d+ = .*`, {
		register: { pattern: /^\$\d+/, alias: "variable" },
		...gdbValue,
	}),
	"gdb-ptype": wrap(String.raw`type = .*`, { keyword: kw(String.raw`^type(?= =)`), punctuation: /[{}]/ }),
	"gdb-display": wrap(String.raw`\d+: .*`, {
		number: { pattern: /^\d+/, alias: "number" },
		command: { pattern: /(^: )x\/\S*.*/, lookbehind: true, alias: "function" },
		"gdb-display-value": { pattern: /( = ).+/, lookbehind: true, inside: gdbValue },
	}),

	// ── info tables ───────────────────────────────────────────────────────
	"gdb-bp-table-head": wrap(String.raw`Num${W}+Type${W}+Disp${W}+Enb${W}+Address${W}+What${W}*`, {
		keyword: kw(String.raw`\S+`),
	}),
	"gdb-bp-table-row": wrap(
		String.raw`\d+(?:\.\d+)?${W}+(?:breakpoint|(?:hw |read |acc )watchpoint|catchpoint|dprintf|(?:fast |static )?tracepoint)${W}+(?:keep|del|dis|dstp)${W}+[yn].*|\d+\.\d+${W}+[yn]-?${W}+${H}.*`,
		{
			enabled: { pattern: /(?<=[\t ])y(?=-?[\t ]|$)/, alias: "inserted" },
			disabled: { pattern: /(?<=[\t ])n(?=-?[\t ]|$)/, alias: "deleted" },
			"address-code": { pattern: re(`(?<=[\\t ])${H}(?=${W}+in\\b|${W}*$)`), alias: "number" },
			keyword: kw(String.raw`\b(?:(?:hw |read |acc )?watchpoint|breakpoint|catchpoint|dprintf|(?:fast |static )?tracepoint|keep|del|dis|dstp)\b`),
			symbol: { pattern: /(\bin )\S+(?= at )/, lookbehind: true, alias: "function" },
			path: { pattern: /(\bat )\S+?(?=:\d+[\t ]*$)/, lookbehind: true, alias: "string" },
			number: /\b\d+(?:\.\d+)?\b/,
		},
	),
	"gdb-bp-table-sub": wrap(String.raw`${W}+(?:(?:breakpoint|catchpoint|watchpoint) already hit \d+ times?|stop only if .*|stop only in thread .*|ignore next \d+ hits)`, {
		number: /\b\d+\b/,
		comment: { pattern: /[a-z][a-z ]*[a-z]/, alias: "comment" },
	}),
	"gdb-map-head": wrap(String.raw`${W}*Start Addr${W}+End Addr${W}+Size${W}+Offset${W}+(?:Perms${W}+)?objfile${W}*`, {
		keyword: kw(String.raw`\S+(?: Addr)?`),
	}),
	"gdb-map-row": wrap(String.raw`${W}*${H}${W}+${H}${W}+${H}${W}+${H}(?:${W}+[r-][w-][x-][ps-])?(?:${W}+.*)?`, mappingRow),
	"gdb-solib-head": wrap(String.raw`From${W}+To${W}+Syms Read${W}+Shared Object Library${W}*`, {
		keyword: kw(String.raw`Syms Read|Shared Object Library|\S+`),
	}),
	"gdb-solib-row": wrap(String.raw`(?:${H}${W}+${H}${W}+|${W}+)(?:Yes|No)(?: \(\*\))?${W}+\S.*`, {
		"address-code": addrCode,
		keyword: kw(String.raw`\b(?:Yes|No)\b`),
		comment: { pattern: /\(\*\)/, alias: "comment" },
		path: { pattern: /\S.*?(?=[\t ]*$)/, alias: "string" },
	}),
	"gdb-inferior-head": wrap(String.raw`${W}*Num${W}+Description${W}+(?:Connection${W}+)?Executable${W}*`, {
		keyword: kw(String.raw`\S+`),
	}),
	"gdb-inferior-row": wrap(String.raw`${W}*(?:\*${W}+)?\d+${W}+(?:process \d+|<null>)(?:${W}+.*)?`, {
		current: { pattern: /^[\t ]*\*/, alias: "important" },
		path: tokens.path,
		keyword: kw(String.raw`\bprocess\b|<null>`),
		number: /\b\d+\b/,
		comment: { pattern: /\([^()\n]*\)/, alias: "comment" },
	}),

	"gdb-thread-head": wrap(String.raw`${W}*Id${W}+Target Id${W}+Frame${W}*`, { keyword: kw(String.raw`Target Id|\S+`) }),
	"gdb-thread-row": wrap(String.raw`${W}*(?:\*${W}+)?\d+${W}+(?:Thread|process|LWP|Remote target)\b.*`, {
		current: { pattern: /^[\t ]*\*/, alias: "important" },
		keyword: kw(String.raw`\b(?:Thread|LWP|process)\b`),
		...gdbFrame,
	}),
	// ── info frame / line / symbol ────────────────────────────────────────
	"gdb-info-frame": wrap(
		String.raw`Stack level \d+, frame at ${H}:|${W}+(?:[re]?ip|pc) = ${H}.*|${W}+(?:called by|caller of) frame at ${H}.*|${W}+source language \S+\.|${W}+Arglist at ${H}, args:.*|${W}+Locals at ${H}, Previous frame's sp is ${H}|${W}+Saved registers:|${W}+${REGNAME} at ${H}(?:,${W}*${REGNAME} at ${H})*,?`,
		{
			"address-stack": { pattern: re(`((?:frame|Arglist|Locals) at |sp is |\\b${REGNAME} at )${H}`), lookbehind: true, alias: "number" },
			"address-code": { pattern: re(`((?:[re]?ip|pc) = )${H}`), lookbehind: true, alias: "number" },
			address: addr,
			register: [
				{ pattern: re(`(^${W}+)(?:[re]?ip|pc)(?= =)`), lookbehind: true, alias: "variable" },
				{ pattern: /(\bsaved )(?:[re]?ip|pc)(?= =)/, lookbehind: true, alias: "variable" },
				{ pattern: re(`\\b${REGNAME}(?= at $)(?<!\\b(?:frame|Arglist|Locals))`), alias: "variable" },
			],
			path: { pattern: /(\()[^()\s]+(?=:\d+\))/, lookbehind: true, alias: "string" },
			symbol: { pattern: /(\bin )[^\s(;]+/, lookbehind: true, alias: "function" },
			keyword: kw(String.raw`^Stack level|\b(?:Saved registers|source language|Arglist|Locals)\b`),
			number: /\b\d+\b/,
		},
	),
	"gdb-info-line": wrap(String.raw`Line \d+ of ".*" (?:starts at|is at) address .*|No line number information available for address .*`, {
		string: tokens.string,
		"address-code": addrCode,
		symbol: tokens.symbol,
		keyword: kw(String.raw`^Line\b`),
		number: /\b\d+\b/,
	}),
	"gdb-info-symbol": wrap(String.raw`\S+(?: \+ \d+)? in section \S+(?: of \S+)?`, {
		symbol: { pattern: /^\S+/, alias: "function" },
		keyword: kw(String.raw`(?<=section )\S+`),
		path: { pattern: /(\bof )\S+$/, lookbehind: true, alias: "string" },
		number: /\b\d+\b/,
	}),

	// ── errors, warnings, informational chatter ───────────────────────────
	"gdb-warning": wrap(String.raw`[Ww]arning:.*`, {
		path: tokens.path,
		"msg-warn": { pattern: /\S(?:.*\S)?/, alias: "important" },
	}),
	"gdb-error": wrap(
		[
			String.raw`Cannot access memory at address ${H}`,
			String.raw`No symbol ".*" in current context\.`,
			String.raw`No symbol table is loaded\..*`,
			String.raw`No symbol matches .*`,
			String.raw`The program is not being run\.`,
			String.raw`The program has no (?:registers|stack) now\.`,
			String.raw`No (?:registers|stack|frame selected|executable file specified|process|symbol file now|default breakpoint address now)\.`,
			String.raw`No (?:source file named .*|line \d+ in .*|breakpoint number \d+|frame at level .*)\.`,
			String.raw`Undefined (?:command|info command|set command|show command): ".*"\.\s+Try "help.*"\.`,
			String.raw`Function ".*" not defined(?: in ".*")?\.`,
			String.raw`Invalid (?:number|character|cast|register|argument).*`,
			String.raw`A syntax error in expression, near .*`,
			String.raw`Attempt to .*`,
			String.raw`Initial frame selected; you cannot go up\.`,
			String.raw`Bottom \(innermost\) frame selected; you cannot go down\.`,
			String.raw`(?:Could not|Cannot) (?:insert|remove|find|execute|access) .*`,
			String.raw`You may have requested too many hardware breakpoints/watchpoints\.`,
			String.raw`Command aborted\.`,
			String.raw`Error (?:in|while) .*`,
			String.raw`Python Exception <class .*`,
			String.raw`Remote (?:connection closed|communication error.*)`,
			String.raw`During startup program exited with code \d+\.`,
			String.raw`value has been optimized out`,
		].join("|"),
		errorInside,
	),
	"gdb-chatter": wrap(
		[
			String.raw`GNU gdb .*`,
			String.raw`Copyright \(C\) .*`,
			String.raw`License GPLv3\+.*`,
			String.raw`This is free software: .*`,
			String.raw`There is NO WARRANTY, .*`,
			String.raw`and "show warranty" for details\.`,
			String.raw`Type "show (?:copying|configuration)".*`,
			String.raw`This GDB was configured as .*`,
			String.raw`For bug reporting instructions, please see:`,
			String.raw`${W}*<https?:\/\/[^>\n]+>\.?`,
			String.raw`Find the GDB manual and other documentation resources online at:`,
			String.raw`For help, type "help"\.`,
			String.raw`Type "apropos word" to search .*`,
			String.raw`Reading symbols from .*`,
			String.raw`\((?:No|no) debugging symbols found.*\)`,
			String.raw`Using host libthread_db library .*`,
			String.raw`Remote debugging using .*`,
			String.raw`Attaching to (?:program: .*, )?process \d+`,
			String.raw`Detaching from (?:program: .*, )?process \d+`,
			String.raw`Downloading .*`,
			String.raw`Download failed: .*`,
			String.raw`Missing separate debuginfos?.*`,
			String.raw`Core was generated by .*`,
			String.raw`Stopped due to shared library event.*`,
			String.raw`Debuginfod has been disabled\.`,
			String.raw`To make this setting permanent, add .*`,
			String.raw`This GDB supports auto-downloading debuginfo .*`,
			String.raw`Mapped address spaces:`,
			String.raw`process \d+`,
			String.raw`No locals\.`,
			String.raw`A debugging session is active\.`,
			String.raw`${W}*Inferior \d+ \[process \d+\] will be (?:killed|detached)\.`,
			String.raw`Quit anyway\?.*`,
			String.raw`The program being debugged has been started already\.`,
			String.raw`Program not restarted\.`,
			String.raw`No shared libraries loaded at this time\.`,
			String.raw`The target architecture is set to .*`,
			String.raw`Continuing with signal SIG\w+\.`,
			String.raw`No arguments\.`,
			String.raw`No breakpoints(?:,| or) .*`,
			String.raw`Note: .*`,
			String.raw`\(\*\): Shared library is missing debugging information\.`,
			String.raw`${W}*source language \S+\.`,
		].join("|"),
		commentInside,
	),

	// ── source lines (after the tables, whose rows also start with a number) ─
	"gdb-source-pc": wrap(String.raw`${H}${SRCSEP}\d+(?:${SRCSEP}.*)?`, {
		"gdb-source-text": { pattern: re(`(^${H}${SRCSEP}\\d+${SRCSEP}).+`), lookbehind: true, inside: sourceText },
		"address-code": { pattern: re(`^${H}`), alias: "number" },
		number: { pattern: /\b\d+\b/, alias: "number" },
	}),
	"gdb-source": wrap(String.raw`\d+${SRCSEP}.*|\d+${W}*`, {
		number: { pattern: /^\d+/, alias: "number" },
		...sourceText,
	}),
	"gdb-source-file": wrap(String.raw`[\w./+~-]+\.(?:c|h|cc|cpp|cxx|hpp|hh|C|s|S|asm|rs|go|m|mm|f|f90|d|zig|inc|y|l):`, {
		path: { pattern: /^.+(?=:$)/, alias: "string" },
		punctuation: /:$/,
	}),

	// ── locals / fields / wrapped values (last: the broadest shapes) ──────
	"gdb-local": wrap(String.raw`${W}*[A-Za-z_][\w.]*(?:\[\d+\])? = .*`, gdbValue),
	"gdb-value-cont": wrap(String.raw`${W}+(?:${H}|-?\d|["'{]).*[,}]${W}*|${W}*\}[,;]?${W}*`, gdbValue),
};
