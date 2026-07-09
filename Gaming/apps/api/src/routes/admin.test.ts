import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Owner bootstrap target — must be set before ../env.js is first imported.
process.env.BOOTSTRAP_OWNER_EMAIL = "owner@aso.bg";

// ── In-memory tables standing in for Postgres ───────────────────────────────

interface FakeUser {
  id: string;
  email: string;
  passwordHash: string | null;
  displayName: string;
  locale: string;
  role: string;
  vipTier: string;
  emailVerified: boolean;
  banned: boolean;
  banReason: string | null;
  banUntil: Date | null;
  deletedAt: Date | null;
  chips: bigint;
  gems: number;
  xp: number;
  level: number;
  createdAt: Date;
  lastSeenAt: Date;
}

interface FakeReport {
  id: string;
  matchId: string;
  fromUserId: string;
  targetSeat: number | null;
  text: string;
  status: string;
  createdAt: Date;
}

interface FakeMatchPlayer {
  id: string;
  matchId: string;
  userId: string;
  seat: number;
  result: string | null;
  mmrDelta: number;
  chipsDelta: bigint;
  match: { id: string; game: string; mode: string; seed: string; startedAt: Date; endedAt: Date | null };
}

const users = new Map<string, FakeUser>();
const reports = new Map<string, FakeReport>();
let matchPlayers: FakeMatchPlayer[] = [];
let auditRows: Array<{
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetId: string | null;
  detail: string;
  createdAt: Date;
}> = [];
let seq = 0;

// Timeseries staging for $queryRaw (matched by SQL fragment).
let stagedDau: unknown[] = [];
let stagedRegs: unknown[] = [];
let stagedMatches: unknown[] = [];
let stagedRev: unknown[] = [];

function addUser(overrides: Partial<FakeUser> = {}): FakeUser {
  const n = ++seq;
  const user: FakeUser = {
    id: `user_${n}`,
    email: `player${n}@example.com`,
    passwordHash: null,
    displayName: `Играч ${n}`,
    locale: "bg",
    role: "PLAYER",
    vipTier: "NONE",
    emailVerified: true,
    banned: false,
    banReason: null,
    banUntil: null,
    deletedAt: null,
    chips: 1000n,
    gems: 0,
    xp: 0,
    level: 1,
    createdAt: new Date(Date.now() - n * 60_000), // later-created = older
    lastSeenAt: new Date(),
    ...overrides,
  };
  users.set(user.id, user);
  return user;
}

