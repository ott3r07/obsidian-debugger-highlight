const fs=require('fs'),path=require('path');
const M=require(path.resolve(process.argv[2]));const files=process.argv.slice(3);
const {classifyAnnotation,CHAIN}=M;const R=Object.fromEntries(Object.entries(M).filter(([k,v])=>v instanceof RegExp&&k!=='CHAIN'));
const V={orig:l=>l,trimEnd:l=>l.replace(/[ \t]+$/,''),tabstop8:l=>{let o='';for(const c of l){if(c==='\t'){o+=' '.repeat(8-(o.length%8));}else o+=c;}return o.replace(/ +$/,'');},tab1:l=>l.replace(/\t/g,' ').replace(/ +$/,'')};
const norm=l=>l.replace(/0x[0-9a-f]+/g,'0xH').replace(/\d+/g,'N').slice(0,100);
for(const vn of (process.env.VARIANTS||'orig,trimEnd,tabstop8,tab1').split(',')){
 const cls={},un=new Map(),cf=new Map(),ann={};let tot=0,nun=0;
 for(const f of files){fs.readFileSync(f,'utf8').split('\n').forEach((raw,i)=>{
  if(/^Script (started|done)/.test(raw)||/^# (SOURCE|----|\()/.test(raw))return;
  const l=V[vn](raw);if(l.trim()==='')return;tot++;
  const k=Object.keys(R).find(k=>R[k].test(l));
  if(!k){nun++;const s=norm(l);if(!un.has(s))un.set(s,{n:0,ex:path.basename(f)+':'+(i+1)+'  '+JSON.stringify(l).slice(0,130)});un.get(s).n++;return;}
  cls[k]=(cls[k]||0)+1;
  let chain=null;const m=l.match(R[k]);
  if(['register','stack','arg'].includes(k))chain=m[2];else if(k==='searchResult')chain=m[2];else if(k==='chainLine')chain=l;
  if(chain!==null&&chain!=='Cannot access memory address'){const c=chain.match(CHAIN);
   if(!c){const s=k+' | '+norm(chain);if(!cf.has(s))cf.set(s,{n:0,ex:path.basename(f)+':'+(i+1)+'  '+JSON.stringify(l).slice(0,140)});cf.get(s).n++;}
   else if(c[3]!==undefined){const a=classifyAnnotation(c[3]);ann[a]=ann[a]||{n:0,ex:[]};ann[a].n++;if(ann[a].ex.length<(a==='UNKNOWN'?20:2))ann[a].ex.push(path.basename(f)+':'+(i+1)+' '+JSON.stringify(c[3]).slice(0,90));}}
 });}
 console.log(`\n######## ${vn}: ${tot} lines, ${nun} unmatched (${un.size} shapes)`);
 if(process.env.CLS)console.log(JSON.stringify(cls));
 console.log('annotations:');for(const[a,x]of Object.entries(ann))console.log('  ',a,x.n,x.ex.join(' || '));
 console.log('chain parse failures:');[...cf.values()].forEach(x=>console.log('  ',x.n,x.ex));
 if(process.env.UN)[...un.values()].sort((a,b)=>b.n-a.n).slice(0,+process.env.UN).forEach(x=>console.log('  U',String(x.n).padStart(4),x.ex));
}
