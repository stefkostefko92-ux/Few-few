// backend/src/__tests__/accessUntil.test.js
// v40 — решението на собственика, дословно:
//   „Ако refund/chargeback абонаментът трябва да спре.
//    Ако само прекратен абонамент той трябва да продължи до крайният срок.“
//
// Това са ДВЕ различни поведения върху едно и също събитие в Stripe. Досега
// кодът ги третираше еднакво: `customer.subscription.deleted` отнемаше достъпа
// В МОМЕНТА на събитието. При незабавна отмяна клиентът губеше дни, за които
// вече е платил; при refund пък абонаментът оставаше жив в Stripe и картата
// щеше да бъде таксувана пак — с върнати пари.
//
// Тук пазим и двете посоки. Всяко очакване е БИЗНЕС правило, не форма на код.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fake";
process.env.FRONTEND_URL = "https://supreme.example.com";
process.env.STRIPE_PRICE_PREMIUM_MONTH = "price_pm";
process.env.STRIPE_PRICE_WHITELABEL_MONTH = "price_wm";

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
vi.mock("../services/botNotifier.js", () => ({ notifyBot: vi.fn(), dmUser: vi.fn(), reconcileWhitelabel: vi.fn() }));

const stripeRouter = (await import("../routes/stripe.js")).default;

const DAY = 86_400_000;
/** Unix секунди — Stripe носи периодите в секунди, не в милисекунди. */
const inDays = (n) => Math.floor((Date.now() + n * DAY) / 1000);

function post(event) {
  stripeInstance.webhooks.constructEvent.mockReturnValue(event);
  const app = express();
  app.use(express.json());
  app.use("/api/stripe", stripeRouter);
  return request(app)
    .post("/api/stripe/webhook")
    .set("stripe-signature", "t=1,v1=fake")
    .send({ irrelevant: "constructEvent е мокнат" });
}

/** Данните от последния server.update — тук живеят всички твърдения. */
const lastServerUpdate = () => prismaMock.server.update.mock.calls.at(-1)?.[0]?.data;
const lastAgencyUpdate = () => prismaMock.agency.update.mock.calls.at(-1)?.[0]?.data;

function deletedEvent({ id = "evt_del", periodEnd = inDays(20), price = "price_pm" } = {}) {
  return {
    id,
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_1",
        metadata: {},
        items: { data: [{ current_period_end: periodEnd, price: { id: price } }] },
      },
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  stripeInstance.webhooks.constructEvent.mockImplementation((raw) => raw);
  // `cancelSubscriptionNow` първо ЧЕТЕ абонамента (за да пропусне вече отменен).
  // Задава се СЛЕД resetAllMocks, иначе се изтрива веднага.
  stripeInstance.subscriptions.retrieve.mockResolvedValue({ id: "sub_1", status: "active" });
});

