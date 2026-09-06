'use strict';
/* List the entry names in a zip exactly as they are recorded, so path
   separators and any nesting are visible. */
const fs = require('fs');
const b = fs.readFileSync(process.argv[2]);

let eocd = -1;
for (let i = b.length - 22; i >= 0; i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
const count = b.readUInt16LE(eocd + 10);
let p = b.readUInt32LE(eocd + 16);

const names = [];
for (let n = 0; n < count; n++) {
  if (b.readUInt32LE(p) !== 0x02014b50) break;
  const nameLen = b.readUInt16LE(p + 28);
  const extraLen = b.readUInt16LE(p + 30);
  const commentLen = b.readUInt16LE(p + 32);
  names.push(b.toString('utf8', p + 46, p + 46 + nameLen));
  p += 46 + nameLen + extraLen + commentLen;
}

console.log(`${names.length} entries\n`);
for (const n of names) console.log('  ' + JSON.stringify(n));

const backslash = names.filter(n => n.includes('\\'));
const nested = names.filter(n => /^dist[\\/]/.test(n));
console.log(`\nentries containing a backslash: ${backslash.length}`);
console.log(`entries nested under dist/:     ${nested.length}`);
console.log(`index.html at the root:         ${names.includes('index.html') ? 'yes' : 'NO'}`);
