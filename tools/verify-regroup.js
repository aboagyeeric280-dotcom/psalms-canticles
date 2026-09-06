'use strict';
/* Confirm that regrouping moved lines and nothing else: the sequence of line
   objects in every psalm must be byte-for-byte what it was before. */

const a = require('./parsed.before-regroup.json');
const b = require('./parsed.json');

const gather = (d) => {
  const out = [];
  const w = (blocks) => { for (const x of blocks) if (x.k === 'psalm' || x.k === 'cant') out.push(x); };
  for (const q of d.offices) w(q.blocks);
  for (const q of d.readings) w(q.blocks);
  for (const k of ['compline', 'feastsCommon', 'feastsProper', 'invitatory',
    'supplements', 'lentCanticle', 'zechariah', 'mary']) w(d[k]);
  return out;
};

const gatherText = (d) => {
  const out = [];
  const w = (blocks) => { for (const x of blocks) if (x.k === 'text') out.push(x); };
  for (const q of d.offices) w(q.blocks);
  for (const q of d.readings) w(q.blocks);
  for (const k of Object.keys(d)) if (Array.isArray(d[k])) w(d[k].filter(x => x && x.k));
  return out;
};

const TA = gatherText(a), TB = gatherText(b);
let textChanged = 0;
if (TA.length !== TB.length) { console.error('text block count differs'); process.exit(1); }
for (let i = 0; i < TA.length; i++) {
  if (JSON.stringify(TA[i].paras.flat()) !== JSON.stringify(TB[i].paras.flat())) textChanged++;
}

const A = gather(a), B = gather(b);
let changed = 0;
if (A.length !== B.length) { console.error('block count differs'); process.exit(1); }
for (let i = 0; i < A.length; i++) {
  const la = JSON.stringify(A[i].strophes.flat());
  const lb = JSON.stringify(B[i].strophes.flat());
  if (la !== lb) { changed++; if (changed < 4) console.log('LINES CHANGED in', A[i].ref); }
}
console.log('psalms and canticles          ', A.length);
console.log('whose line sequence changed   ', changed, changed === 0 ? '(none — only the grouping moved)' : '*** PROBLEM ***');
console.log('prose/hymn blocks              ', TA.length);
console.log('whose line sequence changed   ', textChanged, textChanged === 0 ? '(none — only the grouping moved)' : '*** PROBLEM ***');
console.log('paragraphs                    ', TA.reduce((n,x)=>n+x.paras.length,0), '->', TB.reduce((n,x)=>n+x.paras.length,0));
console.log('stanzas                       ',
  A.reduce((n, x) => n + x.strophes.length, 0), '->', B.reduce((n, x) => n + x.strophes.length, 0));

const hist = {};
for (const x of B) for (const s of x.strophes) hist[s.length] = (hist[s.length] || 0) + 1;
const keys = Object.keys(hist).map(Number).sort((p, q) => p - q);
console.log('\nstanza sizes now:');
for (const k of keys) console.log(String(k).padStart(4), 'lines  ', String(hist[k]).padStart(4));

process.exit(changed || textChanged ? 1 : 0);