describe("ОТМЯНА → достъп до края на платения период", () => {
  it("записва accessUntil = края на периода и пази платената тарифа в gracePlan", async () => {
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1", plan: "whitelabel", stripeStatus: "active" });

    const periodEnd = inDays(20);
    const res = await post(deletedEvent({ periodEnd }));

    expect(res.status).toBe(200);
    const data = lastServerUpdate();
    // Планът пада на free — иначе би блокирал нова покупка и би изглеждал
    // като жив абонамент. Достъпът живее ОТДЕЛНО, в accessUntil.
    expect(data.plan).toBe("free");
    expect(data.accessUntil).toBeInstanceOf(Date);
    expect(Math.round(data.accessUntil.getTime() / 1000)).toBe(periodEnd);
    // Точно платената тарифа, не „premium“ по подразбиране: whitelabel клиент,
    // смъкнат на premium, губи функция, за която има пари.
    expect(data.gracePlan).toBe("whitelabel");
  });

  it("взема тарифата от цената на абонамента, ако колоната вече е „free“", async () => {
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1", plan: "free", stripeStatus: "active" });

    await post(deletedEvent({ price: "price_wm" }));

    expect(lastServerUpdate().gracePlan).toBe("whitelabel");
  });

  it("НЕ дава гратис, ако периодът вече е изтекъл (отмяна в края на периода)", async () => {
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1", plan: "premium", stripeStatus: "active" });

    await post(deletedEvent({ periodEnd: inDays(-1) }));

    const data = lastServerUpdate();
    expect(data.accessUntil).toBeNull();
    expect(data.gracePlan).toBeNull();
  });

  it("НЕ дава гратис, ако парите вече са върнати (stripeStatus refunded)", async () => {
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1", plan: "premium", stripeStatus: "refunded" });

    await post(deletedEvent());

    expect(lastServerUpdate().accessUntil).toBeNull();
  });

  it("НЕ дава гратис при chargeback (stripeStatus disputed)", async () => {
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1", plan: "premium", stripeStatus: "disputed" });

    await post(deletedEvent());

    expect(lastServerUpdate().accessUntil).toBeNull();
  });

  it("агенцията остава активна до края на платения период", async () => {
    prismaMock.agency.findFirst.mockResolvedValue({ id: "ag1", stripeStatus: "active" });

    const periodEnd = inDays(10);
    await post(deletedEvent({ periodEnd }));

    const data = lastAgencyUpdate();
    // active=true, иначе покритите сървъри падат В СЪЩАТА СЕКУНДА —
    // getServerTier гейтва точно на agency.active.
    expect(data.active).toBe(true);
    expect(Math.round(data.accessUntil.getTime() / 1000)).toBe(periodEnd);
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });
});

