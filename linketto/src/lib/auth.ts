import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { cache } from 'react';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { isAdminEmail } from './admin-list';
import { LAST_SEEN_EVERY_MS, SESSION_LIMITS, sessionExpired } from './session-policy';
import { TERMS_VERSION } from './terms';

export { stepUpFresh } from './session-policy';
import type { Session, User } from '@prisma/client';

// Сесии (син/червен екип, docs/security-2fa-settings-spec.md):
// - бисквитка `__Host-` в продукция (без Domain, само Secure, path=/) — съседен
//   поддомейн не може да я подмени; старото име се чете още 30 дни;
// - ротация при вход (старата сесия от бисквитката се трие);
// - изтичане при неактивност: 7 дни (админ — 12 ч), абсолютно 30 дни (админ — 24 ч);
// - вход на 2 стъпки: след паролата — предизвикателство (5 мин.), не сесия;
// - mfaAt: кога 2FA е потвърдена в сесията — за step-up при опасни действия.

const PROD = process.env.NODE_ENV === 'production';
const SESSION_COOKIE = PROD ? '__Host-linketto_session' : 'linketto_session';
const LEGACY_COOKIE = 'linketto_session';
const MFA_COOKIE = PROD ? '__Host-linketto_mfa' : 'linketto_mfa';
const BCRYPT_ROUNDS = 12;

const CHALLENGE_MS = 5 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieBase(expires: Date) {
  return { httpOnly: true, secure: PROD, sameSite: 'lax' as const, path: '/', expires };
}

// Изтриване: `__Host-` бисквитка се приема само със Secure и path=/ — обикновеното
// delete() ги пропуска и браузърът го игнорира (тест e2e: бисквитката оставаше).
type CookieStore = Awaited<ReturnType<typeof cookies>>;
function clearCookie(store: CookieStore, name: string): void {
  store.set(name, '', { ...cookieBase(new Date(0)), maxAge: 0 });
}

export async function registerUser(
  email: string,
  password: string,
  name: string | null,
  locale: string,
): Promise<User | null> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return null;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return prisma.user.create({
    data: { email, passwordHash, name, locale, termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION },
  });
}

// Валиден 60-знаков bcrypt хеш (cost 12): bcryptjs връща веднага при
// невалидна форма, а изравняването на времето иска реалната работа.
let dummy: string | null = null;
function dummyHash(): string {
  dummy ??= bcrypt.hashSync('linketto-timing-equalizer', BCRYPT_ROUNDS);
  return dummy;
}

export async function verifyLogin(
  email: string,
  password: string,
): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Изравняване на времето — да не издаваме кой имейл съществува.
    await bcrypt.compare(password, dummyHash());
    return null;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export async function verifyPassword(user: Pick<User, 'passwordHash'>, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function currentToken(): Promise<string | null> {
  const store = await cookies();
  // Само __Host- бисквитката (Разбивача N1): старата без префикс може да се
  // подхвърли от съседен поддомейн (Domain=родителски) и да обезсмисли всяка
  // проверка „в сесията на същия потребител“. Старите сесии влизат наново веднъж.
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** Нова сесия (ротация: текущата от бисквитката се трие). */
export async function createSession(
  userId: string,
  opts: { admin?: boolean; mfa?: boolean } = {},
): Promise<void> {
  const old = await currentToken();
  if (old) await prisma.session.deleteMany({ where: { tokenHash: hashToken(old) } }).catch(() => undefined);
  const limits = opts.admin ? SESSION_LIMITS.admin : SESSION_LIMITS.user;
  const token = randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + limits.absolute);
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, lastSeenAt: now, mfaAt: opts.mfa ? now : null },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieBase(expiresAt));
  if (PROD) clearCookie(store, LEGACY_COOKIE);
}

export type ActiveSession = { user: User; session: Session };

// cache: една заявка към базата за целия рендер (хедър, табло, шел).
export const getSession = cache(async function getSession(): Promise<ActiveSession | null> {
  const token = await currentToken();
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  const now = Date.now();
  if (sessionExpired(session, isAdminEmail(session.user.email), now)) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (now - session.lastSeenAt.getTime() > LAST_SEEN_EVERY_MS) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } })
      .catch(() => undefined);
  }
  const { user, ...rest } = session;
  return { user, session: rest as Session };
});

export const getSessionUser = cache(async function getSessionUser(): Promise<User | null> {
  return (await getSession())?.user ?? null;
});

export async function destroySession(): Promise<void> {
  const token = await currentToken();
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } }).catch(() => undefined);
  }
  const store = await cookies();
  clearCookie(store, SESSION_COOKIE);
  if (PROD) clearCookie(store, LEGACY_COOKIE);
}

/** Изход от всички ДРУГИ устройства (текущата сесия остава). */
export async function revokeOtherSessions(userId: string): Promise<number> {
  const token = await currentToken();
  const keep = token ? hashToken(token) : '';
  const { count } = await prisma.session.deleteMany({ where: { userId, NOT: { tokenHash: keep } } });
  return count;
}

/** 2FA е потвърдена в текущата сесия сега (вход с код или step-up). */
export async function markSessionMfa(sessionId: string): Promise<void> {
  await prisma.session.update({ where: { id: sessionId }, data: { mfaAt: new Date() } });
}

// --- Вход на 2 стъпки -------------------------------------------------------

export async function createLoginChallenge(userId: string): Promise<void> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + CHALLENGE_MS);
  await prisma.loginChallenge.deleteMany({ where: { userId } });
  await prisma.loginChallenge.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  (await cookies()).set(MFA_COOKIE, token, cookieBase(expiresAt));
}

export async function readLoginChallenge() {
  const token = (await cookies()).get(MFA_COOKIE)?.value;
  if (!token) return null;
  const challenge = await prisma.loginChallenge.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!challenge || challenge.expiresAt.getTime() < Date.now()) return null;
  return challenge;
}

export async function clearLoginChallenge(id?: string): Promise<void> {
  if (id) await prisma.loginChallenge.delete({ where: { id } }).catch(() => undefined);
  clearCookie(await cookies(), MFA_COOKIE);
}

// --- Еднократни токени по имейл ----------------------------------------------

/** Целта на токена — проверява се при всяко четене (verify ≠ reset). */
export type TokenPurpose = 'verify-email' | 'reset-password';

export async function createUserToken(userId: string, purpose: TokenPurpose, ttlMs: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.userToken.deleteMany({ where: { userId, purpose, usedAt: null } });
  await prisma.userToken.create({
    data: { tokenHash: hashToken(token), userId, purpose, expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

/** Използва токена (еднократно); връща потребителя или null. */
/** Чий е токенът — БЕЗ да го изразходва (за проверка преди консумиране). */
export async function peekUserToken(token: string, purpose: TokenPurpose): Promise<User | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const record = await prisma.userToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!record || record.purpose !== purpose || record.usedAt || record.expiresAt.getTime() < Date.now()) return null;
  return record.user;
}

export async function consumeUserToken(token: string, purpose: TokenPurpose): Promise<User | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const record = await prisma.userToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!record || record.purpose !== purpose || record.usedAt || record.expiresAt.getTime() < Date.now()) return null;
  const { count } = await prisma.userToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1 ? record.user : null;
}
