/* Dump every text line of the book with its page, x position and the vertical
   gap to the line above, as JSON. This is the ground truth the stanza
   grouping is rebuilt from — pdftotext's blank lines are not reliable. */
import * as mupdf from 'mupdf';
import fs from 'node:fs';

const SRC = process.argv[2];
const OUT = process.argv[3];

const doc = mupdf.Document.openDocument(fs.readFileSync(SRC), 'application/pdf');
const pages = [];

for (let n = 0; n < doc.countPages(); n++) {
  const page = doc.loadPage(n);
  let st;
  try {
    st = JSON.parse(page.toStructuredText('preserve-whitespace').asJSON());
  } catch {
    pages.push({ pdfPage: n + 1, lines: [] });
    continue;
  }

  const lines = [];
  for (const block of st.blocks ?? []) {
    if (block.type !== 'text') continue;
    for (const line of block.lines ?? []) {
      const text = (line.text ?? '').replace(/\s+$/, '');
      // An empty line is not noise: MuPDF's layout analysis emits one exactly
      // where the book leaves vertical space, which is where a stanza ends.
      // Keep it as a marker rather than throwing the structure away.
      if (!text.trim()) {
        lines.push({ y: +(line.y ?? 0).toFixed(2), x: 0, h: 0, size: null, text: '', blank: true });
        continue;
      }
      // line.y is the baseline and font.size the real point size. Both are
      // steady; the bbox is not — it grows whenever a line happens to carry
      // one of the book's pitch accents, which would otherwise read as a
      // change of leading.
      lines.push({
        y: +line.y.toFixed(2),
        x: +line.x.toFixed(2),
        h: +line.bbox.h.toFixed(2),
        size: line.font ? line.font.size : null,
        text,
      });
    }
  }
  // Reading order: top to bottom, then left to right.
  lines.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? a.y - b.y : a.x - b.x));

  let prevY = null;
  for (const l of lines) {
    l.gap = prevY === null ? null : +(l.y - prevY).toFixed(2);
    prevY = l.y;
  }
  pages.push({ pdfPage: n + 1, lines });
}

fs.writeFileSync(OUT, JSON.stringify(pages));
const total = pages.reduce((n, p) => n + p.lines.length, 0);
console.log(`${pages.length} pages, ${total} lines -> ${OUT}`);
