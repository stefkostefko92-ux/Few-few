// bot/src/__tests__/backupRestore.test.js
// Резервни копия — частта в Discord (docs/BACKUP_SPEC.md):
//   Б1/Б3 снимката: каквото пише в спецификацията, без лични права по канал и без нишки
//   Б12  нищо не се трие и нищо съществуващо не се променя; в друг сървър — всичко + @everyone
//   Б13  ролите от най-високата надолу; правата сочат новите роли; позициите накрая
//   Б15  продължава по картата стар → нов ID, без да създава вече създаденото
//   Б16  непознат тип → текстов/гласов с бележка; битрейт до максимума; грешка не спира всичко
//   Б14  спиране от таблото
import { describe, it, expect, vi } from "vitest";

const { snapshotGuild } = await import("../utils/backupCapture.js");
const { runRestore } = await import("../utils/backupRestore.js");

const G = "333333333333333333"; // източник
const T = "444444444444444444"; // цел (нов сървър)
const ID = (n) => String(500000000000000000n + BigInt(n));
const bits = (n) => ({ bitfield: BigInt(n) });
const coll = (items) => new Map(items.map((x) => [x.id, x]));

// ─── Снимката ─────────────────────────────────────────────────────────────────
function sourceGuild() {
  const roles = coll([
    { id: G, name: "@everyone", color: 0, hoist: false, mentionable: false, permissions: bits(104324673), rawPosition: 0, managed: false },
    { id: ID(1), name: "Админ", color: 16711680, hoist: true, mentionable: false, permissions: bits(8), rawPosition: 4, managed: false },
    { id: ID(2), name: "Supreme Bot", color: 0, hoist: false, mentionable: false, permissions: bits(8), rawPosition: 5, managed: true },
    { id: ID(3), name: "Член", color: 0, hoist: false, mentionable: true, permissions: bits(0), rawPosition: 1, managed: false },
  ]);
  const ow = (id, type, allow, deny) => ({ id, type, allow: bits(allow), deny: bits(deny) });
  const channels = coll([
    { id: ID(10), type: 4, name: "Общи", parentId: null, rawPosition: 0, isThread: () => false,
      permissionOverwrites: { cache: coll([ow(G, 0, 0, 1024), ow(ID(3), 0, 1024, 0), ow("999999999999999999", 1, 1024, 0)]) } },
    { id: ID(20), type: 0, name: "общ-чат", parentId: ID(10), rawPosition: 0, topic: "Здрасти", nsfw: false, rateLimitPerUser: 5, isThread: () => false,
      defaultAutoArchiveDuration: 1440, permissionOverwrites: { cache: coll([]) } },
    { id: ID(21), type: 15, name: "форум", parentId: ID(10), rawPosition: 1, topic: null, nsfw: false, isThread: () => false,
      availableTags: [{ id: "t1", name: "Бъг", moderated: true, emoji: { id: "123456789012345678", name: "custom" } }, { id: "t2", name: "Идея", moderated: false, emoji: { id: null, name: "💡" } }],
      defaultReactionEmoji: { id: "123456789012345678", name: "x" }, defaultSortOrder: 0, defaultForumLayout: 1, flags: bits(16),
      permissionOverwrites: { cache: coll([]) } },
    { id: ID(22), type: 2, name: "Гласов", parentId: null, rawPosition: 2, bitrate: 128000, userLimit: 10, rtcRegion: null, videoQualityMode: 1, isThread: () => false,
      permissionOverwrites: { cache: coll([]) } },
    { id: ID(23), type: 11, name: "нишка", parentId: ID(20), rawPosition: 0, isThread: () => true, permissionOverwrites: { cache: coll([]) } },
  ]);
  return { id: G, name: "Източник", ownerId: "111111111111111111", roles, channels };
}

