// Доставки: заприхождават склада, обновяват доставната цена и пазят
// партида/срок на годност (проследимост по Регламент 178/2002).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function GET() {
  return guard(async () => {
    await requireRole("MANAGER");
    const deliveries = await prisma.delivery.findMany({
      include: {
        supplier: true,
        user: { select: { name: true } },
        items: { include: { product: { select: { name: true, plu: true, unit: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({ deliveries });
  });
}

const schema = z.object({
  supplierId: z.string().min(1),
  docNumber: z.string().min(1).max(40),
  note: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qtyMilli: z.number().int().min(1),
        unitCostCents: z.number().int().min(0),
        expiryDate: z.string().date().optional(),
        batchNumber: z.string().max(40).optional(),
      })
    )
    .min(1),
});

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireRole("MANAGER");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни за доставка.");
    const body = parsed.data;

    const totalCost = body.items.reduce(
      (acc, i) => acc + Math.round((i.unitCostCents * i.qtyMilli) / 1000),
      0
    );

    const delivery = await prisma.$transaction(async (tx) => {
      const created = await tx.delivery.create({
        data: {
          supplierId: body.supplierId,
          userId: s.userId,
          docNumber: body.docNumber,
          note: body.note ?? null,
          totalCostCents: totalCost,
          items: {
            create: body.items.map((i) => ({
              productId: i.productId,
              qtyMilli: i.qtyMilli,
              unitCostCents: i.unitCostCents,
              expiryDate: i.expiryDate ? new Date(i.expiryDate) : null,
              batchNumber: i.batchNumber ?? null,
            })),
          },
        },
        include: { items: true },
      });

      for (const i of body.items) {
        await tx.product.update({
          where: { id: i.productId },
          data: { stockMilli: { increment: i.qtyMilli }, costCents: i.unitCostCents },
        });
        await tx.stockMovement.create({
          data: {
            productId: i.productId,
            type: "DELIVERY",
            qtyMilliDelta: i.qtyMilli,
            refId: created.id,
          },
        });
      }
      return created;
    });

    await audit(s.userId, "DELIVERY", "Delivery", delivery.id, {
      docNumber: body.docNumber,
      totalCostCents: totalCost,
      itemCount: body.items.length,
    });
    return Response.json({ delivery }, { status: 201 });
  });
}
