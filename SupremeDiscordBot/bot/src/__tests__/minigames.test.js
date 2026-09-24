// bot/src/__tests__/minigames.test.js
// v50 — Server Season, етап 3 от страната на бота: Counting чете съдържание
// САМО в обявения канал; куест съобщенията (embed + охлаждане на редакциите);
// trivia бутоните; /wyr гласуване в паметта; парти банките са SFW; четирите
// команди са дефинирани, локализирани и в каталога (трите копия).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const apiPost = vi.fn();
const apiGet = vi.fn();
const apiPatch = vi.fn();
vi.mock("../utils/api.js", () => ({ default: { post: (...a) => apiPost(...a), get: (...a) => apiGet(...a), patch: (...a) => apiPatch(...a) } }));

const mg = await import("../utils/minigames.js");
const game = await import("../utils/game.js");
const { handleGameInteraction } = await import("../utils/gameInteractions.js");
const { WYR, TRUTH, DARE } = await import("../data/partyBanks.js");
const quest = (await import("../commands/quest.js")).default;
const triviaCmd = (await import("../commands/trivia.js")).default;
const wyr = (await import("../commands/wyr.js")).default;
const tod = (await import("../commands/tod.js")).default;
const { COMMAND_CATALOG } = await import("../utils/commandsCatalog.js");
const { CMD_DESC_L10N } = await import("../utils/commandLocalizations.js");
const HERE = dirname(fileURLToPath(import.meta.url));

const SID = "222222222222222222";
const UID = "333333333333333333";
const settings = (o = {}) => ({ enabled: true, isPremium: false, countingChannelId: "500000000000000002", ...o });
const msg = (content, channelId = "500000000000000002") => ({ guildId: SID, channelId, content, author: { id: UID, bot: false }, react: vi.fn().mockResolvedValue(true), channel: { send: vi.fn().mockResolvedValue({}) } });

beforeEach(() => { vi.clearAllMocks(); apiPatch.mockResolvedValue({ data: { ok: true } }); mg.__test.questEditAt.clear(); mg.__test.wyrVotes.clear(); game.__test.settingsCache.clear(); });

describe("Counting", () => {
  it("парсер огледален на backend-а", () => {
    expect(["7", " 42 ", "0", "x", "1.5", ""].map(mg.parseCount)).toEqual([7, 42, null, null, null, null]);
  });
  it("извън обявения канал НЕ чете съдържание и не вика backend-а; чат (не число) в канала се игнорира", async () => {
    expect(await mg.onCounting(msg("5", "999"), settings())).toBeNull();
    expect(await mg.onCounting(msg("5"), settings({ countingChannelId: null }))).toBeNull();
    expect(await mg.onCounting(msg("hello"), settings())).toBeNull();
    expect(apiPost).not.toHaveBeenCalled();
  });
  it("вярно → ✅ (🥇 при рекорд), етап → съобщение; грешно → ❌ + обяснение с очакваното и рекорда", async () => {
    apiPost.mockResolvedValueOnce({ data: { ok: true, number: 5, record: false, milestone: false } });
    const m = msg("5");
    expect(await mg.onCounting(m, settings())).toMatchObject({ ok: true, number: 5 });
    expect(apiPost).toHaveBeenCalledWith("/bot/game/counting", { serverId: SID, userId: UID, number: 5 });
    expect(m.react).toHaveBeenCalledWith("✅"); expect(m.channel.send).not.toHaveBeenCalled();
    apiPost.mockResolvedValueOnce({ data: { ok: true, number: 100, record: true, milestone: true, xp: 15 } });
    const r = msg("100");
    await mg.onCounting(r, settings());
    expect(r.react).toHaveBeenCalledWith("🥇"); expect(r.channel.send).toHaveBeenCalledTimes(2); // етап + рекорд (100 % 50)
    apiPost.mockRejectedValueOnce({ response: { status: 409, data: { error: "WRONG_NUMBER", expected: 6, reached: 5, high: 12 } } });
    const w = msg("9");
    expect(await mg.onCounting(w, settings())).toMatchObject({ reset: true });
    expect(w.react).toHaveBeenCalledWith("❌");
    expect(w.channel.send.mock.calls[0][0].content).toContain("**6**"); expect(w.channel.send.mock.calls[0][0].content).toContain("**12**");
    apiPost.mockRejectedValueOnce({ response: { status: 409, data: { error: "RACE" } } });
    const race = msg("6");
    expect(await mg.onCounting(race, settings())).toMatchObject({ ignored: true });
    expect(race.react).not.toHaveBeenCalled();
  });
});

