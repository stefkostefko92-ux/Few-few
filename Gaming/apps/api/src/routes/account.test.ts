import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// ── Фалшива prisma: само таблицата User с полетата за отговорна игра ─────────
interface FakeUser {
  id: string;
  deletedAt: Date | null;
  realityCheckMinutes: number;
  dailyLimitMinutes: number | null;
  selfExcludedUntil: Date | null;
  selfExcludedAt: Date | null;
}
const users = new Map<string, FakeUser>();

function pick(u: FakeUser, select?: Record<string, boolean>): Partial<FakeUser> {
  if (!select) return { ...u };
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(select)) out[k] = (u as unknown as Record<string, unknown>)[k];
  return out as Partial<FakeUser>;
}

vi.mock("@aso/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
        const u = users.get(where.id);
        return u ? pick(u, select) : null;
      }),
      update: vi.fn(
        async ({ where, data, select }: { where: { id: string }; data: Partial<FakeUser>; select?: Record<string, boolean> }) => {
          const u = users.get(where.id)!;
          Object.assign(u, data);
          return pick(u, select);
        },
      ),
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

const { createApp } = await import("../app.js");
const { signAccessToken } = await import("../auth/tokens.js");
const app = createApp();

const ORIGIN = "http://localhost:4502";
const cookie = (sub = "user_1") => [`aso_at=${signAccessToken({ sub, role: "PLAYER", locale: "bg" })}`];
const DAY = 86_400_000;

beforeEach(() => {
  users.clear();
  users.set("user_1", {
    id: "user_1",
    deletedAt: null,
    realityCheckMinutes: 0,
    dailyLimitMinutes: null,
    selfExcludedUntil: null,
    selfExcludedAt: null,
  });
});
afterEach(() => vi.clearAllMocks());

const put = (body: unknown) =>
  request(app).put("/api/account/responsible").set("Origin", ORIGIN).set("Cookie", cookie()).send(body as object);
const exclude = (body: unknown) =>
  request(app).post("/api/account/self-exclude").set("Origin", ORIGIN).set("Cookie", cookie()).send(body as object);

describe("GET/PUT /api/account/responsible", () => {
  it("изисква вход", async () => {
    const res = await request(app).get("/api/account/responsible");
    expect(res.status).toBe(401);
  });

  it("връща настройките по подразбиране (изключено, без лимит, без самоизключване)", async () => {
    const res = await request(app).get("/api/account/responsible").set("Cookie", cookie());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ realityCheckMinutes: 0, dailyLimitMinutes: null, selfExcludedUntil: null });
  });

  it("записва напомняне на 60 мин и дневен лимит 120 мин", async () => {
    const res = await put({ realityCheckMinutes: 60, dailyLimitMinutes: 120 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ realityCheckMinutes: 60, dailyLimitMinutes: 120 });
    expect(users.get("user_1")).toMatchObject({ realityCheckMinutes: 60, dailyLimitMinutes: 120 });

    const off = await put({ dailyLimitMinutes: null });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ realityCheckMinutes: 60, dailyLimitMinutes: null });
  });

  it("Zod: отхвърля непозволени стойности и чужди полета", async () => {
    expect((await put({ realityCheckMinutes: 45 })).status).toBe(400);
    expect((await put({ dailyLimitMinutes: 5 })).status).toBe(400);
    expect((await put({ realityCheckMinutes: "60" })).status).toBe(400);
    // Самоизключване не може да се „изчисти“ през настройките.
    expect((await put({ selfExcludedUntil: null })).status).toBe(400);
    expect(users.get("user_1")!.realityCheckMinutes).toBe(0);
  });
});

describe("POST /api/account/self-exclude", () => {
  it("самоизключва за 7 дни и го показва", async () => {
    const before = Date.now();
    const res = await exclude({ period: "7d", confirm: true });
    expect(res.status).toBe(200);
    const until = Date.parse(res.body.selfExcludedUntil as string);
    expect(until).toBeGreaterThanOrEqual(before + 7 * DAY);
    expect(until).toBeLessThan(before + 7 * DAY + 60_000);
    expect(users.get("user_1")!.selfExcludedAt).toBeInstanceOf(Date);
  });

  it("6 месеца ≈ 183 дни; 24 ч и 30 дни също", async () => {
    const r = await exclude({ period: "6m", confirm: true });
    const until = Date.parse(r.body.selfExcludedUntil as string);
    expect(Math.round((until - Date.now()) / DAY)).toBe(183);
  });

  it("не може да се съкрати: по-кратък период запазва по-дългото изключване", async () => {
    const long = new Date(Date.now() + 30 * DAY);
    users.get("user_1")!.selfExcludedUntil = long;
    const res = await exclude({ period: "24h", confirm: true });
    expect(res.status).toBe(200);
    expect(res.body.selfExcludedUntil).toBe(long.toISOString());
    expect(users.get("user_1")!.selfExcludedUntil).toEqual(long);
  });

  it("може да се удължи", async () => {
    users.get("user_1")!.selfExcludedUntil = new Date(Date.now() + DAY);
    const res = await exclude({ period: "30d", confirm: true });
    expect(Date.parse(res.body.selfExcludedUntil as string)).toBeGreaterThan(Date.now() + 29 * DAY);
  });

  it("изисква изрично потвърждение и валиден период", async () => {
    expect((await exclude({ period: "7d" })).status).toBe(400);
    expect((await exclude({ period: "7d", confirm: false })).status).toBe(400);
    expect((await exclude({ period: "1y", confirm: true })).status).toBe(400);
    expect(users.get("user_1")!.selfExcludedUntil).toBeNull();
  });

  it("изтеклото самоизключване се показва като няма", async () => {
    users.get("user_1")!.selfExcludedUntil = new Date(Date.now() - 1000);
    const res = await request(app).get("/api/account/responsible").set("Cookie", cookie());
    expect(res.body.selfExcludedUntil).toBeNull();
  });
});
