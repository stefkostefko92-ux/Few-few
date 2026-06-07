import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

/**
 * Hash a secret with scrypt (Node built-in — no native build needed). GDD §11.2
 * lists bcrypt/argon2; scrypt is the same memory-hard class and ships with Node,
 * keeping the prototype dependency-free. Format: `scrypt$<saltHex>$<hashHex>`.
 */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const dk = (await scryptAsync(secret, salt, KEYLEN)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${dk.toString("hex")}`;
}

/** Constant-time verification of a secret against a stored hash. */
export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const dk = (await scryptAsync(secret, salt, expected.length)) as Buffer;
  return expected.length === dk.length && timingSafeEqual(expected, dk);
}
