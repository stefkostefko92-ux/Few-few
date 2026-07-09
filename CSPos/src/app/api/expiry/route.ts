// Срок на годност: партиди от доставките с наближаващ/изтекъл срок (FEFO).
// Забележка: разходът не се води по партиди (продажбата намалява общата
// наличност), затова това е списък на ДОСТАВЕНИТЕ партиди по срок — практически
// сигнал „провери рафта“, не точен остатък по партида.

import { prisma } from "@/lib/db";
import { guard, requireRole } from "@/lib/auth";

export async function GET(req: Request) {
  return guard(async () => {
    await requireRole("MANAGER");
    const days = Math.min(
      Math.max(parseInt(new URL(req.url).searchParams.get("days") ?? "14", 10), 1),
      365
    );
    const now = new Date();
    const threshold = new Date(now.getTime() + days * 864e5);

    const items = await prisma.deliveryItem.findMany({
      where: { expiryDate: { not: null, lte: threshold } },
      include: {
        product: { select: { id: true, plu: true, name: true, unit: true } },
        delivery: { select: { createdAt: true, supplier: { select: { name: true } } } },
      },
      orderBy: { expiryDate: "asc" },
      take: 200,
    });

    const batches = items.map((it) => {
      const daysLeft = Math.floor(
        (it.expiryDate!.getTime() - now.getTime()) / 864e5
      );
      return {
        id: it.id,
        productId: it.product.id,
        plu: it.product.plu,
        name: it.product.name,
        unit: it.product.unit,
        qtyMilli: it.qtyMilli,
        batchNumber: it.batchNumber,
        expiryDate: it.expiryDate,
        daysLeft,
        expired: daysLeft < 0,
        supplier: it.delivery.supplier.name,
        deliveredAt: it.delivery.createdAt,
      };
    });

    return Response.json({
      days,
      batches,
      expiredCount: batches.filter((b) => b.expired).length,
      soonCount: batches.filter((b) => !b.expired).length,
    });
  });
}
