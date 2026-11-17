// GEF grammar tests. Lines are verbatim from research/gef captures (copied into
// test/fixtures/gef/); a few old-release formats that exist only in GEF source
// are quoted from research/gef/REVIEW.md and marked as such.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import Prism from "prismjs";
import type { Token, TokenStream } from "prismjs";
import { gef } from "../src/grammars/gef.ts";
import { LANGUAGES } from "../src/grammars/index.ts";

const FIXTURES = new URL("./fixtures/gef/", import.meta.url);
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
const isWrapper = (t: string) => t.startsWith("gef-") || t.startsWith("gdb-");

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
const tok = (text: string, grammar = LANGUAGES.gef!) => leaves(Prism.tokenize(text, grammar));

/** Assert that each [text, type] pair appears as a leaf token, in order. */
function expectTokens(line: string, expected: [string, string][]) {
	const got = tok(line);
	let i = 0;
	for (const [text, type] of expected) {
		while (i < got.length && got[i]!.text !== text) i++;
		assert.ok(i < got.length, `token ${JSON.stringify(text)} not found in ${JSON.stringify(line)}\n${fmt(got)}`);
		assert.equal(got[i]!.type, type, `type of ${JSON.stringify(text)} in ${JSON.stringify(line)}`);
		i++;
	}
}
const fmt = (ls: Leaf[]) => ls.map((l) => `${l.type}:${l.text}`).join(" ");
const typesOf = (line: string) => fmt(tok(line));

// ── structure ───────────────────────────────────────────────────────────────

test("prompt and command (plain, qemu, remote)", () => {
	expectTokens("gef➤  break main", [["gef➤", "prompt"], ["break main", "command"]]);
	expectTokens("(qemu) gef➤  heap chunks", [["(qemu) gef➤", "prompt"], ["heap chunks", "command"]]);
	expectTokens("(remote) gef➤  context", [["(remote) gef➤", "prompt"], ["context", "command"]]);
	expectTokens("gef➤  ", [["gef➤", "prompt"]]);
});

test("section headers of any width and title, legend", () => {
	for (const l of [
		"─────────────────────────────────────── registers ────",
		"──── code:x86:64 ────",
		"─────────────────────────────────────── code:arm64: ────",
		"──────────────────────── source:test.c+24 ────",
		"──────────────────────────── arguments (guessed) ────",
		" registers ────", // narrow terminal: empty leading rule (REVIEW R15)
		"────────────────────────────────── Unsorted Bin for arena at 0xfffff7fa0a50 ──────────────────────────────────",
		"─────────────────────────────────────────────────────────────────",
	])
		assert.equal(typesOf(l), `section:${l.trim()}`);
	expectTokens("[ Legend: Modified register | Code | Heap | Stack | String ]", [
		["[ Legend: Modified register | Code | Heap | Stack | String ]", "legend"],
	]);
	expectTokens("[ Legend:  Code | Stack | Heap ]", [["[ Legend:  Code | Stack | Heap ]", "legend"]]);
});

// ── registers ───────────────────────────────────────────────────────────────

test("register lines and dereference chains", () => {
	expectTokens("$rax   : 0x00002aaaab2abc30  →  \"AAAAAAAABBBBBBBBCCCCCCCC\"", [
		["$rax", "register"], [":", "punctuation"], ["0x00002aaaab2abc30", "address"], ["→", "arrow"],
		['"AAAAAAAABBBBBBBBCCCCCCCC"', "string"],
	]);
	// unpadded = GEF says "not a mapped address"
	expectTokens("$rbx   : 0x1               ", [["$rbx", "register"], ["0x1", "number"]]);
	// $sp/$rsp/$esp value is structurally stack
	expectTokens("$rsp   : 0x00002aaaab2abba0  →  0x00002aaaab2abd88  →  0x00002aaaab2abf32  →  \"/work/test_x64\"", [
		["0x00002aaaab2abba0", "address-stack"], ["0x00002aaaab2abd88", "address"],
	]);
	// a hop followed by `<sym+off> insn` is code; the instruction is tokenized
	expectTokens("$rip   : 0x00000000004019ce  →  <main+00a8> jle 0x4019a6 <main+128>", [
		["0x00000000004019ce", "address-code"], ["<main+00a8>", "symbol"], ["jle", "mnemonic-branch"],
		["0x4019a6", "address-code"], ["<main+128>", "symbol"],
	]);
	expectTokens("$x16 : 0x0000aaaaaaabffa8  →  0x0000fffff7e619d0  →  <puts+0000> stp x29,  x30,  [sp,  #-64]!", [
		["0x0000aaaaaaabffa8", "address"], ["0x0000fffff7e619d0", "address-code"], ["<puts+0000>", "symbol"],
		["stp", "mnemonic"], ["x29", "register"], ["#-64", "number"],
	]);
	// bare instruction (no symbol) after a 3-space arrow
	expectTokens("$x15 : 0x0000fffff7ff8e70  →  0x0000aaaaaaaa0000  →   .inst 0x464c457f ; undefined", [
		["0x0000aaaaaaaa0000", "address-code"], [".inst", "mnemonic"], ["; undefined", "comment"],
	]);
	expectTokens('$rsi   : 0x4342424242424242 ("BBBBBBBC"?)', [['("BBBBBBBC"?)', "string"]]);
	// pre-2024.06 decimal offsets
	expectTokens("$pc  : 0x0000aaaaaaaa0a68  →  <main+272> ldr w0,  [sp,  #12]", [
		["0x0000aaaaaaaa0a68", "address-code"], ["<main+272>", "symbol"], ["ldr", "mnemonic"],
	]);
});

