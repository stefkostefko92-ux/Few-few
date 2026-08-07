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
  subscriptions: { retrieve: vi.fn(), cancel: vi.fn() },
  charges: { retrieve: vi.fn() },
  paymentIntents: { retrieve: vi.fn() },
};
vi.mock("stripe", () => ({ default: vi.fn(() => stripeInstance) }));

// Транзакционните DM известия са СТРАНИЧЕН ефект — мокваме канала към бота,
// за да проверим кога се вика (и че никога не поваля webhook-а).
const dmUserMock = vi.fn();
vi.mock("../services/botNotifier.js", () => ({
  notifyBot: vi.fn(),
  dmUser: (...args) => dmUserMock(...args),
  reconcileWhitelabel: vi.fn(),
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
  // Живият абонамент е истината — invoice.paid го чете, преди да провизира.
  // Задава се СЛЕД resetAllMocks, иначе се изтрива веднага.
  stripeInstance.subscriptions.retrieve.mockResolvedValue({ id: "sub_live", status: "active" });
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
          payment_status: "paid", metadata: { kind: "agency", agencyId: "ag1", interval: "month" },
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
  function invoiceEvent({ id = "evt_inv1", priceId = "price_pm", customer = "cus_1", subscription = "sub_live" } = {}) {
    return {
      id,
      type: "invoice.paid",
      data: {
        object: {
          id: "in_1",
          customer,
          amount_paid: 999,
          currency: "eur",
          // SDK 22.x: скаларното invoice.subscription е премахнато — абонаментът
          // се чете оттук. Handler-ът го зарежда от Stripe, за да види ЖИВИЯ
          // статус, вместо да вярва на снимката в събитието.
          parent: { subscription_details: { subscription } },
          lines: { data: [{ price: { id: priceId } }] },
        },
      },
    };
  }

  beforeEach(() => {
    prismaMock.agency.findFirst.mockResolvedValue(null); // not an agency invoice
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
    // Маркерът СЪЩЕСТВУВА → колизията е точно дубъл на събитие. Без този ред
    // тестът не различаваше „вече обработено“ от чужда unique колизия (напр.
    // PaymentLog.stripeInvoiceId), а точно това разграничение пази пари.
    prismaMock.processedStripeEvent.findUnique.mockResolvedValue({ id: "seen" });

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
    // Маркерът СЪЩЕСТВУВА → колизията е точно дубъл на събитие. Без този ред
    // тестът не различаваше „вече обработено“ от чужда unique колизия (напр.
    // PaymentLog.stripeInvoiceId), а точно това разграничение пази пари.
    prismaMock.processedStripeEvent.findUnique.mockResolvedValue({ id: "seen" });

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

describe("идемпотентността не гълта чужди unique колизии", () => {
  it("P2002 БЕЗ наличен маркер → 500, за да ретрайне Stripe (клиентът е платил)", async () => {
    prismaMock.processedStripeEvent.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed on PaymentLog.stripeInvoiceId"), { code: "P2002" }),
    );
    prismaMock.processedStripeEvent.findUnique.mockResolvedValue(null); // маркер няма
    // Без сървър handler-ът излиза преди runOnce и P2002 изобщо не се случва.
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1", ownerId: "owner_1", name: "S" });
    prismaMock.agency.findFirst.mockResolvedValue(null);

    const res = await post({
      id: "evt_foreign_collision",
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_1", id: "in_1", amount_due: 499, currency: "eur" } },
    });

    // 500 → Stripe ретрайва. 200 би значело „обработено“ и събитието се губи.
    expect(res.status).toBe(500);
  });
});

// ─── Дунинг → успех за СЪЩАТА фактура (Продавача, 07.08.2026) ───────────────
// PaymentLog.stripeInvoiceId е @unique, а една фактура минава през ДВА
// handler-а: payment_failed при всеки неуспешен опит на Smart Retries, после
// paid при успеха. Докато записът беше `create`, вторият хвърляше P2002 — а
// сблъсъкът е ДЕТЕРМИНИРАН, значи политиката „P2002 без маркер → хвърли, за да
// ретрайне Stripe" ставаше безкраен цикъл: клиентът е платил, достъпът никога
// не се възстановява и дунингът му го отнема след 14 дни.
describe("една фактура през два handler-а не зацикля", () => {
  it("invoice.paid СЛЕД invoice.payment_failed за същата фактура минава", async () => {
    prismaMock.processedStripeEvent.create.mockResolvedValue({ id: "evt_ok" });
    prismaMock.processedStripeEvent.findUnique.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1", ownerId: "o1", name: "S" });
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.paymentLog.upsert.mockResolvedValue({});

    const res = await post({
      id: "evt_paid_after_failed",
      type: "invoice.paid",
      data: { object: { customer: "cus_1", parent: { subscription_details: { subscription: "sub_live" } }, id: "in_same", amount_paid: 499, currency: "eur", lines: { data: [] } } },
    });

    expect(res.status).toBe(200);
  });

  it("записът е UPSERT по фактурата, не CREATE — иначе вторият път е P2002", async () => {
    prismaMock.processedStripeEvent.create.mockResolvedValue({ id: "e2" });
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1", ownerId: "o1", name: "S" });
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.paymentLog.upsert.mockResolvedValue({});

    await post({
      id: "evt_failed_upsert",
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_1", id: "in_same", amount_due: 499, currency: "eur" } },
    });

    expect(prismaMock.paymentLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stripeInvoiceId: "in_same" } }),
    );
    expect(prismaMock.paymentLog.create).not.toHaveBeenCalled();
  });
});

// ─── Живият абонамент е истината (Продавача, 07.08.2026) ────────────────────
// Webhook събитията носят СНИМКА. Закъсняла, повторена или извън ред доставка
// провизираше по нея и ВЪЗКРЕСЯВАШЕ достъп, който вече е отнет.
describe("не провизираме по застояла снимка", () => {
  beforeEach(() => {
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({
      id: "s1", stripeCustomerId: "cus_1", plan: "free", premiumSince: null,
    });
  });

  it("invoice.paid за ОТМЕНЕН абонамент не дава достъп", async () => {
    stripeInstance.subscriptions.retrieve.mockResolvedValue({ id: "sub_dead", status: "canceled" });
    const res = await post({
      id: "evt_late_paid",
      type: "invoice.paid",
      data: { object: {
        id: "in_late", customer: "cus_1", amount_paid: 999, currency: "eur",
        parent: { subscription_details: { subscription: "sub_dead" } },
        lines: { data: [{ price: { id: "price_pm" } }] },
      } },
    });
    expect(res.status).toBe(200);
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });

  it("invoice.paid записва РЕАЛНИЯ статус, не оставя past_due след успех", async () => {
    stripeInstance.subscriptions.retrieve.mockResolvedValue({ id: "sub_live", status: "active" });
    await post({
      id: "evt_status",
      type: "invoice.paid",
      data: { object: {
        id: "in_ok", customer: "cus_1", amount_paid: 999, currency: "eur",
        parent: { subscription_details: { subscription: "sub_live" } },
        lines: { data: [{ price: { id: "price_pm" } }] },
      } },
    });
    expect(prismaMock.server.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stripeStatus: "active" }) }),
    );
  });

  it("checkout.session.completed за отменен абонамент не връща достъпа", async () => {
    stripeInstance.subscriptions.retrieve.mockResolvedValue({ id: "sub_x", status: "canceled" });
    const res = await post({
      id: "evt_late_checkout",
      type: "checkout.session.completed",
      data: { object: {
        metadata: { serverId: "s1", plan: "premium", interval: "month" },
        subscription: "sub_x", payment_status: "paid",
      } },
    });
    expect(res.status).toBe(200);
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });
});

