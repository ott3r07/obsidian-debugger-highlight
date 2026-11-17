import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import Prism from "prismjs";
import type { Token, TokenStream } from "prismjs";
import { peda } from "../src/grammars/peda.ts";

const FIX = new URL("./fixtures/peda/", import.meta.url);
const fixtures = readdirSync(FIX).filter((f) => f.endsWith(".txt"));
const read = (f: string) => readFileSync(new URL(f, FIX), "utf8").replace(/\r/g, "");

/** Leaf tokens as [type, text]; `peda-*` containers are transparent. */
function leaves(text: string): [string, string][] {
	const out: [string, string][] = [];
	const walk = (s: TokenStream, type: string) => {
		if (typeof s === "string") {
			if (type && s.trim()) out.push([type, s]);
		} else if (Array.isArray(s)) {
			for (const x of s) walk(x, type);
		} else {
			const t = s as Token;
			walk(t.content, t.type.startsWith("peda-") ? type : t.type);
		}
	};
	walk(Prism.tokenize(text, peda), "");
	return out;
}

/** Assert that `line` contains each [type, text] pair (in order). */
function has(line: string, ...want: [string, string][]) {
	const got = leaves(line);
	let i = 0;
	for (const w of want) {
		while (i < got.length && !(got[i]![0] === w[0] && got[i]![1] === w[1])) i++;
		assert.ok(i < got.length, `missing ${w[0]}|${w[1]} in ${JSON.stringify(line)}\n got: ${JSON.stringify(got)}`);
		i++;
	}
}
const typeOf = (line: string, text: string) => leaves(line).find(([, t]) => t === text)?.[0];

const lines = (variant: (l: string) => string) =>
	fixtures.flatMap((f) => read(f).split("\n").map(variant)).filter((l) => l.trim());
const expandTabs = (l: string) => {
	let o = "";
	for (const c of l) o += c === "\t" ? " ".repeat(8 - (o.length % 8)) : c;
	return o;
};

test("every fixture line is tokenized (as-is, TABs expanded, trailing ws trimmed)", () => {
	const variants: Record<string, (l: string) => string> = {
		original: (l) => l,
		tabs: (l) => expandTabs(l).trimEnd(),
		trim: (l) => l.trimEnd(),
	};
	for (const [name, v] of Object.entries(variants)) {
		const missed = lines(v).filter((l) => leaves(l).length === 0);
		assert.deepEqual(missed, [], `${name}: untouched lines`);
	}
});

test("whole-line tokenization survives TAB loss (same leaf types)", () => {
	for (const l of lines((l) => l)) {
		if (!l.includes("\t")) continue;
		const a = leaves(l).map(([t]) => t);
		const b = leaves(expandTabs(l)).map(([t]) => t);
		assert.deepEqual(b, a, l);
	}
});

test("prompt, pager, banners, legend, stop reason", () => {
	has("gdb-peda$ x/10i $pc", ["prompt", "gdb-peda$"], ["command", "x/10i $pc"]);
	has("gdb-peda$", ["prompt", "gdb-peda$"]);
	has("--More--(25/52)q", ["prompt", "--More--(25/52)"], ["command", "q"]);
	for (const b of [
		"[----------------------------------registers-----------------------------------]",
		" [-------------------------------------code-------------------------------------]",
		"[----stack----]",
		"[---backtrace (innermost 10 frames)---]",
		"[------------------------------------------------------------------------------]",
	])
		assert.deepEqual(leaves(b), [["section", b]]);
	assert.deepEqual(leaves("Legend: code, data, rodata, value"), [["legend", "Legend: code, data, rodata, value"]]);
	has("Stopped reason: SIGSEGV", ["keyword", "Stopped reason"], ["signal", "SIGSEGV"]);
});

