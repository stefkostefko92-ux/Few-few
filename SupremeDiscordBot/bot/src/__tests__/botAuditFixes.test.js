// bot/src/__tests__/botAuditFixes.test.js
// Регресии от одита 26.09.2026 от страната на бота:
//  • настройките на играта: ЕДНА заявка в полет на сървър (иначе Counting се
//    нареждаше по реда на отговорите и верен ход беше „грешка“);
//  • XP партидите над 500 записа се пращат на парчета (backend max 500);
//  • изтичане на роля: трайна грешка (няма сървър / роля / права) = свършено;
//  • t() не тълкува `$` в стойностите като шаблон за замяна.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiPost = vi.fn();
const apiGet = vi.fn();
vi.mock("../utils/api.js", () => ({ default: { post: (...a) => apiPost(...a), get: (...a) => apiGet(...a), patch: vi.fn() } }));

const game = await import("../utils/game.js");
const { t } = await import("../i18n/index.js");

beforeEach(() => {
  vi.clearAllMocks();
  game.__test.settingsCache.clear(); game.__test.settingsInflight.clear(); game.__test.pending.clear();
});

describe("getGameSettings", () => {
  it("едновременни извиквания при празен кеш → ЕДНА заявка, всички получават едно и също", async () => {
    let resolve;
    apiGet.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const calls = [game.getGameSettings("g1"), game.getGameSettings("g1"), game.getGameSettings("g1")];
    resolve({ data: { enabled: true, countingChannelId: "c" } });
    const out = await Promise.all(calls);
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(out.every((s) => s.countingChannelId === "c")).toBe(true);
    expect(game.__test.settingsInflight.size).toBe(0);
  });
});

describe("flushXp", () => {
  it("1200 играча → три заявки по ≤500", async () => {
    const users = new Map();
    for (let i = 0; i < 1200; i++) users.set(String(100000000000000000n + BigInt(i)), { messageXpEvents: 1, voiceMinutes: 0 });
    game.__test.pending.set("g1", users);
    apiPost.mockResolvedValue({ data: { levelUps: [] } });
    await game.flushXp({});
    expect(apiPost).toHaveBeenCalledTimes(3);
    expect(apiPost.mock.calls.map((c) => c[1].entries.length)).toEqual([500, 500, 200]);
  });
});

describe("revokeShopRole", () => {
  const client = (guild) => ({ guilds: { cache: { get: () => guild }, fetch: vi.fn().mockResolvedValue(guild) } });
  const guildWith = (removeErr) => ({
    members: { fetch: vi.fn().mockResolvedValue({ roles: { cache: { has: () => true }, remove: removeErr ? vi.fn().mockRejectedValue(removeErr) : vi.fn().mockResolvedValue(true) } }) },
  });
  it("ботът не е в сървъра → свършено (true), не „опитай пак“", async () => {
    expect(await game.revokeShopRole(client(null), { serverId: "g", userId: "u", roleId: "r" })).toBe(true);
  });
  it("липсващи права / изтрита роля → true; временна грешка → false", async () => {
    expect(await game.revokeShopRole(client(guildWith({ code: 50013 })), { serverId: "g", userId: "u", roleId: "r" })).toBe(true);
    expect(await game.revokeShopRole(client(guildWith({ code: 10011 })), { serverId: "g", userId: "u", roleId: "r" })).toBe(true);
    expect(await game.revokeShopRole(client(guildWith({ code: 500 })), { serverId: "g", userId: "u", roleId: "r" })).toBe(false);
    expect(await game.revokeShopRole(client(guildWith(null)), { serverId: "g", userId: "u", roleId: "r" })).toBe(true);
  });
});

describe("t()", () => {
  it("стойности с $$ / $& / $` остават буквални", () => {
    expect(t("game.companion.fedBody", "en", { sparks: "VIP $$", fed: "$&", left: "$`" })).toBe("You fed **✨ VIP $$** · total fed $& · balance ✨ $`");
  });
});
