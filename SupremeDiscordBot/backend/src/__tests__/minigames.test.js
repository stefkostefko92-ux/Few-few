// backend/src/__tests__/minigames.test.js
// v50 — Server Season, етап 3: правилата на куестовете (цел по играчи, ротация,
// разпределение на наградата), приносът и затварянето като надпревара,
// Counting като условен update (грешка = рестарт, същият човек, надпревара,
// етап на 100), trivia (банкът е валиден, KB въпрос, един отговор на човек,
// първият верен печели), и двата маршрута с валидация/премиум гейт.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
const notifyBot = vi.fn().mockResolvedValue({ ok: true });
vi.mock("../services/botNotifier.js", () => ({ notifyBot: (...a) => notifyBot(...a), dmUser: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({
  requireBotSecret: (_req, _res, next) => next(),
  requireAuth: (_req, _res, next) => next(),
  loadUser: (req, _res, next) => { req.user = { id: "111111111111111111", globalRole: "USER" }; next(); },
  requireServerAdmin: (_req, _res, next) => next(),
}));
const tier = { plan: "free", isPremium: false, limits: null };
vi.mock("../lib/premium.js", async (orig) => {
  const real = await orig();
  tier.limits = real.BASE_LIMITS;
  return { ...real, getServerTier: vi.fn(async () => tier) };
});
vi.mock("../lib/auditLog.js", () => ({ writeAudit: vi.fn() }));

const rules = await import("../lib/game/quests.js");
const ops = await import("../lib/game/questOps.js");
const counting = await import("../lib/game/counting.js");
const trivia = await import("../lib/game/trivia.js");
const { TRIVIA_BANK } = await import("../data/triviaBank.js");
const premium = await import("../lib/premium.js");
const botMinigamesRouter = (await import("../routes/bot_minigames.js")).default;
const gameRouter = (await import("../routes/game.js")).default;

const app = express();
app.use(express.json());
app.use("/api/bot", botMinigamesRouter);
app.use("/api/game", gameRouter);

const SID = "222222222222222222";
const UID = "333333333333333333";
const UID2 = "444444444444444444";
const settings = (o = {}) => ({ serverId: SID, enabled: true, questEnabled: true, questChannelId: "500000000000000001", countingChannelId: "500000000000000002", countingCurrent: 4, countingHigh: 10, countingLastUserId: UID2, triviaChannelId: null, triviaSchedule: null, ...o });

beforeEach(() => { vi.clearAllMocks(); tier.isPremium = false; tier.limits = premium.BASE_LIMITS; });

describe("правилата на куестовете (чисти)", () => {
  it("целта расте с играчите и е ограничена [min, max], закръглена хубаво", () => {
    expect(rules.targetFor("MESSAGES", 0)).toBe(300);
    expect(rules.targetFor("MESSAGES", 100)).toBe(4000);
    expect(rules.targetFor("MESSAGES", 10_000_000)).toBe(50_000);
    expect(rules.targetFor("POLL_VOTES", 7)).toBe(15);
    expect(() => rules.targetFor("NOPE", 1)).toThrow();
    expect(rules.niceRound(123)).toBe(120); expect(rules.niceRound(1234)).toBe(1250); expect(rules.niceRound(12_345)).toBe(12_500);
  });
  it("ротацията е детерминистична по седмица и не съдържа TICKETS_SLA", () => {
    // Седмиците са по epoch (четвъртък → сряда): 17.09 (чт) и 23.09 (ср) са една седмица, 24.09 (чт) — следващата.
    const a = rules.questTypeForWeek(new Date("2026-09-17T00:00:00Z"));
    expect(rules.questTypeForWeek(new Date("2026-09-23T23:59:00Z"))).toBe(a);
    expect(rules.questTypeForWeek(new Date("2026-09-24T00:00:00Z"))).not.toBe(a);
    expect(rules.questTypeForWeek(new Date("2026-09-17T00:00:00Z"))).toBe(a);
    expect(rules.ROTATION).not.toContain("TICKETS_SLA");
    for (const t of rules.ROTATION) expect(rules.QUEST_TYPES[t]).toBeTruthy();
  });
  it("лентата и разпределението: всеки принесъл взима наградата, топът ×2, нула приноси → нищо", () => {
    expect(rules.progressBar(50, 100, 10)).toBe("▰▰▰▰▰▱▱▱▱▱ 50 %");
    expect(rules.progressBar(500, 100, 10)).toMatch(/100 %$/);
    const r = rules.splitRewards([{ userId: UID, amount: 3 }, { userId: UID2, amount: 9 }, { userId: "5", amount: 0 }], 100);
    expect(r.topUserId).toBe(UID2);
    expect(r.rewards).toEqual([{ userId: UID2, sparks: 200, amount: 9 }, { userId: UID, sparks: 100, amount: 3 }]);
    expect(rules.splitRewards([], 100)).toEqual({ rewards: [], topUserId: null });
  });
});

describe("принос и завършване", () => {
  const quest = { id: "q1", serverId: SID, type: "MESSAGES", target: 10, progress: 0, rewardSparks: 100, status: "ACTIVE", startsAt: new Date(), endsAt: new Date(Date.now() + 86400000), channelId: "500000000000000001", messageId: "600000000000000001", rewardedAt: null };
  it("под целта → PROGRESS известие, нищо не се раздава", async () => {
    prismaMock.serverQuest.findMany.mockResolvedValueOnce([quest]);
    prismaMock.serverQuest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.serverQuest.findUnique.mockResolvedValueOnce({ ...quest, progress: 6 });
    const out = await ops.contribute(SID, "MESSAGES", [{ userId: UID, amount: 6 }, { userId: "bad", amount: 1 }]);
    expect(out.completed).toEqual([]); expect(out.updated[0]).toMatchObject({ id: "q1", progress: 6 });
    expect(prismaMock.questContribution.upsert).toHaveBeenCalledTimes(1);
    expect(notifyBot).toHaveBeenCalledWith("GAME_QUEST", expect.objectContaining({ event: "PROGRESS" }));
  });
  it("целта е стигната → само ЕДНА партида затваря (условен update) и раздава: топ ×2 + сандък със спътник", async () => {
    prismaMock.serverQuest.findMany.mockResolvedValueOnce([quest]);
    prismaMock.serverQuest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.serverQuest.findUnique.mockResolvedValueOnce({ ...quest, progress: 12 });
    prismaMock.questContribution.findMany.mockResolvedValueOnce([{ userId: UID2, amount: 8 }, { userId: UID, amount: 4 }]);
    prismaMock.memberCompanion.count.mockResolvedValueOnce(0);
    const out = await ops.contribute(SID, "MESSAGES", [{ userId: UID, amount: 4 }, { userId: UID2, amount: 8 }]);
    expect(out.completed).toHaveLength(1);
    const c = out.completed[0];
    expect(c.rewards.map((r) => r.sparks)).toEqual([200, 100]);
    expect(c.chest).toMatchObject({ userId: UID2, sparks: 200 });
    expect(["common", "uncommon"]).toContain(c.chest.companion.rarity); // Free: без rare+
    expect(prismaMock.memberProgress.createMany).toHaveBeenCalledTimes(2); // ensureProgress, без надпревара (P2002)
    expect(prismaMock.memberCompanion.create).toHaveBeenCalledTimes(1);
    expect(notifyBot).toHaveBeenCalledWith("GAME_QUEST", expect.objectContaining({ event: "COMPLETED" }));
  });
  it("надпревара: условният update връща 0 → другата партида не раздава втори път", async () => {
    prismaMock.serverQuest.findMany.mockResolvedValueOnce([quest]);
    prismaMock.serverQuest.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prismaMock.serverQuest.findUnique.mockResolvedValueOnce({ ...quest, progress: 12 });
    const out = await ops.contribute(SID, "MESSAGES", [{ userId: UID, amount: 4 }]);
    expect(out.completed).toEqual([]);
    expect(prismaMock.questContribution.findMany).not.toHaveBeenCalled();
    expect(prismaMock.memberProgress.createMany).not.toHaveBeenCalled();
  });
  it("пълна колекция → сандъкът е без спътник; rewardedAt вече зададен → нищо повторно", async () => {
    prismaMock.serverQuest.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.questContribution.findMany.mockResolvedValueOnce([{ userId: UID, amount: 8 }]);
    prismaMock.memberCompanion.count.mockResolvedValueOnce(premium.BASE_LIMITS.companionSlots);
    const r = await ops.rewardQuest(quest);
    expect(r.chest).toMatchObject({ userId: UID, companion: null });
    expect(prismaMock.memberCompanion.create).not.toHaveBeenCalled();
    prismaMock.serverQuest.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await ops.rewardQuest(quest)).toMatchObject({ alreadyRewarded: true, rewards: [] });
  });
  it("седмичният куест: само при включени куестове и без жив куест; целта по играчите", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce(settings({ questEnabled: false }));
    expect((await ops.ensureWeeklyQuest(SID)).code).toBe("QUESTS_DISABLED");
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce(settings());
    prismaMock.serverQuest.count.mockResolvedValueOnce(1);
    expect((await ops.ensureWeeklyQuest(SID)).code).toBe("QUEST_ACTIVE");
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce(settings());
    prismaMock.serverQuest.count.mockResolvedValueOnce(0);
    prismaMock.memberProgress.count.mockResolvedValueOnce(50);
    prismaMock.serverQuest.create.mockImplementationOnce(async ({ data }) => ({ id: "q2", progress: 0, messageId: null, ...data }));
    const now = new Date("2026-09-21T00:00:00Z");
    const out = await ops.ensureWeeklyQuest(SID, now);
    expect(out.created).toBe(true);
    expect(out.quest.type).toBe(rules.questTypeForWeek(now));
    expect(out.quest.target).toBe(rules.targetFor(out.quest.type, 50));
    expect(out.quest.endsAt.getTime() - now.getTime()).toBe(rules.QUEST_DURATION_MS);
    expect(notifyBot).toHaveBeenCalledWith("GAME_QUEST", expect.objectContaining({ event: "STARTED" }));
  });
  it("изтичане: под целта → FAILED; над целта (незатворен) → COMPLETED с награди", async () => {
    prismaMock.serverQuest.findMany.mockResolvedValueOnce([{ ...quest, progress: 3 }, { ...quest, id: "q3", progress: 10 }]);
    prismaMock.serverQuest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.questContribution.findMany.mockResolvedValueOnce([]);
    const r = await ops.expireQuests();
    expect(r).toEqual({ failed: 1, completed: 1 });
    expect(notifyBot).toHaveBeenCalledWith("GAME_QUEST", expect.objectContaining({ event: "FAILED" }));
  });
});

