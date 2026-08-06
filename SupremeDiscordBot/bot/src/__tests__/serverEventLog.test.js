// bot/src/__tests__/serverEventLog.test.js
// Регресии за Server Event Logging (06.08.2026):
//   1. voice_move се приписваше на самия човек — MemberMove записите в audit
//      log-а НЯМАТ user target (само extra.channel + extra.count), затова общият
//      fetchAuditActor (сверява target.id) никога не намираше нищо.
//   2. Категорията "server" (канали/роли/права) трябва да може да сочи към СВОЙ
//      лог канал, с падане обратно към общия.
import { describe, it, expect, vi, beforeEach } from "vitest";

// api.js се вика при getEventLogConfig — държим го под контрол.
const apiGet = vi.fn();
vi.mock("../utils/api.js", () => ({ default: { get: (...a) => apiGet(...a) } }));

const {
  fetchVoiceMoveActor,
  fetchVoiceDisconnectActor,
  fetchAuditActor,
  logServerEvent,
  eventLogConfigCache,
  AuditLogEvent,
} = await import("../utils/serverEventLog.js");

// Минимален guild дубъл: fetchAuditLogs връща подадените записи.
function fakeGuild(entries, { throws = false } = {}) {
  return {
    id: "g1",
    async fetchAuditLogs() {
      if (throws) throw new Error("Missing Permissions");
      return { entries };
    },
  };
}
const executor = { id: "mod1", username: "mod", discriminator: "0" };

