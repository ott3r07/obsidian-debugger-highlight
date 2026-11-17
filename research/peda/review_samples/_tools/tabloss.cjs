const fs=require('fs'),path=require('path');const R=require(path.resolve(process.argv[2]));
const ts=l=>{let o='';for(const c of l){if(c==='\t')o+=' '.repeat(8-(o.length%8));else o+=c;}return o.replace(/ +$/,'');};
const loss={},trim={};
for(const f of process.argv.slice(3))fs.readFileSync(f,'utf8').split('\n').forEach(l=>{if(!l)return;for(const k in R){if(!(R[k] instanceof RegExp))continue;if(R[k].test(l)&&!R[k].test(ts(l)))loss[k]=(loss[k]||0)+1;if(R[k].test(l)&&!R[k].test(l.replace(/[ \t]+$/,'')))trim[k]=(trim[k]||0)+1;}});
console.log('lost when TABs expanded:',JSON.stringify(loss));console.log('lost when trailing ws trimmed:',JSON.stringify(trim));
