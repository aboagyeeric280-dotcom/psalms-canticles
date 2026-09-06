/* Zip dist/ into a single archive that can be dropped onto a static host.

   This writes the zip itself rather than shelling out to Compress-Archive.
   That cmdlet records paths with backslashes ("assets\index.js"), which
   Windows tolerates but the ZIP spec forbids — section 4.4.17.1 requires
   forward slashes. A Linux host unpacking such an archive produces one file
   *named* "assets\index.js" at the root instead of an assets/ directory, so
   every script tag 404s and the page renders blank.

   Run after `npm run build`. */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DIST = path.resolve('dist');
const OUT = path.resolve('..', 'psalms-app-dist.zip');

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ has no index.html — run npm run build first');
  process.exit(1);
}

/* --------------------------------------------------------------- crc32 */
const TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = ~0;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/* ------------------------------------------------------- collect files */
function walk(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    // Always a forward slash, whatever the platform's separator is.
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else out.push({ name: rel, full: path.join(dir, entry.name) });
  }
  return out;
}
const files = walk(DIST);

/* ------------------------------------------------------------ write it */
const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

const locals = [];
const central = [];
let offset = 0;

for (const f of files) {
  const raw = fs.readFileSync(f.full);
  const deflated = zlib.deflateRawSync(raw, { level: 9 });
  const useDeflate = deflated.length < raw.length;
  const data = useDeflate ? deflated : raw;
  const name = Buffer.from(f.name, 'utf8');
  const stat = fs.statSync(f.full);
  const time = dosTime(stat.mtime), date = dosDate(stat.mtime);
  const crc = crc32(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);              // version needed
  local.writeUInt16LE(0x0800, 6);          // UTF-8 names
  local.writeUInt16LE(useDeflate ? 8 : 0, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, name, data);

  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(0x031e, 4);            // made by: UNIX, so modes read sanely
  cen.writeUInt16LE(20, 6);
  cen.writeUInt16LE(0x0800, 8);
  cen.writeUInt16LE(useDeflate ? 8 : 0, 10);
  cen.writeUInt16LE(time, 12);
  cen.writeUInt16LE(date, 14);
  cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(data.length, 20);
  cen.writeUInt32LE(raw.length, 24);
  cen.writeUInt16LE(name.length, 28);
  cen.writeUInt32LE(0o644 << 16, 38);      // external attributes
  cen.writeUInt32LE(offset, 42);
  central.push(cen, name);

  offset += local.length + name.length + data.length;
}

const centralBuf = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(offset, 16);

fs.writeFileSync(OUT, Buffer.concat([...locals, centralBuf, eocd]));

/* --------------------------------------------------------------- checks */
const bad = files.filter(f => f.name.includes('\\'));
if (bad.length) { console.error('backslash in an entry name — refusing to ship'); process.exit(1); }
if (!files.some(f => f.name === 'index.html')) { console.error('index.html is not at the root'); process.exit(1); }

console.log(`${files.length} files -> ${OUT}  (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB)`);
console.log('index.html is at the root and every path uses "/".');
console.log('Unzip it and drag the folder onto Netlify Drop, or drop the zip itself.');
