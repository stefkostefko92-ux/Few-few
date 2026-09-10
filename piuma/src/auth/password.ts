import * as argon2 from 'argon2';

/** Argon2id по минимума на OWASP: m=19 MiB, t=2, p=1. */
const OPTIONS: argon2.HashOptions & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export const PASSWORD_MIN_LENGTH = 12;

export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Паролата трябва да е поне ${PASSWORD_MIN_LENGTH} знака.`;
  }
  if (!/[a-zA-Zа-яА-Я]/.test(password) || !/\d/.test(password)) {
    return 'Паролата трябва да съдържа и букви, и цифри.';
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
