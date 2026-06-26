import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// ── Module mocks ────────────────────────────────────────────────────────────
// We exercise the real Express app + routers + middleware + zod + argon2, but
// stub the external infrastructure (Postgres, Redis, email, Discord) so the
// suite needs no running services.

// In-memory user table standing in for prisma.user.
interface FakeUser {
  id: string;
  email: string;
  passwordHash: string | null;
  displayName: string;
  locale: string;
  role: string;
  emailVerified: boolean;
  banned: boolean;
  deletedAt: Date | null;
  chips: bigint;
  gems: number;
  xp: number;
  level: number;
  vipTier: string;
  termsAcceptedAt: Date | null;
  lastSeenAt: Date | null;
}

const users = new Map<string, FakeUser>();
let idSeq = 0;

// A Prisma P2002 (unique-constraint) error look-alike. The route checks
// `e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"`.
class FakeKnownRequestError extends Error {
  code: string;
  constructor(code: string) {
    super(`prisma error ${code}`);
    this.code = code;
  }
}

vi.mock("@aso/db", () => {
  const userDelegate = {
    create: vi.fn(async ({ data }: { data: Partial<FakeUser> }) => {
      if ([...users.values()].some((u) => u.email === data.email)) {
        throw new FakeKnownRequestError("P2002");
      }
      const user: FakeUser = {
        id: `user_${++idSeq}`,
        email: data.email!,
        passwordHash: data.passwordHash ?? null,
        displayName: data.displayName ?? "Player",
        locale: data.locale ?? "bg",
        role: "PLAYER",
        emailVerified: false,
        banned: false,
        deletedAt: null,
        chips: 0n,
        gems: 0,
        xp: 0,
        level: 1,
        vipTier: "NONE",
        termsAcceptedAt: data.termsAcceptedAt ?? null,
        lastSeenAt: null,
      };
      users.set(user.id, user);
      return user;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
      if (where.id) return users.get(where.id) ?? null;
      if (where.email) return [...users.values()].find((u) => u.email === where.email) ?? null;
      return null;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeUser> }) => {
      const user = users.get(where.id);
      if (!user) throw new Error("user not found");
      Object.assign(user, data);
      return user;
    }),
  };

  return {
    prisma: { user: userDelegate },
    Prisma: { PrismaClientKnownRequestError: FakeKnownRequestError },
    AuthTokenType: { EMAIL_VERIFY: "EMAIL_VERIFY", PASSWORD_RESET: "PASSWORD_RESET" },
    OAuthProvider: { GOOGLE: "GOOGLE", FACEBOOK: "FACEBOOK" },
  };
});

// Redis denylist: isRevoked() calls redis.exists — return 0 (not revoked).
vi.mock("../redis.js", () => ({
  redis: {
    exists: vi.fn(async () => 0),
    set: vi.fn(async () => "OK"),
    del: vi.fn(async () => 1),
    call: vi.fn(async () => null),
  },
  pingRedis: vi.fn(async () => true),
}));

