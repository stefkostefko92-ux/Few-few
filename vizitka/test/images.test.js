// Махането на метаданните от снимките (src/images.js) — недоверен двоичен вход с ръчно смятане на
// отместванията. Целта е GPS/EXIF да не стигнат до публичната визитка и vCard (чл. 5(1)(в) ОРЗД),
// а повреден файл да не свали процеса и да не завърти безкраен цикъл.
// (Изпитателя, класиране по риск 21.11.2026 — V2, юнит частта.)
import assert from 'node:assert/strict';
import { prepareUpload, stripMetadata, sniffImage } from '../src/images.js';

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failures++;
    console.error(`✘ ${name}\n  ${err.message}`);
  }
}

const GPS = 'GPS 42.6977 23.3219';
const has = (buf, s) => buf.includes(Buffer.from(s, 'latin1'));

// ── PNG ─────────────────────────────────────────────────────────────────────────
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]); // CRC не се проверява
}
const png = () =>
  Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', Buffer.alloc(13, 1)),
    pngChunk('eXIf', Buffer.from(`MM ${GPS}`, 'latin1')),
    pngChunk('tEXt', Buffer.from(`Comment\0${GPS}`, 'latin1')),
    pngChunk('IDAT', Buffer.alloc(20, 7)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);

/** Обхожда chunk-овете на PNG: връща типовете и дали веригата стига точно до края. */
function pngTypes(buf) {
  const types = [];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    types.push(buf.toString('ascii', i + 4, i + 8));
    i += 12 + len;
  }
  return { types, exact: i === buf.length };
}

await test('PNG: eXIf и tEXt (с GPS) се махат; подписът и веригата до IEND са цели', () => {
  const out = stripMetadata(png(), 'png');
  assert.ok(out.subarray(0, 8).equals(PNG_SIG));
  assert.ok(!has(out, 'GPS'), 'GPS остана');
  const { types, exact } = pngTypes(out);
  assert.deepEqual(types, ['IHDR', 'IDAT', 'IEND']);
  assert.ok(exact, 'веригата не стига точно до края');
});

await test('PNG, прекъснат в средата на chunk: без изключение', () => {
  const cut = png().subarray(0, 40);
  assert.doesNotThrow(() => stripMetadata(cut, 'png'));
});

// ── WebP ────────────────────────────────────────────────────────────────────────
function riffChunk(fourcc, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(data.length);
  const pad = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(fourcc, 'ascii'), len, data, pad]);
}
function webp(chunks) {
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(body.length + 4, 4);
  head.write('WEBP', 8, 'ascii');
  return Buffer.concat([head, body]);
}

await test('WebP: EXIF и XMP се махат; RIFF размерът е пренаписан; нечетните chunk-ове пазят подравняването', () => {
  const src = webp([
    riffChunk('VP8X', Buffer.alloc(10, 2)),
    riffChunk('EXIF', Buffer.from(`${GPS}!`, 'latin1')), // нечетна дължина → подравняване
    riffChunk('XMP ', Buffer.from(`<x>${GPS}</x>`, 'latin1')),
    riffChunk('VP8 ', Buffer.alloc(31, 9)), // нечетна
  ]);
  const out = stripMetadata(src, 'webp');
  assert.ok(!has(out, 'GPS'), 'GPS остана');
  assert.ok(!has(out, 'EXIF') && !has(out, 'XMP '));
  assert.equal(out.readUInt32LE(4), out.length - 8, 'RIFF размерът');
  assert.ok(has(out, 'VP8X') && has(out, 'VP8 '));
  assert.equal(out.length % 2, 0, 'подравняването на четно е запазено');
});

await test('WebP chunk над края на буфера: без изключение', () => {
  const bad = webp([riffChunk('VP8 ', Buffer.alloc(8))]);
  bad.writeUInt32LE(9999, 16); // дължина на chunk-а далеч след края
  assert.doesNotThrow(() => stripMetadata(bad, 'webp'));
});

// ── JPEG ────────────────────────────────────────────────────────────────────────
const seg = (marker, data) => {
  const len = Buffer.alloc(2);
  len.writeUInt16BE(data.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), len, data]);
};
const SCAN = Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9]);

await test('JPEG: APP1 (EXIF/XMP с GPS) и COM се махат; APP0 остава; потокът от SOS нататък е байт по байт', () => {
  const src = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from('JFIF\0\x01\x01', 'latin1')),
    seg(0xe1, Buffer.from(`Exif\0\0${GPS}`, 'latin1')),
    seg(0xfe, Buffer.from(`comment ${GPS}`, 'latin1')),
    SCAN,
  ]);
  const out = stripMetadata(src, 'jpg');
  assert.ok(!has(out, 'GPS'), 'GPS остана');
  assert.ok(has(out, 'JFIF'), 'APP0 изчезна');
  assert.ok(out.subarray(out.length - SCAN.length).equals(SCAN), 'потокът след SOS е променен');
});

await test('JPEG със сегмент с дължина < 2 или без SOS: без безкраен цикъл и без изключение', () => {
  const zeroLen = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x00]),
    Buffer.alloc(20),
  ]);
  const noSos = Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.alloc(5))]);
  for (const b of [zeroLen, noSos]) assert.doesNotThrow(() => stripMetadata(b, 'jpg'));
});

// ── Входът ──────────────────────────────────────────────────────────────────────
await test('prepareUpload: HTML, твърде къс файл и GIF не са позволени изображения', () => {
  assert.equal(prepareUpload(Buffer.from('<html><script>alert(1)</script></html>')), null);
  assert.equal(prepareUpload(Buffer.from([0x89, 0x50, 0x4e])), null);
  assert.equal(prepareUpload(Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00', 'latin1')), null);
  assert.equal(sniffImage(null), null);
});

await test('prepareUpload: PNG се разпознава и се връща без метаданни', () => {
  const r = prepareUpload(png());
  assert.equal(r.ext, 'png');
  assert.ok(!has(r.buffer, 'GPS'));
});

if (failures) {
  console.error(`\n${failures} провалени теста`);
  process.exit(1);
}
console.log('\nМетаданните на снимките: всички тестове минаха.');
