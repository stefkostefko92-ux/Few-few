// backend/src/__tests__/checkoutDuringGrace.test.js
// Отмененият клиент може да купи пак. Активният — не може да купи два пъти.
//
// ДЕФЕКТЪТ (червен екип, 07.08.2026): гардът на `create-checkout` четеше
// суровата `server.isPremium`, а v40 нарочно я оставя `true` през целия гратис
// (`routes/stripe.js:839` — клиентът е платил периода и го ползва докрай).
// Резултат: отмененият клиент получаваше USE_PORTAL и беше насочен към портала,
// където няма какво да поднови — абонаментът в Stripe вече не съществува
// (`stripeSubscriptionId` е нулиран). Годишен план, отменен на ден 1, значеше
// цяла година, в която клиентът ИСКА да плати и не може. Пряка загуба на
// приход, и то в пълно противоречие с коментара на ред 818-819.
//
// Дефектен клас Б от този одит: две определения на едно правило. „Има достъп“
// и „има жив източник на права“ се бяха слели в една колона.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fake";
process.env.FRONTEND_URL = "https://supreme.example.com";
process.env.STRIPE_PRICE_PREMIUM_MONTH = "price_pm";

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
// Автентикацията не е предмет на теста — плащащият админ Е логнат с ManageGuild.
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, _res, next) => { req.session = { userId: "u1" }; next(); },
  loadUser: (req, _res, next) => { req.user = { id: "u1", globalRole: "USER" }; next(); },
  requireServerAdmin: (_req, _res, next) => next(),
  requireBotSecret: (_req, _res, next) => next(),
}));

const stripeRouter = (await import("../routes/stripe.js")).default;
const app = express();
app.use(express.json());
app.use("/api/stripe", stripeRouter);

const DAY = 24 * 60 * 60 * 1000;
const server = (o) => ({
  id: "s1", isPremium: false, plan: "free", planSource: null,
  stripeSubscriptionId: null, stripeCustomerId: "cus_1", stripeStatus: null,
  accessUntil: null, gracePlan: null, trialEndsAt: null, trialUsed: true, ...o,
});

const buy = () => request(app)
  .post("/api/stripe/create-checkout/s1")
  .send({ withdrawalConsent: true, plan: "premium", interval: "month" });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
  stripeInstance.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/x" });
});

describe("гратисът НЕ заключва касата", () => {
  it("отменен-но-платен клиент стига до Checkout", async () => {
    // Точното състояние след customer.subscription.deleted с гратис.
    prismaMock.server.findUnique.mockResolvedValue(server({
      isPremium: true,              // гратисът вдига суровата колона
      stripeStatus: "canceled",
      stripeSubscriptionId: null,   // абонаментът в Stripe го НЯМА
      planSource: null,
      accessUntil: new Date(Date.now() + 300 * DAY),
      gracePlan: "premium",
    }));
    const res = await buy();
    expect(res.body.code).not.toBe("USE_PORTAL");
    expect(res.status).toBe(200);
    expect(stripeInstance.checkout.sessions.create).toHaveBeenCalled();
  });

  it("пробен потребител също стига до Checkout (иначе нула конверсия)", async () => {
    prismaMock.server.findUnique.mockResolvedValue(server({
      trialEndsAt: new Date(Date.now() + 3 * DAY), trialUsed: false,
    }));
    const res = await buy();
    expect(res.status).toBe(200);
  });

  it("напълно безплатен сървър стига до Checkout", async () => {
    prismaMock.server.findUnique.mockResolvedValue(server());
    const res = await buy();
    expect(res.status).toBe(200);
  });
});

describe("жив източник на права ВСЕ ОЩЕ блокира втори Checkout", () => {
  it("активен Stripe абонамент → USE_PORTAL (иначе двойно таксуване)", async () => {
    prismaMock.server.findUnique.mockResolvedValue(server({
      isPremium: true, plan: "premium", planSource: "stripe",
      stripeSubscriptionId: "sub_live", stripeStatus: "active",
    }));
    const res = await buy();
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("USE_PORTAL");
    expect(stripeInstance.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("Discord entitlement → USE_PORTAL (втори Checkout би дублирал правата)", async () => {
    prismaMock.server.findUnique.mockResolvedValue(server({
      isPremium: true, plan: "premium", planSource: "discord",
    }));
    const res = await buy();
    expect(res.body.code).toBe("USE_PORTAL");
  });

  it("ръчен подарък от админ → USE_PORTAL", async () => {
    prismaMock.server.findUnique.mockResolvedValue(server({
      isPremium: true, plan: "whitelabel", planSource: "manual",
    }));
    const res = await buy();
    expect(res.body.code).toBe("USE_PORTAL");
  });

  it("past_due абонамент → USE_PORTAL (абонаментът още живее, иска плащане)", async () => {
    prismaMock.server.findUnique.mockResolvedValue(server({
      isPremium: true, plan: "premium", planSource: "stripe",
      stripeSubscriptionId: "sub_live", stripeStatus: "past_due",
    }));
    const res = await buy();
    expect(res.body.code).toBe("USE_PORTAL");
  });
});

describe("гардът не се връща към суровата колона", () => {
  it("самó isPremium, без нито един жив източник, НЕ блокира", async () => {
    // Ако някой пак напише `if (server.isPremium)`, този тест пада.
    prismaMock.server.findUnique.mockResolvedValue(server({ isPremium: true }));
    const res = await buy();
    expect(res.status).toBe(200);
  });
});
