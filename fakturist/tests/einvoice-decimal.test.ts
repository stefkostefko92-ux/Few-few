import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  add,
  dec,
  divRound,
  isDecimalText,
  mul,
  percentOf,
  round,
  sub,
  toCents,
  toFixed,
  toPlain,
} from '../src/einvoice/decimal.js';

test('без float: 0.1 + 0.2 е точно 0.3', () => {
  assert.equal(toPlain(add(dec('0.1'), dec('0.2'))), '0.3');
});

test('закръгляне half up далеч от нулата', () => {
  assert.equal(toFixed(round(dec('1.005'), 2), 2), '1.01');
  assert.equal(toFixed(round(dec('-1.005'), 2), 2), '-1.01');
  assert.equal(toFixed(round(dec('1.004'), 2), 2), '1.00');
  assert.equal(toFixed(round(dec('2.5'), 0), 0), '3');
  assert.equal(toFixed(round(dec('-2.5'), 0), 0), '-3');
});

test('произведение и деление без загуба', () => {
  assert.equal(toFixed(round(mul(dec('3'), dec('0.335')), 2), 2), '1.01');
  assert.equal(toFixed(divRound(dec('100'), dec('1.0842'), 2), 2), '92.23');
  assert.equal(toFixed(divRound(dec('20'), dec('1.0842'), 2), 2), '18.45');
  assert.equal(toFixed(divRound(dec('-20'), dec('1.0842'), 2), 2), '-18.45');
});

test('процент и центове', () => {
  assert.equal(toFixed(percentOf(dec('86.50'), dec('20')), 2), '17.30');
  assert.equal(toFixed(percentOf(dec('9.99'), dec('9')), 2), '0.90');
  assert.equal(toCents(dec('114.69')), 11469n);
  assert.throws(() => toCents(dec('1.005')));
});

test('изваждане и запис', () => {
  assert.equal(toPlain(sub(dec('10'), dec('0.25'))), '9.75');
  assert.equal(toPlain(dec('12.500')), '12.5');
  assert.equal(toFixed(dec('7'), 2), '7.00');
  assert.equal(toFixed(dec('-0.05'), 2), '-0.05');
});

test('входът е само десетичен текст', () => {
  assert.ok(isDecimalText('12.345678'.slice(0, 9)));
  assert.equal(isDecimalText('1e5'), false);
  assert.equal(isDecimalText('1,5'), false);
  assert.equal(isDecimalText('0.1234567'), false);
  assert.throws(() => dec('NaN'));
  assert.throws(() => divRound(dec('1'), dec('0'), 2));
});
