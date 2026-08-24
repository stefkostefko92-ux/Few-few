// bot/src/__tests__/welcomer.test.js
// Приветствието в канал казва ЗАЩО не е излязло.
//
// СИГНАЛЪТ (собственикът, 07.08.2026): „welcome message in channel doesn't
// work". Кодът беше едно `if` с три условия и `.catch(() => {})` накрая, значи
// пет РАЗЛИЧНИ причини даваха един и същ резултат — нищо, никъде, без следа:
//   • включен, но без избран канал
//   • включен, но с празно съобщение
//   • канал изтрит / сгрешен ID / ID от друг сървър
//   • ботът няма View Channel / Send Messages / Embed Links в този канал
//   • Discord отказва по друга причина
//
// Собственикът вижда включена функция в таблото и няма как да стигне до
// истината. Затова тестът проверява не „праща ли", а „КАЗВА ЛИ защо не праща" —
// диагностиката е функционалността тук.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const apiGet = vi.fn();
vi.mock("../utils/api.js", () => ({ default: { get: (...a) => apiGet(...a) } }));
vi.mock("../utils/serverEventLog.js", () => ({ logServerEvent: () => {} }));

const { default: handler } = await import("../events/guildMemberAdd.js");
const { PermissionsBitField } = await import("discord.js");

const ALL = new PermissionsBitField([
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.EmbedLinks,
]);

function fakeMember({ channel, perms = ALL } = {}) {
  const me = { id: "bot" };
  const guild = {
    id: "g1",
    name: "T19C",
    memberCount: 42,
    members: { me },
    roles: { cache: new Map(), fetch: async () => null },
    channels: {
      async fetch(id) {
        if (!channel || channel.id !== id) throw new Error("Unknown Channel");
        return { ...channel, permissionsFor: () => perms };
      },
    },
  };
  return {
    id: "u1",
    guild,
    roles: { add: async () => {} },
    user: { id: "u1", username: "ivan", tag: "ivan", bot: false, displayAvatarURL: () => "https://x/a.png" },
  };
}

const CONFIG = {
  welcomerEnabled: true,
  welcomerChannelId: "c1",
  welcomerMessage: "Здравей {user}!",
  welcomerEmbedColor: "#8fe600",
};

let warn;
beforeEach(() => { warn = vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { warn.mockRestore(); vi.clearAllMocks(); });

const warnings = () => warn.mock.calls.map((c) => String(c[0])).join("\n");

describe("приветствието в канал", () => {
  it("щастливият път: изпраща embed в канала", async () => {
    const send = vi.fn(async () => ({}));
    apiGet.mockResolvedValue({ data: CONFIG });
    await handler.execute(fakeMember({ channel: { id: "c1", name: "welcome", send } }));

    expect(send).toHaveBeenCalledTimes(1);
    const [payload] = send.mock.calls[0];
    expect(payload.embeds[0].description).toBe("Здравей <@u1>!");
    expect(warnings()).not.toMatch(/welcomer/);
  });

  it("включен без канал → казва точно това (преди: тишина)", async () => {
    apiGet.mockResolvedValue({ data: { ...CONFIG, welcomerChannelId: null } });
    await handler.execute(fakeMember({ channel: null }));
    expect(warnings()).toMatch(/няма избран канал/);
  });

  it("включен с празно съобщение → казва точно това", async () => {
    apiGet.mockResolvedValue({ data: { ...CONFIG, welcomerMessage: "" } });
    await handler.execute(fakeMember({ channel: null }));
    expect(warnings()).toMatch(/съобщението е празно/);
  });

  it("сгрешен/изтрит/чужд канал → казва ИД-то и трите възможни причини", async () => {
    apiGet.mockResolvedValue({ data: CONFIG });
    await handler.execute(fakeMember({ channel: null }));
    expect(warnings()).toMatch(/c1/);
    expect(warnings()).toMatch(/не е намерен/);
  });

  it("липсващо право → назовава КОЕ, не общо „Missing Permissions“", async () => {
    const send = vi.fn(async () => ({}));
    apiGet.mockResolvedValue({ data: CONFIG });
    const onlyView = new PermissionsBitField([PermissionsBitField.Flags.ViewChannel]);
    await handler.execute(fakeMember({ channel: { id: "c1", name: "welcome", send }, perms: onlyView }));

    expect(send, "не бива да опитваме изпращане без правата").not.toHaveBeenCalled();
    expect(warnings()).toMatch(/Send Messages/);
    expect(warnings()).toMatch(/Embed Links/);
  });

  it("Discord отказва → причината влиза в лога, не се гълта", async () => {
    const send = vi.fn(async () => { throw new Error("Missing Permissions"); });
    apiGet.mockResolvedValue({ data: CONFIG });
    await handler.execute(fakeMember({ channel: { id: "c1", name: "welcome", send } }));
    expect(warnings()).toMatch(/Missing Permissions/);
  });

  it("изключен welcomer мълчи — тишината е вярна само тук", async () => {
    apiGet.mockResolvedValue({ data: { ...CONFIG, welcomerEnabled: false } });
    await handler.execute(fakeMember({ channel: null }));
    expect(warnings()).not.toMatch(/welcomer/);
  });

  it("категория/форум (без .send) → казва, че там не се пише", async () => {
    apiGet.mockResolvedValue({ data: CONFIG });
    await handler.execute(fakeMember({ channel: { id: "c1", name: "категория" } }));
    expect(warnings()).toMatch(/не се пише/);
  });
});
