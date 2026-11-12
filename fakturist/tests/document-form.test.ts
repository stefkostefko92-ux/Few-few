import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formToIssueRequest } from '../src/documents/form.js';
import { IssueRequestSchema } from '../src/documents/issue.js';

const form = {
  seriesId: 'cmabcdefghijklmnopqrstuv',
  typeCode: '380',
  issueDate: '2026-11-12',
  taxPointDate: '2026-11-12',
  dueDate: '2026-11-26',
  currency: 'eur',
  buyer: {
    name: 'Клиент ООД',
    legalId: '131063188',
    vatId: 'bg 131063188',
    street: 'бул. „Витоша“ 1',
    city: 'София',
    postalCode: '1000',
    countryCode: 'bg',
  },
  payment: { meansCode: '30', accountId: 'BG80 BNBG 9661 1020 3456 78', bic: 'bnbgbgsd' },
  lines: [
    {
      name: 'Услуга',
      quantity: '2',
      unitCode: 'HUR',
      netPrice: '45,50',
      category: 'S',
      rate: '20',
      discount: '',
    },
    { name: '', quantity: '', netPrice: '' },
    {
      name: 'Книга',
      quantity: '1',
      unitCode: 'H87',
      netPrice: '10',
      category: 'S',
      rate: '9',
      discount: '5',
    },
  ],
};

test('формата става валиден вход: запетая → точка, празни редове изпадат, номериране от 1', () => {
  const request = formToIssueRequest(form);
  const parsed = IssueRequestSchema.safeParse(request);
  assert.ok(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues));
  const data = parsed.data!;
  assert.equal(data.lines.length, 2);
  assert.equal(data.lines[0]!.netPrice, '45.50');
  assert.equal(data.lines[1]!.id, '2');
  assert.deepEqual(data.lines[1]!.allowanceCharges[0], {
    isCharge: false,
    percent: '5',
    reason: 'Отстъпка',
  });
  assert.equal(data.buyer.vatId, 'BG131063188');
  assert.equal(data.payment?.accountId, 'BG80BNBG96611020345678');
  assert.equal(data.currency, 'EUR');
});

test('формата не носи доставчик и номер — те идват от сървъра', () => {
  const request = formToIssueRequest({ ...form, number: '9999999999', seller: { name: 'Чужда' } });
  assert.equal('number' in request, false);
  assert.equal('seller' in request, false);
});
