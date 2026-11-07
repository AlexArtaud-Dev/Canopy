// Generates the fake managed tree used in development and tests (dev/files): a few "mounted
// volumes" with realistic names, small text files, tiny valid images and one large folder for
// pagination. Deterministic, so re-running it produces the same tree.
//   node scripts/dev/seed-files.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dev', 'files');

function write(relative, content) {
  const target = join(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A valid size×size PNG with a diagonal gradient, so previews have something to show. */
function png(size, [r, g, b]) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = [0];
    for (let x = 0; x < size; x += 1) {
      const shade = (x + y) / (2 * size);
      row.push(Math.round(r * shade), Math.round(g * shade), Math.round(b * shade));
    }
    rows.push(Buffer.from(row));
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

rmSync(root, { recursive: true, force: true });

// Media volume: photos by year, music, videos.
const palette = [
  [230, 120, 60],
  [60, 140, 230],
  [90, 200, 120],
  [200, 80, 180],
  [240, 200, 60],
];
for (const [year, count] of [
  ['2023', 6],
  ['2024', 8],
]) {
  for (let i = 1; i <= count; i += 1) {
    write(
      `media/Photos/${year}/IMG_${year}${String(i).padStart(4, '0')}.png`,
      png(32, palette[i % palette.length]),
    );
  }
}
write('media/Photos/Vacances été 2024/plage.png', png(48, [40, 160, 220]));
write('media/Photos/Vacances été 2024/montagne.png', png(48, [120, 180, 90]));
write('media/Photos/Private/scan-passport.png', png(24, [150, 150, 150]));
write('media/Music/Playlist.m3u', '#EXTM3U\nArtist - Song One.mp3\nArtist - Song Two.mp3\n');
write('media/Music/README.txt', 'Placeholder music library (no real audio in the fixture).\n');
write('media/Videos/README.txt', 'Placeholder video library (no real video in the fixture).\n');

// Documents volume.
write(
  'documents/Work/Reports/q3-report.md',
  '# Q3 report\n\n- Revenue: stable\n- Projects shipped: 4\n- Next: Canopy v1\n',
);
write(
  'documents/Work/Reports/budget.csv',
  'month,income,expenses\njan,4200,3100\nfeb,4300,2900\nmar,4100,3500\n',
);
write('documents/Work/Notes/meeting-2024-10-02.txt', 'Agenda:\n1. Roadmap\n2. Hiring\n3. AOB\n');
write('documents/Personal/recipes/crepes.md', '# Crêpes\n\n250 g farine, 4 œufs, 50 cl lait.\n');
write('documents/Personal/taxes/2024.txt', 'Tax documents placeholder.\n');
write('documents/README.md', '# Documents\n\nFake documents for Canopy development.\n');

// Shared volume with nested folders and an empty one.
write('shared/Family/shopping-list.txt', 'Milk\nBread\nApples\n');
write('shared/Family/Photos/birthday.png', png(40, [250, 150, 160]));
write(
  'shared/Projects/canopy/notes.json',
  JSON.stringify({ todo: ['grants', 'listing'] }, null, 2),
);
write('shared/Projects/canopy/src/main.go', 'package main\n\nfunc main() {}\n');
mkdirSync(join(root, 'shared/Empty folder'), { recursive: true });
write('shared/Empty folder/.keep', '');

// Backups volume: a big flat folder for pagination and sorting.
for (let i = 1; i <= 240; i += 1) {
  const day = String((i % 28) + 1).padStart(2, '0');
  write(
    `backups/daily/backup-2024-${String((i % 12) + 1).padStart(2, '0')}-${day}-${String(i).padStart(3, '0')}.log`,
    `backup ${String(i)} ok\n`.repeat((i % 7) + 1),
  );
}

console.log(`fake tree written to ${root}`);
