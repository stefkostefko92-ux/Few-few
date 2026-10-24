import './env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { UNAVAILABLE } from '../src/admin/commands.js';
import type { FetchLike } from '../src/admin/steam-openid.js';
import { translate } from '../src/i18n.js';
import { decode, fakeRepo, fixedLive, metaContent, sampleData, start } from './helpers.js';

/** База, която гърми при всяко докосване: без бисквитка на сесия панелът не я пита изобщо. */
const NO_DB = new Proxy(
  {},
  {
    get: () => {
      throw new Error('тестът не очаква заявка към базата');
    },
  },
) as PrismaClient;

function panel(steamFetch: FetchLike = async () => new Response('')) {
  return start({
    repo: fakeRepo(sampleData()),
    admin: {
      db: NO_DB,
      live: {
        ...fixedLive({ known: false }),
        snapshot: async () => ({ status: { known: false }, players: null }),
      },
      bridge: UNAVAILABLE,
      agent: UNAVAILABLE,
      steamFetch,
    },
  });
}

test('без зависимости панелът е 503 (fail closed), публичната част си работи', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const page = await app.get('/admin');
    assert.equal(page.status, 503);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(await page.text(), new RegExp(translate('bg', 'admin.error.unavailable.title')));
    const post = await fetch(`${app.base}/admin/live/say`, { method: 'POST', redirect: 'manual' });
    assert.equal(post.status, 503, 'POST под /admin стига до панела, не е 405');
    const publicPost = await fetch(`${app.base}/bg/`, { method: 'POST', redirect: 'manual' });
    assert.equal(publicPost.status, 405, 'публичната част остава само GET/HEAD');
    assert.equal((await app.get('/bg/')).status, 200);
  } finally {
    await app.close();
  }
});

test('входът: noindex, no-store, строг CSP, без inline скрипт; ключови думи с Carbon Stealth', async () => {
  const app = await panel();
  try {
    const anon = await app.get('/admin');
    assert.equal(anon.status, 303);
    assert.equal(anon.headers.get('location'), '/admin/login');
    const page = await app.get('/admin/login', { 'accept-language': 'en-GB,en;q=0.9' });
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.match(page.headers.get('content-security-policy') ?? '', /script-src 'self' 'nonce-/);
    const html = await page.text();
    assert.equal(metaContent(html, 'name', 'robots'), 'noindex, nofollow');
    const keywords = (metaContent(html, 'name', 'keywords') ?? '').split(',').map((k) => k.trim());
    assert.ok(keywords.length >= 5 && keywords.includes('Carbon Stealth'));
    assert.match(html, /href="\/admin\/login\/steam"/);
    assert.ok(decode(html).includes(translate('en', 'admin.login.button')), 'езикът от браузъра');
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'нула inline скриптове');
    assert.doesNotMatch(html, /\sstyle=/, 'нула inline стилове');
    const denied = await (await app.get('/admin/login?e=denied')).text();
    assert.ok(decode(denied).includes(translate('bg', 'admin.login.error.denied')));
  } finally {
    await app.close();
  }
});

test('към Steam: еднократен nonce в __Host- бисквитка (HttpOnly, Secure, SameSite=Lax)', async () => {
  const app = await panel();
  try {
    const go = await app.get('/admin/login/steam');
    assert.equal(go.status, 302);
    const target = new URL(go.headers.get('location') ?? '');
    assert.equal(target.origin, 'https://steamcommunity.com');
    const returnTo = new URL(target.searchParams.get('openid.return_to') ?? '');
    assert.equal(
      `${returnTo.origin}${returnTo.pathname}`,
      'https://cs2.carbonstealth.eu/admin/login/return',
    );
    const cookie = go.headers.get('set-cookie') ?? '';
    assert.match(cookie, /^__Host-cs2dm_oid=[A-Za-z0-9_-]{32};/);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.doesNotMatch(cookie, /Domain=/i);
    assert.equal(cookie.split(';')[0]?.split('=')[1], returnTo.searchParams.get('n'));
  } finally {
    await app.close();
  }
});

test('връщане без бисквитката или с повреден отговор → отказ без сесия', async () => {
  let steamCalls = 0;
  const app = await panel(async () => {
    steamCalls += 1;
    return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');
  });
  try {
    const noCookie = await app.get('/admin/login/return?n=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    assert.equal(noCookie.headers.get('location'), '/admin/login?e=expired');
    const go = await app.get('/admin/login/steam');
    const cookie = (go.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const nonce = cookie.split('=')[1] ?? '';
    const forged = await app.get(`/admin/login/return?n=${nonce}&openid.mode=id_res`, { cookie });
    assert.equal(forged.headers.get('location'), '/admin/login?e=failed');
    assert.equal(steamCalls, 0, 'повреден отговор не стига до Steam');
    assert.doesNotMatch(forged.headers.get('set-cookie') ?? '', /cs2dm_sid=[A-Za-z0-9]/);
  } finally {
    await app.close();
  }
});

test('защитен маршрут без сесия: GET → към входа, POST → 403 (без CSRF токен)', async () => {
  const app = await panel();
  try {
    const list = await app.get('/admin/punishments');
    assert.equal(list.status, 303);
    assert.equal(list.headers.get('location'), '/admin/login');
    const post = await fetch(`${app.base}/admin/live/say`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'text=hello',
      redirect: 'manual',
    });
    assert.equal(post.status, 403);
    const fake = await app.get('/admin/login', { cookie: '__Host-cs2dm_sid=bad' });
    assert.equal(fake.status, 200, 'невалиден токен по форма → без заявка към базата');
    assert.equal((await app.get('/admin/nyama-takava')).status, 404);
  } finally {
    await app.close();
  }
});
