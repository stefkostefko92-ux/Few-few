import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Stripe must look configured so the webhook route doesn't short-circuit to 503.
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_dummy";

// ── In-memory ProcessedEvent table + a transaction that runs the callback ─────
const processedEvents = new Map<string, { id: string; type: string }>();

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
    purchase: { upsert: vi.fn(async () => ({})) },
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
  product: { findUnique: vi.fn(async () => ({ id: "prod_1" })) },
  purchase: { upsert: vi.fn(async () => ({})) },
  // $transaction runs the supplied callback with a fresh tx delegate.
  $transaction: vi.fn(async (cb: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) =>
    cb(makeTx()),
  ),
};

vi.mock("@aso/db", () => ({ prisma: prismaMock }));

// Stripe signature verification: return whatever event we staged.
let stagedEvent: unknown = null;
const constructEvent = vi.fn(() => stagedEvent);
vi.mock("../economy/stripe.js", () => ({
  getStripe: () => ({
    webhooks: { constructEvent },
    subscriptions: { retrieve: vi.fn(async () => ({})) },
  }),
  stripeEnabled: () => true,
}));

// Count how often money actually turns into credit.
const grantProduct = vi.fn(async () => undefined);
const grantVipStipend = vi.fn(async () => undefined);
const applyVip = vi.fn(async () => undefined);
const clearVip = vi.fn(async () => undefined);
vi.mock("../economy/grants.js", () => ({ grantProduct, grantVipStipend, applyVip, clearVip }));

vi.mock("../integrations/discord.js", () => ({
  notifyRegistration: vi.fn(),
  notifyPurchase: vi.fn(),
  notifyVip: vi.fn(),
}));

const { createApp } = await import("../app.js");
const app = createApp();

function checkoutEvent(id: string) {
  return {
    id,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${id}`,
        mode: "payment",
        metadata: { userId: "user_1", sku: "gems_small" },
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
    expect(grantProduct).toHaveBeenCalledWith(expect.anything(), "user_1", "gems_small");
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
