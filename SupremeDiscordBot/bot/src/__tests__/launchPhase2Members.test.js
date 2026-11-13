// bot/src/__tests__/launchPhase2Members.test.js
// Поток Т, фаза 2: В4 (бан/изгонване не оставя снимка на роли), В5 (частичен член; затопляне на кеша
// само за сървъри със запазване на роли), З9 (изтрито съобщение с роли по реакция).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const apiGet = vi.fn(), apiPost = vi.fn(), apiDelete = vi.fn();
vi.mock("../utils/api.js", () => ({
  default: { get: (...a) => apiGet(...a), post: (...a) => apiPost(...a), delete: (...a) => apiDelete(...a), patch: vi.fn() },
  markTicketMessage: vi.fn(() => Promise.resolve()),
}));
const fetchRemovalCause = vi.fn(), logServerEvent = vi.fn(async () => {}), isEventCategoryEnabled = vi.fn(async () => false);
vi.mock("../utils/serverEventLog.js", () => ({
  fetchRemovalCause: (...a) => fetchRemovalCause(...a), logServerEvent: (...a) => logServerEvent(...a),
  isEventCategoryEnabled: (...a) => isEventCategoryEnabled(...a), fetchAuditActor: vi.fn(async () => null), AuditLogEvent: {},
}));
const closeTicket = vi.fn(async () => ({ ok: true }));
vi.mock("../utils/ticketLifecycle.js", () => ({ closeTicket: (...a) => closeTicket(...a) }));

const memberRemove = (await import("../events/guildMemberRemove.js")).default;
const messageDelete = (await import("../events/messageDelete.js")).default;
const messageDeleteBulk = (await import("../events/messageDeleteBulk.js")).default;
const GUILD = "111111111111111111", USER = "222222222222222222";

const roleMap = (ids) => new Map(ids.map((id) => [id, { id, managed: false }]));
function member({ partial = false, roles = ["r1"], bans = null } = {}) {
  return {
    id: USER, partial, user: partial ? null : { id: USER, tag: "u#1", username: "u" }, client: {},
    roles: { cache: roleMap(partial ? [] : roles) },
    guild: { id: GUILD, bans: { fetch: vi.fn(async () => { if (bans) return bans; throw Object.assign(new Error("Unknown Ban"), { code: 10026 }); }) },
      channels: { fetch: vi.fn(async () => null) } },
  };
}
const snapshotPosts = () => apiPost.mock.calls.filter((c) => String(c[0]).startsWith("/bot/member-roles/"));

