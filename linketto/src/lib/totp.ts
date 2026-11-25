// TOTP (RFC 6238 върху HOTP RFC 4226) — SHA-1, 6 цифри, стъпка 30 s: това, което
// поддържат Google Authenticator, Authy, 1Password, Bitwarden, Microsoft Authenticator.
// Без зависимости. Проверката е в константно време и с прозорец ±1 стъпка
// (часовник на телефона); `lastStep` пречи кодът да се ползва повторно.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer | null {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  if (!/^[A-Z2-7]*$/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Нов секрет: 20 случайни байта (160 бита, препоръката на RFC 4226) в base32. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** TOTP_DIGITS;
  return String(code).padStart(TOTP_DIGITS, '0');
}

export function totpStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

/**
 * Проверява код. Връща стъпката, на която е валиден (за запис като lastStep),
 * или null. Отказва стъпки ≤ lastStep — същият код не минава втори път.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { nowMs?: number; lastStep?: number | null; window?: number } = {},
): number | null {
  const secret = base32Decode(secretBase32);
  const digits = code.replace(/\s/g, '');
  if (!secret || secret.length < 10 || !/^\d{6}$/.test(digits)) return null;
  const now = totpStep(opts.nowMs);
  const window = opts.window ?? 1;
  let match: number | null = null;
  // Обхождаме целия прозорец без ранно излизане — еднакво време.
  for (let step = now - window; step <= now + window; step += 1) {
    const expected = Buffer.from(hotp(secret, step));
    const ok = timingSafeEqual(expected, Buffer.from(digits));
    if (ok && match === null) match = step;
  }
  if (match === null) return null;
  if (opts.lastStep != null && match <= opts.lastStep) return null;
  return match;
}

/** otpauth:// адрес за QR кода (издател и етикет са кодирани). */
export function otpauthUri(secretBase32: string, account: string, issuer = 'Linketto'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
