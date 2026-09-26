import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Stripe конфигуриран; стар prod .env (PUBLIC_WEB_URL вече с /app) + WEB_BASE_PATH=/app
// — линковете трябва да са /app/…, не /app/app/…. Преди първия import на env.js.
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.PUBLIC_WEB_URL = "https://gaming.example.eu/app";
process.env.WEB_BASE_PATH = "/app";

// ── In-memory таблици ─────────────────────────────────────────────────────────
interface FakeProduct {
  id: string;
  kind: string;
  sku: string;
  priceCents: number;
  gems: number | null;
  chips: number | null;
  cosmeticId: string | null;
  active: boolean;
}
interface FakeUser {
  id: string;
  email: string;
  locale: string;
  vipTier: string;
  vipUntil: Date | null;
  stripeCustomerId: string | null;
}
interface FakeSub {
  userId: string;
  stripeSubId: string;
  tier: string;
  status: string;
  currentPeriodEnd: Date;
}

const products = new Map<string, FakeProduct>();
const users = new Map<string, FakeUser>();
const subs = new Map<string, FakeSub>();

vi.mock("@aso/db", () => ({
  prisma: {
    product: {
      findMany: vi.fn(async ({ where }: { where?: { active?: boolean } } = {}) =>
        [...products.values()].filter((p) => where?.active === undefined || p.active === where.active),
      ),
      findUnique: vi.fn(async ({ where }: { where: { sku?: string; id?: string } }) =>
        [...products.values()].find((p) => p.sku === where.sku || p.id === where.id) ?? null,
      ),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeUser> }) => {
        const u = users.get(where.id)!;
        Object.assign(u, data);
        return u;
      }),
    },
    subscription: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => subs.get(where.userId) ?? null),
    },
  },
}));

vi.mock("../redis.js", () => ({
  redis: {
    get: vi.fn(async () => null),
    exists: vi.fn(async () => 0),
    set: vi.fn(async () => "OK"),
    del: vi.fn(async () => 1),
    call: vi.fn(async () => null),
  },
  pingRedis: vi.fn(async () => true),
}));

const sessionsCreate = vi.fn(async (_params: Record<string, unknown>, _opts: { idempotencyKey: string }) => ({
  url: "https://checkout.stripe.test/cs_1",
}));
const portalCreate = vi.fn(async (_params: { customer: string; return_url: string }, _opts: unknown) => ({
  url: "https://billing.stripe.test/p_1",
}));
const customersCreate = vi.fn(async () => ({ id: "cus_new" }));
vi.mock("../economy/stripe.js", () => ({
  stripeEnabled: () => true,
  getStripe: () => ({
    customers: { create: customersCreate },
    checkout: { sessions: { create: sessionsCreate } },
    billingPortal: { sessions: { create: portalCreate } },
    subscriptions: { retrieve: vi.fn(async () => ({ customer: "cus_from_sub" })) },
  }),
}));

const { createApp } = await import("../app.js");
const { signAccessToken } = await import("../auth/tokens.js");
const app = createApp();

const ORIGIN = "http://localhost:4502";
const cookie = (sub = "user_1") => [`aso_at=${signAccessToken({ sub, role: "PLAYER", locale: "bg" })}`];

function addProduct(p: Partial<FakeProduct> & { sku: string; kind: string }): FakeProduct {
  const row: FakeProduct = {
    id: `prod_${p.sku}`,
    priceCents: 199,
    gems: null,
    chips: null,
    cosmeticId: null,
    active: true,
    ...p,
  };
  products.set(row.id, row);
  return row;
}

const checkout = (sku: string, extra: Record<string, unknown> = {}) =>
  request(app)
    .post("/api/shop/checkout")
    .set("Origin", ORIGIN)
    .set("Cookie", cookie())
    .send({ sku, ...extra });

