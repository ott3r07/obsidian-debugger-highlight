// pwndbg grammar tests. Fixture lines are verbatim from research/pwndbg/captures,
// research/pwndbg/review_samples/local_captures and the real-world samples in
// research/pwndbg/review_samples (copied into test/fixtures/pwndbg/ without the
// `# SOURCE:` headers). Inline lines below are copied from the same files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import Prism from "prismjs";
import type { Token, TokenStream } from "prismjs";
import { pwndbg } from "../src/grammars/pwndbg.ts";
import { LANGUAGES } from "../src/grammars/index.ts";

const FIXTURES = new URL("./fixtures/pwndbg/", import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES), "utf8").replace(/\r/g, "");
const fixtureNames = readdirSync(FIXTURES).filter((f) => f.endsWith(".txt"));

/** TOKENS.md: type → alias */
const ALIAS: Record<string, string> = {
	prompt: "keyword", command: "function", section: "comment", legend: "comment", register: "variable",
	"flag-set": "important", "flag-clear": "comment", address: "number", "address-stack": "number",
	"address-heap": "number", "address-code": "number", "address-data": "number", "address-rodata": "number",
	number: "number", symbol: "function", mnemonic: "keyword", "mnemonic-branch": "keyword", current: "important",
	arrow: "operator", string: "string", comment: "comment", offset: "comment", taken: "important",
	"not-taken": "comment", perm: "keyword", path: "string", "msg-info": "comment", "msg-ok": "inserted",
	"msg-warn": "important", "msg-error": "deleted", signal: "important", keyword: "keyword", enabled: "inserted",
	disabled: "deleted", punctuation: "punctuation", "heap-chunk": "class-name", bin: "class-name",
};
const isWrapper = (t: string) => t.startsWith("pwndbg-") || t.startsWith("gdb-");

interface Leaf {
	type: string;
	alias: string | undefined;
	text: string;
}
function leaves(stream: TokenStream, out: Leaf[] = [], inherited?: Token): Leaf[] {
	if (typeof stream === "string") {
		if (inherited && stream.trim()) {
			const alias = Array.isArray(inherited.alias) ? inherited.alias[0] : inherited.alias;
			out.push({ type: inherited.type, alias, text: stream.trim() });
		}
		return out;
	}
	if (Array.isArray(stream)) {
		for (const s of stream) leaves(s, out, inherited);
		return out;
	}
	const t = stream as Token;
	return leaves(t.content, out, isWrapper(t.type) ? inherited : t);
}
const tok = (text: string, grammar = LANGUAGES.pwndbg!) => leaves(Prism.tokenize(text, grammar));
const fmt = (ls: Leaf[]) => ls.map((l) => `${l.type}:${l.text}`).join(" ");

/** Assert that each [text, type] pair appears as a leaf token, in order. */
function expectTokens(line: string, expected: [string, string][]) {
	const got = tok(line);
	let i = 0;
	for (const [text, type] of expected) {
		while (i < got.length && got[i]!.text !== text) i++;
		assert.ok(i < got.length, `token ${JSON.stringify(text)} not found in ${JSON.stringify(line)}\n${fmt(got)}`);
		assert.equal(got[i]!.type, type, `type of ${JSON.stringify(text)} in ${JSON.stringify(line)}\n${fmt(got)}`);
		i++;
	}
}
/** the leaf type of the first token with this exact text */
const typeOf = (line: string, text: string) => tok(line).find((l) => l.text === text)?.type;

// ── prompt, startup, banners, legend ────────────────────────────────────────

test("prompt and command", () => {
	expectTokens("pwndbg> telescope $sp 20", [["pwndbg>", "prompt"], ["telescope $sp 20", "command"]]);
	expectTokens("pwndbg>", [["pwndbg>", "prompt"]]);
	expectTokens("pwndbg> ", [["pwndbg>", "prompt"]]);
});

test("startup lines and the tip of the day (header + text line)", () => {
	expectTokens("pwndbg: loaded 200 pwndbg commands. Type pwndbg [filter] for a list.", [
		["pwndbg: loaded 200 pwndbg commands. Type pwndbg [filter] for a list.", "comment"],
	]);
	expectTokens("Loaded 106 commands.  Type pwndbg [filter] for a list.", [
		["Loaded 106 commands.  Type pwndbg [filter] for a list.", "comment"],
	]);
	const tip =
		"------- tip of the day (disable with set show-tips off) -------\nUse search to find bytes/strings/ints/pointers in the process memory. See search --help for filters or examples";
	assert.equal(tok(tip).map((l) => l.type).join(","), "comment");
});

test("banners: current with extras, 2018-2022 bare, ≤2017 bracket form, mangled, bottom rule", () => {
	for (const l of [
		"─────────────────────────────────[ REGISTERS / show-flags off / show-compact-regs off ]─────────────────────────────────",
		"──────────────────────────────────────────[ DISASM / x86-64 / set emulate on ]──────────────────────────────────────────",
		"───────────────────────────────────────────────────[ SOURCE (CODE) ]────────────────────────────────────────────────────",
		"─────────────────────────────────────────────────[ THREADS (2 TOTAL) ]──────────────────────────────────────────────────",
		"──────────────────────────────[ DISASM ]───────────────────────────────",
		"[───────────────────────────────────────────REGISTERS───────────────────────────────────────────]",
		"[─────────────────────────────────────────────CODE──────────────────────────────────────────────]",
		"───────\\\\x80───────────────────────────[ STACK ]────────────────────────────────────",
		"[ REGISTERS / show-flags off / show-compact-regs off ]───",
		"────────────────────────────────────────────────────────────────────────────────",
	])
		assert.equal(fmt(tok(l)), `section:${l}`);
});

test("legend: both RWX (≤2024.02) and WX variants, words keyed to their address kinds", () => {
	for (const wx of ["WX", "RWX"])
		expectTokens(`LEGEND: STACK | HEAP | CODE | DATA | ${wx} | RODATA`, [
			["LEGEND:", "legend"], ["STACK", "address-stack"], ["|", "punctuation"], ["HEAP", "address-heap"],
			["CODE", "address-code"], ["DATA", "address-data"], [wx, "comment"], ["RODATA", "address-rodata"],
		]);
	expectTokens("LEGEND: MAPPED | GUARD | GAP", [["LEGEND:", "legend"], ["MAPPED", "comment"]]);
});

