import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBp,
  computeTotals,
  formatBp,
  formatCents,
  lineNetCents,
  parseEuroToCents,
  roundHalfUp,
  vatCents,
} from '../money';

test('roundHalfUp arrotonda a metà per eccesso, anche sui negativi', () => {
  assert.equal(roundHalfUp(0.5), 1);
  assert.equal(roundHalfUp(1.5), 2);
  assert.equal(roundHalfUp(2.4), 2);
  assert.equal(roundHalfUp(-0.5), -1);
  assert.equal(roundHalfUp(-1.5), -2);
});

test('applyBp calcola percentuali in punti base', () => {
  assert.equal(applyBp(10_000, 2200), 2200); // 22% di 100,00 €
  assert.equal(applyBp(999, 550), 55); // 5,5% di 9,99 € = 54,945 → 55
  assert.equal(applyBp(12_345, 0), 0);
});

test('lineNetCents applica lo sconto di riga', () => {
  assert.equal(lineNetCents(3, 1_250), 3_750);
  assert.equal(lineNetCents(3, 1_250, 1000), 3_375); // −10%
});

test('vatCents usa il 22% come aliquota predefinita', () => {
  assert.equal(vatCents(10_000), 2_200);
  assert.equal(vatCents(10_000, 1000), 1_000);
});

test('computeTotals somma imponibile, IVA, spedizione', () => {
  const t = computeTotals(
    [
      { qty: 2, unitPriceCents: 5_000 }, // 100,00 €
      { qty: 1, unitPriceCents: 2_000 }, // 20,00 €
    ],
    { shippingCents: 1_000 },
  );
  assert.equal(t.netCents, 12_000);
  assert.equal(t.shippingCents, 1_000);
  assert.equal(t.vatCents, 2_860); // 22% di 120,00 € + 22% di 10,00 €
  assert.equal(t.totalCents, 15_860);
});

test('lo sconto di testata si ripartisce per aliquota, senza perdere centesimi', () => {
  const t = computeTotals(
    [
      { qty: 1, unitPriceCents: 10_000, vatRateBp: 2200 },
      { qty: 1, unitPriceCents: 5_000, vatRateBp: 1000 },
    ],
    { headerDiscountBp: 1000 }, // −10% su tutto
  );
  assert.equal(t.headerDiscountCents, 1_500);
  assert.equal(t.netCents, 13_500);
  // 22% su 90,00 € = 19,80 €; 10% su 45,00 € = 4,50 €.
  assert.equal(t.vatCents, 1_980 + 450);
  assert.equal(t.totalCents, 13_500 + 2_430);
});

test('la somma delle quote di sconto è esattamente lo sconto di testata', () => {
  // Tre righe indivisibili per 3: senza il resto sull'ultima riga si perderebbe
  // un centesimo e il totale non tornerebbe.
  const t = computeTotals(
    [
      { qty: 1, unitPriceCents: 1_000 },
      { qty: 1, unitPriceCents: 1_000 },
      { qty: 1, unitPriceCents: 1_001 },
    ],
    { headerDiscountBp: 3333 },
  );
  assert.equal(t.netCents + t.headerDiscountCents, 3_001);
});

test('computeTotals su documento vuoto non produce NaN', () => {
  const t = computeTotals([], { headerDiscountBp: 1000, shippingCents: 0 });
  assert.equal(t.netCents, 0);
  assert.equal(t.vatCents, 0);
  assert.equal(t.totalCents, 0);
});

test('parseEuroToCents legge il formato italiano', () => {
  assert.equal(parseEuroToCents('1.234,56'), 123_456);
  assert.equal(parseEuroToCents('12,50 €'), 1_250);
  assert.equal(parseEuroToCents('7'), 700);
  assert.equal(parseEuroToCents('7.50'), 750); // punto decimale, tollerato
  assert.equal(parseEuroToCents(''), null);
  assert.equal(parseEuroToCents('abc'), null);
  assert.equal(parseEuroToCents('1,234'), null); // tre decimali: non è un importo
});

test('formattazione italiana di importi e percentuali', () => {
  // Attenzione: l'italiano ha `minimumGroupingDigits: 2` (CLDR), quindi
  // 1234,56 NON prende il punto delle migliaia — solo da 10.000 in su.
  assert.match(formatCents(123_456), /^1234,56/);
  assert.match(formatCents(1_234_567), /^12\.345,67/);
  assert.equal(formatBp(2200), '22%');
  assert.equal(formatBp(550), '5,5%');
});
