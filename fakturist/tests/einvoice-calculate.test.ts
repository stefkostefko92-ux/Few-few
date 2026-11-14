import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculate } from '../src/einvoice/calculate.js';
import { toFixed } from '../src/einvoice/decimal.js';
import { InvoiceInputSchema } from '../src/einvoice/model.js';
import { domestic, foreignCurrency, notRegistered } from './fixtures/einvoice-samples.js';

const money = (value: { v: bigint; s: number } | null) => (value ? toFixed(value, 2) : null);

test('вътрешна фактура: редове, отстъпки, две ставки и тотали (сметнато на ръка)', () => {
  const calc = calculate(InvoiceInputSchema.parse(domestic));
  assert.deepEqual(
    calc.lines.map((line) => money(line.net)),
    ['37.50', '54.00', '9.99'],
  );
  assert.equal(money(calc.lines[1]!.allowanceCharges[0]!.amount), '6.00');
  const t = calc.totals;
  assert.equal(money(t.lineExtension), '101.49');
  assert.equal(money(t.allowances), '5.00');
  assert.equal(money(t.charges), '0.00');
  assert.equal(money(t.taxExclusive), '96.49');
  assert.equal(money(t.vat), '18.20');
  assert.equal(money(t.taxInclusive), '114.69');
  assert.equal(money(t.payable), '114.69');
  const s20 = calc.breakdown.find((g) => g.category === 'S' && money(g.rate) === '20.00');
  const s9 = calc.breakdown.find((g) => g.category === 'S' && money(g.rate) === '9.00');
  assert.equal(money(s20!.taxable), '86.50');
  assert.equal(money(s20!.vat), '17.30');
  assert.equal(money(s9!.taxable), '9.99');
  assert.equal(money(s9!.vat), '0.90');
  assert.equal(calc.vatCurrency, null);
});

test('фактура в USD: ДДС и основата в евро по курса на ЕЦБ (чл. 114, ал. 5 ЗДДС)', () => {
  const calc = calculate(InvoiceInputSchema.parse(foreignCurrency));
  assert.equal(calc.vatCurrency, 'EUR');
  assert.equal(money(calc.totals.vat), '20.00');
  assert.equal(money(calc.totals.vatInEur), '18.45');
  assert.equal(money(calc.breakdown[0]!.taxableEur), '92.23');
});

test('категория O: без ставка и без данък', () => {
  const calc = calculate(InvoiceInputSchema.parse(notRegistered));
  assert.equal(calc.breakdown.length, 1);
  assert.equal(calc.breakdown[0]!.rate, null);
  assert.equal(money(calc.totals.vat), '0.00');
  assert.equal(money(calc.totals.payable), '250.00');
});

test('авансово платено и закръгляне намаляват сумата за плащане', () => {
  const calc = calculate(
    InvoiceInputSchema.parse({ ...domestic, prepaidAmount: '50.00', roundingAmount: '0.01' }),
  );
  assert.equal(money(calc.totals.payable), '64.70');
});

test('процентна надбавка на документа върху сбора на редовете', () => {
  const calc = calculate(
    InvoiceInputSchema.parse({
      ...domestic,
      allowanceCharges: [
        { isCharge: true, percent: '2', reason: 'Транспорт', vat: { category: 'S', rate: '20' } },
      ],
    }),
  );
  // 2% от 101.49 = 2.0298 → 2.03
  assert.equal(money(calc.totals.charges), '2.03');
  assert.equal(money(calc.totals.taxExclusive), '103.52');
});
