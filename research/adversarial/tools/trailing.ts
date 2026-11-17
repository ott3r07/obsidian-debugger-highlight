// Robustness: append two trailing spaces (Markdown hard-break habit / blog copy) or a leading indent
// to every line of every test fixture; report lines whose tokens change.
import Prism from "prismjs";
import { readFileSync, readdirSync } from "node:fs";
import { LANGUAGES } from "../../../src/grammars/index.ts";
const leaves = (t: string, g: any) => { const out: string[] = []; const w = (s: any, ty: string) => { if (typeof s === "string") { if (ty && s.trim() && !/^(gdb|pwndbg|gef|peda)-/.test(ty)) out.push(`${ty}:${s.trim()}`); } else if (Array.isArray(s)) s.forEach((x) => w(x, ty)); else w(s.content, s.type); }; w(Prism.tokenize(t, g), ""); return out; };
const mode = process.argv[2] ?? "trail";
const xf = (l: string) => (mode === "trail" ? l + "  " : mode === "tab" ? l + "\t" : "    " + l);
for (const lang of ["gdb", "pwndbg", "gef", "peda"]) {
	const d = `test/fixtures/${lang}`;
	let changed = 0, lost = 0, total = 0; const ex: string[] = [];
	for (const f of readdirSync(d)) {
		const text = readFileSync(`${d}/${f}`, "utf8").replace(/\r/g, "");
		const a = text.split("\n"), b = a.map((l) => (l.trim() ? xf(l) : l));
		// per-line comparison done on the whole text, lines mapped by index
		const perLine = (ls: string[]) => { const toks = Prism.tokenize(ls.join("\n"), LANGUAGES[lang]!); const res: string[][] = ls.map(() => []); let li = 0; const w = (s: any, ty: string) => { if (typeof s === "string") { const parts = s.split("\n"); parts.forEach((p, i) => { if (i) li++; if (ty && p.trim() && !/^(gdb|pwndbg|gef|peda)-/.test(ty)) res[li]!.push(`${ty}:${p.trim()}`); }); } else if (Array.isArray(s)) s.forEach((x) => w(x, ty)); else w(s.content, s.type); }; w(toks, ""); return res; };
		const ra = perLine(a), rb = perLine(b);
		a.forEach((l, i) => { if (!l.trim()) return; total++; if (ra[i]!.join("|") !== rb[i]!.join("|")) { changed++; if (ra[i]!.length && !rb[i]!.length) lost++; if (ex.length < 6) ex.push(`    ${f}: ${JSON.stringify(l).slice(0, 110)}\n        before: ${ra[i]!.slice(0, 6).join(" ")}\n        after : ${rb[i]!.slice(0, 6).join(" ") || "(nothing)"}`); } });
	}
	console.log(`${lang} [${mode}]: ${changed}/${total} lines change tokens, ${lost} lose ALL highlighting`);
	console.log(ex.join("\n"));
}
