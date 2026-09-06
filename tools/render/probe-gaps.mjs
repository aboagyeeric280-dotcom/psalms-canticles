/* Read real line geometry out of the PDF so stanza breaks can be decided by
   the gap between lines rather than by whatever pdftotext chose to emit. */
import * as mupdf from 'mupdf';
import fs from 'node:fs';

const SRC = process.argv[2];
const PAGE = Number(process.argv[3]);          // 1-based PDF page

const doc = mupdf.Document.openDocument(fs.readFileSync(SRC), 'application/pdf');
const page = doc.loadPage(PAGE - 1);
const st = JSON.parse(page.toStructuredText('preserve-whitespace').asJSON());

const lines = [];
for (const block of st.blocks ?? []) {
  if (block.type !== 'text') continue;
  for (const line of block.lines ?? []) {
    const text = (line.text ?? '').replace(/\s+$/, '');
    if (!text.trim()) continue;
    lines.push({ y: +line.bbox.y.toFixed(1), h: +line.bbox.h.toFixed(1), x: +line.bbox.x.toFixed(1), text });
  }
}
lines.sort((a, b) => a.y - b.y);

let prev = null;
for (const l of lines) {
  const gap = prev === null ? 0 : +(l.y - prev).toFixed(1);
  console.log(String(gap).padStart(6), '  x=' + String(l.x).padStart(5), ' ', JSON.stringify(l.text.slice(0, 62)));
  prev = l.y;
}
