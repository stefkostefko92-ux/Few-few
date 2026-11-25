import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Stripe must look configured so the webhook route doesn't short-circuit to 503.
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_dummy";

// ── In-memory ProcessedEvent + Purchase tables + a transaction that runs the callback ─
const processedEvents = new Map<string, { id: string; type: string }>();
interface FakePurchase {
  id?: string;
  stripeId: string;
  userId: string;
  productId: string | null;
  sku?: string | null;
  status: string;
  amountCents: number;
  currency: string;
  paymentIntentId?: string | null;
  grantedGems?: number;
  grantedChips?: number;
}
const purchases = new Map<string, FakePurchase>();
// Портфейлите (за clawback) и регистърът на движенията.
const wallets = new Map<string, { gems: number; chips: bigint }>();
const ledger: Array<Record<string, unknown>> = [];
// Изкуствена пауза при четене: показва надпревара „прочети → начисли“ без заключване.
const tick = () => new Promise((r) => setTimeout(r, 5));
let afterOuterRead: (() => void) | null = null;

type Where = Record<string, unknown>;
/** Условие като в Postgres: точна стойност, `gte` или `in` — проверено атомарно. */
function matches(row: Record<string, unknown>, where: Where): boolean {
  for (const [k, cond] of Object.entries(where)) {
    const v = row[k];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { gte?: number | bigint; in?: unknown[] };
      if (c.gte !== undefined && !(v !== undefined && (v as number | bigint) >= c.gte)) return false;
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

function makeTx() {
  return {
    processedEvent: {
      create: vi.fn(async ({ data }: { data: { id: string; type: string } }) => {
        if (processedEvents.has(data.id)) {
          // Mirror the DB unique-constraint: a second create for the same id fails.
          throw new Error("duplicate processed event");
        }
        processedEvents.set(data.id, data);
        return data;
      }),
    },
    user: {
      // Кредит (`credit` в @aso/db/ledger) — инкремент на портфейла.
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Where }) => {
        const w = wallets.get(where.id);
        if (w) applyData(w as unknown as Record<string, unknown>, data);
        return {};
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const w = wallets.get(where.id);
        return w ? { id: where.id, deletedAt: null, ...w } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: Where }) => {
        const w = wallets.get(where.id as string);
        if (!w) return { count: 0 };
        const { id: _id, ...rest } = where;
        if (!matches(w as unknown as Record<string, unknown>, rest)) return { count: 0 };
        applyData(w as unknown as Record<string, unknown>, data);
        return { count: 1 };
      }),
    },
    currencyLedger: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        ledger.push(data);
        return data;
      }),
      findMany: vi.fn(async ({ where }: { where: Where }) =>
        ledger.filter((l) => matches(l, where)).map((l) => ({ ...l })),
      ),
    },
    purchase: {
      findUnique: vi.fn(async ({ where }: { where: { stripeId?: string; paymentIntentId?: string; id?: string } }) => {
        await tick();
        if (where.stripeId) return purchases.get(where.stripeId) ?? null;
        for (const p of purchases.values()) {
          if (where.paymentIntentId && p.paymentIntentId === where.paymentIntentId) return { ...p };
          if (where.id && p.id === where.id) return { ...p };
        }
        return null;
      }),
      // INSERT … ON CONFLICT DO NOTHING — атомарно.
      createMany: vi.fn(async ({ data }: { data: FakePurchase[]; skipDuplicates?: boolean }) => {
        let count = 0;
        for (const row of data) {
          if (purchases.has(row.stripeId)) continue;
          purchases.set(row.stripeId, { id: `pur_${row.stripeId}`, ...row });
          count++;
        }
        return { count };
      }),
      // UPDATE … WHERE <условие> — атомарно (редът се заключва).
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: Where }) => {
        let count = 0;
        for (const p of purchases.values()) {
          if (!matches(p as unknown as Record<string, unknown>, where)) continue;
          applyData(p as unknown as Record<string, unknown>, data);
          count++;
        }
        return { count };
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { stripeId: string };
          create: FakePurchase;
          update: Partial<FakePurchase>;
        }) => {
          const prev = purchases.get(where.stripeId);
          const row = prev ? { ...prev, ...update } : { ...create };
          purchases.set(where.stripeId, row);
          return row;
        },
      ),
    },
    inventoryItem: { upsert: vi.fn(async () => ({})) },
    subscription: { upsert: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({})) },
  };
}

