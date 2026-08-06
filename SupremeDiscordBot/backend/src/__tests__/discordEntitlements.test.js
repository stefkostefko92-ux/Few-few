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
    // Стейтфул мок: реалният Prisma чете ОБНОВЕНИЯ ред вътре в транзакцията,
    // затова syncServerPaidFlag вижда planSource=null и сваля premium-а.
    // Статичен мок би върнал planSource="discord" и grandfather защитата
    // (lib/premium.js) щеше да задържи premium — фалшив провал.
    let row = { id: "g1", isPremium: true, plan: "premium", planSource: "discord",
                stripeSubscriptionId: null, discordEntitlementId: "ent1", discordSkuId: "sku_prem",
                agencyId: null, agency: null };
    prismaMock.server.findUnique.mockImplementation(async () => ({ ...row }));
    prismaMock.server.update.mockImplementation(async ({ data }) => { row = { ...row, ...data }; return row; });

    const res = await authed("post", "/api/discord/entitlement").send({
      type: "delete",
      entitlement: { id: "ent1", skuId: "sku_prem", guildId: "g1" },
    });

    expect(res.status).toBe(200);
    expect(res.body.revoked).toBe(true);
    // Revoke чисти плановите полета; isPremium се пресмята отделно през
    // syncServerPaidFlag (за да не изгаси agency-покрит сървър) → false тук.
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { plan: "free", planSource: null, discordEntitlementId: null, discordSkuId: null },
    });
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { isPremium: false },
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
    // Стейтфул (както при revoke по-горе): syncServerPaidFlag чете реда СЛЕД
    // update-а в същата транзакция, затова planSource вече е null и grandfather
    // защитата не се задейства.
    const rows = {
      g1: { id: "g1", isPremium: true, plan: "premium", planSource: "discord",
            stripeSubscriptionId: null, discordEntitlementId: "ent1", agencyId: null, agency: null },
      g2: { id: "g2", isPremium: true, plan: "premium", planSource: "discord",
            stripeSubscriptionId: null, discordEntitlementId: "ent-gone", discordSkuId: "sku_prem",
            agencyId: null, agency: null },
    };
    prismaMock.server.findUnique.mockImplementation(async ({ where }) =>
      rows[where.id] ? { ...rows[where.id] } : null);
    prismaMock.server.update.mockImplementation(async ({ where, data }) => {
      rows[where.id] = { ...rows[where.id], ...data };
      return rows[where.id];
    });
    prismaMock.server.findMany.mockResolvedValue([{ id: "g2", discordEntitlementId: "ent-gone" }]);

    const res = await authed("post", "/api/discord/entitlements/reconcile").send({
      entitlements: [{ id: "ent1", skuId: "sku_prem", guildId: "g1", endsAt: null }],
    });

    expect(res.status).toBe(200);
    expect(res.body.revoked).toBe(1);
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "g2" },
      data: expect.objectContaining({ plan: "free", planSource: null }),
    });
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "g2" },
      data: { isPremium: false },
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
