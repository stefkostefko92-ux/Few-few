// Доставки: заприхождават склада, обновяват доставната цена и пазят
// партида/срок на годност (проследимост по Регламент 178/2002).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getVatRates } from "@/lib/settings";
import type { VatGroupKey } from "@/lib/constants";
import { guard, jsonError, requireRole, requireRead } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function GET() {
  return guard(async () => {
    await requireRead("MANAGER");
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
  docDate: z.string().date().optional(),
  paymentType: z.enum(["CASH", "BANK", "CARD", "DEFERRED"]).default("BANK"),
  note: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qtyMilli: z.number().int().min(1),
        unitCostCents: z.number().int().min(0),
        discountCents: z.number().int().min(0).default(0),
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

    // т. 18.6/18.7: отстъпка и ДДС по ред — ставката е според данъчната група на стоката
    const [rates, products] = await Promise.all([
      getVatRates(),
      prisma.product.findMany({ where: { id: { in: body.items.map((i) => i.productId) } }, select: { id: true, vatGroup: true } }),
    ]);
    const groupOf = new Map(products.map((p) => [p.id, p.vatGroup as VatGroupKey]));
    const lines = body.items.map((i) => {
      const gross = Math.round((i.unitCostCents * i.qtyMilli) / 1000);
      const discount = Math.min(i.discountCents, gross);
      const net = gross - discount;
      const rate = rates[groupOf.get(i.productId) ?? "B"] ?? 200;
      return { ...i, discountCents: discount, net, vatCents: Math.round((net * rate) / 1000) };
    });
    const totalCost = lines.reduce((acc, l) => acc + l.net, 0);
    const discountTotal = lines.reduce((acc, l) => acc + l.discountCents, 0);
    const vatTotal = lines.reduce((acc, l) => acc + l.vatCents, 0);

    const delivery = await prisma.$transaction(async (tx) => {
      const created = await tx.delivery.create({
        data: {
          supplierId: body.supplierId,
          userId: s.userId,
          docNumber: body.docNumber,
          docDate: body.docDate ? new Date(body.docDate) : null,
          paymentType: body.paymentType,
          note: body.note ?? null,
          totalCostCents: totalCost,
          discountCents: discountTotal,
          vatCents: vatTotal,
          items: {
            create: lines.map((i) => ({
              productId: i.productId,
              qtyMilli: i.qtyMilli,
              unitCostCents: i.unitCostCents,
              discountCents: i.discountCents,
              vatCents: i.vatCents,
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
      discountCents: discountTotal,
      vatCents: vatTotal,
      itemCount: body.items.length,
    });
    return Response.json({ delivery }, { status: 201 });
  });
}
