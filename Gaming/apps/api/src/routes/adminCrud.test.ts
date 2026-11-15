import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { COSMETICS } from "@aso/shared";

/**
 * Тестове за разширения админски CRUD (`adminCrud.ts`) + общото GDPR изтриване
 * (`eraseUser`, ползвано и от `/api/account/delete`). Prisma е заменена с
 * in-memory фалшификат (по модела на admin.test.ts).
 */

// ── In-memory таблици ────────────────────────────────────────────────────────

interface FakeUser {
  id: string;
  email: string;
  passwordHash: string | null;
  displayName: string;
  role: string;
  emailVerified: boolean;
  deletedAt: Date | null;
  createdAt: Date;
}
interface FakeSeason {
  id: string;
  index: number;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
}
interface FakeMatch {
  id: string;
  game: string;
  mode: string;
  seed: string;
  startedAt: Date;
  endedAt: Date | null;
}
interface FakeMatchPlayer {
  id: string;
  matchId: string;
  userId: string;
  seat: number;
  result: string | null;
  mmrDelta: number;
  chipsDelta: bigint;
}
interface FakeRow {
  id: string;
  userId: string;
  [k: string]: unknown;
}

const users = new Map<string, FakeUser>();
const seasons = new Map<string, FakeSeason>();
const matches = new Map<string, FakeMatch>();
let matchPlayers: FakeMatchPlayer[] = [];
let inventory: FakeRow[] = [];
let achievements: FakeRow[] = [];
let quests: FakeRow[] = [];
let ratings: FakeRow[] = [];
let notifications: FakeRow[] = [];
let subscriptions: FakeRow[] = [];
const products = new Map<string, { id: string; sku: string }>();
let purchases: { id: string; productId: string }[] = [];
const announcements = new Map<string, { id: string; title: string }>();
let auditRows: Array<{ id: string; actorId: string; action: string; targetId: string | null; detail: string }> = [];
let seq = 0;

const DAY = 86_400_000;

function addUser(overrides: Partial<FakeUser> = {}): FakeUser {
  const n = ++seq;
  const u: FakeUser = {
    id: `user_${n}`,
    email: `player${n}@example.com`,
    passwordHash: "hash",
    displayName: `Играч ${n}`,
    role: "PLAYER",
    emailVerified: true,
    deletedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
  users.set(u.id, u);
  return u;
}

function addSeason(overrides: Partial<FakeSeason> = {}): FakeSeason {
  const n = ++seq;
  const s: FakeSeason = {
    id: `season_${n}`,
    index: n,
    startsAt: new Date(Date.now() + 10 * DAY),
    endsAt: new Date(Date.now() + 40 * DAY),
    active: false,
    ...overrides,
  };
  seasons.set(s.id, s);
  return s;
}

function addMatch(overrides: Partial<FakeMatch> = {}, players: Array<Partial<FakeMatchPlayer>> = []): FakeMatch {
  const n = ++seq;
  const m: FakeMatch = {
    id: `match_${n}`,
    game: "BELOTE",
    mode: "ranked",
    seed: `seed_${n}`,
    startedAt: new Date(Date.now() - n * 60_000),
    endedAt: new Date(),
    ...overrides,
  };
  matches.set(m.id, m);
  players.forEach((p, i) =>
    matchPlayers.push({
      id: `mp_${++seq}`,
      matchId: m.id,
      userId: "user_x",
      seat: i,
      result: "win",
      mmrDelta: 12,
      chipsDelta: 50n,
      ...p,
    }),
  );
  return m;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- свободен заместител на Prisma where/data
type Where = Record<string, any>;

function applyCursor<T extends { id: string }>(list: T[], args: { cursor?: { id: string }; skip?: number; take?: number }): T[] {
  let out = list;
  if (args.cursor) {
    const i = out.findIndex((r) => r.id === args.cursor!.id);
    out = i >= 0 ? out.slice(i + (args.skip ?? 0)) : [];
  }
  if (typeof args.take === "number") out = out.slice(0, args.take);
  return out;
}

/** Общ фалшив делегат за таблици с userId (инвентар, постижения, мисии…). */
function rowDelegate(get: () => FakeRow[], set: (rows: FakeRow[]) => void, prefix: string, uniq: string[]) {
  const matches = (r: FakeRow, where: Where) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && !(v instanceof Date)) {
        // Композитен уникален ключ (напр. userId_key) → сравняваме полетата.
        return Object.entries(v as Where).every(([kk, vv]) => r[kk] === vv);
      }
      return r[k] === v;
    });
  return {
    findMany: vi.fn(async (args: { where?: Where; take?: number } = {}) =>
      get().filter((r) => matches(r, args.where ?? {})).slice(0, args.take ?? 1000).map((r) => ({ ...r })),
    ),
    findUnique: vi.fn(async ({ where }: { where: Where }) => get().find((r) => matches(r, where)) ?? null),
    findFirst: vi.fn(async ({ where }: { where: Where }) => get().find((r) => matches(r, where)) ?? null),
    create: vi.fn(async ({ data }: { data: Where }) => {
      if (uniq.length && get().some((r) => uniq.every((k) => r[k] === data[k]))) throw new Error("unique violation");
      const row = { id: `${prefix}_${++seq}`, createdAt: new Date(), ...data } as FakeRow;
      set([...get(), row]);
      return { ...row };
    }),
    delete: vi.fn(async ({ where }: { where: Where }) => {
      const row = get().find((r) => r.id === where.id);
      if (!row) throw new Error("not found");
      set(get().filter((r) => r.id !== where.id));
      return row;
    }),
    deleteMany: vi.fn(async ({ where }: { where: Where }) => {
      const before = get().length;
      set(get().filter((r) => !matches(r, where)));
      return { count: before - get().length };
    }),
    upsert: vi.fn(async ({ where, create, update }: { where: Where; create: Where; update: Where }) => {
      const row = get().find((r) => matches(r, where));
      if (row) {
        Object.assign(row, update);
        return { ...row };
      }
      const created = { id: `${prefix}_${++seq}`, mmr: 1200, games: 0, wins: 0, ...create } as FakeRow;
      set([...get(), created]);
      return { ...created };
    }),
  };
}

