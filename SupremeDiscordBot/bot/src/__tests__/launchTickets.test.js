// bot/src/__tests__/launchTickets.test.js
// Поток Т, фаза 1 (docs/LAUNCH_READINESS_SPEC.md): Т1, Т2, Т3, Т7, Т8, Т9, Т12, Т13, Т15, Т17.
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.API_SECRET = "test-secret";
const get = vi.fn(), post = vi.fn(), patch = vi.fn();
vi.mock("axios", () => ({
  default: { create: () => ({ get: (...a) => get(...a), post: (...a) => post(...a), patch: (...a) => patch(...a), delete: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } }) },
}));

const { usesTicketFlow } = await import("../utils/formSession.js");
const { closeTicket, finalizeTicketClose, reopenTicketChannel, moveTicketToPanel } = await import("../utils/ticketLifecycle.js");
const { ticketChannelCache, invalidateTicketChannel } = await import("../utils/ticketCaches.js");
const { describeTicketError } = await import("../utils/ticketErrors.js");
const { capped } = await import("../utils/panelCache.js");
const ticketCmd = (await import("../commands/ticket.js")).default;
const renameCmd = (await import("../commands/rename.js")).default;
const newCmd = (await import("../commands/new.js")).default;
const { preflight } = await import("../events/interactionCreate.js");

const GUILD = "111111111111111111";
const sent = () => [];
function fakeThread() {
  const msgs = [];
  return { id: "th1", guildId: GUILD, msgs, isThread: () => true, setLocked: vi.fn(async () => {}), setArchived: vi.fn(async () => {}),
    send: vi.fn(async (m) => { msgs.push(m); return {}; }), members: { add: vi.fn() } };
}
function fakeChannel() {
  return { id: "ch1", guildId: GUILD, name: "ticket-1", isThread: () => false, parent: { id: "open" },
    setParent: vi.fn(async () => {}), permissionOverwrites: { edit: vi.fn(async () => {}), create: vi.fn(), delete: vi.fn() },
    send: vi.fn(async () => ({})) };
}
const guild = { id: GUILD, name: "G", memberCount: 3, channels: { cache: new Map(), fetch: vi.fn(async () => null) }, members: {} };
const client = { users: { fetch: vi.fn(async () => null) }, channels: { cache: new Map(), fetch: vi.fn() }, guilds: { cache: new Map([[GUILD, guild]]), fetch: vi.fn() } };

beforeEach(() => vi.clearAllMocks());

describe("Т1 — формуляр на бутон → тикет", () => {
  it("панел само с categoryOpenId (както го пише таблото) върви към тикет, не към кандидатура", () => {
    expect(usesTicketFlow({ form: { isApplication: false }, panel: { id: "p1", categoryOpenId: "c1", categoryId: null } })).toBe(true);
    expect(usesTicketFlow({ form: { isApplication: false }, panel: { id: "p1" } })).toBe(true);
  });
  it("кандидатура и /form spawn (панел без id) остават подавания", () => {
    expect(usesTicketFlow({ form: { isApplication: true }, panel: { id: "p1" } })).toBe(false);
    expect(usesTicketFlow({ form: {}, panel: { id: null } })).toBe(false);
  });
});

