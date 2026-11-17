// Vanilla GDB grammar tests. Every asserted line is copied from a real capture
// (test/fixtures/gdb/*.txt, sourced from research/**/captures and review_samples);
// `line()` checks the line really exists in the fixture before tokenizing it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import Prism from "prismjs";
import type { TokenStream } from "prismjs";
import { gdb } from "../src/grammars/gdb.ts";
import { asmInstruction, instructionWithMnemonic } from "../src/grammars/shared.ts";

const FIX = new URL("./fixtures/gdb/", import.meta.url);
const fixtures = new Map(
	readdirSync(FIX).map((f) => [f, readFileSync(new URL(f, FIX), "utf8").split("\n")] as const),
);

/** a line that must exist verbatim in the named fixture */
function line(fixture: string, text: string): string {
	assert.ok(fixtures.get(fixture)?.includes(text), `not in ${fixture}: ${JSON.stringify(text)}`);
	return text;
}

/** flattened leaf tokens as [type, text]; structural `gdb-*` wrappers are skipped */
function leaves(text: string, grammar = gdb): Array<[string, string]> {
	const out: Array<[string, string]> = [];
	const walk = (s: TokenStream, type: string) => {
		if (typeof s === "string") {
			if (type && s.trim()) out.push([type, s]);
		} else if (Array.isArray(s)) s.forEach((x) => walk(x, type));
		else walk(s.content, s.type.startsWith("gdb-") ? type : s.type);
	};
	walk(Prism.tokenize(text, grammar), "");
	return out;
}

function has(text: string, type: string, value: string, grammar = gdb) {
	const ls = leaves(text, grammar);
	assert.ok(
		ls.some(([t, v]) => t === type && v.trim() === value),
		`expected ${type}«${value}» in ${JSON.stringify(text)}\n  got: ${ls.map(([t, v]) => `${t}«${v}»`).join(" ")}`,
	);
}
const lacks = (text: string, type: string, value: string) =>
	assert.ok(!leaves(text).some(([t, v]) => t === type && v.trim() === value), `unexpected ${type}«${value}»`);

const X64 = "session_x64.txt";
const A64 = "session_arm64.txt";
const CRASH = "crash.txt";
const RW = "realworld.txt";
const PEDA = "peda_samples.txt";

test("prompt, command and y/n query", () => {
	const l = line(X64, "(gdb) x/20gx $sp");
	has(l, "prompt", "(gdb)");
	has(l, "command", "x/20gx $sp");
	const q = line(X64, "Delete all breakpoints, watchpoints, tracepoints, and catchpoints? (y or n) y");
	has(q, "prompt", "(y or n)");
	has(q, "command", "y");
});

test("breakpoint set / hit / thread hit", () => {
	const set = line(X64, "Breakpoint 1 at 0x555555557317: file test.c, line 24.");
	has(set, "address-code", "0x555555557317");
	has(set, "path", "test.c");
	has(set, "number", "24");
	has(line(A64, "Temporary breakpoint 2 at 0xa00: file test.c, line 13."), "keyword", "Temporary breakpoint");

	const hit = line(X64, "Breakpoint 1, main (argc=1, argv=0xffff935a9cf8) at test.c:24");
	has(hit, "keyword", "Breakpoint");
	has(hit, "symbol", "main");
	has(hit, "address", "0xffff935a9cf8");
	has(hit, "path", "test.c");

	const t = line(PEDA, 'Thread 1 "revengme" hit Breakpoint 2, 0x0000000000488e99 in ?? ()');
	has(t, "string", '"revengme"');
	has(t, "address-code", "0x0000000000488e99");
	has(t, "symbol", "??");
	has(line(RW, "Thread 1 hit Breakpoint 1, factorial (n=5) at fact.c:5"), "symbol", "factorial");
	const lib = line(PEDA, "Breakpoint 1, 0xf7e6fdc0 in free () from /lib/i386-linux-gnu/libc.so.6");
	has(lib, "symbol", "free");
	has(lib, "path", "/lib/i386-linux-gnu/libc.so.6");
	const tbp = line(X64, "Temporary breakpoint 2, compute (f=0x5555555571c9 <add>, x=6, y=7) at test.c:13");
	has(tbp, "address-code", "0x5555555571c9");
	has(tbp, "symbol", "<add>");
});

