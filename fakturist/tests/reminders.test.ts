import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dueStep } from '../src/documents/reminders.js';
import { paymentState } from '../src/documents/payments.js';

/** SPEC 52: стъпките на напомнянията и състоянието на плащането — чиста логика. */
test('стъпка +3, после +10; след прекъсване — само най-високата, по-ранните без писмо', () => {
  assert.equal(dueStep(2, []), null);
  assert.deepEqual(dueStep(3, []), { send: 3, skip: [] });
  assert.equal(dueStep(5, [3]), null);
  assert.deepEqual(dueStep(10, [3]), { send: 10, skip: [] });
  assert.deepEqual(dueStep(14, []), { send: 10, skip: [3] });
  assert.equal(dueStep(30, [3, 10]), null);
});

test('платено, частично, неплатено — по сбора спрямо сумата за плащане', () => {
  assert.equal(paymentState(0n, 1000n), 'UNPAID');
  assert.equal(paymentState(1n, 1000n), 'PARTIAL');
  assert.equal(paymentState(1000n, 1000n), 'PAID');
});
