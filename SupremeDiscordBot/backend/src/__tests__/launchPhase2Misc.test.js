// backend/src/__tests__/launchPhase2Misc.test.js
// Поток Т, фаза 2: З9 (изтрито съобщение с роли по реакция → непубликувано), Т19 (лог каналът на сървъра е
// резервен за панела), В5 (кои сървъри имат запазване на роли — за затопляне на кеша на бота).
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.API_SECRET = "test-bot-secret";
const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/premium.js", async (orig) => ({
  ...(await orig()),
  getServerTier: vi.fn(async () => ({ plan: "premium", isPremium: true })),
  requirePremium: () => (req, res, next) => next(),
}));
vi.mock("../services/webhooks.js", async (orig) => ({ ...(await orig()), fireWebhooks: vi.fn(() => Promise.resolve()) }));
vi.mock("../services/botNotifier.js", () => ({
  notifyBot: vi.fn(() => Promise.resolve(null)), notifyBotVerbose: vi.fn(), dmUser: vi.fn(), sendTicketReply: vi.fn(), reconcileWhitelabel: vi.fn(),
}));
vi.mock("../middleware/auth.js", () => ({
  requireBotSecret: (req, res, next) => next(), requireAuth: (q, s, n) => n(), loadUser: (q, s, n) => n(), requireServerAdmin: (q, s, n) => n(),
}));
vi.mock("../lib/auditLog.js", () => ({ writeAudit: vi.fn(async () => true) }));
vi.mock("../lib/game/xp.js", () => ({ awardTicketSlaXp: vi.fn(), grantXpOnce: vi.fn(() => Promise.resolve()), XP_REWARDS: {} }));

const GUILD = "111111111111111111";
const { default: botRouter } = await import("../routes/bot.js");
const { loadSanitizedPanel, withServerLogFallback } = await import("../lib/ticketPanel.js");
const app = () => { const a = express(); a.use(express.json()); a.use("/api/bot", botRouter); a.use((e, q, r, n) => r.status(500).json({ error: e.message })); return a; };
const bot = { post: (u, b) => request(app()).post(`/api/bot${u}`).set("x-bot-secret", "test-bot-secret").send(b), get: (u) => request(app()).get(`/api/bot${u}`).set("x-bot-secret", "test-bot-secret") };

beforeEach(() => { vi.resetAllMocks(); });

describe("З9 — изтрито съобщение с роли по реакция", () => {
  it("маркира като непубликувано, скоуп по serverId", async () => {
    prismaMock.reactionRoleMessage.updateMany.mockResolvedValue({ count: 1 });
    const r = await bot.post("/reaction-roles/message/999999999999999999/deleted", { serverId: GUILD });
    expect(r.status).toBe(200);
    expect(prismaMock.reactionRoleMessage.updateMany).toHaveBeenCalledWith({
      where: { messageId: "999999999999999999", serverId: GUILD }, data: { messageId: null, channelId: null },
    });
  });
  it("serverId е задължителен низ (Prisma маха филтъра при undefined)", async () => {
    for (const body of [{}, { serverId: { not: "" } }, { serverId: "" }]) {
      const r = await bot.post("/reaction-roles/message/999999999999999999/deleted", body);
      expect(r.status).toBe(400);
    }
    expect(prismaMock.reactionRoleMessage.updateMany).not.toHaveBeenCalled();
  });
  it("чуждо/непознато съобщение → 204-подобен no-op (count 0 не е грешка)", async () => {
    prismaMock.reactionRoleMessage.updateMany.mockResolvedValue({ count: 0 });
    const r = await bot.post("/reaction-roles/message/1/deleted", { serverId: GUILD });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, updated: 0 });
  });
});

describe("Т19 — лог каналът на сървъра е резервен", () => {
  it("withServerLogFallback: панел без свой лог канал ползва този на сървъра; собственият печели", () => {
    expect(withServerLogFallback({ logChannelId: null }, "S").logChannelId).toBe("S");
    expect(withServerLogFallback({ logChannelId: "" }, "S").logChannelId).toBe("S");
    expect(withServerLogFallback({ logChannelId: "P" }, "S").logChannelId).toBe("P");
    expect(withServerLogFallback({ logChannelId: null }, null).logChannelId).toBeNull();
  });
  it("изчистеният панел за затваряне/ескалация носи резервния лог канал", async () => {
    prismaMock.panel.findFirst.mockResolvedValue({ id: "p1", serverId: GUILD, logChannelId: null, name: "P" });
    prismaMock.server.findUnique.mockResolvedValue({ logChannelId: "S" });
    const p = await loadSanitizedPanel("p1", GUILD);
    expect(p.logChannelId).toBe("S");
  });
  it("GET /panel/:id (горещият път на бота при отваряне) също", async () => {
    prismaMock.panel.findFirst.mockResolvedValue({ id: "p1", serverId: GUILD, logChannelId: null, buttons: [], server: { id: GUILD, isPremium: true, logChannelId: "S" } });
    const r = await bot.get(`/panel/p1?serverId=${GUILD}`);
    expect(r.status).toBe(200);
    expect(r.body.logChannelId).toBe("S");
  });
});

describe("В5 — сървъри със запазване на роли", () => {
  it("връща само id-тата, на които е включено", async () => {
    prismaMock.server.findMany.mockResolvedValue([{ id: GUILD }, { id: "222222222222222222" }]);
    const r = await bot.get("/sticky-roles/servers");
    expect(r.body).toEqual({ serverIds: [GUILD, "222222222222222222"] });
    expect(prismaMock.server.findMany.mock.calls[0][0].where).toEqual({ stickyRolesEnabled: true });
  });
});
