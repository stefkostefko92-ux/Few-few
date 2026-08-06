// backend/src/__tests__/adminRevenue.test.js
// Заключва приходната аритметика на таблото (money-critical). Регресия срещу
// старото „MRR" = Σ paymentLog за календарния месец, което смесваше КАСА с
// RUN-RATE (годишна фактура €99 влизаше цяла в месеца си), нулираше се на
// 1-во число и не виждаше agency абонаментите.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, res, next) => next(),
  loadUser: (req, res, next) => { req.user = { id: "admin1", username: "admin", globalRole: "SUPER_USER" }; next(); },
  requireSuperUser: (req, res, next) => next(),
  requireMainOwner: (req, res, next) => next(),
}));

const adminModule = await import("../routes/admin.js");
const { calculateMrr, PLAN_PRICES_EUR } = adminModule;
const adminRouter = adminModule.default;

const NOW = new Date("2026-08-05T12:00:00Z");
const active = (over) => ({ stripeStatus: "active", planSource: "stripe", isPremium: true, ...over });

describe("calculateMrr — run-rate, не каса", () => {
  it("месечните влизат на пълна цена, годишните като цена/12", () => {
    const r = calculateMrr({
      now: NOW,
      servers: [
        active({ plan: "premium", billingInterval: "month" }),    // 4.99
        active({ plan: "premium", billingInterval: "year" }),     // 49/12 = 4.08(3)
        active({ plan: "whitelabel", billingInterval: "month" }), // 9.99
      ],
      agencies: [
        { plan: "agency5", billingInterval: "year", planSource: "stripe", stripeStatus: "active", active: true }, // 199/12 = 16.58(3)
      ],
    });

    expect(r.mrrGross).toBe(35.65);
    expect(r.mrrNet).toBe(29.71); // бруто/1.20 — цените са с включен ДДС
    expect(r.arrGross).toBe(427.76);
    expect(r.paidSubscriptions).toBe(4);
    expect(r.paidServers).toBe(3);
    expect(r.paidAgencies).toBe(1);
    expect(r.arpuGross).toBe(8.91);
    expect(r.interval).toMatchObject({ monthlyCount: 2, yearlyCount: 2 });

    const premium = r.byTier.find((t) => t.plan === "premium");
    expect(premium).toMatchObject({ count: 2, mrr: 9.07, monthlyCount: 1, yearlyCount: 1 });
  });

  it("годишният НЕ влиза цял (регресия срещу стария calculateMRR)", () => {
    const r = calculateMrr({
      now: NOW,
      servers: [active({ plan: "premium", billingInterval: "year" })],
    });
    expect(r.mrrGross).toBe(4.08);
    expect(r.mrrGross).not.toBe(PLAN_PRICES_EUR.premium.year);
  });
});

describe("calculateMrr — кой НЕ е приход", () => {
  it("trial, подарък, past_due и canceled стоят извън MRR, но се броят отделно", () => {
    const r = calculateMrr({
      now: NOW,
      servers: [
        active({ plan: "premium", billingInterval: "month" }),
        { plan: "premium", billingInterval: "month", planSource: "stripe", stripeStatus: "trialing", isPremium: true },
        { plan: "whitelabel", billingInterval: "month", planSource: "manual", stripeStatus: "manual", isPremium: true },
        { plan: "premium", billingInterval: "month", planSource: "stripe", stripeStatus: "past_due", isPremium: true },
        { plan: "free", billingInterval: null, planSource: null, stripeStatus: "canceled", isPremium: false, updatedAt: NOW },
        { plan: "premium", billingInterval: "month", planSource: "discord", stripeStatus: null, isPremium: true },
      ],
    });

    expect(r.mrrGross).toBe(4.99); // само активният по Stripe
    expect(r.paidSubscriptions).toBe(1);
    expect(r.excluded.trialing).toEqual({ count: 1, potentialMrr: 4.99 });
    expect(r.excluded.gifted).toEqual({ count: 1, listValue: 9.99 });
    expect(r.excluded.pastDue).toEqual({ count: 1, atRiskMrr: 4.99 });
    expect(r.excluded.discord).toEqual({ count: 1, listValue: 4.99 });
  });

  it("agency място не се брои втори път: покритият сървър стои на plan=free", () => {
    const r = calculateMrr({
      now: NOW,
      servers: [
        { plan: "free", billingInterval: null, planSource: null, stripeStatus: null, isPremium: false },
        { plan: "free", billingInterval: null, planSource: null, stripeStatus: null, isPremium: false },
      ],
      agencies: [
        { plan: "agency10", billingInterval: "month", planSource: "stripe", stripeStatus: "active", active: true },
        { plan: "agency5", billingInterval: "month", planSource: "stripe", stripeStatus: "canceled", active: false },
      ],
    });

    expect(r.mrrGross).toBe(39.99);
    expect(r.paidSubscriptions).toBe(1);
  });
});

