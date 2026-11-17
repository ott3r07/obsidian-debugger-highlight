/**
 * Shared building blocks for all debugger grammars (see TOKENS.md).
 *
 * Ownership: the gdb-base author may ADD exports here and improve existing
 * ones, but must not rename/remove exports or change their token types —
 * the pwndbg/gef/peda grammars import them.
 *
 * Composition caveat: `compose()` is `Object.assign`, so a key that exists in
 * two parts keeps the FIRST part's position but the LAST part's value. The gdb
 * base grammar therefore uses only `gdb-*` top-level keys (structural line
 * wrappers with no style of their own; the taxonomy tokens live in their
 * `inside`). Tool grammars should avoid top-level `gdb-*` keys.
 */
import type { Grammar, GrammarValue } from "prismjs";

/** Regex source fragments (no flags), for composing larger patterns. */
export const SRC = {
	hex: String.raw`0x[0-9a-fA-F]+`,
	/** gdb-style symbol in angle brackets: <main+4>, <printf@plt>, <std::foo<int>+12> */
	angleSym: String.raw`<(?!repeats \d)(?:[^<>\n]|<[^<>\n]*>)+>`,
	dq: String.raw`"(?:[^"\\\n]|\\.)*"`,
	sq: String.raw`'(?:[^'\\\n]|\\.)*'`,
	/** horizontal whitespace; tools emit tabs that pastes often turn into spaces */
	ws: String.raw`[\t ]`,
	/**
	 * A file path: absolute, `./`, `../` or `~/` prefixed. Trailing dots are not
	 * part of it (`Reading symbols from ./a.out...`).
	 */
	path: String.raw`(?:~|\.{1,2})?(?:\/[\w+@%=-]*(?:\.[\w+@%=-]+)*)+`,
	/**
	 * hex that cannot be a mapped user/kernel address: below 0x10000 (Linux
	 * `mmap_min_addr`), or 64-bit with a top byte other than 00/ff
	 * (non-canonical, e.g. `0x8d4c5741fa1e0ff3`). Dereference chains type such a
	 * value as `number`, like pwndbg does.
	 */
	nonAddr: String.raw`0x(?:(?!00|ff|FF)[0-9a-fA-F]{16}|0*[0-9a-fA-F]{1,4})\b`,
	/** raw instruction bytes from `disassemble /r`: `48 89 e5` (x86) or `d100c3ff` (aarch64) */
	insnBytes: String.raw`(?:[0-9a-f]{2} )*[0-9a-f]{2}|[0-9a-f]{8}`,
} as const;

export const re = (src: string, flags = "") => new RegExp(src, flags);

/**
 * Whole-line wrapper source (use with the `m` flag): `body` plus optional
 * trailing blanks (Markdown hard breaks, blog copies). A body should not end in
 * `[\t ]*` itself: two adjacent blank runs backtrack quadratically on a long
 * blank tail. Pair it with `trimmed()` so the inside rules see the trimmed line.
 */
export const lineSrc = (body: string) => String.raw`^(?:${body})[\t ]*$`;

/**
 * `inside` grammar for a whole-line wrapper: its first rule splits trailing
 * blanks off into a `<prefix>-trail` token (structural, unstyled), so the other
 * rules see the same text as for the trimmed line and their `$` anchors hold.
 * The lookbehind makes the search linear in long interior blank runs.
 * A block wrapper (several lines) only loses the blanks after its last line.
 */
export function trimmed(prefix: string, inside: Grammar): Grammar {
	// `(?![^])`: the very end even when a grammar adds the `m` flag (multi-line block wrappers)
	return { [`${prefix}-trail`]: { pattern: /(^|[^\t ])[\t ]+(?![^])/, lookbehind: true }, ...inside };
}

/** x86 (64/32/16/8-bit, segment, vector) + aarch64 + arm register names. */
export const REGISTER_NAMES = String.raw`(?:[re]?(?:ax|bx|cx|dx|si|di|sp|bp|ip)|[abcd][lh]|(?:si|di|sp|bp)l|r(?:[89]|1[0-5])[dwb]?|[cdefgs]s|[re]?flags|[xyz]mm\d{1,2}|k[0-7]|cr[0-8]|dr[0-7]|fs_base|gs_base|[xwbhsdqv](?:[12]?\d|3[01])|xzr|wzr|sp|lr|fp|pc|cpsr|fpsr|fpcr|r\d{1,2}|sb|sl|ip)`;

