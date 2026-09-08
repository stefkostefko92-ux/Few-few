import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_ROLES, assignableRoles, can, outranks } from '../src/auth/rbac.js';
import { passwordPolicyError } from '../src/auth/password.js';
import { base32Decode, base32Encode, otpauthUrl, totpCode, verifyTotp } from '../src/auth/totp.js';
import { MemoryNonceStore } from '../src/agent/nonce-store.js';
import {
  canonicalString,
  signRequest,
  timestampWithinSkew,
  verifySignature,
} from '../src/agent/signature.js';

/* ---------- RBAC ---------- */

test('седем нива, строго подредени', () => {
  assert.deepEqual(ALL_ROLES, [
    'OWNER',
    'ADMIN',
    'MANAGER',
    'REVIEWER',
    'EDITOR',
    'ANALYST',
    'VIEWER',
  ]);
});

test('способностите следват нивото', () => {
  assert.equal(can('VIEWER', 'posts:view'), true);
  assert.equal(can('VIEWER', 'posts:create'), false);
  assert.equal(can('EDITOR', 'posts:create'), true);
  assert.equal(can('EDITOR', 'posts:approve'), false);
  assert.equal(can('REVIEWER', 'posts:approve'), true);
  assert.equal(can('REVIEWER', 'brands:manage'), false);
  assert.equal(can('MANAGER', 'accounts:manage'), true);
  assert.equal(can('MANAGER', 'users:manage'), false);
  assert.equal(can('ADMIN', 'keys:manage'), true);
  assert.equal(can('ANALYST', 'audit:view'), true);
  assert.equal(can('ANALYST', 'posts:edit'), false);
});

test('никой не управлява равен или по-висок; OWNER раздава всичко под себе си', () => {
  assert.equal(outranks('ADMIN', 'ADMIN'), false);
  assert.equal(outranks('ADMIN', 'OWNER'), false);
  assert.equal(outranks('OWNER', 'ADMIN'), true);
  assert.deepEqual(assignableRoles('OWNER'), [
    'ADMIN',
    'MANAGER',
    'REVIEWER',
    'EDITOR',
    'ANALYST',
    'VIEWER',
  ]);
  assert.deepEqual(assignableRoles('VIEWER'), []);
});

/* ---------- пароли ---------- */

test('политика за пароли', () => {
  assert.ok(passwordPolicyError('кратка1'));
  assert.ok(passwordPolicyError('самобуквибезцифри'));
  assert.equal(passwordPolicyError('Publikator2026!'), null);
});

/* ---------- TOTP (RFC 6238 вектори за SHA-1, 8→6 цифри чрез последните 6) ---------- */

test('base32 обратимост', () => {
  const secret = Buffer.from('12345678901234567890');
  assert.equal(base32Encode(secret), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.deepEqual(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'), secret);
});

test('TOTP съвпада с RFC 6238 тестовите вектори', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  // RFC 6238, Appendix B (SHA-1, 8 цифри) → последните 6 цифри.
  assert.equal(totpCode(secret, 59), '287082');
  assert.equal(totpCode(secret, 1111111109), '081804');
  assert.equal(totpCode(secret, 1234567890), '005924');
  assert.equal(totpCode(secret, 2000000000), '279037');
});

test('проверката приема ±1 стъпка и отхвърля друг код', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(verifyTotp(secret, '287082', 59), true);
  assert.equal(verifyTotp(secret, '287082', 59 + 30), true);
  assert.equal(verifyTotp(secret, '287082', 59 + 90), false);
  assert.equal(verifyTotp(secret, '000000', 59), false);
  assert.equal(verifyTotp(secret, 'abc', 59), false);
});

test('otpauth URL носи издател, акаунт и параметри', () => {
  const url = new URL(otpauthUrl('Публикатор', 'a@b.bg', 'ABCDEF'));
  assert.equal(url.protocol, 'otpauth:');
  assert.equal(url.searchParams.get('secret'), 'ABCDEF');
  assert.equal(url.searchParams.get('digits'), '6');
  assert.equal(url.searchParams.get('period'), '30');
});

/* ---------- подпис на агентски заявки ---------- */

test('каноничната форма обвързва метод, път и тяло', () => {
  const a = canonicalString({ timestamp: '1', nonce: 'n', method: 'post', path: '/x', body: '{}' });
  const b = canonicalString({
    timestamp: '1',
    nonce: 'n',
    method: 'POST',
    path: '/x',
    body: '{ }',
  });
  assert.match(a, /^1\nn\nPOST\n\/x\n[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test('подписът се проверява в константно време и пада при промяна', () => {
  const input = {
    timestamp: '1700000000',
    nonce: 'abcdefghijklmnop',
    method: 'POST',
    path: '/agent/v1/drafts',
    body: '{"a":1}',
  };
  const sig = signRequest('secret', input);
  assert.equal(verifySignature('secret', input, sig), true);
  assert.equal(verifySignature('друга', input, sig), false);
  assert.equal(verifySignature('secret', { ...input, body: '{"a":2}' }, sig), false);
  assert.equal(verifySignature('secret', input, 'zz'), false);
});

test('времевият печат е в прозорец ±300 s', () => {
  assert.equal(timestampWithinSkew('1700000000', 1700000100), true);
  assert.equal(timestampWithinSkew('1700000000', 1700000301), false);
  assert.equal(timestampWithinSkew('не-число', 1700000000), false);
});

test('nonce складът приема веднъж и отхвърля повторение', async () => {
  const store = new MemoryNonceStore();
  assert.equal(await store.claim('k', 'n1', 60), true);
  assert.equal(await store.claim('k', 'n1', 60), false);
  assert.equal(await store.claim('k2', 'n1', 60), true);
});
