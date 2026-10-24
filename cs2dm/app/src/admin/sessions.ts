import type { PrismaClient, Role } from '@prisma/client';
import type { CookieOptions, Request, Response } from 'express';
import { isLocale, type Locale } from '../i18n.js';
import { randomToken, sha256Hex } from './crypto.js';
import { canEnterPanel } from './rbac.js';
import type { AdminPrincipal } from './types.js';

/**
 * Сесиите на панела (CONTRACT.md §10): в базата е само sha256 на токена; бисквитката
 * `__Host-cs2dm_sid` е HttpOnly + Secure + SameSite=Lax (връщането от Steam е cross-site GET) и
 * Path=/ без Domain — поддомейн не може да я подмени. Живот 12 часа от входа; докато TOTP не е
 * минат — 10 минути. Смяна на ролята (откъдето и да е) прекратява всички сесии на човека.
 */
export const SESSION_COOKIE = '__Host-cs2dm_sid';
/** Еднократният nonce на входа със Steam — връзва отговора на Steam с този браузър. */
export const LOGIN_COOKIE = '__Host-cs2dm_oid';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MFA_PENDING_MS = 10 * 60 * 1000;
export const LOGIN_NONCE_TTL_MS = 10 * 60 * 1000;
/** Толкова грешни кода в една сесия → сесията се трие и входът започва отначало. */
export const MAX_MFA_FAILURES = 5;

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function cookieOptions(maxAgeMs: number): CookieOptions {
  return { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: maxAgeMs };
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header || header.length > 8192) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    return /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
  }
  return null;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_MS));
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
}

export async function createSession(
  db: PrismaClient,
  input: { steamId: string; role: Role; lang: Locale },
  now: Date,
): Promise<string> {
  // Чистене между другото: изтеклите сесии не пазят нищо полезно.
  await db.webSession.deleteMany({ where: { expiresAt: { lte: now } } });
  const token = randomToken(32);
  await db.webSession.create({
    data: {
      tokenHash: sha256Hex(token),
      steamId: input.steamId,
      role: input.role,
      csrfToken: randomToken(32),
      lang: input.lang,
      createdAt: now,
      expiresAt: new Date(now.getTime() + MFA_PENDING_MS),
    },
  });
  return token;
}

export async function resolveSession(
  db: PrismaClient,
  token: string | null,
  now: Date,
): Promise<AdminPrincipal | null> {
  if (!token || !TOKEN_RE.test(token)) return null;
  const session = await db.webSession.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: { player: { select: { name: true, role: true, totpEnabledAt: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= now.getTime()) {
    await db.webSession.deleteMany({ where: { id: session.id } });
    return null;
  }
  // Ролята е сменена (панел, играта, ботът) или вече е под HELPER → изход на всички устройства.
  if (session.player.role !== session.role || !canEnterPanel(session.player.role)) {
    await db.webSession.deleteMany({ where: { steamId: session.steamId } });
    return null;
  }
  return {
    sessionId: session.id,
    steamId: session.steamId,
    name: session.player.name,
    role: session.player.role,
    csrf: session.csrfToken,
    mfaPassed: session.mfaPassed,
    totpEnabled: session.player.totpEnabledAt !== null,
    lang: isLocale(session.lang) ? session.lang : 'bg',
    createdAt: session.createdAt,
  };
}

/**
 * Вторият фактор е минат: НОВ токен и нов CSRF за същата сесия (защита от фиксиране на сесия) и
 * живот до 12 часа от входа. null — сесията междувременно е изтрита.
 */
export async function passMfa(db: PrismaClient, principal: AdminPrincipal): Promise<string | null> {
  const token = randomToken(32);
  const updated = await db.webSession.updateMany({
    where: { id: principal.sessionId, mfaPassed: false },
    data: {
      tokenHash: sha256Hex(token),
      csrfToken: randomToken(32),
      mfaPassed: true,
      mfaFailures: 0,
      expiresAt: new Date(principal.createdAt.getTime() + SESSION_TTL_MS),
    },
  });
  return updated.count === 1 ? token : null;
}

/** Грешен код: брои се в сесията; на петия сесията пада. Връща true, ако още може да се опитва. */
export async function recordMfaFailure(db: PrismaClient, sessionId: string): Promise<boolean> {
  const session = await db.webSession.update({
    where: { id: sessionId },
    data: { mfaFailures: { increment: 1 } },
    select: { mfaFailures: true },
  });
  if (session.mfaFailures < MAX_MFA_FAILURES) return true;
  await db.webSession.deleteMany({ where: { id: sessionId } });
  return false;
}

export async function destroySession(db: PrismaClient, sessionId: string): Promise<void> {
  await db.webSession.deleteMany({ where: { id: sessionId } });
}

export async function destroyAllSessions(db: PrismaClient, steamId: string): Promise<number> {
  return (await db.webSession.deleteMany({ where: { steamId } })).count;
}

export async function setSessionLang(
  db: PrismaClient,
  sessionId: string,
  lang: Locale,
): Promise<void> {
  await db.webSession.updateMany({ where: { id: sessionId }, data: { lang } });
}
