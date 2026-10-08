import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translatorFor } from '../src/i18n.js';
import { retentionText } from '../src/retention.js';

test('the audit retention in the privacy policy is the configured number of days', () => {
  assert.equal(retentionText(1825, translatorFor('bg')), '5 години');
  assert.equal(retentionText(1825, translatorFor('en')), '5 years');
  assert.equal(retentionText(1825, translatorFor('it')), '5 anni');
  assert.equal(retentionText(365, translatorFor('bg')), '1 година');
  assert.equal(retentionText(365, translatorFor('en')), '1 year');
  assert.equal(retentionText(365, translatorFor('it')), '1 anno');
});

test('a retention that is not whole years is stated in days, never rounded', () => {
  assert.equal(retentionText(1000, translatorFor('bg')), '1000 дни');
  assert.equal(retentionText(1000, translatorFor('en')), '1000 days');
  assert.equal(retentionText(1000, translatorFor('it')), '1000 giorni');
});
