'use strict';
/* Split tools/parsed.json into the per-feature JSON files the app imports,
   and build the search index. */
const fs = require('fs');
const path = require('path');

const d = require('./parsed.json');
const ROOT = path.join(__dirname, '..', 'psalms-app', 'src', 'data');
const write = (rel, obj) => {
  const f = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(obj));
  return `${rel}  ${(fs.statSync(f).size / 1024).toFixed(0)} kB`;
};

const log = [];

// ------------------------------------------------------------------ weeks
const HOUR_ORDER = ['evening-before', 'morning', 'midday', 'evening'];
const DAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
for (let w = 1; w <= 4; w++) {
  const offices = d.offices
    .filter(o => o.week === w)
    .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) ||
      HOUR_ORDER.indexOf(a.hour) - HOUR_ORDER.indexOf(b.hour));
  log.push(write(`weeks/week${w}.json`, { week: w, offices }));
}

// --------------------------------------------------------------- readings
log.push(write('readings.json', {
  weekly: d.readings.filter(r => !r.seasonal),
  seasonal: d.readings.filter(r => r.seasonal),
}));

// --------------------------------------------------------------- compline
// Slice the Compline blocks into the parts the reader needs to address
// individually: opening, hymns, the seven daily psalm sets, readings,
// responsory, Simeon, collects and blessing.
const cb = d.compline;
const idxOf = pred => cb.findIndex(pred);
const headIs = (b, re) => b.k === 'head' && re.test(b.text);

const complineDays = [];
{
  let cursor = null;
  const DAY_HEAD = /^(SATURDAY AND BEFORE SOLEMN FEASTS|SUNDAY AND ON SOLEMN FEASTS|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)$/;
  const KEYS = {
    'SATURDAY AND BEFORE SOLEMN FEASTS': 'sat',
    'SUNDAY AND ON SOLEMN FEASTS': 'sun',
    MONDAY: 'mon', TUESDAY: 'tue', WEDNESDAY: 'wed', THURSDAY: 'thu', FRIDAY: 'fri',
  };
  for (const b of cb) {
    if (headIs(b, DAY_HEAD)) { cursor = { key: KEYS[b.text], title: b.text, blocks: [] }; complineDays.push(cursor); continue; }
    if (b.k === 'reading' || headIs(b, /^(PRAYER|BLESSING|SUPPLEMENTARY PRAYERS)$/)) cursor = null;
    if (cursor) cursor.blocks.push(b);
  }
}

const complineReadings = [];
{
  let cursor = null;
  for (const b of cb) {
    if (b.k === 'reading') {
      cursor = { key: b.day.toLowerCase().slice(0, 3), day: b.day, ref: b.ref, blocks: [] };
      complineReadings.push(cursor);
      continue;
    }
    if (b.k === 'vr' || headIs(b, /PRAYER|BLESSING/)) cursor = null;
    if (cursor) cursor.blocks.push(b);
  }
}

const complineCollects = [];
{
  let cursor = null;
  const prayerStart = idxOf(b => headIs(b, /^PRAYER$/));
  const prayerEnd = idxOf(b => headIs(b, /^BLESSING$/));
  for (const b of cb.slice(prayerStart + 1, prayerEnd < 0 ? undefined : prayerEnd)) {
    if (b.k === 'label') { cursor = { key: b.text, blocks: [] }; complineCollects.push(cursor); continue; }
    if (cursor) cursor.blocks.push(b);
  }
}

const sliceBetween = (fromRe, toRe) => {
  const a = idxOf(b => headIs(b, fromRe));
  const bIdx = idxOf(b => headIs(b, toRe));
  return cb.slice(a < 0 ? 0 : a + 1, bIdx < 0 ? undefined : bIdx);
};

// The Simeon canticle is introduced by a line of prose, not by a scripture
// reference, so find it by its words rather than by block type.
const blockText = (b) => {
  if (b.k === 'text') return b.paras.flat().map(l => l.t).join(' ');
  if (b.k === 'vr') return b.items.map(i => i.text).join(' ');
  if (b.k === 'head' || b.k === 'label' || b.k === 'rubric' || b.k === 'ref') return b.text;
  if (b.k === 'psalm' || b.k === 'cant') return `${b.ref} ${b.title}`;
  return '';
};
/* Some pieces are titled with an ordinary line of type rather than a caps
   heading — "Salve Regina", "O Lumen" — so the reader gets no way to jump to
   them. Promote those lines to headings where they begin a paragraph. */