test("flags: uppercase = set, lowercase = clear", () => {
	expectTokens("$eflags: [zero CARRY PARITY ADJUST SIGN trap INTERRUPT direction overflow resume virtualx86 identification]", [
		["$eflags", "register"], ["zero", "flag-clear"], ["CARRY", "flag-set"], ["PARITY", "flag-set"], ["trap", "flag-clear"],
		["INTERRUPT", "flag-set"], ["identification", "flag-clear"],
	]);
	expectTokens("$cpsr: [negative ZERO CARRY overflow interrupt endian fast t32 m[4]]", [
		["negative", "flag-clear"], ["ZERO", "flag-set"], ["t32", "flag-clear"], ["m[4]", "flag-clear"],
	]);
	expectTokens("Flags: [negative ZERO CARRY overflow interrupt endian fast t32 m[4]]", [
		["Flags", "keyword"], ["ZERO", "flag-set"],
	]);
});

test("x86 segment line and raw register mode (REVIEW C2/R3)", () => {
	expectTokens("$cs: 0x33 $ss: 0x2b $ds: 0x00 $es: 0x00 $fs: 0x00 $gs: 0x00 ", [
		["$cs", "register"], ["0x33", "number"], ["$ss", "register"], ["0x2b", "number"], ["$gs", "register"],
	]);
	expectTokens("$x28 : 0x0                $x29 : 0x0000fffffffffbb0 $x30 : 0x0000aaaaaaaa0a68 $sp  : 0x0000fffffffffae0 ", [
		["$x28", "register"], ["0x0", "number"], ["$x29", "register"], ["0x0000fffffffffbb0", "address"],
		["$sp", "register"], ["0x0000fffffffffae0", "address-stack"],
	]);
});

// ── stack / dereference ─────────────────────────────────────────────────────

test("stack pane: every slot is stack; hints and offsets", () => {
	const pane = [
		"─────────────────────────────────────────────────── stack ────",
		'0x00002aaaab2abba0│+0x0000: 0x00002aaaab2abd88  →  0x00002aaaab2abf32  →  "/work/test_x64"\t ← $rsp',
		"0x00002aaaab2abba8│+0x0008: 0x000000010040df3c",
		"0x00002aaaab2abbb8│+0x0018: 0x0000000000401865  →  <add+0000> endbr64 ",
	].join("\n");
	const got = tok(pane);
	const t = (text: string) => got.find((l) => l.text === text)?.type;
	assert.equal(t("0x00002aaaab2abba0"), "address-stack");
	assert.equal(t("0x00002aaaab2abba8"), "address-stack");
	assert.equal(t("+0x0008"), "offset");
	assert.equal(t("│"), "punctuation");
	assert.equal(t("←"), "arrow");
	assert.equal(t("$rsp"), "register");
	assert.equal(t("0x0000000000401865"), "address-code");
	assert.equal(t("0x000000010040df3c"), "address");
});

test("telescope outside the stack pane: stack only with a $sp/$fp hint", () => {
	expectTokens('0x0000fffffffffae0│+0x0000: 0x0000fffffffffd38  →  0x0000ffffffffff11  →  0x4f480032742f742f ("/t/t2"?)\t ← $sp', [
		["0x0000fffffffffae0", "address-stack"], ["+0x0000", "offset"], ['("/t/t2"?)', "string"], ["$sp", "register"],
	]);
	expectTokens("0x0000fffffffffab0│+0x0000: 0x0000fffffffffba0  →  0x0000fffffffffcb0\t ← $x29, $sp", [
		["0x0000fffffffffab0", "address-stack"], ["$x29", "register"], ["$sp", "register"],
	]);
	expectTokens("0x0000fffffffffae8│+0x0008: 0x00000001fffffef8", [["0x0000fffffffffae8", "address"]]);
	// negative offsets (dereference -r)
	expectTokens("0x0000fffffffffa90│-0x0020: 0x0000fffffffffab0\t ← $x29, $sp", [
		["0x0000fffffffffa90", "address-stack"], ["-0x0020", "offset"],
	]);
	// scan: `[stack]: ` prefix is authoritative
	expectTokens('[stack]: 0x0000ffffffffed50│+0x1fd50: 0x0000fffff7e0efe5  →  "ld-linux-aarch64.so.1"', [
		["[stack]", "path"], ["0x0000ffffffffed50", "address-stack"], ["+0x1fd50", "offset"],
	]);
	expectTokens("0x40800c68│+0x001c: 0x080e9380  →  0x080e9380  →  [loop detected]", [
		["0x080e9380", "address"], ["[loop detected]", "comment"],
	]);
});

