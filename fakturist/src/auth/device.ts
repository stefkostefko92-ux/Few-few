import type { Request, Response } from 'express';
import { isProduction } from '../config.js';
import { safeEqual } from '../crypto.js';
import { readCookie } from '../http/cookies.js';
import { deviceHmac } from './keys.js';
import { DAY } from '../time.js';

/**
 * Довереното устройство (OWASP „device cookies“; ревюто на Кодаджията, 13.11.2026): след успешен вход
 * браузърът получава подписана бисквитка за профила. Входът от такъв браузър не спира от заключването
 * на профила (src/auth/lockout.ts) — затова чужд човек, който знае само имейла, не може да държи
 * собственика вън с грешни пароли. В бисквитката няма лични данни: id на профила, срок и HMAC.
 */
export const DEVICE_TTL_MS = 180 * DAY;

export function deviceCookieName(): string {
  return isProduction() ? '__Host-fakturist_dev' : 'fakturist_dev';
}

function signed(userId: string, expires: number): string {
  const body = `${userId}.${expires}`;
  return `${body}.${deviceHmac(body)}`;
}

export function rememberDevice(res: Response, userId: string, now: number = Date.now()): void {
  const expires = now + DEVICE_TTL_MS;
  res.cookie(deviceCookieName(), signed(userId, expires), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: DEVICE_TTL_MS,
  });
}

/** Носи ли заявката валидна бисквитка за ТОЗИ профил (подпис, срок, id). */
export function isTrustedDevice(req: Request, userId: string, now: number = Date.now()): boolean {
  const value = readCookie(req, deviceCookieName());
  if (!value || value.length > 200) return false;
  const [id, expiresRaw, mac] = value.split('.');
  if (!id || !expiresRaw || !mac || id !== userId || !/^\d{13}$/.test(expiresRaw)) return false;
  const expires = Number(expiresRaw);
  if (expires <= now) return false;
  return safeEqual(mac, deviceHmac(`${id}.${expires}`));
}
