// backend/src/__tests__/stripeWebhook.test.js
// POST /api/stripe/webhook — money-critical: this is the ONLY path that may
// grant/revoke access. Signature verification is mocked out (constructEvent
// is fully stubbed) so these tests assert on the EFFECT of each event type on
// the Prisma writes, not on Stripe SDK internals.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fake";
process.env.FRONTEND_URL = "https://supreme.example.com";
process.env.STRIPE_PRICE_PREMIUM_MONTH = "price_pm";
process.env.STRIPE_PRICE_PREMIUM_YEAR = "price_py";
process.env.STRIPE_PRICE_WHITELABEL_MONTH = "price_wm";
process.env.STRIPE_PRICE_AGENCY5_MONTH = "price_a5m";
process.env.STRIPE_PRICE_AGENCY10_MONTH = "price_a10m";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const stripeInstance = {
  webhooks: { constructEvent: vi.fn() },
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
  subscriptions: { retrieve: vi.fn() },
  charges: { retrieve: vi.fn() },
};
vi.mock("stripe", () => ({ default: vi.fn(() => stripeInstance) }));

// Транзакционните DM известия са СТРАНИЧЕН ефект — мокваме канала към бота,
// за да проверим кога се вика (и че никога не поваля webhook-а).
const dmUserMock = vi.fn();
vi.mock("../services/botNotifier.js", () => ({
  notifyBot: vi.fn(),
  dmUser: (...args) => dmUserMock(...args),
}));

const stripeRouter = (await import("../routes/stripe.js")).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/stripe", stripeRouter);
  return app;
}

function post(event) {
  stripeInstance.webhooks.constructEvent.mockReturnValue(event);
  return request(buildApp())
    .post("/api/stripe/webhook")
    .set("stripe-signature", "t=1,v1=fake")
    .send({ irrelevant: "raw body is mocked away by constructEvent" });
}

beforeEach(() => {
  vi.resetAllMocks();
  stripeInstance.webhooks.constructEvent.mockImplementation((raw) => raw); // reset to identity, tests override via post()
});

describe("checkout.session.completed", () => {
  it("per-server checkout grants isPremium/plan/planSource/trialUsed", async () => {
    const event = {
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { serverId: "s1", plan: "premium", interval: "month" },
          subscription: "sub_1",
          payment_status: "paid",
          amount_total: 999,
          currency: "eur",
        },
      },
    };

    const res = await post(event);

    expect(res.status).toBe(200);
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({
        isPremium: true,
        plan: "premium",
        planSource: "stripe",
        trialUsed: true,
        billingInterval: "month",
        stripeSubscriptionId: "sub_1",
      }),
    });
    expect(prismaMock.paymentLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ serverId: "s1", status: "paid" }) })
    );
  });

  it("agency checkout activates the Agency, not a server", async () => {
    const event = {
      id: "evt_2",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { kind: "agency", agencyId: "ag1", interval: "month" },
          subscription: "sub_a1",
        },
      },
    };

    const res = await post(event);

    expect(res.status).toBe(200);
    expect(prismaMock.agency.update).toHaveBeenCalledWith({
      where: { id: "ag1" },
      data: expect.objectContaining({ active: true, stripeSubscriptionId: "sub_a1", stripeStatus: "active" }),
    });
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });

  it("does NOT activate access when payment_status is unpaid and there is no subscription", async () => {
    const event = {
      id: "evt_3",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { serverId: "s1", plan: "premium" },
          subscription: null,
          payment_status: "unpaid",
        },
      },
    };

    const res = await post(event);

    expect(res.status).toBe(200);
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });
});

