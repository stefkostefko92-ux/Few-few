import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorMessage } from '../src/logger.js';

/** Логовете без лични данни (одитът на Качествения, 13.11.2026): имейлите в грешките се маскират. */
test('имейлите в съобщенията за грешка се маскират — и когато не е Error', () => {
  assert.equal(
    errorMessage(new Error('550 5.1.1 <ivan.petrov@roza.bg>: Recipient address rejected')),
    '550 5.1.1 <[адрес]>: Recipient address rejected',
  );
  assert.equal(errorMessage('mail to a.b+c@example.co.uk failed'), 'mail to [адрес] failed');
  assert.equal(errorMessage(new Error('Connection timeout')), 'Connection timeout');
  assert.equal(errorMessage({ toString: () => 'x' }), 'x');
});
