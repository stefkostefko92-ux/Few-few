// backend/src/__tests__/adminManage.test.js
// v51 — CRUD разширението на админ конзолата. Гейтва: (1) гардовете — MFA на
// входа, step-up на всяка промяна, MAIN_OWNER на разрушителното; (2) играта —
// корекцията не пада под 0 и преизчислява нивото, спътник от друг сървър е 404,
// нулирането НЕ трие покупките (иначе временните роли остават завинаги);
// (3) тикет се трие само затворен; (4) white-label паузата спира токена;
// (5) черният списък със срок — изтекъл срок пуска човека навсякъде;
// (6) CSV експортът е без имейли и неутрализира формули.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.API_SECRET = "bot-secret-test";
process.env.BOT_API_URL = "http://bot.test:3001";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
const notifyBot = vi.fn().mockResolvedValue({ ok: true });
const notifyBotVerbose = vi.fn().mockResolvedValue({ ok: true, started: true });
vi.mock("../services/botNotifier.js", () => ({ notifyBot: (...a) => notifyBot(...a), notifyBotVerbose: (...a) => notifyBotVerbose(...a), dmUser: vi.fn() }));
vi.mock("../lib/auditLog.js", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));
const axiosGet = vi.fn();
vi.mock("axios", () => ({ default: { get: (...a) => axiosGet(...a) }, __esModule: true }));

let USER, SESSION;
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, _res, next) => { req.session = SESSION; next(); },
  loadUser: (req, _res, next) => { req.user = USER; next(); },
  requireSuperUser: (req, res, next) => (["MAIN_OWNER", "SUPER_USER"].includes(req.user?.globalRole) ? next() : res.status(403).json({ error: "no" })),
  requireMainOwner: (req, res, next) => (req.user?.globalRole === "MAIN_OWNER" ? next() : res.status(403).json({ error: "Main Owner access required" })),
}));

const { writeAudit } = await import("../lib/auditLog.js");
const router = (await import("../routes/adminManage.js")).default;
const { csvCell } = await import("../routes/adminManage.js");
const { isBlacklistActive } = await import("../lib/blacklist.js");
const app = express();
app.use(express.json());
app.use("/api/admin", router);

const SID = "222222222222222222";
const UID = "333333333333333333";
const fresh = () => ({ mfaVerifiedAt: Date.now() - 1000, mfaLastActivity: Date.now() });
const stale = () => ({ mfaVerifiedAt: Date.now() - 20 * 60 * 1000, mfaLastActivity: Date.now() });

beforeEach(() => {
  vi.clearAllMocks();
  USER = { id: "111111111111111111", username: "stefan", globalRole: "MAIN_OWNER", mfaEnabledAt: new Date() };
  SESSION = fresh();
  prismaMock.server.findUnique.mockResolvedValue({ id: SID, name: "Test server" });
});

describe("гардове", () => {
  it("без потвърден втори фактор → 403 MFA_REQUIRED дори на четене", async () => {
    SESSION = {};
    const r = await request(app).get(`/api/admin/game/servers/${SID}/members`);
    expect(r.status).toBe(403); expect(r.body.code).toBe("MFA_REQUIRED");
  });
  it("корекция с остаряло потвърждение → MFA_STEP_UP; нулиране от SUPER_USER → 403", async () => {
    SESSION = stale();
    let r = await request(app).patch(`/api/admin/game/servers/${SID}/members/${UID}`).send({ sparksDelta: 5, reason: "компенсация" });
    expect(r.status).toBe(403); expect(r.body.code).toBe("MFA_STEP_UP");
    SESSION = fresh(); USER.globalRole = "SUPER_USER";
    r = await request(app).post(`/api/admin/game/servers/${SID}/reset`).send({ scope: "all", confirm: true, reason: "тест" });
    expect(r.status).toBe(403);
    expect(prismaMock.memberProgress.deleteMany).not.toHaveBeenCalled();
  });
});

