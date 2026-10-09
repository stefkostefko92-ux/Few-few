// backend/src/__tests__/battleOps.test.js
// v53 — тренировката и битките върху базата (lib/game/battleOps.js) и трите
// маршрута за бота. Всяка надпревара е условен update в транзакция: двоен клик
// не плаща две нива, две атаки не минават покрай охлаждането. Срещу тормоз:
// охлаждане, дневен брой, същата двойка веднъж на час, щит след загуба,
// „не ме нападай“ (не веднага след собствена атака), награда с таван и нула
// срещу много по-слаб. Ред за защитник, който не играе, не се създава.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../middleware/auth.js", () => ({ requireBotSecret: (_req, _res, next) => next() }));
vi.mock("../lib/game/seasons.js", async (orig) => ({ ...(await orig()), getCurrentSeason: vi.fn(async () => null) }));

const B = await import("../lib/game/battles.js");
const ops = await import("../lib/game/battleOps.js");
const router = (await import("../routes/bot_companions.js")).default;

const app = express();
app.use(express.json());
app.use("/api/bot", router);

const SID = "222222222222222222";
const A = "333333333333333333"; // нападател
const D = "444444444444444444"; // защитник
const NOW = new Date("2026-10-09T12:00:00Z");
const minsAgo = (m) => new Date(NOW.getTime() - m * 60_000);

const owned = (o = {}) => ({ id: "own_a", serverId: SID, userId: A, companionId: "lime-blip", stage: 1, fed: 0, atkLevel: 0, defLevel: 0, spdLevel: 0, hpLevel: 0, wins: 0, losses: 0, ...o });
const progress = (userId, o = {}) => ({ id: `p_${userId}`, serverId: SID, userId, sparks: 100, activeCompanionId: userId === A ? "own_a" : "own_d", pvpOptOut: false, ...o });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.memberProgress.createMany.mockResolvedValue({ count: 0 });
  prismaMock.memberProgress.update.mockImplementation(async ({ where, data }) => ({ ...progress(where.serverId_userId.userId), ...(data.sparks ? { sparks: 100 + data.sparks.increment } : {}) }));
});

