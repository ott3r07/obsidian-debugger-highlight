// node research/adversarial/tools/probe.ts <lang> 'line1' 'line2' ...   (\t in args = tab)
import Prism from "prismjs";
import { LANGUAGES, resolveLanguage } from "../../../src/grammars/index.ts";
import { segmentsFor } from "../../../src/core/tokens.ts";
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");
const STYLED = new Set([...css.matchAll(/\.dbg-([\w-]+)/g)].map((m) => m[1]!));
const [lang, ...ls] = process.argv.slice(2);
for (const raw of ls) {
	const t = raw.replace(/\\t/g, "\t");
	const segs = segmentsFor(Prism as any, t, LANGUAGES[resolveLanguage(lang!)!]!).filter((s) => STYLED.has(s.classes[1]!.slice(4)) && t.slice(s.from, s.to).trim());
	console.log(`${JSON.stringify(t)}\n   ${segs.map((s) => `${s.classes[1]!.slice(4)}:${JSON.stringify(t.slice(s.from, s.to))}`).join("  ") || "(nothing)"}`);
}