// ── code pane ───────────────────────────────────────────────────────────────

test("code pane: breakpoint, current, TAKEN / NOT taken, ↳ preview", () => {
	expectTokens("●→   0x4019ce <main+00a8>      jle    0x4019a6 <main+128>\tTAKEN [Reason: Z || S!=O]", [
		["●", "keyword"], ["→", "current"], ["0x4019ce", "address-code"], ["<main+00a8>", "symbol"],
		["jle", "mnemonic-branch"], ["0x4019a6", "address-code"], ["<main+128>", "symbol"], ["TAKEN", "taken"],
		["[Reason: Z || S!=O]", "comment"],
	]);
	expectTokens("●→ 0xaaaaaaaa0a8c <main+008c>      b.le   0xaaaaaaaa0a5c <main+92>\tNOT taken [Reason: !(Z || N!=V)]", [
		["b.le", "mnemonic-branch"], ["0xaaaaaaaa0a5c", "address-code"], ["NOT taken", "not-taken"],
		["[Reason: !(Z || N!=V)]", "comment"],
	]);
	expectTokens("   ↳    0x4019a6 <main+0080>      mov    edi, 0x20", [
		["↳", "arrow"], ["0x4019a6", "address-code"], ["mov", "mnemonic"], ["edi", "register"], ["0x20", "number"],
	]);
	expectTokens("     0x4019bb <main+0095>      mov    QWORD PTR [rbp+rax*8-0x80], rdx", [
		["mov", "mnemonic"], ["rbp", "register"], ["rdx", "register"],
	]);
	assert.ok(!typesOf("     0x4019bb <main+0095>      mov    QWORD PTR [rbp+rax*8-0x80], rdx").includes("mnemonic:QWORD"));
	expectTokens("   0xaaaaaaaa0a5c 00000090    <main+0104>      adrp   x0,  0xaaaaaaaa0000", [
		["0xaaaaaaaa0a5c", "address-code"], ["00000090", "number"], ["<main+0104>", "symbol"], ["adrp", "mnemonic"],
	]);
	expectTokens("   0xaaaaaaaa090c <__do_global_dtors_aux+004c> ret    ", [
		["<__do_global_dtors_aux+004c>", "symbol"], ["ret", "mnemonic-branch"],
	]);
	expectTokens("   0xfffff7e619cc                  nop    ", [["0xfffff7e619cc", "address-code"], ["nop", "mnemonic"]]);
	expectTokens("   0xaaaaaaaa0a5c <main+005c>      mov    x0,  #0x20                  \t// #32", [
		["#0x20", "number"], ["// #32", "comment"],
	]);
	expectTokens(" → 0xfffff7e619d0 <puts+0>         stp    x29,  x30,  [sp,  #-64]!", [
		["→", "current"], ["<puts+0>", "symbol"], ["stp", "mnemonic"],
	]);
});

// ── args / source / threads / trace ────────────────────────────────────────

test("arguments pane (guessed and known symbol)", () => {
	const guessed = "*0x401865 (\n   $rdi = 0x0000000000000006,\n   $rcx = 0x0000000000401865 → <add+0000> endbr64 \n)";
	expectTokens(guessed, [
		["*", "punctuation"], ["0x401865", "address-code"], ["(", "punctuation"], ["$rdi", "register"],
		["$rcx", "register"], ["0x0000000000401865", "address-code"], ["endbr64", "mnemonic"], [")", "punctuation"],
	]);
	const known = "compute (\n   op_fn var_0 = 0x08049865 → <add+0000> endbr32 ,\n   int var_1 = 0x00000006,\n)";
	expectTokens(known, [["compute", "symbol"], ["0x08049865", "address-code"], ["<add+0000>", "symbol"]]);
});

test("source pane and variable annotations", () => {
	expectTokens(" →   31\t     for (i = 0; i < 8; i++) small[i] = malloc(0x20);", [["→", "current"], ["31", "number"]]);
	expectTokens('     30\t     strcpy(stackbuf, "AAAAAAAABBBBBBBBCCCCCCCC");', [
		["30", "number"], ['"AAAAAAAABBBBBBBBCCCCCCCC"', "string"],
	]);
	expectTokens("     29\t ", [["29", "number"]]);
	expectTokens("             // small=0x00002aaaab2abbf0  →  [...]  →  0x0000000000000004, i=0x0", [
		["//", "comment"], ["0x00002aaaab2abbf0", "address"], ["[...]", "comment"], ["0x0", "number"],
	]);
});

