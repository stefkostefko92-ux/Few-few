// backend/src/__tests__/season.test.js
// v50 — Server Season, етап 4: сезоните са в базата (lib/game/seasons.js —
// текущ = най-новият започнал, seed S1 при празна таблица, кеш, валидация),
// а краят на сезона е идемпотентен (условен updateMany по lastSeasonId),
// нулира САМО seasonXp и известява бота с топ 3.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
const notifyBot = vi.fn().mockResolvedValue({ ok: true });
vi.mock("../services/botNotifier.js", () => ({ notifyBot: (...a) => notifyBot(...a), dmUser: vi.fn() }));

const seasons = await import("../lib/game/seasons.js");
const season = await import("../lib/game/season.js");
const { DEFAULT_SEASON } = await import("../lib/game/companions.js");
const SID = "222222222222222222";
const S1 = { id: "x1", code: "S1", name: "Season 1 — First Light", startsAt: new Date("2026-09-21T00:00:00Z"), endsAt: new Date("2026-12-14T00:00:00Z"), companionIds: ["gold-midas"] };
const S2 = { id: "x2", code: "S2", name: "Season 2", startsAt: new Date("2026-12-14T00:00:00Z"), endsAt: new Date("2027-03-14T00:00:00Z"), companionIds: [] };

beforeEach(() => { vi.clearAllMocks(); seasons.invalidateSeasonCache(); });

describe("сезоните в базата", () => {
  it("текущ = най-новият започнал; преди първия старт — най-ранният предстоящ; празно → null", () => {
    expect(seasons.pickCurrent([S2, S1], new Date("2026-10-01T00:00:00Z")).code).toBe("S1");
    expect(seasons.pickCurrent([S2, S1], new Date("2026-12-20T00:00:00Z")).code).toBe("S2");
    expect(seasons.pickCurrent([S2, S1], new Date("2026-01-01T00:00:00Z")).code).toBe("S1");
    expect(seasons.pickCurrent([], new Date())).toBeNull();
  });
  it("празна таблица → записва S1 по подразбиране (upsert по code) и го връща; после кешира", async () => {
    prismaMock.gameSeason.findMany.mockResolvedValueOnce([]);
    prismaMock.gameSeason.upsert.mockImplementationOnce(async ({ create }) => ({ id: "seed", ...create }));
    const cur = await seasons.getCurrentSeason({ now: new Date("2026-10-01T00:00:00Z") });
    expect(cur.code).toBe(DEFAULT_SEASON.code);
    expect(prismaMock.gameSeason.upsert.mock.calls[0][0].where).toEqual({ code: "S1" });
    expect(cur.companionIds).toEqual([...DEFAULT_SEASON.companionIds]);
    await seasons.getCurrentSeason();
    expect(prismaMock.gameSeason.findMany).toHaveBeenCalledTimes(1); // кеш
    seasons.invalidateSeasonCache();
    prismaMock.gameSeason.findMany.mockResolvedValueOnce([S1]);
    expect((await seasons.getCurrentSeason()).id).toBe("x1");
  });
  it("валидация: код, дати, непознати/дублирани спътници; публичното представяне носи active/ended", () => {
    expect(seasons.validateSeasonInput({ code: "s2", name: "x", startsAt: "2027-01-01T00:00:00Z", endsAt: "2027-02-01T00:00:00Z" }).ok).toBe(false);
    expect(seasons.validateSeasonInput({ code: "S2", name: "x", startsAt: "2027-02-01T00:00:00Z", endsAt: "2027-01-01T00:00:00Z" }).ok).toBe(false);
    expect(seasons.validateSeasonInput({ code: "S2", name: "x", startsAt: "2027-01-01T00:00:00Z", endsAt: "2027-02-01T00:00:00Z", companionIds: ["nope"] }).ok).toBe(false);
    expect(seasons.validateSeasonInput({ code: "S2", name: "x", startsAt: "2027-01-01T00:00:00Z", endsAt: "2027-02-01T00:00:00Z", companionIds: ["gold-midas", "gold-midas"] }).ok).toBe(false);
    expect(seasons.validateSeasonInput({ code: "S2", name: "x", startsAt: "2027-01-01T00:00:00Z", endsAt: "2027-02-01T00:00:00Z", companionIds: ["gold-midas"] }).ok).toBe(true);
    expect(seasons.publicSeason(S1, new Date("2026-10-01T00:00:00Z"))).toMatchObject({ id: "S1", code: "S1", active: true, ended: false });
    expect(seasons.publicSeason(S1, new Date("2027-01-01T00:00:00Z"))).toMatchObject({ active: false, ended: true });
  });
  it("create: дубликат (P2002) → DUPLICATE; update: непознат → NOT_FOUND, слети дати се валидират", async () => {
    prismaMock.gameSeason.create.mockRejectedValueOnce({ code: "P2002" });
    expect((await seasons.createSeason({ code: "S1", name: "x", startsAt: "2027-01-01T00:00:00Z", endsAt: "2027-02-01T00:00:00Z" })).code).toBe("DUPLICATE");
    prismaMock.gameSeason.findUnique.mockResolvedValueOnce(null);
    expect((await seasons.updateSeason("S9", { name: "y" })).code).toBe("NOT_FOUND");
    prismaMock.gameSeason.findUnique.mockResolvedValueOnce(S1);
    expect((await seasons.updateSeason("S1", { endsAt: "2026-09-01T00:00:00Z" })).code).toBe("INVALID"); // край преди старта
    prismaMock.gameSeason.findUnique.mockResolvedValueOnce(S1);
    prismaMock.gameSeason.update.mockImplementationOnce(async ({ data }) => ({ ...S1, ...data }));
    const ok = await seasons.updateSeason("S1", { name: "  Renamed ", companionIds: ["ember-ignatius"] });
    expect(ok.ok).toBe(true); expect(ok.season.name).toBe("Renamed"); expect(ok.season.companionIds).toEqual(["ember-ignatius"]);
  });
});

