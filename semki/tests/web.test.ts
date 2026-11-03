import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { sessionKey, signSession, verifySession } from '../src/web/session.js';
import { cookieJar, SECRET, startApp, USER_ID } from './helpers.js';

let app: Awaited<ReturnType<typeof startApp>>;

before(async () => {
  app = await startApp();
});
after(async () => {
  await app.close();
});

async function sessionCookie(): Promise<{ cookie: string; csrf: string }> {
  const token = await signSession(
    { sub: USER_ID, name: 'Тестер', avatar: null },
    sessionKey(SECRET),
  );
  const user = await verifySession(token, sessionKey(SECRET));
  return { cookie: `semki_session=${token}`, csrf: user?.csrf ?? '' };
}

test('health носи маркера на приложението', async () => {
  const res = await fetch(`${app.url}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { app: 'semki', status: 'ok', db: true, discord: 'ready' });
});

test('health без база е 503', async () => {
  const down = await startApp({ health: async () => ({ db: false, discord: 'connecting' }) });
  try {
    const res = await fetch(`${down.url}/health`);
    assert.equal(res.status, 503);
    assert.equal(((await res.json()) as { status: string }).status, 'error');
  } finally {
    await down.close();
  }
});

test('без сесия дашбордът води към входа', async () => {
  const res = await fetch(`${app.url}/`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/login');
});

test('страницата за вход: бутон, футър, ключови думи, CSP, noindex', async () => {
  const res = await fetch(`${app.url}/login`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Вход с Discord/);
  assert.match(
    html,
    /Created and Designed by <a href="https:\/\/carbonstealth\.eu" target="_blank" rel="noopener">/,
  );
  assert.match(html, /<meta name="keywords" content="Carbon Stealth,[^"]*"/);
  assert.equal((html.match(/<h1>/g) ?? []).length, 1);
  assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.match(res.headers.get('x-robots-tag') ?? '', /noindex/);
});

test('/auth/discord слага state бисквитка и пренасочва към Discord', async () => {
  const res = await fetch(`${app.url}/auth/discord`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  const location = new URL(res.headers.get('location') ?? '');
  assert.equal(location.hostname, 'discord.com');
  const jar = cookieJar(res);
  assert.equal(jar.get('semki_state'), location.searchParams.get('state'));
  assert.match(res.headers.getSetCookie().join('\n'), /HttpOnly/i);
});

test('callback с чужд state се отказва', async () => {
  const start = await fetch(`${app.url}/auth/discord`, { redirect: 'manual' });
  const jar = cookieJar(start);
  const res = await fetch(`${app.url}/auth/callback?code=good-code&state=chuzhd`, {
    redirect: 'manual',
    headers: { cookie: `semki_state=${jar.get('semki_state') ?? ''}` },
  });
  assert.equal(res.status, 400);
});

test('callback без state бисквитка се отказва', async () => {
  const res = await fetch(`${app.url}/auth/callback?code=good-code&state=x`, {
    redirect: 'manual',
  });
  assert.equal(res.status, 400);
});

test('POST без сесия е 401', async () => {
  const res = await fetch(`${app.url}/batches`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'seedTypeKey=ak&count=1&percent=50',
  });
  assert.equal(res.status, 401);
});

test('POST със сесия, но без CSRF токен е 403', async () => {
  const { cookie } = await sessionCookie();
  const res = await fetch(`${app.url}/batches`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    body: 'seedTypeKey=ak&count=1&percent=50',
  });
  assert.equal(res.status, 403);
});

test('POST с верен токен, но от чужд Origin е 403', async () => {
  const { cookie, csrf } = await sessionCookie();
  const res = await fetch(`${app.url}/batches`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie,
      origin: 'https://evil.example',
    },
    body: `_csrf=${encodeURIComponent(csrf)}&seedTypeKey=ak&count=1&percent=50`,
  });
  assert.equal(res.status, 403);
});

test('подправен или чужд JWT не е сесия', async () => {
  const forged = await new SignJWT({ name: 'x', avatar: null, csrf: 'c'.repeat(43) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(USER_ID)
    .setIssuer('semki')
    .setExpirationTime('1h')
    .sign(sessionKey('b'.repeat(64)));
  const res = await fetch(`${app.url}/`, {
    redirect: 'manual',
    headers: { cookie: `semki_session=${forged}` },
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/login');
});

test('robots.txt забранява всичко', async () => {
  const res = await fetch(`${app.url}/robots.txt`);
  assert.equal(await res.text(), 'User-agent: *\nDisallow: /\n');
});
