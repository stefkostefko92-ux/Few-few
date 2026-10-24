// backend/src/__tests__/adminConsoleFixes.test.js
// Регресии от одита на админ конзолата (26.09.2026):
//  • детайлът/ролята/черният списък НЕ връщат MFA тайната, резервните кодове и имейла;
//  • задържането на архивите: null = завинаги, 0 и дроби се отказват (0 триеше всичко);
//  • broadcast при провал на бота → 502 и НЯМА одит за неизпратено съобщение;
//  • списъците нормализират page/limit (page=abc беше 500);
//  • „Purge Old“ пази всяко действие, което конзолата записва.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../middleware/mfa.js", () => ({
  requireMfa: (_req, _res, next) => next(),
  requireFreshMfa: () => (_req, _res, next) => next(),
}));
vi.mock("../middleware/adminIpAllowlist.js", () => ({ adminIpAllowlist: (_req, _res, next) => next() }));
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_req, _res, next) => next(),
  loadUser: (req, _res, next) => { req.user = { id: "111111111111111111", username: "owner", globalRole: "MAIN_OWNER" }; next(); },
  requireSuperUser: (_req, _res, next) => next(),
  requireMainOwner: (_req, _res, next) => next(),
}));
const notifyBotVerbose = vi.fn();
vi.mock("../services/botNotifier.js", () => ({ notifyBot: vi.fn(), notifyBotVerbose: (...a) => notifyBotVerbose(...a) }));

const { default: adminRouter, ADMIN_USER_FIELDS, PRESERVED_AUDIT_ACTIONS } = await import("../routes/admin.js");
const app = express();
app.use(express.json());
app.use("/api/admin", adminRouter);
const ROUTES = join(dirname(fileURLToPath(import.meta.url)), "..", "routes");

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe("нула тайни за потребителя", () => {
  it("изричният списък на полетата не съдържа MFA тайна, кодове и имейл", () => {
    for (const k of ["mfaSecret", "mfaBackupCodes", "mfaLastUsedStep", "email"]) expect(ADMIN_USER_FIELDS[k], k).toBeUndefined();
  });
  it("детайлът и смяната на роля искат САМО тези полета (select, не include)", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "u1", serverMembers: [] });
    prismaMock.paymentLog.findMany.mockResolvedValue([]);
    await request(app).get("/api/admin/users/u1");
    const q = prismaMock.user.findUnique.mock.calls[0][0];
    expect(q.include).toBeUndefined();
    expect(q.select.mfaSecret).toBeUndefined();
    expect(q.select.tickets.select.archiveHtml).toBeUndefined();

    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "u2", globalRole: "USER" });
    prismaMock.user.update.mockResolvedValueOnce({ id: "u2" });
    await request(app).patch("/api/admin/users/u2/role?confirm=true").send({ role: "SUPPORT_STAFF" });
    expect(prismaMock.user.update.mock.calls[0][0].select).toBe(ADMIN_USER_FIELDS);
  });
  it("черен списък: причина + срок, сваля живите сесии; срок в миналото → 400", async () => {
    let r = await request(app).patch("/api/admin/users/u3/blacklist?confirm=true").send({ blacklisted: true, until: "2020-01-01T00:00:00Z" });
    expect(r.status).toBe(400);
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "u3", globalRole: "USER" });
    prismaMock.user.update.mockResolvedValueOnce({ id: "u3", isBlacklisted: true });
    prismaMock.$executeRaw.mockResolvedValueOnce(3);
    r = await request(app).patch("/api/admin/users/u3/blacklist?confirm=true").send({ blacklisted: true, reason: "спам", until: "2099-01-01T00:00:00Z" });
    expect(r.status).toBe(200);
    expect(r.body.sessionsRevoked).toBe(3);
    const data = prismaMock.user.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ isBlacklisted: true, blacklistReason: "спам" });
    expect(data.blacklistedUntil).toBeInstanceOf(Date);
  });
});

describe("задържане на архивите", () => {
  it("0, дроби и отрицателни → 400; null (завинаги) и 90 минават", async () => {
    for (const bad of [0, -5, 1.5, "30"]) {
      const r = await request(app).patch("/api/admin/servers/s1").send({ archiveRetentionDays: bad });
      expect(r.status, String(bad)).toBe(400);
    }
    expect(prismaMock.server.update).not.toHaveBeenCalled();
    prismaMock.server.update.mockResolvedValue({ id: "s1" });
    for (const ok of [null, 90]) {
      const r = await request(app).patch("/api/admin/servers/s1").send({ archiveRetentionDays: ok });
      expect(r.status, String(ok)).toBe(200);
    }
    expect(prismaMock.server.update.mock.calls[0][0].data.archiveRetentionDays).toBeNull();
  });
});

describe("broadcast", () => {
  it("ботът не е пратил → 502, без одит; успех → одит", async () => {
    notifyBotVerbose.mockResolvedValueOnce({ botError: "Channel not found or bot lacks access" });
    let r = await request(app).post("/api/admin/servers/s1/broadcast").send({ channelId: "c1", message: "hi" });
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/Channel not found/);
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    notifyBotVerbose.mockResolvedValueOnce({ ok: true });
    r = await request(app).post("/api/admin/servers/s1/broadcast").send({ channelId: "c1", message: "hi" });
    expect(r.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
  });
});

describe("списъци", () => {
  it("page=abc / limit=-5 → нормализирани (без 500)", async () => {
    prismaMock.server.findMany.mockResolvedValue([]);
    prismaMock.server.count.mockResolvedValue(0);
    const r = await request(app).get("/api/admin/servers?page=abc&limit=-5&query=abc");
    expect(r.status).toBe(200);
    const q = prismaMock.server.findMany.mock.calls[0][0];
    expect(q.skip).toBe(0); expect(q.take).toBe(1);
    expect(q.where.OR).toBeDefined();
  });
});

describe("Purge Old пази всичко, което конзолата записва", () => {
  it("всяко `action: \"X\"` в admin.js / adminOps.js / adminManage.js е в PRESERVED_AUDIT_ACTIONS", () => {
    const READ_ONLY_OR_EXTERNAL = new Set(["ABUSE_REPORT", "PREMIUM_GRANTED_DISCORD"]);
    const missing = [];
    for (const f of ["admin.js", "adminOps.js", "adminManage.js"]) {
      const src = readFileSync(join(ROUTES, f), "utf8");
      for (const m of src.matchAll(/action:\s*"([A-Z][A-Z_]+)"/g)) {
        if (!PRESERVED_AUDIT_ACTIONS.includes(m[1]) && !READ_ONLY_OR_EXTERNAL.has(m[1])) missing.push(`${f}: ${m[1]}`);
      }
    }
    for (const a of ["PAUSE", "RESUME", "RESTART"]) expect(PRESERVED_AUDIT_ACTIONS).toContain(`WHITELABEL_${a}_BY_ADMIN`);
    expect([...new Set(missing)]).toEqual([]);
  });
});