// ─── Тренировка ──────────────────────────────────────────────────────────────
describe("trainStat", () => {
  it("непозната статистика → INVALID_STAT, без база", async () => {
    expect(await ops.trainStat(SID, A, "own_a", "luck")).toEqual({ ok: false, code: "INVALID_STAT" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("чужд спътник → NOT_OWNED (търси по id + сървър + собственик)", async () => {
    prismaMock.memberCompanion.findFirst.mockResolvedValueOnce(null);
    expect(await ops.trainStat(SID, A, "own_x", "atk")).toMatchObject({ ok: false, code: "NOT_OWNED" });
    expect(prismaMock.memberCompanion.findFirst).toHaveBeenCalledWith({ where: { id: "own_x", serverId: SID, userId: A } });
  });

  it("таванът на формата → STAT_CAP; на финалната форма → STAT_MAXED; нищо не се плаща", async () => {
    prismaMock.memberCompanion.findFirst.mockResolvedValueOnce(owned({ atkLevel: 4 }));
    expect(await ops.trainStat(SID, A, "own_a", "atk")).toMatchObject({ ok: false, code: "STAT_CAP", cap: 4, stage: 1 });
    prismaMock.memberCompanion.findFirst.mockResolvedValueOnce(owned({ stage: 3, hpLevel: 10 }));
    expect(await ops.trainStat(SID, A, "own_a", "hp")).toMatchObject({ ok: false, code: "STAT_MAXED", cap: 10 });
    expect(prismaMock.memberProgress.updateMany).not.toHaveBeenCalled();
  });

  it("недостиг на искри → NOT_ENOUGH_SPARKS с цената; нивото не мърда", async () => {
    prismaMock.memberCompanion.findFirst.mockResolvedValueOnce(owned({ defLevel: 2 }));
    prismaMock.memberProgress.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce({ sparks: 15 });
    expect(await ops.trainStat(SID, A, "own_a", "def")).toEqual({ ok: false, code: "NOT_ENOUGH_SPARKS", sparks: 15, cost: 60 });
    expect(prismaMock.memberProgress.updateMany).toHaveBeenCalledWith({ where: { serverId: SID, userId: A, sparks: { gte: 60 } }, data: { sparks: { decrement: 60 } } });
    expect(prismaMock.memberCompanion.updateMany).not.toHaveBeenCalled();
  });

  it("успех: условно плащане + условно +1 по ВИДЯНОТО ниво; връща новия лист", async () => {
    prismaMock.memberCompanion.findFirst.mockResolvedValueOnce(owned({ spdLevel: 1 }));
    prismaMock.memberProgress.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.memberCompanion.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.memberCompanion.findUnique.mockResolvedValueOnce(owned({ spdLevel: 2 }));
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce({ sparks: 60 });
    const out = await ops.trainStat(SID, A, "own_a", "spd");
    expect(out).toMatchObject({ ok: true, stat: "spd", level: 2, cost: 40, sparksLeft: 60 });
    expect(out.sheet.stats.spd).toBe(24);
    expect(out.sheet.nextCost.spd).toBe(60);
    expect(prismaMock.memberCompanion.updateMany).toHaveBeenCalledWith({ where: { id: "own_a", serverId: SID, userId: A, spdLevel: 1 }, data: { spdLevel: { increment: 1 } } });
  });

  it("двоен клик: нивото вече е вдигнато → BUSY (транзакцията се отказва, искрите се връщат)", async () => {
    prismaMock.memberCompanion.findFirst.mockResolvedValueOnce(owned());
    prismaMock.memberProgress.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.memberCompanion.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await ops.trainStat(SID, A, "own_a", "atk")).toEqual({ ok: false, code: "BUSY" });
  });
});

// ─── Атака ───────────────────────────────────────────────────────────────────
/** Настройва „чиста“ битка: двамата играят, без охлаждания и щит. */
function arena({ atk = {}, def = {}, mine = {}, theirs = {}, recent = [], lost = null } = {}) {
  prismaMock.memberProgress.findUnique.mockImplementation(async ({ where }) => {
    const uid = where.serverId_userId.userId;
    return uid === A ? progress(A, atk) : progress(D, def);
  });
  prismaMock.memberCompanion.findFirst.mockImplementation(async ({ where }) => (
    where.userId === A ? owned(mine) : owned({ id: "own_d", userId: D, companionId: "lime-wobble", ...theirs })
  ));
  prismaMock.companionBattle.findMany.mockResolvedValue(recent);
  prismaMock.companionBattle.findFirst.mockResolvedValue(lost);
  prismaMock.companionBattle.create.mockImplementation(async ({ data }) => ({ id: "bt_1", ...data }));
  prismaMock.memberCompanion.update.mockResolvedValue({});
}
/** Зърно, с което нападателят печели / губи (детерминистично от симулатора). */
function seedWhere(a, d, want) {
  for (let s = 1; s < 10_000; s++) if (B.simulateBattle(a, d, s).winner === want) return s;
  throw new Error("няма такова зърно");
}
const lime = B.effectiveStats("lime-blip", 1, {});
const wobble = B.effectiveStats("lime-wobble", 1, {});

describe("attack — кой може", () => {
  it("себе си → SELF, без база", async () => {
    expect(await ops.attack(SID, A, A, { now: NOW })).toEqual({ ok: false, code: "SELF" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("защитник, който не играе → TARGET_NO_COMPANION и НЕ му се създава ред", async () => {
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce(null);
    expect(await ops.attack(SID, A, D, { now: NOW })).toEqual({ ok: false, code: "TARGET_NO_COMPANION" });
    expect(prismaMock.memberProgress.createMany).not.toHaveBeenCalled();
    expect(prismaMock.memberProgress.update).not.toHaveBeenCalled();
  });

  it("заключва двата реда в стабилен ред (по userId) — без deadlock при атака в двете посоки", async () => {
    arena();
    await ops.attack(SID, D, A, { now: NOW, seed: 1 });
    const locked = prismaMock.memberProgress.update.mock.calls.filter(([q]) => q.data.updatedAt).map(([q]) => q.where.serverId_userId.userId);
    expect(locked).toEqual([A, D].sort());
  });

  it.each([
    ["нападателят е с pvp off", { atk: { pvpOptOut: true } }, "PVP_OFF_SELF"],
    ["защитникът е с pvp off", { def: { pvpOptOut: true } }, "TARGET_PVP_OFF"],
    ["нападателят няма активен", { atk: { activeCompanionId: null } }, "NO_ACTIVE"],
    ["защитникът няма активен", { def: { activeCompanionId: null } }, "TARGET_NO_COMPANION"],
  ])("%s → %s, без битка", async (_, setup, code) => {
    arena(setup);
    expect(await ops.attack(SID, A, D, { now: NOW, seed: 1 })).toMatchObject({ ok: false, code });
    expect(prismaMock.companionBattle.create).not.toHaveBeenCalled();
  });

  it("активният id сочи към чужд/изтрит спътник → NO_ACTIVE (търси с userId)", async () => {
    arena();
    prismaMock.memberCompanion.findFirst.mockResolvedValueOnce(null);
    expect(await ops.attack(SID, A, D, { now: NOW, seed: 1 })).toMatchObject({ ok: false, code: "NO_ACTIVE" });
    expect(prismaMock.memberCompanion.findFirst).toHaveBeenCalledWith({ where: { id: "own_a", serverId: SID, userId: A } });
  });
});

describe("attack — охлаждания и лимити", () => {
  it("5 минути между твоите атаки → COOLDOWN с оставащото време", async () => {
    arena({ recent: [{ defenderId: "555555555555555555", createdAt: minsAgo(2), rewardSparks: 0 }] });
    const out = await ops.attack(SID, A, D, { now: NOW, seed: 1 });
    expect(out).toMatchObject({ ok: false, code: "COOLDOWN" });
    expect(out.retryInMs).toBe(3 * 60_000);
  });

  it("15 атаки за 24 ч → DAILY_LIMIT; отново, когато 15-ата излезе от прозореца", async () => {
    const recent = Array.from({ length: 15 }, (_, i) => ({ defenderId: `5555555555555555${String(i).padStart(2, "0")}`, createdAt: minsAgo(10 + i * 60), rewardSparks: 0 }));
    arena({ recent });
    const out = await ops.attack(SID, A, D, { now: NOW, seed: 1 });
    expect(out).toMatchObject({ ok: false, code: "DAILY_LIMIT", limit: 15 });
    expect(out.retryInMs).toBe(24 * 3_600_000 - (10 + 14 * 60) * 60_000);
  });

  it("същият противник — веднъж на час → PAIR_COOLDOWN", async () => {
    arena({ recent: [{ defenderId: D, createdAt: minsAgo(20), rewardSparks: 0 }] });
    const out = await ops.attack(SID, A, D, { now: NOW, seed: 1 });
    expect(out).toMatchObject({ ok: false, code: "PAIR_COOLDOWN" });
    expect(out.retryInMs).toBe(40 * 60_000);
  });

  it("защитник, загубил преди <30 мин → SHIELD (търси само загубени защити)", async () => {
    arena({ lost: { createdAt: minsAgo(10) } });
    const out = await ops.attack(SID, A, D, { now: NOW, seed: 1 });
    expect(out).toMatchObject({ ok: false, code: "SHIELD" });
    expect(out.retryInMs).toBe(20 * 60_000);
    expect(prismaMock.companionBattle.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { serverId: SID, defenderId: D, attackerWon: true, createdAt: { gt: minsAgo(30) } },
    }));
  });
});

describe("attack — битката и наградата", () => {
  it("победа над равен: записва зърното и снимката на статистиките, +1 победа / +1 загуба, 10 искри", async () => {
    arena();
    const seed = seedWhere(lime, wobble, "attacker");
    const out = await ops.attack(SID, A, D, { now: NOW, seed });
    expect(out).toMatchObject({ ok: true, winner: "attacker", seed, reward: { tier: "fair", sparks: B.WIN_SPARKS, capped: false }, sparksLeft: 100 + B.WIN_SPARKS, attacksLeft: 14 });
    expect(out.events.length).toBe(out.turns);
    expect(prismaMock.companionBattle.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      serverId: SID, attackerId: A, defenderId: D, attackerOwnedId: "own_a", defenderOwnedId: "own_d",
      attackerCompanionId: "lime-blip", defenderCompanionId: "lime-wobble",
      attackerStats: lime, defenderStats: wobble, attackerWon: true, seed, rewardSparks: B.WIN_SPARKS,
    }) });
    expect(prismaMock.memberCompanion.update).toHaveBeenCalledWith({ where: { id: "own_a" }, data: { wins: { increment: 1 } } });
    expect(prismaMock.memberCompanion.update).toHaveBeenCalledWith({ where: { id: "own_d" }, data: { losses: { increment: 1 } } });
    // повторението от записа дава същата битка
    expect(B.simulateBattle(lime, wobble, seed).events).toEqual(out.events);
  });

  it("загуба: нищо не се губи и нищо не се дава; рекордите — обратно", async () => {
    arena();
    const seed = seedWhere(lime, wobble, "defender");
    const out = await ops.attack(SID, A, D, { now: NOW, seed });
    expect(out).toMatchObject({ ok: true, winner: "defender", reward: { sparks: 0 }, sparksLeft: 100 });
    expect(prismaMock.memberProgress.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { sparks: expect.anything() } }));
    expect(prismaMock.memberCompanion.update).toHaveBeenCalledWith({ where: { id: "own_a" }, data: { losses: { increment: 1 } } });
    expect(prismaMock.memberCompanion.update).toHaveBeenCalledWith({ where: { id: "own_d" }, data: { wins: { increment: 1 } } });
  });

  it("победа над по-силен → 15; над много по-слаб → 0", async () => {
    const strong = B.effectiveStats("lime-wobble", 2, {});
    arena({ theirs: { stage: 2 } });
    let out = await ops.attack(SID, A, D, { now: NOW, seed: seedWhere(lime, strong, "attacker") });
    expect(out.reward).toMatchObject({ tier: "underdog", sparks: B.UNDERDOG_SPARKS });

    const trained = { atkLevel: 4, defLevel: 4, spdLevel: 4, hpLevel: 4 };
    arena({ mine: trained });
    out = await ops.attack(SID, A, D, { now: NOW, seed: seedWhere(B.effectiveStats("lime-blip", 1, B.levelsOf(trained)), wobble, "attacker") });
    expect(out.reward).toMatchObject({ tier: "easy", sparks: 0 });
  });

  it("дневният таван: след 5 победи с награда — победата се брои, искрите не", async () => {
    const recent = Array.from({ length: 5 }, (_, i) => ({ defenderId: `5555555555555555${String(i).padStart(2, "0")}`, createdAt: minsAgo(30 + i * 70), rewardSparks: 10 }));
    arena({ recent });
    const out = await ops.attack(SID, A, D, { now: NOW, seed: seedWhere(lime, wobble, "attacker") });
    expect(out.reward).toEqual({ tier: "fair", sparks: 0, capped: true });
    expect(prismaMock.companionBattle.create).toHaveBeenCalledWith({ data: expect.objectContaining({ rewardSparks: 0, attackerWon: true }) });
  });

  it("без подадено зърно — тегли се криптографски, в обхвата на Int", async () => {
    arena();
    const out = await ops.attack(SID, A, D, { now: NOW });
    expect(Number.isInteger(out.seed)).toBe(true);
    expect(out.seed).toBeGreaterThanOrEqual(0);
    expect(out.seed).toBeLessThan(2 ** 31);
  });
});

