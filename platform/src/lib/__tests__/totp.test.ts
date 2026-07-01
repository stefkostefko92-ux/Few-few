import { test } from "node:test";
import assert from "node:assert/strict";
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  totp,
  verifyTotp,
  otpauthUri,
} from "@/lib/totp";

// RFC 6238 тестов вектор: SHA-1, тайна ASCII "12345678901234567890".
const RFC_SECRET = base32Encode(new TextEncoder().encode("12345678901234567890"));

test("base32 е обратим", () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(new Uint8Array(base32Decode(base32Encode(bytes))), bytes);
});

test("totp съвпада с RFC 6238 вектор (T=59 → 287082)", () => {
  assert.equal(totp(RFC_SECRET, 59_000), "287082");
  // T=1111111109 → 081804
  assert.equal(totp(RFC_SECRET, 1111111109_000), "081804");
});

test("verifyTotp приема валиден и отхвърля невалиден код", () => {
  assert.ok(verifyTotp(RFC_SECRET, "287082", 59_000));
  assert.ok(!verifyTotp(RFC_SECRET, "000000", 59_000));
  assert.ok(!verifyTotp(RFC_SECRET, "abc", 59_000));
  assert.ok(!verifyTotp(RFC_SECRET, "28708", 59_000)); // 5 цифри
});

test("verifyTotp толерира ±1 стъпка (30 сек)", () => {
  const code = totp(RFC_SECRET, 60_000);
  assert.ok(verifyTotp(RFC_SECRET, code, 60_000 + 29_000)); // в рамките на прозореца
});

test("generateTotpSecret дава валиден base32", () => {
  const s = generateTotpSecret();
  assert.match(s, /^[A-Z2-7]+$/);
  assert.ok(s.length >= 30);
});

test("otpauthUri е коректен", () => {
  const uri = otpauthUri("ABC234", "user@example.com");
  assert.ok(uri.startsWith("otpauth://totp/"));
  assert.match(uri, /secret=ABC234/);
  assert.match(uri, /issuer=Carbon\+Stealth/);
});
