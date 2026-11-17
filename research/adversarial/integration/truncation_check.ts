// editor.ts tokenizes a block only up to the viewport end. Lines whose tokens depend on LATER lines
// render differently while they sit at the bottom edge of the viewport (and change when you scroll).
import Prism from "prismjs";
import { readFileSync, readdirSync } from "node:fs";
import { segmentsFor } from "../../../src/core/tokens.ts";
import { LANGUAGES } from "../../../src/grammars/index.ts";
const css = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");
const STYLED = new Set([...css.matchAll(/\.dbg-([\w-]+)/g)].map((m) => "dbg-" + m[1]));
const perLine = (text: string, lang: string) => {
	const lines = text.split("\n"); const starts: number[] = []; let p = 0; for (const l of lines) (starts.push(p), (p += l.length + 1));
	const res: string[] = lines.map(() => ""); let li = 0;
	for (const s of segmentsFor(Prism as any, text, LANGUAGES[lang]!)) { while (li + 1 < starts.length && starts[li + 1]! <= s.from) li++; if (STYLED.has(s.classes[1]!)) res[li] += `${s.classes[1]}[${s.from - starts[li]!},${s.to - starts[li]!}) `; }
	return res;
};
for (const lang of ["gdb", "pwndbg", "gef", "peda"]) {
	const d = `test/fixtures/${lang}`; let diff = 0, total = 0; const ex: string[] = [];
	for (const f of readdirSync(d)) {
		const lines = readFileSync(`${d}/${f}`, "utf8").replace(/\r/g, "").split("\n").slice(0, 600);
		const full = perLine(lines.join("\n"), lang);
		for (let k = 1; k <= lines.length; k++) {
			if (!lines[k - 1]!.trim()) continue; total++;
			const cut = perLine(lines.slice(0, k).join("\n"), lang);
			if (cut[k - 1] !== full[k - 1]) { diff++; if (ex.length < 5) ex.push(`  ${f} L${k}: ${JSON.stringify(lines[k - 1]).slice(0, 100)}\n     next: ${JSON.stringify(lines[k] ?? "").slice(0, 80)}`); }
		}
	}
	console.log(`${lang}: ${diff}/${total} lines get different VISIBLE (styled) tokens when they are the last line before the viewport cut`);
	console.log(ex.join("\n"));
}