describe("REFUND → достъпът пада веднага и абонаментът спира", () => {
  const refundEvent = {
    id: "evt_ref",
    type: "charge.refunded",
    data: { object: { id: "ch_1", customer: "cus_1", amount: 1000, amount_refunded: 1000 } },
  };

  it("занулява гратиса — върнати пари не купуват оставащи дни", async () => {
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1", stripeSubscriptionId: "sub_1" });

    await post(refundEvent);

    const data = lastServerUpdate();
    expect(data.isPremium).toBe(false);
    expect(data.stripeStatus).toBe("refunded");
    expect(data.accessUntil).toBeNull();
    expect(data.gracePlan).toBeNull();
  });

  it("отменя абонамента в Stripe — иначе следва ново таксуване по върнатата карта", async () => {
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1", stripeSubscriptionId: "sub_1" });

    await post(refundEvent);

    expect(stripeInstance.subscriptions.cancel).toHaveBeenCalledWith("sub_1");
  });

  it("вече несъществуващ абонамент не е грешка (resource_missing)", async () => {
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1", stripeSubscriptionId: "sub_gone" });
    stripeInstance.subscriptions.retrieve.mockRejectedValue(
      Object.assign(new Error("No such subscription"), { code: "resource_missing" }),
    );

    const res = await post(refundEvent);

    expect(res.status).toBe(200);
  });

  it("ВЕЧЕ отменен абонамент не се отменя пак — иначе ретраят цикли на 500", async () => {
    // Stripe отказва update на `canceled` абонамент. Функцията се вика ИЗВЪН
    // runOnce, значи при ретрай минава пак: без тази проверка всеки ретрай
    // получава 400 → връщаме 500 → безкраен цикъл.
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1", stripeSubscriptionId: "sub_1" });
    stripeInstance.subscriptions.retrieve.mockResolvedValue({ id: "sub_1", status: "canceled" });

    const res = await post(refundEvent);

    expect(res.status).toBe(200);
    expect(stripeInstance.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it("ПАЗИ stripeSubscriptionId — ретраят на отмяната има нужда от него", async () => {
    // Занулено ли беше id-то в транзакцията, при ретрай (маркерът вече записан →
    // DB ефектът се пропуска) нямаше какво да се отмени и абонаментът оставаше
    // ЖИВ по картата, чиито пари сме върнали. Дефект, въведен и хванат на
    // 07.08.2026 при собствена проверка.
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1", stripeSubscriptionId: "sub_1" });

    await post(refundEvent);

    expect(lastServerUpdate()).not.toHaveProperty("stripeSubscriptionId");
  });

  it("истинска грешка при отмяната връща 500 → Stripe ретрайва", async () => {
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1", stripeSubscriptionId: "sub_1" });
    stripeInstance.subscriptions.cancel.mockRejectedValue(new Error("Stripe е недостъпен"));

    const res = await post(refundEvent);

    // Премълчан провал тук значи: клиентът си е върнал парите И ще бъде
    // таксуван пак следващия месец. По-добре ретрай.
    expect(res.status).toBe(500);
  });

  it("АГЕНЦИЯ с върнати пари също се отнема (няма ред в servers → преди това мълчеше)", async () => {
    prismaMock.agency.findFirst.mockResolvedValue({ id: "ag1", stripeSubscriptionId: "sub_a1" });

    await post(refundEvent);

    expect(lastAgencyUpdate()).toMatchObject({ active: false, accessUntil: null, stripeStatus: "refunded" });
    expect(stripeInstance.subscriptions.cancel).toHaveBeenCalledWith("sub_a1");
    expect(prismaMock.server.findFirst).not.toHaveBeenCalled();
  });

  it("ЧАСТИЧНО връщане не пипа нищо (напр. пропорционален отказ по чл. 14(3))", async () => {
    await post({
      id: "evt_ref_part",
      type: "charge.refunded",
      data: { object: { id: "ch_2", customer: "cus_1", amount: 1000, amount_refunded: 400 } },
    });

    expect(prismaMock.server.update).not.toHaveBeenCalled();
    expect(prismaMock.agency.update).not.toHaveBeenCalled();
    expect(stripeInstance.subscriptions.cancel).not.toHaveBeenCalled();
  });
});

describe("CHARGEBACK → същото, плюс агенции", () => {
  const disputeEvent = {
    id: "evt_dis",
    type: "charge.dispute.created",
    data: { object: { id: "dp_1", charge: "ch_1" } },
  };

  beforeEach(() => {
    stripeInstance.charges.retrieve.mockResolvedValue({ customer: "cus_1" });
  });

  it("занулява гратиса и отменя абонамента", async () => {
    prismaMock.agency.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({ id: "s1", stripeSubscriptionId: "sub_1" });

    await post(disputeEvent);

    const data = lastServerUpdate();
    expect(data.stripeStatus).toBe("disputed");
    expect(data.accessUntil).toBeNull();
    expect(data.gracePlan).toBeNull();
    expect(stripeInstance.subscriptions.cancel).toHaveBeenCalledWith("sub_1");
  });

  it("АГЕНЦИЯ с chargeback се деактивира", async () => {
    prismaMock.agency.findFirst.mockResolvedValue({ id: "ag1", stripeSubscriptionId: "sub_a1" });

    await post(disputeEvent);

    expect(lastAgencyUpdate()).toMatchObject({ active: false, accessUntil: null, stripeStatus: "disputed" });
  });
});

describe("нова покупка гаси стария гратис", () => {
  it("checkout.session.completed зачиства accessUntil/gracePlan", async () => {
    prismaMock.server.findUnique.mockResolvedValue({ id: "s1" });
    stripeInstance.subscriptions.retrieve.mockResolvedValue({ id: "sub_2", status: "active" });

    await post({
      id: "evt_buy",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { serverId: "s1", plan: "premium", interval: "month" },
          subscription: "sub_2", payment_status: "paid", amount_total: 499, currency: "eur",
        },
      },
    });

    const data = lastServerUpdate();
    expect(data.accessUntil).toBeNull();
    expect(data.gracePlan).toBeNull();
  });
});
