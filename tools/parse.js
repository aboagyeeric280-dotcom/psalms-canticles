'use strict';
/* Parse the pdftotext -layout dump of "Daily Psalms and Canticles"
   into the structured JSON the app consumes. */
const fs = require('fs');
const path = require('path');
const { loadPages, ANTIPHON_RE, PSALM_RE, CANTICLE_RE, SECTION_RE } = require('./lib.js');
const { psalmIndex, feastTable, litany } = require('./tables.js');

const pages = loadPages(path.join(__dirname, 'book.txt'));

// ---------------------------------------------------------------- helpers
const ROMAN = { I: 1, II: 2, III: 3, IV: 4 };
const DAYKEY = { SUNDAY: 'sun', MONDAY: 'mon', TUESDAY: 'tue', WEDNESDAY: 'wed', THURSDAY: 'thu', FRIDAY: 'fri', SATURDAY: 'sat' };
const HOURKEY = { 'EVENING BEFORE': 'evening-before', MORNING: 'morning', MIDDAY: 'midday', EVENING: 'evening' };

const DAY_HEAD = /^(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)\s+(IV|III|II|I)\s*[-–—]\s*(EVENING BEFORE|MORNING|MIDDAY|EVENING)$/;
const READ_HEAD = /^READINGS\s*[-–—]\s*(SEASONAL,\s*)?(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)\s+(IV|III|II|I)$/;

function isCaps(raw) {
  const t = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();   // "O LUMEN (Spanish)"
  if (t.length < 3 || t.length > 70) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  if (letters !== letters.toUpperCase()) return false;
  return /^[A-Z0-9 .,:;&'’()\-–—/!?]+$/.test(t);
}

const DAYNAMES = 'SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY';
const SHORT_READING_RE = new RegExp('^(' + DAYNAMES + ')(?:\\s+READINGS?)?\\s{2,}(\\S.*)$');
const LABEL_RE = /^((?:Solemn Feasts|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Let Us Pray|Let us pray|Prayer|Hymn \d|All)\s*:?)\s*(?:\(([^)]*)\))?\s*$/;
const SETTING_RE = /^(Song of (?:Zechariah|Mary))\s*,?\s*(\d+)?\s*,?\s*(.*)$/;

// Flatten a printed-page range into an annotated line stream.
function stream(from, to, skip) {
  const out = [];
  for (const p of pages) {
    if (p.printed < from || p.printed > to) continue;
    if (skip && skip.includes(p.pdfPage)) continue;
    if (p.isPlate) { out.push({ plate: p.pdfPage, printed: p.printed }); continue; }
    for (const raw of p.lines) {
      out.push({ raw, t: raw.trim(), ind: raw.length - raw.trimStart().length, printed: p.printed, pdfPage: p.pdfPage });
    }
  }
  return out;
}

