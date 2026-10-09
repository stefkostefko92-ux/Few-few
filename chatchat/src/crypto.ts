import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/** Случаен токен, base64url. 32 байта = 256 бита. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** HMAC-SHA256 с „подправката“ от средата — в базата стои само това, не самият токен. */
export function hashToken(token: string, pepper: string): string {
  return createHmac('sha256', pepper).update(token).digest('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Сравнение без изтичане по време. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// ─── Шифроване на тайни в базата (TOTP) ──────────────────────────────────────────────────────
// Копирано от korpora/src/crypto.ts (продуктите не споделят код) и нагласено: ключът идва като
// Buffer от 32 байта (MFA_ENC_KEY в base64), не като hex низ.

const IV_BYTES = 12;
const TAG_BYTES = 16;

function checkKey(key: Buffer): Buffer {
  if (key.length !== 32) throw new Error('Ключът за шифроване трябва да е 32 байта');
  return key;
}

/** AES-256-GCM. Изход: base64(iv | tag | ciphertext) — подправка се открива при разшифроване. */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', checkKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptSecret(payload: string, key: Buffer): string {
  const raw = Buffer.from(payload, 'base64');
  if (raw.length <= IV_BYTES + TAG_BYTES) throw new Error('Повреден шифрован запис');
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', checkKey(key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