describe("Б1/Б3 снимката", () => {
  const s = snapshotGuild(sourceGuild(), { now: new Date("2026-11-28T10:00:00Z") });
  it("версия, сървър и правата на @everyone", () => {
    expect(s.v).toBe(1);
    expect(s.guild).toEqual({ id: G, name: "Източник", ownerId: "111111111111111111" });
    expect(s.everyone).toEqual({ permissions: "104324673" });
  });
  it("ролите: без @everyone и без ролите на интеграции, от най-високата надолу", () => {
    expect(s.roles.map((r) => r.name)).toEqual(["Админ", "Член"]);
    expect(s.roles[0]).toEqual({ id: ID(1), name: "Админ", color: 16711680, hoist: true, mentionable: false, permissions: "8", position: 4 });
  });
  it("категориите отделно; нишките не влизат", () => {
    expect(s.categories.map((c) => c.name)).toEqual(["Общи"]);
    expect(s.channels.map((c) => c.name)).toEqual(["общ-чат", "форум", "Гласов"]);
  });
  it("правата по канал: роли и @everyone; член — никога", () => {
    expect(s.categories[0].overwrites).toEqual([
      { id: G, kind: "everyone", allow: "0", deny: "1024" },
      { id: ID(3), kind: "role", allow: "1024", deny: "0" },
    ]);
    expect(JSON.stringify(s)).not.toContain("999999999999999999");
  });
  it("форумът: етикетите без чужди емоджита, без реакция с чуждо емоджи", () => {
    const f = s.channels.find((c) => c.type === 15);
    expect(f.availableTags).toEqual([{ name: "Бъг", moderated: true, emojiName: null }, { name: "Идея", moderated: false, emojiName: "💡" }]);
    expect(f.defaultReactionEmoji).toBeNull();
    expect(f.flags).toBe(16);
  });
  it("гласов: битрейт, лимит, качество", () => {
    expect(s.channels.find((c) => c.type === 2)).toMatchObject({ bitrate: 128000, userLimit: 10, videoQualityMode: 1, parentId: null, position: 2 });
  });
});

// ─── Възстановяването ─────────────────────────────────────────────────────────
const snapshot = () => snapshotGuild(sourceGuild(), { now: new Date("2026-11-28T10:00:00Z") });
let seq = 0;
function targetGuild({ id = T, roles = [], channels = [], maxBitrate = 96000, failChannel = null, failRole = null } = {}) {
  seq = 700000000000000000n;
  const next = () => String(seq++);
  const g = {
    id, maximumBitrate: maxBitrate, features: [],
    roles: {
      cache: coll([{ id, name: "@everyone" }, ...roles]),
      everyone: { id, setPermissions: vi.fn(async () => ({})) },
      create: vi.fn(async (o) => {
        if (failRole?.(o)) throw failRole(o);
        const r = { id: next(), name: o.name, edit: vi.fn(), delete: vi.fn(), setPosition: vi.fn() };
        g.roles.cache.set(r.id, r);
        return r;
      }),
    },
    channels: {
      cache: coll(channels),
      create: vi.fn(async (o) => {
        const err = failChannel?.(o);
        if (err) throw err;
        const c = { id: next(), name: o.name, type: o.type, edit: vi.fn(), delete: vi.fn() };
        g.channels.cache.set(c.id, c);
        return c;
      }),
      setPositions: vi.fn(async () => ({})),
    },
  };
  return g;
}
const reporter = (stopAfter = Infinity) => {
  const calls = [];
  const fn = vi.fn(async (delta) => { calls.push(delta); return { stop: calls.length >= stopAfter }; });
  fn.calls = calls;
  return fn;
};
const mapOf = (report, kind) => Object.assign({}, ...report.calls.map((c) => c.idMap?.[kind] || {}));

