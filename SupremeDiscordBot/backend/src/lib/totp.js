// backend/src/lib/totp.js
// TOTP (RFC 6238) върху HOTP (RFC 4226) — нула зависимости, само node:crypto.
//
// ЗАЩО СВОЯ, а не пакет: повърхността е малка (base32 + HMAC-SHA1 + динамично
// отрязване), стандартите са замразени от 2005/2011 г. и имат ПУБЛИЧНИ тестови
// вектори (RFC 4226 Приложение D, RFC 6238 Приложение B) — тоест коректността
// се доказва с тест, не с доверие в npm. Всяка зависимост в паричния/входния път
// е supply-chain риск (виж SECURITY.md, dependency-review в CI).
//
// Параметрите са тези на Google Authenticator / Authy / 1Password / Aegis:
// SHA-1, 6 цифри, 30 s стъпка, T0 = 0. Не ги променяй „за по-сигурно“ —
// повечето приложения игнорират algorithm/digits/period в otpauth URI-то и
// кодовете просто спират да съвпадат.
import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 (RFC 4648) без padding — форматът, който четат authenticator приложенията. */
export function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[=\s-]/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226): HMAC-SHA1 + динамично отрязване, `digits` цифри с водещи нули. */
export function hotp(secret, counter, digits = 6) {
  const key = Buffer.isBuffer(secret) ? secret : base32Decode(secret);
  const msg = Buffer.alloc(8);
  // Броячът е 64-битов big-endian; JS числата са точни до 2^53 — за TOTP стъпки
  // (≈ 5.8·10^7 за 2026 г.) е предостатъчно.
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const TOTP_STEP_SEC = 30;
export const TOTP_DIGITS = 6;

/** Номерът на времевата стъпка за даден момент (ms). */
export function totpStep(nowMs = Date.now(), stepSec = TOTP_STEP_SEC) {
  return Math.floor(nowMs / 1000 / stepSec);
}

export function totp(secret, { nowMs = Date.now(), stepSec = TOTP_STEP_SEC, digits = TOTP_DIGITS } = {}) {
  return hotp(secret, totpStep(nowMs, stepSec), digits);
}

/**
 * Проверява код в прозорец ±window стъпки (по подразбиране ±1 = 90 s толеранс
 * за часовника на телефона). Връща НОМЕРА НА СТЪПКАТА при успех (за защита от
 * повторно ползване — един код важи веднъж) или null.
 * `minStep`: стъпки ≤ minStep се отхвърлят — това е replay защитата.
 */
export function verifyTotp(secret, code, { nowMs = Date.now(), window = 1, stepSec = TOTP_STEP_SEC, digits = TOTP_DIGITS, minStep = -1 } = {}) {
  const given = String(code ?? "").replace(/\s+/g, "");
  if (!/^\d+$/.test(given) || given.length !== digits) return null;
  const current = totpStep(nowMs, stepSec);
  const givenBuf = Buffer.from(given);
  for (let delta = -window; delta <= window; delta++) {
    const step = current + delta;
    if (step <= minStep) continue;
    const expected = Buffer.from(hotp(secret, step, digits));
    if (expected.length === givenBuf.length && timingSafeEqual(expected, givenBuf)) return step;
  }
  return null;
}

/** 160-битова тайна (препоръката на RFC 4226 §4 за HMAC-SHA1), base32. */
export function generateSecret(bytes = 20) {
  return base32Encode(randomBytes(bytes));
}

/** otpauth:// URI по спецификацията на Key Uri Format (Google Authenticator). */
export function otpauthUri({ issuer, account, secret, digits = TOTP_DIGITS, period = TOTP_STEP_SEC }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(digits), period: String(period) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ─── Резервни кодове ────────────────────────────────────────────────────────
// 10 кода по 10 знака (base32 азбука без объркващите 0/1/8 → четими на хартия),
// показани ЕДИН път; в базата стоят само SHA-256 хешовете. Кодът е за еднократна
// употреба (консумира се при ползване).

const BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ2345679";

export function generateBackupCodes(count = 10, length = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(length);
    let s = "";
    for (let j = 0; j < length; j++) s += BACKUP_ALPHABET[bytes[j] % BACKUP_ALPHABET.length];
    codes.push(`${s.slice(0, 5)}-${s.slice(5)}`);
  }
  return codes;
}

export function normalizeBackupCode(code) {
  return String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashBackupCode(code) {
  return createHash("sha256").update(normalizeBackupCode(code)).digest("hex");
}

/**
 * Проверява резервен код срещу списък от хешове; при успех връща НОВИЯ списък
 * без консумирания хеш, иначе null. Сравнението е с константно време.
 */
export function consumeBackupCode(code, hashes) {
  const h = Buffer.from(hashBackupCode(code));
  let hit = -1;
  for (let i = 0; i < hashes.length; i++) {
    const c = Buffer.from(String(hashes[i]));
    if (c.length === h.length && timingSafeEqual(c, h)) hit = i;
  }
  if (hit === -1) return null;
  return hashes.filter((_, i) => i !== hit);
}
