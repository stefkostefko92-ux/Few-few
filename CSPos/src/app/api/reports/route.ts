// Отчети за период: обороти по дни, ДДС по групи, плащания, топ стоки,
// по касиери + изчерпващи се наличности.

import { prisma } from "@/lib/db";
import { guard, jsonError, requireRole } from "@/lib/auth";
import { vatBreakdown } from "@/lib/vat";
import { SERVICE_PLU_MIN } from "@/lib/constants";

export async function GET(req: Request) {
  return guard(async () => {
    await requireRole("MANAGER");
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!from || !to) throw jsonError(400, "Задайте период from/to (ISO дати).");

    const fromDate = new Date(`${from}T00:00:00`);
    const toDate = new Date(`${to}T23:59:59.999`);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw jsonError(400, "Невалидни дати.");
    }

    const sales = await prisma.sale.findMany({
      where: { createdAt: { gte: fromDate, lte: toDate } },
      include: { items: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });

    const completed = sales.filter((s) => s.status === "COMPLETED");
    const stornos = sales.filter((s) => s.status === "STORNO");

    // по дни
    const byDay = new Map<string, { totalCents: number; count: number; stornoCents: number }>();
    for (const s of completed) {
      const day = s.createdAt.toISOString().slice(0, 10);
      const acc = byDay.get(day) ?? { totalCents: 0, count: 0, stornoCents: 0 };
      acc.totalCents += s.totalCents;
      acc.count += 1;
      byDay.set(day, acc);
    }
    for (const s of stornos) {
      const day = s.createdAt.toISOString().slice(0, 10);
      const acc = byDay.get(day) ?? { totalCents: 0, count: 0, stornoCents: 0 };
      acc.stornoCents += s.totalCents;
      byDay.set(day, acc);
    }

    // ДДС разбивка (само приключени, минус сторно)
    const vatItems = completed.flatMap((s) => s.items);
    const stornoItems = stornos.flatMap((s) =>
      s.items.map((i) => ({ ...i, totalCents: -i.totalCents, vatCents: -i.vatCents }))
    );
    const vat = vatBreakdown([...vatItems, ...stornoItems]);

    // топ стоки
    const byProduct = new Map<string, { name: string; qtyMilli: number; totalCents: number }>();
    for (const it of vatItems) {
      const acc = byProduct.get(it.productId) ?? {
        name: it.nameSnapshot,
        qtyMilli: 0,
        totalCents: 0,
      };
      acc.qtyMilli += it.qtyMilli;
      acc.totalCents += it.totalCents;
      byProduct.set(it.productId, acc);
    }
    const topProducts = [...byProduct.values()]
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, 20);

    // по касиери
    const byCashier = new Map<string, { totalCents: number; count: number }>();
    for (const s of completed) {
      const acc = byCashier.get(s.user.name) ?? { totalCents: 0, count: 0 };
      acc.totalCents += s.totalCents;
      acc.count += 1;
      byCashier.set(s.user.name, acc);
    }

    // изчерпващи се наличности (без служебните артикули — те нямат склад)
    const allProducts = await prisma.product.findMany({
      where: { active: true, plu: { lt: SERVICE_PLU_MIN } },
    });
    const lowStock = allProducts
      .filter((p) => p.stockMilli <= p.minStockMilli)
      .map((p) => ({
        id: p.id,
        plu: p.plu,
        name: p.name,
        unit: p.unit,
        stockMilli: p.stockMilli,
        minStockMilli: p.minStockMilli,
      }))
      .slice(0, 50);

    const totals = {
      revenueCents: completed.reduce((a, s) => a + s.totalCents, 0),
      stornoCents: stornos.reduce((a, s) => a + s.totalCents, 0),
      cashCents: completed.reduce((a, s) => a + s.cashCents, 0),
      cardCents: completed.reduce((a, s) => a + s.cardCents, 0),
      creditCents: completed
        .filter((s) => s.paymentType === "CREDIT")
        .reduce((a, s) => a + s.totalCents, 0),
      salesCount: completed.length,
      stornoCount: stornos.length,
      discountCents: completed.reduce((a, s) => a + s.discountCents, 0),
    };

    return Response.json({
      totals,
      byDay: [...byDay.entries()].map(([day, v]) => ({ day, ...v })),
      vat,
      topProducts,
      byCashier: [...byCashier.entries()].map(([name, v]) => ({ name, ...v })),
      lowStock,
    });
  });
}
