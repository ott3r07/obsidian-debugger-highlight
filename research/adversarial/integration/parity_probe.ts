import { decorate, editorLeaves, readingLeaves } from "./harness.ts";
const F = "```";
const later = `\n\nSome prose with (gdb) in it and a pwndbg> mention.\n\n${F}python\nprint("not gdb")\n${F}\n\n${F}gdb\n(gdb) x/2gx $rsp\n${F}\n`;
for (const [name, head] of Object.entries({
	"gdb `python` multi-line input with a `>` + fence line": `${F}gdb\n(gdb) python\n>${F}\n>end\n${F}`,
	"YAML frontmatter containing a fence": `---\nsnippet: |\n  ${F}gdb\n---`,
})) {
	const doc = head + later;
	const r = decorate(doc);
	console.log(`### ${name}`);
	for (const m of r.marks) console.log(`   L${r.view.state.doc.lineAt(m.from).number} ${m.cls.replace("token dbg-", "")}: ${JSON.stringify(m.text)}`);
}
console.log("### reading view tokens for `>silent` / `>print $rax` / `>>> print(1)`:");
for (const t of [">silent", ">print $rax", ">end", ">>> print(1)"]) console.log("  ", JSON.stringify(t), "->", readingLeaves("gdb", t).join(" ") || "(none)", "| editor gets", JSON.stringify(t.replace(/^(?:[ \t]{0,3}>[ ]?)*/, "")), "->", readingLeaves("gdb", t.replace(/^(?:[ \t]{0,3}>[ ]?)*/, "")).join(" ") || "(none)");