test("watchpoints", () => {
	has(line(A64, "Hardware watchpoint 4: r"), "keyword", "Hardware watchpoint");
	has(line(A64, "Old value = 0"), "keyword", "Old value");
	has(line(A64, "New value = 13"), "number", "13");
	has(line(RW, "Hardware watchpoint 2: *(int*)0x6009c8"), "number", "2");
});

test("source lines, with and without pc prefix", () => {
	const s = line(X64, "30\t    strcpy(stackbuf, \"AAAAAAAABBBBBBBBCCCCCCCC\");");
	has(s, "number", "30");
	has(s, "string", '"AAAAAAAABBBBBBBBCCCCCCCC"');
	const pc = line(X64, "0x0000555555557338\t30\t    strcpy(stackbuf, \"AAAAAAAABBBBBBBBCCCCCCCC\");");
	has(pc, "address-code", "0x0000555555557338");
	has(pc, "number", "30");
	has(line(X64, "test.c:"), "path", "test.c");
	// tabs expanded to spaces by the paste
	has("24      int main(int argc, char **argv) {", "number", "24");
});

test("run control, exit, signals, errors, warnings", () => {
	has(line(A64, "Starting program: /work/test_arm64 "), "path", "/work/test_arm64");
	has(line(X64, "Continuing."), "keyword", "Continuing.");
	const v = line(X64, "Value returned is $10 = 13");
	has(v, "register", "$10");
	has(v, "number", "13");
	const rt = line(X64, "Run till exit from #0  compute (f=0x5555555571c9 <add>, x=6, y=7) at test.c:13");
	has(rt, "keyword", "Run till exit from");
	has(rt, "symbol", "compute");
	has(line(X64, "[Inferior 1 (process 1053) exited normally]"), "msg-ok", "exited normally");
	has(line(PEDA, "[Inferior 1 (process 27480) exited with code 041]"), "msg-warn", "exited with code");
	has(line(CRASH, "[Inferior 1 (process 1090) killed]"), "msg-error", "killed");
	has(line(CRASH, "Program received signal SIGSEGV, Segmentation fault."), "signal", "Program received signal SIGSEGV, Segmentation fault.");
	has(line(PEDA, "Program terminated with signal SIGILL, Illegal instruction."), "signal", "Program terminated with signal SIGILL, Illegal instruction.");
	has(line(A64, "[Thread debugging using libthread_db enabled]"), "msg-info", "Thread debugging using libthread_db enabled");
	has(line(RW, "[New Thread 0x7ffff782c700 (LWP 8813)]"), "address", "0x7ffff782c700");
	const err = line(CRASH, "=> 0x0:\tCannot access memory at address 0x0");
	has(err, "current", "=>");
	has(err, "msg-error", "Cannot access memory at address");
	has(line(A64, 'No symbol "disassembly" in current context.'), "string", '"disassembly"');
	has(line(A64, 'No symbol "disassembly" in current context.'), "msg-error", "No symbol");
	has(line(PEDA, 'Error in re-setting breakpoint 1: Function "bar" not defined.'), "msg-error", "Error in re-setting breakpoint 1: Function");
	const w = line(CRASH, "warning: 44\t./nptl/pthread_kill.c: No such file or directory");
	has(w, "path", "./nptl/pthread_kill.c");
	has(w, "msg-warn", "warning: 44");
	has(line(X64, "Warning:"), "msg-warn", "Warning:");
	has(line(X64, "Initial frame selected; you cannot go up."), "msg-error", "Initial frame selected; you cannot go up.");
	has(line(CRASH, "Backtrace stopped: previous frame identical to this frame (corrupt stack?)"), "msg-warn", "Backtrace stopped: previous frame identical to this frame (corrupt stack?)");
});

