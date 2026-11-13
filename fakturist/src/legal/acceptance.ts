import type { Prisma } from '@prisma/client';
import {
  ACCEPTED_ON_REGISTRATION,
  ACKNOWLEDGED_ON_REGISTRATION,
  LEGAL_DOCUMENTS,
  type LegalDocumentId,
} from './documents.js';

/**
 * Записва приетите при регистрацията документи (SPEC 35): общите условия и договора за обработване —
 * приети с отметката, политиката — прочетена. Версиите са текущите от src/legal/documents.ts. Само
 * добавяне — в транзакцията на регистрацията или на поканата.
 */
export async function recordRegistrationAcceptance(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    organizationId: string;
    now?: Date;
    /** По подразбиране — всичко от регистрацията; член на фирма приема само условията и политиката. */
    documents?: readonly LegalDocumentId[];
  },
): Promise<void> {
  const acceptedAt = input.now ?? new Date();
  const documents = input.documents ?? [
    ...ACCEPTED_ON_REGISTRATION,
    ...ACKNOWLEDGED_ON_REGISTRATION,
  ];
  await tx.legalAcceptance.createMany({
    data: documents.map((document) => ({
      userId: input.userId,
      organizationId: input.organizationId,
      document,
      version: LEGAL_DOCUMENTS[document].version,
      acceptedAt,
    })),
  });
}
