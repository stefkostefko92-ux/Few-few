// bot/src/__tests__/backupJob.test.js
// Резервни копия — задачата в бота около двигателя (SupremeDiscordBot/docs/BACKUP_SPEC.md):
//   Б11 без Administrator в момента на старта → FAILED с причина, нищо не се създава
//   Б15 един и същ restore не тече два пъти; докладът се повтаря при кратък срив на backend-а
//   Б14 краят се докладва като DONE; спряното от таблото не се докладва като DONE
import { describe, it, expect, vi, beforeEach } from "vitest";

const { runRestoreJob, _resetRunning } = await import("../utils/backupRestoreJob.js");
const { preflightGuild } = await import("../utils/backupRestoreJob.js");

const T = "444444444444444444";
const RID = "crestore000000000000000001";
const snapshot = {
  v: 1, guild: { id: "333333333333333333", name: "С", ownerId: null }, capturedAt: "2026-11-28T10:00:00.000Z",
  everyone: { permissions: "0" },
  roles: [{ id: "500000000000000001", name: "Админ", color: 0, hoist: false, mentionable: false, permissions: "0", position: 1 }],
  categories: [], channels: [],
};
function guild({ admin = true } = {}) {
  let n = 700000000000000000n;
  const g = {
    id: T, maximumBitrate: 96000, features: [],
    members: { me: { permissions: { has: () => admin } } },
    roles: { cache: new Map([[T, { id: T }]]), everyone: { setPermissions: vi.fn(async () => ({})) },
      create: vi.fn(async (o) => { const r = { id: String(n++), name: o.name }; g.roles.cache.set(r.id, r); return r; }) },
    channels: { cache: new Map(), create: vi.fn(), setPositions: vi.fn() },
  };
  return g;
}
function apiFake({ getData, postImpl } = {}) {
  return {
    get: vi.fn(async () => ({ data: getData ?? { restore: { id: RID, mode: "NEW", sourceServerId: "333333333333333333", targetServerId: T, idMap: {} }, snapshot } })),
    post: vi.fn(postImpl || (async () => ({ data: { ok: true, stop: false } }))),
  };
}
const finals = (api) => api.post.mock.calls.map(([, body]) => body).filter((b) => b?.status);

beforeEach(() => { _resetRunning(); });

