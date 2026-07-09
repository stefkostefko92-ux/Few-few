import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateShortCode,
  isValidShortCode,
  normalizeShortCode,
} from '../shortlink';

test('normalizeShortCode: малки букви, само [a-z0-9-]', () => {
  assert.equal(normalizeShortCode('  My-Link! '), 'my-link');
  assert.equal(normalizeShortCode('Промо'), '');
  assert.equal(normalizeShortCode('a'.repeat(50)).length, 32);
});

test('isValidShortCode', () => {
  assert.equal(isValidShortCode('abc'), true);
  assert.equal(isValidShortCode('my-link-1'), true);
  assert.equal(isValidShortCode('ab'), false);
  assert.equal(isValidShortCode('has space'), false);
});

test('generateShortCode: 6 знака, валиден, различен', () => {
  const a = generateShortCode();
  assert.match(a, /^[a-z0-9]{6}$/);
  assert.equal(isValidShortCode(a), true);
  assert.notEqual(a, generateShortCode());
});
