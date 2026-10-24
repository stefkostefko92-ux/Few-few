// backend/src/__tests__/game.test.js
// v50 — Server Season, етап 1: кривата на нивата, дневната награда, XP
// награждаване с искри при ниво нагоре, еднократните награди по ключ,
// покупката в магазина като ЕДНА транзакция, лимитите по tier. Чистите
// функции се тестват без база; маршрутите — с prisma mock и supertest.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../services/botNotifier.js", () => ({ notifyBot: vi.fn().mockResolvedValue({ ok: true }), dmUser: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({
  requireBotSecret: (_req, _res, next) => next(),
  requireAuth: (_req, _res, next) => next(),
  loadUser: (req, _res, next) => { req.user = { id: "111111111111111111", globalRole: "USER" }; next(); },
  requireServerAdmin: (_req, _res, next) => next(),
}));
vi.mock("../lib/premium.js", async (orig) => {
  const real = await orig();
  return { ...real, getServerTier: vi.fn().mockResolvedValue({ plan: "free", isPremium: false, limits: real.BASE_LIMITS }) };
});
vi.mock("../lib/auditLog.js", () => ({ writeAudit: vi.fn() }));

const xp = await import("../lib/game/xp.js");
const botGameRouter = (await import("../routes/bot_game.js")).default;
const gameRouter = (await import("../routes/game.js")).default;
const premium = await import("../lib/premium.js");

const app = express();
app.use(express.json());
app.use("/api/bot", botGameRouter);
app.use("/api/game", gameRouter);

const SID = "222222222222222222";
const UID = "333333333333333333";
const settings = (o = {}) => ({ serverId: SID, enabled: true, xpPerMessage: 15, messageCooldownSec: 60, xpPerVoiceMinute: 5, announceChannelId: null, levelUpMessage: true, levelRoles: [], dailySparks: 50, ...o });
const progress = (o = {}) => ({ id: "mp1", serverId: SID, userId: UID, xp: 0, level: 0, seasonXp: 0, sparks: 0, streak: 0, lastDailyAt: null, messages: 0, voiceMinutes: 0, ...o });

beforeEach(() => { vi.clearAllMocks(); });

describe("кривата на нивата (MEE6/Arcane: 5n² + 50n + 100)", () => {
  it("познатите котви: ниво 1 = 100 XP, ниво 5 = 1 150, ниво 10 = 4 675, ниво 20 = 23 850", () => {
    expect(xp.xpToReachLevel(1)).toBe(100);
    expect(xp.xpToReachLevel(5)).toBe(1150);
    expect(xp.xpToReachLevel(10)).toBe(4675);
    expect(xp.xpToReachLevel(20)).toBe(23850);
  });
  it("levelFromXp е обратна на xpToReachLevel и не прескача при точната граница", () => {
    for (const l of [0, 1, 2, 7, 15, 40]) {
      expect(xp.levelFromXp(xp.xpToReachLevel(l))).toBe(l);
      expect(xp.levelFromXp(xp.xpToReachLevel(l) - 1)).toBe(Math.max(0, l - 1));
    }
    expect(xp.levelFromXp(-50)).toBe(0);
  });
  it("напредъкът в нивото е между 0 и 100 %", () => {
    const p = xp.levelProgress(150); // ниво 1 (100), 50 навътре от 155
    expect(p.level).toBe(1); expect(p.into).toBe(50); expect(p.need).toBe(155); expect(p.pct).toBe(32);
  });
  it("искрите при ниво нагоре растат до таван 250", () => {
    expect(xp.sparksForLevelUp(1)).toBe(10);
    expect(xp.sparksForLevelUp(25)).toBe(250);
    expect(xp.sparksForLevelUp(90)).toBe(250);
  });
});

