import { loadPrism, MarkdownView, Plugin } from "obsidian";
import { blockSegments, renderSegments } from "./core/tokens.ts";
import type { PrismEnv, PrismHook, PrismLike } from "./core/tokens.ts";
import { LANGUAGE_ALIASES, LANGUAGES, resolveLanguage } from "./grammars/index.ts";
import { debuggerHighlightExtension } from "./obsidian/editor.ts";

const DONE_ATTR = "data-dbg-hl";

const ourLanguage = (lang: unknown) => (typeof lang === "string" ? resolveLanguage(lang) : undefined);

export default class DebuggerHighlightPlugin extends Plugin {
	private prism?: PrismLike;

	async onload() {
		const prism = (this.prism = (await loadPrism()) as PrismLike);

		// Reading view keeps Obsidian's native code block (copy button, theme).
		// The grammars are registered with Obsidian's Prism so its own pass
		// recognises the languages; both hooks are no-ops for other languages
		// and for highlights without a language name.
		for (const name of this.languageNames()) prism.languages[name] = LANGUAGES[resolveLanguage(name)!];
		prism.hooks.add("wrap", this.wrapHook);
		prism.hooks.add("complete", this.completeHook);

		// Blocks Obsidian renders without running Prism on them.
		this.registerMarkdownPostProcessor((el) => {
			for (const code of Array.from(el.querySelectorAll<HTMLElement>("pre > code"))) this.highlight(code);
		});

		// Source mode / Live Preview.
		this.registerEditorExtension(
			debuggerHighlightExtension({
				prism,
				grammarFor: (lang) => {
					const name = resolveLanguage(lang);
					return name ? LANGUAGES[name] : undefined;
				},
			}),
		);

		this.app.workspace.onLayoutReady(() => this.rerenderPreviews());
	}

	onunload() {
		const prism = this.prism;
		if (!prism) return;
		for (const name of this.languageNames()) delete prism.languages[name];
		const hooks: Array<[string, PrismHook]> = [["wrap", this.wrapHook], ["complete", this.completeHook]];
		for (const [name, fn] of hooks) {
			const list = prism.hooks.all[name];
			const i = list ? list.indexOf(fn) : -1;
			if (list && i >= 0) list.splice(i, 1);
		}
		this.rerenderPreviews();
	}

	private languageNames(): string[] {
		return [...Object.keys(LANGUAGES), ...LANGUAGE_ALIASES];
	}

	/** Prism's own pass would emit bare type classes (`prompt` collides with Obsidian's modal class). */
	private wrapHook = (env: PrismEnv) => {
		if (!ourLanguage(env.language)) return;
		env.classes = ["token", `dbg-${env.type}`];
	};

	/** Obsidian's Prism pass runs after post-processors: repaint with the normalizing pipeline. */
	private completeHook = (env: PrismEnv) => {
		if (!ourLanguage(env.language) || !env.element) return;
		env.element.removeAttribute(DONE_ATTR);
		this.highlight(env.element);
	};

	private highlight(code: HTMLElement) {
		if (code.hasAttribute(DONE_ATTR) || !this.prism) return;
		const lang = Array.from(code.classList)
			.find((c) => c.startsWith("language-"))
			?.slice("language-".length);
		const name = ourLanguage(lang);
		if (!name) return;
		const text = code.textContent ?? "";
		const segs = blockSegments(this.prism, text, LANGUAGES[name]!);
		code.empty();
		renderSegments(text, segs, code);
		code.setAttribute(DONE_ATTR, name);
		code.parentElement?.addClass("dbg-hl", `dbg-hl-${name}`);
	}

	private rerenderPreviews() {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView) view.previewMode.rerender(true);
		}
	}
}
