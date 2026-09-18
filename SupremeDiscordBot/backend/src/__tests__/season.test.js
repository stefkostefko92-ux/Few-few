// backend/src/__tests__/season.test.js
// v50 — Server Season, етап 4: краят на сезона е идемпотентен (условен
// updateMany по lastSeasonId), нулира САМО seasonXp, известява бота с топ 3,
// и не прави нищо преди датата на края. Сезонът е константа в companions.js.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
const notifyBot = vi.fn().mockResolvedValue({ ok: true });
vi.mock("../services/botNotifier.js", () => ({ notifyBot: (...a) => notifyBot(...a), dmUser: vi.fn() }));

const season = await import("../lib/game/season.js");
const { CURRENT_SEASON } = await import("../lib/game/companions.js");
const SID = "222222222222222222";

beforeEach(() => vi.clearAllMocks());

describe("краят на сезона", () => {
  it("преди края — нищо (нито четене, нито писане)", async () => {
    const before = new Date(new Date(CURRENT_SEASON.endsAt).getTime() - 1);
    expect(await season.closeSeasonIfEnded(before)).toEqual({ closed: 0, ended: false });
    expect(prismaMock.gameSettings.findMany).not.toHaveBeenCalled();
  });
  it("след края: топ 3 → бот, seasonXp → 0 за сървъра, lastSeasonId = S1; повторно пускане — нищо", async () => {
    const after = new Date(CURRENT_SEASON.endsAt);
    prismaMock.gameSettings.findMany.mockResolvedValueOnce([{ serverId: SID, announceChannelId: "1" }]);
    prismaMock.memberProgress.findMany.mockResolvedValueOnce([{ userId: "3", seasonXp: 900, level: 9 }, { userId: "4", seasonXp: 500, level: 6 }]);
    prismaMock.gameSettings.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await season.closeSeasonIfEnded(after)).toEqual({ closed: 1, ended: true });
    expect(prismaMock.gameSettings.updateMany.mock.calls[0][0]).toMatchObject({ where: { serverId: SID }, data: { lastSeasonId: CURRENT_SEASON.id } });
    expect(prismaMock.memberProgress.updateMany).toHaveBeenCalledWith({ where: { serverId: SID }, data: { seasonXp: 0 } });
    expect(notifyBot).toHaveBeenCalledWith("GAME_SEASON_END", expect.objectContaining({ serverId: SID, top: expect.arrayContaining([expect.objectContaining({ userId: "3" })]), announceChannelId: "1" }));
    // Идемпотентно: filter-ът изключва вече затворените; при надпревара условният update връща 0.
    prismaMock.gameSettings.findMany.mockResolvedValueOnce([{ serverId: SID, announceChannelId: "1" }]);
    prismaMock.memberProgress.findMany.mockResolvedValueOnce([]);
    prismaMock.gameSettings.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await season.closeSeasonIfEnded(after)).toEqual({ closed: 0, ended: true });
    expect(prismaMock.memberProgress.updateMany).toHaveBeenCalledTimes(1);
    expect(notifyBot).toHaveBeenCalledTimes(1);
  });
  it("сезонът S1 има валидни граници и колоната lastSeasonId е в схемата и миграцията", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    expect(new Date(CURRENT_SEASON.startsAt) < new Date(CURRENT_SEASON.endsAt)).toBe(true);
    expect(readFileSync(join(root, "prisma", "schema.prisma"), "utf8")).toMatch(/lastSeasonId\s+String\?/);
    expect(readFileSync(join(root, "prisma", "migrations", "20260918000000_v50_server_season", "migration.sql"), "utf8")).toContain('"lastSeasonId" TEXT');
  });
});
