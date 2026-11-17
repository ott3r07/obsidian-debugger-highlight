import fs from "node:fs"; import path from "node:path";
import { classify } from "./fixed.mjs";
const roots = process.argv.slice(2); const lines = [];
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d,f);
 if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith(".txt") && !f.startsWith("session_"))
  for (const l of fs.readFileSync(p,"utf8").split("\n")) lines.push([l, path.basename(p)]); } };
roots.forEach(walk);
const expand8 = l => { let o=""; for (const c of l) { if (c==="\t") { const n = 8 - (o.length % 8); o += " ".repeat(n);} else o+=c; } return o; };
const X = { "tab->expand8": expand8, "tab->4sp": l=>l.replace(/\t/g,"    "), "tab->1sp": l=>l.replace(/\t/g," "), "rtrim": l=>l.replace(/\s+$/,""), "CRLF": l=>l+"\r", "nbsp(Obsidian copy)": l=>l.replace(/ /g," ") };
for (const [name, fn] of Object.entries(X)) { const ch = {};
  for (const [l,f] of lines) { const a = classify(l), b = classify(fn(l)); if (a!==b) { const k=`${a} -> ${b}`; (ch[k] ||= {n:0, ex:`${f}: ${JSON.stringify(l).slice(0,110)}`}).n++; } }
  console.log(`### ${name}`); for (const [k,v] of Object.entries(ch).sort((x,y)=>y[1].n-x[1].n)) console.log(`  ${v.n}\t${k}\t${v.ex}`); }