test("x/ examine output", () => {
	const gx = line(X64, "0xffff935a9b00:\t0x0000ffff935a9cf8\t0x0000000100000006");
	has(gx, "address", "0xffff935a9b00");
	has(gx, "number", "0x0000ffff935a9cf8");
	const sym = line(X64, "0x55555555a020 <global_buf>:\t0x64206c61626f6c67\t0x6972747320617461");
	has(sym, "address", "0x55555555a020"); // a data row label: kind unknown
	has(sym, "symbol", "<global_buf>");
	has(line(X64, '0x555555558004:\t"Hello, pwndbg!"'), "string", '"Hello, pwndbg!"');
	const c = line(X64, "0x555555558004:\t72 'H'\t101 'e'\t108 'l'\t108 'l'\t111 'o'\t44 ','\t32 ' '\t112 'p'");
	has(c, "number", "72");
	has(c, "string", "'H'");
	has(line(X64, "0xffff935a9b00:\t-1822778120\t65535\t6\t1"), "number", "-1822778120");
	// tab-less paste
	has("0x7fffffffe278: 0x0000555555554e62      0x0000000000000004", "address", "0x7fffffffe278");
});

test("x/i and disassemble: AT&T, Intel, aarch64, /r, /s", () => {
	const att = line(X64, "=> 0x555555557489 <main+398>:\tmov    -0xb8(%rbp),%rax");
	has(att, "current", "=>");
	has(att, "address-code", "0x555555557489");
	has(att, "symbol", "<main+398>");
	has(att, "mnemonic", "mov");
	has(att, "register", "%rbp");
	has(att, "number", "-0xb8");
	const call = line(X64, "   0x55555555749d <main+418>:\tcall   0x555555557246 <compute>");
	has(call, "mnemonic-branch", "call");
	has(call, "address-code", "0x555555557246");
	const cmt = line(X64, "   0x5555555574a8 <main+429>:\tlea    -0x2a7(%rip),%rax        # 0x555555557208 <mul>");
	has(cmt, "comment", "#");
	has(cmt, "address-code", "0x555555557208");
	has(cmt, "symbol", "<mul>");

	const intel = line(X64, "   0x0000555555557252 <+12>:\tmov    QWORD PTR [rbp-0x18],rdi");
	has(intel, "mnemonic", "mov");
	has(intel, "register", "rbp");
	has(intel, "register", "rdi");
	lacks(intel, "mnemonic", "QWORD"); // regression: operands must not become mnemonics
	const intel2 = line(X64, "   0x000055555555724b <+5>:\tmov    rbp,rsp");
	has(intel2, "register", "rbp");
	lacks(intel2, "mnemonic", "rbp");

	const r = line(X64, "   0x00005555555571db <+18>:\t64 48 8b 04 25 28 00 00 00\tmov    rax,QWORD PTR fs:0x28");
	has(r, "number", "64 48 8b 04 25 28 00 00 00");
	has(r, "mnemonic", "mov");
	has(r, "register", "fs");

	const a64 = line(A64, "=> 0xaaaaaaaa0c44 <main+368>:\tmov\tw2, #0x7                   \t// #7");
	has(a64, "register", "w2");
	has(a64, "number", "#0x7"); // an aarch64 immediate is not a comment
	has(a64, "comment", "// #7");
	const a64r = line("disasm_r_arm64.txt", "   0x0000aaaaaaaa091c <+4>:\ta9027bfd\tstp\tx29, x30, [sp, #32]");
	has(a64r, "register", "x29");
	has(a64r, "number", "#32");
	const beq = line("disasm_r_arm64.txt", "   0x0000aaaaaaaa0968 <+80>:\t54000040\tb.eq\t0xaaaaaaaa0970 <add+88>  // b.none");
	has(beq, "number", "54000040");
	has(beq, "mnemonic-branch", "b.eq");
	has(beq, "address-code", "0xaaaaaaaa0970");

	has(line(X64, "Dump of assembler code for function main:"), "symbol", "main");
	has(line(X64, "End of assembler dump."), "comment", "End of assembler dump.");
	has(line(PEDA, "   0x080485a7 <+0>:\tpush   ebp"), "register", "ebp");
	has(line(RW, "   0x3433e00a7b <_dl_start_user+3>:     mov    0x21b30b(%rip),%eax        # 0x343401bd8c <_dl_skip_args>"), "address-code", "0x343401bd8c");
});

