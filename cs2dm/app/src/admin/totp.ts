import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { hmacHex } from './crypto.js';

/**
 * TOTP по RFC 6238 (HMAC-SHA1, 6 цифри, 30 s) и резервните кодове — нула зависимости.
 * Проверката приема ±1 стъпка за разминаване на часовниците, но никога стъпка ≤ последно приетата:
 * прихванат код не минава втори път (стъпката се пази в `players.totp_last_step`).
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_ISSUER = 'CarbonStealth.eu Dust2 DM';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 20 случайни байта (160 бита — препоръката на RFC 4226) в base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(nowSeconds: number): number {
  return Math.floor(nowSeconds / TOTP_STEP_SECONDS);
}

/** Кодът за дадена стъпка; `digits` е параметър само заради тестовите вектори на RFC (8 цифри). */
export function totpAt(secret: Buffer, step: number, digits = TOTP_DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', secret).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function isTotpCode(input: string): boolean {
  return /^\d{6}$/.test(input.replace(/\s+/g, ''));
}

/** Приетата стъпка или null (грешен код, повторен код, извън прозореца). */
export function verifyTotp(
  secretBase32: string,
  input: string,
  lastStep: number | null,
  nowSeconds: number,
): number | null {
  const given = input.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(given)) return null;
  const secret = base32Decode(secretBase32);
  const current = totpStep(nowSeconds);
  for (const drift of [-1, 0, 1]) {
    const step = current + drift;
    if (lastStep !== null && step <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(totpAt(secret, step)), Buffer.from(given))) return step;
  }
  return null;
}

export function otpauthUrl(account: string, secretBase32: string): string {
  const label = encodeURIComponent(`${TOTP_ISSUER}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Тайната на групи по 4 — за преписване на ръка, ако QR кодът не може да се сканира. */
export function groupSecret(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ');
}

// ── Резервни кодове ──────────────────────────────────────────────────────────

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 10;
export const RECOVERY_CODE_COUNT = 10;

function formatCode(clean: string): string {
  return `${clean.slice(0, CODE_LENGTH / 2)}-${clean.slice(CODE_LENGTH / 2)}`;
}

/** Кодове „xxxxx-xxxxx“ без двусмислени знаци (без i, l, o, 0, 1) — ~49 бита всеки. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    return formatCode(code);
  });
}

/** Въведеното във вида „xxxxx-xxxxx“ или празно, ако не е резервен код. */
export function normalizeRecoveryCode(input: string): string {
  const clean = input.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (clean.length !== CODE_LENGTH) return '';
  return [...clean].every((char) => CODE_ALPHABET.includes(char)) ? formatCode(clean) : '';
}

/** В базата е само HMAC с ключ от APP_ENC_KEY — изтекла таблица не издава кодовете. */
export function hashRecoveryCode(key: Buffer, steamId: string, code: string): string {
  return hmacHex(key, `${steamId}:${code}`);
}
