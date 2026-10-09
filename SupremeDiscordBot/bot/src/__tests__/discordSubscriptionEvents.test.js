// bot/src/__tests__/discordSubscriptionEvents.test.js
// v3.3 — Discord-only плащания в бота:
//   • SUBSCRIPTION_CREATE/UPDATE/DELETE се препращат към backend-а със СУРОВ
//     статус (числото от жицата; преводът е на едно място в backend-а);
//   • entitlement събитията носят type/deleted (refund = deleted:true);
//   • резервният път при липсващ SKU/white-label клиент е Discord МАГАЗИНЪТ,
//     не таблото.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Events } from "discord.js";

const apiPost = vi.fn();
vi.mock("axios", () => ({
  default: { create: () => ({ post: (...a) => apiPost(...a), get: vi.fn(), patch: vi.fn(), delete: vi.fn(), interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } }) },
}));

const api = await import("../utils/api.js");
const { skuUrl, storeUrl, upgradeUrl } = await import("../utils/discordStore.js");
const { sendPremiumRequired } = await import("../utils/premiumRequired.js");

const EVENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "events");

beforeEach(() => {
  vi.clearAllMocks();
  apiPost.mockResolvedValue({ data: { ok: true } });
  process.env.DISCORD_CLIENT_ID = "app123";
});

describe("събитията са закачени", () => {
  it("има по един handler за SubscriptionCreate/Update/Delete с правилното име", async () => {
    const files = readdirSync(EVENTS_DIR);
    for (const [file, name] of [
      ["subscriptionCreate.js", Events.SubscriptionCreate],
      ["subscriptionUpdate.js", Events.SubscriptionUpdate],
      ["subscriptionDelete.js", Events.SubscriptionDelete],
    ]) {
      expect(files, `липсва ${file}`).toContain(file);
      const ev = (await import(join(EVENTS_DIR, file))).default;
      expect(ev.name).toBe(name);
      expect(typeof ev.execute).toBe("function");
    }
  });

  it("update handler-ът действа по НОВИЯ обект (discord.js подава old, new)", async () => {
    const ev = (await import(join(EVENTS_DIR, "subscriptionUpdate.js"))).default;
    await ev.execute({ id: "old" }, { id: "subs1", status: 2, entitlementIds: ["e1"], skuIds: ["s1"] });
    expect(apiPost).toHaveBeenCalledWith("/discord/subscription", expect.objectContaining({
      type: "update", subscription: expect.objectContaining({ id: "subs1" }),
    }));
  });
});

describe("sendSubscription — суров статус, всички полета", () => {
  it("праща числото от жицата и timestamp-ите като ms", async () => {
    await api.sendSubscription("create", {
      id: "subs1", userId: "u1", skuIds: ["s1"], entitlementIds: ["e1"], renewalSkuIds: ["s1"],
      status: 0, currentPeriodStartTimestamp: 1000, currentPeriodEndTimestamp: 2000, canceledTimestamp: null,
    });
    expect(apiPost).toHaveBeenCalledWith("/discord/subscription", {
      type: "create",
      subscription: {
        id: "subs1", userId: "u1", skuIds: ["s1"], entitlementIds: ["e1"], renewalSkuIds: ["s1"],
        status: 0, currentPeriodStart: 1000, currentPeriodEnd: 2000, canceledAt: null,
      },
    });
  });

  it("нечислов статус → null (никога не гадаем)", async () => {
    await api.sendSubscription("update", { id: "x", status: "Active" });
    expect(apiPost.mock.calls[0][1].subscription.status).toBeNull();
  });
});

describe("sendEntitlement / reconcile — type и deleted стигат до backend-а", () => {
  it("entitlement носи type/deleted", async () => {
    await api.sendEntitlement("update", { id: "e1", skuId: "s1", guildId: "g1", userId: "u1", endsTimestamp: null, type: 8, deleted: true });
    expect(apiPost.mock.calls[0][1].entitlement).toMatchObject({ type: 8, deleted: true });
  });
  it("reconcile списъкът също", async () => {
    await api.reconcileEntitlements([{ id: "e1", skuId: "s1", guildId: "g1", type: 8, deleted: false }]);
    expect(apiPost.mock.calls[0][1].entitlements[0]).toMatchObject({ type: 8, deleted: false });
  });
});

describe("discordStore — адресите на магазина", () => {
  it("главният клиент ползва своето application id", () => {
    const client = { isWhiteLabel: false, application: { id: "main1" } };
    expect(storeUrl(client)).toBe("https://discord.com/application-directory/main1/store");
    expect(skuUrl(client, "sku1")).toBe("https://discord.com/application-directory/main1/store/sku1");
  });
  it("white-label клиентът ползва id-то на ГЛАВНИЯ бот (env), не своето", () => {
    const client = { isWhiteLabel: true, application: { id: "wl1" } };
    expect(storeUrl(client)).toBe("https://discord.com/application-directory/app123/store");
  });
  it("без никаква конфигурация пада на таблото, никога празен низ", () => {
    delete process.env.DISCORD_CLIENT_ID;
    process.env.FRONTEND_URL = "https://dash.example";
    expect(upgradeUrl({ isWhiteLabel: true })).toBe("https://dash.example");
  });
});

describe("sendPremiumRequired — резервният път е магазинът", () => {
  function fakeInteraction(client) {
    return { client, replied: false, deferred: true, editReply: vi.fn(async (b) => b), reply: vi.fn(), followUp: vi.fn() };
  }
  it("white-label клиент → текст със SKU линк в магазина на главния бот", async () => {
    const i = fakeInteraction({ isWhiteLabel: true });
    await sendPremiumRequired(i, "sku_prem", "Need Premium:");
    const body = i.editReply.mock.calls[0][0];
    expect(body.components).toBeUndefined();
    expect(body.content).toContain("https://discord.com/application-directory/app123/store/sku_prem");
  });
  it("главен клиент със SKU → native Premium бутон", async () => {
    const i = fakeInteraction({ isWhiteLabel: false, application: { id: "app123" } });
    await sendPremiumRequired(i, "sku_prem");
    const body = i.editReply.mock.calls[0][0];
    expect(body.components).toHaveLength(1);
  });
});
