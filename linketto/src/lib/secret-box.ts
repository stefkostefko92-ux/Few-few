// Шифроване на тайни в покой (ключове на доставчици, TOTP секрети) — AES-256-GCM.
// Главният ключ е САМО в .env на сървъра (SETTINGS_KEY, 32 байта base64; генерира
// го autodeploy). Ротация: новият ключ в SETTINGS_KEY, старият в SETTINGS_KEY_OLD —
// четенето пробва и двата, записът е винаги с новия.
//
// Формат: v1.<keyId>.<iv b64url>.<tag b64url>.<ciphertext b64url>
// keyId = първите 8 hex на sha256(ключа) — при грешен ключ дешифрирането е
// отказ, не боклук. AAD = контекстът (напр. „setting:revolut.secretKey“) —
// шифрираното за едно поле не може да се подмени в друго.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

type Key = { id: string; bytes: Buffer };

function parseKey(raw: string | undefined): Key | null {
  if (!raw) return null;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(raw.trim(), 'base64');
  } catch {
    return null;
  }
  if (bytes.length !== 32) return null;
  return { id: createHash('sha256').update(bytes).digest('hex').slice(0, 8), bytes };
}

export type KeyRing = { current: Key | null; old: Key | null };

export function keyRingFrom(env: { SETTINGS_KEY?: string; SETTINGS_KEY_OLD?: string }): KeyRing {
  return { current: parseKey(env.SETTINGS_KEY), old: parseKey(env.SETTINGS_KEY_OLD) };
}

export function keyRing(): KeyRing {
  return keyRingFrom({ SETTINGS_KEY: process.env.SETTINGS_KEY, SETTINGS_KEY_OLD: process.env.SETTINGS_KEY_OLD });
}

/** Има ли главен ключ — без него шифрованите настройки и 2FA са изключени (fail-closed). */
export function canSeal(ring: KeyRing = keyRing()): boolean {
  return ring.current !== null;
}

const b64 = (buf: Buffer) => buf.toString('base64url');

export function seal(plaintext: string, context: string, ring: KeyRing = keyRing()): string {
  const key = ring.current;
  if (!key) throw new Error('SETTINGS_KEY липсва или не е 32 байта base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key.bytes, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', key.id, b64(iv), b64(cipher.getAuthTag()), b64(ct)].join('.');
}

/** null при грешен ключ, подменен контекст, повреден запис — никога изключение. */
export function open(sealed: string, context: string, ring: KeyRing = keyRing()): string | null {
  const parts = sealed.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1') return null;
  const [, keyId, iv, tag, ct] = parts as [string, string, string, string, string];
  const key = [ring.current, ring.old].find((k) => k?.id === keyId);
  if (!key) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key.bytes, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Трябва ли записът да се презапише с текущия ключ (след ротация). */
export function needsReseal(sealed: string, ring: KeyRing = keyRing()): boolean {
  return !!ring.current && sealed.split('.')[1] !== ring.current.id;
}
