// bot/src/__tests__/companions.test.js
// v50 — Server Season, етап 2 от страната на бота: /companion дефиниция и
// каталог, гейтът за поява (праг събития, интервал, шанс, канали) и „Улови".
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiPost = vi.fn();
const apiGet = vi.fn();
const apiPatch = vi.fn();
vi.mock("../utils/api.js", () => ({ default: { post: (...a) => apiPost(...a), get: (...a) => apiGet(...a), patch: (...a) => apiPatch(...a) } }));

const game = await import("../utils/game.js");
const companion = (await import("../commands/companion.js")).default;
const { COMMAND_CATALOG } = await import("../utils/commandsCatalog.js");
const { CMD_DESC_L10N } = await import("../utils/commandLocalizations.js");
const { handleGameInteraction } = await import("../utils/gameInteractions.js");

beforeEach(() => { vi.clearAllMocks(); apiPost.mockReset(); game.__test.spawnState.clear(); game.__test.autoSpawn.clear(); game.__test.settingsCache.clear(); game.__setRandom(null); });

describe("/companion", () => {
  it("деветте подкоманди и локализация; каталогът обявява публичните", () => {
    const json = companion.data.toJSON();
    expect(json.options.map((o) => o.name)).toEqual(["list", "info", "feed", "activate", "release", "trade", "train", "attack", "pvp"]);
    expect(json.dm_permission).toBe(false);
    expect(CMD_DESC_L10N.companion.bg).toBeTruthy();
    for (const d of [json.description, ...Object.values(CMD_DESC_L10N.companion)]) expect(d.length).toBeLessThanOrEqual(100);
    const cat = COMMAND_CATALOG.find((c) => c.category === "Game");
    expect(cat.commands.map((c) => c.name)).toEqual(expect.arrayContaining(["/companion list", "/companion feed", "/companion activate", "/companion trade", "/companion release", "/companion train", "/companion attack", "/companion pvp"]));
    // train: четирите статистики като избор
    const train = json.options.find((o) => o.name === "train");
    expect(train.options.find((o) => o.name === "stat").choices.map((c) => c.value)).toEqual(["atk", "def", "spd", "hp"]);
  });
});

describe("поява при активност", () => {
  const settings = { spawnEnabled: true, spawnChannelIds: [] };
  const msg = { guildId: "222222222222222222", channelId: "100", channel: { send: vi.fn(), guildId: "222222222222222222" }, client: {} };
  it("под прага събития — нищо, дори при щастлив жребий", async () => {
    for (let i = 0; i < game.SPAWN_MIN_EVENTS - 1; i++) expect(await game.maybeSpawn(msg, settings, () => 0)).toBe(false);
    expect(apiPost).not.toHaveBeenCalled();
  });
  it("над прага с лош жребий — нищо; с добър — една заявка, после интервал", async () => {
    for (let i = 0; i < game.SPAWN_MIN_EVENTS; i++) await game.maybeSpawn(msg, settings, () => 0.99);
    expect(apiPost).not.toHaveBeenCalled();
    apiPost.mockRejectedValueOnce({ response: { status: 429, data: { error: "SPAWN_TOO_SOON" } } });
    expect(await game.maybeSpawn(msg, settings, () => 0)).toBe(false);
    expect(apiPost).toHaveBeenCalledWith("/bot/game/spawn", { serverId: "222222222222222222", channelId: "100" });
    // интервалът в паметта пази backend-а от втори опит веднага
    for (let i = 0; i < 20; i++) await game.maybeSpawn(msg, settings, () => 0);
    expect(apiPost).toHaveBeenCalledTimes(1);
  });
  it("канал извън списъка → нищо; изключена поява → нищо", async () => {
    for (let i = 0; i < 10; i++) expect(await game.maybeSpawn(msg, { spawnEnabled: true, spawnChannelIds: ["999"] }, () => 0)).toBe(false);
    for (let i = 0; i < 10; i++) expect(await game.maybeSpawn(msg, { spawnEnabled: false, spawnChannelIds: [] }, () => 0)).toBe(false);
    expect(apiPost).not.toHaveBeenCalled();
  });
  it("съобщението за поява носи бутон game:catch:<id> и картинката", () => {
    const m = game.spawnMessage({ spawn: { id: "sp1", expiresAt: new Date().toISOString() }, companion: { name: "Blip", rarityEmoji: "⚪", rarityLabel: "Common", imageUrl: "https://x/blip-1.jpg" } }, "en", (k) => k);
    expect(JSON.stringify(m.components)).toContain("game:catch:sp1");
    expect(JSON.stringify(m.embeds)).toContain("blip-1.jpg");
  });
});

