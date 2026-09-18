// backend/src/__tests__/partialRefundGrace.test.js
// Частично върнати пари + отмяна ≠ безплатен остатък от периода.
//
// ДЕФЕКТЪТ (червен екип, кръг 2, 07.08.2026): `charge.refunded` излизаше рано
// при частично връщане („достъпът остава“ — вярно), но НЕ оставяше следа. После
// `customer.subscription.deleted` виждаше `stripeStatus: "active"`, минаваше
// през allowlist-а `PAID_PERIOD_STATUSES` и даваше гратис до края на периода.
// При годишен White-label: ~90 € върнати обратно И 11 месеца достъп подарен.
//
// Allowlist-ът не хващаше този вход, защото съди по колона, която частичното
// връщане нарочно не пипаше. Урокът: „не пипай нищо“ е състояние, което после
// някой друг чете като „всичко е наред“.
//
// Тестът е с ПАМЕТ: две събития в редица, второто вижда какво е записало
// първото. Статичен мок би минал по грешна причина.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fake";
process.env.FRONTEND_URL = "https://supreme.example.com";
process.env.STRIPE_PRICE_WHITELABEL_YEAR = "price_wy";

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
vi.mock("../services/botNotifier.js", () => ({
  notifyBot: vi.fn(), dmUser: vi.fn(), reconcileWhitelabel: vi.fn(),
}));

const stripeRouter = (await import("../routes/stripe.js")).default;
const app = express();
app.use(express.json());
app.use("/api/stripe", stripeRouter);

const IN_11_MONTHS = Math.floor(Date.now() / 1000) + 330 * 86400;

/** Живото състояние на сървъра — вторият webhook чете каквото първият е писал. */
let server;

const post = (event) => {
  stripeInstance.webhooks.constructEvent.mockReturnValue(event);
  return request(app).post("/api/stripe/webhook").set("stripe-signature", "t=1,v1=fake").send({});
};

const refund = (refunded, total = 9900) => ({
  id: `evt_refund_${refunded}`, type: "charge.refunded",
  data: { object: { id: "ch_1", customer: "cus_1", amount: total, amount_refunded: refunded } },
});

const canceled = {
  id: "evt_deleted", type: "customer.subscription.deleted",
  data: { object: {
    id: "sub_1", metadata: {}, status: "canceled",
    items: { data: [{ current_period_end: IN_11_MONTHS, price: { id: "price_wy" } }] },
  } },
};

beforeEach(() => {
  vi.clearAllMocks();
  stripeInstance.webhooks.constructEvent.mockImplementation((raw) => raw);
  server = {
    id: "s1", plan: "whitelabel", isPremium: true, stripeStatus: "active",
    stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1",
  };
  prismaMock.agency.findFirst.mockResolvedValue(null);
  prismaMock.server.findFirst.mockImplementation(async () => ({ ...server }));
  prismaMock.server.findUnique.mockImplementation(async () => ({ ...server }));
  // Записът се ОТРАЗЯВА — иначе второто събитие съди по застояло състояние.
  prismaMock.server.update.mockImplementation(async ({ data }) => {
    Object.assign(server, data);
    return { ...server };
  });
});

describe("частичното връщане оставя следа", () => {
  it("записва partially_refunded, без да пипа достъпа", async () => {
    const res = await post(refund(9000));
    expect(res.status).toBe(200);
    expect(server.stripeStatus).toBe("partially_refunded");
    // Клиентът е платил остатъка — достъпът тече до края на периода.
    expect(server.isPremium).toBe(true);
    expect(server.plan).toBe("whitelabel");
  });

  it("оставя одитна следа със сумите", async () => {
    await post(refund(9000));
    const log = prismaMock.auditLog.create.mock.calls.at(-1)?.[0]?.data;
    expect(log?.action).toBe("PREMIUM_PARTIAL_REFUND");
    expect(log?.metadata).toMatchObject({ refunded: 9000, total: 9900 });
  });
});

describe("след частично връщане отмяната НЕ подарява остатъка", () => {
  it("нула гратис — това е дупката, заради която тестът съществува", async () => {
    await post(refund(9000));
    await post(canceled);
    expect(server.accessUntil, "остатъкът от периода е подарен след частично връщане").toBeNull();
    expect(server.gracePlan).toBeNull();
    expect(server.isPremium).toBe(false);
  });
});

describe("останалите два случая не са пипнати", () => {
  it("ПЪЛНО връщане още отнема достъпа веднага", async () => {
    await post(refund(9900));
    expect(server.stripeStatus).toBe("refunded");
    expect(server.isPremium).toBe(false);
    expect(server.plan).toBe("free");
  });

  it("БЕЗ никакво връщане отмяната пак дава гратис — правилото на собственика", async () => {
    await post(canceled);
    expect(server.accessUntil).toBeInstanceOf(Date);
    expect(server.gracePlan).toBe("whitelabel");
    expect(server.isPremium).toBe(true);
  });
});
