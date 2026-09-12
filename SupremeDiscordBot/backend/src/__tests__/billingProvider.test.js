// backend/src/__tests__/billingProvider.test.js
// v3.3 — плащанията са САМО през Discord (решение на собственика, 12.09.2026).
//
// Гейтва: (1) lib/billing.js — провайдър по подразбиране discord, Stripe продажба
// само при stripe/both; (2) Stripe checkout (per-server + agency) → 410 при
// Discord-only, позволен при stripe; (3) GET /api/billing/config без тайни;
// (4) GET /api/billing/:serverId — един източник на правата („source“).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fake";
process.env.FRONTEND_URL = "https://supreme.example.com";
process.env.STRIPE_PRICE_PREMIUM_MONTH = "price_pm";
process.env.STRIPE_PRICE_AGENCY5_MONTH = "price_a5";
process.env.DISCORD_CLIENT_ID = "app123";
process.env.DISCORD_SKU_PREMIUM = "sku_prem";
process.env.DISCORD_SKU_WHITELABEL = "sku_wl";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const stripeInstance = {
  webhooks: { constructEvent: vi.fn() },
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
  subscriptions: { retrieve: vi.fn(), cancel: vi.fn() },
};
vi.mock("stripe", () => ({ default: vi.fn(() => stripeInstance) }));
vi.mock("../services/botNotifier.js", () => ({
  notifyBot: vi.fn(), dmUser: vi.fn(), reconcileWhitelabel: vi.fn(),
}));
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, _res, next) => { req.session = { userId: "u1" }; next(); },
  loadUser: (req, _res, next) => { req.user = { id: "u1", globalRole: "USER" }; next(); },
  requireServerAdmin: (_req, _res, next) => next(),
  requireBotSecret: (_req, _res, next) => next(),
}));

const billing = await import("../lib/billing.js");
const stripeRouter = (await import("../routes/stripe.js")).default;
const agencyRouter = (await import("../routes/agency.js")).default;
const billingRouter = (await import("../routes/billing.js")).default;

const app = express();
app.use(express.json());
app.use("/api/stripe", stripeRouter);
app.use("/api/agency", agencyRouter);
app.use("/api/billing", billingRouter);

beforeEach(() => { vi.resetAllMocks(); delete process.env.BILLING_PROVIDER; });
afterEach(() => { delete process.env.BILLING_PROVIDER; });

describe("lib/billing — провайдърът", () => {
  it("по подразбиране е discord; Stripe НЕ продава", () => {
    expect(billing.billingProvider()).toBe("discord");
    expect(billing.stripePurchasesEnabled()).toBe(false);
    expect(billing.discordPurchasesEnabled()).toBe(true);
  });

  it("непозната стойност пада на discord (fail-closed към единствения позволен път)", () => {
    process.env.BILLING_PROVIDER = "paypal";
    expect(billing.billingProvider()).toBe("discord");
    expect(billing.stripePurchasesEnabled()).toBe(false);
  });

  it("stripe/both включват Stripe продажбата; both пази и Discord", () => {
    process.env.BILLING_PROVIDER = "stripe";
    expect(billing.stripePurchasesEnabled()).toBe(true);
    expect(billing.discordPurchasesEnabled()).toBe(false);
    process.env.BILLING_PROVIDER = "BOTH";
    expect(billing.stripePurchasesEnabled()).toBe(true);
    expect(billing.discordPurchasesEnabled()).toBe(true);
  });

  it("каталогът е САМО месечен и само Premium/White-label (Discord няма годишни, Agency не се мапва)", () => {
    expect(Object.keys(billing.DISCORD_PLANS)).toEqual(["premium", "whitelabel"]);
    for (const p of Object.values(billing.DISCORD_PLANS)) {
      expect(Object.keys(p)).toEqual(["label", "monthlyEur"]);
    }
    expect(billing.discordSkuFor("agency5")).toBeNull();
  });

  it("магазинът и SKU адресите са по официалния формат", () => {
    expect(billing.discordStoreUrl()).toBe("https://discord.com/application-directory/app123/store");
    expect(billing.discordSkuUrl("whitelabel")).toBe("https://discord.com/application-directory/app123/store/sku_wl");
  });

  it("missingDiscordBillingConfig изброява точно липсващото", () => {
    const saved = process.env.DISCORD_SKU_WHITELABEL;
    delete process.env.DISCORD_SKU_WHITELABEL;
    expect(billing.missingDiscordBillingConfig()).toEqual(["DISCORD_SKU_WHITELABEL"]);
    process.env.DISCORD_SKU_WHITELABEL = saved;
    expect(billing.missingDiscordBillingConfig()).toEqual([]);
  });
});

