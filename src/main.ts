import { loadPrism, MarkdownView, Plugin } from "obsidian";
import type { Grammar, TokenStream } from "prismjs";
import { PrismLike, renderTokens } from "./core/tokens.ts";
import { LANGUAGES, resolveLanguage } from "./grammars/index.ts";
import { debuggerHighlightExtension } from "./obsidian/editor.ts";

const DONE_ATTR = "data-dbg-hl";

export default class DebuggerHighlightPlugin extends Plugin {
	private prism!: PrismLike;

	async onload() {
		this.prism = (await loadPrism()) as PrismLike;

		// 1) Reading view: register the grammars with Obsidian's own Prism so
		//    native rendering (copy button, theme, wrapping) is kept as-is.
		for (const [name, grammar] of Object.entries(LANGUAGES)) this.prism.languages[name] = grammar;

		// 2) Blocks rendered before the plugin loaded (or rendered by a path
		//    that skipped Prism) are re-highlighted in place.
		this.registerMarkdownPostProcessor((el) => this.highlightRendered(el));

		// 3) Source mode / Live Preview: CodeMirror decorations.
		this.registerEditorExtension(
			debuggerHighlightExtension({
				prism: this.prism,
				grammarFor: (lang) => {
					const name = resolveLanguage(lang);
					return name ? LANGUAGES[name] : undefined;
				},
			}),
		);

		this.app.workspace.onLayoutReady(() => this.rerenderPreviews());
	}

	onunload() {
		for (const name of Object.keys(LANGUAGES)) delete this.prism?.languages[name];
	}

	private highlightRendered(root: HTMLElement) {
		for (const code of Array.from(root.querySelectorAll<HTMLElement>("pre > code"))) {
			if (code.hasAttribute(DONE_ATTR)) continue;
			const lang = Array.from(code.classList)
				.find((c) => c.startsWith("language-"))
				?.slice("language-".length);
			const name = lang && resolveLanguage(lang);
			if (!name) continue;
			const grammar = LANGUAGES[name] as Grammar;
			const text = code.textContent ?? "";
			const stream = this.prism.tokenize(text, grammar) as TokenStream;
			code.empty();
			renderTokens(stream, code);
			code.setAttribute(DONE_ATTR, name);
			code.parentElement?.addClass("dbg-hl", `dbg-hl-${name}`);
		}
	}

	private rerenderPreviews() {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView) view.previewMode.rerender(true);
		}
	}
}
