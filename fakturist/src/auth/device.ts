import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { isProduction } from '../config.js';
import { safeEqual } from '../crypto.js';
import { readCookie } from '../http/cookies.js';
import { deviceHmac } from './keys.js';
import { DAY } from '../time.js';
import { reserveTrustedAttempt, TRUSTED_MAX_FAILED } from './lockout.js';

/**
 * Довереното устройство (OWASP „device cookies“; ревюто на Кодаджията, 13.11.2026): след успешен вход
 * браузърът получава подписана бисквитка за профила. Входът от такъв браузър не спира от заключването
 * на профила (src/auth/lockout.ts) — затова чужд човек, който знае само имейла, не може да държи
 * собственика вън с грешни пароли. В бисквитката няма лични данни: id на профила, срок и HMAC.
 *
 * Ревюто от 16.11.2026: подписът включва отпечатък на паролата и 2FA — нова парола или смяна на втория
 * фактор обезсилва всички доверени устройства; а довереността важи само докато опитите от доверени
 * устройства след последния успешен вход са под `TRUSTED_MAX_FAILED` (src/auth/lockout.ts).
 */
export interface DeviceUser {
  id: string;
  passwordHash: string;
  totpSecretEnc: string | null;
}

/** Отпечатъкът на данните за вход — не е тайна сама по себе си, но я влага само в HMAC-а. */
function credentialsEpoch(user: DeviceUser): string {
  return createHash('sha256')
    .update(`${user.passwordHash}\u0000${user.totpSecretEnc ?? ''}`, 'utf8')
    .digest('base64url')
    .slice(0, 22);
}
export const DEVICE_TTL_MS = 180 * DAY;

export function deviceCookieName(): string {
  return isProduction() ? '__Host-fakturist_dev' : 'fakturist_dev';
}

const mac = (user: DeviceUser, expires: number) =>
  deviceHmac(`${user.id}.${expires}.${credentialsEpoch(user)}`);

export function rememberDevice(res: Response, user: DeviceUser, now: number = Date.now()): void {
  const expires = now + DEVICE_TTL_MS;
  res.cookie(deviceCookieName(), `${user.id}.${expires}.${mac(user, expires)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: DEVICE_TTL_MS,
  });
}

/** Маха бисквитката (закриване на профила — правният преглед, M3). */
export function forgetDevice(res: Response): void {
  res.clearCookie(deviceCookieName(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
  });
}

/**
 * Носи ли заявката валидна бисквитка за ТОЗИ профил (подпис с текущите парола и 2FA, срок, id). Самата
 * довереност се заема отделно (`reserveTrustedAttempt`) — тук е само проверката на бисквитката.
 */
export function hasDeviceCookie(req: Request, user: DeviceUser, now: number = Date.now()): boolean {
  const value = readCookie(req, deviceCookieName());
  if (!value || value.length > 200) return false;
  const [id, expiresRaw, given] = value.split('.');
  if (!id || !expiresRaw || !given || id !== user.id || !/^\d{13}$/.test(expiresRaw)) return false;
  const expires = Number(expiresRaw);
  if (expires <= now) return false;
  return safeEqual(given, mac(user, expires));
}

/** Довереното устройство заобикаля заключването: валидна бисквитка И опит под тавана (заема се атомарно). */
export async function trustedAttempt(
  req: Request,
  user: DeviceUser & { trustedFailures: number },
): Promise<boolean> {
  if (user.trustedFailures >= TRUSTED_MAX_FAILED || !hasDeviceCookie(req, user)) return false;
  return reserveTrustedAttempt(user.id);
}