describe("Counting", () => {
  it("парсер: само цяло положително число", () => {
    expect([" 12 ", "0", "-1", "5!", "five", "1e3", "3.0", "", "1000000000"].map(counting.parseCount)).toEqual([12, null, null, null, null, null, null, null, null]);
  });
  it("грешно число → рестарт (условен по видяното) и WRONG_NUMBER; същият човек → SAME_USER", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce(settings());
    prismaMock.gameSettings.updateMany.mockResolvedValueOnce({ count: 1 });
    const w = await counting.applyCount(SID, UID, 7);
    expect(w).toMatchObject({ ok: false, code: "WRONG_NUMBER", expected: 5, reached: 4, high: 10 });
    expect(prismaMock.gameSettings.updateMany).toHaveBeenCalledWith({ where: { serverId: SID, countingCurrent: 4 }, data: { countingCurrent: 0, countingLastUserId: null } });
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce(settings());
    prismaMock.gameSettings.updateMany.mockResolvedValueOnce({ count: 1 });
    expect((await counting.applyCount(SID, UID2, 5)).code).toBe("SAME_USER");
  });
  it("остаряла гледна точка: нулирането не хваща реда (друг вече е броил) → тихо RACE, без обвинение (одит 25.09.2026)", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce(settings()); // видяхме 4, а A вече записа 5
    prismaMock.gameSettings.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await counting.applyCount(SID, UID, 6)).toEqual({ ok: false, code: "RACE" });
  });
  it("вярно число → условен update (надпревара: 0 реда = RACE, без рестарт); рекорд; етап на 100 дава XP", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce(settings());
    prismaMock.gameSettings.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await counting.applyCount(SID, UID, 5)).code).toBe("RACE");
    expect(prismaMock.gameSettings.updateMany).toHaveBeenCalledTimes(1);
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce(settings({ countingCurrent: 10, countingHigh: 10 }));
    prismaMock.gameSettings.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    expect(await counting.applyCount(SID, UID, 11)).toMatchObject({ ok: true, number: 11, high: 11, record: true, milestone: false, xp: 0 });
    // 100: grantXpOnce → settings enabled, ключ counting:100, XP 15
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce(settings({ countingCurrent: 99, countingHigh: 300 })).mockResolvedValueOnce({ enabled: true });
    prismaMock.gameSettings.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce({ id: "mp", xp: 0, level: 0, sparks: 0 });
    prismaMock.memberProgress.update.mockResolvedValueOnce({ xp: 15, level: 0 });
    const m = await counting.applyCount(SID, UID, 100);
    expect(m).toMatchObject({ ok: true, milestone: true, xp: 15, record: false });
    expect(prismaMock.gameXpGrant.create).toHaveBeenCalledWith({ data: { serverId: SID, userId: UID, key: "counting:100", amount: 15 } });
  });
  it("без канал / изключена игра → COUNTING_DISABLED, нищо не се пипа", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce(settings({ countingChannelId: null }));
    expect((await counting.applyCount(SID, UID, 5)).code).toBe("COUNTING_DISABLED");
    expect(prismaMock.gameSettings.updateMany).not.toHaveBeenCalled();
  });
});

