// Промяна на стока (номенклатура). Прил. № 29, т. 15: всяка промяна в номенклатурите
// влиза в дневника с „преди → след“ — включително данъчната група и баркодовете.

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

    const before = await prisma.product.findUnique({ where: { id }, include: { barcodes: true } });
    if (!before) throw jsonError(404, "Стоката не е намерена.");
    const reactivating = data.active === true && !before.active;
    const deactivating = data.active === false && before.active;

    const product = await prisma.$transaction(async (tx) => {
      if (barcodes) {
        await tx.barcode.deleteMany({ where: { productId: id } });
        await tx.barcode.createMany({
          data: barcodes.map((code) => ({ code, productId: id })),
        });
      }
      return tx.product.update({
        where: { id },
        data: {
          ...data,
          ...(deactivating && { deactivatedAt: new Date() }),
          ...(reactivating && { deactivatedAt: null }),
        },
        include: { barcodes: true, category: true },
      });
    });

    // всяко променено поле поотделно: преди → след (не if/else — едновременните промени не се губят)
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of Object.keys(data) as Array<keyof typeof data>) {
      const from = before[k as keyof typeof before];
      if (data[k] !== undefined && data[k] !== from) changes[k] = { from, to: data[k] };
    }
    if (barcodes) {
      const old = before.barcodes.map((b) => b.code).sort();
      const next = [...barcodes].sort();
      if (old.join("|") !== next.join("|")) changes.barcodes = { from: old, to: next };
    }
    if (changes.priceCents) {
      await audit(s.userId, "PRICE_CHANGE", "Product", id, { plu: before.plu, name: before.name, ...changes.priceCents });
    }
    if (Object.keys(changes).some((k) => k !== "priceCents")) {
      await audit(s.userId, "PRODUCT_UPDATE", "Product", id, { plu: before.plu, name: before.name, changes });
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
      data: { active: false, deactivatedAt: new Date() },
    });
    await audit(s.userId, "PRODUCT_DEACTIVATE", "Product", id, { plu: product.plu, name: product.name });
    return Response.json({ ok: true });
  });
}