describe("куест съобщения", () => {
  const q = { id: "q1", type: "MESSAGES", emoji: "💬", target: 1000, progress: 420, rewardSparks: 100, status: "ACTIVE", endsAt: new Date(Date.now() + 86400000).toISOString(), channelId: "500000000000000001", messageId: "600000000000000001", bar: "▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱ 42 %" };
  const mkClient = () => {
    const edit = vi.fn().mockResolvedValue({});
    const send = vi.fn().mockResolvedValue({ id: "700000000000000001" });
    const channel = { id: "500000000000000001", isTextBased: () => true, send, messages: { fetch: vi.fn().mockResolvedValue({ edit }) } };
    const guild = { channels: { cache: new Map([[channel.id, channel]]), fetch: vi.fn() } };
    return { client: { guilds: { cache: new Map([[SID, guild]]), fetch: vi.fn() } }, edit, send };
  };
  it("embed: активен носи лентата и наградата; изпълнен — сандъка и спътника; отменен — своя текст", () => {
    const a = mg.questEmbed(q, "en").toJSON();
    expect(a.description).toContain(q.bar); expect(a.footer.text).toContain("100");
    const c = mg.questEmbed({ ...q, status: "COMPLETED" }, "en", { rewards: [{ userId: UID, sparks: 200 }], chest: { userId: UID, sparks: 200, companion: { name: "Blip", imageUrl: "https://x/blip-1.jpg" } } }).toJSON();
    expect(c.description).toContain("Blip"); expect(c.thumbnail.url).toContain("blip-1.jpg");
    expect(mg.questEmbed({ ...q, status: "FAILED" }, "en", { cancelled: true }).toJSON().description).toContain("cancelled");
  });
  it("STARTED публикува и записва messageId; PROGRESS редактира най-много веднъж на минута за куест", async () => {
    const { client, send, edit } = mkClient();
    apiGet.mockResolvedValue({ data: {} });
    const s = await mg.handleQuestEvent(client, { event: "STARTED", serverId: SID, quest: q });
    expect(s).toMatchObject({ ok: true, messageId: "700000000000000001" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(apiPatch).toHaveBeenCalledWith("/bot/game/quest/q1/message", { messageId: "700000000000000001", channelId: "500000000000000001" });
    expect(await mg.handleQuestEvent(client, { event: "PROGRESS", serverId: SID, quests: [q] })).toEqual({ edited: 1 });
    expect(await mg.handleQuestEvent(client, { event: "PROGRESS", serverId: SID, quests: [q] })).toEqual({ edited: 0 });
    expect(edit).toHaveBeenCalledTimes(1);
    const done = await mg.handleQuestEvent(client, { event: "COMPLETED", serverId: SID, quest: { ...q, status: "COMPLETED" }, rewards: [], chest: { userId: UID, sparks: 200, companion: null } });
    expect(done).toMatchObject({ ok: true, edited: true });
    expect(edit).toHaveBeenCalledTimes(2); expect(send).toHaveBeenCalledTimes(2); // + пинг към отворилия сандъка
  });
});

describe("trivia + wyr", () => {
  const round = { id: "r1", source: "BANK", question: "Q?", options: ["a", "b", "c", "d"], expiresAt: new Date(Date.now() + 600000).toISOString(), channelId: "1" };
  it("съобщението носи 4 бутона game:trivia:<round>:<i>", () => {
    const m = mg.triviaMessage(round, "en");
    const ids = m.components[0].toJSON().components.map((b) => b.custom_id);
    expect(ids).toEqual(["game:trivia:r1:0", "game:trivia:r1:1", "game:trivia:r1:2", "game:trivia:r1:3"]);
    expect(m.embeds[0].toJSON().fields).toHaveLength(4);
  });
  it("бутон: грешен → лична бележка, общото не се пипа; ALREADY_ANSWERED → бележка", async () => {
    const ix = (customId) => ({ customId, isButton: () => true, isStringSelectMenu: () => false, locale: "en", user: { id: UID }, guildId: SID, channelId: "1", message: { id: "m1", embeds: [{ fields: [] }] }, reply: vi.fn(), update: vi.fn(), client: {} });
    apiPost.mockResolvedValueOnce({ data: { ok: true, correct: false, winner: false, answer: 2 } });
    const i = ix("game:trivia:r1:1");
    await handleGameInteraction(i);
    expect(apiPost).toHaveBeenCalledWith("/bot/game/trivia/r1/answer", { userId: UID, option: 1, serverId: SID });
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: expect.anything() }));
    expect(i.update).not.toHaveBeenCalled();
    apiPost.mockRejectedValueOnce({ response: { status: 409, data: { error: "ALREADY_ANSWERED" } } });
    const j = ix("game:trivia:r1:2");
    await handleGameInteraction(j);
    expect(j.reply.mock.calls[0][0].content).toContain("already");
  });
  it("wyr: един глас на човек, смяната мести гласа; бутонът обновява броя", async () => {
    expect(mg.wyrVote("m1", UID, "a")).toEqual({ a: 1, b: 0 });
    expect(mg.wyrVote("m1", UID, "b")).toEqual({ a: 0, b: 1 });
    expect(mg.wyrVote("m1", "444444444444444444", "b")).toEqual({ a: 0, b: 2 });
    const i = { customId: "game:wyr:a", isButton: () => true, isStringSelectMenu: () => false, locale: "en", user: { id: UID }, guildId: SID, message: { id: "m1", embeds: [{ description: "🅰️ fly\n\n🅱️ swim" }] }, update: vi.fn().mockResolvedValue({}), reply: vi.fn() };
    await handleGameInteraction(i);
    const payload = i.update.mock.calls[0][0];
    expect(payload.embeds[0].toJSON().description).toContain("fly");
    expect(payload.embeds[0].toJSON().footer.text).toBe("🅰️ 1 · 🅱️ 1");
  });
  it("/wyr и /tod са Premium — Free получава бележка, не банката", async () => {
    apiGet.mockResolvedValueOnce({ data: settings({ isPremium: false }) });
    const i = { guildId: SID, locale: "en", user: { id: UID, username: "u" }, reply: vi.fn(), options: { getSubcommand: () => "truth" } };
    await wyr.execute(i);
    expect(i.reply.mock.calls[0][0].content).toContain("Premium");
    game.__test.settingsCache.clear(); // кешът е 60 s — иначе tod вижда Free
    apiGet.mockResolvedValueOnce({ data: settings({ isPremium: true }) });
    const j = { ...i, reply: vi.fn() };
    await tod.execute(j);
    expect(j.reply.mock.calls[0][0].embeds[0].toJSON().title).toContain("Truth");
  });
});

