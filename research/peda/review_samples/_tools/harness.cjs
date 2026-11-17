// Usage: node harness.js <regexes.js> <files...>
// Runs every line regex against every line, under several paste variants.
const fs = require('fs');
const path = require('path');
const R = require(path.resolve(process.argv[2]));
const files = process.argv.slice(3);

const variants = {
  orig: (l) => l,
  trimEnd: (l) => l.replace(/[ \t]+$/, ''),
  tab4: (l) => l.replace(/\t/g, '    ').replace(/[ \t]+$/, ''),
  tab1: (l) => l.replace(/\t/g, ' ').replace(/[ \t]+$/, ''),
  // Expand tabs to 8-col tab stops like a terminal copy would
  tabstop8: (l) => { let o = ''; for (const c of l) { if (c === '\t') { const n = 8 - (o.length % 8); o += ' '.repeat(n); } else o += c; } return o.replace(/ +$/, ''); },
};

// spec's chain peel (section 6)
const PEEL = [
  ['truncated', / ?\((--> \.\.\.)\)$/],
  ['string', / ?\(("(?:[^"\\]|\\.)*"(?:\.\.\.)?)\)$/],
  ['string-value', / ?\(('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\)$/],
  ['symbol+disasm', / ?\((<[^>]+>):[\t ]+(.*)\)$/],
  ['memerror', / ?\((MemError)\)$/],
  ['disasm', / ?\(([a-z][a-z0-9]*(?:[\t ].*)?)\)$/],
];
const ELEMS = /^0x[0-9a-f]+(?: --> 0x[0-9a-f]+)*\s*$/;
function peel(chain) {
  for (const [name, re] of PEEL) {
    const m = chain.match(re);
    if (m) return { kind: name, rest: chain.slice(0, m.index) };
  }
  return { kind: 'none', rest: chain };
}

const norm = (l) => l.replace(/0x[0-9a-f]+/g, '0xH').replace(/\d+/g, 'N').slice(0, 110);
const out = {};
for (const vname of Object.keys(variants)) {
  const unmatched = new Map(), multi = new Map(), chainFail = new Map();
  let total = 0, nUn = 0;
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((raw, i) => {
      if (/^Script (started|done)/.test(raw) || /^# (SOURCE|----)/.test(raw)) return;
      const l = variants[vname](raw);
      if (l === '') return;
      total++;
      const hits = Object.keys(R).filter((k) => R[k].test(l));
      const key = path.basename(f) + ':' + (i + 1);
      if (hits.length === 0) {
        nUn++;
        const k = norm(l);
        if (!unmatched.has(k)) unmatched.set(k, { n: 0, ex: key + '  ' + JSON.stringify(l).slice(0, 140) });
        unmatched.get(k).n++;
      } else if (hits.length > 1) {
        const k = hits.join('+');
        if (!multi.has(k)) multi.set(k, { n: 0, ex: key + '  ' + JSON.stringify(l).slice(0, 140) });
        multi.get(k).n++;
      }
      // chain checks
      let chain = null;
      let m;
      if ((m = l.match(R.register))) chain = m[2];
      else if ((m = l.match(R.stack))) chain = m[2];
      else if ((m = l.match(R.arg))) chain = m[2];
      if (chain !== null) {
        const p = peel(chain);
        if (!ELEMS.test(p.rest) && !/^Cannot access memory address/.test(chain)) {
          const k = p.kind + ' | ' + norm(chain);
          if (!chainFail.has(k)) chainFail.set(k, { n: 0, ex: key + '  ' + JSON.stringify(l).slice(0, 160) });
          chainFail.get(k).n++;
        }
      }
    });
  }
  out[vname] = { total, nUn, unmatched, multi, chainFail };
}
const only = process.env.VARIANT ? [process.env.VARIANT] : Object.keys(out);
for (const v of only) {
  const o = out[v];
  console.log(`\n######## variant=${v}: ${o.total} non-empty lines, ${o.nUn} matched by NO regex, ${[...o.unmatched.keys()].length} distinct shapes`);
  if (!process.env.SUMMARY) {
    console.log('--- unmatched (count, example)');
    [...o.unmatched.values()].sort((a, b) => b.n - a.n).forEach((x) => console.log(String(x.n).padStart(5), x.ex));
    console.log('--- multi-match');
    [...o.multi.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([k, x]) => console.log(String(x.n).padStart(5), k, '  ', x.ex));
  }
  console.log('--- chain tokenisation failures');
  [...o.chainFail.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([k, x]) => console.log(String(x.n).padStart(5), k.slice(0, 60), '  ', x.ex));
}
