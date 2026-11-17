// Pathological-input timing. node research/adversarial/perf/perf.ts
import Prism from "prismjs";
import { readFileSync } from "node:fs";
import { LANGUAGES } from "../../../src/grammars/index.ts";

const R = (s: string, n: number) => s.repeat(n);
const fx = (p: string) => readFileSync(new URL("../../../" + p, import.meta.url), "utf8");
const lines2000 = (src: string) => { const l = src.split("\n"); const out: string[] = []; while (out.length < 2000) out.push(...l); return out.slice(0, 2000).join("\n"); };
let seed = 42; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const garbage = Array.from({ length: 2000 }, () => Array.from({ length: 80 }, () => String.fromCharCode(Math.floor(rnd() * 0x2600))).join("")).join("\n");

const cases: Record<string, string> = {
	"50k A": R("A", 50000),
	"50k spaces": R(" ", 50000),
	"50k tabs": R("\t", 50000),
	"50k ─": R("─", 50000),
	"25k 0x": R("0x", 25000),
	"0x41414141 x5000": R("0x41414141 ", 5000),
	"50k <": R("<", 50000),
	"<a x25k": R("<a", 25000),
	"<<<<…>>>> 1k deep": R("<", 1000) + "a" + R(">", 1000),
	"unclosed dq 50k": '"' + R("a", 50000),
	"dq backslash 25k": '"' + R("\\a", 25000),
	"single-quote x50k": R("'", 50000),
	"50k [": R("[", 50000),
	"50k │": R("│", 50000),
	"50k :": R(":", 50000),
	"50k -": R("-", 50000),
	"50k =": R("=", 50000),
	"50k digits": R("1", 50000),
	"hex no 0x 50k": R("deadbeef ", 5500),
	"(gdb) + 50k": "(gdb) " + R("x", 50000),
	"pwndbg> + 50k": "pwndbg> " + R("x ", 25000),
	"emoji x2000 lines": R("🔥💀 0x401000 <main+4> ▸ —▸ ◂— ​‮\n", 2000),
	"garbage 2000x80": garbage,
	"2000 lines '─'*200": R(R("─", 200) + "\n", 2000),
	"2000 lines '0x'*100": R(R("0x", 100) + "\n", 2000),
	"2000 lines spaces 500 then x": R(R(" ", 500) + "x\n", 2000),
	"2000 lines '[' 300": R(R("[", 300) + "\n", 2000),
	"2000 lines '<' 300": R(R("<", 300) + "\n", 2000),
	"2000 lines unclosed quote 300": R('"' + R("a ", 150) + "\n", 2000),
	"2000 lines 0x… 0x… 0x… x40": R(R("0x7ffff7dd1000 ", 40) + "\n", 2000),
	"2000 lines `:  ` x60": R(R("0x1:  ", 60) + "\n", 2000),
	"2000 lines `—▸ ` x60": R("0x7ffe0 " + R("—▸ 0x7ffe0 ", 60) + "\n", 2000),
	"2000 lines `-->` x60": R("0x7ffe0 " + R("--> 0x7ffe0 ", 60) + "\n", 2000),
	"2000 lines `rax rbx` x100": R(R("rax ", 100) + "\n", 2000),
	"2000 lines 'Breakpoint 1, ' x50": R(R("Breakpoint 1, ", 50) + "\n", 2000),
	"2000 lines '#' + spaces": R("#" + R(" ", 300) + "x\n", 2000),
	"2000 lines `(` 300": R(R("(", 300) + "\n", 2000),
	"2000 lines `{a = ` 100": R(R("{a = ", 100) + "\n", 2000),
	"CRLF fixture x2000": lines2000(fx("test/fixtures/gdb/session_x64.txt")).replace(/\n/g, "\r\n"),
	"pwndbg fixture 2000": lines2000(fx("test/fixtures/pwndbg/commands.txt")),
	"gef fixture 2000": lines2000(fx("test/fixtures/gef/context_x86_64.txt")),
	"peda fixture 2000": lines2000(fx("test/fixtures/peda/commands.txt")),
	"gdb fixture 2000": lines2000(fx("test/fixtures/gdb/session_x64.txt")),
};

// warm-up
for (const g of Object.values(LANGUAGES)) Prism.tokenize(fx("test/fixtures/gdb/session_x64.txt"), g);

const only = process.argv[2];
const rows: string[] = [];
for (const [name, text] of Object.entries(cases)) {
	if (only && !name.includes(only)) continue;
	const r: string[] = [];
	for (const [lang, g] of Object.entries(LANGUAGES)) {
		const t0 = performance.now();
		Prism.tokenize(text, g);
		const ms = performance.now() - t0;
		r.push(`${lang}=${ms.toFixed(1)}${ms > 50 ? "!!" : ""}`);
	}
	rows.push(`${name.padEnd(34)} ${r.join("  ")}`);
	console.log(rows.at(-1));
}
