import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Receipt validation (GDD §11.3): "отключване само след верифициран receipt;
 * idempotent grant по transactionId". The platform-specific calls (Apple
 * StoreKit verifyReceipt / App Store Server API, Google Play Developer API) are
 * abstracted behind this interface so the IAP service stays platform-agnostic;
 * RevenueCat is the recommended aggregator (§8.1) and would implement this by
 * calling its REST API.
 */

export type Platform = "ios" | "android" | "stripe";

export interface ValidatedReceipt {
  valid: boolean;
  /** Stable, unique transaction id used as the idempotency key. */
  transactionId: string;
  productId: string;
  reason?: string;
}

export interface ReceiptValidator {
  /**
   * Verify a store receipt server-side. `appUserId` (the player id) is the
   * RevenueCat/store app-user identifier; the stub ignores it.
   */
  validate(platform: Platform, productId: string, receipt: string, appUserId?: string): Promise<ValidatedReceipt>;
}

/**
 * Sandbox validator for development and tests. A "receipt" is an HMAC-signed
 * token of the form `<transactionId>.<productId>.<sig>` where sig =
 * HMAC-SHA256(secret, "<transactionId>.<productId>"). This mirrors the shape of
 * a real validation (a signature the client cannot forge) without calling out
 * to the stores. Production swaps in the StoreKit/Play/RevenueCat validator.
 */
export class StubReceiptValidator implements ReceiptValidator {
  constructor(private readonly secret: string) {}

  /** Helper to mint a valid sandbox receipt (used by clients in dev / by tests). */
  sign(transactionId: string, productId: string): string {
    const body = `${transactionId}.${productId}`;
    const sig = createHmac("sha256", this.secret).update(body).digest("hex");
    return `${body}.${sig}`;
  }

  async validate(_platform: Platform, productId: string, receipt: string, _appUserId?: string): Promise<ValidatedReceipt> {
    const parts = receipt.split(".");
    if (parts.length !== 3) {
      return { valid: false, transactionId: "", productId, reason: "malformed receipt" };
    }
    const [transactionId, signedProduct, sig] = parts;
    const expected = createHmac("sha256", this.secret).update(`${transactionId}.${signedProduct}`).digest("hex");
    const sigOk = sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!sigOk) return { valid: false, transactionId, productId, reason: "bad signature" };
    if (signedProduct !== productId) {
      return { valid: false, transactionId, productId, reason: "product mismatch" };
    }
    return { valid: true, transactionId, productId };
  }
}

interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body: string;
}
interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponse>;

/** RevenueCat REST API shapes we read (subset). */
interface RcTransaction {
  id?: string;
  store_transaction_id?: string;
  purchase_date?: string;
}
interface RcSubscriber {
  subscriptions?: Record<string, RcTransaction>;
  non_subscriptions?: Record<string, RcTransaction[]>;
}
interface RcResponse {
  subscriber?: RcSubscriber;
}

/**
 * Real server-side validation via RevenueCat (§8.1) — the recommended aggregator
 * that fronts Apple StoreKit and Google Play. The client's store purchase token
 * is submitted to RevenueCat's `/receipts` endpoint, which verifies it with the
 * store and returns the subscriber's transactions; we extract the store
 * transaction id for the requested product as the idempotency key.
 *
 * `fetch` is injectable for testing. Network/HTTP errors fail closed (valid:false)
 * so a transient RevenueCat outage never grants on an unverified receipt.
 */
export class RevenueCatReceiptValidator implements ReceiptValidator {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetch: FetchLike;

  constructor(apiKey: string, opts: { baseUrl?: string; fetch?: FetchLike } = {}) {
    if (!apiKey) throw new Error("RevenueCatReceiptValidator requires an API key");
    this.apiKey = apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.revenuecat.com/v1").replace(/\/$/, "");
    this.fetch = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
  }

  async validate(platform: Platform, productId: string, receipt: string, appUserId?: string): Promise<ValidatedReceipt> {
    if (!appUserId) return { valid: false, transactionId: "", productId, reason: "missing app user id" };
    let body: RcResponse;
    try {
      const res = await this.fetch(`${this.baseUrl}/receipts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "X-Platform": platform === "android" ? "android" : platform === "stripe" ? "stripe" : "ios",
        },
        body: JSON.stringify({ app_user_id: appUserId, fetch_token: receipt }),
      });
      if (!res.ok) {
        return { valid: false, transactionId: "", productId, reason: `revenuecat http ${res.status}` };
      }
      body = (await res.json()) as RcResponse;
    } catch (err) {
      return { valid: false, transactionId: "", productId, reason: `revenuecat error: ${err instanceof Error ? err.message : "unknown"}` };
    }

    const sub = body.subscriber;
    const txId =
      sub?.non_subscriptions?.[productId]?.at(-1)?.store_transaction_id ??
      sub?.non_subscriptions?.[productId]?.at(-1)?.id ??
      sub?.subscriptions?.[productId]?.store_transaction_id ??
      sub?.subscriptions?.[productId]?.id;
    if (!txId) {
      return { valid: false, transactionId: "", productId, reason: "no verified transaction for product" };
    }
    return { valid: true, transactionId: txId, productId };
  }
}

export type IapProvider = "stub" | "revenuecat";

export interface ReceiptValidatorConfig {
  provider: IapProvider;
  /** HMAC secret for the sandbox stub. */
  stubSecret?: string;
  /** RevenueCat REST API key (server-side). */
  revenueCatApiKey?: string;
}

/** Select the configured receipt validator. Defaults to the sandbox stub. */
export function createReceiptValidator(cfg: ReceiptValidatorConfig): ReceiptValidator {
  switch (cfg.provider) {
    case "revenuecat":
      return new RevenueCatReceiptValidator(cfg.revenueCatApiKey ?? "");
    case "stub":
    default:
      return new StubReceiptValidator(cfg.stubSecret ?? "");
  }
}

/** Constant-time HMAC check for webhook payloads (RevenueCat-style, §8.1). */
export function verifyWebhookSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
