import { beforeEach, describe, expect, it, vi } from "vitest";

interface Where {
  period?: { startsWith: string };
  NOT?: { period: string };
  OR?: Where[];
}

let rows: { id: string; period: string }[] = [];

const matches = (w: Where, period: string): boolean =>
  (w.OR ? w.OR.some((c) => matches(c, period)) : true) &&
  (w.period ? period.startsWith(w.period.startsWith) : true) &&
  (w.NOT ? period !== w.NOT.period : true);

vi.mock("@aso/db", () => ({
  prisma: {
    quest: {
      deleteMany: vi.fn(async ({ where }: { where: Where }) => {
        const before = rows.length;
        rows = rows.filter((r) => !matches(where, r.period));
        return { count: before - rows.length };
      }),
    },
  },
}));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { isoWeek } from "@aso/shared";
import { cleanupQuests } from "./quests.js";

const seed = (...periods: string[]) => {
  rows = periods.map((period, i) => ({ id: `q${i}`, period }));
};
const left = () => rows.map((r) => r.period).sort();

describe("cleanupQuests — жизнен цикъл на мисиите", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T12:00:00.000Z")); // събота, ISO 2026-W46
  });

  it("чисти вчерашните и по-старите дневни мисии, днешните остават", async () => {
    seed("d:2026-11-13", "d:2026-11-14", "d:2026-01-01");
    await cleanupQuests();
    expect(left()).toEqual(["d:2026-11-14"]);
  });

  it("чисти минали седмични мисии, текущата седмица остава (регресия: преди не се чистеха)", async () => {
    seed("w:2026-W45", "w:2026-W46", "w:2025-W52");
    await cleanupQuests();
    expect(left()).toEqual(["w:2026-W46"]);
  });

  it("не пипа непознати периоди и вдига броя само при реално изтриване", async () => {
    seed("d:2026-11-14", "w:2026-W46", "event:xmas");
    await cleanupQuests();
    expect(left()).toEqual(["d:2026-11-14", "event:xmas", "w:2026-W46"]);
  });

  it("е идемпотентна при повторно пускане", async () => {
    seed("d:2026-11-13", "w:2026-W45", "d:2026-11-14");
    await cleanupQuests();
    await cleanupQuests();
    expect(left()).toEqual(["d:2026-11-14"]);
  });

  it("границата на деня е UTC: 23:59:59.999Z още пази деня, 00:00:00.000Z го сменя", async () => {
    seed("d:2026-11-14", "d:2026-11-15");
    await cleanupQuests(new Date("2026-11-14T23:59:59.999Z"));
    expect(left()).toEqual(["d:2026-11-14"]);
    seed("d:2026-11-14", "d:2026-11-15");
    await cleanupQuests(new Date("2026-11-15T00:00:00.000Z"));
    expect(left()).toEqual(["d:2026-11-15"]);
  });

  it("границата на седмицата е UTC: неделя 23:59Z е още W46, понеделник 00:00Z е W47", async () => {
    seed("w:2026-W46", "w:2026-W47");
    await cleanupQuests(new Date("2026-11-15T23:59:59.999Z"));
    expect(left()).toEqual(["w:2026-W46"]);
    seed("w:2026-W46", "w:2026-W47");
    await cleanupQuests(new Date("2026-11-16T00:00:00.000Z"));
    expect(left()).toEqual(["w:2026-W47"]);
  });

  it("без стари редове не прави нищо (нула изтрити)", async () => {
    seed("d:2026-11-14");
    await cleanupQuests();
    expect(rows).toHaveLength(1);
  });
});

describe("isoWeek (общ с API-то, от @aso/shared)", () => {
  it.each([
    ["2026-01-01T00:00:00Z", "2026-W01"],
    ["2020-12-31T12:00:00Z", "2020-W53"],
    ["2021-01-03T23:59:59Z", "2020-W53"],
    ["2024-12-30T00:00:00Z", "2025-W01"],
    ["2026-11-14T12:00:00Z", "2026-W46"],
  ])("%s -> %s", (iso, expected) => {
    expect(isoWeek(new Date(iso))).toBe(expected);
  });
});