test("shared instruction tokenizers anchor the mnemonic at the true start", () => {
	for (const g of [instructionWithMnemonic, asmInstruction]) {
		const ls = leaves("mov    rax, rbx", g);
		assert.deepEqual(ls.filter(([t]) => t.startsWith("mnemonic")).map(([, v]) => v), ["mov"]);
		assert.ok(ls.some(([t, v]) => t === "register" && v === "rax"));
		assert.deepEqual(leaves("  push   rbp", g).filter(([t]) => t.startsWith("mnemonic")).map(([, v]) => v.trim()), ["push"]);
	}
});

test("info registers", () => {
	const rax = line(X64, "rax            0x0                 0");
	has(rax, "register", "rax");
	has(rax, "number", "0x0");
	const rip = line(X64, "rip            0x555555557489      0x555555557489 <main+398>");
	has(rip, "address-code", "0x555555557489");
	has(rip, "symbol", "<main+398>");
	has(line(A64, "pc             0xaaaaaaaa0c44      0xaaaaaaaa0c44 <main+368>"), "address-code", "0xaaaaaaaa0c44");
	has(line(X64, "rsp            0xffff935a9b00      0xffff935a9b00"), "address-stack", "0xffff935a9b00");
	has(line(X64, "rbp            0xffff935a9bd0      0xffff935a9bd0"), "address", "0xffff935a9bd0");
	const fl = line(X64, "eflags         0x206               [ IOPL=0 IF PF ]");
	has(fl, "flag-set", "IF");
	has(fl, "flag-set", "PF");
	lacks(fl, "flag-set", "IOPL");
	has(line(A64, "cpsr           0x80001000          [ EL=0 BTYPE=0 SSBS N ]"), "flag-set", "SSBS");
	const xmm = fixtures.get(X64)!.find((l) => l.startsWith("xmm0 "))!;
	has(xmm, "register", "xmm0");
	has(xmm, "comment", "<repeats 16 times>");
});

test("backtrace frames and wrapped continuations", () => {
	const f = line(CRASH, "#1  0x000055555555727b in compute (f=0x0, x=6, y=7) at test.c:14");
	has(f, "number", "#1");
	has(f, "address-code", "0x000055555555727b");
	has(f, "symbol", "compute");
	has(f, "path", "test.c");
	has(f, "number", "14");
	const from = line(CRASH, "#1  0x0000ffff864b925e in raise () from /usr/x86_64-linux-gnu/lib/libc.so.6");
	has(from, "path", "/usr/x86_64-linux-gnu/lib/libc.so.6");
	has(from, "symbol", "raise");
	const rep = line(CRASH, "#7  0x0000aaaaaaaa0ac8 in vuln (src=0xfffffffffe72 'A' <repeats 100 times>) at test.c:22");
	has(rep, "string", "'A'");
	has(rep, "comment", "<repeats 100 times>");
	has(line(CRASH, "#1  0x0000fffff7e77520 in __pthread_kill_internal (signo=6, threadid=<optimized out>) at ./nptl/pthread_kill.c:78"), "comment", "<optimized out>");
	has(line(PEDA, "#1  0x080484de in foo (arg=0x41414141 <error: Cannot access memory at address 0x41414141>) at off_by_one.c:8"), "msg-error", "<error: Cannot access memory at address 0x41414141>");
	has(line(CRASH, "    at ./nptl/pthread_kill.c:44"), "path", "./nptl/pthread_kill.c");
	has(line(RW, "   from /home/aryt3/Hacking/CTFs/acsc_qualy_2025/neon-cirquit/extracted_app/native-addon/build/Release/addon.node"), "path", "/home/aryt3/Hacking/CTFs/acsc_qualy_2025/neon-cirquit/extracted_app/native-addon/build/Release/addon.node");
	has(line(CRASH, "__pthread_kill_implementation (threadid=281474842459872, signo=signo@entry=6, no_tid=no_tid@entry=0)"), "symbol", "__pthread_kill_implementation");
	has(line(PEDA, "0xf7e6fdd9 in free () from /lib/i386-linux-gnu/libc.so.6"), "address-code", "0xf7e6fdd9");
	has(line(RW, "0x00007e81e2317326 in CheckPassword(Napi::CallbackInfo const&) ()"), "symbol", "CheckPassword(Napi::CallbackInfo const&)");
	has(line(RW, "operator new (sz=30) at /usr/src/debug/gcc/gcc/libstdc++-v3/libsupc++/new_op.cc:43"), "symbol", "operator new");
});