describe("/daily — чисти правила", () => {
  const now = new Date("2026-09-18T12:00:00Z");
  it("първо вземане: серия 1, базови искри", () => {
    const d = xp.computeDaily({ lastDailyAt: null, streak: 0 }, 50, now);
    expect(d).toMatchObject({ ok: true, streak: 1, sparks: 50, doubled: false });
  });
  it("под 24 ч → отказ с оставащото време", () => {
    const d = xp.computeDaily({ lastDailyAt: new Date(now.getTime() - 3 * 3600_000), streak: 3 }, 50, now);
    expect(d.ok).toBe(false); expect(d.retryInMs).toBe(21 * 3600_000);
  });
  it("между 24 и 48 ч серията расте; от 7-ия ден наградата е двойна", () => {
    const d = xp.computeDaily({ lastDailyAt: new Date(now.getTime() - 30 * 3600_000), streak: 6 }, 50, now);
    expect(d).toMatchObject({ ok: true, streak: 7, sparks: 100, doubled: true });
  });
  it("над 48 ч серията се нулира на 1", () => {
    const d = xp.computeDaily({ lastDailyAt: new Date(now.getTime() - 49 * 3600_000), streak: 12 }, 50, now);
    expect(d).toMatchObject({ ok: true, streak: 1, sparks: 50 });
  });
});

describe("awardXp — атомарен increment, ниво с условен запис (без загубени XP)", () => {
  // update връща реда СЛЕД increment-а: стартово XP + инкремента.
  const incFrom = (startXp, level = 0) => async ({ data }) => progress({ xp: startXp + data.xp.increment, level });
  it("от 0 до 250 XP = ниво 1 (+10 искри); XP е increment, не абсолютна стойност", async () => {
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce(progress());
    prismaMock.memberProgress.update.mockImplementationOnce(incFrom(0));
    prismaMock.memberProgress.updateMany.mockResolvedValueOnce({ count: 1 });
    const r = await xp.awardXp(SID, UID, 250, { messages: 3, voiceMinutes: 2, touchMessageXp: true });
    expect(r).toMatchObject({ leveledUp: true, oldLevel: 0, level: 1, sparksAwarded: 10, xp: 250 });
    const data = prismaMock.memberProgress.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ xp: { increment: 250 }, seasonXp: { increment: 250 }, messages: { increment: 3 }, voiceMinutes: { increment: 2 } });
    expect(data.lastMessageXpAt).toBeInstanceOf(Date);
    expect(prismaMock.memberProgress.updateMany.mock.calls[0][0]).toEqual({ where: { serverId: SID, userId: UID, level: 0 }, data: { level: 1, sparks: { increment: 10 } } });
  });
  it("прескачане на две нива събира искрите за всяко", async () => {
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce(progress());
    prismaMock.memberProgress.update.mockImplementationOnce(incFrom(0));
    prismaMock.memberProgress.updateMany.mockResolvedValueOnce({ count: 1 });
    const r = await xp.awardXp(SID, UID, 400); // ниво 2 = 255
    expect(r.level).toBe(2); expect(r.sparksAwarded).toBe(10 + 20);
  });
  it("без ниво нагоре — никакъв запис на нивото/искрите", async () => {
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce(progress());
    prismaMock.memberProgress.update.mockImplementationOnce(incFrom(10));
    const r = await xp.awardXp(SID, UID, 5);
    expect(r).toMatchObject({ leveledUp: false, xp: 15, level: 0 });
    expect(prismaMock.memberProgress.updateMany).not.toHaveBeenCalled();
  });
  it("надпревара: друг запис вдигна нивото първи → четем наново и не плащаме искрите два пъти", async () => {
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce(progress());
    prismaMock.memberProgress.update.mockImplementationOnce(incFrom(90)); // 90+20 = 110 → ниво 1
    prismaMock.memberProgress.updateMany.mockResolvedValueOnce({ count: 0 }); // другият го вдигна
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce(progress({ xp: 110, level: 1 }));
    const r = await xp.awardXp(SID, UID, 20);
    expect(r).toMatchObject({ leveledUp: false, level: 1, xp: 110 });
    expect(prismaMock.memberProgress.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("grantXpOnce — веднъж по ключ, само при включена игра", () => {
  it("изключена игра → нищо", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce({ enabled: false });
    expect(await xp.grantXpOnce(SID, UID, "poll:1", 5)).toBeNull();
    expect(prismaMock.gameXpGrant.create).not.toHaveBeenCalled();
  });
  it("дублиран ключ (P2002) → нищо, без второ награждаване", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce({ enabled: true });
    prismaMock.gameXpGrant.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await xp.grantXpOnce(SID, UID, "poll:1", 5)).toBeNull();
    expect(prismaMock.memberProgress.createMany).not.toHaveBeenCalled();
  });
  it("нов ключ → награждава", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce({ enabled: true });
    prismaMock.gameXpGrant.create.mockResolvedValueOnce({});
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce(progress({ xp: 50 }));
    prismaMock.memberProgress.update.mockImplementationOnce(async ({ data }) => progress({ xp: 50 + data.xp.increment }));
    const r = await xp.grantXpOnce(SID, UID, "giveaway:9", 10);
    expect(r.xp).toBe(60);
  });
});

