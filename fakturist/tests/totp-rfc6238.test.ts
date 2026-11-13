import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  TOTP_DIGITS,
  TOTP_STEP_SECONDS,
  base32Decode,
  base32Encode,
  generateTotpSecret,
  isTotpCode,
  otpauthUrl,
  readableSecret,
  totpCodeAt,
  totpStep,
  verifyTotp,
} from '../src/auth/totp.js';

/**
 * RFC 6238, приложение B: тайна ASCII „12345678901234567890“ (SHA-1), стъпка 30 s. Официалните кодове са
 * с 8 цифри; нашата реализация е с 6 (`TOTP_DIGITS`), а 6-цифреният код е последните 6 от 8-цифрения:
 * и в двата случая е `binary mod 10^n`, а 10^6 дели 10^8.
 */
const SECRET_ASCII = '12345678901234567890';
const SECRET = base32Encode(Buffer.from(SECRET_ASCII, 'ascii'));

const VECTORS = [
  { time: 59, step: 1, code8: '94287082' },
  { time: 1111111109, step: 37037036, code8: '07081804' },
  { time: 1111111111, step: 37037037, code8: '14050471' },
  { time: 1234567890, step: 41152263, code8: '89005924' },
  { time: 2000000000, step: 66666666, code8: '69279037' },
  { time: 20000000000, step: 666666666, code8: '65353130' },
] as const;

