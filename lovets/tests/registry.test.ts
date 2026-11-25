import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint } from '../src/registry/fingerprint.js';
import {
  parseRegistryResults,
  parseKzpSnapshot,
  exportRpoList,
  MAX_IMPORT_LINES,
} from '../src/registry/imports.js';
import { resolveRegistryStatus } from '../src/registry/resolve.js';
import { MemoryStore } from '../src/store/memory.js';

const PEPPER = 'тестов-пипер-'.repeat(3);

test('fingerprint: стабилен, зависи от пипера, не съдържа стойността', () => {
  const a = fingerprint('info@firma.bg', PEPPER);
  assert.equal(a, fingerprint('info@firma.bg', PEPPER));
  assert.notEqual(a, fingerprint('info@firma.bg', `${PEPPER}x`));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes('firma'));
});

test('внос на резултати от RPO: нормализира номерата, разбира да/не/si/no/1/0', () => {
  const csv = [
    'numero;iscritto',
    '02 1234 5678;si',
    '+39 347 123 4567;no',
    '06-7654321;1',
    'боклук;да',
    '0331234567;може би',
  ].join('\n');
  const r = parseRegistryResults(csv, 'RPO');
  assert.deepEqual(
    r.entries.map((e) => [e.value, e.listed]),
    [
      ['+390212345678', true],
      ['+393471234567', false],
      ['+39067654321', true],
    ],
  );
  assert.deepEqual(
    r.errors.map((e) => e.line),
    [5, 6],
  );
});

test('внос на резултати от КЗП: имейли и домейни', () => {
  const r = parseRegistryResults('info@firma.bg,да\nfirma2.bg,не\nне-е-адрес,да', 'KZP');
  assert.deepEqual(
    r.entries.map((e) => [e.value, e.listed]),
    [
      ['info@firma.bg', true],
      ['firma2.bg', false],
    ],
  );
  assert.equal(r.errors.length, 1);
});

test('снимка на регистъра на КЗП: всеки ред е вписан адрес или домейн', () => {
  const r = parseKzpSnapshot('Info@Firma.BG\n\nfirma3.bg\n# коментар\nboklik');
  assert.deepEqual(r.values, ['info@firma.bg', 'firma3.bg']);
  assert.equal(r.errors.length, 1);
});

test('вносът има таван на редовете', () => {
  const big = Array.from({ length: MAX_IMPORT_LINES + 2 }, (_, i) => `0${300000000 + i};no`).join(
    '\n',
  );
  assert.throws(() => parseRegistryResults(big, 'RPO'), /редове/);
});

test('износ за RPO: уникални италиански номера, без БГ и без невалидни', () => {
  const out = exportRpoList(['+390212345678', '+390212345678', '+359888123456', 'xx'], 'national');
  assert.equal(out, '0212345678\n');
  assert.equal(exportRpoList(['+393471234567'], 'e164'), '+393471234567\n');
});

const NOW = new Date('2026-11-24T10:00:00Z');

test('статус в КЗП: снимка без адреса → не е вписан към датата на снимката', async () => {
  const store = new MemoryStore();
  const taken = new Date('2026-11-20T00:00:00Z');
  await store.saveSnapshot('KZP', taken, [fingerprint('drug@firma.bg', PEPPER)], 'kzp.bg');
  const s = await resolveRegistryStatus(store, 'KZP', 'info@firma.bg', PEPPER);
  assert.deepEqual(s, { registry: 'KZP', listed: false, checkedAt: taken });
});

test('статус в КЗП: вписан домейн хваща всеки адрес на домейна', async () => {
  const store = new MemoryStore();
  await store.saveSnapshot('KZP', NOW, [fingerprint('firma.bg', PEPPER)], 'kzp.bg');
  const s = await resolveRegistryStatus(store, 'KZP', 'ivan@firma.bg', PEPPER);
  assert.equal(s?.listed, true);
});

test('статус: по-новата проверка печели, вписване винаги печели при същата дата', async () => {
  const store = new MemoryStore();
  const fp = fingerprint('+390212345678', PEPPER);
  await store.saveRegistryResults(
    'RPO',
    [{ fingerprint: fp, listed: true }],
    new Date('2026-11-01'),
    'rpo',
  );
  await store.saveRegistryResults(
    'RPO',
    [{ fingerprint: fp, listed: false }],
    new Date('2026-11-20'),
    'rpo',
  );
  let s = await resolveRegistryStatus(store, 'RPO', '+390212345678', PEPPER);
  assert.equal(s?.listed, false);
  await store.saveRegistryResults(
    'RPO',
    [{ fingerprint: fp, listed: true }],
    new Date('2026-11-20'),
    'rpo',
  );
  s = await resolveRegistryStatus(store, 'RPO', '+390212345678', PEPPER);
  assert.equal(s?.listed, true);
});

test('статус: няма данни → null (двигателят го блокира)', async () => {
  const s = await resolveRegistryStatus(new MemoryStore(), 'RPO', '+390212345678', PEPPER);
  assert.equal(s, null);
});
