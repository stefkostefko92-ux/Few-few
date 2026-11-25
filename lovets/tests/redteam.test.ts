/**
 * Регресии от червения екип (Разбивача, 24.11.2026). Всеки тест е вход, който даваше „allowed“,
 * а трябва да е „blocked“ (или да бъде отказан при вноса).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkContact } from '../src/check/service.js';
import { detectQuery } from '../src/check/detect.js';
import { normalizeEmail, normalizePhone } from '../src/compliance/normalize.js';
import { fingerprint } from '../src/registry/fingerprint.js';
import { lookupKeys, suppressionKeys } from '../src/registry/keys.js';
import { parseKzpSnapshot, parseRegistryResults } from '../src/registry/imports.js';
import { resolveRegistryStatus } from '../src/registry/resolve.js';
import { MemoryStore } from '../src/store/memory.js';
import type { Market } from '../src/compliance/types.js';

const PEPPER = 'тестов-пипер-'.repeat(3);
const NOW = new Date('2026-11-24T10:00:00Z');
const deps = (store: MemoryStore) => ({ store, pepper: PEPPER, now: () => NOW });
const SRC = 'https://source.example/x';
const fp = (v: string): string => fingerprint(v, PEPPER);

async function suppress(
  store: MemoryStore,
  value: string,
  scope: 'value' | 'domain',
  market: Market = 'BG',
) {
  for (const k of suppressionKeys(value, scope, market))
    await store.addSuppression(fp(k), scope, 'тест');
}

async function decision(store: MemoryStore, query: string, extra: Record<string, unknown> = {}) {
  const r = await checkContact({ query, sourceUrl: SRC, ...extra }, deps(store));
  return r.map((v) => v.decision);
}

// ── 1. поддомейни и точка в края ──────────────────────────────────

test('„не ме търсете“ по домейн хваща поддомейните (имейл и форма)', async () => {
  const store = new MemoryStore();
  await store.saveSnapshot('KZP', new Date('2026-11-23'), [], 'kzp');
  await suppress(store, 'spam.bg', 'domain');
  assert.deepEqual(await decision(store, 'ivan@mail.spam.bg'), ['blocked']);
  assert.deepEqual(await decision(store, 'https://shop.spam.bg/contact'), ['blocked']);
});

test('снимка на КЗП с домейн хваща поддомейните и хост с точка в края', async () => {
  const store = new MemoryStore();
  await store.saveSnapshot('KZP', new Date('2026-11-23'), [fp('firma.bg')], 'kzp');
  assert.deepEqual(await decision(store, 'ivan@mail.firma.bg'), ['blocked']);
  assert.deepEqual(await decision(store, 'https://shop.firma.bg/contact'), ['blocked']);
  assert.deepEqual(await decision(store, 'https://firma.bg./contact'), ['blocked']);
});

test('lookupKeys не стига до TLD', () => {
  assert.deepEqual(lookupKeys('ivan@a.b.firma.bg'), [
    'ivan@a.b.firma.bg',
    'a.b.firma.bg',
    'b.firma.bg',
    'firma.bg',
  ]);
});

// ── 2. телефони в „не ме търсете“ ─────────────────────────────────

test('телефон с точки не се записва като домейн', async () => {
  const store = new MemoryStore();
  await suppress(store, '0888.123.456', 'value', 'BG');
  assert.deepEqual(await decision(store, '+359 888 123 456', { businessLineConfirmed: true }), [
    'blocked',
  ]);
});

test('национален номер без префикс се записва и за двата пазара', async () => {
  const store = new MemoryStore();
  await store.saveRegistryResults(
    'RPO',
    [{ fingerprint: fp('+39061234567'), listed: false }],
    new Date('2026-11-23'),
    'rpo',
  );
  await suppress(store, '06 1234567', 'value', 'BG');
  assert.deepEqual(await decision(store, '+39 06 1234567', { phoneSource: 'public_directory' }), [
    'blocked',
  ]);
});

// ── 3. URL канонична форма ─────────────────────────────────────────

test('„не ме търсете“ за LinkedIn профил хваща вариантите на адреса', async () => {
  const store = new MemoryStore();
  await suppress(store, 'https://www.linkedin.com/in/ivan-petrov', 'value');
  for (const q of [
    'https://www.linkedin.com/in/ivan-petrov/',
    'https://linkedin.com/in/ivan-petrov',
    'https://www.linkedin.com/in/ivan-petrov?trk=x',
    'https://bg.linkedin.com/in/Ivan-Petrov',
  ]) {
    const d = await decision(store, q);
    assert.ok(d.length > 0 && d.every((x) => x === 'blocked'), q);
  }
});

// ── 4. вносът на снимка ────────────────────────────────────────────

test('снимка с колона отпред не минава като адрес', () => {
  const r = parseKzpSnapshot('Петров;ivan@drug.bg\n1;mila@drug.bg\nok@drug.bg');
  assert.deepEqual(r.values, ['ok@drug.bg']);
  assert.equal(r.errors.length, 2);
});

test('резултат „ivan@x“ с невалиден вход става грешка, не стойност', () => {
  assert.equal(normalizeEmail('петров;ivan@drug.bg'), null);
  assert.equal(normalizeEmail('"a b"@drug.bg'), null);
});

// ── 5. по-нов резултат за друг ключ ────────────────────────────────

test('„не е вписан“ за домейн не отменя „вписан“ за адреса', async () => {
  const store = new MemoryStore();
  await store.saveRegistryResults(
    'KZP',
    [{ fingerprint: fp('ivan@treta.bg'), listed: true }],
    new Date('2026-11-20'),
    'kzp',
  );
  await store.saveRegistryResults(
    'KZP',
    [{ fingerprint: fp('treta.bg'), listed: false }],
    new Date('2026-11-21'),
    'kzp',
  );
  const s = await resolveRegistryStatus(store, 'KZP', 'ivan@treta.bg', PEPPER);
  assert.equal(s?.listed, true);
});

test('„не е вписан“ за адреса не отменя вписан домейн от снимката', async () => {
  const store = new MemoryStore();
  await store.saveSnapshot('KZP', new Date('2026-11-20'), [fp('peta.bg')], 'kzp');
  await store.saveRegistryResults(
    'KZP',
    [{ fingerprint: fp('maria@peta.bg'), listed: false }],
    new Date('2026-11-21'),
    'kzp',
  );
  const s = await resolveRegistryStatus(store, 'KZP', 'maria@peta.bg', PEPPER);
  assert.equal(s?.listed, true);
});

test('проверка само на домейна не доказва, че адресът не е вписан', async () => {
  const store = new MemoryStore();
  await store.saveRegistryResults(
    'KZP',
    [{ fingerprint: fp('chetvarta.bg'), listed: false }],
    new Date('2026-11-21'),
    'kzp',
  );
  assert.equal(await resolveRegistryStatus(store, 'KZP', 'ivan@chetvarta.bg', PEPPER), null);
});

test('по-нов „не е вписан“ за същия ключ печели (номерът е бил отписан)', async () => {
  const store = new MemoryStore();
  await store.saveRegistryResults(
    'RPO',
    [{ fingerprint: fp('+390212345678'), listed: true }],
    new Date('2026-11-10'),
    'rpo',
  );
  await store.saveRegistryResults(
    'RPO',
    [{ fingerprint: fp('+390212345678'), listed: false }],
    new Date('2026-11-20'),
    'rpo',
  );
  const s = await resolveRegistryStatus(store, 'RPO', '+390212345678', PEPPER);
  assert.equal(s?.listed, false);
});

// ── 6. канонична форма на имейла ───────────────────────────────────

test('+таг в адреса не заобикаля „не ме търсете“ и регистъра', async () => {
  const store = new MemoryStore();
  await store.saveSnapshot('KZP', new Date('2026-11-23'), [fp('ivan@drug.bg')], 'kzp');
  assert.deepEqual(await decision(store, 'ivan+promo@drug.bg'), ['blocked']);
  await suppress(store, 'petar@drug2.bg', 'value');
  assert.deepEqual(await decision(store, 'petar+x@drug2.bg'), ['blocked']);
});

test('кирилски домейн се сверява като punycode', async () => {
  const store = new MemoryStore();
  await store.saveSnapshot('KZP', new Date('2026-11-23'), [fp('xn--80apmps.bg')], 'kzp');
  assert.deepEqual(await decision(store, 'info@фирма.bg'), ['blocked']);
  const s2 = new MemoryStore();
  await s2.saveSnapshot('KZP', new Date('2026-11-23'), [], 'kzp');
  await suppress(s2, 'info@фирма.bg', 'domain');
  assert.deepEqual(await decision(s2, 'https://фирма.bg/kontakti'), ['blocked']);
});

test('невидими знаци в адреса → невалиден', () => {
  assert.equal(normalizeEmail('info@fir​ma.bg'), null);
  assert.equal(normalizeEmail('in‍fo@firma.bg'), null);
});

// ── 7. „/“ не е разделител ─────────────────────────────────────────

test('номер с „/“ е невалиден, не слят', () => {
  assert.equal(normalizePhone('06 1234567/8', 'IT'), null);
  const r = parseRegistryResults('06 1234567/8;0', 'RPO');
  assert.equal(r.entries.length, 0);
});

// ── 8. пазарът от домейна печели над избора ─────────────────────────

test('.it адрес се съди по италианските правила дори при избран пазар BG', () => {
  assert.deepEqual(detectQuery('info@ditta.it', 'BG')?.markets, ['IT']);
  assert.deepEqual(detectQuery('https://ditta.it/contatti', 'BG')?.markets, ['IT']);
});

// ── 9. каналът не се подава отвън ──────────────────────────────────

test('форма не може да се представи като LinkedIn, за да мине без КЗП', async () => {
  const store = new MemoryStore();
  const r = await checkContact(
    {
      query: 'https://firma.bg/contact',
      sourceUrl: SRC,
      market: 'BG',
      channel: 'linkedin',
    } as never,
    deps(store),
  );
  assert.deepEqual(
    r.map((v) => [v.channel, v.decision]),
    [['form', 'blocked']],
  );
});

test('италиански номер с удвоен код на страната е невалиден', () => {
  assert.equal(normalizePhone('393331234567', 'IT'), null);
  assert.equal(normalizePhone('+39 393 331 234 567', 'IT'), null);
  assert.equal(normalizePhone('+39 333 123 4567', 'IT'), '+393331234567');
});

// ── Кодаджията, преглед на PR #480 (25.11.2026) ──────────────────────────────────────────────

test('„не ме търсете“ и КЗП за www.домейн хващат и адреса без www (и обратно)', async () => {
  const store = new MemoryStore();
  await store.saveSnapshot('KZP', new Date('2026-11-23'), [], 'kzp');
  await suppress(store, 'www.spam.bg', 'domain');
  assert.deepEqual(await decision(store, 'https://www.spam.bg/kontakti'), ['blocked']);
  assert.deepEqual(await decision(store, 'https://spam.bg/kontakti'), ['blocked']);
  assert.deepEqual(await decision(store, 'ivan@spam.bg'), ['blocked']);
  const kzp = new MemoryStore();
  await kzp.saveSnapshot('KZP', new Date('2026-11-23'), [fp('firma.bg')], 'kzp');
  assert.deepEqual(await decision(kzp, 'ivan@www.firma.bg'), ['blocked']);
});

test('%40 в пътя на URL не прави адреса „имейл“ — ключовете по домейн остават', async () => {
  const store = new MemoryStore();
  await store.saveSnapshot('KZP', new Date('2026-11-23'), [], 'kzp');
  await suppress(store, 'spam.bg', 'domain');
  assert.deepEqual(await decision(store, 'https://spam.bg/kontakt%40ivan'), ['blocked']);
  const keys = lookupKeys('https://spam.bg/kontakt@ivan');
  assert.ok(keys.includes('spam.bg'), JSON.stringify(keys));
});
