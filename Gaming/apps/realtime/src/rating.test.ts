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
const ledgerRows: Array<Record<string, unknown>> = [];
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
    // Условен запис (gte / точна стойност) — атомарен като в Postgres.
    updateMany: vi.fn(
      async ({ where, data }: { where: { id: string; chips?: bigint | { gte: bigint } }; data: { chips: { decrement?: bigint; increment?: bigint } } }) => {
        const u = users.get(where.id);
        if (!u) return { count: 0 };
        const c = where.chips;
        if (typeof c === "bigint" && u.chips !== c) return { count: 0 };
        if (c && typeof c === "object" && u.chips < c.gte) return { count: 0 };
        u.chips = u.chips - (data.chips.decrement ?? 0n) + (data.chips.increment ?? 0n);
        return { count: 1 };
      },
    ),
  };
  const prisma = {
    currencyLedger: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        ledgerRows.push(data);
        return data;
      }),
    },
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
  ledgerRows.length = 0;
  matchOpen = true;
});

describe("Свара — залогът (решение: без залог срещу бот, нулева сума между хора)", () => {
  const human = (chips: bigint): FakeUser => ({ chips, xp: 0, level: 1, vipTier: "NONE", vipUntil: null });
  // Старт 500 единици на място; 1000 = удвоен стек (+залог), 0 = фалит (−залог).
  const svara = (matchId: string, seatsIn: Array<{ seat: number; userId: string | null; isBot: boolean }>, points: number[]) =>
    finalizeMatch({
      matchId,
      game: "SVARA",
      seats: seatsIn,
      score: points.map((p, seat) => ({ seat, result: p > 500 ? "win" : "loss", points: p })),
    });

  it("срещу бот: печалбата не създава чипове", async () => {
    users.set("a", human(1000n));
    const r = await svara("mb1", [{ seat: 0, userId: "a", isBot: false }, { seat: 1, userId: null, isBot: true }], [1000, 0]);
    expect(users.get("a")!.chips).toBe(1000n);
    expect(r.rewards[0]!.chips).toBe(0);
  });

  it("срещу бот: загубата не взема чипове", async () => {
    users.set("a", human(1000n));
    const r = await svara("mb2", [{ seat: 0, userId: "a", isBot: false }, { seat: 1, userId: null, isBot: true }], [0, 1000]);
    expect(users.get("a")!.chips).toBe(1000n);
    expect(r.rewards[0]!.chips).toBe(0);
  });

  it("между хора: нулева сума — печелившият получава точно взетото от загубилия", async () => {
    users.set("a", human(1000n));
    users.set("b", human(1000n));
    const r = await svara("mh1", [{ seat: 0, userId: "a", isBot: false }, { seat: 1, userId: "b", isBot: false }], [1000, 0]);
    expect(users.get("a")!.chips).toBe(1200n);
    expect(users.get("b")!.chips).toBe(800n);
    expect(r.rewards[0]!.chips + r.rewards[1]!.chips).toBe(0);
    expect(ledgerRows).toContainEqual(expect.objectContaining({ userId: "a", currency: "CHIPS", delta: 200n, reason: "MATCH", refId: "mh1" }));
    expect(ledgerRows).toContainEqual(expect.objectContaining({ userId: "b", currency: "CHIPS", delta: -200n, reason: "MATCH", refId: "mh1" }));
  });

  it("между хора: загубилият няма достатъчно → печелившият получава само реално взетото", async () => {
    users.set("a", human(1000n));
    users.set("b", human(50n));
    const r = await svara("mh2", [{ seat: 0, userId: "a", isBot: false }, { seat: 1, userId: "b", isBot: false }], [1000, 0]);
    expect(users.get("b")!.chips).toBe(0n);
    expect(users.get("a")!.chips).toBe(1050n);
    expect(r.rewards[0]!.chips).toBe(50);
    expect(r.rewards[1]!.chips).toBe(-50);
  });

  it("трима играчи: сумата на движенията е 0 (без създадени/изгубени чипове)", async () => {
    users.set("a", human(1000n));
    users.set("b", human(1000n));
    users.set("c", human(30n));
    await svara(
      "mh3",
      [{ seat: 0, userId: "a", isBot: false }, { seat: 1, userId: "b", isBot: false }, { seat: 2, userId: "c", isBot: false }],
      [1250, 250, 0],
    );
    const total = ["a", "b", "c"].reduce((s, id) => s + users.get(id)!.chips, 0n);
    expect(total).toBe(2030n);
    for (const id of ["a", "b", "c"]) expect(users.get(id)!.chips >= 0n).toBe(true);
  });

  /** chipsΔ по място (rewards е обект seat → награда). */
  const chipsBySeat = (r: Awaited<ReturnType<typeof svara>>, n: number) => Array.from({ length: n }, (_, i) => r.rewards[i]!.chips);
  const three = [
    { seat: 0, userId: "a", isBot: false },
    { seat: 1, userId: "b", isBot: false },
    { seat: 2, userId: "c", isBot: false },
  ];

  it("равенство: всички завършват с началния стек → никой не плаща, нищо не се създава", async () => {
    users.set("a", human(1000n));
    users.set("b", human(1000n));
    const r = await svara("mt1", three.slice(0, 2), [500, 500]);
    expect(users.get("a")!.chips).toBe(1000n);
    expect(users.get("b")!.chips).toBe(1000n);
    expect(chipsBySeat(r, 2)).toEqual([0, 0]);
    expect(ledgerRows.filter((l) => l.reason === "MATCH" && l.delta !== 0n)).toHaveLength(0);
  });

  it("равни победители делят нечетното реално взето детерминистично (51/50), сумата е 0", async () => {
    users.set("a", human(1000n));
    users.set("b", human(1000n));
    users.set("c", human(101n)); // дължи 200, има 101
    // Номинално: +100, +100, −200.
    const r = await svara("mt2", three, [750, 750, 0]);
    expect(users.get("c")!.chips).toBe(0n);
    expect(users.get("a")!.chips).toBe(1051n); // остатъкът — към по-малкото място
    expect(users.get("b")!.chips).toBe(1050n);
    expect(chipsBySeat(r, 3).reduce((sum, x) => sum + x, 0)).toBe(0);
  });

  it("няколко загубили под тавана: печелившият получава само сбора на реално взетото", async () => {
    users.set("a", human(1000n));
    users.set("b", human(30n));
    users.set("c", human(70n));
    // Номинално: +400, −200, −200; загубилите имат общо 100.
    const r = await svara("mt3", three, [1500, 0, 0]);
    expect(users.get("b")!.chips).toBe(0n);
    expect(users.get("c")!.chips).toBe(0n);
    expect(users.get("a")!.chips).toBe(1100n);
    expect(chipsBySeat(r, 3)).toEqual([100, -30, -70]);
  });

  it("единият загубил под тавана, другият плаща целия залог", async () => {
    users.set("a", human(1000n));
    users.set("b", human(1000n));
    users.set("c", human(70n));
    const r = await svara("mt4", three, [1500, 0, 0]);
    expect(users.get("b")!.chips).toBe(800n);
    expect(users.get("c")!.chips).toBe(0n);
    expect(users.get("a")!.chips).toBe(1270n);
    expect(chipsBySeat(r, 3)).toEqual([270, -200, -70]);
  });
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

describe("наградата не зависи от собствените точки на играта", () => {
  it("победа с много точки (Сантасе 11, Домино 104, снукър 70) носи стандартните 25 чипа / 10 XP", async () => {
    const { rewards } = await import("./rating.js");
    expect(rewards("win")).toEqual({ chips: 25n, xp: 10 });
    expect(rewards("win", undefined)).toEqual({ chips: 25n, xp: 10 });
  });
  it("само изричен margin увеличава наградата (до ×3)", async () => {
    const { rewards } = await import("./rating.js");
    expect(rewards("win", 2)).toEqual({ chips: 50n, xp: 20 });
    expect(rewards("win", 9)).toEqual({ chips: 75n, xp: 30 });
    expect(rewards("draw", 3)).toEqual({ chips: 10n, xp: 5 });
    expect(rewards("loss", 3)).toEqual({ chips: 0n, xp: 3 });
  });
});