describe("Stripe checkout при Discord-only", () => {
  it("per-server create-checkout → 410 + адрес на магазина, без Stripe повикване", async () => {
    const res = await request(app)
      .post("/api/stripe/create-checkout/s1")
      .send({ plan: "premium", interval: "month", withdrawalConsent: true });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("STRIPE_PURCHASES_DISABLED");
    expect(res.body.store).toBe("https://discord.com/application-directory/app123/store");
    expect(stripeInstance.checkout.sessions.create).not.toHaveBeenCalled();
    expect(prismaMock.server.findUnique).not.toHaveBeenCalled();
  });

  it("agency checkout → 410, без Stripe повикване", async () => {
    const res = await request(app)
      .post("/api/agency/checkout")
      .send({ plan: "agency5", interval: "month", withdrawalConsent: true });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("STRIPE_PURCHASES_DISABLED");
    expect(stripeInstance.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("при BILLING_PROVIDER=stripe гардът пропуска (стига до валидацията на тялото)", async () => {
    process.env.BILLING_PROVIDER = "stripe";
    const res = await request(app)
      .post("/api/stripe/create-checkout/s1")
      .send({ plan: "premium", interval: "month" }); // без съгласие → 400 от следващия гард
    expect(res.status).toBe(400);
    expect(res.body.code).toBeUndefined();
  });

  it("порталът за заварени абонати НЕ се гейтва от провайдъра (клиентът трябва да може да отмени)", async () => {
    prismaMock.server.findUnique.mockResolvedValue({ id: "s1", stripeCustomerId: "cus_1" });
    stripeInstance.billingPortal.sessions.create.mockResolvedValue({ url: "https://billing.stripe.com/x" });
    const res = await request(app).post("/api/stripe/portal/s1").send({});
    expect(res.status).not.toBe(410);
    expect(stripeInstance.billingPortal.sessions.create).toHaveBeenCalled();
  });
});

describe("GET /api/billing/config", () => {
  it("публична конфигурация без тайни", async () => {
    const res = await request(app).get("/api/billing/config");
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe("discord");
    expect(res.body.discord.plans.premium).toEqual({
      label: "Premium", monthlyEur: "4.99", skuId: "sku_prem",
      url: "https://discord.com/application-directory/app123/store/sku_prem",
    });
    expect(res.body.stripe.purchasesEnabled).toBe(false);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("sk_test");
    expect(text).not.toContain("whsec");
  });
});

describe("GET /api/billing/:serverId — един източник на правата", () => {
  const base = {
    isPremium: false, plan: "free", planSource: null, premiumSince: null, billingInterval: null,
    discordEntitlementId: null, discordSkuId: null, discordSubscriptionId: null,
    discordSubscriptionStatus: null, discordCurrentPeriodEnd: null,
    stripeSubscriptionId: null, stripeStatus: null, stripeCustomerId: null,
    accessUntil: null, gracePlan: null, agencyId: null, agency: null,
  };

  it("discord → source=discord, статусът е етикет по документацията", async () => {
    const end = new Date(Date.now() + 10 * 86400000);
    const row = { ...base, isPremium: true, plan: "whitelabel", planSource: "discord",
      discordEntitlementId: "ent1", discordSkuId: "sku_wl", discordSubscriptionId: "subs1",
      discordSubscriptionStatus: 2, discordCurrentPeriodEnd: end };
    prismaMock.server.findUnique.mockResolvedValue(row);
    const res = await request(app).get("/api/billing/s1");
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("discord");
    expect(res.body.plan).toBe("whitelabel");
    expect(res.body.discord.statusLabel).toBe("ending");
    expect(res.body.discord.manageUrl).toBe("https://discord.com/application-directory/app123/store/sku_wl");
    expect(res.body.stripe.legacy).toBe(false);
  });

  it("заварен Stripe абонат → source=stripe, порталът е наличен", async () => {
    prismaMock.server.findUnique.mockResolvedValue({ ...base, isPremium: true, plan: "premium",
      planSource: "stripe", stripeSubscriptionId: "sub_1", stripeStatus: "active", stripeCustomerId: "cus_1" });
    const res = await request(app).get("/api/billing/s1");
    expect(res.body.source).toBe("stripe");
    expect(res.body.stripe).toMatchObject({ legacy: true, status: "active", portalAvailable: true });
  });

  it("гратис след отмяна → source=grace; агенция → source=agency", async () => {
    const future = new Date(Date.now() + 86400000);
    prismaMock.server.findUnique.mockResolvedValue({ ...base, isPremium: true, accessUntil: future, gracePlan: "premium" });
    let res = await request(app).get("/api/billing/s1");
    expect(res.body.source).toBe("grace");
    expect(res.body.graceActive).toBe(true);

    prismaMock.server.findUnique.mockResolvedValue({ ...base, agencyId: "ag1", agency: { plan: "agency5", active: true, ownerUserId: "u1" } });
    res = await request(app).get("/api/billing/s1");
    expect(res.body.source).toBe("agency");
    expect(res.body.agencyOwnedByMe).toBe(true);
  });

  it("непознат сървър → 404", async () => {
    prismaMock.server.findUnique.mockResolvedValue(null);
    const res = await request(app).get("/api/billing/nope");
    expect(res.status).toBe(404);
  });
});