describe("играта по сървъри", () => {
  it("корекция: не пада под 0, нивото се извежда от XP, одит с преди/след", async () => {
    prismaMock.memberProgress.createMany.mockResolvedValue({ count: 0 });
    prismaMock.memberProgress.findUnique.mockResolvedValue({ xp: 150, seasonXp: 40, sparks: 10, level: 1 });
    // 1) атомарен increment (заключва реда) → базата връща новите стойности;
    // 2) изрязване под 0 + ниво върху заключения ред.
    prismaMock.memberProgress.update
      .mockResolvedValueOnce({ xp: -850, seasonXp: -960, sparks: 35, level: 1 })
      .mockImplementationOnce(async ({ data }) => ({ ...data }));
    const r = await request(app).patch(`/api/admin/game/servers/${SID}/members/${UID}`).send({ xpDelta: -1000, sparksDelta: 25, reason: "грешно XP" });
    expect(r.status).toBe(200);
    expect(prismaMock.memberProgress.update.mock.calls[0][0].data).toEqual({ xp: { increment: -1000 }, seasonXp: { increment: -1000 }, sparks: { increment: 25 } });
    const data = prismaMock.memberProgress.update.mock.calls[1][0].data;
    expect(data).toEqual({ xp: 0, seasonXp: 0, sparks: 35, level: 0 });
    expect(r.body.before).toEqual({ xp: 150, sparks: 10, level: 1 });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "GAME_MEMBER_ADJUSTED", targetId: UID, serverId: SID }));
  });
  it("корекция без причина или с дробно число → 400, нищо не се пише", async () => {
    let r = await request(app).patch(`/api/admin/game/servers/${SID}/members/${UID}`).send({ xpDelta: 5 });
    expect(r.status).toBe(400);
    r = await request(app).patch(`/api/admin/game/servers/${SID}/members/${UID}`).send({ xpDelta: 1.5, reason: "тест" });
    expect(r.status).toBe(400);
    expect(prismaMock.memberProgress.update).not.toHaveBeenCalled();
  });
  it("даване на спътник: непознат → 404; позволено надхвърля лимита и става активен", async () => {
    let r = await request(app).post(`/api/admin/game/servers/${SID}/members/${UID}/companions`).send({ companionId: "no-such", reason: "награда" });
    expect(r.status).toBe(404);
    prismaMock.memberProgress.createMany.mockResolvedValue({ count: 1 });
    prismaMock.memberProgress.findUnique.mockResolvedValue({ xp: 0 });
    prismaMock.memberCompanion.create.mockImplementation(async ({ data }) => ({ id: "own1", ...data }));
    prismaMock.memberProgress.updateMany.mockResolvedValue({ count: 1 });
    r = await request(app).post(`/api/admin/game/servers/${SID}/members/${UID}/companions`).send({ companionId: "lime-blip", stage: 3, reason: "награда от събитие" });
    expect(r.status).toBe(201);
    expect(prismaMock.memberCompanion.create.mock.calls[0][0].data).toMatchObject({ serverId: SID, userId: UID, companionId: "lime-blip", stage: 3 });
    expect(prismaMock.memberProgress.updateMany).toHaveBeenCalledWith({ where: { serverId: SID, userId: UID, activeCompanionId: null }, data: { activeCompanionId: "own1" } });
  });
  it("отнемане: притежание от ДРУГ сървър → 404, нищо не се трие", async () => {
    prismaMock.memberCompanion.findFirst.mockResolvedValue(null);
    const r = await request(app).delete(`/api/admin/game/servers/${SID}/companions/own_other`).send({ reason: "злоупотреба" });
    expect(r.status).toBe(404);
    expect(prismaMock.memberCompanion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "own_other", serverId: SID } }));
    expect(prismaMock.memberCompanion.delete).not.toHaveBeenCalled();
  });
  it("нулиране „all“: трие магазина и настройките, но НЕ покупките; ботът научава", async () => {
    for (const m of ["companionTrade", "companionSpawn", "memberCompanion", "gameXpGrant", "memberProgress", "triviaRound", "serverQuest", "shopItem", "gameSettings"]) {
      prismaMock[m].deleteMany.mockResolvedValue({ count: 2 });
    }
    const r = await request(app).post(`/api/admin/game/servers/${SID}/reset`).send({ scope: "all", confirm: true, reason: "нов старт" });
    expect(r.status).toBe(200);
    expect(r.body.counts).toMatchObject({ members: 2, shopItems: 2, settings: 2 });
    expect(prismaMock.shopPurchase.deleteMany).not.toHaveBeenCalled();
    expect(notifyBot).toHaveBeenCalledWith("GAME_SETTINGS_CHANGED", { serverId: SID });
  });
  it("нулиране „progress“ не пипа магазина; без confirm → 400", async () => {
    let r = await request(app).post(`/api/admin/game/servers/${SID}/reset`).send({ scope: "progress", reason: "тест" });
    expect(r.status).toBe(400);
    for (const m of ["companionTrade", "companionSpawn", "memberCompanion", "gameXpGrant", "memberProgress"]) prismaMock[m].deleteMany.mockResolvedValue({ count: 1 });
    r = await request(app).post(`/api/admin/game/servers/${SID}/reset`).send({ scope: "progress", confirm: true, reason: "тест" });
    expect(r.status).toBe(200);
    expect(prismaMock.shopItem.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.gameSettings.deleteMany).not.toHaveBeenCalled();
  });
  it("сезон: започнал → 409 STARTED; бъдещ → изтрит", async () => {
    prismaMock.gameSeason.findUnique.mockResolvedValueOnce({ code: "S1", startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 1e9) });
    let r = await request(app).delete("/api/admin/game/season/S1");
    expect(r.status).toBe(409); expect(r.body.code).toBe("STARTED");
    expect(prismaMock.gameSeason.delete).not.toHaveBeenCalled();
    prismaMock.gameSeason.findUnique.mockResolvedValueOnce({ code: "S9", name: "Бъдещ", startsAt: new Date(Date.now() + 1e9), endsAt: new Date(Date.now() + 2e9) });
    prismaMock.gameSeason.delete.mockResolvedValue({});
    r = await request(app).delete("/api/admin/game/season/S9");
    expect(r.status).toBe(200);
    expect(prismaMock.gameSeason.delete).toHaveBeenCalledWith({ where: { code: "S9" } });
  });
});

