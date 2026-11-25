import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/http/app.js';
import { MemoryStore } from '../src/store/memory.js';
import { MemoryOwnerStore } from '../src/auth/owner-store.js';
import { hashPassword } from '../src/auth/password.js';
import { generateTotpSecret, totpCodeAt, totpStep } from '../src/auth/totp.js';
import { encryptSecret } from '../src/auth/crypto.js';
import type { AppConfig } from '../src/config.js';

// Тестовите тайни се сглобяват в runtime (secret-scan).
const fake = (label: string): string => ['t', label, 'x'.repeat(40)].join('-');
const ORIGIN = 'https://lovets.example';
const NOW = new Date('2026-11-24T10:00:00Z');
const config: AppConfig = {
  pepper: fake('pepper'),
  jwtSecret: fake('jwt'),
  totpKey: Buffer.alloc(32, 7).toString('base64'),
  appOrigin: ORIGIN,
  cookieSecure: false,
  httpPort: 0,
  trustProxy: false,
};
const OWNER_EMAIL = 'owner@lovets.example';
const OWNER_PASSWORD = fake('pass');
const TOTP = generateTotpSecret();

const logged: unknown[] = [];
let server: Server;
let base = '';
let cookie = '';
let clockSeconds = Math.floor(NOW.getTime() / 1000);

before(async () => {
  const owners = new MemoryOwnerStore();
  await owners.create({
    email: OWNER_EMAIL,
    passwordHash: await hashPassword(OWNER_PASSWORD),
    totpSecretEnc: encryptSecret(TOTP, config.totpKey),
  });
  const app = createApp({
    config,
    store: new MemoryStore(),
    owners,
    now: () => NOW,
    nowSeconds: () => clockSeconds,
    pingDb: async () => true,
    onError: (info) => logged.push(info),
  });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());

const post = (path: string, body: unknown, withCookie = true): Promise<Response> =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      ...(withCookie && cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

test('/health отговаря 200 без вход', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
});

test('без вход API-то връща 401', async () => {
  const r = await post('/api/check', { query: 'info@firma.bg' }, false);
  assert.equal(r.status, 401);
});

test('вход без валиден TOTP код не дава сесия', async () => {
  const r = await post(
    '/api/auth/login',
    { email: OWNER_EMAIL, password: OWNER_PASSWORD, code: '000000' },
    false,
  );
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('set-cookie'), null);
});

test('вход с грешна парола → 401', async () => {
  const code = totpCodeAt(TOTP, totpStep(clockSeconds));
  const r = await post(
    '/api/auth/login',
    { email: OWNER_EMAIL, password: 'грешна-парола-123', code },
    false,
  );
  assert.equal(r.status, 401);
});

test('вход с парола и TOTP → httpOnly бисквитка; кодът не минава втори път', async () => {
  const code = totpCodeAt(TOTP, totpStep(clockSeconds));
  const r = await post(
    '/api/auth/login',
    { email: OWNER_EMAIL, password: OWNER_PASSWORD, code },
    false,
  );
  assert.equal(r.status, 200);
  const set = r.headers.get('set-cookie') ?? '';
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=Strict/i);
  cookie = set.split(';')[0] ?? '';
  const again = await post(
    '/api/auth/login',
    { email: OWNER_EMAIL, password: OWNER_PASSWORD, code },
    false,
  );
  assert.equal(again.status, 401);
  clockSeconds += 30;
});

