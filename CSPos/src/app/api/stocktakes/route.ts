// Ревизия: сравнява преброеното с наличността по системата и изравнява
// склада с корекции през складовата книга (одитна следа за липси/излишъци).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function GET() {
  return guard(async () => {
    await requireRole("MANAGER");
    const stocktakes = await prisma.stocktake.findMany({
      include: {
        user: { select: { name: true } },
        items: { include: { product: { select: { name: true, plu: true, unit: true } } } },
      },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
    return Response.json({ stocktakes });
  });
}

const schema = z.object({
  note: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        countedMilli: z.number().int().min(0),
      })
    )
    .min(1),
});

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireRole("MANAGER");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни за ревизия.");
    const body = parsed.data;

    const ids = body.items.map((i) => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: ids } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    const stocktake = await prisma.$transaction(async (tx) => {
      const created = await tx.stocktake.create({
        data: {
          userId: s.userId,
          note: body.note ?? null,
          completedAt: new Date(),
          items: {
            create: body.items.map((i) => ({
              productId: i.productId,
              expectedMilli: byId.get(i.productId)?.stockMilli ?? 0,
              countedMilli: i.countedMilli,
            })),
          },
        },
        include: { items: true },
      });

      for (const i of body.items) {
        const expected = byId.get(i.productId)?.stockMilli ?? 0;
        const delta = i.countedMilli - expected;
        if (delta !== 0) {
          await tx.product.update({
            where: { id: i.productId },
            data: { stockMilli: i.countedMilli },
          });
          await tx.stockMovement.create({
            data: {
              productId: i.productId,
              type: "STOCKTAKE",
              qtyMilliDelta: delta,
              refId: created.id,
              note: delta < 0 ? "липса" : "излишък",
            },
          });
        }
      }
      return created;
    });

    await audit(s.userId, "STOCKTAKE", "Stocktake", stocktake.id, {
      itemCount: body.items.length,
    });
    return Response.json({ stocktake }, { status: 201 });
  });
}
