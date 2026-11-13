// bot/src/__tests__/bait.test.js
// v52 — капан за спам ботове: кой се хваща (само в канала-капан, не ботове),
// кой не (собственик, екип), трите действия, личното съобщение ПРЕДИ действието,
// един човек = едно действие при залп от съобщения, лог при липсващи права, и
// че съдържанието на съобщението не се чете.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PermissionFlagsBits } from "discord.js";

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPut = vi.fn();
const apiPatch = vi.fn();
vi.mock("../utils/api.js", () => ({
  default: { get: (...a) => apiGet(...a), post: (...a) => apiPost(...a), put: (...a) => apiPut(...a), patch: (...a) => apiPatch(...a) },
  getServer: async () => ({ language: "en" }),
}));

const hp = await import("../utils/bait.js");
const bait = (await import("../commands/bait.js")).default;

const SID = "222222222222222222";
const TRAP = "444444444444444444";
const LOG = "555555555555555555";
const UID = "333333333333333333";
const HERE = dirname(fileURLToPath(import.meta.url));

function world({ action = "softban", staff = false, owner = false, botPerms = true, bannable = true, dmUser = true } = {}) {
  const logCh = { id: LOG, isTextBased: () => true, send: vi.fn(async () => ({})) };
  const order = [];
  const guild = {
    id: SID, name: "Test Server", ownerId: owner ? UID : "999999999999999999",
    channels: { cache: new Map([[LOG, logCh]]) },
    members: {
      me: { permissions: { has: () => botPerms } },
      ban: vi.fn(async () => { order.push("ban"); }),
      unban: vi.fn(async () => { order.push("unban"); }),
    },
  };
  const member = {
    permissions: { any: () => staff },
    bannable, moderatable: bannable,
    timeout: vi.fn(async () => { order.push("timeout"); }),
  };
  const user = {
    id: UID, tag: "spammer#0", bot: false, createdTimestamp: Date.now() - 86_400_000,
    displayAvatarURL: () => "https://cdn.test/a.png",
    send: vi.fn(async () => { order.push("dm"); }),
  };
  const message = (channelId = TRAP) => ({
    guildId: SID, channelId, guild, member, author: user,
    get content() { throw new Error("съдържанието не бива да се чете"); },
    delete: vi.fn(async () => { order.push("delete"); }),
    channel: { messages: { fetch: vi.fn(async () => null) } },
  });
  const config = { enabled: true, channelId: TRAP, action, logChannelId: LOG, dmUser, caughtCount: 4, warningMessageId: null };
  apiGet.mockResolvedValue({ data: config });
  return { guild, member, user, logCh, message, order };
}

beforeEach(() => {
  vi.resetAllMocks();
  hp.__test.cache.clear(); hp.__test.handled.clear(); hp.__test.resetDm();
  apiPost.mockResolvedValue({ data: { caughtCount: 5 } });
});

describe("кой пада в капана", () => {
  it("съобщение извън капана → нищо (false, нищо не се трие)", async () => {
    const w = world();
    const m = w.message("100000000000000000");
    expect(await hp.onBaitMessage(m)).toBe(false);
    expect(m.delete).not.toHaveBeenCalled();
  });

  it("изключен капан → нищо", async () => {
    const w = world();
    apiGet.mockResolvedValue({ data: { enabled: false, channelId: TRAP } });
    expect(await hp.onBaitMessage(w.message())).toBe(false);
  });

  it("ботове и webhook-и не се пипат", async () => {
    const w = world();
    const botMsg = w.message(); botMsg.author = { ...w.user, bot: true };
    const hookMsg = w.message(); hookMsg.webhookId = "1";
    expect(await hp.onBaitMessage(botMsg)).toBe(false);
    expect(await hp.onBaitMessage(hookMsg)).toBe(false);
    expect(botMsg.delete).not.toHaveBeenCalled();
  });

  it("собственик и екип → само триене + лог, без действие", async () => {
    for (const opts of [{ owner: true }, { staff: true }]) {
      hp.__test.handled.clear();
      const w = world(opts);
      expect(await hp.onBaitMessage(w.message())).toBe(true);
      expect(w.order).toEqual(["delete"]);
      expect(w.logCh.send.mock.calls[0][0].content).toContain("server owner or staff");
    }
  });
});