beforeEach(() => {
  products.clear();
  users.clear();
  subs.clear();
  users.set("user_1", {
    id: "user_1",
    email: "p1@example.com",
    locale: "bg",
    vipTier: "NONE",
    vipUntil: null,
    stripeCustomerId: "cus_1",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("каталог от таблицата Product (не статичния CATALOG)", () => {
  it("връща само активните продукти с цената от базата; нов SKU от админа се вижда", async () => {
    addProduct({ sku: "gems_small", kind: "GEMS", priceCents: 250, gems: 120 });
    addProduct({ sku: "gems_mega", kind: "GEMS", priceCents: 2999, gems: 3000 }); // нов от админа
    addProduct({ sku: "chips_large", kind: "CHIP_PACK", priceCents: 699, chips: 25000, active: false });

    const res = await request(app).get("/api/shop/catalog");
    expect(res.status).toBe(200);
    const bySku = Object.fromEntries(
      (res.body.products as Array<{ sku: string }>).map((p) => [p.sku, p]),
    );
    expect(Object.keys(bySku).sort()).toEqual(["gems_mega", "gems_small"]);
    expect(bySku.gems_small).toMatchObject({ priceCents: 250, grantGems: 120, title: "Шепа скъпоценни камъни" });
    expect(bySku.gems_mega).toMatchObject({ priceCents: 2999, grantGems: 3000, title: "gems_mega" });
  });
});

describe("POST /api/shop/checkout", () => {
  it("цената за Stripe е Product.priceCents; сума от клиента се игнорира; снимка в metadata", async () => {
    addProduct({ sku: "gems_small", kind: "GEMS", priceCents: 250, gems: 120 });
    const res = await checkout("gems_small", { amount: 1, priceCents: 1 });
    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://checkout.stripe.test/cs_1");

    const [params, opts] = sessionsCreate.mock.calls[0]!;
    const p = params as {
      line_items: Array<{ price_data: { unit_amount: number; currency: string } }>;
      metadata: Record<string, string>;
      success_url: string;
      cancel_url: string;
    };
    expect(p.line_items[0]!.price_data.unit_amount).toBe(250);
    expect(p.line_items[0]!.price_data.currency).toBe("eur");
    expect(p.metadata).toMatchObject({ userId: "user_1", sku: "gems_small", snap: "1", gems: "120", priceCents: "250" });
    // Един базов път — без /app/app.
    expect(p.success_url).toBe("https://gaming.example.eu/app/shop?status=success");
    expect(p.cancel_url).toBe("https://gaming.example.eu/app/shop?status=cancel");
    expect(opts.idempotencyKey).toMatch(/^checkout:user_1:gems_small:250:\d+$/);
  });

  it("непознат SKU → 404", async () => {
    const res = await checkout("nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("unknown_sku");
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("деактивиран продукт → 409 product_unavailable", async () => {
    addProduct({ sku: "chips_large", kind: "CHIP_PACK", priceCents: 699, chips: 25000, active: false });
    const res = await checkout("chips_large");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("product_unavailable");
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("VIP SKU без разпознато ниво → 409 (fail closed)", async () => {
    addProduct({ sku: "premium_x", kind: "VIP_SUB", priceCents: 499 });
    const res = await checkout("premium_x");
    expect(res.status).toBe(409);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("жив абонамент → 409 already_subscribed; след отказ (canceled) може отново", async () => {
    addProduct({ sku: "vip_gold", kind: "VIP_SUB", priceCents: 999 });
    subs.set("user_1", {
      userId: "user_1",
      stripeSubId: "sub_1",
      tier: "GOLD",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    });
    const blocked = await checkout("vip_gold");
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("already_subscribed");

    subs.get("user_1")!.status = "canceled";
    const again = await checkout("vip_gold");
    expect(again.status).toBe(200);
    const p = sessionsCreate.mock.calls[0]![0] as {
      mode: string;
      subscription_data: { metadata: Record<string, string> };
    };
    expect(p.mode).toBe("subscription");
    expect(p.subscription_data.metadata).toMatchObject({ userId: "user_1", sku: "vip_gold", vipTier: "GOLD" });
  });
});

describe("управление на абонамента", () => {
  it("POST /portal ползва записания stripeCustomerId и връща към /app/shop", async () => {
    const res = await request(app).post("/api/shop/portal").set("Origin", ORIGIN).set("Cookie", cookie());
    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://billing.stripe.test/p_1");
    expect(portalCreate.mock.calls[0]![0]).toEqual({
      customer: "cus_1",
      return_url: "https://gaming.example.eu/app/shop",
    });
  });

  it("POST /portal без клиент и без абонамент → 400 no_subscription", async () => {
    users.get("user_1")!.stripeCustomerId = null;
    const res = await request(app).post("/api/shop/portal").set("Origin", ORIGIN).set("Cookie", cookie());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("no_subscription");
  });

  it("GET /vip показва живия абонамент (UI сменя бутона за покупка с „Управление“)", async () => {
    users.get("user_1")!.vipTier = "GOLD";
    subs.set("user_1", {
      userId: "user_1",
      stripeSubId: "sub_1",
      tier: "GOLD",
      status: "active",
      currentPeriodEnd: new Date("2026-10-26T00:00:00Z"),
    });
    const res = await request(app).get("/api/shop/vip").set("Cookie", cookie());
    expect(res.status).toBe(200);
    expect(res.body.subscription).toMatchObject({ status: "active", tier: "GOLD" });
    expect(res.body.canManageBilling).toBe(true);

    subs.get("user_1")!.status = "canceled";
    const after = await request(app).get("/api/shop/vip").set("Cookie", cookie());
    expect(after.body.subscription).toBeNull();
  });
});
