import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEInvoice, type InvoiceInput } from '../src/einvoice/index.js';
import { SAMPLES, creditNote, domestic, reverseCharge } from './fixtures/einvoice-samples.js';

function rulesOf(input: unknown, options = {}): string[] {
  const result = buildEInvoice(input, options);
  return result.issues.filter((i) => i.severity === 'fatal').map((i) => i.rule);
}

test('всички примерни документи минават правилата и в двата профила', () => {
  for (const [name, input] of Object.entries(SAMPLES)) {
    for (const profile of ['en16931', 'peppol'] as const) {
      const result = buildEInvoice(input, { profile });
      assert.ok(result.ok, `${name}/${profile}: ${result.issues.map((i) => i.rule).join(', ')}`);
    }
  }
});

test('BG-01: номерът е точно 10 цифри', () => {
  assert.ok(rulesOf({ ...domestic, number: '124' }).includes('BG-01'));
  assert.ok(rulesOf({ ...domestic, number: 'F000000124' }).includes('BG-01'));
});

test('BG-02 / BG-04: невалиден ЕИК или ДДС номер на доставчика', () => {
  const badEik = { ...domestic, seller: { ...domestic.seller, legalId: '208725181' } };
  assert.ok(rulesOf(badEik).includes('BG-02'));
  const badVat = { ...domestic, seller: { ...domestic.seller, vatId: 'BG208725181' } };
  assert.ok(rulesOf(badVat).includes('BG-04'));
});

test('BR-S-02: без ДДС номер не се начислява ДДС (чл. 113, ал. 9 ЗДДС)', () => {
  const input = { ...domestic, seller: { ...domestic.seller, vatId: undefined } };
  assert.ok(rulesOf(input).includes('BR-S-02'));
});

test('BG-05: чужда валута без курс', () => {
  assert.ok(rulesOf({ ...domestic, currency: 'USD' }).includes('BG-05'));
});

test('BG-06: известие без препратка към фактура (чл. 115 ЗДДС)', () => {
  assert.ok(rulesOf({ ...creditNote, precedingInvoices: [] }).includes('BG-06'));
});

test('BG-07: обратно начисляване без текста „обратно начисляване“', () => {
  const input: InvoiceInput = {
    ...reverseCharge,
    vatExemptions: [{ category: 'AE', reason: 'чл. 21, ал. 2', reasonCode: 'VATEX-EU-AE' }],
  };
  assert.ok(rulesOf(input).includes('BG-07'));
});

test('BR-E-10 и BG-07: освободена доставка без основание', () => {
  const input = {
    ...domestic,
    allowanceCharges: [],
    lines: [{ ...domestic.lines[0]!, vat: { category: 'E' as const, rate: '0' } }],
  };
  const rules = rulesOf(input);
  assert.ok(rules.includes('BR-E-10'));
  assert.ok(rules.includes('BG-07'));
});

test('BG-08: късно издаване е предупреждение, не спира', () => {
  const result = buildEInvoice({ ...domestic, taxPointDate: '2026-11-01' });
  assert.ok(result.ok);
  assert.ok(result.issues.some((i) => i.rule === 'BG-08' && i.severity === 'warning'));
  const relaxed = buildEInvoice(
    { ...domestic, taxPointDate: '2026-11-01' },
    { issueDeadlineDays: 15 },
  );
  assert.equal(
    relaxed.issues.some((i) => i.rule === 'BG-08'),
    false,
  );
});

test('BG-09: сметката става задължителна, когато мастър панелът я включи', () => {
  const input = { ...domestic, payment: undefined, paymentTerms: 'В брой' };
  assert.equal(rulesOf(input).includes('BG-09'), false);
  assert.ok(rulesOf(input, { requireBankAccount: true }).includes('BG-09'));
});

test('BR-61 и BR-CO-25: превод без сметка; сума без падеж', () => {
  const noAccount = { ...domestic, payment: { meansCode: '30' as const } };
  assert.ok(rulesOf(noAccount).includes('BR-61'));
  const noDue = { ...domestic, dueDate: undefined };
  assert.ok(rulesOf(noDue).includes('BR-CO-25'));
});

test('BR-27: отрицателна цена', () => {
  const input = { ...domestic, lines: [{ ...domestic.lines[0]!, netPrice: '-1' }] };
  assert.ok(rulesOf(input).includes('BR-27'));
});

test('Peppol: електронни адреси и референция на купувача', () => {
  const input = {
    ...domestic,
    buyerReference: undefined,
    buyer: { ...domestic.buyer, electronicAddress: undefined },
  };
  const rules = rulesOf(input, { profile: 'peppol' });
  assert.ok(rules.includes('PEPPOL-EN16931-R003'));
  assert.ok(rules.includes('PEPPOL-EN16931-R010'));
  assert.equal(rulesOf(input).includes('PEPPOL-EN16931-R010'), false);
});

test('невалиден вход (float, буква в количество) се отказва преди изчислението', () => {
  const result = buildEInvoice({
    ...domestic,
    lines: [{ ...domestic.lines[0]!, quantity: '1e3' }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.every((i) => i.rule === 'INPUT'));
});
