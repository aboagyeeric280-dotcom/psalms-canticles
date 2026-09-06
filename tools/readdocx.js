'use strict';
/* Read a .docx into plain paragraphs, preserving every character of the text
   exactly — the tone slashes, accents and hyphens in these canticles are
   liturgical marks, not typography to be cleaned up.

   Usage: node tools/readdocx.js <file.docx> [outfile.txt]                   */

const fs = require('fs');
const zlib = require('zlib');

function readParagraphs(file) {
  return parse(fs.readFileSync(file));
}

/* ------------------------------------------------ minimal zip reader */
function readZip(b) {
  // End of central directory
  let eocd = -1;
  for (let i = b.length - 22; i >= 0; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);

  const entries = {};
  for (let n = 0; n < count; n++) {
    if (b.readUInt32LE(p) !== 0x02014b50) break;
    const method = b.readUInt16LE(p + 10);
    const compSize = b.readUInt32LE(p + 20);
    const nameLen = b.readUInt16LE(p + 28);
    const extraLen = b.readUInt16LE(p + 30);
    const commentLen = b.readUInt16LE(p + 32);
    const localOff = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nameLen);

    // local header: skip its own name/extra fields
    const lNameLen = b.readUInt16LE(localOff + 26);
    const lExtraLen = b.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const data = b.subarray(dataStart, dataStart + compSize);
    entries[name] = method === 0 ? data : zlib.inflateRawSync(data);

    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function parse(buf) {
const entries = readZip(buf);
const xml = entries['word/document.xml'];
if (!xml) throw new Error('no word/document.xml in this file');

/* ------------------------------------------- paragraphs out of the XML */
const doc = xml.toString('utf8');
const unescape = s => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&');

const paragraphs = [];
const paraRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>|<w:p\b[^>]*\/>/g;
let m;
while ((m = paraRe.exec(doc))) {
  const inner = m[1] || '';
  let text = '';
  // Walk the runs in order, keeping tabs and explicit breaks.
  const partRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;
  let q;
  while ((q = partRe.exec(inner))) {
    if (q[1] !== undefined) text += unescape(q[1]);
    else if (q[0].startsWith('<w:tab')) text += '\t';
    else text += '\n';
  }
  // style name, so headings can be told from body text
  const st = /<w:pStyle\s+w:val="([^"]+)"/.exec(inner);
  const bold = /<w:b\/>|<w:b\s+w:val="(?:1|true)"/.test(inner);
  // Space after the paragraph — this document carries its stanza breaks
  // there rather than as empty paragraphs.
  const sp = /<w:spacing\b[^>]*\bw:after="(\d+)"/.exec(inner);
  paragraphs.push({
    text, style: st ? st[1] : '', bold,
    after: sp ? parseInt(sp[1], 10) : 0,
  });
}

return paragraphs;
}

/* ------------------------------------------------------------------ CLI */
if (require.main === module) {
const file = process.argv[2];
const out = process.argv[3];
const paragraphs = readParagraphs(file);
const lines = paragraphs.map(p => {
  const tag = p.style && p.style !== 'Normal' ? `[${p.style}]` : (p.bold && p.text.trim() ? '[b]' : '');
  const brk = p.after >= 100 && !p.style ? '¶' : '';   // marks a stanza end
  return (tag ? `${tag}\t${p.text}` : p.text) + brk;
});

const text = lines.join('\n');
if (out) { fs.writeFileSync(out, text); console.error(`${paragraphs.length} paragraphs -> ${out}`); }
else console.log(text);
}

module.exports = { readParagraphs };
