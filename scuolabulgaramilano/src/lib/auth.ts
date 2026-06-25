import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "qb_admin";
const ALG = "HS256";
const MAX_AGE = 60 * 60 * 8; // 8 hours

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD_HASH || "";
  if (!s || s.length < 16) {
    // Fail loudly in production; allow a clearly-marked dev fallback otherwise.
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET is not set or too short (min 16 chars).");
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
    .setExpirationTime(`${MAX_AGE}s`)
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

// Read the current admin session from the request cookies (server components).
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  };
}

// Validate the submitted credentials against the configured admin account.
// ADMIN_PASSWORD_HASH (bcrypt) is preferred; ADMIN_PASSWORD (plaintext) is a
// convenience for first run and logged as a warning.
export async function verifyCredentials(email: string, password: string): Promise<boolean> {
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!adminEmail || email.trim().toLowerCase() !== adminEmail) return false;

  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }
  const plain = process.env.ADMIN_PASSWORD;
  if (plain) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[auth] Using ADMIN_PASSWORD plaintext. Set ADMIN_PASSWORD_HASH instead.");
    }
    return password === plain;
  }
  return false;
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 12);
}
