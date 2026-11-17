// Editor decorations must equal flatten(tokenize(block text)) char-for-char, incl. inside callouts.
import Prism from "prismjs";
import { readFileSync, readdirSync } from "node:fs";
import { decorate } from "./harness.ts";
import { segmentsFor } from "../../../src/core/tokens.ts";
import { LANGUAGES } from "../../../src/grammars/index.ts";
const F = "```";
let bad = 0, total = 0;
for (const lang of ["gdb", "pwndbg", "gef", "peda"]) {
	const dir = new URL(`../../../test/fixtures/${lang}/`, import.meta.url);
	for (const f of readdirSync(dir)) {
		const text = readFileSync(new URL(f, dir), "utf8").replace(/\r/g, "").replace(/\n+$/, "");
		for (const prefix of ["", "> ", "> > "]) {
			total++;
			const head = "intro\n\n";
			const doc = head + [F + lang, ...text.split("\n"), F].map((l) => prefix + l).join("\n");
			const { marks } = decorate(doc);
			// expected: classes per char of block text
			const exp = new Map<number, string>();
			for (const s of segmentsFor(Prism as any, text, LANGUAGES[lang]!)) for (let i = s.from; i < s.to; i++) if (text[i] !== "\n") exp.set(i, s.classes.join(" "));
			// map doc offsets back to text offsets
			const lines = text.split("\n");
			const docLineStart: number[] = []; let p = head.length + prefix.length + F.length + lang.length + 1;
			const textStart: number[] = []; let q = 0;
			for (const l of lines) { docLineStart.push(p + prefix.length); textStart.push(q); p += prefix.length + l.length + 1; q += l.length + 1; }
			const got = new Map<number, string>();
			let li = 0;
			for (const m of marks) {
				for (let d = m.from; d < m.to; d++) {
					while (li + 1 < lines.length && docLineStart[li + 1]! <= d) li++;
					got.set(textStart[li]! + d - docLineStart[li]!, m.cls);
				}
			}
			let diff = 0; const ex: string[] = [];
			for (const k of new Set([...exp.keys(), ...got.keys()])) if (exp.get(k) !== got.get(k)) { diff++; if (ex.length < 3) ex.push(`@${k} ${JSON.stringify(text[k])} exp=${exp.get(k)} got=${got.get(k)}`); }
			if (diff) { bad++; console.log(`MISMATCH ${lang}/${f} prefix=${JSON.stringify(prefix)}: ${diff} chars; ${ex.join("; ")}`); }
		}
	}
}
console.log(`${total - bad}/${total} fixture×prefix combos match`);
