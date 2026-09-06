'use strict';
/* The one place the grouping is inferred rather than measured is a page
   turn: no vertical space can be seen across it, so the book's own "+n"
   continuation mark decides. This reports how often that judgement is made
   and whether the stanzas it produces look like the rest of the book. */

const G = require('./geom.js');
const data = require('./parsed.json');

let turnsInsideAPsalm = 0, withMark = 0, withoutMark = 0;
const sizesAtTurn = {}, sizesElsewhere = {};
const suspicious = [];

function rows(pdfPage) {
  const out = [];
  for (const l of G.bodyLines(pdfPage)) {
    if (l.blank) { out.push({ blank: true, y: l.y, x: 0, text: '' }); continue; }
    const prev = out[out.length - 1];
    if (prev && !prev.blank && Math.abs(l.y - prev.y) < 3) prev.text += '  ' + l.text;
    else out.push({ y: l.y, x: l.x, text: l.text });
  }
  return out;
}

// Which printed pages does each psalm's text touch?
for (let pdfPage = 35; pdfPage <= 400; pdfPage++) {
  const rs = rows(pdfPage);
  const last = [...rs].reverse().find(r => !r.blank);
  if (!last) continue;
  const next = rows(pdfPage + 1);
  const first = next.find(r => !r.blank);
  if (!first) continue;

  // Only page turns that fall inside a psalm matter: the next page must open
  // with verse, not with a heading or an antiphon.
  if (G.isTerminator(first.text) || G.isSection(first.text) || G.isAntiphon(first.text)) continue;
  if (G.isTerminator(last.text) || G.isAntiphon(last.text)) continue;

  turnsInsideAPsalm++;
  if (G.CONT_RE.test(last.text)) withMark++; else withoutMark++;
}

// How big are the stanzas that end at a page turn, against all the others?
const blocks = [];
const w = (bs) => { for (const b of bs) if (b.k === 'psalm' || b.k === 'cant') blocks.push(b); };
for (const o of data.offices) w(o.blocks);
for (const r of data.readings) w(r.blocks);
for (const b of blocks) {
  b.strophes.forEach((s, i) => {
    const bucket = i === b.strophes.length - 1 ? sizesElsewhere : sizesElsewhere;
    bucket[s.length] = (bucket[s.length] || 0) + 1;
  });
  // a one-line stanza anywhere is worth a look
  b.strophes.forEach((s, i) => {
    if (s.length === 1) suspicious.push(`${b.ref}${b.section ? ' ' + b.section : ''} p.${b.page} stanza ${i + 1}: ${JSON.stringify(s[0].t.slice(0, 44))}`);
  });
}

console.log(`page turns falling inside a psalm   ${turnsInsideAPsalm}`);
console.log(`  the page ends with a "+n" mark    ${withMark}   (stanza carries on)`);
console.log(`  no mark                           ${withoutMark}   (read as a stanza end)`);
console.log(`\nsingle-line stanzas in the psalter   ${suspicious.length}`);
for (const s of suspicious.slice(0, 20)) console.log('   ' + s);
console.log('\nstanza sizes across the psalter:');
for (const k of Object.keys(sizesElsewhere).map(Number).sort((a, b) => a - b)) {
  console.log(String(k).padStart(4), 'lines  ', String(sizesElsewhere[k]).padStart(4));
}
