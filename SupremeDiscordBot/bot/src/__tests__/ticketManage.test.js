// bot/src/__tests__/ticketManage.test.js
// Действия с тикет, поискани от таблото (паритет с командите, 28.11.2026):
// приоритет (обява в канала), преименуване, добави/махни човек, премести в панел, търсене на член.
// Същото поведение като /ticket priority|add|remove, /rename и /escalate.
import { describe, it, expect, vi } from "vitest";

vi.mock("../i18n/index.js", () => ({ t: (k, _l, v) => `${k}${v ? JSON.stringify(v) : ""}`, resolveLangForGuild: async () => "en" }));
const { manageTicket, searchMembers } = await import("../utils/ticketManage.js");

const textChannel = () => ({
  id: "900000000000000001",
  isThread: () => false,
  send: vi.fn(async () => ({})),
  setName: vi.fn(async () => ({})),
  setParent: vi.fn(async () => ({})),
  parent: { id: "c1" },
  permissionOverwrites: { create: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) },
  members: { add: vi.fn(), remove: vi.fn() },
  client: {},
});
const threadChannel = () => ({ ...textChannel(), isThread: () => true, members: { add: vi.fn(async () => ({})), remove: vi.fn(async () => ({})) } });
const MEMBER = { id: "444444444444444444", user: { id: "444444444444444444" } };
const guild = {
  id: "333333333333333333",
  roles: { cache: new Map([["555555555555555555", { id: "555555555555555555" }]]) },
  members: { fetch: vi.fn(async (id) => { if (id === MEMBER.id) return MEMBER; throw Object.assign(new Error("Unknown Member"), { code: 10007 }); }) },
};

describe("manageTicket", () => {
  it("приоритет → обява в канала, без да се споменава никой", async () => {
    const ch = textChannel();
    const r = await manageTicket({ guild, channel: ch, action: "priority", priority: "URGENT" });
    expect(r.ok).toBe(true);
    const msg = ch.send.mock.calls[0][0];
    expect(JSON.stringify(msg.embeds[0])).toContain("URGENT");
    expect(msg.allowedMentions).toEqual({ parse: [] });
  });
  it("преименуване → setName с причина", async () => {
    const ch = textChannel();
    await manageTicket({ guild, channel: ch, action: "rename", name: "vip-support" });
    expect(ch.setName).toHaveBeenCalledWith("vip-support", expect.stringMatching(/dashboard/i));
  });
  it("добави в канал → право да вижда и пише (като /ticket add)", async () => {
    const ch = textChannel();
    await manageTicket({ guild, channel: ch, action: "add", userId: "444444444444444444" });
    expect(ch.permissionOverwrites.create).toHaveBeenCalledWith(MEMBER, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
  });
  it("махни от канал → маха правото", async () => {
    const ch = textChannel();
    await manageTicket({ guild, channel: ch, action: "remove", userId: "444444444444444444" });
    expect(ch.permissionOverwrites.delete).toHaveBeenCalledWith(MEMBER);
  });
  it("ревю: ID на роля или на @everyone НЕ минава като човек (командата приема само потребител)", async () => {
    for (const userId of [guild.id, "555555555555555555"]) {
      for (const action of ["add", "remove"]) {
        const ch = textChannel();
        const r = await manageTicket({ guild, channel: ch, action, userId });
        expect(r).toMatchObject({ ok: false, code: "NOT_A_MEMBER" });
        expect(ch.permissionOverwrites.create).not.toHaveBeenCalled();
        expect(ch.permissionOverwrites.delete).not.toHaveBeenCalled();
      }
    }
  });
  it("ревю: човек, който не е в сървъра → не се добавя", async () => {
    const ch = textChannel();
    const r = await manageTicket({ guild, channel: ch, action: "add", userId: "666666666666666666" });
    expect(r).toMatchObject({ ok: false, code: "NOT_A_MEMBER" });
  });
  it("ревю: напуснал човек — махат се само неговите лични права в канала", async () => {
    const ch = textChannel();
    const ow = { id: "666666666666666666", type: 1, delete: vi.fn(async () => ({})) };
    ch.permissionOverwrites.cache = new Map([[ow.id, ow]]);
    const r = await manageTicket({ guild, channel: ch, action: "remove", userId: "666666666666666666" });
    expect(r.ok).toBe(true);
    expect(ow.delete).toHaveBeenCalled();
  });
  it("ревю: преименуване, задържано от лимита на Discord → „на опашка“, не грешка", async () => {
    const ch = textChannel();
    ch.setName = vi.fn(() => new Promise(() => {}));
    const r = await manageTicket({ guild, channel: ch, action: "rename", name: "vip", renameWaitMs: 5 });
    expect(r).toEqual({ ok: true, queued: true });
  });
  it("в нишка → членство, не права", async () => {
    const ch = threadChannel();
    await manageTicket({ guild, channel: ch, action: "add", userId: "444444444444444444" });
    expect(ch.members.add).toHaveBeenCalledWith("444444444444444444");
    expect(ch.permissionOverwrites.create).not.toHaveBeenCalled();
  });
  it("премести → категорията и ролите на новия панел (moveTicketToPanel)", async () => {
    const ch = textChannel();
    const r = await manageTicket({
      guild, channel: ch, action: "move",
      currentPanel: { supportRoleIds: ["r1"], categoryOpenId: "c1" },
      targetPanel: { supportRoleIds: ["r2"], categoryOpenId: "c2" },
    });
    expect(r.ok).toBe(true);
    expect(ch.setParent).toHaveBeenCalledWith("c2", { lockPermissions: false });
    expect(ch.permissionOverwrites.delete).toHaveBeenCalledWith("r1");
    expect(ch.permissionOverwrites.create).toHaveBeenCalledWith("r2", expect.objectContaining({ ViewChannel: true }));
  });
  it("непознато действие → грешка, нищо не се пипа", async () => {
    const ch = textChannel();
    await expect(manageTicket({ guild, channel: ch, action: "delete" })).rejects.toThrow();
    expect(ch.send).not.toHaveBeenCalled();
  });
});

describe("searchMembers", () => {
  it("търси в сървъра и връща само ID и имена", async () => {
    const g = { members: { search: vi.fn(async () => new Map([["1", { id: "444444444444444444", displayName: "Иван", user: { username: "ivan", bot: false, email: "x" } }]])) } };
    const out = await searchMembers(g, "iva");
    expect(g.members.search).toHaveBeenCalledWith({ query: "iva", limit: 10 });
    expect(out).toEqual([{ id: "444444444444444444", name: "Иван", username: "ivan" }]);
  });
});
