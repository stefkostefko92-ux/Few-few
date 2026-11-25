import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Админ дебит и clawback при refund: атомарни, с пазач „не под 0“, с ред в регистъра.

interface FakeUser {
  id: string;
  displayName: string;
  role: string;
  chips: bigint;
  gems: number;
}
interface FakePurchase {
  id: string;
  userId: string;
  stripeId: string;
  status: string;
  grantedGems: number;
  grantedChips: number;
  product: { sku: string; gems: number | null; chips: number | null } | null;
}

const users = new Map<string, FakeUser>();
const purchases = new Map<string, FakePurchase>();
const ledger: Array<Record<string, unknown>> = [];
/** Еднократна „чужда“ промяна на портфейла веднага след четене на реда (надпревара). */
let afterRead: { id: string; apply: (u: FakeUser) => void } | null = null;

type Where = Record<string, unknown>;
function matches(row: Record<string, unknown>, where: Where): boolean {
  for (const [k, cond] of Object.entries(where)) {
    const v = row[k];
    if (cond && typeof cond === "object") {
      const c = cond as { gte?: number | bigint; in?: unknown[] };
      if (c.gte !== undefined && !((v as number | bigint) >= c.gte)) return false;
      if (c.in !== undefined && !c.in.includes(v)) return false;
    } else if (v !== cond) {
      return false;
    }
  }
  return true;
}
function applyData(row: Record<string, unknown>, data: Where): void {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && ("increment" in v || "decrement" in v)) {
      const d = v as { increment?: number | bigint; decrement?: number | bigint };
      const cur = row[k];
      if (typeof cur === "bigint") row[k] = cur + BigInt(d.increment ?? 0) - BigInt(d.decrement ?? 0);
      else row[k] = (cur as number) + Number(d.increment ?? 0) - Number(d.decrement ?? 0);
    } else {
      row[k] = v;
    }
  }
}

vi.mock("@aso/db", () => {
  const user = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const u = users.get(where.id);
      if (!u) return null;
      const snapshot = { ...u, banned: false, banReason: null, banUntil: null, vipTier: "NONE", email: "x@y.bg", xp: 0 };
      if (afterRead && afterRead.id === where.id) {
        afterRead.apply(u);
        afterRead = null;
      }
      return snapshot;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Where }) => {
      const u = users.get(where.id)!;
      applyData(u as unknown as Record<string, unknown>, data);
      return { ...u, banned: false, banReason: null, banUntil: null, vipTier: "NONE", email: "x@y.bg", xp: 0 };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Where }) => {
      const u = users.get(where.id as string);
      if (!u) return { count: 0 };
      const { id: _id, ...rest } = where;
      if (!matches(u as unknown as Record<string, unknown>, rest)) return { count: 0 };
      applyData(u as unknown as Record<string, unknown>, data);
      return { count: 1 };
    }),
  };
  const purchase = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const p = purchases.get(where.id);
      return p ? { ...p } : null;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Where }) => {
      const p = purchases.get(where.id)!;
      applyData(p as unknown as Record<string, unknown>, data);
      return { ...p };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Where }) => {
      let count = 0;
      for (const p of purchases.values()) {
        if (!matches(p as unknown as Record<string, unknown>, where)) continue;
        applyData(p as unknown as Record<string, unknown>, data);
        count++;
      }
      return { count };
    }),
  };
  const client: Record<string, unknown> = {
    user,
    purchase,
    adminAudit: { create: vi.fn(async () => ({})) },
    currencyLedger: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        ledger.push(data);
        return data;
      }),
    },
  };
  client.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(client));
  class FakeKnownRequestError extends Error {
    code = "P0000";
  }
  return {
    prisma: client,
    Prisma: { PrismaClientKnownRequestError: FakeKnownRequestError },
    AuthTokenType: { EMAIL_VERIFY: "EMAIL_VERIFY", PASSWORD_RESET: "PASSWORD_RESET" },
    OAuthProvider: { GOOGLE: "GOOGLE", FACEBOOK: "FACEBOOK" },
  };
});