test("register lines and EFLAGS", () => {
	has("RAX: 0x401954 (<main>:\tendbr64)", ["register", "RAX"], ["address-code", "0x401954"], ["symbol", "<main>"], ["mnemonic", "endbr64"]);
	has("R8 : 0x4ac260 --> 0x4b58f0 --> 0x0 ", ["register", "R8"], ["address", "0x4ac260"], ["arrow", "-->"], ["address", "0x4b58f0"], ["number", "0x0"]);
	has("EIP: 0x80498f3 (<vuln+22>:\tsub    esp,0x8)", ["register", "EIP"], ["address-code", "0x80498f3"], ["mnemonic", "sub"], ["register", "esp"], ["number", "0x8"]);
	has("RBX: 0x1", ["register", "RBX"], ["number", "0x1"]);
	has(
		"EFLAGS: 0x297 (CARRY PARITY ADJUST zero SIGN trap INTERRUPT direction overflow)",
		["register", "EFLAGS"], ["number", "0x297"], ["flag-set", "CARRY"], ["flag-clear", "zero"], ["flag-set", "SIGN"], ["flag-clear", "overflow"],
	);
	// pattern-search register names are not register LINES
	assert.equal(typeOf("CANARY    : ENABLED", "CANARY"), "keyword");
});

test("chain annotations: every form, left-to-right element kinds", () => {
	// code with symbol (+ gdb comment inside the annotation, closing paren excluded)
	has(
		"RIP: 0x4019db (<main+214>:\tmov    rax,QWORD PTR [rip+0xa86ee]        # 0x4aa0d0 <gcounter>)",
		["address-code", "0x4019db"], ["symbol", "<main+214>"], ["mnemonic", "mov"], ["comment", " # 0x4aa0d0 <gcounter>"], ["punctuation", ")"],
	);
	// bare instruction
	has("0008| 0x2aaaab2abbc8 --> 0x2aaaab3181ca (mov    edi,eax)", ["offset", "0008|"], ["address-stack", "0x2aaaab2abbc8"], ["address-code", "0x2aaaab3181ca"], ["mnemonic", "mov"]);
	// gdb string -> address (kind unknown), value repr -> number
	has('0016| 0x2aaaab2abbb0 ("Hello, PEDA highlighter!")', ["address-stack", "0x2aaaab2abbb0"], ["string", '"Hello, PEDA highlighter!"']);
	has("RAX: 0xd ('\\r')", ["number", "0xd"], ["string", "'\\r'"]);
	has("RCX: 0x2000 ('')", ["number", "0x2000"], ["string", "''"]);
	has("EIP: 0x41414641 ('AFAA')", ["number", "0x41414641"], ["string", "'AFAA'"]);
	// repeats
	has(
		'RAX: 0x2aaaab2abba0 (\'A\' <repeats 80 times>, "BBBB")',
		["address", "0x2aaaab2abba0"], ["string", "'A'"], ["comment", "<repeats 80 times>"], ["punctuation", ","], ["string", '"BBBB"'],
	);
	has("RAX: 0x47f028 ('L' <repeats 200 times>...)", ["address", "0x47f028"], ["comment", "<repeats 200 times>"], ["comment", "..."]);
	// self reference
	has("RSI: 0x2aaaab2abb98 --> 0x2aaaab2abb90 (0x00002aaaab2abb98)", ["address", "0x2aaaab2abb98"], ["address", "0x2aaaab2abb90"], ["address", "0x00002aaaab2abb98"]);
	// truncation
	has("0048| 0x2aaaab2abbd0 --> 0x2aaaab2abc00 --> 0x2aaaab2abd00 (--> ...)", ["address", "0x2aaaab2abd00"], ["arrow", "-->"], ["comment", "..."]);
	// MemError (read-only branch only)
	has("RBX: 0x481000 (MemError)", ["address-rodata", "0x481000"], ["msg-error", "MemError"]);
	// strings may contain quotes, parens, arrows
	has(
		"0048| 0x2aaaab2abd10 --> 0x2aaaab2abee3 (\"GDB_EXTRA=-ex 'set sysroot (x) --> 0x1'\")",
		["address", "0x2aaaab2abee3"], ["string", "\"GDB_EXTRA=-ex 'set sysroot (x) --> 0x1'\""],
	);
	// degraded map: raw qword is a value
	has("RIP: 0x401967 --> 0x8d48097e029c7d83 ", ["address", "0x401967"], ["number", "0x8d48097e029c7d83"]);
	has("0016| Cannot access memory address", ["offset", "0016|"], ["msg-error", "Cannot access memory address"]);
	has('arg[0]: 0x481032 ("%s %s %d\\n")', ["keyword", "arg[0]"], ["address", "0x481032"], ["string", '"%s %s %d\\n"']);
	// symbol lost in an HTML copy
	has("ESP: 0xffffc9cc --> 0x8048620 (:\ttest   eax,eax)", ["address-code", "0x8048620"], ["mnemonic", "test"]);
});