describe('RFC 6238 приложение B (SHA-1)', () => {
  test('нашата реализация е с 6 цифри и 30-секундна стъпка (допускането на сравнението)', () => {
    assert.equal(TOTP_DIGITS, 6);
    assert.equal(TOTP_STEP_SECONDS, 30);
  });

  test('тайната в base32 е каноничната за ключа от RFC', () => {
    assert.equal(SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  for (const { time, step, code8 } of VECTORS) {
    test(`T=${time}: стъпка ${step}, 6-цифреният код е последните 6 от ${code8}`, () => {
      assert.equal(totpStep(time), step);
      assert.equal(totpCodeAt(SECRET, step), code8.slice(-6));
    });
  }

  test('код с водещи нули се запазва с 6 знака (T=1111111109 → 081804)', () => {
    assert.equal(totpCodeAt(SECRET, 37037036), '081804');
  });

  test('границите на стъпката: 29 s и 30 s са в различни стъпки, 30 и 59 s — в една', () => {
    assert.equal(totpStep(29), 0);
    assert.equal(totpStep(30), 1);
    assert.equal(totpStep(59), 1);
    assert.equal(totpStep(60), 2);
  });

  test('приема се и тайна с интервали, малки букви и без допълване (приложенията я пишат така)', () => {
    const typed = readableSecret(SECRET).toLowerCase();
    assert.match(typed, / /);
    assert.equal(totpCodeAt(typed, 1), '287082');
  });
});

describe('verifyTotp: прозорец, повторение, форма на кода', () => {
  const now = 1111111111; // стъпка 37037037
  const current = 37037037;

  test('верен код за текущата стъпка връща стъпката', () => {
    assert.equal(verifyTotp(SECRET, '050471', null, now), current);
  });

  test('приема се с интервали в кода (както се показва в приложенията)', () => {
    assert.equal(verifyTotp(SECRET, '050 471', null, now), current);
  });

  test('приема предишната и следващата стъпка (разминат часовник ±30 s)', () => {
    assert.equal(verifyTotp(SECRET, totpCodeAt(SECRET, current - 1), null, now), current - 1);
    assert.equal(verifyTotp(SECRET, totpCodeAt(SECRET, current + 1), null, now), current + 1);
  });

  test('отхвърля код отвъд ±1 стъпка', () => {
    assert.equal(verifyTotp(SECRET, totpCodeAt(SECRET, current - 2), null, now), null);
    assert.equal(verifyTotp(SECRET, totpCodeAt(SECRET, current + 2), null, now), null);
  });

  test('прихванат код не минава втори път: стъпка ≤ последно приетата се отхвърля', () => {
    assert.equal(verifyTotp(SECRET, '050471', current, now), null);
    assert.equal(verifyTotp(SECRET, totpCodeAt(SECRET, current - 1), current, now), null);
  });

  test('след приета стъпка се приема само по-нова (следващата е позволена)', () => {
    assert.equal(verifyTotp(SECRET, totpCodeAt(SECRET, current + 1), current, now), current + 1);
  });

  test('грешен код и код с друга тайна са отхвърлени', () => {
    assert.equal(verifyTotp(SECRET, '000000', null, now), null);
    const other = base32Encode(Buffer.from('ABCDEFGHIJKLMNOPQRST', 'ascii'));
    assert.equal(verifyTotp(other, '050471', null, now), null);
  });

  test('не-кодове (кратки, дълги, букви, празни, резервен код) са отхвърлени без изключение', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', '05047a', 'ABCD-EFGH', '１２３４５６']) {
      assert.equal(verifyTotp(SECRET, bad, null, now), null, JSON.stringify(bad));
    }
  });

  test('без подадено време ползва часовника (прозорец около сега)', () => {
    const step = totpStep(Math.floor(Date.now() / 1000));
    assert.equal(verifyTotp(SECRET, totpCodeAt(SECRET, step), null), step);
  });
});

describe('isTotpCode', () => {
  test('точно 6 цифри, интервалите не се броят', () => {
    assert.equal(isTotpCode('123456'), true);
    assert.equal(isTotpCode(' 123 456 '), true);
    assert.equal(isTotpCode('12345'), false);
    assert.equal(isTotpCode('1234567'), false);
    assert.equal(isTotpCode('12345a'), false);
  });
});

describe('base32 (RFC 4648) и помощните за приложението', () => {
  test('векторите от RFC 4648 §10 (без допълване)', () => {
    const vectors: Array<[string, string]> = [
      ['f', 'MY'],
      ['fo', 'MZXQ'],
      ['foo', 'MZXW6'],
      ['foob', 'MZXW6YQ'],
      ['fooba', 'MZXW6YTB'],
      ['foobar', 'MZXW6YTBOI'],
    ];
    for (const [plain, encoded] of vectors) {
      assert.equal(base32Encode(Buffer.from(plain)), encoded, plain);
      assert.equal(base32Decode(encoded).toString(), plain, encoded);
    }
  });

  test('кодиране и разкодиране са обратни за случайни ключове', () => {
    for (let i = 0; i < 20; i += 1) {
      const secret = generateTotpSecret();
      assert.match(secret, /^[A-Z2-7]{32}$/);
      assert.equal(base32Encode(base32Decode(secret)), secret);
      assert.equal(base32Decode(secret).length, 20);
    }
  });

  test('генерираните тайни се различават', () => {
    assert.notEqual(generateTotpSecret(), generateTotpSecret());
  });

  test('readableSecret — групи по 4, без краен интервал; обратимо до същата тайна', () => {
    assert.equal(readableSecret('ABCDEFGHIJ'), 'ABCD EFGH IJ');
    assert.equal(readableSecret('ABCDEFGH'), 'ABCD EFGH');
    assert.equal(base32Decode(readableSecret(SECRET)).toString('ascii'), SECRET_ASCII);
  });

  test('otpauth адресът носи тайната, издателя, SHA1, 6 цифри и 30 s', () => {
    const url = new URL(otpauthUrl('Фактурист', 'user@example.test', SECRET));
    assert.equal(url.protocol, 'otpauth:');
    assert.equal(url.host, 'totp');
    assert.equal(decodeURIComponent(url.pathname), '/Фактурист:user@example.test');
    assert.equal(url.searchParams.get('secret'), SECRET);
    assert.equal(url.searchParams.get('issuer'), 'Фактурист');
    assert.equal(url.searchParams.get('algorithm'), 'SHA1');
    assert.equal(url.searchParams.get('digits'), '6');
    assert.equal(url.searchParams.get('period'), '30');
  });
});
