import { decorate, editorLeaves } from "./harness.ts";
const F = "```";
const cases: Record<string, string> = {
	"1 gdb `commands` continuation prompt '>' inside unquoted fence": `${F}gdb\n(gdb) commands 1\n>silent\n>print $rax\n>end\n(gdb) x/2gx $rsp\n0x7fffffffe3d0:\t0x0000000000000001\t0x00007fffffffe4c8\n${F}`,
	"2 '> ${F}' line inside unquoted fence closes it": `${F}gdb\n(gdb) python\n>${F}\n>end\n(gdb) x/2gx $rsp\n0x7fffffffe3d0:\t0x0000000000000001\t0x00007fffffffe4c8\n${F}`,
	"2b python >>> prompt inside gdb block": `${F}gdb\n(gdb) python-interactive\n>>> print(gdb.parse_and_eval("$rsp"))\n0x7fffffffe3d0\n${F}`,
	"3 fence indented 2 spaces": `  ${F}pwndbg\n  pwndbg> x/2gx $rsp\n  0x7fffffffe3d0:\t0x0000000000000001\t0x00007fffffffe4c8\n  ${F}`,
	"3b same, not indented": `${F}pwndbg\npwndbg> x/2gx $rsp\n0x7fffffffe3d0:\t0x0000000000000001\t0x00007fffffffe4c8\n${F}`,
	"4 fence in list item, tab-indented": `- step\n\t${F}gdb\n\t(gdb) x/2gx $rsp\n\t0x7fffffffe3d0:\t0x0000000000000001\t0x00007fffffffe4c8\n\t${F}`,
	"4b fence in list item, 4 spaces": `1. step\n    ${F}gdb\n    (gdb) info registers rip\n    rip            0x401136            0x401136 <main+4>\n    ${F}`,
	"4c fence in list item, 3 spaces (detected, but not de-indented)": `1. step\n   ${F}gdb\n   (gdb) info registers rip\n   rip            0x401136            0x401136 <main+4>\n   ${F}`,
	"5 pwndbg {.class}": `${F}pwndbg {.foo}\npwndbg> ni\n${F}`,
	"5b {gdb} / {.gdb}": `${F}{.gdb}\n(gdb) ni\n${F}`,
	"5c GDB uppercase": `${F}GDB\n(gdb) ni\n${F}`,
	"5d gdb title=x": `${F}gdb title="x"\n(gdb) ni\n${F}`,
	"6 callout '>' no space / 2 spaces / nested": `> [!example]\n>${F}gdb\n>(gdb) ni\n>  (gdb) ni\n> > (gdb) ni\n>${F}`,
	"7 ~~~ opened, backticks inside": `~~~gdb\n${F}\n(gdb) ni\n~~~\n(gdb) after`,
	"8 unclosed at EOF": `text\n${F}gdb\n(gdb) ni`,
	"9 close fence followed by text is not a close": `${F}gdb\n(gdb) ni\n${F} x\n(gdb) si\n${F}`,
	"10 tab-indented fence (top level = indented code, not a fence)": `\t${F}gdb\n(gdb) ni\n${F}`,
	"11 lazy continuation ends quoted fence": `> ${F}gdb\n> (gdb) ni\n(gdb) si\n> ${F}`,
	"12 quote deepens inside a quoted fence": `> ${F}gdb\n> (gdb) ni\n> > (gdb) si\n> ${F}`,
	"13 4-space-indented ${F} inside fence (content, not close)": `${F}gdb\n(gdb) ni\n    ${F}\n(gdb) si\n${F}`,
	"14 html comment / %% obsidian comment around fence": `%%\n${F}gdb\n(gdb) ni\n${F}\n%%`,
	"15 frontmatter containing a fence": `---\nx: |\n  ${F}gdb\n---\n(gdb) not code`,
	"16 empty block": `${F}gdb\n${F}`,
	"17 blank lines only": `${F}gdb\n\n\n${F}`,
	"18 CRLF document": `${F}gdb\r\n(gdb) ni\r\n0x7fffffffe3d0:\t0x0000000000000001\r\n${F}\r\n`,
};
for (const [name, doc] of Object.entries(cases)) {
	const r = decorate(doc);
	console.log(`### ${name}\n${doc.split("\n").map((l) => "  | " + JSON.stringify(l).slice(1, -1)).join("\n")}\n  => ${editorLeaves(r.marks).join("  ") || "(no marks)"}`);
}