test("threads and trace panes", () => {
	expectTokens('[#0] Id 1, Name: "test_arm64", stopped 0xaaaaaaaa0a14 in main (), reason: BREAKPOINT', [
		["[#0]", "offset"], ["1", "number"], ['"test_arm64"', "string"], ["stopped", "keyword"],
		["0xaaaaaaaa0a14", "address-code"], ["main", "symbol"], ["BREAKPOINT", "keyword"],
	]);
	expectTokens("[#0] Id 1, stopped 0x6161616161616166 in ?? (), reason: SIGSEGV", [
		["0x6161616161616166", "address"], ["SIGSEGV", "signal"],
	]);
	expectTokens("[#1] 0xaaaaaaaa097c → compute(f=0xaaaaaaaa0918 <add>, x=0x6, y=0x7)", [
		["[#1]", "offset"], ["0xaaaaaaaa097c", "address-code"], ["→", "arrow"], ["compute", "symbol"],
		["<add>", "symbol"], ["0x6", "number"],
	]);
	expectTokens('[#5] 0xfffff7ee82a8 → __GI___fortify_fail(msg=0xfffff7f52cb0 "stack smashing detected")', [
		["__GI___fortify_fail", "symbol"], ['"stack smashing detected"', "string"],
	]);
	expectTokens("[#0] 0xaaaaaaaa084c → mov x5,  x0", [["mov", "mnemonic"], ["x5", "register"]]);
});

// ── messages ────────────────────────────────────────────────────────────────

test("message prefixes", () => {
	expectTokens("[+] Found at offset 48 (little-endian search) likely", [["[+]", "msg-ok"], ["48", "number"]]);
	expectTokens("[*] Cannot reach 0x10 in memory space", [["[*]", "msg-info"], ["0x10", "address"]]);
	expectTokens("[!] Cannot disassemble from $PC", [["[!]", "msg-error"]]);
	expectTokens("[=] some debug line", [["[=]", "msg-info"]]);
	expectTokens("[+] The canary of process 453 is at 0xfffffffffed8, value is 0x154844b1b73fc000", [
		["0xfffffffffed8", "address"], ["0x154844b1b73fc000", "number"],
	]);
	expectTokens("[+] In '[stack]'(0xfffffffdf000-0x1000000000000), permission=rw-", [
		["[stack]", "path"], ["0xfffffffdf000", "address-stack"], ["0x1000000000000", "address-stack"], ["rw-", "perm"],
	]);
});

// ── heap ────────────────────────────────────────────────────────────────────

test("heap chunks: current (≥2023.06) and old flag formats", () => {
	expectTokens("Chunk(addr=0xaaaaaaac14b0, size=0x90, flags=PREV_INUSE | IS_MMAPPED | NON_MAIN_ARENA)", [
		["Chunk", "heap-chunk"], ["0xaaaaaaac14b0", "address-heap"], ["0x90", "number"],
		// all three names are always printed now; state is colour-only → neutral
		["PREV_INUSE", "keyword"], ["IS_MMAPPED", "keyword"], ["NON_MAIN_ARENA", "keyword"],
	]);
	expectTokens("Chunk(addr=0x4b4650, size=0x1f9c0, flags=PREV_INUSE | IS_MMAPPED | NON_MAIN_ARENA)  ←  top chunk", [
		["0x4b4650", "address-heap"], ["←", "arrow"], ["top chunk", "keyword"],
	]);
	// ≤2022.06: only set flags printed → state is in the text
	expectTokens("Chunk(addr=0xaaaaaaac19a0, size=0x100, flags=PREV_INUSE)", [["PREV_INUSE", "flag-set"]]);
	expectTokens("Chunk(addr=0xaaaaaaac1aa0, size=0x20, flags=)", [["0xaaaaaaac1aa0", "address-heap"]]);
	// 2022.06 source-only form (REVIEW C3/§3D)
	expectTokens("Chunk(addr=0xaaaaaaac1aa0, size=0x20, flags=! PREV_INUSE|IS_MMAPPED)", [
		["! PREV_INUSE", "flag-clear"], ["IS_MMAPPED", "flag-set"],
	]);
	expectTokens("    [0x00000000004b34b0     e0 34 4b 00 00 00 00 00 30 35 4b 00 00 00 00 00    .4K.....05K.....]", [
		["0x00000000004b34b0", "address-heap"], ["e0", "number"], ["00", "comment"], [".4K.....05K.....", "comment"],
	]);
	expectTokens("PREV_INUSE flag: On", [["PREV_INUSE", "flag-set"], ["On", "enabled"]]);
	expectTokens("IS_MMAPPED flag: Off", [["IS_MMAPPED", "flag-clear"], ["Off", "disabled"]]);
	expectTokens("Chunk size: 144 (0x90)", [["Chunk size", "keyword"], ["144", "number"], ["0x90", "number"]]);
	expectTokens("Forward pointer: 0xfffff7fa0ba0", [["0xfffff7fa0ba0", "address"]]);
});