const prismaMock = {
  processedEvent: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      processedEvents.get(where.id) ?? null,
    ),
  },
  user: { findUnique: vi.fn(async () => ({ displayName: "Тестер" })) },
  // Продуктът може да е деактивиран — webhook-ът не бива да зависи от `active`.
  product: { findUnique: vi.fn(async () => ({ id: "prod_1", active: false })) },
  // Четене извън транзакцията (покупка по PaymentIntent/сесия за clawback).
  purchase: {
    findUnique: vi.fn(async (args: { where: { stripeId?: string; paymentIntentId?: string } }) => {
      const row = await makeTx().purchase.findUnique(args);
      // „Чужда“ транзакция, комитната веднага СЛЕД това четене (остаряла снимка).
      if (afterOuterRead) {
        const fn = afterOuterRead;
        afterOuterRead = null;
        fn();
      }
      return row;
    }),
  },
  // $transaction runs the supplied callback with a fresh tx delegate; при грешка
  // връща таблиците както преди (rollback като в Postgres).
  $transaction: vi.fn(async (cb: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => {
    const saved = {
      purchases: new Map([...purchases].map(([k, v]) => [k, { ...v }])),
      wallets: new Map([...wallets].map(([k, v]) => [k, { ...v }])),
      ledger: [...ledger],
    };
    try {
      return await cb(makeTx());
    } catch (err) {
      purchases.clear();
      for (const [k, v] of saved.purchases) purchases.set(k, v);
      wallets.clear();
      for (const [k, v] of saved.wallets) wallets.set(k, v);
      ledger.length = 0;
      ledger.push(...saved.ledger);
      throw err;
    }
  }),
};

vi.mock("@aso/db", () => ({ prisma: prismaMock }));

// Stripe signature verification: return whatever event we staged.
let stagedEvent: unknown = null;
const constructEvent = vi.fn(() => stagedEvent);
let stagedSub: unknown = {};
// Резервен път за стари покупки без записан PaymentIntent: сесия по payment_intent.
const sessionsList = vi.fn(async (_q: { payment_intent: string }) => ({ data: [] as Array<{ id: string }> }));
vi.mock("../economy/stripe.js", () => ({
  getStripe: () => ({
    webhooks: { constructEvent },
    subscriptions: { retrieve: vi.fn(async () => stagedSub) },
    checkout: { sessions: { list: sessionsList } },
  }),
  stripeEnabled: () => true,
}));

// Count how often money actually turns into credit.
const grantProduct = vi.fn(async () => undefined);
const grantVipStipend = vi.fn(async () => undefined);
const applyVip = vi.fn(async () => undefined);
const clearVip = vi.fn(async () => undefined);
vi.mock("../economy/grants.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../economy/grants.js")>();
  return { grantProduct, grantVipStipend, applyVip, clearVip, snapshotFromMetadata: real.snapshotFromMetadata };
});

vi.mock("../integrations/discord.js", () => ({
  notifyRegistration: vi.fn(),
  notifyPurchase: vi.fn(),
  notifyVip: vi.fn(),
}));

const { createApp } = await import("../app.js");
const app = createApp();

function checkoutEvent(
  id: string,
  opts: { type?: string; sessionId?: string; paymentStatus?: string; amountTotal?: number | null } = {},
) {
  return {
    id,
    type: opts.type ?? "checkout.session.completed",
    data: {
      object: {
        id: opts.sessionId ?? `cs_${id}`,
        mode: "payment",
        payment_status: opts.paymentStatus ?? "paid",
        amount_total: opts.amountTotal === undefined ? 250 : opts.amountTotal,
        currency: "eur",
        payment_intent: `pi_${opts.sessionId ?? `cs_${id}`}`,
        metadata: {
          userId: "user_1",
          sku: "gems_small",
          snap: "1",
          kind: "GEMS",
          priceCents: "250",
          gems: "120",
          chips: "0",
          cosmeticId: "",
        },
        client_reference_id: null,
      },
    },
  };
}

