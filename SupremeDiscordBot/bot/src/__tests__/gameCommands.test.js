// bot/src/__tests__/gameCommands.test.js
// v50 — Server Season от страната на бота: дефинициите на четирите команди,
// охлаждането и партидите за XP (без четене на съдържание), гласовите минути,
// каталогът (и трите копия) и локализациите.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const apiPost = vi.fn();
const apiGet = vi.fn();
vi.mock("../utils/api.js", () => ({ default: { post: (...a) => apiPost(...a), get: (...a) => apiGet(...a) } }));

const game = await import("../utils/game.js");
const daily = (await import("../commands/daily.js")).default;
const profile = (await import("../commands/profile.js")).default;
const leaderboard = (await import("../commands/leaderboard.js")).default;
const shop = (await import("../commands/shop.js")).default;
const { COMMAND_CATALOG } = await import("../utils/commandsCatalog.js");
const { CMD_DESC_L10N } = await import("../utils/commandLocalizations.js");
const HERE = dirname(fileURLToPath(import.meta.url));

beforeEach(() => {
  vi.clearAllMocks();
  game.__test.cooldown.clear(); game.__test.pending.clear(); game.__test.voiceJoined.clear(); game.__test.settingsCache.clear();
});

describe("дефиниции", () => {
  it("четирите команди са guild-only, с локализирано описание", () => {
    for (const c of [daily, profile, leaderboard, shop]) {
      const json = c.data.toJSON();
      expect(json.dm_permission).toBe(false);
      expect(Object.keys(json.description_localizations || {})).toContain("bg");
    }
    expect(profile.data.toJSON().options[0].name).toBe("user");
    expect(leaderboard.data.toJSON().options[0].choices.map((c) => c.value)).toEqual(["xp", "seasonXp", "sparks"]);
  });
  it("каталогът (трите копия) обявява /daily /profile /leaderboard /shop под категория Game", () => {
    const cat = COMMAND_CATALOG.find((c) => c.category === "Game");
    expect(cat).toBeTruthy();
    expect(cat.commands.map((c) => c.name).slice(0, 4)).toEqual(["/daily", "/profile", "/leaderboard", "/shop"]);
    const bot = readFileSync(join(HERE, "../utils/commandsCatalog.js"), "utf8");
    expect(readFileSync(join(HERE, "../../../backend/src/data/commandsCatalog.js"), "utf8")).toBe(bot);
    expect(readFileSync(join(HERE, "../../../frontend/src/data/commandsCatalog.js"), "utf8")).toBe(bot);
    for (const k of ["daily", "profile", "leaderboard", "shop"]) expect(CMD_DESC_L10N[k]?.bg).toBeTruthy();
  });
});

