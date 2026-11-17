import fs from "node:fs"; import path from "node:path";
import { RULES } from "/Users/ott3r/tmp/obsidian_plugin/research/gef/build/gef_line_regexes.mjs";
const roots = process.argv.slice(2); const lines = new Map();
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d,f);
 if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith(".txt") && !f.startsWith("session_"))
  for (const l of fs.readFileSync(p,"utf8").split("\n")) if (!lines.has(l)) lines.set(l, path.basename(p)); } };
roots.forEach(walk);
const pairs = {};
for (const [l,f] of lines) { const hits = RULES.filter(([n,re]) => re.test(l)).map(([n])=>n);
  if (hits.length > 1) { const k = hits.join(" > "); (pairs[k] ||= []).push(`${f}: ${JSON.stringify(l).slice(0,140)}`); } }
for (const [k,v] of Object.entries(pairs)) { console.log(`## ${k}  (${v.length} distinct)`); v.slice(0,3).forEach(x=>console.log("   "+x)); }
