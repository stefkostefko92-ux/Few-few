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

beforeEach(() => { vi.clearAllMocks(); game.__test.spawnState.clear(); game.__setRandom(null); });

describe("/companion", () => {
  it("шестте подкоманди и локализация; каталогът обявява петте публични", () => {
    const json = companion.data.toJSON();
    expect(json.options.map((o) => o.name)).toEqual(["list", "info", "feed", "activate", "release", "trade"]);
    expect(json.dm_permission).toBe(false);
    expect(CMD_DESC_L10N.companion.bg).toBeTruthy();
    const cat = COMMAND_CATALOG.find((c) => c.category === "Game");
    expect(cat.commands.map((c) => c.name)).toEqual(expect.arrayContaining(["/companion list", "/companion feed", "/companion activate", "/companion trade", "/companion release"]));
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
    expect(apiPost).toHaveBeenCalledWith("/bot/game/spawn/sp1/catch", { userId: "333333333333333333" });
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
