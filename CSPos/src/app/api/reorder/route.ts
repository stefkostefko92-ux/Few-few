// Reorder предложения: стоки под минимума с предложено количество за поръчка
// (до целево ниво = 2× минимум), групирани по последния доставчик от историята.
// Целта е да не се разпродава / презапасява — на база минималния праг.

import { prisma } from "@/lib/db";
import { guard, requireRole } from "@/lib/auth";
import { SERVICE_PLU_MIN } from "@/lib/constants";

export async function GET() {
  return guard(async () => {
    await requireRole("MANAGER");

    // стоки с зададен минимум, паднали на/под него (без служебните артикули)
    const products = await prisma.product.findMany({
      where: { active: true, minStockMilli: { gt: 0 }, plu: { lt: SERVICE_PLU_MIN } },
    });
    const low = products.filter((p) => p.stockMilli <= p.minStockMilli);
    if (low.length === 0) return Response.json({ suppliers: [] });

    // последен доставчик за всяка стока (от историята на доставките)
    const lastByProduct = new Map<string, { id: string; name: string }>();
    for (const p of low) {
      const di = await prisma.deliveryItem.findFirst({
        where: { productId: p.id },
        include: { delivery: { include: { supplier: { select: { id: true, name: true } } } } },
        orderBy: { delivery: { createdAt: "desc" } },
      });
      if (di) lastByProduct.set(p.id, di.delivery.supplier);
    }

    type Item = {
      productId: string;
      plu: number;
      name: string;
      unit: string;
      stockMilli: number;
      minStockMilli: number;
      suggestedMilli: number;
      lastCostCents: number;
    };
    const groups = new Map<string, { supplierId: string | null; supplierName: string; items: Item[] }>();

    for (const p of low) {
      const target = p.minStockMilli * 2; // целево ниво
      const suggested = Math.max(p.minStockMilli, target - p.stockMilli);
      const sup = lastByProduct.get(p.id) ?? null;
      const key = sup?.id ?? "—";
      const g = groups.get(key) ?? {
        supplierId: sup?.id ?? null,
        supplierName: sup?.name ?? "Без доставчик (от историята)",
        items: [],
      };
      g.items.push({
        productId: p.id,
        plu: p.plu,
        name: p.name,
        unit: p.unit,
        stockMilli: p.stockMilli,
        minStockMilli: p.minStockMilli,
        // за бройки — цяло число; за кг — милихилядни
        suggestedMilli: p.unit === "PCS" ? Math.ceil(suggested / 1000) * 1000 : suggested,
        lastCostCents: p.costCents,
      });
      groups.set(key, g);
    }

    const suppliers = [...groups.values()]
      .map((g) => ({
        ...g,
        items: g.items.sort((a, b) => a.name.localeCompare(b.name)),
        estimatedCostCents: g.items.reduce(
          (acc, it) => acc + Math.round((it.lastCostCents * it.suggestedMilli) / 1000),
          0
        ),
      }))
      .sort((a, b) => a.supplierName.localeCompare(b.supplierName));

    return Response.json({ suppliers });
  });
}