describe("trivia", () => {
  it("банкът: ≥50 въпроса, точно 4 опции, отговор в обхвата, уникални id/въпроси, без дубли в опциите", () => {
    expect(TRIVIA_BANK.length).toBeGreaterThanOrEqual(50);
    expect(new Set(TRIVIA_BANK.map((q) => q.id)).size).toBe(TRIVIA_BANK.length);
    expect(new Set(TRIVIA_BANK.map((q) => q.q)).size).toBe(TRIVIA_BANK.length);
    for (const q of TRIVIA_BANK) {
      expect(q.options, q.id).toHaveLength(4);
      expect(new Set(q.options).size, q.id).toBe(4);
      expect(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, q.id).toBe(true);
      expect(q.category).toBeTruthy();
    }
  });
  it("изборът от банка изключва скорошните; KB въпрос иска ≥4 статии и носи вярното заглавие", () => {
    const rest = TRIVIA_BANK.slice(1).map((q) => q.id);
    for (let i = 0; i < 20; i++) expect(trivia.pickBankQuestion(rest, Math.random).questionId).toBe(TRIVIA_BANK[0].id);
    expect(trivia.pickBankQuestion(TRIVIA_BANK.map((q) => q.id)).questionId).toBeTruthy(); // всичко изключено → пак дава
    const arts = ["Refunds", "Shipping", "Returns", "Warranty", "Contact"].map((title, i) => ({ id: `a${i}`, title, content: `**${title}** policy: details ${i}`, enabled: true }));
    expect(trivia.kbQuestion(arts.slice(0, 3))).toBeNull();
    const q = trivia.kbQuestion(arts, () => 0.3);
    expect(q.source).toBe("KB"); expect(q.options).toHaveLength(4);
    const target = arts.find((a) => `kb:${a.id}` === q.questionId);
    expect(q.options[q.answer]).toBe(target.title);
    expect(q.question).not.toContain("**"); // markdown е свален от откъса
  });
  it("нов кръг: отворен в канала → ROUND_OPEN; Free с KB → пада на банк; Premium с 4+ статии → KB", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings());
    prismaMock.triviaRound.findFirst.mockResolvedValueOnce({ id: "open" });
    expect((await trivia.createRound(SID, "1", { source: "BANK" })).code).toBe("ROUND_OPEN");
    prismaMock.triviaRound.findFirst.mockResolvedValue(null);
    prismaMock.triviaRound.findMany.mockResolvedValue([]);
    prismaMock.triviaRound.create.mockImplementation(async ({ data }) => ({ id: "r1", messageId: null, winnerId: null, closedAt: null, ...data }));
    const free = await trivia.createRound(SID, "1", { source: "KB" });
    expect(free.round.source).toBe("BANK");
    expect(prismaMock.kbArticle.findMany).not.toHaveBeenCalled();
    expect(free.round.answer).toBeUndefined(); // отговорът не излиза навън
    tier.isPremium = true;
    prismaMock.kbArticle.findMany.mockResolvedValueOnce(["A", "B", "C", "D"].map((t, i) => ({ id: `k${i}`, title: t, content: `about ${t}`, enabled: true })));
    const prem = await trivia.createRound(SID, "1", { source: "KB" });
    expect(prem.round.source).toBe("KB");
    expect(prem.round.expiresAt.getTime() - Date.now()).toBeGreaterThan(trivia.TRIVIA_TTL_MS - 5000);
  });
  it("изключена игра → отворен рунд не приема отговори и не плаща (червен екип 25.09.2026)", async () => {
    prismaMock.triviaRound.findUnique.mockResolvedValueOnce({ id: "r1", serverId: SID, options: ["a", "b"], answer: 1, expiresAt: new Date(Date.now() + 60000), closedAt: null });
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce({ serverId: SID, enabled: false });
    expect((await trivia.answerRound("r1", UID, 1)).code).toBe("GAME_DISABLED");
    expect(prismaMock.triviaAnswer.create).not.toHaveBeenCalled();
    expect(prismaMock.memberProgress.update).not.toHaveBeenCalled();
  });
  it("отговори: един на човек (P2002), грешен, първият верен печели (условен winnerId), вторият верен закъснява, затворен", async () => {
    const round = { id: "r1", serverId: SID, options: ["a", "b", "c", "d"], answer: 2, expiresAt: new Date(Date.now() + 60000), closedAt: null };
    prismaMock.triviaRound.findUnique.mockResolvedValue(round);
    prismaMock.gameSettings.findUnique.mockResolvedValue({ enabled: true }); // изрично, не наследено от предишен тест
    prismaMock.triviaAnswer.create.mockRejectedValueOnce({ code: "P2002" });
    expect((await trivia.answerRound("r1", UID, 2)).code).toBe("ALREADY_ANSWERED");
    prismaMock.triviaAnswer.create.mockResolvedValue({});
    expect(await trivia.answerRound("r1", UID, 1)).toMatchObject({ ok: true, correct: false, winner: false });
    expect((await trivia.answerRound("r1", UID, 9)).code).toBe("INVALID_OPTION");
    prismaMock.triviaRound.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce({ enabled: true });
    prismaMock.memberProgress.findUnique.mockResolvedValue({ id: "mp", xp: 0, level: 0, sparks: 0 });
    prismaMock.memberProgress.update.mockResolvedValue({ xp: 25, level: 0 });
    const win = await trivia.answerRound("r1", UID, 2);
    expect(win).toMatchObject({ ok: true, correct: true, winner: true, sparks: trivia.TRIVIA_SPARKS, xp: 25 });
    expect(prismaMock.triviaRound.updateMany.mock.calls[0][0].where).toEqual({ id: "r1", winnerId: null, closedAt: null });
    expect(prismaMock.gameXpGrant.create).toHaveBeenCalledWith({ data: expect.objectContaining({ key: "trivia:r1" }) });
    prismaMock.triviaRound.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await trivia.answerRound("r1", UID2, 2)).toMatchObject({ ok: true, correct: true, winner: false });
    prismaMock.triviaRound.findUnique.mockResolvedValueOnce({ ...round, closedAt: new Date() });
    expect((await trivia.answerRound("r1", UID2, 2)).code).toBe("ROUND_CLOSED");
  });
  it("насрочване: дневно е Premium (Free пада на седмично); изтеклите се затварят с известие", async () => {
    const day = 24 * 3600 * 1000;
    prismaMock.gameSettings.findMany.mockResolvedValueOnce([settings({ triviaChannelId: "1", triviaSchedule: "daily" })]);
    prismaMock.triviaRound.findFirst.mockResolvedValueOnce({ createdAt: new Date(Date.now() - 2 * day) });
    expect(await trivia.scheduleDue()).toBe(0); // Free: 2 дни < седмица
    tier.isPremium = true;
    prismaMock.gameSettings.findMany.mockResolvedValueOnce([settings({ triviaChannelId: "1", triviaSchedule: "daily" })]);
    prismaMock.triviaRound.findFirst.mockResolvedValueOnce({ createdAt: new Date(Date.now() - 2 * day) }).mockResolvedValueOnce(null);
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce(settings());
    prismaMock.triviaRound.findMany.mockResolvedValue([]);
    prismaMock.kbArticle.findMany.mockResolvedValue([]);
    prismaMock.triviaRound.create.mockImplementation(async ({ data }) => ({ id: "r9", ...data }));
    expect(await trivia.scheduleDue(new Date(), () => 0.9)).toBe(1);
    expect(notifyBot).toHaveBeenCalledWith("GAME_TRIVIA", expect.objectContaining({ event: "POST" }));
    prismaMock.triviaRound.findMany.mockResolvedValueOnce([{ id: "r1", serverId: SID, channelId: "1", messageId: "2", options: ["a", "b", "c", "d"], answer: 0, expiresAt: new Date(0) }]);
    prismaMock.triviaRound.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await trivia.closeExpiredRounds()).toBe(1);
    expect(notifyBot).toHaveBeenCalledWith("GAME_TRIVIA", expect.objectContaining({ event: "CLOSE", round: expect.objectContaining({ answer: 0 }) }));
  });
});

