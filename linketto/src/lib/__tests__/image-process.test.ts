import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { MAX_INPUT_PIXELS, mediaFileName, processImage, withImageSlot } from '../image-process';

// abuse-money-spec В: декомпресионна бомба и пълнене на паметта (Разбивача т. 4).

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
/** PNG само със заглавка за W×H (данните са съвсем малко) — като „бомбата“ от 0,74 MB. */
function pngHeaderOnly(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(64))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('16000×16000 PNG се отказва по заглавката (без декодиране)', async () => {
  const started = process.hrtime.bigint();
  const result = await processImage(pngHeaderOnly(16000, 16000), 'avatar');
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'too-large');
  assert.ok(ms < 500, `отне ${ms} ms — значи е декодирано`);
  assert.ok(16000 * 16000 > MAX_INPUT_PIXELS);
});

test('нормално изображение минава и става webp без EXIF', async () => {
  const input = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#3366aa' } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: 'тайна' } } })
    .toBuffer();
  const result = await processImage(input, 'bg');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const meta = await sharp(result.buffer).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.exif, undefined);
});

test('боклук → invalid', async () => {
  const result = await processImage(Buffer.from('не е изображение'), 'avatar');
  assert.deepEqual(result, { ok: false, reason: 'invalid' });
});

test('най-много 2 едновременни обработки в процеса', async () => {
  let running = 0;
  let peak = 0;
  const job = () =>
    withImageSlot(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 20));
      running -= 1;
    });
  await Promise.all(Array.from({ length: 8 }, job));
  assert.equal(peak, 2);
});

test('името на наш /media файл: само собствените (за безопасно триене)', () => {
  assert.equal(mediaFileName('/media/avatar-0123456789abcdef01234567.webp'), 'avatar-0123456789abcdef01234567.webp');
  assert.equal(mediaFileName('/media/bg-0123456789abcdef01234567.webp'), 'bg-0123456789abcdef01234567.webp');
  assert.equal(mediaFileName('/media/../secret'), null);
  assert.equal(mediaFileName('https://evil.example/media/avatar-x.webp'), null);
  assert.equal(mediaFileName(undefined), null);
});