describe("calculateMrr — churn и trial фуния", () => {
  it("churn брои отказите в прозореца, не по-старите", () => {
    const inWindow = new Date(NOW.getTime() - 5 * 24 * 3600 * 1000);
    const old = new Date(NOW.getTime() - 60 * 24 * 3600 * 1000);
    const r = calculateMrr({
      now: NOW,
      servers: [
        active({ plan: "premium", billingInterval: "month" }),
        active({ plan: "premium", billingInterval: "month" }),
        active({ plan: "premium", billingInterval: "month" }),
        { plan: "free", stripeStatus: "canceled", isPremium: false, updatedAt: inWindow },
        { plan: "free", stripeStatus: "canceled", isPremium: false, updatedAt: old },
      ],
    });

    expect(r.churn.canceled).toBe(1);
    expect(r.churn.activeNow).toBe(3);
    expect(r.churn.rate).toBe(25); // 1 / (3 + 1)
  });

  it("trial фунията брои активните trial-и и историческата конверсия", () => {
    const future = new Date(NOW.getTime() + 3 * 24 * 3600 * 1000);
    const past = new Date(NOW.getTime() - 3 * 24 * 3600 * 1000);
    const r = calculateMrr({
      now: NOW,
      servers: [
        { plan: "free", trialUsed: true, trialEndsAt: future, isPremium: false },
        { plan: "free", trialUsed: true, trialEndsAt: past, isPremium: false },
        active({ plan: "premium", billingInterval: "month", trialUsed: true, trialEndsAt: past }),
        active({ plan: "premium", billingInterval: "month", trialUsed: false }),
      ],
    });

    expect(r.trials).toEqual({ active: 1, used: 3, converted: 1, conversionRate: 33.33 });
  });
});

describe("calculateMrr — заварени/повредени редове", () => {
  it("заварен isPremium без plan се третира като white-label (както getServerTier)", () => {
    const r = calculateMrr({
      now: NOW,
      servers: [{ plan: "free", isPremium: true, billingInterval: "month", planSource: "stripe", stripeStatus: "active" }],
    });
    expect(r.mrrGross).toBe(9.99);
    expect(r.diagnostics.grandfathered).toBe(1);
  });

  it("активен абонамент без billingInterval се брои като месечен и се сигнализира", () => {
    const r = calculateMrr({
      now: NOW,
      servers: [active({ plan: "premium", billingInterval: null })],
    });
    expect(r.mrrGross).toBe(4.99);
    expect(r.diagnostics.unknownInterval).toBe(1);
  });

  it("празна база не дели на нула", () => {
    const r = calculateMrr({ now: NOW });
    expect(r).toMatchObject({ mrrGross: 0, mrrNet: 0, arpuGross: 0 });
    expect(r.churn.rate).toBe(0);
    expect(r.trials.conversionRate).toBe(0);
  });
});

describe("GET /api/admin/revenue", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("връща числата от състоянието на абонаментите + касата на месеца", async () => {
    prismaMock.server.findMany.mockResolvedValue([
      { plan: "premium", billingInterval: "year", planSource: "stripe", stripeStatus: "active", isPremium: true, trialUsed: true, trialEndsAt: null, updatedAt: new Date() },
    ]);
    prismaMock.agency.findMany.mockResolvedValue([
      { plan: "agency10", billingInterval: "month", planSource: "stripe", stripeStatus: "active", active: true, seatLimit: 10, updatedAt: new Date() },
    ]);
    prismaMock.paymentLog.aggregate.mockResolvedValue({ _sum: { amount: 12345 } });

    const app = express();
    app.use(express.json());
    app.use("/api/admin", adminRouter);

    const res = await request(app).get("/api/admin/revenue");

    expect(res.status).toBe(200);
    expect(res.body.currency).toBe("EUR");
    expect(res.body.mrrGross).toBe(44.07); // 49/12 + 39.99
    expect(res.body.paidServers).toBe(1);
    expect(res.body.paidAgencies).toBe(1);
    // Касата е отделно число и НЕ участва в MRR.
    expect(res.body.cashCollectedThisMonth).toBe(123.45);
  });
});