describe("двоен абонамент за един сървър", () => {
  it("вторият платен checkout ОТМЕНЯ първия — иначе се таксуват и двата", async () => {
    stripeInstance.subscriptions.retrieve.mockResolvedValue({ id: "sub_new", status: "active" });
    prismaMock.server.findUnique.mockResolvedValue({ stripeSubscriptionId: "sub_old" });
    stripeInstance.subscriptions.cancel = vi.fn().mockResolvedValue({});

    await post({
      id: "evt_dup",
      type: "checkout.session.completed",
      data: { object: {
        metadata: { serverId: "s1", plan: "premium", interval: "month" },
        subscription: "sub_new", payment_status: "paid",
      } },
    });

    expect(stripeInstance.subscriptions.cancel).toHaveBeenCalledWith(
      "sub_old", undefined, expect.objectContaining({ idempotencyKey: expect.stringContaining("evt_dup") }),
    );
  });
});

describe("agency местата идват от ПЛАТЕНАТА сесия", () => {
  it("agency10 сесия дава 10 места, независимо какво пише в реда", async () => {
    stripeInstance.subscriptions.retrieve.mockResolvedValue({ id: "sub_a", status: "active" });
    await post({
      id: "evt_ag10",
      type: "checkout.session.completed",
      data: { object: {
        payment_status: "paid",
        metadata: { kind: "agency", agencyId: "ag1", plan: "agency10", interval: "month" },
        subscription: "sub_a",
      } },
    });
    expect(prismaMock.agency.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan: "agency10", seatLimit: 10 }),
      }),
    );
  });
});
