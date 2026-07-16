// Тестове за IndexNow помощниците (чисти, без мрежа).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estraiUrl, costruisciPayload } from '../src/indexnow.js';

test('estraiUrl: вади всички <loc> адреси от sitemap', () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://x.it/index.html</loc><lastmod>2026-07-13</lastmod></url>
    <url><loc>https://x.it/a.html</loc></url>
    <url><loc> https://x.it/b.html </loc></url>
  </urlset>`;
  assert.deepEqual(estraiUrl(xml), ['https://x.it/index.html', 'https://x.it/a.html', 'https://x.it/b.html']);
});

test('estraiUrl: празен/без loc → празен масив', () => {
  assert.deepEqual(estraiUrl(''), []);
  assert.deepEqual(estraiUrl('<urlset></urlset>'), []);
});

test('costruisciPayload: host + keyLocation от siteUrl', () => {
  const p = costruisciPayload('https://ospedalitrasparenti.it', 'abc123', ['https://ospedalitrasparenti.it/x.html']);
  assert.equal(p.host, 'ospedalitrasparenti.it');
  assert.equal(p.key, 'abc123');
  assert.equal(p.keyLocation, 'https://ospedalitrasparenti.it/abc123.txt');
  assert.deepEqual(p.urlList, ['https://ospedalitrasparenti.it/x.html']);
});

test('costruisciPayload: троши се коректно и при завършващ /', () => {
  const p = costruisciPayload('https://x.it/', 'k', []);
  assert.equal(p.keyLocation, 'https://x.it/k.txt');
});