test("heap bins: tcache (new + 2021.10), fast, unsorted/small/large", () => {
	expectTokens("Tcachebins[idx=7, size=0x90, count=1] ←  Chunk(addr=0x4b3a80, size=0x90, flags=PREV_INUSE | IS_MMAPPED | NON_MAIN_ARENA) ", [
		["Tcachebins", "bin"], ["7", "number"], ["0x90", "number"], ["1", "number"], ["←", "arrow"],
		["Chunk", "heap-chunk"], ["0x4b3a80", "address-heap"],
	]);
	expectTokens("Tcachebins[idx=14, size=0x100] count=7  ←  Chunk(addr=0xaaaaaaac18a0, size=0x100, flags=PREV_INUSE)", [
		["Tcachebins", "bin"], ["14", "number"], ["7", "number"], ["0xaaaaaaac18a0", "address-heap"],
	]);
	expectTokens("Fastbins[idx=0, size=0x20] 0x00", [["Fastbins", "bin"], ["0x00", "number"]]);
	expectTokens("[+] unsorted_bins[0]: fw=0xaaaaaaac15c0, bk=0xaaaaaaac15c0", [
		["[+]", "msg-ok"], ["unsorted_bins[0]", "bin"], ["0xaaaaaaac15c0", "address-heap"],
	]);
	expectTokens(" →   Chunk(addr=0xaaaaaaac1ac0, size=0x100, flags=PREV_INUSE)   →   Chunk(addr=0xaaaaaaac19a0, size=0x100, flags=PREV_INUSE)", [
		["→", "arrow"], ["0xaaaaaaac1ac0", "address-heap"], ["→", "arrow"], ["0xaaaaaaac19a0", "address-heap"],
	]);
	expectTokens("All tcachebins are empty", [["All tcachebins are empty", "comment"]]);
});

test("arenas: three historical forms (REVIEW C7, older two from source)", () => {
	expectTokens("Arena(base=0xfffff7fa0a50, top=0xaaaaaaac1fe0, last_remainder=0x0, next=0xfffff7fa0a50, mem=135168, mempeak=135168)", [
		["Arena", "heap-chunk"], ["0xfffff7fa0a50", "address"], ["0xaaaaaaac1fe0", "address-heap"], ["135168", "number"],
	]);
	expectTokens("Arena(base=0xfffff7fa0a50, top=0xaaaaaaac1fe0, last_remainder=0x0, next=0xfffff7fa0a50, next_free=0x0, system_mem=0x21000)", [
		["0xaaaaaaac1fe0", "address-heap"], ["0x21000", "number"],
	]);
	expectTokens("Arena(base=0xfffff7fa0a50, top=0xaaaaaaac1fe0, last_remainder=0x0, next=0xfffff7fa0a50)", [["Arena", "heap-chunk"]]);
});

test("heap chunks --summary", () => {
	expectTokens("== Chunk distribution by size ==", [["== Chunk distribution by size ==", "section"]]);
	expectTokens("125936    \t1         \t125936         \t", [["125936", "number"], ["1", "number"]]);
	expectTokens("PREV_INUSE     \t13        \t135072", [["PREV_INUSE", "keyword"], ["13", "number"]]);
});

// ── commands ────────────────────────────────────────────────────────────────

test("vmmap: row kinds from perm/path, never from the address prefix", () => {
	expectTokens("Start              End                Offset             Perm Path", [
		["Start              End                Offset             Perm Path", "keyword"],
	]);
	expectTokens("0x0000aaaaaaaa0000 0x0000aaaaaaaa1000 0x0000000000000000 r-x /t/t2", [
		["0x0000aaaaaaaa0000", "address-code"], ["0x0000aaaaaaaa1000", "address-code"], ["0x0000000000000000", "number"],
		["r-x", "perm"], ["/t/t2", "path"],
	]);
	expectTokens("0x0000fffffffdf000 0x0001000000000000 0x0000000000000000 rw- [stack]", [
		["0x0000fffffffdf000", "address-stack"], ["0x0001000000000000", "address-stack"], ["[stack]", "path"],
	]);
	expectTokens("0x0000000000421000 0x0000000000442000 0x0000000000000000 rw- [heap]", [["0x0000000000421000", "address-heap"]]);
	expectTokens("0x0000fffff7f9d000 0x0000fffff7fa0000 0x000000000019d000 r-- /usr/lib/aarch64-linux-gnu/libc.so.6", [
		["0x0000fffff7f9d000", "address-rodata"],
	]);
	expectTokens("0x0000fffff7fa2000 0x0000fffff7fae000 0x0000000000000000 rw- ", [["0x0000fffff7fa2000", "address-data"]]);
	expectTokens("0x0000fffff7f8a000 0x0000fffff7f9d000 0x000000000019a000 --- /usr/lib/aarch64-linux-gnu/libc.so.6", [
		["0x0000fffff7f8a000", "address"], ["---", "perm"],
	]);
	expectTokens("[name = 'libc']", [["'libc'", "string"]]);
});

