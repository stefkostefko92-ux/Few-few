// bot/src/__tests__/launchPhase2FormsFlow.test.js
// Поток Т, фаза 2 — покритие на фаза 1: Т1 (формуляр на бутон → createTicketFromPanel с отговорите)
// и Т8 (/new делегира към createTicketFromPanel). interactionCreate е подменен, за да се види точното извикване.
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.API_SECRET = "test-secret";
const get = vi.fn(), post = vi.fn(), patch = vi.fn();
vi.mock("axios", () => ({
  default: { create: () => ({ get: (...a) => get(...a), post: (...a) => post(...a), patch: (...a) => patch(...a), delete: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } }) },
}));
const createTicketFromPanel = vi.fn(async () => ({ ok: true }));
const checkVerificationGate = vi.fn(() => ({ allowed: true }));
vi.mock("../events/interactionCreate.js", () => ({ createTicketFromPanel: (...a) => createTicketFromPanel(...a), checkVerificationGate: (...a) => checkVerificationGate(...a) }));

const { submitFormAnswers } = await import("../utils/formSession.js");
const newCmd = (await import("../commands/new.js")).default;

const GUILD = "111111111111111111", USER = "222222222222222222";
beforeEach(() => { vi.clearAllMocks(); });

describe("Т1 — формуляр на бутон → тикет по същия път", () => {
  it("панел само с categoryOpenId: отговорите (по етикет) отиват в createTicketFromPanel; не се създава кандидатура", async () => {
    const guild = { id: GUILD, members: { fetch: vi.fn(async () => ({ id: USER, user: { id: USER } })) } };
    const client = { guilds: { cache: new Map([[GUILD, guild]]) } };
    const panel = { id: "p1", categoryOpenId: "c1", categoryId: null };
    const session = {
      guildId: GUILD, userId: USER, lang: "en", panel, form: { id: "f1", isApplication: false },
      questions: [{ id: "q1", label: "Problem" }, { id: "q2", label: "Empty" }], answers: { q1: "It broke", q2: "  " },
    };
    const ctx = { guild, member: { id: USER, user: { id: USER } }, user: { id: USER }, editReply: vi.fn() };
    const r = await submitFormAnswers(client, session, ctx);
    expect(r).toMatchObject({ ok: true, kind: "ticket", opened: true });
    expect(createTicketFromPanel).toHaveBeenCalledTimes(1);
    const [, p, answers] = createTicketFromPanel.mock.calls[0];
    expect(p).toBe(panel);
    expect(answers).toEqual({ Problem: "It broke" });
    expect(post).not.toHaveBeenCalledWith("/bot/application/submit", expect.anything());
  });
  it("createTicketFromPanel отказва (напр. лимит) → opened:false, без втори опит", async () => {
    createTicketFromPanel.mockResolvedValueOnce({ ok: false });
    const guild = { id: GUILD };
    const client = { guilds: { cache: new Map([[GUILD, guild]]) } };
    const session = { guildId: GUILD, userId: USER, lang: "en", panel: { id: "p1" }, form: { isApplication: false }, questions: [], answers: {} };
    const r = await submitFormAnswers(client, session, { guild, member: { id: USER }, user: { id: USER }, editReply: vi.fn() });
    expect(r).toMatchObject({ kind: "ticket", opened: false });
    expect(createTicketFromPanel).toHaveBeenCalledTimes(1);
  });
});

describe("Т8 — /new делегира към createTicketFromPanel", () => {
  it("известен панел без формуляр: ЕДНО извикване с пълния панел, причината и on_behalf_of", async () => {
    const panel = { id: "p1", name: "Support", buttons: [], supportRoleIds: [] };
    get.mockImplementation(async (url) => (String(url).includes("/guild/") ? { data: [{ id: "p1", name: "Support" }] } : { data: panel }));
    const i = {
      user: { id: USER }, guildId: GUILD, locale: "en",
      options: { getString: (n) => (n === "panel" ? "support" : n === "reason" ? "help" : null), getUser: () => null },
      member: { roles: { cache: new Map() }, permissions: { has: () => false } },
      deferReply: vi.fn(async () => {}), editReply: vi.fn(async () => {}), reply: vi.fn(async () => {}),
    };
    await newCmd.execute(i);
    expect(createTicketFromPanel).toHaveBeenCalledTimes(1);
    const [ix, p, answers, opts] = createTicketFromPanel.mock.calls[0];
    expect(ix).toBe(i);
    expect(p).toMatchObject({ id: "p1" });
    expect(answers).toBeNull();
    expect(opts).toMatchObject({ reason: "help" });
  });
});