// ─── „Не ме нападай“ ─────────────────────────────────────────────────────────
describe("setPvp", () => {
  it("не булево → INVALID", async () => {
    expect(await ops.setPvp(SID, A, "off", { now: NOW })).toEqual({ ok: false, code: "INVALID" });
  });

  it("изключване до час след собствена атака → PVP_LOCKED; флагът не мърда", async () => {
    prismaMock.companionBattle.findFirst.mockResolvedValueOnce({ createdAt: minsAgo(15) });
    const out = await ops.setPvp(SID, A, false, { now: NOW });
    expect(out).toMatchObject({ ok: false, code: "PVP_LOCKED", retryInMs: 45 * 60_000 });
    expect(prismaMock.memberProgress.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { pvpOptOut: true } }));
  });

  it("изключване без скорошна атака → pvpOptOut: true; включване не проверява нищо", async () => {
    prismaMock.companionBattle.findFirst.mockResolvedValueOnce(null);
    expect(await ops.setPvp(SID, A, false, { now: NOW })).toEqual({ ok: true, enabled: false });
    expect(prismaMock.memberProgress.update).toHaveBeenCalledWith({ where: { serverId_userId: { serverId: SID, userId: A } }, data: { pvpOptOut: true } });
    prismaMock.companionBattle.findFirst.mockClear();
    expect(await ops.setPvp(SID, A, true, { now: NOW })).toEqual({ ok: true, enabled: true });
    expect(prismaMock.companionBattle.findFirst).not.toHaveBeenCalled();
  });
});

