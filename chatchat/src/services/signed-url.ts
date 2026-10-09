import { createHmac } from 'node:crypto';
import { safeEqual } from '../crypto.js';

/**
 * Краткотраен подписан адрес за сваляне (§13.3 „URL firmati a breve scadenza“): HMAC-SHA256 с
 * ATTACHMENT_URL_KEY върху id на файла, id на потребителя и срока. Адресът е вързан към човека —
 * изтекъл в лог или препратен, той не отваря файла на друга сесия. Подписът не замества
 * проверката на достъпа: маршрутът я прави отново при всяко сваляне.
 */

export const URL_TTL_SECONDS = 5 * 60;
/** Толеранс за разминаване на часовниците — срок по-далеч в бъдещето е подправен. */
const SKEW_SECONDS = 30;

function signature(key: string, attachmentId: string, userId: string, exp: number): string {
  return createHmac('sha256', key)
    .update(`chatchat.file.v1|${attachmentId}|${userId}|${exp}`)
    .digest('base64url');
}

export function signFileUrl(
  key: string,
  attachmentId: string,
  userId: string,
  nowMs = Date.now(),
): { url: string; expiresAt: Date } {
  const exp = Math.floor(nowMs / 1000) + URL_TTL_SECONDS;
  const sig = signature(key, attachmentId, userId, exp);
  return {
    url: `/api/v1/files/${encodeURIComponent(attachmentId)}?exp=${exp}&sig=${sig}`,
    expiresAt: new Date(exp * 1000),
  };
}

export type UrlCheck = 'ok' | 'expired' | 'invalid';

/** Подписът първо (без база); изтекъл адрес се отличава от подправен само след верен подпис. */
export function verifyFileUrl(
  key: string,
  attachmentId: string,
  userId: string,
  expRaw: unknown,
  sigRaw: unknown,
  nowMs = Date.now(),
): UrlCheck {
  if (typeof expRaw !== 'string' || typeof sigRaw !== 'string') return 'invalid';
  if (!/^\d{1,12}$/.test(expRaw) || !/^[A-Za-z0-9_-]{43}$/.test(sigRaw)) return 'invalid';
  const exp = Number(expRaw);
  if (!safeEqual(sigRaw, signature(key, attachmentId, userId, exp))) return 'invalid';
  const now = Math.floor(nowMs / 1000);
  if (exp > now + URL_TTL_SECONDS + SKEW_SECONDS) return 'invalid';
  return exp < now ? 'expired' : 'ok';
}