function deliver(event: unknown) {
  stagedEvent = event;
  return request(app)
    .post("/webhooks/stripe")
    .set("stripe-signature", "t=1,v1=dummy")
    .set("Content-Type", "application/json")
    .send(Buffer.from(JSON.stringify(event)));
}

beforeEach(() => {
  processedEvents.clear();
  purchases.clear();
  wallets.clear();
  ledger.length = 0;
  afterOuterRead = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("stripe webhook idempotency", () => {
  it("credits exactly once when the same event id is delivered twice", async () => {
    const event = checkoutEvent("evt_dup_1");

    const first = await deliver(event);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ received: true });

    const second = await deliver(event);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });

    // The credit path ran exactly once across both deliveries.
    expect(grantProduct).toHaveBeenCalledTimes(1);
    // Начислява се снимката от сесията (платеното), не текущият ред в Product.
    // Последният аргумент е refId за регистъра (session.id).
    expect(grantProduct).toHaveBeenCalledWith(
      expect.anything(),
      "user_1",
      "gems_small",
      { kind: "GEMS", gems: 120, chips: 0, cosmeticId: null },
      "cs_evt_dup_1",
    );
    expect(processedEvents.size).toBe(1);
  });

  it("rejects a webhook with no stripe-signature header (400)", async () => {
    stagedEvent = checkoutEvent("evt_nosig");
    const res = await request(app)
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));
    expect(res.status).toBe(400);
    expect(grantProduct).not.toHaveBeenCalled();
  });

  it("rejects a forged event when signature verification throws (400)", async () => {
    constructEvent.mockImplementationOnce(() => {
      throw new Error("No signatures found matching the expected signature");
    });
    const res = await request(app)
      .post("/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=bad")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));
    expect(res.status).toBe(400);
    expect(grantProduct).not.toHaveBeenCalled();
  });

  it("does NOT mark processed if handling throws, so Stripe can retry", async () => {
    grantProduct.mockRejectedValueOnce(new Error("transient db failure"));
    const event = checkoutEvent("evt_retry");

    const failed = await deliver(event);
    expect(failed.status).toBe(500);
    expect(processedEvents.has("evt_retry")).toBe(false);

    // A retry of the same event now succeeds and credits once.
    const retry = await deliver(event);
    expect(retry.status).toBe(200);
    expect(grantProduct).toHaveBeenCalledTimes(2); // once failed, once succeeded
    expect(processedEvents.has("evt_retry")).toBe(true);
  });
});

describe("checkout.session.* — сума, отложено плащане, деактивиран продукт", () => {
  it("записва реално платената сума (amount_total) и валутата; деактивиран продукт пак се начислява", async () => {
    const res = await deliver(checkoutEvent("evt_amt", { amountTotal: 250 }));
    expect(res.status).toBe(200);
    expect(grantProduct).toHaveBeenCalledTimes(1);
    expect(purchases.get("cs_evt_amt")).toMatchObject({
      status: "completed",
      amountCents: 250,
      currency: "eur",
      productId: "prod_1",
    });
  });

  it("без amount_total пада към снимката на цената от metadata", async () => {
    await deliver(checkoutEvent("evt_noamt", { amountTotal: null }));
    expect(purchases.get("cs_evt_noamt")?.amountCents).toBe(250);
  });

  it("completed с payment_status=unpaid НЕ начислява; async_payment_succeeded начислява веднъж", async () => {
    const pending = await deliver(checkoutEvent("evt_async_1", { sessionId: "cs_async", paymentStatus: "unpaid" }));
    expect(pending.status).toBe(200);
    expect(grantProduct).not.toHaveBeenCalled();
    expect(purchases.get("cs_async")?.status).toBe("pending");

    const ok = await deliver(
      checkoutEvent("evt_async_2", {
        type: "checkout.session.async_payment_succeeded",
        sessionId: "cs_async",
        paymentStatus: "paid",
      }),
    );
    expect(ok.status).toBe(200);
    expect(grantProduct).toHaveBeenCalledTimes(1);
    expect(purchases.get("cs_async")?.status).toBe("completed");
  });

  it("async_payment_failed → failed, без начисляване", async () => {
    await deliver(checkoutEvent("evt_f1", { sessionId: "cs_f", paymentStatus: "unpaid" }));
    await deliver(checkoutEvent("evt_f2", { type: "checkout.session.async_payment_failed", sessionId: "cs_f" }));
    expect(grantProduct).not.toHaveBeenCalled();
    expect(purchases.get("cs_f")?.status).toBe("failed");
  });

  it("бизнес-ключ: друго събитие за вече платена сесия не начислява втори път", async () => {
    await deliver(checkoutEvent("evt_b1", { sessionId: "cs_b" }));
    await deliver(
      checkoutEvent("evt_b2", { type: "checkout.session.async_payment_succeeded", sessionId: "cs_b" }),
    );
    expect(grantProduct).toHaveBeenCalledTimes(1);
  });
});

