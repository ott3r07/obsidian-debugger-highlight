import type { Grammar, Token, TokenStream } from "prismjs";

/** Minimal surface of Prism we rely on (works with Obsidian's bundled Prism or the npm one). */
export interface PrismLike {
	languages: Record<string, unknown>;
	tokenize(text: string, grammar: Grammar): Array<string | Token>;
	hooks: { add(name: string, fn: (env: any) => void): void; all: Record<string, Array<(env: any) => void>> };
}

/** A flat, non-overlapping highlighted span: [from, to) with the CSS classes to apply. */
export interface Segment {
	from: number;
	to: number;
	classes: string[];
}

/**
 * CSS classes for a token. Grammar type names (`prompt`, `section`, …) are
 * prefixed with `dbg-` because bare names collide with host-app classes
 * (Obsidian's `.prompt` is the command-palette modal). Prism aliases are not
 * emitted: they exist for stock Prism themes on blogs, and inside Obsidian
 * they would pull in the theme's colours for other languages.
 */
function tokenClasses(token: Token): string[] {
	return ["token", `dbg-${token.type}`];
}

/**
 * Flatten a Prism token stream into leaf segments, so CodeMirror (flat,
 * sorted ranges) and reading view render exactly the same thing. Text takes
 * the classes of its nearest enclosing token only — accumulating ancestors
 * would make the colour depend on CSS rule order.
 */
export function flatten(stream: TokenStream, base = 0, inherited: string[] = [], out: Segment[] = []): number {
	let pos = base;
	if (typeof stream === "string") {
		if (inherited.length && stream.length) out.push({ from: pos, to: pos + stream.length, classes: inherited });
		return pos + stream.length;
	}
	if (Array.isArray(stream)) {
		for (const s of stream) pos = flatten(s, pos, inherited, out);
		return pos;
	}
	return flatten(stream.content, pos, tokenClasses(stream), out);
}

export function segmentsFor(prism: PrismLike, text: string, grammar: Grammar): Segment[] {
	const out: Segment[] = [];
	flatten(prism.tokenize(text, grammar) as TokenStream, 0, [], out);
	return out;
}

/** Longest whitespace prefix shared by all non-blank lines. */
function commonIndent(lines: string[]): string {
	let common: string | null = null;
	for (const l of lines) {
		if (!l.trim()) continue;
		const ind = /^[\t ]*/.exec(l)![0];
		if (common === null) common = ind;
		else {
			let i = 0;
			while (i < common.length && i < ind.length && common[i] === ind[i]) i++;
			common = common.slice(0, i);
		}
		if (!common) return "";
	}
	return common ?? "";
}

/**
 * Highlight a code block's text, tolerating what copy/paste does to it:
 *  - NBSP (U+00A0, from web pages / WeChat / Notion) is treated as a space;
 *  - a uniform indent on every line (Stack Overflow, nested lists) is ignored;
 *  - CR before LF is ignored.
 * Returned offsets refer to the ORIGINAL text, so the caller can paint it
 * unchanged. Segments never span a line break.
 */
export function blockSegments(prism: PrismLike, text: string, grammar: Grammar): Segment[] {
	const orig = text.split("\n");
	const indent = commonIndent(orig);
	const cuts: number[] = [];
	const norm = orig.map((l) => {
		const cut = l.startsWith(indent) ? indent.length : /^[\t ]*/.exec(l)![0].length;
		cuts.push(cut);
		return l.slice(cut).replace(/ /g, " ").replace(/\r$/, "");
	});

	const segs = segmentsFor(prism, norm.join("\n"), grammar);
	const out: Segment[] = [];
	let line = 0;
	let normStart = 0; // offset of `line` in the normalized text
	let origStart = 0; // offset of `line` in the original text
	for (const s of segs) {
		let from = s.from;
		while (from < s.to) {
			while (line < norm.length - 1 && normStart + norm[line]!.length < from) {
				normStart += norm[line]!.length + 1;
				origStart += orig[line]!.length + 1;
				line++;
			}
			const lineEnd = normStart + norm[line]!.length;
			const to = Math.min(s.to, lineEnd);
			if (to > from) {
				const shift = origStart + cuts[line]! - normStart;
				out.push({ from: from + shift, to: to + shift, classes: s.classes });
			}
			if (to >= s.to) break;
			from = lineEnd + 1; // skip the "\n"
		}
	}
	return out;
}

/** Render `text` with segments into `parent` (no innerHTML). */
export function renderSegments(text: string, segs: Segment[], parent: HTMLElement): void {
	let pos = 0;
	for (const s of segs) {
		if (s.from > pos) parent.appendChild(document.createTextNode(text.slice(pos, s.from)));
		const span = document.createElement("span");
		span.className = s.classes.join(" ");
		span.textContent = text.slice(s.from, s.to);
		parent.appendChild(span);
		pos = s.to;
	}
	if (pos < text.length) parent.appendChild(document.createTextNode(text.slice(pos)));
}
