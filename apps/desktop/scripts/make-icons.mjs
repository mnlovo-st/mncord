// Builds every app icon from the master logo (transparent PNG):
//   resources/icon.ico (16–256, PNG-compressed entries), resources/icon.png (512), resources/tray.png (32),
//   src/renderer/assets/mark-m.webp (256, used in the title bar, home button and window icon).
//   node scripts/make-icons.mjs [path/to/logo.png]
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] ?? join(root, 'resources', 'logo-master.png');
const master = join(root, 'resources', 'logo-master.png');
if (src !== master) copyFileSync(src, master);

// crop to the rounded square (the art has a wide transparent margin), keep a hair of breathing room
const trimmed = await sharp(master).trim({ threshold: 10 }).toBuffer();
const meta = await sharp(trimmed).metadata();
const side = Math.round(Math.max(meta.width, meta.height) * 1.03);
const square = await sharp(trimmed)
  .extend({
    top: Math.floor((side - meta.height) / 2), bottom: Math.ceil((side - meta.height) / 2),
    left: Math.floor((side - meta.width) / 2), right: Math.ceil((side - meta.width) / 2),
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();

const png = (size) => sharp(square).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();

// ICO with PNG entries (supported since Windows Vista, sharp everywhere incl. the installer)
const sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
const images = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(s >= 256 ? 0 : s, e);
  header.writeUInt8(s >= 256 ? 0 : s, e + 1);
  header.writeUInt8(0, e + 2);
  header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(images[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
writeFileSync(join(root, 'resources', 'icon.ico'), Buffer.concat([header, ...images]));
writeFileSync(join(root, 'resources', 'icon.png'), await png(512));
writeFileSync(join(root, 'resources', 'tray.png'), await png(32));
mkdirSync(join(root, 'src', 'renderer', 'assets'), { recursive: true });
await sharp(square).resize(256, 256, { kernel: 'lanczos3' }).webp({ quality: 92, alphaQuality: 100 }).toFile(join(root, 'src', 'renderer', 'assets', 'mark-m.webp'));
console.log('icons written from', src);
