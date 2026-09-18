// backend/src/__tests__/gracePlanEscalation.test.js
// Гратисът не бива да ПОВИШАВА тарифа. Никога.
//
// ДЕФЕКТЪТ (червен екип, 07.08.2026): `getServerTier` превеждаше суровото
// `isPremium: true` направо в „whitelabel“, и този клон стоеше ПЪРВИ — преди
// гратиса и преди агенцията. Само че v40 нарочно записва точно това състояние:
// при отмяна с гратис `routes/stripe.js:839-840` пише `isPremium: true` +
// `plan: "free"`. Резултат: ВСЕКИ отменен Premium клиент получаваше
// White-label — тарифа с цял ранг отгоре, за която не е платил, и то тъкмо
// докато си тръгва. White-label не е козметика: клиентът пуска СВОЙ бот токен.
//
// Второто лице на същия дефект: out-of-order webhook. `syncServerPaidFlag`
// вдига `isPremium` по жив абонамент ПРЕДИ `plan` да е записан — пак „free“ +
// „isPremium“, пак безплатен White-label.
//
// „Наследени“ редове тук няма: миграция v27 попълни `plan='whitelabel'` за
// всеки `isPremium=true` ред, затова fallback-ът вече е ПОСЛЕДЕН и пада на
// НАЙ-НИСКАТА платена тарифа — при съмнение по-малкото, не по-голямото.
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map();
const prismaMock = {
  server: {
    findUnique: vi.fn(async ({ where }) => store.get(where.id) ?? null),
    findMany: vi.fn(async () => []),
    update: vi.fn(async ({ where, data }) => Object.assign(store.get(where.id), data)),
  },
};
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const { getServerTier, syncServerPaidFlag } = await import("../lib/premium.js");

const DAY = 24 * 60 * 60 * 1000;
const row = (o) => ({
  agency: null, agencyId: null, trialEndsAt: null, accessUntil: null,
  gracePlan: null, planSource: null, stripeStatus: null, stripeSubscriptionId: null,
  isPremium: false, plan: "free", archiveRetentionDays: null, ...o,
});

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe("отмяна с гратис връща ПЛАТЕНАТА тарифа, не по-висока", () => {
  it("отменен Premium → premium през гратиса, БЕЗ white-label", async () => {
    // Точното състояние, което routes/stripe.js записва за premium клиент.
    store.set("s", row({
      id: "s", isPremium: true, plan: "free", stripeStatus: "canceled",
      accessUntil: new Date(Date.now() + 29 * DAY), gracePlan: "premium",
    }));
    const t = await getServerTier("s");
    expect(t.plan).toBe("premium");
    expect(t.hasWhiteLabel).toBe(false);
    expect(t.isPremium).toBe(true); // достъпът си ОСТАВА — платил е периода
  });

  it("отменен White-label → white-label през гратиса (не го сваляме)", async () => {
    store.set("s", row({
      id: "s", isPremium: true, plan: "free", stripeStatus: "canceled",
      accessUntil: new Date(Date.now() + 10 * DAY), gracePlan: "whitelabel",
    }));
    const t = await getServerTier("s");
    expect(t.plan).toBe("whitelabel");
    expect(t.hasWhiteLabel).toBe(true);
  });

  it("изтекъл гратис → нула достъп, независимо от gracePlan", async () => {
    store.set("s", row({
      id: "s", isPremium: false, plan: "free", stripeStatus: "canceled",
      accessUntil: new Date(Date.now() - DAY), gracePlan: "whitelabel",
    }));
    const t = await getServerTier("s");
    expect(t.plan).toBe("free");
    expect(t.isPremium).toBe(false);
  });

  it("refund/chargeback → двете колони нулеви → нула достъп в същата секунда", async () => {
    store.set("s", row({ id: "s", isPremium: false, plan: "free", stripeStatus: "refunded" }));
    const t = await getServerTier("s");
    expect(t.isPremium).toBe(false);
    expect(t.hasWhiteLabel).toBe(false);
  });
});

describe("сурово isPremium никога не подарява White-label", () => {
  it("out-of-order webhook: жив абонамент без записан plan → premium", async () => {
    store.set("o", row({
      id: "o", isPremium: false, plan: "free", stripeStatus: "active",
      stripeSubscriptionId: "sub_1", planSource: "stripe",
    }));
    await syncServerPaidFlag("o");
    expect(store.get("o").isPremium).toBe(true); // жив абонамент → платено
    const t = await getServerTier("o");
    expect(t.plan).toBe("premium");
    expect(t.hasWhiteLabel).toBe(false); // но НЕ най-горната тарифа
  });

  it("гол isPremium без нито един друг сигнал също дава само premium", async () => {
    store.set("x", row({ id: "x", isPremium: true, plan: "free" }));
    const t = await getServerTier("x");
    expect(t.plan).toBe("premium");
  });
});

describe("гратисът не СВАЛЯ жив по-висок план", () => {
  it("отменил premium, после купил white-label → white-label", async () => {
    store.set("s", row({
      id: "s", isPremium: true, plan: "whitelabel", planSource: "stripe",
      accessUntil: new Date(Date.now() + 5 * DAY), gracePlan: "premium",
    }));
    const t = await getServerTier("s");
    expect(t.plan).toBe("whitelabel");
  });

  it("агенцийно място бие по-нисък личен гратис", async () => {
    store.set("s", row({
      id: "s", isPremium: true, plan: "free", agencyId: "ag1",
      agency: { plan: "agency10", active: true, seatLimit: 10 },
      accessUntil: new Date(Date.now() + 5 * DAY), gracePlan: "premium",
    }));
    const t = await getServerTier("s");
    expect(t.plan).toBe("agency10");
  });
});
