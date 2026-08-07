// backend/src/__tests__/invoicePaidGuards.test.js
// `invoice.paid` не възкресява отнет достъп и не бърка тарифата.
//
// ДВА ДЕФЕКТА (Продавача, одит 07.08.2026):
//
// 1) АСИМЕТРИЯ. Сървърният път изискваше абонаментът да е ЖИВ СЕГА
//    (`liveSubscription`), агенцийният — не. Stripe ретрайва webhook-и с дни и
//    доставя извън ред, значи закъснял `invoice.paid` след refund/chargeback
//    връщаше `active: true` върху агенция, която току-що беше отнета — и то
//    безсрочно, защото нищо после не я сваля. Agency 10 е €399/година върху 10
//    сървъра. Дефектен клас: едно правило, реализирано на едното от две места.
//
// 2) ТАРИФА ОТ ГРЕШЕН ИЗТОЧНИК. `planFromInvoice` взимаше ПЪРВИЯ ред с цена, но
//    прорационната фактура при смяна на план носи редове за ДВЕ цени — кредит
//    по старата и такса по новата — без правило кой е меродавен. Клиент, качил
//    се Premium → White-label, можеше да получи обратно premium. Живият
//    абонамент носи текущите items, значи той е истината.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fake";
process.env.FRONTEND_URL = "https://supreme.example.com";
process.env.STRIPE_PRICE_PREMIUM_MONTH = "price_premium_m";
process.env.STRIPE_PRICE_WHITELABEL_MONTH = "price_wl_m";

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

let evt = 0;
/** Прорационна фактура: СТАРАТА цена е първа — точно капанът на `find`. */
const prorationInvoice = (customer) => ({
  id: `in_${++evt}`, customer,
  // API 2026-06-24.dahlia премести id-то на абонамента тук от плоското
  // `invoice.subscription`. Фикстура със старата форма кара `liveSubscription`
  // да получи null и целият клон да се пропусне — тестът щеше да е зелен по
  // грешна причина.
  parent: { subscription_details: { subscription: "sub_1" } },
  lines: { data: [
    { pricing: { price_details: { price: "price_premium_m" } }, amount: -299 }, // кредит, стар план
    { pricing: { price_details: { price: "price_wl_m" } },      amount: 999 },  // такса, НОВ план
  ] },
});

function fire(customer) {
  const event = { id: `evt_${evt}`, type: "invoice.paid", data: { object: prorationInvoice(customer) } };
  stripeInstance.webhooks.constructEvent.mockReturnValue(event);
  return request(app).post("/api/stripe/webhook").set("stripe-signature", "t=1,v1=fake").send({});
}

const liveSub = (priceId) => ({
  id: "sub_1", status: "active",
  items: { data: [{ price: { id: priceId }, current_period_end: Math.floor(Date.now() / 1000) + 86400 }] },
});

beforeEach(() => {
  vi.clearAllMocks();
  stripeInstance.webhooks.constructEvent.mockImplementation((raw) => raw);
  prismaMock.agency.findFirst.mockResolvedValue(null);
  prismaMock.server.findFirst.mockResolvedValue(null);
});

describe("агенцията НЕ се възкресява от закъсняло плащане", () => {
  beforeEach(() => {
    prismaMock.agency.findFirst.mockResolvedValue({
      id: "ag1", stripeCustomerId: "cus_ag", active: false, stripeStatus: "refunded",
    });
  });

  it("мъртъв абонамент → нула провизиране", async () => {
    stripeInstance.subscriptions.retrieve.mockResolvedValue({ id: "sub_1", status: "canceled" });
    const res = await fire("cus_ag");
    expect(res.status).toBe(200);
    expect(prismaMock.agency.update).not.toHaveBeenCalled();
  });

  it("изтрит абонамент → нула провизиране и НУЛА безкраен ретрай", async () => {
    // `resource_missing` е окончателен отговор, не мрежов проблем: хвърлянето
    // връщаше 500, Stripe ретрайваше с дни и всеки опит раждаше нов инцидент.
    stripeInstance.subscriptions.retrieve.mockRejectedValue(
      Object.assign(new Error("No such subscription"), { code: "resource_missing" }),
    );
    const res = await fire("cus_ag");
    expect(res.status).toBe(200);
    expect(prismaMock.agency.update).not.toHaveBeenCalled();
  });

  it("МРЕЖОВА грешка обаче пак дава 500 — там ретраят е желан", async () => {
    stripeInstance.subscriptions.retrieve.mockRejectedValue(new Error("ECONNRESET"));
    const res = await fire("cus_ag");
    expect(res.status).toBe(500);
    expect(prismaMock.agency.update).not.toHaveBeenCalled();
  });

  it("ЖИВ абонамент → провизира се (истинско подновяване минава)", async () => {
    stripeInstance.subscriptions.retrieve.mockResolvedValue(liveSub("price_wl_m"));
    const res = await fire("cus_ag");
    expect(res.status).toBe(200);
    expect(prismaMock.agency.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ active: true }) }),
    );
  });

  it("гардът е СИМЕТРИЧЕН — същата проверка стои и на сървърния път", () => {
    // Асиметрията беше самият дефект; един `liveSubscription` е недостатъчен.
    const src = new URL("../routes/stripe.js", import.meta.url);
    const code = require("node:fs").readFileSync(src, "utf-8")
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    const at = code.indexOf('case "invoice.paid"');
    const handler = code.slice(at, code.indexOf('case "', at + 10) || undefined);
    expect((handler.match(/liveSubscription\(/g) || []).length,
      "invoice.paid има само един гард за жив абонамент — агенция и сървър трябва да са симетрични",
    ).toBeGreaterThanOrEqual(2);
  });
});

describe("тарифата идва от живия абонамент, не от прорационната фактура", () => {
  beforeEach(() => {
    prismaMock.server.findFirst.mockResolvedValue({
      id: "s1", stripeCustomerId: "cus_s", plan: "premium", premiumSince: new Date(),
    });
  });

  it("качване Premium → White-label записва WHITE-LABEL", async () => {
    // Фактурата носи стария premium ПЪРВИ; абонаментът вече е white-label.
    stripeInstance.subscriptions.retrieve.mockResolvedValue(liveSub("price_wl_m"));
    await fire("cus_s");
    const data = prismaMock.server.update.mock.calls.at(-1)?.[0]?.data;
    expect(data.plan).toBe("whitelabel");
  });

  it("обикновено подновяване пази тарифата на абонамента", async () => {
    stripeInstance.subscriptions.retrieve.mockResolvedValue(liveSub("price_premium_m"));
    await fire("cus_s");
    const data = prismaMock.server.update.mock.calls.at(-1)?.[0]?.data;
    expect(data.plan).toBe("premium");
    expect(data.isPremium).toBe(true);
  });

  it("непозната цена в абонамента → пада на фактурата, не на нищо", async () => {
    stripeInstance.subscriptions.retrieve.mockResolvedValue(liveSub("price_неизвестна"));
    await fire("cus_s");
    const data = prismaMock.server.update.mock.calls.at(-1)?.[0]?.data;
    // Фактурата пак дава разпознаваема цена — достъпът и етикетът остават.
    expect(data.isPremium).toBe(true);
    expect(data.plan).toBeDefined();
  });
});
