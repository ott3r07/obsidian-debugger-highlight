import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import type { Grammar } from "prismjs";
import { FenceBlock, LineInfo, scanFences } from "../core/fences.ts";
import { PrismLike, Segment, segmentsFor } from "../core/tokens.ts";

export interface EditorHighlightOptions {
	prism: PrismLike;
	grammarFor(lang: string): Grammar | undefined;
}

/**
 * Source mode / Live Preview highlighting. Obsidian's editor is CodeMirror 6
 * and does not use Prism, so we tokenize each matching fenced block with the
 * same Prism grammar and paint the result with mark decorations. Nothing is
 * replaced, so the block stays editable.
 */
export function debuggerHighlightExtension(opts: EditorHighlightOptions) {
	const markCache = new Map<string, Decoration>();
	const mark = (classes: string[]) => {
		const cls = classes.join(" ");
		let d = markCache.get(cls);
		if (!d) markCache.set(cls, (d = Decoration.mark({ class: cls })));
		return d;
	};

	// Tokenizing is the expensive part; cache by (lang, text).
	let segCache = new Map<string, Segment[]>();

	function* docLines(view: EditorView, upTo: number): Generator<LineInfo> {
		const doc = view.state.doc;
		const last = doc.lineAt(Math.min(upTo, doc.length)).number;
		for (let n = 1; n <= last; n++) {
			const l = doc.line(n);
			yield { from: l.from, text: l.text };
		}
	}

	function build(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		const { from: vpFrom, to: vpTo } = view.viewport;
		const blocks = scanFences(docLines(view, vpTo), (l) => !!opts.grammarFor(l));
		const nextCache = new Map<string, Segment[]>();

		for (const block of blocks) {
			if (!block.lines.length) continue;
			const first = block.lines[0]!;
			const lastLine = block.lines[block.lines.length - 1]!;
			if (lastLine.from + lastLine.text.length < vpFrom || first.from > vpTo) continue;
			paint(block, builder, nextCache, vpFrom, vpTo);
		}
		segCache = nextCache;
		return builder.finish();
	}

	function paint(
		block: FenceBlock,
		builder: RangeSetBuilder<Decoration>,
		nextCache: Map<string, Segment[]>,
		vpFrom: number,
		vpTo: number,
	) {
		const grammar = opts.grammarFor(block.lang)!;
		const text = block.lines.map((l) => l.text).join("\n");
		const key = block.lang + "\0" + text;
		let segs = segCache.get(key) ?? nextCache.get(key);
		if (!segs) segs = segmentsFor(opts.prism, text, grammar);
		nextCache.set(key, segs);

		// Map offsets in the joined text back to document offsets, line by line.
		const starts: number[] = [];
		let acc = 0;
		for (const l of block.lines) {
			starts.push(acc);
			acc += l.text.length + 1;
		}
		let li = 0;
		for (const seg of segs) {
			let from = seg.from;
			while (from < seg.to) {
				while (li + 1 < starts.length && starts[li + 1]! <= from) li++;
				const line = block.lines[li]!;
				const lineEnd = starts[li]! + line.text.length;
				const to = Math.min(seg.to, lineEnd);
				if (to > from) {
					const a = line.from + (from - starts[li]!);
					const b = line.from + (to - starts[li]!);
					if (b >= vpFrom && a <= vpTo) builder.add(a, b, mark(seg.classes));
				}
				from = lineEnd + 1; // skip the joining "\n"
			}
		}
	}

	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.decorations = build(view);
			}
			update(u: ViewUpdate) {
				if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
			}
		},
		{ decorations: (v) => v.decorations },
	);
}
