import { beforeEach, describe, expect, it, vi } from "vitest";
import { VIP_PERKS, levelFromXp } from "@aso/shared";

// In-memory заместител на prisma за finalizeMatch (без Postgres).
interface FakeUser {
  chips: bigint;
  xp: number;
  level: number;
  vipTier: string;
  vipUntil: Date | null;
}
const users = new Map<string, FakeUser>();
let matchOpen = true;

vi.mock("@aso/db", () => {
  const user = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const u = users.get(where.id);
      return u ? { ...u } : null;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const u = users.get(where.id)!;
      for (const [k, v] of Object.entries(data)) {
        const rec = u as unknown as Record<string, unknown>;
        if (v && typeof v === "object" && "increment" in v) {
          const inc = (v as { increment: number | bigint }).increment;
          rec[k] = typeof rec[k] === "bigint" ? (rec[k] as bigint) + BigInt(inc) : (rec[k] as number) + Number(inc);
        } else {
          rec[k] = v;
        }
      }
      return { ...u };
    }),
  };
  const prisma = {
    user,
    match: {
      updateMany: vi.fn(async () => {
        const count = matchOpen ? 1 : 0;
        matchOpen = false;
        return { count };
      }),
    },
    ratingPerGame: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async ({ create }: { create: { mmr: number } }) => ({ mmr: create.mmr })),
    },
    matchPlayer: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { prisma };
});

const { finalizeMatch } = await import("./rating.js");

const DAY = 86_400_000;
const seats = [
  { seat: 0, userId: "a", isBot: false },
  { seat: 1, userId: null, isBot: true },
];
const win = (matchId: string) =>
  finalizeMatch({
    matchId,
    game: "CHESS",
    seats,
    score: [
      { seat: 0, result: "win" },
      { seat: 1, result: "loss" },
    ],
  });

beforeEach(() => {
  users.clear();
  matchOpen = true;
});

describe("finalizeMatch — опит, ниво и VIP", () => {
  it("записва level от новия xp (не остава 1)", async () => {
    users.set("a", { chips: 0n, xp: 95, level: 1, vipTier: "NONE", vipUntil: null });
    const r = await win("m1");
    const u = users.get("a")!;
    expect(r.rewards[0]!.xp).toBe(10);
    expect(u.xp).toBe(105);
    expect(u.level).toBe(2);
    expect(u.level).toBe(levelFromXp(u.xp).level);
  });

  it("активен VIP получава xp множителя", async () => {
    users.set("a", { chips: 0n, xp: 0, level: 1, vipTier: "PLATINUM", vipUntil: new Date(Date.now() + DAY) });
    const r = await win("m1");
    expect(r.rewards[0]!.xp).toBe(10 * VIP_PERKS.PLATINUM.xpMultiplier);
    expect(users.get("a")!.xp).toBe(15);
  });

  it("изтекъл VIP не получава множител", async () => {
    users.set("a", { chips: 0n, xp: 0, level: 1, vipTier: "PLATINUM", vipUntil: new Date(Date.now() - DAY) });
    const r = await win("m1");
    expect(r.rewards[0]!.xp).toBe(10);
    expect(users.get("a")!.xp).toBe(10);
  });
});
