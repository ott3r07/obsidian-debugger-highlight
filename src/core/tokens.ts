import type { Grammar, Token, TokenStream } from "prismjs";

/** Minimal surface of Prism we rely on (works with Obsidian's bundled Prism or the npm one). */
export interface PrismLike {
	languages: Record<string, unknown>;
	tokenize(text: string, grammar: Grammar): Array<string | Token>;
}

/** A flat, non-overlapping highlighted span: [from, to) with the CSS classes to apply. */
export interface Segment {
	from: number;
	to: number;
	classes: string[];
}

function tokenClasses(token: Token): string[] {
	const classes = ["token", token.type];
	const alias = token.alias;
	if (alias) classes.push(...(Array.isArray(alias) ? alias : [alias]));
	return classes;
}

/**
 * Flatten a Prism token stream into leaf segments. Nested tokens inherit
 * their ancestors' classes, so each segment carries the full class list —
 * this is what lets CodeMirror (which wants flat, sorted ranges) render the
 * same result as Prism's nested HTML in reading view.
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
	const classes = [...inherited, ...tokenClasses(stream)];
	return flatten(stream.content, pos, dedupe(classes), out);
}

function dedupe(xs: string[]): string[] {
	return [...new Set(xs)];
}

export function segmentsFor(prism: PrismLike, text: string, grammar: Grammar): Segment[] {
	const out: Segment[] = [];
	flatten(prism.tokenize(text, grammar) as TokenStream, 0, [], out);
	return out;
}

/** Render a token stream into DOM nodes without innerHTML. */
export function renderTokens(stream: TokenStream, parent: HTMLElement): void {
	if (typeof stream === "string") {
		parent.appendChild(document.createTextNode(stream));
		return;
	}
	if (Array.isArray(stream)) {
		for (const s of stream) renderTokens(s, parent);
		return;
	}
	const span = document.createElement("span");
	span.className = dedupe(tokenClasses(stream)).join(" ");
	renderTokens(stream.content, span);
	parent.appendChild(span);
}
