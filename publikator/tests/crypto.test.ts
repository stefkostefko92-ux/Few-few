import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptSecret, encryptSecret, signState, verifyState } from '../src/crypto.js';

const KEY = 'a'.repeat(64);

test('токенът се връща същият след криптиране и декриптиране', () => {
  const secret = 'IGQVJXamplevalue-1234567890';
  const encrypted = encryptSecret(secret, KEY);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptSecret(encrypted, KEY), secret);
});

test('подправен шифротекст не се декриптира', () => {
  const encrypted = encryptSecret('таен-токен', KEY);
  const raw = Buffer.from(encrypted, 'base64');
  raw.writeUInt8((raw.at(-1) ?? 0) ^ 0xff, raw.length - 1);
  assert.throws(() => decryptSecret(raw.toString('base64'), KEY));
});

test('друг ключ не отваря шифротекста', () => {
  const encrypted = encryptSecret('таен-токен', KEY);
  assert.throws(() => decryptSecret(encrypted, 'b'.repeat(64)));
});

test('state се подписва и проверява', () => {
  const state = signState('brand-123', 'app-secret');
  assert.equal(verifyState(state, 'app-secret'), 'brand-123');
});

test('state с чужд подпис пада', () => {
  const state = signState('brand-123', 'app-secret');
  assert.equal(verifyState(state, 'друг-secret'), null);
});

test('изтекъл state пада', () => {
  const state = signState('brand-123', 'app-secret', -1);
  assert.equal(verifyState(state, 'app-secret'), null);
});