vi.mock("../redis.js", () => ({
  redis: {
    exists: vi.fn(async () => 0),
    get: vi.fn(async () => null),
    set: vi.fn(async () => "OK"),
    del: vi.fn(async () => 1),
    call: vi.fn(async () => null),
  },
  pingRedis: vi.fn(async () => true),
}));
vi.mock("../email/mailer.js", () => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock("../integrations/discord.js", () => ({
  discordEnabled: vi.fn(() => false),
  notifyAdminAction: vi.fn(),
  notifyBroadcast: vi.fn(),
  sendTest: vi.fn(async () => false),
  notifyRegistration: vi.fn(),
  notifyPurchase: vi.fn(),
  notifyVip: vi.fn(),
  notifyFlag: vi.fn(),
}));

let onRefund: () => void = () => undefined;
const refundsCreate = vi.fn(async (_p: unknown, _o: unknown) => {
  onRefund();
  return {};
});
vi.mock("../economy/stripe.js", () => ({
  stripeEnabled: () => true,
  getStripe: () => ({
    checkout: { sessions: { retrieve: vi.fn(async () => ({ payment_intent: "pi_1" })) } },
    refunds: { create: refundsCreate },
  }),
}));
/** Грешка с формата на Stripe SDK (`type` + `code`). */
const stripeErr = (type: string, code?: string) => Object.assign(new Error(code ?? type), { type, code });

const { createApp } = await import("../app.js");
const { signAccessToken } = await import("../auth/tokens.js");
const app = createApp();
const ORIGIN = "http://localhost:4502";
const asAdmin = () => [`aso_at=${signAccessToken({ sub: "admin", role: "ADMIN", locale: "bg" })}`];

const patch = (id: string, body: object) =>
  request(app).patch(`/api/admin/users/${id}`).set("Origin", ORIGIN).set("Cookie", asAdmin()).send(body);
const refund = (id: string, body: object) =>
  request(app).post(`/api/admin/orders/${id}/refund`).set("Origin", ORIGIN).set("Cookie", asAdmin()).send(body);

beforeEach(() => {
  users.clear();
  purchases.clear();
  ledger.length = 0;
  afterRead = null;
  onRefund = () => undefined;
  users.set("admin", { id: "admin", displayName: "Админ", role: "ADMIN", chips: 0n, gems: 0 });
  users.set("p1", { id: "p1", displayName: "Играч", role: "PLAYER", chips: 1000n, gems: 100 });
});
afterEach(() => vi.clearAllMocks());

describe("PATCH /api/admin/users/:id — атомарен дебит", () => {
  it("дебитът не изтрива конкурентен кредит, дошъл между четенето и записа", async () => {
    // Webhook кредит (+500 чипа, +50 камъка) каца точно след като админът прочете играча.
    afterRead = {
      id: "p1",
      apply: (u) => {
        u.chips += 500n;
        u.gems += 50;
      },
    };
    const res = await patch("p1", { grantChips: -100, grantGems: -10, note: "корекция" });
    expect(res.status).toBe(200);
    expect(users.get("p1")!.chips).toBe(1400n);
    expect(users.get("p1")!.gems).toBe(140);
  });

  it("дебит над баланса спира на 0 и записва недостига в регистъра", async () => {
    const res = await patch("p1", { grantChips: -1500, note: "корекция след измама" });
    expect(res.status).toBe(200);
    expect(users.get("p1")!.chips).toBe(0n);
    expect(ledger).toContainEqual(
      expect.objectContaining({ userId: "p1", currency: "CHIPS", delta: -1000n, shortfall: 500n, reason: "ADMIN" }),
    );
  });

  it("кредитът се записва в регистъра с причина ADMIN", async () => {
    await patch("p1", { grantGems: 5, note: "компенсация" });
    expect(users.get("p1")!.gems).toBe(105);
    expect(ledger).toContainEqual(expect.objectContaining({ currency: "GEMS", delta: 5n, reason: "ADMIN" }));
  });
});

describe("POST /api/admin/orders/:id/refund — clawback", () => {
  const seed = (over: Partial<FakePurchase> = {}) =>
    purchases.set("pur_1", {
      id: "pur_1",
      userId: "p1",
      stripeId: "cs_1",
      status: "completed",
      grantedGems: 100,
      grantedChips: 0,
      // Админът е вдигнал наградата след покупката — clawback взема платеното, не текущото.
      product: { sku: "gems_small", gems: 500, chips: null },
      ...over,
    });

  it("никога под 0: конкурентно харчене между четене и намаляване не прави баланса отрицателен", async () => {
    seed();
    afterRead = { id: "p1", apply: (u) => (u.gems -= 80) };
    const res = await refund("pur_1", { clawback: true });
    expect(res.status).toBe(200);
    const gems = users.get("p1")!.gems;
    expect(gems).toBeGreaterThanOrEqual(0);
    // Запазване: начално 100 − изхарчено − взето = остатък (харченето се случва
    // само ако кодът изобщо е прочел реда — атомарният път може и да не чете).
    const spent = afterRead === null ? 80 : 0;
    expect(100 - spent - res.body.clawedGems).toBe(gems);
  });

  it("взема реално начисленото по покупката (grantedGems), не текущия продукт", async () => {
    seed();
    users.get("p1")!.gems = 700;
    const res = await refund("pur_1", { clawback: true });
    expect(res.body.clawedGems).toBe(100);
    expect(users.get("p1")!.gems).toBe(600);
    expect(purchases.get("pur_1")!.status).toBe("refunded");
    expect(ledger).toContainEqual(
      expect.objectContaining({ currency: "GEMS", delta: -100n, reason: "CLAWBACK", refId: "pur_1" }),
    );
  });

  it("недостиг: взема наличното и записва колко не е взето", async () => {
    seed();
    users.get("p1")!.gems = 30;
    const res = await refund("pur_1", { clawback: true });
    expect(res.body.clawedGems).toBe(30);
    expect(users.get("p1")!.gems).toBe(0);
    expect(ledger).toContainEqual(expect.objectContaining({ currency: "GEMS", delta: -30n, shortfall: 70n }));
  });

  it("webhook-ът е взел обратно междувременно → без втори clawback", async () => {
    seed();
    users.get("p1")!.gems = 200;
    // charge.refunded webhook каца между refunds.create и локалната транзакция.
    onRefund = () => {
      purchases.get("pur_1")!.status = "refunded";
      users.get("p1")!.gems -= 100;
    };
    const res = await refund("pur_1", { clawback: true });
    expect(res.status).toBe(200);
    expect(res.body.clawedGems).toBe(0);
    expect(users.get("p1")!.gems).toBe(100);
  });
});

describe("POST /api/admin/orders/:id/refund — заседнало „refunding“", () => {
  const seed = (over: Partial<FakePurchase> = {}) =>
    purchases.set("pur_1", {
      id: "pur_1",
      userId: "p1",
      stripeId: "cs_1",
      status: "completed",
      grantedGems: 100,
      grantedChips: 0,
      product: { sku: "gems_small", gems: 100, chips: null },
      ...over,
    });

  it("заседнала в „refunding“ → повторният опит продължава със същия ключ и приключва веднъж", async () => {
    seed({ status: "refunding" });
    users.get("p1")!.gems = 300;
    const res = await refund("pur_1", { clawback: true });
    expect(res.status).toBe(200);
    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_1" }, { idempotencyKey: "refund:pur_1" });
    expect(purchases.get("pur_1")!.status).toBe("refunded");
    expect(users.get("p1")!.gems).toBe(200);

    // Трети опит: вече върната — без втори clawback.
    const again = await refund("pur_1", { clawback: true });
    expect(again.status).toBe(400);
    expect(users.get("p1")!.gems).toBe(200);
    expect(ledger.filter((l) => l.reason === "CLAWBACK")).toHaveLength(1);
  });

  it("срив на базата СЛЕД успешния refund → остава „refunding“; повторният опит приключва", async () => {
    seed();
    const { prisma } = await import("@aso/db");
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error("db down") as never);
    const first = await refund("pur_1", { clawback: true });
    expect(first.status).toBe(500);
    expect(purchases.get("pur_1")!.status).toBe("refunding");

    const retry = await refund("pur_1", { clawback: true });
    expect(retry.status).toBe(200);
    expect(purchases.get("pur_1")!.status).toBe("refunded");
    expect(retry.body.clawedGems).toBe(100);
    expect(refundsCreate).toHaveBeenCalledTimes(2);
    for (const call of refundsCreate.mock.calls) expect(call[1]).toEqual({ idempotencyKey: "refund:pur_1" });
  });

  it("ключът е изтрит след 24 ч → Stripe казва charge_already_refunded → приема се за върнато", async () => {
    seed({ status: "refunding" });
    refundsCreate.mockRejectedValueOnce(stripeErr("StripeInvalidRequestError", "charge_already_refunded"));
    const res = await refund("pur_1", { clawback: false });
    expect(res.status).toBe(200);
    expect(purchases.get("pur_1")!.status).toBe("refunded");
  });

  it("неясна грешка (връзка) при refund → НЕ се връща към completed (парите може да са върнати)", async () => {
    seed();
    refundsCreate.mockRejectedValueOnce(stripeErr("StripeConnectionError"));
    const res = await refund("pur_1", { clawback: true });
    expect(res.status).toBe(502);
    expect(purchases.get("pur_1")!.status).toBe("refunding");
    expect(users.get("p1")!.gems).toBe(100);
  });

  it("категоричен отказ на Stripe (спорно плащане) → връща се към completed", async () => {
    seed();
    refundsCreate.mockRejectedValueOnce(stripeErr("StripeInvalidRequestError", "charge_disputed"));
    const res = await refund("pur_1", { clawback: true });
    expect(res.status).toBe(400);
    expect(purchases.get("pur_1")!.status).toBe("completed");
  });
});
