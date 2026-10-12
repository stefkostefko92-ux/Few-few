import type { CookieOptions, NextFunction, Request, Response } from 'express';
import type { Prisma, Role } from '@prisma/client';
import { SignJWT, jwtVerify } from 'jose';
import { config, isProduction } from '../config.js';
import { prisma } from '../db.js';
import { randomToken } from '../crypto.js';
import { readCookie } from '../http/cookies.js';
import { DAY, HOUR, MINUTE } from '../time.js';
import { isPrivileged } from './roles.js';
import type { Principal } from '../types.js';

/**
 * MASTER/ADMIN: 12 часа без действие, таван 3 дни. Останалите (техници на телефон в машинното): 7 дни
 * без действие, таван 30 дни — да не се вписват отново всяка сутрин.
 */
export const SESSION_LIMITS = {
  privileged: { idleMs: 12 * HOUR, absoluteMs: 3 * DAY },
  standard: { idleMs: 7 * DAY, absoluteMs: 30 * DAY },
} as const;

/** Най-дългият живот на сесия изобщо — по-стара няма валидна (по него чисти поддръжката). */
export const MAX_SESSION_MS = SESSION_LIMITS.standard.absoluteMs;

export function sessionLimits(role: Role): { idleMs: number; absoluteMs: number } {
  return isPrivileged(role) ? SESSION_LIMITS.privileged : SESSION_LIMITS.standard;
}

const SLIDE_MIN_INTERVAL_MS = MINUTE;
const ISSUER = 'rilievi';
const AUDIENCE = 'rilievi';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `__Host-` иска Secure + Path=/ без Domain — бисквитка от поддомейн не може да я подмени. */
export function sessionCookieName(): string {
  return isProduction() ? '__Host-rilievi' : 'rilievi_sid';
}

/**
 * HttpOnly (скриптът на страницата не я вижда), SameSite=Lax: връзка към схема, пратена по WhatsApp или
 * имейл, отваря схемата, без да иска вход отново. Записите пази CSRF токенът + проверката на Origin.
 */
function sessionCookieOptions(maxAgeMs: number): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: isProduction(), path: '/', maxAge: maxAgeMs };
}

let key: Uint8Array | null = null;
function secretKey(): Uint8Array {
  key ??= new Uint8Array(Buffer.from(config().JWT_SECRET, 'hex'));
  return key;
}

export interface NewSession {
  jwt: string;
  id: string;
  maxAgeMs: number;
}

/** Ред в базата + подписан JWT с `sid`. Срокът на JWT-то е абсолютният таван на сесията. */
export async function createSession(user: { id: string; role: Role }): Promise<NewSession> {
  const { idleMs, absoluteMs } = sessionLimits(user.role);
  const now = Date.now();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      csrfToken: randomToken(24),
      createdAt: new Date(now),
      lastSeenAt: new Date(now),
      expiresAt: new Date(now + idleMs),
    },
  });
  const jwt = await new SignJWT({ sid: session.id })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(user.id)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor((now + absoluteMs) / 1000))
    .sign(secretKey());
  return { jwt, id: session.id, maxAgeMs: absoluteMs };
}

export function setSessionCookie(res: Response, session: NewSession): void {
  res.cookie(sessionCookieName(), session.jwt, sessionCookieOptions(session.maxAgeMs));
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(sessionCookieName(), sessionCookieOptions(0));
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

/** Подписът и сроковете на JWT-то; `sid` и `sub` или null. Чужд алгоритъм (`none`, RS256) — null. */
async function readToken(token: string): Promise<{ sid: string; sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    const sid = payload.sid;
    if (typeof sid !== 'string' || !UUID.test(sid) || typeof payload.sub !== 'string') return null;
    return { sid, sub: payload.sub };
  } catch {
    return null;
  }
}

export async function resolveSession(token: string | undefined): Promise<Principal | null> {
  if (!token || token.length > 2048) return null;
  const claims = await readToken(token);
  if (!claims) return null;
  const session = await prisma.session.findUnique({
    where: { id: claims.sid },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          locale: true,
          theme: true,
          mustChangePassword: true,
          deactivatedAt: true,
          aziendaId: true,
          azienda: { select: { name: true, deactivatedAt: true } },
        },
      },
    },
  });
  if (!session || session.userId !== claims.sub) return null;

  const now = Date.now();
  const { idleMs, absoluteMs } = sessionLimits(session.user.role);
  const deadline = session.createdAt.getTime() + absoluteMs;
  // Деактивирането (на човека или на фирмата му) важи веднага: сесията пада при следващата заявка.
  const inactive =
    session.user.deactivatedAt !== null || Boolean(session.user.azienda?.deactivatedAt);
  if (session.expiresAt.getTime() <= now || now >= deadline || inactive) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  if (now - session.lastSeenAt.getTime() > SLIDE_MIN_INTERVAL_MS) {
    // updateMany: сесия, изтрита междувременно (изход в друг раздел), е просто излизане, не грешка 500
    const slid = await prisma.session.updateMany({
      where: { id: session.id },
      data: { lastSeenAt: new Date(now), expiresAt: new Date(Math.min(now + idleMs, deadline)) },
    });
    if (slid.count === 0) return null;
  }

  const { deactivatedAt: _deactivatedAt, azienda, ...rest } = session.user;
  const user = { ...rest, aziendaName: azienda?.name ?? null };
  return { user, session: { id: session.id, csrfToken: session.csrfToken } };
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
  } else {
    res.locals.currentUser = null;
    res.locals.csrfToken = '';
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
