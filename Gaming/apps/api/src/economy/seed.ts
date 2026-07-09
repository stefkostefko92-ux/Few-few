import { prisma, type ProductKind } from "@aso/db";
import { CATALOG } from "./catalog.js";
import { logger } from "../logger.js";

/**
 * Mirror the static catalog into the Product table so Purchase rows can FK to a
 * real product (§11). Idempotent upsert by sku — safe to run at every boot.
 */
export async function seedProducts(): Promise<void> {
  for (const p of CATALOG) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      create: {
        sku: p.sku,
        kind: p.kind as ProductKind,
        priceCents: p.priceCents,
        gems: p.grantGems ?? null,
        cosmeticId: p.cosmeticId ?? null,
        active: true,
      },
      update: {
        kind: p.kind as ProductKind,
        priceCents: p.priceCents,
        gems: p.grantGems ?? null,
        cosmeticId: p.cosmeticId ?? null,
        active: true,
      },
    });
  }
  logger.info({ count: CATALOG.length }, "products seeded");
}

/** Resolve a product's DB id by sku (for Purchase FK). */
export async function productIdBySku(sku: string): Promise<string | null> {
  const row = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
  return row?.id ?? null;
}
