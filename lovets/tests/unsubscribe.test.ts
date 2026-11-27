// Отписването (ОРЗД чл. 21(2)–(3), Codice чл. 130, ал. 5, d.lgs. 70/2003 чл. 9) и черновата през API-то.
// Връзката в писмото е ПУБЛИЧНА: без вход, без бисквитка, без нашия Origin (пощенски клиент и
// RFC 8058 one-click не носят нито едно). Затова е извън sameOrigin и requireOwner, а nginx пуска само
// /u/. Токенът е шифрован (AES-256-GCM) — без имейла в адреса и без запис в базата; грешен токен → 404.
// GET само показва бутона (скенерите на пощата отварят връзките); записва САМО POST.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/http/app.js';
import { MemoryStore } from '../src/store/memory.js';
import { MemoryOwnerStore } from '../src/auth/owner-store.js';
import { hashPassword } from '../src/auth/password.js';
import { generateTotpSecret, totpCodeAt, totpStep } from '../src/auth/totp.js';
import { encryptSecret } from '../src/auth/crypto.js';
import type { AppConfig } from '../src/config.js';
import { makeUnsubToken, readUnsubToken } from '../src/draft/unsubscribe.js';

const fake = (label: string): string => ['t', label, 'x'.repeat(40)].join('-');
const ORIGIN = 'https://lovets.example';
const NOW = new Date('2026-11-27T10:00:00Z');
const KEY = Buffer.alloc(32, 9).toString('base64');
const config: AppConfig = {
  pepper: fake('pepper'),
  jwtSecret: fake('jwt'),
  totpKey: Buffer.alloc(32, 7).toString('base64'),
  appOrigin: ORIGIN,
  cookieSecure: false,
  httpPort: 0,
  trustProxy: false,
  unsubKey: KEY,
  publicUrl: ORIGIN,
  noticeUrl: 'https://carbonstealth.eu/privacy/prospects',
  retentionMonths: 6,
};
const OWNER_EMAIL = 'owner@lovets.example';
const OWNER_PASSWORD = fake('pass');
const TOTP = generateTotpSecret();

let server: Server;
let base = '';
let cookie = '';
const store = new MemoryStore();

before(async () => {
  const owners = new MemoryOwnerStore();
  await owners.create({
    email: OWNER_EMAIL,
    passwordHash: await hashPassword(OWNER_PASSWORD),
    totpSecretEnc: encryptSecret(TOTP, config.totpKey),
  });
  const app = createApp({
    config,
    store,
    owners,
    now: () => NOW,
    nowSeconds: () => Math.floor(NOW.getTime() / 1000),
    pingDb: async () => true,
  });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      code: totpCodeAt(TOTP, totpStep(Math.floor(NOW.getTime() / 1000))),
    }),
  });
  assert.equal(login.status, 200);
  cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
});

after(() => server.close());

const api = (path: string, body: unknown): Promise<Response> =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie },
    body: JSON.stringify(body),
  });

test('токенът: шифрован, ≥128 бита, без стойността; подправен или с чужд ключ → null', () => {
  const fps = ['a'.repeat(64), 'b'.repeat(64)];
  const t = makeUnsubToken(fps, KEY);
  assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.ok(Buffer.from(t.split('.')[0]!, 'base64url').length * 8 >= 96, 'iv');
  assert.doesNotMatch(t, /aaaa|bbbb/);
  assert.deepEqual(readUnsubToken(t, KEY), fps);
  assert.notEqual(makeUnsubToken(fps, KEY), t, 'всяко писмо — свой токен (случаен iv)');
  const tampered = t.slice(0, -2) + (t.endsWith('A') ? 'BB' : 'AA');
  assert.equal(readUnsubToken(tampered, KEY), null);
  assert.equal(readUnsubToken(t, Buffer.alloc(32, 8).toString('base64')), null);
  assert.equal(readUnsubToken('боклук', KEY), null);
});