describe("Б12/Б13 в нов сървър", () => {
  it("създава всичко, ролите от най-високата надолу, @everyone получава правата си", async () => {
    const g = targetGuild();
    const report = reporter();
    const out = await runRestore({ guild: g, snapshot: snapshot(), mode: "NEW", idMap: {}, report });
    expect(out.status).toBe("DONE");
    expect(g.roles.create.mock.calls.map(([o]) => o.name)).toEqual(["Админ", "Член"]);
    expect(g.roles.create.mock.calls[0][0]).toMatchObject({ permissions: 8n, hoist: true, mentionable: false });
    expect(g.roles.everyone.setPermissions).toHaveBeenCalledWith(104324673n, expect.any(String));
    expect(out.counts).toMatchObject({ rolesCreated: 2, channelsCreated: 4, failed: 0 });
  });
  it("категориите първо; каналите под новата категория; правата сочат новите роли и новия @everyone", async () => {
    const g = targetGuild();
    const report = reporter();
    await runRestore({ guild: g, snapshot: snapshot(), mode: "NEW", idMap: {}, report });
    const roles = mapOf(report, "roles"), chans = mapOf(report, "channels");
    const [cat, ...rest] = g.channels.create.mock.calls.map(([o]) => o);
    expect(cat).toMatchObject({ name: "Общи", type: 4 });
    expect(cat.permissionOverwrites).toEqual([
      { id: T, type: 0, allow: 0n, deny: 1024n },
      { id: roles[ID(3)], type: 0, allow: 1024n, deny: 0n },
    ]);
    expect(rest.find((o) => o.name === "общ-чат")).toMatchObject({ parent: chans[ID(10)], topic: "Здрасти", rateLimitPerUser: 5 });
  });
  it("нищо не трие и нищо съществуващо не пипа; позициите се подреждат накрая", async () => {
    const existing = { id: "600000000000000001", name: "general", type: 0, edit: vi.fn(), delete: vi.fn() };
    const g = targetGuild({ channels: [existing] });
    await runRestore({ guild: g, snapshot: snapshot(), mode: "NEW", idMap: {}, report: reporter() });
    expect(existing.delete).not.toHaveBeenCalled();
    expect(existing.edit).not.toHaveBeenCalled();
    const pos = g.channels.setPositions.mock.calls[0][0];
    expect(pos.map((p) => p.position)).toEqual([0, 0, 1, 2]);
    expect(pos.every((p) => p.parent === undefined && p.lockPermissions === undefined)).toBe(true);
  });
  it("всяка заявка носи причина за одита на Discord", async () => {
    const g = targetGuild();
    await runRestore({ guild: g, snapshot: snapshot(), mode: "NEW", idMap: {}, report: reporter() });
    for (const [o] of [...g.roles.create.mock.calls, ...g.channels.create.mock.calls]) expect(o.reason).toMatch(/Supreme Bot/);
  });
});

describe("Б12 в същия сървър — само липсващото", () => {
  it("съществуващите роли и канали не се създават и не се пипат; @everyone не се пипа", async () => {
    const g = targetGuild({ id: G, roles: [{ id: ID(1), name: "Админ" }], channels: [{ id: ID(10), name: "Общи", type: 4 }, { id: ID(20), name: "общ-чат", type: 0 }] });
    const report = reporter();
    const out = await runRestore({ guild: g, snapshot: snapshot(), mode: "SAME", idMap: {}, report });
    expect(g.roles.create.mock.calls.map(([o]) => o.name)).toEqual(["Член"]);
    expect(g.channels.create.mock.calls.map(([o]) => o.name)).toEqual(["форум", "Гласов"]);
    expect(g.roles.everyone.setPermissions).not.toHaveBeenCalled();
    // форумът е под съществуващата категория — със стария ѝ ID
    expect(g.channels.create.mock.calls[0][0].parent).toBe(ID(10));
    expect(out.counts).toMatchObject({ rolesExisting: 1, channelsExisting: 2, rolesCreated: 1, channelsCreated: 2 });
  });
});

describe("Б15 продължава по картата", () => {
  it("вече създаденото не се създава пак", async () => {
    const g = targetGuild({ roles: [{ id: "700000000000000999", name: "Админ" }], channels: [{ id: "700000000000000998", name: "Общи", type: 4 }] });
    const idMap = { roles: { [ID(1)]: "700000000000000999" }, channels: { [ID(10)]: "700000000000000998" } };
    await runRestore({ guild: g, snapshot: snapshot(), mode: "NEW", idMap, report: reporter() });
    expect(g.roles.create.mock.calls.map(([o]) => o.name)).toEqual(["Член"]);
    expect(g.channels.create.mock.calls.map(([o]) => o.name)).not.toContain("Общи");
    expect(g.channels.create.mock.calls.find(([o]) => o.name === "общ-чат")[0].parent).toBe("700000000000000998");
  });
  it("картата се докладва след всяко създадено нещо", async () => {
    const g = targetGuild();
    const report = reporter();
    await runRestore({ guild: g, snapshot: snapshot(), mode: "NEW", idMap: {}, report });
    const withMap = report.calls.filter((c) => c.idMap && (Object.keys(c.idMap.roles || {}).length || Object.keys(c.idMap.channels || {}).length));
    expect(withMap.length).toBe(2 + 4);
  });
});

