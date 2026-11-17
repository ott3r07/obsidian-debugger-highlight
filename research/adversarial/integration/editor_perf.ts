// Cost of one ViewPlugin rebuild (runs on EVERY keystroke and every viewport change).
import { readFileSync } from "node:fs";
import { makePlugin, fakeView } from "./harness.ts";
const F = "```";
const block = readFileSync(new URL("../../../test/fixtures/gdb/session_x64.txt", import.meta.url), "utf8").split("\n").slice(0, 100).join("\n");
function note(lines: number, every: number) {
	const out: string[] = [];
	while (out.length < lines) {
		for (let i = 0; i < every; i++) out.push(`Prose line ${out.length} lorem ipsum dolor sit amet, consectetur adipiscing elit.`);
		out.push(F + "gdb", block, F);
	}
	return out.join("\n");
}
const bigBlock = F + "pwndbg\n" + readFileSync(new URL("../../../test/fixtures/pwndbg/commands.txt", import.meta.url), "utf8").split("\n").concat(Array(3000).fill("")).slice(0, 2000).join("\n") + "\n" + F;
const time = (f: () => void, n = 5) => { const ts: number[] = []; for (let i = 0; i < n; i++) { const a = performance.now(); f(); ts.push(performance.now() - a); } ts.sort((a, b) => a - b); return ts[Math.floor(n / 2)]!; };

for (const [name, doc] of Object.entries({ "20k-line note, gdb block every 200 lines": note(20000, 200), "20k-line note, no debugger blocks": Array.from({ length: 20000 }, (_, i) => `Prose line ${i} lorem ipsum dolor sit amet.`).join("\n"), "one 2000-line pwndbg block": bigBlock })) {
	const { ext, calls } = makePlugin();
	const len = doc.length;
	for (const [where, vp] of Object.entries({ top: { from: 0, to: Math.min(len, 4000) }, bottom: { from: len - 4000, to: len } })) {
		const view = fakeView(doc, vp);
		const inst = ext.create(view);
		calls.tokenize = 0;
		const keystroke = time(() => inst.update({ docChanged: true, viewportChanged: false, view }));
		const tokOnKeystroke = calls.tokenize / 5;
		// scroll by ~1 line: viewport bottom moves -> the visible block's truncated text changes -> cache miss
		let shift = 0;
		calls.tokenize = 0;
		const scroll = time(() => { shift += 80; view.viewport = { from: Math.max(0, vp.from - shift), to: vp.to - shift }; inst.update({ docChanged: false, viewportChanged: true, view }); });
		console.log(`${name} [viewport ${where}]: rebuild(keystroke)=${keystroke.toFixed(1)}ms (tokenize calls/rebuild=${tokOnKeystroke})  rebuild(scroll 1 line)=${scroll.toFixed(1)}ms (tokenize calls=${calls.tokenize}/5)`);
	}
}

// Realistic typing inside / near a big block: each keystroke changes the block text -> full re-tokenize.
{
	const lines = readFileSync(new URL("../../../test/fixtures/pwndbg/commands.txt", import.meta.url), "utf8").split("\n");
	const body: string[] = []; while (body.length < 2000) body.push(...lines);
	const doc0 = "# notes\n" + F + "pwndbg\n" + body.slice(0, 2000).join("\n") + "\n" + F + "\n";
	const { ext, calls } = makePlugin();
	let doc = doc0;
	const mid = Math.floor(doc.length / 2);
	const vp = { from: mid - 3000, to: mid + 3000 };
	const view = fakeView(doc, vp);
	const inst = ext.create(view);
	const ts: number[] = [];
	for (let i = 0; i < 10; i++) {
		doc = doc.slice(0, mid) + "x" + doc.slice(mid); // type a char in the middle of the block
		view.state = fakeView(doc).state;
		const a = performance.now();
		inst.update({ docChanged: true, viewportChanged: false, view });
		ts.push(performance.now() - a);
	}
	ts.sort((a, b) => a - b);
	console.log(`typing in the middle of a 2000-line pwndbg block (${(doc0.length / 1024).toFixed(0)}KB): median rebuild ${ts[5]!.toFixed(1)}ms, max ${ts[9]!.toFixed(1)}ms, tokenize calls ${calls.tokenize}`);
}
