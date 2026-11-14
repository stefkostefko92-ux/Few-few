import crypto from 'node:crypto';

// Криптиране „в покой" (encryption at rest) на чувствителните медицински полета
// с AES-256-GCM. Форматът на записа е base64( iv(12) || tag(16) || ciphertext ).
// Ключът ИДВА ОТ ОКОЛНАТА СРЕДА — никога не се пази в кода или базата.

function loadKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw) {
    const key = Buffer.from(raw, raw.length === 64 ? 'hex' : 'base64');
    if (key.length !== 32) {
      throw new Error('ENCRYPTION_KEY трябва да е 32 байта (64 hex или base64).');
    }
    return key;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY е задължителен в продукция.');
  }
  // Само за разработка/тест: детерминиран ключ, за да тръгне приложението.
  console.warn('[ВНИМАНИЕ] ENCRYPTION_KEY не е зададен — ползва се ДЕВ ключ. НЕ за продукция!');
  return crypto.createHash('sha256').update('medqr-dev-key-do-not-use-in-prod').digest();
}

const KEY = loadKey();

// MAC ключ с отделен домейн (не ползваме KEY директно за подписване).
const MAC_KEY = crypto.createHmac('sha256', KEY).update('medqr-mac-v1').digest();

// Подписване (HMAC-SHA256, base64url) — напр. за доказателство „PIN е въведен".
export function mac(data) {
  return crypto.createHmac('sha256', MAC_KEY).update(String(data)).digest('base64url');
}

// Сравнение в константно време на два низа.
export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function encrypt(plain) {
  if (plain == null || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decrypt(stored) {
  if (stored == null || stored === '') return '';
  try {
    const buf = Buffer.from(stored, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    // Повреден запис или сменен ключ — не разкриваме нищо.
    return '';
  }
}