describe("invoice.paid", () => {
  function invoiceEvent({ id = "evt_inv1", priceId = "price_pm", customer = "cus_1" } = {}) {
    return {
      id,
      type: "invoice.paid",
      data: {
        object: {
          id: "in_1",
          customer,
          amount_paid: 999,
          currency: "eur",
          lines: { data: [{ price: { id: priceId } }] },
        },
      },
    };
  }

  beforeEach(() => {
    prismaMock.agency.findFirst.mockResolvedValue(null); // not an agency invoice
    prismaMock.affiliateReferral.findFirst.mockResolvedValue(null); // no referral
  });

  it("grants access and syncs the plan from a mapped price", async () => {
    prismaMock.server.findFirst.mockResolvedValue({
      id: "s1", stripeCustomerId: "cus_1", plan: "free", premiumSince: null,
    });

    const res = await post(invoiceEvent({ priceId: "price_pm" }));

    expect(res.status).toBe(200);
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({
        isPremium: true,
        plan: "premium",
        billingInterval: "month",
        planSource: "stripe",
        pastDueSince: null,
      }),
    });
  });

  it("floors an unmapped price + plan=free to Premium (never silently free)", async () => {
    prismaMock.server.findFirst.mockResolvedValue({
      id: "s2", stripeCustomerId: "cus_1", plan: "free", premiumSince: null,
    });

    const res = await post(invoiceEvent({ priceId: "price_totally_unknown" }));

    expect(res.status).toBe(200);
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "s2" },
      data: expect.objectContaining({
        isPremium: true,
        plan: "premium",
        planSource: "stripe",
      }),
    });
  });

  it("keeps the agency active on a recurring agency invoice", async () => {
    prismaMock.agency.findFirst.mockResolvedValue({ id: "ag1", stripeCustomerId: "cus_1" });

    const res = await post(invoiceEvent({ customer: "cus_1" }));

    expect(res.status).toBe(200);
    expect(prismaMock.agency.update).toHaveBeenCalledWith({
      where: { id: "ag1" },
      data: { active: true, stripeStatus: "active", pastDueSince: null },
    });
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });

  // Комисионната е върху НЕТО. ДДС-то само минава през нас — 20% върху брутото
  // значи да плащаме афилиейта и върху държавното перо.
  it("pays the affiliate 20% of the NET amount (invoice.total_taxes subtracted)", async () => {
    prismaMock.server.findFirst.mockResolvedValue({
      id: "s3", stripeCustomerId: "cus_1", plan: "premium", premiumSince: new Date(),
    });
    prismaMock.affiliateReferral.findFirst.mockResolvedValue({
      id: "ref1", affiliateId: "aff1", firstPaymentAt: null,
    });

    const event = invoiceEvent();
    // €9.99 с ВКЛЮЧЕНО 20% ДДС (tax_behavior=inclusive, вж. stripe-setup.sh):
    // бруто 999, ДДС 167 → нето 832 → комисионна floor(832*0.20) = 166.
    // Върху брутото щеше да е 199 — 20% надплащане на всяка фактура.
    event.data.object.total_taxes = [{ amount: 167, tax_behavior: "inclusive" }];

    const res = await post(event);

    expect(res.status).toBe(200);
    expect(prismaMock.affiliateReferral.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalEarnings: { increment: 166 } }),
      })
    );
    expect(prismaMock.affiliateCode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalEarnings: { increment: 166 },
          pendingEarnings: { increment: 166 },
        }),
      })
    );
  });

  it("falls back to the gross amount when total_taxes is absent (no tax collected)", async () => {
    prismaMock.server.findFirst.mockResolvedValue({
      id: "s4", stripeCustomerId: "cus_1", plan: "premium", premiumSince: new Date(),
    });
    prismaMock.affiliateReferral.findFirst.mockResolvedValue({
      id: "ref2", affiliateId: "aff2", firstPaymentAt: null,
    });

    const res = await post(invoiceEvent()); // няма total_taxes

    expect(res.status).toBe(200);
    expect(prismaMock.affiliateReferral.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalEarnings: { increment: 199 } }), // floor(999*0.2)
      })
    );
  });
});

