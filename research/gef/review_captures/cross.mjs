import fs from "node:fs"; import path from "node:path";
import { classify } from "/Users/ott3r/tmp/obsidian_plugin/research/gef/build/gef_line_regexes.mjs";
const root = process.argv[2]; const per = {};
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d,f);
 if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith(".txt") && !/session/.test(f))
  for (const l of fs.readFileSync(p,"utf8").split("\n")) { const c = classify(l); if (!c || c==="blank") continue; (per[c] ||= new Map()).set(l, f); } } };
walk(root);
for (const [k,v] of Object.entries(per)) { const a=[...v]; console.log(`## ${k} (${a.length})`); a.slice(0,3).forEach(([l,f])=>console.log(`   ${f}: ${JSON.stringify(l).slice(0,130)}`)); }