test("code section: current, skipped, jump target, continuation, taken", () => {
	has("=> 0x40196b <main+23>:\tjle    0x401976 <main+34>", ["current", "=>"], ["address-code", "0x40196b"], ["symbol", "<main+23>"], ["mnemonic-branch", "jle"], ["address-code", "0x401976"], ["symbol", "<main+34>"]);
	has(" | 0x40196d <main+25>:\tlea    rax,[rip+0xffffffffffffff49]        # 0x4018bd <mul>", ["punctuation", "|"], ["address-code", "0x40196d"], ["mnemonic", "lea"], ["register", "rax"]);
	has(" |->   0x401976 <main+34>:\tlea    rax,[rip+0xffffffffffffff28]", ["arrow", "|->"], ["address-code", "0x401976"]);
	has(" |->=> 0x401900 <spin+8>:\tjmp    0x401900 <spin+8>", ["arrow", "|->"], ["current", "=>"], ["address-code", "0x401900"], ["mnemonic-branch", "jmp"]);
	has("       0x401986 <main+50>:\tcall   0x40f000 <malloc>", ["address-code", "0x401986"], ["mnemonic-branch", "call"], ["address-code", "0x40f000"]);
	has("=> 0x8049020:\tjmp    DWORD PTR ds:0x80e9000", ["address-code", "0x8049020"], ["mnemonic-branch", "jmp"]);
	has("   0x080485a7 :\tpush   ebp", ["address-code", "0x080485a7"], ["mnemonic", "push"], ["register", "ebp"]);
	has("   0x00000000004019f0 <+156>:\tmov    ecx,DWORD PTR [rbp-0x14]", ["address-code", "0x00000000004019f0"], ["symbol", "<+156>"]);
	has("=> 0x4141464141304141:\tCannot access memory at address 0x4141464141304141", ["address-code", "0x4141464141304141"], ["msg-error", "Cannot access memory at address 0x4141464141304141"]);
	// first operand is never a mnemonic
	assert.equal(typeOf("   0x401960 <main+12>:\tmov    DWORD PTR [rbp-0x64],edi", "edi"), "register");
	assert.equal(typeOf("   0x40052a <main+4>:\tmov    rax,rbx", "rax"), "register");
	has("                                                                  JUMP is taken", ["taken", "JUMP is taken"]);
	has("                                                              JUMP is NOT taken", ["not-taken", "JUMP is NOT taken"]);
	has(" |->   Cannot evaluate jump destination", ["arrow", "|->"], ["msg-error", "Cannot evaluate jump destination"]);
	has("Invalid $PC address: 0x41414641", ["msg-error", "Invalid $PC address"], ["address", "0x41414641"]);
});

