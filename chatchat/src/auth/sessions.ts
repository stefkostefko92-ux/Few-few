import type { PrismaClient, Role, AccountKind } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { hashToken, randomToken } from '../crypto.js';

/**
 * Сесии в базата: в бисквитката е случаен токен, в базата — само HMAC-ът му. Отнемат се веднага
 * (изход, деактивиране, смяна на роля — AC-16), което JWT без списък за отнемане не позволява.
 * Бисквитката: httpOnly, Secure (в продукция), SameSite=Strict, само за пътя на приложението.
 */

export const SESSION_COOKIE = 'cc_session';
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export interface Principal {
  user: {
    id: string;
    tenantId: string;
    companyId: string | null;
    name: string;
    role: Role;
    kind: AccountKind;
    locale: string;
  };
  session: { id: string; csrfToken: string };
}

declare module 'express-serve-static-core' {
  interface Request {
    principal?: Principal;
  }
}

export interface SessionDeps {
  db: PrismaClient;
  pepper: string;
  ttlHours: number;
  secureCookies: boolean;
}

export async function createSession(
  deps: SessionDeps,
  userId: string,
): Promise<{ token: string; csrfToken: string; expiresAt: Date }> {
  const token = randomToken();
  const csrfToken = randomToken(24);
  const expiresAt = new Date(Date.now() + deps.ttlHours * 3600 * 1000);
  await deps.db.session.create({
    data: { userId, tokenHash: hashToken(token, deps.pepper), csrfToken, expiresAt },
  });
  return { token, csrfToken, expiresAt };
}

export function setSessionCookie(
  res: Response,
  deps: SessionDeps,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: deps.secureCookies,
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response, deps: SessionDeps): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: deps.secureCookies,
    sameSite: 'strict',
    path: '/',
  });
}

/** Минимален парсер само за нашата бисквитка — без зависимост. */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    return /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : null;
  }
  return null;
}

/** Зарежда вписания човек, ако сесията е жива и акаунтът — активен и в срок. */
export function loadPrincipal(deps: SessionDeps) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.principal) return next();
      const token = readCookie(req, SESSION_COOKIE);
      if (!token) return next();
      const session = await deps.db.session.findUnique({
        where: { tokenHash: hashToken(token, deps.pepper) },
        include: { user: true },
      });
      const now = new Date();
      if (
        !session ||
        session.revokedAt !== null ||
        session.expiresAt <= now ||
        !session.user.active ||
        (session.user.expiresAt !== null && session.user.expiresAt <= now)
      ) {
        return next();
      }
      const u = session.user;
      req.principal = {
        user: {
          id: u.id,
          tenantId: u.tenantId,
          companyId: u.companyId,
          name: u.name,
          role: u.role,
          kind: u.kind,
          locale: u.locale,
        },
        session: { id: session.id, csrfToken: session.csrfToken },
      };
      if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
        await deps.db.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Отнета сесия затваря и отворените потоци в реално време (§13.3): хъбът се абонира тук, за да
 * не зависи всеки, който отнема сесии, от него. Слушател, който хвърли, не спира отнемането.
 */
export type RevocationTarget = { userId: string } | { sessionId: string };
const revocationListeners = new Set<(target: RevocationTarget) => void>();

export function onSessionsRevoked(listener: (target: RevocationTarget) => void): () => void {
  revocationListeners.add(listener);
  return () => {
    revocationListeners.delete(listener);
  };
}

function emitRevoked(target: RevocationTarget): void {
  for (const listener of revocationListeners) {
    try {
      listener(target);
    } catch {
      // Потокът се проверява и на всеки heartbeat — пропуснат слушател не оставя достъп.
    }
  }
}

export async function revokeSession(db: PrismaClient, sessionId: string): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  emitRevoked({ sessionId });
}

/** Отнема всички сесии на човека — при деактивиране, смяна на роля или нулиране (AC-16). */
export async function revokeAllSessions(db: PrismaClient, userId: string): Promise<number> {
  const result = await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  emitRevoked({ userId });
  return result.count;
}