// ── registers ───────────────────────────────────────────────────────────────

test("registers: changed marker, chains, SP is stack, PC is code, bare values are numbers", () => {
	expectTokens("*RAX  0x5555555572fb (main) ◂— endbr64", [
		["*", "current"], ["RAX", "register"], ["0x5555555572fb", "address-code"], ["(main)", "symbol"],
		["◂—", "arrow"], ["endbr64", "mnemonic"],
	]);
	expectTokens("*RSP  0xffff9342cb00 {argv} —▸ 0xffff9342ccf8 —▸ 0xffff9342cec8 ◂— './test_x64'", [
		["RSP", "register"], ["0xffff9342cb00", "address-stack"], ["{argv}", "symbol"], ["—▸", "arrow"],
		["0xffff9342ccf8", "address"], ["0xffff9342cec8", "address"], ["'./test_x64'", "string"],
	]);
	expectTokens("*RIP  0x555555557317 (main+28) ◂— mov rax, qword ptr fs:[0x28]", [
		["0x555555557317", "address-code"], ["(main+28)", "symbol"], ["mov", "mnemonic"], ["rax", "register"],
		["0x28", "number"],
	]);
	expectTokens(" R8   0", [["R8", "register"], ["0", "number"]]);
	// RBX is not structurally a stack register; not dereferenceable = number
	expectTokens(" RAX  0xfffffffffffffdfc", [["0xfffffffffffffdfc", "number"]]);
	expectTokens(" SP   0xfffffffffa80 {argv} —▸ 0xfffffffffcc8 —▸ 0xfffffffffec6 ◂— '/work/test_arm64'", [
		["SP", "register"], ["0xfffffffffa80", "address-stack"],
	]);
	expectTokens(" PC   0xaaaaaaaa0ae8 (main+20) ◂— adrp x0, 0xaaaaaaabf000", [["0xaaaaaaaa0ae8", "address-code"], ["adrp", "mnemonic"]]);
	expectTokens(" X16  0xfffff7f9fd68 (_dl_audit_preinit@got.plt) —▸ 0xfffff7fd0d40 (_dl_audit_preinit) ◂— stp x29, x30, [sp, #-0x50]!", [
		["0xfffff7f9fd68", "address"], ["0xfffff7fd0d40", "address-code"], ["stp", "mnemonic"], ["#-0x50", "number"],
	]);
	// branch mnemonic and its symbolic target after ◂—
	expectTokens(" X17  0xfffff7e86d70 (free) ◂— cbz x0, free+276", [["cbz", "mnemonic-branch"], ["free+276", "symbol"]]);
	// an instruction carrying a /* 'str' */ comment (REVIEW §6.6)
	expectTokens(" X3   0xaaaaaaac0010 (g_cfg) —▸ 0xaaaaaaaa0e30 ◂— ldpsw x18, x25, [x11, #-0x50] /* 'review' */", [
		["0xaaaaaaaa0e30", "address-code"], ["ldpsw", "mnemonic"], ["/* 'review' */", "comment"],
	]);
	// int with ASCII repr and /* */ comment
	expectTokens(" R14  0x7f54cf747410 —▸ 0x7f54cf736050 ◂— 0xffffffff00000037 /* '7' */", [
		["0xffffffff00000037", "number"], ["/* '7' */", "comment"],
	]);
	// i386, 2020 (bare `0x0` values, `push   0x68 /* … */`)
	expectTokens(" EIP  0x10000 (_start) ◂— push   0x68 /* 0x2f68686a */", [
		["EIP", "register"], ["0x10000", "address-code"], ["push", "mnemonic"], ["/* 0x2f68686a */", "comment"],
	]);
	expectTokens(" ESP  0xffd3dd30 ◂— 0x1", [["0xffd3dd30", "address-stack"]]);
});

test("registers: compact two-column layout, ⏎ and ↪ overflow lines (REVIEW C1)", () => {
	expectTokens(" RAX  0                                                       *R11  0x55555555b420 ◂— 0x55555555b", [
		["RAX", "register"], ["0", "number"], ["*", "current"], ["R11", "register"], ["0x55555555b420", "address"],
	]);
	expectTokens("*RDX  0xffff9a8c6b20 —▸ 0x55555555bfe0 ◂— 0                   *R14  ⏎", [
		["RDX", "register"], ["R14", "register"], ["⏎", "comment"],
	]);
	expectTokens("↪*RSP  0xffff9b1bdb00 {argv} —▸ 0xffff9b1bdcf8 —▸ 0xffff9b1bdec8 ◂— './test_x64'", [
		["↪", "arrow"], ["*", "current"], ["RSP", "register"], ["0xffff9b1bdb00", "address-stack"],
	]);
	expectTokens("↪*RIP  0x555555557489 (main+398) ◂— mov rax, qword ptr [rbp - 0xb8]", [["0x555555557489", "address-code"]]);
});

test("flags: uppercase = set, lowercase = clear (EFLAGS, CPSR)", () => {
	expectTokens("*EFLAGS 0x206 [ cf PF af zf sf IF df of iopl:00 ac ]", [
		["EFLAGS", "register"], ["0x206", "number"], ["cf", "flag-clear"], ["PF", "flag-set"], ["IF", "flag-set"],
		["iopl", "flag-clear"], ["00", "number"], ["]", "punctuation"],
	]);
	expectTokens(" CPSR 0x80001000 [ N z c v q pan il d a i f el sp ]", [["N", "flag-set"], ["z", "flag-clear"], ["sp", "flag-clear"]]);
});

// ── disassembly ─────────────────────────────────────────────────────────────

