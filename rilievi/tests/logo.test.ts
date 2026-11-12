import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { normalizeLogo, sniffLogo } from '../src/aziende/logo.js';

const solid = (width: number, height: number, alpha = 1) =>
  sharp({ create: { width, height, channels: 4, background: { r: 20, g: 20, b: 20, alpha } } });

describe('the company logo', () => {
  it('is recognised by its bytes, never by its name or the browser’s type', async () => {
    assert.equal(sniffLogo(await solid(10, 10).png().toBuffer()), 'png');
    assert.equal(sniffLogo(await solid(10, 10).jpeg().toBuffer()), 'jpeg');
    assert.equal(sniffLogo(await solid(10, 10).webp().toBuffer()), 'webp');
    assert.equal(sniffLogo(await solid(10, 10).gif().toBuffer()), null);
    assert.equal(sniffLogo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
    assert.equal(sniffLogo(Buffer.alloc(4)), null);
  });

  it('keeps transparency as PNG and shrinks to fit 1200×600', async () => {
    const result = await normalizeLogo(await solid(3000, 900, 0.5).png().toBuffer());
    assert.ok(result.ok);
    assert.equal(result.logo.type, 'image/png');
    assert.equal(result.logo.width, 1200);
    assert.equal(result.logo.height, 360);
    assert.equal((await sharp(result.logo.data).metadata()).hasAlpha, true);
  });

  it('turns an opaque photo into a JPEG without its EXIF metadata', async () => {
    const input = await sharp({
      create: { width: 640, height: 200, channels: 3, background: '#203040' },
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'GPS-e-segreti' } })
      .toBuffer();
    assert.ok((await sharp(input).metadata()).exif, 'the test input carries EXIF');
    const result = await normalizeLogo(input);
    assert.ok(result.ok);
    assert.equal(result.logo.type, 'image/jpeg');
    assert.equal((await sharp(result.logo.data).metadata()).exif, undefined);
    assert.ok(!result.logo.data.toString('latin1').includes('GPS-e-segreti'));
  });

  it('never enlarges a small logo', async () => {
    const result = await normalizeLogo(await solid(120, 40).png().toBuffer());
    assert.ok(result.ok);
    assert.deepEqual([result.logo.width, result.logo.height], [120, 40]);
  });

  it('refuses other formats and broken or disguised files', async () => {
    assert.deepEqual(await normalizeLogo(await solid(10, 10).gif().toBuffer()), {
      ok: false,
      error: 'type',
    });
    const png = await solid(64, 64).png().toBuffer();
    const truncated = png.subarray(0, 60);
    assert.deepEqual(await normalizeLogo(truncated), { ok: false, error: 'corrupt' });
    // A JPEG body behind a PNG signature: the decoder disagrees with the signature.
    const jpeg = await solid(64, 64).jpeg().toBuffer();
    const disguised = Buffer.concat([png.subarray(0, 8), jpeg]);
    const result = await normalizeLogo(disguised);
    assert.equal(result.ok, false);
  });
});
