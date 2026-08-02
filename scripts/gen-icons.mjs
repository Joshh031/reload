// Generates maskable PWA icons (solid ground, signal-colored glyph) as PNGs
// with no image dependencies: raw RGBA -> zlib deflate -> hand-built PNG.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GROUND = [0x14, 0x16, 0x1a];
const SIGNAL = [0x6e, 0xa8, 0xc7];

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (const b of buf) crc = (crc >>> 8) ^ table[(crc ^ b) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixelAt) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelAt(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Glyph: three horizontal mono bars, blotter-like. Fits the maskable safe zone.
function makeIcon(size) {
  const barH = Math.round(size * 0.055);
  const gap = Math.round(size * 0.09);
  const x0 = Math.round(size * 0.28);
  const widths = [0.44, 0.34, 0.24].map((w) => Math.round(size * w));
  const totalH = barH * 3 + gap * 2;
  const y0 = Math.round((size - totalH) / 2);
  return png(size, (x, y) => {
    for (let i = 0; i < 3; i++) {
      const by = y0 + i * (barH + gap);
      if (y >= by && y < by + barH && x >= x0 && x < x0 + widths[i]) return SIGNAL;
    }
    return GROUND;
  });
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'icons');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'icon-192.png'), makeIcon(192));
writeFileSync(join(out, 'icon-512.png'), makeIcon(512));
console.log('icons written to', out);