test("disasm: markers, annotations, targets", () => {
	expectTokens("b► 0x555555557317 <main+28>    mov    rax, qword ptr fs:[0x28]        RAX, [0xffff92927768] => 0x76f85efbfd30d300", [
		["b", "keyword"], ["►", "current"], ["0x555555557317", "address-code"], ["<main+28>", "symbol"], ["mov", "mnemonic"],
		["rax", "register"], ["RAX", "register"], ["0xffff92927768", "address"], ["=>", "arrow"], ["0x76f85efbfd30d300", "number"],
	]);
	expectTokens("   0x55555555732d <main+50>    mov    qword ptr [rbp - 0xb8], rax     [{fp}] <= 0x5555555571c9 (add) ◂— endbr64 ", [
		["{fp}", "symbol"], ["<=", "arrow"], ["0x5555555571c9", "address-code"], ["(add)", "symbol"], ["endbr64", "mnemonic"],
	]);
	expectTokens("b+ 0x555555557317 <main+28>    mov    rax, qword ptr fs:[0x28]", [["b+", "keyword"], ["0x555555557317", "address-code"]]);
	expectTokens(" ► 0x555555557320 <main+37>    mov    qword ptr [rbp - 8], rax        [0xffff9342cbc8] <= 0x76f85efbfd30d300", [
		["►", "current"], ["0xffff9342cbc8", "address"], ["<=", "arrow"],
	]);
	expectTokens("   0x555555557379 <main+126>    jmp    main+161                    <main+161>", [
		["jmp", "mnemonic-branch"], ["main+161", "symbol"], ["<main+161>", "symbol"],
	]);
	expectTokens("   0x7f54cf7b986a    cmp    rax, -4     0xfffffffffffffdfc - -0x4     EFLAGS => 0x287 [ CF PF af zf SF IF df of iopl:00 ac ]", [
		["0x7f54cf7b986a", "address-code"], ["cmp", "mnemonic"], ["0xfffffffffffffdfc", "number"], ["EFLAGS", "register"],
		["=>", "arrow"], ["0x287", "number"], ["CF", "flag-set"], ["af", "flag-clear"],
	]);
	expectTokens("   0x7f54cf7b986e  ✔ jne    0x7f54cf7b98c3              <0x7f54cf7b98c3>", [
		["✔", "taken"], ["jne", "mnemonic-branch"], ["0x7f54cf7b98c3", "address-code"], ["<", "punctuation"], ["0x7f54cf7b98c3", "address-code"],
	]);
	expectTokens("b► 0x5555555573a3 <main+168>  ✘ jle    main+128                    <main+128>", [["✘", "not-taken"], ["jle", "mnemonic-branch"]]);
	expectTokens("   0xffff8948e1de             ? je     0xffff8948e1f0              <0xffff8948e1f0>", [["?", "comment"], ["je", "mnemonic-branch"]]);
	expectTokens(" ► 0x7f54cf7bbef4    ret                                <0x7f54cf7b9868>", [["ret", "mnemonic-branch"], ["0x7f54cf7b9868", "address-code"]]);
	expectTokens("   0x7ffff7da46c1               lock sub dword ptr [rip + 0x1bea07], 1", [["lock sub", "mnemonic"], ["rip", "register"]]);
	expectTokens("   0xaaaaaaaa0b00 <main+44>    add    x0, x0, #0x918         X0 => 0xaaaaaaaa0918 (add) (0xaaaaaaaa0000 + 0x918)", [
		["X0", "register"], ["0xaaaaaaaa0918", "address"], ["(add)", "symbol"], ["0xaaaaaaaa0000", "number"], ["0x918", "number"],
	]);
	// aligned symbol column (2025) and 2017 single-space target
	expectTokens("b+ 0x4013fd       <vuln+191>    nop    ", [["0x4013fd", "address-code"], ["<vuln+191>", "symbol"], ["nop", "mnemonic"]]);
	expectTokens("   0x7ffff7b165f0 <write>                 cmp    dword ptr [rip + 0x2c2149], 0 <0x7ffff7dd8740>", [
		["cmp", "mnemonic"], ["0x7ffff7dd8740", "address-code"],
	]);
	expectTokens("   0x7ffff7e1e859 <execve>    syscall  <SYS_execve>", [["syscall", "mnemonic"], ["<SYS_execve>", "symbol"]]);
});

test("disasm: opcode bytes and the branch-visualization column (REVIEW C3)", () => {
	expectTokens("   0xaaaaaaaa0d38 00 00 82 d2    <main+488>    mov    x0, #0x1000     X0 => 0x1000", [
		["0xaaaaaaaa0d38", "address-code"], ["00", "number"], ["d2", "number"], ["<main+488>", "symbol"], ["mov", "mnemonic"],
	]);
	expectTokens("   0xaaaaaaaa0c30 <main+348>                    └<   b.le   main+308                    <main+308>", [
		["└<", "punctuation"], ["b.le", "mnemonic-branch"], ["main+308", "symbol"],
	]);
	expectTokens("   0xaaaaaaaa0d30 <main+480>                    ▲    cmp    w0, #3", [["▲", "punctuation"], ["cmp", "mnemonic"], ["#3", "number"]]);
	expectTokens("    ↓", [["↓", "arrow"]]);
	expectTokens("Invalid address 0x1d66a090", [["Invalid address", "msg-error"], ["0x1d66a090", "address"]]);
});

test("call arguments", () => {
	expectTokens("        rsi: 0x555555558004 ◂— 'Hello, pwndbg!'", [["rsi", "register"], [":", "punctuation"], ["0x555555558004", "address"], ["'Hello, pwndbg!'", "string"]]);
	expectTokens("        format: 0x55555555801b ◂— '%s %s r=%d stack=%s\\n'", [["format", "keyword"], ["'%s %s r=%d stack=%s\\n'", "string"]]);
	expectTokens("        r8: 0xffff89f5eb90 {stackbuf} ◂— 'AAAAAAAABBBBBBBBCCCCCCCC'", [["0xffff89f5eb90", "address-stack"]]);
});

// ── source / stack / backtrace / threads panes ──────────────────────────────

test("source pane (anchored on `In file:`)", () => {
	const pane = "In file: /work/test.c:24\n   23 \n ► 24 int main(int argc, char **argv) {\n   30     strcpy(stackbuf, \"AAAAAAAABBBBBBBBCCCCCCCC\");";
	expectTokens(pane, [
		["In file:", "keyword"], ["/work/test.c", "path"], ["24", "number"], ["23", "number"], ["►", "current"], ["24", "number"],
		["30", "number"], ['"AAAAAAAABBBBBBBBCCCCCCCC"', "string"],
	]);
	// source code digits are not line numbers
	assert.equal(typeOf("In file: /x.c:1\n   19     char buf[32];", "32"), undefined);
});

