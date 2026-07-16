import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, percentile, robustZ, flagsBenchmark, flagsEsplosione } from '../src/forensics.js';

test('median и percentile (forensics)', () => {
  assert.equal(median([10, 2, 8, 4, 6]), 6);
  assert.equal(median([]), null);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 10);
  assert.equal(percentile([5], 50), 5);
});

test('robustZ — устойчив z-score', () => {
  // med=10, mad=2 → 1.4826*2 ≈ 2.965; (20-10)/2.965 ≈ 3.37
  const z = robustZ(20, 10, 2);
  assert.ok(z > 3 && z < 3.5, `z=${z}`);
  assert.equal(robustZ(10, 10, 0), null); // нулев MAD → без z
  assert.equal(robustZ(null, 10, 2), null);
});

test('robustZ — нормална стойност близо до 0', () => {
  const z = robustZ(10, 10, 2);
  assert.equal(z, 0);
});

// ---- Флаг-пайплайн (чистата логика зад `flagsBenchmark` / `flagsEsplosione`) ----
// Пиннат е ТЕКУЩИЯТ праг: дял над 90-и персентил И robust z>2 И материалност ≥1 mln.

/** Бенчмарк с една „скъпа" категория (beni) над P90 при малка дисперсия (MAD). */
function benchBeni() {
  return {
    beni: { label: 'Acquisti di beni', quotaMediana: 0.1, quotaP90: 0.2, quotaMad: 0.02 },
  };
}

test('flag: дял над P90 + robust z>2 + материалност ≥1 mln → outlier_quota', () => {
  // quota 0.30 срещу медиана 0.10, MAD 0.02 → z ≈ 6.7 (>2); 0.30 > P90 0.20; 5 mln > 1 mln
  const m = { cat: { beni: { valore: 5_000_000, quotaCosti: 0.3 } } };
  const flags = flagsBenchmark(m, benchBeni(), { scope: 'nazionale' });
  const f = flags.find((x) => x.tipo === 'outlier_quota');
  assert.ok(f, 'очаква се outlier_quota флаг');
  assert.equal(f.categoria, 'beni');
  assert.equal(f.valore, 5_000_000);
  assert.ok(f.z > 2, `z=${f.z}`);
});

test('flag: под прага за материалност (<1 mln) → без флаг', () => {
  // същият голям дял, но абсолютната сума е под 1 mln → шумозаглушаване
  const m = { cat: { beni: { valore: 500_000, quotaCosti: 0.3 } } };
  const flags = flagsBenchmark(m, benchBeni(), { scope: 'nazionale' });
  assert.equal(flags.length, 0);
});

test('flag: над прага, но дялът НЕ е над P90 → без флаг', () => {
  const m = { cat: { beni: { valore: 5_000_000, quotaCosti: 0.11 } } }; // 0.11 < P90 0.20
  const flags = flagsBenchmark(m, benchBeni(), { scope: 'nazionale' });
  assert.equal(flags.length, 0);
});

test('flag: +60% годишен скок >2 mln → esplosione_annua', () => {
  const rec = { anno: 2024, cat: { beni: { valore: 6_000_000 } } };
  const prev = { beni: 3_000_000 }; // +100%, +3 mln
  const flags = flagsEsplosione(rec, prev, 2023);
  const f = flags.find((x) => x.tipo === 'esplosione_annua');
  assert.ok(f, 'очаква се esplosione_annua флаг');
  assert.equal(f.categoria, 'beni');
  assert.equal(f.valore, 6_000_000);
});

test('flag: годишен скок под праговете → без esplosione_annua', () => {
  // +33% (<60%) и само +1 mln (<2 mln) → нито едно от условията
  const rec = { anno: 2024, cat: { beni: { valore: 4_000_000 } } };
  const prev = { beni: 3_000_000 };
  assert.equal(flagsEsplosione(rec, prev, 2023).length, 0);
});
