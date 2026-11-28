// backend/src/__tests__/backupJobs.test.js
// Резервни копия — фоновите задачи, срокът след изтриване и личните данни (docs/BACKUP_SPEC.md).
//   Б4  автоматичните копия по плана (Free — седмично, Premium — всеки ден)
//   Б15 прекъснато възстановяване се събужда; след 5 опита се отказва честно
//   Б17 90 дни след махането на бота копията се трият; повторна покана спира броенето
//   Б18 чл. 15 и чл. 17
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.ENCRYPTION_KEY = "ab".repeat(32);
process.env.API_SECRET = "bot-secret-test";
const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/redisClient.js", () => ({ getRedis: () => null }));
vi.mock("../services/botNotifier.js", () => ({ dmUser: vi.fn(), notifyBot: vi.fn(), notifyBotVerbose: vi.fn(), reconcileWhitelabel: vi.fn() }));
vi.mock("axios", () => ({ default: Object.assign(vi.fn(), { get: vi.fn(), post: vi.fn() }), __esModule: true }));
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_req, _res, next) => next(),
  loadUser: (_req, _res, next) => next(),
  requireServerAdmin: (_req, _res, next) => next(),
  requireBotSecret: (_req, _res, next) => next(),
  requireSuperUser: (_req, _res, next) => next(),
  requireMainOwner: (_req, _res, next) => next(),
}));
const captureFromBot = vi.fn(), kickRestore = vi.fn();
vi.mock("../lib/backupBot.js", () => ({ captureFromBot: (...a) => captureFromBot(...a), preflightFromBot: vi.fn(), kickRestore: (...a) => kickRestore(...a) }));
const getServerTier = vi.fn();
vi.mock("../lib/premium.js", async (orig) => ({ ...(await orig()), getServerTier: (...a) => getServerTier(...a) }));

const { BASE_LIMITS, PREMIUM_LIMITS } = await import("../lib/premium.js");
const { autoBackupDue, markServerBackupsExpiring, clearServerBackupsExpiry, purgeExpiredBackups, BACKUP_KEEP_AFTER_REMOVAL_DAYS } = await import("../lib/backups.js");
const { runAutoBackups, runRestoreWatchdog } = await import("../jobs/backups.js");
const { eraseDiscordUser } = await import("../lib/dsr.js");
const botRouter = (await import("../routes/bot.js")).default;

const SID = "333333333333333333";
const ME = "111111111111111111";
const DAY = 24 * 60 * 60 * 1000;
const ID = (n) => String(500000000000000000n + BigInt(n));
const snap = () => ({
  v: 1, guild: { id: SID, name: "Т", ownerId: ME }, capturedAt: "2026-11-28T10:00:00.000Z", everyone: { permissions: "0" },
  roles: [{ id: ID(1), name: "r", color: 0, hoist: false, mentionable: false, permissions: "0", position: 1 }],
  categories: [], channels: [{ id: ID(2), type: 0, name: "c", parentId: null, position: 0, overwrites: [] }],
});

beforeEach(() => {
  vi.resetAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.user.findUnique.mockResolvedValue(null);
  prismaMock.serverBackup.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.serverBackup.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.serverBackup.findMany.mockResolvedValue([]);
  prismaMock.serverBackup.count.mockResolvedValue(0);
  prismaMock.serverBackup.create.mockImplementation(async ({ data }) => ({ id: "cbk", ...data }));
  prismaMock.backupRestore.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.backupRestore.findMany.mockResolvedValue([]);
  prismaMock.backupRestore.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.ticket.findMany.mockResolvedValue([]);
  captureFromBot.mockResolvedValue({ ok: true, snapshot: snap() });
  kickRestore.mockResolvedValue({ ok: true });
});

