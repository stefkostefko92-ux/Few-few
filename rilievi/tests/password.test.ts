import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hashPassword,
  needsRehash,
  passwordProblem,
  verifyPassword,
} from '../src/auth/password.js';

describe('password rules (NIST 800-63B: length and a deny list, no forced symbols)', () => {
  it('accepts long passphrases, including the owner pattern ProjectName2026!', () => {
    assert.equal(passwordProblem('Fune-Trefolo-Tenditore-7'), null);
    assert.equal(
      passwordProblem('Rilievi2026!', ['admin@carbonstealth.eu', 'Carbon Stealth VCC']),
      null,
    );
  });

  it('refuses short, common, repetitive and personal passwords', () => {
    assert.equal(passwordProblem('short1!'), 'tooShort');
    assert.equal(passwordProblem('x'.repeat(257)), 'tooLong');
    assert.equal(passwordProblem('aaaaaaaaaaaaab'), 'repetitive');
    assert.equal(passwordProblem('Password2026!'), 'common');
    assert.equal(passwordProblem('ascensore2026', []), 'common');
    assert.equal(passwordProblem('Marco.Rossi.1985', ['marco.rossi@example.it']), 'personal');
  });

  it('hashes with Argon2id and verifies', async () => {
    const hash = await hashPassword('Fune-Trefolo-Tenditore-7');
    assert.match(hash, /^\$argon2id\$/);
    assert.equal(await verifyPassword('Fune-Trefolo-Tenditore-7', hash), true);
    assert.equal(await verifyPassword('fune-trefolo-tenditore-7', hash), false);
    assert.equal(needsRehash(hash), false);
    assert.equal(await verifyPassword('x', 'not-a-hash'), false);
  });
});
