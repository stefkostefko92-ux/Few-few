import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { config } from '../config.js';

/**
 * Ключовете — изведени (HKDF-SHA256, отделен етикет за всяко предназначение) от LEDGER_SEAL_KEY: тайната
 * на сървъра, която по правило НЕ се сменя и е в бекъпа на тайните. Затова шифрованите 2FA тайни и
 * печатите на документите преживяват рестарт и смяна на JWT_SECRET. Изведените ключове са независими —
 * познат един не издава другите. Нов етикет (`…-v2`) = нов ключ.
 */
const SALT = 'fakturist';
const IV_BYTES = 12;
const TAG_BYTES = 16;

const cache = new Map<string, Buffer>();

function derived(info: string): Buffer {
  let key = cache.get(info);
  if (!key) {
    const ikm = Buffer.from(config().LEDGER_SEAL_KEY, 'hex');
    key = Buffer.from(hkdfSync('sha256', ikm, SALT, info, 32));
    cache.set(info, key);
  }
  return key;
}

function encrypt(info: string, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', derived(info), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

/** Подправен или повреден запис хвърля (GCM проверява етикета). */
function decrypt(info: string, payload: string): string {
  const raw = Buffer.from(payload, 'base64');
  if (raw.length <= IV_BYTES + TAG_BYTES) throw new Error('Повреден шифрован запис');
  const decipher = createDecipheriv('aes-256-gcm', derived(info), raw.subarray(0, IV_BYTES), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([
    decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8');
}

/** TOTP тайната в базата: AES-256-GCM (IV 12 байта, етикет 16), base64. */
export const encryptTotpSecret = (plaintext: string): string =>
  encrypt('totp-secret-v1', plaintext);
export const decryptTotpSecret = (payload: string): string => decrypt('totp-secret-v1', payload);

/** Печатът на веригата на документите (src/ledger/chain.ts). */
export function sealHmac(content: string): string {
  return createHmac('sha256', derived('document-seal-v1')).update(content, 'utf8').digest('hex');
}

/** Печатът на веригата на одита (src/audit.ts). */
export function auditHmac(content: string): string {
  return createHmac('sha256', derived('audit-seal-v1')).update(content, 'utf8').digest('hex');
}