test("telescope: stack pane rows are stack; elsewhere only with sp/bp/fp label or frame offset (REVIEW §6.4)", () => {
	const pane = "───────────────────────[ STACK ]───────────────────────\n00:0000│ rsp 0xffff9342cb00 {argv} —▸ 0xffff9342ccf8 —▸ 0xffff9342cec8 ◂— './test_x64'\n01:0008│      0xffd3dd34 —▸ 0xffd3ede6 ◂— 0x2d667463 ('ctf-')\n... ↓     2 skipped";
	expectTokens(pane, [
		["00:0000", "offset"], ["│", "punctuation"], ["rsp", "register"], ["0xffff9342cb00", "address-stack"],
		["0xffd3dd34", "address-stack"], ["0x2d667463", "number"], ["'ctf-'", "string"], ["...", "comment"], ["↓", "arrow"], ["2", "number"],
	]);
	expectTokens("01:0008│-0c8 0xffff9342cb08 ◂— 0x100000006", [["-0c8", "offset"], ["0xffff9342cb08", "address-stack"]]);
	expectTokens("01:0004│+004     0x40800b9c —▸ 0x8049beb (main+567) ◂— add esp, 0x20", [["+004", "offset"], ["0x40800b9c", "address-stack"], ["0x8049beb", "address-code"]]);
	expectTokens("00:0000│ ebp esp 0x40800b98 —▸ 0x40800c98 ◂— 1", [["ebp", "register"], ["esp", "register"], ["0x40800b98", "address-stack"]]);
	// `telescope &global` / `tls`: not stack
	expectTokens("00:0000│     0x55555555a020 (global_buf) ◂— 'global data string'", [["0x55555555a020", "address"]]);
	expectTokens("00:0000│ fs_base 0xffff9a6b8740 ◂— 0xffff9a6b8740", [["fs_base", "register"], ["0xffff9a6b8740", "address"]]);
	expectTokens("02:0010│ r9 0x7ffff7d6e010 ◂— 0x21299", [["0x7ffff7d6e010", "address"]]);
	expectTokens("44d6:226b0│    0x7ffff7d906b0 —▸ 0x7ffff7fad580 —▸ 0x7ffff7fa9820 —▸ 0x7ffff7f6d1d7 ◂— 0x636d656d5f5f0043 /* 'C' */", [
		["44d6:226b0", "offset"], ["0x7ffff7f6d1d7", "address"], ["/* 'C' */", "comment"],
	]);
	expectTokens("06:0030│-150 0xfffffffffa00 —▸ 0xaaaaaaac1380 —▸ 0xaaaaaaac1360 —▸ 0xaaaaaaac1340 —▸ 0xaaaaaaac1320 —▸ ...", [["...", "comment"]]);
	expectTokens("<Could not read memory at 0xd4be1680>", [["Could not read memory at", "msg-error"], ["0xd4be1680", "address"]]);
	expectTokens("... ↓", [["...", "comment"], ["↓", "arrow"]]);
});

test("backtrace pane: current, padded columns, `f N` (≤2023.03), no-0x addresses (≤2020.07), None", () => {
	expectTokens(" ► 0 0x555555557317 main+28", [["►", "current"], ["0", "number"], ["0x555555557317", "address-code"], ["main+28", "symbol"]]);
	expectTokens("   1 0xfffff7e184c4", [["1", "number"], ["0xfffff7e184c4", "address-code"]]);
	expectTokens(" ► 0         0x4013fe vuln+192", [["0x4013fe", "address-code"], ["vuln+192", "symbol"]]);
	expectTokens("   2   0x7ffff7da46b5 None", [["None", "comment"]]);
	expectTokens(" ► f 0     7ffff7b165a0 __read_nocancel+7", [["f", "keyword"], ["0", "number"], ["7ffff7b165a0", "address-code"], ["__read_nocancel+7", "symbol"]]);
	expectTokens(" ► f 0    10000 _start", [["10000", "address-code"], ["_start", "symbol"]]);
	expectTokens(" ► f 0 1d66a090", [["1d66a090", "address-code"]]);
});

test("threads pane", () => {
	expectTokens('  ► 2   "rv_arm64" stopped: 0xaaaaaaaa0b08 <worker+44> ', [
		["►", "current"], ["2", "number"], ['"rv_arm64"', "string"], ["stopped", "keyword"], ["0xaaaaaaaa0b08", "address-code"], ["<worker+44>", "symbol"],
	]);
});

// ── memory commands ─────────────────────────────────────────────────────────

test("vmmap: kinds follow pwndbg's own order ([stack, x, read-only, [heap, writable), never the address prefix", () => {
	expectTokens("    0x55555555b000     0x55555557c000 rw-p    21000       0 [heap]", [
		["0x55555555b000", "address-heap"], ["0x55555557c000", "address-heap"], ["rw-p", "perm"], ["21000", "number"], ["[heap]", "path"],
	]);
	expectTokens("    0x5576febbf000     0x5576febc0000 ---p     1000       0 [heap]", [["0x5576febbf000", "address-rodata"]]);
	expectTokens("    0xffffaa0de000     0xffffaa8de000 rwxp   800000       0 [stack]", [["0xffffaa0de000", "address-stack"]]);
	expectTokens("0xffffffffff600000 0xffffffffff601000 --xp     1000       0 [vsyscall]", [["0xffffffffff600000", "address-code"]]);
	expectTokens("    0x7ffff7d93000     0x7ffff7dbb000 r--p    28000      0 /libc.so.6", [["0x7ffff7d93000", "address-rodata"], ["/libc.so.6", "path"]]);
	expectTokens("    0x555555556000     0x555555557000 r--p     1000       0 test_x64", [["test_x64", "path"]]);
	expectTokens("►   0x7ffff7d6e000     0x7ffff7d93000 rw-p    25000      0 [anon_7ffff7d6e] +0x226f8", [
		["►", "current"], ["0x7ffff7d6e000", "address-data"], ["[anon_7ffff7d6e]", "path"], ["+0x226f8", "number"],
	]);
	// 2020 layout, rows without a file
	expectTokens("0x56169187f000 0x561691881000 rw-p     2000 0", [["0x56169187f000", "address-data"], ["0", "number"]]);
	expectTokens("             Start                End Perm     Size  Offset File (set vmmap-prefer-relpaths on)", [
		["Start", "keyword"], ["File", "keyword"], ["(set vmmap-prefer-relpaths on)", "comment"],
	]);
	// --gaps
	expectTokens("    0xaaaaaaac1000     0xaaaaaaae2000 rw-p    21000  ADJACENT            0x23000", [["ADJACENT", "keyword"], ["0x23000", "number"]]);
	expectTokens("    0xfffff7f8a000     0xfffff7f9d000 ---p    13000     GUARD ", [["GUARD", "keyword"]]);
	expectTokens(" -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -        GAP            0x1d000", [["GAP", "keyword"], ["0x1d000", "number"]]);
	expectTokens("Total memory mapped: 0x234000 (2 MB)", [["Total memory mapped:", "keyword"], ["0x234000", "number"]]);
});

