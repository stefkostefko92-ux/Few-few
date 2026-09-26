import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROTATING_DAILY_COUNT, VIP_PERKS, activeQuests, dailyReward, levelFromXp } from "@aso/shared";

// ── In-memory заместители на Postgres (prisma) и Redis ──────────────────────
interface FakeUser {
  id: string;
  chips: bigint;
  gems: number;
  xp: number;
  level: number;
  vipTier: string;
  vipUntil: Date | null;
}
interface FakeQuest {
  id: string;
  userId: string;
  key: string;
  period: string;
  progress: number;
  target: number;
  completedAt: Date | null;
}

const users = new Map<string, FakeUser>();
const quests: FakeQuest[] = [];
const kv = new Map<string, string>();
let qSeq = 0;

type Data = Record<string, unknown>;
const applyUserData = (u: FakeUser, data: Data): void => {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "increment" in v) {
      const inc = (v as { increment: number | bigint }).increment;
      const cur = u[k as keyof FakeUser];
      (u as unknown as Record<string, unknown>)[k] =
        typeof cur === "bigint" ? cur + BigInt(inc) : (cur as number) + Number(inc);
    } else {
      (u as unknown as Record<string, unknown>)[k] = v;
    }
  }
};

vi.mock("@aso/db", () => {
  const user = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const u = users.get(where.id);
      return u ? { ...u } : null;
    }),
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => users.get(id)).filter(Boolean).map((u) => ({ ...u })),
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Data }) => {
      const u = users.get(where.id);
      if (!u) throw new Error("user not found");
      applyUserData(u, data);
      return { ...u };
    }),
  };
  const quest = {
    upsert: vi.fn(
      async ({ where, create }: { where: { userId_key_period: { userId: string; key: string; period: string } }; create: Omit<FakeQuest, "id" | "completedAt"> }) => {
        const w = where.userId_key_period;
        let row = quests.find((q) => q.userId === w.userId && q.key === w.key && q.period === w.period);
        if (!row) {
          row = { ...create, id: `q${++qSeq}`, completedAt: null };
          quests.push(row);
        }
        return { ...row };
      },
    ),
    findFirst: vi.fn(async ({ where }: { where: { userId: string; key: string; period: string } }) => {
      const row = quests.find((q) => q.userId === where.userId && q.key === where.key && q.period === where.period);
      return row ? { ...row } : null;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeQuest> }) => {
      const row = quests.find((q) => q.id === where.id)!;
      Object.assign(row, data);
      return { ...row };
    }),
  };
  const prisma = {
    user,
    quest,
    ratingPerGame: { findMany: vi.fn(async () => []) },
    achievement: { findMany: vi.fn(async () => []), create: vi.fn(async () => ({})) },
    notification: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { prisma };
});

vi.mock("../redis.js", () => ({
  redis: {
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes("NX") && kv.has(key)) return null;
      kv.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => kv.get(key) ?? null),
    incr: vi.fn(async (key: string) => {
      const n = Number(kv.get(key) ?? 0) + 1;
      kv.set(key, String(n));
      return n;
    }),
    expire: vi.fn(async () => 1),
    zadd: vi.fn(async () => 1),
  },
}));

const { claimDaily, ensureQuests, recordMatchResult } = await import("./service.js");
const { toPublicUser } = await import("../routes/users.js");

const DAY = 86_400_000;
const seed = (over: Partial<FakeUser> = {}): FakeUser => {
  const u: FakeUser = { id: "u1", chips: 0n, gems: 0, xp: 0, level: 1, vipTier: "NONE", vipUntil: null, ...over };
  users.set(u.id, u);
  return u;
};
const today = () => new Date().toISOString().slice(0, 10);

beforeEach(() => {
  users.clear();
  quests.length = 0;
  kv.clear();
});

describe("дневен бонус × VIP", () => {
  it("без VIP — базовата награда", async () => {
    seed();
    const r = await claimDaily("u1");
    expect(r.chips).toBe(dailyReward(1).chips);
    expect(users.get("u1")!.chips).toBe(BigInt(dailyReward(1).chips));
  });

  it("активен VIP умножава чиповете", async () => {
    seed({ vipTier: "PLATINUM", vipUntil: new Date(Date.now() + 30 * DAY) });
    const r = await claimDaily("u1");
    expect(r.chips).toBe(dailyReward(1).chips * VIP_PERKS.PLATINUM.dailyChipMultiplier);
    expect(users.get("u1")!.chips).toBe(BigInt(r.chips));
  });

  it("изтекъл VIP не получава множител", async () => {
    seed({ vipTier: "PLATINUM", vipUntil: new Date(Date.now() - DAY) });
    const r = await claimDaily("u1");
    expect(r.chips).toBe(dailyReward(1).chips);
  });
});

