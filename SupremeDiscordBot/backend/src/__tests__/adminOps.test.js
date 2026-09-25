// backend/src/__tests__/adminOps.test.js
// Админ операции (v3.4): System · Security · Billing · Fleet · DSR.
// Гейтва: (1) гардовете — MFA на входа и step-up + MAIN_OWNER на всичко, което
// променя състояние; (2) нула тайни в отговорите; (3) DSR — обхватите и
// отказите (staff, активни абонаменти); (4) brute-force снимка/отблокиране.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.API_SECRET = "bot-secret-test";
process.env.DISCORD_CLIENT_ID = "app123";
process.env.DISCORD_SKU_PREMIUM = "sku_prem";
process.env.DISCORD_SKU_WHITELABEL = "sku_wl";
process.env.BOT_API_URL = "http://bot.test:3001";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/redisClient.js", () => ({ getRedis: () => null }));

let USER, SESSION;
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, _res, next) => { req.session = SESSION; next(); },
  loadUser: (req, _res, next) => { req.user = USER; next(); },
  requireSuperUser: (req, res, next) => (["MAIN_OWNER", "SUPER_USER"].includes(req.user?.globalRole) ? next() : res.status(403).json({ error: "no" })),
  requireMainOwner: (req, res, next) => (req.user?.globalRole === "MAIN_OWNER" ? next() : res.status(403).json({ error: "Main Owner access required" })),
  requireServerAdmin: (_req, _res, next) => next(),
  requireBotSecret: (_req, _res, next) => next(),
}));
const axiosMock = vi.fn();
// default(cfg) за botCall и .get за здравето на бота — двете през един спай.
axiosMock.get = vi.fn();
vi.mock("axios", () => ({ default: Object.assign((cfg) => axiosMock(cfg), { get: (...a) => axiosMock.get(...a) }), __esModule: true }));

const { recordFailure, _resetBruteForceState, snapshot } = await import("../lib/bruteForce.js");
const router = (await import("../routes/adminOps.js")).default;
const app = express();
app.use(express.json());
app.use("/api/admin", router);

const fresh = () => ({ mfaVerifiedAt: Date.now() - 1000, mfaLastActivity: Date.now() });
const stale = () => ({ mfaVerifiedAt: Date.now() - 20 * 60 * 1000, mfaLastActivity: Date.now() });

beforeEach(() => {
  vi.resetAllMocks();
  _resetBruteForceState();
  USER = { id: "owner", username: "stefan", globalRole: "MAIN_OWNER", mfaEnabledAt: new Date() };
  SESSION = fresh();
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.auditLog.findMany.mockResolvedValue([]);
  prismaMock.auditLog.findFirst.mockResolvedValue(null);
  prismaMock.auditLog.groupBy = vi.fn().mockResolvedValue([{ action: "JOB_OK_DUNNING", _max: { createdAt: new Date("2026-09-13T03:30:00Z") } }]);
  prismaMock.auditLog.count.mockResolvedValue(0);
  prismaMock.$queryRaw.mockResolvedValue([]);
});

describe("гардове", () => {
  it("без потвърден втори фактор → 403 MFA_REQUIRED на четене", async () => {
    SESSION = {};
    const r = await request(app).get("/api/admin/system");
    expect(r.status).toBe(403); expect(r.body.code).toBe("MFA_REQUIRED");
  });
  it("променящо действие с остаряло потвърждение → MFA_STEP_UP; SUPER_USER → 403", async () => {
    SESSION = stale();
    let r = await request(app).post("/api/admin/security/unblock").send({ scope: "mfa", key: "user:x" });
    expect(r.status).toBe(403); expect(r.body.code).toBe("MFA_STEP_UP");
    SESSION = fresh(); USER.globalRole = "SUPER_USER";
    r = await request(app).post("/api/admin/security/unblock").send({ scope: "mfa", key: "user:x" });
    expect(r.status).toBe(403);
  });
});

describe("GET /system", () => {
  it("връща здраве, миграция, пулс на задачите и конфигурация — без тайни", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ ok: 1 }])
      .mockResolvedValueOnce([{ migration_name: "20260823000000_v49_user_mfa", finished_at: new Date() }])
      .mockResolvedValueOnce([{ n: 0 }]);
    axiosMock.get.mockResolvedValue({ status: 200, data: { status: "ok", gateway: "connected", brandBots: { total: 1, ready: 1, down: 0 } } });
    process.env.SENTRY_DSN = "https://k@sentry.io/1";
    const r = await request(app).get("/api/admin/system");
    expect(r.status).toBe(200);
    expect(r.body.db.ok).toBe(true);
    expect(r.body.migration.latest).toBe("20260823000000_v49_user_mfa");
    expect(r.body.jobs.dunning.lastOk).toBeTruthy();
    expect(r.body.bot.gateway).toBe("connected");
    expect(r.body.config).toMatchObject({ mfaEnforced: true, sentry: true });
    expect(JSON.stringify(r.body)).not.toContain("sentry.io/1");
    expect(JSON.stringify(r.body)).not.toContain("bot-secret-test");
  });
});