describe("invoice.payment_failed", () => {
  function failedEvent(id = "evt_fail1") {
    return {
      id,
      type: "invoice.payment_failed",
      data: {
        object: { id: "in_f1", customer: "cus_1", amount_due: 999, currency: "eur" },
      },
    };
  }

  beforeEach(() => {
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({
      id: "s1", name: "Test Guild", ownerId: "owner_1",
      stripeCustomerId: "cus_1", pastDueSince: null,
    });
    dmUserMock.mockResolvedValue({ ok: true });
  });

  it("marks past_due and DMs the owner exactly once", async () => {
    const res = await post(failedEvent());

    expect(res.status).toBe(200);
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({ stripeStatus: "past_due" }),
    });
    expect(dmUserMock).toHaveBeenCalledTimes(1);
    expect(dmUserMock).toHaveBeenCalledWith("owner_1", expect.objectContaining({
      title: expect.stringContaining("Payment failed"),
    }));
  });

  // Дублирана доставка на СЪЩОТО събитие → нито ефект, нито второ DM.
  it("a re-delivered payment_failed event sends no second DM", async () => {
    prismaMock.processedStripeEvent.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );

    const res = await post(failedEvent("evt_fail_dup"));

    expect(res.status).toBe(200);
    expect(prismaMock.server.update).not.toHaveBeenCalled();
    expect(dmUserMock).not.toHaveBeenCalled();
  });

  // DM-ът е известие, не бизнес-ефект: провалът му не бива да върне не-2xx,
  // защото Stripe брои това за провал и ретрайва целия webhook.
  it("a DM failure still returns 200 (notification never fails the webhook)", async () => {
    dmUserMock.mockRejectedValue(new Error("bot unreachable"));

    const res = await post(failedEvent("evt_fail2"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});

describe("customer.subscription.updated", () => {
  beforeEach(() => {
    prismaMock.agency.findFirst.mockResolvedValue(null); // not an agency subscription
  });

  it("premiumOff (e.g. unpaid) revokes access and drops plan to free", async () => {
    prismaMock.server.findFirst.mockResolvedValue({
      id: "s1", isPremium: true, plan: "premium", stripeStatus: "active",
      stripeSubscriptionId: "sub_1", pastDueSince: null,
    });

    const event = {
      id: "evt_su1",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1", status: "unpaid", metadata: {}, items: { data: [{ price: { id: "price_pm" } }] } } },
    };

    const res = await post(event);

    expect(res.status).toBe(200);
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({ isPremium: false, plan: "free", billingInterval: null }),
    });
  });

  it("agency downgrade releases seats over the new limit (drops most-recent members first)", async () => {
    prismaMock.agency.findFirst.mockResolvedValue({
      id: "ag1", stripeSubscriptionId: "sub_a1", stripeStatus: "active", pastDueSince: null,
    });
    // 7 members, downgrading to agency5 (maxServers=5) → drop the 2 most recent
    // (findMany is ordered by createdAt desc per the route).
    prismaMock.server.findMany.mockResolvedValue([
      { id: "newest" }, { id: "second-newest" }, { id: "m3" }, { id: "m4" },
      { id: "m5" }, { id: "m6" }, { id: "oldest" },
    ]);

    const event = {
      id: "evt_su2",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_a1", status: "active", metadata: {}, items: { data: [{ price: { id: "price_a5m" } }] } } },
    };

    const res = await post(event);

    expect(res.status).toBe(200);
    expect(prismaMock.agency.update).toHaveBeenCalledWith({
      where: { id: "ag1" },
      data: expect.objectContaining({ plan: "agency5", seatLimit: 5 }),
    });
    expect(prismaMock.server.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["newest", "second-newest"] } },
      data: { agencyId: null },
    });
  });
});

describe("customer.subscription.deleted", () => {
  it("drops plan to free and clears planSource", async () => {
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1" });

    const event = {
      id: "evt_sd1",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", metadata: {} } },
    };

    const res = await post(event);

    expect(res.status).toBe(200);
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({
        isPremium: false, plan: "free", planSource: null, stripeStatus: "canceled",
      }),
    });
  });
});

describe("charge.refunded", () => {
  it("a full refund revokes access", async () => {
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1" });

    const event = {
      id: "evt_cr1",
      type: "charge.refunded",
      data: { object: { id: "ch_1", customer: "cus_1", amount: 1000, amount_refunded: 1000 } },
    };

    const res = await post(event);

    expect(res.status).toBe(200);
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({ isPremium: false, plan: "free", stripeStatus: "refunded" }),
    });
  });

  it("a partial refund keeps access (never looks up the server)", async () => {
    const event = {
      id: "evt_cr2",
      type: "charge.refunded",
      data: { object: { id: "ch_2", customer: "cus_1", amount: 1000, amount_refunded: 500 } },
    };

    const res = await post(event);

    expect(res.status).toBe(200);
    expect(prismaMock.server.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });
});

describe("idempotency", () => {
  it("a re-delivered event.id (P2002 on the marker insert) is a 200 no-op", async () => {
    prismaMock.processedStripeEvent.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );

    const event = {
      id: "evt_dup",
      type: "checkout.session.completed",
      data: {
        object: { metadata: { serverId: "s1", plan: "premium" }, subscription: "sub_1", payment_status: "paid" },
      },
    };

    const res = await post(event);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });
});
