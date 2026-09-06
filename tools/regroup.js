'use strict';
/* Re-cut the stanza boundaries of every psalm and canticle from the PDF's
   real line geometry.

   Only the grouping changes: line objects are moved between arrays, never
   edited, and a psalm whose geometry does not account for exactly the lines
   the app holds is left alone and reported.

   Usage:  node tools/regroup.js [--write]                                  */

const fs = require('fs');
const path = require('path');
const G = require('./geom.js');

const WRITE = process.argv.includes('--write');
const PARSED = path.join(__dirname, 'parsed.json');
const data = JSON.parse(fs.readFileSync(PARSED, 'utf8'));

/* ------------------------------------------------------- locate a psalm */

// Lines printed on the same baseline (a heading and its title) are one line.
// A blank marker stands alone: it is where the book leaves vertical space.
function rows(pdfPage) {
  const out = [];
  for (const l of G.bodyLines(pdfPage)) {
    if (l.blank) { out.push({ blank: true, y: l.y, x: 0, text: '', pdfPage }); continue; }
    const prev = out[out.length - 1];
    if (prev && !prev.blank && Math.abs(l.y - prev.y) < 3) {
      prev.parts.push(l); prev.text += '  ' + l.text;
    } else out.push({ y: l.y, x: l.x, h: l.h, text: l.text, parts: [l], pdfPage });
  }
  return out;
}

const pageCache = new Map();
const pageRows = n => {
  if (!pageCache.has(n)) pageCache.set(n, rows(n));
  return pageCache.get(n);
};

/** A flat cursor over the book, so a psalm can run past a page turn. */
function* fromRow(pdfPage, index) {
  for (let p = pdfPage; p <= G.pages.length; p++) {
    const rs = pageRows(p);
    for (let i = (p === pdfPage ? index : 0); i < rs.length; i++) {
      yield { row: rs[i], pdfPage: p, first: i === 0 };
    }
  }
}

/** Find the heading row of a block, then the start of the section wanted.
    A later section of a long psalm sits pages after its heading, so the
    search window reaches back as well as forward. */
function findStart(block) {
  const wantRef = G.key(block.ref);
  const deltas = [1, 2, 0, 3];
  if (block.section && block.section !== 'I') {
    for (let back = 1; back <= 9; back++) deltas.push(1 - back);
  }
  for (const delta of deltas) {
    const pdfPage = block.page + delta;
    if (pdfPage < 1 || pdfPage > G.pages.length) continue;
    const rs = pageRows(pdfPage);
    for (let i = 0; i < rs.length; i++) {
      if (rs[i].blank || !G.key(rs[i].text).startsWith(wantRef)) continue;
      if (!block.section || block.section === 'I') {
        let j = i + 1;
        if (rs[j] && G.isSection(rs[j].text)) j++;   // an explicit "I"
        return { pdfPage, index: j };
      }
      // walk forward to the numeral this block carries, but stop if another
      // psalm heading intervenes — the numeral would belong to that one.
      for (const { row, pdfPage: p } of fromRow(pdfPage, i + 1)) {
        if (row.blank) continue;
        const t = row.text.trim();
        if (G.sectionNumeral(t) === block.section) {
          return { pdfPage: p, index: pageRows(p).indexOf(row) + 1 };
        }
        if ((G.PSALM_HEAD.test(t) || G.BOOK_HEAD.test(t)) && !G.key(t).startsWith(wantRef)) break;
      }
    }
  }
  return null;
}

/* MuPDF marks where the book leaves vertical space, but it also emits the
   occasional marker where there is no space at all — between two lines of a
   prayer that merely got reordered. Measuring across the marker settles it:
   a real break spans 18pt or more, ordinary leading never exceeds 15. */
const MIN_BREAK = 16;

