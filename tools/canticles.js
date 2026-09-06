'use strict';
/* Import the settings of the Benedictus and the Magnificat from the
   manually corrected document, vendored here as tools/canticles.docx.

   The book prints nine settings of each, but four of the Zechariah settings
   and two of the Mary settings appear there only as engraved music, so the
   app had no text for them. This document supplies all eighteen.

   The text is taken exactly as written: the pitch accents (frée, hím), the
   tone slashes, the syllable hyphens (Is-ra-el) and the flex asterisks are
   liturgical marks, not typography to be tidied. The one thing dropped is
   the "+n" page-continuation mark, which describes the printed page rather
   than the text; every one dropped is listed at the end of the run.

   Stanza breaks arrive two ways and both are honoured: space set after a
   paragraph, and an empty paragraph typed in by hand. A run of several empty
   paragraphs is one break — a stanza with no lines in it is not a thing the
   reader can show — and every such run is reported.

   Usage:  node tools/canticles.js <file.docx> [out.json]                    */

const fs = require('fs');
const path = require('path');
const { readParagraphs } = require('./readdocx.js');
const { stripContinuation } = require('./continuation.js');

const SRC = process.argv[2] || path.join(__dirname, 'canticles.docx');
const OUT = process.argv[3] || path.join(__dirname, 'canticles-src.json');

/** A paragraph ends a stanza when the document leaves space after it. */
const ENDS_STANZA = 100;

const HEADING = /^Song of (Zechariah|Mary)\s*(\d+)\s*(?:,\s*(.*))?$/;

const paragraphs = readParagraphs(SRC);

const settings = [];
const blankRuns = [];
const continuations = [];
let current = null;
let blanks = 0;

for (const p of paragraphs) {
  const text = p.text.replace(/\s+$/, '');
  const isHeading = /^Heading[12]$/.test(p.style);

  if (isHeading) {
    const m = HEADING.exec(text.trim());
    current = m
      ? { who: m[1].toLowerCase(), num: parseInt(m[2], 10), label: (m[3] || '').trim(), stanzas: [[]] }
      : null;
    if (current) settings.push(current);
    blanks = 0;
    continue;
  }
  if (!current) continue;

  if (!text.trim()) {
    // An empty paragraph ends the stanza, however many of them there are.
    if (current.stanzas[current.stanzas.length - 1].length) current.stanzas.push([]);
    blanks++;
    continue;
  }
  if (blanks > 1) {
    blankRuns.push({ who: current.who, num: current.num, blanks, before: text.slice(0, 44) });
  }
  blanks = 0;

  const line = stripContinuation(text);
  if (line !== text) continuations.push({ who: current.who, num: current.num, text });
  current.stanzas[current.stanzas.length - 1].push(line);
  if (p.after >= ENDS_STANZA) current.stanzas.push([]);
}

for (const s of settings) s.stanzas = s.stanzas.filter(st => st.length);

/* ------------------------------------------------------------- checks */
let bad = 0;
const fail = (msg) => { console.error('FAIL  ' + msg); bad++; };

const zech = settings.filter(s => s.who === 'zechariah').sort((a, b) => a.num - b.num);
const mary = settings.filter(s => s.who === 'mary').sort((a, b) => a.num - b.num);

if (zech.length !== 9) fail(`expected 9 settings of Zechariah, found ${zech.length}`);
if (mary.length !== 9) fail(`expected 9 settings of Mary, found ${mary.length}`);
for (const [name, list] of [['Zechariah', zech], ['Mary', mary]]) {
  list.forEach((s, i) => {
    if (s.num !== i + 1) fail(`${name} settings are not numbered 1-9 (saw ${s.num} at position ${i + 1})`);
    const lines = s.stanzas.flat().length;
    if (lines < 10) fail(`${name} ${s.num} has only ${lines} lines`);
  });
}

// Nothing may be lost between the document and the output.
const bodyLines = paragraphs.filter(p => !/^Heading[12]$/.test(p.style) && p.text.trim()).length;
const kept = settings.reduce((n, s) => n + s.stanzas.flat().length, 0);
// The title block above Part I is the only body text outside a setting.
if (kept > bodyLines) fail(`kept ${kept} lines but the document has only ${bodyLines}`);

if (bad) process.exit(1);

/* ------------------------------------------------------------- output */
const shape = (list) => list.map(s => ({
  num: s.num,
  label: s.label,
  stanzas: s.stanzas,
}));

const out = { zechariah: shape(zech), mary: shape(mary), source: path.basename(SRC) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

const describe = (name, list) => {
  console.log(`\n${name}`);
  for (const s of list) {
    const sizes = s.stanzas.map(st => st.length).join('/');
    console.log(`  ${String(s.num).padStart(2)}  ${(s.label || '—').padEnd(24)} ` +
      `${String(s.stanzas.flat().length).padStart(3)} lines in ${String(s.stanzas.length).padStart(2)} stanzas  (${sizes})`);
  }
};
describe('Song of Zechariah', out.zechariah);
describe('Song of Mary', out.mary);

if (continuations.length) {
  console.log('\npage-continuation marks dropped:');
  for (const c of continuations) console.log(`  ${c.who} ${c.num}: ${JSON.stringify(c.text)}`);
}

if (blankRuns.length) {
  console.log('\nruns of more than one empty paragraph, read as a single break:');
  for (const r of blankRuns) {
    console.log(`  ${r.who} ${r.num}: ${r.blanks} empty paragraphs before ${JSON.stringify(r.before)}`);
  }
}
console.log(`\n${bodyLines} body lines in the document, ${kept} kept -> ${path.relative(process.cwd(), OUT)}`);
