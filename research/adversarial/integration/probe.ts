import { decorate, editorLeaves, readingLeaves } from "./harness.ts";
const doc = process.argv[2]!.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
const r = decorate(doc);
console.log(JSON.stringify(doc));
console.log("editor :", editorLeaves(r.marks).join(" | "));
