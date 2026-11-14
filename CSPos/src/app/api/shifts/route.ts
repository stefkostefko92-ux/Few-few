// Смени: отваряне с начална касова наличност (служебно въведени суми през ФУ),
// закриване с преброяване, очаквана наличност и Z-отчет (дневен финансов отчет).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireSession, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getFiscalDriver } from "@/lib/fiscal";

export async function GET() {
  return guard(async () => {
    const s = await requireSession();
    const current = await prisma.shift.findFirst({
      where: { userId: s.userId, closedAt: null },
      include: {
        cashMovements: true,
        _count: { select: { sales: true } },
      },
    });
    if (!current) return Response.json({ shift: null });

    const agg = await prisma.sale.aggregate({
      where: { shiftId: current.id, status: "COMPLETED" },
      _sum: { totalCents: true, cashCents: true, cardCents: true, changeCents: true },
      _count: true,
    });
    const stornoAgg = await prisma.sale.aggregate({
      where: { shiftId: current.id, status: "STORNO" },
      _sum: { cashCents: true, cardCents: true },
      _count: true,
    });
    const cashIn = current.cashMovements
      .filter((m) => m.type === "IN")
      .reduce((a, m) => a + m.amountCents, 0);
    const cashOut = current.cashMovements
      .filter((m) => m.type === "OUT")
      .reduce((a, m) => a + m.amountCents, 0);

    // cashCents в продажбата е НЕТНАТА сума в брой (рестото вече е приспаднато)
    const cashSales = agg._sum.cashCents ?? 0;
    const cashStorno = stornoAgg._sum.cashCents ?? 0;
    const expectedCashCents =
      current.openingCashCents + cashSales - cashStorno + cashIn - cashOut;

    return Response.json({
      shift: current,
      stats: {
        salesCount: agg._count,
        stornoCount: stornoAgg._count,
        totalCents: agg._sum.totalCents ?? 0,
        cashCents: cashSales,
        cardCents: agg._sum.cardCents ?? 0,
        cashInCents: cashIn,
        cashOutCents: cashOut,
        expectedCashCents,
      },
    });
  });
}

const openSchema = z.object({
  action: z.literal("open"),
  openingCashCents: z.number().int().min(0),
});
const closeSchema = z.object({
  action: z.literal("close"),
  // Z е дневен отчет (чл. 39 Н-18) — при смяна посред деня се пуска X
  report: z.enum(["X", "Z"]).default("Z"),
  closingCashCents: z.number().int().min(0),
  note: z.string().max(500).optional(),
});
const bodySchema = z.discriminatedUnion("action", [openSchema, closeSchema]);

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireRole("CASHIER");
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни.");
    const body = parsed.data;

    const current = await prisma.shift.findFirst({
      where: { userId: s.userId, closedAt: null },
    });

    if (body.action === "open") {
      if (current) throw jsonError(409, "Вече имате отворена смяна.");
      const fiscal = await getFiscalDriver();
      if (body.openingCashCents > 0) {
        const r = await fiscal.cashInOut(body.openingCashCents, s.operatorCode);
        if (!r.ok) throw jsonError(502, r.error ?? "ФУ отказа служебното въвеждане.");
      }
      const shift = await prisma.shift.create({
        data: { userId: s.userId, openingCashCents: body.openingCashCents },
      });
      await audit(s.userId, "SHIFT_OPEN", "Shift", shift.id, {
        openingCashCents: body.openingCashCents,
      });
      return Response.json({ shift }, { status: 201 });
    }

    // close
    if (!current) throw jsonError(409, "Няма отворена смяна.");
    // открита продажба не остава „висяща“ в затворена смяна (т. 2, т. 12)
    const pending = await prisma.saleDraft.count({
      where: { userId: s.userId, state: { in: ["OPEN", "HELD", "PAYING"] }, lines: { some: {} } },
    });
    if (pending > 0) {
      throw jsonError(409, `Имате ${pending} открити или задържани продажби — приключете ги или ги анулирайте преди закриване.`);
    }

    const agg = await prisma.sale.aggregate({
      where: { shiftId: current.id, status: "COMPLETED" },
      _sum: { cashCents: true },
    });
    const stornoAgg = await prisma.sale.aggregate({
      where: { shiftId: current.id, status: "STORNO" },
      _sum: { cashCents: true },
    });
    const movements = await prisma.cashMovement.findMany({ where: { shiftId: current.id } });
    const cashIn = movements.filter((m) => m.type === "IN").reduce((a, m) => a + m.amountCents, 0);
    const cashOut = movements.filter((m) => m.type === "OUT").reduce((a, m) => a + m.amountCents, 0);
    const expected =
      current.openingCashCents +
      (agg._sum.cashCents ?? 0) -
      (stornoAgg._sum.cashCents ?? 0) +
      cashIn -
      cashOut;

    const fiscal = await getFiscalDriver();
    const z = body.report === "X" ? await fiscal.xReport() : await fiscal.zReport();
    if (!z.ok) throw jsonError(502, z.error ?? `ФУ отказа ${body.report}-отчета.`);

    const shift = await prisma.shift.update({
      where: { id: current.id },
      data: {
        closedAt: new Date(),
        closingCashCents: body.closingCashCents,
        expectedCashCents: expected,
        zReportNumber: body.report === "Z" ? z.receiptNumber ?? null : null,
        note: body.note ?? null,
      },
    });
    await audit(s.userId, "SHIFT_CLOSE", "Shift", shift.id, {
      expectedCashCents: expected,
      closingCashCents: body.closingCashCents,
      differenceCents: body.closingCashCents - expected,
      report: body.report,
      reportNumber: z.receiptNumber,
    });
    return Response.json({
      shift,
      expectedCashCents: expected,
      differenceCents: body.closingCashCents - expected,
      zReportText: z.receiptText ?? null,
    });
  });
}
