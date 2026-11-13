// bot/src/__tests__/launchGuards.test.js
// Поток З (стръв, роли, дневник) — критерии З1–З7, З12, З14 от
// docs/LAUNCH_READINESS_SPEC.md. Всеки тест е писан срещу СТАРИЯ код (пада),
// после е минималната поправка.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PermissionsBitField, PermissionFlagsBits } from "discord.js";

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPut = vi.fn();
const apiPatch = vi.fn();
const apiDelete = vi.fn();
vi.mock("../utils/api.js", () => ({
  default: {
    get: (...a) => apiGet(...a), post: (...a) => apiPost(...a), put: (...a) => apiPut(...a),
    patch: (...a) => apiPatch(...a), delete: (...a) => apiDelete(...a),
  },
  getServer: async () => ({ language: "en" }),
  markTicketMessage: async () => {},
}));
vi.mock("../utils/game.js", () => ({ onVoiceForXp: () => Promise.resolve() }));

const rr = await import("../utils/reactionRoles.js");
const reactionAdd = (await import("../events/messageReactionAdd.js")).default;
const reactionRemove = (await import("../events/messageReactionRemove.js")).default;
const bait = await import("../utils/bait.js");
const baitCmd = (await import("../commands/bait.js")).default;
const channelDelete = (await import("../events/channelDelete.js")).default;
const memberAdd = (await import("../events/guildMemberAdd.js")).default;
const memberUpdate = (await import("../events/guildMemberUpdate.js")).default;
const voiceUpdate = (await import("../events/voiceStateUpdate.js")).default;
const evlog = await import("../utils/serverEventLog.js");
const permCheck = await import("../utils/permissionCheck.js");

const SID = "222222222222222222";
const TRAP = "444444444444444444";
const LOG = "555555555555555555";
const UID = "333333333333333333";
const BOT = "999999999999999999";

beforeEach(() => {
  vi.resetAllMocks();
  rr.clearRrmCache();
  bait.__test.cache.clear();
  bait.__test.handled.clear();
  evlog.eventLogConfigCache.clear();
  evlog.deadLogChannels?.clear?.();
  apiPost.mockResolvedValue({ data: { caughtCount: 5 } });
  apiPut.mockResolvedValue({ data: {} });
  apiPatch.mockResolvedValue({ data: {} });
  apiDelete.mockResolvedValue({ data: {} });
});

// ─── З4 + З5: роли с реакция ────────────────────────────────────────────────
const botMember = { roles: { highest: { position: 10 } } };
function fakeRole(id, { bits = 0n, position = 3 } = {}) {
  return { id, managed: false, permissions: new PermissionsBitField(bits), comparePositionTo: (o) => position - o.position };
}

function rrWorld({ pairs, exclusive = false, have = [], roles, addFails = false }) {
  const roleMap = new Map((roles || pairs.map((p) => fakeRole(p.roleId))).map((r) => [r.id, r]));
  const hasMap = new Map(have.map((r) => [r, {}]));
  const calls = [];
  const member = {
    roles: {
      cache: hasMap,
      add: vi.fn(async (id) => { calls.push(`add:${id}`); if (addFails) throw new Error("Missing Permissions"); }),
      remove: vi.fn(async (id) => { calls.push(`remove:${id}`); }),
    },
  };
  const guild = {
    members: { fetch: vi.fn(async () => member), me: botMember },
    roles: { cache: roleMap, fetch: vi.fn(async () => null) },
  };
  const reactionsCache = new Map();
  const message = { id: "700000000000000001", guildId: SID, guild, reactions: { cache: reactionsCache } };
  const mk = (emoji) => ({ partial: false, emoji, message, users: { remove: vi.fn(async () => {}) } });
  apiGet.mockResolvedValue({ data: { exclusive, pairs: pairs.map((p, i) => ({ id: `p${i}`, ...p })) } });
  return { member, guild, message, mk, reactionsCache, calls };
}

