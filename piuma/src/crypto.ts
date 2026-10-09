import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyBuffer(hexKey: string): Buffer {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== 32) throw new Error('Ключът за криптиране трябва да е 32 байта');
  return key;
}

/** AES-256-GCM. Изход: base64(iv | tag | ciphertext). */
export function encryptSecret(plaintext: string, hexKey: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer(hexKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptSecret(payload: string, hexKey: string): string {
  const raw = Buffer.from(payload, 'base64');
  if (raw.length <= IV_BYTES + TAG_BYTES) throw new Error('Повреден шифрован токен');
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', keyBuffer(hexKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Сравнение в константно време — за bearer токена на админ маршрутите. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** OAuth `state`: nonce.expiry.hmac — CSRF защита без сесия в базата. */
export function signState(payload: string, secret: string, ttlSeconds = 600): string {
  const nonce = randomBytes(16).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = `${nonce}.${expiresAt}.${payload}`;
  const mac = createHmac('sha256', secret).update(body).digest('hex');
  return `${body}.${mac}`;
}

export function verifyState(state: string, secret: string): string | null {
  const parts = state.split('.');
  if (parts.length !== 4) return null;
  const [nonce, expiresAt, payload, mac] = parts as [string, string, string, string];
  const body = `${nonce}.${expiresAt}.${payload}`;
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  if (!safeEqual(mac, expected)) return null;
  if (Number(expiresAt) < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
