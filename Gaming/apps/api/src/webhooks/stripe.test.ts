import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Stripe must look configured so the webhook route doesn't short-circuit to 503.
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_dummy";

// ── In-memory ProcessedEvent + Purchase tables + a transaction that runs the callback ─
const processedEvents = new Map<string, { id: string; type: string }>();
interface FakePurchase {
  stripeId: string;
  userId: string;
  productId: string;
  status: string;
  amountCents: number;
  currency: string;
}
const purchases = new Map<string, FakePurchase>();

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
    user: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => null) },
    purchase: {
      findUnique: vi.fn(async ({ where }: { where: { stripeId: string } }) => purchases.get(where.stripeId) ?? null),
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
  // $transaction runs the supplied callback with a fresh tx delegate.
  $transaction: vi.fn(async (cb: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) =>
    cb(makeTx()),
  ),
};

vi.mock("@aso/db", () => ({ prisma: prismaMock }));

// Stripe signature verification: return whatever event we staged.
let stagedEvent: unknown = null;
const constructEvent = vi.fn(() => stagedEvent);
let stagedSub: unknown = {};
vi.mock("../economy/stripe.js", () => ({
  getStripe: () => ({
    webhooks: { constructEvent },
    subscriptions: { retrieve: vi.fn(async () => stagedSub) },
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
    expect(grantProduct).toHaveBeenCalledWith(expect.anything(), "user_1", "gems_small", {
      kind: "GEMS",
      gems: 120,
      chips: 0,
      cosmeticId: null,
    });
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
