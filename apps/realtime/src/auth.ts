import jwt from "jsonwebtoken";
import { ACCESS_COOKIE, type AccessTokenClaims } from "@aso/shared";
import { env } from "./env.js";

/** Parse a Cookie header into a map. */
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    // A stray "%" makes decodeURIComponent throw URIError — never let a
    // malformed cookie crash the handshake; fall back to the raw value.
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

/** Verify the httpOnly access cookie sent during the Socket.IO handshake (§8.3). */
export function verifyHandshake(cookieHeader: string | undefined): AccessTokenClaims | null {
  const token = parseCookies(cookieHeader)[ACCESS_COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, env.JWT_SECRET) as AccessTokenClaims;
  } catch {
    return null;
  }
}
