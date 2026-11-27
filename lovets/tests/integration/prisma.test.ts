import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/http/app.js';
import { PrismaStore } from '../../src/store/prisma.js';
import { PrismaOwnerStore } from '../../src/auth/prisma-owner-store.js';
import { hashPassword } from '../../src/auth/password.js';
import { encryptSecret } from '../../src/auth/crypto.js';
import { generateTotpSecret, totpCodeAt, totpStep } from '../../src/auth/totp.js';
import type { AppConfig } from '../../src/config.js';
import { makeUnsubToken } from '../../src/draft/unsubscribe.js';
import { fingerprint } from '../../src/registry/fingerprint.js';

/**
 * Целият поток срещу истински PostgreSQL (миграциите вече пуснати с `prisma migrate deploy`).
 * Пуска се само с TEST_DATABASE_URL, чието име съдържа _test — тестът трие таблиците.
 */
const url = process.env.TEST_DATABASE_URL ?? '';
const enabled = /_test\b|_test$/.test(new URL(url || 'postgresql://x/none').pathname);

const fake = (label: string): string => ['t', label, 'y'.repeat(40)].join('-');
const ORIGIN = 'https://lovets.example';
const config: AppConfig = {
  pepper: fake('pepper'),
  jwtSecret: fake('jwt'),
  totpKey: Buffer.alloc(32, 9).toString('base64'),
  appOrigin: ORIGIN,
  cookieSecure: false,
  httpPort: 0,
  trustProxy: false,
  unsubKey: Buffer.alloc(32, 5).toString('base64'),
  publicUrl: ORIGIN,
  noticeUrl: 'https://carbonstealth.eu/privacy/prospects',
  retentionMonths: 6,
};

let db: PrismaClient;
let server: Server;
let base = '';
let cookie = '';

before(async () => {
  if (!enabled) return;
  db = new PrismaClient({ datasourceUrl: url });
  await db.$executeRawUnsafe(
    'TRUNCATE "Owner","RegistryResult","RegistrySnapshot","RegistrySnapshotEntry","Suppression","Consent"',
  );
  const owners = new PrismaOwnerStore(db);
  const secret = generateTotpSecret();
  await owners.create({
    email: 'owner@lovets.example',
    passwordHash: await hashPassword(fake('pass')),
    totpSecretEnc: encryptSecret(secret, config.totpKey),
  });
  const app = createApp({
    config,
    store: new PrismaStore(db),
    owners,
    now: () => new Date(),
    nowSeconds: () => Math.floor(Date.now() / 1000),
    pingDb: async () => {
      await db.$queryRaw`SELECT 1`;
      return true;
    },
  });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const res = await post('/api/auth/login', {
    email: 'owner@lovets.example',
    password: fake('pass'),
    code: totpCodeAt(secret, totpStep(Math.floor(Date.now() / 1000))),
  });
  assert.equal(res.status, 200);
  cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
});

after(async () => {
  if (!enabled) return;
  server.close();
  await db.$disconnect();
});

function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function decisions(body: unknown): Promise<string[]> {
  const r = await post('/api/check', body);
  const j = (await r.json()) as { results: { decision: string }[] };
  return j.results.map((v) => v.decision);
}

test('в CI интеграционната база е задължителна', () => {
  if (process.env.CI) assert.ok(enabled, 'TEST_DATABASE_URL липсва или името няма _test');
});

test('health с истинската база', { skip: !enabled }, async () => {
  assert.equal((await fetch(`${base}/health`)).status, 200);
});

test('КЗП: блок → снимка → позволено → „не ме търсете“ → блок', { skip: !enabled }, async () => {
  const q = { query: 'info@firma.bg', sourceUrl: 'https://firma.bg/k' };
  assert.deepEqual(await decisions(q), ['blocked']);
  const snap = await post('/api/registry/kzp-snapshot', {
    takenAt: new Date(Date.now() - 86_400_000).toISOString(),
    source: 'kzp.bg',
    text: 'spam@drug.bg\nfirma-vpisana.bg\n',
  });
  assert.equal(snap.status, 200);
  assert.deepEqual(await decisions(q), ['allowed']);
  assert.deepEqual(
    await decisions({ query: 'ivan@firma-vpisana.bg', sourceUrl: 'https://firma-vpisana.bg' }),
    ['blocked'],
  );
  await post('/api/suppressions', { value: 'firma.bg', scope: 'domain', reason: 'възражение' });
  assert.deepEqual(await decisions(q), ['blocked']);
});

test('RPO: внос на резултат → позволено; вписан → блок', { skip: !enabled }, async () => {
  const r = await post('/api/registry/results', {
    registry: 'RPO',
    checkedAt: new Date(Date.now() - 86_400_000).toISOString(),
    source: 'rpo',
    csv: '0212345678;no\n0233333333;si',
  });
  assert.deepEqual(await r.json(), { imported: 2, errors: [] });
  const base = { sourceUrl: 'https://elenco.example', phoneSource: 'public_directory' };
  assert.deepEqual(await decisions({ query: '+39 02 1234 5678', ...base }), ['allowed']);
  assert.deepEqual(await decisions({ query: '+39 02 3333 333', ...base }), ['blocked']);
});

test('съгласие отключва италиански имейл', { skip: !enabled }, async () => {
  const q = { query: 'mario@ditta.it', sourceUrl: 'https://ditta.it' };
  assert.deepEqual(await decisions(q), ['blocked']);
  await post('/api/consents', {
    value: 'mario@ditta.it',
    channel: 'email',
    givenAt: new Date(Date.now() - 3_600_000).toISOString(),
    method: 'устно по телефона',
    wording: 'Да, пратете ми офертата по имейл.',
  });
  assert.deepEqual(await decisions(q), ['allowed']);
});

test('в базата няма открити адреси или номера', { skip: !enabled }, async () => {
  const dump = JSON.stringify([
    await db.registryResult.findMany(),
    await db.registrySnapshotEntry.findMany(),
    await db.suppression.findMany(),
    await db.consent.findMany(),
    await db.registrySnapshot.findMany(),
  ]);
  for (const plain of [
    'firma.bg',
    '0212345678',
    '+390212345678',
    'mario@ditta.it',
    'spam@drug.bg',
  ]) {
    assert.ok(!dump.includes(plain), plain);
  }
});

test(
  'отписване срещу истинската база: ред с фиксиран код, повторното не дублира, проверката блокира',
  { skip: !enabled },
  async () => {
    const value = 'oferta@firma-u.bg';
    const fp = fingerprint(value, config.pepper);
    const t = makeUnsubToken([fp], config.unsubKey!);
    const first = await fetch(`${base}/u/${t}`, { method: 'POST', redirect: 'manual' });
    assert.equal(first.status, 200);
    assert.equal(
      (await fetch(`${base}/u/${t}`, { method: 'POST', redirect: 'manual' })).status,
      200,
    );
    const rows = await db.suppression.findMany({ where: { fingerprint: fp } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.reason, 'unsubscribe_link');
    assert.equal(rows[0]!.scope, 'value');
    assert.deepEqual(
      await decisions({ query: value, market: 'BG', sourceUrl: 'https://firma-u.bg/k' }),
      ['blocked'],
    );
  },
);