// Email + auth-token issuance + Discord are best-effort side effects; stub them.
vi.mock("../email/mailer.js", () => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock("../auth/authTokens.js", () => ({
  issueAuthToken: vi.fn(async () => ({ raw: "verify-token-raw-value-1234567890" })),
  consumeAuthToken: vi.fn(async () => null),
}));
vi.mock("../integrations/discord.js", () => ({
  notifyRegistration: vi.fn(),
  notifyPurchase: vi.fn(),
  notifyVip: vi.fn(),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const { createApp } = await import("./../app.js");
const app = createApp();

const ORIGIN = "http://localhost:4502"; // matches vitest.setup CORS_ORIGINS

function validRegister(overrides: Record<string, unknown> = {}) {
  return {
    email: `player${++idSeq}@example.com`,
    password: "correct-horse-battery",
    displayName: "Тестер",
    acceptedTerms: true,
    ...overrides,
  };
}

/** Pull a named cookie value out of a Set-Cookie header array. */
function cookieValue(setCookie: string[] | undefined, name: string): string | undefined {
  const line = (setCookie ?? []).find((c) => c.startsWith(`${name}=`));
  return line?.split(";")[0]?.split("=").slice(1).join("=");
}

beforeEach(() => {
  users.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── register ────────────────────────────────────────────────────────────────

describe("POST /api/auth/register", () => {
  it("happy path: 201 + sets the access cookie", async () => {
    const body = validRegister();
    const res = await request(app).post("/api/auth/register").set("Origin", ORIGIN).send(body);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: body.email, displayName: body.displayName });
    expect(res.body.user.passwordHash).toBeUndefined();

    const setCookie = res.headers["set-cookie"] as unknown as string[];
    expect(cookieValue(setCookie, "aso_at")).toBeTruthy();
    expect(cookieValue(setCookie, "aso_rt")).toBeTruthy();
  });

  it("rejects missing acceptedTerms with a validation error", async () => {
    const body = validRegister();
    delete (body as Record<string, unknown>).acceptedTerms;
    const res = await request(app).post("/api/auth/register").set("Origin", ORIGIN).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("rejects a weak password via zod", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Origin", ORIGIN)
      .send(validRegister({ password: "short" }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("rejects an invalid email via zod", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Origin", ORIGIN)
      .send(validRegister({ email: "not-an-email" }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("returns 409 email_taken on a duplicate registration", async () => {
    const body = validRegister();
    await request(app).post("/api/auth/register").set("Origin", ORIGIN).send(body);
    const res = await request(app).post("/api/auth/register").set("Origin", ORIGIN).send(body);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_taken");
  });
});

// ── login ───────────────────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  async function registerUser(password = "correct-horse-battery") {
    const body = validRegister({ password });
    await request(app).post("/api/auth/register").set("Origin", ORIGIN).send(body);
    return body;
  }

  it("200 + Set-Cookie on valid credentials", async () => {
    const body = await registerUser();
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: body.email, password: body.password });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(body.email);
    const setCookie = res.headers["set-cookie"] as unknown as string[];
    expect(cookieValue(setCookie, "aso_at")).toBeTruthy();
  });

  it("401 on wrong password", async () => {
    const body = await registerUser();
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: body.email, password: "wrong-password-entirely" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("returns the SAME generic error for an unknown email (no enumeration)", async () => {
    const body = await registerUser();
    const wrongPw = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: body.email, password: "wrong-password-entirely" });
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "nobody@example.com", password: "wrong-password-entirely" });

    expect(unknownEmail.status).toBe(wrongPw.status);
    expect(unknownEmail.body).toEqual(wrongPw.body);
  });
});

// ── me / refresh / logout ─────────────────────────────────────────────────────

describe("GET /api/auth/me", () => {
  it("401 without a cookie", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("200 with the access cookie issued by register", async () => {
    const body = validRegister();
    const reg = await request(app).post("/api/auth/register").set("Origin", ORIGIN).send(body);
    const setCookie = reg.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get("/api/auth/me").set("Cookie", setCookie);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(body.email);
  });
});

describe("POST /api/auth/refresh & /logout", () => {
  it("refresh with the refresh cookie issues fresh auth cookies", async () => {
    const reg = await request(app)
      .post("/api/auth/register")
      .set("Origin", ORIGIN)
      .send(validRegister());
    const setCookie = reg.headers["set-cookie"] as unknown as string[];

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", setCookie);

    expect(res.status).toBe(200);
    const fresh = res.headers["set-cookie"] as unknown as string[];
    expect(cookieValue(fresh, "aso_at")).toBeTruthy();
    expect(cookieValue(fresh, "aso_rt")).toBeTruthy();
  });

  it("refresh without a refresh cookie is 401", async () => {
    const res = await request(app).post("/api/auth/refresh").set("Origin", ORIGIN);
    expect(res.status).toBe(401);
  });

  it("logout clears the auth cookies", async () => {
    const res = await request(app).post("/api/auth/logout").set("Origin", ORIGIN);
    expect(res.status).toBe(200);
    const setCookie = (res.headers["set-cookie"] as unknown as string[]) ?? [];
    // clearCookie emits the cookie with an empty value + an Expires in the past.
    expect(setCookie.some((c) => c.startsWith("aso_at=;"))).toBe(true);
    expect(setCookie.some((c) => c.startsWith("aso_rt=;"))).toBe(true);
  });
});

// ── CSRF origin guard ─────────────────────────────────────────────────────────

describe("CSRF origin guard on /api/*", () => {
  it("rejects a non-GET request with a disallowed Origin (403)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://evil.example.com")
      .send({ email: "a@b.com", password: "x" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("csrf_origin");
  });

  it("passes a non-GET request with an allowed Origin", async () => {
    // Reaches the handler (validation 400), i.e. NOT blocked by the CSRF guard.
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "not-an-email", password: "" });

    expect(res.status).not.toBe(403);
  });

  it("passes a non-GET request with no Origin (non-browser client)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: "" });

    expect(res.status).not.toBe(403);
  });
});