test("elfsections, xinfo, tls, canary, piebase, distance, retaddr", () => {
	expectTokens("    0x5555555570e0     0x55555555754c      R-X      0x46c  .text", [["0x5555555570e0", "address-code"], ["R-X", "perm"], [".text", "symbol"]]);
	expectTokens("    0x55555555a000     0x55555555a068      RW-       0x68  .data", [["0x55555555a000", "address-data"]]);
	expectTokens("           Stack Top 0xffff9342cb00 = 0xffff92c2d000 + 0x7ffb00", [["Stack Top", "keyword"], ["0xffff9342cb00", "address-stack"], ["0x7ffb00", "number"]]);
	expectTokens("         Mapped Area 0xaaaaaaac1380 = 0xaaaaaaac1000 + 0x380", [["0xaaaaaaac1380", "address"]]);
	expectTokens("         File (Disk) 0x555555558004 = /work/test_x64 + 0x2004", [["/work/test_x64", "path"]]);
	expectTokens("Thread Local Storage (TLS) base: 0xfffff7ff8620", [["0xfffff7ff8620", "address"]]);
	expectTokens("AT_RANDOM  = 0xffff9342ceb0 # points to the canary value on glibc < 2.44", [
		["AT_RANDOM", "keyword"], ["0xffff9342ceb0", "address"], ["# points to the canary value on glibc < 2.44", "comment"],
	]);
	expectTokens("Canary     = 0x76f85efbfd30d300", [["0x76f85efbfd30d300", "number"]]);
	expectTokens("00:0000│-308 0xffff9342c8c8 ◂— 0x76f85efbfd30d300", [["0xffff9342c8c8", "address-stack"]]);
	expectTokens("Calculated VA from /work/test_x64 = 0x555555556000", [["/work/test_x64", "path"], ["0x555555556000", "address"]]);
	expectTokens("0xffff9342cb00->0x555555557489 is -0xaaaa3ded5677 bytes (-0x155547bdaacf words)", [
		["0xffff9342cb00", "address"], ["->", "arrow"], ["-0xaaaa3ded5677", "number"],
	]);
	expectTokens("0xffff9342cc78 —▸ 0xffff9295c28b (__libc_start_main+139) ◂— mov r15, qword ptr [rip + 0x1d8cf6]", [
		["0xffff9342cc78", "address"], ["0xffff9295c28b", "address-code"],
	]);
	expectTokens("ASLR is OFF (read status from process' personality)", [["OFF", "disabled"]]);
});

test("hexdump and windbg-style dumps", () => {
	expectTokens("+0010 0x55555555a030  6e 67 00 00 00 00 00 00  00 00 00 00 00 00 00 00  │ng......│........│", [
		["+0010", "offset"], ["0x55555555a030", "address"], ["6e", "number"], ["00", "comment"], ["│", "punctuation"], ["ng......", "comment"],
	]);
	expectTokens("... ↓            skipped 2 identical lines (32 bytes)", [["↓", "arrow"], ["2", "number"], ["32", "number"]]);
	expectTokens("0000ffff9b1bdb00     0000ffff9b1bdcf8 0000000100000006", [["0000ffff9b1bdb00", "address"], ["0000ffff9b1bdcf8", "number"]]);
	expectTokens("555555558004 'Hello, pwndbg!'", [["555555558004", "address"], ["'Hello, pwndbg!'", "string"]]);
});

test("checksec: current, weak, hardened, pwntools-style (REVIEW C8)", () => {
	expectTokens("RELRO:      Full RELRO", [["RELRO", "keyword"], ["Full RELRO", "enabled"]]);
	expectTokens("RELRO:      Partial RELRO", [["Partial RELRO", "keyword"]]);
	expectTokens("Stack:      No canary found", [["No canary found", "disabled"]]);
	expectTokens("NX:         NX unknown - GNU_STACK missing", [["NX unknown - GNU_STACK missing", "disabled"]]);
	expectTokens("PIE:        No PIE (0x400000)", [["No PIE", "disabled"], ["0x400000", "address"]]);
	expectTokens("RWX:        Has RWX segments", [["Has RWX segments", "disabled"]]);
	expectTokens("FORTIFY:    Enabled", [["Enabled", "enabled"]]);
	expectTokens("File:     /work/test_x64", [["File", "keyword"], ["/work/test_x64", "path"]]);
	expectTokens("[*] '/usr/bin/ls'", [["[*]", "msg-info"], ["/usr/bin/ls", "path"]]);
	expectTokens("    Arch:     amd64-64-little", [["Arch", "keyword"]]);
	expectTokens("    Stack:    Canary found", [["Canary found", "enabled"]]);
	expectTokens("'/usr/bin/ls'", [["/usr/bin/ls", "path"]]);
});

test("got and plt", () => {
	expectTokens("[0xaaaaaaabffb0] free@GLIBC_2.17 -> 0xfffff7e86d70 (free) ◂— cbz x0, free+276", [
		["0xaaaaaaabffb0", "address"], ["free@GLIBC_2.17", "symbol"], ["->", "arrow"], ["0xfffff7e86d70", "address-code"],
	]);
	expectTokens("[0xaaaaaaabffa0] __gmon_start__ -> 0", [["0", "number"]]);
	expectTokens("GOT protection: Full RELRO | Found 14 GOT entries passing the filter", [["GOT protection:", "keyword"], ["Full RELRO", "enabled"]]);
	expectTokens("State of the GOT of /work/test_arm64:", [["/work/test_arm64", "path"]]);
	expectTokens("Section .plt.sec 0x555555557090 - 0x5555555570e0:", [["Section", "keyword"], [".plt.sec", "symbol"], ["0x555555557090", "address-code"]]);
	expectTokens("0x555555557090: free@plt", [["0x555555557090", "address-code"], ["free@plt", "symbol"]]);
});

