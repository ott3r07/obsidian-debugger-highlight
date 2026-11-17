/**
 * Locate fenced code blocks in Markdown text, line by line.
 * Handles ``` and ~~~ fences, up to 3 spaces of indent, and blockquote /
 * callout prefixes ("> ", "> > "), since Obsidian users often put debugger
 * output inside callouts.
 */

export interface LineInfo {
	/** absolute offset of the line start in the document */
	from: number;
	text: string;
}

export interface FenceBlock {
	lang: string;
	/** content lines (between the fences), with quote prefix removed */
	lines: { from: number; text: string }[];
}

const QUOTE_PREFIX = /^(?:[ \t]{0,3}>[ ]?)*/;
const OPEN = /^[ ]{0,3}(`{3,}|~{3,})[ \t]*([^\s`{]+)?/;

export function scanFences(lines: Iterable<LineInfo>, wanted: (lang: string) => boolean): FenceBlock[] {
	const blocks: FenceBlock[] = [];
	let open: { fence: string; quote: number; block: FenceBlock | null } | null = null;

	for (const line of lines) {
		const quoteLen = QUOTE_PREFIX.exec(line.text)![0].length;
		const body = line.text.slice(quoteLen);
		const quoteDepth = (line.text.slice(0, quoteLen).match(/>/g) ?? []).length;

		if (open) {
			// A quoted fence ends when the quote ends.
			if (quoteDepth < open.quote) {
				open = null;
			} else {
				const close = /^[ ]{0,3}(`{3,}|~{3,})[ \t]*$/.exec(body);
				if (close && close[1]![0] === open.fence[0] && close[1]!.length >= open.fence.length) {
					open = null;
					continue;
				}
				open.block?.lines.push({ from: line.from + quoteLen, text: body });
				continue;
			}
		}

		const m = OPEN.exec(body);
		if (!m) continue;
		const fence = m[1]!;
		// backtick fences can't have backticks in the info string
		if (fence[0] === "`" && body.slice(m[0].length).includes("`")) continue;
		const lang = (m[2] ?? "").toLowerCase();
		const block = wanted(lang) ? { lang, lines: [] } : null;
		if (block) blocks.push(block);
		open = { fence, quote: quoteDepth, block };
	}
	return blocks;
}