/** Collect a psalm's body rows, marking where a stanza ends. */
function collectBody(start) {
  const body = [];
  let sawBlank = false;
  let lastPdfPage = start.pdfPage;
  let lastRowOfPage = null;

  // While looking for the first verse, an antiphon or a rubric is passed
  // over together with the lines it wraps onto — a run that ends at the next
  // blank. Some canticles print their reference above the antiphons and the
  // verses below them, so this may happen before the body starts.
  let skipToBlank = false;

  for (const { row, pdfPage, first } of fromRow(start.pdfPage, start.index)) {
    if (row.blank) {
      if (body.length) sawBlank = true;
      skipToBlank = false;
      continue;
    }

    const text = row.text.trim();
    if (!text) continue;

    if (body.length === 0) {
      if (skipToBlank) continue;
      if (G.isSection(text)) continue;                  // this block's own numeral
      if (G.isAntiphon(text) || row.x > 100) { skipToBlank = true; continue; }
    } else if (G.isSection(text)) {
      break;                                            // the next section of this psalm
    }
    if (G.isTerminator(text)) break;

    let breakBefore = false;
    if (pdfPage !== lastPdfPage) {
      // A page turn leaves no space to measure. The book prints "+n" at the
      // foot of the page when a stanza runs on; without it the page ended on
      // a stanza boundary.
      breakBefore = !(lastRowOfPage && G.CONT_RE.test(lastRowOfPage.text));
      lastPdfPage = pdfPage;
    } else if (sawBlank && lastRowOfPage) {
      breakBefore = (row.y - lastRowOfPage.y) >= MIN_BREAK;
    }
    sawBlank = false;

    body.push({ row, breakBefore, pageFirst: first });
    lastRowOfPage = row;
  }
  return body;
}

/** The stanza sizes, read straight off the break markers. */
function cut(body) {
  const groups = [];
  let n = 0;
  body.forEach((b, i) => {
    if (i > 0 && b.breakBefore) { groups.push(n); n = 0; }
    n++;
  });
  groups.push(n);
  return groups;
}

/* ------------------------------------------------------------ the pass */

const report = { changed: [], skipped: [], textChanged: [], unchanged: 0 };
let stanzasBefore = 0, stanzasAfter = 0, linesBefore = 0, linesAfter = 0;
let parasBefore = 0, parasAfter = 0, textLinesBefore = 0, textLinesAfter = 0;

function handle(block, where) {
  const lines = block.strophes.flat();
  const before = block.strophes.length;
  stanzasBefore += before;
  linesBefore += lines.length;

  const fail = (why) => {
    report.skipped.push({ where, ref: block.ref + (block.section ? ' ' + block.section : ''), page: block.page, why });
    stanzasAfter += before;
    linesAfter += lines.length;
  };

  const start = findStart(block);
  if (!start) return fail('heading not found in the PDF');

  const body = collectBody(start);
  if (body.length !== lines.length) {
    // Say where the two readings part company, so the psalm can be checked.
    let at = 0;
    while (at < body.length && at < lines.length &&
      G.key(body[at].row.text.replace(G.CONT_RE, '')) === G.key(lines[at].t)) at++;
    const pdfLine = body[at] ? G.plain(body[at].row.text).slice(0, 46) : '(end)';
    const appLine = lines[at] ? lines[at].t.slice(0, 46) : '(end)';
    return fail(`PDF has ${body.length} lines, the app has ${lines.length}; they agree for ${at} ` +
      `then PDF="${pdfLine}" vs app="${appLine}"`);
  }

  // Guard: the first and last line must be the same text, ignoring the
  // accents the PDF carries and pdftotext dropped.
  const same = (a, b) => G.key(a) === G.key(b);
  if (!same(body[0].row.text, lines[0].t) ||
    !same(body[body.length - 1].row.text.replace(G.CONT_RE, ''), lines[lines.length - 1].t)) {
    return fail('text at the edges does not match');
  }

  const groups = cut(body);

  // Re-cut: move the existing line objects, untouched, into new arrays.
  const next = [];
  let k = 0;
  for (const size of groups) { next.push(lines.slice(k, k + size)); k += size; }

  const moved = next.length !== before;
  const check = next.flat();
  if (check.length !== lines.length || check.some((l, i) => l !== lines[i])) {
    return fail('internal: regrouping did not preserve the lines');
  }

  block.strophes = next;
  stanzasAfter += next.length;
  linesAfter += lines.length;
  if (moved) report.changed.push({ where, ref: block.ref, page: block.page, before, after: next.length });
  else report.unchanged++;
}

/* Hymns are not psalms — they are held as prose blocks — but the book breaks
   them into stanzas just the same, and the extractor mis-cut those too. They
   carry no heading to search for, so they are found by their opening line and
   then checked line by line: prose whose wrapping differs between the two
   readings of the PDF simply fails that check and is left alone. */