describe("маршрути", () => {
  it("POST /api/bot/game/counting — валидация 400; WRONG_NUMBER → 409 с очакваното число", async () => {
    expect((await request(app).post("/api/bot/game/counting").send({ serverId: SID, userId: UID, number: "5" })).status).toBe(400);
    prismaMock.gameSettings.findUnique.mockResolvedValueOnce(settings());
    prismaMock.gameSettings.updateMany.mockResolvedValueOnce({ count: 1 });
    const r = await request(app).post("/api/bot/game/counting").send({ serverId: SID, userId: UID, number: 9 });
    expect(r.status).toBe(409); expect(r.body).toMatchObject({ error: "WRONG_NUMBER", expected: 5 });
  });
  it("PUT /api/game/:id/settings — дневна trivia е Premium (403 за Free), седмична минава", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings());
    prismaMock.gameSettings.update.mockImplementation(async ({ data }) => ({ ...settings(), ...data }));
    const no = await request(app).put(`/api/game/${SID}/settings`).send({ triviaSchedule: "daily" });
    expect(no.status).toBe(403); expect(no.body.code).toBe("PREMIUM_REQUIRED");
    const ok = await request(app).put(`/api/game/${SID}/settings`).send({ triviaSchedule: "weekly" });
    expect(ok.status).toBe(200); expect(ok.body.triviaSchedule).toBe("weekly");
  });
  it("сървър, свален от Premium със запазено daily, пак може да записва настройките (одит 25.09.2026)", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings({ triviaSchedule: "daily" }));
    prismaMock.gameSettings.update.mockImplementation(async ({ data }) => ({ ...settings({ triviaSchedule: "daily" }), ...data }));
    const r = await request(app).put(`/api/game/${SID}/settings`).send({ triviaSchedule: "daily", xpPerMessage: 20 });
    expect(r.status).toBe(200); expect(r.body.xpPerMessage).toBe(20);
  });
  it("POST /api/game/:id/quests — лимит по tier (Free: 1) → 403 LIMIT_REACHED; валиден → 201", async () => {
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings());
    prismaMock.serverQuest.count.mockResolvedValueOnce(1);
    const full = await request(app).post(`/api/game/${SID}/quests`).send({ type: "MESSAGES", target: 500 });
    expect(full.status).toBe(403); expect(full.body).toMatchObject({ code: "LIMIT_REACHED", limit: 1 });
    prismaMock.serverQuest.count.mockResolvedValueOnce(0);
    prismaMock.serverQuest.create.mockImplementationOnce(async ({ data }) => ({ id: "q5", progress: 0, messageId: null, ...data }));
    const ok = await request(app).post(`/api/game/${SID}/quests`).send({ type: "TICKETS_SLA", target: 20, days: 3 });
    expect(ok.status).toBe(201); expect(ok.body).toMatchObject({ type: "TICKETS_SLA", target: 20, rewardSparks: 150, status: "ACTIVE" });
    expect((await request(app).post(`/api/game/${SID}/quests`).send({ type: "NOPE", target: 20 })).status).toBe(400);
  });
});

