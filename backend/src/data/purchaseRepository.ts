import type { Grant } from "../monetization/catalog.js";
import type { Platform } from "../monetization/receipts.js";

/** A processed purchase — the idempotency record keyed by transactionId (§11.3). */
export interface Purchase {
  transactionId: string;
  playerId: string;
  productId: string;
  platform: Platform;
  grants: Grant;
  grantedAt: number;
}

export interface PurchaseRepository {
  get(transactionId: string): Promise<Purchase | undefined>;
  /** Insert; resolves false if the transactionId was already recorded (idempotent). */
  record(purchase: Purchase): Promise<boolean>;
  /** Whether this player already owns a one-time product. */
  ownsProduct(playerId: string, productId: string): Promise<boolean>;
  /** All purchases for a player (GDPR data access). */
  listByPlayer(playerId: string): Promise<Purchase[]>;
  /** Delete a player's purchase records (GDPR erasure). Idempotent. */
  deleteByPlayer(playerId: string): Promise<void>;
}

export class MemoryPurchaseRepository implements PurchaseRepository {
  private readonly byTx = new Map<string, Purchase>();

  async get(transactionId: string): Promise<Purchase | undefined> {
    return this.byTx.get(transactionId);
  }

  async record(purchase: Purchase): Promise<boolean> {
    if (this.byTx.has(purchase.transactionId)) return false;
    this.byTx.set(purchase.transactionId, purchase);
    return true;
  }

  async ownsProduct(playerId: string, productId: string): Promise<boolean> {
    for (const p of this.byTx.values()) {
      if (p.playerId === playerId && p.productId === productId) return true;
    }
    return false;
  }

  async listByPlayer(playerId: string): Promise<Purchase[]> {
    return [...this.byTx.values()].filter((p) => p.playerId === playerId);
  }

  async deleteByPlayer(playerId: string): Promise<void> {
    for (const [txId, p] of this.byTx) {
      if (p.playerId === playerId) this.byTx.delete(txId);
    }
  }
}
