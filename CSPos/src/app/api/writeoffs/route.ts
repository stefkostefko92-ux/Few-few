// Брак: изписване на стока (изтекъл срок, повреда) с одитна следа.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function GET() {
  return guard(async () => {
    await requireRole("MANAGER");
    const writeOffs = await prisma.writeOff.findMany({
      include: {
        user: { select: { name: true } },
        items: { include: { product: { select: { name: true, plu: true, unit: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return Response.json({ writeOffs });
  });
}

const schema = z.object({
  reason: z.string().min(2).max(200),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qtyMilli: z.number().int().min(1),
      })
    )
    .min(1),
});

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireRole("MANAGER");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни за брак.");
    const body = parsed.data;

    const writeOff = await prisma.$transaction(async (tx) => {
      const created = await tx.writeOff.create({
        data: {
          userId: s.userId,
          reason: body.reason,
          items: { create: body.items },
        },
        include: { items: true },
      });
      for (const i of body.items) {
        await tx.product.update({
          where: { id: i.productId },
          data: { stockMilli: { decrement: i.qtyMilli } },
        });
        await tx.stockMovement.create({
          data: {
            productId: i.productId,
            type: "WRITEOFF",
            qtyMilliDelta: -i.qtyMilli,
            refId: created.id,
            note: body.reason,
          },
        });
      }
      return created;
    });

    await audit(s.userId, "WRITEOFF", "WriteOff", writeOff.id, {
      reason: body.reason,
      itemCount: body.items.length,
    });
    return Response.json({ writeOff }, { status: 201 });
  });
}
