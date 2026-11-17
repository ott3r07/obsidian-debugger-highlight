// Adversarial regression tests. Each test asserts the EXPECTED behaviour; a failing test is a bug
// documented in research/adversarial/REPORT.md (finding id in the test name).
// Run:  sh research/adversarial/integration/build.sh && node --test research/adversarial/adversarial.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import Prism from "prismjs";
import "prismjs/components/prism-c.js";
import { LANGUAGES } from "../../src/grammars/index.ts";
import { scanFences } from "../../src/core/fences.ts";
import { blockSegments } from "../../src/core/tokens.ts";
import { decorate, editorLeaves } from "./integration/harness.ts";

const F = "```";
const lines = (s: string) => { let from = 0; return s.split("\n").map((text) => { const l = { from, text }; from += text.length + 1; return l; }); };
const want = (l: string) => ["gdb", "pwndbg", "gef", "peda"].includes(l);
/** leaf [type, text] pairs, wrappers skipped */
function leaves(lang: string, text: string): string[] {
	const out: string[] = [];
	const w = (s: any, ty: string) => { if (typeof s === "string") { if (ty && s.trim() && !/^(gdb|pwndbg|gef|peda)-/.test(ty)) out.push(`${ty}:${s.trim()}`); } else if (Array.isArray(s)) s.forEach((x) => w(x, ty)); else w(s.content, /^(gdb|pwndbg|gef|peda)-/.test(s.type) ? ty : s.type); };
	w(Prism.tokenize(text, LANGUAGES[lang]!), "");
	return out;
}
const typeOf = (lang: string, text: string, frag: string) => leaves(lang, text).find((l) => l.endsWith(":" + frag))?.split(":")[0];

// ── integration: fences.ts / editor.ts ──────────────────────────────────────
test("F1 '>' at line start inside an unquoted fence is content, not a quote (gdb `commands`/`python` input)", () => {
	const doc = `${F}gdb\n(gdb) python\n>${F}\n>end\n(gdb) x/2gx $rsp\n${F}\n`;
	const b = scanFences(lines(doc), want);
	assert.deepEqual(b[0]!.lines.map((l) => l.text), ["(gdb) python", `>${F}`, ">end", "(gdb) x/2gx $rsp"]);
});
test("F2 fence indented 1-3 spaces: content indentation is stripped like CommonMark/reading view", () => {
	const doc = `  ${F}pwndbg\n  pwndbg> x/2gx $rsp\n  ${F}`;
	const b = scanFences(lines(doc), want);
	assert.equal(b[0]!.lines[0]!.text, "pwndbg> x/2gx $rsp");
	assert.ok(editorLeaves(decorate(doc).marks).includes("prompt:pwndbg>"));
});
test("F3 fenced block inside a list item (tab / 4-space indent) is highlighted in the editor", () => {
	for (const ind of ["\t", "    "]) {
		const doc = `- step\n${ind}${F}gdb\n${ind}(gdb) bt\n${ind}${F}`;
		assert.ok(editorLeaves(decorate(doc).marks).includes("prompt:(gdb)"), JSON.stringify(ind));
	}
});
test("F4 `---` frontmatter containing a fence does not swallow the note", () => {
	const doc = `---\nsnippet: |\n  ${F}gdb\n---\n(gdb) this is prose\n`;
	assert.deepEqual(editorLeaves(decorate(doc).marks), []);
});
test("F5 (passes: visible tokens unaffected) editor tokens for a line do not depend on where the viewport ends", () => {
	const block = ["──────────── stack ────", "0x0000fffffffffad0│+0x0000: 0x0000fffffffffd18  →  0x0000fffffffffef8\t ← $sp", "0x0000fffffffffad8│+0x0008: 0x0000000100000000"];
	const doc = `${F}gef\n${block.join("\n")}\n${F}\n`;
	const full = decorate(doc).marks.filter((m) => m.from < doc.indexOf("\n0x0000fffffffffad0"));
	const cutAt = doc.indexOf("\n0x0000fffffffffad0"); // viewport ends right after the banner line
	const cut = decorate(doc, { from: 0, to: cutAt }).marks.filter((m) => m.from < cutAt);
	assert.deepEqual(cut.map((m) => m.cls), full.map((m) => m.cls));
});
test("F6 (passes) editor offsets equal flatten(tokenize) inside callouts", () => {
	const doc = `> [!note]\n> ${F}pwndbg\n> pwndbg> x/2gx $rsp\n> 0x7fffffffe3d0:\t0x0000000000000001\n> ${F}`;
	const ms = decorate(doc).marks.filter((m) => m.text.trim());
	assert.deepEqual(ms.map((m) => m.text), ["pwndbg>", "x/2gx $rsp", "0x7fffffffe3d0", ":", "0x0000000000000001"]);
});

// ── integration: main.ts ────────────────────────────────────────────────────
test("M1 global Prism `wrap` hook must not throw for highlights without a language name", async () => {
	const { default: Plugin } = await import("./integration/.build/main.mjs");
	const p: any = new Plugin();
	await p.onload();
	try {
		assert.doesNotThrow(() => Prism.highlight("int x = 1;", Prism.languages.c!, undefined as any));
	} finally { p.onunload(); }
});