function handleText(block, where) {
  const lines = block.paras.flat();
  const before = block.paras.length;
  parasBefore += before;
  textLinesBefore += lines.length;
  const keep = () => { parasAfter += before; textLinesAfter += lines.length; };
  if (!lines.length) { keep(); return; }

  const wanted = G.key(lines[0].t);
  if (wanted.length < 12) { keep(); return; }        // too short to place safely

  let found = null;
  for (const delta of [1, 2, 0, 3]) {
    const pdfPage = block.page + delta;
    if (pdfPage < 1 || pdfPage > G.pages.length) continue;
    const rs = pageRows(pdfPage);
    const i = rs.findIndex(r => !r.blank && G.key(r.text) === wanted);
    if (i >= 0) { found = { pdfPage, index: i }; break; }
  }
  if (!found) { keep(); return; }

  // Take exactly as many lines as the block holds, noting the breaks.
  const body = [];
  let sawBlank = false, lastRow = null, lastPdfPage = found.pdfPage;
  for (const { row, pdfPage } of fromRow(found.pdfPage, found.index)) {
    if (row.blank) { if (body.length) sawBlank = true; continue; }
    if (!row.text.trim()) continue;
    let breakBefore = false;
    if (pdfPage !== lastPdfPage) {
      breakBefore = !(lastRow && G.CONT_RE.test(lastRow.text));
      lastPdfPage = pdfPage;
    } else if (sawBlank && lastRow) {
      breakBefore = (row.y - lastRow.y) >= MIN_BREAK;
    }
    sawBlank = false;
    body.push({ row, breakBefore });
    lastRow = row;
    if (body.length === lines.length) break;
  }
  if (body.length !== lines.length) { keep(); return; }

  // Every line must be the same text, not just the first and last.
  for (let i = 0; i < lines.length; i++) {
    if (G.key(body[i].row.text.replace(G.CONT_RE, '')) !== G.key(lines[i].t)) { keep(); return; }
  }

  const groups = cut(body);
  const next = [];
  let k = 0;
  for (const size of groups) { next.push(lines.slice(k, k + size)); k += size; }
  const check = next.flat();
  if (check.length !== lines.length || check.some((l, i) => l !== lines[i])) { keep(); return; }

  block.paras = next;
  parasAfter += next.length;
  textLinesAfter += lines.length;
  if (next.length !== before) report.textChanged.push({ where, page: block.page, before, after: next.length, first: lines[0].t.slice(0, 40) });
}

const walk = (blocks, where) => {
  for (const b of blocks) {
    if (b.k === 'psalm' || b.k === 'cant') handle(b, where);
    else if (b.k === 'text' && b.page) handleText(b, where);
  }
};
for (const o of data.offices) walk(o.blocks, o.id);
for (const r of data.readings) walk(r.blocks, r.id);
for (const key of ['compline', 'feastsCommon', 'feastsProper', 'invitatory',
  'supplements', 'lentCanticle', 'zechariah', 'mary']) walk(data[key], key);

/* --------------------------------------------------------------- output */
console.log(`psalms and canticles      ${report.changed.length + report.unchanged + report.skipped.length}`);
console.log(`  regrouped               ${report.changed.length}`);
console.log(`  already correct         ${report.unchanged}`);
console.log(`  skipped (left as-is)    ${report.skipped.length}`);
console.log(`stanzas                   ${stanzasBefore} -> ${stanzasAfter}`);
console.log(`lines                     ${linesBefore} -> ${linesAfter}  ${linesBefore === linesAfter ? '(identical)' : '*** CHANGED ***'}`);
console.log(`
hymns and other prose blocks regrouped  ${report.textChanged.length}`);
console.log(`  paragraphs              ${parasBefore} -> ${parasAfter}`);
console.log(`  lines                   ${textLinesBefore} -> ${textLinesAfter}  ${textLinesBefore === textLinesAfter ? '(identical)' : '*** CHANGED ***'}`);
for (const t of report.textChanged) console.log(`    p.${String(t.page).padStart(3)}  ${t.before} -> ${t.after}   ${JSON.stringify(t.first)}`);

if (linesBefore !== linesAfter || textLinesBefore !== textLinesAfter) { console.error('\nLine count changed. Refusing to write.'); process.exit(1); }

if (report.skipped.length) {
  console.log('\nSkipped — these need checking by hand:');
  const byWhy = new Map();
  for (const s of report.skipped) {
    const k = s.why.replace(/\d+/g, 'n');
    if (!byWhy.has(k)) byWhy.set(k, []);
    byWhy.get(k).push(s);
  }
  for (const [why, list] of byWhy) {
    console.log(`\n  ${why}  (${list.length})`);
    for (const s of list.slice(0, 40)) console.log(`    p.${String(s.page).padStart(3)}  ${s.ref.padEnd(22)} ${s.where}   ${s.why}`);
    if (list.length > 40) console.log(`    … and ${list.length - 40} more`);
  }
}

if (WRITE) {
  fs.writeFileSync(PARSED, JSON.stringify(data, null, 1));
  console.log('\nwritten to tools/parsed.json');
} else {
  console.log('\n(dry run — pass --write to apply)');
}