test("search: hits only after a `Searching for` header; kind from the mapping or the value", () => {
	const block = [
		"Searching for byte: b'BBBBBBBB'",
		"test_x64        0x555555557344 mov qword ptr [rax], rsi",
		"[stack]         0xffff9342cb98 'BBBBBBBBCCCCCCCC'",
		"[heap]          0xaaaaaaac3010 'AAAAAAAABBBBBBBB with spaces and \\\\ backslash <-- tricky'",
		"warning: Unable to access 16000 bytes of target memory at 0xfffff7f91d07, halting search.",
		"ls              0x555555554007 0",
	].join("\n");
	expectTokens(block, [
		["Searching for", "keyword"], ["b'BBBBBBBB'", "string"], ["test_x64", "path"], ["0x555555557344", "address-code"], ["mov", "mnemonic"],
		["[stack]", "path"], ["0xffff9342cb98", "address-stack"], ["0xaaaaaaac3010", "address-heap"], ["0xfffff7f91d07", "address"],
		["ls", "path"], ["0x555555554007", "address"], ["0", "number"],
	]);
	// the row shape alone is not a search hit (REVIEW §2.1 `search` catch-all)
	assert.equal(fmt(leaves(Prism.tokenize("libfoo.so      0x1234 hello", pwndbg))), "");
});

test("rop: ROPgadget and pwndbg gadget styles", () => {
	expectTokens("0x0005b13d : pop rdi ; pop rbp ; ret", [
		["0x0005b13d", "address-code"], [":", "punctuation"], ["pop", "mnemonic"], ["rdi", "register"], [";", "punctuation"], ["ret", "mnemonic-branch"],
	]);
	expectTokens("0xaaaaaaaa0b38: b.eq worker+100 ; bl __stack_chk_fail@plt ; mov x0, x1 ; ldp x29, x30, [sp, #0x20] ; add sp, sp, #0x30 ; ret", [
		["b.eq", "mnemonic-branch"], ["worker+100", "symbol"], ["bl", "mnemonic-branch"], ["__stack_chk_fail@plt", "symbol"], ["ldp", "mnemonic"],
	]);
	expectTokens("Unique gadgets found: 8514", [["Unique gadgets found:", "keyword"], ["8514", "number"]]);
});

test("cyclic", () => {
	expectTokens("aaaabaaacaaadaaaeaaafaaagaaahaaa", [["aaaabaaacaaadaaaeaaafaaagaaahaaa", "string"]]);
	expectTokens("Finding cyclic pattern of 4 bytes: b'laaa' (hex: 0x6c616161)", [["b'laaa'", "string"], ["0x6c616161", "number"]]);
	expectTokens("Found at offset 44", [["Found at offset", "keyword"], ["44", "number"]]);
});

// ── heap ────────────────────────────────────────────────────────────────────

test("heap chunks: current, 2020-2023 (`Free chunk (tcache)`, no flag bits), ≤2019 struct dump (REVIEW C11)", () => {
	expectTokens("Free chunk (tcachebins) | PREV_INUSE", [["Free chunk (tcachebins)", "heap-chunk"], ["|", "punctuation"], ["PREV_INUSE", "flag-set"]]);
	expectTokens("Allocated chunk | PREV_INUSE | IS_MMAPED", [["IS_MMAPED", "flag-set"]]);
	expectTokens("Free chunk (tcache) | PREV_INUSE", [["Free chunk (tcache)", "heap-chunk"]]);
	expectTokens("Addr: 0x55555555b290", [["Addr", "keyword"], ["0x55555555b290", "address-heap"]]);
	expectTokens("Size: 0x290 (with flag bits: 0x291)", [["0x290", "number"], ["with flag bits:", "comment"], ["0x291", "number"]]);
	expectTokens("Size: 0x191", [["0x191", "number"]]);
	// fd/bk of small/large/unsorted chunks point into main_arena: neutral address (REVIEW C12)
	expectTokens("fd: 0x7cb42c819ce0", [["fd", "keyword"], ["0x7cb42c819ce0", "address"]]);
	expectTokens("0x603000 FASTBIN {", [["0x603000", "address-heap"], ["FASTBIN", "flag-set"], ["{", "punctuation"]]);
	expectTokens("Top Chunk: 0x603050", [["Top Chunk", "heap-chunk"], ["0x603050", "address-heap"]]);
	expectTokens("Support for tcache large bins (a GLIBC 2.42 addition) has not been fully implemented. PR contributions are highly appreciated!", [
		["Support for tcache large bins (a GLIBC 2.42 addition) has not been fully implemented. PR contributions are highly appreciated!", "msg-warn"],
	]);
});

test("bins: titles, tcache counts (also negative), chain heads are heap, tails are not, empty / corrupted", () => {
	expectTokens("tcachebins", [["tcachebins", "bin"]]);
	expectTokens("0x30 [  7]:  0x55555555b3c0 —▸ 0x55555555b390 —▸ 0x55555555b2a0 ◂— 0", [
		["0x30", "number"], ["7", "number"], ["0x55555555b3c0", "address-heap"], ["0x55555555b390", "address-heap"], ["0x55555555b2a0", "address-heap"], ["0", "number"],
	]);
	expectTokens("0x20 [-57536]: 0", [["-57536", "number"], ["0", "number"]]);
	expectTokens("0x50 [ 16]: 0x3120636f6c6c616d ('malloc 1')", [["0x3120636f6c6c616d", "number"], ["'malloc 1'", "string"]]);
	expectTokens("0x90:        0xaaaaaaac1910 —▸ 0xaaaaaaac1860 —▸ 0xfffff7fa0b30 (main_arena+224) ◂— 0xaaaaaaac1910", [
		["0x90", "number"], ["0xaaaaaaac1910", "address-heap"], ["0xaaaaaaac1860", "address"], ["0xfffff7fa0b30", "address"], ["(main_arena+224)", "symbol"],
	]);
	expectTokens("0x500-0x530: 0xaaaaaaac19c0 —▸ 0xfffff7fa0ee0 (main_arena+1168) ◂— 0xaaaaaaac19c0", [
		["0x500", "number"], ["-", "punctuation"], ["0x530", "number"], ["0xaaaaaaac19c0", "address-heap"],
	]);
	expectTokens("all: 0x5fb67444a380 —▸ 0x7978dba19ce0 (main_arena+96) ◂— 0x5fb67444a380", [["all", "bin"], ["0x5fb67444a380", "address-heap"]]);
	expectTokens("0x30: 0x0", [["0x30", "number"], ["0x0", "number"]]);
	expectTokens("0x20: 0x55555555a4b0 —▸ 0x55555555a5c0 —▸ 0x55555555a8e0 —▸ 0x55555555a980 —▸ 0x55555555ab20 ◂— ...", [["0x55555555a4b0", "address-heap"], ["...", "comment"]]);
	expectTokens("empty", [["empty", "comment"]]);
	expectTokens("0x90 [corrupted]", [["[corrupted]", "msg-error"]]);
	expectTokens("all [corrupted]", [["all", "bin"], ["[corrupted]", "msg-error"]]);
	expectTokens("FD: 0x61618d6c4380 —▸ 0x7f82b3e19ce0 (main_arena+96) ◂— 0x61618d6c4380", [["FD", "keyword"], ["0x61618d6c4380", "address-heap"], ["0x7f82b3e19ce0", "address"]]);
});

