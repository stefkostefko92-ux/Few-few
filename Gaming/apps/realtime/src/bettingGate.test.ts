import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";
import { BETTING_BUYIN, SOCKET_EVENTS } from "@aso/shared";

// Масата със залог (Свара) приема само играч с пълен залог в портфейла —
// и при влизане в опашката, и в момента на сядане (портфейлът може да е паднал).

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://aso:aso@localhost:5437/aso?schema=public";
process.env.REDIS_URL ??= "redis://localhost:6383";
process.env.JWT_SECRET ??= "test-access-secret-that-is-long-enough-1234567890";
process.env.BOT_FALLBACK_SECONDS = "1";

const wallet = new Map<string, bigint>();
const queue = new Map<string, number>(); // userId → mmr (една опашка mm:SVARA:ranked)
const joined = new Map<string, string>();
const matchCreate = vi.fn(async () => ({ id: "m_1" }));

vi.mock("@aso/db", () => ({
  prisma: {
    user: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id, displayName: id, selfExcludedUntil: null, dailyLimitMinutes: null })),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ chips: wallet.get(where.id) ?? 0n })),
    },
    ratingPerGame: { findUnique: vi.fn(async () => null) },
    match: { create: matchCreate },
    matchPlayer: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("./redis.js", () => ({
  redis: {
    zadd: vi.fn(async (_k: string, mmr: number, id: string) => {
      queue.set(id, mmr);
      return 1;
    }),
    zrem: vi.fn(async (_k: string, id: string) => (queue.delete(id) ? 1 : 0)),
    zrange: vi.fn(async () => [...queue.entries()].flatMap(([id, mmr]) => [id, String(mmr)])),
    hset: vi.fn(async (_h: string, f: string, v: string) => {
      joined.set(f, v);
      return 1;
    }),
    hget: vi.fn(async (_h: string, f: string) => joined.get(f) ?? null),
    hdel: vi.fn(async (_h: string, f: string) => (joined.delete(f) ? 1 : 0)),
    sadd: vi.fn(async () => 1),
    srem: vi.fn(async () => 1),
    smembers: vi.fn(async () => (queue.size ? ["mm:SVARA:ranked"] : [])),
    zscore: vi.fn(async () => null),
    exists: vi.fn(async () => 1),
  },
}));

interface Emit {
  to: string;
  event: string;
  payload: { code?: string };
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
beforeAll(async () => {
  ({ Matchmaker } = await import("./matchmaking.js"));
});
beforeEach(() => {
  wallet.clear();
  queue.clear();
  joined.clear();
  log.length = 0;
  vi.clearAllMocks();
});

const BUYIN = BigInt(BETTING_BUYIN.SVARA!);
const chipErrors = (id: string) =>
  log.filter((e) => e.to === `u:${id}` && e.event === SOCKET_EVENTS.ERROR && e.payload.code === "insufficient_chips");

describe("Свара — пълен залог в портфейла", () => {
  it("joinQueue отказва играч без пълен залог (сървърът решава, не клиентът)", async () => {
    wallet.set("poor", BUYIN - 1n);
    const mm = new Matchmaker(fakeIo);
    expect(await mm.joinQueue("poor", "SVARA")).toBe("insufficient_chips");
    expect(queue.has("poor")).toBe(false);
  });

  it("joinQueue приема играч с точно пълния залог", async () => {
    wallet.set("ok", BUYIN);
    const mm = new Matchmaker(fakeIo);
    expect(await mm.joinQueue("ok", "SVARA")).toBe("joined");
  });

  it("при сядане портфейлът се проверява пак: изпаднал под залога не сяда и научава защо", async () => {
    wallet.set("a", BUYIN);
    wallet.set("b", BUYIN);
    const mm = new Matchmaker(fakeIo);
    expect(await mm.joinQueue("a", "SVARA")).toBe("joined");
    expect(await mm.joinQueue("b", "SVARA")).toBe("joined");
    // Докато чакат, портфейлите падат (друга маса, админ дебит…).
    wallet.set("a", 0n);
    wallet.set("b", 0n);
    // Изтекло изчакване → ботовете биха допълнили масата.
    for (const f of joined.keys()) joined.set(f, String(Date.now() - 60_000));
    await (mm as unknown as { matchQueue(q: { game: string; mode: string }): Promise<void> }).matchQueue({
      game: "SVARA",
      mode: "ranked",
    });
    expect(matchCreate).not.toHaveBeenCalled();
    expect(queue.size).toBe(0);
    expect(chipErrors("a")).toHaveLength(1);
    expect(chipErrors("b")).toHaveLength(1);
  });
});
