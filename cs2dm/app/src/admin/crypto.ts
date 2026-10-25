import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Криптографията на панела — само `node:crypto`, нула зависимости. Моделът е korpora/piuma
 * (AES-256-GCM, хеширани токени, сравнение с постоянно време), кодът е свой.
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Случаен токен в base64url (без `+/=` — влиза в бисквитка и в скрито поле). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** HMAC-SHA256 върху UTF-8 байтовете на `text` — подписът на моста и на агента (§5, §9). */
export function hmacHex(key: string | Buffer, text: string): string {
  return createHmac('sha256', key).update(Buffer.from(text, 'utf8')).digest('hex');
}

/** Сравнение с постоянно време; различна дължина → false (дължината не е тайна). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Отделен ключ за всяка цел (HKDF-SHA256 от APP_ENC_KEY): изтекъл хеш на резервен код не помага
 * срещу шифъра на TOTP тайната и обратното.
 */
export function deriveKey(master: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), `cs2dm:${purpose}`, 32));
}

/**
 * AES-256-GCM. Изход: base64(iv | tag | шифротекст). `context` влиза като AAD — шифротекст,
 * преместен в реда на друг играч, не се разшифрова.
 */
export function encryptSecret(plaintext: string, key: Buffer, context: string): string {
  if (key.length !== 32) throw new Error('ключът за шифроване трябва да е 32 байта');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

export function decryptSecret(payload: string, key: Buffer, context: string): string {
  if (key.length !== 32) throw new Error('ключът за шифроване трябва да е 32 байта');
  const raw = Buffer.from(payload, 'base64');
  if (raw.length <= IV_BYTES + TAG_BYTES) throw new Error('повреден шифротекст');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([
    decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8');
}
