// A saved calculation is reproducible: the same values give the same canonical snapshot and the same hash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PRESETS } from '@/calc/presets';
import { ENGINE_VERSION, canon, snapshotOf } from '@/calc/snapshot';
import { PROFILO } from '@/calc/norme';

const hash = (x: unknown): string => createHash('sha256').update(JSON.stringify(canon(x))).digest('hex');

test('snapshot deterministico con versione del motore e profilo', () => {
  for (const k of ['A', 'B', 'C'] as const) {
    const a = snapshotOf(PRESETS[k]), b = snapshotOf({ ...PRESETS[k] });
    assert.equal(hash(a), hash(b), k);
    assert.equal(a.engine, ENGINE_VERSION);
    assert.equal(a.profile, PROFILO.id);
  }
});

test('ogni valore conta nel hash', () => {
  const base = hash(snapshotOf(PRESETS.B));
  assert.notEqual(hash(snapshotOf({ ...PRESETS.B, Q: 640 })), base, 'dato diverso');
  assert.notEqual(hash({ ...snapshotOf(PRESETS.B), engine: '9.9.9' }), base, 'motore diverso');
});

test('i risultati salvati sono JSON puro (niente funzioni, niente non finiti come numeri)', () => {
  const s = snapshotOf(PRESETS.B);
  const text = JSON.stringify(s);
  assert.ok(!text.includes('null,null,null'), 'nessun buco');
  assert.deepEqual(JSON.parse(text), s);
  assert.equal((s.results.res as { stall: { ratio: unknown } }).stall.ratio, 'Infinity', 'Infinity come stringa');
});