const SUPP_TITLES = [
  'Salve Regina', 'O Lumen', 'Prayer for the Faithful Departed',
  'Inviolata', 'Regina Caeli', 'Magne Pater', 'Prayer for Forgiveness',
];
function promoteTitles(blocks, titles = SUPP_TITLES) {
  const re = new RegExp('^(' + titles.join('|') + ')\\b(.*)$', 'i');
  const out = [];
  for (const b of blocks) {
    if (b.k !== 'text') { out.push(b); continue; }
    let run = [];
    const flush = () => { if (run.length) out.push({ k: 'text', paras: run, page: b.page }); run = []; };
    for (const para of b.paras) {
      const m = para.length && re.exec(para[0].t.trim());
      if (m) {
        flush();
        out.push({ k: 'head', text: (m[1] + (m[2] || '')).trim(), level: 1, page: b.page });
        if (para.length > 1) run.push(para.slice(1));
      } else run.push(para);
    }
    flush();
  }
  return out;
}

/** Give the Nunc Dimittis the same shape as every other canticle:
    a heading, its antiphon, then the verses. */
function simeonBlocks(blocks) {
  const first = blocks[0];
  if (!first || first.k !== 'text' || first.paras.length < 3) return blocks;
  const [titlePara, antPara, ...verses] = first.paras;
  const flatten = (p) => p.map(l => l.t).join(' ');
  return [
    { k: 'head', text: flatten(titlePara).replace(/\s{2,}/g, ' — '), level: 1 },
    { k: 'ant', items: [{ label: 'Antiphon', text: flatten(antPara) }] },
    { k: 'cant', ref: 'Luke 2:29–32', title: 'Nunc Dimittis', strophes: verses },
    ...blocks.slice(1),
  ];
}

const simeonAt = cb.findIndex(b => /Canticle of Simeon/i.test(blockText(b)));
const responsoryAt = cb.findIndex(b => /Response after reading/i.test(blockText(b)));
const prayerAt = idxOf(b => headIs(b, /^PRAYER$/));

log.push(write('compline.json', {
  opening: promoteTitles(sliceBetween(/^OPENING PRAYERS$/, /^PSALMS$/)),
  days: complineDays,
  readings: complineReadings,
  responsory: responsoryAt < 0 ? [] : cb.slice(responsoryAt, simeonAt < 0 ? responsoryAt + 1 : simeonAt),
  simeon: simeonAt < 0 ? [] : simeonBlocks(cb.slice(simeonAt, prayerAt < 0 ? undefined : prayerAt)),
  collects: complineCollects,
  blessing: sliceBetween(/^BLESSING$/, /^SUPPLEMENTARY PRAYERS$/),
  supplementary: (() => {
    const a = idxOf(b => headIs(b, /^SUPPLEMENTARY PRAYERS$/));
    return a < 0 ? [] : promoteTitles(cb.slice(a));
  })(),
  all: cb,
}));

// -------------------------------------------------------------- dominican
// Group the Compline supplements under their own headings.
function groupByHead(blocks, level = 2) {
  const groups = []; let cur = { title: '', blocks: [] };
  for (const b of blocks) {
    if (b.k === 'head' && b.level <= level) {
      if (cur.blocks.length || cur.title) groups.push(cur);
      cur = { title: b.text, blocks: [], page: b.page };
    } else cur.blocks.push(b);
  }
  if (cur.blocks.length || cur.title) groups.push(cur);
  return groups.filter(g => g.title || g.blocks.length);
}
log.push(write('dominican.json', {
  groups: groupByHead(promoteTitles(d.supplements)),
  litany: d.litany,
}));

// ----------------------------------------------------------------- feasts
// The book's divider page for the next part falls inside this page range;
// it belongs to the Office of Readings, not to the Proper Feasts.
const dropDivider = groups => groups.filter(g => !/^OFFICE OF READINGS/i.test(g.title));

log.push(write('feasts.json', {
  common: groupByHead(d.feastsCommon),
  proper: dropDivider(groupByHead(d.feastsProper)),
  table: d.indexFeasts,
}));

// -------------------------------------------------------------- canticles
function bySetting(blocks) {
  const out = []; let cur = null;
  for (const b of blocks) {
    if (b.k === 'setting') {
      cur = { num: b.num, label: b.note || `Setting ${b.num ?? ''}`.trim(), blocks: [], page: b.page };
      out.push(cur); continue;
    }
    if (b.k === 'plate' && b.caption) {
      const m = /(\d+)/.exec(b.caption);
      cur = { num: m ? Number(m[1]) : null, label: 'music score', blocks: [b], page: b.printed };
      out.push(cur); continue;
    }
    if (cur) cur.blocks.push(b); else if (b.k !== 'head') { /* preamble */ }
  }
  return out.sort((a, z) => (a.num ?? 99) - (z.num ?? 99));
}
/* The nine settings of each gospel canticle come from the standardised
   document rather than from the book, which prints several of them only as
   engraved music. Where the book does have the music, the score is kept
   alongside the text. */