describe("действията", () => {
  it("softban: триене → DM → бан (последния час) → разбан; брояч и лог", async () => {
    const w = world();
    expect(await hp.onBaitMessage(w.message())).toBe(true);
    expect(w.order).toEqual(["delete", "dm", "ban", "unban"]);
    expect(w.guild.members.ban).toHaveBeenCalledWith(UID, expect.objectContaining({ deleteMessageSeconds: 3600 }));
    expect(apiPost).toHaveBeenCalledWith(`/bot/honeypot/${SID}/caught`);
    const embed = w.logCh.send.mock.calls[0][0].embeds[0].toJSON();
    expect(embed.title).toContain("Took the bait");
    expect(JSON.stringify(embed.fields)).toContain("5");
    expect(w.user.send.mock.calls[0][0].content).toContain("Test Server");
  });

  it("ban: без разбан", async () => {
    const w = world({ action: "ban" });
    await hp.onBaitMessage(w.message());
    expect(w.order).toEqual(["delete", "dm", "ban"]);
  });

  it("timeout: 24 часа, без бан", async () => {
    const w = world({ action: "timeout" });
    await hp.onBaitMessage(w.message());
    expect(w.member.timeout).toHaveBeenCalledWith(hp.TIMEOUT_MS, expect.any(String));
    expect(w.guild.members.ban).not.toHaveBeenCalled();
  });

  it("без DM, когато е изключено", async () => {
    const w = world({ dmUser: false });
    await hp.onBaitMessage(w.message());
    expect(w.user.send).not.toHaveBeenCalled();
    expect(w.guild.members.unban).toHaveBeenCalled();
  });

  it("залп от един спам бот → едно действие, останалите съобщения само се трият", async () => {
    const w = world();
    const msgs = [w.message(), w.message(), w.message()];
    for (const m of msgs) await hp.onBaitMessage(m);
    expect(w.guild.members.ban).toHaveBeenCalledTimes(1);
    for (const m of msgs) expect(m.delete).toHaveBeenCalled();
  });

  it("ботът няма право / ролята е по-ниско → без действие, логът казва какво да се оправи", async () => {
    for (const opts of [{ botPerms: false }, { bannable: false }]) {
      hp.__test.handled.clear();
      const w = world(opts);
      await hp.onBaitMessage(w.message());
      expect(w.guild.members.ban).not.toHaveBeenCalled();
      expect(w.logCh.send.mock.calls[0][0].content).toContain("Ban Members");
    }
  });

  it("провален разбан → отделно предупреждение в лога", async () => {
    const w = world();
    w.guild.members.unban.mockRejectedValueOnce(new Error("nope"));
    await hp.onBaitMessage(w.message());
    expect(w.logCh.send.mock.calls.map((c) => c[0].content).join(" ")).toContain("still banned");
  });
});

describe("кеш", () => {
  it("падналият backend не се бие на всяко съобщение", async () => {
    const w = world();
    apiGet.mockReset();
    apiGet.mockRejectedValue(new Error("down"));
    for (let i = 0; i < 5; i++) expect(await hp.onBaitMessage(w.message())).toBe(false);
    expect(apiGet).toHaveBeenCalledTimes(1);
  });
});

describe("/bait", () => {
  it("дефиниция: guild-only, Manage Server, трите подкоманди", () => {
    const j = bait.data.toJSON();
    expect(j.dm_permission).toBe(false);
    expect(j.default_member_permissions).toBe(String(PermissionFlagsBits.ManageGuild));
    expect(j.options.map((o) => o.name)).toEqual(["setup", "disable", "status"]);
    expect(j.options[0].options.find((o) => o.name === "action").choices.map((c) => c.value)).toEqual(["softban", "ban", "timeout"]);
  });

  it("член без Manage Server → отказ, нищо не се записва", async () => {
    const i = {
      guildId: SID, locale: "en", user: { id: UID },
      memberPermissions: { has: () => false },
      options: { getSubcommand: () => "setup" },
      deferReply: vi.fn(), editReply: vi.fn(),
    };
    await bait.execute(i);
    expect(i.editReply.mock.calls[0][0].content).toContain("Manage Server");
    expect(apiPut).not.toHaveBeenCalled();
  });
});

describe("приватност", () => {
  it("капанът не чете съдържанието на съобщенията", () => {
    expect(readFileSync(join(HERE, "../utils/bait.js"), "utf8")).not.toMatch(/message\.content/);
  });
});
