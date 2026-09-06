/* Rasterise the app icon to the PNG sizes the manifest asks for.

   The mark is the arms of the Order of Preachers — party per pale argent and
   sable, a cross fleury counterchanged — which is all rectangles and circles,
   so it rasterises exactly without an image toolchain. PNGs are written with
   Node's own zlib.                                                          */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve(process.argv[2] ?? 'psalms-app/public/icons');
const WHITE = [0xfa, 0xf8, 0xf4];
const BLACK = [0x1d, 0x1a, 0x16];

/* ------------------------------------------------------------- geometry */
// All shapes are described on the 512-unit design grid.
const roundRect = (x, y, w, h, r) => (px, py) => {
  const dx = Math.max(x + r - px, 0, px - (x + w - r));
  const dy = Math.max(y + r - py, 0, py - (y + h - r));
  return Math.hypot(dx, dy) <= r && px >= x && px <= x + w && py >= y && py <= y + h;
};
const circle = (cx, cy, r) => (px, py) => Math.hypot(px - cx, py - cy) <= r;

const CROSS = [
  roundRect(228, 100, 56, 312, 8),
  roundRect(100, 228, 312, 56, 8),
  circle(256, 108, 33), circle(256, 404, 33),
  circle(108, 256, 33), circle(404, 256, 33),
];
const inCross = (x, y) => CROSS.some(f => f(x, y));

/** Colour of the design at a point, or null outside the rounded square. */
function shade(x, y, corner) {
  if (!roundRect(0, 0, 512, 512, corner)(x, y)) return null;
  const left = x < 256;
  const onCross = inCross(x, y);
  if (left) return onCross ? BLACK : WHITE;
  return onCross ? WHITE : BLACK;
}

/* ------------------------------------------------------------ rasteriser */
function raster(size, { corner = 112, inset = 0 } = {}) {
  const SS = 4;                                   // supersampling factor
  const px = Buffer.alloc(size * size * 4);
  const span = 512 / (1 - inset * 2);
  const origin = -inset * span;

  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = origin + ((pxi + (sx + 0.5) / SS) / size) * span;
          const uy = origin + ((py + (sy + 0.5) / SS) / size) * span;
          const c = shade(ux, uy, corner);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
        }
      }
      const n = SS * SS;
      const i = (py * size + pxi) * 4;
      const cov = a / (255 * n);
      px[i] = cov ? Math.round(r / (n * cov)) : 0;
      px[i + 1] = cov ? Math.round(g / (n * cov)) : 0;
      px[i + 2] = cov ? Math.round(b / (n * cov)) : 0;
      px[i + 3] = Math.round(a / n);
    }
  }
  return px;
}

/* -------------------------------------------------------- PNG container */
function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;                        // 8-bit RGBA
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0;                  // filter: none
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------------------------------------------- output */
fs.mkdirSync(OUT, { recursive: true });
const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  // Maskable icons must survive a circular crop: fill the square, inset the art.
  ['icon-maskable-512.png', 512, { corner: 0, inset: 0.14 }],
  ['apple-touch-icon.png', 180, { corner: 0 }],
];
for (const [name, size, opts] of targets) {
  const buf = png(size, raster(size, opts));
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(name, `${size}x${size}`, `${(buf.length / 1024).toFixed(1)} kB`);
}
