import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestLocale, dirFor, localeFromGeo } from '../../i18n/locales';

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

test('localeFromGeo: държава → език', () => {
  assert.equal(localeFromGeo({ country: 'PL', fallback: 'en' }), 'pl');
  assert.equal(localeFromGeo({ country: 'de', fallback: 'en' }), 'de'); // case-insensitive
  assert.equal(localeFromGeo({ country: 'AT', fallback: 'en' }), 'de'); // Австрия → немски
  assert.equal(localeFromGeo({ country: 'IE', fallback: 'en' }), 'en');
});

test('localeFromGeo: италиански регион → диалект', () => {
  assert.equal(localeFromGeo({ country: 'IT', region: 'Campania', fallback: 'en' }), 'nap');
  assert.equal(localeFromGeo({ country: 'IT', region: 'Sicily', fallback: 'en' }), 'scn');
  assert.equal(localeFromGeo({ country: 'IT', region: 'Lombardy', fallback: 'en' }), 'lmo');
  assert.equal(localeFromGeo({ country: 'IT', region: 'Lazio', fallback: 'en' }), 'it'); // друг регион → стандартен
});

test('localeFromGeo: смесени държави падат към Accept-Language', () => {
  // Белгия няма картографиране → ползва Accept-Language
  assert.equal(
    localeFromGeo({ country: 'BE', acceptLanguage: 'fr-BE,fr;q=0.9', fallback: 'en' }),
    'fr',
  );
});

test('localeFromGeo: ограничава до available (преводите на профил)', () => {
  // Държавата сочи pl, но профилът има само bg/en → пада към Accept-Language/fallback
  assert.equal(
    localeFromGeo({ country: 'PL', available: ['bg', 'en'], acceptLanguage: 'en', fallback: 'bg' }),
    'en',
  );
});

test('localeFromGeo: без данни → fallback', () => {
  assert.equal(localeFromGeo({ fallback: 'en' }), 'en');
});
