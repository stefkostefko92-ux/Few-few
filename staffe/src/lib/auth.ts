import 'server-only';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import type { Role, User } from '@prisma/client';
import { prisma } from './db';
import { can, type Permission } from './rbac';
import { JWT_ISSUER as ISSUER, SESSION_COOKIE } from './auth-shared';

export { SESSION_COOKIE };
const SESSION_DAYS = 7;
const BCRYPT_ROUNDS = 12;

export type SessionClaims = {
  sub: string;
  role: Role;
  name: string;
  jti: string;
};

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  // Fail closed: senza segreto non si firma nulla. Un valore di ripiego
  // generato a runtime sembrerebbe funzionare e renderebbe i token
  // falsificabili in un deploy multi-processo.
  if (!value || value.length < 32) {
    throw new Error(
      'AUTH_SECRET mancante o troppo corto (servono almeno 32 caratteri).',
    );
  }
  return new TextEncoder().encode(value);
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyLogin(
  email: string,
  password: string,
): Promise<User | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  if (!user || !user.active) {
    // Confronto fittizio: il tempo di risposta non deve rivelare se
    // l'indirizzo esiste (enumerazione utenti).
    await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvali');
    return null;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

/** Firma il JWT e registra la sessione revocabile. */
export async function createSession(
  user: User,
  userAgent?: string | null,
): Promise<void> {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await prisma.session.create({
    data: { jti, userId: user.id, expiresAt, userAgent: userAgent ?? null },
  });

  const token = await new SignJWT({ role: user.role, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setJti(jti)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

/**
 * Verifica firma **e** validità della sessione a database: un JWT firmato ma
 * revocato (logout, utente disattivato) non deve più aprire nulla.
 */
export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let claims: SessionClaims;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER });
    if (!payload.sub || !payload.jti) return null;
    claims = payload as unknown as SessionClaims;
  } catch {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { jti: claims.jti },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (!session.user.active) return null;
  return session.user;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER });
      if (payload.jti) {
        await prisma.session
          .updateMany({
            where: { jti: payload.jti, revokedAt: null },
            data: { revokedAt: new Date() },
          })
          .catch(() => undefined);
      }
    } catch {
      // Token illeggibile: basta togliere il cookie.
    }
  }
  store.delete(SESSION_COOKIE);
}

/** Errore lanciato quando manca l'autenticazione o il permesso. */
export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new AuthError(401, 'Accesso richiesto.');
  return user;
}

export async function requirePermission(permission: Permission): Promise<User> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    throw new AuthError(403, 'Permesso negato per questa operazione.');
  }
  return user;
}

/** Elimina le sessioni scadute — chiamata dal job di manutenzione. */
export async function purgeExpiredSessions(): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
