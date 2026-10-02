import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  needsRehash,
  passwordProblem,
  verifyPassword,
} from '../src/auth/password.js';

test('length rules follow NIST: at least 12, at most 256, no composition rules', () => {
  assert.equal(passwordProblem('short-pass'), 'tooShort');
  assert.equal(passwordProblem('a'.repeat(257)), 'tooLong');
  assert.equal(passwordProblem('oak router plane'), null);
  assert.equal(passwordProblem('дъб фреза ренде'), null);
});

test('predictable passwords are refused', () => {
  assert.equal(passwordProblem('aaaaaaaaaaaaaa'), 'repetitive');
  assert.equal(passwordProblem('abababababab'), 'repetitive');
  assert.equal(passwordProblem('password2026!'), 'common');
  assert.equal(passwordProblem('Rendetto2026!'), 'common');
  assert.equal(passwordProblem('qwerty123456'), 'common');
});

test('the person’s own name or email is refused', () => {
  assert.equal(passwordProblem('ivanov-kitchen-7', ['ivanov@example.test']), 'personal');
  assert.equal(passwordProblem('дърводелски-цех-7', ['Иван Дърводелски']), 'personal');
  assert.equal(passwordProblem('oak-router-plane', ['ivanov@example.test', 'Иван']), null);
});

test('Argon2id hashes verify and do not need a rehash', async () => {
  const hash = await hashPassword('oak router plane');
  assert.match(hash, /^\$argon2id\$v=19\$/);
  for (const param of ['m=65536', 't=3', 'p=1'])
    assert.ok(hash.split('$')[3]?.split(',').includes(param), param);
  assert.equal(await verifyPassword('oak router plane', hash), true);
  assert.equal(await verifyPassword('oak router plank', hash), false);
  assert.equal(await verifyPassword('anything', 'not-a-hash'), false);
  assert.equal(needsRehash(hash), false);
});