test("bins entry vs `x/gx` ordering collision (REVIEW §2.1)", () => {
	// a 6+ digit label, or padded memory words, is GDB `x/` output, not a bin
	expectTokens("0x603020:\t0x0000000000000000\t0x0000000000000031", [["0x603020", "address"]]);
	assert.equal(fmt(leaves(Prism.tokenize("0x10000:\t0x0000000000000000\t0x0000000000000031", pwndbg))), "");
	assert.equal(fmt(leaves(Prism.tokenize("0x8000:  0x00000000      0x00000001", pwndbg))), "");
});

test("vis: heap rows, cells, ASCII with spaces, labels (REVIEW C4)", () => {
	expectTokens("0x55555555b2a0\t0x000000055555555b\t0x5368e5dc04201038\t[UUU....8. ...hS\t <-- tcachebins[0x30][6/7]", [
		["0x55555555b2a0", "address-heap"], ["0x000000055555555b", "number"], ["[UUU....8. ...hS", "comment"], ["<--", "arrow"],
		["tcachebins", "bin"], ["0x30", "number"], ["6", "number"],
	]);
	expectTokens("0x555555757010\t0x00007ffff7dd6790\t0x0000555555757020\t.g...... puUUU..", [[".g...... puUUU..", "comment"]]);
	expectTokens("0x555555757120\t0x0000000000000000\t0x0000000000020ee1\t................\t <-- Top chunk", [["Top chunk", "heap-chunk"]]);
	// tabs expanded to spaces
	expectTokens("0x564f746f6930  0x0000000000000000      0x0000000000000431      ........1.......         <-- largebins[0x0][0]", [
		["0x564f746f6930", "address-heap"], ["........1.......", "comment"], ["largebins", "bin"],
	]);
	expectTokens("0xaaaaaaac1420\t0x0000000000000000\t                  \t........", [["0xaaaaaaac1420", "address-heap"], ["........", "comment"]]);
	expectTokens("\t... ↓     4 repeated lines skipped", [["↓", "arrow"], ["4", "number"]]);
	expectTokens("Not all chunks were shown, see `vis --help` for more information.", [
		["Not all chunks were shown, see `vis --help` for more information.", "msg-warn"],
	]);
});

// ── messages ────────────────────────────────────────────────────────────────

test("messages, errors, GDB 17 prefixes, LAST SIGNAL", () => {
	expectTokens("[+] done", [["[+]", "msg-ok"]]);
	expectTokens("[!] oops", [["[!]", "msg-error"]]);
	expectTokens("⚠️ warning: Could not load vsyscall page because no executable was specified", [
		["⚠️ warning: Could not load vsyscall page because no executable was specified", "msg-warn"],
	]);
	expectTokens('❌️ No symbol table is loaded.  Use the "file" command.', [['❌️ No symbol table is loaded.  Use the "file" command.', "msg-error"]]);
	expectTokens("Exception occurred: malloc_chunk: Cannot access memory at address 0x555554000000 (<class 'pwndbg.dbg_mod.DebuggerError'>)", [
		["0x555554000000", "address"],
	]);
	expectTokens("ERROR: Could not find ELF base!", [["ERROR: Could not find ELF base!", "msg-error"]]);
	expectTokens("FileNotFoundError: [Errno 2] File '/bin/busybox' does not exist", [["FileNotFoundError: [Errno 2] File '/bin/busybox' does not exist", "msg-error"]]);
	expectTokens("Program received signal SIGSEGV (fault address: 0x0).", [["Program received signal SIGSEGV (fault address: 0x0).", "signal"]]);
	expectTokens("Program received signal SIGABRT", [["Program received signal SIGABRT", "signal"]]);
	expectTokens("No arena found for thread 2 (the thread hasn't performed any allocations).", [
		["No arena found for thread 2 (the thread hasn't performed any allocations).", "msg-warn"],
	]);
});

// ── non-interference with plain GDB / prose ────────────────────────────────

test("plain GDB lines are left to the gdb base grammar", () => {
	for (const l of [
		"Breakpoint 1, main (argc=0x1, argv=0xffff9342ccf8) at test.c:24",
		"Breakpoint 1 at 0x555555557317: file test.c, line 24.",
		"#1  0x0000ffff9295c1ca in ?? () from /usr/x86_64-linux-gnu/lib/libc.so.6",
		"10 0x00000000004042d0 in ?? ()",
		"0x00007ffff7b165a0 in __read_nocancel () at ../sysdeps/unix/syscall-template.S:84",
		"0x0000000000000000 in ?? ()",
		"=> 0x555555557489 <main+398>:\tmov    rax,QWORD PTR [rbp-0xb8]",
		"   0x4011a7:\tpush   rbp",
		"   0x4011a7:       push   rbp",
		"   0x0000555555557326 <+43>:\tlea    rax,[rip+0xfffffffffffffe9c]        # 0x5555555571c9 <add>",
		"0xffff9342cb00:\t0x0000ffff9342ccf8\t0x0000000100000006",
		"0x555555558004:\t\"Hello, pwndbg!\"",
		"0x0000555555557320\t24\tint main(int argc, char **argv) {",
		"24\tint main(int argc, char **argv) {",
		"rax            0x0                 0x0",
		"rip            0x555555557489      0x555555557489 <main+398>",
		"1       breakpoint     keep y   0x0000555555557317 in main at test.c:24",
		"\tbreakpoint already hit 1 time",
		"        i = 0x8",
		"* 1    Thread 717.717 (CPU#0 [running]) main (argc=0x1, argv=0xffff9b1bdcf8) at test.c:38",
		"0x0000ffff92bef000  0x0000ffff92c19195  Yes (*)     /usr/x86_64-linux-gnu/lib64/ld-linux-x86-64.so.2",
		"      0x555555556000     0x555555557000     0x1000        0x0  r--p   /work/test_x64",
		"Program received signal SIGSEGV, Segmentation fault.",
		"Hello, pwndbg! global data string r=39 stack=AAAAAAAABBBBBBBBCCCCCCCC",
		"buf=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
		"*** stack smashing detected ***: terminated",
	])
		assert.equal(fmt(leaves(Prism.tokenize(l, pwndbg))), "", `pwndbg rules must not claim: ${l}`);
});

