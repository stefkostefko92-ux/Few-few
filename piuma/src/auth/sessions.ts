import { randomBytes } from 'node:crypto';
import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { isProduction } from '../config.js';
import { prisma } from '../db.js';
import { sha256Hex } from '../agent/signature.js';
import type { HumanPrincipal } from '../types.js';

/** Плъзгащ живот 7 дни, абсолютен таван 30 дни — откраднат sid не живее вечно. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
const SLIDE_MIN_INTERVAL_MS = 5 * 60 * 1000;

/** `__Host-` префиксът иска Secure + Path=/ и без Domain — браузърът не приема подправена от поддомейн. */
export function sessionCookieName(): string {
  return isProduction() ? '__Host-sid' : 'sid';
}

export function sessionCookieOptions(maxAge: number): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', secure: isProduction(), path: '/', maxAge };
}

export interface CreatedSession {
  token: string;
  maxAge: number;
}

export async function createSession(
  userId: string,
  req: Request,
  options: { mfaPassed: boolean },
): Promise<CreatedSession> {
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: {
      tokenHash: sha256Hex(token),
      userId,
      csrfToken: randomBytes(24).toString('base64url'),
      mfaPassed: options.mfaPassed,
      ip: req.ip ?? null,
      userAgent: (req.get('user-agent') ?? '').slice(0, 300) || null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return { token, maxAge: SESSION_TTL_MS };
}

export async function markMfaPassed(sessionId: string): Promise<void> {
  await prisma.session.update({ where: { id: sessionId }, data: { mfaPassed: true } });
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: sha256Hex(token) } });
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function resolveSession(token: string | undefined): Promise<HumanPrincipal | null> {
  if (!token || token.length < 20) return null;
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
          totpEnabledAt: true,
          active: true,
        },
      },
    },
  });
  if (!session) return null;

  const now = Date.now();
  const expired = session.expiresAt.getTime() <= now;
  const overAbsolute = now - session.createdAt.getTime() > SESSION_ABSOLUTE_MS;
  if (expired || overAbsolute || !session.user.active) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (now - session.lastSeenAt.getTime() > SLIDE_MIN_INTERVAL_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) },
    });
  }

  const { active: _active, ...user } = session.user;
  return {
    kind: 'human',
    user,
    session: { id: session.id, csrfToken: session.csrfToken, mfaPassed: session.mfaPassed },
    sessionToken: token,
  };
}

/** Закача принципала (ако има валидна бисквитка) — без да изисква вход. */
export async function attachSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
  const principal = await resolveSession(cookies[sessionCookieName()]);
  if (principal) {
    req.principal = principal;
    res.locals.currentUser = principal.user;
    res.locals.currentRole = principal.user.role;
    res.locals.csrfToken = principal.session.csrfToken;
  } else {
    res.locals.currentUser = null;
    res.locals.currentRole = null;
    res.locals.csrfToken = '';
  }
  next();
}

/** Чисти изтеклите сесии — вика се от работника веднъж дневно. */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: new Date() } },
        { createdAt: { lte: new Date(Date.now() - SESSION_ABSOLUTE_MS) } },
      ],
    },
  });
  return result.count;
}
