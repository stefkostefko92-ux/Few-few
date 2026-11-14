import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { randomToken } from '../crypto.js';

/**
 * Еднократният ключ на формата „Издай“ (одитът от 13.11.2026): всяко отваряне на формата получава ключ;
 * издаването го записва в същата транзакция (уникален userId + ключ), така че двоен клик или повторно
 * изпращане води до вече издадения документ, а не до втори с пореден номер.
 */
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export function newSubmissionToken(): string {
  return randomToken(24);
}

export function submissionToken(value: unknown): string | null {
  return typeof value === 'string' && TOKEN.test(value) ? value : null;
}

/** Документът, вече издаден с този ключ от този човек във фирмата, или null. */
export async function issuedWithToken(input: {
  userId: string;
  token: string;
  organizationId: string;
}): Promise<string | null> {
  const found = await prisma.issueSubmission.findUnique({
    where: { userId_token: { userId: input.userId, token: input.token } },
    select: { documentId: true, organizationId: true },
  });
  return found && found.organizationId === input.organizationId ? found.documentId : null;
}

/** Второто едновременно изпращане със същия ключ — уникалният индекс го спира. */
export function isSubmissionClash(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    JSON.stringify(error.meta ?? {}).includes('token')
  );
}
