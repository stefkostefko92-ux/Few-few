import { prisma, type ProductKind } from "@aso/db";
import { CATALOG } from "./catalog.js";
import { logger } from "../logger.js";

/**
 * Създава липсващите продукти от началния каталог (§11). САМО `create`:
 * съществуващ ред никога не се пипа — цена, награда и `active` принадлежат на
 * админ редактора. (Преди всяко стартиране връщаше цената и `active: true` и
 * обезсмисляше редакциите.) Безопасно при всяко стартиране.
 */
export async function seedProducts(): Promise<void> {
  let created = 0;
  for (const p of CATALOG) {
    const exists = await prisma.product.findUnique({ where: { sku: p.sku }, select: { id: true } });
    if (exists) continue;
    // upsert с празен update: при надпревара между два старта не гърми по unique(sku).
    await prisma.product.upsert({
      where: { sku: p.sku },
      create: {
        sku: p.sku,
        kind: p.kind as ProductKind,
        priceCents: p.priceCents,
        gems: p.grantGems ?? null,
        chips: p.grantChips ?? null,
        cosmeticId: p.cosmeticId ?? null,
        active: true,
      },
      update: {},
    });
    created++;
  }
  logger.info({ created, seedSize: CATALOG.length }, "products seeded (create-only)");
}

/** DB id на продукт по SKU (за FK на Purchase) — независимо от `active`. */
export async function productIdBySku(sku: string): Promise<string | null> {
  const row = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
  return row?.id ?? null;
}