describe("мулти-тенант: id от бутон се сверява със сървъра (одит 24.09.2026)", () => {
  it("trivia отговор с чужд/липсващ serverId → 404 ROUND_NOT_FOUND, нищо не се записва", async () => {
    prismaMock.triviaRound.findUnique.mockResolvedValue({ serverId: "999999999999999999" });
    let r = await request(app).post("/api/bot/game/trivia/r1/answer").send({ userId: UID, option: 1, serverId: SID });
    expect(r.status).toBe(404); expect(r.body.error).toBe("ROUND_NOT_FOUND");
    r = await request(app).post("/api/bot/game/trivia/r1/answer").send({ userId: UID, option: 1 });
    expect(r.status).toBe(404);
    expect(prismaMock.triviaAnswer.create).not.toHaveBeenCalled();
  });
  it("улавяне на поява от друг сървър → 404 SPAWN_NOT_FOUND", async () => {
    const companionsRouter = (await import("../routes/bot_companions.js")).default;
    const a = express(); a.use(express.json()); a.use("/api/bot", companionsRouter);
    prismaMock.companionSpawn.findUnique.mockResolvedValue({ serverId: "999999999999999999" });
    const r = await request(a).post("/api/bot/game/spawn/sp1/catch").send({ userId: UID, serverId: SID });
    expect(r.status).toBe(404); expect(r.body.error).toBe("SPAWN_NOT_FOUND");
    expect(prismaMock.companionSpawn.updateMany).not.toHaveBeenCalled();
  });
});

