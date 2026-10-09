import type { AccountKind, Prisma, PrismaClient, Role } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { hashToken, randomToken } from '../crypto.js';
import { mfaRequired } from './rbac.js';

/**
 * Сесии в базата: в бисквитката е случаен токен, в базата — само HMAC-ът му. Отнемат се веднага
 * (изход, деактивиране, смяна на роля — AC-16), което JWT без списък за отнемане не позволява.
 * Бисквитката: httpOnly, Secure (в продукция), SameSite=Strict, само за пътя на приложението.
 */

export const SESSION_COOKIE = 'cc_session';
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export interface MfaState {
  /** TOTP е включен за акаунта. */
  enabled: boolean;
  /** Вторият фактор е минат в ТАЗИ сесия. */
  passed: boolean;
  /** Ролята е задължена да има TOTP (персоналът). */
  required: boolean;
}

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
  mfa: MfaState;
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

export function mfaStateOf(
  user: { role: Role; totpEnabledAt: Date | null },
  sessionPassed: boolean,
): MfaState {
  const enabled = user.totpEnabledAt !== null;
  return { enabled, passed: enabled && sessionPassed, required: mfaRequired(user.role) };
}

export async function createSession(
  deps: SessionDeps,
  userId: string,
): Promise<{ id: string; token: string; csrfToken: string; expiresAt: Date }> {
  const token = randomToken();
  const csrfToken = randomToken(24);
  const expiresAt = new Date(Date.now() + deps.ttlHours * 3600 * 1000);
  const session = await deps.db.session.create({
    data: { userId, tokenHash: hashToken(token, deps.pepper), csrfToken, expiresAt },
  });
  return { id: session.id, token, csrfToken, expiresAt };
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
        mfa: mfaStateOf(u, session.mfaPassed),
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

// ─── Отнемане (AC-16) ───────────────────────────────────────────────────────────────────────

export type RevocationReason =
  | 'logout'
  | 'deactivated'
  | 'role_changed'
  | 'scope_changed'
  | 'expired'
  | 'password_reset'
  | 'mfa_reset'
  | 'admin_revoke'
  | 'erased';

export interface SessionRevocation {
  userIds: string[];
  /** Само при изход — една сесия; иначе всички сесии на изброените хора. */
  sessionId?: string;
  reason: RevocationReason;
  count: number;
}

export type RevocationListener = (event: SessionRevocation) => void | Promise<void>;

const listeners = new Set<RevocationListener>();

/**
 * Куката за модули с дълги връзки (realtime потоци, SSE, WebSocket): извиква се СЛЕД като сесиите
 * са отнети в базата, за да затворят отворените потоци на тези хора веднага. Връща отписване.
 */
export function onSessionsRevoked(listener: RevocationListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Известява куките. Грешка в слушател не проваля заявката — отнемането в базата вече е факт. */
export async function announceRevocation(event: SessionRevocation): Promise<void> {
  for (const listener of [...listeners]) {
    try {
      await listener(event);
    } catch {
      // Слушателят сам пази своя лог; базата е източникът на истината (loadPrincipal).
    }
  }
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * ЕДИНСТВЕНОТО място за отнемане на всички сесии на хора (деактивиране, смяна на роля/обхват,
 * изтичане, нулиране на парола/MFA, изтриване — AC-16). С основния клиент куките се викат веднага;
 * в транзакция викащият ги вика с `announceRevocation(резултата)` СЛЕД commit.
 */
export async function revokeUserSessions(
  db: Db,
  userIds: readonly string[],
  reason: RevocationReason,
): Promise<SessionRevocation> {
  const ids = [...new Set(userIds)];
  const result =
    ids.length === 0
      ? { count: 0 }
      : await db.session.updateMany({
          where: { userId: { in: ids }, revokedAt: null },
          data: { revokedAt: new Date() },
        });
  const event: SessionRevocation = { userIds: ids, reason, count: result.count };
  if ('$transaction' in db) await announceRevocation(event);
  return event;
}

/** Изход: само текущата сесия. */
export async function revokeSession(db: PrismaClient, principal: Principal): Promise<void> {
  const result = await db.session.updateMany({
    where: { id: principal.session.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await announceRevocation({
    userIds: [principal.user.id],
    sessionId: principal.session.id,
    reason: 'logout',
    count: result.count,
  });
}