test("vmmap, checksec, xinfo", () => {
	has("Start              End                Perm\tName", ["keyword", "Start              End                Perm\tName"]);
	has("0x00400000         0x00401000         r-xp\t/work/test_static", ["address", "0x00400000"], ["address", "0x00401000"], ["perm", "r-xp"], ["path", "/work/test_static"]);
	has("0x00002aaaaaaac000 0x00002aaaab2ac000 rw-p\t[stack]", ["address", "0x00002aaaaaaac000"], ["perm", "rw-p"], ["path", "[stack]"]);
	has("0xffffffffff600000 0xffffffffff601000 --xp\t[vsyscall]", ["perm", "--xp"], ["path", "[vsyscall]"]);
	has("0x00001000 0x00001395 rx-p\t/rv/rvpie", ["address", "0x00001000"], ["perm", "rx-p"]);
	has("0x00601000         0x00602000         rw-p", ["perm", "rw-p"]);
	has("CANARY    : ENABLED", ["keyword", "CANARY"], ["enabled", "ENABLED"]);
	has("FORTIFY   : disabled", ["keyword", "FORTIFY"], ["disabled", "disabled"]);
	has("RELRO     : Partial", ["keyword", "RELRO"], ["keyword", "Partial"]);
	has("RELRO     : FULL", ["enabled", "FULL"]);
	has("Virtual memory mapping:", ["keyword", "Virtual memory mapping:"]);
	has("Start : 0x00002aaaab316000", ["keyword", "Start"], ["address", "0x00002aaaab316000"]);
	has("Offset: 0x21ca", ["keyword", "Offset"], ["number", "0x21ca"]);
	has("Perm  : r-xp", ["keyword", "Perm"], ["perm", "r-xp"]);
	has("Name  : /usr/x86_64-linux-gnu/lib/libc.so.6", ["keyword", "Name"], ["path", "/usr/x86_64-linux-gnu/lib/libc.so.6"]);
	has("0x2aaaab3181ca (mov    edi,eax)", ["address-code", "0x2aaaab3181ca"], ["mnemonic", "mov"]);
	has('0x4b5900 ("heap string AAAABBBB")', ["address", "0x4b5900"], ["string", '"heap string AAAABBBB"']);
	has("0xdeadbeef ", ["number", "0xdeadbeef"]);
});