beforeEach(() => {
  vi.clearAllMocks();
  apiGet.mockResolvedValue({ data: [] });
  apiPost.mockResolvedValue({ data: {} });
  fetchRemovalCause.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe("В4 — бан/изгонване и снимката на ролите", () => {
  it("одитният запис липсва първия път, но се появява след ~1 s → без снимка", async () => {
    vi.useFakeTimers();
    fetchRemovalCause.mockResolvedValueOnce(null).mockResolvedValueOnce({ kind: "kick", executorId: "m", executorTag: "m", reason: null });
    const p = memberRemove.execute(member());
    await vi.advanceTimersByTimeAsync(1500);
    await p;
    expect(fetchRemovalCause.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(snapshotPosts()).toHaveLength(0);
  });
  it("одитът мълчи, но човекът е в списъка с банове → без снимка", async () => {
    vi.useFakeTimers();
    const m = member({ bans: { user: { id: USER } } });
    const p = memberRemove.execute(m);
    await vi.advanceTimersByTimeAsync(1500);
    await p;
    expect(m.guild.bans.fetch).toHaveBeenCalledWith(USER);
    expect(snapshotPosts()).toHaveLength(0);
  });
  it("доброволно напускане (няма запис, няма бан) → снимката се записва както преди", async () => {
    vi.useFakeTimers();
    const p = memberRemove.execute(member());
    await vi.advanceTimersByTimeAsync(1500);
    await p;
    expect(snapshotPosts()).toHaveLength(1);
    expect(snapshotPosts()[0][1]).toEqual({ roleIds: ["r1"] });
  });
  it("човек без роли за пазене не плаща повторна проверка", async () => {
    const m = member({ roles: [] });
    await memberRemove.execute(m);
    expect(fetchRemovalCause).toHaveBeenCalledTimes(1);
    expect(m.guild.bans.fetch).not.toHaveBeenCalled();
  });
});

describe("В5 — частичен член", () => {
  it("без снимка на роли (празна снимка би изтрила истинската), но тикетът се затваря и логът работи", async () => {
    apiGet.mockResolvedValue({ data: [{ id: "t1", channelId: "c1", panel: { autoCloseOnLeave: true } }] });
    await memberRemove.execute(member({ partial: true }));
    expect(snapshotPosts()).toHaveLength(0);
    expect(closeTicket).toHaveBeenCalledTimes(1);
    expect(logServerEvent).toHaveBeenCalledTimes(1);
    expect(logServerEvent.mock.calls[0][2]).toMatchObject({ action: "member_leave", targetId: USER, targetTag: null });
  });
});

describe("З9 — изтрито съобщение с роли по реакция", () => {
  it("ботско съобщение → маркира се като непубликувано (преди ранния изход за ботове)", async () => {
    await messageDelete.execute({ id: "m1", guild: { id: GUILD }, author: { bot: true }, client: {} });
    expect(apiPost).toHaveBeenCalledWith("/bot/reaction-roles/message/m1/deleted", { serverId: GUILD });
  });
  it("масово изтриване: само ботски/неизвестни автори, по едно извикване", async () => {
    const msgs = new Map([
      ["b1", { id: "b1", author: { bot: true } }],
      ["h1", { id: "h1", author: { bot: false } }],
      ["p1", { id: "p1", partial: true, author: null }],
    ]);
    await messageDeleteBulk.execute(msgs, { id: "c", guild: { id: GUILD }, client: {} });
    const ids = apiPost.mock.calls.map((c) => c[0]).filter((u) => u.includes("/reaction-roles/message/"));
    expect(ids.sort()).toEqual(["/bot/reaction-roles/message/b1/deleted", "/bot/reaction-roles/message/p1/deleted"]);
  });
  it("срив на бекенда не чупи handler-а", async () => {
    apiPost.mockRejectedValue(new Error("down"));
    await expect(messageDelete.execute({ id: "m1", guild: { id: GUILD }, author: { bot: true }, client: {} })).resolves.toBeUndefined();
  });
});

describe("В5 — затопляне на кеша на членовете", () => {
  const mkGuild = (id) => ({ id, members: { fetch: vi.fn(async () => new Map()) } });
  const mkClient = (guilds) => ({ guilds: { cache: new Map(guilds.map((g) => [g.id, g])) } });

  it("само сървъри със запазване на роли; последователно; без повторно теглене", async () => {
    const { createMemberCacheWarmer } = await import("../utils/memberCacheWarm.js");
    const g1 = mkGuild("1".repeat(18)), g2 = mkGuild("2".repeat(18));
    const order = [];
    g1.members.fetch.mockImplementation(async () => { order.push("g1"); return new Map(); });
    const w = createMemberCacheWarmer({ listEnabledIds: async () => [g1.id], pauseMs: 0 });
    const client = mkClient([g1, g2]);
    await w.warmAll(client);
    await w.warmAll(client);
    expect(g1.members.fetch).toHaveBeenCalledTimes(1);
    expect(g1.members.fetch).toHaveBeenCalledWith();
    expect(g2.members.fetch).not.toHaveBeenCalled();
  });
  it("настройката се включи по-късно → следващият обход затопля и него", async () => {
    const { createMemberCacheWarmer } = await import("../utils/memberCacheWarm.js");
    const g1 = mkGuild("1".repeat(18)), g2 = mkGuild("2".repeat(18));
    let enabled = [g1.id];
    const w = createMemberCacheWarmer({ listEnabledIds: async () => enabled, pauseMs: 0 });
    const client = mkClient([g1, g2]);
    await w.warmAll(client);
    enabled = [g1.id, g2.id];
    await w.warmAll(client);
    expect(g2.members.fetch).toHaveBeenCalledTimes(1);
    expect(g1.members.fetch).toHaveBeenCalledTimes(1);
  });
  it("guildCreate: затопля само ако сървърът е със запазване на роли", async () => {
    const { createMemberCacheWarmer } = await import("../utils/memberCacheWarm.js");
    const on = mkGuild("1".repeat(18)), off = mkGuild("2".repeat(18));
    const w = createMemberCacheWarmer({ listEnabledIds: async () => [on.id], isEnabled: async (id) => id === on.id, pauseMs: 0 });
    await w.warmGuild(on); await w.warmGuild(off);
    expect(on.members.fetch).toHaveBeenCalledTimes(1);
    expect(off.members.fetch).not.toHaveBeenCalled();
  });
  it("срив на Discord (timeout) не хвърля и се опитва пак при следващия обход", async () => {
    const { createMemberCacheWarmer } = await import("../utils/memberCacheWarm.js");
    const g1 = mkGuild("1".repeat(18));
    g1.members.fetch.mockRejectedValueOnce(new Error("GuildMembersTimeout")).mockResolvedValue(new Map());
    const w = createMemberCacheWarmer({ listEnabledIds: async () => [g1.id], pauseMs: 0 });
    const c = mkClient([g1]);
    await w.warmAll(c); await w.warmAll(c);
    expect(g1.members.fetch).toHaveBeenCalledTimes(2);
  });
});
