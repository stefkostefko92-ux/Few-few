import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeSeason {
  id: string;
  index: number;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
}

const store: FakeSeason[] = [];

vi.mock("@aso/db", () => ({
  prisma: {
    season: {
      findFirst: vi.fn(async (args: { where?: { active?: boolean }; orderBy?: { index: "desc" } } = {}) => {
        let rows = store.filter((s) => args.where?.active === undefined || s.active === args.where.active);
        if (args.orderBy) rows = [...rows].sort((a, b) => b.index - a.index);
        return rows[0] ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeSeason> }) => {
        const row = store.find((s) => s.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { index: number };
          create: Omit<FakeSeason, "id">;
          update: Partial<FakeSeason>;
        }) => {
          const row = store.find((s) => s.index === where.index);
          if (row) return Object.assign(row, update);
          const made = { id: `s${store.length + 1}`, ...create };
          store.push(made);
          return made;
        },
      ),
    },
  },
}));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { env } from "../env.js";
import { rolloverSeasons } from "./seasons.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-14T12:00:00.000Z");

const season = (index: number, startsAt: Date, endsAt: Date, active: boolean): FakeSeason => ({
  id: `s${index}`,
  index,
  startsAt,
  endsAt,
  active,
});

describe("rolloverSeasons — смяна на сезона", () => {
  beforeEach(() => {
    store.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it("без никакви сезони отваря сезон 1 с продължителност SEASON_DAYS", async () => {
    await rolloverSeasons();
    expect(store).toHaveLength(1);
    expect(store[0]).toMatchObject({ index: 1, active: true, startsAt: NOW });
    expect(store[0]!.endsAt.getTime()).toBe(NOW.getTime() + env.SEASON_DAYS * DAY);
  });

  it("сезон, който още не е изтекъл, остава непипнат", async () => {
    const ends = new Date(NOW.getTime() + 1);
    store.push(season(3, new Date(NOW.getTime() - DAY), ends, true));
    await rolloverSeasons();
    expect(store).toHaveLength(1);
    expect(store[0]).toMatchObject({ index: 3, active: true, endsAt: ends });
  });

  it("сезон, изтичащ точно сега (endsAt === now), се затваря и се отваря следващият", async () => {
    store.push(season(3, new Date(NOW.getTime() - 35 * DAY), new Date(NOW), true));
    await rolloverSeasons();
    expect(store.find((s) => s.index === 3)!.active).toBe(false);
    expect(store.find((s) => s.index === 4)).toMatchObject({ active: true, startsAt: NOW });
    expect(store.filter((s) => s.active)).toHaveLength(1);
  });

  it("отдавна изтекъл сезон също води до смяна, а новият започва от „сега“", async () => {
    store.push(season(1, new Date(NOW.getTime() - 90 * DAY), new Date(NOW.getTime() - 55 * DAY), true));
    await rolloverSeasons();
    expect(store.find((s) => s.index === 2)!.startsAt).toEqual(NOW);
    expect(store.find((s) => s.index === 1)!.active).toBe(false);
  });

  it("е идемпотентна: повторно пускане не създава нов сезон и не мести крайния срок", async () => {
    store.push(season(1, new Date(NOW.getTime() - 40 * DAY), new Date(NOW.getTime() - 5 * DAY), true));
    await rolloverSeasons();
    const snapshot = JSON.parse(JSON.stringify(store));
    await rolloverSeasons();
    await rolloverSeasons();
    expect(JSON.parse(JSON.stringify(store))).toEqual(snapshot);
    expect(store).toHaveLength(2);
  });

  it("регресия: без активен сезон продължава след последния и не презаписва архивния сезон 1", async () => {
    const s1Start = new Date("2026-01-01T00:00:00.000Z");
    const s1End = new Date("2026-02-05T00:00:00.000Z");
    store.push(season(1, s1Start, s1End, false));
    store.push(season(2, new Date("2026-02-05T00:00:00.000Z"), new Date("2026-03-12T00:00:00.000Z"), false));
    await rolloverSeasons();
    expect(store.find((s) => s.index === 1)).toMatchObject({ active: false, startsAt: s1Start, endsAt: s1End });
    expect(store.find((s) => s.index === 3)).toMatchObject({ active: true, startsAt: NOW });
    expect(store.filter((s) => s.active)).toHaveLength(1);
  });

  it("ако следващият индекс вече съществува (неактивен), го активира наново вместо да дублира", async () => {
    store.push(season(1, new Date(NOW.getTime() - 40 * DAY), new Date(NOW.getTime() - DAY), true));
    store.push(season(2, new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-02T00:00:00.000Z"), false));
    await rolloverSeasons();
    expect(store).toHaveLength(2);
    expect(store.find((s) => s.index === 2)).toMatchObject({ active: true, startsAt: NOW });
  });

  it("не пипа рейтинги или награди — сменя само записите на сезоните", async () => {
    const { prisma } = await import("@aso/db");
    store.push(season(1, new Date(NOW.getTime() - 40 * DAY), new Date(NOW.getTime() - DAY), true));
    await rolloverSeasons();
    // Моковият prisma има само `season`; всяко друго обръщение би хвърлило.
    expect(Object.keys(prisma)).toEqual(["season"]);
  });
});
