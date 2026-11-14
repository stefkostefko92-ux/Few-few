// Двуфакторно влизане — TOTP (RFC 6238 върху HOTP, RFC 4226), без външни зависимости.
//
// Работи с всяко приложение за кодове (Google Authenticator, Microsoft Authenticator,
// 1Password, Aegis…): 6 цифри, 30-секундна стъпка, HMAC-SHA1 — това е профилът, който
// ВСИЧКИ поддържат (SHA-256/8 цифри част от приложенията тихо пренебрегват).
//
// Тайната се пази ШИФРОВАНА (AES-256-GCM): изтекло копие на базата без ключа от
// сървъра не дава кодовете. Ключът е от ACCOUNT_SECRET, а ако го няма — от
// PRINT_API_SECRET (задължителен в продукция). Шифротекстът носи етикет кой ключ е
// ползван, затова по-късното добавяне на ACCOUNT_SECRET НЕ заключва вече включените 2FA.
import crypto from 'node:crypto';
import { seal, unseal, sealAvailable } from './seal.js';

const STEP_SECONDS = 30;
const DIGITS = 6;
// ±1 стъпка: часовникът на телефона рядко е точен до секунда. По-широк прозорец
// само увеличава шанса за налучкване.
const WINDOW = 1;

// ── Base32 (RFC 4648, без подравняване) — форматът, който приложенията очакват ──
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str)
    .toUpperCase()
    .replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error('Невалиден base32 знак.');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// 160 бита — размерът, който RFC 4226 препоръчва за HMAC-SHA1.
export const generateSecret = () => base32Encode(crypto.randomBytes(20));

export function hotp(secretB32, counter) {
  const key = base32Decode(secretB32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(code).padStart(DIGITS, '0');
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

/**
 * Проверява код. Връща стъпката, на която е валиден, или null.
 * `lastStep` е последната вече ползвана стъпка — код от нея или по-стара се отказва,
 * за да не може един и същ код да се ползва два пъти (повторение на прихванат код).
 */
export function verifyTotp(secretB32, code, { lastStep = 0, now = Date.now() } = {}) {
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const step = currentStep(now);
  for (let d = -WINDOW; d <= WINDOW; d++) {
    const s = step + d;
    if (s <= lastStep) continue;
    const expected = hotp(secretB32, s);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return s;
  }
  return null;
}

// otpauth:// адрес за QR кода. Издателят е марката, акаунтът — имейлът: така
// приложението показва „Vizitka (ivan@…)“ сред другите кодове.
export function otpauthUri(secretB32, accountName, issuer = 'Vizitka') {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params}`;
}

// ── Резервни кодове: за изгубен телефон. Пазим само хеша; показват се веднъж. ──
// 10 знака от азбука без двусмислени символи (0/O, 1/l/I), във вид xxxxx-xxxxx.
const RC_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function generateRecoveryCodes(n = 10) {
  return Array.from({ length: n }, () => {
    const bytes = crypto.randomBytes(10);
    const s = [...bytes].map((b) => RC_ALPHABET[b % RC_ALPHABET.length]).join('');
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}
export const normalizeRecoveryCode = (code) =>
  String(code || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
export const hashRecoveryCode = (code) =>
  crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');

// ── Шифроване на тайната (AES-256-GCM, ключ през HKDF — src/seal.js) ───────────
// `info` е същият като преди изнасянето в seal.js — вече включените 2FA се четат без промяна.
const TOTP_INFO = 'vizitka/totp-at-rest/v1';
export const encryptSecret = (plain) => seal(TOTP_INFO, plain);
// null при грешен/липсващ ключ — извикващият ОТКАЗВА входа (fail closed), никога
// не го пропуска. Резервните кодове не зависят от ключа и остават изход.
export const decryptSecret = (stored) => unseal(TOTP_INFO, stored);
export const totpAvailable = sealAvailable;