describe("runRestoreJob", () => {
  it("Б11: без Administrator → FAILED с причина, нищо не се създава", async () => {
    const g = guild({ admin: false });
    const api = apiFake();
    await runRestoreJob(RID, { api, resolveGuild: async () => g, retryDelayMs: 0 });
    expect(g.roles.create).not.toHaveBeenCalled();
    expect(finals(api)).toEqual([expect.objectContaining({ status: "FAILED", warnings: [expect.objectContaining({ code: "BOT_NOT_ADMIN" })] })]);
  });
  it("ботът не е в сървъра → FAILED", async () => {
    const api = apiFake();
    await runRestoreJob(RID, { api, resolveGuild: async () => null, retryDelayMs: 0 });
    expect(finals(api)[0]).toMatchObject({ status: "FAILED", warnings: [{ code: "BOT_NOT_IN_SERVER" }] });
  });
  it("Б14: краят → DONE с броячите", async () => {
    const g = guild();
    const api = apiFake();
    await runRestoreJob(RID, { api, resolveGuild: async () => g, retryDelayMs: 0 });
    expect(api.get).toHaveBeenCalledWith(`/bot/backup-restores/${RID}`);
    expect(finals(api)).toEqual([expect.objectContaining({ status: "DONE", counts: expect.objectContaining({ rolesCreated: 1 }) })]);
  });
  it("Б14: спряно от таблото → не се докладва DONE", async () => {
    const g = guild();
    const api = apiFake({ postImpl: async () => ({ data: { ok: true, stop: true } }) });
    await runRestoreJob(RID, { api, resolveGuild: async () => g, retryDelayMs: 0 });
    expect(finals(api)).toEqual([]);
  });
  it("Б15: кратък срив на backend-а при доклад → повтаря, картата не се губи", async () => {
    const g = guild();
    let fails = 2;
    const api = apiFake({ postImpl: async () => { if (fails-- > 0) throw new Error("ECONNRESET"); return { data: { ok: true, stop: false } }; } });
    await runRestoreJob(RID, { api, resolveGuild: async () => g, retryDelayMs: 0 });
    const withMap = api.post.mock.calls.map(([, b]) => b).filter((b) => b?.idMap?.roles);
    expect(withMap.length).toBeGreaterThanOrEqual(3); // два неуспешни опита + успешният, с една и съща карта
    expect(new Set(withMap.map((b) => JSON.stringify(b.idMap))).size).toBe(1);
    expect(finals(api)[0]).toMatchObject({ status: "DONE" });
  });
  it("Б15: същата задача не тече два пъти едновременно", async () => {
    const g = guild();
    let release;
    const gate = new Promise((r) => { release = r; });
    const api = apiFake();
    api.get = vi.fn(async () => { await gate; return { data: { restore: { id: RID, mode: "NEW", targetServerId: T, idMap: {} }, snapshot } }; });
    const first = runRestoreJob(RID, { api, resolveGuild: async () => g, retryDelayMs: 0 });
    const second = await runRestoreJob(RID, { api, resolveGuild: async () => g, retryDelayMs: 0 });
    expect(second).toEqual({ ok: true, running: true });
    release();
    await first;
    expect(api.get).toHaveBeenCalledTimes(1);
  });
  it("задача, която backend-ът не дава (спряна/приключила) → тихо", async () => {
    const api = apiFake();
    api.get = vi.fn(async () => { throw Object.assign(new Error("409"), { response: { status: 409 } }); });
    const out = await runRestoreJob(RID, { api, resolveGuild: async () => guild(), retryDelayMs: 0 });
    expect(out).toMatchObject({ ok: false });
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe("preflightGuild (Б11)", () => {
  it("връща само кои от подадените ID-та ги има, правата и таваните — нищо друго от сървъра", () => {
    const g = guild();
    g.roles.cache.set("500000000000000001", { id: "500000000000000001" });
    g.channels.cache.set("500000000000000010", { id: "500000000000000010", isThread: () => false });
    g.channels.cache.set("500000000000000011", { id: "500000000000000011", isThread: () => true });
    g.features = ["COMMUNITY"];
    const out = preflightGuild(g, { roleIds: ["500000000000000001", "500000000000000002"], channelIds: ["500000000000000010", "500000000000000099"] });
    expect(out).toEqual({
      ok: true, inGuild: true, admin: true, community: true,
      roleCount: 2, channelCount: 1,
      existingRoleIds: ["500000000000000001"], existingChannelIds: ["500000000000000010"],
    });
  });
});

describe("ревю: свеж кеш преди старта", () => {
  it("преди проверката на правата и възстановяването чете бота, ролите и каналите наново", async () => {
    const g = guild();
    const order = [];
    g.members.fetchMe = vi.fn(async () => { order.push("me"); return g.members.me; });
    g.roles.fetch = vi.fn(async () => { order.push("roles"); return g.roles.cache; });
    g.channels.fetch = vi.fn(async () => { order.push("channels"); return g.channels.cache; });
    const origCreate = g.roles.create;
    g.roles.create = vi.fn(async (o) => { order.push("create"); return origCreate(o); });
    await runRestoreJob(RID, { api: apiFake(), resolveGuild: async () => g, retryDelayMs: 0 });
    expect(order.slice(0, 3).sort()).toEqual(["channels", "me", "roles"]);
    expect(order.indexOf("create")).toBeGreaterThan(2);
  });
});

describe("ревю на Кодаджията: докладите един след друг", () => {
  it("пулсът и докладът за стъпка не се застъпват (никога два доклада едновременно)", async () => {
    const g = guild();
    let inFlight = 0, maxInFlight = 0;
    const api = apiFake({ postImpl: async () => { inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight -= 1; return { data: { ok: true, stop: false } }; } });
    // по-бърз пулс, за да се застъпи с докладите
    await runRestoreJob(RID, { api, resolveGuild: async () => g, retryDelayMs: 0, heartbeatMs: 1 });
    expect(maxInFlight).toBe(1);
  });
});

