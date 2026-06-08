import { describe, expect, it } from "vitest";
import {
  createReceiptValidator,
  RevenueCatReceiptValidator,
  StubReceiptValidator,
} from "../src/monetization/receipts.js";

/** A fake fetch returning a canned RevenueCat response. */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: { headers?: Record<string, string>; body?: string } }[] = [];
  const fn = async (url: string, init: { headers?: Record<string, string>; body?: string }) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fn, calls };
}

describe("createReceiptValidator", () => {
  it("returns the stub by default", () => {
    expect(createReceiptValidator({ provider: "stub", stubSecret: "s" })).toBeInstanceOf(StubReceiptValidator);
  });
  it("returns the RevenueCat validator when selected", () => {
    expect(createReceiptValidator({ provider: "revenuecat", revenueCatApiKey: "k" })).toBeInstanceOf(RevenueCatReceiptValidator);
  });
  it("throws if RevenueCat is selected without an API key", () => {
    expect(() => createReceiptValidator({ provider: "revenuecat" })).toThrow(/API key/i);
  });
});

describe("RevenueCatReceiptValidator", () => {
  const subscriber = {
    subscriber: { non_subscriptions: { spin_m: [{ store_transaction_id: "txn-apple-123" }] } },
  };

  it("validates a verified purchase and returns the store transaction id", async () => {
    const { fn, calls } = fakeFetch(200, subscriber);
    const v = new RevenueCatReceiptValidator("rc-key", { fetch: fn });
    const r = await v.validate("ios", "spin_m", "fetch-token-xyz", "player-1");
    expect(r).toEqual({ valid: true, transactionId: "txn-apple-123", productId: "spin_m" });
    // Sends the player as app_user_id, the token as fetch_token, and authorizes.
    expect(calls[0].init.headers?.Authorization).toBe("Bearer rc-key");
    expect(JSON.parse(calls[0].init.body!)).toMatchObject({ app_user_id: "player-1", fetch_token: "fetch-token-xyz" });
  });

  it("fails closed on a non-2xx response", async () => {
    const { fn } = fakeFetch(404, {});
    const v = new RevenueCatReceiptValidator("rc-key", { fetch: fn });
    const r = await v.validate("ios", "spin_m", "tok", "player-1");
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/http 404/);
  });

  it("fails when the product has no verified transaction", async () => {
    const { fn } = fakeFetch(200, { subscriber: { non_subscriptions: {} } });
    const v = new RevenueCatReceiptValidator("rc-key", { fetch: fn });
    const r = await v.validate("android", "spin_m", "tok", "player-1");
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/no verified transaction/);
  });

  it("fails closed when the network throws (never grants on an outage)", async () => {
    const v = new RevenueCatReceiptValidator("rc-key", {
      fetch: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const r = await v.validate("ios", "spin_m", "tok", "player-1");
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/revenuecat error/);
  });

  it("rejects when no app user id is supplied", async () => {
    const { fn } = fakeFetch(200, subscriber);
    const v = new RevenueCatReceiptValidator("rc-key", { fetch: fn });
    const r = await v.validate("ios", "spin_m", "tok");
    expect(r.valid).toBe(false);
  });
});