describe("З4 — реакциите и ролите", () => {
  it("опасна роля: ботът маха реакцията, а махането НЕ сваля ролята, която човекът има", async () => {
    const admin = fakeRole("r_admin", { bits: PermissionFlagsBits.Administrator });
    const w = rrWorld({ pairs: [{ emoji: "🎮", roleId: "r_admin" }], roles: [admin], have: ["r_admin"] });
    const reaction = w.mk({ id: null, name: "🎮" });
    await reactionAdd.execute(reaction, { id: UID, bot: false });
    expect(reaction.users.remove).toHaveBeenCalledWith(UID);
    // Discord връща махането като събитие messageReactionRemove:
    await reactionRemove.execute(reaction, { id: UID, bot: false });
    expect(w.member.roles.remove).not.toHaveBeenCalled();
  });

  it("обикновено махане на реакция върху безопасна роля пак сваля ролята", async () => {
    const w = rrWorld({ pairs: [{ emoji: "🎮", roleId: "r_ok" }], have: ["r_ok"] });
    await reactionRemove.execute(w.mk({ id: null, name: "🎮" }), { id: UID, bot: false });
    expect(w.member.roles.remove).toHaveBeenCalledWith("r_ok", expect.any(String));
  });

  it("„една роля“: новата се добавя ПРЕДИ старата да се махне", async () => {
    const w = rrWorld({
      exclusive: true, have: ["r_a"],
      pairs: [{ emoji: "🅰️", roleId: "r_a" }, { emoji: "🅱️", roleId: "r_b" }],
    });
    await reactionAdd.execute(w.mk({ id: null, name: "🅱️" }), { id: UID, bot: false });
    expect(w.calls).toEqual(["add:r_b", "remove:r_a"]);
  });

  it("„една роля“: ако добавянето пропадне, старата роля остава", async () => {
    const w = rrWorld({
      exclusive: true, have: ["r_a"], addFails: true,
      pairs: [{ emoji: "🅰️", roleId: "r_a" }, { emoji: "🅱️", roleId: "r_b" }],
    });
    await reactionAdd.execute(w.mk({ id: null, name: "🅱️" }), { id: UID, bot: false });
    expect(w.member.roles.remove).not.toHaveBeenCalled();
  });

  it("„една роля“: махнатите от бота реакции не свалят втори път и не пипат опасна роля", async () => {
    const admin = fakeRole("r_admin", { bits: PermissionFlagsBits.Administrator });
    const w = rrWorld({
      exclusive: true, have: ["r_admin"],
      pairs: [{ emoji: "🅰️", roleId: "r_admin" }, { emoji: "🅱️", roleId: "r_b" }],
      roles: [admin, fakeRole("r_b")],
    });
    await reactionAdd.execute(w.mk({ id: null, name: "🅱️" }), { id: UID, bot: false });
    expect(w.calls).toEqual(["add:r_b"]); // опасната роля не е докосната
  });
});

