import { prisma, type VipTier } from "@aso/db";
import { productBySku } from "./catalog.js";
import { logger } from "../logger.js";

/**
 * Applies the effect of a paid product to a user. Called ONLY from the Stripe
 * webhook (§11.3) — never from a client success redirect. Idempotency is the
 * caller's responsibility (ProcessedEvent dedupe); this runs inside the same
 * transaction so credit + the processed-event marker commit atomically.
 */
export async function grantProduct(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  sku: string,
): Promise<void> {
  const product = productBySku(sku);
  if (!product) {
    logger.warn({ sku, userId }, "grantProduct: unknown sku, skipping");
    return;
  }

  if (product.grantGems) {
    await tx.user.update({ where: { id: userId }, data: { gems: { increment: product.grantGems } } });
  }
  if (product.grantChips) {
    await tx.user.update({
      where: { id: userId },
      data: { chips: { increment: BigInt(product.grantChips) } },
    });
  }
  if (product.cosmeticId) {
    await tx.inventoryItem.upsert({
      where: { userId_cosmeticId: { userId, cosmeticId: product.cosmeticId } },
      create: { userId, cosmeticId: product.cosmeticId },
      update: {},
    });
  }
  if (product.kind === "VIP_SUB" && product.vipTier) {
    await applyVip(tx, userId, product.vipTier, daysFromNow(31));
  }
}

/**
 * Credit the monthly VIP gem stipend (SILVER+). Called once per paid invoice
 * from the webhook, inside its dedup transaction, so renewals grant gems but
 * retries do not double-credit.
 */
export async function grantVipStipend(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  gems: number,
): Promise<void> {
  if (gems > 0) {
    await tx.user.update({ where: { id: userId }, data: { gems: { increment: gems } } });
  }
}

/** Set / extend a VIP subscription (from subscription webhooks). */
export async function applyVip(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  tier: VipTier,
  until: Date,
): Promise<void> {
  await tx.user.update({ where: { id: userId }, data: { vipTier: tier, vipUntil: until } });
}

/** Clear VIP (subscription cancelled/expired). */
export async function clearVip(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
): Promise<void> {
  await tx.user.update({ where: { id: userId }, data: { vipTier: "NONE", vipUntil: null } });
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