describe("GET /security", () => {
  it("staff със състояние на MFA, живи сесии, блокировки и API ключове без хешове", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "owner", username: "stefan", globalRole: "MAIN_OWNER", mfaEnabledAt: new Date(), mfaBackupCodes: JSON.stringify(["a", "b"]), updatedAt: new Date(), createdAt: new Date() },
      { id: "sup", username: "ana", globalRole: "SUPPORT_STAFF", mfaEnabledAt: null, mfaBackupCodes: null, updatedAt: new Date(), createdAt: new Date() },
    ]);
    prismaMock.$queryRaw.mockResolvedValueOnce([{ uid: "owner", n: 2 }]);
    prismaMock.apiKey.findMany.mockResolvedValue([{ id: "k1", serverId: "s1", userId: "u1", name: "ci", keyPrefix: "sb_ab", scopes: ["tickets:read"], lastUsedAt: null, expiresAt: null, revokedAt: null, requestCount: 3, createdAt: new Date() }]);
    prismaMock.user.count.mockResolvedValue(1);
    for (let i = 0; i < 5; i++) await recordFailure("mfa", "user:attacker");
    const r = await request(app).get("/api/admin/security");
    expect(r.status).toBe(200);
    expect(r.body.staff.find((s) => s.id === "owner")).toMatchObject({ mfaEnabled: true, backupCodesLeft: 2, sessions: 2 });
    expect(r.body.staff.find((s) => s.id === "sup")).toMatchObject({ mfaEnabled: false, sessions: 0 });
    expect(r.body.bruteForce.blocked[0]).toMatchObject({ scope: "mfa", key: "user:attacker" });
    expect(r.body.apiKeys.active).toBe(1);
    expect(JSON.stringify(r.body)).not.toContain("keyHash");
  });

  it("unblock маха блокировката и одитира", async () => {
    for (let i = 0; i < 5; i++) await recordFailure("mfa", "user:attacker");
    expect(snapshot().blocked).toHaveLength(1);
    const r = await request(app).post("/api/admin/security/unblock").send({ scope: "mfa", key: "user:attacker" });
    expect(r.status).toBe(200); expect(r.body.removed).toBe(true);
    expect(snapshot().blocked).toHaveLength(0);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "SECURITY_UNBLOCK" }) }));
  });

  it("revoke на API ключ е идемпотентен и одитиран", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({ id: "k1", serverId: "s1", userId: "u1", revokedAt: null, keyPrefix: "sb_ab" });
    prismaMock.apiKey.update.mockResolvedValue({});
    let r = await request(app).delete("/api/admin/security/apikeys/k1");
    expect(r.status).toBe(200); expect(r.body.alreadyRevoked).toBe(false);
    prismaMock.apiKey.findUnique.mockResolvedValue({ id: "k1", serverId: "s1", userId: "u1", revokedAt: new Date(), keyPrefix: "sb_ab" });
    r = await request(app).delete("/api/admin/security/apikeys/k1");
    expect(r.body.alreadyRevoked).toBe(true);
    expect(prismaMock.apiKey.update).toHaveBeenCalledTimes(1);
  });
});

describe("billing / fleet", () => {
  it("GET /billing превежда Discord статуса по документацията", async () => {
    prismaMock.server.findMany
      .mockResolvedValueOnce([{ id: "g1", name: "G", plan: "premium", discordEntitlementId: "e1", discordSkuId: "sku_prem", discordSubscriptionId: "s1", discordSubscriptionStatus: 2, discordCurrentPeriodEnd: new Date(), premiumSince: new Date() }])
      .mockResolvedValueOnce([]);
    prismaMock.agency.findMany.mockResolvedValue([]);
    prismaMock.server.count.mockResolvedValue(0);
    const r = await request(app).get("/api/admin/billing");
    expect(r.status).toBe(200);
    expect(r.body.discord[0].statusLabel).toBe("ending");
    expect(r.body.config.provider).toBe("discord");
  });

  it("POST /billing/reconcile вика бота с тайната и одитира; 502 при паднал бот", async () => {
    axiosMock.mockResolvedValueOnce({ data: { ok: true, fetched: 3, granted: 1, revoked: 0 } });
    let r = await request(app).post("/api/admin/billing/reconcile");
    expect(r.status).toBe(200); expect(r.body.granted).toBe(1);
    expect(axiosMock).toHaveBeenCalledWith(expect.objectContaining({ url: "http://bot.test:3001/internal/entitlement-reconcile", headers: { "x-bot-secret": "bot-secret-test" } }));
    axiosMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    r = await request(app).post("/api/admin/billing/reconcile");
    expect(r.status).toBe(502);
  });
});

