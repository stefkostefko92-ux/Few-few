// backend/src/__tests__/adminHardening.test.js
// Втвърдяване след одита на 3.4.0 (13–15.09.2026):
//   • IP allowlist за админ конзолата (двоично сравнение, IPv4-mapped, CIDR)
//   • известия към собственика (дросел, изключване, никога не хвърля)
//   • транскриптите при покой (seal/open + заварен открит текст + маркерите)
//   • нулиране на MFA от админ (MAIN_OWNER + step-up, не за себе си, сваля сесии)
//   • DSR: регенерация на транскриптите + reviewNote при full
//   • pending TOTP тайната в сесията е шифрирана
//   • bot DSR охлаждане (429)
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.API_SECRET = "bot-secret-test";
process.env.MAIN_OWNER_ID = "100000000000000001";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/redisClient.js", () => ({ getRedis: () => null }));
const dmUser = vi.fn(async () => ({ ok: true }));
vi.mock("../services/botNotifier.js", () => ({ dmUser: (...a) => dmUser(...a), notifyBot: vi.fn(), reconcileWhitelabel: vi.fn() }));
vi.mock("axios", () => ({ default: Object.assign(vi.fn(), { get: vi.fn() }), __esModule: true }));

let USER, SESSION;
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, _res, next) => { req.session = SESSION; next(); },
  loadUser: (req, _res, next) => { req.user = USER; next(); },
  requireSuperUser: (req, res, next) => (["MAIN_OWNER", "SUPER_USER"].includes(req.user?.globalRole) ? next() : res.status(403).json({ error: "no" })),
  requireMainOwner: (req, res, next) => (req.user?.globalRole === "MAIN_OWNER" ? next() : res.status(403).json({ error: "Main Owner access required" })),
  requireServerAdmin: (_req, _res, next) => next(),
  requireBotSecret: (_req, _res, next) => next(),
}));

const { ipAllowed, buildAllowlist, adminIpAllowlist } = await import("../middleware/adminIpAllowlist.js");
const { alertOwner, _resetAlertThrottle, ALERT_KINDS } = await import("../lib/securityAlerts.js");
const { sealTranscript, openTranscript } = await import("../lib/transcriptAtRest.js");
const { decrypt } = await import("../lib/crypto.js");
const { eraseDiscordUser } = await import("../lib/dsr.js");
const adminOps = (await import("../routes/adminOps.js")).default;
const mfaRouter = (await import("../routes/mfa.js")).default;
const botRouter = (await import("../routes/bot.js")).default;

const app = express();
app.use(express.json());
app.use("/api/admin", adminOps);
app.use("/api/auth/mfa", mfaRouter);
app.use("/api/bot", botRouter);

beforeEach(() => {
  vi.resetAllMocks();
  dmUser.mockResolvedValue({ ok: true });
  _resetAlertThrottle();
  delete process.env.ADMIN_IP_ALLOWLIST;
  delete process.env.SECURITY_ALERTS_DM;
  USER = { id: "100000000000000001", username: "stefan", globalRole: "MAIN_OWNER", mfaEnabledAt: new Date(), discriminator: "0" };
  SESSION = { mfaVerifiedAt: Date.now() - 1000, mfaLastActivity: Date.now(), regenerate: (cb) => cb(null), save: (cb) => cb && cb(null) };
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.auditLog.findMany.mockResolvedValue([]);
  prismaMock.auditLog.count.mockResolvedValue(0);
  prismaMock.auditLog.groupBy = vi.fn().mockResolvedValue([]);
  prismaMock.$queryRaw.mockResolvedValue([]);
  prismaMock.$executeRaw.mockResolvedValue(2);
  prismaMock.webhook.findMany.mockResolvedValue([]);
  prismaMock.webhook.count.mockResolvedValue(0);
});

