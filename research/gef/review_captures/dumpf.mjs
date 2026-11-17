import fs from "node:fs"; import path from "node:path";
import { classify } from "./fixed.mjs";
const root = process.argv[2]; const out=[];
const walk = d => { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d,f);
 if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith(".txt") && !f.startsWith("session_")) {
  fs.readFileSync(p,"utf8").split("\n").forEach((l,i)=>out.push(`${path.relative(root,p)}:${i+1}\t${classify(l)||"NONE"}\t${JSON.stringify(l)}`)); } } };
walk(root); fs.writeFileSync("dump.tsv", out.join("\n")); console.log(out.length);
