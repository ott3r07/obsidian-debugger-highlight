// Drive the real CodeMirror ViewPlugin from src/obsidian/editor.ts without a DOM:
// ViewPlugin.create(view) only needs `view.state` and `view.viewport`.
import Prism from "prismjs";
import { EditorState } from "@codemirror/state";
import { debuggerHighlightExtension } from "./.build/editor.mjs";
import { LANGUAGES, resolveLanguage } from "../../../src/grammars/index.ts";

export function makePlugin(prism: any = Prism) {
	const calls = { tokenize: 0 };
	const counting = { ...prism, tokenize: (t: string, g: any) => (calls.tokenize++, prism.tokenize(t, g)) };
	const ext: any = debuggerHighlightExtension({
		prism: counting,
		grammarFor: (lang) => {
			const n = resolveLanguage(lang);
			return n ? LANGUAGES[n] : undefined;
		},
	});
	return { ext, calls };
}

export interface Mark { from: number; to: number; cls: string; text: string }

export function fakeView(doc: string, viewport?: { from: number; to: number }) {
	const state = EditorState.create({ doc });
	return { state, viewport: viewport ?? { from: 0, to: state.doc.length } } as any;
}

export function marks(view: any, deco: any): Mark[] {
	const out: Mark[] = [];
	const it = deco.iter();
	while (it.value) {
		out.push({ from: it.from, to: it.to, cls: it.value.spec.class, text: view.state.sliceDoc(it.from, it.to) });
		it.next();
	}
	return out;
}

/** decorate a whole doc in one go */
export function decorate(doc: string, viewport?: { from: number; to: number }) {
	const { ext, calls } = makePlugin();
	const view = fakeView(doc, viewport);
	const inst = ext.create(view);
	return { view, inst, ext, calls, marks: marks(view, inst.decorations) };
}

/** leaf [type,text] pairs from Prism on `text` (what reading view would show) */
export function readingLeaves(lang: string, text: string): string[] {
	const out: string[] = [];
	const walk = (s: any, type: string) => {
		if (typeof s === "string") { if (type && s.trim()) out.push(`${type}:${s}`); }
		else if (Array.isArray(s)) s.forEach((x) => walk(x, type));
		else walk(s.content, s.type);
	};
	walk(Prism.tokenize(text, LANGUAGES[resolveLanguage(lang)!]!), "");
	return out;
}
export const editorLeaves = (ms: Mark[]) => ms.filter((m) => m.text.trim()).map((m) => `${m.cls.replace("token dbg-", "")}:${m.text}`);