describe("поддръжка", () => {
  it("тикет се трие само затворен; без confirm → 400", async () => {
    let r = await request(app).delete("/api/admin/support/tickets/t1").send({ reason: "спам" });
    expect(r.status).toBe(400);
    prismaMock.ticket.findUnique.mockResolvedValueOnce({ id: "t1", serverId: SID, status: "OPEN" });
    r = await request(app).delete("/api/admin/support/tickets/t1?confirm=true").send({ reason: "спам" });
    expect(r.status).toBe(409); expect(r.body.code).toBe("TICKET_OPEN");
    prismaMock.ticket.findUnique.mockResolvedValueOnce({ id: "t1", serverId: SID, status: "CLOSED", number: 7, creatorId: UID });
    prismaMock.ticket.delete.mockResolvedValue({});
    r = await request(app).delete("/api/admin/support/tickets/t1?confirm=true").send({ reason: "спам" });
    expect(r.status).toBe(200);
    expect(prismaMock.ticket.delete).toHaveBeenCalledWith({ where: { id: "t1" } });
  });
  it("списъкът на тикетите не връща транскрипта, а само дали има", async () => {
    prismaMock.ticket.findMany.mockResolvedValue([{ id: "t1", archiveToken: "secret-token", status: "CLOSED" }]);
    prismaMock.ticket.count.mockResolvedValue(1);
    const r = await request(app).get("/api/admin/support/tickets?status=CLOSED");
    expect(r.status).toBe(200);
    expect(r.body.tickets[0]).toEqual({ id: "t1", status: "CLOSED", hasTranscript: true });
    const sel = prismaMock.ticket.findMany.mock.calls[0][0].select;
    expect(sel.archiveHtml).toBeUndefined();
  });
});

describe("white-label", () => {
  it("пауза записва customBotPausedAt и казва на бота; рестарт на спрян → 409", async () => {
    prismaMock.server.findUnique.mockResolvedValue({ id: SID, name: "X", customBotToken: "enc", customBotPausedAt: null });
    prismaMock.server.update.mockResolvedValue({});
    let r = await request(app).post(`/api/admin/fleet/${SID}/pause`);
    expect(r.status).toBe(200);
    expect(prismaMock.server.update.mock.calls[0][0].data.customBotPausedAt).toBeInstanceOf(Date);
    expect(notifyBotVerbose).toHaveBeenCalledWith("WHITELABEL_UPDATE", { serverId: SID });
    prismaMock.server.findUnique.mockResolvedValue({ id: SID, name: "X", customBotToken: "enc", customBotPausedAt: new Date() });
    r = await request(app).post(`/api/admin/fleet/${SID}/restart`);
    expect(r.status).toBe(409); expect(r.body.code).toBe("PAUSED");
  });
  it("непознато действие → 404; сървър без токен → 409 NO_TOKEN", async () => {
    let r = await request(app).post(`/api/admin/fleet/${SID}/explode`);
    expect(r.status).toBe(404);
    prismaMock.server.findUnique.mockResolvedValue({ id: SID, name: "X", customBotToken: null });
    r = await request(app).post(`/api/admin/fleet/${SID}/pause`);
    expect(r.status).toBe(409); expect(r.body.code).toBe("NO_TOKEN");
  });
  it("брандиране: аватар само по https; изтриване на токена иска MAIN_OWNER", async () => {
    prismaMock.server.findUnique.mockResolvedValue({ id: SID, name: "X", customBotToken: "enc", customBotPausedAt: null });
    let r = await request(app).patch(`/api/admin/fleet/${SID}/branding`).send({ avatarUrl: "http://evil.test/a.png" });
    expect(r.status).toBe(400);
    USER.globalRole = "SUPER_USER";
    r = await request(app).delete(`/api/admin/fleet/${SID}/token?confirm=true`).send({ reason: "злоупотреба" });
    expect(r.status).toBe(403);
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });
});

