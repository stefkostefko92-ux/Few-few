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
