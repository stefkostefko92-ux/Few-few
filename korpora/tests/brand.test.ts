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
