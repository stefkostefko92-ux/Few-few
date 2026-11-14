import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderNo } from '../src/plans/order-number.js';

test('the order number people see is short, padded and carries the year of the order in Sofia', () => {
  assert.equal(
    orderNo({ number: 123, createdAt: new Date('2026-10-09T12:00:00Z') }),
    'KP-2026-000123',
  );
  // 31 December 23:30 UTC is already 1 January in Sofia
  assert.equal(
    orderNo({ number: 7, createdAt: new Date('2026-12-31T23:30:00Z') }),
    'KP-2027-000007',
  );
  assert.equal(
    orderNo({ number: 1_234_567, createdAt: new Date('2026-01-01T12:00:00Z') }),
    'KP-2026-1234567',
  );
});