test("checksec, got, canary", () => {
	expectTokens("Canary                        : ✓ (value: 0x154844b1b73fc000)", [
		["Canary", "keyword"], ["✓", "enabled"], ["0x154844b1b73fc000", "number"],
	]);
	expectTokens("PIE                           : ✘ ", [["PIE", "keyword"], ["✘", "disabled"]]);
	expectTokens("RelRO                         : Partial", [["Partial", "keyword"]]);
	expectTokens("RelRO                         : Full", [["Full", "enabled"]]);
	expectTokens("GOT protection: Full RelRO | GOT functions: 10", [["Full RelRO", "enabled"], ["10", "number"]]);
	expectTokens("[0xaaaaaaabffa8] puts@GLIBC_2.17  →  0xfffff7e619d0", [
		["0xaaaaaaabffa8", "address"], ["puts@GLIBC_2.17", "symbol"], ["→", "arrow"], ["0xfffff7e619d0", "address"],
	]);
	expectTokens("[0xaaaaaaabff98] __gmon_start__  →  0x0", [["0x0", "number"]]);
});

test("xinfo, elf-info", () => {
	expectTokens("Page: 0x0000fffffffdf000  →  0x0001000000000000 (size=0x21000)", [
		["Page", "keyword"], ["0x0000fffffffdf000", "address"], ["→", "arrow"],
	]);
	expectTokens("Permissions: rw-", [["rw-", "perm"]]);
	expectTokens("Pathname: [stack]", [["[stack]", "path"]]);
	expectTokens("Symbol: main+32", [["main+32", "symbol"]]);
	expectTokens("Entry point           : 0x0000000000401740", [["Entry point", "keyword"], ["0x0000000000401740", "address-code"]]);
	expectTokens("Type                  : 0x2 - ET_EXEC", [["0x2", "number"], ["ET_EXEC", "keyword"]]);
	expectTokens("Magic                 : 7f 45 4c 46", [["7f", "number"], ["4c", "number"]]);
	expectTokens("  [ 7] .text                   SHT_PROGBITS   0x401180   0x1180  0x7d780      0x0 4294967295  0x0  0x0     0x40", [
		["[ 7]", "offset"], [".text", "symbol"], ["SHT_PROGBITS", "keyword"], ["0x401180", "number"],
	]);
});

test("hexdump, search-pattern, pattern, config, misc", () => {
	expectTokens("0x0000fffffffffad0     18 fd ff ff ff ff 00 00 00 00 00 00 01 00 00 00    ................", [
		["0x0000fffffffffad0", "address"], ["18", "number"], ["00", "comment"], ["................", "comment"],
	]);
	expectTokens("0x0000aaaaaaac0010 <global_buf+0000>    67 6c 6f 62 61 6c 20 64 61 74 61 20 73 74 72 69    global data stri", [
		["<global_buf+0000>", "symbol"], ["67", "number"], ["global data stri", "comment"],
	]);
	expectTokens("0x0000aaaaaaac0010│+0x0000   <global_buf+0000> 0x64206c61626f6c67   ", [
		["0x0000aaaaaaac0010", "address"], ["+0x0000", "offset"], ["<global_buf+0000>", "symbol"], ["0x64206c61626f6c67", "number"],
	]);
	const search = "[+] In '[stack]'(0xfffffffdf000-0x1000000000000), permission=rw-\n  0xfffffffffb58 - 0xfffffffffb70  →   \"AAAAAAAABBBBBBBBCCCCCCCC\" ";
	expectTokens(search, [["0xfffffffffb58", "address-stack"], ["→", "arrow"], ['"AAAAAAAABBBBBBBBCCCCCCCC"', "string"]]);
	expectTokens('  0xaaaaaaaa0c90 - 0xaaaaaaaa0ca0  →   "heap string here" ', [["0xaaaaaaaa0c90", "address"]]);
	expectTokens("aaaaaaaabaaaaaaacaaaaaaadaaaaaaaeaaaaaaafaaaaaaagaaaaaaahaaaaaaa", [
		["aaaaaaaabaaaaaaacaaaaaaadaaaaaaaeaaaaaaafaaaaaaagaaaaaaahaaaaaaa", "string"],
	]);
	expectTokens('theme.address_stack (str) = "pink"', [["theme.address_stack", "keyword"], ["(str)", "comment"], ['"pink"', "string"]]);
	expectTokens("heap-analysis-helper.check_uaf (bool) = True", [["heap-analysis-helper.check_uaf", "keyword"], ["True", "keyword"]]);
	expectTokens("Description:\n\tMaximum level of pointer recursion", [
		["Description:", "keyword"], ["Maximum level of pointer recursion", "comment"],
	]);
	expectTokens("ASLR is currently disabled", [["disabled", "disabled"]]);
	expectTokens("Possible insecure format string: printf('$x0'  →  0xfffffffffb68: '%p %p %p\\n')", [
		["Possible insecure format string", "msg-warn"], ["'$x0'", "string"],
	]);
});