describe("Т2/Т17 — едно затваряне на бота", () => {
  const closed = (over = {}) => ({ id: "t1", number: 5, creatorId: "u1", channelId: "ch1", panel: { name: "S", counterPadding: 4 }, fullArchiveUrl: "https://x/a", ...over });

  it("409 от бекенда (второ затваряне) → ok:false, нищо не се праща в канала", async () => {
    const ch = fakeChannel();
    post.mockRejectedValue({ response: { status: 409, data: { code: "ALREADY_CLOSED" } } });
    const r = await closeTicket(client, { ticketId: "t1", guildId: GUILD, channel: ch, lang: "en" });
    expect(r).toEqual({ ok: false, code: "ALREADY_CLOSED" });
    expect(ch.send).not.toHaveBeenCalled();
  });

  it("успех → ЕДНО съобщение с Reopen/Delete на езика на сървъра и инвалидиран кеш (Т15)", async () => {
    const ch = fakeChannel();
    ticketChannelCache.set("ch1", { ticketId: null, expiresAt: Date.now() + 1e6 });
    post.mockResolvedValue({ data: closed() });
    const r = await closeTicket(client, { ticketId: "t1", guildId: GUILD, channel: ch, lang: "bg", closedById: "s1" });
    expect(r.ok).toBe(true);
    expect(ch.send).toHaveBeenCalledTimes(1);
    const payload = ch.send.mock.calls[0][0];
    expect(payload.embeds[0].title).toBe("🔒 Тикетът е затворен");
    const labels = payload.components[0].components.map((c) => c.data.label);
    expect(labels).toEqual(["Отвори отново", "Изтрий", "Виж преписа"]);
    expect(ticketChannelCache.has("ch1")).toBe(false);
  });

  it("автозатваряне (без closedById) минава през същия път и казва „автоматично“", async () => {
    const ch = fakeChannel();
    post.mockResolvedValue({ data: closed() });
    await closeTicket(client, { ticketId: "t1", guildId: GUILD, channel: ch, lang: "en", source: "inactivity", inactiveBeforeMs: 5 });
    expect(post.mock.calls[0][1]).toMatchObject({ inactiveBeforeMs: 5, source: "inactivity", serverId: GUILD });
    expect(ch.send.mock.calls[0][0].embeds[0].description).toContain("Closed automatically.");
  });

  it("DM/оценка/лог/категория по ПЪЛНИЯ панел", async () => {
    const ch = fakeChannel();
    const dm = vi.fn(async () => {});
    client.users.fetch.mockResolvedValue({ send: dm });
    const logCh = { send: vi.fn(async () => {}) };
    guild.channels.fetch.mockResolvedValue(logCh);
    post.mockResolvedValue({ data: closed({ panel: { name: "S", counterPadding: 4, dmOnClose: true, dmOnCloseMessage: "bye", feedbackEnabled: true, categoryClosedId: "closedcat", logChannelId: "lg" } }) });
    await closeTicket(client, { ticketId: "t1", guildId: GUILD, channel: ch, lang: "en" });
    expect(ch.setParent).toHaveBeenCalledWith("closedcat", expect.anything());
    expect(dm).toHaveBeenCalledTimes(2); // ЛС + оценка
    expect(logCh.send).toHaveBeenCalled();
    client.users.fetch.mockResolvedValue(null);
  });

  it("причина над 1000 знака се реже", async () => {
    post.mockResolvedValue({ data: closed() });
    await closeTicket(client, { ticketId: "t1", guildId: GUILD, channel: fakeChannel(), reason: "x".repeat(5000), lang: "en" });
    expect(post.mock.calls[0][1].reason.length).toBe(1000);
  });
});

describe("Т3 — нишки", () => {
  it("затваряне: lock+archive, без setParent/permissionOverwrites", async () => {
    const th = fakeThread();
    post.mockResolvedValue({ data: { id: "t1", number: 1, creatorId: "u1", channelId: "th1", panel: { categoryClosedId: "c" } } });
    await expect(closeTicket(client, { ticketId: "t1", guildId: GUILD, channel: th, lang: "en" })).resolves.toMatchObject({ ok: true });
    expect(th.setLocked).toHaveBeenCalledWith(true);
    expect(th.setArchived).toHaveBeenCalledWith(true);
  });
  it("reopen: setArchived(false)+setLocked(false), без TypeError от setParent", async () => {
    const th = fakeThread();
    await expect(reopenTicketChannel(th, { categoryOpenId: "open" }, { id: "t1", creatorId: "u1" })).resolves.toEqual({ warnings: [] });
    expect(th.setArchived).toHaveBeenCalledWith(false);
    expect(th.setLocked).toHaveBeenCalledWith(false);
  });
  it("reopen: провал на Discord се хвърля ПРЕДИ записа в базата", async () => {
    const th = fakeThread();
    th.setArchived.mockRejectedValue(Object.assign(new Error("x"), { code: 50013 }));
    await expect(reopenTicketChannel(th, {}, { id: "t1" })).rejects.toBeTruthy();
  });
  it("escalate в нишка не гърми", async () => {
    const th = fakeThread();
    const r = await moveTicketToPanel(th, guild, { supportRoleIds: ["a"] }, { supportRoleIds: ["b"], categoryOpenId: "x" });
    expect(r.added).toEqual(["b"]);
  });
});

describe("Т15 — кеш канал → тикет", () => {
  it("invalidateTicketChannel чисти записа", () => {
    ticketChannelCache.set("c9", { ticketId: null, expiresAt: Date.now() + 1e6 });
    invalidateTicketChannel("c9");
    expect(ticketChannelCache.has("c9")).toBe(false);
  });
});

