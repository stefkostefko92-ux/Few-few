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
  validate(platform: Platform, productId: string, receipt: string): Promise<ValidatedReceipt>;
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

  async validate(_platform: Platform, productId: string, receipt: string): Promise<ValidatedReceipt> {
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

/** Constant-time HMAC check for webhook payloads (RevenueCat-style, §8.1). */
export function verifyWebhookSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