// ── non-interference with plain GDB / prose ────────────────────────────────

test("plain GDB lines are left to the gdb base grammar", () => {
	for (const l of [
		"Breakpoint 1, main (argc=1, argv=0x7fffffffe0b8) at test.c:24",
		"Breakpoint 1 at 0xa14: file test.c, line 24.",
		"#1  0x0000aaaaaaaa0b80 in main (argc=0x1, argv=0xfffffffffd18) at test.c:38",
		"0x6161616161616166 in ?? ()",
		"=> 0x401951 <main+43>:\tlea    rax,[rip+0xffffffffffffff0d]        # 0x401865 <add>",
		"   0x0000aaaaaaaa0a00 <+0>:\tsub\tsp, sp, #0xd0",
		"   0x0000aaaaaaaa0a00 <+0>:    sub    sp, sp, #0xd0",
		"0xfffffffffad0:\t0x0000fffffffffd18\t0x0000000100000000",
		"0x0000aaaaaaaa0a18\t24\tint main(int argc, char **argv) {",
		"0x0000aaaaaaaa0a18      24      int main(int argc, char **argv) {",
		"24\tint main(int argc, char **argv) {",
		"$3 = (void (*)()) 0xaaaaaaaa0a20 <main+32>",
		"x0             0xfffff7ffdb50      0xfffff7ffdb50",
		"1       breakpoint     keep y   0x0000aaaaaaaa0a14 in main at test.c:24",
		"\tbreakpoint already hit 1 time",
		"0x0000fffff7fc1c40  0x0000fffff7fe0d24  Yes         /lib/ld-linux-aarch64.so.1",
		"Program received signal SIGSEGV, Segmentation fault.",
		"Hello, gef! global data string r=39 stack=AAAAAAAABBBBBBBBCCCCCCCC",
	])
		assert.equal(fmt(leaves(Prism.tokenize(l, gef))), "", `gef rules must not claim: ${l}`);
});

// ── whole fixtures ──────────────────────────────────────────────────────────

/** plain-GDB lines inside the fixtures (handled by the gdb base grammar, not by `gef`) */
const GDB_LINE = /^(?:Continuing\.|Breakpoint \d+|Reading symbols from|Undefined command|\d+\t|\w+ \(.*\) at \S+:\d+$)/;

test("fixtures: every GEF line is tokenized by the gef rules; types and aliases follow TOKENS.md", () => {
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
		walk(Prism.tokenize(text, gef));
		lines.forEach((line, i) => {
			if (line.trim() && !GDB_LINE.test(line)) assert.ok(touched.has(i), `${name}:${i + 1}: untouched ${JSON.stringify(line)}`);
		});
	}
});

test("fixtures: tabs→spaces, trailing-space trim and CRLF do not change tokenization", () => {
	const expand = (l: string) => {
		let o = "";
		for (const c of l) o += c === "\t" ? " ".repeat(8 - (o.length % 8)) : c;
		return o;
	};
	const sig = (t: string) => tok(t).map((l) => `${l.type}:${l.text.replace(/\s+/g, " ")}`).join(" ");
	for (const name of fixtureNames) {
		const text = fixture(name);
		const base = sig(text);
		assert.equal(sig(text.split("\n").map((l) => expand(l).replace(/[\t ]+$/, "")).join("\n")), base, `${name}: tabs/trim`);
		assert.equal(sig(text.replace(/\n/g, "\r\n")), base, `${name}: CRLF`);
		// Markdown hard break / blog copies (adversarial H3)
		for (const tail of ["  ", "\t"])
			assert.equal(sig(text.split("\n").map((l) => (l.trim() ? l.replace(/[\t ]+$/, "") + tail : l)).join("\n")), base, `${name}: trailing ${JSON.stringify(tail)}`);
	}
});

test("performance: 5,000 lines in < 200 ms, no catastrophic backtracking", () => {
	const all = fixtureNames.map(fixture).join("\n").split("\n");
	const lines: string[] = [];
	while (lines.length < 5000) lines.push(...all);
	const text = lines.slice(0, 5000).join("\n");
	Prism.tokenize(text, LANGUAGES.gef!); // warm-up (JIT)
	const t0 = performance.now();
	Prism.tokenize(text, LANGUAGES.gef!);
	const ms = performance.now() - t0;
	assert.ok(ms < 200, `took ${ms.toFixed(1)} ms`);

	const evil = [
		" " + "─".repeat(20000) + " x",
		" ".repeat(10000) + "0x1" + " ".repeat(10000) + "a",
		"$rax : " + "0x0000000000000001  →  ".repeat(1000) + "<" + "a".repeat(5000),
		"0x0000ffff│+0x0000: " + "<a+1 ".repeat(3000),
		"   0x1 " + "<".repeat(10000) + "+1>",
		"Chunk(addr=0x1, size=0x2, flags=" + "PREV_INUSE | ".repeat(3000),
		"●→ 0x1 " + " ".repeat(20000) + "\tTAKEN",
		"     1" + "\t ".repeat(10000),
		"[+] In '[stack]'(" + "0x1-".repeat(5000),
	];
	for (const e of evil) {
		const s = performance.now();
		Prism.tokenize(e, LANGUAGES.gef!);
		assert.ok(performance.now() - s < 100, `slow on ${JSON.stringify(e.slice(0, 30))}`);
	}
});

