// bot/src/__tests__/launchPhase2Forms.test.js
// Поток Т, фаза 2: Т10 (съобщение за преглед, което не може да се публикува; pingRoleIds) и
// Т9 (верификационната врата за бутон с формуляр и за /new — покритие на поправеното във фаза 1).
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.API_SECRET = "test-secret";
const get = vi.fn(), post = vi.fn(), patch = vi.fn();
vi.mock("axios", () => ({
  default: { create: () => ({ get: (...a) => get(...a), post: (...a) => post(...a), patch: (...a) => patch(...a), delete: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } }) },
}));

const { submitFormAnswers } = await import("../utils/formSession.js");
const interactionCreate = (await import("../events/interactionCreate.js")).default;
const newCmd = (await import("../commands/new.js")).default;
const { t } = await import("../i18n/index.js");

const GUILD = "111111111111111111", USER = "222222222222222222";
const ROLE_OK = "333333333333333333", ROLE_FOREIGN = "444444444444444444";

function appSession(over = {}) {
  return {
    guildId: GUILD, userId: USER, lang: "bg", panel: null,
    form: { id: "f1", name: "Staff", isApplication: true, reviewChannelId: "555555555555555555" },
    questions: [{ id: "q1", label: "Защо?" }], answers: { q1: "Защото" }, ...over,
  };
}
function mkClient({ reviewSend, logSend = vi.fn(async () => ({})) } = {}) {
  const review = reviewSend ? { id: "555555555555555555", send: reviewSend } : null;
  const log = { id: "666666666666666666", send: logSend };
  const guild = {
    id: GUILD,
    channels: { fetch: vi.fn(async (id) => (id === "555555555555555555" ? review : id === "666666666666666666" ? log : null)) },
    roles: { cache: new Map([[ROLE_OK, {}]]) },
  };
  return { guild, logSend, client: { guilds: { cache: new Map([[GUILD, guild]]) }, users: { fetch: vi.fn(async () => ({ id: USER, username: "u", tag: "u#1", displayAvatarURL: () => "https://x/y.png" })) } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ data: { id: "a1", pingRoleIds: [ROLE_OK, ROLE_FOREIGN] } });
  patch.mockResolvedValue({ data: {} });
  get.mockImplementation(async (url) => (String(url).startsWith("/bot/server/") ? { data: { logChannelId: "666666666666666666", language: "bg" } } : { data: {} }));
});

describe("Т10 — съобщението за преглед", () => {
  it("публикуването падна → човекът чува „подадена е“ (ok), екипът — предупреждение в лог канала", async () => {
    const { client, logSend } = mkClient({ reviewSend: vi.fn(async () => { throw new Error("Missing Access"); }) });
    const r = await submitFormAnswers(client, appSession());
    expect(r).toMatchObject({ ok: true });
    expect(logSend).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logSend.mock.calls[0][0])).toContain(t("app.review.logUnpostable", "bg", { user: `<@${USER}>` }));
  });
  it("липсващ/недостъпен канал за преглед → същото предупреждение", async () => {
    const { client, logSend } = mkClient({ reviewSend: null });
    const r = await submitFormAnswers(client, appSession());
    expect(r.ok).toBe(true);
    expect(logSend).toHaveBeenCalledTimes(1);
  });
  it("pingRoleIds се споменават в съобщението за преглед (само ролите на сървъра)", async () => {
    const send = vi.fn(async () => ({ id: "m1" }));
    const { client } = mkClient({ reviewSend: send });
    const r = await submitFormAnswers(client, appSession());
    expect(r.ok).toBe(true);
    const payload = send.mock.calls[0][0];
    expect(payload.content).toBe(`<@&${ROLE_OK}>`);
    expect(payload.allowedMentions).toEqual({ roles: [ROLE_OK] });
    expect(patch).toHaveBeenCalled(); // reviewMessageId се записва
  });
  it("без pingRoleIds няма content/пингове", async () => {
    post.mockResolvedValue({ data: { id: "a1", pingRoleIds: [] } });
    const send = vi.fn(async () => ({ id: "m1" }));
    const { client } = mkClient({ reviewSend: send });
    await submitFormAnswers(client, appSession());
    expect(send.mock.calls[0][0].content).toBeUndefined();
  });
});

// ── Т9 ───────────────────────────────────────────────────────────────────────
function inter(base) {
  return new Proxy(base, { get: (t0, k) => (k in t0 ? t0[k] : (typeof k === "string" && k.startsWith("is") ? () => false : undefined)) });
}
const formPanel = {
  id: "p1", name: "Support", requireVerifiedRoleIds: ["777777777777777777"], verificationDeniedMessage: null,
  buttons: [{ id: "b1", formId: "f1", form: { id: "f1", questions: [{ id: "q", type: "SHORT_TEXT", label: "Q" }] } }],
};
describe("Т9 — верификационна врата за бутон с формуляр", () => {
  const click = (roles) => inter({
    user: { id: USER }, guildId: GUILD, locale: "bg", customId: "panel_button:p1:b1",
    isButton: () => true, isMessageComponent: () => true,
    member: { roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
    reply: vi.fn(async () => {}), deferReply: vi.fn(async () => {}), editReply: vi.fn(async () => {}), showModal: vi.fn(async () => {}),
  });
  beforeEach(() => {
    get.mockImplementation(async (url) => {
      if (String(url).includes("/blacklisted")) return { data: { blacklisted: false } };
      if (String(url).startsWith("/bot/panel/")) return { data: formPanel };
      return { data: {} };
    });
  });
  it("без нужната роля: отказ, формулярът НЕ се показва", async () => {
    const i = click([]);
    await interactionCreate.execute(i);
    expect(i.showModal).not.toHaveBeenCalled();
    expect(i.reply.mock.calls[0][0].content).toBe(t("verify.gateBlocked", "bg"));
  });
  it("с нужната роля: формулярът се показва", async () => {
    const i = click(["777777777777777777"]);
    await interactionCreate.execute(i);
    expect(i.showModal).toHaveBeenCalledTimes(1);
  });
});

describe("Т9 — верификационна врата за /new със задължителен формуляр", () => {
  it("без нужната роля: отказ, DM сесия не се стартира", async () => {
    get.mockImplementation(async (url) => {
      if (String(url).includes("/guild/")) return { data: [{ id: "p1", name: "Support" }] };
      if (String(url).startsWith("/bot/panel/")) return { data: formPanel };
      return { data: {} };
    });
    const i = inter({
      user: { id: "999999999999999999", send: vi.fn() }, guildId: GUILD, locale: "bg",
      options: { getString: (n) => (n === "panel" ? "Support" : null), getUser: () => null },
      member: { roles: { cache: new Map() }, permissions: { has: () => false } },
      deferReply: vi.fn(async () => {}), editReply: vi.fn(async () => {}), reply: vi.fn(async () => {}),
    });
    await newCmd.execute(i);
    expect(i.editReply.mock.calls.at(-1)[0]).toEqual({ content: t("verify.gateBlocked", "bg") });
    expect(i.user.send).not.toHaveBeenCalled();
  });
});
