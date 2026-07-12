// Криптиране на API токените в покой: AES-256-GCM, ключ от средата (ENCRYPTION_KEY, 32 байта hex).
// В базата никога не лежи токен в чист вид.
import crypto from 'node:crypto';
import { config } from './config.js';

function key() {
  if (!config.encryptionKey) {
    if (config.env === 'production') {
      throw new Error('ENCRYPTION_KEY е задължителен в продукция (32 байта hex)');
    }
    // dev fallback — детерминистичен, само за локална разработка
    return crypto.createHash('sha256').update('reklamchik-dev-key').digest();
  }
  const k = Buffer.from(config.encryptionKey, 'hex');
  if (k.length !== 32) throw new Error('ENCRYPTION_KEY трябва да е точно 32 байта hex (64 знака)');
  return k;
}

export function encrypt(plain) {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}

export function decrypt(blob) {
  if (!blob) return null;
  const [iv, tag, data] = blob.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
