import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'lovets_session';
export const SESSION_HOURS = 12;

const key = (secret: string): Uint8Array => new TextEncoder().encode(secret);

export interface SessionClaims {
  ownerId: string;
  /** Версията на сесиите на собственика към момента на входа (изходът я вдига). */
  version: number;
}

export function signSession(claims: SessionClaims, secret: string): Promise<string> {
  return new SignJWT({ ver: claims.version })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.ownerId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key(secret));
}

export async function verifySession(token: string, secret: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.ver !== 'number') return null;
    return { ownerId: payload.sub, version: payload.ver };
  } catch {
    return null;
  }
}
