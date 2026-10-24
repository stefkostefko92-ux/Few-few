import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { RETENTION } from '../src/content.js';
import { MAINTENANCE_QUEUE, BULL_PREFIX } from '../src/queue.js';
import { BATCH_SIZE, PURGE_TARGETS, cutoffFor, purge, type DeleteBatch } from '../src/retention.js';

test('сроковете са от CONTRACT.md §7', () => {
  assert.deepEqual(RETENTION, {
    sessionsDays: 30,
    killsDays: 90,
    casesDays: 365,
    matchesDays: 90,
  });
  assert.deepEqual(
    PURGE_TARGETS.map((target) => [target.id, target.days]),
    [
      ['sessions', 30],
      ['kills', 90],
      ['appeals', 365],
      ['reports', 365],
      ['matches', 90],
    ],
  );
});

test('партидите вървят, докато една не излезе непълна', async () => {
  const seen: Array<[string, string, number]> = [];
  const answers = [BATCH_SIZE, BATCH_SIZE, 120];
  const deleteBatch: DeleteBatch = async (target, cutoff, limit) => {
    seen.push([target, cutoff.toISOString(), limit]);
    return answers.shift() ?? 0;
  };
  const now = new Date('2026-10-24T03:17:00Z');
  const result = await purge({ id: 'kills', days: 90 }, deleteBatch, now);
  assert.deepEqual(result, {
    target: 'kills',
    cutoff: '2026-07-26T03:17:00.000Z',
    deleted: BATCH_SIZE * 2 + 120,
    batches: 3,
  });
  assert.equal(seen.length, 3);
  assert.ok(seen.every(([target, , limit]) => target === 'kills' && limit === BATCH_SIZE));
});

test('нищо за триене → една заявка, нула изтрити (идемпотентно)', async () => {
  let calls = 0;
  const result = await purge(
    { id: 'sessions', days: 30 },
    async () => {
      calls += 1;
      return 0;
    },
    new Date('2026-10-24T00:00:00Z'),
  );
  assert.equal(calls, 1);
  assert.equal(result.deleted, 0);
  assert.equal(
    cutoffFor(30, new Date('2026-10-24T00:00:00Z')).toISOString(),
    '2026-09-24T00:00:00.000Z',
  );
});

test('опашката: име без двоеточие (BullMQ 5 го отказва), ключове с префикса cs2dm:', () => {
  assert.doesNotMatch(MAINTENANCE_QUEUE, /:/);
  assert.match(BULL_PREFIX, /^cs2dm:/);
});

test('SQL-ът на чистенето трие по сроковете и не пипа отворени случаи', () => {
  const sql = readFileSync('src/data/purge-sql.ts', 'utf8');
  assert.match(sql, /FROM sessions WHERE connected_at < \$\{cutoff\} LIMIT \$\{limit\}/);
  assert.match(sql, /FROM kills WHERE at < \$\{cutoff\} LIMIT \$\{limit\}/);
  assert.match(sql, /FROM matches WHERE ended_at < \$\{cutoff\} LIMIT \$\{limit\}/);
  assert.equal((sql.match(/status <> 'OPEN' AND handled_at IS NOT NULL/g) ?? []).length, 2);
});
