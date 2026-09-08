import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Подпис на заявка от машинен клиент. Тайната никога не пътува по мрежата:
 *   canonical = timestamp \n nonce \n METHOD \n path \n sha256(body)
 *   signature = hex(HMAC-SHA256(secret, canonical))
 * Timestamp + nonce спират повторно изпращане; тялото е обвързано с подписа.
 */
export const SIGNATURE_MAX_SKEW_SECONDS = 300;

export const HEADER_KEY_ID = 'x-publikator-key-id';
export const HEADER_TIMESTAMP = 'x-publikator-timestamp';
export const HEADER_NONCE = 'x-publikator-nonce';
export const HEADER_SIGNATURE = 'x-publikator-signature';

export interface SignatureInput {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  body: string;
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function canonicalString(input: SignatureInput): string {
  return [
    input.timestamp,
    input.nonce,
    input.method.toUpperCase(),
    input.path,
    sha256Hex(input.body),
  ].join('\n');
}

export function signRequest(secret: string, input: SignatureInput): string {
  return createHmac('sha256', secret).update(canonicalString(input)).digest('hex');
}

export function verifySignature(secret: string, input: SignatureInput, given: string): boolean {
  const expected = signRequest(secret, input);
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(given, 'hex'));
}

export function timestampWithinSkew(
  timestamp: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!/^\d{9,11}$/.test(timestamp)) return false;
  return Math.abs(Number(timestamp) - nowSeconds) <= SIGNATURE_MAX_SKEW_SECONDS;
}
