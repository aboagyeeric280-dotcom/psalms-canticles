'use strict';
/* Shared reading of the PDF's real line geometry (tools/lines.json).

   pdftotext's blank lines do not correspond to the book's stanza breaks: it
   emits one wherever its own spacing heuristic fires, which inside a psalm
   lands both too often and too rarely. The book's actual structure is in the
   vertical gaps — body leading sits near 13-14pt and a stanza break near
   22-23pt, with nothing in between. */

const path = require('path');
const pages = require(path.join(__dirname, 'lines.json'));
const { normalise } = require('./lib.js');

/* The PDF carries the book's pitch accents (ʼ) that pdftotext dropped, and
   both renderings share the font's quote glyphs (A / @). Put the two through
   the same normaliser before comparing, then reduce to bare letters. */
const plain = s => normalise(s)
  .replace(/[ʼ‘’“”'"]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/** Letters and digits only — for matching a heading or a line of verse. */
const key = s => plain(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** The mark the book puts at a page foot when a stanza runs on overleaf. */
const CONT_RE = /\+\s*\d+\s*$/;

const ANTIPHON_START = /^(Advent|Christmastide|Christmas|Before Epiphany|After Epiphany|Epiphany|Lent|Holy Week|Passiontide|Eastertide|Easter|Outside Easter|Through the Year|Ordinary Time|Solemn Feasts|Solemnities|Feasts|Antiphon|Before Noon|Noon|Afternoon|Midday|or|\d{1,2}(?:\s*[-–]\s*\d{1,2})?\s+(?:December|January))\b\s*[:,]/;
const ANTIPHONS_NOTE = /^Antiphons\b/;
// A section numeral sometimes shares its line with a title for the section
// ("II   God's Promise to David"), so it is not always alone on the line.
const SECTION_ONLY = /^(I|II|III|IV|V|VI|VII|VIII|IX)(?:\s{2,}\S.*)?$/;
const PSALM_HEAD = /^Psalm\s+\d/;
const BOOK_HEAD = /^(Rev|Phil|Col|Eph|1\s*Tim|I\s*Tim|1\s*Peter|1\s*Pet|Tob|Dan|Exodus|Ex|Deut|1\s*Sam|I\s*Sam|1\s*Chron|I\s*Chron|Judith|Jud|Sirach|Sir|Wisdom|Wis|Isaiah|Is|Jeremiah|Jer|Ezekiel|Ez|Habakkuk|Hab|Luke|Lk|Ephesians|Philippians|Colossians|Revelation)\.?\s*\d/;

/* Every page carries its running head — the page number and the section
   title — on a single line at y=23, while the first line of type sits at
   y>=35. A flat cut-off is therefore exact, and unlike a test on the wording
   it also catches heads printed in mixed case ("10   Invitatory"). */
const HEADER_BELOW = 30;

/** Strip the running header and the printed page number from a page. */
function bodyLines(pdfPage) {
  const page = pages[pdfPage - 1];
  if (!page) return [];
  return page.lines.filter(l => l.y >= HEADER_BELOW);
}

/** Does this line end the body of a psalm? */
function isTerminator(text) {
  const t = text.trim();
  if (!t) return false;
  if (ANTIPHON_START.test(t) || ANTIPHONS_NOTE.test(t)) return true;
  if (PSALM_HEAD.test(t) || BOOK_HEAD.test(t)) return true;
  // a pointer at another page: "Ps. 147   See p. 287."
  if (/\bpp?\.\s*\d/.test(t) && t.length < 90) return true;
  // A centred all-caps title — "MONDAY I - MIDDAY", "COMPLINE", and also
  // "BAPTISM OF THE LORD (Sunday after 6 Jan.)", whose gloss is lower case.
  const bare = t.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const letters = bare.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 3 && letters === letters.toUpperCase() && !/[a-z]/.test(bare)) return true;
  return false;
}

const isSection = text => SECTION_ONLY.test(text.trim());
/** The numeral itself, or null. */
const sectionNumeral = text => { const m = SECTION_ONLY.exec(text.trim()); return m ? m[1] : null; };
const isRubric = (line, leftEdge) => line.x > leftEdge + 40;

/** An antiphon line, which interrupts but does not end a canticle's body. */
const isAntiphon = text => ANTIPHON_START.test(text.trim()) || ANTIPHONS_NOTE.test(text.trim());

module.exports = {
  pages, plain, key, bodyLines, isTerminator, isSection, sectionNumeral, isRubric, isAntiphon,
  CONT_RE, PSALM_HEAD, BOOK_HEAD, ANTIPHON_START,
};