describe("SLA XP за staff", () => {
  it("без SLA на панела, при пробив, или когато затваря създателят → нищо", async () => {
    expect(await xp.awardTicketSlaXp({ id: "t", serverId: SID, creatorId: "9", panel: {} }, "8")).toBeNull();
    expect(await xp.awardTicketSlaXp({ id: "t", serverId: SID, creatorId: "9", panel: { slaResolutionMinutes: 60 }, slaBreachedAt: new Date() }, "8")).toBeNull();
    expect(await xp.awardTicketSlaXp({ id: "t", serverId: SID, creatorId: "8", panel: { slaResolutionMinutes: 60 } }, "8")).toBeNull();
    expect(prismaMock.gameXpGrant.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/bot/game/xp-batch", () => {
  it("смята XP от настройките и връща ролите за ниво при ниво нагоре", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings({ levelRoles: [{ level: 1, roleId: "444444444444444444" }, { level: 5, roleId: "555555555555555555" }], announceChannelId: "666666666666666666" }));
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce(progress({ xp: 90 }));
    prismaMock.memberProgress.update.mockImplementationOnce(async ({ data }) => progress({ xp: 90 + data.xp.increment }));
    prismaMock.memberProgress.updateMany.mockResolvedValueOnce({ count: 1 });
    const res = await request(app).post("/api/bot/game/xp-batch").send({ serverId: SID, entries: [{ userId: UID, messageXpEvents: 1, voiceMinutes: 0 }] });
    expect(res.status).toBe(200);
    expect(res.body.levelUps).toHaveLength(1);
    expect(res.body.levelUps[0]).toMatchObject({ level: 1, roleIds: ["444444444444444444"] });
    expect(res.body.announceChannelId).toBe("666666666666666666");
  });
  it("изключена игра → празен отговор, нищо не се пише", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings({ enabled: false }));
    const res = await request(app).post("/api/bot/game/xp-batch").send({ serverId: SID, entries: [{ userId: UID, messageXpEvents: 5 }] });
    expect(res.body).toEqual({ enabled: false, levelUps: [] });
    expect(prismaMock.memberProgress.createMany).not.toHaveBeenCalled();
  });
  it("невалиден snowflake → 400", async () => {
    const res = await request(app).post("/api/bot/game/xp-batch").send({ serverId: "abc", entries: [] });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/bot/game/shop/:serverId/buy — една транзакция", () => {
  const item = { id: "it1", serverId: SID, name: "VIP", priceSparks: 100, type: "ROLE", roleId: "777777777777777777", durationDays: 30, stock: null, enabled: true };
  it("недостатъчно искри → 402 и нищо не се вади", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings());
    prismaMock.shopItem.findFirst.mockResolvedValueOnce(item);
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce(progress({ sparks: 40 }));
    const res = await request(app).post(`/api/bot/game/shop/${SID}/buy`).send({ userId: UID, itemId: "it1" });
    expect(res.status).toBe(402); expect(res.body.code).toBe("NOT_ENOUGH_SPARKS");
    expect(prismaMock.shopPurchase.create).not.toHaveBeenCalled();
  });
  it("успех: условен decrement (sparks ≥ цена), покупка с expiresAt", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings());
    prismaMock.shopItem.findFirst.mockResolvedValueOnce(item);
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce(progress({ sparks: 150 }));
    prismaMock.memberProgress.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.shopPurchase.create.mockImplementationOnce(async ({ data }) => ({ id: "p1", ...data }));
    const res = await request(app).post(`/api/bot/game/shop/${SID}/buy`).send({ userId: UID, itemId: "it1" });
    expect(res.status).toBe(200);
    expect(res.body.sparksLeft).toBe(50);
    expect(res.body.purchase.expiresAt).toBeTruthy();
    const where = prismaMock.memberProgress.updateMany.mock.calls[0][0].where;
    expect(where.sparks).toEqual({ gte: 100 });
  });
  it("двоен клик: условният decrement връща 0 реда → 402, без покупка", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings());
    prismaMock.shopItem.findFirst.mockResolvedValueOnce(item);
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce(progress({ sparks: 150 }));
    prismaMock.memberProgress.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await request(app).post(`/api/bot/game/shop/${SID}/buy`).send({ userId: UID, itemId: "it1" });
    expect(res.status).toBe(402);
    expect(prismaMock.shopPurchase.create).not.toHaveBeenCalled();
  });
  it("изчерпана наличност → 409", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings());
    prismaMock.shopItem.findFirst.mockResolvedValueOnce({ ...item, stock: 2 });
    prismaMock.shopPurchase.count.mockResolvedValueOnce(2);
    const res = await request(app).post(`/api/bot/game/shop/${SID}/buy`).send({ userId: UID, itemId: "it1" });
    expect(res.status).toBe(409);
  });
});