describe("Б4 автоматичните копия по плана", () => {
  it("кога е време", () => {
    const now = new Date("2026-11-28T12:00:00Z");
    expect(autoBackupDue({ lastAutoAt: null, everyDays: 7, now })).toBe(true);
    expect(autoBackupDue({ lastAutoAt: new Date(now - 6 * DAY), everyDays: 7, now })).toBe(false);
    expect(autoBackupDue({ lastAutoAt: new Date(now - 7 * DAY), everyDays: 7, now })).toBe(true);
    // час толеранс: дневното копие не бива да се изплъзва с минути и да чака цял ден
    expect(autoBackupDue({ lastAutoAt: new Date(now - DAY + 30 * 60 * 1000), everyDays: 1, now })).toBe(true);
  });
  it("задачата прави копие само на сървърите, за които е време, и само там, където е ботът", async () => {
    const now = new Date("2026-11-28T12:00:00Z");
    prismaMock.server.findMany.mockResolvedValueOnce([
      { id: SID, name: "A", ownerId: ME },
      { id: "444444444444444444", name: "B", ownerId: ME },
    ]).mockResolvedValue([]);
    getServerTier.mockImplementation(async (id) => (id === SID ? { plan: "free", limits: BASE_LIMITS } : { plan: "premium", limits: PREMIUM_LIMITS }));
    // A (Free) има автоматично от вчера → не е време; B (Premium) — от преди 2 дни → време е
    prismaMock.serverBackup.findFirst.mockImplementation(async ({ where }) => (where.serverId === SID ? { createdAt: new Date(now - DAY) } : { createdAt: new Date(now - 2 * DAY) }));
    const out = await runAutoBackups(now);
    const where = prismaMock.server.findMany.mock.calls[0][0].where;
    expect(where.botRemovedAt).toBeNull();
    expect(captureFromBot).toHaveBeenCalledTimes(1);
    expect(captureFromBot).toHaveBeenCalledWith("444444444444444444");
    expect(prismaMock.serverBackup.create.mock.calls[0][0].data).toMatchObject({ kind: "AUTO", serverId: "444444444444444444", createdBy: null });
    expect(out.created).toBe(1);
  });
  it("бот недостъпен за един сървър не спира останалите", async () => {
    const now = new Date();
    prismaMock.server.findMany.mockResolvedValueOnce([{ id: "1".repeat(18), ownerId: ME }, { id: "2".repeat(18), ownerId: ME }]).mockResolvedValue([]);
    getServerTier.mockResolvedValue({ plan: "free", limits: BASE_LIMITS });
    prismaMock.serverBackup.findFirst.mockResolvedValue(null);
    captureFromBot.mockResolvedValueOnce({ ok: false, error: "x" }).mockResolvedValue({ ok: true, snapshot: snap() });
    const out = await runAutoBackups(now);
    expect(out).toMatchObject({ created: 1, failed: 1 });
  });
});

describe("Б15 прекъснато възстановяване", () => {
  it("забравена задача се буди; след 5 опита — FAILED и сървърът се освобождава", async () => {
    const now = new Date("2026-11-28T12:00:00Z");
    prismaMock.backupRestore.findMany.mockResolvedValue([
      { id: "crA", status: "RUNNING", attempts: 2, heartbeatAt: new Date(now - 10 * 60 * 1000), targetServerId: SID },
      { id: "crB", status: "RUNNING", attempts: 5, heartbeatAt: new Date(now - 10 * 60 * 1000), targetServerId: SID },
    ]);
    const out = await runRestoreWatchdog(now);
    const q = prismaMock.backupRestore.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(q)).toContain("PENDING");
    expect(kickRestore).toHaveBeenCalledWith("crA");
    expect(kickRestore).not.toHaveBeenCalledWith("crB");
    const failed = prismaMock.backupRestore.updateMany.mock.calls.map(([x]) => x).find((x) => x.where.id === "crB");
    expect(failed.where.status).toEqual({ in: ["PENDING", "RUNNING"] });
    expect(failed.data).toMatchObject({ status: "FAILED", activeServerId: null });
    expect(out).toMatchObject({ kicked: 1, failed: 1 });
  });
});

