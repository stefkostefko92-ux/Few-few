import { SignJWT, jwtVerify } from 'jose';

import { env } from '../env.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ALG = 'HS256';

export type SessionClaims = {
  sub: string;
  email: string;
  role: string;
};

/** Подписва кратко живееща сесийна JWT за вписан админ. */
export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email, role: claims.role })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_TTL_HOURS}h`)
    .sign(secret);
}

/** Проверява и декодира сесийна JWT; връща null при невалиден/изтекъл токен. */
export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });
    if (
      typeof payload.sub === 'string' &&
      typeof payload.email === 'string' &&
      typeof payload.role === 'string'
    ) {
      return { sub: payload.sub, email: payload.email, role: payload.role };
    }
    return null;
  } catch {
    return null;
  }
}