// ─── Маршрутите ──────────────────────────────────────────────────────────────
describe("маршрутите за бота", () => {
  const settings = (o = {}) => ({ serverId: SID, enabled: true, battlesEnabled: true, ...o });

  it("битка: невалидни id → 400; изключени битки → 403 BATTLES_DISABLED; изключена игра → 403 GAME_DISABLED", async () => {
    expect((await request(app).post("/api/bot/game/battle").send({ serverId: SID, attackerId: A, defenderId: "x" })).status).toBe(400);
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce(settings({ battlesEnabled: false }));
    let r = await request(app).post("/api/bot/game/battle").send({ serverId: SID, attackerId: A, defenderId: D });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("BATTLES_DISABLED");
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce(settings({ enabled: false }));
    r = await request(app).post("/api/bot/game/battle").send({ serverId: SID, attackerId: A, defenderId: D });
    expect(r.body.code).toBe("GAME_DISABLED");
    expect(prismaMock.companionBattle.create).not.toHaveBeenCalled();
  });

  it("битка: зърното от заявката се ИГНОРИРА; успех → 201; охлаждане → 429", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings());
    arena();
    const r = await request(app).post("/api/bot/game/battle").send({ serverId: SID, attackerId: A, defenderId: D, seed: 7 });
    expect(r.status).toBe(201);
    expect(r.body.ok).toBe(true);
    // 7 би бил същият резултат само по случайност — проверяваме, че опцията не е стигнала до операцията
    expect(prismaMock.companionBattle.create.mock.calls[0][0].data.seed).not.toBe(7);
    arena({ recent: [{ defenderId: D, createdAt: new Date(Date.now() - 60_000), rewardSparks: 0 }] });
    expect((await request(app).post("/api/bot/game/battle").send({ serverId: SID, attackerId: A, defenderId: D })).status).toBe(429);
  });

  it("тренировка: без stat → 400; недостиг → 402", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings());
    expect((await request(app).post(`/api/bot/game/companions/${SID}/${A}/train`).send({ ownedId: "own_a" })).status).toBe(400);
    prismaMock.memberCompanion.findFirst.mockResolvedValueOnce(owned());
    prismaMock.memberProgress.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce({ sparks: 3 });
    const r = await request(app).post(`/api/bot/game/companions/${SID}/${A}/train`).send({ ownedId: "own_a", stat: "atk" });
    expect(r.status).toBe(402);
    expect(r.body).toMatchObject({ code: "NOT_ENOUGH_SPARKS", cost: 20, sparks: 3 });
  });

  it("pvp: само булево; заключено → 409", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings());
    expect((await request(app).post(`/api/bot/game/pvp/${SID}/${A}`).send({ enabled: "no" })).status).toBe(400);
    prismaMock.companionBattle.findFirst.mockResolvedValueOnce({ createdAt: new Date(Date.now() - 60_000) });
    const r = await request(app).post(`/api/bot/game/pvp/${SID}/${A}`).send({ enabled: false });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("PVP_LOCKED");
  });
});
