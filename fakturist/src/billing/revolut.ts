import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Подписът на webhook-а на Revolut Merchant API: HMAC-SHA256 (hex) с тайната `wsk_…` върху
 * `v1.{Revolut-Request-Timestamp}.{суровото тяло}`; заглавката `Revolut-Signature` е `v1=<hex>`, при
 * смяна на тайната — няколко, разделени със запетая (приема се, ако съвпада която и да е). Часовото
 * клеймо — милисекунди или секунди; извън 5 минути се отказва (повторено изпращане).
 * Източник: developer.revolut.com (Verify the payload signature) — свери в sandbox преди продукция.
 */
export const REVOLUT_TOLERANCE_MS = 5 * 60 * 1000;

export function verifyRevolutSignature(input: {
  secret: string;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: Buffer;
  now?: number;
}): boolean {
  const { secret, timestamp, signature, rawBody } = input;
  if (!secret || !timestamp || !signature || !/^\d{10}(\d{3})?$/.test(timestamp)) return false;
  const now = input.now ?? Date.now();
  // Милисекунди (13 цифри) или секунди (10) — подписва се самият низ от заглавката, единицата е само
  // за срока; спецификацията казва „UNIX timestamp“ без единица (свери в sandbox).
  const at = timestamp.length === 10 ? Number(timestamp) * 1000 : Number(timestamp);
  if (Math.abs(now - at) > REVOLUT_TOLERANCE_MS) return false;
  const expected = createHmac('sha256', secret)
    .update(`v1.${timestamp}.`)
    .update(rawBody)
    .digest('hex');
  const expectedBuffer = Buffer.from(`v1=${expected}`);
  return signature.split(',').some((part) => {
    const candidate = Buffer.from(part.trim());
    return candidate.length === expectedBuffer.length && timingSafeEqual(candidate, expectedBuffer);
  });
}