describe("потребители и достъп", () => {
  it("принудителен изход: трие и web, и OAuth сесиите; не и собствените", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: UID, globalRole: "USER" });
    prismaMock.$executeRaw.mockResolvedValueOnce(2);
    prismaMock.session.deleteMany.mockResolvedValue({ count: 1 });
    let r = await request(app).post(`/api/admin/users/${UID}/sessions/revoke`);
    expect(r.status).toBe(200); expect(r.body).toEqual({ ok: true, web: 2, oauth: 1 });
    r = await request(app).post(`/api/admin/users/${USER.id}/sessions/revoke`);
    expect(r.status).toBe(400); expect(r.body.code).toBe("SELF");
  });
  it("бележка: в одита отива дължината, не текстът", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: UID });
    prismaMock.user.update.mockResolvedValue({});
    const r = await request(app).patch(`/api/admin/users/${UID}/note`).send({ note: "  спорно плащане  " });
    expect(r.status).toBe(200); expect(r.body.adminNote).toBe("спорно плащане");
    const audit = writeAudit.mock.calls.find((c) => c[0].action === "USER_NOTE_UPDATED")[0];
    expect(audit.metadata).toEqual({ length: 14 });
  });
  it("черен списък със срок: изтекъл срок = пуснат; без срок = блокиран", () => {
    const now = new Date("2026-09-26T12:00:00Z");
    expect(isBlacklistActive({ isBlacklisted: true, blacklistedUntil: null }, now)).toBe(true);
    expect(isBlacklistActive({ isBlacklisted: true, blacklistedUntil: new Date("2026-09-27T00:00:00Z") }, now)).toBe(true);
    expect(isBlacklistActive({ isBlacklisted: true, blacklistedUntil: new Date("2026-09-25T00:00:00Z") }, now)).toBe(false);
    expect(isBlacklistActive({ isBlacklisted: false, blacklistedUntil: null }, now)).toBe(false);
    expect(isBlacklistActive(null, now)).toBe(false);
  });
  it("CSV експорт: без имейл колона, формулите са неутрализирани", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: UID, username: "=HYPERLINK(\"x\")", globalRole: "USER", language: "bg", isBlacklisted: false, blacklistedUntil: null, blacklistReason: null, mfaEnabledAt: null, createdAt: new Date("2026-01-01T00:00:00Z"), _count: { tickets: 1, applications: 0, serverMembers: 2 } }]);
    const r = await request(app).get("/api/admin/export/users.csv");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/csv/);
    expect(r.text).not.toMatch(/email/i);
    expect(r.text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("a,b")).toBe('"a,b"');
    const sel = prismaMock.user.findMany.mock.calls[0][0].select;
    expect(sel.email).toBeUndefined();
  });
});

describe("поддръжка — изтриване на панел/форма (ревю 26.09.2026)", () => {
  it("панел: MAIN_OWNER + причина + одит; SUPER_USER → 403", async () => {
    USER.globalRole = "SUPER_USER";
    let r = await request(app).delete("/api/admin/support/panels/p1?confirm=true").send({ reason: "дубликат" });
    expect(r.status).toBe(403);
    USER.globalRole = "MAIN_OWNER";
    prismaMock.panel.findUnique.mockResolvedValue({ id: "p1", serverId: SID, name: "Support", _count: { tickets: 3 } });
    prismaMock.panel.delete.mockResolvedValue({});
    r = await request(app).delete("/api/admin/support/panels/p1?confirm=true").send({ reason: "дубликат" });
    expect(r.status).toBe(200);
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "PANEL_DELETED_BY_ADMIN", serverId: SID, targetId: "p1" }));
  });
  it("форма с кандидатури без withApplications → 409, нищо не се трие", async () => {
    prismaMock.form.findUnique.mockResolvedValue({ id: "f1", serverId: SID, name: "Apply", _count: { applications: 2 } });
    const r = await request(app).delete("/api/admin/support/forms/f1?confirm=true").send({ reason: "стара" });
    expect(r.status).toBe(409); expect(r.body.code).toBe("FORM_HAS_APPLICATIONS");
    expect(prismaMock.form.delete).not.toHaveBeenCalled();
  });
});

