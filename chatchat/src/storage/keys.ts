import { randomBytes } from 'node:crypto';

/**
 * Ключът на обект в частното хранилище: `<tenantId>/<yyyy>/<mm>/<случаен id>` — сглобява го
 * сървърът, вход от клиента в пътя няма (името на файла е само за показване, в базата).
 * tenantId е cuid (малки букви и цифри); последната част — 128 случайни бита в hex.
 */
export const OBJECT_KEY = /^[a-z0-9]{1,40}\/\d{4}\/\d{2}\/[a-f0-9]{32}$/;

export function newObjectKey(tenantId: string, now = new Date()): string {
  if (!/^[a-z0-9]{1,40}$/.test(tenantId)) throw new Error('Невалиден tenantId за ключ.');
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${tenantId}/${yyyy}/${mm}/${randomBytes(16).toString('hex')}`;
}

export function assertKey(key: string): void {
  if (!OBJECT_KEY.test(key)) throw new Error('Невалиден ключ на прикачен файл.');
}
