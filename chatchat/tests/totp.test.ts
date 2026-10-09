import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTotp, TotpReplayGuard } from '../src/auth/mfa.js';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  isTotpCode,
  otpauthUrl,
  totpCode,
  totpStep,
  verifyTotp,
} from '../src/auth/totp.js';
import { loadConfig, mfaKey } from '../src/config.js';
import { decryptSecret, encryptSecret } from '../src/crypto.js';

/** Вторият фактор: RFC 6238, шифроването на тайната, пазачът срещу повторен код, ключът от средата. */

// RFC 6238, приложение B: тайната „12345678901234567890“ (ASCII), HMAC-SHA1, 8 цифри.
// При 6 цифри кодът е последните 6 от 8-цифрения (binary mod 10^6).
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
const RFC_VECTORS: Array<[number, string]> = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('TOTP (RFC 6238)', () => {
  test('векторите от приложение B (SHA-1), съкратени до 6 цифри', () => {
    assert.equal(RFC_SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    for (const [time, eight] of RFC_VECTORS) {
      assert.equal(totpCode(RFC_SECRET, time), eight.slice(-6), `T=${time}`);
    }
  });

  test('base32: обратимо за произволни байтове; интервали и малки букви се приемат', () => {
    for (let i = 0; i < 50; i += 1) {
      const bytes = Buffer.from(Array.from({ length: i }, (_, k) => (k * 37 + i) & 255));
      assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
    }
    assert.deepEqual(base32Decode('gezd gnbv'), base32Decode('GEZDGNBV'));
  });

  test('нова тайна: 160 бита, всеки път различна', () => {
    const a = generateTotpSecret();
    assert.equal(base32Decode(a).length, 20);
    assert.notEqual(a, generateTotpSecret());
  });

  test('проверка: ±1 стъпка за дрейф, не повече; приетата стъпка се връща', () => {
    const now = 1_700_000_000;
    const step = totpStep(now);
    assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now), null, now), step);
    assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 30), null, now), step - 1);
    assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 30), null, now), step + 1);
    assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 60), null, now), null);
    assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 60), null, now), null);
  });

  test('повторен код: стъпка ≤ последно приетата се отхвърля', () => {
    const now = 1_700_000_000;
    const code = totpCode(RFC_SECRET, now);
    const step = verifyTotp(RFC_SECRET, code, null, now);
    assert.ok(step !== null);
    assert.equal(verifyTotp(RFC_SECRET, code, step, now), null);
    assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 30), step, now), step + 1);
  });

  test('формат: само 6 цифри (интервалите се махат); друго → null без сравнение', () => {
    assert.equal(isTotpCode('123 456'), true);
    for (const bad of ['12345', '1234567', 'abcdef', '', '12345a']) {
      assert.equal(isTotpCode(bad), false, bad);
      assert.equal(verifyTotp(RFC_SECRET, bad, null), null);
    }
  });

  test('otpauth URI: издател, акаунт и параметрите на алгоритъма', () => {
    const uri = otpauthUrl('ChatChat', 'ko@example.test', RFC_SECRET);
    assert.match(uri, /^otpauth:\/\/totp\/ChatChat%3Ako%40example\.test\?/);
    const params = new URL(uri).searchParams;
    assert.equal(params.get('secret'), RFC_SECRET);
    assert.equal(params.get('issuer'), 'ChatChat');
    assert.equal(params.get('digits'), '6');
    assert.equal(params.get('period'), '30');
  });
});

describe('Шифроване на тайната (AES-256-GCM)', () => {
  const key = Buffer.alloc(32, 1);

  test('обратимо; всеки път различен шифротекст (случаен IV)', () => {
    const a = encryptSecret(RFC_SECRET, key);
    const b = encryptSecret(RFC_SECRET, key);
    assert.notEqual(a, b);
    assert.equal(a.includes(RFC_SECRET), false);
    assert.equal(decryptSecret(a, key), RFC_SECRET);
  });

  test('подправка, чужд ключ, отрязан запис → грешка (не тих боклук)', () => {
    const enc = Buffer.from(encryptSecret(RFC_SECRET, key), 'base64');
    const tampered = Buffer.from(enc);
    tampered[tampered.length - 1] = (tampered.at(-1) ?? 0) ^ 1;
    assert.throws(() => decryptSecret(tampered.toString('base64'), key));
    assert.throws(() => decryptSecret(enc.toString('base64'), Buffer.alloc(32, 2)));
    assert.throws(() => decryptSecret(enc.subarray(0, 20).toString('base64'), key));
  });

  test('ключ, различен от 32 байта, се отказва', () => {
    assert.throws(() => encryptSecret('x', Buffer.alloc(16)), /32 байта/);
  });
});

describe('checkTotp и пазачът срещу повторение', () => {
  const key = Buffer.alloc(32, 3);
  const user = { id: 'u1', totpSecretEnc: encryptSecret(RFC_SECRET, key) };
  const now = () => Math.floor(Date.now() / 1000);

  test('верен код минава веднъж; същият код втори път — не; следващата стъпка — да', () => {
    const replay = new TotpReplayGuard();
    const code = totpCode(RFC_SECRET, now());
    assert.equal(checkTotp(key, replay, user, code), true);
    assert.equal(checkTotp(key, replay, user, code), false);
    assert.equal(checkTotp(key, replay, user, totpCode(RFC_SECRET, now() + 30)), true);
    replay.forget(user.id);
    assert.equal(replay.lastStep(user.id), null);
  });

  test('пазачът е по човек: кодът на един не блокира друг със същата тайна', () => {
    const replay = new TotpReplayGuard();
    const code = totpCode(RFC_SECRET, now());
    assert.equal(checkTotp(key, replay, user, code), true);
    assert.equal(checkTotp(key, replay, { ...user, id: 'u2' }, code), true);
  });

  test('без тайна, повреден запис или грешен ключ → false (fail-closed, не изключение)', () => {
    const replay = new TotpReplayGuard();
    const code = totpCode(RFC_SECRET, now());
    assert.equal(checkTotp(key, replay, { id: 'u3', totpSecretEnc: null }, code), false);
    assert.equal(checkTotp(key, replay, { id: 'u3', totpSecretEnc: 'боклук' }, code), false);
    assert.equal(checkTotp(Buffer.alloc(32, 9), replay, { ...user, id: 'u3' }, code), false);
  });
});

describe('MFA_ENC_KEY в конфигурацията', () => {
  const base = {
    PUBLIC_BASE_URL: 'https://chatchat.test',
    DATABASE_URL: 'postgresql://x',
    SESSION_PEPPER: 'p'.repeat(32),
  };

  test('32 байта в base64 → приема се и се връща като Buffer', () => {
    const value = Buffer.alloc(32, 5).toString('base64');
    const cfg = loadConfig({ ...base, MFA_ENC_KEY: value });
    assert.deepEqual(mfaKey(cfg), Buffer.alloc(32, 5));
  });

  test('липсващ, къс, hex вместо base64 → процесът не тръгва', () => {
    for (const bad of [
      undefined,
      Buffer.alloc(16).toString('base64'),
      'zz'.repeat(32),
      Buffer.alloc(32).toString('hex'),
    ]) {
      assert.throws(() => loadConfig({ ...base, MFA_ENC_KEY: bad }), /MFA_ENC_KEY/);
    }
  });
});
