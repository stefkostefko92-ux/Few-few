import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receiptStrings, receiptDate } from '../receipt';

test('receiptStrings връща родния език', () => {
  assert.equal(receiptStrings('bg').title, 'Потвърждение за покупка');
  assert.equal(receiptStrings('de').title, 'Kaufbestätigung');
  assert.equal(receiptStrings('fr').seller, 'Vendeur');
});

test('липсващ език пада към en (не bg)', () => {
  assert.equal(receiptStrings('pl').title, receiptStrings('en').title);
  assert.equal(receiptStrings(undefined).title, receiptStrings('bg').title);
});

test('receiptDate е ISO YYYY-MM-DD', () => {
  assert.equal(receiptDate(new Date('2026-07-09T15:30:00Z')), '2026-07-09');
});