describe("Б16 трудните случаи", () => {
  it("тип, който сървърът не приема → текстов, с бележка", async () => {
    const s = snapshot();
    s.channels.push({ id: ID(30), type: 5, name: "новини", parentId: null, position: 3, topic: null, nsfw: false, overwrites: [] });
    const g = targetGuild({ failChannel: (o) => (o.type === 5 ? Object.assign(new Error("Cannot execute action on this channel type"), { code: 50024 }) : null) });
    const report = reporter();
    const out = await runRestore({ guild: g, snapshot: s, mode: "NEW", idMap: {}, report });
    const news = g.channels.create.mock.calls.filter(([o]) => o.name === "новини").map(([o]) => o.type);
    expect(news).toEqual([5, 0]);
    expect(report.calls.flatMap((c) => c.warnings || [])).toContainEqual(expect.objectContaining({ code: "TYPE_FALLBACK", name: "новини" }));
    expect(out.status).toBe("DONE");
  });
  it("битрейтът се сваля до максимума на сървъра", async () => {
    const g = targetGuild({ maxBitrate: 96000 });
    await runRestore({ guild: g, snapshot: snapshot(), mode: "NEW", idMap: {}, report: reporter() });
    expect(g.channels.create.mock.calls.find(([o]) => o.name === "Гласов")[0].bitrate).toBe(96000);
  });
  it("грешка в един канал не спира останалите", async () => {
    const g = targetGuild({ failChannel: (o) => (o.name === "форум" ? Object.assign(new Error("Missing Permissions"), { code: 50013 }) : null) });
    const report = reporter();
    const out = await runRestore({ guild: g, snapshot: snapshot(), mode: "NEW", idMap: {}, report });
    expect(g.channels.create.mock.calls.map(([o]) => o.name)).toContain("Гласов");
    expect(out.counts.failed).toBe(1);
    expect(report.calls.flatMap((c) => c.warnings || [])).toContainEqual(expect.objectContaining({ kind: "channel", name: "форум", code: "50013" }));
  });
  it("таванът на ролите (30005) спира само ролите", async () => {
    const g = targetGuild({ failRole: () => Object.assign(new Error("Maximum number of guild roles reached (250)"), { code: 30005 }) });
    const out = await runRestore({ guild: g, snapshot: snapshot(), mode: "NEW", idMap: {}, report: reporter() });
    expect(g.roles.create).toHaveBeenCalledTimes(1);
    expect(g.channels.create).toHaveBeenCalled();
    expect(out.status).toBe("DONE");
  });
  it("право по канал към роля, която не можа да се създаде → пропуска се и се брои", async () => {
    const g = targetGuild({ failRole: (o) => (o.name === "Член" ? Object.assign(new Error("x"), { code: 50013 }) : null) });
    const out = await runRestore({ guild: g, snapshot: snapshot(), mode: "NEW", idMap: {}, report: reporter() });
    const cat = g.channels.create.mock.calls[0][0];
    expect(cat.permissionOverwrites).toEqual([{ id: T, type: 0, allow: 0n, deny: 1024n }]);
    expect(out.counts.overwritesSkipped).toBe(1);
  });
});

describe("Б14 спиране от таблото", () => {
  it("stop → спира веднага, статус CANCELLED", async () => {
    const g = targetGuild();
    const out = await runRestore({ guild: g, snapshot: snapshot(), mode: "NEW", idMap: {}, report: reporter(1) });
    expect(out.status).toBe("CANCELLED");
    expect(g.roles.create).toHaveBeenCalledTimes(1);
    expect(g.channels.create).not.toHaveBeenCalled();
  });
});