const PLATE_FOR = {                     // setting number -> PDF page of the score
  zechariah: { 3: 19, 6: 22, 7: 23, 8: 24 },
  mary: {},
};

function fromDocument(which) {
  const file = path.join(__dirname, 'canticles-src.json');
  if (!fs.existsSync(file)) return bySetting(d[which]);   // fall back to the book
  const src = JSON.parse(fs.readFileSync(file, 'utf8'))[which];

  return src.map(s => {
    const blocks = [{
      k: 'text',
      paras: s.stanzas.map(st => st.map(t => ({ t, i: 0 }))),
    }];
    const plate = PLATE_FOR[which][s.num];
    if (plate) {
      blocks.push({ k: 'plate', page: plate, caption: `As engraved in the book — setting ${s.num}` });
    }
    return { num: s.num, label: s.label, blocks };
  });
}

log.push(write('canticles.json', {
  zechariah: fromDocument('zechariah'),
  mary: fromDocument('mary'),
  invitatory: d.invitatory,
  teDeum: d.teDeum,
  midday: { antiphons: d.middayAntiphons, hymns: d.middayHymns },
  lent: d.lentCanticle,
}));

// ---------------------------------------------------------------- prayers
// The 34 weekly collects arrive as one long run of paragraphs.
const weekly = [];
{
  const paras = d.weeklyPrayers.filter(b => b.k === 'text').flatMap(b => b.paras);
  let cur = null;
  for (const p of paras) {
    for (const line of p) {
      const m = /^(\d{1,2})\.\s*(.*)$/.exec(line.t);
      if (m && Number(m[1]) === weekly.length + 1) {
        cur = { n: Number(m[1]), lines: m[2] ? [m[2]] : [] };
        weekly.push(cur);
      } else if (cur) cur.lines.push(line.t);
    }
  }
}
log.push(write('prayers.json', { weekly, goodFriday: d.goodFriday }));

// ---------------------------------------------------------------- indices
log.push(write('indices.json', {
  psalms: d.indexPsalms.psalms.filter(e => e.num && e.num >= 1 && e.num <= 150),
  canticles: d.indexPsalms.canticles.filter(e => !/^Page/.test(e.label)),
  feasts: d.indexFeasts,
}));

// ------------------------------------------------------------------ front
log.push(write('front.json', { blocks: d.front, meta: d.meta }));

// ----------------------------------------------------------------- plates
const plates = JSON.parse(fs.readFileSync(path.join(__dirname, 'render', 'out', 'plates.json'), 'utf8'));
log.push(write('plates.json', plates));

// ------------------------------------------------------------ search index
const entries = [];
const push = (e) => entries.push(e);
const walk = (blocks, where) => {
  for (const b of blocks) {
    if (b.k === 'psalm') push({ t: 'psalm', ref: b.ref, num: b.num, title: b.title, ...where });
    if (b.k === 'cant') push({ t: 'canticle', ref: b.ref, title: b.title, ...where });
  }
};
for (const o of d.offices) walk(o.blocks, { route: `#/office/${o.id}`, where: o.title });
for (const r of d.readings) walk(r.blocks, { route: `#/readings/${r.id}`, where: `Office of Readings — ${r.title}` });
walk(d.compline, { route: '#/compline', where: 'Compline' });
walk(d.feastsCommon, { route: '#/feasts/common', where: 'Common Feasts' });
walk(d.feastsProper, { route: '#/feasts/proper', where: 'Proper Feasts' });
walk(d.invitatory, { route: '#/invitatory', where: 'Invitatory' });
for (const g of groupByHead(d.supplements))
  push({ t: 'section', ref: g.title, title: '', route: '#/dominican', where: 'Compline Supplements' });
log.push(write('search.json', entries));

console.log(log.join('\n'));
console.log('\nweekly collects:', weekly.length, '| compline days:', complineDays.length,
  '| compline readings:', complineReadings.length, '| collects:', complineCollects.length,
  '| zech settings:', fromDocument('zechariah').length,
  '| mary settings:', fromDocument('mary').length,
  '| search entries:', entries.length);
