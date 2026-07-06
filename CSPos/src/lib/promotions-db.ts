// Заявка за активните промоции „сега“ (по дата). Часовете/количеството/обхватът
// се преценяват в чистата логика (src/lib/promotions.ts).

import { prisma } from "./db";
import type { ActivePromotion } from "./promotions";

export async function fetchActivePromotions(now: Date): Promise<ActivePromotion[]> {
  const rows = await prisma.promotion.findMany({
    where: {
      active: true,
      startDate: { lte: now },
      endDate: { gte: now },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    productId: p.productId,
    categoryId: p.categoryId,
    kind: p.kind as "PERCENT" | "PRICE" | "MXN",
    percent: p.percent,
    priceCents: p.priceCents,
    buyQty: p.buyQty,
    payQty: p.payQty,
    startMinute: p.startMinute,
    endMinute: p.endMinute,
    minQtyMilli: p.minQtyMilli,
  }));
}
