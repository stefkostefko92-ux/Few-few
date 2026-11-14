// The owner's logos (1 November 2026 — "use them where they fit best; legible and well visible"), encoded
// by scripts/logo/encode.mjs from scripts/logo/originals: the hexagon mark in the black bars (44 px, 1x/2x/3x)
// and on the icons, the full logo where it is large enough to read its last line. Every file the partials
// ask for exists at the size they say, with transparency; nothing else lies in public/img/brand.
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import ejs from 'ejs';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');
const PARTIALS = join(ROOT, 'views', 'partials');

/** The file on disk behind a `/static/…?v=` address. */
const fileOf = (address: string): string =>
  join(PUBLIC, address.replace(/^\/static\//, '').replace(/\?.*$/, ''));

const render = (partial: string, locals: Record<string, unknown> = {}): Promise<string> =>
  ejs.renderFile(join(PARTIALS, partial), {
    v: 'test',
    t: (key: string) =>
      key === 'app.logo' ? 'Rilievi Impianti, piattaforma tecnica ascensori' : key,
    ...locals,
  });

const attribute = (html: string, name: string): string =>
  html.match(new RegExp(` ${name}="([^"]*)"`))?.[1] ?? '';

/** The `srcset` as [address, descriptor] pairs. */
const candidates = (html: string): [string, string][] =>
  attribute(html, 'srcset')
    .split(', ')
    .map((part) => part.split(' ') as [string, string]);

describe('the mark in the bars', () => {
  it('is a 44 px picture, not an SVG, with its 2x and 3x on disk', async () => {
    const html = await render('brandmark.ejs');
    assert.match(html, /^<img class="brand__mark" /);
    assert.ok(!/<svg/.test(html));
    assert.equal(attribute(html, 'alt'), '', 'the name beside it is text');
    const width = Number(attribute(html, 'width'));
    assert.equal(attribute(html, 'height'), '44');
    const one = await sharp(fileOf(attribute(html, 'src'))).metadata();
    assert.deepEqual([one.width, one.height, one.hasAlpha], [width, 44, true]);
    for (const [address, density] of candidates(html)) {
      const k = Number(density.replace('x', ''));
      const meta = await sharp(fileOf(address)).metadata();
      assert.equal(meta.height, 44 * k, address);
      assert.ok(Math.abs(meta.width! - width * k) <= 1, `${address}: ${meta.width} px wide`);
      assert.ok(meta.hasAlpha, `${address}: no transparency`);
    }
    assert.deepEqual(
      candidates(html).map(([, d]) => d),
      ['2x', '3x'],
    );
  });
});

describe('the full logo', () => {
  it('lists every width it has, each on disk at that width and in the proportions of the original', async () => {
    const html = await render('logo.ejs', { classe: 'hero__logo', sizes: '440px' });
    assert.match(html, /^<img class="logo hero__logo" /);
    assert.equal(attribute(html, 'sizes'), '440px');
    assert.equal(attribute(html, 'alt'), 'Rilievi Impianti, piattaforma tecnica ascensori');
    assert.ok(!/ loading=/.test(html), 'eager unless asked');
    const ratio = Number(attribute(html, 'width')) / Number(attribute(html, 'height'));
    const src = await sharp(fileOf(attribute(html, 'src'))).metadata();
    assert.deepEqual([src.width, src.height], [720, 267]);
    for (const [address, descriptor] of candidates(html)) {
      const meta = await sharp(fileOf(address)).metadata();
      assert.equal(`${meta.width}w`, descriptor, address);
      assert.ok(Math.abs(meta.width! / ratio - meta.height!) <= 1, `${address}: other proportions`);
      assert.ok(meta.hasAlpha, `${address}: no transparency`);
    }
    // The last line ("Piattaforma tecnica ascensori") is about 6.5 % of the height: the smallest file must
    // still be the 1x of a place at least 360 px wide — none of the pages shows it smaller than 320.
    assert.equal(candidates(html)[0]![1], '360w');
  });

  it('waits below the first screen when asked', async () => {
    assert.match(await render('logo.ejs', { pigro: true }), / loading="lazy"/);
  });
});

describe('the brand files', () => {
  it('leaves nothing in public/img/brand that the partials do not ask for', async () => {
    const asked = new Set<string>();
    for (const html of [await render('brandmark.ejs'), await render('logo.ejs')]) {
      asked.add(attribute(html, 'src'));
      for (const [address] of candidates(html)) asked.add(address);
    }
    const names = [...asked].map((address) => fileOf(address).split('/').pop()).sort();
    assert.deepEqual(readdirSync(join(PUBLIC, 'img', 'brand')).sort(), names);
  });

  it('gives square tab icons with the mark on transparency, and the icons for the phone and links', async () => {
    for (const size of [32, 192]) {
      const file = join(PUBLIC, 'img', `favicon-${size}.png`);
      const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
      assert.deepEqual([info.width, info.height, info.channels], [size, size, 4], file);
      assert.equal(data[3], 0, `${file}: the corner is not transparent`);
    }
    const touch = await sharp(join(PUBLIC, 'img', 'apple-touch-icon.png')).metadata();
    assert.deepEqual([touch.width, touch.height], [180, 180]);
    const og = await sharp(join(PUBLIC, 'img', 'og.png')).metadata();
    assert.deepEqual([og.width, og.height], [1200, 630]);
    assert.ok(!existsSync(join(PUBLIC, 'img', 'favicon.svg')), 'the old SVG icon is gone');
  });

  it('keeps the originals as the owner sent them', () => {
    for (const name of ['logo.png', 'mark.png'])
      assert.ok(existsSync(join(ROOT, 'scripts', 'logo', 'originals', name)), name);
  });
});
