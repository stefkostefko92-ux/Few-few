import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSENT_COOKIE,
  adCookieNames,
  adTagsConfigured,
  consentDecidedAt,
  consentFromCookieHeader,
  parseConsent,
  serializeConsent,
} from '../consent';

test('serializeConsent/parseConsent — кръг (с timestamp за чл. 7(1) отчетност)', () => {
  const raw = serializeConsent('granted', 1720000000000);
  assert.equal(raw, 'v1:granted:1720000000');
  assert.equal(parseConsent(raw), 'granted');
  assert.equal(consentDecidedAt(raw), 1720000000);
  assert.equal(parseConsent(serializeConsent('denied')), 'denied');
  // стар формат без timestamp остава четим
  assert.equal(parseConsent('v1:granted'), 'granted');
  assert.equal(consentDecidedAt('v1:granted'), null);
});

test('adCookieNames — намира рекламните бисквитки за заличаване', () => {
  const header = '_fbp=fb.1.1; NEXT_LOCALE=bg; _gcl_au=1.1; _ga=GA1.1; session=x; _fbc=fb.2';
  assert.deepEqual(adCookieNames(header).sort(), ['_fbc', '_fbp', '_ga', '_gcl_au']);
  assert.deepEqual(adCookieNames('session=x'), []);
});

test('parseConsent — повреден/стар вход → null (питаме пак)', () => {
  assert.equal(parseConsent(null), null);
  assert.equal(parseConsent(''), null);
  assert.equal(parseConsent('v0:granted'), null);
  assert.equal(parseConsent('v1:maybe'), null);
  assert.equal(parseConsent('боклук'), null);
});

test('consentFromCookieHeader — намира бисквитката сред други', () => {
  const header = `foo=bar; ${CONSENT_COOKIE}=v1%3Agranted; baz=1`;
  assert.equal(consentFromCookieHeader(header), 'granted');
  assert.equal(consentFromCookieHeader('foo=bar'), null);
  assert.equal(consentFromCookieHeader(''), null);
});

test('adTagsConfigured — банерът съществува само при зададено ID', () => {
  assert.equal(adTagsConfigured(undefined, undefined), false);
  assert.equal(adTagsConfigured('', '  '), false);
  assert.equal(adTagsConfigured('AW-123', undefined), true);
  assert.equal(adTagsConfigured(undefined, '999'), true);
});
