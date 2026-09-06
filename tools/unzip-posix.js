'use strict';
/* Extract a zip the way a Linux host does: split entry names on "/" only.
   Used to prove the packaged archive deploys correctly, since that is exactly
   where the Compress-Archive backslashes went wrong.

   Usage: node tools/unzip-posix.js <file.zip> <outdir>                       */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const b = fs.readFileSync(process.argv[2]);
const out = process.argv[3];

let eocd = -1;
for (let i = b.length - 22; i >= 0; i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
const count = b.readUInt16LE(eocd + 10);
let p = b.readUInt32LE(eocd + 16);

fs.rmSync(out, { recursive: true, force: true });
let n = 0;
for (let i = 0; i < count; i++) {
  if (b.readUInt32LE(p) !== 0x02014b50) break;
  const method = b.readUInt16LE(p + 10);
  const compSize = b.readUInt32LE(p + 20);
  const nameLen = b.readUInt16LE(p + 28);
  const extraLen = b.readUInt16LE(p + 30);
  const commentLen = b.readUInt16LE(p + 32);
  const localOff = b.readUInt32LE(p + 42);
  const name = b.toString('utf8', p + 46, p + 46 + nameLen);

  const lNameLen = b.readUInt16LE(localOff + 26);
  const lExtraLen = b.readUInt16LE(localOff + 28);
  const start = localOff + 30 + lNameLen + lExtraLen;
  const data = b.subarray(start, start + compSize);
  const body = method === 0 ? data : zlib.inflateRawSync(data);

  // POSIX semantics: only "/" separates directories. A backslash is just a
  // character in the file name — which is the whole bug being guarded against.
  const parts = name.split('/');
  const dest = path.join(out, ...parts);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body);
  n++;

  p += 46 + nameLen + extraLen + commentLen;
}
console.log(`extracted ${n} entries to ${out}`);
