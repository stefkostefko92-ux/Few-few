import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculate } from '../src/einvoice/calculate.js';
import { validateDocument, DEFAULT_RULE_OPTIONS, type Issue } from '../src/einvoice/rules.js';
import { fifteenthOfNextMonth, BGN_PER_EUR } from '../src/einvoice/rules-bg.js';
import type { InvoiceInput } from '../src/einvoice/model.js';
import { domestic, foreignCurrency, reverseCharge } from './fixtures/einvoice-samples.js';

/** Правилата по ЗДДС от данъчния одит (13.11.2026): получател без идентификатор, срок при ВОД, лев. */
const check = (input: InvoiceInput): Issue[] =>
  validateDocument(input, calculate(input), DEFAULT_RULE_OPTIONS);
const of = (issues: Issue[], rule: string) => issues.filter((issue) => issue.rule === rule);

test('15-о число на следващия месец — и през годината', () => {
  assert.equal(fifteenthOfNextMonth('2026-11-03'), '2026-12-15');
  assert.equal(fifteenthOfNextMonth('2026-12-31'), '2027-01-15');
  assert.equal(fifteenthOfNextMonth('2027-01-31'), '2027-02-15');
});

test('BG-10: български получател без ЕИК и без ДДС номер — предупреждение, не отказ', () => {
  const { legalId: _l, vatId: _v, ...buyer } = domestic.buyer;
  const issues = of(check({ ...domestic, buyer }), 'BG-10');
  assert.deepEqual(
    issues.map(({ severity, path }) => ({ severity, path })),
    [{ severity: 'warning', path: 'buyer.legalId' }],
  );
  assert.deepEqual(of(check(domestic), 'BG-10'), []);
});

test('BG-05: левът е с фиксиран курс 1,95583', () => {
  const bgn = { ...foreignCurrency, currency: 'BGN' } as InvoiceInput;
  assert.equal(of(check({ ...bgn, eurExchangeRate: BGN_PER_EUR }), 'BG-05').length, 0);
  const wrong = of(check({ ...bgn, eurExchangeRate: '1.96000' }), 'BG-05');
  assert.equal(wrong.length, 1);
  assert.equal(wrong[0]!.severity, 'fatal');
  assert.match(wrong[0]!.message.bg, /1\.95583/);
});

test('BG-08 при вътреобщностна доставка: до 15-о число на следващия месец, не 5 дни', () => {
  const intra: InvoiceInput = {
    ...domestic,
    allowanceCharges: [],
    buyer: reverseCharge.buyer,
    taxPointDate: '2026-10-20',
    delivery: {
      date: '2026-10-20',
      address: { city: 'Milano', countryCode: 'IT', street: 'Via Roma 1', postalCode: '20121' },
    },
    vatExemptions: [
      { category: 'K', reason: 'Вътреобщностна доставка, чл. 7 ЗДДС', reasonCode: 'VATEX-EU-IC' },
    ],
    lines: [
      {
        id: '1',
        quantity: '4',
        unitCode: 'H87',
        netPrice: '25',
        name: 'Етикети за рафт',
        vat: { category: 'K', rate: '0' },
        allowanceCharges: [],
        attributes: [],
      },
    ],
  };
  assert.equal(
    of(check({ ...intra, issueDate: '2026-11-15' }), 'BG-08').length,
    0,
    '15-о — навреме',
  );
  const late = of(check({ ...intra, issueDate: '2026-11-16' }), 'BG-08');
  assert.equal(late.length, 1);
  assert.match(late[0]!.message.bg, /2026-11-15/);
});