function addReport(overrides: Partial<FakeReport> = {}): FakeReport {
  const n = ++seq;
  const row: FakeReport = {
    id: `rep_${n}`,
    matchId: `match_${n}`,
    fromUserId: "user_1",
    targetSeat: null,
    text: "обиден чат",
    status: "OPEN",
    createdAt: new Date(Date.now() - n * 1000),
    ...overrides,
  };
  reports.set(row.id, row);
  return row;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose stand-in for Prisma where/data inputs
type Where = Record<string, any>;

interface ListArgs {
  where?: Where;
  take?: number;
  cursor?: { id: string };
  skip?: number;
}

function applyCursor<T extends { id: string }>(
  list: T[],
  args: { cursor?: { id: string }; skip?: number; take?: number },
): T[] {
  let out = list;
  if (args.cursor) {
    const i = out.findIndex((r) => r.id === args.cursor!.id);
    out = i >= 0 ? out.slice(i + (args.skip ?? 0)) : [];
  }
  if (typeof args.take === "number") out = out.slice(0, args.take);
  return out;
}

vi.mock("@aso/db", () => {
  const userDelegate = {
    findUnique: vi.fn(async ({ where }: { where: Where }) => {
      if (where.id) return users.get(where.id) ?? null;
      if (where.email) return [...users.values()].find((u) => u.email === where.email) ?? null;
      return null;
    }),
    findMany: vi.fn(async (args: ListArgs = {}) => {
      const where: Where = args.where ?? {};
      let list = [...users.values()];
      if (where.id?.in) list = list.filter((u) => where.id.in.includes(u.id));
      if (where.role && typeof where.role === "string") list = list.filter((u) => u.role === where.role);
      if (where.vipTier) list = list.filter((u) => u.vipTier === where.vipTier);
      if (typeof where.banned === "boolean") list = list.filter((u) => u.banned === where.banned);
      if (where.OR) {
        list = list.filter((u) =>
          (where.OR as Where[]).some(
            (c) =>
              (c.email?.contains && u.email.includes(c.email.contains)) ||
              (c.displayName?.contains && u.displayName.includes(c.displayName.contains)),
          ),
        );
      }
      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return applyCursor(list, args).map((u) => ({ ...u }));
    }),
    update: vi.fn(async ({ where, data }: { where: Where; data: Where }) => {
      const user = users.get(where.id);
      if (!user) throw new Error("user not found");
      Object.assign(user, data);
      return { ...user };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Where }) => {
      let count = 0;
      const now = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));
      for (const u of users.values()) {
        if (where.email && u.email !== where.email) continue;
        if (where.role?.not && u.role === where.role.not) continue;
        if (typeof where.banned === "boolean" && u.banned !== where.banned) continue;
        if (where.banUntil) {
          if ("not" in where.banUntil && where.banUntil.not === null && u.banUntil === null) continue;
          if (where.banUntil.lte && !(u.banUntil && u.banUntil.getTime() <= now(where.banUntil.lte).getTime()))
            continue;
        }
        Object.assign(u, data);
        count++;
      }
      return { count };
    }),
    count: vi.fn(async () => 0),
    groupBy: vi.fn(async () => []),
  };

  const adminAudit = {
    create: vi.fn(async ({ data }: { data: Where }) => {
      const row = { id: `a_${++seq}`, createdAt: new Date(), ...data } as (typeof auditRows)[number];
      auditRows.push(row);
      return row;
    }),
    findMany: vi.fn(async (args: ListArgs = {}) => {
      const where: Where = args.where ?? {};
      let list = [...auditRows];
      if (where.action) list = list.filter((a) => a.action === where.action);
      if (where.targetId) list = list.filter((a) => a.targetId === where.targetId);
      if (where.OR) {
        list = list.filter((a) =>
          (where.OR as Where[]).some(
            (c) =>
              (c.actorName?.contains &&
                a.actorName.toLowerCase().includes(String(c.actorName.contains).toLowerCase())) ||
              (c.actorId && a.actorId === c.actorId),
          ),
        );
      }
      if (where.createdAt?.gte) list = list.filter((a) => a.createdAt >= where.createdAt.gte);
      if (where.createdAt?.lte) list = list.filter((a) => a.createdAt <= where.createdAt.lte);
      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return applyCursor(list, args).map((a) => ({ ...a }));
    }),
  };

  const chatReport = {
    findMany: vi.fn(async (args: ListArgs = {}) => {
      const where: Where = args.where ?? {};
      let list = [...reports.values()];
      if (where.status) list = list.filter((r) => r.status === where.status);
      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return applyCursor(list, args).map((r) => ({ ...r }));
    }),
    update: vi.fn(async ({ where, data }: { where: Where; data: Where }) => {
      const row = reports.get(where.id);
      if (!row) throw new Error("report not found");
      Object.assign(row, data);
      return { ...row };
    }),
  };

  const matchPlayer = {
    findMany: vi.fn(async (args: ListArgs = {}) => {
      const list = matchPlayers.filter((mp) => mp.userId === args.where?.userId);
      list.sort((a, b) => b.match.startedAt.getTime() - a.match.startedAt.getTime());
      return applyCursor(list, args).map((mp) => ({ ...mp, match: { ...mp.match } }));
    }),
  };

  const match = {
    count: vi.fn(async () => 0),
    groupBy: vi.fn(async () => [{ game: "BELOTE", _count: { _all: 7 } }]),
  };

  const $queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes('"lastSeenAt"')) return stagedDau;
    if (sql.includes('FROM "User"')) return stagedRegs;
    if (sql.includes('FROM "Match"')) return stagedMatches;
    if (sql.includes('FROM "Purchase"')) return stagedRev;
    return [];
  });

  class FakeKnownRequestError extends Error {
    code: string;
    constructor(code: string) {
      super(`prisma error ${code}`);
      this.code = code;
    }
  }

  return {
    prisma: {
      user: userDelegate,
      adminAudit,
      chatReport,
      matchPlayer,
      match,
      collusionFlag: {
        count: vi.fn(async () => 0),
        findMany: vi.fn(async () => []),
        update: vi.fn(async () => ({})),
      },
      purchase: { groupBy: vi.fn(async () => []) },
      product: { findMany: vi.fn(async () => []) },
      $queryRaw,
    },
    Prisma: { PrismaClientKnownRequestError: FakeKnownRequestError },
    AuthTokenType: { EMAIL_VERIFY: "EMAIL_VERIFY", PASSWORD_RESET: "PASSWORD_RESET" },
    OAuthProvider: { GOOGLE: "GOOGLE", FACEBOOK: "FACEBOOK" },
  };
});

