import type { CookieOptions, NextFunction, Request, Response } from 'express';
import type { Prisma, Role } from '@prisma/client';
import { isProduction } from '../config.js';
import { prisma } from '../db.js';
import { randomToken, sha256Hex } from '../crypto.js';
import { DAY, HOUR } from '../time.js';
import { readCookie } from '../http/cookies.js';
import { isStaff } from './rbac.js';
import type { Principal } from '../types.js';

const CUSTOMER_ABSOLUTE_MS = 30 * DAY;
const STAFF_ABSOLUTE_MS = DAY;
/** Най-дългият живот на сесия изобщо — по-стара няма валидна (по него чисти поддръжката). */
export const MAX_SESSION_MS = Math.max(CUSTOMER_ABSOLUTE_MS, STAFF_ABSOLUTE_MS);

/** Клиент: плъзгащ живот 7 дни, абсолютен таван 30 дни. Персонал: 4 часа без действие, таван 24 часа. */
export function sessionLimits(role: Role): { idleMs: number; absoluteMs: number } {
  return isStaff(role)
    ? { idleMs: 4 * HOUR, absoluteMs: STAFF_ABSOLUTE_MS }
    : { idleMs: 7 * DAY, absoluteMs: CUSTOMER_ABSOLUTE_MS };
}

/** Входът по пароля чака втория фактор най-много толкова. */
export const MFA_PENDING_MS = 10 * 60 * 1000;
const SLIDE_MIN_INTERVAL_MS = 60 * 1000;

/** `__Host-` иска Secure + Path=/ без Domain — бисквитка от поддомейн не може да я подмени. */
export function sessionCookieName(): string {
  return isProduction() ? '__Host-rd_sid' : 'rd_sid';
}

export function sessionCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction(),
    path: '/',
    maxAge: maxAgeMs,
  };
}

export interface NewSession {
  token: string;
  id: string;
  maxAgeMs: number;
}

export async function createSession(
  user: { id: string; role: Role },
  meta: {
    ip: string | null;
    country: string | null;
    userAgent: string | null;
    deviceId: string | null;
  },
  options: { mfaPassed: boolean },
): Promise<NewSession> {
  const token = randomToken(32);
  const { idleMs } = sessionLimits(user.role);
  const ttl = options.mfaPassed ? idleMs : MFA_PENDING_MS;
  const session = await prisma.session.create({
    data: {
      tokenHash: sha256Hex(token),
      userId: user.id,
      csrfToken: randomToken(24),
      mfaPassed: options.mfaPassed,
      ip: meta.ip,
      country: meta.country,
      userAgent: meta.userAgent,
      deviceId: meta.deviceId,
      expiresAt: new Date(Date.now() + ttl),
    },
  });
  return { token, id: session.id, maxAgeMs: sessionLimits(user.role).absoluteMs };
}

export function setSessionCookie(res: Response, session: NewSession): void {
  res.cookie(sessionCookieName(), session.token, sessionCookieOptions(session.maxAgeMs));
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(sessionCookieName(), sessionCookieOptions(0));
}

/** false — сесията междувременно е изтрита (изход, бан, паралелен опит): входът започва отначало. */
export async function markMfaPassed(sessionId: string, role: Role): Promise<boolean> {
  const marked = await prisma.session.updateMany({
    where: { id: sessionId },
    data: {
      mfaPassed: true,
      mfaFailures: 0,
      expiresAt: new Date(Date.now() + sessionLimits(role).idleMs),
    },
  });
  return marked.count === 1;
}

/**
 * Нов токен и нов CSRF за същата сесия. След смяна на паролата старата бисквитка (ако е изтекла
 * някъде) вече не отваря нищо, а човекът остава вътре.
 */
export async function rotateSessionToken(sessionId: string, role: Role): Promise<NewSession> {
  const token = randomToken(32);
  await prisma.session.update({
    where: { id: sessionId },
    data: { tokenHash: sha256Hex(token), csrfToken: randomToken(24) },
  });
  return { token, id: sessionId, maxAgeMs: sessionLimits(role).absoluteMs };
}

export async function destroySessionById(id: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id } });
}

/**
 * Прекратява всички сесии на акаунта; `exceptId` оставя текущата (смяна на парола от самия човек).
 * `db` — транзакцията на действието, ако е част от нея.
 */
export async function destroyAllSessions(
  userId: string,
  exceptId?: string,
  db: Prisma.TransactionClient = prisma,
): Promise<number> {
  const result = await db.session.deleteMany({
    where: { userId, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  return result.count;
}

export async function resolveSession(token: string | undefined): Promise<Principal | null> {
  if (!token || token.length < 32 || token.length > 64) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          locale: true,
          plan: true,
          planExpiresAt: true,
          emailVerifiedAt: true,
          totpEnabledAt: true,
          bannedAt: true,
        },
      },
    },
  });
  if (!session) return null;

  const now = Date.now();
  const { idleMs, absoluteMs } = sessionLimits(session.user.role);
  const expired = session.expiresAt.getTime() <= now;
  const overAbsolute = now - session.createdAt.getTime() > absoluteMs;
  // Банът важи веднага: сесията пада при следващата заявка, не когато изтече.
  if (expired || overAbsolute || session.user.bannedAt) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (session.mfaPassed && now - session.lastSeenAt.getTime() > SLIDE_MIN_INTERVAL_MS) {
    // updateMany, не update: сесия, изтрита междувременно (изход в друг раздел, бан, смяна на
    // паролата), е просто излизане, не грешка 500
    const slid = await prisma.session.updateMany({
      where: { id: session.id },
      data: { lastSeenAt: new Date(now), expiresAt: new Date(now + idleMs) },
    });
    if (slid.count === 0) return null;
  }

  const { bannedAt: _bannedAt, ...user } = session.user;
  return {
    user,
    session: { id: session.id, csrfToken: session.csrfToken, mfaPassed: session.mfaPassed },
    sessionToken: token,
  };
}

/** Закача принципала (ако има валидна бисквитка), без да изисква вход. */
export async function attachSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = await resolveSession(readCookie(req, sessionCookieName()));
  if (principal) {
    req.principal = principal;
    res.locals.currentUser = principal.user;
    res.locals.csrfToken = principal.session.csrfToken;
    res.locals.mfaPassed = principal.session.mfaPassed;
  } else {
    res.locals.currentUser = null;
    res.locals.csrfToken = '';
    res.locals.mfaPassed = false;
  }
  next();
}

/** Чисти изтеклите сесии — вика се от поддръжката веднъж на час. */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: new Date() } },
        { createdAt: { lte: new Date(Date.now() - MAX_SESSION_MS) } },
      ],
    },
  });
  return result.count;
}