test("print values", () => {
	has(line(X64, "$1 = (void *) 0xffff935a9b00"), "address", "0xffff935a9b00");
	has(line(X64, "$1 = (void *) 0xffff935a9b00"), "register", "$1");
	const fp = line(X64, "$4 = (op_fn) 0x5555555571c9 <add>");
	has(fp, "address-code", "0x5555555571c9");
	has(fp, "symbol", "<add>");
	const s = line(X64, '$5 = 0x555555558004 "Hello, pwndbg!"');
	has(s, "address", "0x555555558004");
	has(s, "string", '"Hello, pwndbg!"');
	const r = line(X64, "$6 = \"global data string\", '\\000' <repeats 45 times>");
	has(r, "string", "'\\000'");
	has(r, "comment", "<repeats 45 times>");
	has(line(X64, "$8 = 0xff"), "number", "0xff");
	const fn = line(PEDA, "$10 = {int (int, char **)} 0x401954 <main>");
	has(fn, "address-code", "0x401954");
	has(fn, "symbol", "<main>");
	has(line(X64, "type = int (*)(int, int)"), "keyword", "type");
	const arr = line(X64, "  0x55555555b3f0}");
	has(arr, "number", "0x55555555b3f0");
	has(arr, "punctuation", "}");
	has(line(X64, "        fp = 0x5555555571c9 <add>"), "address-code", "0x5555555571c9");
	has(line(X64, "1: x/i $pc"), "command", "x/i $pc");
});

test("info breakpoints / proc mappings / sharedlibrary / frame / threads / line / symbol", () => {
	has(line(X64, "Num     Type           Disp Enb Address            What"), "keyword", "Disp");
	const row = line(X64, "2       breakpoint     del  y   0x000055555555725c in compute at test.c:13");
	has(row, "keyword", "del");
	has(row, "enabled", "y");
	has(row, "address-code", "0x000055555555725c");
	has(row, "symbol", "compute");
	has(row, "path", "test.c");
	has(line(RW, "        breakpoint already hit 39 times"), "number", "39");

	const code = line(X64, "      0x555555557000     0x555555558000     0x1000     0x1000  r-xp   /work/test_x64");
	has(code, "address-code", "0x555555557000");
	has(code, "address-code", "0x555555558000");
	has(code, "number", "0x1000");
	has(code, "perm", "r-xp");
	has(code, "path", "/work/test_x64");
	has(line(X64, "      0x55555555b000     0x55555557c000    0x21000        0x0  rw-p   [heap]"), "address-heap", "0x55555555b000");
	has(line(X64, "      0xffff92daa000     0xffff935aa000   0x800000        0x0  rw-p   [stack]"), "address-stack", "0xffff935aa000");
	has(line(X64, "      0x555555556000     0x555555557000     0x1000        0x0  r--p   /work/test_x64"), "address-rodata", "0x555555556000");
	has(line(X64, "      0x55555555a000     0x55555555b000     0x1000     0x3000  rw-p   /work/test_x64"), "address-data", "0x55555555a000");
	has(line(X64, "      0xffff92da9000     0xffff92daa000     0x1000        0x0  ---p   "), "address", "0xffff92da9000");
	has(line(RW, "        0xf7ffc000 0xf7ffe000     0x2000        0x0  r-xp   [vdso]"), "address-code", "0xf7ffc000");

	const so = line(X64, "0x0000ffff92d6c000  0x0000ffff92d96195  Yes (*)     /usr/x86_64-linux-gnu/lib64/ld-linux-x86-64.so.2");
	has(so, "address-code", "0x0000ffff92d6c000");
	has(so, "path", "/usr/x86_64-linux-gnu/lib64/ld-linux-x86-64.so.2");

	has(line(X64, "Stack level 0, frame at 0xffff935a9be0:"), "address-stack", "0xffff935a9be0");
	const ip = line(X64, " rip = 0x555555557489 in main (test.c:38); saved rip = 0xffff92ad91ca");
	has(ip, "register", "rip");
	has(ip, "address-code", "0xffff92ad91ca");
	has(ip, "symbol", "main");
	const saved = line(A64, "  x29 at 0xfffffffffb40, x30 at 0xfffffffffb48");
	has(saved, "register", "x30");
	has(saved, "address-stack", "0xfffffffffb48");

	const th = line(A64, '* 1    Thread 0xfffff7ff7ee0 (LWP 1049) "test_arm64" main (argc=1, argv=0xfffffffffcc8) at test.c:38');
	has(th, "current", "*");
	has(th, "string", '"test_arm64"');
	has(th, "symbol", "main");
	has(line(A64, "* 1    process 1049      1 (native)           /work/test_arm64  "), "path", "/work/test_arm64");

	const il = line(X64, 'Line 38 of "test.c" starts at address 0x555555557489 <main+398> and ends at 0x5555555574a8 <main+429>.');
	has(il, "address-code", "0x5555555574a8");
	has(il, "symbol", "<main+429>");
	const is = line(X64, "main + 423 in section .text of /work/test_x64");
	has(is, "symbol", "main");
	has(is, "path", "/work/test_x64");
});

