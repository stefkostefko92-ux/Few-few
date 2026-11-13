import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { PAYABLE_TYPES } from '../documents/payments.js';

/** Предложенията на сверката с банката (SPEC 54) — коя фактура е вероятно платена с постъплението. */
export interface Suggestion {
  documentId: string;
  number: string;
  remainingCents: bigint;
  reason: 'number' | 'amount';
}

/** Номерата във вид на фактура от основанието (3–10 цифри) → десетразрядни. */
export function numbersIn(remittance: string): string[] {
  const found = remittance.match(/\d{3,10}/g) ?? [];
  return [...new Set(found.map((n) => n.padStart(10, '0')))];
}

type SuggestLine = { remittance: string; amountCents: bigint; currency: string };

/**
 * Предложения за страница редове с ДВЕ заявки (не по две на ред): фактура с номера от основанието и
 * остатък ≥ сумата (точният остатък — пръв); иначе — единствената неплатена фактура с точно такъв
 * остатък в същата валута.
 */
export async function suggestMany(
  organizationId: string,
  lines: readonly SuggestLine[],
): Promise<Array<Suggestion | null>> {
  if (lines.length === 0) return [];
  const numbers = [...new Set(lines.flatMap((l) => numbersIn(l.remittance)))];
  const amounts = [...new Set(lines.map((l) => l.amountCents))];
  const [byNumber, byAmount] = await Promise.all([
    numbers.length
      ? prisma.document.findMany({
          where: {
            organizationId,
            status: 'ISSUED',
            typeCode: { in: [...PAYABLE_TYPES] },
            paymentState: { in: ['UNPAID', 'PARTIAL'] },
            number: { in: numbers },
          },
          select: { id: true, number: true, currency: true, payableCents: true, paidCents: true },
        })
      : Promise.resolve([]),
    prisma.$queryRaw<Array<{ id: string; number: string; currency: string; remaining: bigint }>>`
      SELECT "id", "number", "currency", "payableCents" - "paidCents" AS "remaining"
      FROM "Document"
      WHERE "organizationId" = ${organizationId} AND "status" = 'ISSUED'
        AND "typeCode" IN ('380', '383') AND "paymentState" IN ('UNPAID', 'PARTIAL')
        AND "payableCents" - "paidCents" IN (${Prisma.join(amounts)})`,
  ]);
  const docsByNumber = new Map<string, typeof byNumber>();
  for (const doc of byNumber) {
    if (!doc.number) continue;
    docsByNumber.set(doc.number, [...(docsByNumber.get(doc.number) ?? []), doc]);
  }
  const amountKey = (currency: string, cents: bigint) => `${currency}:${cents}`;
  const docsByAmount = new Map<string, Array<{ id: string; number: string }>>();
  for (const doc of byAmount) {
    const key = amountKey(doc.currency, BigInt(doc.remaining));
    docsByAmount.set(key, [...(docsByAmount.get(key) ?? []), doc]);
  }
  return lines.map((line) => {
    const fitting = numbersIn(line.remittance)
      .flatMap((n) => docsByNumber.get(n) ?? [])
      .filter((d) => d.currency === line.currency)
      .map((d) => ({ ...d, remaining: d.payableCents - d.paidCents }))
      .filter((d) => d.remaining >= line.amountCents)
      .sort(
        (a, b) =>
          Number(a.remaining === line.amountCents ? -1 : 0) -
          Number(b.remaining === line.amountCents ? -1 : 0),
      );
    const best = fitting[0];
    if (best?.number) {
      return {
        documentId: best.id,
        number: best.number,
        remainingCents: best.remaining,
        reason: 'number',
      };
    }
    const same = docsByAmount.get(amountKey(line.currency, line.amountCents)) ?? [];
    if (same.length === 1) {
      return {
        documentId: same[0]!.id,
        number: same[0]!.number,
        remainingCents: line.amountCents,
        reason: 'amount',
      };
    }
    return null;
  });
}

export async function suggest(
  organizationId: string,
  line: SuggestLine,
): Promise<Suggestion | null> {
  return (await suggestMany(organizationId, [line]))[0] ?? null;
}
