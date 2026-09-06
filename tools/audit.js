'use strict';
/* Check the parsed book against itself.

   The strongest test available is the book's own index: it lists, for every
   psalm and canticle, the printed pages it appears on. If the parser has
   dropped or misread a heading, the index entry will point at a page where
   no such psalm was found.

   Run with:  node tools/audit.js   (after tools/parse.js) */

const d = require('./parsed.json');

let bad = 0;
const check = (ok, line) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${line}`); };

/* ------------------------------------------------ collect every psalm block */
const all = [];
const walk = (blocks, where) => {
  for (const b of blocks) if (b.k === 'psalm' || b.k === 'cant') all.push({ ...b, where });
};
for (const o of d.offices) walk(o.blocks, o.id);
for (const r of d.readings) walk(r.blocks, r.id);
for (const key of ['compline', 'feastsCommon', 'feastsProper', 'invitatory',
  'supplements', 'lentCanticle', 'zechariah', 'mary']) walk(d[key], key);

/* ------------------------------------------------------------ completeness */
check(d.offices.length === 84, `84 offices parsed (got ${d.offices.length})`);
check(d.readings.length === 32, `32 Office of Readings sections parsed (got ${d.readings.length})`);

const psalmody = o => o.blocks.filter(b => b.k === 'psalm' || b.k === 'cant');
const thinOffices = d.offices.filter(o => psalmody(o).length < 3);
check(thinOffices.length === 0,
  `every office has three or more psalms/canticles` +
  (thinOffices.length ? ` — thin: ${thinOffices.map(o => o.id).join(', ')}` : ''));

const thinReadings = d.readings.filter(r => psalmody(r).length < 3);
check(thinReadings.length === 0,
  `every Office of Readings has three psalms` +
  (thinReadings.length ? ` — thin: ${thinReadings.map(r => r.id).join(', ')}` : ''));

const empties = all.filter(b => !b.strophes.flat().length);
check(empties.length === 0,
  `no psalm or canticle is empty` +
  (empties.length ? ` — ${empties.map(b => `${b.where}/${b.ref}`).join(', ')}` : ''));

/* ------------------------------------------- nothing left stranded in prose */
const REF_START = /^(Psalm\s+\d|Rev\.?\s*\d|Phil\.?\s*\d|Col\.?\s*\d|Eph\.?\s*\d|Dan\.?\s*\d|Is\.?\s*\d|Tob\.?\s*\d|Sir\.?\s*\d|Jud\.?\s*\d|Wis\.?\s*\d|Ex\.?\s*\d|Deut\.?\s*\d|Hab\.?\s*\d|Jer\.?\s*\d|Ez\.?\s*\d|1 Sam)/;
const stray = [];
const scan = (blocks, where) => {
  for (const b of blocks) if (b.k === 'text')
    for (const para of b.paras) for (const line of para)
      if (REF_START.test(line.t)) stray.push(`${where}: ${line.t.slice(0, 50)}`);
};
for (const o of d.offices) scan(o.blocks, o.id);
for (const r of d.readings) scan(r.blocks, r.id);
for (const key of ['compline', 'feastsCommon', 'feastsProper']) scan(d[key], key);
check(stray.length === 0,
  `no scripture heading was left inside prose` + (stray.length ? ` — ${stray.slice(0, 5).join(' | ')}` : ''));

/* ------------------------------------------- the book's index as the oracle */
const pagesByNumber = new Map();
for (const b of all) {
  const n = b.num ?? 0;
  if (!pagesByNumber.has(n)) pagesByNumber.set(n, new Set());
  pagesByNumber.get(n).add(b.page);
}
const indexed = d.indexPsalms.psalms.filter(e => e.num >= 1 && e.num <= 150);
const totalRefs = indexed.reduce((n, e) => n + e.pages.length, 0);

// Two index entries point at pages that print a cross-reference rather than
// the psalm itself; those are the book's own doing, not a parse failure.
const KNOWN_POINTERS = new Set(['113@298', '130@413']);
const unmatched = [];
for (const e of indexed) {
  const have = pagesByNumber.get(e.num);
  if (!have) { unmatched.push(`Psalm ${e.num} is absent altogether`); continue; }
  for (const p of e.pages) {
    const n = parseInt(p, 10);
    if (!n || KNOWN_POINTERS.has(`${e.num}@${n}`)) continue;
    if (![...have].some(x => Math.abs(x - n) <= 2))
      unmatched.push(`Psalm ${e.num} not found near p.${n}`);
  }
}
check(unmatched.length === 0,
  `all ${totalRefs} index references resolve to a parsed psalm` +
  (unmatched.length ? ` — ${unmatched.slice(0, 8).join('; ')}` : ''));

/* ------------------------------------------------- text hygiene after OCR */
const text = JSON.stringify(d);
for (const [name, re] of [
  ['no leftover "@" quote glyphs', /@/g],
  ['no leftover straight double quotes', /\\"/g],
  ['no "iwill"/"iam" run-together pronouns', /\bi(will|am|have|was|shall)\b/g],
  ['no leftover " B " en-dashes in references', /\d\s+B\s+\d/g],
]) check(!re.test(text), name);

/* -------------------------------------------------------------- structure */
const withSections = all.filter(b => b.section);
check(withSections.length > 0, `psalms divided into sections were detected (${withSections.length} blocks)`);
check(d.compline.length > 40, `Compline parsed (${d.compline.length} blocks)`);
check(d.litany.length > 50, `Litany of Loreto recovered from its two columns (${d.litany.length} lines)`);
check(d.indexFeasts.length > 50, `feast-day psalm tables parsed (${d.indexFeasts.length} rows)`);

console.log(`\n${all.length} psalms and canticles, ${d.offices.length} offices, ` +
  `${d.readings.length} reading sections, ${d.plates.length} engraved plates`);
console.log(bad ? `\n${bad} failing` : '\nall good');
process.exit(bad ? 1 : 0);