describe("invoice.paid — VIP ниво", () => {
  it("взима нивото от metadata.vipTier на абонамента", async () => {
    stagedSub = {
      id: "sub_1",
      status: "active",
      metadata: { userId: "user_1", sku: "vip_gold_promo", vipTier: "GOLD" },
      current_period_end: 1_900_000_000,
    };
    const res = await deliver({
      id: "evt_inv_1",
      type: "invoice.paid",
      data: { object: { id: "in_1", subscription: "sub_1", billing_reason: "subscription_create" } },
    });
    expect(res.status).toBe(200);
    expect(applyVip).toHaveBeenCalledWith(expect.anything(), "user_1", "GOLD", new Date(1_900_000_000 * 1000));
  });
});

describe("checkout — една платена сесия = точно едно начисляване", () => {
  it("без ред в Product: completed + async_payment_succeeded начисляват веднъж и покупката се записва", async () => {
    prismaMock.product.findUnique.mockResolvedValue(null as never);
    try {
      await deliver(checkoutEvent("evt_np1", { sessionId: "cs_np" }));
      await deliver(
        checkoutEvent("evt_np2", { type: "checkout.session.async_payment_succeeded", sessionId: "cs_np" }),
      );
      expect(grantProduct).toHaveBeenCalledTimes(1);
      // Покупката е записана и без продукт (снимка по SKU) — ключът е session.id.
      expect(purchases.get("cs_np")).toMatchObject({ status: "completed", productId: null, sku: "gems_small" });
    } finally {
      prismaMock.product.findUnique.mockResolvedValue({ id: "prod_1", active: false } as never);
    }
  });

  it("две паралелни събития за една сесия → само победителят начислява", async () => {
    const [a, b] = await Promise.all([
      deliver(checkoutEvent("evt_race1", { sessionId: "cs_race" })),
      deliver(checkoutEvent("evt_race2", { type: "checkout.session.async_payment_succeeded", sessionId: "cs_race" })),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(grantProduct).toHaveBeenCalledTimes(1);
    expect(purchases.get("cs_race")?.status).toBe("completed");
  });

  it("записва PaymentIntent и реално начисленото (за бъдещ clawback)", async () => {
    grantProduct.mockResolvedValueOnce({ gems: 120, chips: 0, cosmeticId: null } as never);
    await deliver(checkoutEvent("evt_pi", { sessionId: "cs_pi" }));
    expect(purchases.get("cs_pi")).toMatchObject({ paymentIntentId: "pi_cs_pi", grantedGems: 120, grantedChips: 0 });
  });
});

describe("charge.refunded / charge.dispute.created — clawback", () => {
  const seedPurchase = (over: Partial<FakePurchase> = {}) => {
    const p: FakePurchase = {
      id: "pur_r",
      stripeId: "cs_r",
      userId: "user_1",
      productId: "prod_1",
      sku: "gems_small",
      status: "completed",
      amountCents: 250,
      currency: "eur",
      paymentIntentId: "pi_r",
      grantedGems: 120,
      grantedChips: 0,
      ...over,
    };
    purchases.set(p.stripeId, p);
    return p;
  };
  const refundEvent = (id: string, pi = "pi_r", refunded = true) => ({
    id,
    type: "charge.refunded",
    data: {
      object: {
        id: `ch_${id}`,
        object: "charge",
        payment_intent: pi,
        refunded,
        amount: 250,
        amount_refunded: refunded ? 250 : 100,
      },
    },
  });
  const disputeEvent = (id: string, pi = "pi_r") => ({
    id,
    type: "charge.dispute.created",
    data: {
      object: { id: `dp_${id}`, object: "dispute", charge: "ch_x", payment_intent: pi, amount: 250, reason: "fraudulent" },
    },
  });

  it("пълен refund → refunded + взема обратно камъните, идемпотентно по event.id и по покупка", async () => {
    seedPurchase();
    wallets.set("user_1", { gems: 200, chips: 0n });
    const res = await deliver(refundEvent("evt_rf1"));
    expect(res.status).toBe(200);
    expect(purchases.get("cs_r")?.status).toBe("refunded");
    expect(wallets.get("user_1")!.gems).toBe(80);
    expect(ledger).toContainEqual(
      expect.objectContaining({ userId: "user_1", currency: "GEMS", delta: -120n, reason: "REFUND", refId: "pur_r" }),
    );

    // Същото събитие пак → дубликат; друго събитие за същата покупка → без втори clawback.
    await deliver(refundEvent("evt_rf1"));
    await deliver(refundEvent("evt_rf2"));
    expect(wallets.get("user_1")!.gems).toBe(80);
    expect(ledger.filter((l) => l.reason === "REFUND")).toHaveLength(1);
  });

  it("никога под 0: недостигът се записва, балансът спира на 0", async () => {
    seedPurchase();
    wallets.set("user_1", { gems: 50, chips: 0n });
    await deliver(refundEvent("evt_rf3"));
    expect(wallets.get("user_1")!.gems).toBe(0);
    expect(ledger).toContainEqual(
      expect.objectContaining({ currency: "GEMS", delta: -50n, shortfall: 70n, reason: "REFUND" }),
    );
  });

  it("спор → disputed + clawback; последващ пълен refund → refunded, без втори дебит", async () => {
    seedPurchase({ grantedGems: 0, grantedChips: 5000 });
    wallets.set("user_1", { gems: 0, chips: 6000n });
    await deliver(disputeEvent("evt_dp1"));
    expect(purchases.get("cs_r")?.status).toBe("disputed");
    expect(wallets.get("user_1")!.chips).toBe(1000n);
    expect(ledger).toContainEqual(expect.objectContaining({ currency: "CHIPS", delta: -5000n, reason: "DISPUTE" }));
    await deliver(refundEvent("evt_rf4"));
    // Парите са върнати → покупката е затворена като refunded; DISPUTE вече е взел.
    expect(purchases.get("cs_r")?.status).toBe("refunded");
    expect(wallets.get("user_1")!.chips).toBe(1000n);
    expect(ledger.filter((l) => l.reason === "REFUND")).toHaveLength(0);
  });

  it("админ refund в ход (refunding) → webhook-ът не взема нищо (изборът на админа важи)", async () => {
    seedPurchase({ status: "refunding" });
    wallets.set("user_1", { gems: 200, chips: 0n });
    const res = await deliver(refundEvent("evt_admin_inflight"));
    expect(res.status).toBe(200);
    expect(wallets.get("user_1")!.gems).toBe(200);
    expect(purchases.get("cs_r")?.status).toBe("refunding");
  });

  it("частичен refund (charge.refunded=false) не взема нищо автоматично", async () => {
    seedPurchase();
    wallets.set("user_1", { gems: 200, chips: 0n });
    const res = await deliver(refundEvent("evt_part", "pi_r", false));
    expect(res.status).toBe(200);
    expect(wallets.get("user_1")!.gems).toBe(200);
    expect(purchases.get("cs_r")?.status).toBe("completed");
  });

  it("стара покупка без PaymentIntent се намира през Checkout сесията", async () => {
    seedPurchase({ paymentIntentId: null });
    wallets.set("user_1", { gems: 120, chips: 0n });
    sessionsList.mockResolvedValueOnce({ data: [{ id: "cs_r" }] });
    await deliver(refundEvent("evt_legacy", "pi_legacy"));
    expect(sessionsList).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_legacy" }));
    expect(purchases.get("cs_r")?.status).toBe("refunded");
    expect(wallets.get("user_1")!.gems).toBe(0);
  });

  // ── Редът на събитията НЕ е гарантиран (docs.stripe.com/webhooks#event-ordering) ──
  it("refund ПРЕДИ checkout → надгробен ред „refunded“; късният checkout НЕ начислява", async () => {
    wallets.set("user_1", { gems: 0, chips: 0n });
    const late = checkoutEvent("evt_late_co", { sessionId: "cs_late" });
    sessionsList.mockResolvedValueOnce({ data: [late.data.object] } as never);
    const rf = await deliver(refundEvent("evt_rf_early", "pi_cs_late"));
    expect(rf.status).toBe(200);
    expect(purchases.get("cs_late")).toMatchObject({ status: "refunded", userId: "user_1", paymentIntentId: "pi_cs_late" });

    const co = await deliver(late);
    expect(co.status).toBe(200);
    expect(grantProduct).not.toHaveBeenCalled();
    expect(purchases.get("cs_late")?.status).toBe("refunded");
    expect(wallets.get("user_1")!.gems).toBe(0);
  });

  it("спор ПРЕДИ checkout → надгробен ред „disputed“; късният checkout НЕ начислява", async () => {
    wallets.set("user_1", { gems: 0, chips: 0n });
    const late = checkoutEvent("evt_late_co2", { sessionId: "cs_late2" });
    sessionsList.mockResolvedValueOnce({ data: [late.data.object] } as never);
    await deliver(disputeEvent("evt_dp_early", "pi_cs_late2"));
    expect(purchases.get("cs_late2")?.status).toBe("disputed");
    await deliver(late);
    expect(grantProduct).not.toHaveBeenCalled();
  });

  it("refund на чакащо (async) плащане → refunded; късният async_payment_succeeded НЕ начислява", async () => {
    wallets.set("user_1", { gems: 0, chips: 0n });
    await deliver(checkoutEvent("evt_pa1", { sessionId: "cs_pa", paymentStatus: "unpaid" }));
    expect(purchases.get("cs_pa")?.status).toBe("pending");
    await deliver(refundEvent("evt_pa_rf", "pi_cs_pa"));
    expect(purchases.get("cs_pa")?.status).toBe("refunded");
    await deliver(checkoutEvent("evt_pa2", { type: "checkout.session.async_payment_succeeded", sessionId: "cs_pa" }));
    expect(grantProduct).not.toHaveBeenCalled();
  });

  it("взема начисленото, прочетено В транзакцията (не остаряла снимка отпреди начисляването)", async () => {
    seedPurchase({ status: "pending", grantedGems: 0 });
    wallets.set("user_1", { gems: 0, chips: 0n });
    // async_payment_succeeded комитва (completed, +120) точно след четенето на refund-а.
    afterOuterRead = () => {
      Object.assign(purchases.get("cs_r")!, { status: "completed", grantedGems: 120 });
      wallets.get("user_1")!.gems += 120;
    };
    await deliver(refundEvent("evt_stale"));
    expect(purchases.get("cs_r")?.status).toBe("refunded");
    expect(wallets.get("user_1")!.gems).toBe(0);
  });
});

describe("charge.dispute.closed — спечелен спор връща точно взетото", () => {
  const seed = () => {
    purchases.set("cs_d", {
      id: "pur_d",
      stripeId: "cs_d",
      userId: "user_1",
      productId: "prod_1",
      sku: "gems_small",
      status: "completed",
      amountCents: 250,
      currency: "eur",
      paymentIntentId: "pi_d",
      grantedGems: 120,
      grantedChips: 0,
    });
  };
  const dispute = (id: string, type: string, status: string) => ({
    id,
    type,
    data: { object: { id: "dp_1", object: "dispute", charge: "ch_d", payment_intent: "pi_d", amount: 250, reason: "fraudulent", status } },
  });

  it("won → връща взетото (без недостига), покупката отново completed; идемпотентно", async () => {
    seed();
    wallets.set("user_1", { gems: 50, chips: 0n }); // изхарчил 70 → взети 50, недостиг 70
    await deliver(dispute("evt_dc1", "charge.dispute.created", "needs_response"));
    expect(wallets.get("user_1")!.gems).toBe(0);
    wallets.get("user_1")!.gems += 10; // междувременно спечелил 10

    const res = await deliver(dispute("evt_dw1", "charge.dispute.closed", "won"));
    expect(res.status).toBe(200);
    expect(wallets.get("user_1")!.gems).toBe(60);
    expect(purchases.get("cs_d")?.status).toBe("completed");
    expect(ledger).toContainEqual(
      expect.objectContaining({ userId: "user_1", currency: "GEMS", delta: 50n, reason: "DISPUTE", refId: "pur_d" }),
    );

    await deliver(dispute("evt_dw1", "charge.dispute.closed", "won")); // повторна доставка
    await deliver(dispute("evt_dw2", "charge.dispute.closed", "won")); // друго събитие
    expect(wallets.get("user_1")!.gems).toBe(60);
  });

  it("lost → нищо не се връща, остава disputed", async () => {
    seed();
    wallets.set("user_1", { gems: 200, chips: 0n });
    await deliver(dispute("evt_dc2", "charge.dispute.created", "needs_response"));
    const res = await deliver(dispute("evt_dl", "charge.dispute.closed", "lost"));
    expect(res.status).toBe(200);
    expect(wallets.get("user_1")!.gems).toBe(80);
    expect(purchases.get("cs_d")?.status).toBe("disputed");
  });

  it("inquiry warning_closed (затворен без chargeback) → връща взетото", async () => {
    seed();
    wallets.set("user_1", { gems: 200, chips: 0n });
    await deliver(dispute("evt_dc3", "charge.dispute.created", "warning_needs_response"));
    expect(wallets.get("user_1")!.gems).toBe(80);
    await deliver(dispute("evt_dwc", "charge.dispute.closed", "warning_closed"));
    expect(wallets.get("user_1")!.gems).toBe(200);
    expect(purchases.get("cs_d")?.status).toBe("completed");
  });

  it("inquiry, затворен с пълен refund от таблото: created → charge.refunded → warning_closed НЕ връща валутата", async () => {
    seed();
    wallets.set("user_1", { gems: 200, chips: 0n });
    await deliver(dispute("evt_iq1", "charge.dispute.created", "warning_needs_response"));
    expect(wallets.get("user_1")!.gems).toBe(80);
    await deliver({
      id: "evt_iq_rf",
      type: "charge.refunded",
      data: { object: { id: "ch_d", object: "charge", payment_intent: "pi_d", refunded: true, amount: 250, amount_refunded: 250 } },
    });
    expect(purchases.get("cs_d")?.status).toBe("refunded");
    expect(wallets.get("user_1")!.gems).toBe(80); // без втори дебит

    const res = await deliver(dispute("evt_iq_closed", "charge.dispute.closed", "warning_closed"));
    expect(res.status).toBe(200);
    expect(purchases.get("cs_d")?.status).toBe("refunded");
    expect(wallets.get("user_1")!.gems).toBe(80); // парите са при играча → валутата не се връща
    expect(ledger.filter((l) => l.reason === "DISPUTE" && BigInt(l.delta as bigint) > 0n)).toHaveLength(0);
  });

  it("надгробен ред „disputed“ (спор преди checkout) + won → остава disputed за ръчна проверка, нищо не се начислява", async () => {
    wallets.set("user_1", { gems: 0, chips: 0n });
    const late = checkoutEvent("evt_tomb_co", { sessionId: "cs_tomb" });
    sessionsList.mockResolvedValueOnce({ data: [late.data.object] } as never);
    await deliver({
      id: "evt_tomb_dc",
      type: "charge.dispute.created",
      data: { object: { id: "dp_t", object: "dispute", charge: "ch_t", payment_intent: "pi_cs_tomb", amount: 250, reason: "fraudulent", status: "needs_response" } },
    });
    expect(purchases.get("cs_tomb")?.status).toBe("disputed");

    const res = await deliver({
      id: "evt_tomb_won",
      type: "charge.dispute.closed",
      data: { object: { id: "dp_t", object: "dispute", charge: "ch_t", payment_intent: "pi_cs_tomb", amount: 250, reason: "fraudulent", status: "won" } },
    });
    expect(res.status).toBe(200);
    expect(purchases.get("cs_tomb")?.status).toBe("disputed");
    expect(grantProduct).not.toHaveBeenCalled();
    expect(wallets.get("user_1")!.gems).toBe(0);
    expect(ledger.filter((l) => l.refId === purchases.get("cs_tomb")!.id)).toHaveLength(0);
  });
});
