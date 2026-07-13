import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSENT_COOKIE,
  adTagsConfigured,
  consentFromCookieHeader,
  parseConsent,
  serializeConsent,
} from '../consent';

test('serializeConsent/parseConsent — кръг', () => {
  assert.equal(parseConsent(serializeConsent('granted')), 'granted');
  assert.equal(parseConsent(serializeConsent('denied')), 'denied');
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
