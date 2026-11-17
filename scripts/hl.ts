// Usage:
//   node scripts/hl.ts <lang> <file...>            render with ANSI colours (visual check)
//   node scripts/hl.ts <lang> --stats <file...>     coverage: lines with no tokens at all
//   node scripts/hl.ts <lang> --dump <file...>      one line per token: type|text
//
// Uses the npm Prism (same engine Obsidian bundles).
import Prism from "prismjs";
import { readFileSync } from "node:fs";
import type { Token, TokenStream } from "prismjs";
import { LANGUAGES, resolveLanguage } from "../src/grammars/index.ts";

const [langArg, ...rest] = process.argv.slice(2);
const mode = rest[0]?.startsWith("--") ? rest.shift() : "--render";
const name = resolveLanguage(langArg ?? "");
if (!name) {
	console.error(`unknown language ${langArg}; known: ${Object.keys(LANGUAGES).join(", ")}`);
	process.exit(2);
}
const grammar = LANGUAGES[name]!;

const COLORS: Record<string, string> = {
	prompt: "1;35", command: "1;37", section: "2;36", legend: "2;36",
	register: "33", "flag-set": "1;32", "flag-clear": "2", address: "36",
	"address-stack": "35", "address-heap": "34", "address-code": "31", "address-data": "35;4",
	"address-rodata": "32", number: "36;2", symbol: "32", mnemonic: "1;33",
	"mnemonic-branch": "1;33;4", current: "1;32;7", arrow: "2;37", string: "33;2", comment: "2",
	offset: "2", taken: "1;32", "not-taken": "2;31", perm: "35", path: "32;2",
	"msg-info": "36", "msg-ok": "32", "msg-warn": "33", "msg-error": "31", signal: "1;31",
	keyword: "1", enabled: "32", disabled: "31", punctuation: "2", "heap-chunk": "1;34", bin: "1;34",
};

function render(stream: TokenStream, ctx = ""): string {
	if (typeof stream === "string") return ctx ? `\x1b[${ctx}m${stream}\x1b[0m` : stream;
	if (Array.isArray(stream)) return stream.map((s) => render(s, ctx)).join("");
	const t = stream as Token;
	const c = COLORS[t.type] ?? "4";
	return render(t.content, c);
}

function dump(stream: TokenStream, path: string[] = [], out: string[] = []): string[] {
	if (typeof stream === "string") {
		if (path.length) out.push(`${path.join(">")}|${JSON.stringify(stream)}`);
		return out;
	}
	if (Array.isArray(stream)) {
		for (const s of stream) dump(s, path, out);
		return out;
	}
	return dump((stream as Token).content, [...path, (stream as Token).type], out);
}

for (const file of rest) {
	const text = readFileSync(file, "utf8").replace(/\r/g, "");
	const tokens = Prism.tokenize(text, grammar);
	if (mode === "--render") {
		process.stdout.write(render(tokens) + "\n");
	} else if (mode === "--dump") {
		console.log(dump(tokens).join("\n"));
	} else if (mode === "--stats") {
		// A line counts as "touched" if any token overlaps it.
		const lines = text.split("\n");
		const touched = new Array(lines.length).fill(false);
		let pos = 0;
		const starts = lines.map((l) => ((pos += l.length + 1), pos - l.length - 1));
		const mark = (from: number, to: number) => {
			for (let i = 0; i < lines.length; i++) if (starts[i]! < to && starts[i]! + lines[i]!.length > from) touched[i] = true;
		};
		let off = 0;
		for (const t of tokens) {
			const len = typeof t === "string" ? t.length : String(t.content instanceof Array ? flat(t) : t.content).length;
			if (typeof t !== "string") mark(off, off + len);
			off += len;
		}
		const nonEmpty = lines.map((l, i) => [l, i] as const).filter(([l]) => l.trim());
		const miss = nonEmpty.filter(([, i]) => !touched[i]);
		console.log(`${file}: ${nonEmpty.length - miss.length}/${nonEmpty.length} non-empty lines touched`);
		for (const [l, i] of miss.slice(0, 40)) console.log(`  L${i + 1}: ${l}`);
		if (miss.length > 40) console.log(`  … ${miss.length - 40} more`);
	}
}

function flat(t: Token | string | TokenStream): string {
	if (typeof t === "string") return t;
	if (Array.isArray(t)) return t.map(flat).join("");
	return flat((t as Token).content);
}
