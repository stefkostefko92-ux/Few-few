// The logo's pictures (scripts/brand.mjs, from brand/korpora-logo.png) and the proportion the pages give them
// (views/partials/logo.ejs): a page reserves the logo's room before it loads, so the two must agree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/paths.js';

/** Width and height of a WebP with alpha (the VP8X header: the canvas size minus one, 24 bits each). */
function webpSize(buf: Buffer): { width: number; height: number } {
  assert.equal(buf.toString('latin1', 0, 4), 'RIFF');
  assert.equal(buf.toString('latin1', 8, 12), 'WEBP');
  assert.equal(buf.toString('latin1', 12, 16), 'VP8X', 'a WebP with alpha');
  return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
}

test('the logo partial sizes the logo in the proportion of its pictures', () => {
  const partial = readFileSync(join(ROOT, 'views', 'partials', 'logo.ejs'), 'utf8');
  const match = /\(logoH \* (\d+)\) \/ (\d+)/.exec(partial);
  assert.ok(match, 'the proportion in logo.ejs');
  const ratio = Number(match[1]) / Number(match[2]);
  const srcset = [...partial.matchAll(/logo-(\d+)\.webp\?v=<%= v %> (\d+)w/g)];
  assert.deepEqual(
    srcset.map((m) => [m[1], m[2]]),
    [
      ['160', '160'],
      ['320', '320'],
      ['480', '480'],
    ],
  );
  for (const width of [160, 320, 480, 1200]) {
    const size = webpSize(readFileSync(join(ROOT, 'public', 'img', 'brand', `logo-${width}.webp`)));
    assert.equal(size.width, width);
    // the height is rounded to whole pixels: within a pixel of the proportion
    assert.ok(
      Math.abs(size.height - width / ratio) <= 1,
      `logo-${width}: ${size.width} × ${size.height}`,
    );
  }
});

/** Width, height and colour type of a PNG (the IHDR). */
function pngHeader(buf: Buffer): { width: number; height: number; colourType: number } {
  assert.equal(buf.toString('latin1', 1, 4), 'PNG');
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colourType: buf.readUInt8(25),
  };
}

test('the brand PNGs are palette images inside their byte budget, in the size the pages declare', () => {
  const img = (name: string) => readFileSync(join(ROOT, 'public', 'img', name));
  // [file, width, height, budget in bytes]: a 32-bit PNG of these was 177, 308, 250 and 85 KB
  const files: Array<[string, number, number, number]> = [
    ['brand/logo.png', 640, 211, 60_000],
    ['icon-512.png', 512, 512, 110_000],
    ['icon-192.png', 192, 192, 25_000],
    ['apple-touch-icon.png', 180, 180, 25_000],
    ['og.png', 1200, 630, 160_000],
  ];
  for (const [name, width, height, budget] of files) {
    const buf = img(name);
    assert.deepEqual(pngHeader(buf), { width, height, colourType: 3 }, name);
    assert.ok(buf.length <= budget, `${name}: ${buf.length} bytes, budget ${budget}`);
  }
  // the ICO keeps the three sizes a browser uses; 192 px is its own PNG
  const ico = img('favicon.ico');
  assert.ok(ico.length <= 16_000, `favicon.ico: ${ico.length} bytes`);
  assert.equal(ico.readUInt16LE(4), 3);
  // the link preview declares what the file is (views/partials/public-meta.ejs)
  const meta = readFileSync(join(ROOT, 'views', 'partials', 'public-meta.ejs'), 'utf8');
  assert.match(meta, /og:image:width" content="1200"/);
  assert.match(meta, /og:image:height" content="630"/);
});
