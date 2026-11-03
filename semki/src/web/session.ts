// Сесията: подписан JWT (HS256) в httpOnly бисквитка; CSRF токенът живее в него.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

export const SESSION_TTL_SECONDS = 12 * 60 * 60;
const ISSUER = 'semki';

const payloadSchema = z.object({
  sub: z.string().regex(/^\d{17,20}$/),
  name: z.string().max(100),
  avatar: z.string().max(200).nullable(),
  csrf: z.string().length(43),
});

export type SessionUser = z.output<typeof payloadSchema>;

export interface CookieNames {
  session: string;
  state: string;
  flash: string;
}

// `__Host-` бисквитките са само Secure, Path=/ и без Domain — не могат да се подхвърлят от поддомейн.
export function cookieNames(secure: boolean): CookieNames {
  const prefix = secure ? '__Host-' : '';
  return {
    session: `${prefix}semki_session`,
    state: `${prefix}semki_state`,
    flash: `${prefix}semki_flash`,
  };
}

export function cookieOptions(secure: boolean, maxAgeMs: number): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: maxAgeMs };
}

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function sessionKey(secretHex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(secretHex, 'hex'));
}

export async function signSession(
  user: Omit<SessionUser, 'csrf'>,
  key: Uint8Array,
): Promise<string> {
  return new SignJWT({ name: user.name, avatar: user.avatar, csrf: randomToken() })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key);
}

export async function verifySession(token: string, key: Uint8Array): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER, algorithms: ['HS256'] });
    const parsed = payloadSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