test("search, pattern, rop, elf, misc", () => {
	has("Searching for 'PEDA' in: None ranges", ["keyword", "Searching for"], ["string", "'PEDA'"]);
	has("Searching for 'heap' in range: 0x4b5000 - 0x4b6000", ["address", "0x4b5000"], ["address", "0x4b6000"]);
	has("Found 3 results, display max 3 items:", ["number", "3"]);
	has("    [stack] : 0x2aaaab2abf9c (\"PEDA_QEMU_PAGELOG=/tmp/qemu_pages.log\")", ["path", "[stack]"], ["address", "0x2aaaab2abf9c"], ["string", '"PEDA_QEMU_PAGELOG=/tmp/qemu_pages.log"']);
	has("libc.so.6 : 0x2aaaab4b942f --> 0x68732f6e69622f ('/bin/sh')", ["path", "libc.so.6"], ["address", "0x2aaaab4b942f"], ["number", "0x68732f6e69622f"]);
	has("[vdso] : 0xf7fd8001 (inc    ebp)", ["path", "[vdso]"], ["address-code", "0xf7fd8001"], ["mnemonic", "inc"]);
	has("'AAA%AAsAABAA$AAnAACAA-AA(AADAA;AA)AAEAAaAA0AAFAAbAA1AAGAAcAA2AAH'", ["string", "'AAA%AAsAABAA$AAnAACAA-AA(AADAA;AA)AAEAAaAA0AAFAAbAA1AAGAAcAA2AAH'"]);
	has("AA8A found at offset: 112", ["string", "AA8A"], ["number", "112"]);
	has("1094790465 found at offset: 20", ["number", "1094790465"], ["number", "20"]);
	has("FS_BASE+-92 found at offset: 52742", ["register", "FS_BASE"], ["number", "-92"], ["number", "52742"]);
	has("[RSP] --> offset 48 - size ~52", ["register", "RSP"], ["arrow", "-->"], ["number", "48"]);
	has("0x00002aaaab2abb00 : offset    0 - size  100 ($sp + -0x30 [-12 dwords])", ["address", "0x00002aaaab2abb00"], ["number", "100"], ["comment", "($sp + -0x30 [-12 dwords])"]);
	has("0x080edfa6 : offset    0 - size  100 ([heap])", ["path", "[heap]"]);
	has("0x004ada90 : 0x00002aaaab2abe81 (/work/test_static)", ["address", "0x004ada90"], ["address", "0x00002aaaab2abe81"], ["path", "/work/test_static"]);
	has("Registers contain pattern buffer:", ["keyword", "Registers contain pattern buffer:"]);
	has("0x004021f8 : (b'5f5dc3')\tpop rdi; pop rbp; ret", ["address-code", "0x004021f8"], ["string", "b'5f5dc3'"], ["mnemonic", "pop"], ["register", "rdi"], ["punctuation", ";"], ["mnemonic-branch", "ret"]);
	has("0x00400883 : (b'5fc3')  pop rdi; ret", ["address-code", "0x00400883"], ["mnemonic", "pop"]);
	has("0x401017: add esp,0x8; ret", ["address-code", "0x401017"], ["mnemonic", "add"], ["number", "0x8"], ["mnemonic-branch", "ret"]);
	has("0x401014 : call rax", ["address-code", "0x401014"], ["mnemonic-branch", "call"], ["register", "rax"]);
	has("0x481010: Hello, PEDA highlighter!", ["address", "0x481010"], ["string", "Hello, PEDA highlighter!"]);
	has("0x4019e8 <main+148>:\tcall   0x4018d4 <compute>", ["address-code", "0x4019e8"], ["address-code", "0x4018d4"]);
	has("pop2ret = 0x401738", ["symbol", "pop2ret"], ["address-code", "0x401738"]);
	has(".note.ABI-tag = 0x4002c4", ["symbol", ".note.ABI-tag"], ["address", "0x4002c4"]);
	has(".text: 0x4011c0 - 0x480740 (code)", ["symbol", ".text"], ["address-code", "0x4011c0"], ["address-code", "0x480740"]);
	has("'printf': no match found", ["string", "'printf'"], ["comment", "no match found"]);
	has("ansicolor = 'on'", ["keyword", "ansicolor"], ["string", "'on'"]);
	has("pagesize = 0", ["keyword", "pagesize"], ["number", "0"]);
	has("fd[1] -> /tmp/prog_stdout.txt", ["keyword", "fd[1]"], ["arrow", "->"], ["path", "/tmp/prog_stdout.txt"]);
	has("From 0x2aaaab2abac0 to 0x2aaaab2abb90: 208 bytes, 52 dwords", ["address", "0x2aaaab2abac0"], ["number", "208"]);
	has("0x00481010 : 48 65 6c 6c 6f 2c 20 50 45 44 41 20 68 69 67 68   Hello, PEDA high", ["address", "0x00481010"], ["number", "48"], ["string", "Hello, PEDA high"]);
	has("Warning: not running", ["msg-warn", "Warning: not running"]);
	has("Error: missing argument", ["msg-error", "Error: missing argument"]);
	has("ASLR is OFF", ["disabled", "OFF"]);
	has("Guessed arguments:", ["keyword", "Guessed arguments:"]);
	has("No argument", ["comment", "No argument"]);
});

test("does not claim vanilla-gdb or unknown lines", () => {
	for (const l of [
		"Breakpoint 1, main (argc=0x1, argv=0x2aaaab2abd28) at test.c:26",
		"Breakpoint 1 at 0x401967: file test.c, line 26.",
		"Program received signal SIGSEGV, Segmentation fault.",
		"0x2aaaab2abba0:\t0x00002aaaab2abd28\t0x00000001004ac200",
		"0x7fffffffe278: 0x0000555555554e62      0x0000000000000004",
		'0x481010:\t"Hello, PEDA highlighter!"',
		"0x6b7a28 <__printf_function_table>:\t0x0000000000000000",
		"#1  0x00000000004019ed in main (argc=0x1, argv=0x2aaaab2abd28) at test.c:30",
		"$7 = 0x481010 \"Hello, PEDA highlighter!\"",
		"0x4141464141304141 in ?? ()",
		"0x000000000040196b\t26\t    op_fn fp = (argc > 2) ? mul : add;",
		"26\t    op_fn fp = (argc > 2) ? mul : add;",
		"rip            0x4019ed            0x4019ed <main+153>",
		"Continuing.",
		"type = struct foo {",
		"Hello, I am a sample program.",
		"warning: Error disabling address space randomization: Operation not permitted",
	])
		assert.deepEqual(leaves(l), [], l);
});

