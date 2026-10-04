import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as argon2 from 'argon2';
import {
  dummyHash,
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

test('a hash with older or weaker parameters is renewed at the next login', async () => {
  const weak = await argon2.hash('oak router plane', {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 1,
    parallelism: 1,
  });
  assert.equal(await verifyPassword('oak router plane', weak), true, 'the old hash still logs in');
  assert.equal(needsRehash(weak), true);
  const fewerPasses = await argon2.hash('oak router plane', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 2,
    parallelism: 1,
  });
  assert.equal(needsRehash(fewerPasses), true, 'only t differs');
  assert.equal(needsRehash('not-a-hash'), true);
  assert.equal(needsRehash(''), true);
});

test('the decoy hash for unknown accounts costs the same as a real one and matches nothing', async () => {
  const decoy = await dummyHash();
  assert.equal(await dummyHash(), decoy, 'computed once');
  assert.match(decoy, /^\$argon2id\$v=19\$/);
  for (const param of ['m=65536', 't=3', 'p=1'])
    assert.ok(decoy.split('$')[3]?.split(',').includes(param), param);
  assert.equal(needsRehash(decoy), false);
  assert.equal(await verifyPassword('oak router plane', decoy), false);
});
