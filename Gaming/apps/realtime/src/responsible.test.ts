import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";
import { SOCKET_EVENTS } from "@aso/shared";

// env.ts validates required vars at import; set them before importing модулите.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://aso:aso@localhost:5437/aso?schema=public";
process.env.REDIS_URL ??= "redis://localhost:6383";
process.env.JWT_SECRET ??= "test-access-secret-that-is-long-enough-1234567890";

// ── Фалшива prisma + redis ────────────────────────────────────────────────────
const excludedUntil = new Map<string, Date>();
/** Дневен лимит (минути) и днешните мачове по играч. */
const limitOf = new Map<string, { dailyLimitMinutes: number | null; dailyLimitPendingMinutes?: number | null; dailyLimitPendingAt?: Date | null }>();
const matchesOf = new Map<string, Array<{ startedAt: Date; endedAt: Date | null }>>();
const zadd = vi.fn(async () => 1);
const zrem = vi.fn(async () => 1);
const matchCreate = vi.fn(async () => ({ id: "m_1" }));

vi.mock("@aso/db", () => ({
  prisma: {
    user: {
      // Връща кандидатите (самоизключване или лимит); кодът сам проверява кое е активно.
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in
          .filter((id) => excludedUntil.has(id) || limitOf.has(id))
          .map((id) => ({
            id,
            displayName: id,
            selfExcludedUntil: excludedUntil.get(id) ?? null,
            dailyLimitMinutes: limitOf.get(id)?.dailyLimitMinutes ?? null,
            dailyLimitPendingMinutes: limitOf.get(id)?.dailyLimitPendingMinutes ?? null,
            dailyLimitPendingAt: limitOf.get(id)?.dailyLimitPendingAt ?? null,
          })),
      ),
      findUnique: vi.fn(async () => ({ chips: 100_000n })),
    },
    ratingPerGame: { findUnique: vi.fn(async () => null) },
    match: { create: matchCreate },
    matchPlayer: {
      findMany: vi.fn(async ({ where }: { where: { userId: { in: string[] } } }) =>
        where.userId.in.flatMap((userId) => (matchesOf.get(userId) ?? []).map((match) => ({ userId, match }))),
      ),
    },
  },
}));

vi.mock("./redis.js", () => ({
  redis: {
    zadd,
    zrem,
    hset: vi.fn(async () => 1),
    hdel: vi.fn(async () => 1),
    sadd: vi.fn(async () => 1),
    smembers: vi.fn(async () => []),
    exists: vi.fn(async () => 1),
  },
}));

interface Emit {
  to: string;
  event: string;
  payload: { code?: string; until?: string };
}
const log: Emit[] = [];
const fakeIo = {
  to: (to: string) => ({
    emit: (event: string, payload: Emit["payload"]) => {
      log.push({ to, event, payload });
      return true;
    },
  }),
} as unknown as Server;

let Matchmaker: typeof import("./matchmaking.js").Matchmaker;
let LobbyManager: typeof import("./lobby.js").LobbyManager;
let playBlockedAmong: typeof import("./responsible.js").playBlockedAmong;
beforeAll(async () => {
  ({ Matchmaker } = await import("./matchmaking.js"));
  ({ LobbyManager } = await import("./lobby.js"));
  ({ playBlockedAmong } = await import("./responsible.js"));
});

beforeEach(() => {
  log.length = 0;
  excludedUntil.clear();
  limitOf.clear();
  matchesOf.clear();
  vi.clearAllMocks();
});

const unavailable = (userId: string) =>
  log.filter((e) => e.to === `u:${userId}` && e.event === SOCKET_EVENTS.ERROR && e.payload.code === "member_unavailable");
const limitErrors = (userId: string) =>
  log.filter((e) => e.to === `u:${userId}` && e.event === SOCKET_EVENTS.ERROR && e.payload.code === "daily_limit");
const selfExcludedErrors = (userId: string) =>
  log.filter((e) => e.to === `u:${userId}` && e.event === SOCKET_EVENTS.ERROR && e.payload.code === "self_excluded");