describe("З5 — собствено емоджи по id", () => {
  const ID = "123456789012345678";
  it("преименувано емоджи (същият id) пак дава ролята", async () => {
    const w = rrWorld({ pairs: [{ emoji: `pepe:${ID}`, roleId: "r_ok" }] });
    await reactionAdd.execute(w.mk({ id: ID, name: "pepe_renamed" }), { id: UID, bot: false });
    expect(w.member.roles.add).toHaveBeenCalledWith("r_ok", expect.any(String));
  });
  it("преименувано емоджи пак сваля ролята при махане", async () => {
    const w = rrWorld({ pairs: [{ emoji: `pepe:${ID}`, roleId: "r_ok" }], have: ["r_ok"] });
    await reactionRemove.execute(w.mk({ id: ID, name: "pepe_renamed" }), { id: UID, bot: false });
    expect(w.member.roles.remove).toHaveBeenCalledWith("r_ok", expect.any(String));
  });
  it("друго емоджи със същото име, но друг id, НЕ съвпада", async () => {
    const w = rrWorld({ pairs: [{ emoji: `pepe:${ID}`, roleId: "r_ok" }] });
    await reactionAdd.execute(w.mk({ id: "999999999999999999", name: "pepe" }), { id: UID, bot: false });
    expect(w.member.roles.add).not.toHaveBeenCalled();
  });
  it("unicode емоджи съвпада по знак; анимирано (a:name:id) по id", async () => {
    expect(rr.emojiMatches("🎮", { id: null, name: "🎮" })).toBe(true);
    expect(rr.emojiMatches("🎮", { id: null, name: "🎲" })).toBe(false);
    expect(rr.emojiMatches(`a:dance:${ID}`, { id: ID, name: "x" })).toBe(true);
    expect(rr.emojiMatches("🎮", { id: ID, name: "🎮" })).toBe(false);
  });
});

// ─── З1 + З2: стръв ─────────────────────────────────────────────────────────
function channelOf(id, over = {}) {
  return { id, guildId: SID, isTextBased: () => true, send: vi.fn(async () => ({ id: "800000000000000001" })), permissionsFor: () => ({ has: () => true }), ...over };
}

describe("З1 — изтрит канал-стръв", () => {
  it("channelDelete изключва стръвта в базата и пише в лог канала", async () => {
    const logCh = channelOf(LOG);
    const guild = { id: SID, channels: { cache: new Map([[LOG, logCh]]) } };
    apiGet.mockImplementation(async (url) => {
      if (url === `/bot/honeypot/${SID}`) return { data: { enabled: true, channelId: TRAP, logChannelId: LOG, action: "softban" } };
      return { data: null };
    });
    apiPost.mockRejectedValue(new Error("not a ticket"));
    await channelDelete.execute({ id: TRAP, name: "bait", type: 0, guild, client: {} });
    const put = apiPut.mock.calls.find((c) => c[0] === `/bot/honeypot/${SID}`);
    expect(put?.[1]).toMatchObject({ enabled: false });
    expect(logCh.send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logCh.send.mock.calls[0][0])).toContain(TRAP);
  });

  it("изтрит друг канал не пипа стръвта", async () => {
    const guild = { id: SID, channels: { cache: new Map() } };
    apiGet.mockResolvedValue({ data: { enabled: true, channelId: TRAP, logChannelId: LOG } });
    apiPost.mockRejectedValue(new Error("x"));
    await channelDelete.execute({ id: "100000000000000000", guild, client: {} });
    expect(apiPut).not.toHaveBeenCalled();
  });

  it("/bait status не казва „включена“, когато каналът го няма", async () => {
    apiGet.mockResolvedValue({ data: { enabled: true, channelId: TRAP, action: "softban", logChannelId: null, dmUser: true, caughtCount: 2 } });
    const editReply = vi.fn(async () => {});
    const interaction = {
      guildId: SID, locale: "en-US", user: { id: UID },
      guild: { channels: { cache: new Map() } },
      memberPermissions: { has: () => true },
      options: { getSubcommand: () => "status" },
      deferReply: vi.fn(async () => {}), editReply,
    };
    await baitCmd.execute(interaction);
    const text = editReply.mock.calls[0][0].content;
    expect(text).not.toMatch(/Bait:\*\* on/);
    expect(text).toMatch(/deleted|missing/i);
  });
});

