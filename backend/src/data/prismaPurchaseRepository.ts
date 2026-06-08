import type { Grant } from "../monetization/catalog.js";
import type { Platform } from "../monetization/receipts.js";
import type { PrismaClient } from "./prismaClient.js";
import type { Purchase, PurchaseRepository } from "./purchaseRepository.js";

/**
 * Postgres-backed idempotency store. The transactionId primary key is the real
 * guard against double-granting: a concurrent duplicate insert hits the unique
 * constraint and is treated as already-processed.
 */
export class PrismaPurchaseRepository implements PurchaseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(transactionId: string): Promise<Purchase | undefined> {
    const row = await this.prisma.purchase.findUnique({ where: { transactionId } });
    if (!row) return undefined;
    return {
      transactionId: row.transactionId,
      playerId: row.playerId,
      productId: row.productId,
      platform: row.platform as Platform,
      grants: row.grants as Grant,
      grantedAt: row.grantedAt.getTime(),
    };
  }

  async record(purchase: Purchase): Promise<boolean> {
    try {
      await this.prisma.purchase.create({
        data: {
          transactionId: purchase.transactionId,
          playerId: purchase.playerId,
          productId: purchase.productId,
          platform: purchase.platform,
          grants: purchase.grants as object,
          grantedAt: new Date(purchase.grantedAt),
        },
      });
      return true;
    } catch (err) {
      // Unique violation on transactionId → already processed.
      if (isUniqueViolation(err)) return false;
      throw err;
    }
  }

  async ownsProduct(playerId: string, productId: string): Promise<boolean> {
    const count = await this.prisma.purchase.count({ where: { playerId, productId } });
    return count > 0;
  }

  async listByPlayer(playerId: string): Promise<Purchase[]> {
    const rows = await this.prisma.purchase.findMany({ where: { playerId }, orderBy: { grantedAt: "asc" } });
    return rows.map((row) => ({
      transactionId: row.transactionId,
      playerId: row.playerId,
      productId: row.productId,
      platform: row.platform as Platform,
      grants: row.grants as Grant,
      grantedAt: row.grantedAt.getTime(),
    }));
  }

  async deleteByPlayer(playerId: string): Promise<void> {
    await this.prisma.purchase.deleteMany({ where: { playerId } });
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
