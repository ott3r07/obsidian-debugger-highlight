import { RangeSetBuilder } from "@codemirror/state";
import type { Text } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import type { Grammar } from "prismjs";
import { scanFences } from "../core/fences.ts";
import type { FenceBlock, LineInfo } from "../core/fences.ts";
import { blockSegments } from "../core/tokens.ts";
import type { PrismLike, Segment } from "../core/tokens.ts";

export interface EditorHighlightOptions {
	prism: PrismLike;
	grammarFor(lang: string): Grammar | undefined;
}

/** A located block. Segments are computed lazily, only once it is visible. */
interface LocatedBlock {
	from: number;
	to: number;
	block: FenceBlock;
	key: string;
	segs?: Segment[]; // absolute document offsets, filled on first paint
}

/**
 * Source mode / Live Preview highlighting. Obsidian's editor is CodeMirror 6
 * and does not use Prism, so each matching fenced block is tokenized with the
 * same Prism grammar and painted with mark decorations. Nothing is replaced,
 * so the block stays editable.
 *
 * Cost model: fences are re-scanned only when the document changes; a block
 * is tokenized whole, only when it is visible, and cached by (lang, text), so
 * scrolling never re-tokenizes and typing re-tokenizes only the edited block.
 */
export function debuggerHighlightExtension(opts: EditorHighlightOptions) {
	const markCache = new Map<string, Decoration>();
	const mark = (classes: string[]) => {
		const cls = classes.join(" ");
		let d = markCache.get(cls);
		if (!d) markCache.set(cls, (d = Decoration.mark({ class: cls })));
		return d;
	};

	function* docLines(doc: Text): Generator<LineInfo> {
		for (let n = 1; n <= doc.lines; n++) {
			const l = doc.line(n);
			yield { from: l.from, text: l.text };
		}
	}

	/** Relative segments of a block's joined content, keyed by lang + text. */
	const tokenCache = new Map<string, Segment[]>();

	function locate(doc: Text): LocatedBlock[] {
		const out: LocatedBlock[] = [];
		for (const block of scanFences(docLines(doc), (l) => !!opts.grammarFor(l))) {
			if (!block.lines.length) continue;
			const last = block.lines[block.lines.length - 1]!;
			const key = block.lang + "\0" + block.lines.map((l) => l.text).join("\n");
			out.push({ from: block.lines[0]!.from, to: last.from + last.text.length, block, key });
		}
		// drop cache entries for blocks that no longer exist
		const live = new Set(out.map((b) => b.key));
		for (const k of tokenCache.keys()) if (!live.has(k)) tokenCache.delete(k);
		return out;
	}

	function segmentsOf(b: LocatedBlock): Segment[] {
		if (b.segs) return b.segs;
		let rel = tokenCache.get(b.key);
		if (!rel) {
			const text = b.key.slice(b.key.indexOf("\0") + 1);
			rel = blockSegments(opts.prism, text, opts.grammarFor(b.block.lang)!);
			tokenCache.set(b.key, rel);
		}
		const lines = b.block.lines;
		const segs: Segment[] = [];
		let li = 0;
		let start = 0; // offset of line `li` in the joined text
		for (const s of rel) {
			// blockSegments never spans lines
			while (li + 1 < lines.length && start + lines[li]!.text.length < s.from) {
				start += lines[li]!.text.length + 1;
				li++;
			}
			const shift = lines[li]!.from - start;
			segs.push({ from: s.from + shift, to: s.to + shift, classes: s.classes });
		}
		return (b.segs = segs);
	}

	function paint(blocks: LocatedBlock[], view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		const { from, to } = view.viewport;
		for (const b of blocks) {
			if (b.to < from || b.from > to) continue;
			for (const s of segmentsOf(b)) {
				if (s.to < from || s.from > to) continue;
				builder.add(s.from, s.to, mark(s.classes));
			}
		}
		return builder.finish();
	}

	return ViewPlugin.fromClass(
		class {
			blocks: LocatedBlock[];
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.blocks = locate(view.state.doc);
				this.decorations = paint(this.blocks, view);
			}
			update(u: ViewUpdate) {
				if (u.docChanged) this.blocks = locate(u.view.state.doc);
				if (u.docChanged || u.viewportChanged) this.decorations = paint(this.blocks, u.view);
			}
		},
		{ decorations: (v) => v.decorations },
	);
}
