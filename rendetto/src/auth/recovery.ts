import { randomInt } from 'node:crypto';
import { config } from '../config.js';
import { hmacHex } from '../crypto.js';
import { prisma } from '../db.js';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const RECOVERY_CODE_COUNT = 10;

/** Код от 10 знака без двусмислени букви (без i, l, o, 0, 1), показан като „xxxxx-xxxxx“ — ~49 бита. */
function generateCode(): string {
  let code = '';
  // randomInt е без отместване по модул — всеки знак е равновероятен.
  for (let i = 0; i < 10; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

export function normalizeRecoveryCode(input: string): string {
  const clean = input.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean.length === 10 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : '';
}

function hashCode(code: string): string {
  return hmacHex(config().HMAC_KEY, `recovery:${code}`);
}

/** Нов комплект: старите се изтриват. Кодовете се показват веднъж; в базата е само HMAC. */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateCode);
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashCode(code) })),
    }),
  ]);
  return codes;
}

/** Изразходва код. Атомарно: два паралелни опита с един код не минават и двата. */
export async function consumeRecoveryCode(userId: string, input: string): Promise<boolean> {
  const code = normalizeRecoveryCode(input);
  if (!code) return false;
  const result = await prisma.recoveryCode.updateMany({
    where: { userId, codeHash: hashCode(code), usedAt: null },
    data: { usedAt: new Date() },
  });
  return result.count === 1;
}

export async function remainingRecoveryCodes(userId: string): Promise<number> {
  return prisma.recoveryCode.count({ where: { userId, usedAt: null } });
}
