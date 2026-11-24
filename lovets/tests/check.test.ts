import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkContact } from '../src/check/service.js';
import { detectQuery } from '../src/check/detect.js';
import { fingerprint } from '../src/registry/fingerprint.js';
import { MemoryStore } from '../src/store/memory.js';

const PEPPER = 'тестов-пипер-'.repeat(3);
const NOW = new Date('2026-11-24T10:00:00Z');
const deps = (store: MemoryStore) => ({ store, pepper: PEPPER, now: () => NOW });
const SRC = 'https://firma.example/kontakti';

test('detectQuery разпознава вида и пазара', () => {
  assert.deepEqual(detectQuery('info@firma.bg'), { channel: 'email', markets: ['BG'] });
  assert.deepEqual(detectQuery('info@ditta.it'), { channel: 'email', markets: ['IT'] });
  assert.deepEqual(detectQuery('info@firma.com'), { channel: 'email', markets: ['BG', 'IT'] });
  assert.deepEqual(detectQuery('+39 02 1234 5678'), { channel: 'phone', markets: ['IT'] });
  assert.deepEqual(detectQuery('https://www.linkedin.com/in/x')?.channel, 'linkedin');
  assert.deepEqual(detectQuery('https://firma.bg/kontakti'), { channel: 'form', markets: ['BG'] });
  assert.equal(detectQuery('просто текст'), null);
});

test('търсачката: БГ адрес без проверка в КЗП → блок; след внос на снимка → позволено', async () => {
  const store = new MemoryStore();
  let [v] = await checkContact({ query: 'info@firma.bg', sourceUrl: SRC }, deps(store));
  assert.equal(v?.decision, 'blocked');
  await store.saveSnapshot('KZP', new Date('2026-11-23'), [fingerprint('other.bg', PEPPER)], 'kzp');
  [v] = await checkContact({ query: 'info@firma.bg', sourceUrl: SRC }, deps(store));
  assert.equal(v?.decision, 'allowed');
});

test('търсачката: „не ме търсете“ по домейн блокира всеки адрес на домейна', async () => {
  const store = new MemoryStore();
  await store.addSuppression(fingerprint('firma.bg', PEPPER), 'domain', 'възражение');
  const [v] = await checkContact({ query: 'ivan@firma.bg', sourceUrl: SRC }, deps(store));
  assert.equal(v?.decision, 'blocked');
  assert.ok(v?.reasons.some((r) => r.code === 'suppressed'));
});

test('търсачката: ИТ номер с проверка в RPO и от указател → позволено', async () => {
  const store = new MemoryStore();
  await store.saveRegistryResults(
    'RPO',
    [{ fingerprint: fingerprint('+390212345678', PEPPER), listed: false }],
    new Date('2026-11-22'),
    'rpo',
  );
  const [v] = await checkContact(
    { query: '+39 02 1234 5678', sourceUrl: SRC, phoneSource: 'public_directory' },
    deps(store),
  );
  assert.equal(v?.decision, 'allowed');
});

test('търсачката: ИТ имейл със записано съгласие → позволено', async () => {
  const store = new MemoryStore();
  await store.addConsent(fingerprint('mario@ditta.it', PEPPER), {
    channel: 'email',
    givenAt: new Date('2026-11-20'),
    withdrawnAt: null,
    method: 'устно по телефона',
    wording: 'Съгласен съм да получа оферта по имейл.',
  });
  const [v] = await checkContact({ query: 'Mario@Ditta.it', sourceUrl: SRC }, deps(store));
  assert.equal(v?.decision, 'allowed');
});

test('търсачката: адрес без ясен пазар → присъда и за двата', async () => {
  const r = await checkContact(
    { query: 'info@firma.com', sourceUrl: SRC },
    deps(new MemoryStore()),
  );
  assert.deepEqual(
    r.map((v) => v.market),
    ['BG', 'IT'],
  );
});

test('търсачката: неразпознат вход → празен списък', async () => {
  assert.deepEqual(await checkContact({ query: 'здравей' }, deps(new MemoryStore())), []);
});
