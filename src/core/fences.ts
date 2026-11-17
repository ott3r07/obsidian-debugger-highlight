/**
 * Locate fenced code blocks in Markdown text, line by line, the way Obsidian
 * renders them: ``` and ~~~ fences, indented fences (list items, tab or
 * spaces), blockquote / callout prefixes ("> ", "> > "), and YAML
 * frontmatter (never contains real blocks).
 */

export interface LineInfo {
	/** absolute offset of the line start in the document */
	from: number;
	text: string;
}

export interface FenceBlock {
	lang: string;
	/** content lines (between the fences), with quote prefix and fence indent removed */
	lines: { from: number; text: string }[];
}

const OPEN = /^([\t ]*)(`{3,}|~{3,})[\t ]*([^\s`{]+)?/;
const CLOSE = /^[\t ]*(`{3,}|~{3,})[\t ]*$/;

/** Strip exactly `depth` blockquote markers; returns null if the line has fewer. */
function stripQuotes(text: string, depth: number): { offset: number; body: string } | null {
	let i = 0;
	for (let d = 0; d < depth; d++) {
		const m = /^[ \t]{0,3}>[ ]?/.exec(text.slice(i));
		if (!m) return null;
		i += m[0].length;
	}
	return { offset: i, body: text.slice(i) };
}

function quoteDepth(text: string): number {
	return (/^(?:[ \t]{0,3}>[ ]?)*/.exec(text)![0].match(/>/g) ?? []).length;
}

/** Remove up to `n` leading whitespace characters (the opening fence's indent). */
function stripIndent(body: string, n: number): number {
	let i = 0;
	while (i < n && i < body.length && (body[i] === " " || body[i] === "\t")) i++;
	return i;
}

export function scanFences(lines: Iterable<LineInfo>, wanted: (lang: string) => boolean): FenceBlock[] {
	const blocks: FenceBlock[] = [];
	let open: { fence: string; quote: number; indent: number; block: FenceBlock | null } | null = null;
	let first = true;
	let inFrontmatter = false;

	for (const line of lines) {
		if (first) {
			first = false;
			if (/^---[\t ]*$/.test(line.text)) {
				inFrontmatter = true;
				continue;
			}
		}
		if (inFrontmatter) {
			if (/^(?:---|\.\.\.)[\t ]*$/.test(line.text)) inFrontmatter = false;
			continue;
		}

		if (open) {
			// Inside a fence only the opener's quote depth is a prefix; any
			// further `>` is content (gdb `commands`/`python` input, `>>>`).
			const q = stripQuotes(line.text, open.quote);
			if (!q) {
				open = null; // the quote ended, so did the block
			} else {
				const close = CLOSE.exec(q.body);
				if (close && close[1]![0] === open.fence[0] && close[1]!.length >= open.fence.length) {
					open = null;
					continue;
				}
				const cut = stripIndent(q.body, open.indent);
				open.block?.lines.push({ from: line.from + q.offset + cut, text: q.body.slice(cut) });
				continue;
			}
		}

		const depth = quoteDepth(line.text);
		const q = stripQuotes(line.text, depth)!;
		const m = OPEN.exec(q.body);
		if (!m) continue;
		const fence = m[2]!;
		// backtick fences can't have backticks in the info string
		if (fence[0] === "`" && q.body.slice(m[0].length).includes("`")) continue;
		const lang = (m[3] ?? "").toLowerCase();
		const block = wanted(lang) ? { lang, lines: [] } : null;
		if (block) blocks.push(block);
		open = { fence, quote: depth, indent: m[1]!.length, block };
	}
	return blocks;
}