describe("Т12 — преведени Discord кодове", () => {
  it.each([30013, 50013, 10003, 10011, 50035])("код %i → преведен текст, без суровото съобщение", (code) => {
    const txt = describeTicketError({ code, message: "RAW ENGLISH Missing Permissions" }, "bg");
    expect(txt).not.toContain("RAW ENGLISH");
    expect(txt).toMatch(/[а-я]/i);
  });
  it("30013 споменава лимита 50/500", () => {
    expect(describeTicketError({ code: 30013 }, "en")).toMatch(/50.*500/);
  });
});

describe("Т13 — таван пред първия отговор", () => {
  it("capped връща fallback при зависнала заявка", async () => {
    const r = await capped(new Promise(() => {}), 30, "fallback");
    expect(r).toBe("fallback");
  });
  it("/ticket отговаря (defer) ПРЕДИ заявката към бекенда", async () => {
    const order = [];
    get.mockImplementation(() => { order.push("api"); return new Promise(() => {}); });
    const i = { options: { getSubcommand: () => "claim" }, deferReply: vi.fn(async () => { order.push("defer"); }), locale: "en", guildId: GUILD, channelId: "c", editReply: vi.fn() };
    void ticketCmd.execute(i);
    await new Promise((r) => setTimeout(r, 10));
    expect(order[0]).toBe("defer");
  });
});

describe("Т7 — /rename: първо бекенд, после Discord", () => {
  it("403 Premium → каналът НЕ се преименува, текстът е преведен", async () => {
    get.mockResolvedValue({ data: { id: "t1", serverId: GUILD, panel: { supportRoleIds: [] } } });
    post.mockRejectedValue({ response: { status: 403, data: { code: "PREMIUM_REQUIRED" } }, message: "Request failed with status code 403" });
    const setName = vi.fn();
    const i = { options: { getString: () => "new-name" }, deferReply: vi.fn(), editReply: vi.fn(), locale: "bg", guildId: GUILD, channelId: "c",
      member: { roles: { cache: new Map() }, permissions: { has: () => true } }, user: { id: "u", tag: "u" }, channel: { setName } };
    await renameCmd.execute(i);
    expect(setName).not.toHaveBeenCalled();
    const txt = i.editReply.mock.calls.at(-1)[0];
    expect(txt).toContain("Premium");
    expect(txt).not.toContain("status code");
  });
});

describe("Т8 — /new", () => {
  it("непознат панел → отказ, без създаване на канал (няма тих panels[0])", async () => {
    get.mockResolvedValue({ data: [{ id: "p1", name: "Support" }, { id: "p2", name: "Billing" }] });
    const create = vi.fn();
    const i = { options: { getString: (n) => (n === "panel" ? "nonexistent" : null), getUser: () => null }, deferReply: vi.fn(), editReply: vi.fn(),
      locale: "en", guildId: GUILD, user: { id: `u${Math.random()}` }, guild: { channels: { create } }, member: {} };
    await newCmd.execute(i);
    expect(create).not.toHaveBeenCalled();
    expect(i.editReply.mock.calls.at(-1)[0]).toContain("No panel with that name");
  });
});

describe("Т9 — blacklist за пътищата на отваряне", () => {
  it("preflight отказва ephemeral на блокиран потребител при бутон/меню/модал", async () => {
    get.mockResolvedValue({ data: { blacklisted: true } });
    const i = { user: { id: "bad1" }, locale: "en", reply: vi.fn(async () => {}) };
    expect(await preflight(i)).toBe(false);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: expect.anything() }));
  });
  it("preflight пропуска чист потребител; срив на бекенда → fail-open", async () => {
    get.mockResolvedValue({ data: { blacklisted: false } });
    expect(await preflight({ user: { id: "ok1" }, reply: vi.fn() })).toBe(true);
    get.mockRejectedValue(new Error("down"));
    expect(await preflight({ user: { id: "ok2" }, reply: vi.fn() })).toBe(true);
  });
});

describe("Т18 — причина на /ticket close до 1000", () => {
  it("опцията reason има max_length 1000", () => {
    const close = ticketCmd.data.toJSON().options.find((o) => o.name === "close");
    expect(close.options.find((o) => o.name === "reason").max_length).toBe(1000);
  });
});