describe("З2 — стръв без предупреждение не остава активна", () => {
  function setupWorld({ sendFails = false } = {}) {
    const trap = channelOf(TRAP, {
      send: vi.fn(async () => { if (sendFails) throw new Error("Missing Access"); return { id: "800000000000000002" }; }),
      messages: { fetch: vi.fn(async () => null), delete: vi.fn(async () => {}) },
    });
    const me = { permissions: { has: () => true }, roles: { highest: { position: 10 } } };
    const guild = { id: SID, channels: { cache: new Map([[TRAP, trap]]), create: vi.fn() }, members: { me } };
    apiGet.mockResolvedValue({ data: { enabled: true, channelId: TRAP, action: "softban", dmUser: true, caughtCount: 0, warningMessageId: null } });
    apiPut.mockResolvedValue({ data: { config: { action: "softban" }, previous: { enabled: false } } });
    const editReply = vi.fn(async () => {});
    const interaction = {
      guildId: SID, guild, locale: "en-US", client: { guilds: { cache: new Map([[SID, guild]]) } }, user: { id: UID },
      memberPermissions: { has: () => true },
      options: { getSubcommand: () => "setup", getChannel: (n) => (n === "channel" ? trap : null), getString: () => null, getBoolean: () => null },
      deferReply: vi.fn(async () => {}), editReply,
    };
    return { trap, interaction, editReply };
  }

  it("неуспешно публикуване → стръвта се изключва (последният запис е enabled:false)", async () => {
    const w = setupWorld({ sendFails: true });
    await baitCmd.execute(w.interaction);
    const bodies = apiPut.mock.calls.map((c) => c[1]);
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[bodies.length - 1]).toMatchObject({ enabled: false });
  });

  it("успешно публикуване не изключва стръвта", async () => {
    const w = setupWorld();
    await baitCmd.execute(w.interaction);
    expect(apiPut.mock.calls.length).toBeGreaterThan(0);
    expect(apiPut.mock.calls.every((c) => c[1].enabled !== false)).toBe(true);
    expect(w.trap.send).toHaveBeenCalledTimes(1);
  });

  it("изтрито предупреждение се публикува наново след следващо захапване", async () => {
    const trap = channelOf(TRAP, {
      messages: { fetch: vi.fn(async () => { throw Object.assign(new Error("Unknown Message"), { code: 10008 }); }), delete: vi.fn(async () => {}) },
    });
    const logCh = channelOf(LOG);
    const me = { permissions: { has: () => true }, roles: { highest: { position: 10 } } };
    const guild = { id: SID, name: "S", ownerId: BOT, channels: { cache: new Map([[TRAP, trap], [LOG, logCh]]) }, members: { me, ban: vi.fn(async () => {}), unban: vi.fn(async () => {}) } };
    trap.client = { guilds: { cache: new Map([[SID, guild]]) } };
    const cfg = { enabled: true, channelId: TRAP, action: "softban", logChannelId: LOG, dmUser: false, caughtCount: 1, warningMessageId: "800000000000000009" };
    apiGet.mockResolvedValue({ data: cfg });
    const user = { id: UID, tag: "x#0", bot: false, createdTimestamp: 1, send: vi.fn(async () => {}) };
    const message = {
      guildId: SID, channelId: TRAP, guild, author: user, channel: trap, client: { guilds: { cache: new Map([[SID, guild]]) } },
      member: { permissions: { any: () => false }, bannable: true, moderatable: true, timeout: vi.fn() },
      delete: vi.fn(async () => {}),
    };
    await bait.onBaitMessage(message);
    expect(trap.send).toHaveBeenCalledTimes(1);
  });
});

