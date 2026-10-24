import './env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { centsToDecimal, formattersFor } from '../src/format.js';

test('евроцентовете стават точен десетичен низ без float', () => {
  assert.equal(centsToDecimal(0), '0.00');
  assert.equal(centsToDecimal(5), '0.05');
  assert.equal(centsToDecimal(1250), '12.50');
  assert.equal(centsToDecimal(999999), '9999.99');
  assert.equal(centsToDecimal(-120), '-1.20');
  assert.throws(() => centsToDecimal(12.5), RangeError);
});

test('цената се показва по езика на страницата', () => {
  const normalize = (text: string) => text.replace(/\s/g, ' ');
  assert.equal(normalize(formattersFor('bg', 'Europe/Sofia').euro(1250)), '12,50 €');
  assert.equal(formattersFor('en', 'Europe/Sofia').euro(1250), '€12.50');
  assert.equal(normalize(formattersFor('it', 'Europe/Sofia').euro(1250)), '12,50 €');
});

test('K/D дели на 1 при нула смърти; процентът не дели на нула', () => {
  const fmt = formattersFor('en', 'UTC');
  assert.equal(fmt.kd(10, 0), '10.00');
  assert.equal(fmt.kd(420, 200), '2.10');
  assert.equal(fmt.percent(0, 0), '—');
  assert.equal(fmt.percent(1, 4), '25.0%');
});

test('изиграното време се закръгля до минута', () => {
  const fmt = formattersFor('bg', 'UTC');
  assert.equal(
    fmt.duration(3 * 3600 + 25 * 60 + 59, (h, m) => `${h}/${m}`),
    '3/25',
  );
});
