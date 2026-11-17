import { test } from "node:test";
import assert from "node:assert/strict";
import { scanFences } from "../src/core/fences.ts";

const lines = (s: string) => {
	let from = 0;
	return s.split("\n").map((text) => {
		const l = { from, text };
		from += text.length + 1;
		return l;
	});
};
const want = (l: string) => ["gdb", "pwndbg", "gef", "peda"].includes(l);

test("finds wanted blocks only, keeps offsets", () => {
	const doc = "a\n```pwndbg\nRAX 0x1\n```\n```python\nx\n```\n~~~gef\ngef➤ ni\n~~~\n";
	const b = scanFences(lines(doc), want);
	assert.equal(b.length, 2);
	assert.equal(b[0]!.lang, "pwndbg");
	assert.deepEqual(b[0]!.lines, [{ from: doc.indexOf("RAX"), text: "RAX 0x1" }]);
	assert.equal(b[1]!.lang, "gef");
});

test("closing fence must match char and be at least as long", () => {
	const doc = "````gdb\n```\n(gdb) x\n````\nafter";
	const b = scanFences(lines(doc), want);
	assert.deepEqual(b[0]!.lines.map((l) => l.text), ["```", "(gdb) x"]);
});

test("unwanted language blocks are skipped as a whole", () => {
	const doc = "```md\n```gdb\n```\n";
	assert.equal(scanFences(lines(doc), want).length, 0);
});

test("blockquote / callout fences strip prefix and end with the quote", () => {
	const doc = "> [!note]\n> ```peda\n> gdb-peda$ ni\n> RAX: 0x0\nplain\n";
	const b = scanFences(lines(doc), want);
	assert.equal(b.length, 1);
	assert.deepEqual(b[0]!.lines.map((l) => l.text), ["gdb-peda$ ni", "RAX: 0x0"]);
	assert.equal(doc.slice(b[0]!.lines[0]!.from, b[0]!.lines[0]!.from + 4), "gdb-");
});

test("info string with attributes", () => {
	const b = scanFences(lines("```pwndbg title=x\nA\n```"), want);
	assert.equal(b[0]!.lang, "pwndbg");
});
