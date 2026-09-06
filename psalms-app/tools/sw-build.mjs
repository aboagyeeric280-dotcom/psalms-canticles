/* Fill in the service worker's precache list after the Vite build.
   Run automatically by `npm run build`. */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIST = path.resolve('dist');
const SW = path.join(DIST, 'sw.js');

if (!fs.existsSync(SW)) {
  console.error('sw.js not found in dist — did the build run?');
  process.exit(1);
}

const walk = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const rel = base ? `${base}/${e.name}` : e.name;
  return e.isDirectory() ? walk(path.join(dir, e.name), rel) : [rel];
});

const files = walk(DIST)
  .filter(f => f !== 'sw.js')
  // "_redirects" and friends configure the host, they are not app assets.
  .filter(f => !path.basename(f).startsWith('_'))
  .map(f => `./${f}`)
  .sort();

const hash = crypto.createHash('sha256');
for (const f of files) hash.update(f).update(fs.readFileSync(path.join(DIST, f.slice(2))));
const version = hash.digest('hex').slice(0, 12);

// Replace every occurrence, and use function replacements so a "$" inside
// the JSON can never be read as a replacement pattern.
const src = fs.readFileSync(SW, 'utf8')
  .replace(/__VERSION__/g, () => version)
  .replace(/__PRECACHE__/g, () => JSON.stringify(files, null, 2));

if (/__VERSION__|__PRECACHE__/.test(src)) {
  console.error('service worker placeholders were not all filled in');
  process.exit(1);
}
// Vite hard-links public assets into dist on some filesystems; write a fresh
// file so public/sw.js keeps its placeholders.
fs.rmSync(SW, { force: true });
fs.writeFileSync(SW, src);

const bytes = files.reduce((n, f) => n + fs.statSync(path.join(DIST, f.slice(2))).size, 0);
console.log(`service worker: ${files.length} files precached, ${(bytes / 1024 / 1024).toFixed(2)} MB, version ${version}`);