describe("изключена игра спира и спътниците (одит 25.09.2026)", () => {
  it("хранене/размяна при изключена игра → 403 GAME_DISABLED, нищо не се пипа", async () => {
    const companionsRouter = (await import("../routes/bot_companions.js")).default;
    const a = express(); a.use(express.json()); a.use("/api/bot", companionsRouter);
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings({ enabled: false }));
    let r = await request(a).post(`/api/bot/game/companions/${SID}/${UID}/feed`).send({ ownedId: "own_1", sparks: 5 });
    expect(r.status).toBe(403); expect(r.body.code).toBe("GAME_DISABLED");
    r = await request(a).post("/api/bot/game/trade").send({ serverId: SID, fromUserId: UID, toUserId: UID2, fromOwnedId: "a", toOwnedId: "b" });
    expect(r.status).toBe(403);
    expect(prismaMock.memberProgress.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.companionTrade.create).not.toHaveBeenCalled();
  });
});

describe("ръчна поява /spawn — маршрутът", () => {
  it("изключена игра → 403 GAME_DISABLED; невалиден companionId → 400; нищо не се създава", async () => {
    const companionsRouter = (await import("../routes/bot_companions.js")).default;
    const a = express(); a.use(express.json()); a.use("/api/bot", companionsRouter);
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings({ enabled: false }));
    let r = await request(a).post("/api/bot/game/spawn/manual").send({ serverId: SID, channelId: SID });
    expect(r.status).toBe(403); expect(r.body.code).toBe("GAME_DISABLED");
    r = await request(a).post("/api/bot/game/spawn/manual").send({ serverId: SID, channelId: SID, companionId: "<script>" });
    expect(r.status).toBe(400);
    expect(prismaMock.companionSpawn.create).not.toHaveBeenCalled();
  });
  it("включена игра с изключени автоматични появи → ръчната минава (201)", async () => {
    const companionsRouter = (await import("../routes/bot_companions.js")).default;
    const a = express(); a.use(express.json()); a.use("/api/bot", companionsRouter);
    prismaMock.gameSettings.findUnique.mockResolvedValue(settings({ enabled: true, spawnEnabled: false }));
    prismaMock.companionSpawn.findFirst.mockResolvedValue(null);
    prismaMock.companionSpawn.create.mockImplementation(async ({ data }) => ({ id: "sp9", ...data }));
    const r = await request(a).post("/api/bot/game/spawn/manual").send({ serverId: SID, channelId: SID, companionId: "lime-blip" });
    expect(r.status).toBe(201);
    expect(r.body.spawn.companionId).toBe("lime-blip");
    const auto = await request(a).post("/api/bot/game/spawn").send({ serverId: SID, channelId: SID });
    expect(auto.status).toBe(403); expect(auto.body.error).toBe("SPAWN_DISABLED");
  });
  it("списъкът за autocomplete: Free → само common/uncommon", async () => {
    const companionsRouter = (await import("../routes/bot_companions.js")).default;
    const a = express(); a.use(express.json()); a.use("/api/bot", companionsRouter);
    const r = await request(a).get(`/api/bot/game/companions/spawnable/${SID}`);
    expect(r.status).toBe(200);
    expect(r.body.companions.length).toBeGreaterThan(0);
    expect(r.body.companions.every((c) => ["common", "uncommon"].includes(c.rarity))).toBe(true);
  });
});
