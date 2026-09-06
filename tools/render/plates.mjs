/* Render the engraved-music pages of the book to PNG so the app can show
   them where the printed page carries no machine-readable text. */
import * as mupdf from 'mupdf';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
const OUT = process.argv[3];

// pdfPage -> { caption, rotate }
const PLATES = {
  13: { caption: 'Te Deum — the Church’s Hymn of Praise (1 of 2)' },
  14: { caption: 'Te Deum — the Church’s Hymn of Praise (2 of 2)' },
  19: { caption: 'Song of Zechariah 3 — music score' },
  22: { caption: 'Song of Zechariah 6 — music score' },
  23: { caption: 'Song of Zechariah 7 — music score' },
  24: { caption: 'Song of Zechariah 8 — music score' },
  420: { caption: 'Dominican Compline Supplement — Eastertide antiphon, antiphon for feasts of Mary, response for Lent' },
  421: { caption: 'Responses for Holy Thursday, Good Friday and Easter Week; antiphons for the Song of Simeon in Lent' },
  422: { caption: 'Song of Simeon, with antiphons for Christmas, Easter, Ascension, Pentecost and Corpus Christi' },
  423: { caption: 'Antiphons on feasts of Mary; Magne Pater Sancte Dominice' },
  424: { caption: 'Salve Regina — English setting' },
  425: { caption: 'Salve Regina — Latin chant, Mode I' },
  426: { caption: 'Inviolata — Latin chant' },
  427: { caption: 'Regina Caeli — English setting and Latin chant' },
  428: { caption: 'O Lumen Ecclesiae — English setting and Latin chant' },
  433: { caption: 'Morning Intercessions — Good Friday', rotate: -90 },
  434: { caption: 'Morning Intercessions — Holy Thursday and Holy Saturday', rotate: -90 },
};

fs.mkdirSync(OUT, { recursive: true });
const doc = mupdf.Document.openDocument(fs.readFileSync(SRC), 'application/pdf');
const scale = 200 / 72;

const manifest = [];
for (const [key, meta] of Object.entries(PLATES)) {
  const n = Number(key);
  const page = doc.loadPage(n - 1);
  let m = mupdf.Matrix.scale(scale, scale);
  if (meta.rotate) m = mupdf.Matrix.concat(m, mupdf.Matrix.rotate(meta.rotate));
  const pix = page.toPixmap(m, mupdf.ColorSpace.DeviceGray, false, true);
  const buf = pix.asPNG();
  const file = `p${String(n).padStart(3, '0')}.png`;
  fs.writeFileSync(path.join(OUT, file), buf);
  manifest.push({ page: n, file, caption: meta.caption, w: pix.getWidth(), h: pix.getHeight() });
  console.log(file, pix.getWidth() + 'x' + pix.getHeight(), (buf.length / 1024).toFixed(0) + 'kB');
}
fs.writeFileSync(path.join(OUT, 'plates.json'), JSON.stringify(manifest, null, 1));
