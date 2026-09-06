'use strict';
const fs = require('fs');

// ---------- OCR normalisation -------------------------------------------
// The source PDF was typeset in a font whose curly quotes and apostrophe
// pdftotext exports as  A  /  @  /  =  .  A handful of pronoun+verb pairs
// also lost their space ("iwill", "iam").
const I_WORDS = ['will', 'am', 'have', 'was', 'shall', 'would', 'should', 'may', 'can',
  'know', 'do', 'did', 'say', 'said', 'see', 'saw', 'go', 'went', 'cry', 'call', 'pray',
  'trust', 'love', 'think', 'thank', 'praise', 'sing', 'hear', 'hope', 'live', 'die',
  'lie', 'look', 'make', 'need', 'obey', 'put', 'remember', 'rest', 'rise', 'seek',
  'serve', 'set', 'sit', 'speak', 'stand', 'take', 'tell', 'turn', 'wait', 'walk',
  'want', 'watch', 'give', 'gave', 'come', 'came', 'ask', 'bring', 'keep', 'lift'];
const I_RE = new RegExp('\\bi(' + I_WORDS.join('|') + ')\\b', 'g');

const I_RE_CAP = new RegExp('\\bI(' + I_WORDS.join('|') + ')\\b', 'g');

function normalise(s) {
  return s
    .replace(/\r/g, '')
    .replace(/\bA(?=[A-Z][a-z])/g, '“')   // AThe   -> “The
    .replace(/@/g, '”')                   // ...@   -> ...”
    .replace(/([A-Za-z.,!?])=/g, '$1’')   // Lord=s -> Lord’s
    .replace(/’"/g, '’”')
    .replace(/([a-z])C(?=[A-Z ])/g, '$1—') // thisC That -> this— That
    .replace(/(\d)\s*B\s*(\d)/g, '$1–$2') // Phil 2:6 B 11 -> 2:6–11 ; 1B 14 -> 1–14
    .replace(I_RE, 'I $1')
    .replace(I_RE_CAP, 'I $1')            // "Iam the Lord" -> "I am the Lord"
    // The typesetter's two quote styles both survive extraction; make them one.
    .replace(/"(?=[^\s])/g, '“')
    .replace(/"/g, '”')
    .replace(/[ \t]+\+\d[ \t]*$/gm, '')        // "+2" = verse continues overleaf
    .replace(/[ \t]+$/gm, '');
}

// ---------- page splitting ----------------------------------------------
// Every page carries a running header: "<n>   TITLE" (verso) or
// "TITLE   <n>" (recto). Strip it, remember the printed page number.
function loadPages(file) {
  const raw = normalise(fs.readFileSync(file, 'utf8'));
  return raw.split('\f').map((page, i) => {
    const lines = page.split('\n');
    let printed = null, headerIdx = -1;
    for (let j = 0; j < lines.length; j++) {
      const t = lines[j].trim();
      if (!t) continue;
      const m = t.match(/^(\d{1,3})\b/) || t.match(/\b(\d{1,3})$/);
      if (m) { printed = parseInt(m[1], 10); headerIdx = j; }
      break;
    }
    const body = lines.slice();
    if (headerIdx >= 0) body[headerIdx] = '';
    return {
      pdfPage: i + 1,
      printed: printed == null ? i : printed,
      lines: body,
      text: body.join('\n'),
      isPlate: body.join('').trim().length < 40,   // scanned music score
    };
  });
}

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const SEASON_LABELS = ['Advent', 'Christmastide', 'Christmas Season', 'Christmas',
  'Before Epiphany', 'After Epiphany', 'Epiphany', 'Lent', 'Holy Week',
  'Passiontide', 'Eastertide', 'Outside Easter', 'Outside Eastertide', 'Easter',
  'Through the Year', 'Ordinary Time', 'Solemn Feasts', 'Solemnities', 'Feasts'];

// "Advent: ..."  "Lent, Sunday I: ..."  "Through the Year and Lent: ..."  "or: ..."
const ANTIPHON_RE = new RegExp(
  '^(' +
  '(?:' + SEASON_LABELS.join('|') + ')(?:[^:\\n]{0,45})?' +
  '|or' +
  '|Before Noon|Noon|Afternoon|Midday|Antiphon|Mid-?morning|Mid-?afternoon' +
  // the Advent propers of 17–24 December
  '|\\d{1,2}(?:\\s*[-–]\\s*\\d{1,2})?\\s+(?:December|Dec\\.?|January|Jan\\.?)' +
  '|(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\\.[\\d&,\\s]*' +
  ')\\s*:\\s*(.*)$');

// "Psalm 141        An Evening Prayer"  "Psalm 147: 12-20"  "Psalm 19B"
// "Psalm 139:1 -18, 23-24   God’s knowledge and Care"
// The gap before the title is sometimes a single space, so the title is
// recognised by its capital rather than by the width of the gap.
// The letter suffix ("Psalm 19B") never has a space before it — allowing one
// would swallow the "A" of a title like "Psalm 80  A Prayer for the Nation".
const PSALM_RE =
  /^(Psalm\s+\d{1,3}[A-C]?(?:\s*:\s*\d+[a-c]?(?:\s*[,–\-]\s*\d+[a-c]?)*)?(?:\s+all)?)(?:\s{2,}(\S.*?)|\s([A-Z“].*?))?\s*$/;

const BOOKS = ['Rev', 'Phil', 'Col', 'Eph', '1 Tim', 'I Tim', '1 Peter', '1 Pet',
  'Tob', 'Dan', 'Exodus', 'Ex', 'Deut', '1 Sam', 'I Sam', '1 Chron', 'I Chron',
  'Judith', 'Sirach', 'Wisdom', 'Isaiah', 'Is', 'Jeremiah', 'Jer', 'Ezekiel', 'Ez',
  'Habakkuk', 'Hab', 'Luke', 'Lk', 'Rom', '1 Cor', '2 Cor', 'Gal', 'Heb', 'James',
  '1 John', 'Acts', '1 Thess', '2 Thess', 'Num', 'Prov', 'Jonah', 'Micah', 'Zeph',
  'Zech', 'Mal', 'Baruch', 'Lam', 'Joel', 'Amos', 'Hosea', 'Nahum', 'Job',
  // the shorter and longer forms the book also uses
  'Jud', 'Wis', 'Sir', 'Ecclesiasticus', 'Ephesians', 'Philippians', 'Colossians',
  '1 Timothy', 'I Timothy', 'Revelation', 'Jeremias', 'Daniel', 'Tobit', 'Chron'];
// "Rev 11:17-18; 12:10b-12a"  "Dan 3:57-88,56"  "I Chron 29; 10-13"
// "Tob 13: 1ff"  "Is 42 : 10-16"  "Eph. 1:3-10   In Praise of God"
const CANTICLE_RE = new RegExp(
  '^(' + BOOKS.map(b => b.replace(/ /g, '\\s')).join('|') + ')\\.?' +
  // "Sir. 36 1-5,10-13" separates chapter from verse with a space, not a colon
  '\\s*\\d+[a-c]?(?:\\s*ff\\b|\\s*[:;,.\\u2013\\-]\\s*\\d+[a-c]?|\\s+(?=\\d)\\d+[a-c]?)*\\.?' +
  '(?:\\s{2,}(\\S.*))?$');

// A psalm long enough to be sung in parts is divided by a bare Roman numeral.
const SECTION_RE = /^(VIII|VII|VI|IV|IX|V|III|II|I)(?:\s{2,}(\S.*))?$/;

module.exports = {
  loadPages, normalise, DAYS, SEASON_LABELS,
  ANTIPHON_RE, PSALM_RE, CANTICLE_RE, SECTION_RE, BOOKS,
};