test("startup chatter is comment; program output stays untouched", () => {
	has(line(X64, "Reading symbols from ./test_x64..."), "path", "./test_x64");
	has(line(X64, "GNU gdb (Ubuntu 15.1-1ubuntu1~24.04.1) 15.1"), "comment", "GNU gdb (Ubuntu 15.1-1ubuntu1~24.04.1) 15.1");
	for (const out of ["Hello, pwndbg! global data string r=39 stack=AAAAAAAABBBBBBBBCCCCCCCC", "buf=short", "*** stack smashing detected ***: terminated"]) {
		line(out === "buf=short" ? X64 : CRASH, out);
		assert.deepEqual(leaves(out), [], out);
	}
});

test("CRLF, tab expansion and trimmed trailing whitespace", () => {
	const crlf = fixtures.get(X64)!.slice(40, 120).join("\r\n");
	const lf = fixtures.get(X64)!.slice(40, 120).join("\n");
	assert.deepEqual(leaves(crlf).map(([t]) => t), leaves(lf).map(([t]) => t));
	const spaced = "   0x0000555555557303 <+8>:      sub    $0xd0,%rsp";
	has(spaced, "mnemonic", "sub");
	has(spaced, "address-code", "0x0000555555557303");
	has("Starting program: /work/test_arm64", "path", "/work/test_arm64"); // trailing space trimmed
	has("1       breakpoint     keep y   0x0000555555557317 in main at test.c:24", "enabled", "y");
});

test("performance: 5,000 lines of captures under 200 ms", () => {
	const all = [...fixtures.values()].flat();
	const lines: string[] = [];
	while (lines.length < 5000) lines.push(...all);
	const text = lines.slice(0, 5000).join("\n");
	Prism.tokenize(text, gdb); // warm up
	const t0 = performance.now();
	Prism.tokenize(text, gdb);
	const ms = performance.now() - t0;
	assert.ok(ms < 200, `took ${ms.toFixed(1)} ms`);
	// pathological inputs must not backtrack catastrophically
	const bad = ["0x".padEnd(20000, "a"), "#1  0x1 in f (" + "a=1, ".repeat(4000), "main (" + "(".repeat(5000), "0x1 <" + "<".repeat(5000), "/".repeat(20000)].join("\n");
	const t1 = performance.now();
	Prism.tokenize(bad, gdb);
	assert.ok(performance.now() - t1 < 200);
});
