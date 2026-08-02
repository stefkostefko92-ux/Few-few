// TOTP (RFC 6238) — втори фактор на входа. Нула зависимости: node:crypto HMAC-SHA1.
// Панелът дава root контрол над сървъра — една парола не стига.
import crypto from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SEC = 30;
const DIGITS = 6;

export function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

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
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw Object.assign(new Error('Невалиден base32 знак'), { status: 400 });
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// HOTP (RFC 4226) — динамично отрязване на HMAC-SHA1.
export function hotp(secretB32, counter) {
  const key = base32Decode(secretB32);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const mac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function totp(secretB32, atMs = Date.now()) {
  return hotp(secretB32, Math.floor(atMs / 1000 / STEP_SEC));
}

// Проверка с прозорец ±1 стъпка (толерира разминаване на часовника).
// Връща стъпката, с която е минал кодът — извикващият я пази срещу повторение.
export function verifyTotp(secretB32, code, { atMs = Date.now(), window = 1 } = {}) {
  const clean = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const step = Math.floor(atMs / 1000 / STEP_SEC);
  for (let d = -window; d <= window; d++) {
    const expected = hotp(secretB32, step + d);
    const a = Buffer.from(expected);
    const b = Buffer.from(clean);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return step + d;
  }
  return null;
}

// ── Резервни кодове ───────────────────────────────────────────────────────────
// Загубен телефон = заключен си извън СОБСТВЕНИЯ си сървър. Затова: 10 еднократни
// кода. Пазят се ХЕШИРАНИ (NIST SP 800-63B иска look-up secrets да не стоят в
// чист вид) — открадне ли някой конфига, кодовете не му вършат работа наготово.
const RECOVERY_COUNT = 10;

export function generateRecoveryCodes(count = RECOVERY_COUNT) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    // 4 групи по 4 = 64 бита ентропия, четимо и преписваемо на ръка.
    const raw = crypto.randomBytes(8).toString('hex').toUpperCase();
    codes.push(raw.match(/.{1,4}/g).join('-'));
  }
  return codes;
}

export function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(normalizeRecovery(code)).digest('base64url').slice(0, 32);
}

export function normalizeRecovery(code) {
  return String(code || '').toUpperCase().replace(/[^0-9A-F]/g, '');
}

// Проверява код срещу списъка хешове. Връща индекса (за да го изразходваме) или
// -1. Сравнението е времево-константно.
export function verifyRecoveryCode(code, hashes) {
  const normalized = normalizeRecovery(code);
  if (normalized.length < 8) return -1;
  const candidate = Buffer.from(hashRecoveryCode(normalized));
  let found = -1;
  for (let i = 0; i < (hashes || []).length; i++) {
    const stored = Buffer.from(String(hashes[i] || ''));
    if (stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate)) found = i;
  }
  return found;
}

// otpauth:// URI за Google Authenticator/Aegis/1Password (ръчно или през QR).
export function otpauthUri(secretB32, { issuer = 'Carbon Stealth VPS', account = 'admin' } = {}) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SEC),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
