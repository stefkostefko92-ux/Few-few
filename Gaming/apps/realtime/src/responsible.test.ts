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
const zadd = vi.fn(async () => 1);
const zrem = vi.fn(async () => 1);
const matchCreate = vi.fn(async () => ({ id: "m_1" }));

vi.mock("@aso/db", () => ({
  prisma: {
    user: {
      findMany: vi.fn(
        async ({ where }: { where: { id: { in: string[] }; selfExcludedUntil?: { gt: Date } } }) =>
          where.id.in
            .filter((id) => {
              const until = excludedUntil.get(id);
              return until && (!where.selfExcludedUntil || until > where.selfExcludedUntil.gt);
            })
            .map((id) => ({ id, selfExcludedUntil: excludedUntil.get(id)!, displayName: id })),
      ),
      findUnique: vi.fn(async () => ({ chips: 100_000n })),
    },
    ratingPerGame: { findUnique: vi.fn(async () => null) },
    match: { create: matchCreate },
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
let selfExcludedAmong: typeof import("./responsible.js").selfExcludedAmong;
beforeAll(async () => {
  ({ Matchmaker } = await import("./matchmaking.js"));
  ({ LobbyManager } = await import("./lobby.js"));
  ({ selfExcludedAmong } = await import("./responsible.js"));
});

beforeEach(() => {
  log.length = 0;
  excludedUntil.clear();
  vi.clearAllMocks();
});

const selfExcludedErrors = (userId: string) =>
  log.filter((e) => e.to === `u:${userId}` && e.event === SOCKET_EVENTS.ERROR && e.payload.code === "self_excluded");

describe("отговорна игра — realtime отказва самоизключени", () => {
  it("selfExcludedAmong връща само активните", async () => {
    excludedUntil.set("u_ex", new Date(Date.now() + 3_600_000));
    excludedUntil.set("u_old", new Date(Date.now() - 1000));
    const ex = await selfExcludedAmong(["u_ex", "u_old", "u_ok"]);
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
    expect(selfExcludedErrors("u_ok")).toHaveLength(1); // другият научава защо
  });

  it("лоби: самоизключен не може да създаде стая, нито да влезе в чужда", async () => {
    excludedUntil.set("u_ex", new Date(Date.now() + 86_400_000));
    const mm = new Matchmaker(fakeIo);
    const lobbies = new LobbyManager(fakeIo, mm, async (id) => id, selfExcludedAmong);

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
    const lobbies = new LobbyManager(fakeIo, mm, async (id) => id, selfExcludedAmong);
    const lobby = (await lobbies.create("u_host", "SVARA", "custom", "public", null))!;
    await lobbies.join("u_late", lobby.id);
    excludedUntil.set("u_late", new Date(Date.now() + 86_400_000));
    await expect(mm.startFromLobby(lobby)).rejects.toThrow(/self-excluded/);
    expect(matchCreate).not.toHaveBeenCalled();
    expect(selfExcludedErrors("u_late")).toHaveLength(1);
    expect(selfExcludedErrors("u_host")).toHaveLength(1);
  });
});
