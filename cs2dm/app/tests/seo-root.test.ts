/**
 * Откриваемостта и рамката извън страниците (отделено от `seo.test.ts`): robots.txt, sitemap.xml, llms.txt,
 * пренасочванията без език, страниците за грешка и заглавките за сигурност.
 */
import './env.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { translate } from '../src/i18n.js';
import { PLAYER_ID, fakeRepo, metaContent, sampleData, start } from './helpers.js';

/** „бот/ботове“ и „bot/bots“ като дума — без „работи“, „robots“, „aimbot“, „triggerbots“. */
const BOT_WORD = /(?<![а-яё])бот|\bbots?\b/iu;

test('robots.txt, sitemap.xml с lastmod и hreflang, llms.txt', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const robots = await (await app.get('/robots.txt')).text();
    assert.match(robots, /Sitemap: https:\/\/cs2\.carbonstealth\.eu\/sitemap\.xml/);
    assert.doesNotMatch(
      robots,
      /Disallow: \/(bg|en|it)?\/?bans/,
      'noindex се вижда само ако не е забранено',
    );

    const sitemap = await (await app.get('/sitemap.xml')).text();
    assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(sitemap, /<loc>https:\/\/cs2\.carbonstealth\.eu\/bg\/<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/cs2\.carbonstealth\.eu\/it\/vip-terms<\/loc>/);
    assert.match(
      sitemap,
      new RegExp(`<loc>https://cs2\\.carbonstealth\\.eu/en/player/${PLAYER_ID}</loc>`),
    );
    assert.doesNotMatch(sitemap, /\/bans</, 'банлистът не е в sitemap');
    const urls = sitemap.match(/<url>/g) ?? [];
    assert.equal(
      urls.length,
      (sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) ?? []).length,
    );
    assert.match(sitemap, /hreflang="x-default"/);

    const llms = await (await app.get('/llms.txt')).text();
    assert.match(llms, /^# CarbonStealth\.eu \| Dust2 DM/);
    assert.match(llms, /connect dm\.carbonstealth\.eu:27015/);
    assert.match(llms, /https:\/\/carbonstealth\.eu/);
    assert.doesNotMatch(llms, BOT_WORD, 'llms.txt споменава ботове');

    const key = readFileSync('public/indexnow-key.txt', 'utf8').trim();
    assert.match(key, /^[0-9a-f]{32}$/);
    assert.equal((await (await app.get('/indexnow-key.txt')).text()).trim(), key);
    assert.equal((await (await app.get(`/${key}.txt`)).text()).trim(), key);
  } finally {
    await app.close();
  }
});

test('адреси без език водят към езиковия вариант (съобщението за бан сочи /bans)', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const root = await app.get('/', { 'accept-language': 'it-IT,it;q=0.9' });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/it/');
    const bans = await app.get('/bans?page=2', { 'accept-language': 'en' });
    assert.equal(bans.headers.get('location'), '/en/bans?page=2');
    const player = await app.get(`/player/${PLAYER_ID}`);
    assert.equal(player.headers.get('location'), `/bg/player/${PLAYER_ID}`);
    const bare = await app.get('/en');
    assert.equal(bare.status, 301);
    assert.equal(bare.headers.get('location'), '/en/');
    const slash = await app.get('/en/rules/');
    assert.equal(slash.headers.get('location'), '/en/rules');
  } finally {
    await app.close();
  }
});

test('404 и 500 са страници на езика на заявката, noindex', async () => {
  const repo = fakeRepo(sampleData());
  const app = await start({
    repo: { ...repo, vipTiers: async () => Promise.reject(new Error('паднала база')) },
  });
  try {
    const missing = await app.get('/it/nessuna-pagina');
    assert.equal(missing.status, 404);
    const html404 = await missing.text();
    assert.match(html404, /<html lang="it">/);
    assert.match(
      html404,
      new RegExp(translate('it', 'error.notFound.heading').replace(/'/g, '&#39;')),
    );
    assert.equal(metaContent(html404, 'name', 'robots'), 'noindex, follow');

    const broken = await app.get('/en/vip');
    assert.equal(broken.status, 500);
    const html500 = await broken.text();
    assert.match(html500, new RegExp(translate('en', 'error.serverError.heading')));
    assert.doesNotMatch(html500, /паднала база/, 'вътрешната грешка не стига до посетителя');
  } finally {
    await app.close();
  }
});

test('сигурност: строг CSP, без бисквитки, само GET/HEAD', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const response = await app.get('/bg/');
    const csp = response.headers.get('content-security-policy') ?? '';
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self' 'nonce-[^']+'/);
    assert.match(csp, /style-src 'self'(;|$)/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.equal(response.headers.get('set-cookie'), null, 'сайтът не слага бисквитки');
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const post = await fetch(`${app.base}/bg/`, { method: 'POST' });
    assert.equal(post.status, 405);
  } finally {
    await app.close();
  }
});
