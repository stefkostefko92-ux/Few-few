// backend/src/__tests__/discordEntitlements.test.js
// POST /api/discord/entitlement + /entitlements/reconcile — Discord-native
// monetization grant/revoke. Money-critical mutual-exclusion rule: a Discord
// event must NEVER touch a Stripe-provisioned server, and grants/revokes must
// be idempotent (Discord redelivers gateway events).
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.API_SECRET = "bot-secret-test";
process.env.DISCORD_SKU_PREMIUM = "sku_prem";
process.env.DISCORD_SKU_WHITELABEL = "sku_wl";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const discordEntitlementsRouter = (await import("../routes/discordEntitlements.js")).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/discord", discordEntitlementsRouter);
  return app;
}

function authed(method, path) {
  return request(buildApp())[method](path).set("x-bot-secret", "bot-secret-test");
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /entitlement — grant", () => {
  it("grants premium to a new, non-Stripe server (idempotent no-op fields set)", async () => {
    prismaMock.server.findUnique.mockResolvedValue({
      id: "g1", plan: "free", planSource: null, stripeSubscriptionId: null, discordEntitlementId: null,
    });

    const res = await authed("post", "/api/discord/entitlement").send({
      type: "create",
      entitlement: { id: "ent1", skuId: "sku_prem", guildId: "g1", userId: "u1", endsAt: null },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, granted: true, plan: "premium" });
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { isPremium: true, plan: "premium", planSource: "discord", discordEntitlementId: "ent1", discordSkuId: "sku_prem" },
    });
  });

  it("ignores a Stripe-provisioned server (never overwrites a paying Stripe customer)", async () => {
    prismaMock.server.findUnique.mockResolvedValue({
      id: "g1", plan: "whitelabel", planSource: "stripe", stripeSubscriptionId: "sub_1", discordEntitlementId: null,
    });

    const res = await authed("post", "/api/discord/entitlement").send({
      type: "create",
      entitlement: { id: "ent1", skuId: "sku_prem", guildId: "g1" },
    });

    expect(res.status).toBe(200);
    expect(res.body.ignored).toMatch(/Stripe/i);
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });

  it("is idempotent — regranting the exact same entitlement+plan is a no-op", async () => {
    prismaMock.server.findUnique.mockResolvedValue({
      id: "g1", plan: "premium", planSource: "discord", stripeSubscriptionId: null, discordEntitlementId: "ent1",
    });

    const res = await authed("post", "/api/discord/entitlement").send({
      type: "update",
      entitlement: { id: "ent1", skuId: "sku_prem", guildId: "g1" },
    });

    expect(res.status).toBe(200);
    expect(res.body.alreadyGranted).toBe(true);
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });
});

describe("POST /entitlement — revoke", () => {
  it("revokes only when planSource=discord AND the entitlementId matches exactly", async () => {
    prismaMock.server.findUnique.mockResolvedValue({
      id: "g1", planSource: "discord", discordEntitlementId: "ent1", discordSkuId: "sku_prem",
    });

    const res = await authed("post", "/api/discord/entitlement").send({
      type: "delete",
      entitlement: { id: "ent1", skuId: "sku_prem", guildId: "g1" },
    });

    expect(res.status).toBe(200);
    expect(res.body.revoked).toBe(true);
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { isPremium: false, plan: "free", planSource: null, discordEntitlementId: null, discordSkuId: null },
    });
  });

  it("refuses to revoke a server owned by a DIFFERENT entitlement id", async () => {
    prismaMock.server.findUnique.mockResolvedValue({
      id: "g1", planSource: "discord", discordEntitlementId: "some-other-entitlement", discordSkuId: "sku_prem",
    });

    const res = await authed("post", "/api/discord/entitlement").send({
      type: "delete",
      entitlement: { id: "ent1", skuId: "sku_prem", guildId: "g1" },
    });

    expect(res.status).toBe(200);
    expect(res.body.ignored).toBeDefined();
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });
});

describe("POST /entitlements/reconcile", () => {
  it("grants entitlements missed while the bot was offline", async () => {
    prismaMock.server.findUnique.mockResolvedValue({
      id: "g1", plan: "free", planSource: null, stripeSubscriptionId: null, discordEntitlementId: null,
    });
    prismaMock.server.findMany.mockResolvedValue([]); // no discord-provisioned servers to consider for revoke

    const res = await authed("post", "/api/discord/entitlements/reconcile").send({
      entitlements: [{ id: "ent1", skuId: "sku_prem", guildId: "g1", endsAt: null }],
    });

    expect(res.status).toBe(200);
    expect(res.body.granted).toBe(1);
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: expect.objectContaining({ isPremium: true, plan: "premium", planSource: "discord" }),
    });
  });

  it("revokes discord-provisioned servers whose entitlement disappeared from the active set", async () => {
    // One active entitlement (g1, granted no-op) + one discord-provisioned
    // server (g2) whose entitlement is no longer active → revoked.
    prismaMock.server.findUnique.mockImplementation(({ where }) => {
      if (where.id === "g1") {
        return Promise.resolve({ id: "g1", plan: "premium", planSource: "discord", stripeSubscriptionId: null, discordEntitlementId: "ent1" });
      }
      if (where.id === "g2") {
        return Promise.resolve({ id: "g2", planSource: "discord", discordEntitlementId: "ent-gone", discordSkuId: "sku_prem" });
      }
      return Promise.resolve(null);
    });
    prismaMock.server.findMany.mockResolvedValue([{ id: "g2", discordEntitlementId: "ent-gone" }]);

    const res = await authed("post", "/api/discord/entitlements/reconcile").send({
      entitlements: [{ id: "ent1", skuId: "sku_prem", guildId: "g1", endsAt: null }],
    });

    expect(res.status).toBe(200);
    expect(res.body.revoked).toBe(1);
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "g2" },
      data: expect.objectContaining({ isPremium: false, plan: "free", planSource: null }),
    });
  });

  it("the empty-active guard skips revoke when the active list is empty but discord-provisioned servers exist", async () => {
    prismaMock.server.findMany.mockResolvedValue([{ id: "g2", discordEntitlementId: "ent-x" }]);

    const res = await authed("post", "/api/discord/entitlements/reconcile").send({ entitlements: [] });

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe("empty-active-guard");
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });
});