describe("ADMIN_IP_ALLOWLIST", () => {
  it("празен = изключен; адрес, CIDR и IPv4-mapped IPv6 се сравняват двоично", () => {
    expect(ipAllowed("1.2.3.4")).toBe(true);
    process.env.ADMIN_IP_ALLOWLIST = "203.0.113.7, 198.51.100.0/24, 2001:db8::/32, junk";
    expect(buildAllowlist(process.env.ADMIN_IP_ALLOWLIST).entries).toBe(3);
    expect(ipAllowed("203.0.113.7")).toBe(true);
    expect(ipAllowed("::ffff:203.0.113.7")).toBe(true);
    expect(ipAllowed("198.51.100.200")).toBe(true);
    expect(ipAllowed("198.51.101.1")).toBe(false);
    expect(ipAllowed("2001:db8:1::1")).toBe(true);
    expect(ipAllowed("2001:db9::1")).toBe(false);
    expect(ipAllowed("not-an-ip")).toBe(false);
  });

  it("гардът връща 403 ADMIN_IP_BLOCKED, одитира и известява собственика", async () => {
    process.env.ADMIN_IP_ALLOWLIST = "203.0.113.7";
    const a = express(); a.use((req, _r, n) => { req.user = USER; n(); }); a.use(adminIpAllowlist); a.get("/x", (_q, r) => r.json({ ok: true }));
    const r = await request(a).get("/x");
    expect(r.status).toBe(403); expect(r.body.code).toBe("ADMIN_IP_BLOCKED");
    await new Promise((res) => setTimeout(res, 20));
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "SECURITY_ADMIN_IP_DENIED" }) }));
    expect(dmUser).toHaveBeenCalledWith("100000000000000001", expect.objectContaining({ title: expect.stringContaining("allowlist") }));
  });
});

describe("securityAlerts", () => {
  it("праща DM на MAIN_OWNER_ID, дроселира на вид, изключва се с SECURITY_ALERTS_DM=false", async () => {
    expect(await alertOwner(ALERT_KINDS.BRUTE_FORCE_BLOCK, "t", "d")).toBe(true);
    expect(await alertOwner(ALERT_KINDS.BRUTE_FORCE_BLOCK, "t", "d")).toBe(false);   // дросел
    expect(await alertOwner(ALERT_KINDS.MFA_DISABLED, "t", "d")).toBe(true);         // друг вид минава
    expect(dmUser).toHaveBeenCalledTimes(2);
    process.env.SECURITY_ALERTS_DM = "false";
    _resetAlertThrottle();
    expect(await alertOwner(ALERT_KINDS.BRUTE_FORCE_BLOCK, "t", "d")).toBe(false);
  });
  it("никога не хвърля при паднал бот", async () => {
    dmUser.mockRejectedValue(new Error("down"));
    await expect(alertOwner(ALERT_KINDS.DSR_FULL_ERASE, "t", "d")).resolves.toBe(true);
  });
});

describe("транскрипти при покой", () => {
  it("seal шифрира, open дешифрира; заварен открит текст минава; маркерите на ретенцията не се шифрират", () => {
    const html = "<html>Здравей, user#1234</html>";
    const sealed = sealTranscript(html);
    expect(sealed).not.toContain("Здравей");
    expect(decrypt(sealed)).toBe(html);
    expect(openTranscript(sealed)).toBe(html);
    expect(openTranscript(html)).toBe(html);
    const marker = "<!-- anonymized 2026-09-15 -->";
    expect(sealTranscript(marker)).toBe(marker);
    expect(sealTranscript(null)).toBeNull();
  });
});