test('заявка с чужд Origin → 403 (CSRF)', async () => {
  const r = await fetch(`${base}/api/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie },
    body: JSON.stringify({ query: 'info@firma.bg' }),
  });
  assert.equal(r.status, 403);
});

test('търсачката през API: блок без КЗП, позволено след внос на снимка', async () => {
  let r = await post('/api/check', { query: 'info@firma.bg', sourceUrl: 'https://firma.bg/k' });
  assert.equal(r.status, 200);
  let body = (await r.json()) as { results: { decision: string }[] };
  assert.equal(body.results[0]?.decision, 'blocked');

  r = await post('/api/registry/kzp-snapshot', {
    takenAt: '2026-11-23T00:00:00Z',
    source: 'kzp.bg',
    text: 'drug@firma2.bg\n',
  });
  assert.equal(r.status, 200);

  r = await post('/api/check', { query: 'info@firma.bg', sourceUrl: 'https://firma.bg/k' });
  body = (await r.json()) as { results: { decision: string }[] };
  assert.equal(body.results[0]?.decision, 'allowed');
});

test('внос на резултати от RPO и износ на списък', async () => {
  let r = await post('/api/registry/results', {
    registry: 'RPO',
    checkedAt: '2026-11-22T00:00:00Z',
    source: 'rpo-portale',
    csv: '0212345678;no\n0233333333;si',
  });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { imported: 2, errors: [] });

  r = await post('/api/check', {
    query: '+39 02 1234 5678',
    sourceUrl: 'https://paginebianche.example/x',
    phoneSource: 'public_directory',
  });
  const body = (await r.json()) as { results: { decision: string }[] };
  assert.equal(body.results[0]?.decision, 'allowed');

  r = await post('/api/registry/rpo-export', { numbers: ['+39 02 1234 5678'], format: 'national' });
  assert.equal(await r.text(), '0212345678\n');
});

test('проверка с дата в бъдещето се отказва', async () => {
  const r = await post('/api/registry/results', {
    registry: 'RPO',
    checkedAt: '2027-01-01T00:00:00Z',
    source: 'x',
    csv: '0212345678;no',
  });
  assert.equal(r.status, 400);
});

test('„не ме търсете“ през API блокира', async () => {
  let r = await post('/api/suppressions', {
    value: 'ivan@firma3.bg',
    scope: 'domain',
    reason: 'възражение по телефона',
  });
  assert.equal(r.status, 200);
  r = await post('/api/check', { query: 'maria@firma3.bg', sourceUrl: 'https://firma3.bg' });
  const body = (await r.json()) as { results: { decision: string }[] };
  assert.equal(body.results[0]?.decision, 'blocked');
});

test('невалиден вход → 400 със zod', async () => {
  const r = await post('/api/check', { query: 5 });
  assert.equal(r.status, 400);
});

test('съгласие през API отключва италиански имейл', async () => {
  const q = { query: 'mario@ditta.it', sourceUrl: 'https://ditta.it' };
  let r = await post('/api/check', q);
  assert.equal(
    ((await r.json()) as { results: { decision: string }[] }).results[0]?.decision,
    'blocked',
  );
  r = await post('/api/consents', {
    value: 'mario@ditta.it',
    channel: 'email',
    market: 'IT',
    givenAt: '2026-11-23T09:00:00Z',
    method: 'устно по телефона',
    wording: 'Да, пратете ми офертата по имейл.',
  });
  assert.equal(r.status, 200);
  r = await post('/api/check', q);
  assert.equal(
    ((await r.json()) as { results: { decision: string }[] }).results[0]?.decision,
    'allowed',
  );
});

test('снимка с грешен ред се отказва цяла; рязко по-малка иска потвърждение', async () => {
  let r = await post('/api/registry/kzp-snapshot', {
    takenAt: '2026-11-23T12:00:00Z',
    source: 'kzp.bg',
    text: 'Петров;ivan@drug.bg\nok@drug.bg\n',
  });
  assert.equal(r.status, 400);
  const big = Array.from({ length: 10 }, (_, i) => `a${i}@drug.bg`).join('\n');
  r = await post('/api/registry/kzp-snapshot', {
    takenAt: '2026-11-23T12:00:00Z',
    source: 'kzp.bg',
    text: big,
  });
  assert.equal(r.status, 200);
  r = await post('/api/registry/kzp-snapshot', {
    takenAt: '2026-11-23T13:00:00Z',
    source: 'kzp.bg',
    text: 'a1@drug.bg',
  });
  assert.equal(r.status, 409);
  r = await post('/api/registry/kzp-snapshot', {
    takenAt: '2026-11-23T13:00:00Z',
    source: 'kzp.bg',
    text: 'a1@drug.bg',
    confirmShrink: true,
  });
  assert.equal(r.status, 200);
});

test('празна снимка на КЗП се отказва — и при първо внасяне, и с confirmShrink (иначе всички стават „не е вписан“)', async () => {
  for (const extra of [{}, { confirmShrink: true }]) {
    for (const text of ['', '\n\n  \n']) {
      const r = await post('/api/registry/kzp-snapshot', { takenAt: '2026-11-23T14:00:00Z', source: 'kzp.bg', text, ...extra });
      assert.equal(r.status, 400, JSON.stringify({ text, extra }));
    }
  }
});

test('невалиден JSON → 400 и нищо от тялото не стига до лога', async () => {
  logged.length = 0;
  const r = await fetch(`${base}/api/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie },
    body: '{"query":ivan.secret@firma.bg}',
  });
  assert.equal(r.status, 400);
  assert.ok(!JSON.stringify(logged).includes('ivan'));
});

test('изход изтрива бисквитката', async () => {
  const r = await post('/api/auth/logout', {});
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie') ?? '', /lovets_session=;/);
});

test('след изход старият токен вече не важи', async () => {
  const r = await post('/api/check', { query: 'info@firma.bg' });
  assert.equal(r.status, 401);
});
