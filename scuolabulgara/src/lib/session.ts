import { SignJWT, jwtVerify } from "jose";

// Edge-safe session helpers (jose only — no bcrypt/next-headers), so the
// proxy/middleware bundle stays lean and runtime-agnostic.

export const SESSION_COOKIE = "qb_admin";
const ALG = "HS256";
export const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET || "";
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET is not set or too short (min 32 chars).");
    }
    return new TextEncoder().encode("dev-insecure-secret-change-me-please");
  }
  return new TextEncoder().encode(s);
}

export type Session = { email: string; iat?: number; exp?: number };

export async function createSession(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as Session;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}
