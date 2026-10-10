import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Подписите на известията (HMAC-SHA256), сравнени без изтичане по време:
 *  • ChatChat (общият webhook, и в двете посоки, версия v1):
 *      X-ChatChat-Timestamp: <unix секунди>
 *      X-ChatChat-Signature: v1=<hex(HMAC(тайна, "<timestamp>.<тяло>"))>
 *  • Zendesk (официалният подпис на webhook-ите — developer.zendesk.com/documentation/webhooks/verifying):
 *      X-Zendesk-Webhook-Signature: base64(HMAC(тайна, <timestamp> + <тяло>))
 *      X-Zendesk-Webhook-Signature-Timestamp: ISO 8601 (напр. 2021-03-25T05:09:27Z)
 *  • Jira (developer.atlassian.com/cloud/jira/platform/webhooks): X-Hub-Signature: sha256=<hex(HMAC(тайна, тяло))>;
 *    печат в заглавка няма — времето е полето `timestamp` (ms) в ПОДПИСАНОТО тяло, повторите носят
 *    същия X-Atlassian-Webhook-Identifier.
 * Резултатът носи `nonce` (SHA-256) за защитата от повторение — по id на доставката, ако го има.
 */

export const CC_SIGNATURE = 'x-chatchat-signature';
export const CC_TIMESTAMP = 'x-chatchat-timestamp';
export const CC_DELIVERY = 'x-chatchat-delivery';

export type Headers = Record<string, string | string[] | undefined>;
export type VerifyResult =
  | { ok: true; nonce: string; at: number | null }
  | { ok: false; code: 'invalid_signature' | 'stale_request' };

const one = (h: Headers, name: string): string => {
  const v = h[name];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
};

function equalText(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

const nonceOf = (kind: string, value: string) =>
  createHash('sha256').update(`${kind}|${value}`).digest('hex');

export function hmacHex(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/** Подписът на ChatChat (изходящите доставки и входящото по общия webhook). */
export function signChatChat(secret: string, timestamp: number, body: string): string {
  return `v1=${hmacHex(secret, `${timestamp}.${body}`)}`;
}

function fresh(at: number, now: number, toleranceSec: number): boolean {
  return Number.isFinite(at) && Math.abs(now - at) <= toleranceSec * 1000;
}

export function verifyChatChat(
  secret: string,
  headers: Headers,
  rawBody: string,
  now: number,
  toleranceSec: number,
): VerifyResult {
  const ts = one(headers, CC_TIMESTAMP);
  if (!/^\d{9,11}$/.test(ts)) return { ok: false, code: 'invalid_signature' };
  const expected = signChatChat(secret, Number(ts), rawBody);
  // Няколко подписа със запетая (смяна на тайната при получателя) — достатъчен е един верен.
  const sent = one(headers, CC_SIGNATURE)
    .split(',')
    .map((s) => s.trim());
  if (!sent.some((s) => equalText(s, expected))) return { ok: false, code: 'invalid_signature' };
  const at = Number(ts) * 1000;
  if (!fresh(at, now, toleranceSec)) return { ok: false, code: 'stale_request' };
  const delivery = one(headers, CC_DELIVERY);
  return { ok: true, nonce: nonceOf('cc', delivery || expected), at };
}

export function verifyZendesk(
  secret: string,
  headers: Headers,
  rawBody: string,
  now: number,
  toleranceSec: number,
): VerifyResult {
  const ts = one(headers, 'x-zendesk-webhook-signature-timestamp');
  const sent = one(headers, 'x-zendesk-webhook-signature');
  if (!ts || !sent || ts.length > 40) return { ok: false, code: 'invalid_signature' };
  const expected = createHmac('sha256', secret)
    .update(ts + rawBody)
    .digest('base64');
  if (!equalText(sent, expected)) return { ok: false, code: 'invalid_signature' };
  const at = Date.parse(ts);
  if (!fresh(at, now, toleranceSec)) return { ok: false, code: 'stale_request' };
  const invocation = one(headers, 'x-zendesk-webhook-invocation-id');
  return { ok: true, nonce: nonceOf('zd', invocation || expected), at };
}

/** Jira/JSM: подписът е върху тялото; печатът се проверява СЛЕД разчитане (`timestamp` в тялото). */
export function verifyJira(secret: string, headers: Headers, rawBody: string): VerifyResult {
  const sent = one(headers, 'x-hub-signature');
  const expected = `sha256=${hmacHex(secret, rawBody)}`;
  if (!sent || !equalText(sent, expected)) return { ok: false, code: 'invalid_signature' };
  const id = one(headers, 'x-atlassian-webhook-identifier');
  return { ok: true, nonce: nonceOf('jira', id || expected), at: null };
}

export function jiraFresh(timestampMs: number, now: number, toleranceSec: number): boolean {
  return fresh(timestampMs, now, toleranceSec);
}
