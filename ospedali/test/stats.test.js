// Пин-тестове за споделените статистически помощници (`src/lib/stats.js`).
//
// Целта е да ЗАМРАЗЯТ текущото поведение на median/percentile/robustZ, за да не
// регресира при бъдещ рефактор. Launch данните (`data/segnalazioni.json`,
// `data/forensics.json`) зависят точно от тези числа.
//
// БЕЛЕЖКА: `percentile` е по КОНСЕРВАТИВНА семантика (nearest-rank, горен вариант,
// индекс = floor((p/100)*n)) → P90(1..10) дава 10. Това е УМИШЛЕН методологичен
// избор (виж дългия коментар в src/lib/stats.js): по-висок праг → по-малко флагнати
// структури, съвместимо с „точност > покритие". НЕ е bug — не го сменяй към класическа
// интерполация без изрично решение (би вдигнало флаговете 187→205).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, percentile, robustZ } from '../src/lib/stats.js';

test('median — нечетна/четна дължина, ред без значение, празен', () => {
  assert.equal(median([3, 1, 2]), 2); // нечетна → средният елемент
  assert.equal(median([1, 2, 3, 4]), 2.5); // четна → средно на двата средни
  assert.equal(median([10, 2, 8, 4, 6]), 6);
  assert.equal(median([5]), 5);
  assert.equal(median([]), null);
});

test('percentile — консервативна nearest-rank семантика (документиран избор)', () => {
  // P90 на 1..10 връща 10 (индекс floor(0.9*10)=9) — по-висок праг, по-малко флагове.
  // Умишлено; виж бележката в src/lib/stats.js.
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 10);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 6); // floor(0.5*10)=5 → s[5]=6
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0), 1); // floor(0)=0 → s[0]
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 100), 10); // клипва до n-1
  assert.equal(percentile([5], 50), 5);
  assert.equal(percentile([], 90), null);
});

test('robustZ — устойчив z-score чрез медиана и MAD', () => {
  // med=10, mad=2 → 1.4826*2 ≈ 2.965; (20-10)/2.965 ≈ 3.37
  const z = robustZ(20, 10, 2);
  assert.ok(z > 3 && z < 3.5, `z=${z}`);
  assert.equal(robustZ(10, 10, 2), 0); // на медианата → 0
  assert.equal(robustZ(10, 10, 0), null); // нулев MAD → без z
  assert.equal(robustZ(null, 10, 2), null); // липсваща стойност
});
