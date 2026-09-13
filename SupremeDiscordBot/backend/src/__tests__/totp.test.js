// backend/src/__tests__/totp.test.js
// Коректността на нашата TOTP реализация се доказва с ПУБЛИЧНИТЕ вектори на
// стандартите, не с „работи с моя телефон“:
//   • RFC 4226 Приложение D — HOTP за броячи 0..9 с тайна "12345678901234567890"
//   • RFC 6238 Приложение B — TOTP (SHA-1, 8 цифри) за шест момента във времето
import { describe, it, expect } from "vitest";
import {
  base32Encode, base32Decode, hotp, totp, verifyTotp, generateSecret, otpauthUri,
  generateBackupCodes, hashBackupCode, consumeBackupCode, totpStep,
} from "../lib/totp.js";

const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");

describe("HOTP — RFC 4226 Приложение D", () => {
  const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  it.each(expected.map((c, i) => [i, c]))("брояч %i → %s", (counter, code) => {
    expect(hotp(RFC_SECRET, counter)).toBe(code);
  });
});

describe("TOTP — RFC 6238 Приложение B (SHA-1, 8 цифри)", () => {
  const vectors = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  it.each(vectors)("T=%i → %s", (t, code) => {
    expect(totp(RFC_SECRET, { nowMs: t * 1000, digits: 8 })).toBe(code);
  });

  it("6-цифреният код е последните 6 цифри на 8-цифрения (същото отрязване)", () => {
    expect(totp(RFC_SECRET, { nowMs: 59 * 1000 })).toBe("287082");
  });
});

describe("base32", () => {
  it("кодира/декодира обратимо и приема малки букви, интервали и тирета", () => {
    const buf = Buffer.from("Hello, TOTP! é", "utf8");
    const enc = base32Encode(buf);
    expect(enc).toMatch(/^[A-Z2-7]+$/);
    expect(base32Decode(enc)).toEqual(buf);
    expect(base32Decode(enc.toLowerCase().replace(/(.{4})/g, "$1 "))).toEqual(buf);
  });
  it("RFC 4648 вектор: 'foobar' → MZXW6YTBOI", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
  });
  it("отхвърля невалидни знаци", () => {
    expect(() => base32Decode("MZXW6YTB01")).toThrow();
  });
});

describe("verifyTotp — прозорец, replay, формат", () => {
  const secret = generateSecret();
  const now = 1_700_000_000_000;

  it("приема текущия код и ±1 стъпка, отхвърля ±2", () => {
    const cur = totpStep(now);
    expect(verifyTotp(secret, hotp(secret, cur), { nowMs: now })).toBe(cur);
    expect(verifyTotp(secret, hotp(secret, cur - 1), { nowMs: now })).toBe(cur - 1);
    expect(verifyTotp(secret, hotp(secret, cur + 1), { nowMs: now })).toBe(cur + 1);
    expect(verifyTotp(secret, hotp(secret, cur + 2), { nowMs: now })).toBeNull();
    expect(verifyTotp(secret, hotp(secret, cur - 2), { nowMs: now })).toBeNull();
  });

  it("replay: стъпка ≤ minStep се отхвърля дори кодът да е верен", () => {
    const cur = totpStep(now);
    expect(verifyTotp(secret, hotp(secret, cur), { nowMs: now, minStep: cur })).toBeNull();
    expect(verifyTotp(secret, hotp(secret, cur + 1), { nowMs: now, minStep: cur })).toBe(cur + 1);
  });

  it("грешна дължина, букви, празно → null (без изключение)", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", null, undefined, "12 34 5"]) {
      expect(verifyTotp(secret, bad, { nowMs: now })).toBeNull();
    }
    // интервалите вътре се търпят (хората ги преписват на групи)
    const cur = totpStep(now);
    const code = hotp(secret, cur);
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, { nowMs: now })).toBe(cur);
  });

  it("грешна тайна → null", () => {
    const cur = totpStep(now);
    expect(verifyTotp(generateSecret(), hotp(secret, cur), { nowMs: now })).toBeNull();
  });
});

describe("otpauth URI и тайна", () => {
  it("тайната е 160 бита base32; URI-то носи issuer, account и параметрите на Google Authenticator", () => {
    const secret = generateSecret();
    expect(base32Decode(secret).length).toBe(20);
    const uri = otpauthUri({ issuer: "Supreme Bot", account: "stefan#0", secret });
    expect(uri.startsWith("otpauth://totp/Supreme%20Bot:stefan%230?")).toBe(true);
    const u = new URL(uri);
    expect(u.searchParams.get("secret")).toBe(secret);
    expect(u.searchParams.get("issuer")).toBe("Supreme Bot");
    expect(u.searchParams.get("algorithm")).toBe("SHA1");
    expect(u.searchParams.get("digits")).toBe("6");
    expect(u.searchParams.get("period")).toBe("30");
  });
});

describe("резервни кодове", () => {
  it("10 кода, формат XXXXX-XXXXX без 0/1/8, хешове са SHA-256, консумацията е еднократна", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    for (const c of codes) expect(c).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ2345679]{5}-[ABCDEFGHJKLMNPQRSTUVWXYZ2345679]{5}$/);
    const hashes = codes.map(hashBackupCode);
    expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/);
    const after = consumeBackupCode(codes[3].toLowerCase(), hashes);
    expect(after).toHaveLength(9);
    expect(consumeBackupCode(codes[3], after)).toBeNull();
    expect(consumeBackupCode("nope-nope", hashes)).toBeNull();
  });
});