describe("краят на сезона (етап 4)", () => {
  it("обявата носи името на сезона и топ 3 с медали; без канал за обяви → false, нищо не се праща", async () => {
    const e = mg.seasonEndEmbed({ season: { id: "S1", name: "Season 1 — First Light" }, top: [{ userId: "3", seasonXp: 900 }, { userId: "4", seasonXp: 500 }] }, "en").toJSON();
    expect(e.title).toContain("Season 1"); expect(e.description).toContain("🥇 <@3> — 900 XP"); expect(e.description).toContain("🥈 <@4>");
    expect(await mg.announceSeasonEnd({ guilds: { cache: new Map(), fetch: vi.fn().mockResolvedValue(null) } }, { serverId: SID, season: { id: "S1", name: "S" }, top: [], announceChannelId: null })).toBe(false);
  });
});

describe("банките са SFW", () => {
  const banned = /\b(alcohol|beer|drunk|sex|naked|nude|kiss|drug|weed|suicide|kill yourself|gamble|bet money|address|phone number)\b/i;
  it("WYR: двойки от два различни низа; TRUTH/DARE: ≥30 непразни; нищо от списъка със забранени думи", () => {
    expect(WYR.length).toBeGreaterThanOrEqual(30);
    for (const p of WYR) { expect(p).toHaveLength(2); expect(p[0]).not.toBe(p[1]); expect(`${p[0]} ${p[1]}`).not.toMatch(banned); }
    for (const list of [TRUTH, DARE]) { expect(list.length).toBeGreaterThanOrEqual(30); for (const s of list) { expect(s.trim().length).toBeGreaterThan(10); expect(s).not.toMatch(banned); } }
  });
});

describe("дефиниции и каталог", () => {
  it("/quest /trivia /wyr /tod: guild-only, локализирани; /trivia иска Manage Server", () => {
    for (const c of [quest, triviaCmd, wyr, tod]) {
      const json = c.data.toJSON();
      expect(json.dm_permission).toBe(false);
      expect(Object.keys(json.description_localizations || {})).toContain("bg");
      expect(CMD_DESC_L10N[json.name].pl).toBeTruthy();
    }
    expect(triviaCmd.data.toJSON().default_member_permissions).toBe("32"); // ManageGuild
    expect(tod.data.toJSON().options.map((o) => o.name)).toEqual(["truth", "dare"]);
  });
  it("каталогът (трите копия) обявява четирите под Game", () => {
    const cat = COMMAND_CATALOG.find((c) => c.category === "Game");
    expect(cat.commands.map((c) => c.name)).toEqual(expect.arrayContaining(["/quest", "/trivia", "/wyr", "/tod"]));
    const bot = readFileSync(join(HERE, "../utils/commandsCatalog.js"), "utf8");
    expect(readFileSync(join(HERE, "../../../backend/src/data/commandsCatalog.js"), "utf8")).toBe(bot);
    expect(readFileSync(join(HERE, "../../../frontend/src/data/commandsCatalog.js"), "utf8")).toBe(bot);
  });
});