describe("автоматична поява по случайно време", () => {
  const SID = "222222222222222222";
  const T0 = 1_000_000_000_000;
  const data = { spawn: { id: "sp9", expiresAt: new Date(Date.now() + 300_000).toISOString() }, companion: { id: "lime-blip", name: "Blip", rarityEmoji: "⚪", rarityLabel: "Common", imageUrl: "https://x/blip-1.jpg" } };
  function world({ canPost = true } = {}) {
    const guild = { members: { me: { id: "bot" } }, channels: { cache: new Map() } };
    const mk = (id) => {
      const ch = { id, guildId: SID, guild, client: {}, isTextBased: () => true, permissionsFor: () => ({ has: () => canPost }), send: vi.fn(async () => ({ id: "m1" })), messages: { fetch: vi.fn() } };
      guild.channels.cache.set(id, ch);
      return ch;
    };
    return { general: mk("100"), spawns: mk("700") };
  }
  const cacheSettings = (s) => game.__test.settingsCache.set(SID, { settings: { enabled: true, spawnEnabled: true, spawnChannelIds: [], ...s }, expiresAt: Date.now() + 60_000 });

  it("активност → поява в случаен момент между мин. и макс., в канала с последната активност", async () => {
    const { general } = world();
    cacheSettings({});
    game.__setRandom(() => 0.5);
    game.noteSpawnActivity({ guildId: SID, channel: general }, { spawnEnabled: true }, T0);
    const due = T0 + game.AUTO_SPAWN_MIN_MS + Math.floor(0.5 * (game.AUTO_SPAWN_MAX_MS - game.AUTO_SPAWN_MIN_MS));
    expect(game.__test.autoSpawn.get(SID).nextAt).toBe(due);
    game.noteSpawnActivity({ guildId: SID, channel: general }, { spawnEnabled: true }, due - 60_000); // хората още пишат
    expect(await game.tickAutoSpawn(due - 1, () => 0.5)).toBe(0);
    apiPost.mockResolvedValueOnce({ data });
    expect(await game.tickAutoSpawn(due, () => 0.5)).toBe(1);
    expect(apiPost).toHaveBeenCalledWith("/bot/game/spawn", { serverId: SID, channelId: "100" });
    expect(JSON.stringify(general.send.mock.calls[0][0].components)).toContain("game:catch:sp9");
    expect(game.__test.autoSpawn.get(SID).nextAt).toBeGreaterThanOrEqual(due + game.AUTO_SPAWN_MIN_MS);
  });

  it("зададени канали → пуска в един от тях, дори когато хората пишат другаде", async () => {
    const { general } = world();
    cacheSettings({ spawnChannelIds: ["700"] });
    game.noteSpawnActivity({ guildId: SID, channel: general }, { spawnEnabled: true }, T0);
    game.noteSpawnActivity({ guildId: SID, channel: general }, { spawnEnabled: true }, T0 + game.AUTO_SPAWN_MAX_MS);
    apiPost.mockResolvedValueOnce({ data });
    expect(await game.tickAutoSpawn(T0 + game.AUTO_SPAWN_MAX_MS, () => 0)).toBe(1);
    expect(apiPost).toHaveBeenCalledWith("/bot/game/spawn", { serverId: SID, channelId: "700" });
  });

  it("мъртъв сървър, изключена поява или бот без права → нищо", async () => {
    let w = world();
    cacheSettings({});
    game.noteSpawnActivity({ guildId: SID, channel: w.general }, { spawnEnabled: true }, T0);
    expect(await game.tickAutoSpawn(T0 + game.AUTO_SPAWN_ACTIVE_MS + 1)).toBe(0); // никой не е писал 30+ мин
    expect(game.__test.autoSpawn.has(SID)).toBe(false);

    game.noteSpawnActivity({ guildId: SID, channel: w.general }, { spawnEnabled: false }, T0);
    expect(game.__test.autoSpawn.has(SID)).toBe(false);

    w = world({ canPost: false });
    game.noteSpawnActivity({ guildId: SID, channel: w.general }, { spawnEnabled: true }, T0);
    game.__test.autoSpawn.get(SID).lastActivityAt = T0 + game.AUTO_SPAWN_MAX_MS;
    expect(await game.tickAutoSpawn(T0 + game.AUTO_SPAWN_MAX_MS)).toBe(0);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("отказ от backend-а (жива поява) → без повторен опит на всяка минута", async () => {
    const { general } = world();
    cacheSettings({});
    game.noteSpawnActivity({ guildId: SID, channel: general }, { spawnEnabled: true }, T0);
    const due = game.__test.autoSpawn.get(SID).nextAt;
    game.__test.autoSpawn.get(SID).lastActivityAt = due;
    apiPost.mockRejectedValueOnce({ response: { status: 409, data: { error: "SPAWN_ACTIVE" } } });
    expect(await game.tickAutoSpawn(due, () => 0)).toBe(0);
    expect(await game.tickAutoSpawn(due + 60_000, () => 0)).toBe(0);
    expect(apiPost).toHaveBeenCalledTimes(1);
  });
});

describe("Улови", () => {
  const ix = (over = {}) => ({
    customId: "game:catch:sp1", isButton: () => true, isStringSelectMenu: () => false, locale: "en",
    user: { id: "333333333333333333" }, guildId: "222222222222222222",
    message: { embeds: [{ title: "x", description: "y" }] },
    update: vi.fn(), reply: vi.fn(), ...over,
  });
  it("успех → общото съобщение се сменя на „уловен от“, бутонът изчезва", async () => {
    apiPost.mockResolvedValueOnce({ data: { ok: true, companion: { name: "Blip" } } });
    const i = ix();
    await handleGameInteraction(i);
    expect(apiPost).toHaveBeenCalledWith("/bot/game/spawn/sp1/catch", { userId: "333333333333333333", serverId: "222222222222222222" });
    expect(i.update).toHaveBeenCalled();
    expect(i.update.mock.calls[0][0].components).toEqual([]);
  });
  it("някой е бил по-бърз → лична бележка, общото съобщение не се пипа", async () => {
    apiPost.mockRejectedValueOnce({ response: { status: 409, data: { error: "ALREADY_CAUGHT" } } });
    const i = ix();
    await handleGameInteraction(i);
    expect(i.update).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalled();
  });
});

describe("/companion list в Premium спазва лимита на Discord (одит 25.09.2026)", () => {
  it("300 спътника → описание ≤ 4096 знака и бележка „още N“", async () => {
    const companions = Array.from({ length: 300 }, (_, i) => ({ id: `own_${i}`, index: i + 1, name: `Companion ${i}`, nickname: null, rarityEmoji: "⚪", stage: 1 }));
    apiGet.mockResolvedValueOnce({ data: { sparks: 5, activeId: "own_0", companions } });
    const editReply = vi.fn();
    const i = { guildId: "222222222222222222", user: { id: "333333333333333333" }, locale: "en", deferReply: vi.fn(), editReply, options: { getSubcommand: () => "list", getInteger: () => null } };
    await companion.execute(i);
    const d = editReply.mock.calls[0][0].embeds[0].toJSON().description;
    expect(d.length).toBeLessThanOrEqual(4096);
    expect(d).toMatch(/and \d+ more/);
    expect(d).toContain("**#1**");
  });
});

describe("/companion feed без искри казва колко струва опитът (одит на Дискорджията 25.09.2026)", () => {
  it("NOT_ENOUGH_SPARKS → „this costs ✨ 50“, не ✨ 0", async () => {
    apiGet.mockResolvedValueOnce({ data: { sparks: 5, activeId: "own_0", companions: [{ id: "own_0", index: 1, name: "Blip", nickname: null, rarityEmoji: "⚪", stage: 1 }] } });
    apiPost.mockRejectedValueOnce({ response: { status: 402, data: { error: "NOT_ENOUGH_SPARKS", sparks: 5 } } });
    const editReply = vi.fn();
    const i = { guildId: "222222222222222222", user: { id: "333333333333333333" }, locale: "en", deferReply: vi.fn(), editReply,
      options: { getSubcommand: () => "feed", getInteger: (k) => (k === "sparks" ? 50 : 1) } };
    await companion.execute(i);
    const msg = editReply.mock.calls[0][0].content;
    expect(msg).toContain("✨ 5,");
    expect(msg).toContain("✨ 50");
    expect(i.deferReply).toHaveBeenCalled();
  });
});

// ─── v53 — статистики, тренировка и битки ────────────────────────────────────
const { battleFrames, battleEmbed, hpBar, statLine, replay } = await import("../commands/companion.js");
const profile = (await import("../commands/profile.js")).default;
const GID = "222222222222222222";
const ME = "333333333333333333";
const THEM = "444444444444444444";
const sheet = (o = {}) => ({ stats: { atk: 20, def: 20, spd: 20, hp: 100, power: 80 }, levels: { atk: 0, def: 0, spd: 0, hp: 0 }, cap: 4, nextCost: { atk: 20, def: 20, spd: 20, hp: 20 }, wins: 3, losses: 1, ...o });
const mineList = () => ({ data: { sparks: 100, activeId: "own_0", companions: [{ id: "own_0", index: 1, name: "Blip", nickname: null, rarityEmoji: "⚪", rarityLabel: "Common", family: "Lime", blurb: "Blip is a friendly lime jelly.", stage: 1, fed: 0, nextStageAt: 100, imageUrl: "https://x/blip-1.jpg", sheet: sheet() }] } });
const ix = (sub, opts = {}) => ({
  guildId: GID, user: { id: ME }, locale: "en",
  deferReply: vi.fn(), editReply: vi.fn(), reply: vi.fn(), deleteReply: vi.fn(async () => {}), followUp: vi.fn(),
  options: { getSubcommand: () => sub, getInteger: (k) => opts[k] ?? null, getString: (k) => opts[k] ?? null, getUser: () => opts.user ?? null },
});

const battle = () => ({
  ok: true, winner: "attacker", turns: 6, seed: 1,
  events: [
    { by: "a", dmg: 20, crit: false, dodge: false, hpA: 100, hpB: 80 },
    { by: "b", dmg: 0, crit: false, dodge: true, hpA: 100, hpB: 80 },
    { by: "b", dmg: 22, crit: false, dodge: false, hpA: 78, hpB: 80 },
    { by: "a", dmg: 33, crit: true, dodge: false, hpA: 78, hpB: 47 },
    { by: "a", dmg: 25, crit: false, dodge: false, hpA: 78, hpB: 22 },
    { by: "a", dmg: 23, crit: false, dodge: false, hpA: 78, hpB: 0 },
  ],
  reward: { tier: "fair", sparks: 10, capped: false }, rewardLimit: 5, sparksLeft: 110, attacksLeft: 14,
  attacker: { userId: ME, stage: 1, stats: { atk: 20, def: 20, spd: 20, hp: 100, power: 80 }, companion: { name: "Blip", rarityEmoji: "⚪", imageUrl: "https://x/blip-1.jpg" } },
  defender: { userId: THEM, stage: 2, stats: { atk: 22, def: 22, spd: 22, hp: 110, power: 88 }, companion: { name: "Wobble", rarityEmoji: "⚪", imageUrl: "https://x/wobble-2.jpg" } },
});

describe("v53 — помощниците за битката", () => {
  it("кадрите: до 3, без дубли, последният е краят", () => {
    expect(battleFrames(9)).toEqual([3, 6, 9]);
    expect(battleFrames(2)).toEqual([1, 2]);
    expect(battleFrames(1)).toEqual([1]);
    expect(battleFrames(0)).toEqual([]);
  });
  it("лентата на живота и редът със статистиките", () => {
    expect(hpBar(50, 100)).toBe("▰▰▰▰▰▱▱▱▱▱");
    expect(hpBar(0, 100)).toBe("▱".repeat(10));
    expect(hpBar(130, 100)).toBe("▰".repeat(10));
    expect(statLine({ atk: 26, def: 18, spd: 19, hp: 90 })).toBe("⚔️\u00a026 · 🛡️\u00a018 · 💨\u00a019 · ❤️\u00a090");
    // редът се чупи само при „·“ — емоджито никога не остава без числото си
    expect(statLine({ atk: 26, def: 18, spd: 19, hp: 90 }).split(" ").every((w) => w === "·" || /\u00a0\d+$/.test(w))).toBe(true);
  });
  it("междинен кадър: заглавие „срещу“, последните удари, живот по кадъра; краен — победител, награда, оставащи атаки", () => {
    const mid = battleEmbed(battle(), 2, "en").toJSON();
    expect(mid.title).toBe("⚔️ Blip vs Wobble");
    expect(mid.description).toContain("🗡️ Blip hits for **20**");
    expect(mid.description).toContain("💨 Blip dodges");
    expect(mid.fields[1].value).toContain("80/110");
    expect(mid.fields[1].name).toContain("stage 2");
    expect(mid.footer).toBeUndefined();
    const end = battleEmbed(battle(), 6, "en").toJSON();
    expect(end.title).toBe("🏆 Blip wins!");
    expect(end.description).toContain("💥 Blip lands a critical hit for **33**!");
    expect(end.fields[2].value).toBe(`✨ +10 for <@${ME}>`);
    expect(end.footer.text).toContain("Attacks left today: 14");
  });
  it("наградите: по-силен, таван, много по-слаб, успешна защита", () => {
    const b = battle();
    b.reward = { tier: "underdog", sparks: 15, capped: false };
    expect(battleEmbed(b, 6, "en").toJSON().fields[2].value).toContain("stronger opponent");
    b.reward = { tier: "fair", sparks: 0, capped: true };
    expect(battleEmbed(b, 6, "en").toJSON().fields[2].value).toContain("daily limit of 5");
    b.reward = { tier: "easy", sparks: 0, capped: false };
    expect(battleEmbed(b, 6, "en").toJSON().fields[2].value).toContain("much weaker");
    b.winner = "defender";
    const j = battleEmbed(b, 6, "bg").toJSON();
    expect(j.title).toBe("🏆 Wobble печели!");
    expect(j.fields[2].value).toBe(`🛡️ <@${THEM}> удържа.`);
  });
  it("v54 — загубата: колко искри и процентът по езика; таван на защитника; нищо при 0", () => {
    const b = battle();
    b.loss = { userId: THEM, sparks: 14, pct: 1.6, capped: false };
    expect(battleEmbed(b, 6, "en").toJSON().fields[2].value).toBe(`✨ +10 for <@${ME}>\n💔 <@${THEM}> loses ✨ 14 (1.6 % of their sparks)`);
    expect(battleEmbed(b, 6, "bg").toJSON().fields[2].value).toContain(`💔 <@${THEM}> губи ✨ 14 (1,6 % от искрите си)`);
    b.loss = { userId: THEM, sparks: 0, pct: 2, capped: true };
    b.lossLimit = 5;
    expect(battleEmbed(b, 6, "en").toJSON().fields[2].value).toContain("already paid for 5 lost defenses today");
    b.loss = { userId: THEM, sparks: 0, pct: 2, capped: false };
    expect(battleEmbed(b, 6, "en").toJSON().fields[2].value).toBe(`✨ +10 for <@${ME}>`);
    // междинните кадри не издават изхода
    b.loss = { userId: THEM, sparks: 14, pct: 1.6, capped: false };
    expect(JSON.stringify(battleEmbed(b, 2, "en").toJSON())).not.toContain("💔");
  });
});

describe("v53 — /companion train", () => {
  it("успех: праща номера → ownedId и статистиката; показва новите статистики и платеното", async () => {
    apiGet.mockResolvedValueOnce(mineList());
    apiPost.mockResolvedValueOnce({ data: { ok: true, stat: "atk", level: 1, cost: 20, sparksLeft: 80, sheet: sheet({ stats: { atk: 22, def: 20, spd: 20, hp: 100, power: 82 } }), companion: { imageUrl: "https://x/blip-1.jpg" } } });
    const i = ix("train", { number: 1, stat: "atk" });
    await companion.execute(i);
    expect(apiPost).toHaveBeenCalledWith(`/bot/game/companions/${GID}/${ME}/train`, { ownedId: "own_0", stat: "atk" });
    const e = i.editReply.mock.calls[0][0].embeds[0].toJSON();
    expect(e.title).toBe("⚔️ Blip trained **Attack** to level 1");
    expect(e.description).toContain("⚔️\u00a022");
    expect(e.footer.text).toBe("Paid ✨ 20 · balance ✨ 80");
  });
  it("таван на формата и недостиг казват точно какво и колко", async () => {
    apiGet.mockResolvedValueOnce(mineList());
    apiPost.mockRejectedValueOnce({ response: { status: 409, data: { error: "STAT_CAP", cap: 4, stage: 1 } } });
    let i = ix("train", { number: 1, stat: "def" });
    await companion.execute(i);
    expect(i.editReply.mock.calls[0][0].content).toContain("Defense has reached the limit for stage 1 (level 4)");
    apiGet.mockResolvedValueOnce(mineList());
    apiPost.mockRejectedValueOnce({ response: { status: 402, data: { error: "NOT_ENOUGH_SPARKS", sparks: 7, cost: 60 } } });
    i = ix("train", { number: 1, stat: "hp" });
    await companion.execute(i);
    expect(i.editReply.mock.calls[0][0].content).toBe("❌ The next Health level costs ✨ 60 — you have ✨ 7.");
  });
});

describe("v53 — /companion attack", () => {
  beforeEach(() => { replay.delayMs = 0; });
  it("бот или себе си → ефимерен отказ веднага, без заявка", async () => {
    let i = ix("attack", { user: { id: THEM, bot: true } });
    await companion.execute(i);
    expect(i.reply.mock.calls[0][0].flags).toBeTruthy();
    i = ix("attack", { user: { id: ME, bot: false } });
    await companion.execute(i);
    expect(i.reply.mock.calls[0][0].content).toBe("❌ You can't attack yourself.");
    expect(apiPost).not.toHaveBeenCalled();
  });
  it("успех: публичен отговор, 3 кадъра, без пингове", async () => {
    apiPost.mockResolvedValueOnce({ data: battle() });
    const i = ix("attack", { user: { id: THEM, bot: false } });
    await companion.execute(i);
    expect(apiPost).toHaveBeenCalledWith("/bot/game/battle", { serverId: GID, attackerId: ME, defenderId: THEM });
    expect(i.deferReply).toHaveBeenCalledWith();
    expect(i.editReply).toHaveBeenCalledTimes(3);
    for (const [arg] of i.editReply.mock.calls) expect(arg.allowedMentions).toEqual({ parse: [] });
    expect(i.editReply.mock.calls[2][0].embeds[0].toJSON().title).toBe("🏆 Blip wins!");
  });
  it("отказ (охлаждане) → публичното „мисли…“ се маха, ефимерен отговор с относително време", async () => {
    apiPost.mockRejectedValueOnce({ response: { status: 429, data: { error: "COOLDOWN", retryInMs: 120000 } } });
    const i = ix("attack", { user: { id: THEM, bot: false } });
    await companion.execute(i);
    expect(i.deleteReply).toHaveBeenCalled();
    const f = i.followUp.mock.calls[0][0];
    expect(f.content).toMatch(/next attack <t:\d+:R>/);
    expect(f.flags).toBeTruthy();
    expect(i.editReply).not.toHaveBeenCalled();
  });
  it("щит и pvp off на целта споменават целта, без да я пингват", async () => {
    apiPost.mockRejectedValueOnce({ response: { status: 403, data: { error: "TARGET_PVP_OFF" } } });
    const i = ix("attack", { user: { id: THEM, bot: false } });
    await companion.execute(i);
    const f = i.followUp.mock.calls[0][0];
    expect(f.content).toBe(`🕊️ <@${THEM}> doesn't take part in battles.`);
    expect(f.allowedMentions).toEqual({ parse: [] });
  });
});

describe("v53 — /companion pvp и /profile", () => {
  it("pvp off → enabled:false; заключено → кога", async () => {
    apiPost.mockResolvedValueOnce({ data: { ok: true, enabled: false } });
    let i = ix("pvp", { mode: "off" });
    await companion.execute(i);
    expect(apiPost).toHaveBeenCalledWith(`/bot/game/pvp/${GID}/${ME}`, { enabled: false });
    expect(i.editReply.mock.calls[0][0].content).toContain("out of battles");
    apiPost.mockRejectedValueOnce({ response: { status: 409, data: { error: "PVP_LOCKED", retryInMs: 600000 } } });
    i = ix("pvp", { mode: "off" });
    await companion.execute(i);
    expect(i.editReply.mock.calls[0][0].content).toMatch(/leave battles <t:\d+:R>/);
  });
  it("/companion info показва статистики, тренировка с цени и рекорд", async () => {
    apiGet.mockResolvedValueOnce(mineList());
    const i = ix("info", { number: 1 });
    await companion.execute(i);
    const f = i.editReply.mock.calls[0][0].embeds[0].toJSON().fields;
    expect(f.find((x) => x.name === "Stats").value).toBe("⚔️\u00a020 · 🛡️\u00a020 · 💨\u00a020 · ❤️\u00a0100\n💪\u00a0Power\u00a080");
    expect(f.find((x) => x.name.startsWith("Training")).value).toContain("⚔️\u00a0Attack\u00a00/4 · ✨\u00a020");
    expect(f.find((x) => x.name === "Battles").value).toBe("🏆 3 · 💔 1");
  });
  it("/profile показва статистиките на активния и „не участва“ при pvp off", async () => {
    apiGet.mockResolvedValueOnce({ data: { enabled: true, progress: { level: 1, pct: 10, into: 10, need: 100 }, sparks: 5, streak: 1, messages: 3, voiceMinutes: 0, rank: 1, players: 2, companions: 1, pvp: false,
      activeCompanion: { name: "Blip", rarityEmoji: "⚪", stage: 1, imageUrl: "https://x/blip-1.jpg", sheet: sheet() } } });
    const i = { ...ix("x"), options: { getUser: () => null } };
    i.user = { id: ME, username: "me", displayName: "me", displayAvatarURL: () => "https://x/a.png", bot: false };
    await profile.execute(i);
    const v = i.editReply.mock.calls[0][0].embeds[0].toJSON().fields.find((x) => x.name === "Companion").value;
    expect(v).toContain("⚔️\u00a020 · 🛡️\u00a020 · 💨\u00a020 · ❤️\u00a0100 · 💪\u00a0Power\u00a080");
    expect(v).toContain("🏆 3 · 💔 1 · 🕊️ not in battles");
  });
});

// ─── Картата на спътника на езика на сървъра (преглед 10.10.2026) ────────────
const text = await import("../utils/companionText.js");
const { t: tr } = await import("../i18n/index.js");

describe("картата на спътника е преведена", () => {
  const blip = { name: "Blip", rarity: "common", familyKey: "lime", rarityLabel: "Common", family: "Lime", blurb: "Blip is a friendly lime jelly." };
  it("редкост, семейство и описание на български; без familyKey — от каталожния id", () => {
    expect(text.rarityName(blip, "bg")).toBe("Обикновен");
    expect(text.familyName(blip, "bg")).toBe("Лайм");
    expect(text.companionBlurb(blip, "bg")).toBe("Blip е дружелюбно желе от семейство „Лайм“, с кръгли очила и мъничка академична шапка.");
    const fromRow = { name: "Spark", rarity: "rare", companionId: "ember-spark" };
    expect(text.familyName(fromRow, "de")).toBe("Glut");
    expect(text.companionBlurb(fromRow, "en")).toBe("Spark is a rare jelly from the Ember family, with round glasses and a tiny graduation cap.");
  });
  it("непознати ключове → английският текст от каталога, никога празно или „game.rarity.x“", () => {
    const odd = { name: "X", rarity: "mythic", familyKey: "plasma", rarityLabel: "Mythic", family: "Plasma", blurb: "X." };
    expect(text.rarityName(odd, "bg")).toBe("Mythic");
    expect(text.familyName(odd, "bg")).toBe("Plasma");
    expect(text.companionBlurb(odd, "bg")).toBe("X.");
  });
  it("всяка редкост и всяко семейство има превод на 8-те езика", () => {
    for (const lang of ["en", "bg", "it", "de", "es", "fr", "nl", "pl"]) {
      for (const r of text.RARITY_KEYS) expect(tr(`game.rarity.${r}`, lang)).not.toMatch(/^game\./);
      for (const f of text.FAMILY_KEYS) expect(tr(`game.family.${f}`, lang)).not.toMatch(/^game\./);
    }
  });
  it("/companion info на български: описание, редкост и семейство", async () => {
    apiGet.mockResolvedValueOnce({ data: { sparks: 1, activeId: "own_0", companions: [{ id: "own_0", companionId: "ember-spark", index: 1, name: "Spark", nickname: null, rarity: "common", familyKey: "ember", rarityEmoji: "⚪", rarityLabel: "Common", family: "Ember", blurb: "Spark is a friendly ember jelly.", stage: 1, fed: 0, nextStageAt: 100, imageUrl: "https://x/s.jpg" }] } });
    const i = { ...ix("info", { number: 1 }), locale: "bg" };
    await companion.execute(i);
    const e = i.editReply.mock.calls[0][0].embeds[0].toJSON();
    expect(e.description).toBe("Spark е дружелюбно желе от семейство „Жар“, с кръгли очила и мъничка академична шапка.");
    expect(e.fields.find((f) => f.name === "Редкост").value).toBe("Обикновен");
    expect(e.fields.find((f) => f.name === "Семейство").value).toBe("Жар");
  });
  it("появата: „⚪ Обикновен спътник“ на български, етикет „Rarità:“ на италиански", () => {
    const data = { spawn: { id: "sp1" }, companion: { name: "Blip", rarity: "common", rarityEmoji: "⚪", rarityLabel: "Common", imageUrl: "https://x/b.jpg" } };
    expect(game.spawnMessage(data, "bg", tr).embeds[0].toJSON().description).toMatch(/^⚪ Обикновен спътник ·/);
    expect(game.spawnMessage(data, "it", tr).embeds[0].toJSON().description).toMatch(/^Rarità: ⚪ Comune ·/);
  });
});