describe("POST /users/:id/mfa/reset", () => {
  it("иска причина, не работи за себе си, чисти фактора, сваля сесиите, одитира и известява", async () => {
    let r = await request(app).post("/api/admin/users/100000000000000001/mfa/reset").send({ reason: "lost phone" });
    expect(r.status).toBe(400); expect(r.body.code).toBe("SELF_RESET");
    prismaMock.user.findUnique.mockResolvedValue({ id: "123456", username: "ana", globalRole: "SUPER_USER", mfaEnabledAt: new Date() });
    r = await request(app).post("/api/admin/users/123456/mfa/reset").send({});
    expect(r.status).toBe(400);
    prismaMock.user.update.mockResolvedValue({});
    r = await request(app).post("/api/admin/users/123456/mfa/reset").send({ reason: "verified by call" });
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ hadMfa: true, sessionsRevoked: 2 });
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { mfaSecret: null, mfaEnabledAt: null, mfaBackupCodes: null, mfaLastUsedStep: null } }));
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "MFA_RESET_BY_ADMIN", metadata: expect.objectContaining({ reason: "verified by call" }) }) }));
    await new Promise((res) => setTimeout(res, 10));
    expect(dmUser).toHaveBeenCalled();
  });
  it("SUPER_USER или остаряло потвърждение → 403", async () => {
    USER.globalRole = "SUPER_USER";
    let r = await request(app).post("/api/admin/users/123456/mfa/reset").send({ reason: "x-y-z" });
    expect(r.status).toBe(403);
    USER.globalRole = "MAIN_OWNER"; SESSION.mfaVerifiedAt = Date.now() - 20 * 60 * 1000;
    r = await request(app).post("/api/admin/users/123456/mfa/reset").send({ reason: "x-y-z" });
    expect(r.status).toBe(403); expect(r.body.code).toBe("MFA_STEP_UP");
  });
});

describe("DSR — транскрипти и reviewNote", () => {
  it("full: reviewNote → null; транскриптите на засегнатите тикети се регенерират шифрирани", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.server.count.mockResolvedValue(0); prismaMock.agency.count.mockResolvedValue(0);
    prismaMock.ticketMessage.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.memberRoleSnapshot.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.verificationAttempt.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.serverMember.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.application.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.ticketMessage.findMany.mockResolvedValue([{ ticketId: "t1" }]);
    prismaMock.ticket.findMany.mockResolvedValue([{ id: "t2" }]);
    prismaMock.ticket.findUnique.mockImplementation(async ({ where }) => ({
      id: where.id, number: 1, status: "CLOSED", archiveHtml: "<html>old</html>", createdAt: new Date(), closedAt: new Date(),
      messages: [{ authorTag: "[deleted-user-123456]", content: "[erased]", createdAt: new Date(), attachments: [] }],
      creator: { username: "[deleted-user-123456]" }, assignee: null, server: { name: "S", customBotName: null },
    }));
    prismaMock.ticket.update.mockResolvedValue({});
    const r = await eraseDiscordUser("123456", { scope: "full", via: "admin", requestedBy: "100000000000000001" });
    expect(r.ok).toBe(true);
    expect(r.counts.transcriptsRegenerated).toBe(2);
    expect(prismaMock.application.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reviewNote: null }) }));
    const written = prismaMock.ticket.update.mock.calls.map((c) => c[0].data.archiveHtml);
    expect(written).toHaveLength(2);
    for (const w of written) { expect(w).not.toContain("<html"); expect(decrypt(w)).toContain("<html"); }
  });
});

describe("MFA pending тайна", () => {
  it("в сесията стои шифротекст, не открит текст", async () => {
    USER.mfaEnabledAt = null;
    const r = await request(app).post("/api/auth/mfa/setup");
    expect(r.status).toBe(200);
    expect(SESSION.mfaPending.secret).not.toBe(r.body.secret);
    expect(decrypt(SESSION.mfaPending.secret)).toBe(r.body.secret);
  });
});

describe("bot DSR охлаждане", () => {
  it("второ изтриване в рамките на 5 min → 429 DSR_COOLDOWN", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.server.count.mockResolvedValue(0); prismaMock.agency.count.mockResolvedValue(0);
    prismaMock.ticketMessage.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.memberRoleSnapshot.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.verificationAttempt.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.serverMember.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.ticketMessage.findMany.mockResolvedValue([]); prismaMock.ticket.findMany.mockResolvedValue([]);
    let r = await request(app).post("/api/bot/dsr/erase").send({ userId: "424242424242", guildId: "g1" });
    expect(r.status).toBe(200);
    r = await request(app).post("/api/bot/dsr/erase").send({ userId: "424242424242", guildId: "g1" });
    expect(r.status).toBe(429); expect(r.body.code).toBe("DSR_COOLDOWN");
  });
});