async function draftFor(query: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const slots = (await (
    await fetch(`${base}/api/drafts/slots?market=BG`, { headers: { cookie } })
  ).json()) as { slots: string[] };
  const res = await api('/api/drafts/first-email', {
    query,
    market: 'BG',
    sourceUrl: 'https://firma.bg/kontakti',
    seenAt: '2026-11-25T09:00:00.000Z',
    topic: 'дигитални листове за огледи',
    offer: 'Rilievi прави листовете за интервенция на телефона.',
    senderName: 'Екипът на Carbon Stealth',
    slots: slots.slots,
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test('API: черновата иска вход; без проверка в КЗП — отказ 409 с код, не писмо', async () => {
  const anon = await fetch(`${base}/api/drafts/first-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: '{}',
  });
  assert.equal(anon.status, 401);
  const r = await draftFor('info@firma.bg');
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'not_allowed');
});

test('цялата верига: КЗП чисто → чернова → POST на връзката без бисквитка и Origin → „Не може“', async () => {
  const imp = await api('/api/registry/results', {
    registry: 'KZP',
    checkedAt: '2026-11-26T10:00:00.000Z',
    source: 'КЗП, ръчна проверка',
    csv: 'value,listed\ninfo@firma.bg,false\n',
  });
  assert.equal(imp.status, 200, await imp.clone().text());
  const r = await draftFor('info@firma.bg');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const text = String(r.body.text);
  const link = text.match(/https:\/\/lovets\.example(\/u\/[A-Za-z0-9_.-]+)/);
  assert.ok(link, 'връзката е в писмото');

  const page = await fetch(`${base}${link[1]}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<form method="post"/);
  const still = await api('/api/check', {
    query: 'info@firma.bg',
    market: 'BG',
    sourceUrl: 'https://firma.bg/kontakti',
  });
  assert.equal(
    ((await still.json()) as { results: { decision: string }[] }).results[0]!.decision,
    'allowed',
    'GET не отписва',
  );

  const one = await fetch(`${base}${link[1]}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'List-Unsubscribe=One-Click',
    redirect: 'manual',
  });
  assert.equal(one.status, 200, 'без пренасочване (RFC 8058)');
  assert.equal(one.headers.get('set-cookie'), null);
  const again = await fetch(`${base}${link[1]}`, { method: 'POST', redirect: 'manual' });
  assert.equal(again.status, 200, 'повторното е 200');

  const after = await api('/api/check', {
    query: 'info@firma.bg',
    market: 'BG',
    sourceUrl: 'https://firma.bg/kontakti',
  });
  const v = (
    (await after.json()) as { results: { decision: string; reasons: { code: string }[] }[] }
  ).results[0]!;
  assert.equal(v.decision, 'blocked');
  assert.ok(v.reasons.some((x) => x.code === 'suppressed'));
  const no = await draftFor('info@firma.bg');
  assert.equal(no.status, 409, 'и нова чернова няма');
});

test('грешен или подправен токен → общ 404, нищо не се записва', async () => {
  for (const t of [
    'abc',
    'a.b.c',
    makeUnsubToken(['c'.repeat(64)], Buffer.alloc(32, 1).toString('base64')),
  ]) {
    const r = await fetch(`${base}/u/${t}`, { method: 'POST' });
    assert.equal(r.status, 404, t);
  }
  assert.equal(await store.isSuppressed(['c'.repeat(64)]), false);
});

test('автоматичният запис в „не ме търсете“ е с фиксиран код, не със свободен текст', async () => {
  const fp = 'd'.repeat(64);
  const t = makeUnsubToken([fp], KEY);
  assert.equal((await fetch(`${base}/u/${t}`, { method: 'POST' })).status, 200);
  assert.equal(store.suppressionReason(fp), 'unsubscribe_link');
});

test('nginx: целият хост е зад allowlist, публичен е само /u/<токен> и е с таван на честотата', () => {
  const conf = readFileSync(
    new URL('../deploy/nginx/lovets.carbonstealth.eu.conf', import.meta.url),
    'utf8',
  );
  const tls = conf.slice(conf.indexOf('listen 443'));
  assert.match(tls, /include \/etc\/nginx\/lovets-allow\.conf;\s*\n\s*deny all;/);
  // nginx иска регулярен израз с „{“ да е в кавички.
  const loc = tls.match(/location ~ "\^\/u\/\[A-Za-z0-9_\.-\]\{20,600\}\$" \{([\s\S]*?)\n {4}\}/);
  assert.ok(loc, 'отделен location само за токена');
  assert.match(loc[1]!, /allow all;/);
  assert.match(loc[1]!, /limit_req zone=lovets_unsub/);
  assert.match(conf, /limit_req_zone \$binary_remote_addr zone=lovets_unsub:\S+ rate=\d+r\/m;/);
});
