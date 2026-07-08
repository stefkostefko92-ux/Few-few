import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestLocale, dirFor } from '../../i18n/locales';

test('bestLocale избира по качество', () => {
  assert.equal(
    bestLocale('it-IT,it;q=0.9,en;q=0.5', ['bg', 'en', 'it'], 'bg'),
    'it',
  );
});

test('bestLocale пада към базовия език', () => {
  assert.equal(bestLocale('de-AT,de;q=0.9', ['de', 'en'], 'en'), 'de');
});

test('bestLocale ползва fallback без съвпадение', () => {
  assert.equal(bestLocale('ja,ko;q=0.8', ['bg', 'en'], 'bg'), 'bg');
  assert.equal(bestLocale(null, ['bg'], 'bg'), 'bg');
});

test('dirFor различава RTL', () => {
  assert.equal(dirFor('bg'), 'ltr');
  assert.equal(dirFor('ar'), 'rtl');
});
