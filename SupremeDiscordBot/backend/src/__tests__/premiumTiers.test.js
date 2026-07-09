// backend/src/__tests__/premiumTiers.test.js
// Locks in the v3.0 tier gating: which plan unlocks which feature, and the
// Stripe-price / Discord-SKU → plan mappings (money-critical).
import { describe, it, expect, beforeEach } from "vitest";
import {
  planHasFeature, planConfig, planFromStripePrice, planFromDiscordSku, stripePriceId, PLANS,
} from "../lib/premium.js";

describe("planHasFeature (tier gating)", () => {
  it("free unlocks no premium feature", () => {
    expect(planHasFeature("free", "automation.sticky")).toBe(false);
    expect(planHasFeature("free", "integrations.aiReplies")).toBe(false);
    expect(planHasFeature("free", "integrations.whiteLabel")).toBe(false);
  });

  it("premium unlocks everything EXCEPT white-label", () => {
    expect(planHasFeature("premium", "integrations.aiReplies")).toBe(true);
    expect(planHasFeature("premium", "automation.recurring")).toBe(true);
    expect(planHasFeature("premium", "integrations.webhooks")).toBe(true);
    expect(planHasFeature("premium", "integrations.whiteLabel")).toBe(false);
  });

  it("white-label unlocks white-label plus everything premium has", () => {
    expect(planHasFeature("whitelabel", "integrations.whiteLabel")).toBe(true);
    expect(planHasFeature("whitelabel", "integrations.aiReplies")).toBe(true);
  });

  it("agency tiers unlock white-label and cover multiple servers", () => {
    expect(planHasFeature("agency5", "integrations.whiteLabel")).toBe(true);
    expect(planHasFeature("agency10", "integrations.whiteLabel")).toBe(true);
    expect(PLANS.agency5.maxServers).toBe(5);
    expect(PLANS.agency10.maxServers).toBe(10);
  });

  it("unknown plan degrades to free", () => {
    expect(planConfig("bogus").rank).toBe(PLANS.free.rank);
    expect(planHasFeature("bogus", "automation.sticky")).toBe(false);
  });
});

describe("Stripe price ↔ plan mapping", () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_PREMIUM_MONTH = "price_pm";
    process.env.STRIPE_PRICE_PREMIUM_YEAR = "price_py";
    process.env.STRIPE_PRICE_WHITELABEL_MONTH = "price_wm";
    process.env.STRIPE_PRICE_AGENCY10_YEAR = "price_a10y";
    process.env.STRIPE_PRICE_ID = "price_legacy";
  });

  it("resolves plan + interval from a price id", () => {
    expect(planFromStripePrice("price_pm")).toEqual({ plan: "premium", interval: "month" });
    expect(planFromStripePrice("price_py")).toEqual({ plan: "premium", interval: "year" });
    expect(planFromStripePrice("price_wm")).toEqual({ plan: "whitelabel", interval: "month" });
    expect(planFromStripePrice("price_a10y")).toEqual({ plan: "agency10", interval: "year" });
  });

  it("grandfathers the legacy single price into white-label", () => {
    expect(planFromStripePrice("price_legacy")).toEqual({ plan: "whitelabel", interval: "month" });
  });

  it("returns null for an unknown price", () => {
    expect(planFromStripePrice("price_unknown")).toBeNull();
    expect(planFromStripePrice(undefined)).toBeNull();
  });

  it("stripePriceId looks up the configured env id", () => {
    expect(stripePriceId("premium", "month")).toBe("price_pm");
    expect(stripePriceId("agency10", "year")).toBe("price_a10y");
  });
});

describe("Discord SKU ↔ plan mapping", () => {
  beforeEach(() => {
    process.env.DISCORD_SKU_PREMIUM = "sku_prem";
    process.env.DISCORD_SKU_WHITELABEL = "sku_wl";
  });
  it("maps SKUs to plans, unknown → null, agency never native", () => {
    expect(planFromDiscordSku("sku_prem")).toBe("premium");
    expect(planFromDiscordSku("sku_wl")).toBe("whitelabel");
    expect(planFromDiscordSku("sku_other")).toBeNull();
  });
});