export const tokens = {
	address: { pattern: re(SRC.hex), alias: "number" },
	number: { pattern: /\b(?:0x[0-9a-fA-F]+|\d+)\b/, alias: "number" },
	string: { pattern: re(`${SRC.dq}|${SRC.sq}`), greedy: true, alias: "string" },
	symbol: { pattern: re(SRC.angleSym), alias: "function" },
	repeats: { pattern: /<repeats \d+ times>/, alias: "comment" },
	/**
	 * an address that is directly followed by a complete `<sym>`. gdb prints this
	 * for code AND data symbols (`<main+4>`, `<main_arena+88>`, `<vtable for X+16>`),
	 * so on its own it is no evidence of code. A user annotation `<- …` / `<= …`
	 * is not a symbol.
	 */
	addressBeforeSym: { pattern: re(`${SRC.hex}(?=[\\t ]+(?!<[-=])${SRC.angleSym})`), alias: "number" },
	/** gdb's angle-bracket placeholders that are not symbols: `<optimized out>`, `<repeats 16 times>`, … */
	gdbPlaceholder: {
		pattern:
			/<(?:repeats \d+ times|optimized out|synthetic pointer|unavailable|not saved|incomplete type|value optimized out|incomplete sequence[^<>\n]*|(?:text|data) variable, no debug info)>|\.\.\.(?=[,)}\s]|$)/m,
		alias: "comment",
	},
	/** a path not glued to a preceding word (so `x/20gx` and `read/write` are not paths) */
	path: { pattern: re(`(^|[^\\w.)\\]/:])${SRC.path}`), lookbehind: true, alias: "string" },
} satisfies Record<string, GrammarValue>;

/**
 * Tokenizer for one disassembled instruction's text (mnemonic + operands +
 * trailing comment), Intel or AT&T, x86 or aarch64. Use via `inside`.
 *
 * Comments: x86 gdb writes `        # 0x… <sym>`; aarch64 writes `\t// #7`.
 * An aarch64 immediate (`, #0x30`, `[sp, #32]`) is NOT a comment: `#` only
 * starts a comment when followed by whitespace or end of line. When the x86
 * comment is just `# 0x… <sym>`, only the `#` is a comment so the target
 * address/symbol keep their own tokens.
 */
export const instruction: Grammar = {
	comment: [
		{ pattern: /[\t ]#(?=[\t ]+0x[0-9a-fA-F]+(?:[\t ]+<[^\n]*>)?[\t ]*$)/m, alias: "comment" },
		{ pattern: /(?:[\t ](?:#(?=[\t ]|$)|;|\/\/)|\/\*).*$/m, greedy: true, alias: "comment" },
	],
	string: tokens.string,
	/** branch/call targets and rip-relative comment targets: `0x… <malloc@plt>` (before `symbol`, which it looks ahead at) */
	"address-code": { pattern: re(`${SRC.hex}(?=[\\t ]+<)`), alias: "number" },
	symbol: tokens.symbol,
	/** Intel operand-size keywords: `QWORD PTR [rbp-0x8]` → keyword `QWORD`, punctuation `PTR` */
	keyword: {
		pattern: /\b(?:byte|[dfqt]?word|tbyte|oword|[xyz]mmword)(?=\s+ptr\b)/i,
		alias: "keyword",
	},
	register: { pattern: re(String.raw`%?\b${REGISTER_NAMES}\b`, "i"), alias: "variable" },
	number: { pattern: /[$#]?-?\b(?:0x[0-9a-fA-F]+|\d+)\b/, alias: "number" },
	punctuation: /[[\](),!{}]|\bptr\b/i,
};

/** Instruction text whose FIRST word is the mnemonic. */
export const instructionWithMnemonic: Grammar = {
	mnemonic: {
		pattern: /^\s*(?:(?:lock|rep[nz]*|bnd|notrack|data16|addr32)\s+)*[a-z][\w.]*/i,
		// greedy: Prism then matches against the whole text, so `^` is the true start of
		// the instruction and not the start of the operand fragment left after the mnemonic
		greedy: true,
		alias: "keyword",
	},
	...instruction,
};

/**
 * Branch/call/return mnemonics (x86 Intel+AT&T, aarch64, arm32), with prefixes.
 * Anchored at the start of the instruction text like `instructionWithMnemonic`.
 */
export const BRANCH_MNEMONIC = String.raw`(?:j[a-z]{1,4}|call[lqw]?|ret[lqwnf]?|iret[lqdw]?|loop[a-z]{0,3}|b(?:l?r?|lx|x)(?:a[ab]z?)?|bc?\.[a-z]{2}|b(?:eq|ne|cs|cc|hs|lo|mi|pl|vs|vc|hi|ls|ge|lt|gt|le|al)(?:\.[nw])?|bl(?:eq|ne|lt|gt|le|ge)|cbn?z|tbn?z|reta[ab]|eret)`;

/**
 * Like `instructionWithMnemonic`, but branch/call/return mnemonics get the
 * optional `mnemonic-branch` type. Preferred for new code.
 */
export const asmInstruction: Grammar = {
	"mnemonic-branch": {
		pattern: re(String.raw`^\s*(?:(?:bnd|notrack|rep[nz]*|data16)\s+)*${BRANCH_MNEMONIC}(?![\w.])`, "i"),
		greedy: true,
		alias: "keyword",
	},
	...instructionWithMnemonic,
};

/** Prepend `extra` rules to `base` (Prism tries keys in insertion order). */
export function compose(...parts: Grammar[]): Grammar {
	const out: Grammar = {};
	for (const part of parts) Object.assign(out, part);
	return out;
}
