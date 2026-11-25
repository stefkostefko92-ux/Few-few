import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonical, canonicalJson, entryHash, inputHash } from '../src/ledger/chain.js';

/** Звено v2 (с отпечатъка на входа) и съвместимостта със звената v1 отпреди одита от 13.11.2026. */
const base = {
  organizationId: 'org1',
  chainIndex: 1n,
  number: '0000000001',
  typeCode: '380',
  status: 'ISSUED' as const,
  issueDate: '2026-11-13',
  payableCents: 1200n,
  vatCents: 200n,
  ublSha256: 'a'.repeat(64),
  ciiSha256: 'b'.repeat(64),
  prevHash: '0'.repeat(64),
};

test('без отпечатък на входа — точно старият запис v1 (старите звена се проверяват както преди)', () => {
  assert.ok(canonical(base).startsWith('fakturist-ledger-v1\n'));
  assert.equal(canonical(base).split('\n').length, 12);
  assert.equal(canonical({ ...base, inputSha256: null }), canonical(base));
});

test('с отпечатък на входа — v2 и друг отпечатък на звеното', () => {
  const v2 = { ...base, inputSha256: 'c'.repeat(64) };
  assert.ok(canonical(v2).startsWith('fakturist-ledger-v2\n'));
  assert.ok(canonical(v2).endsWith(`\n${'c'.repeat(64)}`));
  assert.notEqual(entryHash(v2), entryHash(base));
});

test('отпечатъкът на входа не зависи от реда на ключовете (jsonb ги пренарежда)', () => {
  const a = { buyer: { name: 'Роза', legalId: '121604974' }, lines: [{ q: '1', n: 'Хляб' }] };
  const b = { lines: [{ n: 'Хляб', q: '1' }], buyer: { legalId: '121604974', name: 'Роза' } };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(inputHash(a), inputHash(b));
  assert.equal(inputHash({ x: 1, y: undefined }), inputHash({ x: 1 }));
  assert.notEqual(inputHash(a), inputHash({ ...a, buyer: { ...a.buyer, name: 'Друг' } }));
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]), 'редът в масивите е значим');
});
