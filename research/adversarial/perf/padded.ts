// Realistic: 2000-line fixtures with every line right-padded to N columns (conhost / some terminals copy padded lines).
import Prism from "prismjs";
import { readFileSync } from "node:fs";
import { LANGUAGES } from "../../../src/grammars/index.ts";
const fx = (p: string) => readFileSync(new URL("../../../" + p, import.meta.url), "utf8");
for (const g of Object.values(LANGUAGES)) Prism.tokenize(fx("test/fixtures/gdb/session_x64.txt"), g);
const files: Record<string, string> = { gdb: "test/fixtures/gdb/session_x64.txt", pwndbg: "test/fixtures/pwndbg/commands.txt", gef: "test/fixtures/gef/context_x86_64.txt", peda: "test/fixtures/peda/commands.txt" };
for (const width of [0, 120, 200, 300]) {
	const r: string[] = [];
	for (const [lang, f] of Object.entries(files)) {
		const l = fx(f).split("\n"); const out: string[] = []; while (out.length < 2000) out.push(...l);
		const text = out.slice(0, 2000).map((s) => s.padEnd(width)).join("\n");
		let best = 1e9; for (let i = 0; i < 3; i++) { const a = performance.now(); Prism.tokenize(text, LANGUAGES[lang]!); best = Math.min(best, performance.now() - a); }
		r.push(`${lang}=${best.toFixed(1)}ms (${(text.length / 1024).toFixed(0)}KB)${best > 50 ? "!!" : ""}`);
	}
	console.log(`pad ${width}:`.padEnd(10), r.join("  "));
}
