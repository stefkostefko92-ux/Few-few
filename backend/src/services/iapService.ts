import { GameError } from "../errors.js";
import type { Catalog, Grant } from "../monetization/catalog.js";
import type { Platform, ReceiptValidator } from "../monetization/receipts.js";
import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import type { GameService } from "./gameService.js";
import { noopAnalytics, type Analytics } from "../analytics/analytics.js";

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
  game: GameService;
  clock?: Clock;
  analytics?: Analytics;
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
  private readonly game: GameService;
  private readonly clock: Clock;
  private readonly analytics: Analytics;

  constructor(deps: IapServiceDeps) {
    this.catalog = deps.catalog;
    this.validator = deps.validator;
    this.game = deps.game;
    this.clock = deps.clock ?? systemClock;
    this.analytics = deps.analytics ?? noopAnalytics;
  }

  /** Validate a client-supplied receipt and fulfil it for the player. */
  async redeem(playerId: string, platform: Platform, productId: string, receipt: string): Promise<RedeemResult> {
    const product = this.catalog.get(productId);
    if (!product) throw new GameError("UNKNOWN_PRODUCT", `no such product: ${productId}`, 404);

    const result = await this.validator.validate(platform, productId, receipt, playerId);
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

    // The idempotency claim and the currency grant commit in one transaction, so
    // a crash can never record the purchase without delivering it (§11.3).
    const { granted, grants } = await this.game.grantPurchase(
      { transactionId, playerId, productId, platform, grants: product.grants, grantedAt: this.clock.now() },
      { oneTime: product.oneTime, reason: `IAP:${productId}` },
    );
    if (granted) {
      this.analytics.track({ type: "PURCHASE", playerId, at: this.clock.now(), productId, transactionId, granted: true });
    }
    return { transactionId, productId, grants, granted };
  }
}
