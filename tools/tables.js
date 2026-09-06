'use strict';
/* The three two-column tables in the book need bespoke handling:
   the psalm index, the feast-day psalm tables and the Litany of Loreto. */

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
function feastTable(pages) {
  const rows = [];
  let section = null;
  for (const p of pages) {
    for (const raw of p.lines) {
      const line = raw.replace(/\s+$/, '');
      const t = line.trim();
      if (!t) continue;
      if (/^(MORNING PSALMS|MIDDAY PSALMS|EVENING PSALMS|OFFICE OF READINGS|ALL OTHER SOLEMN FEASTS|PSALMS FOR FEAST DAYS)/.test(t)) {
        section = t.replace(/\s{2,}.*$/, '').trim();
        if (/^PSALMS FOR FEAST DAYS/.test(section)) continue;
        rows.push({ section, head: true, cells: t.split(/\s{2,}/).slice(1) });
        continue;
      }
      const cells = t.split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
      if (cells.length >= 2 && section) rows.push({ section, cells });
      else if (section && cells.length === 1 && /^[A-Z0-9]/.test(cells[0]) && rows.length)
        rows.push({ section, cells });
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
