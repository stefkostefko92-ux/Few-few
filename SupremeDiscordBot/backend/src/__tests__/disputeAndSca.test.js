// backend/src/__tests__/disputeAndSca.test.js
// Двете събития, които изобщо не слушахме.
//
// 1) `charge.dispute.closed` — слушахме само `created`. Значи при спор, решен в
//    НАША полза, парите се връщат при нас, а достъпът на клиента остава спрян
//    завинаги: платил е и няма услуга, а нищо в системата не го поправя само.
//
// 2) `invoice.payment_action_required` — Stripe праща ТОВА, а не
//    `payment_failed`, когато картата иска само 3-D Secure потвърждение.
//    Известието висеше само на `payment_failed`, значи мълчахме точно когато на
//    клиента му трябва едно натискане — и след няколко дни абонаментът падаше
//    „необяснимо“. (Продавача, одит 07.08.2026)
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

const dmUser = vi.fn();
vi.mock("../services/botNotifier.js", () => ({
  notifyBot: vi.fn(), dmUser: (...a) => dmUser(...a), reconcileWhitelabel: vi.fn(),
}));

const stripeRouter = (await import("../routes/stripe.js")).default;
const app = express();
app.use(express.json());
app.use("/api/stripe", stripeRouter);

const post = (event) => {
  stripeInstance.webhooks.constructEvent.mockReturnValue(event);
  return request(app).post("/api/stripe/webhook").set("stripe-signature", "t=1,v1=fake").send({});
};

let evt = 0;
const liveSub = { id: "sub_1", status: "active", items: { data: [{ price: { id: "price_pm" } }] } };

beforeEach(() => {
  vi.clearAllMocks();
  stripeInstance.webhooks.constructEvent.mockImplementation((raw) => raw);
  prismaMock.agency.findFirst.mockResolvedValue(null);
});

const disputeClosed = (status, over = {}) => ({
  id: `evt_dc_${++evt}`, type: "charge.dispute.closed",
  data: { object: { id: "dp_1", status, charge: "ch_1", customer: "cus_1", ...over } },
});

describe("спор, решен в НАША полза, връща достъпа", () => {
  beforeEach(() => {
    prismaMock.server.findFirst.mockResolvedValue({
      id: "s1", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1",
      isPremium: false, plan: "free", stripeStatus: "disputed", ownerId: "owner1",
    });
    stripeInstance.subscriptions.retrieve.mockResolvedValue(liveSub);
  });

  it("`won` + жив абонамент → достъпът се възстановява с вярната тарифа", async () => {
    const res = await post(disputeClosed("won"));
    expect(res.status).toBe(200);
    const data = prismaMock.server.update.mock.calls.at(-1)?.[0]?.data;
    expect(data).toMatchObject({ isPremium: true, plan: "premium", planSource: "stripe" });
  });

  it("оставя одитна следа — възстановяване без следа е невъзможно за разследване", async () => {
    await post(disputeClosed("won"));
    const log = prismaMock.auditLog.create.mock.calls.at(-1)?.[0]?.data;
    expect(log?.action).toBe("PREMIUM_RESTORED_DISPUTE_WON");
    expect(log?.metadata?.disputeId).toBe("dp_1");
  });

  it("`lost` → нищо не се пипа, парите наистина си отиват", async () => {
    const res = await post(disputeClosed("lost"));
    expect(res.status).toBe(200);
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });

  it("`warning_closed` също не възстановява", async () => {
    await post(disputeClosed("warning_closed"));
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });

  it("спечелен спор, но МЪРТЪВ абонамент → НЕ възкресява стар клиент", async () => {
    stripeInstance.subscriptions.retrieve.mockResolvedValue({ id: "sub_1", status: "canceled" });
    await post(disputeClosed("won"));
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });

  it("липсващ customer се вади от charge-а, не се отказваме тихо", async () => {
    stripeInstance.charges.retrieve.mockResolvedValue({ id: "ch_1", customer: "cus_1" });
    await post(disputeClosed("won", { customer: null }));
    expect(stripeInstance.charges.retrieve).toHaveBeenCalledWith("ch_1");
    expect(prismaMock.server.update).toHaveBeenCalled();
  });
});

describe("SCA при подновяване стига до клиента", () => {
  const scaEvent = (over = {}) => ({
    id: `evt_sca_${++evt}`, type: "invoice.payment_action_required",
    data: { object: { id: "in_1", customer: "cus_1", hosted_invoice_url: "https://pay.stripe.com/x", ...over } },
  });

  beforeEach(() => {
    prismaMock.server.findFirst.mockResolvedValue({
      id: "s1", name: "Моят сървър", stripeCustomerId: "cus_1", ownerId: "owner1",
      isPremium: true, plan: "premium",
    });
  });

  it("собственикът получава DM, който води към НАШЕТО табло", async () => {
    const res = await post(scaEvent());
    expect(res.status).toBe(200);
    const [uid, embed] = dmUser.mock.calls.at(-1);
    expect(uid).toBe("owner1");
    expect(embed.description).toContain("/dashboard/s1/premium");
  });

  it("НЕ праща адреса на Stripe — препратен DM би дал плащане без логин", async () => {
    await post(scaEvent());
    const embed = dmUser.mock.calls.at(-1)[1];
    expect(JSON.stringify(embed)).not.toContain("pay.stripe.com");
  });

  it("достъпът НЕ се пипа — това не е пропуснато плащане", async () => {
    await post(scaEvent());
    // Свалянето тук би било наказание за банкова процедура.
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });

  it("оставя одитна следа с фактурата", async () => {
    await post(scaEvent());
    const log = prismaMock.auditLog.create.mock.calls.at(-1)?.[0]?.data;
    expect(log?.action).toBe("PAYMENT_ACTION_REQUIRED");
    expect(log?.metadata?.invoiceId).toBe("in_1");
  });

  it("без връзка от Stripe пак известява, вместо да мълчи", async () => {
    await post(scaEvent({ hosted_invoice_url: null }));
    expect(dmUser).toHaveBeenCalled();
  });

  it("непознат клиент → 200 без страничен ефект (Stripe не бива да ретрайва)", async () => {
    prismaMock.server.findFirst.mockResolvedValue(null);
    const res = await post(scaEvent());
    expect(res.status).toBe(200);
    expect(dmUser).not.toHaveBeenCalled();
  });
});
