import type { PurchaseRepository } from "../data/purchaseRepository.js";
import { GameError } from "../errors.js";
import type { Catalog, Grant } from "../monetization/catalog.js";
import type { Platform, ReceiptValidator } from "../monetization/receipts.js";
import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import type { GameService } from "./gameService.js";

export interface RedeemResult {
  transactionId: string;
  productId: string;
  grants: Grant;
  /** True if this call performed the grant; false if it was already processed. */
  granted: boolean;
}

export interface IapServiceDeps {
  catalog: Catalog;
  validator: ReceiptValidator;
  purchases: PurchaseRepository;
  game: GameService;
  clock?: Clock;
}

/**
 * In-app purchase fulfilment (GDD §8, §11.3). Flow: validate the receipt
 * server-side → resolve the product's grant from the catalog → grant currencies
 * through the ledger exactly once, keyed by the store transaction id. Repeated
 * deliveries (client retry or webhook re-send) are no-ops returning the prior
 * result. The client callback is never trusted to unlock content on its own.
 */
export class IapService {
  private readonly catalog: Catalog;
  private readonly validator: ReceiptValidator;
  private readonly purchases: PurchaseRepository;
  private readonly game: GameService;
  private readonly clock: Clock;

  constructor(deps: IapServiceDeps) {
    this.catalog = deps.catalog;
    this.validator = deps.validator;
    this.purchases = deps.purchases;
    this.game = deps.game;
    this.clock = deps.clock ?? systemClock;
  }

  /** Validate a client-supplied receipt and fulfil it for the player. */
  async redeem(playerId: string, platform: Platform, productId: string, receipt: string): Promise<RedeemResult> {
    const product = this.catalog.get(productId);
    if (!product) throw new GameError("UNKNOWN_PRODUCT", `no such product: ${productId}`, 404);

    const result = await this.validator.validate(platform, productId, receipt);
    if (!result.valid) {
      throw new GameError("INVALID_RECEIPT", result.reason ?? "receipt validation failed", 402);
    }
    return this.fulfil(playerId, platform, productId, result.transactionId);
  }

  /**
   * Fulfil an already-validated purchase (used by the webhook path, where the
   * aggregator/store has already validated the transaction).
   */
  async fulfil(playerId: string, platform: Platform, productId: string, transactionId: string): Promise<RedeemResult> {
    const product = this.catalog.get(productId);
    if (!product) throw new GameError("UNKNOWN_PRODUCT", `no such product: ${productId}`, 404);

    const existing = await this.purchases.get(transactionId);
    if (existing) {
      return { transactionId, productId, grants: existing.grants, granted: false };
    }
    if (product.oneTime && (await this.purchases.ownsProduct(playerId, productId))) {
      throw new GameError("ALREADY_OWNED", `one-time product already owned: ${productId}`, 409);
    }

    // Claim the transaction id first; if a concurrent delivery won the race the
    // unique constraint makes record() return false and we skip the grant.
    const claimed = await this.purchases.record({
      transactionId,
      playerId,
      productId,
      platform,
      grants: product.grants,
      grantedAt: this.clock.now(),
    });
    if (!claimed) {
      const prior = await this.purchases.get(transactionId);
      return { transactionId, productId, grants: prior?.grants ?? product.grants, granted: false };
    }

    await this.game.grant(playerId, product.grants, `IAP:${productId}`);
    return { transactionId, productId, grants: product.grants, granted: true };
  }
}
