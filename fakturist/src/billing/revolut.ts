import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Подписът на webhook-а на Revolut Merchant API: HMAC-SHA256 (hex) с тайната `wsk_…` върху
 * `v1.{Revolut-Request-Timestamp}.{суровото тяло}`; заглавката `Revolut-Signature` е `v1=<hex>`, при
 * смяна на тайната — няколко, разделени със запетая (приема се, ако съвпада която и да е). Часовото
 * клеймо е в милисекунди; извън 5 минути се отказва (повторено изпращане).
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
  if (!secret || !timestamp || !signature || !/^\d{13}$/.test(timestamp)) return false;
  const now = input.now ?? Date.now();
  if (Math.abs(now - Number(timestamp)) > REVOLUT_TOLERANCE_MS) return false;
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
