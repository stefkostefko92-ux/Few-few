// The brand mark (the owner, 31 October 2026 — a picture, not an SVG): the plate rendered by scripts/logo,
// in the bars, at the sign-in and in the footer of the landing, 1x/2x/3x; the tab icons from the same
// render. Every file the partial asks for exists at the size it says, with transparency around the plate.
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import ejs from 'ejs';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');
const PARTIAL = join(ROOT, 'views', 'partials', 'brandmark.ejs');

/** The file on disk behind a `/static/…?v=` address. */
const fileOf = (address: string): string =>
  join(PUBLIC, address.replace(/^\/static\//, '').replace(/\?.*$/, ''));

const render = (locals: Record<string, unknown>): Promise<string> =>
  ejs.renderFile(PARTIAL, { v: 'test', ...locals });

describe('the brand mark', () => {
  for (const [locals, height] of [
    [{}, 36],
    [{ marchio: 48 }, 48],
    [{ marchio: 'anything else' }, 36],
  ] as const) {
    it(`is a ${height} px picture with every density on disk (${JSON.stringify(locals)})`, async () => {
      const html = await render(locals);
      assert.match(html, /^<img class="brand__mark[^"]*" /);
      assert.ok(!/<svg/.test(html), 'not an SVG');
      assert.match(
        html,
        new RegExp(`width="${Math.round(height * 1.3)}" height="${height}" alt=""`),
      );
      const addresses = [
        html.match(/ src="([^"]+)"/)![1]!,
        ...html
          .match(/ srcset="([^"]+)"/)![1]!
          .split(', ')
          .map((part) => part.split(' ')[0]!),
      ];
      assert.equal(addresses.length, 3);
      for (const [i, address] of addresses.entries()) {
        const file = fileOf(address);
        assert.ok(existsSync(file), `${file} is missing: npm run brand:logo`);
        const meta = await sharp(file).metadata();
        assert.equal(meta.height, height * (i + 1), file);
        assert.equal(meta.width, Math.round(height * (i + 1) * 1.3), file);
        assert.ok(meta.hasAlpha, `${file}: no transparency`);
      }
    });
  }

  it('leaves no file in public/img/brand that the partial does not ask for', () => {
    const asked = [36, 72, 108, 48, 96, 144].map((h) => `marchio-${h}.webp`).sort();
    assert.deepEqual(readdirSync(join(PUBLIC, 'img', 'brand')).sort(), asked);
  });

  it('gives the tab icons from the same render: square, transparent, corners empty', async () => {
    for (const size of [32, 192]) {
      const file = join(PUBLIC, 'img', `favicon-${size}.png`);
      const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
      assert.deepEqual([info.width, info.height, info.channels], [size, size, 4], file);
      assert.equal(data[3], 0, `${file}: the corner is not transparent`);
    }
    assert.ok(!existsSync(join(PUBLIC, 'img', 'favicon.svg')), 'the old SVG icon is gone');
  });
});