describe("сезоните не се застъпват (одит 25.09.2026)", () => {
  it("нов сезон, който се застъпва, → OVERLAP; допиращ се (край S1 = старт S2) минава", async () => {
    prismaMock.gameSeason.findMany.mockResolvedValue([S1]);
    const bad = await seasons.createSeason({ code: "S2", name: "x", startsAt: "2026-12-01T00:00:00Z", endsAt: "2027-03-01T00:00:00Z" });
    expect(bad).toMatchObject({ ok: false, code: "OVERLAP" });
    expect(prismaMock.gameSeason.create).not.toHaveBeenCalled();
    prismaMock.gameSeason.create.mockImplementationOnce(async ({ data }) => ({ id: "x2", ...data }));
    const ok = await seasons.createSeason({ code: "S2", name: "x", startsAt: "2026-12-14T00:00:00Z", endsAt: "2027-03-14T00:00:00Z" });
    expect(ok.ok).toBe(true);
  });
  it("удължаване на S1 върху вече създадения S2 → OVERLAP; промяна на самия S1 без застъпване минава", async () => {
    prismaMock.gameSeason.findMany.mockResolvedValue([S2, S1]);
    prismaMock.gameSeason.findUnique.mockResolvedValue(S1);
    expect((await seasons.updateSeason("S1", { endsAt: "2027-01-01T00:00:00Z" })).code).toBe("OVERLAP");
    prismaMock.gameSeason.update.mockImplementationOnce(async ({ data }) => ({ ...S1, ...data }));
    expect((await seasons.updateSeason("S1", { name: "Renamed" })).ok).toBe(true);
  });
});

describe("краят на сезона", () => {
  it("преди края на последния сезон — нищо (нито четене на сървъри, нито писане)", async () => {
    prismaMock.gameSeason.findMany.mockResolvedValueOnce([S1]);
    expect(await season.closeSeasonIfEnded(new Date("2026-12-13T23:59:59Z"))).toEqual({ closed: 0, ended: false });
    expect(prismaMock.gameSettings.findMany).not.toHaveBeenCalled();
  });
  it("след края: топ 3 → бот, seasonXp → 0 за сървъра, lastSeasonId = кода; повторно пускане — нищо", async () => {
    const after = new Date("2026-12-14T04:23:00Z");
    prismaMock.gameSeason.findMany.mockResolvedValue([S2, S1]); // S2 е започнал, но S1 е последният ПРИКЛЮЧИЛ
    prismaMock.gameSettings.findMany.mockResolvedValueOnce([{ serverId: SID, announceChannelId: "1" }]);
    prismaMock.memberProgress.findMany.mockResolvedValueOnce([{ userId: "3", seasonXp: 900, level: 9 }, { userId: "4", seasonXp: 500, level: 6 }]);
    prismaMock.gameSettings.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await season.closeSeasonIfEnded(after)).toEqual({ closed: 1, ended: true, code: "S1" });
    expect(prismaMock.gameSettings.updateMany.mock.calls[0][0]).toMatchObject({ where: { serverId: SID }, data: { lastSeasonId: "S1" } });
    expect(prismaMock.memberProgress.updateMany).toHaveBeenCalledWith({ where: { serverId: SID }, data: { seasonXp: 0 } });
    expect(notifyBot).toHaveBeenCalledWith("GAME_SEASON_END", expect.objectContaining({ serverId: SID, season: { id: "S1", name: S1.name }, top: expect.arrayContaining([expect.objectContaining({ userId: "3" })]), announceChannelId: "1" }));
    prismaMock.gameSettings.findMany.mockResolvedValueOnce([{ serverId: SID, announceChannelId: "1" }]);
    prismaMock.memberProgress.findMany.mockResolvedValueOnce([]);
    prismaMock.gameSettings.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await season.closeSeasonIfEnded(after)).toEqual({ closed: 0, ended: true, code: "S1" });
    expect(prismaMock.memberProgress.updateMany).toHaveBeenCalledTimes(1);
    expect(notifyBot).toHaveBeenCalledTimes(1);
  });
  it("схемата и миграцията носят game_seasons и lastSeasonId; seed-ът S1 има валидни граници", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    expect(new Date(DEFAULT_SEASON.startsAt) < new Date(DEFAULT_SEASON.endsAt)).toBe(true);
    const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
    expect(schema).toMatch(/lastSeasonId\s+String\?/);
    expect(schema).toContain("model GameSeason {");
    const mig = readFileSync(join(root, "prisma", "migrations", "20260918000000_v50_server_season", "migration.sql"), "utf8");
    expect(mig).toContain('"lastSeasonId" TEXT');
    expect(mig).toContain('CREATE TABLE "game_seasons"');
    expect(mig).toContain('"game_seasons_code_key"');
  });
});
