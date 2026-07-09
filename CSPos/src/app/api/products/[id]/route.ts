import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  categoryId: z.string().min(1).optional(),
  unit: z.enum(["PCS", "KG"]).optional(),
  vatGroup: z.enum(["A", "B", "C", "D"]).optional(),
  priceCents: z.number().int().min(0).optional(),
  costCents: z.number().int().min(0).optional(),
  minStockMilli: z.number().int().min(0).optional(),
  favorite: z.boolean().optional(),
  active: z.boolean().optional(),
  barcodes: z.array(z.string().min(3).max(32)).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const s = await requireRole("MANAGER");
    const { id } = await ctx.params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни.");
    const { barcodes, ...data } = parsed.data;

    const before = await prisma.product.findUnique({ where: { id } });
    if (!before) throw jsonError(404, "Стоката не е намерена.");

    const product = await prisma.$transaction(async (tx) => {
      if (barcodes) {
        await tx.barcode.deleteMany({ where: { productId: id } });
        await tx.barcode.createMany({
          data: barcodes.map((code) => ({ code, productId: id })),
        });
      }
      return tx.product.update({
        where: { id },
        data,
        include: { barcodes: true, category: true },
      });
    });

    // одит на промяна на цена — класика за проверки
    if (data.priceCents !== undefined && data.priceCents !== before.priceCents) {
      await audit(s.userId, "PRICE_CHANGE", "Product", id, {
        name: before.name,
        from: before.priceCents,
        to: data.priceCents,
      });
    } else {
      await audit(s.userId, "PRODUCT_UPDATE", "Product", id, data);
    }
    return Response.json({ product });
  });
}

// СУПТО принцип: без изтриване на данни — стоката се деактивира.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const s = await requireRole("MANAGER");
    const { id } = await ctx.params;
    const product = await prisma.product.update({
      where: { id },
      data: { active: false },
    });
    await audit(s.userId, "PRODUCT_DEACTIVATE", "Product", id, { name: product.name });
    return Response.json({ ok: true });
  });
}
