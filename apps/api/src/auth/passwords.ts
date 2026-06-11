import argon2 from "argon2";

/**
 * Password hashing with argon2id (S14 — never bcrypt/MD5/SHA1/plain).
 * Parameters chosen for a reasonable server-side cost; tune per hardware.
 */
const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