// ─── З3: автоматични роли след верификация ──────────────────────────────────
describe("З3 — автоматичните роли не връщат това, което верификацията маха", () => {
  const G = "222222222222222222";
  function joinWorld() {
    const roles = new Map(["r_unv", "r_ver", "r_x"].map((id) => [id, fakeRole(id)]));
    const added = [];
    const member = {
      id: UID, client: {}, user: { id: UID, bot: false, username: "u", tag: "u", displayAvatarURL: () => "https://x/a.png" },
      roles: { cache: new Map(), add: vi.fn(async (id) => { added.push(id); }) },
      guild: { id: G, name: "G", memberCount: 1, members: { me: botMember }, roles: { cache: roles, fetch: async () => null } },
    };
    apiGet.mockImplementation(async (url) => {
      if (url === `/bot/server/${G}`) return { data: { autoroleIds: ["r_unv", "r_x"], stickyRolesEnabled: true } };
      if (url === `/bot/member-roles/${G}/${UID}`) return { data: { roleIds: ["r_ver"] } };
      if (url === `/verification/bot/server/${G}/roles`) return { data: { panels: [{ grantRoleIds: ["r_ver"], removeRoleIds: ["r_unv"] }] } };
      return { data: null };
    });
    return { member, added };
  }
  it("запазената „Verified“ се връща, а „Unverified“ от автоматичните роли не се дава", async () => {
    const w = joinWorld();
    await memberAdd.execute(w.member);
    expect(w.added).toContain("r_ver");
    expect(w.added).toContain("r_x");
    expect(w.added).not.toContain("r_unv");
  });
  it("нов (неверифициран) член получава всички автоматични роли", async () => {
    const w = joinWorld();
    apiGet.mockImplementation(async (url) => {
      if (url === `/bot/server/${G}`) return { data: { autoroleIds: ["r_unv", "r_x"], stickyRolesEnabled: true } };
      if (url === `/bot/member-roles/${G}/${UID}`) return { data: { roleIds: [] } };
      return { data: null };
    });
    await memberAdd.execute(w.member);
    expect(w.added).toEqual(expect.arrayContaining(["r_unv", "r_x"]));
  });
});