// ------------------------------------------------------------ block builder
function buildBlocks(lines, opts = {}) {
  const blocks = [];
  let cur = null;               // psalm / canticle currently collecting strophes
  let ants = null;              // antiphon block being collected
  let para = null;              // free prose block
  let pending = null;           // antiphon whose text wraps to following lines
  let lastQuant = null;         // the last psalm/canticle pushed, for "II"
  let held = null;              // a heading whose verses come after the antiphons

  const flushPara = () => { if (para && para.lines.length) blocks.push(para); para = null; };
  const flushAnts = () => { if (ants && ants.items.length) blocks.push(ants); ants = null; pending = null; };
  const flushCur = () => {
    if (cur) {
      if (!cur.strophes.length) cur.strophes.push([]);
      trimStrophes(cur);
      blocks.push(cur);
      lastQuant = cur;
    }
    cur = null;
  };
  const flushAll = () => {
    if (!cur && held) { flushAnts(); cur = held; held = null; }
    flushAnts(); flushPara(); flushCur();
  };

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (L.plate) { flushAll(); blocks.push({ k: 'plate', page: L.plate, printed: L.printed }); continue; }
    const t = L.t;

    if (!t) {                                     // blank line
      if (cur) cur.strophes.push([]);             // strophe break
      if (para) para.lines.push(null);
      // an antiphon whose text was broken across a blank line stays open
      if (!(pending && !/[.!?”]$/.test(pending.text))) pending = null;
      continue;
    }

    // --- a new section of the psalm in hand:  a bare "II" ----------------
    // The antiphon that introduces the section is printed between the two,
    // so by the time the numeral arrives the psalm has usually been closed;
    // carry the reference forward from whichever block holds it.
    const sec = SECTION_RE.exec(t);
    if (sec) {
      // A numeral straight under the heading simply names the first section —
      // the psalter starts a day mid-psalm often enough ("Psalm 18:30-50, IV").
      const open = cur && !cur.strophes.flat().length ? cur : (!cur && held ? held : null);
      if (open) { open.section = sec[1]; if (sec[2]) open.sectionTitle = sec[2].trim(); continue; }

      const carrier = cur || lastQuant;
      if (carrier) {
        if (!carrier.section) carrier.section = 'I';
        flushPara(); flushAnts(); flushCur();
        cur = {
          k: carrier.k, ref: carrier.ref, num: carrier.num, title: carrier.title,
          section: sec[1], sectionTitle: (sec[2] || '').trim(),
          strophes: [[]], page: L.printed,
        };
        continue;
      }
    }

    // --- Compline short reading:  "MONDAY        1 Thess. 5:9-10" --------
    const sr = SHORT_READING_RE.exec(t);
    if (sr && opts.shortReadings) {
      flushAll();
      blocks.push({ k: 'reading', day: sr[1], ref: sr[2].trim(), page: L.printed });
      continue;
    }

    // --- a Zechariah / Mary setting title ---------------------------------
    const st = SETTING_RE.exec(t);
    if (st && opts.settings) {
      flushAll();
      blocks.push({
        k: 'setting', name: st[1], num: st[2] ? parseInt(st[2], 10) : null,
        note: (st[3] || '').replace(/^[,\s]+|[,\s]+$/g, ''), page: L.printed,
      });
      continue;
    }

    // --- a bare label line:  "Tuesday:"  "Hymn 2"  "All :" ----------------
    const lb = LABEL_RE.exec(t);
    if (lb && !cur) {
      flushAll();
      blocks.push({ k: 'label', text: lb[1].replace(/\s*:\s*$/, '').trim(), note: (lb[2] || '').trim(), page: L.printed });
      continue;
    }

    // --- headings -------------------------------------------------------
    if (/^(ADVENT|CHRISTMASTIDE|CHRISTMAS|LENT|HOLY WEEK|EASTERTIDE|THROUGH THE YEAR|ORDINARY TIME)\b/.test(t) && t.length < 46 && !/:/.test(t)) {
      flushAll();
      blocks.push({ k: 'head', text: titleCase(t), raw: t, level: 2, page: L.printed });
      continue;
    }
    if (isCaps(t) && !/^(V|R)[./]/.test(t) && !/^\d/.test(t)) {
      flushAll();
      blocks.push({ k: 'head', text: titleCase(t), raw: t, level: L.ind >= 8 ? 1 : 2, page: L.printed });
      continue;
    }

    // --- antiphons ------------------------------------------------------
    const am = ANTIPHON_RE.exec(t);
    if (am && !/^Psalm\b/.test(t)) {
      flushPara();
      // Some canticles print their reference above the antiphons and their
      // verses below. Hold the empty block open rather than closing it.
      if (cur && !cur.strophes.flat().length) { held = cur; cur = null; } else flushCur();
      if (!ants) ants = { k: 'ant', items: [], page: L.printed };
      pending = { label: am[1].trim(), text: am[2].trim() };
      ants.items.push(pending);
      continue;
    }
    if (pending) {                                // continuation of antiphon text
      const nxt = t;
      if (!PSALM_RE.test(nxt) && !CANTICLE_RE.test(nxt)) { pending.text += ' ' + nxt; continue; }
    }

    // --- a bare pointer at another page:  "Rev 19 p. 233" ----------------
    if (/\bpp?\.\s*\d+\.?$/.test(t) && t.length < 90 && !/[.!?][”"]?$/.test(t.replace(/\bpp?\.\s*\d+\.?$/, ''))) {
      if (cur && !cur.strophes.flat().length) { cur.alt = t; continue; }
      flushAll(); blocks.push({ k: 'ref', text: t.replace(/\s{2,}/g, ' — '), page: L.printed }); continue;
    }

    // --- psalm heading ---------------------------------------------------
    const pm = PSALM_RE.exec(t);
    if (pm) {
      flushAll();
      const ref = pm[1].trim().replace(/\s*:\s*/, ':').replace(/\s+/g, ' ');
      cur = {
        k: 'psalm', ref, num: parseInt(ref.match(/\d+/)[0], 10),
        title: (pm[2] || pm[3] || '').trim(), strophes: [[]], page: L.printed,
      };
      continue;
    }

    // --- canticle heading -------------------------------------------------
    const cm = CANTICLE_RE.exec(t);
    if (cm && t.length < 70 && /\d/.test(t)) {
      const refPart = t.replace(/\s{2,}.*$/, '').trim();
      const tail = (cm[2] || '').trim();
      flushAll();
      // "Col 1:12-20, p. 300" is a pointer; "Rev 19:1,5-8   (In Lent see
      // p. 32)" is the canticle itself with a note beside it.
      if (/\bpp?\.\s*\d/.test(refPart)) { blocks.push({ k: 'ref', text: t, page: L.printed }); continue; }
      cur = { k: 'cant', ref: refPart, title: /\bpp?\.\s*\d|^\(/.test(tail) ? '' : tail, strophes: [[]], page: L.printed };
      if (tail && !cur.title) cur.alt = tail.replace(/^\((.*)\)$/, '$1');
      continue;
    }

    // --- cross reference --------------------------------------------------
    if (/^(Psalms?|Ps\.?|see|See|As on|as on|or)\b/.test(t) && /\bp{1,2}\.\s*\d/.test(t) && t.length < 90) {
      if (cur && !cur.strophes.flat().length) { cur.alt = t; continue; }
      flushAll(); blocks.push({ k: 'ref', text: t, page: L.printed }); continue;
    }

    // --- rubric ------------------------------------------------------------
    // A rubric printed under a psalm heading ("Optional response after each
    // line: …") belongs to that psalm, and must not close it before its
    // verses have been read.
    const looksRubric = /^\(.*\)$/.test(t) || /^Optional response/.test(t) ||
      (L.ind > 12 && /^[“"]?[A-Z]/.test(t) && t.length < 70);
    if (looksRubric && cur && !cur.strophes.flat().length) {
      cur.note = cur.note ? `${cur.note} ${t}` : t;
      continue;
    }
    if (looksRubric && !cur) {
      flushAll(); blocks.push({ k: 'rubric', text: t.replace(/^\((.*)\)$/, '$1'), page: L.printed }); continue;
    }

    // --- versicle / response ------------------------------------------------
    const vm = /^([VR])[./]\s*(.*)$/.exec(t);
    if (vm) {
      flushCur(); flushAnts();
      if (!para || para.k !== 'vr') { flushPara(); para = { k: 'vr', items: [], lines: [], page: L.printed }; }
      para.items.push({ c: vm[1], text: vm[2].trim() });
      para.lines.push(vm[2]);
      continue;
    }

    // --- body line -----------------------------------------------------------
    if (!cur && held) { flushAnts(); cur = held; held = null; }   // its verses begin
    if (cur) {
      cur.strophes[cur.strophes.length - 1].push({ t, ind: L.ind });
    } else {
      if (!para || para.k !== 'text') { flushPara(); para = { k: 'text', lines: [], page: L.printed }; }
      para.lines.push({ t, ind: L.ind });
    }
  }
  flushAll();
  return normaliseBlocks(blocks);
}

function trimStrophes(b) {
  b.strophes = b.strophes.filter(s => s.length);
  const inds = [...new Set(b.strophes.flat().map(l => l.ind))].sort((a, z) => a - z);
  const rank = new Map(inds.map((v, i) => [v, Math.min(i, 2)]));
  b.strophes = b.strophes.map(s => s.map(l => ({ t: l.t, i: rank.get(l.ind) || 0 })));
}

function normaliseBlocks(blocks) {
  return blocks.map(b => {
    if (b.k === 'text') {
      const inds = [...new Set(b.lines.filter(Boolean).map(l => l.ind))].sort((a, z) => a - z);
      const rank = new Map(inds.map((v, i) => [v, Math.min(i, 2)]));
      const paras = []; let p = [];
      for (const l of b.lines) {
        if (l === null) { if (p.length) paras.push(p); p = []; }
        else p.push({ t: l.t, i: rank.get(l.ind) || 0 });
      }
      if (p.length) paras.push(p);
      return { k: 'text', paras, page: b.page };
    }
    if (b.k === 'vr') return { k: 'vr', items: b.items, page: b.page };
    return b;
  }).filter(b => !(b.k === 'text' && !b.paras.length));
}

function titleCase(s) {
  return s.replace(/\s{2,}/g, ' ').trim();
}

// ------------------------------------------------------------ section split
function splitOn(lines, headRe) {
  const secs = []; let cur = null;
  for (const L of lines) {
    const t = L.t || '';
    const m = !L.plate && headRe.exec(t);
    if (m) { cur = { m, head: t, page: L.printed, lines: [] }; secs.push(cur); continue; }
    if (cur) cur.lines.push(L);
  }
  return secs;
}

// ================================================================= OFFICES
const psalterLines = stream(34, 285);
const officeSecs = splitOn(psalterLines, DAY_HEAD);
const offices = officeSecs.map(s => {
  const [, day, wk, hour] = s.m;
  return {
    id: `w${ROMAN[wk]}-${DAYKEY[day]}-${HOURKEY[hour]}`,
    week: ROMAN[wk], day: DAYKEY[day], dayName: cap(day), hour: HOURKEY[hour],
    title: `${cap(day)} ${wk} — ${cap(hour)}`, page: s.page,
    blocks: buildBlocks(s.lines),
  };
});

// ================================================================ READINGS
const readingLines = stream(307, 397);
const readSecs = splitOn(readingLines, READ_HEAD);
const readings = readSecs.map(s => {
  const [, seasonal, day, wk] = s.m;
  return {
    id: `${seasonal ? 'seasonal-' : ''}read-w${ROMAN[wk]}-${DAYKEY[day]}`,
    week: ROMAN[wk], day: DAYKEY[day], dayName: cap(day), seasonal: !!seasonal,
    title: `${seasonal ? 'Seasonal — ' : ''}${cap(day)} ${wk}`, page: s.page,
    blocks: buildBlocks(s.lines),
  };
});
// merge duplicate ids (a section continued over several page headings)
const readingsMerged = [];
for (const r of readings) {
  const prev = readingsMerged[readingsMerged.length - 1];
  if (prev && prev.id === r.id) prev.blocks.push(...r.blocks); else readingsMerged.push(r);
}
const officesMerged = [];
for (const o of offices) {
  const prev = officesMerged[officesMerged.length - 1];
  if (prev && prev.id === o.id) prev.blocks.push(...o.blocks); else officesMerged.push(o);
}

// ================================================================== SIMPLE
const simple = (from, to, opts = {}) => buildBlocks(stream(from, to, opts.skip), opts);

// The Zechariah settings 3, 6, 7 and 8 are printed only as engraved music.
function labelPlates(blocks, name, missing) {
  const queue = missing.slice();
  return blocks.map(b => (b.k === 'plate' && queue.length)
    ? { ...b, k: 'plate', caption: `${name} ${queue.shift()} — music score` }
    : b);
}

// A title printed on two lines ("EVENING PRAYER FOR" / "COMMON FEASTS")
function joinSplitHeads(blocks) {
  const out = [];
  for (const b of blocks) {
    const p = out[out.length - 1];
    if (b.k === 'head' && p && p.k === 'head' && p.level === b.level &&
      /(FOR|AND|OF|THE|TO)$/.test(p.text) && p.text.length < 30) {
      p.text += ' ' + b.text;
    } else out.push(b);
  }
  return out;
}

const out = {
  meta: {
    title: 'Daily Psalms and Canticles',
    publisher: 'Dominican Publications, Box 44, Yaba, Lagos',
    province: 'Province of St Joseph the Worker — Nigeria & Ghana',
    credits: 'Psalms and New Testament texts from Today’s English Version (Good News), by permission of the American Bible Society. Old Testament canticles translated by Fr Joseph Kenny, O.P.',
    generated: new Date().toISOString().slice(0, 10),
    pages: pages.length,
  },
  front: simple(4, 8),
  invitatory: simple(9, 11),
  teDeum: simple(12, 13),
  middayAntiphons: simple(14, 14),
  middayHymns: simple(15, 15),
  zechariah: labelPlates(simple(16, 24, { settings: true }), "Song of Zechariah", [3, 6, 7, 8]),
  mary: simple(25, 31, { settings: true }),
  lentCanticle: simple(32, 33),
  offices: officesMerged,
  feastsCommon: joinSplitHeads(simple(286, 297)),
  feastsProper: joinSplitHeads(simple(298, 306)),
  readings: readingsMerged,
  compline: joinSplitHeads(simple(397, 413, { shortReadings: true })),
  supplements: simple(414, 427, { skip: [419] }),
  weeklyPrayers: simple(428, 431),
  goodFriday: simple(432, 433),
  indexPsalms: psalmIndex(pages.filter(p => p.printed >= 434 && p.printed <= 436)),
  indexFeasts: feastTable(pages.filter(p => p.printed >= 437 && p.printed <= 439)),
  litany: litany(pages.find(p => p.pdfPage === 419)),
  plates: pages.filter(p => p.isPlate && p.pdfPage > 1 && p.pdfPage < 441)
    .map(p => ({ page: p.pdfPage, printed: p.printed })),
};

function cap(s) { return s[0] + s.slice(1).toLowerCase(); }

fs.writeFileSync(path.join(__dirname, 'parsed.json'), JSON.stringify(out, null, 1));

// ------------------------------------------------------------------ report
const count = (bs, k) => bs.filter(b => b.k === k).length;
console.log('offices:', out.offices.length, ' readings:', out.readingsMerged || out.readings.length);
console.log('missing offices:');
for (let w = 1; w <= 4; w++) for (const d of ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])
  for (const h of ['morning', 'midday', 'evening']) {
    if (d === 'sat' && h === 'evening') continue;
    if (!out.offices.find(o => o.id === `w${w}-${d}-${h}`)) console.log('   ', `w${w}-${d}-${h}`);
  }
const sample = out.offices[0];
console.log('\nsample', sample.id, sample.blocks.map(b => b.k + (b.k === 'psalm' || b.k === 'cant' ? ':' + b.ref : '')).join(' '));
console.log('\ntotals  psalms:', out.offices.reduce((a, o) => a + count(o.blocks, 'psalm'), 0),
  ' cants:', out.offices.reduce((a, o) => a + count(o.blocks, 'cant'), 0),
  ' antblocks:', out.offices.reduce((a, o) => a + count(o.blocks, 'ant'), 0));
console.log('bytes:', fs.statSync(path.join(__dirname, 'parsed.json')).size);