// ── grammar robustness ──────────────────────────────────────────────────────
test("G1 two trailing spaces (Markdown hard break / blog copy) do not kill a line", () => {
	for (const l of ["Continuing.", "[Inferior 1 (process 1090) killed]", "[Thread debugging using libthread_db enabled]"]) {
		assert.deepEqual(leaves("gdb", l + "  "), leaves("gdb", l), l);
	}
});
// G2/G3: NBSP and uniform indentation are normalized by the core pipeline
// (blockSegments), which both reading view and the editor use — not by the grammars.
function coreLeaves(lang: string, text: string): string[] {
	return blockSegments(Prism as any, text, LANGUAGES[lang]!)
		.map((s) => [s.classes[1]!.replace(/^dbg-/, ""), text.slice(s.from, s.to).trim()] as const)
		.filter(([t, x]) => x && !/^(gdb|pwndbg|gef|peda)-/.test(t))
		.map(([t, x]) => `${t}:${x}`);
}
test("G2 NBSP (U+00A0) from web/WeChat copies is treated like a space", () => {
	assert.deepEqual(coreLeaves("peda", "EAX:\u00a00x0 "), coreLeaves("peda", "EAX: 0x0 "));
	assert.ok(coreLeaves("gdb", "Program\u00a0received signal SIGSEGV, Segmentation fault.").some((x) => x.startsWith("signal:")));
});
test("G3 uniformly indented paste (SO / nested list) still highlights", () => {
	assert.ok(coreLeaves("gdb", "    (gdb) bt\n    #0  main () at a.c:3").includes("prompt:(gdb)"));
});

// ── grammar: wrong tokens ───────────────────────────────────────────────────
test("W1 data symbols are not address-code (main_arena, _IO_2_1_stdout_, vtable, completed.0)", () => {
	for (const [l, a] of [
		["0x5555555592a0:\t0x00007ffff7dd1b78 <main_arena+88>\t0x00007ffff7dd1b78 <main_arena+88>", "0x00007ffff7dd1b78"],
		["$1 = (FILE *) 0x7ffff7f9e780 <_IO_2_1_stdout_>", "0x7ffff7f9e780"],
		["$2 = (Derive) {<Base> = {_vptr.Base = 0x400c68 <vtable for Derive+16>, b1 = 0}, d1 = 0}", "0x400c68"],
	]) assert.notEqual(typeOf("gdb", l!, a!), "address-code", l);
});
test("W2 a user annotation `<- ...` after a value does not make it address-code", () => {
	const l = "0x555555757270:\t0x0000000000000000\t0x0000000000000031  <- fastbins[0x30]の値（アドレス）";
	assert.notEqual(typeOf("pwndbg", l, "0x0000000000000031"), "address-code");
});
test("W3 C++ template frame name is one symbol, not `<…>` template args", () => {
	const l = "#2  0x0000555555555190 in std::vector<int, std::allocator<int> >::operator[] (this=0x7fffffffe2a0, __n=5) at /usr/include/c++/12/bits/stl_vector.h:1123";
	assert.ok(!leaves("gdb", l).includes("symbol:<int, std::allocator<int> >"), leaves("gdb", l).join(" "));
});
test("W4 `---p` guard mapping is not rodata", () => {
	const l = "    0x7ffff7bcd000     0x7ffff7dcd000 ---p   200000 1c0000 /lib/x86_64-linux-gnu/libc-2.23.so";
	assert.notEqual(typeOf("pwndbg", l, "0x7ffff7bcd000"), "address-rodata");
});
test("W5 hexdump rows are not disassembly (no mnemonic / address-code)", () => {
	const l = "0x100000460  ff03 02d1 fd7b 07a9 fdc3 0191 2800 0090  .....{......(...";
	for (const lang of ["pwndbg", "gef"]) assert.ok(!leaves(lang, l).some((x) => x.startsWith("mnemonic:")), lang + ": " + leaves(lang, l).join(" "));
});
test("W6 GEF ≤2020 banner `───[ registers ]────` is a section", () => {
	const l = "──────────────────────────────────────────[ registers ]────";
	assert.ok(leaves("gef", l).some((x) => x.startsWith("section:")));
});
test("W7 GEF stack pane rows are consistently address-stack", () => {
	const t = "──────────────────────────── stack ────\n0x00007fff3250f9f8│+0x0000: 0x00007f776fe38376    ← $rsp\n0x00007fff3250fa00│+0x0008: 0x00007f776fe31b28\n0x00007fff3250fa08│+0x0010: 0x0000555555fa02a0";
	const ls = leaves("gef", "0x000000c820051d48│+0x0000: 0x00000000004012a4    ← $rsp\n0x000000c820051d50│+0x0008: 0x000000c820051db0"); // `dereference` output: no banner
	assert.equal(ls.find((x) => x.includes("0x000000c820051d50"))?.split(":")[0], ls.find((x) => x.includes("0x000000c820051d48"))?.split(":")[0]);
	void t;
});
test("W8 pwntools `[x]` (in progress) is not an error", () => {
	assert.ok(!leaves("pwndbg", "[x] Starting local process './vuln'").includes("msg-error:[x]"));
});