// ─── З6: недостъпен лог канал ───────────────────────────────────────────────
describe("З6 — отрицателен кеш за недостъпен лог канал", () => {
  const guild = { id: SID };
  beforeEach(() => {
    apiGet.mockResolvedValue({ data: { enabled: true, categories: ["members"], channelId: LOG } });
  });
  afterEach(() => vi.useRealTimers());

  it("изтрит канал: втората заявка в 5 мин не вика REST", async () => {
    const fetch = vi.fn(async () => { throw Object.assign(new Error("Unknown Channel"), { code: 10003 }); });
    const client = { channels: { cache: new Map(), fetch } };
    const evt = { category: "members", action: "member_join", targetId: UID };
    await evlog.logServerEvent(client, guild, evt);
    await evlog.logServerEvent(client, guild, evt);
    await evlog.logServerEvent(client, guild, evt);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("403 при изпращане: следващите събития не пращат", async () => {
    const send = vi.fn(async () => { throw Object.assign(new Error("Missing Access"), { status: 403, code: 50001 }); });
    const ch = { isTextBased: () => true, guildId: SID, send };
    const client = { channels: { cache: new Map([[LOG, ch]]), fetch: vi.fn() } };
    const evt = { category: "members", action: "member_join", targetId: UID };
    await evlog.logServerEvent(client, guild, evt);
    await evlog.logServerEvent(client, guild, evt);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("след 5 минути се опитва пак", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => null);
    const client = { channels: { cache: new Map(), fetch } };
    const evt = { category: "members", action: "member_join", targetId: UID };
    await evlog.logServerEvent(client, guild, evt);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
    evlog.eventLogConfigCache.clear();
    await evlog.logServerEvent(client, guild, evt);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("временна грешка (429/5xx) не се кешира като „мъртъв“ канал", async () => {
    const send = vi.fn(async () => { throw Object.assign(new Error("rate limited"), { status: 429 }); });
    const ch = { isTextBased: () => true, guildId: SID, send };
    const client = { channels: { cache: new Map([[LOG, ch]]), fetch: vi.fn() } };
    const evt = { category: "members", action: "member_join", targetId: UID };
    await evlog.logServerEvent(client, guild, evt);
    await evlog.logServerEvent(client, guild, evt);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("работещ канал продължава да получава всичко", async () => {
    const send = vi.fn(async () => {});
    const ch = { isTextBased: () => true, guildId: SID, send };
    const client = { channels: { cache: new Map([[LOG, ch]]), fetch: vi.fn() } };
    const evt = { category: "members", action: "member_join", targetId: UID };
    await evlog.logServerEvent(client, guild, evt);
    await evlog.logServerEvent(client, guild, evt);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

// ─── З7: гласов канал ───────────────────────────────────────────────────────
describe("З7 — напускане на гласов канал", () => {
  function voiceWorld({ entries = [], categories = ["voice"] } = {}) {
    apiGet.mockResolvedValue({ data: { enabled: true, categories, channelId: LOG } });
    const send = vi.fn(async () => {});
    const logCh = { isTextBased: () => true, guildId: SID, send };
    const fetchAuditLogs = vi.fn(async () => ({ entries: { find: (fn) => entries.find(fn) } }));
    const guild = { id: SID, fetchAuditLogs };
    const client = { channels: { cache: new Map([[LOG, logCh]]), fetch: vi.fn() } };
    const member = { id: UID, user: { username: "u", discriminator: "0" } };
    const oldState = { guild, client, member, channelId: "c1" };
    const newState = { guild, client, member, channelId: null };
    return { guild, fetchAuditLogs, send, oldState, newState };
  }
  const entry = (target) => ({
    createdTimestamp: Date.now(), target, executor: { id: "777777777777777777", username: "mod", discriminator: "0" },
  });
  const actorOf = (send) => {
    const emb = send.mock.calls[0][0].embeds[0];
    return emb.fields.find((f) => f.name === "Actor")?.value;
  };

  it("категорията е изключена → няма заявка към одитния дневник", async () => {
    const w = voiceWorld({ categories: ["members"] });
    await voiceUpdate.execute(w.oldState, w.newState);
    expect(w.fetchAuditLogs).not.toHaveBeenCalled();
  });

  it("запис за друг човек (или без цел) не се приписва на този, който излиза", async () => {
    for (const target of [{ id: "888888888888888888" }, null]) {
      vi.clearAllMocks();
      apiGet.mockResolvedValue({ data: { enabled: true, categories: ["voice"], channelId: LOG } });
      const w = voiceWorld({ entries: [entry(target)] });
      await voiceUpdate.execute(w.oldState, w.newState);
      expect(w.send).toHaveBeenCalledTimes(1);
      expect(actorOf(w.send)).toBeUndefined(); // actor === target → без поле „Actor“
    }
  });

  it("запис, чиято цел съвпада, се приписва на модератора", async () => {
    const w = voiceWorld({ entries: [entry({ id: UID })] });
    await voiceUpdate.execute(w.oldState, w.newState);
    expect(actorOf(w.send)).toBe("<@777777777777777777>");
  });

  it("коментарът в началото на файла казва същото като кода", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../events/voiceStateUpdate.js", import.meta.url), "utf8");
    expect(src.split("\n").slice(0, 15).join("\n")).not.toMatch(/НЕ при self_\* или join\/leave/);
  });
});

// ─── З12: PinMessages ───────────────────────────────────────────────────────
describe("З12 — PinMessages в поканата и проверката", () => {
  it("поканата съдържа PinMessages (1<<51)", () => {
    const pin = PermissionFlagsBits.PinMessages;
    expect(pin).toBe(1n << 51n);
    expect(BigInt(permCheck.INVITE_PERMISSIONS_INT) & pin).toBe(pin);
  });
  it("числото е точно: задължителните + препоръчителните, и е в границата на безопасно число", () => {
    const sum = [...permCheck.REQUIRED_PERMISSIONS, ...permCheck.RECOMMENDED_PERMISSIONS]
      .reduce((a, r) => a | BigInt(r.flag), 0n);
    expect(sum).toBe(BigInt(permCheck.INVITE_PERMISSIONS_INT));
    expect(Number.isSafeInteger(permCheck.INVITE_PERMISSIONS_INT)).toBe(true);
  });
  it("липсата на PinMessages не е грешка: не влиза в missing, но е в recommendedMissing", () => {
    const all = permCheck.REQUIRED_PERMISSIONS.reduce((a, r) => a | BigInt(r.flag), 0n);
    const guild = { members: { me: { permissions: new PermissionsBitField(all) } } };
    const r = permCheck.checkBotPermissions(guild);
    expect(r.missing).toEqual([]);
    expect(r.recommendedMissing.map((x) => x.name)).toContain("Pin Messages");
  });
  it("с PinMessages няма препоръчително липсващо", () => {
    const all = [...permCheck.REQUIRED_PERMISSIONS, ...permCheck.RECOMMENDED_PERMISSIONS].reduce((a, r) => a | BigInt(r.flag), 0n);
    const guild = { members: { me: { permissions: new PermissionsBitField(all) } } };
    expect(permCheck.checkBotPermissions(guild).recommendedMissing).toEqual([]);
  });
  it("reinviteUrl носи новото число", () => {
    expect(permCheck.reinviteUrl("1")).toContain(`permissions=${permCheck.INVITE_PERMISSIONS_INT}`);
  });
});

// ─── З14: дневник ───────────────────────────────────────────────────────────
describe("З14 — шум и грешна атрибуция в лога", () => {
  const embedOf = async (meta) => {
    apiGet.mockResolvedValue({ data: { enabled: true, categories: ["messages"], channelId: LOG } });
    const send = vi.fn(async () => {});
    const ch = { isTextBased: () => true, guildId: SID, send };
    const client = { channels: { cache: new Map([[LOG, ch]]), fetch: vi.fn() } };
    await evlog.logServerEvent(client, { id: SID }, { category: "messages", action: "message_delete", targetId: UID, metadata: meta });
    return send.mock.calls[0][0].embeds[0];
  };
  it("гол адрес в съдържанието не е кликаем", async () => {
    const emb = await embedOf({ content: "free nitro https://evil.example/x and http://a.b www.evil.example" });
    const v = emb.fields.find((f) => f.name === "Content").value;
    expect(v).not.toMatch(/https?:\/\//i);
    expect(v).not.toMatch(/www\./i);
    expect(v).toContain("evil.example"); // текстът остава четим
  });

  it("роля, дадена от самия бот, не се записва като действие на модератор", async () => {
    apiGet.mockResolvedValue({ data: { enabled: true, categories: ["members"], channelId: LOG } });
    const send = vi.fn(async () => {});
    const ch = { isTextBased: () => true, guildId: SID, send };
    const client = { user: { id: BOT }, channels: { cache: new Map([[LOG, ch]]), fetch: vi.fn() } };
    const mkGuild = (executorId) => ({
      id: SID,
      fetchAuditLogs: async () => ({
        entries: { find: (fn) => [{ target: { id: UID }, createdTimestamp: Date.now(), executor: { id: executorId, username: "x", discriminator: "0" } }].find(fn) },
      }),
    });
    const oldM = (g) => ({ guild: g, client, id: UID, user: { username: "u" }, roles: { cache: new Map() }, nickname: null });
    const newM = (g) => ({ guild: g, client, id: UID, user: { username: "u" }, roles: { cache: new Map([["r1", {}]]) }, nickname: null });

    const g1 = mkGuild(BOT);
    await memberUpdate.execute(oldM(g1), newM(g1));
    const emb = send.mock.calls[0][0].embeds[0];
    expect(emb.fields.find((f) => f.name === "Actor")).toBeUndefined();

    send.mockClear();
    const g2 = mkGuild("777777777777777777");
    await memberUpdate.execute(oldM(g2), newM(g2));
    expect(send.mock.calls[0][0].embeds[0].fields.find((f) => f.name === "Actor")?.value).toBe("<@777777777777777777>");
  });
});
