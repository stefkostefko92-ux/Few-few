// bot/src/__tests__/launchGame.test.js
// Готовност за пускане, поток И — играта от страната на бота (И1, И3, И6).
// Номерът на критерия е в името на всеки тест.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PermissionsBitField } from "discord.js";

const apiPost = vi.fn();
const apiGet = vi.fn();
vi.mock("../utils/api.js", () => ({ default: { post: (...a) => apiPost(...a), get: (...a) => apiGet(...a), patch: vi.fn() } }));

const { handleGameInteraction } = await import("../utils/gameInteractions.js");
const companion = (await import("../commands/companion.js")).default;
const { firstSeen, __test: dedupe } = await import("../utils/messageDedupe.js");
const en = (await import("../i18n/en.js")).default;

const GID = "222222222222222222";
const UID = "333333333333333333";
const ROLE = "777777777777777777";

/** Роля, която ботът може да даде (под най-високата му роля, без опасни права). */
const goodRole = (o = {}) => ({ id: ROLE, managed: false, permissions: new PermissionsBitField(0n), comparePositionTo: () => -1, ...o });
function buyIx({ role = goodRole(), hasRole = false, addRole = vi.fn().mockResolvedValue(undefined) } = {}) {
  const roles = new Map(role ? [[ROLE, role]] : []);
  return {
    customId: "game:buy:it1", isButton: () => true, isStringSelectMenu: () => false, locale: "en",
    guildId: GID, user: { id: UID },
    deferUpdate: vi.fn(), editReply: vi.fn(),
    guild: { roles: { cache: roles, fetch: vi.fn().mockResolvedValue(null) }, members: { me: { roles: { highest: {} } } } },
    member: { roles: { cache: { has: () => hasRole }, add: addRole } },
    _addRole: addRole,
  };
}
const shopItem = (o = {}) => ({ id: "it1", name: "VIP", priceSparks: 100, type: "ROLE", roleId: ROLE, durationDays: null, ...o });
const bought = (o = {}) => ({ data: { ok: true, item: shopItem(o), purchase: { id: "p1", expiresAt: null }, sparksLeft: 50 } });
const buyCalls = () => apiPost.mock.calls.filter((c) => /\/buy$/.test(c[0]));
const refundCalls = () => apiPost.mock.calls.filter((c) => /\/refund$/.test(c[0]));
const text = (i) => i.editReply.mock.calls.at(-1)[0].content ?? i.editReply.mock.calls.at(-1)[0].embeds?.[0]?.data?.description;

beforeEach(() => {
  vi.resetAllMocks();
  dedupe.seen.clear();
});

describe("И1 — магазин: проверка ПРЕДИ покупката, връщане на искри при неуспех", () => {
  it("И1: роля над ботската → без покупка (нищо не се взема), ясно обяснение", async () => {
    apiGet.mockResolvedValue({ data: [shopItem()] });
    const i = buyIx({ role: goodRole({ comparePositionTo: () => 1 }) });
    await handleGameInteraction(i);
    expect(buyCalls()).toHaveLength(0);
    expect(text(i)).toBe(en["game.shop.roleUnavailable"].replace("{{reason}}", "above_bot"));
  });

  it("И1: изтрита роля (липсва в сървъра) → без покупка", async () => {
    apiGet.mockResolvedValue({ data: [shopItem()] });
    const i = buyIx({ role: null });
    await handleGameInteraction(i);
    expect(buyCalls()).toHaveLength(0);
    expect(text(i)).toContain("missing");
  });

  it("И1: постоянна роля, която вече имаш → ALREADY_OWNED текст, без покупка", async () => {
    apiGet.mockResolvedValue({ data: [shopItem()] });
    const i = buyIx({ hasRole: true });
    await handleGameInteraction(i);
    expect(buyCalls()).toHaveLength(0);
    expect(text(i)).toBe(en["game.shop.alreadyOwned"]);
  });

  it("И1: временна роля, която вече имаш, МОЖЕ да се купи (удължаване)", async () => {
    apiGet.mockResolvedValue({ data: [shopItem({ durationDays: 7 })] });
    apiPost.mockResolvedValueOnce(bought({ durationDays: 7 }));
    const i = buyIx({ hasRole: true });
    await handleGameInteraction(i);
    expect(buyCalls()).toHaveLength(1);
  });

  it("И1: backend-ът казва ALREADY_OWNED (покупка по запис) → същият текст, без втори опит", async () => {
    apiGet.mockResolvedValue({ data: [shopItem()] });
    apiPost.mockRejectedValueOnce({ response: { status: 409, data: { code: "ALREADY_OWNED" } } });
    const i = buyIx();
    await handleGameInteraction(i);
    expect(text(i)).toBe(en["game.shop.alreadyOwned"]);
  });

  it("И1: ролята се получава → без връщане на искри", async () => {
    apiGet.mockResolvedValue({ data: [shopItem()] });
    apiPost.mockResolvedValueOnce(bought());
    const i = buyIx();
    await handleGameInteraction(i);
    expect(i._addRole).toHaveBeenCalled();
    expect(refundCalls()).toHaveLength(0);
  });

  it("И1: ролята не може да се даде СЛЕД покупката → искрите се връщат (refund) и човекът е уведомен", async () => {
    apiGet.mockResolvedValue({ data: [shopItem()] });
    apiPost.mockResolvedValueOnce(bought()).mockResolvedValueOnce({ data: { ok: true, refunded: 100 } });
    const i = buyIx({ addRole: vi.fn().mockRejectedValue(new Error("Missing Permissions")) });
    await handleGameInteraction(i);
    expect(refundCalls()).toHaveLength(1);
    expect(refundCalls()[0][0]).toBe(`/bot/game/shop/${GID}/purchase/p1/refund`);
    expect(refundCalls()[0][1]).toEqual({ userId: UID });
    expect(text(i)).toBe(en["game.shop.roleRefunded"].replace("{{reason}}", "failed").replace("{{sparks}}", "100"));
  });

  it("И1: неуспешно връщане → честен текст „покупката е записана“, не лъжа за възстановени искри", async () => {
    apiGet.mockResolvedValue({ data: [shopItem()] });
    apiPost.mockResolvedValueOnce(bought()).mockRejectedValueOnce(new Error("backend down"));
    const i = buyIx({ addRole: vi.fn().mockRejectedValue(new Error("x")) });
    await handleGameInteraction(i);
    expect(text(i)).toContain("failed");
    expect(text(i)).not.toBe(en["game.shop.roleRefunded"]);
  });
});

