// Погасяване на вересия: клиентът плаща (част от) задължението си в брой.
// Парите влизат в касата като „служебно въведени суми“ със служебен бон от ФУ
// (самата продажба вече е фискализирана при записването на вересията).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getFiscalDriver } from "@/lib/fiscal";

const schema = z.object({
  customerId: z.string().min(1),
  amountCents: z.number().int().min(1),
});

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireSession();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни.");
    const { customerId, amountCents } = parsed.data;

    const shift = await prisma.shift.findFirst({
      where: { userId: s.userId, closedAt: null },
    });
    if (!shift) throw jsonError(409, "Няма отворена смяна.");

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || !customer.active) throw jsonError(404, "Клиентът не е намерен.");
    if (customer.balanceCents <= 0) throw jsonError(409, "Клиентът няма задължение.");
    if (amountCents > customer.balanceCents) {
      throw jsonError(400, "Сумата е по-голяма от задължението.");
    }

    const fiscal = await getFiscalDriver();
    const r = await fiscal.cashInOut(amountCents);
    if (!r.ok) throw jsonError(502, r.error ?? "ФУ отказа служебното въвеждане.");

    const [updated] = await prisma.$transaction([
      prisma.customer.update({
        where: { id: customerId },
        data: { balanceCents: { decrement: amountCents } },
      }),
      prisma.cashMovement.create({
        data: {
          shiftId: shift.id,
          userId: s.userId,
          type: "IN",
          amountCents,
          reason: `Погасяване на вересия — ${customer.name} (карта ${customer.cardNumber})`,
          fiscalDocNo: r.receiptNumber ?? null,
        },
      }),
    ]);

    await audit(s.userId, "CREDIT_SETTLED", "Customer", customerId, {
      amountCents,
      remainingCents: updated.balanceCents,
    });

    return Response.json({
      customer: updated,
      receiptText: r.receiptText ?? null,
    });
  });
}