describe("отговорна игра — realtime отказва самоизключени", () => {
  it("playBlockedAmong връща само активните самоизключвания", async () => {
    excludedUntil.set("u_ex", new Date(Date.now() + 3_600_000));
    excludedUntil.set("u_old", new Date(Date.now() - 1000));
    const ex = await playBlockedAmong(["u_ex", "u_old", "u_ok"]);
    expect([...ex.keys()]).toEqual(["u_ex"]);
  });

  it("матчмейкинг: самоизключен не влиза в опашката и получава self_excluded", async () => {
    const until = new Date(Date.now() + 7 * 86_400_000);
    excludedUntil.set("u_ex", until);
    const mm = new Matchmaker(fakeIo);
    expect(await mm.joinQueue("u_ex", "SVARA")).toBe("self_excluded");
    expect(zadd).not.toHaveBeenCalled();
    const errs = selfExcludedErrors("u_ex");
    expect(errs).toHaveLength(1);
    expect(errs[0]!.payload.until).toBe(until.toISOString());

    // Без самоизключване влиза нормално.
    expect(await mm.joinQueue("u_ok", "SVARA")).toBe("joined");
    expect(zadd).toHaveBeenCalledTimes(1);
  });

  it("покана между приятели: няма частен мач, ако единият е самоизключен", async () => {
    excludedUntil.set("u_ex", new Date(Date.now() + 86_400_000));
    const mm = new Matchmaker(fakeIo);
    expect(await mm.createPrivateMatch(["u_ok", "u_ex"], "SVARA")).toBeNull();
    expect(matchCreate).not.toHaveBeenCalled();
    expect(selfExcludedErrors("u_ex")).toHaveLength(1);
    // Другият научава само, че някой от групата не може — не кой и не защо.
    expect(selfExcludedErrors("u_ok")).toHaveLength(0);
    expect(unavailable("u_ok")).toHaveLength(1);
  });

  it("лоби: самоизключен не може да създаде стая, нито да влезе в чужда", async () => {
    excludedUntil.set("u_ex", new Date(Date.now() + 86_400_000));
    const mm = new Matchmaker(fakeIo);
    const lobbies = new LobbyManager(fakeIo, mm, async (id) => id, playBlockedAmong);

    expect(await lobbies.create("u_ex", "SVARA", "custom", "public", null)).toBeNull();
    expect(lobbies.openCount()).toBe(0);

    const host = await lobbies.create("u_host", "SVARA", "custom", "public", null);
    expect(host).not.toBeNull();
    expect(await lobbies.join("u_ex", host!.id)).toBe(false);
    expect(host!.has("u_ex")).toBe(false);
    expect(selfExcludedErrors("u_ex")).toHaveLength(2);

    const ok = await lobbies.join("u_ok", host!.id);
    expect(ok && ok.has("u_ok")).toBe(true);
  });

  it("старт на стая: отказ, ако член се е самоизключил след влизането", async () => {
    const mm = new Matchmaker(fakeIo);
    const lobbies = new LobbyManager(fakeIo, mm, async (id) => id, playBlockedAmong);
    const lobby = (await lobbies.create("u_host", "SVARA", "custom", "public", null))!;
    await lobbies.join("u_late", lobby.id);
    excludedUntil.set("u_late", new Date(Date.now() + 86_400_000));
    await expect(mm.startFromLobby(lobby)).rejects.toThrow(/blocked member/);
    expect(matchCreate).not.toHaveBeenCalled();
    expect(selfExcludedErrors("u_late")).toHaveLength(1);
    expect(selfExcludedErrors("u_host")).toHaveLength(0);
    expect(unavailable("u_host")).toHaveLength(1);
  });
});

describe("отговорна игра — сървърът налага дневния лимит", () => {
  const MIN = 60_000;
  /** Мач, приключил преди `agoMin` минути и траял `lenMin` минути. */
  const match = (lenMin: number, agoMin = 1) => {
    const end = Date.now() - agoMin * MIN;
    return { startedAt: new Date(end - lenMin * MIN), endedAt: new Date(end) };
  };

  it("стигнат лимит → опашката отказва с daily_limit до началото на следващия ден", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-05-10T09:00:00Z"), toFake: ["Date"] }); // пладне в София
    try {
      limitOf.set("u_lim", { dailyLimitMinutes: 60 });
      matchesOf.set("u_lim", [match(35), match(25, 40)]);
      const mm = new Matchmaker(fakeIo);
      expect(await mm.joinQueue("u_lim", "SVARA")).toBe("daily_limit");
      expect(zadd).not.toHaveBeenCalled();
      const errs = limitErrors("u_lim");
      expect(errs).toHaveLength(1);
      expect(errs[0]!.payload.until).toBe("2026-05-10T21:00:00.000Z"); // полунощ в София (лятно)
    } finally {
      vi.useRealTimers();
    }
  });

  it("под лимита играе нормално; чакащото вдигане не важи преди 24-те часа", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-05-10T09:00:00Z"), toFake: ["Date"] });
    try {
      limitOf.set("u_under", { dailyLimitMinutes: 60 });
      matchesOf.set("u_under", [match(59)]);
      limitOf.set("u_wait", {
        dailyLimitMinutes: 30,
        dailyLimitPendingMinutes: 120,
        dailyLimitPendingAt: new Date(Date.now() + 3_600_000),
      });
      matchesOf.set("u_wait", [match(45)]);
      const blocked = await playBlockedAmong(["u_under", "u_wait"]);
      expect([...blocked.keys()]).toEqual(["u_wait"]);
      expect(blocked.get("u_wait")!.code).toBe("daily_limit");
    } finally {
      vi.useRealTimers();
    }
  });

  it("стая: стигнал лимита не създава и не влиза; съотборниците не научават причината", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-05-10T09:00:00Z"), toFake: ["Date"] });
    try {
      const mm = new Matchmaker(fakeIo);
      const lobbies = new LobbyManager(fakeIo, mm, async (id) => id, playBlockedAmong);
      const lobby = (await lobbies.create("u_host", "SVARA", "custom", "public", null))!;
      await lobbies.join("u_tired", lobby.id);
      limitOf.set("u_tired", { dailyLimitMinutes: 30 });
      matchesOf.set("u_tired", [match(31)]);
      expect(await lobbies.create("u_tired", "SVARA", "custom", "public", null)).toBeNull();
      await expect(mm.startFromLobby(lobby)).rejects.toThrow(/blocked member/);
      expect(matchCreate).not.toHaveBeenCalled();
      expect(limitErrors("u_tired").length).toBeGreaterThanOrEqual(2);
      expect(limitErrors("u_host")).toHaveLength(0);
      expect(unavailable("u_host")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