describe("DSR", () => {
  it("GET /dsr/:id връща само бройки; невалидно id → 400", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "123456", username: "x", globalRole: "USER", isBlacklisted: false, createdAt: new Date(), email: "a@b", mfaEnabledAt: null });
    prismaMock.ticket.count.mockResolvedValue(2);
    prismaMock.ticketMessage.count.mockResolvedValue(9);
    prismaMock.application.count.mockResolvedValue(1);
    prismaMock.memberRoleSnapshot.count.mockResolvedValue(3);
    prismaMock.verificationAttempt.count.mockResolvedValue(0);
    prismaMock.serverMember.count.mockResolvedValue(4);
    prismaMock.session.count.mockResolvedValue(1);
    prismaMock.apiKey.count.mockResolvedValue(0);
    prismaMock.server.count.mockResolvedValue(0);
    let r = await request(app).get("/api/admin/dsr/123456");
    expect(r.status).toBe(200);
    expect(r.body.counts).toMatchObject({ tickets: 2, messages: 9, roleSnapshots: 3, memberships: 4 });
    expect(r.body.user.hasEmail).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain("a@b");
    r = await request(app).get("/api/admin/dsr/not-an-id");
    expect(r.status).toBe(400);
  });

  it("erase иска confirm:true, отказва staff и активни абонаменти, одитира с обхвата", async () => {
    let r = await request(app).post("/api/admin/dsr/123456/erase").send({ scope: "full" });
    expect(r.status).toBe(400);
    prismaMock.user.findUnique.mockResolvedValue({ id: "123456", globalRole: "SUPER_USER" });
    r = await request(app).post("/api/admin/dsr/123456/erase").send({ scope: "identity", confirm: true });
    expect(r.status).toBe(409); expect(r.body.code).toBe("STAFF_ACCOUNT");
    prismaMock.user.findUnique.mockResolvedValue({ id: "123456", globalRole: "USER" });
    prismaMock.server.count.mockResolvedValue(1); prismaMock.agency.count.mockResolvedValue(0);
    r = await request(app).post("/api/admin/dsr/123456/erase").send({ scope: "identity", confirm: true });
    expect(r.status).toBe(409); expect(r.body.code).toBe("ACTIVE_SUBSCRIPTIONS");
    prismaMock.server.count.mockResolvedValue(0);
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.session.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.apiKey.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.ticketMessage.updateMany.mockResolvedValue({ count: 9 });
    prismaMock.memberRoleSnapshot.deleteMany.mockResolvedValue({ count: 3 });
    prismaMock.verificationAttempt.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.serverMember.deleteMany.mockResolvedValue({ count: 4 });
    prismaMock.application.updateMany.mockResolvedValue({ count: 1 });
    r = await request(app).post("/api/admin/dsr/123456/erase").send({ scope: "full", confirm: true, note: "ticket #42" });
    expect(r.status).toBe(200);
    expect(r.body.counts).toMatchObject({ messageTags: 9, messageContent: 9, applicationAnswers: 1, roleSnapshots: 3 });
    // full: съдържанието на съобщенията се заменя
    expect(prismaMock.ticketMessage.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ content: "[erased]" }) }));
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "DSR_ERASED", metadata: expect.objectContaining({ scope: "full", via: "admin", note: "ticket #42" }) }) }));
  });

  it("identity обхватът НЕ пипа съдържанието", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.server.count.mockResolvedValue(0); prismaMock.agency.count.mockResolvedValue(0);
    prismaMock.ticketMessage.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.memberRoleSnapshot.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.verificationAttempt.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.serverMember.deleteMany.mockResolvedValue({ count: 0 });
    const r = await request(app).post("/api/admin/dsr/123456/erase").send({ scope: "identity", confirm: true });
    expect(r.status).toBe(200);
    expect(r.body.registered).toBe(false);
    const calls = prismaMock.ticketMessage.updateMany.mock.calls.map((c) => c[0].data);
    expect(calls.every((d) => !("content" in d))).toBe(true);
    expect(prismaMock.application.updateMany).not.toHaveBeenCalled();
  });
});
