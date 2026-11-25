import assert from 'node:assert/strict';
import { test } from 'node:test';
import { templateOf } from '../src/recurring/recurring.js';
import { domestic } from './fixtures/einvoice-samples.js';

/** Шаблонът на повтарящата се фактура не пренася стария курс, датата на доставка и периода. */
test('шаблонът: без курс, дата на доставка и период; адресът на доставка остава', () => {
  const template = templateOf({
    ...domestic,
    currency: 'USD',
    eurExchangeRate: '0.912345',
    invoicingPeriod: { start: '2026-10-01', end: '2026-10-31' },
    delivery: {
      date: '2026-10-15',
      address: { street: 'ул. „Шипка“ 1', city: 'София', postalCode: '1000', countryCode: 'BG' },
    },
  }) as Record<string, unknown>;
  assert.equal(template['eurExchangeRate'], undefined);
  assert.equal(template['invoicingPeriod'], undefined);
  assert.deepEqual(template['delivery'], {
    address: { street: 'ул. „Шипка“ 1', city: 'София', postalCode: '1000', countryCode: 'BG' },
  });
  for (const gone of ['number', 'seller', 'issueDate', 'taxPointDate', 'dueDate', 'prepaidAmount'])
    assert.equal(template[gone], undefined, gone);
});
