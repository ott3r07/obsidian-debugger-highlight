// Minimal stand-in for the `obsidian` module so src/main.ts can be loaded in node.
import Prism from "prismjs";
export const state = { postProcessors: [], editorExtensions: [], layoutReady: [] };
export async function loadPrism() { return Prism; }
export class MarkdownView {}
export class Plugin {
	constructor() {
		this.app = { workspace: { onLayoutReady: (cb) => state.layoutReady.push(cb), getLeavesOfType: () => [] } };
	}
	registerMarkdownPostProcessor(fn) { state.postProcessors.push(fn); }
	registerEditorExtension(e) { state.editorExtensions.push(e); }
}
