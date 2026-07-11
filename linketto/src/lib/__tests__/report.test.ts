import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPORT_CATEGORIES } from '../report';

test('DSA категориите за сигнали покриват типичните злоупотреби', () => {
  assert.ok(REPORT_CATEGORIES.includes('impersonation'));
  assert.ok(REPORT_CATEGORIES.includes('phishing'));
  assert.ok(REPORT_CATEGORIES.includes('illegal'));
  assert.ok(REPORT_CATEGORIES.includes('adult'));
  assert.ok(REPORT_CATEGORIES.includes('other'));
  // без дубликати
  assert.equal(new Set(REPORT_CATEGORIES).size, REPORT_CATEGORIES.length);
});
