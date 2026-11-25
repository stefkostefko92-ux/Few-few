import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPreCsrfToken, newPreCsrfToken } from '../src/auth/guards.js';
import { normalizeRecoveryCode } from '../src/auth/recovery.js';
import { bodyEtag } from '../src/http/etag.js';
import { parseFlash } from '../src/http/flash.js';
import { viewHelpers } from '../src/http/view.js';

const KEY = 'flash.accountSaved';

test('the flash cookie is untrusted: known kinds and dictionary keys only, plain params', () => {
  assert.deepEqual(parseFlash(JSON.stringify({ kind: 'ok', key: KEY, params: { n: 2 } })), {
    kind: 'ok',
    key: KEY,
    params: { n: 2 },
  });
  assert.equal(parseFlash(JSON.stringify({ kind: 'warn', key: KEY })), null);
  assert.equal(parseFlash(JSON.stringify({ kind: 'ok', key: 'no.such.key' })), null);
  assert.equal(parseFlash('{broken'), null);
  const long = { a: 'x'.repeat(300), b: {}, c: 1 };
  assert.deepEqual(parseFlash(JSON.stringify({ kind: 'info', key: KEY, params: long }))?.params, {
    a: 'x'.repeat(200),
    c: 1,
  });
  assert.deepEqual(parseFlash(JSON.stringify({ kind: 'error', key: KEY }))?.params, {});
});

test('the pre-login CSRF token is issued and checked by one rule', () => {
  assert.equal(isPreCsrfToken(newPreCsrfToken()), true);
  assert.equal(isPreCsrfToken('a'.repeat(20)), false);
  assert.equal(isPreCsrfToken(`${'a'.repeat(31)}!`), false);
});

test('view helpers are built once per language', () => {
  assert.equal(viewHelpers('bg'), viewHelpers('bg'));
  assert.notEqual(viewHelpers('bg'), viewHelpers('it'));
  assert.equal(viewHelpers('en').num(1234), '1,234');
});

test('a recovery code is read in any case and with any separator', () => {
  assert.equal(normalizeRecoveryCode('ABCDE fghjk'), 'abcde-fghjk');
  assert.equal(normalizeRecoveryCode('abcde-fghj'), '');
});

test('a body gets a stable weak ETag, unless it carries the nonce of its response', () => {
  const xml = '<?xml version="1.0"?><urlset></urlset>';
  const tag = bodyEtag(Buffer.from(xml));
  assert.match(tag ?? '', /^W\/"[0-9a-f]+-[\w-]{27}"$/);
  assert.equal(bodyEtag(xml, 'utf8'), tag);
  assert.notEqual(bodyEtag(Buffer.from(`${xml} `)), tag);
  const page = '<script type="module" src="/static/editor/landing.js" nonce="abc+/="></script>';
  assert.equal(bodyEtag(Buffer.from(page)), undefined);
});
