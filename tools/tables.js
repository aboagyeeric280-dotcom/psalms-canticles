'use strict';
/* The three two-column tables in the book need bespoke handling:
   the psalm index, the feast-day psalm tables and the Litany of Loreto. */
const { bodyLines } = require('./geom.js');

// -------------------------------------------------- Index of psalms & canticles
// Entries read  "119:105-112 ................. 94,194"  in two columns; the
// dot leader makes them recoverable without knowing the column boundary.
const ENTRY_RE = /([A-Za-z0-9][^.\n]*?)\s*\.{3,}\s*([\d]+(?:\s*[-–,]\s*\d+)*)/g;

function psalmIndex(pages) {
  const psalms = [], canticles = [];
  let bucket = psalms, otLabel = null;
  for (const p of pages) {
    for (const line of p.lines) {
      if (/OLD TESTAMENT CANTICLES/.test(line)) { bucket = canticles; otLabel = 'Old Testament'; }
      if (/NEW TESTAMENT CANTICLES/.test(line)) { bucket = canticles; otLabel = 'New Testament'; }
      ENTRY_RE.lastIndex = 0;
      let m;
      while ((m = ENTRY_RE.exec(line))) {
        const label = m[1].trim().replace(/\s+/g, ' ');
        if (!label || /^Psalm$/i.test(label) || /Page$/.test(label)) continue;
        const pgs = m[2].split(/\s*[,]\s*/).map(x => x.trim()).filter(Boolean);
        const isPsalm = /^\d/.test(label) && bucket === psalms;
        (isPsalm ? psalms : canticles).push({
          label, pages: pgs,
          num: isPsalm ? parseInt(label, 10) : null,
          testament: isPsalm ? null : otLabel,
        });
      }
    }
  }
  // de-duplicate labels that continue across a column break
  const seen = new Map();
  for (const e of psalms) {
    const k = e.label;
    if (seen.has(k)) seen.get(k).pages.push(...e.pages); else seen.set(k, e);
  }
  return { psalms: [...seen.values()], canticles };
}

// -------------------------------------------------- Psalms for feast days
// This table cannot be read off the pdftotext dump. Its labels are typeset a
// fraction lower than the figures they belong to — "DEDICATION OF A CHURCH"
// sits on baseline 65, its "24, 84, 87" on baseline 64 — and a flat line
// height puts the two in different rows, so every label ends up paired with
// the row above it. The dump also loses "116B" to the OCR normaliser, which
// reads a B between two digits as an en dash. Rebuild the rows from the PDF's
// own geometry instead: group the lines into rows by baseline, then cut each
// row into columns at the x of the "Psalms" and "Pages" headings.
const SECTION_HEAD = /^(MORNING PSALMS|MIDDAY PSALMS|EVENING PSALMS|OFFICE OF READINGS|ALL OTHER SOLEMN FEASTS)/;
const ROW_SLACK = 3;   // a label may sit a point below its own figures
const COL_SLACK = 12;  // figures start a little to the left of their heading

/** Group a page's lines into printed rows, each sorted left to right. */
function bands(lines) {
  const out = [];
  for (const l of lines) {
    if (l.blank || !l.text.trim()) continue;
    const row = out.find(r => Math.abs(r.y - l.y) <= ROW_SLACK);
    if (row) row.parts.push(l);
    else out.push({ y: l.y, parts: [l] });
  }
  for (const r of out) r.parts.sort((a, b) => a.x - b.x);
  return out.sort((a, b) => a.y - b.y);
}

function feastTable(pages) {
  const rows = [];
  let section = null;
  let cols = null;              // { psalms, pages } — the x of each heading
  for (const p of pages) {
    for (const { parts } of bands(bodyLines(p.pdfPage))) {
      // The heading row of a section fixes the column boundaries for it and
      // for any page the table runs on to.
      const head = parts.find(c => c.text.trim() === 'Psalms');
      const pageHead = parts.find(c => c.text.trim() === 'Pages');
      if (head && pageHead) cols = { psalms: head.x, pages: pageHead.x };

      const cut = c => {
        if (!cols || c.x < cols.psalms - COL_SLACK) return 0;
        return c.x < cols.pages - COL_SLACK ? 1 : 2;
      };
      const cells = ['', '', ''];
      for (const c of parts) {
        const i = cut(c);
        cells[i] = cells[i] ? cells[i] + ' ' + c.text.trim() : c.text.trim();
      }

      // A section heading stands alone in the label column.
      if (!cells[1] && !cells[2] && SECTION_HEAD.test(cells[0])) {
        section = cells[0].trim();
        continue;
      }
      if (!section) continue;   // the page title and the opening rubric

      while (cells.length && !cells[cells.length - 1]) cells.pop();
      if (!cells.length) continue;
      rows.push(head && pageHead ? { section, head: true, cells } : { section, cells });
    }
  }
  return rows;
}

// -------------------------------------------------- Litany of Loreto (2 columns)
function litany(page, splitAt = 34) {
  const left = [], right = [];
  for (const raw of page.lines) {
    const l = raw.slice(0, splitAt).trim();
    const r = raw.slice(splitAt).trim();
    if (l && !/^LITANY/.test(l)) left.push(l);
    if (r) right.push(r);
  }
  // re-join lines that wrapped inside one invocation
  const join = arr => {
    const out = [];
    for (const s of arr) {
      const prev = out[out.length - 1];
      if (prev && !/[,.:;!?]$/.test(prev) && !/^(V\/|R\/|V\.|R\.|Let us pray)/.test(s)) out[out.length - 1] = prev + ' ' + s;
      else out.push(s);
    }
    return out;
  };
  return [...join(left), ...join(right)].map(text => {
    const m = /^([VR])[/.]\s*(.*)$/.exec(text);
    if (m) return { c: m[1], text: m[2] };
    if (/^Let us pray/i.test(text)) return { c: 'P', text };
    return { c: '', text };
  });
}

module.exports = { psalmIndex, feastTable, litany };
