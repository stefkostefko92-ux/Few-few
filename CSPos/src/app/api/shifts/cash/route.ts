// Служебно въведени / изведени суми (Н-18): всяка промяна на касовата
// наличност извън продажба минава през ФУ със служебен бон и се записва.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getFiscalDriver } from "@/lib/fiscal";

const schema = z.object({
  type: z.enum(["IN", "OUT"]),
  amountCents: z.number().int().min(1),
  reason: z.string().min(2).max(200),
});

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireSession();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни.");
    const { type, amountCents, reason } = parsed.data;

    const shift = await prisma.shift.findFirst({
      where: { userId: s.userId, closedAt: null },
    });
    if (!shift) throw jsonError(409, "Няма отворена смяна.");

    const fiscal = await getFiscalDriver();
    const r = await fiscal.cashInOut(type === "IN" ? amountCents : -amountCents);
    if (!r.ok) throw jsonError(502, r.error ?? "ФУ отказа операцията.");

    const movement = await prisma.cashMovement.create({
      data: {
        shiftId: shift.id,
        userId: s.userId,
        type,
        amountCents,
        reason,
        fiscalDocNo: r.receiptNumber ?? null,
      },
    });
    await audit(s.userId, type === "IN" ? "CASH_IN" : "CASH_OUT", "CashMovement", movement.id, {
      amountCents,
      reason,
    });
    return Response.json({ movement, receiptText: r.receiptText ?? null }, { status: 201 });
  });
}