describe("И6 — /companion attack срещу човек извън сървъра", () => {
  const ix = (user, member) => ({
    guildId: GID, user: { id: UID }, locale: "en",
    deferReply: vi.fn(), editReply: vi.fn(), reply: vi.fn(), deleteReply: vi.fn(async () => {}), followUp: vi.fn(),
    options: { getSubcommand: () => "attack", getUser: () => user, getMember: () => member },
  });

  it("И6: напуснал (getMember → null) → ефимерен отказ, backend-ът не се вика, няма публично „мисли…“", async () => {
    const i = ix({ id: "444444444444444444", bot: false }, null);
    await companion.execute(i);
    expect(apiPost).not.toHaveBeenCalled();
    expect(i.deferReply).not.toHaveBeenCalled();
    const arg = i.reply.mock.calls[0][0];
    expect(arg.content).toBe(en["game.battle.notMember"].replace("{{user}}", "<@444444444444444444>"));
    expect(arg.flags).toBeTruthy();
    expect(arg.allowedMentions).toEqual({ parse: [] });
  });

  it("И6: присъстващ член → битката минава към backend-а", async () => {
    apiPost.mockRejectedValueOnce({ response: { status: 409, data: { error: "ON_COOLDOWN" } } });
    const i = ix({ id: "444444444444444444", bot: false }, { id: "444444444444444444" });
    await companion.execute(i);
    expect(apiPost).toHaveBeenCalledWith("/bot/game/battle", expect.objectContaining({ defenderId: "444444444444444444" }));
  });
});

describe("И3 — едно съобщение се брои веднъж (главен + white-label бот)", () => {
  it("И3: второто виждане на същото message.id в рамките на TTL е отхвърлено", () => {
    expect(firstSeen("count:1", 1_000)).toBe(true);
    expect(firstSeen("count:1", 1_500)).toBe(false);
    expect(firstSeen("count:2", 1_500)).toBe(true);
  });

  it("И3: след TTL ключът се освобождава (картата не расте безкрай)", () => {
    expect(firstSeen("count:9", 0)).toBe(true);
    expect(firstSeen("count:9", dedupe.TTL_MS + 1)).toBe(true);
    for (let i = 0; i < dedupe.MAX_ENTRIES + 50; i++) firstSeen(`k${i}`, 10);
    expect(dedupe.seen.size).toBeLessThanOrEqual(dedupe.MAX_ENTRIES);
  });
});

describe("И3 — messageCreate: двата клиента, едно съобщение → onCounting веднъж", () => {
  it("И3: execute, извикан два пъти за едно и също message.id в counting канала, праща една заявка към backend-а", async () => {
    vi.resetModules();
    const post = vi.fn().mockResolvedValue({ data: { ok: true, number: 5, high: 5, record: false, milestone: false, xp: 0 } });
    vi.doMock("../utils/api.js", () => ({ default: { post, get: vi.fn().mockResolvedValue({ data: null }), patch: vi.fn() } }));
    vi.doMock("../utils/game.js", async (orig) => ({
      ...(await orig()),
      getGameSettings: vi.fn().mockResolvedValue({ enabled: true, countingChannelId: "500000000000000002" }),
      onMessageForXp: vi.fn().mockResolvedValue(undefined),
      noteSpawnActivity: vi.fn(),
    }));
    vi.doMock("../utils/bait.js", () => ({ onBaitMessage: vi.fn().mockResolvedValue(false) }));
    const mc = (await import("../events/messageCreate.js")).default;
    const message = {
      id: "m-1", guildId: GID, channelId: "500000000000000002", content: "5",
      author: { id: UID, bot: false }, react: vi.fn().mockResolvedValue(true),
      channel: { id: "500000000000000002", send: vi.fn().mockResolvedValue({}), messages: { fetch: vi.fn() } },
    };
    await mc.execute(message); // главният клиент
    await mc.execute(message); // white-label клиентът
    await new Promise((r) => setTimeout(r, 30));
    const counting = post.mock.calls.filter((c) => /counting/.test(c[0]));
    expect(counting).toHaveLength(1);
  });
});