describe("таблото: лимити по tier", () => {
  it("Free: шестата роля за ниво е 403 LIMIT_REACHED", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings());
    const levelRoles = [1, 2, 3, 4, 5, 6].map((l) => ({ level: l, roleId: "444444444444444444" }));
    const res = await request(app).put(`/api/game/${SID}/settings`).send({ levelRoles });
    expect(res.status).toBe(403); expect(res.body.code).toBe("LIMIT_REACHED"); expect(res.body.limit).toBe(premium.BASE_LIMITS.levelRoles);
  });
  it("дублирано ниво → 400", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings());
    const res = await request(app).put(`/api/game/${SID}/settings`).send({ levelRoles: [{ level: 5, roleId: "444444444444444444" }, { level: 5, roleId: "555555555555555555" }] });
    expect(res.status).toBe(400);
  });
  it("Free: шестият артикул в магазина е 403 (createWithinLimit)", async () => {
    prismaMock.shopItem.count.mockResolvedValueOnce(premium.BASE_LIMITS.shopItems);
    const res = await request(app).post(`/api/game/${SID}/shop`).send({ name: "x", priceSparks: 10, type: "ROLE", roleId: "444444444444444444" });
    expect(res.status).toBe(403); expect(res.body.code).toBe("LIMIT_REACHED");
  });
  it("ROLE артикул без roleId → 400", async () => {
    const res = await request(app).post(`/api/game/${SID}/shop`).send({ name: "x", priceSparks: 10, type: "ROLE" });
    expect(res.status).toBe(400);
  });
});