// Redis denylist + rate-limit store.
vi.mock("../redis.js", () => ({
  redis: {
    exists: vi.fn(async () => 0),
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

// ── App + auth helpers ───────────────────────────────────────────────────────

const { createApp } = await import("../app.js");
const { signAccessToken } = await import("../auth/tokens.js");
const { bootstrapOwner } = await import("./admin.js");
const { redis } = await import("../redis.js");
const app = createApp();

const ORIGIN = "http://localhost:4502"; // matches vitest.setup CORS_ORIGINS

const asRole = (sub: string, role: string) => [
  `aso_at=${signAccessToken({ sub, role, locale: "bg" })}`,
];

beforeEach(() => {
  users.clear();
  reports.clear();
  matchPlayers = [];
  auditRows = [];
  stagedDau = [];
  stagedRegs = [];
  stagedMatches = [];
  stagedRev = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── RBAC ─────────────────────────────────────────────────────────────────────

describe("admin RBAC", () => {
  it("rejects a PLAYER with 403", async () => {
    const res = await request(app).get("/api/admin/users").set("Cookie", asRole("user_x", "PLAYER"));
    expect(res.status).toBe(403);
  });

  it("rejects an anonymous request with 401", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });

  it("grants SUPPORT read access", async () => {
    addUser();
    const res = await request(app).get("/api/admin/users").set("Cookie", asRole("user_x", "SUPPORT"));
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
  });

  it("keeps SUPPORT read-only (flag triage is MODERATOR+)", async () => {
    const res = await request(app)
      .patch("/api/admin/flags/flag_1")
      .set("Origin", ORIGIN)
      .set("Cookie", asRole("user_x", "SUPPORT"))
      .send({ status: "DISMISSED" });
    expect(res.status).toBe(403);
  });

  it("keeps user mutations behind ADMIN/OWNER", async () => {
    const target = addUser();
    const res = await request(app)
      .patch(`/api/admin/users/${target.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", asRole("user_x", "MODERATOR"))
      .send({ banned: true, banReason: "спам" });
    expect(res.status).toBe(403);
  });
});

// ── Ban with reason + optional expiry ────────────────────────────────────────

describe("PATCH /api/admin/users/:id — ban management", () => {
  function seedAdminAndTarget() {
    const admin = addUser({ role: "ADMIN", displayName: "Админ" });
    const target = addUser();
    return { admin, target };
  }

  it("requires a reason when banning", async () => {
    const { admin, target } = seedAdminAndTarget();
    const res = await request(app)
      .patch(`/api/admin/users/${target.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", asRole(admin.id, "ADMIN"))
      .send({ banned: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ban_reason_required");
    expect(users.get(target.id)!.banned).toBe(false);
  });

  it("bans with reason + future expiry, revokes the session, audits the action", async () => {
    const { admin, target } = seedAdminAndTarget();
    const until = new Date(Date.now() + 86_400_000).toISOString();
    const res = await request(app)
      .patch(`/api/admin/users/${target.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", asRole(admin.id, "ADMIN"))
      .send({ banned: true, banReason: "обиден език", banUntil: until });

    expect(res.status).toBe(200);
    expect(res.body.user.banned).toBe(true);
    expect(res.body.user.banReason).toBe("обиден език");
    const stored = users.get(target.id)!;
    expect(stored.banned).toBe(true);
    expect(stored.banUntil?.toISOString()).toBe(until);
    expect(redis.set).toHaveBeenCalledWith(`revoked:${target.id}`, "1", "EX", expect.any(Number));
    const audit = auditRows.find((a) => a.action === "update_user" && a.targetId === target.id);
    expect(audit).toBeTruthy();
    expect(JSON.parse(audit!.detail)).toMatchObject({ banned: true, banReason: "обиден език" });
  });

  it("rejects an expiry in the past", async () => {
    const { admin, target } = seedAdminAndTarget();
    const res = await request(app)
      .patch(`/api/admin/users/${target.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", asRole(admin.id, "ADMIN"))
      .send({ banned: true, banReason: "спам", banUntil: new Date(Date.now() - 1000).toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ban_until_past");
  });

  it("unban clears reason and expiry and lifts the revocation", async () => {
    const { admin } = seedAdminAndTarget();
    const target = addUser({ banned: true, banReason: "спам", banUntil: new Date(Date.now() + 86_400_000) });
    const res = await request(app)
      .patch(`/api/admin/users/${target.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", asRole(admin.id, "ADMIN"))
      .send({ banned: false });

    expect(res.status).toBe(200);
    const stored = users.get(target.id)!;
    expect(stored.banned).toBe(false);
    expect(stored.banReason).toBeNull();
    expect(stored.banUntil).toBeNull();
    expect(redis.del).toHaveBeenCalledWith(`revoked:${target.id}`);
  });

  it("records the optional grant note in the audit detail", async () => {
    const { admin, target } = seedAdminAndTarget();
    const res = await request(app)
      .patch(`/api/admin/users/${target.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", asRole(admin.id, "ADMIN"))
      .send({ grantGems: 5, note: "компенсация" });

    expect(res.status).toBe(200);
    const audit = auditRows.find((a) => a.action === "update_user" && a.targetId === target.id);
    expect(JSON.parse(audit!.detail)).toMatchObject({ grantGems: 5, note: "компенсация" });
  });
});

// ── User list: filters, pagination, lazy ban expiry ──────────────────────────

describe("GET /api/admin/users", () => {
  it("filters by banned and role", async () => {
    addUser({ role: "MODERATOR" });
    const banned = addUser({ banned: true, banReason: "спам" });
    addUser();

    const onlyBanned = await request(app)
      .get("/api/admin/users?banned=1")
      .set("Cookie", asRole("user_x", "ADMIN"));
    expect(onlyBanned.status).toBe(200);
    expect(onlyBanned.body.users.map((u: { id: string }) => u.id)).toEqual([banned.id]);
    expect(onlyBanned.body.users[0].banReason).toBe("спам");

    const mods = await request(app)
      .get("/api/admin/users?role=MODERATOR")
      .set("Cookie", asRole("user_x", "ADMIN"));
    expect(mods.body.users).toHaveLength(1);
    expect(mods.body.users[0].role).toBe("MODERATOR");
  });

  it("paginates with a cursor", async () => {
    const a = addUser();
    const b = addUser();
    const c = addUser();
    // Newest first: a was created first => newest createdAt (see addUser).
    const page1 = await request(app)
      .get("/api/admin/users?take=2")
      .set("Cookie", asRole("user_x", "ADMIN"));
    expect(page1.body.users.map((u: { id: string }) => u.id)).toEqual([a.id, b.id]);
    expect(page1.body.nextCursor).toBe(b.id);

    const page2 = await request(app)
      .get(`/api/admin/users?take=2&cursor=${page1.body.nextCursor}`)
      .set("Cookie", asRole("user_x", "ADMIN"));
    expect(page2.body.users.map((u: { id: string }) => u.id)).toEqual([c.id]);
    expect(page2.body.nextCursor).toBeNull();
  });

  it("lazily lifts an expired temp ban", async () => {
    const expired = addUser({ banned: true, banReason: "спам", banUntil: new Date(Date.now() - 1000) });
    const active = addUser({ banned: true, banReason: "чит", banUntil: new Date(Date.now() + 86_400_000) });

    const res = await request(app).get("/api/admin/users").set("Cookie", asRole("user_x", "ADMIN"));
    expect(res.status).toBe(200);

    const stored = users.get(expired.id)!;
    expect(stored.banned).toBe(false);
    expect(stored.banReason).toBeNull();
    expect(stored.banUntil).toBeNull();
    expect(users.get(active.id)!.banned).toBe(true);
  });
});

// ── Match history ────────────────────────────────────────────────────────────

describe("GET /api/admin/users/:id/matches", () => {
  it("returns the player's matches with game info and stringified chip deltas", async () => {
    const player = addUser();
    matchPlayers.push({
      id: "mp_1",
      matchId: "m_1",
      userId: player.id,
      seat: 0,
      result: "win",
      mmrDelta: 12,
      chipsDelta: 250n,
      match: { id: "m_1", game: "BELOTE", mode: "ranked", seed: "s", startedAt: new Date(), endedAt: new Date() },
    });
    matchPlayers.push({
      id: "mp_other",
      matchId: "m_2",
      userId: "someone_else",
      seat: 1,
      result: "loss",
      mmrDelta: -8,
      chipsDelta: -100n,
      match: { id: "m_2", game: "SVARA", mode: "casual", seed: "s", startedAt: new Date(), endedAt: null },
    });

    const res = await request(app)
      .get(`/api/admin/users/${player.id}/matches`)
      .set("Cookie", asRole("user_x", "MODERATOR"));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      id: "mp_1",
      game: "BELOTE",
      mode: "ranked",
      result: "win",
      mmrDelta: 12,
      chipsDelta: "250",
    });
    expect(res.body.nextCursor).toBeNull();
  });
});

// ── Chat reports ─────────────────────────────────────────────────────────────

describe("chat reports", () => {
  it("lists reports by status with resolved reporter names", async () => {
    const reporter = addUser({ displayName: "Докладвач" });
    addReport({ fromUserId: reporter.id, targetSeat: 2 });
    addReport({ status: "RESOLVED" });

    const res = await request(app)
      .get("/api/admin/reports?status=OPEN")
      .set("Cookie", asRole("user_x", "SUPPORT"));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      status: "OPEN",
      targetSeat: 2,
      fromName: "Докладвач",
      text: "обиден чат",
    });
  });

  it("lets a MODERATOR resolve a report and audits it", async () => {
    const mod = addUser({ role: "MODERATOR", displayName: "Модератор" });
    const rep = addReport();

    const res = await request(app)
      .patch(`/api/admin/reports/${rep.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", asRole(mod.id, "MODERATOR"))
      .send({ status: "RESOLVED" });

    expect(res.status).toBe(200);
    expect(reports.get(rep.id)!.status).toBe("RESOLVED");
    const audit = auditRows.find((a) => a.action === "resolve_report");
    expect(audit?.targetId).toBe(rep.id);
  });

  it("rejects an unknown status", async () => {
    const mod = addUser({ role: "MODERATOR" });
    const rep = addReport();
    const res = await request(app)
      .patch(`/api/admin/reports/${rep.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", asRole(mod.id, "MODERATOR"))
      .send({ status: "WHATEVER" });
    expect(res.status).toBe(400);
  });
});

// ── Audit log filters ────────────────────────────────────────────────────────

describe("GET /api/admin/audit", () => {
  it("filters by action and time range", async () => {
    const old = new Date("2026-01-01T10:00:00Z");
    auditRows.push(
      { id: "a1", actorId: "u1", actorName: "Ана", action: "broadcast", targetId: null, detail: "{}", createdAt: old },
      { id: "a2", actorId: "u2", actorName: "Боби", action: "update_user", targetId: "t1", detail: "{}", createdAt: new Date() },
    );

    const byAction = await request(app)
      .get("/api/admin/audit?action=broadcast")
      .set("Cookie", asRole("user_x", "ADMIN"));
    expect(byAction.body.items.map((a: { id: string }) => a.id)).toEqual(["a1"]);

    const byRange = await request(app)
      .get("/api/admin/audit?from=2026-06-01T00:00:00Z")
      .set("Cookie", asRole("user_x", "ADMIN"));
    expect(byRange.body.items.map((a: { id: string }) => a.id)).toEqual(["a2"]);
  });

  it("filters by actor name", async () => {
    auditRows.push(
      { id: "a1", actorId: "u1", actorName: "Ана", action: "broadcast", targetId: null, detail: "{}", createdAt: new Date() },
      { id: "a2", actorId: "u2", actorName: "Боби", action: "broadcast", targetId: null, detail: "{}", createdAt: new Date() },
    );
    const res = await request(app)
      .get(`/api/admin/audit?actor=${encodeURIComponent("Ана")}`)
      .set("Cookie", asRole("user_x", "ADMIN"));
    expect(res.body.items.map((a: { id: string }) => a.id)).toEqual(["a1"]);
  });
});

// ── Economy timeseries ───────────────────────────────────────────────────────

describe("GET /api/admin/stats/timeseries", () => {
  it("merges per-day DAU / registrations / matches / revenue and top games", async () => {
    const today = new Date().toISOString().slice(0, 10);
    stagedDau = [{ day: new Date(today), n: 5 }];
    stagedRegs = [{ day: new Date(today), n: 2 }];
    stagedMatches = [{ day: new Date(today), n: 9 }];
    stagedRev = [{ day: new Date(today), n: 3, cents: 1497 }];

    const res = await request(app)
      .get("/api/admin/stats/timeseries?days=3")
      .set("Cookie", asRole("user_x", "ADMIN"));

    expect(res.status).toBe(200);
    expect(res.body.days).toBe(3);
    expect(res.body.series).toHaveLength(3);
    const last = res.body.series[2];
    expect(last).toEqual({
      day: today,
      dau: 5,
      registrations: 2,
      matches: 9,
      purchases: 3,
      revenueCents: 1497,
    });
    // Older days are zero-filled.
    expect(res.body.series[0].dau).toBe(0);
    expect(res.body.topGames).toEqual([{ game: "BELOTE", matches: 7 }]);
  });
});

// ── Owner bootstrap ──────────────────────────────────────────────────────────

describe("bootstrapOwner", () => {
  it("promotes the BOOTSTRAP_OWNER_EMAIL account to OWNER exactly once", async () => {
    const owner = addUser({ email: "owner@aso.bg", role: "PLAYER" });

    await bootstrapOwner();
    expect(users.get(owner.id)!.role).toBe("OWNER");
    expect(auditRows.filter((a) => a.action === "bootstrap_owner")).toHaveLength(1);

    // Idempotent: a second boot changes nothing and adds no audit noise.
    await bootstrapOwner();
    expect(auditRows.filter((a) => a.action === "bootstrap_owner")).toHaveLength(1);
  });

  it("is a no-op when the account does not exist yet", async () => {
    await bootstrapOwner();
    expect(auditRows).toHaveLength(0);
  });
});
