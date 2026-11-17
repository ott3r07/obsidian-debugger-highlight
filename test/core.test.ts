import { test } from "node:test";
import assert from "node:assert/strict";
import Prism from "prismjs";
import { scanFences } from "../src/core/fences.ts";
import { blockSegments } from "../src/core/tokens.ts";
import { LANGUAGES } from "../src/grammars/index.ts";

const F = "```";
const lines = (s: string) => {
	let from = 0;
	return s.split("\n").map((text) => {
		const l = { from, text };
		from += text.length + 1;
		return l;
	});
};
const want = (l: string) => l in LANGUAGES;
const typed = (lang: string, text: string) =>
	blockSegments(Prism as any, text, LANGUAGES[lang]!).map((s) => `${s.classes[1]}:${text.slice(s.from, s.to)}`);

test("fences: `>` lines inside an unquoted fence are content", () => {
	const doc = `${F}gdb\n(gdb) python\n>${F}\n>end\n${F}\nafter`;
	assert.deepEqual(scanFences(lines(doc), want)[0]!.lines.map((l) => l.text), ["(gdb) python", `>${F}`, ">end"]);
});

test("fences: list-item fences (tab / spaces) are found and de-indented", () => {
	for (const ind of ["\t", "    ", "  "]) {
		const doc = `- step\n${ind}${F}gdb\n${ind}(gdb) bt\n${ind}${F}`;
		const b = scanFences(lines(doc), want)[0]!;
		assert.equal(b.lines[0]!.text, "(gdb) bt", JSON.stringify(ind));
		assert.equal(doc.slice(b.lines[0]!.from, b.lines[0]!.from + 5), "(gdb)");
	}
});

test("fences: frontmatter is skipped", () => {
	const doc = `---\nsnippet: |\n  ${F}gdb\n---\n(gdb) prose\n${F}pwndbg\npwndbg> ni\n${F}`;
	const b = scanFences(lines(doc), want);
	assert.deepEqual(b.map((x) => x.lang), ["pwndbg"]);
});

test("blockSegments: offsets refer to the original text (indent, NBSP, CRLF)", () => {
	const text = "    (gdb) x/2gx $rsp\r\n    0x7ffe0010: 0x1\r\n";
	const segs = blockSegments(Prism as any, text, LANGUAGES.gdb!);
	assert.ok(segs.length > 0);
	for (const s of segs) {
		assert.ok(s.from >= 0 && s.to <= text.length && s.from < s.to);
		assert.ok(!text.slice(s.from, s.to).includes("\n"));
	}
	assert.ok(typed("gdb", text).includes("dbg-prompt:(gdb)"));
});

test("blockSegments: segments are sorted and non-overlapping", () => {
	const text = "  pwndbg> telescope\n  00:0000│ rsp 0x7ffe0 —▸ 0x1\n\n  pwndbg> ni";
	const segs = blockSegments(Prism as any, text, LANGUAGES.pwndbg!);
	for (let i = 1; i < segs.length; i++) assert.ok(segs[i]!.from >= segs[i - 1]!.to);
});