describe("premium.js носи лимитите и функциите на играта", () => {
  it("Free 5/5/1/1 · Premium 50/100/1000/3 и петте game.* функции", () => {
    expect(premium.BASE_LIMITS).toMatchObject({ shopItems: 5, levelRoles: 5, companionSlots: 1, activeQuests: 1 });
    expect(premium.PREMIUM_LIMITS).toMatchObject({ shopItems: 50, levelRoles: 100, companionSlots: 1000, activeQuests: 3 });
    for (const k of ["game.shop50", "game.levelRolesUnlimited", "game.companionsFull", "game.quests3", "game.kbTrivia"]) expect(premium.PREMIUM_FEATURES[k]).toBeTruthy();
  });
});

describe("профилът показва активния спътник с име и картинка (одит 19.09.2026)", () => {
  it("GET /api/bot/game/profile обогатява activeCompanion с name/imageUrl/rarityEmoji, не само вътрешния id", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings());
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce(progress({ xp: 150, level: 1, activeCompanionId: "mc1" }));
    prismaMock.memberProgress.count.mockResolvedValue(0);
    prismaMock.memberCompanion.count.mockResolvedValueOnce(1);
    prismaMock.memberCompanion.findUnique.mockResolvedValueOnce({ id: "mc1", companionId: "lime-blip", stage: 2, nickname: null, fed: 120 });
    prismaMock.gameSeason.findMany.mockResolvedValue([]);
    const res = await request(app).get(`/api/bot/game/profile/${SID}/${UID}`);
    expect(res.status).toBe(200);
    expect(res.body.activeCompanion).toMatchObject({ companionId: "lime-blip", name: "Blip", stage: 2, rarityEmoji: "⚪" });
    expect(res.body.activeCompanion.imageUrl).toMatch(/lime-blip-2\.jpg$/);
  });
});


describe("регресии от одита 24.09.2026", () => {
  it("PATCH артикул в магазина работи (рафинираната схема нямаше .partial() → 500) и пази правилото ROLE ⇒ roleId", async () => {
    const item = { id: "it1", serverId: SID, name: "VIP", priceSparks: 100, type: "ROLE", roleId: "777777777777777777", durationDays: 30, stock: null, enabled: true, sortOrder: 0 };
    prismaMock.shopItem.findFirst.mockResolvedValue(item);
    prismaMock.shopItem.update.mockImplementationOnce(async ({ data }) => ({ ...item, ...data }));
    const ok = await request(app).patch(`/api/game/${SID}/shop/it1`).send({ priceSparks: 250 });
    expect(ok.status).toBe(200); expect(ok.body.priceSparks).toBe(250);
    expect(prismaMock.shopItem.update.mock.calls[0][0].data).toEqual({ priceSparks: 250 }); // без инжектирани подразбирания
    const bad = await request(app).patch(`/api/game/${SID}/shop/it1`).send({ roleId: null });
    expect(bad.status).toBe(400);
    expect(prismaMock.shopItem.update).toHaveBeenCalledTimes(1);
  });
  it("/daily при двоен клик: условният запис по lastDailyAt пуска само единия", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings());
    const last = new Date(Date.now() - 25 * 3600 * 1000);
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce(progress({ lastDailyAt: last, streak: 2, sparks: 10 }));
    prismaMock.memberProgress.updateMany.mockResolvedValueOnce({ count: 0 }); // другият клик вече записа
    const res = await request(app).post("/api/bot/game/daily").send({ serverId: SID, userId: UID });
    expect(res.status).toBe(429); expect(res.body.code).toBe("DAILY_COOLDOWN");
    expect(prismaMock.memberProgress.updateMany.mock.calls[0][0].where).toEqual({ id: "mp1", lastDailyAt: last });
  });
  it("покупката е Serializable; сериализационен конфликт (P2034) → 409 BUSY, не 500", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings());
    prismaMock.$transaction.mockRejectedValueOnce(Object.assign(new Error("conflict"), { code: "P2034" }));
    const res = await request(app).post(`/api/bot/game/shop/${SID}/buy`).send({ userId: UID, itemId: "it1" });
    expect(res.status).toBe(409); expect(res.body.code).toBe("BUSY");
  });
});