test("tokenizes a 5,000-line paste in < 200 ms", () => {
	const corpus = fixtures.map(read).join("\n").split("\n");
	const big: string[] = [];
	while (big.length < 5000) big.push(...corpus);
	const text = big.slice(0, 5000).join("\n");
	Prism.tokenize(text, peda); // warm up
	const t0 = performance.now();
	Prism.tokenize(text, peda);
	const ms = performance.now() - t0;
	assert.ok(ms < 200, `${ms.toFixed(1)} ms`);
});

// ── adversarial pass (research/adversarial/REPORT.md) ──────────────────────
// Lines are verbatim from research/adversarial/samples/ (checked by `sample()`).
const SAMPLES = new URL("../research/adversarial/samples/", import.meta.url);
function sample(file: string, text: string): string {
	const ls = readFileSync(new URL(file, SAMPLES), "utf8").replace(/\r/g, "").split("\n");
	assert.ok(ls.includes(text), `not in samples/${file}: ${JSON.stringify(text)}`);
	return text;
}

test("adversarial H3: trailing blanks (Markdown hard break) never change the tokens", () => {
	const sig = (l: string) => JSON.stringify(leaves(l).map(([t, x]) => [t, x.trim()]));
	for (const l of lines((l) => l.trimEnd()))
		for (const tail of ["  ", "\t"]) assert.equal(sig(l + tail), sig(l), JSON.stringify(l + tail));
	has("CANARY    : ENABLED  ", ["enabled", "ENABLED"]); // commands.txt + 2 blanks
});

test("adversarial L5: RSP/ESP values and stack-pane slots are stack; non-addresses after `-->` are numbers", () => {
	has(sample("peda_1.txt", "RSP: 0x7fffffffe028 --> 0x7ffff7de80b3 (<__libc_start_main+243>:\tmov    edi,eax)"),
		["register", "RSP"], ["address-stack", "0x7fffffffe028"], ["address-code", "0x7ffff7de80b3"], ["mnemonic", "mov"]);
	has(sample("peda_1.txt", "RSP: 0x7fffffffe000 --> 0x0 "), ["address-stack", "0x7fffffffe000"], ["number", "0x0"]);
	has(sample("peda_1.txt", "0000| 0x7fffffffe028 --> 0x7ffff7de80b3 (<__libc_start_main+243>:\tmov    edi,eax)"),
		["offset", "0000|"], ["address-stack", "0x7fffffffe028"], ["address-code", "0x7ffff7de80b3"]);
	has(sample("peda_1.txt", "0048| 0x7fffffffe058 --> 0x4933ce13230737fe "), ["address-stack", "0x7fffffffe058"], ["number", "0x4933ce13230737fe"]);
	has(sample("peda_1.txt", "0016| 0x7fffffffe038 --> 0x7fffffffe118 --> 0x7fffffffe425 (\"/home/mjh/hack/char_array2\")"),
		["address-stack", "0x7fffffffe038"], ["address", "0x7fffffffe118"], ["address", "0x7fffffffe425"], ["string", '"/home/mjh/hack/char_array2"']);
	// other registers are not inferred to be stack
	has(sample("peda_1.txt", "R13: 0x7fffffffe110 --> 0x1 "), ["address", "0x7fffffffe110"], ["number", "0x1"]);
});
