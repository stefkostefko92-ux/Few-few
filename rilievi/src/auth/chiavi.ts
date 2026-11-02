import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { config } from '../config.js';

/**
 * Ключовете на входа — изведени (HKDF-SHA256, отделен етикет за всяко предназначение) от
 * INTERVENTI_SEAL_KEY: той е тайната на сървъра, която по правило НЕ се сменя и е в бекъпа на тайните
 * (DEPLOY.md, т. 1). Затова шифрованите тайни на 2FA и HMAC-ите на резервните кодове преживяват
 * рестарт, нов release и смяна на JWT_SECRET. Изведените ключове са независими един от друг и от печата
 * на листовете — познат един не издава другите. Нов етикет (`…-v2`) = нов ключ.
 */

const SALT = 'rilievi';
const IV_BYTES = 12;
const TAG_BYTES = 16;

const cache = new Map<string, Buffer>();

function derived(info: string): Buffer {
  let key = cache.get(info);
  if (!key) {
    const ikm = Buffer.from(config().INTERVENTI_SEAL_KEY, 'hex');
    key = Buffer.from(hkdfSync('sha256', ikm, SALT, info, 32));
    cache.set(info, key);
  }
  return key;
}

function cifra(info: string, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', derived(info), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

/** Подправен или повреден запис хвърля (GCM проверява етикета). */
function decifra(info: string, payload: string): string {
  const raw = Buffer.from(payload, 'base64');
  if (raw.length <= IV_BYTES + TAG_BYTES) throw new Error('Повреден шифрован запис');
  const decipher = createDecipheriv('aes-256-gcm', derived(info), raw.subarray(0, IV_BYTES));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([
    decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8');
}

/** Тайната на TOTP в базата: AES-256-GCM (IV 12 байта, етикет 16), base64. */
export const cifraSegreto = (plaintext: string): string => cifra('totp-secret-v1', plaintext);
export const decifraSegreto = (payload: string): string => decifra('totp-secret-v1', payload);

/**
 * Започнатата настройка на 2FA пътува в скрито поле на формата, шифрована със свой ключ — не в базата:
 * откраднатата сесия не може да прочете и довърши чужда започната настройка.
 */
export const cifraBozza = (plaintext: string): string => cifra('totp-draft-v1', plaintext);
export function decifraBozza(payload: string): string | null {
  try {
    return decifra('totp-draft-v1', payload);
  } catch {
    return null;
  }
}

/** HMAC на резервен код — в базата не стои самият код. */
export function hmacRecupero(code: string): string {
  return createHmac('sha256', derived('recovery-code-v1')).update(code).digest('hex');
}

/** HMAC на мрежата на грешен вход — броят се опитите, без да се пази адресът. */
export function hmacRete(rete: string): string {
  return createHmac('sha256', derived('login-net-v1')).update(rete).digest('hex');
}
