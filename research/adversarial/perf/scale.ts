// Scaling check: does tokenize time grow superlinearly with line length or line count?
import Prism from "prismjs";
import { readFileSync } from "node:fs";
import { LANGUAGES } from "../../../src/grammars/index.ts";
const fx = (p: string) => readFileSync(new URL("../../../" + p, import.meta.url), "utf8");
for (const g of Object.values(LANGUAGES)) Prism.tokenize(fx("test/fixtures/gdb/session_x64.txt"), g);
const time = (t: string, g: any) => { let best = 1e9; for (let i = 0; i < 3; i++) { const a = performance.now(); Prism.tokenize(t, g); best = Math.min(best, performance.now() - a); } return best; };
const gens: Record<string, (n: number) => string> = {
	"one line: spaces(n)+x": (n) => " ".repeat(n) + "x",
	"one line: '0x1 '*n/4": (n) => "0x1 ".repeat(n / 4),
	"one line: 'a<'*n/2": (n) => "a<".repeat(n / 2),
	"one line: '\"\\\\'*n/2": (n) => '"\\'.repeat(n / 2),
	"one line: ' │'*n/2": (n) => " │".repeat(n / 2),
	"one line: '0x1:  '*n/6": (n) => "0x1:  ".repeat(n / 6),
	"one line: 'Breakpoint 1, '*n/14": (n) => "Breakpoint 1, ".repeat(Math.floor(n / 14)),
	"one line: '—▸ 0x1 '*": (n) => "0x1 " + "—▸ 0x1 ".repeat(Math.floor(n / 7)),
	"one line: ' --> 0x1'*": (n) => "0x1" + " --> 0x1".repeat(Math.floor(n / 8)),
	"one line: '(a, '*": (n) => "f (" + "a=1, ".repeat(Math.floor(n / 5)),
	"one line: '[-'*": (n) => "[" + "-".repeat(n) ,
	"one line: 'rax '*": (n) => "rax ".repeat(n / 4),
	"N lines of '0x1:\\t0x1'": (n) => "0x1:\t0x1\n".repeat(n / 10),
	"N lines realistic pwndbg tel": (n) => "00:0000│ rsp 0x7fffffffe3d8 —▸ 0x7ffff7df0083 (__libc_start_main+243) ◂— mov edi, eax\n".repeat(Math.floor(n / 90)),
};
for (const [name, gen] of Object.entries(gens)) {
	const r: string[] = [];
	for (const [lang, g] of Object.entries(LANGUAGES)) {
		const t = [8000, 16000, 32000, 64000].map((n) => time(gen(n), g));
		r.push(`${lang}: ${t.map((x) => x.toFixed(1)).join("/")}${t[3]! / t[2]! > 3 ? " QUADRATIC?" : ""}`);
	}
	console.log(name.padEnd(30), r.join(" | "));
}