describe("Б17 90 дни след махането на бота", () => {
  it("срокът е 90 дни", () => expect(BACKUP_KEEP_AFTER_REMOVAL_DAYS).toBe(90));
  it("махане слага срок само на копията без срок", async () => {
    const now = new Date("2026-11-28T12:00:00Z");
    await markServerBackupsExpiring(SID, now);
    const q = prismaMock.serverBackup.updateMany.mock.calls[0][0];
    expect(q.where).toEqual({ serverId: SID, expiresAt: null });
    expect(q.data.expiresAt.getTime()).toBe(now.getTime() + 90 * DAY);
  });
  it("повторна покана маха срока", async () => {
    await clearServerBackupsExpiry(SID);
    const q = prismaMock.serverBackup.updateMany.mock.calls[0][0];
    expect(q.where).toMatchObject({ serverId: SID });
    expect(q.data).toEqual({ expiresAt: null });
  });
  it("изтеклите се трият; старите приключили възстановявания също", async () => {
    const now = new Date("2026-11-28T12:00:00Z");
    await purgeExpiredBackups(now);
    expect(prismaMock.serverBackup.deleteMany.mock.calls[0][0].where).toEqual({ expiresAt: { lt: now } });
    const r = prismaMock.backupRestore.deleteMany.mock.calls[0][0].where;
    expect(r.status).toEqual({ in: ["DONE", "FAILED", "CANCELLED"] });
    expect(r.finishedAt.lt.getTime()).toBe(now.getTime() - 90 * DAY);
  });
  it("ботът е махнат (истинският маршрут) → копията получават срок", async () => {
    prismaMock.server.updateMany.mockResolvedValue({ count: 1 });
    const a = express(); a.use(express.json()); a.use("/api/bot", botRouter);
    const r = await request(a).delete(`/api/bot/server/${SID}`);
    expect(r.status).toBe(200);
    const q = prismaMock.serverBackup.updateMany.mock.calls.find(([x]) => x.where.serverId === SID)?.[0];
    expect(q?.where).toEqual({ serverId: SID, expiresAt: null });
    expect(q.data.expiresAt).toBeInstanceOf(Date);
  });
  it("повторна покана (истинският маршрут) → срокът пада", async () => {
    prismaMock.server.upsert.mockResolvedValue({ id: SID, name: "Т", ownerId: ME, botRemovedAt: null });
    prismaMock.server.findUnique.mockResolvedValue(null);
    const a = express(); a.use(express.json()); a.use("/api/bot", botRouter); a.use((e, _q, r, _n) => r.status(500).json({ error: e.message }));
    await request(a).post("/api/bot/server/register").send({ id: SID, name: "Т", icon: null, ownerId: ME });
    const q = prismaMock.serverBackup.updateMany.mock.calls.find(([x]) => x.where.serverId === SID)?.[0];
    expect(q?.data).toEqual({ expiresAt: null });
  });
});

describe("Б18 лични данни", () => {
  it("чл. 17: идентичността излиза от копията и възстановяванията, копието на общността остава", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.server.count.mockResolvedValue(0);
    prismaMock.agency.count.mockResolvedValue(0);
    prismaMock.shopPurchase.findMany.mockResolvedValue([]);
    prismaMock.giveaway.findMany.mockResolvedValue([]);
    prismaMock.ticketMessage.findMany.mockResolvedValue([]);
    const out = await eraseDiscordUser(ME, { scope: "identity", via: "admin" });
    expect(out.ok).toBe(true);
    const calls = (m, f) => prismaMock[m].updateMany.mock.calls.map(([x]) => x).filter((x) => x.where?.[f] === ME);
    expect(calls("serverBackup", "ownerId")[0]?.data).toEqual({ ownerId: null });
    expect(calls("serverBackup", "createdBy")[0]?.data).toEqual({ createdBy: null });
    expect(calls("backupRestore", "requestedBy")[0]?.data).toEqual({ requestedBy: null });
    expect(prismaMock.serverBackup.deleteMany).not.toHaveBeenCalled();
  });
  it("чл. 15: експортът съдържа направените от мен и тези, на които съм собственик (без съдържанието)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const gdpr = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "routes", "gdpr.js"), "utf8");
    const { CREATED_BY_MODELS } = await import("../routes/gdpr.js");
    const entry = CREATED_BY_MODELS.find(([m]) => m === "serverBackup");
    expect(entry?.[1]).toBe("createdBy");
    expect(entry?.[2].data).toBeUndefined();
    expect(gdpr).toMatch(/serverBackup\.findMany\(\{\s*where:\s*\{\s*ownerId:\s*userId\s*\}/);
    expect(gdpr).toMatch(/server_backups_owned/);
  });
});