// ── adversarial pass (research/adversarial/REPORT.md) ──────────────────────
// Lines are verbatim from research/adversarial/samples/ and fp/ (checked by `sample()`).
const ADV = new URL("../research/adversarial/", import.meta.url);
const advLines = (file: string) => readFileSync(new URL(file, ADV), "utf8").replace(/\r/g, "").split("\n");
function sample(file: string, text: string): string {
	// Provenance check only: the research/ tree lives on the `research` branch.
	if (!existsSync(ADV)) return text;
	assert.ok(advLines(file).includes(text), `not in ${file}: ${JSON.stringify(text)}`);
	return text;
}

test("adversarial H3: a trailing-blank gdb error line keeps its tokens", () => {
	const l = 'Undefined command: "foo".  Try "help".';
	assert.equal(typesOf(l + "  "), typesOf(l));
	assert.ok(typesOf(l).includes("msg-error"), typesOf(l));
});

test("adversarial M4/W6: GEF ≤2020 bracketed banners are sections; the stack pane under them is stack", () => {
	const ls = fixture("adversarial/gef_10.txt").split("\n");
	const regs = ls.find((l) => l.endsWith("[ registers ]────"))!;
	expectTokens(regs, [[regs, "section"]]);
	const at = ls.findIndex((l) => l.endsWith("[ stack ]────"));
	const pane = ls.slice(at, at + 9).join("\n");
	const kinds = tok(pane).filter((l) => /^0xffffd7[0-9a-f]{2}$/.test(l.text)).map((l) => l.type);
	assert.equal(kinds.length, 8);
	assert.deepEqual([...new Set(kinds)], ["address-stack"]);
	expectTokens(sample("samples/gef_10.txt", "────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────[ threads ]────"), [["────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────[ threads ]────", "section"]]);
});

test("adversarial M4/W7: `dereference` rows from the `← $sp` slot on are all stack", () => {
	const ls = fixture("adversarial/gef_15.txt").split("\n");
	const text = ls.slice(2, 8).join("\n");
	assert.ok(ls[2]!.endsWith("← $rsp"));
	const slots = text.split("\n").map((l) => l.slice(0, 18));
	for (const s of slots) assert.equal(tok(text).find((l) => l.text === s)?.type, "address-stack", s);
	// L5: a value after an arrow that cannot be an address is a number
	expectTokens(sample("samples/gef_15.txt", "0x000000c820051d50│+0x0008: 0x000000c820051db0  →  0x0000000000000000"), [["0x0000000000000000", "number"]]);
	// a single row without a hint stays a plain address (REVIEW §4)
	expectTokens("0x0000fffffffffae8│+0x0008: 0x00000001fffffef8", [["0x0000fffffffffae8", "address"]]);
});

test("adversarial L5: $pc/$lr are code; non-canonical values after an arrow are numbers", () => {
	expectTokens(sample("samples/gef_2.txt", "$lr   : 0x8002cf7   →  0x81428368  →  0x81428368"), [["0x8002cf7", "address-code"]]);
	expectTokens(sample("samples/gef_2.txt", "$pc   : 0x8002d44   →  0xe7ca7834  →  0xe7ca7834"), [["$pc", "register"], ["0x8002d44", "address-code"]]);
	expectTokens(sample("samples/gef_7.txt", "$rbx   : 0x00007f776fe383a0  →  0x8d4c5741fa1e0ff3"), [["0x00007f776fe383a0", "address"], ["0x8d4c5741fa1e0ff3", "number"]]);
	expectTokens(sample("samples/gef_2.txt", "$r0   : 0x185       →  0x00000185"), [["0x00000185", "number"]]);
	// still an address when it is one
	expectTokens(sample("samples/gef_15.txt", "0x000000c820051d50│+0x0008: 0x000000c820051db0  →  0x0000000000000000"), [["0x000000c820051db0", "address"]]);
});

test("adversarial L1/W5: an r2 hexdump row is not a code-pane line", () => {
	const px = sample("fp/r2_px.txt", "0x100000460  ff03 02d1 fd7b 07a9 fdc3 0191 2800 0090  .....{......(...");
	assert.ok(!/mnemonic|address-code/.test(typesOf(px)), typesOf(px));
});