describe("fetchVoiceMoveActor — MemberMove няма user target", () => {
  it("намира преместващия по ЦЕЛЕВИЯ канал", async () => {
    const guild = fakeGuild([
      { extra: { channel: { id: "voiceB" }, count: 1 }, createdTimestamp: Date.now(), executor },
    ]);
    await expect(fetchVoiceMoveActor(guild, "voiceB")).resolves.toEqual({
      executorId: "mod1",
      executorTag: "mod",
    });
  });

  it("същият запис е НЕВИДИМ за общия fetchAuditActor (доказва защо трябва отделна функция)", async () => {
    const guild = fakeGuild([
      { extra: { channel: { id: "voiceB" }, count: 1 }, createdTimestamp: Date.now(), executor },
    ]);
    // target.id липсва → старият път връща null и voice_move се приписваше на члена.
    await expect(fetchAuditActor(guild, AuditLogEvent.MemberMove, "member1")).resolves.toBeNull();
  });

  it("сам се е преместил (няма запис) → null, за да не се показва излишен Actor", async () => {
    await expect(fetchVoiceMoveActor(fakeGuild([]), "voiceB")).resolves.toBeNull();
  });

  it("запис за ДРУГ целеви канал не се брои", async () => {
    const guild = fakeGuild([
      { extra: { channel: { id: "voiceZ" } }, createdTimestamp: Date.now(), executor },
    ]);
    await expect(fetchVoiceMoveActor(guild, "voiceB")).resolves.toBeNull();
  });

  it("стар запис (извън maxAgeMs) не се брои — audit log-ът е eventually consistent", async () => {
    const guild = fakeGuild([
      { extra: { channel: { id: "voiceB" } }, createdTimestamp: Date.now() - 60_000, executor },
    ]);
    await expect(fetchVoiceMoveActor(guild, "voiceB")).resolves.toBeNull();
  });

  it("без toChannelId не пипа audit log-а изобщо", async () => {
    const spy = vi.fn();
    await expect(fetchVoiceMoveActor({ id: "g1", fetchAuditLogs: spy }, null)).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("fail-safe: липса на ViewAuditLog → null, не хвърля", async () => {
    await expect(fetchVoiceMoveActor(fakeGuild([], { throws: true }), "voiceB")).resolves.toBeNull();
  });

  it("legacy tag с дискриминатор се форматира username#1234", async () => {
    const guild = fakeGuild([
      {
        extra: { channel: { id: "voiceB" } },
        createdTimestamp: Date.now(),
        executor: { id: "mod2", username: "old", discriminator: "1234" },
      },
    ]);
    await expect(fetchVoiceMoveActor(guild, "voiceB")).resolves.toEqual({
      executorId: "mod2",
      executorTag: "old#1234",
    });
  });
});

describe("fetchVoiceDisconnectActor", () => {
  it("намира изритващия от гласовия канал", async () => {
    const guild = fakeGuild([{ createdTimestamp: Date.now(), executor }]);
    await expect(fetchVoiceDisconnectActor(guild)).resolves.toEqual({
      executorId: "mod1",
      executorTag: "mod",
    });
  });

  it("сам е излязъл (няма запис) → null", async () => {
    await expect(fetchVoiceDisconnectActor(fakeGuild([]))).resolves.toBeNull();
  });
});

// ─── Per-category лог канал (v37) ─────────────────────────────────────────────

function fakeClient(sent) {
  return {
    channels: {
      cache: {
        get: (id) => ({
          guildId: "g1",
          isTextBased: () => true,
          send: async (payload) => sent.push({ id, payload }),
        }),
      },
      fetch: async () => null,
    },
  };
}

describe("logServerEvent — категория server и per-category канал", () => {
  beforeEach(() => {
    eventLogConfigCache.clear();
    apiGet.mockReset();
  });

  it("праща в канала на категорията, когато има такъв", async () => {
    apiGet.mockResolvedValue({
      data: {
        enabled: true,
        channelId: "general-log",
        categories: ["server"],
        channels: { server: "server-log" },
      },
    });
    const sent = [];
    await logServerEvent(fakeClient(sent), { id: "g1" }, {
      category: "server",
      action: "role_permissions_update",
      actorId: "mod1",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].id).toBe("server-log");
    expect(sent[0].payload.embeds[0].title).toBe("🔐 Role Permissions Changed");
    // Лог, не известие — нищо не бива да пингва.
    expect(sent[0].payload.allowedMentions).toEqual({ parse: [] });
  });

  it("пада обратно към общия канал, ако категорията няма свой (заварени конфигурации)", async () => {
    apiGet.mockResolvedValue({
      data: { enabled: true, channelId: "general-log", categories: ["server"] },
    });
    const sent = [];
    await logServerEvent(fakeClient(sent), { id: "g1" }, {
      category: "server",
      action: "channel_delete",
    });
    expect(sent[0].id).toBe("general-log");
  });

  it("рисува metadata на категория server (роля + кои права) — иначе embed-ът е празен", async () => {
    apiGet.mockResolvedValue({
      data: { enabled: true, channelId: "general-log", categories: ["server"] },
    });
    const sent = [];
    await logServerEvent(fakeClient(sent), { id: "g1" }, {
      category: "server",
      action: "role_permissions_update",
      actorId: "mod1",
      metadata: {
        role: "<@&r1>",
        name: "Moderators",
        granted: "BanMembers, KickMembers",
        revoked: "ManageGuild",
      },
    });
    const names = sent[0].payload.embeds[0].fields.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["Actor", "Role", "Name", "Granted", "Revoked"]));
    const granted = sent[0].payload.embeds[0].fields.find((f) => f.name === "Granted");
    expect(granted.value).toBe("BanMembers, KickMembers");
  });

  it("непознат metadata ключ пак се показва (заглавие = ключът), не изчезва тихо", async () => {
    apiGet.mockResolvedValue({
      data: { enabled: true, channelId: "general-log", categories: ["server"] },
    });
    const sent = [];
    await logServerEvent(fakeClient(sent), { id: "g1" }, {
      category: "server",
      action: "channel_update",
      metadata: { somethingNew: "стойност" },
    });
    const f = sent[0].payload.embeds[0].fields.find((x) => x.name === "SomethingNew");
    expect(f?.value).toBe("стойност");
  });

  it("дълга стойност се реже на 1024 (лимит на Discord поле)", async () => {
    apiGet.mockResolvedValue({
      data: { enabled: true, channelId: "general-log", categories: ["server"] },
    });
    const sent = [];
    await logServerEvent(fakeClient(sent), { id: "g1" }, {
      category: "server",
      action: "role_permissions_update",
      metadata: { granted: "X".repeat(3000) },
    });
    const f = sent[0].payload.embeds[0].fields.find((x) => x.name === "Granted");
    expect(f.value).toHaveLength(1024);
  });

  it("празни/обектни metadata стойности не раждат празни полета", async () => {
    apiGet.mockResolvedValue({
      data: { enabled: true, channelId: "general-log", categories: ["server"] },
    });
    const sent = [];
    await logServerEvent(fakeClient(sent), { id: "g1" }, {
      category: "server",
      action: "channel_update",
      metadata: { name: "", type: null, nested: { a: 1 }, ok: "да" },
    });
    const names = sent[0].payload.embeds[0].fields.map((f) => f.name);
    expect(names).toEqual(["Ok"]);
  });

  it("изключена категория „server“ → нищо не се праща", async () => {
    apiGet.mockResolvedValue({
      data: { enabled: true, channelId: "general-log", categories: ["voice"] },
    });
    const sent = [];
    await logServerEvent(fakeClient(sent), { id: "g1" }, {
      category: "server",
      action: "channel_update",
    });
    expect(sent).toHaveLength(0);
  });
});
