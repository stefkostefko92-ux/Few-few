// backend/src/__tests__/discordSubscription.test.js
// v3.3 — SUBSCRIPTION_* събития + `deleted` флаг на entitlement.
//
// Две правила, гейтвани поотделно:
//   1. Абонаментът НИКОГА не дава/отнема права — само състояние + одит.
//      (Discord: entitlement-ът е източникът на истината.)
//   2. Статусите се превеждат по ДОКУМЕНТАЦИЯТА (0 active · 1 inactive ·
//      2 ending), не по discord-api-types (който ги обявява разменени).
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.API_SECRET = "bot-secret-test";
process.env.DISCORD_SKU_PREMIUM = "sku_prem";
process.env.DISCORD_SKU_WHITELABEL = "sku_wl";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../services/botNotifier.js", () => ({ reconcileWhitelabel: vi.fn(), notifyBot: vi.fn(), dmUser: vi.fn() }));

const { discordSubscriptionLabel, isEndingSubscription, DISCORD_SUBSCRIPTION_STATUS } =
  await import("../lib/discordSubscription.js");
const router = (await import("../routes/discordEntitlements.js")).default;

const app = express();
app.use(express.json());
app.use("/api/discord", router);
const post = (path) => request(app).post(path).set("x-bot-secret", "bot-secret-test");

beforeEach(() => vi.resetAllMocks());

describe("lib/discordSubscription — статусите по документацията", () => {
  it("0 active · 1 inactive · 2 ending", () => {
    expect(DISCORD_SUBSCRIPTION_STATUS).toEqual({ ACTIVE: 0, INACTIVE: 1, ENDING: 2 });
    expect(discordSubscriptionLabel(0)).toBe("active");
    expect(discordSubscriptionLabel(1)).toBe("inactive");
    expect(discordSubscriptionLabel(2)).toBe("ending");
    expect(discordSubscriptionLabel(null)).toBeNull();
    expect(discordSubscriptionLabel(9)).toBe("unknown");
  });

  it("isEndingSubscription: ENDING ИЛИ canceled_at в текущ период", () => {
    const future = new Date(Date.now() + 86400000);
    const past = new Date(Date.now() - 86400000);
    expect(isEndingSubscription({ status: 2, canceledAt: null, currentPeriodEnd: future })).toBe(true);
    expect(isEndingSubscription({ status: 0, canceledAt: past, currentPeriodEnd: future })).toBe(true);
    expect(isEndingSubscription({ status: 0, canceledAt: null, currentPeriodEnd: future })).toBe(false);
    // Отменен и периодът е минал → вече не „свършва“, а е свършил.
    expect(isEndingSubscription({ status: 1, canceledAt: past, currentPeriodEnd: past })).toBe(false);
  });
});

describe("POST /api/discord/subscription", () => {
  const sub = {
    id: "subs1", userId: "u1", skuIds: ["sku_prem"], entitlementIds: ["ent1"],
    status: 2, currentPeriodStart: "2026-09-01T00:00:00.000Z",
    currentPeriodEnd: "2026-10-01T00:00:00.000Z", canceledAt: "2026-09-10T00:00:00.000Z",
  };

  it("записва състоянието при сървъра с този entitlement и одитира — БЕЗ да пипа plan/isPremium", async () => {
    prismaMock.server.findMany.mockResolvedValue([{ id: "g1", discordEntitlementId: "ent1" }]);
    prismaMock.server.update.mockResolvedValue({});
    prismaMock.auditLog.create.mockResolvedValue({});

    const res = await post("/api/discord/subscription").send({ type: "update", subscription: sub });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, updated: 1 });

    expect(prismaMock.server.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { discordEntitlementId: { in: ["ent1"] } },
    }));
    const call = prismaMock.server.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "g1" });
    expect(call.data).toEqual({
      discordSubscriptionId: "subs1",
      discordSubscriptionStatus: 2,
      discordCurrentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
    });
    for (const k of ["plan", "isPremium", "planSource", "discordEntitlementId"]) {
      expect(call.data).not.toHaveProperty(k);
    }
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "DISCORD_SUBSCRIPTION_UPDATE", serverId: "g1" }),
    }));
  });

  it("без съответстващ сървър → ignored, нищо не се пише", async () => {
    prismaMock.server.findMany.mockResolvedValue([]);
    const res = await post("/api/discord/subscription").send({ type: "create", subscription: sub });
    expect(res.body).toMatchObject({ ok: true, ignored: expect.any(String) });
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });

  it("delete събитие също НЕ отнема права (това е работа на ENTITLEMENT_DELETE)", async () => {
    prismaMock.server.findMany.mockResolvedValue([{ id: "g1", discordEntitlementId: "ent1" }]);
    prismaMock.server.update.mockResolvedValue({});
    const res = await post("/api/discord/subscription").send({ type: "delete", subscription: { ...sub, status: 1 } });
    expect(res.status).toBe(200);
    const call = prismaMock.server.update.mock.calls[0][0];
    expect(call.data.discordSubscriptionStatus).toBe(1);
    expect(call.data).not.toHaveProperty("plan");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("невалиден статус/тяло → 400", async () => {
    const res = await post("/api/discord/subscription").send({ type: "update", subscription: { ...sub, status: -1 } });
    expect(res.status).toBe(400);
    expect(prismaMock.server.findMany).not.toHaveBeenCalled();
  });

  it("изисква бот тайната", async () => {
    const res = await request(app).post("/api/discord/subscription").send({ type: "update", subscription: sub });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/discord/entitlement — `deleted` флаг", () => {
  it("update с deleted=true отнема достъпа (refund идва и така, не само като DELETE)", async () => {
    prismaMock.server.findUnique.mockResolvedValue({ id: "g1", planSource: "discord", discordEntitlementId: "ent1", discordSkuId: "sku_prem" });
    prismaMock.server.update.mockResolvedValue({});
    prismaMock.auditLog.create.mockResolvedValue({});
    const res = await post("/api/discord/entitlement").send({
      type: "update",
      entitlement: { id: "ent1", skuId: "sku_prem", guildId: "g1", userId: "u1", endsAt: null, type: 8, deleted: true },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, revoked: true });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "PREMIUM_REVOKED_DISCORD", metadata: { entitlementId: "ent1", reason: "deleted-flag" } }),
    }));
  });

  it("reconcile: изтрит entitlement в списъка НЕ се брои за активен", async () => {
    prismaMock.server.findUnique.mockResolvedValue({ id: "g1", planSource: "discord", discordEntitlementId: "ent1", discordSkuId: "sku_prem" });
    prismaMock.server.findMany.mockResolvedValue([{ id: "g1", discordEntitlementId: "ent1" }]);
    prismaMock.server.update.mockResolvedValue({});
    prismaMock.auditLog.create.mockResolvedValue({});
    const res = await post("/api/discord/entitlements/reconcile").send({
      entitlements: [
        { id: "ent1", skuId: "sku_prem", guildId: "g1", deleted: true },
        { id: "ent2", skuId: "sku_prem", guildId: "g2", deleted: false },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(1);
    expect(res.body.revoked).toBe(1);
  });
});
