// Тестове за SDO агрегацията (обеми на болничната дейност).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggrega } from '../src/fetch-sdo.js';

const riga = (codice, denom, decessi, domicilio, altra) => ({
  'Anno di dimissione': '2022',
  'Codice Istituto': codice,
  'Denominazione Istituto': denom,
  'Num decessi': decessi,
  'Num dimissioni a domicilio': domicilio,
  'Num dimissioni verso altra struttura': altra,
});

test('SDO — сумиране на трите колони и per регион', () => {
  const rows = [
    // Piemonte (01→010): числа в италиански формат + oscurato „***"
    riga('01000300', 'OSPEDALE A', '512', '10.487', '1.885'),
    riga('01000401', 'OSPEDALE B', '***', '39', '***'), // *** → 0
    // Lazio (12→120)
    riga('12090501', 'POLICLINICO GEMELLI', '1.000', '80.000', '9.841'),
    // Trentino (04→taa) — ключовият случай
    riga('04000100', 'OSPEDALE TN', '100', '5.000', '400'),
  ];
  const agg = aggrega(rows);

  assert.equal(agg.anno, 2022);

  // общ обем на структура = decessi + domicilio + altra
  assert.equal(agg.perStruttura['01000300'].dimissioni, 512 + 10487 + 1885); // 12884
  assert.equal(agg.perStruttura['01000401'].dimissioni, 39); // *** брои се 0
  assert.equal(agg.perStruttura['12090501'].denominazione, 'POLICLINICO GEMELLI');

  // per регион: правилен ключ + сумиране + decessi отделно
  assert.equal(agg.perRegione['010'].dimissioni, 12884 + 39); // 12923
  assert.equal(agg.perRegione['010'].strutture, 2);
  assert.equal(agg.perRegione['010'].decessi, 512); // *** → 0

  assert.equal(agg.perRegione['120'].dimissioni, 1000 + 80000 + 9841); // 90841

  // 04 → „taa" (Trentino-Alto Adige), НЕ „040"
  assert.ok(agg.perRegione['taa'], 'очаква се ключ „taa" за регион 04');
  assert.equal(agg.perRegione['040'], undefined);
  assert.equal(agg.perRegione['taa'].dimissioni, 100 + 5000 + 400); // 5500
  assert.equal(agg.perRegione['taa'].decessi, 100);

  // национален тотал = сумата от всички структури
  assert.equal(agg.nazionale.strutture, 4);
  assert.equal(agg.nazionale.dimissioni, 12923 + 90841 + 5500); // 109264
});

test('SDO — празни/невалидни редове се пропускат', () => {
  const rows = [
    riga('', 'SENZA CODICE', '10', '20', '30'), // без код → пропуска се
    riga('01000300', 'OSPEDALE A', '1', '2', '3'),
  ];
  const agg = aggrega(rows);
  assert.equal(agg.nazionale.strutture, 1);
  assert.equal(agg.nazionale.dimissioni, 6);
});
