import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP по RFC 6238 (HMAC-SHA1, 6 цифри, 30 s), нула зависимости. Приема ±1 стъпка за часовников
 * дрейф. Копирано от korpora/src/auth/totp.ts (продуктите не споделят код) — същият алгоритъм,
 * проверен с векторите от приложение B на RFC 6238 (tests/totp.test.ts).
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const CODE_RE = new RegExp(`^\\d{${TOTP_DIGITS}}$`);

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

/** 160 бита — препоръчаната дължина за HMAC-SHA1 (RFC 4226 §4). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(timeSeconds: number): number {
  return Math.floor(timeSeconds / TOTP_STEP_SECONDS);
}

function totpCodeAt(secretBase32: string, step: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', base32Decode(secretBase32)).update(message).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const byte = (i: number): number => digest[offset + i] ?? 0;
  const binary = ((byte(0) & 0x7f) << 24) | (byte(1) << 16) | (byte(2) << 8) | byte(3);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function totpCode(secretBase32: string, timeSeconds: number): string {
  return totpCodeAt(secretBase32, totpStep(timeSeconds));
}

/** Код от приложението (TOTP_DIGITS цифри, интервалите не се броят). */
export function isTotpCode(code: string): boolean {
  return CODE_RE.test(code.replace(/\s+/g, ''));
}

/**
 * Връща приетата стъпка или null. Стъпка, по-малка или равна на последно приетата, се отхвърля —
 * така прихванат код не може да се ползва втори път в същия прозорец.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  lastStep: number | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): number | null {
  if (!isTotpCode(code)) return null;
  const given = code.replace(/\s+/g, '');
  const current = totpStep(nowSeconds);
  for (const drift of [-1, 0, 1]) {
    const step = current + drift;
    if (lastStep !== null && step <= lastStep) continue;
    const expected = totpCodeAt(secretBase32, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return step;
  }
  return null;
}

export function otpauthUrl(issuer: string, account: string, secretBase32: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
