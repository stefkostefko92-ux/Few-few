// bot/src/__tests__/launchPhase2Verify.test.js
// Поток Т, фаза 2: В1 (без дадена роля няма „успех“), В2 (вече верифициран), З11 (без err.message),
// В3 (showModal е първият отговор; панелът идва от кеш с таван 2 s).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.API_SECRET = "test-secret";
const get = vi.fn(), post = vi.fn(), patch = vi.fn();
vi.mock("axios", () => ({
  default: { create: () => ({ get: (...a) => get(...a), post: (...a) => post(...a), patch: (...a) => patch(...a), delete: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } }) },
}));

const { completeVerification, handleVerificationStart } = await import("../events/interactionCreate.js");
const { t } = await import("../i18n/index.js");

const GUILD = "111111111111111111";
const goodRole = { managed: false, permissions: { any: () => false }, comparePositionTo: () => -1 };
const aboveBot = { managed: false, permissions: { any: () => false }, comparePositionTo: () => 1 };

function inter({ have = [], roles = { r1: goodRole }, logCh = null } = {}) {
  const i = {
    user: { id: "222222222222222222", tag: "u#1", createdTimestamp: 0, send: vi.fn(async () => {}) },
    guildId: GUILD, locale: "bg", deferred: false, replied: false,
    member: { roles: { cache: new Map(have.map((r) => [r, {}])), add: vi.fn(async () => {}), remove: vi.fn(async () => {}) } },
    guild: { id: GUILD, name: "G", members: { me: { roles: { highest: {} } } },
      roles: { cache: new Map(Object.entries(roles)), fetch: vi.fn(async () => null) },
      channels: { fetch: vi.fn(async () => logCh) } },
    deferReply: vi.fn(async () => { i.deferred = true; }),
    editReply: vi.fn(async () => {}), reply: vi.fn(async () => { i.replied = true; }), showModal: vi.fn(async () => { i.replied = true; }),
  };
  return i;
}
const lastText = (i) => String(i.editReply.mock.calls.at(-1)?.[0]?.content ?? i.editReply.mock.calls.at(-1)?.[0]);
const panel = { id: "p1", name: "P", type: "BUTTON", grantRoleIds: ["r1"] };

beforeEach(() => { vi.clearAllMocks(); get.mockResolvedValue({ data: {} }); });

describe("В1 — нито една роля не е дадена", () => {
  it("над бота → честно „свържи се с екипа“, не успех; предупреждение в лог канала", async () => {
    const logCh = { send: vi.fn(async () => {}) };
    const i = inter({ roles: { r1: aboveBot }, logCh });
    post.mockResolvedValue({ data: { grantRoleIds: ["r1"], removeRoleIds: [], successMessage: "Welcome!", logChannelId: "lg" } });
    await completeVerification(i, panel, true, null);
    expect(lastText(i)).toBe(t("verify.noRolesGiven", "bg"));
    expect(lastText(i)).not.toContain("Welcome");
    expect(logCh.send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logCh.send.mock.calls[0][0])).toContain(t("verify.logNoRoles", "bg", { user: "<@222222222222222222>", panel: "P" }));
  });
  it("поне една дадена роля → успех, както преди", async () => {
    const i = inter();
    post.mockResolvedValue({ data: { grantRoleIds: ["r1"], removeRoleIds: [], successMessage: "Welcome!" } });
    await completeVerification(i, panel, true, null);
    expect(i.member.roles.add).toHaveBeenCalledWith("r1", expect.any(String));
    expect(lastText(i)).toBe("Welcome!");
  });
});

describe("В2 — вече верифициран", () => {
  it("държи всички grantRoleIds → „вече си верифициран“, ролите не се пипат", async () => {
    const i = inter({ have: ["r1"] });
    post.mockResolvedValue({ data: { grantRoleIds: ["r1"], removeRoleIds: ["punish"], successMessage: "Welcome!" } });
    await completeVerification(i, panel, true, null);
    expect(lastText(i)).toBe(t("verify.alreadyVerified", "bg"));
    expect(i.member.roles.add).not.toHaveBeenCalled();
    expect(i.member.roles.remove).not.toHaveBeenCalled();
  });
});

describe("З11 — без суров err.message", () => {
  it("срив на бекенда → verify.error", async () => {
    const i = inter();
    post.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:3000"));
    await completeVerification(i, panel, true, null);
    expect(lastText(i)).toBe(t("verify.error", "bg"));
  });
  it("429 → verify.cooldown с cooldownMinutes", async () => {
    const i = inter();
    post.mockRejectedValue({ response: { status: 429, data: { error: "Too many attempts. Please wait 7 minutes", cooldownMinutes: 7 } } });
    await completeVerification(i, panel, true, null);
    expect(lastText(i)).toBe(t("verify.cooldown", "bg", { minutes: 7 }));
  });
});

describe("В3 — модалът е първият отговор", () => {
  afterEach(() => vi.useRealTimers());
  const mathPanel = (id) => ({ id, name: "M", type: "MATH", mathDifficulty: "EASY", grantRoleIds: ["r1"] });

  it("панелът се взима от кеша: втори клик не прави заявка пред showModal", async () => {
    get.mockImplementation(async (url) => (url.includes("/verification/bot/pc") ? { data: mathPanel("pc") } : { data: {} }));
    const a = inter(); await handleVerificationStart(a, "pc");
    const n = get.mock.calls.filter((c) => String(c[0]).includes("/verification/bot/pc")).length;
    const b = inter(); await handleVerificationStart(b, "pc");
    expect(a.showModal).toHaveBeenCalledTimes(1);
    expect(b.showModal).toHaveBeenCalledTimes(1);
    expect(get.mock.calls.filter((c) => String(c[0]).includes("/verification/bot/pc")).length).toBe(n);
  });

  it("зависнал бекенд → отговор до 2 s (преведена грешка), не „interaction failed“", async () => {
    vi.useFakeTimers();
    get.mockImplementation((url) => (url.includes("/verification/bot/ph") ? new Promise(() => {}) : Promise.resolve({ data: {} })));
    const i = inter();
    const p = handleVerificationStart(i, "ph");
    await vi.advanceTimersByTimeAsync(2100);
    await p;
    expect(i.reply).toHaveBeenCalledTimes(1);
    expect(i.reply.mock.calls[0][0].content).toBe(t("verify.error", "bg"));
    expect(i.showModal).not.toHaveBeenCalled();
  });
});
