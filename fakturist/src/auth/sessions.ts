import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { config, isProduction } from '../config.js';
import { prisma } from '../db.js';
import { randomToken } from '../crypto.js';
import { readCookie } from '../http/cookies.js';
import { DAY, HOUR, MINUTE } from '../time.js';
import type { MemberRole, PlatformRole } from './roles.js';

/** Мастър и поддръжка: 8 часа без действие, таван 1 ден. Останалите: 3 дни без действие, таван 14 дни. */
export const SESSION_LIMITS = {
  privileged: { idleMs: 8 * HOUR, absoluteMs: DAY },
  standard: { idleMs: 3 * DAY, absoluteMs: 14 * DAY },
} as const;

const ISSUER = 'fakturist';
const AUDIENCE = 'fakturist';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `__Host-` иска Secure + Path=/ без Domain — бисквитка от поддомейн не може да я подмени. */
export function sessionCookieName(): string {
  return isProduction() ? '__Host-fakturist' : 'fakturist_sid';
}

function cookieOptions(maxAgeMs: number): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: isProduction(), path: '/', maxAge: maxAgeMs };
}

let key: Uint8Array | null = null;
function secretKey(): Uint8Array {
  key ??= new Uint8Array(Buffer.from(config().JWT_SECRET, 'hex'));
  return key;
}

function limits(platformRole: PlatformRole) {
  return platformRole === 'NONE' ? SESSION_LIMITS.standard : SESSION_LIMITS.privileged;
}

/** Ред в базата + подписан JWT с `sid`. `verified` е false, докато не мине вторият фактор. */
export async function startSession(
  res: Response,
  user: { id: string; platformRole: PlatformRole },
  verified: boolean,
): Promise<string> {
  const { idleMs, absoluteMs } = limits(user.platformRole);
  const now = Date.now();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      csrfToken: randomToken(24),
      verified,
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
  res.cookie(sessionCookieName(), jwt, cookieOptions(absoluteMs));
  return session.id;
}

export async function endSession(req: Request, res: Response): Promise<void> {
  if (req.principal) await prisma.session.deleteMany({ where: { id: req.principal.sessionId } });
  res.clearCookie(sessionCookieName(), cookieOptions(0));
}

async function readToken(token: string): Promise<{ sid: string; sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    const sid = payload['sid'];
    if (typeof sid !== 'string' || !UUID.test(sid) || typeof payload.sub !== 'string') return null;
    return { sid, sub: payload.sub };
  } catch {
    return null;
  }
}

/**
 * Закача сесията към заявката: валиден JWT + жив ред в базата + активен акаунт. Иначе — анонимна заявка.
 * Срокът без действие се плъзга най-много веднъж в минута.
 */
export function attachSession() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = readCookie(req, sessionCookieName());
      if (!token) return next();
      const claims = await readToken(token);
      if (!claims) return next();
      const session = await prisma.session.findUnique({
        where: { id: claims.sid },
        include: {
          user: { include: { memberships: { select: { organizationId: true, role: true } } } },
        },
      });
      const now = Date.now();
      if (
        !session ||
        session.userId !== claims.sub ||
        session.expiresAt.getTime() < now ||
        session.user.disabledAt !== null
      ) {
        res.clearCookie(sessionCookieName(), cookieOptions(0));
        return next();
      }
      const user = session.user;
      if (now - session.lastSeenAt.getTime() > MINUTE) {
        const { idleMs } = limits(user.platformRole);
        await prisma.session.update({
          where: { id: session.id },
          data: { lastSeenAt: new Date(now), expiresAt: new Date(now + idleMs) },
        });
      }
      req.principal = {
        sessionId: session.id,
        csrfToken: session.csrfToken,
        verified: session.verified,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          locale: user.locale === 'en' ? 'en' : 'bg',
          platformRole: user.platformRole,
          mustChangePassword: user.mustChangePassword,
          totpEnabled: user.totpEnabledAt !== null,
          emailVerified: user.emailVerifiedAt !== null,
          newsReadAt: user.newsReadAt,
          memberships: user.memberships.map((m) => ({
            organizationId: m.organizationId,
            role: m.role as MemberRole,
          })),
        },
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
