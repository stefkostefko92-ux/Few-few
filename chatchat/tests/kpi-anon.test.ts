import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cell, partition, rate } from '../src/services/kpi/anon.js';
import { latestEvalReport } from '../src/services/kpi/evals.js';

/** k-анонимността на KPI (§16.1): малки клетки, дялове, вторично скриване в разбивките. */

describe('KPI k-анонимност', () => {
  test('клетка: 0 и ≥5 се показват, 1…4 → „<5“', () => {
    assert.deepEqual([0, 1, 4, 5, 120].map(cell), [0, '<5', '<5', 5, 120]);
  });

  test('дял: скрит числител или знаменател под 5 → без стойност', () => {
    assert.deepEqual(rate(7, 20), { num: 7, den: 20, value: 0.35 });
    assert.deepEqual(rate(2, 20), { num: '<5', den: 20, value: null });
    assert.deepEqual(rate(0, 3), { num: 0, den: '<5', value: null });
    assert.deepEqual(rate(0, 0), { num: 0, den: 0, value: null });
    assert.deepEqual(rate('<5', 40), { num: '<5', den: 40, value: null });
  });

  test('една скрита клетка в разбивка → скрива се и най-малката видима', () => {
    assert.deepEqual(partition({ a: 3, b: 7, c: 20 }), { a: '<5', b: '<5', c: 20 });
  });

  test('скрити единици (сборът ги издава) → още една; нееднозначен сбор → стоп', () => {
    assert.deepEqual(partition({ a: 1, b: 1, c: 9, d: 30 }), {
      a: '<5',
      b: '<5',
      c: '<5',
      d: 30,
    });
    assert.deepEqual(partition({ a: 1, b: 2, c: 9 }), { a: '<5', b: '<5', c: 9 });
  });

  test('без малки клетки — нищо не се скрива; нулите остават', () => {
    assert.deepEqual(partition({ a: 0, b: 5, c: 6 }), { a: 0, b: 5, c: 6 });
  });
});

describe('KPI отчет на оценъчния набор', () => {
  test('без папка или липсваща папка → null', async () => {
    assert.equal(await latestEvalReport(''), null);
    assert.equal(await latestEvalReport('/nonexistent/chatchat-evals'), null);
  });
});
