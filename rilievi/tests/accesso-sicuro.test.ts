// The safer sign-in: TOTP against the RFC 6238 test vectors (SHA-1, 6 digits), a code accepted once
// and within one step of drift, the encrypted secret and the encrypted set-up draft (a tampered or
// foreign one fails), the recovery codes as people type them, the growing lock and the unknown e-mails
// locked exactly like real accounts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.PUBLIC_BASE_URL ??= 'https://rilievi.carbonstealth.eu';
process.env.DATABASE_URL ??= 'postgresql://x:y@db:5432/rilievi';
process.env.JWT_SECRET ??= 'a'.repeat(64);
process.env.INTERVENTI_SEAL_KEY ??= 'b'.repeat(64);

const totp = await import('../src/auth/totp.js');
const chiavi = await import('../src/auth/chiavi.js');
const { normalizeRecoveryCode } = await import('../src/auth/recovery.js');
const lockout = await import('../src/auth/lockout.js');
const { HOUR, MINUTE } = await import('../src/time.js');

// RFC 6238, appendix B: the ASCII secret "12345678901234567890", SHA-1, the last 6 of the 8 digits.
const RFC = totp.base32Encode(Buffer.from('12345678901234567890'));
const VECTORS: Array<[number, string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
];

describe('TOTP', () => {
  it('gives the codes of RFC 6238', () => {
    assert.equal(RFC, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    for (const [time, code] of VECTORS)
      assert.equal(totp.totpCodeAt(RFC, totp.totpStep(time)), code, String(time));
  });

  it('accepts one step of drift each way, never the same step twice', () => {
    const now = 1234567890;
    const step = totp.totpStep(now);
    const at = (s: number) => totp.totpCodeAt(RFC, s);
    assert.equal(totp.verifyTotp(RFC, at(step), null, now), step);
    assert.equal(totp.verifyTotp(RFC, at(step - 1), null, now), step - 1);
    assert.equal(totp.verifyTotp(RFC, at(step + 1), null, now), step + 1);
    assert.equal(totp.verifyTotp(RFC, at(step - 2), null, now), null, 'two steps late');
    assert.equal(totp.verifyTotp(RFC, at(step), step, now), null, 'replayed');
    assert.equal(
      totp.verifyTotp(RFC, ` ${at(step).slice(0, 3)} ${at(step).slice(3)} `, null, now),
      step,
    );
    assert.equal(totp.verifyTotp(RFC, 'abcdef', null, now), null);
  });

  it('round-trips base32, writes the app link and groups the key for typing', () => {
    const secret = totp.generateTotpSecret();
    assert.match(secret, /^[A-Z2-7]{32}$/);
    assert.equal(totp.base32Encode(totp.base32Decode(secret)), secret);
    const url = totp.otpauthUrl('Rilievi Impianti', 'giulia@example.it', secret);
    assert.match(url, /^otpauth:\/\/totp\/Rilievi%20Impianti%3Agiulia%40example\.it\?/);
    assert.match(
      url,
      /secret=[A-Z2-7]{32}&issuer=Rilievi\+Impianti&algorithm=SHA1&digits=6&period=30/,
    );
    assert.match(totp.segretoLeggibile(secret), /^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/);
  });
});

describe('the keys of the sign-in', () => {
  it('encrypts the secret so that a changed byte does not open', () => {
    const sealed = chiavi.cifraSegreto('GEZDGNBVGY3TQOJQ');
    assert.notEqual(chiavi.cifraSegreto('GEZDGNBVGY3TQOJQ'), sealed, 'a fresh IV each time');
    assert.equal(chiavi.decifraSegreto(sealed), 'GEZDGNBVGY3TQOJQ');
    const raw = Buffer.from(sealed, 'base64');
    raw[raw.length - 1]! ^= 1;
    assert.throws(() => chiavi.decifraSegreto(raw.toString('base64')));
  });

  it('keeps the set-up draft apart from the stored secret, and refuses a forged one', () => {
    const draft = chiavi.cifraBozza('{"s":"x"}');
    assert.equal(chiavi.decifraBozza(draft), '{"s":"x"}');
    assert.equal(chiavi.decifraBozza(chiavi.cifraSegreto('{"s":"x"}')), null, 'other key');
    assert.equal(chiavi.decifraBozza('not base64 at all'), null);
    assert.equal(chiavi.decifraBozza(''), null);
  });

  it('hashes recovery codes and networks with separate keys', () => {
    assert.match(chiavi.hmacRecupero('abcde-23456'), /^[0-9a-f]{64}$/);
    assert.notEqual(chiavi.hmacRecupero('1.2.3.4'), chiavi.hmacRete('1.2.3.4'));
  });
});

describe('recovery codes as people type them', () => {
  it('reads upper case, spaces and a missing dash; refuses look-alike letters and wrong lengths', () => {
    assert.equal(normalizeRecoveryCode('ABCDE 23456'), 'abcde-23456');
    assert.equal(normalizeRecoveryCode('abcde23456'), 'abcde-23456');
    assert.equal(normalizeRecoveryCode(' abcde-23456 '), 'abcde-23456');
    assert.equal(normalizeRecoveryCode('abcde-2345'), '');
    assert.equal(normalizeRecoveryCode('abcdl-23456'), '', 'l is not in the alphabet');
    assert.equal(normalizeRecoveryCode('abcde-23450'), '', '0 is not in the alphabet');
  });
});

describe('the lock', () => {
  it('grows with each lock in a row: 15 minutes, an hour, 4 hours, then a day', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 9].map(lockout.lockMsFor), [
      15 * MINUTE,
      HOUR,
      4 * HOUR,
      24 * HOUR,
      24 * HOUR,
      24 * HOUR,
    ]);
    assert.equal(lockout.LOCK_MINUTES, 15);
    assert.equal(lockout.minutesLeft(Date.now() + 61_000), 2);
    assert.equal(lockout.minutesLeft(Date.now() - 1000), 1);
  });

  it('locks an unknown e-mail after the same five tries and for the same growing time', () => {
    const email = `nessuno.${Date.now()}@example.it`;
    const start = 1_800_000_000_000;
    for (let i = 0; i < lockout.MAX_FAILED_LOGINS - 1; i++) lockout.ghostFailure(email, start);
    assert.equal(lockout.ghostLockedUntil(email, start), null);
    lockout.ghostFailure(email, start);
    assert.equal(lockout.ghostLockedUntil(email, start), start + 15 * MINUTE);
    const later = start + 16 * MINUTE;
    assert.equal(lockout.ghostLockedUntil(email, later), null);
    for (let i = 0; i < lockout.MAX_FAILED_LOGINS; i++) lockout.ghostFailure(email, later);
    assert.equal(lockout.ghostLockedUntil(email, later), later + HOUR);
  });
});
