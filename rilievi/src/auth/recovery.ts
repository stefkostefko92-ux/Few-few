import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { hmacRecupero } from './chiavi.js';

/**
 * Резервните кодове на двуфакторния вход (за изгубен телефон): 10, всеки — веднъж, показани само при
 * създаването; в базата е само HMAC (chiavi.ts). 10 знака без двусмислени (без i, l, o, 0, 1) — ~49
 * бита: при 5 опита на заключване налучкването е безнадеждно.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const RECOVERY_CODE_COUNT = 10;
const CODE_LENGTH = 10;

/** „xxxxx-xxxxx“ — видът, в който кодът се показва и хешира. */
function formatCode(clean: string): string {
  return `${clean.slice(0, CODE_LENGTH / 2)}-${clean.slice(CODE_LENGTH / 2)}`;
}

function generateCode(): string {
  let code = '';
  // randomInt е без отместване по модул — всеки знак е равновероятен.
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return formatCode(code);
}

/** Написаното от човека (главни букви, интервали, без тире) → „xxxxx-xxxxx“; иначе празно. */
export function normalizeRecoveryCode(input: string): string {
  const clean = input.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean.length === CODE_LENGTH && [...clean].every((c) => ALPHABET.includes(c))
    ? formatCode(clean)
    : '';
}

/** Нов комплект: старите се трият. Връща кодовете — показват се веднъж. */
export async function issueRecoveryCodes(
  userId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateCode);
  await db.recoveryCode.deleteMany({ where: { userId } });
  await db.recoveryCode.createMany({
    data: codes.map((code) => ({ userId, codeHash: hmacRecupero(code) })),
  });
  return codes;
}

/** Изразходва код. Атомарно: два паралелни опита с един код не минават и двата. */
export async function consumeRecoveryCode(userId: string, input: string): Promise<boolean> {
  const code = normalizeRecoveryCode(input);
  if (!code) return false;
  const result = await prisma.recoveryCode.updateMany({
    where: { userId, codeHash: hmacRecupero(code), usedAt: null },
    data: { usedAt: new Date() },
  });
  return result.count === 1;
}

export function remainingRecoveryCodes(userId: string): Promise<number> {
  return prisma.recoveryCode.count({ where: { userId, usedAt: null } });
}