// ── whole fixtures ──────────────────────────────────────────────────────────

/** fixture lines no rule should claim: program I/O, shell lines, author elisions */
const UNCLAIMED = new Set([
	"{",
	"Hello, pwndbg! global data string r=39 stack=AAAAAAAABBBBBBBBCCCCCCCC",
	"buf=short",
	"(...)",
	"    ...",
	"~~~",
	"$ pidof sh",
	"3045846 3045818 3045733 3043008 3042910 3023265 3023258 3022148 4720",
	"[20:33][~]$ docker run -it alpine:edge sh",
	"[20:33][~]$ gdb -p '3045846'",
	"global_max_fast symbol not found, using the default value: 0x80",
]);

test("fixtures: every line is tokenized; types and aliases follow TOKENS.md", () => {
	for (const name of fixtureNames) {
		const text = fixture(name);
		const lines = text.split("\n");
		const touched = new Set<number>();
		let at = 0;
		const walk = (s: TokenStream, inh?: Token) => {
			if (typeof s === "string") {
				const parts = s.split("\n");
				parts.forEach((p, i) => {
					if (!inh || !p.trim()) return;
					touched.add(at + i);
					const alias = Array.isArray(inh.alias) ? inh.alias[0] : inh.alias;
					assert.ok(inh.type in ALIAS, `${name}: non-taxonomy token type ${inh.type} on ${JSON.stringify(lines[at + i])}`);
					if (ALIAS[inh.type] !== inh.type) assert.equal(alias, ALIAS[inh.type], `${name}: alias of ${inh.type}`);
				});
				at += parts.length - 1;
				return;
			}
			if (Array.isArray(s)) return s.forEach((x) => walk(x, inh));
			const t = s as Token;
			walk(t.content, isWrapper(t.type) ? inh : t);
		};
		walk(Prism.tokenize(text, LANGUAGES.pwndbg!));
		lines.forEach((line, i) => {
			if (line.trim() && !UNCLAIMED.has(line)) assert.ok(touched.has(i), `${name}:${i + 1}: untouched ${JSON.stringify(line)}`);
		});
	}
});

test("fixtures: tabs→spaces, trailing-space trim and CRLF do not change tokenization", () => {
	const expand = (l: string) => {
		let o = "";
		for (const c of l) o += c === "\t" ? " ".repeat(8 - (o.length % 8)) : c;
		return o;
	};
	const sig = (t: string) => tok(t).map((l) => `${l.type}:${l.text.replace(/\s+/g, " ")}`).join("\n");
	for (const name of fixtureNames) {
		const text = fixture(name);
		const base = sig(text);
		assert.equal(sig(text.split("\n").map(expand).join("\n")), base, `${name}: tabs→spaces`);
		assert.equal(sig(text.split("\n").map((l) => l.replace(/[\t ]+$/, "")).join("\n")), base, `${name}: trailing trim`);
		assert.equal(sig(text.replace(/\n/g, "\r\n")), base, `${name}: CRLF`);
	}
});

test("performance: 5,000 lines in < 200 ms", () => {
	const all = fixtureNames.map(fixture).join("\n").split("\n");
	const lines: string[] = [];
	while (lines.length < 5000) lines.push(...all);
	const text = lines.slice(0, 5000).join("\n");
	Prism.tokenize(text, LANGUAGES.pwndbg!); // warm-up (JIT)
	const t0 = performance.now();
	Prism.tokenize(text, LANGUAGES.pwndbg!);
	const ms = performance.now() - t0;
	assert.ok(ms < 200, `took ${ms.toFixed(1)} ms`);
});

test("performance: no fixture line padded to 20k chars takes > 20 ms (no quadratic space runs)", () => {
	const PAD = 20000;
	const seen = new Set<string>();
	const variants = (l: string): string[] => {
		// pad the end, the start, and the first three and the longest blank runs
		const runs = [...l.matchAll(/[\t ]+/g)];
		const longest = runs.reduce<RegExpExecArray | undefined>((a, m) => (!a || m[0].length > a[0].length ? m : a), undefined);
		const out = [l + " ".repeat(PAD) + "x", " ".repeat(PAD) + l];
		for (const m of new Set([...runs.slice(0, 3), ...(longest ? [longest] : [])]))
			out.push(l.slice(0, m.index) + " ".repeat(PAD) + l.slice(m.index! + m[0].length));
		return out;
	};
	Prism.tokenize(variants("00:0000│ rsp 0x1 ◂— 0").join("\n"), LANGUAGES.pwndbg!); // warm-up
	let worst = 0;
	let worstLine = "";
	for (const name of fixtureNames)
		for (const line of fixture(name).split("\n")) {
			// one representative per line shape
			const shape = line.replace(/[0-9a-f]/g, "0").replace(/[\t ]+/g, " ").slice(0, 24);
			if (!line.trim() || seen.has(shape)) continue;
			seen.add(shape);
			for (const v of variants(line)) {
				const s = performance.now();
				Prism.tokenize(v, LANGUAGES.pwndbg!);
				const ms = performance.now() - s;
				if (ms > worst) [worst, worstLine] = [ms, line];
			}
		}
	assert.ok(worst < 20, `worst ${worst.toFixed(1)} ms on a padded ${JSON.stringify(worstLine)}`);
});