const oauthDeleteMany = vi.fn(async () => ({ count: 0 }));
const authTokenDeleteMany = vi.fn(async () => ({ count: 0 }));
const friendshipDeleteMany = vi.fn(async () => ({ count: 0 }));

vi.mock("@aso/db", () => {
  const user = {
    findUnique: vi.fn(async ({ where }: { where: Where }) => {
      const u = where.id ? users.get(where.id) : [...users.values()].find((x) => x.email === where.email);
      return u ? { ...u } : null;
    }),
    update: vi.fn(async ({ where, data }: { where: Where; data: Where }) => {
      const u = users.get(where.id);
      if (!u) throw new Error("user not found");
      Object.assign(u, data);
      return { ...u };
    }),
    updateMany: vi.fn(async () => ({ count: 0 })),
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    groupBy: vi.fn(async () => []),
  };

  const season = {
    findMany: vi.fn(async () => [...seasons.values()].sort((a, b) => b.index - a.index).map((s) => ({ ...s }))),
    findUnique: vi.fn(async ({ where }: { where: Where }) => {
      const s = where.id ? seasons.get(where.id) : [...seasons.values()].find((x) => x.index === where.index);
      return s ? { ...s } : null;
    }),
    create: vi.fn(async ({ data }: { data: Where }) => {
      const s = { id: `season_${++seq}`, ...data } as FakeSeason;
      seasons.set(s.id, s);
      return { ...s };
    }),
    update: vi.fn(async ({ where, data }: { where: Where; data: Where }) => {
      const s = seasons.get(where.id);
      if (!s) throw new Error("season not found");
      Object.assign(s, data);
      return { ...s };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Where }) => {
      let count = 0;
      for (const s of seasons.values()) {
        if (where.active !== undefined && s.active !== where.active) continue;
        if (where.id?.not && s.id === where.id.not) continue;
        Object.assign(s, data);
        count++;
      }
      return { count };
    }),
    delete: vi.fn(async ({ where }: { where: Where }) => {
      const s = seasons.get(where.id);
      seasons.delete(where.id);
      return s;
    }),
  };

  const withPlayers = (m: FakeMatch) => ({
    ...m,
    _count: { players: matchPlayers.filter((p) => p.matchId === m.id).length },
    players: matchPlayers
      .filter((p) => p.matchId === m.id)
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({ ...p, user: users.has(p.userId) ? { displayName: users.get(p.userId)!.displayName } : null })),
  });

  const match = {
    count: vi.fn(async () => 0),
    groupBy: vi.fn(async () => []),
    findMany: vi.fn(async (args: { where?: Where; take?: number; cursor?: { id: string }; skip?: number } = {}) => {
      const where: Where = args.where ?? {};
      let list = [...matches.values()];
      if (where.game) list = list.filter((m) => m.game === where.game);
      if (where.players?.some?.userId) {
        const uid = where.players.some.userId as string;
        list = list.filter((m) => matchPlayers.some((p) => p.matchId === m.id && p.userId === uid));
      }
      if (where.startedAt?.gte) list = list.filter((m) => m.startedAt >= where.startedAt.gte);
      if (where.startedAt?.lte) list = list.filter((m) => m.startedAt <= where.startedAt.lte);
      list.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      return applyCursor(list, args).map(withPlayers);
    }),
    findUnique: vi.fn(async ({ where }: { where: Where }) => {
      const m = matches.get(where.id);
      return m ? withPlayers(m) : null;
    }),
  };

  const adminAudit = {
    create: vi.fn(async ({ data }: { data: Where }) => {
      const row = { id: `a_${++seq}`, createdAt: new Date(), ...data } as (typeof auditRows)[number];
      auditRows.push(row);
      return row;
    }),
    findMany: vi.fn(async () => []),
  };

  const product = {
    findUnique: vi.fn(async ({ where }: { where: Where }) => products.get(where.id) ?? null),
    delete: vi.fn(async ({ where }: { where: Where }) => {
      const p = products.get(where.id);
      products.delete(where.id);
      return p;
    }),
    findMany: vi.fn(async () => []),
  };

  const announcement = {
    findUnique: vi.fn(async ({ where }: { where: Where }) => announcements.get(where.id) ?? null),
    delete: vi.fn(async ({ where }: { where: Where }) => {
      const a = announcements.get(where.id);
      announcements.delete(where.id);
      return a;
    }),
    findMany: vi.fn(async () => []),
  };

  const purchase = {
    count: vi.fn(async ({ where }: { where: Where }) => purchases.filter((p) => p.productId === where.productId).length),
    groupBy: vi.fn(async () => []),
    findMany: vi.fn(async () => []),
  };

  const client: Where = {
    user,
    season,
    match,
    adminAudit,
    product,
    announcement,
    purchase,
    inventoryItem: rowDelegate(() => inventory, (r) => (inventory = r), "inv", ["userId", "cosmeticId"]),
    achievement: rowDelegate(() => achievements, (r) => (achievements = r), "ach", ["userId", "key"]),
    quest: rowDelegate(() => quests, (r) => (quests = r), "quest", []),
    ratingPerGame: rowDelegate(() => ratings, (r) => (ratings = r), "rating", ["userId", "game"]),
    notification: rowDelegate(() => notifications, (r) => (notifications = r), "notif", []),
    subscription: rowDelegate(() => subscriptions, (r) => (subscriptions = r), "sub", ["userId"]),
    oAuthAccount: { deleteMany: oauthDeleteMany },
    authToken: { deleteMany: authTokenDeleteMany },
    friendship: { deleteMany: friendshipDeleteMany },
    collusionFlag: { count: vi.fn(async () => 0) },
    $queryRaw: vi.fn(async () => []),
  };
  // Фалшивите делегати изпълняват веднага при извикване (в реда на масива).
  client.$transaction = vi.fn(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(client),
  );

  class FakeKnownRequestError extends Error {
    code: string;
    constructor(code: string) {
      super(`prisma error ${code}`);
      this.code = code;
    }
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
    set: vi.fn(async () => "OK"),
    del: vi.fn(async () => 1),
    call: vi.fn(async () => null),
    zadd: vi.fn(async () => 1),
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

const stripeCancel = vi.fn(async () => ({}));
let stripeOn = false;
vi.mock("../economy/stripe.js", () => ({
  stripeEnabled: () => stripeOn,
  getStripe: () => ({ subscriptions: { cancel: stripeCancel } }),
}));

// ── App + помощници ──────────────────────────────────────────────────────────

const { createApp } = await import("../app.js");
const { signAccessToken } = await import("../auth/tokens.js");
const { redis } = await import("../redis.js");
const app = createApp();

const ORIGIN = "http://localhost:4502"; // съвпада с vitest.setup CORS_ORIGINS

const cookie = (sub: string, role: string) => [`aso_at=${signAccessToken({ sub, role, locale: "bg" })}`];

type Method = "get" | "post" | "patch" | "delete";
function call(method: Method, path: string, as: { id: string; role: string }, body?: object) {
  const r = request(app)[method](path).set("Origin", ORIGIN).set("Cookie", cookie(as.id, as.role));
  return body ? r.send(body) : r;
}

const lastAudit = (action: string) => auditRows.filter((a) => a.action === action).at(-1);

let admin: FakeUser;
let owner: FakeUser;
let player: FakeUser;
const support = { id: "support_1", role: "SUPPORT" };
const moderator = { id: "mod_1", role: "MODERATOR" };

beforeEach(() => {
  users.clear();
  seasons.clear();
  matches.clear();
  products.clear();
  announcements.clear();
  matchPlayers = [];
  inventory = [];
  achievements = [];
  quests = [];
  ratings = [];
  notifications = [];
  subscriptions = [];
  purchases = [];
  auditRows = [];
  stripeOn = false;
  admin = addUser({ role: "ADMIN", displayName: "Админ" });
  owner = addUser({ role: "OWNER", displayName: "Собственик" });
  player = addUser();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Сезони ───────────────────────────────────────────────────────────────────

describe("сезони", () => {
  const future = (d: number) => new Date(Date.now() + d * DAY).toISOString();

  it("персоналът (SUPPORT) чете списъка", async () => {
    addSeason({ index: 3 });
    const res = await call("get", "/api/admin/seasons", support);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it("ADMIN създава неактивен сезон + одит", async () => {
    const res = await call("post", "/api/admin/seasons", admin, { index: 7, startsAt: future(1), endsAt: future(30) });
    expect(res.status).toBe(200);
    expect(res.body.season).toMatchObject({ index: 7, active: false });
    expect(lastAudit("season_create")?.actorId).toBe(admin.id);
  });

  it("MODERATOR/SUPPORT не могат да създават (403)", async () => {
    for (const who of [support, moderator]) {
      const res = await call("post", "/api/admin/seasons", who, { index: 7, startsAt: future(1), endsAt: future(30) });
      expect(res.status).toBe(403);
    }
    expect(seasons.size).toBe(0);
  });

  it("валидация: край преди начало → 400; зает номер → 409", async () => {
    const bad = await call("post", "/api/admin/seasons", admin, { index: 7, startsAt: future(30), endsAt: future(1) });
    expect(bad.status).toBe(400);
    addSeason({ index: 9 });
    const dup = await call("post", "/api/admin/seasons", admin, { index: 9, startsAt: future(1), endsAt: future(30) });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("season_index_taken");
  });

  it("PATCH сменя датите; 404 за липсващ; 400 при обърнати дати", async () => {
    const s = addSeason();
    const ok = await call("patch", `/api/admin/seasons/${s.id}`, admin, { endsAt: future(60) });
    expect(ok.status).toBe(200);
    expect(lastAudit("season_update")?.targetId).toBe(s.id);
    const inv = await call("patch", `/api/admin/seasons/${s.id}`, admin, { endsAt: future(2) });
    expect(inv.status).toBe(400);
    const missing = await call("patch", "/api/admin/seasons/nope", admin, { endsAt: future(60) });
    expect(missing.status).toBe(404);
  });

  it("activate оставя точно един активен сезон", async () => {
    const old = addSeason({ active: true, startsAt: new Date(Date.now() - DAY) });
    const next = addSeason();
    const res = await call("post", `/api/admin/seasons/${next.id}/activate`, admin);
    expect(res.status).toBe(200);
    expect(seasons.get(next.id)!.active).toBe(true);
    expect(seasons.get(old.id)!.active).toBe(false);
    expect([...seasons.values()].filter((s) => s.active)).toHaveLength(1);
    expect(lastAudit("season_activate")?.targetId).toBe(next.id);
  });

  it("activate на приключил сезон → 400; липсващ → 404", async () => {
    const ended = addSeason({ startsAt: new Date(Date.now() - 20 * DAY), endsAt: new Date(Date.now() - DAY) });
    expect((await call("post", `/api/admin/seasons/${ended.id}/activate`, admin)).status).toBe(400);
    expect((await call("post", "/api/admin/seasons/nope/activate", admin)).status).toBe(404);
  });

  it("DELETE: активен/текущ → 409; бъдещ неактивен → изтрит + одит", async () => {
    const active = addSeason({ active: true });
    expect((await call("delete", `/api/admin/seasons/${active.id}`, admin)).status).toBe(409);
    const current = addSeason({ startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + DAY) });
    const cur = await call("delete", `/api/admin/seasons/${current.id}`, admin);
    expect(cur.status).toBe(409);
    expect(cur.body.error.code).toBe("season_current");
    const future1 = addSeason();
    expect((await call("delete", `/api/admin/seasons/${future1.id}`, admin)).status).toBe(200);
    expect(seasons.has(future1.id)).toBe(false);
    expect(lastAudit("season_delete")?.targetId).toBe(future1.id);
    expect((await call("delete", "/api/admin/seasons/nope", admin)).status).toBe(404);
    expect((await call("delete", `/api/admin/seasons/${current.id}`, support)).status).toBe(403);
  });
});

// ── Мачове ───────────────────────────────────────────────────────────────────

describe("мачове", () => {
  it("списък с филтри game/userId и курсор", async () => {
    addMatch({ game: "BELOTE" }, [{ userId: player.id }]);
    addMatch({ game: "CHESS" }, [{ userId: player.id }]);
    addMatch({ game: "CHESS" }, [{ userId: admin.id }]);
    const all = await call("get", "/api/admin/matches?take=2", moderator);
    expect(all.status).toBe(200);
    expect(all.body.items).toHaveLength(2);
    expect(all.body.nextCursor).toBeTruthy();
    const next = await call("get", `/api/admin/matches?take=2&cursor=${all.body.nextCursor}`, moderator);
    expect(next.body.items).toHaveLength(1);
    const chess = await call("get", `/api/admin/matches?game=CHESS&userId=${player.id}`, support);
    expect(chess.body.items).toHaveLength(1);
    expect(chess.body.items[0]).toMatchObject({ game: "CHESS", players: 1 });
  });

  it("филтър по дати и валидация (непозната игра, take>100)", async () => {
    addMatch({ startedAt: new Date(Date.now() - 5 * DAY) });
    addMatch({ startedAt: new Date() });
    const from = new Date(Date.now() - DAY).toISOString();
    const res = await call("get", `/api/admin/matches?from=${encodeURIComponent(from)}`, support);
    expect(res.body.items).toHaveLength(1);
    expect((await call("get", "/api/admin/matches?game=POKER", support)).status).toBe(400);
    expect((await call("get", "/api/admin/matches?take=500", support)).status).toBe(400);
  });

  it("играч (PLAYER) няма достъп", async () => {
    expect((await call("get", "/api/admin/matches", { id: player.id, role: "PLAYER" })).status).toBe(403);
  });

  it("детайл с играчи; seed се крие, докато мачът тече; 404", async () => {
    const done = addMatch({}, [{ userId: player.id, seat: 1 }, { userId: admin.id, seat: 0, result: "loss" }]);
    const res = await call("get", `/api/admin/matches/${done.id}`, support);
    expect(res.status).toBe(200);
    expect(res.body.match.seed).toBe(done.seed);
    expect(res.body.match.players.map((p: { seat: number }) => p.seat)).toEqual([0, 1]);
    expect(res.body.match.players[1]).toMatchObject({ displayName: player.displayName, chipsDelta: "50", mmrDelta: 12 });
    const live = addMatch({ endedAt: null });
    const liveRes = await call("get", `/api/admin/matches/${live.id}`, support);
    expect(liveRes.body.match.seed).toBeNull();
    expect(liveRes.body.match.seedHidden).toBe(true);
    expect((await call("get", "/api/admin/matches/nope", support)).status).toBe(404);
  });
});

// ── Инвентар ─────────────────────────────────────────────────────────────────

describe("инвентар", () => {
  const cid = COSMETICS[0]!.id;

  it("чете (SUPPORT), 404 за липсващ играч", async () => {
    inventory.push({ id: "inv_1", userId: player.id, cosmeticId: cid, equipped: false });
    const res = await call("get", `/api/admin/users/${player.id}/inventory`, support);
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ cosmeticId: cid, name: COSMETICS[0]!.name });
    expect((await call("get", "/api/admin/users/nope/inventory", support)).status).toBe(404);
  });

  it("дарява козметика + одит; дубликат → 409; непознат id → 400", async () => {
    const res = await call("post", `/api/admin/users/${player.id}/inventory`, admin, { cosmeticId: cid });
    expect(res.status).toBe(200);
    expect(inventory).toHaveLength(1);
    expect(JSON.parse(lastAudit("inventory_grant")!.detail)).toMatchObject({ cosmeticId: cid });
    expect((await call("post", `/api/admin/users/${player.id}/inventory`, admin, { cosmeticId: cid })).status).toBe(409);
    expect(
      (await call("post", `/api/admin/users/${player.id}/inventory`, admin, { cosmeticId: "BELOTE.FELT.nope" })).status,
    ).toBe(400);
  });

  it("403: SUPPORT; ранг-защита (ADMIN → ADMIN/OWNER); себе си", async () => {
    expect((await call("post", `/api/admin/users/${player.id}/inventory`, support, { cosmeticId: cid })).status).toBe(403);
    const other = addUser({ role: "ADMIN" });
    expect((await call("post", `/api/admin/users/${other.id}/inventory`, admin, { cosmeticId: cid })).status).toBe(403);
    expect((await call("post", `/api/admin/users/${owner.id}/inventory`, admin, { cosmeticId: cid })).status).toBe(403);
    expect((await call("post", `/api/admin/users/${admin.id}/inventory`, admin, { cosmeticId: cid })).status).toBe(403);
    expect(inventory).toHaveLength(0);
    // OWNER може да пипа ADMIN (по-нисък ранг).
    expect((await call("post", `/api/admin/users/${other.id}/inventory`, owner, { cosmeticId: cid })).status).toBe(200);
  });

  it("отнема предмет + одит; чужд/липсващ предмет → 404", async () => {
    inventory.push({ id: "inv_1", userId: player.id, cosmeticId: cid, equipped: true });
    inventory.push({ id: "inv_2", userId: admin.id, cosmeticId: cid, equipped: false });
    expect((await call("delete", `/api/admin/users/${player.id}/inventory/inv_2`, admin)).status).toBe(404);
    const res = await call("delete", `/api/admin/users/${player.id}/inventory/inv_1`, admin);
    expect(res.status).toBe(200);
    expect(inventory.map((i) => i.id)).toEqual(["inv_2"]);
    expect(lastAudit("inventory_revoke")?.targetId).toBe(player.id);
  });
});

// ── Постижения ───────────────────────────────────────────────────────────────

describe("постижения", () => {
  it("отключва от каталога + одит; дубликат → 409; непознат ключ → 400", async () => {
    const res = await call("post", `/api/admin/users/${player.id}/achievements`, admin, { key: "first_win" });
    expect(res.status).toBe(200);
    expect(achievements).toHaveLength(1);
    expect(lastAudit("achievement_grant")?.targetId).toBe(player.id);
    expect((await call("post", `/api/admin/users/${player.id}/achievements`, admin, { key: "first_win" })).status).toBe(409);
    expect((await call("post", `/api/admin/users/${player.id}/achievements`, admin, { key: "hack" })).status).toBe(400);
  });

  it("GET (MODERATOR) с заглавие; 404 за липсващ играч", async () => {
    achievements.push({ id: "ach_1", userId: player.id, key: "first_win", unlockedAt: new Date() });
    const res = await call("get", `/api/admin/users/${player.id}/achievements`, moderator);
    expect(res.body.items[0]).toMatchObject({ key: "first_win", title: "Първа победа" });
    expect((await call("get", "/api/admin/users/nope/achievements", moderator)).status).toBe(404);
  });

  it("DELETE по ключ + одит; неотключено → 404; ранг-защита", async () => {
    achievements.push({ id: "ach_1", userId: player.id, key: "first_win", unlockedAt: new Date() });
    expect((await call("delete", `/api/admin/users/${player.id}/achievements/wins_10`, admin)).status).toBe(404);
    expect((await call("delete", `/api/admin/users/${player.id}/achievements/first_win`, moderator)).status).toBe(403);
    expect((await call("delete", `/api/admin/users/${player.id}/achievements/first_win`, admin)).status).toBe(200);
    expect(achievements).toHaveLength(0);
    expect(lastAudit("achievement_revoke")?.targetId).toBe(player.id);
    const peer = addUser({ role: "ADMIN" });
    expect((await call("post", `/api/admin/users/${peer.id}/achievements`, admin, { key: "first_win" })).status).toBe(403);
  });
});

// ── Мисии ────────────────────────────────────────────────────────────────────

describe("мисии", () => {
  it("GET + нулиране (DELETE) с одит; чужда мисия → 404; 403 за SUPPORT", async () => {
    quests.push({ id: "q_1", userId: player.id, key: "play_3", period: "d:2026-09-26", progress: 3, target: 3, completedAt: new Date() });
    quests.push({ id: "q_2", userId: admin.id, key: "play_3", period: "d:2026-09-26", progress: 1, target: 3, completedAt: null });
    const list = await call("get", `/api/admin/users/${player.id}/quests`, support);
    expect(list.body.items).toHaveLength(1);
    expect((await call("delete", `/api/admin/users/${player.id}/quests/q_1`, support)).status).toBe(403);
    expect((await call("delete", `/api/admin/users/${player.id}/quests/q_2`, admin)).status).toBe(404);
    const res = await call("delete", `/api/admin/users/${player.id}/quests/q_1`, admin);
    expect(res.status).toBe(200);
    expect(quests.map((q) => q.id)).toEqual(["q_2"]);
    expect(JSON.parse(lastAudit("quest_reset")!.detail)).toMatchObject({ key: "play_3", completed: true });
    expect((await call("get", "/api/admin/users/nope/quests", support)).status).toBe(404);
  });
});

// ── Рейтинги ─────────────────────────────────────────────────────────────────

describe("рейтинги", () => {
  it("задава MMR (upsert) + обновява класацията + одит", async () => {
    const res = await call("patch", `/api/admin/users/${player.id}/ratings/CHESS`, admin, { mmr: 1800 });
    expect(res.status).toBe(200);
    expect(res.body.rating).toMatchObject({ game: "CHESS", mmr: 1800 });
    expect(redis.zadd).toHaveBeenCalledWith("lb:CHESS", 1800, player.id);
    expect(JSON.parse(lastAudit("rating_set")!.detail)).toMatchObject({ game: "CHESS", from: null, to: 1800 });
  });

  it("reset → 1200 / 0 / 0", async () => {
    ratings.push({ id: "r_1", userId: player.id, game: "BELOTE", mmr: 1900, games: 40, wins: 30 });
    const res = await call("patch", `/api/admin/users/${player.id}/ratings/BELOTE`, admin, { reset: true });
    expect(res.status).toBe(200);
    expect(ratings[0]).toMatchObject({ mmr: 1200, games: 0, wins: 0 });
    expect(lastAudit("rating_reset")?.targetId).toBe(player.id);
    const list = await call("get", `/api/admin/users/${player.id}/ratings`, support);
    expect(list.body.items).toHaveLength(1);
  });

  it("валидация: MMR извън 0..4000, непозната игра, празно тяло → 400", async () => {
    expect((await call("patch", `/api/admin/users/${player.id}/ratings/CHESS`, admin, { mmr: 5000 })).status).toBe(400);
    expect((await call("patch", `/api/admin/users/${player.id}/ratings/CHESS`, admin, { mmr: -1 })).status).toBe(400);
    expect((await call("patch", `/api/admin/users/${player.id}/ratings/POKER`, admin, { mmr: 1000 })).status).toBe(400);
    expect((await call("patch", `/api/admin/users/${player.id}/ratings/CHESS`, admin, {})).status).toBe(400);
  });

  it("403 за MODERATOR и ранг-защита; 404 за липсващ играч", async () => {
    expect((await call("patch", `/api/admin/users/${player.id}/ratings/CHESS`, moderator, { mmr: 1500 })).status).toBe(403);
    expect((await call("patch", `/api/admin/users/${owner.id}/ratings/CHESS`, admin, { mmr: 1500 })).status).toBe(403);
    expect((await call("patch", "/api/admin/users/nope/ratings/CHESS", admin, { mmr: 1500 })).status).toBe(404);
    expect(ratings).toHaveLength(0);
  });
});

// ── Известия ─────────────────────────────────────────────────────────────────

describe("известия", () => {
  it("изпраща system известие + одит; GET показва последните", async () => {
    const res = await call("post", `/api/admin/users/${player.id}/notifications`, admin, { title: "Здравей", body: "Компенсация" });
    expect(res.status).toBe(200);
    expect(notifications[0]).toMatchObject({ userId: player.id, type: "system" });
    expect(JSON.parse(String(notifications[0]!.data))).toEqual({ kind: "admin_message", title: "Здравей", body: "Компенсация" });
    expect(lastAudit("notification_send")?.targetId).toBe(player.id);
    const list = await call("get", `/api/admin/users/${player.id}/notifications`, support);
    expect(list.body.items[0].data).toMatchObject({ title: "Здравей" });
  });

  it("валидация на дължините → 400; 403 за SUPPORT; 404", async () => {
    const long = "x".repeat(1001);
    expect((await call("post", `/api/admin/users/${player.id}/notifications`, admin, { title: "", body: "a" })).status).toBe(400);
    expect((await call("post", `/api/admin/users/${player.id}/notifications`, admin, { title: "a", body: long })).status).toBe(400);
    expect((await call("post", `/api/admin/users/${player.id}/notifications`, support, { title: "a", body: "b" })).status).toBe(403);
    expect((await call("post", "/api/admin/users/nope/notifications", admin, { title: "a", body: "b" })).status).toBe(404);
    expect(notifications).toHaveLength(0);
  });
});

// ── Абонамент ────────────────────────────────────────────────────────────────

describe("абонамент", () => {
  it("SUPPORT чете абонамента (или null); 404 за липсващ играч", async () => {
    subscriptions.push({ id: "s_1", userId: player.id, stripeSubId: "sub_1", tier: "GOLD", status: "active" });
    const res = await call("get", `/api/admin/users/${player.id}/subscription`, support);
    expect(res.body.subscription).toMatchObject({ tier: "GOLD" });
    const none = await call("get", `/api/admin/users/${admin.id}/subscription`, support);
    expect(none.body.subscription).toBeNull();
    expect((await call("get", "/api/admin/users/nope/subscription", support)).status).toBe(404);
  });
});

// ── Изтриване на акаунт (OWNER) ──────────────────────────────────────────────

describe("DELETE /api/admin/users/:id — изтриване от OWNER", () => {
  it("анонимизира, отменя Stripe абонамента, одитира без PII", async () => {
    stripeOn = true;
    subscriptions.push({ id: "s_1", userId: player.id, stripeSubId: "sub_live", tier: "GOLD", status: "active" });
    notifications.push({ id: "n_1", userId: player.id, type: "system", data: "{}" });
    const email = player.email;
    const res = await call("delete", `/api/admin/users/${player.id}`, owner, { confirmEmail: email.toUpperCase() });
    expect(res.status).toBe(200);
    const u = users.get(player.id)!;
    expect(u.email).toBe(`deleted+${player.id}@deleted.invalid`);
    expect(u.displayName).toBe("Изтрит играч");
    expect(u.passwordHash).toBeNull();
    expect(u.deletedAt).toBeInstanceOf(Date);
    expect(stripeCancel).toHaveBeenCalledWith("sub_live");
    expect(subscriptions).toHaveLength(0);
    expect(notifications).toHaveLength(0);
    expect(redis.set).toHaveBeenCalledWith(`revoked:${player.id}`, expect.stringMatching(/^\d+$/), "EX", expect.any(Number));
    const row = lastAudit("user_erase")!;
    expect(row.targetId).toBe(player.id);
    expect(row.detail).not.toContain(email);
  });

  it("ADMIN не може (403) — само OWNER", async () => {
    const res = await call("delete", `/api/admin/users/${player.id}`, admin, { confirmEmail: player.email });
    expect(res.status).toBe(403);
    expect(users.get(player.id)!.deletedAt).toBeNull();
  });

  it("грешен имейл → 400; липсващ → 400; липсващ играч → 404", async () => {
    const res = await call("delete", `/api/admin/users/${player.id}`, owner, { confirmEmail: "other@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("email_mismatch");
    expect((await call("delete", `/api/admin/users/${player.id}`, owner, {})).status).toBe(400);
    expect((await call("delete", "/api/admin/users/nope", owner, { confirmEmail: "a@b.bg" })).status).toBe(404);
    expect(users.get(player.id)!.deletedAt).toBeNull();
  });

  it("не може себе си, не може друг OWNER; вече изтрит → 409", async () => {
    expect((await call("delete", `/api/admin/users/${owner.id}`, owner, { confirmEmail: owner.email })).status).toBe(403);
    const other = addUser({ role: "OWNER" });
    expect((await call("delete", `/api/admin/users/${other.id}`, owner, { confirmEmail: other.email })).status).toBe(403);
    const gone = addUser({ deletedAt: new Date() });
    expect((await call("delete", `/api/admin/users/${gone.id}`, owner, { confirmEmail: gone.email })).status).toBe(409);
    expect(auditRows.filter((a) => a.action === "user_erase")).toHaveLength(0);
  });
});

// ── Самоизтриване (регресия след изнасянето в eraseUser) ─────────────────────

describe("POST /api/account/delete — самоизтриване", () => {
  it("анонимизира, трие лични данни, отменя абонамента, чисти бисквитките", async () => {
    stripeOn = true;
    subscriptions.push({ id: "s_1", userId: player.id, stripeSubId: "sub_self", tier: "SILVER", status: "active" });
    const res = await call("post", "/api/account/delete", player);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const u = users.get(player.id)!;
    expect(u.email).toBe(`deleted+${player.id}@deleted.invalid`);
    expect(u.deletedAt).toBeInstanceOf(Date);
    expect(stripeCancel).toHaveBeenCalledWith("sub_self");
    expect(oauthDeleteMany).toHaveBeenCalledWith({ where: { userId: player.id } });
    expect(authTokenDeleteMany).toHaveBeenCalledWith({ where: { userId: player.id } });
    expect(friendshipDeleteMany).toHaveBeenCalled();
    expect(String(res.headers["set-cookie"] ?? "")).toContain("aso_at=;");
  });

  it("Stripe грешка не блокира изтриването; без Stripe не се вика cancel", async () => {
    stripeOn = true;
    stripeCancel.mockRejectedValueOnce(new Error("stripe down"));
    subscriptions.push({ id: "s_1", userId: player.id, stripeSubId: "sub_x", tier: "SILVER", status: "active" });
    expect((await call("post", "/api/account/delete", player)).status).toBe(200);
    expect(users.get(player.id)!.deletedAt).toBeInstanceOf(Date);

    stripeOn = false;
    const p2 = addUser();
    subscriptions.push({ id: "s_2", userId: p2.id, stripeSubId: "sub_y", tier: "SILVER", status: "active" });
    stripeCancel.mockClear();
    expect((await call("post", "/api/account/delete", p2)).status).toBe(200);
    expect(stripeCancel).not.toHaveBeenCalled();
  });

  it("вече изтрит акаунт → 401", async () => {
    const gone = addUser({ deletedAt: new Date() });
    expect((await call("post", "/api/account/delete", gone)).status).toBe(401);
  });
});

// ── Обяви и продукти ─────────────────────────────────────────────────────────

describe("изтриване на обяви и продукти", () => {
  it("обява: ADMIN трие + одит; SUPPORT → 403; липсваща → 404", async () => {
    announcements.set("ann_1", { id: "ann_1", title: "Турнир" });
    expect((await call("delete", "/api/admin/announcements/ann_1", support)).status).toBe(403);
    expect((await call("delete", "/api/admin/announcements/ann_1", admin)).status).toBe(200);
    expect(announcements.size).toBe(0);
    expect(JSON.parse(lastAudit("announcement_delete")!.detail)).toEqual({ title: "Турнир" });
    expect((await call("delete", "/api/admin/announcements/ann_1", admin)).status).toBe(404);
  });

  it("продукт с покупки → 409 (подсказка за деактивиране); без покупки → изтрит + одит", async () => {
    products.set("p_1", { id: "p_1", sku: "gems_small" });
    products.set("p_2", { id: "p_2", sku: "gems_unused" });
    purchases.push({ id: "pur_1", productId: "p_1" });
    const sold = await call("delete", "/api/admin/products/p_1", admin);
    expect(sold.status).toBe(409);
    expect(sold.body.error.code).toBe("product_has_purchases");
    expect(products.has("p_1")).toBe(true);
    expect((await call("delete", "/api/admin/products/p_2", moderator)).status).toBe(403);
    expect((await call("delete", "/api/admin/products/p_2", admin)).status).toBe(200);
    expect(products.has("p_2")).toBe(false);
    expect(lastAudit("product_delete")?.targetId).toBe("p_2");
    expect((await call("delete", "/api/admin/products/nope", admin)).status).toBe(404);
  });
});