describe("XP от съобщения — охлаждане и партида, без съдържание", () => {
  const msg = (uid = "333333333333333333") => ({ author: { id: uid, bot: false }, guildId: "222222222222222222", content: "SECRET TEXT" });
  it("изключена игра → нищо не се трупа", async () => {
    apiGet.mockResolvedValueOnce({ data: { enabled: false } });
    await game.onMessageForXp(msg());
    expect(game.__test.pending.size).toBe(0);
  });
  it("две съобщения в охлаждането броят за едно събитие; трето след охлаждането — второ", async () => {
    apiGet.mockResolvedValue({ data: { enabled: true, messageCooldownSec: 60 } });
    await game.onMessageForXp(msg());
    await game.onMessageForXp(msg());
    expect(game.__test.pending.get("222222222222222222").get("333333333333333333").messageXpEvents).toBe(1);
    game.__test.cooldown.set("222222222222222222:333333333333333333", Date.now() - 61_000);
    await game.onMessageForXp(msg());
    expect(game.__test.pending.get("222222222222222222").get("333333333333333333").messageXpEvents).toBe(2);
  });
  it("ботове не печелят XP", async () => {
    await game.onMessageForXp({ ...msg(), author: { id: "1", bot: true } });
    expect(game.__test.pending.size).toBe(0);
    expect(apiGet).not.toHaveBeenCalled();
  });
  it("flush праща партидата и НЕ носи съдържание; при ниво нагоре дава ролите", async () => {
    apiGet.mockResolvedValue({ data: { enabled: true, messageCooldownSec: 60 } });
    await game.onMessageForXp(msg());
    const add = vi.fn().mockResolvedValue();
    const member = { roles: { cache: new Map(), add } };
    const role = { id: "444444444444444444", name: "Level 1", managed: false, permissions: { any: () => false }, comparePositionTo: () => -1 };
    const guild = {
      members: { fetch: vi.fn().mockResolvedValue(member), me: { roles: { highest: { position: 10 } } } },
      roles: { cache: new Map([[role.id, role]]), fetch: vi.fn() },
      channels: { cache: new Map(), fetch: vi.fn().mockResolvedValue(null) },
    };
    const client = { guilds: { cache: new Map([["222222222222222222", guild]]), fetch: vi.fn() } };
    apiPost.mockResolvedValueOnce({ data: { enabled: true, levelUps: [{ userId: "333333333333333333", level: 1, oldLevel: 0, sparksAwarded: 10, roleIds: [role.id] }], announceChannelId: null, levelUpMessage: true } });
    await game.flushXp(client);
    expect(apiPost).toHaveBeenCalledWith("/bot/game/xp-batch", { serverId: "222222222222222222", entries: [{ userId: "333333333333333333", messageXpEvents: 1, voiceMinutes: 0 }] });
    expect(JSON.stringify(apiPost.mock.calls[0][1])).not.toContain("SECRET TEXT");
    expect(add).toHaveBeenCalledWith(role, expect.stringContaining("level 1"));
    expect(game.__test.pending.size).toBe(0);
  });
});

describe("гласови минути — само активно участие (одит на Разбивача 25.09.2026)", () => {
  const G = "222222222222222222", U = "333333333333333333", V = "444444444444444444";
  const voice = (over = {}) => ({ selfDeaf: false, serverDeaf: false, selfMute: false, serverMute: false, ...over });
  const setup = ({ me = {}, other = {}, otherBot = false, alone = false, channelId = "100" } = {}) => {
    const members = new Map([[U, { user: { bot: false }, voice: voice(me) }]]);
    if (!alone) members.set(V, { user: { bot: otherBot }, voice: voice(other) });
    const vs = { channelId, ...voice(me), channel: { members } };
    const guild = { id: G, afkChannelId: "999", voiceStates: { cache: new Map([[U, vs]]) } };
    return { client: { guilds: { cache: new Map([[G, guild]]) } }, guild };
  };
  const member = { id: U, user: { bot: false } };
  const join = (guild, channelId = "100") => game.onVoiceForXp({ guild, member, channelId: null }, { guild, member, channelId });
  const minutes = () => game.__test.pending.get(G)?.get(U)?.voiceMinutes || 0;

  it("двама активни в канала → +1 минута на проба", async () => {
    apiGet.mockResolvedValue({ data: { enabled: true } });
    const { client, guild } = setup();
    await join(guild);
    expect(await game.tickVoiceXp(client)).toBe(1);
    await game.tickVoiceXp(client);
    expect(minutes()).toBe(2);
  });
  it("заглушен микрофон, без звук, сам, само с бот или със заглушен човек → 0", async () => {
    apiGet.mockResolvedValue({ data: { enabled: true } });
    for (const opts of [{ me: { selfMute: true } }, { me: { selfDeaf: true } }, { me: { serverMute: true } }, { alone: true }, { otherBot: true }, { other: { selfDeaf: true } }]) {
      game.__test.voiceJoined.clear(); game.__test.pending.clear();
      const { client, guild } = setup(opts);
      await join(guild);
      expect(await game.tickVoiceXp(client), JSON.stringify(opts)).toBe(0);
      expect(minutes()).toBe(0);
    }
  });
  it("събитие от white-label клиент → пробата гледа НЕГОВИЯ кеш, не главния", async () => {
    apiGet.mockResolvedValue({ data: { enabled: true } });
    const { client: brand, guild } = setup();
    await game.onVoiceForXp({ guild, member, channelId: null, client: brand }, { guild, member, channelId: "100", client: brand });
    const main = { guilds: { cache: new Map() } };
    expect(await game.tickVoiceXp(main)).toBe(1);
  });
  it("AFK каналът и излизането спират броенето; изключена игра → 0", async () => {
    const { client, guild } = setup();
    await join(guild, "999");
    expect(game.__test.voiceJoined.size).toBe(0);
    await join(guild);
    await game.onVoiceForXp({ guild, member, channelId: "100" }, { guild, member, channelId: null });
    expect(game.__test.voiceJoined.size).toBe(0);
    await join(guild);
    apiGet.mockResolvedValue({ data: { enabled: false } });
    expect(await game.tickVoiceXp(client)).toBe(0);
  });
});

