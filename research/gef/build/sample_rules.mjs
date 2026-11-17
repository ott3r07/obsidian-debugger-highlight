import fs from "node:fs"; import path from "node:path";
import { classify } from "./gef_line_regexes.mjs";
const per = {}; const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d,f);
 if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith(".txt") && !f.startsWith("session_"))
  for (const l of fs.readFileSync(p,"utf8").split("\n")) { const c = classify(l); if (!c) continue; (per[c] ||= new Set()).add(l); } } };
walk(process.argv[2]);
for (const [k,v] of Object.entries(per)) { const a=[...v]; console.log(`## ${k} (${a.length})`); for (const i of [0, Math.floor(a.length/2), a.length-1]) console.log("   "+JSON.stringify(a[i]).slice(0,150)); }
