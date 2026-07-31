import type { Prisma } from '@prisma/client';

/** Prefissi dei numeri documento. */
export const DOC_PREFIX = {
  ordineAcquisto: 'OA',
  ricevimento: 'RIC',
  ordineVendita: 'OV',
  prelievo: 'PRL',
  spedizione: 'SPD',
  inventario: 'INV',
} as const;

export type DocKind = keyof typeof DOC_PREFIX;

/**
 * Numero documento progressivo per anno: `OA-2026-0001`.
 *
 * Va chiamato DENTRO la transazione che crea il documento: l'`upsert` con
 * `increment` è atomico, quindi due utenti che salvano nello stesso istante
 * ricevono due numeri diversi invece dello stesso.
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  kind: DocKind,
  now = new Date(),
): Promise<string> {
  const year = now.getFullYear();
  const row = await tx.documentSequence.upsert({
    where: { kind_year: { kind, year } },
    create: { kind, year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return formatDocumentNumber(kind, year, row.lastNumber);
}

export function formatDocumentNumber(
  kind: DocKind,
  year: number,
  n: number,
): string {
  return `${DOC_PREFIX[kind]}-${year}-${String(n).padStart(4, '0')}`;
}
