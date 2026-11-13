import type { Prisma } from '@prisma/client';
import {
  ACCEPTED_ON_REGISTRATION,
  ACKNOWLEDGED_ON_REGISTRATION,
  LEGAL_DOCUMENTS,
} from './documents.js';

/**
 * Записва приетите при регистрацията документи (SPEC 35): общите условия и договора за обработване —
 * приети с отметката, политиката — прочетена. Версиите са текущите от src/legal/documents.ts. Само
 * добавяне — в транзакцията на регистрацията или на поканата.
 */
export async function recordRegistrationAcceptance(
  tx: Prisma.TransactionClient,
  input: { userId: string; organizationId: string; now?: Date },
): Promise<void> {
  const acceptedAt = input.now ?? new Date();
  await tx.legalAcceptance.createMany({
    data: [...ACCEPTED_ON_REGISTRATION, ...ACKNOWLEDGED_ON_REGISTRATION].map((document) => ({
      userId: input.userId,
      organizationId: input.organizationId,
      document,
      version: LEGAL_DOCUMENTS[document].version,
      acceptedAt,
    })),
  });
}
