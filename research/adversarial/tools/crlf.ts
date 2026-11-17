// Compare styled-line coverage and token sequence for LF vs CRLF versions of every sample and fixture.
import Prism from "prismjs";
import { readFileSync, readdirSync } from "node:fs";
import { LANGUAGES } from "../../../src/grammars/index.ts";
const leaves = (t: string, g: any) => { const out: string[] = []; const w = (s: any, ty: string) => { if (typeof s === "string") { const v = s.replace(/\r/g, ""); if (ty && v.trim() && !ty.includes("-") ) out.push(`${ty}:${v.trim()}`); else if (ty && v.trim()) out.push(`${ty}:${v.trim()}`); } else if (Array.isArray(s)) s.forEach((x) => w(x, ty)); else w(s.content, s.type); }; w(Prism.tokenize(t, g), ""); return out.filter((x) => !/^(gdb|pwndbg|gef|peda)-/.test(x)); };
const dirs = ["research/adversarial/samples", ...["gdb", "pwndbg", "gef", "peda"].map((l) => `test/fixtures/${l}`)];
for (const d of dirs) for (const f of readdirSync(d)) {
	if (!f.endsWith(".txt")) continue;
	const lang = d.includes("fixtures") ? d.split("/").pop()! : f.split("_")[0]!;
	const lf = readFileSync(`${d}/${f}`, "utf8").replace(/\r/g, "");
	const a = leaves(lf, LANGUAGES[lang]), b = leaves(lf.replace(/\n/g, "\r\n"), LANGUAGES[lang]);
	if (a.join("\n") !== b.join("\n")) {
		let i = 0; while (a[i] === b[i]) i++;
		console.log(`${d}/${f} [${lang}]: LF ${a.length} leaves vs CRLF ${b.length}; first diff: LF=${JSON.stringify(a[i])} CRLF=${JSON.stringify(b[i])}`);
	}
}
