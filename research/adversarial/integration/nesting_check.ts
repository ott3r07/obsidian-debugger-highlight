// Reading view nests <span>s, so an unstyled inner token INHERITS its styled ancestor's colour.
// The editor (flatten → nearest class only) gives that text no colour. Find such (ancestor, inner) pairs.
import Prism from "prismjs";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { LANGUAGES } from "../../../src/grammars/index.ts";
const css = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");
const colored = new Set<string>(), weighted = new Set<string>();
for (const m of css.matchAll(/((?:&\.dbg-[\w-]+(?:,\s*)?)+)\s*\{([^}]*)\}/g)) {
	const types = [...m[1]!.matchAll(/dbg-([\w-]+)/g)].map((x) => x[1]!);
	for (const t of types) { if (/\bcolor:/.test(m[2]!)) colored.add(t); if (/font-weight/.test(m[2]!)) weighted.add(t); }
}
const pairs = new Map<string, { n: number; ex: string }>();
function walk(s: any, stack: string[]) {
	if (typeof s === "string") {
		if (!s.trim() || !stack.length) return;
		const nearest = stack.at(-1)!;
		const readingColor = [...stack].reverse().find((t) => colored.has(t));
		const readingBold = stack.some((t) => weighted.has(t));
		const editorColor = colored.has(nearest) ? nearest : undefined;
		const editorBold = weighted.has(nearest);
		if (readingColor !== editorColor || readingBold !== editorBold) {
			const k = `${stack.join(">")}  reading=${readingColor ?? "-"}${readingBold ? "+bold" : ""} editor=${editorColor ?? "-"}${editorBold ? "+bold" : ""}`;
			const e = pairs.get(k) ?? { n: 0, ex: s };
			e.n++; pairs.set(k, e);
		}
		return;
	}
	if (Array.isArray(s)) return s.forEach((x) => walk(x, stack));
	walk(s.content, [...stack, s.type]);
}
const roots = ["test/fixtures", "research/adversarial/samples"];
for (const r of roots) {
	const dir = new URL(`../../../${r}/`, import.meta.url);
	const files: string[] = [];
	const rec = (u: URL, rel: string) => { for (const f of readdirSync(u)) { const p = new URL(f, u); if (statSync(p).isDirectory()) rec(new URL(f + "/", u), rel + f + "/"); else if (f.endsWith(".txt")) files.push(rel + f); } };
	try { rec(dir, ""); } catch { continue; }
	for (const f of files) {
		const lang = Object.keys(LANGUAGES).find((l) => f.startsWith(l)) ?? "gdb";
		walk(Prism.tokenize(readFileSync(new URL(f, dir), "utf8"), LANGUAGES[lang]!), []);
	}
}
for (const [k, v] of [...pairs].sort((a, b) => b[1].n - a[1].n)) console.log(`${String(v.n).padStart(5)}  ${k}   e.g. ${JSON.stringify(v.ex)}`);