describe("/daily", () => {
  const ix = () => ({ guildId: "222222222222222222", user: { id: "333333333333333333" }, locale: "en", client: {}, deferReply: vi.fn(), editReply: vi.fn() });
  it("охлаждане → съобщение с оставащото време, без грешка", async () => {
    apiPost.mockRejectedValueOnce({ response: { data: { code: "DAILY_COOLDOWN", retryInMs: 2 * 3600_000, streak: 4 } } });
    const i = ix();
    await daily.execute(i);
    const arg = i.editReply.mock.calls[0][0];
    expect(JSON.stringify(arg)).toContain("2h");
  });
  it("успех → искри + XP в embed", async () => {
    apiPost.mockResolvedValueOnce({ data: { ok: true, sparks: 50, xp: 25, streak: 1, sparksTotal: 50, doubled: false, levelUp: null } });
    const i = ix();
    await daily.execute(i);
    expect(JSON.stringify(i.editReply.mock.calls[0][0])).toContain("50");
  });
});

describe("обявата „ниво нагоре“ минава през i18n (одит 19.09.2026 — беше единственият EN-only текст)", () => {
  it("праща локализирания embed в канала за обяви; без канал/изключена обява → нищо", async () => {
    const send = vi.fn().mockResolvedValue({});
    const channel = { isTextBased: () => true, send };
    const member = { roles: { cache: new Map(), add: vi.fn() } };
    const guild = { roles: { cache: new Map(), fetch: vi.fn().mockResolvedValue(null) }, members: { fetch: vi.fn().mockResolvedValue(member), me: {} }, channels: { cache: new Map([["500000000000000001", channel]]), fetch: vi.fn() } };
    const client = { guilds: { cache: new Map([["222222222222222222", guild]]), fetch: vi.fn() } };
    apiGet.mockRejectedValue(new Error("no lang")); // resolveLangForGuild → "en"
    await game.applyLevelUp(client, "222222222222222222", { userId: "333333333333333333", level: 3, roleIds: [], sparksAwarded: 30 }, "500000000000000001", true);
    const desc = send.mock.calls[0][0].embeds[0].toJSON().description;
    expect(desc).toContain("<@333333333333333333>"); expect(desc).toContain("level 3"); expect(desc).toContain("+30 ✨");
    expect(send.mock.calls[0][0].allowedMentions).toEqual({ users: ["333333333333333333"] });
    await game.applyLevelUp(client, "222222222222222222", { userId: "333333333333333333", level: 4, roleIds: [], sparksAwarded: 0 }, null, true);
    await game.applyLevelUp(client, "222222222222222222", { userId: "333333333333333333", level: 5, roleIds: [], sparksAwarded: 0 }, "500000000000000001", false);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("магазинът спазва лимитите на Discord (одит 25.09.2026)", () => {
  it("50 артикула с дълги описания: описание ≤ 4096, две менюта по 25, всички 50 купуеми", async () => {
    const { buildShopMessage } = await import("../commands/shop.js");
    const items = Array.from({ length: 50 }, (_, i) => ({ id: `it${i}`, name: `Item ${i}`, priceSparks: 10 + i, description: "x".repeat(300), durationDays: 7, stockLeft: null }));
    const m = buildShopMessage(items, 100, "en");
    expect(m.embeds[0].toJSON().description.length).toBeLessThanOrEqual(4096);
    expect(m.embeds[0].toJSON().description).toMatch(/more/);
    const menus = m.components.map((r) => r.toJSON().components[0]);
    expect(menus.map((x) => x.custom_id)).toEqual(["game:shop", "game:shop:2"]);
    expect(menus.flatMap((x) => x.options.map((o) => o.value))).toHaveLength(50);
  });
});
