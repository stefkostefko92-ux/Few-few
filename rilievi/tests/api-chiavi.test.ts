// Read-only API keys (point D2): `rk_<prefix>_<secret>`, only the prefix and an HMAC of the secret are stored;
// the header is read strictly (Bearer, exact format) — anything else is no key.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.PUBLIC_BASE_URL ??= 'https://rilievi.carbonstealth.eu';
process.env.DATABASE_URL ??= 'postgresql://x:y@db:5432/rilievi';
process.env.JWT_SECRET ??= 'a'.repeat(64);
process.env.INTERVENTI_SEAL_KEY ??= 'b'.repeat(64);
const { chiaveDa, nuovaChiave } = await import('../src/api/chiavi.js');
const { hmacChiaveApi } = await import('../src/auth/chiavi.js');

describe('API keys', () => {
  it('are made of a lookup prefix and a secret that is never stored', () => {
    const a = nuovaChiave();
    const b = nuovaChiave();
    assert.match(a.chiave, /^rk_[a-z0-9]{12}_[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a.prefisso, b.prefisso);
    assert.match(a.hash, /^[0-9a-f]{64}$/);
    // The secret (after `rk_<prefix>_`, base64url — it may contain `_`) is not in what is stored.
    assert.ok(!a.hash.includes(a.chiave.slice(16)));
    const parsed = chiaveDa(`Bearer ${a.chiave}`);
    assert.ok(parsed);
    assert.equal(hmacChiaveApi(parsed.prefisso, parsed.segreto), a.hash);
  });

  it('read only an exact Bearer key', () => {
    const { chiave } = nuovaChiave();
    for (const bad of [
      undefined,
      '',
      chiave,
      `Basic ${chiave}`,
      `Bearer ${chiave}x`,
      `Bearer ${chiave} extra`,
      'Bearer rk_ABC_def',
    ])
      assert.equal(chiaveDa(bad), null, String(bad));
  });
});
