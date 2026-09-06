/* Copy the font files the app uses out of the @fontsource packages and into
   public/fonts, so they ship with the build and are precached for offline.

   Loading them from fonts.googleapis.com would be simpler and would break the
   one thing this app is for: working with no network. Only the latin subset
   and the four weights actually used are copied. */

import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public', 'fonts');
const WANT = [
  // Vellum & Rubric: the book hand, with Cormorant for versals and small caps.
  ['@fontsource/eb-garamond', 'eb-garamond-latin-400-normal.woff2'],
  ['@fontsource/eb-garamond', 'eb-garamond-latin-400-italic.woff2'],
  ['@fontsource/eb-garamond', 'eb-garamond-latin-600-normal.woff2'],
  ['@fontsource/cinzel', 'cinzel-latin-600-normal.woff2'],
  ['@fontsource/cormorant-garamond', 'cormorant-garamond-latin-600-normal.woff2'],
  // Green Modern reads its verses in Cormorant rather than setting them in the
  // display weight, so it needs the book weight and its italic too.
  ['@fontsource/cormorant-garamond', 'cormorant-garamond-latin-400-normal.woff2'],
  ['@fontsource/cormorant-garamond', 'cormorant-garamond-latin-400-italic.woff2'],
  // Still Point: a quieter reading face and a mono for the verse gutter.
  ['@fontsource/newsreader', 'newsreader-latin-400-normal.woff2'],
  ['@fontsource/newsreader', 'newsreader-latin-400-italic.woff2'],
  ['@fontsource/ibm-plex-mono', 'ibm-plex-mono-latin-400-normal.woff2'],
];

fs.mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [pkg, file] of WANT) {
  const from = path.join('node_modules', pkg, 'files', file);
  if (!fs.existsSync(from)) {
    console.error(`missing ${from} — run npm install first`);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(OUT, file));
  const size = fs.statSync(from).size;
  total += size;
  console.log(`${file.padEnd(38)} ${(size / 1024).toFixed(1)} kB`);
}
console.log(`\n${WANT.length} files, ${(total / 1024).toFixed(1)} kB into public/fonts`);
