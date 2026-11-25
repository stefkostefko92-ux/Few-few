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
  // 2 текат + 4 чакат = таванът на опашката (повече → отказ, виж теста за Н1).
  await Promise.all(Array.from({ length: 6 }, job));
  assert.equal(peak, 2);
});

test('освободеното място се предава на чакащия — нов викащ точно тогава не става трети', async () => {
  // Нов викащ, пристигнал след 0…8 microtask-а от освобождаването (прозорецът преди
  // събудения чакащ да тръгне), не бива да прескача (Кодаджията: старият код даваше 3).
  for (let depth = 0; depth <= 8; depth += 1) {
    let running = 0;
    let peak = 0;
    const gates: Array<() => void> = [];
    const job = () =>
      withImageSlot(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise<void>((r) => gates.push(r));
        running -= 1;
      });
    const jobs = [job(), job(), job()];
    await new Promise((r) => setImmediate(r));
    gates.shift()!();
    let hop: Promise<void> = Promise.resolve();
    for (let i = 0; i < depth; i += 1) hop = hop.then(() => undefined);
    jobs.push(hop.then(() => job()));
    while (jobs.length > 0) {
      await new Promise((r) => setImmediate(r));
      while (gates.length > 0) gates.shift()!();
      await Promise.race([Promise.all(jobs).then(() => jobs.splice(0)), new Promise((r) => setImmediate(r))]);
    }
    assert.ok(peak <= 2, `depth ${depth}: peak ${peak}`);
  }
});

test('името на наш /media файл: само собствените (за безопасно триене)', () => {
  assert.equal(mediaFileName('/media/avatar-0123456789abcdef01234567.webp'), 'avatar-0123456789abcdef01234567.webp');
  assert.equal(mediaFileName('/media/bg-0123456789abcdef01234567.webp'), 'bg-0123456789abcdef01234567.webp');
  assert.equal(mediaFileName('/media/../secret'), null);
  assert.equal(mediaFileName('https://evil.example/media/avatar-x.webp'), null);
  assert.equal(mediaFileName(undefined), null);
});

test('опашката е с таван: 2 текат + 4 чакат → следващото се отказва веднага (Н1)', async () => {
  const { imageQueueFull, ImageBusyError } = await import('../image-process');
  const gates: Array<() => void> = [];
  const hold = () => withImageSlot(() => new Promise<void>((r) => gates.push(r)));
  const jobs = Array.from({ length: 6 }, hold);
  await new Promise((r) => setImmediate(r));
  assert.equal(imageQueueFull(), true);
  await assert.rejects(withImageSlot(async () => undefined), ImageBusyError);
  const big = await processImage(Buffer.alloc(10), 'avatar');
  assert.deepEqual(big, { ok: false, reason: 'busy' });
  while (gates.length > 0 || jobs.length > 0) {
    while (gates.length > 0) gates.shift()!();
    await new Promise((r) => setImmediate(r));
    if (gates.length === 0) break;
  }
  await Promise.all(jobs);
  assert.equal(imageQueueFull(), false);
});

test('най-много 1 качване в ход на потребител', async () => {
  const { withUploadLock } = await import('../image-process');
  let release!: () => void;
  const first = withUploadLock('u1', () => new Promise<string>((r) => (release = () => r('ok'))));
  assert.equal(await withUploadLock('u1', async () => 'second'), null, 'същият потребител — отказ');
  assert.equal(await withUploadLock('u2', async () => 'other'), 'other', 'друг потребител — минава');
  release();
  assert.equal(await first, 'ok');
  assert.equal(await withUploadLock('u1', async () => 'again'), 'again', 'след края — пак може');
});

test('общо ≤6 качвания в ход (място се запазва синхронно, преди тялото да се копира)', async () => {
  const { withUploadLock } = await import('../image-process');
  const gates: Array<() => void> = [];
  const held = Array.from({ length: 6 }, (_, i) => withUploadLock(`k${i}`, () => new Promise<void>((r) => gates.push(r))));
  assert.equal(await withUploadLock('k-extra', async () => 'x'), null, '7-ото — отказ веднага');
  gates.forEach((g) => g());
  await Promise.all(held);
  assert.equal(await withUploadLock('k-extra', async () => 'x'), 'x');
});
