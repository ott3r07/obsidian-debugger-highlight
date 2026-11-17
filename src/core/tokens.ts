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
	// Text takes the classes of its nearest enclosing token only — the same
	// colour it gets in reading view, where the innermost styled span wins.
	// (Accumulating ancestors would make the result depend on CSS order.)
	return flatten(stream.content, pos, tokenClasses(stream), out);
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
	span.className = tokenClasses(stream).join(" ");
	renderTokens(stream.content, span);
	parent.appendChild(span);
}
