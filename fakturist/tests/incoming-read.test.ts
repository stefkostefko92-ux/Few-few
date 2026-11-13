import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculate, toCii, toUbl } from '../src/einvoice/index.js';
import { toPlain } from '../src/einvoice/decimal.js';
import { checkIncoming, IncomingError } from '../src/incoming/check.js';
import { SAMPLES } from './fixtures/einvoice-samples.js';

/**
 * SPEC 55: обратен ход — всяка официална проба, сериализирана от ядрото като UBL и CII, се разчита до
 * същия документ: номер, дати, страни, редове и същите изчислени суми, без фатални грешки.
 */
for (const [name, input] of Object.entries(SAMPLES)) {
  for (const [format, write] of [
    ['UBL', toUbl],
    ['CII', toCii],
  ] as const) {
    test(`${name} · ${format}: разчита се до същия документ`, () => {
      const calc = calculate(input);
      const result = checkIncoming(write(input, calc, 'en16931', 'подпис'));
      assert.equal(result.format, format);
      assert.ok(result.parsed, JSON.stringify(result.issues));
      const fatal = result.issues.filter((i) => i.severity === 'fatal');
      assert.deepEqual(fatal, [], `${name} ${format}`);
      const back = result.parsed;
      assert.equal(back.number, input.number);
      assert.equal(back.issueDate, input.issueDate);
      assert.equal(back.typeCode, input.typeCode);
      assert.equal(back.currency, input.currency);
      assert.equal(back.dueDate, input.dueDate);
      assert.equal(back.seller.name, input.seller.name);
      assert.equal(back.seller.legalId, input.seller.legalId);
      assert.equal(back.buyer.name, input.buyer.name);
      assert.equal(back.lines.length, input.lines.length);
      assert.equal(back.payment?.accountId, input.payment?.accountId);
      const again = calculate(back);
      assert.equal(toPlain(again.totals.payable), toPlain(calc.totals.payable));
      assert.equal(toPlain(again.totals.vat), toPlain(calc.totals.vat));
    });
  }
}

test('подправена обща сума → грешка TOTALS; DTD и не-фактура → отказ', () => {
  const input = SAMPLES.domestic;
  const xml = toUbl(input, calculate(input));
  const forged = xml.replace(
    /<cbc:PayableAmount currencyID="EUR">[^<]+<\/cbc:PayableAmount>/,
    '<cbc:PayableAmount currencyID="EUR">1.00</cbc:PayableAmount>',
  );
  const result = checkIncoming(forged);
  assert.ok(result.issues.some((i) => i.rule === 'TOTALS' && i.path === 'BT-115'));
  assert.throws(
    () => checkIncoming('<!DOCTYPE x [<!ENTITY a "b">]><Invoice/>'),
    (e: unknown) => e instanceof IncomingError && e.code === 'dtd',
  );
  assert.throws(
    () => checkIncoming('<Order><ID>1</ID></Order>'),
    (e: unknown) => e instanceof IncomingError && e.code === 'notInvoice',
  );
  assert.throws(
    () => checkIncoming('<Invoice><ID>1</Invoice>'),
    (e: unknown) => e instanceof IncomingError && e.code === 'xml',
  );
});
