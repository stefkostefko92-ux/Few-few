import { config } from '../config.js';
import { randomToken, sha256Hex } from '../crypto.js';

/** Токенът на покана или нова парола: 32 случайни байта = 43 знака base64url. В базата е само хешът. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function newToken(): { token: string; hash: string } {
  const token = randomToken(32);
  return { token, hash: sha256Hex(token) };
}

/** Хешът за търсене в базата или null за низ, който не може да е наш токен. */
export function tokenHash(token: unknown): string | null {
  return typeof token === 'string' && TOKEN_PATTERN.test(token) ? sha256Hex(token) : null;
}

export function inviteLink(token: string): string {
  return `${config().PUBLIC_BASE_URL}/invito/${token}`;
}

export function resetLink(token: string): string {
  return `${config().PUBLIC_BASE_URL}/reimposta/${token}`;
}
