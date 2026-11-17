import Prism from "prismjs";
import "prismjs/components/prism-c.js";
const { default: DebuggerHighlightPlugin } = await import("./.build/main.mjs");
const p: any = new DebuggerHighlightPlugin();
await p.onload();
console.log("wrap hooks after onload:", Prism.hooks.all["wrap"]?.length);
// 1) another plugin/theme calling Prism.highlight without the (optional in practice) language name
try { Prism.highlight("int x = 1;", Prism.languages.c!, undefined as any); console.log("highlight w/o language: OK"); }
catch (e: any) { console.log("highlight w/o language: THROWS ->", e.message); }
// 2) Prism.highlight for our language keeps aliases off
console.log(Prism.highlight("(gdb) ni", Prism.languages.gdb!, "gdb"));
// 3) unload twice / reload
p.onunload();
console.log("wrap hooks after unload:", Prism.hooks.all["wrap"]?.length, "gdb registered:", "gdb" in Prism.languages);
p.onunload();
console.log("wrap hooks after 2nd unload:", Prism.hooks.all["wrap"]?.length);