describe("брой мисии по VIP слотове", () => {
  it("без VIP — основните + базовите ротиращи", async () => {
    seed();
    const q = await ensureQuests("u1");
    expect(q.length).toBe(activeQuests(today()).length);
  });

  it("GOLD получава допълнителни ротиращи задачи и показва опита с множител", async () => {
    seed({ vipTier: "GOLD", vipUntil: new Date(Date.now() + DAY) });
    const q = await ensureQuests("u1");
    const extra = VIP_PERKS.GOLD.questSlots - ROTATING_DAILY_COUNT;
    expect(q.length).toBe(activeQuests(today()).length + extra);
    const play3 = q.find((x) => x.key === "play_3")!;
    expect(play3.rewardXp).toBe(Math.round(30 * VIP_PERKS.GOLD.xpMultiplier));
  });

  it("изтекъл VIP — само базовите слотове", async () => {
    seed({ vipTier: "GOLD", vipUntil: new Date(Date.now() - DAY) });
    const q = await ensureQuests("u1");
    expect(q.length).toBe(activeQuests(today()).length);
  });
});

describe("опит от мисии: VIP множител + записано ниво", () => {
  const finishWin = (matchId: string) =>
    recordMatchResult({ matchId, userId: "u1", game: "CHESS", won: true, rating: 1200, displayName: "Иван" });

  it("завършена мисия записва xp И level в синхрон", async () => {
    // xp точно под прага за ниво 2; наградата за „win_1“ (40 xp) го прескача.
    seed({ xp: 90 });
    await finishWin("m1");
    const u = users.get("u1")!;
    expect(u.xp).toBeGreaterThanOrEqual(130);
    expect(u.level).toBe(levelFromXp(u.xp).level);
    expect(u.level).toBeGreaterThanOrEqual(2);
  });

  it("активен VIP получава умножен опит от мисия", async () => {
    seed({ vipTier: "PLATINUM", vipUntil: new Date(Date.now() + DAY) });
    const free = seed({ id: "u2" });
    await finishWin("m1");
    await recordMatchResult({ matchId: "m1", userId: "u2", game: "CHESS", won: true, rating: 1200, displayName: "Мария" });
    const vip = users.get("u1")!;
    expect(vip.xp).toBeGreaterThan(0);
    expect(vip.xp).toBe(Math.round(free.xp * VIP_PERKS.PLATINUM.xpMultiplier));
    expect(vip.level).toBe(levelFromXp(vip.xp).level);
  });

  it("изтекъл VIP не получава множител от мисия", async () => {
    seed({ vipTier: "PLATINUM", vipUntil: new Date(Date.now() - DAY) });
    const free = seed({ id: "u2" });
    await finishWin("m1");
    await recordMatchResult({ matchId: "m1", userId: "u2", game: "CHESS", won: true, rating: 1200, displayName: "Мария" });
    expect(users.get("u1")!.xp).toBe(free.xp);
  });
});

describe("toPublicUser", () => {
  const base = {
    email: "a@b.bg", emailVerified: true, displayName: "Иван", role: "PLAYER", locale: "bg",
    chips: 10n, gems: 0,
  };

  it("смята нивото от xp (стари акаунти със застояла колона level = 1)", () => {
    const pub = toPublicUser({ ...base, id: "x", xp: 1000, level: 1, vipTier: "NONE", vipUntil: null } as never);
    expect(pub.level).toBe(levelFromXp(1000).level);
    expect(pub.level).toBeGreaterThan(1);
  });

  it("изтекъл VIP се показва като NONE", () => {
    const pub = toPublicUser({ ...base, id: "x", xp: 0, level: 1, vipTier: "GOLD", vipUntil: new Date(Date.now() - DAY) } as never);
    expect(pub.vipTier).toBe("NONE");
    const live = toPublicUser({ ...base, id: "x", xp: 0, level: 1, vipTier: "GOLD", vipUntil: new Date(Date.now() + DAY) } as never);
    expect(live.vipTier).toBe("GOLD");
  });
});
