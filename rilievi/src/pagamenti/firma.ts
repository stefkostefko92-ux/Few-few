import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Подписът на webhook-а на Revolut Merchant API (#31): HMAC-SHA256 със signing secret (`wsk_…`) над
 * `v1.<Revolut-Request-Timestamp>.<суровото тяло>`, hex, в `Revolut-Signature` като `v1=<hex>` (при смяна на
 * ключа — няколко, разделени със запетая; стига един). Времето — милисекунди, до 5 минути разлика (повторено
 * старо писмо не минава). Сравнение в постоянно време. Без валиден подпис нищо не се чете.
 */
export const TOLLERANZA_MS = 5 * 60_000;

const HEX64 = /^v1=([0-9a-f]{64})$/;

export function firmaValida(
  raw: Buffer | string,
  timestamp: string | undefined,
  header: string | undefined,
  segreti: readonly string[],
  now: number = Date.now(),
): boolean {
  if (!timestamp || !/^\d{10,13}$/.test(timestamp) || !header || segreti.length === 0) return false;
  const ms = timestamp.length <= 10 ? Number(timestamp) * 1000 : Number(timestamp);
  if (Math.abs(now - ms) > TOLLERANZA_MS) return false;
  const corpo = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8');
  const payload = Buffer.concat([Buffer.from(`v1.${timestamp}.`, 'utf8'), corpo]);
  const attese = segreti.map((s) => createHmac('sha256', s).update(payload).digest());
  for (const parte of header.split(',')) {
    const m = HEX64.exec(parte.trim());
    if (!m) continue;
    const data = Buffer.from(m[1]!, 'hex');
    if (attese.some((a) => timingSafeEqual(a, data))) return true;
  }
  return false;
}
