// bot/src/__tests__/spawnCommand.test.js
// /spawn — админът пуска спътник на ръка. Проверява: гардът (и в autocomplete),
// проверката на правата на бота ПРЕДИ заявката (иначе появата блокира следващата
// за 5 минути, без съобщение), грешките на backend-а към ясни отговори и че
// успехът публикува същата поява като естествената (бутон game:catch:<id>).
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiPost = vi.fn();
const apiGet = vi.fn();
const apiPatch = vi.fn().mockResolvedValue({ data: { ok: true } });
vi.mock("../utils/api.js", () => ({ default: { post: (...a) => apiPost(...a), get: (...a) => apiGet(...a), patch: (...a) => apiPatch(...a) } }));

const spawn = (await import("../commands/spawn.js")).default;

const SID = "222222222222222222";
const CID = "444444444444444444";

function channel({ canSend = true } = {}) {
  return {
    id: CID, guildId: SID,
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => canSend }),
    send: vi.fn(async () => ({ id: "555555555555555555" })),
    messages: { fetch: vi.fn() },
  };
}
function ix({ admin = true, ch = channel(), companion = null } = {}) {
  return {
    guildId: SID, locale: "en", user: { id: "333333333333333333" }, client: {},
    memberPermissions: { has: () => admin },
    guild: { members: { me: { id: "bot" } } },
    channel: ch,
    options: { getChannel: () => null, getString: (n) => (n === "companion" ? companion : null), getFocused: () => "bl" },
    deferReply: vi.fn(), editReply: vi.fn(), respond: vi.fn(),
  };
}
const reply = (i) => JSON.stringify(i.editReply.mock.calls.at(-1)[0]);
const spawnData = { spawn: { id: "sp1", expiresAt: new Date(Date.now() + 300_000).toISOString() }, companion: { id: "lime-blip", name: "Blip", rarityEmoji: "⚪", rarityLabel: "Common", imageUrl: "https://x.test/a.jpg" } };

beforeEach(() => vi.clearAllMocks());

describe("/spawn", () => {
  it("дефиниция: guild-only, Manage Server по подразбиране, autocomplete за спътника", () => {
    const j = spawn.data.toJSON();
    expect(j.name).toBe("spawn");
    expect(j.dm_permission).toBe(false);
    expect(j.default_member_permissions).toBe("32"); // ManageGuild
    expect(j.options.find((o) => o.name === "companion").autocomplete).toBe(true);
  });

  it("член без право → отказ, нищо не се иска от backend-а", async () => {
    const i = ix({ admin: false });
    await spawn.execute(i);
    expect(reply(i)).toContain("Manage Server");
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("ботът не може да пише в канала → отказ ПРЕДИ появата да бъде създадена", async () => {
    const i = ix({ ch: channel({ canSend: false }) });
    await spawn.execute(i);
    expect(reply(i)).toContain("can't post");
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("жива поява / непозволен спътник → ясно съобщение", async () => {
    apiPost.mockRejectedValueOnce({ response: { data: { error: "SPAWN_ACTIVE" } } });
    let i = ix();
    await spawn.execute(i);
    expect(reply(i)).toContain("already out");
    apiPost.mockRejectedValueOnce({ response: { data: { error: "COMPANION_NOT_ALLOWED" } } });
    i = ix({ companion: "gold-midas" });
    await spawn.execute(i);
    expect(reply(i)).toContain("Premium");
  });

  it("успех → ръчната заявка с избрания спътник и поява с бутон game:catch:<id>", async () => {
    apiPost.mockResolvedValueOnce({ data: spawnData });
    const ch = channel();
    const i = ix({ ch, companion: "lime-blip" });
    await spawn.execute(i);
    expect(apiPost).toHaveBeenCalledWith("/bot/game/spawn/manual", { serverId: SID, channelId: CID, companionId: "lime-blip" });
    const sent = ch.send.mock.calls[0][0];
    expect(sent.components[0].toJSON().components[0].custom_id).toBe("game:catch:sp1");
    expect(apiPatch).toHaveBeenCalledWith("/bot/game/spawn/sp1/message", { messageId: "555555555555555555" });
    expect(reply(i)).toContain("Blip");
  });

  it("autocomplete: без право → празно; с право → позволените от backend-а, филтрирани", async () => {
    let i = ix({ admin: false });
    await spawn.autocomplete(i);
    expect(i.respond).toHaveBeenCalledWith([]);
    expect(apiGet).not.toHaveBeenCalled();
    apiGet.mockResolvedValueOnce({ data: { companions: [spawnData.companion, { id: "teal-tidebrook", name: "Tidebrook", rarityEmoji: "🟢", rarityLabel: "Uncommon" }] } });
    i = ix();
    await spawn.autocomplete(i);
    expect(apiGet).toHaveBeenCalledWith(`/bot/game/companions/spawnable/${SID}`);
    expect(i.respond).toHaveBeenCalledWith([{ name: "⚪ Blip · Common", value: "lime-blip" }]);
  });
});
