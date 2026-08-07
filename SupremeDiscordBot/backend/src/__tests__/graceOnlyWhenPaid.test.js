// backend/src/__tests__/graceOnlyWhenPaid.test.js
// Гратис получава само този, който е ПЛАТИЛ периода.
//
// ДЕФЕКТЪТ (червен екип, 07.08.2026): гратисът се даваше на всичко, което не е
// `refunded`/`disputed` — denylist от два статуса. Но „не са върнати пари“ не
// значи „платено е“. Пропадне ли картата, Stripe изчерпва Smart Retries
// (`past_due` → `unpaid`) и отменя абонамента; `customer.subscription.deleted`
// пристига с `current_period_end` в БЪДЕЩЕТО, защото периодът е започнал —
// просто фактурата за него никога не е платена. Годишен план = до ~12 месеца
// пълен достъп, подарен на човек, който не е платил за него нищо.
//
// Дефектен клас В от този одит: fail-open denylist. Изброиш ли лошите, всяко
// ново състояние минава за добро. Сега изброяваме добрите.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fake";
process.env.FRONTEND_URL = "https://supreme.example.com";
process.env.STRIPE_PRICE_PREMIUM_YEAR = "price_py";

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

/** `customer.subscription.deleted` с период, който още тече (годишен план). */
const deleted = (id) => ({
  id,
  type: "customer.subscription.deleted",
  data: { object: {
    id: "sub_1", metadata: {}, status: "canceled",
    items: { data: [{ current_period_end: IN_11_MONTHS, price: { id: "price_py" } }] },
  } },
});

const post = (event) => request(app)
  .post("/api/stripe/webhook")
  .set("stripe-signature", "t=1,v1=fake")
  .send({});

let evt = 0;
async function cancelWithPriorStatus(stripeStatus) {
  prismaMock.agency.findFirst.mockResolvedValue(null);
  prismaMock.server.findFirst.mockResolvedValue({
    id: "s1", plan: "premium", isPremium: true, stripeStatus,
    stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1",
  });
  const event = deleted(`evt_${stripeStatus}_${++evt}`);
  stripeInstance.webhooks.constructEvent.mockReturnValue(event);
  const res = await post(event);
  expect(res.status).toBe(200);
  return prismaMock.server.update.mock.calls.at(-1)?.[0]?.data;
}

beforeEach(() => {
  vi.clearAllMocks();
  stripeInstance.webhooks.constructEvent.mockImplementation((raw) => raw);
});

describe("неплатеният период НЕ се подарява", () => {
  it("изчерпан дунинг (unpaid) → нула гратис", async () => {
    const data = await cancelWithPriorStatus("unpaid");
    expect(data.isPremium).toBe(false);
    expect(data.accessUntil).toBe(null);
    expect(data.gracePlan).toBe(null);
  });

  it("past_due при отмяна → нула гратис (фактурата не е платена)", async () => {
    const data = await cancelWithPriorStatus("past_due");
    expect(data.isPremium).toBe(false);
    expect(data.accessUntil).toBe(null);
  });

  it("incomplete (SCA никога не потвърдена) → нула гратис", async () => {
    const data = await cancelWithPriorStatus("incomplete");
    expect(data.accessUntil).toBe(null);
  });

  it("refunded → нула гратис (парите са върнати)", async () => {
    const data = await cancelWithPriorStatus("refunded");
    expect(data.accessUntil).toBe(null);
  });

  it("disputed → нула гратис (chargeback)", async () => {
    const data = await cancelWithPriorStatus("disputed");
    expect(data.accessUntil).toBe(null);
  });

  it("непознат/нов статус → нула гратис (fail-closed, не fail-open)", async () => {
    // Точката на allowlist-а: утрешен статус от Stripe не влиза като „добър“.
    const data = await cancelWithPriorStatus("paused");
    expect(data.accessUntil).toBe(null);
  });

  it("липсващ статус → нула гратис", async () => {
    const data = await cancelWithPriorStatus(null);
    expect(data.accessUntil).toBe(null);
  });
});

describe("платеният период СЕ дава докрай — правилото на собственика", () => {
  it("active при отмяна → достъп до края на платения период", async () => {
    const data = await cancelWithPriorStatus("active");
    expect(data.isPremium).toBe(true);
    expect(data.accessUntil).toBeInstanceOf(Date);
    expect(data.accessUntil.getTime()).toBeGreaterThan(Date.now());
    expect(data.gracePlan).toBe("premium");
  });

  it("trialing при отмяна → пробата остава до края си", async () => {
    const data = await cancelWithPriorStatus("trialing");
    expect(data.isPremium).toBe(true);
    expect(data.accessUntil).toBeInstanceOf(Date);
  });
});

describe("насрочена ранна отмяна съкращава достъпа", () => {
  // ДЕФЕКТЪТ (червен екип, 07.08.2026): docstring-ът обещаваше приоритет на
  // `cancel_at`, но кодът беше `items… || cancel_at` — достигаше го САМО когато
  // items не дадат нищо. При насрочен ранен край достъпът се даваше до
  // ПО-КЪСНАТА дата, тоест раздавахме повече от обещаното.
  async function cancelWith(subOverride) {
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({
      id: "s1", plan: "premium", isPremium: true, stripeStatus: "active",
      stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1",
    });
    const event = {
      id: `evt_cancelat_${++evt}`,
      type: "customer.subscription.deleted",
      data: { object: {
        id: "sub_1", metadata: {}, status: "canceled",
        items: { data: [{ current_period_end: IN_11_MONTHS, price: { id: "price_py" } }] },
        ...subOverride,
      } },
    };
    stripeInstance.webhooks.constructEvent.mockReturnValue(event);
    await post(event);
    return prismaMock.server.update.mock.calls.at(-1)?.[0]?.data;
  }

  it("cancel_at ПРЕДИ края на периода → достъпът свършва тогава", async () => {
    const early = Math.floor(Date.now() / 1000) + 7 * 86400; // след седмица
    const data = await cancelWith({ cancel_at: early });
    expect(data.accessUntil.getTime()).toBe(early * 1000);
  });

  it("cancel_at СЛЕД края на периода → периодът пак командва", async () => {
    const late = IN_11_MONTHS + 30 * 86400;
    const data = await cancelWith({ cancel_at: late });
    expect(data.accessUntil.getTime()).toBe(IN_11_MONTHS * 1000);
  });

  it("без cancel_at → краят на периода, както преди", async () => {
    const data = await cancelWith({});
    expect(data.accessUntil.getTime()).toBe(IN_11_MONTHS * 1000);
  });
});
