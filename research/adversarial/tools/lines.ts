// Per-line token view using the same flatten() as the editor (nearest-class semantics).
// Usage: node research/adversarial/tools/lines.ts <lang> [--only-touched|--summary] <files...>
import Prism from "prismjs";
import { readFileSync } from "node:fs";
import { LANGUAGES, resolveLanguage } from "../../../src/grammars/index.ts";
import { segmentsFor } from "../../../src/core/tokens.ts";

const css = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");
export const STYLED = new Set([...css.matchAll(/\.dbg-([\w-]+)/g)].map((m) => m[1]!));
STYLED.delete("hl");

const [langArg, ...rest] = process.argv.slice(2);
let mode = "--all";
if (rest[0]?.startsWith("--")) mode = rest.shift()!;
const grammar = LANGUAGES[resolveLanguage(langArg!)!]!;

for (const file of rest) {
	let text = readFileSync(file, "utf8").replace(/\r/g, "");
	if (text.startsWith("# SOURCE:")) text = text.slice(text.indexOf("\n") + 1);
	const t0 = performance.now();
	const segs = segmentsFor(Prism as any, text, grammar);
	const ms = performance.now() - t0;
	const lines = text.split("\n");
	const starts: number[] = [];
	let p = 0;
	for (const l of lines) (starts.push(p), (p += l.length + 1));
	const per: string[][] = lines.map(() => []);
	const hist: Record<string, number> = {};
	let li = 0;
	for (const s of segs) {
		const type = s.classes[1]!.slice(4);
		if (!STYLED.has(type)) continue;
		while (li + 1 < starts.length && starts[li + 1]! <= s.from) li++;
		per[li]!.push(`${type}:${JSON.stringify(text.slice(s.from, s.to))}`);
		hist[type] = (hist[type] ?? 0) + 1;
	}
	const nonEmpty = lines.filter((l) => l.trim()).length;
	const touched = per.filter((x, i) => x.length && lines[i]!.trim()).length;
	console.log(`== ${file} [${langArg}] ${touched}/${nonEmpty} lines styled, ${ms.toFixed(1)} ms`);
	if (mode === "--summary") {
		console.log("   " + Object.entries(hist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" "));
		continue;
	}
	lines.forEach((l, i) => {
		if (!l.trim()) return;
		if (mode === "--only-touched" && !per[i]!.length) return;
		if (mode === "--untouched") { if (!per[i]!.length) console.log(`  L${i + 1}: ${l}`); return; }
		console.log(`L${i + 1}: ${l}`);
		if (per[i]!.length) console.log(`      ${per[i]!.join("  ")}`);
	});
}
