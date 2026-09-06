'use strict';
/* Confirm that every line of the eighteen settings reached the app exactly as
   the document writes it — accents, slashes, hyphens, asterisks and all.
   Both sides drop the "+n" page-continuation marks first, on the same rule,
   so that "identical" means identical in everything the singer reads.

   Run with:  node tools/check-canticles.js [file.docx]                      */

const path = require('path');
const { readParagraphs } = require('./readdocx.js');
const { stripContinuation } = require('./continuation.js');

const SRC = process.argv[2] || path.join(__dirname, 'canticles.docx');
const app = require(path.join(__dirname, '..', 'psalms-app', 'src', 'data', 'canticles.json'));

/* Read the document again, independently of the importer, recovering both
   the lines and the stanza they belong to. */
const paragraphs = readParagraphs(SRC);
const HEADING = /^Song of (Zechariah|Mary)\s*(\d+)\s*(?:,\s*(.*))?$/;
const doc = { zechariah: new Map(), mary: new Map() };
let cur = null;
for (const p of paragraphs) {
  const text = p.text.replace(/\s+$/, '');
  if (/^Heading[12]$/.test(p.style)) {
    const m = HEADING.exec(text.trim());
    cur = m ? { who: m[1].toLowerCase(), num: +m[2] } : null;
    if (cur) doc[cur.who].set(cur.num, [[]]);
    continue;
  }
  if (!cur) continue;
  const stanzas = doc[cur.who].get(cur.num);
  const last = () => stanzas[stanzas.length - 1];
  if (!text.trim()) { if (last().length) stanzas.push([]); continue; }
  last().push(stripContinuation(text));
  if (p.after >= 100) stanzas.push([]);
}
for (const map of [doc.zechariah, doc.mary]) {
  for (const [k, v] of map) map.set(k, v.filter(s => s.length));
}

let bad = 0;
const check = (ok, line) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${line}`); };

for (const who of ['zechariah', 'mary']) {
  const settings = app[who];
  check(settings.length === 9, `${who}: nine settings in the app (${settings.length})`);

  for (const s of settings) {
    const wantStanzas = doc[who].get(s.num);
    const textBlock = s.blocks.find(b => b.k === 'text');
    const gotStanzas = textBlock ? textBlock.paras.map(p => p.map(l => l.t)) : [];

    if (!wantStanzas) { check(false, `${who} ${s.num}: not in the document`); continue; }

    const want = wantStanzas.flat(), got = gotStanzas.flat();
    if (want.length !== got.length) {
      check(false, `${who} ${s.num}: ${got.length} lines in the app, ${want.length} in the document`);
      continue;
    }
    let mismatch = -1;
    for (let i = 0; i < want.length; i++) if (want[i] !== got[i]) { mismatch = i; break; }
    if (mismatch >= 0) {
      check(false, `${who} ${s.num}: line ${mismatch + 1} differs` +
        `\n        doc: ${JSON.stringify(want[mismatch])}\n        app: ${JSON.stringify(got[mismatch])}`);
      continue;
    }

    // The stanza divisions were verified by hand, so they must survive too.
    const wantShape = wantStanzas.map(st => st.length).join('/');
    const gotShape = gotStanzas.map(st => st.length).join('/');
    check(wantShape === gotShape,
      `${who} ${s.num} (${s.label || '—'}): ${got.length} lines identical, ` +
      `stanzas ${gotShape}` + (wantShape === gotShape ? '' : ` but the document has ${wantShape}`));
  }
}

/* The marks that make these texts singable must all have survived. */
const all = [...app.zechariah, ...app.mary]
  .flatMap(s => (s.blocks.find(b => b.k === 'text') || { paras: [] }).paras.flat().map(l => l.t));
const joined = all.join('\n');
const count = (re) => (joined.match(re) || []).length;

console.log('\nmarks carried through:');
console.log(`  tone slashes            ${count(/\//g)}`);
console.log(`  accented vowels         ${count(/[áàâéèêíìîóòôúùûěǎ]/gi)}`);
console.log(`  flex asterisks          ${count(/\*/g)}`);
console.log(`  syllable hyphens        ${count(/[a-z]-[a-z]/gi)}`);
console.log(`  elision apostrophes     ${count(/[a-z]'[a-z]/gi)}`);

check(count(/\//g) > 100, 'the tone slashes are present');
check(count(/[áàâéèêíìîóòôúùûěǎ]/gi) > 20, 'the pitch accents are present');
check(count(/\*/g) >= 5, 'the flex asterisks are present');

console.log(bad ? `\n${bad} failing` : '\nall good');
process.exit(bad ? 1 : 0);
