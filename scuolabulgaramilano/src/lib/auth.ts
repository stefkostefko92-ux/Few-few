import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type Session } from "./session";

export { SESSION_COOKIE, createSession, verifySession, sessionCookieOptions } from "./session";
export type { Session } from "./session";

// A fixed bcrypt hash used to equalise timing when the email doesn't match,
// so an attacker can't distinguish a wrong email from a wrong password.
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO3Wy8x5b6sJ9q1mY3oqJrU2X1nqNpC7G";

// Read the current admin session from the request cookies (server components).
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token);
}

// Validate the submitted credentials against the configured admin account.
// ADMIN_PASSWORD_HASH (bcrypt) is preferred; ADMIN_PASSWORD (plaintext) is a
// convenience for first run (the entrypoint hashes it at boot in production).
export async function verifyCredentials(email: string, password: string): Promise<boolean> {
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const emailMatches = !!adminEmail && email.trim().toLowerCase() === adminEmail;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const plain = process.env.ADMIN_PASSWORD;

  // Always do comparable work to avoid leaking which field was wrong.
  if (!emailMatches) {
    try { await bcrypt.compare(password, hash || DUMMY_HASH); } catch {}
    return false;
  }
  if (hash) {
    try { return await bcrypt.compare(password, hash); } catch { return false; }
  }
  if (plain) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[auth] Using ADMIN_PASSWORD plaintext. Prefer ADMIN_PASSWORD_HASH.");
    }
    return password === plain;
  }
  return false;
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 12);
}
